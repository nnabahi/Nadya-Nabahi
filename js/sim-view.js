/* =====================================================================
   sim-view.js  —  where a sim's picture goes, and moving and zooming it
   ---------------------------------------------------------------------
   The sims draw their domain (js/sim-domains.js) as one square per
   cell, in a box in the middle of their canvas, as big as fits. The
   picture can also be moved and zoomed, like a graph in Desmos, to see
   the small details:
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
     const cells = cellsShown(view, domain);            // the squares that show
     ... paints each square, between squareLeft and squareTop ...
     drawBorders(view, pen, shown, color);              // lines between colors
   It passes its pointer events on to pressPointer, movePointer and
   releasePointer (so a sim can drag other things too, like the random
   walk sim's walkers), and calls useTorus when the domain changes.
   (A picture that shouldn't move at all, like the random mountain's 1D
   side view, passes movable = false to useTorus.)
   pointerSpot and cellUnder say which cell is under the pointer (to
   click a cell, or drop a walker on it).

   The page's HTML puts the canvas and the zoom buttons in one box:
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
     cellsShown(view, d)         which cell is on each square that shows
     squareLeft, squareTop       where the sides of the squares are
     drawBorders(...)            the lines between squares of different colors
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
  const across = d.xmax - d.xmin + 1, down = d.ymax - d.ymin + 1;
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

  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  canvas.style.height = tall + "px";
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(tall * ratio);
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
  const i = Math.floor((spot.x - view.left) / view.cell - view.scroll.x);   // its square (i, k)
  const k = Math.floor(spot.y / view.cell - view.scroll.y);
  return cellAt(d, d.xmin + i, d.ymax - k);
}
