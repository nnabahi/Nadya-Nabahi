/* =====================================================================
   sim-hyperbolic.js  —  pictures of a hyperbolic tiling or a tree,
   shared by the sims that offer "Hyperbolic plane or tree"
   ---------------------------------------------------------------------
   The graphs themselves are made in js/sim-graphs.js (load it first);
   this file draws them, and builds the finite "ball" the sims run on.
   It also needs js/sim-page.js and js/sim-view.js, whose view zooms and
   moves the pictures.

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
   drawn in thin gray.

   In the disk and the half-plane, dragging moves you around the plane:
   the point you grab follows the pointer, and the whole picture moves
   by the hyperbolic motion that carries one to the other (so cells
   change size as they move, but never shape). "Back to the start" puts
   the first cell back in the middle. The "Slide" button switches
   dragging to sliding the whole picture instead (press it again to
   switch back). All three pictures also zoom and slide like the square
   grid, with the page's view (js/sim-view.js): it zooms and moves the
   whole picture (the function zoomed), and the drawing leaves out what
   is off the screen. Unlike the square grid, they slide anywhere, even
   past their edges ("Reset" brings them back). The spread-out tree
   always slides, and with two fingers, so do the disk and the
   half-plane (and they zoom too).

   A sim keeps one "disk view" (makeDiskView): which graph, which
   picture, and how far the plane has been moved. Then it calls
     diskShape, diskGraph, isTree         the graph's first cell, the graph itself, is it a tree?
     backToStart                          put the start back in the middle
     diskPen, drawDiskFrame, drawOnDisk   the disk or the half-plane
     drawUnder                            the whole tiling (or tree), in gray
     drawBallBorders                      lines between colors on a tiling
     drawBallBonds                        the ball drawn as a graph (bond percolation)
     drawSpreadTree, spreadSpot, spreadDot   the spread-out tree
     seenFrom, diskToScreen, cellPixels, onScreen   where a cell is on the screen
     startPlaneDrag, dragPlane            dragging across the plane
     ballFromOptions, makeBall, ballPlace the ball of R steps a sim runs on, and its cells' places
     drawBall, ballSpot                   drawing it, one color per cell
     ballCellUnder, ballCellAt            the cell of the ball under the pointer
     showGraphPresets, readGraphOptions   the Graph options on the page

   The file is split into numbered sections:
     1. Settings
     2. The disk view
     3. From the disk to the screen
     4. Drawing the disk and the half-plane
     5. Drawing a tree spread out
     6. Dragging across the plane
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
const SMALLEST_BORDER = 2;         // cells smaller than this (inradius, in pixels) get no lines between colors
const BOND_GRAY = "#c9c6bf";       // closed edges, in drawBallBonds
// The view (js/sim-view.js) counts these pictures as ZOOM_CELLS "cells"
// across their shorter side, so they zoom in up to about 50 times.
const ZOOM_CELLS = 60;

// A sim's ball (section 7), drawn by drawBall:
const BALL_HEIGHT = 480;           // the picture's height, in screen pixels
const BALL_OUTSIDE = "#ecebe7";    // the plane around the ball
const BALL_WHITE_DOT = "#d8d5ce";  // white cells, as dots in the spread-out tree (white dots wouldn't show)


/* =====================================================================
   2. THE DISK VIEW
   ===================================================================== */

// Everything one picture of a graph needs. "canvas" is the canvas it is
// drawn on, and "view" the page's view of it (makeView, js/sim-view.js),
// which zooms and slides the picture. Also connects the page's buttons
// for these pictures:
//   "Drawn in"           (radio buttons name="picture") picks the
//                        picture; a new one starts unzoomed, and
//                        onPicture() (the page's) shows the options
//                        that fit it
//   "Back to the start"  (id "disk-reset") puts the start back in the
//                        middle
//   "Slide"              (id "disk-slide") switches what dragging does
function makeDiskView(canvas, view, onPicture) {
  const dv = {
    canvas: canvas,
    view: view,
    spec: GRAPH_PRESETS[0].graph,   // the graph, as makeGraph (js/sim-graphs.js) wants it
    picture: "disk",                // "disk", "half" (the half-plane) or "spread" (trees only)
    motion: [1, 0, 0, 0],           // how far the plane has been moved from the start
    box: null,                      // where the picture is on the canvas (set when it is drawn)
    shape: null, shapeFor: null,    // the first cell's shape, worked out for the graph "shapeFor"
    graph: null, graphFor: null,    // the graph itself, made for the graph "graphFor" (diskGraph)
    dragFrom: null,                 // the point of the disk being dragged, if any
    slide: false,                   // true: dragging slides the whole picture instead
  };
  for (const radio of document.querySelectorAll('input[name="picture"]')) {
    radio.addEventListener("change", function () {
      dv.picture = radio.value;
      onPicture();
      resetView(view);
    });
  }
  byId("disk-reset").addEventListener("click", function () { backToStart(dv); view.redraw(); });
  const slide = byId("disk-slide");
  slide.addEventListener("click", function () {
    dv.slide = !dv.slide;
    slide.classList.toggle("selected", dv.slide);   // looks pressed while on
  });
  return dv;
}

// Whether a graph is a tree.
function isTree(spec) { return spec.q === Infinity; }

// The shape of the graph's first cell (tilingShape, js/sim-graphs.js),
// worked out again only when the graph changes.
function diskShape(dv) {
  if (dv.shapeFor !== dv.spec) { dv.shapeFor = dv.spec; dv.shape = tilingShape(dv.spec.p, dv.spec.q); }
  return dv.shape;
}

// The graph itself (makeGraph, js/sim-graphs.js), made again only when
// the graph changes.
function diskGraph(dv) {
  if (dv.graphFor !== dv.spec) { dv.graphFor = dv.spec; dv.graph = makeGraph(dv.spec); }
  return dv.graph;
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
   is "base" pixels down, and a length of 1 is "unit" pixels), both with
   the zoom; and the canvas's width and height.
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

// How big a cell looks, in pixels (about its inradius), if its middle is
// at the point (x, y) of the disk. The disk shrinks lengths near (x, y)
// by 1 - x^2 - y^2, and the half-plane near w by Im(w) (Beardon,
// Chapter 7; the two agree for the cell in the middle of each).
function cellPixels(dv, x, y) {
  const b = dv.box, middle = diskShape(dv).middle;
  if (dv.picture === "disk") return b.radius * middle * (1 - x * x - y * y);
  return 2 * b.unit * middle * toHalfPlane(x, y)[1];
}

// Whether a cell whose middle is at the point (x, y) of the disk could
// show on the screen: everything within hyperbolic distance R of its
// middle, with R the cell's circumradius (for a tree, its inradius:
// the tree's lines and the coins stay that close).
// In the disk, a hyperbolic circle is a Euclidean circle (Beardon,
// Chapter 7); worked out from its middle and radius there, it stays
// within (1 - |z|^2) t / (1 - t) of z, with t = tanh(R / 2).
// In the half-plane, the points within distance R of w are between
// heights Im(w) e^-R and Im(w) e^R, and at most Im(w) sinh(R) to
// either side (Beardon, Chapter 7).
function onScreen(dv, x, y) {
  const shape = diskShape(dv), b = dv.box;
  const R = isTree(shape) ? shape.inradius : shape.circumradius;
  if (dv.picture === "disk") {
    const t = Math.tanh(R / 2), reach = b.radius * (1 - x * x - y * y) * t / (1 - t);
    const [sx, sy] = diskToScreen(dv, x, y);
    return sx + reach > 0 && sx - reach < b.width && sy + reach > 0 && sy - reach < b.height;
  }
  const [re, im] = toHalfPlane(x, y);
  const left = -b.cx / b.unit, right = (b.width - b.cx) / b.unit;      // the screen's sides, as Re(w)
  const top = b.base / b.unit, bottom = (b.base - b.height) / b.unit;  // its top and bottom, as Im(w)
  return im * Math.exp(-R) < top && im * Math.exp(R) > bottom &&
         re + im * Math.sinh(R) > left && re - im * Math.sinh(R) < right;
}


/* =====================================================================
   4. DRAWING THE DISK AND THE HALF-PLANE
   ===================================================================== */

// Make the canvas the picture's size (the canvas's width, and "height"
// screen pixels) and return its pen, ready to draw in screen pixels.
// The view (js/sim-view.js) zooms and moves these pictures as it does
// the square grid: its box is the whole canvas, measured in "cells" a
// ZOOM_CELLS-th of the canvas's shorter side.
function diskPen(dv, height) {
  const canvas = dv.canvas, width = canvas.clientWidth, view = dv.view;
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  canvas.style.height = height + "px";
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  view.left = 0;
  view.top = 0;
  view.width = width;
  view.height = height;
  view.size = Math.min(width, height) / ZOOM_CELLS;
  view.free = true;     // these pictures slide anywhere, even past their edges
  return pen;
}

// How many times bigger the view's zoom makes the picture. (The size of
// one of the view's cells, cellSize in js/sim-view.js, over its size
// unzoomed; it is the zoom itself unless the view rounds cells to whole
// pixels.)
function zoomFactor(dv) { return cellSize(dv.view) / dv.view.size; }

// Where the point (px, py) of the whole, unzoomed picture is on the
// screen, with the view's zoom and move.
function zoomed(dv, px, py) {
  const view = dv.view, f = zoomFactor(dv);
  return [(px + view.scroll.x * view.size) * f, (py + view.scroll.y * view.size) * f];
}

// The ground: the disk (the whole plane), or for the half-plane
// everything above the line near the bottom, with the start's middle
// (w = i) a third of the way up; zoomed and moved by the view. Filled
// with "inside", edged with "edge".
function drawDiskFrame(dv, pen, height, inside, edge) {
  const width = dv.canvas.clientWidth, f = zoomFactor(dv);
  pen.beginPath();
  if (dv.picture === "disk") {
    const [cx, cy] = zoomed(dv, width / 2, height / 2);
    dv.box = { cx: cx, cy: cy, radius: (Math.min(width, height) / 2 - 4) * f, width: width, height: height };
    pen.arc(dv.box.cx, dv.box.cy, dv.box.radius, 0, 2 * Math.PI);
  } else {
    const [cx, base] = zoomed(dv, width / 2, height - 12);
    dv.box = { cx: cx, base: base, unit: (height - 12) / 3 * f, width: width, height: height };
    pen.rect(0, 0, width, base);
  }
  pen.fillStyle = inside;
  pen.fill();
  pen.strokeStyle = edge;
  pen.stroke();
}

// Add the outline of the cell with motion A to the pen's path (for
// small cells, every 4th point of it is plenty). "place" (diskToScreen
// if left out) says where a point of the disk goes.
function traceOutline(dv, pen, A, size, place) {
  const outline = diskShape(dv).outline, every = size < 5 ? 4 : 1;
  for (let k = 0; k < outline.length; k += every) {
    const [x, y] = motionApply(A, outline[k][0], outline[k][1]);
    const [sx, sy] = place ? place(x, y) : diskToScreen(dv, x, y);
    if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
  }
  pen.closePath();
}

// Add the lines from the middle of the cell with motion A to the middle
// of each of its sides. On a tree, those lines from all the cells are
// the tree itself: each edge runs from one cell's middle, through the
// side the two cells share, to the other's. (Each half is a straight
// line through the middle of the first cell, moved by A, so it is a
// hyperbolic straight line: a circle arc in the disk.) "place" is as in
// traceOutline.
function traceSpokes(dv, pen, A, place) {
  for (let k = 0; k < diskShape(dv).sides.length; k++) traceSpoke(dv, pen, A, k, place);
}

// One of those lines: from the middle of the cell with motion A to the
// middle of its side k.
function traceSpoke(dv, pen, A, k, place) {
  const POINTS = 6, [mx, my] = diskShape(dv).sides[k];
  for (let j = 0; j <= POINTS; j++) {
    const [x, y] = motionApply(A, mx * j / POINTS, my * j / POINTS);
    const [sx, sy] = place ? place(x, y) : diskToScreen(dv, x, y);
    if (j === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
  }
}

// The cells, after drawDiskFrame: "count" cells, cell i at place
// placeOf(i) (a motion, from graph.place) and filled with colorOf(i) (a
// CSS color). On a tiling each cell is drawn whole; on a tree as a coin
// on its vertex, a bit over half way to the middle of each edge, so the
// tree's lines show between the coins. Tiny ones are single dots, and
// ones off the screen are left out. Under them, the whole tiling (or
// tree) in thin gray; "under" is a graph from makeGraph to draw it
// from, or null for none.
function drawOnDisk(dv, pen, under, count, placeOf, colorOf) {
  const tree = isTree(dv.spec);
  drawUnder(dv, pen, under);
  pen.lineWidth = 0.5;
  pen.strokeStyle = CELL_EDGE;
  for (let i = 0; i < count; i++) {
    const A = seenFrom(dv, placeOf(i));
    const [mx, my] = motionApply(A, 0, 0);                  // the cell's middle
    if (!onScreen(dv, mx, my)) continue;
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

// The lines between colors on a tiling, after drawOnDisk: every side of
// every cell of the ball, except the sides it shares with a neighbor of
// the same color (so the edge of the ball gets a line too, like the
// edge of a box). colorOf(i) is cell i's color number, and "style" the
// lines' CSS color. On a tree nothing is drawn: its coins never touch.
function drawBallBorders(dv, pen, ball, colorOf, style) {
  if (isTree(dv.spec)) return;
  const shape = diskShape(dv), p = shape.p, outline = shape.outline;
  const perSide = outline.length / p;      // side k is outline[k * perSide] to the next corner
  const facing = ballSides(ball, p);
  pen.beginPath();
  for (let i = 0; i < ball.n; i++) {
    const A = seenFrom(dv, ballPlace(ball, i));
    const [mx, my] = motionApply(A, 0, 0);                  // the cell's middle
    if (!onScreen(dv, mx, my)) continue;
    const size = cellPixels(dv, mx, my);
    if (size < SMALLEST_BORDER) continue;
    const same = new Array(p).fill(false);                  // same[k]: side k is shared with the same color
    for (let e = ball.first[i]; e < ball.first[i + 1]; e++) {
      if (colorOf(ball.nbr[e]) === colorOf(i)) same[facing[e]] = true;
    }
    const every = size < 5 ? 4 : 1;                         // small cells: every 4th point is plenty
    for (let k = 0; k < p; k++) {
      if (same[k]) continue;
      for (let j = 0; j <= perSide; j += every) {
        const [x, y] = outline[(k * perSide + j) % outline.length];
        const [sx, sy] = diskToScreen(dv, ...motionApply(A, x, y));
        if (j === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
      }
    }
  }
  pen.lineWidth = 1.2;
  pen.strokeStyle = style;
  pen.stroke();
}

// The ball drawn as a graph instead of as cells (bond percolation):
// after drawDiskFrame, or spread out after drawSpreadTree (with no
// dots). Each edge runs from one cell's middle to the other's; in the
// disk and the half-plane it goes through the middle of the side the
// two cells share (two lines of traceSpoke, so it is a hyperbolic
// straight line). isOpen(e) says whether the edge of entry e of
// ball.nbr is open, and colorOf(i) is the color of cell i's open edges
// (a CSS color), or null if it has none. Open edges are thick lines in
// their color with a dot on each end, thinner as the cells get smaller;
// closed edges are thin gray lines; a cell with no open edge is a small
// dot in the color "loose". Tiny cells are a single dot in their color
// (nothing if they have no open edge), and ones off the screen are left
// out.
function drawBallBonds(dv, pen, ball, isOpen, colorOf, loose) {
  const spread = dv.picture === "spread";
  const facing = spread ? null : ballSides(ball, dv.spec.p);
  // Where each cell is on the screen, (x[i], y[i]), and about how big,
  // in pixels (size[i], -1 if it is off the screen); in the disk and the
  // half-plane also its motion, as seen.
  const n = ball.n, x = new Float64Array(n), y = new Float64Array(n);
  const size = new Float64Array(n).fill(-1), seen = new Array(n);
  for (let i = 0; i < n; i++) {
    if (spread) {
      [x[i], y[i]] = spreadSpot(dv, ball.depth[i], ball.angle[i]);
      size[i] = 2 * spreadDot(dv, ball.depth[i]);
      continue;
    }
    const A = seenFrom(dv, ballPlace(ball, i));
    const [mx, my] = motionApply(A, 0, 0);
    if (!onScreen(dv, mx, my)) continue;
    seen[i] = A;
    size[i] = cellPixels(dv, mx, my);
    [x[i], y[i]] = diskToScreen(dv, mx, my);
  }
  // How thick an open edge is between cells about s pixels big (in
  // steps of half a pixel, so the edges of one color and thickness are
  // drawn all at once), and the dots on its ends.
  const thick = function (s) { return Math.max(0.6, Math.min(5, Math.round(0.8 * s) / 2)); };
  const gray = new Path2D(), looseDots = new Path2D();
  const lines = new Map(), dots = new Map();     // color (and thickness) -> its lines, its dots
  const pathFor = function (paths, key, extra) {
    if (!paths.has(key)) paths.set(key, Object.assign({ path: new Path2D() }, extra));
    return paths.get(key).path;
  };

  for (let i = 0; i < n; i++) {
    if (size[i] < 0) continue;
    const color = colorOf(i);
    if (!spread && size[i] < 1) {                 // tiny: a single dot
      if (color !== null) { pen.fillStyle = color; pen.fillRect(x[i] - 0.5, y[i] - 0.5, 1, 1); }
      continue;
    }
    for (let e = ball.first[i]; e < ball.first[i + 1]; e++) {
      const j = ball.nbr[e], open = isOpen(e);
      // Spread out, each edge is drawn once, from the child to its
      // parent, and drawSpreadTree already drew the gray ones.
      if (spread && (ball.depth[j] > ball.depth[i] || !open)) continue;
      const s = size[j] < 0 ? size[i] : Math.min(size[i], size[j]);
      if (!open && s < SMALLEST_UNDER) continue;
      const path = open ? pathFor(lines, color + " " + thick(s), { color: color, width: thick(s) }) : gray;
      if (spread) { path.moveTo(x[i], y[i]); path.lineTo(x[j], y[j]); }
      else traceSpoke(dv, path, seen[i], facing[e]);
    }
    const r = 0.65 * thick(size[i]);
    const dot = color === null ? looseDots : pathFor(dots, color, { color: color });
    const radius = color === null ? 0.6 * r : r;
    dot.moveTo(x[i] + radius, y[i]);
    dot.arc(x[i], y[i], radius, 0, 2 * Math.PI);
  }

  pen.lineCap = "round";
  pen.lineJoin = "round";
  pen.lineWidth = 0.6;
  pen.strokeStyle = BOND_GRAY;
  pen.stroke(gray);
  pen.fillStyle = loose;
  pen.fill(looseDots);
  for (const group of lines.values()) {
    pen.lineWidth = group.width;
    pen.strokeStyle = group.color;
    pen.stroke(group.path);
  }
  for (const group of dots.values()) {
    pen.fillStyle = group.color;
    pen.fill(group.path);
  }
}

// The whole tiling (or tree) of "graph" in thin gray lines: every cell
// big enough to see that shows, whether or not it is in use. A tiling
// is drawn as the outlines of its cells; a tree as its edges
// (traceSpokes). It is a breadth-first search from the cell nearest the
// middle of the screen, going out until cells are too small to see, or
// off the screen. (Where cells are big enough to see, and the screen,
// are both in one piece, so every cell big enough that shows is
// reached.) For the random mountain's 3D floor, "place" and "pixels"
// (diskToScreen and cellPixels if left out) say where a point of the
// disk goes and how big a cell there looks; there, the search starts
// from the middle of the disk, and goes out until cells are too small.
function drawUnder(dv, pen, graph, place, pixels) {
  if (!graph) return;
  const tree = isTree(dv.spec);
  // (The middle of the screen, kept 12 pixels in from the edge of the
  // disk or above the line, where cells are big enough to see.)
  const middle = place ? [0, 0] : diskPointAt(dv, dv.box.width / 2, dv.box.height / 2, 12);
  const first = cellNearest(dv, graph, middle);
  const seen = new Set([first]), queue = [first];
  pen.beginPath();
  for (let n = 0; n < queue.length && n < MOST_UNDER; n++) {
    const A = seenFrom(dv, graph.place(queue[n]));
    const [mx, my] = motionApply(A, 0, 0);
    const size = pixels ? pixels(mx, my) : cellPixels(dv, mx, my);
    // (The first cell always goes on to its neighbors, even if too small
    // or just off the screen.)
    if (n > 0 && (size < SMALLEST_UNDER || (!place && !onScreen(dv, mx, my)))) continue;
    if (tree) traceSpokes(dv, pen, A, place);
    else traceOutline(dv, pen, A, size, place);
    for (const w of graph.neighbors(queue[n])) {
      if (!seen.has(w)) { seen.add(w); queue.push(w); }
    }
  }
  pen.lineWidth = 0.6;
  pen.strokeStyle = UNDER_COLOR;
  pen.stroke();
}

// The cell nearest the point c of the disk: start at the first cell
// and keep stepping to whichever neighbor is nearer c, until none is.
// (cosh of the hyperbolic distance from z to c is
// 1 + 2 |z - c|^2 / ((1 - |z|^2) (1 - |c|^2)) (Beardon, Chapter 7), so
// the cell whose middle z has the smallest |z - c|^2 / (1 - |z|^2) is
// the nearest. For c = 0 that is coshFromStart of the cell's motion
// moved by the view, which stays exact even far out.)
function cellNearest(dv, graph, c) {
  const away = function (v) {
    const A = seenFrom(dv, graph.place(v));
    if (c[0] === 0 && c[1] === 0) return coshFromStart(A);
    const [x, y] = motionApply(A, 0, 0);
    return ((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1])) / Math.max(1 - x * x - y * y, 1e-15);
  };
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
   packed closer than about 2 pixels, and branches off the screen. The
   view zooms and slides it.
   ===================================================================== */

// "count" cells, cell i at depth depthOf(i) and angle angleOf(i) (in
// turns; both from spreadPlace, js/sim-graphs.js), filled with
// colorOf(i) (null: no dot). Draws on a fresh canvas "height" pixels
// tall, and returns its pen.
function drawSpreadTree(dv, height, count, depthOf, angleOf, colorOf) {
  const pen = diskPen(dv, height), p = dv.spec.p;
  const width = dv.canvas.clientWidth;
  let deepest = 0;
  for (let i = 0; i < count; i++) deepest = Math.max(deepest, depthOf(i));
  const [cx, cy] = zoomed(dv, width / 2, height / 2);    // the middle, with the view's zoom and move
  const radius = (Math.min(width, height) / 2 - 8) * zoomFactor(dv);
  dv.box = { cx: cx, cy: cy, gap: radius / (deepest + 1), width: width, height: height };
  const gap = dv.box.gap;
  const at = function (k, a) { return spreadSpot(dv, k, a); };

  // The tree, cell by cell from the start: a line from each cell to
  // each of its children.
  pen.beginPath();
  (function branch(k, low, w) {
    if (k > deepest) return;
    const kids = k === 0 ? p : p - 1;
    // Children packed closer than 2 pixels on their circle: left out.
    if ((k + 1) * gap * 2 * Math.PI * (w / kids) < 2) return;
    // A thin slice wholly off the screen: left out. (Its branches stay
    // between rings k and deepest + 1, and between its two sides, so
    // inside the box around its four corners, made a little bigger for
    // the bulge of the outer circle.)
    if (w < 1 / 8) {
      const corners = [at(k, low), at(k, low + w), at(deepest + 1, low), at(deepest + 1, low + w)];
      const xs = corners.map(function (c) { return c[0]; }), ys = corners.map(function (c) { return c[1]; });
      const bulge = (deepest + 1) * gap * (1 - Math.cos(Math.PI * w));
      if (Math.max(...xs) + bulge < 0 || Math.min(...xs) - bulge > width ||
          Math.max(...ys) + bulge < 0 || Math.min(...ys) - bulge > height) return;
    }
    const [x0, y0] = at(k, low + w / 2);
    for (let j = 0; j < kids; j++) {
      const childLow = low + j * w / kids;
      pen.moveTo(x0, y0);
      pen.lineTo(...at(k + 1, childLow + w / kids / 2));
      branch(k + 1, childLow, w / kids);
    }
  })(0, 0, 1);
  pen.lineWidth = 0.6;
  pen.strokeStyle = UNDER_COLOR;
  pen.stroke();

  // The cells: dots, as big as there is room for on their circle (the
  // ones off the screen are left out).
  for (let i = 0; i < count; i++) {
    const k = depthOf(i), [x, y] = at(k, angleOf(i)), dot = spreadDot(dv, k);
    if (x + dot < 0 || x - dot > width || y + dot < 0 || y - dot > height) continue;
    const color = colorOf(i);
    if (color === null) continue;
    pen.fillStyle = color;
    pen.beginPath();
    pen.arc(x, y, dot, 0, 2 * Math.PI);
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
   6. DRAGGING ACROSS THE PLANE
   ---------------------------------------------------------------------
   The page passes its pointer events to the view (pressPointer and the
   rest, js/sim-view.js), and calls startPlaneDrag after every press and
   release. While exactly one pointer is pressed on the disk or the
   half-plane, dv.dragFrom is the point of the disk it last was on; the
   page then calls dragPlane on each move (instead of movePointer),
   which carries that point to the new one, and draws again. With two
   fingers, on the spread-out tree, or with "Slide" on, the view slides
   (and zooms) the picture instead, as on the square grid.
   ===================================================================== */
function startPlaneDrag(dv) {
  const pressed = Array.from(dv.view.pointers.values());
  const dragsPlane = dv.picture !== "spread" && dv.box !== null && !dv.slide;
  dv.dragFrom = (dragsPlane && pressed.length === 1) ? diskPoint(dv, pressed[0].x, pressed[0].y) : null;
}

function dragPlane(dv, clientX, clientY) {
  const to = diskPoint(dv, clientX, clientY);
  const M = motionTimes(moveBetween(dv.dragFrom, to), dv.motion);
  const norm = Math.sqrt(M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3]);   // keep |a|^2 - |b|^2 = 1
  const moved = M.map(function (t) { return t / norm; });
  // The view goes at most distance 20 from the start: farther out the
  // picture's numbers get too rough to place cells well.
  if (coshFromStart(moved) < Math.cosh(20)) dv.motion = moved;
  dv.dragFrom = to;
}

// The point of the disk under the pointer at (clientX, clientY), kept
// at least 7 pixels in from the edge of the disk (or above the line),
// where a tiny drag would move very far.
function diskPoint(dv, clientX, clientY) {
  const box = dv.canvas.getBoundingClientRect();
  return diskPointAt(dv, clientX - box.left, clientY - box.top, 7);
}

// The point of the disk at (px, py) on the canvas, kept at least "edge"
// pixels in from the edge of the disk (or above the line). In the
// half-plane, it is the point of the disk that goes there:
// z = (w - i) / (w + i).
function diskPointAt(dv, px, py, edge) {
  const b = dv.box;
  if (dv.picture === "disk") {
    const x = (px - b.cx) / b.radius, y = -(py - b.cy) / b.radius;
    const r = Math.hypot(x, y), most = 1 - edge / b.radius;
    return r > most ? [x * most / r, y * most / r] : [x, y];
  }
  const re = (px - b.cx) / b.unit;
  const im = Math.max((b.base - py) / b.unit, edge / b.unit);
  // (re + i (im - 1)) / (re + i (im + 1)), worked out:
  const D = re * re + (im + 1) * (im + 1);
  return [(re * re + im * im - 1) / D, -2 * re / D];
}

// The motion carrying the point "from" to the point "to" (and turning
// nothing): move "from" to 0, then 0 to "to". (The motion moving c to 0
// is a = 1/s, b = -c/s, with s = sqrt(1 - |c|^2).)
function moveBetween(from, to) {
  const s0 = Math.sqrt(1 - from[0] * from[0] - from[1] * from[1]);
  const s1 = Math.sqrt(1 - to[0] * to[0] - to[1] * to[1]);
  return motionTimes([1 / s1, 0, to[0] / s1, to[1] / s1], [1 / s0, 0, -from[0] / s0, -from[1] / s0]);
}


/* =====================================================================
   7. A BALL OF R STEPS, FOR THE SIMS THAT NEED A FINITE GRAPH
   ---------------------------------------------------------------------
   A sim on "Hyperbolic plane or tree" runs on a ball: ballFromOptions
   makes it from the options on the page, drawBall draws it with one
   color per cell, and ballSpot, ballCellUnder and ballCellAt say where
   its cells are on the screen.

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
     side     which side of each cell each edge crosses, once
              drawBallBorders or drawBallBonds has asked for it (ballSides)
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
                 place: place, depth: null, angle: null, side: null };
  if (graph.shape && isTree(graph.shape) && graph.parent) {
    ball.depth = new Float64Array(n);
    ball.angle = new Float64Array(n);
    for (let i = 0; i < n; i++) [ball.depth[i], ball.angle[i]] = spreadPlace(graph, cells[i]);
  }
  return ball;
}

// Cell i's place, as a motion (for drawOnDisk).
function ballPlace(ball, i) { return ball.place.subarray(4 * i, 4 * i + 4); }

// For each edge of the ball (entry e of ball.nbr, from cell i to cell
// j), which side k of cell i the cell j is across (on a tree too). Moved back
// by the inverse of cell i's motion, cell i is the first cell, and j's
// middle is straight out from the middle of side k, at the angle
// 2 pi k / p. (The inverse of the motion [a, b] is [conj(a), -b];
// Beardon, Chapter 7.) Worked out once per ball, as ball.side.
function ballSides(ball, p) {
  if (ball.side) return ball.side;
  const side = new Int8Array(ball.nbr.length);
  for (let i = 0; i < ball.n; i++) {
    const [ar, ai, br, bi] = ballPlace(ball, i);
    const back = [ar, -ai, -br, -bi];
    for (let e = ball.first[i]; e < ball.first[i + 1]; e++) {
      const [x, y] = motionApply(motionTimes(back, ballPlace(ball, ball.nbr[e])), 0, 0);
      const k = Math.round(Math.atan2(y, x) * p / (2 * Math.PI));
      side[e] = ((k % p) + p) % p;
    }
  }
  ball.side = side;
  return side;
}

// The ball from the options on the page: the graph (readGraphOptions,
// section 8) and every cell within R steps of the start. "sizes" are
// the page's { R, most, cells }: the default R, the largest R, and the
// most cells a ball may have. A ball of a tiling grows exponentially
// with R, so it is cut back to at most that many cells, and the line
// under R says so. "note" (optional) adds to that line, e.g.
// note(spec) = ", each toppling at 7 grains". Puts the start back in the
// middle. Returns null if the options aren't a hyperbolic graph.
function ballFromOptions(dv, sizes, note) {
  if (!readGraphOptions(dv)) return null;
  const R = readWhole("set-ball-radius", 1, sizes.most, sizes.R);
  const ball = makeBall(diskGraph(dv), R, sizes.cells);
  byId("set-ball-radius").value = ball.R;
  byId("ball-info").textContent = ball.n.toLocaleString() + " cells" + (note ? note(dv.spec) : "") + "." + (ball.R < R
    ? " A ball of radius " + R + " would have more than " + sizes.cells.toLocaleString() +
      " cells, the most this page uses, so R is " + ball.R + "."
    : "");
  backToStart(dv);
  return ball;
}

// Draw the ball, cell v filled with colorOf(v) (a CSS color such as
// "#f2735a"), in the picture chosen: the disk or the half-plane with
// the rest of the tiling (or tree) in thin gray, or the tree spread out
// in rings. Returns the pen, to draw more on top.
function drawBall(dv, ball, colorOf) {
  const height = pictureHeight(BALL_HEIGHT);
  if (dv.picture === "spread") {
    return drawSpreadTree(dv, height, ball.n,
      function (v) { return ball.depth[v]; }, function (v) { return ball.angle[v]; },
      function (v) { const c = colorOf(v); return c === "#ffffff" ? BALL_WHITE_DOT : c; });
  }
  const pen = diskPen(dv, height);
  drawDiskFrame(dv, pen, height, BALL_OUTSIDE, UNDER_COLOR);
  drawOnDisk(dv, pen, diskGraph(dv), ball.n, function (v) { return ballPlace(ball, v); }, colorOf);
  return pen;
}

// Where the middle of cell v of the ball is on the screen, as
// { x, y, size } (size: about its radius, in pixels), or null if it is
// off the screen. Call after drawing the ball.
function ballSpot(dv, ball, v) {
  if (dv.picture === "spread") {
    const [x, y] = spreadSpot(dv, ball.depth[v], ball.angle[v]);
    return { x: x, y: y, size: spreadDot(dv, ball.depth[v]) };
  }
  const [mx, my] = motionApply(seenFrom(dv, ballPlace(ball, v)), 0, 0);
  if (!onScreen(dv, mx, my)) return null;
  const [x, y] = diskToScreen(dv, mx, my);
  return { x: x, y: y, size: cellPixels(dv, mx, my) };
}

// The cell of the ball under the pointer: in the disk or the half-plane,
// the cell whose middle is nearest the pointer (as in cellNearest); in
// the spread-out picture, the nearest dot.
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
  const [zx, zy] = diskPoint(dv, event.clientX, event.clientY);
  for (let i = 0; i < ball.n; i++) {
    const [mx, my] = motionApply(seenFrom(dv, ballPlace(ball, i)), 0, 0);
    const far = ((zx - mx) * (zx - mx) + (zy - my) * (zy - my)) / Math.max(1 - mx * mx - my * my, 1e-15);
    if (far < bestFar) { bestFar = far; best = i; }
  }
  return best;
}


// The cell of the ball under the pointer, or -1 if the pointer isn't on
// one: like ballCellUnder, but only if the pointer is within the cell's
// circumradius of its middle (on a tree, within its inradius, the
// distance to the middle of its sides), or, spread out, on its dot.
// (cosh of the hyperbolic distance from z to m is
// 1 + 2 |z - m|^2 / ((1 - |z|^2) (1 - |m|^2)); Beardon, Chapter 7.)
function ballCellAt(dv, ball, event) {
  const i = ballCellUnder(dv, ball, event);
  if (i === -1) return -1;
  if (dv.picture === "spread") {
    const box = dv.canvas.getBoundingClientRect();
    const [sx, sy] = spreadSpot(dv, ball.depth[i], ball.angle[i]);
    const far = Math.hypot(sx - (event.clientX - box.left), sy - (event.clientY - box.top));
    return far <= spreadDot(dv, ball.depth[i]) + 3 ? i : -1;
  }
  const shape = diskShape(dv), R = isTree(shape) ? shape.inradius : shape.circumradius;
  const [zx, zy] = diskPoint(dv, event.clientX, event.clientY);
  const [mx, my] = motionApply(seenFrom(dv, ballPlace(ball, i)), 0, 0);
  const coshFar = 1 + 2 * ((zx - mx) * (zx - mx) + (zy - my) * (zy - my)) /
                  Math.max((1 - zx * zx - zy * zy) * (1 - mx * mx - my * my), 1e-300);
  return coshFar <= Math.cosh(R) ? i : -1;
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
