/* =====================================================================
   internal-discrete-dla-check.js  —  tests for the growth in
   internal-discrete-dla-growth.js and the cluster in js/sim-cluster.js
   ---------------------------------------------------------------------
   Each test runs the growth (newInternalDLA) directly, with fixed seeds,
   and adds a row to the results table (addRow, js/check-page.js):
     1. Exact laws of small clusters, worked out from the walk's Green's
        function in each cluster, against many runs (Pearson's
        chi-square test): on the line, the grids, other tilings of the
        plane (a Penrose tiling among them) and of space.
     2. The line: the exact laws against the formulas on the sim page,
        the chance (L + 1) / (n + 1) of growing on the right and
        E[D_n^2] = (n + 1) / 3.
     3. A big cluster, recounted plainly: its cells are all different,
        each touches an earlier one, and its distances, farthest cell
        and nearest edge cell are right.
     4. Jumps against plain steps: clusters grown both ways have the
        same law (a two-sample chi-square test).
     5. Coupling: more particles only add cells.
   ===================================================================== */

// The lattices tested, as newInternalDLA's options, with "small" the
// number of particles whose exact law is tested (it has many more
// possible clusters as it grows).
function testLattices() {
  return [
    { name: "Z (1D)", options: { dim: 1 }, small: 8 },
    { name: "Z² (2D squares)", options: { dim: 2 }, small: 4 },
    { name: "Z³ (3D cubes)", options: { dim: 3, block: honeycombBlock(22, "polyhedra") }, small: 3 },
    { name: "Triangles (3⁶), tiles", options: { dim: 2, tiling: tilingBlock("3/m30/r(h2)", false) }, small: 3 },
    { name: "Snub hexagonal (3⁴.6), corners", options: { dim: 2, tiling: tilingBlock("6-3-3/r60/r(h5)", true) }, small: 3 },
    { name: "Penrose rhombs (P3), tiles", options: { dim: 2, tiling: penrosePlane(null, tilingBlock("Penrose P3", false)) }, small: 3 },
    { name: "3D #1, polyhedra", options: { dim: 3, block: honeycombBlock(1, "polyhedra") }, small: 3 },
    { name: "3D #12, faces", options: { dim: 3, block: honeycombBlock(12, "faces") }, small: 3 },
  ];
}

// A growth with these options and seed, grown to n particles.
function grown(options, seed, n) {
  const growth = newInternalDLA(Object.assign({ seed: seed }, options));
  while (growth.cluster.count < n) if (!growth.addParticle()) break;
  return growth;
}


/* =====================================================================
   1. EXACT LAWS OF SMALL CLUSTERS
   ---------------------------------------------------------------------
   From a cluster A (holding the origin), let G(x) be the average number
   of visits to x in A before the walk from the origin leaves A (its
   Green's function in A: G. Lawler and V. Limic, "Random Walk: A Modern
   Introduction", Cambridge University Press, 2010, Section 4.6). Each
   visit to z goes on to each neighbor with chance 1 / deg(z), so
       G(x) = [x is the origin] + the sum of G(z) / deg(z) over the
              moves from z in A to x,
   a small linear system, solved here by Gaussian elimination (not the
   sim's conjugate gradients). The walk leaves A at y, outside, with
   chance the sum of G(z) / deg(z) over the moves from z in A to y; then
   y joins. Starting from A(1) = {origin}, that gives the exact law of
   A(n), one particle at a time.
   ===================================================================== */

// Where the walk from the origin first leaves the sites "inside" (the
// origin first), as a list of [site, chance].
function exitChances(lattice, inside) {
  const m = inside.length, index = new Map();
  inside.forEach(function (s, i) { index.set(siteKey(lattice, s), i); });
  // The system: row x says G(x) - sum of G(z) / deg(z) over moves z -> x = [x = origin].
  const rows = inside.map(function (s, i) {
    const row = new Array(m + 1).fill(0);
    row[i] = 1;
    row[m] = i === 0 ? 1 : 0;
    return row;
  });
  inside.forEach(function (z, a) {
    const near = neighborsOf(lattice, z);
    for (const x of near) {
      const b = index.get(siteKey(lattice, x));
      if (b !== undefined) rows[b][a] -= 1 / near.length;
    }
  });
  const G = gaussianSolve(rows);
  const exits = new Map();
  inside.forEach(function (z, a) {
    const near = neighborsOf(lattice, z);
    for (const y of near) {
      const key = siteKey(lattice, y);
      if (index.has(key)) continue;
      if (!exits.has(key)) exits.set(key, [y, 0]);
      exits.get(key)[1] += G[a] / near.length;
    }
  });
  return Array.from(exits.values());
}

// The exact law of A(n): a Map from each possible cluster's setKey to
// { sites, chance }.
function exactLaw(lattice, n) {
  const origin = newSite(0, 0, 0, 0);
  let law = new Map([[setKey(lattice, [origin]), { sites: [origin], chance: 1 }]]);
  for (let m = 1; m < n; m++) {
    const next = new Map();
    for (const { sites, chance } of law.values()) {
      for (const [y, p] of exitChances(lattice, sites)) {
        const bigger = sites.concat([y]), key = setKey(lattice, bigger);
        if (!next.has(key)) next.set(key, { sites: bigger, chance: 0 });
        next.get(key).chance += chance * p;
      }
    }
    law = next;
  }
  return law;
}

// The clusters of many runs against the exact law of A(n).
function checkSmallLaw(t, runs) {
  const lattice = latticeFor(t.options);
  if (!lattice.periodic) lattice.reaches([0, 0], 10);   // (a Penrose plane: room for the walks)
  const law = exactLaw(lattice, t.small), odds = new Map();
  let total = 0;
  for (const [key, { chance }] of law) { odds.set(key, chance); total += chance; }
  const seen = new Map();
  for (let r = 0; r < runs; r++) {
    const key = setKey(lattice, clusterSites(grown(t.options, "law " + r, t.small)));
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const test = exactOddsTest(odds, seen, runs, "clusters");
  addRow(t.name + ": the law of A(" + t.small + ")", test.pass && Math.abs(total - 1) < 1e-9,
         test.text + "; the exact chances add up to 1 " + (Math.abs(total - 1) < 1e-9 ? "" : "NOT ") + "(" + fourDigits(total) + ")");
}


/* =====================================================================
   2. THE LINE
   ---------------------------------------------------------------------
   The formulas of "On the line" in All the details: from the interval
   {-L, ..., R} with n = L + R + 1 cells, the walk leaves on the right
   with chance (L + 1) / (n + 1), and D = R - L has E[D_n^2] = (n + 1) / 3
   for n >= 2. Both against the exact laws above.
   ===================================================================== */
function checkLine(most) {
  const lattice = gridLattice(1);
  let worstRight = 0, worstSquare = 0;
  for (let n = 1; n <= most; n++) {
    let square = 0;
    for (const { sites, chance } of exactLaw(lattice, n).values()) {
      const L = -Math.min(...sites.map(function (s) { return s.I; })), R = Math.max(...sites.map(function (s) { return s.I; }));
      square += chance * (R - L) * (R - L);
      for (const [y, p] of exitChances(lattice, sites)) {
        if (y.I > 0) worstRight = Math.max(worstRight, Math.abs(p - (L + 1) / (n + 1)));
      }
    }
    if (n >= 2) worstSquare = Math.max(worstSquare, Math.abs(square - (n + 1) / 3));
  }
  addRow("The line: the chance of growing on the right is (L + 1)/(n + 1)", worstRight < 1e-12,
         "every interval of up to " + most + " cells: the exact chance is at most " + fourDigits(worstRight) + " from the formula");
  addRow("The line: E[D²] = (n + 1)/3 for n ≥ 2", worstSquare < 1e-9,
         "n = 2 to " + most + ": at most " + fourDigits(worstSquare) + " from the formula");
}


/* =====================================================================
   3. A BIG CLUSTER, RECOUNTED
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
    before.add(key);
    const far = distanceBetween(lattice.placeOf(s.I, s.J, s.K, s.k), start);
    if (Math.abs(far - c.distance[i]) > 1e-9) problem = "cell " + i + "'s distance is wrong";
    farthest = Math.max(farthest, far);
  });
  if (Math.abs(farthest - c.farthest) > 1e-9) problem = "the farthest distance is wrong";
  const edge = plainEdge(lattice, sites);
  let nearest = Infinity;
  for (const y of edge) nearest = Math.min(nearest, distanceBetween(lattice.placeOf(y.I, y.J, y.K, y.k), start));
  if (Math.abs(nearest - c.nearestEdge()) > 1e-9) problem = "the nearest edge cell is " + fourDigits(nearest) + ", not " + fourDigits(c.nearestEdge());
  addRow(t.name + ": a cluster of " + n.toLocaleString() + " particles, recounted", !problem,
         problem || "all different, each touching an earlier one; farthest " + fourDigits(farthest) + ", nearest edge cell " +
                    fourDigits(nearest) + " (" + edge.length.toLocaleString() + " edge cells); " +
                    growth.steps.toLocaleString() + " steps and " + growth.jumps.toLocaleString() + " jumps");
}


/* =====================================================================
   4. JUMPS AGAINST PLAIN STEPS
   ---------------------------------------------------------------------
   The same number of particles, grown many times with jumps and many
   times with plain steps only (different random numbers): the outer
   radius and the sum of the cells' distances must have the same law
   (twoSampleChiSquare, js/check-page.js).
   ===================================================================== */
function checkJumps(t, n, runs) {
  const stats = { jumps: { outer: [], sum: [] }, plain: { outer: [], sum: [] } };
  let jumpsMade = 0;
  for (const way of ["jumps", "plain"]) {
    for (let r = 0; r < runs; r++) {
      const growth = grown(Object.assign({ plainSteps: way === "plain" }, t.options), way + " " + r, n);
      stats[way].outer.push(growth.cluster.farthest);
      stats[way].sum.push(growth.cluster.distance.reduce(function (x, y) { return x + y; }, 0));
      if (way === "jumps") jumpsMade += growth.jumps;
    }
  }
  const outer = twoSampleChiSquare(stats.jumps.outer, stats.plain.outer), sum = twoSampleChiSquare(stats.jumps.sum, stats.plain.sum);
  addRow(t.name + ": " + n + " particles with jumps and with plain steps", outer.pValue > 0.001 && sum.pValue > 0.001 && jumpsMade > 0,
         runs + " runs each way (" + jumpsMade.toLocaleString() + " jumps): the outer radius, chi-square " + outer.statistic.toFixed(1) +
         " with " + outer.degrees + " degrees of freedom, p = " + outer.pValue.toFixed(3) + "; the sum of the distances, chi-square " +
         sum.statistic.toFixed(1) + " with " + sum.degrees + ", p = " + sum.pValue.toFixed(3));
}


/* =====================================================================
   5. COUPLING
   ---------------------------------------------------------------------
   Particle p walks with its own random numbers, so with the same seed,
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
  const lattices = testLattices();
  const bigSize = { "Z (1D)": 2000, "Z² (2D squares)": 20000, "Z³ (3D cubes)": 5000, "Penrose rhombs (P3), tiles": 2000 };
  const jumpSize = { "Z (1D)": 40, "Z² (2D squares)": 300, "Z³ (3D cubes)": 300, "Triangles (3⁶), tiles": 200,
                     "Snub hexagonal (3⁴.6), corners": 200, "3D #1, polyhedra": 200, "3D #12, faces": 500 };
  return [function () { checkLine(10); }].concat(
    lattices.map(function (t) { return function () { checkSmallLaw(t, 20000); }; }),
    lattices.map(function (t) { return function () { checkBigCluster(t, bigSize[t.name] || 3000); }; }),
    lattices.filter(function (t) { return jumpSize[t.name]; }).map(function (t) {
      return function () { checkJumps(t, jumpSize[t.name], 600); };
    }),
    lattices.map(function (t) { return function () { checkCoupling(t, 500, 200); }; }));
}

runChecksOnClick(allTests);
