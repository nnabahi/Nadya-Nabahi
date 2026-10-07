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
     - Clicking a cell adds a grain, removes one, or shows its numbers.
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js, and the zoom of the torus is in js/sim-view.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Colors
     4. Running the pile
     5. Drawing the pile
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
  start: "center", grains: 64, most: 3, full: 3, value: 0, slope: 1,
};

const MAX_SIDE = 300;             // the biggest box or torus is 300 x 300
const MIN_TORUS = 3;              // a torus at least 3 x 3, so every cell has 4 (or 8) different neighbors
const MAX_GRAINS = 1000000;       // the most grains in the center pile
const GRAINS_SLIDER_MAX = 5000;   // the slider goes up to this; the box can go higher
const MAX_HEIGHT_SETTING = 50;    // "Random: up to" and "Full: height" go up to this
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not on the table)
const SINK = "#555555";           // the sink cell
const NUMBER_MIN_CELL = 16;       // cells at least this big (in pixels) show their number
const PAD = 2;                    // room above and below the picture

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 5, most: 20, cells: 20000 };

// The speeds on the Speed slider, in topples (or rounds) per second.
// Infinity means "as fast as the computer can". The default is slow, so
// you can watch every topple.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 20000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(10);

// The storm's rates, in grains per second.
const STORM_RATES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_STORM_RATE = STORM_RATES.indexOf(2);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";         // "box", "torus", "custom" or "graph": the table in use
let domain = null;              // the table's graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
let neighbors = 4;              // 4 or 8 (p on a tiling {p,q} or a tree): also the number of grains that makes a cell topple
let sinks = [];                 // the sink cell, if any (a list of 0 or 1 cells)
let customDomain = null;        // the last custom domain drawn, if any
let customNeighbors = 4;        // the graph tool's neighbors for it

// Hyperbolic plane or tree: how many steps each cell of the ball is
// from the start. (Which graph it is, how it is drawn and how far the
// plane has been moved are in "disk", section 5.)
let ballSteps = null;

let playing = false;            // it starts paused; Play sets it going
let speedIndex = DEFAULT_SPEED;
let stormRateIndex = DEFAULT_STORM_RATE;
let run = 0;                    // counts restarts, so leftovers from an older run are ignored
let playId = 0;                 // counts presses of Play and Pause (see section 4)

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

// The color of each height 0 .. top (top = the threshold), as [r, g, b].
// Heights above top use the color of top. The colors are mixed in hue,
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
  return [255 + t * (TOPPLES_DARKEST[0] - 255), 255 + t * (TOPPLES_DARKEST[1] - 255), 255 + t * (TOPPLES_DARKEST[2] - 255)];
}


/* =====================================================================
   4. RUNNING THE PILE
   ---------------------------------------------------------------------
   The pile is the function pileWorker() in sandpiles-pile.js.
   startWorker (js/sim-page.js) runs it in a second thread, a "Web
   Worker", so the page never freezes, with the toppling rule copied in.
   ===================================================================== */
const worker = startWorker(pileWorker, [newPile, startHeights, middleCell]);

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

// Start again from the start, with the current table, settings and seed.
// "jump": topple to the end at once (otherwise only if the box
// "Jump to the end whenever a setting changes" is ticked).
function restart(jump) {
  run++;
  latest = null;
  showMessage("");
  worker.postMessage({
    type: "setup", run: run,
    domain: domain, threshold: neighbors, sinks: sinks,
    start: startSettings(), seed: byId("seed").value,
    jump: Boolean(jump) || byId("auto-jump").checked,
  });
}

// Tell the pile the settings of the Run and Storm boxes.
function sendSettings() {
  worker.postMessage({
    type: "settings",
    rounds: checked("order") === "rounds",
    speed: SPEEDS[speedIndex],
    storm: byId("storm").checked,
    stormRate: STORM_RATES[stormRateIndex],
    stormWait: byId("storm-wait").checked,
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
   and says which cell of the table is on each square that shows. A box
   simply fills the picture's box once. A torus (or a table drawn on
   one) wraps around, so the squares keep finding cells beyond the box,
   and the torus can be moved and zoomed (section 6). Zoomed out, it
   shows several times side by side.

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

// Where the picture goes, and the torus's zoom (js/sim-view.js). Cells
// of 4 pixels or more get a whole number of pixels each, so every cell
// is exactly the same size.
const view = makeView(simCanvas, drawSoon, PAD, 4);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, showDomainChoice);

function drawPile() {
  if (!domain || !latest || simCanvas.hidden) return;
  const d = domain, heights = latest.heights, odometer = latest.odometer;
  const showTopples = checked("show") === "topples";
  let mostTopples = 0;
  if (showTopples) for (let v = 0; v < d.n; v++) mostTopples = Math.max(mostTopples, odometer[v]);
  tallest = 0;
  for (let v = 0; v < d.n; v++) if (heights[v] > tallest && !sinks.includes(v)) tallest = heights[v];
  if (domainKind === "graph") { drawOnGraph(showTopples, mostTopples); return; }

  // The picture's box: as big as fits the width (and at most
  // MAX_PICTURE_HEIGHT tall), in the middle of the canvas: view.cols x
  // view.rows squares, each view.cell pixels big. Then each square that
  // shows in its cell's color; cellOf is the cell on each square, row by
  // row from the top (negative: not on the table).
  const screen = fitPicture(view, d, MAX_PICTURE_HEIGHT);
  const sinkColor = hexToRGB(SINK);
  const cellOf = paintCells(view, screen, d, function (v) { return v; }, function (v) {
    return sinks.includes(v) ? sinkColor
      : showTopples ? colorOfTopples(odometer[v], mostTopples)
      : colorOfHeight(heights[v]);
  }, hexToRGB(OUTSIDE));
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
          const value = showTopples ? odometer[v] : heights[v];
          const rgb = showTopples ? colorOfTopples(odometer[v], mostTopples) : colorOfHeight(heights[v]);
          // Dark text on light cells, white text on dark ones.
          screen.fillStyle = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) > 140 ? "#1e1e1e" : "#ffffff";
          screen.fillText(String(value), cx, cy + 1);
        }
      }
    }
  }
  screen.restore();
}

// Hyperbolic plane or tree: the ball's cells in the colors of their
// heights (or topples), with the rest of the tiling (or tree) in thin
// gray (js/sim-hyperbolic.js), and the numbers on cells big enough.
function drawOnGraph(showTopples, mostTopples) {
  const heights = latest.heights, odometer = latest.odometer, height = pictureHeight(BALL_HEIGHT);
  const rgbOf = function (v) {
    return showTopples ? colorOfTopples(odometer[v], mostTopples) : colorOfHeight(heights[v]);
  };
  const colorOf = function (v) { return rgbToHex(rgbOf(v).map(Math.round)); };
  let pen;
  if (disk.picture === "spread") {
    pen = drawSpreadTree(disk, height, domain.n,
      function (v) { return domain.depth[v]; }, function (v) { return domain.angle[v]; }, colorOf);
  } else {
    pen = diskPen(disk, height);
    drawDiskFrame(disk, pen, height, OUTSIDE, UNDER_COLOR);
    drawOnDisk(disk, pen, diskGraph(disk), domain.n, function (v) { return ballPlace(domain, v); }, colorOf);
  }
  if (!byId("show-numbers").checked) return;

  // The numbers, on cells at least NUMBER_MIN_CELL pixels across.
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  for (let v = 0; v < domain.n; v++) {
    const spot = ballSpot(disk, domain, v);    // where cell v is on the screen, and about how big
    if (spot === null) continue;
    const x = spot.x, y = spot.y, size = 2 * spot.size;
    if (size < NUMBER_MIN_CELL || x < 0 || y < 0 || x > disk.box.width || y > disk.box.height) continue;
    const rgb = rgbOf(v);
    pen.font = Math.round(Math.min(size * 0.45, 28)) + "px sans-serif";
    // Dark text on light cells, white text on dark ones.
    pen.fillStyle = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) > 140 ? "#1e1e1e" : "#ffffff";
    pen.fillText(String(showTopples ? odometer[v] : heights[v]), x, y + 1);
  }
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. CLICKING, DRAGGING AND ZOOMING
   ---------------------------------------------------------------------
   A click on a cell adds a grain, removes one, or shows the cell's
   numbers (the "Clicking a cell" options, as in nadya's Sandpiles.js).
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
  if (sinks.includes(v)) {
    showMessage("This is the sink cell: it eats every grain it gets.");
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

  // The message under the picture.
  if (s.neverStabilizes) {
    showMessage("This pile will never stabilize: every cell has toppled, and with no sink no grain " +
                "can ever leave (Björner, Lovász and Shor 1991). Remove some grains, or add a sink cell.");
  } else if (byId("start-kind").value === "identity" && s.stable && s.added === 0) {
    showMessage(s.hasSink ? "This is the identity of this table."
      : "A table with no sink has no identity. Pick \"One sink cell in the middle\".");
  } else if (s.stable && byId("sim-message").textContent.startsWith("This pile will never")) {
    showMessage("");
  }

  byId("play").disabled = s.stable && !byId("storm").checked;
  byId("step").disabled = s.stable && !byId("storm").checked;
  byId("jump").disabled = s.stable;
  byId("undo").disabled = !s.canUndo;
  byId("show-identity").disabled = !s.hasSink;

  drawHeightsChart();
  drawAvalancheChart();
}

// One bar per height, in that height's color, with its count above it.
// Heights at or above the threshold (unstable cells) share the last bar.
function drawHeightsChart() {
  const canvas = byId("heights-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const bars = neighbors + 1;                        // 0, 1, ..., threshold - 1, and "threshold or more"
  const counts = new Array(bars).fill(0);
  for (let v = 0; v < domain.n; v++) {
    if (sinks.includes(v)) continue;
    counts[Math.min(latest.heights[v], neighbors)]++;
  }
  const most = Math.max(1, ...counts);
  const top = 14, bottom = h - 14, barWidth = w / bars;
  pen.textAlign = "center";
  counts.forEach(function (count, b) {
    const barHeight = count === 0 ? 0 : Math.max(1, (bottom - top) * count / most);
    pen.fillStyle = rgbToHex(colorOfHeight(b));
    pen.fillRect(b * barWidth + 2, bottom - barHeight, Math.max(1, barWidth - 4), barHeight);
    pen.strokeStyle = CHART_TEXT;
    pen.lineWidth = 0.5;
    pen.strokeRect(b * barWidth + 2, bottom - barHeight, Math.max(1, barWidth - 4), barHeight);
    pen.fillStyle = CHART_TEXT;
    pen.textBaseline = "bottom";
    pen.fillText(count.toLocaleString(), (b + 0.5) * barWidth, bottom - barHeight - 1);
    pen.textBaseline = "top";
    pen.fillText(b < neighbors ? String(b) : neighbors + "+", (b + 0.5) * barWidth, bottom + 2);
  });
}

// The avalanche sizes, grouped by powers of 2 (the pile counts them:
// bar 0 is no topples, bar b > 0 from 2^(b-1) to 2^b - 1); the bars'
// heights are on a logarithmic scale, so a power law shows as bars
// falling evenly (powerOfTwoBars, js/sim-charts.js).
function drawAvalancheChart() {
  byId("avalanche-info").textContent = latest.avalancheCount === 0
    ? "Tick the storm (with \"Wait until stable\") and press Play to collect avalanches."
    : latest.avalancheCount.toLocaleString() + " avalanches so far. Each bar counts the avalanches of " +
      "that many topples (the label is the smallest size in the bar); the heights are on a log scale.";
  powerOfTwoBars(byId("avalanche-chart"), latest.avalancheBins, "",
    function (b) { return b === 0 ? "0" : String(2 ** (b - 1)); }, true);
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
  makeHeightColors();
  showDomainChoice();
  showStartChoice();
  chooseSink();
}

// The sink cell: on a table that wraps around, if "One sink cell" is
// ticked, the middle cell. (On a box, the edge is the sink.)
function chooseSink() {
  sinks = (domain.wrap && checked("sink") === "cell") ? [middleCell(domain)] : [];
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
// (js/sim-controls.js), with the sink's row and this page's words for a
// custom table.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
  byId("sink-row").hidden = !(domain && domain.wrap);
  if (domainKind === "custom" && customDomain) {
    byId("custom-info").textContent = "Your table: " + customDomain.n + " cells, " + customNeighbors +
      " neighbors" + (customDomain.wrap ? ", on a torus." : ".");
  }
}

// Show only the number boxes of the chosen start.
const START_HELP = {
  center: "n grains on the middle cell, as in your Python (64 on 25 x 25).",
  random: "Each cell gets 0, 1, ..., up to that many grains, all equally likely.",
  full: "Every cell gets the same number of grains.",
  linear: "Cells numbered row by row from the bottom left, cell k gets value + k × slope grains (0 if that is negative).",
  empty: "No sand: click to add grains, or start the storm.",
  identity: "The pile 2M − (2M)° (see All the details), which topples into the identity. Press Play or Jump to the end.",
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
for (const radio of document.querySelectorAll('input[name="sink"]')) {
  radio.addEventListener("change", chooseSink);
}

// Start: the kind, and its numbers. A slider and its number box move
// together, and the pile restarts live while you drag, like a Desmos
// slider (tick "Jump to the end whenever a setting changes" to see the
// final pile live).
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
byId("auto-jump").addEventListener("change", function () { if (this.checked) restart(); });

// The identity at once: the start "Identity", toppled to the end.
byId("show-identity").addEventListener("click", function () {
  if (playing) setPlaying(false);
  byId("start-kind").value = "identity";
  showStartChoice();
  restart(true);
});

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
  byId("speed-label").textContent = speedText(SPEEDS[speedIndex], what, what + "s");
}
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  sendSettings();
});
function showStormRate() {
  const rate = STORM_RATES[stormRateIndex];
  byId("storm-label").textContent = rate === Infinity ? "as fast as possible"
    : rate.toLocaleString() + (rate === 1 ? " grain" : " grains") + " per second";
}
byId("storm-rate").addEventListener("input", function () {
  stormRateIndex = Number(this.value);
  showStormRate();
  sendSettings();
});
byId("storm").addEventListener("change", function () { sendSettings(); drawSoon(); });
byId("storm-wait").addEventListener("change", sendSettings);

// The picture: heights or topples, colors, numbers.
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
byId("set-grains").value = byId("grains-slider").value = DEFAULTS.grains;
byId("set-grains").max = MAX_GRAINS;
byId("grains-slider").max = GRAINS_SLIDER_MAX;
byId("set-most").value = byId("most-slider").value = DEFAULTS.most;
byId("set-full").value = byId("full-slider").value = DEFAULTS.full;
byId("set-most").max = byId("most-slider").max = MAX_HEIGHT_SETTING;
byId("set-full").max = byId("full-slider").max = MAX_HEIGHT_SETTING;
byId("set-value").value = DEFAULTS.value;
byId("set-slope").value = DEFAULTS.slope;
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
byId("storm-rate").max = STORM_RATES.length - 1;
byId("storm-rate").value = stormRateIndex;
showSpeed();
showStormRate();
showStartChoice();
sendSettings();
useBox();
setPlaying(false);   // paused: press Play to watch it topple
