/* =====================================================================
   sinusoid-ish-roots.js  —  the math behind the "Sinusoid-ish" sim
   (nadya's Desmos idea D1, "random roots")
   ---------------------------------------------------------------------
   What it does, in plain words:
     Put roots at random points ... < R(-2) < R(-1) < 0 < R(0) < R(1) < ...
     and multiply:

         f(x) = product over n = -N .. N-1 of (1 - x / R(n))

     So f is 0 at every root, and f(0) = 1. When every gap between
     roots is 1, f is a sine wave: the roots are n + a for some a in
     (0, 1), and Euler's sine product
         sin(pi z) = pi z * product over n >= 1 of (1 - z^2 / n^2)
     (E. M. Stein and R. Shakarchi, "Complex Analysis", Princeton
     University Press, 2003, Chapter 5, Section 3) gives
         f(x) = sin(pi (a - x)) / sin(pi a).
     Random gaps bend that sine wave.

   The three ways to place the roots ("root models"):

   1. WALK (nadya's D1 and randfuncsagain.py). The gaps between
      neighboring roots are independent copies of the random variable g
      typed in the Random variables box (js/sim-random.js), like
      g ~ unif([2, 3]) or g ~ unif(1, 1 + δ). The roots are STATIONARY:
      the picture looks the same, in distribution, wherever you stand.
      For that, the gap that covers 0 must be "size-biased": a gap of
      length g is picked with probability proportional to g (a long
      gap is more likely to cover a given point), and 0 sits at a
      uniform place inside it. All other gaps are ordinary draws. This
      is the stationary renewal process; the size-biasing is the
      "inspection paradox" (W. Feller, "An Introduction to Probability
      Theory and Its Applications", Vol. II, 2nd ed., Wiley, 1971,
      Chapter XI; R. Durrett, "Probability: Theory and Examples", 5th
      ed., Cambridge University Press, 2019, the renewal theory
      section). For g ~ unif(1 - d, 1 + d) this gives exactly nadya's
      L = sqrt(4 d u + (1 - d)^2), with u uniform on [0, 1].

   2. JITTERED LATTICE (matrixcalculations.py, randomsinwave).
      R(n) = n + s + U(n), with U(n) a copy of g (like
      g ~ unif(-1/2, 1/2)) and one shift s uniform on [0, 1), which is
      what makes it stationary.

   3. MIRROR (randomsinfuncs.py). A walk r(1) < r(2) < ... to the right
      of 0, and roots at 0 and at every +r(k) and -r(k), so
          f(x) = x * product over k of (1 - x^2 / r(k)^2)
      is odd. It can't be stationary (0 is always a root), so it keeps
      nadya's x factor and f'(0) = 1 instead of f(0) = 1.

   Random numbers. Each gap is a place of its own for the random
   variables (js/sim-random.js), so gap n always gets the same copy of
   g, from its own fixed uniform number U(n) and the seed: g there is
   F^-1(U(n)), F being g's law. So when a slider changes g's law, the
   same U(n) are just read through the new law, and the curve bends
   smoothly instead of jumping (the Desmos feel).

   The file is split into numbered sections:
     1. The random gaps
     2. Placing the roots
     3. Evaluating f
     4. Peaks and lobes (the statistics)
   Nothing here draws or touches the page, so the check page
   (sinusoid-ish-check.html) can test it on its own. Both pages load
   js/sim-worker.js, js/sim-laws.js and js/sim-random.js (and what
   those need) before this file.
   ===================================================================== */


/* =====================================================================
   1. THE RANDOM GAPS
   ---------------------------------------------------------------------
   The n-th gap (or jitter) to the right of 0 is the place (RIGHT, n),
   and the n-th to the left (LEFT, n), so each is its own copy of g, the
   same one whatever N is. Two more uniform numbers come from the seed
   alone (seededUniform, js/sim-worker.js):
     COVER   picks the length of the gap that covers 0 (walk)
     PLACE   where 0 sits inside that gap (walk), or the shift s
             (jittered lattice)
   ===================================================================== */
const RIGHT = 1, LEFT = 2, COVER = 3, PLACE = 4;

// The random gaps of one sample, for the random variables "variables"
// of the box (g among them) and the seed:
//   gaps.right(n), gaps.left(n)   g at the n-th gap to the right and
//                                 to the left of 0, n = 1, 2, ...
//   gaps.cover    the gap that covers 0, from "coverLaw" (coverLawOf;
//                 null, and no gap, for the other models)
//   gaps.place    a uniform number in (0, 1)
function newGaps(variables, coverLaw, seed) {
  const drawer = newDrawer(variables, seed), random = seededUniform(seed);
  const gapAt = function (side, n) { drawer.at(side, n); return drawer.value("g", 0); };
  return {
    right: function (n) { return gapAt(RIGHT, n); },
    left: function (n) { return gapAt(LEFT, n); },
    cover: coverLaw ? drawFromLaw(coverLaw, random.uniform(COVER)) : NaN,
    place: random.uniform(PLACE),
  };
}

// The law of the gap that covers 0, for the walk: g's law, size-biased
// (a gap of length g is picked in proportion to g; sizeBiasedLaw,
// js/sim-laws.js). For g a formula of other random variables, g's law
// is the one worked out from many draws (js/sim-random.js).
function coverLawOf(variables) {
  return sizeBiasedLaw(variables.lawOf("g"));
}

// What is wrong with the random variables for the model ("" if
// nothing): g must be one number per gap (not a family), the gaps of
// the walk and the mirror must be more than 0 (F(0) = 0), and the
// walk's mean gap must be finite (the gap covering 0 needs it).
function gapProblem(model, variables) {
  const line = variables.declared.byName.get("g");
  if (line.family) return "g is one number for each gap: type it without a subscript, like  g ~ unif(1, 2).";
  if (model === "lattice") return "";
  const law = variables.lawOf("g");
  if (lawCDF(law, 0) > 0) return "Every gap must be bigger than 0, but g can be 0 or less.";
  if (model === "walk" && !isFinite(law.mean)) return "The walk needs g's mean to be finite: the gap covering 0 is picked in proportion to its length.";
  return "";
}


/* =====================================================================
   2. PLACING THE ROOTS
   ---------------------------------------------------------------------
   makeRoots(model, gaps, N) returns the roots as a sorted list (a
   Float64Array, smallest first). "model" is "walk", "lattice" or
   "mirror" (see the top of the file); "gaps" comes from newGaps
   (section 1; for the lattice, its gaps are the jitters).
   ===================================================================== */

function makeRoots(model, gaps, N) {
  const roots = new Float64Array(2 * N + (model === "mirror" ? 1 : 0));

  if (model === "walk") {
    // The gap covering 0 is size-biased, and 0 is uniform inside it:
    // R(-1) < 0 < R(0), with R(0) - R(-1) = L.
    const L = positiveGap(gaps.cover);
    let right = gaps.place * L;           // R(0)
    let left = right - L;                 // R(-1)
    roots[N] = right;
    roots[N - 1] = left;
    for (let n = 1; n < N; n++) {
      right += positiveGap(gaps.right(n));   // R(n)   = R(n-1) + gap
      left -= positiveGap(gaps.left(n));     // R(-n-1) = R(-n) - gap
      roots[N + n] = right;
      roots[N - 1 - n] = left;
    }
  } else if (model === "lattice") {
    // R(n) = n + s + U(n), for n = -N .. N-1.
    const s = gaps.place;
    for (let n = 0; n < N; n++) {
      roots[N + n] = n + s + gaps.right(n + 1);
      roots[N - 1 - n] = -(n + 1) + s + gaps.left(n + 1);
    }
    roots.sort();                         // big jitters can swap neighbors
  } else if (model === "mirror") {
    // 0, and +-r(k) for a walk r(1) < r(2) < ... < r(N).
    let r = 0;
    roots[N] = 0;
    for (let k = 1; k <= N; k++) {
      r += positiveGap(gaps.right(k));
      roots[N + k] = r;
      roots[N - k] = -r;
    }
  } else {
    throw new Error("Unknown root model: " + model);
  }
  return roots;
}

// A gap of the walk or the mirror, which must be more than 0 (a formula
// for g can come out 0 or less somewhere, which the box can't check).
function positiveGap(g) {
  if (!(g > 0)) throw new Error("Every gap must be bigger than 0, but one came out " + Number(g).toPrecision(3) + ".");
  return g;
}


/* =====================================================================
   3. EVALUATING f
   ---------------------------------------------------------------------
   f is a product of hundreds of factors, which can be huge or tiny, so
   it is computed as a sum of logarithms:
       log |f(x)| = sum of log |1 - x / R|
   and the sign is kept separately (each negative factor flips it).
   A root at 0 (mirror model) contributes the factor x instead.
   ===================================================================== */

// f(x).
function fValue(x, roots) {
  let logAbs = 0, sign = 1;
  for (let i = 0; i < roots.length; i++) {
    const factor = roots[i] === 0 ? x : 1 - x / roots[i];
    if (factor < 0) sign = -sign;
    logAbs += Math.log(Math.abs(factor));     // log(0) = -Infinity, so f = 0 at a root
  }
  return sign * Math.exp(logAbs);
}

// f'(x) / f(x) = sum over the roots of 1 / (x - R). (The derivative of
// log |f| is the sum of the derivatives of log |x - R|.)
function logDerivative(x, roots) {
  let sum = 0;
  for (let i = 0; i < roots.length; i++) sum += 1 / (x - roots[i]);
  return sum;
}

// f'(x).
function fDerivative(x, roots) {
  return fValue(x, roots) * logDerivative(x, roots);
}


/* =====================================================================
   4. PEAKS AND LOBES
   ---------------------------------------------------------------------
   A "lobe" is the piece of f between two neighboring roots. For each
   lobe this finds (as in nadya's randfuncsagain.py):
     area    the integral of f over the lobe
     peakX   where |f| is biggest (f' = 0)
     peak    f at that point (a "critical value")
     offset  peakX minus the lobe's left root

   There is exactly one peak per lobe. Between two neighboring roots,
   f'/f = sum of 1/(x - R) goes from +infinity (just right of the left
   root) to -infinity (just left of the right root), and it only goes
   down, since its derivative is minus a sum of squares,
   -sum of 1/(x - R)^2 < 0. So it is 0 at exactly one point, and
   halving the interval ("bisection") always finds it.

   The area uses Gauss-Legendre quadrature with 20 points: a weighted
   sum of f at 20 well-chosen points, exact for polynomials up to
   degree 39 (W. H. Press et al., "Numerical Recipes", 3rd ed.,
   Cambridge University Press, 2007, Section 4.6).
   ===================================================================== */

// The peak between two neighboring roots "left" < "right".
function peakBetween(left, right, roots) {
  let lo = left, hi = right;
  for (let step = 0; step < 200 && hi - lo > 1e-13 * (1 + Math.abs(lo)); step++) {
    const mid = (lo + hi) / 2;
    if (logDerivative(mid, roots) > 0) lo = mid;   // f'/f still positive: peak is further right
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The 20 Gauss-Legendre points and weights on [-1, 1], found once
// (gaussLegendre, js/sim-laws.js).
const GAUSS = gaussLegendre(20);

// The integral of f from "left" to "right".
function lobeArea(left, right, roots) {
  const half = (right - left) / 2, middle = (right + left) / 2;
  let sum = 0;
  for (let i = 0; i < GAUSS.points.length; i++) {
    sum += GAUSS.weights[i] * fValue(middle + half * GAUSS.points[i], roots);
  }
  return sum * half;
}

// Every lobe whose two roots lie in [from, to], left to right.
function lobesIn(from, to, roots) {
  const lobes = [];
  for (let i = 0; i + 1 < roots.length; i++) {
    const left = roots[i], right = roots[i + 1];
    if (left < from || right > to || !(right > left)) continue;
    const peakX = peakBetween(left, right, roots);
    lobes.push({
      left: left,
      right: right,
      area: lobeArea(left, right, roots),
      peakX: peakX,
      peak: fValue(peakX, roots),
      offset: peakX - left,
    });
  }
  return lobes;
}
