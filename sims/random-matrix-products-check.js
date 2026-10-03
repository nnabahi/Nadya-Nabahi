/* =====================================================================
   random-matrix-products-check.js  —  the tests on
   random-matrix-products-check.html
   ---------------------------------------------------------------------
   Five kinds of test of random-matrix-products.js:

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
   ===================================================================== */


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
  const model = readModel(matrices, {});
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
  for (const key of counts.keys()) {
    if (!odds.has(key)) return { pass: false, text: "the sim made an impossible x = " + key };
  }

  let statistic = 0, groups = 0, pooledObserved = 0, pooledExpected = 0;
  for (const [key, p] of odds) {
    const expected = p * runs, observed = counts.get(key) || 0;
    if (expected < 5) { pooledObserved += observed; pooledExpected += expected; continue; }
    statistic += (observed - expected) ** 2 / expected;
    groups += 1;
  }
  if (pooledExpected > 0) {
    statistic += (pooledObserved - pooledExpected) ** 2 / pooledExpected;
    groups += 1;
  }
  const degrees = groups - 1;
  const pValue = 1 - jStat.chisquare.cdf(statistic, degrees);
  return {
    pass: pValue > 0.001,
    text: odds.size + " possible values of x, " + runs + " runs: chi-square " + statistic.toFixed(1) +
          " with " + degrees + " degrees of freedom, p = " + pValue.toFixed(3),
  };
}


/* ===================================================================
   2. THE AVERAGE
   =================================================================== */

// "shouldMean" is E[X] worked out by hand. Checks averageMatrix against
// it, then the cloud's average of v_t against E[X]^t (1, 0).
function averageTest(matrices, sliders, shouldMean, steps, runs) {
  const model = readModel(matrices, sliders);
  const mean = averageMatrix(model);
  for (let k = 0; k < 4; k++) {
    if (Math.abs(mean[k] - shouldMean[k]) > 1e-9) {
      return { pass: false, text: "averageMatrix gave " + mean.join(", ") + ", should be " + shouldMean.join(", ") };
    }
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
  const words = [];
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

function sumTest(matrices, steps, runs) {
  const cloud = newCloud(readModel(matrices, {}), runs, String(Math.random()));
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

// Multiply run n out step by step, reading its random numbers the same
// way the cloud does, and compare with the cloud's e^(logSize) * Q.
function rescalingTest(matrices, steps, runs) {
  const model = readModel(matrices, {});
  const seed = String(Math.random());
  const cloud = newCloud(model, runs, seed);
  for (let k = 0; k < steps; k++) cloud.step();
  const fixed = matrices.map(function (m) { return m.entries.map(Number); });

  let worst = 0;
  for (let n = 0; n < runs; n++) {
    const random = alea(seed + ":" + n);
    let product = [1, 0, 0, 1];
    for (let k = 0; k < steps; k++) {
      const i = pickMatrix(model, random());
      random(); random(); random(); random();   // u1..u4, not used here
      product = times(fixed[i], product);
    }
    const factor = Math.exp(cloud.logSize[n]);
    const stored = [cloud.q0[n] * factor, cloud.q1[n] * factor, cloud.q2[n] * factor, cloud.q3[n] * factor];
    const size = Math.max.apply(null, product.map(Math.abs));
    for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(stored[k] - product[k]) / size);
  }
  return { pass: worst < 1e-12, text: "largest difference, relative to the product's size: " + worst.toExponential(2) };
}

// After 1000 steps a plain product would overflow; the stored one must not.
function noOverflowTest(matrices, steps, runs) {
  const cloud = newCloud(readModel(matrices, {}), runs, String(Math.random()));
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
  const cloud = newCloud(readModel(matrices, {}), runs, String(Math.random()));
  for (let k = 0; k < steps; k++) cloud.step();
  const s = meanAndSpread(growthRates(cloud));
  const exact = Math.log(2) / 2;
  return { pass: Math.abs(s.mean - exact) < 0.005,
           text: "average growth rate " + s.mean.toFixed(5) + ", exact " + exact.toFixed(5) };
}


/* ===================================================================
   6. SMALL THINGS: eigenvalues, slider letters, error messages
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

  const letters = matrixLetters([{ entries: ["u1", "a u2", "1 - u1", "sin(b)"], weight: "p" },
                                 { entries: ["1", "0", "0", "1"], weight: "1 - p" }]);
  if (letters.slice().sort().join(",") !== "a,b,p") problems.push("slider letters: got " + letters.join(","));

  const bad = [
    [{ entries: ["1", "", "0", "1"], weight: "" }],
    [{ entries: ["1", "0", "0", "1"], weight: "-1" }],
    [{ entries: ["1", "0", "0", "1"], weight: "0" }],
    [{ entries: ["sqrt(-1)", "0", "0", "1"], weight: "" }],
  ];
  for (const matrices of bad) {
    try { readModel(matrices, {}); problems.push("no error for " + JSON.stringify(matrices)); }
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
  const d13 = PRESETS.d13.matrices, d12 = PRESETS.d12.matrices, ab = PRESETS.randmatAB.matrices;
  const weighted = d13.map(function (m, i) { return { entries: m.entries, weight: i === 0 ? "1" : "3" }; });
  // randmatprod.py's pair with weights 2 and 1: E[X] = (2A + B)/3.
  const withP = PRESETS.randmatprod.matrices.map(function (m, i) {
    return { entries: m.entries, weight: i === 0 ? "p" : "1 - p" };
  });
  const prodMean = [(2 * 5 / 4 + 1) / 3, (2 * 3 / 4 - 1) / 3, (2 * 3 / 4 + 0) / 3, (2 * 5 / 4 + 1) / 3];

  return [
    testRow("Exact odds: D13, equally likely, 6 steps", function () { return chiSquareTest(d13, [0.5, 0.5], 6, 50000); }),
    testRow("Exact odds: D13 with weights 1 and 3, 6 steps", function () { return chiSquareTest(weighted, [0.25, 0.75], 6, 50000); }),
    testRow("Average: D12 (E[X] = all 1/2), 5 steps", function () { return averageTest(d12, {}, [0.5, 0.5, 0.5, 0.5], 5, 20000); }),
    testRow("Average: randmatprod.py pair, weights p = 2/3 and 1 - p, 4 steps", function () { return averageTest(withP, { p: 2 / 3 }, prodMean, 4, 20000); }),
    testRow("Invariant: D13 keeps x + y = 1", function () { return sumTest(d13, 60, 500); }),
    testRow("Invariant: D12 keeps x + y = 1", function () { return sumTest(d12, 60, 500); }),
    testRow("Rescaling: randmatAB.py pair, 15 steps, same as multiplying out", function () { return rescalingTest(ab, 15, 500); }),
    testRow("No overflow: randmatAB.py pair, 1000 steps", function () { return noOverflowTest(ab, 1000, 200); }),
    testRow("Growth rate: diag(2, 1) and diag(1/2, 1), weights 3 and 1", function () { return growthTest(2000, 500); }),
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
  const cloud = newCloud(readModel(PRESETS.d13.matrices, {}), runs, "1");
  for (let k = 0; k < steps; k++) cloud.step();
  const xs = [];
  for (let n = 0; n < runs; n++) xs.push(pointOf(cloud, n, 1, 0, "none", 1)[0]);
  const lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
  const bins = Math.min(2000, Math.max(1, Math.ceil((hi - lo) / width)));
  const counts = new Array(bins).fill(0);
  for (const x of xs) counts[Math.min(bins - 1, Math.floor((x - lo) / width))]++;
  const most = Math.max.apply(null, counts);

  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  pen.fillStyle = CHART_LINE;
  for (let i = 0; i < bins; i++) {
    const barHeight = (h - 20) * counts[i] / most;
    pen.fillRect(i * w / bins, h - 16 - barHeight, Math.max(w / bins - 0.5, 0.5), barHeight);
  }
  pen.fillStyle = CHART_TEXT;
  pen.fillText(lo.toFixed(4), 2, h - 3);
  pen.textAlign = "right";
  pen.fillText(hi.toFixed(4), w - 2, h - 3);
}
byId("hist-draw").addEventListener("click", drawHistogram);
drawHistogram();
