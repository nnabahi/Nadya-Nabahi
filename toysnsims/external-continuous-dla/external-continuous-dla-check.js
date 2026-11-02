/* =====================================================================
   external-continuous-dla-check.js  —  tests for the growth in
   external-continuous-dla-growth.js, the gaps between tiles in
   js/sim-tile-shape.js and Brownian motion in js/sim-continuum.js,
   in the plane and in space
   ---------------------------------------------------------------------
   Each test runs the growth (newExternalContinuousDLA) directly, with
   fixed seeds, and adds a row to the results table (addRow,
   js/check-page.js):
     1. Exact landing laws: Brownian motion from infinity lands on a
        segment (in the plane) with the arcsine law, on a flat disk (in
        space) with the disk's law, and on a ball away from the launch
        center uniformly. This tests the launch, the return (in space,
        the replacement), the jumps, the epsilon stop and the slide
        together.
     2. The Brownian return: the angles it brings particles back at,
        against the Poisson kernel (checkReturn, js/check-page.js).
     3. Jumps against small steps, epsilon, a big cluster recounted,
        and coupling: the tests Internal Continuous DLA's check page
        runs too (js/check-page.js).
     4. The gap between two tiles (copyGap) against a plain answer, and
        the slide into contact.
   ===================================================================== */

// The tiles tested: tilePolygon (in the plane) or tilePolyhedron (in
// space, js/sim-tile-shape.js) of these shapes, written as tests of
// points, the way readShape makes them from the formulas of the sim's
// presets. Each has, where there is one, a plain way to the gap between
// two copies (plainGap(d), the copies' centers d apart) and to how deep
// they go into each other (deepest(d), js/check-page.js).
function testTiles(dims) {
  if (dims === 2) {
    const star = tilePolygon(function (x, y) { return Math.hypot(x, y) <= 1 + 0.5 * Math.cos(5 * Math.atan2(y, x)); });
    return [
      { name: "Disks", dims: 2, shape: tilePolygon(function (x, y) { return x * x + y * y <= 1; }), plainGap: ballGap, deepest: ballDeepest },
      { name: "Squares", dims: 2, shape: tilePolygon(function (x, y) { return Math.max(Math.abs(x), Math.abs(y)) <= 1; }),
        plainGap: boxGap, deepest: boxDeepest },
      { name: "Your star", dims: 2, shape: star,
        plainGap: function (d) { return polygonGap(star, d); }, deepest: function (d) { return deepestCorner(star, d[0], d[1]); } },
    ];
  }
  // The octahedron's and the tetrahedron's corners. Both sit in
  // directions of the grid tilePolyhedron uses (the middles and the
  // corners of the cube's faces), so their polyhedra are exactly them.
  const octahedron = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const tetrahedron = [[1, 1, -1], [1, -1, 1], [-1, 1, 1], [-1, -1, -1]];
  return [
    { name: "Balls", dims: 3, shape: tilePolyhedron(function (x, y, z) { return x * x + y * y + z * z <= 1; }), plainGap: ballGap, deepest: ballDeepest },
    { name: "Cubes", dims: 3, shape: tilePolyhedron(function (x, y, z) { return Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 1; }),
      plainGap: boxGap, deepest: boxDeepest },
    { name: "Octahedra", dims: 3, shape: tilePolyhedron(function (x, y, z) { return Math.abs(x) + Math.abs(y) + Math.abs(z) <= 1; }),
      plainGap: hullGapOf(octahedron) },
    { name: "Tetrahedra", dims: 3,
      shape: tilePolyhedron(function (x, y, z) { return Math.max(x + y + z, x - y - z, -x + y - z, -x - y + z) <= 1; }),
      plainGap: hullGapOf(tetrahedron) },
    { name: "Ellipsoids", dims: 3, shape: tilePolyhedron(function (x, y, z) { return x * x + y * y / 0.36 + z * z / 0.1225 <= 1; }) },
  ];
}

/* =====================================================================
   1. EXACT LANDING LAWS
   ---------------------------------------------------------------------
   Here the cluster is a set whose law is known (the growth's
   seedShape), and the particle a point on its own: landings of
   particles 0, 1, 2, ..., none added, counted in 20 equal pieces.

   THE ARCSINE LAW. Brownian motion from infinity first reaches the
   segment from -1 to 1 at x with density 1 / (π sqrt(1 - x^2)): the
   map z -> (z + 1/z) / 2 takes the outside of the unit circle onto the
   outside of the segment, and the point e^{iθ} to cos θ; Brownian
   motion from infinity reaches the circle at a uniform θ, and the map
   carries Brownian motion to Brownian motion (P. Morters and Y. Peres,
   "Brownian Motion", Cambridge University Press, 2010, Theorem 7.20).
   So the distribution function is 1/2 + arcsin(x) / π. (In potential
   theory, the harmonic measure from infinity of a compact set is its
   equilibrium measure, and this is the segment's: T. Ransford,
   "Potential Theory in the Complex Plane", Cambridge University Press,
   1995, Chapter 4.)

   THE FLAT DISK, in space. Brownian motion from infinity reaches the
   disk of radius 1 in the plane z = 0 with the disk's equilibrium
   measure, the way charge spreads on a charged metal disk: density
   1 / (2π sqrt(1 - r^2)) at distance r from its middle (J. D. Jackson,
   "Classical Electrodynamics", 3rd ed., Wiley, 1999, Problem 3.3; it
   is the uniform measure on the unit sphere, pressed flat onto the
   disk). So the distance r has distribution function
   1 - sqrt(1 - r^2), and the angle around the middle is uniform.

   A BALL AWAY FROM THE CENTER. Brownian motion from infinity reaches a
   ball at a uniform point of its surface (it is the same seen from any
   turn around the ball's middle), wherever the ball is. The launch
   circle (sphere) is around (0, 0), not the ball, so this tests that
   the launch and the return (in space, the replacement) lose where the
   particle came from.
   ===================================================================== */
const LAW_PIECES = 20;

// A set as a seedShape (newExternalContinuousDLA), from the point of
// the set nearest any place: its gap from the place, and the slide
// onto it. The set fits inside the circle (sphere) of radius "reach".
function seedShapeFrom(reach, nearestPoint) {
  const seed = { reach: reach, slide: [] };
  seed.gap = function (place) {
    const q = nearestPoint(place);
    seed.slide = q.map(function (x, d) { return x - place[d]; });
    return Math.hypot(...seed.slide);
  };
  return seed;
}

// Where particles 0 to runs - 1 land on the set, with the tile t (only
// its size matters, for epsilon): { places, off, perParticle }, off the
// farthest any landing is from the set, perParticle the jumps, returns
// (and in space, replacements) per particle, as text.
function landOnSet(t, reach, nearestPoint, name, runs) {
  const growth = newExternalContinuousDLA({ dim: t.dims, tile: t.shape, seed: name, seedShape: seedShapeFrom(reach, nearestPoint) });
  const places = [];
  let off = 0;
  for (let p = 0; p < runs; p++) {
    const place = growth.land(p);
    off = Math.max(off, Math.hypot(...nearestPoint(place).map(function (x, d) { return x - place[d]; })));
    places.push(place);
  }
  const perParticle = fourDigits(growth.jumps / runs) + " jumps and " + fourDigits(growth.returns / runs) + " returns" +
                      (t.dims === 3 ? " and " + fourDigits(growth.replaced / runs) + " replacements" : "") + " per particle";
  return { places: places, off: off, perParticle: perParticle };
}

// The counts of values in LAW_PIECES equal pieces of [low, high], and
// the chances of those pieces under the distribution function F (a
// Map each), tested (exactOddsTest, js/check-page.js).
function lawTest(values, F, low, high, what) {
  const seen = new Map(), odds = new Map(), width = (high - low) / LAW_PIECES;
  for (const v of values) {
    const piece = Math.min(LAW_PIECES - 1, Math.max(0, Math.floor((v - low) / width)));
    seen.set(piece, (seen.get(piece) || 0) + 1);
  }
  for (let b = 0; b < LAW_PIECES; b++) odds.set(b, F(low + (b + 1) * width) - F(low + b * width));
  return exactOddsTest(odds, seen, values.length, what);
}
function uniformLaw(low, high) { return function (v) { return (v - low) / (high - low); }; }

function checkArcsine(t, runs) {
  const land = landOnSet(t, 1, function ([x]) { return [Math.min(1, Math.max(-1, x)), 0]; }, "arcsine", runs);
  const F = function (x) { return 0.5 + Math.asin(Math.min(1, Math.max(-1, x))) / Math.PI; };
  const test = lawTest(land.places.map(function ([x]) { return x; }), F, -1, 1, "pieces of the segment");
  addRow("The arcsine law on a segment", test.pass && land.off < 1e-12,
         test.text + "; every landing at most " + fourDigits(land.off) + " off the segment; " + land.perParticle);
}

function checkFlatDisk(t, runs) {
  const onDisk = function ([x, y]) { const r = Math.hypot(x, y), s = r > 1 ? 1 / r : 1; return [s * x, s * y, 0]; };
  const land = landOnSet(t, 1, onDisk, "flat disk", runs);
  const F = function (r) { return 1 - Math.sqrt(1 - Math.min(1, r * r)); };
  const radius = lawTest(land.places.map(function ([x, y]) { return Math.hypot(x, y); }), F, 0, 1, "pieces of the distance from the middle");
  const angle = lawTest(land.places.map(function ([x, y]) { return Math.atan2(y, x); }), uniformLaw(-Math.PI, Math.PI), -Math.PI, Math.PI,
                        "pieces of the angle");
  addRow("3D: the landing law on a flat disk", radius.pass && angle.pass && land.off < 1e-12,
         "the distance: " + radius.text + "; the angle: " + angle.text + "; every landing at most " + fourDigits(land.off) +
         " off the disk; " + land.perParticle);
}

// The ball of radius 1 with its middle 2 from the launch center.
function checkBallAway(t, runs) {
  const middle = t.dims === 2 ? [1.2, -1.6] : [2 / 3, -4 / 3, 4 / 3];
  const onBall = function (place) {
    const off = place.map(function (x, d) { return x - middle[d]; }), r = Math.hypot(...off), s = r > 1 ? 1 / r : 1;
    return middle.map(function (m, d) { return m + s * off[d]; });
  };
  const land = landOnSet(t, 3, onBall, "ball away", runs), out = land.places.map(function (place) {
    return place.map(function (x, d) { return x - middle[d]; });
  });
  let tests;
  if (t.dims === 2) {
    tests = [lawTest(out.map(function ([x, y]) { return Math.atan2(y, x); }), uniformLaw(-Math.PI, Math.PI), -Math.PI, Math.PI, "pieces of the angle")];
  } else {
    // Uniform on a sphere: the height along the direction of the ball's
    // middle uniform (Archimedes), and the turn around it.
    const toward = middle.map(function (m) { return m / 2; }), [e1, e2] = perpendicularPair(toward);
    tests = [lawTest(out.map(function (v) { return dot3(v, toward); }), uniformLaw(-1, 1), -1, 1, "pieces of the height"),
             lawTest(out.map(function (v) { return Math.atan2(dot3(v, e2), dot3(v, e1)); }), uniformLaw(-Math.PI, Math.PI), -Math.PI, Math.PI,
                     "pieces of the turn")];
  }
  addRow((t.dims === 2 ? "2D" : "3D") + ": uniform on a ball away from the center", tests.every(function (x) { return x.pass; }) && land.off < 1e-12,
         tests.map(function (x) { return x.text; }).join("; ") + "; every landing at most " + fourDigits(land.off) + " off the " +
         (t.dims === 2 ? "circle" : "sphere") + "; " + land.perParticle);
}


/* =====================================================================
   2. THE BROWNIAN RETURN
   ---------------------------------------------------------------------
   A particle that gets outside the launch circle (sphere) is brought
   back to it the way Brownian motion would come back
   (js/sim-continuum.js). The test, checkReturn, is in js/check-page.js,
   since External Discrete DLA's check page runs it too.
   ===================================================================== */


/* =====================================================================
   3. JUMPS AGAINST SMALL STEPS, EPSILON, A BIG CLUSTER, COUPLING
   ---------------------------------------------------------------------
   These tests (checkSmallSteps, checkEpsilon, checkBigTileCluster and
   checkTileCoupling) are in js/check-page.js, since Internal Continuous
   DLA's check page runs them too.
   ===================================================================== */


/* =====================================================================
   4. THE GAP BETWEEN TWO TILES
   ---------------------------------------------------------------------
   copyGap's gap against a plain answer, the tile's plainGap:
     - disks and balls, squares and cubes: the gap between the true
       shapes, by formula (ballGap, boxGap);
     - the star: the smallest distance from a corner of one polygon to
       an edge of the other, both ways, over all of them (two polygons
       that don't overlap are that far apart), and 0 when a corner of
       one is inside the other (polygonGap, with deepestCorner of
       js/check-page.js);
     - the octahedron and the tetrahedron: the distance to D = T - T,
       the hull of the differences of their corners, triangle by
       triangle (hullGap).
   Then the slide: the tile moved by it must touch (plain gap 0), be as
   far from where it was as the gap, and not go into the other tile
   (deepest). For a convex tile that isn't round there is a check that
   needs no plain answer, so it covers the ellipsoid too: the plane
   square to the slide, through its end, has all of D on its near side
   (D's farthest reach found corner by corner, supportOfD), so the gap
   is at least the distance past that plane, and it must be that
   distance: the gap is never more than the true one, and the slid tile
   goes into the other by at most the difference.
   ===================================================================== */
function ballGap(d) { return Math.max(0, Math.hypot(...d) - 2); }
function boxGap(d) { return Math.hypot(...d.map(function (x) { return Math.max(0, Math.abs(x) - 2); })); }

function polygonGap(s, [dx, dy]) {
  if (deepestCorner(s, dx, dy) < 1) return 0;
  let best = Infinity;    // the smallest squared distance
  for (const [ox, oy] of [[dx, dy], [-dx, -dy]]) {
    // The corners of the tile at (ox, oy), against the edges of the one at 0.
    for (let i = 0; i < s.M; i++) {
      const cx = ox + s.px[i], cy = oy + s.py[i];
      for (let k = 0; k < s.M; k++) {
        const j = (k + 1) % s.M, ex = s.px[j] - s.px[k], ey = s.py[j] - s.py[k];
        const u = Math.min(1, Math.max(0, ((cx - s.px[k]) * ex + (cy - s.py[k]) * ey) / (ex * ex + ey * ey)));
        const ux = cx - s.px[k] - u * ex, uy = cy - s.py[k] - u * ey;
        if (ux * ux + uy * uy < best) best = ux * ux + uy * uy;
      }
    }
  }
  return Math.sqrt(best);
}

// The plain gap of a tile with these corners (in space): the distance
// from d to the hull of the differences of its corners (hullGap).
function hullGapOf(corners) {
  const seen = new Map();
  for (const a of corners) for (const b of corners) { const v = sub3(a, b); seen.set(v.join(","), v); }
  const points = Array.from(seen.values());
  return function (d) { return hullGap(points, d); };
}

// The distance from p to the hull of a few points in space, plainly.
// For p outside the hull, its nearest point is on a triangle of three
// of the points, and no such triangle is nearer (each is in the hull),
// so it is the nearest of all their triangles' nearest points. For p
// inside, that point isn't the hull's: some point lies beyond the plane
// through it square to the way to p (well beyond: by about the hull's
// width). So the answer is that distance if no point lies beyond (up to
// rounding), and 0 if one does.
function hullGap(points, p) {
  let near = null, best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const q = nearestOfTriangle(p, points[i], points[j], points[k]), size = length3(sub3(p, q));
        if (size < best) { best = size; near = q; }
      }
    }
  }
  if (best === 0) return 0;
  const u = scale3(1 / best, sub3(p, near));
  const beyond = Math.max(...points.map(function (x) { return dot3(sub3(x, near), u); }));
  return beyond <= 1e-9 ? best : 0;
}

// The point of the triangle abc nearest p: p dropped square onto the
// triangle's plane, if it lands inside the triangle (on the inner side
// of each edge); otherwise the nearest point of its three edges.
function nearestOfTriangle(p, a, b, c) {
  const n = cross3(sub3(b, a), sub3(c, a)), nn = dot3(n, n);
  if (nn > 0) {
    const q = sub3(p, scale3(dot3(sub3(p, a), n) / nn, n));
    const inside = [[a, b], [b, c], [c, a]].every(function ([x, y]) { return dot3(cross3(sub3(y, x), sub3(q, x)), n) >= 0; });
    if (inside) return q;
  }
  let best = null, bestSize = Infinity;
  for (const [x, y] of [[a, b], [b, c], [c, a]]) {
    const q = nearestOfSegment(p, x, y), size = length3(sub3(p, q));
    if (size < bestSize) { best = q; bestSize = size; }
  }
  return best;
}
function nearestOfSegment(p, a, b) {
  const ab = sub3(b, a), along = dot3(ab, ab);
  return along === 0 ? a : add3(a, scale3(Math.min(1, Math.max(0, dot3(sub3(p, a), ab) / along)), ab));
}

// How far D reaches in the direction u (a unit vector): T's farthest
// corner that way less its farthest corner the other way, corner by
// corner.
function supportOfD(s, u) {
  const axes = [s.px, s.py, s.pz].slice(0, u.length);
  let up = -Infinity, down = -Infinity;
  for (let c = 0; c < axes[0].length; c++) {
    let v = 0;
    for (let d = 0; d < u.length; d++) v += u[d] * axes[d][c];
    up = Math.max(up, v); down = Math.max(down, -v);
  }
  return up + down;
}

function checkGaps(t, offsets) {
  const s = t.shape, gaps = copyGap(s), random = seededUniform("gaps " + t.name), reach = 2 * s.rhoMax, scale = s.rhoMax;
  const zero = new Array(t.dims).fill(0), planeCheck = s.convex && !s.round;
  let worst = 0, worstSlide = 0, worstPlane = 0, deepest = Infinity, touching = 0;
  for (let i = 0; i < offsets; i++) {
    let j = 0;
    const draw = function () { return random.uniform(i, j++); };
    const d = pointOnSphere(t.dims, reach * (0.5 + 1.2 * draw()), draw);
    const gap = gaps.gap(d, zero, Infinity);
    if (t.plainGap) worst = Math.max(worst, Math.abs(gap - t.plainGap(d)));
    if (gap === 0) continue;
    // The slide moves the tile at d until it touches.
    const slide = gaps.slide.slice(0, t.dims), length = Math.hypot(...slide), moved = d.map(function (x, k) { return x + slide[k]; });
    worstSlide = Math.max(worstSlide, Math.abs(length - gap), t.plainGap ? t.plainGap(moved) : 0);
    if (t.deepest) deepest = Math.min(deepest, t.deepest(moved));
    if (planeCheck) {
      const u = slide.map(function (x) { return -x / length; });
      worstPlane = Math.max(worstPlane, Math.abs(d.reduce(function (sum, x, k) { return sum + x * u[k]; }, 0) - supportOfD(s, u) - gap));
    }
    touching++;
  }
  const parts = [offsets + " offsets"];
  if (t.plainGap) parts.push("the gap at most " + fourDigits(worst) + " from the plain one");
  parts.push(touching + " slid into contact: " + (t.plainGap ? "their plain gap and " : "") + "each slide's length less the gap at most " +
             fourDigits(worstSlide));
  if (t.deepest) parts.push("no point inside the other tile by more than " + fourDigits(Math.max(0, 1 - deepest)) + " of its size");
  if (planeCheck) parts.push("the gap at most " + fourDigits(worstPlane) + " from the distance past the plane square to the slide");
  addRow(t.name + ": the gap between two tiles",
         worst < 1e-9 * scale && worstSlide < 1e-9 * scale && (!t.deepest || deepest > 1 - 1e-9) && worstPlane < 1e-9 * scale,
         parts.join("; "));
}


function allTests() {
  const make = newExternalContinuousDLA, flat = testTiles(2), space = testTiles(3), all = flat.concat(space), ball = space[0];
  // How many particles each tile's landings use, and its big cluster.
  const runs = { "Disks": 20000, "Squares": 20000, "Your star": 1000, "Balls": 10000, "Cubes": 10000, "Tetrahedra": 3000 };
  const big = { "Disks": 3000, "Squares": 3000, "Your star": 500, "Balls": 2000, "Cubes": 1000 };
  const walked = all.filter(function (t) { return t.name in runs; }), recounted = all.filter(function (t) { return t.name in big; });
  return [function () { checkArcsine(flat[0], 100000); }, function () { checkFlatDisk(ball, 100000); }].concat(
    [flat[0], ball].map(function (t) { return function () { checkBallAway(t, 50000); }; }),
    [2, 3].flatMap(function (dims) { return [0.25, 0.9].map(function (q) { return function () { checkReturn(dims, q, 100000); }; }); }),
    walked.map(function (t) { return function () { checkSmallSteps(make, t, 5, runs[t.name]); }; }),
    walked.map(function (t) { return function () { checkEpsilon(make, t, 5, runs[t.name]); }; }),
    all.map(function (t) { return function () { checkGaps(t, t.name === "Your star" ? 12 : 2000); }; }),
    recounted.map(function (t) { return function () { checkBigTileCluster(make, t, big[t.name]); }; }),
    recounted.map(function (t) { return function () { checkTileCoupling(make, t, 200, 50); }; }));
}

runChecksOnClick(allTests);
