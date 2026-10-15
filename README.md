# Nadya Nabahi — personal website

Plain HTML, CSS and JavaScript. No build step: open any `.html` file in a
browser and it works. Everything runs in the visitor's browser; there is no
server. Outside libraries, all loaded from a CDN:
[Cytoscape.js](https://js.cytoscape.org) (graph drawing and graph
algorithms), [math.js](https://mathjs.org) (reads typed formulas),
[KaTeX](https://katex.org) (shows them as typeset math),
[seedrandom](https://github.com/davidbau/seedrandom) (random numbers that
repeat for the same seed), [three.js](https://threejs.org) (the 3D view)
and, on the check pages, [jStat](https://jstat.github.io) (statistics).

## What's where

### The site

| File | What it is |
| --- | --- |
| `index.html` | Home page (image area + welcome line) |
| `about.html` | About Me |
| `writing.html` | Writing: posts as cards that open when clicked |
| `resume-and-publications.html` | Resume & Publications |
| `toysnsims.html` | Toys n' Sims: a list of all simulations |
| `css/style.css` | The single stylesheet for every page |
| `js/writing.js` | Sorts the posts on `writing.html` newest first, turns their Markdown into formatted text with math, and adds the giscus comment box to an open post |
| `js/genre-filter.js` | Sorts the cards on `toysnsims.html` A to Z (the graph tool pinned first), builds the genre buttons and hides/shows cards |
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
| `toysnsims/graph-tool/` | Graph & domain tool: paint a domain on a grid (pinned first on `toysnsims.html`); sims open it for a custom domain | | |
| `toysnsims/cellular-automata/` | Cellular automata (a tape over time or a grid; b states, any neighborhood, any rule number; wrapping, fixed or random edges) | `-rule.js`: the rule (Wolfram's numbering), in a second thread | reading the rule number, rule 30, the Game of Life, the edges, repeats |
| `toysnsims/connected-coloring/` | Connected Coloring (box, torus, drawn domain, hyperbolic tilings and trees) | `-chain.js`: the Markov chain (ReCom with a uniform correction), in a second thread | |
| `toysnsims/random-walk-coloring/` | Random walk coloring (N walkers color cells by first arrival, in discrete or continuous time) | `-walk.js`: the walkers (both models), in a second thread | |
| `toysnsims/random-walk/` | Random Walk (one walker in 1D, 2D or 3D, a weight per direction; distance, range, returns, convex hull, holes, outer boundary) | `-rule.js`: the walk and its shape, in a second thread | how often each direction comes up, coupling, recounts, the hull, the holes, known answers |
| `toysnsims/eden-growth/` | Eden Growth (blocks pile up on a line, grid, drawn domain, hyperbolic tiling or tree; any tile; 3D view) | `-rule.js`: the growth rule, in a second thread | nadya's Python, exact odds, invariants, the graphs |
| `toysnsims/percolation/` | Site and bond percolation, two pages (`site-percolation.html`, `bond-percolation.html`) sharing `percolation.js` | `percolation-clusters.js`: the clusters at one p and at every p (union-find, Newman-Ziff), in the page | clusters, wrapping, Hex and duality crossings, trees |
| `toysnsims/ising-potts/` | Ising and Potts model (q colors; heat bath or Swendsen-Wang) | `-chain.js`: the two Markov chains, in a second thread | exact odds on tiny graphs, Yang, Onsager |
| `toysnsims/voter-model/` | Generalized voter model (a typed rule g of the neighbors' shares, with noise) | `-chain.js`: the update rule, in a second thread | the update odds, who wins, noise |
| `toysnsims/sandpiles/` | Sandpiles (the abelian sandpile, storms, avalanches, the identity) | `-pile.js`: the toppling rule, in a second thread | nadya's Python, the abelian property, the identity, no sink |
| `toysnsims/uniform-discrete-tiling/` | Uniform Discrete Tiling (rectangles, with or without gaps, or rhombi and other pairs on triangles and hexagons; every packing equally likely) | `-chain.js`: the Markov chain, in a second thread | every packing equally likely, counting tilings, the arctic circle |
| `toysnsims/sequential-continuous-tiling/` | Sequential Continuous Tiling (continuous space; any typed domain, tile and density) | `-growth.js`: growing each tile, in a second thread | nadya's gasket formula, known answers, invariants |
| `toysnsims/sinusoid-ish/` | Sinusoid-ish (roots at random gaps from a typed set; f, its lobes and their histograms) | `-roots.js`: the roots, f, peaks and lobes, in the page | Euler's sine product, stationarity, a picture to compare with nadya's Python |
| `toysnsims/path-counting/` | Lattice path counting (paths home through edges with typed weights X and Y; f along a line a x + b y = c and its bell curve; 3D surface) | `-math.js`: log f on the grid, the line, the scaled heights, u(...), in the page | binomial coefficients, every path listed, the periodic rule, u(...) and coupling, the line, normalizing, the bell curve |
| `toysnsims/matrix-products/` | Matrix Products toy (random 2x2 matrices multiply a cloud of vectors) | `-math.js`: reading the matrices, the runs, the growth rate, in the page | exact odds, averages, invariants, the growth rate |

### Code the sims share (`js/`)

| File | What it holds |
| --- | --- |
| `js/sim-page.js` | Small helpers every sim page uses: the second thread, Play and the Speed and Seed boxes, the drawing tool's messages, the full screen button, the About tabs, typesetting the formulas |
| `js/sim-worker.js` | What the second threads share: Play, Pause and Speed (the run loop), the run so far for the charts over time, and random numbers tied to a seed and a place or step (for coupled sliders) |
| `js/sim-charts.js` | The small charts: lines over time, histograms, power-of-2 bars, perimeter against area, hole lifetimes, log-log lines, zooming a chart in time |
| `js/sim-colors.js` | The old site's colors, color conversions, and the blue-to-red colors of heights |
| `js/sim-domains.js` | Domains: box, torus, Aztec diamond, a region drawn in the graph tool, boxes and tori of triangles or hexagons, a hexagon of triangles, and counting connected pieces (with their areas and perimeters) |
| `js/sim-view.js` | The picture of a domain of square (or triangle or hexagon) cells: where it goes, painting the cells, moving and zooming it |
| `js/sim-shape.js` | The shape of a set of cells: its convex hull (with area and perimeter) and its holes over time (Eden Growth, Random Walk) |
| `js/sim-graphs.js` | Graphs beyond the square grid, built cell by cell as a sim asks: the line, the grid, hyperbolic tilings {p,q} and regular trees |
| `js/sim-hyperbolic.js` | Pictures of a hyperbolic tiling or tree (the disk, the half-plane, a tree spread out), dragging across the plane, and the ball a sim runs on |
| `js/sim-controls.js` | The controls the sims on cells repeat: the Domain options, the graph tool inside the page, dragging, zooming and clicking the picture, and the clickable grid of offsets (a tile or a neighborhood) |
| `js/sim-3d.js` | The 3D view (stacks of cubes or coins, or a colored surface with balls on it, turned with the mouse), loaded only when a sim switches to 3D |
| `js/formulas.js` | Typed formulas and their sliders, like Desmos, with piecewise {condition: a, b} (the graph tool and the sims that take formulas) |
| `js/check-page.js` | The check pages' results table, "Run the checks" button and shared tests (chi-square, z-score, counting holes plainly) |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  on *every* page (the top bar is copied into each file).
- **Add a sim:**
  1. Copy the page of the sim closest to the new one (like
     `toysnsims/random-walk-coloring/random-walk-coloring.html`) into a new
     folder, as `toysnsims/<name>/<name>.html`. Its shared links
     (`../../css/style.css`, `../../js/...`) already point the right way;
     change its own scripts to `<name>.js` and so on.
  2. Fill in the four boxes, and write the page's code in `<name>.js` and
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
