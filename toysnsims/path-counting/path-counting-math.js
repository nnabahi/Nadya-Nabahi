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
     readDefinition(text)          a line like  d(y) = {random() < p: 3, 2}
     makeWeights(...)              the typed formulas as weights X(x, y), Y(x, y)
     countPaths(N, X, Y)           log f on the whole grid
     makeLine(N, angle)            the lines at right angles to a direction
     linePoints(N, line, k)        the grid points on line number k
     lineEnds(N, line, c)          where a line crosses the edge of the grid
     scaledHeights(...)            f scaled to 0..1, three ways
     lineStats(points, logF, N)    mean, spread and Gaussian of f on the line
     bigNumberText(logValue)       f written out, from log f
   ===================================================================== */


/* ---------------------------------------------------------------------
   The weights, and coupled random()
   ---------------------------------------------------------------------
   X(x, y) and Y(x, y) are typed formulas (read by readTree,
   js/formulas.js). You can also define your own functions, one per
   line, like
       d(y) = {random() < p: 3, 2}
   and use them in X and Y: Y = {mod(x, d(y)) = 0: 1, 0}.

   random() is COUPLED, as on the old site: each random() is a random
   number from 0 to 1 that is drawn once and then kept. It is fixed for
   its place in the formula and for where the formula is worked out:
   random() in X at (3, 5) is one number, random() in Y at (3, 5)
   another, and random() in d(y) is one number per row y (so d(4) is
   the same wherever it is used). Moving a slider never redraws them,
   so in {random() < p: 1, 0} edges only switch ON as p goes up. The
   "New randomness" button (a new seed) redraws them all.

   How: the seed, the formula's name and inputs, and which random() it
   is (the first, second, ... in the formula) are written as text, like
   "5|Y(3,5)|0", and mixed by the hash function cyrb53 (by bryc, public
   domain,
   https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js)
   into a whole number of 53 bits, which is divided by 2^53.
   --------------------------------------------------------------------- */
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

// A line like "d(y) = {random() < p: 3, 2}" read as { name: "d",
// inputs: ["y"], tree }. Throws an error if it isn't of that form.
function readDefinition(text) {
  const parts = text.match(/^\s*([A-Za-z]\w*)\s*\(([^()]*)\)\s*=(.*)$/);
  if (!parts) throw new Error("write it like d(y) = ...");
  const inputs = parts[2].split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  return { name: parts[1], inputs: inputs, tree: readTree(parts[3]) };
}

// Number the random()s in a formula: the k-th one becomes rnd(k), which
// knows where the formula is being worked out (see makeWeights).
function numberRandoms(tree) {
  let k = 0;
  return tree.transform(function (node) {
    if (node.isFunctionNode && node.fn.name === "random" && node.args.length === 0) {
      return new math.FunctionNode(new math.SymbolNode("rnd"), [new math.ConstantNode(k++)]);
    }
    return node;
  });
}

// The weights X(x, y) and Y(x, y) from the two formulas (trees.X and
// trees.Y), the definitions (from readDefinition), the sliders' values
// by letter, the grid size N (usable in the formulas) and the seed. A
// true/false answer (like random() < p) counts as 1/0.
function makeWeights(trees, definitions, values, N, seed) {
  const scope = Object.assign({ N: N }, values);
  let where = "";                          // e.g. "Y(3,5)": what is being worked out right now
  scope.rnd = function (k) { return cyrb53(seed + "|" + where + "|" + k) / 9007199254740992; };   // 2^53

  // Each definition becomes a function. While it runs, its inputs are
  // set to the values it was given (and put back afterward).
  for (const def of definitions) {
    const code = numberRandoms(def.tree).compile();
    scope[def.name] = function () {
      const given = Array.from(arguments), outer = where;
      const saved = def.inputs.map(function (v) { return scope[v]; });
      def.inputs.forEach(function (v, i) { scope[v] = given[i]; });
      where = def.name + "(" + given.join(",") + ")";
      try { return code.evaluate(scope); }
      finally { def.inputs.forEach(function (v, i) { scope[v] = saved[i]; }); where = outer; }
    };
  }
  function weight(tree, name) {
    const code = numberRandoms(tree).compile();
    return function (x, y) {
      scope.x = x;
      scope.y = y;
      where = name + "(" + x + "," + y + ")";
      return Number(code.evaluate(scope));
    };
  }
  return { X: weight(trees.X, "X"), Y: weight(trees.Y, "Y") };
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
   The lines at right angles to a direction
   ---------------------------------------------------------------------
   The direction is the vector (cos t, sin t), for an angle t from 0 to
   pi/2, and the line at distance c from (0, 0) at right angles to it is
       x cos t + y sin t = c.
   Grid points rarely lie exactly on it, so the page takes the nearest
   ones: when the line is closer to flat (t >= pi/4), one point in each
   column x, and otherwise one point in each row y. Every grid point
   belongs to exactly one such line, line number
       k = round((x cos t + y sin t) / w),   w = max(cos t, sin t),
   and line k is the one at distance c = k w. (For t = pi/4 this is just
   x + y = k, so the points are exactly on the line.)
   --------------------------------------------------------------------- */

// The lines for angle t on the grid 0..N: { angle, cos, sin, step (w),
// alongX (true when there is one point per column), number(x, y) (the
// line a point is on), most (the last line number) }.
function makeLine(N, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle), step = Math.max(cos, sin);
  // (alongX allows for rounding: at 45 degrees the computer's sin is a
  // hair smaller than its cos.)
  const line = { angle: angle, cos: cos, sin: sin, step: step, alongX: sin >= cos - 1e-12 };
  line.number = function (x, y) { return Math.round((x * cos + y * sin) / step); };
  line.most = line.number(N, N);
  return line;
}

// The grid points on line number k, in order of x (of y, when there is
// one point per row).
function linePoints(N, line, k) {
  const points = [];
  for (let t = 0; t <= N; t++) {
    // The other coordinate, from x cos + y sin = k w, rounded. (At a
    // tie in the rounding, the point is the one next to it.)
    const guess = line.alongX ? Math.round((k * line.step - t * line.cos) / line.sin)
                              : Math.round((k * line.step - t * line.sin) / line.cos);
    for (const other of [guess, guess - 1, guess + 1]) {
      if (other < 0 || other > N) continue;
      const point = line.alongX ? { x: t, y: other } : { x: other, y: t };
      if (line.number(point.x, point.y) === k) { points.push(point); break; }
    }
  }
  return points;
}

// Where the line x cos t + y sin t = c crosses the edge of the grid's
// box [0, N] x [0, N]: [x1, y1, x2, y2], or [] if it misses the box.
function lineEnds(N, line, c) {
  const ends = [];
  function add(x, y) {
    if (x < -1e-9 || x > N + 1e-9 || y < -1e-9 || y > N + 1e-9) return;
    if (ends.some(function (e) { return Math.hypot(e[0] - x, e[1] - y) < 1e-9; })) return;
    ends.push([x, y]);
  }
  if (line.sin > 1e-12) { add(0, c / line.sin); add(N, (c - N * line.cos) / line.sin); }
  if (line.cos > 1e-12) { add(c / line.cos, 0); add((c - N * line.sin) / line.cos, N); }
  return ends.length < 2 ? [] : [ends[0][0], ends[0][1], ends[1][0], ends[1][1]];
}

// f scaled to heights from 0 to 1, one way of three ("how"):
//   "line"  f divided by the largest f on its own line (makeLine)
//           (every line tops out at 1, so each one shows its own shape)
//   "all"   f divided by the largest f on the whole grid
//   "log"   log f, from 0 (or the smallest log f, if that is below 0)
//           up to the largest log f
// NaN where f = 0 (no path gets there).
function scaledHeights(paths, line, how) {
  const N = paths.N, logF = paths.logF;
  const heights = new Float64Array(logF.length).fill(NaN);
  let most = -Infinity, least = Infinity;
  for (const L of logF) if (L > -Infinity) { most = Math.max(most, L); least = Math.min(least, L); }
  if (how === "line") {
    // The largest log f on each line, by its number k.
    const top = new Float64Array(line.most + 1).fill(-Infinity);
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      const k = line.number(x, y);
      top[k] = Math.max(top[k], logF[spot(N, x, y)]);
    }
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      const p = spot(N, x, y);
      if (logF[p] > -Infinity) heights[p] = Math.exp(logF[p] - top[line.number(x, y)]);
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
   point. "position" is each point's x (its y when the line has one
   point per row).
   Their mean and standard deviation give the Gaussian bell curve that
   fits best in the sense of matching those two numbers. With every
   weight 1 and the line x + y = c, f is the binomial coefficient
   C(c, x), and the de Moivre-Laplace theorem says this shape tends to
   exactly that Gaussian as c grows (W. Feller, "An Introduction to
   Probability Theory and Its Applications", Vol. 1, 3rd ed., Wiley,
   1968, Chapter VII).
   --------------------------------------------------------------------- */
function lineStats(points, logF, N, alongX) {
  const stats = { count: points.length, reached: 0, position: [], scaled: [], logMost: -Infinity, logSum: -Infinity };
  for (const point of points) {
    const L = logF[spot(N, point.x, point.y)];
    if (L > -Infinity) stats.reached++;
    stats.logMost = Math.max(stats.logMost, L);
    stats.logSum = logAdd(stats.logSum, L);
    stats.position.push(alongX ? point.x : point.y);
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
