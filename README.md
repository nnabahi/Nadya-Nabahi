# Nadya Nabahi — personal website

Plain HTML, CSS and JavaScript. No build step: open any `.html` file in a
browser and it works. Everything runs in the visitor's browser; there is no
server. Outside libraries, all loaded from a CDN:
[Cytoscape.js](https://js.cytoscape.org) (graph drawing and graph
algorithms), [math.js](https://mathjs.org) (reads typed formulas),
[KaTeX](https://katex.org) (shows them as typeset math),
[seedrandom](https://github.com/davidbau/seedrandom) (random numbers that
repeat for the same seed), [three.js](https://threejs.org) (the 3D view)
and [jStat](https://jstat.github.io) (statistics on the check pages, and
the special functions some laws of random variables need).

## What's where

### The site

| File | What it is |
| --- | --- |
| `index.html` | Home page (image area + welcome line) |
| `about.html` | About Me |
| `writing.html` | Writing: posts as cards that open when clicked |
| `resume-and-publications.html` | Resume & Publications |
| `toysnsims.html` | Toys n' Sims: model families, sporadic models and tools |
| `css/style.css` | The single stylesheet for every page |
| `js/site.js` | The top bar's links, written once for every page, and `fillBlocks`, which fills a page's placeholders with shared pieces of HTML |
| `js/writing.js` | Sorts the posts on `writing.html` newest first, turns their Markdown into formatted text with math, and adds the giscus comment box to an open post |
| `js/toysnsims.js` | The `toysnsims.html` list: sorts every group A to Z (a pinned card, the Graph & Domain Tool, first), opens one model family's panel at a time, and builds the genre buttons for the sporadic models |
| `help/gomjau-hogg.html` | Help page: how to write a tiling as a GomJau-Hogg code (linked from the Lattice code box), with `gomjau-hogg.js` for its "Try a code" box |
| `help/random-variables.html` | Help page: how to type random variables in the Random variables box (linked from the box), with `random-variables.js` for its "Try it" box and the tables of every law (made from the catalog); `random-variables-check.html` tests the laws and the random variables |
| `SIMS.md` | Planning list of candidate sims and their status (not shown on the site) |
| `SIMS-priority.md` | Claude's ranking of the `SIMS.md` ideas, sims vs toys (not shown on the site) |
| `MODELS.md` | Every model in nadya's Programming folder, sorted into families (not shown on the site) |

### One folder per sim

Every sim has its own folder, `toysnsims/name/`, holding its pages and
their code, so its web address is
`nnabahi.github.io/Nadya-Nabahi/toysnsims/name/name.html`. The pattern is
the same for every sim: the page is `name.html`, the page's code is
`name.js`, its math is `name-<something>.js` (for example `name-chain.js`
for a Markov chain), and the page that tests the math is
`name-check.html` with `name-check.js`.
Each check page opens from its sim's "model check" button and starts with
a link back to the sim.

| Folder | The sim | Its math | Its check page tests |
| --- | --- | --- | --- |
| `toysnsims/graph-tool/` | Graph & domain tool: paint a domain on a grid (under Tools on `toysnsims.html`); sims open it for a custom domain | | |
| `toysnsims/cellular-automata/` | Cellular automata (a tape over time or a grid; b states, any neighborhood, any rule number; wrapping, fixed or random edges) | `-rule.js`: the rule (Wolfram's numbering), in a second thread | reading the rule number, rule 30, the Game of Life, the edges, repeats |
| `toysnsims/uniform-spanning-tree/` | Uniform Spanning Tree (Wilson's algorithm, shown step by step; the tree, its colors, and distances to the root or to a path, from above or in 3D; box, torus, drawn domain, hyperbolic tilings and trees; on the square grid or any tiling's tiles or corners) | `-wilson.js`: the tree, grown in a second thread (Wilson's algorithm itself is in `js/sim-spanning.js`) | counting spanning trees, uniform on small graphs whatever the order and root, colors independent of the tree, the path is a loop-erased walk, distances and paths |
| `toysnsims/connected-coloring/` | Connected Coloring (box, torus, drawn domain, hyperbolic tilings and trees; on the square grid or any tiling's tiles or corners) | `-chain.js`: the Markov chain (ReCom with a uniform correction), in a second thread | |
| `toysnsims/random-walk-coloring/` | Random walk coloring (N walkers color cells by first arrival, in discrete or continuous time; on the square grid or any tiling's tiles or corners) | `-walk.js`: the walkers (both models), in a second thread | |
| `toysnsims/random-walk/` | Random Walk (one walker in 1D, 2D or 3D, a weight per direction, or in 2D on any tiling's tiles or corners; distance, range, returns, convex hull, holes, outer boundary) | `-rule.js`: the walk and its shape, in a second thread | how often each direction comes up, coupling, recounts, the hull, the holes, known answers, and on tilings: uniform steps, the holes by Euler's formula and from the polygons alone |
| `toysnsims/eden-growth/` | Eden Growth (blocks pile up on a line, grid, drawn domain, hyperbolic tiling or tree, or any tiling's tiles or corners; any tile on the grids, every cell within r steps elsewhere; 3D view) | `-rule.js`: the growth rule, in a second thread | nadya's Python, exact odds, invariants, the graphs, and on tilings: the tiles as balls, the squares' code matching the grid, the holes by Euler's formula |
| `toysnsims/percolation/` | Site and bond percolation, two pages (`site-percolation.html`, `bond-percolation.html`) sharing `percolation.js`; on the square grid or any tiling by regular polygons (its tiles or its corners) | `percolation-clusters.js`: the clusters at one p and at every p (union-find, Newman-Ziff), in the page | clusters, wrapping, Hex and duality crossings, trees, the tilings and their boxes and tori |
| `toysnsims/ising-potts/` | Ising and Potts model (q colors; heat bath or Swendsen-Wang; on the square grid or any tiling's tiles or corners) | `-chain.js`: the two Markov chains and the critical points known exactly, in a second thread | exact odds on tiny graphs, Yang, Onsager, the critical points on triangles and hexagons |
| `toysnsims/voter-model/` | Generalized voter model (a typed rule g of the neighbors' shares, with noise; on the square grid or any tiling's tiles or corners) | `-chain.js`: the update rule, in a second thread | the update odds, who wins, noise |
| `toysnsims/sandpiles/` | Sandpiles (the abelian sandpile, storms, avalanches, the identity; on the square grid or any tiling's tiles or corners, each cell toppling at its number of neighbors) | `-pile.js`: the toppling rule, in a second thread | nadya's Python, the abelian property, the identity, no sink, tilings with mixed thresholds |
| `toysnsims/uniform-discrete-tiling/` | Uniform Discrete Tiling (rectangles, with or without gaps, or rhombi and other pairs on triangles and hexagons; every packing equally likely) | `-chain.js`: the Markov chain, in a second thread | every packing equally likely, counting tilings, the arctic circle |
| `toysnsims/sequential-continuous-tiling/` | Sequential Continuous Tiling (continuous space; any typed domain, tile and density) | `-growth.js`: growing each tile, in a second thread | nadya's gasket formula, known answers, invariants |
| `toysnsims/first-passage-percolation/` | First Passage Percolation (a random passage time w on every edge or cell, from the Random variables box; the ball B(t) growing, or geodesics between random pairs; whole plane, box, torus, drawn domain, hyperbolic tilings and trees, on the square grid or any tiling's tiles or corners) | `-rule.js`: the passage times and Dijkstra's algorithm, in the page | the passage times and their laws, the domains, Dijkstra, distances, exponential times as Eden growth and Richardson's model, coupling, the whole plane, holes, pairs |
| `toysnsims/sinusoid-ish/` | Sinusoid-ish (roots at random gaps g, a random variable from the Random variables box; f, its lobes and their histograms) | `-roots.js`: the roots, f, peaks and lobes, in the page | Euler's sine product, stationarity, a picture to compare with nadya's Python |
| `toysnsims/path-counting/` | Lattice path counting (paths home through edges with typed weights X and Y; f along a line a x + b y = c and its bell curve; 3D surface) | `-math.js`: log f on the grid, the line, the scaled heights, the weights with their random variables, in the page | binomial coefficients, every path listed, the periodic rule, the random variables and coupling, the line, normalizing, the bell curve |
| `toysnsims/internal-discrete-dla/` | Internal Discrete DLA (each particle walks from the origin to the first cell outside the cluster; 1D, 2D on the square grid or any tiling, Penrose included, or 3D on any tiling of space; colored by when each cell joined or how early or late; the inner and outer radius, and on the grids their errors from the ball) | `-growth.js`: the growth, with exact jumps across balls inside the cluster, in a second thread | the exact laws of small clusters, the cluster's shape and edge, jumps against plain steps, coupling, the line's urn |
| `toysnsims/external-discrete-dla/` | External Discrete DLA (each particle walks in from far away to the first cell next to the cluster; 2D on the square grid or any tiling, Penrose included, or 3D on any tiling of space; colored by when each cell joined; the radius, the radius of gyration and the fitted fractal dimension; the launch distance) | `-growth.js`: the growth, with the launch circle, the Brownian return and exact jumps outside the cluster, in a second thread | the exact landing law on the square grid (from the potential kernel), the return angles, jumps against plain steps, the launch distance, the nearest edge cell, the cluster's shape and edge, coupling |
| `toysnsims/matrix-products/` | Matrix Products toy (random 2x2 matrices multiply a cloud of vectors; the entries can use random variables) | `-math.js`: reading the matrices, the runs, the growth rate, in the page | exact odds, averages, invariants, the growth rate, random entries and coupling |

### Code the sims share (`js/`)

| File | What it holds |
| --- | --- |
| `js/sim-page.js` | Small helpers every sim page uses: the second thread; the Play, Speed and Seed rows (written once, into each page's placeholders) and graying out Play and Step when a run can't go on; the 3D view, with its Reset view button, Heights row and help line; the full screen button, the About tabs, typesetting the formulas |
| `js/sim-worker.js` | What the second threads share: Play, Pause and Speed (the run loop), the run so far for the charts over time, random numbers tied to a seed and a place or step (for coupled sliders), and a heap that keeps the smallest number first (Eden Growth's clocks, First Passage Percolation's search) |
| `js/sim-charts.js` | The small charts: lines over time, histograms, power-of-2 bars, perimeter against area, hole lifetimes, log-log lines, a shape's radius in each direction (now and over time), zooming a chart in time |
| `js/sim-colors.js` | The old site's colors, color conversions, the blue-to-red colors of heights, and blue-white-red for differences |
| `js/sim-domains.js` | Domains: box, torus, Aztec diamond, a region drawn in the graph tool, and boxes, tori and hexagons of any tiling's cells (triangles, hexagons, any tiling by regular polygons, a Penrose tiling's box centered on it), boxes and tori of a 3D tiling's cells, with where each cell is in the picture (its middle, how far its sides are, and where the cells are in whole numbers, for starts); a growing set of a tiling's cells to draw; the cell nearest a point; distances through a domain, and counting connected pieces (with their areas and perimeters) |
| `js/sim-view.js` | The picture of a domain of square (or polygon) cells: where it goes, painting the cells (paintDomain picks squares or a tiling's polygons, pixel by pixel when they are tiny), moving and zooming it (dragging, pinching, clicking), and its zoom buttons; lines between neighbors' middles (a tree, a walk, with a dot where the walker is), and where the cells stand on the 3D floor |
| `js/sim-tilings.js` | Tilings by regular polygons read from their GomJau-Hogg codes, exactly (in whole numbers and square roots): the repeating block, its kinds of corner, the corners as cells, any tiling ready for the sims from its code, and the tilings in the Lattice menus |
| `js/sim-penrose.js` | Penrose's kites and darts (P2) and rhombs (P3), built exactly by splitting Robinson triangles: a patch around the point of five-fold symmetry that grows to fit a box and keeps its cells' numbers, the corners as cells, and the kinds of corner (for the check page) |
| `js/sim-honeycombs.js` | The 28 uniform tilings of 3-space (Grünbaum 1994; #22 is the cubic grid Z³), made by the kaleidoscope, as prisms over plane tilings, or in stacked layers, with their vertices, edges, faces or polyhedra as cells: each tiling's repeating block, neighbors, shapes for drawing, and steps through the whole of space. Its check page is `help/honeycombs-check.html` |
| `js/sim-walk.js` | A walker on any lattice (Z, Z², Z³, every tiling of the plane, Penrose included, and every 3D tiling), all written the same way as a repeating block of cells with their moves: one step (every neighbor equally likely, or by weights on the grids), and exact jumps across a ball when nothing nearby could stop it (the exit law worked out once by a linear solve). Used by Random Walk and the DLA sims. Its check page is `help/walk-check.html` |
| `js/sim-cluster.js` | A cluster of sites growing on any lattice of `js/sim-walk.js` (the DLA family): its sites in order, each one's distance from the start, its radius of gyration, and its edge (the empty sites next to it), with the nearest edge site to the start or to any point (a search through buckets), so a walker knows how big a ball it may jump across; and the second thread every DLA sim runs |
| `js/sim-sites.js` | A page's copy of the sites a second thread found (Random Walk's visited sites, a DLA cluster), sent a few at a time, ready to draw as squares, as a tiling's cells or in 3D |
| `js/sim-cluster-page.js` | What the DLA pages share: the cluster on the page and the lattice it grew on, and drawing it (squares or a tiling's cells with the seed outlined, or cells in 3D) |
| `js/sim-shape.js` | The shape of a set of cells (squares, or any tiling's cells): its convex hull (with area and perimeter), its farthest cell in each direction, its holes over time and its outer boundary, and answers kept up to date while playing (Eden Growth, Random Walk, First Passage Percolation) |
| `js/sim-graphs.js` | Graphs beyond the square grid, built cell by cell as a sim asks: the line, the grid, hyperbolic tilings {p,q} and regular trees |
| `js/sim-hyperbolic.js` | Pictures of a hyperbolic tiling or tree (the disk, the half-plane, a tree spread out), dragging across the plane, the ball a sim runs on, and lines between its cells' middles (a tree, a walk) |
| `js/sim-controls.js` | The controls the sims on cells repeat: the Domain options (written once, into each page's placeholder; in the plane or on the line, with the whole plane or line on pages that ask) and the Lattice options (with the tilings of space, for 3D), the graph tool inside the page (its box and its messages), and the clickable grid of offsets (a tile or a neighborhood) |
| `js/sim-spanning.js` | Spanning trees: Wilson's algorithm one step at a time (with each cell's "color"), counting spanning trees (Kirchhoff's matrix-tree theorem), distances and paths in a tree, and moving a tree to a new root (Uniform Spanning Tree, Connected Coloring) |
| `js/sim-3d.js` | The 3D view (stacks of cubes or coins, colored by height and, if a sim asks, by the kind of cell; or a colored surface with balls on it; or cells in space, cubes or any 3D tiling's polyhedra, faces, edges and vertices; lines on the floor or over the stacks; turned with the mouse), loaded only when a sim switches to 3D |
| `js/formulas.js` | Typed formulas and their sliders, like Desmos, with piecewise {condition: a, b} (the graph tool and the sims that take formulas) |
| `js/sim-laws.js` | The law of a random number, kept as its distribution function F: read from a typed density (with point masses), drawn from by F<sup>-1</sup>(U), and charted |
| `js/sim-law-catalog.js` | The named laws, like `normal(0, 1)`, `weibull(k, λ)` or `cantor()`, each with its formulas and source (the help page's tables are made from it) |
| `js/sim-random.js` | Named random variables (`u ~ unif(0, 1)`, `X = max(u, v)`, families `d_k`, `sum` and `prod`), one copy per place a sim names, coupled sliders, many draws at once and averages, and the Random variables box itself (FPP, Sinusoid-ish, Matrix Products, Lattice Path Counting) |
| `js/check-page.js` | The check pages' results table, "Run the checks" button and shared tests (chi-square, two-sample chi-square, z-score, a small linear solve, counting holes plainly, the holes of a tiling's cells by Euler's formula and from the polygons, and a cluster's sites and edge found plainly) |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  in `js/site.js` (every page's top bar comes from there).
- **Add a sim:**
  1. Copy the page of the sim closest to the new one (like
     `toysnsims/random-walk-coloring/random-walk-coloring.html`) into a new
     folder, as `toysnsims/<name>/<name>.html`. Its shared links
     (`../../css/style.css`, `../../js/...`) already point the right way;
     change its own scripts to `<name>.js` and so on.
  2. Fill in the five boxes, and write the page's code in `<name>.js` and
     its math in `<name>-<something>.js`.
  3. Add a card for it on `toysnsims.html`, linking to `toysnsims/<name>/<name>.html`,
     with its genre labels (`<li>` items in the card's `<ul class="tags">`).
     New genres get a filter button automatically.
  4. Optionally a check page, `<name>-check.html` with `<name>-check.js`,
     linked from the sim's "model check" button.
- **Move the sim page boxes around:** edit `grid-template-areas` in section 6
  of `css/style.css`.

The earlier version of the site (with the old simulations) is saved in git
history at commit `8e68754`.
