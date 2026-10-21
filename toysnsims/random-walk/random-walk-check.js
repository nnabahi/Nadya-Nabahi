/* =====================================================================
   random-walk-check.js  —  tests for the walk in random-walk-rule.js
   ---------------------------------------------------------------------
   Each test runs the walk (newWalk) or its shape functions directly,
   with fixed seeds, and adds a row to the results table (addRow,
   js/check-page.js):
     1. The steps' directions come up as often as the weights say
        (Pearson's chi-square test).
     2. Coupling: nudging one weight changes only a few steps.
     3. The numbers the walk keeps step by step (range, returns,
        largest distance, lowest and highest site) match a plain
        recount from its path.
     4. The convex hull: shapes worked out by hand, and the walk's hull
        (kept up to date as it goes) = the hull of every visited site.
     5. The holes: beta_1 from holeHistory = a plain count at every step.
     6. The outer boundary: shapes worked out by hand.
     7. Known answers for the simple random walk: the mean number of
        returns by step 20 in 1D, and E|S_n|^2 = n in 2D and 3D.
     8. Other tilings (2D), the Penrose tilings among them: each step
        goes to a neighbor, all equally likely; the numbers kept and the
        hull, recounted; the holes, against Euler's formula at every
        step and against a count that uses only the polygons (not the
        tiling's lists of neighbors). And on a Penrose tiling, the walk
        stops at the edge of its plane.
   ===================================================================== */


// Walk "steps" steps; returns the walk and its path, a list of [x, y, z].
function walkPath(options, steps) {
  const w = newWalk(options), path = [[0, 0, 0]];
  for (let n = 0; n < steps; n++) {
    w.step();
    path.push([w.x, w.y, w.z]);
  }
  return { walk: w, path: path };
}

// The direction number of each step of a path (in the walk's order:
// +x, -x, +y, -y, +z, -z).
function directionsOf(path) {
  const out = [];
  for (let n = 1; n < path.length; n++) {
    const d = [0, 1, 2].map(function (c) { return path[n][c] - path[n - 1][c]; });
    const axis = d.findIndex(function (v) { return v !== 0; });
    out.push(2 * axis + (d[axis] > 0 ? 0 : 1));
  }
  return out;
}

// The z-score of a sample's mean against the exact mean "exact"
// (with the sample's own standard deviation).
function meanZ(values, exact) {
  const n = values.length, mean = values.reduce(function (a, b) { return a + b; }, 0) / n;
  const variance = values.reduce(function (a, v) { return a + (v - mean) ** 2; }, 0) / (n - 1);
  return { mean: mean, z: (mean - exact) / Math.sqrt(variance / n) };
}


/* ===================================================================
   1. HOW OFTEN EACH DIRECTION COMES UP
   =================================================================== */
function checkDirections(dim, weights, steps) {
  const { path } = walkPath({ dim: dim, weights: weights, seed: "directions " + weights }, steps);
  const total = weights.reduce(function (a, b) { return a + b; }, 0);
  const odds = new Map(weights.map(function (w, k) { return [k, w / total]; }));
  const seen = new Map();
  for (const k of directionsOf(path)) seen.set(k, (seen.get(k) || 0) + 1);
  const test = pooledChiSquare(odds, seen, steps);
  addRow(dim + "D, weights " + weights.join(", ") + ": how often each direction comes up, " + steps.toLocaleString() + " steps",
         test.pValue > 0.001, "chi-square " + test.statistic.toFixed(2) + " on " + test.degrees + " degrees of freedom, p = " + test.pValue.toFixed(3) +
         (weights.includes(0) ? "; directions of weight 0: " + (weights.some(function (w, k) { return w === 0 && seen.get(k); }) ? "used!" : "never used") : ""));
}


/* ===================================================================
   2. COUPLING
   =================================================================== */
function checkCoupling() {
  const steps = 20000;
  const a = directionsOf(walkPath({ dim: 2, weights: [1, 1, 1, 1], seed: "coupling" }, steps).path);
  const b = directionsOf(walkPath({ dim: 2, weights: [1.1, 1, 1, 1], seed: "coupling" }, steps).path);
  let changed = 0;
  for (let n = 0; n < steps; n++) if (a[n] !== b[n]) changed++;
  // The cuts move from 0.25, 0.5, 0.75 to 1.1/4.1, 2.1/4.1, 3.1/4.1:
  // a step changes when u_n falls between the old and new cut.
  const expected = Math.abs(1.1 / 4.1 - 0.25) + Math.abs(2.1 / 4.1 - 0.5) + Math.abs(3.1 / 4.1 - 0.75);
  const z = binomialZ(changed, steps, expected);
  addRow("Coupling: same seed, the right weight 1 -> 1.1 (2D), " + steps.toLocaleString() + " steps", Math.abs(z) < 4,
         changed + " steps changed (" + (100 * changed / steps).toFixed(2) + "%; the cuts moved by " + (100 * expected).toFixed(2) + "% in all, z = " + z.toFixed(2) + ")");
}


/* ===================================================================
   3. THE NUMBERS KEPT STEP BY STEP
   =================================================================== */
function checkKept(dim, weights, steps) {
  const { walk, path } = walkPath({ dim: dim, weights: weights, seed: "kept " + dim }, steps);
  const keys = new Set(path.map(function (p) { return p.join(","); }));
  let returns = 0, largest = 0, low = 0, high = 0;
  path.forEach(function (p, n) {
    if (n > 0 && p.every(function (v) { return v === 0; })) returns++;
    largest = Math.max(largest, Math.hypot(p[0], p[1], p[2]));
    low = Math.min(low, p[0]); high = Math.max(high, p[0]);
  });
  const problems = [];
  if (walk.siteX.length !== keys.size) problems.push("range " + walk.siteX.length + " vs " + keys.size);
  if (walk.returns !== returns) problems.push("returns " + walk.returns + " vs " + returns);
  if (Math.abs(walk.maxDistance - largest) > 1e-9) problems.push("largest distance " + walk.maxDistance + " vs " + largest);
  if (dim === 1 && (walk.lowest !== low || walk.highest !== high)) problems.push("lowest/highest");
  addRow(dim + "D, weights " + weights.join(", ") + ": range, returns, largest distance" + (dim === 1 ? ", lowest and highest" : "") + ", " + steps.toLocaleString() + " steps",
         problems.length === 0, problems.join("; ") || "kept step by step = recounted from the path (range " + keys.size + ", returns " + returns + ")");
}


/* ===================================================================
   4. THE CONVEX HULL
   =================================================================== */
function checkHullByHand() {
  // A 4 x 3 rectangle of points (0..3 by 0..2), inside points too:
  // perimeter 2 (3 + 2) = 10, area 6, 4 corners. Points on a line:
  // the flat hull [a, b], perimeter twice the length.
  const box = [];
  for (let x = 0; x <= 3; x++) for (let y = 0; y <= 2; y++) box.push([x, y]);
  const h = convexHull(box), line = convexHull([[0, 0], [1, 1], [2, 2], [3, 3]]);
  const pass = h.length === 4 && polygonPerimeter(h) === 10 && polygonArea(h) === 6 &&
    line.length === 2 && Math.abs(polygonPerimeter(line) - 6 * Math.SQRT2) < 1e-12 && polygonArea(line) === 0;
  addRow("Convex hull by hand: a 4 x 3 rectangle of points, and points on a line", pass,
         "rectangle: " + h.length + " corners, perimeter " + polygonPerimeter(h) + " (10), area " + polygonArea(h) +
         " (6); line: perimeter " + polygonPerimeter(line).toFixed(4) + " (6 sqrt 2 = " + (6 * Math.SQRT2).toFixed(4) + ")");
}

function checkWalkHull(weights, steps) {
  const { walk, path } = walkPath({ dim: 2, weights: weights, seed: "hull" + weights }, steps);
  const all = convexHull(path.map(function (p) { return [p[0], p[1]]; }));
  const quick = walkHull(walk);
  const pass = Math.abs(quick.perimeter - polygonPerimeter(all)) < 1e-9 && Math.abs(quick.area - polygonArea(all)) < 1e-9;
  addRow("2D, weights " + weights.join(", ") + ": the hull kept up to date, " + steps.toLocaleString() + " steps",
         pass, "perimeter " + niceNumber(quick.perimeter) + ", area " + niceNumber(quick.area) +
         (pass ? ", the same as the hull of every visited site" : "; every site gives " + niceNumber(polygonPerimeter(all)) + ", " + niceNumber(polygonArea(all))));
}


/* ===================================================================
   5. THE HOLES
   =================================================================== */
function checkHoles(steps) {
  const w = newWalk({ dim: 2, weights: [1, 1, 1, 1], seed: "holes" });
  const counted = [0];
  for (let n = 1; n <= steps; n++) {
    w.step();
    counted.push(countHoles(w.siteX.map(function (x, i) { return [x, w.siteY[i]]; })));
  }
  const h = holeHistory(w, w.steps);
  const beta = bettiOverTime(h, counted.map(function (c, t) { return t; }));
  let problem = "";
  for (let t = 0; t <= steps && !problem; t++) {
    if (beta[t] !== counted[t]) problem = "step " + t + ": " + beta[t] + " from the births and deaths, " + counted[t] + " counted";
  }
  const sizes = h.holeSizes.reduce(function (a, b) { return a + b; }, 0);
  if (!problem && sizes !== h.holeCells.length / 2) problem = "hole sizes add up to " + sizes + ", not " + h.holeCells.length / 2 + " squares";
  addRow("Holes: 2D simple random walk, up to " + steps.toLocaleString() + " steps", problem === "",
         problem || "beta_1 matches a plain count at every step (" + counted[steps] + " holes at the end), and the hole sizes add up");
}


/* ===================================================================
   6. THE OUTER BOUNDARY
   =================================================================== */
function checkFrontierByHand() {
  // A plus of 5 squares: 12 sides outside. A ring of 8 squares around
  // an empty middle (a hole): 12 outside (the 4 inside sides don't count).
  const plus = { siteX: [0, 1, -1, 0, 0], siteY: [0, 0, 0, 1, -1] };
  const ring = { siteX: [], siteY: [] };
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) if (x || y) { ring.siteX.push(x); ring.siteY.push(y); }
  const a = frontierLength(plus), b = frontierLength(ring);
  addRow("Outer boundary by hand: a plus of 5 squares, and a ring of 8 around a hole", a === 12 && b === 12,
         "plus " + a + " (12), ring " + b + " (12: the hole's 4 sides don't count)");
}


/* ===================================================================
   7. KNOWN ANSWERS
   =================================================================== */
function checkReturns1D(runs, steps) {
  // E(returns by step n) = sum over k <= n/2 of binom(2k, k) / 4^k.
  let exact = 0, p = 1;
  for (let k = 1; k <= steps / 2; k++) { p *= (2 * k - 1) / (2 * k); exact += p; }
  const counts = [];
  for (let r = 0; r < runs; r++) counts.push(walkPath({ dim: 1, weights: [1, 1], seed: "returns " + r }, steps).walk.returns);
  const { mean, z } = meanZ(counts, exact);
  addRow("1D simple random walk: mean returns to 0 by step " + steps + ", " + runs.toLocaleString() + " walks", Math.abs(z) < 4,
         "mean " + mean.toFixed(4) + ", exact " + exact.toFixed(4) + " (z = " + z.toFixed(2) + ")");
}

function checkSquareDistance(dim, runs, steps) {
  const squares = [];
  for (let r = 0; r < runs; r++) {
    const w = walkPath({ dim: dim, weights: new Array(2 * dim).fill(1), seed: "square " + dim + " " + r }, steps).walk;
    squares.push(w.distance * w.distance);
  }
  const { mean, z } = meanZ(squares, steps);
  addRow(dim + "D simple random walk: mean of |S_n|^2 at n = " + steps + ", " + runs.toLocaleString() + " walks", Math.abs(z) < 4,
         "mean " + mean.toFixed(2) + ", exact n = " + steps + " (z = " + z.toFixed(2) + ")");
}


/* ===================================================================
   8. OTHER TILINGS
   =================================================================== */

// The tilings these tests walk on: a name, its code, and whether its
// corners are the cells (tilingBlock, js/sim-tilings.js). Each has cells
// with different numbers of neighbors, or (snub hexagonal) no mirror;
// the Penrose tilings (js/sim-penrose.js) never repeat.
const TEST_TILINGS = [
  { name: "Truncated square (4.8²), tiles", code: "8-4/m90/r(h4)", corners: false },
  { name: "Kagome (3.6.3.6), corners", code: "6-3-6/m30/r(v4)", corners: true },
  { name: "3⁶; 3².6², tiles", code: "3-6/m30/r(h2)", corners: false },
  { name: "Snub hexagonal (3⁴.6), corners", code: "6-3-3/r60/r(h5)", corners: true },
  { name: "Penrose pentagons, stars, boats and diamonds (P1), tiles", code: "Penrose P1", corners: false },
  { name: "Penrose kites and darts (P2), corners", code: "Penrose P2", corners: true },
  { name: "Penrose rhombs (P3), tiles", code: "Penrose P3", corners: false },
];

// A walk of "steps" steps on one of TEST_TILINGS, and its path.
function tilingWalk(t, seed, steps) {
  return walkPath({ dim: 2, tiling: tilingBlock(t.code, t.corners), seed: seed + " " + t.code }, steps);
}

// Each step goes to one of the cell's neighbors (the cells across its
// sides, each once: a pentagon of Penrose's P1 in a star's notch shares
// two sides with it), each equally likely: a chi-square test for each
// kind of cell, added up (on a Penrose tiling, where every cell is
// different, for the cells with each number of neighbors). And each
// step's two cells have a side in common (found from their polygons,
// not from the list).
function checkTilingSteps(t, steps) {
  const { walk, path } = tilingWalk(t, "neighbors", steps);
  const cells = walk.tiling.cells;
  // seen[k][j]: how often a step from a cell of kind k went to its neighbor number j.
  const near = cells.map(cellNeighbors);
  const kindOf = function (k) { return walk.tiling.finite ? near[k].length : k; };
  const seen = new Map();
  let problem = "";
  for (let n = 1; n < path.length && !problem; n++) {
    const [x0, y0, k] = path[n - 1], [x1, y1, z] = path[n];
    const j = near[k].findIndex(function ([z2, dx, dy]) { return z2 === z && dx === x1 - x0 && dy === y1 - y0; });
    const before = sideKeysAt(walk.tiling, x0, y0, k), shared = sideKeysAt(walk.tiling, x1, y1, z).filter(function (key) { return before.includes(key); });
    if (j === -1) problem = "step " + n + " doesn't go to a neighbor in the list";
    else if (shared.length === 0) problem = "step " + n + "'s two cells have no side in common";
    else {
      if (!seen.has(kindOf(k))) seen.set(kindOf(k), new Array(near[k].length).fill(0));
      seen.get(kindOf(k))[j]++;
    }
  }
  let statistic = 0, degrees = 0;
  for (const counts of seen.values()) {
    const total = counts.reduce(function (a, b) { return a + b; }, 0);
    if (total < 5 * counts.length) continue;    // (too few visits to test)
    const test = equalChiSquare(counts);
    statistic += test.statistic;
    degrees += test.degrees;
  }
  const pValue = 1 - jStat.chisquare.cdf(statistic, degrees);
  addRow(t.name + ": each step to a neighbor across a side, all equally likely, " + steps.toLocaleString() + " steps",
         !problem && pValue > 0.001,
         problem || "chi-square " + statistic.toFixed(2) + " on " + degrees + " degrees of freedom (" + seen.size +
                    (walk.tiling.finite ? " numbers of neighbors" : " kinds of cell") + "), p = " + pValue.toFixed(3));
}

// The numbers kept step by step, and the hull from the lines of cells,
// against a recount from the path.
function checkTilingKept(t, steps) {
  const { walk, path } = tilingWalk(t, "kept", steps);
  const start = middleAt(walk.tiling, 0, 0, 0);
  const keys = new Set(path.map(function (p) { return p.join(","); }));
  let returns = 0, largest = 0;
  path.forEach(function (p, n) {
    if (n > 0 && p[0] === 0 && p[1] === 0 && p[2] === 0) returns++;
    const [u, w] = middleAt(walk.tiling, ...p);
    largest = Math.max(largest, Math.hypot(u - start[0], w - start[1]));
  });
  const problems = [];
  if (walk.siteX.length !== keys.size) problems.push("range " + walk.siteX.length + " vs " + keys.size);
  if (walk.returns !== returns) problems.push("returns " + walk.returns + " vs " + returns);
  if (Math.abs(walk.maxDistance - largest) > 1e-9) problems.push("largest distance " + walk.maxDistance + " vs " + largest);
  addRow(t.name + ": range, returns, largest distance, " + steps.toLocaleString() + " steps", problems.length === 0,
         problems.join("; ") || "kept step by step = recounted from the path (range " + keys.size + ", returns " + returns + ", largest distance " + niceNumber(largest) + ")");

  const all = convexHull(Array.from(keys, function (key) { return middleAt(walk.tiling, ...key.split(",").map(Number)); }));
  const quick = walkHull(walk);
  const pass = Math.abs(quick.perimeter - polygonPerimeter(all)) < 1e-9 && Math.abs(quick.area - polygonArea(all)) < 1e-9;
  addRow(t.name + ": the hull kept up to date, " + steps.toLocaleString() + " steps",
         pass, "perimeter " + niceNumber(quick.perimeter) + ", area " + niceNumber(quick.area) +
         (pass ? ", the same as the hull of every visited cell's middle" : "; every cell gives " + niceNumber(polygonPerimeter(all)) + ", " + niceNumber(polygonArea(all))));
}

// The holes on a tiling, two ways. At every step, beta_1 from
// holeHistory's births and deaths = beta_1 by Euler's formula
// (eulerCounter, js/check-page.js: the visited cells K_n are connected).
// At the end, the holes, their cells and sizes, and the outer boundary
// = those found from the polygons alone (holesFromPolygons,
// js/check-page.js).
function checkTilingHoles(t, steps) {
  const { walk } = tilingWalk(t, "holes", steps);
  const h = holeHistory(walk, walk.steps);
  const beta = bettiOverTime(h, Array.from({ length: steps + 1 }, function (_, step) { return step; }));
  const counter = eulerCounter(walk.tiling);
  let i = 0, most = 0, problem = "";
  for (let step = 0; step <= steps && !problem; step++) {
    for (; i < walk.siteX.length && walk.bornAt[i] === step; i++) counter.add(walk.siteX[i], walk.siteY[i], walk.siteZ[i]);
    const euler = counter.holes();
    most = Math.max(most, euler);
    if (euler !== beta[step]) problem = "step " + step + ": " + beta[step] + " from the births and deaths, " + euler + " by Euler's formula";
  }
  addRow(t.name + ": holes against Euler's formula at every step, " + steps.toLocaleString() + " steps", problem === "",
         problem || "beta_1 = 1 - V + E - F at every step (at most " + most + " holes, " + h.openBirths.length + " at the end)");

  const plain = holesFromPolygons(walk);
  const ours = new Set();
  for (let k = 0; k < h.holeCells.length; k += 3) ours.add(h.holeCells[k] + "," + h.holeCells[k + 1] + "," + h.holeCells[k + 2]);
  const sizes = function (list) { return Array.from(list).sort(function (a, b) { return a - b; }).join(" "); };
  const frontier = frontierLength(walk), problems = [];
  if (plain.sizes.length !== h.openBirths.length) problems.push(plain.sizes.length + " holes from the polygons, " + h.openBirths.length + " open");
  if (sizes(plain.sizes) !== sizes(h.holeSizes)) problems.push("hole sizes " + sizes(h.holeSizes) + " vs " + sizes(plain.sizes));
  if (ours.size !== plain.cells.size || [...ours].some(function (key) { return !plain.cells.has(key); })) problems.push("the holes' cells differ");
  if (frontier !== plain.frontier) problems.push("outer boundary " + frontier + " vs " + plain.frontier);
  addRow(t.name + ": holes and outer boundary from the polygons alone, after " + steps.toLocaleString() + " steps", problems.length === 0,
         problems.join("; ") || plain.sizes.length + " holes (" + ours.size + " cells), outer boundary " + frontier + " sides, the same both ways");
}

// On a Penrose tiling, the walk grows its plane as it goes, and stops
// where the plane can't grow any more (PENROSE_PLANE_MOST,
// js/sim-penrose.js): at the first cell within 10 of the plane's edge
// (it needs 8 around it, and its neighbors' 2 more). So it stops
// between 10 and 8 from the edge (a step goes less than 2).
function checkPenroseEdge() {
  const w = newWalk({ dim: 2, tiling: tilingBlock("Penrose P3", false), seed: "edge" });
  while (!w.atEdge && w.steps < 500000) w.step();
  const [x, y] = w.tiling.cells[w.z].middle, out = Math.max(Math.abs(x), Math.abs(y));
  const missing = w.siteZ.filter(function (z) { return w.tiling.cells[z].next.some(function ([k]) { return k < 0; }); }).length;
  const pass = w.atEdge && w.tiling.X === PENROSE_PLANE_MOST && out > PENROSE_PLANE_MOST - 10 && out <= PENROSE_PLANE_MOST - 8 && missing === 0;
  addRow("Penrose rhombs (P3): the walk grows its plane, and stops at the edge", pass,
         "stopped at step " + w.steps.toLocaleString() + ", " + niceNumber(out) + " from the middle (the plane reaches " + w.tiling.X +
         "); " + w.tiling.cells.length.toLocaleString() + " cells built, and every visited cell has all its neighbors" +
         (missing ? " but " + missing : ""));
}

function allTests() {
  return [
    function () { checkDirections(1, [1, 1], 20000); },
    function () { checkDirections(2, [3, 1, 2, 0.5], 20000); },
    function () { checkDirections(2, [1, 0, 1, 1], 20000); },
    function () { checkDirections(3, [1, 1, 1, 1, 1, 1], 30000); },
    function () { checkDirections(3, [0.2, 1, 4, 1, 2.5, 0.7], 30000); },
    checkCoupling,
    function () { checkKept(1, [1, 1], 5000); },
    function () { checkKept(2, [1, 1, 1, 1], 5000); },
    function () { checkKept(2, [2, 1, 1, 1.5], 5000); },
    function () { checkKept(3, [1, 1, 1, 1, 1, 1], 5000); },
    checkHullByHand,
    function () { checkWalkHull([1, 1, 1, 1], 20000); },
    function () { checkWalkHull([1.5, 1, 1, 2], 20000); },
    function () { checkHoles(1500); },
    checkFrontierByHand,
    function () { checkReturns1D(4000, 20); },
    function () { checkSquareDistance(2, 4000, 50); },
    function () { checkSquareDistance(3, 4000, 50); },
  ].concat(...TEST_TILINGS.map(function (t) {
    return [
      function () { checkTilingSteps(t, 20000); },
      function () { checkTilingKept(t, 5000); },
      function () { checkTilingHoles(t, 3000); },
    ];
  }), checkPenroseEdge);
}

runChecksOnClick(allTests);
