/* =====================================================================
   sandpiles-check.js  —  the tests on sandpiles-check.html
   ---------------------------------------------------------------------
   Tests of the toppling rule in sandpiles-pile.js:

     1. Same piles as nadya's Python. Her file "sandpiles" puts n grains
        in the middle of a 25 x 25 box and topples until stable, for
        n = 32 .. 64. The final piles and topple counts below were made
        by running her own code. The JavaScript must give exactly the
        same, both one random topple at a time and with "jump to the
        end". A box lets her paste a run of her own.

     2. The abelian property (Dhar 1990): different random orders, rounds,
        and the jump all end in the same pile, with the same number of
        topples at every cell.

     3. Grains are conserved: grains on the table + grains lost to the
        sink = grains at the start + grains added, after every step.

     4. Undo: undoing every step gives back the start exactly, and the
        steps after that replay the undone ones.

     5. Counting recurrent piles. On a small domain every stable pile can
        be listed. The number of recurrent ones (by the burning test)
        must equal the determinant of the reduced Laplacian (Dhar 1990),
        which by Kirchhoff's matrix-tree theorem is also the number of
        spanning trees (G. Kirchhoff, Ann. Phys. Chem. 72 (1847)
        497-508). The determinant is computed separately below, by
        Gaussian elimination. The same listing checks the identity
        completely: adding it to every recurrent pile and toppling must
        give that pile back.

     6. The identity on bigger domains: it is stable and recurrent,
        e + e topples back to e, and c + e topples back to c for random
        recurrent piles c.

     7. No sink (torus): with fewer than |E| grains the pile always
        stabilizes, and with more than 2|E| - |V| it never does
        (Björner, Lovász and Shor 1991, Theorem 1.1; |V| = cells,
        |E| = neighbor pairs). The pile's "never stabilizes" answer
        must agree.

   Tests 2-6 also run on small balls of hyperbolic tilings and trees
   (makeBall, js/sim-hyperbolic.js), where every cell topples at p
   grains and grains fall off the ball's edge.

   Random numbers come from the library seedrandom, with fixed seeds,
   so the tests do the same thing every time.
   ===================================================================== */


/* ===================================================================
   DOMAINS USED BY THE TESTS
   =================================================================== */

// A box (or torus) and the threshold that goes with it.
function boxCase(name, width, height, neighbors, torus) {
  const d = boxDomain(width, height, neighbors, torus);
  return { name: name, options: { domain: d, threshold: neighbors } };
}

// A drawn-like domain: the cells (x, y) listed in "cells", with 4 or 8
// neighbors, as the graph tool would make it.
function shapeCase(name, cells, neighbors) {
  const index = new Map();
  cells.forEach(function (c, k) { index.set(c[0] + "," + c[1], k); });
  const steps = neighbors === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  const edges = [];
  cells.forEach(function (c, k) {
    for (const [dx, dy] of steps) {
      const other = index.get((c[0] + dx) + "," + (c[1] + dy));
      if (other !== undefined) edges.push([k, other]);
    }
  });
  const d = makeDomain(cells.map(function (c) { return c[0]; }), cells.map(function (c) { return c[1]; }), edges, null, null);
  return { name: name, options: { domain: d, threshold: neighbors } };
}

// A 6 x 6 box with a 2 x 2 hole in it and one corner missing.
function ringCells() {
  const cells = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (x >= 2 && x <= 3 && y >= 2 && y <= 3) continue;
      if (x === 5 && y === 5) continue;
      cells.push([x, y]);
    }
  }
  return cells;
}

// A ball of R steps around the start of a tiling {p,q} (q = Infinity:
// the tree of degree p), as the sim page makes it: every cell topples
// at p grains, so grains sent outside the ball are lost.
function ballCase(name, p, q, R) {
  const ball = makeBall(makeGraph({ kind: "tiling", p: p, q: q }), R, Infinity);
  return { name: name, options: { domain: ball, threshold: p } };
}

// A torus with its middle cell as the sink cell, as the sim page makes it.
function torusWithSink(name, size, neighbors) {
  const c = boxCase(name, size, size, neighbors, true);
  c.options.sinks = [middleCell(c.options.domain)];
  return c;
}

// Random starting heights 0 .. 2 * threshold - 1 (so plenty to topple),
// and 0 on sink cells.
function randomStart(c, random) {
  const pile = newPile(c.options);
  return pile.threshold.map(function (t, v) { return pile.isSink[v] ? 0 : Math.floor(random() * 2 * t); });
}

function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}


/* ===================================================================
   1. SAME PILES AS NADYA'S PYTHON
   =================================================================== */

// Made by running her file "sandpiles" (L = W = 25) for n = 32 .. 64.
// rows = the final pile, inside the smallest box around its sand, whose
// corner is the cell (x0, y0); every other cell is 0. topples = her
// numTopples.
const pythonPiles = [
  { n: 32, topples: 27, x0: 10, y0: 10, rows: ["01310", "12121", "31013", "12121", "01310"] },
  { n: 33, topples: 27, x0: 10, y0: 10, rows: ["01310", "12121", "31113", "12121", "01310"] },
  { n: 34, topples: 27, x0: 10, y0: 10, rows: ["01310", "12121", "31213", "12121", "01310"] },
  { n: 35, topples: 27, x0: 10, y0: 10, rows: ["01310", "12121", "31313", "12121", "01310"] },
  { n: 36, topples: 28, x0: 10, y0: 10, rows: ["01310", "12221", "32023", "12221", "01310"] },
  { n: 37, topples: 28, x0: 10, y0: 10, rows: ["01310", "12221", "32123", "12221", "01310"] },
  { n: 38, topples: 28, x0: 10, y0: 10, rows: ["01310", "12221", "32223", "12221", "01310"] },
  { n: 39, topples: 28, x0: 10, y0: 10, rows: ["01310", "12221", "32323", "12221", "01310"] },
  { n: 40, topples: 29, x0: 10, y0: 10, rows: ["01310", "12321", "33033", "12321", "01310"] },
  { n: 41, topples: 29, x0: 10, y0: 10, rows: ["01310", "12321", "33133", "12321", "01310"] },
  { n: 42, topples: 29, x0: 10, y0: 10, rows: ["01310", "12321", "33233", "12321", "01310"] },
  { n: 43, topples: 29, x0: 10, y0: 10, rows: ["01310", "12321", "33333", "12321", "01310"] },
  { n: 44, topples: 48, x0: 9, y0: 9, rows: ["0001000", "0031300", "0321230", "1110111", "0321230", "0031300", "0001000"] },
  { n: 45, topples: 48, x0: 9, y0: 9, rows: ["0001000", "0031300", "0321230", "1111111", "0321230", "0031300", "0001000"] },
  { n: 46, topples: 48, x0: 9, y0: 9, rows: ["0001000", "0031300", "0321230", "1112111", "0321230", "0031300", "0001000"] },
  { n: 47, topples: 48, x0: 9, y0: 9, rows: ["0001000", "0031300", "0321230", "1113111", "0321230", "0031300", "0001000"] },
  { n: 48, topples: 49, x0: 9, y0: 9, rows: ["0001000", "0031300", "0322230", "1120211", "0322230", "0031300", "0001000"] },
  { n: 49, topples: 49, x0: 9, y0: 9, rows: ["0001000", "0031300", "0322230", "1121211", "0322230", "0031300", "0001000"] },
  { n: 50, topples: 49, x0: 9, y0: 9, rows: ["0001000", "0031300", "0322230", "1122211", "0322230", "0031300", "0001000"] },
  { n: 51, topples: 49, x0: 9, y0: 9, rows: ["0001000", "0031300", "0322230", "1123211", "0322230", "0031300", "0001000"] },
  { n: 52, topples: 50, x0: 9, y0: 9, rows: ["0001000", "0031300", "0323230", "1130311", "0323230", "0031300", "0001000"] },
  { n: 53, topples: 50, x0: 9, y0: 9, rows: ["0001000", "0031300", "0323230", "1131311", "0323230", "0031300", "0001000"] },
  { n: 54, topples: 50, x0: 9, y0: 9, rows: ["0001000", "0031300", "0323230", "1132311", "0323230", "0031300", "0001000"] },
  { n: 55, topples: 50, x0: 9, y0: 9, rows: ["0001000", "0031300", "0323230", "1133311", "0323230", "0031300", "0001000"] },
  { n: 56, topples: 81, x0: 9, y0: 9, rows: ["0012100", "0221220", "1203021", "2130312", "1203021", "0221220", "0012100"] },
  { n: 57, topples: 81, x0: 9, y0: 9, rows: ["0012100", "0221220", "1203021", "2131312", "1203021", "0221220", "0012100"] },
  { n: 58, topples: 81, x0: 9, y0: 9, rows: ["0012100", "0221220", "1203021", "2132312", "1203021", "0221220", "0012100"] },
  { n: 59, topples: 81, x0: 9, y0: 9, rows: ["0012100", "0221220", "1203021", "2133312", "1203021", "0221220", "0012100"] },
  { n: 60, topples: 87, x0: 9, y0: 9, rows: ["0012100", "0222220", "1221221", "2210122", "1221221", "0222220", "0012100"] },
  { n: 61, topples: 87, x0: 9, y0: 9, rows: ["0012100", "0222220", "1221221", "2211122", "1221221", "0222220", "0012100"] },
  { n: 62, topples: 87, x0: 9, y0: 9, rows: ["0012100", "0222220", "1221221", "2212122", "1221221", "0222220", "0012100"] },
  { n: 63, topples: 87, x0: 9, y0: 9, rows: ["0012100", "0222220", "1221221", "2213122", "1221221", "0222220", "0012100"] },
  { n: 64, topples: 88, x0: 9, y0: 9, rows: ["0012100", "0222220", "1222221", "2220222", "1222221", "0222220", "0012100"] },
];

// Her final pile as one height per cell of a width x height box.
function pythonHeights(p, width, height) {
  const h = new Int32Array(width * height);
  p.rows.forEach(function (row, j) {
    for (let i = 0; i < row.length; i++) h[(p.y0 + j) * width + (p.x0 + i)] = Number(row[i]);
  });
  return h;
}

// Topple a center pile of n grains on a width x height box, either one
// random topple at a time or with the jump, and compare with her
// heights and topple count. Returns "" if they match, else what differs.
function compareCenterPile(n, width, height, heights, topples, oneAtATime, random) {
  const d = boxDomain(width, height, 4, false);
  const pile = newPile({ domain: d, threshold: 4 });
  pile.setHeights(startHeights(d, "center", { grains: n }));
  if (oneAtATime) { while (pile.step(random()) !== -1); }
  else pile.stabilize();
  const wrong = [];
  for (let v = 0; v < d.n; v++) {
    if (pile.height[v] !== heights[v]) wrong.push("(" + d.x[v] + ", " + d.y[v] + ")");
  }
  const problems = [];
  if (wrong.length > 0) problems.push("n = " + n + ": heights differ at " + wrong.slice(0, 5).join(", ") + (wrong.length > 5 ? "..." : ""));
  if (pile.topples !== topples) problems.push("n = " + n + ": " + pile.topples + " topples, Python " + topples);
  return problems.join("; ");
}

function testPython(oneAtATime) {
  const random = new Math.seedrandom("python");
  const problems = [];
  for (const p of pythonPiles) {
    const problem = compareCenterPile(p.n, 25, 25, pythonHeights(p, 25, 25), p.topples, oneAtATime, random);
    if (problem) problems.push(problem);
  }
  return problems.join("; ");
}


/* ===================================================================
   2-4. ABELIAN PROPERTY, CONSERVATION, UNDO
   =================================================================== */

const mainCases = [
  boxCase("box 7 x 5, 4 neighbors", 7, 5, 4, false),
  boxCase("box 6 x 6, 8 neighbors", 6, 6, 8, false),
  shapeCase("ring with a hole, 4 neighbors", ringCells(), 4),
  shapeCase("ring with a hole, 8 neighbors", ringCells(), 8),
  torusWithSink("torus 6 x 6 with a sink cell, 4 neighbors", 6, 4),
  torusWithSink("torus 5 x 5 with a sink cell, 8 neighbors", 5, 8),
  ballCase("ball of {7, 3}, R = 2", 7, 3, 2),
  ballCase("ball of the tree of degree 3, R = 3", 3, Infinity, 3),
];

// Topple until stable in four ways and compare the piles and the
// topples at every cell. Also checks conservation after every step.
function testAbelian(c) {
  const random = new Math.seedrandom("abelian " + c.name);
  const problems = [];
  for (let trial = 0; trial < 20; trial++) {
    const start = randomStart(c, random);
    const results = [];
    for (const way of ["order 1", "order 2", "rounds", "jump"]) {
      const pile = newPile(c.options);
      pile.setHeights(start);
      const order = new Math.seedrandom(way + trial);
      if (way === "jump") pile.stabilize();
      else {
        while (!pile.isStable()) {
          if (way === "rounds") pile.round(); else pile.step(order());
          if (pile.grains() + pile.lost !== pile.startGrains + pile.added) {
            return "grains not conserved (" + way + ")";
          }
        }
      }
      results.push(pile);
    }
    for (let k = 1; k < results.length; k++) {
      if (!sameList(results[k].height, results[0].height)) problems.push("trial " + trial + ": final piles differ");
      if (!sameList(results[k].odometer, results[0].odometer)) problems.push("trial " + trial + ": topples per cell differ");
    }
  }
  return problems.slice(0, 3).join("; ");
}

// Conservation while grains are also added and removed at random.
function testConservation(c) {
  const random = new Math.seedrandom("conservation " + c.name);
  const pile = newPile(c.options);
  pile.setHeights(randomStart(c, random));
  for (let k = 0; k < 20000; k++) {
    const u = random();
    if (u < 0.3) pile.dropGrain(random());
    else if (u < 0.35) pile.addGrains(Math.floor(random() * c.options.domain.n), -2);
    else if (u < 0.4) pile.round();
    else pile.step(random());
    if (pile.grains() + pile.lost !== pile.startGrains + pile.added) return "fails after " + (k + 1) + " moves";
    for (let v = 0; v < c.options.domain.n; v++) if (pile.height[v] < 0) return "a cell went below 0";
  }
  return "";
}

// Make 300 steps and rounds, undo them all, then replay them.
function testUndo(c) {
  const random = new Math.seedrandom("undo " + c.name);
  const pile = newPile(c.options);
  pile.setHeights(randomStart(c, random).map(function (h) { return h + 4; }));
  const start = Int32Array.from(pile.height);   // (sink cells hold 0)
  let made = 0;
  for (let k = 0; k < 300 && !pile.isStable(); k++) {
    if (random() < 0.2) pile.round(); else pile.step(random());
    made++;
  }
  const afterHeights = Int32Array.from(pile.height), afterTopples = pile.topples, afterLost = pile.lost;
  for (let k = 0; k < made; k++) if (!pile.undo()) return "undo stopped after " + k + " of " + made + " steps";
  if (pile.undo()) return "undo went past the start";
  if (!sameList(pile.height, start)) return "undoing everything did not give back the start";
  if (pile.topples !== 0 || pile.lost !== 0) return "counts did not go back to 0";
  for (let k = 0; k < made; k++) pile.step(random());
  if (!sameList(pile.height, afterHeights) || pile.topples !== afterTopples || pile.lost !== afterLost) {
    return "replaying the undone steps did not give the same pile";
  }
  return "";
}


/* ===================================================================
   5. COUNTING RECURRENT PILES, AND THE FULL IDENTITY CHECK
   =================================================================== */

const smallCases = [
  boxCase("box 2 x 2, 4 neighbors", 2, 2, 4, false),
  boxCase("box 3 x 3, 4 neighbors", 3, 3, 4, false),
  boxCase("box 3 x 2, 8 neighbors", 3, 2, 8, false),
  torusWithSink("torus 3 x 3 with a sink cell, 4 neighbors", 3, 4),
  shapeCase("L shape of 6 cells, 4 neighbors", [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2]], 4),
  ballCase("ball of {5, 4}, R = 1", 5, 4, 1),
  ballCase("ball of the tree of degree 3, R = 2", 3, Infinity, 2),
];

// The reduced Laplacian's determinant, straight from the definition:
// the cells that are not sink cells, threshold on the diagonal, -1 for
// each pair of neighbors. Gaussian elimination with the largest pivot.
function reducedLaplacianDeterminant(c) {
  const d = c.options.domain;
  const sinks = new Set(c.options.sinks || []);
  const cells = [];
  for (let v = 0; v < d.n; v++) if (!sinks.has(v)) cells.push(v);
  const position = new Map();
  cells.forEach(function (v, k) { position.set(v, k); });
  const m = cells.map(function () { return new Array(cells.length).fill(0); });
  cells.forEach(function (v, k) {
    m[k][k] = c.options.threshold;
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      if (position.has(d.nbr[e])) m[k][position.get(d.nbr[e])] -= 1;
    }
  });
  let det = 1;
  for (let col = 0; col < cells.length; col++) {
    let best = col;
    for (let row = col + 1; row < cells.length; row++) if (Math.abs(m[row][col]) > Math.abs(m[best][col])) best = row;
    if (m[best][col] === 0) return 0;
    if (best !== col) { [m[best], m[col]] = [m[col], m[best]]; det = -det; }
    det *= m[col][col];
    for (let row = col + 1; row < cells.length; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < cells.length; k++) m[row][k] -= factor * m[col][k];
    }
  }
  return Math.round(det);
}

// List every stable pile, count the recurrent ones, and check the
// identity against every recurrent pile.
function testCount(c) {
  const pile = newPile(c.options);
  const adder = newPile(c.options);
  const d = c.options.domain;
  const e = pile.identity();
  const h = new Int32Array(d.n);
  let recurrent = 0, identityFails = 0;
  // Count through all piles like an odometer: cell 0 runs fastest.
  while (true) {
    pile.setHeights(h);
    if (pile.isRecurrent()) {
      recurrent++;
      adder.setHeights(h.map(function (x, v) { return x + e[v]; }));
      adder.stabilize();
      if (!sameList(adder.height, pile.height)) identityFails++;
    }
    let v = 0;
    while (v < d.n) {
      if (pile.isSink[v] || h[v] === pile.threshold[v] - 1) { h[v] = 0; v++; }
      else { h[v]++; break; }
    }
    if (v === d.n) break;
  }
  const det = reducedLaplacianDeterminant(c);
  const problems = [];
  if (recurrent !== det) problems.push(recurrent + " recurrent piles, but the determinant is " + det);
  if (identityFails > 0) problems.push("the identity failed on " + identityFails + " recurrent piles");
  return { problem: problems.join("; "), text: recurrent + " recurrent piles = determinant " + det + "; identity works on all of them" };
}


/* ===================================================================
   6. THE IDENTITY ON BIGGER DOMAINS
   =================================================================== */

const identityCases = [
  boxCase("box 1 x 1, 4 neighbors", 1, 1, 4, false),
  boxCase("box 25 x 25, 4 neighbors", 25, 25, 4, false),
  boxCase("box 30 x 17, 4 neighbors", 30, 17, 4, false),
  boxCase("box 20 x 20, 8 neighbors", 20, 20, 8, false),
  shapeCase("ring with a hole, 4 neighbors", ringCells(), 4),
  shapeCase("ring with a hole, 8 neighbors", ringCells(), 8),
  torusWithSink("torus 21 x 21 with a sink cell, 4 neighbors", 21, 4),
  torusWithSink("torus 15 x 15 with a sink cell, 8 neighbors", 15, 8),
  ballCase("ball of {7, 3}, R = 4", 7, 3, 4),
  ballCase("ball of the tree of degree 3, R = 6", 3, Infinity, 6),
];

function testIdentity(c) {
  const random = new Math.seedrandom("identity " + c.name);
  const pile = newPile(c.options);
  const e = pile.identity();
  pile.setHeights(e);
  if (!pile.isStable()) return "the identity is not stable";
  if (!pile.isRecurrent()) return "the identity is not recurrent";
  pile.setHeights(e.map(function (x) { return 2 * x; }));
  pile.stabilize();
  if (!sameList(pile.height, e)) return "e + e does not topple back to e";
  for (let trial = 0; trial < 10; trial++) {
    // A random recurrent pile: M plus random grains, toppled.
    pile.setHeights(pile.fullest().map(function (m) { return m + Math.floor(random() * 4); }));
    pile.stabilize();
    const recurrentPile = Int32Array.from(pile.height);
    pile.setHeights(recurrentPile.map(function (x, v) { return x + e[v]; }));
    pile.stabilize();
    if (!sameList(pile.height, recurrentPile)) return "c + e did not topple back to c (trial " + trial + ")";
  }
  return "";
}


/* ===================================================================
   7. NO SINK: THE TORUS
   =================================================================== */

const noSinkCases = [
  boxCase("torus 3 x 3, 4 neighbors", 3, 3, 4, true),
  boxCase("torus 5 x 4, 4 neighbors", 5, 4, 4, true),
  boxCase("torus 4 x 4, 8 neighbors", 4, 4, 8, true),
];

function testNoSink(c) {
  const random = new Math.seedrandom("no sink " + c.name);
  const d = c.options.domain;
  const cells = d.n, pairs = d.first[d.n] / 2;
  const pile = newPile(c.options);
  if (pile.hasSink) return "the torus should have no sink";
  if (pile.identity() !== null) return "a torus without a sink should have no identity";
  for (let trial = 0; trial < 200; trial++) {
    for (const grains of [pairs - 1, 2 * pairs - cells + 1, pairs + Math.floor(random() * (pairs - cells + 1))]) {
      pile.setHeights(new Int32Array(cells));
      for (let k = 0; k < grains; k++) pile.dropGrain(random());
      const stabilized = pile.stabilize();
      if (grains < pairs && !stabilized) return grains + " grains (fewer than |E| = " + pairs + ") did not stabilize";
      if (grains > 2 * pairs - cells && stabilized) return grains + " grains (more than 2|E| - |V|) stabilized";
      if (!stabilized) {
        // Check the answer: it keeps toppling for a long time.
        for (let k = 0; k < 5000; k++) if (pile.step(random()) === -1) return "said 'never stabilizes' but it did";
      }
    }
  }
  return "";
}


/* ===================================================================
   THE PAGE: run the tests and fill in the table
   (addRow, runChecksOnClick and readNumbers are in js/check-page.js)
   =================================================================== */

// Add a row for a test that returns "" when all is well.
function plainTest(name, run, okText) {
  return function () {
    let problem;
    try { problem = run(); } catch (error) { problem = "error: " + error.message; }
    addRow(name, problem === "", problem || okText);
  };
}

// The list of tests, run one at a time by the "Run the checks" button.
function allTests() {
  const tests = [];
  tests.push(plainTest("Same as your Python: center piles n = 32 .. 64, one random topple at a time",
    function () { return testPython(true); }, "all 33 piles and topple counts match"));
  tests.push(plainTest("Same as your Python: center piles n = 32 .. 64, jump to the end",
    function () { return testPython(false); }, "all 33 piles and topple counts match"));
  for (const c of mainCases) {
    tests.push(plainTest("Abelian: " + c.name, function () { return testAbelian(c); },
      "2 random orders, rounds and the jump agree in 20 trials"));
  }
  for (const c of mainCases) {
    tests.push(plainTest("Grains conserved: " + c.name, function () { return testConservation(c); },
      "holds after 20000 moves (topples, rounds, added and removed grains)"));
  }
  for (const c of mainCases) {
    tests.push(plainTest("Undo: " + c.name, function () { return testUndo(c); },
      "undoing every step gives back the start, and replaying gives the same pile"));
  }
  for (const c of smallCases) {
    tests.push(function () {
      let result;
      try { result = testCount(c); } catch (error) { result = { problem: "error: " + error.message }; }
      addRow("Recurrent piles and identity: " + c.name, result.problem === "", result.problem || result.text);
    });
  }
  for (const c of identityCases) {
    tests.push(plainTest("Identity: " + c.name, function () { return testIdentity(c); },
      "stable, recurrent, e + e = e, and c + e = c for 10 random recurrent c"));
  }
  for (const c of noSinkCases) {
    tests.push(plainTest("No sink: " + c.name, function () { return testNoSink(c); },
      "'never stabilizes' agrees with the |E| and 2|E| - |V| bounds in 200 trials"));
  }
  return tests;
}

runChecksOnClick(allTests);

// Her own run: each line is "n numTopples [[...], [...], ...]".
byId("compare-pasted").addEventListener("click", function () {
  const width = Number(byId("pasted-length").value);
  const height = Number(byId("pasted-width").value);
  const out = byId("pasted-result");
  const lines = byId("pasted-runs").value.split("\n").filter(function (line) { return line.trim() !== ""; });
  if (lines.length === 0) { out.textContent = "Paste your printed lines first."; return; }
  const problems = [];
  for (const line of lines) {
    const numbers = readNumbers(line);
    if (numbers.length !== 2 + width * height) {
      problems.push("a line has " + (numbers.length - 2) + " heights; L x W = " + (width * height));
      continue;
    }
    // Her sandpiles[y][x] is printed row by row: row y, then x along it.
    const heights = Int32Array.from(numbers.slice(2));
    const problem = compareCenterPile(numbers[0], width, height, heights, numbers[1], false, null);
    if (problem) problems.push(problem);
  }
  out.textContent = problems.length === 0
    ? "✓ All " + lines.length + " runs match your Python."
    : "✗ " + problems.join("; ");
});
