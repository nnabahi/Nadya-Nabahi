/* =====================================================================
   matrix-products-math.js  —  the math behind the "Matrix Products"
   toy (nadya's Desmos ideas D12 and D13)
   ---------------------------------------------------------------------
   What it does, in plain words:
     There is a list of 2x2 matrices M_1, M_2, ..., each with a weight.
     At every step one of them is picked at random, matrix i with
     probability  w_i / (w_1 + w_2 + ...)  (all equally likely if no
     weights are given), and the vector is multiplied by it on the left:

         v_t = M_(picked at step t) v_(t-1),      v_0 = (1, 0)

     as in nadya's randmatprod.py and Desmos D13. After t steps the
     vector is  v_t = P_t v_0,  where  P_t = X_t ... X_2 X_1  is the
     product of the picked matrices (newest on the left).

     The entries of a matrix are typed formulas. Besides slider letters
     (a, b, p, ...) they may use the random variables of the Random
     variables box (js/sim-random.js), like u1 ~ unif(0, 1): each step
     of each run gets new, independent copies of every name, one number
     per name in all the entries of the step. So Desmos D12, a random
     column-stochastic matrix with uniform entries, is the one matrix
         [[u1, u2], [1 - u1, 1 - u2]]   with  u1, u2 ~ unif(0, 1).

   Many independent runs are made at once (the "cloud"). For every run
   the whole product P_t is kept, not just v_t, so that:
     - its first column  P_t (1, 0)  is where (1, 0) lands (red dots),
     - its second column P_t (0, 1)  is where (0, 1) lands (blue dots),
     - its eigenvalues can be found (a statistic, like randmatAB.py).

   Products grow or shrink exponentially (randmatAB.py's pair roughly
   triples every step), and would overflow a computer number after a
   few hundred steps. So each run stores P_t as  e^(logSize) * Q,  where
   Q's largest entry is 1 in size: after every step Q is divided by its
   largest entry and the log of that entry is added to logSize. The
   numbers in Q stay near 1, and nothing is lost.

   Growth rate. For independent random matrices,
       (1/t) log |P_t|  ->  gamma     as t -> infinity,
   with probability 1, where gamma is a fixed number, the top Lyapunov
   exponent (H. Furstenberg and H. Kesten, "Products of random
   matrices", Ann. Math. Statist. 31 (1960) 457-469; it needs the
   average of log+ |M| to be finite, true here since every entry is
   bounded). |P| can be any matrix norm, since they all differ
   by at most a constant factor, which (1/t) log kills. Here it is the
   largest entry in size, which is exactly logSize.

   Random numbers. Step s of run n picks its matrix with a uniform
   number fixed by the seed, n and s (seededUniform, js/sim-worker.js),
   and (n, s) is the "place" of its random variables: each name's copy
   there is F^-1(U), for a uniform U fixed by the seed, the name, n and
   s (newDrawer, js/sim-random.js). So when a slider moves, every run
   keeps all its uniform numbers, through the new matrices and laws,
   and the cloud morphs instead of reshuffling (the Desmos feel). More
   steps or more runs only add new numbers.

   The file is split into numbered sections:
     1. Presets
     2. Reading the typed matrices and weights (with math.js)
     3. Picking a matrix, and the average matrix
     4. The cloud: many runs at once
     5. Statistics
   Nothing here draws or touches the page, so the check page
   (matrix-products-check.html) can test it on its own.
   The page loads before this file: math.js, js/sim-worker.js
   (seededUniform), js/formulas.js (readTree) and the random variables
   (js/sim-laws.js, js/sim-law-catalog.js, js/sim-random.js).
   ===================================================================== */


/* =====================================================================
   1. PRESETS
   ---------------------------------------------------------------------
   Each preset is its Random variables box's lines, and a list of
   matrices: each matrix is
   { entries: [top left, top right, bottom left, bottom right], weight },
   all as typed text. A blank weight means "no weight given". (Their
   names, shown in the menu, are in matrix-products.html.)
   ===================================================================== */

const PRESETS = {
  // Desmos D13: two fixed column-stochastic matrices A, B, each half the time.
  d13: { lines: "", matrices: [
    { entries: ["0.9", "0.8", "0.1", "0.2"], weight: "" },
    { entries: ["0.6", "0.3", "0.4", "0.7"], weight: "" },
  ] },
  // Desmos D12: a random column-stochastic matrix, uniform entries.
  d12: { lines: "u1 ~ unif(0, 1)\nu2 ~ unif(0, 1)", matrices: [
    { entries: ["u1", "u2", "1 - u1", "1 - u2"], weight: "" },
  ] },
  // randmatAB.py and randmatcltmul.py: [[2, 1], [1, 1]] and [[3, 1], [2, 1]].
  randmatAB: { lines: "", matrices: [
    { entries: ["2", "1", "1", "1"], weight: "" },
    { entries: ["3", "1", "2", "1"], weight: "" },
  ] },
  // randmatprod.py: [[5/4, 3/4], [3/4, 5/4]] and [[1, -1], [0, 1]].
  randmatprod: { lines: "", matrices: [
    { entries: ["5/4", "3/4", "3/4", "5/4"], weight: "" },
    { entries: ["1", "-1", "0", "1"], weight: "" },
  ] },
};


/* =====================================================================
   2. READING THE TYPED MATRICES AND WEIGHTS
   ---------------------------------------------------------------------
   Formulas are read by math.js (https://mathjs.org) through readTree
   from js/formulas.js, so they follow the same rules as the drawing
   tool's formula box ("ab" means a times b, and so on).
   ===================================================================== */

// The letters that need a slider: the Random variables box's
// ("declared", js/sim-random.js), then the others in the matrices'
// boxes, which are everything but the random variables and names
// math.js already knows (pi, e, sqrt, ...).
function matrixLetters(matrices, declared) {
  const letters = declared.letters.slice();
  for (const m of matrices) {
    for (const text of m.entries.concat([m.weight])) {
      if (text.trim() === "") continue;
      for (const letter of randomLetters(readTree(text), declared)) {
        if (!letters.includes(letter)) letters.push(letter);
      }
    }
  }
  return letters;
}

// Read one box into { tree, random, valueAt(scope) }: "random" says
// whether it uses random variables, and valueAt works it out with the
// scope of a drawer at a step (drawer.scope, js/sim-random.js). An
// entry without random variables is worked out once here, so the runs
// never re-read it. "where" names the box in problems; "variables" are
// the random variables with the sliders' values (makeRandomVariables).
function readEntry(text, variables, where) {
  if (text.trim() === "") throw new Error(where + " is empty.");
  let tree;
  try { tree = readTree(text); }
  catch (error) { throw new Error(where + ": " + error.message); }
  const random = randomNamesIn(tree, variables.declared).length > 0;
  const code = prepareFormula(tree, variables.declared).compile();

  function valueAt(scope) {
    const value = code.evaluate(scope);
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error(where + " should give one number" + (random ? " for every value of its random variables." : "."));
    }
    return value;
  }

  if (!random) {
    const fixed = valueAt(new Map(Object.entries(variables.values)));
    return { tree: tree, random: false, valueAt: function () { return fixed; } };
  }
  return { tree: tree, random: true, valueAt: valueAt };
}

// Read the whole list into a "model":
//   matrices   for each matrix, its four entries (from readEntry)
//   chances    the probability of picking each matrix
//   random     true if some entry uses random variables
//   variables  the random variables (as given)
// Throws an Error with a plain message if something can't be used.
function readModel(matrices, variables) {
  if (matrices.length === 0) throw new Error("Add at least one matrix.");
  const where = function (i) { return "Matrix " + (i + 1); };
  const corner = ["top left", "top right", "bottom left", "bottom right"];

  const read = matrices.map(function (m, i) {
    return m.entries.map(function (text, k) {
      return readEntry(text, variables, where(i) + ", " + corner[k] + " entry");
    });
  });

  // Weights: a blank box counts as 1, so all blank = all equally likely.
  const weights = matrices.map(function (m, i) {
    if (m.weight.trim() === "") return 1;
    const w = readEntry(m.weight, variables, where(i) + "'s weight");
    if (w.random) throw new Error(where(i) + "'s weight can't use random variables (sliders are fine).");
    const value = w.valueAt();
    if (value < 0) throw new Error(where(i) + "'s weight is negative.");
    return value;
  });
  const total = weights.reduce(function (a, b) { return a + b; }, 0);
  if (!(total > 0)) throw new Error("The weights add up to 0.");

  return {
    matrices: read,
    chances: weights.map(function (w) { return w / total; }),
    random: read.some(function (entries) {
      return entries.some(function (e) { return e.random; });
    }),
    variables: variables,
  };
}


/* =====================================================================
   3. PICKING A MATRIX, AND THE AVERAGE MATRIX
   ===================================================================== */

// Which matrix a uniform number c in [0, 1) picks: walk along the
// chances until their running total passes c. (This is "inverse
// transform sampling": matrix i gets an interval of length chances[i].)
// Moving a weight a little only changes the picks of the runs whose c
// is near an interval's end, so the cloud morphs.
function pickMatrix(model, c) {
  let running = 0;
  for (let i = 0; i < model.chances.length; i++) {
    running += model.chances[i];
    if (c < running) return i;
  }
  return model.chances.length - 1;   // only reached through rounding
}

// The average matrix  E[X] = sum over i of chances[i] * E[M_i],  as
// [top left, top right, bottom left, bottom right]. The entries with
// random variables are averaged numerically (averagesOf,
// js/sim-random.js: on a grid, exact for entries linear in each
// uniform number, like D12's; otherwise from many draws). Because the
// steps are independent, the average of v_t is exactly E[X]^t v_0 (the
// average of a product of independent factors is the product of their
// averages).
function averageMatrix(model) {
  const random = [];
  model.matrices.forEach(function (entries, i) {
    entries.forEach(function (entry, k) {
      if (entry.random) random.push({ tree: entry.tree, label: "Matrix " + (i + 1) + "'s entry " + entry.tree.toString(), i: i, k: k });
    });
  });
  const averages = averagesOf(model.variables, random);

  const mean = [0, 0, 0, 0];
  model.matrices.forEach(function (entries, i) {
    entries.forEach(function (entry, k) {
      if (!entry.random) mean[k] += model.chances[i] * entry.valueAt();
    });
  });
  random.forEach(function (entry, m) { mean[entry.k] += model.chances[entry.i] * averages[m]; });
  return mean;
}

// The eigenvalues of the 2x2 matrix [[a, b], [c, d]]: the roots of
// lambda^2 - (a + d) lambda + (ad - bc) = 0, by the quadratic formula.
// Returns { re: [two real parts], im: [two imaginary parts] }, the
// one of larger size first.
function eigenvalues(a, b, c, d) {
  const half = (a + d) / 2;
  const disc = half * half - (a * d - b * c);
  if (disc >= 0) {
    const r = Math.sqrt(disc);
    const big = half >= 0 ? half + r : half - r;   // the larger in size
    const small = half >= 0 ? half - r : half + r;
    return { re: [big, small], im: [0, 0] };
  }
  const r = Math.sqrt(-disc);
  return { re: [half, half], im: [r, -r] };        // equal size
}

// The spectral radius: the largest size of an eigenvalue.
function spectralRadius(m) {
  const e = eigenvalues(m[0], m[1], m[2], m[3]);
  return Math.hypot(e.re[0], e.im[0]);
}


/* =====================================================================
   4. THE CLOUD: MANY RUNS AT ONCE
   ---------------------------------------------------------------------
   newCloud(model, runs, seed) starts "runs" runs at P_0 = identity.
   cloud.step() moves every run one step on. The products are kept in
   typed arrays (one number per run), which are fast in JavaScript:
       q0[n] q1[n]       Q for run n is  [[q0, q1],
       q2[n] q3[n]                         [q2, q3]]
       logSize[n]        P_t = e^(logSize) * Q   (see the top)
   cloud.setModel(model) swaps in new matrices (a slider moved), and
   starts again from t = 0, with the same random numbers.
   ===================================================================== */

function newCloud(model, runs, seed) {
  const cloud = {
    model: model,
    runs: runs,
    seed: seed,
    t: 0,
    q0: new Float64Array(runs), q1: new Float64Array(runs),
    q2: new Float64Array(runs), q3: new Float64Array(runs),
    logSize: new Float64Array(runs),
    step: step,
    setModel: function (m) { cloud.model = m; restart(); },
  };
  const pick = seededUniform(seed);     // the picks' uniform numbers
  let drawer = null;                    // the random variables, step by step

  // Back to t = 0: identity matrices (and a drawer for the new laws).
  function restart() {
    cloud.t = 0;
    for (let n = 0; n < runs; n++) {
      cloud.q0[n] = 1; cloud.q1[n] = 0; cloud.q2[n] = 0; cloud.q3[n] = 1;
      cloud.logSize[n] = 0;
    }
    drawer = cloud.model.random ? newDrawer(cloud.model.variables, seed) : null;
  }

  // One step for every run:  P <- X P,  with X the picked matrix. Step s
  // of run n picks with the uniform number pick.uniform(n, s), and its
  // random variables are at the place (n, s).
  function step() {
    const model = cloud.model, s = cloud.t + 1;
    for (let n = 0; n < runs; n++) {
      const entries = model.matrices[pickMatrix(model, pick.uniform(n, s))];
      if (drawer) drawer.at(n, s);
      const scope = drawer && drawer.scope;
      const a = entries[0].valueAt(scope), b = entries[1].valueAt(scope);
      const c = entries[2].valueAt(scope), d = entries[3].valueAt(scope);

      // [[a, b], [c, d]] times [[q0, q1], [q2, q3]]:
      const q0 = cloud.q0[n], q1 = cloud.q1[n], q2 = cloud.q2[n], q3 = cloud.q3[n];
      let r0 = a * q0 + b * q2, r1 = a * q1 + b * q3;
      let r2 = c * q0 + d * q2, r3 = c * q1 + d * q3;

      // Divide by the largest entry in size, and remember its log.
      const largest = Math.max(Math.abs(r0), Math.abs(r1), Math.abs(r2), Math.abs(r3));
      if (largest > 0) {
        r0 /= largest; r1 /= largest; r2 /= largest; r3 /= largest;
        cloud.logSize[n] += Math.log(largest);
      } else {
        cloud.logSize[n] = -Infinity;   // the product is the zero matrix
      }
      cloud.q0[n] = r0; cloud.q1[n] = r1; cloud.q2[n] = r2; cloud.q3[n] = r3;
    }
    cloud.t++;
  }

  restart();
  return cloud;
}

// Where run n's start vector (x0, y0) is now, under one of the scales:
//   "none"     P_t (x0, y0) itself (may be too big or small to show)
//   "average"  P_t (x0, y0) / rho^t, with rho the spectral radius of
//              the average matrix, as in randmatcltmultraj.py
//   "unit"     P_t (x0, y0) made length 1: only its direction
// Returns [x, y].
function pointOf(cloud, n, x0, y0, scale, rho) {
  const x = cloud.q0[n] * x0 + cloud.q1[n] * y0;
  const y = cloud.q2[n] * x0 + cloud.q3[n] * y0;
  if (scale === "unit") {
    const length = Math.hypot(x, y);
    return length > 0 ? [x / length, y / length] : [0, 0];
  }
  let logFactor = cloud.logSize[n];
  if (scale === "average") logFactor -= cloud.t * Math.log(rho);
  const factor = Math.exp(logFactor);
  return [x * factor, y * factor];
}


/* =====================================================================
   5. STATISTICS
   ===================================================================== */

// The growth rate of every run, (1/t) log |P_t|, with |P| the largest
// entry in size (see the top). Their average estimates gamma.
function growthRates(cloud) {
  const rates = new Float64Array(cloud.runs);
  for (let n = 0; n < cloud.runs; n++) rates[n] = cloud.logSize[n] / Math.max(cloud.t, 1);
  return rates;
}

// The eigenvalue of P_t of larger size, for every run, divided by the
// same factor as the points (so "none" may overflow to Infinity). For
// "unit" it is the eigenvalue of Q, the product scaled so its largest
// entry is 1 in size.
// randmatAB.py used numpy's max(), which for real eigenvalues is the
// larger one; here it's the larger in SIZE, which differs only when
// the two have opposite signs.
function topEigenvalues(cloud, scale, rho) {
  const re = new Float64Array(cloud.runs), im = new Float64Array(cloud.runs);
  for (let n = 0; n < cloud.runs; n++) {
    const e = eigenvalues(cloud.q0[n], cloud.q1[n], cloud.q2[n], cloud.q3[n]);
    let factor = 1;
    if (scale === "none") factor = Math.exp(cloud.logSize[n]);
    if (scale === "average") factor = Math.exp(cloud.logSize[n] - cloud.t * Math.log(rho));
    re[n] = e.re[0] * factor;
    im[n] = e.im[0] * factor;
  }
  return { re: re, im: im };
}

// The average and standard deviation of a list of numbers.
function meanAndSpread(values) {
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let squares = 0;
  for (const v of values) squares += (v - mean) * (v - mean);
  return { mean: mean, spread: Math.sqrt(squares / Math.max(values.length - 1, 1)) };
}
