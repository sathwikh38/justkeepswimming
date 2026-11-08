"""
Stage 2: How do I get home?  (conformant planning with Grover's search)

After stage 1 the robot may still have two possible starts. We want ONE plan of
3 moves that brings it home from EVERY possible start. Walls block moves (the
robot stays put), which is exactly what lets one plan line up two different walks.

Encoding: 2 qubits per move, 3 moves = 6 qubits = 64 plans.
    code 0=N, 1=E, 2=S, 3=W   (same order as localize.DIRS)
    move i lives in bits (2i, 2i+1) of the plan integer, so the measured
    bitstring read as an int IS the plan (Qiskit is little-endian).

The oracle here is the compiled DiagonalGate (-1 on good plans). Like stage 1's
compiled oracle it is NOT honest: it evaluates plan_works classically for all 64
plans. It is the lower bound on cost; the Bennett version is milestone M10.
"""
from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister
from qiskit.circuit.library import DiagonalGate

from localize import DEMO_MAP, DIRS, GridMap, diffuser

N_MOVES = 3
N_PLAN_QUBITS = 2 * N_MOVES          # 6 qubits -> 64 plans
N_PLANS = 2 ** N_PLAN_QUBITS

# The demo case: stage 1's ambiguous pair on the town map (same wall reading).
DEMO_STARTS = (DEMO_MAP.index(1, 0), DEMO_MAP.index(3, 0))
DEMO_HOME = DEMO_MAP.index(1, 1)


# ----------------------------------------------------------------------------
# Classical side: plans, walks, and which plans are good
# ----------------------------------------------------------------------------
def decode(plan: int) -> str:
    """Plan integer -> move string, e.g. 0b010001 -> 'ENE' (move 1 = lowest 2 bits)."""
    return "".join(DIRS[(plan >> 2 * i) & 3] for i in range(N_MOVES))


def encode(moves: str) -> int:
    return sum(DIRS.index(d) << 2 * i for i, d in enumerate(moves))


def walk(gmap: GridMap, start: int, plan: int) -> list:
    """Cells visited from `start` following `plan` (walls block moves)."""
    path = [start]
    for d in decode(plan):
        path.append(gmap.move(path[-1], d))
    return path


def plan_works(gmap: GridMap, plan: int, starts, home: int) -> bool:
    """The oracle's predicate f(plan): every possible start ends at home."""
    return all(walk(gmap, s, plan)[-1] == home for s in starts)


def good_plans(gmap: GridMap, starts, home: int) -> list:
    return [p for p in range(N_PLANS) if plan_works(gmap, p, starts, home)]


# ----------------------------------------------------------------------------
# Quantum side: compiled oracle + the same diffuser as stage 1
# ----------------------------------------------------------------------------
def compiled_plan_oracle(gmap: GridMap, starts, home: int) -> QuantumCircuit:
    good = set(good_plans(gmap, starts, home))
    qc = QuantumCircuit(QuantumRegister(N_PLAN_QUBITS, "plan"), name="PlanOracle*")
    qc.append(DiagonalGate([-1 if p in good else 1 for p in range(N_PLANS)]), qc.qubits)
    return qc


def plan_search_circuit(gmap: GridMap, starts, home: int, k: int, measure=True) -> QuantumCircuit:
    plan = QuantumRegister(N_PLAN_QUBITS, "plan")
    qc = QuantumCircuit(plan)
    o = compiled_plan_oracle(gmap, starts, home)
    d = diffuser(N_PLAN_QUBITS)
    qc.h(plan)                                   # |s> = uniform over all 64 plans
    for _ in range(k):
        qc.compose(o, plan, inplace=True)        # reflect about |w_perp>
        qc.compose(d, plan, inplace=True)        # reflect about |s>
    if measure:
        qc.add_register(ClassicalRegister(N_PLAN_QUBITS, "moves"))
        qc.measure(plan, qc.clbits)
    return qc
