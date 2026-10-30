/* =====================================================================
   sim-cluster-page.js  —  what the pages of the sims that grow a
                           cluster of cells share (the discrete DLA
                           sims)
   ---------------------------------------------------------------------
   Their growth runs in a second thread (serveGrowth, js/sim-cluster.js)
   and sends the cluster's cells a few at a time. Each page keeps them
   and draws them the same way:
     newClusterOnPage(dimNow)   the cluster on the page (dimNow() says
                                the page's dimension now):
       cluster.pile             its cells (newSitePile, js/sim-sites.js)
       cluster.tiling, .block   the tiling (2D, or on a Penrose tiling
                                the page's copy of its plane) or tiling
                                of space (3D) it grew on; null on the
                                square grid
       cluster.forSetup()       the lattice the options say, for a new
                                growth: { tiling, block, cellsKnown }
       cluster.keep(message)    keep the cells new in a growth's message
     drawClusterCells(cluster, view, three, look)   draw it: in 2D its
                                cells as squares or polygons, with the
                                origin's cell outlined; in 3D each cell
                                in its own shape
     showClusterPicture(view, three, dim)   the flat picture (1D, 2D) or
                                the 3D one, whichever the dimension needs
     clusterStopped(message, most, edge)   the line under the picture,
                                when the growth has stopped by itself
   Load it after js/sim-page.js, js/sim-view.js, js/sim-sites.js,
   js/sim-controls.js, js/sim-penrose.js and js/sim-honeycombs.js.
   ===================================================================== */

function newClusterOnPage(dimNow) {
  const cluster = { pile: newSitePile(), tiling: null, block: null, forSetup: forSetup, keep: keep };
  // The lattice of the latest restart: the cluster's, once its first
  // message comes. On a Penrose tiling, the page's copy of the plane.
  let runTiling = null, runBlock = null, mirror = null;

  function forSetup() {
    const dim = dimNow(), tiling = dim === 2 && !onSquares() ? tilingInUse.block : null;   // (js/sim-controls.js)
    const finite = Boolean(tiling && tiling.finite);
    if (finite) mirror = penroseMirror(mirror, tiling);
    runTiling = finite ? mirror : tiling;
    runBlock = dim === 3 ? spaceBlockInUse() : null;
    return { tiling: tiling, block: runBlock, cellsKnown: finite ? mirror.cells.length : 0 };
  }

  // A message starting from cell 0 is a fresh cluster, on the lattice of
  // the latest restart.
  function keep(message) {
    if (message.sitesFrom === 0) { cluster.tiling = runTiling; cluster.block = runBlock; }
    cluster.pile.keep(message.sitesFrom, message.siteI, message.siteJ, message.siteK, message.sitePart);
    if (message.planeCells) addPlaneCells(cluster.tiling, message.planeCells);
  }

  return cluster;
}

// Draw the cluster. "look" has height (the picture's, in screen pixels:
// the canvas keeps it as the cluster grows, so the page doesn't jump),
// colorGroup(i) (the color group of cell i) and colorOf(group) (its
// color), background (the empty cells' color) and origin (the color of
// the origin's outline).
function drawClusterCells(cluster, view, three, look) {
  if (cluster.block) drawCells3D(cluster, three, look);
  else if (cluster.tiling) drawClusterPolygons(cluster, view, look);
  else drawClusterSquares(cluster, view, look);
}

// 2D: the squares, painted as in the other sims (paintCells,
// js/sim-view.js), with the origin's square outlined.
function drawClusterSquares(cluster, view, look) {
  const shown = cluster.pile.squaresShown(1);   // (one square to spare all round)
  const pen = fitPicture(view, shown, look.height, true);
  paintCells(view, pen, shown, look.colorGroup, look.colorOf, hexToRGB(look.background));
  const left = squareLeft(view, -shown.xmin), top = squareTop(view, shown.ymax);
  const right = squareLeft(view, 1 - shown.xmin), bottom = squareTop(view, shown.ymax + 1);
  outlineCell(pen, [[left, top], [right, top], [right, bottom], [left, bottom]], look.origin);
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// 2D on another tiling: the cells as polygons (paintDomain,
// js/sim-view.js), with the origin's cell outlined.
function drawClusterPolygons(cluster, view, look) {
  const tiling = cluster.tiling, shown = cluster.pile.tilingShown(tiling, null);   // (js/sim-sites.js)
  const pen = fitPicture(view, shown, look.height, true);
  paintDomain(view, pen, shown, look.colorGroup, look.colorOf, hexToRGB(look.background), null, 0);
  const { sx, sy } = screenCopies(view, shown)[0];
  outlineCell(pen, tiling.cells[0].corners.map(function ([u, w]) { return [sx(u), sy(w)]; }), look.origin);   // (cell 0 of block (0, 0))
  pen.restore();   // (fitPicture cut everything off at the picture's box)
}

// A cell outlined, through its corners on the canvas.
function outlineCell(pen, corners, color) {
  pen.strokeStyle = color;
  pen.lineWidth = 1;
  pen.beginPath();
  corners.forEach(function ([x, y], k) { if (k === 0) pen.moveTo(x, y); else pen.lineTo(x, y); });
  pen.closePath();
  pen.stroke();
}

// 3D (make3D, js/sim-page.js, loads it the first time it is needed):
// each cell in its own shape (js/sim-3d.js); past its most, only the
// last cells to join are drawn, which are the outside of the cluster.
function drawCells3D(cluster, three, look) {
  if (!three.view) return;
  const pile = cluster.pile, n = pile.count;
  three.code.drawCells(three.view, {
    x: pile.I.subarray(0, n), y: pile.J.subarray(0, n), z: pile.K.subarray(0, n),
    block: cluster.block, part: pile.part.subarray(0, n),
    color: function (i) { return look.colorOf(look.colorGroup(i)); },
  });
}

// The flat picture (1D, 2D) or the 3D one, with the 3D picture's help
// line (id view3d-help). Only the 2D picture moves and zooms.
function showClusterPicture(view, three, dim) {
  view.canvas.hidden = (dim === 3);
  three.show(dim === 3);
  byId("view3d-help").hidden = (dim !== 3);
  useTorus(view, false, dim === 2);
}

// Why the growth has stopped by itself ("" if it hasn't): at "most"
// particles, or at the edge of the Penrose plane the page builds
// ("edge" says what reached it: "The cluster has", say).
function clusterStopped(message, most, edge) {
  if (message.atMax) return "The cluster has " + most.toLocaleString() + " particles, the most this page lets in.";
  if (message.atEdge) {
    return edge + " reached the edge of the part of this tiling the page builds (" + PENROSE_PLANE_MOST +
           " side lengths from the middle each way), so it stops here.";
  }
  return "";
}
