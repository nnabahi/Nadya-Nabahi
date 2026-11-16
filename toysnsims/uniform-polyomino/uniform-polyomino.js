/* =====================================================================
   uniform-polyomino.js  —  the page of the "Uniform Polyomino" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the options: the number of cells N, how many cells a move
       may take out (up to K), and the two heat sliders b (edge
       perimeter) and s (site perimeter).
     - Hands them to the chain (newPolyomino, js/sim-polyomino.js),
       which runs in a second thread (uniform-polyomino-chain.js), and
       draws every polyomino it sends back, with the statistics.
     - Moving K, b or s changes the chain as it runs, like a Desmos
       slider: the polyomino carries on from where it is. A new N, a new
       seed or Restart goes back to the start (the straight line of N
       cells), paused.
   The picture is the polyomino alone, as big as fits: it drifts as it
   changes, so the picture follows it. It can be moved and zoomed like
   every sim's picture (js/sim-view.js).

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the chain
     4. Drawing the polyomino
     5. Statistics
     6. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default number of cells (Coupier, Gheysens and Wicker's figure of
// a uniform polyomino has 200) and seed. (K, b and s, their defaults and
// their sliders are in js/sim-polyomino.js, shared with Sequential
// Discrete Tiling.)
const DEFAULTS = { cells: 200, seed: "1" };

const MAX_CELLS = 5000;           // the most cells
const MAX_PICTURE_HEIGHT = 500;   // in screen pixels
const CELL_COLOR = defaultColor(4, 6);   // the cells' color (a placeholder; js/sim-colors.js)
const MOST_MOVES = 1e9;           // the Go to step box goes up to this

// The speeds on the Speed slider, in moves per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every move.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let cells = DEFAULTS.cells;        // N
let latest = null;                 // the chain's latest report (uniform-polyomino-chain.js)


/* =====================================================================
   3. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   runInWorker (js/sim-page.js) runs polyominoWorker in a second thread,
   with the chain and its helpers (polyominoHelpers, js/sim-polyomino.js)
   and the trace (js/sim-worker.js) copied in.
   ===================================================================== */
const sim = runInWorker(polyominoWorker, polyominoHelpers().concat([newTrace, keepSample]), function (message) {
  latest = message;
  drawSoon();
});

// A new run from the straight line of N cells (paused), with the
// current K, b and s (chainSettings, section 6) and seed.
function restart() {
  latest = null;
  sim.setup(Object.assign({ cells: cells, seed: byId("seed").value }, chainSettings));
}

// New K, b or s: the chain carries on with them.
function sendSettings() {
  sim.send(Object.assign({ type: "settings" }, chainSettings));
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js), and the Go to step box (connectGoto).
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "move", "moves", restart);
connectGoto(sim, MOST_MOVES, 100000);


/* =====================================================================
   4. DRAWING THE POLYOMINO
   ---------------------------------------------------------------------
   The cells become a domain (polyominoDomain, js/sim-polyomino.js), and
   are painted like any sim's cells (paintDomain, js/sim-view.js): each
   cell its own group, so once cells are big enough a thin line goes
   between every two of them, and around the polyomino. Holes show as the
   background.
   ===================================================================== */
const simCanvas = byId("sim-canvas");
const drawSoon = oncePerFrame(function () { drawPolyomino(); showStats(); });
const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);
const cellRGB = hexToRGB(CELL_COLOR), backgroundRGB = hexToRGB(NO_COLOR);

function drawPolyomino() {
  if (!latest) return;
  const d = polyominoDomain(latest);
  const pen = fitPicture(view, d, MAX_PICTURE_HEIGHT, true);
  paintDomain(view, pen, d, function (v) { return v; }, function () { return cellRGB; }, backgroundRGB,
              CELL_LINES, SMALLEST_BORDERED_CELL);
  pen.restore();
}

useTorus(view, false);      // a picture that moves and zooms (js/sim-view.js)
connectPicture(view);
window.addEventListener("resize", drawSoon);


/* =====================================================================
   5. STATISTICS
   ---------------------------------------------------------------------
   The chain's numbers now (js/sim-polyomino.js says how each is kept),
   and two charts over the moves.
   ===================================================================== */
function showStats() {
  if (!latest) return;
  const s = latest;
  byId("stat-cells").textContent = cells.toLocaleString();
  byId("stat-moves").textContent = s.moves.toLocaleString();
  byId("stat-changed").textContent = s.changed.toLocaleString() +
    (s.moves > 0 ? " (" + (100 * s.changed / s.moves).toFixed(1) + "%)" : "");
  byId("stat-edge").textContent = s.edgePerimeter.toLocaleString();
  byId("stat-cycles").textContent = s.cycles.toLocaleString();
  byId("stat-site").textContent = s.sitePerimeter.toLocaleString();
  byId("stat-holes").textContent = s.holes.toLocaleString();
  byId("stat-box").textContent = s.width + " × " + s.height;

  plotOverTime(byId("perimeter-chart"), s.traceTimes, [
    { values: s.traceEdge, color: CHART_LINE },
    { values: s.traceSite, color: CHART_LIGHT },
  ], "move");
  plotOverTime(byId("cycles-chart"), s.traceTimes, [
    { values: s.traceCycles, color: CHART_LINE },
    { values: s.traceHoles, color: CHART_LIGHT },
  ], "move");
}


/* =====================================================================
   6. CONNECTING THE BUTTONS ON THE PAGE
   ---------------------------------------------------------------------
   N, K, b and s: each slider and its box move together
   (connectSliderAndBox, js/sim-page.js; K, b and s with
   connectPolyominoOptions, js/sim-polyomino.js). N restarts; K, b and s
   change the chain as it runs.
   ===================================================================== */
const showCells = connectSliderAndBox("cells-slider", "cells-box", function (value) {
  cells = showCells(value);
  restart();
});
const chainSettings = connectPolyominoOptions(sendSettings);   // { most, edgeHeat, siteHeat }

// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
byId("cells-box").max = MAX_CELLS;
byId("seed").value = DEFAULTS.seed;
showCells(cells);
restart();
