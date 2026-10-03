/* =====================================================================
   random-walk-coloring.js  —  the page of the "Random walk coloring"
   sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, or a custom one drawn
       in the graph tool (shown inside this page). The domain code is
       shared with the other sims, in js/sim-domains.js.
     - Places the N walkers: spread out evenly to begin with, and you can
       drag them to other cells before the run starts.
     - Hands everything to the walkers (random-walk-coloring-walk.js),
       which run in a second thread (a "Web Worker"), and draws every
       coloring they send back, with the statistics.
   Small helpers used by every sim page (byId, chartPen, ...) are in
   js/sim-page.js, and moving and zooming the torus is in
   js/sim-view.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The default start
     4. Running the walkers
     5. Drawing the coloring and the walkers
     6. Dragging and zooming: walkers before the start, and the torus
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain (a 64 x 64 torus), number of walkers and seed.
const DEFAULTS = { width: 64, height: 64, neighbors: 4, walkers: 2, seed: "1" };

const MAX_WALKERS = 30;           // the most walkers allowed
const MAX_SIDE = 300;             // the biggest box or torus is 300 x 300
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // the lines between colors
const UNCOLORED = "#ffffff";      // cells no walker has reached yet
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const SMALLEST_BORDERED_CELL = 4; // cells smaller than this (in pixels) get no border lines
const PAD = 8;                    // room above and below the picture, so walkers at the edge show

// The speeds on the Speed slider, in steps per second (one step = one
// unit of time, in both models). Infinity means "as fast as the
// computer can". The default is slow, so you can watch every step.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(5);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let model = "discrete";         // "discrete" or "continuous"
let domainKind = "torus";       // "box", "torus" or "custom": the domain in use
let domain = null;              // the domain graph (js/sim-domains.js)
let customDomain = null;        // the last custom domain drawn, if any
let N = DEFAULTS.walkers;       // number of walkers
let starts = [];                // starts[i] = the cell walker i starts on
let colorNames = [];            // colorNames[i] = how color i is drawn, e.g. "#f2735a"
let colorRGB = [];              // the same colors as [red, green, blue], 0..255
let showWalkers = true;         // the "Show walkers" box

let playing = false;            // it starts paused; Play sets it going
let speedIndex = DEFAULT_SPEED;
let run = 0;                    // counts restarts, so leftovers from an older run are ignored

// The latest message from the walkers: the colors, where the walkers
// are, and the numbers (see section 5 of random-walk-coloring-walk.js).
// It also carries the run so far ("trace..."), for the plots over time.
let latest = null;

// Small helpers for this page. (The ones every sim page uses are in
// js/sim-page.js.)

// "Has the run started?" Walkers can only be dragged before it has.
function started() { return latest !== null && latest.time > 0; }

// A number of time units, for showing: whole numbers as they are, others
// with 2 decimals.
function showTime(t) {
  return Number.isInteger(t) ? t.toLocaleString()
    : t.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


/* =====================================================================
   3. THE DEFAULT START
   ---------------------------------------------------------------------
   Box and torus: the walkers sit on a grid of side x side points
   (side = the square root of N, rounded up), spaced evenly from the
   top-left cell.
   For N = 2 that's the top-left cell and the middle (L/2, L/2), as in
   nadya's Python. With fewer walkers than grid points, the points are
   picked to be as far apart as possible: first the top-left one, then
   each time the point farthest from all those picked so far (on a
   torus, distances wrap around).

   Custom domains: the same idea with the region's own cells, the
   distance being the number of steps through the region, starting from
   the cell nearest the top left.
   ===================================================================== */
function defaultStarts(d, count) {
  return domainKind === "custom" ? spreadThroughRegion(d, count) : gridStarts(d, count);
}

function gridStarts(d, count) {
  const across = d.xmax - d.xmin + 1, down = d.ymax - d.ymin + 1;
  const side = Math.ceil(Math.sqrt(count));   // the grid is side x side
  const points = [];                          // the grid points, row by row from the top
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      points.push({ x: d.xmin + Math.floor(column * across / side), y: d.ymax - Math.floor(row * down / side) });
    }
  }

  // The distance between two points, wrapping around on a torus.
  function distance(p, q) {
    let dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y);
    if (d.wrap) { dx = Math.min(dx, across - dx); dy = Math.min(dy, down - dy); }
    return Math.hypot(dx, dy);
  }

  // Pick them one at a time: each time, the point farthest from all
  // the points picked so far (the first such point, if several tie).
  // nearest[k] = distance from point k to the nearest point picked.
  const picked = [points[0]];
  const nearest = points.map(function (p) { return distance(p, points[0]); });
  while (picked.length < count) {
    let far = 0;
    for (let k = 1; k < points.length; k++) if (nearest[k] > nearest[far]) far = k;
    picked.push(points[far]);
    points.forEach(function (p, k) { nearest[k] = Math.min(nearest[k], distance(p, points[far])); });
  }
  return picked.map(function (p) { return cellAt(d, p.x, p.y); });
}

function spreadThroughRegion(d, count) {
  // The cell nearest the top left of the region's box.
  let corner = 0;
  for (let v = 1; v < d.n; v++) {
    if ((d.x[v] - d.xmin) + (d.ymax - d.y[v]) < (d.x[corner] - d.xmin) + (d.ymax - d.y[corner])) corner = v;
  }
  const picked = [corner];
  let steps = stepsFrom(d, picked);
  while (picked.length < count) {
    let far = 0;
    for (let v = 1; v < d.n; v++) if (steps[v] > steps[far]) far = v;
    picked.push(far);
    steps = stepsFrom(d, picked);
  }
  return picked;
}


/* =====================================================================
   4. RUNNING THE WALKERS
   ---------------------------------------------------------------------
   The walkers are the function walkWorker() in
   random-walk-coloring-walk.js. startWorker (js/sim-page.js) runs it in
   a second thread, a "Web Worker", so the page never freezes.
   ===================================================================== */
const worker = startWorker(walkWorker);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  latest = message;
  if (message.done && playing) setPlaying(false);
  drawSoon();
};

worker.onerror = function () {
  showMessage("The walkers couldn't start. They load one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start again from the starting cells, with the current domain, model
// and seed.
function restart() {
  run++;
  latest = null;
  showMessage("");
  worker.postMessage({
    type: "setup", run: run,
    n: domain.n, first: domain.first, nbr: domain.nbr,
    starts: Int32Array.from(starts), model: model, seed: byId("seed").value,
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
   5. DRAWING THE COLORING AND THE WALKERS
   ---------------------------------------------------------------------
   Each cell is a square in its color (white until a walker reaches it).
   When cells are big enough to see, a dark line goes along every side
   where two cells of different colors meet (an uncolored cell counts as
   a color here), or where the domain ends. The walkers are drawn on top
   as round markers.

   The "view" (js/sim-view.js) says where the picture goes and which
   squares show, as in the connected coloring sim. A box simply fills
   the picture once. A torus (or a region drawn on one) wraps around,
   and can be moved and zoomed (section 6). Zoomed out, it shows
   several times side by side, and so do the walkers.

   The squares' colors go into a small image, one pixel per square,
   which is then blown up with smoothing off so the squares stay crisp.
   (Setting pixels one by one is fast even for many thousands of
   squares.)
   ===================================================================== */
let drawPending = false;
const tiny = document.createElement("canvas");   // one pixel per square that shows
const simCanvas = byId("sim-canvas");            // the canvas on the page

// Where the picture goes, and the torus's zoom. PAD leaves room above
// and below the picture for walkers on the edge, and cells with border
// lines get a whole number of pixels, so every cell is exactly the same
// size and the lines sit exactly on the cell edges.
const view = makeView(simCanvas, drawSoon, PAD, SMALLEST_BORDERED_CELL);

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
function drawSoon() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function () {
    drawPending = false;
    drawColoring();
    showStats();
  });
}

function drawColoring() {
  if (!domain || !latest || simCanvas.hidden) return;
  const colors = latest.colors;
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  const cells = cellsShown(view, domain);
  const cols = view.cols, rows = view.rows;

  // The color on each square that shows (-1 = not reached yet, -2 = not
  // in the domain), and the small image with one pixel per square.
  // Row 0 of the image is the top row of squares.
  const shown = new Int32Array(cols * rows);
  tiny.width = cols;
  tiny.height = rows;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(cols, rows);
  const pixels = image.data;                  // 4 numbers per pixel: red, green, blue, opacity
  const outside = hexToRGB(OUTSIDE), blank = hexToRGB(UNCOLORED);
  for (let p = 0; p < cols * rows; p++) {
    const c = cells[p] === -1 ? -2 : colors[cells[p]];
    const rgb = c === -2 ? outside : c === -1 ? blank : colorRGB[c];
    shown[p] = c;
    pixels[4 * p] = rgb[0]; pixels[4 * p + 1] = rgb[1]; pixels[4 * p + 2] = rgb[2];
    pixels[4 * p + 3] = 255;
  }
  tinyPen.putImageData(image, 0, 0);

  // The squares: the small image blown up, with smoothing off so they
  // stay sharp.
  pen.imageSmoothingEnabled = false;
  pen.drawImage(tiny, squareLeft(view, view.firstI), squareTop(view, view.firstK),
                cols * view.cell, rows * view.cell);

  // The lines between different colors, when cells are big enough to
  // see (the outside counts as a color of its own).
  if (view.cell >= SMALLEST_BORDERED_CELL) drawBorders(view, pen, shown, BORDER);

  pen.restore();                       // no longer cut off at the picture's box, so
  if (showWalkers) drawWalkers(pen);   // walkers on the edge show whole
}

// The size of a walker's marker, in screen pixels.
function walkerRadius() { return Math.max(5, Math.min(14, view.cell * 0.7)); }

// Where walker i is drawn on the screen: the middle of its cell, in
// every copy of the torus that shows (just once on a box). Only spots
// inside the picture's box count, so at zoom 1 each walker shows once.
// y counts from the top of the picture, PAD below the canvas top.
function walkerSpots(i) {
  const d = domain, v = latest.positions[i];
  let columns = [d.x[v] - d.xmin], rows = [d.ymax - d.y[v]];   // its square (column, row)
  if (d.wrap) {
    columns = repeatsBetween(columns[0], d.wrap.xmax - d.wrap.xmin + 1, view.firstI, view.lastI);
    rows = repeatsBetween(rows[0], d.wrap.ymax - d.wrap.ymin + 1, view.firstK, view.lastK);
  }
  const spots = [];
  for (const column of columns) {
    for (const row of rows) {
      const x = (column + 0.5 + view.scroll.x) * view.cell, y = (row + 0.5 + view.scroll.y) * view.cell;
      if (x >= 0 && x < view.width && y >= 0 && y < view.height) spots.push({ x: view.left + x, y: y });
    }
  }
  return spots;
}

// The numbers t, t + period, t - period, t + 2 period, ... between lo and
// hi: the places a column (or row) shows again around the torus.
function repeatsBetween(t, period, lo, hi) {
  const list = [];
  for (let s = lo + wrapNumber(t - lo, period); s <= hi; s += period) list.push(s);
  return list;
}

// Each walker is a disc in its color, with a white ring and a thin dark
// edge so it shows up even on its own color, and its number when there
// is room for it.
function drawWalkers(pen) {
  const r = walkerRadius();
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.font = "bold " + Math.round(r * 1.1) + "px sans-serif";
  for (let i = 0; i < N; i++) {
    for (const spot of walkerSpots(i)) {
      pen.beginPath();
      pen.arc(spot.x, spot.y, r, 0, 2 * Math.PI);
      pen.fillStyle = colorNames[i];
      pen.fill();
      pen.lineWidth = 2;
      pen.strokeStyle = "#ffffff";
      pen.stroke();
      pen.beginPath();
      pen.arc(spot.x, spot.y, r + 1.5, 0, 2 * Math.PI);
      pen.lineWidth = 1;
      pen.strokeStyle = BORDER;
      pen.stroke();
      if (r >= 9) {
        pen.fillStyle = BORDER;
        pen.fillText(String(i + 1), spot.x, spot.y + 1);
      }
    }
  }
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. DRAGGING AND ZOOMING: WALKERS BEFORE THE START, AND THE TORUS
   ---------------------------------------------------------------------
   Before the run starts (paused, at time 0), a walker can be dragged to
   another cell; it snaps to the cell under the pointer, and the start
   is redrawn at once. Once the run has started, Restart brings the
   walkers back to their starting cells, and they can be dragged again.

   On a torus the picture can be moved and zoomed, as in the connected
   coloring sim (and like a graph in Desmos). js/sim-view.js does that:
     drag (anywhere but a walker)     move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   "Pointer" events cover the mouse, a pen and fingers alike.
   ===================================================================== */
let dragWalker = -1;          // the walker being dragged, or -1
let walkerPointer = -1;       // the pointer dragging it

// On phones, let a finger drag on the picture instead of scrolling the page.
simCanvas.style.touchAction = "none";

// Where the pointer is, in screen pixels from the canvas's top-left corner.
// (y is counted from the top of the picture, which is PAD pixels down.)
function pointerSpot(event) {
  const box = simCanvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top - PAD };
}

// The walker under the pointer (the one drawn on top), or -1. Only
// before the run has started, while paused.
function walkerUnder(spot) {
  if (!latest || !showWalkers || playing || started()) return -1;
  for (let i = N - 1; i >= 0; i--) {
    for (const w of walkerSpots(i)) {
      if (Math.hypot(w.x - spot.x, w.y - spot.y) <= walkerRadius() + 3) return i;
    }
  }
  return -1;
}

// The cell under the pointer, or -1.
function cellUnder(spot) {
  if (spot.x < view.left || spot.x >= view.left + view.width || spot.y < 0 || spot.y >= view.height) return -1;
  const i = Math.floor((spot.x - view.left) / view.cell - view.scroll.x);   // its square (i, k)
  const k = Math.floor(spot.y / view.cell - view.scroll.y);
  return cellAt(domain, domain.xmin + i, domain.ymax - k);
}

// The "hand" cursor where something can be dragged.
function showCursor(spot) {
  simCanvas.style.cursor = (dragWalker >= 0 || view.pointers.size > 0) ? "grabbing"
    : (walkerUnder(spot) >= 0 || view.torus) ? "grab" : "default";
}

// A press on a walker drags the walker. Anywhere else, the pointer
// moves the torus (pressPointer and the rest are in js/sim-view.js).
simCanvas.addEventListener("pointerdown", function (event) {
  const spot = pointerSpot(event);
  if (dragWalker < 0 && view.pointers.size === 0) {
    dragWalker = walkerUnder(spot);                   // a walker, if there's one under the pointer
    if (dragWalker >= 0) {
      walkerPointer = event.pointerId;
      simCanvas.setPointerCapture(event.pointerId);   // keep getting moves even off the canvas
    }
  }
  if (dragWalker < 0) pressPointer(view, event);
  showCursor(spot);
});

simCanvas.addEventListener("pointermove", function (event) {
  const spot = pointerSpot(event);
  if (dragWalker >= 0 && event.pointerId === walkerPointer) {
    const cell = cellUnder(spot);
    if (cell !== -1 && cell !== starts[dragWalker]) {
      starts[dragWalker] = cell;
      restart();
    }
  } else {
    movePointer(view, event);
  }
  showCursor(spot);
});

function stopDragging(event) {
  if (event.pointerId === walkerPointer) { dragWalker = -1; walkerPointer = -1; }
  releasePointer(view, event);
  showCursor(pointerSpot(event));
}
simCanvas.addEventListener("pointerup", stopDragging);
simCanvas.addEventListener("pointercancel", stopDragging);


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   The interface and the number of cells of each color come from the
   walkers (they keep them up to date as cells get colored). The
   regions are found here, each time the picture is drawn: a region is
   a connected piece of one color, found by a search from each cell
   through its neighbors of the same color (as nadya's Python does
   with connected_components). For each region:
     area       its number of cells
     perimeter  the number of edges from it to a cell of another color
                (uncolored cells don't count), so the perimeters of all
                regions add up to twice the interface.
   ===================================================================== */
function findRegions() {
  const d = domain, colors = latest.colors;
  const region = new Int32Array(d.n).fill(-1);   // region[v] = which region cell v is in
  const areas = [], perimeters = [], regionColor = [];
  const stack = [];
  for (let s = 0; s < d.n; s++) {
    if (colors[s] === -1 || region[s] !== -1) continue;
    const r = areas.length;
    let area = 0, perimeter = 0;
    region[s] = r;
    stack.push(s);
    while (stack.length > 0) {
      const v = stack.pop();
      area++;
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (colors[w] === colors[v]) {
          if (region[w] === -1) { region[w] = r; stack.push(w); }
        } else if (colors[w] !== -1) {
          perimeter++;
        }
      }
    }
    areas.push(area);
    perimeters.push(perimeter);
    regionColor.push(colors[s]);
  }
  return { areas: areas, perimeters: perimeters, color: regionColor };
}

function showStats() {
  if (!domain || !latest) return;
  const s = latest;
  const regions = findRegions();

  byId("stat-cells").textContent = domain.n.toLocaleString();
  byId("stat-time-name").textContent = model === "discrete" ? "Steps n" : "Time t";
  byId("stat-time").textContent = showTime(s.time);
  byId("stat-moves").textContent = s.moves.toLocaleString();
  byId("stat-colored").textContent = s.colored.toLocaleString() + " of " + domain.n.toLocaleString() +
    " (" + (100 * s.colored / domain.n).toFixed(1) + "%)";
  byId("stat-interface").textContent = s.interfaceEdges.toLocaleString();
  byId("stat-regions").textContent = regions.areas.length.toLocaleString();
  byId("stat-cover").textContent = s.coverTime === null ? "not yet" : showTime(s.coverTime);

  if (s.done) showMessage("Every cell is colored. Cover time: " + showTime(s.coverTime) + ".");
  byId("play").disabled = byId("step").disabled = s.done;
  byId("start-info").textContent = started()
    ? "The run has started. Press Restart to go back to the start and move the walkers again."
    : "Drag a walker to choose where it starts. Changing N or the domain puts the walkers " +
      "back in the default start.";

  showColorRows(regions);
  drawSizesChart();
  drawInterfaceChart();
  drawAreasChart(regions);
  drawPerimeterChart(regions);
}

// One row per color: cells, number of regions, largest region.
function showColorRows(regions) {
  const count = new Array(N).fill(0), largest = new Array(N).fill(0);
  regions.areas.forEach(function (area, r) {
    const c = regions.color[r];
    count[c]++;
    largest[c] = Math.max(largest[c], area);
  });
  let rows = "";
  for (let c = 0; c < N; c++) {
    rows += '<tr><td><span class="swatch-small" style="background:' + colorNames[c] + '"></span>' +
      (c + 1) + '</td><td>' + latest.sizes[c] + '</td><td>' + count[c] + '</td><td>' + largest[c] + '</td></tr>';
  }
  byId("color-rows").innerHTML = rows;
}

// Lines over time. "lines" is a list of { color, values }, one value
// per time in "times". The y axis runs from 0 to the largest value.
function plotOverTime(canvas, times, lines) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (times.length < 2) return;
  let top = 1;
  for (const line of lines) for (const value of line.values) top = Math.max(top, value);
  const lastTime = Math.max(times[times.length - 1], 1e-9);
  const left = 44, up = 6, bottom = h - 16;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(top.toLocaleString(), left - 6, up);
  pen.fillText("0", left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText("time " + showTime(times[times.length - 1]), w, h);
  pen.textAlign = "left";
  pen.fillText("0", left, h);
  for (const line of lines) {
    pen.beginPath();
    line.values.forEach(function (value, k) {
      const sx = left + (w - left) * times[k] / lastTime;
      const sy = bottom - (bottom - up) * value / top;
      if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
    });
    pen.strokeStyle = line.color;
    pen.lineWidth = 1.5;
    pen.stroke();
  }
}

// The number of cells of each color, over time. The walkers send these
// as one long list: N numbers (one per color) for each time.
function drawSizesChart() {
  const lines = [];
  for (let c = 0; c < N; c++) {
    const values = [];
    for (let k = 0; k < latest.traceTimes.length; k++) values.push(latest.traceSizes[k * N + c]);
    lines.push({ color: colorNames[c], values: values });
  }
  plotOverTime(byId("sizes-chart"), latest.traceTimes, lines);
}

// The interface, over time.
function drawInterfaceChart() {
  plotOverTime(byId("interface-chart"), latest.traceTimes,
    [{ color: CHART_LINE, values: Array.from(latest.traceInterface) }]);
}

// How many regions there are of each size. Sizes go from 1 cell to
// thousands, so they are grouped by powers of 2: 1, 2-3, 4-7, 8-15, ...
// (each bar is labeled by the smallest size in it).
function drawAreasChart(regions) {
  const canvas = byId("areas-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (regions.areas.length === 0) return;
  const bins = [];
  for (const area of regions.areas) {
    const b = Math.floor(Math.log2(area));
    while (bins.length <= b) bins.push(0);
    bins[b]++;
  }
  const most = Math.max(...bins);
  const top = 14, bottom = h - 14, barWidth = w / bins.length;
  pen.textBaseline = "top";
  pen.fillText("most: " + most + " regions", 0, 0);
  pen.textAlign = "center";
  bins.forEach(function (count, b) {
    const barHeight = count === 0 ? 0 : Math.max(1, (bottom - top) * count / most);
    pen.fillStyle = CHART_LINE;
    pen.fillRect(b * barWidth + 1, bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
    pen.fillStyle = CHART_TEXT;
    pen.fillText(String(2 ** b), (b + 0.5) * barWidth, bottom + 2);
  });
}

// Each region as a dot: area across, perimeter up, both on logarithmic
// scales (so 1, 10, 100, ... are evenly spaced), colored by its color.
// Regions with no other color next to them (perimeter 0) are left out.
function drawPerimeterChart(regions) {
  const canvas = byId("perimeter-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const left = 34, up = 18, bottom = h - 16;
  let maxArea = 10, maxPerimeter = 10;
  regions.areas.forEach(function (area, r) {
    maxArea = Math.max(maxArea, area);
    maxPerimeter = Math.max(maxPerimeter, regions.perimeters[r]);
  });
  const xTop = Math.ceil(Math.log10(maxArea)), yTop = Math.ceil(Math.log10(maxPerimeter));
  function sx(area) { return left + (w - left - 8) * Math.log10(area) / xTop; }
  function sy(perimeter) { return bottom - (bottom - up) * Math.log10(perimeter) / yTop; }

  // The axes' marks at 1, 10, 100, ...
  pen.textAlign = "center";
  pen.textBaseline = "top";
  for (let k = 0; k <= xTop; k++) pen.fillText(String(10 ** k), sx(10 ** k), bottom + 3);
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  for (let k = 0; k <= yTop; k++) pen.fillText(String(10 ** k), left - 5, sy(10 ** k));
  pen.textAlign = "right";
  pen.textBaseline = "bottom";
  pen.fillText("area", w, bottom);
  pen.textAlign = "left";
  pen.textBaseline = "top";
  pen.fillText("perimeter", left + 4, 0);

  regions.areas.forEach(function (area, r) {
    const perimeter = regions.perimeters[r];
    if (perimeter === 0) return;
    pen.beginPath();
    pen.arc(sx(area), sy(perimeter), 2.5, 0, 2 * Math.PI);
    pen.fillStyle = colorNames[regions.color[r]];
    pen.fill();
    pen.lineWidth = 0.5;
    pen.strokeStyle = BORDER;
    pen.stroke();
  });
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page) as graph-tool.html?embed. The tool
   sends a message every time the drawing changes, and this page checks
   it live: the region must be one connected piece (otherwise the cells
   cut off from every walker could never be colored). Done uses it.
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
  showZoomButtons(view);
  byId("custom-area").hidden = false;
  if (!frame.src) frame.src = "graph-tool.html?embed";    // the first time only
  checkTool();
}

function closeTool() {
  toolOpen = false;
  byId("custom-area").hidden = true;
  simCanvas.hidden = false;
  showZoomButtons(view);
}

// Messages from the tool: its height (so the iframe fits it exactly),
// and its drawing.
window.addEventListener("message", function (event) {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message.type === "height") frame.style.height = message.height + "px";
  if (message.type === "graph") { toolMessage = message; checkTool(); }
});

// Check the drawing live and say what's wrong, if anything.
function checkTool() {
  if (!toolOpen) return;
  let problem = "", good = "";
  if (!toolMessage) {
    problem = "Loading the drawing tool...";
  } else if (toolMessage.graph.vertices.length === 0) {
    problem = "Paint the region first.";
  } else {
    const region = drawnDomain(toolMessage.graph, toolMessage.grid);
    const reached = stepsFrom(region, [0]).filter(function (s) { return s !== -1; }).length;
    if (reached < region.n) problem = "The region must be one connected piece.";
    else good = region.n + " cells in one connected piece.";
  }
  const status = byId("step-status");
  status.textContent = problem || "✓ " + good;   // ✓ is a tick mark
  status.className = "step-status " + (problem ? "problem" : "ok");
  byId("tool-done").disabled = Boolean(problem);
}

byId("tool-done").addEventListener("click", function () {
  customDomain = drawnDomain(toolMessage.graph, toolMessage.grid);
  closeTool();
  useDomain("custom", customDomain);
});

// Cancel: back to whatever was there before.
byId("tool-cancel").addEventListener("click", function () {
  closeTool();
  showDomainChoice();
  drawSoon();
  if (wasPlaying) setPlaying(true);
});


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain, put the walkers in the default start, and
// restart.
function useDomain(kind, d) {
  domainKind = kind;
  domain = d;
  useTorus(view, Boolean(d.wrap));   // moving and zooming only on a torus (js/sim-view.js)
  showDomainChoice();
  setWalkerCount(N);
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  if (toolOpen) closeTool();
  const width = readWhole("set-width", 2, MAX_SIDE, DEFAULTS.width);
  const height = readWhole("set-height", 2, MAX_SIDE, DEFAULTS.height);
  const neighbors = Number(byId("set-neighbors").value);
  const torus = (domainChoice() === "torus");
  useDomain(torus ? "torus" : "box", boxDomain(width, height, neighbors, torus));
}

function domainChoice() {
  return document.querySelector('input[name="domain"]:checked').value;
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  document.querySelector('input[name="domain"][value="' + domainKind + '"]').checked = true;
  const custom = (domainKind === "custom");
  byId("size-row").hidden = byId("neighbors-row").hidden = custom;
  byId("custom-row").hidden = !custom;
  if (custom && customDomain) {
    byId("custom-info").textContent = "Your region: " + customDomain.n + " cells" +
      (customDomain.wrap ? ", on a torus." : ".");
  }
}

// N walkers, in the default start, with their colors. Restarts.
function setWalkerCount(value) {
  N = Math.min(Math.max(Math.round(value) || 1, 1), MAX_WALKERS);
  byId("set-walkers").value = byId("walkers-slider").value = N;
  starts = defaultStarts(domain, N);
  colorNames = [];
  for (let c = 0; c < N; c++) colorNames.push(defaultColor(c, N));
  colorRGB = colorNames.map(hexToRGB);
  restart();
}

// Model: discrete or continuous time (same starts, same seed).
for (const radio of document.querySelectorAll('input[name="model"]')) {
  radio.addEventListener("change", function () {
    model = radio.value;
    restart();
  });
}

// Domain: Box / Torus / Custom.
for (const radio of document.querySelectorAll('input[name="domain"]')) {
  radio.addEventListener("change", function () {
    if (radio.value === "custom") openTool();
    else useBox();
  });
}
for (const id of ["set-width", "set-height", "set-neighbors"]) {
  byId(id).addEventListener("change", useBox);
}
byId("edit-custom").addEventListener("click", openTool);

// N: the slider and the number box move together, and the run restarts
// live while you drag, like a Desmos slider.
byId("walkers-slider").addEventListener("input", function () { setWalkerCount(Number(this.value)); });
byId("set-walkers").addEventListener("change", function () { setWalkerCount(Number(this.value)); });
byId("default-start").addEventListener("click", function () { setWalkerCount(N); });
byId("show-walkers").addEventListener("change", function () {
  showWalkers = this.checked;
  drawSoon();
});

// Play / Pause, Step, Restart.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "step" });
});
byId("restart").addEventListener("click", restart);

// Speed.
function showSpeed() {
  const speed = SPEEDS[speedIndex];
  byId("speed-label").textContent = speed === Infinity
    ? "as fast as possible"
    : speed + (speed === 1 ? " step" : " steps") + " per second";
}
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
});

// Seed: the same seed gives the same run every time.
byId("seed").addEventListener("change", restart);
byId("new-seed").addEventListener("click", function () {
  byId("seed").value = String(Math.floor(Math.random() * 100000));
  restart();
});


// --- Start ------------------------------------------------------------
byId("set-width").value = DEFAULTS.width;
byId("set-height").value = DEFAULTS.height;
byId("set-width").max = byId("set-height").max = MAX_SIDE;
byId("set-neighbors").value = String(DEFAULTS.neighbors);
byId("set-walkers").max = byId("walkers-slider").max = MAX_WALKERS;
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
useBox();
setPlaying(false);   // paused: drag the walkers, then press Play
