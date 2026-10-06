/* =====================================================================
   sim-hyperbolic.js  —  pictures of a hyperbolic tiling or a tree,
   shared by the sims that offer "Hyperbolic plane or tree"
   ---------------------------------------------------------------------
   The graphs themselves are made in js/sim-graphs.js (load it first);
   this file draws them, and builds the finite "ball" the sims run on.

   Three pictures (the "Drawn in" option):
     disk        the Poincare disk (see the top of js/sim-graphs.js): the
                 whole hyperbolic plane inside a circle, with cells
                 shrinking toward the edge
     half-plane  the upper half-plane: the same plane above a line, with
                 cells shrinking toward the line. It is the disk moved
                 by w = i (1 + z) / (1 - z) (Beardon, Chapter 7), which
                 takes the disk's middle to i and its edge to the line.
     spread out  trees only: the start in the middle, the cells k steps
                 away on the circle of radius k, and each cell's
                 children sharing its slice of the circle
                 (spreadPlace, js/sim-graphs.js)
   Each cell is drawn filled in its color: on a tiling the whole cell, on
   a tree a coin on its vertex (a dot in the spread-out picture); tiny
   cells are single dots. Under it all, the whole tiling (or tree) is
   drawn in thin gray. (These are the random mountain's pictures; the
   mountain still has its own copy of this code, for now.)

   In the disk and the half-plane, dragging moves you around the plane:
   the point you grab follows the pointer, and the whole picture moves
   by the hyperbolic motion that carries one to the other (so cells
   change size as they move, but never shape). "Back to the start" puts
   the first cell back in the middle.

   A sim keeps one "disk view" (makeDiskView): which graph, which
   picture, and how far the view has been moved. Then it calls
     diskPen, drawDiskFrame, drawOnDisk   the disk or the half-plane
     drawSpreadTree, spreadSpot           the spread-out tree
     pressDisk, moveDisk, releaseDisk     dragging
     makeBall                             the ball of R steps a sim runs on
     showGraphPresets, readGraphOptions   the Graph options on the page

   The file is split into numbered sections:
     1. Settings
     2. The disk view
     3. From the disk to the screen
     4. Drawing the disk and the half-plane
     5. Drawing a tree spread out
     6. Dragging
     7. A ball of R steps, for the sims that need a finite graph
     8. The graph options on the page

   Reference: A. F. Beardon, "The Geometry of Discrete Groups",
   Springer, 1983, Chapter 7.
   ===================================================================== */


/* =====================================================================
   1. SETTINGS
   ===================================================================== */

// The graph presets (js/sim-graphs.js makes them; q = Infinity is the
// tree whose cells meet p at a time). The first one is the default.
const GRAPH_PRESETS = [
  { name: "{7, 3}", graph: { kind: "tiling", p: 7, q: 3 } },
  { name: "{5, 4}", graph: { kind: "tiling", p: 5, q: 4 } },
  { name: "{4, 5}", graph: { kind: "tiling", p: 4, q: 5 } },
  { name: "{3, 7}", graph: { kind: "tiling", p: 3, q: 7 } },
  { name: "Tree, degree 3", graph: { kind: "tiling", p: 3, q: Infinity } },
  { name: "Tree, degree 4", graph: { kind: "tiling", p: 4, q: Infinity } },
];

const UNDER_COLOR = "#b4b1aa";     // the gray of the tiling's lines
const SMALLEST_UNDER = 1.2;        // cells smaller than this (inradius, in pixels) get no gray lines
const MOST_UNDER = 40000;          // and at most this many cells do
const CELL_EDGE = "rgba(0, 0, 0, 0.25)";   // the thin line around each colored cell


/* =====================================================================
   2. THE DISK VIEW
   ===================================================================== */

// Everything one picture of a graph needs. "canvas" is the canvas it is
// drawn on.
function makeDiskView(canvas) {
  return {
    canvas: canvas,
    spec: GRAPH_PRESETS[0].graph,   // the graph, as makeGraph (js/sim-graphs.js) wants it
    picture: "disk",                // "disk", "half" (the half-plane) or "spread" (trees only)
    motion: [1, 0, 0, 0],           // how far the view has been moved from the start
    box: null,                      // where the picture is on the canvas (set when it is drawn)
    shape: null, shapeFor: null,    // the first cell's shape, worked out for the graph "shapeFor"
    dragFrom: null,                 // the point of the disk being dragged, if any
  };
}

// Whether a graph is a tree.
function isTree(spec) { return spec.q === Infinity; }

// The shape of the graph's first cell (tilingShape, js/sim-graphs.js),
// worked out again only when the graph changes.
function diskShape(dv) {
  if (dv.shapeFor !== dv.spec) { dv.shapeFor = dv.spec; dv.shape = tilingShape(dv.spec.p, dv.spec.q); }
  return dv.shape;
}

// The motion A (a cell's place, from graph.place) as seen in the
// picture: moved by the view.
function seenFrom(dv, A) { return motionTimes(dv.motion, A); }

// Put the first cell back in the middle.
function backToStart(dv) { dv.motion = [1, 0, 0, 0]; }


/* =====================================================================
   3. FROM THE DISK TO THE SCREEN
   ---------------------------------------------------------------------
   Where the picture is on the canvas (dv.box): for the disk
   { cx, cy, radius }, for the half-plane { cx, base, unit } (the line
   is "base" pixels down, and a length of 1 is "unit" pixels).
   ===================================================================== */

// The point w = i (1 + z) / (1 - z) of the half-plane that the point
// z = (x, y) of the disk goes to, as [re, im]. (Worked out:
// re = -2y / D, im = (1 - x^2 - y^2) / D, with D = (1 - x)^2 + y^2.)
function toHalfPlane(x, y) {
  const D = Math.max((1 - x) * (1 - x) + y * y, 1e-12);   // the edge point z = 1 goes infinitely far up
  return [-2 * y / D, (1 - x * x - y * y) / D];
}

// Where a point (x, y) of the disk lands on the screen. In the disk:
// at (cx + x radius, cy - y radius) (y goes up). In the half-plane: its
// point w, "unit" pixels per length 1, with the line at "base".
function diskToScreen(dv, x, y) {
  const b = dv.box;
  if (dv.picture === "disk") return [b.cx + x * b.radius, b.cy - y * b.radius];
  const [re, im] = toHalfPlane(x, y);
  // (Far off the screen, kept to a size the canvas can handle.)
  return [b.cx + Math.max(-1e5, Math.min(1e5, re * b.unit)), b.base - Math.min(1e5, im * b.unit)];
}

// Where the middle of the cell with place A is on the screen.
function cellSpot(dv, A) {
  return diskToScreen(dv, ...motionApply(seenFrom(dv, A), 0, 0));
}

// How big a cell looks, in pixels (about its inradius), if its middle is
// at the point (x, y) of the disk. The disk shrinks lengths near (x, y)
// by 1 - x^2 - y^2, and the half-plane near w by Im(w) (Beardon,
// Chapter 7; the two agree for the cell in the middle of each).
function cellPixels(dv, x, y) {
  const b = dv.box, middle = diskShape(dv).middle;
  if (dv.picture === "disk") return b.radius * middle * (1 - x * x - y * y);
  return 2 * b.unit * middle * toHalfPlane(x, y)[1];
}

// Whether the gray lines of a cell whose middle is at the point (x, y)
// of the disk could show on the screen. In the disk they always can. In
// the half-plane most cells are off it, to the sides and above: the
// points within hyperbolic distance R of w are between heights
// Im(w) e^-R and Im(w) e^R, and at most Im(w) sinh(R) to either side
// (Beardon, Chapter 7), with R the cell's circumradius (for a tree's
// lines, its inradius).
function onScreen(dv, x, y) {
  if (dv.picture === "disk") return true;
  const shape = diskShape(dv), b = dv.box;
  const R = isTree(shape) ? shape.inradius : shape.circumradius;
  const [re, im] = toHalfPlane(x, y);
  return im * Math.exp(-R) < b.base / b.unit && Math.abs(re) - im * Math.sinh(R) < dv.canvas.clientWidth / 2 / b.unit;
}


/* =====================================================================
   4. DRAWING THE DISK AND THE HALF-PLANE
   ===================================================================== */

// Make the canvas the picture's size (the canvas's width, and "height"
// screen pixels) and return its pen, ready to draw in screen pixels.
function diskPen(dv, height) {
  const canvas = dv.canvas, width = canvas.clientWidth;
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  canvas.style.height = height + "px";
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  return pen;
}

// The ground: the disk (the whole plane), or for the half-plane
// everything above the line near the bottom, with the start's middle
// (w = i) a third of the way up. Filled with "inside", edged with "edge".
function drawDiskFrame(dv, pen, height, inside, edge) {
  const width = dv.canvas.clientWidth;
  pen.beginPath();
  if (dv.picture === "disk") {
    dv.box = { cx: width / 2, cy: height / 2, radius: Math.min(width, height) / 2 - 4 };
    pen.arc(dv.box.cx, dv.box.cy, dv.box.radius, 0, 2 * Math.PI);
  } else {
    const base = height - 12;
    dv.box = { cx: width / 2, base: base, unit: base / 3 };
    pen.rect(0, 0, width, base);
  }
  pen.fillStyle = inside;
  pen.fill();
  pen.strokeStyle = edge;
  pen.stroke();
}

// Add the outline of the cell with motion A to the pen's path (for
// small cells, every 4th point of it is plenty).
function traceOutline(dv, pen, A, size) {
  const outline = diskShape(dv).outline, every = size < 5 ? 4 : 1;
  for (let k = 0; k < outline.length; k += every) {
    const [x, y] = diskToScreen(dv, ...motionApply(A, outline[k][0], outline[k][1]));
    if (k === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
  }
  pen.closePath();
}

// Add the lines from the middle of the cell with motion A to the middle
// of each of its sides. On a tree, those lines from all the cells are
// the tree itself: each edge runs from one cell's middle, through the
// side the two cells share, to the other's. (Each half is a straight
// line through the middle of the first cell, moved by A, so it is a
// hyperbolic straight line: a circle arc in the disk.)
function traceSpokes(dv, pen, A) {
  const POINTS = 6;
  for (const [sx, sy] of diskShape(dv).sides) {
    for (let j = 0; j <= POINTS; j++) {
      const [x, y] = diskToScreen(dv, ...motionApply(A, sx * j / POINTS, sy * j / POINTS));
      if (j === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
    }
  }
}

// The cells, after drawDiskFrame: "count" cells, cell i at place
// placeOf(i) (a motion, from graph.place) and filled with colorOf(i) (a
// CSS color). On a tiling each cell is drawn whole; on a tree as a coin
// on its vertex, a bit over half way to the middle of each edge, so the
// tree's lines show between the coins. Tiny ones are single dots. Under
// them, the whole tiling (or tree) in thin gray; "under" is a graph from
// makeGraph to draw it from, or null for none.
function drawOnDisk(dv, pen, under, count, placeOf, colorOf) {
  const tree = isTree(dv.spec);
  if (under) drawUnder(dv, pen, under);
  pen.lineWidth = 0.5;
  pen.strokeStyle = CELL_EDGE;
  for (let i = 0; i < count; i++) {
    const A = seenFrom(dv, placeOf(i));
    const [mx, my] = motionApply(A, 0, 0);                  // the cell's middle
    const size = cellPixels(dv, mx, my);
    const [x, y] = diskToScreen(dv, mx, my);
    pen.fillStyle = colorOf(i);
    if (size < 0.7) {                                       // tiny: a single dot
      pen.fillRect(x - 0.5, y - 0.5, 1, 1);
      continue;
    }
    pen.beginPath();
    if (tree) pen.arc(x, y, 0.55 * size, 0, 2 * Math.PI);
    else traceOutline(dv, pen, A, size);
    pen.fill();
    if (size > 4) pen.stroke();
  }
}

// The whole tiling (or tree) in thin gray lines: every cell big enough
// to see, around wherever the view is. A tiling is drawn as the
// outlines of its cells; a tree as its edges (traceSpokes). It is a
// breadth-first search from the cell nearest the middle of the
// picture, going out until cells are too small to see, or (in the
// half-plane) off the screen. Cells only get smaller farther out, so
// every cell big enough is reached.
function drawUnder(dv, pen, graph) {
  const tree = isTree(dv.spec);
  const first = cellNearestMiddle(dv, graph);
  const seen = new Set([first]), queue = [first];
  pen.beginPath();
  for (let n = 0; n < queue.length && n < MOST_UNDER; n++) {
    const A = seenFrom(dv, graph.place(queue[n]));
    const [mx, my] = motionApply(A, 0, 0);
    const size = cellPixels(dv, mx, my);
    if (size < SMALLEST_UNDER || !onScreen(dv, mx, my)) continue;
    if (tree) traceSpokes(dv, pen, A);
    else { pen.moveTo(...diskToScreen(dv, mx, my)); traceOutline(dv, pen, A, size); }
    for (const w of graph.neighbors(queue[n])) {
      if (!seen.has(w)) { seen.add(w); queue.push(w); }
    }
  }
  pen.lineWidth = 0.6;
  pen.strokeStyle = UNDER_COLOR;
  pen.stroke();
}

// The cell nearest the middle of the picture: start at the first cell
// and keep stepping to whichever neighbor is nearer the middle, until
// none is. (cosh of the distance from the middle is coshFromStart of
// the cell's motion moved by the view.)
function cellNearestMiddle(dv, graph) {
  const away = function (v) { return coshFromStart(seenFrom(dv, graph.place(v))); };
  let v = 0, best = away(0);
  for (;;) {
    let next = -1;
    for (const w of graph.neighbors(v)) {
      const d = away(w);
      if (d < best) { best = d; next = w; }
    }
    if (next === -1) return v;
    v = next;
  }
}


/* =====================================================================
   5. DRAWING A TREE SPREAD OUT
   ---------------------------------------------------------------------
   The start in the middle, the cells k steps away on the circle of
   radius k (in rings "gap" pixels apart), each cell's children sharing
   its slice of the circle. Under the cells, the tree itself in thin
   gray lines, out to one ring past the deepest cell, leaving out cells
   packed closer than about 2 pixels.
   ===================================================================== */

// "count" cells, cell i at depth depthOf(i) and angle angleOf(i) (in
// turns; both from spreadPlace, js/sim-graphs.js), filled with
// colorOf(i). Draws on a fresh canvas "height" pixels tall.
function drawSpreadTree(dv, height, count, depthOf, angleOf, colorOf) {
  const pen = diskPen(dv, height), p = dv.spec.p;
  const width = dv.canvas.clientWidth;
  let deepest = 0;
  for (let i = 0; i < count; i++) deepest = Math.max(deepest, depthOf(i));
  const radius = Math.min(width, height) / 2 - 8;
  dv.box = { cx: width / 2, cy: height / 2, gap: radius / (deepest + 1) };
  const gap = dv.box.gap;
  // The share of the circle each cell at depth k gets.
  const share = function (k) { return k === 0 ? 1 : 1 / (p * Math.pow(p - 1, k - 1)); };

  // The tree, cell by cell from the start: a line from each cell to
  // each of its children.
  pen.beginPath();
  (function branch(k, low, w) {
    if (k > deepest) return;
    const kids = k === 0 ? p : p - 1;
    // Children packed closer than 2 pixels on their circle: left out.
    if ((k + 1) * gap * 2 * Math.PI * (w / kids) < 2) return;
    const [x0, y0] = spreadSpot(dv, k, low + w / 2);
    for (let j = 0; j < kids; j++) {
      const childLow = low + j * w / kids;
      pen.moveTo(x0, y0);
      pen.lineTo(...spreadSpot(dv, k + 1, childLow + w / kids / 2));
      branch(k + 1, childLow, w / kids);
    }
  })(0, 0, 1);
  pen.lineWidth = 0.6;
  pen.strokeStyle = UNDER_COLOR;
  pen.stroke();

  // The cells: dots, as big as there is room for on their circle.
  for (let i = 0; i < count; i++) {
    const k = depthOf(i), [x, y] = spreadSpot(dv, k, angleOf(i));
    pen.fillStyle = colorOf(i);
    pen.beginPath();
    pen.arc(x, y, spreadDot(dv, k), 0, 2 * Math.PI);
    pen.fill();
  }
  return pen;
}

// Where depth k and angle a (in turns) are on the screen.
function spreadSpot(dv, k, a) {
  const b = dv.box;
  return [b.cx + k * b.gap * Math.cos(2 * Math.PI * a), b.cy - k * b.gap * Math.sin(2 * Math.PI * a)];
}

// The radius of a cell's dot at depth k: as big as there is room for
// on its circle (the arc each cell at depth k gets).
function spreadDot(dv, k) {
  const p = dv.spec.p, gap = dv.box.gap;
  const room = k === 0 ? gap : k * gap * 2 * Math.PI / (p * Math.pow(p - 1, k - 1));
  return Math.max(1.2, Math.min(0.35 * gap, 0.45 * room));
}


/* =====================================================================
   6. DRAGGING
   ---------------------------------------------------------------------
   The motion carrying the point "from" to the point "to" (and turning
   nothing): move "from" to 0, then 0 to "to". (The motion moving c to 0
   is a = 1/s, b = -c/s, with s = sqrt(1 - |c|^2).) A page calls
   pressDisk, moveDisk and releaseDisk from its own pointer events, and
   draws again when moveDisk says the view moved.
   ===================================================================== */

// The point of the disk under the pointer (in the half-plane, the
// point of the disk that goes there: z = (w - i) / (w + i)).
function diskPoint(dv, event) {
  const box = dv.canvas.getBoundingClientRect(), b = dv.box;
  let x, y;
  if (dv.picture === "disk") {
    x = (event.clientX - box.left - b.cx) / b.radius;
    y = -(event.clientY - box.top - b.cy) / b.radius;
  } else {
    const re = (event.clientX - box.left - b.cx) / b.unit;
    const im = Math.max((b.base - (event.clientY - box.top)) / b.unit, 0.01);
    // (re + i (im - 1)) / (re + i (im + 1)), worked out:
    const D = re * re + (im + 1) * (im + 1);
    x = (re * re + im * im - 1) / D;
    y = -2 * re / D;
  }
  const r = Math.hypot(x, y), most = 0.97;      // very near the edge, a tiny drag would move far
  return r > most ? [x * most / r, y * most / r] : [x, y];
}

function moveBetween(from, to) {
  const s0 = Math.sqrt(1 - from[0] * from[0] - from[1] * from[1]);
  const s1 = Math.sqrt(1 - to[0] * to[0] - to[1] * to[1]);
  return motionTimes([1 / s1, 0, to[0] / s1, to[1] / s1], [1 / s0, 0, -from[0] / s0, -from[1] / s0]);
}

function pressDisk(dv, event) {
  if (!dv.box || dv.picture === "spread") return;
  dv.dragFrom = diskPoint(dv, event);
  dv.canvas.setPointerCapture(event.pointerId);
}

// Returns true if the view moved.
function moveDisk(dv, event) {
  if (!dv.dragFrom) return false;
  const to = diskPoint(dv, event);
  const M = motionTimes(moveBetween(dv.dragFrom, to), dv.motion);
  const norm = Math.sqrt(M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3]);   // keep |a|^2 - |b|^2 = 1
  const moved = M.map(function (t) { return t / norm; });
  // The view goes at most distance 20 from the start: farther out the
  // picture's numbers get too rough to place cells well.
  if (coshFromStart(moved) < Math.cosh(20)) dv.motion = moved;
  dv.dragFrom = to;
  return true;
}

function releaseDisk(dv) { dv.dragFrom = null; }


/* =====================================================================
   7. A BALL OF R STEPS, FOR THE SIMS THAT NEED A FINITE GRAPH
   ---------------------------------------------------------------------
   The ball is the start cell (cell 0 of the graph) and every cell
   within R steps of it, numbered 0 .. n-1 outward from the start, with
   only the edges inside the ball. It has what js/sim-domains.js's
   domains have for a sim's chain (n, and the neighbors of cell v are
   nbr[first[v]] .. nbr[first[v + 1] - 1]), plus:
     R        the radius used: the one asked for, or less if that ball
              would have more than "most" cells
     cell     cell[i] = the graph's own number for cell i
     place    cell i's place (its motion, for drawOnDisk) is
              place[4i .. 4i+3]
     depth, angle   on a tree, where cell i goes in the spread-out
              picture (spreadPlace, js/sim-graphs.js)
   ===================================================================== */
function makeBall(graph, R, most) {
  // The cells, layer by layer, while there is room for the next layer.
  const cells = [0], number = new Map([[0, 0]]);
  let layer = [0], used = 0;
  while (used < R) {
    const next = [], inNext = new Set();
    for (const u of layer) {
      for (const w of graph.neighbors(u)) {
        if (!number.has(w) && !inNext.has(w)) { inNext.add(w); next.push(w); }
      }
    }
    if (cells.length + next.length > most || graph.full) break;
    for (const w of next) { number.set(w, cells.length); cells.push(w); }
    layer = next;
    used++;
  }

  const n = cells.length;
  const first = new Int32Array(n + 1), nbr = [];
  const place = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) {
    first[i] = nbr.length;
    for (const w of graph.neighbors(cells[i])) {
      if (number.has(w)) nbr.push(number.get(w));
    }
    place.set(graph.place(cells[i]), 4 * i);
  }
  first[n] = nbr.length;

  const ball = { n: n, first: first, nbr: Int32Array.from(nbr), R: used, cell: cells,
                 place: place, depth: null, angle: null };
  if (graph.shape && isTree(graph.shape) && graph.parent) {
    ball.depth = new Float64Array(n);
    ball.angle = new Float64Array(n);
    for (let i = 0; i < n; i++) [ball.depth[i], ball.angle[i]] = spreadPlace(graph, cells[i]);
  }
  return ball;
}

// Cell i's place, as a motion (for drawOnDisk and cellSpot).
function ballPlace(ball, i) { return ball.place.subarray(4 * i, 4 * i + 4); }

// The cell of the ball under the pointer: in the disk or the half-plane,
// the cell whose middle is nearest the pointer (in the hyperbolic
// distance, which grows with |z - m|^2 / (1 - |m|^2) for a fixed
// pointer z and a middle m; Beardon, Chapter 7); in the spread-out
// picture, the nearest dot.
function ballCellUnder(dv, ball, event) {
  let best = -1, bestFar = Infinity;
  if (dv.picture === "spread") {
    const box = dv.canvas.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    for (let i = 0; i < ball.n; i++) {
      const [sx, sy] = spreadSpot(dv, ball.depth[i], ball.angle[i]);
      const far = Math.hypot(sx - x, sy - y);
      if (far < bestFar) { bestFar = far; best = i; }
    }
    return best;
  }
  const [zx, zy] = diskPoint(dv, event);
  for (let i = 0; i < ball.n; i++) {
    const [mx, my] = motionApply(seenFrom(dv, ballPlace(ball, i)), 0, 0);
    const far = ((zx - mx) * (zx - mx) + (zy - my) * (zy - my)) / (1 - mx * mx - my * my);
    if (far < bestFar) { bestFar = far; best = i; }
  }
  return best;
}


/* =====================================================================
   8. THE GRAPH OPTIONS ON THE PAGE
   ---------------------------------------------------------------------
   Every page that offers "Hyperbolic plane or tree" uses the same ids:
   graph-presets (a row for the preset buttons), the radio buttons
   "graph-kind" (tiling / tree), the boxes set-p, set-q and set-degree,
   graph-info (says what the graph is), and the "Drawn in" radio buttons
   "picture", with the spread-out one inside spread-choice.
   ===================================================================== */

// One button per preset; a click fills in the options and calls onPick.
function showGraphPresets(onPick) {
  const row = byId("graph-presets");
  row.innerHTML = "";
  for (const preset of GRAPH_PRESETS) {
    const button = document.createElement("button");
    button.className = "tool-button";
    button.textContent = preset.name;
    button.addEventListener("click", function () {
      const g = preset.graph;
      document.querySelector('input[name="graph-kind"][value="' + (isTree(g) ? "tree" : "tiling") + '"]').checked = true;
      if (isTree(g)) byId("set-degree").value = g.p;
      else { byId("set-p").value = g.p; byId("set-q").value = g.q; }
      onPick();
    });
    row.appendChild(button);
  }
}

// Read the graph from the options into dv.spec, and say what it is.
// Returns false (and leaves dv.spec alone) if it isn't hyperbolic. The
// spread-out picture is offered for trees only.
function readGraphOptions(dv) {
  const info = byId("graph-info");
  let next;
  if (checked("graph-kind") === "tree") {
    const d = readWhole("set-degree", 3, 12, 3);
    next = { kind: "tiling", p: d, q: Infinity };
    info.textContent = "The tree where every cell has " + d + " neighbors, drawn as ideal " + d +
      "-gons (their corners are on the edge of the disk, infinitely far away).";
  } else {
    const p = readWhole("set-p", 3, 12, 7), q = readWhole("set-q", 3, 12, 3);
    if (1 / p + 1 / q >= 1 / 2) {
      info.textContent = "{" + p + ", " + q + "} isn't hyperbolic: that needs 1/p + 1/q < 1/2. " +
        (1 / p + 1 / q === 1 / 2 ? "It tiles the flat plane." : "It tiles a sphere.");
      return false;
    }
    next = { kind: "tiling", p: p, q: q };
    info.textContent = "Every cell is a regular " + p + "-gon, " + q + " of them meet at every corner, " +
      "and each cell has " + p + " neighbors.";
  }
  if (next.p !== dv.spec.p || next.q !== dv.spec.q) dv.spec = next;
  const tree = isTree(next);
  byId("spread-choice").hidden = !tree;
  if (!tree && dv.picture === "spread") {
    dv.picture = "disk";
    document.querySelector('input[name="picture"][value="disk"]').checked = true;
  }
  return true;
}
