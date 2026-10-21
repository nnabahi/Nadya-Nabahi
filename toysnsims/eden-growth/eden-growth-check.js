/* =====================================================================
   eden-growth-check.js  —  the tests on eden-growth-check.html
   ---------------------------------------------------------------------
   Ten kinds of test of the growth rule in eden-growth-rule.js:

     1. Same mountain as nadya's Python. Her randmountain.py and
        randonesidedmountain.py turn a list of uniform numbers u into a
        mountain. Given the same u's, the JavaScript must give exactly
        the same heights. Two runs are built in (their heights were
        computed with her own runsim functions), and a box lets her
        paste a run of her own.

     2. Exact odds on small cases. For a few steps, every possible run
        can be listed, with its probability (each step picks one of |S|
        sites, so a run has probability 1/|S_0| * 1/|S_1| * ...; with the
        weight s, each pick has chance (h + 1)^s over the total). This
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

     5. The capacity (checkMaxHeight, part 4b): no site goes above M,
        the available sites are exactly those below M, M = 1 grows the
        base by one site every step (Eden model), and a bounded
        domain fills up to exactly M everywhere.

     6. The clocks (newClocks), which the sim page picks with: the same
        exact odds as in 2 (on regular trees too), the invariants of 3
        and 5, and the coupling: with M = 1 every site is empty when it
        is picked, so the weight s changes nothing, and the same seed
        must give the same mountain, block for block, for every s.

     7. The holes (holeHistory): a small example worked out by hand
        (a hole split in two, where the elder rule decides which piece
        keeps the old birth), and on long runs, the number of holes
        beta_1 at every step, from the births and deaths, must equal a
        plain count of the bounded empty pieces at that step (a flood
        fill, written here without the sim's code).

     8. The shape: the convexity of shapes worked out by hand (a filled
        box is 1, an L of 5 squares is 5/7), and after a long run the
        radius in each direction, kept up to date block by block, must
        equal the radius found again from scratch.

     9. Other tilings (any tiling by regular polygons, its tiles or its
        corners as the cells), with the tile "every cell within r steps":
          - the tile's size against the coordination sequences of the
            square, triangular and hexagonal grids; on 14 tilings, r = 1
            is the cell's neighbors, and tiles grow with r and go both ways;
          - the square tiling read from its code grows the same mountain
            as the square grid with T = {|dx| + |dy| <= r}, block for
            block, from the same seed;
          - exact odds (as in 2, listed from the tilings' neighbor lists),
            invariants (as in 3), the capacity (5) and the coupling (6),
            in the whole plane, boxes and tori of the tilings;
          - the holes: beta_1 at every step against Euler's formula, and
            the holes' cells against those found from the polygons alone;
          - the shape: one cell has convexity 1, the area and the hull
            against every corner of every base cell, and the radii.

    10. Penrose's tilings (P1, P2 and P3, js/sim-penrose.js), in a box
        and on the whole plane, whose patch grows as the mountain spreads:
          - exact odds (as in 2), invariants (3), the holes and the shape
            (as in 9);
          - in a box, a cell's tile has every cell of the box within r
            steps, though the box's patch reaches only 2 past the box;
          - the clocks go with where a cell is, not its number: in a box
            and on the plane, the same seed grows the same mountain until
            the one on the plane first leaves the box;
          - the plane stops at its edge (160 side lengths out), and until
            then every base cell's tile is whole.

   Random numbers come from the library seedrandom, each test with its
   own fixed seed, so the page gives the same results every time.
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
  // The weight s: a site with h blocks is picked with weight (h + 1)^s.
  { name: "Two-sided, weight s = 1",            steps: 5, dim: 1, tile: [[-1], [1]],  domain: { kind: "whole" }, start: [0], s: 1 },
  { name: "One-sided, weight s = -1.5",         steps: 6, dim: 1, tile: [[1]],        domain: { kind: "whole" }, start: [0], s: -1.5 },
  { name: "2D, 4 neighbors, weight s = 2",      steps: 3, dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    domain: { kind: "whole" }, start: [0, 0], s: 2 },
];

// The final mountain as text, e.g. "-1,0:2 0,0:3 1,0:1", so equal
// mountains give equal text.
function describe(heights) {
  return Array.from(heights.keys()).sort().map(function (k) { return k + ":" + heights.get(k); }).join(" ");
}

// The site (x, y) of domain d as text "x,y" (on another tiling, cell z
// of block (x, y), as "x,y,z"), after wrapping around on a torus; null
// if it is outside the domain. Written straight from the definition of
// the domains, without the sim's code, for the tests below.
function siteKey(d, x, y, z) {
  const torus = d.kind === "box" && d.torus ? d : d.kind === "cells" ? d.wrap : null;
  if (torus) {
    const w = torus.xmax - torus.xmin + 1, h = torus.ymax - torus.ymin + 1;
    x = torus.xmin + (((x - torus.xmin) % w) + w) % w;
    y = torus.ymin + (((y - torus.ymin) % h) + h) % h;
  }
  const key = z === undefined ? x + "," + y : x + "," + y + "," + z;
  if (d.kind === "box" && (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax)) return null;
  if (d.kind === "cells" && !cellKeys(d).has(key)) return null;
  return key;
}

// The cells of a domain { kind: "cells", cells } as a set of text keys,
// worked out once per domain.
const cellKeySets = new WeakMap();
function cellKeys(d) {
  if (!cellKeySets.has(d)) cellKeySets.set(d, new Set(d.cells.map(function (p) { return p.join(","); })));
  return cellKeySets.get(d);
}

// Case c's start site, as text (siteKey).
function startKey(c) {
  const s = c.start;
  return c.tiling ? siteKey(c.domain, s[0], s[1], s[2]) : siteKey(c.domain, s[0], s[1] || 0);
}

// Site i of mountain m (from case c), as text (siteKey).
function siteText(m, c, i) {
  return c.tiling ? m.siteX[i] + "," + m.siteY[i] + "," + m.siteZ[i] : m.siteX[i] + "," + m.siteY[i];
}

// The sites (as text, siteKey) that a block landing on the site "key"
// for the first time makes available, inside the domain: on the grids
// key + t for each offset t of the tile; on another tiling every cell
// within c.radius steps, a step going to a neighbor in the cell's list
// "next", found by going out one step at a time from the site.
function tileKeys(c, key) {
  const [x, y, z] = key.split(",").map(Number), keys = [];
  if (!c.tiling) {
    for (const t of c.tile) keys.push(siteKey(c.domain, x + t[0], y + (t[1] || 0)));
  } else {
    const seen = new Set([key]);
    let layer = [[x, y, z]];
    for (let step = 0; step < c.radius; step++) {
      const further = [];
      for (const [a, b, k] of layer) {
        for (const [k2, da, db] of c.tiling.cells[k].next) {
          if (k2 < 0) continue;    // (past the edge of a Penrose tiling's patch)
          const cell = [a + da, b + db, k2];
          if (seen.has(cell.join(","))) continue;
          seen.add(cell.join(","));
          further.push(cell);
          keys.push(siteKey(c.domain, cell[0], cell[1], cell[2]));
        }
      }
      layer = further;
    }
  }
  return keys.filter(function (k) { return k !== null; });
}

// The exact odds, straight from the definition: every run of "steps"
// steps, as a Map from describe(final mountain) to its probability.
// Written on its own, without newMountain, so the two can be compared.
function exactOdds(c) {
  // The available sites for a mountain: the start, and base + T.
  function availableSites(heights) {
    const s = new Set([startKey(c)]);
    for (const key of heights.keys()) for (const n of tileKeys(c, key)) s.add(n);
    return Array.from(s);
  }

  const odds = new Map();
  function grow(heights, stepsLeft, probability) {
    if (stepsLeft === 0) {
      const key = describe(heights);
      odds.set(key, (odds.get(key) || 0) + probability);
      return;
    }
    // Each site's chance: (its height + 1)^s over the total (uniform
    // when s = 0 or left out).
    const sites = availableSites(heights);
    const weight = function (s) { return Math.pow((heights.get(s) || 0) + 1, c.s || 0); };
    let total = 0;
    for (const s of sites) total += weight(s);
    for (const s of sites) {
      const next = new Map(heights);
      next.set(s, (next.get(s) || 0) + 1);
      grow(next, stepsLeft - 1, probability * weight(s) / total);
    }
  }
  grow(new Map([[startKey(c), 1]]), c.steps, 1);
  return odds;
}

// Run the sim "runs" times and compare with the exact odds.
// With "clocks" true, the sim picks with clocks, a new seed each run.
function chiSquareTest(c, runs, clocks) {
  const random = new Math.seedrandom("odds " + c.name);
  const odds = exactOdds(c);
  const counts = new Map();
  for (let r = 0; r < runs; r++) {
    const m = newMountain(clocks ? Object.assign({}, c, { clocks: "odds " + c.name + " " + r }) : c);
    for (let k = 0; k < c.steps; k++) m.step(random());
    const heights = new Map();
    for (let i = 0; i < m.height.length; i++) {
      if (m.height[i] > 0) heights.set(siteText(m, c, i), m.height[i]);
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
  const random = new Math.seedrandom("invariants " + c.name);
  const m = newMountain(c);
  for (let k = 1; k <= steps; k++) {
    m.step(random());
    const problem = stepProblem(m, k);
    if (problem) return problem;
    if (c.dim === 1) {
      for (let j = 1; j < m.available.length; j++) {
        if (m.siteX[m.available[j - 1]] >= m.siteX[m.available[j]]) return "step " + k + ": 1D list not left to right";
      }
    }
    if (k % 500 === 0) {
      const should = new Set([startKey(c)]);
      for (let i = 0; i < m.height.length; i++) {
        if (m.height[i] > 0) for (const key of tileKeys(c, siteText(m, c, i))) should.add(key);
      }
      const actual = m.available.map(function (i) { return siteText(m, c, i); });
      if (!sameSet(actual, should)) return "step " + k + ": the available sites are wrong";
    }
  }
  return "";
}

// The checks after step k of mountain m (from newMountain or
// newGraphMountain): "" if they all hold, else what is wrong.
function stepProblem(m, k) {
  let total = 0, base = 0, highest = 0;
  for (const h of m.height) { total += h; if (h > 0) base += 1; if (h > highest) highest = h; }
  if (m.steps !== k || m.blocks !== k + 1 || total !== k + 1) return "step " + k + ": the blocks don't add up";
  if (m.baseSize !== base) return "step " + k + ": wrong base size";
  if (m.maxHeight !== highest) return "step " + k + ": wrong largest height";
  if (new Set(m.available).size !== m.available.length) return "step " + k + ": a site is available twice";
  return "";
}

// Whether the list "actual" has exactly the things in the set "should".
function sameSet(actual, should) {
  const seen = new Set(actual);
  return seen.size === should.size && Array.from(should).every(function (x) { return seen.has(x); });
}


/* ===================================================================
   4. THE MOUNTAIN ON A GRAPH
   =================================================================== */

// 4a. Same as 1D and 2D. Grow both mountains with the same random
// numbers and compare every site's height. "oneOrTwo" is the 1D or 2D
// mountain's options, "graphOptions" the graph mountain's, "name" the
// test's name (it seeds the random numbers).
function sameAsFlat(oneOrTwo, graphOptions, steps, name) {
  const random = new Math.seedrandom(name);
  const flat = newMountain(oneOrTwo), onGraph = newGraphMountain(graphOptions);
  for (let k = 0; k < steps; k++) {
    const u = random();
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
    for (const site of sites) {
      const next = new Map(heights);
      next.set(site, (next.get(site) || 0) + 1);
      grow(next, stepsLeft - 1, probability / sites.size);
    }
  }
  grow(new Map([[0, 1]]), steps, 1);
  return odds;
}
function treeChiSquare(d, r, steps, runs, clocks) {
  const random = new Math.seedrandom("tree odds " + d + " " + r + " " + steps);
  const odds = exactTreeOdds(d, r, steps);
  const counts = new Map();
  // One tree for all the runs (much faster than a new one each time),
  // and every cell's depth, out as far as a base can reach.
  const tree = makeGraph({ kind: "tiling", p: d, q: Infinity });
  const depths = graphDepths(tree, 0, steps * r + 1);
  for (let run = 0; run < runs; run++) {
    const options = { graph: tree, radius: r, domain: { kind: "whole" } };
    if (clocks) options.clocks = "tree odds " + run;
    const m = newGraphMountain(options);
    for (let k = 0; k < steps; k++) m.step(random());
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
// domain). "name", the test's name, seeds the random numbers.
function checkGraphInvariants(options, steps, name) {
  const random = new Math.seedrandom("invariants " + name);
  const m = newGraphMountain(options);
  for (let k = 1; k <= steps; k++) {
    m.step(random());
    const problem = stepProblem(m, k);
    if (problem) return problem;
    if (k % 500 === 0) {
      const should = new Set([0]);
      const inDomain = options.domain.kind === "ball" ? graphDepths(m.graph, 0, options.domain.layers) : null;
      for (let i = 0; i < m.height.length; i++) {
        if (m.height[i] === 0) continue;
        for (const w of graphDepths(m.graph, m.siteNode[i], options.radius).keys()) {
          if (!inDomain || inDomain.has(w)) should.add(w);
        }
      }
      const actual = m.available.map(function (i) { return m.siteNode[i]; });
      if (!sameSet(actual, should)) return "step " + k + ": the available sites are wrong";
    }
  }
  return "";
}


/* ===================================================================
   4b. THE MAX HEIGHT
   ---------------------------------------------------------------------
   With a capacity M (options.cap), after every step:
     - the usual checks (stepProblem);
     - no site is higher than M;
     - the available sites are exactly the sites with fewer than M
       blocks (every site ever made was available once, and only
       getting full takes it off the list);
     - with M = 1 (Eden model), every block lands on a new site, so
       the base has steps + 1 sites.
   On a bounded domain the run goes until every site is full, and then
   every site must have exactly M blocks.
   =================================================================== */
function checkMaxHeight(options, steps, name) {
  const random = new Math.seedrandom("max height " + name);
  const m = options.graph ? newGraphMountain(options) : newMountain(options);
  const M = options.cap;
  for (let k = 1; k <= steps && m.available.length > 0; k++) {
    m.step(random());
    const problem = stepProblem(m, k);
    if (problem) return problem;
    if (m.maxHeight > M) return "step " + k + ": a site is higher than M";
    const open = new Set(m.available);
    for (let i = 0; i < m.height.length; i++) {
      if (open.has(i) !== (m.height[i] < M)) return "step " + k + ": the available sites are wrong";
    }
    if (M === 1 && m.baseSize !== k + 1) return "step " + k + ": M = 1 but a block landed on the base";
  }
  if (m.available.length === 0 && !m.height.every(function (h) { return h === M; })) {
    return "every site is full, but not every site has M blocks";
  }
  return "";
}


/* ===================================================================
   4c. THE CLOCKS: THE SAME MOUNTAIN FOR EVERY s WHEN M = 1
   -------------------------------------------------------------------
   With M = 1 every available site is empty, so its alarm runs at rate
   (0 + 1)^s = 1 for every s: the same seed must give the same
   mountain, block for block. Returns "" if it does, else what differs.
   =================================================================== */
function sameForEveryS(options, steps, name) {
  const runs = [-2, 0, 1.5].map(function (s) {
    const m = options.graph ? newGraphMountain(Object.assign({}, options, { s: s }))
                            : newMountain(Object.assign({}, options, { s: s }));
    // After each step, every site's height (sites are numbered in the
    // order they became available, so equal lists mean equal mountains).
    const after = [];
    for (let k = 0; k < steps; k++) { m.step(); after.push(m.height.join(",")); }
    return after;
  });
  for (let k = 0; k < steps; k++) {
    if (runs[1][k] !== runs[0][k] || runs[2][k] !== runs[0][k]) return name + ": block " + (k + 1) + " landed somewhere else";
  }
  return "";
}


/* ===================================================================
   4d. THE HOLES
   =================================================================== */

// By hand: the border of the 5 x 3 box x = 0..4, y = 0..2, one square
// a step (steps 0 to 11, going up each column from the left), closes
// off the hole (1,1), (2,1), (3,1) at step 10, when (4, 1) lands (the
// corners don't matter: empty squares touching at a corner aren't
// joined). Step 12 fills (2, 1), splitting it in two; step 13 fills
// (1, 1) and step 14 fills (3, 1). (3, 1) lives longer, so it keeps the
// birth 10: the holes are (born 12, died 13) and (born 10, died 14).
function checkHolesByHand() {
  const x = [], y = [], born = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === 0 || i === 4 || j === 0 || j === 2) { x.push(i); y.push(j); born.push(born.length); }
    }
  }
  for (const [i, j] of [[2, 1], [1, 1], [3, 1]]) { x.push(i); y.push(j); born.push(born.length); }
  const h = holeHistory({ siteX: x, siteY: y, bornAt: born }, 14);
  const pairs = h.births.map(function (b, k) { return "(" + b + ", " + h.deaths[k] + ")"; }).sort().join(" ");
  return pairs === "(10, 14) (12, 13)" && h.openBirths.length === 0 ? "" : "got " + pairs;
}

// The number of holes of mountain m's base now, by a plain flood fill
// (countHoles, js/check-page.js).
function holesOf(m) {
  const cells = [];
  for (let i = 0; i < m.height.length; i++) if (m.height[i] > 0) cells.push([m.siteX[i], m.siteY[i]]);
  return countHoles(cells);
}

// Grow a mountain "steps" steps, counting its holes after every step,
// then compare with beta_1 from holeHistory's births and deaths.
function checkHoles(options, steps) {
  const m = newMountain(options);
  const counted = [holesOf(m)];
  for (let k = 1; k <= steps && m.available.length > 0; k++) {
    m.step();
    counted.push(holesOf(m));
  }
  const h = holeHistory(m, m.steps);
  const births = h.births.concat(h.openBirths);
  for (let t = 0; t < counted.length; t++) {
    const beta = births.filter(function (b) { return b <= t; }).length - h.deaths.filter(function (d) { return d <= t; }).length;
    if (beta !== counted[t]) return "step " + t + ": " + beta + " holes from the births and deaths, " + counted[t] + " counted";
  }
  return "";
}


/* ===================================================================
   4e. THE SHAPE
   =================================================================== */

// Grow until every site of the domain is full, then the convexity.
function convexityOfDomain(domain, start) {
  const m = newMountain({ dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: domain, start: start,
                          cap: 1, clocks: "shape", shapeBins: 8 });
  while (m.available.length > 0) m.step();
  return convexity(m);
}

// After "steps" steps, compare m.radii with the radii found again from
// every base site (from the middles of the cells, on another tiling
// with middleAt, js/check-page.js).
function checkRadii(options, steps) {
  const m = newMountain(options);
  for (let k = 0; k < steps && m.available.length > 0; k++) m.step();
  const bins = options.shapeBins, again = new Float64Array(bins);
  const middle = function (i) {
    return options.tiling ? middleAt(options.tiling, m.siteX[i], m.siteY[i], m.siteZ[i]) : [m.siteX[i], m.siteY[i]];
  };
  const [x0, y0] = middle(m.start);
  for (let i = 0; i < m.height.length; i++) {
    if (m.height[i] === 0 || i === m.start) continue;
    const dx = middle(i)[0] - x0, dy = middle(i)[1] - y0;
    const k = Math.min(bins - 1, Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * bins));
    again[k] = Math.max(again[k], Math.hypot(dx, dy));
  }
  for (let k = 0; k < bins; k++) {
    if (Math.abs(again[k] - m.radii[k]) > 1e-9) return "direction " + k + ": kept " + m.radii[k] + ", found again " + again[k];
  }
  return "";
}


/* ===================================================================
   4f. OTHER TILINGS
   -------------------------------------------------------------------
   The tilings are read from their codes as the sim reads them
   (tilingBlock, js/sim-tilings.js), each once.
   =================================================================== */
const tilingsMade = new Map();
function tilingNamed(code, corners) {
  const key = code + (corners ? " corners" : "");
  if (!tilingsMade.has(key)) tilingsMade.set(key, tilingBlock(code, corners));
  return tilingsMade.get(key);
}
const SQUARES = "4/m45/r(h1)", TRIANGLES = "3/m30/r(h2)", HEXAGONS = "6/m30/r(h1)";

// A box or torus of a tiling (tilingBox, js/sim-domains.js), as the
// growth rule wants it, its middle cell (the start), and the tiling.
function tilingDomain(t, width, height, torus) {
  const d = tilingBox(t, width, height, torus), cells = [];
  for (let v = 0; v < d.n; v++) cells.push([d.x[v], d.y[v], d.part[v]]);
  return { domain: { kind: "cells", cells: cells, wrap: d.wrap }, start: cells[Math.floor(cells.length / 2)], tiling: t };
}

// The size of the tile "every cell within r steps" against the
// coordination sequences: from a cell, k steps away there are 4k cells
// on the square grid, 3k on the triangles (their neighbors make the
// honeycomb graph) and 6k on the hexagons (the triangular graph), so
// the tile has 2r(r+1), 3r(r+1)/2 and 3r(r+1) cells (J. H. Conway and
// N. J. A. Sloane, "Low-dimensional lattices. VII. Coordination
// sequences", Proc. R. Soc. Lond. A 453 (1997) 2369-2389; OEIS A008574,
// A008486, A008458). The corners of the triangles are hexagons and the
// corners of the hexagons triangles, so those swap. Returns "" if every
// kind of cell has the right count for r = 1 to 8.
function checkTileSizes(t, perStep) {
  for (let r = 1; r <= 8; r++) {
    const should = perStep * r * (r + 1) / 2;
    for (let z = 0; z < t.cells.length; z++) {
      const size = ballTile(t, z, r).length;
      if (size !== should) return "r = " + r + ", cell " + z + ": " + size + " cells, not " + should;
    }
  }
  return "";
}

// On any tiling, for r = 1, 2, 3: the tile with r = 1 is exactly the
// cell's neighbors (its list "next"); every tile with radius r is in
// the one with r + 1; and it goes both ways (if cell z's tile has the
// move (dx, dy) to cell z2, then cell z2's has (-dx, -dy) back to z).
function checkBallTiles(t) {
  const text = function (move) { return move.join(","); };
  for (let z = 0; z < t.cells.length; z++) {
    const near = new Set(ballTile(t, z, 1).map(text));
    const next = new Set(t.cells[z].next.map(function ([k, dx, dy]) { return [dx, dy, k].join(","); }));
    if (near.size !== next.size || [...next].some(function (m) { return !near.has(m); })) return "cell " + z + ": r = 1 isn't its neighbors";
  }
  for (let r = 1; r <= 3; r++) {
    const tiles = t.cells.map(function (cell, z) { return new Set(ballTile(t, z, r).map(text)); });
    for (let z = 0; z < t.cells.length; z++) {
      const wider = new Set(ballTile(t, z, r + 1).map(text));
      for (const move of tiles[z]) {
        const [dx, dy, z2] = move.split(",").map(Number);
        if (!wider.has(move)) return "r = " + r + ", cell " + z + ": " + move + " is missing at r = " + (r + 1);
        if (!tiles[z2].has([-dx, -dy, z].join(","))) return "r = " + r + ": cell " + z + " reaches " + move + " but not back";
      }
    }
  }
  return "";
}

// The square tiling read from its code, with the tile "every cell
// within r steps", against the square grid with the offsets
// |dx| + |dy| <= r: one cell per block, so a site's clocks are made
// from (x, y) on both, and with the same seed they must grow the same
// mountain, block for block. Returns "" if they do.
function sameAsSquares(r, extra, steps) {
  const t = tilingNamed(SQUARES, false);
  if (t.cells.length !== 1 || t.a.join() !== "1,0" || t.b.join() !== "0,1") return "its block isn't one square of side 1";
  const diamond = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) if ((dx !== 0 || dy !== 0) && Math.abs(dx) + Math.abs(dy) <= r) diamond.push([dx, dy]);
  }
  const common = Object.assign({ dim: 2, domain: { kind: "whole" }, clocks: "squares " + r }, extra);
  const onTiling = newMountain(Object.assign({ tiling: t, radius: r, start: [0, 0, 0] }, common));
  const onGrid = newMountain(Object.assign({ tile: diamond, start: [0, 0] }, common));
  for (let k = 0; k < steps; k++) { onTiling.step(); onGrid.step(); }
  if (onTiling.siteX.length !== onGrid.siteX.length) return onTiling.siteX.length + " sites on the tiling, " + onGrid.siteX.length + " on the grid";
  for (let i = 0; i < onTiling.siteX.length; i++) {
    const x = onTiling.siteX[i], y = onTiling.siteY[i];
    if (onGrid.heightAt(x, y) !== onTiling.height[i]) return "different height at (" + x + ", " + y + ")";
  }
  return "";
}

// The holes on another tiling, two ways. Grow "steps" steps with
// r = 1, so the base is connected (each new site shares a side with
// it). At every step, beta_1 from holeHistory's births and deaths =
// beta_1 by Euler's formula (eulerCounter, js/check-page.js); at the
// end, the holes' cells and sizes = those found from the polygons alone
// (holesFromPolygons, js/check-page.js). Returns { problem, most }:
// what is wrong ("" if nothing), and the most holes there were at once.
function checkTilingHoles(options, steps) {
  const m = newMountain(options);
  for (let k = 0; k < steps && m.available.length > 0; k++) m.step();
  const h = holeHistory(m, m.steps);
  const beta = bettiOverTime(h, Array.from({ length: m.steps + 1 }, function (_, step) { return step; }));
  const base = [];
  for (let i = 0; i < m.height.length; i++) if (m.height[i] > 0) base.push(i);
  base.sort(function (i, j) { return m.bornAt[i] - m.bornAt[j]; });
  const counter = eulerCounter(options.tiling);
  let j = 0, most = 0;
  const result = function (problem) { return { problem: problem, most: most }; };
  for (let step = 0; step <= m.steps; step++) {
    for (; j < base.length && m.bornAt[base[j]] === step; j++) counter.add(m.siteX[base[j]], m.siteY[base[j]], m.siteZ[base[j]]);
    most = Math.max(most, counter.holes());
    if (counter.holes() !== beta[step]) return result("step " + step + ": " + beta[step] + " holes from the births and deaths, " + counter.holes() + " by Euler's formula");
  }
  const plain = holesFromPolygons({ tiling: options.tiling, siteX: base.map(function (i) { return m.siteX[i]; }),
                                    siteY: base.map(function (i) { return m.siteY[i]; }), siteZ: base.map(function (i) { return m.siteZ[i]; }) });
  const ours = new Set();
  for (let k = 0; k < h.holeCells.length; k += 3) ours.add(h.holeCells[k] + "," + h.holeCells[k + 1] + "," + h.holeCells[k + 2]);
  const sizes = function (list) { return Array.from(list).sort(function (a, b) { return a - b; }).join(" "); };
  if (sizes(plain.sizes) !== sizes(h.holeSizes)) return result("hole sizes " + sizes(h.holeSizes) + ", from the polygons " + sizes(plain.sizes));
  if (ours.size !== plain.cells.size || [...ours].some(function (key) { return !plain.cells.has(key); })) return result("the holes' cells differ from the polygons'");
  return result("");
}

// The shape on another tiling, after "steps" steps: the area kept
// block by block = the polygons' areas added up (cornersAt,
// js/check-page.js), and the convexity = that area over the area of the
// hull of every corner of every base cell (convexity itself uses the
// hull kept up to date as cells join the base).
function checkTilingShape(options, steps) {
  const m = newMountain(Object.assign({ shapeBins: 8 }, options));
  for (let k = 0; k < steps && m.available.length > 0; k++) m.step();
  let area = 0;
  const corners = [];
  for (let i = 0; i < m.height.length; i++) {
    if (m.height[i] === 0) continue;
    const polygon = cornersAt(options.tiling, m.siteX[i], m.siteY[i], m.siteZ[i]);
    area += polygonArea(polygon);
    corners.push(...polygon);
  }
  const should = area / polygonArea(convexHull(corners)), got = convexity(m);
  if (Math.abs(m.area - area) > 1e-6 * area) return "area kept " + m.area + ", added up " + area;
  if (Math.abs(got - should) > 1e-9) return "convexity " + got + ", from every corner " + should;
  return "";
}

// One cell is convex: on every kind of cell of a tiling, a domain of
// just that cell, filled, has convexity 1.
function oneCellConvexity(t) {
  for (let z = 0; z < t.cells.length; z++) {
    const m = newMountain({ dim: 2, tiling: t, radius: 1, domain: { kind: "cells", cells: [[0, 0, z]], wrap: null },
                            start: [0, 0, z], shapeBins: 8 });
    if (Math.abs(convexity(m) - 1) > 1e-9) return "cell " + z + ": " + convexity(m);
  }
  return "";
}


/* ===================================================================
   4g. PENROSE TILINGS
   -------------------------------------------------------------------
   A Penrose tiling never repeats: it is one block, a patch that grows
   (js/sim-penrose.js). On the whole plane the mountain grows the patch
   it is given as it spreads, so each test makes its own
   (penroseBlock). Cells are named by their keys, which say where they
   are: two patches number the same cell differently.
   =================================================================== */

// The cell of a Penrose patch, as [0, 0, z], whose middle is nearest
// the point (u, w).
function nearestCell(block, u, w) {
  const far = function (z) { return Math.hypot(block.cells[z].middle[0] - u, block.cells[z].middle[1] - w); };
  let best = 0;
  for (let z = 1; z < block.cells.length; z++) if (far(z) < far(best)) best = z;
  return [0, 0, best];
}

// The keys of the cells of tile "moves" (from ballTile) of a patch.
function tileNames(block, moves) {
  return moves.map(function (move) { return block.cells[move[2]].key; });
}

// In a box, the patch reaches only 2 past the box (tilingBox,
// js/sim-domains.js), so a cell's tile (ballTile) leaves out what lies
// further. It must still have every cell of the box within r steps: the
// same as on a patch reaching 2r + 2 past the box (a step goes less
// than 2, so r steps can't get further). Returns "" if it does.
function checkBoxTiles(kind, corners, width, r) {
  const block = penroseBlock(kind, corners), box = tilingDomain(block, width, width, false);
  const big = penroseBlock(kind, corners);
  growPenrose(big, width / 2 + 2 * r + 2, width / 2 + 2 * r + 2);
  const number = new Map(big.cells.map(function (cell, z) { return [cell.key, z]; }));
  const inBox = new Set(box.domain.cells.map(function (c) { return block.cells[c[2]].key; }));
  const keep = function (key) { return inBox.has(key); };
  for (const [, , z] of box.domain.cells) {
    const mine = tileNames(block, ballTile(block, z, r)).filter(keep);
    const should = new Set(tileNames(big, ballTile(big, number.get(block.cells[z].key), r)).filter(keep));
    if (!sameSet(mine, should)) return "cell " + z + ": " + mine.length + " cells of the box in its tile, " + should.size + " on a bigger patch";
  }
  return "";
}

// The heights of mountain m's base, by the keys of its cells.
function heightsByName(m, block) {
  const heights = new Map();
  for (let i = 0; i < m.height.length; i++) if (m.height[i] > 0) heights.set(block.cells[m.siteZ[i]].key, m.height[i]);
  return heights;
}

// The clocks go with where a cell is (its key), not its number. So a
// mountain in a box and one on the whole plane, from the same cell with
// the same seed, must be the same until the one on the plane first puts
// a block outside the box: until then, every site available in the box
// is available on the plane with the same clock, and the sites outside
// the box are the only others. Returns { problem, steps }: what is
// wrong ("" if nothing), and the steps they agreed for.
function sameInBoxAndPlane(kind, corners, width, extra, most) {
  const boxBlock = penroseBlock(kind, corners), planeBlock = penroseBlock(kind, corners);
  const box = tilingDomain(boxBlock, width, width, false);
  const start = boxBlock.cells[box.start[2]].key;
  const common = Object.assign({ dim: 2, clocks: "box and plane " + kind }, extra);
  const inBox = newMountain(Object.assign({ tiling: boxBlock, domain: box.domain, start: box.start }, common));
  const onPlane = newMountain(Object.assign({ tiling: planeBlock, domain: { kind: "whole" },
    start: [0, 0, planeBlock.cells.findIndex(function (cell) { return cell.key === start; })] }, common));
  const inside = new Set(box.domain.cells.map(function (c) { return boxBlock.cells[c[2]].key; }));
  for (let k = 1; k <= most; k++) {
    inBox.step();
    onPlane.step();
    const a = heightsByName(inBox, boxBlock), b = heightsByName(onPlane, planeBlock);
    if (Array.from(b.keys()).some(function (key) { return !inside.has(key); })) return { problem: "", steps: k - 1 };
    if (describe(a) !== describe(b)) return { problem: "step " + k + ": the mountains differ, with the plane's still in the box", steps: k - 1 };
  }
  return { problem: "the mountain on the plane was still in the box after " + most + " steps", steps: most };
}

// Does a cell within r - 1 steps of cell z of a patch have a side with
// nothing across it (so the tile with radius r is cut off)?
function tileCutOff(block, z, r) {
  const seen = new Set([z]);
  let layer = [z];
  for (let step = 0; step < r; step++) {
    const further = [];
    for (const k of layer) {
      for (const [k2] of block.cells[k].next) {
        if (k2 < 0) return true;
        if (!seen.has(k2)) { seen.add(k2); further.push(k2); }
      }
    }
    layer = further;
  }
  return false;
}

// The whole plane stops at PENROSE_PLANE_MOST (js/sim-penrose.js). A
// mountain started 120 side lengths out grows until a new base cell
// needs more: a cell whose middle is more than 160 - (4r + 8) out (it
// needs every cell within 4r + 6 of it, and their neighbors, 2 further).
// That cell is less than 2r further out than the base before it, and
// every base cell's tile is whole, that last one's too. Returns "" if
// all holds.
function checkPlaneEdge(kind, corners, r) {
  const block = penroseBlock(kind, corners);
  penroseReach(block, 120, 0, 0);
  const m = newMountain({ dim: 2, tiling: block, radius: r, domain: { kind: "whole" }, start: nearestCell(block, 120, 0),
                          cap: 1, clocks: "edge " + kind });
  while (!m.atEdge && m.steps < 50000) m.step();
  if (!m.atEdge) return "no edge after " + m.steps + " steps";
  if (block.X !== PENROSE_PLANE_MOST) return "the plane reaches " + block.X + ", not " + PENROSE_PLANE_MOST;
  const limit = PENROSE_PLANE_MOST - 4 * r - 8, beyond = [];
  let cut = 0;
  for (let i = 0; i < m.height.length; i++) {
    if (m.height[i] === 0) continue;
    const [u, w] = block.cells[m.siteZ[i]].middle, out = Math.max(Math.abs(u), Math.abs(w));
    if (out > limit) beyond.push(out);
    if (tileCutOff(block, m.siteZ[i], r)) cut++;
  }
  if (beyond.length !== 1 || beyond[0] > limit + 2 * r) return "base cells past " + limit + ": " + beyond.map(function (out) { return out.toFixed(1); }).join(", ");
  if (cut > 0) return cut + " base cells have their tile cut off";
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
      const problem = sameAsFlat(flat, onGraph, 20000, name);
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
      const problem = checkGraphInvariants(options, 3000, name);
      addRow("Invariants: " + name + ", 3000 steps", problem === "", problem || "all hold after every step");
    });
  }

  // 4b. The capacity.
  const segment = { kind: "box", xmin: -20, xmax: 20, ymin: 0, ymax: 0, torus: false };
  const square = { kind: "box", xmin: -10, xmax: 10, ymin: -10, ymax: 10, torus: false };
  for (const [name, options] of [
    ["1D, T = {-1, +1}, M = 1", { dim: 1, tile: [[-1], [1]], domain: whole, start: [0], cap: 1 }],
    ["1D, T = {-1, +1}, M = 3, the segment -20..20 until full", { dim: 1, tile: [[-1], [1]], domain: segment, start: [0], cap: 3 }],
    ["2D, 4 neighbors, M = 1", { dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: whole, start: [0, 0], cap: 1 }],
    ["2D, 4 neighbors, M = 2, a 21 x 21 box until full", { dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: square, start: [0, 0], cap: 2 }],
    ["{7,3}, cells within 1, M = 1", { graph: { kind: "tiling", p: 7, q: 3 }, radius: 1, domain: whole, cap: 1 }],
    ["tree of degree 3, 5 layers, M = 2, until full", { graph: { kind: "tiling", p: 3, q: Infinity }, radius: 1, domain: { kind: "ball", layers: 5 }, cap: 2 }],
  ]) {
    tests.push(function () {
      const problem = checkMaxHeight(options, 2000, name);
      addRow("Capacity: " + name + ", up to 2000 steps", problem === "", problem || "all hold after every step");
    });
    tests.push(function () {
      const problem = checkMaxHeight(Object.assign({ clocks: "max height " + name }, options), 2000, name);
      addRow("Clocks, capacity: " + name + ", up to 2000 steps", problem === "", problem || "all hold after every step");
    });
  }

  // 6. The clocks.
  for (const c of smallCases) {
    tests.push(function () {
      const result = chiSquareTest(c, 100000, true);
      addRow("Clocks, exact odds: " + c.name + ", " + c.steps + " steps", result.pass, result.text);
    });
  }
  for (const [d, r, steps] of [[3, 1, 5], [3, 2, 3]]) {
    tests.push(function () {
      const result = treeChiSquare(d, r, steps, 100000, true);
      addRow("Clocks, exact odds: tree of degree " + d + ", tile = cells within " + r + ", " + steps + " steps", result.pass, result.text);
    });
  }
  for (const c of smallCases) {
    tests.push(function () {
      const problem = checkInvariants(Object.assign({ clocks: "invariants " + c.name }, c), 5000);
      addRow("Clocks, invariants: " + c.name + ", 5000 steps", problem === "", problem || "all hold after every step");
    });
  }
  for (const [name, options] of [
    ["2D, 4 neighbors", { dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: whole, start: [0, 0], cap: 1, clocks: "coupling" }],
    ["{7,3}, cells within 1", { graph: { kind: "tiling", p: 7, q: 3 }, radius: 1, domain: whole, cap: 1, clocks: "coupling" }],
  ]) {
    tests.push(function () {
      const problem = sameForEveryS(options, 1000, name);
      addRow("Clocks, M = 1: " + name + ", s = -2, 0 and 1.5, 1000 steps", problem === "",
             problem || "the same mountain, block for block");
    });
  }

  // 7. The holes.
  tests.push(function () {
    const problem = checkHolesByHand();
    addRow("Holes: a hole split in two, by hand (elder rule)", problem === "", problem || "(born 10, died 14) and (born 12, died 13), as worked out");
  });
  const eight = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [name, options] of [
    ["2D, 8 neighbors, M = 1", { dim: 2, tile: eight, domain: whole, start: [0, 0], cap: 1, clocks: "holes 1" }],
    ["2D, 4 neighbors, M = 3, s = 1", { dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: whole, start: [0, 0], cap: 3, s: 1, clocks: "holes 2" }],
    ["2D, ring tile r = 2 to 3, no max", { dim: 2, tile: ringTile(2, 3), domain: whole, start: [0, 0], clocks: "holes 3" }],
    ["2D, 8 neighbors, M = 1, the 21 x 21 box until full", { dim: 2, tile: eight, domain: square, start: [0, 0], cap: 1, clocks: "holes 4" }],
  ]) {
    tests.push(function () {
      const problem = checkHoles(options, 1500);
      addRow("Holes: " + name + ", up to 1500 steps", problem === "", problem || "beta_1 matches a plain count at every step");
    });
  }

  // 8. The shape.
  tests.push(function () {
    const box = convexityOfDomain({ kind: "box", xmin: 0, xmax: 4, ymin: 0, ymax: 4, torus: false }, [2, 2]);
    const L = convexityOfDomain({ kind: "cells", wrap: null, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] }, [0, 0]);
    const pass = Math.abs(box - 1) < 1e-12 && Math.abs(L - 5 / 7) < 1e-12;
    addRow("Shape: convexity of a filled 5 x 5 box and of an L of 5 squares", pass,
           "box " + box.toFixed(4) + " (should be 1), L " + L.toFixed(4) + " (should be 5/7 = " + (5 / 7).toFixed(4) + ")");
  });
  for (const [name, options] of [
    ["2D, 4 neighbors, M = 1", { dim: 2, tile: [[1, 0], [-1, 0], [0, 1], [0, -1]], domain: whole, start: [0, 0], cap: 1 }],
    ["2D, ring tile r = 2 to 3, M = 2, s = -1", { dim: 2, tile: ringTile(2, 3), domain: whole, start: [0, 0], cap: 2, s: -1 }],
  ]) {
    tests.push(function () {
      const problem = checkRadii(Object.assign({ clocks: "radii " + name, shapeBins: 180 }, options), 20000);
      addRow("Shape: radius in each of 180 directions, " + name + ", 20,000 steps", problem === "",
             problem || "kept block by block = found again from scratch");
    });
  }

  // 9. Other tilings.
  for (const [name, code, corners, perStep] of [
    ["the square tiling from its code", SQUARES, false, 4], ["triangles", TRIANGLES, false, 3], ["hexagons", HEXAGONS, false, 6],
    ["the corners of the triangles (hexagons)", TRIANGLES, true, 6], ["the corners of the hexagons (triangles)", HEXAGONS, true, 3],
  ]) {
    tests.push(function () {
      const problem = checkTileSizes(tilingNamed(code, corners), perStep);
      addRow("Other tilings: tile sizes, " + name + ", r = 1 to 8", problem === "",
             problem || "the coordination sequence's " + perStep + "k cells k steps away, for every kind of cell");
    });
  }
  // The 11 tilings with one kind of corner, and three with two.
  const someTilings = TILINGS.slice(0, 12).concat([TILINGS[17], TILINGS[20]]);
  tests.push(function () {
    const problems = [];
    for (const t of someTilings) {
      for (const corners of [false, true]) {
        const problem = checkBallTiles(tilingNamed(t.code, corners));
        if (problem) problems.push(t.name + (corners ? " (corners)" : "") + ": " + problem);
      }
    }
    addRow("Other tilings: the tile with r = 1 is the cell's neighbors, and the tiles grow with r and go both ways, r = 1 to 3, " +
           someTilings.length + " tilings, tiles and corners", problems.length === 0, problems.join("; ") || "all hold");
  });
  for (const [r, extra, name] of [[1, { cap: 1 }, "r = 1, M = 1"], [2, { s: 1 }, "r = 2, no capacity, s = 1"],
                                  [3, { cap: 2, s: -1 }, "r = 3, M = 2, s = -1"]]) {
    tests.push(function () {
      const problem = sameAsSquares(r, extra, 5000);
      addRow("Other tilings: the square tiling from its code = the square grid with T = {|dx| + |dy| ≤ r}, " + name + ", 5000 steps",
             problem === "", problem || "the same mountain, block for block, from the same seed");
    });
  }

  // Exact odds and invariants (as in 2 and 3), with the tile "every cell within r steps".
  const whole2 = { dim: 2, domain: whole, start: [0, 0, 0] };
  const tri = tilingNamed(TRIANGLES, false), hex = tilingNamed(HEXAGONS, false);
  const triTorus = tilingDomain(tri, 4, 4, true), hexBox = tilingDomain(hex, 5, 5, false);
  const tilingCases = [
    Object.assign({ name: "triangles, r = 1", steps: 4, tiling: tri, radius: 1 }, whole2),
    Object.assign({ name: "truncated square (4.8²), r = 1, s = 1", steps: 4, tiling: tilingNamed("8-4/m90/r(h4)", false), radius: 1, s: 1 }, whole2),
    Object.assign({ name: "corners of the kagome tiling, r = 2", steps: 2, tiling: tilingNamed("6-3-6/m30/r(v4)", true), radius: 2 }, whole2),
    Object.assign({ name: "3⁶; 3².4.3.4, r = 1", steps: 4, tiling: tilingNamed(TILINGS[11].code, false), radius: 1 }, whole2),
    { name: "triangles, r = 1, on a small torus", steps: 4, dim: 2, tiling: tri, radius: 1, domain: triTorus.domain, start: triTorus.start },
    { name: "hexagons, r = 1, s = -1, in a 5 x 5 box", steps: 4, dim: 2, tiling: hex, radius: 1, domain: hexBox.domain, start: hexBox.start, s: -1 },
  ];
  for (const c of tilingCases) {
    tests.push(function () {
      const result = chiSquareTest(c, 100000);
      addRow("Other tilings, exact odds: " + c.name + ", " + c.steps + " steps", result.pass, result.text);
    });
    tests.push(function () {
      const result = chiSquareTest(c, 100000, true);
      addRow("Other tilings, clocks, exact odds: " + c.name + ", " + c.steps + " steps", result.pass, result.text);
    });
  }
  const snubTorus = tilingDomain(tilingNamed("6-3-3/r60/r(h5)", true), 12, 12, true);
  const twoBox = tilingDomain(tilingNamed(TILINGS[11].code, false), 15, 15, false);
  for (const c of [
    tilingCases[0], tilingCases[2],
    Object.assign({ name: "truncated trihexagonal (4.6.12), r = 3", tiling: tilingNamed("12-6,4/m30/r(c2)", false), radius: 3 }, whole2),
    { name: "corners of the snub hexagonal tiling, r = 1, on a 12 x 12 torus", dim: 2, tiling: tilingNamed("6-3-3/r60/r(h5)", true),
      radius: 1, domain: snubTorus.domain, start: snubTorus.start },
    { name: "3⁶; 3².4.3.4, r = 2, in a 15 x 15 box", dim: 2, tiling: tilingNamed(TILINGS[11].code, false), radius: 2,
      domain: twoBox.domain, start: twoBox.start },
  ]) {
    tests.push(function () {
      const problem = checkInvariants(c, 3000);
      addRow("Other tilings, invariants: " + c.name + ", 3000 steps", problem === "", problem || "all hold after every step");
    });
    tests.push(function () {
      const problem = checkInvariants(Object.assign({ clocks: "invariants " + c.name }, c), 3000);
      addRow("Other tilings, clocks, invariants: " + c.name + ", 3000 steps", problem === "", problem || "all hold after every step");
    });
  }

  // The capacity, the coupling, the holes and the shape.
  const octTorus = tilingDomain(tilingNamed("8-4/m90/r(h4)", true), 8, 8, true), hexBig = tilingDomain(hex, 8, 8, false);
  for (const [name, options] of [
    ["triangles, r = 1, M = 1", Object.assign({ tiling: tri, radius: 1, cap: 1 }, whole2)],
    ["corners of 4.8², r = 2, M = 2, a small torus until full",
     { dim: 2, tiling: tilingNamed("8-4/m90/r(h4)", true), radius: 2, cap: 2, domain: octTorus.domain, start: octTorus.start }],
    ["hexagons, r = 1, M = 3, an 8 x 8 box until full", { dim: 2, tiling: hex, radius: 1, cap: 3, domain: hexBig.domain, start: hexBig.start }],
  ]) {
    tests.push(function () {
      const problem = checkMaxHeight(options, 2000, name);
      addRow("Other tilings, capacity: " + name + ", up to 2000 steps", problem === "", problem || "all hold after every step");
    });
    tests.push(function () {
      const problem = checkMaxHeight(Object.assign({ clocks: "max height " + name }, options), 2000, name);
      addRow("Other tilings, clocks, capacity: " + name + ", up to 2000 steps", problem === "", problem || "all hold after every step");
    });
  }
  tests.push(function () {
    const options = Object.assign({ tiling: tilingNamed("6-3-6/m30/r(v4)", false), radius: 1, cap: 1, clocks: "coupling" }, whole2);
    const problem = sameForEveryS(options, 1000, "kagome");
    addRow("Other tilings, clocks, M = 1: kagome, r = 1, s = -2, 0 and 1.5, 1000 steps", problem === "",
           problem || "the same mountain, block for block");
  });
  for (const [name, options, steps] of [
    ["triangles, M = 1", Object.assign({ tiling: tri, cap: 1, clocks: "tiling holes 1" }, whole2), 3000],
    ["corners of 3.12², M = 2, s = 1", Object.assign({ tiling: tilingNamed("12-3/m30/r(h3)", true), cap: 2, s: 1, clocks: "tiling holes 2" }, whole2), 3000],
    ["[3⁶; 3⁴.6]², no capacity", Object.assign({ tiling: tilingNamed(TILINGS[20].code, false), clocks: "tiling holes 3" }, whole2), 3000],
    ["hexagons, M = 1, an 8 x 8 box until full", { dim: 2, tiling: hex, cap: 1, clocks: "tiling holes 4", domain: hexBig.domain, start: hexBig.start }, 3000],
  ]) {
    tests.push(function () {
      const { problem, most } = checkTilingHoles(Object.assign({ radius: 1 }, options), steps);
      addRow("Other tilings, holes: " + name + ", r = 1, up to " + steps.toLocaleString() + " steps", problem === "",
             problem || "beta_1 matches Euler's formula at every step (at most " + most + (most === 1 ? " hole" : " holes") + " at once), and the holes' cells match the polygons'");
    });
  }
  tests.push(function () {
    const problems = [];
    for (const t of someTilings.slice(-4)) {
      for (const corners of [false, true]) {
        const problem = oneCellConvexity(tilingNamed(t.code, corners));
        if (problem) problems.push(t.name + (corners ? " (corners)" : "") + ": " + problem);
      }
    }
    addRow("Other tilings, shape: one cell alone has convexity 1, every kind of cell of 8 tilings", problems.length === 0,
           problems.join("; ") || "all 1");
  });
  for (const [name, options, steps] of [
    ["triangles, r = 1, M = 1", Object.assign({ tiling: tri, radius: 1, cap: 1, clocks: "tiling shape 1" }, whole2), 20000],
    ["corners of 4.6.12, r = 2, M = 2, s = -1", Object.assign({ tiling: tilingNamed("12-6,4/m30/r(c2)", true), radius: 2, cap: 2, s: -1,
                                                                clocks: "tiling shape 2" }, whole2), 10000],
    ["[3⁶; 3⁴.6]², r = 1, in a 30 x 30 box", (function () {
      const box = tilingDomain(tilingNamed(TILINGS[20].code, false), 30, 30, false);
      return { dim: 2, tiling: tilingNamed(TILINGS[20].code, false), radius: 1, domain: box.domain, start: box.start, clocks: "tiling shape 3" };
    })(), 10000],
  ]) {
    tests.push(function () {
      const problem = checkTilingShape(options, steps);
      addRow("Other tilings, shape: area and convexity, " + name + ", " + steps.toLocaleString() + " steps", problem === "",
             problem || "the area added up and the hull of every corner agree");
    });
    tests.push(function () {
      const problem = checkRadii(Object.assign({ shapeBins: 180 }, options), steps);
      addRow("Other tilings, shape: radius in each of 180 directions, " + name + ", " + steps.toLocaleString() + " steps", problem === "",
             problem || "kept block by block = found again from scratch");
    });
  }

  // 10. Penrose's tilings.
  const p1Box = tilingDomain(penroseBlock("P1", false), 16, 16, false);
  const p2Box = tilingDomain(penroseBlock("P2", true), 10, 10, false);
  const p3Box = tilingDomain(penroseBlock("P3", true), 20, 20, false);
  const penroseCases = [
    Object.assign({ name: "Penrose rhombs (P3), r = 1", steps: 4, tiling: penroseBlock("P3", false), radius: 1 }, whole2),
    Object.assign({ name: "Penrose P1, r = 2", steps: 2, tiling: penroseBlock("P1", false), radius: 2 }, whole2),
    { name: "corners of the kites and darts (P2), r = 1, s = 1, in a 10 x 10 box", steps: 4, dim: 2, tiling: p2Box.tiling, radius: 1,
      domain: p2Box.domain, start: p2Box.start, s: 1 },
  ];
  for (const c of penroseCases) {
    tests.push(function () {
      const result = chiSquareTest(c, 100000);
      addRow("Penrose tilings, exact odds: " + c.name + ", " + c.steps + " steps", result.pass, result.text);
    });
    tests.push(function () {
      const result = chiSquareTest(c, 100000, true);
      addRow("Penrose tilings, clocks, exact odds: " + c.name + ", " + c.steps + " steps", result.pass, result.text);
    });
  }
  for (const make of [
    function () { return Object.assign({ name: "Penrose P1, r = 1", tiling: penroseBlock("P1", false), radius: 1 }, whole2); },
    function () {
      return { name: "corners of the rhombs (P3), r = 2, in a 20 x 20 box", dim: 2, tiling: p3Box.tiling, radius: 2,
               domain: p3Box.domain, start: p3Box.start };
    },
  ]) {
    tests.push(function () {
      const c = make(), problem = checkInvariants(c, 3000);
      addRow("Penrose tilings, invariants: " + c.name + ", 3000 steps", problem === "", problem || "all hold after every step");
    });
    tests.push(function () {
      const c = make(), problem = checkInvariants(Object.assign({ clocks: "invariants " + c.name }, c), 3000);
      addRow("Penrose tilings, clocks, invariants: " + c.name + ", 3000 steps", problem === "", problem || "all hold after every step");
    });
  }
  for (const [kind, corners, name] of [["P1", false, "Penrose P1"], ["P2", true, "corners of the kites and darts (P2)"],
                                       ["P3", false, "Penrose rhombs (P3)"]]) {
    tests.push(function () {
      const problem = checkBoxTiles(kind, corners, 16, 4);
      addRow("Penrose tilings, in a box: " + name + ", 16 x 16, r = 4", problem === "",
             problem || "every cell's tile has every cell of the box within 4 steps, as on a bigger patch");
    });
  }
  for (const [kind, corners, name, extra] of [["P3", false, "Penrose rhombs (P3), r = 1, M = 1", { radius: 1, cap: 1 }],
                                              ["P2", true, "corners of the kites and darts (P2), r = 2, M = 2, s = 1", { radius: 2, cap: 2, s: 1 }]]) {
    tests.push(function () {
      const { problem, steps } = sameInBoxAndPlane(kind, corners, 20, extra, 5000);
      addRow("Penrose tilings, clocks, a 20 x 20 box and the whole plane: " + name, problem === "",
             problem || "the same mountain for " + steps + " steps, until the one on the plane first left the box");
    });
  }
  for (const [name, make, steps] of [
    ["kites and darts (P2), M = 1", function () { return Object.assign({ tiling: penroseBlock("P2", false), cap: 1, clocks: "penrose holes 1" }, whole2); }, 3000],
    ["corners of the rhombs (P3), no capacity", function () { return Object.assign({ tiling: penroseBlock("P3", true), clocks: "penrose holes 2" }, whole2); }, 3000],
    ["Penrose P1, M = 1, a 16 x 16 box until full", function () {
      return { dim: 2, tiling: p1Box.tiling, cap: 1, clocks: "penrose holes 3", domain: p1Box.domain, start: p1Box.start };
    }, 3000],
  ]) {
    tests.push(function () {
      const { problem, most } = checkTilingHoles(Object.assign({ radius: 1 }, make()), steps);
      addRow("Penrose tilings, holes: " + name + ", r = 1, up to " + steps.toLocaleString() + " steps", problem === "",
             problem || "beta_1 matches Euler's formula at every step (at most " + most + (most === 1 ? " hole" : " holes") + " at once), and the holes' cells match the polygons'");
    });
  }
  for (const [name, make, steps] of [
    ["Penrose rhombs (P3), r = 1, M = 1", function () {
      return Object.assign({ tiling: penroseBlock("P3", false), radius: 1, cap: 1, clocks: "penrose shape 1" }, whole2);
    }, 10000],
    ["corners of the kites and darts (P2), r = 2, M = 2, s = -1", function () {
      return Object.assign({ tiling: penroseBlock("P2", true), radius: 2, cap: 2, s: -1, clocks: "penrose shape 2" }, whole2);
    }, 5000],
  ]) {
    tests.push(function () {
      const problem = checkTilingShape(make(), steps);
      addRow("Penrose tilings, shape: area and convexity, " + name + ", " + steps.toLocaleString() + " steps", problem === "",
             problem || "the area added up and the hull of every corner agree");
    });
    tests.push(function () {
      const problem = checkRadii(Object.assign({ shapeBins: 180 }, make()), steps);
      addRow("Penrose tilings, shape: radius in each of 180 directions, " + name + ", " + steps.toLocaleString() + " steps", problem === "",
             problem || "kept block by block = found again from scratch");
    });
  }
  for (const [kind, corners, name, r] of [["P1", false, "Penrose P1", 2], ["P2", true, "corners of the kites and darts (P2)", 6]]) {
    tests.push(function () {
      const problem = checkPlaneEdge(kind, corners, r);
      addRow("Penrose tilings, the edge of the plane: " + name + ", r = " + r + ", M = 1, from 120 side lengths out", problem === "",
             problem || "it stops when a new base cell is just past " + (PENROSE_PLANE_MOST - 4 * r - 8) + " out, and every tile is whole");
    });
  }
  return tests;
}

// The tile of every offset at distance r1 to r2 (as the page's Ring button).
function ringTile(r1, r2) {
  const tile = [];
  for (let dx = -r2; dx <= r2; dx++) {
    for (let dy = -r2; dy <= r2; dy++) {
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= r1 && r <= r2) tile.push([dx, dy]);
    }
  }
  return tile;
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
