"""
Stage 2 experiments (noiseless): Grover over 64 three-move plans.

    python -m experiments.stage2_noiseless     # ~10 s; writes results/fig3_*, results/fig4_*, results/stage2.json

Two cases on the town map:
  * demo:   starts (1,0),(3,0)  home (1,1)  -> M = 1 good plan
  * second: starts (0,2),(1,1)  home (0,0)  -> M = 2 good plans
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from qiskit import transpile
from qiskit_aer import AerSimulator

import json

from experiments import RESULTS, draw_map
from quantum.stage1 import DEMO_MAP as G, best_k, theory_success
from quantum.stage2 import DEMO_HOME, DEMO_STARTS, N_PLANS, decode, good_plans, plan_search_circuit, walk

SHOTS = 4000
sim = AerSimulator()
cases = [("demo", DEMO_STARTS, DEMO_HOME, "#2a7fb8"),
         ("second", (G.index(0, 2), G.index(1, 1)), G.index(0, 0), "#e08a1e")]


def run(starts, home, k):
    qc = plan_search_circuit(G, starts, home, k)
    return sim.run(transpile(qc, sim), shots=SHOTS, seed_simulator=5).result().get_counts()


rows = []

# --- fig3: measured vs sin²((2k+1)θ), N = 64 ----------------------------------
fig, ax = plt.subplots(figsize=(7, 4.2))
KS = range(9)
kk = [i / 20 for i in range(20 * 8 + 1)]
for name, starts, home, col in cases:
    good = good_plans(G, starts, home)
    M = len(good)
    meas = [sum(v for b, v in run(starts, home, k).items() if int(b, 2) in good) / SHOTS for k in KS]
    ax.plot(kk, [theory_success(N_PLANS, M, k) for k in kk], color=col, lw=1, alpha=.6)
    ax.plot(KS, meas, "o", color=col,
            label=f"{name}: M = {M} ({', '.join(map(decode, good))}), best k = {best_k(N_PLANS, M)}")
    rows += [dict(case=name, M=M, k=k, theory=theory_success(N_PLANS, M, k), measured=p) for k, p in zip(KS, meas)]
    for k, p in zip(KS, meas):
        print(f"{name:6s} M={M} k={k}  theory={theory_success(N_PLANS, M, k):.3f}  measured={p:.3f}")
ax.set(xlabel="Grover iterations k", ylabel="P(plan works from every start)", ylim=(0, 1.05),
       title="Stage 2, noiseless: measured (dots) vs sin²((2k+1)θ), N = 64")
ax.legend(frameon=False, fontsize=9)
fig.tight_layout(); fig.savefig(RESULTS / "fig3_stage2_noiseless_vs_theory.png", dpi=160)

# --- fig4: decode the top result and draw both walks ---------------------------
counts = run(DEMO_STARTS, DEMO_HOME, best_k(N_PLANS, 1))
top = int(max(counts, key=counts.get), 2)
print(f"\nTop plan: {decode(top)}  ({counts[format(top, '06b')] / SHOTS:.1%} of shots)")

fig, ax = plt.subplots(figsize=(4.8, 5))
draw_map(ax, G, label=lambda x: "HOME" if x == DEMO_HOME else "")
for s, col, off in [(DEMO_STARTS[0], "#c0392b", -.12), (DEMO_STARTS[1], "#3a9d5d", .12)]:
    path = [G.cell(x) for x in walk(G, s, top)]
    xs = [c + .5 + off for r, c in path]; ys = [3 - r + .5 + off for r, c in path]
    ax.plot(xs, ys, "-o", color=col, lw=2, ms=5, label=f"start {path[0]}")
ax.set_title(f"Grover's plan '{decode(top)}' from both starts")
ax.legend(loc="upper center", bbox_to_anchor=(.5, -.02), ncol=2, frameon=False, fontsize=9)
fig.tight_layout(); fig.savefig(RESULTS / "fig4_stage2_walks.png", dpi=160)
json.dump(dict(shots=SHOTS, top_plan=decode(top), rows=rows), open(RESULTS / "stage2.json", "w"), indent=1)
