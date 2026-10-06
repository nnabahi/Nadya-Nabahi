/* =====================================================================
   cell-picture.js  —  painting one color per cell, fast
   ---------------------------------------------------------------------
   Shared by the sims that show a color on every cell: the Ising and
   Potts model, the voter model and the percolation sims. (The other
   sims each had their own copy of this; these share one.)

   How it works: the view (js/sim-view.js) says which squares show on
   screen and which cell is on each. Each square's color goes into a
   small image with one pixel per square, which is then blown up with
   smoothing off, so the squares stay crisp. Setting pixels one by one
   is fast even for many thousands of squares.

   Contents:
     paintCells(view, pen, d, groupOf, rgbOf, outsideRGB)
       paint the cells of domain d; returns the group of each square
       that shows (for drawBorders in js/sim-view.js)
   ===================================================================== */

const tinyCanvas = document.createElement("canvas");   // one pixel per square that shows

// Paint every square that shows. For cell v, groupOf(v) is a whole
// number (its color number, or its cluster), and rgbOf(group) is how
// that group is drawn, as [red, green, blue], each 0 .. 255. Squares
// not in the domain get "outsideRGB". "pen" comes from fitPicture.
// Returns the group on each square (-2 outside the domain), in the
// order of cellsShown, ready for drawBorders.
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
