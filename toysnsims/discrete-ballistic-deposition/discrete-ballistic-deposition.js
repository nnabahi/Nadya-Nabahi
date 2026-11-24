/* =====================================================================
   discrete-ballistic-deposition.js  —  the page of the "Discrete
   Ballistic Deposition" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the dimension, the lattice (in 2D the square grid or
       another tiling, in 3D a tiling of space), the strip's width and
       its sides (periodic or walls).
     - Hands them to the growth (discrete-ballistic-deposition-growth.js),
       which runs in a second thread (a "Web Worker"), and draws every
       deposit it sends back, with the latest particle's fall and the
       statistics.
   Small helpers used by every sim page (byId, runInWorker, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, the colors in
   js/sim-colors.js, moving, zooming and painting the 2D picture in
   js/sim-view.js, the 3D picture in js/sim-3d.js, the tilings of the
   plane in js/sim-tilings.js and of space in js/sim-honeycombs.js (with
   their options in js/sim-controls.js), the strip and its surface in
   js/sim-deposit.js, and the page's copy of the cells, the statistics
   and the fall in js/sim-cluster-page.js (with js/sim-sites.js).

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the growth
     4. Drawing the deposit, and the latest particle's fall
     5. Statistics
     6. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

const DEFAULT_SEED = "1";
// The picture's height in screen pixels (in the full screen popup, the
// popup's height instead: pictureHeight, in js/sim-page.js). The whole
// strip always shows, at least TALL_SHARE of its width tall, so the
// deposit grows up into the picture.
const PICTURE_HEIGHT = 480;
const TALL_SHARE = 0.5;
const BACKGROUND = "#ffffff";     // empty cells
const FLOOR = "#9a9a9a";          // the floor's top layer of cells

// The colors come in this many steps, from blue (first) to red (just now).
const COLOR_STEPS = 64;

// The speeds on the Speed slider, in particles per second. Infinity
// means "as fast as the computer can". The default is slow, so you can
// watch every particle fall.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;
const DEFAULT_GOTO = 20000;           // the Go to box's first number (the most is MOST_PARTICLES)

// The width of the strip, in blocks (in 3D, each way): its first value,
// and the most it can be, in each dimension.
const DEFAULT_WIDTH = { 2: 200, 3: 24 };
const MOST_WIDTH = { 2: 2000, 3: 64 };

// The kinds of cell offered in 3D: those with an inside, which a line
// can pass through (js/sim-deposit.js).
const SOLID_KINDS = ["polyhedra", "vertices"];


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 2;                 // 2 or 3

// The latest message from the growth (serveGrowth, js/sim-cluster.js,
// with the numbers of depositNumbers, js/sim-deposit.js).
let latest = null;

// The deposit on the screen (js/sim-cluster-page.js): its cells, in the
// order they joined (the worker sends only the new ones each time, and
// the pile adds them up), and the lattice it grew on. Cell i is cell
// pile.part[i] of block (pile.I[i], pile.J[i], pile.K[i]) (on the square
// grid: the point (I, J)), and joined as particle i + 1. "floor" is the
// floor's top layer, sent once per run ({ I, J, K, part }), and "width"
// the strip's width in blocks of the run on the screen.
const cluster = newClusterOnPage(function () { return dim; }), pile = cluster.pile;
let floor = null, width = DEFAULT_WIDTH[2];

// The latest particle's fall, shown as it happens (newFallShow,
// js/sim-cluster-page.js).
const fall = newFallShow();

// Whether "latest" is a deposit to show: not just a problem, and not
// from before a switch of dimension.
function haveDeposit() { return Boolean(latest && latest.traceParticles && latest.dim === dim && floor); }


/* =====================================================================
   3. RUNNING THE GROWTH
   ---------------------------------------------------------------------
   The growth is growthWorker() in discrete-ballistic-deposition-growth.js,
   with newDiscreteDeposit(), the strip, its surface and the numbers
   both deposition sims report (js/sim-deposit.js), the lattices
   (js/sim-walk.js), the second thread of a cluster sim
   (js/sim-cluster.js), the trace and random numbers (js/sim-worker.js),
   and where cells are (js/sim-domains.js, js/sim-honeycombs.js) copied
   in. runInWorker (js/sim-page.js) runs it in a second thread, so the
   page never freezes, and hands each report to showGrowth.
   ===================================================================== */
const sim = runInWorker(growthWorker,
  [newDiscreteDeposit, newTrace, keepSample, seededUniform, newHeap, honeycombMiddle, middleAt, blockStart, cellNeighbors,
   dot3, cross3, { MOST_PARTICLES: MOST_PARTICLES }]
  .concat(walkHelpers(), clusterHelpers(), depositHelpers()), showGrowth);

function showGrowth(message) {
  if (message.problem) {
    latest = null;
    showMessage("Problem: " + message.problem);
    drawSoon();
    return;
  }
  cluster.keep(message);
  if (message.floor) floor = message.floor;
  fall.follow(message, player);
  latest = message;
  showMessage(clusterStopped(message, MOST_PARTICLES, ""));
  drawSoon();
}

// The width in its box, from 2 to this dimension's most.
function widthNow() { return readWhole("set-width", 2, MOST_WIDTH[dim], DEFAULT_WIDTH[dim]); }

// Start the growth again, paused. keepCount: grow to the number of
// particles we are at (so changing the lattice keeps it).
function restart(keepCount) {
  width = widthNow();
  const options = Object.assign(cluster.forSetup(), {
    dim: dim, width: width, sides: sidesNow(), seed: byId("seed").value,
    particles: (keepCount && haveDeposit()) ? latest.particles : 1,
  });
  floor = null;
  sim.setup(options);
}

// Play / Pause, One particle, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "particle", "particles", function () { restart(false); });


/* =====================================================================
   4. DRAWING THE DEPOSIT, AND THE LATEST PARTICLE'S FALL
   ---------------------------------------------------------------------
     2D: the whole strip, with the floor's top layer in gray and each
         cell of the deposit colored by when it joined, from blue
         (first) to red (just now). It can be moved and zoomed
         (js/sim-view.js). With periodic sides, a cell that reaches
         past an edge of the strip shows on the other side too.
     3D: each cell in its own shape (a cube on the cubic grid), on the
         floor's top layer.
   With "Show each particle's fall" ticked, the latest particle falls in
   along its dashed line (in 3D, a dark ball), and its cell shows once
   it lands.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between); while a fall is shown, only
// the picture is drawn again at each refresh.
const drawSoon = oncePerFrame(function () { drawDeposit(); showStats(); });
const fallOn = oncePerFrame(drawDeposit);

const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
connectPicture(view);   // drag and pinch the 2D picture (js/sim-view.js)
window.addEventListener("resize", drawSoon);

// 3D: loaded the first time it is needed (make3D, js/sim-page.js).
const three = make3D(simCanvas, PICTURE_HEIGHT, { ready: drawSoon });

// The colors, worked out once (heatColor, js/sim-colors.js), and the
// floor's color, as group FLOOR_GROUP.
const COLORS = [];
for (let k = 0; k < COLOR_STEPS; k++) COLORS.push(heatColor(k / (COLOR_STEPS - 1)));
const FLOOR_GROUP = COLOR_STEPS, FLOOR_RGB = hexToRGB(FLOOR);
function colorOf(group) { return group === FLOOR_GROUP ? FLOOR_RGB : COLORS[group]; }

// The color group of cell i of n shown: when it joined.
function arrivalGroupOf(i, n) { return Math.min(COLOR_STEPS - 1, Math.floor(COLOR_STEPS * i / n)); }

function drawDeposit() {
  if (!haveDeposit()) return;
  const watching = byId("show-fall").checked, share = watching ? fall.share() : 1;
  const n = share < 1 ? fall.particle : pile.count;     // the latest cell shows once it lands
  if (dim === 3) draw3D(n, watching, share);
  else if (cluster.tiling) drawPolygons(n, watching);
  else drawSquares(n, watching);
  if (share < 1) fallOn();      // the fall goes on at the next refresh
}

// 2D, the square grid: columns 0 .. width - 1, the floor's top layer
// in row -1. (paintCells, js/sim-view.js, asks for the cell on each
// square: a number of the pile, or FLOOR_CELL, or -1 for none.)
const FLOOR_CELL = -3;
function drawSquares(n, watching) {
  const sites = pile.squaresShown(0);   // (it looks up the pile's sites)
  const top = Math.max(Math.ceil(TALL_SHARE * width), latest.highest + 2);
  const d = {
    xmin: 0, xmax: width - 1, ymin: -1, ymax: Math.ceil(top), wrap: null,
    lookup: function (x, y) {
      if (y < 0) return y === -1 ? FLOOR_CELL : -1;
      const i = sites.lookup(x, y);
      return i < n ? i : -1;
    },
  };
  const pen = fitPicture(view, d, PICTURE_HEIGHT, true);
  paintCells(view, pen, d, function (v) { return v === FLOOR_CELL ? FLOOR_GROUP : arrivalGroupOf(v, n); }, colorOf, hexToRGB(BACKGROUND));
  if (watching && latest.fall) {
    // A height y on the grid is (ymax + 0.5 - y) squares from the top.
    const sx = function (x) { return view.left + (x - d.xmin + 0.5 + view.scroll.x) * view.cell; };
    const sy = function (y) { return (d.ymax + 0.5 - y + view.scroll.y) * view.cell; };
    drawFall(pen, sx, sy, d.ymax + 0.5);
  }
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// 2D, another tiling: the floor's top layer and the deposit's cells, as
// polygons (paintDomain, js/sim-view.js), in the strip 0 <= x < W, from
// the floor up. With periodic sides, a cell reaching past an edge of the
// strip is drawn again a whole width over.
function drawPolygons(n, watching) {
  const tiling = cluster.tiling, W = width * tiling.a[0], wraps = checked("sides") !== "walls";
  const I = [], J = [], part = [], groups = [];
  const add = function (i, j, k, group) {
    I.push(i); J.push(j); part.push(k); groups.push(group);
    if (!wraps) return;
    const x = middleAt(tiling, i, j, k)[0], cell = tiling.cells[k];
    const reaches = cell.corners.map(function (c) { return c[0] - cell.middle[0]; });
    if (x + Math.min(...reaches) < 0) { I.push(i + width); J.push(j); part.push(k); groups.push(group); }
    if (x + Math.max(...reaches) > W) { I.push(i - width); J.push(j); part.push(k); groups.push(group); }
  };
  for (let i = 0; i < floor.I.length; i++) add(floor.I[i], floor.J[i], floor.part[i], FLOOR_GROUP);
  for (let i = 0; i < n; i++) add(pile.I[i], pile.J[i], pile.part[i], arrivalGroupOf(i, n));
  const shown = tilingCells(tiling, Int32Array.from(I), Int32Array.from(J), Int32Array.from(part));   // (js/sim-domains.js)
  let bottom = Infinity;
  for (let i = 0; i < floor.I.length; i++) {
    for (const c of cornersAt(tiling, floor.I[i], floor.J[i], floor.part[i])) bottom = Math.min(bottom, c[1]);
  }
  shown.pictureBox = { left: 0, right: W, bottom: bottom, top: Math.max(TALL_SHARE * W, latest.highest + 2 * widestCell(tiling)) };
  const pen = fitPicture(view, shown, PICTURE_HEIGHT, true);
  paintDomain(view, pen, shown, function (v) { return groups[v]; }, colorOf, hexToRGB(BACKGROUND), null, 0);
  if (watching && latest.fall) {
    const { sx, sy } = screenCopies(view, shown)[0];
    drawFall(pen, sx, sy, shown.pictureBox.top);
  }
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// 2D: the latest particle's fall, with sx and sy taking a point of the
// plane to the screen: its dashed line from the top of the picture down
// to where it stops (drawFallLine, js/sim-cluster-page.js), and while it
// falls, the particle as a dot.
function drawFall(pen, sx, sy, top) {
  const x = latest.fall.point[0], to = latest.fall.top;
  drawFallLine(pen, sx, sy, x, top, to);
  if (fall.share() < 1) {
    pen.fillStyle = WALKER;
    pen.beginPath();
    pen.arc(sx(x), sy(fallHeight(fall, top, to)), WALKER_RADIUS, 0, 2 * Math.PI);
    pen.fill();
  }
}

// 3D (make3D, js/sim-page.js, loads it the first time it is needed):
// the floor's top layer and cells 0 .. n - 1, each in its own shape
// (drawCells, js/sim-3d.js); while the latest particle falls, its line
// and the particle as a dark ball.
function draw3D(n, watching, share) {
  if (!three.view) return;
  const f = floor.I.length, block = cluster.block;
  const join = function (a, b) { const both = new Int32Array(f + n); both.set(a.subarray(0, f)); both.set(b.subarray(0, n), f); return both; };
  const cells = {
    x: join(floor.I, pile.I), y: join(floor.J, pile.J), z: join(floor.K, pile.K), part: join(floor.part, pile.part), block: block,
    color: function (i) { return colorOf(i < f ? FLOOR_GROUP : arrivalGroupOf(i - f, n)); },
  };
  if (watching && latest.fall) {
    const [x, y] = latest.fall.point, to = latest.fall.top, top = latest.highest + 2 * block.c[2] + 2;
    cells.lines = [x, y, top, x, y, to];
    cells.lineColor = PATH_RGB;
    if (share < 1) {
      cells.at = [x, y, fallHeight(fall, top, to)];
      cells.atColor = WALKER_RGB;
      cells.atSize = Math.max(0.5, width * block.a[0] * WALKER_SHARE_3D);
    }
  }
  three.code.drawCells(three.view, cells);
}


/* =====================================================================
   5. STATISTICS
   ---------------------------------------------------------------------
   The numbers and charts both deposition pages show
   (showDepositStats, js/sim-cluster-page.js).
   ===================================================================== */

function showStats() {
  if (haveDeposit()) showDepositStats(latest);
}


/* =====================================================================
   6. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// The sides: periodic, or walls where the lattice can have them
// (wallsFit, js/sim-deposit.js: its blocks' sides cut no cell). Elsewhere
// the Walls button is off, and periodic is ticked.
function sidesNow() {
  const options = cluster.forSetup(), lattice = latticeFor(Object.assign({ dim: dim }, options));
  const fits = wallsFit(cellShapes(lattice));
  const walls = document.querySelector('input[name="sides"][value="walls"]');
  walls.disabled = !fits;
  byId("walls-message").hidden = fits;
  if (!fits) document.querySelector('input[name="sides"][value="periodic"]').checked = true;
  return checked("sides");
}

// Dimension: 2D or 3D. The growth starts again from the floor, with
// that dimension's width.
function setDimension(value) {
  dim = value;
  latest = null;
  byId("set-width").max = MOST_WIDTH[dim];
  byId("set-width").value = DEFAULT_WIDTH[dim];
  showLatticeRowsFor(dim);    // (js/sim-controls.js)
  showClusterPicture(view, three, dim);
  restart(false);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// Lattice (2D) and the tiling of space (3D), the width and the sides:
// the growth grows again to the number of particles it was at, with the
// same seed.
connectLattice(function () {
  showLatticeRowsFor(dim);
  restart(true);
});
connectSpaceTilings(function () { restart(true); }, SOLID_KINDS);
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
setDimension(2);              // 2D by default: the square grid
