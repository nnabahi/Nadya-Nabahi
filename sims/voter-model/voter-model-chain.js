/* =====================================================================
   voter-model-chain.js  —  the opinions behind the "Generalized voter model"
   sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Every cell holds one of q opinions (colors). Each cell has its own
     clock that rings at rate 1 (exponential waiting times with mean 1).
     When cell v's clock rings, v looks at its neighbors: x_c is the
     share of them holding opinion c. Then:
       - with probability eps (the "noise"), v takes a uniformly random
         opinion, one of the q;
       - otherwise v takes opinion c with probability
             g(x_c) / ( g(x_1) + ... + g(x_q) ),
         for the function g you type (if all the g(x_c) are 0, v keeps
         its opinion).
     So g says how strongly a share of neighbors pulls. The weights are
     divided by their sum, as everywhere on this site.

     g(x) = x is the classical VOTER MODEL: v copies a uniformly chosen
     neighbor (P. Clifford and A. Sudbury, Biometrika 60 (1973)
     581-588; R. A. Holley and T. M. Liggett, Ann. Probab. 3 (1975)
     643-663). For two opinions, any rule where the chance to switch
     depends only on the share of neighbors that disagree is of this
     form, which is the "generalized voter model" of I. Dornic, H. Chate,
     J. Chave and H. Hinrichsen, Phys. Rev. Lett. 87 (2001) 045701:
     switching with probability f(share disagreeing), with
     f(x) + f(1 - x) = 1, is the rule above with g = f. Other choices:
     g(x) = x^a (the nonlinear q-voter model, C. Castellano, M. A. Munoz
     and R. Pastor-Satorras, Phys. Rev. E 80 (2009) 041129), majority
     rule, and g(x) = 1 - x (for two opinions, the anti-voter model:
     take the opinion OPPOSITE to a random neighbor's; N. Matloff, Ann.
     Probab. 5 (1977) 371-386). eps > 0 is the noisy voter model
     (B. L. Granovsky and N. Madras, Stochastic Process. Appl. 55 (1995)
     23-43).

   Continuous time, simulated exactly: the first of n rate-1 clocks
   rings after an Exp(n) time and is equally likely to be any of them,
   and the clocks have no memory (J. R. Norris, "Markov Chains",
   Cambridge 1997, Theorems 2.3.1 and 2.3.3). So the sim picks a
   uniformly random cell n times per unit of time. (The random walk
   coloring sim does the same with its walkers.)

   The page reads g with math.js and hands over a TABLE: a cell with d
   neighbors only ever needs g at x = 0, 1/d, 2/d, ..., 1, so
   table[d * (maxDegree + 1) + k] = g(k / d). makeTable builds it.

   The file has two parts, with no drawing and no buttons:
     1. makeTable, newVoter(options): the rule. The check page
        (sims/voter-model/voter-model-check.html) tests it in the browser.
     2. voterWorker(): runs it in a second thread (a "Web Worker") for
        the sim page, voter-model.js, so the page never freezes.
        startWorker (js/sim-page.js) starts it, with newVoter,
        voterStart and the run loop and trace (js/sim-worker.js) copied
        in.
   ===================================================================== */


/* =====================================================================
   1. THE RULE
   ===================================================================== */

// The table of g(k / d) for every degree d from 1 to maxDegree, and
// k = 0 .. d. g is a function of one number. Negative values, or ones
// that aren't numbers at all, count as 0; "problem" says if there were
// any.
function makeTable(g, maxDegree) {
  const table = new Float64Array((maxDegree + 1) * (maxDegree + 1));
  let problem = "";
  for (let d = 1; d <= maxDegree; d++) {
    for (let k = 0; k <= d; k++) {
      let value = Number(g(k / d));
      if (!isFinite(value) || value < 0) {
        problem = "g(" + (k / d).toFixed(3) + ") = " + value + " is not a number 0 or more; it counts as 0.";
        value = 0;
      }
      table[d * (maxDegree + 1) + k] = value;
    }
  }
  return { table: table, maxDegree: maxDegree, problem: problem };
}

// options: { n, first, nbr (the domain's neighbor lists, see
// js/sim-domains.js), q, table (from makeTable), noise (eps), colors
// (the start), random (uniform numbers in [0, 1)) }.
// Returns an object holding the opinions and the counts, with:
//   weights(v, out)  the weights g(x_c) of each opinion c for cell v
//   update(v)        cell v's clock rings
//   unitOfTime()     n updates of uniformly chosen cells
function newVoter(options) {
  const n = options.n, first = options.first, nbr = options.nbr, random = options.random;
  const voter = {
    q: options.q, table: options.table, noise: options.noise,
    colors: Uint8Array.from(options.colors),   // colors[v] = the opinion of cell v
    counts: new Int32Array(options.q),         // counts[c] = cells holding opinion c
    agree: 0,                                  // neighbor pairs that agree
    pairs: 0,                                  // all neighbor pairs
  };
  const neighborCounts = new Int32Array(options.q), w = new Float64Array(options.q);

  // The weight g(x_c) of each opinion c for cell v, into "out".
  voter.weights = function (v, out) {
    const d = first[v + 1] - first[v];
    neighborCounts.fill(0);
    for (let e = first[v]; e < first[v + 1]; e++) neighborCounts[voter.colors[nbr[e]]]++;
    const row = d * (voter.table.maxDegree + 1);
    for (let c = 0; c < voter.q; c++) out[c] = d === 0 ? 0 : voter.table.table[row + neighborCounts[c]];
    return out;
  };

  // Cell v's clock rings.
  voter.update = function (v) {
    let c = voter.colors[v];
    if (random() < voter.noise) {
      c = Math.floor(random() * voter.q);
    } else {
      voter.weights(v, w);
      let total = 0;
      for (let k = 0; k < voter.q; k++) total += w[k];
      if (total > 0) {
        let u = random() * total;
        c = 0;
        while (c < voter.q - 1 && u >= w[c]) { u -= w[c]; c++; }
      }
    }
    setColor(v, c);
  };

  // Cell v takes opinion c, keeping the counts up to date.
  function setColor(v, c) {
    const old = voter.colors[v];
    if (c === old) return;
    for (let e = first[v]; e < first[v + 1]; e++) {
      const other = voter.colors[nbr[e]];
      if (other === old) voter.agree--;
      if (other === c) voter.agree++;
    }
    voter.colors[v] = c;
    voter.counts[old]--;
    voter.counts[c]++;
  }

  voter.unitOfTime = function () {
    for (let k = 0; k < n; k++) voter.update(Math.floor(random() * n));
  };

  // Count everything from scratch (at the start).
  voter.counts.fill(0);
  for (let v = 0; v < n; v++) {
    voter.counts[voter.colors[v]]++;
    for (let e = first[v]; e < first[v + 1]; e++) {
      if (nbr[e] <= v) continue;
      voter.pairs++;
      if (voter.colors[nbr[e]] === voter.colors[v]) voter.agree++;
    }
  }
  return voter;
}

// The start: "random" (each cell a uniformly random opinion) or
// "stripes" (q equal stripes from left to right, by the cells' x).
function voterStart(n, xs, q, kind, random) {
  const colors = new Uint8Array(n);
  let xmin = Infinity, xmax = -Infinity;
  for (let v = 0; v < n; v++) { xmin = Math.min(xmin, xs[v]); xmax = Math.max(xmax, xs[v]); }
  for (let v = 0; v < n; v++) {
    colors[v] = kind === "random" ? Math.floor(random() * q)
      : Math.min(q - 1, Math.floor((xs[v] - xmin) / (xmax - xmin + 1) * q));
  }
  return colors;
}


/* =====================================================================
   2. THE WORKER: RUNNING IT IN A SECOND THREAD
   ---------------------------------------------------------------------
   The page sends:
     { type: "setup", run, n, first, nbr, x, q, table, noise, start, seed }
                                   a new run from the start
     { type: "params", table, noise }   a new g or eps; the run carries on
     { type: "play", speed }       run "speed" units of time per second
                                   (Infinity = as fast as possible)
     { type: "pause" }
     { type: "step" }              one unit of time
   The worker answers with "state" messages, each with its run number.
   It stops by itself at consensus (one opinion everywhere) when that
   can never change: no noise, and g(0) = 0, so no cell ever takes an
   opinion none of its neighbors hold.
   ===================================================================== */
function voterWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  let voter = null, run = 0, time = 0, consensusTime = null;

  // The run so far, for the plots over time (keepSample,
  // js/sim-worker.js).
  let trace = newTrace();

  function takeSample() {
    keepSample(trace, time, { disagree: 1 - voter.agree / Math.max(voter.pairs, 1), counts: voter.counts });
  }

  function consensus() { return Math.max(...voter.counts) === voter.colors.length; }

  // Can consensus never be left? No noise, and g(0) = 0 for every degree.
  function frozen() {
    if (voter.noise > 0 || !consensus()) return false;
    const t = voter.table;
    for (let d = 1; d <= t.maxDegree; d++) if (t.table[d * (t.maxDegree + 1)] > 0) return false;
    return true;
  }

  function setup(m) {
    run = m.run;
    const seed = String(m.seed);
    const colors = voterStart(m.n, m.x, m.q, m.start, new Math.seedrandom(seed + " start"));
    voter = newVoter({ n: m.n, first: m.first, nbr: m.nbr, q: m.q, table: m.table, noise: m.noise,
                       colors: colors, random: new Math.seedrandom(seed + " clocks") });
    time = 0;
    consensusTime = consensus() ? 0 : null;
    trace = newTrace();
    takeSample();
  }

  function oneUnit() {
    if (frozen()) return;
    voter.unitOfTime();
    time++;
    if (consensusTime === null && consensus()) consensusTime = time;
    takeSample();
  }

  // Play, Pause and Speed: the run loop (js/sim-worker.js). It stops by
  // itself once the run is frozen.
  const loop = makeRunLoop(oneUnit, report, frozen);
  let lastReported = -1;

  self.onmessage = function (event) {
    const m = event.data;
    if (m.type === "setup") { loop.pause(); setup(m); lastReported = -1; report(); }
    else if (m.type === "params") { voter.table = m.table; voter.noise = m.noise; lastReported = -1; report(); }
    else if (m.type === "play") loop.play(m.speed);
    else if (m.type === "pause") loop.pause();
    else if (m.type === "step") { oneUnit(); report(); }
  };

  function report() {
    if (time === lastReported) return;   // nothing new to show
    lastReported = time;
    const colors = voter.colors.slice();
    self.postMessage({
      type: "state", run: run, time: time, colors: colors, counts: voter.counts.slice(),
      agree: voter.agree, pairs: voter.pairs, consensusTime: consensusTime, frozen: frozen(),
      traceTimes: Float64Array.from(trace.times), traceDisagree: Float64Array.from(trace.lists.disagree),
      traceCounts: Int32Array.from(trace.lists.counts),
    }, [colors.buffer]);
  }
}
