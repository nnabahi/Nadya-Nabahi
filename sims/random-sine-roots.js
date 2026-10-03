/* =====================================================================
   random-sine-roots.js  —  the math behind the "Random sine function"
   sim (nadya's Desmos idea D1, "random roots")
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
      neighboring roots are independent, each uniform on a set that is
      typed in, like {2, 3} or [1, 1 + δ]. The roots are STATIONARY:
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
      section). For gaps uniform on [1 - d, 1 + d] this gives exactly
      nadya's L = sqrt(4 d u + (1 - d)^2), with u uniform on [0, 1].

   2. JITTERED LATTICE (matrixcalculations.py, randomsinwave).
      R(n) = n + s + U(n), with U(n) uniform on a typed set (like
      [-1/2, 1/2]) and one shift s uniform on [0, 1), which is what
      makes it stationary.

   3. MIRROR (randomsinfuncs.py). A walk r(1) < r(2) < ... to the right
      of 0, and roots at 0 and at every +r(k) and -r(k), so
          f(x) = x * product over k of (1 - x^2 / r(k)^2)
      is odd. It can't be stationary (0 is always a root), so it keeps
      nadya's x factor and f'(0) = 1 instead of f(0) = 1.

   Random numbers. Every random choice reads one fixed uniform number
   from [0, 1], made by the library seedrandom
   (https://github.com/davidbau/seedrandom), which repeats exactly for
   the same seed. Gap n always reads the same number u(n). So when a
   slider changes the gap set, the same u(n) are just read through the
   new set, and the curve bends smoothly instead of jumping (the
   Desmos feel).

   The file is split into numbered sections:
     1. The fixed random numbers
     2. Reading the typed gap set (with math.js)
     3. Placing the roots
     4. Evaluating f
     5. Peaks and lobes (the statistics)
   Nothing here draws or touches the page, so the check page
   (random-sine-check.html) can test it on its own.
   ===================================================================== */


/* =====================================================================
   1. THE FIXED RANDOM NUMBERS
   ---------------------------------------------------------------------
   One uniform number for every random choice, always in the same order,
   so the first numbers stay the same when N grows:
     cover     picks the length of the gap that covers 0 (walk)
     place     where 0 sits inside that gap (walk), or the shift s
               (jittered lattice)
     right[n]  the n-th gap (or jitter) to the right, n = 1 .. N
     left[n]   the n-th gap (or jitter) to the left,  n = 1 .. N
   ===================================================================== */

function makeUniforms(seed, N) {
  // seedrandom adds Math.seedrandom(seed), a random-number function
  // that gives the same numbers every time for the same seed.
  const random = new Math.seedrandom(String(seed));
  const u = {
    cover: random(),
    place: random(),
    right: new Float64Array(N + 1),     // index 0 is not used
    left: new Float64Array(N + 1),
  };
  for (let n = 1; n <= N; n++) {        // right and left take turns, so
    u.right[n] = random();              // the first n of each stay the same
    u.left[n] = random();               // when N changes
  }
  return u;
}


/* =====================================================================
   2. READING THE TYPED GAP SET
   ---------------------------------------------------------------------
   The box accepts three kinds of text:
     {2, 3}        a finite set: each element equally likely. Repeats
                   act as weights: {2, 2, 2, 3} picks 2 three times as
                   often as 3.
     [1, 1 + δ]    an interval: uniform on it.
     1 + δ u^2     a formula in u, where u is uniform on [0, 1].
   Any other letter (δ, d, a, ...) is a slider; its value comes from
   "sliders", e.g. { δ: 0.1 }. Reading is done by math.js
   (https://mathjs.org), loaded by the page.

   The result is a "gap law", an object with:
     kind          "set", "interval" or "formula"
     draw(u)       a gap, from one uniform number u
     sizeBiased(u) a size-biased gap (see section 3), from one u
     mean          the average gap
     smallest      the smallest possible gap
   ===================================================================== */

// The letters in the box that need a slider: everything except u and
// names math.js already knows (pi, e, sqrt, ...).
function gapSetLetters(text) {
  const tree = readTree(bracketsAsList(text));
  const names = tree
    .filter(function (node, path, parent) {
      return node.isSymbolNode && !(parent && parent.isFunctionNode && path === "fn");
    })
    .map(function (node) { return node.name; });
  return [...new Set(names)].filter(function (name) {
    return name !== "u" && math[name] === undefined;
  });
}

// Read the text and return its gap law (see above). Throws an Error
// with a plain message if the text can't be used.
function readGapSet(text, sliders) {
  text = text.trim();
  if (text === "") throw new Error("Type a set, like {2, 3} or [1, 1 + δ].");

  // {a, b, c}: a finite set.
  if (text.startsWith("{")) {
    if (!text.endsWith("}")) throw new Error("A set needs a closing }.");
    const values = evaluateList(text, sliders);
    if (values.length === 0) throw new Error("The set is empty.");
    return setLaw(values);
  }

  // [a, b]: an interval.
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) throw new Error("An interval needs a closing ].");
    const ends = evaluateList(text, sliders);
    if (ends.length !== 2) throw new Error("An interval is [a, b], with two numbers.");
    if (ends[0] > ends[1]) throw new Error("In [a, b], a must not be bigger than b.");
    return intervalLaw(ends[0], ends[1]);
  }

  // Anything else: a formula in u.
  const formula = readTree(text).compile();
  return formulaLaw(function (u) {
    const value = formula.evaluate(Object.assign({}, sliders, { u: u }));
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error("The formula should give one number for every u in [0, 1].");
    }
    return value;
  });
}

// A finite set of numbers, each equally likely.
function setLaw(values) {
  const m = values.length;
  const total = values.reduce(function (a, b) { return a + b; }, 0);
  return {
    kind: "set",
    draw: function (u) { return values[Math.min(m - 1, Math.floor(u * m))]; },
    // Size-biased: element i is picked with probability values[i] / total.
    // Walk along the elements until their running total passes u * total.
    sizeBiased: function (u) {
      let running = 0;
      for (const g of values) {
        running += g;
        if (u * total < running) return g;
      }
      return values[m - 1];
    },
    mean: total / m,
    smallest: Math.min.apply(null, values),
  };
}

// Uniform on the interval [a, b].
function intervalLaw(a, b) {
  return {
    kind: "interval",
    draw: function (u) { return a + (b - a) * u; },
    // Size-biased: the density is proportional to g on [a, b], so the
    // chance of being below g is (g^2 - a^2) / (b^2 - a^2). Setting that
    // equal to u and solving for g ("inverse transform") gives:
    sizeBiased: function (u) { return Math.sqrt(a * a + u * (b * b - a * a)); },
    mean: (a + b) / 2,
    smallest: a,
  };
}

// A gap g(u), with u uniform on [0, 1]. For the size-biased draw, u is
// weighted by g(u). That weighting is put in a table once: g at TABLE
// points spread evenly over [0, 1], and the running total of g. A
// size-biased draw finds where the running total passes u * total and
// reads g there. The same u always lands in the same place, so the
// curve still morphs smoothly when a slider moves.
const TABLE = 2000;

function formulaLaw(g) {
  const gs = new Float64Array(TABLE);      // g at the middle of each of TABLE strips
  const runningTotal = new Float64Array(TABLE + 1);
  let smallest = Infinity;
  for (let j = 0; j < TABLE; j++) {
    gs[j] = g((j + 0.5) / TABLE);
    smallest = Math.min(smallest, gs[j]);
    runningTotal[j + 1] = runningTotal[j] + gs[j];
  }
  const total = runningTotal[TABLE];
  return {
    kind: "formula",
    draw: g,
    sizeBiased: function (u) {
      // Find the strip j where the running total passes u * total
      // (halving the search range each time: "binary search"), then go
      // the right fraction of the way across that strip.
      const target = u * total;
      let lo = 0, hi = TABLE - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (runningTotal[mid + 1] <= target) lo = mid + 1;
        else hi = mid;
      }
      const fraction = (target - runningTotal[lo]) / gs[lo];
      return g((lo + Math.min(Math.max(fraction, 0), 1)) / TABLE);
    },
    mean: total / TABLE,
    smallest: smallest,
  };
}

// math.js reads "[1, 2]" as a list but not "{1, 2}", so braces are
// read as brackets.
function bracketsAsList(text) {
  text = text.trim();
  if (text.startsWith("{") && text.endsWith("}")) return "[" + text.slice(1, -1) + "]";
  return text;
}

// The numbers in "{...}" or "[...]", as a plain list.
function evaluateList(text, sliders) {
  const result = readTree(bracketsAsList(text)).compile().evaluate(Object.assign({}, sliders));
  const values = math.flatten(math.matrix(result)).toArray();
  for (const v of values) {
    if (typeof v !== "number" || !isFinite(v)) throw new Error("Every entry must be a number.");
  }
  return values;
}

// Read the text with math.js, Desmos style: every variable is one
// letter, so "δu" means δ times u (math.js alone would read one
// variable called "δu"). Names math.js knows, like sqrt or pi, are left
// alone. The drawing tool does the same (readTree in graph-tool.js);
// this version also splits Greek letters.
function readTree(text) {
  return math.parse(text).transform(function (node, path, parent) {
    const isWord = node.isSymbolNode && /^\p{L}{2,}$/u.test(node.name);
    const isFunction = parent && parent.isFunctionNode && path === "fn";
    if (!isWord || isFunction || math[node.name] !== undefined) return node;
    const letters = Array.from(node.name).map(function (ch) { return new math.SymbolNode(ch); });
    return letters.reduce(function (product, letter) {
      return new math.OperatorNode("*", "multiply", [product, letter], true);
    });
  });
}


/* =====================================================================
   3. PLACING THE ROOTS
   ---------------------------------------------------------------------
   makeRoots(model, law, u, N) returns the roots as a sorted list
   (a Float64Array, smallest first). "model" is "walk", "lattice" or
   "mirror" (see the top of the file); "law" is the gap law from
   section 2 (for the lattice it is the jitter); "u" comes from
   makeUniforms(seed, N).
   ===================================================================== */

function makeRoots(model, law, u, N) {
  if (model !== "lattice" && !(law.smallest > 0)) {
    throw new Error("Every gap must be bigger than 0.");
  }
  const roots = new Float64Array(2 * N + (model === "mirror" ? 1 : 0));

  if (model === "walk") {
    // The gap covering 0 is size-biased, and 0 is uniform inside it:
    // R(-1) < 0 < R(0), with R(0) - R(-1) = L.
    const L = law.sizeBiased(u.cover);
    let right = u.place * L;              // R(0)
    let left = right - L;                 // R(-1)
    roots[N] = right;
    roots[N - 1] = left;
    for (let n = 1; n < N; n++) {
      right += law.draw(u.right[n]);      // R(n)   = R(n-1) + gap
      left -= law.draw(u.left[n]);        // R(-n-1) = R(-n) - gap
      roots[N + n] = right;
      roots[N - 1 - n] = left;
    }
  } else if (model === "lattice") {
    // R(n) = n + s + U(n), for n = -N .. N-1.
    const s = u.place;
    for (let n = 0; n < N; n++) {
      roots[N + n] = n + s + law.draw(u.right[n + 1]);
      roots[N - 1 - n] = -(n + 1) + s + law.draw(u.left[n + 1]);
    }
    roots.sort();                         // big jitters can swap neighbors
  } else if (model === "mirror") {
    // 0, and +-r(k) for a walk r(1) < r(2) < ... < r(N).
    let r = 0;
    roots[N] = 0;
    for (let k = 1; k <= N; k++) {
      r += law.draw(u.right[k]);
      roots[N + k] = r;
      roots[N - k] = -r;
    }
  } else {
    throw new Error("Unknown root model: " + model);
  }
  return roots;
}


/* =====================================================================
   4. EVALUATING f
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
   5. PEAKS AND LOBES
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

// The 20 Gauss-Legendre points and weights on [-1, 1], found once by
// Newton's method on the Legendre polynomial (Numerical Recipes,
// Section 4.6, routine "gauleg").
const GAUSS = gaussLegendre(20);

function gaussLegendre(n) {
  const points = [], weights = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5));   // first guess
    let slope = 1;
    for (let step = 0; step < 100; step++) {
      // p1 = Legendre polynomial P_n(z), from the three-term recurrence.
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      slope = n * (z * p1 - p2) / (z * z - 1);             // P_n'(z)
      const previous = z;
      z = previous - p1 / slope;                           // Newton step
      if (Math.abs(z - previous) < 1e-15) break;
    }
    points.push(z);
    weights.push(2 / ((1 - z * z) * slope * slope));
  }
  return { points: points, weights: weights };
}

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
