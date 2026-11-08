"""
Precompute the Qiskit results the frontend shows, for the frontend's own building.

    python precompute_ui.py          # a few minutes (6 processes); writes frontend/js/qdata.js

The map is read straight from frontend/js/world.js (WALLS), so UI and Qiskit always agree.

Stage 1, for every start and every move chain the UI can take (it always moves by the
same best_move rule as frontend/js/story.js), keyed by moves + readings:
    ideal  exact statevector of Grover at the theory-best k
    noisy  FakeTorino (AerSimulator.from_backend), compiled oracle, k = min(best k, 2)   [M8]
    honest formula (Bennett) oracle: qubits, two-qubit gates per call, and for the first
           sense (no moves) its noisy success too; with moves it is 12-16 qubits, too slow to simulate
Stage 2, for every set of positions the robot could be in x every goal cell that has a
3-move plan working from all of them (goal = home, or a waypoint that collapses the uncertainty):
    ideal and noisy (compiled oracle), plus the honest Bennett oracle's qubits and gate count.

The ideal runs use the compiled oracles: they are exactly the same unitary as the honest ones
(tests/ prove it) and much faster to simulate.
"""
import json
import re
from functools import reduce
from itertools import product
from pathlib import Path

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeTorino

from formula_oracle import formula_oracle
from localize import DIRS, GridMap, best_k, compiled_oracle, diffuser, theory_success
from stage2 import N_PLANS, bennett_plan_oracle, decode, good_plans, plan_search_circuit

MAX_MOVES = 3
SHOTS = 2000
NOISY_K_CAP = 2


def ui_map() -> GridMap:
    src = Path("frontend/js/world.js").read_text()
    rows = re.findall(r'"([01]{4})"', re.search(r"const WALLS = \[(.*?)\]", src, re.S).group(1))
    g = GridMap()
    g.walls = {g.cell(x): [int(b) for b in rows[x]] for x in range(16)}
    return g


G = ui_map()
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


r3 = lambda xs: [round(x, 3) for x in xs]
key1 = lambda mv, readings: mv + "|" + "-".join("".join(map(str, r)) for r in readings)

# ----------------------------------------------------------------------------
# Stage 1
# ----------------------------------------------------------------------------
def best_move(cur):
    """Same rule as bestMove() in frontend/js/story.js: the move whose worst-case group of
    identical next readings is smallest (first in N, E, S, W order wins ties)."""
    best = None
    for d in DIRS:
        groups = {}
        for x in cur:
            key = tuple(G.reading(G.move(x, d)))
            groups[key] = groups.get(key, 0) + 1
        worst = max(groups.values())
        if worst < len(cur) and (best is None or worst < best[1]):
            best = (d, worst)
    return best and best[0]


def ui_chains():
    """Every (start, moves) the UI can reach: sense, then keep moving by best_move until one cell is left."""
    for start in range(16):
        mv = ""
        while True:
            yield start, mv
            cands = G.candidates(G.sense_after(start, mv), mv)
            cur = sorted({reduce(G.move, mv, s) for s in cands})
            d = best_move(cur) if len(cur) > 1 else None
            if not d or len(mv) >= MAX_MOVES:
                break
            mv += d


def stage1_case(args):
    mv, readings = args
    cands = G.candidates(readings, mv)
    M, k = len(cands), best_k(16, len(cands))
    kn = min(k, NOISY_K_CAP)
    ideal = Statevector(grover(compiled_oracle, readings, mv, k, False)).probabilities(range(4))
    noisy_p, noisy_2q = noisy_probs(grover(compiled_oracle, readings, mv, kn, True), 4)
    f_2q = two_q(transpile(formula_oracle(G, readings, mv), basis_gates=["cx", "u"], optimization_level=1))
    e = dict(M=M, k=k, k_noisy=kn, theory=round(theory_success(16, M, k), 4),
             ideal=r3(ideal), noisy=r3(noisy_p), noisy_2q=noisy_2q,
             honest_qubits=4 + 4 * len(readings), honest_2q=f_2q, honest_noisy=None)
    if mv == "":
        hp, _ = noisy_probs(grover(formula_oracle, readings, mv, kn, True), 4)
        e["honest_noisy"] = round(sum(hp[c] for c in cands), 3)
    return key1(mv, readings), e


def stage2_case(args):
    starts, goal = args
    good = good_plans(G, starts, goal)
    M, k = len(good), best_k(N_PLANS, len(good))
    kn = min(k, NOISY_K_CAP)
    ideal = Statevector(plan_search_circuit(G, starts, goal, k, measure=False)).probabilities()
    noisy_p, n2q = noisy_probs(plan_search_circuit(G, starts, goal, kn), 6)
    top = lambda p: [[decode(i), round(p[i], 3)] for i in sorted(range(N_PLANS), key=lambda i: -p[i])[:5]]
    b = bennett_plan_oracle(G, starts, goal)
    return ",".join(map(str, starts)) + "|" + str(goal), dict(
        good=[decode(p) for p in good], M=M, k=k, k_noisy=kn, theory=round(theory_success(N_PLANS, M, k), 4),
        ideal_success=round(sum(ideal[g] for g in good), 3), ideal_top=top(ideal),
        noisy_success=round(sum(noisy_p[g] for g in good), 3), noisy_top=top(noisy_p), noisy_2q=n2q,
        honest_qubits=b.num_qubits, honest_2q=two_q(transpile(b, basis_gates=["cx", "u"], optimization_level=1)))


if __name__ == "__main__":
    from concurrent.futures import ProcessPoolExecutor

    jobs1, now_sets = {}, {(x,) for x in range(16)}      # every single known cell can start a leg
    for start, mv in ui_chains():
        readings = G.sense_after(start, mv)
        jobs1[key1(mv, readings)] = (mv, readings)
        cands = G.candidates(readings, mv)
        now_sets.add(tuple(sorted({reduce(G.move, mv, s) for s in cands})))
    jobs2 = [(st, g) for st in sorted(now_sets) for g in range(16) if good_plans(G, st, g)]
    print(f"{len(jobs1)} stage-1 cases, {len(jobs2)} stage-2 cases", flush=True)

    with ProcessPoolExecutor(max_workers=6) as pool:
        stage1 = dict(pool.map(stage1_case, jobs1.values()))
        print("stage 1 done", flush=True)
        stage2 = dict(pool.map(stage2_case, jobs2))
        print("stage 2 done", flush=True)

    data = dict(device=device.name, shots=SHOTS, max_moves=MAX_MOVES, plan_moves=3, stage1=stage1, stage2=stage2)
    Path("frontend/js/qdata.js").write_text("window.QDATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"wrote frontend/js/qdata.js: {len(stage1)} stage-1 cases, {len(stage2)} stage-2 cases")
