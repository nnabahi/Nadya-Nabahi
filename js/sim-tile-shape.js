/* =====================================================================
   sim-tile-shape.js  —  a typed tile shape T, turned into a polygon
   (in the plane) or a polyhedron (in space)
   ---------------------------------------------------------------------
   The sims with continuous tiles (Sequential Continuous Tiling, the
   continuous DLA sims) take a tile T typed as a formula. This file
   reads it and turns it into a polygon or polyhedron the sims can
   measure exactly.

   READING THE FORMULA (in a second thread, with math.js loaded)
     readShape(text, values, name, dims)   a typed shape as a test of
                                     points, (x, y) -> true or false
                                     (in space, dims = 3: (x, y, z)).
                                     It can be
         a condition    x^2 + y^2 <= 1     the points where it holds,
         an equation    x^2 + y^2 = 1      the region its curve (in
                                           space, its surface) closes off,
         a curve        { x, y } in t      (the plane only) the inside of
                                           the curve traced as t runs
                                           from 0 to 2π.
       "values" holds the sliders' letters; "name" (like "T") is for
       the messages when it can't be read.

   THE POLYGON
     tilePolygon(inT)   T (a test of points, star-shaped around its
                        center (0, 0)) as a polygon with TILE_CORNERS
                        corners at equally spaced angles. Corner k sits
                        at angle θ_k = 2πk/M, at distance rho[k] from the
                        center: the farthest point of T in that
                        direction, found by binary search on the test
                        (reachOf). Every step after that is exact for
                        this polygon.
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
     tileFromOptions(options)  the polygon or polyhedron of the tile a
                         page's options ask for (its formula, sliders and
                         dimension)
     tileOutline(shape)  DRAWN_CORNERS of its corners, for a page to draw
                         (a polyhedron: its corners and triangles on a
                         coarser grid)

   THE POLYHEDRON (in space)
     tilePolyhedron(inT)   T (a test of points (x, y, z), star-shaped
                        around its center (0, 0, 0)) as a polyhedron: its
                        corners are the farthest points of T in the
                        directions of a grid on the sphere (cubeGrid,
                        FACE_CELLS by FACE_CELLS on each face of a cube).
       It gives
         dims                   3
         count, px, py, pz, rho the number of corners, each corner's x,
                                y and z, and its distance from the center
         rhoMax, symmetric, round   as for the polygon (round: a ball)
         convex                 whether T passed the test of convexity
                                (see tilePolyhedron)
         box                    T's half-widths [x, y, z] if it is a box
                                with its sides along x, y and z (boxOf),
                                null if not
         grid, opposite         the grid of directions (cubeGrid), and
                                for each corner, the one in the
                                opposite direction
         farthest(dx, dy, dz, quick)   the corner farthest in the
                                direction (dx, dy, dz), found exactly
                                (with quick: by a quicker search that is
                                nearly always right)

   THE GAP BETWEEN TWO COPIES OF THE TILE (the continuous DLA sims)
     copyGap(shape)     for copies of T moved without turning: gap(place,
                        q, best), how far T + q and T + place are apart,
                        and slide, the move that makes them touch (see
                        that section). In space, T must be convex.

   THE UNION OF THE COPIES (Internal Continuous DLA)
     copyCover(shape)   for copies of T moved without turning: how deep a
                        point is inside the union U of the copies q + D,
                        and the point outside every copy (where a tile
                        fits) nearest a point, found exactly (see that
                        section). For now T must be a disk or a convex
                        polygon in the plane, and a ball or a box in
                        space.

   In space it uses the 3D vectors of js/sim-honeycombs.js (add3, sub3,
   scale3, dot3, cross3), so a page with 3D tiles loads that file too;
   copyCover uses them in the plane as well, with perpendicularPair of
   js/sim-continuum.js.
   ===================================================================== */

const TILE_CORNERS = 4096;
const DRAWN_CORNERS = 128;
const RUN_EDGES = 16, BIG_RUN = 16;
// A corner of the difference polygon turning by less than this angle
// (in radians) counts as going straight on (differencePolygon).
const STRAIGHT_ON = 1e-12;
// The edge-by-edge gap's tree stops splitting at this many edges.
const LEAF_EDGES = 8;

// In space: the grid of directions has FACE_CELLS x FACE_CELLS squares on
// each face of the cube (6 FACE_CELLS^2 + 2 corners in all), and the
// drawn tile DRAWN_FACE_CELLS x DRAWN_FACE_CELLS (it must divide
// FACE_CELLS; both even). The corners are grouped in boxes GROUP_CELLS
// grid steps wide, each with a ball around it, for farthest(), whose
// search starts from a table: the farthest corner for each of
// START_CELLS x START_CELLS squares on each face of a cube of directions.
const FACE_CELLS = 24, DRAWN_FACE_CELLS = 6, GROUP_CELLS = 4, START_CELLS = 16;
// The GJK distance in space stops when it knows the gap to within
// GJK_CLOSE tile radii, or after GJK_STEPS steps.
const GJK_CLOSE = 1e-10, GJK_STEPS = 64;
// A triangle (tetrahedron) counts as flat when its area squared (volume
// squared) is below FLAT times the product of its edges' lengths squared
// from one corner: its sides meet at an angle below about 1e-12.
const FLAT = 1e-24;


/* =====================================================================
   READING THE FORMULA
   ===================================================================== */

// A typed shape as a function of (x, y) (in space, dims = 3: of
// (x, y, z)) that gives true or false. It comes in three kinds:
//   a condition, like x^2 + y^2 <= 1: the points where it holds;
//   an equation, like x^2 + y^2 = 1: the region its curve (surface)
//     closes off. "F = G" becomes F - G <= 0 or F - G >= 0, whichever
//     side far-off points (the corners of the square, or cube,
//     -2000 <= x, y (, z) <= 2000) are NOT on;
//   a curve { x, y } in t, like (cos(t), sin(t)): the points inside it
//     (insideCurve; the plane only).
// A point where the formula can't be worked out (say sqrt of a
// negative number) counts as outside.
function readShape(text, values, name, dims) {
  if (typeof text === "object") return insideCurve(text, values, name);
  dims = dims || 2;
  let node = math.parse(text);
  while (node.isParenthesisNode) node = node.content;
  const scope = Object.assign({}, values);
  const put = function (x, y, z) { scope.x = x; scope.y = y; if (dims === 3) scope.z = z; };
  if (node.isOperatorNode && node.fn === "equal") {
    const gap = new math.OperatorNode("-", "subtract", node.args).compile();
    const gapAt = function (x, y, z) {
      put(x, y, z);
      try { const v = gap.evaluate(scope); return typeof v === "number" ? v : NaN; } catch (error) { return NaN; }
    };
    let farSign = 0;
    for (let k = 0; k < (1 << dims); k++) {
      const far = [0, 1, 2].map(function (d) { return (k >> d) & 1 ? 2000 : -2000; });
      farSign += Math.sign(gapAt(far[0], far[1], far[2])) || 0;
    }
    if (farSign === 0) throw new Error(name + "'s " + (dims === 3 ? "surface" : "curve") + " doesn't close off a region (its inside and outside can't be told apart).");
    return function (x, y, z) { return gapAt(x, y, z) * farSign <= 0; };
  }
  const formula = node.compile();
  function test(x, y, z) {
    put(x, y, z);
    try { return formula.evaluate(scope) === true; } catch (error) { return false; }
  }
  put(0, 0, 0);
  const sample = formula.evaluate(scope);
  if (sample !== true && sample !== false) {
    throw new Error(name + (dims === 3
      ? " should be a condition like x^2 + y^2 + z^2 <= 1, or an equation like x^2 + y^2 + z^2 = 1."
      : " should be a condition like x^2 + y^2 <= 1, an equation like x^2 + y^2 = 1, or a curve like (cos(t), sin(t))."));
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
  for (let k = 0; k < M; k++) rho[k] = reachOf(inT, [cosM[k], sinM[k]]);

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

// The tile a continuous sim's page asks for: its formula (options
// tileFormula, with the sliders' numbers, options.values) read in the
// page's dimension (options.dim) as a polygon, or in space a
// polyhedron. (In a second thread, with math.js loaded.)
function tileFromOptions(options) {
  const inT = readShape(options.tileFormula, options.values, "The tile", options.dim);
  return options.dim === 3 ? tilePolyhedron(inT) : tilePolygon(inT);
}

// How far T reaches in the direction u (a unit vector [x, y], or
// [x, y, z] in space): step out, doubling, until we leave T, then binary
// search between the last point inside and the first point outside.
function reachOf(inT, u) {
  const inside = function (s) { return inT(s * u[0], s * u[1], s * (u[2] || 0)); };
  let lo = 0, hi = 1e-6;
  while (inside(hi) && hi < 1e6) { lo = hi; hi *= 2; }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// The tile for drawing. A polygon: DRAWN_CORNERS of its corners (x and
// y), whether it is a disk (round: a page can draw a true circle
// instead), how far it reaches, and its area. A polyhedron: its corners
// on the coarser grid of DRAWN_FACE_CELLS (corners, [x, y, z] each) and
// its triangles (three corner numbers each, counterclockwise seen from
// outside), whether it is a ball, and how far it reaches.
function tileOutline(shape) {
  if (shape.dims === 3) {
    const coarse = cubeGrid(DRAWN_FACE_CELLS), step = FACE_CELLS / DRAWN_FACE_CELLS;
    const corners = coarse.points.map(function (p) {
      const c = shape.grid.at(step * p[0], step * p[1], step * p[2]);
      return [shape.px[c], shape.py[c], shape.pz[c]];
    });
    return { corners: corners, triangles: coarse.triangles, round: shape.round, rhoMax: shape.rhoMax };
  }
  const x = [], y = [];
  for (let k = 0; k < shape.M; k += shape.M / DRAWN_CORNERS) { x.push(shape.px[k]); y.push(shape.py[k]); }
  return { x: x, y: y, round: shape.round, rhoMax: shape.rhoMax, area: shape.area };
}


/* =====================================================================
   THE POLYHEDRON (in space)
   ===================================================================== */

// A grid of directions in space: the whole-number points (i, j, k) on
// the surface of the cube [-n/2, n/2]^3 (n even), point (i, j, k)
// standing for the direction of (tan(π i / 2n), tan(π j / 2n),
// tan(π k / 2n)). On each face of the cube they make an n x n grid
// spaced by equal angles, so the directions are spread nearly evenly
// over the sphere (the "equiangular cubed sphere": C. Ronchi, R. Iacono
// and P. S. Paolucci, "The cubed sphere", J. Comput. Phys. 124 (1996)
// 93-114). It gives
//   points           the points [i, j, k]
//   at(i, j, k)      the number of the point (i, j, k), or -1 if it isn't one
//   triangles        each square of the grid as two triangles, three
//                    point numbers each, going counterclockwise seen from
//                    outside
//   direction(p)     the unit vector of point p
function cubeGrid(n) {
  const h = n / 2, points = [], number = new Map();
  const onCube = function (i, j, k) { return Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) === h; };
  const key = function (i, j, k) { return ((i + h) * (n + 1) + (j + h)) * (n + 1) + (k + h); };
  for (let i = -h; i <= h; i++) {
    for (let j = -h; j <= h; j++) {
      for (let k = -h; k <= h; k++) {
        if (onCube(i, j, k)) { number.set(key(i, j, k), points.length); points.push([i, j, k]); }
      }
    }
  }
  const at = function (i, j, k) { return onCube(i, j, k) ? number.get(key(i, j, k)) : -1; };

  // Face "a = side h" of the cube: its squares, with corners (u, v) in
  // the next two coordinates. Going u, then v, turns counterclockwise
  // seen from the + side (as x then y does seen from above), so the
  // - side's triangles go the other way round.
  const triangles = [];
  for (let a = 0; a < 3; a++) {
    for (const side of [-1, 1]) {
      const corner = function (u, v) {
        const p = [0, 0, 0];
        p[a] = side * h; p[(a + 1) % 3] = u; p[(a + 2) % 3] = v;
        return at(p[0], p[1], p[2]);
      };
      for (let u = -h; u < h; u++) {
        for (let v = -h; v < h; v++) {
          const p00 = corner(u, v), p10 = corner(u + 1, v), p11 = corner(u + 1, v + 1), p01 = corner(u, v + 1);
          if (side > 0) triangles.push(p00, p10, p11, p00, p11, p01);
          else triangles.push(p00, p11, p10, p00, p01, p11);
        }
      }
    }
  }

  const direction = function (p) {
    const t = p.map(function (i) { return Math.tan(Math.PI * i / (2 * n)); }), size = Math.hypot(t[0], t[1], t[2]);
    return t.map(function (x) { return x / size; });
  };
  return { points: points, at: at, triangles: triangles, direction: direction };
}

function tilePolyhedron(inT) {
  if (!inT(0, 0, 0)) throw new Error("T must contain its center (0, 0, 0).");
  const grid = cubeGrid(FACE_CELLS), count = grid.points.length;
  const px = new Float64Array(count), py = new Float64Array(count), pz = new Float64Array(count), rho = new Float64Array(count);
  const directions = grid.points.map(grid.direction);
  for (let c = 0; c < count; c++) rho[c] = reachOf(inT, directions[c]);
  const rhoMax = Math.max(...rho);
  if (rhoMax === 0) throw new Error("T has no volume around its center.");

  // Symmetric? (The same reach in opposite directions, up to the binary
  // search's rounding; grid point -p is the opposite direction of p.) If
  // so, make it exactly symmetric.
  const opposite = grid.points.map(function (p) { return grid.at(-p[0], -p[1], -p[2]); });
  const symmetric = opposite.every(function (o, c) { return Math.abs(rho[c] - rho[o]) <= 1e-7 * rhoMax; });
  if (symmetric) {
    for (let c = 0; c < count; c++) if (opposite[c] > c) rho[c] = rho[opposite[c]] = (rho[c] + rho[opposite[c]]) / 2;
  }
  const round = Math.min(...rho) > rhoMax * (1 - 1e-9);
  for (let c = 0; c < count; c++) {
    px[c] = rho[c] * directions[c][0]; py[c] = rho[c] * directions[c][1]; pz[c] = rho[c] * directions[c][2];
  }

  // Each corner's neighbors: the grid points one step away or less in
  // each of i, j and k, as one list (corner c's are near[nearStart[c]]
  // to near[nearStart[c + 1] - 1]).
  const nearStart = new Int32Array(count + 1), nearList = [];
  for (let c = 0; c < count; c++) {
    const [i, j, k] = grid.points[c];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let dk = -1; dk <= 1; dk++) {
          const m = (di || dj || dk) ? grid.at(i + di, j + dj, k + dk) : -1;
          if (m >= 0) nearList.push(m);
        }
      }
    }
    nearStart[c + 1] = nearList.length;
  }
  const near = Int32Array.from(nearList);

  // The corners in groups: those whose grid points fall in the same box
  // of GROUP_CELLS x GROUP_CELLS x GROUP_CELLS grid steps, each group
  // with a ball (center and radius) holding all its corners. The radius
  // gets a hair more, so rounding can never let a corner out.
  const groupOf = new Map();
  for (let c = 0; c < count; c++) {
    const key = grid.points[c].map(function (i) { return Math.floor((i + FACE_CELLS / 2) / GROUP_CELLS); }).join(",");
    if (!groupOf.has(key)) groupOf.set(key, []);
    groupOf.get(key).push(c);
  }
  const groups = Array.from(groupOf.values()), G = groups.length;
  const gx = new Float64Array(G), gy = new Float64Array(G), gz = new Float64Array(G), gr = new Float64Array(G);
  const groupStart = new Int32Array(G + 1), groupList = new Int32Array(count);
  groups.forEach(function (members, g) {
    for (const c of members) { gx[g] += px[c] / members.length; gy[g] += py[c] / members.length; gz[g] += pz[c] / members.length; }
    for (const c of members) gr[g] = Math.max(gr[g], Math.hypot(px[c] - gx[g], py[c] - gy[g], pz[c] - gz[g]));
    gr[g] += 1e-9 * rhoMax;
    groupList.set(members, groupStart[g]);
    groupStart[g + 1] = groupStart[g] + members.length;
  });

  // Where farthest() starts: a direction (dx, dy, dz) seen as a point
  // of the cube [-1, 1]^3 (divided by its largest coordinate, number a)
  // falls in one square of a START_CELLS x START_CELLS grid on one face.
  // For each square, the table holds the corner farthest in the
  // direction of its middle, found once corner by corner.
  // (It is called very often, so it makes no new arrays: the largest
  // coordinate is "big", and the next two, going round, b and c.)
  const m = START_CELLS;
  function startSquare(dx, dy, dz) {
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    let a = 2, big = dz, b = dx, c = dy;
    if (ax >= ay && ax >= az) { a = 0; big = dx; b = dy; c = dz; } else if (ay >= az) { a = 1; big = dy; b = dz; c = dx; }
    const size = Math.abs(big);
    const i = Math.min(m - 1, Math.floor((b / size + 1) / 2 * m)), j = Math.min(m - 1, Math.floor((c / size + 1) / 2 * m));
    return ((2 * a + (big > 0 ? 1 : 0)) * m + i) * m + j;
  }
  const start = new Int32Array(6 * m * m);
  for (let a = 0; a < 3; a++) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          const d = [0, 0, 0];
          d[a] = side; d[(a + 1) % 3] = -1 + (2 * i + 1) / m; d[(a + 2) % 3] = -1 + (2 * j + 1) / m;
          let best = 0;
          for (let c = 1; c < count; c++) if (px[c] * d[0] + py[c] * d[1] + pz[c] * d[2] > px[best] * d[0] + py[best] * d[1] + pz[best] * d[2]) best = c;
          start[startSquare(d[0], d[1], d[2])] = best;
        }
      }
    }
  }

  // The corner farthest in the direction (dx, dy, dz): the largest
  // dx x + dy y + dz z. First a climb from the table's corner, to a
  // neighbor farther in that direction while there is one (quick, and
  // nearly always already the answer). Then, to be sure, every group
  // whose ball reaches farther than the best corner so far is searched
  // corner by corner; the others can't hold a farther corner. With
  // "quick", it stops after the climb.
  function farthest(dx, dy, dz, quick) {
    let best = start[startSquare(dx, dy, dz)], most = px[best] * dx + py[best] * dy + pz[best] * dz;
    for (;;) {
      const here = best;
      for (let e = nearStart[here]; e < nearStart[here + 1]; e++) {
        const m = near[e], v = px[m] * dx + py[m] * dy + pz[m] * dz;
        if (v > most) { most = v; best = m; }
      }
      if (best === here) break;
    }
    if (quick) return best;
    const size = Math.sqrt(dx * dx + dy * dy + dz * dz);
    for (let g = 0; g < G; g++) {
      if (gx[g] * dx + gy[g] * dy + gz[g] * dz + gr[g] * size <= most) continue;
      for (let e = groupStart[g]; e < groupStart[g + 1]; e++) {
        const m = groupList[e], v = px[m] * dx + py[m] * dy + pz[m] * dz;
        if (v > most) { most = v; best = m; }
      }
    }
    return best;
  }

  // Convex? T is convex when the middle of any two of its points is in
  // it too. That is tested on the corners: each with its neighbors, and
  // every pair of the drawn grid's corners (spread all over T). Each
  // middle is pulled in toward the center by a hair, so rounding can't
  // put the middle of two corners on a flat side just outside. (A
  // convex T always passes; a T that isn't convex fails unless its
  // dents are too small for the grid to see.)
  const middleIn = function (a, b) {
    const s = (1 - 1e-9) / 2;
    return inT(s * (px[a] + px[b]), s * (py[a] + py[b]), s * (pz[a] + pz[b]));
  };
  let convex = true;
  if (!round) {
    for (let a = 0; a < count && convex; a++) {
      for (let e = nearStart[a]; e < nearStart[a + 1]; e++) if (!middleIn(a, near[e])) { convex = false; break; }
    }
    const step = FACE_CELLS / DRAWN_FACE_CELLS;
    const spread = cubeGrid(DRAWN_FACE_CELLS).points.map(function (p) { return grid.at(step * p[0], step * p[1], step * p[2]); });
    for (let i = 0; i < spread.length && convex; i++) {
      for (let j = i + 1; j < spread.length; j++) if (!middleIn(spread[i], spread[j])) { convex = false; break; }
    }
  }

  return {
    dims: 3, count: count, px: px, py: py, pz: pz, rho: rho, rhoMax: rhoMax,
    symmetric: symmetric, round: round, convex: convex, box: round ? null : boxOf([px, py, pz], rhoMax),
    grid: grid, opposite: opposite, farthest: farthest,
  };
}

// Is the polyhedron with these corners (coordinates[d][c]: coordinate d
// of corner c) a box with its sides along x, y and z? It is when every
// corner is on the smallest such box around them and that box's 8
// corners are among them (to 1e-9 tile radii): then the corners' convex
// hull is the box. Its half-widths [x, y, z] if so, null if not. (For a
// cube centered at the origin the grid of directions has the cube's
// corners; a box of other proportions usually comes out with its
// corners cut off a little, so it is not a box here.)
function boxOf(coordinates, rhoMax) {
  const close = 1e-9 * rhoMax, count = coordinates[0].length;
  const low = coordinates.map(function (c) { return Math.min(...c); }), high = coordinates.map(function (c) { return Math.max(...c); });
  for (let c = 0; c < count; c++) {
    let onSide = false;
    for (let d = 0; d < 3; d++) {
      if (Math.abs(coordinates[d][c] - low[d]) <= close || Math.abs(coordinates[d][c] - high[d]) <= close) onSide = true;
    }
    if (!onSide) return null;
  }
  for (let corner = 0; corner < 8; corner++) {
    const at = [0, 1, 2].map(function (d) { return (corner >> d) & 1 ? high[d] : low[d]; });
    let found = false;
    for (let c = 0; c < count && !found; c++) {
      found = [0, 1, 2].every(function (d) { return Math.abs(coordinates[d][c] - at[d]) <= close; });
    }
    if (!found) return null;
  }
  return [0, 1, 2].map(function (d) { return (high[d] - low[d]) / 2; });
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
     gap(place, q, best, exactBelow)   the gap between T + q and
                         T + place (each a point [x, y], or [x, y, z] in
                         space), when it is below best (otherwise some
                         number at least best); 0 if they overlap. With
                         exactBelow, a gap at least that big may come back
                         as a lower bound, at least half of it (the
                         edge-by-edge way and the convex way in space use
                         this)
     slide               after gap gave a number below best, the move
                         of T + place that makes the two copies just
                         touch (its length is the gap)
   It works the gap out in one of these ways, the fastest that fits:
     ROUND (a disk or ball of radius ρ): D is the disk (ball) of radius 2ρ.
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
     CONVEX, IN SPACE: the GJK algorithm (E. Gilbert, D. Johnson and
       S. Keerthi, "A fast procedure for computing the distance between
       complex objects in three-dimensional space", IEEE J. Robotics and
       Automation 4 (1988) 193-203; Ericson, Section 9.5). D is the
       convex hull of the differences of the polyhedron's corners, never
       made: all GJK needs is D's farthest point in any direction u,
       which is T's farthest corner in direction u minus its farthest
       corner in direction -u (farthest, tilePolyhedron). It keeps a few
       points of D (at most 4, the corners of a "simplex": a point, a
       segment, a triangle or a tetrahedron) and v, the point of their
       simplex nearest p (Ericson, Section 5.1). With u = p - v and w
       the farthest point of D in direction u, all of D is on the near
       side of the plane through w square to u, so the gap is at least
       (p - w) . u / |u|, and it is at most |u|. (u is made square to
       the simplex's sides, squareToSimplex, so rounding can't tilt it
       when the gap is tiny.) Then w joins the simplex, which keeps only
       the smallest part of itself holding its new nearest point, and so
       on, until the two bounds meet (to GJK_CLOSE tile radii, or as
       near as rounding lets them: a step that brings v no nearer ends
       it). The gap given is the lower bound (so a walk on spheres never
       jumps too far), and the slide goes to v, a point of D: the copies
       touch, overlapping by at most the difference of the two bounds.
   ===================================================================== */
function copyGap(shape) {
  if (shape.round) return roundGap(shape.rhoMax);
  if (shape.dims === 3) {
    if (!shape.convex) throw new Error("In 3D the tile must be convex, for now: this one has two points whose middle is outside it.");
    return polyhedronGap(shape);
  }
  return shape.convex ? convexGap(differencePolygon(shape)) : edgeByEdgeGap(shape);
}

// ROUND: the gap between disks (balls) of radius ρ, their centers q and
// place.
function roundGap(radius) {
  const g = { gap: gap, slide: [0, 0, 0] };
  function gap(place, q, best) {
    let squared = 0;
    for (let d = 0; d < place.length; d++) squared += (place[d] - q[d]) * (place[d] - q[d]);
    const apart = Math.sqrt(squared), gapNow = Math.max(0, apart - 2 * radius);
    if (gapNow < best) {
      for (let d = 0; d < place.length; d++) g.slide[d] = gapNow > 0 ? -(place[d] - q[d]) / apart * gapNow : 0;
    }
    return gapNow;
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
  const N = D.x.length, g = { gap: gap, slide: [0, 0] }, { nx, ny, h } = edgeLines(D);
  let step = 1;
  while (4 * step <= N) step *= 2;
  const firstStep = step;

  function gap(place, q, best) {
    const dx = place[0] - q[0], dy = place[1] - q[1];
    const f = function (k) { k = ((k % N) + N) % N; return nx[k] * dx + ny[k] * dy - h[k]; };
    const low = rayEdge(D, dx, dy);
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

// Each edge k of a convex polygon D (corner k to corner k + 1, going
// counterclockwise): its outer normal (nx[k], ny[k]) and how far its line
// is from 0, h[k].
function edgeLines(D) {
  const N = D.x.length, nx = new Float64Array(N), ny = new Float64Array(N), h = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const j = (k + 1) % N, ex = D.x[j] - D.x[k], ey = D.y[j] - D.y[k], length = Math.hypot(ex, ey) || 1;
    nx[k] = ey / length; ny[k] = -ex / length;
    h[k] = nx[k] * D.x[k] + ny[k] * D.y[k];
  }
  return { nx: nx, ny: ny, h: h };
}

// The edge of D (differencePolygon, with 0 inside it) that the ray from 0
// through (dx, dy) crosses: the last corner at a smaller angle (a binary
// search; before the first, the edge round from the last corner).
function rayEdge(D, dx, dy) {
  const N = D.x.length, angle = Math.atan2(dy, dx);
  if (angle < D.angle[0]) return N - 1;
  let low = 0, high = N - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (D.angle[mid] <= angle) low = mid; else high = mid - 1;
  }
  return low;
}

// The point of the segment from a to b nearest (x, y).
function nearestOnSegment(x, y, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
  return [ax + t * ex, ay + t * ey];
}

// ANY OTHER T: edge by edge, between T and T + (dx, dy), with
// (dx, dy) = place - q. The edges are
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

  function gap(place, q, best, exactBelow) {
    const dx = place[0] - q[0], dy = place[1] - q[1];
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


// CONVEX, IN SPACE: the gap by GJK (see the top of this section). D's
// farthest points come from the quick search (farthest, tilePolyhedron)
// until an answer is about to be given; then the exact search makes
// sure of the last one, and if the quick one was wrong after all, the
// exact search is used from then on. (Every point found either way is
// a point of D, so only the lower bound needs the exact search.) For a
// symmetric T, D is simply 2T.
function polyhedronGap(shape) {
  const px = shape.px, py = shape.py, pz = shape.pz, close = GJK_CLOSE * shape.rhoMax;
  const g = { gap: gap, slide: [0, 0, 0] };
  function farthestOfD(ux, uy, uz, quick) {
    const up = shape.farthest(ux, uy, uz, quick);
    const down = shape.symmetric ? shape.opposite[up] : shape.farthest(-ux, -uy, -uz, quick);
    return [px[up] - px[down], py[up] - py[down], pz[up] - pz[down]];
  }

  function gap(place, q, best, exactBelow) {
    const p = [place[0] - q[0], place[1] - q[1], place[2] - q[2]];
    // Too far apart to matter: the centers' distance less the most the
    // tiles reach is already a lower bound past best (most calls end here).
    const plain = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - 2 * shape.rhoMax;
    if (plain >= best) return plain;
    let simplex = [farthestOfD(p[0], p[1], p[2], true)], v = simplex[0];
    let low = plain, quick = true, sure = true, ux = 0, uy = 0, uz = 0, size = 0;
    // The lower bound from w, a point of D farthest in the direction u.
    const boundFrom = function (w) { return ((p[0] - w[0]) * ux + (p[1] - w[1]) * uy + (p[2] - w[2]) * uz) / size; };
    // Whether a lower bound "b" is enough to answer.
    const answers = function (b) {
      return b >= best || (exactBelow !== undefined && b >= exactBelow && 2 * b >= size) || size - b <= close;
    };
    for (let step = 0; step < GJK_STEPS; step++) {
      [ux, uy, uz] = squareToSimplex(sub3(p, v), simplex);
      size = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (size === 0) { low = 0; sure = true; break; }            // p is in D: they overlap (or just touch)
      let w = farthestOfD(ux, uy, uz, quick), here = boundFrom(w);
      sure = !quick;
      if (quick && answers(here)) {
        // About to answer: make sure w is D's farthest point this way.
        const exactW = farthestOfD(ux, uy, uz, false), exactHere = boundFrom(exactW);
        if (exactHere < here) { quick = false; w = exactW; }    // the quick search was wrong
        here = exactHere;
        sure = true;
      }
      if (sure) {
        low = Math.max(low, here);
        if (low >= best) return low;
        if (exactBelow !== undefined && low >= exactBelow && 2 * low >= size) return low;   // (a lower bound is enough)
        if (size - low <= close) break;
      }
      simplex.push(w);
      const nearest = nearestOnSimplex(p, simplex), nearer = length3(sub3(nearest.point, p));
      // p in D? Only if no exact lower bound says it is outside.
      if (nearer === 0 && !sure) { low = Math.max(low, boundFrom(farthestOfD(ux, uy, uz, false))); sure = true; }
      // No real step forward (w already in the simplex, or a simplex too
      // thin for rounding to measure): stop with what we have.
      if (!(nearer < size) || nearer < low - close) break;
      v = nearest.point;
      simplex = nearest.corners;
    }
    if (!sure) low = Math.max(low, boundFrom(farthestOfD(ux, uy, uz, false)));
    const gapNow = Math.max(0, low);
    if (gapNow < best) {
      const u = squareToSimplex(sub3(p, v), simplex);     // (the slide goes straight to v's side of D)
      g.slide[0] = -u[0]; g.slide[1] = -u[1]; g.slide[2] = -u[2];
    }
    return gapNow;
  }
  return g;
}

// The way u from the simplex's nearest point v to p (u = p - v), made
// square to the simplex's own sides: for a triangle, the part of u along
// its normal (a cross product of two sides); for a segment, u less its
// part along the segment. Rounding in p - v leaves a part along the
// sides of about 1e-16 of the tiles' size. At a tiny gap that part would
// tilt u, and the lower bound (p - w) . u / |u| would lose the gap (at a
// gap of 1e-8 it often came out below 0).
function squareToSimplex(u, corners) {
  if (corners.length === 3) {
    const n = cross3(sub3(corners[1], corners[0]), sub3(corners[2], corners[0]));
    return scale3(dot3(u, n) / dot3(n, n), n);
  }
  if (corners.length === 2) {
    const side = sub3(corners[1], corners[0]);
    return sub3(u, scale3(dot3(u, side) / dot3(side, side), side));
  }
  return u;
}

// The point of a simplex (1 to 4 corners [x, y, z]) nearest the point p,
// and the fewest of its corners whose own simplex holds that point:
// { point, corners }. (Ericson, Sections 5.1.2, 5.1.5 and 5.1.6.) A
// triangle whose corners are on one line (up to rounding, FLAT), or a
// tetrahedron whose corners are on one plane, is taken as its edges, or
// its faces, so rounding can never put p inside a simplex with no inside.
function nearestOnSimplex(p, s) {
  if (s.length === 1) return { point: s[0], corners: s };
  if (s.length === 2) return nearestOnEdge(p, s[0], s[1]);
  if (s.length === 3) return nearestOnTriangle(p, s[0], s[1], s[2]);
  return nearestOnTetrahedron(p, s[0], s[1], s[2], s[3]);
}

function nearestOnEdge(p, a, b) {
  const ab = sub3(b, a), t = dot3(sub3(p, a), ab) / dot3(ab, ab);
  if (!(t > 0)) return { point: a, corners: [a] };
  if (t >= 1) return { point: b, corners: [b] };
  return { point: add3(a, scale3(t, ab)), corners: [a, b] };
}

// The triangle abc: which of its corners, edges or inside is nearest p,
// by where p is seen from each corner (Ericson, Section 5.1.5).
function nearestOnTriangle(p, a, b, c) {
  const ab = sub3(b, a), ac = sub3(c, a), ap = sub3(p, a), n = cross3(ab, ac);
  if (dot3(n, n) <= FLAT * dot3(ab, ab) * dot3(ac, ac)) return nearestOfAll(p, [nearestOnEdge(p, a, b), nearestOnEdge(p, b, c), nearestOnEdge(p, a, c)]);
  const d1 = dot3(ab, ap), d2 = dot3(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: a, corners: [a] };
  const bp = sub3(p, b), d3 = dot3(ab, bp), d4 = dot3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: b, corners: [b] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return { point: add3(a, scale3(d1 / (d1 - d3), ab)), corners: [a, b] };
  const cp = sub3(p, c), d5 = dot3(ab, cp), d6 = dot3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: c, corners: [c] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return { point: add3(a, scale3(d2 / (d2 - d6), ac)), corners: [a, c] };
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return { point: add3(b, scale3((d4 - d3) / ((d4 - d3) + (d5 - d6)), sub3(c, b))), corners: [b, c] };
  }
  const v = vb / (va + vb + vc), w = vc / (va + vb + vc);
  return { point: add3(a, add3(scale3(v, ab), scale3(w, ac))), corners: [a, b, c] };
}

// The tetrahedron abcd: the nearest point of each face that p is on the
// outer side of (the side away from the fourth corner), the nearest of
// those; p itself if it is inside (Ericson, Section 5.1.6).
function nearestOnTetrahedron(p, a, b, c, d) {
  const faces = [[a, b, c, d], [a, c, d, b], [a, d, b, c], [b, d, c, a]];
  const ab = sub3(b, a), ac = sub3(c, a), ad = sub3(d, a), volume = dot3(ad, cross3(ab, ac));
  if (volume * volume <= FLAT * dot3(ab, ab) * dot3(ac, ac) * dot3(ad, ad)) {
    return nearestOfAll(p, faces.map(function (f) { return nearestOnTriangle(p, f[0], f[1], f[2]); }));
  }
  let best = { point: p, corners: [a, b, c, d] }, bestSquared = Infinity;
  for (const [x, y, z, other] of faces) {
    const normal = cross3(sub3(y, x), sub3(z, x));
    if (dot3(sub3(p, x), normal) * dot3(sub3(other, x), normal) >= 0) continue;   // p is on the inner side
    const nearest = nearestOnTriangle(p, x, y, z), off = sub3(nearest.point, p), squared = dot3(off, off);
    if (squared < bestSquared) { best = nearest; bestSquared = squared; }
  }
  return best;
}


// The nearest to p of some { point, corners } answers.
function nearestOfAll(p, answers) {
  let best = answers[0], bestSquared = Infinity;
  for (const answer of answers) {
    const off = sub3(answer.point, p), squared = dot3(off, off);
    if (squared < bestSquared) { best = answer; bestSquared = squared; }
  }
  return best;
}


/* =====================================================================
   THE UNION OF THE COPIES OF D (Internal Continuous DLA)
   ---------------------------------------------------------------------
   In Internal Continuous DLA the particle B starts inside the cluster
   and stops the first moment its tile B + T overlaps no tile q + T of
   the cluster. B + T and q + T overlap (more than touch) exactly when
   B is inside q + D, with D = T - T as above, so B stops the first
   moment it leaves the union U of the sets q + D. The points outside U
   are the FREE points: the places where a tile fits.
   copyCover(shape) returns { reach, depth, nearestFree, isFree }:
     reach                 how far D reaches from its center (a copy
                           whose center is farther than this from a
                           point can't hold it)
     depth(place, q)       how deep "place" is inside q + D: its distance
                           to the edge of q + D if it is inside (0 or
                           less if it isn't). U holds the disk (ball) of
                           that radius around the place, so the walk on
                           spheres can jump that far
     nearestFree(x, δ, near)   the free point nearest x, if it is
                           within δ of x (null if none is), where "near"
                           lists the centers of every copy within
                           reach + δ of x (any others are too far to
                           matter)
     isFree(p, near)       whether p is inside none of the copies "near"
                           (by more than FREE_SLACK)

   THE NEAREST FREE POINT, EXACTLY. Let p be the free point nearest x.
   If x is free, p is x. Otherwise p is on the edge of U, which is made
   of pieces of the copies' own edges: arcs of circles (disks), pieces
   of segments (polygons) or patches of spheres (balls). They end where
   two copies' edges cross (in space, on circles where two spheres
   meet, and those end where three spheres meet). On a circle, a sphere
   or a line, the distance to x stops changing at only two places, the
   nearest point and the farthest, and the farthest is never smallest
   (unless the distance is the same everywhere: from a circle's or
   sphere's center, or from a circle's axis). So p is one of these
   CANDIDATES:
     - a copy's edge point nearest x: the point of its circle (sphere)
       nearest x, or of one of its edges, which may be a corner;
     - a point where the edges of two copies cross;
     - in space: the point nearest x of a circle where two spheres meet,
       and a point where three spheres meet.
   (Where the distance is the same everywhere, any one point stands for
   the rest: if it isn't free but some other point is, the free part
   ends at a candidate of the next kind.) So it is enough to list the
   candidates within δ of x, which involve only the copies whose edges
   pass within δ of x, keep the free ones, and take the nearest. A
   candidate counts as free when no copy holds it deeper than
   FREE_SLACK tile radii (a crossing point worked out in floating point
   can be a hair inside the copies it is on), so a tile put there
   overlaps another by at most that.

   The kinds of tile it can do, for now:
     ROUND (a disk or ball of radius ρ): D is the disk (ball) of radius
       2ρ, and the candidates are as above.
     CONVEX, IN THE PLANE: D is the convex polygon of copyGap's CONVEX
       way. Its edges near a point are found through the tree of
       circles of the edge-by-edge gap (edgeTree).
     A BOX, IN SPACE (a cube, say: boxOf): D is the box twice as wide,
       and the candidates are fewer still. A point is free when it is
       beyond some face of every box, so the free points make up pieces,
       each cut out by one face's plane from each box. The point of
       such a piece nearest x is x with some of its coordinates moved
       onto those planes. So each coordinate of p is x's own, or a
       face's within δ of x's: only a few points to try.
   Any other tile throws an Error saying so (in space, a tile that is
   neither a ball nor a box; in the plane, a tile that isn't convex).
   In practice the boxes are cubes: a box of other proportions usually
   comes out of tilePolyhedron with its corners cut off a little, so
   boxOf doesn't count it as a box.
   It works with points in space ([x, y, z]; in the plane z = 0), with
   the 3D vectors of js/sim-honeycombs.js and perpendicularPair of
   js/sim-continuum.js.
   ===================================================================== */

// A candidate no copy holds deeper than this (in tile radii) is free.
const FREE_SLACK = 1e-12;

function copyCover(shape) {
  const dims = shape.dims || 2;
  let kit;
  if (shape.round) kit = roundCover(2 * shape.rhoMax, dims);
  else if (dims === 3) {
    if (!shape.box) throw new Error("For now a 3D tile must be a ball or a cube (with its sides along x, y and z).");
    kit = boxCover(shape.box.map(function (w) { return 2 * w; }));
  } else {
    if (!shape.convex) throw new Error("For now the tile must be convex, and this one has a dent. Tiles with dents come next.");
    kit = polygonCover(differencePolygon(shape));
  }
  const slack = FREE_SLACK * shape.rhoMax;

  function isFree(p, near) {
    for (const q of near) if (kit.depth(p, q) > slack) return false;
    return true;
  }

  // The candidates within delta of x (x itself too), nearest first: the
  // first free one.
  function nearestFree(x, delta, near) {
    const found = kit.candidates(x, delta, near).concat([x.slice()]);
    const apart = found.map(function (p) { return Math.hypot(...p.map(function (v, d) { return v - x[d]; })); });
    const order = [];
    for (let k = 0; k < found.length; k++) if (apart[k] <= delta) order.push(k);
    order.sort(function (a, b) { return apart[a] - apart[b]; });
    for (const k of order) if (isFree(found[k], near)) return found[k];
    return null;
  }

  return { reach: kit.reach, depth: kit.depth, nearestFree: nearestFree, isFree: isFree };
}

// ROUND: D is the disk (ball) of radius R. dims = 2 or 3.
function roundCover(R, dims) {
  function depth(place, q) {
    let squared = 0;
    for (let d = 0; d < dims; d++) squared += (place[d] - q[d]) * (place[d] - q[d]);
    return R - Math.sqrt(squared);
  }

  function candidates(x, delta, near) {
    const at = inSpace(x), found = [];
    const centers = near.map(inSpace).filter(function (q) { return Math.abs(length3(sub3(at, q)) - R) <= delta; });
    for (let i = 0; i < centers.length; i++) {
      found.push(add3(centers[i], scale3(R, directionFrom(centers[i], at))));
      for (let j = i + 1; j < centers.length; j++) {
        const meet = spheresMeet(centers[i], centers[j], R);
        if (!meet) continue;
        if (dims === 2) {
          // the circle where the two balls meet crosses the plane at the two crossing points
          const across = scale3(meet.radius, unit3(cross3(meet.axis, [0, 0, 1])));
          found.push(add3(meet.middle, across), sub3(meet.middle, across));
          continue;
        }
        found.push(nearestOnCircle(at, meet));
        for (let k = j + 1; k < centers.length; k++) found.push(...threeSpheresMeet(centers[i], centers[j], centers[k], R));
      }
    }
    return found.map(function (p) { return p.slice(0, dims); });
  }

  return { reach: R, depth: depth, candidates: candidates };
}

// A point [x, y] or [x, y, z] as a point in space.
function inSpace(p) { return [p[0], p[1], p.length > 2 ? p[2] : 0]; }
function unit3(v) { return scale3(1 / length3(v), v); }

// The direction from q to p, as a unit vector (any one if p is q).
function directionFrom(q, p) {
  const v = sub3(p, q), size = length3(v);
  return size > 0 ? scale3(1 / size, v) : [1, 0, 0];
}

// Where two spheres of radius R around a and b meet: a circle, with its
// middle, its axis (the direction from a to b) and its radius (0 if they
// just touch); null if they don't meet.
function spheresMeet(a, b, R) {
  const v = sub3(b, a), d = length3(v);
  if (d === 0 || d > 2 * R) return null;
  return { middle: scale3(0.5, add3(a, b)), axis: scale3(1 / d, v), radius: Math.sqrt(Math.max(0, R * R - d * d / 4)) };
}

// The point of such a circle nearest p (any point of it, if p is on its axis).
function nearestOnCircle(p, circle) {
  const off = sub3(p, circle.middle), flat = sub3(off, scale3(dot3(off, circle.axis), circle.axis)), size = length3(flat);
  const toward = size > 1e-12 * circle.radius ? scale3(1 / size, flat) : perpendicularPair(circle.axis)[0];
  return add3(circle.middle, scale3(circle.radius, toward));
}

// The points where three spheres of radius R around a, b and c meet (0,
// 1 or 2 of them): on the line square to the plane of a, b and c through
// the center o of the circle through them, at height t above and below
// it with t^2 + |o - a|^2 = R^2. (With u = b - a and v = c - a,
// o - a = (|u|^2 v - |v|^2 u) x (u x v) / (2 |u x v|^2).)
function threeSpheresMeet(a, b, c, R) {
  const u = sub3(b, a), v = sub3(c, a), n = cross3(u, v), nn = dot3(n, n);
  if (nn <= 1e-24 * dot3(u, u) * dot3(v, v)) return [];       // the centers on one line: no common point
  const o = add3(a, scale3(1 / (2 * nn), cross3(sub3(scale3(dot3(u, u), v), scale3(dot3(v, v), u)), n)));
  const tt = R * R - dot3(sub3(o, a), sub3(o, a));
  if (tt < 0) return [];
  const up = scale3(Math.sqrt(tt / nn), n);
  return [add3(o, up), sub3(o, up)];
}

// CONVEX, IN THE PLANE: D is a convex polygon (differencePolygon).
function polygonCover(D) {
  const N = D.x.length, tree = edgeTree(D.x, D.y, N), { nx, ny, h } = edgeLines(D);
  let reach = 0;
  for (let k = 0; k < N; k++) reach = Math.max(reach, Math.hypot(D.x[k], D.y[k]));
  const stack = [];   // (for the searches of the tree)

  // How far (vx, vy) is from edge k.
  function toEdge(k, vx, vy) {
    const j = (k + 1) % N, ex = D.x[j] - D.x[k], ey = D.y[j] - D.y[k];
    let t = ((vx - D.x[k]) * ex + (vy - D.y[k]) * ey) / (ex * ex + ey * ey || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(D.x[k] + t * ex - vx, D.y[k] + t * ey - vy);
  }
  // A part of the tree is at least this far from (vx, vy).
  function toPart(part, vx, vy) { return Math.hypot(tree.x[part] - vx, tree.y[part] - vy) - tree.r[part]; }

  // The distance from (vx, vy) to D's nearest edge: a search of the tree
  // that skips every part farther than the nearest edge so far.
  function edgeDistance(vx, vy) {
    let best = Infinity;
    stack.length = 0;
    stack.push(0);
    while (stack.length > 0) {
      const part = stack.pop();
      if (toPart(part, vx, vy) >= best) continue;
      const left = tree.left[part], right = tree.right[part];
      if (left >= 0) {
        // the nearer half is looked at first
        if (toPart(left, vx, vy) < toPart(right, vx, vy)) stack.push(right, left); else stack.push(left, right);
        continue;
      }
      for (let k = tree.lo[part]; k < tree.hi[part]; k++) best = Math.min(best, toEdge(k, vx, vy));
    }
    return best;
  }

  // The edges within "within" of (vx, vy), by number.
  function edgesWithin(vx, vy, within) {
    const found = [];
    stack.length = 0;
    stack.push(0);
    while (stack.length > 0) {
      const part = stack.pop();
      if (toPart(part, vx, vy) > within) continue;
      if (tree.left[part] >= 0) { stack.push(tree.left[part], tree.right[part]); continue; }
      for (let k = tree.lo[part]; k < tree.hi[part]; k++) if (toEdge(k, vx, vy) <= within) found.push(k);
    }
    return found;
  }

  // Inside D (the side of the edge the ray from 0 crosses that 0 is on),
  // how far the edge is.
  function depth(place, q) {
    const vx = place[0] - q[0], vy = place[1] - q[1], k = rayEdge(D, vx, vy);
    if (nx[k] * vx + ny[k] * vy - h[k] >= 0) return 0;
    return edgeDistance(vx, vy);
  }

  function candidates(x, delta, near) {
    const found = [], lists = [];
    for (const q of near) {
      const edges = edgesWithin(x[0] - q[0], x[1] - q[1], delta);
      if (edges.length === 0) continue;
      for (const k of edges) {
        const j = (k + 1) % N, p = nearestOnSegment(x[0], x[1], D.x[k] + q[0], D.y[k] + q[1], D.x[j] + q[0], D.y[j] + q[1]);
        found.push(p);
      }
      lists.push({ q: q, edges: edges });
    }
    for (let a = 0; a < lists.length; a++) {
      for (let b = a + 1; b < lists.length; b++) {
        const [qa, qb] = [lists[a].q, lists[b].q];
        for (const k of lists[a].edges) {
          const k2 = (k + 1) % N;
          for (const m of lists[b].edges) {
            const m2 = (m + 1) % N;
            const cross = segmentsCross(D.x[k] + qa[0], D.y[k] + qa[1], D.x[k2] + qa[0], D.y[k2] + qa[1],
                                        D.x[m] + qb[0], D.y[m] + qb[1], D.x[m2] + qb[0], D.y[m2] + qb[1]);
            if (cross) found.push(cross);
          }
        }
      }
    }
    return found;
  }

  return { reach: reach, depth: depth, candidates: candidates };
}

// Where the segments a-b and c-d cross, [x, y], or null if they don't
// (or are parallel: then where their common part ends is a corner,
// which is a candidate anyway).
function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
  if (Math.abs(den) <= 1e-15 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [ax + t * rx, ay + t * ry] : null;
}

// A BOX, IN SPACE: D is the box with these half-widths along x, y and z
// (it works in the plane too).
function boxCover(half) {
  const dims = half.length;

  function depth(place, q) {
    let inside = true, deepest = Infinity, out = 0;
    for (let d = 0; d < dims; d++) {
      const beyond = Math.abs(place[d] - q[d]) - half[d];
      if (beyond >= 0) { inside = false; out += beyond * beyond; } else deepest = Math.min(deepest, -beyond);
    }
    return inside ? deepest : -Math.sqrt(out);
  }

  // Each coordinate: x's own, or a face's within delta of it; every way
  // of choosing them.
  function candidates(x, delta, near) {
    let found = [[]];
    for (let d = 0; d < dims; d++) {
      const values = [x[d]];
      for (const q of near) {
        for (const v of [q[d] - half[d], q[d] + half[d]]) if (Math.abs(v - x[d]) <= delta && values.indexOf(v) < 0) values.push(v);
      }
      found = [].concat(...found.map(function (p) { return values.map(function (v) { return p.concat(v); }); }));
    }
    return found;
  }

  return { reach: Math.hypot(...half), depth: depth, candidates: candidates };
}


/* =====================================================================
   FOR A SECOND THREAD: everything above, to hand to runInWorker
   (js/sim-page.js) as helpers.
   ===================================================================== */
function tileShapeHelpers() {
  return [readShape, insideCurve, tilePolygon, tileFromOptions, reachOf, tileOutline, cubeGrid, tilePolyhedron,
          boxOf, copyGap, roundGap, differencePolygon, convexGap, edgeLines, rayEdge, nearestOnSegment, edgeByEdgeGap, edgeTree,
          segmentsApart, endToSegment,
          polyhedronGap, squareToSimplex, nearestOnSimplex, nearestOnEdge, nearestOnTriangle, nearestOnTetrahedron, nearestOfAll,
          copyCover, roundCover, inSpace, unit3, directionFrom, spheresMeet, nearestOnCircle, threeSpheresMeet, polygonCover,
          segmentsCross, boxCover,
          { TILE_CORNERS: TILE_CORNERS, DRAWN_CORNERS: DRAWN_CORNERS, RUN_EDGES: RUN_EDGES, BIG_RUN: BIG_RUN, STRAIGHT_ON: STRAIGHT_ON,
            LEAF_EDGES: LEAF_EDGES, APART: APART, FACE_CELLS: FACE_CELLS, DRAWN_FACE_CELLS: DRAWN_FACE_CELLS, GROUP_CELLS: GROUP_CELLS,
            START_CELLS: START_CELLS, GJK_CLOSE: GJK_CLOSE, GJK_STEPS: GJK_STEPS, FLAT: FLAT, FREE_SLACK: FREE_SLACK }];
}
