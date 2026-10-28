/* =====================================================================
   path-counting.js  —  the lattice path counting page
   ---------------------------------------------------------------------
   What the page does, in plain words:
     f(x, y) counts the ways from (x, y) down to (0, 0), one step left
     or down at a time, through the open edges (more generally, it adds
     up the products of the weights along the paths). The picture colors
     every grid point by f, from above or in 3D, and the red balls show
     f along one line x cos t + y sin t = c, whose shape the Statistics
     box compares with a Gaussian bell curve. There is nothing to run: like
     Desmos, everything is worked out again the moment you type or move
     a slider.

   The math is in path-counting-math.js; the formulas and sliders in
   js/formulas.js; the Random variables box in js/sim-random.js; the
   picture from above in js/sim-view.js; the 3D view in js/sim-3d.js.

   Sections:
     1. Settings you might want to change
     2. Reading the formulas, with sliders
     3. Working out f, and the line
     4. The picture from above
     5. The 3D view
     6. Statistics
     7. The buttons and boxes
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */
const PICTURE_HEIGHT = 480;        // the picture's height on the page, in pixels

const UNREACHED = [120, 120, 120]; // points no path reaches (f = 0): gray
const PLAIN = [250, 250, 250];     // every point, with the heatmap off
const OUTSIDE = [230, 230, 230];   // around the grid
const EDGE_COLOR = "rgba(0, 0, 0, 0.55)";   // the open edges, from above
const LINE_COLOR = "#c0392b";      // the line, its balls and the direction vector: red
const GROUND = "#d8d8d8";          // the floor in 3D

const START_ANGLE = Math.PI / 4;    // the direction (cos t, sin t) starts at 45 degrees
const ANGLE_STEP = Math.PI / 360;   // the angle slider moves half a degree at a time

// The "Start from" choices. Each gives X, Y, your own functions, the
// lines of the Random variables box, and the sliders' settings.
const PRESETS = {
  // The old site's default: d(y) is 3 with chance p and 2 otherwise, one
  // per row, and the step down from (x, y) is open when d(y) divides x.
  periodic: { X: "1", Y: "{mod(x, d(y)) = 0: 1, 0}", definitions: "d(y) = {u < p: 3, 2}", lines: "u ~ unif(0, 1)",
              sliders: { p: { value: 0.5, min: 0, max: 1, step: 0.01 } } },
  open: { X: "1", Y: "1" },
  bernoulli: { X: "{u < p: 1, 0}", Y: "1", lines: "u ~ unif(0, 1)",
               sliders: { p: { value: 0.5, min: 0, max: 1, step: 0.01 } } },
};

// The 256 colors of the heights 0, 1/255, ..., 1 (blue to red,
// heatColor in js/sim-colors.js), worked out once.
const PALETTE = [];
for (let k = 0; k < 256; k++) PALETTE.push(heatColor(k / 255));


/* =====================================================================
   2. READING THE FORMULAS, WITH SLIDERS
   ---------------------------------------------------------------------
   X, Y and your own functions are read by readTree (js/formulas.js):
   "=" means equals, {condition: a, b} is a piecewise formula, and "xy"
   means x times y, as in Desmos. They can use the random variables of
   the Random variables box (connectRandomBox, js/sim-random.js). Every
   other letter but x, y, N and a function's own inputs gets a slider
   (one slider per letter, shared by all the formulas and the box).
   ===================================================================== */
let trees = null;          // the two formulas, read: { X, Y }
let definitions = [];      // your own functions (readDefinition, path-counting-math.js)
let sliders = {};          // letter -> { value, min, max, step }

// The Random variables box. Typing in it re-reads everything.
const box = connectRandomBox({
  reserved: ["x", "y", "N"],
  onTyped: function () { byId("preset").value = "custom"; },
  onRead: readFormulas,
  sliders: function () { return sliders; },
});

function readFormulas() {
  const read = {}, defs = [];
  try {
    for (const name of ["X", "Y"]) {
      const text = byId("formula-" + name).value.trim();
      if (text === "") throw new Error(name + " is empty.");
      try { read[name] = readTree(text); }
      catch (problem) { throw new Error(name + ": " + problem.message); }
    }
    for (const text of byId("definitions").value.split("\n")) {
      if (text.trim() === "") continue;
      try { defs.push(readDefinition(text)); }
      catch (problem) { throw new Error(text.trim() + ": " + problem.message); }
    }
    checkDefinitions(defs, box.declared);
  } catch (problem) {
    // Usually just a half-typed formula: keep the last good picture.
    byId("formula-message").textContent = "Can't read it yet. " + problem.message;
    return;
  }
  byId("formula-message").textContent = "";
  trees = read;
  definitions = defs;
  if (window.katex) {
    for (const name of ["X", "Y"]) katex.render(formulaTex(trees[name]), byId("preview-" + name), { throwOnError: false });
    const lines = definitions.map(function (def) {
      return def.name + "(" + def.inputs.join(", ") + ") = " + formulaTex(def.tree);
    });
    katex.render(lines.join(" \\\\ "), byId("preview-definitions"), { throwOnError: false, displayMode: true });
  }

  // One slider per letter, in the order the letters first appear.
  showSliders(byId("sliders"), weightLetters(trees, definitions, box.declared), sliders, recount);
  recount();
}

// Fill in a preset's formulas, random variables and sliders (putting
// its lines in the box reads them, then the formulas).
function usePreset(key) {
  const p = PRESETS[key];
  byId("formula-X").value = p.X;
  byId("formula-Y").value = p.Y;
  byId("definitions").value = p.definitions || "";
  for (const letter in p.sliders || {}) sliders[letter] = Object.assign({}, p.sliders[letter]);
  box.setText(p.lines || "");
}


/* =====================================================================
   3. WORKING OUT f, AND THE LINE
   ---------------------------------------------------------------------
   recount() works out f on the whole grid (after a formula, slider,
   seed or grid size changes); reshape() works out what depends on the
   line and the heights only (quick), and draws.
   ===================================================================== */
let N = 60;                // the grid is 0..N by 0..N
let domain = null;         // the grid, as a domain for the picture (js/sim-domains.js)
let paths = null;          // f on the grid (countPaths, path-counting-math.js)
let heights = null;        // f scaled to 0..1, for colors and 3D heights
let line = null;           // the lines at right angles to the direction (makeLine)
let lineNumber = 60;       // which of them is shown: the one at distance c = lineNumber * line.step
let points = [];           // the grid points on it
let stats = null;          // f along the line (lineStats)

// (While the random variables can't be made, the box says why, and the
// last good picture stays.)
function recount() {
  if (!trees) return;
  const variables = box.build(sliderValues(sliders));
  if (!variables) return;
  try {
    const weights = makeWeights(trees, definitions, variables, N, byId("seed").value);
    paths = countPaths(N, weights.X, weights.Y);
  } catch (problem) {
    byId("formula-message").textContent = "Can't work it out: " + problem.message;
    return;
  }
  showWeightsNote();
  reshape();
}

// The gray line under the picture, when a weight is not 0 or 1.
function showWeightsNote() {
  const odd = ["X", "Y"].filter(function (name) { return paths.notZeroOne[name]; });
  let note = "";
  if (odd.length > 0) {
    note = odd.join(" and ") + (odd.length === 1 ? " takes" : " take") +
      " values outside of {0,1}, picture does not represent path count anymore.";
  }
  if (paths.negative > 0) note += " Weights below 0 count as 0.";
  byId("weights-note").textContent = note;
}

// The lines for the angle t on the slider. The distance slider counts
// the lines, from 0 to the last one; when the grid or the angle changes,
// it keeps its place along the slider, so the line stays about where
// it was.
function useAngle() {
  const angle = Number(byId("angle").value) * ANGLE_STEP;
  const share = line ? lineNumber / Math.max(line.most, 1) : null;
  line = makeLine(N, angle);
  if (share !== null) lineNumber = Math.round(share * line.most);
  lineNumber = Math.min(Math.max(lineNumber, 0), line.most);
  const slider = byId("line-c");
  slider.max = line.most;
  slider.value = lineNumber;
  byId("angle-label").textContent = "= " + angle.toFixed(3) + " (" + (angle * 180 / Math.PI).toFixed(1) +
    "°): direction (" + line.cos.toFixed(2) + ", " + line.sin.toFixed(2) + ")";
}

function reshape() {
  if (!paths) return;
  heights = scaledHeights(paths, line, checked("heights"));
  points = linePoints(N, line, lineNumber);
  stats = lineStats(points, paths.logF, N, line.alongX);
  byId("line-label").textContent = "= " + (lineNumber * line.step).toFixed(2) + ": " + points.length +
    (points.length === 1 ? " point" : " points");
  drawSoon();
}


/* =====================================================================
   4. THE PICTURE FROM ABOVE
   ---------------------------------------------------------------------
   One square per grid point, colored by its height (gray if no path
   reaches it), as in the other sims (paintCells, js/sim-view.js), so it
   zooms and moves the same way. On top, each one if switched on: the
   open edges as thin dark lines (once the squares are big enough to see
   them), the line and its points as red dots, and the direction vector
   as a red arrow from (0, 0) to the line.
   ===================================================================== */
const simCanvas = byId("sim-canvas");
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });
const view = makeView(simCanvas, drawSoon);

function drawPicture() {
  if (!heights) return;                    // nothing worked out yet
  if (show3D) { draw3D(); return; }
  const pen = fitPicture(view, domain, PICTURE_HEIGHT);
  const heatmap = byId("show-heatmap").checked;
  paintCells(view, pen, domain,
    function (v) { return isNaN(heights[v]) ? -1 : Math.round(255 * heights[v]); },
    function (g) { return !heatmap ? PLAIN : g < 0 ? UNREACHED : PALETTE[g]; }, OUTSIDE);
  const cell = view.cell;
  // Where point (x, y) is on the screen: the middle of its square (row 0
  // is the top, y = N). x and y can be in between grid points too.
  const across = function (x) { return view.left + (x + view.scroll.x) * cell + cell / 2; };
  const down = function (y) { return (N - y + view.scroll.y) * cell + cell / 2; };

  // The open edges: from (x - 1, y) to (x, y) where X > 0, and from
  // (x, y - 1) to (x, y) where Y > 0.
  if (byId("show-edges").checked && cell >= 4) {
    pen.beginPath();
    for (let y = 0; y <= N; y++) {
      for (let x = 0; x <= N; x++) {
        const p = x + (N + 1) * y;
        if (paths.wx[p] > 0) { pen.moveTo(across(x - 1), down(y)); pen.lineTo(across(x), down(y)); }
        if (paths.wy[p] > 0) { pen.moveTo(across(x), down(y - 1)); pen.lineTo(across(x), down(y)); }
      }
    }
    pen.strokeStyle = EDGE_COLOR;
    pen.lineWidth = Math.max(1, cell / 10);
    pen.stroke();
  }

  pen.strokeStyle = pen.fillStyle = LINE_COLOR;
  pen.lineWidth = 2;
  // The line, and its points.
  if (byId("show-line").checked) {
    const ends = lineEnds(N, line, lineNumber * line.step);
    if (ends.length > 0) {
      pen.beginPath();
      pen.moveTo(across(ends[0]), down(ends[1]));
      pen.lineTo(across(ends[2]), down(ends[3]));
      pen.stroke();
    }
    const radius = Math.max(2, 0.3 * cell);
    for (const point of points) {
      pen.beginPath();
      pen.arc(across(point.x), down(point.y), radius, 0, 2 * Math.PI);
      pen.fill();
    }
  }
  // The direction vector: an arrow from (0, 0) to the line, c long.
  if (byId("show-vector").checked) {
    const arrow = vectorLines();
    pen.beginPath();
    for (let i = 0; i < arrow.length; i += 4) {
      pen.moveTo(across(arrow[i]), down(arrow[i + 1]));
      pen.lineTo(across(arrow[i + 2]), down(arrow[i + 3]));
    }
    pen.stroke();
  }
  pen.restore();
}

// The direction vector as three straight pieces [x1, y1, x2, y2, ...]
// in grid units: the arrow's shaft from (0, 0) to c (cos t, sin t), and
// its two barbs. Before the line has moved off (0, 0), it is drawn 1/8
// of the grid long, just to show the direction.
function vectorLines() {
  const length = Math.max(lineNumber * line.step, N / 8);
  const tipX = length * line.cos, tipY = length * line.sin, barb = Math.max(1, N / 40);
  const lines = [0, 0, tipX, tipY];
  for (const turn of [0.85 * Math.PI, -0.85 * Math.PI]) {   // the barbs point back, 27 degrees off the shaft
    const a = line.angle + turn;
    lines.push(tipX, tipY, tipX + barb * Math.cos(a), tipY + barb * Math.sin(a));
  }
  return lines;
}

// Click a point to move the line through it (the picture still drags
// and zooms as in the other sims: connectPicture, js/sim-view.js).
connectPicture(view, {
  onClick: function (event) {
    const v = cellUnder(view, domain, pointerSpot(view, event));
    if (v < 0) return;
    lineNumber = line.number(v % (N + 1), Math.floor(v / (N + 1)));
    byId("line-c").value = lineNumber;
    reshape();
  },
});


/* =====================================================================
   5. THE 3D VIEW
   ---------------------------------------------------------------------
   The heights as a colored surface over the grid (with the heatmap on),
   with the red balls on it along the line and the line itself on the
   floor (with the line on), and the direction vector on the floor. The 3D code
   is shared, in js/sim-3d.js; it loads the 3D library three.js from the
   internet the first time 3D is switched on.
   ===================================================================== */
let show3D = false;          // the View option
let stretch = 1;             // the Heights slider: 2 = twice as tall
const three = make3D(simCanvas, PICTURE_HEIGHT, {   // js/sim-page.js
  ready: function () { lookAlongDirection(); drawSoon(); },
  failed: function () { show3D = false; showPictureKind(); },
  reset: lookAlongDirection,
});

// Show the picture from above, or the 3D one, and their options.
function showPictureKind() {
  simCanvas.hidden = show3D;
  three.show(show3D);
  byId("view3d-options").hidden = !show3D;
  byId("flat-options").hidden = show3D;
  showZoomButtons(view);
  drawSoon();
}

// Look from behind (0, 0) along the direction vector, as in your
// Desmos picture: each line at right angles to it runs across the
// picture, so its bell curve is seen from the side.
function lookAlongDirection() {
  if (three.view) three.code.resetCamera(three.view, [line.cos, line.sin]);
}

function draw3D() {
  if (!three.view) return;
  const showLine = byId("show-line").checked;
  const balls = { x: [], y: [], height: [] };
  for (const point of showLine ? points : []) {
    const h = heights[point.x + (N + 1) * point.y];
    balls.x.push(point.x);
    balls.y.push(point.y);
    balls.height.push(isNaN(h) ? 0 : h);
  }
  // On the floor: the line, and the direction vector.
  const floorLines = (showLine ? lineEnds(N, line, lineNumber * line.step) : [])
    .concat(byId("show-vector").checked ? vectorLines() : []);
  const red = hexToRGB(LINE_COLOR);
  three.code.drawSurface(three.view, {
    size: N + 1, height: heights, show: byId("show-heatmap").checked, color: heatColor,
    balls: balls, ballColor: red, ground: hexToRGB(GROUND),
    lines: floorLines, lineColor: red, stretch: stretch,
  });
}

// After the window changes size, or the picture opens or closes as a
// full screen popup (js/sim-page.js): draw again at the new size.
window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   f along the line: the numbers in the table, and a chart of the bars
   (f divided by the largest on the line) with the Gaussian bell curve
   of the same mean and standard deviation drawn over them.
   ===================================================================== */
function showStats() {
  if (!stats) return;
  const reached = stats.reached > 0;
  byId("stat-points").textContent = stats.count.toLocaleString();
  byId("stat-reached").textContent = stats.reached.toLocaleString();
  byId("stat-most").textContent = bigNumberText(stats.logMost);
  byId("stat-sum").textContent = bigNumberText(stats.logSum);
  byId("stat-axis").textContent = line.alongX ? "x" : "y";
  byId("stat-mean").textContent = reached ? stats.mean.toFixed(2) : "";
  byId("stat-sd").textContent = reached ? stats.sd.toFixed(2) : "";
  byId("stat-gap").textContent = reached ? stats.worstGap.toFixed(3) : "";
  drawLineChart(byId("line-chart"));
}

function drawLineChart(canvas) {
  if (stats.reached === 0) {
    chartPen(canvas).fillText(stats.count === 0 ? "No grid points on this line." : "No path reaches this line.", 0, 14);
    return;
  }
  const first = stats.position[0], last = stats.position[stats.position.length - 1];
  const lo = Math.min(first, last) - 0.5, hi = Math.max(first, last) + 0.5;

  // The bars, 0.8 of the gap between neighboring points wide.
  const half = 0.4 * (stats.position.length > 1 ? Math.abs(stats.position[1] - stats.position[0]) : 1);
  const bars = stats.scaled.map(function (s, i) {
    return { from: stats.position[i] - half, to: stats.position[i] + half, value: Math.min(s, 1.05) };
  });
  const frame = barChart(canvas, bars, { from: lo, to: hi }, { from: 0, to: 1.05 });
  // The Gaussian, drawn smoothly over them.
  const curve = [];
  for (let k = 0; k <= 200; k++) {
    const t = lo + (hi - lo) * k / 200;
    curve.push([t, Math.min(stats.gaussian(t), 1.05)]);
  }
  drawSeries(frame, [{ points: curve, color: LINE_COLOR }]);
}


/* =====================================================================
   7. THE BUTTONS AND BOXES
   ===================================================================== */
byId("preset").addEventListener("change", function () { usePreset(this.value); });
for (const name of ["X", "Y"]) {
  byId("formula-" + name).addEventListener("input", function () {
    byId("preset").value = "custom";       // "Your own formulas"
    readFormulas();
  });
}

byId("definitions").addEventListener("input", function () {
  byId("preset").value = "custom";
  readFormulas();
});

// The grid size N: a new grid, and f again.
function useSize() {
  N = Number(byId("size").value);
  byId("size-label").textContent = "N = " + N + " (" + (N + 1) + " × " + (N + 1) + " points)";
  domain = boxDomain(N + 1, N + 1, 4, false);
  useTorus(view, false);
  useAngle();
}
byId("size").addEventListener("input", function () { useSize(); recount(); });
connectSeed(recount);

// The angle slider goes from 0 to pi/2 in half degrees (it holds the
// number of half degrees).
byId("angle").max = Math.round((Math.PI / 2) / ANGLE_STEP);
byId("angle").value = Math.round(START_ANGLE / ANGLE_STEP);
byId("angle").addEventListener("input", function () { useAngle(); reshape(); });
byId("line-c").addEventListener("input", function () { lineNumber = Number(this.value); reshape(); });
for (const id of ["show-line", "show-vector", "show-heatmap"]) byId(id).addEventListener("change", drawSoon);

for (const radio of document.querySelectorAll('input[name="heights"]')) radio.addEventListener("change", reshape);
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () { show3D = (radio.value === "3d"); showPictureKind(); });
}
byId("show-edges").addEventListener("change", drawSoon);
connectStretch(function (value) { stretch = value; drawSoon(); });

// Start: your periodic rule on the 61 x 61 grid, at 45 degrees (the
// line x + y = 60).
byId("seed").value = "1";
useSize();
lineNumber = N;
byId("line-c").value = lineNumber;
showPictureKind();
usePreset("periodic");
