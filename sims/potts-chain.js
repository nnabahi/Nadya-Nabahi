/* =====================================================================
   potts-chain.js  —  the Markov chains behind the "Ising and Potts
   model" sim
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

   The file has two parts, with no drawing and no buttons:
     1. newPotts(options): the two chains. The check page
        (sims/potts-check.html) tests them in the browser.
     2. pottsWorker(): runs a chain in a second thread (a "Web Worker")
        for the sim page, potts.js, so the page never freezes.
        startWorker (js/sim-page.js) starts it, with newPotts,
        pottsStart and the run loop and trace (js/sim-worker.js) copied
        in.
   ===================================================================== */


/* =====================================================================
   1. THE CHAINS
   ---------------------------------------------------------------------
   options: { n, first, nbr (the domain's neighbor lists, see
   js/sim-domains.js), q, beta, h, colors (the start, one color per
   cell), random (a function giving uniform numbers in [0, 1)) }.
   Returns an object holding the coloring and the counts, with:
     heatBath(v)       one heat-bath update of cell v
     sweep(dynamics)   one sweep: "heat" (n random updates) or "sw"
     colorWeights(v, weights)   the heat bath's weights for cell v
     recount()         count colors and agreeing pairs from scratch
   ===================================================================== */
function newPotts(options) {
  const n = options.n, first = options.first, nbr = options.nbr, random = options.random;
  const chain = {
    q: options.q, beta: options.beta, h: options.h,
    colors: Uint8Array.from(options.colors),   // colors[v] = the color of cell v
    counts: new Int32Array(options.q),         // counts[k] = cells of color k
    agree: 0,                                  // agreeing neighbor pairs
    pairs: 0,                                  // all neighbor pairs
  };
  const weights = new Float64Array(options.q);
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
    for (let k = 0; k < chain.q; k++) { out[k] *= chain.beta; most = Math.max(most, out[k]); }
    for (let k = 0; k < chain.q; k++) out[k] = Math.exp(out[k] - most);
    return out;
  };

  // One heat-bath update of cell v: a new color drawn with the weights.
  chain.heatBath = function (v) {
    chain.colorWeights(v, weights);
    let total = 0;
    for (let k = 0; k < chain.q; k++) total += weights[k];
    let u = random() * total, k = 0;
    while (k < chain.q - 1 && u >= weights[k]) { u -= weights[k]; k++; }
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
  };

  // The root of v's cluster (union-find, as in the percolation sims:
  // each cluster a little tree; halving the path on the way up).
  function root(v) {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  }

  // One Swendsen-Wang step.
  chain.swendsenWang = function () {
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
        const zero = a > 0 ? 1 / (1 + (chain.q - 1) * Math.exp(-a)) : Math.exp(a) / (Math.exp(a) + chain.q - 1);
        const u = random();
        newColor[r] = u < zero ? 0 : 1 + Math.min(chain.q - 2, Math.floor((u - zero) / (1 - zero) * (chain.q - 1)));
      }
      chain.colors[v] = newColor[r];
    }
    chain.recount();
  };

  // One sweep of either chain.
  chain.sweep = function (dynamics) {
    if (dynamics === "sw") { chain.swendsenWang(); return; }
    for (let k = 0; k < n; k++) chain.heatBath(Math.floor(random() * n));
  };

  // Count the colors and the agreeing pairs from scratch.
  chain.recount = function () {
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
  };

  chain.recount();
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
   The page sends:
     { type: "setup", run, n, first, nbr, q, beta, h, dynamics, start, seed }
                                       a new run from the start
     { type: "params", beta, h, dynamics }   new settings; the run carries on
     { type: "play", speed }           run "speed" sweeps per second
                                       (Infinity = as fast as possible)
     { type: "pause" }
     { type: "step" }                  one sweep
   The worker answers with "state" messages: the colors and the
   numbers for the Statistics quadrant, each with its run number, so
   the page can ignore leftovers from an older run.
   ===================================================================== */
function pottsWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  let chain = null, dynamics = "heat", run = 0, time = 0;

  // The run so far, for the plots over time (keepSample,
  // js/sim-worker.js).
  let trace = newTrace();

  function takeSample() {
    keepSample(trace, time, { agree: chain.agree / Math.max(chain.pairs, 1), counts: chain.counts });
  }

  function setup(m) {
    run = m.run;
    dynamics = m.dynamics;
    const seed = String(m.seed);
    // The start has its own random numbers, so changing the dynamics
    // never changes the start.
    const colors = pottsStart(m.n, m.q, m.start, new Math.seedrandom(seed + " start"));
    chain = newPotts({ n: m.n, first: m.first, nbr: m.nbr, q: m.q, beta: m.beta, h: m.h,
                       colors: colors, random: new Math.seedrandom(seed + " chain") });
    time = 0;
    trace = newTrace();
    takeSample();
  }

  function oneSweep() {
    chain.sweep(dynamics);
    time++;
    takeSample();
  }

  // Play, Pause and Speed: the run loop (js/sim-worker.js).
  const loop = makeRunLoop(oneSweep, report);
  let lastReported = -1;

  self.onmessage = function (event) {
    const m = event.data;
    if (m.type === "setup") { loop.pause(); setup(m); lastReported = -1; report(); }
    else if (m.type === "params") { chain.beta = m.beta; chain.h = m.h; dynamics = m.dynamics; }
    else if (m.type === "play") loop.play(m.speed);
    else if (m.type === "pause") loop.pause();
    else if (m.type === "step") { oneSweep(); report(); }
  };

  function report() {
    if (time === lastReported) return;   // nothing new to show
    lastReported = time;
    const colors = chain.colors.slice();
    self.postMessage({
      type: "state", run: run, time: time, colors: colors,
      counts: chain.counts.slice(), agree: chain.agree, pairs: chain.pairs,
      traceTimes: Float64Array.from(trace.times), traceAgree: Float64Array.from(trace.lists.agree),
      traceCounts: Int32Array.from(trace.lists.counts),
    }, [colors.buffer]);   // hand the copy over instead of copying again
  }
}
