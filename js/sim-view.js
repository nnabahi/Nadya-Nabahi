/* =====================================================================
   sim-view.js  —  where a sim's picture goes, and moving and zooming
   it on a torus
   ---------------------------------------------------------------------
   The sims draw their domain (js/sim-domains.js) as one square per
   cell, in a box in the middle of their canvas, as big as fits. On a
   torus (or a region drawn on one) the picture can also be moved and
   zoomed, like a graph in Desmos:
     drag it                          move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   Zoomed out, the torus shows several times side by side.

   This file does all of that for every sim, so it is written once. A
   sim page makes one "view" for its canvas: an object that remembers
   where the picture is, and how far it is moved and zoomed.
     const view = makeView(simCanvas, drawSoon);
   Each time the page draws, it asks the view where things go:
     const pen = fitPicture(view, domain, maxHeight);   // size the canvas
     const cells = cellsShown(view, domain);            // the squares that show
     ... paints each square, between squareLeft and squareTop ...
     drawBorders(view, pen, shown, color);              // lines between colors
   It passes its pointer events on to pressPointer, movePointer and
   releasePointer (so a sim can drag other things too, like the random
   walk sim's walkers), and calls useTorus when the domain changes.

   The page's HTML puts the canvas and the zoom buttons in one box:
     <div class="sim-picture">
       <canvas id="sim-canvas"></canvas>
       <div class="zoom-buttons" id="zoom-buttons" hidden>
         <button class="tool-button" id="zoom-in" title="Zoom in">+</button>
         <button class="tool-button" id="zoom-out" title="Zoom out">&minus;</button>
         <button class="tool-button" id="zoom-reset" title="Show the whole torus once again">Reset</button>
       </div>
     </div>

   Contents:
     makeView(...)               a new view (with the wheel and buttons)
     useTorus(view, on)          a new domain: moving and zooming on or off
     showZoomButtons(view)       show the buttons only on a torus
     fitPicture(view, d, ...)    place the picture and size the canvas
     cellsShown(view, d)         which cell is on each square that shows
     squareLeft, squareTop       where the sides of the squares are
     drawBorders(...)            the lines between squares of different colors
     zoomBy, resetView           zoom around a point; back to the start
     pressPointer, movePointer, releasePointer   dragging and pinching
   ===================================================================== */


// Zooming. Zoom 1 shows the whole torus once.
const MIN_ZOOM = 0.25;            // zoomed out: the torus 4 times across
const MAX_ZOOM = 8;               // zoomed in: cells 8 times bigger
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
    top: top || 0,
    wholeCells: wholeCells || Infinity,

    // Where the picture's box sits on the canvas, from the last
    // fitPicture, in screen pixels: its left side, width and height, and
    // "size", the size of a cell when the whole domain fits (zoom 1).
    left: 0, width: 0, height: 0, size: 1,

    // The squares that showed, from the last cellsShown: columns firstI
    // .. lastI and rows firstK .. lastK (cols x rows squares), each
    // "cell" pixels big (the size with the zoom).
    cell: 1, firstI: 0, lastI: -1, firstK: 0, lastK: -1, cols: 0, rows: 0,

    // Moving and zooming: on a torus only. Elsewhere they stay 0 and 1.
    torus: false,
    scroll: { x: 0, y: 0 },   // how far the picture is moved, in cells
    zoom: 1,                  // 2 = cells twice as big, 0.5 = half as big
    pointers: new Map(),      // the pointers pressed on the picture: id -> {x, y}
  };

  // The mouse wheel zooms around the pointer, as in Desmos. So does a
  // pinch on a trackpad, which the browser reports as the wheel with the
  // Ctrl key held (and small steps, so it counts for more).
  canvas.addEventListener("wheel", function (event) {
    if (!view.torus) return;
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
// one), where the picture can be moved and zoomed. Either way it starts
// from the whole picture, at zoom 1. (The "scrollable" class gives the
// canvas the hand cursor: section 8 of css/style.css.)
function useTorus(view, on) {
  view.torus = on;
  view.scroll = { x: 0, y: 0 };
  view.zoom = 1;
  view.canvas.classList.toggle("scrollable", on);
  showZoomButtons(view);
}

// The + / − / Reset buttons show only on a torus, with its picture.
function showZoomButtons(view) {
  byId("zoom-buttons").hidden = !view.torus || view.canvas.hidden;
}


/* ---------------------------------------------------------------------
   Drawing
   --------------------------------------------------------------------- */

// Place the picture of domain d: as big as fits the canvas's width (and
// at most maxHeight pixels tall), in the middle. Sizes the canvas to
// match, and returns its pen, ready to draw in screen pixels (y = 0 is
// "top" pixels down) and cut off ("clipped") at the picture's box.
// pen.restore() lifts the cut-off.
function fitPicture(view, d, maxHeight) {
  const canvas = view.canvas;
  const across = d.xmax - d.xmin + 1, down = d.ymax - d.ymin + 1;
  const cssWidth = canvas.clientWidth;
  view.size = Math.min(cssWidth / across, maxHeight / down);
  if (view.size >= view.wholeCells) view.size = Math.floor(view.size);
  view.width = Math.round(view.size * across);
  view.height = Math.round(view.size * down);
  view.left = Math.round((cssWidth - view.width) / 2);

  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  canvas.style.height = (view.height + 2 * view.top) + "px";
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round((view.height + 2 * view.top) * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, view.top * ratio);   // screen pixels from here on
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


/* ---------------------------------------------------------------------
   Moving and zooming
   --------------------------------------------------------------------- */

// Zoom by "factor" (2 = twice as close) around the point (px, py), in
// screen pixels from the top left of the picture's box: the cell under
// that point stays under it.
function zoomBy(view, factor, px, py) {
  const before = cellSize(view);
  // Zoomed out, cells stay at least MIN_CELL_PIXELS big (but the whole
  // torus, zoom 1, is always allowed, even with smaller cells).
  const least = Math.min(1, Math.max(MIN_ZOOM, MIN_CELL_PIXELS / view.size));
  view.zoom = Math.min(Math.max(view.zoom * factor, least), MAX_ZOOM);
  const after = cellSize(view);
  view.scroll.x += px / after - px / before;
  view.scroll.y += py / after - py / before;
  view.redraw();
}

// Back to the whole torus, once, as at the start.
function resetView(view) {
  view.zoom = 1;
  view.scroll = { x: 0, y: 0 };
  view.redraw();
}

// Moving the torus with the mouse or fingers: the page passes its
// pointer events on to these three. ("Pointer" events cover the mouse,
// a pen and fingers alike.) With one finger (or the mouse) down, the
// picture follows it. With two fingers, it follows the point between
// them and zooms as they spread apart or pinch together.
function pressPointer(view, event) {
  if (!view.torus) return;
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
