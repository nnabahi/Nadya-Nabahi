/* =====================================================================
   random-matrix-products.js  —  the math behind the "Random matrix
   products" toy (nadya's Desmos ideas D12 and D13)
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
     (a, b, p, ...) they may use u1, u2, u3, u4: uniform numbers in
     [0, 1], drawn fresh at every step. So Desmos D12, a random
     column-stochastic matrix with uniform entries, is the one matrix
         [[u1, u2], [1 - u1, 1 - u2]].

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
   matrices", Ann. Math. Statist. 31 (1960) 457-469; it needs the average of log+ |M| to be finite, true here since every
   entry is bounded). |P| can be any matrix norm, since they all differ
   by at most a constant factor, which (1/t) log kills. Here it is the
   largest entry in size, which is exactly logSize.

   Random numbers. Run n has its own stream of random numbers, from
   seedrandom's "alea" generator (https://github.com/davidbau/seedrandom),
   which repeats exactly for the same seed. Step t of run n always reads
   the same five numbers: one to pick the matrix, then u1, u2, u3, u4.
   So when a slider moves, every run reads the same numbers through the
   new matrices, and the cloud morphs instead of reshuffling (the
   Desmos feel). More steps or more runs only add numbers at the end.

   The file is split into numbered sections:
     1. Presets
     2. Reading the typed matrices and weights (with math.js)
     3. Picking a matrix, and the average matrix
     4. The cloud: many runs at once
     5. Statistics
   Nothing here draws or touches the page, so the check page
   (random-matrix-products-check.html) can test it on its own.
   The page loads math.js, seedrandom's alea and ../js/formulas.js
   (for readTree) before this file.
   ===================================================================== */


/* =====================================================================
   1. PRESETS
   ---------------------------------------------------------------------
   Each matrix is { entries: [top left, top right, bottom left,
   bottom right], weight }, all as typed text. A blank weight means
   "no weight given".
   ===================================================================== */

const PRESETS = {
  // Desmos D13: two fixed column-stochastic matrices, each half the time.
  d13: {
    name: "D13: two stochastic matrices A, B",
    matrices: [
      { entries: ["0.9", "0.8", "0.1", "0.2"], weight: "" },
      { entries: ["0.6", "0.3", "0.4", "0.7"], weight: "" },
    ],
  },
  // Desmos D12: a random column-stochastic matrix, uniform entries.
  d12: {
    name: "D12: random stochastic matrix",
    matrices: [
      { entries: ["u1", "u2", "1 - u1", "1 - u2"], weight: "" },
    ],
  },
  // randmatAB.py and randmatcltmul.py.
  randmatAB: {
    name: "randmatAB.py: [[2, 1], [1, 1]] and [[3, 1], [2, 1]]",
    matrices: [
      { entries: ["2", "1", "1", "1"], weight: "" },
      { entries: ["3", "1", "2", "1"], weight: "" },
    ],
  },
  // randmatprod.py.
  randmatprod: {
    name: "randmatprod.py: [[5/4, 3/4], [3/4, 5/4]] and [[1, -1], [0, 1]]",
    matrices: [
      { entries: ["5/4", "3/4", "3/4", "5/4"], weight: "" },
      { entries: ["1", "-1", "0", "1"], weight: "" },
    ],
  },
};

// The fresh uniform numbers a formula may use at every step.
const UNIFORM_NAMES = ["u1", "u2", "u3", "u4"];


/* =====================================================================
   2. READING THE TYPED MATRICES AND WEIGHTS
   ---------------------------------------------------------------------
   Formulas are read by math.js (https://mathjs.org) through readTree
   from ../js/formulas.js, so they follow the same rules as the drawing
   tool's formula box ("ab" means a times b, and so on).
   ===================================================================== */

// The letters in all the boxes that need a slider: everything except
// u1..u4 and names math.js already knows (pi, e, sqrt, ...).
function matrixLetters(matrices) {
  const names = [];
  for (const m of matrices) {
    for (const text of m.entries.concat([m.weight])) {
      if (text.trim() === "") continue;
      readTree(text)
        .filter(function (node, path, parent) {
          return node.isSymbolNode && !isFunctionName(path, parent);
        })
        .forEach(function (node) { names.push(node.name); });
    }
  }
  return [...new Set(names)].filter(function (name) {
    return !UNIFORM_NAMES.includes(name) && math[name] === undefined;
  });
}

// Read one box into a function of the uniform numbers u = [u1..u4].
// "where" names the box in error messages. An entry that doesn't use
// u1..u4 is worked out once here, so the runs never re-read it.
function readEntry(text, sliders, where) {
  if (text.trim() === "") throw new Error(where + " is empty.");
  let tree;
  try { tree = readTree(text); }
  catch (error) { throw new Error(where + ": " + error.message); }
  const usesUniforms = tree.filter(function (node) {
    return node.isSymbolNode && UNIFORM_NAMES.includes(node.name);
  }).length > 0;

  const compiled = tree.compile();
  const scope = Object.assign({}, sliders);
  function valueAt(u) {
    scope.u1 = u[0]; scope.u2 = u[1]; scope.u3 = u[2]; scope.u4 = u[3];
    const value = compiled.evaluate(scope);
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error(where + " should give one number" + (usesUniforms ? " for every u1, u2, u3, u4 in [0, 1]." : "."));
    }
    return value;
  }

  if (!usesUniforms) {
    const fixed = valueAt([0, 0, 0, 0]);
    return { usesUniforms: false, valueAt: function () { return fixed; } };
  }
  return { usesUniforms: true, valueAt: valueAt };
}

// Read the whole list into a "model":
//   matrices   for each matrix, its four entries (from readEntry)
//   chances    the probability of picking each matrix
//   random     true if some entry uses u1..u4
// Throws an Error with a plain message if something can't be used.
function readModel(matrices, sliders) {
  if (matrices.length === 0) throw new Error("Add at least one matrix.");
  const where = function (i) { return "Matrix " + (i + 1); };
  const corner = ["top left", "top right", "bottom left", "bottom right"];

  const read = matrices.map(function (m, i) {
    return m.entries.map(function (text, k) {
      return readEntry(text, sliders, where(i) + ", " + corner[k] + " entry");
    });
  });

  // Weights: a blank box counts as 1, so all blank = all equally likely.
  const weights = matrices.map(function (m, i) {
    if (m.weight.trim() === "") return 1;
    const w = readEntry(m.weight, sliders, where(i) + "'s weight");
    if (w.usesUniforms) throw new Error(where(i) + "'s weight can't use u1, u2, u3 or u4.");
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
      return entries.some(function (e) { return e.usesUniforms; });
    }),
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
// [top left, top right, bottom left, bottom right]. An entry that uses
// u1..u4 is averaged with the midpoint rule: its average over the cube
// [0, 1]^k (k = the number of u's it uses) is the average of its values
// at the centers of a grid of 12^k small cubes. That is exact for
// entries that are linear in each u (like D12's), and close otherwise.
// Because the steps are independent, the average of v_t is exactly
// E[X]^t v_0 (the average of a product of independent factors is the
// product of their averages).
function averageMatrix(model) {
  const GRID = 12;
  const mean = [0, 0, 0, 0];
  model.matrices.forEach(function (entries, i) {
    entries.forEach(function (entry, k) {
      let average;
      if (!entry.usesUniforms) {
        average = entry.valueAt();
      } else {
        // Every u1..u4 runs over the grid centers (it's simplest to grid
        // all four; 12^4 = 20736 values, done once per change).
        let sum = 0, count = 0;
        const u = [0, 0, 0, 0];
        for (let a = 0; a < GRID; a++) for (let b = 0; b < GRID; b++)
        for (let c = 0; c < GRID; c++) for (let d = 0; d < GRID; d++) {
          u[0] = (a + 0.5) / GRID; u[1] = (b + 0.5) / GRID;
          u[2] = (c + 0.5) / GRID; u[3] = (d + 0.5) / GRID;
          sum += entry.valueAt(u);
          count++;
        }
        average = sum / count;
      }
      mean[k] += model.chances[i] * average;
    });
  });
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
   cloud.setModel(model) swaps in new matrices (a slider moved); the
   page then starts again from t = 0 with the same random numbers.
   ===================================================================== */

function newCloud(model, runs, seed) {
  const cloud = {
    model: model,
    runs: runs,
    t: 0,
    q0: new Float64Array(runs), q1: new Float64Array(runs),
    q2: new Float64Array(runs), q3: new Float64Array(runs),
    logSize: new Float64Array(runs),
    streams: [],
    step: step,
    restart: restart,
    setModel: function (m) { cloud.model = m; restart(); },
  };

  // Back to t = 0: identity matrices, and each run's random numbers
  // from the start of its stream again.
  function restart() {
    cloud.t = 0;
    for (let n = 0; n < runs; n++) {
      cloud.q0[n] = 1; cloud.q1[n] = 0; cloud.q2[n] = 0; cloud.q3[n] = 1;
      cloud.logSize[n] = 0;
      cloud.streams[n] = alea(seed + ":" + n);
    }
  }

  // One step for every run:  P <- X P,  with X the picked matrix.
  const u = [0, 0, 0, 0];
  function step() {
    const model = cloud.model;
    for (let n = 0; n < runs; n++) {
      const random = cloud.streams[n];
      const entries = model.matrices[pickMatrix(model, random())];
      u[0] = random(); u[1] = random(); u[2] = random(); u[3] = random();
      const a = entries[0].valueAt(u), b = entries[1].valueAt(u);
      const c = entries[2].valueAt(u), d = entries[3].valueAt(u);

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
