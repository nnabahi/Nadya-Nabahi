/* =====================================================================
   random-sine.js  —  the "Random sine function" sim page
   ---------------------------------------------------------------------
   The math lives in random-sine-roots.js (placing the roots, f, the
   peaks and lobe areas), the same file random-sine-check.html tests.
   This file does everything else:
     1. The starting sets (presets)
     2. The state of the page
     3. Reading the gap set, with sliders
     4. The current sample
     5. Drawing the graph, dragging and zooming
     6. Statistics of the current sample
     7. Many samples: histograms
     8. Connecting the buttons
   It uses the shared helpers in js/sim-page.js (byId, showMessage,
   ...), the charts and number labels in js/sim-charts.js (histogram,
   niceNumber, ...) and the formula reading and sliders in
   js/formulas.js.

   Everything runs right here, in the page's own thread. One sample
   takes a few thousandths of a second, so the graph follows a slider
   live; Play works in small batches between screen refreshes, so the
   page never freezes.
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
const SPEEDS = [1, 3, 10, 30, 100, 300, 1000];
const START_SPEED = 2;
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
let law = null;               // the gap law read from the box (random-sine-roots.js, section 2)
let N = 300;                  // roots on each side of 0
let seed = "1";
let uniforms = null;          // the fixed random numbers for this seed and N
let roots = null;             // the current sample's roots, smallest first
let view = Object.assign({}, DEFAULT_VIEW);   // the x range shown

// Many samples (section 7).
let samples = 0;
let collected = { areas: [], offsets: [], peaks: [], logders: [] };
let playing = false;
let speedIndex = START_SPEED;


/* =====================================================================
   3. READING THE GAP SET, WITH SLIDERS
   ---------------------------------------------------------------------
   The box is read by readGapSet (random-sine-roots.js). Every letter
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
    setPlaying(false);
    return;
  }
  draw();
  showSampleStats();
  restartSamples();
}


/* =====================================================================
   5. DRAWING THE GRAPH, DRAGGING AND ZOOMING
   ---------------------------------------------------------------------
   Like Desmos: a white background, light gray grid lines, black axes
   with numbers, and f drawn by working it out at every pixel column.
   The height either fits f (the default) or is fixed.
   With "log scale", every curve y is drawn as sign(y) log10(1 + |y|),
   so huge and small lobes both show.
   ===================================================================== */
let pen = null, width = 0, height = 0;

function sizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  width = simCanvas.clientWidth;
  height = pictureHeight(PICTURE_HEIGHT);         // taller in the full screen popup (js/sim-page.js)
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  pen = simCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);    // draw in screen pixels from here on
}

function draw() {
  if (!roots) return;
  if (!pen || simCanvas.clientWidth !== width) sizeCanvas();
  const logScale = byId("log-scale").checked;
  const squash = logScale ? function (y) { return Math.sign(y) * Math.log10(1 + Math.abs(y)); }
                          : function (y) { return y; };

  // The x of each pixel column, and f there.
  const xs = [], fs = [];
  for (let i = 0; i <= width; i++) {
    const x = view.xmin + (view.xmax - view.xmin) * i / width;
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

  // The height: fit f, or the typed number.
  let top;
  if (byId("y-scale").value === "fit") {
    top = 0;
    for (const y of fs) if (isFinite(y)) top = Math.max(top, Math.abs(squash(y)));
    top = top > 0 ? 1.15 * top : 1;
    byId("set-height").value = Number((logScale ? Math.pow(10, top) - 1 : top).toPrecision(3));
  } else {
    const typed = Math.abs(Number(byId("set-height").value)) || 1;
    top = squash(typed);
  }

  const px = function (x) { return (x - view.xmin) / (view.xmax - view.xmin) * width; };
  const py = function (y) { return height / 2 - y / top * (height / 2); };

  // Background, grid and axes.
  pen.fillStyle = "#ffffff";
  pen.fillRect(0, 0, width, height);
  drawGrid(px, py, top, logScale);

  // The curves. A value too big to draw is clamped just off the picture.
  for (const [values, color, dashed] of curves) {
    pen.strokeStyle = color;
    pen.lineWidth = dashed ? 1.5 : 2;
    pen.setLineDash(dashed ? [6, 5] : []);
    pen.beginPath();
    values.forEach(function (y, i) {
      const v = isFinite(y) ? Math.max(-3 * top, Math.min(3 * top, squash(y))) : 0;
      if (i === 0) pen.moveTo(i, py(v)); else pen.lineTo(i, py(v));
    });
    pen.stroke();
  }
  pen.setLineDash([]);

  // The roots, as small dots on the x axis.
  if (byId("show-roots").checked) {
    pen.fillStyle = COLOR_ROOT;
    for (const r of roots) {
      if (r < view.xmin || r > view.xmax) continue;
      pen.beginPath();
      pen.arc(px(r), py(0), 3, 0, 2 * Math.PI);
      pen.fill();
    }
  }

  // Warn if the window reaches near the last roots, where the cut-off
  // product is no longer close to the real f.
  const reach = Math.min(-roots[0], roots[roots.length - 1]);
  const far = Math.max(Math.abs(view.xmin), Math.abs(view.xmax));
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

// Grid lines at "nice" steps (1, 2 or 5 times a power of 10), light
// gray, with numbers along the axes; the axes themselves in black.
function drawGrid(px, py, top, logScale) {
  const xStep = niceStep((view.xmax - view.xmin) / 10);
  const yStep = niceStep(top / 4);
  pen.lineWidth = 1;
  pen.strokeStyle = "#e6e6e6";
  pen.beginPath();
  for (let x = Math.ceil(view.xmin / xStep) * xStep; x <= view.xmax; x += xStep) {
    pen.moveTo(Math.round(px(x)) + 0.5, 0); pen.lineTo(Math.round(px(x)) + 0.5, height);
  }
  for (let y = -Math.floor(top / yStep) * yStep; y <= top; y += yStep) {
    pen.moveTo(0, Math.round(py(y)) + 0.5); pen.lineTo(width, Math.round(py(y)) + 0.5);
  }
  pen.stroke();

  pen.strokeStyle = "#000000";
  pen.beginPath();
  pen.moveTo(0, Math.round(py(0)) + 0.5); pen.lineTo(width, Math.round(py(0)) + 0.5);
  if (view.xmin <= 0 && view.xmax >= 0) { pen.moveTo(Math.round(px(0)) + 0.5, 0); pen.lineTo(Math.round(px(0)) + 0.5, height); }
  pen.stroke();

  // Numbers: under the x axis, and next to the y axis (or the left edge).
  pen.fillStyle = "#555555";
  pen.font = "11px sans-serif";
  const yAxisAt = view.xmin <= 0 && view.xmax >= 0 ? px(0) : 0;
  for (let x = Math.ceil(view.xmin / xStep) * xStep; x <= view.xmax; x += xStep) {
    if (Math.abs(x) < xStep / 2) continue;
    const label = shortLabel(x);
    pen.fillText(label, px(x) - pen.measureText(label).width / 2, py(0) + 13);
  }
  for (let y = -Math.floor(top / yStep) * yStep; y <= top; y += yStep) {
    if (Math.abs(y) < yStep / 2) continue;
    // In log scale the line at height y stands for the value sign(y)(10^|y| - 1).
    const value = logScale ? Math.sign(y) * (Math.pow(10, Math.abs(y)) - 1) : y;
    pen.fillText(shortLabel(value), yAxisAt + 4, py(y) - 3);
  }
}

function showLegend() {
  const parts = ["solid: f"];
  if (byId("show-sine").checked) parts.push("dashed: the sine wave with the same first root and mean gap");
  if (byId("show-F").checked) parts.push("green: F");
  if (byId("show-derivative").checked) parts.push("orange: f′");
  if (byId("show-roots").checked) parts.push("red dots: roots");
  byId("legend").textContent = parts.join(" · ");
}

// Show x from a to b, and update the boxes.
function setView(a, b) {
  if (!(b > a)) return;
  view = { xmin: a, xmax: b };
  byId("view-xmin").value = Number(a.toPrecision(4));
  byId("view-xmax").value = Number(b.toPrecision(4));
  draw();
}

// Zoom by "factor" (below 1 zooms in) around the point x.
function zoomAround(x, factor) {
  setView(x + (view.xmin - x) * factor, x + (view.xmax - x) * factor);
}

// Dragging moves along the x axis. "Pointer" events cover the mouse,
// a pen and a finger alike.
let dragFrom = null;
simCanvas.addEventListener("pointerdown", function (event) {
  dragFrom = { x: event.clientX, view: Object.assign({}, view) };
  simCanvas.setPointerCapture(event.pointerId);
});
simCanvas.addEventListener("pointermove", function (event) {
  if (!dragFrom) return;
  const shift = (event.clientX - dragFrom.x) / width * (dragFrom.view.xmax - dragFrom.view.xmin);
  setView(dragFrom.view.xmin - shift, dragFrom.view.xmax - shift);
});
simCanvas.addEventListener("pointerup", function () { dragFrom = null; });
simCanvas.addEventListener("pointercancel", function () { dragFrom = null; });

// The mouse wheel (or a two-finger pinch on a touchpad) zooms around
// the point under the pointer.
simCanvas.addEventListener("wheel", function (event) {
  event.preventDefault();          // don't scroll the page too
  const x = view.xmin + (view.xmax - view.xmin) * event.offsetX / width;
  zoomAround(x, Math.pow(1.0015, event.deltaY));
}, { passive: false });


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
   histograms (as in nadya's randfuncsagain.py). Play runs samples
   between screen refreshes, at most about 12 thousandths of a second
   each time, so the page stays smooth.
   ===================================================================== */
function restartSamples() {
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

let lastFrame = 0, owed = 0, lastCharts = 0;
function playFrame(time) {
  if (!playing) return;
  if (lastFrame > 0) {
    owed += SPEEDS[speedIndex] * Math.min(0.1, (time - lastFrame) / 1000);
    const started = performance.now();
    while (owed >= 1 && samples < MOST_SAMPLES && performance.now() - started < 12) {
      addSample();
      owed--;
    }
    owed = Math.min(owed, SPEEDS[speedIndex]);     // don't pile up work if the computer is slow
  }
  lastFrame = time;
  if (time - lastCharts > 250) { lastCharts = time; showHistograms(); }
  if (samples >= MOST_SAMPLES) { setPlaying(false); showHistograms(); return; }
  requestAnimationFrame(playFrame);
}

function setPlaying(on) {
  playing = on && law !== null;
  byId("play").textContent = playing ? "Pause" : "Play";
  lastFrame = 0; owed = 0;
  if (playing) requestAnimationFrame(playFrame);
}

function showSpeed() {
  byId("speed").value = speedIndex;
  byId("speed-label").textContent = SPEEDS[speedIndex].toLocaleString() + " samples/s";
}

function showHistograms() {
  byId("samples-heading").textContent = "Many samples: " + samples.toLocaleString() + " so far, " +
    collected.offsets.length.toLocaleString() + " lobes";
  const asLog = byId("hist-mode").value === "log";
  const sizes = function (list) {
    return list.map(function (v) { return Math.log10(Math.abs(v)); }).filter(isFinite);
  };
  histogram(byId("areas-chart"), asLog ? sizes(collected.areas) : collected.areas, !asLog);
  histogram(byId("offsets-chart"), collected.offsets, false);
  histogram(byId("peaks-chart"), asLog ? sizes(collected.peaks) : collected.peaks, !asLog);
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

for (const side of ["xmin", "xmax"]) {
  byId("view-" + side).addEventListener("change", function () {
    setView(Number(byId("view-xmin").value), Number(byId("view-xmax").value));
  });
}
byId("zoom-in").addEventListener("click", function () { zoomAround((view.xmin + view.xmax) / 2, 1 / 1.5); });
byId("zoom-out").addEventListener("click", function () { zoomAround((view.xmin + view.xmax) / 2, 1.5); });
byId("zoom-reset").addEventListener("click", function () { setView(DEFAULT_VIEW.xmin, DEFAULT_VIEW.xmax); });
byId("y-scale").addEventListener("change", draw);
byId("set-height").addEventListener("change", function () { byId("y-scale").value = "fixed"; draw(); });
for (const id of ["log-scale", "show-sine", "show-roots", "show-F", "show-derivative"]) {
  byId(id).addEventListener("change", draw);
}

byId("set-a").addEventListener("change", function () { showSampleStats(); restartSamples(); });
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  setPlaying(false);
  if (law) { addSample(); showHistograms(); }
});
byId("restart").addEventListener("click", function () { setPlaying(false); restartSamples(); });
byId("speed").max = SPEEDS.length - 1;
byId("speed").addEventListener("input", function () { speedIndex = Number(byId("speed").value); showSpeed(); });
byId("hist-mode").addEventListener("change", showHistograms);
window.addEventListener("resize", function () { sizeCanvas(); draw(); showHistograms(); });

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
  byId("view-xmin").value = view.xmin;
  byId("view-xmax").value = view.xmax;
  byId("preset").value = "slowly";
  showSpeed();
  usePreset("slowly");
}
