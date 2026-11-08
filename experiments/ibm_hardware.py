"""
Run the project's Grover searches on a real IBM quantum computer (free Open Plan), once.

    python -m experiments.ibm_hardware rehearse      # whole pipeline locally on FakeTorino (no account)
    python -m experiments.ibm_hardware submit        # transpile + submit to the least-busy real backend
    python -m experiments.ibm_hardware fetch         # wait for the jobs, analyse, write results + figures

Needs a saved IBM Quantum account (QiskitRuntimeService.save_account(...)) for submit/fetch.

What is measured (about 55 circuits x 4,000 shots, a few minutes of QPU time):
  curve_*      success vs Grover iterations k = 0..4 for M = 1, 2, 4 (open room, compiled oracle)
  target_*     every one of the 16 cells as the single answer, k = 2
  honest_*     honest Bennett oracles: formula (k = 1..3) and lookup (k = 1)
  town_*       the tie-break story on the town map; ui_* the frontend's default scenario
  plan_*       stage 2: 64-plan search (compiled k = 0..3, honest Bennett k = 1)
  Job "plain" runs everything; job "suppressed" reruns the core curves with dynamical
  decoupling + gate/measurement twirling.

Every result is stored with its job ID, backend, calibration snapshot, qubit layout and gate counts,
plus a 95% Wilson interval and a z-score against random guessing.
"""
import json
import math
import sys
import time
from datetime import datetime, timezone

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.circuit.library import DiagonalGate
from qiskit.transpiler import generate_preset_pass_manager

from experiments import RESULTS
from experiments.precompute_ui import ui_map
from quantum.stage1 import DEMO_MAP, GridMap, diffuser, grover_circuit, theory_success
from quantum.stage2 import DEMO_HOME, DEMO_STARTS, N_PLANS, good_plans, plan_search_circuit

SHOTS = 4000
JOBS_FILE = RESULTS / "hardware_jobs.json"


# ----------------------------------------------------------------------------
# The experiment list: (name, group, circuit, marked set, N, notes)
# ----------------------------------------------------------------------------
def single_target(x, k, n=4):
    """Grover for one marked cell x (compiled oracle), to test every possible answer."""
    pos = QuantumRegister(n, "pos")
    qc = QuantumCircuit(pos, ClassicalRegister(n, "cell"))
    qc.h(pos)
    for _ in range(k):
        qc.append(DiagonalGate([-1 if i == x else 1 for i in range(2 ** n)]), pos)
        qc.compose(diffuser(n), pos, inplace=True)
    qc.measure(pos, qc.clbits)
    return qc


def experiments():
    room, town, ui = GridMap(), DEMO_MAP, ui_map()
    E = []

    def s1(name, group, gmap, start, moves, k, oracle):
        rd = gmap.sense_after(start, moves)
        marked = set(gmap.candidates(rd, moves))
        E.append(dict(name=name, group=group, N=16, M=len(marked), k=k, oracle=oracle, marked=sorted(marked),
                      circuit=grover_circuit(gmap, rd, moves, k=k, oracle=oracle)))

    for label, cell, kmax in [("M1", (0, 0), 4), ("M2", (0, 1), 3), ("M4", (1, 1), 2)]:
        for k in range(kmax + 1):
            s1(f"curve_{label}_k{k}", f"curve_{label}", room, room.index(*cell), "", k, "compiled")
    for x in range(16):
        E.append(dict(name=f"target_{x}", group="targets", N=16, M=1, k=2, oracle="compiled", marked=[x],
                      circuit=single_target(x, 2)))
    for k in (1, 2, 3):
        s1(f"honest_formula_k{k}", "honest_formula", room, 0, "", k, "formula")
    s1("honest_lookup_k1", "honest_lookup", room, 0, "", 1, "lookup")
    t0 = town.index(1, 0)
    s1("town_nomove_k2", "town", town, t0, "", 2, "compiled")
    s1("town_moveE_k2", "town", town, t0, "E", 2, "compiled")
    s1("town_moveE_k3", "town", town, t0, "E", 3, "compiled")
    s1("town_nomove_formula_k2", "town", town, t0, "", 2, "formula")
    s1("ui_B2_scan1_k2", "ui", ui, 5, "", 2, "compiled")

    def s2(name, group, gmap, starts, home, k, honest):
        good = good_plans(gmap, starts, home)
        E.append(dict(name=name, group=group, N=N_PLANS, M=len(good), k=k, oracle="bennett" if honest else "compiled",
                      marked=good, circuit=plan_search_circuit(gmap, starts, home, k, honest=honest)))

    for k in range(4):
        s2(f"plan_town_k{k}", "plan_town", town, DEMO_STARTS, DEMO_HOME, k, False)
    s2("plan_town_bennett_k1", "plan_town_bennett", town, DEMO_STARTS, DEMO_HOME, 1, True)
    for k in (1, 2):
        s2(f"plan_ui_k{k}", "plan_ui", ui, (4, 5), 9, k, False)
    return E


SUPPRESSED = lambda e: e["group"] in ("curve_M1", "honest_formula", "plan_town") and e["k"] > 0


# ----------------------------------------------------------------------------
# Statistics
# ----------------------------------------------------------------------------
def wilson(p, n, z=1.96):
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def analyse(e, counts):
    shots = sum(counts.values())
    hits = sum(v for b, v in counts.items() if int(b, 2) in set(e["marked"]))
    p, p0 = hits / shots, e["M"] / e["N"]
    lo, hi = wilson(p, shots)
    return dict(success=p, ci95=[lo, hi], shots=shots, random=p0,
                z_vs_random=(p - p0) / math.sqrt(p0 * (1 - p0) / shots),
                theory=theory_success(e["N"], e["M"], e["k"]),
                classical_same_queries=min(1.0, (e["k"] + 1) * e["M"] / e["N"]),  # check k items, then guess
                counts=counts)


# ----------------------------------------------------------------------------
# Backend helpers
# ----------------------------------------------------------------------------
def calibration(backend, used_qubits):
    """Median CZ/ECR error and readout error over the qubits we used, from the backend target."""
    out = {}
    try:
        tgt = backend.target
        twoq = next(g for g in ("cz", "ecr", "cx") if g in tgt.operation_names)
        e2 = [p.error for q, p in tgt[twoq].items() if p and p.error is not None and set(q) <= used_qubits]
        er = [tgt["measure"][(q,)].error for q in used_qubits if tgt["measure"][(q,)].error is not None]
        med = lambda xs: sorted(xs)[len(xs) // 2] if xs else None
        out = dict(two_qubit_gate=twoq, median_2q_error=med(e2), median_readout_error=med(er))
    except Exception as ex:  # calibration data is a bonus, never block the run on it
        out = dict(error=str(ex))
    return out


def transpile_all(E, backend):
    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=7)
    for e in E:
        t = pm.run(e["circuit"])
        e["isa"] = t
        ops = t.count_ops()
        e["two_qubit_gates"] = sum(v for g, v in ops.items() if g in ("cz", "cx", "ecr"))
        e["depth"] = t.depth()
        e["layout"] = list(t.layout.final_index_layout()) if t.layout else None
    return E


def run_sampler(backend, E, suppress):
    from qiskit_ibm_runtime import SamplerV2
    sampler = SamplerV2(mode=backend)
    sampler.options.default_shots = SHOTS
    if suppress:
        sampler.options.dynamical_decoupling.enable = True
        sampler.options.dynamical_decoupling.sequence_type = "XY4"
        sampler.options.twirling.enable_gates = True
        sampler.options.twirling.enable_measure = True
    return sampler.run([e["isa"] for e in E])


def creg_counts(pub_result):
    data = pub_result.data
    return getattr(data, "cell", None).get_counts() if hasattr(data, "cell") else data.moves.get_counts()


def collect(backend, E, plain_result, supp_result, job_ids, mode):
    used = set()
    for e in E:
        used |= set(e["layout"] or [])
    rows = []
    sup = [e for e in E if SUPPRESSED(e)]
    for e, r in zip(E, plain_result):
        rows.append(dict(name=e["name"], group=e["group"], N=e["N"], M=e["M"], k=e["k"], oracle=e["oracle"],
                         mode="plain", two_qubit_gates=e["two_qubit_gates"], depth=e["depth"], layout=e["layout"],
                         **analyse(e, creg_counts(r))))
    for e, r in zip(sup, supp_result):
        rows.append(dict(name=e["name"], group=e["group"], N=e["N"], M=e["M"], k=e["k"], oracle=e["oracle"],
                         mode="suppressed", two_qubit_gates=e["two_qubit_gates"], depth=e["depth"], layout=e["layout"],
                         **analyse(e, creg_counts(r))))
    return dict(backend=backend.name, mode=mode, shots=SHOTS, job_ids=job_ids,
                finished=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                calibration=calibration(backend, used), rows=rows)


def summary(res):
    print(f"\n{res['backend']} ({res['mode']}) · jobs {', '.join(res['job_ids'].values())}")
    print(f"{'circuit':26s} {'mode':10s} {'M/N':>6s} {'k':>2s} {'theory':>7s} {'measured':>9s} {'95% CI':>15s} {'random':>7s} {'z':>6s} {'2q':>5s}")
    for r in res["rows"]:
        lo, hi = r["ci95"]
        print(f"{r['name']:26s} {r['mode']:10s} {r['M']:>2d}/{r['N']:<3d} {r['k']:>2d} {r['theory']:7.3f} {r['success']:9.3f} "
              f"[{lo:.3f},{hi:.3f}] {r['random']:7.3f} {r['z_vs_random']:6.1f} {r['two_qubit_gates']:5d}")
    tg = [r["success"] for r in res["rows"] if r["group"] == "targets"]
    print(f"\nall 16 targets (k=2): mean {sum(tg) / len(tg):.3f}, min {min(tg):.3f}, max {max(tg):.3f}  (random 0.0625)")


def save(res, path):
    json.dump(res, open(path, "w"), indent=1)
    print(f"wrote {path}")


# ----------------------------------------------------------------------------
# Commands
# ----------------------------------------------------------------------------
def rehearse():
    """Same pipeline, locally, on the FakeTorino noise model (no account, no QPU time)."""
    from qiskit_ibm_runtime.fake_provider import FakeTorino
    backend = FakeTorino()
    E = transpile_all(experiments(), backend)
    print(f"{len(E)} circuits (+{sum(map(SUPPRESSED, E))} suppressed reruns) on {backend.name}, {SHOTS} shots each")
    plain = run_sampler(backend, E, False).result()
    supp = run_sampler(backend, [e for e in E if SUPPRESSED(e)], False).result()  # local mode: no DD/twirling
    res = collect(backend, E, plain, supp, {"plain": "local", "suppressed": "local"}, "rehearsal (FakeTorino, local)")
    summary(res)
    save(res, RESULTS / "hardware_rehearsal.json")
    from experiments.hardware_figures import figures
    figures(res, prefix="rehearsal_")


def submit():
    from qiskit_ibm_runtime import QiskitRuntimeService
    service = QiskitRuntimeService()
    backend = service.least_busy(operational=True, simulator=False, min_num_qubits=20)
    E = transpile_all(experiments(), backend)
    print(f"backend {backend.name}: {len(E)} circuits + {sum(map(SUPPRESSED, E))} suppressed reruns, {SHOTS} shots")
    plain = run_sampler(backend, E, False)
    supp = run_sampler(backend, [e for e in E if SUPPRESSED(e)], True)
    jobs = dict(backend=backend.name, submitted=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                job_ids={"plain": plain.job_id(), "suppressed": supp.job_id()})
    json.dump(jobs, open(JOBS_FILE, "w"), indent=1)
    print(f"submitted: {jobs['job_ids']}  ->  saved to {JOBS_FILE}\nrun `python -m experiments.ibm_hardware fetch` later")


def fetch():
    from qiskit_ibm_runtime import QiskitRuntimeService
    jobs = json.load(open(JOBS_FILE))
    service = QiskitRuntimeService()
    backend = service.backend(jobs["backend"])
    E = transpile_all(experiments(), backend)  # same seed -> same circuits as submitted
    res = {}
    for key, jid in jobs["job_ids"].items():
        job = service.job(jid)
        while job.status() not in ("DONE", "ERROR", "CANCELLED"):
            print(f"{key} job {jid}: {job.status()} … waiting", flush=True)
            time.sleep(60)
        if job.status() != "DONE":
            sys.exit(f"{key} job {jid} ended as {job.status()}")
        res[key] = job.result()
        try:
            res[key + "_usage"] = job.usage()
        except Exception:
            pass
    out = collect(backend, E, res["plain"], res["suppressed"], jobs["job_ids"], "IBM hardware")
    out["submitted"] = jobs["submitted"]
    out["qpu_seconds"] = {k: res.get(k + "_usage") for k in jobs["job_ids"]}
    summary(out)
    save(out, RESULTS / "hardware.json")
    from experiments.hardware_figures import figures
    figures(out, prefix="")


if __name__ == "__main__":
    {"rehearse": rehearse, "submit": submit, "fetch": fetch}[sys.argv[1] if len(sys.argv) > 1 else "rehearse"]()
