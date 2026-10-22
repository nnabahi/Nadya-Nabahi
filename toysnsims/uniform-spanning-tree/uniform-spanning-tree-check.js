/* =====================================================================
   uniform-spanning-tree-check.js  —  the tests on uniform-spanning-tree-check.html
   ---------------------------------------------------------------------
   Tests of the spanning tree code in js/sim-spanning.js, which the sim
   uses (and Connected Coloring too):

     1. Counting spanning trees (newTreeCounter) gives the known counts:
        Cayley's n^(n-2) for the complete graph (Lyons and Peres,
        "Probability on Trees and Networks", Corollary 4.5), n for a
        cycle of n cells, 1 for a tree, and 192 and 100352 for the 3 x 3
        and 4 x 4 grids (the matrix-tree theorem, worked out by hand for
        the 3 x 3: OEIS A007341). Both of its ways (the banded Cholesky
        and removing the cells one at a time) are used.
     2. Wilson's algorithm (newWilson) makes a spanning tree every time,
        and every spanning tree equally often: on small graphs, many
        trees are made, every one of the tau trees (tau from test 1)
        comes up, and a chi-square test checks they are equally likely.
        The walks start in number order, and again in a shuffled order,
        with the root in different places: the tree is uniform whatever
        the order and the root (D. B. Wilson, STOC 1996; Lyons and
        Peres, Theorem 4.1).
     3. The colors (how many times the walks stepped out of each cell)
        are independent of the tree (Lyons and Peres, Section 4.1): the
        color of a cell is tallied separately for the trees with and
        without a given edge, and a chi-square test checks the two
        tallies have the same law.
     4. The path in the tree from a cell to the root has the law of the
        loop-erased random walk from that cell to the root (Lyons and
        Peres, Corollary 4.3; R. Pemantle, Ann. Probab. 19 (1991)), even
        when that cell's walk is the last one: the paths are tallied
        from the trees and from loop-erased walks made directly, and
        compared by a chi-square test.
     5. Distances in the tree (treeDistances) and the path between two
        cells (treePath) match a plain breadth-first search through the
        tree's edges, on boxes, tori and a tiling; and the tree moved to
        a new root (rerootTree) has the same edges, with the new root at
        the top.

   Random numbers come from the library seedrandom, with fixed seeds,
   so the tests do the same thing every time. Chi-square p-values come
   from jStat; a test passes when p is above 0.001.
   ===================================================================== */

// A graph with cells 0 .. n-1 and the edges [a, b] in "edges", stored
// as the domains are (first, nbr: see js/sim-domains.js).
function graphFromEdges(n, edges) {
  return Object.assign({ n: n }, neighborLists(n, edges));   // (js/sim-domains.js)
}

// The complete graph on n cells, a cycle of n cells, and a star (one
// cell joined to n - 1 others: a tree).
function completeGraph(n) {
  const edges = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) edges.push([a, b]);
  return graphFromEdges(n, edges);
}
function cycleGraph(n) {
  const edges = [];
  for (let a = 0; a < n; a++) edges.push([a, (a + 1) % n]);
  return graphFromEdges(n, edges);
}
function starGraph(n) {
  const edges = [];
  for (let a = 1; a < n; a++) edges.push([0, a]);
  return graphFromEdges(n, edges);
}

// All the cells of graph g, 0 .. n-1.
function allCells(g) { return Array.from({ length: g.n }, function (_, v) { return v; }); }

// The number of spanning trees of graph g (newTreeCounter).
function treeCount(g) {
  return Math.exp(newTreeCounter(g.n, g.first, g.nbr).logCount(allCells(g)));
}

// A Wilson's algorithm on graph g whose walks step to uniformly random
// neighbors, with random numbers from "random".
function wilsonOn(g, random) {
  return newWilson(g.n, function (v) {
    return g.nbr[g.first[v] + Math.floor(random() * (g.first[v + 1] - g.first[v]))];
  });
}

// A tree as text, to tally: its edges, each written small cell first,
// sorted. (The same tree from different roots gives the same text.)
function treeKey(parent) {
  const edges = [];
  for (let v = 0; v < parent.length; v++) {
    if (parent[v] !== -1) edges.push(Math.min(v, parent[v]) + "-" + Math.max(v, parent[v]));
  }
  return edges.sort().join(" ");
}

// Is "parent" a spanning tree of graph g: n - 1 edges, each one of g's,
// and every cell reaching the root?
function isSpanningTree(g, parent, root) {
  let edges = 0;
  for (let v = 0; v < g.n; v++) {
    if (parent[v] === -1) { if (v !== root) return false; continue; }
    edges++;
    let isEdge = false;
    for (let e = g.first[v]; e < g.first[v + 1]; e++) if (g.nbr[e] === parent[v]) isEdge = true;
    if (!isEdge) return false;
  }
  if (edges !== g.n - 1) return false;
  for (let v = 0; v < g.n; v++) {
    let u = v, steps = 0;
    while (u !== root && steps <= g.n) { u = parent[u]; steps++; }
    if (u !== root) return false;
  }
  return true;
}

// Is a list of tallies (one per group of outcomes) the same law in every
// row? Pearson's chi-square test of homogeneity (K. Pearson, 1900): the
// expected count in row i, column j is (row i's total) (column j's
// total) / (everything), with (rows - 1) (columns - 1) degrees of
// freedom. Columns expected fewer than 5 times in some row are pooled
// into one (as in pooledChiSquare, js/check-page.js). "rows" are Maps
// from outcome to count. Returns { statistic, degrees, pValue }.
function homogeneityTest(rows) {
  const outcomes = new Map();       // outcome -> its total over the rows
  for (const row of rows) for (const [k, c] of row) outcomes.set(k, (outcomes.get(k) || 0) + c);
  const rowTotals = rows.map(function (row) { let t = 0; for (const c of row.values()) t += c; return t; });
  const total = rowTotals.reduce(function (a, b) { return a + b; }, 0);
  const smallest = Math.min(...rowTotals) / total;
  // The columns: the outcomes with enough expected in every row, and one
  // pooled column for the rest.
  const columns = [], pooled = [];
  for (const [k, t] of outcomes) (t * smallest >= 5 ? columns : pooled).push(k);
  const tables = rows.map(function (row) {
    const cells = columns.map(function (k) { return row.get(k) || 0; });
    if (pooled.length) cells.push(pooled.reduce(function (s, k) { return s + (row.get(k) || 0); }, 0));
    return cells;
  });
  const width = tables[0].length;
  const columnTotals = new Array(width).fill(0);
  for (const cells of tables) cells.forEach(function (c, j) { columnTotals[j] += c; });
  let statistic = 0;
  tables.forEach(function (cells, i) {
    cells.forEach(function (c, j) {
      const expected = rowTotals[i] * columnTotals[j] / total;
      if (expected > 0) statistic += (c - expected) ** 2 / expected;
    });
  });
  const degrees = (rows.length - 1) * (width - 1);
  return { statistic: statistic, degrees: degrees, pValue: degrees > 0 ? 1 - jStat.chisquare.cdf(statistic, degrees) : 1 };
}

// The cells 0 .. n-1 in a random order (Fisher-Yates shuffle).
function shuffled(n, random) {
  const order = Array.from({ length: n }, function (_, v) { return v; });
  for (let k = n - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return order;
}


/* 1. Counting spanning trees. */
function testCounts() {
  const cases = [
    { name: "the complete graph on 6 cells (6^4)", g: completeGraph(6), count: Math.pow(6, 4) },
    { name: "the complete graph on 12 cells (12^10)", g: completeGraph(12), count: Math.pow(12, 10) },
    { name: "a cycle of 9 cells", g: cycleGraph(9), count: 9 },
    { name: "a star of 30 cells (a tree)", g: starGraph(30), count: 1 },
    { name: "the 3 x 3 grid", g: boxDomain(3, 3, 4, false), count: 192 },
    { name: "the 4 x 4 grid", g: boxDomain(4, 4, 4, false), count: 100352 },
  ];
  for (const c of cases) {
    const found = treeCount(c.g), gap = Math.abs(found - c.count) / c.count;
    addRow("Counting spanning trees: " + c.name, gap < 1e-9,
      "expected " + c.count.toLocaleString() + ", found " + Math.round(found).toLocaleString() +
      " (off by " + gap.toExponential(1) + " of it).");
  }
}


/* 2. Wilson's algorithm is uniform. */
function testUniform() {
  const cases = [
    { name: "the 3 x 3 grid", g: boxDomain(3, 3, 4, false) },
    { name: "the complete graph on 5 cells", g: completeGraph(5) },
    { name: "a 2 x 3 box with 8 neighbors", g: boxDomain(3, 2, 8, false) },
    { name: "a 3 x 3 torus", g: boxDomain(3, 3, 4, true) },
  ];
  for (const c of cases) {
    for (const orderKind of ["number order", "a shuffled order"]) {
      const g = c.g, random = new Math.seedrandom("uniform " + c.name + orderKind);
      const tau = Math.round(treeCount(g)), runs = 60 * tau;
      const wilson = wilsonOn(g, random), seen = new Map();
      let allTrees = true;
      for (let k = 0; k < runs; k++) {
        const root = Math.floor(random() * g.n);
        const order = orderKind === "number order" ? allCells(g) : shuffled(g.n, random);
        wilson.start([root], order);
        wilson.finish();
        if (!isSpanningTree(g, wilson.parent, root)) allTrees = false;
        const key = treeKey(wilson.parent);
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      const counts = Array.from(seen.values());
      while (counts.length < tau) counts.push(0);          // trees never seen count too
      const test = equalChiSquare(counts);
      addRow("Uniform: " + c.name + ", walks in " + orderKind,
        allTrees && seen.size === tau && test.pValue > 0.001,
        runs.toLocaleString() + " trees, roots at random: " + (allTrees ? "all spanning trees" : "NOT all spanning trees") +
        ", " + seen.size + " different ones of the " + tau + " there are, chi-square " + test.statistic.toFixed(1) +
        " on " + test.degrees + " degrees of freedom, p = " + test.pValue.toFixed(3) + ".");
    }
  }
}


/* 3. The colors are independent of the tree. */
function testColors() {
  const g = boxDomain(4, 4, 4, false), random = new Math.seedrandom("colors");
  const root = 0, x = 10, runs = 40000;
  // The edge watched: from cell x to its first neighbor.
  const y = g.nbr[g.first[x]];
  const withEdge = new Map(), withoutEdge = new Map();
  const wilson = wilsonOn(g, random);
  for (let k = 0; k < runs; k++) {
    wilson.start([root], allCells(g));
    wilson.finish();
    const has = wilson.parent[x] === y || wilson.parent[y] === x;
    const tally = has ? withEdge : withoutEdge, color = wilson.exits[x];
    tally.set(color, (tally.get(color) || 0) + 1);
  }
  const test = homogeneityTest([withEdge, withoutEdge]);
  addRow("The colors are independent of the tree", test.pValue > 0.001,
    runs.toLocaleString() + " trees of the 4 x 4 grid: the color of a cell in the trees with a given edge " +
    "and in those without it, chi-square " + test.statistic.toFixed(1) + " on " + test.degrees +
    " degrees of freedom, p = " + test.pValue.toFixed(3) + ".");
}


/* 4. The path to the root is a loop-erased random walk. */
function testLoopErased() {
  const g = boxDomain(3, 3, 4, false), random = new Math.seedrandom("loop-erased");
  const root = 0, start = 8, runs = 30000;
  // From the trees: the walks start in a shuffled order with "start"
  // last, so its path is mostly made by the other walks.
  const fromTrees = new Map(), wilson = wilsonOn(g, random);
  for (let k = 0; k < runs; k++) {
    const order = shuffled(g.n, random).filter(function (v) { return v !== start; }).concat([start]);
    wilson.start([root], order);
    wilson.finish();
    const key = treePath(wilson.parent, start, root).join(" ");
    fromTrees.set(key, (fromTrees.get(key) || 0) + 1);
  }
  // Made directly: a random walk from "start" until it hits the root,
  // with each loop erased as soon as it closes.
  const direct = new Map();
  for (let k = 0; k < runs; k++) {
    const path = [start];
    while (path[path.length - 1] !== root) {
      const v = path[path.length - 1];
      const w = g.nbr[g.first[v] + Math.floor(random() * (g.first[v + 1] - g.first[v]))];
      const at = path.indexOf(w);
      if (at >= 0) path.length = at + 1; else path.push(w);
    }
    const key = path.join(" ");
    direct.set(key, (direct.get(key) || 0) + 1);
  }
  const test = homogeneityTest([fromTrees, direct]);
  addRow("The path to the root is a loop-erased random walk", test.pValue > 0.001,
    runs.toLocaleString() + " paths each, on the 3 x 3 grid from one corner to the other (" + fromTrees.size +
    " different paths seen): chi-square " + test.statistic.toFixed(1) + " on " + test.degrees +
    " degrees of freedom, p = " + test.pValue.toFixed(3) + ".");
}


/* 5. Distances and paths in the tree, against a plain search. */
function testDistances() {
  const domains = [
    { name: "a 12 x 9 box", d: boxDomain(12, 9, 4, false) },
    { name: "a 10 x 10 torus with 8 neighbors", d: boxDomain(10, 10, 8, true) },
    { name: "a box of the kagome tiling (3.6.3.6)", d: tilingBox(tilingBlock("6-3-6/m30/r(v4)", false), 8, 8, false) },
  ];
  let checked = 0, problems = [];
  for (const { name, d } of domains) {
    const random = new Math.seedrandom("distances " + name), wilson = wilsonOn(d, random);
    for (let k = 0; k < 5; k++) {
      const root = Math.floor(random() * d.n);
      wilson.start([root], allCells(d));
      wilson.finish();
      const parent = wilson.parent;
      // The tree's edges, both ways, for the plain search.
      const near = [];
      for (let v = 0; v < d.n; v++) near.push([]);
      for (let v = 0; v < d.n; v++) if (parent[v] !== -1) { near[v].push(parent[v]); near[parent[v]].push(v); }
      const search = function (sources) {
        const distance = new Array(d.n).fill(-1), queue = sources.slice();
        for (const s of sources) distance[s] = 0;
        for (let h = 0; h < queue.length; h++) {
          for (const w of near[queue[h]]) if (distance[w] === -1) { distance[w] = distance[queue[h]] + 1; queue.push(w); }
        }
        return distance;
      };
      const a = Math.floor(random() * d.n), b = Math.floor(random() * d.n);
      const path = treePath(parent, a, b), fromA = search([a]);
      if (path[0] !== a || path[path.length - 1] !== b || path.length - 1 !== fromA[b]) problems.push(name + ": the path from a to b");
      for (let j = 0; j + 1 < path.length; j++) if (!near[path[j]].includes(path[j + 1])) problems.push(name + ": a step of the path");
      for (const sources of [[root], [a], path]) {
        const mine = treeDistances(d.n, parent, root, sources), plain = search(sources);
        for (let v = 0; v < d.n; v++) if (mine[v] !== plain[v]) { problems.push(name + ": a distance"); break; }
        checked++;
      }
      // Moved to the root a: a is the top, every other cell points to a
      // tree neighbor, and the distances to a are the same.
      const moved = rerootTree(parent, a);
      if (moved[a] !== -1) problems.push(name + ": the new root");
      for (let v = 0; v < d.n; v++) if (v !== a && !near[v].includes(moved[v])) { problems.push(name + ": an edge of the moved tree"); break; }
      const movedDistance = treeDistances(d.n, moved, a, [a]);
      for (let v = 0; v < d.n; v++) if (movedDistance[v] !== fromA[v]) { problems.push(name + ": a distance in the moved tree"); break; }
      checked++;
    }
  }
  addRow("Distances, paths and new roots in the tree", problems.length === 0,
    checked + " sets of distances (to the root, to a cell, to a path, and to a new root) on " + domains.map(function (x) { return x.name; }).join(", ") +
    (problems.length === 0 ? ": all match a plain search through the tree." : ": wrong at " + problems.slice(0, 3).join("; ") + "."));
}


runChecksOnClick(function () {
  return [testCounts, testUniform, testColors, testLoopErased, testDistances];
});
