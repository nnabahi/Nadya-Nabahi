/* =====================================================================
   sim-cluster-page.js  —  what the pages of the sims that grow a
                           cluster share (the DLA sims)
   ---------------------------------------------------------------------
   Their growth runs in a second thread (serveGrowth, js/sim-cluster.js)
   and sends the cluster's pieces a few at a time.

   CELLS. The discrete DLA sims keep the cells and draw them the same
   way:
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
                                (the continuous DLA pages use it too)
   These need js/sim-page.js, js/sim-view.js, js/sim-sites.js,
   js/sim-controls.js, js/sim-penrose.js and js/sim-honeycombs.js.

   THE FRACTAL DIMENSION. The external DLA sims (discrete and
   continuous) show the same numbers and charts:
     showExternalStats(message)  the numbers both show, and the charts
     dimensionFit(message)       the slope b of log(radius of gyration)
                                against log(n), fitted: the cluster's
                                dimension is about 1/b
   These need js/sim-page.js and js/sim-charts.js.
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


/* =====================================================================
   THE FRACTAL DIMENSION (the external DLA sims)
   ---------------------------------------------------------------------
   The worker keeps the numbers up to date, and a sample of them every
   so often for the charts (serveGrowth, js/sim-cluster.js). The
   fractal dimension is fitted to those samples: if the radius of
   gyration grows like n^b, the cluster's n pieces fill a ball of that
   radius the way a set of dimension 1/b would.
   ===================================================================== */

// The fractal dimension is fitted over the last FIT_SPAN-fold of the
// run (from n / FIT_SPAN to n particles), once there are FIT_FROM
// particles.
const FIT_SPAN = 10;
const FIT_FROM = 100;
const GYRATION_LINE = "#b9c8dc";  // the radius of gyration on the charts (the farthest piece is CHART_LINE)

// The numbers both external DLA pages show, in the boxes with these
// ids: n, the radius (the farthest piece), the radius of gyration, the
// fitted dimension, the launch circle's radius, jumps and particles
// brought back. Then the charts.
function showExternalStats(s) {
  const fit = dimensionFit(s);
  byId("stat-particles").textContent = s.particles.toLocaleString();
  byId("stat-radius").textContent = niceNumber(s.radius);
  byId("stat-gyration").textContent = niceNumber(s.gyration);
  byId("stat-dimension").textContent = fit ? niceNumber(1 / fit.slope) : "(from " + FIT_FROM + " particles)";
  byId("stat-launch").textContent = niceNumber(s.launchRadius);
  byId("stat-jumps").textContent = s.jumps.toLocaleString();
  byId("stat-returns").textContent = s.returns.toLocaleString();
  drawRadiusCharts(s, fit);
}

// The straight line through log(radius of gyration) against log(n), by
// least squares, over the samples from n / FIT_SPAN to n: { slope }, or
// null before FIT_FROM particles.
function dimensionFit(s) {
  const times = s.traceParticles, radii = s.traceLists.gyration, n = s.particles;
  if (n < FIT_FROM) return null;
  const xs = [], ys = [];
  times.forEach(function (t, i) {
    if (t >= n / FIT_SPAN && radii[i] > 0) { xs.push(Math.log(t)); ys.push(Math.log(radii[i])); }
  });
  if (xs.length < 3) return null;
  const mx = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  const my = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach(function (x, i) { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
  return sxx > 0 ? { slope: sxy / sxx } : null;
}

// The charts (canvases id="radius-chart" and id="dimension-chart"): the
// farthest piece and the radius of gyration over time, and the radius
// of gyration against n on a log-log chart, with the fitted slope
// ("fit", from dimensionFit) as a dashed line.
function drawRadiusCharts(s, fit) {
  const times = s.traceParticles, lists = s.traceLists;
  plotOverTime(byId("radius-chart"), times,
               [{ values: lists.gyration, color: GYRATION_LINE }, { values: lists.radius, color: CHART_LINE }], "particles");
  logLogChart(byId("dimension-chart"), [{ points: pointsOverTime(times, lists.gyration) }],
              "particles", "radius of gyration (log-log)", fit ? fit.slope : null);
}
