"""
Stage 2 (How do I get home?) as checks.
"""
import pytest
from qiskit.quantum_info import Statevector

from quantum.stage1 import DEMO_MAP, best_k, theory_success
from quantum.stage2 import (DEMO_HOME, DEMO_STARTS, N_PLANS, compiled_plan_oracle, decode, encode,
                    good_plans, plan_search_circuit, plan_works, walk)


def test_encoding_round_trip():
    assert decode(0) == "NNN"
    assert decode(0b110001) == "ENW"                 # move 1 = lowest 2 bits
    assert all(encode(decode(p)) == p for p in range(N_PLANS))


def test_both_starts_read_the_same():
    # This is why stage 2 is needed: stage 1 can't tell them apart without moving.
    a, b = DEMO_STARTS
    assert DEMO_MAP.reading(a) == DEMO_MAP.reading(b)


def test_one_plan_works_from_both_starts():
    assert [decode(p) for p in good_plans(DEMO_MAP, DEMO_STARTS, DEMO_HOME)] == ["ENN"]


def test_obvious_plan_fails():
    # From A, home is one step east. But "go east" from B ends somewhere else.
    a, b = DEMO_STARTS
    assert DEMO_MAP.move(a, "E") == DEMO_HOME
    assert DEMO_MAP.move(b, "E") != DEMO_HOME
    # Many plans work from A alone; requiring BOTH starts cuts M down to 1.
    from_a = [p for p in range(N_PLANS) if plan_works(DEMO_MAP, p, [a], DEMO_HOME)]
    assert len(from_a) > 1


def test_walls_line_up_the_walks():
    a, b = DEMO_STARTS
    plan = encode("ENN")
    cells = lambda path: [DEMO_MAP.cell(x) for x in path]
    assert cells(walk(DEMO_MAP, a, plan)) == [(1, 0), (1, 1), (1, 1), (1, 1)]   # bumps the N wall twice
    assert cells(walk(DEMO_MAP, b, plan)) == [(3, 0), (3, 1), (2, 1), (1, 1)]


def test_plan_oracle_is_diagonal_on_good_plans():
    good = set(good_plans(DEMO_MAP, DEMO_STARTS, DEMO_HOME))
    o = compiled_plan_oracle(DEMO_MAP, DEMO_STARTS, DEMO_HOME)
    for p in range(N_PLANS):
        amp = Statevector.from_int(p, N_PLANS).evolve(o).data[p]
        assert abs(amp - (-1 if p in good else 1)) < 1e-9


@pytest.mark.parametrize("k", range(9))
def test_plan_search_matches_theory(k):
    good = good_plans(DEMO_MAP, DEMO_STARTS, DEMO_HOME)
    p = Statevector(plan_search_circuit(DEMO_MAP, DEMO_STARTS, DEMO_HOME, k, measure=False)).probabilities()
    assert abs(p[good].sum() - theory_success(N_PLANS, len(good), k)) < 1e-9


def test_best_k_for_stage2():
    # M = 1 of 64 needs 6 iterations (stage 1's corner case needs 3): deeper circuit, more noise.
    assert best_k(N_PLANS, 1) == 6


# --- M10: the honest Bennett oracle --------------------------------------------
from quantum.stage2 import bennett_plan_oracle

# Every pair of cells that stage 1 can't tell apart, plus single known starts, to several homes.
_PAIRS = [(a, b) for a in range(16) for b in range(a + 1, 16) if DEMO_MAP.reading(a) == DEMO_MAP.reading(b)]
_CASES = [(pair, h) for pair in _PAIRS for h in (DEMO_HOME, 0, 10)] + [((s,), DEMO_HOME) for s in range(0, 16, 3)]


@pytest.mark.parametrize("starts,home", _CASES)
def test_bennett_oracle_matches_compiled_and_cleans_up(starts, home):
    o = bennett_plan_oracle(DEMO_MAP, starts, home)
    assert o.num_qubits == 6 + 4 + len(starts)              # plan + pos + one flag per start
    good = set(good_plans(DEMO_MAP, starts, home))
    for p in range(N_PLANS):
        out = Statevector.from_int(p, 2 ** o.num_qubits).evolve(o)
        amp = out.data[p]                                   # pos and flags must be back at |0>
        assert abs(amp - (-1 if p in good else 1)) < 1e-9, f"plan {decode(p)}"


@pytest.mark.parametrize("k", [1, 3, 6])
def test_honest_plan_search_matches_theory(k):
    good = good_plans(DEMO_MAP, DEMO_STARTS, DEMO_HOME)
    qc = plan_search_circuit(DEMO_MAP, DEMO_STARTS, DEMO_HOME, k, measure=False, honest=True)
    p = Statevector(qc).probabilities(qargs=range(6))       # marginal over the plan register
    assert abs(sum(p[g] for g in good) - theory_success(N_PLANS, len(good), k)) < 1e-9


def test_no_reuse_variant_is_the_same_unitary():
    # 16 qubits (one pos register per start): fewer gates, same oracle.
    o = bennett_plan_oracle(DEMO_MAP, DEMO_STARTS, DEMO_HOME, reuse_pos=False)
    assert o.num_qubits == 16
    good = set(good_plans(DEMO_MAP, DEMO_STARTS, DEMO_HOME))
    for p in range(N_PLANS):
        amp = Statevector.from_int(p, 2 ** 16).evolve(o).data[p]
        assert abs(amp - (-1 if p in good else 1)) < 1e-9
