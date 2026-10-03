/* =====================================================================
   random-mountain.js  —  the page of the "Random mountain" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the tile T from the clickable grid of cells (as on the old
       site; the preset and Make buttons fill the grid in), and the
       domain from the Domain options (a custom domain is drawn in the
       graph tool, shown inside this page).
     - Hands them to the growth rule (random-mountain-growth.js), which
       runs in a second thread (a "Web Worker"), and draws every
       mountain it sends back, with the statistics.
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js, and moving and zooming a 2D torus is in
   js/sim-view.js (shared with the coloring sims).

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The tile: the clickable grid and presets
     4. The domain
     5. Running the mountain
     6. Drawing the mountain
     6b. Moving and zooming a 2D torus
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The tile presets. Each one is a list of offsets: numbers [x] in 1D,
// pairs [x, y] in 2D. The first one of each list is the default.
const PRESETS = {
  1: [
    { name: "{−1, +1}", tile: [[-1], [1]] },               // two-sided (randmountain.py)
    { name: "{+1}", tile: [[1]] },                          // one-sided (randonesidedmountain.py)
    { name: "{−2, +1}", tile: [[-2], [1]] },
    { name: "{±1, ±2}", tile: [[-2], [-1], [1], [2]] },
  ],
  2: [
    { name: "4 neighbors", tile: [[1, 0], [-1, 0], [0, 1], [0, -1]] },
    { name: "8 neighbors", tile: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] },
    { name: "Diagonals", tile: [[1, 1], [1, -1], [-1, 1], [-1, -1]] },
  ],
};

// The clickable grid shows the offsets up to this far from the site
// itself: -10 .. 10 in 1D, an 11 x 11 square in 2D (as on the old
// site). The Make buttons can build bigger tiles; the grid then shows
// only the part that fits.
const GRID_REACH = { 1: 10, 2: 5 };
const MAX_RADIUS = 30;

// The domains for each dimension, and the default size of a bounded one.
const DOMAINS = {
  1: [["whole", "Whole line"], ["box", "Segment"], ["torus", "Cycle"]],
  2: [["whole", "Whole plane"], ["box", "Box"], ["torus", "Torus"], ["custom", "Custom (draw it)"]],
};
const DEFAULT_SIZE = { 1: 101, 2: 41 };
const MAX_SIZE = { 1: 2001, 2: 301 };

const DEFAULT_SEED = "1";
// The picture always has the same size (the quadrant's width, and this
// height in screen pixels), in 1D and 2D; the mountain shrinks to fit
// inside it as it grows.
const PICTURE_HEIGHT = 480;
const EMPTY = "#c9c6bf";          // available sites with no block yet
const OUTSIDE = "#ffffff";        // everything else
// (How far a 2D torus zooms in and out is set in js/sim-view.js.)

// The speeds on the Speed slider, in blocks per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every block land.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 20000, 100000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(20);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 1;                 // 1 or 2
let tile = [];               // the offsets, e.g. [[-1], [1]] or [[1, 0], ...]
let domainKind = "whole";    // "whole", "box", "torus" or "custom"
let customDomain = null;     // the last custom domain drawn (js/sim-domains.js), if any
let playing = false;         // it starts paused; Play sets it going
let speedIndex = DEFAULT_SPEED;
let run = 0;                 // counts restarts, so leftovers from an older run are ignored

// The latest message from the mountain (see part 2 of
// random-mountain-growth.js): the sites, their heights, the numbers.
let latest = null;


/* =====================================================================
   3. THE TILE: THE CLICKABLE GRID AND PRESETS
   ---------------------------------------------------------------------
   As on the old site: a grid of cells around the site itself (the dark
   one in the middle). Clicking a cell puts that offset in the tile, or
   takes it out. The preset buttons and the Make buttons (a disk, or a
   ring) fill the grid in. Every change takes effect at once, keeping
   the seed and the step, like a Desmos slider.
   ===================================================================== */

// An offset's name, "x" in 1D or "x,y" in 2D, for the set below.
function offsetKey(t) { return dim === 1 ? String(t[0]) : t[0] + "," + t[1]; }

// Use these offsets as the tile (0 is left out: it changes nothing),
// show them, and restart at the same step.
function setTile(offsets) {
  const seen = new Set();
  tile = [];
  for (const t of offsets) {
    const key = offsetKey(t);
    if (seen.has(key) || key === "0" || key === "0,0") continue;
    seen.add(key);
    tile.push(dim === 1 ? [t[0]] : [t[0], t[1]]);
  }
  showTileGrid();
  byId("tile-info").textContent = describeTile();
  restart(true);
}

// Show the preset buttons and the Make rows for this dimension.
function showPresets() {
  const row = byId("tile-presets");
  row.innerHTML = "";
  for (const preset of PRESETS[dim]) {
    const button = document.createElement("button");
    button.className = "tool-button";
    button.textContent = preset.name;
    button.addEventListener("click", function () { setTile(preset.tile); });
    row.appendChild(button);
  }
  byId("disk-label").textContent = dim === 1 ? "Every offset out to" : "Disk, radius";
  byId("ring-label").textContent = dim === 1 ? "Only the offsets from" : "Ring, radius";
}

// Draw the clickable grid: one small button per offset, lit up when the
// offset is in the tile.
function showTileGrid() {
  const grid = byId("tile-grid");
  const reach = GRID_REACH[dim];
  const inTile = new Set(tile.map(offsetKey));
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "repeat(" + (2 * reach + 1) + ", 1fr)";
  grid.classList.toggle("one-row", dim === 1);
  const rowsY = dim === 1 ? [0] : [];
  if (dim === 2) for (let y = reach; y >= -reach; y--) rowsY.push(y);   // top row first: y goes up
  for (const y of rowsY) {
    for (let x = -reach; x <= reach; x++) {
      const t = dim === 1 ? [x] : [x, y];
      const cell = document.createElement("button");
      cell.className = "tile-cell";
      if (x === 0 && y === 0) {
        cell.classList.add("center");
        cell.title = "the site itself";
        cell.disabled = true;
      } else {
        cell.title = dim === 1 ? String(x) : "(" + x + ", " + y + ")";
        if (inTile.has(offsetKey(t))) cell.classList.add("on");
        cell.addEventListener("click", function () {
          const key = offsetKey(t);
          setTile(inTile.has(key) ? tile.filter(function (u) { return offsetKey(u) !== key; })
                                  : tile.concat([t]));
        });
      }
      grid.appendChild(cell);
    }
  }
}

// The Make buttons. In 2D: every (x, y) with r1 <= its distance from 0
// <= r2 (a disk is r1 = 0); in 1D: every x with r1 <= |x| <= r2.
function ringTile(r1, r2) {
  const offsets = [];
  for (let x = -r2; x <= r2; x++) {
    if (dim === 1) {
      if (Math.abs(x) >= r1) offsets.push([x]);
      continue;
    }
    for (let y = -r2; y <= r2; y++) {
      const d2 = x * x + y * y;
      if (d2 >= r1 * r1 && d2 <= r2 * r2) offsets.push([x, y]);
    }
  }
  return offsets;
}
byId("make-disk").addEventListener("click", function () {
  setTile(ringTile(0, readWhole("disk-radius", 1, MAX_RADIUS, 2)));
});
byId("make-ring").addEventListener("click", function () {
  let r1 = readWhole("ring-inner", 0, MAX_RADIUS, 3), r2 = readWhole("ring-outer", 0, MAX_RADIUS, 3);
  if (r1 > r2) { const t = r1; r1 = r2; r2 = t; }
  setTile(ringTile(r1, r2));
});

// "4 offsets: (1, 0), (0, 1), ..." (the first few).
function describeTile() {
  if (tile.length === 0) return "T is empty: every block lands on the start site.";
  const shown = tile.slice(0, 12).map(function (t) { return dim === 1 ? String(t[0]) : "(" + t[0] + ", " + t[1] + ")"; });
  return "T has " + tile.length + (tile.length === 1 ? " offset: " : " offsets: ") + shown.join(", ") +
         (tile.length > 12 ? ", ..." : "") + ".";
}


/* =====================================================================
   4. THE DOMAIN
   ---------------------------------------------------------------------
   Whole line / plane: no limits. Segment / Box, Cycle / Torus: the
   given number of sites, centered on 0 (so the first block, on 0, is
   in the middle). Custom: the cells drawn in the graph tool.
   ===================================================================== */

// Show the domain choices for this dimension, with "domainKind" ticked.
function showDomainChoice() {
  const row = byId("domain-choice");
  row.innerHTML = "";
  for (const [kind, name] of DOMAINS[dim]) {
    const label = document.createElement("label");
    label.innerHTML = '<input type="radio" name="domain" value="' + kind + '"> ' + name;
    const radio = label.firstChild;
    radio.checked = (kind === domainKind);
    radio.addEventListener("change", function () {
      if (kind === "custom") { openTool(); return; }
      if (toolOpen) closeTool();
      domainKind = kind;
      showDomainChoice();
      restart(true);
    });
    row.appendChild(label);
  }
  // A new domain starts with the whole picture; on a 2D torus it can be
  // moved and zoomed (section 6b).
  useTorus(view, torusRange() !== null);
  const bounded = (domainKind === "box" || domainKind === "torus");
  byId("size-row").hidden = !bounded;
  byId("size-label").textContent = dim === 1 ? "Sites" : "Size";
  byId("height-part").hidden = (dim === 1);
  byId("custom-row").hidden = (domainKind !== "custom");
  if (domainKind === "custom" && customDomain) {
    byId("custom-info").textContent = "Your domain: " + customDomain.n + " cells" +
      (customDomain.wrap ? ", on a torus." : ".");
  }
}

// From -floor((size - 1) / 2) to there + size - 1: "size" sites with 0
// in the middle.
function centered(size) {
  const low = -Math.floor((size - 1) / 2);
  return { low: low, high: low + size - 1 };
}

// The domain and the start site, as the growth rule wants them.
function domainSettings() {
  if (domainKind === "whole") {
    return { domain: { kind: "whole" }, start: dim === 1 ? [0] : [0, 0] };
  }
  if (domainKind === "custom") {
    const d = customDomain;
    const cells = [];
    for (let v = 0; v < d.n; v++) cells.push([d.x[v], d.y[v]]);
    return { domain: { kind: "cells", cells: cells, wrap: d.wrap }, start: customStart(d) };
  }
  const across = centered(readWhole("set-width", 1, MAX_SIZE[dim], DEFAULT_SIZE[dim]));
  const down = dim === 1 ? { low: 0, high: 0 } : centered(readWhole("set-height", 1, MAX_SIZE[dim], DEFAULT_SIZE[dim]));
  return {
    domain: { kind: "box", xmin: across.low, xmax: across.high, ymin: down.low, ymax: down.high,
              torus: domainKind === "torus" },
    start: dim === 1 ? [0] : [0, 0],
  };
}

// The first block of a custom domain: on (0, 0) if it was painted, else
// on the painted cell nearest the middle of the drawing.
function customStart(d) {
  const middleX = (d.xmin + d.xmax) / 2, middleY = (d.ymin + d.ymax) / 2;
  let best = 0;
  for (let v = 0; v < d.n; v++) {
    if (d.x[v] === 0 && d.y[v] === 0) return [0, 0];
    if (Math.hypot(d.x[v] - middleX, d.y[v] - middleY) < Math.hypot(d.x[best] - middleX, d.y[best] - middleY)) best = v;
  }
  return [d.x[best], d.y[best]];
}


/* =====================================================================
   5. RUNNING THE MOUNTAIN
   ---------------------------------------------------------------------
   The growth rule is mountainWorker() in random-mountain-growth.js,
   with newMountain() copied in. startWorker (js/sim-page.js) runs it in
   a second thread, so the page never freezes.
   ===================================================================== */
const worker = startWorker(mountainWorker, [newMountain]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  latest = message;
  showMessage(message.problem);
  if (message.atMax && playing) {
    setPlaying(false);
    showMessage("That's the most steps this page goes to.");
  }
  drawSoon();
};

worker.onerror = function () {
  showMessage("The sim couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// A new mountain with the current tile, domain and seed. With
// keepStep, it grows at once to the step it was at (so a change to the
// tile or the domain shows the same moment of the run); without, it
// starts again from one block.
function restart(keepStep) {
  if (domainKind === "custom" && !customDomain) return;
  const steps = (keepStep && latest && latest.steps) ? latest.steps : 0;
  const where = domainSettings();
  run++;
  worker.postMessage({
    type: "setup", run: run, dim: dim, tile: tile,
    domain: where.domain, start: where.start,
    seed: byId("seed").value, steps: steps,
  });
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
}

function setPlaying(on) {
  playing = on;
  worker.postMessage(on ? { type: "play", speed: SPEEDS[speedIndex] } : { type: "pause" });
  byId("play").textContent = on ? "Pause" : "Play";
  byId("play").classList.toggle("selected", on);
}


/* =====================================================================
   6. DRAWING THE MOUNTAIN
   ---------------------------------------------------------------------
   Color shows height, with the old site's colors: from blue (low) to
   red (the largest height). Available sites with no block yet are
   gray.
     1D: one bar per site, as tall as its height, on a line; the gray
         available sites are small marks under the line.
     2D: seen from above, one square per cell. The cells are first drawn
         one pixel each (an "image"), then blown up with smoothing off,
         so they stay crisp squares (as in the other sims).
   The picture shows the whole domain if it is bounded, and otherwise
   every available site, with one site to spare around them.
   ===================================================================== */
let drawPending = false;
const simCanvas = byId("sim-canvas");
const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D torus's zoom (js/sim-view.js)
const tiny = document.createElement("canvas");   // 2D: one pixel per cell

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawMountain();
    showStats();
  });
}
window.addEventListener("resize", drawSoon);

// The old site's height color (heatColor): t = 0 is blue, t = 1 is red.
// The hue goes from 225 (blue) down to 0 (red) and the color gets
// brighter on the way. Returns [red, green, blue], each 0..255.
function heatColor(t) {
  const hue = 225 - 225 * t, saturation = 0.7, value = 0.35 + 0.55 * t;
  // The usual HSV -> RGB recipe.
  const c = value * saturation, h = hue / 60, x = c * (1 - Math.abs((h % 2) - 1)), m = value - c;
  const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map(function (part) { return Math.round(255 * (part + m)); });
}
function cssColor(rgb) { return "rgb(" + rgb.join(",") + ")"; }

// The x and y range of the picture.
function pictureRange() {
  if (domainKind === "box" || domainKind === "torus") {
    const d = domainSettings().domain;
    return { xmin: d.xmin, xmax: d.xmax, ymin: d.ymin, ymax: d.ymax };
  }
  if (domainKind === "custom") {
    const d = customDomain;
    return { xmin: d.xmin, xmax: d.xmax, ymin: d.ymin, ymax: d.ymax };
  }
  const s = latest;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < s.x.length; i++) {
    xmin = Math.min(xmin, s.x[i]); xmax = Math.max(xmax, s.x[i]);
    ymin = Math.min(ymin, s.y[i]); ymax = Math.max(ymax, s.y[i]);
  }
  return dim === 1 ? { xmin: xmin - 1, xmax: xmax + 1, ymin: 0, ymax: 0 }
                   : { xmin: xmin - 1, xmax: xmax + 1, ymin: ymin - 1, ymax: ymax + 1 };
}

function drawMountain() {
  if (!latest || !latest.x || latest.dim !== dim || simCanvas.hidden) return;   // nothing yet, or from before a switch to 1D / 2D
  if (dim === 1) drawLine(); else drawGrid();
}

// 1D: bars.
function drawLine() {
  const s = latest, range = pictureRange();
  const width = simCanvas.clientWidth, height = PICTURE_HEIGHT;
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on

  const left = 8, right = width - 8, top = 20, ground = height - 30;
  const columns = range.xmax - range.xmin + 1;
  const column = (right - left) / columns;        // the width of one site
  const gap = column >= 4 ? 1 : 0;                // a thin gap between wide bars
  const highest = Math.max(s.maxHeight, 1);
  function columnLeft(x) { return left + (x - range.xmin) * column; }

  for (let i = 0; i < s.x.length; i++) {
    const h = s.height[i], x0 = columnLeft(s.x[i]);
    if (h === 0) {
      pen.fillStyle = EMPTY;                       // available, no block yet: a mark under the line
      pen.fillRect(x0 + gap / 2, ground + 3, Math.max(column - gap, 1), 5);
    } else {
      const barHeight = (ground - top) * h / highest;
      pen.fillStyle = cssColor(heatColor(h / highest));
      pen.fillRect(x0 + gap / 2, ground - barHeight, Math.max(column - gap, 0.5), barHeight);
    }
  }

  // The ground line, and the numbers: the largest height at the top,
  // and x at both ends and at 0.
  pen.fillStyle = CHART_TEXT;
  pen.fillRect(left, ground, right - left, 1);
  pen.font = "11px sans-serif";
  pen.textBaseline = "top";
  pen.textAlign = "left";
  pen.fillText("largest height " + s.maxHeight.toLocaleString(), left, 2);
  pen.fillText(String(range.xmin), left, ground + 12);
  pen.textAlign = "right";
  pen.fillText(String(range.xmax), right, ground + 12);
  if (range.xmin < 0 && range.xmax > 0) {
    pen.textAlign = "center";
    pen.fillText("0", columnLeft(0) + column / 2, ground + 12);
  }
}

// 2D: seen from above. As in the coloring sims, the picture is drawn
// screen square by screen square: for each square that shows in the
// picture's box, find which cell is there. On a torus that wraps
// around, so the squares beyond the box show the torus again, and the
// picture can be moved and zoomed (section 6b).

// The torus that the 2D picture wraps around, or null.
function torusRange() {
  if (dim !== 2) return null;
  if (domainKind === "torus") return pictureRange();
  if (domainKind === "custom" && customDomain && customDomain.wrap) return customDomain.wrap;
  return null;
}

function drawGrid() {
  const s = latest, range = pictureRange(), wrapRange = torusRange();
  const across = range.xmax - range.xmin + 1, down = range.ymax - range.ymin + 1;
  const cssWidth = simCanvas.clientWidth;
  // The picture's box: square cells, as big as fit in the canvas (which
  // always has the same size), in the middle of it. The view remembers
  // it, in screen pixels: "left", "top", "width" and "height" of the box,
  // and "size", the size of a cell when the whole picture fits (zoom 1).
  view.size = Math.min(cssWidth / across, PICTURE_HEIGHT / down);   // a cell at zoom 1
  view.width = Math.round(view.size * across);
  view.height = Math.round(view.size * down);
  view.left = Math.round((cssWidth - view.width) / 2);
  view.top = Math.round((PICTURE_HEIGHT - view.height) / 2);

  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  simCanvas.style.height = PICTURE_HEIGHT + "px";
  simCanvas.width = Math.round(cssWidth * ratio);
  simCanvas.height = Math.round(PICTURE_HEIGHT * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on

  // Each site's number, by its place, to look up a cell quickly.
  const siteAt = new Map();
  for (let i = 0; i < s.x.length; i++) siteAt.set(s.x[i] + "," + s.y[i], i);

  // Which squares show. Square (i, k) is column i from the left and row
  // k from the top of the picture (k = 0 is the top row, y = ymax: rows
  // go up the screen as y goes up). view.scroll moves the squares, in
  // cells, and view.zoom sizes them; off a torus they stay 0 and 1.
  const size = cellSize(view);
  const scroll = view.scroll;
  const firstI = Math.floor(-scroll.x) - 1, lastI = Math.ceil(view.width / size - scroll.x);
  const firstK = Math.floor(-scroll.y) - 1, lastK = Math.ceil(view.height / size - scroll.y);
  const cols = lastI - firstI + 1, rows = lastK - firstK + 1;

  // One pixel per square, in a small image. Row 0 of the image is the
  // top row of squares.
  tiny.width = cols;
  tiny.height = rows;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(cols, rows);
  const pixels = image.data;   // 4 numbers per pixel: red, green, blue, opacity
  const outside = hexToRGB(OUTSIDE), empty = hexToRGB(EMPTY);
  const highest = Math.max(s.maxHeight, 1);
  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      let x = range.xmin + firstI + i, y = range.ymax - (firstK + k);
      if (wrapRange) { x = wrap(x, wrapRange.xmin, wrapRange.xmax); y = wrap(y, wrapRange.ymin, wrapRange.ymax); }
      const inBox = x >= range.xmin && x <= range.xmax && y >= range.ymin && y <= range.ymax;
      const site = inBox ? siteAt.get(x + "," + y) : undefined;
      const rgb = site === undefined ? outside
        : s.height[site] === 0 ? empty : heatColor(s.height[site] / highest);
      const p = k * cols + i;
      pixels[4 * p] = rgb[0]; pixels[4 * p + 1] = rgb[1]; pixels[4 * p + 2] = rgb[2];
      pixels[4 * p + 3] = 255;
    }
  }
  tinyPen.putImageData(image, 0, 0);

  // Blow it up into the picture's box, with smoothing off so the cells
  // stay sharp squares, and a thin frame around the box.
  pen.save();
  pen.beginPath();
  pen.rect(view.left, view.top, view.width, view.height);
  pen.clip();                                     // nothing outside the picture's box
  pen.imageSmoothingEnabled = false;
  pen.drawImage(tiny, view.left + Math.round((firstI + scroll.x) * size), view.top + Math.round((firstK + scroll.y) * size),
                cols * size, rows * size);
  pen.restore();
  pen.strokeStyle = EMPTY;
  pen.strokeRect(view.left + 0.5, view.top + 0.5, view.width - 1, view.height - 1);
}


/* =====================================================================
   6b. MOVING AND ZOOMING A 2D TORUS
   ---------------------------------------------------------------------
   On a 2D torus (the Torus domain, or a domain drawn on a torus in the
   graph tool) the picture can be moved and zoomed, as in the coloring
   sims (and like a graph in Desmos):
     drag                         move it
     mouse wheel, or pinch        zoom in or out, around the pointer
     the + / − / Reset buttons    zoom in, zoom out, show it all again
   The code for all of it is shared with the coloring sims, in
   js/sim-view.js: the view made in section 6 handles the mouse wheel
   and the buttons, and this page passes its pointer events on to it.
   ("Pointer" events cover the mouse, a pen and fingers alike.)
   ===================================================================== */
simCanvas.addEventListener("pointerdown", function (event) { pressPointer(view, event); });
simCanvas.addEventListener("pointermove", function (event) { movePointer(view, event); });
simCanvas.addEventListener("pointerup", function (event) { releasePointer(view, event); });
simCanvas.addEventListener("pointercancel", function (event) { releasePointer(view, event); });


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   All for the run on the screen. The growth rule keeps the numbers up
   to date, and a sample of them every so often for the charts (see
   part 2 of random-mountain-growth.js).
   ===================================================================== */
function showStats() {
  const s = latest;
  if (!s || !s.x || s.dim !== dim) return;
  byId("stat-steps").textContent = s.steps.toLocaleString();
  byId("stat-blocks").textContent = s.blocks.toLocaleString();
  byId("stat-base").textContent = s.baseSize.toLocaleString();
  byId("stat-available").textContent = s.available.toLocaleString();
  byId("stat-highest").textContent = s.maxHeight.toLocaleString();
  byId("stat-start").textContent = s.height[s.start].toLocaleString();

  // 1D: the leftmost and rightmost sites of the base.
  byId("ends-row").hidden = (dim !== 1);
  if (dim === 1) {
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < s.x.length; i++) {
      if (s.height[i] > 0) { low = Math.min(low, s.x[i]); high = Math.max(high, s.x[i]); }
    }
    byId("stat-ends").textContent = low + " to " + high;
  }

  plotOverTime(byId("base-chart"), s.traceSteps, s.traceBase);
  plotOverTime(byId("highest-chart"), s.traceSteps, s.traceHighest);
  plotOverTime(byId("start-chart"), s.traceSteps, s.traceStart);
}

// One line over time (steps across, the value up, from 0 to its largest).
function plotOverTime(canvas, steps, values) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (steps.length < 2) return;
  let top = 1;
  for (const value of values) top = Math.max(top, value);
  const lastStep = steps[steps.length - 1];
  const left = 44, up = 6, bottom = h - 16;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(top.toLocaleString(), left - 6, up);
  pen.fillText("0", left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText("step " + lastStep.toLocaleString(), w, h);
  pen.textAlign = "left";
  pen.fillText("0", left, h);
  pen.beginPath();
  values.forEach(function (value, k) {
    const sx = left + (w - left) * steps[k] / lastStep;
    const sy = bottom - (bottom - up) * value / top;
    if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
  });
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   As in the other sims: choosing "Custom" swaps the picture for the
   graph tool, loaded in an <iframe> as graph-tool.html?embed. The tool
   sends its drawing every time it changes; Done uses it. Only the
   painted cells matter (the tile decides where blocks can go next), so
   the domain need not be one connected piece.
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
  showZoomButtons(view);
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  checkTool();
}

function closeTool() {
  toolOpen = false;
  byId("custom-area").hidden = true;
  simCanvas.hidden = false;
  showZoomButtons(view);
}

// Messages from the tool: its height (so the iframe fits it exactly),
// and its drawing.
window.addEventListener("message", function (event) {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message.type === "height") frame.style.height = message.height + "px";
  if (message.type === "graph") { toolMessage = message; checkTool(); }
});

function checkTool() {
  if (!toolOpen) return;
  let problem = "";
  if (!toolMessage) problem = "Loading the drawing tool...";
  else if (toolMessage.graph.vertices.length === 0) problem = "Paint the domain first.";
  const status = byId("step-status");
  status.textContent = problem || "✓ " + toolMessage.graph.vertices.length + " cells.";   // ✓ is a tick mark
  status.className = "step-status " + (problem ? "problem" : "ok");
  byId("tool-done").disabled = Boolean(problem);
}

byId("tool-done").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  closeTool();
  domainKind = "custom";
  showDomainChoice();
  restart(true);
});

// Cancel: back to whatever was there before.
byId("tool-cancel").addEventListener("click", function () {
  closeTool();
  showDomainChoice();
  drawSoon();
  if (wasPlaying) setPlaying(true);
});
byId("edit-custom").addEventListener("click", openTool);


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 1D or 2D. Each has its own presets and domains, so the
// tile and domain go back to the defaults (whole line or plane).
function setDimension(value) {
  dim = value;
  if (toolOpen) closeTool();
  domainKind = "whole";
  byId("set-width").value = byId("set-height").value = DEFAULT_SIZE[dim];
  byId("set-width").max = byId("set-height").max = MAX_SIZE[dim];
  showPresets();
  showDomainChoice();
  setTile(PRESETS[dim][0].tile);
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// The size of a segment, cycle, box or torus.
for (const id of ["set-width", "set-height"]) {
  byId(id).addEventListener("change", function () { restart(true); });
}

// Play / Pause, Step, Restart, Go to step.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "step" });
});
byId("restart").addEventListener("click", function () { restart(false); });
byId("goto").addEventListener("click", function () {
  worker.postMessage({ type: "goto", steps: readWhole("goto-steps", 0, 10000000, 0) });
});

// Speed.
function showSpeed() {
  const speed = SPEEDS[speedIndex];
  byId("speed-label").textContent = speed === Infinity
    ? "as fast as possible"
    : speed.toLocaleString() + (speed === 1 ? " block" : " blocks") + " per second";
}
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
});

// Seed: the same seed gives the same mountain every time.
byId("seed").addEventListener("change", function () { restart(true); });
byId("new-seed").addEventListener("click", function () {
  byId("seed").value = String(Math.floor(Math.random() * 100000));
  restart(true);
});


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
byId("goto-steps").value = 1000;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
setDimension(1);
setPlaying(false);   // paused: press Play
