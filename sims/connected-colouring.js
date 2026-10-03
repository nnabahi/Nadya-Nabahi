/* =====================================================================
   connected-colouring.js  —  the page of the "Random connected
   colouring" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, or a custom one drawn
       in the graph tool (shown inside this page).
     - Builds a starting colouring: an automatic one (N compact blocks)
       or one you draw yourself.
     - Hands both to the Markov chain (connected-colouring-chain.js),
       which runs in a second thread (a "Web Worker"), and draws every
       colouring it sends back, with the statistics.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Domains: boxes, tori, and drawn ones
     4. The automatic start
     5. Running the chain
     6. Drawing the colouring
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain and number of colours.
const DEFAULTS = { width: 24, height: 24, neighbours: 4, colours: 6, seed: "1" };

// The colours, in order: the same 14 as the graph tool's palette. More
// colours than that are made up by turning around the colour wheel.
const PALETTE = [
  "#c74440", "#fa7e19", "#e0b000", "#388c46", "#1fa3a3", "#2d70b3", "#6042a6",
  "#d64ca0", "#7a5230", "#9ad13b", "#5bb3e6", "#a58fd6", "#8a8a8a", "#000000",
];

const MAX_COLOURS = 100;      // the most colours allowed
const MAX_SIDE = 100;         // the biggest box or torus is 100 x 100
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";     // the lines between colours
const OUTSIDE = "#ecebe7";    // around a custom domain (cells not in it)
const TRACE_LENGTH = 400;     // how many points the "boundary edges" plot keeps

// The speeds on the Speed slider, in moves per second.
// Infinity means "as fast as the computer can".
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_SPEED = SPEEDS.length - 1;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";    // "box", "torus" or "custom": the domain in use
let domain = null;         // the domain graph (section 3)
let customDomain = null;   // the last custom domain drawn, if any
let N = DEFAULTS.colours;  // number of colours
let colourNames = [];      // colourNames[c] = how colour c is drawn, e.g. "#c74440"
let drawnStart = null;     // your own starting colouring, or null for the automatic one

let playing = true;        // like Desmos, it starts moving at once
let speedIndex = DEFAULT_SPEED;
let run = 0;               // counts restarts, so leftovers from an older run are ignored

// The latest colouring and numbers from the chain.
let colours = null;        // colours[v] = colour of cell v
let latest = null;         // { proposed, accepted, boundary, pairs }
let trace = [];            // [moves tried, boundary edges] pairs, for the plot

// Small helpers.
function byId(id) { return document.getElementById(id); }
function showMessage(text) { byId("sim-message").textContent = text; }

// Wrap a number into lo..hi, for tori. E.g. lo = 0, hi = 9: 10 -> 0, -1 -> 9.
function wrap(v, lo, hi) {
  const n = hi - lo + 1;
  return lo + (((v - lo) % n) + n) % n;
}

// How colour c is drawn: from PALETTE, then evenly around the colour wheel.
function defaultColour(c) {
  if (c < PALETTE.length) return PALETTE[c];
  return "hsl(" + Math.round((c * 137.508) % 360) + ", 55%, 55%)";
}


/* =====================================================================
   3. DOMAINS: BOXES, TORI, AND DRAWN ONES
   ---------------------------------------------------------------------
   Every domain becomes the same kind of object:
     n          number of cells, numbered 0 .. n-1
     x[v], y[v] where cell v is (cell (x, y) is centred at (x, y), as in
                the graph tool)
     first, nbr the neighbours of v are nbr[first[v]] .. nbr[first[v+1] - 1]
                (the compact list the chain uses; see its section 1)
     wrap       for a torus, the x and y range that wraps around; else null
     xmin .. ymax, cellAt   the smallest box around the cells, and which
                cell sits at each place in it (-1 = none), for drawing
     ids[v]     for a drawn domain, the graph tool's name "x,y" of cell v
   ===================================================================== */

function boxDomain(width, height, neighbours, torus) {
  const xs = [], ys = [], edges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) { xs.push(x); ys.push(y); }
  }
  // As in the graph tool: each cell looks right and up (and, with 8
  // neighbours, diagonally), wrapping around on a torus.
  const steps = neighbours === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const [dx, dy] of steps) {
        let nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          if (!torus) continue;
          nx = wrap(nx, 0, width - 1);
          ny = wrap(ny, 0, height - 1);
        }
        edges.push([y * width + x, ny * width + nx]);
      }
    }
  }
  const wrapRange = torus ? { xmin: 0, xmax: width - 1, ymin: 0, ymax: height - 1 } : null;
  return makeDomain(xs, ys, edges, wrapRange, null);
}

// A domain drawn in the graph tool. "graph" is the tool's getGraph():
// { vertices: [{id, x, y, colour}, ...], edges: [[id, id], ...] }, and
// "toolGrid" its grid settings (for the torus).
function drawnDomain(graph, toolGrid) {
  const index = new Map();
  graph.vertices.forEach(function (v, k) { index.set(v.id, k); });
  const edges = graph.edges.map(function (e) { return [index.get(e[0]), index.get(e[1])]; });
  const wrapRange = toolGrid.torus
    ? { xmin: toolGrid.xmin, xmax: toolGrid.xmax, ymin: toolGrid.ymin, ymax: toolGrid.ymax }
    : null;
  return makeDomain(graph.vertices.map(function (v) { return v.x; }),
                    graph.vertices.map(function (v) { return v.y; }),
                    edges, wrapRange, graph.vertices.map(function (v) { return v.id; }));
}

function makeDomain(xs, ys, edges, wrapRange, ids) {
  const n = xs.length;

  // Neighbour lists, each edge in both directions. A Set drops repeats
  // (a torus 2 wide meets the same neighbour on both sides), and a cell
  // is never its own neighbour.
  const lists = [];
  for (let v = 0; v < n; v++) lists.push(new Set());
  for (const [a, b] of edges) {
    if (a === b) continue;
    lists[a].add(b);
    lists[b].add(a);
  }
  const first = new Int32Array(n + 1), all = [];
  for (let v = 0; v < n; v++) {
    first[v] = all.length;
    for (const w of lists[v]) all.push(w);
  }
  first[n] = all.length;

  const d = {
    n: n, x: Int32Array.from(xs), y: Int32Array.from(ys),
    first: first, nbr: Int32Array.from(all), wrap: wrapRange, ids: ids,
    xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys),
  };
  const boxWidth = d.xmax - d.xmin + 1;
  d.cellAt = new Int32Array(boxWidth * (d.ymax - d.ymin + 1)).fill(-1);
  for (let v = 0; v < n; v++) d.cellAt[(d.y[v] - d.ymin) * boxWidth + (d.x[v] - d.xmin)] = v;
  return d;
}

// Which cell of domain d is at (x, y)? -1 if none. On a torus, (x, y)
// is first wrapped back into the grid.
function cellAt(d, x, y) {
  if (d.wrap) {
    x = wrap(x, d.wrap.xmin, d.wrap.xmax);
    y = wrap(y, d.wrap.ymin, d.wrap.ymax);
  }
  if (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax) return -1;
  return d.cellAt[(y - d.ymin) * (d.xmax - d.xmin + 1) + (x - d.xmin)];
}

// How many connected pieces each colour has. pieces[c] for c = 0 .. count-1.
// (A colouring with every colour 0 gives the pieces of the whole domain.)
function countPieces(d, colourOf, count) {
  const pieces = new Array(count).fill(0);
  const seen = new Uint8Array(d.n);
  for (let s = 0; s < d.n; s++) {
    if (seen[s]) continue;
    pieces[colourOf[s]]++;
    seen[s] = 1;
    const stack = [s];                    // explore everything joined to s in its colour
    while (stack.length > 0) {
      const v = stack.pop();
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (!seen[w] && colourOf[w] === colourOf[v]) { seen[w] = 1; stack.push(w); }
      }
    }
  }
  return pieces;
}


/* =====================================================================
   4. THE AUTOMATIC START
   ---------------------------------------------------------------------
   N seed cells spread out over the domain: the first is the cell
   farthest from cell 0, and each next one is the cell farthest from all
   seeds so far ("farthest" = most steps through the graph). Then every
   cell takes the colour of its nearest seed, found by a breadth-first
   search from all the seeds at once. Each cell is reached through a
   neighbour of its own colour, so every colour is one connected piece,
   and the pieces are compact blocks, which the chain likes as a start.
   ===================================================================== */
function autoStart(d, count) {
  const seeds = [];
  let distance = stepsFrom(d, [0]);
  for (let k = 0; k < count; k++) {
    let far = 0;
    for (let v = 1; v < d.n; v++) if (distance[v] > distance[far]) far = v;
    seeds.push(far);
    distance = stepsFrom(d, seeds);
  }
  // The search from all seeds at once, handing out colours as it goes.
  const colourOf = new Int32Array(d.n).fill(-1);
  const queue = [];
  seeds.forEach(function (s, c) { colourOf[s] = c; queue.push(s); });
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (colourOf[w] === -1) { colourOf[w] = colourOf[v]; queue.push(w); }
    }
  }
  return colourOf;
}

// The number of steps from the nearest of the cells "starts" to every cell.
function stepsFrom(d, starts) {
  const steps = new Int32Array(d.n).fill(-1);
  const queue = starts.slice();
  for (const s of starts) steps[s] = 0;
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (steps[w] === -1) { steps[w] = steps[v] + 1; queue.push(w); }
    }
  }
  return steps;
}


/* =====================================================================
   5. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is the function chainWorker() in connected-colouring-chain.js.
   A Web Worker is normally made from a file's address, which browsers
   refuse for pages opened straight from the computer (file://). So the
   function's own text is wrapped in a "Blob" (a file made in memory)
   and the worker is made from that; it works both ways.
   ===================================================================== */
const workerCode = new Blob(["(" + chainWorker.toString() + ")();"], { type: "text/javascript" });
const worker = new Worker(URL.createObjectURL(workerCode));

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  colours = message.colours;
  latest = message;
  trace.push([message.proposed, message.boundary]);
  if (trace.length > TRACE_LENGTH) trace.shift();
  drawSoon();
};

worker.onerror = function () {
  showMessage("The chain couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start the chain again from the start colouring, with the current
// domain, N and seed.
function restart() {
  run++;
  colours = drawnStart ? drawnStart.slice() : autoStart(domain, N);
  trace = [];
  latest = null;
  worker.postMessage({
    type: "setup", run: run,
    n: domain.n, first: domain.first, nbr: domain.nbr,
    colours: colours, N: N, seed: byId("seed").value,
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
   6. DRAWING THE COLOURING
   ---------------------------------------------------------------------
   One <canvas>: each cell is a square in its colour, and a dark line is
   drawn along every side where two cells of different colours meet, or
   where the domain ends. On a torus the sides at the edge of the picture
   are joined to the opposite edge, so a line is drawn there only if the
   colours across the wrap differ.
   ===================================================================== */
let drawPending = false;

// Draw at the browser's next screen refresh (at most once per refresh,
// however many colourings arrive in between).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawColouring();
    showStats();
  });
}

function drawColouring() {
  const canvas = byId("sim-canvas");
  if (!domain || !colours || canvas.hidden) return;
  const d = domain;

  // A cell size that fits the width (and at most MAX_PICTURE_HEIGHT tall).
  const across = d.xmax - d.xmin + 1, down = d.ymax - d.ymin + 1;
  const cssWidth = canvas.clientWidth;
  const size = Math.min(cssWidth / across, MAX_PICTURE_HEIGHT / down);
  const cssHeight = Math.round(size * down);
  canvas.style.height = cssHeight + "px";
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on

  // Where cell edges are on screen. Rounding to whole pixels avoids thin
  // gaps between cells. Rows go up the screen, as y goes up.
  const left = (cssWidth - size * across) / 2;
  function edgeX(x) { return Math.round(left + (x - d.xmin) * size); }        // left side of column x
  function edgeY(y) { return Math.round((d.ymax - y + 1) * size); }           // bottom side of row y

  pen.fillStyle = OUTSIDE;
  pen.fillRect(0, 0, cssWidth, cssHeight);
  for (let v = 0; v < d.n; v++) {
    const x0 = edgeX(d.x[v]), x1 = edgeX(d.x[v] + 1);
    const y0 = edgeY(d.y[v] + 1), y1 = edgeY(d.y[v]);
    pen.fillStyle = colourNames[colours[v]];
    pen.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // The borders, all collected into one path and drawn at once.
  pen.beginPath();
  for (let v = 0; v < d.n; v++) {
    const x = d.x[v], y = d.y[v];
    const x0 = edgeX(x), x1 = edgeX(x + 1), y0 = edgeY(y + 1), y1 = edgeY(y);
    if (differs(v, x + 1, y)) { pen.moveTo(x1, y0); pen.lineTo(x1, y1); }   // right side
    if (differs(v, x - 1, y)) { pen.moveTo(x0, y0); pen.lineTo(x0, y1); }   // left side
    if (differs(v, x, y + 1)) { pen.moveTo(x0, y0); pen.lineTo(x1, y0); }   // top side
    if (differs(v, x, y - 1)) { pen.moveTo(x0, y1); pen.lineTo(x1, y1); }   // bottom side
  }
  pen.strokeStyle = BORDER;
  pen.lineWidth = Math.max(1, Math.min(2.5, size / 10));
  pen.lineCap = "square";
  pen.stroke();

  // Does a border go between cell v and the place (x, y) next to it?
  function differs(v, x, y) {
    const w = cellAt(d, x, y);
    return w === -1 || colours[w] !== colours[v];
  }
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   7. STATISTICS
   ===================================================================== */
function showStats() {
  if (!domain || !colours) return;
  byId("stat-cells").textContent = domain.n;
  byId("stat-colours").textContent = N;
  const s = latest || { proposed: 0, accepted: 0, boundary: "", pairs: "" };
  byId("stat-proposed").textContent = s.proposed.toLocaleString();
  byId("stat-accepted").textContent = s.accepted.toLocaleString() +
    (s.proposed > 0 ? " (" + (100 * s.accepted / s.proposed).toFixed(1) + "%)" : "");
  byId("stat-boundary").textContent = s.boundary;
  byId("stat-pairs").textContent = s.pairs;
  drawSizes();
  drawTrace();
}

// Make a chart canvas sharp at its size on screen; returns its pen.
function chartPen(canvas) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  pen.font = "11px sans-serif";
  pen.fillStyle = "#6b6f78";
  return pen;
}

// One bar per colour, as tall as its number of cells.
function drawSizes() {
  const canvas = byId("sizes-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sizes = new Array(N).fill(0);
  for (let v = 0; v < colours.length; v++) sizes[colours[v]]++;
  const biggest = Math.max(...sizes);
  pen.textBaseline = "top";
  pen.fillText("largest: " + biggest + " cells", 0, 0);
  const top = 16, barWidth = w / N;
  for (let c = 0; c < N; c++) {
    const barHeight = Math.max(1, (h - top) * sizes[c] / biggest);
    pen.fillStyle = colourNames[c];
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
  pen.strokeStyle = "#3a5a7a";
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
     2. Colour the region. The region is locked in the tool (cells
        outside it can't be painted). Every cell needs a colour, and
        each colour must be one connected piece; the colours you use
        become the N colours.
   ===================================================================== */
const frame = byId("tool-frame");
let toolStep = 0;          // 0 = tool closed, 1 or 2 = that step
let toolMessage = null;    // the tool's latest drawing: { graph, grid, palette }
let wasPlaying = false;    // to carry on after Cancel

function openTool() {
  wasPlaying = playing;
  if (playing) setPlaying(false);
  byId("sim-canvas").hidden = true;
  byId("custom-area").hidden = false;
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  else frame.contentWindow.postMessage({ type: "unlock" }, "*");
  showStep(1);
}

function closeTool() {
  toolStep = 0;
  byId("custom-area").hidden = true;
  byId("sim-canvas").hidden = false;
}

function showStep(step) {
  toolStep = step;
  byId("step-title").textContent = step === 1
    ? "Step 1 of 2: draw the region"
    : "Step 2 of 2: colour the region";
  byId("step-help").textContent = step === 1
    ? "Paint the cells the colouring lives on (any colour counts). The region must be one " +
      "connected piece. Then pick an automatic start, or draw your own."
    : "The rule: every cell needs a colour, and each colour must be one connected piece. " +
      "Cells outside the region are greyed out. The colours you use become the N colours.";
  for (const button of document.querySelectorAll("[data-step]")) {
    button.hidden = Number(button.dataset.step) !== step;
  }
  checkTool();
}

// Messages from the tool: its height (so the iframe fits it exactly),
// and its drawing.
window.addEventListener("message", function (event) {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message.type === "height") frame.style.height = message.height + "px";
  if (message.type === "graph") { toolMessage = message; checkTool(); }
});

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
    const start = drawnColouring();
    if (start.uncoloured > 0) {
      problem = start.uncoloured + (start.uncoloured === 1 ? " cell has" : " cells have") + " no colour yet.";
    } else if (start.used.length < 2) {
      problem = "Use at least 2 colours.";
    } else if (start.used.length > MAX_COLOURS) {
      problem = "At most " + MAX_COLOURS + " colours, please.";
    } else {
      const pieces = countPieces(customDomain, start.colourOf, start.used.length);
      const broken = [];
      pieces.forEach(function (count, c) {
        if (count > 1) broken.push("colour " + start.used[c] + " is in " + count + " pieces");
      });
      if (broken.length > 0) problem = "Each colour must be one connected piece: " + broken.join(", ") + ".";
      else good = start.used.length + " colours, each one connected piece.";
    }
  }
  const status = byId("step-status");
  status.textContent = problem || "✓ " + good;   // ✓ is a tick mark
  status.className = "step-status " + (problem ? "problem" : "ok");
  byId("use-auto").disabled = byId("draw-own").disabled = byId("tool-done").disabled = Boolean(problem);
}

// Your drawn colouring of customDomain, read from the tool. The tool
// numbers colours by palette square (1, 2, ...); the chain wants
// 0 .. N-1, so the colours used are renumbered in order.
//   used[c] = the tool's number of colour c;  colourOf[v] = c (or -1)
function drawnColouring() {
  const toolColour = new Map();
  for (const v of toolMessage.graph.vertices) toolColour.set(v.id, v.colour);
  const used = [...new Set(toolColour.values())].sort(function (a, b) { return a - b; });
  const colourOf = new Int32Array(customDomain.n);
  let uncoloured = 0;
  customDomain.ids.forEach(function (id, v) {
    if (toolColour.has(id)) colourOf[v] = used.indexOf(toolColour.get(id));
    else { colourOf[v] = -1; uncoloured++; }
  });
  return { used: used, colourOf: colourOf, uncoloured: uncoloured };
}

// Step 1 -> "Use automatic start": run on the region with N blocks.
byId("use-auto").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  closeTool();
  useDomain("custom", customDomain, null, null);
  setPlaying(true);
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

// Step 2 -> "Done": run from your colouring, in the tool's colours.
byId("tool-done").addEventListener("click", function () {
  const start = drawnColouring();
  const names = start.used.map(function (c) { return toolMessage.palette[c]; });
  closeTool();
  useDomain("custom", customDomain, start.colourOf, names);
  setPlaying(true);
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

// Switch to a new domain and restart. "start" is your own colouring
// (with "names", its colours) or null for the automatic start.
function useDomain(kind, d, start, names) {
  domainKind = kind;
  domain = d;
  drawnStart = start;
  const most = Math.min(MAX_COLOURS, domain.n);
  N = start ? names.length : Math.min(Math.max(N, 2), most);
  colourNames = start ? names : [];
  for (let c = colourNames.length; c < N; c++) colourNames.push(defaultColour(c));
  byId("set-colours").max = byId("colours-slider").max = most;
  byId("set-colours").value = byId("colours-slider").value = N;
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
  const neighbours = Number(byId("set-neighbours").value);
  const torus = (domainChoice() === "torus");
  useDomain(torus ? "torus" : "box", boxDomain(width, height, neighbours, torus), null, null);
  if (toolWasOpen && wasPlaying) setPlaying(true);
}

// A whole number from a box, kept between lo and hi (else "fallback").
function readWhole(id, lo, hi, fallback) {
  let v = Math.round(Number(byId(id).value));
  if (!isFinite(v) || byId(id).value === "") v = fallback;
  v = Math.min(Math.max(v, lo), hi);
  byId(id).value = v;
  return v;
}

function domainChoice() {
  return document.querySelector('input[name="domain"]:checked').value;
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  document.querySelector('input[name="domain"][value="' + domainKind + '"]').checked = true;
  const custom = (domainKind === "custom");
  byId("size-row").hidden = byId("neighbours-row").hidden = custom;
  byId("custom-row").hidden = !custom;
  if (custom && customDomain) {
    byId("custom-info").textContent = "Your region: " + customDomain.n + " cells" +
      (customDomain.wrap ? ", on a torus." : ".");
  }
}

function showStartInfo() {
  byId("start-info").textContent = drawnStart
    ? "Starting from your own colouring. Changing N switches to the automatic start."
    : "Starting from " + N + " compact blocks (the automatic start).";
}

// Domain: Box / Torus / Custom.
for (const radio of document.querySelectorAll('input[name="domain"]')) {
  radio.addEventListener("change", function () {
    if (radio.value === "custom") openTool();
    else useBox();
  });
}
for (const id of ["set-width", "set-height", "set-neighbours"]) {
  byId(id).addEventListener("change", useBox);
}
byId("edit-custom").addEventListener("click", openTool);

// N: the slider and the number box move together, and the chain restarts
// live while you drag, like a Desmos slider.
function setColourCount(value) {
  N = Math.min(Math.max(Math.round(value) || 2, 2), Math.min(MAX_COLOURS, domain.n));
  useDomain(domainKind, domain, null, null);   // a new N always uses the automatic start
}
byId("colours-slider").addEventListener("input", function () { setColourCount(Number(this.value)); });
byId("set-colours").addEventListener("change", function () { setColourCount(Number(this.value)); });

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

// The typeset formulas in the About quadrant, drawn by KaTeX.
for (const element of document.querySelectorAll(".tex")) {
  katex.render(element.textContent, element, { displayMode: element.tagName === "DIV", throwOnError: false });
}


// --- Start ------------------------------------------------------------
byId("set-width").value = DEFAULTS.width;
byId("set-height").value = DEFAULTS.height;
byId("set-neighbours").value = String(DEFAULTS.neighbours);
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
useBox();
setPlaying(true);
