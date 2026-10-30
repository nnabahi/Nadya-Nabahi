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
                                (showFlatOr3D: the switch itself, which
                                the continuous DLA pages use too)
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
     drawRadiusChart(message)   the farthest piece and the radius of
                                gyration over time (the internal DLA
                                sims draw it too)
   These need js/sim-page.js and js/sim-charts.js.

   TILES. The continuous DLA sims read their tile, and draw the tiles
   and the latest particle's walk, the same way:
     newTileBox(presets, changed)   the Tile box: the Start from menu,
                                the formula and its sliders
     epsilonInBox()             the stop, from the box id="set-epsilon"
     arrivalGroup(i, n), arrivalColor(i, n, asText)   tile i's color by
                                when it joined
     newWalkShow()              the latest particle's walk, shown as it
                                happens
     drawTilesFlat(plane, pen, tiles, outline, n)   the tiles in 2D
     drawWalkFlat(plane, pen, path, share)   the walk in 2D
     walkIn3D(cells, path, share, reach, rhoMax)   the walk in 3D
   These need js/sim-page.js, js/sim-view.js, js/sim-colors.js,
   js/formulas.js and js/sim-continuum.js.
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
// line (id view3d-help), and the flat picture's zoom buttons only with
// it. A lattice cluster's picture moves and zooms only in 2D.
function showFlatOr3D(view, three, dim) {
  view.canvas.hidden = (dim === 3);
  three.show(dim === 3);
  byId("view3d-help").hidden = (dim !== 3);
  showZoomButtons(view);
}
function showClusterPicture(view, three, dim) {
  showFlatOr3D(view, three, dim);
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
  drawRadiusChart(s);
  logLogChart(byId("dimension-chart"), [{ points: pointsOverTime(s.traceParticles, s.traceLists.gyration) }],
              "particles", "radius of gyration (log-log)", fit ? fit.slope : null);
}
function drawRadiusChart(s) {
  const lists = s.traceLists;
  plotOverTime(byId("radius-chart"), s.traceParticles,
               [{ values: lists.gyration, color: GYRATION_LINE }, { values: lists.radius, color: CHART_LINE }], "particles");
}


/* =====================================================================
   TILES (the continuous DLA sims)
   ===================================================================== */

// A tile less than this many screen pixels across is drawn as a small
// square of the same area (much quicker, and it looks the same).
const SMALL_TILE = 3;

// The tiles' colors, by when each joined: this many steps from blue
// (first) to red (just now).
const ARRIVAL_STEPS = 64;

// The latest particle's walk: the circles it jumped across, its path
// from jump to jump, and where it is now, while it walks (2D: a dot this
// many screen pixels across; 3D: a ball this share of the picture's
// reach across, but never smaller than a tile), as text or [r, g, b].
const JUMP_CIRCLE = "rgba(30, 30, 30, 0.25)";
const WALK_LINE = "rgba(30, 30, 30, 0.7)";
const WALKER = "#1e1e1e";
const WALKER_RADIUS = 3;
const WALKER_SHARE_3D = 1 / 60;
const WALKER_RGB = [30, 30, 30];
const PATH_RGB = [90, 90, 90];

// While playing, each particle's walk is shown over the time until the
// next one comes (at most MOST_WALK_SECONDS); after One particle, over
// STEP_WALK_SECONDS.
const MOST_WALK_SECONDS = 2;
const STEP_WALK_SECONDS = 1.5;

// The epsilon box goes from LEAST_EPSILON to MOST_EPSILON tile radii
// (its first value is DEFAULT_EPSILON, js/sim-continuum.js).
const LEAST_EPSILON = 1e-12;
const MOST_EPSILON = 0.5;

// The Tile box (ids preset, formula-T, preview-T, sliders): the Start
// from menu with this dimension's presets, then "your own formula"; and
// the formula, read as on Sequential Continuous Tiling's page
// (readFormulaBoxes, js/formulas.js): a condition like x^2 + y^2 <= 1,
// an equation like x^2 + y^2 = 1 (the region its curve closes off), or
// in 2D a curve (x(t), y(t)), t from 0 to 2π. In 3D it is in x, y and
// z. Any other letter gets a slider. A formula that can't be read yet
// (usually it is half typed) changes nothing.
//   presets[dim]   that dimension's presets, the first the default:
//                  key -> { label, T (the formula), sliders (optional:
//                  letter -> { value, min, max, step }) }
//   changed()      called when the tile changes
// It returns { formula, values(), use(dim) }: the formula as the growth
// reads it, the sliders' numbers, and use(dim), which switches to that
// dimension's tile (the one last used in it; at first its first preset).
function newTileBox(presets, changed) {
  const box = { dim: 2, formula: null, sliders: {}, values: values, use: use };
  const kept = { 2: null, 3: null };    // each dimension's preset and formula, last used

  function values() { return sliderValues(box.sliders); }

  function read() {
    const dim = box.dim;
    const got = readFormulaBoxes(["T"], dim === 3 ? [] : ["T"], box.sliders, byId("sliders"), changed,
                                 dim === 3 ? ["x", "y", "z"] : ["x", "y"]);
    if (!got) return;
    box.formula = got.T;
    kept[dim] = { preset: byId("preset").value, text: byId("formula-T").value };
    changed();
  }

  // A preset's formula and sliders.
  function usePreset(key) {
    const p = presets[box.dim][key];
    byId("preset").value = key;
    byId("formula-T").value = p.T;
    for (const letter in p.sliders || {}) box.sliders[letter] = Object.assign({}, p.sliders[letter]);
    read();
  }

  function use(dim) {
    box.dim = dim;
    const menu = byId("preset");
    menu.innerHTML = "";
    for (const key in presets[dim]) menu.add(new Option(presets[dim][key].label, key));
    menu.add(new Option("Your own formula", "custom"));
    const last = kept[dim];
    if (!last) { usePreset(Object.keys(presets[dim])[0]); return; }
    menu.value = last.preset;
    byId("formula-T").value = last.text;
    read();
  }

  byId("preset").addEventListener("change", function () {
    if (byId("preset").value !== "custom") usePreset(byId("preset").value);
  });
  byId("formula-T").addEventListener("input", function () {
    byId("preset").value = "custom";
    read();
  });
  return box;
}

// The epsilon in its box, from LEAST_EPSILON to MOST_EPSILON tile radii.
function epsilonInBox() {
  const box = byId("set-epsilon");
  let v = Number(box.value);
  if (!isFinite(v) || box.value === "" || v <= 0) v = DEFAULT_EPSILON;
  v = Math.min(Math.max(v, LEAST_EPSILON), MOST_EPSILON);
  box.value = v;
  return v;
}

// Tile i's color among n tiles: its group, by when it joined, and that
// group's color (heatColor, js/sim-colors.js) as [r, g, b] for the 3D
// picture, or with asText, as text for the 2D one. The colors are
// worked out once.
const arrivalColors = { rgb: [], text: [] };
function arrivalGroup(i, n) { return Math.min(ARRIVAL_STEPS - 1, Math.floor(ARRIVAL_STEPS * i / n)); }
function arrivalColor(i, n, asText) {
  if (arrivalColors.rgb.length === 0) {
    for (let k = 0; k < ARRIVAL_STEPS; k++) {
      arrivalColors.rgb.push(heatColor(k / (ARRIVAL_STEPS - 1)));
      arrivalColors.text.push(rgbToHex(arrivalColors.rgb[k]));
    }
  }
  return (asText ? arrivalColors.text : arrivalColors.rgb)[arrivalGroup(i, n)];
}

// The latest particle's walk, shown as it happens: its places and the
// circles it jumped across (the growth's "path"), the tile it ends as
// (hidden until it lands), when the walk started on the screen
// (performance.now(), in milliseconds) and how long it takes to show.
//   walk.follow(message, player)   take the walk from a growth's message
//                   when the run went on (shown as it happens), or
//                   started afresh (shown done); "player" is the page's
//                   Play button (connectPlay, js/sim-page.js)
//   walk.share()    how far the walk has got: from 0 (just started) to
//                   1 (landed)
function newWalkShow() {
  const walk = { path: [], tile: -1, start: 0, seconds: 0, follow: follow, share: share };
  function follow(message, player) {
    if (message.sitesFrom !== 0 && message.x.length === 0) return;
    walk.path = message.path;
    walk.tile = message.particles - 1;
    walk.start = performance.now();
    walk.seconds = message.sitesFrom === 0 ? 0
      : player.playing ? Math.min(1 / player.speed(), MOST_WALK_SECONDS) : STEP_WALK_SECONDS;
  }
  function share() {
    return walk.seconds > 0 ? Math.min(1, (performance.now() - walk.start) / (1000 * walk.seconds)) : 1;
  }
  return walk;
}

// 2D: tiles 0 to n - 1, centered at tiles.x[i], tiles.y[i], each the
// tile's outline (tileOutline, js/sim-tile-shape.js), one color at a
// time (each color is one run of tiles, since they are colored in the
// order they joined).
function drawTilesFlat(plane, pen, tiles, outline, n) {
  const ux = plane.ux, uy = plane.uy, reach = outline.rhoMax * Math.max(ux, uy);   // in screen pixels
  const small = 2 * reach < SMALL_TILE, side = Math.max(1, Math.sqrt(outline.area * ux * uy));
  // On a small tile, fewer corners are enough (about one per pixel of its edge).
  const skip = Math.max(1, Math.floor(outline.x.length / Math.max(8, 2 * Math.PI * reach)));
  let group = -1;
  for (let i = 0; i < n; i++) {
    const g = arrivalGroup(i, n);
    if (g !== group) {
      if (group >= 0) pen.fill();
      group = g;
      pen.fillStyle = arrivalColor(i, n, true);
      pen.beginPath();
    }
    const x = pixelX(plane, tiles.x[i]), y = pixelY(plane, tiles.y[i]);
    if (x + reach < 0 || x - reach > plane.width || y + reach < 0 || y - reach > plane.height) continue;   // off the picture
    if (small) pen.rect(x - side / 2, y - side / 2, side, side);
    else if (outline.round) { pen.moveTo(x + reach, y); pen.arc(x, y, reach, 0, 2 * Math.PI); }
    else {
      pen.moveTo(x + outline.x[0] * ux, y - outline.y[0] * uy);
      for (let k = skip; k < outline.x.length; k += skip) pen.lineTo(x + outline.x[k] * ux, y - outline.y[k] * uy);
      pen.closePath();
    }
  }
  if (group >= 0) pen.fill();
}

// 2D: the latest particle's walk, as far as "share" of it: the circles it
// jumped across, its path (a return to the launch circle, r = -1, is
// not joined up), and while it walks, where it is now.
function drawWalkFlat(plane, pen, path, share) {
  if (path.length === 0) return;
  const shown = Math.max(1, Math.ceil(share * path.length));
  const sx = function (k) { return pixelX(plane, path[k][0]); }, sy = function (k) { return pixelY(plane, path[k][1]); };
  pen.lineWidth = 1;

  pen.strokeStyle = JUMP_CIRCLE;
  pen.beginPath();
  for (let k = 0; k < shown; k++) {
    const r = path[k][2] * plane.ux;
    if (r < 0.5) continue;      // (the last few are smaller than a pixel)
    pen.moveTo(sx(k) + r, sy(k));
    pen.arc(sx(k), sy(k), r, 0, 2 * Math.PI);
  }
  pen.stroke();

  pen.strokeStyle = WALK_LINE;
  pen.beginPath();
  for (let k = 0; k < shown; k++) {
    if (k === 0 || path[k - 1][2] < 0) pen.moveTo(sx(k), sy(k)); else pen.lineTo(sx(k), sy(k));
  }
  pen.stroke();

  if (share < 1) {
    pen.fillStyle = WALKER;
    pen.beginPath();
    pen.arc(sx(shown - 1), sy(shown - 1), WALKER_RADIUS, 0, 2 * Math.PI);
    pen.fill();
  }
}

// 3D: the latest particle's walk, as far as "share" of it, added to
// drawCells's cells (js/sim-3d.js): its path so far, and while it walks,
// where it is (a dark ball) and the see-through sphere it is jumping
// across now. "reach" is how far the picture reaches, and rhoMax the
// tile's radius. A return to the launch sphere (r = -1) is not joined up.
function walkIn3D(cells, path, share, reach, rhoMax) {
  if (path.length === 0) return;
  const shown = Math.max(1, Math.ceil(share * path.length)), lines = [];
  for (let k = 1; k < shown; k++) if (path[k - 1][3] >= 0) lines.push(...path[k - 1].slice(0, 3), ...path[k].slice(0, 3));
  cells.lines = lines;
  cells.lineColor = PATH_RGB;
  if (share < 1) {
    const here = path[shown - 1];
    cells.at = here.slice(0, 3);
    cells.atColor = WALKER_RGB;
    cells.atSize = Math.max(2 * rhoMax, 2 * reach * WALKER_SHARE_3D);
    if (here[3] > 0) cells.sphere = here;
  }
}
