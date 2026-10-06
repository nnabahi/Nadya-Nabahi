/* =====================================================================
   percolation.js  —  the page of the two percolation sims
   ---------------------------------------------------------------------
   One script for both pages: site-percolation.html and
   bond-percolation.html. Each page says which it is in its <body> tag
   (data-kind="site" or data-kind="bond"), and this script reads that.

   What it does, in plain words:
     - Builds the domain: a box or torus of cells, or a region drawn in
       the graph tool (shown inside this page). The domain code is
       shared with the other sims, in js/sim-domains.js.
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
const CLICK_DISTANCE = 5;         // a press that moves less than this (in pixels) is a click

// The critical point p_c on the square grid, where an infinite cluster
// first appears (see "All the details" for where these come from).
// null where no exact or well-established value is known.
const CRITICAL = KIND === "site" ? { 4: 0.592746, 8: 1 - 0.592746 } : { 4: 0.5, 8: null };

// Play raises p by this much per second (the Speed slider).
const SPEEDS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
const DEFAULT_SPEED = SPEEDS.indexOf(0.005);
const STEP = 0.01;                // how much one press of Step raises p


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";     // "box", "torus" or "custom": the domain in use
let domain = null;          // the domain graph (js/sim-domains.js)
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

// The clusters at the current p.
function computeClusters() {
  result = percolate(domain, KIND, p, U, edges);
  drawSoon();
}

// For each entry of the neighbor lists (domain.nbr), the number of its
// edge in "edges", to look up whether an edge is open when drawing.
function makeEntryEdges(d) {
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
   Each cluster is colored by its name (its oldest element, see
   percolation-clusters.js), so it keeps its color as p grows. The hue
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

// How cell v is colored, as [red, green, blue], with the Colors menu.
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
   ===================================================================== */
const simCanvas = byId("sim-canvas");
const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);
let drawPending = false;

// Draw at the browser's next screen refresh (at most once per refresh).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawPicture();
    showStats();
  });
}

function drawPicture() {
  if (!domain || !result || simCanvas.hidden) return;
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  if (KIND === "bond" && view.size * view.zoom >= SMALLEST_EDGE_CELL) {
    drawEdges(pen);
  } else {
    // paintCells is in js/cell-picture.js. Each square's group is its
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

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. MOVING, ZOOMING AND CLICKING A CLUSTER
   ---------------------------------------------------------------------
   js/sim-view.js moves and zooms the picture (drag, mouse wheel or
   pinch, and the + / − / Reset buttons). A press that hardly moves is a
   click instead: clicking a cell in a cluster highlights that cluster
   (the others fade), and it stays highlighted as p changes and it
   grows. Clicking it again, or a white cell, clears it.
   ===================================================================== */
const pressed = new Set();    // the pointers pressed on the picture
let pressedAt = null;         // where the first one went down
let dragged = false;          // moved too far (or two fingers): not a click

simCanvas.style.touchAction = "none";   // on phones, a finger drags the picture, not the page

simCanvas.addEventListener("pointerdown", function (event) {
  if (pressed.size === 0) { pressedAt = { x: event.clientX, y: event.clientY }; dragged = false; }
  pressed.add(event.pointerId);
  if (pressed.size > 1) dragged = true;
  pressPointer(view, event);
});
simCanvas.addEventListener("pointermove", function (event) {
  simCanvas.style.cursor = pressed.size > 0 ? "grabbing" : "pointer";
  if (!pressed.has(event.pointerId)) return;
  if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >= CLICK_DISTANCE) dragged = true;
  movePointer(view, event);
});
function stopPointer(event, isClick) {
  if (!pressed.delete(event.pointerId)) return;
  releasePointer(view, event);
  if (isClick && pressed.size === 0 && !dragged) clickCell(cellUnder(view, domain, pointerSpot(view, event)));
}
simCanvas.addEventListener("pointerup", function (event) { stopPointer(event, true); });
simCanvas.addEventListener("pointercancel", function (event) { stopPointer(event, false); });

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
  const word = domain.wrap ? "wraps around" : "crosses";

  byId("stat-cells").textContent = n.toLocaleString();
  byId("stat-edges").textContent = edges.count.toLocaleString();
  byId("stat-p").textContent = p.toFixed(3);
  byId("stat-open").textContent = result.openCount.toLocaleString() + " of " + total.toLocaleString() +
    " (" + (100 * result.openCount / Math.max(total, 1)).toFixed(1) + "%)";
  byId("stat-clusters").textContent = result.clusters.toLocaleString();
  byId("stat-largest").textContent = largest.toLocaleString() + " cells (" + (100 * largest / n).toFixed(1) + "% of all cells)";
  byId("stat-cross-name").textContent = domain.wrap
    ? "Some cluster wraps around the torus" : "Some cluster crosses from the left side to the right";
  byId("stat-cross").textContent = result.crossed ? "yes" : "no";
  byId("stat-cross-at").textContent = swept.crossAt === null ? "never" : "p = " + swept.crossAt.toFixed(4);
  byId("stat-cross-at-name").textContent = "First " + word + " at";
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

// How many clusters there are of each size at the current p. Sizes go
// from 1 cell to thousands, so they are grouped by powers of 2: 1, 2-3,
// 4-7, 8-15, ... (each bar labeled by the smallest size in it). Bond
// clusters of one cell (no open edge) are left out.
function drawSizesChart() {
  const canvas = byId("sizes-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const bins = [];
  for (let v = 0; v < domain.n; v++) {
    if (result.root[v] !== v || !inCluster(v)) continue;
    const b = Math.floor(Math.log2(result.size[v]));
    while (bins.length <= b) bins.push(0);
    bins[b]++;
  }
  if (bins.length === 0) return;
  const most = Math.max(...bins);
  const top = 14, bottom = h - 14, barWidth = w / bins.length;
  pen.textBaseline = "top";
  pen.fillText("most: " + most.toLocaleString() + " clusters", 0, 0);
  pen.textAlign = "center";
  bins.forEach(function (count, b) {
    const barHeight = count === 0 ? 0 : Math.max(1, (bottom - top) * count / most);
    pen.fillStyle = CHART_LINE;
    pen.fillRect(b * barWidth + 1, bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
    pen.fillStyle = CHART_TEXT;
    pen.fillText(shortLabel(2 ** b), (b + 0.5) * barWidth, bottom + 2);
  });
}

// The critical point for the domain in use: only for a box or torus,
// where the cells sit on the square grid with 4 or 8 neighbors.
function criticalPoint() {
  if (domainKind === "custom") return null;
  return CRITICAL[byId("set-neighbors").value];
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page) as graph-tool.html?embed. Any
   drawing works, even one in several pieces. Done uses it.
   ===================================================================== */
const frame = byId("tool-frame");
let toolOpen = false;
let toolMessage = null;    // the tool's latest drawing: { graph, grid, palette }

function openTool() {
  if (playing) setPlaying(false);
  toolOpen = true;
  simCanvas.hidden = true;
  showZoomButtons(view);
  byId("custom-area").hidden = false;
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  checkTool();
}

function closeTool() {
  toolOpen = false;
  byId("custom-area").hidden = true;
  simCanvas.hidden = false;
  showZoomButtons(view);
}

listenToTool(frame, function (drawing) { toolMessage = drawing; checkTool(); });

function checkTool() {
  if (!toolOpen) return;
  let problem = "", good = "";
  if (!toolMessage) problem = "Loading the drawing tool...";
  else if (toolMessage.graph.vertices.length < 2) problem = "Paint at least two cells.";
  else good = toolMessage.graph.vertices.length + " cells.";
  showToolStatus(problem, good);
}

byId("tool-done").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  closeTool();
  useDomain("custom", customDomain);
});

byId("tool-cancel").addEventListener("click", function () {
  closeTool();
  showDomainChoice();
  drawSoon();
});


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain: its edges, new random numbers, the sweep.
function useDomain(kind, d) {
  domainKind = kind;
  domain = d;
  edges = edgesOf(d);
  entryEdge = makeEntryEdges(d);
  selected = -1;
  useTorus(view, Boolean(d.wrap));   // moving and zooming (js/sim-view.js)
  showDomainChoice();
  newNumbers();
}

// The box or torus from the boxes on the page.
function useBox() {
  if (toolOpen) closeTool();
  const width = readWhole("set-width", 2, MAX_SIDE, DEFAULTS.width);
  const height = readWhole("set-height", 2, MAX_SIDE, DEFAULTS.height);
  const neighbors = Number(byId("set-neighbors").value);
  const torus = (checked("domain") === "torus");
  useDomain(torus ? "torus" : "box", boxDomain(width, height, neighbors, torus));
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  document.querySelector('input[name="domain"][value="' + domainKind + '"]').checked = true;
  const custom = (domainKind === "custom");
  byId("size-row").hidden = byId("neighbors-row").hidden = custom;
  byId("custom-row").hidden = !custom;
  if (custom && customDomain) {
    byId("custom-info").textContent = "Your region: " + customDomain.n + " cells" +
      (customDomain.wrap ? ", on a torus." : ".");
  }
  const pc = criticalPoint();
  byId("critical-row").hidden = (pc === null);
  if (pc !== null) byId("critical-value").textContent = pc === 0.5 ? "1/2" : "≈ " + pc.toFixed(4);
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
  byId("play").textContent = on ? "Pause" : "Play";
  byId("play").classList.toggle("selected", on);
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

// Domain: Box / Torus / Custom.
for (const radio of document.querySelectorAll('input[name="domain"]')) {
  radio.addEventListener("change", function () {
    if (radio.value === "custom") openTool();
    else useBox();
  });
}
for (const id of ["set-width", "set-height", "set-neighbors"]) byId(id).addEventListener("change", useBox);
byId("edit-custom").addEventListener("click", openTool);

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
byId("seed").addEventListener("change", function () { selected = -1; newNumbers(); });
byId("new-seed").addEventListener("click", function () {
  byId("seed").value = String(Math.floor(Math.random() * 100000));
  selected = -1;
  newNumbers();
});


// --- Start ------------------------------------------------------------
byId("set-width").value = DEFAULTS.width;
byId("set-height").value = DEFAULTS.height;
byId("set-width").max = byId("set-height").max = MAX_SIDE;
byId("set-neighbors").value = String(DEFAULTS.neighbors);
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
byId("p-slider").value = byId("p-box").value = p;
useBox();
setPlaying(false);   // paused: press Play to raise p
