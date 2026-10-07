/* =====================================================================
   ising-potts-check.js  —  the tests on ising-potts-check.html
   ---------------------------------------------------------------------
   Tests of the two chains in ising-potts-chain.js:

     1. The heat bath leaves pi unchanged, exactly. On tiny graphs every
        coloring can be listed, so pi is known exactly. One heat-bath
        update of cell v (with the chain's own weights) must carry pi to
        pi, to rounding error.
     2. Both chains sample pi. Run each chain for a long time on a tiny
        graph and compare how often each (agreeing pairs, cells of
        color 1) comes up with the exact odds, by a chi-square test.
     3. Ising, exact numbers (q = 2, h = 0, 64 x 64 torus, Swendsen-Wang):
        above the critical point the average |m| must be near Yang's
        spontaneous magnetization (1 - sinh(beta)^-4)^(1/8) (C. N. Yang,
        Phys. Rev. 85 (1952) 808-816; this page's beta is twice the
        Ising one); at beta_c = log(1 + sqrt 2) the share of agreeing
        pairs must be near (1 + 1/sqrt 2) / 2 (L. Onsager, Phys. Rev. 65
        (1944) 117-149).
     4. With beta = 0 every coloring is equally likely, and the heat
        bath and Swendsen-Wang both give each cell a uniform color.

   Random numbers come from the library seedrandom, with fixed seeds,
   so the tests do the same thing every time. Chi-square p-values come
   from jStat.
   ===================================================================== */


// Every coloring of n cells with q colors, as numbers 0 .. q^n - 1
// (the digits of the number in base q are the colors), with its
// exact probability under pi.
function exactPi(d, q, beta, h) {
  const total = Math.pow(q, d.n), weights = new Float64Array(total), colors = new Uint8Array(d.n);
  let Z = 0;
  for (let s = 0; s < total; s++) {
    decode(s, q, colors);
    const st = statsOf(d, colors);
    weights[s] = Math.exp(beta * (st.agree + h * st.zeros));
    Z += weights[s];
  }
  for (let s = 0; s < total; s++) weights[s] /= Z;
  return weights;
}
function decode(s, q, colors) {
  for (let v = 0; v < colors.length; v++) { colors[v] = s % q; s = Math.floor(s / q); }
}
function encode(colors, q) {
  let s = 0;
  for (let v = colors.length - 1; v >= 0; v--) s = s * q + colors[v];
  return s;
}
// Agreeing pairs and cells of color 0 (color 1 on the page).
function statsOf(d, colors) {
  let agree = 0, zeros = 0;
  for (let v = 0; v < d.n; v++) {
    if (colors[v] === 0) zeros++;
    for (let e = d.first[v]; e < d.first[v + 1]; e++) if (d.nbr[e] > v && colors[d.nbr[e]] === colors[v]) agree++;
  }
  return { agree: agree, zeros: zeros };
}

const SMALL_CASES = [
  { name: "3 x 2 box, q = 3, β = 0.7, h = 0.3", d: boxDomain(3, 2, 4, false), q: 3, beta: 0.7, h: 0.3 },
  { name: "3 x 3 torus, q = 2, β = 0.5, h = -0.2", d: boxDomain(3, 3, 4, true), q: 2, beta: 0.5, h: -0.2 },
  { name: "3 x 2 box with 8 neighbors, q = 4, β = 1.1, h = 0", d: boxDomain(3, 2, 8, false), q: 4, beta: 1.1, h: 0 },
];


/* 1. The heat bath leaves pi unchanged, exactly. */
function testHeatBathExact() {
  let worst = 0;
  for (const c of SMALL_CASES) {
    const pi = exactPi(c.d, c.q, c.beta, c.h), total = pi.length;
    const chain = newPotts({ n: c.d.n, first: c.d.first, nbr: c.d.nbr, q: c.q, beta: c.beta, h: c.h,
                             colors: new Uint8Array(c.d.n), random: Math.random });
    const weights = new Float64Array(c.q);
    for (let v = 0; v < c.d.n; v++) {
      const after = new Float64Array(total);
      for (let s = 0; s < total; s++) {
        decode(s, c.q, chain.colors);
        chain.colorWeights(v, weights);
        let sum = 0;
        for (let k = 0; k < c.q; k++) sum += weights[k];
        const keep = chain.colors[v];
        for (let k = 0; k < c.q; k++) {
          chain.colors[v] = k;
          after[encode(chain.colors, c.q)] += pi[s] * weights[k] / sum;
        }
        chain.colors[v] = keep;
      }
      for (let s = 0; s < total; s++) worst = Math.max(worst, Math.abs(after[s] - pi[s]) / pi[s]);
    }
  }
  addRow("Heat bath keeps π exactly", worst < 1e-9,
         "On 3 tiny graphs, every cell, every coloring: one update carries π to π, largest relative error " +
         worst.toExponential(1) + ".");
}


/* 2. Both chains sample pi (chi-square). */
function testSampling(dynamics) {
  for (const c of SMALL_CASES) {
    const pi = exactPi(c.d, c.q, c.beta, c.h);
    // The exact odds of each (agreeing pairs, cells of color 1).
    const expected = new Map(), colors = new Uint8Array(c.d.n);
    for (let s = 0; s < pi.length; s++) {
      decode(s, c.q, colors);
      const st = statsOf(c.d, colors), key = st.agree + "," + st.zeros;
      expected.set(key, (expected.get(key) || 0) + pi[s]);
    }
    const random = new Math.seedrandom("sample " + dynamics + c.name);
    const chain = newPotts({ n: c.d.n, first: c.d.first, nbr: c.d.nbr, q: c.q, beta: c.beta, h: c.h,
                             colors: pottsStart(c.d.n, c.q, "random", random), random: random });
    const samples = 40000, seen = new Map();
    for (let k = 0; k < 50; k++) chain.sweep(dynamics);
    for (let k = 0; k < samples; k++) {
      for (let j = 0; j < 3; j++) chain.sweep(dynamics);   // 3 sweeps between samples
      const key = chain.agree + "," + chain.counts[0];
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    // Chi-square, with outcomes expected fewer than 5 times pooled
    // together (js/check-page.js).
    const test = pooledChiSquare(expected, seen, samples);
    addRow((dynamics === "sw" ? "Swendsen–Wang" : "Heat bath") + " samples π", test.pValue > 0.001,
           c.name + ": " + samples + " samples in " + test.groups + " groups, chi-square p-value " + test.pValue.toFixed(3) +
           " (pass above 0.001).");
  }
}


/* 3. Ising, exact numbers. */
function isingRun(beta, sweeps, burn, seed) {
  const d = boxDomain(64, 64, 4, true), random = new Math.seedrandom(seed);
  const chain = newPotts({ n: d.n, first: d.first, nbr: d.nbr, q: 2, beta: beta, h: 0,
                           colors: pottsStart(d.n, 2, "one", random), random: random });
  let m = 0, agree = 0;
  for (let k = 0; k < burn + sweeps; k++) {
    chain.sweep("sw");
    if (k < burn) continue;
    m += Math.abs(chain.counts[0] - chain.counts[1]) / d.n;
    agree += chain.agree / chain.pairs;
  }
  return { m: m / sweeps, agree: agree / sweeps };
}
function testYang() {
  const beta = 1.2, exact = Math.pow(1 - Math.pow(Math.sinh(beta), -4), 1 / 8);
  const r = isingRun(beta, 300, 50, "yang");
  addRow("Ising: Yang's magnetization", Math.abs(r.m - exact) < 0.01,
         "64 x 64 torus, β = 1.2: average |m| " + r.m.toFixed(4) + ", Yang's formula " + exact.toFixed(4) + " (pass within 0.01).");
}
function testOnsager() {
  const beta = Math.log(1 + Math.SQRT2), exact = (1 + 1 / Math.SQRT2) / 2;
  const r = isingRun(beta, 600, 100, "onsager");
  addRow("Ising: Onsager's energy at β_c", Math.abs(r.agree - exact) < 0.01,
         "64 x 64 torus at β_c: share of agreeing pairs " + r.agree.toFixed(4) + ", the exact limit " + exact.toFixed(4) +
         " (pass within 0.01).");
}


/* 4. beta = 0: uniform colors. */
function testUniform(dynamics) {
  const d = boxDomain(20, 20, 4, true), q = 5, random = new Math.seedrandom("uniform " + dynamics);
  const chain = newPotts({ n: d.n, first: d.first, nbr: d.nbr, q: q, beta: 0, h: 0.7,
                           colors: new Uint8Array(d.n), random: random });
  const totals = new Array(q).fill(0), samples = 200;
  // Swendsen-Wang: at beta = 0 there are no bonds, so every sweep gives
  // every cell a fresh uniform color. Heat bath: a sweep updates about
  // 63% of the cells, so it takes 5 sweeps between samples (then all
  // but about 1% of the cells are fresh), to keep the samples close to
  // independent, as the chi-square test assumes.
  const gap = dynamics === "sw" ? 1 : 5;
  for (let k = 0; k < samples; k++) {
    for (let j = 0; j < gap; j++) chain.sweep(dynamics);
    for (let c = 0; c < q; c++) totals[c] += chain.counts[c];
  }
  const pValue = equalChiSquare(totals).pValue;     // js/check-page.js
  addRow((dynamics === "sw" ? "Swendsen–Wang" : "Heat bath") + ": β = 0 gives uniform colors", pValue > 0.001,
         "q = 5 on a 20 x 20 torus (the field h = 0.7 has no effect at β = 0): shares " +
         totals.map(function (t) { return (t / (samples * d.n)).toFixed(3); }).join(", ") +
         "; chi-square p-value " + pValue.toFixed(3) + " (pass above 0.001).");
}


runChecksOnClick(function () {
  return [
    testHeatBathExact,
    function () { testSampling("heat"); }, function () { testSampling("sw"); },
    function () { testUniform("heat"); }, function () { testUniform("sw"); },
    testYang, testOnsager,
  ];
});
