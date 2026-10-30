/* =====================================================================
   sim-law-catalog.js  —  the named laws of the Random variables box,
                          like normal(0, 1) or cantor()
   ---------------------------------------------------------------------
   Shared by every sim with a Random variables box (js/sim-random.js):
   the line  u ~ normal(0, 1)  gives u the normal law with mean 0 and
   standard deviation 1. Every law is built from js/sim-laws.js, which
   the page loads before this file, along with math.js and the library
   jStat (https://jstat.github.io), which works out the incomplete gamma
   and beta functions that the gamma, beta, Student t (and more) laws'
   F need.

   Unless an entry says otherwise, the formulas (densities, F, means and
   variances, and their parameters) are the standard ones in N. L.
   Johnson, S. Kotz and N. Balakrishnan, "Continuous Univariate
   Distributions", Vols. 1-2, 2nd ed., Wiley, 1994-95, and N. L.
   Johnson, A. W. Kemp and S. Kotz, "Univariate Discrete
   Distributions", 3rd ed., Wiley, 2005.

   Each entry of LAW_CATALOG has:
     name        the law's name, for the menu
     group       which part of the menu it is in
     params      its parameters' names, as typed: normal(μ, σ)
     defaults    the parameters the menu puts in the box
     lists       which parameters are lists, like [1/2, 0, 1/2] (if any)
     formulas    which parameters are formulas in x, like orbit's T(x)
                 (if any): they come to build as functions of x
     values      where X can be, in words (for the help page)
     how         "exact" (a formula for F), "added up" (the density,
                 added up on a fine grid) or "estimated" (from 20,000
                 draws, for the chart only: the draws themselves are exact)
     check(...)  what is wrong with the parameters ("" if nothing)
     build(...)  the law (js/sim-laws.js)
   and, for the check page, its density(x, ...) or mass(k, ...), and
   mean(...) and variance(...) where they are known (Infinity when they
   are infinite, NaN when there is none).

   Contents:
     1. Numbers the laws need (the normal F, Bessel I0, Airy, ...)
     2. The catalog, group by group
     3. catalogLaw(key, args): a law from the catalog
   ===================================================================== */


/* =====================================================================
   1. NUMBERS THE LAWS NEED
   ===================================================================== */

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const EULER_GAMMA = 0.5772156649015329;

// log Gamma(x) and Gamma(x) for x > 0, and log B(a, b) (jStat).
function logGamma(x) { return jStat.gammaln(x); }
function gammaFunction(x) { return Math.exp(jStat.gammaln(x)); }
function logBeta(a, b) { return jStat.gammaln(a) + jStat.gammaln(b) - jStat.gammaln(a + b); }
function logChoose(n, k) { return jStat.gammaln(n + 1) - jStat.gammaln(k + 1) - jStat.gammaln(n - k + 1); }

// The regularized incomplete gamma function P(a, x) and beta function
// I_x(a, b) (jStat).
function gammaP(a, x) { return x <= 0 ? 0 : jStat.lowRegGamma(a, x); }
function betaI(x, a, b) { return x <= 0 ? 0 : x >= 1 ? 1 : jStat.ibeta(x, a, b); }

// The standard normal F, Phi(x). For |x| <= 2, the series
//   Phi(x) = 1/2 + phi(x) (x + x^3/3 + x^5/(3*5) + ...)
// (G. Marsaglia, "Evaluating the normal distribution", J. Stat.
// Software 11 (2004) issue 4); further out, from the tail.
function normalCDF(x) {
  if (x < -2) return normalTail(-x);
  if (x > 2) return 1 - normalTail(x);
  let term = x, sum = x;
  for (let n = 1; n < 200 && Math.abs(term) > 1e-17 * Math.abs(sum); n++) {
    term *= x * x / (2 * n + 1);
    sum += term;
  }
  return 0.5 + sum * Math.exp(-x * x / 2) / SQRT_2PI;
}

// 1 - Phi(x), for x >= 2: phi(x) times the continued fraction
//   1/(x + 1/(x + 2/(x + 3/(x + ...))))
// (Laplace's; worked out from 120 deep, which is plenty for x >= 2).
// Written as its log too, for tails too small for the computer.
function normalTail(x) { return Math.exp(logNormalTail(x)); }
function logNormalTail(x) {
  let t = x;
  for (let k = 120; k >= 1; k--) t = x + k / t;
  return -x * x / 2 - Math.log(SQRT_2PI) - Math.log(t);
}

// log Phi(x), good even far out in the left tail.
function logNormalCDF(x) { return x < -2 ? logNormalTail(-x) : Math.log(normalCDF(x)); }

// Phi^-1(u): P. J. Acklam's rational approximation (relative error
// below 1.2e-9; "An algorithm for computing the inverse normal
// cumulative distribution function", 2003), then two of Newton's steps
// on Phi, which bring it to the computer's precision.
function normalQuantile(u) {
  if (u <= 0) return -Infinity;
  if (u >= 1) return Infinity;
  if (u > 0.5) return -normalQuantile(1 - u);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  let x;
  if (u < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(u));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = u - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  for (let step = 0; step < 2; step++) {
    // Newton on log Phi, which stays good in the far tail.
    const logPhi = logNormalCDF(x), logDensity = -x * x / 2 - Math.log(SQRT_2PI);
    x -= (logPhi - Math.log(u)) * Math.exp(logPhi - logDensity);
  }
  return x;
}

// e^(-z) I0(z), for z >= 0 (I0 the modified Bessel function): the
// series sum of (z^2/4)^k / (k!)^2 for z < 15, and the asymptotic
// series e^z / sqrt(2 pi z) (1 + 1/(8z) + 9/(2 (8z)^2) + ...) beyond
// (F. W. J. Olver et al., NIST Digital Library of Mathematical
// Functions, https://dlmf.nist.gov, 10.25.2 and 10.40.1).
function besselI0Scaled(z) {
  if (z < 15) {
    let term = 1, sum = 1;
    for (let k = 1; k < 500 && term > 1e-17 * sum; k++) { term *= (z * z / 4) / (k * k); sum += term; }
    return sum * Math.exp(-z);
  }
  let term = 1, sum = 1;
  for (let k = 1; k <= 10; k++) { term *= (2 * k - 1) * (2 * k - 1) / (k * 8 * z); sum += term; }
  return sum / Math.sqrt(2 * Math.PI * z);
}

// The Airy function Ai(x) and its derivative Ai'(x), as [Ai, Ai'].
// Between -7 and 5, its Maclaurin series Ai = c1 f - c2 g; beyond, its
// asymptotic series (DLMF 9.4.1, 9.7.5, 9.7.6, 9.7.9, 9.7.11). The
// check page tests that the pieces agree where they meet.
const AIRY_C1 = 0.355028053887817239, AIRY_C2 = 0.258819403792806798;
function airy(x) {
  if (x > 5) return airyRight(x);
  if (x < -7) return airyLeft(-x);
  const x3 = x * x * x;
  let f = 1, fSum = 1, g = x, gSum = x, fd = x * x / 2, fdSum = x * x / 2, gd = 1, gdSum = 1;
  for (let k = 0; k < 200; k++) {
    f *= x3 / ((3 * k + 2) * (3 * k + 3));
    g *= x3 / ((3 * k + 3) * (3 * k + 4));
    gd *= x3 / ((3 * k + 1) * (3 * k + 3));
    if (k >= 1) fd *= x3 / ((3 * k) * (3 * k + 2));
    fSum += f; gSum += g; gdSum += gd;
    if (k >= 1) fdSum += fd;
    if (Math.abs(f) + Math.abs(g) + Math.abs(fd) + Math.abs(gd) < 1e-18) break;
  }
  return [AIRY_C1 * fSum - AIRY_C2 * gSum, AIRY_C1 * fdSum - AIRY_C2 * gdSum];
}

// The coefficients u_k and v_k of the asymptotic series (DLMF 9.7.2).
const AIRY_U = [1], AIRY_V = [1];
for (let k = 1; k <= 30; k++) {
  AIRY_U.push(AIRY_U[k - 1] * (6 * k - 5) * (6 * k - 3) * (6 * k - 1) / ((2 * k - 1) * 216 * k));
  AIRY_V.push(-AIRY_U[k] * (6 * k + 1) / (6 * k - 1));
}

// Ai and Ai' for x > 5 (DLMF 9.7.5, 9.7.6), the series stopped before
// its terms start to grow.
function airyRight(x) {
  const zeta = 2 / 3 * Math.pow(x, 1.5);
  let su = 0, sv = 0, power = 1, last = Infinity;
  for (let k = 0; k <= 30; k++) {
    const term = Math.abs(AIRY_U[k] * power);
    if (term > last || term < 1e-17) break;
    last = term;
    su += (k % 2 ? -1 : 1) * AIRY_U[k] * power;
    sv += (k % 2 ? -1 : 1) * AIRY_V[k] * power;
    power /= zeta;
  }
  const e = Math.exp(-zeta) / (2 * Math.sqrt(Math.PI));
  return [e * su / Math.pow(x, 0.25), -e * sv * Math.pow(x, 0.25)];
}

// Ai(-z) and Ai'(-z) for z > 7 (DLMF 9.7.9, 9.7.11).
function airyLeft(z) {
  const zeta = 2 / 3 * Math.pow(z, 1.5);
  let ue = 0, uo = 0, ve = 0, vo = 0, power = 1, last = Infinity;
  for (let k = 0; k <= 30; k++) {
    const term = Math.abs(AIRY_U[k] * power);
    if (term > last || term < 1e-17) break;
    last = term;
    const sign = Math.floor(k / 2) % 2 ? -1 : 1;
    if (k % 2 === 0) { ue += sign * AIRY_U[k] * power; ve += sign * AIRY_V[k] * power; }
    else { uo += sign * AIRY_U[k] * power; vo += sign * AIRY_V[k] * power; }
    power /= zeta;
  }
  const c = Math.cos(zeta - Math.PI / 4), s = Math.sin(zeta - Math.PI / 4), root = Math.sqrt(Math.PI);
  return [(c * ue + s * uo) / (root * Math.pow(z, 0.25)), Math.pow(z, 0.25) * (s * ve - c * vo) / root];
}

// The determinant of a square matrix (a list of rows), by Gaussian
// elimination with the largest pivot in each column.
function determinant(rows) {
  const a = rows.map(function (r) { return r.slice(); }), n = a.length;
  let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (a[p][c] === 0) return 0;
    if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; det = -det; }
    det *= a[c][c];
    for (let r = c + 1; r < n; r++) {
      const factor = a[r][c] / a[c][c];
      for (let k = c; k < n; k++) a[r][k] -= factor * a[c][k];
    }
  }
  return det;
}

// The Tracy-Widom laws' F, by F. Bornemann's method ("On the numerical
// evaluation of distributions in random matrix theory: a review",
// Markov Process. Related Fields 16 (2010) 803-866): each is a
// Fredholm determinant, worked out as an ordinary determinant at the
// points of Gauss-Legendre quadrature (50 of them: the error goes down
// exponentially in their number, and 50 are plenty here). With
// A_s(x, y) = Ai((x + y)/2 + s)/2 on (0, infinity),
//   F_2(s) = det(I - K) on (s, infinity), K the Airy kernel
//            (Ai(x) Ai'(y) - Ai'(x) Ai(y)) / (x - y),
//   F_1(s) = det(I - A_s)  (P. L. Ferrari and H. Spohn, J. Phys. A 38
//            (2005) L557),
//   F_4(s) = (det(I - A_{s sqrt 2}) + det(I + A_{s sqrt 2})) / 2.
// The integrands are next to nothing beyond 12 to the right, so the
// integrals stop there.
const TW_NODES = 50;
function tracyWidomCDF(beta, s) {
  if (beta === 2) {
    const right = Math.max(s, 0) + 12, rule = gaussLegendreOn(s, right, TW_NODES);
    const A = rule.points.map(airy);
    const rows = rule.points.map(function (x, i) {
      return rule.points.map(function (y, j) {
        const kernel = i === j ? A[i][1] * A[i][1] - x * A[i][0] * A[i][0]
                               : (A[i][0] * A[j][1] - A[i][1] * A[j][0]) / (x - y);
        return (i === j ? 1 : 0) - Math.sqrt(rule.weights[i] * rule.weights[j]) * kernel;
      });
    });
    return determinant(rows);
  }
  const t = beta === 1 ? s : s * Math.SQRT2;
  const rule = gaussLegendreOn(0, 2 * (Math.max(-t, 0) + 12), TW_NODES);
  function det(sign) {
    return determinant(rule.points.map(function (x, i) {
      return rule.points.map(function (y, j) {
        return (i === j ? 1 : 0) - sign * Math.sqrt(rule.weights[i] * rule.weights[j]) * airy((x + y) / 2 + t)[0] / 2;
      });
    }));
  }
  return beta === 1 ? det(1) : (det(1) + det(-1)) / 2;
}

// Gauss-Legendre points and weights on [a, b] (gaussLegendre in
// js/sim-laws.js gives them on [-1, 1]).
function gaussLegendreOn(a, b, n) {
  const rule = gaussLegendre(n), half = (b - a) / 2, middle = (a + b) / 2;
  return { points: rule.points.map(function (z) { return middle + half * z; }),
           weights: rule.weights.map(function (w) { return w * half; }) };
}

// The Tracy-Widom law beta, as a table of F on [-14, 12] every 0.025
// (F is smooth, so straight lines between are off by about 1e-5 at
// most), made once per beta.
const TRACY_WIDOM = {};
function tracyWidomLaw(beta) {
  if (!TRACY_WIDOM[beta]) {
    const xs = [], Fs = [];
    for (let s = -14; s <= 12 + 1e-9; s += 0.025) {
      xs.push(s);
      Fs.push(Math.min(1, Math.max(Fs.length ? Fs[Fs.length - 1] : 0, tracyWidomCDF(beta, s))));
    }
    Fs[0] = 0;
    Fs[Fs.length - 1] = 1;
    TRACY_WIDOM[beta] = finishTable(xs, Fs);
  }
  return TRACY_WIDOM[beta];
}

// The sum of j^(-s) for j >= K (the zeta law's tail): for K >= 1000 by
// the Euler-Maclaurin formula (DLMF 2.10.1), otherwise zeta(s) minus
// the first K - 1 terms.
function zetaTail(s, K) {
  if (K < 1000) {
    let sum = 0;
    for (let j = 1; j < K; j++) sum += Math.pow(j, -s);
    return math.zeta(s) - sum;
  }
  return Math.pow(K, 1 - s) / (s - 1) + Math.pow(K, -s) / 2 + s * Math.pow(K, -s - 1) / 12 -
         s * (s + 1) * (s + 2) * Math.pow(K, -s - 3) / 720 +
         s * (s + 1) * (s + 2) * (s + 3) * (s + 4) * Math.pow(K, -s - 5) / 30240;
}

// The sum of k^(-s) for k = 1 .. N (a "generalized harmonic number").
function harmonic(N, s) {
  let sum = 0;
  for (let k = 1; k <= N; k++) sum += Math.pow(k, -s);
  return sum;
}

// A fixed source of uniform numbers for working a law out from draws
// (the stable laws' charts, say), so the chart is the same every time.
function chartDraws(draw, n) {
  const random = seededUniform("law chart"), values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = draw(function (j) { return random.uniform(i, j); });
  return values;
}
const CHART_DRAWS = 20000;


/* =====================================================================
   2. THE CATALOG
   ---------------------------------------------------------------------
   Small helpers first: the checks every law's parameters need.
   ===================================================================== */

function positive(name, v) { return v > 0 ? "" : name + " must be more than 0."; }
function between(name, v, lo, hi) { return v >= lo && v <= hi ? "" : name + " must be from " + lo + " to " + hi + "."; }
function whole(name, v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi ? "" : name + " must be a whole number from " + lo + " to " + hi + ".";
}
function first() { for (const message of arguments) if (message) return message; return ""; }
function weightsCheck(name, w) {
  if (w.some(function (x) { return !(x >= 0) || !isFinite(x); })) return "Every weight in " + name + " must be 0 or more.";
  return w.reduce(function (a, b) { return a + b; }, 0) > 0 ? "" : "The weights in " + name + " add up to 0.";
}

// A law on finitely many values, each with a weight (the weights are
// scaled to add up to 1, as weight lists are everywhere on the site).
function atomsLaw(values, weights) {
  const total = weights.reduce(function (a, b) { return a + b; }, 0);
  const masses = new Map();
  values.forEach(function (v, i) { if (weights[i] > 0) masses.set(v, (masses.get(v) || 0) + weights[i] / total); });
  const sorted = Array.from(masses).sort(function (a, b) { return a[0] - b[0]; });
  const xs = [], Fs = [];
  let F = 0;
  for (const [x, m] of sorted) { xs.push(x, x); Fs.push(F, F + m); F += m; }
  Fs[Fs.length - 1] = 1;
  const law = finishTable(xs, Fs);
  law.masses = sorted;
  return law;
}

// The digits law (nadya's): X = sum over k >= 1 of D_k / b^k, with the
// digits D_k independent and P(D_k = j) = p_j. Its F and F^-1 come
// straight from the digits: F(x) adds up, digit by digit of x, the
// chance of a smaller digit, times the chance of all the digits so far;
// F^-1(u) reads the digits off u, each from which p_j-stretch u is in
// (a self-similar law: J. E. Hutchinson, "Fractals and self
// similarity", Indiana Univ. Math. J. 30 (1981) 713-747). Both go digit
// by digit until the chance of all the digits so far is below 1e-17
// (for a law that crowds near an end, like Salem's with a small p, that
// can be hundreds of digits), and treat the rest as uniform.
function digitsLaw(b, p) {
  const total = p.reduce(function (a, c) { return a + c; }, 0), q = p.map(function (c) { return c / total; });
  const below = [0];
  for (let j = 0; j < b; j++) below.push(below[j] + q[j]);
  const single = q.findIndex(function (c) { return c === 1; });
  if (single >= 0) return pointMassLaw(single / (b - 1));
  function cdf(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let F = 0, weight = 1;
    for (let k = 0; k < 1100 && weight > 1e-17; k++) {
      const y = x * b, d = Math.min(b - 1, Math.floor(y));
      F += weight * below[d];
      weight *= q[d];
      x = y - d;
    }
    return F + weight * x;
  }
  function quantile(u) {
    let x = 0, scale = 1, weight = 1;
    for (let k = 0; k < 1100 && weight > 1e-17 && scale > 0; k++) {
      // The digit: the first d (with p_d > 0) whose stretch, from
      // below[d] to below[d + 1], reaches u. (So F^-1 is the least x
      // with F(x) >= u: at u = 1/2, the Cantor law's is 1/3, not 2/3.)
      let d = 0;
      while (d < b - 1 && (q[d] === 0 || u > below[d + 1])) d++;
      u = Math.min(1, Math.max(0, (u - below[d]) / q[d]));
      weight *= q[d];
      scale /= b;
      x += d * scale;
    }
    return x + u * scale;
  }
  const meanDigit = q.reduce(function (s, c, j) { return s + c * j; }, 0);
  return lawFromCDF({ cdf: cdf, quantile: quantile, least: 0, most: 1, mean: meanDigit / (b - 1) });
}
function digitsVariance(b, p) {
  const total = p.reduce(function (a, c) { return a + c; }, 0);
  const m = p.reduce(function (s, c, j) { return s + c * j; }, 0) / total;
  const v = p.reduce(function (s, c, j) { return s + c * (j - m) * (j - m); }, 0) / total;
  return v / (b * b - 1);
}

// Minkowski's question mark function ?(x) on [0, 1], from the continued
// fraction x = [0; a_1, a_2, ...]:
//   ?(x) = 2 (2^(-a_1) - 2^(-(a_1 + a_2)) + 2^(-(a_1 + a_2 + a_3)) - ...)
// (H. Minkowski, 1904; R. Salem, "On some singular monotonic functions
// which are strictly increasing", Trans. AMS 53 (1943) 427-439). Its
// inverse reads u's binary digits: their runs, 0s then 1s then 0s, ...,
// of lengths a_1 - 1, a_2, a_3, ..., are the continued fraction of
// ?^-1(u). The computer's u has finitely many binary digits (doubling
// it and taking away 1 is exact, so they come out exactly), and the 0s
// after the last 1 are a run that never ends, which ends the continued
// fraction.
function minkowskiQuestionMark(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let sum = 0, total = 0, sign = 1;
  for (let k = 0; k < 64 && x > 0 && total < 60; k++) {
    const y = 1 / x, a = Math.floor(y);
    total += a;
    sum += sign * Math.pow(2, -total);
    sign = -sign;
    x = y - a;
  }
  return 2 * sum;
}
function minkowskiInverse(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const runs = [];
  let bit = 0, run = 0;
  while (u > 0) {
    u *= 2;
    const b = u >= 1 ? 1 : 0;
    if (b) u -= 1;
    if (b === bit) run++;
    else { runs.push(run); run = 1; bit = b; }
  }
  // (The last run, of 1s, ended where u's digits end: the 0s after it
  // never end.)
  runs.push(run);
  runs[0] += 1;      // a_1 = (the first run of 0s) + 1
  let x = 0;
  for (let k = runs.length - 1; k >= 0; k--) x = 1 / (runs[k] + x);
  return x;
}

// A Bernoulli convolution X = sum over k >= 0 of s_k lambda^k, the
// signs s_k = +-1 independent and fair, from the bits of as many
// uniform numbers as it takes for lambda^k to be next to nothing (at
// most 200 of them, 52 bits each). P. Erdos, "On a family of symmetric
// Bernoulli convolutions", Amer. J. Math. 61 (1939) 974-976; B.
// Solomyak, "On the random series sum +- lambda^n (an Erdos problem)",
// Ann. Math. 142 (1995) 611-625.
function bernoulliConvolutionDraw(lambda) {
  const terms = Math.min(200 * 52, Math.ceil(Math.log(1e-17 * (1 - lambda)) / Math.log(lambda)));
  return function (uniform) {
    let sum = 0, power = 1, k = 0;
    for (let j = 0; k < terms; j++) {
      let bits = Math.floor(uniform(j) * 4503599627370496);    // 2^52
      for (let b = 0; b < 52 && k < terms; b++, k++) {
        sum += (bits % 2 ? 1 : -1) * power;
        bits = Math.floor(bits / 2);
        power *= lambda;
      }
    }
    return sum;
  };
}

// A stable law S(alpha, beta, 1, 0) (J. P. Nolan's parametrization 1),
// drawn from two uniform numbers by the method of J. M. Chambers, C. L.
// Mallows and B. W. Stuck, "A method for simulating stable random
// variables", JASA 71 (1976) 340-344 (as written out by R. Weron,
// Statist. Probab. Lett. 28 (1996) 165-171).
function stableDraw(alpha, beta) {
  return function (uniform) {
    const V = Math.PI * (uniform(0) - 0.5), W = -Math.log(uniform(1));
    if (alpha === 1) {
      const a = Math.PI / 2 + beta * V;
      return 2 / Math.PI * (a * Math.tan(V) - beta * Math.log(Math.PI / 2 * W * Math.cos(V) / a));
    }
    const t = beta * Math.tan(Math.PI * alpha / 2);
    const B = Math.atan(t) / alpha, S = Math.pow(1 + t * t, 1 / (2 * alpha));
    return S * Math.sin(alpha * (V + B)) / Math.pow(Math.cos(V), 1 / alpha) *
           Math.pow(Math.cos(V - alpha * (V + B)) / W, (1 - alpha) / alpha);
  };
}

// Where the orbit x_0, T(x_0), T(T(x_0)), ... of a map T spends its
// time: the law of a point picked from 2^18 steps of the orbit, after
// 10,000 steps to settle. When T has an invariant law that the orbits
// of almost every x_0 follow (an "ergodic" law: G. D. Birkhoff, "Proof
// of the ergodic theorem", PNAS 17 (1931) 656-660), this is that law;
// for T(x) = 4 x (1 - x) it is the arcsine law (S. M. Ulam and J. von
// Neumann, Bull. AMS 53 (1947) 1120), and at r = 3.5699456... (the
// Feigenbaum point) a singular law on a Cantor set.
function orbitLaw(T, x0) {
  let x = x0;
  const step = function () {
    x = T(x);
    if (!isFinite(x)) throw new Error("T(x) isn't a number along the orbit (it ran off to " + x + ").");
  };
  for (let k = 0; k < 10000; k++) step();
  const values = new Float64Array(262144);
  for (let k = 0; k < values.length; k++) { step(); values[k] = x; }
  return lawFromDraws(values);
}

// The Riesz product's density on [0, 1].
function rieszDensity(x, a, N) {
  let f = 1;
  for (let k = 1; k <= N; k++) f *= 1 + a * Math.cos(2 * Math.PI * Math.pow(3, k) * x);
  return f;
}


// The groups, in the menu's order.
const LAW_GROUPS = ["Discrete, finitely many values", "Discrete, infinitely many values",
  "Continuous on a bounded interval", "Continuous on (0, ∞)", "Continuous on the whole line", "Singular and fractal"];
const [FINITE, COUNTABLE, BOUNDED, HALF_LINE, LINE, FRACTAL] = LAW_GROUPS;

const LAW_CATALOG = {

  /* --- Discrete, finitely many values ------------------------------ */
  bernoulli: {
    name: "Bernoulli", group: FINITE, params: ["p"], defaults: ["1/2"], values: "0, 1", how: "exact",
    check: function (p) { return between("p", p, 0, 1); },
    build: function (p) { return lawFromMasses({ mass: function (k) { return LAW_CATALOG.bernoulli.mass(k, p); }, least: 0, most: 1, mean: p }); },
    mass: function (k, p) { return k === 1 ? p : k === 0 ? 1 - p : 0; },
    mean: function (p) { return p; }, variance: function (p) { return p * (1 - p); },
  },
  rademacher: {
    name: "Rademacher (±1)", group: FINITE, params: [], defaults: [], values: "−1, 1", how: "exact",
    check: function () { return ""; },
    build: function () { return atomsLaw([-1, 1], [1, 1]); },
    mass: function (k) { return k === 1 || k === -1 ? 0.5 : 0; },
    mean: function () { return 0; }, variance: function () { return 1; },
  },
  binomial: {
    name: "Binomial", group: FINITE, params: ["n", "p"], defaults: ["10", "1/2"], values: "0, 1, ..., n", how: "exact",
    check: function (n, p) { return first(whole("n", n, 0, 1e6), between("p", p, 0, 1)); },
    build: function (n, p) { return lawFromMasses({ mass: function (k) { return LAW_CATALOG.binomial.mass(k, n, p); }, least: 0, most: n, mean: n * p }); },
    mass: function (k, n, p) {
      if (k < 0 || k > n) return 0;
      if (p === 0) return k === 0 ? 1 : 0;
      if (p === 1) return k === n ? 1 : 0;
      return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
    },
    mean: function (n, p) { return n * p; }, variance: function (n, p) { return n * p * (1 - p); },
  },
  dunif: {
    name: "Uniform on whole numbers a, ..., b", group: FINITE, params: ["a", "b"], defaults: ["1", "6"], values: "a, a + 1, ..., b", how: "exact",
    check: function (a, b) {
      return Number.isInteger(a) && Number.isInteger(b) && a <= b && b - a <= 1048576 ? "" : "a and b must be whole numbers, a no bigger than b.";
    },
    build: function (a, b) { return lawFromMasses({ mass: function (k) { return 1 / (b - a + 1); }, least: a, most: b, mean: (a + b) / 2 }); },
    mass: function (k, a, b) { return k >= a && k <= b ? 1 / (b - a + 1) : 0; },
    mean: function (a, b) { return (a + b) / 2; }, variance: function (a, b) { return ((b - a + 1) * (b - a + 1) - 1) / 12; },
  },
  categorical: {
    name: "Values with weights", group: FINITE, params: ["values", "weights"], defaults: ["[1, 2, 3]", "[1, 1, 2]"], lists: [0, 1],
    values: "the values listed", how: "exact",
    check: function (v, w) { return v.length === w.length ? weightsCheck("weights", w) : "The values and the weights must be lists of the same length."; },
    build: function (v, w) { return atomsLaw(v, w); },
    mean: function (v, w) { const t = w.reduce(function (a, b) { return a + b; }, 0); return v.reduce(function (s, x, i) { return s + x * w[i]; }, 0) / t; },
  },
  hypergeometric: {
    name: "Hypergeometric", group: FINITE, params: ["N", "K", "n"], defaults: ["50", "10", "5"],
    values: "max(0, n + K − N), ..., min(n, K)", how: "exact",
    check: function (N, K, n) { return first(whole("N", N, 1, 1e6), whole("K", K, 0, N), whole("n", n, 0, N)); },
    build: function (N, K, n) {
      return lawFromMasses({ mass: function (k) { return LAW_CATALOG.hypergeometric.mass(k, N, K, n); },
                             least: Math.max(0, n + K - N), most: Math.min(n, K), mean: n * K / N });
    },
    mass: function (k, N, K, n) {
      if (k < Math.max(0, n + K - N) || k > Math.min(n, K)) return 0;
      return Math.exp(logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n));
    },
    mean: function (N, K, n) { return n * K / N; },
    variance: function (N, K, n) { return N > 1 ? n * (K / N) * ((N - K) / N) * ((N - n) / (N - 1)) : 0; },
  },
  betabinomial: {
    name: "Beta-binomial", group: FINITE, params: ["n", "α", "β"], defaults: ["10", "2", "3"], values: "0, 1, ..., n", how: "exact",
    check: function (n, a, b) { return first(whole("n", n, 0, 1e6), positive("α", a), positive("β", b)); },
    build: function (n, a, b) { return lawFromMasses({ mass: function (k) { return LAW_CATALOG.betabinomial.mass(k, n, a, b); }, least: 0, most: n, mean: n * a / (a + b) }); },
    mass: function (k, n, a, b) { return k < 0 || k > n ? 0 : Math.exp(logChoose(n, k) + logBeta(k + a, n - k + b) - logBeta(a, b)); },
    mean: function (n, a, b) { return n * a / (a + b); },
    variance: function (n, a, b) { return n * a * b * (a + b + n) / ((a + b) * (a + b) * (a + b + 1)); },
  },
  poissonbinomial: {
    name: "Poisson binomial (a sum of Bernoullis)", group: FINITE, params: ["chances"], defaults: ["[0.1, 0.5, 0.9]"], lists: [0],
    values: "0, 1, ..., n", how: "exact",
    check: function (p) { return p.length > 0 && p.length <= 5000 && p.every(function (x) { return x >= 0 && x <= 1; }) ? "" : "Each chance must be from 0 to 1."; },
    build: function (p) {
      // The masses one Bernoulli at a time: P(sum = k) after each.
      let masses = [1];
      for (const c of p) {
        const next = new Array(masses.length + 1).fill(0);
        masses.forEach(function (m, k) { next[k] += m * (1 - c); next[k + 1] += m * c; });
        masses = next;
      }
      return lawFromMasses({ mass: function (k) { return masses[k] || 0; }, least: 0, most: p.length,
                             mean: p.reduce(function (a, b) { return a + b; }, 0) });
    },
    mean: function (p) { return p.reduce(function (a, b) { return a + b; }, 0); },
    variance: function (p) { return p.reduce(function (a, c) { return a + c * (1 - c); }, 0); },
  },
  zipf: {
    name: "Zipf on 1, ..., N", group: FINITE, params: ["N", "s"], defaults: ["10", "1"], values: "1, 2, ..., N", how: "exact",
    check: function (N, s) { return first(whole("N", N, 1, 1048576), isFinite(s) ? "" : "s must be a number."); },
    build: function (N, s) {
      const H = harmonic(N, s);
      return lawFromMasses({ mass: function (k) { return Math.pow(k, -s) / H; }, least: 1, most: N, mean: harmonic(N, s - 1) / H });
    },
    mass: function (k, N, s) { return k >= 1 && k <= N ? Math.pow(k, -s) / harmonic(N, s) : 0; },
    mean: function (N, s) { return harmonic(N, s - 1) / harmonic(N, s); },
    variance: function (N, s) { const H = harmonic(N, s), m = harmonic(N, s - 1) / H; return harmonic(N, s - 2) / H - m * m; },
  },
  benford: {
    name: "Benford's first digit", group: FINITE, params: [], defaults: [], values: "1, 2, ..., 9", how: "exact",
    source: "T. P. Hill, \"A statistical derivation of the significant-digit law\", Statist. Sci. 10 (1995) 354-363",
    check: function () { return ""; },
    build: function () { return lawFromMasses({ mass: function (d) { return Math.log10(1 + 1 / d); }, least: 1, most: 9 }); },
    mass: function (d) { return d >= 1 && d <= 9 ? Math.log10(1 + 1 / d) : 0; },
    mean: function () { let s = 0; for (let d = 1; d <= 9; d++) s += d * Math.log10(1 + 1 / d); return s; },
  },

  /* --- Discrete, infinitely many values ---------------------------- */
  poisson: {
    name: "Poisson", group: COUNTABLE, params: ["λ"], defaults: ["1"], values: "0, 1, 2, ...", how: "exact",
    check: function (l) { return l >= 0 && l <= 1e5 ? "" : "λ must be from 0 to 100,000."; },
    build: function (l) {
      if (l === 0) return pointMassLaw(0);
      return lawFromMasses({ mass: function (k) { return LAW_CATALOG.poisson.mass(k, l); }, least: 0, most: Infinity, mean: l,
                             cdf: function (k) { return k < 0 ? 0 : 1 - gammaP(Math.floor(k) + 1, l); } });
    },
    mass: function (k, l) { return k < 0 ? 0 : Math.exp(k * Math.log(l) - l - logGamma(k + 1)); },
    mean: function (l) { return l; }, variance: function (l) { return l; },
  },
  geometric: {
    name: "Geometric from 0: P(k) = (1 − q) q^k", group: COUNTABLE, params: ["q"], defaults: ["1/2"], values: "0, 1, 2, ...", how: "exact",
    check: function (q) { return q >= 0 && q < 1 ? "" : "q must be from 0 to just below 1."; },
    build: function (q) {
      if (q === 0) return pointMassLaw(0);
      return lawFromMasses({ mass: function (k) { return (1 - q) * Math.pow(q, k); }, least: 0, most: Infinity, mean: q / (1 - q),
                             cdf: function (k) { return k < 0 ? 0 : 1 - Math.pow(q, Math.floor(k) + 1); } });
    },
    mass: function (k, q) { return k < 0 ? 0 : (1 - q) * Math.pow(q, k); },
    mean: function (q) { return q / (1 - q); }, variance: function (q) { return q / ((1 - q) * (1 - q)); },
  },
  negbinomial: {
    name: "Negative binomial (failures before r successes)", group: COUNTABLE, params: ["r", "p"], defaults: ["3", "1/2"],
    values: "0, 1, 2, ...", how: "exact",
    check: function (r, p) { return first(positive("r", r), p > 0 && p <= 1 ? "" : "p must be more than 0 and at most 1."); },
    build: function (r, p) {
      if (p === 1) return pointMassLaw(0);
      return lawFromMasses({ mass: function (k) { return LAW_CATALOG.negbinomial.mass(k, r, p); }, least: 0, most: Infinity,
                             mean: r * (1 - p) / p, cdf: function (k) { return k < 0 ? 0 : betaI(p, r, Math.floor(k) + 1); } });
    },
    mass: function (k, r, p) { return k < 0 ? 0 : Math.exp(logGamma(k + r) - logGamma(k + 1) - logGamma(r) + r * Math.log(p) + k * Math.log(1 - p)); },
    mean: function (r, p) { return r * (1 - p) / p; }, variance: function (r, p) { return r * (1 - p) / (p * p); },
  },
  zeta: {
    name: "Zeta (Zipf on 1, 2, 3, ...)", group: COUNTABLE, params: ["s"], defaults: ["2"], values: "1, 2, 3, ...", how: "exact",
    check: function (s) { return s > 1 && s <= 100 ? "" : "s must be more than 1 (and at most 100)."; },
    build: function (s) {
      const Z = math.zeta(s);
      return lawFromMasses({ mass: function (k) { return Math.pow(k, -s) / Z; }, least: 1, most: Infinity, reach: 65536,
                             mean: s > 2 ? math.zeta(s - 1) / Z : Infinity,
                             cdf: function (k) { return k < 1 ? 0 : 1 - zetaTail(s, Math.floor(k) + 1) / Z; } });
    },
    mass: function (k, s) { return k >= 1 ? Math.pow(k, -s) / math.zeta(s) : 0; },
    mean: function (s) { return s > 2 ? math.zeta(s - 1) / math.zeta(s) : Infinity; },
    variance: function (s) { if (s <= 3) return Infinity; const m = math.zeta(s - 1) / math.zeta(s); return math.zeta(s - 2) / math.zeta(s) - m * m; },
  },
  logarithmic: {
    name: "Logarithmic series", group: COUNTABLE, params: ["p"], defaults: ["1/2"], values: "1, 2, 3, ...", how: "exact",
    check: function (p) { return p > 0 && p <= 0.9999 ? "" : "p must be more than 0 (and at most 0.9999)."; },
    build: function (p) {
      return lawFromMasses({ mass: function (k) { return LAW_CATALOG.logarithmic.mass(k, p); }, least: 1, most: Infinity,
                             mean: LAW_CATALOG.logarithmic.mean(p) });
    },
    mass: function (k, p) { return k >= 1 ? -Math.pow(p, k) / (k * Math.log(1 - p)) : 0; },
    mean: function (p) { return -p / ((1 - p) * Math.log(1 - p)); },
    variance: function (p) { const L = Math.log(1 - p); return -p * (p + L) / ((1 - p) * (1 - p) * L * L); },
  },
  yulesimon: {
    name: "Yule–Simon", group: COUNTABLE, params: ["ρ"], defaults: ["2"], values: "1, 2, 3, ...", how: "exact",
    source: "H. A. Simon, \"On a class of skew distribution functions\", Biometrika 42 (1955) 425-440",
    check: function (r) { return positive("ρ", r); },
    build: function (r) {
      return lawFromMasses({ mass: function (k) { return LAW_CATALOG.yulesimon.mass(k, r); }, least: 1, most: Infinity, reach: 65536,
                             mean: LAW_CATALOG.yulesimon.mean(r),
                             cdf: function (k) { k = Math.floor(k); return k < 1 ? 0 : 1 - k * Math.exp(logBeta(k, r + 1)); } });
    },
    mass: function (k, r) { return k >= 1 ? r * Math.exp(logBeta(k, r + 1)) : 0; },
    mean: function (r) { return r > 1 ? r / (r - 1) : Infinity; },
    variance: function (r) { return r > 2 ? r * r / ((r - 1) * (r - 1) * (r - 2)) : Infinity; },
  },
  borel: {
    name: "Borel (a Poisson(μ) tree's size)", group: COUNTABLE, params: ["μ"], defaults: ["1/2"], values: "1, 2, 3, ...", how: "exact",
    source: "É. Borel, \"Sur l'emploi du théorème de Bernoulli pour faciliter le calcul d'une infinité de coefficients\", C. R. Acad. Sci. Paris 214 (1942) 452-456",
    check: function (m) { return m >= 0 && m <= 0.99 ? "" : "μ must be from 0 to 0.99 (closer to 1, its tail is too long to list)."; },
    build: function (m) {
      if (m === 0) return pointMassLaw(1);
      return lawFromMasses({ mass: function (n) { return LAW_CATALOG.borel.mass(n, m); }, least: 1, most: Infinity, mean: 1 / (1 - m) });
    },
    mass: function (n, m) { return n >= 1 ? Math.exp(-m * n + (n - 1) * Math.log(m * n) - logGamma(n + 1)) : 0; },
    mean: function (m) { return 1 / (1 - m); }, variance: function (m) { return m / Math.pow(1 - m, 3); },
  },
  dlaplace: {
    name: "Two-sided geometric", group: COUNTABLE, params: ["q"], defaults: ["1/2"], values: "all whole numbers", how: "exact",
    check: function (q) { return q >= 0 && q < 1 ? "" : "q must be from 0 to just below 1."; },
    build: function (q) {
      if (q === 0) return pointMassLaw(0);
      return lawFromMasses({ mass: function (k) { return LAW_CATALOG.dlaplace.mass(k, q); }, least: -Infinity, most: Infinity, middle: 0, mean: 0,
                             cdf: function (k) { k = Math.floor(k); return k >= 0 ? 1 - Math.pow(q, k + 1) / (1 + q) : Math.pow(q, -k) / (1 + q); } });
    },
    mass: function (k, q) { return (1 - q) / (1 + q) * Math.pow(q, Math.abs(k)); },
    mean: function () { return 0; }, variance: function (q) { return 2 * q / ((1 - q) * (1 - q)); },
  },
  dnormal: {
    name: "Discrete Gaussian on the whole numbers", group: COUNTABLE, params: ["σ"], defaults: ["1"], values: "all whole numbers", how: "exact",
    check: function (s) { return s > 0 && s <= 1e5 ? "" : "σ must be more than 0 (and at most 100,000)."; },
    build: function (s) { return lawFromMasses({ mass: function (k) { return Math.exp(-k * k / (2 * s * s)); }, least: -Infinity, most: Infinity, middle: 0, mean: 0 }); },
    mean: function () { return 0; },
  },

  /* --- Continuous on a bounded interval ---------------------------- */
  unif: {
    name: "Uniform on [a, b] (or on a list: unif([2, 3]))", group: BOUNDED, params: ["a", "b"], defaults: ["0", "1"],
    values: "[a, b], or the values listed", how: "exact",
    check: function (a, b) {
      if (Array.isArray(a)) return b === undefined && a.length > 0 ? "" : "unif([2, 3]) takes one list.";
      return a <= b ? "" : "In unif(a, b), a must not be bigger than b.";
    },
    build: function (a, b) {
      if (Array.isArray(a)) return atomsLaw(a, a.map(function () { return 1; }));
      if (a === b) return pointMassLaw(a);
      return lawFromCDF({ cdf: function (x) { return Math.min(1, Math.max(0, (x - a) / (b - a))); },
                          quantile: function (u) { return a + (b - a) * u; }, least: a, most: b, mean: (a + b) / 2 });
    },
    density: function (x, a, b) { return x >= a && x <= b ? 1 / (b - a) : 0; },
    mean: function (a, b) { return Array.isArray(a) ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : (a + b) / 2; },
    variance: function (a, b) { return Array.isArray(a) ? undefined : (b - a) * (b - a) / 12; },
  },
  triangular: {
    name: "Triangular, peak at c", group: BOUNDED, params: ["a", "b", "c"], defaults: ["0", "1", "1/2"], values: "[a, b]", how: "exact",
    check: function (a, b, c) { return a < b && c >= a && c <= b ? "" : "It needs a < b and c from a to b."; },
    build: function (a, b, c) {
      return lawFromCDF({ least: a, most: b, mean: (a + b + c) / 3,
        cdf: function (x) {
          if (x <= a) return 0;
          if (x >= b) return 1;
          return x <= c ? (x - a) * (x - a) / ((b - a) * (c - a)) : 1 - (b - x) * (b - x) / ((b - a) * (b - c));
        },
        quantile: function (u) { return u < (c - a) / (b - a) ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); } });
    },
    density: function (x, a, b, c) {
      if (x < a || x > b) return 0;
      return x < c ? 2 * (x - a) / ((b - a) * (c - a)) : 2 * (b - x) / ((b - a) * (b - c));
    },
    mean: function (a, b, c) { return (a + b + c) / 3; },
    variance: function (a, b, c) { return (a * a + b * b + c * c - a * b - a * c - b * c) / 18; },
  },
  beta: {
    name: "Beta", group: BOUNDED, params: ["α", "β"], defaults: ["2", "3"], values: "[0, 1]", how: "exact",
    check: function (a, b) { return first(positive("α", a), positive("β", b)); },
    build: function (a, b) { return lawFromCDF({ cdf: function (x) { return betaI(x, a, b); }, least: 0, most: 1, mean: a / (a + b) }); },
    density: function (x, a, b) { return x <= 0 || x >= 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b)); },
    mean: function (a, b) { return a / (a + b); }, variance: function (a, b) { return a * b / ((a + b) * (a + b) * (a + b + 1)); },
  },
  kumaraswamy: {
    name: "Kumaraswamy", group: BOUNDED, params: ["a", "b"], defaults: ["2", "3"], values: "[0, 1]", how: "exact",
    check: function (a, b) { return first(positive("a", a), positive("b", b)); },
    build: function (a, b) {
      return lawFromCDF({ least: 0, most: 1, mean: b * Math.exp(logBeta(1 + 1 / a, b)),
        cdf: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - Math.pow(x, a), b); },
        quantile: function (u) { return Math.pow(1 - Math.pow(1 - u, 1 / b), 1 / a); } });
    },
    density: function (x, a, b) { return x <= 0 || x >= 1 ? 0 : a * b * Math.pow(x, a - 1) * Math.pow(1 - Math.pow(x, a), b - 1); },
    mean: function (a, b) { return b * Math.exp(logBeta(1 + 1 / a, b)); },
    variance: function (a, b) { const m = b * Math.exp(logBeta(1 + 1 / a, b)); return b * Math.exp(logBeta(1 + 2 / a, b)) - m * m; },
  },
  arcsine: {
    name: "Arcsine", group: BOUNDED, params: [], defaults: [], values: "[0, 1]", how: "exact",
    source: "P. Lévy, \"Sur certains processus stochastiques homogènes\", Compositio Math. 7 (1939) 283-339",
    check: function () { return ""; },
    build: function () {
      return lawFromCDF({ least: 0, most: 1, mean: 0.5,
        cdf: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : 2 / Math.PI * Math.asin(Math.sqrt(x)); },
        quantile: function (u) { const s = Math.sin(Math.PI * u / 2); return s * s; } });
    },
    density: function (x) { return x <= 0 || x >= 1 ? 0 : 1 / (Math.PI * Math.sqrt(x * (1 - x))); },
    mean: function () { return 0.5; }, variance: function () { return 0.125; },
  },
  irwinhall: {
    name: "Irwin–Hall (a sum of n uniforms)", group: BOUNDED, params: ["n"], defaults: ["3"], values: "[0, n]", how: "exact",
    check: function (n) { return whole("n", n, 1, 20); },
    build: function (n) { return lawFromCDF({ cdf: function (x) { return irwinHallCDF(x, n); }, least: 0, most: n, mean: n / 2 }); },
    density: function (x, n) {
      if (x < 0 || x > n) return 0;
      let s = 0;
      for (let k = 0; k <= Math.floor(x); k++) s += (k % 2 ? -1 : 1) * Math.exp(logChoose(n, k)) * Math.pow(x - k, n - 1);
      return s / Math.exp(logGamma(n));
    },
    mean: function (n) { return n / 2; }, variance: function (n) { return n / 12; },
  },
  semicircle: {
    name: "Wigner's semicircle", group: BOUNDED, params: ["R"], defaults: ["2"], values: "[−R, R]", how: "exact",
    source: "E. P. Wigner, \"On the distribution of the roots of certain symmetric matrices\", Ann. Math. 67 (1958) 325-327",
    check: function (R) { return positive("R", R); },
    build: function (R) {
      return lawFromCDF({ least: -R, most: R, mean: 0, cdf: function (x) {
        if (x <= -R) return 0;
        if (x >= R) return 1;
        return 0.5 + x * Math.sqrt(R * R - x * x) / (Math.PI * R * R) + Math.asin(x / R) / Math.PI;
      } });
    },
    density: function (x, R) { return Math.abs(x) >= R ? 0 : 2 * Math.sqrt(R * R - x * x) / (Math.PI * R * R); },
    mean: function () { return 0; }, variance: function (R) { return R * R / 4; },
  },
  marchenkopastur: {
    name: "Marchenko–Pastur", group: BOUNDED, params: ["λ", "σ"], defaults: ["1/2", "1"], values: "[σ²(1 − √λ)², σ²(1 + √λ)²], and 0 when λ > 1",
    how: "added up",
    source: "V. A. Marchenko and L. A. Pastur, \"Distribution of eigenvalues for some sets of random matrices\", Mat. Sb. 72 (1967) 507-536",
    check: function (l, s) { return first(positive("λ", l), positive("σ", s)); },
    build: function (l, s) {
      const a = s * s * (1 - Math.sqrt(l)) ** 2, b = s * s * (1 + Math.sqrt(l)) ** 2;
      const part = lawFromDensity({ least: a, most: b, density: function (x) { return LAW_CATALOG.marchenkopastur.density(x, l, s); } });
      if (l <= 1) { part.mean = s * s; return part; }
      // With lambda > 1, mass 1 - 1/lambda sits at 0, left of the rest.
      const w = 1 - 1 / l, xs = [0, 0], Fs = [0, w];
      for (let i = 0; i < part.xs.length; i++) { xs.push(part.xs[i]); Fs.push(w + (1 - w) * part.Fs[i]); }
      const law = finishTable(xs, Fs);
      law.masses = [[0, w]];
      law.mean = s * s;
      return law;
    },
    // The density of the part away from 0 (it adds up to min(1, 1/lambda)).
    density: function (x, l, s) {
      const a = s * s * (1 - Math.sqrt(l)) ** 2, b = s * s * (1 + Math.sqrt(l)) ** 2;
      return x <= a || x >= b ? 0 : Math.sqrt((b - x) * (x - a)) / (2 * Math.PI * s * s * l * x);
    },
    mean: function (l, s) { return s * s; }, variance: function (l, s) { return l * Math.pow(s, 4); },
  },
  kestenmckay: {
    name: "Kesten–McKay (random d-regular graphs)", group: BOUNDED, params: ["d"], defaults: ["3"], values: "[−2√(d − 1), 2√(d − 1)]",
    how: "added up",
    source: "H. Kesten, \"Symmetric random walks on groups\", Trans. AMS 92 (1959) 336-354; B. D. McKay, \"The expected eigenvalue distribution of a large regular graph\", Linear Algebra Appl. 40 (1981) 203-216",
    check: function (d) { return d >= 2 ? "" : "d must be at least 2."; },
    build: function (d) {
      const r = 2 * Math.sqrt(d - 1);
      return lawFromDensity({ least: -r, most: r, mean: 0, density: function (x) { return LAW_CATALOG.kestenmckay.density(x, d); } });
    },
    density: function (x, d) {
      const r2 = 4 * (d - 1);
      return x * x >= r2 ? 0 : d * Math.sqrt(r2 - x * x) / (2 * Math.PI * (d * d - x * x));
    },
    mean: function () { return 0; }, variance: function (d) { return d; },
  },
  vonmises: {
    name: "von Mises (on the circle)", group: BOUNDED, params: ["μ", "κ"], defaults: ["0", "1"], values: "[μ − π, μ + π]", how: "added up",
    check: function (m, k) { return k >= 0 && k <= 1e4 ? "" : "κ must be from 0 to 10,000."; },
    build: function (m, k) {
      return lawFromDensity({ least: m - Math.PI, most: m + Math.PI, mean: m, density: function (x) { return LAW_CATALOG.vonmises.density(x, m, k); } });
    },
    density: function (x, m, k) {
      return Math.abs(x - m) > Math.PI ? 0 : Math.exp(k * (Math.cos(x - m) - 1)) / (2 * Math.PI * besselI0Scaled(k));
    },
    mean: function (m) { return m; },
  },

  /* --- Continuous on (0, infinity) --------------------------------- */
  exp: {
    name: "Exponential (rate λ)", group: HALF_LINE, params: ["λ"], defaults: ["1"], values: "[0, ∞)", how: "exact",
    check: function (l) { return positive("λ", l); },
    build: function (l) {
      return lawFromCDF({ least: 0, most: Infinity, mean: 1 / l,
        cdf: function (x) { return x <= 0 ? 0 : -Math.expm1(-l * x); }, quantile: function (u) { return -Math.log1p(-u) / l; } });
    },
    density: function (x, l) { return x < 0 ? 0 : l * Math.exp(-l * x); },
    mean: function (l) { return 1 / l; }, variance: function (l) { return 1 / (l * l); },
  },
  gamma: {
    name: "Gamma (shape k, scale θ)", group: HALF_LINE, params: ["k", "θ"], defaults: ["2", "1"], values: "[0, ∞)", how: "exact",
    check: function (k, t) { return first(positive("k", k), positive("θ", t)); },
    build: function (k, t) { return lawFromCDF({ cdf: function (x) { return gammaP(k, x / t); }, least: 0, most: Infinity, mean: k * t }); },
    density: function (x, k, t) { return x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / t - logGamma(k) - k * Math.log(t)); },
    mean: function (k, t) { return k * t; }, variance: function (k, t) { return k * t * t; },
  },
  chisq: {
    name: "Chi-square", group: HALF_LINE, params: ["k"], defaults: ["3"], values: "[0, ∞)", how: "exact",
    check: function (k) { return positive("k", k); },
    build: function (k) { return LAW_CATALOG.gamma.build(k / 2, 2); },
    density: function (x, k) { return LAW_CATALOG.gamma.density(x, k / 2, 2); },
    mean: function (k) { return k; }, variance: function (k) { return 2 * k; },
  },
  chi: {
    name: "Chi (Maxwell at k = 3)", group: HALF_LINE, params: ["k"], defaults: ["3"], values: "[0, ∞)", how: "exact",
    check: function (k) { return positive("k", k); },
    build: function (k) { return lawFromCDF({ cdf: function (x) { return gammaP(k / 2, x * x / 2); }, least: 0, most: Infinity, mean: LAW_CATALOG.chi.mean(k) }); },
    density: function (x, k) { return x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x * x / 2 - (k / 2 - 1) * Math.LN2 - logGamma(k / 2)); },
    mean: function (k) { return Math.SQRT2 * Math.exp(logGamma((k + 1) / 2) - logGamma(k / 2)); },
    variance: function (k) { const m = LAW_CATALOG.chi.mean(k); return k - m * m; },
  },
  rayleigh: {
    name: "Rayleigh", group: HALF_LINE, params: ["σ"], defaults: ["1"], values: "[0, ∞)", how: "exact",
    check: function (s) { return positive("σ", s); },
    build: function (s) {
      return lawFromCDF({ least: 0, most: Infinity, mean: s * Math.sqrt(Math.PI / 2),
        cdf: function (x) { return x <= 0 ? 0 : -Math.expm1(-x * x / (2 * s * s)); },
        quantile: function (u) { return s * Math.sqrt(-2 * Math.log1p(-u)); } });
    },
    density: function (x, s) { return x < 0 ? 0 : x / (s * s) * Math.exp(-x * x / (2 * s * s)); },
    mean: function (s) { return s * Math.sqrt(Math.PI / 2); }, variance: function (s) { return (4 - Math.PI) / 2 * s * s; },
  },
  weibull: {
    name: "Weibull (shape k, scale λ)", group: HALF_LINE, params: ["k", "λ"], defaults: ["2", "1"], values: "[0, ∞)", how: "exact",
    check: function (k, l) { return first(positive("k", k), positive("λ", l)); },
    build: function (k, l) {
      return lawFromCDF({ least: 0, most: Infinity, mean: l * gammaFunction(1 + 1 / k),
        cdf: function (x) { return x <= 0 ? 0 : -Math.expm1(-Math.pow(x / l, k)); },
        quantile: function (u) { return l * Math.pow(-Math.log1p(-u), 1 / k); } });
    },
    density: function (x, k, l) { return x < 0 ? 0 : k / l * Math.pow(x / l, k - 1) * Math.exp(-Math.pow(x / l, k)); },
    mean: function (k, l) { return l * gammaFunction(1 + 1 / k); },
    variance: function (k, l) { return l * l * (gammaFunction(1 + 2 / k) - gammaFunction(1 + 1 / k) ** 2); },
  },
  lognormal: {
    name: "Log-normal", group: HALF_LINE, params: ["μ", "σ"], defaults: ["0", "1"], values: "(0, ∞)", how: "exact",
    check: function (m, s) { return positive("σ", s); },
    build: function (m, s) {
      return lawFromCDF({ least: 0, most: Infinity, mean: Math.exp(m + s * s / 2),
        cdf: function (x) { return x <= 0 ? 0 : normalCDF((Math.log(x) - m) / s); },
        quantile: function (u) { return Math.exp(m + s * normalQuantile(u)); } });
    },
    density: function (x, m, s) { return x <= 0 ? 0 : Math.exp(-((Math.log(x) - m) ** 2) / (2 * s * s)) / (x * s * SQRT_2PI); },
    mean: function (m, s) { return Math.exp(m + s * s / 2); },
    variance: function (m, s) { return Math.expm1(s * s) * Math.exp(2 * m + s * s); },
  },
  pareto: {
    name: "Pareto", group: HALF_LINE, params: ["x_m", "α"], defaults: ["1", "2"], values: "[x_m, ∞)", how: "exact",
    check: function (xm, a) { return first(positive("x_m", xm), positive("α", a)); },
    build: function (xm, a) {
      return lawFromCDF({ least: xm, most: Infinity, mean: LAW_CATALOG.pareto.mean(xm, a),
        cdf: function (x) { return x <= xm ? 0 : 1 - Math.pow(xm / x, a); },
        quantile: function (u) { return xm * Math.pow(1 - u, -1 / a); } });
    },
    density: function (x, xm, a) { return x < xm ? 0 : a * Math.pow(xm, a) / Math.pow(x, a + 1); },
    mean: function (xm, a) { return a > 1 ? a * xm / (a - 1) : Infinity; },
    variance: function (xm, a) { return a > 2 ? xm * xm * a / ((a - 1) * (a - 1) * (a - 2)) : Infinity; },
  },
  lomax: {
    name: "Lomax (Pareto II)", group: HALF_LINE, params: ["α", "λ"], defaults: ["3", "1"], values: "[0, ∞)", how: "exact",
    check: function (a, l) { return first(positive("α", a), positive("λ", l)); },
    build: function (a, l) {
      return lawFromCDF({ least: 0, most: Infinity, mean: LAW_CATALOG.lomax.mean(a, l),
        cdf: function (x) { return x <= 0 ? 0 : 1 - Math.pow(1 + x / l, -a); },
        quantile: function (u) { return l * (Math.pow(1 - u, -1 / a) - 1); } });
    },
    density: function (x, a, l) { return x < 0 ? 0 : a / l * Math.pow(1 + x / l, -a - 1); },
    mean: function (a, l) { return a > 1 ? l / (a - 1) : Infinity; },
    variance: function (a, l) { return a > 2 ? l * l * a / ((a - 1) * (a - 1) * (a - 2)) : Infinity; },
  },
  invgamma: {
    name: "Inverse gamma", group: HALF_LINE, params: ["α", "β"], defaults: ["3", "1"], values: "(0, ∞)", how: "exact",
    check: function (a, b) { return first(positive("α", a), positive("β", b)); },
    build: function (a, b) { return lawFromCDF({ cdf: function (x) { return x <= 0 ? 0 : 1 - gammaP(a, b / x); }, least: 0, most: Infinity, mean: LAW_CATALOG.invgamma.mean(a, b) }); },
    density: function (x, a, b) { return x <= 0 ? 0 : Math.exp(a * Math.log(b) - logGamma(a) - (a + 1) * Math.log(x) - b / x); },
    mean: function (a, b) { return a > 1 ? b / (a - 1) : Infinity; },
    variance: function (a, b) { return a > 2 ? b * b / ((a - 1) * (a - 1) * (a - 2)) : Infinity; },
  },
  invgauss: {
    name: "Inverse Gaussian (Wald)", group: HALF_LINE, params: ["μ", "λ"], defaults: ["1", "1"], values: "(0, ∞)", how: "exact",
    check: function (m, l) { return first(positive("μ", m), positive("λ", l)); },
    build: function (m, l) {
      // F(x) = Phi(sqrt(l/x)(x/m - 1)) + e^(2l/m) Phi(-sqrt(l/x)(x/m + 1)),
      // the second part as one exponential, so it never overflows.
      return lawFromCDF({ least: 0, most: Infinity, mean: m, cdf: function (x) {
        if (x <= 0) return 0;
        const r = Math.sqrt(l / x);
        return normalCDF(r * (x / m - 1)) + Math.exp(2 * l / m + logNormalCDF(-r * (x / m + 1)));
      } });
    },
    density: function (x, m, l) { return x <= 0 ? 0 : Math.sqrt(l / (2 * Math.PI * x * x * x)) * Math.exp(-l * (x - m) * (x - m) / (2 * m * m * x)); },
    mean: function (m) { return m; }, variance: function (m, l) { return m * m * m / l; },
  },
  levy: {
    name: "Lévy (when Brownian motion first hits a level)", group: HALF_LINE, params: ["c"], defaults: ["1"], values: "(0, ∞)", how: "exact",
    check: function (c) { return positive("c", c); },
    build: function (c) {
      return lawFromCDF({ least: 0, most: Infinity, mean: Infinity,
        cdf: function (x) { return x <= 0 ? 0 : 2 * normalCDF(-Math.sqrt(c / x)); },
        quantile: function (u) { const z = normalQuantile(u / 2); return c / (z * z); } });
    },
    density: function (x, c) { return x <= 0 ? 0 : Math.sqrt(c / (2 * Math.PI)) * Math.exp(-c / (2 * x)) / Math.pow(x, 1.5); },
    mean: function () { return Infinity; }, variance: function () { return Infinity; },
  },
  fdist: {
    name: "F (Fisher–Snedecor)", group: HALF_LINE, params: ["d_1", "d_2"], defaults: ["5", "10"], values: "[0, ∞)", how: "exact",
    check: function (d1, d2) { return first(positive("d_1", d1), positive("d_2", d2)); },
    build: function (d1, d2) {
      return lawFromCDF({ cdf: function (x) { return x <= 0 ? 0 : betaI(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2); }, least: 0, most: Infinity,
                          mean: LAW_CATALOG.fdist.mean(d1, d2) });
    },
    density: function (x, d1, d2) {
      return x <= 0 ? 0 : Math.exp((d1 / 2) * Math.log(d1 * x) + (d2 / 2) * Math.log(d2) - ((d1 + d2) / 2) * Math.log(d1 * x + d2) - Math.log(x) - logBeta(d1 / 2, d2 / 2));
    },
    mean: function (d1, d2) { return d2 > 2 ? d2 / (d2 - 2) : Infinity; },
    variance: function (d1, d2) { return d2 > 4 ? 2 * d2 * d2 * (d1 + d2 - 2) / (d1 * (d2 - 2) * (d2 - 2) * (d2 - 4)) : Infinity; },
  },
  betaprime: {
    name: "Beta prime", group: HALF_LINE, params: ["α", "β"], defaults: ["2", "3"], values: "[0, ∞)", how: "exact",
    check: function (a, b) { return first(positive("α", a), positive("β", b)); },
    build: function (a, b) { return lawFromCDF({ cdf: function (x) { return x <= 0 ? 0 : betaI(x / (1 + x), a, b); }, least: 0, most: Infinity, mean: LAW_CATALOG.betaprime.mean(a, b) }); },
    density: function (x, a, b) { return x <= 0 ? 0 : Math.exp((a - 1) * Math.log(x) - (a + b) * Math.log1p(x) - logBeta(a, b)); },
    mean: function (a, b) { return b > 1 ? a / (b - 1) : Infinity; },
    variance: function (a, b) { return b > 2 ? a * (a + b - 1) / ((b - 2) * (b - 1) * (b - 1)) : Infinity; },
  },
  loglogistic: {
    name: "Log-logistic (scale α, shape β)", group: HALF_LINE, params: ["α", "β"], defaults: ["1", "4"], values: "[0, ∞)", how: "exact",
    check: function (a, b) { return first(positive("α", a), positive("β", b)); },
    build: function (a, b) {
      return lawFromCDF({ least: 0, most: Infinity, mean: LAW_CATALOG.loglogistic.mean(a, b),
        cdf: function (x) { return x <= 0 ? 0 : 1 / (1 + Math.pow(x / a, -b)); },
        quantile: function (u) { return a * Math.pow(u / (1 - u), 1 / b); } });
    },
    density: function (x, a, b) { if (x <= 0) return 0; const r = Math.pow(x / a, b); return b / x * r / ((1 + r) * (1 + r)); },
    mean: function (a, b) { return b > 1 ? a * (Math.PI / b) / Math.sin(Math.PI / b) : Infinity; },
    variance: function (a, b) {
      if (b <= 2) return Infinity;
      const t = Math.PI / b;
      return a * a * (2 * t / Math.sin(2 * t) - t * t / (Math.sin(t) * Math.sin(t)));
    },
  },
  gompertz: {
    name: "Gompertz", group: HALF_LINE, params: ["η", "b"], defaults: ["1", "1"], values: "[0, ∞)", how: "exact",
    check: function (e, b) { return first(positive("η", e), positive("b", b)); },
    build: function (e, b) {
      return lawFromCDF({ least: 0, most: Infinity,
        cdf: function (x) { return x <= 0 ? 0 : -Math.expm1(-e * Math.expm1(b * x)); },
        quantile: function (u) { return Math.log1p(-Math.log1p(-u) / e) / b; } });
    },
    density: function (x, e, b) { return x < 0 ? 0 : b * e * Math.exp(e + b * x - e * Math.exp(b * x)); },
  },
  frechet: {
    name: "Fréchet", group: HALF_LINE, params: ["α", "s"], defaults: ["3", "1"], values: "(0, ∞)", how: "exact",
    check: function (a, s) { return first(positive("α", a), positive("s", s)); },
    build: function (a, s) {
      return lawFromCDF({ least: 0, most: Infinity, mean: LAW_CATALOG.frechet.mean(a, s),
        cdf: function (x) { return x <= 0 ? 0 : Math.exp(-Math.pow(x / s, -a)); },
        quantile: function (u) { return s * Math.pow(-Math.log(u), -1 / a); } });
    },
    density: function (x, a, s) { return x <= 0 ? 0 : a / s * Math.pow(x / s, -1 - a) * Math.exp(-Math.pow(x / s, -a)); },
    mean: function (a, s) { return a > 1 ? s * gammaFunction(1 - 1 / a) : Infinity; },
    variance: function (a, s) { return a > 2 ? s * s * (gammaFunction(1 - 2 / a) - gammaFunction(1 - 1 / a) ** 2) : Infinity; },
  },
  nakagami: {
    name: "Nakagami", group: HALF_LINE, params: ["m", "Ω"], defaults: ["1", "1"], values: "[0, ∞)", how: "exact",
    check: function (m, w) { return first(m >= 0.5 ? "" : "m must be at least 1/2.", positive("Ω", w)); },
    build: function (m, w) { return lawFromCDF({ cdf: function (x) { return gammaP(m, m * x * x / w); }, least: 0, most: Infinity, mean: LAW_CATALOG.nakagami.mean(m, w) }); },
    density: function (x, m, w) { return x <= 0 ? 0 : 2 * Math.exp(m * Math.log(m / w) + (2 * m - 1) * Math.log(x) - m * x * x / w - logGamma(m)); },
    mean: function (m, w) { return Math.exp(logGamma(m + 0.5) - logGamma(m)) * Math.sqrt(w / m); },
    variance: function (m, w) { const g = Math.exp(logGamma(m + 0.5) - logGamma(m)); return w * (1 - g * g / m); },
  },
  halfnormal: {
    name: "Half-normal", group: HALF_LINE, params: ["σ"], defaults: ["1"], values: "[0, ∞)", how: "exact",
    check: function (s) { return positive("σ", s); },
    build: function (s) {
      return lawFromCDF({ least: 0, most: Infinity, mean: s * Math.sqrt(2 / Math.PI),
        cdf: function (x) { return x <= 0 ? 0 : 1 - 2 * normalCDF(-x / s); },
        quantile: function (u) { return -s * normalQuantile((1 - u) / 2); } });
    },
    density: function (x, s) { return x < 0 ? 0 : 2 * Math.exp(-x * x / (2 * s * s)) / (s * SQRT_2PI); },
    mean: function (s) { return s * Math.sqrt(2 / Math.PI); }, variance: function (s) { return s * s * (1 - 2 / Math.PI); },
  },
  halfcauchy: {
    name: "Half-Cauchy", group: HALF_LINE, params: ["γ"], defaults: ["1"], values: "[0, ∞)", how: "exact",
    check: function (g) { return positive("γ", g); },
    build: function (g) {
      return lawFromCDF({ least: 0, most: Infinity, mean: Infinity,
        cdf: function (x) { return x <= 0 ? 0 : 2 / Math.PI * Math.atan(x / g); },
        quantile: function (u) { return g * Math.tan(Math.PI * u / 2); } });
    },
    density: function (x, g) { return x < 0 ? 0 : 2 / (Math.PI * g * (1 + (x / g) * (x / g))); },
    mean: function () { return Infinity; }, variance: function () { return Infinity; },
  },
  rice: {
    name: "Rice", group: HALF_LINE, params: ["ν", "σ"], defaults: ["1", "1"], values: "[0, ∞)", how: "added up",
    check: function (n, s) { return first(n >= 0 ? "" : "ν must be 0 or more.", positive("σ", s)); },
    build: function (n, s) {
      return lawFromDensity({ least: 0, most: Infinity, scale: n + s, density: function (x) { return LAW_CATALOG.rice.density(x, n, s); } });
    },
    // (x/s^2) e^(-(x^2 + n^2)/(2s^2)) I0(x n / s^2), with e^(-z) I0(z),
    // so nothing overflows.
    density: function (x, n, s) { return x <= 0 ? 0 : x / (s * s) * Math.exp(-(x - n) * (x - n) / (2 * s * s)) * besselI0Scaled(x * n / (s * s)); },
  },

  /* --- Continuous on the whole line -------------------------------- */
  normal: {
    name: "Normal (Gaussian)", group: LINE, params: ["μ", "σ"], defaults: ["0", "1"], values: "all real numbers", how: "exact",
    check: function (m, s) { return positive("σ", s); },
    build: function (m, s) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: m,
        cdf: function (x) { return normalCDF((x - m) / s); }, quantile: function (u) { return m + s * normalQuantile(u); } });
    },
    density: function (x, m, s) { return Math.exp(-(x - m) * (x - m) / (2 * s * s)) / (s * SQRT_2PI); },
    mean: function (m) { return m; }, variance: function (m, s) { return s * s; },
  },
  cauchy: {
    name: "Cauchy", group: LINE, params: ["x_0", "γ"], defaults: ["0", "1"], values: "all real numbers", how: "exact",
    check: function (x0, g) { return positive("γ", g); },
    build: function (x0, g) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: NaN,
        cdf: function (x) { return 0.5 + Math.atan((x - x0) / g) / Math.PI; },
        quantile: function (u) { return x0 + g * Math.tan(Math.PI * (u - 0.5)); } });
    },
    density: function (x, x0, g) { return 1 / (Math.PI * g * (1 + ((x - x0) / g) ** 2)); },
    mean: function () { return NaN; }, variance: function () { return NaN; },
  },
  t: {
    name: "Student's t", group: LINE, params: ["ν"], defaults: ["3"], values: "all real numbers", how: "exact",
    check: function (n) { return positive("ν", n); },
    build: function (n) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: n > 1 ? 0 : NaN, cdf: function (x) {
        const tail = betaI(n / (n + x * x), n / 2, 0.5) / 2;
        return x < 0 ? tail : 1 - tail;
      } });
    },
    density: function (x, n) { return Math.exp(logGamma((n + 1) / 2) - logGamma(n / 2) - 0.5 * Math.log(n * Math.PI) - (n + 1) / 2 * Math.log1p(x * x / n)); },
    mean: function (n) { return n > 1 ? 0 : NaN; },
    variance: function (n) { return n > 2 ? n / (n - 2) : n > 1 ? Infinity : NaN; },
  },
  laplace: {
    name: "Laplace", group: LINE, params: ["μ", "b"], defaults: ["0", "1"], values: "all real numbers", how: "exact",
    check: function (m, b) { return positive("b", b); },
    build: function (m, b) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: m,
        cdf: function (x) { return x < m ? Math.exp((x - m) / b) / 2 : 1 - Math.exp(-(x - m) / b) / 2; },
        quantile: function (u) { return u < 0.5 ? m + b * Math.log(2 * u) : m - b * Math.log(2 * (1 - u)); } });
    },
    density: function (x, m, b) { return Math.exp(-Math.abs(x - m) / b) / (2 * b); },
    mean: function (m) { return m; }, variance: function (m, b) { return 2 * b * b; },
  },
  logistic: {
    name: "Logistic", group: LINE, params: ["μ", "s"], defaults: ["0", "1"], values: "all real numbers", how: "exact",
    check: function (m, s) { return positive("s", s); },
    build: function (m, s) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: m,
        cdf: function (x) { return 1 / (1 + Math.exp(-(x - m) / s)); },
        quantile: function (u) { return m + s * Math.log(u / (1 - u)); } });
    },
    density: function (x, m, s) { const e = Math.exp(-Math.abs(x - m) / s); return e / (s * (1 + e) * (1 + e)); },
    mean: function (m) { return m; }, variance: function (m, s) { return s * s * Math.PI * Math.PI / 3; },
  },
  gumbel: {
    name: "Gumbel", group: LINE, params: ["μ", "β"], defaults: ["0", "1"], values: "all real numbers", how: "exact",
    check: function (m, b) { return positive("β", b); },
    build: function (m, b) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: m + b * EULER_GAMMA,
        cdf: function (x) { return Math.exp(-Math.exp(-(x - m) / b)); },
        quantile: function (u) { return m - b * Math.log(-Math.log(u)); } });
    },
    density: function (x, m, b) { const z = (x - m) / b; return Math.exp(-z - Math.exp(-z)) / b; },
    mean: function (m, b) { return m + b * EULER_GAMMA; }, variance: function (m, b) { return Math.PI * Math.PI * b * b / 6; },
  },
  gev: {
    name: "Generalized extreme value", group: LINE, params: ["μ", "σ", "ξ"], defaults: ["0", "1", "0"], values: "a half line (ξ ≠ 0), or all real numbers (ξ = 0)",
    how: "exact",
    source: "R. A. Fisher and L. H. C. Tippett, \"Limiting forms of the frequency distribution of the largest or smallest member of a sample\", Proc. Camb. Phil. Soc. 24 (1928) 180-190",
    check: function (m, s) { return positive("σ", s); },
    build: function (m, s, xi) {
      if (xi === 0) return LAW_CATALOG.gumbel.build(m, s);
      const end = m - s / xi;
      return lawFromCDF({ least: xi > 0 ? end : -Infinity, most: xi > 0 ? Infinity : end, mean: LAW_CATALOG.gev.mean(m, s, xi),
        cdf: function (x) {
          const t = 1 + xi * (x - m) / s;
          if (t <= 0) return xi > 0 ? 0 : 1;
          return Math.exp(-Math.pow(t, -1 / xi));
        },
        quantile: function (u) { return m + s * (Math.pow(-Math.log(u), -xi) - 1) / xi; } });
    },
    density: function (x, m, s, xi) {
      if (xi === 0) return LAW_CATALOG.gumbel.density(x, m, s);
      const t = 1 + xi * (x - m) / s;
      return t <= 0 ? 0 : Math.pow(t, -1 / xi - 1) * Math.exp(-Math.pow(t, -1 / xi)) / s;
    },
    mean: function (m, s, xi) { return xi === 0 ? m + s * EULER_GAMMA : xi < 1 ? m + s * (gammaFunction(1 - xi) - 1) / xi : Infinity; },
    variance: function (m, s, xi) {
      if (xi === 0) return Math.PI * Math.PI * s * s / 6;
      return xi < 0.5 ? s * s * (gammaFunction(1 - 2 * xi) - gammaFunction(1 - xi) ** 2) / (xi * xi) : Infinity;
    },
  },
  skewnormal: {
    name: "Skew-normal", group: LINE, params: ["α"], defaults: ["4"], values: "all real numbers", how: "added up",
    source: "A. Azzalini, \"A class of distributions which includes the normal ones\", Scand. J. Statist. 12 (1985) 171-178",
    check: function (a) { return isFinite(a) ? "" : "α must be a number."; },
    build: function (a) {
      const d = a / Math.sqrt(1 + a * a);
      return lawFromDensity({ least: -Infinity, most: Infinity, middle: d * Math.sqrt(2 / Math.PI), scale: 1,
                              mean: d * Math.sqrt(2 / Math.PI), density: function (x) { return LAW_CATALOG.skewnormal.density(x, a); } });
    },
    density: function (x, a) { return 2 * Math.exp(-x * x / 2) / SQRT_2PI * normalCDF(a * x); },
    mean: function (a) { return a / Math.sqrt(1 + a * a) * Math.sqrt(2 / Math.PI); },
    variance: function (a) { const d = a / Math.sqrt(1 + a * a); return 1 - 2 * d * d / Math.PI; },
  },
  sech: {
    name: "Hyperbolic secant", group: LINE, params: [], defaults: [], values: "all real numbers", how: "exact",
    check: function () { return ""; },
    build: function () {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: 0,
        cdf: function (x) { return 2 / Math.PI * Math.atan(Math.exp(Math.PI * x / 2)); },
        quantile: function (u) { return 2 / Math.PI * Math.log(Math.tan(Math.PI * u / 2)); } });
    },
    density: function (x) { return 1 / (2 * Math.cosh(Math.PI * x / 2)); },
    mean: function () { return 0; }, variance: function () { return 1; },
  },
  gennormal: {
    name: "Generalized normal: density ∝ e^(−|x|^β)", group: LINE, params: ["β"], defaults: ["4"], values: "all real numbers", how: "exact",
    check: function (b) { return positive("β", b); },
    build: function (b) {
      return lawFromCDF({ least: -Infinity, most: Infinity, mean: 0, cdf: function (x) {
        const half = gammaP(1 / b, Math.pow(Math.abs(x), b)) / 2;
        return x < 0 ? 0.5 - half : 0.5 + half;
      } });
    },
    density: function (x, b) { return b / (2 * gammaFunction(1 / b)) * Math.exp(-Math.pow(Math.abs(x), b)); },
    mean: function () { return 0; }, variance: function (b) { return gammaFunction(3 / b) / gammaFunction(1 / b); },
  },
  stable: {
    name: "Stable", group: LINE, params: ["α", "β"], defaults: ["3/2", "0"], values: "all real numbers (a half line for α < 1, β = ±1)",
    how: "estimated",
    source: "J. M. Chambers, C. L. Mallows and B. W. Stuck, \"A method for simulating stable random variables\", JASA 71 (1976) 340-344",
    check: function (a, b) { return first(a > 0 && a <= 2 ? "" : "α must be more than 0 and at most 2.", between("β", b, -1, 1)); },
    build: function (a, b) {
      const draw = stableDraw(a, b), law = lawFromDraws(chartDraws(draw, CHART_DRAWS));
      law.draw = draw;
      law.mean = a > 1 ? 0 : NaN;
      return law;
    },
    mean: function (a) { return a > 1 ? 0 : NaN; }, variance: function (a) { return a === 2 ? 2 : Infinity; },
  },
  tracywidom: {
    name: "Tracy–Widom (β = 1, 2 or 4)", group: LINE, params: ["β"], defaults: ["2"], values: "all real numbers", how: "exact",
    source: "C. A. Tracy and H. Widom, \"Level-spacing distributions and the Airy kernel\", Comm. Math. Phys. 159 (1994) 151-174; K. Johansson, \"Shape fluctuations and random matrices\", Comm. Math. Phys. 209 (2000) 437-476",
    check: function (b) { return b === 1 || b === 2 || b === 4 ? "" : "β must be 1, 2 or 4."; },
    build: function (b) { return tracyWidomLaw(b); },
    mean: function (b) { return { 1: -1.2065335745820, 2: -1.7710868074116, 4: -2.3068848932410 }[b]; },
    variance: function (b) { return { 1: 1.6077810345810, 2: 0.8131947928329, 4: 0.5177237207726 }[b]; },
  },

  /* --- Singular and fractal ---------------------------------------- */
  digits: {
    name: "Random digits: X = Σ D_k / b^k", group: FRACTAL, params: ["b", "weights"], defaults: ["3", "[1, 0, 1]"], lists: [1],
    values: "[0, 1]", how: "exact",
    source: "P. Billingsley, \"Probability and Measure\", 3rd ed., Wiley, 1995, Example 31.1; H. G. Eggleston, \"The fractional dimension of a set defined by decimal properties\", Quart. J. Math. 20 (1949) 31-36",
    check: function (b, p) { return first(whole("b", b, 2, 36), p.length === b ? weightsCheck("weights", p) : "There must be b weights, one for each digit 0, ..., b − 1."); },
    build: function (b, p) { return digitsLaw(b, p); },
    mean: function (b, p) { const t = p.reduce(function (a, c) { return a + c; }, 0); return p.reduce(function (s, c, j) { return s + c * j; }, 0) / t / (b - 1); },
    variance: function (b, p) { return digitsVariance(b, p); },
  },
  cantor: {
    name: "Cantor", group: FRACTAL, params: [], defaults: [], values: "the Cantor set in [0, 1]", how: "exact",
    source: "O. Dovgoshey, O. Martio, V. Ryazanov, M. Vuorinen, \"The Cantor function\", Expo. Math. 24 (2006) 1-37",
    check: function () { return ""; },
    build: function () { return digitsLaw(3, [1, 0, 1]); },
    mean: function () { return 0.5; }, variance: function () { return 0.125; },
  },
  salem: {
    name: "Salem's singular law (binary digits, P(1) = p)", group: FRACTAL, params: ["p"], defaults: ["1/3"], values: "[0, 1]", how: "exact",
    source: "R. Salem, \"On some singular monotonic functions which are strictly increasing\", Trans. AMS 53 (1943) 427-439",
    check: function (p) { return p > 0 && p < 1 ? "" : "p must be strictly between 0 and 1."; },
    build: function (p) { return digitsLaw(2, [1 - p, p]); },
    mean: function (p) { return p; }, variance: function (p) { return p * (1 - p) / 3; },
  },
  minkowski: {
    name: "Minkowski's question mark ?", group: FRACTAL, params: [], defaults: [], values: "[0, 1]", how: "exact",
    source: "R. Salem, \"On some singular monotonic functions which are strictly increasing\", Trans. AMS 53 (1943) 427-439; A. Denjoy, \"Sur une fonction réelle de Minkowski\", J. Math. Pures Appl. 17 (1938) 105-151",
    check: function () { return ""; },
    build: function () { return lawFromCDF({ cdf: minkowskiQuestionMark, quantile: minkowskiInverse, least: 0, most: 1, mean: 0.5 }); },
    mean: function () { return 0.5; },
  },
  bernoulliconv: {
    name: "Bernoulli convolution: Σ ±λ^k", group: FRACTAL, params: ["λ"], defaults: ["0.6"], values: "[−1/(1 − λ), 1/(1 − λ)]", how: "estimated",
    source: "P. Erdős, \"On a family of symmetric Bernoulli convolutions\", Amer. J. Math. 61 (1939) 974-976; B. Solomyak, \"On the random series Σ ±λ^n (an Erdős problem)\", Ann. Math. 142 (1995) 611-625",
    check: function (l) { return l > 0 && l <= 0.996 ? "" : "λ must be more than 0 and at most 0.996."; },
    build: function (l) {
      const draw = bernoulliConvolutionDraw(l), law = lawFromDraws(chartDraws(draw, CHART_DRAWS));
      law.draw = draw;
      law.mean = 0;
      return law;
    },
    mean: function () { return 0; }, variance: function (l) { return 1 / (1 - l * l); },
  },
  riesz: {
    name: "Riesz product, N factors", group: FRACTAL, params: ["a", "N"], defaults: ["1", "4"], values: "[0, 1]", how: "added up",
    source: "F. Riesz, \"Über die Fourierkoeffizienten einer stetigen Funktion von beschränkter Schwankung\", Math. Z. 2 (1918) 312-315; A. Zygmund, \"Trigonometric Series\", Cambridge University Press, 1959, Chapter V.7",
    check: function (a, N) { return first(between("a", a, -1, 1), whole("N", N, 0, 9)); },
    build: function (a, N) {
      return lawFromDensity({ least: 0, most: 1, mean: 0.5, cells: Math.max(DENSITY_CELLS, 32 * Math.pow(3, N)),
                              density: function (x) { return rieszDensity(x, a, N); } });
    },
    density: function (x, a, N) { return x < 0 || x > 1 ? 0 : rieszDensity(x, a, N); },
    mean: function () { return 0.5; },
  },
  orbit: {
    name: "Where a map's orbit spends its time (Feigenbaum's attractor)", group: FRACTAL, params: ["T(x)", "x_0"],
    defaults: ["3.5699456718 x (1 - x)", "0.2"], formulas: [0], values: "where the orbit goes", how: "estimated",
    source: "P. Grassberger, \"On the Hausdorff dimension of fractal attractors\", J. Stat. Phys. 26 (1981) 173-179; M. J. Feigenbaum, \"Quantitative universality for a class of nonlinear transformations\", J. Stat. Phys. 19 (1978) 25-52",
    check: function (T, x0) { return isFinite(x0) ? "" : "x_0 must be a number."; },
    build: function (T, x0) { return orbitLaw(T, x0); },
  },
};

// F of the Irwin-Hall law: (1/n!) sum over k <= x of (-1)^k C(n, k) (x - k)^n.
// The sum's terms are big and cancel, more so the bigger x is, so above
// n/2 it is worked out as 1 - F(n - x) (the law is symmetric about n/2).
function irwinHallCDF(x, n) {
  if (x <= 0) return 0;
  if (x >= n) return 1;
  if (x > n / 2) return 1 - irwinHallCDF(n - x, n);
  let s = 0;
  for (let k = 0; k <= Math.floor(x); k++) s += (k % 2 ? -1 : 1) * Math.exp(logChoose(n, k)) * Math.pow(x - k, n);
  return Math.min(1, Math.max(0, s / Math.exp(logGamma(n + 1))));
}


/* =====================================================================
   3. A LAW FROM THE CATALOG
   ---------------------------------------------------------------------
   catalogLaw(key, args) is the law LAW_CATALOG[key] with parameters
   "args" (numbers, or lists of numbers for the parameters in "lists").
   It throws an Error with a plain message if the parameters can't be
   used. The last 50 laws built are kept, since a law can take a moment
   (a table of thousands of values of F) and moving one slider rebuilds
   every law on the page.
   ===================================================================== */
const CATALOG_KEPT = new Map();
function catalogLaw(key, args) {
  const entry = LAW_CATALOG[key];
  const want = entry.params.length;
  const listAt = function (i) { return (entry.lists || []).includes(i); };
  const formulaAt = function (i) { return (entry.formulas || []).includes(i); };
  const flexible = key === "unif" && args.length === 1 && Array.isArray(args[0]);     // unif([2, 3])
  if (!flexible && args.length !== want) {
    throw new Error(key + " takes " + (want === 0 ? "no numbers" : want === 1 ? "one number" : want + " numbers") +
                    (want ? ": " + key + "(" + entry.params.join(", ") + ")" : ": " + key + "()") + ".");
  }
  args.forEach(function (a, i) {
    if (formulaAt(i)) {
      if (typeof a !== "function") throw new Error("In " + key + "(...), " + entry.params[i] + " is a formula in x.");
      return;
    }
    const list = Array.isArray(a);
    if (list && !(listAt(i) || flexible)) throw new Error("In " + key + "(...), " + entry.params[i] + " is one number, not a list.");
    if (!list && listAt(i)) throw new Error("In " + key + "(...), " + entry.params[i] + " is a list, like [1, 2, 3].");
    if ((list ? a : [a]).some(function (v) { return typeof v !== "number" || Number.isNaN(v); })) {
      throw new Error("Every number in " + key + "(...) must be a number.");
    }
  });
  const problem = entry.check.apply(null, args);
  if (problem) throw new Error(key + ": " + problem);
  // (A formula in x is kept by its "key": its text and the sliders' values.)
  const name = key + JSON.stringify(args, function (k, v) { return typeof v === "function" ? v.key : v; });
  if (!CATALOG_KEPT.has(name)) {
    if (CATALOG_KEPT.size >= 50) CATALOG_KEPT.delete(CATALOG_KEPT.keys().next().value);
    CATALOG_KEPT.set(name, entry.build.apply(null, args));
  }
  return CATALOG_KEPT.get(name);
}
