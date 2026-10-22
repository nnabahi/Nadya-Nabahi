/* =====================================================================
   ising-potts-chain.js  —  the Markov chains behind the "Ising & Potts
   Model" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Every cell v has one of q colors, sigma(v) in {0, ..., q-1}. Two
     neighbors with the same color "agree". The Potts model gives each
     coloring sigma the probability
         pi(sigma) = exp( beta * ( A(sigma) + h * N0(sigma) ) ) / Z,
     where A(sigma) is the number of agreeing neighbor pairs, N0(sigma)
     the number of cells of color 0 (shown as color 1 on the page), and
     Z the sum that makes the probabilities add up to 1. So colorings
     where neighbors agree are more likely, the more so the bigger
     beta ("one over the temperature"); h > 0 pushes cells toward color
     0. (R. B. Potts, "Some generalized order-disorder transformations",
     Proc. Cambridge Philos. Soc. 48 (1952) 106-109.)

     q = 2 is the Ising model (E. Ising, Z. Physik 31 (1925) 253-258):
     write s(v) = +1 for color 0 and -1 for color 1. Then "agree" is
     (1 + s(u) s(v)) / 2, so the Potts model at beta is the Ising model
     exp( (beta/2) * sum s(u) s(v) + (beta h / 2) * sum s(v) ) at
     Ising inverse temperature beta/2 and field h/2 (the constants
     cancel in Z).

   Two ways to sample it, both Markov chains whose long-run
   distribution is exactly pi:

   1. HEAT BATH (Glauber dynamics). Pick a cell v uniformly, forget its
      color, and draw a new one from pi given all the other cells:
          P(new color = k) is proportional to exp( beta * ( n_k + h [k = 0] ) ),
      where n_k is the number of v's neighbors with color k. This chain
      is reversible with respect to pi (R. J. Glauber, J. Math. Phys. 4
      (1963) 294-307; D. A. Levin, Y. Peres and E. L. Wilmer, "Markov
      Chains and Mixing Times", 2nd ed., AMS 2017, Section 3.3). One
      SWEEP is n such updates (n = the number of cells), so each cell
      is updated once per sweep on average.

   2. SWENDSEN-WANG (clusters). Each agreeing neighbor pair gets a
      "bond" with probability 1 - exp(-beta), independently. The bonds
      cut the domain into clusters, and each cluster gets a fresh color
      at once: color 0 with weight exp(beta h |C|) (|C| = its number of
      cells) and each other color with weight 1. This also leaves pi
      unchanged (R. H. Swendsen and J.-S. Wang, Phys. Rev. Lett. 58
      (1987) 86-88; the reason is the Fortuin-Kasteleyn "random cluster"
      coupling, R. G. Edwards and A. D. Sokal, Phys. Rev. D 38 (1988)
      2009-2012). It flips whole clusters at once, so near the critical
      point it is far faster than the heat bath. One SW step counts as
      one sweep.

   The file has three parts, with no drawing and no buttons:
     1. newPotts(options) and pottsStart: the two chains, and their
        start. The check page (ising-potts-check.html) tests them in
        the browser.
     2. pottsWorker(): runs a chain in a second thread (a "Web Worker")
        for the sim page, ising-potts.js, so the page never freezes.
        runInWorker (js/sim-page.js) starts it, with newPotts,
        pottsStart, the trace (js/sim-worker.js) and the domain
        counting (countPieces, js/sim-domains.js) copied in.
     3. The critical points beta_c known exactly: on the square grid,
        the triangular lattice, the honeycomb and (for q = 2) the
        kagome lattice. The check page tests them too.
   ===================================================================== */


/* =====================================================================
   1. THE CHAINS
   ---------------------------------------------------------------------
   options: { n, first, nbr (the domain's neighbor lists, see
   js/sim-domains.js), q, beta, h, colors (the start, one color per
   cell), random (a function giving uniform numbers in [0, 1)) }.
   Returns the chain: the coloring (colors) and its counts (counts,
   agree, pairs), beta and h (the page changes them as it runs), and
     sweep(dynamics)        one sweep: "heat" (n heat-bath updates) or "sw"
     colorWeights(v, out)   the heat bath's weights for cell v
   ===================================================================== */
function newPotts(options) {
  const n = options.n, first = options.first, nbr = options.nbr, q = options.q, random = options.random;
  const chain = {
    beta: options.beta, h: options.h,
    colors: Uint8Array.from(options.colors),   // colors[v] = the color of cell v
    counts: new Int32Array(q),                 // counts[k] = cells of color k
    agree: 0,                                  // agreeing neighbor pairs
    pairs: 0,                                  // all neighbor pairs
  };
  const weights = new Float64Array(q);
  const parent = new Int32Array(n), size = new Int32Array(n);   // for Swendsen-Wang
  const newColor = new Int16Array(n);

  // The weight of each color k for cell v, given its neighbors:
  // exp(beta * (n_k + h [k = 0])), written into "out". The largest
  // exponent is taken off first (it cancels when the weights are
  // divided by their sum), so exp never overflows.
  chain.colorWeights = function (v, out) {
    out.fill(0);
    for (let e = first[v]; e < first[v + 1]; e++) out[chain.colors[nbr[e]]] += 1;
    out[0] += chain.h;
    let most = -Infinity;
    for (let k = 0; k < q; k++) { out[k] *= chain.beta; most = Math.max(most, out[k]); }
    for (let k = 0; k < q; k++) out[k] = Math.exp(out[k] - most);
  };

  // One heat-bath update of cell v: a new color drawn with the weights.
  function heatBath(v) {
    chain.colorWeights(v, weights);
    let total = 0;
    for (let k = 0; k < q; k++) total += weights[k];
    let u = random() * total, k = 0;
    while (k < q - 1 && u >= weights[k]) { u -= weights[k]; k++; }
    const old = chain.colors[v];
    if (k === old) return;
    // Keep the counts up to date: v's neighbors of the old color stop
    // agreeing with it, those of the new color start.
    for (let e = first[v]; e < first[v + 1]; e++) {
      const c = chain.colors[nbr[e]];
      if (c === old) chain.agree--;
      if (c === k) chain.agree++;
    }
    chain.colors[v] = k;
    chain.counts[old]--;
    chain.counts[k]++;
  }

  // The root of v's cluster (union-find, as in the percolation sims:
  // each cluster a little tree; halving the path on the way up).
  function root(v) {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  }

  // One Swendsen-Wang step.
  function swendsenWang() {
    const bond = 1 - Math.exp(-chain.beta);
    for (let v = 0; v < n; v++) { parent[v] = v; size[v] = 1; newColor[v] = -1; }
    // Bonds between agreeing neighbors (each pair once: w > v).
    for (let v = 0; v < n; v++) {
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (w <= v || chain.colors[w] !== chain.colors[v] || random() >= bond) continue;
        let a = root(v), b = root(w);
        if (a === b) continue;
        if (size[a] < size[b]) { const t = a; a = b; b = t; }
        parent[b] = a;
        size[a] += size[b];
      }
    }
    // A fresh color for each cluster, chosen when its first cell is met:
    // color 0 with probability exp(a) / (exp(a) + q - 1), a = beta h |C|
    // (written so exp never overflows), else one of the other q - 1.
    for (let v = 0; v < n; v++) {
      const r = root(v);
      if (newColor[r] === -1) {
        const a = chain.beta * chain.h * size[r];
        const zero = a > 0 ? 1 / (1 + (q - 1) * Math.exp(-a)) : Math.exp(a) / (Math.exp(a) + q - 1);
        const u = random();
        newColor[r] = u < zero ? 0 : 1 + Math.min(q - 2, Math.floor((u - zero) / (1 - zero) * (q - 1)));
      }
      chain.colors[v] = newColor[r];
    }
    recount();
  }

  // Count the colors and the agreeing pairs from scratch.
  function recount() {
    chain.counts.fill(0);
    chain.agree = 0;
    chain.pairs = 0;
    for (let v = 0; v < n; v++) {
      chain.counts[chain.colors[v]]++;
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (w <= v) continue;
        chain.pairs++;
        if (chain.colors[w] === chain.colors[v]) chain.agree++;
      }
    }
  }

  // One sweep of either chain.
  chain.sweep = function (dynamics) {
    if (dynamics === "sw") swendsenWang();
    else for (let k = 0; k < n; k++) heatBath(Math.floor(random() * n));
  };

  recount();
  return chain;
}

// The starting coloring: "random" (each cell a uniform color) or "one"
// (every cell color 0).
function pottsStart(n, q, kind, random) {
  const colors = new Uint8Array(n);
  if (kind === "random") for (let v = 0; v < n; v++) colors[v] = Math.floor(random() * q);
  return colors;
}


/* =====================================================================
   2. THE WORKER: RUNNING A CHAIN IN A SECOND THREAD
   ---------------------------------------------------------------------
   It talks to the page the way every sim's worker does (serveRun,
   js/sim-worker.js). Its own messages:
     setup    { n, first, nbr, q, beta, h, dynamics, start, seed }
              a new run from the start
     params   { beta, h, dynamics }   new settings; the run carries on
   One step is one sweep. It reports the colors and the numbers for
   the Statistics box.
   ===================================================================== */
function pottsWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  let chain = null, dynamics = "heat", time = 0;
  let graph = null;          // the domain's cells and neighbors, for counting its domains
  let trace = null;          // the run so far, for the charts over time (keepSample, js/sim-worker.js)

  // A sample for the charts. The domains (connected pieces of one
  // color) of each color are counted only when a sample is due
  // (countPieces, js/sim-domains.js), since that looks at every cell.
  function takeSample() {
    keepSample(trace, time, function () {
      return { agree: chain.agree / Math.max(chain.pairs, 1), counts: chain.counts,
               pieces: countPieces(graph, chain.colors, chain.counts.length) };
    });
  }

  function setup(m) {
    dynamics = m.dynamics;
    graph = { n: m.n, first: m.first, nbr: m.nbr };
    // The start has its own random numbers, so changing the dynamics
    // never changes the start.
    const colors = pottsStart(m.n, m.q, m.start, new Math.seedrandom(m.seed + " start"));
    chain = newPotts({ n: m.n, first: m.first, nbr: m.nbr, q: m.q, beta: m.beta, h: m.h,
                       colors: colors, random: new Math.seedrandom(m.seed + " chain") });
    time = 0;
    trace = newTrace();
    takeSample();
  }

  function oneSweep() {
    chain.sweep(dynamics);
    time++;
    takeSample();
  }

  function report(send) {
    const colors = chain.colors.slice();
    send({
      time: time, colors: colors, counts: chain.counts.slice(), agree: chain.agree, pairs: chain.pairs,
      traceTimes: Float64Array.from(trace.times), traceAgree: Float64Array.from(trace.lists.agree),
      traceCounts: Int32Array.from(trace.lists.counts), tracePieces: Int32Array.from(trace.lists.pieces),
    }, [colors.buffer]);
  }

  serveRun({
    setup: setup, steps: oneSweep, report: report,
    messages: {
      params: function (m) { chain.beta = m.beta; chain.h = m.h; dynamics = m.dynamics; },
    },
  });
}


/* =====================================================================
   3. THE CRITICAL POINTS KNOWN EXACTLY
   ---------------------------------------------------------------------
   With v = e^beta - 1, the critical point beta_c solves
       v = sqrt(q)               on the square grid,
       v^3 + 3v^2 = q            on the triangular lattice,
       v^3 = 3qv + q^2           on the honeycomb,
   for every q >= 1 (V. Beffara and H. Duminil-Copin, Probab. Theory
   Related Fields 153 (2012) 511-542; R. J. Baxter, H. N. V. Temperley
   and S. E. Ashley, Proc. R. Soc. Lond. A 358 (1978) 535-559). The
   triangular lattice and the honeycomb are dual to each other, and
   their two v's multiply to q; the square grid is its own dual. On the
   kagome lattice, beta_c is known for the Ising model (q = 2) only:
   (1/2) log(3 + 2 sqrt 3) (I. Syozi, Prog. Theor. Phys. 6 (1951)
   306-308; this page's beta is twice the Ising one).
   ===================================================================== */

// The lattices where beta_c is known, among the tilings (js/sim-tilings.js),
// by the tiling's code and whether its tiles or its corners are the
// cells. The tiles of triangles and the corners of hexagons make the
// same graph (the honeycomb), and so do the tiles of hexagons and the
// corners of triangles (the triangular lattice). Each is a key of
// EXACT_BETA.
const TILING_CRITICAL = {
  "3/m30/r(h2)": { tiles: "honeycomb", corners: "triangular" },   // triangles
  "6/m30/r(h1)": { tiles: "triangular", corners: "honeycomb" },   // hexagons
  "6-3-6/m30/r(v4)": { corners: "kagome" },                       // kagome (3.6.3.6)
};

// beta_c with q colors on each lattice, as [its formula, its value, what
// v is (if the formula has a v)], or null if it isn't known.
const EXACT_BETA = {
  square: function (q) { return ["log(1 + √" + q + ")", Math.log(1 + Math.sqrt(q)), ""]; },
  triangular: function (q) { return ["log(1 + v)", Math.log(1 + triangularV(q)), "v³ + 3v² = " + q]; },
  honeycomb: function (q) { return ["log(1 + v)", Math.log(1 + q / triangularV(q)), "v³ = " + 3 * q + "v + " + q * q]; },
  kagome: function (q) { return q === 2 ? ["½ log(3 + 2√3)", Math.log(3 + 2 * Math.sqrt(3)) / 2, ""] : null; },
};

// The v > 0 with v^3 + 3v^2 = q, found by halving an interval that holds
// it: the left side grows with v, from 0 at v = 0 to more than q at
// v = q. (On the honeycomb, v is q over this.)
function triangularV(q) {
  let low = 0, high = q;
  for (let k = 0; k < 60; k++) {
    const middle = (low + high) / 2;
    if (middle * middle * (middle + 3) < q) low = middle; else high = middle;
  }
  return (low + high) / 2;
}
