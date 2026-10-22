/* =====================================================================
   check-page.js  —  small helpers the check pages share
   ---------------------------------------------------------------------
   A check page (like toysnsims/sandpiles/sandpiles-check.html) tests a sim's
   math on its own and shows the results in a table. Every check page
   has a link back to its sim at the top, and the same table: pass or
   FAIL, what was checked, and what the test found. The check pages
   load this file after js/sim-page.js (for byId) and before their own
   tests.

   Contents:
     addRow(test, pass, text)   one row of the results table
     runChecksOnClick(allTests) the "Run the checks" button
     readNumbers(text)          the numbers in a list pasted from Python
   and the tests several pages use (the p-values come from the library
   jStat, which those pages load):
     pooledChiSquare(odds, seen, runs)   do counts match exact odds?
     equalChiSquare(counts)              are some outcomes equally likely?
     binomialZ(count, trials, p)         how far a count is from its mean
   and, to test the holes found by holeHistory (js/sim-shape.js):
     countHoles(cells)                   the holes of a set of cells, counted plainly
   and, for the pages that test tilings (they load js/sim-tilings.js,
   whose tilingBlock(code, corners) builds a tiling as the sims do, and
   js/sim-domains.js, whose middleAt and cornersAt say where its cells
   are):
     spotKey(u, w), sideKeysAt(...)      points and sides as text, to match them up
     eulerCounter(tiling)                the holes of a growing set of cells, by Euler's formula
     holesFromPolygons(set)              its holes and outer boundary, from the polygons alone
     holesAgainstEuler(set, h, steps)    holeHistory's answer against Euler's formula ...
     holesAgainstPolygons(set, h)        ... and against the polygons
   and, to test the counting of regions (js/sim-domains.js):
     unionFindRegions(d, colors)         each cell's region, found another way
     testRegions()                       the regions counted and highlighted, on many domains
   ===================================================================== */


// One row of the results table (<tbody id="results">): pass or FAIL,
// the test's name, and what the test found.
function addRow(test, pass, text) {
  const row = document.createElement("tr");
  row.innerHTML = "<td></td><td></td><td></td>";
  row.children[0].textContent = pass ? "✓ pass" : "✗ FAIL";
  row.children[0].className = pass ? "check-pass" : "check-fail";
  row.children[1].textContent = test;
  row.children[2].textContent = text;
  byId("results").appendChild(row);
}

// The "Run the checks" button (id="run-checks"). Each press empties the
// table, asks allTests() for a fresh list of tests (functions that each
// add their own rows), and runs them one at a time with a pause between
// them, so the page shows each result as it comes. The button is off
// until the last one is done. A test that crashes gets a FAIL row
// saying what went wrong, and the others still run.
function runChecksOnClick(allTests) {
  const button = byId("run-checks");
  button.addEventListener("click", function () {
    byId("results").innerHTML = "";
    const tests = allTests();
    button.disabled = true;
    function next() {
      if (tests.length === 0) { button.disabled = false; return; }
      try { tests.shift()(); }
      catch (error) { addRow("A check crashed", false, "It stopped with an error: " + error.message); }
      setTimeout(next, 0);
    }
    next();
  });
}

// The numbers in a list printed by Python, like "[[0, 1], [2, 3]]"
// (brackets and commas are skipped).
function readNumbers(text) {
  return text.replace(/[\[\]]/g, " ").split(/[\s,]+/).filter(function (s) { return s !== ""; }).map(Number);
}


/* ---------------------------------------------------------------------
   The tests several pages use
   ---------------------------------------------------------------------
   Pearson's chi-square test (K. Pearson, Philosophical Magazine 50
   (1900) 157-175): with "expected" the count each outcome should have,
   the statistic is the sum of (seen - expected)^2 / expected. If the
   counts come from the right odds, it has about the chi-square
   distribution with (number of groups - 1) degrees of freedom, and the
   p-value is the chance of a statistic at least this big. A page
   passes p above 0.001, so a correct sim fails 1 time in 1000.
   --------------------------------------------------------------------- */

// Do the counts match exact odds? "odds" maps each possible outcome to
// its probability, "seen" maps outcomes to how often they came up, in
// "runs" runs. Outcomes expected fewer than 5 times are pooled into one
// group, the usual rule (W. G. Cochran, "Some methods for strengthening
// the common chi-square tests", Biometrics 10 (1954) 417-451).
// Returns { statistic, groups, degrees, pValue }.
function pooledChiSquare(odds, seen, runs) {
  let statistic = 0, groups = 0, pooledSeen = 0, pooledExpected = 0;
  for (const [outcome, p] of odds) {
    const expected = p * runs, observed = seen.get(outcome) || 0;
    if (expected < 5) { pooledSeen += observed; pooledExpected += expected; continue; }
    statistic += (observed - expected) ** 2 / expected;
    groups += 1;
  }
  if (pooledExpected > 0) {
    statistic += (pooledSeen - pooledExpected) ** 2 / pooledExpected;
    groups += 1;
  }
  const degrees = groups - 1;
  return { statistic: statistic, groups: groups, degrees: degrees, pValue: 1 - jStat.chisquare.cdf(statistic, degrees) };
}

// Are the outcomes equally likely? "counts" is how often each came up.
// Returns { statistic, degrees, pValue }.
function equalChiSquare(counts) {
  let total = 0;
  for (const c of counts) total += c;
  const expected = total / counts.length;
  let statistic = 0;
  for (const c of counts) statistic += (c - expected) ** 2 / expected;
  const degrees = counts.length - 1;
  return { statistic: statistic, degrees: degrees, pValue: 1 - jStat.chisquare.cdf(statistic, degrees) };
}

// How many standard deviations "count" is from its mean, when each of
// "trials" independent tries succeeds with probability p: the count is
// binomial, with mean trials p and standard deviation
// sqrt(trials p (1 - p)). Pages pass below 4 (in absolute value):
// by the normal approximation (the central limit theorem, R. Durrett,
// "Probability: Theory and Examples", 5th ed., Cambridge University
// Press, 2019, Theorem 3.4.1), a correct sim is that far off about 1
// time in 16000.
function binomialZ(count, trials, p) {
  return (count - trials * p) / Math.sqrt(trials * p * (1 - p));
}


// The number of holes of a set of square cells (a list of [x, y]): the
// groups of empty cells, joined side to side, that can't reach the edge
// of the box around the cells (one cell bigger all round). Found by a
// plain flood fill, as slowly and simply as possible, to test the
// quicker holeHistory (js/sim-shape.js) against.
function countHoles(cells) {
  const filled = new Set();
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of cells) {
    filled.add(x + "," + y);
    xmin = Math.min(xmin, x - 1); xmax = Math.max(xmax, x + 1);
    ymin = Math.min(ymin, y - 1); ymax = Math.max(ymax, y + 1);
  }
  const seen = new Set();
  let holes = 0;
  for (let x = xmin; x <= xmax; x++) {
    for (let y = ymin; y <= ymax; y++) {
      if (filled.has(x + "," + y) || seen.has(x + "," + y)) continue;
      let bounded = true;
      const todo = [[x, y]];
      seen.add(x + "," + y);
      while (todo.length > 0) {
        const [a, b] = todo.pop();
        if (a === xmin || a === xmax || b === ymin || b === ymax) bounded = false;
        for (const [c, d] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
          const key = c + "," + d;
          if (c < xmin || c > xmax || d < ymin || d > ymax || filled.has(key) || seen.has(key)) continue;
          seen.add(key);
          todo.push([c, d]);
        }
      }
      if (bounded) holes += 1;
    }
  }
  return holes;
}


// A point as text, rounded to 6 decimals, so the same point worked out
// from two cells gets the same text.
function spotKey(u, w) { return Math.round(u * 1e6) + "," + Math.round(w * 1e6); }

// The middles of the sides of cell z of block (x, y), as text (spotKey).
function sideKeysAt(tiling, x, y, z) {
  const c = cornersAt(tiling, x, y, z);
  return c.map(function (p, k) {
    const q = c[(k + 1) % c.length];
    return spotKey((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  });
}

// Euler's formula for a growing union K of a tiling's closed cells,
// given cell by cell with add(x, y, z) (cell z of block (x, y)). While
// K is connected, holes() is its number of holes beta_1(K) = 1 - V + E
// - F, where K has F cells, E sides and V corners (beta_0 = 1, and
// beta_0 - beta_1 = V - E + F: A. Hatcher, "Algebraic Topology",
// Cambridge University Press, 2002, Theorem 2.44). A side is known by
// its middle, and a corner by where it is (spotKey).
function eulerCounter(tiling) {
  const corners = new Set(), sides = new Set();
  let faces = 0;
  return {
    add: function (x, y, z) {
      for (const p of cornersAt(tiling, x, y, z)) corners.add(spotKey(p[0], p[1]));
      for (const side of sideKeysAt(tiling, x, y, z)) sides.add(side);
      faces++;
    },
    holes: function () { return 1 - corners.size + sides.size - faces; },
  };
}

// The holes and the outer boundary of a set of a tiling's cells (a
// walk's visited cells, say: "set" has tiling, siteX, siteY and siteZ,
// cell i being cell siteZ[i] of block (siteX[i], siteY[i])), found as
// slowly and plainly as possible from the polygons alone: two cells are
// neighbors when they have a side in common (the same middle of a
// side). In a window of cells around the set (plainWindow), the empty
// cells are flooded from the window's edge; the empty cells it doesn't
// reach are the holes' cells, in groups of neighbors. Returns { sizes,
// cells (as text "x,y,z"), frontier (the sides between a cell of the
// set and a flooded one) }.
function holesFromPolygons(set) {
  const tiling = set.tiling, xs = set.siteX, ys = set.siteY;
  const visited = new Set(xs.map(function (x, i) { return x + "," + ys[i] + "," + set.siteZ[i]; }));
  // Every cell of the window, and for each side's middle the cells with that side.
  const cells = [], bySide = new Map();
  for (const [x, y, z, edge] of plainWindow(set)) {
    const cell = { key: x + "," + y + "," + z, full: false, reached: false, edge: edge, next: [] };
    cell.full = visited.has(cell.key);
    for (const side of sideKeysAt(tiling, x, y, z)) {
      if (!bySide.has(side)) bySide.set(side, []);
      bySide.get(side).push(cell);
    }
    cells.push(cell);
  }
  // A side no other cell of the window has is on the window's border
  // (or a patch's: a box of a Penrose tiling's patch reaches only 2
  // past the box), and what is past it is empty: its cell is an edge
  // cell too.
  for (const pair of bySide.values()) {
    if (pair.length === 2) { pair[0].next.push(pair[1]); pair[1].next.push(pair[0]); }
    else pair[0].edge = true;
  }
  // The flood from the edge.
  const todo = cells.filter(function (cell) { return cell.edge && !cell.full; });
  for (const cell of todo) cell.reached = true;
  let frontier = 0;
  while (todo.length > 0) {
    for (const n of todo.pop().next) {
      if (n.full) frontier++;
      else if (!n.reached) { n.reached = true; todo.push(n); }
    }
  }
  // The groups of empty cells it didn't reach.
  const sizes = [], holeCells = new Set();
  for (const cell of cells) {
    if (cell.full || cell.reached) continue;
    let size = 0;
    const group = [cell];
    cell.reached = true;
    while (group.length > 0) {
      const c = group.pop();
      size++;
      holeCells.add(c.key);
      for (const n of c.next) if (!n.full && !n.reached) { n.reached = true; group.push(n); }
    }
    sizes.push(size);
  }
  return { sizes: sizes, cells: holeCells, frontier: frontier };
}

// holeHistory's answer h (js/sim-shape.js) for a set of a tiling's
// cells ("set" as holeHistory has it, its cells in the order they
// joined, connected at every step), against Euler's formula: beta_1
// from h's births and deaths = eulerCounter's at every step 0 .. steps.
// Returns { problem, most }: what is wrong ("" if nothing), and the most
// holes there were at once.
function holesAgainstEuler(set, h, steps) {
  const beta = bettiOverTime(h, Array.from({ length: steps + 1 }, function (_, step) { return step; }));
  const counter = eulerCounter(set.tiling);
  let i = 0, most = 0;
  for (let step = 0; step <= steps; step++) {
    for (; i < set.siteX.length && set.bornAt[i] === step; i++) counter.add(set.siteX[i], set.siteY[i], set.siteZ[i]);
    const euler = counter.holes();
    most = Math.max(most, euler);
    if (euler !== beta[step]) {
      return { problem: "step " + step + ": " + beta[step] + " holes from the births and deaths, " + euler + " by Euler's formula",
               most: most };
    }
  }
  return { problem: "", most: most };
}

// holeHistory's answer h for the same set, now: its holes (how many,
// their sizes and their cells) and the set's outer boundary
// (frontierLength, js/sim-shape.js) against those found from the
// polygons alone (holesFromPolygons). Returns { problems (none if they
// agree), holes, cells, frontier }.
function holesAgainstPolygons(set, h) {
  const plain = holesFromPolygons(set), frontier = frontierLength(set), problems = [];
  const ours = new Set();
  for (let k = 0; k < h.holeCells.length; k += 3) ours.add(h.holeCells[k] + "," + h.holeCells[k + 1] + "," + h.holeCells[k + 2]);
  const sizes = function (list) { return Array.from(list).sort(function (a, b) { return a - b; }).join(" "); };
  const sameCells = ours.size === plain.cells.size && [...ours].every(function (key) { return plain.cells.has(key); });
  if (plain.sizes.length !== h.openBirths.length) {
    problems.push(plain.sizes.length + " holes from the polygons, " + h.openBirths.length + " open");
  }
  if (sizes(plain.sizes) !== sizes(h.holeSizes)) problems.push("hole sizes " + sizes(h.holeSizes) + ", from the polygons " + sizes(plain.sizes));
  if (!sameCells) problems.push("the holes' cells differ from the polygons'");
  if (frontier !== plain.frontier) problems.push("outer boundary " + frontier + ", from the polygons " + plain.frontier);
  return { problems: problems, holes: plain.sizes.length, cells: ours.size, frontier: frontier };
}

// The window of cells holesFromPolygons looks at, as [x, y, z, edge]
// for cell z of block (x, y), edge true for the cells it floods from.
// On a tiling that repeats: the blocks around the set's cells, 3 more
// all round, edge the outermost blocks. On one that never repeats (one
// block, a patch: js/sim-penrose.js), the patch's cells whose middles
// are within 6 of the box around the set's middles, edge those more
// than 4 out. (least and most are in js/sim-domains.js.)
function plainWindow(set) {
  const tiling = set.tiling, window = [];
  if (tiling.finite) {
    const middles = set.siteZ.map(function (z) { return tiling.cells[z].middle; });
    const us = middles.map(function (m) { return m[0]; }), ws = middles.map(function (m) { return m[1]; });
    const left = least(us), right = most(us), bottom = least(ws), top = most(ws);
    tiling.cells.forEach(function (cell, z) {
      const [u, w] = cell.middle, out = Math.max(left - u, u - right, bottom - w, w - top, 0);
      if (out <= 6) window.push([0, 0, z, out > 4]);
    });
    return window;
  }
  const MARGIN = 3, xs = set.siteX, ys = set.siteY;
  const xmin = least(xs) - MARGIN, xmax = most(xs) + MARGIN;
  const ymin = least(ys) - MARGIN, ymax = most(ys) + MARGIN;
  for (let x = xmin; x <= xmax; x++) {
    for (let y = ymin; y <= ymax; y++) {
      for (let z = 0; z < tiling.cells.length; z++) window.push([x, y, z, x === xmin || x === xmax || y === ymin || y === ymax]);
    }
  }
  return window;
}

/* ---------------------------------------------------------------------
   Counting regions
   ---------------------------------------------------------------------
   The sims count the regions of a coloring (connected pieces of one
   color) and highlight a clicked cell's region with a search
   (findRegions, countPieces and regionOf, js/sim-domains.js). testRegions
   checks them against regions found another way, by union-find: start
   with every cell on its own, and join the two cells of every edge
   whose ends have the same color (B. A. Galler and M. J. Fischer, "An
   improved equivalence algorithm", Communications of the ACM 7 (1964)
   301-303). The pages that use it load js/sim-domains.js,
   js/sim-tilings.js and the library seedrandom.
   --------------------------------------------------------------------- */

// Each cell's region, by union-find: root[v] is the same number for
// two cells exactly when they are in the same region (-1: no color).
function unionFindRegions(d, colors) {
  const parent = Int32Array.from({ length: d.n }, function (x, v) { return v; });
  function find(v) {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  }
  for (let v = 0; v < d.n; v++) {
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (colors[v] !== -1 && colors[v] === colors[w]) parent[find(v)] = find(w);
    }
  }
  return Int32Array.from({ length: d.n }, function (x, v) { return colors[v] === -1 ? -1 : find(v); });
}

// Random colorings of small domains of every kind (some with uncolored
// cells, as in Random Walk Coloring or the gaps of a tiling), and two
// colorings whose regions are known by hand.
function testRegions() {
  const domains = [
    ["a 9 × 7 box with 4 neighbors", boxDomain(9, 7, 4, false)],
    ["a 9 × 7 box with 8 neighbors", boxDomain(9, 7, 8, false)],
    ["an 8 × 6 torus with 4 neighbors", boxDomain(8, 6, 4, true)],
    ["an 8 × 6 torus with 8 neighbors", boxDomain(8, 6, 8, true)],
    ["an 8 × 6 torus of triangles", tilingBox(tilingBlock(TILINGS[1].code, false), 8, 6, true)],
    ["a 12 × 9 box of hexagons", tilingBox(tilingBlock(TILINGS[2].code, false), 12, 9, false)],
    ["an Aztec diamond of order 5", aztecDiamond(5)],
  ];
  const random = new Math.seedrandom("regions");
  const wrong = [];
  let colorings = 0;
  for (const [name, d] of domains) {
    for (let k = 0; k < 40; k++) {
      const q = 2 + k % 4, blank = k % 3 === 0 ? 0.2 : 0;
      const colors = new Int32Array(d.n);
      for (let v = 0; v < d.n; v++) colors[v] = random() < blank ? -1 : Math.floor(random() * q);
      const root = unionFindRegions(d, colors);
      // The count of each color: one region per root.
      const expected = new Array(q).fill(0);
      for (let v = 0; v < d.n; v++) if (root[v] === v) expected[colors[v]]++;
      const counted = countPieces(d, colors, q);
      if (counted.some(function (c, i) { return c !== expected[i]; })) wrong.push(name + " (counts)");
      // The region of a random colored cell: the cells with its root.
      const colored = [];
      for (let v = 0; v < d.n; v++) if (colors[v] !== -1) colored.push(v);
      const s = colored[Math.floor(random() * colored.length)];
      const inside = regionOf(d, colors, s);
      for (let v = 0; v < d.n; v++) {
        if ((inside[v] === 1) !== (root[v] === root[s])) { wrong.push(name + " (a highlighted region)"); break; }
      }
      colorings++;
    }
  }
  addRow("Regions are counted and highlighted right", wrong.length === 0,
    colorings + " random colorings with 2 to 5 colors (a third with a fifth of the cells uncolored) of " +
    domains.length + " domains: boxes and tori with 4 and 8 neighbors, triangles, hexagons, an Aztec diamond. " +
    "The regions of each color are counted as union-find counts them, and the region of a random cell is " +
    "exactly the cells union-find puts with it." + (wrong.length ? " Wrong on: " + wrong.slice(0, 5).join(", ") : ""));

  // By hand: a 6 × 6 checkerboard has 36 regions through 4 neighbors
  // (no two side-by-side cells agree) and 2 through 8 (each color is
  // joined up corner to corner). On an 8 × 5 torus with 4 neighbors,
  // columns colored 0, 1, 0, 1, ... are 8 regions (each column joins
  // up through the top and bottom).
  const checker = function (d) { return Int32Array.from({ length: d.n }, function (x, v) { return (d.x[v] + d.y[v]) % 2; }); };
  const columns = function (d) { return Int32Array.from({ length: d.n }, function (x, v) { return d.x[v] % 2; }); };
  const total = function (d, colors) { return countPieces(d, colors, 2).reduce(function (a, b) { return a + b; }, 0); };
  const four = boxDomain(6, 6, 4, false), eight = boxDomain(6, 6, 8, false), torus = boxDomain(8, 5, 4, true);
  const found = [total(four, checker(four)), total(eight, checker(eight)), total(torus, columns(torus))];
  addRow("Regions of colorings known by hand", found[0] === 36 && found[1] === 2 && found[2] === 8,
    "6 × 6 checkerboard: " + found[0] + " regions with 4 neighbors (should be 36), " + found[1] +
    " with 8 (should be 2); 8 × 5 torus in striped columns: " + found[2] + " (should be 8).");
}
