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
| `sims/` | One page per simulation |
| `sims/example.html` | Blank sim showing the four-quadrant layout; copy it to start a new sim |
| `css/style.css` | The single stylesheet for every page |
| `js/genre-filter.js` | Builds the genre buttons on `toys.html` and hides/shows cards |
| `js/about-tabs.js` | The Simple / All the details tabs in a sim's About box |
| `sims/graph-tool.html` | Graph & domain tool: paint a domain on a grid (pinned first on `toys.html`) |
| `sims/graph-tool.js` | The graph tool's code (painting, torus, formula box, undo, save/load) |
| `sims/connected-colouring.html` | Random connected colouring sim (box, torus, or a domain drawn in the graph tool) |
| `sims/connected-colouring.js` | That sim's page: domains, the start, drawing, statistics, the custom-domain steps |
| `sims/connected-colouring-chain.js` | That sim's Markov chain (ReCom with a uniform correction), run in a Web Worker |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  on *every* page (the top bar is copied into each file).
- **Add a sim:** copy `sims/example.html`, fill in the four boxes, and add a
  card for it on `toys.html` with its genre labels (`<li>` items in the
  card's `<ul class="tags">`). New genres get a filter button automatically.
- **Move the sim quadrants around:** edit `grid-template-areas` in section 6
  of `css/style.css`.

The earlier version of the site (with the old simulations) is saved in git
history at commit `8e68754`.
