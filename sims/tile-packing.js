/* =====================================================================
   tile-packing.js  —  the page of the "Random tile packing" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, or a custom one drawn
       in the graph tool (shown inside this page). The domain code is
       shared with the other sims, in js/sim-domains.js.
     - Reads the tiles (rectangles) and the options.
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
     6. Dragging the torus
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. The tiles
    10. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain (a 24 x 24 box), mean radius, refill limit and seed.
const DEFAULTS = { width: 24, height: 24, radius: 1.5, limit: 10000, seed: "1" };

// The tile presets: lists of [width, height].
const PRESETS = {
  squares:  [[2, 2], [3, 3]],
  dominoes: [[2, 1]],
  twoone:   [[2, 2], [1, 1]],
};
const DEFAULT_PRESET = "squares";

const MAX_SIDE = 200;             // the biggest box or torus is 200 x 200
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

let domainKind = "box";         // "box", "torus" or "custom": the domain in use
let domain = null;              // the domain (js/sim-domains.js)
let customDomain = null;        // the last custom domain drawn, if any
let tiles = [];                 // the tiles: [{ w, h }, ...]
let scroll = { x: 0, y: 0 };    // torus only: how far the picture is scrolled, in cells

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
  byId("play").textContent = on ? "Pause" : "Play";
  byId("play").classList.toggle("selected", on);
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
   js/sim-domains.js).
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
   As in the coloring sims: the packing is first drawn one pixel per
   cell (an "image" whose pixels we set one by one), then blown up onto
   a hidden canvas, "picture", with smoothing off so the cells stay
   crisp squares. When cells are big enough, a dark line goes along
   every side where two different tiles meet (an empty cell counts as
   different), or where the domain ends. Then the picture is copied onto
   the canvas on the page, and the last move's disk is drawn on top.

   "Average over time" colors each cell by mixing the class colors, each
   weighted by the share of the time the cell spent in that class (the
   chain's heat map), with no lines.

   On a torus the picture can be scrolled: it is copied four times,
   shifted, and whatever falls outside the picture's box is cut off.
   ===================================================================== */
let drawPending = false;
const tiny = document.createElement("canvas");      // one pixel per cell
const picture = document.createElement("canvas");   // the full-size picture
const simCanvas = byId("sim-canvas");
let view = null;   // where the picture went on screen: { left, size, width, height, shiftX, shiftY }

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawPacking();
    showStats();
  });
}

// True when the picture can be scrolled: on a torus.
function scrollable() { return Boolean(domain && domain.wrap); }

function drawPacking() {
  if (!domain || !latest || !placements || simCanvas.hidden) return;
  const d = domain, owner = latest.owner;
  const average = showingAverage() && latest.heat;
  const colors = classColors(), classes = colors.length;

  // The size of a cell on screen: as big as fits the width (and at most
  // MAX_PICTURE_HEIGHT tall). Cells with border lines get a whole number
  // of pixels, so the lines sit exactly on the cell edges.
  const across = d.xmax - d.xmin + 1, down = d.ymax - d.ymin + 1;
  const cssWidth = simCanvas.clientWidth;
  let size = Math.min(cssWidth / across, MAX_PICTURE_HEIGHT / down);
  const bordered = !average && size >= SMALLEST_BORDERED_CELL;
  if (bordered) size = Math.floor(size);
  const width = size * across, height = size * down;
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens

  // 1. One pixel per cell. Row 0 of the image is the top of the
  //    picture, which is the largest y (y goes up the screen).
  tiny.width = across;
  tiny.height = down;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(across, down);
  const pixels = image.data;                  // 4 numbers per pixel: red, green, blue, opacity
  const outside = hexToRGB(OUTSIDE);
  for (let p = 0; p < across * down; p++) {
    pixels[4 * p] = outside[0]; pixels[4 * p + 1] = outside[1]; pixels[4 * p + 2] = outside[2];
    pixels[4 * p + 3] = 255;
  }
  for (let v = 0; v < d.n; v++) {
    const p = (d.ymax - d.y[v]) * across + (d.x[v] - d.xmin);
    let rgb;
    if (average) {
      rgb = [0, 0, 0];
      for (let c = 0; c < classes; c++) {
        const share = latest.heat[v * classes + c];
        for (let k = 0; k < 3; k++) rgb[k] += share * colors[c][k];
      }
    } else {
      rgb = colors[classOf(owner[v], classes)];
    }
    pixels[4 * p] = rgb[0]; pixels[4 * p + 1] = rgb[1]; pixels[4 * p + 2] = rgb[2];
  }
  tinyPen.putImageData(image, 0, 0);

  // 2. Blow it up, with smoothing off so the cells stay sharp squares.
  picture.width = Math.round(width * ratio);
  picture.height = Math.round(height * ratio);
  const pen = picture.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  pen.imageSmoothingEnabled = false;
  pen.drawImage(tiny, 0, 0, width, height);

  // 3. The lines around the tiles, all collected into one path and drawn at once.
  if (bordered) {
    function edgeX(x) { return (x - d.xmin) * size; }        // left side of column x
    function edgeY(y) { return (d.ymax - y + 1) * size; }    // bottom side of row y
    // Does a line go between cell v and the place (x, y) next to it?
    function differs(v, x, y) {
      const w = cellAt(d, x, y);
      return w === -1 || owner[w] !== owner[v];
    }
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
  }

  // 4. Copy it onto the page, in the middle (on a torus, shifted by the
  //    scroll and wrapped around), and draw the disk on top.
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(cssWidth * ratio);
  simCanvas.height = Math.round(height * ratio);
  const screen = simCanvas.getContext("2d");
  screen.setTransform(ratio, 0, 0, ratio, 0, 0);
  const left = Math.round((cssWidth - width) / 2);
  let shiftX = 0, shiftY = 0;
  if (scrollable()) {
    shiftX = wrapNumber(Math.round(scroll.x * size), width);
    shiftY = wrapNumber(Math.round(scroll.y * size), height);
  }
  view = { left: left, size: size, width: width, height: height, shiftX: shiftX, shiftY: shiftY };

  screen.save();
  screen.beginPath();
  screen.rect(left, 0, width, height);
  screen.clip();                                   // nothing outside the picture's box
  const copies = scrollable() ? [[shiftX - width, shiftY - height], [shiftX, shiftY - height],
                                 [shiftX - width, shiftY], [shiftX, shiftY]] : [[0, 0]];
  for (const [dx, dy] of copies) screen.drawImage(picture, left + dx, dy, width, height);
  if (byId("show-disk").checked && !average && latest.stats.lastDisk) {
    const disk = latest.stats.lastDisk;
    // The disk's center on screen: cell (x, y) has its middle at
    // (x - xmin + 1/2, ymax - y + 1/2) cells from the top left.
    const cx = (disk.x - d.xmin + 0.5) * size, cy = (d.ymax - disk.y + 0.5) * size;
    screen.strokeStyle = DISK;
    screen.lineWidth = 2;
    for (const [dx, dy] of copies) {
      // On a torus, also one torus-width to each side, so a disk across
      // the edge shows on both sides.
      const extra = scrollable() ? [-1, 0, 1] : [0];
      for (const i of extra) {
        for (const j of extra) {
          screen.beginPath();
          screen.arc(left + dx + cx + i * width, dy + cy + j * height, Math.max(disk.r * size, 1), 0, 2 * Math.PI);
          screen.stroke();
        }
      }
    }
  }
  screen.restore();
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. DRAGGING THE TORUS
   ---------------------------------------------------------------------
   On a torus, dragging the picture scrolls it, and so does the mouse
   wheel (as in the coloring sims). "Pointer" events cover the mouse, a
   pen and fingers alike.
   ===================================================================== */
let dragFrom = null;   // while scrolling: where the pointer was a moment ago

simCanvas.addEventListener("pointerdown", function (event) {
  if (!scrollable()) return;
  dragFrom = { x: event.clientX, y: event.clientY };
  simCanvas.setPointerCapture(event.pointerId);   // keep getting moves even off the canvas
  simCanvas.style.cursor = "grabbing";
});

simCanvas.addEventListener("pointermove", function (event) {
  simCanvas.style.cursor = dragFrom ? "grabbing" : scrollable() ? "grab" : "default";
  if (!dragFrom || !view) return;
  scroll.x += (event.clientX - dragFrom.x) / view.size;
  scroll.y += (event.clientY - dragFrom.y) / view.size;
  dragFrom = { x: event.clientX, y: event.clientY };
  drawSoon();
});

function stopDragging() { dragFrom = null; }
simCanvas.addEventListener("pointerup", stopDragging);
simCanvas.addEventListener("pointercancel", stopDragging);

// The mouse wheel, or two fingers on a trackpad, scroll the torus like
// a page (instead of scrolling the page) while the pointer is over it.
simCanvas.addEventListener("wheel", function (event) {
  if (!scrollable() || !view) return;
  event.preventDefault();
  scroll.x -= event.deltaX / view.size;
  scroll.y -= event.deltaY / view.size;
  drawSoon();
}, { passive: false });   // "passive: false" lets preventDefault stop the page scrolling


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
   <iframe> (a page inside this page) as graph-tool.html?embed. The tool
   sends a message every time the drawing changes. Any region will do
   (it may be in several pieces); Done uses it.
   ===================================================================== */
const frame = byId("tool-frame");
let toolOpen = false;
let toolMessage = null;    // the tool's latest drawing: { graph, grid, palette }
let wasPlaying = false;    // to carry on after Cancel

function openTool() {
  wasPlaying = playing;
  if (playing) setPlaying(false);
  toolOpen = true;
  simCanvas.hidden = true;
  byId("custom-area").hidden = false;
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  checkTool();
}

function closeTool() {
  toolOpen = false;
  byId("custom-area").hidden = true;
  simCanvas.hidden = false;
}

// The tool sends its drawing every time it changes (js/sim-page.js).
listenToTool(frame, function (drawing) { toolMessage = drawing; checkTool(); });

// Check the drawing live and say what's wrong, if anything.
function checkTool() {
  if (!toolOpen) return;
  let problem = "", good = "";
  if (!toolMessage) problem = "Loading the drawing tool...";
  else if (toolMessage.graph.vertices.length === 0) problem = "Paint the region first.";
  else good = toolMessage.graph.vertices.length + " cells.";
  showToolStatus(problem, good);
}

byId("tool-done").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  closeTool();
  useDomain("custom", customDomain);
});

// Cancel: back to whatever was there before.
byId("tool-cancel").addEventListener("click", function () {
  closeTool();
  showDomainChoice();
  drawSoon();
  if (wasPlaying) setPlaying(true);
});


/* =====================================================================
   9. THE TILES
   ---------------------------------------------------------------------
   One row per tile: its width and height, and a button to remove it.
   Changing anything restarts the chain (a new starting packing).
   ===================================================================== */
function showTileRows() {
  let html = "";
  tiles.forEach(function (t, k) {
    html += '<div class="option-row"><span class="swatch-small" style="background:' +
      defaultColor(k, tiles.length) + '"></span>' +
      '<input type="number" min="1" max="' + MAX_TILE_SIDE + '" step="1" value="' + t.w + '" data-tile="' + k + '" data-side="w">' +
      ' &times; <input type="number" min="1" max="' + MAX_TILE_SIDE + '" step="1" value="' + t.h + '" data-tile="' + k + '" data-side="h">' +
      (tiles.length > 1 ? ' <button class="tool-button" data-remove="' + k + '" title="Remove this tile">Remove</button>' : "") +
      "</div>";
  });
  byId("tile-rows").innerHTML = html;
}

function usePreset(name) {
  tiles = PRESETS[name].map(function (t) { return { w: t[0], h: t[1] }; });
  byId("preset").value = name;
  showTileRows();
}

// Any change by hand makes the preset "My own tiles".
function tilesEdited() {
  byId("preset").value = "mine";
  showTileRows();
  restart();
}

byId("tile-rows").addEventListener("change", function (event) {
  const box = event.target;
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
  tiles.push({ w: 2, h: 1 });
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
  scroll = { x: 0, y: 0 };
  showDomainChoice();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  if (toolOpen) closeTool();
  const width = readWhole("set-width", 1, MAX_SIDE, DEFAULTS.width);
  const height = readWhole("set-height", 1, MAX_SIDE, DEFAULTS.height);
  const torus = (checked("domain") === "torus");
  useDomain(torus ? "torus" : "box", boxDomain(width, height, 4, torus));
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  document.querySelector('input[name="domain"][value="' + domainKind + '"]').checked = true;
  const custom = (domainKind === "custom");
  byId("size-row").hidden = custom;
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

// Domain: Box / Torus / Custom.
for (const radio of document.querySelectorAll('input[name="domain"]')) {
  radio.addEventListener("change", function () {
    if (radio.value === "custom") openTool();
    else useBox();
  });
}
for (const id of ["set-width", "set-height"]) byId(id).addEventListener("change", useBox);
byId("edit-custom").addEventListener("click", openTool);

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
function showSpeed() {
  const speed = SPEEDS[speedIndex];
  byId("speed-label").textContent = speed === Infinity
    ? "as fast as possible"
    : speed.toLocaleString() + (speed === 1 ? " move" : " moves") + " per second";
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
