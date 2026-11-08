# Finding a Lost Robot with Grover's Search

A robot wakes up somewhere on a known map. It can only sense which sides of its
cell have walls. Grover's search finds the cells that match what it senses, and
one move is enough to tell apart two cells that look the same.

## Run it

```bash
pip install qiskit qiskit-aer qiskit-ibm-runtime matplotlib
python run_experiments.py          # ~30 s; add --fast for fewer shots
```

Outputs: `fig1_noiseless_vs_theory.png`, `fig2_noise.png`,
`fig3_town_localization.png`, `results.csv`.

## How it works

| Piece | What it does |
|---|---|
| Position register (4 qubits) | One basis state per cell of the 4×4 map |
| Oracle (Bennett) | **Compute** the wall bits of cell x into ancillas, **compare** with the sensor reading and flip the phase on a match, **uncompute** |
| Moves | The oracle also looks up the walls of where the robot *would* be after each move, so more readings mean fewer matching cells |
| Diffuser | Standard inversion about the mean |
| Compiled oracle | Same ±1 phases as one diagonal gate. Far cheaper, but builds the answer classically |

## Theory being tested

With M matching cells out of N = 16, after k Grover iterations

P(found) = sin²((2k+1)θ), with sin θ = √(M/N), and the best k ≈ π/(4θ) − ½.

## Results so far (4,000 shots)

| Case | M | k | Theory | Measured |
|---|---|---|---|---|
| Open room, interior | 4 | 1 | 1.000 | 1.000 |
| Open room, edge | 2 | 2 | 0.945 | 0.943 |
| Open room, corner | 1 | 3 | 0.961 | 0.960 |
| Town map, no move | 2 | 2 | 0.945 | 0.947 |
| Town map, one move east | 1 | 3 | 0.961 | 0.962 |

**With FakeTorino noise** (corner robot, M = 1):

| k | Theory | Compiled oracle | 2-qubit gates | Bennett oracle | 2-qubit gates |
|---|---|---|---|---|---|
| 1 | 0.473 | 0.390 | 35 | 0.064 | 1,303 |
| 2 | 0.908 | **0.652** | 71 | 0.059 | 2,725 |
| 3 | 0.961 | 0.606 | 107 | 0.067 | 4,150 |

Findings to explain in the report:
1. **Noise moves the best k from 3 to 2.** Each extra iteration adds signal but
   also adds gate errors; past k = 2 the errors win.
2. **The Bennett oracle drops to random guessing (1/16)** with ~1,300 two-qubit
   gates per iteration. Its cost comes from looking up every cell with
   4-controlled gates. This is the price of an oracle that never sees the answer.
3. **Ambiguity sets the difficulty.** Symmetric places (M = 4) need one
   iteration; unique places (M = 1) need three, which is also where noise hurts most.

## A cheaper honest oracle (`formula_oracle.py`)

Each wall bit is written as a compact formula of the position bits (an XOR of
AND-terms, trying every choice of negated inputs and keeping the cheapest). It
still uses only the map, never the answer, and gives exactly the same unitary as
the Bennett oracle (checked on every reading for both maps).

Corner robot, M = 1, FakeTorino noise (random guess = 0.0625):

| k | Theory | Bennett lookup | Formula oracle | Compiled (not honest) |
|---|---|---|---|---|
| 1 | 0.473 | 0.064 (1,303 2q) | 0.272 (119 2q) | 0.390 (35 2q) |
| 2 | 0.908 | 0.059 (2,725 2q) | **0.337** (250 2q) | 0.651 (71 2q) |
| 3 | 0.961 | 0.067 (4,150 2q) | 0.264 (383 2q) | 0.606 (107 2q) |

- **Open room:** each wall is one 2-input term (e.g. north wall = both row bits are 0),
  so the honest oracle needs 11× fewer gates and finds the robot 5× more often than guessing.
- **Irregular town map:** each wall needs ~7 terms, only ~3× cheaper, and noise still wins.
- **Takeaway:** the honest oracle is cheap when the building is regular. How compressible
  the map is decides whether Grover's search can work on real hardware.

## Live demo (`frontend/`)

```bash
python precompute_ui.py                          # ~10-15 min, regenerates frontend/js/qdata.js
python -m http.server 8000 --directory frontend  # then open http://localhost:8000
```

Drag Robo anywhere, right-click a square to set home, then **Sense → Find me → … → Go**.
Stage 1 rescans until Robo knows where it is; stage 2 searches the 64 three-move plans for one
that works from every possible position (via a waypoint if home is out of reach).
**Ideal / Noisy · FakeTorino** switches between exact statevector and FakeTorino-noise results,
all precomputed with Qiskit for the frontend's building. See `frontend/README.md`.

## Noise on both stages (`run_noise.py`, `fig6_noise_both_stages.png`)

FakeTorino noise model, 4,000 shots, transpiled with optimization level 3.

| | Qubits searched | Theory best k | Noisy best k | Noisy P(success) | Random guess | 2q gates / iteration |
|---|---|---|---|---|---|---|
| Stage 1 lookup (honest) | 4 | 3 | – | 0.066 | 0.063 | 1,303 |
| Stage 1 formula (honest) | 4 | 3 | 2 | **0.338** | 0.063 | 119 |
| Stage 1 compiled (not honest) | 4 | 3 | 2 | 0.651 | 0.063 | 35 |
| Stage 2 compiled (not honest) | 6 | 6 | 1–2 | 0.050 | 0.016 | 225 |

Why stage 2 degrades so much more than stage 1:
1. **Twice the iterations.** M = 1 of 64 needs k = 6; M = 1 of 16 needs k = 3.
2. **Each iteration is ~6× more expensive.** The 6-qubit diffuser alone costs 134 two-qubit
   gates on Torino (80 with all-to-all connectivity; the rest is SWAP routing), against 18 for
   the 4-qubit diffuser. The 64-entry diagonal oracle costs 90, against 18.
3. Together: ~1,500 two-qubit gates to reach the theory peak, so the signal is gone by k = 2.

Takeaway: on today's hardware the search space, not just the oracle, sets the limit.
Each extra qubit makes the diffuser's multi-controlled gate much deeper.

## Stage 2, honest: Bennett plan oracle (`stage2.py`, `run_stage2_bennett.py`, `fig7_stage2_bennett.png`)

The oracle sees only the map, the possible starts and home, never the answer. For each start it
simulates the walk on qubits: **compute** the walk, **copy** "did it end at home?" into a flag,
**uncompute** the walk. It then flips the phase when every flag is 1 and uncomputes the flags.

| Qubit-saving idea | How it shows up |
|---|---|
| 2 qubits per move | plan register = 6 qubits for 64 plans |
| Move 1 needs no position register | the start is known, so the cell after moves 1–2 is a fixed function of the plan's first 4 qubits, written straight into `pos` as Reed–Muller formulas |
| Move 3 needs no position register | we only check "does move(pos, m3) land on home?" into a flag |
| Ancilla reuse via uncompute | walk A → flag a → undo; walk B reuses the same `pos` qubits |
| In-place phase flip | CZ on the two flags (H–MCX–H in general), no extra \|−⟩ qubit |

Verified in `tests/test_stage2.py`: for every ambiguous pair of starts × 3 homes (plus single starts),
the oracle gives the same ±1 phases as the compiled oracle on all 64 plans, and every ancilla
returns to \|0⟩. Noiseless Grover with it matches sin²((2k+1)θ) to 10⁻⁹ (0.997 at k = 6).

| One oracle call | Qubits | 2q gates, all-to-all | 2q gates, FakeTorino |
|---|---|---|---|
| Compiled (not honest) | 6 | 62 | 90 |
| Bennett, reuse `pos` | 12 | 766 | 1,843 |
| Bennett, one `pos` per start | 16 | 599 | 1,521 |

**Pebble-game trade-off.** Reusing `pos` saves 4 qubits, but walk A must be recomputed to clear
its flag (it runs 4× instead of 2×). Giving each start its own register costs 4 qubits and saves
22% of the gates. Bennett's pebble game generalises this: with more steps you choose which
intermediate positions to keep and which to recompute.

**With noise** (FakeTorino, k = 1–3) the honest oracle lands on random guessing (0.014–0.021
vs 1/64 = 0.016) with ~1,900 two-qubit gates per iteration; the compiled one reaches only 0.054.
Stage 2 works in theory and in noiseless simulation, but not on today's hardware.

## Ideas to extend
- Unknown M: use quantum counting or randomized k (BBHT), since a real robot
  doesn't know how ambiguous its reading is.
- Bigger maps (8×8 = 6 qubits) and more moves; plot qubits and gates against map size.
- Run the posted course noise settings (23 Nov) through `success_rate(...)`.
- Hackathon demo: click a cell to place the robot, press "move", watch the
  probability heat map sharpen.

## References

- L. K. Grover, *A fast quantum mechanical algorithm for database search*, STOC 1996.
- M. Boyer, G. Brassard, P. Høyer, A. Tapp, *Tight bounds on quantum searching*, 1998.
- S. Thrun, W. Burgard, D. Fox, *Probabilistic Robotics*, MIT Press 2005 (ch. 7–8, robot localization).
