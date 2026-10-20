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
    10. The other lattices (js/sim-tilings.js reads them from their
        GomJau-Hogg codes):
          - every tiling in the Lattice menu has the kinds of corner its
            name says, and as many kinds up to symmetry (it is
            "k-uniform" for that k; B. Grunbaum and G. C. Shephard,
            "Tilings and Patterns", 1987, Sections 2.1 and 2.2);
          - the two tilings that share a name but for a label (like
            [3⁶; 3⁴.6]¹ and ²) are different tilings;
          - the same for the 90 codes of Table 1 of the paper (V.
            Gomez-Jauregui, H. Hogg, C. Manchado and C. Otero, Symmetry
            13 (2021), 2376): all but 7 make the tiling named there, and
            the 7 are the ones known to disagree;
          - the boxes and tori of every tiling in the menu, its tiles
            and its corners: each side is shared by the two cells it
            joins, in the right place; a torus's cells fill it, with no
            gaps or overlaps; clicking a cell finds that cell.
        Tests 1-3 also run on four of these domains.
    11. The Penrose tilings (js/sim-penrose.js), kites and darts (P2)
        and rhombs (P3):
          - near the middle, the tiles go all the way around every
            corner with no gaps or overlaps, and every corner is one of
            the kinds a Penrose tiling may have (Conway's seven for P2,
            in M. Gardner, Scientific American 236 (January 1977)
            110-121; de Bruijn's eight for P3, in N. G. de Bruijn,
            Indag. Math. 43 (1981) 39-66), each of which turns up;
          - there are about phi kites per dart, and phi thick rhombs per
            thin one (phi is the golden ratio; the ratio in the limit,
            Grunbaum and Shephard, Section 10.3);
          - a patch grown bigger keeps the smaller patch, every cell's
            number and its neighbors, and inside it every side has a
            tile on both sides.
        Their boxes are in the domain test of 10, and tests 1 and 3 also
        run on two of them.

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
    { name: "7 x 6 torus of the tiles of triangles (the honeycomb)", d: testTiling("3/m30/r(h2)", false, 7, 6, true) },
    { name: "8 x 6 box of the corners of the kagome tiling", d: testTiling("6-3-6/m30/r(v4)", true, 8, 6, false) },
    { name: "9 x 9 torus of the tiles of 3.4.6.4", d: testTiling("6-4-3/m30/r(c2)", false, 9, 9, true) },
    { name: "8 x 8 box of the corners of [3³.4²; 3².4.3.4]²", d: testTiling("4-3,3,3-4,3/r(h4)/r(h4)/r(h15)", true, 8, 8, false) },
    { name: "10 x 8 box of the kites and darts (P2)", d: testTiling("Penrose P2", false, 10, 8, false) },
    { name: "10 x 8 box of the corners of the rhombs (P3)", d: testTiling("Penrose P3", true, 10, 8, false) },
  ];
}

// A box or torus (tilingBox, js/sim-domains.js) of the tiling with this
// code (or a Penrose tiling's, js/sim-penrose.js), its tiles or its
// corners as the cells, width x height side lengths.
function testTiling(code, corners, width, height, torus) {
  return tilingBox(tilingBlock(code, corners), width, height, torus);
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


/* ---------------------------------------------------------------------
   10. The other lattices: the tilings and their domains
   --------------------------------------------------------------------- */

// The kinds of corner a tiling's name in the Lattice menu says, the
// short way and sorted: "Kagome (3.6.3.6)" says 3.6.3.6, and
// "[3⁶; 3⁴.6]¹" says 3⁶ and 3⁴.6 (the ¹ is a label).
function cornersInName(name) {
  const inside = /\((.*)\)$/.exec(name);
  const list = inside ? inside[1] : name.replace(/\][¹²³⁴]$/, "").replace(/[\[\]]/g, "");
  return list.split(";").map(function (s) { return s.trim(); }).sort();
}

// A tiling's kinds of corner, the short way and sorted.
function cornersBuilt(block) {
  return block.vertexTypes.map(cornerShort).sort();
}

// The number of kinds of corner of a tiling up to ALL its symmetries
// (it is "k-uniform" for this k), from its block (tilingFromCode). The
// corners of the block are joined up, with union-find, whenever a
// symmetry carries one to another.
function cornerOrbits(block) {
  const { t1, t2, cells } = block.exact.block;
  const symmetries = tilingSymmetries(t1, t2, cells);
  const index = new Map(), corners = [];
  for (const cell of cells) {
    for (const c of cell.corners) {
      const home = homePoint(c, t1, t2), key = pointKey(home);
      if (!index.has(key)) { index.set(key, corners.length); corners.push(home); }
    }
  }
  const parent = corners.map(function (c, i) { return i; });
  const find = function (i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  corners.forEach(function (c, i) {
    for (const g of symmetries) {
      const j = index.get(pointKey(homePoint(move(g, c), t1, t2)));
      if (j === undefined) throw new Error("A symmetry moved a corner off the tiling.");
      parent[find(i)] = find(j);
    }
  });
  return new Set(corners.map(function (c, i) { return find(i); })).size;
}

// One symmetry of the tiling for each turn or mirror that is one: the
// turns and mirrors that carry the repeating steps to repeating steps,
// each with a shift that carries every polygon of the block onto a
// polygon of the tiling.
function tilingSymmetries(t1, t2, cells) {
  const keys = new Set(cells.map(polygonKey)), first = polygonMiddle(cells[0]);
  const found = [];
  for (let r = 0; r < 24; r++) {
    for (let f = 0; f < 2; f++) {
      const linear = { r: r, f: f, t: [ZERO, ZERO] };
      if (!isStep(move(linear, t1), t1, t2) || !isStep(move(linear, t2), t1, t2)) continue;
      for (const cell of cells) {
        if (cell.sides !== cells[0].sides) continue;
        const g = { r: r, f: f, t: pointMinus(polygonMiddle(cell), move(linear, first)) };
        const fits = cells.every(function (c) { return keys.has(polygonKey(intoBlock(movePolygon(g, c), t1, t2))); });
        if (fits) { found.push(g); break; }
      }
    }
  }
  return found;
}

// Is p a whole step i t1 + j t2?
function isStep(p, t1, t2) {
  const det = cross(t1, t2);
  return wholeNumber(over(cross(p, t2), det)) !== null && wholeNumber(over(cross(t1, p), det)) !== null;
}

// The point p moved into the block by whole steps.
function homePoint(p, t1, t2) {
  const [s, u] = blockPlace(p, t1, t2);
  return pointMinus(p, pointPlus(pointScale(fraction(floorOf(s)), t1), pointScale(fraction(floorOf(u)), t2)));
}

function testMenuTilings() {
  const wrong = [];
  for (const tiling of TILINGS) {
    const block = tilingFromCode(tiling.code);
    const corners = cornersBuilt(block), k = cornerOrbits(block);
    if (corners.join("; ") !== cornersInName(tiling.name).join("; ") || k !== tiling.kinds) {
      wrong.push(tiling.name + " (built " + corners.join("; ") + ", " + k + " up to symmetry)");
    }
  }
  addRow("Lattices: the tilings in the menu", wrong.length === 0,
         wrong.length ? "Not the named tiling: " + wrong.join(", ")
                      : TILINGS.length + " tilings: each has the kinds of corner its name says, and that many kinds up to symmetry.");
}

// What tells two tilings apart here: the number of turns and mirrors
// that are symmetries, the shape of the repeating block, and how many
// polygons of each kind it holds.
function fingerprint(block) {
  const { t1, t2, cells } = block.exact.block;
  const sides = {};
  for (const cell of block.cells) sides[cell.sides] = (sides[cell.sides] || 0) + 1;
  const length = function (t) { return Math.hypot(t[0], t[1]).toFixed(6); };
  return [tilingSymmetries(t1, t2, cells).length, length(block.t1), length(block.t2),
          Math.abs(block.t1[0] * block.t2[0] + block.t1[1] * block.t2[1]).toFixed(6), JSON.stringify(sides)].join(" ");
}

function testMenuPairs() {
  const byName = new Map();
  for (const tiling of TILINGS) {
    if (!/\][¹²]$/.test(tiling.name)) continue;
    const base = tiling.name.slice(0, -1);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(fingerprint(tilingFromCode(tiling.code)));
  }
  const same = Array.from(byName.keys()).filter(function (base) { return byName.get(base)[0] === byName.get(base)[1]; });
  addRow("Lattices: tilings with the same corners are different", same.length === 0,
         same.length ? "These pairs look the same: " + same.join(", ")
                     : byName.size + " pairs, like [3⁶; 3⁴.6]¹ and ², each two different tilings (different symmetries, blocks, or polygons in a block).");
}

// Table 1 of the paper: each code, the name the paper gives it, the
// kinds of corner that name says (the short way, sorted; "(3.6)²" is
// 3.6.3.6, and "3.4.6.5" is the paper's misprint for 3.4.6.4), and how
// many kinds up to symmetry it says (a power on a kind, like
// "(3³.4²)²", counts it that many times).
const PAPER_TABLE = [
  ["3/m30/r(h2)", "3⁶", "3⁶", 1],
  ["6/m30/r(h1)", "6³", "6³", 1],
  ["4/m45/r(h1)", "4⁴", "4⁴", 1],
  ["12-3/m30/r(h3)", "3.12²", "3.12²", 1],
  ["6-4-3/m30/r(c2)", "3.4.6.4", "3.4.6.4", 1],
  ["12-6,4/m30/r(c2)", "4.6.12", "4.6.12", 1],
  ["6-3-6/m30/r(v4)", "(3.6)²", "3.6.3.6", 1],
  ["8-4/m90/r(h4)", "4.8²", "4.8²", 1],
  ["4-3-3,4/r90/r(h2)", "3².4.3.4", "3².4.3.4", 1],
  ["4-3/m90/r(h2)", "3³.4²", "3³.4²", 1],
  ["6-3-3/r60/r(h5)", "3⁴.6", "3⁴.6", 1],
  ["3-4-3/m30/r(c3)", "3⁶; 3².4.3.4", "3².4.3.4; 3⁶", 2],
  ["6-4-3,3/m30/r(h1)", "3.4.6.4; 3².4.3.4", "3.4.6.4; 3².4.3.4", 2],
  ["6-4-3-3/m30/r(h5)", "3.4.6.5; 3³.4²", "3.4.6.4; 3³.4²", 2],
  ["6-4-3,4-6/m30/r(c4)", "3.4.6.4; 3.4².6", "3.4.6.4; 3.4².6", 2],
  ["12-4,6-3/m30/r(c3)", "4.6.12; 3.4.6.4", "3.4.6.4; 4.6.12", 2],
  ["12-3,4-3/m30/r(c3)", "3⁶; 3².4.12", "3².4.12; 3⁶", 2],
  ["12-0,3,3-0,4/m45/m(h1)", "3.12²; 3.4.3.12", "3.12²; 3.4.3.12", 2],
  ["3-6/m30/r(c2)", "3⁶; 3².6²", "3².6²; 3⁶", 2],
  ["6-3,3-3/m30/r(h1)", "[3⁶; 3⁴.6]¹", "3⁴.6; 3⁶", 2],
  ["6-3-3,3-3/r60/r(h8)", "[3⁶; 3⁴.6]²", "3⁴.6; 3⁶", 2],
  ["6-3/m90/r(h1)", "3².6²; 3⁴.6", "3².6²; 3⁴.6", 2],
  ["6-3,6/m90/r(h3)", "3.6.3.6; 3².6²", "3.6.3.6; 3².6²", 2],
  ["6-3,4-6-3,4-6,4/m90/r(c6)", "[3.4².6; 3.6.3.6]¹", "3.4².6; 3.6.3.6", 2],
  ["6-3,4/m90/r(h4)", "[3.4².6; 3.6.3.6]²", "3.4².6; 3.6.3.6", 2],
  ["4-3,3-4,3/r90/m(h3)", "[3³.4²; 3².4.3.4]¹", "3².4.3.4; 3³.4²", 2],
  ["4-3,3,3-4,3/r(c2)/r(h13)/r(h45)", "[3³.4²; 3².4.3.4]²", "3².4.3.4; 3³.4²", 2],
  ["4-3/m(h4)/m(h3)/r(h2)", "[4⁴; 3³.4²]¹", "3³.4²; 4⁴", 2],
  ["4-4-3-3/m90/r(h3)", "[4⁴; 3³.4²]²", "3³.4²; 4⁴", 2],
  ["4-3,4-3,3/m90/r(h3)", "[3⁶; 3³.4²]¹", "3³.4²; 3⁶", 2],
  ["4-3-3-3/m90/r(h7)/r(h5)", "[3⁶; 3³.4²]²", "3³.4²; 3⁶", 2],
  ["6-4-3,4-6,3/m30/r(c2)", "(3.4.6.4)²; 3.4².6", "3.4.6.4; 3.4².6", 3],
  ["6-3-3/m30/r(v3)", "[(3⁶)²; 3⁴.6]¹", "3⁴.6; 3⁶", 3],
  ["6-3-3-3-0,3/m30/r(v2)", "[(3⁶)²; 3⁴.6]²", "3⁴.6; 3⁶", 3],
  ["6-3-3,3-3-3-0,3/r60/r(h7)", "[(3⁶)²; 3⁴.6]³", "3⁴.6; 3⁶", 3],
  ["3-3,3-6/m90/r(h6)", "3⁶; (3⁴.6)²", "3⁴.6; 3⁶", 3],
  ["3-4-3,3/m30/m(h2)", "3⁶; (3².4.3.4)²", "3².4.3.4; 3⁶", 3],
  ["4-6,4-4,3,3/m90/r(h4)", "(3.4².6)²; 3.6.3.6", "3.4².6; 3.6.3.6", 3],
  ["4-6,4-0,3,3/m/r(v1)/r(h25)", "[3.4².6; (3.6.3.6)²]¹", "3.4².6; 3.6.3.6", 3],
  ["4-6,4-0,3,3/m90/r(v1)", "[3.4².6; (3.6.3.6)²]²", "3.4².6; 3.6.3.6", 3],
  ["6-3,0,3,3,3,3/r(h4)/r(v15)/r(v30)", "3².6²; (3.6.3.6)²", "3.6.3.6; 3².6²", 3],
  ["6-3,3-0,3/r/r(v1)/r(h12)", "(3⁴.6)²; 3.6.3.6", "3.6.3.6; 3⁴.6", 3],
  ["4-4-4-3/m90/r(h4)", "[3³.4²; (4⁴)²]¹", "3³.4²; 4⁴", 3],
  ["4-4-3/r(h6)/m(h5)/r(h3)", "[3³.4²; (4⁴)²]²", "3³.4²; 4⁴", 3],
  ["4-4-3-3-4/m90/r(h10)/r(c3)", "[(3³.4²)²; 4⁴]¹", "3³.4²; 4⁴", 3],
  ["4-3,4-3,3-4/m90/r(h3)", "[(3³.4²)²; 4⁴]²", "3³.4²; 4⁴", 3],
  ["4-4,3,4-3,3,3-3,4-3-4/r/r(h17)/r(h18)", "(3³.4²)²; 3².4.3.4", "3².4.3.4; 3³.4²", 3],
  ["4-3,3-0,4,3/r/r(h2)/r(h18)", "3³.4²; (3².4.3.4)²", "3².4.3.4; 3³.4²", 3],
  ["4-3,0,3-3-3/r(h5)/r(h19)/m(h18)", "[3⁶; (3³.4²)²]¹", "3³.4²; 3⁶", 3],
  ["4-3,0,3-3/r(h3)/r(h15)/m(h14)", "[3⁶; (3³.4²)²]²", "3³.4²; 3⁶", 3],
  ["4-3-3-3-3-3/m90/r(h3)", "[(3⁶)²; 3³.4²]¹", "3³.4²; 3⁶", 3],
  ["4-3-3-3-3/m90/r(h2)/m(h22)", "[(3⁶)²; 3³.4²]²", "3³.4²; 3⁶", 3],
  ["12-6,4-3,3,4/m30/r(c5)", "3.4².6; 3.6.3.6; 4.6.12", "3.4².6; 3.6.3.6; 4.6.12", 3],
  ["12-3,4,6-3/m60/m(c5)", "3⁶; 3².4.12; 4.6.12", "3².4.12; 3⁶; 4.6.12", 3],
  ["6-4-3,12,3-3/m30/r(h2)", "3².4.12; 3.4.6.4; 3.12²", "3.12²; 3.4.6.4; 3².4.12", 3],
  ["6-4-3,3-12-0,0,0,3/m30/r(c2)", "3.4.3.12; 3.4.6.4; 3.12²", "3.12²; 3.4.3.12; 3.4.6.4", 3],
  ["12-4,3-6,3-0,0,4/m30/r(h11)", "3³.4²; 3².4.12; 3.4.6.4", "3.4.6.4; 3².4.12; 3³.4²", 3],
  ["12-3,4-3-3-3/m30/m(h9)", "3⁶; 3³.4²; 3².4.12", "3².4.12; 3³.4²; 3⁶", 3],
  ["12-3,4-3,3/m30/r(v1)", "3⁶; 3².4.3.4; 3².4.12", "3².4.12; 3².4.3.4; 3⁶", 3],
  ["6-3-3-4-3,3/m30/r(h10)", "3⁴.6; 3³.4²; 3².4.3.4", "3².4.3.4; 3³.4²; 3⁴.6", 3],
  ["3-4-3,4-6/m30/r(c5)", "3⁶; 3².4.3.4; 3.4².6", "3.4².6; 3².4.3.4; 3⁶", 3],
  ["6-4-3,4-3,3/m30/r(c5)", "3⁶; 3³.4²; 3.4.6.4", "3.4.6.4; 3³.4²; 3⁶", 3],
  ["6-4-3,3-4,3,3-3/r60/r(v5)", "3⁶; 3².4.3.4; 3.4.6.4", "3.4.6.4; 3².4.3.4; 3⁶", 3],
  ["3-4-3-3/m30/r(h6)", "3⁶; 3³.4²; 3².4.3.4", "3².4.3.4; 3³.4²; 3⁶", 3],
  ["12-4-3,3/m90/r(h6)", "3².4.12; 3.4.3.12; 3.12²", "3.12²; 3.4.3.12; 3².4.12", 3],
  ["6-4,3-3,0,4-6/m90/r(v5)", "3.4.6.4; 3.4².6; 4⁴", "3.4.6.4; 3.4².6; 4⁴", 3],
  ["6-4,3-3,3,4-0,0,6,3/m90/r(h17)/m(h1)", "3².4.3.4; 3.4.6.4; 3.4².6", "3.4.6.4; 3.4².6; 3².4.3.4", 3],
  ["4-3-3-0,4/r90/r(h3)", "3³.4²; 3².4.3.4; 4⁴", "3².4.3.4; 3³.4²; 4⁴", 3],
  ["4-4-3,4-6/m/r(c3)/r(h29)", "[3.4².6; 3.6.3.6; 4⁴]¹", "3.4².6; 3.6.3.6; 4⁴", 3],
  ["4-4,4-3,4-6/m90/r(c5)/r(v1)", "[3.4².6; 3.6.3.6; 4⁴]²", "3.4².6; 3.6.3.6; 4⁴", 3],
  ["6-3,4-0,4,4-0,4/m90/r(h9)", "[3.4².6; 3.6.3.6; 4⁴]³", "3.4².6; 3.6.3.6; 4⁴", 3],
  ["6-4,3,3-4/m(h4)/r/r(v15)", "[3.4².6; 3.6.3.6; 4⁴]⁴", "3.4².6; 3.6.3.6; 4⁴", 3],
  ["4-6-3,0,3,3-0,0,4/m90/r(h4)", "3³.4²; 3².6²; 3.4².6", "3.4².6; 3².6²; 3³.4²", 3],
  ["4-6,4,3-0,3,3,0,6/m(h2)/m", "[3².6²; 3.4².6; 3.6.3.6]¹", "3.4².6; 3.6.3.6; 3².6²", 3],
  ["4-6,4-0,3,3/r(h2)/m90/r(c9)", "[3².6²; 3.4².6; 3.6.3.6]²", "3.4².6; 3.6.3.6; 3².6²", 3],
  ["4-6,4-0,3,3-0,3,3/r/r(c1)/r(h17)", "3⁴.6; 3³.4²; 3.4².6", "3.4².6; 3³.4²; 3⁴.6", 3],
  ["6-6-3,3,3/r60/r(h2)", "[3².6²; 3.6.3.6; 6³]¹", "3.6.3.6; 3².6²; 6³", 3],
  ["6-6,6,3-3,3/m//r(h8)/r(h49)", "[3².6²; 3.6.3.6; 6³]²", "3.6.3.6; 3².6²; 6³", 3],
  ["6-3-3/m/r(h3)/r(h15)", "3⁴.6; 3².6²; 6³", "3².6²; 3⁴.6; 6³", 3],
  ["3-6/r60/m(c2)", "3⁶; 3².6²; 6³", "3².6²; 3⁶; 6³", 3],
  ["6-3-3,3-3,3-0,3/r(h7)/r(h29)/r(h29)", "[3⁶; 3⁴.6; 3².6²]¹", "3².6²; 3⁴.6; 3⁶", 3],
  ["3-3,6-3/m/r(h6)/r(c6)", "[3⁶; 3⁴.6; 3².6²]²", "3².6²; 3⁴.6; 3⁶", 3],
  ["6-3-3/m90/r(h2)", "[3⁶; 3⁴.6; 3².6²]³", "3².6²; 3⁴.6; 3⁶", 3],
  ["3-3,3-3,6,3/m90/r(v1)/r(v15)", "[3⁶; 3⁴.6; 3.6.3.6]¹", "3.6.3.6; 3⁴.6; 3⁶", 3],
  ["3-3-6-0,3/r60/m(c1)", "[3⁶; 3⁴.6; 3.6.3.6]²", "3.6.3.6; 3⁴.6; 3⁶", 3],
  ["3-3-6/r60/r(v4)", "[3⁶; 3⁴.6; 3.6.3.6]³", "3.6.3.6; 3⁴.6; 3⁶", 3],
  ["4-4-3-3/m90/r(h7)/r(v1)", "[3⁶; 3³.4²; 4⁴]¹", "3³.4²; 3⁶; 4⁴", 3],
  ["4-4-3-3-3/m90/r(h9)/r(h3)", "[3⁶; 3³.4²; 4⁴]²", "3³.4²; 3⁶; 4⁴", 3],
  ["4-4-3-3-3/m(h9)/r(h1)/r(v1)", "[3⁶; 3³.4²; 4⁴]³", "3³.4²; 3⁶; 4⁴", 3],
  ["4-4-3-3-3/m(h9)/r(h1)/r(h3)", "[3⁶; 3³.4²; 4⁴]⁴", "3³.4²; 3⁶; 4⁴", 3],
];

// The 7 rows where this site's reader builds a different tiling: the
// first two are tilings in the menu, which uses other codes for them
// (TILINGS, js/sim-tilings.js); the last one doesn't repeat at all.
const PAPER_DISAGREES = [
  "3⁶; 3².6²", "[3³.4²; 3².4.3.4]²", "(3³.4²)²; 3².4.3.4", "3.4.3.12; 3.4.6.4; 3.12²",
  "3⁶; 3².4.3.4; 3.4.6.4", "[3⁶; 3⁴.6; 3.6.3.6]¹", "[3².6²; 3.4².6; 3.6.3.6]¹",
];

function testPaperTable() {
  const disagree = [];
  for (const [code, name, corners, k] of PAPER_TABLE) {
    let ok;
    try {
      const block = tilingFromCode(code);
      ok = cornersBuilt(block).join("; ") === corners && cornerOrbits(block) === k;
    } catch (error) {
      ok = false;
    }
    if (!ok) disagree.push(name);
  }
  const surprises = disagree.filter(function (name) { return !PAPER_DISAGREES.includes(name); })
    .concat(PAPER_DISAGREES.filter(function (name) { return !disagree.includes(name); }));
  addRow("Lattices: the paper's table of codes", surprises.length === 0,
         (PAPER_TABLE.length - disagree.length) + " of " + PAPER_TABLE.length + " codes make the tiling named in the table. " +
         (surprises.length ? "Different from before: " + surprises.join(", ") + "."
                           : "The other " + disagree.length + " are the ones known to disagree: " + disagree.join(", ") + "."));
}

// The boxes and tori the domain test uses: every tiling in the menu,
// its tiles and its corners, about 8 side lengths each way (a Penrose
// tiling has only boxes).
function menuDomains() {
  const list = [];
  for (const tiling of TILINGS) {
    const block = tilingFromCode(tiling.code);
    for (const corners of [false, true]) {
      const upright = uprightBlock(corners ? cornersBlock(block) : block);
      for (const torus of [false, true]) {
        list.push({ name: tiling.name + (corners ? ", corners" : ", tiles") + (torus ? ", torus" : ", box"),
                    d: tilingBox(upright, 8, 8, torus) });
      }
    }
  }
  for (const tiling of PENROSE_TILINGS) {
    for (const corners of [false, true]) {
      list.push({ name: tiling.name + (corners ? ", corners" : ", tiles") + ", box",
                  d: tilingBox(tilingBlock(tiling.code, corners), 8, 8, false) });
    }
  }
  return list;
}

// The area of a polygon from its corners (counterclockwise), by the
// shoelace formula.
function shoelace(corners) {
  let twice = 0;
  corners.forEach(function (p, k) {
    const q = corners[(k + 1) % corners.length];
    twice += p[0] * q[1] - q[0] * p[1];
  });
  return twice / 2;
}

function testTilingDomains() {
  const near = function (p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6; };
  const problems = [];
  const domains = menuDomains();
  for (const { name, d } of domains) {
    const t = d.tiling;
    let problem = "";
    let area = 0;
    for (let v = 0; v < d.n && !problem; v++) {
      const corners = cornersOf(d, v), next = t.cells[d.part[v]].next;
      area += shoelace(corners);
      if (cellAtPoint(d, ...cellMiddle(d, v)) !== v) problem = "clicking a cell finds another one";
      if (d.wrap && d.first[v + 1] - d.first[v] !== corners.length) problem = "a cell of the torus has the wrong number of neighbors";
      next.forEach(function ([k, dI, dJ], e) {
        const w = d.sides[v][e];
        if (w === -1) { if (d.wrap) problem = "a side of the torus has nothing across it"; return; }
        if (!d.sides[w].includes(v)) problem = "a side is shared one way only";
        // The cell across, where it is next to v (not wrapped around):
        // it has both ends of the side.
        const [u, z] = blockStart(d, d.x[v] + dI, d.y[v] + dJ);
        const across = t.cells[k].corners.map(function (c) { return [c[0] + u, c[1] + z]; });
        for (const end of [corners[e], corners[(e + 1) % corners.length]]) {
          if (!across.some(function (c) { return near(c, end); })) problem = "the cell across a side is in the wrong place";
        }
      });
    }
    if (!problem && d.wrap) {
      const blocks = (d.wrap.xmax + 1) * (d.wrap.ymax + 1), blockArea = Math.abs(t.a[0] * t.b[1] - t.a[1] * t.b[0]);
      if (Math.abs(area - blocks * blockArea) > 1e-6 * area) problem = "the cells' areas add up to " + area.toFixed(4) + ", not the torus's " + (blocks * blockArea).toFixed(4);
    }
    if (!problem && !d.wrap && (!d.onLeft.includes(1) || !d.onRight.includes(1))) problem = "no cells along the left or right side";
    if (problem) problems.push(name + ": " + problem);
  }
  addRow("Lattices: the boxes and tori", problems.length === 0,
         problems.length ? problems.join("; ")
                         : domains.length + " domains (every tiling in the menu; tiles and corners; box, and torus but for " +
                           "the Penrose tilings): every side is " +
                           "shared by the two cells it joins, in the right place; each torus is filled exactly; clicking a cell finds it.");
}


/* ---------------------------------------------------------------------
   11. The Penrose tilings
   --------------------------------------------------------------------- */

const PENROSE_NAMES = { P2: "kites and darts (P2)", P3: "rhombs (P3)" };

// Within 40 side lengths of the middle (each way), every corner has
// tiles all the way around it, their angles adding up to 360 degrees,
// and is one of the kinds a Penrose tiling may have (PENROSE_CORNERS,
// js/sim-penrose.js); each of those kinds turns up.
function testPenroseCorners() {
  for (const kind of ["P2", "P3"]) {
    const kinds = penroseCornerKinds(kind, 40), allowed = Object.keys(PENROSE_CORNERS[kind]);
    const wrong = [...kinds.keys()].filter(function (name) { return !allowed.includes(name); });
    const missing = allowed.filter(function (name) { return !kinds.has(name); });
    const total = [...kinds.values()].reduce(function (a, b) { return a + b; }, 0);
    const whose = kind === "P2" ? "Conway's 7" : "de Bruijn's 8 (S and S5 have the same angles)";
    addRow("Penrose " + PENROSE_NAMES[kind] + ": the kinds of corner", wrong.length === 0 && missing.length === 0,
           wrong.length ? "Not allowed: " + wrong.join("; ") + "." :
           missing.length ? "Never turned up: " + missing.join(", ") + "." :
           "All " + total + " corners within 40 of the middle have tiles all the way around, with angles adding up to 360 degrees, " +
           "and each is one of " + whose + ": " + allowed.map(function (name) { return name + " " + kinds.get(name); }).join(", ") + ".");
  }
}

// About phi kites per dart, and thick rhombs per thin one, in the
// 160 x 160 square around the middle (the ratio is phi in the limit).
function testPenroseRatio() {
  const phi = (1 + Math.sqrt(5)) / 2;
  for (const [kind, many, few] of [["P2", "kite", "dart"], ["P3", "thick rhomb", "thin rhomb"]]) {
    const block = penroseBlock(kind, false);
    growPenrose(block, 80, 80);
    const count = function (name) { return block.cells.filter(function (cell) { return cell.name === name; }).length; };
    const ratio = count(many) / count(few);
    addRow("Penrose " + PENROSE_NAMES[kind] + ": " + many + "s per " + few, Math.abs(ratio / phi - 1) < 0.01,
           count(many) + " " + many + "s and " + count(few) + " " + few + "s in the 160 x 160 square around the middle: " +
           ratio.toFixed(4) + " per " + few + ", within 1% of the golden ratio φ = " + phi.toFixed(4) + ".");
  }
}

// A patch grown in steps keeps every cell's number and its neighbors,
// and inside it every side has a cell on both sides, both ways.
function testPenroseGrowing() {
  const problems = [];
  let cells = 0;
  for (const kind of ["P2", "P3"]) {
    for (const corners of [false, true]) {
      const block = penroseBlock(kind, corners), name = PENROSE_NAMES[kind] + (corners ? ", corners" : ", tiles");
      const before = block.cells.map(function (cell) { return [cell.key, cell.next.map(function (s) { return s[0]; })]; });
      for (const [X, Y] of [[30, 20], [20, 50], [60, 60]]) growPenrose(block, X, Y);
      let problem = "";
      before.forEach(function ([key, next], k) {
        if (block.cells[k].key !== key) problem = "a cell's number changed";
        next.forEach(function (other, e) { if (other >= 0 && block.cells[k].next[e][0] !== other) problem = "a cell's neighbor changed"; });
      });
      block.cells.forEach(function (cell, k) {
        if (Math.max(Math.abs(cell.middle[0]), Math.abs(cell.middle[1])) > 57) return;
        for (const [other] of cell.next) {
          if (other < 0) problem = "a side inside the patch has nothing across it";
          else if (!block.cells[other].next.some(function (s) { return s[0] === k; })) problem = "a side is shared one way only";
        }
      });
      if (problem) problems.push(name + ": " + problem);
      cells += block.cells.length;
    }
  }
  addRow("Penrose: a grown patch keeps the smaller one", problems.length === 0,
         problems.length ? problems.join("; ") + "." :
         "Kites and darts, rhombs, their tiles and their corners, grown from 20 x 20 to 120 x 120 in three steps (" + cells +
         " cells in all): every cell keeps its number and its neighbors, and inside, every side has a cell on both sides.");
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
    testMenuTilings, testMenuPairs, testPaperTable, testTilingDomains,
    testPenroseCorners, testPenroseRatio, testPenroseGrowing,
  ];
});
