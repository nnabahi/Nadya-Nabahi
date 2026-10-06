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

   The same sims also run on "Hyperbolic plane or tree": a ball of R
   steps of a hyperbolic tiling or a tree. js/sim-hyperbolic.js builds
   it (makeBall) and draws it; section 2 here is the little the three
   pages share around that.

   Contents:
     1. paintCells(view, pen, d, groupOf, rgbOf, outsideRGB)
          paint the cells of domain d; returns the group of each square
          that shows (for drawBorders in js/sim-view.js)
     2. ballFromOptions(dv, made, defaultR, mostR, mostCells)
          the ball from the options on the page
        drawBall(dv, graph, ball, colorOf)
          draw it, one color per cell
        ballSpot(dv, ball, v)
          where cell v of the ball is on the screen, and how big
   ===================================================================== */


/* =====================================================================
   1. PAINTING A BOX, A TORUS OR A DRAWN REGION
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


/* =====================================================================
   2. A BALL OF A HYPERBOLIC TILING OR A TREE
   ---------------------------------------------------------------------
   Needs js/sim-graphs.js and js/sim-hyperbolic.js. The page keeps a
   "disk view" dv (makeDiskView, js/sim-hyperbolic.js): which graph,
   which picture ("Drawn in"), and how far the plane has been moved.
   ===================================================================== */

const BALL_HEIGHT = 480;            // the picture's height, in screen pixels
const BALL_OUTSIDE = "#ecebe7";     // the plane around the ball
const BALL_WHITE_DOT = "#d8d5ce";   // white cells, as dots in the spread-out tree (white dots wouldn't show)

// The ball from the options on the page: the graph (readGraphOptions,
// js/sim-hyperbolic.js) and every cell within R steps of the start.
// "made" is an object that remembers the graph itself (made.graph), so
// it is made again only when the graph changes. A ball of a tiling
// grows exponentially with R, so it is cut back to at most "mostCells"
// cells, and the line under R says so. Puts the start back in the
// middle. Returns null if the options aren't a hyperbolic graph.
function ballFromOptions(dv, made, defaultR, mostR, mostCells) {
  if (!readGraphOptions(dv)) return null;
  if (made.spec !== dv.spec) { made.graph = makeGraph(dv.spec); made.spec = dv.spec; }
  const R = readWhole("set-ball-radius", 1, mostR, defaultR);
  const ball = makeBall(made.graph, R, mostCells);
  byId("set-ball-radius").value = ball.R;
  byId("ball-info").textContent = ball.n.toLocaleString() + " cells." + (ball.R < R
    ? " A ball of radius " + R + " would have more than " + mostCells.toLocaleString() +
      " cells, the most this page uses, so R is " + ball.R + "."
    : "");
  backToStart(dv);
  return ball;
}

// Draw the ball, cell v filled with colorOf(v) (a CSS color such as
// "#f2735a"), in the picture chosen: the disk or the half-plane with
// the rest of the tiling (or tree) in thin gray, or the tree spread out
// in rings. Returns the pen, to draw more on top.
function drawBall(dv, graph, ball, colorOf) {
  const height = pictureHeight(BALL_HEIGHT);
  if (dv.picture === "spread") {
    return drawSpreadTree(dv, height, ball.n,
      function (v) { return ball.depth[v]; }, function (v) { return ball.angle[v]; },
      function (v) { const c = colorOf(v); return c === "#ffffff" ? BALL_WHITE_DOT : c; });
  }
  const pen = diskPen(dv, height);
  drawDiskFrame(dv, pen, height, BALL_OUTSIDE, UNDER_COLOR);
  drawOnDisk(dv, pen, graph, ball.n, function (v) { return ballPlace(ball, v); }, colorOf);
  return pen;
}

// Where the middle of cell v of the ball is on the screen, as
// { x, y, size } (size: about its radius, in pixels), or null if it is
// off the screen. Call after drawBall.
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
