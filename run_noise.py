"""
M8: what noise does. Every circuit is transpiled for FakeTorino (IBM Heron, 133 qubits,
native 2-qubit gate CZ) and run on AerSimulator.from_backend(FakeTorino()), which uses
that device's calibrated gate errors, readout errors and T1/T2.

    python run_noise.py          # ~2-3 min; writes fig6_noise_both_stages.png, results_noise.json

Compared:
  stage 1, corner robot (M = 1 of 16):  lookup (honest) vs formula (honest) vs compiled (not honest)
  stage 2, demo case    (M = 1 of 64):  compiled plan oracle
"""
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from qiskit import transpile
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeTorino

from formula_oracle import formula_oracle
from localize import GridMap, compiled_oracle, diffuser, oracle, theory_success
from stage2 import DEMO_HOME, DEMO_STARTS, N_PLANS, good_plans, plan_search_circuit
from localize import DEMO_MAP
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister

SHOTS = 4000
device = FakeTorino()
noisy = AerSimulator.from_backend(device)


def stage1_circuit(make_oracle, gmap, readings, k):
    """Same as localize.grover_circuit, but with any oracle builder plugged in."""
    o = make_oracle(gmap, readings)
    pos = QuantumRegister(4, "pos")
    regs = [pos] + ([QuantumRegister(o.num_qubits - 4, "walls")] if o.num_qubits > 4 else [])
    qc = QuantumCircuit(*regs, ClassicalRegister(4, "cell"))
    qc.h(pos)
    for _ in range(k):
        qc.compose(o, qc.qubits, inplace=True)
        qc.compose(diffuser(4), pos, inplace=True)
    qc.measure(pos, qc.clbits)
    return qc


def run_noisy(qc, marked):
    t = transpile(qc, device, optimization_level=3, seed_transpiler=7)
    counts = noisy.run(t, shots=SHOTS, seed_simulator=11).result().get_counts()
    hits = sum(v for b, v in counts.items() if int(b, 2) in marked)
    twoq = sum(v for g, v in t.count_ops().items() if g in ("cz", "cx", "ecr"))
    return hits / SHOTS, twoq, t.depth()


results = []      # one row per (series, k)

# --- stage 1: corner robot in the open room ------------------------------------
room = GridMap()
rd = room.sense_after(room.index(0, 0), "")
marked = set(room.candidates(rd, ""))
for name, make in [("stage 1 lookup", oracle), ("stage 1 formula", formula_oracle),
                   ("stage 1 compiled", compiled_oracle)]:
    for k in range(5):
        p, twoq, depth = run_noisy(stage1_circuit(make, room, rd, k), marked)
        results.append(dict(series=name, N=16, M=1, k=k, theory=theory_success(16, 1, k),
                            measured=p, two_qubit_gates=twoq, depth=depth))
        print(f"{name:18s} k={k}  theory={theory_success(16, 1, k):.3f}  noisy={p:.3f}  2q={twoq:5d}  depth={depth}")

# --- stage 2: demo plan search (6 qubits) --------------------------------------
good = set(good_plans(DEMO_MAP, DEMO_STARTS, DEMO_HOME))
for k in range(9):
    p, twoq, depth = run_noisy(plan_search_circuit(DEMO_MAP, DEMO_STARTS, DEMO_HOME, k), good)
    results.append(dict(series="stage 2 compiled", N=N_PLANS, M=1, k=k, theory=theory_success(N_PLANS, 1, k),
                        measured=p, two_qubit_gates=twoq, depth=depth))
    print(f"{'stage 2 compiled':18s} k={k}  theory={theory_success(N_PLANS, 1, k):.3f}  noisy={p:.3f}  2q={twoq:5d}  depth={depth}")

with open("results_noise.json", "w") as f:
    json.dump(dict(device=device.name, shots=SHOTS, rows=results), f, indent=1)

# --- figure: left = stage 1 three oracles, right = stage 2 ----------------------
fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
colors = {"stage 1 lookup": "#7d3c98", "stage 1 formula": "#2a7fb8", "stage 1 compiled": "#c0392b",
          "stage 2 compiled": "#c0392b"}
for ax, N, kmax, series in [(a1, 16, 4, ["stage 1 lookup", "stage 1 formula", "stage 1 compiled"]),
                            (a2, 64, 8, ["stage 2 compiled"])]:
    kk = [i / 20 for i in range(20 * kmax + 1)]
    ax.plot(kk, [theory_success(N, 1, k) for k in kk], color="gray", lw=1, label="theory (noiseless)")
    ax.axhline(1 / N, ls=":", color="gray", label=f"random guess (1/{N})")
    for s in series:
        rows = [r for r in results if r["series"] == s]
        per_iter = rows[1]["two_qubit_gates"]
        ax.plot([r["k"] for r in rows], [r["measured"] for r in rows], "o-", color=colors[s],
                label=f"{s.split(' ', 2)[2]} (~{per_iter} 2q gates/iter)")
    ax.set(xlabel="Grover iterations k", ylim=(0, 1.05))
    ax.legend(frameon=False, fontsize=8)
a1.set(ylabel="P(success)", title="Stage 1: where am I? (corner, M = 1 of 16)")
a2.set(title="Stage 2: how do I get home? (M = 1 of 64)")
fig.suptitle("With FakeTorino noise")
fig.tight_layout(); fig.savefig("fig6_noise_both_stages.png", dpi=160)
