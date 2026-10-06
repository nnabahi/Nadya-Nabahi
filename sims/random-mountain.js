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
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js, moving and zooming the 2D picture is in
   js/sim-view.js (shared with the coloring sims), and the 3D view is
   in js/sim-3d.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The tile: the clickable grid and presets
     4. The domain
     5. Running the mountain
     6. Drawing the mountain
     6b. Moving and zooming the 2D picture
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
const MAX_RADIUS = 30;

// The domains for each dimension, and the default size of a bounded one.
const DOMAINS = {
  1: [["whole", "Whole line"], ["box", "Segment"], ["torus", "Cycle"]],
  2: [["whole", "Whole plane"], ["box", "Box"], ["torus", "Torus"], ["custom", "Custom (draw it)"]],
};
const DEFAULT_SIZE = { 1: 101, 2: 41, graph: 6 };
const MAX_SIZE = { 1: 2001, 2: 301, graph: 12 };

// "Hyperbolic plane or tree": the graph presets (js/sim-graphs.js makes
// them; q = Infinity is the tree whose cells meet p at a time), its
// domains (a ball is every cell within R steps of the start), and the
// largest r for the tile "every cell within distance r".
const GRAPH_PRESETS = [
  { name: "{7, 3}", graph: { kind: "tiling", p: 7, q: 3 } },
  { name: "{5, 4}", graph: { kind: "tiling", p: 5, q: 4 } },
  { name: "{4, 5}", graph: { kind: "tiling", p: 4, q: 5 } },
  { name: "{3, 7}", graph: { kind: "tiling", p: 3, q: 7 } },
  { name: "Tree, degree 3", graph: { kind: "tiling", p: 3, q: Infinity } },
  { name: "Tree, degree 4", graph: { kind: "tiling", p: 4, q: Infinity } },
];
DOMAINS.graph = [["whole", "The whole plane (or tree)"], ["ball", "A ball"]];
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
// blocks are drawn one by one, the camera) are in js/sim-3d.js.

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
let show3D = false;          // 2D only: the 3D view instead of the view from above (section 6c)
let blockShape = "cubes";    // the 3D view's blocks: "cubes" or "coins"
let stretchLevel = 0;        // the 3D view's Heights slider: -4 (flatter) .. 4 (taller)
let graphSpec = GRAPH_PRESETS[0].graph;   // "Hyperbolic plane or tree": the graph
let diskMotion = [1, 0, 0, 0];            // ... and how far the view of it has been moved (section 6d)
let graphPicture = "disk";                // ... and how it is drawn: "disk", "half" (the half-plane) or "spread" (trees)

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
const worker = startWorker(mountainWorker,
  [newMountain, newGraphMountain, makeGraph, tilingShape, motionTimes, motionApply, halfTurn, coshFromStart,
   learnedRules, tilingByGeometry, tilingByRules, tilingRules, testRules, hashTable, ballAround, spreadPlace]);

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
  if (dim === "graph") {
    worker.postMessage({
      type: "setup", run: run, dim: "graph", graph: graphSpec,
      radius: readWhole("set-radius", 1, MAX_GRAPH_RADIUS, 1),
      domain: where.domain, seed: byId("seed").value, steps: steps,
    });
  } else {
    worker.postMessage({
      type: "setup", run: run, dim: dim, tile: tile,
      domain: where.domain, start: where.start,
      seed: byId("seed").value, steps: steps,
    });
  }
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
   Color shows height (heightColor below): height 1 is always red,
   and the colors run up to blue at the largest height. Available sites
   with no block yet are gray.
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
const view = makeView(simCanvas, drawSoon);      // where the picture goes, and the 2D picture's zoom (js/sim-view.js)
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
// After the window changes size, or the picture opens or closes as a
// full screen popup (js/sim-page.js): draw again at the new size, in 3D too.
window.addEventListener("resize", function () {
  if (view3d) sim3d.setHeight(view3d, pictureHeight(PICTURE_HEIGHT));
  drawSoon();
});

// The color of height h (h = 1, 2, ...) when the tallest stack is
// "highest" blocks tall. Height 1 is always red, and the colors run up
// to blue at the tallest height, so the scale stretches upward as the
// mountain grows. (The old site's colors, turned upside down: the hue
// goes from 0 (red) up to 225 (blue), and the color gets darker on the
// way.) The same colors are used in every view: a site seen from above
// has the color of the top block of its stack. Returns [red, green,
// blue], each 0..255.
function heightColor(h, highest) {
  const t = highest <= 1 ? 0 : (h - 1) / (highest - 1);   // 0 at height 1, 1 at the tallest
  const hue = 225 * t, saturation = 0.7, value = 0.9 - 0.55 * t;
  // The usual HSV -> RGB recipe.
  const c = value * saturation, k = hue / 60, x = c * (1 - Math.abs((k % 2) - 1)), m = value - c;
  const rgb = k < 1 ? [c, x, 0] : k < 2 ? [x, c, 0] : k < 3 ? [0, c, x] : k < 4 ? [0, x, c] : k < 5 ? [x, 0, c] : [c, 0, x];
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
  if (!latest || !latest.height || latest.dim !== dim || toolOpen) return;   // nothing yet, or from before a switch of dimension
  if (dim !== 1 && show3D) draw3D();     // section 6c
  else if (dim === 1) drawLine();
  else if (dim === 2) drawGrid();
  else if (graphPicture === "spread") drawSpread();   // section 6d
  else drawHyperbolic();
}

// 1D: bars.
function drawLine() {
  const s = latest, range = pictureRange();
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
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
      pen.fillStyle = cssColor(heightColor(h, highest));
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

  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(cssWidth * ratio);
  simCanvas.height = Math.round(height * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on

  // Each site's number, by its place, to look up a cell quickly.
  const siteAt = new Map();
  for (let i = 0; i < s.x.length; i++) siteAt.set(s.x[i] + "," + s.y[i], i);

  // Which squares show. Square (i, k) is column i from the left and row
  // k from the top of the picture (k = 0 is the top row, y = ymax: rows
  // go up the screen as y goes up). view.scroll moves the squares, in
  // cells, and view.zoom sizes them (js/sim-view.js).
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
        : s.height[site] === 0 ? empty : heightColor(s.height[site], highest);
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
   6b. MOVING AND ZOOMING THE 2D PICTURE
   ---------------------------------------------------------------------
   In 2D the picture can be moved and zoomed, as in the coloring sims
   (and like a graph in Desmos). On a torus (the Torus domain, or a
   domain drawn on a torus in the graph tool) it can also be zoomed out
   to show the torus several times:
     drag                         move it
     mouse wheel, or pinch        zoom in or out, around the pointer
     the + / − / Reset buttons    zoom in, zoom out, show it all again
   The code for all of it is shared with the coloring sims, in
   js/sim-view.js: the view made in section 6 handles the mouse wheel
   and the buttons, and this page passes its pointer events on to it.
   ("Pointer" events cover the mouse, a pen and fingers alike.)
   On a graph the pictures zoom the same way. In the disk and the
   half-plane, though, dragging with the mouse (or one finger) moves you
   across the plane instead (section 6d); two fingers still slide and
   zoom the picture.
   ===================================================================== */
simCanvas.addEventListener("pointerdown", function (event) {
  pressPointer(view, event);
  startPlaneDrag();
});
simCanvas.addEventListener("pointermove", function (event) {
  if (dragFrom && view.pointers.has(event.pointerId)) {
    view.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });   // where a second finger starts from
    dragPlane(event.clientX, event.clientY);
  } else {
    movePointer(view, event);
  }
});
for (const type of ["pointerup", "pointercancel"]) {
  simCanvas.addEventListener(type, function (event) {
    releasePointer(view, event);
    startPlaneDrag();
  });
}


/* =====================================================================
   6c. THE 3D VIEW
   ---------------------------------------------------------------------
   In 2D (and on a graph, section 6d), the View option can show the
   mountain in 3D: each site's
   blocks as a stack of cubes or coins, colored from the bottom up with
   the same colors as the view from above (so seen from straight above,
   it looks like the 2D picture). Gray tiles are the available sites
   with no block yet. The 3D code is shared, in js/sim-3d.js; it loads
   the 3D library three.js from the internet the first time 3D is
   switched on.

   Heights: a block starts as a cube. Once the mountain gets taller than
   half its width, the blocks are squashed to keep it that tall, so the
   whole mountain stays in the picture; the Heights slider makes it
   taller or flatter.
   ===================================================================== */
let sim3d = null;            // the 3D code, once loaded (js/sim-3d.js)
let view3d = null;           // the 3D picture
let loading3D = false;

// Which picture shows: the view from above, the 3D view (not in 1D),
// or neither while the graph tool is open.
function showPictureKind() {
  const in3D = (dim !== 1 && show3D);
  simCanvas.hidden = toolOpen || in3D;
  byId("sim-3d").hidden = byId("view3d-buttons").hidden = toolOpen || !in3D;
  byId("disk-reset").hidden = dim !== "graph" || graphPicture === "spread";   // with the zoom buttons
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
    sim3d = await import("../js/sim-3d.js");
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
  const s = latest;
  // The floor: the domain's cells for a drawn domain, otherwise the
  // same box as the view from above.
  const floor = domainKind === "custom"
    ? { x: Array.from(customDomain.x), y: Array.from(customDomain.y) }
    : pictureRange();
  sim3d.drawStacks(view3d, {
    x: s.x, y: s.y, height: s.height, floor: floor,
    shape: blockShape, stretch: Math.pow(2, stretchLevel / 2),
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
  const factor = Math.pow(2, stretchLevel / 2);
  byId("stretch-label").textContent = stretchLevel === 0 ? "normal"
    : (factor > 1 ? factor.toFixed(1) + " times taller" : (1 / factor).toFixed(1) + " times flatter");
}
byId("stretch").addEventListener("input", function () {
  stretchLevel = Number(this.value);
  showStretch();
  drawSoon();
});
byId("view3d-reset").addEventListener("click", function () { if (view3d) sim3d.resetCamera(view3d); });


/* =====================================================================
   6d. THE HYPERBOLIC PLANE OR A TREE, SEEN FROM ABOVE
   ---------------------------------------------------------------------
   Three pictures (the "Drawn in" option):
     disk        the Poincare disk (see the top of js/sim-graphs.js): the
                 whole hyperbolic plane inside a circle, with cells
                 shrinking toward the edge
     half-plane  the upper half-plane: the same plane above a line, with
                 cells shrinking toward the line. It is the disk moved
                 by w = i (1 + z) / (1 - z) (Beardon, Chapter 7), which
                 takes the disk's middle to i and its edge to the line.
     spread out  trees only: the start in the middle, the cells k steps
                 away on the circle of radius k, and each cell's
                 children sharing its slice of the circle
                 (spreadPlace, js/sim-graphs.js)
   Each site is drawn as its cell (a dot in the spread-out picture),
   colored by height like the 2D picture; tiny cells are single dots.
   Under it all, the whole tiling (or tree) is drawn in thin gray.

   In the disk and the half-plane, dragging moves you around the plane:
   the point you grab follows the pointer, and the whole picture moves
   by the hyperbolic motion that carries one to the other (so cells
   change size as they move, but never shape). "Back to the start" puts
   the first cell back in the middle. All three pictures also zoom (and
   the spread-out one slides) like the grid, with the view of section 6b:
   it zooms and moves the whole picture (the function zoomed), and the
   drawing leaves out what is off the screen. The 3D view stands the
   stacks on the disk.

   The worker sends each site's place once (its motion [a, b], see
   js/sim-graphs.js), and on a tree its depth and angle for the
   spread-out picture; the page keeps them in "places" and "spreads".
   ===================================================================== */
let places = new Float64Array(4 * 1024);   // site i's motion is places[4i .. 4i+3]
let spreads = new Float64Array(2 * 1024);  // on a tree: site i's depth and angle are spreads[2i], spreads[2i + 1]
// Where the picture is on the canvas: for the disk { cx, cy, radius },
// for the half-plane { cx, base, unit } (the line is "base" pixels down,
// and a length of 1 is "unit" pixels).
let pictureBox = null;

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

// The shape of the current graph's first cell (js/sim-graphs.js),
// worked out again only when the graph changes.
let shapeFor = null, shape = null;
function currentShape() {
  if (shapeFor !== graphSpec) { shapeFor = graphSpec; shape = tilingShape(graphSpec.p, graphSpec.q); }
  return shape;
}

// Where site i is in the picture: its motion, moved by the view.
function siteMotion(i) {
  return motionTimes(diskMotion, [places[4 * i], places[4 * i + 1], places[4 * i + 2], places[4 * i + 3]]);
}

// The point w = i (1 + z) / (1 - z) of the half-plane that the point
// z = (x, y) of the disk goes to, as [re, im]. (Worked out:
// re = -2y / D, im = (1 - x^2 - y^2) / D, with D = (1 - x)^2 + y^2.)
function toHalfPlane(x, y) {
  const D = Math.max((1 - x) * (1 - x) + y * y, 1e-12);   // the edge point z = 1 goes infinitely far up
  return [-2 * y / D, (1 - x * x - y * y) / D];
}

// Where a point (x, y) of the disk lands on the screen. In the disk:
// at (cx + x radius, cy - y radius) (y goes up). In the half-plane: its
// point w, "unit" pixels per length 1, with the line at "base".
function toScreen(x, y) {
  const b = pictureBox;
  if (graphPicture === "disk") return [b.cx + x * b.radius, b.cy - y * b.radius];
  const [re, im] = toHalfPlane(x, y);
  // (Far off the screen, kept to a size the canvas can handle.)
  return [b.cx + Math.max(-1e5, Math.min(1e5, re * b.unit)), b.base - Math.min(1e5, im * b.unit)];
}

// How big a cell looks, in pixels (about its inradius), if its middle is
// at the point (x, y) of the disk. The disk shrinks lengths near (x, y)
// by 1 - x^2 - y^2, and the half-plane near w by Im(w) (Beardon,
// Chapter 7; the two agree for the cell in the middle of each).
function cellPixels(x, y) {
  const b = pictureBox, middle = currentShape().middle;
  if (graphPicture === "disk") return b.radius * middle * (1 - x * x - y * y);
  return 2 * b.unit * middle * toHalfPlane(x, y)[1];
}

// Whether a cell whose middle is at the point (x, y) of the disk could
// show on the screen: everything within hyperbolic distance R of its
// middle, with R the cell's circumradius (for a tree, its inradius:
// the tree's lines and the coins stay that close).
// In the disk, a hyperbolic circle is a Euclidean circle (Beardon,
// Chapter 7); worked out from its middle and radius there, it stays
// within (1 - |z|^2) t / (1 - t) of z, with t = tanh(R / 2).
// In the half-plane, the points within distance R of w are between
// heights Im(w) e^-R and Im(w) e^R, and at most Im(w) sinh(R) to
// either side (Beardon, Chapter 7).
function onScreen(x, y) {
  const shape = currentShape(), b = pictureBox;
  const R = shape.q === Infinity ? shape.inradius : shape.circumradius;
  if (graphPicture === "disk") {
    const t = Math.tanh(R / 2), reach = b.radius * (1 - x * x - y * y) * t / (1 - t);
    const [sx, sy] = toScreen(x, y);
    return sx + reach > 0 && sx - reach < b.width && sy + reach > 0 && sy - reach < b.height;
  }
  const [re, im] = toHalfPlane(x, y);
  const left = -b.cx / b.unit, right = (b.width - b.cx) / b.unit;      // the screen's sides, as Re(w)
  const top = b.base / b.unit, bottom = (b.base - b.height) / b.unit;  // its top and bottom, as Im(w)
  return im * Math.exp(-R) < top && im * Math.exp(R) > bottom &&
         re + im * Math.sinh(R) > left && re - im * Math.sinh(R) < right;
}

// Add the outline of the cell with motion A to the pen's path (for
// small cells, every 4th point of it is plenty).
// "place" (toScreen if left out) says where a point of the disk goes.
function traceOutline(pen, A, size, place) {
  const outline = currentShape().outline, every = size < 5 ? 4 : 1;
  for (let k = 0; k < outline.length; k += every) {
    const [x, y] = (place || toScreen)(...motionApply(A, outline[k][0], outline[k][1]));
    if (k === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
  }
  pen.closePath();
}

// Add the lines from the middle of the cell with motion A to the middle
// of each of its sides. On a tree, those lines from all the cells are
// the tree itself: each edge runs from one cell's middle, through the
// side the two cells share, to the other's. (Each half is a straight
// line through the middle of the first cell, moved by A, so it is a
// hyperbolic straight line: a circle arc in the disk.) "place" is as in
// traceOutline.
function traceSpokes(pen, A, place) {
  const POINTS = 6;
  for (const [sx, sy] of currentShape().sides) {
    for (let j = 0; j <= POINTS; j++) {
      const [x, y] = (place || toScreen)(...motionApply(A, sx * j / POINTS, sy * j / POINTS));
      if (j === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
    }
  }
}

// Make the canvas the picture's size and return its pen, ready to draw
// in screen pixels.
function graphPen() {
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  // The view (js/sim-view.js) zooms and moves these pictures as it does
  // the grid: its box is the whole canvas, measured in "cells" a 60th of
  // the canvas's shorter side (so it zooms in up to about 50 times).
  view.left = 0;
  view.top = 0;
  view.width = width;
  view.height = height;
  view.size = Math.min(width, height) / 60;
  return pen;
}

// Where the point (px, py) of the whole, unzoomed picture is on the
// screen, with the view's zoom and move.
function zoomed(px, py) {
  return [(px + view.scroll.x * view.size) * view.zoom, (py + view.scroll.y * view.size) * view.zoom];
}

// The disk or the half-plane.
function drawHyperbolic() {
  const s = latest, pen = graphPen();
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  // (Unzoomed, as the whole picture; then zoomed and moved by the view.)
  if (graphPicture === "disk") {
    // The disk: the whole plane.
    const [cx, cy] = zoomed(width / 2, height / 2);
    pictureBox = { cx: cx, cy: cy, radius: (Math.min(width, height) / 2 - 4) * view.zoom,
                   width: width, height: height };
    pen.beginPath();
    pen.arc(pictureBox.cx, pictureBox.cy, pictureBox.radius, 0, 2 * Math.PI);
  } else {
    // The half-plane: everything above the line near the bottom, with
    // the start's middle (w = i) a third of the way up.
    const [cx, base] = zoomed(width / 2, height - 12);
    pictureBox = { cx: cx, base: base, unit: (height - 12) / 3 * view.zoom, width: width, height: height };
    pen.beginPath();
    pen.rect(0, 0, width, base);
  }
  pen.fillStyle = OUTSIDE;
  pen.fill();
  pen.strokeStyle = EMPTY;
  pen.stroke();

  // The tiling (or the tree's lines) under the mountain.
  drawUnder(pen);

  // The sites, each colored by its height: on a tiling, the whole cell;
  // on a tree, a coin on its vertex, a bit over half way to the middle
  // of each edge, so the tree's lines show between the coins. Tiny ones
  // are single dots.
  const tree = graphSpec.q === Infinity;
  const highest = Math.max(s.maxHeight, 1);
  pen.lineWidth = 0.5;
  pen.strokeStyle = "rgba(0, 0, 0, 0.25)";
  for (let i = 0; i < s.height.length; i++) {
    const A = siteMotion(i);
    const [mx, my] = motionApply(A, 0, 0);                  // the cell's middle
    if (!onScreen(mx, my)) continue;
    const size = cellPixels(mx, my);
    pen.fillStyle = s.height[i] === 0 ? EMPTY : cssColor(heightColor(s.height[i], highest));
    if (size < 0.7) {
      const [x, y] = toScreen(mx, my);
      pen.fillRect(x - 0.5, y - 0.5, 1, 1);
      continue;
    }
    pen.beginPath();
    if (tree) {
      const [x, y] = toScreen(mx, my);
      pen.arc(x, y, 0.55 * size, 0, 2 * Math.PI);
    } else {
      traceOutline(pen, A, size);
    }
    pen.fill();
    if (size > 4) pen.stroke();
  }
}

// The spread-out picture of a tree: the start in the middle, the cells
// k steps away on the circle of radius k (in rings "gap" pixels apart),
// each cell's children sharing its slice of the circle. Under the sites,
// the tree itself in thin gray lines, out to one ring past the
// mountain, leaving out cells packed closer than about 2 pixels (and
// branches off the screen).
function drawSpread() {
  const s = latest, pen = graphPen(), p = graphSpec.p;
  const width = simCanvas.clientWidth, height = pictureHeight(PICTURE_HEIGHT);
  const [cx, cy] = zoomed(width / 2, height / 2);    // the middle, with the view's zoom and move
  const radius = (Math.min(width, height) / 2 - 8) * view.zoom;
  let deepest = 0;
  for (let i = 0; i < s.height.length; i++) deepest = Math.max(deepest, spreads[2 * i]);
  const gap = radius / (deepest + 1);
  // Whether a dot at (x, y), "r" pixels across, could show.
  const shows = function (x, y, r) { return x + r > 0 && x - r < width && y + r > 0 && y - r < height; };
  // Where depth k and angle a (in turns) are on the screen.
  const at = function (k, a) {
    return [cx + k * gap * Math.cos(2 * Math.PI * a), cy - k * gap * Math.sin(2 * Math.PI * a)];
  };
  // The share of the circle each cell at depth k gets.
  const share = function (k) { return k === 0 ? 1 : 1 / (p * Math.pow(p - 1, k - 1)); };

  // The tree, cell by cell from the start: a line from each cell to
  // each of its children.
  pen.beginPath();
  (function branch(k, low, w) {
    if (k > deepest) return;
    const kids = k === 0 ? p : p - 1;
    // Children packed closer than 2 pixels on their circle: left out.
    if ((k + 1) * gap * 2 * Math.PI * (w / kids) < 2) return;
    // A thin slice wholly off the screen: left out. (Its branches stay
    // between rings k and deepest + 1, and between its two sides, so
    // inside the box around its four corners, made a little bigger for
    // the bulge of the outer circle.)
    if (w < 1 / 8) {
      const corners = [at(k, low), at(k, low + w), at(deepest + 1, low), at(deepest + 1, low + w)];
      const xs = corners.map(function (c) { return c[0]; }), ys = corners.map(function (c) { return c[1]; });
      const bulge = (deepest + 1) * gap * (1 - Math.cos(Math.PI * w));
      if (Math.max(...xs) + bulge < 0 || Math.min(...xs) - bulge > width ||
          Math.max(...ys) + bulge < 0 || Math.min(...ys) - bulge > height) return;
    }
    const [x0, y0] = at(k, low + w / 2);
    for (let j = 0; j < kids; j++) {
      const childLow = low + j * w / kids;
      pen.moveTo(x0, y0);
      pen.lineTo(...at(k + 1, childLow + w / kids / 2));
      branch(k + 1, childLow, w / kids);
    }
  })(0, 0, 1);
  pen.lineWidth = 0.6;
  pen.strokeStyle = UNDER_COLOR;
  pen.stroke();

  // The sites: dots, as big as there is room for on their circle.
  const highest = Math.max(s.maxHeight, 1);
  for (let i = 0; i < s.height.length; i++) {
    const k = spreads[2 * i], [x, y] = at(k, spreads[2 * i + 1]);
    const room = k === 0 ? gap : k * gap * 2 * Math.PI * share(k);   // the arc each cell at depth k gets
    const dot = Math.max(1.2, Math.min(0.35 * gap, 0.45 * room));
    if (!shows(x, y, dot)) continue;
    pen.fillStyle = s.height[i] === 0 ? EMPTY : cssColor(heightColor(s.height[i], highest));
    pen.beginPath();
    pen.arc(x, y, dot, 0, 2 * Math.PI);
    pen.fill();
  }
}

/* The whole tiling (or tree) under the mountain, in thin gray lines:
   every cell big enough to see, around wherever the view is, whether or
   not the mountain has reached it. A tiling is drawn as the outlines of
   its cells; a tree as its edges (traceSpokes).
   The page builds its own copy of the graph for this, the same way the
   mountain's thread does (js/sim-graphs.js), from the rules that thread
   learned and sent with its first message, so the page never has to
   learn them again. It numbers cells in its own order; it only says
   where cells are, not which ones are sites. */
const UNDER_COLOR = "#b4b1aa";     // the gray of the lines
const UNDER_COLOR_3D = "#8a877f";   // the same lines on the 3D floor, a little darker (they are only 1 pixel wide there)
const SMALLEST_UNDER = 1.2;        // cells smaller than this (inradius, in pixels) aren't drawn
const MOST_UNDER = 40000;          // and at most this many cells are

let underGraph = null, underFor = null;
function graphUnder() {
  const name = graphSpec.p + "," + graphSpec.q;
  if (!learnedRules.kept || !learnedRules.kept.has(name)) return null;   // the rules haven't come yet
  if (underFor !== graphSpec) { underFor = graphSpec; underGraph = makeGraph(graphSpec); }
  return underGraph;
}

// The rules the mountain's thread sends with its first message.
function keepRules(rules) {
  if (!learnedRules.kept) learnedRules.kept = new Map();
  learnedRules.kept.set(rules.name, rules.kinds);
}

// A breadth-first search from the cell nearest the middle of the
// screen, going out until cells are too small to see, or off the
// screen. (Where cells are big enough to see, and the screen, are both
// in one piece, so every cell big enough that shows is reached.) For the
// 3D floor, "place" and "pixels" (toScreen and cellPixels if left out)
// say where a point of the disk goes and how big a cell there looks;
// there, the search starts from the middle of the disk, and goes out
// until cells are too small.
function drawUnder(pen, place, pixels) {
  const graph = graphUnder();
  if (!graph) return;
  const tree = graphSpec.q === Infinity;
  // (The middle of the screen, kept 12 pixels in from the edge of the
  // disk or above the line, where cells are big enough to see.)
  const middle = place ? [0, 0] : diskPointAt(pictureBox.width / 2, pictureBox.height / 2, 12);
  const first = cellNearest(graph, middle);
  const seen = new Set([first]), queue = [first];
  pen.beginPath();
  for (let n = 0; n < queue.length && n < MOST_UNDER; n++) {
    const A = motionTimes(diskMotion, graph.place(queue[n]));
    const [mx, my] = motionApply(A, 0, 0);
    const size = (pixels || cellPixels)(mx, my);
    // (The first cell always goes on to its neighbors, even if too small
    // or just off the screen.)
    if (n > 0 && (size < SMALLEST_UNDER || (!place && !onScreen(mx, my)))) continue;
    if (tree) traceSpokes(pen, A, place);
    else { pen.moveTo(...(place || toScreen)(mx, my)); traceOutline(pen, A, size, place); }
    for (const w of graph.neighbors(queue[n])) {
      if (!seen.has(w)) { seen.add(w); queue.push(w); }
    }
  }
  pen.lineWidth = 0.6;
  pen.strokeStyle = UNDER_COLOR;
  pen.stroke();
}

// The cell nearest the point c of the disk: start at the first cell
// and keep stepping to whichever neighbor is nearer c, until none is.
// (cosh of the hyperbolic distance from z to c is
// 1 + 2 |z - c|^2 / ((1 - |z|^2) (1 - |c|^2)) (Beardon, Chapter 7), so
// the cell whose middle z has the smallest |z - c|^2 / (1 - |z|^2) is
// the nearest. For c = 0 that is coshFromStart of the cell's motion
// moved by the view, which stays exact even far out.)
function cellNearest(graph, c) {
  const away = function (v) {
    const A = motionTimes(diskMotion, graph.place(v));
    if (c[0] === 0 && c[1] === 0) return coshFromStart(A);
    const [x, y] = motionApply(A, 0, 0);
    return ((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1])) / Math.max(1 - x * x - y * y, 1e-15);
  };
  let v = 0, best = away(0);
  for (;;) {
    let next = -1;
    for (const w of graph.neighbors(v)) {
      const d = away(w);
      if (d < best) { best = d; next = w; }
    }
    if (next === -1) return v;
    v = next;
  }
}

// The 3D view on a graph: the disk is the floor, with the tiling (or
// the tree) drawn on it in thin lines, and each site's stack of coins
// stands on its cell, as wide as the cell (on a tree, a bit over half
// as wide, so the tree's lines show between the stacks). Every coin is
// equally thick, so a stack's height shows its count however small its
// cell. Cells too small to see are left out.
function draw3DOnDisk() {
  const s = latest, cellShape = currentShape();
  const unit = 1 / (2 * cellShape.middle);    // so the first cell, in the middle, is 1 wide
  const thinner = graphSpec.q === Infinity ? 0.6 : 1;
  const x = [], y = [], height = [], width = [];
  for (let i = 0; i < s.height.length; i++) {
    const [mx, my] = motionApply(siteMotion(i), 0, 0);
    const w = 1 - mx * mx - my * my;           // how much smaller than the first cell it looks
    if (w < 0.004) continue;
    x.push(mx * unit); y.push(my * unit); height.push(s.height[i]); width.push(thinner * w);
  }
  sim3d.drawStacks(view3d, {
    x: x, y: y, height: height, width: width, floor: { disk: unit },
    shape: "coins", stretch: Math.pow(2, stretchLevel / 2),
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
  const key = graphSpec.p + "," + graphSpec.q + " " + diskMotion.join(",") + " " + Boolean(graphUnder());
  if (key === floorLinesFor) return floorLinesKept;
  const lines = [];
  let first = null, last = null;
  const notes = {
    beginPath: function () {}, stroke: function () {},
    moveTo: function (x, y) { first = last = [x, y]; },
    lineTo: function (x, y) { lines.push(last[0], last[1], x, y); last = [x, y]; },
    closePath: function () { lines.push(last[0], last[1], first[0], first[1]); last = first; },
  };
  const middle = currentShape().middle;
  drawUnder(notes, function (x, y) { return [x * unit, y * unit]; },
            function (x, y) { return PICTURE_HEIGHT / 2 * middle * (1 - x * x - y * y); });   // about its size on the screen
  floorLinesFor = key;
  floorLinesKept = lines;
  return lines;
}

// Dragging the plane (the disk or the half-plane; section 6b passes the
// pointer events on). While exactly one pointer is pressed, "dragFrom"
// is the point of the disk it last was on, and each move carries that
// point to the new one. (With two fingers, the picture slides and zooms
// instead, as in the grid.)
let dragFrom = null;
function startPlaneDrag() {
  const pressed = Array.from(view.pointers.values());
  const dragsPlane = dim === "graph" && graphPicture !== "spread" && pictureBox !== null;
  dragFrom = (dragsPlane && pressed.length === 1) ? diskPoint(pressed[0].x, pressed[0].y) : null;
}
function dragPlane(clientX, clientY) {
  const to = diskPoint(clientX, clientY);
  const M = motionTimes(moveBetween(dragFrom, to), diskMotion);
  const norm = Math.sqrt(M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3]);   // keep |a|^2 - |b|^2 = 1
  const moved = M.map(function (t) { return t / norm; });
  // The view goes at most distance 20 from the start: farther out the
  // picture's numbers get too rough to place cells well.
  if (coshFromStart(moved) < Math.cosh(20)) diskMotion = moved;
  dragFrom = to;
  drawSoon();
}

// The point of the disk under the pointer at (clientX, clientY), kept
// at least 7 pixels in from the edge of the disk (or above the line),
// where a tiny drag would move very far.
function diskPoint(clientX, clientY) {
  const box = simCanvas.getBoundingClientRect();
  return diskPointAt(clientX - box.left, clientY - box.top, 7);
}

// The point of the disk at (px, py) on the canvas, kept at least "edge"
// pixels in from the edge of the disk (or above the line). In the
// half-plane, it is the point of the disk that goes there:
// z = (w - i) / (w + i).
function diskPointAt(px, py, edge) {
  const b = pictureBox;
  if (graphPicture === "disk") {
    const x = (px - b.cx) / b.radius, y = -(py - b.cy) / b.radius;
    const r = Math.hypot(x, y), most = 1 - edge / b.radius;
    return r > most ? [x * most / r, y * most / r] : [x, y];
  }
  const re = (px - b.cx) / b.unit;
  const im = Math.max((b.base - py) / b.unit, edge / b.unit);
  // (re + i (im - 1)) / (re + i (im + 1)), worked out:
  const D = re * re + (im + 1) * (im + 1);
  return [(re * re + im * im - 1) / D, -2 * re / D];
}

// The motion carrying the point "from" to the point "to" (and turning
// nothing): move "from" to 0, then 0 to "to". (The motion moving c to 0
// is a = 1/s, b = -c/s, with s = sqrt(1 - |c|^2).)
function moveBetween(from, to) {
  const s0 = Math.sqrt(1 - from[0] * from[0] - from[1] * from[1]);
  const s1 = Math.sqrt(1 - to[0] * to[0] - to[1] * to[1]);
  return motionTimes([1 / s1, 0, to[0] / s1, to[1] / s1], [1 / s0, 0, -from[0] / s0, -from[1] / s0]);
}
byId("disk-reset").addEventListener("click", function () { diskMotion = [1, 0, 0, 0]; drawSoon(); });

// The "Drawn in" option: the disk, the half-plane, or (trees) spread out.
for (const radio of document.querySelectorAll('input[name="picture"]')) {
  radio.addEventListener("change", function () {
    graphPicture = radio.value;
    resetView(view);      // a new picture starts unzoomed
    showPictureKind();
  });
}

// The graph options: the presets, p and q, or a tree's degree.
function showGraphOptions() {
  const row = byId("graph-presets");
  row.innerHTML = "";
  for (const preset of GRAPH_PRESETS) {
    const button = document.createElement("button");
    button.className = "tool-button";
    button.textContent = preset.name;
    button.addEventListener("click", function () {
      const g = preset.graph;
      document.querySelector('input[name="graph-kind"][value="' + (g.q === Infinity ? "tree" : "tiling") + '"]').checked = true;
      if (g.q === Infinity) byId("set-degree").value = g.p;
      else { byId("set-p").value = g.p; byId("set-q").value = g.q; }
      useGraph();
    });
    row.appendChild(button);
  }
}

// Read the graph from the options into graphSpec, and say what it is.
// Returns false (and leaves graphSpec alone) if it isn't hyperbolic.
function readGraph() {
  const info = byId("graph-info");
  let next;
  if (checked("graph-kind") === "tree") {
    const d = readWhole("set-degree", 3, 12, 3);
    next = { kind: "tiling", p: d, q: Infinity };
    info.textContent = "The tree where every cell has " + d + " neighbors, drawn as ideal " + d +
      "-gons (their corners are on the edge of the disk, infinitely far away).";
  } else {
    const p = readWhole("set-p", 3, 12, 7), q = readWhole("set-q", 3, 12, 3);
    if (1 / p + 1 / q >= 1 / 2) {
      info.textContent = "{" + p + ", " + q + "} isn't hyperbolic: that needs 1/p + 1/q < 1/2. " +
        (1 / p + 1 / q === 1 / 2 ? "It tiles the flat plane." : "It tiles a sphere.");
      return false;
    }
    next = { kind: "tiling", p: p, q: q };
    info.textContent = "Every cell is a regular " + p + "-gon, " + q + " of them meet at every corner, " +
      "and each cell has " + p + " neighbors.";
  }
  if (next.p !== graphSpec.p || next.q !== graphSpec.q) graphSpec = next;
  // "Spread out" is for trees only.
  const tree = (next.q === Infinity);
  byId("spread-choice").hidden = !tree;
  if (!tree && graphPicture === "spread") {
    graphPicture = "disk";
    document.querySelector('input[name="picture"][value="disk"]').checked = true;
    showPictureKind();
  }
  return true;
}

// A new graph from the options: start again on it, with the first cell
// in the middle of the picture.
function useGraph() {
  if (!readGraph()) return;
  diskMotion = [1, 0, 0, 0];
  resetView(view);
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
  const s = latest;
  if (!s || !s.height || s.dim !== dim) return;
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
  byId("custom-area").hidden = false;
  showPictureKind();
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  checkTool();
}

function closeTool() {
  toolOpen = false;
  byId("custom-area").hidden = true;
  showPictureKind();
}

// The tool sends its drawing every time it changes (js/sim-page.js).
listenToTool(frame, function (drawing) { toolMessage = drawing; checkTool(); });

// Check the drawing live and say what's wrong, if anything.
function checkTool() {
  if (!toolOpen) return;
  let problem = "", good = "";
  if (!toolMessage) problem = "Loading the drawing tool...";
  else if (toolMessage.graph.vertices.length === 0) problem = "Paint the domain first.";
  else good = toolMessage.graph.vertices.length + " cells.";
  showToolStatus(problem, good);
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
showStretch();
showGraphOptions();
setDimension(1);
setPlaying(false);   // paused: press Play
