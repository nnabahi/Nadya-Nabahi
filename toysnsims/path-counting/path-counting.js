/* =====================================================================
   path-counting.js  —  the lattice path counting page
   ---------------------------------------------------------------------
   What the page does, in plain words:
     f(x, y) counts the ways from (x, y) down to (0, 0), one step left
     or down at a time, through the open edges (more generally, it adds
     up the products of the weights along the paths). The picture colors
     every grid point by f, from above or in 3D, and the red balls show
     f along one line a x + b y = c, whose shape the Statistics box
     compares with a Gaussian bell curve. There is nothing to run: like
     Desmos, everything is worked out again the moment you type or move
     a slider.

   The math is in path-counting-math.js; the formulas and sliders in
   js/formulas.js; the picture from above in js/sim-view.js; the 3D view
   in js/sim-3d.js.

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
const OUTSIDE = [230, 230, 230];   // around the grid
const EDGE_COLOR = "rgba(0, 0, 0, 0.55)";   // the open edges, from above
const LINE_COLOR = "#c0392b";      // the line a x + b y = c and its balls: red
const GROUND = "#d8d8d8";          // the floor in 3D

// The "Start from" choices. Each gives X and Y, and the sliders' settings.
const PRESETS = {
  // The old site's default: d(y) is 3 with chance p and 2 otherwise, one
  // per row, and the step down from (x, y) is open when d(y) divides x.
  periodic: { X: "1", Y: "{mod(x, {u(y) < p: 3, 2}) = 0: 1, 0}",
              sliders: { p: { value: 0.5, min: 0, max: 1, step: 0.01 } } },
  open: { X: "1", Y: "1" },
  bernoulli: { X: "{u(x, y) < p: 1, 0}", Y: "1",
               sliders: { p: { value: 0.5, min: 0, max: 1, step: 0.01 } } },
};

// The 256 colors of the heights 0, 1/255, ..., 1 (blue to red,
// heatColor in js/sim-colors.js), worked out once.
const PALETTE = [];
for (let k = 0; k < 256; k++) PALETTE.push(heatColor(k / 255));


/* =====================================================================
   2. READING THE FORMULAS, WITH SLIDERS
   ---------------------------------------------------------------------
   X and Y are read by readTree (js/formulas.js): "=" means equals,
   {condition: a, b} is a piecewise formula, and "xy" means x times y,
   as in Desmos. Every letter other than x, y and N gets a slider (one
   slider per letter, shared by both formulas).
   ===================================================================== */
let trees = null;          // the two formulas, read: { X, Y }
let sliders = {};          // letter -> { value, min, max, step }

function readFormulas() {
  const read = {};
  for (const name of ["X", "Y"]) {
    const text = byId("formula-" + name).value.trim();
    try {
      if (text === "") throw new Error("it is empty.");
      read[name] = readTree(text);
    } catch (problem) {
      // Usually just a half-typed formula: keep the last good picture.
      byId("formula-message").textContent = "Can't read " + name + " yet: " + problem.message;
      return;
    }
    if (window.katex) katex.render(formulaTex(read[name]), byId("preview-" + name), { throwOnError: false });
  }
  byId("formula-message").textContent = "";
  trees = read;

  // One slider per letter, in the order the letters first appear (a Set
  // keeps that order, and each letter once).
  const letters = new Set(sliderLetters(trees.X).concat(sliderLetters(trees.Y)));
  letters.delete("N");                     // N is the grid size, not a slider
  const holder = byId("sliders");
  holder.innerHTML = "";
  for (const letter of letters) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], recount));
  }
  recount();
}

// Fill in a preset's formulas and sliders.
function usePreset(key) {
  const p = PRESETS[key];
  byId("formula-X").value = p.X;
  byId("formula-Y").value = p.Y;
  for (const letter in p.sliders || {}) sliders[letter] = Object.assign({}, p.sliders[letter]);
  readFormulas();
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
let line = { a: 1, b: 1, c: 60, lo: 0, hi: 120 };   // the line a x + b y = c, and c's range
let points = [];           // the grid points on the line
let stats = null;          // f along the line (lineStats)

function recount() {
  if (!trees) return;
  const values = {};
  for (const letter in sliders) values[letter] = sliders[letter].value;
  const u = uniformFor(byId("seed").value);
  try {
    paths = countPaths(N, weightFunction(trees.X, values, N, u), weightFunction(trees.Y, values, N, u));
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

// The c slider's range is every value of a x + b y on the grid. When
// the grid or the direction changes, c keeps its place in the range,
// so the line stays about where it was.
function fitLineRange() {
  const range = levelRange(N, line.a, line.b);
  const share = line.hi > line.lo ? (line.c - line.lo) / (line.hi - line.lo) : 0.5;
  line.lo = range.lo;
  line.hi = range.hi;
  line.c = Math.round(range.lo + share * (range.hi - range.lo));
  const slider = byId("line-c");
  slider.min = range.lo;
  slider.max = range.hi;
  slider.value = line.c;
}

function reshape() {
  if (!paths) return;
  heights = scaledHeights(paths, line.a, line.b, checked("heights"));
  points = linePoints(N, line.a, line.b, line.c);
  stats = lineStats(points, paths.logF, N, line.b === 0);
  const distance = Math.abs(line.c) / Math.hypot(line.a, line.b);
  byId("line-label").textContent = "= " + line.c + ": " + points.length +
    (points.length === 1 ? " point" : " points") + ", at distance " + distance.toFixed(2) + " from (0, 0)";
  drawSoon();
}


/* =====================================================================
   4. THE PICTURE FROM ABOVE
   ---------------------------------------------------------------------
   One square per grid point, colored by its height (gray if no path
   reaches it), as in the other sims (paintCells, js/sim-view.js), so it
   zooms and moves the same way. On top: the open edges as thin dark
   lines (once the squares are big enough to see them), and the points
   of the line as red dots.
   ===================================================================== */
const simCanvas = byId("sim-canvas");
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });
const view = makeView(simCanvas, drawSoon);

function drawPicture() {
  if (!heights) return;                    // nothing worked out yet
  if (show3D) { draw3D(); return; }
  const pen = fitPicture(view, domain, pictureHeight(PICTURE_HEIGHT));
  paintCells(view, pen, domain,
    function (v) { return isNaN(heights[v]) ? -1 : Math.round(255 * heights[v]); },
    function (g) { return g < 0 ? UNREACHED : PALETTE[g]; }, OUTSIDE);
  const cell = view.cell;
  // The middle of point (x, y)'s square on the screen (row 0 is the top, y = N).
  const across = function (x) { return squareLeft(view, x) + cell / 2; };
  const down = function (y) { return squareTop(view, N - y) + cell / 2; };

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

  // The points of the line.
  pen.fillStyle = LINE_COLOR;
  const radius = Math.max(2, 0.3 * cell);
  for (const point of points) {
    pen.beginPath();
    pen.arc(across(point.x), down(point.y), radius, 0, 2 * Math.PI);
    pen.fill();
  }
  pen.restore();
}

// Click a point to move the line through it (the picture still drags
// and zooms as in the other sims: connectPicture, js/sim-controls.js).
connectPicture(view, null, null, function (event) {
  const v = cellUnder(view, domain, pointerSpot(view, event));
  if (v < 0) return;
  const x = v % (N + 1), y = Math.floor(v / (N + 1));
  line.c = line.a * x + line.b * y;
  byId("line-c").value = line.c;
  reshape();
}, "pointer");


/* =====================================================================
   5. THE 3D VIEW
   ---------------------------------------------------------------------
   The heights as a colored surface over the grid, with the red balls
   on it along the line (and the line itself on the floor). The 3D code
   is shared, in js/sim-3d.js; it loads the 3D library three.js from the
   internet the first time 3D is switched on.
   ===================================================================== */
let show3D = false;          // the View option
let sim3d = null;            // the 3D code, once loaded (js/sim-3d.js)
let view3d = null;           // the 3D picture
let loading3D = false;       // start3D has begun (false again if loading fails)
let stretch = 1;             // the Heights slider: 2 = twice as tall

// Show the picture from above, or the 3D one, and their options.
function showPictureKind() {
  simCanvas.hidden = show3D;
  byId("sim-3d").hidden = byId("view3d-buttons").hidden = !show3D;
  byId("view3d-options").hidden = !show3D;
  byId("flat-options").hidden = show3D;
  showZoomButtons(view);
  if (show3D && !view3d) start3D();
  drawSoon();
}

// Load the 3D code (the first time only) and make the 3D picture.
async function start3D() {
  if (loading3D) return;
  loading3D = true;
  showMessage("Loading the 3D view...");
  try {
    // The path is counted from this .js file (toysnsims/path-counting/), not the page.
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
  lookAlongDirection();
  showMessage("");
  drawSoon();
}

// Look from behind (0, 0) in the direction (a, b), as in your Desmos
// picture: each line a x + b y = k runs across the picture, so its bell
// curve is seen from the side.
function lookAlongDirection() {
  if (view3d) sim3d.resetCamera(view3d, [line.a, line.b]);
}

function draw3D() {
  if (!view3d) return;
  const balls = { x: [], y: [], height: [] };
  for (const point of points) {
    const h = heights[point.x + (N + 1) * point.y];
    balls.x.push(point.x);
    balls.y.push(point.y);
    balls.height.push(isNaN(h) ? 0 : h);
  }
  // The line on the floor, from its first point to its last.
  const ends = points.length < 2 ? []
    : [points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y];
  const red = hexToRGB(LINE_COLOR);
  sim3d.drawSurface(view3d, {
    size: N + 1, height: heights, show: byId("show-surface").checked, color: heatColor,
    balls: balls, ballColor: red, ground: hexToRGB(GROUND),
    lines: ends, lineColor: red, stretch: stretch,
  });
}

// After the window changes size, or the picture opens or closes as a
// full screen popup (js/sim-page.js): draw again at the new size.
window.addEventListener("resize", function () {
  if (view3d) sim3d.setHeight(view3d, pictureHeight(PICTURE_HEIGHT));
  drawSoon();
});


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
  byId("stat-axis").textContent = line.b === 0 ? "y" : "x";
  byId("stat-mean").textContent = reached ? stats.mean.toFixed(2) : "";
  byId("stat-sd").textContent = reached ? stats.sd.toFixed(2) : "";
  byId("stat-gap").textContent = reached ? stats.worstGap.toFixed(3) : "";
  drawLineChart(byId("line-chart"));
}

function drawLineChart(canvas) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (stats.reached === 0) {
    pen.fillText(stats.count === 0 ? "No grid points on this line." : "No path reaches this line.", 0, 14);
    return;
  }
  const first = stats.position[0], last = stats.position[stats.position.length - 1];
  const lo = Math.min(first, last) - 0.5, hi = Math.max(first, last) + 0.5;
  const left = 4, up = 14, bottom = h - 14;
  const across = function (t) { return left + (w - left) * (t - lo) / (hi - lo); };
  const height = function (s) { return bottom - (bottom - up) * Math.min(s, 1.05) / 1.05; };

  pen.fillText("1", 0, height(1) - 2);
  pen.fillText(shortLabel(Math.min(first, last)), 0, h - 2);
  const end = shortLabel(Math.max(first, last));
  pen.fillText(end, w - pen.measureText(end).width, h - 2);

  // The bars.
  const barWidth = Math.max(1, (w - left) / (hi - lo) * 0.8 * (stats.position.length > 1
    ? Math.abs(stats.position[1] - stats.position[0]) : 1));
  pen.fillStyle = CHART_LINE;
  stats.scaled.forEach(function (s, i) {
    const top = height(s);
    pen.fillRect(across(stats.position[i]) - barWidth / 2, top, barWidth, Math.max(1, bottom - top));
  });
  // The Gaussian, drawn smoothly over them.
  pen.beginPath();
  for (let k = 0; k <= 200; k++) {
    const t = lo + (hi - lo) * k / 200;
    if (k === 0) pen.moveTo(across(t), height(stats.gaussian(t)));
    else pen.lineTo(across(t), height(stats.gaussian(t)));
  }
  pen.strokeStyle = LINE_COLOR;
  pen.lineWidth = 1.5;
  pen.stroke();
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

// The grid size N: a new grid, and f again.
function useSize() {
  N = Number(byId("size").value);
  byId("size-label").textContent = "N = " + N + " (" + (N + 1) + " × " + (N + 1) + " points)";
  domain = boxDomain(N + 1, N + 1, 4, false);
  useTorus(view, false);
  fitLineRange();
}
byId("size").addEventListener("input", function () { useSize(); recount(); });
connectSeed(recount);

// The direction (a, b): whole numbers from -20 to 20, not both 0.
function useDirection() {
  line.a = readWhole("dir-a", -20, 20, 1);
  line.b = readWhole("dir-b", -20, 20, 1);
  if (line.a === 0 && line.b === 0) { line.b = 1; byId("dir-b").value = 1; }
  fitLineRange();
  lookAlongDirection();
  reshape();
}
byId("dir-a").addEventListener("change", useDirection);
byId("dir-b").addEventListener("change", useDirection);
byId("line-c").addEventListener("input", function () { line.c = Number(this.value); reshape(); });

for (const radio of document.querySelectorAll('input[name="heights"]')) radio.addEventListener("change", reshape);
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () { show3D = (radio.value === "3d"); showPictureKind(); });
}
byId("show-edges").addEventListener("change", drawSoon);
byId("show-surface").addEventListener("change", drawSoon);
function showStretch() {
  byId("stretch-label").textContent = stretch === 1 ? "normal"
    : (stretch > 1 ? stretch.toFixed(1) + " times taller" : (1 / stretch).toFixed(1) + " times flatter");
}
byId("stretch").addEventListener("input", function () {
  stretch = Math.pow(2, Number(this.value) / 2);
  showStretch();
  drawSoon();
});
byId("view3d-reset").addEventListener("click", lookAlongDirection);

// Start: your periodic rule on the 61 x 61 grid, the line x + y = 60.
useSize();
line.c = N;
byId("line-c").value = line.c;
showStretch();
showPictureKind();
usePreset("periodic");
