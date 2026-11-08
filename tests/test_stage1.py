"""
Stage 1 (Where am I?) as checks. Read each test as a claim you can make to a judge.

Run:  .venv/bin/python -m pytest -v
"""
import math

import pytest
from qiskit import transpile
from qiskit.quantum_info import Statevector

from formula_oracle import formula_oracle
from localize import (DEMO_MAP, GridMap, best_k, compiled_oracle, grover_circuit,
                      oracle, theory_success)

ROOM = GridMap()


def oracle_action(qc, n_pos=4):
    """Apply the oracle to |x>|0...0> for every cell x.

    Returns the phase it puts on each |x>, and asserts the output is exactly
    ±|x>|0...0>: same cell, ancillas back in |0> (Bennett's uncompute worked).
    """
    phases = []
    for x in range(2 ** n_pos):
        out = Statevector.from_int(x, 2 ** qc.num_qubits).evolve(qc)
        amp = out.data[x]                    # pos = low qubits, ancillas = 0  ->  index x
        assert abs(abs(amp) - 1) < 1e-9, f"cell {x}: ancillas not returned to |0>"
        phases.append(round(amp.real))
    return phases


# --- M1: theory ---------------------------------------------------------------
@pytest.mark.parametrize("N,M,k", [(16, 1, 3), (16, 2, 2), (16, 4, 1), (64, 1, 6), (64, 2, 4)])
def test_best_k(N, M, k):
    assert best_k(N, M) == k


def test_half_marked_grover_does_nothing():
    # M = N/2: θ = 45°, so every k gives sin²((2k+1)·45°) = 1/2. No better than guessing.
    assert all(abs(theory_success(16, 8, k) - 0.5) < 1e-12 for k in range(5))


# --- M2: the map, classically -------------------------------------------------
def test_open_room_symmetry():
    # In an open room only the distance to the outer walls matters:
    # 4 interior cells look alike, each edge reading has 2 cells, each corner is unique.
    interior, edge, corner = ROOM.index(1, 1), ROOM.index(0, 1), ROOM.index(0, 0)
    assert len(ROOM.candidates([ROOM.reading(interior)], "")) == 4
    assert len(ROOM.candidates([ROOM.reading(edge)], "")) == 2
    assert len(ROOM.candidates([ROOM.reading(corner)], "")) == 1


def test_walls_block_moves():
    assert ROOM.move(ROOM.index(0, 0), "N") == ROOM.index(0, 0)
    assert ROOM.move(ROOM.index(0, 0), "E") == ROOM.index(0, 1)


# --- M3: Bennett oracle = diagonal, -1 exactly on matching cells ---------------
@pytest.mark.parametrize("gmap", [ROOM, DEMO_MAP], ids=["room", "town"])
def test_lookup_oracle_marks_exactly_the_candidates(gmap):
    for x in range(16):
        rd = gmap.sense_after(x, "")
        marked = set(gmap.candidates(rd, ""))
        phases = oracle_action(oracle(gmap, rd))
        assert [i for i, p in enumerate(phases) if p == -1] == sorted(marked)


def test_oracle_with_a_move_needs_both_readings():
    start = DEMO_MAP.index(1, 0)
    rd = DEMO_MAP.sense_after(start, "E")                 # 2 readings -> 8 ancillas
    phases = oracle_action(oracle(DEMO_MAP, rd, "E"))
    assert [i for i, p in enumerate(phases) if p == -1] == [start]


# --- M5: moving breaks the tie -------------------------------------------------
def test_one_move_breaks_the_tie():
    start = DEMO_MAP.index(1, 0)
    assert len(DEMO_MAP.candidates(DEMO_MAP.sense_after(start, ""), "")) == 2
    assert DEMO_MAP.candidates(DEMO_MAP.sense_after(start, "E"), "E") == [start]


# --- M4: Grover loop matches sin²((2k+1)θ) exactly (noiseless statevector) -----
@pytest.mark.parametrize("cell", [(1, 1), (0, 1), (0, 0)], ids=["M=4", "M=2", "M=1"])
@pytest.mark.parametrize("k", range(5))
def test_grover_matches_theory(cell, k):
    x = ROOM.index(*cell)
    rd = ROOM.sense_after(x, "")
    marked = ROOM.candidates(rd, "")
    qc = grover_circuit(ROOM, rd, "", k=k).remove_final_measurements(inplace=False)
    p = Statevector(qc).probabilities(qargs=range(4))     # marginal over the position register
    assert abs(sum(p[m] for m in marked) - theory_success(16, len(marked), k)) < 1e-9


# --- M6: the formula oracle is the same unitary, with fewer gates ---------------
@pytest.mark.parametrize("gmap", [ROOM, DEMO_MAP], ids=["room", "town"])
def test_formula_oracle_equals_lookup(gmap):
    for x in range(16):
        rd = gmap.sense_after(x, "")
        assert oracle_action(formula_oracle(gmap, rd)) == oracle_action(oracle(gmap, rd))


def cx_count(qc):
    return transpile(qc, basis_gates=["cx", "u"], optimization_level=1).count_ops().get("cx", 0)


def test_gate_cost_ordering():
    rd = ROOM.sense_after(ROOM.index(0, 0), "")
    lookup, formula, compiled = (cx_count(f(ROOM, rd)) for f in (oracle, formula_oracle, compiled_oracle))
    print(f"\n  CX per oracle call  lookup={lookup}  formula={formula}  compiled={compiled}")
    assert lookup > formula > compiled
