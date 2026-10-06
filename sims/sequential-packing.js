/* =====================================================================
   sequential-packing.js  —  the "Random sequential packing" sim page
   ---------------------------------------------------------------------
   The math lives in sequential-packing-growth.js and runs in a second
   thread (a Web Worker), so the page never freezes. This file does
   everything else:
     1. The starting shapes (presets)
     2. The state of the page
     3. Reading the formulas, with sliders
     4. Talking to the worker
     5. How many attempts are shown, Play and speed
     6. Drawing the packing
     6b. Moving and zooming the picture
     7. Statistics and charts
     8. Pointing at a tile
     9. Connecting the buttons
   It uses the shared helpers in js/sim-page.js (byId, startWorker,
   chartPen, ...), the colors in js/sim-domains.js (defaultColor) and
   the formula reading and sliders in js/formulas.js.
   ===================================================================== */


/* =====================================================================
   1. THE STARTING SHAPES (PRESETS)
   ---------------------------------------------------------------------
   Each preset fills in the three formulas, the window and (if it has
   any) sliders. Formulas are written the way you'd type them.
   ===================================================================== */
const UNIT_SQUARE = "max(abs(x), abs(y)) <= 1";
const UNIT_DISK = "x^2 + y^2 <= 1";
const PRESETS = {
  "gasket":          { S: UNIT_DISK, T: UNIT_DISK, f: "1", window: [-1.05, 1.05, -1.05, 1.05] },
  "s-model":         { S: UNIT_DISK, T: UNIT_DISK, f: "(x^2 + y^2)^((1/s - 2)/2)", window: [-1.05, 1.05, -1.05, 1.05],
                       sliders: { s: { value: 0.5, min: 0.05, max: 3, step: 0.05 } } },
  "squares":         { S: UNIT_SQUARE, T: UNIT_SQUARE, f: "1", window: [-1.05, 1.05, -1.05, 1.05] },
  "disks-in-square": { S: UNIT_SQUARE, T: UNIT_DISK, f: "1", window: [-1.05, 1.05, -1.05, 1.05] },
  "stars":           { S: "(x^2 + y^2 - 0.8)^3 - x^2 y^3 <= 0", T: "sqrt(x^2 + y^2) <= 0.6 + 0.3 cos(5 atan2(y, x))",
                       f: "1", window: [-1.3, 1.3, -1.3, 1.3] },
};

// Play speeds, in attempts per second. The sim starts paused, at 10.
const SPEEDS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
const START_SPEED = 2;
const MOST_ATTEMPTS = 1000000;
const PALETTE = 12;               // colors used for the tiles (the old site's colors)
const MAX_PICTURE_HEIGHT = 700;   // pixels


/* =====================================================================
   2. THE STATE OF THE PAGE
   ===================================================================== */
const simCanvas = byId("sim-canvas");
let worker = null;
let run = 0;                  // numbers each setup sent to the worker
let setupBusy = false;        // a setup is being worked on by the worker
let setupWaiting = false;     // another one is wanted after it
let fresh = false;            // a new setup's tiles are coming in, but the old picture still shows
let clicks = {};              // attempt n -> [x, y]: centers you clicked (section 8b)

let sliders = {};             // letter -> { value, min, max, step }
let formulas = null;          // the three formulas, ready for the worker: { S, T, f }
let windowBox = { xmin: -1.05, xmax: 1.05, ymin: -1.05, ymax: 1.05 };

// What the worker sent back.
let info = null;              // facts about S and T (area, convex and symmetric, ...)
let segments = [];            // the edge of S: 4 numbers per segment
let tileShape = null;         // T's polygon as a Path2D (a drawable shape), size 1, centered at 0
let shapeX = [], shapeY = [], shapeReach = 1;   // its corners, and how far it reaches
let tiles = { count: 0, cx: [], cy: [], r: [], parent: [], generation: [], attempt: [] };
let computed = 0;             // attempts the worker has done in this run
let ceilingMisses = 0;

// What is shown: the tiles placed in the first "wanted" attempts (as far
// as the worker has got).
let wanted = 0;
let shown = 0;                // tiles drawn: tiles 0 .. shown-1
let children = [];            // children[k] among the shown tiles
let edgeChildren = 0;
let coveredArea = 0, biggestGeneration = 0, biggestDegree = 0;

let playing = false;
let speedIndex = START_SPEED;


/* =====================================================================
   3. READING THE FORMULAS, WITH SLIDERS
   ---------------------------------------------------------------------
   Each formula is read by readTree (js/formulas.js): "=" means equals
   and "xy" means x times y, as in Desmos. Every letter other than x
   and y gets a slider (shared by all three formulas). The typeset
   preview comes from KaTeX.
   ===================================================================== */
const FORMULA_NAMES = ["S", "T", "f"];

function readFormulas() {
  const trees = {};
  for (const name of FORMULA_NAMES) {
    const text = byId("formula-" + name).value.trim();
    try {
      if (text === "") throw new Error("it is empty.");
      trees[name] = readTree(text);
    } catch (problem) {
      // Usually just a half-typed formula: keep the last good packing.
      byId("formula-message").textContent = "Can't read " + name + " yet: " + problem.message;
      return;
    }
    if (window.katex) {
      katex.render(trees[name].toTex({ parenthesis: "keep", implicit: "hide" }), byId("preview-" + name),
                   { throwOnError: false });
    }
  }
  byId("formula-message").textContent = "";

  // One slider per letter, in the order the letters first appear.
  const letters = [];
  for (const name of FORMULA_NAMES) {
    for (const letter of sliderLetters(trees[name])) if (!letters.includes(letter)) letters.push(letter);
  }
  const holder = byId("sliders");
  holder.innerHTML = "";
  for (const letter of letters) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], sendSetup));
  }

  // The worker gets each formula written out with every "*" shown, so it
  // reads exactly what the preview shows.
  formulas = {};
  for (const name of FORMULA_NAMES) formulas[name] = trees[name].toString({ implicit: "show" });
  sendSetup();
}

// Fill in a preset's formulas, window and sliders.
function usePreset(key) {
  const p = PRESETS[key];
  forgetClicks();
  byId("formula-S").value = p.S;
  byId("formula-T").value = p.T;
  byId("formula-f").value = p.f;
  [windowBox.xmin, windowBox.xmax, windowBox.ymin, windowBox.ymax] = p.window;
  resetZoom();
  showWindow();
  for (const letter in p.sliders || {}) sliders[letter] = Object.assign({}, p.sliders[letter]);
  readFormulas();
}

// The small pictures of S and T that pop up by their formulas (the CSS
// in css/style.css shows them). They show the shapes the worker last
// read, so a half-typed formula keeps the last good picture.
const PREVIEW_SIZE = 120;   // CSS pixels, as in css/style.css
function drawPreview() {
  const ratio = window.devicePixelRatio || 1, size = PREVIEW_SIZE * ratio, margin = 8 * ratio;
  for (const name of ["S", "T"]) {
    const canvas = byId("picture-" + name);
    canvas.width = size; canvas.height = size;
    const p = canvas.getContext("2d");
    p.strokeStyle = CHART_LINE; p.fillStyle = CHART_LINE; p.lineWidth = 1.5 * ratio;
    if (name === "S") {
      // The edge of S, with the window fitted into the picture.
      const k = (size - 2 * margin) / Math.max(windowBox.xmax - windowBox.xmin, windowBox.ymax - windowBox.ymin);
      const cx = (windowBox.xmin + windowBox.xmax) / 2, cy = (windowBox.ymin + windowBox.ymax) / 2;
      p.beginPath();
      for (let i = 0; i < segments.length; i += 4) {
        p.moveTo(size / 2 + (segments[i] - cx) * k, size / 2 - (segments[i + 1] - cy) * k);
        p.lineTo(size / 2 + (segments[i + 2] - cx) * k, size / 2 - (segments[i + 3] - cy) * k);
      }
      p.stroke();
    } else {
      // T's polygon, filled, as big as fits, with its center (0, 0) in the middle.
      const k = (size / 2 - margin) / shapeReach;
      p.setTransform(k, 0, 0, -k, size / 2, size / 2);
      p.fill(tileShape);
    }
  }
}

function showWindow() {
  byId("window-xmin").value = windowBox.xmin; byId("window-xmax").value = windowBox.xmax;
  byId("window-ymin").value = windowBox.ymin; byId("window-ymax").value = windowBox.ymax;
}

// Read the window boxes; keep the old window if they don't make sense.
function readWindow() {
  const box = {};
  for (const side of ["xmin", "xmax", "ymin", "ymax"]) box[side] = Number(byId("window-" + side).value);
  if (Object.values(box).every(isFinite) && box.xmin < box.xmax && box.ymin < box.ymax) {
    windowBox = box;
    resetZoom();
    sendSetup();
  } else {
    byId("formula-message").textContent = "The window needs x from < x to, and y from < y to.";
  }
}


/* =====================================================================
   4. TALKING TO THE WORKER
   ---------------------------------------------------------------------
   The worker is made from packingWorker() and packingCore() (both in
   sequential-packing-growth.js). A setup takes the worker a moment
   (it traces the edge of S), so while one is being worked on, newer
   changes wait, and only the latest is sent after it.

   To keep dragging a slider smooth, the old picture stays up while the
   new tiles come in ("fresh"), and the new picture replaces it in one
   go, once the worker has caught up with n (or after FRESH_WAIT
   milliseconds, if n is so big that catching up takes a while). Only
   then is the next waiting change sent. So the picture never flashes
   empty and fills back in.
   ===================================================================== */
function startTheWorker() {
  try {
    worker = startWorker(packingWorker, [packingCore]);
  } catch (error) {
    showMessage("The sim couldn't start a second thread in this browser.");
    return;
  }
  worker.onmessage = fromWorker;
  worker.onerror = function () {
    showMessage("The sim couldn't start. It loads two small libraries (math.js and seedrandom) " +
                "from cdn.jsdelivr.net; check the internet connection and reload.");
  };
}

const FRESH_WAIT = 250;

function sendSetup() {
  if (!worker || !formulas) return;
  if (setupBusy) { setupWaiting = true; return; }
  setupBusy = true;
  run++;
  const values = {};
  for (const letter in sliders) values[letter] = sliders[letter].value;
  worker.postMessage({
    type: "setup", run: run, S: formulas.S, T: formulas.T, f: formulas.f, values: values,
    window: windowBox, seed: byId("seed").value, clicks: clicks, target: wanted,
  });
}

function fromWorker(event) {
  const m = event.data;
  if (m.run !== run) return;            // from an older setup
  if (m.type === "error") {
    byId("formula-message").textContent = "Problem: " + m.message;
    fresh = false;
    setupDone();
  } else if (m.type === "ready") {
    info = m.info;
    segments = m.segments;
    shapeX = m.shapeX; shapeY = m.shapeY;
    shapeReach = Math.max(...shapeX.map(function (x, k) { return Math.hypot(x, shapeY[k]); }));
    tileShape = new Path2D();
    for (let k = 0; k < shapeX.length; k++) tileShape.lineTo(shapeX[k], shapeY[k]);
    tileShape.closePath();
    for (const key in tiles) tiles[key] = key === "count" ? 0 : [];
    computed = 0;
    ceilingMisses = 0;
    byId("formula-message").textContent = info.exactTiles ? "" :
      "T is not convex and symmetric, so each tile takes longer to place (the result is still exact).";
    if (info.negativeF) byId("formula-message").textContent += " f is negative somewhere; it counts as 0 there.";
    drawPreview();
    fresh = true;                       // keep the old picture until the new one catches up
    const thisRun = run;
    setTimeout(function () { if (fresh && run === thisRun) showFresh(); }, FRESH_WAIT);
  } else if (m.type === "clicked") {
    clickedBack(m);
  } else if (m.type === "tiles") {
    for (const key of ["cx", "cy", "r", "parent", "generation", "attempt"]) {
      for (const v of m[key]) tiles[key].push(v);
    }
    tiles.count = tiles.r.length;
    computed = m.attempts;
    ceilingMisses = m.ceilingMisses;
    if (!fresh) drawNew();
    else if (computed >= wanted) showFresh();
  }
}

// Swap in the new picture, all at once.
function showFresh() {
  fresh = false;
  drawAll();
  setupDone();
}

// The worker has finished a setup: send the latest waiting change, if any.
function setupDone() {
  setupBusy = false;
  if (setupWaiting) { setupWaiting = false; sendSetup(); }
}


/* =====================================================================
   5. HOW MANY ATTEMPTS ARE SHOWN, PLAY AND SPEED
   ---------------------------------------------------------------------
   "wanted" is the number of attempts asked for (the n box and slider).
   The worker works until it has done that many; the picture shows the
   tiles of the attempts done so far. Lowering n just hides the last
   tiles (they are kept, so raising n again is instant).
   ===================================================================== */
function setWanted(n) {
  n = Math.max(0, Math.min(MOST_ATTEMPTS, Math.round(n)));
  const lower = n < wanted;
  wanted = n;
  byId("set-attempts").value = n;
  byId("attempts-slider").value = n > 0 ? Math.log10(n) : 0;
  if (worker && n > computed) worker.postMessage({ type: "target", target: n });
  if (lower) drawAll(); else drawNew();
}

// Play adds attempts at the chosen speed, once per screen refresh.
let lastFrame = 0, owed = 0;
function playFrame(time) {
  if (!playing) return;
  if (lastFrame > 0) {
    owed += SPEEDS[speedIndex] * Math.min(0.1, (time - lastFrame) / 1000);
    const whole = Math.floor(owed);
    owed -= whole;
    // Don't run far ahead of the worker: the picture can only show what it has done.
    if (whole > 0 && wanted - computed < 2 * SPEEDS[speedIndex]) setWanted(wanted + whole);
  }
  lastFrame = time;
  if (wanted >= MOST_ATTEMPTS) setPlaying(false); else requestAnimationFrame(playFrame);
}

function setPlaying(on) {
  playing = on;
  byId("play").textContent = on ? "Pause" : "Play";
  lastFrame = 0; owed = 0;
  if (on) requestAnimationFrame(playFrame);
}

function showSpeed() {
  byId("speed").value = speedIndex;
  byId("speed-label").textContent = SPEEDS[speedIndex].toLocaleString() + " attempts/s";
}


/* =====================================================================
   6. DRAWING THE PACKING
   ---------------------------------------------------------------------
   The window is drawn to fill the picture's width. Tiles never move
   once placed, and never overlap, so new tiles are simply drawn on top
   (drawNew); the whole picture is redrawn (drawAll) only when n goes
   down, the colors change, the picture is moved or zoomed (section
   6b), or the page is resized. Each tile is T's polygon, scaled by R
   and moved to C.

   Zoomed in, the picture shows a smaller part of the window, around the
   point "look" (in x and y), "zoom" times bigger. Zoom 1 with "look" at
   the middle of the window shows the whole window, as at the start.
   Tiles smaller than a pixel are skipped, so zooming in shows tiles
   that were too small to see before.
   ===================================================================== */
let pen = null, scale = 1;    // scale: canvas pixels per unit of x and y (with the zoom)
let zoom = 1;                 // 2 = everything twice as big
let look = { x: 0, y: 0 };    // the point of the plane in the middle of the picture

function sizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = simCanvas.clientWidth;
  const aspect = (windowBox.ymax - windowBox.ymin) / (windowBox.xmax - windowBox.xmin);
  // (Taller in the full screen popup: pictureHeight, in js/sim-page.js.)
  const height = pictureHeight(Math.min(MAX_PICTURE_HEIGHT, Math.round(width * aspect)));
  simCanvas.style.height = height + "px";
  simCanvas.width = Math.round(width * ratio);
  simCanvas.height = Math.round(height * ratio);
  scale = zoom * Math.min(simCanvas.width / (windowBox.xmax - windowBox.xmin),
                          simCanvas.height / (windowBox.ymax - windowBox.ymin));
  pen = simCanvas.getContext("2d");
}

// Canvas pixels for the point (x, y), and back: the point (x, y) at
// canvas pixel (px, py). ("look" is in the middle of the canvas.)
function pixelX(x) { return simCanvas.width / 2 + (x - look.x) * scale; }
function pixelY(y) { return simCanvas.height / 2 - (y - look.y) * scale; }
function pointX(px) { return look.x + (px - simCanvas.width / 2) / scale; }
function pointY(py) { return look.y - (py - simCanvas.height / 2) / scale; }

// Which of the PALETTE colors tile k gets (section 9 of the page sets "colorBy").
function colorOf(k) {
  let b;
  const colorBy = byId("color-by").value;
  if (colorBy === "generation") b = (tiles.generation[k] - 1) % PALETTE;
  else if (colorBy === "degree") b = Math.floor(2 * Math.log2(children[k] + 1));        // degree = children + 1
  else if (colorBy === "size") b = Math.floor(-0.7 * Math.log2(2 * tiles.r[k] / (windowBox.xmax - windowBox.xmin)));
  else b = Math.floor(2 * Math.log10(tiles.attempt[k]));
  return defaultColor(Math.max(0, Math.min(PALETTE - 1, b)), PALETTE);
}

function drawTile(k) {
  const r = tiles.r[k] * scale;
  if (r * shapeReach < 0.15) return;                 // smaller than a pixel: invisible anyway
  const px = pixelX(tiles.cx[k]), py = pixelY(tiles.cy[k]), reach = r * shapeReach;
  if (px + reach < 0 || px - reach > simCanvas.width || py + reach < 0 || py - reach > simCanvas.height) return;   // off the picture
  pen.setTransform(r, 0, 0, -r, px, py);
  pen.fillStyle = colorOf(k);
  pen.fill(tileShape);
}

// Start again from an empty picture, and draw every tile that is shown.
function drawAll() {
  if (fresh) return;                  // the old picture stays until the new one is ready
  sizeCanvas();
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, simCanvas.width, simCanvas.height);
  // The edge of S.
  pen.strokeStyle = CHART_TEXT;
  pen.lineWidth = Math.max(1, (window.devicePixelRatio || 1));
  pen.beginPath();
  for (let i = 0; i < segments.length; i += 4) {
    pen.moveTo(pixelX(segments[i]), pixelY(segments[i + 1]));
    pen.lineTo(pixelX(segments[i + 2]), pixelY(segments[i + 3]));
  }
  pen.stroke();
  shown = 0;
  children = []; edgeChildren = 0;
  coveredArea = 0; biggestGeneration = 0; biggestDegree = 0;
  drawNew();
}

// Draw the tiles placed since the last drawing, up to attempt "wanted".
function drawNew() {
  if (fresh) return;
  if (!tileShape || !pen) return showStatsSoon();
  const degreeColors = byId("color-by").value === "degree";
  while (shown < tiles.count && tiles.attempt[shown] <= wanted) {
    const k = shown++;
    children.push(0);
    const p = tiles.parent[k];
    if (p < 0) edgeChildren++;
    else {
      children[p]++;
      biggestDegree = Math.max(biggestDegree, children[p] + 1);
      if (degreeColors) drawTile(p);              // its color changed (tiles never overlap, so this is safe)
    }
    biggestDegree = Math.max(biggestDegree, edgeChildren, 1);
    biggestGeneration = Math.max(biggestGeneration, tiles.generation[k]);
    coveredArea += tiles.r[k] * tiles.r[k] * info.areaT;
    drawTile(k);
  }
  showStatsSoon();
}

window.addEventListener("resize", drawAll);


/* =====================================================================
   6b. MOVING AND ZOOMING THE PICTURE
   ---------------------------------------------------------------------
   As in the other sims (and like a graph in Desmos):
     drag                         move it
     mouse wheel, or pinch        zoom in or out, around the pointer
     the + / − / Reset buttons    zoom in, zoom out, show the whole window
     click (without dragging)     add a tile there (section 8b)
   The cell sims share this in js/sim-view.js; this sim draws shapes
   instead of cells, so it has its own short version. Each move or zoom
   redraws the whole picture, at most once per screen refresh.
   ("Pointer" events cover the mouse, a pen and fingers alike.)
   ===================================================================== */
const MAX_ZOOM = 1e6;          // a million times closer: deep into the small tiles
const ZOOM_STEP = 1.5;         // one click on + or −
let redrawPending = false;
const pointers = new Map();    // the pointers pressed on the picture: id -> {x, y}

function redrawSoon() {
  if (redrawPending) return;
  redrawPending = true;
  requestAnimationFrame(function () { redrawPending = false; drawAll(); });
}

// Back to the whole window (also when the window changes).
function resetZoom() {
  zoom = 1;
  look = { x: (windowBox.xmin + windowBox.xmax) / 2, y: (windowBox.ymin + windowBox.ymax) / 2 };
}

// Zoom by "factor" around the canvas pixel (px, py): the point under it
// stays under it. Zoom stays between 1 (the whole window) and MAX_ZOOM.
function zoomAround(factor, px, py) {
  const x = pointX(px), y = pointY(py);
  const newZoom = Math.min(Math.max(zoom * factor, 1), MAX_ZOOM);
  scale *= newZoom / zoom;
  zoom = newZoom;
  look.x = x - (px - simCanvas.width / 2) / scale;
  look.y = y + (py - simCanvas.height / 2) / scale;
  if (zoom === 1) resetZoom();
  redrawSoon();
}

// Canvas pixels for a pointer event (the canvas has more pixels than
// screen pixels on sharp screens).
function canvasSpot(event) {
  const box = simCanvas.getBoundingClientRect(), ratio = simCanvas.width / box.width;
  return { x: (event.clientX - box.left) * ratio, y: (event.clientY - box.top) * ratio };
}

simCanvas.addEventListener("wheel", function (event) {
  event.preventDefault();                                  // don't scroll the page
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : 1);   // some mice count lines
  const spot = canvasSpot(event);
  zoomAround(Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.002)), spot.x, spot.y);
}, { passive: false });   // "passive: false" lets preventDefault stop the page scrolling

byId("zoom-in").addEventListener("click", function () { zoomAround(ZOOM_STEP, simCanvas.width / 2, simCanvas.height / 2); });
byId("zoom-out").addEventListener("click", function () { zoomAround(1 / ZOOM_STEP, simCanvas.width / 2, simCanvas.height / 2); });
byId("zoom-reset").addEventListener("click", function () { resetZoom(); redrawSoon(); });

// Dragging with one pointer moves the picture; two fingers also zoom as
// they spread apart or pinch together.
simCanvas.style.touchAction = "none";      // on phones, a finger drags the picture, not the page
let press = null;              // where a single pointer went down, to tell a click from a drag
simCanvas.addEventListener("pointerdown", function (event) {
  pointers.set(event.pointerId, canvasSpot(event));
  press = pointers.size === 1 ? canvasSpot(event) : null;   // two fingers: never a click
  simCanvas.setPointerCapture(event.pointerId);   // keep getting moves even off the canvas
  simCanvas.style.cursor = "grabbing";
});
simCanvas.addEventListener("pointermove", function (event) {
  if (!pointers.has(event.pointerId)) { simCanvas.style.cursor = "grab"; return; }
  const before = middleOfPointers();
  pointers.set(event.pointerId, canvasSpot(event));
  const after = middleOfPointers();
  if (zoom > 1) {
    look.x -= (after.x - before.x) / scale;
    look.y += (after.y - before.y) / scale;
  }
  if (pointers.size >= 2 && before.apart > 0) zoomAround(after.apart / before.apart, after.x, after.y);
  else if (zoom > 1) redrawSoon();          // at zoom 1 the whole window shows: nothing to move
});
function releasePointer(event) {
  // A click: one pointer that went up close to where it went down.
  const spot = canvasSpot(event), ratio = window.devicePixelRatio || 1;
  if (event.type === "pointerup" && press && pointers.size === 1 &&
      Math.hypot(spot.x - press.x, spot.y - press.y) < 5 * ratio) clickAt(pointX(spot.x), pointY(spot.y));
  press = null;
  pointers.delete(event.pointerId);
  if (pointers.size === 0) simCanvas.style.cursor = "grab";
}
simCanvas.addEventListener("pointerup", releasePointer);
simCanvas.addEventListener("pointercancel", releasePointer);

// The point between the pressed pointers, and how far apart they are
// (0 for one pointer).
function middleOfPointers() {
  const p = Array.from(pointers.values());
  if (p.length === 1) return { x: p[0].x, y: p[0].y, apart: 0 };
  return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2,
           apart: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
}


/* =====================================================================
   7. STATISTICS AND CHARTS
   ---------------------------------------------------------------------
   The numbers are kept up to date by drawNew (section 6). The charts
   are redrawn at most a few times a second. They get their canvas
   ready, and their colors, from js/sim-page.js.
   ===================================================================== */
let statsTimer = null;
function showStatsSoon() {
  if (statsTimer === null) statsTimer = setTimeout(function () { statsTimer = null; showStats(); }, 200);
}

function showStats() {
  const done = Math.min(wanted, computed);
  byId("stat-attempts").textContent = done.toLocaleString() + (computed < wanted ? " (working on " + wanted.toLocaleString() + ")" : "");
  byId("stat-tiles").textContent = shown.toLocaleString();
  byId("stat-covered").textContent = info ? (100 * coveredArea / info.areaS).toFixed(2) + "%" : "";
  byId("stat-generation").textContent = biggestGeneration;
  byId("stat-degree").textContent = biggestDegree;
  byId("stat-edge").textContent = edgeChildren;
  showMessage(ceilingMisses > 0
    ? "f went above its estimated ceiling " + ceilingMisses + " times (near a point where f is very large), " +
      "so the centers there are slightly off."
    : "");

  // Tiles placed against attempts: (attempt of tile k, k + 1), at most
  // ~400 points spread evenly on the log scale.
  const placed = [];
  for (const k of logSpaced(shown)) placed.push([tiles.attempt[k], k + 1]);
  if (shown > 0) placed.push([done, shown]);
  logLogChart(byId("placed-chart"), [{ points: placed }]);

  // Records as tiles are placed: the largest generation and largest
  // degree among the first k tiles, against k.
  const generations = [], degrees = [], count = new Array(shown).fill(0);
  let topGeneration = 0, topDegree = 0, edge = 0;
  for (let k = 0; k < shown; k++) {
    const p = tiles.parent[k];
    let degree;
    if (p < 0) degree = ++edge; else degree = ++count[p] + 1;
    if (tiles.generation[k] > topGeneration) { topGeneration = tiles.generation[k]; generations.push([k + 1, topGeneration]); }
    if (degree > topDegree) { topDegree = degree; degrees.push([k + 1, topDegree]); }
  }
  if (shown > 0) { generations.push([shown, topGeneration]); degrees.push([shown, topDegree]); }
  logLogChart(byId("records-chart"), [{ points: generations }, { points: degrees, dots: true }]);

  // R_k against k.
  const radii = [];
  for (const k of logSpaced(shown)) radii.push([k + 1, tiles.r[k]]);
  logLogChart(byId("radii-chart"), [{ points: radii, dots: true }]);

  // How many tiles have 0, 1, 2, ... children (the last bar: that many or more).
  const most = 20, bars = new Array(most + 1).fill(0);
  for (let k = 0; k < shown; k++) bars[Math.min(most, children[k])]++;
  barChart(byId("children-chart"), bars);
}

// At most about 400 of the numbers 0 .. n-1, spread evenly on a log scale.
function logSpaced(n) {
  const picked = [];
  let last = -1;
  for (let i = 0; i < 400 && n > 0; i++) {
    const k = Math.min(n - 1, Math.floor(Math.pow(n, i / 399)) - 1);
    if (k > last) { picked.push(k); last = k; }
  }
  return picked;
}

// A small chart with both axes on log scales. Each series is
// { points: [[x, y], ...], dots: true/false }: a line, or dots.
function logLogChart(canvas, series) {
  const p = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight, left = 44, bottom = h - 14, top = 4;
  const all = series.flatMap(function (s) { return s.points; }).filter(function (q) { return q[0] > 0 && q[1] > 0; });
  if (all.length < 2) return;
  const lx = all.map(function (q) { return Math.log10(q[0]); }), ly = all.map(function (q) { return Math.log10(q[1]); });
  const x0 = Math.min(...lx), x1 = Math.max(...lx, x0 + 1e-9), y0 = Math.min(...ly), y1 = Math.max(...ly, y0 + 1e-9);
  function sx(x) { return left + (w - left - 4) * (Math.log10(x) - x0) / (x1 - x0); }
  function sy(y) { return bottom - (bottom - top) * (Math.log10(y) - y0) / (y1 - y0); }
  // Axis labels: the smallest and largest values.
  p.fillText(shortNumber(Math.pow(10, y1)), 0, top + 9);
  p.fillText(shortNumber(Math.pow(10, y0)), 0, bottom);
  p.fillText(shortNumber(Math.pow(10, x0)), left, h - 2);
  const right = shortNumber(Math.pow(10, x1));
  p.fillText(right, w - p.measureText(right).width, h - 2);
  p.strokeStyle = CHART_LINE; p.fillStyle = CHART_LINE; p.lineWidth = 1.5;
  for (const s of series) {
    const points = s.points.filter(function (q) { return q[0] > 0 && q[1] > 0; });
    if (s.dots) {
      for (const q of points) p.fillRect(sx(q[0]) - 1, sy(q[1]) - 1, 2.5, 2.5);
    } else {
      p.beginPath();
      points.forEach(function (q, i) { if (i === 0) p.moveTo(sx(q[0]), sy(q[1])); else p.lineTo(sx(q[0]), sy(q[1])); });
      p.stroke();
    }
  }
}

// A small bar chart of counts (bar i: count[i]; the last bar is "or more").
function barChart(canvas, counts) {
  const p = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight, top = 12, bottom = h - 14;
  const biggest = Math.max(1, ...counts), barWidth = w / counts.length;
  p.fillText(biggest.toLocaleString(), 0, 9);
  p.fillText("0", 0, h - 2);
  const last = (counts.length - 1) + "+";
  p.fillText(last, w - p.measureText(last).width, h - 2);
  p.fillStyle = CHART_LINE;
  counts.forEach(function (c, i) {
    const barHeight = (bottom - top) * c / biggest;
    if (c > 0) p.fillRect(i * barWidth + 1, bottom - Math.max(1, barHeight), Math.max(1, barWidth - 2), Math.max(1, barHeight));
  });
}

// 0.000123 -> "1.2e-4", 12345 -> "12,345".
function shortNumber(v) {
  if (v >= 1 && v < 1e7) return Math.round(v).toLocaleString();
  return v.toExponential(1);
}


/* =====================================================================
   8. POINTING AT A TILE
   ---------------------------------------------------------------------
   Moving the mouse over the picture shows the numbers of the tile under
   it. A point is in tile k if, moved and scaled back to T's own size,
   it is inside T's polygon (counted by the usual "ray crossing" test:
   a ray from the point crosses the polygon's edge an odd number of
   times exactly when the point is inside).
   ===================================================================== */
const HOVER_HINT = "Point at a tile to see its numbers. Click an empty spot to add a tile there.";

function insideShape(u, v) {
  let inside = false;
  for (let i = 0, j = shapeX.length - 1; i < shapeX.length; j = i++) {
    if ((shapeY[i] > v) !== (shapeY[j] > v) &&
        u < (shapeX[j] - shapeX[i]) * (v - shapeY[i]) / (shapeY[j] - shapeY[i]) + shapeX[i]) inside = !inside;
  }
  return inside;
}

// The shown tile that the point (x, y) is in, or -1 for none.
function tileAt(x, y) {
  for (let k = 0; k < shown; k++) {
    const r = tiles.r[k];
    if (Math.abs(x - tiles.cx[k]) > r * shapeReach || Math.abs(y - tiles.cy[k]) > r * shapeReach) continue;
    if (insideShape((x - tiles.cx[k]) / r, (y - tiles.cy[k]) / r)) return k;
  }
  return -1;
}

simCanvas.addEventListener("mousemove", function (event) {
  if (!tileShape || fresh) return;
  const spot = canvasSpot(event);
  const k = tileAt(pointX(spot.x), pointY(spot.y));
  if (k >= 0) {
    const p = tiles.parent[k];
    byId("hover-info").textContent = "Tile " + (k + 1).toLocaleString() + " (attempt " + tiles.attempt[k].toLocaleString() +
      "): R = " + tiles.r[k].toPrecision(4) + ", parent: " + (p < 0 ? "the edge of S" : "tile " + (p + 1).toLocaleString()) +
      ", generation " + tiles.generation[k] + ", degree " + (children[k] + 1) + ".";
    return;
  }
  byId("hover-info").textContent = HOVER_HINT;
});


/* =====================================================================
   8b. CLICK TO ADD A TILE
   ---------------------------------------------------------------------
   Clicking the picture uses the clicked point as the center of the
   next attempt, as if the random process had picked it: the tile grows
   there until it touches the edge of S or another tile. If the point
   is inside a tile or outside S, nothing happens.

   The clicked points are kept (attempt n -> [x, y]) and sent with
   every setup, so a clicked tile stays when you move a slider or
   change a formula; there it grows as big as the new shapes allow.
   Restart, a new seed or a new preset forgets them.
   ===================================================================== */
const NO_ROOM = "No room for a tile there: that point is inside a tile or outside S.";

// "redo" is true to skip the quick way (see clickedBack).
function clickAt(x, y, redo) {
  if (!worker || fresh || !info) return;
  if (tileAt(x, y) >= 0) { byId("hover-info").textContent = NO_ROOM; return; }
  if (computed === wanted && !redo) {
    // The usual case: the worker is exactly at attempt n, so it just
    // tries the point as attempt n + 1 (and answers in clickedBack).
    worker.postMessage({ type: "click", x: x, y: y, at: wanted });
  } else {
    // n was lowered (or the worker is still catching up): the point
    // becomes attempt n + 1, and the packing is redone from the start.
    clicks[wanted + 1] = [x, y];
    setPlaying(false);
    setWanted(wanted + 1);
    sendSetup();
  }
}

// The worker's answer to a click.
function clickedBack(m) {
  if (m.placed) {
    clicks[m.at + 1] = [m.x, m.y];
    setWanted(m.at + 1);
  } else if (m.ready) {
    byId("hover-info").textContent = NO_ROOM;
  } else {
    clickAt(m.x, m.y, true);   // the worker had moved on (say, Play was on): redo the packing with it
  }
}

function forgetClicks() { clicks = {}; }


/* =====================================================================
   9. CONNECTING THE BUTTONS
   ===================================================================== */
byId("preset").addEventListener("change", function () { usePreset(byId("preset").value); });
for (const name of FORMULA_NAMES) {
  byId("formula-" + name).addEventListener("input", function () {
    byId("preset").value = "custom";
    readFormulas();
  });
}
for (const side of ["xmin", "xmax", "ymin", "ymax"]) byId("window-" + side).addEventListener("change", readWindow);

byId("set-attempts").addEventListener("change", function () { setWanted(Number(byId("set-attempts").value) || 0); });
byId("attempts-slider").addEventListener("input", function () {
  const v = Number(byId("attempts-slider").value);
  setWanted(v === 0 ? 0 : Math.pow(10, v));
});
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () { setPlaying(false); setWanted(Math.min(wanted, computed) + 1); });
byId("restart").addEventListener("click", function () {
  setPlaying(false);
  setWanted(0);
  if (Object.keys(clicks).length > 0) { forgetClicks(); sendSetup(); }
});
byId("speed").max = SPEEDS.length - 1;
byId("speed").addEventListener("input", function () { speedIndex = Number(byId("speed").value); showSpeed(); });
byId("seed").addEventListener("change", function () { forgetClicks(); sendSetup(); });
byId("new-seed").addEventListener("click", function () {
  byId("seed").value = String(Math.floor(Math.random() * 100000));
  forgetClicks();
  sendSetup();
});
byId("color-by").addEventListener("change", drawAll);

// Start: your gasket, no attempts yet, paused at a low speed.
byId("seed").value = "1";
byId("preset").value = "gasket";
showSpeed();
setWanted(0);
startTheWorker();
usePreset("gasket");
