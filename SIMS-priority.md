# Sims or toys: Claude's ranking

A ranked copy of the ideas in `SIMS.md`, written by Claude on 2026-10-03. This is
only an opinion. `SIMS.md` stays the master list and this file doesn't change it.

- **Sim**: a model with real mathematics behind it, where moving the sliders teaches you something.
- **Toy**: something pretty or fun that doesn't need a full four-quadrant page.

The two sims already in progress, connected colouring and random walk colouring,
are left out. Most of these were judged from their names and formulas rather than
nadya's Python, so treat this as a starting point.

## Sims, in suggested build order

| # | Sim | Also covers (rows in SIMS.md) | Why | Reference |
| --- | --- | --- | --- | --- |
| 1 | Abelian sandpile | | Deterministic, so `check.html` can match the Python exactly, which makes it a good first test of the workflow. It runs directly on the grid and domain tool. | Dhar, *Phys. Rev. Lett.* 64 (1990) 1613 (toppling order doesn't matter); Bak, Tang & Wiesenfeld, *Phys. Rev. Lett.* 59 (1987) 381 |
| 2 | Gradient percolation | | Reuses the grid and the density formula box. The front it draws is a real fractal. | Sapoval, Rosso & Gouyet, *J. Physique Lett.* 46 (1985) L149 (front dimension 7/4); Saleur & Duplantier, *Phys. Rev. Lett.* 58 (1987) 2325 |
| 3 | Random tilings | D6, D18 (as statistics) | The biggest wow on the list, if the MCMC does 2D domino or lozenge tilings. The 1D counting formulas fit the statistics panel. | Jockusch, Propp & Shor, arXiv:math/9801068 (1998) (arctic circle) |
| 4 | Random sequential packing | D14, growing circles / interface tracking | The old version was already a general tool. D14 is one of its presets. | Rényi, *Publ. Math. Inst. Hungar. Acad. Sci.* 3 (1958) 109 (1D jamming density ≈ 0.7476) |
| 5 | Fractal percolation | | Cheap to compute, with a clean threshold a slider can cross. | Mandelbrot, *J. Fluid Mech.* 62 (1974) 331; Chayes, Chayes & Durrett, *Probab. Th. Rel. Fields* 77 (1988) 307 |
| 6 | Random matrix products | Random stochastic matrices, D12, D13 | Four ideas on one page: histograms of where the products land, next to the growth rate. | Furstenberg & Kesten, *Ann. Math. Statist.* 31 (1960) 457 |
| 7 | Random digit measures | D11, D16, continued / base-B (random numbers part); D5, D7 (as statistics) | All are "pick digits with unequal weights and look at the distribution": singular CDFs and multifractal densities. | Salem, *Trans. AMS* 53 (1943) 427; Mandelbrot 1974 (above) |
| 8 | Growth models | Random block growth, Durrett-style growth, antisocial cells | One engine with a rule picker, so three ideas don't become three pages. | Eden, *Proc. 4th Berkeley Symp.* 4 (1961) 223; Richardson, *Proc. Camb. Phil. Soc.* 74 (1973) 515 (shape theorem) |
| 9 | Lattice path counting | D8, D9 (as presets) | The old version already takes typed rules, so the parity and mod rules become presets. | |
| 10 | Random trees | | Reuses Wilson's algorithm from the colouring sim, so it's nearly free afterwards. | Wilson, *STOC* 1996; Aldous, *Ann. Probab.* 19 (1991) 1 |
| 11 | Move-to-front list | D17 | Small, with a known exact answer to check against. | Hendricks, *J. Appl. Probab.* 9 (1972) 231 |
| 12 | Product over a renewal walk | D1 | Possibly the most research-like idea, but nadya needs to explain it before it can be ranked properly. | |
| 13 | Random walks page | Random bridges / mountains, dyadic walk, competing walks | Each is thin alone. Together they make one page on walk shapes. | |

## Toys (not ranked)

| Toy | Rows in SIMS.md | Why | Reference |
| --- | --- | --- | --- |
| Random epicycles | D19 | The prettiest one: spinning circles drawing a random curve. | |
| 1D cellular automata | | A quick classic, but there are many online already. | Wolfram, *Rev. Mod. Phys.* 55 (1983) 601 |
| Ulam sequence | | A toy with a research hook that could move up. | Steinerberger, *Exp. Math.* 26 (2017) 460 |
| Continued / base-B fractions | | Becomes a sim if digit statistics are added. | Kuzmin (1928) (Gauss–Kuzmin law) |
| Smoothing a random sequence | D2, D3 | Fun to watch. D3 is the walk average, a discrete heat flow. | |
| sin(1/x) under random averaging | D15 | A nice visual with one slider. | |
| Alternating sequence × Gaussian | D4 | A formula plot. | |
| Uniform densities | D10 | Closed-form curves, or a check case for the digit measures sim. | |
| Periodic-rule Fibonacci-like sequences | | Quick and fun. | |
| Coin-toss convergence | | A teaching toy for the law of large numbers. | |
| Random billiards / clipping | | Unclear from the names. A toy unless the Python shows more. | |
| Partitions, graph explorations, digit-rewriting rules | | Thin as they stand. Keep them as ideas. | |

## Suggestions: models not on the list (Claude's suggestions)

These are Claude's ideas, not nadya's. They are only suggestions in this file:
nothing here goes into `SIMS.md` or onto the site unless nadya picks it. Each one was
chosen because it fits the grid, domain tool or Markov chain code the site already has
or will have.

| Model | Why it fits | Reference |
| --- | --- | --- |
| Bernoulli percolation with cluster colouring | The basic model behind gradient and fractal percolation. A p slider shows the giant cluster appear. | Kesten, *Commun. Math. Phys.* 74 (1980) 41 (bond p_c = 1/2 on Z²) |
| Ising model (Glauber or Swendsen–Wang) | The standard MCMC on a grid, reusing the colouring sim's chain machinery. A temperature slider shows the phase transition. | Onsager, *Phys. Rev.* 65 (1944) 117; Swendsen & Wang, *Phys. Rev. Lett.* 58 (1987) 86 |
| Diffusion-limited aggregation | Growth by random walkers, a natural partner to the growth-models page. | Witten & Sander, *Phys. Rev. Lett.* 47 (1981) 1400 |
| Internal DLA and rotor-router aggregation | Sits right beside the sandpile: random walkers grow a near-perfect disk, and the rotor version does it deterministically. | Lawler, Bramson & Griffeath, *Ann. Probab.* 20 (1992) 2117; Levine & Peres, *Potential Anal.* 30 (2009) 1 |
| Loop-erased random walk | The building block of Wilson's algorithm, already in the colouring sim, so it's cheap to show on its own. | Lawler, *Duke Math. J.* 47 (1980) 655; Wilson, *STOC* 1996 |
| Bootstrap percolation | A simple rule with a famous, surprisingly slow threshold. Also cheap on the grid. | Holroyd, *Probab. Th. Rel. Fields* 125 (2003) 195 (sharp threshold π²/18) |
| Random Young diagrams (Plancherel) | A natural sim for the "Partitions" idea, with a curved limit shape to compare against. | Vershik & Kerov, *Soviet Math. Dokl.* 18 (1977) 527; Logan & Shepp, *Adv. Math.* 26 (1977) 206 |
| Bernoulli convolutions | Fits the random digit measures page: random digits in a base below 2, with famous open questions about smoothness. | Erdős, *Amer. J. Math.* 61 (1939) 974; Solomyak, *Ann. of Math.* 142 (1995) 611 |
| TASEP / corner growth | Links the lattice-path counting and growth pages, with an exact parabola-shaped limit. | Rost, *Z. Wahrsch. Verw. Gebiete* 58 (1981) 41 |
| Voter model | A colouring that evolves by copying neighbours, a dynamic cousin of the connected colouring sim. | Clifford & Sudbury, *Biometrika* 60 (1973) 581; Holley & Liggett, *Ann. Probab.* 3 (1975) 643 |
