/* =====================================================================
   gomjau-hogg.js  —  the "Try a code" box of the GomJau-Hogg help page
   ---------------------------------------------------------------------
   Type a code, or pick an example, and see it built: on the left, one
   piece of the code at a time, with the points the next move can use
   numbered; on the right, the whole tiling. The code is read by
   js/sim-tilings.js, the same code the sims use: codeSteps gives the
   pieces, and tilingFromCode the tiling's repeating block.

   The file is split into sections:
     1. Settings
     2. Reading the code
     3. Drawing
     4. Connecting the buttons
   ===================================================================== */


/* =====================================================================
   1. SETTINGS
   ===================================================================== */

// The colors of the polygons, by their number of sides.
const SIDE_COLORS = { 3: "#f2c46d", 4: "#8fb8de", 6: "#a6d49f", 8: "#d9a7e3", 12: "#f2a88f" };
const LINE = "#22252b";       // the polygons' sides, and the + at the middle
const POINT = "#b3402f";      // the numbered points
const FADED = 0.4;            // polygons placed before this step are this solid
const ACROSS = 14;            // the tiling picture is this many side lengths across
const FIRST_CODE = "6-4-3/m30/r(c2)";   // the example on the page


/* =====================================================================
   2. READING THE CODE
   ===================================================================== */

let steps = [];       // the code a piece at a time (codeSteps, js/sim-tilings.js)
let at = 0;           // the piece shown on the left
let block = null;     // the tiling's repeating block (tilingFromCode), or null

// Read the code in the box: its pieces, its tiling, and the line under
// the box (its kinds of corner, or what is wrong). "showLast" shows the
// last piece (the one just typed); otherwise the first.
function readBox(showLast) {
  const code = byId("code").value.trim();
  const reading = codeSteps(code);
  steps = reading.steps;
  at = showLast ? Math.max(steps.length - 1, 0) : 0;
  block = null;
  let problem = reading.problem;
  if (!problem) {
    try { block = tilingFromCode(code); } catch (error) { problem = error.message; }
  }
  const message = byId("message");
  message.textContent = problem || "Its corners: " + block.vertexTypes.map(cornerShort).join(", ") + ".";
  message.classList.toggle("problem", Boolean(problem));
  showExample(code);
  showPiece();
  drawTiling();
}

// The examples menu shows the tiling with this code, if it has one.
function showExample(code) {
  const k = TILINGS.findIndex(function (tiling) { return tiling.code === code; });
  byId("examples").value = k === -1 ? "" : String(k);
}

// The point the move after the shown piece is around (like "h2"), or
// null if there is none.
function nextPoint() {
  const next = steps[at + 1];
  const match = next ? /\(([cvh]\d+)\)/.exec(next.text) : null;
  return match ? match[1] : null;
}

// Show piece "at": the points numbered are of the kind the next move
// uses, if it is around a point (you can pick another kind after).
function showPiece() {
  const next = nextPoint();
  if (next) document.querySelector('input[name="points"][value="' + next[0] + '"]').checked = true;
  showStep();
}


/* =====================================================================
   3. DRAWING
   ===================================================================== */

// Get a canvas ready to draw on: as big as its place on the page (and
// sharp on sharp screens), and empty. Returns its pen and its size in
// screen pixels.
function canvasPen(canvas) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, width, height);
  return { pen: pen, width: width, height: height };
}

// Where the point (u, w) of the plane goes on a canvas width x height,
// for a picture "scale" pixels per side length with the point "middle"
// of the plane in the middle of the canvas (y goes up the screen).
function placer(width, height, scale, middle) {
  return function (p) {
    return [width / 2 + (p[0] - middle[0]) * scale, height / 2 - (p[1] - middle[1]) * scale];
  };
}

// One polygon, from its corners, in its color (faded or not).
function drawPolygon(pen, place, sides, corners, faded) {
  pen.beginPath();
  corners.forEach(function (c, k) {
    const [x, y] = place(c);
    if (k === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
  });
  pen.closePath();
  pen.globalAlpha = faded ? FADED : 1;
  pen.fillStyle = SIDE_COLORS[sides];
  pen.fill();
  pen.globalAlpha = 1;
  pen.strokeStyle = LINE;
  pen.lineWidth = 1;
  pen.stroke();
}

// A + at the middle of the plane.
function drawMiddle(pen, place) {
  const [x, y] = place([0, 0]);
  pen.beginPath();
  pen.moveTo(x - 6, y); pen.lineTo(x + 6, y);
  pen.moveTo(x, y - 6); pen.lineTo(x, y + 6);
  pen.strokeStyle = LINE;
  pen.lineWidth = 2;
  pen.stroke();
}

// The left picture: the polygons after the shown piece of the code (the
// ones it added in full color, the older ones faded), and the points
// of the chosen kind, numbered. The point the next move uses gets a
// ring.
function showStep() {
  byId("step-back").disabled = at === 0;
  byId("step-on").disabled = at >= steps.length - 1;
  byId("step-label").textContent = steps.length === 0 ? ""
    : "Piece " + (at + 1) + " of " + steps.length + ": " + steps[at].text;
  const next = nextPoint();
  const { pen, width, height } = canvasPen(byId("step-picture"));
  if (steps.length === 0) return;

  // Fit every corner, and the middle of the plane, into the picture.
  const step = steps[at], before = at === 0 ? 0 : steps[at - 1].polygons.length;
  let left = 0, right = 0, bottom = 0, top = 0;
  for (const polygon of step.polygons) {
    for (const [u, w] of polygon.corners) {
      left = Math.min(left, u); right = Math.max(right, u);
      bottom = Math.min(bottom, w); top = Math.max(top, w);
    }
  }
  const scale = Math.min((width - 40) / (right - left), (height - 40) / (top - bottom));
  const place = placer(width, height, scale, [(left + right) / 2, (bottom + top) / 2]);

  step.polygons.forEach(function (polygon, k) { drawPolygon(pen, place, polygon.sides, polygon.corners, k < before); });
  drawMiddle(pen, place);
  const kind = checked("points");
  pen.font = "11px sans-serif";
  pen.textBaseline = "bottom";
  for (const point of step.points) {
    if (point.name[0] !== kind) continue;
    const [x, y] = place(point.at);
    pen.beginPath();
    pen.arc(x, y, 2.5, 0, 2 * Math.PI);
    pen.fillStyle = POINT;
    pen.fill();
    if (point.name === next) {
      pen.beginPath();
      pen.arc(x, y, 7, 0, 2 * Math.PI);
      pen.strokeStyle = POINT;
      pen.lineWidth = 2;
      pen.stroke();
    }
    pen.fillText(point.name, x + 3, y - 2);
  }
}

// The right picture: the tiling, ACROSS side lengths wide, with the
// middle of the plane in the middle. The repeating block sits at every
// i t1 + j t2; the blocks drawn are those that can reach the picture.
function drawTiling() {
  const { pen, width, height } = canvasPen(byId("tiling-picture"));
  if (!block) return;
  const scale = width / ACROSS, place = placer(width, height, scale, [0, 0]);
  const halfW = width / scale / 2 + 4, halfH = height / scale / 2 + 4;   // with room for big polygons
  const [t1, t2] = [block.t1, block.t2], det = t1[0] * t2[1] - t1[1] * t2[0];
  let iLow = Infinity, iHigh = -Infinity, jLow = Infinity, jHigh = -Infinity;
  for (const [u, w] of [[-halfW, -halfH], [halfW, -halfH], [-halfW, halfH], [halfW, halfH]]) {
    const i = (u * t2[1] - w * t2[0]) / det, j = (t1[0] * w - t1[1] * u) / det;
    iLow = Math.min(iLow, i); iHigh = Math.max(iHigh, i);
    jLow = Math.min(jLow, j); jHigh = Math.max(jHigh, j);
  }
  for (let i = Math.floor(iLow) - 1; i <= Math.ceil(iHigh) + 1; i++) {
    for (let j = Math.floor(jLow) - 1; j <= Math.ceil(jHigh) + 1; j++) {
      const shift = [i * t1[0] + j * t2[0], i * t1[1] + j * t2[1]];
      for (const cell of block.cells) {
        const corners = cell.corners.map(function (c) { return [c[0] + shift[0], c[1] + shift[1]]; });
        drawPolygon(pen, place, cell.sides, corners, false);
      }
    }
  }
  drawMiddle(pen, place);
}


/* =====================================================================
   4. CONNECTING THE BUTTONS
   ===================================================================== */

// Typing reads the code as you go, like a Desmos box.
byId("code").addEventListener("input", function () { readBox(true); });

// An example puts its code in the box.
addTilingOptions(byId("examples"));   // (js/sim-tilings.js)
byId("examples").addEventListener("change", function () {
  if (this.value === "") return;
  byId("code").value = TILINGS[Number(this.value)].code;
  readBox(false);
});

// The arrows step through the pieces of the code.
byId("step-back").addEventListener("click", function () { at = Math.max(at - 1, 0); showPiece(); });
byId("step-on").addEventListener("click", function () { at = Math.min(at + 1, steps.length - 1); showPiece(); });
for (const radio of document.querySelectorAll('input[name="points"]')) radio.addEventListener("change", showStep);

window.addEventListener("resize", function () { showStep(); drawTiling(); });

// Start with the example on the page, at its first piece.
byId("code").value = FIRST_CODE;
readBox(false);
