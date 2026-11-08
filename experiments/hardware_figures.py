"""
Figures from the IBM hardware run (called by experiments.ibm_hardware, or on its own):

    python -m experiments.hardware_figures            # from results/hardware.json
    python -m experiments.hardware_figures rehearsal  # from results/hardware_rehearsal.json

  fig7  success vs k on hardware, against theory and random guessing (M = 1, 2, 4)
  fig8  every one of the 16 cells as the answer: measured success at k = 2
  fig9  same number of oracle queries: quantum (hardware) vs the best classical strategy
"""
import json
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from experiments import RESULTS
from quantum.stage1 import theory_success


def _rows(res, group, mode="plain"):
    return sorted([r for r in res["rows"] if r["group"] == group and r["mode"] == mode], key=lambda r: r["k"])


def _err(rows):
    return [[r["success"] - r["ci95"][0] for r in rows], [r["ci95"][1] - r["success"] for r in rows]]


def figures(res, prefix=""):
    tag = f"{res['backend']} · {res['shots']} shots/circuit"
    # ---- fig7: the rotation, measured ----
    fig, ax = plt.subplots(figsize=(7.5, 4.4))
    kk = [i / 20 for i in range(81)]
    for M, col in [(1, "#3a9d5d"), (2, "#e08a1e"), (4, "#2a7fb8")]:
        ax.plot(kk, [theory_success(16, M, k) for k in kk], color=col, lw=1, alpha=.45)
        rows = _rows(res, f"curve_M{M}")
        ax.errorbar([r["k"] for r in rows], [r["success"] for r in rows], yerr=_err(rows), fmt="o-", color=col,
                    capsize=3, label=f"M = {M} of 16 (random {M / 16:.3f})")
        sup = _rows(res, f"curve_M{M}", "suppressed")
        if sup:
            ax.errorbar([r["k"] for r in sup], [r["success"] for r in sup], yerr=_err(sup), fmt="s--", color=col,
                        mfc="white", capsize=3, label=f"M = {M}, with DD + twirling")
    ax.set(xlabel="Grover iterations k (oracle calls)", ylabel="P(found)", ylim=(0, 1.05),
           title=f"Grover's search on {res['backend']}: measured (dots, 95% CI) vs theory (lines)")
    ax.legend(frameon=False, fontsize=8)
    fig.text(0.99, 0.01, tag, ha="right", fontsize=7, color="gray")
    fig.tight_layout(); fig.savefig(RESULTS / f"{prefix}fig7_hardware_vs_theory.png", dpi=160)

    # ---- fig8: every possible answer ----
    tg = sorted([r for r in res["rows"] if r["group"] == "targets"], key=lambda r: int(r["name"].split("_")[1]))
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    ax.bar(range(16), [r["success"] for r in tg], yerr=_err(tg), color="#c2410c", capsize=2)
    ax.axhline(1 / 16, ls=":", color="gray", label="random guess (1/16)")
    ax.axhline(theory_success(16, 1, 2), ls="--", color="#3a9d5d", lw=1, label="noiseless theory (k = 2)")
    ax.set(xticks=range(16), xticklabels=["ABCD"[x % 4] + str(x // 4 + 1) for x in range(16)], ylim=(0, 1),
           xlabel="the hidden answer (cell)", ylabel="P(found) at k = 2",
           title="Every one of the 16 cells as the answer, on hardware")
    ax.legend(frameon=False, fontsize=8, loc="upper right")
    fig.text(0.99, 0.01, tag, ha="right", fontsize=7, color="gray")
    fig.tight_layout(); fig.savefig(RESULTS / f"{prefix}fig8_hardware_all_targets.png", dpi=160)

    # ---- fig9: same number of oracle queries ----
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, group, N, title in [(axes[0], "curve_M1", 16, "Stage 1: 1 cell of 16"),
                                (axes[1], "plan_town", 64, "Stage 2: 1 plan of 64")]:
        rows = [r for r in _rows(res, group) if r["k"] > 0]
        ks = [r["k"] for r in rows]
        w = 0.38
        ax.bar([k - w / 2 for k in ks], [r["classical_same_queries"] for r in rows], w, color="#9aa3ab",
               label="classical, best possible with k checks")
        ax.bar([k + w / 2 for k in ks], [r["success"] for r in rows], w, yerr=_err(rows), color="#c2410c",
               capsize=3, label=f"quantum, measured on {res['backend']}")
        ax.set(xticks=ks, xlabel="oracle queries k", ylabel="P(right answer)", ylim=(0, 1), title=title)
        ax.legend(frameon=False, fontsize=8)
    fig.suptitle("Same number of questions to the oracle: who is right more often?")
    fig.text(0.99, 0.01, tag, ha="right", fontsize=7, color="gray")
    fig.tight_layout(); fig.savefig(RESULTS / f"{prefix}fig9_hardware_same_queries.png", dpi=160)
    print(f"wrote {prefix}fig7/8/9 to {RESULTS}")


if __name__ == "__main__":
    reh = len(sys.argv) > 1 and sys.argv[1] == "rehearsal"
    figures(json.load(open(RESULTS / ("hardware_rehearsal.json" if reh else "hardware.json"))), prefix="rehearsal_" if reh else "")
