/* =====================================================================
   sequential-discrete-tiling.js  —  the page of the "Sequential
   Discrete Tiling" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Makes the domain D: a uniform polyomino (made by the Uniform
       Polyomino sim's chain, js/sim-polyomino.js, in a second thread of
       its own), a box, or a region drawn in the graph tool.
     - Hands D to the packing (newSquareTiling,
       sequential-discrete-tiling-packing.js), which runs in a second
       thread, and draws every packing it sends back: each tile colored
       by its size or by when it was placed, the last tile outlined and
       its cell U marked, with the statistics.
     - A click on an uncovered cell places the next tile with U = that
       cell.
     - A new domain, a new seed or Restart goes back to no tiles,
       paused. (A new seed also makes a new polyomino.)

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the packing
     4. The domain
     5. Drawing the packing
     6. Statistics
     7. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain (a uniform polyomino with 200 cells, after 300,000
// moves of its chain, about enough for 200 cells to forget the
// straight line it starts from), the box's default size, and the seed.
const DEFAULTS = { cells: 200, moves: 300000, width: 30, height: 20, seed: "1" };

const MAX_CELLS = 5000;           // the polyomino's most cells
const MAX_MOVES = 1e8;            // ... and most moves
const MAX_SIDE = 300;             // the box's longest side
const MAX_PICTURE_HEIGHT = 500;   // in screen pixels
const LAST_TILE = "#1e1e1e";      // the last tile's outline, and the dot on its U
const OUTSIDE_RGB = hexToRGB(OUTSIDE_CELLS), UNCOVERED_RGB = hexToRGB(NO_COLOR);   // (js/sim-colors.js)

// The speeds on the Speed slider, in tiles per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every tile.
const SPEEDS = [1, 1000, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domain = null;     // D, as a domain (js/sim-domains.js)
let latest = null;     // the packing's latest report (sequential-discrete-tiling-packing.js)


/* =====================================================================
   3. RUNNING THE PACKING
   ---------------------------------------------------------------------
   runInWorker (js/sim-page.js) runs squareTilingWorker in a second
   thread, with the packing and its helpers copied in.
   ===================================================================== */
const sim = runInWorker(squareTilingWorker, [newSquareTiling, seededUniform, squareEuler, newTrace, keepSample],
  function (message) {
    latest = message;
    drawSoon();
  });

// Back to no tiles on D (paused), with the seed in the Seed box.
function restart() {
  latest = null;
  if (domain) sim.setup({ x: domain.x, y: domain.y, seed: byId("seed").value });
  drawSoon();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "tile", "tiles", restart);


/* =====================================================================
   4. THE DOMAIN
   ---------------------------------------------------------------------
   Uniform polyomino / Box / Custom, and their options (connectDomains,
   js/sim-controls.js). The polyomino is made in a second thread of its
   own (it takes a moment), with its own random numbers from the seed:
   the same seed gives the same polyomino. Its chain has the Uniform
   Polyomino sim's options K, b and s (connectPolyominoOptions,
   js/sim-polyomino.js), and a change to any of them makes a new one.
   Custom swaps the picture for the graph tool, where any region will do
   (it may be in several pieces), but not on a torus: D must be a finite
   part of the plane.
   The picture's view (section 5) is made first: the graph tool goes
   right under it.
   ===================================================================== */
const simCanvas = byId("sim-canvas");
const drawSoon = oncePerFrame(function () { drawPacking(); showStats(); });
const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

const domains = connectDomains({
  view: view, player: player,
  box: function () { return boxFromOptions(1, MAX_SIDE, DEFAULTS); },
  custom: {
    help: "Paint the cells to tile (any color counts), on a flat grid. Then press Done.",
    check: function (drawing) {
      const cells = drawing.graph.vertices.length;
      if (cells === 0) return ["Paint the region first.", ""];
      if (drawing.grid.torus) return ["Turn the torus off (in the tool's options): the region must be flat.", ""];
      return ["", cells + " cells."];
    },
  },
  kinds: { polyomino: makePolyomino },
  use: function (d) {
    domain = d;
    restart();
  },
  show: function () {
    const onPolyomino = domains.kind === "polyomino";
    byId("polyomino-rows").hidden = !onPolyomino;
    if (onPolyomino) byId("size-row").hidden = true;
  },
});

// The second thread that makes a polyomino: it gets the options of
// polyominoCells (js/sim-polyomino.js) and sends back the cells.
function polyominoMaker() {
  onmessage = function (event) {
    const cells = polyominoCells(event.data);
    postMessage({ x: cells.x, y: cells.y });
  };
}
let maker = null;     // the one at work (null when none is)

// A new polyomino, from the N and moves boxes, the chain's options and
// the seed. One still at work on older settings is stopped.
function makePolyomino() {
  if (maker) maker.terminate();
  const cells = readWhole("polyomino-cells", 1, MAX_CELLS, DEFAULTS.cells);
  const moves = readWhole("polyomino-moves", 0, MAX_MOVES, DEFAULTS.moves);
  showMessage("Making a uniform polyomino with " + cells.toLocaleString() + " cells (" +
              moves.toLocaleString() + " moves of its chain)...");
  maker = startWorker(polyominoMaker, polyominoHelpers());
  maker.onmessage = function (event) {
    maker.terminate();
    maker = null;
    showMessage("");
    domains.use("polyomino", polyominoDomain(event.data));
  };
  maker.postMessage(Object.assign({ cells: cells, moves: moves, seed: "domain " + byId("seed").value }, chainSettings));
}

// The chain's K, b and s: { most, edgeHeat, siteHeat }, kept up to date.
const chainSettings = connectPolyominoOptions(function () { if (domains.kind === "polyomino") makePolyomino(); });


/* =====================================================================
   5. DRAWING THE PACKING
   ---------------------------------------------------------------------
   D's cells are painted like any sim's cells (paintDomain,
   js/sim-view.js), each tile its own group, so once cells are big
   enough a thin line goes around every tile and around D. Uncovered
   cells are white. Tiles are colored by size (dark blue for 1 x 1, red
   for the biggest so far) or by when they were placed (dark blue
   first, red last), with heatColor (js/sim-colors.js). The last tile is
   outlined, with a dot on its U.
   ===================================================================== */

// Each tile's color, as [red, green, blue].
function tileColors(s) {
  const bySize = byId("color-by").value === "size", colors = new Array(s.placed);
  for (let t = 0; t < s.placed; t++) {
    colors[t] = heatColor(bySize ? (s.largest > 1 ? (s.sizes[t] - 1) / (s.largest - 1) : 0)
                                 : (s.placed > 1 ? t / (s.placed - 1) : 0));
  }
  return colors;
}

function drawPacking() {
  if (!domain || simCanvas.hidden) return;
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  const s = latest, colors = s ? tileColors(s) : [];
  paintDomain(view, pen, domain, function (v) { return s ? s.tileOf[v] : -1; },
              function (t) { return t < 0 ? UNCOVERED_RGB : colors[t]; }, OUTSIDE_RGB, CELL_LINES, SMALLEST_BORDERED_CELL);
  if (s && s.last) drawLastTile(pen, s.last);
  pen.restore();
}

// The last tile's outline, and a dot on its U.
function drawLastTile(pen, last) {
  const [left, top, width, height] = squareRect(view, domain, last.x, last.y, last.size, last.size);
  pen.strokeStyle = LAST_TILE;
  pen.lineWidth = 2;
  pen.strokeRect(left, top, width, height);
  const [uLeft, uTop, uWidth] = squareRect(view, domain, domain.x[last.u], domain.y[last.u], 1, 1);
  pen.fillStyle = LAST_TILE;
  pen.beginPath();
  pen.arc(uLeft + uWidth / 2, uTop + uWidth / 2, Math.max(1.5, uWidth / 5), 0, 2 * Math.PI);
  pen.fill();
}

// Clicking an uncovered cell places the next tile with U = that cell.
useTorus(view, false);      // a picture that moves and zooms (js/sim-view.js)
connectPicture(view, {
  onClick: function (event) {
    if (!domain || !latest) return;
    const v = cellUnder(view, domain, pointerSpot(view, event));
    if (v >= 0 && latest.tileOf[v] === -1) sim.send({ type: "click", cell: v });
  },
});
window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   The packing's numbers now, and four charts: the Betti numbers and
   the share covered against the tiles placed (from the packing's
   trace), the side k_n of each tile n, and how many tiles there are of
   each side (one bar per side).
   ===================================================================== */
function showStats() {
  if (!domain) return;
  const s = latest, n = domain.n;
  byId("stat-cells").textContent = n.toLocaleString();
  if (!s) return;
  byId("stat-placed").textContent = s.placed.toLocaleString();
  byId("stat-covered").textContent = s.covered.toLocaleString() + " (" + (100 * s.covered / n).toFixed(1) + "%)";
  byId("stat-pieces").textContent = s.pieces.toLocaleString();
  byId("stat-holes").textContent = s.holes.toLocaleString();
  byId("stat-largest").textContent = s.largest > 0 ? s.largest + " × " + s.largest : "";
  byId("stat-last").textContent = s.last ? s.last.size + " × " + s.last.size : "";

  plotOverTime(byId("betti-chart"), s.traceTimes, [
    { values: s.tracePieces, color: CHART_LINE },
    { values: s.traceHoles, color: CHART_LIGHT },
  ], "tiles placed");
  plotOverTime(byId("covered-chart"), s.traceTimes, [{ values: s.traceCovered, color: CHART_LINE }], "tiles placed", 100);
  sizeCharts(s);
}

// The side of each tile against its number, and the number of tiles of
// each side.
function sizeCharts(s) {
  const points = Array.from(s.sizes, function (k, t) { return [t + 1, k]; });
  lineChart(byId("size-chart"), [{ points: points, dots: true, radius: 1.5, color: CHART_LINE }],
            { from: 0, to: Math.max(1, s.placed), whole: true, word: "tile n" },
            { from: 0, to: Math.max(1, s.largest), round: true, whole: true, word: "side k" });
  const counts = new Array(s.largest + 1).fill(0);
  for (const k of s.sizes) counts[k]++;
  barChart(byId("sides-chart"), wholeBars(counts).slice(1),
           { from: 0.5, to: Math.max(1, s.largest) + 0.5, whole: true, word: "side k" },
           { from: 0, to: Math.max(1, ...counts), round: true, whole: true, word: "tiles" });
}


/* =====================================================================
   7. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// The polyomino's N and moves: a new polyomino.
for (const id of ["polyomino-cells", "polyomino-moves"]) {
  byId(id).addEventListener("change", function () { if (domains.kind === "polyomino") makePolyomino(); });
}

byId("color-by").addEventListener("change", drawSoon);

// Seed: the same seed gives the same packing (and the same polyomino)
// every time.
connectSeed(function () {
  if (domains.kind === "polyomino") makePolyomino();
  else restart();
});


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE);
byId("polyomino-cells").value = DEFAULTS.cells;
byId("polyomino-cells").max = MAX_CELLS;
byId("polyomino-moves").value = DEFAULTS.moves;
byId("polyomino-moves").max = MAX_MOVES;
byId("seed").value = DEFAULTS.seed;
domains.useTicked();
