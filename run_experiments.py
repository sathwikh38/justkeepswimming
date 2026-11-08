"""
Runs every experiment and saves the figures and a results table.

    python run_experiments.py            # noiseless + noisy (fake IBM device)
    python run_experiments.py --fast     # fewer shots, for quick checks
"""
import argparse
import csv
import math

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from qiskit import transpile
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeTorino

from localize import GridMap, DEMO_MAP, grover_circuit, theory_success, best_k

ap = argparse.ArgumentParser()
ap.add_argument("--fast", action="store_true")
ap.add_argument("--kmax", type=int, default=4)
args = ap.parse_args()
SHOTS = 1000 if args.fast else 4000
KS = list(range(args.kmax + 1))

ideal = AerSimulator()
device = FakeTorino()
noisy = AerSimulator.from_backend(device)


def success_rate(gmap, readings, moves, k, sim, compiled, opt=1, target=None):
    qc = grover_circuit(gmap, readings, moves, k=k, compiled=compiled)
    t = transpile(qc, target or sim, optimization_level=opt, seed_transpiler=7)
    counts = sim.run(t, shots=SHOTS, seed_simulator=11).result().get_counts()
    marked = set(gmap.candidates(readings, moves))
    hits = sum(v for b, v in counts.items() if int(b, 2) in marked)
    twoq = sum(v for g, v in t.count_ops().items() if g in ("cx", "cz", "ecr"))
    return hits / SHOTS, twoq


# ----------------------------------------------------------------------------
# Experiment 1: noiseless, open room. Where the robot is changes M.
# ----------------------------------------------------------------------------
room = GridMap()
cases = [("interior (M=4)", room.index(1, 1)),
         ("edge (M=2)", room.index(0, 1)),
         ("corner (M=1)", room.index(0, 0))]
rows = []
fig, ax = plt.subplots(figsize=(7, 4.2))
kk = [i / 20 for i in range(20 * args.kmax + 1)]
for (label, x), col in zip(cases, ["#2a7fb8", "#e08a1e", "#3a9d5d"]):
    rd = room.sense_after(x, "")
    M = len(room.candidates(rd, ""))
    ax.plot(kk, [theory_success(16, M, k) for k in kk], color=col, lw=1, alpha=.6)
    meas = []
    for k in KS:
        p, _ = success_rate(room, rd, "", k, ideal, compiled=False)
        meas.append(p)
        rows.append(["noiseless", "bennett", label, M, k, theory_success(16, M, k), p, ""])
    ax.plot(KS, meas, "o", color=col, label=f"{label}, best k = {best_k(16, M)}")
ax.set(xlabel="Grover iterations k", ylabel="P(robot found)",
       title="Noiseless: measured (dots) vs sin²((2k+1)θ) (lines)", ylim=(0, 1.05))
ax.legend(frameon=False)
fig.tight_layout(); fig.savefig("fig1_noiseless_vs_theory.png", dpi=160)

# ----------------------------------------------------------------------------
# Experiment 2: noisy device. Bennett oracle vs compiled oracle, corner case.
# ----------------------------------------------------------------------------
label, x = cases[2]
rd = room.sense_after(x, "")
M = 1
fig, ax = plt.subplots(figsize=(7, 4.2))
ax.plot(kk, [theory_success(16, M, k) for k in kk], color="gray", lw=1, label="theory (noiseless)")
ax.axhline(M / 16, ls=":", color="gray", label="random guess (M/N)")
for compiled, col, name in [(True, "#c0392b", "compiled oracle"), (False, "#7d3c98", "Bennett oracle")]:
    meas = []
    for k in KS:
        p, twoq = success_rate(room, rd, "", k, noisy, compiled, opt=3, target=device)
        meas.append(p)
        rows.append(["FakeTorino", "compiled" if compiled else "bennett", label, M, k,
                     theory_success(16, M, k), p, twoq])
    ax.plot(KS, meas, "o-", color=col, label=name)
ax.set(xlabel="Grover iterations k", ylabel="P(robot found)",
       title="With FakeTorino noise: corner robot (M = 1 of 16)", ylim=(0, 1.05))
ax.legend(frameon=False)
fig.tight_layout(); fig.savefig("fig2_noise.png", dpi=160)

# ----------------------------------------------------------------------------
# Experiment 3: one move to break a tie, on the town map.
# ----------------------------------------------------------------------------
start = DEMO_MAP.index(1, 0)              # reads the same as (3, 0): ambiguous
one = DEMO_MAP.sense_after(start, "")
two = DEMO_MAP.sense_after(start, "E")
loc_rows = []
for moves, rd in [("", one), ("E", two)]:
    M = len(DEMO_MAP.candidates(rd, moves))
    k = best_k(16, M)
    qc = grover_circuit(DEMO_MAP, rd, moves, k=k)
    counts = ideal.run(transpile(qc, ideal), shots=SHOTS, seed_simulator=3).result().get_counts()
    loc_rows.append((moves or "none", M, k, counts))
    rows.append(["noiseless", "bennett", f"town map, moves={moves or 'none'}", M, k,
                 theory_success(16, M, k),
                 sum(v for b, v in counts.items() if int(b, 2) in DEMO_MAP.candidates(rd, moves)) / SHOTS, ""])

fig, axes = plt.subplots(1, 2, figsize=(9, 4.6))
for ax, (moves, M, k, counts) in zip(axes, loc_rows):
    for r in range(4):
        for c in range(4):
            p = counts.get(format(DEMO_MAP.index(r, c), "04b"), 0) / SHOTS
            ax.add_patch(Rectangle((c, 3 - r), 1, 1, color=plt.cm.Blues(p), ec="#ddd"))
            ax.text(c + .5, 3 - r + .5, f"{p:.2f}", ha="center", va="center",
                    color="white" if p > .5 else "#333", fontsize=9)
            w = DEMO_MAP.walls[(r, c)]
            y0, x0 = 3 - r, c
            if w[0]: ax.plot([x0, x0 + 1], [y0 + 1, y0 + 1], "k", lw=3)
            if w[1]: ax.plot([x0 + 1, x0 + 1], [y0, y0 + 1], "k", lw=3)
            if w[2]: ax.plot([x0, x0 + 1], [y0, y0], "k", lw=3)
            if w[3]: ax.plot([x0, x0], [y0, y0 + 1], "k", lw=3)
    tr, tc = DEMO_MAP.cell(start)
    ax.plot(tc + .5, 3 - tr + .82, "r*", ms=12)
    ax.set(xlim=(0, 4), ylim=(0, 4), aspect="equal", xticks=[], yticks=[],
           title=f"Moves: {moves}  ·  M = {M}, k = {k}")
fig.suptitle("Where the robot might be (P of measuring each cell; ★ = true start)")
fig.tight_layout(); fig.savefig("fig3_town_localization.png", dpi=160)

with open("results.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["sim", "oracle", "case", "M", "k", "theory", "measured", "two_qubit_gates"])
    w.writerows(rows)
for r in rows:
    print(r)
