/* =====================================================================
   ising-potts.js  —  the page of the "Ising and Potts model" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells (on the square grid,
       or on any tiling by regular polygons, its tiles or its corners
       being the cells), a region drawn in the graph tool (shown inside
       this page), or a ball of a hyperbolic tiling or a tree. The
       domain code is shared with the other sims: the domains in
       js/sim-domains.js, the tilings in js/sim-tilings.js, their
       options and the graph tool in js/sim-controls.js, and the
       hyperbolic tilings and trees, and their pictures, in
       js/sim-hyperbolic.js.
     - Hands it to the chain (ising-potts-chain.js), which runs in a
       second thread (a "Web Worker"), and draws every coloring it sends
       back, with the statistics.
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
     9. The (T, h) pad
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

// The (T, h) pad (section 9): the temperature T = 1/beta goes across it
// from 0 to PAD_MAX_T, and the field h up and down. A dot dragged within
// PAD_SNAP of h = 0 snaps onto it, so the thick line is easy to land on.
const PAD_MAX_T = 3;
const PAD_SNAP = 0.02;

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 6, most: 20, cells: 20000 };

// The speeds on the Speed slider, in sweeps per second (a sweep: every
// cell updated once on average, or one Swendsen-Wang step). Infinity
// means "as fast as the computer can".
const SPEEDS = [1, 100, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 5;


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

let run = 0;                   // counts restarts, so leftovers from an older run are ignored
let latest = null;             // the latest message from the chain (section 2 of ising-potts-chain.js)


/* =====================================================================
   3. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is pottsWorker() in ising-potts-chain.js, with newPotts,
   pottsStart, and the run loop and the trace (js/sim-worker.js) copied
   in. startWorker (js/sim-page.js) runs it in a second thread, so the
   page never freezes.
   ===================================================================== */
const worker = startWorker(pottsWorker, [newPotts, pottsStart, makeRunLoop, newTrace, keepSample]);

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
  player.carryOn();
}

// New beta, h or dynamics: the chain carries on with them.
function sendParams() {
  worker.postMessage({ type: "params", beta: beta, h: h, dynamics: checked("dynamics") });
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(worker, SPEEDS, DEFAULT_SPEED, "sweep", "sweeps", restart);


/* =====================================================================
   4. DRAWING THE COLORING
   ---------------------------------------------------------------------
   One square per cell in its color (one polygon, on another tiling),
   and a dark line where two colors meet when the cells are big enough
   to see. The view (js/sim-view.js) says where the picture goes and
   which cells show, and paints them (paintDomain).
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
  if (!latest || simCanvas.hidden) return;
  const colors = latest.colors;
  if (domainKind === "graph") {
    drawBall(disk, domain, function (v) { return colorNames[colors[v]]; });
    return;
  }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  paintDomain(view, pen, domain, function (v) { return colors[v]; }, function (k) { return colorRGB[k]; },
              outsideRGB, BORDER, SMALLEST_BORDERED_CELL);
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
  if (!latest) return;
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
  plotOverTime(byId("agree-chart"), s.traceTimes, [{ color: CHART_LINE, values: s.traceAgree }], "sweep");
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
  isPlaying: function () { return player.playing; },
  setPlaying: player.setPlaying,
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

// The critical point beta_c of the box or torus in use, as in
// EXACT_BETA, or null if it isn't known: on the square grid with 4
// neighbors, and on the lattices of TILING_CRITICAL (both in section 3
// of ising-potts-chain.js).
function criticalBeta() {
  if (domainKind === "custom" || domainKind === "graph") return null;
  if (!domain.lattice) return byId("set-neighbors").value === "4" ? EXACT_BETA.square(q) : null;
  const known = TILING_CRITICAL[domain.tiling.code];
  const lattice = known && known[domain.tiling.corners ? "corners" : "tiles"];
  return lattice ? EXACT_BETA[lattice](q) : null;
}
function showCritical() {
  drawPad();
  const critical = criticalBeta();
  byId("critical-row").hidden = (critical === null);
  if (critical === null) return;
  byId("critical-value").textContent = critical[0] + " ≈ " + critical[1].toFixed(4);
  byId("critical-where").textContent = domain.lattice ? "lattice" : "grid";
  byId("critical-v").textContent = critical[2] ? ", where " + critical[2] : "";
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
  drawPad();
  drawSoon();
}
function setField(value) {
  h = Math.min(Math.max(Number(value) || 0, -MAX_FIELD), MAX_FIELD);
  byId("h-slider").value = h;
  byId("h-box").value = Number(h.toFixed(3));
  sendParams();
  drawPad();
}

byId("q-slider").addEventListener("input", function () { setQ(this.value); });
byId("q-box").addEventListener("change", function () { setQ(this.value); });
byId("beta-slider").addEventListener("input", function () { setBeta(this.value); });
byId("beta-box").addEventListener("change", function () { setBeta(this.value); });
byId("beta-critical").addEventListener("click", function () { setBeta(criticalBeta()[1]); });
byId("h-slider").addEventListener("input", function () { setField(this.value); });
byId("h-box").addEventListener("change", function () { setField(this.value); });
for (const radio of document.querySelectorAll('input[name="dynamics"]')) radio.addEventListener("change", sendParams);
byId("start").addEventListener("change", restart);

// Domain: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options, the Lattice options among them (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

// Seed: the same seed gives the same run every time.
connectSeed(restart);


/* =====================================================================
   9. THE (T, h) PAD
   ---------------------------------------------------------------------
   A square like a little phase diagram (as in 3Blue1Brown's videos):
   the temperature T = 1/beta goes across (cold on the left) and the
   field h up and down. Dragging the dot sets both at once, and the beta
   and h sliders move with it. Drawn on it is only what is known
   exactly ("All the details" says where from): the line h = 0 from
   T = 0 to the critical point T_c, where the coloring jumps from one
   winning color to another, wherever this page knows beta_c. The tint
   says which way h pushes: toward color 1 above the middle, away from
   it below.
   ===================================================================== */
const pad = byId("phase-pad");
const PAD_ROOM = { left: 30, right: 8, top: 8, bottom: 20 };   // room for the numbers, in pixels

// Where T and h are on the pad, in pixels, and back.
function padBox() {
  return { x0: PAD_ROOM.left, x1: pad.clientWidth - PAD_ROOM.right,
           y0: PAD_ROOM.top, y1: pad.clientHeight - PAD_ROOM.bottom };
}
function padX(T) { const b = padBox(); return b.x0 + (b.x1 - b.x0) * Math.min(T, PAD_MAX_T) / PAD_MAX_T; }
function padY(field) { const b = padBox(); return b.y0 + (b.y1 - b.y0) * (MAX_FIELD - field) / (2 * MAX_FIELD); }

function drawPad() {
  if (pad.clientWidth === 0) return;
  const pen = chartPen(pad), b = padBox(), middle = padY(0);
  const critical = criticalBeta();

  // The tint: color 1 above the middle (h pushes toward it), and for
  // q = 2 color 2 below (h < 0 pushes toward it).
  pen.globalAlpha = 0.18;
  pen.fillStyle = colorNames[0];
  pen.fillRect(b.x0, b.y0, b.x1 - b.x0, middle - b.y0);
  if (q === 2) {
    pen.fillStyle = colorNames[1];
    pen.fillRect(b.x0, middle, b.x1 - b.x0, b.y1 - middle);
  }
  pen.globalAlpha = 1;

  // The frame, and the line h = 0 across.
  pen.strokeStyle = CHART_TEXT;
  pen.lineWidth = 1;
  pen.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  pen.beginPath(); pen.moveTo(b.x0, middle); pen.lineTo(b.x1, middle);
  pen.globalAlpha = 0.4; pen.stroke(); pen.globalAlpha = 1;

  // The numbers on the sides: T along the bottom, h up the left.
  pen.fillStyle = CHART_TEXT;
  pen.textAlign = "center";
  pen.textBaseline = "top";
  for (let T = 0; T <= PAD_MAX_T; T++) pen.fillText((T === PAD_MAX_T ? "T = " : "") + T, padX(T) - (T === PAD_MAX_T ? 12 : 0), b.y1 + 3);
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  for (const field of [MAX_FIELD, 0, -MAX_FIELD]) pen.fillText(String(field), b.x0 - 4, padY(field));
  pen.fillText("h", b.x0 - 4, (b.y0 + middle) / 2);

  // The thick line, from T = 0 to T_c, and its end.
  if (critical !== null) {
    const xc = padX(1 / critical[1]);
    pen.beginPath(); pen.moveTo(b.x0, middle); pen.lineTo(xc, middle);
    pen.lineWidth = 4; pen.strokeStyle = BORDER; pen.stroke();
    pen.beginPath(); pen.arc(xc, middle, 4, 0, 2 * Math.PI);
    pen.fillStyle = "#ffffff"; pen.fill();
    pen.lineWidth = 2; pen.stroke();
    pen.fillStyle = CHART_TEXT;
    pen.textAlign = "center";
    pen.textBaseline = "bottom";
    pen.fillText("Tc", xc, middle - 6);
  }

  // The dot: the current T and h (at the right side when T is off the pad).
  const T = beta > 0 ? 1 / beta : Infinity;
  pen.beginPath(); pen.arc(padX(T), padY(h), 6, 0, 2 * Math.PI);
  pen.fillStyle = BORDER; pen.fill();
  pen.lineWidth = 2; pen.strokeStyle = "#ffffff"; pen.stroke();

  byId("phase-note").innerHTML = critical === null
    ? "No exact critical point is known for this domain, so the pad shows only the axes."
    : q === 2
      ? "The thick line is h = 0 below T<sub>c</sub> = 1/β<sub>c</sub>. Crossing it there flips which color takes over; " +
        "anywhere else the picture changes gradually."
      : "The thick line is h = 0 below T<sub>c</sub> = 1/β<sub>c</sub>, where all " + q + " colors coexist. Below the " +
        "middle, the other " + (q - 1) + " colors have a transition of their own, at a place not known exactly, so it isn't drawn.";
}

// Dragging the dot (or pressing anywhere on the pad) sets T and h. The
// smallest T is 1/MAX_BETA, the largest beta the slider allows.
let padPointer = -1;
function padMove(event) {
  const box = pad.getBoundingClientRect(), b = padBox();
  const x = Math.min(Math.max(event.clientX - box.left, b.x0), b.x1);
  const y = Math.min(Math.max(event.clientY - box.top, b.y0), b.y1);
  const T = Math.max(PAD_MAX_T * (x - b.x0) / (b.x1 - b.x0), 1 / MAX_BETA);
  let field = MAX_FIELD - 2 * MAX_FIELD * (y - b.y0) / (b.y1 - b.y0);
  if (Math.abs(field) < PAD_SNAP) field = 0;
  setBeta(1 / T);
  setField(field);
}
pad.addEventListener("pointerdown", function (event) {
  padPointer = event.pointerId;
  pad.setPointerCapture(event.pointerId);   // keep getting moves even off the pad
  pad.style.cursor = "grabbing";
  padMove(event);
});
pad.addEventListener("pointermove", function (event) { if (event.pointerId === padPointer) padMove(event); });
function padRelease(event) {
  if (event.pointerId !== padPointer) return;
  padPointer = -1;
  pad.style.cursor = "grab";
}
pad.addEventListener("pointerup", padRelease);
pad.addEventListener("pointercancel", padRelease);
window.addEventListener("resize", drawPad);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
fillLatticeMenu();
byId("q-box").max = byId("q-slider").max = MAX_Q;
byId("beta-box").max = byId("beta-slider").max = MAX_BETA;
byId("h-box").min = byId("h-slider").min = -MAX_FIELD;
byId("h-box").max = byId("h-slider").max = MAX_FIELD;
byId("beta-slider").value = byId("beta-box").value = beta;
byId("h-slider").value = byId("h-box").value = h;
byId("seed").value = DEFAULTS.seed;
domain = boxDomain(DEFAULTS.width, DEFAULTS.height, DEFAULTS.neighbors, true);
useTorus(view, true);
showDomainChoice();
setQ(DEFAULTS.q);    // sets the colors and starts the first run
player.setPlaying(false);   // paused: press Play
