/* =====================================================================
   sim-view.js  —  where a sim's picture goes, and moving and zooming it
   ---------------------------------------------------------------------
   The sims draw their domain (js/sim-domains.js) as one square per
   cell (or one polygon, for triangles, hexagons and other tilings), in
   a box in the middle of their canvas, as big as fits. The picture can
   also be moved and zoomed, like a graph in Desmos, to see the small
   details:
     drag it                          move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   On a box (or a drawn region) the picture zooms in down to single
   cells, and can't be zoomed out past the whole box, or moved off it.
   On a torus (or a region drawn on one) it can also be zoomed out, and
   then the torus shows several times side by side.

   This file does all of that for every sim, so it is written once. A
   sim page makes one "view" for its canvas: an object that remembers
   where the picture is, and how far it is moved and zoomed.
     const view = makeView(simCanvas, drawSoon);
   Each time the page draws, it asks the view where things go:
     const pen = fitPicture(view, domain, maxHeight);   // size the canvas
     const shown = paintCells(view, pen, domain, ...);  // paint the squares that show
     drawBorders(view, pen, shown, color);              // lines between colors
   (paintDomain does both, or paints polygons on a tiling instead; to
   paint the squares itself, cellsShown says which cell is on
   each, and squareLeft and squareTop where it goes). Its pointer events
   go to pressPointer, movePointer and releasePointer: connectPicture
   (js/sim-controls.js) does that, and a page that drags other things
   too, like the random walk sim's walkers, does it itself. It calls
   useTorus when the domain changes. (A picture that shouldn't move at
   all, like Eden Growth's 1D side view, passes movable = false
   to useTorus.) pointerSpot and cellUnder say which cell is under the
   pointer (to click a cell, or drop a walker on it).

   The page's HTML puts the canvas and the zoom buttons in one box (on
   pages with the hyperbolic plane or tree, "Back to the start" and
   "Slide" join the zoom buttons: js/sim-hyperbolic.js):
     <div class="sim-picture">
       <canvas id="sim-canvas"></canvas>
       <div class="zoom-buttons" id="zoom-buttons" hidden>
         <button class="tool-button" id="zoom-in" title="Zoom in">+</button>
         <button class="tool-button" id="zoom-out" title="Zoom out">&minus;</button>
         <button class="tool-button" id="zoom-reset" title="Show the whole picture once again">Reset</button>
       </div>
     </div>

   Contents:
     makeView(...)               a new view (with the wheel and buttons)
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
     zoomBy, resetView           zoom around a point; back to the start
     pressPointer, movePointer, releasePointer   dragging and pinching
     pointerSpot, cellUnder      the cell under the pointer
   ===================================================================== */


// Zooming. Zoom 1 shows the whole box or torus once.
const MIN_ZOOM = 0.25;            // zoomed out (torus only): the torus 4 times across
const MAX_CELL_PIXELS = 400;      // zoomed in: a cell at most this many pixels big
const MAX_ZOOM = 8;               // ... but always allowed to zoom in at least 8 times
const MIN_CELL_PIXELS = 2;        // but zoomed out, cells stay at least this big
const ZOOM_STEP = 1.5;            // how much one click on + or − zooms


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

  // The mouse wheel zooms around the pointer, as in Desmos. So does a
  // pinch on a trackpad, which the browser reports as the wheel with the
  // Ctrl key held (and small steps, so it counts for more).
  canvas.addEventListener("wheel", function (event) {
    if (!view.movable) return;
    event.preventDefault();                              // don't scroll the page
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : 1);   // some mice count lines
    const box = canvas.getBoundingClientRect();
    zoomBy(view, Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.002)),
           event.clientX - box.left - view.left, event.clientY - box.top - view.top);
  }, { passive: false });   // "passive: false" lets preventDefault stop the page scrolling

  // The + / − / Reset buttons. + and − zoom around the middle.
  byId("zoom-in").addEventListener("click", function () {
    zoomBy(view, ZOOM_STEP, view.width / 2, view.height / 2);
  });
  byId("zoom-out").addEventListener("click", function () {
    zoomBy(view, 1 / ZOOM_STEP, view.width / 2, view.height / 2);
  });
  byId("zoom-reset").addEventListener("click", function () { resetView(view); });

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
  byId("zoom-buttons").hidden = !view.movable || view.canvas.hidden;
}


/* ---------------------------------------------------------------------
   Drawing
   --------------------------------------------------------------------- */

// Place the picture of domain d: as big as fits the canvas's width (and
// at most maxHeight pixels tall), in the middle. Sizes the canvas to
// match, and returns its pen, ready to draw in screen pixels (y = 0 is
// "top" pixels down) and cut off ("clipped") at the picture's box.
// pen.restore() lifts the cut-off. In the full screen popup
// (js/sim-page.js), the canvas is as tall as the popup instead, with the
// picture in the middle of it.
function fitPicture(view, d, maxHeight) {
  const canvas = view.canvas;
  const box = pictureBox(d);                    // (js/sim-domains.js)
  const across = box.right - box.left, down = box.top - box.bottom;
  const cssWidth = canvas.clientWidth;
  const popup = pictureHeight(0);               // 0 when the popup isn't open
  if (popup > 0) maxHeight = popup - 2 * view.margin;
  view.size = Math.min(cssWidth / across, maxHeight / down);
  if (view.size >= view.wholeCells) view.size = Math.floor(view.size);
  view.width = Math.round(view.size * across);
  view.height = Math.round(view.size * down);
  view.left = Math.round((cssWidth - view.width) / 2);
  view.top = popup > 0 ? Math.round((popup - view.height) / 2) : view.margin;
  const tall = popup > 0 ? popup : view.height + 2 * view.top;

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
   Moving and zooming
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
  view.redraw();
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

// Back to the whole box or torus, once, as at the start.
function resetView(view) {
  view.zoom = 1;
  view.scroll = { x: 0, y: 0 };
  view.redraw();
}

// Moving the picture with the mouse or fingers: the page passes its
// pointer events on to these three. ("Pointer" events cover the mouse,
// a pen and fingers alike.) With one finger (or the mouse) down, the
// picture follows it. With two fingers, it follows the point between
// them and zooms as they spread apart or pinch together.
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
  const size = cellSize(view);
  view.scroll.x += (after.x - before.x) / size;
  view.scroll.y += (after.y - before.y) / size;
  keepInBox(view);
  if (view.pointers.size >= 2 && before.apart > 0) {
    const box = view.canvas.getBoundingClientRect();
    zoomBy(view, after.apart / before.apart, after.x - box.left - view.left, after.y - box.top - view.top);
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
// canvas's left side, y from the top of the picture ("top" pixels down).
function pointerSpot(view, event) {
  const box = view.canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top - view.top };
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
