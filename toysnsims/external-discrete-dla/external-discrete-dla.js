/* =====================================================================
   external-discrete-dla.js  —  the page of the "External Discrete DLA"
   sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the dimension, the lattice (in 2D the square grid or
       another tiling, in 3D a tiling of space) and the launch distance.
     - Hands them to the growth (external-discrete-dla-growth.js),
       which runs in a second thread (a "Web Worker"), and draws every
       cluster it sends back, with the statistics.
   Small helpers used by every sim page (byId, keepAlong, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, the colors in
   js/sim-colors.js, moving, zooming and painting the 2D picture in
   js/sim-view.js, the cluster's cells kept and drawn as on Internal
   Discrete DLA's page, and the statistics shown as on External
   Continuous DLA's, in js/sim-cluster-page.js (with js/sim-sites.js),
   the 3D picture in js/sim-3d.js, the tilings of the plane in
   js/sim-tilings.js and of space in js/sim-honeycombs.js (with their
   options in js/sim-controls.js).

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the growth
     4. Drawing the cluster
     5. Statistics
     6. Connecting the buttons on the page
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
const ORIGIN = "#222222";         // the seed's outline (2D)

// The colors come in this many steps, from blue (first) to red (just now).
const COLOR_STEPS = 64;

// The speeds on the Speed slider, in particles per second. Infinity
// means "as fast as the computer can". The default is slow, so you can
// watch every cell join.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;
const DEFAULT_GOTO = 10000;           // the Go to box's first number (the most is MOST_PARTICLES)

// The launch distance box goes from 1 to this many reaches (its first
// value is DEFAULT_LAUNCH, external-discrete-dla-growth.js).
const MOST_LAUNCH = 64;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 2;                 // 2 or 3

// The latest message from the growth (serveGrowth, js/sim-cluster.js,
// with the numbers of part 2 of external-discrete-dla-growth.js).
let latest = null;

// The cluster on the screen (js/sim-cluster-page.js): its cells, in
// the order they joined (the worker sends only the new ones each time,
// and the pile adds them up), and the lattice it grew on. Cell i is
// cell pile.part[i] of block (pile.I[i], pile.J[i], pile.K[i]) (on the
// square grid: the point (I, J)), and joined as particle i + 1.
// pile.count is how many there are.
const cluster = newClusterOnPage(function () { return dim; }), pile = cluster.pile;

// Whether "latest" is a cluster to show: not just a problem, and not
// from before a switch of dimension.
function haveCluster() { return Boolean(latest && latest.traceParticles && latest.dim === dim); }


/* =====================================================================
   3. RUNNING THE GROWTH
   ---------------------------------------------------------------------
   The growth is growthWorker() in external-discrete-dla-growth.js, with
   newExternalDLA(), the Brownian launch and return
   (js/sim-continuum.js), the lattices, steps and jumps
   (js/sim-walk.js), the cluster and the growth's second thread
   (js/sim-cluster.js), the trace, heap and random numbers
   (js/sim-worker.js), where cells are (js/sim-domains.js,
   js/sim-honeycombs.js) and what grows a Penrose tiling's plane
   (js/sim-penrose.js) copied in. runInWorker (js/sim-page.js) runs it in
   a second thread, so the page never freezes, and hands each report to
   showGrowth.
   ===================================================================== */
const sim = runInWorker(growthWorker,
  [newExternalDLA, siteNear, dot3, cross3, length3,
   newTrace, keepSample, seededUniform, newHeap, honeycombMiddle, blockStart, middleAt, cellNeighbors,
   { MOST_PARTICLES: MOST_PARTICLES, FAR_LAUNCHES: FAR_LAUNCHES }]
  .concat(continuumHelpers(), walkHelpers(), clusterHelpers(), penroseHelpers()), showGrowth);

function showGrowth(message) {
  if (message.problem) {
    latest = null;
    showMessage(message.problem);
    drawSoon();
    return;
  }
  cluster.keep(message);
  latest = message;
  showMessage(clusterStopped(message, MOST_PARTICLES, "The walkers, which wander up to " + FAR_LAUNCHES + " times as far out as the launch circle, have"));
  drawSoon();
}

// The launch distance in the box, from 1 to MOST_LAUNCH reaches.
function launchNow() {
  const box = byId("set-launch");
  let v = Number(box.value);
  if (!isFinite(v) || box.value === "") v = DEFAULT_LAUNCH;
  v = Math.min(Math.max(v, 1), MOST_LAUNCH);
  box.value = v;
  return v;
}

// Start the growth again, paused. keepCount: grow to the number of
// particles we are at (so changing the lattice keeps it).
function restart(keepCount) {
  sim.setup(Object.assign(cluster.forSetup(), {
    dim: dim, launch: launchNow(), seed: byId("seed").value,
    particles: (keepCount && haveCluster()) ? latest.particles : 1,
  }));
}

// Play / Pause, One particle, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
connectPlay(sim, SPEEDS, DEFAULT_SPEED, "particle", "particles", function () { restart(false); });


/* =====================================================================
   4. DRAWING THE CLUSTER
   ---------------------------------------------------------------------
     2D: the cells as squares (on another tiling, as its polygons),
         with the seed outlined. It can be moved and zoomed
         (js/sim-view.js). The canvas keeps one height as the cluster
         grows, so the page doesn't jump.
     3D: each cell in its own shape (a cube on the cubic grid).
   (drawClusterCells, js/sim-cluster-page.js.) Each cell is colored by
   when it joined, from blue (first) to red (just now).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawCluster(); showStats(); });

const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
connectPicture(view);   // drag and pinch the 2D picture (js/sim-view.js)
window.addEventListener("resize", drawSoon);

// 3D: loaded the first time it is needed (make3D, js/sim-page.js).
const three = make3D(simCanvas, PICTURE_HEIGHT, { ready: drawSoon });

// The colors, worked out once (heatColor, js/sim-colors.js).
const COLORS = [];
for (let k = 0; k < COLOR_STEPS; k++) COLORS.push(heatColor(k / (COLOR_STEPS - 1)));
function colorOf(group) { return COLORS[group]; }

// The color group of cell i: when it joined.
function colorGroup(i) { return Math.min(COLOR_STEPS - 1, Math.floor(COLOR_STEPS * i / pile.count)); }

// How drawClusterCells draws the cells.
const LOOK = { height: PICTURE_HEIGHT, colorGroup: colorGroup, colorOf: colorOf, background: BACKGROUND, origin: ORIGIN };

function drawCluster() {
  if (haveCluster()) drawClusterCells(cluster, view, three, LOOK);
}


/* =====================================================================
   5. STATISTICS
   ---------------------------------------------------------------------
   All for the cluster on the screen: the numbers and charts every
   external DLA page shows, with the fitted fractal dimension
   (showExternalStats, js/sim-cluster-page.js), and this page's own:
   steps, and in 3D the walkers replaced.
   ===================================================================== */

function showStats() {
  if (!haveCluster()) return;
  showExternalStats(latest);
  byId("stat-steps").textContent = latest.steps.toLocaleString();
  byId("replaced-row").hidden = (dim !== 3);
  byId("stat-replaced").textContent = latest.replaced.toLocaleString();
}


/* =====================================================================
   6. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 2D or 3D. The growth starts again from the seed.
function setDimension(value) {
  dim = value;
  latest = null;
  showLatticeRowsFor(dim);    // (js/sim-controls.js)
  showClusterPicture(view, three, dim);
  restart(false);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// Lattice (2D) and the tiling of space (3D), and the launch distance:
// the growth grows again to the number of particles it was at, with the
// same seed.
connectLattice(function () {
  showLatticeRowsFor(dim);
  restart(true);
});
connectSpaceTilings(function () { restart(true); });
byId("set-launch").addEventListener("change", function () { restart(true); });

// Go to step (a number of particles).
connectGoto(sim, MOST_PARTICLES, DEFAULT_GOTO);

// Seed: the same seed gives the same cluster every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
byId("set-launch").value = DEFAULT_LAUNCH;
setDimension(2);              // 2D by default
