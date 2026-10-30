/* =====================================================================
   external-continuous-dla.js  —  the page of the "External Continuous
   DLA" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the dimension (the plane or space), the tile (a typed
       formula, with sliders) and the stop epsilon.
     - Hands them to the growth (external-continuous-dla-growth.js),
       which runs in a second thread (a "Web Worker"), and draws every
       cluster it sends back, with the latest particle's walk and the
       statistics.
   Small helpers used by every sim page (byId, runInWorker, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, the colors in
   js/sim-colors.js, moving and zooming the 2D picture in
   js/sim-view.js (makePlaneView), the 3D picture in js/sim-3d.js,
   reading the formula with sliders in js/formulas.js, the tile's shape
   in js/sim-tile-shape.js (with the 3D vectors of js/sim-honeycombs.js),
   and in js/sim-cluster-page.js what the continuous DLA pages share (the
   Tile box, drawing the tiles and the walk) and the statistics every
   external DLA page shows.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Reading the tile
     4. Running the growth
     5. Drawing the cluster, and the latest particle's walk
     6. Statistics
     7. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

const DEFAULT_SEED = "1";
// The picture's height in screen pixels (in the full screen popup, the
// popup's height instead: pictureHeight, in js/sim-page.js). It always
// shows the launch circle, with a little room around it, until you move
// or zoom it.
const PICTURE_HEIGHT = 480;
const FIT_MARGIN = 1.04;
const BACKGROUND = "#ffffff";
const LAUNCH_CIRCLE = "#999999";   // the circle the latest particle started on (dashed)

// The speeds on the Speed slider, in particles per second. Infinity
// means "as fast as the computer can". The default is slow, so you can
// watch every particle walk in.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;
const DEFAULT_GOTO = 10000;           // the Go to box's first number (the most is MOST_PARTICLES)

// The starting tiles (presets) in each dimension, the first one the
// default. Each fills in the formula and, if it has any, its sliders.
// The star: s is how deep its arms are cut, h how many arms it has.
const PRESETS = {
  2: {
    disk:   { label: "Disks (classic DLA)", T: "x^2 + y^2 <= 1" },
    square: { label: "Squares", T: "max(abs(x), abs(y)) <= 1" },
    star:   { label: "Your star (slower: not convex)", T: "sqrt(x^2 + y^2) <= 1 + s cos(h atan2(y, x))",
              sliders: { s: { value: 0.5, min: 0, max: 1, step: 0.01 }, h: { value: 5, min: 0, max: 12, step: 1 } } },
  },
  3: {
    ball: { label: "Balls (classic DLA)", T: "x^2 + y^2 + z^2 <= 1" },
    cube: { label: "Cubes", T: "max(abs(x), abs(y), abs(z)) <= 1" },
  },
};


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 2;                 // 2 or 3

// The latest message from the growth (serveGrowth, js/sim-cluster.js,
// with the numbers of part 2 of external-continuous-dla-growth.js).
let latest = null;

// The tiles' centers, in the order they joined (the worker sends only
// the new ones each time). Tile i joined as particle i + 1.
const tiles = { x: [], y: [], z: [] };

// The tile's outline, from the worker (tileOutline, js/sim-tile-shape.js),
// centered at the origin: in 2D { x, y, round, rhoMax, area }; in 3D
// { corners, triangles, round, rhoMax }, with "id", a new number for
// each new tile (the 3D picture makes its shape again only then).
let outline = null, outlineCount = 0;

// The latest particle's walk, shown as it happens (newWalkShow,
// js/sim-cluster-page.js).
const walk = newWalkShow();

// Whether "latest" is a cluster to show: not just a problem, and not
// from before a switch of dimension.
function haveCluster() { return Boolean(latest && latest.traceParticles && latest.dim === dim); }


/* =====================================================================
   3. READING THE TILE
   ---------------------------------------------------------------------
   The Tile box (newTileBox, js/sim-cluster-page.js) reads the formula
   and its sliders. A formula that can't be read yet (usually it is
   half typed) keeps the last good cluster; a new tile grows again to
   the number of particles the run was at, with the same seed. The
   worker turns the formula into the tile's polygon or polyhedron
   (tilePolygon, tilePolyhedron, js/sim-tile-shape.js), which needs T
   to be star-shaped around the origin: each ray from it leaves T once.
   ===================================================================== */

const tileBox = newTileBox(PRESETS, function () { restart(true); });


/* =====================================================================
   4. RUNNING THE GROWTH
   ---------------------------------------------------------------------
   The growth is growthWorker() in external-continuous-dla-growth.js,
   with newExternalContinuousDLA(), the Brownian launch, return and
   jumps (js/sim-continuum.js), the tile's shape and the gaps between
   tiles (js/sim-tile-shape.js), the buckets, radius of gyration and the
   growth's second thread (js/sim-cluster.js), and the trace and random
   numbers (js/sim-worker.js) copied in. runInWorker (js/sim-page.js)
   runs it in a second thread, so the page never freezes, and hands
   each report to showGrowth.
   ===================================================================== */
const sim = runInWorker(growthWorker,
  [newExternalContinuousDLA, newTrace, keepSample, seededUniform, add3, sub3, scale3, dot3, cross3, length3,
   { MOST_PARTICLES: MOST_PARTICLES, NEAR_RADII: NEAR_RADII, BUCKET_RADII: BUCKET_RADII, COARSE_RADII: COARSE_RADII }]
  .concat(continuumHelpers(), tileShapeHelpers(), clusterHelpers()), showGrowth);

function showGrowth(message) {
  if (message.problem) {
    latest = null;
    byId("formula-message").textContent = "Problem: " + message.problem;
    drawSoon();
    return;
  }
  if (message.shape) outline = Object.assign({ id: ++outlineCount }, message.shape);
  if (message.sitesFrom === 0) tiles.x.length = tiles.y.length = tiles.z.length = 0;
  for (let i = 0; i < message.x.length; i++) { tiles.x.push(message.x[i]); tiles.y.push(message.y[i]); }
  for (let i = 0; i < message.z.length; i++) tiles.z.push(message.z[i]);
  walk.follow(message, player);
  latest = message;
  showMessage(clusterStopped(message, MOST_PARTICLES, ""));
  drawSoon();
}

// Start the growth again, paused. keepCount: grow to the number of
// particles we are at (so changing the tile keeps it).
function restart(keepCount) {
  if (!tileBox.formula) return;
  sim.setup({
    dim: dim, tileFormula: tileBox.formula, values: tileBox.values(), epsilon: epsilonInBox(), seed: byId("seed").value,
    particles: (keepCount && haveCluster()) ? latest.particles : 1,
  });
}

// Play / Pause, One particle, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "particle", "particles", function () { restart(false); });


/* =====================================================================
   5. DRAWING THE CLUSTER, AND THE LATEST PARTICLE'S WALK
   ---------------------------------------------------------------------
   2D: the picture is a plane view (makePlaneView, js/sim-view.js). It
   follows the cluster as it grows, always showing the launch circle,
   until you drag or zoom it; the Fit button follows it again.
   Each tile is the tile's outline moved to its center, colored by when
   it joined, from blue (first) to red (just now). With "Show each
   particle's walk" ticked, the latest particle walks in: the dashed
   launch circle it started on, each circle it jumped across (walk on
   spheres: no tile is inside it, so the particle can jump straight to
   a uniform point on it), and the path from jump to jump. Its tile
   shows once it lands.
   3D: the tiles in the 3D picture (drawCells, js/sim-3d.js), which
   always shows the launch sphere's room; the walk is the path, the
   particle as a dark ball, and the see-through sphere it is jumping
   across now.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between); while a walk is shown, only
// the picture is drawn again at each refresh.
const drawSoon = oncePerFrame(function () { drawCluster(); showStats(); });
const walkOn = oncePerFrame(drawCluster);

let following = true;
const plane = makePlaneView(simCanvas, drawSoon, {
  reset: function () { following = true; },
  onMove: function () { following = false; },
  resetTitle: "Fit the picture to the launch circle, and keep following it as the cluster grows", resetWord: "Fit",
});
connectPicture(plane);   // drag and pinch the picture (js/sim-view.js)
window.addEventListener("resize", drawSoon);

// 3D: loaded the first time it is needed (make3D, js/sim-page.js).
const three = make3D(simCanvas, PICTURE_HEIGHT, { ready: drawSoon });

function drawCluster() {
  const watching = byId("show-walk").checked, share = watching ? walk.share() : 1;
  if (dim === 3) draw3D(watching, share);
  else draw2D(watching, share);
  if (haveCluster() && share < 1) walkOn();     // the walk goes on at the next refresh
}

function draw2D(watching, share) {
  const pen = sizePlane(plane, pictureHeight(PICTURE_HEIGHT));
  pen.fillStyle = BACKGROUND;
  pen.fillRect(0, 0, plane.width, plane.height);
  if (!haveCluster() || !outline) return;
  if (following) {
    const reach = FIT_MARGIN * latest.launchRadius;
    showWhole(plane, { xmin: -reach, xmax: reach, ymin: -reach, ymax: reach });
  }
  drawTilesFlat(plane, pen, tiles, outline, share < 1 ? walk.tile : tiles.x.length);
  if (watching) drawWalk(pen, share);
}

// The latest particle's walk, as far as "share" of it: the launch
// circle it started on (dashed), then the circles it jumped across and
// its path (drawWalkFlat, js/sim-cluster-page.js).
function drawWalk(pen, share) {
  const path = walk.path;
  if (path.length === 0) return;
  pen.lineWidth = 1;
  pen.strokeStyle = LAUNCH_CIRCLE;
  pen.setLineDash([4, 4]);
  pen.beginPath();
  pen.arc(pixelX(plane, 0), pixelY(plane, 0), Math.hypot(path[0][0], path[0][1]) * plane.ux, 0, 2 * Math.PI);
  pen.stroke();
  pen.setLineDash([]);
  drawWalkFlat(plane, pen, path, share);
}


// 3D: tiles 0 to n - 1 (all of them once the latest has landed), and
// while the latest particle walks: its path so far, where it is (a dark
// ball), and the sphere it is jumping across now (see-through). A
// return to the launch sphere is not joined up.
function draw3D(watching, share) {
  if (!three.view || !haveCluster() || !outline) return;
  const n = share < 1 ? walk.tile : tiles.x.length;
  const cells = {
    x: tiles.x.slice(0, n), y: tiles.y.slice(0, n), z: tiles.z.slice(0, n),
    tile: outline, color: function (i) { return arrivalColor(i, n); },
    reach: FIT_MARGIN * latest.launchRadius,
  };
  if (watching) walkIn3D(cells, walk.path, share, latest.launchRadius, outline.rhoMax);   // (js/sim-cluster-page.js)
  three.code.drawCells(three.view, cells);
}


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   All for the cluster on the screen: the numbers and charts every
   external DLA page shows, with the fitted fractal dimension
   (showExternalStats, js/sim-cluster-page.js).
   ===================================================================== */

function showStats() {
  if (!haveCluster()) return;
  showExternalStats(latest);
  byId("replaced-row").hidden = (dim !== 3);
  byId("stat-replaced").textContent = latest.replaced.toLocaleString();
}


/* =====================================================================
   7. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 2D or 3D. The growth starts again from one tile, with the
// tile last used in that dimension (at first, its first preset). Words
// for one dimension only (data-dim="2" or "3") show only in it.
function setDimension(value) {
  dim = value;
  latest = null;
  for (const words of document.querySelectorAll("[data-dim]")) words.hidden = Number(words.dataset.dim) !== dim;
  showFlatOr3D(plane, three, dim);   // (js/sim-cluster-page.js)
  tileBox.use(dim);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// The tile (the Tile box, above), and the stop.
byId("set-epsilon").addEventListener("change", function () { restart(true); });

// Show each particle's walk, or not.
byId("show-walk").addEventListener("change", drawSoon);

// Go to step (a number of particles).
connectGoto(sim, MOST_PARTICLES, DEFAULT_GOTO);

// Seed: the same seed gives the same cluster every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
byId("set-epsilon").value = DEFAULT_EPSILON;
setDimension(2);              // 2D, classic DLA: disks
