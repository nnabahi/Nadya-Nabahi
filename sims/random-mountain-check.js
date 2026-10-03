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

// Read a list of numbers as Python prints it, e.g. "[0.5, 0.25]".
function readNumbers(text) {
  return text.replace(/[\[\]]/g, " ").split(/[\s,]+/).filter(function (s) { return s !== ""; }).map(Number);
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

// The exact odds, straight from the definition: every run of "steps"
// steps, as a Map from describe(final mountain) to its probability.
// Written on its own, without newMountain, so the two can be compared.
function exactOdds(c) {
  // A site as text "x,y", after wrapping on a torus; null if outside.
  function site(x, y) {
    const d = c.domain;
    if (d.kind === "box" && d.torus) {
      const w = d.xmax - d.xmin + 1, h = d.ymax - d.ymin + 1;
      x = d.xmin + (((x - d.xmin) % w) + w) % w;
      y = d.ymin + (((y - d.ymin) % h) + h) % h;
    }
    if (d.kind === "box" && (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax)) return null;
    if (d.kind === "cells" && !d.cells.some(function (p) { return p[0] === x && p[1] === y; })) return null;
    return x + "," + y;
  }
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

  // A mountain the exact listing says is impossible is a failure at once.
  for (const key of counts.keys()) {
    if (!odds.has(key)) return { pass: false, text: "The sim made a mountain that is impossible: " + key };
  }

  // Pearson's statistic: the sum of (observed - expected)^2 / expected,
  // with outcomes expected fewer than 5 times pooled together.
  let statistic = 0, groups = 0, pooledObserved = 0, pooledExpected = 0;
  for (const [key, p] of odds) {
    const expected = p * runs, observed = counts.get(key) || 0;
    if (expected < 5) { pooledObserved += observed; pooledExpected += expected; continue; }
    statistic += (observed - expected) ** 2 / expected;
    groups += 1;
  }
  if (pooledExpected > 0) {
    statistic += (pooledObserved - pooledExpected) ** 2 / pooledExpected;
    groups += 1;
  }
  const degrees = groups - 1;
  const pValue = 1 - jStat.chisquare.cdf(statistic, degrees);
  return {
    pass: pValue > 0.001,
    text: odds.size + " possible mountains, " + runs + " runs: chi-square " + statistic.toFixed(1) +
          " with " + degrees + " degrees of freedom, p = " + pValue.toFixed(3),
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
          let x = m.siteX[i] + t[0], y = m.siteY[i] + (t[1] || 0);
          if (d.kind === "box" && d.torus) {
            const w = d.xmax - d.xmin + 1, h = d.ymax - d.ymin + 1;
            x = d.xmin + (((x - d.xmin) % w) + w) % w;
            y = d.ymin + (((y - d.ymin) % h) + h) % h;
          }
          if (d.kind === "box" && (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax)) continue;
          if (d.kind === "cells" && !d.cells.some(function (p) { return p[0] === x && p[1] === y; })) continue;
          should.add(x + "," + y);
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
   4. THE PAGE: run the tests and fill in the table
   =================================================================== */

const resultsBody = document.getElementById("results");

function addRow(test, pass, text) {
  const row = document.createElement("tr");
  row.innerHTML = "<td></td><td></td><td></td>";
  row.children[0].textContent = pass ? "✓ pass" : "✗ FAIL";
  row.children[0].className = pass ? "check-pass" : "check-fail";
  row.children[1].textContent = test;
  row.children[2].textContent = text;
  resultsBody.appendChild(row);
}

// The list of tests, run one at a time with a pause between them so
// the page can show each result as it comes.
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
  return tests;
}

document.getElementById("run-checks").addEventListener("click", function () {
  resultsBody.innerHTML = "";
  const tests = allTests();
  const button = this;
  button.disabled = true;
  function next() {
    if (tests.length === 0) { button.disabled = false; return; }
    tests.shift()();
    setTimeout(next, 0);
  }
  next();
});

document.getElementById("compare-pasted").addEventListener("click", function () {
  const u = readNumbers(document.getElementById("pasted-u").value);
  const h = readNumbers(document.getElementById("pasted-h").value);
  const file = document.getElementById("pasted-file").value;
  const out = document.getElementById("pasted-result");
  if (u.length === 0) { out.textContent = "Paste the u's first."; return; }
  const problem = compareWithPython(file, u, h);
  out.textContent = problem === "" ? "✓ Every height matches your Python." : "✗ " + problem;
});
