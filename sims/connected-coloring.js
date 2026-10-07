/* =====================================================================
   connected-coloring.js  —  the page of the "Random connected
   coloring" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, a custom one drawn
       in the graph tool (shown inside this page), or a ball of a
       hyperbolic tiling or a tree. The domain code is shared with the
       other sims: the domains (and counting their connected pieces) in
       js/sim-domains.js, their options and the graph tool in
       js/sim-controls.js, and the hyperbolic tilings and trees, and
       their pictures, in js/sim-graphs.js and js/sim-hyperbolic.js.
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
     3. The automatic start
     4. Running the chain
     5. Drawing the coloring (and 5b, highlighting one color)
     6. Statistics
     7. Custom domains: the graph tool inside this page
     8. Connecting the buttons on the page
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
const TRACE_POINTS = 4000;        // the most points the "boundary edges" chart keeps (section 6)
// With one color highlighted, every other color is mixed with this much
// white (0 = unchanged, 1 = white), so the highlighted region stands out.
const FADE = 0.8;

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 5, most: 20, cells: 20000 };

// The speeds on the Speed slider, in moves per second.
// Infinity means "as fast as the computer can". The default is low, so
// you can follow the moves; the Speed slider goes faster.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(10);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";        // "box", "torus", "custom" or "graph": the domain in use
let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
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
let trace = [];                // [moves tried, boundary edges] pairs, for the chart
let traceEvery = 1;            // the chart keeps one message in this many (section 6)
let messages = 0;              // messages from the chain in this run
let highlighted = -1;          // the color shown highlighted, or -1 for none (section 5b)


/* =====================================================================
   3. THE AUTOMATIC START
   ---------------------------------------------------------------------
   Like the old site: the domain is cut into a grid of N rectangles,
   in rows, with about the same number in each row, and as many rows as
   makes the rectangles roughly square. (E.g. N = 6 on 24 x 24: 2 rows
   of 3, each rectangle 8 wide and 12 high.) Compact pieces like these
   are a good start: thin stripes would make the chain reject almost
   every move at first.

   A drawn region may not cut into rectangles with each color in one
   piece (think of a ring). Then the start is N compact "blocks" instead
   (blockStart below). So is a ball of a hyperbolic tiling or a tree,
   which has no rows and columns.
   ===================================================================== */
function automaticStart(d, count) {
  if (domainKind === "graph") { startShape = "blocks"; return blockStart(d, count); }
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
   4. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is the function chainWorker() in connected-coloring-chain.js,
   with the run loop (js/sim-worker.js) copied in. startWorker
   (js/sim-page.js) runs it in a second thread, a "Web Worker", so the
   page never freezes.
   ===================================================================== */
const worker = startWorker(chainWorker, [makeRunLoop]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  colors = message.colors;
  latest = message;
  keepForChart(message);
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
  traceEvery = 1;
  messages = 0;
  traceZoom.from = traceZoom.to = null;   // the chart shows the whole new run
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
  showPlaying(on);
}


/* =====================================================================
   5. DRAWING THE COLORING
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

   A ball of a hyperbolic tiling or a tree is drawn by
   js/sim-hyperbolic.js instead: in the disk or the half-plane (drag to
   move around the plane), or, for a tree, spread out in rings, with the
   rest of the tiling in thin gray (drawOnGraph below).
   ===================================================================== */
const simCanvas = byId("sim-canvas");         // the canvas on the page

// Draw at the browser's next screen refresh (at most once per refresh,
// however many colorings arrive in between).
const drawSoon = oncePerFrame(function () { drawColoring(); showStats(); });

const view = makeView(simCanvas, drawSoon);   // where the picture goes, and the torus's zoom

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, showDomainChoice);

function drawColoring() {
  if (!domain || !colors || simCanvas.hidden) return;
  if (domainKind === "graph") { drawOnGraph(); return; }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);

  // The color on each square that shows (-1 where it isn't the domain).
  const shown = cellsShown(view, domain).map(function (v) { return v === -1 ? -1 : colors[v]; });

  // The squares. With a color highlighted, the others are faded.
  const paint = colorNames.map(function (name, c) { return shade(c); });
  pen.fillStyle = OUTSIDE;
  pen.fillRect(view.left, 0, view.width, view.height);
  for (let k = 0; k < view.rows; k++) {
    for (let i = 0; i < view.cols; i++) {
      const c = shown[k * view.cols + i];
      if (c === -1) continue;
      const x0 = squareLeft(view, view.firstI + i), x1 = squareLeft(view, view.firstI + i + 1);
      const y0 = squareTop(view, view.firstK + k), y1 = squareTop(view, view.firstK + k + 1);
      pen.fillStyle = paint[c];
      pen.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  // The lines between different colors (the outside counts as a color).
  drawBorders(view, pen, shown, BORDER);
}

// Hyperbolic plane or tree: the ball's cells in their colors, with the
// rest of the tiling (or tree) in thin gray, and on a tiling the lines
// between different colors (js/sim-hyperbolic.js).
function drawOnGraph() {
  const height = pictureHeight(BALL_HEIGHT);
  const paint = colorNames.map(function (name, c) { return shade(c); });
  const colorOf = function (v) { return paint[colors[v]]; };
  if (disk.picture === "spread") {
    drawSpreadTree(disk, height, domain.n,
      function (v) { return domain.depth[v]; }, function (v) { return domain.angle[v]; }, colorOf);
    return;
  }
  const pen = diskPen(disk, height);
  drawDiskFrame(disk, pen, height, OUTSIDE, UNDER_COLOR);
  drawOnDisk(disk, pen, diskGraph(disk), domain.n, function (v) { return ballPlace(domain, v); }, colorOf);
  drawBallBorders(disk, pen, domain, function (v) { return colors[v]; }, BORDER);
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   5b. HIGHLIGHTING ONE COLOR
   ---------------------------------------------------------------------
   Click a cell in the picture (or a bar in the "Size of each color"
   chart) to highlight its color: every other color fades, so the whole
   region of that color is easy to see, even where it winds around.
   Clicking the same color again, or outside the cells, shows every
   color again. The highlight stays on while the chain runs.

   A press that barely moves is a click; one that moves further drags
   the picture, as before (connectPicture, js/sim-controls.js). On a
   hyperbolic tiling or tree, one pointer drags across the plane, and
   two fingers slide and zoom the picture.
   ===================================================================== */

// How color c is painted: its own color, or faded if another color is
// highlighted.
function shade(c) {
  if (highlighted === -1 || c === highlighted) return colorNames[c];
  return rgbToHex(hexToRGB(colorNames[c]).map(function (t) { return t + (255 - t) * FADE; }));
}

// Highlight color c (-1: none), or turn it off if it is already on.
function highlight(c) {
  highlighted = (c === highlighted) ? -1 : c;
  showHighlightInfo();
  drawSoon();
}

// The line under the picture: how to highlight, or what is highlighted.
function showHighlightInfo() {
  if (highlighted >= N) highlighted = -1;       // fewer colors now
  const line = byId("highlight-info");
  if (highlighted === -1 || !colors) {
    line.textContent = "Click a color in the picture, or its bar under Statistics, to highlight it.";
    return;
  }
  let cells = 0;
  for (let v = 0; v < colors.length; v++) if (colors[v] === highlighted) cells++;
  line.textContent = "Highlighted: color " + (highlighted + 1) + ", " + cells + " cells. " +
    (domainKind === "graph" ? "Click it again to show every color."
                            : "Click it again, or outside the cells, to show every color.");
}

// Dragging, zooming and clicking the picture: a click highlights the
// color under it.
connectPicture(view, disk, function () { return domainKind === "graph"; }, function (event) {
  if (!colors) return;
  const v = domainKind === "graph" ? ballCellUnder(disk, domain, event)
                                   : cellUnder(view, domain, pointerSpot(view, event));
  if (v === -1) { if (highlighted !== -1) highlight(-1); }   // outside the cells: show every color
  else highlight(colors[v]);
});


/* =====================================================================
   6. STATISTICS
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
  showHighlightInfo();
  drawSizes();
  drawTrace();
}

// The number of cells of each color.
function colorSizes() {
  const sizes = new Array(N).fill(0);
  for (let v = 0; v < colors.length; v++) sizes[colors[v]]++;
  return sizes;
}

// The colors from the largest to the smallest (ties: the lower color
// number first). This is the order of the bars in the chart.
function largestFirst(sizes) {
  const order = sizes.map(function (size, c) { return c; });
  order.sort(function (a, b) { return sizes[b] - sizes[a] || a - b; });
  return order;
}

// One bar per color, as tall as its number of cells, largest first.
function drawSizes() {
  const canvas = byId("sizes-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sizes = colorSizes();
  const biggest = Math.max(...sizes);
  pen.textBaseline = "top";
  pen.fillText("largest: " + biggest + " cells", 0, 0);
  // The bars go from the largest on the left to the smallest on the
  // right; each keeps its own color, so you can follow a color as it
  // grows and shrinks. A highlighted color's bar stays bright.
  const top = 16, barWidth = w / N;
  largestFirst(sizes).forEach(function (c, place) {
    const barHeight = Math.max(1, (h - top) * sizes[c] / biggest);
    pen.fillStyle = shade(c);
    pen.fillRect(place * barWidth + 1, h - barHeight, Math.max(1, barWidth - 2), barHeight);
  });
}

// Clicking a bar highlights its color (section 5b).
byId("sizes-chart").addEventListener("click", function (event) {
  if (!colors) return;
  const box = this.getBoundingClientRect();
  const place = Math.floor((event.clientX - box.left) / (box.width / N));
  const order = largestFirst(colorSizes());
  if (place >= 0 && place < N) highlight(order[place]);
});

// The "boundary edges" chart keeps the whole run. Each message from the
// chain is one point; when there are TRACE_POINTS of them, every other
// point is dropped and from then on only one message in twice as many
// is kept. So the points stay evenly spread over the whole run, however
// long it gets.
function keepForChart(message) {
  messages++;
  if ((messages - 1) % traceEvery !== 0) return;
  trace.push([message.proposed, message.boundary]);
  if (trace.length >= TRACE_POINTS) {
    trace = trace.filter(function (p, k) { return k % 2 === 0; });
    traceEvery *= 2;
  }
}

// The number of boundary edges against the number of moves tried. It
// shows the whole run, rescaled to fit as the run goes on; zoom in with
// the mouse wheel or a pinch, drag to move along, and double-click to
// see the whole run again (chartZoom, js/sim-page.js).
const traceZoom = chartZoom(byId("trace-chart"), drawTrace);

function drawTrace() {
  const canvas = byId("trace-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (trace.length < 2) return;
  const [from, to] = shownTimes(traceZoom, trace[0][0], trace[trace.length - 1][0]);

  // The points in the stretch shown, plus one on each side, so the line
  // runs all the way to both edges. The numbers on the left are the
  // lowest and highest of these points.
  let firstK = 0, lastK = trace.length - 1;
  while (firstK + 1 < trace.length && trace[firstK + 1][0] <= from) firstK++;
  while (lastK - 1 >= 0 && trace[lastK - 1][0] >= to) lastK--;
  const points = trace.slice(firstK, lastK + 1);
  let low = Infinity, high = -Infinity;
  for (const p of points) { low = Math.min(low, p[1]); high = Math.max(high, p[1]); }

  const left = 40, top = 6, bottom = h - 16;
  traceZoom.left = left;
  traceZoom.right = w;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(String(high), left - 6, top);
  pen.fillText(String(low), left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText("moves " + Math.round(to).toLocaleString(), w, h);
  pen.textAlign = "left";
  pen.fillText(Math.round(from).toLocaleString(), left, h);

  pen.save();
  pen.beginPath();
  pen.rect(left, 0, w - left, bottom + 1);
  pen.clip();                                   // keep the line off the numbers
  pen.beginPath();
  points.forEach(function (p, k) {
    const sx = left + (w - left) * (p[0] - from) / Math.max(1e-9, to - from);
    const sy = bottom - (bottom - top) * (p[1] - low) / Math.max(1, high - low);
    if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
  });
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
  pen.restore();
}


/* =====================================================================
   7. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page): makeCustomTool, in
   js/sim-controls.js. This page checks the drawing live. Two steps:
     1. Draw the region. It must be one connected piece. Then either
        "Use automatic start" (N compact blocks, as for a box), or
        "Draw my own start".
     2. Color the region. The region is locked in the tool (cells
        outside it can't be painted). Every cell needs a color, and
        each color must be one connected piece; the colors you use
        become the N colors.
   ===================================================================== */
let toolStep = 1;          // the tool's step, 1 or 2

// Show step 1 or 2: its title, its help, and its buttons. (Check the
// drawing again afterwards, with tool.check().)
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
}

// What's wrong with the drawing, if anything, as [problem, good]. The
// buttons that go on (Use automatic start, Draw my own start, Done)
// work only when there is no problem.
function checkDrawing(drawing) {
  if (toolStep === 1) {
    if (drawing.graph.vertices.length === 0) return ["Paint the region first.", ""];
    const region = drawnDomain(drawing.graph, drawing.grid);
    const pieces = countPieces(region, new Int32Array(region.n), 1)[0];
    if (region.n < 2) return ["The region needs at least 2 cells.", ""];
    if (pieces > 1) return ["The region is in " + pieces + " pieces; it must be one connected piece.", ""];
    return ["", region.n + " cells in one connected piece."];
  }
  const start = drawnColoring();
  if (start.uncolored > 0) {
    return [start.uncolored + (start.uncolored === 1 ? " cell has" : " cells have") + " no color yet.", ""];
  }
  if (start.used.length < 2) return ["Use at least 2 colors.", ""];
  if (start.used.length > MAX_COLORS) return ["At most " + MAX_COLORS + " colors, please.", ""];
  const pieces = countPieces(customDomain, start.colorOf, start.used.length);
  const broken = [];
  pieces.forEach(function (count, c) {
    if (count > 1) broken.push("color " + start.used[c] + " is in " + count + " pieces");
  });
  if (broken.length > 0) return ["Each color must be one connected piece: " + broken.join(", ") + ".", ""];
  return ["", start.used.length + " colors, each one connected piece."];
}

// Step 2 -> "Done": start from your coloring, in the tool's colors. It
// carries on running only if it was running before the tool opened.
// Cancel: back to whatever was running before.
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return playing; },
  setPlaying: setPlaying,
  onOpen: function () { showStep(1); },
  buttons: ["use-auto", "draw-own", "tool-done"],
  check: checkDrawing,
  done: function (drawing) {
    const start = drawnColoring();
    const names = start.used.map(function (c) { return drawing.palette[c]; });
    useDomain("custom", customDomain, start.colorOf, names);
    tool.carryOn();
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
});

// Your drawn coloring of customDomain, read from the tool. The tool
// numbers colors by palette square (1, 2, ...); the chain wants
// 0 .. N-1, so the colors used are renumbered in order.
//   used[c] = the tool's number of color c;  colorOf[v] = c (or -1)
function drawnColoring() {
  const toolColor = new Map();
  for (const v of tool.drawing.graph.vertices) toolColor.set(v.id, v.color);
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
  customDomain = drawnDomain(tool.drawing.graph, tool.drawing.grid);
  tool.close();
  useDomain("custom", customDomain, null, null);
  tool.carryOn();
});

// Step 1 -> "Draw my own start": lock the region and go to step 2.
byId("draw-own").addEventListener("click", function () {
  customDomain = drawnDomain(tool.drawing.graph, tool.drawing.grid);
  tool.frame.contentWindow.postMessage({ type: "lock" }, "*");
  showStep(2);
  tool.check();
});

// Step 2 -> "Back to the region".
byId("tool-back").addEventListener("click", function () {
  tool.frame.contentWindow.postMessage({ type: "unlock" }, "*");
  showStep(1);
  tool.check();
});


/* =====================================================================
   8. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain and restart. "start" is your own coloring
// (with "names", its colors) or null for the automatic start.
function useDomain(kind, d, start, names) {
  domainKind = kind;
  domain = d;
  drawnStart = start;
  highlighted = -1;                       // a new domain starts with every color shown
  const most = Math.min(MAX_COLORS, domain.n);
  N = start ? names.length : Math.min(Math.max(N, 2), most);
  colorNames = start ? names : [];
  for (let c = colorNames.length; c < N; c++) colorNames.push(defaultColor(c, N));
  useTorus(view, Boolean(domain.wrap));   // moving and zooming; zooming out past the whole picture only on a torus (js/sim-view.js)
  byId("set-colors").max = byId("colors-slider").max = most;
  byId("set-colors").value = byId("colors-slider").value = N;
  showDomainChoice();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
// (Choosing one while the graph tool is open closes it, and carries on
// running if it was running before the tool opened.)
function useBox() {
  const toolWasOpen = tool.isOpen;
  if (toolWasOpen) tool.close();
  const d = boxFromOptions(2, MAX_SIDE, DEFAULTS);
  useDomain(d.wrap ? "torus" : "box", d, null, null);
  if (toolWasOpen) tool.carryOn();
}

// A ball of a hyperbolic tiling or a tree, from the options on the
// page (ballFromOptions, js/sim-hyperbolic.js), with the start cell in
// the middle of the picture.
function useGraph() {
  const toolWasOpen = tool.isOpen;
  if (toolWasOpen) tool.close();
  const ball = ballFromOptions(disk, BALL);
  if (ball === null) { showDomainChoice(); return; }
  useDomain("graph", ball, null, null);
  if (toolWasOpen) tool.carryOn();
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
}

function showStartInfo() {
  byId("start-info").textContent =
    startShape === "yours" ? "Starting from your own coloring. Changing N switches to the automatic start." :
    startShape === "rectangles" ? "Starting from a grid of " + N + " rectangles." :
    domainKind === "graph" ? "Starting from " + N + " compact blocks around spread-out cells." :
    "Starting from " + N + " compact blocks (this region can't be cut into a grid of rectangles " +
    "with each color in one piece).";
}

// Domain: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

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
function showSpeed() { byId("speed-label").textContent = speedText(SPEEDS[speedIndex], "move", "moves"); }
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
});

// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
useBox();
setPlaying(false);   // paused: press Play to start
