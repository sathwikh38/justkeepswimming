"""
Stage 1 experiments (noiseless), honest lookup oracle on AerSimulator.

    python -m experiments.stage1_noiseless     # ~15 s

  fig1  open room: measured P(found) vs sin²((2k+1)θ) for interior (M=4), edge (M=2), corner (M=1)
  fig2  town map: one reading matches 2 cells; one move east leaves 1
  data  results/stage1.json
"""
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from qiskit import transpile
from qiskit_aer import AerSimulator

from experiments import RESULTS, draw_map
from quantum.stage1 import DEMO_MAP, GridMap, best_k, grover_circuit, theory_success

SHOTS = 4000
sim = AerSimulator()


def counts(gmap, readings, moves, k):
    qc = transpile(grover_circuit(gmap, readings, moves, k=k), sim)
    return sim.run(qc, shots=SHOTS, seed_simulator=11).result().get_counts()


def p_found(gmap, readings, moves, k):
    marked = set(gmap.candidates(readings, moves))
    return sum(v for b, v in counts(gmap, readings, moves, k).items() if int(b, 2) in marked) / SHOTS


rows = []

# --- fig1: open room, where the robot is sets M ---------------------------------
room = GridMap()
cases = [("interior", room.index(1, 1), "#2a7fb8"), ("edge", room.index(0, 1), "#e08a1e"),
         ("corner", room.index(0, 0), "#3a9d5d")]
fig, ax = plt.subplots(figsize=(7, 4.2))
kk = [i / 20 for i in range(81)]
for name, x, col in cases:
    rd = room.sense_after(x, "")
    M = len(room.candidates(rd, ""))
    meas = [p_found(room, rd, "", k) for k in range(5)]
    rows += [dict(map="open room", case=name, M=M, k=k, theory=theory_success(16, M, k), measured=p)
             for k, p in enumerate(meas)]
    ax.plot(kk, [theory_success(16, M, k) for k in kk], color=col, lw=1, alpha=.6)
    ax.plot(range(5), meas, "o", color=col, label=f"{name} (M = {M}), best k = {best_k(16, M)}")
ax.set(xlabel="Grover iterations k", ylabel="P(robot found)", ylim=(0, 1.05),
       title="Stage 1, noiseless: measured (dots) vs sin²((2k+1)θ) (lines)")
ax.legend(frameon=False)
fig.tight_layout(); fig.savefig(RESULTS / "fig1_stage1_noiseless_vs_theory.png", dpi=160)

# --- fig2: one move breaks the tie on the town map -------------------------------
G, start = DEMO_MAP, DEMO_MAP.index(1, 0)       # reads the same as (3, 0)
fig, axes = plt.subplots(1, 2, figsize=(9, 4.6))
for ax, moves in zip(axes, ["", "E"]):
    rd = G.sense_after(start, moves)
    M = len(G.candidates(rd, moves))
    k = best_k(16, M)
    c = counts(G, rd, moves, k)
    p = {x: c.get(format(x, "04b"), 0) / SHOTS for x in range(16)}
    rows.append(dict(map="town", case=f"moves={moves or 'none'}", M=M, k=k, theory=theory_success(16, M, k),
                     measured=sum(p[x] for x in G.candidates(rd, moves))))
    draw_map(ax, G, fill=lambda x: plt.cm.Blues(p[x]), label=lambda x: f"{p[x]:.2f}",
             label_color=lambda x: "white" if p[x] > .5 else "black")
    r, col = G.cell(start)
    ax.plot(col + .5, 3 - r + .82, "r*", ms=12)
    ax.set_title(f"Moves: {moves or 'none'}  ·  M = {M}, k = {k}")
fig.suptitle("Where the robot might be (P of measuring each cell; ★ = true start)")
fig.tight_layout(); fig.savefig(RESULTS / "fig2_stage1_move_breaks_tie.png", dpi=160)

json.dump(dict(shots=SHOTS, rows=rows), open(RESULTS / "stage1.json", "w"), indent=1)
for r in rows:
    print(f"{r['map']:9s} {r['case']:10s} M={r['M']} k={r['k']}  theory={r['theory']:.3f}  measured={r['measured']:.3f}")
