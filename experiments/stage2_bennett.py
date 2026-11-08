"""
M10: stage 2 with the honest Bennett oracle vs the compiled one.

    python -m experiments.stage2_bennett     # ~15 min; writes results/fig6_*, results/stage2_bennett.json

1. Cost of one oracle call: qubits and two-qubit gates (all-to-all, and on FakeTorino with routing),
   with the honest oracle split into its parts (walk, home check, phase flip).
2. Noiseless Grover with the honest oracle vs sin^2((2k+1)θ), N = 64.
3. FakeTorino noise, k = 0..3, honest vs compiled.
"""
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from qiskit import QuantumCircuit, QuantumRegister, transpile
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeTorino

from experiments import RESULTS
from quantum.stage1 import DEMO_MAP as G, theory_success
from quantum.stage2 import (DEMO_HOME, DEMO_STARTS, N_PLANS, _check_home, _walk2, bennett_plan_oracle,
                    compiled_plan_oracle, good_plans, plan_search_circuit)

SHOTS = 2000
device = FakeTorino()
noisy = AerSimulator.from_backend(device)
good = good_plans(G, DEMO_STARTS, DEMO_HOME)
M = len(good)


def two_q(qc, on_device):
    t = (transpile(qc, device, optimization_level=3, seed_transpiler=7) if on_device
         else transpile(qc, basis_gates=["cx", "u"], optimization_level=3))
    return sum(v for g, v in t.count_ops().items() if g in ("cx", "cz", "ecr"))


# --- 1. cost of one oracle call ------------------------------------------------
plan, pos, ok = QuantumRegister(6, "plan"), QuantumRegister(4, "pos"), QuantumRegister(2, "ok")
walk = QuantumCircuit(plan, pos); _walk2(walk, G, DEMO_STARTS[1], plan, pos)
check = QuantumCircuit(plan, pos, ok); _check_home(check, G, DEMO_STARTS[1], plan, pos, ok[0], DEMO_HOME)
cost = {
    "compiled oracle (6 qubits, not honest)": compiled_plan_oracle(G, DEMO_STARTS, DEMO_HOME),
    "Bennett oracle (12 qubits, honest)": bennett_plan_oracle(G, DEMO_STARTS, DEMO_HOME),
    "  one walk (pos ^= cell after 2 moves)": walk,
    "  one home check (flag ^= [end == home])": check,
}
print(f"{'one oracle call':44s} {'qubits':>6s} {'2q all-to-all':>14s} {'2q on Torino':>13s}")
cost_rows = {}
for name, qc in cost.items():
    a, d = two_q(qc, False), two_q(qc, True)
    cost_rows[name.strip()] = dict(qubits=qc.num_qubits, all_to_all=a, torino=d)
    print(f"{name:44s} {qc.num_qubits:6d} {a:14d} {d:13d}")
print("  (the Bennett oracle runs walk A 4x, walk B 2x, and each home check 2x)")

# --- 2. noiseless, honest oracle ---------------------------------------------------
ideal = []
for k in range(9):
    sv = Statevector(plan_search_circuit(G, DEMO_STARTS, DEMO_HOME, k, measure=False, honest=True))
    ideal.append(float(sum(sv.probabilities(qargs=range(6))[g] for g in good)))
print("\nnoiseless honest:", " ".join(f"k={k}:{p:.3f}" for k, p in enumerate(ideal)))

# --- 3. noise: honest vs compiled --------------------------------------------------
rows = []
for honest in (False, True):
    for k in range(4):
        qc = plan_search_circuit(G, DEMO_STARTS, DEMO_HOME, k, honest=honest)
        t = transpile(qc, device, optimization_level=3, seed_transpiler=7)
        counts = noisy.run(t, shots=SHOTS, seed_simulator=11).result().get_counts()
        p = sum(v for b, v in counts.items() if int(b, 2) in good) / SHOTS
        twoq = sum(v for g, v in t.count_ops().items() if g in ("cz", "cx", "ecr"))
        rows.append(dict(oracle="bennett" if honest else "compiled", k=k, measured=p, two_qubit_gates=twoq,
                         theory=theory_success(N_PLANS, M, k)))
        print(f"noisy {'bennett ' if honest else 'compiled'} k={k}  P={p:.3f}  2q={twoq}", flush=True)

json.dump(dict(cost=cost_rows, noiseless_honest=ideal, noisy=rows), open(RESULTS / "stage2_bennett.json", "w"), indent=1)

fig, ax = plt.subplots(figsize=(7, 4.2))
kk = [i / 20 for i in range(161)]
ax.plot(kk, [theory_success(N_PLANS, M, k) for k in kk], color="gray", lw=1, label="theory")
ax.plot(range(9), ideal, "o", color="#3a9d5d", label="honest oracle, noiseless (12 qubits)")
ax.axhline(M / N_PLANS, ls=":", color="gray", label="random guess (1/64)")
for name, col in [("compiled", "#c0392b"), ("bennett", "#7d3c98")]:
    r = [x for x in rows if x["oracle"] == name]
    ax.plot([x["k"] for x in r], [x["measured"] for x in r], "o-", color=col,
            label=f"{name}, FakeTorino (~{r[1]['two_qubit_gates']} 2q at k=1)")
ax.set(xlabel="Grover iterations k", ylabel="P(plan works from both starts)", ylim=(0, 1.05),
       title="Stage 2: honest Bennett oracle vs compiled")
ax.legend(frameon=False, fontsize=8)
fig.tight_layout(); fig.savefig(RESULTS / "fig6_stage2_bennett.png", dpi=160)
