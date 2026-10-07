/* =====================================================================
   tile-packing.js  —  the page of the "Random tile packing" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, an Aztec diamond, or
       a custom one drawn in the graph tool (shown inside this page). The
       domain code is shared with the other sims: the domains in
       js/sim-domains.js, and their options and the graph tool in
       js/sim-controls.js.
     - Reads the tiles (rectangles, each with a weight) and the options.
     - Hands everything to the chain (tile-packing-chain.js), which runs
       in a second thread (a "Web Worker"), and draws every packing it
       sends back, with the statistics.
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Running the chain
     4. Colors
     5. Drawing the packing
     6. Moving and zooming the picture
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. The tiles
    10. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain (a 24 x 24 box), Aztec diamond order, mean radius,
// refill limit and seed.
const DEFAULTS = { width: 24, height: 24, order: 20, radius: 1.5, limit: 10000, seed: "1" };

// The tile presets: lists of [width, height].
const PRESETS = {
  squares:  [[2, 2], [3, 3]],
  dominoes: [[2, 1]],
  twoone:   [[2, 2], [1, 1]],
};
const DEFAULT_PRESET = "squares";

const MAX_SIDE = 200;             // the biggest box or torus is 200 x 200
const MAX_ORDER = 100;            // the biggest Aztec diamond (20,200 cells)
const MAX_WEIGHT_SLIDER = 5;      // the weight sliders go from 0 to 5 (the boxes take any number >= 0)
const MAX_TILE_SIDE = 20;         // tiles at most 20 x 20
const WORK_LIMIT = 200000;        // search steps per move before it is skipped (see the chain)
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // the lines around tiles
const GAP = "#ffffff";            // empty cells
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const DISK = "#d0312d";           // the outline of the last move's disk
const SMALLEST_BORDERED_CELL = 4; // cells smaller than this (in pixels) get no border lines

// The speeds on the Speed slider, in moves per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every move.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(5);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "box";         // "box", "torus", "aztec" or "custom": the domain in use
let domain = null;              // the domain (js/sim-domains.js)
let customDomain = null;        // the last custom domain drawn, if any
let tiles = [];                 // the tiles: [{ w, h, weight }, ...]

let playing = false;            // it starts paused; Play sets it going
let speedIndex = DEFAULT_SPEED;
let run = 0;                    // counts restarts, so leftovers from an older run are ignored

let placements = null;          // the chain's list of tile positions (section 1 of the chain)
let latest = null;              // the latest packing and numbers from the chain
let trace = null;               // the run so far, for the chart: { moves: [], shares: [] }

// A small helper for this page: is "Average over time" ticked? (checked
// is in js/sim-page.js; wrapNumber and hexToRGB, used below, are in
// js/sim-domains.js.)
function showingAverage() { return checked("show") === "average"; }


/* =====================================================================
   3. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is the function tilePacking() in tile-packing-chain.js.
   startWorker (js/sim-page.js) runs it in a second thread, a "Web
   Worker", so the page never freezes.
   ===================================================================== */
const worker = startWorker(tilePacking);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.run !== run) return;   // from an older run
  if (message.type === "ready") {
    placements = message.placements;
    showMessage(message.error);
  } else if (message.type === "state") {
    latest = message;
    addToTrace(message.stats);
    drawSoon();
  }
};

worker.onerror = function () {
  showMessage("The chain couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start again: a new starting packing, with the current domain, tiles,
// options and seed.
function restart() {
  run++;
  latest = null;
  placements = null;
  trace = { moves: [], shares: [] };
  showMessage("");
  worker.postMessage({
    type: "setup", run: run, domain: domain, tiles: tiles,
    rotations: byId("rotations").checked, gaps: byId("gaps").checked,
    meanRadius: readRadius(), sizeLimit: readWhole("set-limit", 1, 1e9, DEFAULTS.limit),
    workLimit: WORK_LIMIT, seed: byId("seed").value,
  });
  worker.postMessage({ type: "heat", on: showingAverage() });
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
}

// The mean radius and the refill limit change how fast the chain mixes,
// not where it ends up, so they are sent without restarting.
function sendMoveSettings() {
  worker.postMessage({
    type: "settings", meanRadius: readRadius(),
    sizeLimit: readWhole("set-limit", 1, 1e9, DEFAULTS.limit),
  });
}

// New weights while it runs: the chain carries on with them, like a
// Desmos slider. (A weight going to or from 0 changes which tiles are
// used, so then it restarts instead: see section 9.)
function sendWeights() {
  worker.postMessage({ type: "weights", weights: tiles.map(function (t) { return t.weight; }) });
}

function readRadius() {
  let r = Number(byId("set-radius").value);
  if (!isFinite(r) || r <= 0) r = DEFAULTS.radius;
  r = Math.min(Math.max(r, 0.1), 20);
  byId("set-radius").value = r;
  return r;
}

function setPlaying(on) {
  playing = on;
  worker.postMessage(on ? { type: "play", speed: SPEEDS[speedIndex] } : { type: "pause" });
  showPlaying(on);
}


/* =====================================================================
   4. COLORS
   ---------------------------------------------------------------------
   The chain sorts every covered cell into a "class": 2*o + parity for a
   tile of orientation o (an orientation is one tile, possibly turned),
   where parity is the checkerboard color of the tile's lower-left cell;
   the last class is "empty". The "Color by" menu says how classes are
   colored: by tile size, by orientation (direction), or by orientation
   and checkerboard together (the 4 colors of the arctic circle pictures,
   for dominoes). The colors are the old site's (defaultColor in
   js/sim-colors.js).
   ===================================================================== */
function classColors() {
  const orientations = placements.orientW.length;
  const by = byId("color-by").value;
  const colors = [];
  for (let c = 0; c < 2 * orientations; c++) {
    const o = Math.floor(c / 2);
    if (by === "tile") colors.push(defaultColor(placements.orientTile[o], tiles.length));
    else if (by === "direction") colors.push(defaultColor(o, orientations));
    else colors.push(defaultColor(c, 2 * orientations));
  }
  colors.push(GAP);
  return colors.map(hexToRGB);
}

// The class of the cell covered by placement p (-1 = empty).
function classOf(p, classes) {
  if (p < 0) return classes - 1;
  const a = placements.anchor[p];
  return 2 * placements.orient[p] + wrapNumber(domain.x[a] + domain.y[a], 2);
}


/* =====================================================================
   5. DRAWING THE PACKING
   ---------------------------------------------------------------------
   As in the other sims, the picture goes in a box in the middle of the
   canvas, and can be moved and zoomed (js/sim-view.js): drag it, use
   the mouse wheel or a pinch, or the + / − / Reset buttons. On a torus
   it wraps around, and zoomed out it shows several times.

   The view says which cell is on each screen square that shows
   (cellsShown). The packing is drawn one pixel per square (an "image"
   whose pixels we set one by one), then blown up into the picture's
   box with smoothing off, so the cells stay crisp squares. When cells
   are big enough on screen (zoomed in, or a small domain), a dark line
   goes along every side where two different tiles meet (an empty cell
   counts as different), or where the domain ends. Then the last move's
   disk is drawn on top.

   "Average over time" colors each cell by mixing the class colors, each
   weighted by the share of the time the cell spent in that class (the
   chain's heat map), with no lines.
   ===================================================================== */
const tiny = document.createElement("canvas");      // one pixel per screen square
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

  // 1. Size the canvas and place the picture's box (js/sim-view.js), and
  //    find which cell is on each screen square (-1 = none).
  const pen = fitPicture(view, d, MAX_PICTURE_HEIGHT);
  const shown = cellsShown(view, d);
  const cols = view.cols, rows = view.rows;

  // 2. One pixel per square. Row 0 of the image is the top row of squares.
  tiny.width = cols;
  tiny.height = rows;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(cols, rows);
  const pixels = image.data;                  // 4 numbers per pixel: red, green, blue, opacity
  const outside = hexToRGB(OUTSIDE);
  for (let q = 0; q < cols * rows; q++) {
    const v = shown[q];
    let rgb;
    if (v === -1) {
      rgb = outside;
    } else if (average) {
      rgb = [0, 0, 0];
      for (let c = 0; c < classes; c++) {
        const share = latest.heat[v * classes + c];
        for (let k = 0; k < 3; k++) rgb[k] += share * colors[c][k];
      }
    } else {
      rgb = colors[classOf(owner[v], classes)];
    }
    pixels[4 * q] = rgb[0]; pixels[4 * q + 1] = rgb[1]; pixels[4 * q + 2] = rgb[2];
    pixels[4 * q + 3] = 255;
  }
  tinyPen.putImageData(image, 0, 0);

  // 3. Blow it up into the picture's box, with smoothing off so the
  //    cells stay sharp squares.
  pen.imageSmoothingEnabled = false;
  const left = squareLeft(view, view.firstI), top = squareTop(view, view.firstK);
  pen.drawImage(tiny, left, top, squareLeft(view, view.lastI + 1) - left, squareTop(view, view.lastK + 1) - top);

  // 4. The lines around the tiles: between two squares covered by
  //    different tiles. Each square gets the number of the tile on it;
  //    empty cells are -1 (so two empty cells side by side get no line)
  //    and the outside is -2 (so the domain's edge always gets one).
  if (!average && view.cell >= SMALLEST_BORDERED_CELL) {
    const tileOn = Array.from(shown, function (v) { return v === -1 ? -2 : owner[v]; });
    drawBorders(view, pen, tileOn, BORDER);
  }

  // 5. The disk. Cell (x, y) has its middle (x - xmin + 1/2) cells from
  //    the left of the domain's box and (ymax - y + 1/2) from its top. On
  //    a torus it is drawn again one torus over, in every direction, as
  //    far as the picture shows.
  if (byId("show-disk").checked && !average && latest.stats.lastDisk) {
    const disk = latest.stats.lastDisk;
    const i = disk.x - d.xmin + 0.5, k = d.ymax - disk.y + 0.5;
    const W = d.wrap ? d.wrap.xmax - d.wrap.xmin + 1 : 0, H = d.wrap ? d.wrap.ymax - d.wrap.ymin + 1 : 0;
    const shiftsX = [0], shiftsY = [0];
    if (W) {
      for (let a = Math.floor((view.firstI - i - disk.r) / W); a <= Math.ceil((view.lastI - i + disk.r) / W); a++) if (a !== 0) shiftsX.push(a * W);
      for (let b = Math.floor((view.firstK - k - disk.r) / H); b <= Math.ceil((view.lastK - k + disk.r) / H); b++) if (b !== 0) shiftsY.push(b * H);
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
   js/sim-controls.js, and js/sim-view.js): drag to move, mouse wheel or
   pinch to zoom, and the + / − / Reset buttons.

   A click (a press that hardly moves) makes one move of the chain with
   its disk centered on the clicked cell: the tiles there are deleted
   and the region is refilled at random, as if the chain had dropped
   its disk on that spot.
   ===================================================================== */
connectPicture(view, null, null, function (event) {
  if (!domain) return;
  const v = cellUnder(view, domain, pointerSpot(view, event));
  if (v >= 0) worker.postMessage({ type: "click", x: domain.x[v], y: domain.y[v] });
});


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   The chain counts the tiles of each orientation and the empty cells;
   here they are added up per tile (a tile and its turned copy count
   together). The chart shows, over the moves, the share of the cells
   covered by each tile, and the share left empty.
   ===================================================================== */

// Cells covered by each tile (by number in the tile list), and empty.
function coverCounts(stats) {
  const cells = new Array(tiles.length).fill(0), count = new Array(tiles.length).fill(0);
  stats.tileCount.forEach(function (k, o) {
    const t = placements.orientTile[o];
    count[t] += k;
    cells[t] += k * placements.orientW[o] * placements.orientH[o];
  });
  return { count: count, cells: cells, empty: stats.emptyCount };
}

// Remember the shares after each report, for the chart. At most about
// 600 points are kept: when there are more, every other one is dropped.
function addToTrace(stats) {
  if (!placements) return;
  const last = trace.moves.length - 1;
  if (last >= 0 && trace.moves[last] === stats.moves) return;   // nothing new
  const c = coverCounts(stats);
  trace.moves.push(stats.moves);
  trace.shares.push(c.cells.concat([c.empty]).map(function (k) { return k / domain.n; }));
  if (trace.moves.length > 600) {
    trace.moves = trace.moves.filter(function (m, k) { return k % 2 === 0; });
    trace.shares = trace.shares.filter(function (m, k) { return k % 2 === 0; });
  }
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

  const c = coverCounts(s);
  let rows = "";
  tiles.forEach(function (t, k) {
    rows += '<tr><td><span class="swatch-small" style="background:' + defaultColor(k, tiles.length) + '"></span>' +
      t.w + " &times; " + t.h + "</td><td>" + c.count[k].toLocaleString() + "</td><td>" +
      c.cells[k].toLocaleString() + " (" + (100 * c.cells[k] / domain.n).toFixed(1) + "%)</td></tr>";
  });
  rows += '<tr><td><span class="swatch-small" style="background:' + GAP + '"></span>gaps</td><td></td><td>' +
    c.empty.toLocaleString() + " (" + (100 * c.empty / domain.n).toFixed(1) + "%)</td></tr>";
  byId("tile-stats").innerHTML = rows;
  drawCoverChart();
}

// One line per tile (in its color) and a gray one for gaps: the share of
// the cells, from 0 to 1, against the number of moves.
function drawCoverChart() {
  const canvas = byId("cover-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (trace.moves.length < 2) return;
  const lastMove = Math.max(trace.moves[trace.moves.length - 1], 1);
  const left = 30, up = 6, bottom = h - 16;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText("1", left - 6, up);
  pen.fillText("0", left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText(lastMove.toLocaleString() + " moves", w, h);
  pen.textAlign = "left";
  pen.fillText("0", left, h);
  const lineColors = tiles.map(function (t, k) { return defaultColor(k, tiles.length); }).concat([CHART_TEXT]);
  lineColors.forEach(function (color, k) {
    pen.beginPath();
    trace.moves.forEach(function (m, i) {
      const sx = left + (w - left) * m / lastMove;
      const sy = bottom - (bottom - up) * trace.shares[i][k];
      if (i === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
    });
    pen.strokeStyle = color;
    pen.lineWidth = 1.5;
    pen.stroke();
  });
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page): makeCustomTool, in
   js/sim-controls.js. Any region will do (it may be in several
   pieces); Done uses it.
   ===================================================================== */
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return playing; },
  setPlaying: setPlaying,
  check: function (drawing) {
    const cells = drawing.graph.vertices.length;
    return cells === 0 ? ["Paint the region first.", ""] : ["", cells + " cells."];
  },
  done: function (drawing) {
    customDomain = drawnDomain(drawing.graph, drawing.grid);
    useDomain("custom", customDomain);
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
});


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
  let html = "";
  tiles.forEach(function (t, k) {
    html += '<div class="option-row"><span class="swatch-small" style="background:' +
      defaultColor(k, tiles.length) + '"></span>' +
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

// Switch to a new domain and restart.
function useDomain(kind, d) {
  domainKind = kind;
  domain = d;
  useTorus(view, Boolean(d.wrap));   // the whole picture again; zooming out past it only on a torus (js/sim-view.js)
  showDomainChoice();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  if (tool.isOpen) tool.close();
  const d = boxFromOptions(1, MAX_SIDE, DEFAULTS);   // (4 neighbors)
  useDomain(d.wrap ? "torus" : "box", d);
}

// The Aztec diamond (aztecDiamond is in js/sim-domains.js). Choosing it
// switches to dominoes with no gaps, the tiling of the arctic circle
// theorem, colored by direction and checkerboard (the 4 colors of the
// arctic circle pictures); all can be changed afterwards.
function useAztec(switchTiles) {
  if (tool.isOpen) tool.close();
  const order = readWhole("set-order", 1, MAX_ORDER, DEFAULTS.order);
  if (switchTiles) {
    usePreset("dominoes");
    byId("gaps").checked = false;
    showGapsInfo();
    byId("color-by").value = "checker";
  }
  useDomain("aztec", aztecDiamond(order));
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  document.querySelector('input[name="domain"][value="' + domainKind + '"]').checked = true;
  const custom = (domainKind === "custom");
  byId("size-row").hidden = custom || domainKind === "aztec";
  byId("order-row").hidden = domainKind !== "aztec";
  byId("custom-row").hidden = !custom;
  if (custom && customDomain) {
    byId("custom-info").textContent = "Your region: " + customDomain.n + " cells" +
      (customDomain.wrap ? ", on a torus." : ".");
  }
}

// What "Allow gaps" means, under the box.
function showGapsInfo() {
  byId("gaps-info").textContent = byId("gaps").checked
    ? "Gaps allowed: empty cells only where no tile fits (a maximal packing)."
    : "No gaps: every cell covered. The start is built without a search, so some domains can't get one.";
}

// Domain: Box / Torus / Aztec diamond / Custom, and their options
// (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, aztec: function () { useAztec(true); }, custom: tool.open });
byId("set-order").addEventListener("change", function () { useAztec(false); });

// Rotations and gaps: a new start.
byId("rotations").addEventListener("change", restart);
byId("gaps").addEventListener("change", function () { showGapsInfo(); restart(); });

// The move: the radius slider and number box move together, and the
// chain carries on with the new value while you drag, like a Desmos slider.
byId("radius-slider").addEventListener("input", function () {
  byId("set-radius").value = this.value;
  sendMoveSettings();
});
byId("set-radius").addEventListener("change", function () {
  byId("radius-slider").value = readRadius();
  sendMoveSettings();
});
byId("set-limit").addEventListener("change", sendMoveSettings);
byId("show-disk").addEventListener("change", drawSoon);

// The picture.
byId("color-by").addEventListener("change", drawSoon);
for (const radio of document.querySelectorAll('input[name="show"]')) {
  radio.addEventListener("change", function () {
    worker.postMessage({ type: "heat", on: showingAverage() });
    drawSoon();
  });
}
byId("reset-average").addEventListener("click", function () { worker.postMessage({ type: "resetHeat" }); });

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
fillDomainOptions(DEFAULTS, MAX_SIDE);
byId("set-order").value = DEFAULTS.order;
byId("set-order").max = MAX_ORDER;
byId("set-radius").value = byId("radius-slider").value = DEFAULTS.radius;
byId("set-limit").value = DEFAULTS.limit;
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
showGapsInfo();
usePreset(DEFAULT_PRESET);
useBox();
setPlaying(false);   // paused: press Play
