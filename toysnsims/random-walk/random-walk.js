/* =====================================================================
   random-walk.js  —  the page of the "Random Walk" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the dimension and the weights (one slider per direction),
       and in 2D the lattice (the square grid, or another tiling).
     - Hands them to the walk (random-walk-rule.js), which runs in a
       second thread (a "Web Worker"), and draws every state it sends
       back, with the statistics.
   Small helpers used by every sim page (byId, readWhole, keepAlong,
   ...) are in js/sim-page.js, the charts in js/sim-charts.js, moving,
   zooming and painting the 2D picture in js/sim-view.js, the hull and
   holes in js/sim-shape.js (shared with Eden Growth), the visited
   sites kept for drawing in js/sim-sites.js, the 3D
   picture in js/sim-3d.js, and the tilings in js/sim-tilings.js, with
   their Lattice options in js/sim-controls.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The weights and the lattice
     4. Running the walk
     5. Drawing the walk (1D, 2D, 3D)
     6. Statistics
     7. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The directions' names, in the walk's order (random-walk-rule.js).
const DIRECTIONS = {
  1: ["right (+1)", "left (−1)"],
  2: ["right", "left", "up", "down"],
  3: ["+x (right)", "−x (left)", "+y (away)", "−y (toward you)", "+z (up)", "−z (down)"],
};
const MAX_WEIGHT = 5;              // the weight sliders go from 0 to this

const DEFAULT_SEED = "1";
// The picture always has the same size (the box's width, and this
// height in screen pixels); the walk shrinks to fit inside it as it
// spreads. In the full screen popup, it is the popup's height instead
// (pictureHeight, in js/sim-page.js).
const PICTURE_HEIGHT = 480;
const BACKGROUND = "#ffffff";     // sites not visited
const HOLE = "#a9cbe8";           // the holes, with "Shade the holes" on
const HOLE_GROUP = 64;            // (on another tiling, the holes' cells are painted as this group)
const WALKER = "#222222";         // the walker (and the origin's outline)
const HULL = "#444444";           // the convex hull's outline (2D) or solid (3D)
const NOW_LINE = "#b9c8dc";       // the "distance now" line on the distance chart

// The speeds on the Speed slider, in steps per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every step.
const SPEEDS = [1, 100, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 2;                 // 1, 2 or 3

// The latest message from the walk (see part 3 of random-walk-rule.js):
// the numbers and the charts' samples.
let latest = null;

// Every visited site, in the order first visited (the worker sends only
// the new ones each time; the pile, js/sim-sites.js, adds them up): site
// i is in block (pile.I[i], pile.J[i], pile.K[i]) and is cell
// pile.part[i] of it (on the grids: the point (I, J, K); on another
// tiling: cell part of block (I, J)), first visited at step bornAt[i].
// pile.count is how many there are.
const pile = newSitePile();
let bornAt = new Int32Array(1024);
// 1D: the position at every step (path[n] = S_n), and how many.
let path = new Int32Array(1024), pathLength = 0;

// 2D on another tiling: the tiling's repeating block (uprightBlock,
// js/sim-tilings.js), or null on the square grid (and in 1D and 3D). On
// a Penrose tiling, the page's copy of the walk's plane instead, its
// cells as the second thread sends them ("mirror": penroseMirror,
// js/sim-penrose.js). runTiling is the one of the latest restart,
// walkTiling the one of the walk on the screen (they differ until the
// new walk's first message comes).
let runTiling = null, walkTiling = null, mirror = null;

// 3D: the hull's surface area and volume, worked out when it is drawn.
let hull3D = { area: 0, volume: 0 };

// Whether "latest" is a walk to show: not just a problem, and not from
// before a switch of dimension.
function haveWalk() { return Boolean(latest && latest.traceSteps && latest.dim === dim); }


/* =====================================================================
   3. THE WEIGHTS AND THE LATTICE
   ---------------------------------------------------------------------
   One slider per direction, from 0 to MAX_WEIGHT, with the chance of
   that direction next to it. Every change takes effect at once, keeping
   the seed and the step, like a Desmos slider. In 2D the Lattice
   options (js/sim-controls.js) put the walk on another tiling, where
   every neighbor is equally likely and the sliders hide.
   ===================================================================== */

// The weights now, in the walk's order.
function weights() {
  return Array.from(document.querySelectorAll(".weight-slider")).map(function (slider) { return Number(slider.value); });
}

// Are all the weights equal (the simple random walk)?
function simpleWalk() {
  const w = weights();
  return w.every(function (v) { return v === w[0]; }) && w[0] > 0;
}

// Do the theory lines on the charts show? Only for the simple random
// walk on the line or the square or cubic grid (on another tiling the
// constants differ: see "Other tilings" in All the details).
function theoryShows() { return simpleWalk() && !walkTiling; }

// The tiling for a new walk: in 2D, the one the Lattice options say
// (tilingInUse, js/sim-controls.js), or null on the square grid.
function tilingNow() { return dim === 2 && !onSquares() ? tilingInUse.block : null; }

// The Lattice options show in 2D only, "Cells are the tiles / corners"
// only where the corners can be cells, and the weights only on the
// grids (on another tiling, a line saying each neighbor is equally
// likely).
function showLatticeOptions() {
  const tiling = tilingNow() !== null;
  byId("lattice-rows").hidden = (dim !== 2);
  byId("cells-row").hidden = !cornersCanBeCells();
  byId("weights-box").hidden = tiling;
  byId("tiling-step-note").hidden = !tiling;
}

// The sliders for this dimension, all at 1.
function showWeightRows() {
  const rows = byId("weight-rows");
  rows.innerHTML = "";
  for (const name of DIRECTIONS[dim]) {
    const row = document.createElement("div");
    row.className = "option-row";
    row.innerHTML = '<span class="weight-name"></span> ' +
      '<input type="range" class="weight-slider" min="0" max="' + MAX_WEIGHT + '" step="0.1" value="1"> ' +
      '<span class="muted weight-label"></span>';
    row.querySelector(".weight-name").textContent = name;
    row.querySelector(".weight-slider").addEventListener("input", function () { showWeights(); restart(true); });
    rows.appendChild(row);
  }
  showWeights();
}

// Each slider's weight and chance, e.g. "1 (25%)".
function showWeights() {
  const w = weights();
  const total = w.reduce(function (a, b) { return a + b; }, 0);
  document.querySelectorAll(".weight-label").forEach(function (label, k) {
    label.textContent = w[k].toFixed(1) + (total > 0 ? " (" + (100 * w[k] / total).toFixed(1) + "%)" : "");
  });
}


/* =====================================================================
   4. RUNNING THE WALK
   ---------------------------------------------------------------------
   The walk is walkWorker() in random-walk-rule.js, with newWalk(), its
   shape, the lattices and steps (js/sim-walk.js), the trace and the
   random numbers (js/sim-worker.js), the
   hull, holes and outer boundary (js/sim-shape.js), middleAt and
   cellNeighbors (js/sim-domains.js) and what grows a Penrose tiling's
   plane (js/sim-penrose.js) copied in.
   runInWorker (js/sim-page.js) runs it in a second thread, so the page
   never freezes, and hands each report to showWalk.
   ===================================================================== */
const sim = runInWorker(walkWorker,
  [newWalk, walkHull, hullCandidates3D, newTrace, keepSample, seededUniform, blockStart, middleAt, cellNeighbors]
  .concat(walkHelpers(), shapeHelpers(), penroseHelpers()), showWalk);

function showWalk(message) {
  if (message.problem) {
    latest = null;
    showMessage(message.problem);
    drawSoon();
    return;
  }
  keepSites(message);
  if (message.planeCells) addPlaneCells(walkTiling, message.planeCells);
  latest = message;
  showMessage(message.atMax ? "The walk has reached two million steps, the most this page walks." :
              message.atEdge ? "The walk has reached the edge of the part of this tiling the page builds (" +
                               PENROSE_PLANE_MOST + " side lengths from the middle each way), so it stops here." : "");
  drawSoon();
}

// Add the sites (and in 1D the positions) new in this message to the
// page's lists. A message starting from site 0 is a fresh walk (on the
// tiling of the latest restart). The walk sends each site as (x, y, z):
// on the grids its point, on another tiling cell z of block (x, y).
function keepSites(message) {
  if (message.sitesFrom === 0) { pathLength = 0; walkTiling = runTiling; }
  const at = message.sitesFrom, zeros = new Int32Array(message.siteX.length);
  pile.keep(at, message.siteX, message.siteY, walkTiling ? zeros : message.siteZ, walkTiling ? message.siteZ : zeros);
  bornAt = keepAlong(bornAt, message.bornAt, at);
  if (message.path) {
    path = keepAlong(path, message.path, message.pathFrom);
    pathLength = message.pathFrom + message.path.length;
  }
}

// Start the walk again, paused. keepStep: walk to the step we are at
// (so changing a weight keeps the step).
function restart(keepStep) {
  const tiling = tilingNow(), finite = Boolean(tiling && tiling.finite);
  if (finite) mirror = penroseMirror(mirror, tiling);
  runTiling = finite ? mirror : tiling;
  sim.setup({
    dim: dim, weights: weights(), tiling: tiling, seed: byId("seed").value,
    steps: (keepStep && haveWalk()) ? latest.steps : 0, cellsKnown: finite ? mirror.cells.length : 0,
  });
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
connectPlay(sim, SPEEDS, DEFAULT_SPEED, "step", "steps", function () { restart(false); });


/* =====================================================================
   5. DRAWING THE WALK
   ---------------------------------------------------------------------
     1D: the position across, time going down: one row of pixels for
         each stretch of time, drawn from the lowest to the highest
         position in it, and in gray the lowest and highest so far (the
         hull, an interval, over time).
     2D: the visited sites as squares (on another tiling, as its
         polygons), colored by when they were first visited (blue
         early, red just now), the convex hull through their middles,
         the holes (with "Shade the holes"), the origin (its cell
         outlined) and the walker (a black dot). It can be moved and
         zoomed (js/sim-view.js). The canvas keeps one height as the
         walk spreads, as Eden Growth's does, so the page doesn't jump.
     3D: a cube for every visited site, colored the same way, the
         walker as a ball, and the hull as a see-through solid.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawWalk(); showStats(); });

const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
connectPicture(view);   // drag and pinch the 2D picture (js/sim-view.js)
window.addEventListener("resize", drawSoon);

// The colors of "when first visited", 0 (the start) to 1 (now):
// heatColor (js/sim-colors.js) in 64 steps, worked out once.
const AGE_COLORS = [];
for (let k = 0; k < 64; k++) AGE_COLORS.push(heatColor(k / 63));
function ageGroup(i) {
  const now = Math.max(latest.steps, 1);
  return Math.min(63, Math.floor(64 * bornAt[i] / (now + 1)));
}

function drawWalk() {
  if (!haveWalk()) return;
  if (dim === 1) drawLine();
  else if (dim === 2 && walkTiling) drawTiling();
  else if (dim === 2) drawGrid();
  else draw3D();
}

// 1D: position across, time down. "line" says where things go: sx(x)
// is position x across, sy(t) is step t down.
function drawLine() {
  const s = latest, n = pathLength - 1;
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  const pen = sharpPen(simCanvas, width, height);
  const line = { left: 10, right: width - 10, top: 34, bottom: height - 22, lo: s.lowest - 1, hi: s.highest + 1, n: n };
  line.sx = function (x) { return line.left + (line.right - line.left) * (x - line.lo) / (line.hi - line.lo); };
  line.sy = function (t) { return line.top + (line.bottom - line.top) * t / Math.max(n, 1); };
  drawOriginLine(pen, line);
  const sides = drawPath1D(pen, line);
  if (byId("show-hull").checked) drawHull1D(pen, sides);
  drawDot(pen, line.sx(s.x), line.sy(n), 4);
  drawLabels1D(pen, line, s);
}

// The origin's line, straight down.
function drawOriginLine(pen, line) {
  pen.fillStyle = "#e4e2dc";
  pen.fillRect(Math.round(line.sx(0)), line.top, 1, line.bottom - line.top);
}

// The path. With few steps, a line through every point; with more steps
// than rows of pixels, for each row the lowest to the highest position
// in its stretch of time, so nothing is left out. Returns the lowest and
// highest position so far at each row (the hull over time), as two
// lists of points [x, y] on the canvas.
function drawPath1D(pen, line) {
  const n = line.n, rows = Math.max(1, Math.round(line.bottom - line.top)), rowHeight = (line.bottom - line.top) / rows;
  if (n <= rows) {
    pen.beginPath();
    for (let t = 0; t <= n; t++) {
      if (t === 0) pen.moveTo(line.sx(path[t]), line.sy(t)); else pen.lineTo(line.sx(path[t]), line.sy(t));
    }
    pen.strokeStyle = CHART_LINE;
    pen.lineWidth = 1.5;
    pen.stroke();
  }
  const sides = { left: [], right: [] };
  let lowSoFar = 0, highSoFar = 0, t = 0;
  pen.fillStyle = CHART_LINE;
  for (let r = 0; r < rows && t <= n; r++) {
    const until = Math.min(n, Math.floor((r + 1) * n / rows));
    let low = path[t], high = path[t];
    for (; t <= until; t++) { low = Math.min(low, path[t]); high = Math.max(high, path[t]); }
    lowSoFar = Math.min(lowSoFar, low);
    highSoFar = Math.max(highSoFar, high);
    const y = line.top + r * rowHeight;
    sides.left.push([line.sx(lowSoFar), y]);
    sides.right.push([line.sx(highSoFar), y]);
    if (n > rows) pen.fillRect(line.sx(low) - 0.5, y, Math.max(1, line.sx(high) - line.sx(low) + 1), Math.max(1, rowHeight));
  }
  return sides;
}

// The hull over time: the lowest and highest position so far, as two
// thin lines.
function drawHull1D(pen, sides) {
  pen.strokeStyle = HULL;
  pen.lineWidth = 1;
  for (const points of [sides.left, sides.right]) drawPolyline(pen, points, false);
}

// The numbers: the steps at the top, the positions under the picture.
function drawLabels1D(pen, line, s) {
  pen.fillStyle = CHART_TEXT;
  pen.font = "11px sans-serif";
  pen.textBaseline = "top";
  pen.textAlign = "left";
  pen.fillText("time goes down: step 0 at the top, step " + line.n.toLocaleString() + " at the bottom", line.left + 36, 4);
  pen.fillText(String(s.lowest), line.sx(s.lowest) - 3, line.bottom + 6);
  pen.textAlign = "right";
  pen.fillText(String(s.highest), line.sx(s.highest) + 3, line.bottom + 6);
  if (s.lowest < 0 && s.highest > 0) {
    pen.textAlign = "center";
    pen.fillText("0", line.sx(0), line.bottom + 6);
  }
}

// A line through "points" ([x, y] on the canvas), closed into a loop
// with "closed", in the pen's stroke color and width.
function drawPolyline(pen, points, closed) {
  pen.beginPath();
  points.forEach(function ([x, y], k) { if (k === 0) pen.moveTo(x, y); else pen.lineTo(x, y); });
  if (closed) pen.closePath();
  pen.stroke();
}

// The walker: a black dot of radius r at (x, y) on the canvas.
function drawDot(pen, x, y, r) {
  pen.fillStyle = WALKER;
  pen.beginPath();
  pen.arc(x, y, r, 0, 2 * Math.PI);
  pen.fill();
}

// 2D: the visited squares, painted as in the other sims (paintCells,
// js/sim-view.js), with the hull, the holes, the origin and the walker
// on top.
function drawGrid() {
  const s = latest, shown = pile.squaresShown(1);   // (one square to spare all round)
  const pen = fitPicture(view, shown, PICTURE_HEIGHT, true);
  paintCells(view, pen, shown, ageGroup, function (k) { return AGE_COLORS[k]; }, hexToRGB(BACKGROUND));
  if (byId("show-holes").checked && s.holes) shadeSquares(view, pen, shown, s.holes.cells, HOLE);
  // Where the middle of site (x, y) is on the canvas.
  function spot(x, y) {
    return [squareLeft(view, x - shown.xmin) + view.cell / 2, squareTop(view, shown.ymax - y) + view.cell / 2];
  }
  drawHull2D(pen, s.hull.corners.map(function ([x, y]) { return spot(x, y); }));
  const [x, y] = spot(0, 0), half = view.cell / 2;
  drawOrigin(pen, [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]]);
  drawDot(pen, ...spot(s.x, s.y), Math.max(3, view.cell * 0.35));
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// 2D on another tiling: the visited cells and the holes' cells as
// polygons (paintDomain, js/sim-view.js), with the hull, the origin and
// the walker on top, as on the square grid.
function drawTiling() {
  const s = latest, shown = shownTiling(s);
  const pen = fitPicture(view, shown, PICTURE_HEIGHT, true);
  paintDomain(view, pen, shown,
    function (v) { return v < pile.count ? ageGroup(v) : HOLE_GROUP; },
    function (k) { return k === HOLE_GROUP ? hexToRGB(HOLE) : AGE_COLORS[k]; },
    hexToRGB(BACKGROUND), null, 0);
  const { sx, sy } = screenCopies(view, shown)[0];
  const spot = function ([u, w]) { return [sx(u), sy(w)]; };
  drawHull2D(pen, s.hull.corners.map(spot));
  drawOrigin(pen, walkTiling.cells[0].corners.map(spot));   // (cell 0 of block (0, 0), which starts at (0, 0))
  const cell = walkTiling.cells[s.z];
  drawDot(pen, ...spot(s.place), Math.max(3, 0.7 * sideDistance(cell.middle, cell.corners) * view.cell));
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// The cells the 2D picture shows on another tiling, as a tiling domain
// (pile.tilingShown, js/sim-sites.js): the visited sites (cell v is site
// v), then, with "Shade the holes", the holes' cells.
function shownTiling(s) {
  return pile.tilingShown(walkTiling, byId("show-holes").checked && s.holes ? s.holes.cells : null);
}

// The convex hull's outline (with "Show the convex hull"), through its
// corners on the canvas.
function drawHull2D(pen, corners) {
  if (!byId("show-hull").checked || corners.length < 2) return;
  pen.strokeStyle = HULL;
  pen.lineWidth = Math.max(1, Math.min(2, view.cell / 6));
  drawPolyline(pen, corners, true);
}

// The origin: its cell outlined, through the cell's corners on the canvas.
function drawOrigin(pen, corners) {
  pen.strokeStyle = WALKER;
  pen.lineWidth = 1;
  drawPolyline(pen, corners, true);
}

// 3D: loaded the first time it is needed (make3D, js/sim-page.js).
const three = make3D(simCanvas, PICTURE_HEIGHT, { ready: drawSoon });

function draw3D() {
  if (!three.view) return;
  hull3D = three.code.drawCells(three.view, {
    x: pile.I.subarray(0, pile.count), y: pile.J.subarray(0, pile.count), z: pile.K.subarray(0, pile.count),
    color: function (i) { return AGE_COLORS[ageGroup(i)]; },
    at: [latest.x, latest.y, latest.z], atColor: hexToRGB(WALKER),
    hull: byId("show-hull").checked ? latest.hullPoints : null, hullColor: hexToRGB(HULL),
  });
}

// Which picture shows: the flat one (1D, 2D) or the 3D one.
function showPictureKind() {
  simCanvas.hidden = (dim === 3);
  three.show(dim === 3);
  byId("view3d-help").hidden = (dim !== 3);
  byId("holes-row").hidden = (dim !== 2);
  useTorus(view, false, dim === 2);       // only the 2D picture moves and zooms
}


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   All for the walk on the screen. The worker keeps the numbers up to
   date, and a sample of them every so often for the charts (part 3 of
   random-walk-rule.js). The dashed gray lines are what theory says for
   the simple random walk on the grids (all weights equal; see "All the
   details" for where each comes from); they hide when the weights
   differ, and on other tilings.
   ===================================================================== */
const RETURN_CHANCE_3D = 0.340537;              // F, the chance the 3D walk ever comes back (Watson 1939)

// The theory for the simple random walk at each of "times", by name.
function theory(name, times) {
  return Float64Array.from(times, function (n) {
    if (name === "distance") return Math.sqrt(n);                         // E|S_n|^2 = n
    if (name === "range") {
      if (dim === 1) return Math.sqrt(8 * n / Math.PI);
      if (dim === 2) return n >= 3 ? Math.PI * n / Math.log(n) : n + 1;
      return (1 - RETURN_CHANCE_3D) * n;
    }
    if (name === "perimeter") return 2 * Math.sqrt(Math.PI * n);
    if (name === "area") return Math.PI * n / 4;
    return 0;
  });
}

// The expected number of returns to the origin by step n, at each of
// "times": exactly, the sum over k <= n/2 of P(S_2k = 0), which is
// binom(2k, k) / 4^k in 1D and its square in 2D (in 3D the limit
// F / (1 - F)).
function expectedReturns(times) {
  if (dim === 3) return Float64Array.from(times, function () { return RETURN_CHANCE_3D / (1 - RETURN_CHANCE_3D); });
  const out = new Float64Array(times.length);
  let k = 0, p = 1, sum = 0;      // p = binom(2k, k) / 4^k
  times.forEach(function (n, j) {
    while (k + 1 <= n / 2) {
      k++;
      p *= (2 * k - 1) / (2 * k);
      sum += dim === 1 ? p : p * p;
    }
    out[j] = sum;
  });
  return out;
}

function showStats() {
  for (const e of document.querySelectorAll(".only-1d")) e.hidden = (dim !== 1);
  for (const e of document.querySelectorAll(".only-2d")) e.hidden = (dim !== 2);
  for (const e of document.querySelectorAll(".only-3d")) e.hidden = (dim !== 3);
  if (!haveWalk()) return;
  byId("theory-note").hidden = !theoryShows();
  showTable(latest);
  drawCharts(latest);
  if (dim === 2) drawCharts2D(latest);
}

// The charts' lines, with the dashed theory line "guide" added for the
// simple random walk on the grids.
function withGuide(lines, guide) {
  return theoryShows() ? lines.concat([{ values: guide, color: CHART_TEXT, dashed: true }]) : lines;
}

// The table of numbers.
function showTable(s) {
  byId("stat-steps").textContent = s.steps.toLocaleString();
  byId("stat-position").textContent = "(" + positionNow(s).join(", ") + ")";
  byId("stat-distance").textContent = niceNumber(s.distance);
  byId("stat-max-distance").textContent = niceNumber(s.maxDistance);
  byId("stat-range").textContent = s.range.toLocaleString();
  byId("stat-returns").textContent = s.returns.toLocaleString();
  if (dim === 1) byId("stat-ends").textContent = s.lowest + " to " + s.highest;
  if (dim === 2) {
    byId("stat-perimeter").textContent = niceNumber(s.hull.perimeter);
    byId("stat-area").textContent = niceNumber(s.hull.area);
    byId("stat-holes").textContent = s.holes.now.toLocaleString();
    byId("stat-closed").textContent = s.holes.closed.toLocaleString();
    const k = s.frontierValues.length - 1;
    byId("stat-frontier").textContent = k < 0 ? "—" :
      s.frontierValues[k].toLocaleString() + " (at step " + s.frontierSteps[k].toLocaleString() + ")";
  }
  if (dim === 3) {
    const shown = three.view && byId("show-hull").checked;   // the 3D hull is measured when it is drawn
    byId("stat-surface").textContent = shown ? niceNumber(hull3D.area) : "—";
    byId("stat-volume").textContent = shown ? niceNumber(hull3D.volume) : "—";
  }
}

// Where the walker is: its site, or on another tiling where its cell's
// middle is, from the first cell's middle, in side lengths.
function positionNow(s) {
  if (!walkTiling) return [s.x, s.y, s.z].slice(0, dim);
  const start = walkTiling.cells[0].middle;
  return [s.place[0] - start[0], s.place[1] - start[1]].map(function (v) { return v.toFixed(2); });
}

// The charts every dimension has.
function drawCharts(s) {
  const times = s.traceSteps;
  plotOverTime(byId("distance-chart"), times, withGuide([
    { values: s.traceDistance, color: NOW_LINE },
    { values: s.traceMaxDistance, color: CHART_LINE },
  ], theory("distance", times)), "step");
  plotOverTime(byId("range-chart"), times, withGuide([{ values: s.traceRange, color: CHART_LINE }], theory("range", times)), "step");
  plotOverTime(byId("returns-chart"), times, withGuide([{ values: s.traceReturns, color: CHART_LINE }], expectedReturns(times)), "step");
}

// The 2D charts: the hull, the holes and the outer boundary.
function drawCharts2D(s) {
  const times = s.traceSteps;
  plotOverTime(byId("perimeter-chart"), times, withGuide([{ values: s.tracePerimeter, color: CHART_LINE }], theory("perimeter", times)), "step");
  plotOverTime(byId("area-chart"), times, withGuide([{ values: s.traceArea, color: CHART_LINE }], theory("area", times)), "step");
  plotOverTime(byId("holes-chart"), s.holes.times, [{ values: s.holes.beta, color: CHART_LINE }], "step");
  stackedSizeBars(byId("hole-sizes-chart"), s.holes.sizes, new Array(s.holes.sizes.length).fill(0), [CHART_LINE], "holes");
  const frontier = Array.from(s.frontierSteps, function (step, k) { return [step, s.frontierValues[k]]; });
  logLogChart(byId("frontier-chart"), [{ points: frontier }], "step", "outer boundary length (log-log)", 2 / 3);
  persistenceChart(byId("persistence-chart"), s.holes.births, s.holes.deaths,
                   document.querySelector("input[name=against]:checked").value, s.steps);
}


/* =====================================================================
   7. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 1D, 2D or 3D. Each has its own directions, so the weights
// go back to all 1, and the walk starts again from step 0.
function setDimension(value) {
  dim = value;
  latest = null;
  showWeightRows();
  showLatticeOptions();
  showPictureKind();
  restart(false);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// All 1: the simple random walk.
byId("equal-weights").addEventListener("click", function () {
  for (const slider of document.querySelectorAll(".weight-slider")) slider.value = 1;
  showWeights();
  restart(true);
});

// Lattice (2D): the walk walks again to the step it was at, on the new
// tiling, with the same seed.
connectLattice(function () {
  showLatticeOptions();
  restart(true);
});

// What the picture shows, and which way the hole lifetimes are drawn:
// only the picture and charts change.
for (const id of ["show-hull", "show-holes"]) byId(id).addEventListener("change", drawSoon);
for (const radio of document.querySelectorAll("input[name=against]")) radio.addEventListener("change", drawSoon);

// Go to step.
connectGoto(sim, 2000000, 10000);

// Seed: the same seed gives the same walk every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
setDimension(2);              // 2D by default
