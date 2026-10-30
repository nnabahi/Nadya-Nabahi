/* =====================================================================
   sinusoid-ish-check.js  —  the tests on sinusoid-ish-check.html
   ---------------------------------------------------------------------
   Tests of sinusoid-ish-roots.js, the math behind the sim. The "Run the
   checks" button runs them (runChecksOnClick, in js/check-page.js, like
   the other check pages); each one adds rows to the table with
   check(what, shouldBe, got, passed). Then the page's two pictures
   (js/sim-charts.js): one sample, live, and the histogram to compare
   with nadya's Python.
   ===================================================================== */

function check(what, shouldBe, got, passed) {
  addRow(what, passed, "Should be " + shouldBe + "; got " + got + ".");
}

// A number shown with a few digits.
function show(x) { return Number(x).toPrecision(6); }

// The roots of one sample, as the sim makes them (the gap covering 0
// size-biased, for the walk).
function rootsOf(model, variables, seed, N) {
  return makeRoots(model, newGaps(variables, model === "walk" ? coverLawOf(variables) : null, seed), N);
}

// The largest |a(x) - b(x)| over x in [from, to] (401 points).
function largestGap(a, b, from, to) {
  let worst = 0;
  for (let i = 0; i <= 400; i++) {
    const x = from + (to - from) * i / 400;
    worst = Math.max(worst, Math.abs(a(x) - b(x)));
  }
  return worst;
}

// --- A. Equal gaps give a sine wave (Euler's sine product) ---------
// With every gap 1 the roots are n + a, and
//   f(x) = sin(pi (a - x)) / sin(pi a)
// (Stein & Shakarchi, "Complex Analysis", 2003, Ch. 5, Sec. 3).
// The product is cut at N roots on each side, so it is only close:
// the error is about x^2 / N.
function testSineWave() {
  const N = 20000, one = randomVariablesOf("g ~ unif([1])");

  const walk = rootsOf("walk", one, 7, N);
  const a = walk[N];                                         // R(0), the first root right of 0
  const sine = function (x) { return Math.sin(Math.PI * (a - x)) / Math.sin(Math.PI * a); };
  const errorWalk = largestGap(function (x) { return fValue(x, walk); }, sine, -5, 5) * Math.abs(Math.sin(Math.PI * a));
  check("Walk, g ~ unif([1]): f(x) = sin(π(a − x)) / sin(πa) on [−5, 5] (relative to its height)",
        "under 0.005", show(errorWalk), errorWalk < 0.005);

  const lattice = rootsOf("lattice", randomVariablesOf("g ~ unif([0])"), 7, N);
  const s = lattice[N];
  const sineS = function (x) { return Math.sin(Math.PI * (s - x)) / Math.sin(Math.PI * s); };
  const errorLattice = largestGap(function (x) { return fValue(x, lattice); }, sineS, -5, 5) * Math.abs(Math.sin(Math.PI * s));
  check("Jittered lattice, g ~ unif([0]): same sine wave, a = s", "under 0.005", show(errorLattice), errorLattice < 0.005);

  const mirror = rootsOf("mirror", one, 7, N);
  const errorMirror = largestGap(function (x) { return fValue(x, mirror); },
                                 function (x) { return Math.sin(Math.PI * x) / Math.PI; }, -5, 5) * Math.PI;
  check("Mirror, g ~ unif([1]): f(x) = x ∏(1 − x²/k²) = sin(πx)/π", "under 0.005", show(errorMirror), errorMirror < 0.005);

  // Lobes of the sine wave: every lobe has area 2 / (pi |sin(pi a)|),
  // peak height 1 / |sin(pi a)|, and its peak in the middle (offset 1/2).
  const lobes = lobesIn(-5, 5, walk);
  const height = 1 / Math.abs(Math.sin(Math.PI * a));
  let worstArea = 0, worstPeak = 0, worstOffset = 0;
  for (const lobe of lobes) {
    worstArea = Math.max(worstArea, Math.abs(Math.abs(lobe.area) - 2 * height / Math.PI) / height);
    worstPeak = Math.max(worstPeak, Math.abs(Math.abs(lobe.peak) - height) / height);
    worstOffset = Math.max(worstOffset, Math.abs(lobe.offset - 0.5));
  }
  check("Sine lobes: " + lobes.length + " lobes, |area| = 2/(π|sin πa|) (relative error)", "under 0.005", show(worstArea), worstArea < 0.005);
  check("Sine lobes: |peak| = 1/|sin πa| (relative error)", "under 0.005", show(worstPeak), worstPeak < 0.005);
  check("Sine lobes: peak offset = 1/2", "under 0.001", show(worstOffset), worstOffset < 0.001);
}

// --- B. One peak per lobe, for random gaps -------------------------
// f' should change sign at each peak found.
function testPeaks() {
  const N = 300, roots = rootsOf("walk", randomVariablesOf("g ~ unif([2, 3])"), 3, N);
  const lobes = lobesIn(-30, 30, roots);
  let good = 0;
  for (const lobe of lobes) {
    const h = 1e-6 * (lobe.right - lobe.left);
    if (fDerivative(lobe.peakX - h, roots) * fDerivative(lobe.peakX + h, roots) < 0) good++;
  }
  check("g ~ unif([2, 3]): f' changes sign at every peak found", lobes.length + " of " + lobes.length,
        good + " of " + lobes.length, good === lobes.length && lobes.length > 0);
}

// --- C. The box, and the size-biased gap ---------------------------
// The size-biased gap has average E[g^2] / E[g] (the gap covering 0
// is picked with probability proportional to its length). Averaged
// here over 100000 evenly spread u, not random ones, so for a law with
// an exact F it is exact up to the table's small error; for a formula,
// whose F is worked out from 16,384 draws, it is close.
function testGapSets() {
  function averageSizeBiased(variables) {
    const law = coverLawOf(variables);
    let sum = 0;
    for (let i = 0; i < 100000; i++) sum += drawFromLaw(law, (i + 0.5) / 100000);
    return sum / 100000;
  }

  const letters1 = readRandomVariables("g = 1 + δ u^2\nu ~ unif(0, 1)").letters.join(", ");
  check('Sliders for "g = 1 + δ u^2" with "u ~ unif(0, 1)"', "δ", letters1, letters1 === "δ");
  const letters2 = readRandomVariables("g ~ unif(1 - d, 1 + d)").letters.join(", ");
  check('Sliders for "g ~ unif(1 - d, 1 + d)"', "d", letters2, letters2 === "d");

  const set = averageSizeBiased(randomVariablesOf("g ~ unif([2, 3])"));
  check("g ~ unif([2, 3]): average size-biased gap = (4 + 9)/(2 + 3)", "2.6", show(set), Math.abs(set - 2.6) < 1e-4);

  const weighted = randomVariablesOf("g ~ unif([2, 2, 2, 3])").lawOf("g").mean;
  check("g ~ unif([2, 2, 2, 3]): repeats are weights, mean gap", "2.25", show(weighted), Math.abs(weighted - 2.25) < 1e-12);

  const interval = averageSizeBiased(randomVariablesOf("g ~ unif(1, 1 + δ)", { δ: 0.5 }));
  const exactInterval = ((1 + 1.5 + 2.25) / 3) / 1.25;           // E[g^2]/E[g] for g uniform on [1, 1.5]
  check("g ~ unif(1, 1.5): average size-biased gap", show(exactInterval), show(interval), Math.abs(interval - exactInterval) < 1e-6);

  const formula = averageSizeBiased(randomVariablesOf("g = 2 + u^2\nu ~ unif(0, 1)"));
  const exactFormula = (83 / 15) / (7 / 3);                      // E[g^2] = 4 + 4/3 + 1/5, E[g] = 2 + 1/3
  check("g = 2 + u^2, a formula: average size-biased gap = 83/35", show(exactFormula), show(formula), Math.abs(formula - exactFormula) < 1e-3);

  // nadya's D1: L = sqrt(4 d u + (1 - d)^2) for g ~ unif(1 - d, 1 + d).
  const d = 0.3, cover = coverLawOf(randomVariablesOf("g ~ unif(1 - d, 1 + d)", { d: d }));
  let worst = 0;
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    worst = Math.max(worst, Math.abs(drawFromLaw(cover, u) - Math.sqrt(4 * d * u + (1 - d) * (1 - d))));
  }
  check("g ~ unif(1 − d, 1 + d), d = 0.3: size-biased gap = your L = √(4du + (1 − d)²)", "under 0.000001", show(worst), worst < 1e-6);

  // The formula 1 + δ u and the law unif(1, 1 + δ) are the same law, so
  // their covering gaps have the same law too.
  const asFormula = coverLawOf(randomVariablesOf("g = 1 + δ u\nu ~ unif(0, 1)", { δ: 0.1 }));
  const asLaw = coverLawOf(randomVariablesOf("g ~ unif(1, 1 + δ)", { δ: 0.1 }));
  let worstDraw = 0;
  for (let i = 0; i <= 100; i++) worstDraw = Math.max(worstDraw, Math.abs(drawFromLaw(asFormula, i / 100) - drawFromLaw(asLaw, i / 100)));
  check('"g = 1 + δ u" gives the covering gap the same law as "g ~ unif(1, 1 + δ)"', "under 0.001", show(worstDraw), worstDraw < 1e-3);

  // Laws the walk can't take.
  const refusals = [["g ~ unif(-1, 1)", "walk"], ["g ~ pareto(1, 1)", "walk"], ["g ~ unif([0, 1])", "mirror"]].map(function ([text, model]) {
    return gapProblem(model, randomVariablesOf(text));
  });
  check("Refused: gaps that can be 0 or less (walk, mirror), and an infinite mean (walk)", "3 refusals",
        refusals.filter(Boolean).length + " (" + refusals.join(" / ") + ")", refusals.every(Boolean));
}

// --- D. Stationarity (random, so "close", not exact) ---------------
// Stationary roots have, on average, (length) / (mean gap) roots in
// any window, wherever it is. 20000 random samples, so the counts
// wobble by about 0.005.
function testStationary() {
  const samples = 20000, N = 20;
  // The average count of roots in [from, to); "cover" is the law the
  // gap covering 0 is drawn from (for the walk).
  function averageCount(model, variables, cover, from, to) {
    let total = 0;
    for (let k = 0; k < samples; k++) {
      const roots = makeRoots(model, newGaps(variables, cover, "stationary " + k), N);
      for (const r of roots) if (r >= from && r < to) total++;
    }
    return total / samples;
  }
  const two = randomVariablesOf("g ~ unif([1, 3])");      // mean gap 2, so 1/2 a root per unit length
  for (const from of [0, 2.5, 7]) {
    const got = averageCount("walk", two, coverLawOf(two), from, from + 1);
    check("Walk, g ~ unif([1, 3]): average roots in [" + from + ", " + (from + 1) + ")", "0.5", show(got), Math.abs(got - 0.5) < 0.02);
  }
  // For comparison: without size-biasing the gap that covers 0, the
  // window right after 0 gets the wrong count.
  const wrong = averageCount("walk", two, two.lawOf("g"), 0, 1);
  check("For comparison: the same without the size-biased gap, roots in [0, 1)", "not 0.5 (should look wrong)", show(wrong), Math.abs(wrong - 0.5) > 0.03);

  const jitter = randomVariablesOf("g ~ unif(-1/2, 1/2)");
  for (const from of [0, 0.3]) {
    const got = averageCount("lattice", jitter, null, from, from + 0.37);
    check("Jittered lattice, g ~ unif(−1/2, 1/2): average roots in [" + from + ", " + (from + 0.37).toFixed(2) + ")", "0.37", show(got), Math.abs(got - 0.37) < 0.02);
  }
}

runChecksOnClick(function () { return [testSineWave, testPeaks, testGapSets, testStationary]; });

/* ===================================================================
   The pictures, drawn as the sim's charts are (js/sim-charts.js)
   =================================================================== */

// The points of y = f(x) at 801 evenly spread x from "from" to "to".
function curvePoints(f, from, to) {
  const points = [];
  for (let i = 0; i <= 800; i++) {
    const x = from + (to - from) * i / 800;
    points.push([x, f(x)]);
  }
  return points;
}

// Section 1: one sample, redrawn when δ moves. Solid: f; dashed: the
// sine wave; and the line y = 0. The height fits f.
const N_PLOT = 300;
function drawSample() {
  const delta = Number(byId("delta").value);
  byId("delta-value").textContent = delta;
  const variables = randomVariablesOf("g ~ unif(1, 1 + δ)", { δ: delta });
  const roots = rootsOf("walk", variables, 1, N_PLOT);
  const R0 = roots[N_PLOT], m = variables.lawOf("g").mean;
  const f = curvePoints(function (x) { return fValue(x, roots); }, -10, 10);
  const sine = curvePoints(function (x) { return Math.sin(Math.PI * (R0 - x) / m) / Math.sin(Math.PI * R0 / m); }, -10, 10);
  const top = 1.1 * Math.max(...f.map(function (point) { return Math.abs(point[1]); }));
  lineChart(byId("plot"), [
    { points: [[-10, 0], [10, 0]], color: CHART_TEXT, width: 1 },
    { points: f, width: 2 },
    { points: sine, color: CHART_TEXT, dashed: true },
  ], { from: -10, to: 10, word: "x" }, { from: -top, to: top, round: true });
}
byId("delta").addEventListener("input", drawSample);
drawSample();

// Section 3: histogram of peak offsets for gaps {2, 3}, as the sim's
// offsets chart draws it (histogram, js/sim-charts.js).
function drawOffsets() {
  const variables = randomVariablesOf("g ~ unif([2, 3])"), N = 60, offsets = [];
  for (let k = 0; k < 300; k++) {
    const roots = rootsOf("walk", variables, "python " + k, N);
    for (const lobe of lobesIn(-15, 15, roots)) offsets.push(lobe.offset);
  }
  offsets.sort(function (a, b) { return a - b; });
  histogram(byId("offsets"), offsets, false);
  const q = function (p) { return offsets[Math.floor(p * (offsets.length - 1))].toFixed(4); };
  byId("offset-summary").textContent =
    offsets.length + " lobes. Offsets from " + q(0) + " to " + q(1) + ". Quartiles: " +
    q(0.25) + ", " + q(0.5) + ", " + q(0.75) + ".";
}
drawOffsets();
