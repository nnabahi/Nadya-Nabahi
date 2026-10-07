/* =====================================================================
   potts.js  —  the page of the "Ising and Potts model" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, a region drawn in
       the graph tool (shown inside this page), or a ball of a
       hyperbolic tiling or a tree. The domain code is shared with the
       other sims: the domains in js/sim-domains.js, their options and
       the graph tool in js/sim-controls.js, and the hyperbolic tilings
       and trees, and their pictures, in js/sim-hyperbolic.js.
     - Hands it to the chain (potts-chain.js), which runs in a second
       thread (a "Web Worker"), and draws every coloring it sends back,
       with the statistics.
     - Moving the beta or h slider, or switching the dynamics, changes
       the chain's settings while it runs, like turning a thermostat:
       the coloring carries on from where it is. Restart goes back to
       the start (same seed, so the same start and the same random
       numbers). Changing q, the domain, the start or the seed restarts.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the chain
     4. Drawing the coloring
     5. Moving and zooming
     6. Statistics
     7. Custom domains: the graph tool inside this page
     8. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain, q, beta, h and seed. The default beta is the
// critical point of the Ising model on the square grid, log(1 + sqrt 2).
const DEFAULTS = { width: 128, height: 128, neighbors: 4, q: 2, beta: 0.8814, h: 0, seed: "1" };

const MAX_Q = 10;                 // the most colors
const MAX_BETA = 3;               // the beta slider goes from 0 to this
const MAX_FIELD = 1;              // the h slider goes from -MAX_FIELD to MAX_FIELD
const MAX_SIDE = 400;             // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // the lines between colors
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const SMALLEST_BORDERED_CELL = 4; // cells smaller than this (in pixels) get no border lines

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 6, most: 20, cells: 20000 };

// The speeds on the Speed slider, in sweeps per second (a sweep: every
// cell updated once on average, or one Swendsen-Wang step). Infinity
// means "as fast as the computer can".
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(5);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "torus";      // "box", "torus", "custom" or "graph": the domain in use
let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
let customDomain = null;       // the last custom domain drawn, if any
let q = DEFAULTS.q;            // number of colors
let beta = DEFAULTS.beta;      // inverse temperature
let h = DEFAULTS.h;            // the field (pushes cells toward color 1)
let colorNames = [];           // colorNames[k] = how color k is drawn, e.g. "#f2735a"
let colorRGB = [];             // the same as [red, green, blue], 0 .. 255

let playing = false;           // it starts paused; Play sets it going
let speedIndex = DEFAULT_SPEED;
let run = 0;                   // counts restarts, so leftovers from an older run are ignored
let latest = null;             // the latest message from the chain (section 2 of potts-chain.js)


/* =====================================================================
   3. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is pottsWorker() in potts-chain.js, with newPotts and
   pottsStart copied in. startWorker (js/sim-page.js) runs it in a second
   thread, so the page never freezes.
   ===================================================================== */
const worker = startWorker(pottsWorker, [newPotts, pottsStart]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  latest = message;
  drawSoon();
};

worker.onerror = function () {
  showMessage("The chain couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start again from the start, with the current settings and seed.
function restart() {
  run++;
  latest = null;
  showMessage("");
  worker.postMessage({
    type: "setup", run: run, n: domain.n, first: domain.first, nbr: domain.nbr,
    q: q, beta: beta, h: h, dynamics: checked("dynamics"), start: byId("start").value,
    seed: byId("seed").value,
  });
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
}

// New beta, h or dynamics: the chain carries on with them.
function sendParams() {
  worker.postMessage({ type: "params", beta: beta, h: h, dynamics: checked("dynamics") });
}

function setPlaying(on) {
  playing = on;
  worker.postMessage(on ? { type: "play", speed: SPEEDS[speedIndex] } : { type: "pause" });
  showPlaying(on);
}


/* =====================================================================
   4. DRAWING THE COLORING
   ---------------------------------------------------------------------
   One square per cell in its color, and a dark line where two colors
   meet when the cells are big enough to see. The view (js/sim-view.js)
   says where the picture goes and which squares show, and paints them
   (paintCells).
   On a hyperbolic tiling or tree, each cell is drawn in its color in
   the disk, the half-plane or (a tree) spread out in rings (drawBall,
   js/sim-hyperbolic.js).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawColoring(); showStats(); });

const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, showDomainChoice);
const outsideRGB = hexToRGB(OUTSIDE);

function drawColoring() {
  if (!domain || !latest || simCanvas.hidden) return;
  const colors = latest.colors;
  if (domainKind === "graph") {
    drawBall(disk, domain, function (v) { return colorNames[colors[v]]; });
    return;
  }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  const shown = paintCells(view, pen, domain,
    function (v) { return colors[v]; }, function (k) { return colorRGB[k]; }, outsideRGB);
  if (view.cell >= SMALLEST_BORDERED_CELL) drawBorders(view, pen, shown, BORDER);
  pen.restore();
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   5. MOVING AND ZOOMING
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-controls.js). On a torus it also
   zooms out, showing the torus several times side by side.
   On a hyperbolic tiling or tree, one pointer drags across the plane
   instead, and two fingers slide and zoom the picture.
   ===================================================================== */
connectPicture(view, disk, function () { return domainKind === "graph"; });


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   The color counts and the agreeing pairs come from the chain. The
   "domains" (connected pieces of one color) are counted here
   (countPieces, js/sim-domains.js).
   The magnetization says how far the coloring is from all colors
   equally common: for q = 2 (Ising) it is m = (N1 - N2) / n, between
   -1 and 1; for q > 2 it is (q * largest share - 1) / (q - 1), between
   0 (all colors equally common) and 1 (one color everywhere).
   ===================================================================== */
function magnetization(counts, n) {
  if (q === 2) return (counts[0] - counts[1]) / n;
  return (q * Math.max(...counts) / n - 1) / (q - 1);
}

function showStats() {
  if (!domain || !latest) return;
  const s = latest, n = domain.n;
  byId("stat-cells").textContent = n.toLocaleString();
  byId("stat-pairs").textContent = s.pairs.toLocaleString();
  byId("stat-time").textContent = s.time.toLocaleString();
  byId("stat-beta").textContent = beta.toFixed(4) + (beta > 0 ? "  (temperature 1/β = " + (1 / beta).toFixed(3) + ")" : "");
  byId("stat-agree").textContent = s.agree.toLocaleString() + " (" + (100 * s.agree / Math.max(s.pairs, 1)).toFixed(2) + "%)";
  byId("stat-magnetization-name").textContent = q === 2 ? "Magnetization m = (N₁ − N₂) / n" : "Order (q · largest share − 1) / (q − 1)";
  byId("stat-magnetization").textContent = magnetization(s.counts, n).toFixed(4);
  const domains = countPieces(domain, s.colors, q).reduce(function (a, b) { return a + b; }, 0);
  byId("stat-domains").textContent = domains.toLocaleString();

  let rows = "";
  for (let k = 0; k < q; k++) {
    rows += '<tr><td><span class="swatch-small" style="background:' + colorNames[k] + '"></span>' + (k + 1) +
      '</td><td>' + s.counts[k].toLocaleString() + '</td><td>' + (100 * s.counts[k] / n).toFixed(1) + '%</td></tr>';
  }
  byId("color-rows").innerHTML = rows;

  // The share of each color over time, and of agreeing pairs.
  const lines = [];
  for (let k = 0; k < q; k++) {
    const values = [];
    for (let j = 0; j < s.traceTimes.length; j++) values.push(s.traceCounts[j * q + k] / n);
    lines.push({ color: colorNames[k], values: values });
  }
  plotOverTime(byId("shares-chart"), s.traceTimes, lines, "sweep");
  plotOverTime(byId("agree-chart"), s.traceTimes, [{ color: CHART_LINE, values: Array.from(s.traceAgree) }], "sweep");
}


/* =====================================================================
   7. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
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
   8. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain, and restart.
function useDomain(kind, d) {
  domainKind = kind;
  domain = d;
  useTorus(view, Boolean(d.wrap));   // moving and zooming (js/sim-view.js)
  showDomainChoice();
  restart();
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
  useDomain("graph", ball);
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
  showCritical();
}

// The critical point beta_c = log(1 + sqrt q), known for the square
// grid with 4 neighbors (box or torus).
function criticalBeta() {
  if (domainKind === "custom" || domainKind === "graph" || byId("set-neighbors").value !== "4") return null;
  return Math.log(1 + Math.sqrt(q));
}
function showCritical() {
  const bc = criticalBeta();
  byId("critical-row").hidden = (bc === null);
  if (bc !== null) byId("critical-value").textContent = "log(1 + √" + q + ") ≈ " + bc.toFixed(4);
}

// q colors, each drawn in the old site's colors. Restarts.
function setQ(value) {
  q = Math.min(Math.max(Math.round(value) || 2, 2), MAX_Q);
  byId("q-box").value = byId("q-slider").value = q;
  colorNames = [];
  for (let k = 0; k < q; k++) colorNames.push(defaultColor(k, q));
  colorRGB = colorNames.map(hexToRGB);
  byId("ising-note").textContent = q === 2 ? "q = 2 is the Ising model." : "";
  showCritical();
  restart();
}

// beta and h: the slider and the box move together, and the chain
// follows live while you drag, like a Desmos slider.
function setBeta(value) {
  beta = Math.min(Math.max(Number(value) || 0, 0), MAX_BETA);
  byId("beta-slider").value = beta;
  byId("beta-box").value = Number(beta.toFixed(4));
  sendParams();
  drawSoon();
}
function setField(value) {
  h = Math.min(Math.max(Number(value) || 0, -MAX_FIELD), MAX_FIELD);
  byId("h-slider").value = h;
  byId("h-box").value = Number(h.toFixed(3));
  sendParams();
}

byId("q-slider").addEventListener("input", function () { setQ(this.value); });
byId("q-box").addEventListener("change", function () { setQ(this.value); });
byId("beta-slider").addEventListener("input", function () { setBeta(this.value); });
byId("beta-box").addEventListener("change", function () { setBeta(this.value); });
byId("beta-critical").addEventListener("click", function () { setBeta(criticalBeta()); });
byId("h-slider").addEventListener("input", function () { setField(this.value); });
byId("h-box").addEventListener("change", function () { setField(this.value); });
for (const radio of document.querySelectorAll('input[name="dynamics"]')) radio.addEventListener("change", sendParams);
byId("start").addEventListener("change", restart);

// Domain: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

// Play / Pause, Step, Restart.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "step" });
});
byId("restart").addEventListener("click", restart);

// Speed.
function showSpeed() { byId("speed-label").textContent = speedText(SPEEDS[speedIndex], "sweep", "sweeps"); }
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
});

// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("q-box").max = byId("q-slider").max = MAX_Q;
byId("beta-box").max = byId("beta-slider").max = MAX_BETA;
byId("h-box").min = byId("h-slider").min = -MAX_FIELD;
byId("h-box").max = byId("h-slider").max = MAX_FIELD;
byId("beta-slider").value = byId("beta-box").value = beta;
byId("h-slider").value = byId("h-box").value = h;
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
domain = boxDomain(DEFAULTS.width, DEFAULTS.height, DEFAULTS.neighbors, true);
useTorus(view, true);
showDomainChoice();
setQ(DEFAULTS.q);    // sets the colors and starts the first run
setPlaying(false);   // paused: press Play
