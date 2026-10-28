/* =====================================================================
   ising-potts.js  —  the page of the "Ising & Potts Model" sim
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
     7. The domain
     8. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain, q, beta, h and seed. The default beta is the
// critical point of the Ising model on the square grid, log(1 + sqrt 2).
const DEFAULTS = { width: 128, height: 128, q: 2, beta: 0.8814, h: 0, seed: "1" };

const MAX_Q = 10;                 // the most colors
const MAX_BETA = 3;               // the beta slider goes from 0 to this
const MAX_FIELD = 1;              // the h slider goes from -MAX_FIELD to MAX_FIELD
const MAX_SIDE = 400;             // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels

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

let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js); its kind is domains.kind (section 7)
let q = DEFAULTS.q;            // number of colors
let beta = DEFAULTS.beta;      // inverse temperature
let h = DEFAULTS.h;            // the field (pushes cells toward color 1)
let colorNames = [];           // colorNames[k] = how color k is drawn, e.g. "#f2735a"

let latest = null;             // the latest message from the chain (section 2 of ising-potts-chain.js)
const highlight = newHighlight();   // the clicked cell, whose domain is highlighted (js/sim-highlight.js)


/* =====================================================================
   3. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is pottsWorker() in ising-potts-chain.js, with newPotts,
   pottsStart, the trace (js/sim-worker.js), and countPieces with the
   search behind it (js/sim-domains.js) copied in. runInWorker
   (js/sim-page.js) runs it in a second thread, so the page never
   freezes.
   ===================================================================== */
const sim = runInWorker(pottsWorker, [newPotts, pottsStart, newTrace, keepSample, countPieces, findRegions, spreadRegion],
                        function (message) { latest = message; drawSoon(); });

// A new run from the start (paused), with the current settings and seed.
function restart() {
  latest = null;
  showMessage("");
  sim.setup({
    n: domain.n, first: domain.first, nbr: domain.nbr, q: q, beta: beta, h: h,
    dynamics: checked("dynamics"), start: byId("start").value, seed: byId("seed").value,
  });
}

// New beta, h or dynamics: the chain carries on with them.
function sendParams() {
  sim.send({ type: "params", beta: beta, h: h, dynamics: checked("dynamics") });
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "sweep", "sweeps", restart);


/* =====================================================================
   4. DRAWING THE COLORING
   ---------------------------------------------------------------------
   One square per cell in its color (one polygon, on another tiling),
   and a dark line where two colors meet when the cells are big enough
   to see. The view (js/sim-view.js) says where the picture goes and
   which cells show, and paintColoring (js/sim-highlight.js) paints them.
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
const disk = makeDiskView(simCanvas, view, function () { domains.show(); });

// A clicked cell's domain stands out: every other cell fades
// (js/sim-highlight.js; the click is in section 5).
function drawColoring() {
  if (!latest || simCanvas.hidden) return;
  const colors = latest.colors;
  findHighlight(highlight, domain, colors);
  byId("highlight-info").textContent = highlightText(highlight, "domain", function (k) { return "color " + (k + 1); });
  if (domains.kind === "graph") {
    drawBall(disk, domain, coloringCSS(highlight, colors, colorNames));
    return;
  }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  paintColoring(view, pen, domain, colors, colorNames, highlight);
  pen.restore();
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   5. MOVING AND ZOOMING
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-view.js). On a torus it also
   zooms out, showing the torus several times side by side.
   On a hyperbolic tiling or tree, one pointer drags across the plane
   instead, and two fingers slide and zoom the picture.
   A press that hardly moves is a click instead: it highlights the
   clicked cell's domain (js/sim-highlight.js), which follows that cell
   as the chain runs. Clicking the domain again, or outside the cells,
   shows everything again.
   ===================================================================== */
connectPicture(view, {
  disk: disk, onGraph: function () { return domains.kind === "graph"; },
  onClick: function (event) {
    if (!latest) return;
    clickHighlight(highlight, cellAtEvent(view, disk, domain, domains.kind === "graph", event), latest.colors);
    drawSoon();
  },
});


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   The color counts and the agreeing pairs come from the chain. The
   "domains" (connected pieces of one color) are counted here
   (countPieces, js/sim-domains.js), and by the chain at each sample
   of the run, for the chart over time.
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
  const pieces = countPieces(domain, s.colors, q);
  byId("stat-domains").textContent = pieces.reduce(function (a, b) { return a + b; }, 0).toLocaleString();

  byId("color-rows").innerHTML = colorShareRows(colorNames, 1, s.counts, n, pieces);   // (js/sim-page.js)

  // The share of each color over time, of agreeing pairs, and the
  // number of domains of each color (js/sim-charts.js).
  const lineColor = function (k) { return colorNames[k]; };
  plotOverTime(byId("shares-chart"), s.traceTimes, colorLines(s.traceCounts, s.traceTimes.length, q, lineColor, 1 / n), "sweep");
  plotOverTime(byId("agree-chart"), s.traceTimes, [{ color: CHART_LINE, values: s.traceAgree }], "sweep");
  regionsChart(byId("domains-chart"), s.traceTimes, s.tracePieces, q, lineColor, "sweep");
}


/* =====================================================================
   7. THE DOMAIN
   ---------------------------------------------------------------------
   Box / Torus / Custom / Hyperbolic plane or tree, and their options,
   the Lattice options among them (connectDomains, js/sim-controls.js).
   Custom swaps the picture for the graph tool, where any drawing of at
   least two cells works, even one in several pieces.
   ===================================================================== */
const domains = connectDomains({
  view: view, player: player, disk: disk,
  box: function () { return boxFromOptions(2, MAX_SIDE, DEFAULTS); },
  ball: function () { return ballFromOptions(disk, BALL); },
  custom: { check: atLeastTwoCells },
  use: function (d) {
    domain = d;
    clearHighlight(highlight);
    restart();
  },
  show: showCritical,
});


/* =====================================================================
   8. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// The critical point beta_c of the box or torus in use, as in
// EXACT_BETA, or null if it isn't known: on the square grid, and on
// the lattices of TILING_CRITICAL (both in section 3 of
// ising-potts-chain.js).
function criticalBeta() {
  if (domains.kind === "custom" || domains.kind === "graph") return null;
  if (!domain.lattice) return EXACT_BETA.square(q);
  const known = TILING_CRITICAL[domain.tiling.code];
  const lattice = known && known[domain.tiling.corners ? "corners" : "tiles"];
  return lattice ? EXACT_BETA[lattice](q) : null;
}
function showCritical() {
  const critical = criticalBeta();
  byId("critical-row").hidden = (critical === null);
  if (critical === null) return;
  byId("critical-value").textContent = critical[0] + " ≈ " + critical[1].toFixed(4);
  byId("critical-where").textContent = domain.lattice ? "lattice" : "grid";
  byId("critical-v").textContent = critical[2] ? ", where " + critical[2] : "";
}

// q, beta and h: each slider and its box move together
// (connectSliderAndBox, js/sim-page.js), and the chain follows beta and
// h live while you drag, like a Desmos slider.
const showQ = connectSliderAndBox("q-slider", "q-box", setQ);
const showBeta = connectSliderAndBox("beta-slider", "beta-box", setBeta);
const showField = connectSliderAndBox("h-slider", "h-box", setField);

// q colors, each drawn in the old site's colors.
function makeColors(value) {
  q = showQ(value);
  colorNames = defaultColors(q);
  byId("ising-note").textContent = q === 2 ? "q = 2 is the Ising model." : "";
}

// A new q, from its slider or box: restarts.
function setQ(value) {
  makeColors(value);
  showCritical();
  restart();
}

// New beta or h: the chain carries on with it.
function setBeta(value) {
  beta = showBeta(value);
  sendParams();
  drawSoon();
}
function setField(value) {
  h = showField(value);
  sendParams();
}

byId("beta-critical").addEventListener("click", function () { setBeta(criticalBeta()[1]); });
for (const radio of document.querySelectorAll('input[name="dynamics"]')) radio.addEventListener("change", sendParams);
byId("start").addEventListener("change", restart);

// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("q-box").max = byId("q-slider").max = MAX_Q;
byId("beta-box").max = byId("beta-slider").max = MAX_BETA;
byId("h-box").min = byId("h-slider").min = -MAX_FIELD;
byId("h-box").max = byId("h-slider").max = MAX_FIELD;
showBeta(beta);
showField(h);
byId("seed").value = DEFAULTS.seed;
makeColors(DEFAULTS.q);
domains.useTicked();    // the torus ticked on the page, and the first run
