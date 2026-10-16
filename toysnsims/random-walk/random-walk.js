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
   holes in js/sim-shape.js (shared with Eden Growth), the 3D
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
let run = 0;                 // counts restarts, so leftovers from an older run are ignored

// The latest message from the walk (see part 3 of random-walk-rule.js):
// the numbers and the charts' samples.
let latest = null;

// Every visited site, in the order first visited (the worker sends only
// the new ones each time; keepAlong, js/sim-page.js, adds them here):
// site i is at (siteX[i], siteY[i], siteZ[i]), first visited at step
// bornAt[i]. "sites" is how many there are.
let sites = 0;
let siteX = new Int32Array(1024), siteY = new Int32Array(1024), siteZ = new Int32Array(1024);
let bornAt = new Int32Array(1024);
// 1D: the position at every step (path[n] = S_n), and how many.
let path = new Int32Array(1024), pathLength = 0;

// 2D: the visited sites in a grid, for painting them quickly: the site
// at (x, y) is grid.cells[(y - grid.ymin) * grid.across + (x - grid.xmin)]
// (-1 if none). The grid grows (twice as big) when the walk leaves it.
// (Not on another tiling: there the cells are painted as polygons.)
let grid = null;

// 2D on another tiling: the tiling's repeating block (uprightBlock,
// js/sim-tilings.js), or null on the square grid (and in 1D and 3D).
// runTiling is the one sent with the latest restart, walkTiling the one
// of the walk on the screen (they differ until the new walk's first
// message comes).
let runTiling = null, walkTiling = null;

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
// only off the square grid, and the weights only on the grids (on
// another tiling, a line saying each neighbor is equally likely).
function showLatticeOptions() {
  const tiling = tilingNow() !== null;
  byId("lattice-rows").hidden = (dim !== 2);
  byId("cells-row").hidden = onSquares();
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
   shape, the run loop, the trace and the random numbers
   (js/sim-worker.js), the hull, holes and outer boundary
   (js/sim-shape.js) and blockStart (js/sim-domains.js) copied in.
   startWorker (js/sim-page.js) runs it in a second thread, so the page
   never freezes.
   ===================================================================== */
const worker = startWorker(walkWorker,
  [newWalk, cutsOf, walkHull, hullCandidates3D, makeRunLoop, newTrace, keepSample, seededUniform, blockStart,
   convexHull, polygonArea, polygonPerimeter, holeHistory, bettiOverTime, frontierLength,
   cellWindow, squareWindow, tilingWindow]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  if (message.problem) {
    latest = null;
    showMessage(message.problem);
    drawSoon();
    return;
  }
  keepSites(message);
  latest = message;
  showMessage(message.atMax ? "The walk has reached two million steps, the most this page walks." : "");
  drawSoon();
};

// Add the sites (and in 1D the positions) new in this message to the
// page's lists. A message starting from site 0 is a fresh walk (on the
// tiling of the latest restart).
function keepSites(message) {
  if (message.sitesFrom === 0) { sites = 0; grid = null; pathLength = 0; walkTiling = runTiling; }
  const at = message.sitesFrom, count = message.siteX.length;
  siteX = keepAlong(siteX, message.siteX, at);
  siteY = keepAlong(siteY, message.siteY, at);
  siteZ = keepAlong(siteZ, message.siteZ, at);
  bornAt = keepAlong(bornAt, message.bornAt, at);
  sites = at + count;
  if (message.dim === 2 && !walkTiling) for (let i = at; i < sites; i++) putInGrid(i);
  if (message.path) {
    path = keepAlong(path, message.path, message.pathFrom);
    pathLength = message.pathFrom + message.path.length;
  }
}

// 2D: put site i in the grid, making the grid bigger first if the site
// is outside it.
function putInGrid(i) {
  const x = siteX[i], y = siteY[i];
  if (!grid || x < grid.xmin || x > grid.xmax || y < grid.ymin || y > grid.ymax) grid = biggerGrid(x, y, i);
  grid.cells[(y - grid.ymin) * grid.across + (x - grid.xmin)] = i;
}

// A grid twice as big as the old one (at least 65 across), around both
// it and the site (x, y), holding sites 0 .. upTo - 1.
function biggerGrid(x, y, upTo) {
  const old = grid;
  const half = old ? Math.max(old.xmax - old.xmin, old.ymax - old.ymin) + 1 : 32;
  const cx = old ? Math.round((old.xmin + old.xmax) / 2) : x, cy = old ? Math.round((old.ymin + old.ymax) / 2) : y;
  const reach = Math.max(half, Math.abs(x - cx) + 1, Math.abs(y - cy) + 1);
  const bigger = { xmin: cx - reach, xmax: cx + reach, ymin: cy - reach, ymax: cy + reach, across: 2 * reach + 1 };
  bigger.cells = new Int32Array(bigger.across * bigger.across).fill(-1);
  for (let j = 0; j < upTo; j++) bigger.cells[(siteY[j] - bigger.ymin) * bigger.across + (siteX[j] - bigger.xmin)] = j;
  return bigger;
}

// Send the walk to the worker. keepStep: walk to the step we are at
// (so changing a weight keeps the step).
function restart(keepStep) {
  run++;
  runTiling = tilingNow();
  worker.postMessage({
    type: "setup", run: run, dim: dim, weights: weights(), tiling: runTiling, seed: byId("seed").value,
    steps: (keepStep && haveWalk()) ? latest.steps : 0,
  });
  player.carryOn();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(worker, SPEEDS, DEFAULT_SPEED, "step", "steps", function () { restart(false); });


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
         zoomed (js/sim-view.js).
     3D: a cube for every visited site, colored the same way, the
         walker as a ball, and the hull as a see-through solid.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawWalk(); showStats(); });

const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
connectPicture(view, null, function () { return false; });   // drag and pinch the 2D picture (js/sim-controls.js)
window.addEventListener("resize", function () {
  if (view3d) sim3d.setHeight(view3d, pictureHeight(PICTURE_HEIGHT));
  drawSoon();
});

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

// Make the canvas "width" by "height" screen pixels, and return its pen,
// ready to draw in screen pixels.
function canvasPen(width, height) {
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  return pen;
}

// 1D: position across, time down. "line" says where things go: sx(x)
// is position x across, sy(t) is step t down.
function drawLine() {
  const s = latest, n = pathLength - 1;
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  const pen = canvasPen(width, height);
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
  const s = latest, shown = shownBox();
  const pen = fitPicture(view, shown, pictureHeight(PICTURE_HEIGHT));
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

// The box the 2D picture shows: around the visited sites, with one
// square to spare all round. It looks the sites up in the grid.
function shownBox() {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < sites; i++) {
    xmin = Math.min(xmin, siteX[i]); xmax = Math.max(xmax, siteX[i]);
    ymin = Math.min(ymin, siteY[i]); ymax = Math.max(ymax, siteY[i]);
  }
  return { xmin: xmin - 1, xmax: xmax + 1, ymin: ymin - 1, ymax: ymax + 1, wrap: null, lookup: gridSite };
}

// The site at (x, y) in the grid, or -1.
function gridSite(x, y) {
  if (x < grid.xmin || x > grid.xmax || y < grid.ymin || y > grid.ymax) return -1;
  return grid.cells[(y - grid.ymin) * grid.across + (x - grid.xmin)];
}

// 2D on another tiling: the visited cells and the holes' cells as
// polygons (paintDomain, js/sim-view.js), with the hull, the origin and
// the walker on top, as on the square grid.
function drawTiling() {
  const s = latest, shown = shownTiling(s);
  const pen = fitPicture(view, shown, pictureHeight(PICTURE_HEIGHT));
  paintDomain(view, pen, shown,
    function (v) { return v < sites ? ageGroup(v) : HOLE_GROUP; },
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
// (tilingCells, js/sim-domains.js): the visited sites (cell v is site
// v), then, with "Shade the holes", the holes' cells.
function shownTiling(s) {
  const holes = byId("show-holes").checked && s.holes ? s.holes.cells : [];
  const n = sites + holes.length / 3;
  const x = new Int32Array(n), y = new Int32Array(n), part = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const h = 3 * (v - sites);    // (where hole cell v is in the list holes: x, y, z, x, y, z, ...)
    x[v] = v < sites ? siteX[v] : holes[h];
    y[v] = v < sites ? siteY[v] : holes[h + 1];
    part[v] = v < sites ? siteZ[v] : holes[h + 2];
  }
  return tilingCells(walkTiling, x, y, part);
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

// 3D: loaded the first time it is needed (load3D, js/sim-page.js).
let sim3d = null, view3d = null;
function start3D() {
  load3D(byId("sim-3d"), pictureHeight(PICTURE_HEIGHT), function (code, picture) {
    sim3d = code;
    view3d = picture;
    drawSoon();
  }, function () {});
}

function draw3D() {
  if (!view3d) return;
  hull3D = sim3d.drawCells(view3d, {
    x: siteX.subarray(0, sites), y: siteY.subarray(0, sites), z: siteZ.subarray(0, sites),
    color: function (i) { return AGE_COLORS[ageGroup(i)]; },
    at: [latest.x, latest.y, latest.z], atColor: hexToRGB(WALKER),
    hull: byId("show-hull").checked ? latest.hullPoints : null, hullColor: hexToRGB(HULL),
  });
}
byId("view3d-reset").addEventListener("click", function () { if (view3d) sim3d.resetCamera(view3d); });

// Which picture shows: the flat one (1D, 2D) or the 3D one.
function showPictureKind() {
  simCanvas.hidden = (dim === 3);
  byId("sim-3d").hidden = byId("view3d-buttons").hidden = byId("view3d-help").hidden = (dim !== 3);
  byId("holes-row").hidden = (dim !== 2);
  useTorus(view, false, dim === 2);       // only the 2D picture moves and zooms
  if (dim === 3 && !view3d) start3D();
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
    const shown = view3d && byId("show-hull").checked;   // the 3D hull is measured when it is drawn
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
  stackedSizeBars(byId("hole-sizes-chart"), s.holes.sizes, new Array(s.holes.sizes.length).fill(0), [CHART_LINE], " holes");
  logLogChart(byId("frontier-chart"), s.frontierSteps, s.frontierValues, "outer boundary length", 2 / 3);
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
byId("goto").addEventListener("click", function () {
  worker.postMessage({ type: "goto", steps: readWhole("goto-steps", 0, 2000000, 0) });
});

// Seed: the same seed gives the same walk every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
byId("goto-steps").value = 10000;
fillLatticeMenu();            // the square grid
setDimension(2);              // 2D by default
player.setPlaying(false);     // paused: press Play
