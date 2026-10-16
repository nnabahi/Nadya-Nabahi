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
   and, for the pages that test tilings (they load js/sim-tilings.js):
     tilingOf(code, corners)             the tiling with a code, as the sims build it
     middleAt, cornersAt(tiling, x, y, z)   where a cell is: its middle, its corners
     spotKey(u, w), sideKeysAt(...)      points and sides as text, to match them up
     eulerCounter(tiling)                the holes of a growing set of cells, by Euler's formula
     holesFromPolygons(set)              its holes and outer boundary, from the polygons alone
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


// The tiling with this code, its tiles or (with "corners") its corners
// as the cells, as the sims build it (readTiling, js/sim-controls.js):
// its repeating block, upright (js/sim-tilings.js).
function tilingOf(code, corners) {
  const block = tilingFromCode(code);
  return uprightBlock(corners ? cornersBlock(block) : block);
}

// Where cell z of block (x, y) of a tiling is: its middle, and its corners.
function middleAt(tiling, x, y, z) {
  const m = tiling.cells[z].middle;
  return [m[0] + x * tiling.a[0] + y * tiling.b[0], m[1] + x * tiling.a[1] + y * tiling.b[1]];
}
function cornersAt(tiling, x, y, z) {
  return tiling.cells[z].corners.map(function (c) {
    return [c[0] + x * tiling.a[0] + y * tiling.b[0], c[1] + x * tiling.a[1] + y * tiling.b[1]];
  });
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
// side). In the blocks around the set's cells, 3 more all round, the
// empty cells are flooded from the outermost blocks; the empty cells it
// doesn't reach are the holes' cells, in groups of neighbors. (least
// and most are in js/sim-domains.js.) Returns { sizes, cells (as text "x,y,z"),
// frontier (the sides between a cell of the set and a flooded one) }.
function holesFromPolygons(set) {
  const tiling = set.tiling, parts = tiling.cells.length, MARGIN = 3;
  const xs = set.siteX, ys = set.siteY;
  const xmin = least(xs) - MARGIN, xmax = most(xs) + MARGIN;
  const ymin = least(ys) - MARGIN, ymax = most(ys) + MARGIN;
  const visited = new Set(xs.map(function (x, i) { return x + "," + ys[i] + "," + set.siteZ[i]; }));
  // Every cell of the window, and for each side's middle the cells with that side.
  const cells = [], bySide = new Map();
  for (let x = xmin; x <= xmax; x++) {
    for (let y = ymin; y <= ymax; y++) {
      for (let z = 0; z < parts; z++) {
        const cell = { key: x + "," + y + "," + z, full: false, reached: false, next: [] };
        cell.full = visited.has(cell.key);
        cell.edge = (x === xmin || x === xmax || y === ymin || y === ymax);
        for (const side of sideKeysAt(tiling, x, y, z)) {
          if (!bySide.has(side)) bySide.set(side, []);
          bySide.get(side).push(cell);
        }
        cells.push(cell);
      }
    }
  }
  for (const pair of bySide.values()) {
    if (pair.length === 2) { pair[0].next.push(pair[1]); pair[1].next.push(pair[0]); }
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
