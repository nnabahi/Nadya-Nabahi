/* =====================================================================
   first-passage-percolation.js  —  the page of the "First Passage
   Percolation" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: the whole plane, a box or torus of cells (on
       the square grid, or on any tiling by regular polygons, its tiles
       or its corners being the cells), a region drawn in the graph tool
       (shown inside this page), or a ball of the hyperbolic plane or a
       tree. The domain code is shared with the other
       sims (js/sim-domains.js, js/sim-tilings.js, js/sim-controls.js,
       js/sim-hyperbolic.js).
     - Gives every edge (or every cell) its random passage time w, from
       the Random variables box (js/sim-random.js), and finds passage
       times and geodesics with Dijkstra's algorithm
       (first-passage-percolation-rule.js).
     - Ball mode: Play finds the cells one at a time in order of their
       passage time T(0, x) from the start, so the ball B(t) grows; each
       cell is colored by its T, from blue (0) to red (t). On the whole
       plane the domain is a box around the start that doubles whenever
       the ball is about to reach its edge (section 4).
     - Pairs mode: 2n particles at uniformly random cells, paired
       uniformly; Play adds the pairs one at a time, each with its
       geodesic, in its own color, side by side where they share edges.
     - The statistics: the ball's size, shape and holes over time, or
       how the geodesics share edges.
   All of it runs in the page itself: a step is one cell, or one pair,
   which takes well under a millisecond (or a few, for a pair).

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The passage times
     4. The domain growing, for the whole plane
     5. Ball mode
     6. Pairs mode
     7. Running: Play, Step and Restart
     8. Colors
     9. Drawing
    10. Dragging and clicking
    11. Statistics
    12. The domain
    13. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default box (in cells, or on another tiling in side lengths),
// seed and number of pairs, and the line the Random variables box
// starts with.
const DEFAULTS = { width: 80, height: 80, seed: "1", pairs: 20 };
const FIRST_LINES = "w ~ exp(1)";
const MAX_SIDE = 300;             // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels

// The whole plane: the box it starts as (side lengths), and the most
// cells the box may grow to (it doubles each time). In Pairs mode the
// particles are in the middle of the first box: within PAIRS_REACH of
// the start each way.
const WHOLE = { side: 64, cells: 300000 };
const PAIRS_REACH = 16;

// The whole plane's picture shows the ball (or the pairs) with this many
// side lengths to spare all round, and at least this many across.
const SPARE = 2, SHOWN_LEAST = 20;

// Hyperbolic plane or tree: a ball's default radius R, its largest R,
// and the most cells it may have.
const BALL = { R: 6, most: 20, cells: 20000 };

// Play adds this many cells (Ball) or pairs (Pairs) per second.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 20;

// The colors of the picture.
const EMPTY = "#ffffff";          // cells not reached yet (and every cell in Pairs mode)
const HOLE = "#a9cbe8";           // the holes of B(t), with "shade the holes" on
const TREE = "#1e1e1e";           // the geodesic tree, the start's dot, the particles' rims
const GEODESIC = "#ffffff";       // the clicked cell's geodesic (edged in TREE, so it shows on every color)
const AXIS = "#2f6fd6", DIAGONAL = "#c8402f";   // the cells along the axis and the diagonal (T(0, x)/|x| chart)

// The geodesic tree is drawn on cells at least this many pixels big
// (smaller, it would hide the colors).
const SMALLEST_LINED_CELL = 8;

// A press this many steps (cells) or fewer from the start, or from a
// particle, picks it up, so it can be grabbed without pressing exactly
// on it.
const GRAB_STEPS = 2;

// The ball's shape: the farthest cell in each of this many directions
// (newShape, js/sim-shape.js).
const SHAPE_BINS = 120;

// The T(0, x)/|x| chart shows at most about this many cells (evenly
// picked), so it stays quick.
const MOST_DOTS = 4000;

// The colors from blue (low) to red (high) (heatColor, js/sim-colors.js),
// in 256 steps, worked out once.
const PALETTE = [];
for (let k = 0; k < 256; k++) PALETTE.push(heatColor(k / 255));


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domain = null;      // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js); its kind is domains.kind (section 12)
let edge = null;        // for a domain that grows (the whole plane), its cells on its edge (edgeCells); else null
let weights = null;     // one uniform U per edge or cell (newWeights)
let passage = null;     // the passage times, w at each edge or cell (passageTimes)
let variables = null;   // the Random variables box's random variables (js/sim-random.js): w is the passage time
const sliders = {};     // the box's sliders ({ letter: { value, min, max, step } }, js/formulas.js)
let mode = "ball";      // "ball" or "pairs"

// Ball mode.
let start = 0;          // the start, the cell 0 of T(0, x)
let search = null;      // Dijkstra's algorithm from the start (newSearch)
let farness = null;     // farness[v] = |v|: how far cell v is from the start (section 5)
let shape = null;       // the ball's shape (newShape, js/sim-shape.js), on flat domains; else null
let trace = null;       // the ball over time, for the charts (newTrace, js/sim-worker.js)
let clicked = -1;       // the clicked cell, whose geodesic is drawn (-1: none)
let refreshHoles = null; // keeps the holes of B(t) up to date (newRefresher, js/sim-shape.js; section 11)

// Pairs mode.
let nPairs = DEFAULTS.pairs;   // n, from the slider
let order = [];         // the cells the particles may be at, in a uniformly random order (randomOrder)
let moved = new Map();  // particle k -> the cell it was dragged to
let pairs = [];         // the pairs shown, pair i being particles 2i and 2i + 1: { a, b, time, path, distance }
let shownPairs = 0;     // how many pairs Play has added


/* =====================================================================
   3. THE PASSAGE TIMES
   ---------------------------------------------------------------------
   Each edge (or cell) keeps the uniform U behind its w, from the seed
   and its place (newWeights), and its time is w there: F^-1(U) for w ~
   a law (passageTimes). A new law, a slider moved, or moving the times
   from the edges to the cells, gives new times; the run then goes back
   over the same number of cells, or the same pairs, with them (coupled:
   section 5).
   ===================================================================== */

function onCells() { return checked("weights") === "cells"; }

// New U's: a new domain or seed, or the times moved to the cells.
function newNumbers() {
  weights = newWeights(domain, byId("seed").value, onCells());
  passage = findTimes();
}

// New times from the same U's, for a new law: then the same run again.
function newTimes() {
  passage = findTimes();
  redoRun();
}

// The times with the box's random variables. A formula for w can come
// out negative somewhere (the box can only check a law): then the line
// under the box says so, and the times come from the starting line,
// w ~ exp(1), until it is fixed.
const FIRST_VARIABLES = randomVariablesOf(FIRST_LINES);
function findTimes() {
  try { return passageTimes(domain, weights, variables); }
  catch (problem) {
    box.say(problem.message + " Until that is fixed, the times are from " + FIRST_LINES + ".");
    return passageTimes(domain, weights, FIRST_VARIABLES);
  }
}

// What the box can't take: w as a family (it is one number per edge),
// or a law for w that can be negative.
function timesProblem(v) {
  const line = v.declared.byName.get("w");
  if (line.family) return "w is one number for each edge (or cell): type it without a subscript, like  w ~ exp(1).";
  if (line.kind === "law" && v.lawOf("w").least < 0) return "Passage times can't be negative: w's law must be 0 for every x < 0.";
  return "";
}


/* =====================================================================
   4. THE DOMAIN GROWING, FOR THE WHOLE PLANE
   ---------------------------------------------------------------------
   The whole plane is a box around (0, 0). A path that leaves it crosses
   a cell on its edge first, so until Dijkstra's algorithm is about to
   find an edge cell, every T it has found is the plane's (pathBetween,
   first-passage-percolation-rule.js, says why). Then the box doubles,
   every edge keeps its time (the U's come from the places, not the
   cells' numbers), and the run goes back over the same cells in the
   bigger box. The check page tests this.
   (The hyperbolic plane or a tree has no "whole" here, only balls: the
   number of cells within R steps grows exponentially in R, and B(t),
   thin there like a tree, reaches the edge of a ball long before it
   fills it, so a ball that grows a layer at a time would stop B(t)
   after a few dozen cells.)
   ===================================================================== */

// The whole plane's box of side "side", centered on (0, 0). "whole" is
// the box around all of its picture (the picture shows part of it:
// shownBox, section 9).
function wholePlane(side) {
  const d = onSquares() ? boxDomain(side, side, 4, false, true) : tilingBox(tilingInUse.block, side, side, false, true);
  return Object.assign(d, { grows: true, side: side, whole: pictureBox(d) });
}

// The next bigger box, or null if it would be too big.
function biggerDomain() {
  return domain.grows && 4 * domain.n <= WHOLE.cells ? wholePlane(2 * domain.side) : null;
}

// Can the domain grow? (Asked by the run, only for a domain that grows.)
let tooBig = false;     // the domain is as big as it can be
function canGrow() { return domain.grows && !tooBig; }

// Grow the domain, keeping the start, the clicked cell and the dragged
// particles where they are. Returns false if it can't grow. (The run of
// the mode not shown is then behind: it is found again when it is shown,
// section 13.)
function grow() {
  const bigger = biggerDomain();
  if (bigger === null) { tooBig = true; return false; }
  const same = function (v) { return v === -1 ? -1 : cellAtPoint(bigger, ...cellMiddle(domain, v)); };   // (js/sim-domains.js)
  start = same(start);
  clicked = same(clicked);
  for (const [k, v] of moved) moved.set(k, same(v));
  useDomain(bigger);
  return true;
}

// Switch to domain d: its edge, its times, and the particles' order.
function useDomain(d) {
  domain = d;
  edge = d.grows ? edgeCells(d) : null;
  newNumbers();
  order = randomOrder(d, byId("seed").value, pairCells(d));
}


/* =====================================================================
   5. BALL MODE
   ---------------------------------------------------------------------
   Dijkstra's algorithm from the start finds one more cell each step
   (newSearch). The cells found so far are B(t), t being the last one's
   T. Each new cell joins the shape (its farthest cell in each direction,
   area and hull), and every so often the trace keeps a sample for the
   charts over time. A new law, new times or a new start go back over
   the same number of cells (runBallTo), so the ball changes as little
   as it can.
   ===================================================================== */

// The ball again, from the start, with the same number of cells (at
// least the start).
function runBallTo(count) {
  search = newSearch(domain, passage, start);
  farness = farnessFrom(start);
  shape = shapeWanted() ? newShape(cellMiddle(domain, start), SHAPE_BINS) : null;
  trace = newTrace();
  refreshHoles = newRefresher();
  while (search.order.length < Math.max(count, 1) && findNextCell());
  if (clicked !== -1 && !search.settled[clicked]) clicked = -1;
}

// Find the next cell of the ball. Returns false if there is none: every
// cell is found, or the next is on the edge of a domain that can't grow.
// On a domain that can grow, the next cell on its edge grows it first,
// and the ball is found again in the bigger domain.
function findNextCell() {
  const v = search.peek();
  if (v === -1) return false;
  if (edge && edge[v]) {
    if (!canGrow()) return false;
    const count = search.order.length;
    grow();
    runBallTo(count);
    return findNextCell();
  }
  search.next();
  noteCell(v);
  return true;
}

// A cell joins the ball: its shape, and the trace (time t, the number
// of cells, and the shape) every so often.
function noteCell(v) {
  if (shape) shape.add(cellMiddle(domain, v), cornersOf(domain, v));
  keepSample(trace, search.order.length, function () {
    const values = { t: search.T[v] };
    if (shape) { values.convexity = shape.convexity(); values.radii = shape.radii; }
    return values;
  });
}

// Is the ball done: no next cell, or the next can't be found?
function ballIsDone() {
  const v = search.peek();
  return v === -1 || Boolean(edge && edge[v] && !canGrow());
}

// The time t: the last cell's T.
function ballTime() { return search.T[search.order[search.order.length - 1]]; }

// Is the domain flat (not the hyperbolic plane or a tree), and not a
// torus? Only there do the shape and the holes mean anything.
function shapeWanted() { return domains.kind !== "graph" && !domain.wrap; }

// How far each cell is from cell a, as |x| in T(0, x)/|x|: on a flat
// domain, the straight line between their middles (on a torus, to the
// nearest copy); on the hyperbolic plane or a tree, the number of steps.
function farnessFrom(a) {
  if (domains.kind === "graph") return Float64Array.from(stepsFrom(domain, [a]));
  const middles = cellMiddles(domain), steps = domain.wrap ? torusSteps(domain) : null, from = middles[a];
  return Float64Array.from(middles, function (m) {
    const p = nearestCopy(m, from, steps);
    return Math.hypot(p[0] - from[0], p[1] - from[1]);
  });
}


/* =====================================================================
   6. PAIRS MODE
   ---------------------------------------------------------------------
   The particles are the first 2n cells of a uniformly random order of
   the cells they may be at (randomOrder): all of a bounded domain, or
   the middle of the whole plane. Pair i is particles 2i and 2i + 1, so
   the pairs are uniform too, and adding pairs (raising n, or Play)
   keeps the ones there. Each pair's geodesic comes from Dijkstra's
   algorithm from one particle, stopped at the other (pathBetween). On
   the whole plane, a geodesic search that reaches the box's edge first
   grows the box, and the pairs are found again in the bigger one.
   ===================================================================== */

// The cells of domain d the particles may be at: every cell, or on the
// whole plane, those whose middle is within PAIRS_REACH of (0, 0) each
// way.
function pairCells(d) {
  const all = Array.from({ length: d.n }, function (_, v) { return v; });
  if (!d.grows) return all;
  return all.filter(function (v) {
    const [u, w] = cellMiddle(d, v);
    return Math.abs(u) < PAIRS_REACH && Math.abs(w) < PAIRS_REACH;
  });
}

// The most pairs there can be: half the cells they may be at.
function mostPairs() { return Math.floor(order.length / 2); }

// The cell of particle k: where it was dragged, or its place in the order.
function particleCell(k) { return moved.has(k) ? moved.get(k) : order[k]; }

// Find the geodesic of each pair shown that isn't found yet. A search
// that reaches the edge of a domain that can grow grows it, and then
// the pairs are found again (their cells have new numbers).
function findPairs() {
  while (pairs.length < shownPairs) {
    const i = pairs.length, a = particleCell(2 * i), b = particleCell(2 * i + 1);
    const found = pathBetween(domain, passage, a, b, canGrow() ? edge : null);
    if (found && found.atEdge) {
      if (!grow()) continue;     // (it can't grow: the next try searches the box as it is)
      pairs = [];
      continue;
    }
    pairs.push({ a: a, b: b, time: found ? found.time : Infinity, path: found ? found.path : [], distance: pairDistance(a, b) });
  }
}

// How far apart the cells of a pair are, as for farnessFrom.
function pairDistance(a, b) {
  if (domains.kind === "graph") return stepsFrom(domain, [a])[b];
  const steps = domain.wrap ? torusSteps(domain) : null, from = cellMiddle(domain, a);
  const p = nearestCopy(cellMiddle(domain, b), from, steps);
  return Math.hypot(p[0] - from[0], p[1] - from[1]);
}

// Find the pairs again (new times, a particle moved, or a bigger box).
function redoPairs() {
  pairs = [];
  findPairs();
}

// How many geodesics use each edge: a Map from edgeKey to { v, w,
// pairs }, "pairs" being the pairs whose geodesic uses it, in order.
function edgeUse() {
  const use = new Map();
  pairs.forEach(function (pair, i) {
    for (let k = 0; k + 1 < pair.path.length; k++) {
      const v = pair.path[k], w = pair.path[k + 1], key = edgeKey(domain, v, w);
      if (!use.has(key)) use.set(key, { v: v, w: w, pairs: [] });
      use.get(key).pairs.push(i);
    }
  });
  return use;
}

// The colors of the pairs: the site colors the sims share (defaultColors,
// js/sim-colors.js), one for each of the n pairs.
function pairColors() { return defaultColors(nPairs); }


/* =====================================================================
   7. RUNNING: PLAY, STEP AND RESTART
   ---------------------------------------------------------------------
   One step is one more cell of the ball, or one more pair, on the run
   loop every sim uses (makeRunLoop, js/sim-worker.js). Everything is
   quick, so it runs in the page.
   ===================================================================== */
const runner = makeRunLoop(function () { return mode === "ball" ? findNextCell() : addPair(); },
                           function () { drawSoon(); player.showDone(); },
                           function () { return mode === "ball" ? ballIsDone() : shownPairs >= Math.min(nPairs, mostPairs()); });

// One more pair.
function addPair() {
  if (shownPairs >= Math.min(nPairs, mostPairs())) return false;
  shownPairs++;
  findPairs();
  return true;
}

// Restart: back to the start (just the start cell, or no pairs), paused.
function restart() {
  player.setPlaying(false);
  tooBig = false;
  runBallTo(1);
  shownPairs = 0;
  pairs = [];
  afterChange();
}

// The shown mode's run again, with new times, a new start or a moved
// particle: as many cells, or the same pairs. (The other mode's run is
// found again when it is shown, section 13. A burst of changes, from a
// slider being dragged, is worked out once per screen refresh.)
function redoShown() {
  if (mode === "ball") runBallTo(search.order.length); else redoPairs();
}
const redoRun = oncePerFrame(function () {
  redoShown();
  afterChange();
});

// After a change: draw, and gray out Play and Step if the run is done.
function afterChange() {
  drawSoon();
  player.showDone();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(runner, SPEEDS, DEFAULT_SPEED, "cell", "cells", restart);


/* =====================================================================
   8. COLORS
   ---------------------------------------------------------------------
   Ball mode: a cell of B(t) is colored by T(0, x) / t, from blue (0)
   to red (t); a cell not reached yet is white, and a hole's cell light
   blue with "shade the holes". Pairs mode: every cell is white, with
   the thin gray lines of the lattice, and each pair has its own color.
   ===================================================================== */
const EMPTY_RGB = hexToRGB(EMPTY), HOLE_RGB = hexToRGB(HOLE), OUTSIDE_RGB = hexToRGB(OUTSIDE_CELLS);

// The color of a time T when the ball's time is t, as [red, green, blue].
function timeRGB(T, t) { return PALETTE[t > 0 ? Math.min(255, Math.round(255 * T / t)) : 0]; }

// Cell v's color in Ball mode.
function ballRGB(v, t, inHole) {
  if (search.settled[v]) return timeRGB(search.T[v], t);
  return inHole && inHole[v] ? HOLE_RGB : EMPTY_RGB;
}

// The key under the picture: the colors from 0 to t, as a strip (a CSS
// gradient), in Ball mode.
function showColorKey() {
  byId("color-key").hidden = (mode !== "ball");
  if (mode !== "ball") return;
  const stops = [];
  for (let k = 0; k <= 10; k++) stops.push(rgbToHex(PALETTE[Math.round(25.5 * k)]));
  byId("key-strip").style.background = "linear-gradient(to right, " + stops.join(", ") + ")";
  byId("key-low").textContent = "T = 0";
  byId("key-high").textContent = "T = t = " + shortNumber(ballTime());
}

// A number (a time, a distance), to 4 significant digits.
function shortNumber(x) { return Number(x.toPrecision(4)).toLocaleString(); }


/* =====================================================================
   9. DRAWING
   ---------------------------------------------------------------------
   On a box, a torus, a drawn region or the whole plane, one square (or
   polygon) per cell (paintDomain, js/sim-view.js), with the lines on
   top joining the cells' middles (cellLinesPath). On the hyperbolic
   plane or a tree, the disk, the half-plane or the tree spread out
   (drawBall, js/sim-hyperbolic.js), with the lines through the sides
   the cells share (ballLinesPath). On top:
     Ball mode: the geodesic tree (thin black), the clicked cell's
       geodesic (white, edged in black), a disk to compare with
       (dashed, the ball's average radius), and a black dot on the
       start.
     Pairs mode: the geodesics, each pair in its color. On an edge that
       k geodesics share, k lines of decreasing width are drawn one on
       another, the first pair's widest, so all k show as stripes, like
       transit lines; the particles are dots in their pair's color.
   On the whole plane the picture shows only the part of the box around
   the ball (or the pairs), so it zooms out smoothly as the ball grows,
   as Eden Growth's picture does, rather than jumping when the box
   doubles.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh).
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });

const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js).
const disk = makeDiskView(simCanvas, view, function () { domains.show(); });

function drawPicture() {
  showColorKey();
  if (!domain || !search || simCanvas.hidden) return;
  const onBall = domains.kind === "graph";
  const pen = onBall ? paintBall() : paintFlat();
  const linesPath = onBall ? ballLinesPath.bind(null, disk, domain) : cellLinesPath.bind(null, view, domain);
  const dotsPath = onBall ? ballDotsPath.bind(null, disk, domain) : cellDotsPath.bind(null, view, domain);
  const width = onBall ? (isTree(disk.spec) ? 2 : 1.5) : Math.max(1.2, cellSize(view) * 0.15);
  pen.lineCap = pen.lineJoin = "round";
  if (mode === "ball") drawOnBall(pen, linesPath, dotsPath, width, onBall);
  else drawPairs(pen, linesPath, dotsPath, width);
  if (!onBall) pen.restore();
}

// The cells, flat (paintDomain): Ball mode's colors (with the holes'
// cells off the domain, on squares, painted on top), or Pairs mode's
// white cells with the lattice's thin gray lines. Returns the pen.
function paintFlat() {
  if (domain.grows) domain.shown = shownBox();
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT, domain.grows);
  const self = function (v) { return v; };
  if (mode === "pairs") {
    paintDomain(view, pen, domain, self, function () { return EMPTY_RGB; }, OUTSIDE_RGB, UNDER_COLOR, SMALLEST_BORDERED_CELL);
    return pen;
  }
  const t = ballTime(), inHole = shownHoles();
  paintDomain(view, pen, domain, self, function (v) { return ballRGB(v, t, inHole && inHole.cells); }, OUTSIDE_RGB, null, 0);
  if (inHole && !domain.lattice) shadeSquares(view, pen, domain, inHole.offDomain, HOLE);
  return pen;
}

// The part of the whole plane's box the picture shows (as domain.shown,
// which pictureBox, js/sim-domains.js, reads): around the middles of the
// cells shown and the square SHOWN_LEAST across around the start (in
// Pairs mode, the square where the particles may be, around (0, 0)),
// with SPARE side lengths and a cell's width to spare all round, inside
// the whole box. (On squares, whose middles are whole numbers, its
// sides are then along the squares' sides.)
function shownBox() {
  const middles = cellMiddles(domain), half = mode === "ball" ? SHOWN_LEAST / 2 : PAIRS_REACH;
  const [u0, w0] = mode === "ball" ? middles[start] : [0, 0];
  let left = u0 - half, right = u0 + half, bottom = w0 - half, top = w0 + half;
  for (const v of shownCells()) {
    const [u, w] = middles[v];
    left = Math.min(left, u); right = Math.max(right, u);
    bottom = Math.min(bottom, w); top = Math.max(top, w);
  }
  const spare = SPARE + (domain.lattice ? widestCell(domain.tiling) : 0.5), whole = domain.whole;
  return { left: Math.max(whole.left, left - spare), right: Math.min(whole.right, right + spare),
           bottom: Math.max(whole.bottom, bottom - spare), top: Math.min(whole.top, top + spare) };
}

// The cells the picture is about: the ball's, or the particles' and
// their geodesics'.
function shownCells() {
  if (mode === "ball") return search.order;
  const cells = [];
  for (const pair of pairs) cells.push(pair.a, pair.b, ...pair.path);
  return cells;
}

// The cells of a ball of the hyperbolic plane or a tree (drawBall).
function paintBall() {
  if (mode === "pairs") return drawBall(disk, domain, function () { return EMPTY; });
  const t = ballTime();
  return drawBall(disk, domain, function (v) { return rgbToHex(ballRGB(v, t, null)); });
}

// Ball mode's lines and dots, "width" pixels thick.
function drawOnBall(pen, linesPath, dotsPath, width, onBall) {
  if (byId("show-tree").checked && (onBall || cellSize(view) >= SMALLEST_LINED_CELL)) {
    pen.strokeStyle = TREE;
    pen.lineWidth = Math.max(1, width * 0.6);
    pen.stroke(linesPath(function (add) {
      for (const v of search.order) if (search.parent[v] !== -1) add(v, search.parent[v]);
    }));
  }
  if (clicked !== -1) {
    const path = geodesic(search, clicked);
    const line = linesPath(function (add) { for (let k = 0; k + 1 < path.length; k++) add(path[k], path[k + 1]); });
    const ring = dotsPath([clicked], 2.6 * width);
    for (const [color, extra] of [[TREE, 2], [GEODESIC, 0]]) {    // a black edge, then the white line on it
      pen.strokeStyle = color;
      pen.lineWidth = 2 * width + extra;
      pen.stroke(line);
      pen.lineWidth = Math.max(1.5, width / 2) + extra;
      pen.stroke(ring);
    }
  }
  if (!onBall && shape && byId("show-disk").checked) drawDisk(pen);
  pen.fillStyle = TREE;
  pen.fill(dotsPath([start], 2 * width));
}

// A dashed circle around the start with the ball's average radius (over
// the directions: meanRadius, js/sim-charts.js), to compare its shape
// with a disk.
function drawDisk(pen) {
  const radius = meanRadius(shape.radii, 0, SHAPE_BINS);
  if (radius === 0) return;
  const [u, w] = cellMiddle(domain, start), copy = screenCopies(view, domain)[0];
  pen.beginPath();
  pen.arc(copy.sx(u), copy.sy(w), radius * view.cell, 0, 2 * Math.PI);
  pen.setLineDash([6, 4]);
  pen.strokeStyle = TREE;
  pen.lineWidth = 1.5;
  pen.stroke();
  pen.setLineDash([]);
}

// Pairs mode's geodesics and particles. On an edge with k geodesics,
// the j-th pair there (counting from 0) is drawn k - j stripes wide, so
// the first pair's line is the widest and each later one is drawn on
// it, narrower. A stripe is a bit thicker than the other lines, but
// thinner on an edge whose bundle would be wider than about a cell.
// Each pair's lines are gathered by their width, and the widest are
// drawn first.
function drawPairs(pen, linesPath, dotsPath, width) {
  const colors = pairColors(), groups = new Map();    // "width,i" -> pair i's lines that wide, as [v, w, v, w, ...]
  const widest = domains.kind === "graph" ? 10 * width : Math.max(4 * width, 0.9 * cellSize(view));
  const stripe = Math.max(1.5, width);
  for (const { v, w, pairs: on } of edgeUse().values()) {
    const k = on.length, thick = Math.min(stripe, widest / k);
    on.forEach(function (i, j) {
      const key = ((k - j) * thick).toFixed(2) + "," + i;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v, w);
    });
  }
  const keys = Array.from(groups.keys()).sort(function (p, q) { return parseFloat(q) - parseFloat(p); });
  for (const key of keys) {
    const [lineWidth, i] = key.split(",").map(Number), ends = groups.get(key);
    pen.strokeStyle = colors[i];
    pen.lineWidth = lineWidth;
    pen.stroke(linesPath(function (add) { for (let k = 0; k < ends.length; k += 2) add(ends[k], ends[k + 1]); }));
  }
  pairs.forEach(function (pair, i) {
    const dots = dotsPath([pair.a, pair.b], Math.max(3.5, 2.2 * width));
    pen.fillStyle = colors[i];
    pen.fill(dots);
    pen.strokeStyle = TREE;
    pen.lineWidth = 1;
    pen.stroke(dots);
  });
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   10. DRAGGING AND CLICKING
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-view.js). On a hyperbolic tiling or
   tree, one pointer drags across the plane instead.
   Ball mode: the start's dot can be dragged (a press at most GRAB_STEPS
   from it picks it up), and the ball is found again from where it is
   dropped, with as many cells. A click on a cell of the ball draws its
   geodesic; a click on it again, or off the ball, clears it.
   Pairs mode: a particle can be dragged the same way, and its pair's
   geodesic follows.
   ===================================================================== */
let dragging = -1;      // what a press picked up: -2 the start, k >= 0 particle k, -1 nothing

connectPicture(view, {
  disk: disk, onGraph: function () { return domains.kind === "graph"; },
  grab: {
    press: function (event) {
      dragging = grabbed(cellUnderPointer(event));
      return dragging !== -1;
    },
    move: function (event) {
      const v = cellUnderPointer(event);
      if (v === -1) return;
      if (dragging === -2 && v !== start) moveStart(v);
      if (dragging >= 0 && v !== particleCell(dragging)) moveParticle(dragging, v);
    },
    release: function () { dragging = -1; },
  },
  onClick: function (event) { clickCell(cellUnderPointer(event)); },
});

function cellUnderPointer(event) { return cellAtEvent(view, disk, domain, domains.kind === "graph", event); }

// What a press on cell v picks up: in Ball mode the start (-2), in Pairs
// mode the nearest particle (its number), if it is at most GRAB_STEPS
// away; else -1.
function grabbed(v) {
  if (v === -1) return -1;
  const steps = stepsFrom(domain, [v]);     // (js/sim-domains.js)
  const near = function (w) { return steps[w] !== -1 && steps[w] <= GRAB_STEPS; };
  if (mode === "ball") return near(start) ? -2 : -1;
  let best = -1;
  for (let k = 0; k < 2 * pairs.length; k++) {
    const w = particleCell(k);
    if (near(w) && (best === -1 || steps[w] < steps[particleCell(best)])) best = k;
  }
  return best;
}

function moveStart(v) {
  start = v;
  redoRun();
}

function moveParticle(k, v) {
  moved.set(k, v);
  redoRun();
}

function clickCell(v) {
  if (mode !== "ball") return;
  clicked = v === -1 || v === clicked || !search.settled[v] ? -1 : v;
  drawSoon();
}


/* =====================================================================
   11. STATISTICS
   ===================================================================== */

// Draw the charts at most every so often while playing (they take a
// while for a big ball).
const drawCharts = notTooOften(250, function () { return player.playing; }, function () {
  if (mode === "ball") ballCharts(); else pairsCharts();
});

function showStats() {
  if (!search) return;
  for (const e of document.querySelectorAll(".ball-only")) e.hidden = (mode !== "ball");
  for (const e of document.querySelectorAll(".pairs-only")) e.hidden = (mode !== "pairs");
  const flat = mode === "ball" && Boolean(shape);
  for (const e of document.querySelectorAll(".shape-only, .holes-only")) e.hidden = !flat;
  byId("holes-row").hidden = byId("disk-row").hidden = !shape;
  byId("stat-domain").textContent = domainText();
  if (mode === "ball") ballTable(); else pairsTable();
  drawCharts();
  showMessage(tooBig ? "The whole plane is a box around (0, 0) that grows as needed; it has reached " +
                       domain.n.toLocaleString() + " cells, the most this page uses, so the run stops at its edge." : "");
}

// The domain's row: its cells, and on the whole plane how big the box is now.
function domainText() {
  const cells = domain.n.toLocaleString() + " cells";
  return domain.grows ? cells + ", a box " + domain.side + " across so far" : cells;
}

// --- Ball mode --------------------------------------------------------
function ballTable() {
  const order = search.order, t = ballTime();
  let far = 0;
  for (const v of order) far = Math.max(far, farness[v]);
  byId("stat-time").textContent = shortNumber(t);
  byId("stat-cells").textContent = order.length.toLocaleString();
  byId("stat-farthest").textContent = shortNumber(far) + (domains.kind === "graph" ? " steps" : "");
  byId("stat-clicked").textContent = clicked === -1 ? "none (click a cell of the ball)"
    : "T = " + shortNumber(search.T[clicked]) + ", " + (geodesic(search, clicked).length - 1) + " steps";
  if (!shape) return;
  byId("stat-convexity").textContent = shape.convexity().toFixed(3);
  const h = currentHoles();
  byId("stat-holes").textContent = h.history.openBirths.length.toLocaleString();
  byId("stat-closed").textContent = h.history.deaths.length.toLocaleString();
}

function ballCharts() {
  const ts = trace.lists.t || [];      // the time t of each sample (trace.times has its numbers of cells)
  plotOverTime(byId("size-chart"), ts, [{ values: trace.times, color: CHART_LINE }], "time t");
  ratioChart();
  if (!shape) return;
  plotOverTime(byId("convexity-chart"), ts, [{ values: trace.lists.convexity, color: CHART_LINE }], "time t", 1);
  radiusChart(byId("radius-chart"), shape.radii);
  radiusHeatChart(byId("radius-heat-chart"), ts, trace.lists.radii, SHAPE_BINS, "time t");
  const h = currentHoles(), upTo = ts.filter(function (t) { return t <= h.at; });
  plotOverTime(byId("holes-chart"), upTo, [{ values: bettiOverTime(h.history, upTo), color: CHART_LINE }], "time t");
  persistenceChart(byId("persistence-chart"), h.history.births, h.history.deaths, checked("against"), h.at, "time");
}

// T(0, x)/|x| against |x| for the cells of the ball (at most about
// MOST_DOTS of them, evenly picked), see-through gray, and on a flat
// domain the cells along the axis to the right of the start and along
// the diagonal up and to the right, as lines: the cells whose middles
// are within half a side length of those rays.
function ratioChart() {
  const order = search.order, every = Math.max(1, Math.ceil(order.length / MOST_DOTS));
  const cloud = [], axis = [], diagonal = [];
  const flat = domains.kind !== "graph", [u0, w0] = flat ? cellMiddle(domain, start) : [0, 0];
  order.forEach(function (v, k) {
    const far = farness[v];
    if (far === 0) return;
    const point = [far, search.T[v] / far];
    if (k % every === 0) cloud.push(point);
    if (!flat || domain.wrap) return;
    const [u, w] = cellMiddle(domain, v), du = u - u0, dw = w - w0;
    if (du > 0 && Math.abs(dw) <= 0.5) axis.push(point);
    if (du > 0 && dw > 0 && Math.abs(du - dw) / Math.SQRT2 <= 0.5) diagonal.push(point);
  });
  const byFar = function (p, q) { return p[0] - q[0]; };
  const series = [{ points: cloud, dots: true, radius: 1.5, alpha: 0.3, color: CHART_TEXT },
                  { points: axis.sort(byFar), color: AXIS }, { points: diagonal.sort(byFar), color: DIAGONAL }];
  lineChart(byId("ratio-chart"), series, { from: 0, to: Math.max(1, seriesRange(series, 0)[1]), word: flat ? "|x|" : "steps |x|" },
            { from: 0, to: Math.max(1e-9, seriesRange(series, 1)[1]), round: true, word: "T(0, x) / |x|" });
  byId("ratio-help").innerHTML = "Gray: every cell of B(t)" + (every > 1 ? " (one in " + every + ")" : "") + "." +
    (flat && !domain.wrap ? ' Lines: the cells along the axis to the right (<span style="color:' + AXIS + '">blue</span>) and the diagonal (<span style="color:' +
      DIAGONAL + '">red</span>).' : "") + (flat ? "" : " |x| is the number of steps from the start.");
}

// The holes of B(t): { history (holeHistory, js/sim-shape.js), at (the
// time t they are for), cells (1 for each cell of the domain in a
// hole), offDomain (on squares, the holes' cells off the domain, as x0,
// y0, x1, y1, ...) }. They are found again when the ball has grown, but
// while playing only now and then (newRefresher, js/sim-shape.js).
function currentHoles() {
  return refreshHoles(search.order.length, player.playing, findHoles);
}

// The holes of B(t) now, found from scratch: the ball's cells, each
// born at its T.
function findHoles() {
  const bornAt = new Float64Array(domain.n).fill(-1);
  for (const v of search.order) bornAt[v] = search.T[v];
  const set = { siteX: domain.x, siteY: domain.y, siteZ: domain.part, tiling: domain.lattice ? domain.tiling : null, bornAt: bornAt };
  const t = ballTime(), history = holeHistory(set, t);
  return Object.assign({ history: history, at: t }, holeCellsOf(history.holeCells));
}

// The holes' cells (holeHistory's holeCells): those of the domain, and
// on squares those off it (a drawn region can have a hole of B(t) where
// it has no cells).
function holeCellsOf(list) {
  const cells = new Uint8Array(domain.n), offDomain = [];
  const parts = domain.lattice ? 3 : 2;
  for (let k = 0; k < list.length; k += parts) {
    const v = domain.lattice ? tilingCell(domain, list[k], list[k + 1], list[k + 2]) : cellAt(domain, list[k], list[k + 1]);
    if (v !== -1) cells[v] = 1;
    else if (!domain.lattice) offDomain.push(list[k], list[k + 1]);
  }
  return { cells: cells, offDomain: offDomain };
}

// The holes to shade in the picture, or null.
function shownHoles() { return shape && byId("show-holes").checked ? currentHoles() : null; }

// --- Pairs mode -------------------------------------------------------
function pairsTable() {
  const use = edgeUse();
  let shared = 0, most = 0, ratio = 0, counted = 0;
  for (const { pairs: on } of use.values()) { if (on.length > 1) shared++; most = Math.max(most, on.length); }
  for (const pair of pairs) if (pair.distance > 0 && pair.time < Infinity) { ratio += pair.time / pair.distance; counted++; }
  byId("stat-pairs").textContent = pairs.length + " of " + Math.min(nPairs, mostPairs());
  byId("stat-used").textContent = use.size.toLocaleString();
  byId("stat-shared").textContent = shared.toLocaleString() + (use.size ? " (" + (100 * shared / use.size).toFixed(1) + "%)" : "");
  byId("stat-most").textContent = most.toLocaleString();
  byId("stat-ratio").textContent = counted ? (ratio / counted).toFixed(3) : "";
}

function pairsCharts() {
  // How many edges k geodesics use, one bar per k.
  const counts = [0];
  for (const { pairs: on } of edgeUse().values()) {
    while (counts.length <= on.length) counts.push(0);
    counts[on.length]++;
  }
  const bars = counts.map(function (count, k) { return { from: k - 0.5, to: k + 0.5, value: count }; }).slice(1);
  const log = byId("usage-log").checked;
  barChart(byId("usage-chart"), bars, { from: 0.5, to: Math.max(1, counts.length - 1) + 0.5, whole: true, word: "k geodesics" },
           { from: 0, to: Math.max(1, ...counts), scale: log ? "log+1" : "linear", round: !log, whole: true, word: "edges" });

  // Each pair: T(x, y) against how far apart they are, in its color.
  const colors = pairColors(), points = [], dotColors = [];
  pairs.forEach(function (pair, i) {
    if (pair.time === Infinity) return;
    points.push([pair.distance, pair.time]);
    dotColors.push(colors[i]);
  });
  const series = [{ points: points, dots: true, radius: 3.5, border: TREE, color: function (k) { return dotColors[k]; } }];
  lineChart(byId("pairs-chart"), series,
    { from: 0, to: Math.max(1, seriesRange(series, 0)[1]), word: domains.kind === "graph" ? "steps between them" : "distance |x - y|" },
    { from: 0, to: Math.max(1e-9, seriesRange(series, 1)[1]), round: true, word: "T(x, y)" });
  byId("pairs-help").textContent = domains.kind === "graph" ? "Across: the fewest steps between the two particles." :
    "Across: the straight-line distance between the two particles, in side lengths.";
}


/* =====================================================================
   12. THE DOMAIN
   ---------------------------------------------------------------------
   Whole plane / Box / Torus / Custom / Hyperbolic plane or tree, and
   their options, the Lattice options among them (connectDomains,
   js/sim-controls.js). Custom swaps the picture for the graph tool,
   where any drawing of at least two cells works (a cell no path reaches
   is never in the ball). A new domain starts again (paused) from its
   middle cell, with the same seed.
   ===================================================================== */
const domains = connectDomains({
  view: view, player: player, disk: disk,
  whole: function () { return wholePlane(WHOLE.side); },
  box: function () { return boxFromOptions(2, MAX_SIDE, DEFAULTS); },
  ball: function () { return ballFromOptions(disk, BALL); },
  custom: { check: atLeastTwoCells, help: "Paint the cells (any color counts): neighbors share a side. Then press Done." },
  use: function (d) {
    start = middleCell(d);
    clicked = -1;
    moved.clear();
    tooBig = false;
    useDomain(d);
    restart();
  },
});

// The start on a new domain d: the cell whose middle is nearest the
// middle of its picture (on the whole plane, nearest (0, 0)), or on a
// ball of the hyperbolic plane or a tree, its middle cell.
function middleCell(d) {
  if (!d.x) return 0;
  if (d.grows) return cellNearestPoint(d, 0, 0);
  const box = pictureBox(d);
  return cellNearestPoint(d, (box.left + box.right) / 2, (box.bottom + box.top) / 2);
}


/* =====================================================================
   13. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// The Random variables box (js/sim-random.js): new lines, or a slider
// moved, give new times (it starts on FIRST_LINES, before there is a
// domain).
const box = connectRandomBox({
  needs: ["w"],
  check: timesProblem,
  onRead: function (declared) {
    showSliders(byId("sliders"), declared.letters, sliders, useBox);   // (js/formulas.js)
    useBox();
  },
  sliders: function () { return sliders; },
});
function useBox() {
  const built = box.build(sliderValues(sliders));
  if (!built) return;
  variables = built;
  if (domain) newTimes();
}

// Mode: Ball or Pairs. Each keeps its run (found again, as the times or
// the domain may have changed while the other was shown); switching
// pauses.
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", function () {
    player.setPlaying(false);
    mode = radio.value;
    if (mode === "ball") player.setUnits("cell", "cells"); else player.setUnits("pair", "pairs");
    redoShown();
    afterChange();
  });
}

// Times on the edges or the cells: new U's, the same run.
for (const radio of document.querySelectorAll('input[name="weights"]')) {
  radio.addEventListener("change", function () { newNumbers(); redoRun(); });
}

// n, the number of pairs: the slider and the box move together. Fewer
// pairs drops the last ones; more lets Play add them.
const showPairs = connectSliderAndBox("pairs-slider", "pairs-box", function (value) {
  nPairs = showPairs(value);
  shownPairs = Math.min(shownPairs, nPairs);
  pairs.length = Math.min(pairs.length, shownPairs);
  afterChange();
});

// What only changes the picture or the charts.
for (const id of ["show-tree", "show-holes", "show-disk", "usage-log"]) byId(id).addEventListener("change", drawSoon);
for (const radio of document.querySelectorAll('input[name="against"]')) radio.addEventListener("change", drawSoon);

// Seed: the same seed gives the same times every time; a new one starts again.
connectSeed(function () {
  newNumbers();
  order = randomOrder(domain, byId("seed").value, pairCells(domain));
  moved.clear();
  restart();
});


// --- Start ------------------------------------------------------------
box.setText(FIRST_LINES);
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("seed").value = DEFAULTS.seed;
showPairs(nPairs);
domains.useTicked();
