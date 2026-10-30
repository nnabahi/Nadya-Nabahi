/* =====================================================================
   sim-tile-shape.js  —  a typed tile shape T, turned into a polygon
   ---------------------------------------------------------------------
   The sims with continuous tiles (Sequential Continuous Tiling, the
   continuous DLA sims) take a tile T typed as a formula. This file
   reads it and turns it into a polygon the sims can measure exactly.

   READING THE FORMULA (in a second thread, with math.js loaded)
     readShape(text, values, name)   a typed shape as a test of points,
                                     (x, y) -> true or false. It can be
         a condition    x^2 + y^2 <= 1     the points where it holds,
         an equation    x^2 + y^2 = 1      the region its curve closes off,
         a curve        { x, y } in t      the inside of the curve traced
                                           as t runs from 0 to 2π.
       "values" holds the sliders' letters; "name" (like "T") is for
       the messages when it can't be read.

   THE POLYGON
     tilePolygon(inT)   T (a test of points, star-shaped around its
                        center (0, 0)) as a polygon with TILE_CORNERS
                        corners at equally spaced angles. Corner k sits
                        at angle θ_k = 2πk/M, at distance rho[k] from the
                        center: the farthest point of T in that
                        direction, found by binary search on the test.
                        Every step after that is exact for this polygon.
       It gives
         M, cosM, sinM          the number of corners, and their directions
         rho, px, py            each corner's distance, and its x and y
         rhoMax                 T fits in a disk of this radius
         minX, maxX, minY, maxY the smallest box around T
         area                   (the shoelace formula)
         symmetric, convex      (up to the binary search's rounding; a
                                symmetric T is then made exactly symmetric)
         round                  every corner equally far: T is a disk of
                                radius rhoMax
         gx, gy, gauge(vx, vy)  T's own ruler, its "gauge": the smallest
                                λ with v in λT. Between corners k and k+1
                                the edge is a straight line, and there
                                gauge(v) = gx[k] * v_x + gy[k] * v_y.
         runs, bigRuns          the edges in runs of RUN_EDGES, and those
                                in big runs of BIG_RUN runs, each with a
                                circle around it [x, y, radius], so a sim
                                can skip a whole run that is too far away
         mostRho(k0, k1)        the largest rho[k] for k from k0 to k1
   ===================================================================== */

const TILE_CORNERS = 4096;
const RUN_EDGES = 16, BIG_RUN = 16;


/* =====================================================================
   READING THE FORMULA
   ===================================================================== */

// A typed shape as a function of (x, y) that gives true or false. It
// comes in three kinds:
//   a condition, like x^2 + y^2 <= 1: the points where it holds;
//   an equation, like x^2 + y^2 = 1: the region its curve closes
//     off. "F = G" becomes F - G <= 0 or F - G >= 0, whichever side
//     far-off points (the corners of the square -2000 <= x, y <= 2000)
//     are NOT on;
//   a curve { x, y } in t, like (cos(t), sin(t)): the points inside it
//     (insideCurve).
// A point where the formula can't be worked out (say sqrt of a
// negative number) counts as outside.
function readShape(text, values, name) {
  if (typeof text === "object") return insideCurve(text, values, name);
  let node = math.parse(text);
  while (node.isParenthesisNode) node = node.content;
  const scope = Object.assign({}, values);
  if (node.isOperatorNode && node.fn === "equal") {
    const gap = new math.OperatorNode("-", "subtract", node.args).compile();
    const gapAt = function (x, y) {
      scope.x = x; scope.y = y;
      try { const v = gap.evaluate(scope); return typeof v === "number" ? v : NaN; } catch (error) { return NaN; }
    };
    let farSign = 0;
    for (const [x, y] of [[2000, 2000], [-2000, 2000], [-2000, -2000], [2000, -2000]]) farSign += Math.sign(gapAt(x, y)) || 0;
    if (farSign === 0) throw new Error(name + "'s curve doesn't close off a region (its inside and outside can't be told apart).");
    return function (x, y) { return gapAt(x, y) * farSign <= 0; };
  }
  const formula = node.compile();
  function test(x, y) {
    scope.x = x; scope.y = y;
    try { return formula.evaluate(scope) === true; } catch (error) { return false; }
  }
  scope.x = 0; scope.y = 0;
  const sample = formula.evaluate(scope);
  if (sample !== true && sample !== false) {
    throw new Error(name + " should be a condition like x^2 + y^2 <= 1, an equation like x^2 + y^2 = 1, " +
                    "or a curve like (cos(t), sin(t)).");
  }
  return test;
}

// The inside of a curve (x(t), y(t)), t from 0 to 2π. The curve
// becomes a polygon with 4096 corners, and a point is inside when a
// ray from it to the right crosses the polygon an odd number of times.
// To keep that quick, the polygon's edges are sorted into 256
// horizontal strips, and a point only looks at the edges of its strip.
function insideCurve(curve, values, name) {
  const fx = math.compile(curve.x), fy = math.compile(curve.y);
  const scope = Object.assign({}, values), CORNERS = 4096, STRIPS = 256, cx = [], cy = [];
  for (let k = 0; k < CORNERS; k++) {
    scope.t = 2 * Math.PI * k / CORNERS;
    let x = NaN, y = NaN;
    try { x = fx.evaluate(scope); y = fy.evaluate(scope); } catch (error) { /* skip this t */ }
    if (Number.isFinite(x) && Number.isFinite(y)) { cx.push(x); cy.push(y); }
  }
  if (cx.length < 3) throw new Error(name + "'s curve should give two numbers for each t, like (cos(t), sin(t)).");
  const low = Math.min(...cy), high = Math.max(...cy), height = (high - low) / STRIPS || 1;
  const stripOf = function (y) { return Math.min(STRIPS - 1, Math.floor((y - low) / height)); };
  const strips = Array.from({ length: STRIPS }, function () { return []; });
  for (let i = 0, j = cx.length - 1; i < cx.length; j = i++) {
    for (let s = stripOf(Math.min(cy[i], cy[j])); s <= stripOf(Math.max(cy[i], cy[j])); s++) strips[s].push(i, j);
  }
  return function (x, y) {
    if (!(y >= low && y <= high)) return false;
    const edges = strips[stripOf(y)];
    let inside = false;
    for (let e = 0; e < edges.length; e += 2) {
      const i = edges[e], j = edges[e + 1];
      if ((cy[i] > y) !== (cy[j] > y) && x < (cx[j] - cx[i]) * (y - cy[i]) / (cy[j] - cy[i]) + cx[i]) inside = !inside;
    }
    return inside;
  };
}


/* =====================================================================
   THE POLYGON
   ===================================================================== */

function tilePolygon(inT) {
  const TAU = 2 * Math.PI, M = TILE_CORNERS;
  if (!inT(0, 0)) throw new Error("T must contain its center (0, 0).");
  const cosM = new Float64Array(M), sinM = new Float64Array(M);   // the corner directions θ_k
  for (let k = 0; k < M; k++) { cosM[k] = Math.cos(TAU * k / M); sinM[k] = Math.sin(TAU * k / M); }
  const rho = new Float64Array(M);
  for (let k = 0; k < M; k++) rho[k] = reachOf(inT, cosM[k], sinM[k]);

  // Symmetric? (Same reach in opposite directions, up to the binary
  // search's rounding.) If so, make it exactly symmetric.
  const rhoMax = Math.max(...rho);
  if (rhoMax === 0) throw new Error("T has no area around its center.");
  let symmetric = true;
  for (let k = 0; k < M / 2; k++) {
    if (Math.abs(rho[k] - rho[k + M / 2]) > 1e-7 * rhoMax) { symmetric = false; break; }
  }
  if (symmetric) {
    for (let k = 0; k < M / 2; k++) rho[k] = rho[k + M / 2] = (rho[k] + rho[k + M / 2]) / 2;
  }
  const round = Math.min(...rho) > rhoMax * (1 - 1e-9);

  // The corners, the smallest box around them, and T's area (shoelace formula).
  const px = new Float64Array(M), py = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    px[k] = rho[k] * cosM[k];
    py[k] = rho[k] * sinM[k];
  }
  let area = 0;
  for (let k = 0; k < M; k++) {
    const j = (k + 1) % M;
    area += (px[k] * py[j] - px[j] * py[k]) / 2;
  }

  // The ruler on each edge: the line through corners k and k+1 is
  // { v : cross(v, d) = cross(P_k, d) } with d = P_{k+1} - P_k, and
  // g(v) is the λ that puts v/λ on that line.
  const gx = new Float64Array(M), gy = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const j = (k + 1) % M;
    const dx = px[j] - px[k], dy = py[j] - py[k];
    const den = px[k] * dy - py[k] * dx;
    gx[k] = dy / den;
    gy[k] = -dx / den;
  }

  // Convex? (Every corner turns the same way, up to rounding.)
  let convex = true;
  for (let k = 0; k < M; k++) {
    const a = (k + 1) % M, b = (k + 2) % M;
    const turn = (px[a] - px[k]) * (py[b] - py[a]) - (py[a] - py[k]) * (px[b] - px[a]);
    if (turn < -1e-9 * rhoMax * rhoMax) { convex = false; break; }
  }

  // The runs of edges, each with a circle around it (center and
  // radius, in T's own units).
  function circleAround(firstCorner, lastCorner) {
    let sx = 0, sy = 0;
    for (let k = firstCorner; k <= lastCorner; k++) { sx += px[k % M]; sy += py[k % M]; }
    sx /= lastCorner - firstCorner + 1; sy /= lastCorner - firstCorner + 1;
    let radius = 0;
    for (let k = firstCorner; k <= lastCorner; k++) radius = Math.max(radius, Math.hypot(px[k % M] - sx, py[k % M] - sy));
    return [sx, sy, radius];
  }
  const runs = [], bigRuns = [];
  for (let k = 0; k < M; k += RUN_EDGES) runs.push(circleAround(k, k + RUN_EDGES));
  for (let k = 0; k < M; k += RUN_EDGES * BIG_RUN) bigRuns.push(circleAround(k, k + RUN_EDGES * BIG_RUN));

  // The sparse table for mostRho: most[level][k] holds the largest of
  // rho[k .. k + 2^level - 1].
  const most = [rho];
  for (let level = 1; (1 << level) <= M; level++) {
    const prev = most[level - 1], next = new Float64Array(M), half = 1 << (level - 1);
    for (let k = 0; k < M; k++) next[k] = Math.max(prev[k], prev[(k + half) % M]);
    most.push(next);
  }

  // T's ruler: g(v) = the smallest λ with v in λT.
  function gauge(vx, vy) {
    let angle = Math.atan2(vy, vx);
    if (angle < 0) angle += TAU;
    let k = Math.floor(angle * M / TAU);
    if (k >= M) k = M - 1;
    return gx[k] * vx + gy[k] * vy;
  }

  // The largest rho[k] for k from k0 to k1 (going around past M is
  // fine): any range is covered by two overlapping blocks of the sparse
  // table (Bender & Farach-Colton, LATIN 2000).
  function mostRho(k0, k1) {
    const length = k1 - k0 + 1;
    if (length >= M) return rhoMax;
    const start = ((k0 % M) + M) % M;
    const level = Math.floor(Math.log2(length));
    return Math.max(most[level][start], most[level][(start + length - (1 << level)) % M]);
  }

  return {
    M: M, cosM: cosM, sinM: sinM, rho: rho, px: px, py: py, rhoMax: rhoMax,
    minX: Math.min(...px), maxX: Math.max(...px), minY: Math.min(...py), maxY: Math.max(...py),
    area: area, symmetric: symmetric, convex: convex, round: round,
    gx: gx, gy: gy, gauge: gauge, runs: runs, bigRuns: bigRuns, mostRho: mostRho,
  };
}

// How far T reaches in the direction (ux, uy): step out, doubling,
// until we leave T, then binary search between the last point inside
// and the first point outside.
function reachOf(inT, ux, uy) {
  let lo = 0, hi = 1e-6;
  while (inT(hi * ux, hi * uy) && hi < 1e6) { lo = hi; hi *= 2; }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (inT(mid * ux, mid * uy)) lo = mid; else hi = mid;
  }
  return lo;
}


/* =====================================================================
   FOR A SECOND THREAD: everything above, to hand to runInWorker
   (js/sim-page.js) as helpers.
   ===================================================================== */
function tileShapeHelpers() {
  return [readShape, insideCurve, tilePolygon, reachOf, { TILE_CORNERS: TILE_CORNERS, RUN_EDGES: RUN_EDGES, BIG_RUN: BIG_RUN }];
}
