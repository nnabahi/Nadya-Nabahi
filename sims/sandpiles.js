/* =====================================================================
   sandpiles.js  —  the page of the "Sandpiles" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the table: a box or torus of cells, or a custom one drawn
       in the graph tool (shown inside this page). The domain code is
       shared with the other sims, in js/sim-domains.js.
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
const CLICK_DISTANCE = 4;         // a press that moves less than this (pixels) is a click, not a drag

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

let domainKind = "box";         // "box", "torus" or "custom": the table in use
let domain = null;              // the table's graph (js/sim-domains.js)
let neighbors = 4;              // 4 or 8: also the number of grains that makes a cell topple
let sinks = [];                 // the sink cell, if any (a list of 0 or 1 cells)
let customDomain = null;        // the last custom domain drawn, if any
let customNeighbors = 4;        // the graph tool's neighbors for it

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
   nadya's own colors, from her Sandpiles.js. Two ways to use them:
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

// The color of each height 0 .. top (top = the threshold), as [r, g, b].
// Heights above top use the color of top. The colors are mixed in hue,
// saturation and brightness with hexToHSV and hsvToHex, and turned into
// [r, g, b] with hexToRGB (all three in js/sim-domains.js).
let heightRGB = [];
function makeHeightColors() {
  const top = neighbors;
  heightRGB = [];
  for (let h = 0; h <= Math.max(top, HEIGHT_COLORS.length - 1); h++) {
    if (byId("palette").value === "list") {
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
function colorOfHeight(h) { return heightRGB[Math.min(h, heightRGB.length - 1)]; }

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
  byId("play").textContent = on ? "Pause" : "Play";
  byId("play").classList.toggle("selected", on);
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

   The squares' colors go into a small image, one pixel per square,
   which is then blown up with smoothing off so the squares stay crisp.
   ===================================================================== */
let drawPending = false;
const tiny = document.createElement("canvas");   // one pixel per square that shows
const simCanvas = byId("sim-canvas");            // the canvas on the page

// Where the picture goes, and the torus's zoom (js/sim-view.js). Cells
// of 4 pixels or more get a whole number of pixels each, so every cell
// is exactly the same size.
const view = makeView(simCanvas, drawSoon, PAD, 4);

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawPile();
    showStats();
  });
}

function drawPile() {
  if (!domain || !latest || simCanvas.hidden) return;
  const d = domain, heights = latest.heights, odometer = latest.odometer;
  const showTopples = checked("show") === "topples";
  let mostTopples = 0;
  if (showTopples) for (let v = 0; v < d.n; v++) mostTopples = Math.max(mostTopples, odometer[v]);

  // The picture's box: as big as fits the width (and at most
  // MAX_PICTURE_HEIGHT tall), in the middle of the canvas. Then the cell
  // on each square that shows, row by row from the top: view.cols x
  // view.rows squares, each view.cell pixels big.
  const screen = fitPicture(view, d, MAX_PICTURE_HEIGHT);
  const cellOf = cellsShown(view, d);
  const cols = view.cols, rows = view.rows, size = view.cell;

  // The color of each square that shows, in the small image (row 0 of
  // the image is the top row of squares).
  tiny.width = cols;
  tiny.height = rows;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(cols, rows);
  const pixels = image.data;                  // 4 numbers per pixel: red, green, blue, opacity
  const outside = hexToRGB(OUTSIDE), sinkColor = hexToRGB(SINK);
  for (let p = 0; p < cols * rows; p++) {
    const v = cellOf[p];
    const rgb = v === -1 ? outside
      : sinks.includes(v) ? sinkColor
      : showTopples ? colorOfTopples(odometer[v], mostTopples)
      : colorOfHeight(heights[v]);
    pixels[4 * p] = rgb[0]; pixels[4 * p + 1] = rgb[1]; pixels[4 * p + 2] = rgb[2];
    pixels[4 * p + 3] = 255;
  }
  tinyPen.putImageData(image, 0, 0);
  screen.imageSmoothingEnabled = false;
  screen.drawImage(tiny, squareLeft(view, view.firstI), squareTop(view, view.firstK), cols * size, rows * size);

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
        if (v === -1) continue;
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

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. CLICKING, DRAGGING AND ZOOMING
   ---------------------------------------------------------------------
   A click on a cell adds a grain, removes one, or shows the cell's
   numbers (the "Clicking a cell" options, as in nadya's Sandpiles.js).
   On a torus the picture can also be moved and zoomed, as in the
   coloring sims (and like a graph in Desmos). js/sim-view.js does that:
     drag                             move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   A press that hardly moves counts as a click, a longer one as a drag.
   "Pointer" events cover the mouse, a pen and fingers alike.
   ===================================================================== */
const pressed = new Set();    // the pointers pressed on the picture (their ids)
let pressedAt = null;         // where the first of them went down, to tell a click from a drag
let dragged = false;          // true once it moved too far (or two fingers came down): not a click

// On phones, let a finger drag on the picture instead of scrolling the page.
simCanvas.style.touchAction = "none";

// A click on a cell.
function clickCell(v) {
  if (v === -1 || !latest) return;
  const mode = checked("click");
  if (sinks.includes(v)) {
    showMessage("This is the sink cell: it eats every grain it gets.");
  } else if (mode === "info") {
    showMessage("Cell (" + domain.x[v] + ", " + domain.y[v] + "): " + latest.heights[v] + " grains, toppled " +
                latest.odometer[v].toLocaleString() + " times so far.");
  } else {
    worker.postMessage({ type: "add", cell: v, grains: mode === "add" ? 1 : -1 });
  }
}

simCanvas.addEventListener("pointerdown", function (event) {
  if (pressed.size === 0) { pressedAt = { x: event.clientX, y: event.clientY }; dragged = false; }
  pressed.add(event.pointerId);
  if (pressed.size > 1) dragged = true;           // two fingers: a pinch, not a click
  simCanvas.setPointerCapture(event.pointerId);   // keep getting moves even off the canvas
  pressPointer(view, event);                      // on a torus: drag and pinch (js/sim-view.js)
});

simCanvas.addEventListener("pointermove", function (event) {
  simCanvas.style.cursor = view.torus ? (pressed.size > 0 ? "grabbing" : "grab") : "pointer";
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

// The avalanche sizes, grouped by powers of 2; the bars' heights are on
// a logarithmic scale, so a power law shows as bars falling evenly.
function drawAvalancheChart() {
  const canvas = byId("avalanche-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const bins = latest.avalancheBins;
  byId("avalanche-info").textContent = latest.avalancheCount === 0
    ? "Tick the storm (with \"Wait until stable\") and press Play to collect avalanches."
    : latest.avalancheCount.toLocaleString() + " avalanches so far. Each bar counts the avalanches of " +
      "that many topples (the label is the smallest size in the bar); the heights are on a log scale.";
  if (bins.length === 0) return;
  const most = Math.max(...bins);
  const top = 14, bottom = h - 14, barWidth = w / bins.length;
  const logMost = Math.log10(most + 1);
  pen.textBaseline = "top";
  pen.fillText("most: " + most.toLocaleString(), 0, 0);
  pen.textAlign = "center";
  bins.forEach(function (count, b) {
    const barHeight = count === 0 ? 0 : Math.max(1, (bottom - top) * Math.log10(count + 1) / logMost);
    pen.fillStyle = CHART_LINE;
    pen.fillRect(b * barWidth + 1, bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
    pen.fillStyle = CHART_TEXT;
    pen.fillText(b === 0 ? "0" : String(2 ** (b - 1)), (b + 0.5) * barWidth, bottom + 2);
  });
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page) as graph-tool.html?embed. The tool
   sends a message every time the drawing changes. Any painted region
   works, even in several pieces: every piece loses grains off its edge.
   (A region covering a whole torus has no edge; then the sink options
   appear, as for the torus.) Done uses it.
   ===================================================================== */
const frame = byId("tool-frame");
let toolOpen = false;
let toolMessage = null;    // the tool's latest drawing: { graph, grid, palette }
let wasPlaying = false;    // to carry on after Cancel

function openTool() {
  wasPlaying = playing;
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

// The tool sends its drawing every time it changes (js/sim-page.js).
listenToTool(frame, function (drawing) { toolMessage = drawing; checkTool(); });

// Check the drawing live and say what's wrong, if anything.
function checkTool() {
  if (!toolOpen) return;
  let problem = "", good = "";
  if (!toolMessage) problem = "Loading the drawing tool...";
  else if (toolMessage.graph.vertices.length === 0) problem = "Paint the table first.";
  else good = toolMessage.graph.vertices.length + " cells, " + toolMessage.grid.neighbors + " neighbors.";
  showToolStatus(problem, good);
}

byId("tool-done").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  customNeighbors = toolMessage.grid.neighbors;
  closeTool();
  useDomain("custom", customDomain, customNeighbors);
});

// Cancel: back to whatever was there before.
byId("tool-cancel").addEventListener("click", function () {
  closeTool();
  showDomainChoice();
  drawSoon();
  if (wasPlaying) setPlaying(true);
});


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new table and restart.
function useDomain(kind, d, n) {
  domainKind = kind;
  domain = d;
  neighbors = n;
  useTorus(view, Boolean(d.wrap));   // moving and zooming only on a torus (js/sim-view.js)
  makeHeightColors();
  showDomainChoice();
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
  if (toolOpen) closeTool();
  const torus = (checked("domain") === "torus");
  const least = torus ? MIN_TORUS : 1;
  const width = readWhole("set-width", least, MAX_SIDE, DEFAULTS.width);
  const height = readWhole("set-height", least, MAX_SIDE, DEFAULTS.height);
  const n = Number(byId("set-neighbors").value);
  useDomain(torus ? "torus" : "box", boxDomain(width, height, n, torus), n);
}

// Show the options that fit the table in use, and tick its radio button.
function showDomainChoice() {
  document.querySelector('input[name="domain"][value="' + domainKind + '"]').checked = true;
  const custom = (domainKind === "custom");
  byId("size-row").hidden = byId("neighbors-row").hidden = custom;
  byId("custom-row").hidden = !custom;
  byId("sink-row").hidden = !(domain && domain.wrap);
  if (custom && customDomain) {
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
function showStartChoice() {
  const kind = byId("start-kind").value;
  byId("grains-row").hidden = kind !== "center";
  byId("most-row").hidden = kind !== "random";
  byId("full-row").hidden = kind !== "full";
  byId("linear-row").hidden = kind !== "linear";
  byId("start-help").textContent = START_HELP[kind];
}

// Table: Box / Torus / Custom.
for (const radio of document.querySelectorAll('input[name="domain"]')) {
  radio.addEventListener("change", function () {
    if (radio.value === "custom") openTool();
    else useBox();
  });
}
for (const id of ["set-width", "set-height", "set-neighbors"]) {
  byId(id).addEventListener("change", useBox);
}
byId("edit-custom").addEventListener("click", openTool);
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
  const speed = SPEEDS[speedIndex], what = checked("order") === "rounds" ? "round" : "topple";
  byId("speed-label").textContent = speed === Infinity ? "as fast as possible"
    : speed.toLocaleString() + " " + what + (speed === 1 ? "" : "s") + " per second";
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
byId("seed").addEventListener("change", function () { restart(); });
byId("new-seed").addEventListener("click", function () {
  byId("seed").value = String(Math.floor(Math.random() * 100000));
  restart();
});


// --- Start ------------------------------------------------------------
byId("set-width").value = DEFAULTS.width;
byId("set-height").value = DEFAULTS.height;
byId("set-width").max = byId("set-height").max = MAX_SIDE;
byId("set-neighbors").value = String(DEFAULTS.neighbors);
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
