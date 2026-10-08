/* =====================================================================
   random-mountain.js  —  the page of the "Random mountain" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the tile T from the clickable grid of cells (as on the old
       site; the preset and Make buttons fill the grid in), and the
       domain from the Domain options (a custom domain is drawn in the
       graph tool, shown inside this page).
     - Or, for "Hyperbolic plane or tree": the graph (a tiling {p,q} or
       a tree, built as needed by js/sim-graphs.js) and the radius r of
       the tile "every cell within distance r".
     - Hands them to the growth rule (random-mountain-growth.js), which
       runs in a second thread (a "Web Worker"), and draws every
       mountain it sends back, with the statistics.
   Small helpers used by every sim page (byId, readWhole, ...) are in
   js/sim-page.js, the charts in js/sim-charts.js, moving, zooming and
   painting the 2D picture in js/sim-view.js (shared with the coloring
   sims), the graph tool and clicking the picture in
   js/sim-controls.js, the hyperbolic pictures in js/sim-hyperbolic.js,
   and the 3D view in js/sim-3d.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The tile: the clickable grid and presets
     4. The domain
     5. Running the mountain
     6. Drawing the mountain
     6b. Moving, zooming and clicking the picture (click to drop a block)
     6c. The 3D view
     6d. The hyperbolic plane or a tree, seen from above
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
const MAX_RADIUS = 30;             // the largest r of the Make buttons

// The domains for each dimension (on "Hyperbolic plane or tree", a ball
// is every cell within R steps of the start), and the default and
// largest size of a bounded one.
const DOMAINS = {
  1: [["whole", "Whole line"], ["box", "Segment"], ["torus", "Cycle"]],
  2: [["whole", "Whole plane"], ["box", "Box"], ["torus", "Torus"], ["custom", "Custom (draw it)"]],
  graph: [["whole", "The whole plane (or tree)"], ["ball", "A ball"]],
};
const DEFAULT_SIZE = { 1: 101, 2: 41, graph: 6 };
const MAX_SIZE = { 1: 2001, 2: 301, graph: 12 };

// On a graph, the largest r for the tile "every cell within distance r".
// (The graph presets are in js/sim-hyperbolic.js.)
const MAX_GRAPH_RADIUS = 4;

const DEFAULT_SEED = "1";
// The picture always has the same size (the quadrant's width, and this
// height in screen pixels), in 1D and 2D; the mountain shrinks to fit
// inside it as it grows. In the full screen popup, it is the popup's
// height instead (pictureHeight, in js/sim-page.js).
const PICTURE_HEIGHT = 480;
const EMPTY = "#c9c6bf";          // available sites with no block yet
const OUTSIDE = "#ffffff";        // everything else
// (How far the 2D picture zooms in and out is set in js/sim-view.js.)
// The 3D view's floor is OUTSIDE too; its other settings (how many
// blocks are drawn one by one, the camera) are in js/sim-3d.js. On a
// graph, the tiling's lines on the 3D floor are a little darker than
// from above, as they are only 1 pixel wide there:
const UNDER_COLOR_3D = "#8a877f";

// The speeds on the Speed slider, in blocks per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch
// every block land.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 20000, 100000, Infinity];
const DEFAULT_SPEED = 20;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 1;                 // 1, 2 or "graph" (the hyperbolic plane or a tree)
let tile = [];               // the offsets, e.g. [[-1], [1]] or [[1, 0], ...]
let domainKind = "whole";    // "whole", "box", "torus" or "custom"; on a graph "whole" or "ball"
let customDomain = null;     // the last custom domain drawn (js/sim-domains.js), if any
let run = 0;                 // counts restarts, so leftovers from an older run are ignored
let show3D = false;          // 2D and graphs: the 3D view instead of the view from above (section 6c)
let blockShape = "cubes";    // the 3D view's blocks: "cubes" or "coins"
let stretch = 1;             // the 3D view's Heights: 2^(slider / 2), the slider from -4 (flatter) to 4 (taller)

// The latest message from the mountain (see part 2 of
// random-mountain-growth.js): the sites, their heights, the numbers.
let latest = null;

// Whether "latest" is a mountain to show: not just a problem, and not
// from before a switch of dimension.
function haveMountain() { return Boolean(latest && latest.height && latest.dim === dim); }


/* =====================================================================
   3. THE TILE: THE CLICKABLE GRID AND PRESETS
   ---------------------------------------------------------------------
   As on the old site: a grid of cells around the site itself (the dark
   one in the middle). Clicking a cell puts that offset in the tile, or
   takes it out. The preset buttons and the Make buttons (a disk, or a
   ring) fill the grid in. Every change takes effect at once, keeping
   the seed and the step, like a Desmos slider.
   ===================================================================== */

// An offset's name, "x" in 1D or "x,y" in 2D, for the set below; and
// as it is shown, "x" or "(x, y)".
function offsetKey(t) { return dim === 1 ? String(t[0]) : t[0] + "," + t[1]; }
function offsetText(t) { return dim === 1 ? String(t[0]) : "(" + t[0] + ", " + t[1] + ")"; }

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
      const t = dim === 1 ? [x] : [x, y], key = offsetKey(t);
      const cell = document.createElement("button");
      cell.className = "tile-cell";
      if (x === 0 && y === 0) {
        cell.classList.add("center");
        cell.title = "the site itself";
        cell.disabled = true;
      } else {
        cell.title = offsetText(t);
        if (inTile.has(key)) cell.classList.add("on");
        cell.addEventListener("click", function () {
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
  const r1 = readWhole("ring-inner", 0, MAX_RADIUS, 3), r2 = readWhole("ring-outer", 0, MAX_RADIUS, 3);
  setTile(ringTile(Math.min(r1, r2), Math.max(r1, r2)));
});

// "4 offsets: (1, 0), (0, 1), ..." (the first few).
function describeTile() {
  if (tile.length === 0) return "T is empty: every block lands on the start site.";
  const shown = tile.slice(0, 12).map(offsetText);
  return "T has " + tile.length + (tile.length === 1 ? " offset: " : " offsets: ") + shown.join(", ") +
         (tile.length > 12 ? ", ..." : "") + ".";
}


/* =====================================================================
   4. THE DOMAIN
   ---------------------------------------------------------------------
   Whole line / plane: no limits. Segment / Box, Cycle / Torus: the
   given number of sites, centered on 0 (so the first block, on 0, is
   in the middle). Custom: the cells drawn in the graph tool. On a
   graph: the whole graph, or a ball around the start.
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
      if (kind === "custom") { tool.open(); return; }
      if (tool.isOpen) tool.close();
      domainKind = kind;
      showDomainChoice();
      restart(true);
    });
    row.appendChild(label);
  }
  // A new domain starts with the whole picture; in 2D and on a graph it
  // can be moved and zoomed (section 6b), and zoomed out further on a torus.
  useTorus(view, torusRange() !== null, dim !== 1);   // the 1D side view doesn't move
  const bounded = (domainKind === "box" || domainKind === "torus" || domainKind === "ball");
  byId("size-row").hidden = !bounded;
  byId("size-label").textContent = dim === 1 ? "Sites" : dim === 2 ? "Size" : "Every cell within R =";
  byId("height-part").hidden = (dim !== 2);
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
  if (dim === "graph") {       // the start is always the graph's first cell
    return { domain: domainKind === "ball"
      ? { kind: "ball", layers: readWhole("set-width", 1, MAX_SIZE.graph, DEFAULT_SIZE.graph) }
      : { kind: "whole" } };
  }
  if (domainKind === "custom") {
    const d = customDomain;
    const cells = [];
    for (let v = 0; v < d.n; v++) cells.push([d.x[v], d.y[v]]);
    return { domain: { kind: "cells", cells: cells, wrap: d.wrap }, start: customStart(d) };
  }
  const start = dim === 1 ? [0] : [0, 0];
  if (domainKind === "whole") return { domain: { kind: "whole" }, start: start };
  const across = centered(readWhole("set-width", 1, MAX_SIZE[dim], DEFAULT_SIZE[dim]));
  const down = dim === 1 ? { low: 0, high: 0 } : centered(readWhole("set-height", 1, MAX_SIZE[dim], DEFAULT_SIZE[dim]));
  return {
    domain: { kind: "box", xmin: across.low, xmax: across.high, ymin: down.low, ymax: down.high,
              torus: domainKind === "torus" },
    start: start,
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
   with newMountain(), newGraphMountain(), the hyperbolic tilings and
   trees, and the run loop and the trace (js/sim-worker.js) copied in.
   startWorker (js/sim-page.js) runs it in a second thread, so the page
   never freezes.
   ===================================================================== */
const worker = startWorker(mountainWorker,
  [newMountain, newGraphMountain, makeGraph, tilingShape, motionTimes, motionApply, halfTurn, coshFromStart,
   learnedRules, tilingByGeometry, tilingByRules, tilingRules, testRules, hashTable, ballAround, spreadPlace,
   makeRunLoop, newTrace, keepSample]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  if (message.places) keepPlaces(message);                        // on a graph (section 6d)
  if (message.rules) keepRules(message.rules);                    // on a graph (section 6d)
  if (message.dim === "graph") {
    byId("graph-built").textContent = message.exact ? "" : "This tiling has too many cells near the start " +
      "for the page to learn its rules, so it is built by geometry, which only reaches about distance 23 from the start.";
  }
  latest = message;
  showMessage(message.problem);
  if (message.atMax) {    // the run loop has paused by itself, and Play and Step can't go on
    if (player.playing) player.setPlaying(false);
    showMessage("That's the most steps this page goes to.");
  }
  byId("play").disabled = byId("step").disabled = Boolean(message.atMax);
  drawSoon();
};

worker.onerror = function () {
  showMessage("The sim couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// A new mountain with the current tile, domain and seed. With
// keepStep, it grows at once to the step it was at (so a change to the
// tile or the domain shows the same moment of the run); without, it
// starts again from one block. Blocks you clicked (section 6b) are kept,
// unless it starts again from one block or "forget" is true (a new seed).
function restart(keepStep, forget) {
  if (domainKind === "custom" && !customDomain) return;
  const where = domainSettings();
  run++;
  const message = {
    type: "setup", run: run, dim: dim, domain: where.domain, seed: byId("seed").value,
    steps: (keepStep && latest && latest.steps) ? latest.steps : 0,
    forgetClicks: !keepStep || Boolean(forget),
  };
  if (dim === "graph") {
    message.graph = disk.spec;
    message.radius = readWhole("set-radius", 1, MAX_GRAPH_RADIUS, 1);
  } else {
    message.tile = tile;
    message.start = where.start;
  }
  worker.postMessage(message);
  player.carryOn();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(worker, SPEEDS, DEFAULT_SPEED, "block", "blocks", function () { restart(false); });


/* =====================================================================
   6. DRAWING THE MOUNTAIN
   ---------------------------------------------------------------------
   Color shows height (heightColor below): height 1 is always the
   darkest (dark blue), and the colors run up to red at the largest
   height. Available sites
   with no block yet are gray.
     1D: one bar per site, as tall as its height, on a line; the gray
         available sites are small marks under the line.
     2D: seen from above, one square per cell, painted as in the other
         sims (paintCells, js/sim-view.js).
   The picture shows the whole domain if it is bounded, and otherwise
   every available site, with one site to spare around them.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawMountain(); showStats(); });

const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
// "Hyperbolic plane or tree": the graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js, section 6d). Changing
// how it is drawn ("Drawn in") shows the right options and buttons.
const disk = makeDiskView(simCanvas, view, showPictureKind);
// After the window changes size, or the picture opens or closes as a
// full screen popup (js/sim-page.js): draw again at the new size, in 3D too.
window.addEventListener("resize", function () {
  if (view3d) sim3d.setHeight(view3d, pictureHeight(PICTURE_HEIGHT));
  drawSoon();
});

// The color of height h (h = 1, 2, ...) when the tallest stack is
// "highest" blocks tall. Height 1 is always the darkest color (dark
// blue), and the colors run up to red at the tallest height, so the
// scale stretches upward as the mountain grows. (Going down the
// mountain, the hue goes from 0 (red) to 225 (blue), and the color
// gets darker on the way.) The same colors are used in every view: a site seen from above
// has the color of the top block of its stack. Returns [red, green,
// blue], each 0..255.
function heightColor(h, highest) {
  // t is 1 at height 1 (the bottom: dark blue) and 0 at the tallest (red).
  const t = highest <= 1 ? 1 : (highest - h) / (highest - 1);
  const hue = 225 * t, saturation = 0.7, value = 0.9 - 0.55 * t;
  // The usual HSV -> RGB recipe.
  const c = value * saturation, k = hue / 60, x = c * (1 - Math.abs((k % 2) - 1)), m = value - c;
  const rgb = k < 1 ? [c, x, 0] : k < 2 ? [x, c, 0] : k < 3 ? [0, c, x] : k < 4 ? [0, x, c] : k < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map(function (part) { return Math.round(255 * (part + m)); });
}

// Make the canvas "width" by "height" screen pixels, and return its pen,
// ready to draw in screen pixels.
function canvasPen(width, height) {
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  return pen;
}

// The x and y range of the picture, { xmin, xmax, ymin, ymax }: a
// bounded domain itself, or around the available sites.
function pictureRange() {
  if (domainKind === "box" || domainKind === "torus") return domainSettings().domain;
  if (domainKind === "custom") return customDomain;
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
  if (!haveMountain() || tool.isOpen) return;
  if (dim !== 1 && show3D) draw3D();     // section 6c
  else if (dim === 1) drawLine();
  else if (dim === 2) drawGrid();
  else if (disk.picture === "spread") drawSpread();   // section 6d
  else drawHyperbolic();
}

// 1D: bars. lineLayout says where the columns are, for clicks
// (section 6b).
let lineLayout = null;

function drawLine() {
  const s = latest, range = pictureRange();
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  const pen = canvasPen(width, height);
  const left = 8, right = width - 8, top = 20, ground = height - 30;
  const columns = range.xmax - range.xmin + 1;
  const column = (right - left) / columns;        // the width of one site
  lineLayout = { left: left, column: column, xmin: range.xmin };
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
      pen.fillStyle = rgbToHex(heightColor(h, highest));
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
  pen.fillText("largest height " + s.maxHeight.toLocaleString(), left + 36, 2);   // right of the full screen button
  pen.fillText(String(range.xmin), left, ground + 12);
  pen.textAlign = "right";
  pen.fillText(String(range.xmax), right, ground + 12);
  if (range.xmin < 0 && range.xmax > 0) {
    pen.textAlign = "center";
    pen.fillText("0", columnLeft(0) + column / 2, ground + 12);
  }
}

// 2D: seen from above, painted as in the coloring sims (paintCells,
// js/sim-view.js): for each square that shows in the picture's box, the
// site there. On a torus that wraps around, so the squares beyond the
// box show the torus again, and the picture can be moved and zoomed
// (section 6b).

// The torus that the 2D picture wraps around, or null.
function torusRange() {
  if (dim !== 2) return null;
  if (domainKind === "torus") return pictureRange();
  if (domainKind === "custom" && customDomain && customDomain.wrap) return customDomain.wrap;
  return null;
}

// The sites of the last 2D picture as a domain (js/sim-domains.js) whose
// cell number i is site i: its range, its torus, and cellAt, which site
// is at each place in the range (-1 = none). Clicks use it too
// (section 6b).
let gridSites = null;

function drawGrid() {
  const s = latest, range = pictureRange();
  const across = range.xmax - range.xmin + 1, down = range.ymax - range.ymin + 1;
  const cssWidth = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  // The picture's box: square cells, as big as fit in the canvas (which
  // always has the same size), in the middle of it. The view remembers
  // it, in screen pixels: "left", "top", "width" and "height" of the box,
  // and "size", the size of a cell when the whole picture fits (zoom 1).
  view.size = Math.min(cssWidth / across, height / down);   // a cell at zoom 1
  view.width = Math.round(view.size * across);
  view.height = Math.round(view.size * down);
  view.left = Math.round((cssWidth - view.width) / 2);
  view.top = Math.round((height - view.height) / 2);
  const pen = canvasPen(cssWidth, height);

  gridSites = { xmin: range.xmin, xmax: range.xmax, ymin: range.ymin, ymax: range.ymax,
                wrap: torusRange(), cellAt: new Int32Array(across * down).fill(-1) };
  for (let i = 0; i < s.x.length; i++) {
    const x = s.x[i] - range.xmin, y = s.y[i] - range.ymin;   // (a site of an older domain may be outside)
    if (x >= 0 && x < across && y >= 0 && y < down) gridSites.cellAt[y * across + x] = i;
  }

  // Paint the squares, only inside the picture's box (paintCells draws
  // from the top of the box), then a thin frame around the box.
  const empty = hexToRGB(EMPTY), highest = Math.max(s.maxHeight, 1);
  pen.translate(0, view.top);
  pen.save();
  pen.beginPath();
  pen.rect(view.left, 0, view.width, view.height);
  pen.clip();
  paintCells(view, pen, gridSites, function (i) { return s.height[i]; },
             function (h) { return h === 0 ? empty : heightColor(h, highest); }, hexToRGB(OUTSIDE));
  pen.restore();
  pen.strokeStyle = EMPTY;
  pen.strokeRect(view.left + 0.5, 0.5, view.width - 1, view.height - 1);
}


/* =====================================================================
   6b. MOVING, ZOOMING AND CLICKING THE PICTURE
   ---------------------------------------------------------------------
   In 2D the picture can be moved and zoomed, as in the coloring sims
   (and like a graph in Desmos). On a torus (the Torus domain, or a
   domain drawn on a torus in the graph tool) it can also be zoomed out
   to show the torus several times:
     drag                         move it
     mouse wheel, or pinch        zoom in or out, around the pointer
     the + / − / Reset buttons    zoom in, zoom out, show it all again
   The code for all of it is shared with the other sims
   (connectPicture, js/sim-controls.js, and js/sim-view.js).
   On a graph the pictures zoom the same way. In the disk and the
   half-plane, though, dragging with the mouse (or one finger) moves you
   across the plane instead (section 6d); two fingers still slide and
   zoom the picture.

   Click to drop a block: a click (a press that hardly moves) on an
   available site drops the next block there, as if the random pick had
   chosen it. Only the available sites (colored, or gray with no block
   yet) can take a block, as in the rule. It works in the pictures seen
   from above (1D, 2D, the disk, the half-plane and the spread-out
   tree), not in 3D. The worker keeps the clicked blocks, so they stay
   when you change the tile or the domain or go back with "Go to step";
   Restart and a new seed forget them.
   ===================================================================== */
connectPicture(view, disk, function () { return dim === "graph"; }, clickAt);

function clickAt(event) {
  if (!haveMountain() || tool.isOpen) return;
  const site = siteUnder(event);
  if (site >= 0) {
    if (player.playing) player.setPlaying(false);
    worker.postMessage({ type: "click", site: site });
  } else {
    showMessage("A block can only land on an available site: one with blocks, or a gray one next to them.");
  }
}

// The site under the pointer of a pointer event, or -1.
function siteUnder(event) {
  // 2D: on the squares drawGrid painted (cellUnder, js/sim-view.js).
  if (dim === 2) return gridSites ? cellUnder(view, gridSites, pointerSpot(view, event)) : -1;
  const s = latest;
  const box = simCanvas.getBoundingClientRect();
  const px = event.clientX - box.left, py = event.clientY - box.top;   // in screen pixels on the canvas
  if (dim === 1) {
    if (!lineLayout) return -1;
    const x = lineLayout.xmin + Math.floor((px - lineLayout.left) / lineLayout.column);
    return s.x.indexOf(x);
  }
  // On a graph: the nearest site, if the click is on it (tiny ones
  // count within 4 pixels). Where each site is drawn, and how big, comes
  // from js/sim-hyperbolic.js, as when it is drawn.
  if (!disk.box) return -1;
  const tree = isTree(disk.spec);
  let best = -1, bestDistance = Infinity;
  for (let i = 0; i < s.height.length; i++) {
    let x, y, r;
    if (disk.picture === "spread") {
      const k = spreads[2 * i];
      [x, y] = spreadSpot(disk, k, spreads[2 * i + 1]);
      r = spreadDot(disk, k);
    } else {
      const [mx, my] = motionApply(seenFrom(disk, sitePlace(i)), 0, 0);   // the cell's middle
      if (!onScreen(disk, mx, my)) continue;
      [x, y] = diskToScreen(disk, mx, my);
      r = cellPixels(disk, mx, my) * (tree ? 0.55 : 1);
    }
    const d = Math.hypot(px - x, py - y);
    if (d <= Math.max(r, 4) && d < bestDistance) { best = i; bestDistance = d; }
  }
  return best;
}


/* =====================================================================
   6c. THE 3D VIEW
   ---------------------------------------------------------------------
   In 2D (and on a graph, section 6d), the View option can show the
   mountain in 3D: each site's blocks as a stack of cubes or coins,
   colored from the bottom up with the same colors as the view from
   above (so seen from straight above, it looks like the 2D picture).
   Gray tiles are the available sites with no block yet. The 3D code is
   shared, in js/sim-3d.js; it loads the 3D library three.js from the
   internet the first time 3D is switched on.

   Heights: a block starts as a cube. Once the mountain gets taller than
   half its width, the blocks are squashed to keep it that tall, so the
   whole mountain stays in the picture; the Heights slider makes it
   taller or flatter.
   ===================================================================== */
let sim3d = null;            // the 3D code, once loaded (js/sim-3d.js)
let view3d = null;           // the 3D picture
let loading3D = false;       // start3D has begun (false again if loading fails)

// Which picture shows: the view from above, the 3D view (not in 1D),
// or neither while the graph tool is open.
function showPictureKind() {
  const in3D = (dim !== 1 && show3D);
  simCanvas.hidden = tool.isOpen || in3D;
  byId("sim-3d").hidden = byId("view3d-buttons").hidden = tool.isOpen || !in3D;
  byId("disk-reset").hidden = dim !== "graph" || disk.picture === "spread";   // with the zoom buttons
  byId("picture-row").hidden = in3D || dim !== "graph";
  byId("view-rows").hidden = (dim === 1);
  byId("stretch-row").hidden = byId("view3d-help").hidden = !in3D;
  // Cubes or coins: on a graph only coins (cells there aren't squares,
  // and cubes on cells of different sizes bump into each other).
  byId("blocks-row").hidden = !in3D || dim === "graph";
  showZoomButtons(view);
  if (in3D && !view3d) start3D();
  drawSoon();
}

// Load the 3D code (the first time only) and make the 3D picture.
async function start3D() {
  if (loading3D) return;
  loading3D = true;
  showMessage("Loading the 3D view...");
  try {
    // The path is counted from this .js file (toysnsims/random-mountain/), not the page.
    sim3d = await import("../../js/sim-3d.js");
  } catch (error) {
    loading3D = false;
    show3D = false;
    document.querySelector('input[name="view"][value="flat"]').checked = true;
    showPictureKind();
    showMessage("The 3D view couldn't load. It needs the library three.js from the " +
                "internet, so check the connection and try again.");
    return;
  }
  view3d = sim3d.make3DView(byId("sim-3d"), pictureHeight(PICTURE_HEIGHT));
  showMessage("");
  drawSoon();
}

function draw3D() {
  if (!view3d) return;
  if (dim === "graph") { draw3DOnDisk(); return; }   // section 6d
  sim3d.drawStacks(view3d, {
    x: latest.x, y: latest.y, height: latest.height,
    floor: pictureRange(),   // as from above: a box, or a drawn domain's own cells
    shape: blockShape, stretch: stretch,
    color: heightColor, empty: hexToRGB(EMPTY), ground: hexToRGB(OUTSIDE),
  });
}

// The View, Blocks and Heights options.
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () { show3D = (radio.value === "3d"); showPictureKind(); });
}
for (const radio of document.querySelectorAll('input[name="blocks"]')) {
  radio.addEventListener("change", function () { blockShape = radio.value; drawSoon(); });
}
function showStretch() {
  byId("stretch-label").textContent = stretch === 1 ? "normal"
    : (stretch > 1 ? stretch.toFixed(1) + " times taller" : (1 / stretch).toFixed(1) + " times flatter");
}
byId("stretch").addEventListener("input", function () {
  stretch = Math.pow(2, Number(this.value) / 2);
  showStretch();
  drawSoon();
});
byId("view3d-reset").addEventListener("click", function () { if (view3d) sim3d.resetCamera(view3d); });


/* =====================================================================
   6d. THE HYPERBOLIC PLANE OR A TREE, SEEN FROM ABOVE
   ---------------------------------------------------------------------
   The disk, the half-plane, or a tree spread out (the "Drawn in"
   option), each site drawn as its cell colored by height (on a tree, a
   coin on its vertex), over the whole tiling (or tree) in thin gray.
   Dragging moves across the plane, and the pictures zoom like the grid.
   The drawing, the dragging and the zoom are shared with the other sims
   on these graphs, in js/sim-hyperbolic.js. The 3D view stands the
   stacks on the disk, with the tiling drawn on its floor.

   The worker sends each site's place once (its motion [a, b], see
   js/sim-graphs.js), and on a tree its depth and angle for the
   spread-out picture; the page keeps them in "places" and "spreads".
   ===================================================================== */
let places = new Float64Array(4 * 1024);   // site i's motion is places[4i .. 4i+3]
let spreads = new Float64Array(2 * 1024);  // on a tree: site i's depth and angle are spreads[2i], spreads[2i + 1]

// Keep the places sent with a message (from site number placesFrom on).
function keepPlaces(message) {
  places = keepAlong(places, message.places, 4 * message.placesFrom);
  if (message.spread) spreads = keepAlong(spreads, message.spread, 2 * message.placesFrom);
}
// Copy "more" into the list "kept" from position "at" on, making the
// list bigger first if it has to be. Returns the list.
function keepAlong(kept, more, at) {
  if (at + more.length > kept.length) {
    const bigger = new Float64Array(Math.max(at + more.length, 2 * kept.length));
    bigger.set(kept);
    kept = bigger;
  }
  kept.set(more, at);
  return kept;
}

// Where site i is: its motion.
function sitePlace(i) { return places.subarray(4 * i, 4 * i + 4); }

// The color of site i: by its height, gray with no block yet.
function siteColor(i) {
  const h = latest.height[i];
  return h === 0 ? EMPTY : rgbToHex(heightColor(h, Math.max(latest.maxHeight, 1)));
}

// The disk or the half-plane: the sites, over the whole tiling (or
// tree) in thin gray (js/sim-hyperbolic.js).
function drawHyperbolic() {
  const height = pictureHeight(PICTURE_HEIGHT);
  const pen = diskPen(disk, height);
  drawDiskFrame(disk, pen, height, OUTSIDE, EMPTY);
  drawOnDisk(disk, pen, graphUnder(), latest.height.length, sitePlace, siteColor);
}

// A tree spread out (js/sim-hyperbolic.js).
function drawSpread() {
  drawSpreadTree(disk, pictureHeight(PICTURE_HEIGHT), latest.height.length,
    function (i) { return spreads[2 * i]; }, function (i) { return spreads[2 * i + 1]; }, siteColor);
}

// The graph for the gray lines, or null until the rules come. The page
// builds its own copy of the graph (diskGraph, js/sim-hyperbolic.js), the
// same way the mountain's thread does (js/sim-graphs.js), from the rules
// that thread learned and sent with its first message, so the page never
// has to learn them again. It numbers cells in its own order; it only
// says where cells are, not which ones are sites.
function graphUnder() {
  const name = disk.spec.p + "," + disk.spec.q;
  if (!learnedRules.kept || !learnedRules.kept.has(name)) return null;
  return diskGraph(disk);
}

// The rules the mountain's thread sends with its first message.
function keepRules(rules) {
  if (!learnedRules.kept) learnedRules.kept = new Map();
  learnedRules.kept.set(rules.name, rules.kinds);
}

// The 3D view on a graph: the disk is the floor, with the tiling (or
// the tree) drawn on it in thin lines, and each site's stack of coins
// stands on its cell, as wide as the cell (on a tree, a bit over half
// as wide, so the tree's lines show between the stacks). Every coin is
// equally thick, so a stack's height shows its count however small its
// cell. Cells too small to see are left out.
function draw3DOnDisk() {
  const s = latest;
  const unit = 1 / (2 * diskShape(disk).middle);    // so the first cell, in the middle, is 1 wide
  const thinner = isTree(disk.spec) ? 0.6 : 1;
  const x = [], y = [], height = [], width = [];
  for (let i = 0; i < s.height.length; i++) {
    const [mx, my] = motionApply(seenFrom(disk, sitePlace(i)), 0, 0);
    const w = 1 - mx * mx - my * my;           // how much smaller than the first cell it looks
    if (w < 0.004) continue;
    x.push(mx * unit); y.push(my * unit); height.push(s.height[i]); width.push(thinner * w);
  }
  sim3d.drawStacks(view3d, {
    x: x, y: y, height: height, width: width, floor: { disk: unit },
    shape: "coins", stretch: stretch,
    color: heightColor, empty: hexToRGB(EMPTY), ground: hexToRGB(OUTSIDE),
    lines: floorLines(unit), lineColor: hexToRGB(UNDER_COLOR_3D),
  });
}

// The tiling (or the tree) on the 3D floor: the same lines drawUnder
// draws from above, written down as line segments [x1, y1, x2, y2, ...]
// on the floor (the disk, "unit" times bigger) by a "pen" that only
// takes notes. They only change when the view moves or the graph
// changes, so the last ones are kept and reused.
let floorLinesFor = "", floorLinesKept = [];
function floorLines(unit) {
  const key = disk.spec.p + "," + disk.spec.q + " " + disk.motion.join(",") + " " + Boolean(graphUnder());
  if (key === floorLinesFor) return floorLinesKept;
  const lines = [];
  let first = null, last = null;
  const notes = {
    beginPath: function () {}, stroke: function () {},
    moveTo: function (x, y) { first = last = [x, y]; },
    lineTo: function (x, y) { lines.push(last[0], last[1], x, y); last = [x, y]; },
    closePath: function () { lines.push(last[0], last[1], first[0], first[1]); last = first; },
  };
  const middle = diskShape(disk).middle;
  drawUnder(disk, notes, graphUnder(), function (x, y) { return [x * unit, y * unit]; },
            function (x, y) { return PICTURE_HEIGHT / 2 * middle * (1 - x * x - y * y); });   // about its size on the screen
  floorLinesFor = key;
  floorLinesKept = lines;
  return lines;
}

// A new graph from the options: start again on it, with the first cell
// in the middle of the picture.
function useGraph() {
  if (!readGraphOptions(disk)) return;
  backToStart(disk);
  resetView(view);
  showPictureKind();
  restart(true);
}
for (const id of ["set-p", "set-q", "set-degree"]) byId(id).addEventListener("change", useGraph);
for (const radio of document.querySelectorAll('input[name="graph-kind"]')) radio.addEventListener("change", useGraph);
byId("set-radius").addEventListener("change", function () { restart(true); });


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   All for the run on the screen. The growth rule keeps the numbers up
   to date, and a sample of them every so often for the charts (see
   part 2 of random-mountain-growth.js).
   ===================================================================== */
function showStats() {
  if (!haveMountain()) return;
  const s = latest;
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

  plotOverTime(byId("base-chart"), s.traceSteps, [{ values: s.traceBase, color: CHART_LINE }], "step");
  plotOverTime(byId("highest-chart"), s.traceSteps, [{ values: s.traceHighest, color: CHART_LINE }], "step");
  plotOverTime(byId("start-chart"), s.traceSteps, [{ values: s.traceStart, color: CHART_LINE }], "step");
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   As in the other sims: choosing "Custom" swaps the picture for the
   graph tool, loaded in an <iframe> (makeCustomTool, js/sim-controls.js).
   Done uses the drawing. Only the painted cells matter (the tile
   decides where blocks can go next), so the domain need not be one
   connected piece.
   ===================================================================== */
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return player.playing; },
  setPlaying: player.setPlaying,
  showPicture: showPictureKind,     // the 2D or 3D picture hides while the tool is open
  check: function (drawing) {
    const cells = drawing.graph.vertices.length;
    return cells === 0 ? ["Paint the domain first.", ""] : ["", cells + " cells."];
  },
  done: function (drawing) {
    customDomain = drawnDomain(drawing.graph, drawing.grid);
    domainKind = "custom";
    showDomainChoice();
    restart(true);
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
});
byId("edit-custom").addEventListener("click", tool.open);


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Dimension: 1D, 2D or a graph. Each has its own domains (and 1D and 2D
// their own tile presets), so the domain goes back to the whole line,
// plane or graph, and in 1D and 2D the tile to the first preset.
function setDimension(value) {
  dim = value;
  if (tool.isOpen) tool.close();
  domainKind = "whole";
  byId("set-width").value = byId("set-height").value = DEFAULT_SIZE[dim];
  byId("set-width").max = byId("set-height").max = MAX_SIZE[dim];
  const onGraph = (dim === "graph");
  byId("graph-rows").hidden = byId("ball-tile").hidden = !onGraph;
  byId("offset-tile").hidden = onGraph;
  showDomainChoice();
  showPictureKind();
  if (onGraph) {
    useGraph();
  } else {
    showPresets();
    setTile(PRESETS[dim][0].tile);
  }
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(radio.value === "graph" ? "graph" : Number(radio.value)); });
}

// The size of a segment, cycle, box or torus, or the R of a ball.
for (const id of ["set-width", "set-height"]) {
  byId(id).addEventListener("change", function () { restart(true); });
}

// Go to step.
byId("goto").addEventListener("click", function () {
  worker.postMessage({ type: "goto", steps: readWhole("goto-steps", 0, 10000000, 0) });
});

// Seed: the same seed gives the same mountain every time.
connectSeed(function () { restart(true, true); });


// --- Start ------------------------------------------------------------
byId("seed").value = DEFAULT_SEED;
byId("goto-steps").value = 1000;
showStretch();
showGraphPresets(useGraph);
setDimension(1);
player.setPlaying(false);   // paused: press Play
