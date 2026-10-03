/* =====================================================================
   random-matrix-products-page.js  —  the "Random matrix products" page
   ---------------------------------------------------------------------
   The math lives in random-matrix-products.js (reading the matrices,
   the runs, the statistics), the same file
   random-matrix-products-check.html tests. This file does everything
   else:
     1. Settings
     2. The state of the page
     3. The matrix boxes and their sliders
     4. The runs: stepping, replaying, Play
     5. The picture: cloud, one run, histogram; dragging and zooming
     6. Statistics
     7. Connecting the buttons
   It uses the shared helpers in js/sim-page.js (byId, showMessage,
   chartPen, ...) and the formula reading and sliders in js/formulas.js.

   Everything runs right here, in the page's own thread. A step of 2000
   runs takes well under a thousandth of a second for fixed matrices,
   so the cloud follows a slider live; Play works in small batches
   between screen refreshes, so the page never freezes.

   How a slider stays live (the Desmos feel): when anything about the
   matrices changes, every run goes back to t = 0 and is stepped again,
   up to the same t, with the same random numbers. So the cloud you see
   is always "these matrices, after t steps", and it bends smoothly.
   ===================================================================== */


/* =====================================================================
   1. SETTINGS
   ===================================================================== */

// Play speeds, in steps per second. The toy starts paused, at 2.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100];
const START_SPEED = 1;
const START_RUNS = 2000;
const START_TMAX = 100;
const MOST_PIXELS_TALL = 520;      // the picture is square, up to this tall

// The dots' colors, red and blue as in randmatprod.py. Placeholders,
// like all colors on the site.
const COLOR_RED = "#c62828";
const COLOR_BLUE = "#1f5fbf";


/* =====================================================================
   2. THE STATE OF THE PAGE
   ===================================================================== */
const simCanvas = byId("sim-canvas");

let matrices = [];        // what's typed: [{ entries: [4 texts], weight: text }]
let sliders = {};         // letter -> { value, min, max, step }
let model = null;         // the matrices read with the sliders' values (readModel)
let meanMatrix = null;    // E[X], from averageMatrix
let rho = 1;              // the spectral radius of E[X]

let runs = START_RUNS;
let seed = "1";
let tMax = START_TMAX;
let cloud = null;         // the N runs (newCloud)
let wantedT = 0;          // the t the picture should show

// The run shown in the "One run" view, and its whole history: one
// copy of its product (e^logSize * Q) for every t = 0, 1, ..., t.
let shownRun = 1;
let history = [];

let viewKind = "cloud";   // "cloud", "histogram" or "trajectory"
let playing = false;
let speedIndex = START_SPEED;


/* =====================================================================
   3. THE MATRIX BOXES AND THEIR SLIDERS
   ---------------------------------------------------------------------
   One row per matrix:
       M1  [ 0.9 ][ 0.8 ]   weight       ×
           [ 0.1 ][ 0.2 ]   [    ]
                            chance 0.5
   Typing in any box re-reads everything (readMatrices). Every letter
   other than u1..u4 gets a slider (makeSlider, js/formulas.js); moving
   one re-reads the numbers only (useMatrices).
   ===================================================================== */

function buildMatrixRows() {
  const list = byId("matrix-list");
  list.innerHTML = "";
  matrices.forEach(function (m, i) {
    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML =
      '<span class="matrix-name"></span>' +
      '<span class="matrix-entries"></span>' +
      '<span class="matrix-weight">weight <input type="text" placeholder="1" spellcheck="false">' +
        '<span class="muted small matrix-chance"></span></span>' +
      '<button class="tool-button" title="Remove this matrix">&times;</button>';
    row.querySelector(".matrix-name").textContent = "M" + (i + 1);

    // The four entry boxes, in reading order: top left, top right,
    // bottom left, bottom right.
    const entries = row.querySelector(".matrix-entries");
    m.entries.forEach(function (text, k) {
      const box = document.createElement("input");
      box.type = "text";
      box.spellcheck = false;
      box.value = text;
      box.addEventListener("input", function () {
        m.entries[k] = box.value;
        typedByHand();
      });
      entries.appendChild(box);
    });

    const weight = row.querySelector(".matrix-weight input");
    weight.value = m.weight;
    weight.addEventListener("input", function () {
      m.weight = weight.value;
      typedByHand();
    });

    const remove = row.querySelector("button");
    remove.disabled = matrices.length === 1;     // keep at least one
    remove.addEventListener("click", function () {
      matrices.splice(i, 1);
      buildMatrixRows();
      typedByHand();
    });
    list.appendChild(row);
  });
}

// Something was typed: the preset menu now says "Your own".
function typedByHand() {
  byId("preset").value = "custom";
  readMatrices();
}

// Find the letters, make their sliders, then use the numbers.
function readMatrices() {
  let letters;
  try {
    letters = matrixLetters(matrices);
  } catch (problem) {
    // Usually just a half-typed formula: keep the last good picture.
    byId("matrix-message").textContent = "Can't read that yet: " + problem.message;
    return;
  }
  const holder = byId("sliders");
  holder.innerHTML = "";
  for (const letter of letters) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], useMatrices));
  }
  useMatrices();
}

// Read the matrices with the sliders' current values, then replay.
function useMatrices() {
  const values = {};
  for (const letter in sliders) values[letter] = sliders[letter].value;
  try {
    model = readModel(matrices, values);
  } catch (problem) {
    byId("matrix-message").textContent = problem.message;
    return;
  }
  byId("matrix-message").textContent = "";
  meanMatrix = averageMatrix(model);
  rho = spectralRadius(meanMatrix);

  // Each matrix's chance, next to its weight box.
  document.querySelectorAll(".matrix-chance").forEach(function (span, i) {
    span.textContent = "chance " + niceNumber(model.chances[i]);
  });
  replaySoon();
}

function usePreset(key) {
  // A copy, so typing never changes the preset itself.
  matrices = PRESETS[key].matrices.map(function (m) {
    return { entries: m.entries.slice(), weight: m.weight };
  });
  sliders = {};
  buildMatrixRows();
  readMatrices();
}


/* =====================================================================
   4. THE RUNS: STEPPING, REPLAYING, PLAY
   ===================================================================== */

// One step for every run, and remember the shown run's product.
function stepOnce() {
  cloud.step();
  remember();
}

function remember() {
  const n = shownRun - 1;
  history.push({ q: [cloud.q0[n], cloud.q1[n], cloud.q2[n], cloud.q3[n]], logSize: cloud.logSize[n], t: cloud.t });
}

// Go back to t = 0 (a new cloud if N or the seed changed) and step
// again up to wantedT, with the same random numbers.
function replay() {
  if (!model) return;
  if (!cloud || cloud.runs !== runs || cloud.seed !== seed) {
    cloud = newCloud(model, runs, seed);
    cloud.seed = seed;
  } else {
    cloud.setModel(model);
  }
  shownRun = Math.min(shownRun, runs);
  history = [];
  remember();
  while (cloud.t < wantedT) stepOnce();
  draw();
  showStats();
}

// A slider fires many times a second; replay at most once per screen
// refresh, with whatever the latest numbers are.
let replayPending = false;
function replaySoon() {
  if (replayPending) return;
  replayPending = true;
  requestAnimationFrame(function () {
    replayPending = false;
    replay();
  });
}

let lastFrame = 0, owed = 0, lastStats = 0;
function playFrame(time) {
  if (!playing) return;
  let stepped = false;
  if (lastFrame > 0) {
    owed += SPEEDS[speedIndex] * Math.min(0.1, (time - lastFrame) / 1000);
    const started = performance.now();
    while (owed >= 1 && cloud.t < tMax && performance.now() - started < 12) {
      stepOnce();
      owed--;
      stepped = true;
    }
    owed = Math.min(owed, SPEEDS[speedIndex]);     // don't pile up work if the computer is slow
  }
  lastFrame = time;
  wantedT = cloud.t;
  if (stepped) {
    draw();
    if (time - lastStats > 250) { lastStats = time; showStats(); }
  }
  if (cloud.t >= tMax) { setPlaying(false); showStats(); return; }
  requestAnimationFrame(playFrame);
}

function setPlaying(on) {
  playing = on && model !== null && cloud !== null;
  byId("play").textContent = playing ? "Pause" : "Play";
  lastFrame = 0; owed = 0;
  if (playing) requestAnimationFrame(playFrame);
}

function showSpeed() {
  byId("speed").value = speedIndex;
  byId("speed-label").textContent = SPEEDS[speedIndex] + " steps/s";
}


/* =====================================================================
   5. THE PICTURE
   ---------------------------------------------------------------------
   Like Desmos: a white background, light gray grid lines, black axes
   with numbers. The cloud and the one-run views are the plane, with the
   same scale on both axes; the histogram has its own x range.

   "Following": the picture fits itself to the dots after every step,
   until you drag or zoom; the Fit button turns following back on.
   ===================================================================== */
let pen = null, width = 0, height = 0;

// The plane's view: its center, and how many units one pixel is.
let plane = { cx: 0.5, cy: 0.5, perPixel: 0.01 };
// The histogram's view: the x range shown.
let line = { xmin: 0, xmax: 1 };
let following = { cloud: true, trajectory: true, histogram: true };

function sizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  width = simCanvas.clientWidth;
  height = Math.min(width, MOST_PIXELS_TALL);
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);    // draw in screen pixels from here on
}

// Where a point of the plane is on the screen, and back.
function px(x) { return width / 2 + (x - plane.cx) / plane.perPixel; }
function py(y) { return height / 2 - (y - plane.cy) / plane.perPixel; }
function planeX(sx) { return plane.cx + (sx - width / 2) * plane.perPixel; }
function planeY(sy) { return plane.cy - (sy - height / 2) * plane.perPixel; }

// The dots to draw for the cloud: { red: [[x, y], ...], blue: [...] },
// plus how many could not be drawn (too big or too small for the
// computer at this scale).
function cloudDots() {
  const scale = byId("scale").value;
  const dots = { red: [], blue: [], lost: 0 };
  for (let n = 0; n < cloud.runs; n++) {
    for (const [name, x0, y0, box] of [["red", 1, 0, "show-red"], ["blue", 0, 1, "show-blue"]]) {
      if (!byId(box).checked) continue;
      const p = pointOf(cloud, n, x0, y0, scale, rho);
      if (isFinite(p[0]) && isFinite(p[1])) dots[name].push(p);
      else dots.lost++;
    }
  }
  return dots;
}

// The shown run's dots v_0, v_1, ..., v_t, in the same form.
function trajectoryDots() {
  const scale = byId("scale").value;
  const dots = { red: [], blue: [], lost: 0 };
  for (const h of history) {
    // pointOf reads a cloud; a tiny "cloud" of one run does the job.
    const one = { q0: [h.q[0]], q1: [h.q[1]], q2: [h.q[2]], q3: [h.q[3]], logSize: [h.logSize], t: h.t };
    for (const [name, x0, y0, box] of [["red", 1, 0, "show-red"], ["blue", 0, 1, "show-blue"]]) {
      if (!byId(box).checked) continue;
      const p = pointOf(one, 0, x0, y0, scale, rho);
      if (isFinite(p[0]) && isFinite(p[1])) dots[name].push(p);
      else dots.lost++;
    }
  }
  return dots;
}

// The numbers the histogram counts: the red dots' x (or y).
function histogramValues() {
  const k = byId("hist-coordinate").value === "x" ? 0 : 1;
  const scale = byId("scale").value;
  const values = [];
  let lost = 0;
  for (let n = 0; n < cloud.runs; n++) {
    const v = pointOf(cloud, n, 1, 0, scale, rho)[k];
    if (isFinite(v)) values.push(v); else lost++;
  }
  return { values: values, lost: lost };
}

function draw() {
  if (!cloud) return;
  if (!pen || simCanvas.clientWidth !== width) sizeCanvas();
  pen.fillStyle = "#ffffff";
  pen.fillRect(0, 0, width, height);
  byId("show-t").textContent = cloud.t;

  let lost = 0;
  if (viewKind === "histogram") {
    const h = histogramValues();
    lost = h.lost;
    if (following.histogram) fitLine(h.values);
    drawHistogram(h.values);
  } else {
    const dots = viewKind === "cloud" ? cloudDots() : trajectoryDots();
    lost = dots.lost;
    if (following[viewKind]) fitPlane(dots.red.concat(dots.blue));
    drawPlaneGrid();
    if (viewKind === "trajectory") {
      drawPath(dots.red, COLOR_RED);
      drawPath(dots.blue, COLOR_BLUE);
    }
    // Small dots, a little see-through so dense places look darker. The
    // red dots are a bit bigger, so where a red and a blue dot land on
    // the same spot (they often do: the matrices soon forget where they
    // started), the blue one shows with a red rim.
    pen.globalAlpha = viewKind === "cloud" ? 0.55 : 1;
    const size = viewKind === "cloud" ? 2 : 4;
    for (const [list, color, s] of [[dots.red, COLOR_RED, size + 2], [dots.blue, COLOR_BLUE, size]]) {
      pen.fillStyle = color;
      for (const p of list) pen.fillRect(px(p[0]) - s / 2, py(p[1]) - s / 2, s, s);
    }
    pen.globalAlpha = 1;
  }

  showMessage(lost > 0
    ? lost.toLocaleString() + " dots are too big (or too small) for the computer at this scale, " +
      "so they aren't drawn. Try the scale \"divide by ρ^t\" or \"length 1\"."
    : "");
  showLegend();
}

// Fit the plane to the dots. With many dots, the outer 1% on each side
// is left out, so one far-away dot can't shrink everything else to a
// speck.
function fitPlane(points) {
  if (points.length === 0) return;
  const xs = points.map(function (p) { return p[0]; });
  const ys = points.map(function (p) { return p[1]; });
  const [x0, x1] = middleRange(xs), [y0, y1] = middleRange(ys);
  plane.cx = (x0 + x1) / 2;
  plane.cy = (y0 + y1) / 2;
  plane.perPixel = 1.15 * Math.max((x1 - x0) / width, (y1 - y0) / height);
  if (!(plane.perPixel > 0)) plane.perPixel = 2 / width;   // everything at one point
}

function fitLine(values) {
  if (values.length === 0) { line = { xmin: 0, xmax: 1 }; return; }
  let [lo, hi] = middleRange(values);
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const pad = 0.04 * (hi - lo);
  line = { xmin: lo - pad, xmax: hi + pad };
}

// The smallest and largest value, leaving out the outer 1% on each side
// when there are more than 200 values.
function middleRange(values) {
  const sorted = Float64Array.from(values).sort();
  const cut = sorted.length > 200 ? Math.floor(0.01 * sorted.length) : 0;
  return [sorted[cut], sorted[sorted.length - 1 - cut]];
}

// Grid lines at "nice" steps, black axes, and numbers along the axes.
function drawPlaneGrid() {
  const step = niceStep(plane.perPixel * 90);          // about every 90 pixels
  const left = planeX(0), right = planeX(width), bottom = planeY(height), top = planeY(0);
  pen.lineWidth = 1;
  pen.strokeStyle = "#e6e6e6";
  pen.beginPath();
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    pen.moveTo(Math.round(px(x)) + 0.5, 0); pen.lineTo(Math.round(px(x)) + 0.5, height);
  }
  for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
    pen.moveTo(0, Math.round(py(y)) + 0.5); pen.lineTo(width, Math.round(py(y)) + 0.5);
  }
  pen.stroke();

  pen.strokeStyle = "#000000";
  pen.beginPath();
  pen.moveTo(0, Math.round(py(0)) + 0.5); pen.lineTo(width, Math.round(py(0)) + 0.5);
  pen.moveTo(Math.round(px(0)) + 0.5, 0); pen.lineTo(Math.round(px(0)) + 0.5, height);
  pen.stroke();

  // Numbers next to the axes; if an axis is off the picture, at the edge.
  pen.fillStyle = "#555555";
  pen.font = "11px sans-serif";
  const xAxisAt = Math.max(12, Math.min(height - 4, py(0) + 13));
  const yAxisAt = Math.max(2, Math.min(width - 40, px(0) + 4));
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    if (Math.abs(x) < step / 2) continue;
    const label = shortLabel(x);
    pen.fillText(label, px(x) - pen.measureText(label).width / 2, xAxisAt);
  }
  for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
    if (Math.abs(y) < step / 2 || py(y) < 14) continue;     // no number cut off at the top
    pen.fillText(shortLabel(y), yAxisAt, py(y) - 3);
  }
}

// The one-run view joins its dots in order, with a thin line.
function drawPath(points, color) {
  if (points.length < 2) return;
  pen.strokeStyle = color;
  pen.globalAlpha = 0.35;
  pen.lineWidth = 1;
  pen.beginPath();
  points.forEach(function (p, i) {
    if (i === 0) pen.moveTo(px(p[0]), py(p[1])); else pen.lineTo(px(p[0]), py(p[1]));
  });
  pen.stroke();
  pen.globalAlpha = 1;
}

// The histogram of the values inside the x range shown. The bin width
// is the typed one, or 1/200 of the range shown, so zooming in shows
// finer and finer detail (the D13 dust has detail at every size).
function drawHistogram(values) {
  const typed = Number(byId("hist-bin").value);
  const span = line.xmax - line.xmin;
  const binWidth = typed > 0 ? typed : span / 200;
  const bins = Math.max(1, Math.min(4000, Math.ceil(span / binWidth)));
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const i = Math.floor((v - line.xmin) / binWidth);
    if (i >= 0 && i < bins) counts[i]++;
  }
  const biggest = Math.max(1, Math.max.apply(null, counts));

  const bottom = height - 18, top = 16;
  const sx = function (x) { return (x - line.xmin) / span * width; };

  // Light grid lines at nice x steps, with numbers under them.
  const step = niceStep(span / 8);
  pen.strokeStyle = "#e6e6e6";
  pen.lineWidth = 1;
  pen.fillStyle = "#555555";
  pen.font = "11px sans-serif";
  pen.beginPath();
  for (let x = Math.ceil(line.xmin / step) * step; x <= line.xmax; x += step) {
    pen.moveTo(Math.round(sx(x)) + 0.5, top); pen.lineTo(Math.round(sx(x)) + 0.5, bottom);
    const label = shortLabel(x);
    pen.fillText(label, sx(x) - pen.measureText(label).width / 2, height - 4);
  }
  pen.stroke();

  pen.fillStyle = COLOR_RED;
  for (let i = 0; i < bins; i++) {
    if (counts[i] === 0) continue;
    const barHeight = Math.max(1, (bottom - top) * counts[i] / biggest);
    const x0 = sx(line.xmin + i * binWidth), x1 = sx(line.xmin + (i + 1) * binWidth);
    pen.fillRect(x0, bottom - barHeight, Math.max(1, x1 - x0 - (x1 - x0 > 3 ? 1 : 0)), barHeight);
  }

  pen.strokeStyle = "#000000";
  pen.beginPath();
  pen.moveTo(0, bottom + 0.5); pen.lineTo(width, bottom + 0.5);
  pen.stroke();
  pen.fillStyle = "#555555";
  pen.fillText("tallest bar: " + biggest.toLocaleString() + " runs; bin width " + shortLabel(binWidth), 4, 12);
}

// The nicest of 1, 2, 5, 10, 20, 50, ... (times a power of 10) at least "rough".
// (The same as in random-sine.js.)
function niceStep(rough) {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const k of [1, 2, 5, 10]) if (k * power >= rough) return k * power;
  return 10 * power;
}

// A number short enough for an axis: 3, 0.25, 1.5e+6.
function shortLabel(v) {
  if (Math.abs(v) < 1e-12) return "0";
  if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(1);
  return String(Number(v.toPrecision(4)));
}

// 4 significant digits: 1.234, 0.0001234 -> 1.234e-4.
function niceNumber(v) {
  if (v === 0) return "0";
  if (!isFinite(v)) return String(v);
  if (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) return v.toExponential(3);
  return String(Number(v.toPrecision(4)));
}

function showLegend() {
  const scale = byId("scale").value;
  const after = scale === "none" ? "" : scale === "average" ? ", divided by ρ^t" : ", made length 1";
  let text;
  if (viewKind === "cloud") {
    text = "One dot per run, after t steps" + after + ". Red: where (1, 0) goes; blue: where (0, 1) goes.";
  } else if (viewKind === "trajectory") {
    text = "Run " + shownRun + " at t = 0, 1, ..., " + cloud.t + after + ", joined in order. " +
           "Red starts at (1, 0), blue at (0, 1).";
  } else {
    text = "How many red dots have each " + byId("hist-coordinate").value + after +
           ". Zoom in to see finer bins.";
  }
  byId("legend").textContent = text;
}

// Show or hide the options that belong to one view.
function setViewKind(kind) {
  viewKind = kind;
  byId("histogram-options").hidden = kind !== "histogram";
  byId("trajectory-options").hidden = kind !== "trajectory";
  draw();
}

// Dragging moves the picture. "Pointer" events cover the mouse, a pen
// and a finger alike. Dragging or zooming stops the following.
let dragFrom = null;
simCanvas.addEventListener("pointerdown", function (event) {
  dragFrom = { x: event.clientX, y: event.clientY, plane: Object.assign({}, plane), line: Object.assign({}, line) };
  simCanvas.setPointerCapture(event.pointerId);
});
simCanvas.addEventListener("pointermove", function (event) {
  if (!dragFrom) return;
  following[viewKind] = false;
  const dx = event.clientX - dragFrom.x, dy = event.clientY - dragFrom.y;
  if (viewKind === "histogram") {
    const shift = dx / width * (dragFrom.line.xmax - dragFrom.line.xmin);
    line = { xmin: dragFrom.line.xmin - shift, xmax: dragFrom.line.xmax - shift };
  } else {
    plane.cx = dragFrom.plane.cx - dx * plane.perPixel;
    plane.cy = dragFrom.plane.cy + dy * plane.perPixel;
  }
  draw();
});
simCanvas.addEventListener("pointerup", function () { dragFrom = null; });
simCanvas.addEventListener("pointercancel", function () { dragFrom = null; });

// Zoom by "factor" (below 1 zooms in) around the screen point (sx, sy):
// the point under it stays put.
function zoomAround(sx, sy, factor) {
  following[viewKind] = false;
  if (viewKind === "histogram") {
    const x = line.xmin + (line.xmax - line.xmin) * sx / width;
    line = { xmin: x + (line.xmin - x) * factor, xmax: x + (line.xmax - x) * factor };
  } else {
    const x = planeX(sx), y = planeY(sy);
    plane.perPixel *= factor;
    plane.cx = x - (sx - width / 2) * plane.perPixel;
    plane.cy = y + (sy - height / 2) * plane.perPixel;
  }
  draw();
}

// The mouse wheel (or a two-finger pinch on a touchpad) zooms around
// the point under the pointer.
simCanvas.addEventListener("wheel", function (event) {
  event.preventDefault();          // don't scroll the page too
  zoomAround(event.offsetX, event.offsetY, Math.pow(1.0015, event.deltaY));
}, { passive: false });


/* =====================================================================
   6. STATISTICS
   ===================================================================== */
function showStats() {
  if (!cloud || !model) return;
  const scale = byId("scale").value;
  byId("stat-t").textContent = "t = " + cloud.t + ", N = " + cloud.runs.toLocaleString();
  const m = meanMatrix.map(niceNumber);
  byId("stat-mean").textContent = "[[" + m[0] + ", " + m[1] + "], [" + m[2] + ", " + m[3] + "]]" +
                                  (model.random ? " (entries with u's: averaged numerically)" : "");
  byId("stat-rho").textContent = niceNumber(rho);
  byId("stat-logrho").textContent = rho > 0 ? niceNumber(Math.log(rho)) : "−∞";

  // Growth rates, leaving out runs whose product became exactly 0.
  const rates = Array.from(growthRates(cloud)).filter(isFinite);
  if (cloud.t === 0 || rates.length === 0) {
    byId("stat-growth").textContent = "(after the first step)";
    chartPen(byId("growth-chart"));
  } else {
    const r = meanAndSpread(rates);
    byId("stat-growth").textContent = niceNumber(r.mean) + " (spread over runs " + niceNumber(r.spread) + ")";
    histogram(byId("growth-chart"), rates, false);
  }

  // The red dots, at the picture's scale.
  const xs = [], ys = [];
  for (let n = 0; n < cloud.runs; n++) {
    const p = pointOf(cloud, n, 1, 0, scale, rho);
    if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
  }
  if (xs.length > 0) {
    const sx = meanAndSpread(xs), sy = meanAndSpread(ys);
    byId("stat-red-mean").textContent = "(" + niceNumber(sx.mean) + ", " + niceNumber(sy.mean) + ")";
    byId("stat-red-spread").textContent = niceNumber(sx.spread) + ", " + niceNumber(sy.spread);
  } else {
    byId("stat-red-mean").textContent = byId("stat-red-spread").textContent = "(too big to show)";
  }

  // The largest eigenvalue of each run's product.
  const eig = topEigenvalues(cloud, scale, rho);
  const re = Array.from(eig.re).filter(isFinite), im = Array.from(eig.im).filter(isFinite);
  histogram(byId("eigen-chart"), re, true);
  if (im.some(function (v) { return v !== 0; })) {
    histogram(byId("eigen-im-chart"), im, true);
  } else {
    chartPen(byId("eigen-im-chart")).fillText("All the eigenvalues are real.", 0, 20);
  }
}

// A histogram with 60 bars. With "trimmed", the range is the middle 90%
// of the values, and anything outside goes into the first or last bar.
// (As in random-sine.js, plus the case where all values are equal.)
function histogram(canvas, values, trimmed) {
  const p = chartPen(canvas);
  if (values.length < 2) return;
  const w = canvas.clientWidth, h = canvas.clientHeight, top = 12, bottom = h - 14;
  const sorted = Float64Array.from(values).sort();
  let lo = trimmed ? sorted[Math.floor(0.05 * (sorted.length - 1))] : sorted[0];
  let hi = trimmed ? sorted[Math.ceil(0.95 * (sorted.length - 1))] : sorted[sorted.length - 1];
  // All (nearly) the same value, like D13's eigenvalue 1, which rounding
  // spreads by about 1e-15: one bar in the middle, not a bar of noise.
  if (!(hi - lo > 1e-9 * Math.max(1, Math.abs(lo)))) { lo -= 0.5; hi = lo + 1; }
  const bars = 60, counts = new Array(bars).fill(0);
  for (const v of sorted) counts[Math.max(0, Math.min(bars - 1, Math.floor((v - lo) / (hi - lo) * bars)))]++;

  const biggest = Math.max(...counts), barWidth = w / bars;
  p.fillText(biggest.toLocaleString(), 0, 9);
  p.fillText(shortLabel(lo), 0, h - 2);
  const last = shortLabel(hi);
  p.fillText(last, w - p.measureText(last).width, h - 2);
  p.fillStyle = CHART_LINE;
  counts.forEach(function (c, i) {
    const barHeight = (bottom - top) * c / biggest;
    if (c > 0) p.fillRect(i * barWidth, bottom - Math.max(1, barHeight), Math.max(1, barWidth - 1), Math.max(1, barHeight));
  });
}


/* =====================================================================
   7. CONNECTING THE BUTTONS
   ===================================================================== */
byId("preset").addEventListener("change", function () { usePreset(byId("preset").value); });
byId("add-matrix").addEventListener("click", function () {
  matrices.push({ entries: ["1", "0", "0", "1"], weight: "" });
  buildMatrixRows();
  typedByHand();
});

byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  setPlaying(false);
  if (!cloud) return;
  stepOnce();
  wantedT = cloud.t;
  draw();
  showStats();
});
byId("restart").addEventListener("click", function () {
  setPlaying(false);
  wantedT = 0;
  replay();
});
byId("speed").max = SPEEDS.length - 1;
byId("speed").addEventListener("input", function () { speedIndex = Number(byId("speed").value); showSpeed(); });

byId("set-tmax").addEventListener("change", function () { tMax = readWhole("set-tmax", 1, 5000, START_TMAX); });
byId("set-runs").addEventListener("change", function () {
  runs = readWhole("set-runs", 1, 20000, START_RUNS);
  byId("set-run").max = runs;
  replay();
});
byId("seed").addEventListener("change", function () { seed = byId("seed").value; replay(); });
byId("new-seed").addEventListener("click", function () {
  seed = String(Math.floor(Math.random() * 100000));
  byId("seed").value = seed;
  replay();
});

for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () { setViewKind(radio.value); });
}
byId("scale").addEventListener("change", function () {
  following = { cloud: true, trajectory: true, histogram: true };   // a new scale needs a new fit
  draw();
  showStats();
});
for (const id of ["show-red", "show-blue", "hist-coordinate", "hist-bin"]) {
  byId(id).addEventListener("change", draw);
}
byId("set-run").addEventListener("change", function () {
  shownRun = readWhole("set-run", 1, runs, 1);
  replay();
});

byId("zoom-in").addEventListener("click", function () { zoomAround(width / 2, height / 2, 1 / 1.5); });
byId("zoom-out").addEventListener("click", function () { zoomAround(width / 2, height / 2, 1.5); });
byId("zoom-reset").addEventListener("click", function () { following[viewKind] = true; draw(); });
window.addEventListener("resize", function () { sizeCanvas(); draw(); showStats(); });

// Start: your D13, 2000 runs, seed 1, at t = 0, paused at a low speed.
// The libraries come from the internet; without them the toy can't run.
if (!window.math || !window.alea) {
  showMessage("The toy couldn't start. It loads two small libraries (math.js and seedrandom) from " +
              "cdn.jsdelivr.net; check the internet connection and reload.");
} else {
  byId("seed").value = seed;
  byId("set-runs").value = runs;
  byId("set-tmax").value = tMax;
  byId("set-run").value = shownRun;
  byId("set-run").max = runs;
  byId("preset").value = "d13";
  showSpeed();
  setViewKind("cloud");
  usePreset("d13");
}
