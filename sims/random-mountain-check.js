/* =====================================================================
   random-mountain-check.js  —  the tests on random-mountain-check.html
   ---------------------------------------------------------------------
   Three kinds of test of the growth rule in random-mountain-growth.js:

     1. Same mountain as nadya's Python. Her randmountain.py and
        randonesidedmountain.py turn a list of uniform numbers u into a
        mountain. Given the same u's, the JavaScript must give exactly
        the same heights. Two runs are built in (their heights were
        computed with her own runsim functions), and a box lets her
        paste a run of her own.

     2. Exact odds on small cases. For a few steps, every possible run
        can be listed, with its probability (each step picks one of |S|
        sites, so a run has probability 1/|S_0| * 1/|S_1| * ...). This
        listing is written separately, straight from the definition, so
        it does not share code with the sim. Then the sim is run many
        times, and Pearson's chi-square test (K. Pearson, Philosophical
        Magazine 50 (1900) 157-175) says whether the counts of each
        final mountain match the exact odds. Outcomes expected fewer
        than 5 times are pooled into one group, the usual rule
        (W. G. Cochran, "Some methods for strengthening the common chi-square
        tests", Biometrics 10 (1954) 417-451). The p-value comes from the library jStat.

     3. Invariants: facts that must hold after every step of a long run
        (see checkInvariants below).

     4. The mountain on a graph (newGraphMountain, with the graphs of
        js/sim-graphs.js):
          - on the line and the square grid, with tile "every cell within
            distance 1", it must give exactly the same mountain as 1D
            (T = {-1, +1}) and 2D (4 neighbors), block for block, from
            the same random numbers;
          - exact odds on regular trees, listed from a tree built
            separately (cell k's children are 3k+1, 3k+2, ...), not from
            the drawing code;
          - the hyperbolic tilings and trees are what they should be:
            every cell has p different neighbors, being neighbors goes
            both ways, neighboring cells' middles are exactly twice the
            inradius apart, q cells meet at every corner (tilings), and
            there are no loops (trees);
          - far from the start (60 steps out), where cells are built from
            the tiling's rules alone, every corner still has exactly q
            cells around it;
          - the same invariants as in 3.
   ===================================================================== */


/* ===================================================================
   1. SAME MOUNTAIN AS NADYA'S PYTHON
   =================================================================== */

// Runs computed with nadya's runsim functions, given these u's.
// h[k] is the height at x = k - numsteps (two-sided) or x = k (one-sided).
const pythonRuns = [
  {
    name: "randmountain.py (two-sided), 15 steps",
    file: "two",
    u: [0.119, 0.503, 0.512, 0.86, 0.103, 0.223, 0.601, 0.557, 0.783, 0.548, 0.731, 0.768, 0.751, 0.587, 0.24],
    h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 7, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "randonesidedmountain.py (one-sided), 15 steps",
    file: "one",
    u: [0.614, 0.111, 0.817, 0.45, 0.815, 0.685, 0.679, 0.21, 0.252, 0.98, 0.929, 0.805, 0.999, 0.514, 0.076],
    h: [3, 4, 1, 3, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
];

// Grow the mountain for one of her files with the given u's, and
// compare with her heights h. Returns "" if they match, else what differs.
function compareWithPython(file, u, h) {
  const numsteps = u.length;
  const twoSided = file === "two";
  const expectedLength = twoSided ? 2 * numsteps + 1 : numsteps + 1;
  if (h.length !== expectedLength) {
    return "Her h has " + h.length + " numbers; with " + numsteps + " u's it should have " + expectedLength + ".";
  }
  const m = newMountain({
    dim: 1,
    tile: twoSided ? [[-1], [1]] : [[1]],
    domain: { kind: "whole" },
    start: [0],
  });
  for (const value of u) m.step(value);

  const differences = [];
  for (let k = 0; k < h.length; k++) {
    const x = twoSided ? k - numsteps : k;
    if (m.heightAt(x) !== h[k]) differences.push("x = " + x + ": Python " + h[k] + ", JavaScript " + m.heightAt(x));
  }
  return differences.join("; ");
}


/* ===================================================================
   2. EXACT ODDS ON SMALL CASES
   =================================================================== */

// The small cases. For each: the sim's options (as in newMountain)
// and the number of steps to list exactly.
const smallCases = [
  { name: "Two-sided mountain, T = {-1, +1}",   steps: 6, dim: 1, tile: [[-1], [1]],  domain: { kind: "whole" }, start: [0] },
  { name: "One-sided mountain, T = {+1}",       steps: 7, dim: 1, tile: [[1]],        domain: { kind: "whole" }, start: [0] },
  { name: "Uneven tile T = {-2, +1}",           steps: 5, dim: 1, tile: [[-2], [1]],  domain: { kind: "whole" }, start: [0] },
  { name: "Two-sided on the segment -2..2",     steps: 6, dim: 1, tile: [[-1], [1]],
    domain: { kind: "box", xmin: -2, xmax: 2, ymin: 0, ymax: 0, torus: false }, start: [0] },
  { name: "Two-sided on a cycle of 5 sites",    steps: 6, dim: 1, tile: [[-1], [1]],
    domain: { kind: "box", xmin: 0, xmax: 4, ymin: 0, ymax: 0, torus: true }, start: [0] },
  { name: "2D mountain, 4 neighbors",           steps: 4, dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    domain: { kind: "whole" }, start: [0, 0] },
  { name: "2D, 8 neighbors",                    steps: 3, dim: 2,
    tile: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    domain: { kind: "whole" }, start: [0, 0] },
  { name: "2D, 4 neighbors, 3 x 3 torus",       steps: 5, dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    domain: { kind: "box", xmin: 0, xmax: 2, ymin: 0, ymax: 2, torus: true }, start: [0, 0] },
  { name: "2D, 4 neighbors, drawn L-shaped region", steps: 4, dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    domain: { kind: "cells", wrap: null, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] }, start: [0, 0] },
];

// The final mountain as text, e.g. "-1,0:2 0,0:3 1,0:1", so equal
// mountains give equal text.
function describe(heights) {
  return Array.from(heights.keys()).sort().map(function (k) { return k + ":" + heights.get(k); }).join(" ");
}

// The site (x, y) of domain d as text "x,y", after wrapping around on
// a torus; null if it is outside the domain. Written straight from the
// definition of the domains, without the sim's code, for the two tests
// below.
function siteKey(d, x, y) {
  if (d.kind === "box" && d.torus) {
    const w = d.xmax - d.xmin + 1, h = d.ymax - d.ymin + 1;
    x = d.xmin + (((x - d.xmin) % w) + w) % w;
    y = d.ymin + (((y - d.ymin) % h) + h) % h;
  }
  if (d.kind === "box" && (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax)) return null;
  if (d.kind === "cells" && !d.cells.some(function (p) { return p[0] === x && p[1] === y; })) return null;
  return x + "," + y;
}

// The exact odds, straight from the definition: every run of "steps"
// steps, as a Map from describe(final mountain) to its probability.
// Written on its own, without newMountain, so the two can be compared.
function exactOdds(c) {
  function site(x, y) { return siteKey(c.domain, x, y); }
  // The available sites for a mountain: the start, and base + T.
  function availableSites(heights) {
    const s = new Set([site(c.start[0], c.start[1] || 0)]);
    for (const key of heights.keys()) {
      const [x, y] = key.split(",").map(Number);
      for (const t of c.tile) {
        const n = site(x + t[0], y + (t[1] || 0));
        if (n !== null) s.add(n);
      }
    }
    return Array.from(s);
  }

  const odds = new Map();
  function grow(heights, stepsLeft, probability) {
    if (stepsLeft === 0) {
      const key = describe(heights);
      odds.set(key, (odds.get(key) || 0) + probability);
      return;
    }
    const sites = availableSites(heights);
    for (const s of sites) {
      const next = new Map(heights);
      next.set(s, (next.get(s) || 0) + 1);
      grow(next, stepsLeft - 1, probability / sites.length);
    }
  }
  grow(new Map([[site(c.start[0], c.start[1] || 0), 1]]), c.steps, 1);
  return odds;
}

// Run the sim "runs" times and compare with the exact odds.
function chiSquareTest(c, runs) {
  const odds = exactOdds(c);
  const counts = new Map();
  for (let r = 0; r < runs; r++) {
    const m = newMountain(c);
    for (let k = 0; k < c.steps; k++) m.step(Math.random());
    const heights = new Map();
    for (let i = 0; i < m.height.length; i++) {
      if (m.height[i] > 0) heights.set(m.siteX[i] + "," + m.siteY[i], m.height[i]);
    }
    const key = describe(heights);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return pearson(odds, counts, runs);
}

// Pearson's test of the counts against the exact odds (pooledChiSquare,
// js/check-page.js). A mountain the exact listing says is impossible is
// a failure at once.
function pearson(odds, counts, runs) {
  for (const key of counts.keys()) {
    if (!odds.has(key)) return { pass: false, text: "The sim made a mountain that is impossible: " + key };
  }
  const test = pooledChiSquare(odds, counts, runs);
  return {
    pass: test.pValue > 0.001,
    text: odds.size + " possible mountains, " + runs + " runs: chi-square " + test.statistic.toFixed(1) +
          " with " + test.degrees + " degrees of freedom, p = " + test.pValue.toFixed(3),
  };
}


/* ===================================================================
   3. INVARIANTS
   -------------------------------------------------------------------
   After every step of a long run:
     - blocks = steps + 1, and the heights add up to the blocks;
     - the base size and the largest height are right;
     - no site is available twice, and in 1D the list is left to right.
   Every 500 steps, the available sites are worked out again from
   scratch ({start} and base + T, inside the domain) and compared.
   =================================================================== */
function checkInvariants(c, steps) {
  const m = newMountain(c);
  const d = c.domain;
  for (let k = 1; k <= steps; k++) {
    m.step(Math.random());
    let total = 0, base = 0, highest = 0;
    for (const h of m.height) { total += h; if (h > 0) base += 1; if (h > highest) highest = h; }
    if (m.steps !== k || m.blocks !== k + 1 || total !== k + 1) return "step " + k + ": the blocks don't add up";
    if (m.baseSize !== base) return "step " + k + ": wrong base size";
    if (m.maxHeight !== highest) return "step " + k + ": wrong largest height";
    if (new Set(m.available).size !== m.available.length) return "step " + k + ": a site is available twice";
    if (c.dim === 1) {
      for (let j = 1; j < m.available.length; j++) {
        if (m.siteX[m.available[j - 1]] >= m.siteX[m.available[j]]) return "step " + k + ": 1D list not left to right";
      }
    }
    if (k % 500 === 0) {
      const should = new Set([m.siteX[m.start] + "," + m.siteY[m.start]]);
      for (let i = 0; i < m.height.length; i++) {
        if (m.height[i] === 0) continue;
        for (const t of c.tile) {
          const key = siteKey(d, m.siteX[i] + t[0], m.siteY[i] + (t[1] || 0));
          if (key !== null) should.add(key);
        }
      }
      const actual = new Set(m.available.map(function (i) { return m.siteX[i] + "," + m.siteY[i]; }));
      if (actual.size !== should.size || Array.from(should).some(function (s) { return !actual.has(s); })) {
        return "step " + k + ": the available sites are wrong";
      }
    }
  }
  return "";
}


/* ===================================================================
   4. THE MOUNTAIN ON A GRAPH
   =================================================================== */

// 4a. Same as 1D and 2D. Grow both mountains with the same random
// numbers and compare every site's height. "oneOrTwo" is the 1D or 2D
// mountain's options, "graphOptions" the graph mountain's.
function sameAsFlat(oneOrTwo, graphOptions, steps) {
  const flat = newMountain(oneOrTwo), onGraph = newGraphMountain(graphOptions);
  for (let k = 0; k < steps; k++) {
    const u = Math.random();
    flat.step(u);
    onGraph.step(u);
  }
  if (flat.siteX.length !== onGraph.siteNode.length) {
    return flat.siteX.length + " sites in " + oneOrTwo.dim + "D, " + onGraph.siteNode.length + " on the graph";
  }
  for (let i = 0; i < onGraph.siteNode.length; i++) {
    const [x, y] = onGraph.graph.place(onGraph.siteNode[i]);
    if (flat.heightAt(x, y) !== onGraph.height[i]) {
      return "different height at (" + x + ", " + y + "): " + flat.heightAt(x, y) + " and " + onGraph.height[i];
    }
  }
  return "";
}

// 4b. Exact odds on the regular tree of degree d, with tile "every
// cell within distance r". The tree is built here on its own: cell 0
// has children 1 .. d, and every other cell k has children
// (d-1) k + 2 .. (d-1) k + d, so its neighbors are its parent and its
// children. A final mountain is described by the depth and height of
// each cell with a block (the sim numbers its cells differently, so
// that is what the two can be compared on).
function treeParent(d, k) {
  return k <= d ? 0 : Math.floor((k - 2) / (d - 1));
}
function treeNeighbors(d, k) {
  const children = [];
  const first = k === 0 ? 1 : (d - 1) * k + 2, count = k === 0 ? d : d - 1;
  for (let c = 0; c < count; c++) children.push(first + c);
  if (k === 0) return children;
  return [treeParent(d, k)].concat(children);     // the parent first
}
function treeDepth(d, k) {
  let depth = 0;
  while (k !== 0) { k = treeParent(d, k); depth++; }
  return depth;
}
function treeBall(d, k, r) {
  const seen = new Set([k]);
  let layer = [k];
  for (let step = 0; step < r; step++) {
    const next = [];
    for (const u of layer) for (const w of treeNeighbors(d, u)) if (!seen.has(w)) { seen.add(w); next.push(w); }
    layer = next;
  }
  seen.delete(k);
  return Array.from(seen);
}
// "depth:height" for every cell with a block, sorted, as one text.
function describeByDepth(pairs) {
  return pairs.map(function (p) { return p[0] + ":" + p[1]; }).sort().join(" ");
}
function exactTreeOdds(d, r, steps) {
  const odds = new Map();
  function grow(heights, stepsLeft, probability) {
    if (stepsLeft === 0) {
      const key = describeByDepth(Array.from(heights).map(function (e) { return [treeDepth(d, e[0]), e[1]]; }));
      odds.set(key, (odds.get(key) || 0) + probability);
      return;
    }
    const sites = new Set([0]);
    for (const k of heights.keys()) for (const w of treeBall(d, k, r)) sites.add(w);
    for (const sSite of sites) {
      const next = new Map(heights);
      next.set(sSite, (next.get(sSite) || 0) + 1);
      grow(next, stepsLeft - 1, probability / sites.size);
    }
  }
  grow(new Map([[0, 1]]), steps, 1);
  return odds;
}
function treeChiSquare(d, r, steps, runs) {
  const odds = exactTreeOdds(d, r, steps);
  const counts = new Map();
  // One tree for all the runs (much faster than a new one each time),
  // and every cell's depth, out as far as a base can reach.
  const tree = makeGraph({ kind: "tiling", p: d, q: Infinity });
  const depths = graphDepths(tree, 0, steps * r + 1);
  for (let run = 0; run < runs; run++) {
    const m = newGraphMountain({ graph: tree, radius: r, domain: { kind: "whole" } });
    for (let k = 0; k < steps; k++) m.step(Math.random());
    const pairs = [];
    for (let i = 0; i < m.height.length; i++) if (m.height[i] > 0) pairs.push([depths.get(m.siteNode[i]), m.height[i]]);
    const key = describeByDepth(pairs);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return pearson(odds, counts, runs);
}

// The distance from cell v to every cell within "far" of it, on a graph
// from makeGraph (a breadth-first search).
function graphDepths(graph, v, far) {
  const depth = new Map([[v, 0]]);
  let layer = [v];
  for (let step = 1; step <= far; step++) {
    const next = [];
    for (const u of layer) for (const w of graph.neighbors(u)) if (!depth.has(w)) { depth.set(w, step); next.push(w); }
    layer = next;
  }
  return depth;
}


// 4c. The tilings and trees. The hyperbolic distance between points z
// and w of the disk is 2 artanh(|z - w| / |1 - conj(z) w|) (Beardon,
// "The Geometry of Discrete Groups", Springer 1983, Chapter 7).
function diskDistance(z, w) {
  const dx = z[0] - w[0], dy = z[1] - w[1];
  const cr = 1 - (z[0] * w[0] + z[1] * w[1]), ci = -(z[0] * w[1] - z[1] * w[0]);   // 1 - conj(z) w
  return 2 * Math.atanh(Math.hypot(dx, dy) / Math.hypot(cr, ci));
}
function checkTiling(p, q, layers) {
  const graph = makeGraph({ kind: "tiling", p: p, q: q });
  const shape = graph.shape;
  const depth = graphDepths(graph, 0, layers);
  const cells = Array.from(depth.keys());
  const middle = function (v) { return motionApply(graph.place(v), 0, 0); };
  let edges = 0;
  for (const v of cells) {
    if (depth.get(v) === layers) continue;               // its neighbors may not all be listed yet
    const nbrs = graph.neighbors(v);
    if (nbrs.length !== p || new Set(nbrs).size !== p) return "cell " + v + " has " + new Set(nbrs).size + " different neighbors, not " + p;
    for (const w of nbrs) {
      if (!graph.neighbors(w).includes(v)) return "cell " + w + " is next to " + v + ", but not the other way";
      const gap = diskDistance(middle(v), middle(w));
      if (Math.abs(gap - 2 * shape.inradius) > 1e-7) return "middles of cells " + v + " and " + w + " are " + gap + " apart, not " + 2 * shape.inradius;
      if (depth.get(w) < layers) edges++;
    }
  }
  if (q === Infinity) {
    // A tree: the cells within layers - 1, and the sides between them,
    // must have no loops: (sides) = (cells) - 1.
    const inner = cells.filter(function (v) { return depth.get(v) < layers; }).length;
    if (edges / 2 !== inner - 1) return (edges / 2) + " sides between " + inner + " cells: there is a loop";
    return "";
  }
  // A tiling: every corner of the first cell and its neighbors is a
  // corner of exactly q cells. (The q cells around a corner are at most
  // q / 2 steps apart, so all of them are within "layers" = 6 of the
  // first cell.) A corner of the first cell is at hyperbolic
  // distance R from its middle, cosh R = cot(pi/p) cot(pi/q), at the
  // angles between the sides' middles.
  const R = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q))), rho = Math.tanh(R / 2);
  const corners = function (v) {
    const list = [];
    for (let k = 0; k < p; k++) {
      const angle = (2 * k + 1) * Math.PI / p;
      list.push(motionApply(graph.place(v), rho * Math.cos(angle), rho * Math.sin(angle)));
    }
    return list;
  };
  for (const v of cells) {
    if (depth.get(v) > 1) continue;
    for (const c of corners(v)) {
      let meeting = 0;
      for (const w of cells) {
        if (corners(w).some(function (d) { return diskDistance(c, d) < 1e-7; })) meeting++;
      }
      if (meeting !== q) return "a corner of cell " + v + " is shared by " + meeting + " cells, not " + q;
    }
  }
  return "";
}

// Far from the start, where the cells are built by the tiling's rules
// alone (see tilingRules in js/sim-graphs.js): walk 60 steps out, never
// back to a cell's parent, 100 times, and check every corner of the
// cell reached: going around it (each time crossing the side just after
// the one we came in by) must come back after exactly q cells.
function checkFar(p, q) {
  const graph = makeGraph({ kind: "tiling", p: p, q: q });
  if (!graph.exact) return "this tiling is built by geometry, not by rules";
  let seed = 1;                                // a fixed sequence of random numbers
  const random = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let walk = 0; walk < 100; walk++) {
    let v = 0;
    for (let step = 0; step < 60; step++) v = graph.neighbors(v)[1 + Math.floor(random() * (p - 1))];
    for (let side = 0; side < p; side++) {
      let x = v, across = side, count = 0;
      do {
        const y = graph.neighbors(x)[across];
        across = (graph.neighbors(y).indexOf(x) + 1) % p;
        x = y;
        count++;
      } while (x !== v && count <= q);
      if (x !== v || count !== q) return "a corner of cell " + v + " (60 steps out) has " + count + " cells around it, not " + q;
    }
  }
  return "";
}

// 4d. Invariants, as in checkInvariants: after every step, the blocks,
// base size and largest height add up and no site is available twice;
// every 500 steps the available sites are worked out again from scratch
// (the start, and every cell within distance r of the base, inside the
// domain).
function checkGraphInvariants(options, steps) {
  const m = newGraphMountain(options);
  for (let k = 1; k <= steps; k++) {
    m.step(Math.random());
    let total = 0, base = 0, highest = 0;
    for (const h of m.height) { total += h; if (h > 0) base += 1; if (h > highest) highest = h; }
    if (m.steps !== k || m.blocks !== k + 1 || total !== k + 1) return "step " + k + ": the blocks don't add up";
    if (m.baseSize !== base) return "step " + k + ": wrong base size";
    if (m.maxHeight !== highest) return "step " + k + ": wrong largest height";
    if (new Set(m.available).size !== m.available.length) return "step " + k + ": a site is available twice";
    if (k % 500 === 0) {
      const should = new Set([0]);
      const inDomain = options.domain.kind === "ball" ? graphDepths(m.graph, 0, options.domain.layers) : null;
      for (let i = 0; i < m.height.length; i++) {
        if (m.height[i] === 0) continue;
        for (const w of graphDepths(m.graph, m.siteNode[i], options.radius).keys()) {
          if (!inDomain || inDomain.has(w)) should.add(w);
        }
      }
      const actual = new Set(m.available.map(function (i) { return m.siteNode[i]; }));
      if (actual.size !== should.size || Array.from(should).some(function (w) { return !actual.has(w); })) {
        return "step " + k + ": the available sites are wrong";
      }
    }
  }
  return "";
}


/* ===================================================================
   5. THE PAGE: run the tests and fill in the table
   (addRow, runChecksOnClick and readNumbers are in js/check-page.js)
   =================================================================== */

// The list of tests, run one at a time by the "Run the checks" button.
function allTests() {
  const tests = [];
  for (const run of pythonRuns) {
    tests.push(function () {
      const problem = compareWithPython(run.file, run.u, run.h);
      addRow("Same as " + run.name, problem === "", problem || "every height matches");
    });
  }
  for (const c of smallCases) {
    tests.push(function () {
      const result = chiSquareTest(c, 100000);
      addRow("Exact odds: " + c.name + ", " + c.steps + " steps", result.pass, result.text);
    });
  }
  for (const c of smallCases) {
    tests.push(function () {
      const problem = checkInvariants(c, 5000);
      addRow("Invariants: " + c.name + ", 5000 steps", problem === "", problem || "all hold after every step");
    });
  }

  // 4. The mountain on a graph.
  const line = { kind: "line" }, grid = { kind: "grid" }, whole = { kind: "whole" };
  const sameTests = [
    ["Graph mode on the line = 1D, T = {-1, +1}, 20,000 steps",
     { dim: 1, tile: [[-1], [1]], domain: whole, start: [0] }, { graph: line, radius: 1, domain: whole }],
    ["Graph mode on the line, 10 layers = 1D on the segment -10..10, 20,000 steps",
     { dim: 1, tile: [[-1], [1]], domain: { kind: "box", xmin: -10, xmax: 10, ymin: 0, ymax: 0, torus: false }, start: [0] },
     { graph: line, radius: 1, domain: { kind: "ball", layers: 10 } }],
    ["Graph mode on the square grid = 2D, 4 neighbors, 20,000 steps",
     { dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: whole, start: [0, 0] }, { graph: grid, radius: 1, domain: whole }],
  ];
  for (const [name, flat, onGraph] of sameTests) {
    tests.push(function () {
      const problem = sameAsFlat(flat, onGraph, 20000);
      addRow(name, problem === "", problem || "the same mountain, block for block");
    });
  }
  for (const [d, r, steps] of [[3, 1, 5], [4, 1, 4], [3, 2, 3]]) {
    tests.push(function () {
      const result = treeChiSquare(d, r, steps, 100000);
      addRow("Exact odds: tree of degree " + d + ", tile = cells within " + r + ", " + steps + " steps", result.pass, result.text);
    });
  }
  for (const [p, q] of [[7, 3], [5, 4], [4, 5], [3, 7], [8, 3], [3, Infinity], [4, Infinity], [6, Infinity]]) {
    tests.push(function () {
      const problem = checkTiling(p, q, 6);
      const name = q === Infinity ? "Tree of degree " + p + " (tiling {" + p + ", infinity})" : "Tiling {" + p + ", " + q + "}";
      addRow(name + ": neighbors, distances, " + (q === Infinity ? "no loops" : "corners"), problem === "",
             problem || "all as they should be, 6 layers out");
    });
  }
  for (const [p, q] of [[7, 3], [5, 4], [4, 5], [3, 7], [8, 3], [5, 7]]) {
    tests.push(function () {
      const problem = checkFar(p, q);
      addRow("Tiling {" + p + ", " + q + "}, far out (built by its rules): corners", problem === "",
             problem || "every corner has " + q + " cells around it, 60 steps out");
    });
  }
  for (const [name, options] of [
    ["{7,3}, cells within 1", { graph: { kind: "tiling", p: 7, q: 3 }, radius: 1, domain: whole }],
    ["{4,5}, cells within 2", { graph: { kind: "tiling", p: 4, q: 5 }, radius: 2, domain: whole }],
    ["tree of degree 3, cells within 1, 6 layers", { graph: { kind: "tiling", p: 3, q: Infinity }, radius: 1, domain: { kind: "ball", layers: 6 } }],
  ]) {
    tests.push(function () {
      const problem = checkGraphInvariants(options, 3000);
      addRow("Invariants: " + name + ", 3000 steps", problem === "", problem || "all hold after every step");
    });
  }
  return tests;
}

runChecksOnClick(allTests);

byId("compare-pasted").addEventListener("click", function () {
  const u = readNumbers(byId("pasted-u").value);
  const h = readNumbers(byId("pasted-h").value);
  const file = byId("pasted-file").value;
  const out = byId("pasted-result");
  if (u.length === 0) { out.textContent = "Paste the u's first."; return; }
  const problem = compareWithPython(file, u, h);
  out.textContent = problem === "" ? "✓ Every height matches your Python." : "✗ " + problem;
});
