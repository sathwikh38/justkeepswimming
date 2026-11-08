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
