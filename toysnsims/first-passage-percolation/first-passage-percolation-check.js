/* =====================================================================
   first-passage-percolation-check.js  —  the tests on
   first-passage-percolation-check.html
   ---------------------------------------------------------------------
   Tests of the code behind the First Passage Percolation sim: its
   passage times w, from the Random variables box (js/sim-random.js), and
   the model (first-passage-percolation-rule.js). The laws themselves,
   and the box, are tested on the Random variables check page
   (help/random-variables-check.html).

     1. The times: the U's the sim keeps for w ~ a law give the same
        times as the drawer works out at each edge (and cell), and a
        formula for w that comes out negative is refused.
     2. The random times the sim draws, one per edge of a big box: a
        Kolmogorov-Smirnov test against F for laws with a density (one
        of them w = min(a, b), a formula), and a chi-square test of the
        masses for the others (one of them nadya's example
          w ~ {x = 0: p_0, x = 3: p_3, x >= 5: (1 - p_0 - p_3) e^(-x + 5), 0}).
     3. Dijkstra's algorithm (newSearch) against the Bellman-Ford
        algorithm, a slower and plainer way to the same distances, on
        boxes, tori, tilings, a Penrose tiling, a hyperbolic ball and a
        tree, with the times on the edges and on the cells, and with
        laws that have ties and zeros. Every geodesic is a path of
        neighbors whose times add up to T, and the cells come in order
        of T.
     4. T is a distance: T(x, y) = T(y, x) with the times on the edges
        (on the cells, T(x, y) + tau_x = T(y, x) + tau_y, as the start's
        own time isn't paid), and T(x, z) <= T(x, y) + T(y, z).
     5. Eden growth: with exponential times on the cells, the ball grows
        like Eden's model (each new cell uniform among the cells next to
        the ball), and on the edges like Richardson's (each new cell
        picked in proportion to its edges to the ball). The first three
        cells to join are tallied over many seeds and compared with the
        exact odds by a chi-square test.
     6. Coupling: the same seed gives the same times; a box that grows,
        on squares, a tiling, a Penrose tiling and a hyperbolic ball,
        keeps every time it had; and moving a law's slider moves every
        time the same way.
     7. The whole plane: a box gives the plane's T for every cell found
        before the first cell on the box's edge (the rule the sim uses
        to know when to grow the box).
     8. The holes of the ball B(t), found by holeHistory (js/sim-shape.js)
        timed by T, against counting them plainly at many times t.
     9. The pairs: the first two cells of randomOrder are a uniformly
        random pair of cells.

   Random numbers come from the sim's own seededUniform (js/sim-worker.js)
   and from the library seedrandom, with fixed seeds, so the tests do the
   same thing every time. Chi-square p-values come from jStat; a test
   passes when p is above 0.001.
   ===================================================================== */


// Random variables typed as in the sim's box (js/sim-random.js), with
// the sliders' values "values".
function variablesOf(text, values) { return makeRandomVariables(readRandomVariables(text), values || {}); }

const EXPONENTIAL = variablesOf("w ~ exp(1)");
const GEOMETRIC = variablesOf("w ~ geometric(q)", { q: 0.5 });
const HERS = variablesOf("w ~ {x = 0: p_0, x = 3: p_3, x >= 5: (1 - p_0 - p_3) e^(-x + 5), 0}", { p_0: 0.2, p_3: 0.3 });

// The times of domain d with the U's of the seed, on the edges or the
// cells, for the random variables "variables" (as the sim finds them).
function timesOf(d, seed, onCells, variables) { return passageTimes(d, newWeights(d, seed, onCells), variables); }

// Every cell of a domain, 0 .. n-1.
function cellsOf(d) { return Array.from({ length: d.n }, function (_, v) { return v; }); }

// A number to 4 significant digits, as text.
function short(x) { return Number(x.toPrecision(4)).toString(); }


/* ---------------------------------------------------------------------
   1. The times
   --------------------------------------------------------------------- */
function testTimes() {
  // For w ~ a law the sim keeps one U per edge, and its time is F^-1(U):
  // the same number the drawer works out there, the slow way.
  const d = boxDomain(30, 30, 4, false);
  for (const onCells of [false, true]) {
    const weights = newWeights(d, "kept", onCells), times = passageTimes(d, weights, EXPONENTIAL);
    const drawer = newDrawer(EXPONENTIAL, "kept");
    let differ = 0;
    forEachPlace(d, weights.places, onCells, function (k, place) {
      drawer.at(...place);
      if (drawer.value("w", 0) !== times.tau[k]) differ++;
    });
    addRow("The kept U's give the drawer's times, on the " + (onCells ? "cells" : "edges"), differ === 0,
           "w ~ exp(1) on a 30 x 30 box: F^-1(U) against the drawer's w at each of the " + times.tau.length + " " +
           (onCells ? "cells" : "edge entries") + "; " + differ + " differ.");
  }

  // A formula for w that comes out negative somewhere.
  let refused = "";
  try { timesOf(d, "negative", false, variablesOf("w = n\nn ~ normal(0, 1)")); }
  catch (problem) { refused = problem.message; }
  addRow("A formula for w that comes out negative is refused", refused !== "",
         refused ? "w = n with n ~ normal(0, 1): \"" + refused + "\"" : "w = n with n ~ normal(0, 1) was taken.");
}


/* ---------------------------------------------------------------------
   2. The times the sim draws
   --------------------------------------------------------------------- */

// One time per edge of a 120 x 120 box (28,560 edges), as the sim draws
// them.
function drawnTimes(variables, seed) {
  const d = boxDomain(120, 120, 4, false), times = timesOf(d, seed, false, variables), sample = [];
  for (let v = 0; v < d.n; v++) for (let e = d.first[v]; e < d.first[v + 1]; e++) if (d.nbr[e] > v) sample.push(times.tau[e]);
  return sample;
}

// The Kolmogorov-Smirnov statistic of a sample against the distribution
// function G: the largest gap between G and the sample's own
// distribution function (A. Kolmogorov, Giorn. Ist. Ital. Attuari 4
// (1933) 83-91). For a sample from G, sqrt(n) D is above 1.949 with
// chance about 0.001 (the 0.999 point of Kolmogorov's limit law; N.
// Smirnov, Ann. Math. Statist. 19 (1948) 279-281).
function ksStatistic(sample, G) {
  const sorted = Float64Array.from(sample).sort(), n = sorted.length;
  let D = 0;
  for (let i = 0; i < n; i++) {
    const F = G(sorted[i]);
    D = Math.max(D, (i + 1) / n - F, F - i / n);
  }
  return Math.sqrt(n) * D;
}

function testDraws() {
  const continuous = [
    { name: "w ~ exp(1)", variables: EXPONENTIAL, G: function (x) { return 1 - Math.exp(-x); } },
    { name: "w ~ unif(0, 1)", variables: variablesOf("w ~ unif(0, 1)"), G: function (x) { return Math.min(1, Math.max(0, x)); } },
    { name: "the density x e^(-x), typed", variables: variablesOf("w ~ {x >= 0: x e^(-x), 0}"), G: function (x) { return 1 - Math.exp(-x) * (1 + x); } },
    { name: "w = min(a, b), a and b ~ exp(1) (so w ~ exp(2))", variables: variablesOf("w = min(a, b)\na ~ exp(1)\nb ~ exp(1)"),
      G: function (x) { return 1 - Math.exp(-2 * x); } },
  ];
  for (const c of continuous) {
    const k = ksStatistic(drawnTimes(c.variables, "ks " + c.name), c.G);
    addRow("The drawn times, " + c.name + " (Kolmogorov-Smirnov)", k < 1.949,
           "28,560 edge times: sqrt(n) D = " + short(k) + " (a correct sim is above 1.949 one time in 1000).");
  }

  // The geometric: how often each whole number comes.
  const geometric = drawnTimes(GEOMETRIC, "chi geometric"), odds = new Map(), seen = new Map();
  for (let k = 0; k <= 30; k++) odds.set(k, Math.pow(0.5, k + 1));
  for (const x of geometric) seen.set(x, (seen.get(x) || 0) + 1);
  let result = pooledChiSquare(odds, seen, geometric.length);
  addRow("The drawn times, w ~ geometric(1/2) (chi-square)", result.pValue > 0.001,
         "28,560 edge times in " + result.groups + " groups: p = " + short(result.pValue) + ".");

  // nadya's example: the two masses, and the density's part in pieces.
  const hers = drawnTimes(HERS, "chi hers"), cuts = [5, 5.5, 6, 7, 8, Infinity];
  const piece = function (x) { for (let k = 0; k + 1 < cuts.length; k++) if (x >= cuts[k] && x < cuts[k + 1]) return "[" + cuts[k] + "," + cuts[k + 1] + ")"; return "other"; };
  const hersOdds = new Map([["0", 0.2], ["3", 0.3]]), hersSeen = new Map();
  for (let k = 0; k + 1 < cuts.length; k++) {
    hersOdds.set("[" + cuts[k] + "," + cuts[k + 1] + ")", 0.5 * (Math.exp(5 - cuts[k]) - (cuts[k + 1] === Infinity ? 0 : Math.exp(5 - cuts[k + 1]))));
  }
  for (const x of hers) {
    const key = x === 0 ? "0" : x === 3 ? "3" : piece(x);
    hersSeen.set(key, (hersSeen.get(key) || 0) + 1);
  }
  result = pooledChiSquare(hersOdds, hersSeen, hers.length);
  addRow("The drawn times, nadya's example (chi-square)", result.pValue > 0.001 && !hersSeen.has("other"),
         "28,560 edge times: exactly 0, exactly 3, and 5 pieces of [5, infinity); p = " + short(result.pValue) +
         (hersSeen.has("other") ? "; " + hersSeen.get("other") + " fell where the law has nothing." : "."));
}


/* ---------------------------------------------------------------------
   3. Dijkstra against Bellman-Ford
   --------------------------------------------------------------------- */

// Domains of every kind the sim offers.
function testDomains() {
  return [
    { name: "12 x 10 box", d: boxDomain(12, 10, 4, false) },
    { name: "9 x 9 torus", d: boxDomain(9, 9, 4, true) },
    { name: "15 x 15 box centered on (0, 0)", d: boxDomain(15, 15, 4, false, true) },
    { name: "9 x 8 box of hexagons", d: tilingBox(tilingBlock("6/m30/r(h1)", false), 9, 8, false) },
    { name: "8 x 8 torus of the corners of triangles", d: tilingBox(tilingBlock("3/m30/r(h2)", true), 8, 8, true) },
    { name: "10 x 8 box of the rhombs (Penrose P3)", d: tilingBox(tilingBlock("Penrose P3", false), 10, 8, false) },
    { name: "ball of radius 3 of the {7, 3} tiling", d: makeBall(makeGraph({ kind: "tiling", p: 7, q: 3 }), 3, 1e6) },
    { name: "ball of radius 6 of the tree of degree 3", d: makeBall(makeGraph({ kind: "tiling", p: 3, q: Infinity }), 6, 1e6) },
  ];
}

// The passage times from "start" by the Bellman-Ford algorithm (R.
// Bellman, "On a routing problem", Quart. Appl. Math. 16 (1958) 87-90):
// lower each cell's time through each neighbor, over and over, until
// nothing changes. Slow, but plain.
function bellmanFord(d, times, start) {
  const T = new Float64Array(d.n).fill(Infinity);
  T[start] = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let v = 0; v < d.n; v++) {
      if (T[v] === Infinity) continue;
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e], t = T[v] + stepTime(times, e, w);
        if (t < T[w]) { T[w] = t; changed = true; }
      }
    }
  }
  return T;
}

// Is w a neighbor of v? Returns its entry e (d.nbr[e] = w), or -1.
function entryOf(d, v, w) {
  for (let e = d.first[v]; e < d.first[v + 1]; e++) if (d.nbr[e] === w) return e;
  return -1;
}

// What is wrong with a whole search from "start" ("" if nothing): its
// T against Bellman-Ford's, its order, and its geodesics.
function searchProblem(d, times, start) {
  const search = newSearch(d, times, start);
  while (search.next() !== -1);
  const T = bellmanFord(d, times, start);
  for (let v = 0; v < d.n; v++) {
    if (Math.abs(search.T[v] - T[v]) > 1e-9 * (1 + T[v]) && !(search.T[v] === Infinity && T[v] === Infinity)) {
      return "cell " + v + ": Dijkstra " + search.T[v] + ", Bellman-Ford " + T[v];
    }
  }
  for (let k = 1; k < search.order.length; k++) {
    if (search.T[search.order[k]] < search.T[search.order[k - 1]]) return "the cells don't come in order of T";
  }
  for (const v of search.order) {
    const path = geodesic(search, v);
    if (path[0] !== start || path[path.length - 1] !== v) return "the geodesic to cell " + v + " doesn't run from the start to it";
    let total = 0;
    for (let k = 0; k + 1 < path.length; k++) {
      const e = entryOf(d, path[k], path[k + 1]);
      if (e === -1) return "the geodesic to cell " + v + " jumps between cells that aren't neighbors";
      total += stepTime(times, e, path[k + 1]);
    }
    if (Math.abs(total - search.T[v]) > 1e-9 * (1 + total)) return "the geodesic to cell " + v + " takes " + total + ", not T = " + search.T[v];
  }
  return "";
}

function testDijkstra() {
  const laws = [["exponential", EXPONENTIAL], ["geometric (ties and zeros)", GEOMETRIC], ["nadya's example", HERS]];
  for (const { name, d } of testDomains()) {
    const problems = [];
    let runs = 0;
    for (const [lawName, variables] of laws) {
      for (const onCells of [false, true]) {
        for (let k = 0; k < 2; k++) {
          const times = timesOf(d, "dijkstra " + k, onCells, variables);
          const problem = searchProblem(d, times, (k * 37) % d.n);
          runs++;
          if (problem) problems.push(lawName + (onCells ? ", on cells: " : ", on edges: ") + problem);
        }
      }
    }
    addRow("Dijkstra = Bellman-Ford, " + name, problems.length === 0,
           problems.length === 0 ? runs + " searches (3 laws, times on the edges and on the cells, 2 seeds each), " + d.n +
             " cells: the same T everywhere, cells in order of T, and every geodesic a path of neighbors taking exactly T."
             : problems[0]);
  }
}


/* ---------------------------------------------------------------------
   4. T is a distance
   --------------------------------------------------------------------- */
function testDistance() {
  const d = boxDomain(14, 14, 4, false), random = new Math.seedrandom("distance");
  const pick = function () { return Math.floor(random() * d.n); };
  for (const onCells of [false, true]) {
    let bad = 0, checked = 0;
    for (let k = 0; k < 10; k++) {
      const times = timesOf(d, "distance " + k, onCells, EXPONENTIAL);
      for (let j = 0; j < 10; j++) {
        const x = pick(), y = pick(), z = pick();
        const xy = pathBetween(d, times, x, y).time, yx = pathBetween(d, times, y, x).time;
        const yz = pathBetween(d, times, y, z).time, xz = pathBetween(d, times, x, z).time;
        const own = function (v) { return onCells ? times.tau[v] : 0; };
        if (Math.abs((xy + own(x)) - (yx + own(y))) > 1e-9 || xz > xy + yz + 1e-9) bad++;
        checked++;
      }
    }
    addRow("T is a distance, times on the " + (onCells ? "cells" : "edges"), bad === 0,
           checked + " triples of cells x, y, z in a 14 x 14 box over 10 seeds: " +
           (onCells ? "T(x, y) + tau_x = T(y, x) + tau_y" : "T(x, y) = T(y, x)") + " and T(x, z) <= T(x, y) + T(y, z)" +
           (bad === 0 ? " every time." : "; " + bad + " broke it."));
  }
}


/* ---------------------------------------------------------------------
   5. Eden growth and Richardson's model
   --------------------------------------------------------------------- */

// The exact odds of each first three cells to join a ball grown from
// "start" in domain d, as a Map from "a,b,c" to its chance: each time,
// a cell next to the ball joins with chance in proportion to its
// weight, 1 (Eden) or its number of edges to the ball (Richardson).
function joinOdds(d, start, byEdges) {
  const odds = new Map();
  (function grow(ball, sequence, chance) {
    if (sequence.length === 3) { odds.set(sequence.join(), chance); return; }
    const weight = new Map();
    for (const v of ball) {
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (!ball.includes(w)) weight.set(w, byEdges ? (weight.get(w) || 0) + 1 : 1);
      }
    }
    let total = 0;
    for (const x of weight.values()) total += x;
    for (const [w, x] of weight) grow(ball.concat([w]), sequence.concat([w]), chance * x / total);
  })([start], [], 1);
  return odds;
}

function testEden() {
  const d = boxDomain(7, 7, 4, false, true), start = cellAt(d, 0, 0), RUNS = 20000;
  for (const onCells of [true, false]) {
    const odds = joinOdds(d, start, !onCells), seen = new Map();
    for (let k = 0; k < RUNS; k++) {
      const search = newSearch(d, timesOf(d, "eden " + k, onCells, EXPONENTIAL), start);
      for (let j = 0; j < 4; j++) search.next();
      const key = search.order.slice(1).join();
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const result = pooledChiSquare(odds, seen, RUNS);
    addRow(onCells ? "Exponential times on the cells = Eden growth" : "Exponential times on the edges = Richardson's model",
           result.pValue > 0.001,
           RUNS.toLocaleString() + " seeds on the square grid: the first three cells to join, against the exact odds (" +
           (onCells ? "each new cell uniform among the cells next to the ball" : "each new cell in proportion to its edges to the ball") +
           ", " + odds.size + " outcomes in " + result.groups + " groups): p = " + short(result.pValue) + ".");
  }
}


/* ---------------------------------------------------------------------
   6. Coupling
   --------------------------------------------------------------------- */

// Do domains "small" and "big" give the same U to every edge they share?
// sameCell(v) is the cell of "big" at cell v of "small"'s place (-1 if
// it has none). Returns the number of edges that differ (or that
// "big" lacks), and the number compared.
function edgesThatDiffer(small, big, sameCell, seed) {
  const a = newWeights(small, seed, false), b = newWeights(big, seed, false);
  let differ = 0, compared = 0;
  for (let v = 0; v < small.n; v++) {
    for (let e = small.first[v]; e < small.first[v + 1]; e++) {
      const V = sameCell(v), W = sameCell(small.nbr[e]), E = V === -1 || W === -1 ? -1 : entryOf(big, V, W);
      compared++;
      if (E === -1 || a.U[e] !== b.U[E]) differ++;
    }
  }
  return [differ, compared];
}

function testCoupling() {
  // The same seed, the same numbers; another seed, others.
  const d = boxDomain(20, 20, 4, false), one = newWeights(d, "7", false).U, again = newWeights(d, "7", false).U;
  const other = newWeights(d, "8", false).U;
  const same = one.every(function (u, e) { return u === again[e]; }), shared = one.filter(function (u, e) { return u === other[e]; }).length;
  addRow("The same seed gives the same times", same && shared === 0,
         "A 20 x 20 box: seed 7 twice gives the same " + one.length + " numbers; seeds 7 and 8 share " + shared + " of them.");

  // A box that grows keeps its numbers.
  const growing = [
    ["squares, 20 x 20 to 40 x 40", boxDomain(20, 20, 4, false, true), boxDomain(40, 40, 4, false, true),
      function (s, b) { return function (v) { return cellAt(b, s.x[v], s.y[v]); }; }],
    ["hexagons, 16 x 16 to 32 x 32", tilingBox(tilingBlock("6/m30/r(h1)", false), 16, 16, false, true),
      tilingBox(tilingBlock("6/m30/r(h1)", false), 32, 32, false, true),
      function (s, b) { return function (v) { return tilingCell(b, s.x[v], s.y[v], s.part[v]); }; }],
    ["kites and darts (Penrose P2), 12 x 12 to 24 x 24", tilingBox(tilingBlock("Penrose P2", false), 12, 12, false),
      tilingBox(tilingBlock("Penrose P2", false), 24, 24, false), samePlace],
    ["{7, 3} ball, radius 3 to 4", makeBall(makeGraph({ kind: "tiling", p: 7, q: 3 }), 3, 1e6),
      makeBall(makeGraph({ kind: "tiling", p: 7, q: 3 }), 4, 1e6), function () { return function (v) { return v; }; }],
  ];
  for (const [name, small, big, match] of growing) {
    const [differ, compared] = edgesThatDiffer(small, big, match(small, big), "grow");
    addRow("A growing domain keeps its times: " + name, differ === 0,
           compared + " edges of the smaller one: " + (differ === 0 ? "all keep their U." : differ + " changed."));
  }

  // Moving a slider moves every time the same way.
  const box = boxDomain(30, 30, 4, false), weights = newWeights(box, "slider", false);
  const uniformA = function (a) { return passageTimes(box, weights, variablesOf("w ~ {0 <= x <= a: 1 / a, 0}", { a: a })).tau; };
  const rate = function (r) { return passageTimes(box, weights, variablesOf("w ~ exp(r)", { r: r })).tau; };
  const [u1, u2] = [uniformA(1), uniformA(1.5)], [e1, e2] = [rate(1), rate(2)];
  let wrongWay = 0, worst = 0;
  for (let e = 0; e < u1.length; e++) {
    if (u2[e] < u1[e] || e2[e] > e1[e]) wrongWay++;
    worst = Math.max(worst, Math.abs(u2[e] - 1.5 * u1[e]));
    if (e1[e] > 0.01) worst = Math.max(worst, Math.abs(e2[e] / e1[e] - 0.5) * e1[e]);
  }
  addRow("Moving a slider moves every time the same way", wrongWay === 0 && worst < 1e-4,
         "On " + u1.length + " edge entries: uniform on [0, a], a from 1 to 1.5, makes every time 1.5 times longer, and the " +
         "exponential with rate r, r from 1 to 2, every time half as long (largest error " + short(worst) + "); " +
         wrongWay + " moved the other way.");
}

// For a tiling that never repeats: the cell of "big" with the same
// middle as cell v of "small" (its cells' numbers can differ).
function samePlace(small, big) {
  const at = new Map();
  for (let v = 0; v < big.n; v++) at.set(placeOf(big, v).join(), v);
  return function (v) { const w = at.get(placeOf(small, v).join()); return w === undefined ? -1 : w; };
}


/* ---------------------------------------------------------------------
   7. The whole plane
   --------------------------------------------------------------------- */
function testWholePlane() {
  const cases = [
    ["squares", boxDomain(21, 21, 4, false, true), boxDomain(61, 61, 4, false, true),
      function (s, b) { return function (v) { return cellAt(b, s.x[v], s.y[v]); }; }],
    ["triangles", tilingBox(tilingBlock("3/m30/r(h2)", false), 14, 14, false, true),
      tilingBox(tilingBlock("3/m30/r(h2)", false), 40, 40, false, true),
      function (s, b) { return function (v) { return tilingCell(b, s.x[v], s.y[v], s.part[v]); }; }],
  ];
  for (const [name, small, big, match] of cases) {
    const edge = edgeCells(small), sameCell = match(small, big);
    let bad = 0, found = 0;
    for (let k = 0; k < 10; k++) {
      const onCells = k % 2 === 1, seed = "plane " + k;
      const a = newSearch(small, timesOf(small, seed, onCells, EXPONENTIAL), middleCell(small));
      const b = newSearch(big, timesOf(big, seed, onCells, EXPONENTIAL), sameCell(middleCell(small)));
      while (a.peek() !== -1 && !edge[a.peek()]) a.next();
      while (b.order.length < a.order.length) b.next();
      for (const v of a.order) if (Math.abs(a.T[v] - b.T[sameCell(v)]) > 1e-12 || !b.settled[sameCell(v)]) bad++;
      found += a.order.length;
    }
    addRow("The whole plane, as a box that grows: " + name, bad === 0,
           "10 seeds (times on the edges and on the cells): the " + found.toLocaleString() + " cells a small box finds before " +
           "its first cell on the edge have the same T in a box three times bigger" + (bad === 0 ? "." : ", but " + bad + " didn't."));
  }
}

// The cell of a domain centered on 0 whose middle is nearest to 0.
function middleCell(d) {
  let best = 0, bestFar = Infinity;
  for (let v = 0; v < d.n; v++) {
    const [u, w] = cellMiddle(d, v), far = Math.hypot(u, w);
    if (far < bestFar) { best = v; bestFar = far; }
  }
  return best;
}


/* ---------------------------------------------------------------------
   8. The holes of B(t)
   --------------------------------------------------------------------- */
function testHoles() {
  const d = boxDomain(30, 30, 4, false), laws = [["exponential", EXPONENTIAL], ["geometric (cells join together)", GEOMETRIC]];
  for (const [name, variables] of laws) {
    let bad = 0, checked = 0;
    for (let k = 0; k < 4; k++) {
      const search = newSearch(d, timesOf(d, "holes " + k, false, variables), cellAt(d, 15, 15));
      while (search.next() !== -1);
      const set = { siteX: d.x, siteY: d.y, bornAt: search.T }, last = search.T[search.order[search.order.length - 1]];
      const holes = holeHistory(set, last);
      // At the time each 25th cell joins: beta_1 from the holes' births
      // and deaths, against counting the holes of the cells then.
      const times = search.order.filter(function (v, j) { return j % 25 === 0; }).map(function (v) { return search.T[v]; });
      const beta = bettiOverTime(holes, times);
      times.forEach(function (t, j) {
        const cells = search.order.filter(function (v) { return search.T[v] <= t; }).map(function (v) { return [d.x[v], d.y[v]]; });
        if (countHoles(cells) !== beta[j]) bad++;
        checked++;
      });
    }
    addRow("Holes of B(t), timed in t: " + name, bad === 0,
           checked + " times t over 4 seeds on a 30 x 30 box: the holes found going back in time = the holes counted plainly" +
           (bad === 0 ? " every time." : ", except " + bad + " times."));
  }
}


/* ---------------------------------------------------------------------
   9. The pairs
   --------------------------------------------------------------------- */
function testPairs() {
  const d = boxDomain(4, 4, 4, false), RUNS = 6000, firsts = new Array(16).fill(0), pairs = new Map();
  for (let k = 0; k < RUNS; k++) {
    const [a, b] = randomOrder(d, "pairs " + k, cellsOf(d));
    firsts[a]++;
    const key = Math.min(a, b) * 16 + Math.max(a, b);
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  const counts = [];
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) counts.push(pairs.get(a * 16 + b) || 0);
  const one = equalChiSquare(firsts), two = equalChiSquare(counts);
  addRow("The particles are uniform, and so are the pairs", one.pValue > 0.001 && two.pValue > 0.001,
         RUNS.toLocaleString() + " seeds on a 4 x 4 box: the first particle's cell (16 outcomes) p = " + short(one.pValue) +
         ", the first pair (120 outcomes) p = " + short(two.pValue) + ".");
}


runChecksOnClick(function () {
  return [testTimes, testDraws, testDijkstra, testDistance, testEden, testCoupling, testWholePlane, testHoles, testPairs];
});
