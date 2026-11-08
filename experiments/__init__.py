"""Scripts that produce every figure and data file in results/. Run from the project root:
    python -m experiments.<name>
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
RESULTS.mkdir(exist_ok=True)


def draw_map(ax, gmap, fill=lambda x: "#e6f2fb", label=lambda x: "", label_color=lambda x: "black"):
    """Draw a grid map on a matplotlib axis: cell fills, labels and thick walls."""
    import matplotlib.pyplot as plt
    R = gmap.rows
    for x in range(gmap.n_cells):
        (r, c), y0 = gmap.cell(x), R - 1 - gmap.cell(x)[0]
        ax.add_patch(plt.Rectangle((c, y0), 1, 1, color=fill(x), ec="#ccc"))
        if label(x):
            ax.text(c + .5, y0 + .5, label(x), ha="center", va="center", fontsize=9, color=label_color(x))
        n, e, s, w = gmap.walls[(r, c)]
        if n: ax.plot([c, c + 1], [y0 + 1, y0 + 1], "k", lw=3)
        if e: ax.plot([c + 1, c + 1], [y0, y0 + 1], "k", lw=3)
        if s: ax.plot([c, c + 1], [y0, y0], "k", lw=3)
        if w: ax.plot([c, c], [y0, y0 + 1], "k", lw=3)
    ax.set(xlim=(0, gmap.cols), ylim=(0, R), aspect="equal", xticks=[], yticks=[])
