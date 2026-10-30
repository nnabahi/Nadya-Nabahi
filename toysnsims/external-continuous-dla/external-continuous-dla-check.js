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
     3. Jumps against small steps: particles that jump across circles
        (spheres) land with the same law as particles that follow
        Brownian motion in small steps, on a small cluster of each tile.
     4. Epsilon: the landing law doesn't change as epsilon shrinks, and
        the jumps grow like log(1 / epsilon).
     5. The gap between two tiles (copyGap) against a plain answer, and
        the slide into contact.
     6. A big cluster, recounted plainly: every tile touches an earlier
        one, and no two overlap.
     7. Coupling: more particles only add tiles.
   ===================================================================== */

// The tiles tested: tilePolygon (in the plane) or tilePolyhedron (in
// space, js/sim-tile-shape.js) of these shapes, written as tests of
// points, the way readShape makes them from the formulas of the sim's
// presets. Each has, where there is one, a plain way to the gap between
// two copies (plainGap(d), the copies' centers d apart) and to how deep
// they go into each other (deepest(d): the smallest ruler value of a
// point of one inside the other, as in tilePolygon; below 1, they
// overlap).
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

// A growth of these tiles with this seed (and any other options),
// grown to n particles.
function grown(t, seed, n, more) {
  const growth = newExternalContinuousDLA(Object.assign({ dim: t.dims, tile: t.shape, seed: seed }, more));
  while (growth.cluster.count < n) growth.addParticle();
  return growth;
}

// The centers of a growth's tiles, as [x, y] (in space [x, y, z]) each.
function centersOf(growth) {
  const c = growth.cluster;
  return c.x.map(function (x, i) { return c.z.length > 0 ? [x, c.y[i], c.z[i]] : [x, c.y[i]]; });
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
   3. JUMPS AGAINST SMALL STEPS
   ---------------------------------------------------------------------
   From the same small cluster, particles that jump across circles
   (spheres: walk on spheres) and particles that follow Brownian motion
   in small steps (the growth's smallSteps option: each step normal,
   with standard deviation a fifth of the room around the particle)
   must land with the same law. Compared by where they land
   (landingNumbers), each number by twoSampleChiSquare
   (js/check-page.js).
   ===================================================================== */

// Where a particle landed, as numbers: its direction from the cluster's
// middle (in the plane, its angle; in space, its angle around the z
// axis and the cosine of its angle from it) and its distance from it.
const LANDING_NUMBERS = { 2: ["the angle", "the distance"], 3: ["the angle", "the height", "the distance"] };
function landingNumbers(place, middle) {
  const off = place.map(function (x, d) { return x - middle[d]; }), r = Math.hypot(...off);
  return off.length === 2 ? [Math.atan2(off[1], off[0]), r] : [Math.atan2(off[1], off[0]), off[2] / r, r];
}

// Particles 0 to runs - 1 landing on the cluster of the tiles at
// "tiles": the landing numbers of each, as one list per number, and
// the moves (jumps or small steps) per particle.
function landingsOn(t, tiles, seed, runs, more) {
  const growth = newExternalContinuousDLA(Object.assign({ dim: t.dims, tile: t.shape, seed: seed, seedTiles: tiles }, more));
  const middle = [0, 1, 2].slice(0, t.dims).map(function (d) { return tiles.reduce(function (s, q) { return s + q[d]; }, 0) / tiles.length; });
  const lists = LANDING_NUMBERS[t.dims].map(function () { return []; });
  for (let p = 0; p < runs; p++) landingNumbers(growth.land(p), middle).forEach(function (v, k) { lists[k].push(v); });
  return { lists: lists, moves: growth.jumps / runs };
}

// Two lists of landings compared, number by number: { pass, text }.
function sameLandings(a, b, dims) {
  const tests = a.lists.map(function (list, k) { return twoSampleChiSquare(list, b.lists[k]); });
  return {
    pass: tests.every(function (x) { return x.pValue > 0.001; }),
    text: tests.map(function (x, k) { return LANDING_NUMBERS[dims][k] + ", p = " + x.pValue.toFixed(3); }).join("; "),
  };
}

function checkSmallSteps(t, n, runs) {
  const tiles = centersOf(grown(t, "small cluster", n));
  const jumps = landingsOn(t, tiles, "jumps", runs), steps = landingsOn(t, tiles, "small steps", runs, { smallSteps: true });
  const test = sameLandings(jumps, steps, t.dims);
  addRow(t.name + ": jumps against small steps, " + n + " tiles", test.pass,
         runs + " particles each way: " + test.text + " (" + fourDigits(jumps.moves) + " jumps against " + fourDigits(steps.moves) +
         " small steps per particle)");
}


/* =====================================================================
   4. EPSILON
   ---------------------------------------------------------------------
   A particle stops within epsilon tile radii of touching, then slides
   into contact. Landings with the largest and the smallest epsilon
   below must have the same law (sameLandings), and the jumps per
   particle grow like log(1 / epsilon) (I. Binder and M. Braverman,
   "The rate of convergence of the walk on spheres algorithm", Geom.
   Funct. Anal. 22 (2012) 558-587, Theorem 2 and Corollary 3, in the
   plane and in space): each hundredfold smaller epsilon adds about the
   same number of jumps (here: within a factor of 2, where a power of
   1 / epsilon would multiply them). That is a statement about small
   epsilon, so it is tested from 1e-4 down. For the star, the first
   hundredfold adds many more jumps, probably because at that scale its
   edge still bends sharply (where its arms meet, T's edge curves with
   radius 1/48, about 0.014 tile radii).
   ===================================================================== */
const EPSILONS = [1e-2, 1e-4, 1e-6, 1e-8, 1e-10];

function checkEpsilon(t, n, runs) {
  const tiles = centersOf(grown(t, "small cluster", n));
  const landings = EPSILONS.map(function (epsilon) { return landingsOn(t, tiles, "epsilon " + epsilon, runs, { epsilon: epsilon }); });
  const perParticle = landings.map(function (l) { return l.moves; });
  const test = sameLandings(landings[0], landings[landings.length - 1], t.dims);
  const steps = perParticle.slice(1).map(function (j, k) { return j - perParticle[k]; }), small = steps.slice(1);
  const even = Math.max(...small) < 2 * Math.min(...small) && Math.min(...small) > 0;
  addRow(t.name + ": epsilon", test.pass && even,
         "landings at epsilon " + EPSILONS[0] + " and " + EPSILONS[EPSILONS.length - 1] + ", " + runs + " each: " + test.text +
         "; jumps per particle at epsilon " + EPSILONS.join(", ") + ": " + perParticle.map(fourDigits).join(", ") +
         " (each hundredfold adds " + steps.map(fourDigits).join(", ") + ")");
}


/* =====================================================================
   5. THE GAP BETWEEN TWO TILES
   ---------------------------------------------------------------------
   copyGap's gap against a plain answer, the tile's plainGap:
     - disks and balls, squares and cubes: the gap between the true
       shapes, by formula (ballGap, boxGap);
     - the star: the smallest distance from a corner of one polygon to
       an edge of the other, both ways, over all of them (two polygons
       that don't overlap are that far apart), and 0 when a corner of
       one is inside the other (polygonGap);
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
function ballDeepest(d) { return Math.max(0, Math.hypot(...d) - 1); }
function boxDeepest(d) { return Math.max(...d.map(function (x) { return Math.max(0, Math.abs(x) - 1); })); }

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

// The smallest ruler value of a corner of the tile at (dx, dy) inside
// the tile at 0, and of a corner of the tile at 0 inside the one at
// (dx, dy): below 1, the tiles overlap.
function deepestCorner(s, dx, dy) {
  let least = Infinity;
  for (let i = 0; i < s.M; i++) {
    least = Math.min(least, s.gauge(dx + s.px[i], dy + s.py[i]), s.gauge(s.px[i] - dx, s.py[i] - dy));
  }
  return least;
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


/* =====================================================================
   6. A BIG CLUSTER, RECOUNTED PLAINLY
   ---------------------------------------------------------------------
   Every tile after the first must touch an earlier one (its gap to the
   nearest earlier tile 0, up to rounding), so the cluster is connected;
   no two tiles may overlap (deepest, as in 5); and the farthest center
   and the radius of gyration must be what they are.
   ===================================================================== */
function checkBigCluster(t, n) {
  const growth = grown(t, "big cluster", n), c = growth.cluster, s = t.shape, gaps = copyGap(s), reach = 2 * s.rhoMax;
  const centers = centersOf(growth), far = function (a, b) { return a.some(function (x, d) { return Math.abs(x - b[d]) > reach; }); };
  let worstTouch = 0, deepest = Infinity, farthest = 0;
  centers.forEach(function (a, i) {
    let nearest = i === 0 ? 0 : Infinity;
    centers.forEach(function (b, j) {
      if (j === i || far(a, b)) return;
      if (j < i) nearest = Math.min(nearest, gaps.gap(a, b, nearest));
      if (j > i) deepest = Math.min(deepest, t.deepest(a.map(function (x, d) { return x - b[d]; })));
    });
    worstTouch = Math.max(worstTouch, nearest);
    farthest = Math.max(farthest, Math.hypot(...a));
  });
  const middle = [0, 1, 2].slice(0, t.dims).map(function (d) { return centers.reduce(function (sum, a) { return sum + a[d]; }, 0) / c.count; });
  const squares = centers.reduce(function (sum, a) { return sum + a.reduce(function (s2, x, d) { return s2 + (x - middle[d]) ** 2; }, 0); }, 0);
  const gyration = Math.sqrt(squares / c.count), numbersOff = Math.max(Math.abs(farthest - c.farthest), Math.abs(gyration - c.gyration()));
  addRow(t.name + ": a cluster of " + n + " particles, recounted", c.count === n && worstTouch < 1e-9 * s.rhoMax &&
         deepest > 1 - 1e-9 && numbersOff < 1e-9 * farthest,
         c.count + " tiles; each touches an earlier one (the largest gap " + fourDigits(worstTouch) + "); no point of a tile inside " +
         "another by more than " + fourDigits(Math.max(0, 1 - deepest)) + " of its size; the farthest center and the radius of gyration " +
         fourDigits(numbersOff) + " off");
}


/* =====================================================================
   7. COUPLING
   ===================================================================== */
function checkCoupling(t, n, more) {
  const small = centersOf(grown(t, "coupling", n)), big = centersOf(grown(t, "coupling", n + more));
  const other = centersOf(grown(t, "another seed", n));
  const same = small.every(function (a, i) { return a.every(function (x, d) { return x === big[i][d]; }); });
  const differ = other.some(function (a, i) { return a[0] !== small[i][0]; });
  addRow(t.name + ": more particles only add tiles", same && differ,
         "the first " + n + " tiles of " + (n + more) + " particles " + (same ? "are" : "are NOT") + " the cluster of " + n +
         "; another seed " + (differ ? "gives another cluster" : "gives the SAME cluster"));
}


function allTests() {
  const flat = testTiles(2), space = testTiles(3), all = flat.concat(space), ball = space[0];
  // How many particles each tile's landings use, and its big cluster.
  const runs = { "Disks": 20000, "Squares": 20000, "Your star": 1000, "Balls": 10000, "Cubes": 10000, "Tetrahedra": 3000 };
  const big = { "Disks": 3000, "Squares": 3000, "Your star": 500, "Balls": 2000, "Cubes": 1000 };
  const walked = all.filter(function (t) { return t.name in runs; }), recounted = all.filter(function (t) { return t.name in big; });
  return [function () { checkArcsine(flat[0], 100000); }, function () { checkFlatDisk(ball, 100000); }].concat(
    [flat[0], ball].map(function (t) { return function () { checkBallAway(t, 50000); }; }),
    [2, 3].flatMap(function (dims) { return [0.25, 0.9].map(function (q) { return function () { checkReturn(dims, q, 100000); }; }); }),
    walked.map(function (t) { return function () { checkSmallSteps(t, 5, runs[t.name]); }; }),
    walked.map(function (t) { return function () { checkEpsilon(t, 5, runs[t.name]); }; }),
    all.map(function (t) { return function () { checkGaps(t, t.name === "Your star" ? 12 : 2000); }; }),
    recounted.map(function (t) { return function () { checkBigCluster(t, big[t.name]); }; }),
    recounted.map(function (t) { return function () { checkCoupling(t, 200, 50); }; }));
}

runChecksOnClick(allTests);
