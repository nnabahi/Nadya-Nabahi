/* =====================================================================
   percolation-check.js  —  the tests on percolation-check.html
   ---------------------------------------------------------------------
   Tests of the math in percolation-clusters.js, shared by the site and
   bond percolation sims:

     1. The clusters are right: union-find's clusters must be exactly
        the ones a plain search through open neighbors finds (written
        separately below), on boxes, tori, 4 and 8 neighbors.
     2. Wrapping on a torus: the sim's answer must match a plain search
        that walks each cluster in the unwrapped plane.
     3. The sweep over every p (Newman and Ziff) must agree with the
        clusters found at one p, at many p's, including where a
        cluster first crosses or wraps.
     4. Each cell (site) or edge (bond) is open with probability p.
     5. The coupling: raising p only merges clusters.
     6. Site percolation, the Hex fact: on a box, exactly one of an
        open 4-neighbor crossing from left to right and a closed
        8-neighbor crossing from top to bottom (D. Gale, Amer. Math.
        Monthly 86 (1979) 818-827; H. Kesten, "Percolation Theory for
        Mathematicians", 1982, Chapter 2). Checked on every sample.
     7. Bond percolation, duality: on the box with n + 1 columns and n
        rows, exactly one of an open crossing from left to right and a
        closed dual crossing from top to bottom (G. Grimmett,
        "Percolation", 2nd ed., 1999, Chapter 11). Checked on every
        sample, and so at p = 1/2 the crossing happens half the time.
     8. Bond percolation at p = 1/2 on a big torus: clusters per cell
        near (3 sqrt(3) - 5) / 2 = 0.09808 (H. N. V. Temperley and
        E. H. Lieb, Proc. R. Soc. A 322 (1971) 251-280; R. M. Ziff,
        S. R. Finch and V. S. Adamchik, Phys. Rev. Lett. 79 (1997)
        3447-3450).
     9. On a ball of a tree, the start's cluster reaches the edge with
        the exact probability from the branching-process recursion
        (R. Lyons and Y. Peres, "Probability on Trees and Networks",
        2016, Chapter 5), for site and bond. Tests 1 and 3 also run on
        small balls of a tree and of the {7, 3} tiling, where "crosses"
        means the start's cluster reaches the edge.

   Random numbers come from the library seedrandom, with fixed seeds,
   so the tests do the same thing every time.
   ===================================================================== */


/* ---------------------------------------------------------------------
   Plain searches, written separately from the sim's union-find
   --------------------------------------------------------------------- */

// A map from "v,w" (either way round) to the edge's number in edgesOf.
function edgeLookup(edges) {
  const map = new Map();
  for (let e = 0; e < edges.count; e++) {
    map.set(edges.a[e] + "," + edges.b[e], e);
    map.set(edges.b[e] + "," + edges.a[e], e);
  }
  return map;
}
// Is the edge between cells v and w open? (site: both cells open;
// bond: the edge's own number is below p.) "edgeAt" is edgeLookup's map.
function openBetween(kind, U, p, edgeAt, v, w) {
  return kind === "site" ? (U[v] < p && U[w] < p) : U[edgeAt.get(v + "," + w)] < p;
}

// The clusters by a plain search: component[v] (-1 for a closed site),
// and whether some cluster wraps around the torus (each cell is given
// a place in the unwrapped plane when first reached; reaching a cell
// again at a different place means the cluster went round).
function plainClusters(d, kind, U, p, edgeAt) {
  const component = new Int32Array(d.n).fill(-1);
  const placeX = new Int32Array(d.n), placeY = new Int32Array(d.n);
  let count = 0, wraps = false;
  for (let s = 0; s < d.n; s++) {
    if (component[s] !== -1 || (kind === "site" && !(U[s] < p))) continue;
    component[s] = count;
    const stack = [s];
    while (stack.length > 0) {
      const v = stack.pop();
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (!openBetween(kind, U, p, edgeAt, v, w)) continue;
        const step = stepBetween(d, v, w);
        const x = placeX[v] + step[0], y = placeY[v] + step[1];
        if (component[w] === -1) {
          component[w] = count; placeX[w] = x; placeY[w] = y; stack.push(w);
        } else if (placeX[w] !== x || placeY[w] !== y) {
          wraps = true;
        }
      }
    }
    count++;
  }
  return { component: component, count: count, wraps: wraps };
}

// Do the sim's clusters and the plain ones split the cells the same way?
function sameClusters(result, plain) {
  const match = new Map();   // the sim's root -> the plain component
  for (let v = 0; v < result.root.length; v++) {
    const r = result.root[v], c = plain.component[v];
    if ((r === -1) !== (c === -1)) return false;
    if (r === -1) continue;
    if (!match.has(r)) match.set(r, c);
    else if (match.get(r) !== c) return false;
  }
  return match.size === plain.count;
}

// The domains the tests use.
function testDomains() {
  return [
    { name: "8 x 6 box, 4 neighbors", d: boxDomain(8, 6, 4, false) },
    { name: "8 x 6 box, 8 neighbors", d: boxDomain(8, 6, 8, false) },
    { name: "9 x 7 torus, 4 neighbors", d: boxDomain(9, 7, 4, true) },
    { name: "6 x 6 torus, 8 neighbors", d: boxDomain(6, 6, 8, true) },
    { name: "Aztec diamond of order 4", d: aztecDiamond(4) },
    { name: "ball of radius 3 of the tree of degree 3", d: testBall(3, Infinity, 3) },
    { name: "ball of radius 2 of the {7, 3} tiling", d: testBall(7, 3, 2) },
  ];
}

// The ball of radius R of the tiling {p, q} (q = Infinity: the tree of
// degree p; js/sim-graphs.js and js/sim-hyperbolic.js), ready for
// percolation.
function testBall(p, q, R) {
  return ballForPercolation(makeBall(makeGraph({ kind: "tiling", p: p, q: q }), R, 1e6));
}


/* ---------------------------------------------------------------------
   1-3. Clusters, wrapping, and the sweep
   --------------------------------------------------------------------- */
function testClusters(kind) {
  const random = new Math.seedrandom("clusters " + kind);
  const domains = testDomains();
  let samples = 0, bad = "";
  for (const t of domains) {
    const edges = edgesOf(t.d), edgeAt = edgeLookup(edges);
    for (let k = 0; k < 300 && !bad; k++) {
      const U = uniformNumbers(kind === "site" ? t.d.n : edges.count, "c" + k + t.name);
      const p = random();
      const result = percolate(t.d, kind, p, U, edges);
      const plain = plainClusters(t.d, kind, U, p, edgeAt);
      samples++;
      if (!sameClusters(result, plain) || result.clusters !== plain.count) bad = t.name + ", p = " + p.toFixed(3);
    }
  }
  addRow(kind + ": clusters match a plain search", !bad,
         bad ? "different clusters on the " + bad : samples + " samples on " + domains.length + " domains, every cluster the same.");
}

function testWrapping(kind) {
  let samples = 0, wrapped = 0, bad = "";
  for (const t of testDomains().filter(function (t) { return t.d.wrap; })) {
    const edges = edgesOf(t.d), edgeAt = edgeLookup(edges);
    for (let k = 0; k < 400 && !bad; k++) {
      const U = uniformNumbers(kind === "site" ? t.d.n : edges.count, "w" + k + t.name);
      const p = (k % 40) / 40 + 0.0125;
      const result = percolate(t.d, kind, p, U, edges);
      const plain = plainClusters(t.d, kind, U, p, edgeAt);
      samples++;
      if (plain.wraps) wrapped++;
      if (result.crossed !== plain.wraps) bad = t.name + ", p = " + p.toFixed(3);
    }
  }
  addRow(kind + ": wrapping around the torus", !bad && wrapped > 0 && wrapped < samples,
         bad ? "different answer on the " + bad
             : samples + " samples; " + wrapped + " wrap, the rest don't, and the sim agrees on all of them.");
}

function testSweep(kind) {
  let checks = 0, bad = "";
  for (const t of testDomains()) {
    const edges = edgesOf(t.d);
    for (let k = 0; k < 30 && !bad; k++) {
      const U = uniformNumbers(kind === "site" ? t.d.n : edges.count, "s" + k + t.name);
      const swept = sweep(t.d, kind, U, edges);
      // At 21 p's, and just below and at the p where it first crosses.
      for (let j = 0; j <= 20; j++) {
        const p = j / 20, result = percolate(t.d, kind, p, U, edges);
        const open = openAt(swept, p);
        const largest = open === 0 ? (kind === "site" ? 0 : 1) : swept.largest[open - 1];
        const clusters = open === 0 ? (kind === "site" ? 0 : t.d.n) : swept.clusters[open - 1];
        const resultLargest = result.largestRoot === -1 ? 0 : result.size[result.largestRoot];
        checks++;
        if (open !== result.openCount || largest !== resultLargest || clusters !== result.clusters) {
          bad = t.name + " at p = " + p;
        }
      }
      if (swept.crossAt !== null) {
        checks++;
        const before = percolate(t.d, kind, swept.crossAt, U, edges);        // U < p: not yet open
        const after = percolate(t.d, kind, swept.crossAt + 1e-12, U, edges);
        if (before.crossed || !after.crossed) bad = t.name + ", the first crossing";
      }
    }
  }
  addRow(kind + ": the sweep over every p", !bad,
         bad ? "the sweep disagrees on the " + bad
             : checks + " checks: the largest cluster, the number of clusters and the first crossing all agree.");
}


/* ---------------------------------------------------------------------
   4-5. Open with probability p; the coupling
   --------------------------------------------------------------------- */
function testOpenFraction(kind) {
  const d = boxDomain(100, 100, 4, true), edges = edgesOf(d);
  const total = kind === "site" ? d.n : edges.count;
  let worst = 0, text = "";
  for (const p of [0.1, 0.3, 0.5, 0.75]) {
    let open = 0, trials = 0;
    for (let k = 0; k < 10; k++) {
      open += percolate(d, kind, p, uniformNumbers(total, "f" + k + p), edges).openCount;
      trials += total;
    }
    // A binomial count (binomialZ, js/check-page.js).
    const z = binomialZ(open, trials, p);
    worst = Math.max(worst, Math.abs(z));
    text += "p = " + p + ": " + (open / trials).toFixed(4) + ". ";
  }
  addRow(kind + ": open with probability p", worst < 4,
         text + "Largest gap " + worst.toFixed(2) + " standard deviations (pass below 4).");
}

function testCoupling(kind) {
  const d = boxDomain(30, 30, 4, true), edges = edgesOf(d);
  let bad = 0;
  for (let k = 0; k < 20; k++) {
    const U = uniformNumbers(kind === "site" ? d.n : edges.count, "m" + k);
    let previous = null;
    for (let j = 1; j <= 10; j++) {
      const result = percolate(d, kind, j / 10, U, edges);
      if (previous) {
        // Two cells together at the lower p must be together now.
        const seen = new Map();
        for (let v = 0; v < d.n; v++) {
          if (previous.root[v] === -1) continue;
          if (!seen.has(previous.root[v])) seen.set(previous.root[v], result.root[v]);
          else if (seen.get(previous.root[v]) !== result.root[v]) bad++;
        }
      }
      previous = result;
    }
  }
  addRow(kind + ": raising p only merges clusters", bad === 0,
         bad === 0 ? "On 20 samples at p = 0.1, 0.2, ..., 1, every cluster lies inside one cluster at the next p."
                   : bad + " cells left their cluster as p rose.");
}


/* ---------------------------------------------------------------------
   6. Site: the Hex fact
   --------------------------------------------------------------------- */

// Do the closed cells of a width x height box cross from its top row
// (y = 0) to its bottom row, through 8 neighbors (sides or corners)?
// closed[y * width + x] is 1 when cell (x, y) is closed.
function closedTopToBottom(width, height, closed) {
  const seen = new Uint8Array(width * height), stack = [];
  for (let x = 0; x < width; x++) if (closed[x]) { seen[x] = 1; stack.push([x, 0]); }
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (y === height - 1) return true;
    for (let nx = x - 1; nx <= x + 1; nx++) {
      for (let ny = y - 1; ny <= y + 1; ny++) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const k = ny * width + nx;
        if (closed[k] && !seen[k]) { seen[k] = 1; stack.push([nx, ny]); }
      }
    }
  }
  return false;
}

function testHex() {
  const random = new Math.seedrandom("hex");
  let samples = 0, bad = 0, open = 0;
  for (let k = 0; k < 3000; k++) {
    const width = 2 + Math.floor(random() * 12), height = 2 + Math.floor(random() * 12);
    const d = boxDomain(width, height, 4, false), edges = edgesOf(d);
    const p = random(), U = uniformNumbers(d.n, "h" + k);
    // The sim's answer: an open 4-neighbor cluster touching both sides.
    const openCrossing = percolate(d, "site", p, U, edges).crossed;
    // The plain answer: closed cells, 8 neighbors, top row to bottom row.
    const closed = new Uint8Array(d.n);
    for (let v = 0; v < d.n; v++) closed[d.y[v] * width + d.x[v]] = U[v] < p ? 0 : 1;
    const closedCrossing = closedTopToBottom(width, height, closed);
    samples++;
    if (openCrossing) open++;
    if (openCrossing === closedCrossing) bad++;
  }
  addRow("site: exactly one crossing (Hex)", bad === 0,
         samples + " random boxes from 2 x 2 to 13 x 13 at random p: " + open + " had an open crossing, the rest a " +
         "closed one, and " + (bad === 0 ? "never both or neither." : bad + " had both or neither."));
}


/* ---------------------------------------------------------------------
   7. Bond: duality, and crossing half the time at p = 1/2
   ---------------------------------------------------------------------
   The box: cells (x, y) with x = 0 .. n (n + 1 columns) and y = 0 ..
   n - 1 (n rows). Its dual cells sit in the squares between four
   cells, and also outside the top and bottom: dual cell (i, j), with
   i = 0 .. n - 1 and j = 0 .. n, is centered at (i + 1/2, j - 1/2), so
   j = 0 is below the box and j = n above it. A dual edge crosses
   exactly one edge of the box and is closed when that edge is closed.
   (Dual edges along the left and right ends would cross no edge, and
   a top-to-bottom crossing never needs them.)
   --------------------------------------------------------------------- */
function bondDualCrosses(n, d, U, p, edgeAt) {
  const columns = n, rows = n + 1;       // the dual box
  const index = function (i, j) { return j * columns + i; };
  const seen = new Uint8Array(columns * rows), stack = [];
  // Closed: the box edge crossed by the dual edge from dual cell (i, j)
  // to its neighbor. Going right from (i, j) to (i + 1, j) crosses the
  // vertical edge between cells (i + 1, j - 1) and (i + 1, j); going up
  // from (i, j) to (i, j + 1) crosses the edge between cells (i, j) and
  // (i + 1, j).
  function closed(x1, y1, x2, y2) {
    if (y1 < 0 || y2 < 0 || y1 >= n || y2 >= n) return true;   // top and bottom: no edge there
    const v = cellAt(d, x1, y1), w = cellAt(d, x2, y2);
    return !(U[edgeAt.get(v + "," + w)] < p);
  }
  for (let i = 0; i < columns; i++) { seen[index(i, 0)] = 1; stack.push([i, 0]); }
  while (stack.length > 0) {
    const [i, j] = stack.pop();
    if (j === rows - 1) return true;
    const moves = [
      [i + 1, j, i + 1, j - 1, i + 1, j],   // right
      [i - 1, j, i, j - 1, i, j],           // left
      [i, j + 1, i, j, i + 1, j],           // up
      [i, j - 1, i, j - 1, i + 1, j - 1],   // down
    ];
    for (const [ni, nj, x1, y1, x2, y2] of moves) {
      if (ni < 0 || nj < 0 || ni >= columns || nj >= rows || seen[index(ni, nj)]) continue;
      if (!closed(x1, y1, x2, y2)) continue;
      seen[index(ni, nj)] = 1;
      stack.push([ni, nj]);
    }
  }
  return false;
}

function testDuality() {
  const random = new Math.seedrandom("duality");
  let samples = 0, bad = 0;
  for (let k = 0; k < 2000; k++) {
    const n = 1 + Math.floor(random() * 12);
    const d = boxDomain(n + 1, n, 4, false), edges = edgesOf(d), edgeAt = edgeLookup(edges);
    const p = random(), U = uniformNumbers(edges.count, "dual" + k);
    const openCrossing = percolate(d, "bond", p, U, edges).crossed;
    samples++;
    if (openCrossing === bondDualCrosses(n, d, U, p, edgeAt)) bad++;
  }
  addRow("bond: exactly one crossing (duality)", bad === 0,
         samples + " random boxes with n + 1 columns and n rows, n up to 12, at random p: " +
         (bad === 0 ? "always exactly one of an open crossing and a closed dual crossing." : bad + " had both or neither."));
}

function testHalf() {
  const n = 20, d = boxDomain(n + 1, n, 4, false), edges = edgesOf(d);
  const trials = 4000;
  let crossed = 0;
  for (let k = 0; k < trials; k++) if (percolate(d, "bond", 0.5, uniformNumbers(edges.count, "half" + k), edges).crossed) crossed++;
  const z = binomialZ(crossed, trials, 0.5);
  addRow("bond: crossing half the time at p = 1/2", Math.abs(z) < 4,
         "On the 21 x 20 box, " + crossed + " of " + trials + " samples cross (" + (crossed / trials).toFixed(3) +
         "), " + Math.abs(z).toFixed(2) + " standard deviations from 1/2 (pass below 4).");
}


/* ---------------------------------------------------------------------
   8. Bond: clusters per cell at p = 1/2
   --------------------------------------------------------------------- */
function testClustersPerCell() {
  const L = 200, d = boxDomain(L, L, 4, true), edges = edgesOf(d);
  const exact = (3 * Math.sqrt(3) - 5) / 2;
  let sum = 0;
  const samples = 6;
  for (let k = 0; k < samples; k++) sum += percolate(d, "bond", 0.5, uniformNumbers(edges.count, "kappa" + k), edges).clusters / d.n;
  const mean = sum / samples;
  addRow("bond: clusters per cell at p = 1/2", Math.abs(mean - exact) < 0.0015,
         "On a 200 x 200 torus, " + samples + " samples: " + mean.toFixed(5) + " clusters per cell; the exact limit is (3√3 − 5)/2 = " +
         exact.toFixed(5) + " (pass within 0.0015).");
}


/* ---------------------------------------------------------------------
   9. A ball of a tree: reaching the edge
   ---------------------------------------------------------------------
   Below the start, every cell has degree - 1 children. For bond, f_k is
   the chance that a cell is joined to the cells k levels below it:
   f_0 = 1, f_k = 1 - (1 - p f_{k-1})^(degree - 1), and the start
   reaches the edge with chance 1 - (1 - p f_{R-1})^degree. For site,
   g_k is the chance that a cell is open and joined k levels down:
   g_0 = p, g_k = p (1 - (1 - g_{k-1})^(degree - 1)), and the start
   reaches the edge with chance p (1 - (1 - g_{R-1})^degree).
   --------------------------------------------------------------------- */
function reachEdgeExact(kind, degree, R, p) {
  let f = kind === "site" ? p : 1;
  for (let k = 1; k < R; k++) {
    f = kind === "site" ? p * (1 - Math.pow(1 - f, degree - 1)) : 1 - Math.pow(1 - p * f, degree - 1);
  }
  return kind === "site" ? p * (1 - Math.pow(1 - f, degree)) : 1 - Math.pow(1 - p * f, degree);
}

function testTreeBall(kind, degree, R, p) {
  const d = testBall(degree, Infinity, R), edges = edgesOf(d);
  const exact = reachEdgeExact(kind, degree, R, p), trials = 4000;
  let reached = 0;
  for (let k = 0; k < trials; k++) {
    const U = uniformNumbers(kind === "site" ? d.n : edges.count, "tree " + kind + k);
    if (percolate(d, kind, p, U, edges).crossed) reached++;
  }
  const z = binomialZ(reached, trials, exact);
  addRow(kind + ": reaching the edge of a tree's ball", d.xmax === R && Math.abs(z) < 4,
         "Tree of degree " + degree + ", ball of radius " + R + " (" + d.n + " cells), p = " + p + ": the start's cluster reaches " +
         "the edge in " + reached + " of " + trials + " samples (" + (reached / trials).toFixed(3) + "); the exact chance is " +
         exact.toFixed(4) + ", " + Math.abs(z).toFixed(2) + " standard deviations away (pass below 4).");
}


runChecksOnClick(function () {
  return [
    function () { testClusters("site"); }, function () { testClusters("bond"); },
    function () { testWrapping("site"); }, function () { testWrapping("bond"); },
    function () { testSweep("site"); }, function () { testSweep("bond"); },
    function () { testOpenFraction("site"); }, function () { testOpenFraction("bond"); },
    function () { testCoupling("site"); }, function () { testCoupling("bond"); },
    testHex, testDuality, testHalf, testClustersPerCell,
    function () { testTreeBall("site", 3, 6, 0.65); }, function () { testTreeBall("bond", 4, 5, 0.4); },
  ];
});
