/* =====================================================================
   sinusoid-ish.js  —  the "Random sine function" sim page
   ---------------------------------------------------------------------
   The math lives in sinusoid-ish-roots.js (placing the roots, f, the
   peaks and lobe areas), the same file sinusoid-ish-check.html tests.
   This file does everything else:
     1. The starting sets (presets)
     2. The state of the page
     3. Reading the gap set, with sliders
     4. The current sample
     5. Drawing the graph, moving and scaling
     6. Statistics of the current sample
     7. Many samples: histograms
     8. Connecting the buttons
   It uses the shared helpers in js/sim-page.js (byId, showMessage,
   ...), the charts and number labels in js/sim-charts.js (histogram,
   niceNumber, ...), the plane picture in js/sim-view.js (makePlaneView,
   ...) and the formula reading and sliders in js/formulas.js.

   Everything runs right here, in the page's own thread. One sample
   takes a few thousandths of a second, so the graph follows a slider
   live; Play works in small batches (the run loop every sim uses), so
   the page never freezes.
   ===================================================================== */


/* =====================================================================
   1. THE STARTING SETS (PRESETS)
   ---------------------------------------------------------------------
   Each preset sets the root model, the typed set, and its sliders.
   ===================================================================== */
const PRESETS = {
  "slowly":  { model: "walk", set: "[1, 1 + δ]", sliders: { δ: { value: 0.1, min: 0, max: 2, step: 0.01 } } },
  "sine":    { model: "walk", set: "{1}" },
  "d1":      { model: "walk", set: "[1 - d, 1 + d]", sliders: { d: { value: 0.5, min: 0, max: 0.99, step: 0.01 } } },
  "two":     { model: "walk", set: "{2, 3}" },
  "lattice": { model: "lattice", set: "[-1/2, 1/2]" },
  "mirror":  { model: "mirror", set: "{1, 2}" },     // as in randomsinfuncs.py
};

// What the typed set means in each model.
const SET_LABELS = {
  walk: "Gaps between neighboring roots: uniform on",
  lattice: "Jitter U(n), so R(n) = n + s + U(n): uniform on",
  mirror: "Gaps between the roots 0 < r(1) < r(2) < ...: uniform on",
};

// Play speeds, in samples per second. The sim starts paused, at 10.
const SPEEDS = [1, 100];   // the slider's starting min and max (boxes at its ends change them)
const START_SPEED = 10;
const MOST_SAMPLES = 100000;
const DEFAULT_VIEW = { xmin: -10, xmax: 10 };
const PICTURE_HEIGHT = 420;           // pixels

// The curves' colors. Placeholders, like all colors on the site.
const COLOR_F = CHART_LINE;           // f: the site's accent color
const COLOR_SINE = "#9aa0a6";         // the matching sine wave (dashed)
const COLOR_F_INTEGRAL = "#2f7d3a";   // F
const COLOR_DERIVATIVE = "#c77d1a";   // f'
const COLOR_ROOT = "#b3402f";


/* =====================================================================
   2. THE STATE OF THE PAGE
   ===================================================================== */
const simCanvas = byId("sim-canvas");

let model = "walk";           // "walk", "lattice" or "mirror"
let sliders = {};             // letter -> { value, min, max, step }
let law = null;               // the gap law read from the box (sinusoid-ish-roots.js, section 2)
let N = 300;                  // roots on each side of 0
let seed = "1";
let uniforms = null;          // the fixed random numbers for this seed and N
let roots = null;             // the current sample's roots, smallest first

// Many samples (section 7).
let samples = 0;
let collected = { areas: [], offsets: [], peaks: [], logders: [] };


/* =====================================================================
   3. READING THE GAP SET, WITH SLIDERS
   ---------------------------------------------------------------------
   The box is read by readGapSet (sinusoid-ish-roots.js). Every letter
   other than u gets a slider (makeSlider, js/formulas.js); moving one
   re-reads the set and redraws.
   ===================================================================== */
function readSet() {
  const text = byId("gap-set").value;
  let letters;
  try {
    letters = gapSetLetters(text);
  } catch (problem) {
    // Usually just a half-typed set: keep the last good picture.
    byId("set-message").textContent = "Can't read that yet: " + problem.message;
    return;
  }

  // Typeset preview, with KaTeX. A set or interval is read as a list
  // (an "ArrayNode", whose "items" are its entries) and shown entry by
  // entry, inside { } or [ ].
  if (window.katex) {
    let tex;
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const items = readTree("[" + trimmed.slice(1, -1) + "]").items.map(function (item) {
          return item.toTex({ parenthesis: "keep", implicit: "hide" });
        });
        tex = trimmed.startsWith("{") ? "\\{" + items.join(", ") + "\\}" : "[" + items.join(", ") + "]";
      } else {
        tex = readTree(trimmed).toTex({ parenthesis: "keep", implicit: "hide" });
      }
    } catch (problem) {
      tex = "";                          // half-typed: no preview
    }
    katex.render(tex, byId("gap-preview"), { throwOnError: false });
  }

  // One slider per letter.
  const holder = byId("sliders");
  holder.innerHTML = "";
  for (const letter of letters) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], useSet));
  }
  useSet();
}

// Read the set with the sliders' current values, then make a new sample.
function useSet() {
  const values = {};
  for (const letter in sliders) values[letter] = sliders[letter].value;
  try {
    law = readGapSet(byId("gap-set").value, values);
  } catch (problem) {
    byId("set-message").textContent = problem.message;
    return;
  }
  byId("set-message").textContent = "";
  newSample();
}

function usePreset(key) {
  const preset = PRESETS[key];
  sliders = {};
  for (const letter in preset.sliders || {}) sliders[letter] = Object.assign({}, preset.sliders[letter]);
  setModel(preset.model);
  byId("gap-set").value = preset.set;
  readSet();
}

function setModel(m) {
  model = m;
  for (const radio of document.querySelectorAll('input[name="model"]')) radio.checked = radio.value === m;
  byId("set-label").textContent = SET_LABELS[m];
}


/* =====================================================================
   4. THE CURRENT SAMPLE
   ---------------------------------------------------------------------
   The fixed random numbers depend only on the seed and N, so they are
   made again only when one of those changes. Everything else (the set,
   a slider, the model) just re-reads the same numbers.
   ===================================================================== */
function newSample() {
  if (!law) return;
  if (!uniforms || uniforms.seed !== seed || uniforms.N !== N) {
    uniforms = makeUniforms(seed, N);
    uniforms.seed = seed;
    uniforms.N = N;
  }
  try {
    roots = makeRoots(model, law, uniforms, N);
  } catch (problem) {
    byId("set-message").textContent = problem.message;
    law = null;                          // nothing to sample until the set is fixed
    player.setPlaying(false);
    return;
  }
  draw();
  showSampleStats();
  restartSamples();
}


/* =====================================================================
   5. DRAWING THE GRAPH, MOVING AND SCALING
   ---------------------------------------------------------------------
   Like Desmos: a white background, the grid (light gray lines, black
   axes with numbers), and f drawn by working it out at every pixel
   column. The picture is a plane view (makePlaneView, js/sim-view.js).
   It starts with the same unit in both directions and never rescales
   itself to fit f:
     - drag to move (both directions),
     - scroll to zoom both directions together,
     - scroll while the pointer is over an axis (it turns light blue)
       to scale just that axis,
     - or type the ranges in the Picture boxes.
   With "log scale", every curve y is drawn as sign(y) log10(1 + |y|),
   so huge and small lobes both show. The plane's y is in these drawn
   units; the boxes and the axis numbers show the real values.
   ===================================================================== */
const plane = makePlaneView(simCanvas, oncePerFrame(draw), { reset: showStartView, axes: true, onMove: showViewBoxes });
connectPicture(plane, null, null);
let pen = null;

// log scale or not: the drawn height of a value y, and back.
function squash(y) { return byId("log-scale").checked ? Math.sign(y) * Math.log10(1 + Math.abs(y)) : y; }
function unsquash(v) { return byId("log-scale").checked ? Math.sign(v) * (Math.pow(10, Math.abs(v)) - 1) : v; }

// (Taller in the full screen popup: pictureHeight, in js/sim-page.js.)
function sizeCanvas() { pen = sizePlane(plane, pictureHeight(PICTURE_HEIGHT)); }

// The starting view: x from -10 to 10, y centered on 0 with the same
// unit as x.
function showStartView() {
  const half = (DEFAULT_VIEW.xmax - DEFAULT_VIEW.xmin) / 2 * plane.height / plane.width;
  showPlaneBox(plane, { xmin: DEFAULT_VIEW.xmin, xmax: DEFAULT_VIEW.xmax, ymin: squash(-half), ymax: squash(half) });
  showViewBoxes();
}

function draw() {
  if (!roots) return;
  sizeCanvas();
  const box = planeBox(plane);

  // The x of each pixel column, and f there.
  const xs = [], fs = [];
  for (let i = 0; i <= plane.width; i++) {
    const x = pointX(plane, i);
    xs.push(x);
    fs.push(fValue(x, roots));
  }

  // The curves to draw: [values, color, dashed].
  const curves = [];
  if (byId("show-sine").checked) curves.push([xs.map(matchingSine()), COLOR_SINE, true]);
  if (byId("show-F").checked) curves.push([integralMinusAverage(xs, fs), COLOR_F_INTEGRAL, false]);
  if (byId("show-derivative").checked) {
    curves.push([xs.map(function (x) { return fDerivative(x, roots); }), COLOR_DERIVATIVE, false]);
  }
  curves.push([fs, COLOR_F, false]);                 // f last, so it is on top

  // Background, grid and axes. In log scale the line at height y
  // stands for the value sign(y)(10^|y| - 1).
  pen.fillStyle = "#ffffff";
  pen.fillRect(0, 0, plane.width, plane.height);
  drawPlaneGrid(plane, pen, function (y) { return shortLabel(unsquash(y)); });

  // The curves. A value too big to draw is clamped a picture's height
  // off the picture, so the line still leaves through the edge.
  const span = box.ymax - box.ymin;
  for (const [values, color, dashed] of curves) {
    pen.strokeStyle = color;
    pen.lineWidth = dashed ? 1.5 : 2;
    pen.setLineDash(dashed ? [6, 5] : []);
    pen.beginPath();
    values.forEach(function (y, i) {
      const v = isFinite(y) ? Math.max(box.ymin - span, Math.min(box.ymax + span, squash(y))) : 0;
      if (i === 0) pen.moveTo(i, pixelY(plane, v)); else pen.lineTo(i, pixelY(plane, v));
    });
    pen.stroke();
  }
  pen.setLineDash([]);

  // The roots, as small dots on the x axis.
  if (byId("show-roots").checked) {
    pen.fillStyle = COLOR_ROOT;
    for (const r of roots) {
      if (r < box.xmin || r > box.xmax) continue;
      pen.beginPath();
      pen.arc(pixelX(plane, r), pixelY(plane, 0), 3, 0, 2 * Math.PI);
      pen.fill();
    }
  }

  // Warn if the window reaches near the last roots, where the cut-off
  // product is no longer close to the real f.
  const reach = Math.min(-roots[0], roots[roots.length - 1]);
  const far = Math.max(Math.abs(box.xmin), Math.abs(box.xmax));
  showMessage(far > reach / 3
    ? "The picture reaches close to the last of the " + N + " roots on each side, so it is less accurate " +
      "there. Raise N, or zoom in."
    : "");
  showLegend();
}

// The sine wave with the same first root and the same mean gap m:
// sin(pi (R(0) - x) / m) / sin(pi R(0) / m), which is 1 at x = 0 like f.
// (For the mirror model, which has a root at 0: (m / pi) sin(pi x / m).)
function matchingSine() {
  const m = model === "lattice" ? 1 : law.mean;
  if (model === "mirror") return function (x) { return m / Math.PI * Math.sin(Math.PI * x / m); };
  const r0 = roots.find(function (r) { return r > 0; });
  return function (x) { return Math.sin(Math.PI * (r0 - x) / m) / Math.sin(Math.PI * r0 / m); };
}

// F at every pixel column: the integral of f from the left edge (by
// the trapezoid rule), minus its average over the window. Subtracting
// the average makes the starting point not matter.
function integralMinusAverage(xs, fs) {
  const F = [0];
  for (let i = 1; i < xs.length; i++) F.push(F[i - 1] + (fs[i] + fs[i - 1]) / 2 * (xs[i] - xs[i - 1]));
  const average = F.reduce(function (a, b) { return a + b; }, 0) / F.length;
  return F.map(function (v) { return v - average; });
}

function showLegend() {
  const parts = ["solid: f"];
  if (byId("show-sine").checked) parts.push("dashed: the sine wave with the same first root and mean gap");
  if (byId("show-F").checked) parts.push("green: F");
  if (byId("show-derivative").checked) parts.push("orange: f′");
  if (byId("show-roots").checked) parts.push("red dots: roots");
  byId("legend").textContent = parts.join(" · ");
}

// Show the part of the plane "next" (any of xmin, xmax, ymin, ymax, in
// drawn units), and update the boxes.
function setView(next) {
  if (!showPlaneBox(plane, next)) return;
  showViewBoxes();
  draw();
}

function showViewBoxes() {
  const box = planeBox(plane);
  byId("view-xmin").value = Number(box.xmin.toPrecision(4));
  byId("view-xmax").value = Number(box.xmax.toPrecision(4));
  byId("view-ymin").value = Number(unsquash(box.ymin).toPrecision(4));
  byId("view-ymax").value = Number(unsquash(box.ymax).toPrecision(4));
}


/* =====================================================================
   6. STATISTICS OF THE CURRENT SAMPLE
   ===================================================================== */
function readA() {
  const a = Number(byId("set-a").value);
  return a > 0 ? a : 10;
}

function showSampleStats() {
  const A = readA();
  const lobes = lobesIn(-A, A, roots);
  const right = roots.findIndex(function (r) { return r > 0; });

  byId("stat-mean").textContent = model === "lattice" ? "1" : niceNumber(law.mean);
  byId("stat-r0").textContent = niceNumber(roots[right]);
  byId("stat-cover").textContent = model === "mirror" ? "none (0 is a root)"
    : niceNumber(roots[right] - roots[right - 1]);
  byId("stat-logder").textContent = model === "mirror" ? "none (0 is a root)" : niceNumber(logDerivative(0, roots));
  byId("stat-lobes").textContent = lobes.length;

  const rows = byId("lobe-rows");
  rows.innerHTML = "";
  for (const lobe of lobes) {
    const row = document.createElement("tr");
    for (const v of [lobe.left, lobe.right, lobe.area, lobe.offset, lobe.peak]) {
      const cell = document.createElement("td");
      cell.textContent = niceNumber(v);
      row.appendChild(cell);
    }
    rows.appendChild(row);
  }
}


/* =====================================================================
   7. MANY SAMPLES: HISTOGRAMS
   ---------------------------------------------------------------------
   Sample k uses the seed "seed:k", with the same model, set, sliders
   and N, and adds every lobe with both roots in [-A, A] to the
   histograms (as in nadya's randfuncsagain.py). Play adds samples at
   the Speed slider's speed, on the run loop every sim uses
   (makeRunLoop, js/sim-worker.js), and redraws the histograms at most
   every quarter of a second while it plays.
   ===================================================================== */
// Back to no samples, paused.
function restartSamples() {
  player.setPlaying(false);
  samples = 0;
  collected = { areas: [], offsets: [], peaks: [], logders: [] };
  showHistograms();
}

function addSample() {
  samples++;
  const sample = makeRoots(model, law, makeUniforms(seed + ":" + samples, N), N);
  const A = readA();
  for (const lobe of lobesIn(-A, A, sample)) {
    collected.areas.push(lobe.area);
    collected.offsets.push(lobe.offset);
    collected.peaks.push(lobe.peak);
  }
  if (model !== "mirror") collected.logders.push(logDerivative(0, sample));
}

const sampling = makeRunLoop(addSample,
  notTooOften(250, function () { return sampling.playing; }, showHistograms),
  function () { return law === null || samples >= MOST_SAMPLES; });   // nothing (more) to sample

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(sampling, SPEEDS, START_SPEED, "sample", "samples", restartSamples);

function showHistograms() {
  byId("samples-heading").textContent = "Many samples: " + samples.toLocaleString() + " so far, " +
    collected.offsets.length.toLocaleString() + " lobes";
  const asLog = byId("hist-mode").value === "log";
  // On a log scale: the sizes (above 0), with bars of equal width on that scale.
  const sizes = function (list) {
    return list.map(Math.abs).filter(function (v) { return v > 0 && isFinite(v); });
  };
  histogram(byId("areas-chart"), asLog ? sizes(collected.areas) : collected.areas, !asLog, asLog);
  histogram(byId("offsets-chart"), collected.offsets, false);
  histogram(byId("peaks-chart"), asLog ? sizes(collected.peaks) : collected.peaks, !asLog, asLog);
  if (model === "mirror") {
    const p = chartPen(byId("logder-chart"));
    p.fillText("None for the mirror model: 0 is always a root.", 0, 20);
  } else {
    histogram(byId("logder-chart"), collected.logders, true);
  }
}


/* =====================================================================
   8. CONNECTING THE BUTTONS
   ===================================================================== */
byId("preset").addEventListener("change", function () { usePreset(byId("preset").value); });
for (const radio of document.querySelectorAll('input[name="model"]')) {
  radio.addEventListener("change", function () {
    byId("preset").value = "custom";
    setModel(radio.value);
    useSet();
  });
}
byId("gap-set").addEventListener("input", function () {
  byId("preset").value = "custom";
  readSet();
});

byId("set-n").addEventListener("change", function () {
  N = Math.max(10, Math.min(20000, Math.round(Number(byId("set-n").value)) || 300));
  byId("set-n").value = N;
  newSample();
});
connectSeed(function () { seed = byId("seed").value; newSample(); });   // js/sim-page.js

// The Picture boxes: x from/to and y from/to (y in real values).
for (const side of ["xmin", "xmax", "ymin", "ymax"]) {
  byId("view-" + side).addEventListener("change", function () {
    setView({ xmin: Number(byId("view-xmin").value), xmax: Number(byId("view-xmax").value),
              ymin: squash(Number(byId("view-ymin").value)), ymax: squash(Number(byId("view-ymax").value)) });
  });
}
// Turning log scale on or off keeps the same real y range (the boxes
// still hold it), only drawn the new way.
byId("log-scale").addEventListener("change", function () {
  setView({ ymin: squash(Number(byId("view-ymin").value)), ymax: squash(Number(byId("view-ymax").value)) });
});
for (const id of ["show-sine", "show-roots", "show-F", "show-derivative"]) {
  byId(id).addEventListener("change", draw);
}

byId("set-a").addEventListener("change", function () { showSampleStats(); restartSamples(); });
byId("hist-mode").addEventListener("change", showHistograms);
window.addEventListener("resize", function () { draw(); showViewBoxes(); showHistograms(); });

// Start: slowly random gaps [1, 1 + δ] with δ = 0.1, seed 1, paused at
// a low speed. The libraries come from the internet; without them the
// sim can't run.
if (!window.math || !Math.seedrandom) {
  showMessage("The sim couldn't start. It loads two small libraries (math.js and seedrandom) from " +
              "cdn.jsdelivr.net; check the internet connection and reload.");
} else {
  byId("seed").value = seed;
  byId("set-n").value = N;
  byId("set-a").value = 10;
  sizeCanvas();
  showStartView();
  byId("preset").value = "slowly";
  usePreset("slowly");
}
