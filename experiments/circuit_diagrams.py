"""
Readable circuit diagrams for the README (logical circuits, before compiling for hardware).

    python -m experiments.circuit_diagrams

  circuit1_grover_stage1.png   the whole stage-1 search: H, then k x (oracle, diffuser), measure
  circuit2_oracle_stage1.png   inside the honest formula oracle: compute walls, compare + flip, uncompute
  circuit3_oracle_stage2.png   inside the honest stage-2 oracle: walk A -> flag, walk B -> flag, CZ, undo
"""
import matplotlib
matplotlib.use("Agg")
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.circuit.library import MCXGate

from experiments import RESULTS
from quantum.stage1 import DEMO_MAP, GridMap, _formula_lookup, diffuser
from quantum.stage2 import DEMO_HOME, DEMO_STARTS, _check_home, _walk2

STYLE = {"displaycolor": {"Oracle": ("#c2410c", "#ffffff"), "Diffuser": ("#1d4ed8", "#ffffff")}}


def box(qc, name, qubits, inner=None):
    """Append `inner` (or an empty placeholder) as one labelled box."""
    g = (inner or QuantumCircuit(len(qubits))).to_gate(label=name)
    g.name = name
    qc.append(g, qubits)


room = GridMap()
rd = room.sense_after(room.index(0, 0), "")         # corner robot: walls N + W

# --- 1. the whole stage-1 search (k = 2), oracle and diffuser as boxes ----------
pos, anc, c = QuantumRegister(4, "pos"), QuantumRegister(4, "walls"), ClassicalRegister(4, "cell")
qc = QuantumCircuit(pos, anc, c)
qc.h(pos)
qc.barrier()
for _ in range(2):
    box(qc, "Oracle", list(pos) + list(anc))
    box(qc, "Diffuser", list(pos), diffuser(4))
    qc.barrier()
qc.measure(pos, c)
qc.draw("mpl", style=STYLE, fold=-1, filename=RESULTS / "circuit1_grover_stage1.png")

# --- 2. inside the honest formula oracle -----------------------------------------
pos, anc = QuantumRegister(4, "pos"), QuantumRegister(4, "walls")
o = QuantumCircuit(pos, anc)
_formula_lookup(o, room, pos, anc, "")               # 1. compute walls(x) as Reed-Muller formulas
o.barrier(label="compute")
flip = [anc[j] for j, b in enumerate(rd[0]) if b == 0]       # the reading: N + W walls
o.x(flip)
o.h(anc[-1]); o.append(MCXGate(3), list(anc)); o.h(anc[-1])   # 2. phase flip iff walls == reading
o.x(flip)
o.barrier(label="compare + flip")
_formula_lookup(o, room, pos, anc, "")               # 3. uncompute
o.barrier(label="uncompute")
o.draw("mpl", fold=-1, filename=RESULTS / "circuit2_oracle_stage1.png")

# --- 3. inside the honest stage-2 oracle (walks as boxes) --------------------------
plan, ppos, ok = QuantumRegister(6, "plan"), QuantumRegister(4, "pos"), QuantumRegister(2, "ok")
s2 = QuantumCircuit(plan, ppos, ok)
A, B = DEMO_STARTS


def walk(start, label):
    w = QuantumCircuit(10)
    _walk2(w, DEMO_MAP, start, w.qubits[:6], w.qubits[6:10])
    box(s2, label, list(plan) + list(ppos), w)


def check(start, flag, label):
    ch = QuantumCircuit(11)
    _check_home(ch, DEMO_MAP, start, ch.qubits[:6], ch.qubits[6:10], ch.qubits[10], DEMO_HOME)
    box(s2, label, list(plan) + list(ppos) + [flag], ch)


walk(A, "walk A"); check(A, ok[0], "home? → a"); walk(A, "undo A")
s2.barrier()
walk(B, "walk B"); check(B, ok[1], "home? → b")
s2.cz(ok[0], ok[1])
check(B, ok[1], "undo b"); walk(B, "undo B")
s2.barrier()
walk(A, "walk A"); check(A, ok[0], "undo a"); walk(A, "undo A")
s2.draw("mpl", fold=-1, filename=RESULTS / "circuit3_oracle_stage2.png")
print("wrote circuit1/2/3 to", RESULTS)
