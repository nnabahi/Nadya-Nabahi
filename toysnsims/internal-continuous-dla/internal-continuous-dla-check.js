/* =====================================================================
   internal-continuous-dla-check.js  —  tests for the growth in
   internal-continuous-dla-growth.js and the union of the copies of D
   (copyCover, js/sim-tile-shape.js), in the plane and in space
   ---------------------------------------------------------------------
   Each test runs the growth (newInternalContinuousDLA) or copyCover
   directly, with fixed seeds, and adds a row to the results table
   (addRow, js/check-page.js):
     1. Exact laws from one tile: Brownian motion from a point inside a
        disk (ball) leaves it with the law of the Poisson kernel, and
        from the middle of a square (cube) it leaves each piece of the
        edge that the square's (cube's) turns and flips take to each
        other equally often. This tests the jumps, the stop and the
        nearest free point together.
     2. How deep a point is in a copy of D (copyCover's depth), against
        a plain test of inside and outside.
     3. The nearest free point (copyCover's nearestFree), against a
        plain search around it.
     4. The inner ball: points of it are all inside U, tested plainly.
     5. Jumps against small steps, epsilon, a big cluster recounted,
        and coupling: the tests External Continuous DLA's check page
        runs too (js/check-page.js).
     6. The tiles it can't do yet say so.
   ===================================================================== */

// The tiles tested: tilePolygon (in the plane) or tilePolyhedron (in
// space, js/sim-tile-shape.js) of these shapes, written as tests of
// points, the way readShape makes them from formulas. Each has a plain
// way to say whether a point v is inside D = T - T: ruler(v), D's
// ruler value at v (the smallest λ with v in λD), below 1 exactly
// inside D, so a point y is inside the copy q + D when ruler(y - q) <
// 1; and deepest(d), how deep the copies of the tile centered d apart
// go into each other (js/check-page.js).
//   - Disks (balls) of radius 1: D is the disk (ball) of radius 2.
//   - Squares (cubes) of half-width 1: D is the square (cube) of
//     half-width 2.
//   - The ellipse x^2 + y^2 / 0.36 <= 1 is symmetric (T = -T), so
//     D = T + T = 2T, whose ruler at v is T's at v / 2 (the ruler of
//     T's own polygon, its gauge).
//   - The triangle max(x + 3y, x - 3y, -2x) <= 1, with corners (1, 0),
//     (-1/2, 1/2) and (-1/2, -1/2), is not symmetric. Its corners are
//     in directions of the grid tilePolygon uses, so its polygon is
//     exactly the triangle. With n = (1, 3), (1, -3) and (-2, 0), T is
//     where every n · v <= 1, and each n · v is at least -2 on T (at
//     the corner across from that side). So D = T - T is the hexagon
//     where every |n · v| <= 3; and the tile at d has a point of ruler
//     value λ in the tile at 0 when d is in λT - T, where every
//     n · d <= λ + 2 and -n · d <= 2λ + 1.
function testTiles(dims) {
  if (dims === 2) {
    const ellipse = tilePolygon(function (x, y) { return x * x + y * y / 0.36 <= 1; });
    const sides = [[1, 3], [1, -3], [-2, 0]], along = function (n, v) { return n[0] * v[0] + n[1] * v[1]; };
    return [
      { name: "Disks", dims: 2, shape: tilePolygon(function (x, y) { return x * x + y * y <= 1; }), ruler: ballRuler, deepest: ballDeepest },
      { name: "Squares", dims: 2, shape: tilePolygon(function (x, y) { return Math.max(Math.abs(x), Math.abs(y)) <= 1; }),
        ruler: boxRuler, deepest: boxDeepest },
      { name: "Ellipses", dims: 2, shape: ellipse,
        ruler: function (v) { return ellipse.gauge(v[0] / 2, v[1] / 2); },
        deepest: function (d) { return Math.max(0, ellipse.gauge(d[0], d[1]) - 1); } },
      { name: "Triangles", dims: 2, shape: tilePolygon(function (x, y) { return Math.max(x + 3 * y, x - 3 * y, -2 * x) <= 1; }),
        ruler: function (v) { return Math.max(...sides.map(function (n) { return Math.abs(along(n, v)); })) / 3; },
        deepest: function (d) {
          return Math.max(0, ...sides.map(function (n) { return Math.max(along(n, d) - 2, (-along(n, d) - 1) / 2); }));
        } },
    ];
  }
  return [
    { name: "Balls", dims: 3, shape: tilePolyhedron(function (x, y, z) { return x * x + y * y + z * z <= 1; }), ruler: ballRuler, deepest: ballDeepest },
    { name: "Cubes", dims: 3, shape: tilePolyhedron(function (x, y, z) { return Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 1; }),
      ruler: boxRuler, deepest: boxDeepest },
  ];
}
function ballRuler(v) { return Math.hypot(...v) / 2; }
function boxRuler(v) { return Math.max(...v.map(Math.abs)) / 2; }

// The smallest ruler value of y - q over the tiles' centers q, plainly
// (each tile looked at; one farther than 2 rhoMax along an axis can't
// hold y): below 1, y is inside U.
function plainCover(t, centers) {
  const reach = 2 * t.shape.rhoMax;
  return function (y) {
    let least = Infinity;
    for (const q of centers) {
      if (q.some(function (x, d) { return Math.abs(x - y[d]) > reach; })) continue;
      least = Math.min(least, t.ruler(y.map(function (x, d) { return x - q[d]; })));
    }
    return least;
  };
}

// A uniform point of the disk (ball) of radius r around 0.
function pointInBall(dims, r, draw) { return pointOnSphere(dims, r * Math.pow(draw(), 1 / dims), draw); }

// A point counts as plainly free when it is outside every copy by more
// than this (in ruler values), and a free point the page found counts
// as inside a copy when it is inside by more than this: far above
// rounding, and above the FREE_SLACK of js/sim-tile-shape.js.
const RULER_SLACK = 1e-9;


/* =====================================================================
   1. EXACT LAWS FROM ONE TILE
   ---------------------------------------------------------------------
   The cluster is one tile, centered at c, with the source (the origin)
   inside c + D: the particle is a point doing Brownian motion from the
   source until it leaves c + D, landings of particles 0, 1, 2, ...,
   none added.

   THE POISSON KERNEL. Disks (balls) of radius 1: c + D is the disk
   (ball) of radius R = 2 around c, and the source is at distance
   s = 1.2 from c. Brownian motion leaves it with the Poisson kernel's
   law (againstPoissonKernel, js/check-page.js).

   A SQUARE (CUBE) FROM ITS MIDDLE. Squares (cubes) of half-width 1,
   with c at the source: c + D is the square (cube) of half-width 2
   around the source. Its turns and flips (8 of them; for the cube 48)
   take Brownian motion from its middle to Brownian motion from its
   middle, and one eighth of a side (one of the 48 pieces of the cube's
   faces, cut by their middle lines and diagonals) onto each other one.
   So each of those pieces is equally likely (equalChiSquare,
   js/check-page.js).
   ===================================================================== */

// Particles 0 to runs - 1 leave the one tile at c: where each lands,
// from c, how far the farthest is off the edge of c + D (by "off", a
// place's distance from that edge), and the jumps per particle.
function leaveOneTile(t, c, runs, off) {
  const growth = newInternalContinuousDLA({ dim: t.dims, tile: t.shape, seed: "one tile", seedTiles: [c] });
  const places = [];
  let worst = 0;
  for (let p = 0; p < runs; p++) {
    const y = growth.land(p).map(function (x, d) { return x - c[d]; });
    worst = Math.max(worst, off(y));
    places.push(y);
  }
  return { places: places, off: worst, perParticle: fourDigits(growth.jumps / runs) + " jumps per particle" };
}

function checkPoissonExit(t, runs) {
  const s = 1.2, R = 2, toward = t.dims === 2 ? [Math.cos(2.1), Math.sin(2.1)] : [2 / 3, 2 / 3, -1 / 3];
  const c = toward.map(function (x) { return -s * x; });
  const leave = leaveOneTile(t, c, runs, function (y) { return Math.abs(Math.hypot(...y) - R); });
  const test = againstPoissonKernel(leave.places, toward, s, R);
  addRow(t.name + ": the Poisson kernel, from inside one tile", test.pass && leave.off < 1e-9,
         test.text + "; every landing at most " + fourDigits(leave.off) + " off the " + (t.dims === 2 ? "circle" : "sphere") + "; " +
         leave.perParticle);
}

// Which piece of the square's (cube's) edge y is on: its side (face),
// then the signs of its other coordinates, and in space which of them
// is bigger.
function squarePiece(y) {
  const dims = y.length;
  let side = 0;
  for (let d = 1; d < dims; d++) if (Math.abs(y[d]) > Math.abs(y[side])) side = d;
  const others = [1, 2].slice(0, dims - 1).map(function (k) { return y[(side + k) % dims]; });
  let piece = 2 * side + (y[side] > 0 ? 1 : 0);
  for (const v of others) piece = 2 * piece + (v > 0 ? 1 : 0);
  if (dims === 3) piece = 2 * piece + (Math.abs(others[0]) < Math.abs(others[1]) ? 1 : 0);
  return piece;
}

function checkSquareExit(t, runs) {
  const c = new Array(t.dims).fill(0);
  const leave = leaveOneTile(t, c, runs, function (y) { return Math.abs(Math.max(...y.map(Math.abs)) - 2); });
  const counts = new Array(t.dims === 2 ? 8 : 48).fill(0);
  for (const y of leave.places) counts[squarePiece(y)]++;
  const test = equalChiSquare(counts);
  addRow(t.name + ": from the middle of one tile, each piece equally often", test.pValue > 0.001 && leave.off < 1e-9,
         counts.length + " pieces, " + runs + " runs: chi-square " + test.statistic.toFixed(1) + " with " + test.degrees +
         " degrees of freedom, p = " + test.pValue.toFixed(3) + "; every landing at most " + fourDigits(leave.off) +
         " off the edge; " + leave.perParticle);
}


/* =====================================================================
   2. HOW DEEP A POINT IS IN A COPY
   ---------------------------------------------------------------------
   copyCover's depth(v, 0), at random places v around D: it must be
   above 0 exactly when the ruler says v is inside D (up to rounding),
   and the disk (ball) of that radius around v must be inside D, since
   the walk jumps that far: points of its edge, tested with the ruler.
   ===================================================================== */
function checkDepth(t, places, around) {
  const cover = copyCover(t.shape), random = seededUniform("depth " + t.name), zero = new Array(t.dims).fill(0);
  let wrongSide = 0, inside = 0, outside = 0;
  for (let i = 0; i < places; i++) {
    let j = 0;
    const draw = function () { return random.uniform(i, j++); };
    const v = pointInBall(t.dims, 2.5 * t.shape.rhoMax, draw), depth = cover.depth(v, zero), ruler = t.ruler(v);
    if ((depth > 0) !== (ruler < 1) && Math.abs(ruler - 1) > RULER_SLACK) wrongSide++;
    if (depth <= 0) continue;
    inside++;
    for (let k = 0; k < around; k++) {
      const u = pointOnSphere(t.dims, depth, draw);
      if (t.ruler(v.map(function (x, d) { return x + u[d]; })) > 1 + RULER_SLACK) outside++;
    }
  }
  addRow(t.name + ": how deep a point is in a copy of D", wrongSide === 0 && outside === 0 && inside > 0,
         places + " places, " + inside + " of them inside D: " + wrongSide + " on the wrong side; " + inside * around +
         " points at that depth around them, " + outside + " outside D");
}


/* =====================================================================
   3. THE NEAREST FREE POINT
   ---------------------------------------------------------------------
   A cluster grown to n tiles, and places x: a third near where a
   particle would stop next (land, without adding it), a third near the
   edge of a random copy q + D (q + v / ruler(v) is that edge's point
   in the direction v), and a third anywhere around the cluster. Each
   with a reach
   delta from 1e-6 to 0.1 tile radii, evenly on a log scale (the walk
   asks within epsilon, the inner ball within 0.044, in space 0.054).
   nearestFree(x, delta) gives a point p, or none. Then, plainly
   (plainCover):
     - p is free (inside no copy by more than RULER_SLACK);
     - no point nearer x than p (or than delta, if there is no p) is
       free: tested at random points of the disk (ball) around x of
       that radius, less 1e-9 tile radii, and of its edge;
     - and none near p is: points a hundredth of that radius from p, on
       the side of x (by at least half of that).
   ===================================================================== */
function checkNearestFree(t, n, places, samples) {
  const growth = grownTiles(newInternalContinuousDLA, t, "nearest free", n), centers = centersOf(growth), covered = plainCover(t, centers);
  const cover = copyCover(t.shape), rho = t.shape.rhoMax, random = seededUniform("nearest free " + t.name);
  const apart = function (a, b) { return Math.hypot(...a.map(function (x, d) { return x - b[d]; })); };
  const plainlyFree = function (y) { return covered(y) > 1 + RULER_SLACK; };
  let atX = 0, elsewhere = 0, none = 0, deepest = 0, nearer = 0, tested = 0;
  for (let i = 0; i < places; i++) {
    let j = 0;
    const draw = function () { return random.uniform(i, j++); };
    const delta = rho * Math.pow(10, -6 + 5 * draw());
    const off = pointInBall(t.dims, 2 * delta, draw);
    let x;
    if (i % 3 === 0) x = growth.land(n + i).map(function (c, d) { return c + off[d]; });
    else if (i % 3 === 1) {
      const q = centers[Math.floor(draw() * centers.length)], v = pointOnSphere(t.dims, 1, draw);
      x = q.map(function (c, d) { return c + v[d] / t.ruler(v) + off[d]; });
    } else x = pointInBall(t.dims, growth.cluster.farthest + 2 * rho, draw);
    const near = centers.filter(function (q) { return apart(q, x) <= cover.reach + delta; });
    const p = cover.nearestFree(x, delta, near);
    if (p) deepest = Math.max(deepest, 1 - covered(p));
    if (p && apart(p, x) === 0) { atX++; continue; }
    if (p) elsewhere++; else none++;
    const radius = p ? apart(p, x) : delta, inner = radius - 1e-9 * rho;
    for (let k = 0; k < samples && inner > 0; k++) {
      const u = k % 2 === 0 ? pointInBall(t.dims, inner, draw) : pointOnSphere(t.dims, inner, draw);
      tested++;
      if (plainlyFree(x.map(function (c, d) { return c + u[d]; }))) nearer++;
    }
    if (!p) continue;
    for (let k = 0; k < samples; k++) {
      const u = pointOnSphere(t.dims, radius / 100, draw), y = p.map(function (c, d) { return c + u[d]; });
      if (apart(y, x) > radius - radius / 200) continue;
      tested++;
      if (plainlyFree(y)) nearer++;
    }
  }
  addRow(t.name + ": the nearest free point, " + n + " tiles", nearer === 0 && deepest <= RULER_SLACK && atX > 0 && elsewhere > 0 && none > 0,
         places + " places: " + atX + " free already, " + elsewhere + " with a free point found within delta, " + none +
         " with none; every free point found inside a copy by at most " + fourDigits(Math.max(0, deepest)) + " of the ruler; " +
         tested + " points nearer, tested plainly: " + nearer + " free");
}


/* =====================================================================
   4. THE INNER BALL
   ---------------------------------------------------------------------
   The cluster grown to each size in "sizes": random points inside the
   inner ball and on its edge must all be inside U (plainCover).
   ===================================================================== */
function checkInnerBall(t, sizes, points) {
  const growth = newInternalContinuousDLA({ dim: t.dims, tile: t.shape, seed: "inner ball" }), parts = [];
  let free = 0, smallest = Infinity;
  for (const n of sizes) {
    while (growth.cluster.count < n) growth.addParticle();
    const r = growth.innerRadius(), covered = plainCover(t, centersOf(growth)), random = seededUniform("inner ball " + t.name + " " + n);
    for (let i = 0; i < points; i++) {
      let j = 0;
      const draw = function () { return random.uniform(i, j++); };
      const y = i % 2 === 0 ? pointInBall(t.dims, r, draw) : pointOnSphere(t.dims, r, draw);
      if (covered(y) > 1 + RULER_SLACK) free++;
    }
    smallest = Math.min(smallest, r);
    parts.push(n + " tiles: radius " + fourDigits(r) + " (the farthest center " + fourDigits(growth.cluster.farthest) + ")");
  }
  addRow(t.name + ": the inner ball", free === 0 && smallest > 0,
         parts.join("; ") + "; " + points + " points of it each time, tested plainly: " + free + " outside U");
}


/* =====================================================================
   5. JUMPS AGAINST SMALL STEPS, EPSILON, A BIG CLUSTER, COUPLING
   ---------------------------------------------------------------------
   These tests (checkSmallSteps, checkEpsilon, checkBigTileCluster and
   checkTileCoupling) are in js/check-page.js, since External Continuous
   DLA's check page runs them too.
   ===================================================================== */


/* =====================================================================
   6. THE TILES IT CAN'T DO YET
   ---------------------------------------------------------------------
   copyCover must refuse them, with a message that says why, and never
   run them as a tile it can do (a polyhedron that is nearly a box is
   not a box).
   ===================================================================== */
function checkCantYet() {
  const tries = [
    { name: "your star", shape: tilePolygon(function (x, y) { return Math.hypot(x, y) <= 1 + 0.5 * Math.cos(5 * Math.atan2(y, x)); }), says: "dent" },
    { name: "an ellipsoid", shape: tilePolyhedron(function (x, y, z) { return x * x + y * y / 0.36 + z * z / 0.1225 <= 1; }), says: "cube" },
    { name: "a box 1 by 0.6 by 0.35",
      shape: tilePolyhedron(function (x, y, z) { return Math.max(Math.abs(x), Math.abs(y) / 0.6, Math.abs(z) / 0.35) <= 1; }), says: "cube" },
  ];
  const results = tries.map(function (x) {
    try { copyCover(x.shape); } catch (e) { return { pass: e.message.indexOf(x.says) >= 0, text: x.name + ": \"" + e.message + "\"" }; }
    return { pass: false, text: x.name + ": NOT refused" };
  });
  addRow("The tiles it can't do yet say so", results.every(function (r) { return r.pass; }),
         results.map(function (r) { return r.text; }).join("; "));
}


function allTests() {
  const make = newInternalContinuousDLA, flat = testTiles(2), space = testTiles(3), all = flat.concat(space);
  const [disks, squares] = flat, [balls, cubes] = space;
  // How many particles each tile's landings use, and its big cluster.
  const runs = { "Disks": 20000, "Squares": 20000, "Ellipses": 5000, "Triangles": 20000, "Balls": 10000, "Cubes": 10000 };
  const big = { "Disks": 3000, "Squares": 3000, "Ellipses": 1000, "Triangles": 3000, "Balls": 2000, "Cubes": 1000 };
  return [disks, balls].map(function (t) { return function () { checkPoissonExit(t, 50000); }; }).concat(
    [squares, cubes].map(function (t) { return function () { checkSquareExit(t, 50000); }; }),
    all.map(function (t) { return function () { checkDepth(t, 5000, 16); }; }),
    all.map(function (t) { return function () { checkNearestFree(t, 300, 2000, 32); }; }),
    all.map(function (t) { return function () { checkInnerBall(t, [100, 500, big[t.name]], 10000); }; }),
    all.map(function (t) { return function () { checkSmallSteps(make, t, 5, runs[t.name]); }; }),
    all.map(function (t) { return function () { checkEpsilon(make, t, 5, runs[t.name]); }; }),
    all.map(function (t) { return function () { checkBigTileCluster(make, t, big[t.name]); }; }),
    all.map(function (t) { return function () { checkTileCoupling(make, t, 200, 50); }; }),
    [checkCantYet]);
}

runChecksOnClick(allTests);
