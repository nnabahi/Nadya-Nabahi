/* =====================================================================
   sim-view.js  —  a sim's picture: where it goes, and moving, zooming
                   and clicking it
   ---------------------------------------------------------------------
   Every sim's picture can be moved and zoomed like a graph in Desmos,
   to see the small details:
     drag it                          move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, back to the start
     click it (without dragging)      whatever the sim does with a click
   This file does all of that for every sim, so it is written once. A
   sim page makes one "view" for its canvas: an object that remembers
   where the picture is, and how far it is moved and zoomed. There are
   two kinds.

   CELLS. Most sims draw their domain (js/sim-domains.js) as one square
   per cell (or one polygon, for triangles, hexagons and other tilings),
   in a box in the middle of their canvas, as big as fits:
     const view = makeView(simCanvas, drawSoon);
   Each time the page draws, it asks the view where things go:
     const pen = fitPicture(view, domain, maxHeight);   // size the canvas
     const shown = paintCells(view, pen, domain, ...);  // paint the squares that show
     drawBorders(view, pen, shown, color);              // lines between colors
   (paintDomain does both, or paints polygons on a tiling instead; to
   paint the squares itself, cellsShown says which cell is on each, and
   squareLeft and squareTop where it goes). It calls useTorus when the
   domain changes. On a box (or a drawn region) the picture zooms in
   down to single cells, and can't be zoomed out past the whole box, or
   moved off it. On a torus (or a region drawn on one) it can also be
   zoomed out, and then the torus shows several times side by side. (A
   picture that shouldn't move at all, like Eden Growth's 1D side view,
   passes movable = false to useTorus.) pointerSpot and cellUnder say
   which cell is under the pointer (to click a cell, or drop a walker on
   it).

   THE PLANE. Sinusoid-ish, Matrix Products and Sequential Continuous
   Tiling draw points of the plane instead: a graph, a cloud of dots,
   tiles of every size, on a grid like Desmos's (makePlaneView, the
   last section).

   Either way, the page connects the picture's pointer events with
   connectPicture (which also tells a click from a drag, and lets a
   press pick up something on the picture instead, like the random walk
   coloring sim's walkers).

   The page's HTML puts the canvas in a box:
     <div class="sim-picture">
       <canvas id="sim-canvas"></canvas>
     </div>
   and the view puts the zoom buttons in the box's top right corner (on
   pages with the hyperbolic plane or tree, "Back to the start" and
   "Slide" join them: js/sim-hyperbolic.js). The full screen button in
   its top left corner comes from js/sim-page.js.

   Contents:
     makeView(...)               a new view of cells (with the wheel and buttons)
     useTorus(view, on, movable) a new domain: a torus or not, and movable or not
     showZoomButtons(view)       show the buttons when the picture can move
     fitPicture(view, d, ...)    place the picture and size the canvas
     cellSize(view)              how big a cell is on the screen, with the zoom
     cellsShown(view, d)         which cell is on each square that shows
     squareLeft, squareTop       where the sides of the squares are
     paintCells(...)             paint every square that shows, fast
     shadeSquares(...)           paint some squares on top (e.g. holes)
     drawBorders(...)            the lines between squares of different colors
     paintLattice(...)           the same two for triangles, hexagons and other tilings
     paintTinyCells(...)         ... and pixel by pixel, when the cells are tiny
     paintDomain(...)            whichever of these fits the domain's cells
     screenCopies, nearScreen    where the polygons go on the screen (and on a
                                 torus, each copy of the picture that shows)
     cellLinesPath, cellDotsPath lines between neighbors' middles, and dots on
                                 middles (a tree, a walk), on every copy
     zoomBy, slideCells, resetView   zoom around a point, move; back to the start
     cellUnder, cellAtEvent      the cell under the pointer
     floorOf3D(d, kind, disk, keep)  where the cells stand on the 3D floor
   Moving, zooming and clicking either kind of picture:
     connectZoomControls(view, reset, ...)   the wheel and the + / − / Reset buttons
     connectWheel(view)          ... just the wheel (a chart's time, js/sim-charts.js)
     pressPointer, movePointer, releasePointer   dragging and pinching
     pointerSpot(view, event)    where the pointer is on the picture
     makeClickTracker()          is a press a click or a drag?
     connectPicture(view, options)   all of these at once
   The plane:
     makePlaneView(...)          a new view of the plane
     sizePlane(plane, height)    size the canvas
     pixelX, pixelY              where the point (x, y) is on the screen
     pointX, pointY              ... and back
     planeBox, showPlaneBox      the part of the plane shown; show another part
     showWhole(plane, box, margin)   show all of a box
     drawPlaneGrid(plane, pen)   the grid, the axes and their numbers
   ===================================================================== */


// Zooming. Zoom 1 shows the whole box or torus once.
const MIN_ZOOM = 0.25;            // zoomed out (torus only): the torus 4 times across
const MAX_CELL_PIXELS = 400;      // zoomed in: a cell at most this many pixels big
const MAX_ZOOM = 8;               // ... but always allowed to zoom in at least 8 times
const MIN_CELL_PIXELS = 2;        // but zoomed out, cells stay at least this big
const ZOOM_STEP = 1.5;            // how much one click on + or − zooms

// Cells smaller than this (in pixels) get no lines between colors, and
// sims with such lines give cells this big a whole number of pixels
// each (makeView), so the lines sit exactly on the cell edges.
const SMALLEST_BORDERED_CELL = 4;


// A new view for "canvas". "redraw" is the page's function that draws
// the picture again. Two extras, both optional:
//   top         room left above and below the picture, in pixels (the
//               random walk sim leaves some, so walkers on the edge
//               show whole)
//   wholeCells  cells at least this many pixels big get a whole number
//               of pixels each, so every cell is exactly the same size
//               and border lines sit exactly on the cell edges
function makeView(canvas, redraw, top, wholeCells) {
  const view = {
    canvas: canvas,
    redraw: redraw,
    top: top || 0,          // where the picture starts, from the canvas's top
    margin: top || 0,       // the room asked for above and below it
    wholeCells: wholeCells || Infinity,

    // Where the picture's box sits on the canvas, from the last
    // fitPicture, in screen pixels: its left side, width and height, and
    // "size", the size of a cell when the whole domain fits (zoom 1).
    left: 0, width: 0, height: 0, size: 1,

    // The squares that showed, from the last cellsShown: columns firstI
    // .. lastI and rows firstK .. lastK (cols x rows squares), each
    // "cell" pixels big (the size with the zoom).
    cell: 1, firstI: 0, lastI: -1, firstK: 0, lastK: -1, cols: 0, rows: 0,

    // Moving and zooming. "torus" is true when the picture wraps around
    // (then it can also zoom out past zoom 1), "free" when it can slide
    // anywhere, even past its edges (the hyperbolic pictures:
    // js/sim-hyperbolic.js sets it when it draws them), and "movable" is
    // false for a picture that doesn't move or zoom at all.
    torus: false,
    free: false,
    movable: true,
    scroll: { x: 0, y: 0 },   // how far the picture is moved, in cells
    zoom: 1,                  // 2 = cells twice as big, 0.5 = half as big
    pointers: new Map(),      // the pointers pressed on the picture: id -> {x, y}
  };

  // How the shared moving code (section "Moving, zooming and clicking")
  // moves a picture of cells.
  view.slide = function (dx, dy) { slideCells(view, dx, dy); };
  view.zoomAt = function (factor, x, y) { zoomBy(view, factor, x - view.left, y); };
  connectZoomControls(view, function () { resetView(view); }, "Show the whole picture once again");
  return view;
}

// A new domain. "on" is true on a torus (including a region drawn on
// one). "movable" is false for a picture that shouldn't move or zoom at
// all (it is true when left out). Either way it starts from the whole
// picture, at zoom 1. (The "scrollable" class gives the canvas the hand
// cursor: section 8 of css/style.css.)
function useTorus(view, on, movable) {
  view.torus = on;
  view.free = false;
  view.movable = (movable !== false);
  view.scroll = { x: 0, y: 0 };
  view.zoom = 1;
  view.canvas.classList.toggle("scrollable", view.movable);
  showZoomButtons(view);
}

// The + / − / Reset buttons show whenever the picture can move.
function showZoomButtons(view) {
  view.zoomButtons.hidden = !view.movable || view.canvas.hidden;
}


/* ---------------------------------------------------------------------
   Drawing
   --------------------------------------------------------------------- */

// Place the picture of domain d: as big as fits the canvas's width (and
// at most maxHeight pixels tall), in the middle. Sizes the canvas to
// match, and returns its pen, ready to draw in screen pixels (y = 0 is
// "top" pixels down) and cut off ("clipped") at the picture's box.
// pen.restore() lifts the cut-off. With "fixed" true, the canvas is
// always maxHeight tall, with the picture in the middle of it (for a
// picture that changes shape as it grows, so the page below it doesn't
// jump). In the full screen popup (js/sim-page.js), the canvas is as
// tall as the popup instead, with the picture in the middle of it.
function fitPicture(view, d, maxHeight, fixed) {
  const canvas = view.canvas;
  const box = pictureBox(d);                    // (js/sim-domains.js)
  const across = box.right - box.left, down = box.top - box.bottom;
  const cssWidth = canvas.clientWidth;
  const popup = pictureHeight(0);               // 0 when the popup isn't open
  const tallest = popup > 0 ? popup : fixed ? maxHeight : 0;   // the canvas's height, if it is fixed
  if (tallest > 0) maxHeight = tallest - 2 * view.margin;
  view.size = Math.min(cssWidth / across, maxHeight / down);
  if (view.size >= view.wholeCells) view.size = Math.floor(view.size);
  view.width = Math.round(view.size * across);
  view.height = Math.round(view.size * down);
  view.left = Math.round((cssWidth - view.width) / 2);
  view.top = tallest > 0 ? Math.round((tallest - view.height) / 2) : view.margin;
  const tall = tallest > 0 ? tallest : view.height + 2 * view.top;

  const pen = sharpPen(canvas, cssWidth, tall);   // (js/sim-page.js)
  pen.translate(0, view.top);
  pen.save();
  pen.beginPath();
  pen.rect(view.left, 0, view.width, view.height);
  pen.clip();                                   // nothing outside the picture's box
  return pen;
}

// The size of a cell on screen, with the zoom, in pixels (a whole number
// from "wholeCells" up; see makeView).
function cellSize(view) {
  const size = view.size * view.zoom;
  return size >= view.wholeCells ? Math.round(size) : size;
}

// Which squares show, and which cell of domain d is on each: a list of
// cols x rows cell numbers, row by row from the top, -1 where a square
// isn't in the domain. Square (i, k) is column i from the left and row
// k from the top of the domain's box (so k = 0 is the top row, y = ymax:
// rows go up the screen as y goes up). On a torus the squares carry on
// past the box, and cellAt (js/sim-domains.js) wraps them around.
function cellsShown(view, d) {
  const size = cellSize(view);
  view.cell = size;
  view.firstI = Math.floor(-view.scroll.x) - 1;
  view.lastI = Math.ceil(view.width / size - view.scroll.x);
  view.firstK = Math.floor(-view.scroll.y) - 1;
  view.lastK = Math.ceil(view.height / size - view.scroll.y);
  view.cols = view.lastI - view.firstI + 1;
  view.rows = view.lastK - view.firstK + 1;
  const cells = new Int32Array(view.cols * view.rows);
  for (let k = 0; k < view.rows; k++) {
    for (let i = 0; i < view.cols; i++) {
      cells[k * view.cols + i] = cellAt(d, d.xmin + view.firstI + i, d.ymax - (view.firstK + k));
    }
  }
  return cells;
}

// Where the sides of the squares are on the canvas, in screen pixels:
// the left side of column i, and the top of row k. Rounding to whole
// pixels avoids thin gaps between squares.
function squareLeft(view, i) { return view.left + Math.round((i + view.scroll.x) * view.cell); }
function squareTop(view, k) { return Math.round((k + view.scroll.y) * view.cell); }

// Paint every square that shows, after fitPicture (which gives "pen").
// For cell v, groupOf(v) is a whole number (its color number, or its
// cluster), and rgbOf(group) is how that group is painted, as [red,
// green, blue], each 0 .. 255. Squares not in domain d get "outsideRGB".
// Returns the group on each square (-2 outside the domain), in the order
// of cellsShown, ready for drawBorders.
// How: each square's color goes into a small image with one pixel per
// square, which is then blown up with smoothing off, so the squares stay
// crisp. Setting pixels one by one is fast even for many thousands of
// squares.
const tinyCanvas = document.createElement("canvas");   // one pixel per square that shows
function paintCells(view, pen, d, groupOf, rgbOf, outsideRGB) {
  const cells = cellsShown(view, d);
  const cols = view.cols, rows = view.rows;
  const shown = new Int32Array(cols * rows);
  tinyCanvas.width = cols;
  tinyCanvas.height = rows;
  const tinyPen = tinyCanvas.getContext("2d");
  const image = tinyPen.createImageData(cols, rows);
  const pixels = image.data;                  // 4 numbers per pixel: red, green, blue, opacity
  for (let p = 0; p < cols * rows; p++) {
    const v = cells[p];
    const group = v === -1 ? -2 : groupOf(v);
    const rgb = v === -1 ? outsideRGB : rgbOf(group);
    shown[p] = group;
    pixels[4 * p] = rgb[0]; pixels[4 * p + 1] = rgb[1]; pixels[4 * p + 2] = rgb[2];
    pixels[4 * p + 3] = 255;
  }
  tinyPen.putImageData(image, 0, 0);
  pen.imageSmoothingEnabled = false;
  pen.drawImage(tinyCanvas, squareLeft(view, view.firstI), squareTop(view, view.firstK),
                cols * view.cell, rows * view.cell);
  return shown;
}

// Paint some squares of domain d on top of the picture, in "color",
// after paintCells (which works out where the squares go). "cells" are
// their places, as x0, y0, x1, y1, ... (Eden Growth and Random Walk
// shade their holes this way.)
function shadeSquares(view, pen, d, cells, color) {
  pen.fillStyle = color;
  for (let k = 0; k < cells.length; k += 2) {
    const i = cells[k] - d.xmin, row = d.ymax - cells[k + 1];
    const left = squareLeft(view, i), top = squareTop(view, row);
    pen.fillRect(left, top, squareLeft(view, i + 1) - left, squareTop(view, row + 1) - top);
  }
}

// The border lines, all collected into one path and drawn at once: a
// line between two squares side by side, or one above the other, whose
// colors differ. "shown" has a color number for each square, in the
// order of cellsShown (the outside counts as a color of its own).
function drawBorders(view, pen, shown, color) {
  const cols = view.cols, rows = view.rows;
  pen.beginPath();
  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      const c = shown[k * cols + i];
      const x1 = squareLeft(view, view.firstI + i + 1);
      const y0 = squareTop(view, view.firstK + k), y1 = squareTop(view, view.firstK + k + 1);
      if (i + 1 < cols && shown[k * cols + i + 1] !== c) {         // the square to the right
        pen.moveTo(x1, y0); pen.lineTo(x1, y1);
      }
      if (k + 1 < rows && shown[(k + 1) * cols + i] !== c) {       // the square below
        pen.moveTo(squareLeft(view, view.firstI + i), y1); pen.lineTo(x1, y1);
      }
    }
  }
  pen.strokeStyle = color;
  pen.lineWidth = Math.max(1, Math.min(2.5, view.cell / 10));
  pen.lineCap = "square";
  pen.stroke();
}


// Triangles and hexagons, and the cells of any tiling (js/sim-domains.js),
// can't be painted as squares, so paintLattice draws each cell as its
// own shape, after fitPicture. colorOf(v) is cell v's color (any CSS
// color, like "#ff0000"), and with "groupOf" (as in paintCells) a line
// of color "lines" goes along every side between two cells of different
// groups, and along the domain's edge. Cells of one color are collected
// into one path and filled at once, which is much faster than one at a
// time, and cells off the screen are skipped. On a torus the picture
// repeats as far as it shows.
function paintLattice(view, pen, d, colorOf, groupOf, lines) {
  const sides = groupOf ? latticeSides(d) : null;   // (only the lines need them)
  const shapes = new Map(), border = new Path2D();
  for (const { sx, sy } of screenCopies(view, d)) {
    for (let v = 0; v < d.n; v++) {
      const corners = cornersOf(d, v);
      if (!nearScreen(view, sx(corners[0][0]), sy(corners[0][1]))) continue;
      const color = colorOf(v);
      if (!shapes.has(color)) shapes.set(color, new Path2D());
      const shape = shapes.get(color);
      // Around the corners and back to the first. (Not closePath: in
      // Chrome, a path of many closed pieces gets slower with every
      // piece, about 3 seconds for 20,000 hexagons.)
      shape.moveTo(sx(corners[0][0]), sy(corners[0][1]));
      for (let k = 1; k <= corners.length; k++) {
        const c = corners[k % corners.length];
        shape.lineTo(sx(c[0]), sy(c[1]));
      }
      if (!groupOf) continue;
      // The side from corner k to the next: drawn once, from the cell
      // with the smaller number (or always, on the domain's edge).
      corners.forEach(function (c, k) {
        const other = sides[v][k];
        if (other > v || (other >= 0 && groupOf(other) === groupOf(v))) return;
        const next = corners[(k + 1) % corners.length];
        border.moveTo(sx(c[0]), sy(c[1]));
        border.lineTo(sx(next[0]), sy(next[1]));
      });
    }
  }
  for (const [color, shape] of shapes) {
    pen.fillStyle = color;
    pen.fill(shape);
    pen.strokeStyle = color;   // a hairline in the same color hides thin gaps between cells
    pen.lineWidth = 0.5;
    pen.stroke(shape);
  }
  if (groupOf) {
    pen.strokeStyle = lines;
    pen.lineWidth = Math.max(1, Math.min(2.5, view.cell / 10));
    pen.lineJoin = "round";
    pen.stroke(border);
  }
}

// Below this many pixels per side length, paintDomain paints polygons
// pixel by pixel (paintTinyCells): then hundreds of thousands of cells
// can show, too many to draw one by one as polygons quickly.
const TINY_CELL = 2;

// Paint domain d after fitPicture, whatever shape its cells are: squares
// (paintCells) or polygons (paintLattice, or paintTinyCells when they
// are tiny, on a background of outsideRGB, which shows around a box's
// ragged edge). groupOf and rgbOf are as in
// paintCells. With "lines" (a color; null for none), a line goes
// between cells of different groups once the cells are big enough to
// see it: squares at least "smallest" pixels across, polygons with sides
// at least twice that (a triangle is much smaller than a square with the
// same side).
function paintDomain(view, pen, d, groupOf, rgbOf, outsideRGB, lines, smallest) {
  if (!d.lattice) {
    const shown = paintCells(view, pen, d, groupOf, rgbOf, outsideRGB);
    if (lines && view.cell >= smallest) drawBorders(view, pen, shown, lines);
    return;
  }
  pen.fillStyle = rgbToHex(outsideRGB);
  pen.fillRect(view.left, 0, view.width, view.height);
  if (cellSize(view) < TINY_CELL) return paintTinyCells(view, pen, d, groupOf, rgbOf);
  const colors = new Map();    // each group's color, worked out once
  const colorOf = function (v) {
    const group = groupOf(v);
    if (!colors.has(group)) colors.set(group, rgbToHex(rgbOf(group)));
    return colors.get(group);
  };
  const bordered = lines && cellSize(view) >= 2 * smallest;
  paintLattice(view, pen, d, colorOf, bordered ? groupOf : null, lines);
}

// Paint the polygons of domain d pixel by pixel, after fitPicture (and
// at the screen's own pixels, which are smaller on a sharp screen): each
// pixel whose middle is in cell v takes its color, rgbOf(groupOf(v)),
// and the others keep what is under them. Each cell fills, row by row,
// the pixels between the points where its sides cross the row's middle
// line (in pairs, so a polygon with a dent works too).
function paintTinyCells(view, pen, d, groupOf, rgbOf) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(view.width * ratio), height = Math.round(view.height * ratio);
  tinyCanvas.width = width;
  tinyCanvas.height = height;
  const tinyPen = tinyCanvas.getContext("2d");
  const image = tinyPen.createImageData(width, height);   // see-through to start
  const pixels = image.data;                              // 4 numbers per pixel: red, green, blue, opacity
  for (const { sx, sy } of screenCopies(view, d)) {
    for (let v = 0; v < d.n; v++) {
      const corners = cornersOf(d, v).map(function ([u, w]) { return [(sx(u) - view.left) * ratio, sy(w) * ratio]; });
      // The rows and columns of pixels whose middles the cell might hold
      // (often none, when the cells are much smaller than a pixel).
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const [x, y] of corners) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      const first = Math.max(0, Math.ceil(top - 0.5)), last = Math.min(height - 1, Math.floor(bottom - 0.5));
      if (first > last || Math.max(0, Math.ceil(left - 0.5)) > Math.min(width - 1, Math.floor(right - 0.5))) continue;
      const rgb = rgbOf(groupOf(v));
      for (let row = first; row <= last; row++) {
        for (const [from, to] of rowCrossings(corners, row + 0.5)) {
          for (let i = Math.max(0, Math.ceil(from - 0.5)); i <= Math.min(width - 1, Math.ceil(to - 0.5) - 1); i++) {
            const p = 4 * (row * width + i);
            pixels[p] = rgb[0]; pixels[p + 1] = rgb[1]; pixels[p + 2] = rgb[2]; pixels[p + 3] = 255;
          }
        }
      }
    }
  }
  tinyPen.putImageData(image, 0, 0);
  pen.imageSmoothingEnabled = false;
  pen.drawImage(tinyCanvas, view.left, 0, view.width, view.height);
}

// Where the line at height y crosses the polygon with these corners, as
// pairs [from, to] of x's: the stretches of the line inside it.
function rowCrossings(corners, y) {
  const xs = [];
  corners.forEach(function (a, k) {
    const b = corners[(k + 1) % corners.length];
    if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  });
  xs.sort(function (p, q) { return p - q; });
  const pairs = [];
  for (let k = 0; k + 1 < xs.length; k += 2) pairs.push([xs[k], xs[k + 1]]);
  return pairs;
}

// Where the points of domain d's picture go on the screen, for a
// picture of polygons, after fitPicture: for each copy of the picture
// that shows, the functions sx(u) and sy(w) that give the screen pixels
// of the point (u, w) of the picture. On a torus the picture repeats as
// far as it shows; otherwise there is one copy. (Also sets view.cell,
// the pixels per side length.)
function screenCopies(view, d) {
  view.cell = cellSize(view);
  const box = pictureBox(d), cell = view.cell;
  return copiesShown(view, d, box, view.width / cell, view.height / cell).map(function ([du, dw]) {
    return {
      sx: function (u) { return view.left + (u + du - box.left + view.scroll.x) * cell; },
      sy: function (w) { return (box.top - w - dw + view.scroll.y) * cell; },
    };
  });
}

// Is the screen point (x, y) on the screen, or near enough to it that
// something drawn there (a polygon, or a line to a neighbor) can reach
// in? Cells further off than 4 side lengths are skipped.
function nearScreen(view, x, y) {
  const margin = 4 * view.cell;
  return x >= view.left - margin && x <= view.left + view.width + margin && y >= -margin && y <= view.height + margin;
}

// Lines from the middle of a cell of domain d to the middle of a
// neighbor, after fitPicture, on every copy of the picture that shows
// (screenCopies), as one path to stroke (or several, for several
// colors). addLines(line) calls line(v, w) once for each line, from
// cell v to its neighbor w. On a torus the line goes to the copy of w
// nearest v, so a line across the torus's edge doesn't cross the whole
// picture. (A spanning tree, or a walk: Connected Coloring, Uniform
// Spanning Tree.) Also sets view.cell.
function cellLinesPath(view, d, addLines) {
  const middles = cellMiddles(d), steps = d.wrap ? torusSteps(d) : null;   // (js/sim-domains.js)
  const ends = [];
  addLines(function (v, w) { ends.push(v, w); });
  const path = new Path2D();
  for (const { sx, sy } of screenCopies(view, d)) {
    for (let k = 0; k < ends.length; k += 2) {
      const a = middles[ends[k]], x = sx(a[0]), y = sy(a[1]);
      if (!nearScreen(view, x, y)) continue;
      const b = nearestCopy(middles[ends[k + 1]], a, steps);
      path.moveTo(x, y);
      path.lineTo(sx(b[0]), sy(b[1]));
    }
  }
  return path;
}

// Dots "radius" pixels big on the middles of the cells "cells" of
// domain d, on every copy of the picture that shows, as one path to
// fill. (A root, or the head of a walk.)
function cellDotsPath(view, d, cells, radius) {
  const middles = cellMiddles(d), path = new Path2D();
  for (const { sx, sy } of screenCopies(view, d)) {
    for (const v of cells) {
      const x = sx(middles[v][0]), y = sy(middles[v][1]);
      if (!nearScreen(view, x, y)) continue;
      path.moveTo(x + radius, y);
      path.arc(x, y, radius, 0, 2 * Math.PI);
    }
  }
  return path;
}

// The copy of the point p nearest the point "from", on a torus that
// repeats by the two steps "steps" (torusSteps; null off a torus: p
// itself).
function nearestCopy(p, from, steps) {
  if (!steps) return p;
  const [across, up] = steps;
  let best = p, far = Infinity;
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const q = [p[0] + a * across[0] + b * up[0], p[1] + a * across[1] + b * up[1]];
      const d = Math.hypot(q[0] - from[0], q[1] - from[1]);
      if (d < far) { far = d; best = q; }
    }
  }
  return best;
}

// The copies of domain d's picture that show, as the shift [du, dw] of
// each: off a torus just the picture itself; on a torus every copy that
// reaches into the screen, shifted by whole steps of torusSteps
// (js/sim-domains.js). A torus of slanted blocks leans by up[0] from
// bottom to top, so "lean" more copies are tried on each side.
function copiesShown(view, d, box, showsAcross, showsUp) {
  if (!d.wrap) return [[0, 0]];
  const [across, up] = torusSteps(d), copies = [];
  const lean = Math.ceil(Math.abs(up[0]) / across[0]);
  for (let b = Math.floor((view.scroll.y - showsUp) / up[1]) - 1; b <= Math.ceil(view.scroll.y / up[1]) + 1; b++) {
    const slant = b * up[0];
    for (let a = Math.floor((-view.scroll.x - slant) / across[0]) - 1 - lean; a <= Math.ceil((showsAcross - view.scroll.x - slant) / across[0]) + lean; a++) {
      copies.push([a * across[0] + slant, b * up[1]]);
    }
  }
  return copies;
}

// For each cell v of a triangle or hexagon domain, the cell across each
// of its sides (sides[v][k], for the side from corner k to the next), or
// -1 where the domain ends. In these lattices the cell across a side is
// v's mirror image in that side, so its middle is the side's middle
// pushed on as far again. Worked out once per domain and kept. (A tiling
// domain comes with its sides: tilingBox, js/sim-domains.js.)
function latticeSides(d) {
  if (d.sides) return d.sides;
  d.sides = [];
  for (let v = 0; v < d.n; v++) {
    const corners = cornersOf(d, v);
    const middle = cellMiddle(d, v);
    d.sides.push(corners.map(function (c, k) {
      const next = corners[(k + 1) % corners.length];
      const u = c[0] + next[0] - middle[0], w = c[1] + next[1] - middle[1];
      return cellAtPoint(d, u, w);
    }));
  }
  return d.sides;
}


/* ---------------------------------------------------------------------
   Moving and zooming the cells
   --------------------------------------------------------------------- */

// Zoom by "factor" (2 = twice as close) around the point (px, py), in
// screen pixels from the top left of the picture's box: the cell under
// that point stays under it.
function zoomBy(view, factor, px, py) {
  const before = cellSize(view);
  // Zoomed out, cells stay at least MIN_CELL_PIXELS big (but the whole
  // torus, zoom 1, is always allowed, even with smaller cells). A box
  // doesn't zoom out past the whole box.
  const least = view.torus ? Math.min(1, Math.max(MIN_ZOOM, MIN_CELL_PIXELS / view.size)) : 1;
  // Zoomed in, a cell grows to at most MAX_CELL_PIXELS (a big domain
  // with tiny cells can zoom in a long way, to see the fine details).
  const most = Math.max(MAX_ZOOM, MAX_CELL_PIXELS / view.size);
  view.zoom = Math.min(Math.max(view.zoom * factor, least), most);
  const after = cellSize(view);
  view.scroll.x += px / after - px / before;
  view.scroll.y += py / after - py / before;
  keepInBox(view);
}

// Move the picture by (dx, dy) screen pixels.
function slideCells(view, dx, dy) {
  const size = cellSize(view);
  view.scroll.x += dx / size;
  view.scroll.y += dy / size;
  keepInBox(view);
}

// Off a torus, the picture can't be moved off its box: an edge of the
// domain never comes in past the edge of the picture's box. "across"
// and "down" are the domain's size in cells; zoomed in, the box shows
// only across / zoom of them, so the picture can move that far less.
// (A "free" picture can go anywhere.)
function keepInBox(view) {
  if (view.torus || view.free) return;
  const across = view.width / view.size, down = view.height / view.size;
  const shownAcross = view.width / cellSize(view), shownDown = view.height / cellSize(view);
  view.scroll.x = Math.min(0, Math.max(shownAcross - across, view.scroll.x));
  view.scroll.y = Math.min(0, Math.max(shownDown - down, view.scroll.y));
}

// Back to the whole box or torus, once, as at the start, and draw it.
function resetView(view) {
  view.zoom = 1;
  view.scroll = { x: 0, y: 0 };
  view.redraw();
}

// The cell of domain d under a spot (from pointerSpot), or -1 if there
// is none: off the picture, or outside a drawn domain.
function cellUnder(view, d, spot) {
  if (spot.x < view.left || spot.x >= view.left + view.width || spot.y < 0 || spot.y >= view.height) return -1;
  if (d.lattice) {   // triangles or hexagons: the point of the picture under the spot
    const box = pictureBox(d);
    return cellAtPoint(d, box.left + (spot.x - view.left) / view.cell - view.scroll.x,
                       box.top - (spot.y / view.cell - view.scroll.y));
  }
  const i = Math.floor((spot.x - view.left) / view.cell - view.scroll.x);   // its square (i, k)
  const k = Math.floor(spot.y / view.cell - view.scroll.y);
  return cellAt(d, d.xmin + i, d.ymax - k);
}

// The cell under a pointer event on the picture (-1: none): with
// "onGraph" (a hyperbolic tiling or tree), the cell of ball d
// (ballCellAt, js/sim-hyperbolic.js); otherwise the cell of domain d.
function cellAtEvent(view, disk, d, onGraph, event) {
  return onGraph ? ballCellAt(disk, d, event) : cellUnder(view, d, pointerSpot(view, event));
}


// Where the cells of domain d stand on the 3D view's floor (drawStacks,
// js/sim-3d.js), for the cells with keep(v) true (every cell if "keep"
// is left out). "kind" is the domain's kind (domains.kind,
// js/sim-controls.js), and "disk" the disk view, for a ball of a
// hyperbolic tiling or tree. Returns what drawStacks wants about the
// floor, for each stack i:
//   cells[i]        the cell stack i stands on
//   x, y, width     where its middle is, and how wide it is
//   corners         its corners, for blocks in the shape of the cell
//   floor, lines    the floor, and the sides of a tiling's cells on it
//   shape           the blocks: in the shape of the cells (a square's is
//                   a cube), or coins on a tree, whose sites are points
// On a ball, each cell stands where the disk picture puts it, as big as
// it looks there (diskStack, js/sim-hyperbolic.js), and cells too small
// to see are left out. On a tiling, the floor is the picture's box
// (drawStacks counts a box of cells from the middle of its first one to
// the middle of its last, so half a side length comes off each end).
// A drawn domain stands on its own cells. (Sandpiles, Uniform Spanning
// Tree.)
function floorOf3D(d, kind, disk, keep) {
  const f = { cells: [], x: [], y: [], width: [], corners: [], floor: null, lines: null, shape: "cubes" };
  const add = function (v, x, y, width, corners) {
    f.cells.push(v); f.x.push(x); f.y.push(y); f.width.push(width); f.corners.push(corners);
  };
  if (kind === "graph") {
    const unit = diskFloorUnit(disk);
    for (let v = 0; v < d.n; v++) {
      if (keep && !keep(v)) continue;
      const stack = diskStack(disk, seenFrom(disk, ballPlace(d, v)), unit);
      if (stack) add(v, stack.x, stack.y, stack.width, stack.corners);
    }
    f.floor = { disk: unit };
    f.shape = isTree(disk.spec) ? "coins" : "tiles";
  } else if (d.lattice) {
    for (let v = 0; v < d.n; v++) {
      if (keep && !keep(v)) continue;
      const [u, w] = cellMiddle(d, v);
      add(v, u, w, 2 * cellRadius(d, v), cornersOf(d, v));
    }
    const box = pictureBox(d);
    f.floor = { xmin: box.left + 0.5, xmax: box.right - 0.5, ymin: box.bottom + 0.5, ymax: box.top - 0.5 };
    f.lines = tilingLines(d);
    f.shape = "tiles";
  } else {
    for (let v = 0; v < d.n; v++) if (!keep || keep(v)) add(v, d.x[v], d.y[v], 1, null);
    f.floor = kind === "custom" ? { x: d.x, y: d.y } : { xmin: d.xmin, xmax: d.xmax, ymin: d.ymin, ymax: d.ymax };
  }
  return f;
}

// The sides of a tiling's cells, as lines on the 3D floor: [x1, y1, x2,
// y2, ...], each side once (from the cell with the smaller number, or
// on the domain's edge). Worked out once per domain, and kept.
function tilingLines(d) {
  if (d.floorLines) return d.floorLines;
  const sides = latticeSides(d), lines = [];
  for (let v = 0; v < d.n; v++) {
    const corners = cornersOf(d, v);
    corners.forEach(function (c, k) {
      if (sides[v][k] > v) return;
      const next = corners[(k + 1) % corners.length];
      lines.push(c[0], c[1], next[0], next[1]);
    });
  }
  d.floorLines = lines;
  return lines;
}


/* =====================================================================
   MOVING, ZOOMING AND CLICKING EITHER KIND OF PICTURE
   ---------------------------------------------------------------------
   Each kind of view says how its picture moves, with two functions
   (makeView and makePlaneView give them):
     view.slide(dx, dy)          move it by (dx, dy) screen pixels
     view.zoomAt(factor, x, y)   zoom by "factor" (2: twice as close)
                                 around the point (x, y) of the screen
   (in screen pixels as pointerSpot gives them; neither draws). The
   rest is the same for both, so it is written once, here. (A chart
   that zooms in time, chartZoom in js/sim-charts.js, gives the same two
   and uses it too.)

   With one pointer down, the picture follows it; with two fingers, it
   follows the point between them, and zooms as they spread apart or
   pinch together. A press that hardly moves, with one pointer, is a
   click instead. On a hyperbolic tiling or tree, in the disk or the
   half-plane, one pointer drags across the plane instead (startPlaneDrag
   and dragPlane, js/sim-hyperbolic.js), and two fingers slide and zoom
   the picture. ("Pointer" events cover the mouse, a pen and fingers
   alike.)
   ===================================================================== */

const CLICK_DISTANCE = 5;     // a press that moves less than this (in pixels) is a click, not a drag

// The mouse wheel, and the + / − / Reset buttons, put in the top right
// corner of the canvas's box (as view.zoomButtons). + and − zoom around
// the middle, and Reset calls reset(), which goes back to the start and
// draws. "title" is Reset's tooltip, and "word" its word if not "Reset".
function connectZoomControls(view, reset, title, word) {
  connectWheel(view);
  view.zoomButtons = document.createElement("div");
  view.zoomButtons.className = "zoom-buttons";
  view.zoomButtons.append(
    toolButton("+", function () { zoomMiddle(view, ZOOM_STEP); }, "Zoom in"),
    toolButton("−", function () { zoomMiddle(view, 1 / ZOOM_STEP); }, "Zoom out"),
    toolButton(word || "Reset", reset, title));
  view.canvas.parentElement.appendChild(view.zoomButtons);
}

// The mouse wheel zooms around the pointer, as in Desmos. So does a
// pinch on a trackpad, which the browser reports as the wheel with the
// Ctrl key held (and small steps, so it counts for more).
function connectWheel(view) {
  view.canvas.addEventListener("wheel", function (event) {
    if (!view.movable) return;
    event.preventDefault();                              // don't scroll the page
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : 1);   // some mice count lines
    const spot = pointerSpot(view, event);
    view.zoomAt(Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.002)), spot.x, spot.y);
    view.redraw();
  }, { passive: false });   // "passive: false" lets preventDefault stop the page scrolling
}

function zoomMiddle(view, factor) {
  view.zoomAt(factor, view.left + view.width / 2, view.height / 2);
  view.redraw();
}

// Moving the picture with the mouse or fingers: the page passes its
// pointer events on to these three (connectPicture does).
function pressPointer(view, event) {
  if (!view.movable) return;
  view.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  view.canvas.setPointerCapture(event.pointerId);   // keep getting moves even off the canvas
  view.canvas.classList.add("dragging");
}

function movePointer(view, event) {
  if (!view.pointers.has(event.pointerId)) return;
  const before = middleOfPointers(view);
  view.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const after = middleOfPointers(view);
  view.slide(after.x - before.x, after.y - before.y);
  if (view.pointers.size >= 2 && before.apart > 0) {
    const spot = spotAt(view, after.x, after.y);
    view.zoomAt(after.apart / before.apart, spot.x, spot.y);
  }
  view.redraw();
}

function releasePointer(view, event) {
  view.pointers.delete(event.pointerId);
  if (view.pointers.size === 0) view.canvas.classList.remove("dragging");
}

// The point between the pressed pointers, and how far apart they are
// (0 for one pointer).
function middleOfPointers(view) {
  const p = Array.from(view.pointers.values());
  if (p.length === 1) return { x: p[0].x, y: p[0].y, apart: 0 };
  return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2,
           apart: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
}

// Where the pointer of a pointer event is, in screen pixels: x from the
// canvas's left side, y from the top of the picture ("top" pixels down;
// a plane's picture fills its canvas).
function pointerSpot(view, event) { return spotAt(view, event.clientX, event.clientY); }

function spotAt(view, clientX, clientY) {
  const box = view.canvas.getBoundingClientRect();
  return { x: clientX - box.left, y: clientY - box.top - view.top };
}

// Telling a click from a drag: call press, move and release with each
// pointer event on the picture; release(event) says whether the press
// that just ended was a click (one pointer, which hardly moved).
function makeClickTracker() {
  const pressed = new Set();    // the pointers pressed on the picture (their ids)
  let pressedAt = null;         // where the first of them went down
  let dragged = false;          // true once it moved too far (or two fingers came down): not a click
  return {
    isPressed: function () { return pressed.size > 0; },
    press: function (event) {
      if (pressed.size === 0) { pressedAt = { x: event.clientX, y: event.clientY }; dragged = false; }
      pressed.add(event.pointerId);
      if (pressed.size > 1) dragged = true;           // two fingers: a pinch, not a click
    },
    // Returns false for a pointer that isn't pressed on the picture.
    move: function (event) {
      if (!pressed.has(event.pointerId)) return false;
      if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >= CLICK_DISTANCE) dragged = true;
      return true;
    },
    // Returns null for a pointer that wasn't pressed on the picture.
    release: function (event) {
      if (!pressed.delete(event.pointerId)) return null;
      return pressed.size === 0 && !dragged;
    },
  };
}

// Connect the picture of "view" (its canvas). The options, all optional:
//   disk, onGraph   on a page with the hyperbolic plane or tree, the
//                   page's disk view (js/sim-hyperbolic.js), and
//                   onGraph(), whether the picture shows one right now
//   onClick(event)  gets every click, with its pointer event
//   grab            something on the picture that a press picks up and
//                   drags instead of moving the picture (Random Walk
//                   Coloring's walkers): grab.press(event) says whether
//                   this press picks it up (asked only while nothing
//                   else is pressed), grab.move(event) follows that
//                   pointer, and grab.release() lets go. Such a press
//                   is never a click.
// The mouse cursor says what a press does: an open hand ("grab") where
// something can be picked up, a pointing hand ("pointer") where a click
// does something, and a closed hand ("grabbing") while pressed.
// (Otherwise, css/style.css shows the hands on a picture that can move.)
function connectPicture(view, options) {
  options = options || {};
  const canvas = view.canvas, disk = options.disk || null, grab = options.grab || null;
  const cursor = grab ? "grab" : options.onClick ? "pointer" : null;
  const clicks = makeClickTracker();
  let grabbed = null;     // the pointer that picked up the grab (its id), or null
  // (On phones, a finger on a picture that can move drags it instead of
  // scrolling the page: "touch-action: none" in css/style.css.)

  // On a hyperbolic tiling or tree, exactly one pointer pressed drags
  // across the plane.
  function startDrag() {
    if (!disk) return;
    if (options.onGraph()) startPlaneDrag(disk);
    else disk.dragFrom = null;
  }
  function showCursor() {
    if (cursor) canvas.style.cursor = clicks.isPressed() ? "grabbing" : cursor;
  }

  canvas.addEventListener("pointerdown", function (event) {
    clicks.press(event);
    if (grab && grabbed === null && view.pointers.size === 0 && grab.press(event)) {
      grabbed = event.pointerId;
      canvas.setPointerCapture(event.pointerId);   // keep getting moves even off the canvas
    } else {
      pressPointer(view, event);
    }
    startDrag();
    showCursor();
  });

  canvas.addEventListener("pointermove", function (event) {
    showCursor();
    if (!clicks.move(event)) return;
    if (event.pointerId === grabbed) {
      grab.move(event);
    } else if (disk && disk.dragFrom && view.pointers.has(event.pointerId)) {
      view.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });   // where a second finger starts from
      dragPlane(disk, event.clientX, event.clientY);
      view.redraw();
    } else {
      movePointer(view, event);
    }
  });

  function release(event, mayClick) {
    const isClick = clicks.release(event);
    if (isClick === null) return;
    const wasGrab = grabbed !== null;
    if (event.pointerId === grabbed) { grabbed = null; grab.release(); }
    releasePointer(view, event);
    startDrag();
    showCursor();
    if (mayClick && isClick && !wasGrab && options.onClick) options.onClick(event);
  }
  canvas.addEventListener("pointerup", function (event) { release(event, true); });
  canvas.addEventListener("pointercancel", function (event) { release(event, false); });
}


/* =====================================================================
   THE PLANE
   ---------------------------------------------------------------------
   Sinusoid-ish, Matrix Products and Sequential Continuous Tiling draw
   points of the plane, not cells: a graph, a cloud of dots, tiles of
   every size. Their picture is a "plane view". It fills its canvas, and
   shows the point (cx, cy) in its middle, with ux screen pixels per
   unit across and uy per unit up (the same, unless an axis was scaled
   on its own). A page makes one for its canvas, and connects it like a
   picture of cells:
     const plane = makePlaneView(simCanvas, drawSoon, options);
     connectPicture(plane, { onClick: onClick });
   and each time it draws the whole picture:
     const pen = sizePlane(plane, height);       // size the canvas
     drawPlaneGrid(plane, pen);                  // the grid, axes and numbers
     ... pixelX(plane, x), pixelY(plane, y) ...  // where the point (x, y) goes
   The options:
     whole()    the box { xmin, xmax, ymin, ymax } that is the whole
                picture (Sequential Continuous Tiling: all of S). The
                plane starts out showing all of it, and Reset shows it
                again (so does the page, with showWhole, when the whole
                changes). Zooming stays between PLANE_ZOOM_OUT and
                PLANE_ZOOM_IN times that, and when the canvas changes
                size, the picture grows or shrinks with it.
     reset()    on a plane with no whole, what Reset does (the plane
                then draws again). When its canvas changes size, the
                scale stays: a bigger picture shows more, as in Desmos.
     axes       true: the mouse wheel over an axis scales just that axis
                (the axis turns light blue under the pointer)
     onMove()   (optional) called after each move or zoom by hand
     resetTitle what the Reset button does, for its tooltip (e.g.
                "Show all of S once again")
     resetWord  (optional) the Reset button's word, if not "Reset"
   Like Desmos, the grid has light gray lines at nice steps (1, 2 or 5
   times a power of 10), black axes, and numbers along them.
   ===================================================================== */

const GRID_PIXELS = 60;       // the grid lines are at least about this far apart, in pixels
const PLANE_ZOOM_OUT = 0.1;   // a plane with a whole zooms out to a tenth of it...
const PLANE_ZOOM_IN = 1e6;    // ... and in a million times
const AXIS_REACH = 10;        // how close (in pixels) the pointer must be to an axis to scale just it
const PLANE_COLORS = { lines: "#e6e6e6", axes: "#000000", numbers: "#555555", hover: "#bfe0ff" };

function makePlaneView(canvas, redraw, options) {
  const plane = {
    canvas: canvas,
    redraw: redraw,
    whole: options.whole || null,
    width: 0, height: 0,          // the canvas's size in screen pixels, from the last sizePlane
    left: 0, top: 0,              // (the picture fills the canvas)
    cx: 0, cy: 0, ux: 1, uy: 1,   // the point in the middle, and pixels per unit across and up
    hoverAxis: null,              // "x" or "y" while the pointer is over that axis (with "axes")
    movable: true,
    pointers: new Map(),          // the pointers pressed on the picture: id -> {x, y}
  };
  canvas.classList.add("scrollable");   // the hand cursor; on phones a finger drags (or pinches) the picture, not the page
  const moved = options.onMove || function () {};
  plane.slide = function (dx, dy) { slidePlane(plane, dx, dy); moved(); };
  plane.zoomAt = function (factor, x, y) { zoomPlane(plane, factor, x, y); moved(); };
  connectZoomControls(plane, function () {
    if (plane.whole) showWhole(plane, plane.whole()); else options.reset();
    plane.redraw();
  }, options.resetTitle, options.resetWord);
  if (options.axes) connectAxes(plane);
  return plane;
}

// Size the canvas: as wide as the page lets it, "height" pixels tall.
// Returns its pen, ready to draw in screen pixels. The point in the
// middle stays where it is, and so does the scale (on a plane with a
// whole, the zoom; the first time, it shows the whole).
function sizePlane(plane, height) {
  const before = plane.whole ? fitUnit(plane, plane.whole(), 1) : 0;   // 0 before the first time
  plane.width = plane.canvas.clientWidth;
  plane.height = height;
  if (plane.whole) {
    if (before > 0) {
      const grow = fitUnit(plane, plane.whole(), 1) / before;
      plane.ux *= grow;
      plane.uy *= grow;
    } else {
      showWhole(plane, plane.whole());
    }
  }
  return sharpPen(plane.canvas, plane.width, height);   // (js/sim-page.js)
}

// Where the point (x, y) of the plane is on the screen, in screen
// pixels from the canvas's top left; and the point at the screen pixel
// (sx, sy).
function pixelX(plane, x) { return plane.width / 2 + (x - plane.cx) * plane.ux; }
function pixelY(plane, y) { return plane.height / 2 - (y - plane.cy) * plane.uy; }
function pointX(plane, sx) { return plane.cx + (sx - plane.width / 2) / plane.ux; }
function pointY(plane, sy) { return plane.cy - (sy - plane.height / 2) / plane.uy; }

// The part of the plane shown: { xmin, xmax, ymin, ymax }.
function planeBox(plane) {
  return { xmin: pointX(plane, 0), xmax: pointX(plane, plane.width),
           ymin: pointY(plane, plane.height), ymax: pointY(plane, 0) };
}

// Show another part of the plane: "part" has any of xmin, xmax, ymin
// and ymax (the others stay). Returns false, and shows the same part,
// if they don't make a box.
function showPlaneBox(plane, part) {
  const b = Object.assign(planeBox(plane), part);
  if (!(b.xmax > b.xmin && b.ymax > b.ymin && isFinite(b.xmax - b.xmin) && isFinite(b.ymax - b.ymin))) return false;
  plane.cx = (b.xmin + b.xmax) / 2;
  plane.cy = (b.ymin + b.ymax) / 2;
  plane.ux = plane.width / (b.xmax - b.xmin);
  plane.uy = plane.height / (b.ymax - b.ymin);
  return true;
}

// Show all of "box" in the middle, as big as fits, with the same unit
// across and up, and "margin" times as much room as it needs (1 when
// left out; 1.15: 15% more). A box that is a single point shows 2 units
// across.
function showWhole(plane, box, margin) {
  const unit = fitUnit(plane, box, margin || 1);
  plane.cx = (box.xmin + box.xmax) / 2;
  plane.cy = (box.ymin + box.ymax) / 2;
  plane.ux = plane.uy = isFinite(unit) ? unit : plane.width / 2;
}

// The most pixels per unit that still show all of "box", with "margin".
function fitUnit(plane, box, margin) {
  return Math.min(plane.width / (margin * (box.xmax - box.xmin)), plane.height / (margin * (box.ymax - box.ymin)));
}

// Move the picture by (dx, dy) screen pixels.
function slidePlane(plane, dx, dy) {
  plane.cx -= dx / plane.ux;
  plane.cy += dy / plane.uy;
}

// Zoom by "factor" (2: twice as close) around the screen point (x, y):
// the point of the plane there stays there. Over an axis
// (plane.hoverAxis), just that axis.
function zoomPlane(plane, factor, x, y) {
  const px = pointX(plane, x), py = pointY(plane, y);
  if (plane.whole) {
    const unit = fitUnit(plane, plane.whole(), 1);
    factor = Math.min(Math.max(plane.ux * factor, PLANE_ZOOM_OUT * unit), PLANE_ZOOM_IN * unit) / plane.ux;
  }
  if (plane.hoverAxis !== "y") plane.ux *= factor;
  if (plane.hoverAxis !== "x") plane.uy *= factor;
  plane.cx = px - (x - plane.width / 2) / plane.ux;
  plane.cy = py + (y - plane.height / 2) / plane.uy;
}

// Where the axes are drawn: at 0, or kept just inside the edge when 0
// is off the picture (so their numbers still show, as in Desmos).
function axisRow(plane) { return Math.min(plane.height - 1, Math.max(0, Math.round(pixelY(plane, 0)))); }
function axisColumn(plane) { return Math.min(plane.width - 1, Math.max(0, Math.round(pixelX(plane, 0)))); }

// While no pointer is pressed, the axis under the pointer (if any) is
// the one the wheel scales: it turns light blue, and the cursor shows
// which way it stretches.
function connectAxes(plane) {
  plane.canvas.addEventListener("pointermove", function (event) {
    if (plane.pointers.size > 0) return;
    const spot = pointerSpot(plane, event);
    const toX = Math.abs(spot.y - axisRow(plane)), toY = Math.abs(spot.x - axisColumn(plane));
    hoverOverAxis(plane, Math.min(toX, toY) > AXIS_REACH ? null : toX <= toY ? "x" : "y");
  });
  plane.canvas.addEventListener("pointerleave", function () { hoverOverAxis(plane, null); });
}

function hoverOverAxis(plane, axis) {
  if (axis === plane.hoverAxis) return;
  plane.hoverAxis = axis;
  plane.canvas.style.cursor = axis === "x" ? "ew-resize" : axis === "y" ? "ns-resize" : "";
  plane.redraw();
}

// The grid, like Desmos's: light gray lines at nice steps, at least
// about GRID_PIXELS apart; the axis the wheel scales (with "axes"), in
// light blue; black axes; and numbers along them, kept inside the
// picture (none at 0, where the axes cross, or cut off at the top).
// yText(y) writes the number for the line at height y (shortLabel when
// left out).
function drawPlaneGrid(plane, pen, yText) {
  const box = planeBox(plane), width = plane.width, height = plane.height;
  const xStep = niceStep(GRID_PIXELS / plane.ux), yStep = niceStep(GRID_PIXELS / plane.uy);
  const xs = multiplesOf(xStep, box.xmin, box.xmax), ys = multiplesOf(yStep, box.ymin, box.ymax);
  const row = axisRow(plane), column = axisColumn(plane);

  pen.lineWidth = 1;
  pen.strokeStyle = PLANE_COLORS.lines;
  pen.beginPath();
  for (const x of xs) lineDown(pen, Math.round(pixelX(plane, x)), height);
  for (const y of ys) lineAcross(pen, Math.round(pixelY(plane, y)), width);
  pen.stroke();

  pen.fillStyle = PLANE_COLORS.hover;
  if (plane.hoverAxis === "x") pen.fillRect(0, row - AXIS_REACH / 2, width, AXIS_REACH);
  if (plane.hoverAxis === "y") pen.fillRect(column - AXIS_REACH / 2, 0, AXIS_REACH, height);

  pen.strokeStyle = PLANE_COLORS.axes;
  pen.beginPath();
  if (box.ymin <= 0 && box.ymax >= 0) lineAcross(pen, row, width);
  if (box.xmin <= 0 && box.xmax >= 0) lineDown(pen, column, height);
  pen.stroke();

  pen.fillStyle = PLANE_COLORS.numbers;
  pen.font = "11px sans-serif";
  const numbersRow = Math.min(height - 4, Math.max(12, row + 13));
  for (const x of xs) {
    if (Math.abs(x) < xStep / 2) continue;
    const label = shortLabel(x, xStep);
    pen.fillText(label, pixelX(plane, x) - pen.measureText(label).width / 2, numbersRow);
  }
  for (const y of ys) {
    const sy = pixelY(plane, y);
    if (Math.abs(y) < yStep / 2 || sy < 14) continue;
    const label = yText ? yText(y) : shortLabel(y, yStep);
    pen.fillText(label, Math.min(width - pen.measureText(label).width - 4, Math.max(2, column + 4)), sy - 3);
  }
}

// A line 1 pixel wide down the screen at pixel column x, or across it at
// pixel row y. (The + 0.5 puts it right on a column or row of pixels, so
// it looks crisp.)
function lineDown(pen, x, height) { pen.moveTo(x + 0.5, 0); pen.lineTo(x + 0.5, height); }
function lineAcross(pen, y, width) { pen.moveTo(0, y + 0.5); pen.lineTo(width, y + 0.5); }
