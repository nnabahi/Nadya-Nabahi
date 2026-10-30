/* =====================================================================
   random-variables-check.js  —  tests of the laws (js/sim-laws.js,
   js/sim-law-catalog.js) and of the random variables
   (js/sim-random.js), for random-variables-check.html
   ---------------------------------------------------------------------
     1. Every law of the catalog, at its starting parameters and some
        harder ones: its table of F, F^-1, its density or masses
        against F, and its mean and variance against their formulas.
     2. Laws that are the same law, made two ways.
     3. The numbers the laws need: the normal F, the Airy function
        (against its differential equation), the Tracy-Widom laws (their
        known means and variances), Minkowski's ?, the digits laws.
     4. Typed densities, size-biased laws, and what is refused.
     5. Named random variables: one number per place, coupling,
        independence, families and sums, and the Latin hypercube.
   ===================================================================== */


/* =====================================================================
   SMALL HELPERS
   ===================================================================== */

function short(v) { return Number(v.toPrecision(4)).toString(); }

// The laws tested in section 1: every law at its starting parameters,
// and these too, at the edges where a law is hardest to get right
// (densities that go to infinity at an end, heavy tails, long lists).
const HARDER = [
  ["beta", [0.5, 0.5]], ["beta", [0.2, 3]], ["gamma", [0.3, 1]], ["t", [1.5]], ["t", [30]], ["pareto", [1, 1.5]],
  ["lognormal", [0, 2]], ["poisson", [200]], ["negbinomial", [0.5, 0.3]], ["zeta", [1.5]], ["geometric", [0.99]],
  ["binomial", [1000, 0.3]], ["marchenkopastur", [2, 1]], ["gev", [0, 1, 0.5]], ["gev", [0, 1, -0.5]],
  ["weibull", [0.5, 1]], ["vonmises", [0, 50]], ["exp", [1e-3]], ["normal", [1e6, 1e-3]], ["invgauss", [1, 50]],
  ["levy", [1]], ["halfcauchy", [1]], ["frechet", [1.5, 1]], ["yulesimon", [1.5]], ["borel", [0.9]],
  ["dnormal", [20]], ["kestenmckay", [10]], ["semicircle", [1]], ["irwinhall", [20]], ["digits", [10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]],
  ["salem", [0.1]], ["riesz", [-1, 7]], ["stable", [0.6, 1]], ["stable", [1, 0.5]], ["bernoulliconv", [0.9]],
];

// Every law to test: [key, parameters], with the starting parameters
// read as the box reads them.
function lawsToTest() {
  const all = [];
  for (const key of Object.keys(LAW_CATALOG)) {
    if (key === "orbit") continue;             // its parameter is a formula: tested in section 2
    const args = LAW_CATALOG[key].defaults.map(function (text) {
      const v = math.evaluate(text);
      return v && v.toArray ? v.toArray() : v;
    });
    all.push([key, args]);
  }
  return all.concat(HARDER);
}

function lawName(key, args) { return key + "(" + args.map(function (a) { return Array.isArray(a) ? "[" + a.join(", ") + "]" : a; }).join(", ") + ")"; }

// Is the law on whole numbers only (all its mass in point masses)?
function isDiscrete(law) {
  return law.masses.length > 0 && Math.abs(law.masses.reduce(function (s, m) { return s + m[1]; }, 0) - 1) < 1e-9;
}

// The integral of f from a to b: Gauss-Legendre with 20 points on each
// of "pieces" equal pieces.
const GAUSS20 = gaussLegendre(20);
function integral(f, a, b, pieces) {
  let total = 0;
  const h = (b - a) / pieces;
  for (let p = 0; p < pieces; p++) {
    const middle = a + (p + 0.5) * h;
    for (let g = 0; g < 20; g++) total += GAUSS20.weights[g] * f(middle + GAUSS20.points[g] * h / 2) * h / 2;
  }
  return total;
}

// The mean and variance of a law from F^-1: E[X] = the integral of
// F^-1(u) over [0, 1] (and the same for X^2), by the midpoint rule on M
// equal pieces, except the first and last, which are cut again into
// halves, quarters, ... toward 0 and 1 (each by 4-point Gauss-Legendre),
// so that a heavy tail is counted: a law whose F^-1 goes to infinity at
// 1 like (1 - u)^(-1/a) has most of its variance in the last pieces.
// (The last piece toward 1 stops where 1 - u is too small for the
// computer.) X is measured from its median, so that a law far from 0
// with a small spread, like normal(10^6, 10^-3), keeps its digits.
function quantileMoments(law, M) {
  const center = drawFromLaw(law, 0.5);
  let sum = 0, squares = 0;
  const add = function (u, width) { const x = drawFromLaw(law, u) - center; sum += width * x; squares += width * x * x; };
  const addPiece = function (a, b) {
    for (let g = 0; g < 4; g++) add((a + b) / 2 + GAUSS4.points[g] * (b - a) / 2, GAUSS4.weights[g] * (b - a) / 2);
  };
  for (let i = 1; i < M - 1; i++) add((i + 0.5) / M, 1 / M);
  for (let width = 1 / M; width > 1e-300; width /= 2) {
    addPiece(width / 2, width);
    if (1 - width / 2 < 1) addPiece(1 - width, 1 - width / 2);
  }
  return { mean: center + sum, variance: squares - sum * sum };
}

// The largest gap between two distribution functions, over the points
// F1^-1(u) for u = 0.001, 0.002, ..., 0.999 (just left and right of
// each, so a jump counts).
function biggestGap(law1, F2) {
  let worst = 0;
  for (let u = 0.001; u < 0.9995; u += 0.001) {
    const x = drawFromLaw(law1, u);
    for (const y of [x * (1 - 1e-9) - 1e-12, x * (1 + 1e-9) + 1e-12]) worst = Math.max(worst, Math.abs(lawCDF(law1, y) - F2(y)));
  }
  return worst;
}


/* =====================================================================
   1. EVERY LAW OF THE CATALOG
   ===================================================================== */

// The table of F goes up and ends at 1, and F^-1 goes back to F: for a
// law with a density, F(F^-1(u)) = u, as nearly as the computer's
// numbers allow (u must be between F at the numbers just left and just
// right of x = F^-1(u): Salem's law with p = 0.1 puts mass 0.0002 just
// right of 1/128, closer to it than the next number the computer has);
// for a law on whole numbers, F^-1(u) is the least whole number k with
// F(k) >= u.
function testTables() {
  const bad = [];
  let slowest = 0, slowestName = "";
  for (const [key, args] of lawsToTest()) {
    const name = lawName(key, args), start = performance.now();
    let law;
    try { law = catalogLaw(key, args); }
    catch (problem) { bad.push(name + " could not be made: " + problem.message); continue; }
    const time = performance.now() - start;
    if (time > slowest) { slowest = time; slowestName = name; }
    for (let i = 1; i < law.xs.length; i++) {
      if (!(law.xs[i] >= law.xs[i - 1]) || !(law.Fs[i] >= law.Fs[i - 1])) { bad.push(name + ": its table goes down at point " + i + "."); break; }
    }
    if (law.Fs[0] < 0 || law.Fs[law.Fs.length - 1] > 1 + 1e-12) bad.push(name + ": its table leaves [0, 1].");
    let worst = 0;
    const discrete = isDiscrete(law);
    for (let u = 0.0005; u < 0.9999; u += 0.0005) {
      const x = drawFromLaw(law, u);
      if (!isFinite(x)) { bad.push(name + ": F^-1(" + short(u) + ") is " + x + "."); break; }
      if (discrete) {
        if (x !== Math.round(x) && !law.masses.some(function (m) { return m[0] === x; })) { bad.push(name + ": F^-1(" + short(u) + ") = " + x + " has no mass."); break; }
        const below = law.masses.filter(function (m) { return m[0] < x; }).reduce(function (s, m) { return s + m[1]; }, 0);
        if (lawCDF(law, x) < u - 1e-9 || below >= u + 1e-9) { bad.push(name + ": F^-1(" + short(u) + ") = " + x + " isn't the least x with F(x) >= u."); break; }
      } else if (law.masses.length === 0) {
        const step = Math.abs(x) * Number.EPSILON + 1e-300;
        worst = Math.max(worst, u - lawCDF(law, x + step), lawCDF(law, x - step) - u);
      }
    }
    if (worst > 2e-6) bad.push(name + ": F(F^-1(u)) is off from u by up to " + short(worst) + ".");
  }
  addRow("Every law's table of F goes up from 0 to 1, and F^-1 undoes F", bad.length === 0,
         (bad.length ? bad.slice(0, 6).join(" ") + (bad.length > 6 ? " (and " + (bad.length - 6) + " more)" : "") + " "
                     : lawsToTest().length + " laws (each at its starting parameters, and 35 harder ones), u every 0.0005. ") +
         "The slowest to make was " + slowestName + ", " + Math.round(slowest) + " ms.");
}

// The density and masses against F: F(b) - F(a) is the integral of f
// from a to b (between neighboring deciles), and F(k) - F(k - 1/2) is
// the mass at k.
function testDensities() {
  const bad = [];
  let checked = 0, worst = 0;
  for (const [key, args] of lawsToTest()) {
    const entry = LAW_CATALOG[key], name = lawName(key, args), law = catalogLaw(key, args);
    if (entry.density && law.masses.length === 0) {
      const f = function (x) { return entry.density(x, ...args); };
      for (let i = 0; i < 9; i++) {
        const a = drawFromLaw(law, 0.05 + 0.1 * i), b = drawFromLaw(law, 0.15 + 0.1 * i);
        const gap = Math.abs(integral(f, a, b, 256) - (lawCDF(law, b) - lawCDF(law, a)));
        worst = Math.max(worst, gap);
        if (gap > 2e-5) { bad.push(name + ": the density's integral from " + short(a) + " to " + short(b) + " is off from F's rise by " + short(gap) + "."); break; }
      }
      checked++;
    }
    if (entry.mass) {
      const seen = new Set();
      for (let u = 0.05; u < 0.96; u += 0.05) {
        const k = drawFromLaw(law, u);
        if (seen.has(k)) continue;
        seen.add(k);
        const gap = Math.abs(lawCDF(law, k) - lawCDF(law, k - 0.5) - entry.mass(k, ...args));
        worst = Math.max(worst, gap);
        if (gap > 1e-8) { bad.push(name + ": the mass at " + k + " is off by " + short(gap) + "."); break; }
      }
      checked++;
    }
  }
  addRow("Densities and masses against F", bad.length === 0,
         bad.length ? bad.slice(0, 6).join(" ") : checked + " laws; the worst gap was " + short(worst) + ".");
}

// The mean and variance from F^-1 (quantileMoments, with 2^17 pieces)
// against their formulas: within 0.02% for the mean and 1% for the
// variance, or, when the variance is infinite (a heavy tail, which the
// pieces only reach so far), within 1% for the mean. Laws drawn from
// more than one uniform number (stable laws, Bernoulli convolutions)
// are checked with 20,000 draws, to within 4 standard errors.
function testMoments() {
  const bad = [];
  let checked = 0;
  for (const [key, args] of lawsToTest()) {
    const entry = LAW_CATALOG[key], name = lawName(key, args), law = catalogLaw(key, args);
    if (!entry.mean) continue;
    const mean = entry.mean(...args), variance = entry.variance ? entry.variance(...args) : undefined;
    if (!isFinite(mean)) continue;
    let found;
    if (law.draw) {
      const random = seededUniform("moments " + name), n = 20000;
      let sum = 0, squares = 0;
      for (let i = 0; i < n; i++) {
        const x = law.draw(function (j) { return random.uniform(i, j); });
        sum += x; squares += x * x;
      }
      found = { mean: sum / n, variance: squares / n - (sum / n) * (sum / n) };
      if (isFinite(variance) && Math.abs(found.mean - mean) > 4 * Math.sqrt(variance / n)) bad.push(name + ": its draws' mean is " + short(found.mean) + ", not " + short(mean) + ".");
    } else {
      found = quantileMoments(law, 131072);
      const scale = Math.max(1, Math.abs(mean), isFinite(variance) ? Math.sqrt(variance) : 0);
      const allowed = isFinite(variance) ? 2e-4 * scale : 0.01 * scale;
      if (Math.abs(found.mean - mean) > allowed) bad.push(name + ": its mean comes out " + short(found.mean) + ", not " + short(mean) + ".");
      if (isFinite(variance) && variance > 0 && Math.abs(found.variance - variance) > 0.01 * variance + 1e-9) {
        bad.push(name + ": its variance comes out " + short(found.variance) + ", not " + short(variance) + ".");
      }
    }
    checked++;
  }
  addRow("Means and variances against their formulas", bad.length === 0,
         bad.length ? bad.slice(0, 6).join(" ") : checked + " laws.");
}


/* =====================================================================
   2. THE SAME LAW, MADE TWO WAYS
   ---------------------------------------------------------------------
   Each pair is one law (C. Forbes, M. Evans, N. Hastings and B.
   Peacock, "Statistical Distributions", 4th ed., Wiley, 2011, the
   chapter of each law), so their F's should agree. For the laws worked
   out from 20,000 draws the gap can be up to about 1.63 / sqrt(20000)
   = 0.012 by chance (the 0.99 point of Kolmogorov's limit law: N.
   Smirnov, "Table for estimating the goodness of fit of empirical
   distributions", Ann. Math. Statist. 19 (1948) 279-281); the others
   should agree almost exactly.
   ===================================================================== */
function testSameLaws() {
  const law = catalogLaw;
  const F = function (key, args) { const l = law(key, args); return function (x) { return lawCDF(l, x); }; };
  const pairs = [
    ["chisq(2) = exp(1/2)", law("chisq", [2]), F("exp", [0.5]), 1e-6],
    ["t(1) = cauchy(0, 1)", law("t", [1]), F("cauchy", [0, 1]), 1e-6],
    ["beta(1/2, 1/2) = arcsine()", law("beta", [0.5, 0.5]), F("arcsine", []), 1e-6],
    ["beta(1, 1) = unif(0, 1)", law("beta", [1, 1]), F("unif", [0, 1]), 1e-6],
    ["kumaraswamy(1, 1) = unif(0, 1)", law("kumaraswamy", [1, 1]), F("unif", [0, 1]), 1e-6],
    ["irwinhall(1) = unif(0, 1)", law("irwinhall", [1]), F("unif", [0, 1]), 1e-6],
    ["gamma(1, 2) = exp(1/2)", law("gamma", [1, 2]), F("exp", [0.5]), 1e-6],
    ["weibull(1, 2) = exp(1/2)", law("weibull", [1, 2]), F("exp", [0.5]), 1e-6],
    ["rayleigh(1) = weibull(2, sqrt 2)", law("rayleigh", [1]), F("weibull", [2, Math.SQRT2]), 1e-6],
    ["chi(2) = rayleigh(1)", law("chi", [2]), F("rayleigh", [1]), 1e-6],
    ["chi(1) = halfnormal(1)", law("chi", [1]), F("halfnormal", [1]), 1e-6],
    ["nakagami(1/2, 1) = halfnormal(1)", law("nakagami", [0.5, 1]), F("halfnormal", [1]), 1e-6],
    ["gev(0, 1, 0) = gumbel(0, 1)", law("gev", [0, 1, 0]), F("gumbel", [0, 1]), 1e-6],
    ["lomax(1, 1) shifted by 1 = pareto(1, 1)", law("lomax", [1, 1]), function (x) { return lawCDF(law("pareto", [1, 1]), x + 1); }, 1e-6],
    ["rice(0, 1) = rayleigh(1)", law("rice", [0, 1]), F("rayleigh", [1]), 1e-5],
    ["vonmises(0, 0) = unif(-π, π)", law("vonmises", [0, 0]), F("unif", [-Math.PI, Math.PI]), 1e-6],
    ["semicircle(2) = 4 beta(3/2, 3/2) - 2", law("semicircle", [2]), function (x) { return lawCDF(law("beta", [1.5, 1.5]), (x + 2) / 4); }, 1e-6],
    ["digits(2, [1, 1]) = unif(0, 1)", law("digits", [2, [1, 1]]), F("unif", [0, 1]), 1e-9],
    ["salem(1/2) = unif(0, 1)", law("salem", [0.5]), F("unif", [0, 1]), 1e-9],
    ["riesz(0, 5) = unif(0, 1)", law("riesz", [0, 5]), F("unif", [0, 1]), 1e-6],
    ["poissonbinomial(30 chances of 0.3) = binomial(30, 0.3)", law("poissonbinomial", [new Array(30).fill(0.3)]), F("binomial", [30, 0.3]), 1e-9],
    ["betabinomial(10, 1, 1) = dunif(0, 10)", law("betabinomial", [10, 1, 1]), F("dunif", [0, 10]), 1e-9],
    ["negbinomial(1, 1/2) = geometric(1/2)", law("negbinomial", [1, 0.5]), F("geometric", [0.5]), 1e-9],
    ["stable(2, 0) = normal(0, sqrt 2)", law("stable", [2, 0]), F("normal", [0, Math.SQRT2]), 0.012],
    ["stable(1, 0) = cauchy(0, 1)", law("stable", [1, 0]), F("cauchy", [0, 1]), 0.012],
    ["stable(1/2, 1) = levy(1)", law("stable", [0.5, 1]), F("levy", [1]), 0.012],
    ["bernoulliconv(1/2) = unif(-2, 2)", law("bernoulliconv", [0.5]), F("unif", [-2, 2]), 0.012],
    ["orbit(4 x (1 - x), 0.2) = arcsine()", law("orbit", [orbitMap(4), 0.2]), F("arcsine", []), 0.01],
  ];
  const bad = [];
  let worst = 0;
  for (const [name, law1, F2, allowed] of pairs) {
    const gap = biggestGap(law1, F2);
    if (allowed < 0.01) worst = Math.max(worst, gap);
    if (gap > allowed) bad.push(name + ": F's differ by up to " + short(gap) + ".");
  }
  addRow("The same law, made two ways", bad.length === 0,
         bad.length ? bad.join(" ") : pairs.length + " pairs; the exact ones agree to within " + short(worst) +
         ", and the ones worked out from draws to within Kolmogorov's 0.99 point.");
}

// T(x) = r x (1 - x), as the box hands it to orbit.
function orbitMap(r) {
  const T = function (x) { return r * x * (1 - x); };
  T.key = "logistic " + r;
  return T;
}


/* =====================================================================
   3. THE NUMBERS THE LAWS NEED
   ===================================================================== */

// The normal F and its inverse at known values (M. Abramowitz and I. A.
// Stegun, "Handbook of Mathematical Functions", Dover, 1965, Table
// 26.1; Phi(-10) from its tail series, 26.2.12), and F^-1(F(x)) = x far
// out in both tails.
function testNormal() {
  const known = [[-1, 0.15865525393145707], [1.96, 0.9750021048517795], [-10, 7.619853024160527e-24], [0, 0.5]];
  let worst = 0;
  for (const [x, Phi] of known) worst = Math.max(worst, Math.abs(normalCDF(x) - Phi) / Phi);
  let back = 0;
  // (Not far into the right tail: there F(x) is 1 minus a number too
  // small for the computer to keep next to 1.)
  for (const x of [-35, -20, -8, -3, -0.5, 0.5, 3]) back = Math.max(back, Math.abs(normalQuantile(normalCDF(x)) - x) / Math.abs(x));
  const q = normalQuantile(0.975);
  addRow("The normal F and F^-1", worst < 1e-12 && back < 1e-9 && Math.abs(q - 1.959963984540054) < 1e-12,
         "Phi at -1, 1.96, -10 and 0 is off by at most " + short(worst) + " (relative); F^-1(F(x)) is off from x by at most " +
         short(back) + " (relative) for x from -35 to 3; F^-1(0.975) = " + q + ".");
}

// The Airy function Ai solves Ai''(x) = x Ai(x) (DLMF 9.2.1): check that
// the slope of Ai' (by central differences, which are themselves off by
// about 1e-8 times x^2) is x Ai, and that the slope of Ai is Ai', on
// both sides of where the series meets the asymptotic pieces (-7 and
// 5), that the pieces meet there to within 1e-7, and that Ai(1) and
// Ai(-1) are the known values (Abramowitz and Stegun, Table 10.11).
function testAiry() {
  const h = 1e-4;
  let worst = 0, at = 0;
  for (let x = -12; x <= 9; x += 0.37) {
    const slope = (airy(x + h)[1] - airy(x - h)[1]) / (2 * h), slope0 = (airy(x + h)[0] - airy(x - h)[0]) / (2 * h);
    const [A, dA] = airy(x), size = Math.abs(A) + Math.abs(dA);
    const off = Math.max(Math.abs(slope - x * A), Math.abs(slope0 - dA)) / size;
    if (off > worst) { worst = off; at = x; }
  }
  let jump = 0;
  for (const edge of [-7, 5]) {
    const left = airy(edge - 1e-9), right = airy(edge + 1e-9);
    jump = Math.max(jump, Math.abs(left[0] - right[0]) / Math.abs(left[0]), Math.abs(left[1] - right[1]) / Math.abs(left[1]));
  }
  const one = airy(1)[0], minusOne = airy(-1)[0];
  addRow("The Airy function", worst < 1e-6 && jump < 1e-7 && Math.abs(one - 0.135292416) < 1e-9 && Math.abs(minusOne - 0.535560883) < 1e-9,
         "Ai'' = x Ai holds to within " + short(worst) + " (relative, worst at x = " + short(at) + ", for x from -12 to 9); the pieces meet at -7 and 5 to within " +
         short(jump) + "; Ai(1) = " + one.toFixed(10) + " and Ai(-1) = " + minusOne.toFixed(10) + " (tables: 0.1352924163, 0.5355608833).");
}

// The Tracy-Widom laws' means and variances, from their tables, against
// the values in F. Bornemann, "On the numerical evaluation of
// distributions in random matrix theory: a review", Markov Process.
// Related Fields 16 (2010) 803-866, Table 10.
function testTracyWidom() {
  const bad = [], found = [];
  for (const beta of [1, 2, 4]) {
    const law = tracyWidomLaw(beta), m = quantileMoments(law, 65536);
    const mean = LAW_CATALOG.tracywidom.mean(beta), variance = LAW_CATALOG.tracywidom.variance(beta);
    found.push("β = " + beta + ": mean " + m.mean.toFixed(5) + " (" + mean.toFixed(5) + "), variance " + m.variance.toFixed(5) + " (" + variance.toFixed(5) + ")");
    if (Math.abs(m.mean - mean) > 1e-3 || Math.abs(m.variance - variance) > 2e-3) bad.push(beta);
  }
  addRow("The Tracy-Widom laws", bad.length === 0, found.join("; ") + ".");
}

// Minkowski's ? at known points (from the continued fractions: 1/3 =
// [0; 3], sqrt 2 - 1 = [0; 2, 2, 2, ...], the golden ratio's (sqrt 5 -
// 1)/2 = [0; 1, 1, 1, ...]): exactly at the fractions, and to within
// 1e-11 at the two square roots, which the computer only has to about
// 1e-17 (its (sqrt 5 - 1)/2 has 37 1s and then a 2, and ? is so steep
// there that this moves it by 2^-37 or so); and ?(?^-1(u)) = u (the
// other way round, ?^-1(?(x)) = x, can't hold on the computer: ? is so
// flat next to every fraction that ?(0.1333) is within 2^-140 of
// ?(2/15) = 3/256, and the computer's ?(0.1333) is 3/256 exactly); the
// Cantor and Salem laws' F at known points (the Cantor function is 1/3
// at 1/4; Salem's is 1 - p at 1/2, the chance that the first digit is
// 0).
function testFractals() {
  const fractions = [[1 / 3, 1 / 4], [0.5, 0.5], [0.25, 0.125]], roots = [[Math.SQRT2 - 1, 0.4], [(Math.sqrt(5) - 1) / 2, 2 / 3]];
  const off = function (known) { return Math.max(...known.map(function ([x, q]) { return Math.abs(minkowskiQuestionMark(x) - q); })); };
  const atFractions = off(fractions), atRoots = off(roots);
  let back = 0;
  for (let u = 0.001; u < 1; u += 0.0137) back = Math.max(back, Math.abs(minkowskiQuestionMark(minkowskiInverse(u)) - u));
  const cantor = catalogLaw("cantor", []), salem = catalogLaw("salem", [0.3]);
  const cantorOff = Math.max(Math.abs(lawCDF(cantor, 0.25) - 1 / 3), Math.abs(lawCDF(cantor, 0.5) - 0.5), Math.abs(lawCDF(cantor, 0.4) - 0.5));
  const salemOff = Math.abs(lawCDF(salem, 0.5) - 0.7);
  addRow("Minkowski's ?, the Cantor and Salem laws", atFractions === 0 && atRoots < 1e-11 && back < 1e-9 && cantorOff < 1e-12 && salemOff < 1e-12,
         "? at 1/3, 1/2 and 1/4 is off by " + short(atFractions) + ", at sqrt 2 - 1 and (sqrt 5 - 1)/2 by at most " + short(atRoots) + "; ?(?^-1(u)) is off from u by at most " +
         short(back) + "; the Cantor F at 1/4, 2/5 and 1/2 is off by " + short(cantorOff) + "; Salem's at 1/2 by " + short(salemOff) + ".");
}


/* =====================================================================
   4. TYPED DENSITIES, SIZE-BIASED LAWS, AND WHAT IS REFUSED
   ===================================================================== */
function testRefusals() {
  const refused = function (text) {
    try { readRandomVariables(text, ["y"]); return makeRandomVariables(readRandomVariables(text, ["y"]), {}) && false; }
    catch (problem) { return problem.message; }
  };
  const cases = [
    ["w ~ {x >= 0: 2 e^(-x), 0}", "adds up to 2"], ["w ~ {x >= 0: -1, 0}", "negative"], ["w ~ 2 {x = 0: 1, 0}", "own piece"],
    ["w ~ exp(v)\nv ~ exp(1)", "can't be random"], ["X = Y\nY = X + 1", "from itself"], ["d_k ~ exp(k)", "can't depend on k"],
    ["w ~ unif(2, 1)", "bigger"], ["w ~ foo(1)", "isn't one of the laws"], ["e ~ exp(1)", "already means"], ["y ~ exp(1)", "page uses it"],
    ["u ~ exp(1)\nu ~ exp(2)", "twice"], ["ab ~ exp(1)", "can't be a name"], ["w ~ digits(3, [1, 1])", "b weights"],
  ];
  const wrong = cases.filter(function ([text, words]) { const m = refused(text); return !(m && m.includes(words)); });
  addRow("Laws and lines that are refused", wrong.length === 0,
         wrong.length ? "Not refused as expected: " + wrong.map(function (c) { return JSON.stringify(c[0]) + " (" + refused(c[0]) + ")"; }).join("; ")
                      : cases.length + " lines, each refused with the right reason (like \"" + refused(cases[0][0]) + "\").");
}

// A typed density with point masses, nadya's example from First Passage
// Percolation: masses p_0 at 0 and p_3 at 3, and the rest spread over
// [5, infinity) as (1 - p_0 - p_3) e^(5 - x).
function testTypedDensity() {
  const declared = readRandomVariables("w ~ {x = 0: p_0, x = 3: p_3, x >= 5: (1 - p_0 - p_3) e^(-x + 5), 0}", []);
  const law = makeRandomVariables(declared, { p_0: 0.2, p_3: 0.3 }).laws.get("w");
  const exact = [[-0.5, 0], [0, 0.2], [2, 0.2], [3, 0.5], [4.9, 0.5], [6, 1 - 0.5 * Math.exp(-1)], [10, 1 - 0.5 * Math.exp(-5)]];
  let worst = 0;
  for (const [x, F] of exact) worst = Math.max(worst, Math.abs(lawCDF(law, x) - F));
  const atoms = [0.1, 0.3].map(function (u) { return drawFromLaw(law, u); });
  addRow("A typed density with point masses", worst < 1e-5 && atoms[0] === 0 && atoms[1] === 3,
         "F is off by at most " + short(worst) + " at seven points; F^-1(0.1) = " + atoms[0] + " and F^-1(0.3) = " + atoms[1] + " (the masses at 0 and 3).");
}

// Size-biased laws (sizeBiasedLaw, js/sim-laws.js): for unif(1, 2) the
// size-biased F is (x^2 - 1)/3 on [1, 2]; for unif([2, 3]), the masses
// become 2/5 and 3/5.
function testSizeBiased() {
  const smooth = sizeBiasedLaw(catalogLaw("unif", [1, 2])), atoms = sizeBiasedLaw(catalogLaw("unif", [[2, 3]]));
  let worst = 0;
  for (let x = 1; x <= 2; x += 0.05) worst = Math.max(worst, Math.abs(lawCDF(smooth, x) - (x * x - 1) / 3));
  const masses = atoms.masses.map(function (m) { return m[1]; });
  addRow("Size-biased laws", worst < 1e-6 && Math.abs(masses[0] - 0.4) < 1e-12 && Math.abs(masses[1] - 0.6) < 1e-12,
         "For unif(1, 2), F is off from (x^2 - 1)/3 by at most " + short(worst) + "; for unif([2, 3]) the masses are " + masses.map(short).join(" and ") + ".");
}


/* =====================================================================
   5. NAMED RANDOM VARIABLES
   ===================================================================== */

// One number per name per place: [u, u] is two equal numbers; each new
// place, and each seed, gives new ones.
function testOnePerPlace() {
  const variables = randomVariablesOf("u ~ normal(0, 1)\nX = u + 1");
  const formula = prepareFormula(readTree("[u, u, X - 1]"), variables.declared).compile();
  const drawer = newDrawer(variables, "one per place"), other = newDrawer(variables, "another seed");
  let unequal = 0, repeats = 0, sameAcrossSeeds = 0;
  const seen = new Set();
  for (let place = 0; place < 2000; place++) {
    drawer.at(place);
    const [a, b, c] = formula.evaluate(drawer.scope).toArray();
    if (a !== b || Math.abs(c - a) > 1e-12) unequal++;
    if (seen.has(a)) repeats++;
    seen.add(a);
    other.at(place);
    if (other.value("u", 0) === a) sameAcrossSeeds++;
  }
  addRow("A name is one number in each place", unequal === 0 && repeats === 0 && sameAcrossSeeds === 0,
         "2,000 places: [u, u, X - 1] had three equal numbers in every one (" + unequal + " didn't), no u came up twice (" + repeats +
         " did), and another seed gave other numbers in every place (" + sameAcrossSeeds + " the same).");
}

// Coupling: in each place, u ~ exp(r) is F^-1(U) for the same U, so it
// only goes down as r goes up; and changing w's law leaves u alone.
function testCoupling() {
  const at = function (r, s) {
    const drawer = newDrawer(randomVariablesOf("u ~ exp(r)\nw ~ unif(0, s)", { r: r, s: s }), "coupling"), values = [];
    for (let place = 0; place < 1000; place++) { drawer.at(place); values.push([drawer.value("u", 0), drawer.value("w", 0)]); }
    return values;
  };
  const one = at(1, 1), two = at(2, 1), three = at(2, 5);
  let wrongWay = 0, moved = 0, ratio = 0;
  for (let place = 0; place < 1000; place++) {
    if (!(two[place][0] <= one[place][0])) wrongWay++;
    ratio = Math.max(ratio, Math.abs(two[place][0] * 2 - one[place][0]));
    if (three[place][0] !== two[place][0]) moved++;
  }
  addRow("Moving a slider moves the draws together (coupling)", wrongWay === 0 && moved === 0 && ratio < 1e-9,
         "1,000 places: doubling exp's rate halved every u (off by at most " + short(ratio) + "; " + wrongWay +
         " went the wrong way), and changing w's law left every u alone (" + moved + " moved).");
}

// Independence: between two names in one place, between one name in
// neighboring places, and between d_1 and d_2 of a family, the
// correlation of 20,000 draws is within 4/sqrt(20000) = 0.028 of 0
// (each would be about normal with standard deviation 1/sqrt(n)).
function testIndependence() {
  const variables = randomVariablesOf("u ~ unif(0, 1)\nv ~ unif(0, 1)\nd_k ~ normal(0, 1)");
  const drawer = newDrawer(variables, "independence"), n = 20000;
  const pairs = { "u and v in one place": [], "u in neighboring places": [], "d_1 and d_2": [] };
  let before = 0;
  for (let place = 0; place < n; place++) {
    drawer.at(place);
    const u = drawer.value("u", 0);
    pairs["u and v in one place"].push([u, drawer.value("v", 0)]);
    if (place > 0) pairs["u in neighboring places"].push([before, u]);
    pairs["d_1 and d_2"].push([drawer.value("d", 1), drawer.value("d", 2)]);
    before = u;
  }
  const found = Object.keys(pairs).map(function (name) { return [name, correlation(pairs[name])]; });
  addRow("Different names, places and indices are independent", found.every(function (f) { return Math.abs(f[1]) < 4 / Math.sqrt(n); }),
         "Correlations over " + n.toLocaleString() + " draws: " + found.map(function (f) { return f[0] + " " + short(f[1]); }).join(", ") + ".");
}

function correlation(pairs) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pairs) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  const n = pairs.length, cov = sxy / n - sx * sy / (n * n);
  return cov / Math.sqrt((sxx / n - sx * sx / (n * n)) * (syy / n - sy * sy / (n * n)));
}

// A family and a sum: X = sum(k, 1, 40, d_k / 3^k) with d_k ~ unif([0,
// 2]) has the Cantor law: its draws in 4,000 places, and the law the
// box works out for its chart, against the Cantor F (catalogLaw).
function testSeries() {
  const variables = randomVariablesOf("d_k ~ unif([0, 2])\nX = sum(k, 1, 40, d_k / 3^k)");
  const drawer = newDrawer(variables, "series"), draws = [];
  for (let place = 0; place < 4000; place++) { drawer.at(place); draws.push(drawer.value("X", 0)); }
  const cantor = catalogLaw("cantor", []), F = function (x) { return lawCDF(cantor, x); };
  const fromDraws = biggestGap(lawFromDraws(draws), F), estimated = variables.lawOf("X");
  const fromBox = biggestGap(estimated, F);
  addRow("A random series of a family: the Cantor law", fromDraws < 1.63 / Math.sqrt(4000) && fromBox < 1.63 / Math.sqrt(estimated.estimated),
         "The F of 4,000 draws is within " + short(fromDraws) + " of the Cantor F (0.99 point: " + short(1.63 / Math.sqrt(4000)) +
         "), and the chart's F, from " + estimated.estimated.toLocaleString() + " draws, within " + short(fromBox) + ".");
}

// The Latin hypercube (sampleRandomVariables): the average of u is 1/2
// to within 1e-5, of u v is 1/4 to within 0.005, and the law of
// g = 1 + δ u^2 worked out for the chart is within 2/n of its exact F,
// P(g <= t) = sqrt((t - 1)/δ).
function testLatinHypercube() {
  const variables = randomVariablesOf("u ~ unif(0, 1)\nv ~ unif(0, 1)\ng = 1 + δ u^2", { δ: 0.5 });
  const answers = sampleRandomVariables(variables, function (drawer) { return [drawer.value("u", 0), drawer.value("u", 0) * drawer.value("v", 0)]; });
  const n = answers.length;
  const meanU = answers.reduce(function (s, a) { return s + a[0]; }, 0) / n, meanUV = answers.reduce(function (s, a) { return s + a[1]; }, 0) / n;
  const g = variables.lawOf("g"), gap = biggestGap(g, function (t) { return t <= 1 ? 0 : t >= 1.5 ? 1 : Math.sqrt((t - 1) / 0.5); });
  addRow("Many draws at once (the Latin hypercube)", Math.abs(meanU - 0.5) < 1e-5 && Math.abs(meanUV - 0.25) < 0.005 && gap < 2 / g.estimated,
         n.toLocaleString() + " samples: the average of u is " + meanU.toFixed(8) + ", of u v " + meanUV.toFixed(5) + "; the chart's F of 1 + δ u^2 is within " +
         short(gap) + " of the exact one.");
}


function allTests() {
  return [testTables, testDensities, testMoments, testSameLaws, testNormal, testAiry, testTracyWidom, testFractals,
          testRefusals, testTypedDensity, testSizeBiased, testOnePerPlace, testCoupling, testIndependence, testSeries, testLatinHypercube];
}
if (typeof runChecksOnClick === "function") runChecksOnClick(allTests);
