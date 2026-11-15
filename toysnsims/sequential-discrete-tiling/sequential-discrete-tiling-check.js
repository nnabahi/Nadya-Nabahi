/* =====================================================================
   sequential-discrete-tiling-check.js  —  the tests on
   sequential-discrete-tiling-check.html
   ---------------------------------------------------------------------
   Tests of the packing in sequential-discrete-tiling-packing.js:

     1. The squares. In the middle of many runs (on boxes, polyominoes
        and ragged regions), for every uncovered cell U, the quick search
        (largestSquares) finds the same k and the same squares as trying
        every square plainly.
     2. Every tile. After every tile of whole runs, some with clicked
        cells: it lay on uncovered cells of D, it holds its U, no bigger
        square of uncovered cells held U, and in the end every cell is
        covered by exactly one tile.
     3. The odds. On small domains every possible packing is listed with
        its exact chance (going through every U and every square, each
        with its chance), and many runs must match them (chi-square).
     4. The Betti numbers. After every tile, the pieces (tiles joined
        across sides or corners) and the holes (countHoles, a flood
        fill, in js/check-page.js) counted plainly match the packing's.
     5. The same seed gives the same packing.

   The p-values come from jStat. Each packing draws its own random
   numbers from its seed, so the tests do the same thing every time.
   ===================================================================== */

// Some cells, as { x, y } (lists), from a list of [x, y] pairs.
function cellLists(pairs) {
  return { x: Int32Array.from(pairs, function (p) { return p[0]; }), y: Int32Array.from(pairs, function (p) { return p[1]; }) };
}

// The cells of a width x height box, but those with out(x, y) true (if
// "out" is given).
function boxCells(width, height, out) {
  const pairs = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!out || !out(x, y)) pairs.push([x, y]);
  return cellLists(pairs);
}

// A ragged region: each cell of a size x size box with chance 0.8.
function raggedCells(size, seed) {
  const random = seededUniform(seed), pairs = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (random.uniform(y * size + x) < 0.8) pairs.push([x, y]);
  return cellLists(pairs);
}

// The domains of tests 1, 2 and 4.
function testDomains() {
  return [
    { name: "a 12 x 9 box", cells: boxCells(12, 9) },
    { name: "a 16 x 12 box", cells: boxCells(16, 12) },
    { name: "a 150-cell polyomino", cells: polyominoCells({ cells: 150, most: 1, seed: "check", moves: 100000 }) },
    { name: "a ragged region", cells: raggedCells(20, "ragged") },
  ];
}

// Is the square of side k with lowest, leftmost cell (a, b) all on
// uncovered cells of D? "uncovered" is a Set of "x,y".
function squareIsFree(uncovered, a, b, k) {
  for (let y = b; y < b + k; y++) for (let x = a; x < a + k; x++) if (!uncovered.has(x + "," + y)) return false;
  return true;
}

// k_n and its squares for an uncovered cell U = (ux, uy), plainly: for
// k = 1, 2, 3, ..., every square of side k holding U, until there are
// none (then there are none bigger either: a bigger one would hold one
// of side k that holds U).
function plainSquares(uncovered, ux, uy) {
  let found = { size: 0, corners: [] };
  for (let k = 1; ; k++) {
    const corners = [];
    for (let b = uy - k + 1; b <= uy; b++) {
      for (let a = ux - k + 1; a <= ux; a++) if (squareIsFree(uncovered, a, b, k)) corners.push([a, b]);
    }
    if (corners.length === 0) return found;
    found = { size: k, corners: corners };
  }
}

// The uncovered cells of a packing of "cells", as a Set of "x,y".
function uncoveredSet(packing, cells) {
  const set = new Set();
  for (let v = 0; v < cells.x.length; v++) if (packing.tileOf[v] === -1) set.add(cells.x[v] + "," + cells.y[v]);
  return set;
}

// Two answers { size, corners } the same?
function sameSquares(p, q) {
  const text = function (r) { return r.size + ":" + r.corners.map(String).sort().join(" "); };
  return text(p) === text(q);
}


/* 1. The squares. */
function testSquares() {
  let checks = 0, problem = "";
  for (const domain of testDomains()) {
    const cells = domain.cells, n = cells.x.length;
    for (let run = 0; run < 3 && !problem; run++) {
      const packing = newSquareTiling({ x: cells.x, y: cells.y, seed: "squares " + run });
      const stop = Math.floor(n * (run + 1) / 8);   // look after covering about an 8th, a 4th, ...
      while (packing.covered < stop) packing.step();
      const uncovered = uncoveredSet(packing, cells);
      for (let u = 0; u < n && !problem; u++) {
        if (packing.tileOf[u] !== -1) continue;
        const quick = packing.largestSquares(u), plain = plainSquares(uncovered, cells.x[u], cells.y[u]);
        checks++;
        if (!sameSquares(quick, plain)) {
          problem = domain.name + ", U = (" + cells.x[u] + ", " + cells.y[u] + "): found k = " + quick.size + " with " +
                    quick.corners.length + " squares, plainly k = " + plain.size + " with " + plain.corners.length;
        }
      }
    }
  }
  addRow("The squares", !problem, problem ||
         checks.toLocaleString() + " uncovered cells, in the middle of runs on boxes, a polyomino and a ragged region: " +
         "the quick search found the same k and the same squares as trying every square.");
}

/* 2. Every tile. */
function testTiles() {
  let tiles = 0, problem = "";
  for (const domain of testDomains()) {
    const cells = domain.cells, n = cells.x.length;
    const packing = newSquareTiling({ x: cells.x, y: cells.y, seed: "tiles" });
    const inD = new Set(), clicker = seededUniform("clicks");
    for (let v = 0; v < n; v++) inD.add(cells.x[v] + "," + cells.y[v]);
    while (packing.covered < n && !problem) {
      const uncovered = uncoveredSet(packing, cells), t = packing.placed;
      // Every 5th tile, U is "clicked": a random cell, maybe covered already.
      const chosen = t % 5 === 4 ? Math.floor(clicker.uniform(t) * n) : undefined;
      const chosenFree = chosen !== undefined && packing.tileOf[chosen] === -1;
      packing.step(chosen);
      tiles++;
      const tx = packing.tiles.x[t], ty = packing.tiles.y[t], k = packing.tiles.size[t], u = packing.tiles.u[t];
      const ux = cells.x[u], uy = cells.y[u], where = domain.name + ", tile " + (t + 1) + ": ";
      if (!squareIsFree(uncovered, tx, ty, k)) problem = where + "it lies on a covered cell or outside D";
      else if (ux < tx || ux >= tx + k || uy < ty || uy >= ty + k) problem = where + "it doesn't hold its U";
      else if (plainSquares(uncovered, ux, uy).size !== k) problem = where + "a bigger square held U";
      else if (chosenFree && u !== chosen) problem = where + "the clicked cell wasn't its U";
    }
    if (problem) break;
    const sum = packing.tiles.size.reduce(function (s, k) { return s + k * k; }, 0);
    if (sum !== n || packing.tileOf.some(function (t) { return t === -1; })) {
      problem = domain.name + ": at the end, the tiles' areas add up to " + sum + " for " + n + " cells";
    }
  }
  addRow("Every tile", !problem, problem ||
         tiles.toLocaleString() + " tiles in whole runs (every 5th U clicked): each lay on uncovered cells of D, held " +
         "its U, and was as big as a square holding U can be; in the end every cell was covered once.");
}

/* 3. The odds. */

// Every possible packing of "cells", each with its exact chance, as a
// Map from the packing's name (its tiles, as "x,y,k", sorted) to its
// chance. From a set of covered cells (a whole number, one bit per
// cell), each uncovered U has chance 1 / (uncovered cells), and then
// each of its squares (plainSquares) 1 / (their number). The chances
// from each set of covered cells are worked out once.
function exactPackings(cells) {
  const n = cells.x.length, bitOf = new Map(), known = new Map();
  for (let v = 0; v < n; v++) bitOf.set(cells.x[v] + "," + cells.y[v], v);
  function from(covered) {
    if (covered === (1 << n) - 1) return new Map([["", 1]]);
    if (known.has(covered)) return known.get(covered);
    const uncovered = new Set(), law = new Map();
    for (let v = 0; v < n; v++) if (!(covered & (1 << v))) uncovered.add(cells.x[v] + "," + cells.y[v]);
    for (let u = 0; u < n; u++) {
      if (covered & (1 << u)) continue;
      const found = plainSquares(uncovered, cells.x[u], cells.y[u]), k = found.size;
      for (const [a, b] of found.corners) {
        let more = covered;
        for (let y = b; y < b + k; y++) for (let x = a; x < a + k; x++) more |= 1 << bitOf.get(x + "," + y);
        const chance = 1 / uncovered.size / found.corners.length;
        for (const [rest, p] of from(more)) {
          const name = rest.split(" ").concat([a + "," + b + "," + k]).filter(Boolean).sort().join(" ");
          law.set(name, (law.get(name) || 0) + chance * p);
        }
      }
    }
    known.set(covered, law);
    return law;
  }
  return from(0);
}

// How often each packing came up in "runs" runs, each with its own seed.
function packingCounts(cells, runs) {
  const seen = new Map();
  for (let r = 0; r < runs; r++) {
    const packing = newSquareTiling({ x: cells.x, y: cells.y, seed: "odds " + r });
    while (packing.step()) { /* place every tile */ }
    const t = packing.tiles;
    const name = t.x.map(function (x, i) { return x + "," + t.y[i] + "," + t.size[i]; }).sort().join(" ");
    seen.set(name, (seen.get(name) || 0) + 1);
  }
  return seen;
}

function testOdds(name, cells, runs) {
  const result = exactOddsTest(exactPackings(cells), packingCounts(cells, runs), runs, "packings");
  addRow(name, result.pass, result.text + ".");
}


/* 4. The Betti numbers. */

// The pieces of some cells (a list of [x, y]), joined across sides or
// corners, plainly.
function plainPieces(cells) {
  const left = new Set(cells.map(String));
  let pieces = 0;
  for (const start of cells) {
    if (!left.has(String(start))) continue;
    pieces++;
    left.delete(String(start));
    const todo = [start];
    while (todo.length > 0) {
      const [x, y] = todo.pop();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = (x + dx) + "," + (y + dy);
          if (left.has(key)) { left.delete(key); todo.push([x + dx, y + dy]); }
        }
      }
    }
  }
  return pieces;
}

function testBetti() {
  let tiles = 0, mostHoles = 0, mostPieces = 0, problem = "";
  for (const domain of testDomains().slice(0, 3).concat([{ name: "a 60-cell ragged region", cells: raggedCells(9, "betti") }])) {
    const cells = domain.cells, n = cells.x.length;
    const packing = newSquareTiling({ x: cells.x, y: cells.y, seed: "betti" });
    while (packing.step() && !problem) {
      tiles++;
      const covered = [];
      for (let v = 0; v < n; v++) if (packing.tileOf[v] !== -1) covered.push([cells.x[v], cells.y[v]]);
      const mine = packing.numbers(), pieces = plainPieces(covered), holes = countHoles(covered);
      mostHoles = Math.max(mostHoles, holes);
      mostPieces = Math.max(mostPieces, pieces);
      if (mine.pieces !== pieces || mine.holes !== holes) {
        problem = domain.name + ", tile " + packing.placed + ": beta_0 = " + mine.pieces + ", beta_1 = " + mine.holes +
                  ", counted plainly " + pieces + " and " + holes;
      }
    }
  }
  addRow("The Betti numbers", !problem, problem ||
         "After each of " + tiles.toLocaleString() + " tiles (up to " + mostPieces + " pieces and " + mostHoles +
         " holes): the pieces and holes of the covered cells match a plain count.");
}

/* 5. Same seed, same packing. */
function testSameSeed() {
  const cells = polyominoCells({ cells: 200, most: 1, seed: "again", moves: 50000 });
  const a = newSquareTiling({ x: cells.x, y: cells.y, seed: "again" }), b = newSquareTiling({ x: cells.x, y: cells.y, seed: "again" });
  while (a.step()) { /* place every tile */ }
  while (b.step()) { /* place every tile */ }
  const same = a.placed === b.placed && a.tileOf.every(function (t, v) { return t === b.tileOf[v]; });
  addRow("Same seed, same packing", same, "Two packings of a 200-cell polyomino with the same seed: " +
         (same ? "the same " + a.placed + " tiles." : "different tiles."));
}


runChecksOnClick(function () {
  return [
    testSquares,
    testTiles,
    // (Not square boxes: on those the first tile is the whole box.)
    function () { testOdds("The odds, a 7 x 2 box", boxCells(7, 2), 20000); },
    function () { testOdds("The odds, an 8 x 3 box", boxCells(8, 3), 30000); },
    function () {
      testOdds("The odds, a 6 x 4 box without a 2 x 2 corner", boxCells(6, 4, function (x, y) { return x >= 4 && y >= 2; }), 30000);
    },
    function () {
      testOdds("The odds, a 5 x 5 box with a hole in the middle", boxCells(5, 5, function (x, y) { return x === 2 && y === 2; }), 30000);
    },
    testBetti,
    testSameSeed,
  ];
});
