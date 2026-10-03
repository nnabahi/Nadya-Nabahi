# Nadya Nabahi — personal website

Plain HTML, CSS and JavaScript. No build step: open any `.html` file in a
browser and it works. Everything runs in the visitor's browser; there is no
server. Outside libraries, all loaded from a CDN:
[Cytoscape.js](https://js.cytoscape.org) (graph drawing and graph
algorithms), [math.js](https://mathjs.org) (reads typed formulas),
[KaTeX](https://katex.org) (shows them as typeset maths) and
[seedrandom](https://github.com/davidbau/seedrandom) (random numbers that
repeat for the same seed).

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
| `js/sim-domains.js` | Domains (box, torus, drawn region) and the old site's colors, shared by the sims |
| `sims/graph-tool.html` | Graph & domain tool: paint a domain on a grid (pinned first on `toys.html`) |
| `sims/graph-tool.js` | The graph tool's code (painting, torus, formula box, undo, save/load) |
| `sims/connected-coloring.html` | Random connected coloring sim (box, torus, or a domain drawn in the graph tool) |
| `sims/connected-coloring.js` | That sim's page: domains, the start, drawing, statistics, the custom-domain steps |
| `sims/connected-coloring-chain.js` | That sim's Markov chain (ReCom with a uniform correction), run in a Web Worker |
| `sims/random-walk-coloring.html` | Random walk coloring sim (N walkers color cells by first arrival, in discrete or continuous time) |
| `sims/random-walk-coloring.js` | That sim's page: the default start, dragging walkers, drawing, statistics, the custom domain |
| `sims/random-walk-coloring-walk.js` | That sim's walkers (both models), run in a Web Worker |
| `sims/sequential-packing-growth.js` | Random sequential packing (continuous space): the math only. Grows each tile until it meets the edge of S or an earlier tile |
| `sims/sequential-packing-check.html` | Check page for that math (not linked from the site): compares it with nadya's formula and known answers |
| `sims/sequential-packing-check.js` | The checks that page runs |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  on *every* page (the top bar is copied into each file).
- **Add a sim:** copy an existing sim page (like `sims/random-walk-coloring.html`),
  fill in the four boxes, and add a card for it on `toys.html` with its
  genre labels (`<li>` items in the card's `<ul class="tags">`). New genres
  get a filter button automatically. The copied page already loads the
  shared files `js/sim-page.js` and `js/sim-domains.js`.
- **Move the sim quadrants around:** edit `grid-template-areas` in section 6
  of `css/style.css`.

The earlier version of the site (with the old simulations) is saved in git
history at commit `8e68754`.
