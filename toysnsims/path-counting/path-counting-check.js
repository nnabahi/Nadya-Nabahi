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
        must match f, for random open/closed edges, random weights (of
        two laws) and your periodic rule.

     3. Reading formulas: Desmos's piecewise {condition: a, b}, your own
        functions, random variables and the rest, on formulas with known
        answers; the letters that get sliders; and lines that must be
        refused.

     4. Your periodic rule, as typed in the sim: d(y) is one number per
        row, and the edges open are exactly those where d(y) divides x.

     5. The random variables: worked out again, a name gives the same
        number; another seed or another point gives another; X and Y at
        one point share it; two names differ; each input of your own
        function is a place of its own (d(4) is the same everywhere); and
        the 100,489 copies of u ~ unif(0, 1) on the grid fall equally
        often in 10 equal parts of [0, 1) (Pearson's chi-square test,
        from js/check-page.js). Coupling: an edge open at p = 0.3 is
        still open at p = 0.6.

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
// your own functions (one per line), the lines of the Random variables
// box, the sliders' values, N and the seed.
function typed(X, Y, definitions, lines, values, N, seed) {
  const defs = definitions.split("\n").filter(function (t) { return t.trim() !== ""; }).map(readDefinition);
  const declared = readRandomVariables(lines, ["x", "y", "N"]);
  checkDefinitions(defs, declared);
  const variables = makeRandomVariables(declared, values || {});
  return makeWeights({ X: readTree(X), Y: readTree(Y) }, defs, variables, N, seed || "check");
}

// The lines of two uniform random variables, u and v.
const UNIFORMS = "u ~ unif(0, 1)\nv ~ unif(0, 1)";

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
    ["open with chance 0.6", "{u < 0.6: 1, 0}", "{v < 0.6: 1, 0}", "", UNIFORMS],
    ["weights a ~ unif(0, 2) and b ~ exp(1)", "a", "b", "", "a ~ unif(0, 2)\nb ~ exp(1)"],
    ["your periodic rule, p = 0.5", "1", "{mod(x, d(y)) = 0: 1, 0}", "d(y) = {u < 0.5: 3, 2}", "u ~ unif(0, 1)"],
  ];
  for (const [name, X, Y, defs, lines] of cases) {
    let worst = 0;
    for (const seed of ["a", "b", "c"]) {
      const w = typed(X, Y, defs, lines, {}, N, seed);
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
    ["xy + 1", 3, 4, 13], ["u < 2", 5, 0, 1], ["u - u", 5, 0, 0], ["g(x + 1, 2)", 3, 0, 10],
  ];
  const wrong = [];
  for (const [text, x, y, want] of cases) {
    const got = typed(text, "0", "g(a, b) = a b + b", "u ~ unif(0, 1)", {}, 10).X(x, y);
    if (!(got === want || (isNaN(got) && isNaN(want)))) wrong.push(text + " at (" + x + ", " + y + ") gave " + got + ", not " + want);
  }
  // Lines that must be refused: a missing }, a function without
  // inputs, a random variable's name as a function's input, and the
  // sim's own letters in the box.
  const refused = [
    function () { readTree("{x > 2: 1"); },
    function () { readDefinition("d = 3"); },
    function () { typed("d(1)", "0", "d(u) = u + 1", "u ~ unif(0, 1)", {}, 10); },
    function () { readRandomVariables("y ~ exp(1)", ["x", "y", "N"]); },
    function () { readRandomVariables("w ~ unif(0, N)", ["x", "y", "N"]); },
  ].filter(function (read) { try { read(); return true; } catch (problem) { return false; } }).length;
  // The sliders: the box's letters first, then X's, Y's and the
  // functions', but not x, y, N, the random variables, a function's
  // inputs or its name.
  const declared = readRandomVariables("u ~ unif(0, s)", ["x", "y", "N"]);
  const letters = weightLetters({ X: readTree("{u < p: 1, 0} + N"), Y: readTree("q g(x, y)") },
                                [readDefinition("g(a, b) = a b + c")], declared);
  const ok = wrong.length === 0 && refused === 0 && letters.join() === "s,p,q,c";
  addRow("Reading formulas: piecewise {c: a, b}, mod, xy, random variables, your own functions", ok,
    wrong.length ? wrong.join("; ") : (refused ? refused + " lines that should be refused were read. " : "") +
      "All " + cases.length + " formulas gave the right values, and 5 bad lines were refused; the sliders are [" +
      letters.join(", ") + "] (should be [s, p, q, c]).");
}


/* 4. Your periodic rule -------------------------------------------------- */
function testPeriodic() {
  const N = 40, p = 0.37;
  const w = typed("1", "{mod(x, d(y)) = 0: 1, 0}", "d(y) = {u < p: 3, 2}", "u ~ unif(0, 1)", { p: p }, N, "periodic");
  const rows = typed("d(y)", "0", "d(y) = {u < p: 3, 2}", "u ~ unif(0, 1)", { p: p }, N, "periodic").X;   // d(y) itself
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


/* 5. The random variables ---------------------------------------------- */
function testRandom() {
  const N = 316;                       // 317 x 317 = 100,489 points
  const a = typed("u", "u", "", UNIFORMS, {}, N, "1"), again = typed("u", "u", "", UNIFORMS, {}, N, "1");
  const other = typed("u", "u", "", UNIFORMS, {}, N, "2");
  const same = a.X(3, 4) === again.X(3, 4) && a.X(3, 4) === a.X(3, 4) && a.X(3, 4) === a.Y(3, 4);
  const differs = a.X(3, 4) !== other.X(3, 4) && a.X(3, 4) !== a.X(4, 3);
  const two = typed("u - v", "0", "", UNIFORMS, {}, N, "1").X(3, 4) !== 0;   // two names
  // Your function's own places: d(4) is the same from every point, and
  // it is not the u of the point itself.
  const d = typed("d(4)", "d(y)", "d(y) = u", "u ~ unif(0, 1)", {}, N, "1"), own = typed("u", "d(y)", "d(y) = u", "u ~ unif(0, 1)", {}, N, "1");
  const ownPlaces = d.X(1, 0) === d.X(7, 3) && d.X(1, 0) === d.Y(5, 4) && own.X(5, 4) !== own.Y(5, 4);
  const counts = new Array(10).fill(0);
  let outside = 0;
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    const v = a.X(x, y);
    if (v < 0 || v >= 1) outside++; else counts[Math.floor(10 * v)]++;
  }
  const test = equalChiSquare(counts);
  addRow("Random variables: one number per name at each point, shared by X and Y, and uniform on [0, 1)",
    same && differs && two && ownPlaces && outside === 0 && test.pValue > 0.001,
    (same ? "Same seed and point, same number, in X and in Y. " : "Worked out again (or in Y), it changed! ") +
    (differs ? "Another seed or another point: another number. " : "Two different places gave the same number! ") +
    (two ? "" : "Two names gave the same number! ") +
    (ownPlaces ? "d(4) is the same from every point, with its own u. " : "Your function's places are wrong! ") +
    "10 equal parts of [0, 1), 100,489 points: chi-square " + test.statistic.toFixed(2) + " with " + test.degrees +
    " degrees of freedom, p-value " + test.pValue.toFixed(3) + (outside ? ", " + outside + " outside [0, 1)" : "") + ".");

  const small = 30;
  const low = typed("{u < p: 1, 0}", "1", "", "u ~ unif(0, 1)", { p: 0.3 }, small, "1").X;
  const high = typed("{u < p: 1, 0}", "1", "", "u ~ unif(0, 1)", { p: 0.6 }, small, "1").X;
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
  const w = typed("{u < 0.7: 1, 0}", "2 v", "", UNIFORMS, {}, N, "heights");
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
  const gates = typed("{u < 0.5: 1, 0}", "1", "", UNIFORMS, {}, N), twos = typed("2", "u < 0.5", "", UNIFORMS, {}, N);
  const negative = typed("1", "x - 3", "", "", {}, N);
  const a = countPaths(N, gates.X, gates.Y), b = countPaths(N, twos.X, twos.Y), c = countPaths(N, negative.X, negative.Y);
  const ok = !a.notZeroOne.X && !a.notZeroOne.Y && b.notZeroOne.X && !b.notZeroOne.Y && c.notZeroOne.Y && c.negative > 0;
  addRow("The gray note: only weights other than 0 and 1 count", ok,
    "0/1 gates: X " + a.notZeroOne.X + ", Y " + a.notZeroOne.Y + " (should be false, false). " +
    "X = 2: " + b.notZeroOne.X + " (should be true). Y = x - 3: " + c.negative + " weights below 0.");
}


runChecksOnClick(function () {
  return [testBinomial, testEveryPath, testFormulas, testPeriodic, testRandom, testLines, testHeights, testBell, testNote];
});
