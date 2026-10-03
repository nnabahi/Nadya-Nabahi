# Nadya Nabahi — personal website

Plain HTML, CSS and JavaScript. No build step: open any `.html` file in a
browser and it works. Everything runs in the visitor's browser; there is no
server. Outside libraries, all loaded from a CDN:
[Cytoscape.js](https://js.cytoscape.org) (graph drawing and graph
algorithms), [math.js](https://mathjs.org) (reads typed formulas),
[KaTeX](https://katex.org) (shows them as typeset math),
[seedrandom](https://github.com/davidbau/seedrandom) (random numbers that
repeat for the same seed) and, on a check page,
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
| `js/sim-page.js` | Small helpers every sim page uses (chart drawing, the second thread, typesetting the formulas) |
| `js/sim-view.js` | Where a sim's picture of cells goes, and moving and zooming it on a torus, shared by the sims |
| `js/sim-domains.js` | Domains (box, torus, drawn region) and the old site's colors, shared by the sims |
| `sims/graph-tool.html` | Graph & domain tool: paint a domain on a grid (pinned first on `toys.html`) |
| `sims/graph-tool.js` | The graph tool's code (painting, torus, formula box, undo, save/load) |
| `sims/connected-coloring.html` | Random connected coloring sim (box, torus, or a domain drawn in the graph tool) |
| `sims/connected-coloring.js` | That sim's page: domains, the start, drawing, statistics, the custom-domain steps |
| `sims/connected-coloring-chain.js` | That sim's Markov chain (ReCom with a uniform correction), run in a Web Worker |
| `sims/random-walk-coloring.html` | Random walk coloring sim (N walkers color cells by first arrival, in discrete or continuous time) |
| `sims/random-walk-coloring.js` | That sim's page: the default start, dragging walkers, drawing, statistics, the custom domain |
| `sims/random-walk-coloring-walk.js` | That sim's walkers (both models), run in a Web Worker |
| `sims/random-mountain-growth.js` | Random mountain (block growth): the growth rule only, no page yet |
| `sims/random-mountain-check.html`, `.js` | Tests of that growth rule (against nadya's Python, exact odds, invariants); not linked from the site |
| `sims/tile-packing-chain.js` | Random tile packing: its Markov chain (not on the site yet) |
| `sims/tile-packing-check.html`, `.js` | Tests of that chain (every packing equally likely, counting tilings, the arctic circle); not linked from the site |
| `sims/random-sine-roots.js` | Random sine function: its math (placing the roots, f, peaks and lobes; not on the site yet) |
| `sims/random-sine-check.html` | Tests of that math (Euler's sine product, stationarity, a picture to compare with nadya's Python); not linked from the site |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  on *every* page (the top bar is copied into each file).
- **Add a sim:** copy an existing sim page (like `sims/random-walk-coloring.html`),
  fill in the four boxes, and add a card for it on `toys.html` with its
  genre labels (`<li>` items in the card's `<ul class="tags">`). New genres
  get a filter button automatically. The copied page already loads the
  shared files `js/sim-page.js`, `js/sim-domains.js` and `js/sim-view.js`
  (the last one gives any torus its moving and zooming).
- **Move the sim quadrants around:** edit `grid-template-areas` in section 6
  of `css/style.css`.

The earlier version of the site (with the old simulations) is saved in git
history at commit `8e68754`.
