/* =====================================================================
   percolation.js  —  the page of the two percolation sims
   ---------------------------------------------------------------------
   One script for both pages: site-percolation.html and
   bond-percolation.html. Each page says which it is in its <body> tag
   (data-kind="site" or data-kind="bond"), and this script reads that.

   What it does, in plain words:
     - Builds the domain: a box or torus of cells, a region drawn in
       the graph tool (shown inside this page), or a ball of a
       hyperbolic tiling or a tree. The domain code is shared with the
       other sims: the domains in js/sim-domains.js, their options and
       the graph tool in js/sim-controls.js, and the hyperbolic tilings
       and trees, and their pictures, in js/sim-graphs.js and
       js/sim-hyperbolic.js.
     - Gives every cell (site) or every edge (bond) its own random
       number U, from the seed. At the p on the slider, the ones with
       U < p are open (percolation-clusters.js finds the clusters).
     - Draws the clusters, each in its own color, and the statistics.
     - Play raises p slowly, so you watch the clusters grow and join.
   All of this is quick (well under a second even for the biggest
   domain), so it runs in the page itself, with no second thread.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Computing the clusters
     4. Colors
     5. Drawing
     6. Moving, zooming and clicking a cluster
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

const KIND = document.body.dataset.kind;   // "site" or "bond"

// The default domain, p and seed, for each kind. Bond percolation
// starts smaller, so the edges show.
const DEFAULTS = KIND === "site"
  ? { width: 128, height: 128, neighbors: 4, p: 0.593, seed: "1" }
  : { width: 48, height: 48, neighbors: 4, p: 0.5, seed: "1" };

const MAX_SIDE = KIND === "site" ? 400 : 300;   // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // lines between clusters
const CLOSED = "#ffffff";         // closed cells (site), or cells with no open edge (bond)
const OPEN = "#5d6370";           // open cells in the "open or closed" colors
const OTHERS = "#c9ccd3";         // the other clusters in the "largest cluster" colors
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const SMALLEST_BORDERED_CELL = 4; // cells smaller than this (in pixels) get no border lines
const SMALLEST_EDGE_CELL = 6;     // bond: cells at least this big are drawn as dots and edges

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 6, most: 20, cells: 20000 };

// The critical point p_c on the square grid, where an infinite cluster
// first appears (see "All the details" for where these come from).
// null where no exact or well-established value is known. (On a tree,
// see criticalPoint.)
const CRITICAL = KIND === "site" ? { 4: 0.592746, 8: 1 - 0.592746 } : { 4: 0.5, 8: null };

// Play raises p by this much per second (the Speed slider).
const SPEEDS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
const DEFAULT_SPEED = SPEEDS.indexOf(0.005);
const STEP = 0.01;                // how much one press of Step raises p


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";     // "box", "torus", "custom" or "graph": the domain in use
let domain = null;          // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
let customDomain = null;    // the last custom domain drawn, if any
let edges = null;           // every edge once (edgesOf in percolation-clusters.js)
let entryEdge = null;       // entryEdge[e] = the edge of neighbor entry e (domain.nbr[e])
let U = null;               // one random number per cell (site) or edge (bond)
let swept = null;           // the clusters for every p (sweep in percolation-clusters.js)
let p = DEFAULTS.p;         // the p on the slider
let result = null;          // the clusters at p (percolate in percolation-clusters.js)
let selected = -1;          // a clicked cell: its cluster is highlighted (-1: none)

let playing = false;        // it starts paused; Play raises p
let speedIndex = DEFAULT_SPEED;
let lastFrame = 0;          // when Play last moved p (milliseconds)


/* =====================================================================
   3. COMPUTING THE CLUSTERS
   ===================================================================== */

// A new domain or a new seed: new random numbers, and the sweep over
// every p (for the charts).
function newNumbers() {
  const count = KIND === "site" ? domain.n : edges.count;
  U = uniformNumbers(count, byId("seed").value);
  swept = sweep(domain, KIND, U, edges);
  computeClusters();
}

// The clusters at the current p. If p went down far enough that the
// clicked site closed, nothing stays highlighted.
function computeClusters() {
  result = percolate(domain, KIND, p, U, edges);
  if (selected !== -1 && result.root[selected] === -1) selected = -1;
  drawSoon();
}

// For each entry of the neighbor lists of domain d (d.nbr), the number
// of its edge in "edges", to look up whether an edge is open when
// drawing.
function makeEntryEdges(d, edges) {
  const lookup = new Int32Array(d.nbr.length);
  for (let e = 0; e < edges.count; e++) {
    const a = edges.a[e], b = edges.b[e];
    for (let k = d.first[a]; k < d.first[a + 1]; k++) if (d.nbr[k] === b) lookup[k] = e;
    for (let k = d.first[b]; k < d.first[b + 1]; k++) if (d.nbr[k] === a) lookup[k] = e;
  }
  return lookup;
}

// Is cell v in a cluster worth coloring? For site: v is open. For
// bond: v has an open edge (a cell on its own stays white).
function inCluster(v) {
  if (result.root[v] === -1) return false;
  return KIND === "site" || result.name[result.root[v]] !== -1;
}


/* =====================================================================
   4. COLORS
   ---------------------------------------------------------------------
   Each cluster is colored by its name (see percolation-clusters.js),
   so it keeps its color as p grows. In site percolation, when clusters
   merge, the new cluster takes the color of the biggest one. The hue
   of name k steps around the color wheel by the golden ratio, which
   keeps neighboring names far apart in color. Colors are remembered
   once worked out.
   ===================================================================== */
const nameColors = new Map();
function colorOfName(k) {
  if (!nameColors.has(k)) {
    const hue = (k * 0.6180339887) % 1 * 360;
    const saturation = 0.45 + 0.35 * ((k * 0.7548776662) % 1);
    nameColors.set(k, hexToRGB(hsvToHex(hue, saturation, 0.92)));
  }
  return nameColors.get(k);
}

// How the cluster with root r is colored (r = -1: a closed cell), as
// [red, green, blue], with the Colors menu.
const closedRGB = hexToRGB(CLOSED), openRGB = hexToRGB(OPEN), othersRGB = hexToRGB(OTHERS);
const accentRGB = hexToRGB(CHART_LINE), outsideRGB = hexToRGB(OUTSIDE);
function rgbOfRoot(r) {
  if (r === -1 || (KIND === "bond" && result.name[r] === -1)) return closedRGB;
  const mode = byId("colors").value;
  let rgb = mode === "open" ? openRGB
    : mode === "largest" ? (r === result.largestRoot ? accentRGB : othersRGB)
    : colorOfName(result.name[r]);
  // A clicked cluster stands out: every other cluster fades.
  if (selected !== -1 && r !== result.root[selected]) rgb = rgb.map(function (t) { return 255 - (255 - t) * 0.25; });
  return rgb;
}


/* =====================================================================
   5. DRAWING
   ---------------------------------------------------------------------
   Site percolation: one square per cell, in its cluster's color
   (closed cells white), with a dark line between different clusters
   when the cells are big enough to see.

   Bond percolation, when the cells are big enough: a dot per cell and
   a line for every open edge, in its cluster's color. Zoomed far out,
   where lines would be a blur, each cell is a square in its cluster's
   color instead (cells with no open edge white).

   The "view" (js/sim-view.js) says where the picture goes and which
   squares show; it also moves and zooms it (section 6).

   On a hyperbolic tiling or tree, the picture is the disk, the
   half-plane or (a tree) spread out in rings. Site percolation draws
   each cell in its cluster's color (drawBall, js/sim-hyperbolic.js).
   Bond percolation draws the graph itself, as on the square grid: a
   line for every open edge in its cluster's color, thin gray lines for
   the closed ones, and no cells (drawBallBonds, js/sim-hyperbolic.js).
   A ring marks the start cell.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh).
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });

const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, showDomainChoice);

function drawPicture() {
  if (!domain || !result || simCanvas.hidden) return;
  if (domainKind === "graph") { drawOnBall(); return; }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  if (KIND === "bond" && view.size * view.zoom >= SMALLEST_EDGE_CELL) {
    drawEdges(pen);
  } else {
    // paintCells is in js/sim-view.js. Each square's group is its
    // cluster's root (-1 for white), so borders go between clusters.
    const shown = paintCells(view, pen, domain,
      function (v) { return inCluster(v) ? result.root[v] : -1; }, rgbOfRoot, outsideRGB);
    if (KIND === "site" && view.cell >= SMALLEST_BORDERED_CELL) drawBorders(view, pen, shown, BORDER);
  }
  pen.restore();
}

// Bond percolation, big cells: the dots and the open edges. Each square
// looks at the squares to its right and above (and, with 8 neighbors,
// diagonally), and if their cells share an open edge, a line joins the
// two middles. Lines of one color are collected into one path and
// drawn at once (much faster than one at a time).
function drawEdges(pen) {
  const cells = cellsShown(view, domain);
  const cols = view.cols, rows = view.rows, size = view.cell;
  pen.fillStyle = CLOSED;
  pen.fillRect(view.left, 0, view.width, view.height);
  const paths = new Map();          // color -> the lines (and dots) in that color
  function pathFor(rgb) {
    const key = rgbToHex(rgb);
    if (!paths.has(key)) paths.set(key, { lines: new Path2D(), dots: new Path2D() });
    return paths.get(key);
  }
  const looks = [[1, 0], [0, -1], [1, -1], [1, 1]];   // right, up, up-right, down-right (rows go down)
  const middleX = function (i) { return squareLeft(view, view.firstI + i) + size / 2; };
  const middleY = function (k) { return squareTop(view, view.firstK + k) + size / 2; };
  const dot = Math.max(1.2, size * 0.13);
  const loose = new Path2D();       // the dots of cells with no open edge

  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      const v = cells[k * cols + i];
      if (v === -1) {               // not in the domain
        pen.fillStyle = OUTSIDE;
        pen.fillRect(squareLeft(view, view.firstI + i), squareTop(view, view.firstK + k), size + 1, size + 1);
        continue;
      }
      const x = middleX(i), y = middleY(k);
      if (!inCluster(v)) { loose.moveTo(x + dot * 0.6, y); loose.arc(x, y, dot * 0.6, 0, 2 * Math.PI); continue; }
      const path = pathFor(rgbOfRoot(result.root[v]));
      path.dots.moveTo(x + dot, y);
      path.dots.arc(x, y, dot, 0, 2 * Math.PI);
      for (const [di, dk] of looks) {
        if (i + di >= cols || k + dk < 0 || k + dk >= rows) continue;
        const w = cells[(k + dk) * cols + i + di];
        if (w === -1) continue;
        for (let e = domain.first[v]; e < domain.first[v + 1]; e++) {
          if (domain.nbr[e] === w && U[entryEdge[e]] < p) {
            path.lines.moveTo(x, y);
            path.lines.lineTo(middleX(i + di), middleY(k + dk));
          }
        }
      }
    }
  }
  pen.fillStyle = OTHERS;
  pen.fill(loose);
  pen.lineWidth = Math.max(1.5, size * 0.22);
  pen.lineCap = "round";
  for (const [color, path] of paths) {
    pen.strokeStyle = color;
    pen.stroke(path.lines);
    pen.fillStyle = color;
    pen.fill(path.dots);
  }
}

// Hyperbolic plane or tree: the cells in their clusters' colors (site),
// or the open edges in their clusters' colors (bond), and a ring around
// the start.
function drawOnBall() {
  let pen;
  if (KIND === "site") {
    pen = drawBall(disk, domain, function (v) {
      return rgbToHex(rgbOfRoot(inCluster(v) ? result.root[v] : -1));
    });
  } else {
    const height = pictureHeight(BALL_HEIGHT);
    if (disk.picture === "spread") {
      pen = drawSpreadTree(disk, height, domain.n, function (v) { return domain.depth[v]; },
        function (v) { return domain.angle[v]; }, function () { return null; });
    } else {
      pen = diskPen(disk, height);
      drawDiskFrame(disk, pen, height, CLOSED, UNDER_COLOR);
    }
    drawBallBonds(disk, pen, domain, function (e) { return U[entryEdge[e]] < p; },
      function (v) { return inCluster(v) ? rgbToHex(rgbOfRoot(result.root[v])) : null; }, OTHERS);
  }
  const start = ballSpot(disk, domain, 0);
  if (start !== null) {
    pen.beginPath();
    pen.arc(start.x, start.y, Math.max(4, Math.min(12, 0.5 * start.size)), 0, 2 * Math.PI);
    pen.strokeStyle = BORDER;
    pen.lineWidth = 2;
    pen.stroke();
  }
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. MOVING, ZOOMING AND CLICKING A CLUSTER
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-controls.js). A press that hardly
   moves is a click instead: clicking a cell in a cluster highlights
   that cluster (the others fade), and it stays highlighted as p changes
   and it grows. Clicking it again, or a white cell, clears it.
   On a hyperbolic tiling or tree, one pointer drags across the plane
   instead, and two fingers slide and zoom the picture; a click works
   the same.
   ===================================================================== */
connectPicture(view, disk, function () { return domainKind === "graph"; }, function (event) {
  clickCell(domainKind === "graph" ? ballCellUnder(disk, domain, event)
                                   : cellUnder(view, domain, pointerSpot(view, event)));
}, "pointer");

function clickCell(v) {
  const sameCluster = selected !== -1 && v !== -1 && result.root[v] !== -1 && result.root[v] === result.root[selected];
  selected = (v === -1 || !inCluster(v) || sameCluster) ? -1 : v;
  drawSoon();
}


/* =====================================================================
   7. STATISTICS
   ===================================================================== */
function showStats() {
  if (!result) return;
  const n = domain.n;
  const largest = result.largestRoot === -1 ? 0 : result.size[result.largestRoot];
  const total = KIND === "site" ? n : edges.count;
  const onGraph = domainKind === "graph";

  byId("stat-cells").textContent = n.toLocaleString();
  byId("stat-edges").textContent = edges.count.toLocaleString();
  byId("stat-p").textContent = p.toFixed(3);
  byId("stat-open").textContent = result.openCount.toLocaleString() + " of " + total.toLocaleString() +
    " (" + (100 * result.openCount / Math.max(total, 1)).toFixed(1) + "%)";
  byId("stat-clusters").textContent = result.clusters.toLocaleString();
  byId("stat-largest").textContent = largest.toLocaleString() + " cells (" + (100 * largest / n).toFixed(1) + "% of all cells)";
  // (On a ball, "crosses" means the start's cluster reaches the edge:
  // see ballForPercolation in percolation-clusters.js.)
  byId("stat-cross-name").textContent = onGraph ? "The start's cluster reaches the edge of the ball"
    : domain.wrap ? "Some cluster wraps around the torus" : "Some cluster crosses from the left side to the right";
  byId("stat-cross").textContent = result.crossed ? "yes" : "no";
  byId("stat-cross-at").textContent = swept.crossAt === null ? "never" : "p = " + swept.crossAt.toFixed(4);
  byId("stat-cross-at-name").textContent = onGraph ? "First reaches the edge at"
    : domain.wrap ? "First wraps around at" : "First crosses at";
  byId("stat-selected").textContent = selected === -1 ? "none (click a cluster)"
    : result.size[result.root[selected]].toLocaleString() + " cells";

  drawCurve(byId("largest-chart"), function (k) { return largestAt(k) / n; }, "largest cluster / cells");
  drawCurve(byId("clusters-chart"), function (k) { return clustersAt(k) / n; }, "clusters / cells");
  drawSizesChart();
}

// The largest cluster and the number of clusters once k elements are
// open (from the sweep; k = 0 means nothing open yet).
function largestAt(k) { return k === 0 ? (KIND === "site" ? 0 : 1) : swept.largest[k - 1]; }
function clustersAt(k) { return k === 0 ? (KIND === "site" ? 0 : domain.n) : swept.clusters[k - 1]; }

// A curve over p from 0 to 1, for this sample: "valueAt(k)" is the
// value once k elements are open. A dot marks the current p, and a
// dashed line the critical point p_c, when it is known.
function drawCurve(canvas, valueAt, label) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const left = 44, up = 14, bottom = h - 16, POINTS = 400;
  const values = [];
  for (let j = 0; j <= POINTS; j++) values.push(valueAt(openAt(swept, j / POINTS)));
  const top = Math.max(1e-9, ...values);
  const sx = function (t) { return left + (w - left - 6) * t; };
  const sy = function (value) { return bottom - (bottom - up) * value / top; };

  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(shortLabel(top), left - 5, up);
  pen.fillText("0", left - 5, bottom);
  pen.textBaseline = "top";
  pen.textAlign = "left";
  pen.fillText("p = 0", left, bottom + 3);
  pen.textAlign = "right";
  pen.fillText("1", w - 6, bottom + 3);
  pen.textAlign = "left";
  pen.fillText(label, left + 4, 0);

  const pc = criticalPoint();
  if (pc !== null) {
    pen.setLineDash([3, 3]);
    pen.strokeStyle = CHART_TEXT;
    pen.lineWidth = 1;
    pen.beginPath(); pen.moveTo(sx(pc), up); pen.lineTo(sx(pc), bottom); pen.stroke();
    pen.setLineDash([]);
    pen.textAlign = "center";
    pen.fillText("p_c", sx(pc), bottom + 3);
  }
  pen.beginPath();
  values.forEach(function (value, j) {
    if (j === 0) pen.moveTo(sx(0), sy(value)); else pen.lineTo(sx(j / POINTS), sy(value));
  });
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
  pen.beginPath();
  pen.arc(sx(p), sy(valueAt(openAt(swept, p))), 4, 0, 2 * Math.PI);
  pen.fillStyle = CHART_LINE;
  pen.fill();
}

// How many clusters there are of each size at the current p, grouped
// by powers of 2: 1, 2-3, 4-7, 8-15, ... (each bar labeled by the
// smallest size in it; powerOfTwoBars, js/sim-charts.js). Bond clusters
// of one cell (no open edge) are left out.
function drawSizesChart() {
  const sizes = [];
  for (let v = 0; v < domain.n; v++) {
    if (result.root[v] === v && inCluster(v)) sizes.push(result.size[v]);
  }
  powerOfTwoBars(byId("sizes-chart"), powerOfTwoBins(sizes), " clusters", function (b) { return shortLabel(2 ** b); });
}

// The critical point for the domain in use: for a box or torus, where
// the cells sit on the square grid with 4 or 8 neighbors, and for a
// tree of degree d, where it is 1/(d - 1) for both site and bond
// percolation (see "All the details"). No exact value is known for the
// hyperbolic tilings.
function criticalPoint() {
  if (domainKind === "custom") return null;
  if (domainKind === "graph") return isTree(disk.spec) ? 1 / (disk.spec.p - 1) : null;
  return CRITICAL[byId("set-neighbors").value];
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page): makeCustomTool, in
   js/sim-controls.js. Any drawing works, even one in several pieces.
   Done uses it.
   ===================================================================== */
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return playing; },
  setPlaying: setPlaying,
  check: function (drawing) {
    const cells = drawing.graph.vertices.length;
    return cells < 2 ? ["Paint at least two cells.", ""] : ["", cells + " cells."];
  },
  done: function (drawing) {
    customDomain = drawnDomain(drawing.graph, drawing.grid);
    useDomain("custom", customDomain);
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
});


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain: its edges, new random numbers, the sweep.
function useDomain(kind, d) {
  domainKind = kind;
  domain = d;
  edges = edgesOf(d);
  entryEdge = makeEntryEdges(d, edges);
  selected = -1;
  useTorus(view, Boolean(d.wrap));   // moving and zooming (js/sim-view.js)
  showDomainChoice();
  newNumbers();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  if (tool.isOpen) tool.close();
  const d = boxFromOptions(2, MAX_SIDE, DEFAULTS);
  useDomain(d.wrap ? "torus" : "box", d);
}

// A ball of a hyperbolic tiling or a tree, from the options on the page
// (ballFromOptions, js/sim-hyperbolic.js), with the start cell in the
// middle of the picture.
function useGraph() {
  if (tool.isOpen) tool.close();
  const ball = ballFromOptions(disk, BALL);
  if (ball === null) { showDomainChoice(); return; }
  useDomain("graph", ballForPercolation(ball));
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
  const onGraph = (domainKind === "graph");
  const pc = criticalPoint();
  byId("critical-row").hidden = (pc === null);
  if (pc !== null) {
    byId("critical-value").textContent = onGraph ? "= 1/" + (disk.spec.p - 1)
      : pc === 0.5 ? "= 1/2" : "≈ " + pc.toFixed(4);
    byId("critical-where").textContent = onGraph ? "tree" : "grid";
  }
}

// A new p, from the slider, the box, Play or Step.
function setP(value) {
  p = Math.min(Math.max(Number(value) || 0, 0), 1);
  byId("p-slider").value = p;
  byId("p-box").value = Number(p.toFixed(4));
  computeClusters();
}

// Play raises p a little at every screen refresh, at the chosen speed,
// until p = 1. (Play at p = 1 starts again from p = 0.)
function setPlaying(on) {
  playing = on;
  showPlaying(on);
  if (on) {
    if (p >= 1) setP(0);
    lastFrame = performance.now();
    requestAnimationFrame(playFrame);
  }
}
function playFrame(now) {
  if (!playing) return;
  const next = p + SPEEDS[speedIndex] * (now - lastFrame) / 1000;
  lastFrame = now;
  setP(next);
  if (p >= 1) setPlaying(false);
  else requestAnimationFrame(playFrame);
}

// Domain: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

// p: the slider and the box move together, and the picture follows
// live while you drag, like a Desmos slider.
byId("p-slider").addEventListener("input", function () { setP(this.value); });
byId("p-box").addEventListener("change", function () { setP(this.value); });
byId("p-critical").addEventListener("click", function () { setP(criticalPoint()); });

// Play / Pause, Step, p back to 0.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  setP(Math.round((p + STEP) * 1000) / 1000);
});
byId("p-zero").addEventListener("click", function () {
  if (playing) setPlaying(false);
  setP(0);
});

// Speed.
function showSpeed() {
  byId("speed-label").textContent = "p rises " + SPEEDS[speedIndex] + " per second";
}
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
});

// Colors.
byId("colors").addEventListener("change", drawSoon);

// Seed: the same seed gives the same numbers U every time.
connectSeed(function () { selected = -1; newNumbers(); });


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
byId("p-slider").value = byId("p-box").value = p;
useBox();
setPlaying(false);   // paused: press Play to raise p
