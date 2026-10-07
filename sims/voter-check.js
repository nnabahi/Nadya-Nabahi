/* =====================================================================
   voter-check.js  —  the tests on voter-check.html
   ---------------------------------------------------------------------
   Tests of the rule in voter-chain.js:

     1. g(x) = x is the voter model: for every cell of random states,
        the chance of each opinion is exactly the share of neighbors
        holding it (copy a uniformly chosen neighbor).
     2. The update law: with any g and noise eps, cell v takes opinion
        c with probability eps / q + (1 - eps) g(x_c) / sum g, worked
        out here separately and compared by a chi-square test.
     3. Who wins: in the voter model with two opinions and no noise,
        sum over v of deg(v) [opinion 1 at v] is a martingale, so
        opinion 1 wins with probability equal to its share of the
        degrees (V. Sood and S. Redner, Phys. Rev. Lett. 94 (2005)
        178701). Checked on a torus (every cell the same degree, so the
        share of cells) and on a box (corners and sides have fewer
        neighbors).
     4. Noise eps = 1: every update is a fresh uniform opinion, so the
        opinions become uniform.

   Random numbers come from the library seedrandom, with fixed seeds,
   so the tests do the same thing every time. Chi-square p-values come
   from jStat.
   ===================================================================== */

// A voter with uniformly random opinions on domain d.
function randomVoter(d, q, g, noise, seed) {
  const random = new Math.seedrandom(seed);
  let maxDegree = 1;
  for (let v = 0; v < d.n; v++) maxDegree = Math.max(maxDegree, d.first[v + 1] - d.first[v]);
  return newVoter({ n: d.n, first: d.first, nbr: d.nbr, q: q, table: makeTable(g, maxDegree),
                    noise: noise, colors: voterStart(d.n, d.x, q, "random", random), random: random });
}

// The share of v's neighbors holding each opinion.
function shares(d, colors, q, v) {
  const x = new Array(q).fill(0), deg = d.first[v + 1] - d.first[v];
  for (let e = d.first[v]; e < d.first[v + 1]; e++) x[colors[d.nbr[e]]] += 1 / deg;
  return x;
}


/* 1. g(x) = x copies a uniform neighbor. */
function testVoterRule() {
  let worst = 0, cells = 0;
  for (const d of [boxDomain(6, 5, 4, false), boxDomain(6, 6, 8, true), aztecDiamond(3)]) {
    for (let k = 0; k < 20; k++) {
      const voter = randomVoter(d, 3, function (x) { return x; }, 0, "rule" + k);
      const w = new Float64Array(3);
      for (let v = 0; v < d.n; v++) {
        voter.weights(v, w);
        const total = w[0] + w[1] + w[2], x = shares(d, voter.colors, 3, v);
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(w[c] / total - x[c]));
        cells++;
      }
    }
  }
  addRow("g(x) = x copies a random neighbor", worst < 1e-12,
         cells + " cells on a box, a torus with 8 neighbors and an Aztec diamond: the chance of each opinion is its " +
         "share of the neighbors, largest gap " + worst.toExponential(1) + ".");
}


/* 2. The update law, by chi-square. */
function testUpdateLaw() {
  const d = boxDomain(5, 5, 8, false), q = 4, trials = 20000;
  const cases = [
    { name: "g(x) = x², ε = 0.3", g: function (x) { return x * x; }, noise: 0.3 },
    { name: "g(x) = 1 − x, ε = 0", g: function (x) { return 1 - x; }, noise: 0 },
    { name: "g(x) = x + 0.2, ε = 0.1", g: function (x) { return x + 0.2; }, noise: 0.1 },
  ];
  for (const c of cases) {
    const v = 12;   // the middle cell, 8 neighbors
    const start = randomVoter(d, q, c.g, c.noise, "law" + c.name).colors;
    const x = shares(d, start, q, v);
    let sum = 0;
    for (let k = 0; k < q; k++) sum += c.g(x[k]);
    const expected = x.map(function (share) { return c.noise / q + (1 - c.noise) * c.g(share) / sum; });
    const seen = new Array(q).fill(0), random = new Math.seedrandom("trials" + c.name);
    for (let t = 0; t < trials; t++) {
      const voter = newVoter({ n: d.n, first: d.first, nbr: d.nbr, q: q, table: makeTable(c.g, 8),
                               noise: c.noise, colors: start, random: random });
      voter.update(v);
      seen[voter.colors[v]]++;
    }
    let chi = 0, bins = 0;
    for (let k = 0; k < q; k++) {
      const e = expected[k] * trials;
      if (e === 0) { if (seen[k] > 0) chi = Infinity; continue; }
      chi += (seen[k] - e) ** 2 / e;
      bins++;
    }
    const pValue = 1 - jStat.chisquare.cdf(chi, bins - 1);
    addRow("The update law: " + c.name, pValue > 0.001,
           "One cell, " + trials + " updates: seen " + seen.map(function (s) { return (s / trials).toFixed(3); }).join(", ") +
           ", exact " + expected.map(function (e) { return e.toFixed(3); }).join(", ") +
           "; chi-square p-value " + pValue.toFixed(3) + " (pass above 0.001).");
  }
}


/* 3. Who wins: the share of the degrees. */
function testWinner(name, d, ones) {
  const runs = 4000, random = new Math.seedrandom("winner" + name);
  const colors = new Uint8Array(d.n).fill(1);
  let degreeOnes = 0, degreeAll = 0;
  for (let v = 0; v < d.n; v++) {
    const deg = d.first[v + 1] - d.first[v];
    degreeAll += deg;
    if (ones.includes(v)) { colors[v] = 0; degreeOnes += deg; }
  }
  const exact = degreeOnes / degreeAll;
  let won = 0;
  for (let r = 0; r < runs; r++) {
    const voter = newVoter({ n: d.n, first: d.first, nbr: d.nbr, q: 2, table: makeTable(function (x) { return x; }, 8),
                             noise: 0, colors: colors, random: random });
    while (voter.counts[0] > 0 && voter.counts[0] < d.n) voter.update(Math.floor(random() * d.n));
    if (voter.counts[0] === d.n) won++;
  }
  const z = binomialZ(won, runs, exact);     // js/check-page.js
  addRow("Who wins: " + name, Math.abs(z) < 4,
         "Opinion 1 won " + won + " of " + runs + " runs (" + (won / runs).toFixed(3) + "); its share of the degrees is " +
         exact.toFixed(3) + ", " + Math.abs(z).toFixed(2) + " standard deviations away (pass below 4).");
}


/* 4. eps = 1: uniform opinions. */
function testFullNoise() {
  const d = boxDomain(20, 20, 4, true), q = 5;
  const voter = randomVoter(d, q, function (x) { return x; }, 1, "noise");
  voter.colors.fill(0);   // start far from uniform ...
  const random = new Math.seedrandom("noise updates");
  for (let k = 0; k < 10 * d.n; k++) voter.update(Math.floor(random() * d.n));
  const totals = new Array(q).fill(0), samples = 200;
  for (let s = 0; s < samples; s++) {
    for (let j = 0; j < 5; j++) voter.unitOfTime();   // 5 units apart: all but about 1% of cells fresh
    for (let c = 0; c < q; c++) totals[c] += voter.colors.filter(function (o) { return o === c; }).length;
  }
  const pValue = equalChiSquare(totals).pValue;     // js/check-page.js
  addRow("Noise ε = 1 gives uniform opinions", pValue > 0.001,
         "q = 5 on a 20 x 20 torus: shares " + totals.map(function (t) { return (t / (samples * d.n)).toFixed(3); }).join(", ") +
         "; chi-square p-value " + pValue.toFixed(3) + " (pass above 0.001).");
}


runChecksOnClick(function () {
  return [
    testVoterRule, testUpdateLaw,
    function () { testWinner("4 x 4 torus, 5 cells start with opinion 1", boxDomain(4, 4, 4, true), [0, 1, 2, 5, 9]); },
    function () { testWinner("4 x 3 box, the 4 corners start with opinion 1", boxDomain(4, 3, 4, false), [0, 3, 8, 11]); },
    function () { testWinner("4 x 3 box, the 2 middle cells start with opinion 1", boxDomain(4, 3, 4, false), [5, 6]); },
    testFullNoise,
  ];
});
