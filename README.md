# Nadya Nabahi — personal website

Plain HTML, CSS and JavaScript. No build step: open any `.html` file in a
browser and it works. Everything runs in the visitor's browser; there is no
server. Outside libraries, all loaded from a CDN:
[Cytoscape.js](https://js.cytoscape.org) (graph drawing and graph
algorithms), [math.js](https://mathjs.org) (reads typed formulas),
[KaTeX](https://katex.org) (shows them as typeset math),
[seedrandom](https://github.com/davidbau/seedrandom) (random numbers that
repeat for the same seed) and, on the check pages,
[jStat](https://jstat.github.io) (statistics).

## What's where

| File | What it is |
| --- | --- |
| `index.html` | Home page (image area + welcome line) |
| `about.html` | About Me |
| `resume.html` | Resume |
| `publications.html` | Publications |
| `toys.html` | Toys n' Sims: a list of all simulations |
| `SIMS.md` | Planning list of candidate sims and their status (not shown on the site) |
| `SIMS-priority.md` | Claude's ranking of the `SIMS.md` ideas, sims vs toys (not shown on the site) |
| `MODELS.md` | Every model in nadya's Programming folder, sorted into families (not shown on the site) |
| `sims/` | One page per simulation |
| `css/style.css` | The single stylesheet for every page |
| `js/genre-filter.js` | Builds the genre buttons on `toys.html` and hides/shows cards |
| `js/about-tabs.js` | The Simple / All the details tabs in a sim's About box |
| `js/sim-page.js` | Small helpers every sim page uses (the second thread, the drawing tool inside a sim, small charts, typesetting the formulas) |
| `js/sim-view.js` | Where a sim's picture of cells goes, and moving and zooming it (any box or torus), shared by the sims |
| `js/cell-picture.js` | Painting one color per cell, fast (the Ising and Potts, voter and percolation sims) |
| `js/sim-domains.js` | Domains (box, torus, Aztec diamond, drawn region), the old site's colors and color conversions, shared by the sims |
| `js/sim-graphs.js` | Graphs beyond the square grid, built cell by cell as a sim asks: the line, the grid, hyperbolic tilings {p,q} and regular trees (exactly, from rules it learns near the start) |
| `js/sim-3d.js` | The 3D view (stacks of cubes or coins, turned with the mouse), built on three.js and loaded only when a sim switches to 3D |
| `js/formulas.js` | Typed formulas and their sliders, like Desmos (the graph tool and the sims that take formulas) |
| `js/check-page.js` | The results table and "Run the checks" button shared by the check pages |
| `sims/graph-tool.html` | Graph & domain tool: paint a domain on a grid (pinned first on `toys.html`) |
| `sims/graph-tool.js` | The graph tool's code (painting, torus, formula box, undo, save/load) |
| `sims/connected-coloring.html` | Random connected coloring sim (box, torus, or a domain drawn in the graph tool) |
| `sims/connected-coloring.js` | That sim's page: domains, the start, drawing, statistics, the custom-domain steps |
| `sims/connected-coloring-chain.js` | That sim's Markov chain (ReCom with a uniform correction), run in a Web Worker |
| `sims/random-walk-coloring.html` | Random walk coloring sim (N walkers color cells by first arrival, in discrete or continuous time) |
| `sims/random-walk-coloring.js` | That sim's page: the default start, dragging walkers, drawing, statistics, the custom domain |
| `sims/random-walk-coloring-walk.js` | That sim's walkers (both models), run in a Web Worker |
| `sims/random-mountain.html` | Random mountain sim (blocks pile up on a line or grid; any tile, any domain) |
| `sims/random-mountain.js` | That sim's page: the clickable tile grid and presets, domains, drawing, statistics, the custom domain |
| `sims/random-mountain-growth.js` | That sim's growth rule, and the code that runs it in a Web Worker |
| `sims/random-mountain-check.html`, `.js` | Tests of that growth rule (against nadya's Python, exact odds, invariants); opens from the sim's "model check" button |
| `sims/sequential-packing.html` | Random sequential packing sim (continuous space): random points grow tiles until they touch the edge of S or an earlier tile, with any typed domain, tile and density |
| `sims/sequential-packing.js` | That sim's page: the typed formulas and their sliders, play, drawing, statistics |
| `sims/sequential-packing-growth.js` | That sim's math (growing each tile until it meets the edge of S or an earlier tile), run in a Web Worker |
| `sims/sequential-packing-check.html`, `.js` | Tests of that math (against nadya's gasket formula, known answers, invariants); opens from the sim's "model check" button and its About box |
| `sims/tile-packing.html` | Random tile packing sim (rectangles pack a box, torus or drawn domain, with or without gaps; every packing equally likely) |
| `sims/tile-packing.js` | That sim's page: domains, the tiles and presets, drawing, statistics, the custom domain |
| `sims/tile-packing-chain.js` | That sim's Markov chain (uniform over all packings), run in a Web Worker |
| `sims/tile-packing-check.html`, `.js` | Tests of that chain (every packing equally likely, counting tilings, the arctic circle); opens from the sim's "model check" button |
| `sims/random-sine.html` | Random sine function sim (roots at random gaps from a typed set; f, its lobes and their histograms) |
| `sims/random-sine.js` | That sim's page: the typed set and its sliders, drawing the graph, statistics, many samples |
| `sims/random-sine-roots.js` | That sim's math (placing the roots, f, peaks and lobes), run in the page itself |
| `sims/random-sine-check.html` | Tests of that math (Euler's sine product, stationarity, a picture to compare with nadya's Python); opens from the sim's "model check" button |
| `sims/sandpiles.html` | Sandpiles sim (the abelian sandpile on a box, torus or drawn table, with storms, avalanches and the identity) |
| `sims/sandpiles.js` | That sim's page: tables, the start, colors, drawing, clicking cells, statistics, the custom table |
| `sims/sandpiles-pile.js` | That sim's toppling rule (with undo, the identity and the recurrence test), run in a Web Worker |
| `sims/sandpiles-check.html`, `.js` | Tests of that rule (against nadya's Python, the abelian property, the identity, no sink); opens from the sim's "model check" button |
| `sims/random-matrix-products.html` | Random matrix products toy (random 2x2 matrices, picked with weights, multiply a cloud of vectors) |
| `sims/random-matrix-products-page.js` | That toy's page: the matrix boxes and their sliders, play, the cloud, histogram and one-run views, statistics |
| `sims/random-matrix-products.js` | That toy's math (reading the matrices, the runs, the growth rate, the eigenvalues), run in the page itself |
| `sims/random-matrix-products-check.html`, `.js` | Tests of that math (exact odds, averages, invariants, the growth rate); opens from the sim's "model check" button |
| `sims/ising-potts.html` | Ising and Potts model sim (q colors, neighbors like to agree; heat bath or Swendsen-Wang) |
| `sims/potts.js` | That sim's page: the q, beta and h sliders, domains, drawing, statistics, the custom domain |
| `sims/potts-chain.js` | That sim's two Markov chains (heat bath and Swendsen-Wang), run in a Web Worker |
| `sims/potts-check.html`, `.js` | Tests of those chains (exact odds on tiny graphs, Yang's magnetization, Onsager's energy); opens from the sim's "model check" button |
| `sims/voter-model.html` | Generalized voter model sim (opinions change by a typed rule g of the neighbors' shares, with noise) |
| `sims/voter-model.js` | That sim's page: the rule g and its sliders, domains, drawing, statistics, the custom domain |
| `sims/voter-chain.js` | That sim's update rule, run in a Web Worker |
| `sims/voter-check.html`, `.js` | Tests of that rule (the update odds, who wins, noise); opens from the sim's "model check" button |
| `sims/site-percolation.html`, `sims/bond-percolation.html` | The two percolation sims (cells or edges open with probability p; the p slider, clusters, crossing) |
| `sims/percolation.js` | Both percolation pages' code (each page says in its `<body>` tag which one it is) |
| `sims/percolation-clusters.js` | Finding the clusters at one p and at every p at once (union-find, Newman-Ziff), run in the page itself |
| `sims/percolation-check.html`, `.js` | Tests of that (clusters, wrapping, Hex and duality crossings, clusters per cell at p = 1/2); opens from either sim's "model check" button |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  on *every* page (the top bar is copied into each file).
- **Add a sim:** copy an existing sim page (like `sims/random-walk-coloring.html`),
  fill in the four boxes, and add a card for it on `toys.html` with its
  genre labels (`<li>` items in the card's `<ul class="tags">`). New genres
  get a filter button automatically. The copied page already loads the
  shared files `js/sim-page.js`, `js/sim-domains.js` and `js/sim-view.js`
  (the last one gives the picture its moving and zooming).
- **Move the sim quadrants around:** edit `grid-template-areas` in section 6
  of `css/style.css`.

The earlier version of the site (with the old simulations) is saved in git
history at commit `8e68754`.
