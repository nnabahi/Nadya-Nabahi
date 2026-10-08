/* =====================================================================
   tile-packing-check.js  —  the tests on tile-packing-check.html
   ---------------------------------------------------------------------
   Runs the chain from tile-packing-chain.js directly on this page (no
   Web Worker), a little at a time so the page never freezes.

   Sections:
     1. Every packing equally often (tiny domains, several versions), or,
        with tile weights, as often as its weight says
     2. Counting domino tilings (compared with Kasteleyn's formula)
     3. The arctic circle on an Aztec diamond
   The invariants (no overlaps, full cover or maximal) are checked every
   1000 moves in every test; a problem shows in red at the top.
   ===================================================================== */

// Report a broken invariant at the top of the page.
function invariantFailed(where, problem) {
  const line = byId("invariant-status");
  line.className = "check-fail";
  line.textContent = "Invariant broken in " + where + ": " + problem;
}

// Make a chain for these settings, with a fixed seed.
function makeChain(settings, seed) {
  const chain = tilePacking();
  const error = chain.setup(Object.assign({
    rotations: true, meanRadius: 1.5, sizeLimit: 10000, workLimit: 200000,
    randomFunction: new Math.seedrandom(seed),
  }, settings));
  return { chain: chain, error: error };
}


/* =====================================================================
   1. EVERY PACKING EQUALLY OFTEN
   ===================================================================== */

// The versions of the move being compared.
const VERSIONS = {
  rule:     { label: "the agreed rule (mean radius 1.5)", settings: {} },
  noChecks: { label: "without the touch checks (any refill of the region)", settings: { touchChecks: false } },
  bigDisk:  { label: "the agreed rule with mean radius 4", settings: { meanRadius: 4 } },
  walk:     { label: "nadya's random walk from tiling_mcmc.py, scaled down (k from 2 to 8 tiles)", settings: {}, walk: true },
};

// The tiny test domains.
const TESTS = [
  { name: "A row of 3 cells, tiles 1x2 and 1x3, gaps on",
    note: "The example from the planning thread: 3 maximal packings. Without the touch checks the " +
          "single 1x3 tile should come up less often than 1/3.",
    domain: function () { return boxDomain(3, 1, 4, false); },
    tiles: [{ w: 2, h: 1 }, { w: 3, h: 1 }], rotations: false, gaps: true,
    versions: ["rule", "noChecks", "bigDisk"] },
  { name: "4 x 4 box, dominoes, gaps off",
    note: "36 tilings.",
    domain: function () { return boxDomain(4, 4, 4, false); },
    tiles: [{ w: 2, h: 1 }], rotations: true, gaps: false,
    versions: ["rule", "noChecks", "bigDisk", "walk"] },
  { name: "4 x 4 box, dominoes, gaps on",
    note: "Maximal domino packings: gaps allowed, but no domino fits in them.",
    domain: function () { return boxDomain(4, 4, 4, false); },
    tiles: [{ w: 2, h: 1 }], rotations: true, gaps: true,
    versions: ["rule", "noChecks"] },
  { name: "5 x 5 box, squares 2x2 and 3x3, gaps on",
    note: "Your model on a tiny box.",
    domain: function () { return boxDomain(5, 5, 4, false); },
    tiles: [{ w: 2, h: 2 }, { w: 3, h: 3 }], rotations: true, gaps: true,
    versions: ["rule", "noChecks", "bigDisk"] },
  { name: "4 x 4 torus, dominoes, gaps off",
    note: "Dominoes may wrap around the edges.",
    domain: function () { return boxDomain(4, 4, 4, true); },
    tiles: [{ w: 2, h: 1 }], rotations: true, gaps: false,
    versions: ["rule", "bigDisk"] },
  { name: "Weights: 3 x 3 box, 2x2 of weight 2 and 1x1 of weight 1",
    note: "5 tilings: all 1x1 (weight 1), or one 2x2 in any of 4 places (weight 2 each). " +
          "So all 1x1 should come up 1/9 of the time, and each of the others 2/9.",
    domain: function () { return boxDomain(3, 3, 4, false); },
    tiles: [{ w: 2, h: 2, weight: 2 }, { w: 1, h: 1, weight: 1 }], rotations: true, gaps: true,
    versions: ["rule", "bigDisk"] },
  { name: "Weights: 5 x 5 box, 2x2 of weight 1 and 3x3 of weight 3, gaps on",
    note: "Your model on a tiny box, with each 3x3 tile counting 3 times.",
    domain: function () { return boxDomain(5, 5, 4, false); },
    tiles: [{ w: 2, h: 2, weight: 1 }, { w: 3, h: 3, weight: 3 }], rotations: true, gaps: true,
    versions: ["rule", "bigDisk"] },
  { name: "Weights: 4 x 4 box, dominoes, horizontal weight 0.5 and vertical weight 1, gaps off",
    note: "No rotations: the 2x1 and the 1x2 are separate tiles with their own weights.",
    domain: function () { return boxDomain(4, 4, 4, false); },
    tiles: [{ w: 2, h: 1, weight: 0.5 }, { w: 1, h: 2, weight: 1 }], rotations: false, gaps: false,
    versions: ["rule", "bigDisk"] },
];

// Build the list of tests, each with a Run button and a place for results.
TESTS.forEach(function (test) {
  const box = document.createElement("div");
  box.innerHTML =
    "<h3>" + test.name + "</h3><p class='muted'>" + test.note + "</p>" +
    "<button class='tool-button'>Run this test</button><div></div>";
  byId("tests").appendChild(box);
  const results = box.querySelector("div");
  box.querySelector("button").addEventListener("click", function () {
    results.innerHTML = "";
    const moves = readWhole("moves", 1000, 1e9, 1000000);
    const every = readWhole("every", 1, 1e6, 100);
    // Run the versions one after another.
    let k = 0;
    (function next() {
      if (k < test.versions.length) runVersion(test, test.versions[k++], moves, every, results, next);
    })();
  });
});

// Run one version of the move on one test, a little at a time, and show
// the bars as they grow.
function runVersion(test, versionName, moves, every, results, whenDone) {
  const version = VERSIONS[versionName];
  const domain = test.domain();
  const made = makeChain(Object.assign({
    domain: domain, tiles: test.tiles, rotations: test.rotations, gaps: test.gaps,
  }, version.settings), "check");
  const chain = made.chain;

  const line = document.createElement("p");
  const canvas = document.createElement("canvas");
  canvas.className = "bars";
  results.appendChild(line);
  results.appendChild(canvas);
  if (made.error) { line.textContent = version.label + ": " + made.error; whenDone(); return; }

  // Every packing, numbered, and its share: the product of its tiles'
  // weights, divided by the sum of those products over all packings
  // (with no weights, every packing gets the same share).
  const keys = chain.allPackings();
  const number = new Map();
  keys.forEach(function (key, i) { number.set(key, i); });
  const seen = new Array(keys.length).fill(0);
  const pl = chain.placements();
  const weights = keys.map(function (key) {
    let w = 1;
    for (const p of key.split(",").filter(Boolean)) {
      const tile = test.tiles[pl.orientTile[pl.orient[Number(p)]]];
      w *= (tile.weight === undefined) ? 1 : tile.weight;
    }
    return w;
  });
  const totalWeight = weights.reduce(function (a, b) { return a + b; }, 0);
  const share = weights.map(function (w) { return w / totalWeight; });
  let notes = 0, done = 0;
  const step = version.walk ? walkMove(chain, domain, new Math.seedrandom("walk")) : chain.oneMove;

  (function chunk() {
    const until = performance.now() + 30;   // 30 milliseconds of work, then let the page breathe
    while (done < moves && performance.now() < until) {
      step();
      done++;
      if (done % every === 0) {
        const i = number.get(chain.packingKey());
        if (i === undefined) { invariantFailed(test.name, "a packing that is not on the list"); return; }
        seen[i]++;
        notes++;
      }
      if (done % 1000 === 0) {
        const problem = chain.checkPacking();
        if (problem) { invariantFailed(test.name, problem); return; }
      }
    }
    // chi-square: the sum of (seen - expected)^2 / expected over the
    // packings, and p: the chance of bars at least this uneven if the
    // chain had the right distribution (and the notes were independent),
    // from the chi-square distribution in the library jStat.
    const expected = share.map(function (f) { return f * notes; });
    let chi = 0;
    seen.forEach(function (s, i) { chi += (s - expected[i]) * (s - expected[i]) / expected[i]; });
    const df = keys.length - 1;
    const p = df > 0 ? 1 - jStat.chisquare.cdf(chi, df) : 1;
    const finished = done >= moves;
    const right = p >= 0.001;
    line.innerHTML = "<b>" + version.label + "</b>: " + keys.length + " packings, " +
      done.toLocaleString() + " moves, chi&sup2;/df = " + (df > 0 ? chi / df : 0).toFixed(2) +
      ", p = " + p.toPrecision(2) + " &rarr; " +
      (finished ? "<span class='" + (right ? "check-pass'>looks right" : "check-fail'>NOT right") + "</span>"
                : "running...");
    drawBars(canvas, seen, expected);
    if (!finished) setTimeout(chunk, 0);
    else whenDone();
  })();
}

// One bar per packing: seen / expected (expected is a list, one number
// per packing). The line marks 1.
function drawBars(canvas, seen, expected) {
  const pen = chartPen(canvas);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const top = 2;   // the tallest bar drawn is 2 (twice as often as it should be)
  const barWidth = width / seen.length;
  pen.fillStyle = CHART_LINE;
  seen.forEach(function (s, i) {
    const ratio = expected[i] > 0 ? Math.min(s / expected[i], top) : 0;
    const h = ratio / top * (height - 12);
    pen.fillRect(i * barWidth, height - h, Math.max(barWidth - 1, 1), h);
  });
  const y1 = height - (height - 12) / top;
  pen.strokeStyle = CHART_TEXT;
  pen.beginPath(); pen.moveTo(0, y1); pen.lineTo(width, y1); pen.stroke();
  pen.fillStyle = CHART_TEXT;
  pen.fillText("1 = as often as it should be", 4, y1 - 3);
}

// nadya's move from tiling_mcmc.py (mixingstep), for comparison:
//   k = 2 + an exponential number (rate 0.4), at most 8 (her file uses
//   6 to 16, which would be the whole of a 4x4 board);
//   start at a uniformly random tile and grow a connected group of k tiles
//   (pick a random tile of the frontier, add its neighbors not yet in
//   the group, stop at k), as selectsubset() does;
//   delete the group and retile its cells uniformly among all tilings.
function walkMove(chain, domain, random) {
  return function () {
    const owner = chain.owner();
    const pl = chain.placements();
    const k = Math.min(2 + Math.floor(-Math.log(1 - random()) / 0.4), 8);
    const tiles = Array.from(new Set(owner));
    const start = tiles[Math.floor(random() * tiles.length)];
    const group = new Set([start]);
    const frontier = [start];
    while (frontier.length > 0 && group.size < k) {
      const t = frontier.splice(Math.floor(random() * frontier.length), 1)[0];
      // The tiles sharing an edge with tile t, in the order they are met.
      const neighbors = [];
      for (let j = pl.start[t]; j < pl.start[t + 1]; j++) {
        const v = pl.cell[j];
        for (let e = domain.first[v]; e < domain.first[v + 1]; e++) {
          const other = owner[domain.nbr[e]];
          if (other !== t && !neighbors.includes(other)) neighbors.push(other);
        }
      }
      for (const other of neighbors) {
        if (group.has(other)) continue;
        group.add(other);
        frontier.push(other);
        if (group.size >= k) break;
      }
    }
    const cells = [];
    for (let v = 0; v < owner.length; v++) if (group.has(owner[v])) cells.push(v);
    chain.refillUniform(cells);
  };
}


/* =====================================================================
   2. COUNTING DOMINO TILINGS
   ===================================================================== */

// Kasteleyn's formula for the number of domino tilings of an m x n box:
// the product over j = 1 .. ceil(m/2) and k = 1 .. ceil(n/2) of
//   4 cos^2(pi j / (m + 1)) + 4 cos^2(pi k / (n + 1)).
function kasteleyn(m, n) {
  let product = 1;
  for (let j = 1; j <= Math.ceil(m / 2); j++) {
    for (let k = 1; k <= Math.ceil(n / 2); k++) {
      product *= 4 * Math.cos(Math.PI * j / (m + 1)) ** 2 + 4 * Math.cos(Math.PI * k / (n + 1)) ** 2;
    }
  }
  return Math.round(product);
}

// The search's count for an m x n box of dominoes.
function searchCount(m, n, maxWork) {
  const made = makeChain({ domain: boxDomain(m, n, 4, false), tiles: [{ w: 2, h: 1 }], gaps: false }, "count");
  // (made.error only says no starting tiling could be built; counting
  // doesn't need one.)
  return made.chain.countPackings(maxWork);
}

byId("count-small").addEventListener("click", function () {
  let html = "<table class='check-table'><tr><th>box</th><th>search</th><th>Kasteleyn</th><th></th></tr>";
  const sizes = [];
  for (let n = 1; n <= 12; n++) sizes.push([2, n]);
  for (let m = 3; m <= 6; m++) for (let n = m; n <= 6; n++) sizes.push([m, n]);
  for (const [m, n] of sizes) {
    const exact = kasteleyn(m, n);
    const found = searchCount(m, n, 1e8);
    html += "<tr><td>" + m + " &times; " + n + "</td><td>" + found.toLocaleString() + "</td><td>" +
      exact.toLocaleString() + "</td><td class='" + (found === exact ? "check-pass'>same" : "check-fail'>DIFFERENT") +
      "</td></tr>";
  }
  byId("count-results").innerHTML = html + "</table>";
});

byId("count-8").addEventListener("click", function () {
  byId("count-results").textContent = "Counting... (the page may freeze for a while)";
  setTimeout(function () {
    const found = searchCount(8, 8, 2e9);
    const exact = kasteleyn(8, 8);
    byId("count-results").innerHTML = "8 &times; 8: search " + found.toLocaleString() +
      ", Kasteleyn " + exact.toLocaleString() + " &rarr; <span class='" +
      (found === exact ? "check-pass'>same" : "check-fail'>DIFFERENT") + "</span>";
  }, 50);
});


/* =====================================================================
   3. THE ARCTIC CIRCLE
   ===================================================================== */

// The four domino colors (placeholders): [horizontal, parity 0],
// [horizontal, parity 1], [vertical, parity 0], [vertical, parity 1],
// matching the chain's classes 0..3 (orientation 0 is the 2x1 domino).
const ARCTIC_COLORS = [[214, 69, 65], [240, 190, 50], [60, 110, 200], [70, 160, 90]];

let arctic = null;   // { chain, domain, order, timer }

// A chain on the Aztec diamond of order N (aztecDiamond, js/sim-domains.js).
function arcticSetup(N) {
  const radius = Math.max(Number(byId("arctic-radius").value) || 1.5, 0.1);
  const domain = aztecDiamond(N);
  const made = makeChain({ domain: domain, tiles: [{ w: 2, h: 1 }], gaps: false, meanRadius: radius }, "arctic");
  if (made.error) { byId("arctic-status").textContent = made.error; return null; }
  return { chain: made.chain, domain: domain, order: N, timer: null };
}

byId("arctic-start").addEventListener("click", function () {
  if (arctic && arctic.timer) return;
  const N = readWhole("arctic-order", 2, 60, 12);
  if (!arctic || arctic.order !== N) arctic = arcticSetup(N);
  if (!arctic) return;
  (function chunk() {
    const until = performance.now() + 40;
    while (performance.now() < until) arctic.chain.oneMove();
    const problem = arctic.chain.checkPacking();
    if (problem) { invariantFailed("the arctic circle", problem); return; }
    drawArctic();
    arctic.timer = setTimeout(chunk, 0);
  })();
});

byId("arctic-stop").addEventListener("click", function () {
  if (arctic) { clearTimeout(arctic.timer); arctic.timer = null; }
});
byId("arctic-reset").addEventListener("click", function () {
  if (arctic) { arctic.chain.resetHeat(); drawArctic(); }
});
for (const radio of document.querySelectorAll("input[name=arctic-show]")) {
  radio.addEventListener("change", function () { if (arctic) drawArctic(); });
}

function drawArctic() {
  const canvas = byId("arctic-canvas");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = canvas.width;
  const pen = canvas.getContext("2d");
  const N = arctic.order, d = arctic.domain;
  const size = canvas.width / (2 * N);
  const showAverage = checked("arctic-show") === "average";
  const heat = showAverage ? arctic.chain.heat() : null;
  const owner = arctic.chain.owner();
  const pl = arctic.chain.placements();
  const classes = 2 * pl.orientW.length + 1;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  for (let v = 0; v < d.n; v++) {
    let rgb = [0, 0, 0];
    if (showAverage) {
      for (let c = 0; c < 4; c++) {
        const f = heat[v * classes + c];
        for (let i = 0; i < 3; i++) rgb[i] += f * ARCTIC_COLORS[c][i];
      }
    } else {
      const p = owner[v], a = pl.anchor[p];
      rgb = ARCTIC_COLORS[2 * pl.orient[p] + wrapNumber(d.x[a] + d.y[a], 2)];
    }
    pen.fillStyle = "rgb(" + rgb.map(Math.round).join(",") + ")";
    // x grows to the right, y grows upward (so row 0 of the canvas is y = N - 1).
    pen.fillRect((d.x[v] + N) * size, (N - 1 - d.y[v]) * size, size + 0.5, size + 0.5);
  }
  const s = arctic.chain.stats();
  byId("arctic-status").textContent = s.moves.toLocaleString() + " moves, " +
    (100 * s.changed / Math.max(s.moves, 1)).toFixed(1) + "% changed the tiling.";
}
