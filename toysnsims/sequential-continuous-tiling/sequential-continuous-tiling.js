/* =====================================================================
   sequential-continuous-tiling.js  —  the "Sequential Continuous Tiling" sim page
   ---------------------------------------------------------------------
   The math lives in sequential-continuous-tiling-growth.js and runs in a second
   thread (a Web Worker), so the page never freezes. This file does
   everything else:
     1. The starting shapes (presets)
     2. The state of the page
     3. Reading the formulas, with sliders
     4. Talking to the worker
     5. How many attempts are shown, Play and speed
     6. Drawing the packing
     7. Statistics and charts
     8. Pointing at a tile
     8b. Click to add a tile
     9. Connecting the buttons
   It uses the shared helpers in js/sim-page.js (byId, runInWorker,
   connectPlay, ...), the run loop in js/sim-worker.js, the charts in
   js/sim-charts.js (logLogChart, barChart), the plane picture in
   js/sim-view.js (makePlaneView, ...), the old site's colors in
   js/sim-colors.js (defaultColor) and the formula reading and sliders
   in js/formulas.js.
   ===================================================================== */


/* =====================================================================
   1. THE STARTING SHAPES (PRESETS)
   ---------------------------------------------------------------------
   Each preset fills in the three formulas and (if it has any) sliders.
   Formulas are written the way you'd type them. The picture always
   starts out showing all of S (the worker finds the box around it).
   ===================================================================== */
const UNIT_SQUARE = "max(abs(x), abs(y)) <= 1";
const UNIT_DISK = "x^2 + y^2 <= 1";
const PRESETS = {
  "gasket":          { S: UNIT_DISK, T: UNIT_DISK, f: "1" },
  "s-model":         { S: UNIT_DISK, T: UNIT_DISK, f: "(x^2 + y^2)^((1/s - 2)/2)",
                       sliders: { s: { value: 0.5, min: 0.05, max: 3, step: 0.05 } } },
  "squares":         { S: UNIT_SQUARE, T: UNIT_SQUARE, f: "1" },
  "disks-in-square": { S: UNIT_SQUARE, T: UNIT_DISK, f: "1" },
  // The star: s is how deep its arms are cut (above 1 they come apart),
  // h how many arms it has.
  "stars":           { S: "(x^2 + y^2 - 0.8)^3 - x^2 y^3 <= 0", T: "sqrt(x^2 + y^2) <= 1 + s cos(h atan2(y, x))",
                       f: "1", sliders: { s: { value: 0.5, min: 0, max: 2, step: 0.01 },
                                          h: { value: 5, min: 0, max: 12, step: 1 } } },
};

// Play speeds, in attempts per second. The sim starts paused, at 10.
const SPEEDS = [1, 100];   // the slider's starting min and max (boxes at its ends change them)
const START_SPEED = 10;
const MOST_ATTEMPTS = 1000000;
const PALETTE = 12;               // colors used for the tiles (the old site's colors)
const MAX_PICTURE_HEIGHT = 700;   // pixels


/* =====================================================================
   2. THE STATE OF THE PAGE
   ===================================================================== */
const simCanvas = byId("sim-canvas");
let clicks = {};              // attempt n -> [x, y]: centers you clicked (section 8b)

let sliders = {};             // letter -> { value, min, max, step }
let formulas = null;          // the three formulas, ready for the worker: { S, T, f }
let windowBox = { xmin: -1.05, xmax: 1.05, ymin: -1.05, ymax: 1.05 };   // the box around S, from the worker

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


/* =====================================================================
   3. READING THE FORMULAS, WITH SLIDERS
   ---------------------------------------------------------------------
   Each formula is read by readTree (js/formulas.js): "=" means equals
   and "xy" means x times y, as in Desmos. S and T can each be
     a condition    x^2 + y^2 <= 1     the points where it holds,
     an equation    x^2 + y^2 = 1      the region its curve closes off,
     a curve        (cos(t), sin(t))   the inside of the curve traced as
                                       t runs from 0 to 2π.
   (The worker, sequential-continuous-tiling-growth.js section 8, turns each
   into a test of points.) Every letter other than x and y (and t in a
   curve) gets a slider, shared by all three formulas. The typeset
   preview comes from KaTeX.
   ===================================================================== */
const FORMULA_NAMES = ["S", "T", "f"];

// If S or T is typed as a curve "(x(t), y(t))", its two halves; else null.
function curveHalves(name, text) {
  if (name === "f" || !/^\(.*\)$/s.test(text)) return null;
  const halves = splitOutside(text.slice(1, -1), ",");   // js/formulas.js
  return halves.length === 2 ? halves : null;
}

function readFormulas() {
  const trees = {};      // name -> [tree], or [x tree, y tree] for a curve
  for (const name of FORMULA_NAMES) {
    const text = byId("formula-" + name).value.trim();
    try {
      if (text === "") throw new Error("it is empty.");
      trees[name] = (curveHalves(name, text) || [text]).map(readTree);
    } catch (problem) {
      // Usually just a half-typed formula: keep the last good packing.
      byId("formula-message").textContent = "Can't read " + name + " yet: " + problem.message;
      return;
    }
    if (window.katex) {
      const tex = trees[name].map(formulaTex);
      katex.render(tex.length === 2 ? "\\left(" + tex.join(",\\ ") + "\\right)" : tex[0], byId("preview-" + name),
                   { throwOnError: false });
    }
  }
  byId("formula-message").textContent = "";

  // One slider per letter, in the order the letters first appear (a Set
  // keeps that order, and each letter once). A curve's t gets none.
  const letters = new Set(FORMULA_NAMES.flatMap(function (name) {
    const curve = trees[name].length === 2;
    return trees[name].flatMap(sliderLetters).filter(function (letter) { return !(curve && letter === "t"); });
  }));
  const holder = byId("sliders");
  holder.innerHTML = "";
  for (const letter of letters) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], sendSetup));
  }

  // The worker gets each formula written out with every "*" shown, so it
  // reads exactly what the preview shows (a curve as { x, y }).
  formulas = {};
  for (const name of FORMULA_NAMES) {
    const written = trees[name].map(function (tree) { return tree.toString({ implicit: "show" }); });
    formulas[name] = written.length === 2 ? { x: written[0], y: written[1] } : written[0];
  }
  sendSetup();
}

// Fill in a preset's formulas and sliders.
function usePreset(key) {
  const p = PRESETS[key];
  clicks = {};
  byId("formula-S").value = p.S;
  byId("formula-T").value = p.T;
  byId("formula-f").value = p.f;
  showWhole(plane, windowBox);
  for (const letter in p.sliders || {}) sliders[letter] = Object.assign({}, p.sliders[letter]);
  readFormulas();
}

// The small pictures of S and T that pop up by their formulas (the CSS
// in css/style.css shows them). They show the shapes the worker last
// read, so a half-typed formula keeps the last good picture.
const PREVIEW_SIZE = 120;   // CSS pixels, as in css/style.css
function drawPreview() {
  const size = PREVIEW_SIZE, margin = 8;
  for (const name of ["S", "T"]) {
    const p = sharpPen(byId("picture-" + name), size, size);
    p.strokeStyle = CHART_LINE; p.fillStyle = CHART_LINE; p.lineWidth = 1.5;
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
      p.translate(size / 2, size / 2);
      p.scale(k, -k);
      p.fill(tileShape);
    }
  }
}


/* =====================================================================
   4. TALKING TO THE WORKER
   ---------------------------------------------------------------------
   The worker is made from packingWorker() and packingCore() (both in
   sequential-continuous-tiling-growth.js); runInWorker (js/sim-page.js)
   runs it in a second thread. It works toward n attempts by itself and
   reports the new tiles as they come.

   A setup takes the worker a moment (it traces the edge of S, then
   works toward n for at most a quarter of a second before it reports),
   so while one is being worked on, newer changes wait, and only the
   latest is sent after it. Its first report replaces the old picture
   in one go, so dragging a slider never flashes the picture empty and
   fills it back in.
   ===================================================================== */
const sim = runInWorker(packingWorker, [packingCore], function (message) {
  if (message.problem) {
    byId("formula-message").textContent = "Problem: " + message.problem;
    return;
  }
  if (message.info) useShapes(message);     // a new run's first report
  keepTiles(message);
  if (message.info) drawAll(); else drawNew();
  if (message.clicked) clickedBack(message.clicked);
});

// A new packing from the formulas, sliders, clicks and seed. Like a
// restart, it pauses.
function sendSetup() {
  if (!formulas) return;
  player.setPlaying(false);
  const values = {};
  for (const letter in sliders) values[letter] = sliders[letter].value;
  sim.setup({
    S: formulas.S, T: formulas.T, f: formulas.f, values: values,
    seed: byId("seed").value, clicks: clicks, target: wanted,
  });
}

// A new run's S and T: their facts, the edge of S and T's polygon. A
// new S shows all of it again (a new T or f keeps your view).
function useShapes(m) {
  info = m.info;
  if (JSON.stringify(info.window) !== JSON.stringify(windowBox)) { windowBox = info.window; showWhole(plane, windowBox); }
  segments = m.segments;
  shapeX = m.shapeX; shapeY = m.shapeY;
  shapeReach = Math.max(...shapeX.map(function (x, k) { return Math.hypot(x, shapeY[k]); }));
  tileShape = new Path2D();
  for (let k = 0; k < shapeX.length; k++) tileShape.lineTo(shapeX[k], shapeY[k]);
  tileShape.closePath();
  for (const key in tiles) tiles[key] = key === "count" ? 0 : [];
  byId("formula-message").textContent = info.exactTiles ? "" :
    "T is not convex and symmetric, so each tile takes longer to place (the result is still exact).";
  if (info.negativeF) byId("formula-message").textContent += " f is negative somewhere; it counts as 0 there.";
  drawPreview();
}

// The tiles placed since the last report, and how many attempts are done.
function keepTiles(m) {
  for (const key of ["cx", "cy", "r", "parent", "generation", "attempt"]) {
    for (const v of m[key]) tiles[key].push(v);
  }
  tiles.count = tiles.r.length;
  computed = m.attempts;
  ceilingMisses = m.ceilingMisses;
}


/* =====================================================================
   5. HOW MANY ATTEMPTS ARE SHOWN, PLAY AND SPEED
   ---------------------------------------------------------------------
   "wanted" is the number of attempts asked for (the n box and slider).
   The worker works until it has done that many; the picture shows the
   tiles of the attempts done so far. Lowering n just hides the last
   tiles (they are kept, so raising n again is instant).
   Play raises n by one attempt at a time, at the Speed slider's speed,
   on the run loop every sim uses (makeRunLoop, js/sim-worker.js), and
   Step by one attempt. Play stays at most two seconds ahead of the
   worker, so the picture keeps up, and Pause stops it.
   ===================================================================== */
function setWanted(n) {
  n = Math.max(0, Math.min(MOST_ATTEMPTS, Math.round(n)));
  const lower = n < wanted;
  wanted = n;
  showWanted(lower);
}

// Show n in its box and slider, ask the worker for that many attempts,
// and draw (all again if n went down: "lower").
function showWanted(lower) {
  byId("set-attempts").value = wanted;
  byId("attempts-slider").value = wanted > 0 ? Math.log10(wanted) : 0;
  if (wanted > computed) sim.send({ type: "target", target: wanted });
  if (lower) drawAll(); else drawNew();
  player.showDone();    // at the most attempts, Play and Step are grayed out
}

function oneMoreAttempt() {
  if (attempts.playing && wanted - computed >= 2 * attempts.speeds[0]) return false;   // wait for the worker
  wanted++;
}
const attempts = makeRunLoop(oneMoreAttempt, function () { showWanted(false); },
                             function () { return wanted >= MOST_ATTEMPTS; });

// Restart: back to no attempts, paused, forgetting the clicked tiles.
function restart() {
  player.setPlaying(false);
  setWanted(0);
  if (Object.keys(clicks).length > 0) { clicks = {}; sendSetup(); }
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(attempts, SPEEDS, START_SPEED, "attempt", "attempts", restart);


/* =====================================================================
   6. DRAWING THE PACKING
   ---------------------------------------------------------------------
   The picture is a plane view (makePlaneView, js/sim-view.js), whose
   whole is the window: the box around S, found by the worker. It
   starts out showing all of S, as big as fits the picture's width, and
   can be moved and zoomed like a graph in Desmos:
     drag                         move it
     mouse wheel, or pinch        zoom in or out, around the pointer
     the + / − / Reset buttons    zoom in, zoom out, show all of S again
     click (without dragging)     add a tile there (section 8b)
   Tiles never move once placed, and never overlap, so new tiles are
   simply drawn on top (drawNew); the whole picture is redrawn (drawAll)
   only when n goes down, the colors change, the picture is moved or
   zoomed (at most once per screen refresh), or the page is resized.
   Each tile is T's polygon, scaled by R and moved to C. Tiles smaller
   than a pixel are skipped, so zooming in shows tiles that were too
   small to see before.
   ===================================================================== */
const plane = makePlaneView(simCanvas, oncePerFrame(drawAll), {
  whole: function () { return windowBox; }, resetTitle: "Show all of S once again",
});
connectPicture(plane, {
  onClick: function (event) {
    const spot = pointerSpot(plane, event);
    clickAt(pointX(plane, spot.x), pointY(plane, spot.y));
  },
});
let pen = null;

// The picture is as wide as the page lets it, with the window's shape
// (taller in the full screen popup: pictureHeight, in js/sim-page.js).
function sizeCanvas() {
  const aspect = (windowBox.ymax - windowBox.ymin) / (windowBox.xmax - windowBox.xmin);
  pen = sizePlane(plane, pictureHeight(Math.min(MAX_PICTURE_HEIGHT, Math.round(simCanvas.clientWidth * aspect))));
}

// Which of the PALETTE colors tile k gets, by the "Color tiles by" choice.
function colorOf(k) {
  let b;
  const colorBy = byId("color-by").value;
  if (colorBy === "generation") b = (tiles.generation[k] - 1) % PALETTE;
  else if (colorBy === "degree") b = Math.floor(2 * Math.log2(children[k] + 1));        // degree = children + 1
  else if (colorBy === "size") b = Math.floor(-0.7 * Math.log2(2 * tiles.r[k] / (windowBox.xmax - windowBox.xmin)));
  else b = Math.floor(2 * Math.log10(tiles.attempt[k]));
  return defaultColor(Math.max(0, Math.min(PALETTE - 1, b)), PALETTE);
}

// Tile k, in one go: the pen's transform scales T's polygon by R, moves
// it to C, and turns screen pixels into the canvas's own (more of them
// on a sharp screen: "ratio", as in sharpPen).
function drawTile(k) {
  const ratio = window.devicePixelRatio || 1;
  const r = tiles.r[k] * plane.ux, reach = r * shapeReach;     // in screen pixels
  if (reach * ratio < 0.15) return;                             // much smaller than a pixel: invisible anyway
  const x = pixelX(plane, tiles.cx[k]), y = pixelY(plane, tiles.cy[k]);
  if (x + reach < 0 || x - reach > plane.width || y + reach < 0 || y - reach > plane.height) return;   // off the picture
  pen.setTransform(ratio * r, 0, 0, -ratio * r, ratio * x, ratio * y);
  pen.fillStyle = colorOf(k);
  pen.fill(tileShape);
}

// Start again from an empty picture, and draw every tile that is shown.
function drawAll() {
  sizeCanvas();
  // The edge of S.
  pen.strokeStyle = CHART_TEXT;
  pen.lineWidth = 1;
  pen.beginPath();
  for (let i = 0; i < segments.length; i += 4) {
    pen.moveTo(pixelX(plane, segments[i]), pixelY(plane, segments[i + 1]));
    pen.lineTo(pixelX(plane, segments[i + 2]), pixelY(plane, segments[i + 3]));
  }
  pen.stroke();
  shown = 0;
  children = []; edgeChildren = 0;
  coveredArea = 0; biggestGeneration = 0; biggestDegree = 0;
  drawNew();
}

// Draw the tiles placed since the last drawing, up to attempt "wanted".
function drawNew() {
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
   7. STATISTICS AND CHARTS
   ---------------------------------------------------------------------
   The numbers are kept up to date by drawNew (section 6). The charts
   are redrawn at most a few times a second. They get their canvas
   ready, and their colors, from js/sim-charts.js.
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
  logLogChart(byId("placed-chart"), [{ points: placed }], "attempts", "tiles placed");

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
  logLogChart(byId("records-chart"), [{ points: generations }, { points: degrees, dots: true, radius: 1.5 }], "tiles placed", "record");

  // R_k against k.
  const radii = [];
  for (const k of logSpaced(shown)) radii.push([k + 1, tiles.r[k]]);
  logLogChart(byId("radii-chart"), [{ points: radii, dots: true, radius: 1.5 }], "k", "R_k");

  // How many tiles have 0, 1, 2, ... children (the last bar: that many or more).
  const most = 20, bars = new Array(most + 1).fill(0);
  for (let k = 0; k < shown; k++) bars[Math.min(most, children[k])]++;
  barChart(byId("children-chart"), bars.map(function (count, i) { return { from: i - 0.5, to: i + 0.5, value: count }; }),
    { from: -0.5, to: most + 0.5, whole: true, word: "children",
      text: function (i) { return i < most ? String(i) : most + "+"; } },
    { from: 0, to: Math.max(1, ...bars), round: true, whole: true, word: "tiles" });
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

/* =====================================================================
   8. POINTING AT A TILE
   ---------------------------------------------------------------------
   Moving the mouse over the picture shows the numbers of the tile under
   it. A point is in tile k if, moved and scaled back to T's own size,
   it is inside T's polygon (counted by the usual "ray crossing" test:
   a ray from the point crosses the polygon's edge an odd number of
   times exactly when the point is inside).
   ===================================================================== */
const HOVER_HINT = byId("hover-info").textContent;   // the hint the page starts with

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
  if (!tileShape) return;
  const spot = pointerSpot(plane, event);
  const k = tileAt(pointX(plane, spot.x), pointY(plane, spot.y));
  if (k < 0) { byId("hover-info").textContent = HOVER_HINT; return; }
  const p = tiles.parent[k];
  byId("hover-info").textContent = "Tile " + (k + 1).toLocaleString() + " (attempt " + tiles.attempt[k].toLocaleString() +
    "): R = " + tiles.r[k].toPrecision(4) + ", parent: " + (p < 0 ? "the edge of S" : "tile " + (p + 1).toLocaleString()) +
    ", generation " + tiles.generation[k] + ", degree " + (children[k] + 1) + ".";
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
  if (!info) return;
  if (tileAt(x, y) >= 0) { byId("hover-info").textContent = NO_ROOM; return; }
  if (computed === wanted && !redo) {
    // The usual case: the worker is exactly at attempt n, so it just
    // tries the point as attempt n + 1 (and answers in clickedBack).
    sim.send({ type: "click", x: x, y: y, at: wanted });
  } else {
    // n was lowered (or the worker is still catching up): the point
    // becomes attempt n + 1, and the packing is redone from the start.
    clicks[wanted + 1] = [x, y];
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

byId("set-attempts").addEventListener("change", function () { setWanted(Number(byId("set-attempts").value) || 0); });
byId("attempts-slider").addEventListener("input", function () {
  const v = Number(byId("attempts-slider").value);
  setWanted(v === 0 ? 0 : Math.pow(10, v));
});
connectSeed(function () { clicks = {}; sendSetup(); });   // js/sim-page.js
byId("color-by").addEventListener("change", drawAll);

// Start: your gasket, no attempts yet, paused at a low speed.
byId("seed").value = "1";
byId("preset").value = "gasket";
setWanted(0);
usePreset("gasket");
