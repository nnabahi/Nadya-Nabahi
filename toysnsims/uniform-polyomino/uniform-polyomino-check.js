/* =====================================================================
   uniform-polyomino-check.js  —  the tests on uniform-polyomino-check.html
   ---------------------------------------------------------------------
   Tests of the chain in js/sim-polyomino.js:

     1. Counting. Every polyomino with N cells is listed here plainly
        (grow each one with N - 1 cells by one cell in every possible
        way, and keep one copy of each shape), and the counts must be
        1, 2, 6, 19, 63, 216, 760, 2725 (OEIS A001168; D. H.
        Redelmeier, Discrete Math. 36 (1981) 191-203). The lists are the
        exact answers the next tests compare with.
     2. Uniform. With both sliders at 0, the chain run for a long time
        visits every polyomino equally often: N = 4 (19 of them) and
        N = 5 (63) with K = 1 (Roldán's chain), N = 5 and N = 6 (216)
        with K = 3 (the batch move). A chi-square test on one shape
        every few moves.
     3. The sliders. With b and s not 0, each polyomino P comes up in
        proportion to exp(b L(P) + s T(P)), its edge and site perimeter
        counted here plainly.
     4. The touch rule matters. The same chain without it (on N = 4,
        up to 2 cells per move) is NOT uniform: this row passes when
        the chi-square test finds the bias.
     5. The numbers. After every move of a long run (N = 30, up to 4
        cells per move, both sliders on), and every 100 moves of a small
        polyomino that drifts far (so the chain makes new grids around
        it), the chain's own numbers (edge perimeter, site perimeter,
        cycles, holes) match those counted plainly from its cells (the
        holes by a flood fill, countHoles in js/check-page.js), and its
        cells are N different cells in one connected piece.
     6. The same seed gives the same run.

   The p-values come from jStat. Each chain draws its own random
   numbers from its seed, so the tests do the same thing every time.
   ===================================================================== */

const SIDE_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];


// A polyomino's cells, as [x, y] pairs, moved so its lowest x and its
// lowest y are 0, and named by a text: the same text for two
// translates of one shape, a different one otherwise.
function shapeName(cells) {
  let xmin = Infinity, ymin = Infinity;
  for (const [x, y] of cells) { xmin = Math.min(xmin, x); ymin = Math.min(ymin, y); }
  return cells.map(function ([x, y]) { return (x - xmin) + "," + (y - ymin); }).sort().join(" ");
}

// The cells of the chain now, as [x, y] pairs.
function chainCells(chain) {
  return Array.from(chain.x, function (x, i) { return [x, chain.y[i]]; });
}

// Every polyomino with 1, 2, ..., most cells: shapes[N] maps each one's
// name (shapeName) to its cells.
function allPolyominoes(most) {
  const shapes = [null, new Map([[shapeName([[0, 0]]), [[0, 0]]]])];
  for (let N = 2; N <= most; N++) {
    const grown = new Map();
    for (const cells of shapes[N - 1].values()) {
      const taken = new Set(cells.map(function ([x, y]) { return x + "," + y; }));
      for (const [x, y] of cells) {
        for (const [dx, dy] of SIDE_STEPS) {
          if (taken.has((x + dx) + "," + (y + dy))) continue;
          const bigger = cells.concat([[x + dx, y + dy]]), name = shapeName(bigger);
          if (!grown.has(name)) grown.set(name, bigger);
        }
      }
    }
    shapes.push(grown);
  }
  return shapes;
}

// The edge perimeter, site perimeter, cycles and holes of some cells,
// counted plainly.
function plainNumbers(cells) {
  const taken = new Set(cells.map(function ([x, y]) { return x + "," + y; }));
  const rim = new Set();
  let sides = 0;
  for (const [x, y] of cells) {
    for (const [dx, dy] of SIDE_STEPS) {
      const key = (x + dx) + "," + (y + dy);
      if (taken.has(key)) continue;
      sides++;
      rim.add(key);
    }
  }
  const shared = (4 * cells.length - sides) / 2;
  return { edgePerimeter: sides, sitePerimeter: rim.size, cycles: shared - cells.length + 1, holes: countHoles(cells) };
}

// Are the cells one piece, joined across shared sides?
function isConnected(cells) {
  const taken = new Set(cells.map(function ([x, y]) { return x + "," + y; }));
  const start = cells[0][0] + "," + cells[0][1], seen = new Set([start]), todo = [cells[0]];
  while (todo.length > 0) {
    const [x, y] = todo.pop();
    for (const [dx, dy] of SIDE_STEPS) {
      const key = (x + dx) + "," + (y + dy);
      if (taken.has(key) && !seen.has(key)) { seen.add(key); todo.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}

// How often the chain with "options" visits each shape: "runs" shapes,
// one every "gap" moves, after "warmup" moves.
function visits(options, runs, gap, warmup) {
  const chain = newPolyomino(options), seen = new Map();
  while (chain.moves < warmup) chain.step();
  for (let r = 0; r < runs; r++) {
    for (let k = 0; k < gap; k++) chain.step();
    const name = shapeName(chainCells(chain));
    seen.set(name, (seen.get(name) || 0) + 1);
  }
  return seen;
}

// The exact law: each shape of "shapes" (a Map, name -> cells) with
// chance proportional to exp(b L + s T).
function exactLaw(shapes, b, s) {
  const weights = new Map();
  let total = 0;
  for (const [name, cells] of shapes) {
    const n = plainNumbers(cells), w = Math.exp(b * n.edgePerimeter + s * n.sitePerimeter);
    weights.set(name, w);
    total += w;
  }
  for (const [name, w] of weights) weights.set(name, w / total);
  return weights;
}

const SHAPES = allPolyominoes(8);


/* 1. Counting. */
function testCounts() {
  const counts = SHAPES.slice(1).map(function (m) { return m.size; });
  const known = [1, 2, 6, 19, 63, 216, 760, 2725];
  addRow("Counting polyominoes", counts.join() === known.join(),
         "With 1 to 8 cells: " + counts.join(", ") + " (OEIS A001168: " + known.join(", ") + ").");
}

/* 2. Uniform, and 3. the sliders. */
function testLaw(name, N, most, b, s, runs, gap) {
  const seen = visits({ cells: N, most: most, edgeHeat: b, siteHeat: s, seed: name }, runs, gap, 5000);
  const result = exactOddsTest(exactLaw(SHAPES[N], b, s), seen, runs, "polyominoes");
  addRow(name, result.pass, result.text + " (one every " + gap + " moves).");
}

/* 4. Without the touch rule, the chain is wrong. */
function testTouchRule() {
  const runs = 20000, gap = 10;
  const seen = visits({ cells: 4, most: 2, seed: "no touch rule", noTouchRule: true }, runs, gap, 5000);
  const test = pooledChiSquare(exactLaw(SHAPES[4], 0, 0), seen, runs);
  addRow("Without the touch rule it is not uniform", test.pValue < 0.001,
         "N = 4, up to 2 cells per move, no touch rule: chi-square " + test.statistic.toFixed(1) + " with " +
         test.degrees + " degrees of freedom, p = " + test.pValue.toExponential(1) +
         " (passes when p is below 0.001: the bias is found).");
}

/* 5. The numbers: after every move of a 30-cell polyomino, and every
   100 moves of a small one that drifts far across its grid (so the
   chain makes new grids around it many times). */
function testNumbers() {
  const runs = [
    { options: { cells: 30, most: 4, edgeHeat: -0.2, siteHeat: 0.1, seed: "numbers" }, moves: 3000, every: 1 },
    { options: { cells: 8, most: 2, seed: "drift" }, moves: 200000, every: 100 },
  ];
  let problem = "", mostHoles = 0, far = 0;
  for (const run of runs) {
    const chain = newPolyomino(run.options), N = run.options.cells;
    for (let m = 1; m <= run.moves && !problem; m++) {
      chain.step();
      if (m % run.every !== 0) continue;
      const cells = chainCells(chain), mine = chain.numbers(), plain = plainNumbers(cells);
      mostHoles = Math.max(mostHoles, plain.holes);
      far = Math.max(far, Math.abs(chain.x[0]), Math.abs(chain.y[0]));
      if (new Set(cells.map(String)).size !== N) problem = "move " + m + ": two cells are the same";
      else if (!isConnected(cells)) problem = "move " + m + ": the cells are not one piece";
      for (const key of ["edgePerimeter", "sitePerimeter", "cycles", "holes"]) {
        if (!problem && mine[key] !== plain[key]) problem = "move " + m + ": " + key + " " + mine[key] + ", counted plainly " + plain[key];
      }
    }
  }
  addRow("The chain's numbers", !problem,
         problem || "3000 moves of a 30-cell polyomino (up to " + mostHoles + " holes) and 200,000 of an 8-cell one " +
         "(which drifted " + far + " squares away): edge and site perimeter, cycles and holes all match a plain " +
         "count, and it stays one piece.");
}

/* 6. Same seed, same run. */
function testSameSeed() {
  const options = { cells: 50, most: 3, edgeHeat: 0.1, siteHeat: -0.1, seed: "again" };
  const a = newPolyomino(options), b = newPolyomino(options);
  for (let m = 0; m < 2000; m++) { a.step(); b.step(); }
  const same = shapeName(chainCells(a)) === shapeName(chainCells(b)) && a.changed === b.changed;
  addRow("Same seed, same run", same, "Two chains with the same seed, 2000 moves each: " +
         (same ? "the same polyomino." : "different polyominoes."));
}


runChecksOnClick(function () {
  return [
    testCounts,
    function () { testLaw("Uniform, N = 4, one cell per move", 4, 1, 0, 0, 20000, 10); },
    function () { testLaw("Uniform, N = 5, one cell per move", 5, 1, 0, 0, 30000, 10); },
    function () { testLaw("Uniform, N = 5, up to 3 cells per move", 5, 3, 0, 0, 30000, 10); },
    function () { testLaw("Uniform, N = 6, up to 3 cells per move", 6, 3, 0, 0, 40000, 20); },
    function () { testLaw("Sliders b = 0.4, s = -0.3, N = 5", 5, 2, 0.4, -0.3, 30000, 10); },
    function () { testLaw("Sliders b = -0.5, s = 0.2, N = 6", 6, 1, -0.5, 0.2, 40000, 20); },
    testTouchRule,
    testNumbers,
    testSameSeed,
  ];
});
