"""
Precompute everything the demo page shows, so the page itself is plain HTML/JS.

    python precompute_demo.py        # ~3-5 min; writes demo/data.js

For every start cell and every move sequence of length 0-2 on the town map:
  stage 1  ideal: exact statevector of Grover at the theory-best k
           noisy: FakeTorino, compiled oracle (4 qubits), k = min(best k, 2)  [M8: noise moves best k to 2]
           honest formula oracle: its 2-qubit gate count per call, and (first sense only)
           its noisy success, since with moves it grows to 12-16 qubits and is too slow to simulate
For every set of positions the robot could be in now:
  stage 2  Grover over 64 three-move plans to HOME, ideal and noisy (compiled oracle)

The ideal runs use the compiled oracles because they are exactly the same unitary as the
honest ones (tests/test_stage1.py proves it) and are much faster to simulate.
"""
import json
from functools import reduce
from itertools import product
from pathlib import Path

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeTorino

from formula_oracle import formula_oracle
from localize import DEMO_MAP as G, DIRS, best_k, compiled_oracle, diffuser, theory_success
from stage2 import N_PLANS, decode, good_plans, plan_search_circuit

HOME = G.index(1, 1)
MAX_MOVES = 2
SHOTS = 2000
NOISY_K_CAP = 2

device = FakeTorino()
noisy = AerSimulator.from_backend(device)


def two_q(t):
    return sum(v for g, v in t.count_ops().items() if g in ("cz", "cx", "ecr"))


def grover(make_oracle, readings, moves, k, measure):
    o = make_oracle(G, readings, moves)
    pos = QuantumRegister(4, "pos")
    regs = [pos] + ([QuantumRegister(o.num_qubits - 4, "walls")] if o.num_qubits > 4 else [])
    qc = QuantumCircuit(*regs)
    qc.h(pos)
    for _ in range(k):
        qc.compose(o, qc.qubits, inplace=True)
        qc.compose(diffuser(4), pos, inplace=True)
    if measure:
        qc.add_register(ClassicalRegister(4, "cell"))
        qc.measure(pos, qc.clbits)
    return qc


def noisy_probs(qc, n):
    t = transpile(qc, device, optimization_level=3, seed_transpiler=7)
    counts = noisy.run(t, shots=SHOTS, seed_simulator=11).result().get_counts()
    p = [0.0] * (2 ** n)
    for b, v in counts.items():
        p[int(b, 2)] = v / SHOTS
    return p, two_q(t)


def r3(xs):
    return [round(x, 3) for x in xs]


# ----------------------------------------------------------------------------
# Stage 1: where am I?
# ----------------------------------------------------------------------------
cache, stage1 = {}, {}
for start in range(16):
    for L in range(MAX_MOVES + 1):
        for mv in map("".join, product(DIRS, repeat=L)):
            readings = G.sense_after(start, mv)
            key = (mv, tuple(map(tuple, readings)))
            if key not in cache:
                cands = G.candidates(readings, mv)
                M, k = len(cands), best_k(16, len(cands))
                kn = min(k, NOISY_K_CAP)
                ideal = Statevector(grover(compiled_oracle, readings, mv, k, False)).probabilities(range(4))
                noisy_p, noisy_2q = noisy_probs(grover(compiled_oracle, readings, mv, kn, True), 4)
                f_2q = two_q(transpile(formula_oracle(G, readings, mv), device, optimization_level=1, seed_transpiler=7))
                entry = dict(candidates=cands, M=M, k=k, k_noisy=kn,
                             theory=round(theory_success(16, M, k), 4),
                             ideal=r3(ideal), noisy=r3(noisy_p), noisy_2q=noisy_2q,
                             honest_qubits=4 + 4 * len(readings), honest_2q_per_call=f_2q,
                             honest_noisy_success=None)
                if mv == "":
                    hp, _ = noisy_probs(grover(formula_oracle, readings, mv, kn, True), 4)
                    entry["honest_noisy_success"] = round(sum(hp[c] for c in cands), 3)
                cache[key] = entry
                print(f"stage 1  moves={mv or '-':2s} M={M} k={k}  noisy P={sum(noisy_p[c] for c in cands):.2f}")
            stage1[f"{start}|{mv}"] = {**cache[key], "readings": readings}

# ----------------------------------------------------------------------------
# Stage 2: how do I get home? (from every position the robot could be in NOW)
# ----------------------------------------------------------------------------
now_sets = set()
for key, e in cache.items():
    mv = key[0]
    now_sets.add(tuple(sorted({reduce(G.move, mv, s) for s in e["candidates"]})))

stage2 = {}
for starts in sorted(now_sets):
    good = good_plans(G, starts, HOME)
    M = len(good)
    entry = dict(starts=list(starts), good=[decode(p) for p in good], M=M)
    if M:
        k = best_k(N_PLANS, M)
        kn = min(k, NOISY_K_CAP)
        ideal = Statevector(plan_search_circuit(G, starts, HOME, k, measure=False)).probabilities()
        noisy_p, n2q = noisy_probs(plan_search_circuit(G, starts, HOME, kn), 6)
        top = lambda p: [[decode(i), round(p[i], 3)] for i in sorted(range(N_PLANS), key=lambda i: -p[i])[:5]]
        entry.update(k=k, k_noisy=kn, theory=round(theory_success(N_PLANS, M, k), 4),
                     ideal_success=round(sum(ideal[g] for g in good), 3), ideal_top=top(ideal),
                     noisy_success=round(sum(noisy_p[g] for g in good), 3), noisy_top=top(noisy_p),
                     noisy_2q=n2q)
    stage2[",".join(map(str, starts))] = entry
    print(f"stage 2  starts={starts} M={M}")

data = dict(
    map=dict(rows=G.rows, cols=G.cols, walls=[G.walls[G.cell(x)] for x in range(16)]),
    home=HOME, max_moves=MAX_MOVES, shots=SHOTS, device=device.name,
    stage1=stage1, stage2=stage2,
)
Path("demo").mkdir(exist_ok=True)
Path("demo/data.js").write_text("window.DEMO_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
print(f"\nwrote demo/data.js: {len(stage1)} stage-1 cases, {len(stage2)} stage-2 cases")
