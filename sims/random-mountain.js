/* =====================================================================
   random-mountain.js  —  the page of the "Random mountain" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the tile T from the formula box (the preset buttons just
       fill in a formula), and the domain from the Domain options (a
       custom domain is drawn in the graph tool, shown inside this page).
     - Hands them to the growth rule (random-mountain-growth.js), which
       runs in a second thread (a "Web Worker"), and draws every
       mountain it sends back, with the statistics.
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js, and the formula reader (readTree) in
   js/sim-formulas.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The tile: presets and the formula box
     4. The domain
     5. Running the mountain
     6. Drawing the mountain
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The tile presets. Each one is just a formula for the formula box: the
// tile is every offset x (or (x, y)) that makes the formula true, except
// 0. The first one of each list is the default.
const PRESETS = {
  1: [
    { name: "{−1, +1}", formula: "abs(x) = 1" },          // two-sided (randmountain.py)
    { name: "{+1}", formula: "x = 1" },                    // one-sided (randonesidedmountain.py)
    { name: "{−2, +1}", formula: "x = -2 or x = 1" },
    { name: "{±1, ±2}", formula: "abs(x) <= 2" },
  ],
  2: [
    { name: "4 neighbors", formula: "abs(x) + abs(y) = 1" },
    { name: "8 neighbors", formula: "max(abs(x), abs(y)) = 1" },
    { name: "Diagonals", formula: "abs(x) = 1 and abs(y) = 1" },
    { name: "Disk, radius 2", formula: "x^2 + y^2 <= 4" },
  ],
};

// The formula is tried on offsets up to this far from 0.
const TILE_REACH = { 1: 50, 2: 20 };

// The domains for each dimension, and the default size of a bounded one.
const DOMAINS = {
  1: [["whole", "Whole line"], ["box", "Segment"], ["torus", "Cycle"]],
  2: [["whole", "Whole plane"], ["box", "Box"], ["torus", "Torus"], ["custom", "Custom (draw it)"]],
};
const DEFAULT_SIZE = { 1: 101, 2: 41 };
const MAX_SIZE = { 1: 2001, 2: 301 };

const DEFAULT_SEED = "1";
const PICTURE_HEIGHT_1D = 320;    // in screen pixels
const MAX_PICTURE_HEIGHT = 600;   // 2D, in screen pixels
const EMPTY = "#c9c6bf";          // available sites with no block yet
const OUTSIDE = "#ffffff";        // everything else

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
   3. THE TILE: PRESETS AND THE FORMULA BOX
   ---------------------------------------------------------------------
   The formula is a condition in x (1D) or x and y (2D), read by
   math.js the same way as in the graph tool: "=" means "equals", and
   "and", "or", "not", abs, max, ... all work. Every offset within
   TILE_REACH of 0 that makes it true is in the tile, except 0 itself.
   It works live, like Desmos: each keystroke that gives a readable
   formula changes the tile at once.
   ===================================================================== */

// Show the preset buttons for this dimension.
function showPresets() {
  const row = byId("tile-presets");
  row.innerHTML = "";
  for (const preset of PRESETS[dim]) {
    const button = document.createElement("button");
    button.className = "tool-button";
    button.textContent = preset.name;
    button.addEventListener("click", function () {
      byId("tile-formula").value = preset.formula;
      readTile();
    });
    row.appendChild(button);
  }
  const reach = TILE_REACH[dim];
  byId("tile-help").textContent = dim === 1
    ? "Or type a condition in x. T is every whole number x ≠ 0 with |x| ≤ " + reach + " that makes it true."
    : "Or type a condition in x and y. T is every (x, y) ≠ (0, 0) with |x|, |y| ≤ " + reach + " that makes it true.";
}

// Read the formula box. If the formula is readable, use it as the tile
// and restart (same seed, same step); if not, say why and keep the old tile.
function readTile() {
  const text = byId("tile-formula").value.trim();
  const letters = dim === 1 ? ["x"] : ["x", "y"];
  let tree, offsets = [];
  try {
    if (text === "") throw new Error("Type a condition, like " + PRESETS[dim][0].formula);
    tree = readTree(text);
    const unknown = tree.filter(function (node, path, parent) {
      return node.isSymbolNode && !isFunctionName(path, parent) &&
             !letters.includes(node.name) && math[node.name] === undefined;
    });
    if (unknown.length > 0) {
      throw new Error("Only " + letters.join(" and ") + " can be used here, not " + unknown[0].name + ".");
    }
    const formula = tree.compile();
    const reach = TILE_REACH[dim];
    for (let x = -reach; x <= reach; x++) {
      for (let y = (dim === 2 ? -reach : 0); y <= (dim === 2 ? reach : 0); y++) {
        if (x === 0 && y === 0) continue;
        const answer = formula.evaluate({ x: x, y: y });
        if (typeof answer !== "boolean") throw new Error("The formula should be true or false, like " + PRESETS[dim][0].formula);
        if (answer) offsets.push(dim === 1 ? [x] : [x, y]);
      }
    }
  } catch (problem) {
    // Usually just a half-typed formula; keep the last good tile.
    byId("tile-info").textContent = "Can't use that yet: " + problem.message;
    return;
  }

  katex.render("T = \\{\\, " + (dim === 1 ? "x" : "(x, y)") + " : " +
               tree.toTex({ parenthesis: "keep", implicit: "hide" }) + " \\,\\}",
               byId("tile-preview"), { throwOnError: false });
  tile = offsets;
  byId("tile-info").textContent = describeTile();
  restart(true);
}

// "4 offsets: (1, 0), (0, 1), ..." (the first few).
function describeTile() {
  if (tile.length === 0) return "T is empty: every block lands on the start site.";
  const shown = tile.slice(0, 12).map(function (t) { return dim === 1 ? String(t[0]) : "(" + t[0] + ", " + t[1] + ")"; });
  return tile.length + (tile.length === 1 ? " offset: " : " offsets: ") + shown.join(", ") +
         (tile.length > 12 ? ", ..." : "");
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

// "#rrggbb" -> [red, green, blue].
function hexToRGB(hex) {
  return [1, 3, 5].map(function (k) { return parseInt(hex.slice(k, k + 2), 16); });
}

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
  const width = simCanvas.clientWidth, height = PICTURE_HEIGHT_1D;
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

// 2D: seen from above.
function drawGrid() {
  const s = latest, range = pictureRange();
  const across = range.xmax - range.xmin + 1, down = range.ymax - range.ymin + 1;
  const cssWidth = simCanvas.clientWidth;
  const size = Math.min(cssWidth / across, MAX_PICTURE_HEIGHT / down);   // a cell, in screen pixels
  const width = size * across, height = size * down;
  const ratio = window.devicePixelRatio || 1;

  // 1. One pixel per cell. Row 0 of the image is the top of the
  //    picture, which is the largest y (y goes up the screen).
  tiny.width = across;
  tiny.height = down;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(across, down);
  const pixels = image.data;   // 4 numbers per pixel: red, green, blue, opacity
  const outside = hexToRGB(OUTSIDE), empty = hexToRGB(EMPTY);
  for (let p = 0; p < across * down; p++) {
    pixels[4 * p] = outside[0]; pixels[4 * p + 1] = outside[1]; pixels[4 * p + 2] = outside[2];
    pixels[4 * p + 3] = 255;
  }
  const highest = Math.max(s.maxHeight, 1);
  for (let i = 0; i < s.x.length; i++) {
    const p = (range.ymax - s.y[i]) * across + (s.x[i] - range.xmin);
    const rgb = s.height[i] === 0 ? empty : heatColor(s.height[i] / highest);
    pixels[4 * p] = rgb[0]; pixels[4 * p + 1] = rgb[1]; pixels[4 * p + 2] = rgb[2];
  }
  tinyPen.putImageData(image, 0, 0);

  // 2. Blow it up onto the page, in the middle, with smoothing off so
  //    the cells stay sharp squares; a thin frame around it.
  simCanvas.style.height = Math.ceil(height) + "px";
  simCanvas.width = Math.round(cssWidth * ratio);
  simCanvas.height = Math.round(Math.ceil(height) * ratio);
  const pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.imageSmoothingEnabled = false;
  const left = (cssWidth - width) / 2;
  pen.drawImage(tiny, left, 0, width, height);
  pen.strokeStyle = EMPTY;
  pen.strokeRect(left + 0.5, 0.5, width - 1, height - 1);
}


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
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  checkTool();
}

function closeTool() {
  toolOpen = false;
  byId("custom-area").hidden = true;
  simCanvas.hidden = false;
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
  byId("tile-formula").value = PRESETS[dim][0].formula;
  readTile();
}
for (const radio of document.querySelectorAll('input[name="dimension"]')) {
  radio.addEventListener("change", function () { setDimension(Number(radio.value)); });
}

// The formula box, live while typing.
byId("tile-formula").addEventListener("input", readTile);

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
