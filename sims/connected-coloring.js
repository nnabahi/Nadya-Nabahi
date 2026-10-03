/* =====================================================================
   connected-coloring.js  —  the page of the "Random connected
   coloring" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, or a custom one drawn
       in the graph tool (shown inside this page). The domain code is
       shared with the other sims, in js/sim-domains.js.
     - Builds a starting coloring: an automatic one (N compact blocks)
       or one you draw yourself.
     - Hands both to the Markov chain (connected-coloring-chain.js),
       which runs in a second thread (a "Web Worker"), and draws every
       coloring it sends back, with the statistics.
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js, and moving and zooming the torus is in
   js/sim-view.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Connected pieces
     4. The automatic start
     5. Running the chain
     6. Drawing the coloring
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain and number of colors.
const DEFAULTS = { width: 24, height: 24, neighbors: 4, colors: 6, seed: "1" };

const MAX_COLORS = 100;           // the most colors allowed
const MAX_SIDE = 100;             // the biggest box or torus is 100 x 100
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // the lines between colors
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const TRACE_LENGTH = 400;         // how many points the "boundary edges" plot keeps

// The speeds on the Speed slider, in moves per second.
// Infinity means "as fast as the computer can". The default is low, so
// you can follow the moves; the Speed slider goes faster.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(10);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";        // "box", "torus" or "custom": the domain in use
let domain = null;             // the domain graph (js/sim-domains.js)
let customDomain = null;       // the last custom domain drawn, if any
let N = DEFAULTS.colors;       // number of colors
let colorNames = [];           // colorNames[c] = how color c is drawn, e.g. "#c74440"
let drawnStart = null;         // your own starting coloring, or null for the automatic one
let startShape = "";           // what the start was: "rectangles", "blocks" or "yours"

let playing = false;           // it starts paused, showing the start; Play sets it going
let speedIndex = DEFAULT_SPEED;
let run = 0;                   // counts restarts, so leftovers from an older run are ignored

// The latest coloring and numbers from the chain.
let colors = null;             // colors[v] = color of cell v
let latest = null;             // { proposed, accepted, boundary, pairs }
let trace = [];                // [moves tried, boundary edges] pairs, for the plot


/* =====================================================================
   3. CONNECTED PIECES
   ---------------------------------------------------------------------
   The domains themselves (boxes, tori and drawn regions) are built by
   js/sim-domains.js, which also describes what a domain object holds.
   ===================================================================== */

// How many connected pieces each color has. pieces[c] for c = 0 .. count-1.
// (A coloring with every color 0 gives the pieces of the whole domain.)
function countPieces(d, colorOf, count) {
  const pieces = new Array(count).fill(0);
  const seen = new Uint8Array(d.n);
  for (let s = 0; s < d.n; s++) {
    if (seen[s]) continue;
    pieces[colorOf[s]]++;
    seen[s] = 1;
    const stack = [s];                    // explore everything joined to s in its color
    while (stack.length > 0) {
      const v = stack.pop();
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (!seen[w] && colorOf[w] === colorOf[v]) { seen[w] = 1; stack.push(w); }
      }
    }
  }
  return pieces;
}


/* =====================================================================
   4. THE AUTOMATIC START
   ---------------------------------------------------------------------
   Like the old site: the domain is cut into a grid of N rectangles,
   in rows, with about the same number in each row, and as many rows as
   makes the rectangles roughly square. (E.g. N = 6 on 24 x 24: 2 rows
   of 3, each rectangle 8 wide and 12 high.) Compact pieces like these
   are a good start: thin stripes would make the chain reject almost
   every move at first.

   A drawn region may not cut into rectangles with each color in one
   piece (think of a ring). Then the start is N compact "blocks" instead
   (blockStart below).
   ===================================================================== */
function automaticStart(d, count) {
  const rectangles = rectangleStart(d, count);
  startShape = rectangles ? "rectangles" : "blocks";
  return rectangles || blockStart(d, count);
}

// The grid of rectangles over the smallest box around the domain, or
// null if some color would be missing or in more than one piece.
function rectangleStart(d, count) {
  const across = d.xmax - d.xmin + 1, down = d.ymax - d.ymin + 1;
  const rows = Math.min(count, down, Math.max(1, Math.round(Math.sqrt(count * down / across))));
  const rowOf = bands(down, rows);              // row of each line of cells, counted from the top
  const columnsOf = [], firstColorOf = [];      // for each row of rectangles
  let color = 0;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.floor(count / rows) + (r < count % rows ? 1 : 0);
    if (inRow > across) return null;            // narrower than the rectangles it needs
    columnsOf.push(bands(across, inRow));
    firstColorOf.push(color);
    color += inRow;
  }
  const colorOf = new Int32Array(d.n);
  for (let v = 0; v < d.n; v++) {
    const r = rowOf[d.ymax - d.y[v]];
    colorOf[v] = firstColorOf[r] + columnsOf[r][d.x[v] - d.xmin];
  }
  const pieces = countPieces(d, colorOf, count);
  return pieces.every(function (p) { return p === 1; }) ? colorOf : null;
}

// Cut 0 .. total-1 into "parts" runs of (almost) equal length:
// band[t] = which run t is in.
function bands(total, parts) {
  const band = new Int32Array(total);
  for (let k = 0; k < parts; k++) {
    for (let t = Math.floor(k * total / parts); t < Math.floor((k + 1) * total / parts); t++) band[t] = k;
  }
  return band;
}

// N compact blocks, for any connected domain. N seed cells are spread
// out: the first is the cell farthest from cell 0, and each next one is
// the cell farthest from all seeds so far ("farthest" = most steps
// through the graph). Then every cell takes the color of its nearest
// seed, found by a breadth-first search from all the seeds at once.
// Each cell is reached through a neighbor of its own color, so every
// color is one connected piece.
function blockStart(d, count) {
  const seeds = [];
  let distance = stepsFrom(d, [0]);   // stepsFrom is in js/sim-domains.js
  for (let k = 0; k < count; k++) {
    let far = 0;
    for (let v = 1; v < d.n; v++) if (distance[v] > distance[far]) far = v;
    seeds.push(far);
    distance = stepsFrom(d, seeds);
  }
  // The search from all seeds at once, handing out colors as it goes.
  const colorOf = new Int32Array(d.n).fill(-1);
  const queue = [];
  seeds.forEach(function (s, c) { colorOf[s] = c; queue.push(s); });
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (colorOf[w] === -1) { colorOf[w] = colorOf[v]; queue.push(w); }
    }
  }
  return colorOf;
}


/* =====================================================================
   5. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is the function chainWorker() in connected-coloring-chain.js.
   startWorker (js/sim-page.js) runs it in a second thread, a "Web
   Worker", so the page never freezes.
   ===================================================================== */
const worker = startWorker(chainWorker);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  colors = message.colors;
  latest = message;
  trace.push([message.proposed, message.boundary]);
  if (trace.length > TRACE_LENGTH) trace.shift();
  drawSoon();
};

worker.onerror = function () {
  showMessage("The chain couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start the chain again from the start coloring, with the current
// domain, N and seed.
function restart() {
  run++;
  if (drawnStart) startShape = "yours";
  colors = drawnStart ? drawnStart.slice() : automaticStart(domain, N);
  trace = [];
  latest = null;
  worker.postMessage({
    type: "setup", run: run,
    n: domain.n, first: domain.first, nbr: domain.nbr,
    colors: colors, N: N, seed: byId("seed").value,
  });
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
  showStartInfo();
  drawSoon();
}

function setPlaying(on) {
  playing = on;
  worker.postMessage(on ? { type: "play", speed: SPEEDS[speedIndex] } : { type: "pause" });
  byId("play").textContent = on ? "Pause" : "Play";
  byId("play").classList.toggle("selected", on);
}


/* =====================================================================
   6. DRAWING THE COLORING
   ---------------------------------------------------------------------
   Each cell is a square in its color, with a dark line along every side
   where two cells of different colors meet, or where the domain ends.

   The "view" (js/sim-view.js) says where the picture goes and which
   squares show; for each one, this finds which cell of the domain is
   there and paints its color. A box simply fills the picture once. A
   torus (or a region drawn on one) wraps around, and can be moved and
   zoomed like a graph in Desmos:
     drag it                          move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   Zoomed out, the torus shows several times side by side.
   ===================================================================== */
let drawPending = false;
const simCanvas = byId("sim-canvas");         // the canvas on the page
const view = makeView(simCanvas, drawSoon);   // where the picture goes, and the torus's zoom

// Draw at the browser's next screen refresh (at most once per refresh,
// however many colorings arrive in between).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawColoring();
    showStats();
  });
}

function drawColoring() {
  if (!domain || !colors || simCanvas.hidden) return;
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);

  // The color on each square that shows (-1 where it isn't the domain).
  const shown = cellsShown(view, domain).map(function (v) { return v === -1 ? -1 : colors[v]; });

  // The squares.
  pen.fillStyle = OUTSIDE;
  pen.fillRect(view.left, 0, view.width, view.height);
  for (let k = 0; k < view.rows; k++) {
    for (let i = 0; i < view.cols; i++) {
      const c = shown[k * view.cols + i];
      if (c === -1) continue;
      const x0 = squareLeft(view, view.firstI + i), x1 = squareLeft(view, view.firstI + i + 1);
      const y0 = squareTop(view, view.firstK + k), y1 = squareTop(view, view.firstK + k + 1);
      pen.fillStyle = colorNames[c];
      pen.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  // The lines between different colors (the outside counts as a color).
  drawBorders(view, pen, shown, BORDER);
}

// Dragging and pinching the torus (js/sim-view.js).
simCanvas.addEventListener("pointerdown", function (event) { pressPointer(view, event); });
simCanvas.addEventListener("pointermove", function (event) { movePointer(view, event); });
simCanvas.addEventListener("pointerup", function (event) { releasePointer(view, event); });
simCanvas.addEventListener("pointercancel", function (event) { releasePointer(view, event); });

window.addEventListener("resize", drawSoon);


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   The table of numbers, and two small charts. The charts get their
   canvas ready, and their colors, from js/sim-page.js.
   ===================================================================== */
function showStats() {
  if (!domain || !colors) return;
  byId("stat-cells").textContent = domain.n;
  byId("stat-colors").textContent = N;
  const s = latest || { proposed: 0, accepted: 0, boundary: "", pairs: "" };
  byId("stat-proposed").textContent = s.proposed.toLocaleString();
  byId("stat-accepted").textContent = s.accepted.toLocaleString() +
    (s.proposed > 0 ? " (" + (100 * s.accepted / s.proposed).toFixed(1) + "%)" : "");
  byId("stat-boundary").textContent = s.boundary;
  byId("stat-pairs").textContent = s.pairs;
  drawSizes();
  drawTrace();
}

// One bar per color, as tall as its number of cells.
function drawSizes() {
  const canvas = byId("sizes-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sizes = new Array(N).fill(0);
  for (let v = 0; v < colors.length; v++) sizes[colors[v]]++;
  const biggest = Math.max(...sizes);
  pen.textBaseline = "top";
  pen.fillText("largest: " + biggest + " cells", 0, 0);
  const top = 16, barWidth = w / N;
  for (let c = 0; c < N; c++) {
    const barHeight = Math.max(1, (h - top) * sizes[c] / biggest);
    pen.fillStyle = colorNames[c];
    pen.fillRect(c * barWidth + 1, h - barHeight, Math.max(1, barWidth - 2), barHeight);
  }
}

// The number of boundary edges against the number of moves tried.
function drawTrace() {
  const canvas = byId("trace-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (trace.length < 2) return;
  const values = trace.map(function (p) { return p[1]; });
  const low = Math.min(...values), high = Math.max(...values);
  const from = trace[0][0], to = trace[trace.length - 1][0];
  const left = 34, top = 6, bottom = h - 6;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(String(high), left - 6, top);
  pen.fillText(String(low), left - 6, bottom);
  pen.beginPath();
  trace.forEach(function (p, k) {
    const sx = left + (w - left) * (p[0] - from) / Math.max(1, to - from);
    const sy = bottom - (bottom - top) * (p[1] - low) / Math.max(1, high - low);
    if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
  });
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page) as graph-tool.html?embed. The tool
   sends a message every time the drawing changes, and this page checks
   it live. Two steps:
     1. Draw the region. It must be one connected piece. Then either
        "Use automatic start" (N compact blocks, as for a box), or
        "Draw my own start".
     2. Color the region. The region is locked in the tool (cells
        outside it can't be painted). Every cell needs a color, and
        each color must be one connected piece; the colors you use
        become the N colors.
   ===================================================================== */
const frame = byId("tool-frame");
let toolStep = 0;          // 0 = tool closed, 1 or 2 = that step
let toolMessage = null;    // the tool's latest drawing: { graph, grid, palette }
let wasPlaying = false;    // to carry on after Cancel

function openTool() {
  wasPlaying = playing;
  if (playing) setPlaying(false);
  simCanvas.hidden = true;
  showZoomButtons(view);
  byId("custom-area").hidden = false;
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  else frame.contentWindow.postMessage({ type: "unlock" }, "*");
  showStep(1);
}

function closeTool() {
  toolStep = 0;
  byId("custom-area").hidden = true;
  simCanvas.hidden = false;
  showZoomButtons(view);
}

function showStep(step) {
  toolStep = step;
  byId("step-title").textContent = step === 1
    ? "Step 1 of 2: draw the region"
    : "Step 2 of 2: color the region";
  byId("step-help").textContent = step === 1
    ? "Paint the cells the coloring lives on (any color counts). The region must be one " +
      "connected piece. Then pick an automatic start, or draw your own."
    : "The rule: every cell needs a color, and each color must be one connected piece. " +
      "Cells outside the region are grayed out. The colors you use become the N colors.";
  for (const button of document.querySelectorAll("[data-step]")) {
    button.hidden = Number(button.dataset.step) !== step;
  }
  checkTool();
}

// The tool sends its drawing every time it changes (js/sim-page.js).
listenToTool(frame, function (drawing) { toolMessage = drawing; checkTool(); });

// Check the drawing live and say what's wrong, if anything. Turns the
// buttons that go on (Use automatic start, Draw my own start, Done) on
// or off.
function checkTool() {
  if (toolStep === 0) return;
  let problem = "", good = "";
  if (!toolMessage) {
    problem = "Loading the drawing tool...";
  } else if (toolStep === 1 && toolMessage.graph.vertices.length === 0) {
    problem = "Paint the region first.";
  } else if (toolStep === 1) {
    const region = drawnDomain(toolMessage.graph, toolMessage.grid);
    const pieces = countPieces(region, new Int32Array(region.n), 1)[0];
    if (region.n < 2) problem = "The region needs at least 2 cells.";
    else if (pieces > 1) problem = "The region is in " + pieces + " pieces; it must be one connected piece.";
    else good = region.n + " cells in one connected piece.";
  } else {
    const start = drawnColoring();
    if (start.uncolored > 0) {
      problem = start.uncolored + (start.uncolored === 1 ? " cell has" : " cells have") + " no color yet.";
    } else if (start.used.length < 2) {
      problem = "Use at least 2 colors.";
    } else if (start.used.length > MAX_COLORS) {
      problem = "At most " + MAX_COLORS + " colors, please.";
    } else {
      const pieces = countPieces(customDomain, start.colorOf, start.used.length);
      const broken = [];
      pieces.forEach(function (count, c) {
        if (count > 1) broken.push("color " + start.used[c] + " is in " + count + " pieces");
      });
      if (broken.length > 0) problem = "Each color must be one connected piece: " + broken.join(", ") + ".";
      else good = start.used.length + " colors, each one connected piece.";
    }
  }
  showToolStatus(problem, good, ["use-auto", "draw-own", "tool-done"]);
}

// Your drawn coloring of customDomain, read from the tool. The tool
// numbers colors by palette square (1, 2, ...); the chain wants
// 0 .. N-1, so the colors used are renumbered in order.
//   used[c] = the tool's number of color c;  colorOf[v] = c (or -1)
function drawnColoring() {
  const toolColor = new Map();
  for (const v of toolMessage.graph.vertices) toolColor.set(v.id, v.color);
  const used = [...new Set(toolColor.values())].sort(function (a, b) { return a - b; });
  const colorOf = new Int32Array(customDomain.n);
  let uncolored = 0;
  customDomain.ids.forEach(function (id, v) {
    if (toolColor.has(id)) colorOf[v] = used.indexOf(toolColor.get(id));
    else { colorOf[v] = -1; uncolored++; }
  });
  return { used: used, colorOf: colorOf, uncolored: uncolored };
}

// Step 1 -> "Use automatic start": the region, with the automatic start.
// (It carries on running only if it was running before the tool opened.)
byId("use-auto").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  closeTool();
  useDomain("custom", customDomain, null, null);
  if (wasPlaying) setPlaying(true);
});

// Step 1 -> "Draw my own start": lock the region and go to step 2.
byId("draw-own").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  frame.contentWindow.postMessage({ type: "lock" }, "*");
  showStep(2);
});

// Step 2 -> "Back to the region".
byId("tool-back").addEventListener("click", function () {
  frame.contentWindow.postMessage({ type: "unlock" }, "*");
  showStep(1);
});

// Step 2 -> "Done": start from your coloring, in the tool's colors.
byId("tool-done").addEventListener("click", function () {
  const start = drawnColoring();
  const names = start.used.map(function (c) { return toolMessage.palette[c]; });
  closeTool();
  useDomain("custom", customDomain, start.colorOf, names);
  if (wasPlaying) setPlaying(true);
});

// Cancel: back to whatever was running before.
for (const button of document.querySelectorAll(".tool-cancel")) {
  button.addEventListener("click", function () {
    closeTool();
    showDomainChoice();
    drawSoon();
    if (wasPlaying) setPlaying(true);
  });
}


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain and restart. "start" is your own coloring
// (with "names", its colors) or null for the automatic start.
function useDomain(kind, d, start, names) {
  domainKind = kind;
  domain = d;
  drawnStart = start;
  const most = Math.min(MAX_COLORS, domain.n);
  N = start ? names.length : Math.min(Math.max(N, 2), most);
  colorNames = start ? names : [];
  for (let c = colorNames.length; c < N; c++) colorNames.push(defaultColor(c, N));
  useTorus(view, Boolean(domain.wrap));   // moving and zooming only on a torus (js/sim-view.js)
  byId("set-colors").max = byId("colors-slider").max = most;
  byId("set-colors").value = byId("colors-slider").value = N;
  showDomainChoice();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  const toolWasOpen = (toolStep !== 0);
  if (toolWasOpen) closeTool();
  const width = readWhole("set-width", 2, MAX_SIDE, DEFAULTS.width);
  const height = readWhole("set-height", 2, MAX_SIDE, DEFAULTS.height);
  const neighbors = Number(byId("set-neighbors").value);
  const torus = (checked("domain") === "torus");
  useDomain(torus ? "torus" : "box", boxDomain(width, height, neighbors, torus), null, null);
  if (toolWasOpen && wasPlaying) setPlaying(true);
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
}

function showStartInfo() {
  byId("start-info").textContent =
    startShape === "yours" ? "Starting from your own coloring. Changing N switches to the automatic start." :
    startShape === "rectangles" ? "Starting from a grid of " + N + " rectangles." :
    "Starting from " + N + " compact blocks (this region can't be cut into a grid of rectangles " +
    "with each color in one piece).";
}

// Domain: Box / Torus / Custom.
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

// N: the slider and the number box move together, and the chain restarts
// live while you drag, like a Desmos slider.
function setColorCount(value) {
  N = Math.min(Math.max(Math.round(value) || 2, 2), Math.min(MAX_COLORS, domain.n));
  useDomain(domainKind, domain, null, null);   // a new N always uses the automatic start
}
byId("colors-slider").addEventListener("input", function () { setColorCount(Number(this.value)); });
byId("set-colors").addEventListener("change", function () { setColorCount(Number(this.value)); });

// Play / Pause, Step, Restart.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "step" });
});
byId("restart").addEventListener("click", restart);

// Speed.
function showSpeed() {
  const speed = SPEEDS[speedIndex];
  byId("speed-label").textContent = speed === Infinity
    ? "as fast as possible"
    : speed + (speed === 1 ? " move" : " moves") + " per second";
}
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
});

// Seed: the same seed gives the same run every time.
byId("seed").addEventListener("change", restart);
byId("new-seed").addEventListener("click", function () {
  byId("seed").value = String(Math.floor(Math.random() * 100000));
  restart();
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
useBox();
setPlaying(false);   // paused: press Play to start
