# Candidate sims

A planning list only. Nothing here is on the site, and nothing on this list
gets a page or a card on Toys n' Sims until nadya drives it, one sim at a
time.

Rows come from the old `SIMS.md` (git commit `8e68754`). Genres were
removed: nadya picks them when a sim goes live.

## Status

`idea` → `planning` → `checking algorithm` → `building page` → `live`, or `skip`.

- **idea**: worth building someday. Nothing has been done yet.
- **planning**: a thread is open and the plan doc is being agreed.
- **checking algorithm**: the math code is written and is being compared with nadya's Python.
- **building page**: the four-quadrant page is being made.
- **live**: on the site with nadya's card text.
- **skip**: not going on the site.

The thread column names the project thread where the sim is being worked on.

## The list

| Sim | nadya's Python files | Old site JS (at `8e68754`) | Status | Thread |
| --- | --- | --- | --- | --- |
| Random connected N-colouring | `Random_Connected_coloring.py` | `js/sims/connectedcoloring.js` | planning | Scope the domain drawing tool |
| 1D cellular automata | | `js/sims/automata.js` | idea | |
| Abelian sandpile | | `js/sims/sandpiles.js` | idea | |
| Random walk colouring | `RandomColoredWalk*.py`, `RandomColoredWalkOnLTaurus*.py` | `js/sims/walkcoloring.js` | idea | |
| Random sequential tile packing | `circlepacking.py`, `circlingpackingdegrees.py`, `growing_circles_*` | `js/sims/tilepacking.js` | idea | |
| Gradient percolation | (from `gradient-percolation.html`) | `js/sims/gradientpercolation.js` | idea | |
| Random block growth | `RandBlockStack.py` | `js/sims/blockgrowth.js` | idea | |
| Lattice path counting | | `js/sims/pathcount.js` | idea | |
| Digit-rewriting rules | `DigitFun.py`, `BaseFun.py` | | idea | |
| Competing walks on a line | `competingwalk1d.py`, `competingwalks1dclaude.py` | | idea | |
| Dyadic walk | `DyadicWalk/` | | idea | |
| Random bridges / mountains | `randombrownianbridgeellipsecut.py`, `randmountain.py`, `randonesidedmountain.py` | | idea | |
| Coin-toss convergence | `quickndirtycointossconvergence.py` | | idea | |
| Random matrix products | `randmatAB.py`, `randmatprod.py`, `randmatcltadd.py`, `randmatcltmul.py` | | idea | |
| Random stochastic matrices | `randstochasticmat.py` | | idea | |
| Random tilings | `RANDOMTILINGS/tiling_mcmc.py`, `tiling_animation.py`, old `RandomTilings.js` | | idea | |
| Random billiards / clipping | `randbilliards.py`, `gptcircleclipping.py` | | idea | |
| Growing circles / interface tracking | (`growing_circles_analysis*.png`, `interface_displacement_data.csv`) | | idea | |
| Fractal percolation | `randomfractalpercolation.py`, `fracperc.py` | | idea | |
| Antisocial cells | `AntisocialCells/AntisocialCells.py` | | idea | |
| Durrett-style growth model | `DURRETT.py` | | idea | |
| Random trees | `randtrees.py`, `randsmallworldtrees.py` | | idea | |
| Partitions | `Partitions.py` | | idea | |
| Graph explorations | `Graph/FirstGraphs.py` | | idea | |
| Continued / base-B fraction expansions | `FractionExpansion.py`, `ContFracWithFunc.py`, `RandomBaseBNumbers.py` | | idea | |
| Periodic-rule Fibonacci-like sequences | `periodicfibonnaci.js`, `fib.py` | | idea | |
| Ulam sequence | `Ulam.py` | | idea | |

## How a sim goes from idea to live

1. nadya picks the sim and starts a thread named after it, pasting her Python.
2. A plan doc (the math, the algorithm, defaults, controls, statistics, the picture). nadya OKs it.
3. The algorithm, plus a check page that compares it with her Python and with known answers. nadya OKs it.
4. The four-quadrant page. nadya OKs how it looks.
5. nadya writes the card text and genres, and merges. Status becomes `live`.

Old site JS is a starting point only. It gets the same checks as new code.
