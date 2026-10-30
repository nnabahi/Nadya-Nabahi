/* =====================================================================
   external-discrete-dla-check.js  —  tests for the growth in
   external-discrete-dla-growth.js and the cluster in js/sim-cluster.js
   ---------------------------------------------------------------------
   Each test runs the growth (newExternalDLA) directly, with fixed seeds,
   and adds a row to the results table (addRow, js/check-page.js):
     1. The exact landing law on the square grid: where a walker from
        infinity first reaches a cluster, worked out from the walk's
        potential kernel, against many walkers (Pearson's chi-square
        test). This tests the launch circle and the Brownian return,
        the sim's one approximation, against the exact answer.
     2. The Brownian return: the angles it brings walkers back at,
        against the Poisson kernels they come from.
     3. Jumps against plain steps: walkers land with the same law either
        way (a two-sample chi-square test), on every kind of lattice.
     4. The launch circle on the other lattices, where no exact answer
        is known here: walkers launched at the default distance land
        with the same law as walkers launched 4 times farther.
     5. The search for the nearest edge site (roomAt, js/sim-cluster.js)
        against a plain search of every edge site.
     6. A big cluster, recounted plainly.
     7. Coupling: more particles only add cells.
   ===================================================================== */

// The lattices tested, as newExternalDLA's options.
function testLattices() {
  return [
    { name: "Z² (2D squares)", options: { dim: 2 } },
    { name: "Triangles (3⁶), tiles", options: { dim: 2, tiling: tilingBlock("3/m30/r(h2)", false) } },
    { name: "Snub hexagonal (3⁴.6), corners", options: { dim: 2, tiling: tilingBlock("6-3-3/r60/r(h5)", true) } },
    { name: "Penrose rhombs (P3), tiles", options: { dim: 2, tiling: penrosePlane(null, tilingBlock("Penrose P3", false)) } },
    { name: "Z³ (3D cubes)", options: { dim: 3, block: honeycombBlock(22, "polyhedra") } },
    { name: "3D #1, polyhedra", options: { dim: 3, block: honeycombBlock(1, "polyhedra") } },
    { name: "3D #12, faces", options: { dim: 3, block: honeycombBlock(12, "faces") } },
  ];
}

// A growth with these options (and the default launch distance, unless
// they say otherwise) and seed, grown to n particles.
function grown(options, seed, n) {
  const growth = newExternalDLA(Object.assign({ launch: DEFAULT_LAUNCH, seed: seed }, options));
  while (growth.cluster.count < n) if (!growth.addParticle()) break;
  return growth;
}

// A growth's cluster as seedCells, for a growth that starts from it.
function asSeedCells(growth) {
  return clusterSites(growth).map(function (s) { return [s.I, s.J, s.K, s.k]; });
}


/* =====================================================================
   1. THE EXACT LANDING LAW ON THE SQUARE GRID
   ---------------------------------------------------------------------
   The potential kernel of the walk on Z² is
       a(x) = the sum over n >= 0 of [P(S_n = 0) - P(S_n = x)]
   for the walk S from the origin (F. Spitzer, "Principles of Random
   Walk", 2nd ed., Springer, 1976, Section 12; G. Lawler and V. Limic,
   "Random Walk: A Modern Introduction", Cambridge University Press,
   2010, Section 4.4). Off the origin it is the average of its 4
   neighbors, and at the origin that average is a(0) + 1 = 1, so
   a(1, 0) = 1. Along the diagonal (Spitzer, Section 15)
       a(n, n) = (4/π) (1 + 1/3 + 1/5 + ... + 1/(2n - 1)),
   and every other value follows from the averages, band by band:
       a(n + 1, n) = 2 a(n, n) - a(n, n - 1)            (at (n, n))
       a(d, 0) = 4 a(d - 1, 0) - a(d - 2, 0) - 2 a(d - 1, 1)
       a(n + d, n) = 4 a(n + d - 1, n) - a(n + d - 2, n)
                     - a(n + d - 1, n + 1) - a(n + d - 1, n - 1)
   (a is the same under swapping and negating the coordinates). Done
   in floating point this loses about a digit per band (it solves
   Laplace's equation outward, which magnifies every error), so it is
   done in whole numbers: each value times 10^100, with π to 100
   decimals, and divided back at the end.

   The landing law. Where a walker from infinity first reaches a finite
   set B of sites (its harmonic measure from infinity, H(y) for y in B;
   Spitzer, Section 11) is the one solution of
       the sum over y in B of a(x - y) H(y) = c, for every x in B,
       the sum over y in B of H(y) = 1,
   for some number c (Spitzer, Section 14). Why: let T be the first
   time the walk is in B. For x in B, a(z - x) - E_z[a(S_T - x)] is the
   same function of z for every x, since the difference of two of them
   is bounded, averages to itself off B and is 0 on B, so it is 0 (the
   walk reaches B for sure). As z goes to infinity, a(z - x) =
   (2/π) log|z| + a constant + o(1) whatever x is, and the law of S_T
   tends to H, so the sum over y of a(y - x) H(y) is the same for every
   x in B.

   In External DLA a walker stops on the first edge site it reaches, so
   the law of the next site to join is the harmonic measure from
   infinity of the edge.
   ===================================================================== */

// π to 100 decimals (checked against Machin's formula), as a whole
// number, and the scale the potential kernel is worked out in.
const PI_DIGITS = "31415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";
const KERNEL_SCALE = 10n ** 100n;

// The potential kernel, as a function a(x, y) of the site (x, y), for
// |x| and |y| at most "most".
function potentialKernel(most) {
  const pi = BigInt(PI_DIGITS), fourOverPi = 4n * KERNEL_SCALE * KERNEL_SCALE / pi;
  // big[m][n] is a(m, n) times 10^100, for 0 <= n <= m <= most.
  const big = Array.from({ length: most + 1 }, function (_, m) { return new Array(m + 1); });
  let sum = 0n;
  big[0][0] = 0n;
  for (let n = 1; n <= most; n++) {
    sum += fourOverPi / BigInt(2 * n - 1);
    big[n][n] = sum;
  }
  if (most >= 1) big[1][0] = KERNEL_SCALE;
  for (let n = 1; n + 1 <= most; n++) big[n + 1][n] = 2n * big[n][n] - big[n][n - 1];
  for (let d = 2; d <= most; d++) {
    big[d][0] = 4n * big[d - 1][0] - big[d - 2][0] - 2n * big[d - 1][1];
    for (let n = 1; n + d <= most; n++) {
      big[n + d][n] = 4n * big[n + d - 1][n] - big[n + d - 2][n] - big[n + d - 1][n + 1] - big[n + d - 1][n - 1];
    }
  }
  const shift = 10n ** 83n;
  const table = big.map(function (row) { return row.map(function (v) { return Number(v / shift) / 1e17; }); });
  return function (x, y) {
    const m = Math.max(Math.abs(x), Math.abs(y)), n = Math.min(Math.abs(x), Math.abs(y));
    return table[m][n];
  };
}

// The harmonic measure from infinity of the sites "points" of Z² (a
// list of [x, y], all different): the chance a walker from far away
// reaches each one first.
function harmonicFromInfinity(points) {
  const m = points.length;
  if (m === 1) return [1];
  let most = 0;
  for (const p of points) for (const q of points) most = Math.max(most, Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
  const a = potentialKernel(most);
  // Unknowns H(y) for each y, then c.
  const rows = points.map(function (p) {
    return points.map(function (q) { return a(p[0] - q[0], p[1] - q[1]); }).concat([-1, 0]);
  });
  rows.push(points.map(function () { return 1; }).concat([0, 1]));
  return gaussianSolve(rows).slice(0, m);
}

// The exact law of the site the next walker stops on, from a cluster of
// the square grid given as its sites: a Map from each edge site's key to
// its chance.
function exactLanding(lattice, sites) {
  const edge = plainEdge(lattice, sites);
  const H = harmonicFromInfinity(edge.map(function (s) { return [s.I, s.J]; }));
  return new Map(edge.map(function (s, i) { return [siteKey(lattice, s), H[i]]; }));
}

// Where walkers 0, 1, ..., runs - 1 of a growth with these options
// (and the default launch distance, unless they say otherwise) stop,
// without joining: a Map from each site's key to how many. With
// "jumps", the number of jumps they took is put there.
function landings(options, runs, jumps) {
  const growth = newExternalDLA(Object.assign({ launch: DEFAULT_LAUNCH }, options)), seen = new Map();
  for (let p = 0; p < runs; p++) {
    const key = siteKey(growth.lattice, growth.land(p));
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  if (jumps) jumps.made = growth.jumps;
  return seen;
}

// The potential kernel against the values known by hand (Spitzer,
// Section 15: a(1, 1) = 4/π, a(2, 0) = 4 - 8/π, a(2, 1) = 8/π - 1,
// a(2, 2) = 16/(3π), a(3, 0) = 17 - 48/π), the averages it was made
// from, everywhere up to 60, and far away against
//     a(x) = (2/π) log|x| + (2γ + log 8)/π + O(|x|^-2)
// (Lawler and Limic, Theorem 4.4.4; γ is Euler's constant), which it
// was not made from: within 0.001 for |x| >= 20.
function checkKernel() {
  const most = 60, a = potentialKernel(most), pi = Math.PI;
  const known = [[1, 1, 4 / pi], [2, 0, 4 - 8 / pi], [2, 1, 8 / pi - 1], [2, 2, 16 / (3 * pi)], [3, 0, 17 - 48 / pi]];
  let worstKnown = 0, worstAverage = 0, worstFar = 0;
  for (const [x, y, value] of known) worstKnown = Math.max(worstKnown, Math.abs(a(x, y) - value));
  const constant = (2 * 0.5772156649015329 + Math.log(8)) / pi;
  for (let x = -most + 1; x < most; x++) {
    for (let y = -most + 1; y < most; y++) {
      const average = (a(x + 1, y) + a(x - 1, y) + a(x, y + 1) + a(x, y - 1)) / 4;
      worstAverage = Math.max(worstAverage, Math.abs(average - a(x, y) - (x === 0 && y === 0 ? 1 : 0)));
      const r = Math.hypot(x, y);
      if (r >= 20) worstFar = Math.max(worstFar, Math.abs(a(x, y) - 2 / pi * Math.log(r) - constant));
    }
  }
  addRow("The potential kernel of Z²", worstKnown < 1e-14 && worstAverage < 1e-12 && worstFar < 1e-3,
         "a(1, 1), a(2, 0), a(2, 1), a(2, 2), a(3, 0) at most " + fourDigits(worstKnown) + " from their values by hand; " +
         "every a(x) up to 60 at most " + fourDigits(worstAverage) + " from the average of its neighbors (minus 1 at 0); " +
         "for |x| from 20 to 60, at most " + fourDigits(worstFar) + " from (2/π) log|x| + (2γ + log 8)/π");
}

// Three sites in a row, by hand: with h the chance of each end and
// 1 - 2h the middle's, the system says 2h = c (at the middle) and
// (1 - 2h) + (4 - 8/π) h = c (at an end), so h = π/8, and the middle
// gets 1 - π/4. (The ends are more exposed, and a walker reaches the
// middle first only from straight above or below.)
function checkThreeInARow() {
  const H = harmonicFromInfinity([[-1, 0], [0, 0], [1, 0]]);
  const off = Math.max(Math.abs(H[0] - Math.PI / 8), Math.abs(H[1] - (1 - Math.PI / 4)), Math.abs(H[2] - Math.PI / 8));
  addRow("The landing law of three sites in a row", off < 1e-14,
         "ends " + fourDigits(H[0]) + " and " + fourDigits(H[2]) + ", middle " + fourDigits(H[1]) +
         ": at most " + fourDigits(off) + " from π/8 and 1 - π/4");
}

// Walkers from infinity against the exact landing law, from a cluster
// of the square grid that starts as "cells" (as seedCells).
function checkLanding(name, cells, runs) {
  const lattice = gridLattice(2), odds = exactLanding(lattice, cells.map(function (c) { return newSite(...c); }));
  const seen = landings({ dim: 2, seed: "landing " + name, seedCells: cells }, runs);
  const test = exactOddsTest(odds, seen, runs, "edge sites");
  addRow("Z²: where walkers land on " + name, test.pass, test.text);
}


/* =====================================================================
   2. THE BROWNIAN RETURN
   ---------------------------------------------------------------------
   A walker farther than FAR_LAUNCHES launch radii is brought back to
   the launch circle (sphere) the way Brownian motion would come back
   (returnPoint2D and returnPoint3D, js/sim-continuum.js). Brownian
   motion from x, at distance r from the middle, first reaches the
   circle or sphere of radius R < r at y with density proportional to
   1 / |x - y|^d on it (d = 2, 3; the Poisson kernels for the outside of
   a disk and of a ball: P. Morters and Y. Peres, "Brownian Motion",
   Cambridge University Press, 2010, Chapter 3). In terms of the angle
   t between x and y, |x - y|^2 = r^2 + R^2 - 2 r R cos t. The samplers
   invert those laws in closed form; here the samples are counted in 20
   equal pieces (of the angle in 2D, of cos t in 3D, where the sphere's
   area is uniform in cos t), whose chances come from the densities by
   Simpson's rule, not from the closed forms.
   ===================================================================== */
const RETURN_PIECES = 20;

// The integral of f from a to b, by Simpson's rule with 200 pieces.
function simpson(f, a, b) {
  const n = 200, h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * f(a + i * h);
  return sum * h / 3;
}

// The chances of RETURN_PIECES equal pieces of [low, high], for the
// density proportional to f there, as a Map from piece to chance.
function pieceOdds(f, low, high) {
  const width = (high - low) / RETURN_PIECES, odds = new Map();
  let total = 0;
  for (let b = 0; b < RETURN_PIECES; b++) { odds.set(b, simpson(f, low + b * width, low + (b + 1) * width)); total += odds.get(b); }
  for (const b of odds.keys()) odds.set(b, odds.get(b) / total);
  return odds;
}

function pieceOf(v, low, high) { return Math.min(RETURN_PIECES - 1, Math.floor((v - low) / (high - low) * RETURN_PIECES)); }

// Brownian motion from distance r = R / q comes back to the circle (2D)
// or sphere (3D) of radius R = 1: its angles against the Poisson kernel,
// and in 3D the turn around the direction of x, which must be uniform.
function checkReturn(dims, q, runs) {
  const R = 1, r = R / q, random = seededUniform("return " + dims + " " + q);
  const toward = dims === 2 ? [Math.cos(0.7), Math.sin(0.7)] : [2 / 3, -1 / 3, 2 / 3];
  const place = toward.map(function (x) { return r * x; }), seen = new Map(), turns = new Array(RETURN_PIECES).fill(0);
  const [e1, e2] = dims === 3 ? perpendicularPair(toward) : [null, null];
  let offCircle = 0;
  for (let i = 0; i < runs; i++) {
    const y = dims === 2 ? returnPoint2D(place, R, random.uniform(i, 0)) : returnPoint3D(place, R, random.uniform(i, 0), random.uniform(i, 1));
    offCircle = Math.max(offCircle, Math.abs(Math.hypot(...y) - R));
    const dot = function (e) { return y.reduce(function (sum, v, d) { return sum + v * e[d]; }, 0) / R; };
    let piece;
    if (dims === 2) {
      const t = Math.atan2(y[1], y[0]) - 0.7, angle = t - 2 * Math.PI * Math.round(t / (2 * Math.PI));
      piece = pieceOf(angle, -Math.PI, Math.PI);
    } else {
      piece = pieceOf(dot(toward), -1, 1);
      turns[pieceOf(Math.atan2(dot(e2), dot(e1)), -Math.PI, Math.PI)]++;
    }
    seen.set(piece, (seen.get(piece) || 0) + 1);
  }
  const odds = dims === 2 ? pieceOdds(function (t) { return 1 / (r * r + R * R - 2 * r * R * Math.cos(t)); }, -Math.PI, Math.PI)
                          : pieceOdds(function (c) { return Math.pow(r * r + R * R - 2 * r * R * c, -1.5); }, -1, 1);
  const test = exactOddsTest(odds, seen, runs, "pieces of the " + (dims === 2 ? "angle" : "cosine"));
  const turn = dims === 3 ? equalChiSquare(turns) : { pValue: 1 };
  addRow((dims === 2 ? "2D" : "3D") + ": the return from " + fourDigits(r) + " launch radii", test.pass && turn.pValue > 0.001 && offCircle < 1e-9,
         test.text + (dims === 3 ? "; the turn around it, chi-square " + turn.statistic.toFixed(1) + " with " + turn.degrees +
                                   " degrees of freedom, p = " + turn.pValue.toFixed(3) : "") +
         "; every point at most " + fourDigits(offCircle) + " off the " + (dims === 2 ? "circle" : "sphere"));
}


/* =====================================================================
   3. JUMPS AGAINST PLAIN STEPS
   ---------------------------------------------------------------------
   From the same cluster, many walkers with jumps and many with plain
   steps only (other random numbers): where they land must have the
   same law (twoCountsChiSquare, js/check-page.js).
   ===================================================================== */
function checkJumps(t, n, runs) {
  const cells = asSeedCells(grown(t.options, "jumps cluster", n)), jumps = {};
  const withJumps = landings(Object.assign({ seed: "with jumps", seedCells: cells }, t.options), runs, jumps);
  const plain = landings(Object.assign({ seed: "plain steps", seedCells: cells, plainSteps: true }, t.options), runs);
  const test = twoCountsChiSquare(withJumps, plain);
  addRow(t.name + ": walkers with jumps and with plain steps, on " + n + " particles", test.pValue > 0.001 && jumps.made > 0,
         runs.toLocaleString() + " walkers each way (" + jumps.made.toLocaleString() + " jumps): where they land, chi-square " +
         test.statistic.toFixed(1) + " with " + test.degrees + " degrees of freedom, p = " + test.pValue.toFixed(3));
}


/* =====================================================================
   4. THE LAUNCH CIRCLE ON THE OTHER LATTICES
   ---------------------------------------------------------------------
   On Z² the walkers are tested against the exact law (part 1). On the
   other lattices, from the same cluster, walkers launched at the
   default distance and walkers launched FAR_TEST times farther must
   land with the same law, as far as this many walkers can tell. One of
   them is the hexagonal prisms (tiling #26 of space), where the walk's
   variance across is about 4 times its variance up and down, so far
   away it looks like a stretched Brownian motion, which would not meet
   the round launch sphere uniformly. The error still shrinks as the
   sphere grows (from far enough, where the walker starts hardly
   matters), and this tests that it is small at the default.
   ===================================================================== */
const FAR_TEST = 4;

function checkLaunch(t, n, runs) {
  const cells = asSeedCells(grown(t.options, "launch cluster", n)), far = FAR_TEST * DEFAULT_LAUNCH;
  const nearLandings = landings(Object.assign({ seed: "near launch", seedCells: cells }, t.options), runs);
  const farLandings = landings(Object.assign({ seed: "far launch", seedCells: cells, launch: far }, t.options), runs);
  const test = twoCountsChiSquare(nearLandings, farLandings);
  addRow(t.name + ": launched at " + DEFAULT_LAUNCH + " and at " + far + " reaches, on " + n + " particles",
         test.pValue > 0.001,
         runs.toLocaleString() + " walkers each way: where they land, chi-square " + test.statistic.toFixed(1) + " with " +
         test.degrees + " degrees of freedom, p = " + test.pValue.toFixed(3));
}


/* =====================================================================
   5. THE NEAREST EDGE SITE
   ---------------------------------------------------------------------
   roomAt(place, cap) must be the distance to the nearest edge site
   when that is below cap, and at least cap otherwise, and never more
   than the distance. Tested at places around a grown cluster (a site's
   middle, moved up to 10 longest moves in a random direction), with
   several caps, against every edge site's distance.
   ===================================================================== */
function checkRoom(t, n, places) {
  const growth = grown(t.options, "room", n), lattice = growth.lattice, c = growth.cluster;
  const edge = plainEdge(lattice, clusterSites(growth)).map(function (y) { return lattice.placeOf(y.I, y.J, y.K, y.k); });
  const L = lattice.longestMove, random = seededUniform("room places"), caps = [2 * L, 8 * L, Infinity];
  let problem = "", exact = 0;
  for (let i = 0; i < places && !problem; i++) {
    let j = 0;
    const draw = function () { return random.uniform(i, j++); };
    const middle = i % 2 === 0 ? edge[Math.floor(draw() * edge.length)]
                               : lattice.placeOf(c.I[i % c.count], c.J[i % c.count], c.K[i % c.count], c.k[i % c.count]);
    const shift = pointOnSphere(middle.length, 10 * L * draw(), draw);
    const place = middle.map(function (x, d) { return x + shift[d]; });
    let truth = Infinity;
    for (const p of edge) truth = Math.min(truth, distanceBetween(place, p));
    for (const cap of caps) {
      const room = c.roomAt(place, cap);
      if (room > truth + 1e-9) problem = "room " + fourDigits(room) + " is more than the distance " + fourDigits(truth);
      else if (truth < cap && Math.abs(room - truth) > 1e-9) problem = "room " + fourDigits(room) + ", distance " + fourDigits(truth) + ", cap " + fourDigits(cap);
      else if (truth >= cap && room < cap - 1e-9) problem = "room " + fourDigits(room) + " is below the cap " + fourDigits(cap);
      if (truth < cap) exact++;
    }
  }
  addRow(t.name + ": the nearest edge site, at " + places.toLocaleString() + " places", !problem,
         problem || "around a cluster of " + n + " particles (" + edge.length + " edge sites), with caps of 2 and 8 longest moves and none: " +
                    "right every time (" + exact.toLocaleString() + " times below the cap, so exactly the distance)");
}


/* =====================================================================
   6. A BIG CLUSTER, RECOUNTED
   ---------------------------------------------------------------------
   Its cells are all different, the first is the origin and each
   touches an earlier one; its distances and farthest cell are right;
   and its edge is the plain edge: every plain edge site is on it, and
   no cell of the cluster is.
   ===================================================================== */
function checkBigCluster(t, n) {
  const growth = grown(t.options, "big", n), lattice = growth.lattice, c = growth.cluster, sites = clusterSites(growth);
  const start = lattice.placeOf(0, 0, 0, 0);
  let problem = "";
  if (c.count !== n) problem = "it has " + c.count + " cells, not " + n;
  if (siteKey(lattice, sites[0]) !== siteKey(lattice, newSite(0, 0, 0, 0))) problem = "the first cell is not the origin";
  const before = new Set();
  let farthest = 0;
  sites.forEach(function (s, i) {
    const key = siteKey(lattice, s);
    if (before.has(key)) problem = "cell " + i + " is in it twice";
    if (i > 0 && !neighborsOf(lattice, s).some(function (y) { return before.has(siteKey(lattice, y)); })) {
      problem = "cell " + i + " touches no earlier cell";
    }
    if (!c.has(s) || c.onEdge(s)) problem = "cell " + i + " is not counted as a cell";
    before.add(key);
    const far = distanceBetween(lattice.placeOf(s.I, s.J, s.K, s.k), start);
    if (Math.abs(far - c.distance[i]) > 1e-9) problem = "cell " + i + "'s distance is wrong";
    farthest = Math.max(farthest, far);
  });
  if (Math.abs(farthest - c.farthest) > 1e-9) problem = "the farthest distance is wrong";
  const edge = plainEdge(lattice, sites);
  if (!edge.every(function (y) { return c.onEdge(y); })) problem = "an edge site is missing from the edge";
  addRow(t.name + ": a cluster of " + n.toLocaleString() + " particles, recounted", !problem,
         problem || "all different, each touching an earlier one; farthest " + fourDigits(farthest) + ", " +
                    edge.length.toLocaleString() + " edge sites, all on the edge; " + growth.steps.toLocaleString() +
                    " steps, " + growth.jumps.toLocaleString() + " jumps, " + growth.returns.toLocaleString() + " walkers brought back" +
                    (growth.replaced ? " (" + growth.replaced.toLocaleString() + " of them replaced)" : ""));
}


/* =====================================================================
   7. COUPLING
   ---------------------------------------------------------------------
   Walker p moves with its own random numbers, so with the same seed,
   n + m particles give the cluster of n particles plus m more cells,
   and another seed gives another cluster.
   ===================================================================== */
function checkCoupling(t, n, more) {
  const lattice = latticeFor(t.options);
  const small = clusterSites(grown(t.options, "coupling", n)), big = clusterSites(grown(t.options, "coupling", n + more));
  const other = clusterSites(grown(t.options, "another seed", n));
  const same = small.every(function (s, i) { return siteKey(lattice, s) === siteKey(lattice, big[i]); });
  const differ = setKey(lattice, small) !== setKey(lattice, other);
  addRow(t.name + ": more particles only add cells", same && differ,
         "the first " + n + " cells of " + (n + more) + " particles " + (same ? "are" : "are NOT") + " the cluster of " + n +
         "; another seed " + (differ ? "gives another cluster" : "gives the SAME cluster"));
}


function allTests() {
  const lattices = testLattices(), repeating = lattices.filter(function (t) { return !t.options.tiling || !t.options.tiling.finite; });
  const bigSize = { "Z² (2D squares)": 5000, "Z³ (3D cubes)": 3000, "Penrose rhombs (P3), tiles": 150 };
  const jumpRuns = { "3D #1, polyhedra": 3000, "3D #12, faces": 2000 };
  const launchTests = lattices.filter(function (t) { return ["Triangles (3⁶), tiles", "Snub hexagonal (3⁴.6), corners", "Z³ (3D cubes)"].includes(t.name); })
    .concat([{ name: "3D #26, hexagonal prisms", options: { dim: 3, block: honeycombBlock(26, "polyhedra") } }]);
  const seeds = [["one site", [[0, 0, 0, 0]]], ["two sites", [[0, 0, 0, 0], [1, 0, 0, 0]]],
                 ["an L of three sites", [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]]],
                 ["a cluster of 30 particles", asSeedCells(grown({ dim: 2 }, "thirty", 30))]];
  return [checkKernel, checkThreeInARow].concat(
    seeds.map(function ([name, cells]) { return function () { checkLanding(name, cells, 100000); }; }),
    [[2, 0.25], [2, 0.9], [3, 0.25], [3, 0.9]].map(function ([dims, q]) { return function () { checkReturn(dims, q, 100000); }; }),
    repeating.map(function (t) { return function () { checkJumps(t, 30, jumpRuns[t.name] || 5000); }; }),
    launchTests.map(function (t) { return function () { checkLaunch(t, 30, t.options.dim === 3 ? 5000 : 10000); }; }),
    repeating.map(function (t) { return function () { checkRoom(t, 300, 2000); }; }),
    lattices.map(function (t) { return function () { checkBigCluster(t, bigSize[t.name] || 2000); }; }),
    lattices.map(function (t) { return function () { checkCoupling(t, 200, 100); }; }));
}

runChecksOnClick(allTests);
