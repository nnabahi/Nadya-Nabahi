/* =====================================================================
   sandpiles.js  —  the page of the "Sandpiles" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the table: a box or torus of cells (on the square grid,
       or on any tiling by regular polygons, its tiles or its corners
       being the cells), a custom one drawn in the graph tool (shown
       inside this page), or a ball of a hyperbolic tiling or a tree.
       The domain code is shared with the other sims: the domains in
       js/sim-domains.js, the tilings in js/sim-tilings.js, their
       options and the graph tool in js/sim-controls.js, and the
       hyperbolic tilings and trees, and their pictures, in
       js/sim-graphs.js and js/sim-hyperbolic.js.
     - Hands the table, the start and the settings to the pile
       (pileWorker in sandpiles-pile.js), which runs in a second thread
       (a "Web Worker"), and draws every pile it sends back, with the
       statistics.
     - Clicking a cell adds a grain, removes one, topples it, makes it a
       sink cell (or a normal cell again), or shows its numbers.
     - Shows the pile from above, or in 3D (js/sim-3d.js).
   Small helpers used by every sim page (byId, showMessage, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, and moving and
   zooming the picture in js/sim-view.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Colors
     4. Running the pile
     5. Drawing the pile
     5b. The 3D view
     6. Clicking, dragging and zooming
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default: nadya's Python, a center pile of 64 grains on a 25 x 25 box.
const DEFAULTS = {
  width: 25, height: 25, neighbors: 4, seed: "1",
  start: "center", grains: 64, most: 3, full: 4, value: 0, slope: 1,
};

const MAX_SIDE = 300;             // the biggest box or torus is 300 x 300
const MIN_TORUS = 3;              // a torus at least 3 x 3, so every cell has 4 (or 8) different neighbors
const MAX_GRAINS = 1000000;       // the most grains in the center pile
const GRAINS_SLIDER_MAX = 5000;   // the slider's starting max (its max box and the n box can go higher)
const MAX_HEIGHT_SETTING = 50;    // "Random: up to" and "Full: height" go up to this
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not on the table)
const SINK = "#555555";           // the sink cell
const THIN_LINES = "rgba(0, 0, 0, 0.15)";   // the lines between big cells
const NUMBER_MIN_CELL = 16;       // cells at least this big (in pixels) show their number
const PAD = 2;                    // room above and below the picture
const HEIGHT_BARS = 8;            // "Cells of each height": bars 0 to 7, then "8+"

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 5, most: 20, cells: 20000 };

// The speeds on the Speed slider, in topples (or rounds) per second.
// Infinity means "as fast as the computer can". The default is slow, so
// you can watch every topple.
const SPEEDS = [1, 100, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;

// The storm's rates, in grains per second.
const STORM_RATES = [1, 100, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_STORM_RATE = 2;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";         // "box", "torus", "custom" or "graph": the table in use
let domain = null;              // the table's graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
let threshold = null;           // threshold[v]: the grains that make cell v topple, its number of
                                // neighbors in the whole lattice (4 or 8 on the square grid, p on a
                                // tiling {p,q} or a tree; on another tiling, see tilingThresholds
                                // in sandpiles-pile.js)
let sameThreshold = 4;          // every cell's threshold, when they are all the same (else null)
let mostThreshold = 4;          // the biggest threshold
let sinks = [];                 // the sink cells, made by clicking (none at the start)
let customDomain = null;        // the last custom domain drawn, if any
let customNeighbors = 4;        // the graph tool's neighbors for it

// Hyperbolic plane or tree: how many steps each cell of the ball is
// from the start. (Which graph it is, how it is drawn and how far the
// plane has been moved are in "disk", section 5.)
let ballSteps = null;

let playing = false;            // it starts paused; Play sets it going
let speed = DEFAULT_SPEED;
let stormRate = DEFAULT_STORM_RATE;
let run = 0;                    // counts restarts, so leftovers from an older run are ignored
let playId = 0;                 // counts presses of Play and Pause (see section 4)
let show3D = false;             // the 3D view instead of the view from above (section 5b)

// The latest message from the pile: the heights, the topples at every
// cell, and the numbers (see report() in sandpiles-pile.js).
let latest = null;


/* =====================================================================
   3. COLORS
   ---------------------------------------------------------------------
   Three ways to color the heights:
     "White to red, then viridis" (the default, nadya's pick): heights
                             0 up to the cell's threshold (4 on the
                             square grid) go white, yellow, orange, light
                             red, dark red (colors from ColorBrewer's "YlOrRd",
                             Brewer, colorbrewer2.org). Taller cells, which
                             are about to topple, go from green to dark
                             purple at the tallest cell: the "viridis"
                             colors (van der Walt and Smith, matplotlib,
                             2015) with their yellow end cut off, so they
                             never look like the low heights.
   and nadya's own colors, from her Sandpiles.js:
     "One color per height"  height 0 gets the first color, 1 the
                             second, and so on; 9 or more grains get
                             the last one (black).
     "Orange to red"         her MultiLevelColorMap with keys 1 and the
                             threshold: 0 is white, heights from 1 up to
                             the threshold go from orange to red (mixed
                             in hue, saturation and brightness, "HSV"),
                             and unstable cells are red.
   "Topples so far" colors each cell by how often it has toppled, from
   white (never) to dark blue (the most of any cell).
   On a tiling with cells of different kinds, each cell is colored by
   its own threshold, so dark red always means "about to topple": a
   triangle (3 grains) and a 12-gon (12 grains) with 3 grains look
   different. Only "One color per height" is the same for every cell.
   ===================================================================== */
const HEIGHT_COLORS = ["#ffffff", "#fcaf14", "#cc2020", "#02b51c", "#3305b0",
                       "#e012ad", "#12e0dd", "#eff216", "#b34c04", "#000000"];
const TOPPLES_DARKEST = [30, 60, 140];   // dark blue
const LOW_COLORS = ["#ffffff", "#fed976", "#fd8d3c", "#e31a1c", "#800026"];   // white, yellow, orange, light red, dark red
const TALL_COLORS = ["#440154", "#482475", "#414487", "#355f8d",            // viridis at 0, 0.1, ..., 0.7: dark
                     "#2a788e", "#21918c", "#22a884", "#44bf70"];           // purple to green (no yellow)

const LOW_RGB = LOW_COLORS.map(hexToRGB), TALL_RGB = TALL_COLORS.map(hexToRGB);   // as [r, g, b]

// The color a fraction t (0 to 1) of the way along a list of [r, g, b]
// colors, mixed in red, green and blue between the two nearest.
function alongColors(list, t) {
  const at = t * (list.length - 1), k = Math.min(Math.floor(at), list.length - 2), f = at - k;
  const a = list[k], b = list[k + 1];
  return [0, 1, 2].map(function (i) { return Math.round(a[i] + f * (b[i] - a[i])); });
}

// heightList(top)[h] is the color of height h on a cell that topples at
// "top" grains, as [r, g, b], for h from 0 up to top or 9, whichever is
// more (the ten colors of "One color per height"); taller cells get the
// last one (but see colorOfHeight). For "Orange to red" the colors are
// mixed in hue, saturation and brightness with hexToHSV and hsvToHex,
// and turned into [r, g, b] with hexToRGB (all three in
// js/sim-colors.js). Each list is made the first time it is needed, and
// made again after the Colors menu changes.
const heightLists = new Map();   // top -> its list
let palette = "smooth";   // the Colors menu's choice
let tallest = 0;          // the tallest cell right now (set by drawPile), for the viridis colors
function makeHeightColors() {
  palette = byId("palette").value;
  heightLists.clear();
}
function heightList(top) {
  if (heightLists.has(top)) return heightLists.get(top);
  const list = [];
  for (let h = 0; h <= Math.max(top, HEIGHT_COLORS.length - 1); h++) {
    if (palette === "smooth") {
      list.push(alongColors(LOW_RGB, Math.min(h / top, 1)));
    } else if (palette === "list") {
      list.push(hexToRGB(HEIGHT_COLORS[Math.min(h, HEIGHT_COLORS.length - 1)]));
    } else if (h < 1) {
      list.push(hexToRGB(HEIGHT_COLORS[0]));
    } else if (h >= top) {
      list.push(hexToRGB(HEIGHT_COLORS[2]));
    } else {
      const a = hexToHSV(HEIGHT_COLORS[1]), b = hexToHSV(HEIGHT_COLORS[2]), t = (h - 1) / (top - 1);
      list.push(hexToRGB(hsvToHex(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]))));
    }
  }
  heightLists.set(top, list);
  return list;
}
// The color of height h on a cell that topples at "top" grains.
function colorOfHeight(h, top) {
  if (palette === "smooth" && h > top) {
    // Above the threshold: green just above it, dark purple at the tallest.
    const t = tallest > top + 1 ? (tallest - h) / (tallest - top - 1) : 1;
    return alongColors(TALL_RGB, Math.max(0, Math.min(1, t)));
  }
  const list = heightList(top);
  return list[Math.min(h, list.length - 1)];
}

// Topples: white for 0, then lighter to darker blue up to "most".
function colorOfTopples(k, most) {
  const t = most > 0 ? Math.sqrt(k / most) : 0;   // the square root shows small counts better
  return TOPPLES_DARKEST.map(function (c) { return 255 + t * (c - 255); });
}

// The color of a number written on a cell of color rgb: dark on light
// cells, white on dark ones.
function textColorOn(rgb) {
  return 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2] > 140 ? "#1e1e1e" : "#ffffff";
}


/* =====================================================================
   4. RUNNING THE PILE
   ---------------------------------------------------------------------
   The pile is the function pileWorker() in sandpiles-pile.js.
   startWorker (js/sim-page.js) runs it in a second thread, a "Web
   Worker", so the page never freezes, with the toppling rule copied in.
   ===================================================================== */
const worker = startWorker(pileWorker, [newPile, startHeights, middleCell, centerCell]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  latest = message;
  // It stopped by itself (the pile is stable). Only a report sent after
  // the page's last Play counts, not one that was already on its way.
  if (playing && !message.playing && message.playId === playId) setPlaying(false);
  drawSoon();
};

worker.onerror = function () {
  showMessage("The sandpile couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// The start, from the boxes on the page.
function startSettings() {
  return {
    kind: byId("start-kind").value,
    grains: readWhole("set-grains", 0, MAX_GRAINS, DEFAULTS.grains),
    most: readWhole("set-most", 0, MAX_HEIGHT_SETTING, DEFAULTS.most),
    height: readWhole("set-full", 0, MAX_HEIGHT_SETTING, DEFAULTS.full),
    value: readWhole("set-value", -1000, 1000, DEFAULTS.value),
    slope: readWhole("set-slope", -1000, 1000, DEFAULTS.slope),
  };
}

// Start again from the start, with the current table, sink cells,
// settings and seed. It pauses: press Play to watch it topple.
function restart() {
  run++;
  latest = null;
  if (playing) setPlaying(false);
  showMessage("");
  lastNote = "";
  worker.postMessage({
    type: "setup", run: run,
    domain: pileTable(domain), threshold: threshold, sinks: sinks,
    start: startSettings(), seed: byId("seed").value,
  });
}

// The table as the pile needs it: its cells and their neighbors, and
// where each cell is (for the "center" and "linear" starts). On a
// tiling, where each cell is is its middle (in side lengths), and only
// these go to the second thread, not the tiling itself.
function pileTable(d) {
  if (!d.lattice) return d;
  const table = { n: d.n, first: d.first, nbr: d.nbr, lattice: d.lattice, x: new Float64Array(d.n), y: new Float64Array(d.n),
                  xmin: Infinity, xmax: -Infinity, ymin: Infinity, ymax: -Infinity };
  for (let v = 0; v < d.n; v++) {
    const [u, w] = cellMiddle(d, v);
    table.x[v] = u; table.y[v] = w;
    table.xmin = Math.min(table.xmin, u); table.xmax = Math.max(table.xmax, u);
    table.ymin = Math.min(table.ymin, w); table.ymax = Math.max(table.ymax, w);
  }
  return table;
}

// Tell the pile the settings of the Run and Storm boxes.
function sendSettings() {
  worker.postMessage({
    type: "settings",
    rounds: checked("order") === "rounds",
    speed: speed,
    storm: byId("storm").checked,
    stormRate: stormRate,
    stormWait: byId("storm-wait").checked,
    stayOn: byId("stay-on").checked,
  });
}

function setPlaying(on) {
  playing = on;
  playId++;
  worker.postMessage({ type: on ? "play" : "pause", id: playId });
  showPlaying(on);
}


/* =====================================================================
   5. DRAWING THE PILE
   ---------------------------------------------------------------------
   Each cell is a square in the color of its height (or of its topples).
   The sink cell is dark gray with a white cross. On big cells the
   number of grains is written in the middle, like nadya's Python
   pictures.

   The picture is drawn screen square by screen square, as in the
   coloring sims: js/sim-view.js places the picture's box on the canvas
   and says which cell of the table is on each square that shows, as
   it is moved and zoomed (section 6). A torus (or a table drawn on
   one) wraps around, so the squares keep finding cells beyond the box:
   zoomed out, it shows several times side by side.

   paintCells (js/sim-view.js) puts the squares' colors into a small
   image, one pixel per square, and blows it up with smoothing off so
   the squares stay crisp.

   On any other tiling each cell is its own polygon (paintDomain,
   js/sim-view.js), and the numbers go on the cells whose biggest circle
   around the middle is big enough to write in.

   A ball of a hyperbolic tiling or a tree is drawn by
   js/sim-hyperbolic.js instead: in the disk or the half-plane (drag to
   move around the plane), or, for a tree, spread out in rings, with the
   rest of the tiling in thin gray (drawOnGraph below).
   ===================================================================== */
const simCanvas = byId("sim-canvas");            // the canvas on the page

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawPile(); showStats(); });

// Where the picture goes, and how far it is moved and zoomed
// (js/sim-view.js). Cells of 4 pixels or more get a whole number of
// pixels each, so every cell is exactly the same size.
const view = makeView(simCanvas, drawSoon, PAD, 4);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, showDomainChoice);

function drawPile() {
  if (!domain || !latest || tool.isOpen) return;
  const d = domain, heights = latest.heights, odometer = latest.odometer;
  const showTopples = checked("show") === "topples";
  let mostTopples = 0;
  if (showTopples) for (let v = 0; v < d.n; v++) mostTopples = Math.max(mostTopples, odometer[v]);
  tallest = 0;
  for (let v = 0; v < d.n; v++) tallest = Math.max(tallest, heights[v]);   // (sink cells hold none)
  // The number shown on cell v (its grains, or its topples), and its
  // color, as [r, g, b].
  const valueOf = function (v) { return showTopples ? odometer[v] : heights[v]; };
  const rgbOf = function (v) {
    return showTopples ? colorOfTopples(odometer[v], mostTopples) : colorOfHeight(heights[v], threshold[v]);
  };
  if (show3D) { draw3D(valueOf, showTopples); return; }
  if (domainKind === "graph") { drawOnGraph(valueOf, rgbOf); return; }

  // The picture's box: as big as fits the width (and at most
  // MAX_PICTURE_HEIGHT tall), in the middle of the canvas.
  const screen = fitPicture(view, d, MAX_PICTURE_HEIGHT);
  if (d.lattice) drawTilingPile(screen, valueOf, rgbOf);
  else drawSquarePile(screen, valueOf, rgbOf);
  screen.restore();
}

// Squares: view.cols x view.rows squares, each view.cell pixels big,
// each that shows in its cell's color; cellOf is the cell on each
// square, row by row from the top (negative: not on the table). Big
// cells also get thin lines between them, and their marks (markCell).
function drawSquarePile(screen, valueOf, rgbOf) {
  const sinkColor = hexToRGB(SINK);
  const cellOf = paintCells(view, screen, domain, function (v) { return v; },
    function (v) { return sinks.includes(v) ? sinkColor : rgbOf(v); }, hexToRGB(OUTSIDE));
  const cols = view.cols, rows = view.rows, size = view.cell;     // (paintCells works these out)
  if (size < NUMBER_MIN_CELL) return;

  screen.beginPath();
  for (let i = view.firstI; i <= view.lastI + 1; i++) {
    const x = squareLeft(view, i) + 0.5;
    screen.moveTo(x, 0); screen.lineTo(x, view.height);
  }
  for (let k = view.firstK; k <= view.lastK + 1; k++) {
    const y = squareTop(view, k) + 0.5;
    screen.moveTo(view.left, y); screen.lineTo(view.left + view.width, y);
  }
  screen.strokeStyle = THIN_LINES;
  screen.lineWidth = 1;
  screen.stroke();

  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      const v = cellOf[k * cols + i];
      if (v < 0) continue;
      const cx = (squareLeft(view, view.firstI + i) + squareLeft(view, view.firstI + i + 1)) / 2;
      const cy = (squareTop(view, view.firstK + k) + squareTop(view, view.firstK + k + 1)) / 2;
      markCell(screen, v, cx, cy, size, valueOf, rgbOf);
    }
  }
}

// Any other tiling: each cell a polygon in its color, with thin lines
// between the cells once a side is NUMBER_MIN_CELL pixels long. Then the
// marks of the cells big enough (their biggest circle around the middle
// at least NUMBER_MIN_CELL pixels across), in every copy of a torus that
// shows.
function drawTilingPile(screen, valueOf, rgbOf) {
  const sinkColor = hexToRGB(SINK);
  paintDomain(view, screen, domain, function (v) { return v; },
    function (v) { return sinks.includes(v) ? sinkColor : rgbOf(v); }, hexToRGB(OUTSIDE),
    THIN_LINES, NUMBER_MIN_CELL / 2);
  for (const { sx, sy } of screenCopies(view, domain)) {
    for (let v = 0; v < domain.n; v++) {
      const size = 2 * cellRadius(domain, v) * view.cell;
      if (size < NUMBER_MIN_CELL) continue;
      const [u, w] = cellMiddle(domain, v), x = sx(u), y = sy(w);
      if (nearScreen(view, x, y)) markCell(screen, v, x, y, size, valueOf, rgbOf);
    }
  }
}

// The mark on big cell v, centered at (x, y), "size" pixels across: a
// white cross on a sink cell, or else (with "Numbers on the cells") its
// number, like nadya's Python pictures.
function markCell(pen, v, x, y, size, valueOf, rgbOf) {
  if (sinks.includes(v)) {
    const r = size * 0.25;
    pen.beginPath();
    pen.moveTo(x - r, y - r); pen.lineTo(x + r, y + r);
    pen.moveTo(x + r, y - r); pen.lineTo(x - r, y + r);
    pen.strokeStyle = "#ffffff";
    pen.lineWidth = 2;
    pen.stroke();
  } else if (byId("show-numbers").checked) {
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.font = Math.round(size * 0.45) + "px sans-serif";
    pen.fillStyle = textColorOn(rgbOf(v));
    pen.fillText(String(valueOf(v)), x, y + 1);
  }
}

// Hyperbolic plane or tree: the ball's cells in their colors, with the
// rest of the tiling (or tree) in thin gray, and the numbers on cells
// big enough. (drawBall, js/sim-hyperbolic.js, draws the ball; the tree
// spread out is drawn here, so that white cells stay white, not gray.)
function drawOnGraph(valueOf, rgbOf) {
  const colorOf = function (v) { return sinks.includes(v) ? SINK : rgbToHex(rgbOf(v)); };
  const pen = disk.picture === "spread"
    ? drawSpreadTree(disk, pictureHeight(BALL_HEIGHT), domain.n,
        function (v) { return domain.depth[v]; }, function (v) { return domain.angle[v]; }, colorOf)
    : drawBall(disk, domain, colorOf);
  if (!byId("show-numbers").checked) return;

  // The numbers, on cells at least NUMBER_MIN_CELL pixels across.
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  for (let v = 0; v < domain.n; v++) {
    const spot = ballSpot(disk, domain, v);    // where cell v is on the screen, and about how big
    if (spot === null) continue;
    const x = spot.x, y = spot.y, size = 2 * spot.size;
    if (size < NUMBER_MIN_CELL || x < 0 || y < 0 || x > disk.box.width || y > disk.box.height || sinks.includes(v)) continue;
    pen.font = Math.round(Math.min(size * 0.45, 28)) + "px sans-serif";
    pen.fillStyle = textColorOn(rgbOf(v));
    pen.fillText(String(valueOf(v)), x, y + 1);
  }
}

// After the window changes size, or the picture opens or closes as a
// full screen popup (js/sim-page.js): draw again at the new size, in 3D too.
window.addEventListener("resize", function () {
  if (view3d) sim3d.setHeight(view3d, pictureHeight(BALL_HEIGHT));
  drawSoon();
});


/* =====================================================================
   5b. THE 3D VIEW
   ---------------------------------------------------------------------
   The View option "3D" stands a stack of blocks on each cell, one block
   per grain (or per topple, with "Topples so far"), colored from the
   bottom up with the same colors as the view from above. Sink cells
   are left out, so they show as holes in the floor. On a hyperbolic
   tiling or a tree, the disk is the floor, and each stack is a pile of
   coins as wide as its cell, as in the Eden Mountain. On any other
   tiling, each stack is a pile of coins as wide as the biggest circle
   around its cell's middle, with the tiling drawn on the floor. The 3D code is
   shared, in js/sim-3d.js; it loads the 3D library three.js from the
   internet the first time 3D is switched on.

   Every block is a cube (a coin on a graph), however tall the stacks
   get, and the picture fits the table only: a tall stack, like the
   64 grains of the center pile, shoots straight up out of the picture.
   ===================================================================== */
let sim3d = null;            // the 3D code, once loaded (js/sim-3d.js)
let view3d = null;           // the 3D picture

// Which picture shows: the view from above, the 3D view, or neither
// while the graph tool is open.
function showPictureKind() {
  simCanvas.hidden = tool.isOpen || show3D;
  byId("sim-3d").hidden = byId("view3d-buttons").hidden = tool.isOpen || !show3D;
  byId("view3d-help").hidden = !show3D;
  showZoomButtons(view);
  if (show3D && !view3d) start3D();
  drawSoon();
}

// Load the 3D code (the first time only) and make the 3D picture.
function start3D() {
  load3D(byId("sim-3d"), pictureHeight(BALL_HEIGHT), function (code, picture) {
    sim3d = code;
    view3d = picture;
    drawSoon();
  }, function () { show3D = false; showPictureKind(); });
}

// The stacks: valueOf(v) blocks on cell v (sink cells left out). Each
// stack's kind is its threshold, so its blocks get the colors of a cell
// that topples there.
function draw3D(valueOf, showTopples) {
  if (!view3d) return;
  const d = domain, x = [], y = [], height = [], width = [], kind = [];
  let floor, lines;
  if (domainKind === "graph") {
    // Each cell where the disk picture puts it, as wide as it looks
    // there (the start cell, in the middle, is 1 wide; on a tree a bit
    // over half as wide, so the stacks don't touch).
    const unit = 1 / (2 * diskShape(disk).middle);
    const thinner = isTree(disk.spec) ? 0.6 : 1;
    for (let v = 0; v < d.n; v++) {
      if (sinks.includes(v)) continue;
      const [mx, my] = motionApply(seenFrom(disk, ballPlace(d, v)), 0, 0);
      const w = 1 - mx * mx - my * my;         // how much smaller than the start cell it looks
      if (w < 0.004) continue;                 // too small to see
      x.push(mx * unit); y.push(my * unit); height.push(valueOf(v)); width.push(thinner * w); kind.push(threshold[v]);
    }
    floor = { disk: unit };
  } else if (d.lattice) {
    for (let v = 0; v < d.n; v++) {
      if (sinks.includes(v)) continue;
      const [u, w] = cellMiddle(d, v);
      x.push(u); y.push(w); height.push(valueOf(v)); width.push(2 * cellRadius(d, v)); kind.push(threshold[v]);
    }
    // The floor is the picture's box (one big flat box: drawStacks counts
    // a box of cells from the middle of its first one to the middle of its
    // last, so half a side length comes off each end).
    const box = pictureBox(d);
    floor = { xmin: box.left + 0.5, xmax: box.right - 0.5, ymin: box.bottom + 0.5, ymax: box.top - 0.5 };
    lines = tilingLines(d);
  } else {
    for (let v = 0; v < d.n; v++) {
      if (sinks.includes(v)) continue;
      x.push(d.x[v]); y.push(d.y[v]); height.push(valueOf(v)); width.push(1); kind.push(threshold[v]);
    }
    // A box or torus stands on one flat box; a custom table on its own cells.
    floor = domainKind === "custom" ? { x: d.x, y: d.y } : { xmin: d.xmin, xmax: d.xmax, ymin: d.ymin, ymax: d.ymax };
  }
  const most = height.reduce(function (a, b) { return Math.max(a, b); }, 1);   // (a long list can't be spread into Math.max)
  sim3d.drawStacks(view3d, {
    x: x, y: y, height: height, width: width, kind: kind, floor: floor,
    shape: domainKind === "graph" || d.lattice ? "coins" : "cubes", stretch: 1, fixedSize: true,
    color: function (k, tallestStack, top) { return showTopples ? colorOfTopples(k, most) : colorOfHeight(k, top); },
    empty: colorOfHeight(0, mostThreshold), ground: hexToRGB(OUTSIDE),
    lines: lines, lineColor: hexToRGB(SINK),
  });
}

// The sides of a tiling's cells, as lines on the 3D floor: [x1, y1, x2,
// y2, ...], each side once (from the cell with the smaller number, or
// on the table's edge). Worked out once per table, and kept.
function tilingLines(d) {
  if (d.floorLines) return d.floorLines;
  const sides = latticeSides(d), lines = [];
  for (let v = 0; v < d.n; v++) {
    const corners = cornersOf(d, v);
    corners.forEach(function (c, k) {
      if (sides[v][k] > v) return;
      const next = corners[(k + 1) % corners.length];
      lines.push(c[0], c[1], next[0], next[1]);
    });
  }
  d.floorLines = lines;
  return lines;
}

// The View option, and the button to look from the start again.
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () { show3D = (radio.value === "3d"); showPictureKind(); });
}
byId("view3d-reset").addEventListener("click", function () { if (view3d) sim3d.resetCamera(view3d); });


/* =====================================================================
   6. CLICKING, DRAGGING AND ZOOMING
   ---------------------------------------------------------------------
   A click on a cell adds a grain, removes one, or shows the cell's
   numbers (the "Clicking a cell" options, as in nadya's Sandpiles.js);
   it can also topple the cell once (if it has enough grains), or make
   it a sink cell, or a normal cell again.
   The picture can also be moved and zoomed, as in the coloring sims
   (and like a graph in Desmos): drag to move, mouse wheel or pinch to
   zoom, and the + / − / Reset buttons. A press that hardly moves counts
   as a click, a longer one as a drag (connectPicture,
   js/sim-controls.js).
   On a hyperbolic tiling or tree, one pointer drags across the plane
   instead, and two fingers slide and zoom the picture.
   ===================================================================== */
// A click on a cell.
function clickCell(v) {
  if (v === -1 || !latest) return;
  const mode = checked("click");
  if (mode === "sink") {
    // Make it a sink cell, or a normal cell again. The pile keeps its
    // grains (the worker's changeSinks, sandpiles-pile.js).
    sinks = sinks.includes(v) ? sinks.filter(function (s) { return s !== v; }) : sinks.concat([v]);
    worker.postMessage({ type: "sinks", sinks: sinks });
  } else if (sinks.includes(v)) {
    showMessage("This is a sink cell: it eats every grain it gets.");
  } else if (mode === "topple") {
    if (latest.heights[v] < threshold[v]) {
      showMessage("This cell has " + latest.heights[v] + " grains; it needs " + threshold[v] + " to topple.");
    } else {
      worker.postMessage({ type: "topple", cell: v });
    }
  } else if (mode === "info") {
    const name = domainKind === "graph"
      ? "This cell, " + ballSteps[v] + (ballSteps[v] === 1 ? " step" : " steps") + " from the start"
      : domain.lattice ? "This " + tilingCellName(v)
      : "Cell (" + domain.x[v] + ", " + domain.y[v] + ")";
    showMessage(name + ": " + latest.heights[v] + " grains, toppled " +
                latest.odometer[v].toLocaleString() + " times so far" +
                (domain.lattice ? "; it topples at " + threshold[v] + " grains." : "."));
  } else {
    worker.postMessage({ type: "add", cell: v, grains: mode === "add" ? 1 : -1 });
  }
}

// What cell v of a tiling is, in words: the polygon it is ("triangle",
// "12-gon"), or "corner" when the corners are the cells.
const POLYGON_NAMES = { 3: "triangle", 4: "square", 6: "hexagon", 8: "octagon", 12: "12-gon" };
function tilingCellName(v) {
  return domain.tiling.corners ? "corner" : POLYGON_NAMES[domain.tiling.cells[domain.part[v]].corners.length];
}

connectPicture(view, disk, function () { return domainKind === "graph"; }, function (event) {
  clickCell(domainKind === "graph" ? ballCellAt(disk, domain, event)
                                   : cellUnder(view, domain, pointerSpot(view, event)));
}, "grab");


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   The numbers come from the pile (report() in sandpiles-pile.js). The
   count of cells of each height is made here. The avalanche sizes are
   counted by the pile while the storm waits until stable: the topples
   caused by each grain, grouped by powers of 2 (0, 1, 2-3, 4-7, ...).
   ===================================================================== */
let lastNote = "";   // the last note showStats put under the picture

function showStats() {
  if (!domain || !latest) return;
  const s = latest;
  const ordinaryCells = domain.n - sinks.length;
  byId("stat-cells").textContent = ordinaryCells.toLocaleString() + (sinks.length ? " (and the sink cell)" : "");
  byId("stat-grains").textContent = s.grains.toLocaleString() +
    " (" + (s.grains / Math.max(ordinaryCells, 1)).toFixed(3) + " per cell)";
  byId("stat-added").textContent = s.startGrains.toLocaleString() + " + " + s.added.toLocaleString();
  byId("stat-lost").textContent = s.hasSink ? s.lost.toLocaleString() : "no sink: grains can't leave";
  byId("stat-topples").textContent = s.topples.toLocaleString();
  byId("stat-unstable").textContent = s.unstable.toLocaleString();
  byId("stat-stable").textContent = s.stable ? "yes" : s.neverStabilizes ? "never: it topples forever" : "not yet";
  byId("stat-recurrent").textContent = !s.hasSink ? "no sink, so not defined"
    : s.recurrent === null ? (s.stable ? "checking..." : "only for stable piles")
    : s.recurrent ? "yes" : "no";

  // The note under the picture. It goes away once it no longer holds
  // (e.g. "This is the identity" once anything but toppling changes the
  // pile), unless another message has replaced it.
  const note = s.neverStabilizes
    ? "This pile will never stabilize: every cell has toppled, and with no sink no grain " +
      "can ever leave (Björner, Lovász and Shor 1991). Remove some grains, or add a sink cell."
    : byId("start-kind").value === "identity" && s.stable && !s.touched
    ? (s.hasSink ? "This is the identity of this table."
       : "A table with no sink has no identity. Click a cell with \"Adds or removes a sink\" to make one.")
    : "";
  if (note !== lastNote && (note !== "" || byId("sim-message").textContent === lastNote)) showMessage(note);
  lastNote = note;

  const stayOn = byId("stay-on").checked;
  byId("play").disabled = s.stable && !byId("storm").checked && !stayOn && !playing;   // nothing can happen
  byId("step").disabled = s.stable && !byId("storm").checked;
  byId("jump").disabled = s.stable;
  byId("undo").disabled = !s.canUndo;
  byId("add-identity").disabled = !s.hasSink;

  drawHeightsChart();
  drawTimelineChart();
  drawAvalancheChart();
}

// One bar per height, in that height's color, with its count above it:
// 0, 1, ..., 7 and "8+" (or up to the biggest threshold, if it is more
// than 8). On a tiling whose cells topple at different heights, a
// height has no one color (section 3), so the bars are all one color.
function drawHeightsChart() {
  const canvas = byId("heights-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const lastBar = Math.max(HEIGHT_BARS, mostThreshold);  // the "8+" bar
  const bars = lastBar + 1;
  const counts = new Array(bars).fill(0);
  for (let v = 0; v < domain.n; v++) {
    if (sinks.includes(v)) continue;
    counts[Math.min(latest.heights[v], lastBar)]++;
  }
  const most = Math.max(1, ...counts);
  const top = 14, bottom = h - 14, barWidth = w / bars;
  pen.textAlign = "center";
  pen.strokeStyle = CHART_TEXT;
  pen.lineWidth = 0.5;
  counts.forEach(function (count, b) {
    const barHeight = count === 0 ? 0 : Math.max(1, (bottom - top) * count / most);
    const left = b * barWidth + 2, width = Math.max(1, barWidth - 4);
    pen.fillStyle = sameThreshold === null ? CHART_LINE : rgbToHex(colorOfHeight(b, sameThreshold));
    pen.fillRect(left, bottom - barHeight, width, barHeight);
    pen.strokeRect(left, bottom - barHeight, width, barHeight);
    pen.fillStyle = CHART_TEXT;
    pen.textBaseline = "bottom";
    pen.fillText(count.toLocaleString(), (b + 0.5) * barWidth, bottom - barHeight - 1);
    pen.textBaseline = "top";
    pen.fillText(b < lastBar ? String(b) : lastBar + "+", (b + 0.5) * barWidth, bottom + 2);
  });
}

// The avalanche sizes, grouped by powers of 2 (the pile counts them:
// group 0 is a grain that toppled nothing, group b > 0 is from 2^(b-1)
// to 2^b - 1 topples). Both charts leave group 0 out: they are about
// the avalanches themselves.

// Avalanches over time: column c is the storm grains number c * width
// to (c + 1) * width - 1 (the pile's timeline), row b (from the bottom,
// starting at b = 1) is group b, and the color is how many of the
// column's avalanches are in that group, from white (none) to dark blue
// (as many as its most common group).
function drawTimelineChart() {
  const canvas = byId("timeline-chart");
  const pen = chartPen(canvas);
  const columns = latest.timeline, width = latest.timelineWidth;
  byId("timeline-info").textContent = latest.avalancheCount === 0
    ? "Start from an empty table, tick the storm (with \"Wait until stable\") and press Play " +
      "to watch the pile turn critical."
    : "Across: storm grains, " + width.toLocaleString() + (width === 1 ? " grain" : " grains") +
      " per column. Up: avalanche sizes, from 1 topple. Darkest: the most common size in that column.";
  if (columns.length === 0) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const left = 40, up = 4, bottom = h - 16;
  const rows = latest.avalancheBins.length - 1;   // groups 1, 2, ... (not 0)
  if (rows < 1) return;
  const colWidth = (w - left) / Math.max(columns.length, 20), rowHeight = (bottom - up) / rows;
  columns.forEach(function (column, c) {
    const most = Math.max(0, ...column.slice(1));
    column.forEach(function (count, b) {
      if (b === 0 || count === 0) return;
      pen.fillStyle = rgbToHex(colorOfTopples(count, most));
      pen.fillRect(left + c * colWidth, bottom - b * rowHeight, Math.ceil(colWidth), Math.ceil(rowHeight));
    });
  });
  // Labels: some of the sizes on the left, the grains along the bottom.
  pen.fillStyle = CHART_TEXT;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  const every = Math.ceil(rows / Math.max(1, Math.floor((bottom - up) / 14)));
  for (let b = 1; b <= rows; b += every) pen.fillText((2 ** (b - 1)).toLocaleString(), left - 4, bottom - (b - 0.5) * rowHeight);
  pen.textBaseline = "bottom";
  pen.textAlign = "left";
  pen.fillText("0", left, h);
  pen.textAlign = "right";
  pen.fillText("grain " + latest.avalancheCount.toLocaleString(), left + columns.length * colWidth, h);
}

// Avalanche sizes on logarithmic scales: for each group b >= 1, a dot at
// its smallest size 2^(b-1) across and, up, the fraction of avalanches
// (at least one topple) in it divided by its width (2^(b-1) sizes): the
// fraction of avalanches of each size in the group, on average. A power
// law is a straight line.
function drawAvalancheChart() {
  const canvas = byId("avalanche-chart");
  const pen = chartPen(canvas);
  const bins = latest.avalancheBins, total = latest.avalancheCount;
  const sized = total - (bins[0] || 0);       // grains that toppled something
  byId("avalanche-info").textContent = total === 0 ? ""
    : total.toLocaleString() + " grains dropped so far; " + sized.toLocaleString() + " of them set off an avalanche. " +
      "Both scales are logarithmic, so a power law shows as a straight line.";
  const dots = [];                            // [log10 size, log10 fraction]
  for (let b = 1; b < bins.length; b++) {
    if (bins[b] > 0) dots.push([(b - 1) * Math.log10(2), Math.log10(bins[b] / 2 ** (b - 1) / sized)]);
  }
  if (dots.length < 2) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const left = 44, up = 6, bottom = h - 16;
  const xTop = Math.max(1, Math.ceil(dots[dots.length - 1][0]));
  let yLow = 0;
  for (const dot of dots) yLow = Math.min(yLow, Math.floor(dot[1]));
  const sx = function (lx) { return left + (w - left - 8) * lx / xTop; };
  const sy = function (ly) { return up + (bottom - up) * ly / yLow; };   // 0 (a fraction of 1) at the top
  // The powers of 10 on both axes.
  pen.textBaseline = "middle";
  pen.textAlign = "right";
  const yEvery = Math.ceil(-yLow / 5);
  for (let k = 0; k >= yLow; k -= yEvery) pen.fillText(k === 0 ? "1" : "1e" + k, left - 4, sy(k));
  pen.textBaseline = "bottom";
  pen.textAlign = "center";
  for (let k = 0; k <= xTop; k++) {
    pen.textAlign = k === xTop ? "right" : "center";   // the last one stays inside the chart
    pen.fillText(Math.pow(10, k).toLocaleString(), k === xTop ? w : sx(k), h);
  }
  pen.beginPath();
  dots.forEach(function (dot, k) {
    if (k === 0) pen.moveTo(sx(dot[0]), sy(dot[1])); else pen.lineTo(sx(dot[0]), sy(dot[1]));
  });
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
  pen.fillStyle = CHART_LINE;
  for (const dot of dots) {
    pen.beginPath();
    pen.arc(sx(dot[0]), sy(dot[1]), 3, 0, 2 * Math.PI);
    pen.fill();
  }
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page): makeCustomTool, in
   js/sim-controls.js. Any painted region works, even in several
   pieces: every piece loses grains off its edge. (A region covering a
   whole torus has no edge; then the sink options appear, as for the
   torus.) Done uses it.
   ===================================================================== */
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return playing; },
  setPlaying: setPlaying,
  check: function (drawing) {
    const cells = drawing.graph.vertices.length;
    return cells === 0 ? ["Paint the table first.", ""] : ["", cells + " cells, " + drawing.grid.neighbors + " neighbors."];
  },
  done: function (drawing) {
    customDomain = drawnDomain(drawing.graph, drawing.grid);
    customNeighbors = drawing.grid.neighbors;
    useDomain("custom", customDomain, customNeighbors);
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
  showPicture: showPictureKind,     // the picture from above or in 3D hides while the tool is open
});


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new table and restart. "topples" is the grains that make
// a cell topple: one number for every cell, or a list with each cell's.
function useDomain(kind, d, topples) {
  domainKind = kind;
  domain = d;
  threshold = typeof topples === "number" ? new Int32Array(d.n).fill(topples) : topples;
  mostThreshold = threshold.reduce(function (a, b) { return Math.max(a, b); }, 0);
  sameThreshold = threshold.every(function (t) { return t === threshold[0]; }) ? threshold[0] : null;
  useTorus(view, Boolean(d.wrap));   // moving and zooming; zooming out past the whole picture only on a torus (js/sim-view.js)
  sinks = [];                         // no sink cells on a new table (click to make some)
  makeHeightColors();
  showDomainChoice();
  showStartChoice();
  showPictureKind();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  if (tool.isOpen) tool.close();
  const d = boxFromOptions(checked("domain") === "torus" ? MIN_TORUS : 1, MAX_SIDE, DEFAULTS);
  useDomain(d.wrap ? "torus" : "box", d, d.lattice ? tilingThresholds(d) : Number(byId("set-neighbors").value));   // (sandpiles-pile.js)
}

// A ball of a hyperbolic tiling or a tree, from the options on the
// page (ballFromOptions, js/sim-hyperbolic.js), with the start cell in
// the middle of the picture. Every cell of the tiling {p,q} (or of the
// tree of degree p) has p neighbors, so it topples at p grains, and the
// grains sent to neighbors outside the ball are lost.
function useGraph() {
  if (tool.isOpen) tool.close();
  const ball = ballFromOptions(disk, BALL, function (spec) { return ", each toppling at " + spec.p + " grains"; });
  if (ball === null) { showDomainChoice(); return; }
  ballSteps = stepsFrom(ball, [0]);      // js/sim-domains.js
  useDomain("graph", ball, disk.spec.p);
}

// Show the options that fit the table in use, and tick its radio button
// (js/sim-controls.js), with this page's words for a custom table.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
  byId("lattice-note").hidden = onSquares();   // (the Neighbors option says it on squares)
  if (domainKind === "custom" && customDomain) {
    byId("custom-info").textContent = "Your table: " + customDomain.n + " cells, " + customNeighbors +
      " neighbors" + (customDomain.wrap ? ", on a torus." : ".");
  }
}

// Show only the number boxes of the chosen start.
const START_HELP = {
  center: "n grains on the middle cell, as in your Python (64 on 25 x 25); on the top left cell if the middle is a sink.",
  random: "Each cell gets 0, 1, ..., up to that many grains, all equally likely.",
  full: "Every cell gets the same number of grains.",
  linear: "Cells numbered row by row from the bottom left, cell k gets value + k × slope grains (0 if that is negative).",
  empty: "No sand: click to add grains, or start the storm.",
  identity: "The pile 2M − (2M)° (see All the details), which topples into the identity. Press Play or Jump to the end. A table needs a sink for this: a box has its edge; on a torus, click to make sink cells.",
};
// On a ball of a hyperbolic tiling or a tree, which has no rows:
const START_HELP_BALL = {
  center: "n grains on the start cell, in the middle of the ball.",
  linear: "Cells numbered outward from the start (the start is 0), cell k gets value + k × slope grains (0 if that is negative).",
};
function showStartChoice() {
  const kind = byId("start-kind").value;
  byId("grains-row").hidden = kind !== "center";
  byId("most-row").hidden = kind !== "random";
  byId("full-row").hidden = kind !== "full";
  byId("linear-row").hidden = kind !== "linear";
  byId("start-help").textContent = (domainKind === "graph" && START_HELP_BALL[kind]) || START_HELP[kind];
}

// Table: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options, the Lattice options among them (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

// Start: the kind, and its numbers. A slider and its number box move
// together, and the pile restarts (paused) live while you drag, like a
// Desmos slider.
byId("start-kind").addEventListener("change", function () { showStartChoice(); restart(); });
function pairSliderAndBox(sliderId, boxId) {
  byId(sliderId).addEventListener("input", function () { byId(boxId).value = this.value; restart(); });
  byId(boxId).addEventListener("change", function () { byId(sliderId).value = this.value; restart(); });
}
pairSliderAndBox("grains-slider", "set-grains");
pairSliderAndBox("most-slider", "set-most");
pairSliderAndBox("full-slider", "set-full");
byId("set-value").addEventListener("change", function () { restart(); });
byId("set-slope").addEventListener("change", function () { restart(); });

// Add the identity of this table to the pile (then it topples as usual).
byId("add-identity").addEventListener("click", function () { worker.postMessage({ type: "identity" }); });

// Play / Pause, Step, Undo, Jump, Restart.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "step" });
});
byId("undo").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "undo" });
});
byId("jump").addEventListener("click", function () { worker.postMessage({ type: "jump" }); });
byId("restart").addEventListener("click", function () { restart(); });

// One at a time or rounds; speed; the storm.
for (const radio of document.querySelectorAll('input[name="order"]')) {
  radio.addEventListener("change", function () { sendSettings(); showSpeed(); });
}
function showSpeed() {
  const what = checked("order") === "rounds" ? "round" : "topple";
  byId("speed-label").textContent = speedText(speed, what, what + "s");
}
connectSpeedSlider("speed", SPEEDS, DEFAULT_SPEED, function (newSpeed) {
  speed = newSpeed;
  showSpeed();
  sendSettings();
});
connectSpeedSlider("storm-rate", STORM_RATES, DEFAULT_STORM_RATE, function (newRate) {
  stormRate = newRate;
  byId("storm-label").textContent = speedText(stormRate, "grain", "grains");
  sendSettings();
});
byId("storm").addEventListener("change", function () { sendSettings(); drawSoon(); });
byId("storm-wait").addEventListener("change", sendSettings);
byId("stay-on").addEventListener("change", function () { sendSettings(); drawSoon(); });

// The picture: heights or topples, colors, numbers. (From above or 3D: section 5b.)
for (const radio of document.querySelectorAll('input[name="show"]')) {
  radio.addEventListener("change", drawSoon);
}
byId("palette").addEventListener("change", function () { makeHeightColors(); drawSoon(); });
byId("show-numbers").addEventListener("change", drawSoon);

// Seed: the same seed gives the same run every time.
connectSeed(function () { restart(); });


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
fillLatticeMenu();
byId("start-kind").value = DEFAULTS.start;
addRangeBoxes(byId("grains-slider"), 0, GRAINS_SLIDER_MAX);   // min and max boxes (js/sim-page.js)
byId("set-grains").value = byId("grains-slider").value = DEFAULTS.grains;
byId("set-grains").max = MAX_GRAINS;
byId("set-most").value = byId("most-slider").value = DEFAULTS.most;
byId("set-full").value = byId("full-slider").value = DEFAULTS.full;
byId("set-most").max = byId("most-slider").max = MAX_HEIGHT_SETTING;
byId("set-full").max = byId("full-slider").max = MAX_HEIGHT_SETTING;
byId("set-value").value = DEFAULTS.value;
byId("set-slope").value = DEFAULTS.slope;
byId("seed").value = DEFAULTS.seed;
showStartChoice();
sendSettings();
useBox();
setPlaying(false);   // paused: press Play to watch it topple
