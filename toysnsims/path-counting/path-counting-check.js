/* =====================================================================
   path-counting-check.js  —  the tests on path-counting-check.html
   ---------------------------------------------------------------------
   Eight kinds of test of path-counting-math.js:

     1. All edges open: f(x, y) must be the binomial coefficient
        C(x + y, x), the number of lattice paths (NIST DLMF §26.3,
        https://dlmf.nist.gov/26.3), worked out exactly here with
        whole numbers of any size (JavaScript's BigInt).

     2. Every path listed: on small grids, every path from (x, y) to
        (0, 0) is walked one by one, written separately from the sim,
        and the products of the weights along them are added up. That
        must match f, for random open/closed edges and for random
        weights.

     3. Reading formulas: Desmos's piecewise {condition: a, b} and the
        rest, on a few formulas with known answers.

     4. Your periodic rule, as typed in the sim, must open exactly the
        edges its definition says (d(y) = 3 when u(y) < p, else 2; the
        step down from (x, y) is open when d(y) divides x).

     5. u(...): the same input and seed give the same number; another
        seed gives another; and 100,000 of them fall equally often in 10
        equal parts of [0, 1) (Pearson's chi-square test, from
        js/check-page.js). Coupling: an edge open at p = 0.3 is still
        open at p = 0.6.

     6. The line a x + b y = c: every point listed is on it and in the
        grid, and no point is missing (checked against all the grid
        points).

     7. Normalizing: with "normalized", the largest height on every line
        that a path reaches is exactly 1; the other two ways go from
        0 to 1.

     8. The bell curve: with all edges open, f along x + y = c divided
        by its sum is the Binomial(c, 1/2) distribution, so its mean is
        c/2 and its standard deviation sqrt(c)/2 exactly; and by the de
        Moivre-Laplace theorem (W. Feller, "An Introduction to
        Probability Theory and Its Applications", Vol. 1, 3rd ed.,
        Wiley, 1968, Chapter VII) the bars are within 0.005 of the
        Gaussian curve at c = 200.

   Plus the gray note's checks: weights of 0 and 1 only don't count as
   "outside {0,1}", a weight of 2 does, and negative weights are counted.
   ===================================================================== */

// A weight function from formula text, as the sim makes it.
function typed(text, values, N, seed) {
  return weightFunction(readTree(text), values || {}, N, uniformFor(seed || "check"));
}

// Close enough, for numbers that may be huge: relative error below "tolerance".
function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}


/* 1. All edges open --------------------------------------------------- */
function testBinomial() {
  const N = 60, paths = countPaths(N, function () { return 1; }, function () { return 1; });
  // Pascal's triangle with BigInt: row[n][k] = C(n, k).
  const rows = [[1n]];
  for (let n = 1; n <= 2 * N; n++) {
    const row = [1n];
    for (let k = 1; k < n; k++) row.push(rows[n - 1][k - 1] + rows[n - 1][k]);
    row.push(1n);
    rows.push(row);
  }
  let worst = 0, worstAt = "";
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    // log of the exact BigInt: from its digits (only the first 17 matter).
    const digits = rows[x + y][x].toString();
    const exactLog = Math.log(Number(digits.slice(0, 17))) + (digits.length - Math.min(17, digits.length)) * Math.LN10;
    const error = Math.abs(paths.logF[spot(N, x, y)] - exactLog);
    if (error > worst) { worst = error; worstAt = "(" + x + ", " + y + ")"; }
  }
  addRow("All edges open: f(x, y) = C(x + y, x) on the 61 × 61 grid", worst < 1e-12,
    "Largest difference in log f: " + worst.toExponential(2) + (worstAt ? " at " + worstAt : "") +
    ". f(60, 60) = " + bigNumberText(paths.logF[spot(N, 60, 60)]) + " (C(120, 60) = 9.66 × 10^34).");
}


/* 2. Every path listed ------------------------------------------------- */
// The sum over all paths from (x, y) to (0, 0) of the product of the
// weights, by walking every path (written without the recursion's table).
function sumOverPaths(x, y, weightX, weightY) {
  if (x === 0 && y === 0) return 1;
  let total = 0;
  if (x > 0) { const w = Math.max(0, weightX(x, y) || 0); if (w > 0) total += w * sumOverPaths(x - 1, y, weightX, weightY); }
  if (y > 0) { const w = Math.max(0, weightY(x, y) || 0); if (w > 0) total += w * sumOverPaths(x, y - 1, weightX, weightY); }
  return total;
}

function testEveryPath() {
  const N = 7;
  const cases = [
    ["open with chance 0.6", "{u(x, y, 1) < 0.6: 1, 0}", "{u(x, y, 2) < 0.6: 1, 0}"],
    ["weights uniform on [0, 2]", "2 u(x, y, 1)", "2 u(x, y, 2)"],
    ["your periodic rule, p = 0.5", "1", "{mod(x, {u(y) < 0.5: 3, 2}) = 0: 1, 0}"],
  ];
  for (const [name, X, Y] of cases) {
    let worst = 0;
    for (const seed of ["a", "b", "c"]) {
      const wx = typed(X, {}, N, seed), wy = typed(Y, {}, N, seed);
      const paths = countPaths(N, wx, wy);
      for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
        const listed = sumOverPaths(x, y, wx, wy), L = paths.logF[spot(N, x, y)];
        const error = listed === 0 ? (L === -Infinity ? 0 : 1) : Math.abs(Math.exp(L) - listed) / listed;
        worst = Math.max(worst, error);
      }
    }
    addRow("Every path listed, 8 × 8 grid, 3 seeds: " + name, worst < 1e-9,
      "Largest relative difference between f and the sum over all paths: " + worst.toExponential(2) + ".");
  }
}


/* 3. Reading formulas -------------------------------------------------- */
function testFormulas() {
  const cases = [
    ["{x > 2: 5, 7}", 3, 0, 5], ["{x > 2: 5, 7}", 1, 0, 7],
    ["{x > 2: 5}", 1, 0, NaN], ["{x > 2}", 3, 0, 1],
    ["{x < 1: 1, x < 3: 2, 3}", 2, 0, 2], ["{x < 1: 1, x < 3: 2, 3}", 5, 0, 3],
    ["{x > 0: {y > 0: 1, 2}, 3}", 1, 0, 2], ["{x > 0: {y > 0: 1, 2}, 3}", 0, 4, 3],
    ["{mod(x, 3) = 0: 1, 0}", 6, 0, 1], ["{mod(x, 3) = 0: 1, 0}", 7, 0, 0],
    ["xy + 1", 3, 4, 13], ["u(x) < 2", 5, 0, 1],
  ];
  const wrong = [];
  for (const [text, x, y, want] of cases) {
    const got = typed(text, {}, 10)(x, y);
    if (!(got === want || (isNaN(got) && isNaN(want)))) wrong.push(text + " at (" + x + ", " + y + ") gave " + got + ", not " + want);
  }
  let braceError = false;
  try { readTree("{x > 2: 1"); } catch (problem) { braceError = true; }
  const letters = sliderLetters(readTree("{u(x, y) < p: 1, 0} + N")).filter(function (l) { return l !== "N"; });
  const ok = wrong.length === 0 && braceError && letters.join() === "p";
  addRow("Reading formulas: piecewise {c: a, b}, mod, xy, u", ok,
    wrong.length ? wrong.join("; ") : (braceError ? "" : "A missing } gave no error. ") +
      "All " + cases.length + " formulas gave the right values; the sliders of {u(x, y) < p: 1, 0} + N are [" +
      letters.join(", ") + "] (should be [p]).");
}


/* 4. Your periodic rule -------------------------------------------------- */
function testPeriodic() {
  const N = 40, p = 0.37, u = uniformFor("periodic");
  const wy = weightFunction(readTree("{mod(x, {u(y) < p: 3, 2}) = 0: 1, 0}"), { p: p }, N, u);
  let wrong = 0, threes = 0;
  for (let y = 1; y <= N; y++) {
    const d = u(y) < p ? 3 : 2;
    if (d === 3) threes++;
    for (let x = 0; x <= N; x++) if (wy(x, y) !== (x % d === 0 ? 1 : 0)) wrong++;
  }
  addRow("Your periodic rule opens exactly the edges where d(y) divides x", wrong === 0,
    wrong + " edges differ from the definition (" + threes + " of the 40 rows have d = 3, at p = 0.37).");
}


/* 5. u(...) and coupling ------------------------------------------------ */
function testUniform() {
  const u = uniformFor("1"), again = uniformFor("1"), other = uniformFor("2");
  const same = u(3, 4) === again(3, 4) && u(7) === again(7);
  const differs = u(3, 4) !== other(3, 4);
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) {
    const v = u(i);
    if (v < 0 || v >= 1) { counts.fill(0); break; }
    counts[Math.floor(10 * v)]++;
  }
  const test = equalChiSquare(counts);
  addRow("u(...): fixed for each input and seed, and uniform on [0, 1)", same && differs && test.pValue > 0.001,
    (same ? "Same input and seed, same number. " : "Same input gave different numbers! ") +
    (differs ? "Another seed, another number. " : "Another seed gave the same number! ") +
    "10 equal parts of [0, 1): chi-square " + test.statistic.toFixed(2) + " with " + test.degrees +
    " degrees of freedom, p-value " + test.pValue.toFixed(3) + ".");

  const N = 30, tree = readTree("{u(x, y) < p: 1, 0}");
  const low = weightFunction(tree, { p: 0.3 }, N, u), high = weightFunction(tree, { p: 0.6 }, N, u);
  let closed = 0;
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) if (low(x, y) === 1 && high(x, y) !== 1) closed++;
  addRow("Coupling: moving p up only opens edges", closed === 0,
    closed + " edges open at p = 0.3 were closed at p = 0.6.");
}


/* 6. The line a x + b y = c ---------------------------------------------- */
function testLines() {
  const N = 20, problems = [];
  for (const [a, b] of [[1, 1], [2, 5], [1, -1], [3, 0], [0, 2], [-2, 3]]) {
    const range = levelRange(N, a, b);
    for (let c = range.lo - 1; c <= range.hi + 1; c++) {
      const listed = linePoints(N, a, b, c);
      let all = 0;
      for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) if (a * x + b * y === c) all++;
      const bad = listed.filter(function (p) { return a * p.x + b * p.y !== c || p.x < 0 || p.x > N || p.y < 0 || p.y > N; });
      if (bad.length > 0 || listed.length !== all) problems.push("(" + a + ", " + b + "), c = " + c);
    }
  }
  addRow("The line a x + b y = c: its grid points, no more and no fewer", problems.length === 0,
    problems.length ? "Wrong for " + problems.slice(0, 5).join("; ") : "Right for 6 directions and every c, on the 21 × 21 grid.");
}


/* 7. Normalizing ------------------------------------------------------- */
function testHeights() {
  const N = 40, u = uniformFor("heights");
  const paths = countPaths(N, function (x, y) { return u(x, y, 1) < 0.7 ? 1 : 0; },
                              function (x, y) { return 2 * u(x, y, 2); });
  const problems = [];
  for (const [a, b] of [[1, 1], [2, 5], [1, -1]]) {
    const h = scaledHeights(paths, a, b, "line"), range = levelRange(N, a, b);
    for (let c = range.lo; c <= range.hi; c++) {
      let most = -Infinity;
      for (const p of linePoints(N, a, b, c)) { const v = h[spot(N, p.x, p.y)]; if (!isNaN(v)) most = Math.max(most, v); }
      if (most !== -Infinity && Math.abs(most - 1) > 1e-12) problems.push("(" + a + ", " + b + ") c = " + c + ": " + most);
    }
  }
  for (const how of ["all", "log"]) {
    let lo = Infinity, hi = -Infinity;
    for (const v of scaledHeights(paths, 1, 1, how)) if (!isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (lo < 0 || Math.abs(hi - 1) > 1e-12) problems.push(how + ": from " + lo + " to " + hi);
  }
  addRow("Normalizing: every line tops out at 1; the other two go from 0 to 1", problems.length === 0,
    problems.length ? problems.slice(0, 4).join("; ") : "Right on a 41 × 41 grid with random weights, for 3 directions.");
}


/* 8. The bell curve ---------------------------------------------------- */
function testBell() {
  const N = 200, c = 200, paths = countPaths(N, function () { return 1; }, function () { return 1; });
  const stats = lineStats(linePoints(N, 1, 1, c), paths.logF, N, false);
  const ok = Math.abs(stats.mean - c / 2) < 1e-9 && Math.abs(stats.sd - Math.sqrt(c) / 2) < 1e-9 && stats.worstGap < 0.005;
  addRow("Bell curve: all edges open, line x + y = 200", ok,
    "Mean " + stats.mean.toFixed(6) + " (should be 100), standard deviation " + stats.sd.toFixed(6) +
    " (should be " + (Math.sqrt(c) / 2).toFixed(6) + "), largest gap to the Gaussian " + stats.worstGap.toFixed(5) +
    " (should be below 0.005).");
}


/* The gray note -------------------------------------------------------- */
function testNote() {
  const N = 10;
  const gates = countPaths(N, typed("{u(x, y) < 0.5: 1, 0}", {}, N), typed("1", {}, N));
  const twos = countPaths(N, typed("2", {}, N), typed("u(y) < 0.5", {}, N));
  const negative = countPaths(N, typed("1", {}, N), typed("x - 3", {}, N));
  const ok = !gates.notZeroOne.X && !gates.notZeroOne.Y && twos.notZeroOne.X && !twos.notZeroOne.Y &&
    negative.notZeroOne.Y && negative.negative > 0;
  addRow("The gray note: only weights other than 0 and 1 count", ok,
    "0/1 gates: X " + gates.notZeroOne.X + ", Y " + gates.notZeroOne.Y + " (should be false, false). " +
    "X = 2: " + twos.notZeroOne.X + " (should be true). Y = x - 3: " + negative.negative + " weights below 0.");
}


runChecksOnClick(function () {
  return [testBinomial, testEveryPath, testFormulas, testPeriodic, testUniform, testLines, testHeights, testBell, testNote];
});
