/* =====================================================================
   internal-discrete-dla.js  —  the page of the "Internal Discrete DLA"
   sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the dimension and the lattice: in 2D the square grid or
       another tiling (the Lattice options), in 3D a tiling of space.
     - Hands them to the growth (internal-discrete-dla-growth.js),
       which runs in a second thread (a "Web Worker"), and draws every
       cluster it sends back, with the statistics.
   Small helpers used by every sim page (byId, keepAlong, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, the colors in
   js/sim-colors.js, moving, zooming and painting the 2D picture in
   js/sim-view.js, the cluster's cells kept for drawing in
   js/sim-sites.js, the 3D picture in js/sim-3d.js, the tilings of the
   plane in js/sim-tilings.js (with their Lattice options in
   js/sim-controls.js) and of space in js/sim-honeycombs.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The lattice
     4. Running the growth
     5. Drawing the cluster (1D, 2D, 3D)
     6. Statistics
     7. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

const DEFAULT_SEED = "1";
// The picture always has the same size (the box's width, and this
// height in screen pixels); the cluster shrinks to fit inside it as it
// grows. In the full screen popup, it is the popup's height instead
// (pictureHeight, in js/sim-page.js).
const PICTURE_HEIGHT = 480;
const BACKGROUND = "#ffffff";     // cells not in the cluster
const ORIGIN = "#222222";         // the origin's outline
const INNER_LINE = "#b9c8dc";     // the inner radius and error on the charts (the outer ones are CHART_LINE)

// The colors come in this many steps: "when it joined" in COLOR_STEPS
// steps from blue to red, "early or late" in 2 * COLOR_STEPS + 1 from
// blue through white to red.
const COLOR_STEPS = 64;

// The 3D tiling and its cells when the page opens: the cubes (#22,
// js/sim-honeycombs.js), so the cells are the cubic grid Z^3.
const CUBES = 22;
const DEFAULT_CELL_KIND = "polyhedra";

// The speeds on the Speed slider, in particles per second. Infinity
// means "as fast as the computer can". The default is slow, so you can
// watch every cell join.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;
const DEFAULT_GOTO = 10000;           // the Go to box's first number (the most is MOST_PARTICLES)


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 2;                 // 1, 2 or 3

// The latest message from the growth (see part 2 of
// internal-discrete-dla-growth.js): the numbers and the charts' samples.
let latest = null;

// The cluster's cells, in the order they joined (the worker sends only
// the new ones each time; the pile, js/sim-sites.js, adds them up): cell
// i is cell pile.part[i] of block (pile.I[i], pile.J[i], pile.K[i]) (on
// the grids Z and Z²: the point (I, J)), and joined as particle i + 1,
// distance[i] from the origin. pile.count is how many there are.
const pile = newSitePile();
let distance = new Float64Array(1024);
// On the grids, the largest early or late difference so far (the color
// scale of "early or late").
let spread = 0;

// 2D on another tiling: the tiling's repeating block (uprightBlock,
// js/sim-tilings.js), or null on the square grid (and in 1D and 3D). On
// a Penrose tiling, the page's copy of the growth's plane instead, its
// cells as the second thread sends them ("mirror": penroseMirror,
// js/sim-penrose.js). 3D: the tiling of space's block (honeycombBlock,
// js/sim-honeycombs.js), or null in 1D and 2D. The "run" ones are those
// of the latest restart, the "cluster" ones those of the cluster on the
// screen (they differ until the new cluster's first message comes).
let runTiling = null, clusterTiling = null, mirror = null;
let runBlock = null, clusterBlock = null;

// Whether "latest" is a cluster to show: not just a problem, and not
// from before a switch of dimension.
function haveCluster() { return Boolean(latest && latest.traceParticles && latest.dim === dim); }


/* =====================================================================
   3. THE LATTICE
   ---------------------------------------------------------------------
   In 2D the Lattice options (js/sim-controls.js): the square grid, any
   tiling by regular polygons, or a Penrose tiling. In 3D one of the 28
   uniform tilings of space, with its polyhedra, faces, edges or
   vertices as the cells. Every change takes effect at once, keeping the
   seed and the number of particles.
   ===================================================================== */

// The tiling for a new growth: in 2D, the one the Lattice options say
// (tilingInUse, js/sim-controls.js), or null on the square grid.
function tilingNow() { return dim === 2 && !onSquares() ? tilingInUse.block : null; }

// The tiling of space for a new growth (3D only), or null.
function blockNow() {
  return dim === 3 ? honeycombBlock(Number(byId("set-honeycomb").value), byId("set-cell-kind").value) : null;
}

// Is the lattice now one of the grids Z, Z², Z³, where the cluster grows
// like a ball? In 3D, the cubes' polyhedra or vertices are both Z³.
function onGrid() {
  if (dim === 1) return true;
  if (dim === 2) return onSquares();
  return byId("set-honeycomb").value === String(CUBES) &&
         ["polyhedra", "vertices"].includes(byId("set-cell-kind").value);
}

// The Lattice options show in 2D only ("Cells are the tiles / corners"
// only where the corners can be cells), the tilings of space in 3D only.
function showLatticeOptions() {
  byId("lattice-rows").hidden = (dim !== 2);
  byId("cells-row").hidden = !cornersCanBeCells();
  byId("space-rows").hidden = (dim !== 3);
}

// The 3D menus: the tilings of space (the cubes first) and the kinds of
// cell.
function fillSpaceMenus() {
  addHoneycombOptions(byId("set-honeycomb"));    // (js/sim-honeycombs.js)
  for (const { kind, name } of CELL_KINDS) byId("set-cell-kind").appendChild(new Option(name, kind));
  byId("set-honeycomb").value = String(CUBES);
  byId("set-cell-kind").value = DEFAULT_CELL_KIND;
}


/* =====================================================================
   4. RUNNING THE GROWTH
   ---------------------------------------------------------------------
   The growth is growthWorker() in internal-discrete-dla-growth.js, with
   newInternalDLA(), the lattices, steps and jumps (js/sim-walk.js), the
   cluster (js/sim-cluster.js), the trace, heap and random numbers
   (js/sim-worker.js), where cells are (js/sim-domains.js,
   js/sim-honeycombs.js) and what grows a Penrose tiling's plane
   (js/sim-penrose.js) copied in. runInWorker (js/sim-page.js) runs it in
   a second thread, so the page never freezes, and hands each report to
   showGrowth.
   ===================================================================== */
const sim = runInWorker(growthWorker,
  [newInternalDLA, latticeFor, ballRadius, newTrace, keepSample, seededUniform, newHeap, honeycombMiddle, blockStart, middleAt,
   cellNeighbors, { MOST_PARTICLES: MOST_PARTICLES }]
  .concat(walkHelpers(), clusterHelpers(), penroseHelpers()), showGrowth);

function showGrowth(message) {
  if (message.problem) {
    latest = null;
    showMessage(message.problem);
    drawSoon();
    return;
  }
  keepCells(message);
  if (message.planeCells) addPlaneCells(clusterTiling, message.planeCells);
  latest = message;
  showMessage(message.atMax ? "The cluster has " + MOST_PARTICLES.toLocaleString() + " particles, the most this page lets in." :
              message.atEdge ? "The cluster has reached the edge of the part of this tiling the page builds (" +
                               PENROSE_PLANE_MOST + " side lengths from the middle each way), so it stops here." : "");
  drawSoon();
}

// Add the cells new in this message to the page's lists. A message
// starting from cell 0 is a fresh cluster (on the lattice of the latest
// restart).
function keepCells(message) {
  const at = message.sitesFrom;
  if (at === 0) { clusterTiling = runTiling; clusterBlock = runBlock; spread = 0; }
  pile.keep(at, message.siteI, message.siteJ, message.siteK, message.sitePart);
  distance = keepAlong(distance, message.siteDistance, at);
  if (message.grid) {
    for (let i = at; i < pile.count; i++) spread = Math.max(spread, Math.abs(earlyBy(message.dim, i)));
  }
}

// How early cell i joined, in side lengths: how far it is from the
// origin, minus the radius of the ball with as many cells as the cluster
// had once it joined (negative: late).
function earlyBy(d, i) { return distance[i] - ballRadius(d, i + 1); }

// Start the growth again, paused. keepCount: grow to the number of
// particles we are at (so changing the lattice keeps it).
function restart(keepCount) {
  const tiling = tilingNow(), finite = Boolean(tiling && tiling.finite);
  if (finite) mirror = penroseMirror(mirror, tiling);
  runTiling = finite ? mirror : tiling;
  runBlock = blockNow();
  sim.setup({
    dim: dim, tiling: tiling, block: runBlock, grid: onGrid(), seed: byId("seed").value,
    particles: (keepCount && haveCluster()) ? latest.particles : 1, cellsKnown: finite ? mirror.cells.length : 0,
  });
}

// Play / Pause, One particle, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
connectPlay(sim, SPEEDS, DEFAULT_SPEED, "particle", "particles", function () { restart(false); });


/* =====================================================================
   5. DRAWING THE CLUSTER
   ---------------------------------------------------------------------
     1D: the cells across, time going down: the column of each cell is
         filled from the moment it joined, so the cluster is the
         triangle that widens down the picture.
     2D: the cells as squares (on another tiling, as its polygons),
         with the origin outlined. It can be moved and zoomed
         (js/sim-view.js). The canvas keeps one height as the cluster
         grows, so the page doesn't jump.
     3D: each cell in its own shape (a cube on the cubic grid).
   Each cell is colored by when it joined (blue first, red just now) or,
   on the grids, by how early or late it joined (red early, blue late).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawCluster(); showStats(); });

const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
connectPicture(view);   // drag and pinch the 2D picture (js/sim-view.js)
window.addEventListener("resize", drawSoon);

// The colors, worked out once: groups 0 .. COLOR_STEPS - 1 are "when it
// joined" (heatColor), and the 2 * COLOR_STEPS + 1 groups after them
// "early or late" (divergingColor), late first (js/sim-colors.js).
const COLORS = [];
for (let k = 0; k < COLOR_STEPS; k++) COLORS.push(heatColor(k / (COLOR_STEPS - 1)));
for (let k = -COLOR_STEPS; k <= COLOR_STEPS; k++) COLORS.push(divergingColor(k / COLOR_STEPS));
function colorOf(group) { return COLORS[group]; }

// Does the picture show early or late? Only when it is picked and the
// cluster on the screen is on a grid.
function showsEarlyLate() { return checked("color-by") === "early-late" && latest.grid; }

// The color group of cell i.
function colorGroup(i) {
  if (showsEarlyLate()) return 2 * COLOR_STEPS + Math.round(COLOR_STEPS * earlyBy(dim, i) / (spread || 1));
  return Math.min(COLOR_STEPS - 1, Math.floor(COLOR_STEPS * i / pile.count));
}

function drawCluster() {
  if (!haveCluster()) return;
  if (dim === 1) drawLine();
  else if (dim === 2 && clusterTiling) drawTiling();
  else if (dim === 2) drawGrid();
  else draw3D();
}

// 1D: position across, time down, one pixel for each stretch of
// positions and of particles. Each column is filled, in the color of
// its first cell, from the row where that cell joined down to the
// bottom, so the edge of the color is the cluster's edge over time.
function drawLine() {
  const n = pile.count, width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  const pen = sharpPen(simCanvas, width, height);
  const box = { left: 10, right: width - 10, top: 34, bottom: height - 22 };
  let lowest = 0, highest = 0;
  for (let i = 0; i < n; i++) { lowest = Math.min(lowest, pile.I[i]); highest = Math.max(highest, pile.I[i]); }
  const cols = Math.max(1, Math.min(Math.round(box.right - box.left), highest - lowest + 1));
  const rows = Math.max(1, Math.min(Math.round(box.bottom - box.top), n));
  // Each column's first cell (the one that joined first).
  const first = new Int32Array(cols).fill(-1);
  for (let i = n - 1; i >= 0; i--) first[Math.floor((pile.I[i] - lowest) * cols / (highest - lowest + 1))] = i;
  const image = pen.createImageData(cols, rows), pixels = image.data;
  const outside = hexToRGB(BACKGROUND);
  for (let c = 0; c < cols; c++) {
    const i = first[c], from = i < 0 ? rows : Math.floor(i * rows / n), rgb = i < 0 ? outside : colorOf(colorGroup(i));
    for (let r = 0; r < rows; r++) {
      const p = 4 * (r * cols + c), color = r < from ? outside : rgb;
      pixels[p] = color[0]; pixels[p + 1] = color[1]; pixels[p + 2] = color[2]; pixels[p + 3] = 255;
    }
  }
  const small = document.createElement("canvas");
  small.width = cols;
  small.height = rows;
  small.getContext("2d").putImageData(image, 0, 0);
  pen.imageSmoothingEnabled = false;
  pen.drawImage(small, box.left, box.top, box.right - box.left, box.bottom - box.top);
  drawLabels1D(pen, box, n, lowest, highest);
}

// The 1D picture's words: the particles at the top, the positions under
// the picture.
function drawLabels1D(pen, box, n, lowest, highest) {
  const sx = function (x) { return box.left + (box.right - box.left) * (x - lowest + 0.5) / (highest - lowest + 1); };
  pen.fillStyle = CHART_TEXT;
  pen.font = "11px sans-serif";
  pen.textBaseline = "top";
  pen.textAlign = "left";
  pen.fillText("time goes down: particle 1 at the top, particle " + n.toLocaleString() + " at the bottom", box.left + 36, 4);
  pen.fillText(String(lowest), box.left, box.bottom + 6);
  pen.textAlign = "right";
  pen.fillText(String(highest), box.right, box.bottom + 6);
  if (lowest < 0 && highest > 0) {
    pen.textAlign = "center";
    pen.fillText("0", sx(0), box.bottom + 6);
  }
}

// 2D: the squares, painted as in the other sims (paintCells,
// js/sim-view.js), with the origin's square outlined.
function drawGrid() {
  const shown = pile.squaresShown(1);   // (one square to spare all round)
  const pen = fitPicture(view, shown, PICTURE_HEIGHT, true);
  paintCells(view, pen, shown, colorGroup, colorOf, hexToRGB(BACKGROUND));
  const left = squareLeft(view, -shown.xmin), top = squareTop(view, shown.ymax);
  const right = squareLeft(view, 1 - shown.xmin), bottom = squareTop(view, shown.ymax + 1);
  drawOrigin(pen, [[left, top], [right, top], [right, bottom], [left, bottom]]);
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// 2D on another tiling: the cells as polygons (paintDomain,
// js/sim-view.js), with the origin's cell outlined.
function drawTiling() {
  const shown = pile.tilingShown(clusterTiling, null);   // (js/sim-sites.js)
  const pen = fitPicture(view, shown, PICTURE_HEIGHT, true);
  paintDomain(view, pen, shown, colorGroup, colorOf, hexToRGB(BACKGROUND), null, 0);
  const { sx, sy } = screenCopies(view, shown)[0];
  drawOrigin(pen, clusterTiling.cells[0].corners.map(function ([u, w]) { return [sx(u), sy(w)]; }));   // (cell 0 of block (0, 0))
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// The origin: its cell outlined, through the cell's corners on the canvas.
function drawOrigin(pen, corners) {
  pen.strokeStyle = ORIGIN;
  pen.lineWidth = 1;
  pen.beginPath();
  corners.forEach(function ([x, y], k) { if (k === 0) pen.moveTo(x, y); else pen.lineTo(x, y); });
  pen.closePath();
  pen.stroke();
}

// 3D: loaded the first time it is needed (make3D, js/sim-page.js). Each
// cell is drawn in its own shape (js/sim-3d.js); past its most, only the
// last cells to join are drawn, which are the outside of the cluster.
const three = make3D(simCanvas, PICTURE_HEIGHT, { ready: drawSoon });

function draw3D() {
  if (!three.view) return;
  const n = pile.count;
  three.code.drawCells(three.view, {
    x: pile.I.subarray(0, n), y: pile.J.subarray(0, n), z: pile.K.subarray(0, n),
    block: clusterBlock, part: pile.part.subarray(0, n),
    color: function (i) { return colorOf(colorGroup(i)); },
  });
}

// Which picture shows: the flat one (1D, 2D) or the 3D one.
function showPictureKind() {
  simCanvas.hidden = (dim === 3);
  three.show(dim === 3);
  byId("view3d-help").hidden = (dim !== 3);
  useTorus(view, false, dim === 2);       // only the 2D picture moves and zooms
}

// "Early or late" can be picked on the grids only (off them, the colors
// go back to "when it joined"); the help under the colors says what the
// picture shows.
function showColorOptions() {
  byId("early-late-label").hidden = !onGrid();
  if (!onGrid()) document.querySelector('input[name="color-by"][value="arrival"]').checked = true;
  const earlyLate = haveCluster() && showsEarlyLate();
  byId("arrival-help").hidden = earlyLate;
  byId("early-late-help").hidden = !earlyLate;
  if (earlyLate) byId("early-late-scale").textContent = niceNumber(spread);
}


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   All for the cluster on the screen. The worker keeps the numbers up to
   date, and a sample of them every so often for the charts (part 2 of
   internal-discrete-dla-growth.js). On the grids the dashed gray lines
   are rho_n (the radius chart) and the size of the errors theory gives
   (see "All the details" for where each comes from).
   ===================================================================== */

function showStats() {
  showColorOptions();
  if (!haveCluster()) return;
  for (const e of document.querySelectorAll(".only-grid")) e.hidden = !latest.grid;
  for (const d of [1, 2, 3]) byId("error-guide-" + d + "d").hidden = (d !== dim);
  showTable(latest);
  drawCharts(latest);
}

// The table of numbers.
function showTable(s) {
  byId("stat-particles").textContent = s.particles.toLocaleString();
  byId("stat-inner").textContent = niceNumber(s.inner);
  byId("stat-outer").textContent = niceNumber(s.outer);
  if (s.grid) {
    byId("stat-rho").textContent = niceNumber(s.rho);
    byId("stat-inner-error").textContent = niceNumber(s.rho - s.inner);
    byId("stat-outer-error").textContent = niceNumber(s.outer - s.rho);
  }
  byId("stat-steps").textContent = s.steps.toLocaleString();
  byId("stat-jumps").textContent = s.jumps.toLocaleString();
}

// What theory says the errors are of the order of, at each of "times"
// (see "All the details"): on the line exactly the outer error's root
// mean square, in 2D and 3D only the order (the constants are not
// known).
function errorGuide(times) {
  return Float64Array.from(times, function (n) {
    if (dim === 1) return Math.sqrt((n + 1) / 12);
    return dim === 2 ? Math.log(n) : Math.sqrt(Math.log(n));
  });
}

// The charts: the inner and outer radius (with rho_n on the grids), and
// on the grids the inner and outer error.
function drawCharts(s) {
  const times = s.traceParticles;
  const radii = [{ values: s.traceInner, color: INNER_LINE }, { values: s.traceOuter, color: CHART_LINE }];
  if (s.grid) radii.push({ values: Float64Array.from(times, function (n) { return ballRadius(dim, n); }), color: CHART_TEXT, dashed: true });
  plotOverTime(byId("radius-chart"), times, radii, "particles");
  if (!s.grid) return;
  plotOverTime(byId("error-chart"), times, [
    { values: s.traceInnerError, color: INNER_LINE },
    { values: s.traceOuterError, color: CHART_LINE },
    { values: errorGuide(times), color: CHART_TEXT, dashed: true },
  ], "particles");
}


/* =====================================================================
   7. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 1D, 2D or 3D. The growth starts again from one particle.
function setDimension(value) {
  dim = value;
  latest = null;
  showLatticeOptions();
  showPictureKind();
  restart(false);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// Lattice (2D) and the tiling of space (3D): the growth grows again to
// the number of particles it was at, on the new lattice, with the same
// seed.
connectLattice(function () {
  showLatticeOptions();
  restart(true);
});
fillSpaceMenus();
for (const id of ["set-honeycomb", "set-cell-kind"]) byId(id).addEventListener("change", function () { restart(true); });

// The colors: only the picture changes.
for (const radio of document.querySelectorAll('input[name="color-by"]')) radio.addEventListener("change", drawSoon);

// Go to step (a number of particles).
connectGoto(sim, MOST_PARTICLES, DEFAULT_GOTO);

// Seed: the same seed gives the same cluster every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
setDimension(2);              // 2D by default
