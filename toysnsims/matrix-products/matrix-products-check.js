/* =====================================================================
   matrix-products-check.js  —  the tests on
   matrix-products-check.html
   ---------------------------------------------------------------------
   Seven kinds of test of matrix-products-math.js:

     1. Exact odds. With fixed matrices, after t steps there are only
        (number of matrices)^t possible products, and each one's
        probability is the product of the chances of its picks. This
        listing is written separately, straight from the definition
        (plain matrix multiplication, no rescaling), so it shares no
        code with the sim. Then the cloud is run, and Pearson's
        chi-square test (K. Pearson, Philosophical Magazine 50 (1900)
        157-175) says whether the counts of each final x match the
        exact odds. Outcomes expected fewer than 5 times are pooled
        into one group (W. G. Cochran, Biometrics 10 (1954) 417-451).
        The p-value comes from the library jStat.

     2. The average. The steps are independent, so the average of v_t
        is exactly E[X]^t v_0. The cloud's average must be within 4
        standard errors of it. A correct program fails this about 1
        time in 8000 (each of x and y is that far off about 1 time in
        16000, by the normal approximation: the central limit theorem,
        R. Durrett, "Probability: Theory and Examples", 5th ed.,
        Cambridge University Press, 2019, Theorem 3.4.1).

     3. Invariants. Stochastic matrices (columns adding up to 1, like
        D12 and D13) keep x + y the same: if the columns of M add up
        to 1, the entries of M v add up to the entries of v.

     4. The rescaling loses nothing: the stored e^(logSize) * Q equals
        the product multiplied out step by step, with the same random
        numbers.

     5. A known growth rate. For A = diag(2, 1) and B = diag(1/2, 1),
        with weights 3 and 1, the top-left entry of the product is
        2^(number of A's - number of B's), so (1/t) log of it tends to
        (3/4 - 1/4) log 2 = (log 2)/2 by the law of large numbers
        (Durrett, same book, Theorem 2.4.1), and the bottom-right
        entry stays 1. So the growth rate is (log 2)/2 = 0.34657...

     6. Random entries. The average matrix of entries with random
        variables, against averages known exactly: E[g] = 1/2 for
        g ~ exp(2), the average of a sum of a family, and E[max(v, z)]
        = 2/3 for two independent uniform numbers (P(max <= x) = x^2).
        And the coupling: moving a slider in a law moves every run only
        a little, and the same seed gives the same runs.

     7. Small things: the eigenvalues of a few matrices, the letters
        that get a slider, and boxes that must give an error.

   Each test's matrices come with the lines of their Random variables
   box, like the presets: { lines, matrices }.
   ===================================================================== */


// The model of { lines, matrices }, with the sliders' values "values".
function modelOf(preset, values) {
  return readModel(preset.matrices, randomVariablesOf(preset.lines, values));
}

// Fixed matrices, with no random variables.
function fixedPreset(matrices) {
  return { lines: "", matrices: matrices };
}


/* ===================================================================
   1. EXACT ODDS
   =================================================================== */

// Plain 2x2 matrix multiplication, [a, b, c, d] meaning [[a, b], [c, d]].
function times(m, p) {
  return [m[0] * p[0] + m[1] * p[2], m[0] * p[1] + m[1] * p[3],
          m[2] * p[0] + m[3] * p[2], m[2] * p[1] + m[3] * p[3]];
}

// Every possible product after "steps" steps, with its probability.
// Returns a Map from x (of P (1, 0), rounded to 9 digits) to probability.
function exactOdds(fixed, chances, steps) {
  const odds = new Map();
  function grow(product, stepsLeft, probability) {
    if (stepsLeft === 0) {
      const key = product[0].toFixed(9);
      odds.set(key, (odds.get(key) || 0) + probability);
      return;
    }
    fixed.forEach(function (m, i) {
      grow(times(m, product), stepsLeft - 1, probability * chances[i]);
    });
  }
  grow([1, 0, 0, 1], steps, 1);
  return odds;
}

// The exact-odds test for the typed matrices (all fixed numbers), their
// chances "should" (worked out by hand), and "steps" steps.
function chiSquareTest(matrices, should, steps, runs) {
  const model = modelOf(fixedPreset(matrices));
  // The chances must be the ones worked out by hand.
  for (let i = 0; i < should.length; i++) {
    if (Math.abs(model.chances[i] - should[i]) > 1e-12) {
      return { pass: false, text: "matrix " + (i + 1) + " has chance " + model.chances[i] + ", should be " + should[i] };
    }
  }
  const fixed = matrices.map(function (m) { return m.entries.map(Number); });
  const odds = exactOdds(fixed, should, steps);

  const cloud = newCloud(model, runs, String(Math.random()));
  for (let k = 0; k < steps; k++) cloud.step();
  const counts = new Map();
  for (let n = 0; n < runs; n++) {
    const key = pointOf(cloud, n, 1, 0, "none", 1)[0].toFixed(9);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return exactOddsTest(odds, counts, runs, "values of x");    // js/check-page.js
}


/* ===================================================================
   2. THE AVERAGE
   =================================================================== */

// "shouldMean" is E[X] worked out by hand. Checks averageMatrix against
// it (to within "within"), then the cloud's average of v_t against
// E[X]^t (1, 0).
function averageTest(preset, sliders, shouldMean, within, steps, runs) {
  const model = modelOf(preset, sliders);
  const mean = averageMatrix(model);
  let off = 0;
  for (let k = 0; k < 4; k++) off = Math.max(off, Math.abs(mean[k] - shouldMean[k]));
  if (!(off <= within)) {
    return { pass: false, text: "averageMatrix gave " + mean.join(", ") + ", should be " + shouldMean.join(", ") };
  }
  let power = [1, 0, 0, 1];
  for (let k = 0; k < steps; k++) power = times(shouldMean, power);
  const exact = [power[0], power[2]];   // E[X]^t (1, 0)

  const cloud = newCloud(model, runs, String(Math.random()));
  for (let k = 0; k < steps; k++) cloud.step();
  const xs = [], ys = [];
  for (let n = 0; n < runs; n++) {
    const p = pointOf(cloud, n, 1, 0, "none", 1);
    xs.push(p[0]); ys.push(p[1]);
  }
  const words = ["E[X] off by " + off.toExponential(1)];
  let pass = true;
  [xs, ys].forEach(function (values, k) {
    const s = meanAndSpread(values);
    const error = s.spread / Math.sqrt(runs);
    const off = Math.abs(s.mean - exact[k]) / Math.max(error, 1e-15);
    if (off > 4) pass = false;
    words.push((k === 0 ? "x" : "y") + ": cloud " + s.mean.toFixed(5) + ", exact " + exact[k].toFixed(5) +
               " (" + off.toFixed(1) + " standard errors off)");
  });
  return { pass: pass, text: words.join("; ") };
}


/* ===================================================================
   3. INVARIANTS: x + y stays 1 for stochastic matrices
   =================================================================== */

function sumTest(preset, steps, runs) {
  const cloud = newCloud(modelOf(preset), runs, String(Math.random()));
  let worst = 0;
  for (let k = 1; k <= steps; k++) {
    cloud.step();
    for (let n = 0; n < runs; n++) {
      for (const start of [[1, 0], [0, 1]]) {
        const p = pointOf(cloud, n, start[0], start[1], "none", 1);
        worst = Math.max(worst, Math.abs(p[0] + p[1] - 1));
      }
    }
  }
  return { pass: worst < 1e-9, text: "largest |x + y - 1| over " + steps + " steps: " + worst.toExponential(2) };
}


/* ===================================================================
   4. THE RESCALING LOSES NOTHING
   =================================================================== */

// Multiply run n out step by step, with the same picks as the cloud
// (step s of run n picks with the uniform number for (n, s)), and
// compare with the cloud's e^(logSize) * Q.
function rescalingTest(matrices, steps, runs) {
  const model = modelOf(fixedPreset(matrices));
  const seed = String(Math.random());
  const cloud = newCloud(model, runs, seed);
  for (let k = 0; k < steps; k++) cloud.step();
  const fixed = matrices.map(function (m) { return m.entries.map(Number); });
  const pick = seededUniform(seed);

  let worst = 0;
  for (let n = 0; n < runs; n++) {
    let product = [1, 0, 0, 1];
    for (let s = 1; s <= steps; s++) product = times(fixed[pickMatrix(model, pick.uniform(n, s))], product);
    const factor = Math.exp(cloud.logSize[n]);
    const stored = [cloud.q0[n] * factor, cloud.q1[n] * factor, cloud.q2[n] * factor, cloud.q3[n] * factor];
    const size = Math.max(...product.map(Math.abs));
    for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(stored[k] - product[k]) / size);
  }
  return { pass: worst < 1e-12, text: "largest difference, relative to the product's size: " + worst.toExponential(2) };
}

// After 1000 steps a plain product would overflow; the stored one must not.
function noOverflowTest(matrices, steps, runs) {
  const cloud = newCloud(modelOf(fixedPreset(matrices)), runs, String(Math.random()));
  for (let k = 0; k < steps; k++) cloud.step();
  const rates = growthRates(cloud);
  let ok = true;
  for (let n = 0; n < runs; n++) {
    const p = pointOf(cloud, n, 1, 0, "unit", 1);
    if (!isFinite(rates[n]) || !isFinite(p[0]) || !isFinite(p[1])) ok = false;
  }
  const s = meanAndSpread(rates);
  return { pass: ok, text: "all finite; growth rate " + s.mean.toFixed(4) + " (so the product is about e^" +
                            (s.mean * steps).toFixed(0) + ", far past the largest computer number e^709)" };
}


/* ===================================================================
   5. A KNOWN GROWTH RATE
   =================================================================== */

function growthTest(steps, runs) {
  const matrices = [
    { entries: ["2", "0", "0", "1"], weight: "3" },
    { entries: ["1/2", "0", "0", "1"], weight: "1" },
  ];
  const cloud = newCloud(modelOf(fixedPreset(matrices)), runs, String(Math.random()));
  for (let k = 0; k < steps; k++) cloud.step();
  const s = meanAndSpread(growthRates(cloud));
  const exact = Math.log(2) / 2;
  return { pass: Math.abs(s.mean - exact) < 0.005,
           text: "average growth rate " + s.mean.toFixed(5) + ", exact " + exact.toFixed(5) };
}


/* ===================================================================
   6. RANDOM ENTRIES
   =================================================================== */

// The red dots of a cloud after "steps" steps.
function redDots(model, seed, steps, runs) {
  const cloud = newCloud(model, runs, seed);
  for (let k = 0; k < steps; k++) cloud.step();
  const dots = [];
  for (let n = 0; n < runs; n++) dots.push(pointOf(cloud, n, 1, 0, "none", 1));
  return dots;
}

// Coupling: u ~ unif(0, a) in a stochastic matrix, with a = 1 and then
// a = 1.001. Every run's red dot after 20 steps moves by about 0.001
// at most; a run's dot is a long product, so a little more is fine.
// And the same seed twice gives exactly the same dots.
function couplingTest() {
  const preset = { lines: "u ~ unif(0, a)", matrices: [{ entries: ["u", "1/2", "1 - u", "1/2"], weight: "" }] };
  const seed = String(Math.random());
  const before = redDots(modelOf(preset, { a: 1 }), seed, 20, 2000);
  const again = redDots(modelOf(preset, { a: 1 }), seed, 20, 2000);
  const after = redDots(modelOf(preset, { a: 1.001 }), seed, 20, 2000);
  let moved = 0, differ = 0;
  before.forEach(function (p, n) {
    moved = Math.max(moved, Math.abs(after[n][0] - p[0]), Math.abs(after[n][1] - p[1]));
    if (again[n][0] !== p[0] || again[n][1] !== p[1]) differ++;
  });
  return { pass: moved < 0.01 && moved > 0 && differ === 0,
           text: "largest move of a red dot: " + moved.toExponential(2) + "; runs that differ for the same seed: " + differ };
}


/* ===================================================================
   7. SMALL THINGS: eigenvalues, slider letters, error messages
   =================================================================== */

function smallTests() {
  const problems = [];
  function near(a, b) { return Math.abs(a - b) < 1e-12; }

  let e = eigenvalues(2, 1, 1, 2);          // 3 and 1
  if (!(near(e.re[0], 3) && near(e.re[1], 1))) problems.push("eigenvalues of [[2,1],[1,2]]");
  e = eigenvalues(-3, 0, 0, 1);             // -3 is the larger in size
  if (!near(e.re[0], -3)) problems.push("eigenvalues of [[-3,0],[0,1]]");
  e = eigenvalues(0, -1, 1, 0);             // i and -i
  if (!(near(e.re[0], 0) && near(Math.abs(e.im[0]), 1))) problems.push("eigenvalues of [[0,-1],[1,0]]");

  // The box's letters first, then the matrices'; the random variables
  // get none, and without its line u2 is a letter like any other.
  const matrices = [{ entries: ["u1", "a u2", "1 - u1", "sin(b)"], weight: "p" },
                    { entries: ["1", "0", "0", "1"], weight: "1 - p" }];
  const box = readRandomVariables("u1 ~ unif(0, s)\nu2 ~ unif(0, 1)", []);
  let letters = matrixLetters(matrices, box);
  if (letters.join(",") !== "s,a,b,p") problems.push("slider letters: got " + letters.join(","));
  letters = matrixLetters(matrices, readRandomVariables("u1 ~ unif(0, 1)", []));
  if (letters.join(",") !== "a,u2,b,p") problems.push("slider letters without u2's line: got " + letters.join(","));

  const bad = [
    fixedPreset([{ entries: ["1", "", "0", "1"], weight: "" }]),
    fixedPreset([{ entries: ["1", "0", "0", "1"], weight: "-1" }]),
    fixedPreset([{ entries: ["1", "0", "0", "1"], weight: "0" }]),
    fixedPreset([{ entries: ["sqrt(-1)", "0", "0", "1"], weight: "" }]),
    { lines: "u ~ unif(0, 1)", matrices: [{ entries: ["1", "0", "0", "1"], weight: "u" }] },
  ];
  for (const preset of bad) {
    try { modelOf(preset); problems.push("no error for " + JSON.stringify(preset)); }
    catch (error) { /* an error is what should happen */ }
  }
  return { pass: problems.length === 0, text: problems.join("; ") || "eigenvalues, slider letters and bad boxes all right" };
}


/* ===================================================================
   7. THE PAGE: run the tests, fill in the table, draw the histogram
   (addRow and runChecksOnClick are in js/check-page.js)
   =================================================================== */

// A test that adds its own row: "run" returns { pass, text }, and a
// crash becomes a failed row.
function testRow(name, run) {
  return function () {
    let result;
    try { result = run(); } catch (error) { result = { pass: false, text: "crashed: " + error.message }; }
    addRow(name, result.pass, result.text);
  };
}

// The list of tests, run one at a time by the "Run the checks" button.
function allTests() {
  const d13 = PRESETS.d13.matrices, ab = PRESETS.randmatAB.matrices;
  const weighted = d13.map(function (m, i) { return { entries: m.entries, weight: i === 0 ? "1" : "3" }; });
  // randmatprod.py's pair with weights 2 and 1: E[X] = (2A + B)/3.
  const withP = fixedPreset(PRESETS.randmatprod.matrices.map(function (m, i) {
    return { entries: m.entries, weight: i === 0 ? "p" : "1 - p" };
  }));
  const prodMean = [(2 * 5 / 4 + 1) / 3, (2 * 3 / 4 - 1) / 3, (2 * 3 / 4 + 0) / 3, (2 * 5 / 4 + 1) / 3];

  // Random entries with averages known exactly. The family's sum has
  // E = sum over k of (1/2) / 2^k = (1 - 2^-20) / 2.
  const exponential = { lines: "g ~ exp(2)", matrices: [{ entries: ["g", "0", "0", "1"], weight: "" }] };
  const family = { lines: "d_k ~ bernoulli(1/2)", matrices: [{ entries: ["sum(k, 1, 20, d_k / 2^k)", "0", "0", "1"], weight: "" }] };
  const larger = { lines: "v ~ unif(0, 1)\nz ~ unif(0, 1)\nm = max(v, z)",
                   matrices: [{ entries: ["m", "1 - m", "1 - m", "m"], weight: "" }] };
  const familyMean = (1 - Math.pow(2, -20)) / 2;

  return [
    testRow("Exact odds: D13, equally likely, 6 steps", function () { return chiSquareTest(d13, [0.5, 0.5], 6, 50000); }),
    testRow("Exact odds: D13 with weights 1 and 3, 6 steps", function () { return chiSquareTest(weighted, [0.25, 0.75], 6, 50000); }),
    testRow("Average: D12 (E[X] = all 1/2), 5 steps", function () { return averageTest(PRESETS.d12, {}, [0.5, 0.5, 0.5, 0.5], 1e-9, 5, 20000); }),
    testRow("Average: randmatprod.py pair, weights p = 2/3 and 1 - p, 4 steps", function () { return averageTest(withP, { p: 2 / 3 }, prodMean, 1e-9, 4, 20000); }),
    testRow("Average: [[g, 0], [0, 1]] with g ~ exp(2) (E[g] = 1/2, on the grid), 3 steps", function () { return averageTest(exponential, {}, [0.5, 0, 0, 1], 1e-4, 3, 20000); }),
    testRow("Average: a sum of a family d_k ~ bernoulli(1/2) (from draws), 3 steps", function () { return averageTest(family, {}, [familyMean, 0, 0, 1], 1e-9, 3, 5000); }),
    testRow("Average: m = max(v, z) for uniform v, z (E[m] = 2/3, on the grid), 3 steps", function () { return averageTest(larger, {}, [2 / 3, 1 / 3, 1 / 3, 2 / 3], 1e-4, 3, 20000); }),
    testRow("Invariant: D13 keeps x + y = 1", function () { return sumTest(PRESETS.d13, 60, 500); }),
    testRow("Invariant: D12 keeps x + y = 1 (u1 is one number in both its entries)", function () { return sumTest(PRESETS.d12, 60, 500); }),
    testRow("Rescaling: randmatAB.py pair, 15 steps, same as multiplying out", function () { return rescalingTest(ab, 15, 500); }),
    testRow("No overflow: randmatAB.py pair, 1000 steps", function () { return noOverflowTest(ab, 1000, 200); }),
    testRow("Growth rate: diag(2, 1) and diag(1/2, 1), weights 3 and 1", function () { return growthTest(2000, 500); }),
    testRow("Coupling: u ~ unif(0, a), a from 1 to 1.001, 20 steps", couplingTest),
    testRow("Small things", smallTests),
  ];
}

runChecksOnClick(allTests);

// The picture: a histogram of x after t steps for D13, 20000 runs, like
// nadya's Desmos D13 (her bin width was 0.0001; here it is typed in).
function drawHistogram() {
  const canvas = byId("histogram");
  const steps = readWhole("hist-steps", 0, 200, 20);
  const width = Math.max(Number(byId("hist-bin").value) || 0.001, 1e-5);
  const runs = 20000;
  const cloud = newCloud(modelOf(PRESETS.d13), runs, "1");
  for (let k = 0; k < steps; k++) cloud.step();
  const xs = [];
  for (let n = 0; n < runs; n++) xs.push(pointOf(cloud, n, 1, 0, "none", 1)[0]);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const bins = Math.min(2000, Math.max(1, Math.ceil((hi - lo) / width)));
  const counts = new Array(bins).fill(0);
  for (const x of xs) counts[Math.min(bins - 1, Math.floor((x - lo) / width))]++;
  const bars = counts.map(function (count, i) { return { from: lo + i * width, to: lo + (i + 1) * width, value: count }; });
  barChart(canvas, bars, { from: lo, to: lo + bins * width }, { from: 0, to: Math.max(...counts), round: true, whole: true });
}
byId("hist-draw").addEventListener("click", drawHistogram);
drawHistogram();
