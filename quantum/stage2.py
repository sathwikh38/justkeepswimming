"""
Stage 2: How do I get home?  (conformant planning with Grover's search)

Find a plan of 3 moves that walks the robot home. The oracle checks the plan from
every square the robot might be on (one square if stage 1 pinned it down, a few if
lookalikes remain), so the same search also handles leftover uncertainty. Walls block
moves (the robot stays put), which is what lets one plan line up different walks.

Encoding: 2 qubits per move, 3 moves = 6 qubits = 64 plans.
    code 0=N, 1=E, 2=S, 3=W   (same order as localize.DIRS)
    move i lives in bits (2i, 2i+1) of the plan integer, so the measured
    bitstring read as an int IS the plan (Qiskit is little-endian).

Two oracles, same unitary on the plan register (-1 on good plans):
  compiled_plan_oracle  DiagonalGate. NOT honest: evaluates plan_works classically for
                        all 64 plans. The lower bound on cost.
  bennett_plan_oracle   honest: simulates both walks on qubits (compute, check, uncompute).
"""
from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister
from qiskit.circuit.library import DiagonalGate

from quantum.stage1 import DEMO_MAP, DIRS, GridMap, apply_formula, diffuser

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


# ----------------------------------------------------------------------------
# Honest oracle: Bennett's construction (M10). Sees only the map, starts and home.
# ----------------------------------------------------------------------------
# Registers: plan (6) + pos (4) + one flag per start (2)  =  12 qubits.
#   * Move 1 needs no position register: the start is known, so the position after
#     moves 1-2 is a fixed function of the plan's first 4 qubits.  pos ^= walk2(s, m1, m2)
#     is written bit by bit as a cheapest-polarity Reed-Muller formula (as in M6).
#   * Move 3 needs no register either: we only ask "is move(pos, m3) == home?"
#   * Walk A -> flag a -> undo walk; walk B reuses the same pos qubits (ancilla reuse).
def _mcx_on_value(qc, controls, value, target):
    """Flip target iff the controls hold `value` (little-endian)."""
    zeros = [q for i, q in enumerate(controls) if not (value >> i) & 1]
    if zeros: qc.x(zeros)
    qc.mcx(list(controls), target)
    if zeros: qc.x(zeros)


def _walk2(qc, gmap, start, plan, pos):
    """pos ^= cell after moves 1 and 2. Self-inverse (only XORs), so calling it again undoes it."""
    after2 = [gmap.move(gmap.move(start, DIRS[v & 3]), DIRS[v >> 2]) for v in range(16)]
    for i in range(4):
        apply_formula(qc, [(x >> i) & 1 for x in after2], list(plan[:4]), pos[i])


def _check_home(qc, gmap, start, plan, pos, flag, home):
    """flag ^= [move(pos, m3) == home], only for cells reachable from `start` in 2 moves."""
    reach = sorted({gmap.move(gmap.move(start, a), b) for a in DIRS for b in DIRS})
    for x in reach:
        for c in range(4):
            if gmap.move(x, DIRS[c]) == home:
                _mcx_on_value(qc, list(pos) + [plan[4], plan[5]], x | c << 4, flag)


def bennett_plan_oracle(gmap: GridMap, starts, home: int, reuse_pos=True) -> QuantumCircuit:
    """reuse_pos=True : one pos register shared by all walks (fewer qubits, earlier walks re-run).
    reuse_pos=False: one pos register per start (more qubits, every walk runs only twice).
    This is the qubits-vs-gates trade-off of Bennett's pebble game."""
    plan = QuantumRegister(N_PLAN_QUBITS, "plan")
    pos = [QuantumRegister(4, "pos")] if reuse_pos else [QuantumRegister(4, f"pos{i}") for i in range(len(starts))]
    ok = QuantumRegister(len(starts), "ok")
    qc = QuantumCircuit(plan, *pos, ok, name="PlanOracle(Bennett)")
    P = (lambda i: pos[0]) if reuse_pos else (lambda i: pos[i])
    n = len(starts)

    def phase_flip():                         # in-place phase flip on "all flags = 1": H-MCX-H
        if n == 1: qc.z(ok[0])
        else: qc.h(ok[-1]); qc.mcx(list(ok[:-1]), ok[-1]); qc.h(ok[-1])

    if not reuse_pos:                         # walk + check every start, flip, then undo everything
        for i, s in enumerate(starts):
            _walk2(qc, gmap, s, plan, P(i)); _check_home(qc, gmap, s, plan, P(i), ok[i], home)
        phase_flip()
        for i, s in reversed(list(enumerate(starts))):
            _check_home(qc, gmap, s, plan, P(i), ok[i], home); _walk2(qc, gmap, s, plan, P(i))
        return qc

    def flag_only(i, s):                      # ok[i] ^= works_from(s); pos is clean again afterwards
        _walk2(qc, gmap, s, plan, P(i))       #   compute
        _check_home(qc, gmap, s, plan, P(i), ok[i], home)   # copy the answer into a flag
        _walk2(qc, gmap, s, plan, P(i))       #   uncompute -> pos free for the next walk

    for i, s in enumerate(starts[:-1]):
        flag_only(i, s)
    _walk2(qc, gmap, starts[-1], plan, P(0))  # last start: keep its walk while we flip the phase
    _check_home(qc, gmap, starts[-1], plan, P(0), ok[-1], home)
    phase_flip()
    _check_home(qc, gmap, starts[-1], plan, P(0), ok[-1], home)
    _walk2(qc, gmap, starts[-1], plan, P(0))
    for i, s in reversed(list(enumerate(starts[:-1]))):
        flag_only(i, s)                       # uncompute the earlier flags
    return qc


def plan_search_circuit(gmap: GridMap, starts, home: int, k: int, measure=True, honest=False) -> QuantumCircuit:
    o = (bennett_plan_oracle if honest else compiled_plan_oracle)(gmap, starts, home)
    plan = QuantumRegister(N_PLAN_QUBITS, "plan")
    regs = [plan] + ([QuantumRegister(o.num_qubits - N_PLAN_QUBITS, "anc")] if o.num_qubits > N_PLAN_QUBITS else [])
    qc = QuantumCircuit(*regs)
    d = diffuser(N_PLAN_QUBITS)
    qc.h(plan)                                   # |s> = uniform over all 64 plans
    for _ in range(k):
        qc.compose(o, qc.qubits, inplace=True)   # reflect about |w_perp>
        qc.compose(d, plan, inplace=True)        # reflect about |s>
    if measure:
        qc.add_register(ClassicalRegister(N_PLAN_QUBITS, "moves"))
        qc.measure(plan, qc.clbits)
    return qc
