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
  const N = 20000, u = makeUniforms(7, N);
  const one = readGapSet("{1}", {});

  const walk = makeRoots("walk", one, u, N);
  const a = walk[N];                                         // R(0), the first root right of 0
  const sine = function (x) { return Math.sin(Math.PI * (a - x)) / Math.sin(Math.PI * a); };
  const errorWalk = largestGap(function (x) { return fValue(x, walk); }, sine, -5, 5) * Math.abs(Math.sin(Math.PI * a));
  check("Walk, gaps {1}: f(x) = sin(π(a − x)) / sin(πa) on [−5, 5] (relative to its height)",
        "under 0.005", show(errorWalk), errorWalk < 0.005);

  const lattice = makeRoots("lattice", readGapSet("{0}", {}), u, N);
  const s = lattice[N];
  const sineS = function (x) { return Math.sin(Math.PI * (s - x)) / Math.sin(Math.PI * s); };
  const errorLattice = largestGap(function (x) { return fValue(x, lattice); }, sineS, -5, 5) * Math.abs(Math.sin(Math.PI * s));
  check("Jittered lattice, jitter {0}: same sine wave, a = s", "under 0.005", show(errorLattice), errorLattice < 0.005);

  const mirror = makeRoots("mirror", one, u, N);
  const errorMirror = largestGap(function (x) { return fValue(x, mirror); },
                                 function (x) { return Math.sin(Math.PI * x) / Math.PI; }, -5, 5) * Math.PI;
  check("Mirror, gaps {1}: f(x) = x ∏(1 − x²/k²) = sin(πx)/π", "under 0.005", show(errorMirror), errorMirror < 0.005);

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
  const N = 300, roots = makeRoots("walk", readGapSet("{2, 3}", {}), makeUniforms(3, N), N);
  const lobes = lobesIn(-30, 30, roots);
  let good = 0;
  for (const lobe of lobes) {
    const h = 1e-6 * (lobe.right - lobe.left);
    if (fDerivative(lobe.peakX - h, roots) * fDerivative(lobe.peakX + h, roots) < 0) good++;
  }
  check("Gaps {2, 3}: f' changes sign at every peak found", lobes.length + " of " + lobes.length,
        good + " of " + lobes.length, good === lobes.length && lobes.length > 0);
}

// --- C. Reading the box, and the size-biased gap -------------------
// The size-biased gap has average E[g^2] / E[g] (the gap covering 0
// is picked with probability proportional to its length). Averaged
// here over 100000 evenly spread u, not random ones, so it is exact
// up to rounding.
function testGapSets() {
  function averageSizeBiased(law) {
    let sum = 0;
    for (let i = 0; i < 100000; i++) sum += law.sizeBiased((i + 0.5) / 100000);
    return sum / 100000;
  }

  const letters1 = gapSetLetters("1 + δu^2").join(", ");
  check('Sliders for "1 + δu^2"', "δ", letters1, letters1 === "δ");
  const letters2 = gapSetLetters("[1 - d, 1 + d]").join(", ");
  check('Sliders for "[1 - d, 1 + d]"', "d", letters2, letters2 === "d");

  const set = averageSizeBiased(readGapSet("{2, 3}", {}));
  check("{2, 3}: average size-biased gap = (4 + 9)/(2 + 3)", "2.6", show(set), Math.abs(set - 2.6) < 1e-4);

  const weighted = readGapSet("{2, 2, 2, 3}", {}).mean;
  check("{2, 2, 2, 3}: repeats are weights, mean gap", "2.25", show(weighted), Math.abs(weighted - 2.25) < 1e-12);

  const interval = averageSizeBiased(readGapSet("[1, 1 + δ]", { δ: 0.5 }));
  const exactInterval = ((1 + 1.5 + 2.25) / 3) / 1.25;           // E[g^2]/E[g] for g uniform on [1, 1.5]
  check("[1, 1.5]: average size-biased gap", show(exactInterval), show(interval), Math.abs(interval - exactInterval) < 1e-6);

  const formula = averageSizeBiased(readGapSet("2 + u^2", {}));
  const exactFormula = (83 / 15) / (7 / 3);                      // E[g^2] = 4 + 4/3 + 1/5, E[g] = 2 + 1/3
  check("Formula 2 + u^2: average size-biased gap = 83/35", show(exactFormula), show(formula), Math.abs(formula - exactFormula) < 1e-4);

  // nadya's D1: L = sqrt(4 d u + (1 - d)^2) for gaps uniform on [1 - d, 1 + d].
  const d = 0.3, law = readGapSet("[1 - d, 1 + d]", { d: d });
  let worst = 0;
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    worst = Math.max(worst, Math.abs(law.sizeBiased(u) - Math.sqrt(4 * d * u + (1 - d) * (1 - d))));
  }
  check("[1 − d, 1 + d], d = 0.3: size-biased gap = your L = √(4du + (1 − d)²)", "0 (up to rounding)", show(worst), worst < 1e-12);

  // The formula 1 + δu and the interval [1, 1 + δ] are the same law.
  const asFormula = readGapSet("1 + δu", { δ: 0.1 }), asInterval = readGapSet("[1, 1 + δ]", { δ: 0.1 });
  let worstDraw = 0;
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    worstDraw = Math.max(worstDraw, Math.abs(asFormula.draw(u) - asInterval.draw(u)),
                                    Math.abs(asFormula.sizeBiased(u) - asInterval.sizeBiased(u)));
  }
  check('"1 + δu" gives the same gaps as "[1, 1 + δ]"', "under 0.0001", show(worstDraw), worstDraw < 1e-4);
}

// --- D. Stationarity (random, so "close", not exact) ---------------
// Stationary roots have, on average, (length) / (mean gap) roots in
// any window, wherever it is. 20000 random samples, so the counts
// wobble by about 0.005.
function testStationary() {
  const samples = 20000, N = 20;
  function averageCount(model, law, from, to) {
    let total = 0;
    for (let k = 0; k < samples; k++) {
      const roots = makeRoots(model, law, makeUniforms("stationary " + k, N), N);
      for (const r of roots) if (r >= from && r < to) total++;
    }
    return total / samples;
  }
  const law = readGapSet("{1, 3}", {});           // mean gap 2, so 1/2 a root per unit length
  for (const from of [0, 2.5, 7]) {
    const got = averageCount("walk", law, from, from + 1);
    check("Walk, gaps {1, 3}: average roots in [" + from + ", " + (from + 1) + ")", "0.5", show(got), Math.abs(got - 0.5) < 0.02);
  }
  // For comparison: without size-biasing the gap that covers 0, the
  // window right after 0 gets the wrong count.
  const naive = Object.assign({}, law, { sizeBiased: law.draw });
  const wrong = averageCount("walk", naive, 0, 1);
  check("For comparison: the same without the size-biased gap, roots in [0, 1)", "not 0.5 (should look wrong)", show(wrong), Math.abs(wrong - 0.5) > 0.03);

  const jitter = readGapSet("[-1/2, 1/2]", {});
  for (const from of [0, 0.3]) {
    const got = averageCount("lattice", jitter, from, from + 0.37);
    check("Jittered lattice, jitter [−1/2, 1/2]: average roots in [" + from + ", " + (from + 0.37).toFixed(2) + ")", "0.37", show(got), Math.abs(got - 0.37) < 0.02);
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
const N_PLOT = 300, U_PLOT = makeUniforms(1, N_PLOT);
function drawSample() {
  const delta = Number(byId("delta").value);
  byId("delta-value").textContent = delta;
  const law = readGapSet("[1, 1 + δ]", { δ: delta });
  const roots = makeRoots("walk", law, U_PLOT, N_PLOT);
  const R0 = roots[N_PLOT], m = law.mean;
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
  const law = readGapSet("{2, 3}", {}), N = 60, offsets = [];
  for (let k = 0; k < 300; k++) {
    const roots = makeRoots("walk", law, makeUniforms("python " + k, N), N);
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
