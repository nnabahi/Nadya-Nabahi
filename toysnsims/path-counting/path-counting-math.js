/* =====================================================================
   path-counting-math.js  —  the math behind the lattice path counting sim
   ---------------------------------------------------------------------
   The model (from nadya's old site):

     f(0, 0) = 1,
     f(x, y) = X(x, y) f(x - 1, y) + Y(x, y) f(x, y - 1)

   for every other point (x, y) of the grid 0..N by 0..N, where X and Y
   are typed formulas (the "weights" of the edges). A term is left out
   when x = 0 (no X term) or y = 0 (no Y term). When every weight is 0
   or 1, f(x, y) is the number of paths from (x, y) down to (0, 0) that
   take one step left or one step down at a time, using only edges of
   weight 1. In general it is the sum, over those paths, of the product
   of the weights along the path.

   f grows very fast (with every weight 1, f(x, y) is the binomial
   coefficient C(x + y, x), about 2^(x + y)), so everything is kept as
   log f, which never gets too big for the computer's numbers.

   The page and the check page both load this file. The page loads
   math.js and js/formulas.js before it, for reading the formulas.

   Contents:
     uniformFor(seed)              u(...): a random number for each input
     weightFunction(...)           a typed formula as a weight X(x, y)
     countPaths(N, X, Y)           log f on the whole grid
     levelRange(N, a, b)           the values of a x + b y on the grid
     linePoints(N, a, b, c)        the grid points on a x + b y = c
     scaledHeights(...)            f scaled to 0..1, three ways
     lineStats(points, logF, N)    mean, spread and Gaussian of f on the line
     bigNumberText(logValue)       f written out, from log f
   ===================================================================== */


/* ---------------------------------------------------------------------
   Random numbers: u(...)
   ---------------------------------------------------------------------
   u(...) is a random number from 0 to 1 that is FIXED for each input:
   u(y) is one number per row, u(x, y) one per point, and asking again
   gives the same number. So moving a slider never reshuffles the
   randomness: in {u(x, y) < p: 1, 0}, edges only switch ON as p goes
   up. The numbers come from the seed: a new seed gives new numbers.

   How: the seed and the inputs are written as text, like "5|3,7", and
   mixed by the hash function cyrb53 (by bryc, public domain,
   https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js)
   into a whole number of 53 bits, which is divided by 2^53.
   --------------------------------------------------------------------- */
function uniformFor(seed) {
  return function u() {
    return cyrb53(seed + "|" + Array.prototype.join.call(arguments, ",")) / 9007199254740992;   // 2^53
  };
}

function cyrb53(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}


/* ---------------------------------------------------------------------
   The weights
   --------------------------------------------------------------------- */

// A typed formula (a tree from readTree, js/formulas.js) as a function
// weight(x, y). "values" holds the sliders' values by letter; N and u
// can be used in the formula too. A true/false answer (like u(x, y) < p)
// counts as 1/0.
function weightFunction(tree, values, N, u) {
  const code = tree.compile();
  const scope = Object.assign({ N: N, u: u }, values);
  return function (x, y) {
    scope.x = x;
    scope.y = y;
    return Number(code.evaluate(scope));
  };
}

// Where point (x, y) is kept in the grid's lists.
function spot(N, x, y) { return x + (N + 1) * y; }

// log(e^a + e^b), without ever working out e^a or e^b themselves (they
// can be far too big). -Infinity stands for log 0.
function logAdd(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const high = Math.max(a, b), low = Math.min(a, b);
  return high + Math.log1p(Math.exp(low - high));
}

// Work out log f on the whole grid, row by row from the bottom (each
// f(x, y) needs only the points just left of it and just below it).
// weightX(x, y) is the weight of the edge from (x - 1, y) to (x, y), and
// weightY(x, y) of the edge from (x, y - 1) to (x, y). A weight that is
// not a number (like an undefined piece of a piecewise formula) counts
// as 0, a closed edge; so does a weight below 0 (it is counted in
// "negative"). Returns:
//   logF        log f(x, y) at spot(N, x, y); -Infinity where f = 0
//   wx, wy      the weights used
//   notZeroOne  { X, Y }: true if X (or Y) takes a value other than 0 or 1
//   negative    how many weights were below 0
function countPaths(N, weightX, weightY) {
  const size = (N + 1) * (N + 1);
  const logF = new Float64Array(size).fill(-Infinity);
  const wx = new Float64Array(size), wy = new Float64Array(size);
  const notZeroOne = { X: false, Y: false };
  let negative = 0;
  function clean(w, which) {
    if (!isFinite(w)) return 0;
    if (w !== 0 && w !== 1) notZeroOne[which] = true;
    if (w < 0) { negative++; return 0; }
    return w;
  }
  logF[0] = 0;                                     // f(0, 0) = 1
  for (let y = 0; y <= N; y++) {
    for (let x = 0; x <= N; x++) {
      if (x === 0 && y === 0) continue;
      const p = spot(N, x, y);
      let sum = -Infinity;
      if (x > 0) {
        wx[p] = clean(weightX(x, y), "X");
        if (wx[p] > 0) sum = logAdd(sum, Math.log(wx[p]) + logF[p - 1]);
      }
      if (y > 0) {
        wy[p] = clean(weightY(x, y), "Y");
        if (wy[p] > 0) sum = logAdd(sum, Math.log(wy[p]) + logF[p - (N + 1)]);
      }
      logF[p] = sum;
    }
  }
  return { N: N, logF: logF, wx: wx, wy: wy, notZeroOne: notZeroOne, negative: negative };
}


/* ---------------------------------------------------------------------
   The line a x + b y = c
   ---------------------------------------------------------------------
   The direction (a, b) is a pair of whole numbers, not both 0, and c is
   a whole number, so every point on the line with whole-number x and y
   is a grid point. The line is at right angles to (a, b), at distance
   |c| / sqrt(a^2 + b^2) from (0, 0).
   --------------------------------------------------------------------- */

// The smallest and largest values of a x + b y on the grid (at its corners).
function levelRange(N, a, b) {
  return { lo: N * (Math.min(a, 0) + Math.min(b, 0)), hi: N * (Math.max(a, 0) + Math.max(b, 0)) };
}

// The grid points on the line a x + b y = c, in order of x (of y, for
// an up-and-down line, b = 0).
function linePoints(N, a, b, c) {
  const points = [];
  if (b === 0) {
    if (c % a === 0 && c / a >= 0 && c / a <= N) {
      for (let y = 0; y <= N; y++) points.push({ x: c / a, y: y });
    }
    return points;
  }
  for (let x = 0; x <= N; x++) {
    const y = (c - a * x) / b;
    if (Number.isInteger(y) && y >= 0 && y <= N) points.push({ x: x, y: y });
  }
  return points;
}

// f scaled to heights from 0 to 1, one way of three ("how"):
//   "line"  f divided by the largest f on its own line a x + b y = k
//           (every line tops out at 1, so each one shows its own shape)
//   "all"   f divided by the largest f on the whole grid
//   "log"   log f, from 0 (or the smallest log f, if that is below 0)
//           up to the largest log f
// NaN where f = 0 (no path gets there).
function scaledHeights(paths, a, b, how) {
  const N = paths.N, logF = paths.logF;
  const heights = new Float64Array(logF.length).fill(NaN);
  let most = -Infinity, least = Infinity;
  for (const L of logF) if (L > -Infinity) { most = Math.max(most, L); least = Math.min(least, L); }
  if (how === "line") {
    // The largest log f on each line, by k (shifted so the smallest k is 0).
    const range = levelRange(N, a, b);
    const top = new Float64Array(range.hi - range.lo + 1).fill(-Infinity);
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      const k = a * x + b * y - range.lo;
      top[k] = Math.max(top[k], logF[spot(N, x, y)]);
    }
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      const p = spot(N, x, y);
      if (logF[p] > -Infinity) heights[p] = Math.exp(logF[p] - top[a * x + b * y - range.lo]);
    }
  } else {
    const bottom = Math.min(least, 0);
    for (let p = 0; p < logF.length; p++) {
      if (logF[p] === -Infinity) continue;
      heights[p] = how === "all" ? Math.exp(logF[p] - most)
        : (most > bottom ? (logF[p] - bottom) / (most - bottom) : 0);
    }
  }
  return heights;
}


/* ---------------------------------------------------------------------
   f along the line, and its bell curve
   ---------------------------------------------------------------------
   Along the line, f (divided by its sum) is a list of chances, one per
   point. "position" is each point's x (its y on an up-and-down line).
   Their mean and standard deviation give the Gaussian bell curve that
   fits best in the sense of matching those two numbers. With every
   weight 1 and the line x + y = c, f is the binomial coefficient
   C(c, x), and the de Moivre-Laplace theorem says this shape tends to
   exactly that Gaussian as c grows (W. Feller, "An Introduction to
   Probability Theory and Its Applications", Vol. 1, 3rd ed., Wiley,
   1968, Chapter VII).
   --------------------------------------------------------------------- */
function lineStats(points, logF, N, upright) {
  const stats = { count: points.length, reached: 0, position: [], scaled: [], logMost: -Infinity, logSum: -Infinity };
  for (const point of points) {
    const L = logF[spot(N, point.x, point.y)];
    if (L > -Infinity) stats.reached++;
    stats.logMost = Math.max(stats.logMost, L);
    stats.logSum = logAdd(stats.logSum, L);
    stats.position.push(upright ? point.y : point.x);
  }
  if (stats.reached === 0) return stats;
  // f divided by the largest f on the line (the bars, tallest = 1), and
  // the mean and standard deviation of the position, weighted by f.
  let total = 0, mean = 0, square = 0;
  points.forEach(function (point, i) {
    const s = Math.exp(logF[spot(N, point.x, point.y)] - stats.logMost);
    stats.scaled.push(s);
    total += s;
    mean += s * stats.position[i];
  });
  mean /= total;
  points.forEach(function (point, i) { square += stats.scaled[i] * (stats.position[i] - mean) ** 2; });
  stats.mean = mean;
  stats.sd = Math.sqrt(square / total);
  // The Gaussian with that mean and standard deviation, scaled to the
  // bars: the bars are "gap" apart, so they have area total * gap, and
  // the curve gets the same area.
  const gap = points.length > 1 ? Math.abs(stats.position[1] - stats.position[0]) : 1;
  stats.gaussian = function (t) {
    if (!(stats.sd > 0)) return t === mean ? 1 : 0;
    return total * gap * Math.exp(-((t - mean) ** 2) / (2 * stats.sd ** 2)) / (stats.sd * Math.sqrt(2 * Math.PI));
  };
  // How far the bars are from the curve, at worst (on the bars' scale, tallest = 1).
  stats.worstGap = 0;
  stats.scaled.forEach(function (s, i) {
    stats.worstGap = Math.max(stats.worstGap, Math.abs(s - stats.gaussian(stats.position[i])));
  });
  return stats;
}

// A number given by its log, written out: in full when it is small
// enough to be exact (below 10^15), like 1,234,567 or 0.25, and
// otherwise like "4.52 × 10^87". (Rounding to 12 digits first turns
// e^(log 1234) = 1233.9999999999 back into 1234.)
function bigNumberText(logValue) {
  if (logValue === -Infinity) return "0";
  const tens = logValue / Math.LN10;
  if (tens < 15 && tens > -4) {
    return Number(Math.exp(logValue).toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  const power = Math.floor(tens);
  return Math.pow(10, tens - power).toFixed(2) + " × 10^" + power;
}
