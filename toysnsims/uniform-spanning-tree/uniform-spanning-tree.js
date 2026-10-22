/* =====================================================================
   uniform-spanning-tree.js  —  the page of the "Uniform Spanning Tree" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells (on the square grid,
       or on any tiling by regular polygons, its tiles or its corners
       being the cells), a region drawn in the graph tool (shown inside
       this page), or a ball of a hyperbolic tiling or a tree. The
       domain code is shared with the other sims: the domains in
       js/sim-domains.js, the tilings in js/sim-tilings.js, their
       options and the graph tool in js/sim-controls.js, and the
       hyperbolic tilings and trees, and their pictures, in
       js/sim-hyperbolic.js.
     - Hands it to the worker (uniform-spanning-tree-wilson.js), which
       grows a uniformly random spanning tree with Wilson's algorithm
       in a second thread (a "Web Worker"), and draws the tree as it
       grows, with the walk that is adding to it.
     - Shows, as in R. Lyons and Y. Peres, "Probability on Trees and
       Networks" (Cambridge 2016), one of:
         the tree itself;
         its "colors" (Figures 4.3 and 4.4): how many times the walks
           stepped out of each cell;
         each cell's distance in the tree to the root (Figure 4.5);
         each cell's distance in the tree to the path between the root
           and a second cell, "the other end" (Figure 4.6);
       from above, colored from blue (low) to red (high), or in 3D, as
       stacks of blocks. The path from the other end to the root is
       drawn in blue. Its two ends, the root and the other end, can be
       dragged. The numbers come from js/sim-spanning.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Growing the tree
     4. The numbers shown on the cells
     5. Drawing the tree from above
     6. The 3D view
     7. Dragging the ends, moving and zooming
     8. Statistics
     9. The domain
    10. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain and seed (Lyons and Peres's Figure 4.3 is a 40 x 40
// grid).
const DEFAULTS = { width: 40, height: 40, seed: "1" };

const MAX_SIDE = 300;             // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 5, most: 20, cells: 20000 };

// The speeds on the Speed slider, in steps of the walk per second.
// Infinity means "as fast as the computer can".
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 20;

// The colors of the lines on top of the picture.
const TREE = "#1e1e1e";           // the tree's edges, and the root's dot
const PATH = "#2f6fd6";           // the path in the tree from the other end to the root
const EMPTY = "#ffffff";          // a cell with no number to show (not in the tree yet)
const EMPTY_3D = "#d9d7d2";       // in 3D, the flat tiles of the cells with no number, or 0

// With a number shown on the cells, the tree's edges are drawn on top
// only on cells at least this many pixels big (smaller, they would hide
// the colors). With "The tree" shown, they are always drawn.
const SMALLEST_LINED_CELL = 8;

// A press this many steps (cells) or fewer from the root or the other
// end picks it up, so it can be grabbed without pressing exactly on it
// (or when it sits under the zoom buttons, in a corner).
const GRAB_STEPS = 2;

// The colors from blue (low) to red (high) (heatColor, js/sim-colors.js),
// in 256 steps, and EMPTY as [red, green, blue], worked out once.
const PALETTE = [];
for (let k = 0; k < 256; k++) PALETTE.push(heatColor(k / 255));
const EMPTY_RGB = hexToRGB(EMPTY);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js); its kind is domains.kind (section 9)
let root = 0;                  // the root: one end of the blue path, and what "Distance to the root" measures to
let grownFrom = 0;             // the cell Wilson's algorithm grew the tree from (the root, until it is dragged on a finished tree)
let end = 0;                   // the other end of the blue path
let latest = null;             // the latest message from the worker (uniform-spanning-tree-wilson.js)
let numbers = null;            // the numbers on the cells, worked out from "latest" (section 4)
let show = "tree";             // what the picture shows: "tree", "colors", "root" or "path"
let show3D = false;            // the 3D view instead of the view from above (section 6)
let stretch = 1;               // the 3D view's Heights slider


/* =====================================================================
   3. GROWING THE TREE
   ---------------------------------------------------------------------
   The tree is treeWorker() in uniform-spanning-tree-wilson.js, with
   Wilson's algorithm (newWilson, js/sim-spanning.js) and the search
   through the domain (searchFrom, stepsFrom, js/sim-domains.js) copied
   in.
   runInWorker (js/sim-page.js) runs it in a second thread, so the page
   never freezes.
   ===================================================================== */
const sim = runInWorker(treeWorker, [newWilson, searchFrom, stepsFrom], function (message) {
  latest = message;
  workOutNumbers();
  drawSoon();
});

// A new tree from the start (paused), on the current domain, from the
// current root, with the current seed.
function restart() {
  grownFrom = root;
  latest = null;
  numbers = null;
  showMessage("");
  sim.setup({ n: domain.n, first: domain.first, nbr: domain.nbr, root: root, seed: byId("seed").value });
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). The run pauses by itself when the tree is done.
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "step", "steps", restart);


/* =====================================================================
   4. THE NUMBERS SHOWN ON THE CELLS
   ---------------------------------------------------------------------
   For each cell in the tree so far (js/sim-spanning.js):
     colors   how many times the walks stepped out of it (the root has
              none: no walk ever leaves it). Once a cell is in the tree,
              no walk steps out of it again, so its color is final.
     root     its distance in the tree to the root (treeDistances)
     path     its distance in the tree to the path from the other end to
              the root (treePath), once both are in the tree
   Cells not in the tree yet get -1: no number.
   The worker's tree points to the cell it grew from; once the root has
   been dragged elsewhere on the finished tree, the same tree is turned
   to point to the new root (rerootTree).
   ===================================================================== */
function workOutNumbers() {
  const n = domain.n;
  const parent = root === grownFrom ? latest.parent : rerootTree(latest.parent, root);
  const colors = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) if (parent[v] !== -1) colors[v] = latest.exits[v];
  const line = treePath(parent, end, root);     // null until both are in the tree
  numbers = {
    colors: colors,
    root: treeDistances(n, parent, root, [root]),
    path: line ? treeDistances(n, parent, root, line) : new Int32Array(n).fill(-1),
    line: line,
  };
}

// The numbers the picture shows (null for "The tree").
function shownNumbers() { return show === "tree" || !numbers ? null : numbers[show]; }

// The lowest and highest number shown: from 0 (1 for the colors, the
// fewest steps out of a cell) to the largest one there is.
function numberRange(values) {
  const lo = show === "colors" ? 1 : 0;
  let hi = lo + 1;
  for (let v = 0; v < values.length; v++) hi = Math.max(hi, values[v]);
  return { lo: lo, hi: hi };
}

// The color of the number k, from blue (lowest) to red (highest), as
// [red, green, blue] (PALETTE).
function numberRGB(k, range) {
  const t = (k - range.lo) / (range.hi - range.lo);
  return PALETTE[Math.max(0, Math.min(255, Math.round(255 * t)))];
}

// The key under the picture: the colors from the lowest number to the
// highest, as a strip (a CSS gradient), hidden for "The tree".
function showColorKey(range) {
  byId("color-key").hidden = range === null;
  if (range === null) return;
  const stops = [];
  for (let k = 0; k <= 10; k++) stops.push(rgbToHex(PALETTE[Math.round(25.5 * k)]));
  byId("key-strip").style.background = "linear-gradient(to right, " + stops.join(", ") + ")";
  byId("key-low").textContent = range.lo.toLocaleString();
  byId("key-high").textContent = range.hi.toLocaleString();
}


/* =====================================================================
   5. DRAWING THE TREE FROM ABOVE
   ---------------------------------------------------------------------
   The cells, each in the color of its number (white with no number, and
   all white for "The tree"), then on top: the tree's edges (black), the
   walk adding to the tree (white, with its loops erased), the path from
   the other end to the root (blue), a dot on the root and a ring around
   the other end. On a box, a torus or a drawn region, the lines join the
   cells' middles (cellLinesPath, js/sim-view.js); on a hyperbolic tiling
   or tree, they run through the sides the cells share (ballLinesPath,
   js/sim-hyperbolic.js).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });

const view = makeView(simCanvas, drawSoon);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, function () { domains.show(); });

function drawPicture() {
  if (!latest || !numbers) return;
  const values = shownNumbers(), range = values ? numberRange(values) : null;
  showColorKey(range);
  if (show3D) { draw3D(values, range); return; }
  if (simCanvas.hidden) return;
  const colorOf = function (v) { return values && values[v] >= 0 ? numberRGB(values[v], range) : EMPTY_RGB; };
  if (domains.kind === "graph") {
    const pen = drawBall(disk, domain, function (v) { return rgbToHex(colorOf(v)); });
    const width = isTree(disk.spec) ? 2 : 1.5;
    drawOnTop(pen, values === null, width, ballLinesPath.bind(null, disk, domain), ballDotsPath.bind(null, disk, domain));
    return;
  }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  paintDomain(view, pen, domain, function (v) { return v; }, function (v) { return colorOf(v); },
    hexToRGB(OUTSIDE_CELLS), null, 0);
  const width = Math.max(1.2, cellSize(view) * 0.18);
  const lined = values === null || cellSize(view) >= SMALLEST_LINED_CELL;
  drawOnTop(pen, lined, width, cellLinesPath.bind(null, view, domain), cellDotsPath.bind(null, view, domain));
  pen.restore();
}

// The lines and dots on top of the cells, "width" pixels thick:
// linesPath(addLines) and dotsPath(cells, radius) make them, on a box
// (cellLinesPath, cellDotsPath) or on a ball (ballLinesPath,
// ballDotsPath). The tree's edges only if "withTree".
function drawOnTop(pen, withTree, width, linesPath, dotsPath) {
  const parent = latest.parent, walk = latest.path, line = numbers.line;
  pen.lineCap = pen.lineJoin = "round";
  if (withTree) {
    pen.strokeStyle = TREE;
    pen.lineWidth = width;
    pen.stroke(linesPath(function (add) {
      for (let v = 0; v < domain.n; v++) if (parent[v] !== -1) add(v, parent[v]);
    }));
  }
  if (line) {
    pen.strokeStyle = PATH;
    pen.lineWidth = 2 * width;
    pen.stroke(linesPath(function (add) { for (let k = 0; k + 1 < line.length; k++) add(line[k], line[k + 1]); }));
  }
  drawWalk(pen, walk, width, linesPath, dotsPath);   // (js/sim-view.js)
  pen.fillStyle = TREE;
  pen.fill(dotsPath([root], 2 * width));
  pen.strokeStyle = TREE;
  pen.lineWidth = Math.max(1.5, width / 2);
  pen.stroke(dotsPath([end], 2.6 * width));
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. THE 3D VIEW
   ---------------------------------------------------------------------
   The View option "3D" (for a number, not for "The tree") stands a
   stack of blocks on each cell, as many as its number, colored from
   the bottom up with the same colors as the view from above, like
   Lyons and Peres's Figures 4.5 and 4.6. The blue path runs over the
   tops of the stacks. Cells with no number yet, or with 0, are flat
   gray tiles. The 3D code is shared, in js/sim-3d.js (and where the
   cells stand, floorOf3D, in js/sim-view.js); it loads the 3D library
   three.js from the internet the first time 3D is switched on.
   ===================================================================== */
const three = make3D(simCanvas, MAX_PICTURE_HEIGHT, {   // js/sim-page.js
  ready: drawSoon,
  failed: function () { show3D = false; showPictureKind(); },
});

// Which picture shows: the view from above, the 3D view, or neither
// while the graph tool is open. 3D is only for the numbers.
function showPictureKind() {
  const radio3D = document.querySelector('input[name="view"][value="3d"]');
  radio3D.disabled = show === "tree";
  if (show === "tree" && show3D) {
    show3D = false;
    document.querySelector('input[name="view"][value="flat"]').checked = true;
  }
  const toolOpen = domains.tool.isOpen;
  simCanvas.hidden = toolOpen || show3D;
  three.show(!toolOpen && show3D);
  byId("view3d-help").hidden = byId("stretch-row").hidden = !show3D;
  showZoomButtons(view);
  drawSoon();
}

function draw3D(values, range) {
  if (!three.view || !values) return;
  const f = floorOf3D(domain, domains.kind, disk);
  const height = f.cells.map(function (v) { return Math.max(values[v], 0); });
  three.code.drawStacks(three.view, {
    x: f.x, y: f.y, height: height, width: f.width, floor: f.floor,
    shape: f.shape, corners: f.corners, stretch: stretch,
    color: function (k) { return numberRGB(k, range); },
    empty: hexToRGB(EMPTY_3D), ground: hexToRGB(OUTSIDE_CELLS),
    lines: f.lines, lineColor: hexToRGB(UNDER_COLOR),
    topLines: pathOverStacks(f, height), topLineColor: hexToRGB(PATH),
  });
}

// The blue path over the stacks, as drawStacks's topLines: for each step
// of the path whose two cells both have a stack, a line from the top of
// one to the top of the other.
function pathOverStacks(f, height) {
  const line = numbers.line, lines = [];
  if (!line) return lines;
  const stackOf = new Map();
  f.cells.forEach(function (v, i) { stackOf.set(v, i); });
  for (let k = 0; k + 1 < line.length; k++) {
    const a = stackOf.get(line[k]), b = stackOf.get(line[k + 1]);
    if (a === undefined || b === undefined) continue;
    lines.push(f.x[a], f.y[a], height[a], f.x[b], f.y[b], height[b]);
  }
  return lines;
}


/* =====================================================================
   7. DRAGGING THE ENDS, MOVING AND ZOOMING
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-view.js). On a hyperbolic tiling or
   tree, one pointer drags across the plane instead.
   The root's dot and the other end's ring can be dragged: a press on
   either, or near it (GRAB_STEPS), picks up the nearer one, and it
   snaps to the cell under the pointer. The other end just moves along
   the tree. The root moves along the tree too once the tree is
   finished (the same tree, now pointing to the new root: Wilson's
   algorithm gives the same uniform tree from any root); before that,
   moving it grows a new tree from it (paused).
   ===================================================================== */
let dragging = null;     // what a press picked up: "root", "end", or null

connectPicture(view, {
  disk: disk, onGraph: function () { return domains.kind === "graph"; },
  grab: {
    press: function (event) {
      dragging = endNear(cellUnderPointer(event));
      return dragging !== null;
    },
    move: function (event) {
      const v = cellUnderPointer(event);
      if (v === -1) return;
      if (dragging === "end" && v !== end) moveEnd(v);
      if (dragging === "root" && v !== root) moveRoot(v);
    },
    release: function () { dragging = null; },
  },
});

// The end of the blue path at most GRAB_STEPS from cell v, "root" or
// "end" (the nearer one; the root if they are as near), or null.
function endNear(v) {
  if (v === -1) return null;
  const steps = stepsFrom(domain, [v]);     // (js/sim-domains.js)
  const near = function (w) { return steps[w] !== -1 && steps[w] <= GRAB_STEPS; };
  if (near(root) && (!near(end) || steps[root] <= steps[end])) return "root";
  return near(end) ? "end" : null;
}

function cellUnderPointer(event) { return cellAtEvent(view, disk, domain, domains.kind === "graph", event); }

function moveEnd(v) {
  end = v;
  if (latest) workOutNumbers();
  drawSoon();
}

function moveRoot(v) {
  root = v;
  if (!treeIsFinished()) { restart(); return; }
  workOutNumbers();
  drawSoon();
}

// Is every cell of the root's piece in the tree?
function treeIsFinished() { return latest !== null && latest.joined === latest.pieceSize; }


/* =====================================================================
   8. STATISTICS
   ===================================================================== */
function showStats() {
  if (!latest || !numbers) return;
  const s = latest, n = domain.n;
  byId("stat-cells").textContent = s.joined.toLocaleString() + " of " + s.pieceSize.toLocaleString();
  byId("stat-steps").textContent = s.steps.toLocaleString();
  byId("stat-path").textContent = numbers.line ? (numbers.line.length - 1).toLocaleString() + " steps" : "not in the tree yet";
  byId("stat-colors").textContent = largest(numbers.colors);
  byId("stat-root").textContent = largest(numbers.root);
  byId("stat-to-path").textContent = numbers.line ? largest(numbers.path) : "";
  const left = n - s.pieceSize;
  showMessage(left > 0 ? "The domain is in several pieces: the " + left.toLocaleString() +
    (left === 1 ? " cell" : " cells") + " not joined to the root can't be in its tree, so they are left out." : "");
}

// The largest number in a list, as text ("" if there is none yet).
function largest(values) {
  let most = -1;
  for (let v = 0; v < values.length; v++) most = Math.max(most, values[v]);
  return most < 0 ? "" : most.toLocaleString();
}


/* =====================================================================
   9. THE DOMAIN
   ---------------------------------------------------------------------
   Box / Torus / Custom / Hyperbolic plane or tree, and their options,
   the Lattice options among them (connectDomains, js/sim-controls.js).
   Custom swaps the picture for the graph tool, where any drawing of at
   least two cells in one piece works (oneConnectedPiece,
   js/sim-controls.js). A new domain starts with the
   root in its lower left corner and the other end in its upper right
   (as in Lyons and Peres's figures); on a hyperbolic tiling or tree,
   the root is the middle cell and the other end a cell on the edge.
   ===================================================================== */
const domains = connectDomains({
  view: view, player: player, disk: disk,
  box: function () { return boxFromOptions(2, MAX_SIDE, DEFAULTS); },
  ball: function () { return ballFromOptions(disk, BALL); },
  custom: { check: oneConnectedPiece, showPicture: showPictureKind },
  use: function (d) {
    domain = d;
    [root, end] = corners(d);
    restart();
  },
});

// The root and the other end on a new domain d: the cells nearest its
// lower left and upper right corners (the least and the most of x + y,
// for the cells' middles), or on a ball, the middle cell and the last
// cell (the balls' cells go out layer by layer).
function corners(d) {
  if (domains.kind === "graph") return [0, d.n - 1];
  const middles = cellMiddles(d);
  let low = 0, high = 0;
  for (let v = 1; v < d.n; v++) {
    const s = middles[v][0] + middles[v][1];
    if (s < middles[low][0] + middles[low][1]) low = v;
    if (s > middles[high][0] + middles[high][1]) high = v;
  }
  return [low, high];
}


/* =====================================================================
   10. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// The Show option: the tree, or a number on the cells.
for (const radio of document.querySelectorAll('input[name="show"]')) {
  radio.addEventListener("change", function () { show = radio.value; showPictureKind(); });
}

// The View option, and the 3D view's Heights slider.
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () { show3D = (radio.value === "3d"); showPictureKind(); });
}
connectStretch(function (value) { stretch = value; drawSoon(); });

// Seed: the same seed gives the same tree every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("seed").value = DEFAULTS.seed;
domains.useTicked();    // the box ticked on the page, and the first tree
showPictureKind();
