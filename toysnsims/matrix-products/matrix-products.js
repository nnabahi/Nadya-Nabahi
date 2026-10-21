/* =====================================================================
   matrix-products.js  —  the "Random matrix products" page
   ---------------------------------------------------------------------
   The math lives in matrix-products-math.js (reading the matrices,
   the runs, the statistics), the same file
   matrix-products-check.html tests. This file does everything
   else:
     1. Settings
     2. The state of the page
     3. The matrix boxes and their sliders
     4. The runs: stepping, replaying, Play
     5. The picture: cloud, one run, histogram; dragging and zooming
     6. Statistics
     7. Connecting the buttons
   It uses the shared helpers in js/sim-page.js (byId, showMessage,
   ...), the charts and number labels in js/sim-charts.js (histogram,
   niceNumber, ...), the plane picture in js/sim-view.js (makePlaneView,
   ...), and the formula reading and sliders in js/formulas.js.

   Everything runs right here, in the page's own thread. A step of 2000
   runs takes well under a thousandth of a second for fixed matrices,
   so the cloud follows a slider live; Play works in small batches (the
   run loop every sim uses), so the page never freezes.

   How a slider stays live (the Desmos feel): when anything about the
   matrices changes, every run goes back to t = 0 and is stepped again,
   up to the same t, with the same random numbers. So the cloud you see
   is always "these matrices, after t steps", and it bends smoothly.
   ===================================================================== */


/* =====================================================================
   1. SETTINGS
   ===================================================================== */

// Play speeds, in steps per second. The toy starts paused, at 2.
const SPEEDS = [1, 100];   // the slider's starting min and max (boxes at its ends change them)
const START_SPEED = 2;
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

// The run shown in the "One run" view, and its trajectory: a copy of
// its product (e^logSize * Q) for every t = 0, 1, ..., t, each kept as
// a "cloud" of that one run, so pointOf can read it.
let shownRun = 1;
let trajectory = [];

let viewKind = "cloud";   // "cloud", "histogram" or "trajectory"


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
  matrices = PRESETS[key].map(function (m) {
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
  trajectory.push({ q0: [cloud.q0[n]], q1: [cloud.q1[n]], q2: [cloud.q2[n]], q3: [cloud.q3[n]],
                    logSize: [cloud.logSize[n]], t: cloud.t });
}

// Go back to t = 0 (a new cloud if N or the seed changed) and step
// again up to wantedT, with the same random numbers. Like a restart,
// it pauses.
function replay() {
  player.setPlaying(false);
  if (!model) return;
  if (!cloud || cloud.runs !== runs || cloud.seed !== seed) {
    cloud = newCloud(model, runs, seed);
    cloud.seed = seed;
  } else {
    cloud.setModel(model);
  }
  shownRun = Math.min(shownRun, runs);
  byId("set-run").value = shownRun;   // N may have dropped below it
  trajectory = [];
  remember();
  while (cloud.t < wantedT) stepOnce();
  draw();
  showStats();
}

// A slider fires many times a second; replay at most once per screen
// refresh, with whatever the latest numbers are.
const replaySoon = oncePerFrame(replay);

// Play and Step: one step of every run at a time, at the Speed
// slider's speed, on the run loop every sim uses (makeRunLoop,
// js/sim-worker.js), up to "Stop at t". The statistics are redrawn at
// most every quarter of a second while it plays.
function playStep() {
  stepOnce();
  wantedT = cloud.t;
}
const showStatsSlowly = notTooOften(250, function () { return stepping.playing; }, showStats);
const stepping = makeRunLoop(playStep, function () { draw(); showStatsSlowly(); },
  function () { return cloud === null || cloud.t >= tMax; });

// Restart: back to t = 0, paused.
function restart() {
  wantedT = 0;
  replay();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(stepping, SPEEDS, START_SPEED, "step", "steps", restart);


/* =====================================================================
   5. THE PICTURE
   ---------------------------------------------------------------------
   Like Desmos: a white background, light gray grid lines, black axes
   with numbers. The picture is a plane view (makePlaneView,
   js/sim-view.js): the cloud and the one-run views are the plane, with
   the same scale on both axes; the histogram uses only its x.

   "Following": the picture fits itself to the dots after every step,
   until you drag or zoom; the Fit button turns following back on. Each
   view keeps its own place, and whether it follows.
   ===================================================================== */
let following = { cloud: true, trajectory: true, histogram: true };
const placeOf = {};           // view kind -> where it was left: { cx, cy, ux, uy }
const plane = makePlaneView(simCanvas, oncePerFrame(draw), {
  reset: function () { following[viewKind] = true; },
  onMove: function () { following[viewKind] = false; },
  resetTitle: "Fit the picture to the dots, and keep following them", resetWord: "Fit",
});
connectPicture(plane);
let pen = null;

// The dots to draw: { red: [[x, y], ...], blue: [...] }, plus how many
// could not be drawn (too big or too small for the computer at this
// scale). For the cloud, one red and one blue dot per run; for one run,
// its dots v_0, v_1, ..., v_t.
function cloudDots() {
  const dots = { red: [], blue: [], lost: 0 }, scale = byId("scale").value;
  for (let n = 0; n < cloud.runs; n++) addDots(dots, cloud, n, scale);
  return dots;
}
function trajectoryDots() {
  const dots = { red: [], blue: [], lost: 0 }, scale = byId("scale").value;
  for (const one of trajectory) addDots(dots, one, 0, scale);
  return dots;
}
// Add run n of the cloud c to the dots: where (1, 0) goes in red and
// (0, 1) in blue, if their boxes are ticked.
function addDots(dots, c, n, scale) {
  for (const [name, x0, y0, box] of [["red", 1, 0, "show-red"], ["blue", 0, 1, "show-blue"]]) {
    if (!byId(box).checked) continue;
    const p = pointOf(c, n, x0, y0, scale, rho);
    if (isFinite(p[0]) && isFinite(p[1])) dots[name].push(p);
    else dots.lost++;
  }
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
  // (Taller in the full screen popup: pictureHeight, in js/sim-page.js.)
  pen = sizePlane(plane, pictureHeight(Math.min(simCanvas.clientWidth, MOST_PIXELS_TALL)));
  pen.fillStyle = "#ffffff";
  pen.fillRect(0, 0, plane.width, plane.height);
  byId("show-t").textContent = cloud.t;

  let lost;
  if (viewKind === "histogram") {
    const h = histogramValues();
    lost = h.lost;
    if (following.histogram) fitLine(h.values);
    drawHistogram(h.values);
  } else {
    const dots = viewKind === "cloud" ? cloudDots() : trajectoryDots();
    lost = dots.lost;
    if (following[viewKind]) fitDots(dots.red.concat(dots.blue));
    drawPlaneGrid(plane, pen);
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
      for (const p of list) pen.fillRect(pixelX(plane, p[0]) - s / 2, pixelY(plane, p[1]) - s / 2, s, s);
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
function fitDots(points) {
  if (points.length === 0) return;
  const [x0, x1] = middleRange(points.map(function (p) { return p[0]; }));
  const [y0, y1] = middleRange(points.map(function (p) { return p[1]; }));
  showWhole(plane, { xmin: x0, xmax: x1, ymin: y0, ymax: y1 }, 1.15);
}

// Fit the histogram's x range to the values (also leaving out the
// outer 1%).
function fitLine(values) {
  if (values.length === 0) { showPlaneBox(plane, { xmin: 0, xmax: 1 }); return; }
  let [lo, hi] = middleRange(values);
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const pad = 0.04 * (hi - lo);
  showPlaneBox(plane, { xmin: lo - pad, xmax: hi + pad });
}

// The smallest and largest value, leaving out the outer 1% on each side
// when there are more than 200 values.
function middleRange(values) {
  const sorted = Float64Array.from(values).sort();
  const cut = sorted.length > 200 ? Math.floor(0.01 * sorted.length) : 0;
  return [sorted[cut], sorted[sorted.length - 1 - cut]];
}

// The one-run view joins its dots in order, with a thin line.
function drawPath(points, color) {
  if (points.length < 2) return;
  pen.strokeStyle = color;
  pen.globalAlpha = 0.35;
  pen.lineWidth = 1;
  pen.beginPath();
  points.forEach(function (p, i) {
    if (i === 0) pen.moveTo(pixelX(plane, p[0]), pixelY(plane, p[1])); else pen.lineTo(pixelX(plane, p[0]), pixelY(plane, p[1]));
  });
  pen.stroke();
  pen.globalAlpha = 1;
}

// The histogram of the values inside the x range shown. The bin width
// is the typed one, or 1/200 of the range shown, so zooming in shows
// finer and finer detail (the D13 dust has detail at every size).
function drawHistogram(values) {
  const line = planeBox(plane), width = plane.width, height = plane.height;
  const typed = Number(byId("hist-bin").value);
  const span = line.xmax - line.xmin;
  const binWidth = typed > 0 ? typed : span / 200;
  const bins = Math.max(1, Math.min(4000, Math.ceil(span / binWidth)));
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const i = Math.floor((v - line.xmin) / binWidth);
    if (i >= 0 && i < bins) counts[i]++;
  }
  const biggest = Math.max(1, ...counts);

  const bottom = height - 18, top = 16;

  // Light grid lines at nice x steps, as on the plane, with numbers
  // under them.
  const step = niceStep(GRID_PIXELS / plane.ux);
  pen.strokeStyle = PLANE_COLORS.lines;
  pen.lineWidth = 1;
  pen.fillStyle = PLANE_COLORS.numbers;
  pen.font = "11px sans-serif";
  pen.beginPath();
  for (const x of multiplesOf(step, line.xmin, line.xmax)) {
    const at = pixelX(plane, x);
    pen.moveTo(Math.round(at) + 0.5, top); pen.lineTo(Math.round(at) + 0.5, bottom);
    const label = shortLabel(x, step);
    pen.fillText(label, at - pen.measureText(label).width / 2, height - 4);
  }
  pen.stroke();

  pen.fillStyle = COLOR_RED;
  for (let i = 0; i < bins; i++) {
    if (counts[i] === 0) continue;
    const barHeight = Math.max(1, (bottom - top) * counts[i] / biggest);
    const x0 = pixelX(plane, line.xmin + i * binWidth), x1 = pixelX(plane, line.xmin + (i + 1) * binWidth);
    pen.fillRect(x0, bottom - barHeight, Math.max(1, x1 - x0 - (x1 - x0 > 3 ? 1 : 0)), barHeight);
  }

  pen.strokeStyle = PLANE_COLORS.axes;
  pen.beginPath();
  lineAcross(pen, bottom, width);
  pen.stroke();
  pen.fillStyle = PLANE_COLORS.numbers;
  pen.fillText("tallest bar: " + biggest.toLocaleString() + " runs; bin width " + shortLabel(binWidth), 44, 12);   // right of the full screen button
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

// Show the view "kind" where it was left, and the options that belong
// to it.
function setViewKind(kind) {
  placeOf[viewKind] = { cx: plane.cx, cy: plane.cy, ux: plane.ux, uy: plane.uy };
  viewKind = kind;
  Object.assign(plane, placeOf[kind]);       // (nothing the first time: it follows the dots)
  byId("histogram-options").hidden = kind !== "histogram";
  byId("trajectory-options").hidden = kind !== "trajectory";
  draw();
}


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


/* =====================================================================
   7. CONNECTING THE BUTTONS
   ===================================================================== */
byId("preset").addEventListener("change", function () { usePreset(byId("preset").value); });
byId("add-matrix").addEventListener("click", function () {
  matrices.push({ entries: ["1", "0", "0", "1"], weight: "" });
  buildMatrixRows();
  typedByHand();
});

byId("set-tmax").addEventListener("change", function () { tMax = readWhole("set-tmax", 1, 5000, START_TMAX); });
byId("set-runs").addEventListener("change", function () {
  runs = readWhole("set-runs", 1, 20000, START_RUNS);
  byId("set-run").max = runs;
  replay();
});
connectSeed(function () { seed = byId("seed").value; replay(); });   // js/sim-page.js

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

window.addEventListener("resize", function () { draw(); showStats(); });

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
  setViewKind("cloud");
  usePreset("d13");
}
