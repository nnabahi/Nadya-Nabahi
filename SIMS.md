# Simulation pipeline

A running list of candidate simulations, sorted into the categories that
will show up as sidebar groups on the site. This is the "sorting" tool —
the messy Python research folder itself is left alone; nothing there gets
renamed or moved. A script only "counts" once it's deliberately promoted
into this list and, eventually, into `js/sims/`.

**Status key:** `live` (on the site) · `candidate` (worth building) ·
`skip` (scratch/one-off, not sim-worthy)

## Cellular automata & discrete dynamics
- **1D Cellular Automata** — `live` — `js/sims/automata.js`
- **Abelian Sandpile** — `live` — `js/sims/sandpiles.js`
- Digit-rewriting rules (`DigitFun.py`, `BaseFun.py`) — `candidate`

## Random walks & stochastic processes
- **Random Walk Coloring** (generalized `RandomColoredWalk*.py`/`RandomColoredWalkOnLTaurus*.py`: two positionable walkers on a 1D/2D torus of side L, first-arrival coloring) — `live` — `js/sims/walkcoloring.js`
- Competing walks on a line (`competingwalk1d.py`, `competingwalks1dclaude.py`) — `candidate`
- Dyadic walk (`DyadicWalk/`) — `candidate`
- Random bridges / mountains (`randombrownianbridgeellipsecut.py`, `randmountain.py`, `randonesidedmountain.py`) — `candidate`
- Coin-toss convergence (`quickndirtycointossconvergence.py`) — `candidate`, good simple teaching example

## Random matrices & products
- Matrix products (`randmatAB.py`, `randmatprod.py`, `randmatcltadd.py`, `randmatcltmul.py`) — `candidate`
- Random stochastic matrices (`randstochasticmat.py`) — `candidate`

## Packing & tilings
- **Random Sequential Tile Packing** (generalized `circlepacking.py`/`circlingpackingdegrees.py`/`growing_circles_*`: user-defined domain S and tile shape T via Desmos-style set-builder predicates, user-defined density f for the point sequence C_n, each tile grown to the sup radius that keeps it inside S minus the tiles already placed; numerical method: T's boundary precomputed as a radial function, inverse-transform sampling for C_n from f/∫_S f, binary search for the critical radius) — `live` — `js/sims/tilepacking.js`
- Random tilings (`RANDOMTILINGS/tiling_mcmc.py`, `tiling_animation.py`, old `RandomTilings.js`) — `candidate`
- Random billiards / clipping (`randbilliards.py`, `gptcircleclipping.py`) — `candidate`

## Growth & percolation
- **Gradient Percolation** (ported from a user-supplied standalone prototype `gradient-percolation.html`; user-defined density f(x,y), largest-cluster interface tracing) — `live` — `js/sims/gradientpercolation.js`
- **Random Block Growth** (generalized `RandBlockStack.py`, arbitrary d and user-designed tile T) — `live` — `js/sims/blockgrowth.js`
- Growing circles / interface tracking (`growing_circles_analysis*.png`, `interface_displacement_data.csv`) — `candidate`
- Fractal percolation (`randomfractalpercolation.py`, `fracperc.py`) — `candidate`
- Antisocial cells (`AntisocialCells/AntisocialCells.py`) — `candidate`
- Durrett-style growth model (`DURRETT.py`) — `candidate`

## Trees, graphs & combinatorics
- **Random Connected Coloring** (exact-target uniform sampling of L×L, N-color colorings with connected color classes, via a ReCom Markov chain: merge two adjacent colors, cut a uniform random spanning tree of the pair via Wilson's algorithm, accept/reject with a Metropolis–Hastings ratio built from Kirchhoff's Matrix-Tree Theorem; starts from N compact blocks rather than stripes, since a thin-stripe start makes the acceptance ratio reject almost everything) — `live` — `js/sims/connectedcoloring.js`
- **Lattice Path Counting** (new: f(x,y) = X(x,y)f(x-1,y) + Y(x,y)f(x,y-1), where X(i,j) and Y(i,j) are both typed Desmos-style formulas — piecewise, mod, list/indexing, discretedist(v,w).random() for a value random-but-fixed per column via d[j]; log-space heatmap + slice-vs-Gaussian-fit view) — `live` — `js/sims/pathcount.js`
- Random trees (`randtrees.py`, `randsmallworldtrees.py`) — `candidate`
- Partitions (`Partitions.py`) — `candidate`
- Graph explorations (`Graph/FirstGraphs.py`) — `candidate`, currently thin

## Number theory & digit expansions
- Continued/base-B fraction expansions (`FractionExpansion.py`, `ContFracWithFunc.py`, `RandomBaseBNumbers.py`) — `candidate`
- Periodic-rule Fibonacci-like sequences (`periodicfibonnaci.js`, `fib.py`, `fib.txt`) — `candidate`
- Ulam sequence (`Ulam.py`) — `candidate`

## Not going in (scratch, one-offs, coursework)
Anything matching loose plot exports (`*.csv`/`*.jpg` pairs with names like
`-3i7n-1`, `wtfisthis`, `cringeandgay`), the CUNY/NYC data-viz homework
(`CollisionsMap.py`, `ParkingTickets.py`, `NYCMap.py`, etc.), turtle-graphics
exercises, and basic language-learning scripts (`forloops.py`,
`ifstuff.py`, ...) — these were teaching/practice artifacts, not models
worth a page on the site. Leave them where they are.

---

**How to use this file:** when you're ready to build the next simulation,
pick one `candidate` line, prototype/verify the math in Python if it isn't
already solid, then port the update rule into a new `js/sims/*.js` module
(see the "Adding a new simulation" section of `README.md`). Flip its status
to `live` and move on to the next one — no need to process the list in
order, and no need to touch anything outside this file and `js/sims/`.
