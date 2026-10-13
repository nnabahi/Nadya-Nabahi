/* =====================================================================
   sandpiles.js  —  the page of the "Sandpiles" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the table: a box or torus of cells, a custom one drawn
       in the graph tool (shown inside this page), or a ball of a
       hyperbolic tiling or a tree. The domain code is shared with the
       other sims: the domains in js/sim-domains.js, their options and
       the graph tool in js/sim-controls.js, and the hyperbolic tilings
       and trees, and their pictures, in js/sim-graphs.js and
       js/sim-hyperbolic.js.
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
let neighbors = 4;              // 4 or 8 (p on a tiling {p,q} or a tree): also the number of grains that makes a cell topple
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
                             0 up to the threshold (4 on the square grid)
                             go white, yellow, orange, light red, dark
                             red (colors from ColorBrewer's "YlOrRd",
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

// heightRGB[h] is the color of height h, as [r, g, b], for h from 0 up
// to the threshold "top" or 9, whichever is more (the ten colors of
// "One color per height"); taller cells get the last one (but see
// colorOfHeight). For "Orange to red" the colors are mixed in hue,
// saturation and brightness with hexToHSV and hsvToHex, and turned into
// [r, g, b] with hexToRGB (all three in js/sim-colors.js).
let heightRGB = [];
let palette = "smooth";   // the Colors menu's choice
let tallest = 0;          // the tallest cell right now (set by drawPile), for the viridis colors
function makeHeightColors() {
  const top = neighbors;
  palette = byId("palette").value;
  heightRGB = [];
  for (let h = 0; h <= Math.max(top, HEIGHT_COLORS.length - 1); h++) {
    if (palette === "smooth") {
      heightRGB.push(alongColors(LOW_RGB, Math.min(h / top, 1)));
    } else if (palette === "list") {
      heightRGB.push(hexToRGB(HEIGHT_COLORS[Math.min(h, HEIGHT_COLORS.length - 1)]));
    } else if (h < 1) {
      heightRGB.push(hexToRGB(HEIGHT_COLORS[0]));
    } else if (h >= top) {
      heightRGB.push(hexToRGB(HEIGHT_COLORS[2]));
    } else {
      const a = hexToHSV(HEIGHT_COLORS[1]), b = hexToHSV(HEIGHT_COLORS[2]), t = (h - 1) / (top - 1);
      heightRGB.push(hexToRGB(hsvToHex(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]))));
    }
  }
}
function colorOfHeight(h) {
  if (palette === "smooth" && h > neighbors) {
    // Above the threshold: green just above it, dark purple at the tallest.
    const t = tallest > neighbors + 1 ? (tallest - h) / (tallest - neighbors - 1) : 1;
    return alongColors(TALL_RGB, Math.max(0, Math.min(1, t)));
  }
  return heightRGB[Math.min(h, heightRGB.length - 1)];
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
    domain: domain, threshold: neighbors, sinks: sinks,
    start: startSettings(), seed: byId("seed").value,
  });
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
  const rgbOf = function (v) { return showTopples ? colorOfTopples(odometer[v], mostTopples) : colorOfHeight(heights[v]); };
  if (show3D) { draw3D(valueOf, showTopples); return; }
  if (domainKind === "graph") { drawOnGraph(valueOf, rgbOf); return; }

  // The picture's box: as big as fits the width (and at most
  // MAX_PICTURE_HEIGHT tall), in the middle of the canvas: view.cols x
  // view.rows squares, each view.cell pixels big. Then each square that
  // shows in its cell's color; cellOf is the cell on each square, row by
  // row from the top (negative: not on the table).
  const screen = fitPicture(view, d, MAX_PICTURE_HEIGHT);
  const sinkColor = hexToRGB(SINK);
  const cellOf = paintCells(view, screen, d, function (v) { return v; },
    function (v) { return sinks.includes(v) ? sinkColor : rgbOf(v); }, hexToRGB(OUTSIDE));
  const cols = view.cols, rows = view.rows, size = view.cell;     // (paintCells works these out)

  // Big cells: thin lines between the cells, the numbers, and a cross
  // on the sink cell.
  if (size >= NUMBER_MIN_CELL) {
    screen.beginPath();
    for (let i = view.firstI; i <= view.lastI + 1; i++) {
      const x = squareLeft(view, i) + 0.5;
      screen.moveTo(x, 0); screen.lineTo(x, view.height);
    }
    for (let k = view.firstK; k <= view.lastK + 1; k++) {
      const y = squareTop(view, k) + 0.5;
      screen.moveTo(view.left, y); screen.lineTo(view.left + view.width, y);
    }
    screen.strokeStyle = "rgba(0, 0, 0, 0.15)";
    screen.lineWidth = 1;
    screen.stroke();

    screen.textAlign = "center";
    screen.textBaseline = "middle";
    screen.font = Math.round(size * 0.45) + "px sans-serif";
    for (let k = 0; k < rows; k++) {
      for (let i = 0; i < cols; i++) {
        const v = cellOf[k * cols + i];
        if (v < 0) continue;
        const cx = (squareLeft(view, view.firstI + i) + squareLeft(view, view.firstI + i + 1)) / 2;
        const cy = (squareTop(view, view.firstK + k) + squareTop(view, view.firstK + k + 1)) / 2;
        if (sinks.includes(v)) {
          const r = size * 0.25;
          screen.beginPath();
          screen.moveTo(cx - r, cy - r); screen.lineTo(cx + r, cy + r);
          screen.moveTo(cx + r, cy - r); screen.lineTo(cx - r, cy + r);
          screen.strokeStyle = "#ffffff";
          screen.lineWidth = 2;
          screen.stroke();
        } else if (byId("show-numbers").checked) {
          screen.fillStyle = textColorOn(rgbOf(v));
          screen.fillText(String(valueOf(v)), cx, cy + 1);
        }
      }
    }
  }
  screen.restore();
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
   coins as wide as its cell, as in the Eden Mountain. The 3D code is
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

// The stacks: valueOf(v) blocks on cell v (sink cells left out).
function draw3D(valueOf, showTopples) {
  if (!view3d) return;
  const d = domain, x = [], y = [], height = [], width = [];
  let floor;
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
      x.push(mx * unit); y.push(my * unit); height.push(valueOf(v)); width.push(thinner * w);
    }
    floor = { disk: unit };
  } else {
    for (let v = 0; v < d.n; v++) {
      if (sinks.includes(v)) continue;
      x.push(d.x[v]); y.push(d.y[v]); height.push(valueOf(v)); width.push(1);
    }
    // A box or torus stands on one flat box; a custom table on its own cells.
    floor = domainKind === "custom" ? { x: d.x, y: d.y } : { xmin: d.xmin, xmax: d.xmax, ymin: d.ymin, ymax: d.ymax };
  }
  const most = Math.max(1, ...height);
  sim3d.drawStacks(view3d, {
    x: x, y: y, height: height, width: width, floor: floor,
    shape: domainKind === "graph" ? "coins" : "cubes", stretch: 1, fixedSize: true,
    color: function (k) { return showTopples ? colorOfTopples(k, most) : colorOfHeight(k); },
    empty: colorOfHeight(0), ground: hexToRGB(OUTSIDE),
  });
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
    if (latest.heights[v] < neighbors) {
      showMessage("This cell has " + latest.heights[v] + " grains; it needs " + neighbors + " to topple.");
    } else {
      worker.postMessage({ type: "topple", cell: v });
    }
  } else if (mode === "info") {
    const name = domainKind === "graph"
      ? "This cell, " + ballSteps[v] + (ballSteps[v] === 1 ? " step" : " steps") + " from the start"
      : "Cell (" + domain.x[v] + ", " + domain.y[v] + ")";
    showMessage(name + ": " + latest.heights[v] + " grains, toppled " +
                latest.odometer[v].toLocaleString() + " times so far.");
  } else {
    worker.postMessage({ type: "add", cell: v, grains: mode === "add" ? 1 : -1 });
  }
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
// 0, 1, ..., 7 and "8+" (or up to the threshold, if it is more than 8).
function drawHeightsChart() {
  const canvas = byId("heights-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const lastBar = Math.max(HEIGHT_BARS, neighbors);  // the "8+" bar
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
    pen.fillStyle = rgbToHex(colorOfHeight(b));
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
// group 0 is no topples, group b > 0 from 2^(b-1) to 2^b - 1).

// The label of group b: its smallest size.
function groupLabel(b) { return b === 0 ? "0" : (2 ** (b - 1)).toLocaleString(); }

// Avalanches over time: column c is the avalanches number c * width to
// (c + 1) * width - 1 (the pile's timeline), row b (from the bottom) is
// group b, and the color is how many of the column's avalanches are in
// that group, from white (none) to dark blue (as many as its most
// common group).
function drawTimelineChart() {
  const canvas = byId("timeline-chart");
  const pen = chartPen(canvas);
  const columns = latest.timeline, width = latest.timelineWidth;
  byId("timeline-info").textContent = latest.avalancheCount === 0
    ? "Start from an empty table, tick the storm (with \"Wait until stable\") and press Play " +
      "to watch the pile turn critical."
    : "Across: storm grains, " + width.toLocaleString() + (width === 1 ? " grain" : " grains") +
      " per column. Up: avalanche sizes. Darkest: the most common size in that column.";
  if (columns.length === 0) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const left = 40, up = 4, bottom = h - 16;
  const rows = latest.avalancheBins.length;
  const colWidth = (w - left) / Math.max(columns.length, 20), rowHeight = (bottom - up) / rows;
  columns.forEach(function (column, c) {
    const most = Math.max(...column);
    column.forEach(function (count, b) {
      if (count === 0) return;
      pen.fillStyle = rgbToHex(colorOfTopples(Math.log1p(count), Math.log1p(most)));   // log: rare sizes still show
      pen.fillRect(left + c * colWidth, bottom - (b + 1) * rowHeight, Math.ceil(colWidth), Math.ceil(rowHeight));
    });
  });
  // Labels: some of the sizes on the left, the grains along the bottom.
  pen.fillStyle = CHART_TEXT;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  const every = Math.ceil(rows / Math.max(1, Math.floor((bottom - up) / 14)));
  for (let b = 0; b < rows; b += every) pen.fillText(groupLabel(b), left - 4, bottom - (b + 0.5) * rowHeight);
  pen.textBaseline = "bottom";
  pen.textAlign = "left";
  pen.fillText("0", left, h);
  pen.textAlign = "right";
  pen.fillText("grain " + latest.avalancheCount.toLocaleString(), left + columns.length * colWidth, h);
}

// Avalanche sizes on logarithmic scales: for each group b >= 1, a dot at
// its smallest size 2^(b-1) across and, up, the fraction of avalanches
// in it divided by its width (2^(b-1) sizes), the fraction of avalanches
// of each size in the group, on average. A power law is a straight line.
function drawAvalancheChart() {
  const canvas = byId("avalanche-chart");
  const pen = chartPen(canvas);
  const bins = latest.avalancheBins, total = latest.avalancheCount;
  const sized = total - (bins[0] || 0);       // avalanches with at least one topple
  byId("avalanche-info").textContent = total === 0 ? ""
    : total.toLocaleString() + " avalanches so far, " + sized.toLocaleString() + " with at least one topple. " +
      "Both scales are logarithmic, so a power law shows as a straight line.";
  const dots = [];                            // [log10 size, log10 fraction]
  for (let b = 1; b < bins.length; b++) {
    if (bins[b] > 0) dots.push([(b - 1) * Math.log10(2), Math.log10(bins[b] / 2 ** (b - 1) / total)]);
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

// Switch to a new table and restart.
function useDomain(kind, d, n) {
  domainKind = kind;
  domain = d;
  neighbors = n;
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
  useDomain(d.wrap ? "torus" : "box", d, Number(byId("set-neighbors").value));
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
// options (js/sim-controls.js), and the sink.
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
