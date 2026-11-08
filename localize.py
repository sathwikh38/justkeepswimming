"""
Finding a lost robot with Grover's search.

A robot wakes up somewhere on a known 4x4 grid map. It can only sense which
sides of its cell have walls (North, East, South, West). Grover's search finds
the cells that match what it senses.

The oracle never sees the answer. It holds the MAP and the SENSOR READING, and
uses Bennett's construction:
    1. compute   walls(x) into ancilla qubits      (map lookup)
    2. compare   ancillas with the reading, flip the phase if they match
    3. uncompute walls(x), so the ancillas return to |0>
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister
from qiskit.circuit.library import MCXGate

N_, E_, S_, W_ = 0, 1, 2, 3
DIRS = "NESW"
STEP = {"N": (-1, 0), "E": (0, 1), "S": (1, 0), "W": (0, -1)}


# ----------------------------------------------------------------------------
# The map
# ----------------------------------------------------------------------------
@dataclass
class GridMap:
    rows: int = 4
    cols: int = 4
    # internal walls, each written as ((r, c), side)
    inner: list = field(default_factory=list)

    def __post_init__(self):
        self.walls = {(r, c): [0, 0, 0, 0] for r in range(self.rows) for c in range(self.cols)}
        for r in range(self.rows):
            for c in range(self.cols):
                if r == 0: self.walls[(r, c)][N_] = 1
                if r == self.rows - 1: self.walls[(r, c)][S_] = 1
                if c == 0: self.walls[(r, c)][W_] = 1
                if c == self.cols - 1: self.walls[(r, c)][E_] = 1
        for (r, c), side in self.inner:
            self._add_wall(r, c, side)

    def _add_wall(self, r, c, side):
        self.walls[(r, c)][DIRS.index(side)] = 1
        dr, dc = STEP[side]
        nr, nc = r + dr, c + dc
        if (nr, nc) in self.walls:  # the neighbour sees the same wall from the other side
            self.walls[(nr, nc)][DIRS.index("NESW"[(DIRS.index(side) + 2) % 4])] = 1

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
        """Where the robot ends up after trying to move one step in direction d."""
        r, c = self.cell(x)
        if self.walls[(r, c)][DIRS.index(d)]:
            return x  # blocked by a wall, so it stays put
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


# ----------------------------------------------------------------------------
# The oracle (Bennett: compute, compare, uncompute)
# ----------------------------------------------------------------------------
def _controlled_on_value(qc, pos, value, target, n):
    """Flip `target` iff the position register holds `value`."""
    zeros = [pos[i] for i in range(n) if not (value >> i) & 1]
    if zeros: qc.x(zeros)
    qc.append(MCXGate(n), list(pos) + [target])
    if zeros: qc.x(zeros)


def _lookup(qc, gmap, pos, anc, moves):
    """XOR the wall bits of every sensed cell into the ancillas: anc ^= walls(path(x))."""
    n = gmap.n_pos_qubits
    for x in range(gmap.n_cells):
        bits = [b for reading in gmap.sense_after(x, moves) for b in reading]
        for j, b in enumerate(bits):
            if b:
                _controlled_on_value(qc, pos, x, anc[j], n)


def oracle(gmap: GridMap, readings, moves=()) -> QuantumCircuit:
    n = gmap.n_pos_qubits
    target = [b for r in readings for b in r]
    pos = QuantumRegister(n, "pos")
    anc = QuantumRegister(len(target), "walls")
    qc = QuantumCircuit(pos, anc, name="Oracle")

    _lookup(qc, gmap, pos, anc, moves)                       # 1. compute
    flip = [anc[j] for j, b in enumerate(target) if b == 0]  # 2. compare:
    if flip: qc.x(flip)                                      #    every ancilla is 1 iff walls == reading
    qc.h(anc[-1]); qc.append(MCXGate(len(target) - 1), list(anc)); qc.h(anc[-1])  # multi-controlled Z
    if flip: qc.x(flip)
    _lookup(qc, gmap, pos, anc, moves)                       # 3. uncompute (the lookup is its own inverse)
    return qc


def compiled_oracle(gmap: GridMap, readings, moves=()) -> QuantumCircuit:
    """The same oracle, compiled straight to a diagonal phase gate on the position register.

    It has the same effect as the Bennett oracle (-1 on matching cells, +1 elsewhere)
    but needs no ancillas and far fewer gates. The catch: building it means
    evaluating the map classically for every cell, which is why the Bennett version
    is the honest one for the theory section.
    """
    from qiskit.circuit.library import DiagonalGate
    n = gmap.n_pos_qubits
    marked = set(gmap.candidates(readings, moves))
    diag = [-1 if x in marked else 1 for x in range(2 ** n)]
    qc = QuantumCircuit(QuantumRegister(n, "pos"), name="Oracle*")
    qc.append(DiagonalGate(diag), qc.qubits)
    return qc


def diffuser(n) -> QuantumCircuit:
    q = QuantumRegister(n, "pos")
    qc = QuantumCircuit(q, name="Diffuser")
    qc.h(q); qc.x(q)
    qc.h(q[-1]); qc.append(MCXGate(n - 1), list(q)); qc.h(q[-1])
    qc.x(q); qc.h(q)
    return qc


def grover_circuit(gmap: GridMap, readings, moves=(), k=1, compiled=False) -> QuantumCircuit:
    n = gmap.n_pos_qubits
    o = (compiled_oracle if compiled else oracle)(gmap, readings, moves)
    pos = QuantumRegister(n, "pos")
    c = ClassicalRegister(n, "cell")
    if o.num_qubits > n:
        anc = QuantumRegister(o.num_qubits - n, "walls")
        qc = QuantumCircuit(pos, anc, c)
    else:
        anc = []
        qc = QuantumCircuit(pos, c)
    qc.h(pos)
    for _ in range(k):
        qc.compose(o, qubits=list(pos) + list(anc), inplace=True)
        qc.compose(diffuser(n), qubits=list(pos), inplace=True)
    qc.measure(pos, c)
    return qc


# ----------------------------------------------------------------------------
# Theory
# ----------------------------------------------------------------------------
def theory_success(N, M, k):
    """P(measure a marked cell) after k Grover iterations: sin^2((2k+1)θ), sin θ = sqrt(M/N)."""
    theta = math.asin(math.sqrt(M / N))
    return math.sin((2 * k + 1) * theta) ** 2


def best_k(N, M):
    theta = math.asin(math.sqrt(M / N))
    return max(0, round(math.pi / (4 * theta) - 0.5))


# The demo map: a small flooded town with a few internal walls.
DEMO_MAP = GridMap(inner=[
    ((0, 1), "S"), ((1, 2), "E"), ((2, 0), "E"),
    ((2, 2), "S"), ((3, 1), "E"), ((1, 0), "S"),
])
