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
     tileOutline(shape)  DRAWN_CORNERS of its corners, for a page to draw

   THE GAP BETWEEN TWO COPIES OF THE TILE (the continuous DLA sims)
     copyGap(shape)     for copies of T moved without turning: gap(dx,
                        dy, best), how far T and T + (dx, dy) are apart,
                        and slide, the move that makes them touch (see
                        that section)
   ===================================================================== */

const TILE_CORNERS = 4096;
const DRAWN_CORNERS = 128;
const RUN_EDGES = 16, BIG_RUN = 16;
// A corner of the difference polygon turning by less than this angle
// (in radians) counts as going straight on (differencePolygon).
const STRAIGHT_ON = 1e-12;
// The edge-by-edge gap's tree stops splitting at this many edges.
const LEAF_EDGES = 8;


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

// The tile for drawing: DRAWN_CORNERS of its corners (x and y), whether
// it is a disk (round: a page can draw a true circle instead), how far
// it reaches, and its area.
function tileOutline(shape) {
  const x = [], y = [];
  for (let k = 0; k < shape.M; k += shape.M / DRAWN_CORNERS) { x.push(shape.px[k]); y.push(shape.py[k]); }
  return { x: x, y: y, round: shape.round, rhoMax: shape.rhoMax, area: shape.area };
}


/* =====================================================================
   THE GAP BETWEEN TWO COPIES OF THE TILE
   ---------------------------------------------------------------------
   Two copies of T, moved without turning, T + q and T + b, touch or
   overlap exactly when b - q is in the difference set
   D = T - T = { s - t : s and t in T }, and the gap between them (the
   shortest distance from a point of one to a point of the other) is
   the distance from b - q to D. (If s - t is the point of D nearest
   b - q, then s + q and t + b are the nearest points of the copies.)
   copyGap(shape) returns { gap, slide }:
     gap(dx, dy, best, exactBelow)   the gap between T and T + (dx, dy),
                         when it is below best (otherwise some number at
                         least best); 0 if they overlap. With exactBelow,
                         a gap at least that big may come back as a lower
                         bound, at least half of it (only the edge-by-edge
                         way uses this)
     slide               after gap gave a number below best, the move
                         [sx, sy] of T + (dx, dy) that makes the two
                         copies just touch (its length is the gap)
   It works the gap out in one of three ways, the fastest that fits:
     ROUND (a disk of radius ρ): D is the disk of radius 2ρ.
     CONVEX: D is the convex polygon T + (-T), made once by merging the
       two polygons' edges in order of direction (the Minkowski sum of
       convex polygons: M. de Berg, O. Cheong, M. van Kreveld and M.
       Overmars, "Computational Geometry", 3rd ed., Springer 2008,
       Section 13.3). For a point p outside it, look at
       f(k) = n_k . p - h_k for each edge k, with n_k the edge's outer
       normal and h_k how far its line is from 0: how far p is beyond
       the edge's line. The largest f is at the edge nearest p, and f
       has no other peak where it is positive (written as a function of
       the normal's angle, f'' + f = -(h'' + h), which is never positive
       for a convex set, so f can't have a dip where f > 0), so a search
       that halves its step finds it from the edge the ray from 0 to p
       crosses, where f > 0. The nearest point is on that edge or one
       next to it.
     ANY OTHER T: edge by edge, with the edges grouped in a tree of
       nested circles, so pairs of parts that are too far apart are
       skipped whole (a "bounding volume hierarchy": C. Ericson,
       "Real-Time Collision Detection", Morgan Kaufmann 2005, Chapter 6).
   ===================================================================== */
function copyGap(shape) {
  if (shape.round) return roundGap(shape.rhoMax);
  return shape.convex ? convexGap(differencePolygon(shape)) : edgeByEdgeGap(shape);
}

// ROUND: the gap between disks of radius ρ, centers |(dx, dy)| apart.
function roundGap(radius) {
  const g = { gap: gap, slide: [0, 0] };
  function gap(dx, dy, best) {
    const apart = Math.hypot(dx, dy), d = Math.max(0, apart - 2 * radius);
    if (d < best) { g.slide[0] = d > 0 ? -dx / apart * d : 0; g.slide[1] = d > 0 ? -dy / apart * d : 0; }
    return d;
  }
  return g;
}

// CONVEX: the difference polygon T + (-T), its corners counterclockwise
// starting from the one at the smallest angle (from -π). For a
// symmetric T it is simply 2T.
function differencePolygon(shape) {
  const M = shape.M, px = shape.px, py = shape.py;
  let x = [], y = [];
  if (shape.symmetric) {
    for (let k = 0; k < M; k++) { x.push(2 * px[k]); y.push(2 * py[k]); }
  } else {
    // Both polygons from their lowest corner (then leftmost), edge by
    // edge, always taking the edge that turns least next.
    const lowest = function (sign) {
      let best = 0;
      for (let k = 1; k < M; k++) {
        if (sign * py[k] < sign * py[best] || (sign * py[k] === sign * py[best] && sign * px[k] < sign * px[best])) best = k;
      }
      return best;
    };
    const p0 = lowest(1), q0 = lowest(-1);    // (the lowest corner of -T is minus the highest of T)
    const P = function (i) { const k = (p0 + i) % M; return [px[k], py[k]]; };
    const Q = function (j) { const k = (q0 + j) % M; return [-px[k], -py[k]]; };
    let i = 0, j = 0;
    while (i < M || j < M) {
      const a = P(i), b = Q(j), a2 = P(i + 1), b2 = Q(j + 1);
      x.push(a[0] + b[0]); y.push(a[1] + b[1]);
      const cross = (a2[0] - a[0]) * (b2[1] - b[1]) - (a2[1] - a[1]) * (b2[0] - b[0]);
      if (cross >= 0 && i < M) i++;
      if (cross <= 0 && j < M) j++;
    }
  }
  // Corners where the polygon goes straight on (the many corners along
  // a square's side, say) are dropped: there the edges all have the same
  // normal, so the search in convexGap couldn't tell them apart.
  const kept = [];
  for (let k = 0; k < x.length; k++) {
    const a = kept.length > 0 ? kept[kept.length - 1] : x.length - 1, b = (k + 1) % x.length;
    const ux = x[k] - x[a], uy = y[k] - y[a], wx = x[b] - x[k], wy = y[b] - y[k];
    const turn = ux * wy - uy * wx, lengths = Math.hypot(ux, uy) * Math.hypot(wx, wy);
    if (lengths > 0 && Math.abs(turn) > STRAIGHT_ON * lengths) kept.push(k);
  }
  x = kept.map(function (k) { return x[k]; });
  y = kept.map(function (k) { return y[k]; });
  // Start from the corner at the smallest angle, so the angles go up.
  const angles = x.map(function (u, k) { return Math.atan2(y[k], u); });
  let first = 0;
  for (let k = 1; k < angles.length; k++) if (angles[k] < angles[first]) first = k;
  const order = angles.map(function (_, k) { return (first + k) % angles.length; });
  return {
    x: Float64Array.from(order, function (k) { return x[k]; }),
    y: Float64Array.from(order, function (k) { return y[k]; }),
    angle: Float64Array.from(order, function (k) { return angles[k]; }),
  };
}

// CONVEX: the gap from the difference polygon D (differencePolygon).
function convexGap(D) {
  const N = D.x.length, g = { gap: gap, slide: [0, 0] };
  // Each edge k (corner k to corner k+1): its outer normal and how far
  // its line is from 0.
  const nx = new Float64Array(N), ny = new Float64Array(N), h = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const j = (k + 1) % N, ex = D.x[j] - D.x[k], ey = D.y[j] - D.y[k], length = Math.hypot(ex, ey) || 1;
    nx[k] = ey / length; ny[k] = -ex / length;
    h[k] = nx[k] * D.x[k] + ny[k] * D.y[k];
  }
  let step = 1;
  while (4 * step <= N) step *= 2;
  const firstStep = step;

  function gap(dx, dy, best) {
    const f = function (k) { k = ((k % N) + N) % N; return nx[k] * dx + ny[k] * dy - h[k]; };
    // The edge the ray from 0 to (dx, dy) crosses: the last corner at a
    // smaller angle (a binary search; before the first, the edge round
    // from the last corner).
    const angle = Math.atan2(dy, dx);
    let low = 0, high = N - 1;
    if (angle < D.angle[0]) low = N - 1;
    else {
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (D.angle[mid] <= angle) low = mid; else high = mid - 1;
      }
    }
    if (f(low) <= 0) { g.slide[0] = g.slide[1] = 0; return 0; }   // inside D: the copies overlap
    // The peak of f, by steps that halve.
    let k = low, value = f(k);
    for (let s = firstStep; s >= 1;) {
      if (f(k + s) > value) { k += s; value = f(k); }
      else if (f(k - s) > value) { k -= s; value = f(k); }
      else s >>= 1;
    }
    // The nearest point of D: on edge k or one next to it.
    let d = Infinity, cx = 0, cy = 0;
    for (let e = k - 1; e <= k + 1; e++) {
      const a = ((e % N) + N) % N, b = (a + 1) % N;
      const near = nearestOnSegment(dx, dy, D.x[a], D.y[a], D.x[b], D.y[b]);
      const far = Math.hypot(near[0] - dx, near[1] - dy);
      if (far < d) { d = far; cx = near[0]; cy = near[1]; }
    }
    if (d < best) { g.slide[0] = cx - dx; g.slide[1] = cy - dy; }
    return d;
  }
  return g;
}

// The point of the segment from a to b nearest (x, y).
function nearestOnSegment(x, y, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
  return [ax + t * ex, ay + t * ey];
}

// ANY OTHER T: edge by edge, between T and T + (dx, dy). The edges are
// grouped in a tree (edgeTree): the whole polygon, its two halves, their
// halves, and so on down to LEAF_EDGES edges, each part in a circle. A
// pair of parts, one of each copy, is at least as far apart as its
// circles, so pairs are looked at closest circles first (a heap), and a
// pair whose circles are farther apart than the best gap so far is
// never split. "exactBelow" (optional): when the gap is at least that,
// the search may stop as soon as everything left is at least half the
// best found, and give that lower bound instead (enough for a jump of
// the walk on spheres, and much quicker far from contact).
function edgeByEdgeGap(shape) {
  const M = shape.M, px = shape.px, py = shape.py, tree = edgeTree(px, py, M);
  const g = { gap: gap, slide: [0, 0] };
  const heap = { bound: [], a: [], b: [], size: 0 };

  function push(bound, a, b) {
    let i = heap.size++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heap.bound[up] <= bound) break;
      heap.bound[i] = heap.bound[up]; heap.a[i] = heap.a[up]; heap.b[i] = heap.b[up];
      i = up;
    }
    heap.bound[i] = bound; heap.a[i] = a; heap.b[i] = b;
  }
  function pop() {
    const last = --heap.size, bound = heap.bound[last], a = heap.a[last], b = heap.b[last];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= last) break;
      if (child + 1 < last && heap.bound[child + 1] < heap.bound[child]) child++;
      if (heap.bound[child] >= bound) break;
      heap.bound[i] = heap.bound[child]; heap.a[i] = heap.a[child]; heap.b[i] = heap.b[child];
      i = child;
    }
    heap.bound[i] = bound; heap.a[i] = a; heap.b[i] = b;
  }
  // How far apart the circles of part a (of T) and part b (of T + (dx, dy)) are.
  function apart(a, b, dx, dy) {
    return Math.hypot(tree.x[a] - tree.x[b] - dx, tree.y[a] - tree.y[b] - dy) - tree.r[a] - tree.r[b];
  }

  function gap(dx, dy, best, exactBelow) {
    let d = best, found = false, sx = 0, sy = 0;
    const roughFrom = exactBelow === undefined ? Infinity : exactBelow;
    heap.size = 0;
    push(apart(0, 0, dx, dy), 0, 0);
    while (heap.size > 0) {
      const bound = heap.bound[0], a = heap.a[0], b = heap.b[0];
      if (bound >= d) break;
      if (d >= roughFrom && bound >= d / 2) { d = bound; found = false; break; }   // (a lower bound is enough)
      pop();
      const leafA = tree.left[a] < 0, leafB = tree.left[b] < 0;
      if (leafA && leafB) {
        // Every edge of part a against every edge of part b.
        for (let k = tree.lo[a]; k < tree.hi[a]; k++) {
          const k2 = (k + 1) % M;
          for (let m = tree.lo[b]; m < tree.hi[b]; m++) {
            const m2 = (m + 1) % M;
            const pair = segmentsApart(px[k], py[k], px[k2], py[k2], px[m] + dx, py[m] + dy, px[m2] + dx, py[m2] + dy);
            if (pair[0] < d) { d = pair[0]; found = true; sx = pair[1]; sy = pair[2]; }
          }
        }
        continue;
      }
      // Split the bigger part (or the one that isn't a leaf).
      if (leafB || (!leafA && tree.r[a] >= tree.r[b])) {
        for (const child of [tree.left[a], tree.right[a]]) { const c = apart(child, b, dx, dy); if (c < d) push(c, child, b); }
      } else {
        for (const child of [tree.left[b], tree.right[b]]) { const c = apart(a, child, dx, dy); if (c < d) push(c, a, child); }
      }
    }
    d = Math.max(d, 0);
    if (found) { g.slide[0] = sx; g.slide[1] = sy; }
    return d;
  }
  return g;
}

// The polygon's edges in a tree of parts: part 0 is all M edges, and
// each part of more than LEAF_EDGES edges has two halves, its left and
// right parts. Each part has its edges lo .. hi - 1 (edge k runs from
// corner k to corner k + 1) and a circle (x, y, r) holding them.
function edgeTree(px, py, M) {
  const tree = { lo: [], hi: [], x: [], y: [], r: [], left: [], right: [] };
  function part(lo, hi) {
    const i = tree.lo.length;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let k = lo; k <= hi; k++) {
      const x = px[k % M], y = py[k % M];
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    }
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    let r = 0;
    for (let k = lo; k <= hi; k++) r = Math.max(r, Math.hypot(px[k % M] - cx, py[k % M] - cy));
    tree.lo.push(lo); tree.hi.push(hi); tree.x.push(cx); tree.y.push(cy); tree.r.push(r);
    tree.left.push(-1); tree.right.push(-1);
    if (hi - lo > LEAF_EDGES) {
      const mid = (lo + hi) >> 1;
      tree.left[i] = part(lo, mid);
      tree.right[i] = part(mid, hi);
    }
    return i;
  }
  part(0, M);
  return tree;
}

// How far apart the segments a-b and c-d are, with the move of c-d that
// closes the gap: [distance, move x, move y] (distance 0 if they cross).
// It is called very often, so it makes no new arrays: the answer is
// always the same array, APART, filled in afresh.
const APART = [0, 0, 0];
function segmentsApart(ax, ay, bx, by, cx, cy, dx, dy) {
  const s1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), s2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const s3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), s4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  if (s1 * s2 < 0 && s3 * s4 < 0) { APART[0] = APART[1] = APART[2] = 0; return APART; }
  APART[0] = Infinity;
  endToSegment(cx, cy, ax, ay, bx, by, 1);    // an end of c-d to a-b: c-d moves from the end to its nearest point
  endToSegment(dx, dy, ax, ay, bx, by, 1);
  endToSegment(ax, ay, cx, cy, dx, dy, -1);   // an end of a-b to c-d: c-d moves from the nearest point to the end
  endToSegment(bx, by, cx, cy, dx, dy, -1);
  return APART;
}

// For segmentsApart: the point (x, y) to its nearest point on the segment
// from a to b, kept in APART if it is the closest yet (the move times
// "sign").
function endToSegment(x, y, ax, ay, bx, by, sign) {
  const ex = bx - ax, ey = by - ay;
  let t = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nx = ax + t * ex - x, ny = ay + t * ey - y, far = Math.sqrt(nx * nx + ny * ny);
  if (far < APART[0]) { APART[0] = far; APART[1] = sign * nx; APART[2] = sign * ny; }
}


/* =====================================================================
   FOR A SECOND THREAD: everything above, to hand to runInWorker
   (js/sim-page.js) as helpers.
   ===================================================================== */
function tileShapeHelpers() {
  return [readShape, insideCurve, tilePolygon, reachOf, tileOutline, copyGap, roundGap, differencePolygon, convexGap, nearestOnSegment,
          edgeByEdgeGap, edgeTree, segmentsApart, endToSegment,
          { TILE_CORNERS: TILE_CORNERS, DRAWN_CORNERS: DRAWN_CORNERS, RUN_EDGES: RUN_EDGES, BIG_RUN: BIG_RUN, STRAIGHT_ON: STRAIGHT_ON, LEAF_EDGES: LEAF_EDGES, APART: APART }];
}
