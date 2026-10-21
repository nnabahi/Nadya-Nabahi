/* =====================================================================
   uniform-discrete-tiling.js  —  the page of the "Uniform Discrete Tiling" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, an Aztec diamond, or
       a custom one drawn in the graph tool (shown inside this page).
       The cells can also be triangles or hexagons (a box, a torus, or
       for triangles a hexagon); then the tile is two neighboring cells. The
       domain code is shared with the other sims: the domains in
       js/sim-domains.js, and their options and the graph tool in
       js/sim-controls.js.
     - Reads the tiles (rectangles, each with a weight) and the options.
     - Hands everything to the chain (uniform-discrete-tiling-chain.js), which runs
       in a second thread (a "Web Worker"), and draws every packing it
       sends back, with the statistics.
     - With "A click: highlights its cluster" picked, a click on a cell
       highlights its cluster: the cells joined to it through tiles of
       its color (js/sim-highlight.js).
   Small helpers used by every sim page (byId, readWhole, ...) are in
   js/sim-page.js, and the charts (lineChart, ...) in js/sim-charts.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the chain
     4. Colors
     5. Drawing the packing
     6. Moving and zooming the picture
     7. Statistics
     8. The domain
     9. The tiles
    10. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain (a 24 x 24 box), Aztec diamond order, side of the
// hexagon of triangles, mean radius, refill limit and seed.
const DEFAULTS = { width: 24, height: 24, order: 20, side: 12, radius: 1.5, limit: 10000, seed: "1" };

// The tile presets: lists of [width, height].
const PRESETS = {
  squares:  [[2, 2], [3, 3]],
  dominoes: [[2, 1]],
  twoone:   [[2, 2], [1, 1]],
};
const DEFAULT_PRESET = "squares";

const MAX_SIDE = 200;             // the biggest box or torus is 200 x 200
const MAX_ORDER = 100;            // the biggest Aztec diamond (20,200 cells)
const MAX_SIDE_HEXAGON = 60;      // the biggest hexagon of triangles (21,600 cells)
const MAX_WEIGHT_SLIDER = 5;      // the weight sliders go from 0 to 5 (the boxes take any number >= 0)
const MAX_TILE_SIDE = 20;         // tiles at most 20 x 20
const WORK_LIMIT = 200000;        // search steps per move before it is skipped (see the chain)
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const DISK = "#d0312d";           // the outline of the last move's disk

// The speeds on the Speed slider, in moves per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every move.
const SPEEDS = [1, 100, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 5;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let lattice = "square";         // the cells: "square", "triangle" or "hexagon"
let domain = null;              // the domain (js/sim-domains.js); its kind is domains.kind (section 8)
let tiles = [];                 // the tiles: [{ w, h, weight }, ...]

let placements = null;          // the chain's list of tile positions (section 1 of the chain)
let latest = null;              // the latest packing, numbers and run so far from the chain
const highlight = newHighlight();   // the clicked cell, whose cluster is highlighted (js/sim-highlight.js)

// A small helper for this page: is "Average over time" ticked? (checked
// is in js/sim-page.js. Used below: defaultColor and hexToRGB are in
// js/sim-colors.js.)
function showingAverage() { return checked("show") === "average"; }


/* =====================================================================
   3. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is the function tilePacking() in uniform-discrete-tiling-chain.js,
   with cellAt, wrap, cellCorners, pointInCell and countPieces with the
   search behind it (js/sim-domains.js), the trace (js/sim-worker.js)
   and the colors (section 7 of the chain file) copied in. runInWorker (js/sim-page.js) runs it in a second thread, a
   "Web Worker", so the page never freezes, and hands each report to
   the function below.
   ===================================================================== */
const sim = runInWorker(tilePacking, [wrap, cellAt, cellCorners, pointInCell, countPieces, findRegions, spreadRegion,
                                      newTrace, keepSample, colorScheme, cellColors], function (message) {
  if (message.placements) {    // a new run's first report
    placements = message.placements;
    showMessage(message.error);
  }
  latest = message;
  drawSoon();
});

// Start again, paused: a new starting packing, with the current domain,
// tiles, options and seed.
function restart() {
  latest = null;
  placements = null;
  showMessage("");
  sim.setup({
    domain: domain, tiles: tiles,
    rotations: byId("rotations").checked, gaps: byId("gaps").checked,
    meanRadius: Number(byId("set-radius").value), sizeLimit: readWhole("set-limit", 1, 1e9, DEFAULTS.limit),
    workLimit: WORK_LIMIT, seed: byId("seed").value, heat: showingAverage(),
  });
}

// The mean radius and the refill limit change how fast the chain mixes,
// not where it ends up, so they are sent without restarting.
function sendMoveSettings() {
  sim.send({
    type: "settings", meanRadius: Number(byId("set-radius").value),
    sizeLimit: readWhole("set-limit", 1, 1e9, DEFAULTS.limit),
  });
}

// New weights while it runs: the chain carries on with them, like a
// Desmos slider. (A weight going to or from 0 changes which tiles are
// used, so then it restarts instead: see section 9.)
function sendWeights() {
  sim.send({ type: "weights", weights: tiles.map(function (t) { return t.weight; }) });
}


// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "move", "moves", restart);


/* =====================================================================
   4. COLORS
   ---------------------------------------------------------------------
   The chain sorts every covered cell into a "class", and the "Color by"
   menu says how classes are colored (colorScheme and cellColors, in
   section 7 of uniform-discrete-tiling-chain.js, which also says what
   the classes and the CLUSTERS are). The last class is "empty". The
   colors are the old site's (defaultColor in js/sim-colors.js).
   ===================================================================== */

// The colors of the "Color by" choice picked.
function shownScheme() { return colorScheme(byId("color-by").value, placements, tiles.length); }

// Each class's color, as [red, green, blue].
function classColors() {
  const scheme = shownScheme();
  const colors = [];
  for (let c = 0; c < 2 * placements.orientW.length; c++) colors.push(defaultColor(scheme.of(c), scheme.count));
  colors.push(NO_COLOR);   // empty cells (js/sim-colors.js)
  return colors.map(hexToRGB);
}

// The class of the cell covered by placement p (-1 = empty, the last of
// the "classes" classes).
function classOf(p, classes) { return p < 0 ? classes - 1 : placements.tileClass[p]; }


/* =====================================================================
   5. DRAWING THE PACKING
   ---------------------------------------------------------------------
   As in the other sims, the picture goes in a box in the middle of the
   canvas, and can be moved and zoomed (js/sim-view.js): drag it, use
   the mouse wheel or a pinch, or the + / − / Reset buttons. On a torus
   it wraps around, and zoomed out it shows several times.

   The squares are painted by paintCells (js/sim-view.js), as in the
   other sims, each in its tile's class color. When cells are big
   enough on screen (zoomed in, or a small domain), a dark line goes
   along every side where two different tiles meet (an empty cell counts
   as different), or where the domain ends. Then the last move's disk
   is drawn on top.

   "Average over time" colors each cell by mixing the class colors, each
   weighted by the share of the time the cell spent in that class (the
   chain's heat map), with no lines.

   A highlighted cluster (section 6) stands out in "The packing now":
   every tile outside it fades (js/sim-highlight.js).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawPacking(); showStats(); });

// Where the picture goes, and how far it is moved and zoomed. Cells at
// least SMALLEST_BORDERED_CELL pixels big get a whole number of pixels,
// so the lines sit exactly on the cell edges.
const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

function drawPacking() {
  if (!domain || !latest || !placements || simCanvas.hidden) return;
  const d = domain, owner = latest.owner;
  const average = showingAverage() && latest.heat;
  const colors = classColors(), classes = colors.length;
  findHighlight(highlight, d, cellColors(owner, placements, shownScheme()));
  showHighlightInfo();

  // 1. Size the canvas and place the picture's box (js/sim-view.js).
  const pen = fitPicture(view, d, MAX_PICTURE_HEIGHT);
  const outside = hexToRGB(OUTSIDE_CELLS);

  // The mix of the class colors for "Average over time".
  const averageRGB = function (v) {
    const rgb = [0, 0, 0];
    for (let c = 0; c < classes; c++) {
      const share = latest.heat[v * classes + c];
      for (let k = 0; k < 3; k++) rgb[k] += share * colors[c][k];
    }
    return rgb;
  };

  if (d.lattice) {
    // 2-3. Triangles or hexagons: each cell drawn as its shape
    //    (paintLattice, js/sim-view.js), with the lines around the tiles.
    const css = function (rgb) { return "rgb(" + rgb.map(Math.round).join(",") + ")"; };
    if (average) paintLattice(view, pen, d, function (v) { return css(averageRGB(v)); });
    else {
      paintLattice(view, pen, d, highlightCSS(highlight, function (v) { return css(colors[classOf(owner[v], classes)]); }),
                   cellSize(view) >= SMALLEST_BORDERED_CELL ? function (v) { return owner[v]; } : null,
                   CELL_LINES);
    }
  } else if (average) {
    // 2. "Average over time": each cell is its own group (paintCells,
    //    js/sim-view.js), painted in the mix of the class colors.
    paintCells(view, pen, d, function (v) { return v; }, averageRGB, outside);
  } else {
    // 2. Each square's group is the tile on it (-1 for an empty cell),
    //    painted in the tile's class color (faded, outside a highlighted
    //    cluster: a tile is all in it or all out). "tileOn" is the tile
    //    on each square that shows, and -2 outside the domain.
    const tilesInAll = placements.anchor.length;
    const tileOn = paintCells(view, pen, d, highlightGroups(highlight, function (v) { return owner[v]; }, tilesInAll),
      highlightRGB(function (tile) { return colors[classOf(tile, classes)]; }, tilesInAll), outside);

    // 3. The lines around the tiles: between two squares covered by
    //    different tiles (so two empty cells side by side get no line,
    //    and the domain's edge always gets one).
    if (view.cell >= SMALLEST_BORDERED_CELL) drawBorders(view, pen, tileOn, CELL_LINES);
  }

  // 4. The disk. Its center is (i, k) from the top left of the picture's
  //    box (pictureBox, js/sim-domains.js: for squares, cell (x, y) has
  //    its middle (x - xmin + 1/2) from the left and (ymax - y + 1/2)
  //    from the top). On a torus it is drawn again one torus over, in
  //    every direction, as far as the picture shows.
  if (byId("show-disk").checked && !average && latest.stats.lastDisk) {
    const disk = latest.stats.lastDisk, box = pictureBox(d);
    const i = disk.x - box.left, k = box.top - disk.y;
    let W = 0, H = 0;
    if (d.wrap) {
      W = d.lattice ? box.right - box.left : d.wrap.xmax - d.wrap.xmin + 1;
      H = d.lattice ? box.top - box.bottom : d.wrap.ymax - d.wrap.ymin + 1;
    }
    const firstI = -view.scroll.x - 1, lastI = view.width / view.cell - view.scroll.x + 1;
    const firstK = -view.scroll.y - 1, lastK = view.height / view.cell - view.scroll.y + 1;
    const shiftsX = [0], shiftsY = [0];
    if (W) {
      for (let a = Math.floor((firstI - i - disk.r) / W); a <= Math.ceil((lastI - i + disk.r) / W); a++) if (a !== 0) shiftsX.push(a * W);
      for (let b = Math.floor((firstK - k - disk.r) / H); b <= Math.ceil((lastK - k + disk.r) / H); b++) if (b !== 0) shiftsY.push(b * H);
    }
    pen.strokeStyle = DISK;
    pen.lineWidth = 2;
    for (const sx of shiftsX) {
      for (const sy of shiftsY) {
        pen.beginPath();
        pen.arc(view.left + (i + sx + view.scroll.x) * view.cell, (k + sy + view.scroll.y) * view.cell,
                Math.max(disk.r * view.cell, 1), 0, 2 * Math.PI);
        pen.stroke();
      }
    }
  }
  pen.restore();
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. MOVING AND ZOOMING THE PICTURE
   ---------------------------------------------------------------------
   The code is shared with the other sims (connectPicture,
   js/sim-view.js): drag to move, mouse wheel or
   pinch to zoom, and the + / − / Reset buttons.

   A click (a press that hardly moves) does what is picked under the
   picture:
     - it makes one move of the chain with its disk centered on the
       clicked cell: the tiles there are deleted and the region is
       refilled at random, as if the chain had dropped its disk on that
       spot.
     - or it highlights the clicked cell's cluster (js/sim-highlight.js),
       which follows that cell as the chain runs. Clicking the cluster
       again, or outside the cells, shows everything again.
   ===================================================================== */
connectPicture(view, null, null, function (event) {
  if (!domain) return;
  const v = cellUnder(view, domain, pointerSpot(view, event));
  if (checked("click") === "highlight") {
    if (latest && placements) clickHighlight(highlight, v, cellColors(latest.owner, placements, shownScheme()));
    drawSoon();
    return;
  }
  if (v < 0) return;
  const middle = cellMiddle(domain, v);   // (js/sim-domains.js)
  sim.send({ type: "click", x: middle[0], y: middle[1] });
});


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   The chain counts the tiles and the cells they cover (a tile and its
   turned copy together), and the empty cells. It also keeps the run so
   far for the charts (section 6 of the chain file): over the moves, the
   share of the cells covered by each tile and the share left empty, and
   the clusters of every "Color by" choice, so the clusters chart shows
   the whole run whichever is picked.
   ===================================================================== */

// The line under the picture about the highlight: shown while a cluster
// is highlighted, or while a click highlights.
function showHighlightInfo() {
  byId("highlight-info").textContent = highlightTextIf(highlight, checked("click") === "highlight", "cluster", function (k) {
    return byId("color-by").value === "tile" ? tileName(tiles[k]).replace("&times;", "×") + " tiles" : "color " + (k + 1);
  });
}

// A tile's name in the table: "2 × 3", or on triangles and hexagons
// the pair of cells.
function tileName(t) {
  if (lattice === "triangle") return "rhombus";
  if (lattice === "hexagon") return "pair of hexagons";
  return t.w + " &times; " + t.h;
}

function showStats() {
  if (!domain || !latest || !placements) return;
  const s = latest.stats;
  const tried = Math.max(s.moves, 1), used = Math.max(s.moves - s.skipped, 1);
  byId("stat-cells").textContent = domain.n.toLocaleString();
  byId("stat-moves").textContent = s.moves.toLocaleString();
  byId("stat-changed").textContent = s.changed.toLocaleString() + " (" + (100 * s.changed / tried).toFixed(1) + "%)";
  byId("stat-skipped").textContent = s.skipped.toLocaleString();
  byId("stat-region").textContent = s.moves ? (s.regionTotal / tried).toFixed(1) : "";
  byId("stat-choices").textContent = s.moves ? (s.choicesTotal / used).toFixed(2) : "";

  // One row per tile, and one for the gaps (colorRow, js/sim-page.js).
  const c = s.cover, names = defaultColors(tiles.length);
  const cellsAndShare = function (cells) { return cells.toLocaleString() + " (" + (100 * cells / domain.n).toFixed(1) + "%)"; };
  let rows = "";
  tiles.forEach(function (t, k) {
    rows += colorRow(names[k], tileName(t), [c.count[k].toLocaleString(), cellsAndShare(c.cells[k])]);
  });
  rows += colorRow(NO_COLOR, "gaps", ["", cellsAndShare(c.empty)]);
  byId("tile-stats").innerHTML = rows;
  drawCoverChart();
  drawClustersChart();
}

// The number of clusters of each color (in the "Color by" choice picked)
// over the moves, and a gray line for all of them (js/sim-charts.js).
function drawClustersChart() {
  const scheme = shownScheme(), clusters = latest.traceClusters[byId("color-by").value];
  const now = clusters.slice(clusters.length - scheme.count);   // the last sample
  byId("stat-clusters").textContent = now.reduce(function (a, b) { return a + b; }, 0).toLocaleString();
  regionsChart(byId("clusters-chart"), latest.traceTimes, clusters, scheme.count,
               function (k) { return defaultColor(k, scheme.count); }, "moves");
}

// One line per tile (in its color) and a gray one for gaps: the share of
// the cells, from 0 to 1, against the number of moves.
function drawCoverChart() {
  const lineColors = defaultColors(tiles.length).concat([CHART_TEXT]);
  plotOverTime(byId("cover-chart"), latest.traceTimes, colorLines(latest.traceShares, latest.traceTimes.length,
               lineColors.length, function (k) { return lineColors[k]; }), "moves", 1);
}


/* =====================================================================
   8. THE DOMAIN
   ---------------------------------------------------------------------
   Box / Torus / Aztec diamond / Hexagon / Custom, and their options
   (connectDomains, js/sim-controls.js). Custom swaps the picture for
   the graph tool, where any region will do (it may be in several
   pieces). The Aztec diamond and Custom are on squares only, the
   Hexagon on triangles only.
   ===================================================================== */
const domains = connectDomains({
  view: view, player: player,
  box: latticeBoxFromOptions,
  custom: {
    check: function (drawing) {
      const cells = drawing.graph.vertices.length;
      return cells === 0 ? ["Paint the region first.", ""] : ["", cells + " cells."];
    },
  },
  kinds: { aztec: function () { useAztec(true); }, hexagon: function () { useHexagon(true); } },
  use: function (d) {
    domain = d;
    clearHighlight(highlight);
    restart();
  },
  show: function () {
    const kind = domains.kind;
    byId("aztec-choice").hidden = byId("custom-choice").hidden = lattice !== "square";
    byId("hexagon-choice").hidden = lattice !== "triangle";
    if (kind === "aztec" || kind === "hexagon") byId("size-row").hidden = true;
    byId("order-row").hidden = kind !== "aztec";
    byId("side-row").hidden = kind !== "hexagon";
  },
});

// The box or torus the options say, on the lattice in use. Triangles and
// hexagons use latticeBox (js/sim-domains.js); a torus of them needs an
// even height, and of triangles an even width too, so an odd one goes
// up by 1.
function latticeBoxFromOptions() {
  if (lattice === "square") return boxFromOptions(1, MAX_SIDE, DEFAULTS);   // (4 neighbors)
  const torus = checked("domain") === "torus";
  let width = readWhole("set-width", 1, MAX_SIDE, DEFAULTS.width);
  let height = readWhole("set-height", 1, MAX_SIDE, DEFAULTS.height);
  if (torus && height % 2 === 1) byId("set-height").value = ++height;
  if (torus && lattice === "triangle" && width % 2 === 1) byId("set-width").value = ++width;
  return latticeBox(lattice, width, height, torus);
}

// The hexagon of triangles (triangleHexagon, js/sim-domains.js): the
// lozenge tilings of the arctic circle pictures. Choosing it switches to
// no gaps, colored by direction; both can be changed afterwards.
function useHexagon(switchOptions) {
  const side = readWhole("set-side", 1, MAX_SIDE_HEXAGON, DEFAULTS.side);
  if (switchOptions) {
    byId("gaps").checked = false;
    showGapsInfo();
    byId("color-by").value = "direction";
  }
  domains.use("hexagon", triangleHexagon(side));
}

// The Aztec diamond (aztecDiamond is in js/sim-domains.js). Choosing it
// switches to dominoes with no gaps, the tiling of the arctic circle
// theorem, colored by direction and checkerboard (the 4 colors of the
// arctic circle pictures); all can be changed afterwards.
function useAztec(switchTiles) {
  const order = readWhole("set-order", 1, MAX_ORDER, DEFAULTS.order);
  if (switchTiles) {
    usePreset("dominoes");
    byId("gaps").checked = false;
    showGapsInfo();
    byId("color-by").value = "checker";
  }
  domains.use("aztec", aztecDiamond(order));
}

// The Cells menu: squares, triangles or hexagons. Squares go back to the
// tile preset and a box; triangles start on the hexagon; hexagons on a
// box. On triangles and hexagons the only tile is a pair of cells.
function useLattice() {
  lattice = byId("set-lattice").value;
  byId("square-tiles").hidden = lattice !== "square";
  byId("pair-tiles").hidden = lattice === "square";
  if (lattice === "square") { usePreset(DEFAULT_PRESET); domains.useBox(); return; }
  tiles = [{ w: 2, h: 1, weight: 1 }];
  if (lattice === "triangle") useHexagon(true);
  else { byId("color-by").value = "direction"; domains.useBox(); }
}


/* =====================================================================
   9. THE TILES
   ---------------------------------------------------------------------
   One row per tile: its width and height, a button to remove it, and
   under them its weight, as a number box and a slider. Changing a size
   restarts the chain (a new starting packing). Moving a weight lets the
   chain carry on with the new weight, like a Desmos slider, unless the
   weight goes to or from 0 (that adds or removes the tile: a restart).
   ===================================================================== */
function showTileRows() {
  const names = defaultColors(tiles.length);
  let html = "";
  tiles.forEach(function (t, k) {
    html += '<div class="option-row">' + swatch(names[k]) +
      '<input type="number" min="1" max="' + MAX_TILE_SIDE + '" step="1" value="' + t.w + '" data-tile="' + k + '" data-side="w">' +
      ' &times; <input type="number" min="1" max="' + MAX_TILE_SIDE + '" step="1" value="' + t.h + '" data-tile="' + k + '" data-side="h">' +
      (tiles.length > 1 ? ' <button class="tool-button" data-remove="' + k + '" title="Remove this tile">Remove</button>' : "") +
      "</div>" +
      '<div class="option-row">weight <input type="number" min="0" step="0.05" value="' + t.weight + '" data-weight-box="' + k + '">' +
      ' <input type="range" class="wide-range" min="0" max="' + MAX_WEIGHT_SLIDER + '" step="0.05" value="' +
      Math.min(t.weight, MAX_WEIGHT_SLIDER) + '" data-weight-slider="' + k + '"></div>';
  });
  byId("tile-rows").innerHTML = html;
}

// Use a new weight for tile k (from its box or its slider).
function setWeight(k, weight) {
  if (!isFinite(weight) || weight < 0) weight = 1;
  const before = tiles[k].weight;
  tiles[k].weight = weight;
  const row = byId("tile-rows");
  row.querySelector('[data-weight-box="' + k + '"]').value = weight;
  row.querySelector('[data-weight-slider="' + k + '"]').value = Math.min(weight, MAX_WEIGHT_SLIDER);
  if ((before > 0) !== (weight > 0)) restart();   // the tile comes in or goes out
  else sendWeights();
}

function usePreset(name) {
  tiles = PRESETS[name].map(function (t) { return { w: t[0], h: t[1], weight: 1 }; });
  byId("preset").value = name;
  showTileRows();
}

// Any change by hand makes the preset "My own tiles".
function tilesEdited() {
  byId("preset").value = "mine";
  showTileRows();
  restart();
}

byId("tile-rows").addEventListener("input", function (event) {
  const slider = event.target.dataset.weightSlider;
  if (slider !== undefined) setWeight(Number(slider), Number(event.target.value));
});
byId("tile-rows").addEventListener("change", function (event) {
  const box = event.target;
  if (box.dataset.weightBox !== undefined) { setWeight(Number(box.dataset.weightBox), Number(box.value)); return; }
  if (!box.dataset.tile) return;
  let v = Math.round(Number(box.value));
  if (!isFinite(v) || v < 1) v = 1;
  tiles[Number(box.dataset.tile)][box.dataset.side] = Math.min(v, MAX_TILE_SIDE);
  tilesEdited();
});
byId("tile-rows").addEventListener("click", function (event) {
  const remove = event.target.dataset.remove;
  if (remove === undefined) return;
  tiles.splice(Number(remove), 1);
  tilesEdited();
});
byId("add-tile").addEventListener("click", function () {
  tiles.push({ w: 2, h: 1, weight: 1 });
  tilesEdited();
});
byId("preset").addEventListener("change", function () {
  if (this.value === "mine") return;
  usePreset(this.value);
  restart();
});


/* =====================================================================
   10. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// What "Allow gaps" means, under the box.
function showGapsInfo() {
  byId("gaps-info").textContent = byId("gaps").checked
    ? "Gaps allowed: empty cells only where no tile fits (a maximal packing)."
    : "No gaps: every cell covered. The start is built without a search, so some domains can't get one.";
}

// The Aztec diamond's order, the hexagon's side, and the Cells menu.
byId("set-order").addEventListener("change", function () { useAztec(false); });
byId("set-side").addEventListener("change", function () { useHexagon(false); });
byId("set-lattice").addEventListener("change", useLattice);

// Rotations and gaps: a new start.
byId("rotations").addEventListener("change", restart);
byId("gaps").addEventListener("change", function () { showGapsInfo(); restart(); });

// The move: the radius slider and number box move together
// (connectSliderAndBox, js/sim-page.js), and the chain carries on with
// the new value while you drag, like a Desmos slider.
const showRadius = connectSliderAndBox("radius-slider", "set-radius", function (r) { showRadius(r); sendMoveSettings(); });
byId("set-limit").addEventListener("change", sendMoveSettings);
byId("show-disk").addEventListener("change", drawSoon);

// The picture.
byId("color-by").addEventListener("change", drawSoon);
for (const radio of document.querySelectorAll('input[name="click"]')) radio.addEventListener("change", drawSoon);
for (const radio of document.querySelectorAll('input[name="show"]')) {
  radio.addEventListener("change", function () {
    sim.send({ type: "heat", on: showingAverage() });
    drawSoon();
  });
}
byId("reset-average").addEventListener("click", function () { sim.send({ type: "resetHeat" }); });


// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE);
byId("set-order").value = DEFAULTS.order;
byId("set-order").max = MAX_ORDER;
byId("set-side").value = DEFAULTS.side;
byId("set-side").max = MAX_SIDE_HEXAGON;
showRadius(DEFAULTS.radius);
byId("set-limit").value = DEFAULTS.limit;
byId("seed").value = DEFAULTS.seed;
showGapsInfo();
usePreset(DEFAULT_PRESET);
domains.useTicked();
