"""
A cheaper honest oracle: each wall bit as a compact Boolean formula of the
position bits, instead of one lookup per cell.

walls_j(x) is a fixed function of the 4 position bits (it depends only on the MAP).
We write it in fixed-polarity Reed-Muller form (an XOR of AND-terms, where each
input is used either plain or negated), try all 16 polarities, and keep the
cheapest. Each AND-term becomes one multi-controlled X onto ancilla j, so the
lookup is still   anc_j ^= walls_j(x)   and Bennett's compute/compare/uncompute
is unchanged. The sensor reading still only enters in the compare step.
"""
from itertools import product
from qiskit import QuantumCircuit, QuantumRegister
from qiskit.circuit.library import MCXGate
from localize import GridMap


def wall_truth_tables(gmap: GridMap, moves=()):
    n = gmap.n_pos_qubits
    rows = [[b for r in gmap.sense_after(x, moves) for b in r] for x in range(2 ** n)]
    return [[rows[x][j] for x in range(2 ** n)] for j in range(len(rows[0]))]


def reed_muller(tt, n, polarity):
    """Terms (as bitmasks) of f in the given polarity. polarity bit i = 1 means input i is negated."""
    g = [tt[x ^ polarity] for x in range(2 ** n)]          # substitute x_i -> NOT x_i
    for i in range(n):                                    # Mobius transform (XOR form)
        for x in range(2 ** n):
            if x >> i & 1:
                g[x] ^= g[x ^ (1 << i)]
    return [m for m in range(2 ** n) if g[m]]


def term_cost(mask):
    k = bin(mask).count("1")
    return {0: 0, 1: 1, 2: 6, 3: 14}.get(k, 30 * (k - 3))  # rough CX cost of a k-controlled X


def best_form(tt, n):
    best = None
    for pol in range(2 ** n):
        terms = reed_muller(tt, n, pol)
        cost = sum(term_cost(t) for t in terms)
        if best is None or cost < best[0]:
            best = (cost, pol, terms)
    return best[1], best[2]


def formula_lookup(qc, gmap, pos, anc, moves=()):
    n = gmap.n_pos_qubits
    for j, tt in enumerate(wall_truth_tables(gmap, moves)):
        pol, terms = best_form(tt, n)
        neg = [pos[i] for i in range(n) if pol >> i & 1]
        if neg and terms: qc.x(neg)
        for t in terms:
            ctrl = [pos[i] for i in range(n) if t >> i & 1]
            if not ctrl:
                qc.x(anc[j])
            elif len(ctrl) == 1:
                qc.cx(ctrl[0], anc[j])
            else:
                qc.append(MCXGate(len(ctrl)), ctrl + [anc[j]])
        if neg and terms: qc.x(neg)


def formula_oracle(gmap: GridMap, readings, moves=()) -> QuantumCircuit:
    n = gmap.n_pos_qubits
    target = [b for r in readings for b in r]
    pos = QuantumRegister(n, "pos"); anc = QuantumRegister(len(target), "walls")
    qc = QuantumCircuit(pos, anc, name="Oracle(formula)")
    formula_lookup(qc, gmap, pos, anc, moves)              # compute
    flip = [anc[j] for j, b in enumerate(target) if b == 0]
    if flip: qc.x(flip)
    qc.h(anc[-1]); qc.append(MCXGate(len(target) - 1), list(anc)); qc.h(anc[-1])
    if flip: qc.x(flip)
    formula_lookup(qc, gmap, pos, anc, moves)              # uncompute
    return qc
