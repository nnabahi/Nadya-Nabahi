/* =====================================================================
   external-continuous-dla-check.js  —  tests for the growth in
   external-continuous-dla-growth.js, the gaps between tiles in
   js/sim-tile-shape.js and Brownian motion in js/sim-continuum.js
   ---------------------------------------------------------------------
   Each test runs the growth (newExternalContinuousDLA) directly, with
   fixed seeds, and adds a row to the results table (addRow,
   js/check-page.js):
     1. The arcsine law: Brownian motion from infinity lands on a
        segment with a law known exactly. This tests the launch, the
        return, the jumps, the epsilon stop and the slide together.
     2. The Brownian return: the angles it brings particles back at,
        against the Poisson kernel (checkReturn, js/check-page.js).
     3. Jumps against small steps: particles that jump across circles
        land with the same law as particles that follow Brownian motion
        in small steps, on a small cluster of each tile.
     4. Epsilon: the landing law doesn't change as epsilon shrinks, and
        the jumps grow like log(1 / epsilon).
     5. The gap between two tiles (copyGap) against a plain search, and
        the slide into contact.
     6. A big cluster, recounted plainly: every tile touches an earlier
        one, and no two overlap.
     7. Coupling: more particles only add tiles.
   ===================================================================== */

// The tiles tested: tilePolygon (js/sim-tile-shape.js) of these shapes,
// written as tests of points, the way readShape makes them from the
// formulas of the sim's presets.
function testTiles() {
  return [
    { name: "Disks", shape: tilePolygon(function (x, y) { return x * x + y * y <= 1; }) },
    { name: "Squares", shape: tilePolygon(function (x, y) { return Math.max(Math.abs(x), Math.abs(y)) <= 1; }) },
    { name: "Your star", shape: tilePolygon(function (x, y) { return Math.hypot(x, y) <= 1 + 0.5 * Math.cos(5 * Math.atan2(y, x)); }) },
  ];
}

// A growth of these tiles with this seed (and any other options),
// grown to n particles.
function grown(t, seed, n, more) {
  const growth = newExternalContinuousDLA(Object.assign({ dim: 2, tile: t.shape, seed: seed }, more));
  while (growth.cluster.count < n) growth.addParticle();
  return growth;
}

// The centers of a growth's tiles, as [x, y] each.
function centersOf(growth) {
  const c = growth.cluster;
  return c.x.map(function (x, i) { return [x, c.y[i]]; });
}


/* =====================================================================
   1. THE ARCSINE LAW
   ---------------------------------------------------------------------
   Brownian motion from infinity first reaches the segment from -1 to 1
   at x with density 1 / (π sqrt(1 - x^2)): the map
   z -> (z + 1/z) / 2 takes the outside of the unit circle onto the
   outside of the segment, and the point e^{iθ} to cos θ; Brownian
   motion from infinity reaches the circle at a uniform θ, and the map
   carries Brownian motion to Brownian motion (P. Morters and Y. Peres,
   "Brownian Motion", Cambridge University Press, 2010, Theorem 7.20).
   So the distribution function is 1/2 + arcsin(x) / π. (In potential
   theory, the harmonic measure from infinity of a compact set is its
   equilibrium measure, and this is the segment's: T. Ransford,
   "Potential Theory in the Complex Plane", Cambridge University Press,
   1995, Chapter 4.)
   Here the cluster is the segment itself (the growth's seedShape), and
   the particle a point on its own: landings of particles 0, 1, 2, ...,
   none added, counted in 20 equal pieces of [-1, 1].
   ===================================================================== */
const ARCSINE_PIECES = 20;

// The segment as a seedShape: its gap from a place, and the slide onto it.
function segmentSeed() {
  const seed = { reach: 1, slide: [0, 0] };
  seed.gap = function (place) {
    seed.slide[0] = Math.min(1, Math.max(-1, place[0])) - place[0];
    seed.slide[1] = -place[1];
    return Math.hypot(seed.slide[0], seed.slide[1]);
  };
  return seed;
}

function checkArcsine(runs) {
  const growth = newExternalContinuousDLA({ dim: 2, tile: testTiles()[0].shape, seed: "arcsine", seedShape: segmentSeed() });
  const seen = new Map(), odds = new Map();
  let off = 0;
  for (let p = 0; p < runs; p++) {
    const [x, y] = growth.land(p);
    off = Math.max(off, Math.abs(y), Math.abs(x) - 1);
    const piece = Math.min(ARCSINE_PIECES - 1, Math.floor((x + 1) / 2 * ARCSINE_PIECES));
    seen.set(piece, (seen.get(piece) || 0) + 1);
  }
  const F = function (x) { return 0.5 + Math.asin(Math.min(1, Math.max(-1, x))) / Math.PI; };
  for (let b = 0; b < ARCSINE_PIECES; b++) odds.set(b, F(-1 + 2 * (b + 1) / ARCSINE_PIECES) - F(-1 + 2 * b / ARCSINE_PIECES));
  const test = exactOddsTest(odds, seen, runs, "pieces of the segment");
  addRow("The arcsine law on a segment", test.pass && off < 1e-12,
         test.text + "; every landing at most " + fourDigits(off) + " off the segment; " +
         fourDigits(growth.jumps / runs) + " jumps and " + fourDigits(growth.returns / runs) + " returns per particle");
}


/* =====================================================================
   2. THE BROWNIAN RETURN
   ---------------------------------------------------------------------
   A particle that gets outside the launch circle is brought back to it
   the way Brownian motion would come back (js/sim-continuum.js). The
   test, checkReturn, is in js/check-page.js, since External Discrete
   DLA's check page runs it too.
   ===================================================================== */


/* =====================================================================
   3. JUMPS AGAINST SMALL STEPS
   ---------------------------------------------------------------------
   From the same small cluster, particles that jump across circles (walk
   on spheres) and particles that follow Brownian motion in small steps
   (the growth's smallSteps option: each step normal, with standard
   deviation a fifth of the room around the particle) must land with
   the same law. Compared by where they land: the angle of the landing
   center around the cluster's middle, and its distance from it
   (twoSampleChiSquare, js/check-page.js).
   ===================================================================== */
function checkSmallSteps(t, n, runs) {
  const tiles = centersOf(grown(t, "small cluster", n));
  const middle = [0, 1].map(function (d) { return tiles.reduce(function (s, q) { return s + q[d]; }, 0) / tiles.length; });
  const landed = function (seed, small) {
    const growth = newExternalContinuousDLA({ dim: 2, tile: t.shape, seed: seed, seedTiles: tiles, smallSteps: small });
    const angles = [], distances = [];
    for (let p = 0; p < runs; p++) {
      const [x, y] = growth.land(p);
      angles.push(Math.atan2(y - middle[1], x - middle[0]));
      distances.push(Math.hypot(x - middle[0], y - middle[1]));
    }
    return { angles: angles, distances: distances, moves: growth.jumps / runs };
  };
  const jumps = landed("jumps", false), steps = landed("small steps", true);
  const angle = twoSampleChiSquare(jumps.angles, steps.angles), distance = twoSampleChiSquare(jumps.distances, steps.distances);
  addRow(t.name + ": jumps against small steps, " + n + " tiles", angle.pValue > 0.001 && distance.pValue > 0.001,
         runs + " particles each way: the angle, chi-square " + angle.statistic.toFixed(1) + " with " + angle.degrees +
         " degrees of freedom, p = " + angle.pValue.toFixed(3) + "; the distance, p = " + distance.pValue.toFixed(3) +
         " (" + fourDigits(jumps.moves) + " jumps against " + fourDigits(steps.moves) + " small steps per particle)");
}


/* =====================================================================
   4. EPSILON
   ---------------------------------------------------------------------
   A particle stops within epsilon tile radii of touching, then slides
   into contact. Landings with the largest and the smallest epsilon
   below must have the same law (twoSampleChiSquare), and the jumps per
   particle grow like log(1 / epsilon) (I. Binder and M. Braverman,
   "The rate of convergence of the walk on spheres algorithm", Geom.
   Funct. Anal. 22 (2012) 558-587, Theorem 2 and Corollary 3): each
   hundredfold smaller epsilon adds about the same number of jumps
   (here: within a factor of 2, where a power of 1 / epsilon would
   multiply them). That is a statement about small epsilon, so it is
   tested from 1e-4 down. For the star, the first hundredfold adds many
   more jumps, probably because at that scale its edge still bends
   sharply (where its arms meet, T's edge curves with radius 1/48,
   about 0.014 tile radii).
   ===================================================================== */
const EPSILONS = [1e-2, 1e-4, 1e-6, 1e-8, 1e-10];

function checkEpsilon(t, n, runs) {
  const tiles = centersOf(grown(t, "small cluster", n)), angles = [], perParticle = [];
  for (const epsilon of EPSILONS) {
    const growth = newExternalContinuousDLA({ dim: 2, tile: t.shape, seed: "epsilon " + epsilon, seedTiles: tiles, epsilon: epsilon });
    const list = [];
    for (let p = 0; p < runs; p++) { const [x, y] = growth.land(p); list.push(Math.atan2(y, x)); }
    angles.push(list);
    perParticle.push(growth.jumps / runs);
  }
  const test = twoSampleChiSquare(angles[0], angles[angles.length - 1]);
  const steps = perParticle.slice(1).map(function (j, k) { return j - perParticle[k]; }), small = steps.slice(1);
  const even = Math.max(...small) < 2 * Math.min(...small) && Math.min(...small) > 0;
  addRow(t.name + ": epsilon", test.pValue > 0.001 && even,
         "landings at epsilon " + EPSILONS[0] + " and " + EPSILONS[EPSILONS.length - 1] + ", " + runs + " each: p = " +
         test.pValue.toFixed(3) + "; jumps per particle at epsilon " + EPSILONS.join(", ") + ": " +
         perParticle.map(fourDigits).join(", ") + " (each hundredfold adds " + steps.map(fourDigits).join(", ") + ")");
}


/* =====================================================================
   5. THE GAP BETWEEN TWO TILES
   ---------------------------------------------------------------------
   copyGap's gap(dx, dy) against a plain answer: for disks and squares,
   the gap between the true shapes, by formula; for the star, the
   smallest distance from a corner of one polygon to an edge of the
   other, both ways, over all of them (two polygons that don't overlap
   are that far apart), and 0 when a corner of one is inside the other
   (by its ruler: gauge < 1). Then the slide: the tile moved by it must
   touch (gap 0) and overlap by no more than rounding.
   ===================================================================== */
function plainGap(t, dx, dy) {
  const s = t.shape;
  if (t.name === "Disks") return Math.max(0, Math.hypot(dx, dy) - 2);
  if (t.name === "Squares") {
    const ax = Math.abs(dx) - 2, ay = Math.abs(dy) - 2;
    return ax <= 0 || ay <= 0 ? Math.max(0, ax, ay) : Math.hypot(ax, ay);
  }
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

function checkGaps(t, offsets) {
  const gaps = copyGap(t.shape), random = seededUniform("gaps " + t.name), reach = 2 * t.shape.rhoMax;
  let worst = 0, worstSlide = 0, deepest = Infinity, touching = 0;
  for (let i = 0; i < offsets; i++) {
    const angle = 2 * Math.PI * random.uniform(i, 0), r = reach * (0.5 + 1.2 * random.uniform(i, 1));
    const dx = r * Math.cos(angle), dy = r * Math.sin(angle);
    const gap = gaps.gap(dx, dy, Infinity), plain = plainGap(t, dx, dy);
    worst = Math.max(worst, Math.abs(gap - plain));
    if (gap > 0) {
      // The slide moves the tile at (dx, dy) until it touches.
      const sx = dx + gaps.slide[0], sy = dy + gaps.slide[1];
      worstSlide = Math.max(worstSlide, Math.abs(plainGap(t, sx, sy)), Math.abs(Math.hypot(gaps.slide[0], gaps.slide[1]) - gap));
      deepest = Math.min(deepest, deepestCorner(t.shape, sx, sy));
      touching++;
    }
  }
  const scale = t.shape.rhoMax;
  addRow(t.name + ": the gap between two tiles", worst < 1e-9 * scale && worstSlide < 1e-9 * scale && deepest > 1 - 1e-9,
         offsets + " offsets: the gap at most " + fourDigits(worst) + " from the plain one; " + touching +
         " slid into contact: their gap at most " + fourDigits(worstSlide) + " (and each slide as long as the gap), " +
         "and no corner inside the other tile by more than " + fourDigits(Math.max(0, 1 - deepest)) + " of its size");
}


/* =====================================================================
   6. A BIG CLUSTER, RECOUNTED PLAINLY
   ---------------------------------------------------------------------
   Every tile after the first must touch an earlier one (its gap to the
   nearest earlier tile 0, up to rounding), so the cluster is connected;
   no two tiles may overlap (no corner of one inside another, by its
   ruler; for disks, no two centers closer than 2); and the farthest
   center and the radius of gyration must be what they are.
   ===================================================================== */
function checkBigCluster(t, n) {
  const growth = grown(t, "big cluster", n), c = growth.cluster, s = t.shape, gaps = copyGap(s), reach = 2 * s.rhoMax;
  let worstTouch = 0, deepest = Infinity, farthest = 0;
  for (let i = 0; i < c.count; i++) {
    let nearest = i === 0 ? 0 : Infinity;
    for (let j = 0; j < c.count; j++) {
      const dx = c.x[i] - c.x[j], dy = c.y[i] - c.y[j];
      if (j === i || Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      if (j < i) nearest = Math.min(nearest, gaps.gap(dx, dy, nearest));
      if (j > i) deepest = Math.min(deepest, s.round ? Math.hypot(dx, dy) / reach : deepestCorner(s, dx, dy));
    }
    worstTouch = Math.max(worstTouch, nearest);
    farthest = Math.max(farthest, Math.hypot(c.x[i], c.y[i]));
  }
  const mx = c.x.reduce(function (a, b) { return a + b; }, 0) / c.count, my = c.y.reduce(function (a, b) { return a + b; }, 0) / c.count;
  let squares = 0;
  for (let i = 0; i < c.count; i++) squares += (c.x[i] - mx) ** 2 + (c.y[i] - my) ** 2;
  const gyration = Math.sqrt(squares / c.count), numbersOff = Math.max(Math.abs(farthest - c.farthest), Math.abs(gyration - c.gyration()));
  addRow(t.name + ": a cluster of " + n + " particles, recounted", c.count === n && worstTouch < 1e-9 * s.rhoMax &&
         deepest > 1 - 1e-9 && numbersOff < 1e-9 * farthest,
         c.count + " tiles; each touches an earlier one (the largest gap " + fourDigits(worstTouch) + "); " +
         (s.round ? "the closest two centers " + fourDigits(deepest * reach) + " apart (2: touching)"
                  : "no corner inside another tile by more than " + fourDigits(Math.max(0, 1 - deepest)) + " of its size") +
         "; the farthest center and the radius of gyration " + fourDigits(numbersOff) + " off");
}


/* =====================================================================
   7. COUPLING
   ===================================================================== */
function checkCoupling(t, n, more) {
  const small = grown(t, "coupling", n).cluster, big = grown(t, "coupling", n + more).cluster;
  const other = grown(t, "another seed", n).cluster;
  let same = true;
  for (let i = 0; i < n; i++) if (small.x[i] !== big.x[i] || small.y[i] !== big.y[i]) same = false;
  const differ = other.x.some(function (x, i) { return x !== small.x[i]; });
  addRow(t.name + ": more particles only add tiles", same && differ,
         "the first " + n + " tiles of " + (n + more) + " particles " + (same ? "are" : "are NOT") + " the cluster of " + n +
         "; another seed " + (differ ? "gives another cluster" : "gives the SAME cluster"));
}


function allTests() {
  const tiles = testTiles();
  const runs = { "Disks": 20000, "Squares": 20000, "Your star": 1000 };
  const big = { "Disks": 3000, "Squares": 3000, "Your star": 500 };
  return [function () { checkArcsine(100000); }].concat(
    [0.25, 0.9].map(function (q) { return function () { checkReturn(2, q, 100000); }; }),
    tiles.map(function (t) { return function () { checkSmallSteps(t, 5, runs[t.name]); }; }),
    tiles.map(function (t) { return function () { checkEpsilon(t, 5, runs[t.name]); }; }),
    tiles.map(function (t) { return function () { checkGaps(t, t.name === "Your star" ? 12 : 2000); }; }),
    tiles.map(function (t) { return function () { checkBigCluster(t, big[t.name]); }; }),
    tiles.map(function (t) { return function () { checkCoupling(t, 200, 50); }; }));
}

runChecksOnClick(allTests);
