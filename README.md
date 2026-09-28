# Toys n' Sims

A single-page site for browsing and playing with interactive simulations of
math models, navigated through a collapsible left ("sandwich"/hamburger)
menu.

## Running it

No build step. Just serve the folder over HTTP (browsers block ES module
imports from `file://`):

```
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Structure

```
index.html          shell: hamburger button, sidebar, #main content area
css/style.css        the whole visual design system (colors, layout, controls)
css/katex/            self-hosted KaTeX (math-preview typesetting), MIT licensed
js/app.js             router + sidebar builder + sim registry
js/lib/utils.js        shared math/color/DOM helpers
js/lib/grid.js          reusable canvas grid renderer for cell-based sims
js/lib/mathexpr.js      parses/compiles a user-typed f(x, y, ...) expression
js/lib/mathinput.js      DOM glue for mathexpr.js: live KaTeX preview + auto sliders
js/lib/katex.min.js     self-hosted KaTeX, loaded lazily only by sims that need it
js/sims/automata.js     1D cellular automata
js/sims/sandpiles.js    abelian sandpile model
js/sims/pathcount.js     lattice path-counting recursion (random open/closed edges)
js/sims/tilepacking.js   random sequential tile packing (Desmos-style S, T, f)
```

Routing is hash-based (`#automata`, `#sandpiles`, ...) so each simulation is
linkable and the browser back/forward buttons work.

## Adding a new simulation

1. Create `js/sims/yourSim.js` exporting a default object:

   ```js
   export default {
     id: "yourSim",              // used in the URL hash
     name: "Display Name",
     category: "Cellular automata", // sims sharing a category are grouped in the sidebar
     description: "One sentence shown under the title and on the home card.",
     mount(container) {
       // build canvas + controls, append to `container`
       return { destroy() { /* clear intervals/rAF, remove listeners */ } };
     },
   };
   ```

2. Import it in `js/app.js` and add it to the `sims` array. It will show up
   in the sidebar and on the home page automatically.

`js/lib/grid.js` gives you a `CanvasGrid` for anything laid out on a
rectangular cell grid (fast cell fills, click-to-cell hit testing).
`js/lib/utils.js` has `mod`, `randInt`, a categorical color palette
generator, and a tiny `el()` helper for building DOM without a framework.

### If your sim takes a user-typed function (like `gradientpercolation.js`)

`js/lib/mathexpr.js` + `js/lib/mathinput.js` give you Desmos/Wolfram-Alpha-style
typing for free, entirely self-hosted (no CDN, no API key):

- Natural syntax: `^` means exponentiation (not JS's bitwise XOR), and
  multiplication can be implicit (`2x`, `2(x+1)`, `(x+1)(x-1)`).
- Desmos-style extras: comparisons with a single `=` for equality
  (`a=b`, `a<b`, `a<=b`, ...), a piecewise block `{cond : a, b}` (`b` is
  the "otherwise" value, and may itself be another `{...}` to chain
  conditions), list literals `[a, b, c]` and indexing `d[j]`, and
  `.method()` calls &mdash; currently just `discretedist(v, w).random()`,
  a weighted random pick from a value list `v` with weights `w`.
  Anything still outside this grammar (`&&`, `||`, JS ternary `?:`)
  falls back to being compiled as raw JS, so advanced expressions still
  work, just without the live LaTeX preview.
- A safe sandbox of math names (`sin`, `sqrt`, `pow`, `mod`, `pi`, `e`, ...)
  plus `random()` / `randint(a, b)` for randomness inside the expression.
- Any identifier in the expression that isn't a bound argument or a math
  name becomes a free variable and automatically gets a Desmos-style
  slider (editable range, default −5…5) &mdash; see `syncVarSliders`.
- A live, properly typeset preview of what you typed (exponents raised,
  `sqrt` drawn as a radical, `/` as a stacked fraction, piecewise as a
  `cases` block, ...) via KaTeX, lazily loaded on first use so sims that
  don't need it never pay for it.

Usage pattern (see `gradientpercolation.js` for the classic f(x,y) case,
or `pathcount.js` for a X(i,j)/Y(i,j) box bound to different argument
names plus a precomputed array in scope): call
`freeVariables(expr, reservedNamesFor(boundArgs, extraNames))` to get the
variable list (`RESERVED_NAMES` is a shorthand for the classic x,y case),
`compileExpr(expr, varNames, boundArgs)` (boundArgs defaults to `["x","y"]`)
to get `{ fn, latex, usedFallback }`, call `fn(...boundValues, ...varValues)`
per sample point, and use `renderMathPreview()` / `syncVarSliders()` to keep
the UI in sync whenever the expression text changes. Note this is only a
parser + two renderers (to JS and to LaTeX) &mdash; it has nothing to do
with Desmos's or Wolfram Alpha's own computation/graphing engines, just the
comfortable-typing experience.

## About the Python side

Since the goal is simulations people can actually *play with* in real time
(drag a slider, click the grid, watch it react immediately), the
interactive logic for each simulation lives in JavaScript in the browser
&mdash; that's what `js/sims/*.js` is for. Pyodide (Python-in-the-browser)
was considered, but it doesn't support Numba, and startup/interaction
latency work against the "very interactive" goal.

A natural workflow that keeps your Python/numpy/numba environment useful:

- **Prototype and verify the math in Python first** (fast to iterate,
  numba for performance), then port the working rule/update-step into the
  matching `js/sims/*.js` file as the `step`/`topple`/etc. function. The
  two implementations are usually small once you strip away I/O, so this
  port is generally a handful of lines.
- **If a simulation is too expensive to run interactively in JS** (e.g. a
  large-scale statistical experiment, not a thing you nudge with a
  slider), keep that part in Python: precompute the results, export them
  as a static JSON/CSV file, and add a small sim module that just loads
  and animates/plots that precomputed data instead of recomputing it live.
  Both approaches can live side by side in this same site.

## Ported from the old site

`automata.js` and `sandpiles.js` are rebuilt, cleaned-up versions of your
original `Basic1DAutomata.js` and `Sandpiles.js` (the shared
`SquareGrid.js` they depended on wasn't in the upload, so the grid
rendering was rewritten from scratch as `js/lib/grid.js` rather than
guessed at). Behavior: automata now supports any base/rule combination
with a live rule-number input and click-to-toggle on the seed row;
sandpiles adds separate toppling-speed and storm-rate controls and a
click mode toggle for adding/removing grains.

Not yet ported (originals are still just prototype/scratch code, not full
sims): `RandomTilings.js`, `GullwingToothpick.js`, `DigitFun.js`,
`periodicfibonnaci.js`. Happy to build any of these out as proper
interactive modules the same way &mdash; just say which one's next.

## Sorting the Python research folder into sims

Your Python folder is a large, years-deep scratch space (thousands of
one-off scripts and generated plots), not something worth reorganizing in
place &mdash; renaming/moving years of research files is high-risk for very
little payoff, and most of it (loose plot exports, old coursework, language
practice scripts) was never meant to become a website page anyway.

Instead, `SIMS.md` in this folder is the sorting mechanism: a flat list of
candidate simulations grouped into the same categories that appear as
sidebar groups on the site, each tagged `live`, `candidate`, or `skip`. The
Python folder itself stays untouched; a script only "graduates" once its
update rule is ported into a new `js/sims/*.js` module and its `SIMS.md`
line is flipped to `live`. This keeps the site's navigation structure and
the backlog of what to build next in sync without ever touching the
original research files.

The category list in `SIMS.md` (cellular automata, random walks, random
matrices, packing & tilings, growth & percolation, trees/graphs/combinatorics,
number theory) was drawn from what's actually in the folder today &mdash;
treat it as a first draft. Renaming a category or moving a sim to a
different one is just editing `category` in that sim's `js/sims/*.js` file
plus its line in `SIMS.md`; nothing else depends on the exact names.
