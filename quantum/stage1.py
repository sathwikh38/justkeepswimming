"""
Stage 1: Where am I?  (localization with Grover's search)

A robot wakes up somewhere on a known 4x4 grid map. It can only sense which sides of
its cell have walls (N, E, S, W). Grover's search finds the cells that match.

Every oracle here has the same effect on the position register: -1 on matching cells.
  lookup_oracle    honest Bennett oracle: compute walls(x) into ancillas with one
                   lookup per cell, compare with the reading and flip the phase, uncompute
  formula_oracle   honest Bennett oracle, cheaper: each wall bit is a compact
                   Reed-Muller formula of the position bits instead of a lookup per cell
  compiled_oracle  one DiagonalGate. NOT honest: built from the classical answer.
                   The lower bound on cost.
The oracles never see the answer: they hold the MAP and the SENSOR READING only.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.circuit.library import DiagonalGate, MCXGate

N_, E_, S_, W_ = 0, 1, 2, 3
DIRS = "NESW"
STEP = {"N": (-1, 0), "E": (0, 1), "S": (1, 0), "W": (0, -1)}


# ----------------------------------------------------------------------------
# The map (classical)
# ----------------------------------------------------------------------------
@dataclass
class GridMap:
    rows: int = 4
    cols: int = 4
    inner: list = field(default_factory=list)   # internal walls, each ((r, c), side)

    def __post_init__(self):
        self.walls = {(r, c): [0, 0, 0, 0] for r in range(self.rows) for c in range(self.cols)}
        for (r, c), w in self.walls.items():
            w[N_], w[S_] = int(r == 0), int(r == self.rows - 1)
            w[W_], w[E_] = int(c == 0), int(c == self.cols - 1)
        for (r, c), side in self.inner:
            self._add_wall(r, c, side)

    @classmethod
    def from_walls(cls, rows):
        """Build from per-cell 'NESW' bit strings, e.g. ['1001', '1100', ...] (row-major)."""
        g = cls()
        g.walls = {g.cell(x): [int(b) for b in rows[x]] for x in range(g.n_cells)}
        return g

    def _add_wall(self, r, c, side):
        self.walls[(r, c)][DIRS.index(side)] = 1
        dr, dc = STEP[side]
        if (r + dr, c + dc) in self.walls:      # the neighbour sees the same wall from the other side
            self.walls[(r + dr, c + dc)][(DIRS.index(side) + 2) % 4] = 1

    @property
    def n_cells(self):
        return self.rows * self.cols

    @property
    def n_pos_qubits(self):
        return math.ceil(math.log2(self.n_cells))

    def cell(self, x):
        return divmod(x, self.cols)

    def index(self, r, c):
        return r * self.cols + c

    def reading(self, x):
        return tuple(self.walls[self.cell(x)])

    def move(self, x, d):
        """Where the robot ends up after trying one step in direction d (walls block)."""
        r, c = self.cell(x)
        if self.walls[(r, c)][DIRS.index(d)]:
            return x
        dr, dc = STEP[d]
        return self.index(r + dr, c + dc)

    def sense_after(self, x, moves):
        """Readings at the start and after each move: what the robot actually observes."""
        out = [self.reading(x)]
        for d in moves:
            x = self.move(x, d)
            out.append(self.reading(x))
        return out

    def candidates(self, readings, moves):
        """Classical answer (used only to check the quantum one)."""
        return [x for x in range(self.n_cells) if self.sense_after(x, moves) == list(readings)]


# The town map used for the figures and tests: a small flooded town with internal walls.
DEMO_MAP = GridMap(inner=[
    ((0, 1), "S"), ((1, 2), "E"), ((2, 0), "E"),
    ((2, 2), "S"), ((3, 1), "E"), ((1, 0), "S"),
])


# ----------------------------------------------------------------------------
# Wall lookups: anc_j ^= walls_j(x)
# ----------------------------------------------------------------------------
def _wall_bits(gmap, moves):
    """Truth table rows: the wall bits the oracle must compute for every cell x."""
    return [[b for r in gmap.sense_after(x, moves) for b in r] for x in range(2 ** gmap.n_pos_qubits)]


def _lookup(qc, gmap, pos, anc, moves):
    """One multi-controlled X per (cell, set wall bit): flip anc[j] iff pos holds x."""
    n = gmap.n_pos_qubits
    for x, bits in enumerate(_wall_bits(gmap, moves)):
        zeros = [pos[i] for i in range(n) if not (x >> i) & 1]
        for j, b in enumerate(bits):
            if b:
                if zeros: qc.x(zeros)
                qc.append(MCXGate(n), list(pos) + [anc[j]])
                if zeros: qc.x(zeros)


def reed_muller(tt, n, polarity):
    """Fixed-polarity Reed-Muller terms (bitmasks) of truth table tt. Polarity bit i = 1 negates input i."""
    g = [tt[x ^ polarity] for x in range(2 ** n)]   # substitute x_i -> NOT x_i
    for i in range(n):                             # Mobius transform (XOR form)
        for x in range(2 ** n):
            if x >> i & 1:
                g[x] ^= g[x ^ (1 << i)]
    return [m for m in range(2 ** n) if g[m]]


def _term_cost(mask):
    k = bin(mask).count("1")
    return {0: 0, 1: 1, 2: 6, 3: 14}.get(k, 30 * (k - 3))   # rough CX cost of a k-controlled X


def best_form(tt, n):
    """Try all 2^n polarities, keep the cheapest Reed-Muller form: (polarity, terms)."""
    return min(((pol, reed_muller(tt, n, pol)) for pol in range(2 ** n)),
               key=lambda pt: sum(_term_cost(t) for t in pt[1]))


def apply_formula(qc, tt, inputs, target):
    """target ^= f(inputs) with f given by its truth table, written as a cheapest XOR of ANDs."""
    n = len(inputs)
    pol, terms = best_form(tt, n)
    neg = [inputs[i] for i in range(n) if pol >> i & 1]
    if neg and terms: qc.x(neg)
    for t in terms:
        ctrl = [inputs[i] for i in range(n) if t >> i & 1]
        if not ctrl: qc.x(target)
        elif len(ctrl) == 1: qc.cx(ctrl[0], target)
        else: qc.append(MCXGate(len(ctrl)), ctrl + [target])
    if neg and terms: qc.x(neg)


def _formula_lookup(qc, gmap, pos, anc, moves):
    rows = _wall_bits(gmap, moves)
    for j in range(len(rows[0])):
        apply_formula(qc, [row[j] for row in rows], list(pos), anc[j])


# ----------------------------------------------------------------------------
# Oracles
# ----------------------------------------------------------------------------
def _bennett_oracle(lookup, gmap, readings, moves, name):
    n = gmap.n_pos_qubits
    target = [b for r in readings for b in r]
    pos, anc = QuantumRegister(n, "pos"), QuantumRegister(len(target), "walls")
    qc = QuantumCircuit(pos, anc, name=name)
    lookup(qc, gmap, pos, anc, moves)                         # 1. compute walls(x)
    flip = [anc[j] for j, b in enumerate(target) if b == 0]   # 2. compare: all ancillas 1 iff walls == reading
    if flip: qc.x(flip)
    qc.h(anc[-1]); qc.append(MCXGate(len(target) - 1), list(anc)); qc.h(anc[-1])  # in-place multi-controlled Z
    if flip: qc.x(flip)
    lookup(qc, gmap, pos, anc, moves)                         # 3. uncompute (XORs are self-inverse)
    return qc


def lookup_oracle(gmap: GridMap, readings, moves=()) -> QuantumCircuit:
    return _bennett_oracle(_lookup, gmap, readings, moves, "Oracle(lookup)")


def formula_oracle(gmap: GridMap, readings, moves=()) -> QuantumCircuit:
    return _bennett_oracle(_formula_lookup, gmap, readings, moves, "Oracle(formula)")


def compiled_oracle(gmap: GridMap, readings, moves=()) -> QuantumCircuit:
    marked = set(gmap.candidates(readings, moves))
    n = gmap.n_pos_qubits
    qc = QuantumCircuit(QuantumRegister(n, "pos"), name="Oracle*")
    qc.append(DiagonalGate([-1 if x in marked else 1 for x in range(2 ** n)]), qc.qubits)
    return qc


ORACLES = {"lookup": lookup_oracle, "formula": formula_oracle, "compiled": compiled_oracle}


def diffuser(n) -> QuantumCircuit:
    """2|s><s| - I up to a global phase: H, X, multi-controlled Z, X, H."""
    q = QuantumRegister(n, "pos")
    qc = QuantumCircuit(q, name="Diffuser")
    qc.h(q); qc.x(q)
    qc.h(q[-1]); qc.append(MCXGate(n - 1), list(q)); qc.h(q[-1])
    qc.x(q); qc.h(q)
    return qc


def grover_circuit(gmap: GridMap, readings, moves=(), k=1, oracle="lookup", measure=True) -> QuantumCircuit:
    n = gmap.n_pos_qubits
    o = ORACLES[oracle](gmap, readings, moves)
    pos = QuantumRegister(n, "pos")
    regs = [pos] + ([QuantumRegister(o.num_qubits - n, "walls")] if o.num_qubits > n else [])
    qc = QuantumCircuit(*regs)
    qc.h(pos)
    for _ in range(k):
        qc.compose(o, qc.qubits, inplace=True)
        qc.compose(diffuser(n), pos, inplace=True)
    if measure:
        qc.add_register(ClassicalRegister(n, "cell"))
        qc.measure(pos, qc.clbits)
    return qc


# ----------------------------------------------------------------------------
# Theory
# ----------------------------------------------------------------------------
def theory_success(N, M, k):
    """P(measure a marked item) after k Grover iterations: sin^2((2k+1)θ), sin θ = sqrt(M/N)."""
    theta = math.asin(math.sqrt(M / N))
    return math.sin((2 * k + 1) * theta) ** 2


def best_k(N, M):
    theta = math.asin(math.sqrt(M / N))
    return max(0, round(math.pi / (4 * theta) - 0.5))
