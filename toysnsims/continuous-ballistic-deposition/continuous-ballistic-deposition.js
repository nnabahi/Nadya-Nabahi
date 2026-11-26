/* =====================================================================
   continuous-ballistic-deposition.js  —  the page of the "Continuous
   Ballistic Deposition" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the dimension (the plane or space), the tile (a typed
       formula, with sliders), the floor's width and its sides
       (periodic or walls).
     - Hands them to the growth (continuous-ballistic-deposition-growth.js),
       which runs in a second thread (a "Web Worker"), and draws every
       deposit it sends back, with the latest particle's fall and the
       statistics.
   Small helpers used by every sim page (byId, runInWorker, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, the colors in
   js/sim-colors.js, moving and zooming the 2D picture in
   js/sim-view.js (makePlaneView), the 3D picture in js/sim-3d.js,
   reading the formula with sliders in js/formulas.js, the tile's shape
   in js/sim-tile-shape.js (with the 3D vectors of js/sim-honeycombs.js),
   the falling tile and the surface in js/sim-deposit.js, and in
   js/sim-cluster-page.js the Tile box, drawing the tiles, the fall and
   the statistics both deposition pages show.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Reading the tile
     4. Running the growth
     5. Drawing the deposit, and the latest particle's fall
     6. Statistics
     7. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

const DEFAULT_SEED = "1";
// The picture's height in screen pixels (in the full screen popup, the
// popup's height instead: pictureHeight, in js/sim-page.js). It always
// shows the whole floor and the deposit on it, at least TALL_SHARE of
// the width tall, with a little room around, until you move or zoom it.
const PICTURE_HEIGHT = 480;
const TALL_SHARE = 0.5;
const FIT_MARGIN = 1.04;
const BACKGROUND = "#ffffff";
const FLOOR = "#9a9a9a";          // the floor (a band under the line y = 0) and the walls
const WALL_PIXELS = 2;            // how thick the walls are drawn (2D)

// The speeds on the Speed slider, in particles per second. Infinity
// means "as fast as the computer can". The default is slow, so you can
// watch every particle fall.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;
const DEFAULT_GOTO = 10000;           // the Go to box's first number (the most is MOST_PARTICLES)

// The floor's width W (in 3D, each way), in the formula's units (the
// disk has radius 1): its first value, and the least and most it can
// be, in each dimension.
const DEFAULT_WIDTH = { 2: 200, 3: 40 };
const LEAST_WIDTH = 0.1;
const MOST_WIDTH = { 2: 2000, 3: 100 };

// The starting tiles (presets) in each dimension, the first one the
// default. Each fills in the formula and, if it has any, its sliders.
// The star: s is how deep its arms are cut, h how many arms it has. In
// 3D the tile must be a ball or a box, for now (js/sim-deposit.js).
const PRESETS = {
  2: {
    disk:   { label: "Disks", T: "x^2 + y^2 <= 1" },
    square: { label: "Squares", T: "max(abs(x), abs(y)) <= 1" },
    star:   { label: "Your star", T: "sqrt(x^2 + y^2) <= 1 + s cos(h atan2(y, x))",
              sliders: { s: { value: 0.5, min: 0, max: 1, step: 0.01 }, h: { value: 5, min: 0, max: 12, step: 1 } } },
  },
  3: {
    ball: { label: "Balls", T: "x^2 + y^2 + z^2 <= 1" },
    cube: { label: "Cubes", T: "max(abs(x), abs(y), abs(z)) <= 1" },
  },
};


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 2;                 // 2 or 3

// The latest message from the growth (serveGrowth, js/sim-cluster.js,
// with the numbers of depositNumbers, js/sim-deposit.js).
let latest = null;

// The tiles' centers, in the order they landed (the worker sends only
// the new ones each time). Tile i landed as particle i + 1.
const tiles = { x: [], y: [], z: [] };

// The tile's outline, from the worker (tileOutline, js/sim-tile-shape.js),
// centered at the origin: in 2D { x, y, round, rhoMax, area }; in 3D
// { corners, triangles, round, rhoMax }, with "id", a new number for
// each new tile (the 3D picture makes its shape again only then).
let outline = null, outlineCount = 0;

// The latest particle's fall, shown as it happens (newFallShow,
// js/sim-cluster-page.js).
const fall = newFallShow();

// Whether "latest" is a deposit to show: not just a problem, and not
// from before a switch of dimension.
function haveDeposit() { return Boolean(latest && latest.traceParticles && latest.dim === dim && outline); }


/* =====================================================================
   3. READING THE TILE
   ---------------------------------------------------------------------
   The Tile box (newTileBox, js/sim-cluster-page.js) reads the formula
   and its sliders. A formula that can't be read yet (usually it is
   half typed) keeps the last good deposit; a new tile grows again to
   the number of particles the run was at, with the same seed. The
   worker turns the formula into the tile's polygon or polyhedron
   (tilePolygon, tilePolyhedron, js/sim-tile-shape.js), which needs T
   to be star-shaped around the origin: each ray from it leaves T once.
   ===================================================================== */

const tileBox = newTileBox(PRESETS, function () { restart(true); });


/* =====================================================================
   4. RUNNING THE GROWTH
   ---------------------------------------------------------------------
   The growth is growthWorker() in continuous-ballistic-deposition-growth.js,
   with newContinuousDeposit(), the falling tile, the surface and the
   numbers both deposition sims report (js/sim-deposit.js), the tile's
   shape (js/sim-tile-shape.js), the cluster's second thread
   (js/sim-cluster.js), and the trace and random numbers
   (js/sim-worker.js) copied in. runInWorker (js/sim-page.js) runs it in
   a second thread, so the page never freezes, and hands each report to
   showGrowth.
   ===================================================================== */
const sim = runInWorker(growthWorker,
  [newContinuousDeposit, niceWidth, newTrace, keepSample, seededUniform, add3, sub3, scale3, dot3, cross3, length3,
   { MOST_PARTICLES: MOST_PARTICLES, SAMPLES_PER_TILE: SAMPLES_PER_TILE }]
  .concat(tileShapeHelpers(), clusterHelpers(), depositHelpers()), showGrowth);

function showGrowth(message) {
  if (message.problem) {
    latest = null;
    showMessage("Problem: " + message.problem);
    drawSoon();
    return;
  }
  if (message.shape) outline = Object.assign({ id: ++outlineCount }, message.shape);
  if (message.sitesFrom === 0) tiles.x.length = tiles.y.length = tiles.z.length = 0;
  for (let i = 0; i < message.x.length; i++) { tiles.x.push(message.x[i]); tiles.y.push(message.y[i]); }
  for (let i = 0; i < message.z.length; i++) tiles.z.push(message.z[i]);
  fall.follow(message, player);
  latest = message;
  showMessage(clusterStopped(message, MOST_PARTICLES, ""));
  drawSoon();
}

// The width in its box, from LEAST_WIDTH to this dimension's most.
function widthNow() { return readNumber("set-width", LEAST_WIDTH, MOST_WIDTH[dim], DEFAULT_WIDTH[dim]); }

// Start the growth again, paused. keepCount: grow to the number of
// particles we are at (so changing the tile or the floor keeps it).
function restart(keepCount) {
  if (!tileBox.formula) return;
  sim.setup({
    dim: dim, tileFormula: tileBox.formula, values: tileBox.values(), width: widthNow(), sides: checked("sides"),
    seed: byId("seed").value, particles: (keepCount && haveDeposit()) ? latest.particles : 1,
  });
}

// Play / Pause, One particle, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "particle", "particles", function () { restart(false); });


/* =====================================================================
   5. DRAWING THE DEPOSIT, AND THE LATEST PARTICLE'S FALL
   ---------------------------------------------------------------------
     2D: a plane view (makePlaneView, js/sim-view.js) of the floor, from
         x = 0 to W: a gray band under the line y = 0, and with walls,
         a gray line up each side. Each tile is the tile's outline moved
         to its center, colored by when it landed, from blue (first) to
         red (just now). With periodic sides a tile that reaches past an
         edge shows on the other side too, and nothing outside the floor
         is drawn. The picture follows the deposit as it grows until you
         drag or zoom it; the Fit button follows it again.
     3D: the tiles in the 3D picture (drawCells, js/sim-3d.js), on the
         floor's outline (with walls, its corners go up too).
   With "Show each particle's fall" ticked, the latest particle's tile
   falls in, dark, down its dashed line, and takes its color when it
   lands.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between); while a fall is shown, only
// the picture is drawn again at each refresh.
const drawSoon = oncePerFrame(function () { drawDeposit(); showStats(); });
const fallOn = oncePerFrame(drawDeposit);

let following = true;
const plane = makePlaneView(simCanvas, drawSoon, {
  reset: function () { following = true; },
  onMove: function () { following = false; },
  resetTitle: "Fit the picture to the floor and the deposit, and keep following it as it grows", resetWord: "Fit",
});
connectPicture(plane);   // drag and pinch the picture (js/sim-view.js)
window.addEventListener("resize", drawSoon);

// 3D: loaded the first time it is needed (make3D, js/sim-page.js).
const three = make3D(simCanvas, PICTURE_HEIGHT, { ready: drawSoon });

// The floor's width W of the run on the screen, whether its sides are
// periodic, and how high the picture goes: above the highest point by
// room for a falling tile, and at least TALL_SHARE of the width.
function floorWidth() { return latest.widths[0]; }
function wraps() { return checked("sides") !== "walls"; }
function pictureTop() { return Math.max(TALL_SHARE * floorWidth(), latest.highest + 3 * outline.rhoMax); }

function drawDeposit() {
  const watching = byId("show-fall").checked, share = watching ? fall.share() : 1;
  if (dim === 3) draw3D(watching, share);
  else draw2D(watching, share);
  if (haveDeposit() && share < 1) fallOn();     // the fall goes on at the next refresh
}

function draw2D(watching, share) {
  const pen = sizePlane(plane, pictureHeight(PICTURE_HEIGHT));
  pen.fillStyle = BACKGROUND;
  pen.fillRect(0, 0, plane.width, plane.height);
  if (!haveDeposit()) return;
  const W = floorWidth(), band = outline.rhoMax, top = pictureTop();
  if (following) showWhole(plane, { xmin: 0, xmax: W, ymin: -band, ymax: top }, FIT_MARGIN);
  const left = pixelX(plane, 0), right = pixelX(plane, W);

  pen.fillStyle = FLOOR;
  pen.fillRect(left, pixelY(plane, 0), right - left, band * plane.uy);
  if (!wraps()) {
    pen.fillRect(left - WALL_PIXELS, pixelY(plane, top), WALL_PIXELS, (top + band) * plane.uy);
    pen.fillRect(right, pixelY(plane, top), WALL_PIXELS, (top + band) * plane.uy);
  }

  // The tiles and the fall, cut off at the floor's sides.
  pen.save();
  pen.beginPath();
  pen.rect(left, 0, right - left, plane.height);
  pen.clip();
  const shifts = wraps() ? [0, W, -W] : [0], n = share < 1 ? fall.particle : tiles.x.length;
  drawTilesFlat(plane, pen, tiles, outline, n, shifts);    // (js/sim-cluster-page.js)
  if (watching && latest.fall) {
    const x = latest.fall.point[0], to = latest.fall.top;
    drawFallLine(pen, function (u) { return pixelX(plane, u); }, function (v) { return pixelY(plane, v); }, x, top, to);
    if (share < 1) {
      const add = tilePath(plane, outline), y = fallHeight(fall, top, to);
      pen.fillStyle = WALKER;
      pen.beginPath();
      for (const dx of shifts) add(pen, x + dx, y);
      pen.fill();
    }
  }
  pen.restore();
}

// 3D: tiles 0 to n - 1 (all of them once the latest has landed), the
// floor's outline at height 0 (with walls, its corners go up to the top
// of the picture too), and while the latest particle falls, its line
// and its tile, dark. The picture fits the floor and the deposit.
function draw3D(watching, share) {
  if (!three.view || !haveDeposit()) return;
  const W = floorWidth(), top = pictureTop(), n = share < 1 ? fall.particle : tiles.x.length;
  const cells = {
    x: tiles.x.slice(0, n), y: tiles.y.slice(0, n), z: tiles.z.slice(0, n),
    tile: outline, color: function (i) { return i < n ? arrivalColor(i, n) : WALKER_RGB; },
    lines: floorLines(W, wraps() ? 0 : top), lineColor: PATH_RGB,
    box: { low: [0, 0, -outline.rhoMax], high: [W, W, top] },
  };
  if (watching && latest.fall) {
    const [x, y] = latest.fall.point, to = latest.fall.top;
    cells.lines.push(x, y, top, x, y, to);
    if (share < 1) { cells.x.push(x); cells.y.push(y); cells.z.push(fallHeight(fall, top, to)); }
  }
  three.code.drawCells(three.view, cells);
}

// The floor's outline in space, the square from (0, 0) to (W, W) at
// height 0, as lines (x1, y1, z1, x2, y2, z2, ...); with "up" above 0,
// its corners go up that high too (the walls).
function floorLines(W, up) {
  const corners = [[0, 0], [W, 0], [W, W], [0, W]], lines = [];
  corners.forEach(function (c, k) {
    const d = corners[(k + 1) % 4];
    lines.push(c[0], c[1], 0, d[0], d[1], 0);
    if (up > 0) lines.push(c[0], c[1], 0, c[0], c[1], up);
  });
  return lines;
}


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   The numbers and charts both deposition pages show
   (showDepositStats, js/sim-cluster-page.js).
   ===================================================================== */

function showStats() {
  if (haveDeposit()) showDepositStats(latest);
}


/* =====================================================================
   7. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 2D or 3D. The growth starts again from the floor, with
// that dimension's width and the tile last used in it (at first, its
// first preset). Words for one dimension only (data-dim="2" or "3")
// show only in it.
function setDimension(value) {
  dim = value;
  latest = null;
  for (const words of document.querySelectorAll("[data-dim]")) words.hidden = Number(words.dataset.dim) !== dim;
  byId("set-width").max = MOST_WIDTH[dim];
  byId("set-width").value = DEFAULT_WIDTH[dim];
  following = true;
  showFlatOr3D(plane, three, dim);   // (js/sim-cluster-page.js)
  tileBox.use(dim);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// The tile (the Tile box, above), the width and the sides: the growth
// grows again to the number of particles it was at, with the same seed.
byId("set-width").addEventListener("change", function () { restart(true); });
for (const radio of document.querySelectorAll('input[name="sides"]')) {
  radio.addEventListener("change", function () { restart(true); });
}

// Show each particle's fall, or not.
byId("show-fall").addEventListener("change", drawSoon);

// Go to step (a number of particles).
connectGoto(sim, MOST_PARTICLES, DEFAULT_GOTO);

// Seed: the same seed gives the same deposit every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
setDimension(2);              // 2D by default: disks
