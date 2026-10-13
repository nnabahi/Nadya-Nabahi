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
        must match f, for random open/closed edges, random weights and
        your periodic rule.

     3. Reading formulas: Desmos's piecewise {condition: a, b}, your own
        functions and the rest, on formulas with known answers.

     4. Your periodic rule, as typed in the sim: d(y) is one number per
        row, and the edges open are exactly those where d(y) divides x.

     5. Coupled random(): worked out again it gives the same number;
        another seed, X instead of Y, or another point gives another;
        and 100,489 of them fall equally often in 10 equal parts of
        [0, 1) (Pearson's chi-square test, from js/check-page.js).
        Coupling: an edge open at p = 0.3 is still open at p = 0.6.

     6. The lines at angle t: every grid point is on exactly one line,
        each line has one point per column (or row), within half a step
        of the true line, and at 45 degrees line k is exactly x + y = k.

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

// The weights { X, Y } from formula text, as the sim makes them: X, Y,
// your own functions (one per line), the sliders' values, N and the seed.
function typed(X, Y, definitions, values, N, seed) {
  const defs = definitions.split("\n").filter(function (t) { return t.trim() !== ""; }).map(readDefinition);
  return makeWeights({ X: readTree(X), Y: readTree(Y) }, defs, values || {}, N, seed || "check");
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
    ["open with chance 0.6", "{random() < 0.6: 1, 0}", "{random() < 0.6: 1, 0}", ""],
    ["weights uniform on [0, 2]", "2 random()", "2 random()", ""],
    ["your periodic rule, p = 0.5", "1", "{mod(x, d(y)) = 0: 1, 0}", "d(y) = {random() < 0.5: 3, 2}"],
  ];
  for (const [name, X, Y, defs] of cases) {
    let worst = 0;
    for (const seed of ["a", "b", "c"]) {
      const w = typed(X, Y, defs, {}, N, seed);
      const paths = countPaths(N, w.X, w.Y);
      for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
        const listed = sumOverPaths(x, y, w.X, w.Y), L = paths.logF[spot(N, x, y)];
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
    ["xy + 1", 3, 4, 13], ["random() < 2", 5, 0, 1], ["g(x + 1, 2)", 3, 0, 10],
  ];
  const wrong = [];
  for (const [text, x, y, want] of cases) {
    const got = typed(text, "0", "g(a, b) = a b + b", {}, 10).X(x, y);
    if (!(got === want || (isNaN(got) && isNaN(want)))) wrong.push(text + " at (" + x + ", " + y + ") gave " + got + ", not " + want);
  }
  let braceError = false, definitionError = false;
  try { readTree("{x > 2: 1"); } catch (problem) { braceError = true; }
  try { readDefinition("d = 3"); } catch (problem) { definitionError = true; }
  const letters = sliderLetters(readTree("{random() < p: 1, 0} + N")).filter(function (l) { return l !== "N"; });
  const ok = wrong.length === 0 && braceError && definitionError && letters.join() === "p";
  addRow("Reading formulas: piecewise {c: a, b}, mod, xy, random(), your own functions", ok,
    wrong.length ? wrong.join("; ") : (braceError ? "" : "A missing } gave no error. ") +
      (definitionError ? "" : "\"d = 3\" was read as a function. ") +
      "All " + cases.length + " formulas gave the right values; the sliders of {random() < p: 1, 0} + N are [" +
      letters.join(", ") + "] (should be [p]).");
}


/* 4. Your periodic rule -------------------------------------------------- */
function testPeriodic() {
  const N = 40, p = 0.37;
  const w = typed("1", "{mod(x, d(y)) = 0: 1, 0}", "d(y) = {random() < p: 3, 2}", { p: p }, N, "periodic");
  const rows = typed("d(y)", "0", "d(y) = {random() < p: 3, 2}", { p: p }, N, "periodic").X;   // d(y) itself
  let wrong = 0, threes = 0, notPerRow = 0;
  for (let y = 1; y <= N; y++) {
    const d = rows(1, y);
    if (d === 3) threes++;
    for (let x = 0; x <= N; x++) {
      if (rows(x, y) !== d) notPerRow++;
      if (w.Y(x, y) !== (x % d === 0 ? 1 : 0)) wrong++;
    }
  }
  addRow("Your periodic rule: one d per row, and the open edges are where d(y) divides x",
    wrong === 0 && notPerRow === 0 && threes > 0 && threes < 40,
    wrong + " edges differ from the definition; d(y) changed along a row " + notPerRow + " times; " +
    threes + " of the 40 rows have d = 3, at p = 0.37.");
}


/* 5. Coupled random() ---------------------------------------------------- */
function testRandom() {
  const N = 316;                       // 317 x 317 = 100,489 points
  const a = typed("random()", "random()", "", {}, N, "1"), again = typed("random()", "random()", "", {}, N, "1");
  const other = typed("random()", "random()", "", {}, N, "2");
  const same = a.X(3, 4) === again.X(3, 4) && a.X(3, 4) === a.X(3, 4);
  const differs = a.X(3, 4) !== other.X(3, 4) && a.X(3, 4) !== a.Y(3, 4) && a.X(3, 4) !== a.X(4, 3);
  const two = typed("random() - random()", "0", "", {}, N, "1").X(3, 4) !== 0;   // two random()s in one formula
  const counts = new Array(10).fill(0);
  let outside = 0;
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    const v = a.X(x, y);
    if (v < 0 || v >= 1) outside++; else counts[Math.floor(10 * v)]++;
  }
  const test = equalChiSquare(counts);
  addRow("random(): kept for each place, separate for X and Y, and uniform on [0, 1)",
    same && differs && two && outside === 0 && test.pValue > 0.001,
    (same ? "Same seed and place, same number. " : "Worked out again, it changed! ") +
    (differs ? "Another seed, X vs Y, or another point: another number. " : "Two different places gave the same number! ") +
    (two ? "" : "Two random()s in one formula were equal! ") +
    "10 equal parts of [0, 1), 100,489 points: chi-square " + test.statistic.toFixed(2) + " with " + test.degrees +
    " degrees of freedom, p-value " + test.pValue.toFixed(3) + (outside ? ", " + outside + " outside [0, 1)" : "") + ".");

  const small = 30;
  const low = typed("{random() < p: 1, 0}", "1", "", { p: 0.3 }, small, "1").X;
  const high = typed("{random() < p: 1, 0}", "1", "", { p: 0.6 }, small, "1").X;
  let closed = 0;
  for (let y = 0; y <= small; y++) for (let x = 0; x <= small; x++) if (low(x, y) === 1 && high(x, y) !== 1) closed++;
  addRow("Coupling: moving p up only opens edges", closed === 0,
    closed + " edges open at p = 0.3 were closed at p = 0.6.");
}


/* 6. The lines ------------------------------------------------------------ */
function testLines() {
  const N = 20, problems = [];
  for (let degrees = 0; degrees <= 90; degrees += 7.5) {
    const line = makeLine(N, degrees * Math.PI / 180);
    let total = 0;
    for (let k = 0; k <= line.most; k++) {
      const listed = linePoints(N, line, k);
      total += listed.length;
      let all = 0;
      for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) if (line.number(x, y) === k) all++;
      const across = listed.map(function (p) { return line.alongX ? p.x : p.y; });
      const once = new Set(across).size === across.length;
      const far = listed.filter(function (p) { return Math.abs(p.x * line.cos + p.y * line.sin - k * line.step) > line.step / 2 + 1e-9; });
      if (listed.length !== all || !once || far.length > 0) problems.push(degrees + "°, line " + k);
    }
    if (total !== (N + 1) * (N + 1)) problems.push(degrees + "°: " + total + " points in all");
  }
  const diagonal = makeLine(N, Math.PI / 4);
  const exact = linePoints(N, diagonal, 15).every(function (p) { return p.x + p.y === 15; });
  addRow("The lines: every grid point on exactly one, one point per column (or row), nearest the line",
    problems.length === 0 && exact,
    problems.length ? "Wrong for " + problems.slice(0, 5).join("; ")
      : "Right for every angle 0°, 7.5°, ..., 90° and every line, on the 21 × 21 grid; at 45° line 15 is exactly x + y = 15.");
}


/* 7. Normalizing ------------------------------------------------------- */
function testHeights() {
  const N = 40;
  const w = typed("{random() < 0.7: 1, 0}", "2 random()", "", {}, N, "heights");
  const paths = countPaths(N, w.X, w.Y);
  const problems = [];
  for (const degrees of [45, 70, 20]) {
    const line = makeLine(N, degrees * Math.PI / 180), h = scaledHeights(paths, line, "line");
    for (let k = 0; k <= line.most; k++) {
      let most = -Infinity;
      for (const p of linePoints(N, line, k)) { const v = h[spot(N, p.x, p.y)]; if (!isNaN(v)) most = Math.max(most, v); }
      if (most !== -Infinity && Math.abs(most - 1) > 1e-12) problems.push(degrees + "° line " + k + ": " + most);
    }
  }
  for (const how of ["all", "log"]) {
    let lo = Infinity, hi = -Infinity;
    for (const v of scaledHeights(paths, makeLine(N, Math.PI / 4), how)) if (!isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (lo < 0 || Math.abs(hi - 1) > 1e-12) problems.push(how + ": from " + lo + " to " + hi);
  }
  addRow("Normalizing: every line tops out at 1; the other two go from 0 to 1", problems.length === 0,
    problems.length ? problems.slice(0, 4).join("; ") : "Right on a 41 × 41 grid with random weights, at 45°, 70° and 20°.");
}


/* 8. The bell curve ---------------------------------------------------- */
function testBell() {
  const N = 200, c = 200, paths = countPaths(N, function () { return 1; }, function () { return 1; });
  const line = makeLine(N, Math.PI / 4);
  const stats = lineStats(linePoints(N, line, c), paths.logF, N, line.alongX);
  const ok = Math.abs(stats.mean - c / 2) < 1e-9 && Math.abs(stats.sd - Math.sqrt(c) / 2) < 1e-9 && stats.worstGap < 0.005;
  addRow("Bell curve: all edges open, 45°, the line x + y = 200", ok,
    "Mean " + stats.mean.toFixed(6) + " (should be 100), standard deviation " + stats.sd.toFixed(6) +
    " (should be " + (Math.sqrt(c) / 2).toFixed(6) + "), largest gap to the Gaussian " + stats.worstGap.toFixed(5) +
    " (should be below 0.005).");
}


/* The gray note -------------------------------------------------------- */
function testNote() {
  const N = 10;
  const gates = typed("{random() < 0.5: 1, 0}", "1", "", {}, N), twos = typed("2", "random() < 0.5", "", {}, N);
  const negative = typed("1", "x - 3", "", {}, N);
  const a = countPaths(N, gates.X, gates.Y), b = countPaths(N, twos.X, twos.Y), c = countPaths(N, negative.X, negative.Y);
  const ok = !a.notZeroOne.X && !a.notZeroOne.Y && b.notZeroOne.X && !b.notZeroOne.Y && c.notZeroOne.Y && c.negative > 0;
  addRow("The gray note: only weights other than 0 and 1 count", ok,
    "0/1 gates: X " + a.notZeroOne.X + ", Y " + a.notZeroOne.Y + " (should be false, false). " +
    "X = 2: " + b.notZeroOne.X + " (should be true). Y = x - 3: " + c.negative + " weights below 0.");
}


runChecksOnClick(function () {
  return [testBinomial, testEveryPath, testFormulas, testPeriodic, testRandom, testLines, testHeights, testBell, testNote];
});
