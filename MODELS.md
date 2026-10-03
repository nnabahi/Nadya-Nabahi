# nadya's models

A clean list of the models in nadya's Programming folder, written by Claude on
2026-10-03 after reading the folder. Nothing in the folder was changed.
`SIMS.md` is still the master idea list. This file only sorts what's actually
there.

File paths are relative to `Programming/Python/` unless they start with another
folder name. Each family names its main file first.

Coursework, language practice, media players, Unity/C#/C++, maps and data homework,
and the Numbers/ plot images are left out.

---

## 1. Random packings: your favorites, build these first

### 1a. Random disk packing in the unit disk (your "gasket" model)
Centers land at random in the unit disk, at a distance from the middle set by a
parameter **s**. One value of s gives uniform spread. A center that falls inside an
earlier disk is thrown away. Otherwise the new disk grows until it touches the
boundary or an earlier disk.

**What you measure:** each disk's parent, generation and degree (children), how
fast the first disk's degree grows (a power law in n), each disk's "market share"
(the area closer to it than to anything else), when the origin gets covered, E[R_k]
as s changes, and the Hausdorff dimension of what's left uncovered, by box counting.

This is the most developed body of work in the folder.
- Main: `randpacking.py` (650 lines: sim, generations, degrees, Hausdorff dimension, sweep over s). `randintagain.py` is a near-copy.
- Degrees and growth rates: `randompackinggptagain.py`, `circlingpackingdegrees.py`, `circlepacking.py` (children of D_k)
- Market share and "safe area": `randpackagain-nn.py`, `tempCodeRunnerFile-nn.py`, `FKEJSLFKES.py`, `ksmksmksmskmskmsksmskm.py` (picture: `safe_area.png`)
- Radii and covering: `radiusexpectation`, `randpackinghist.py`, `icouldntdobetter.py` (time to cover the origin)
- Early versions: `circlepacking2ndit.py`, `randpacksolo`, `randpackingbenchmark.py`, `InteractiveSetups/StochasticCirclePacking.js`, `InteractiveSetups/stochasticpackinggemini/`
- 1D version: `random1dpacking`, `1dpacking.py` (distribution of R_2)

### 1b. Fixed tileset packing a grid
You described the version you want like this. Tiles from a fixed set fill a grid,
with gaps allowed but maximal: any tile that fits is placed. It's sampled uniformly
by MCMC: pick a region, delete the tiles that touch it, and put back a uniformly
random valid packing of the hole.

The folder has the two halves of this but not one file that does both:
- **The MCMC, for exact tilings (no gaps):** `RANDOMTILINGS/tiling_mcmc.py`. It picks a connected patch of about k tiles (2x2 and 3x3 squares), erases it, finds every retiling of the hole with Knuth's Algorithm X (Knuth, "Dancing Links", arXiv:cs/0011047), and picks one uniformly. Solved hole shapes are cached up to rotation and reflection. Also: `tiling_animation.py` (the GIF), `testing.py` (timing), `canibetiled.py` (which L×L squares can be tiled by 2x2 and 3x3), older drafts `drawpolygon.py`, `main.py`, `Board.py`, `ComputeTiling.py`, and `gemini/`.
- **Maximal packings with gaps:** `randpackagain.py`. `FastRSA_2D` drops p×q rectangles at random on an m×n grid until no more fit (random sequential adsorption), then draws a heatmap and checks symmetry. Pictures: `rsa_heatmap.png`, `rsa_final_grid.png`.
- **Worth checking when we build it:** `tiling_mcmc.py` chooses the patch by walking over the *current* tiles, so the patch probabilities depend on the tiling. Uniformity then needs an extra check. Your description picks a region of space first, which makes the move symmetric, and re-sampling a region uniformly given the rest is the standard heat-bath move that keeps the uniform distribution (Levin, Peres & Wilmer, *Markov Chains and Mixing Times*, 2nd ed. 2017, §3.3).
- Older: `randomtilingpython.py` (random dominoes), `InteractiveSetups/RandomTilings.js`, `randtiling.py`

### 1c. Growing circles in a square (geology grains)
Circles grow one at a time in the unit square until they touch a neighbor or the
edge (max radius 0.1). The square is then squashed into ellipses (aspect ratios 1:1,
2:1 and 3:1) and clipped to a sub-box to see how clipping biases the
diameter-perimeter slope. Your write-up found 0.978, 0.982 and 0.984 instead of 1.
- `gptcircleclipping.py`, `GeologyProgramming/Simulation Write Up.pdf`, `growing_circles_*.png`
- Rough grains: `randombrownianbridgeellipsecut.py` (a Brownian-bridge "rough ellipse", cut and measured)
- `RandomStuff/Poisson Circles.py`: Poisson points in waves, circles growing to their nearest neighbor
- The old site's general version: `js/sims/tilepacking.js` at commit `8e68754`

### 1d. Square packing from a random planar map
A random triangulation becomes a packing of a rectangle by squares, one square per
edge, built from a harmonic function (Brooks, Smith, Stone & Tutte, *Duke Math. J.*
7 (1940) 312). File: `randweightedtreegrowth.py`. Picture: `square_packing.png`.

---

## 2. Random fragmentation (the 1D cousin of the packings)
An interval is picked with probability proportional to length^s and split at a
uniform point. You sweep s, including negative values, looking for a critical point.
- `randintervalbs.py`, `randstickbreaklimit.py`, `randstickbreakingeverywhere`, `randomintsplit`, `randstickdist.py`

## 3. Random mountain / block stacking
Drop a block uniformly on the current base or one site past either end. The base
grows only when a block lands past an end. You compared the height correlations
with a bulk formula, and there's a d-dimensional version with an exact sampler and
a fast sampler built on first-passage percolation.
- `RandBlockStack.py`, `randmountain.py`, `randonesidedmountain.py`, `claudeakadeleteme.py` (the d-dim samplers and tests)
- Old site: `js/sims/blockgrowth.js`

## 4. Competing random walks (already being built)
Two walkers race. Each site is colored by whoever reaches it first, on a cycle or
an L×L torus. Your newest code computes E|interface| exactly with Dirichlet problems
instead of only simulating.
- `RandomColoredWalkFinal.py` (553 lines), `RandomColoredWalkFinalLevelSets.py`, `RandomColoredWalk_Companion.py`, `RandomColoredWalkOnCycle.py`, `competingwalk1d.py`, `competingwalks1dclaude.py`, `RandomWalkColoring.py` (1D interface lengths); data in `exact/`, `data/`, `interface_*.csv`
- Old site: `js/sims/walkcoloring.js`

## 5. Random functions with random roots (your Desmos D1)
f(x) = Π(1 − x/R_k), where the roots R_k are a random walk with positive steps
(steps in {2, 3}, or Uniform(1, 1+δ)). You look at the areas of the lobes between
roots and the heights of the bumps.
- `randfuncsagain.py`, `randomsinfuncs.py`, `matrixcalculations.py` (critical values of log f), `randomfunction`
- Related: `randominfinitepolynomial.py`, `randomsinwave`, `randombrowniansin.py`, `randsinish.py`, `randgausprod.py`

## 6. Random digits and number expansions (your LaTeX notes)
- **Random base-B digits with weights p_k** (X = Σ D_i B^(−i)): `RandomBaseBNumbers.py`, `InteractiveSetups/DigitFun.js`, notes `Numbers/All My Stuff.tex` ("Weird Number Line") and `Numbers/document.tex` ("Expectation"), pictures `RandomStuff/RandDigitsBase*.png`. Also Desmos D5, D7, D11, D16.
- **Flipping a digit:** `Numbers/FracFromSet.tex` and `Numbers/BaseBaverage.tex` ("Change in Magnitude of Numbers in Base b"), `BaseFun.py` (digit maps and a bifurcation diagram)
- **Continued fractions:** `ContFracWithFunc.py`, `FractionExpansion.py`, `Numbers/BiInfiniteAverage.tex` ("Infinite String Average")
- **Fibonacci graph:** `fib.py`, `Numbers/FibGraph.tex` (node values are Fibonacci numbers), `InteractiveSetups/periodicfibonnaci.js`, `fib.txt`
- **Probability on sets:** `Numbers/herewegoagain.tex`
- Smaller: `Ulam.py`, `primeconcat.py`, `subsetfrac.py`, `AllSubsets.py`, `numswithweights.py`

## 7. Walks on odd spaces
- Walk on a 3D dyadic fractal set S_n (return times, spread): `itroiajfeijg.py`
- Walks on dyadic numbers: `hmmmdyadics.py`, pictures in `DyadicWalk/`
- "Weird number line" (a walk on an interpolated sequence): `FuckedUpNumberLine.py`, `Numbers/NumberlineImplosion.tex`
- Sierpiński gasket paths: `SierpGask/NadyaPlot.py`

## 8. Random trees and graphs
- Uniform plane trees from random Dyck paths (cycle lemma), vertex degrees: `randcatalanwalk`
- Path lengths in a uniform random tree vs the Rayleigh limit (Meir & Moon, *J. Combin. Theory* 8 (1970) 99): `randtrees.py`
- Tree plus k extra edges, counting shortest paths: `randsmallworldtrees.py`
- Bounded-degree random trees: `randtreedegd`
- A graph that randomly gains and loses nodes and edges, with spectrum snapshots: `randgraphwalkongraph`
- "Cities" (vertices pass value along edges, looking for stable colorings): `CityFun.py`, `Numbers/CityFun.tex`

## 9. Random iterations
- Two points re-drawn uniformly between each other until they meet: `randomconvergence.py`, `randomconvergence3starting.py`, `randomconvergence2d` (triangle version)
- Random Fibonacci with random coefficients: `randomfib.py`
- Random rearrangements of the alternating harmonic series: `randNshuffling.py`
- Growth and decay hitting times: `randomgrowthdecay.py`
- Iterated function systems: `IteratedFunctionSystem01.py`, `IteratedFunctionSystem02.py`
- Coin-toss convergence: `quickndirtycointossconvergence.py`

## 10. Random matrix products (your Desmos D12, D13)
- `randmatAB.py` (eigenvalues of random products of A and B), `randmatprod.py`, `randmatcltadd.py`, `randmatcltmul.py`, `randmatcltmultraj.py`, `randmatcrapbinomial.py`, `randmatcrappoisson.py`, `randstochasticmat.py`, `randstochasticmat2`, `GPTrandmatcltadd.py`
- Note: `randomfractalpercolation.py` actually perturbs stochastic matrices, so it belongs here, not with fractal percolation.

## 11. Sandpiles and other grid rules
- Sandpiles: `sandpiles`, `randsandexploration.py`, `InteractiveSetups/Sandpiles.js`, `HTML + JavaScript/Sandpiles/` (old site: `js/sims/sandpiles.js`)
- Water flowing over a random landscape: `water`, pictures in `waterImages/`
- Growing landscape: `HTML + JavaScript/Landscape/Landscape.js`
- Antisocial cells: `AntisocialCells/AntisocialCells.py`
- 1D automata: `InteractiveSetups/Basic1DAutomata.js`, `automata graph.py` (old site: `js/sims/automata.js`)
- Fractal percolation (animation): `RandomStuff/fracperc.py`

## 12. Small toys
- Billiards: particles bouncing in a square, tracking when three line up: `randbilliards.py`
- Random Go (rules only, no code yet): `randomGO.py`
- Toothpick sequence: `InteractiveSetups/GullwingToothpick.js`
- Sequence averaging pictures: `SeqAvg`, `SeqAvept2`, `HTML + JavaScript/JavaScript/ProbabilitySequence.js`
- Partitions drawing: `Partitions.py`
- Lattice-path 3D plot: `lemme3dthis` (old site: `js/sims/pathcount.js`)
- One-step Markov chain stationary vector: `DURRETT.py`

---

## Suggested build order
Your favorites come first, then whatever reuses their code.

1. **Random disk packing in the unit disk (1a).** Your biggest body of work, with clear statistics for the lower-left panel: degrees, generations, coverage and dimension.
2. **Fixed tileset packing a grid (1b).** Your favorite. It combines `tiling_mcmc.py` with the maximal-with-gaps rule from `randpackagain.py`, and runs on the site's grid tool.
3. **Growing circles in a square (1c),** the general version you already had, plus the clipping study.
4. **Random fragmentation (2).** Small, and the same "s" idea as 1a.
5. **Random mountain (3).**
6. **Random functions with random roots (5).**
7. **Random digits (6).**

Competing walks (4) and connected coloring are already being built in their own threads.
