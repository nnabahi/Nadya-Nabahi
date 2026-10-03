/* =====================================================================
   sequential-packing-check.js  —  the checks on the check page
   ---------------------------------------------------------------------
   Each check below builds a packing with packingCore() (from
   sequential-packing-growth.js), compares it with something known, and
   returns { name, pass, details }. The end of the file runs them one
   after another and fills in the table on the page.

     1. Your gasket, on your own centers, against your formula
     2. Squares in a square, against the same formula with max(|x|, |y|)
     3. The mesh gives exactly the same tiles as checking every obstacle
     4. A non-convex tile: no overlaps, and every tile inside S
     5. Uniform centers on an annulus (chi-square test)
     6. Your density with s (Kolmogorov-Smirnov test)
     7. Speed
   ===================================================================== */


// The shapes used below, as plain functions of x and y.
const DISK = (x, y) => x * x + y * y <= 1;
const SQUARE = (x, y) => Math.max(Math.abs(x), Math.abs(y)) <= 1;
const STAR = (x, y) => Math.hypot(x, y) <= 0.6 + 0.3 * Math.cos(5 * Math.atan2(y, x));
const HEART = (x, y) => Math.pow(x * x + y * y - 0.8, 3) - x * x * y * y * y <= 0;
const ANNULUS = (x, y) => x * x + y * y <= 1 && x * x + y * y >= 0.09;
const WINDOW = { xmin: -1.05, xmax: 1.05, ymin: -1.05, ymax: 1.05 };
const HEART_WINDOW = { xmin: -1.3, xmax: 1.3, ymin: -1.3, ymax: 1.3 };

// A packing with these options (plus the window, seed and alea).
function newPacking(options) {
  const packing = packingCore();
  packing.setup(Object.assign({ window: WINDOW, seed: 1, makeRandom: alea }, options));
  return packing;
}

const TOLERANCE = 1e-5;   // the edge of S is made of short straight pieces, so radii can be off by about this much


/* 1. YOUR GASKET. S = T = the unit disk. The centers come from your
   model C_n = λ^s ζ with s = 1/2 (uniform), as in your RandomPacking
   notes. For each placed tile, your formula is evaluated on the tiles
   placed before it:
       R_n = min( 1 - |C_n|, min_k ( |C_n - C_k| - R_k ) ).
   Its parent is whichever term is smallest; a parent only counts as
   wrong if the runner-up is more than TOLERANCE behind. Attempts that
   place nothing must land inside an earlier tile. */
function checkGasket() {
  const packing = newPacking({ inS: DISK, inT: DISK });
  const tiles = packing.tiles, random = alea("your centers");
  let worst = 0, wrongParents = 0, wrongZeros = 0;
  for (let n = 0; n < 3000; n++) {
    const lambda = random(), angle = 2 * Math.PI * random();
    const cx = Math.pow(lambda, 0.5) * Math.cos(angle), cy = Math.pow(lambda, 0.5) * Math.sin(angle);
    const before = tiles.count;
    const t = packing.placeAt(cx, cy);
    // Your formula, on the tiles placed so far.
    let R = 1 - Math.hypot(cx, cy), parent = -1, runnerUp = Infinity;
    for (let k = 0; k < before; k++) {
      const d = Math.hypot(cx - tiles.cx[k], cy - tiles.cy[k]) - tiles.r[k];
      if (d < R) { runnerUp = R; R = d; parent = k; } else if (d < runnerUp) runnerUp = d;
    }
    if (t < 0) { if (R > TOLERANCE) wrongZeros++; continue; }
    worst = Math.max(worst, Math.abs(tiles.r[t] - R));
    if (tiles.parent[t] !== parent && runnerUp - R > TOLERANCE) wrongParents++;
  }
  return {
    name: "1. Your gasket against your formula (3,000 of your centers)",
    pass: worst < TOLERANCE && wrongParents === 0 && wrongZeros === 0,
    details: tiles.count + " tiles. Largest difference in R: " + worst.toExponential(1) +
      ". Wrong parents: " + wrongParents + ". Wrongly empty attempts: " + wrongZeros + ".",
  };
}


/* 2. SQUARES IN A SQUARE. S = T = max(|x|, |y|) <= 1. Here g is
   max(|x|, |y|), so the formula is
       R_n = min( 1 - |x_n|, 1 - |y_n|, min_k ( max(|x_n - x_k|, |y_n - y_k|) - R_k ) ).
   The centers are drawn by the sim itself. */
function checkSquares() {
  const packing = newPacking({ inS: SQUARE, inT: SQUARE });
  for (let n = 0; n < 3000; n++) packing.attempt();
  const tiles = packing.tiles;
  let worst = 0;
  for (let k = 0; k < tiles.count; k++) {
    const x = tiles.cx[k], y = tiles.cy[k];
    let R = Math.min(1 - Math.abs(x), 1 - Math.abs(y));
    for (let j = 0; j < k; j++) R = Math.min(R, Math.max(Math.abs(x - tiles.cx[j]), Math.abs(y - tiles.cy[j])) - tiles.r[j]);
    worst = Math.max(worst, Math.abs(R - tiles.r[k]));
  }
  return {
    name: "2. Squares in a square against the max(|x|, |y|) formula",
    pass: packing.exactTiles && worst < TOLERANCE,
    details: tiles.count + " tiles. Largest difference in R: " + worst.toExponential(1) +
      ". Square counted as convex and symmetric: " + packing.exactTiles + ".",
  };
}


/* 3. THE MESH. The same packing (star tile in a heart, same seed) is
   built twice: once with the mesh, once checking every obstacle for
   every attempt. Every tile must come out exactly the same. */
function checkMesh() {
  const options = { inS: HEART, inT: STAR, window: HEART_WINDOW };
  const withMesh = newPacking(options), everything = newPacking(Object.assign({ useMesh: false }, options));
  let start = performance.now();
  for (let n = 0; n < 1000; n++) withMesh.attempt();
  const meshTime = performance.now() - start;
  start = performance.now();
  for (let n = 0; n < 1000; n++) everything.attempt();
  const allTime = performance.now() - start;
  const a = withMesh.tiles, b = everything.tiles;
  let same = a.count === b.count;
  for (let k = 0; k < a.count && same; k++) {
    same = a.cx[k] === b.cx[k] && a.cy[k] === b.cy[k] && a.r[k] === b.r[k] && a.parent[k] === b.parent[k];
  }
  return {
    name: "3. Mesh search = checking every obstacle (star in a heart, 1,000 attempts)",
    pass: same,
    details: a.count + " tiles each. Time with the mesh " + Math.round(meshTime) +
      " ms, checking everything " + Math.round(allTime) + " ms.",
  };
}


/* 4. A NON-CONVEX TILE (the star), in the heart. Star tiles use the
   slower edge-by-edge search, so this checks the result directly:
   every corner of every tile's polygon must be outside every other
   tile and inside S. "Outside" allows a tiny margin: a tile counts as
   shrunk by 0.1% of its size or by 0.00001, whichever is more, since
   the edge of S is only pinned down to about a millionth. */
function checkNonConvex() {
  const packing = newPacking({ inS: HEART, inT: STAR, window: HEART_WINDOW });
  for (let n = 0; n < 2000; n++) packing.attempt();
  const tiles = packing.tiles, { px, py, rhoMax } = packing.shape;
  function shrunk(k) { return tiles.r[k] * (1 - Math.max(1e-3, 1e-5 / tiles.r[k])); }
  let overlaps = 0, outside = 0;
  for (let k = 0; k < tiles.count; k++) {
    for (let e = 0; e < px.length; e++) {
      if (!HEART(tiles.cx[k] + shrunk(k) * px[e], tiles.cy[k] + shrunk(k) * py[e])) outside++;
    }
    for (let i = 0; i < tiles.count; i++) {
      const gap = Math.hypot(tiles.cx[i] - tiles.cx[k], tiles.cy[i] - tiles.cy[k]);
      if (i === k || gap > (tiles.r[i] + tiles.r[k]) * rhoMax) continue;   // too far apart to touch
      for (let e = 0; e < px.length; e++) {
        const ex = tiles.cx[k] + shrunk(k) * px[e], ey = tiles.cy[k] + shrunk(k) * py[e];
        if (packing.g(ex - tiles.cx[i], ey - tiles.cy[i]) < shrunk(i)) overlaps++;
      }
    }
  }
  return {
    name: "4. Non-convex tile (star in a heart, 2,000 attempts): no overlaps, all inside S",
    pass: overlaps === 0 && outside === 0 && !packing.exactTiles,
    details: tiles.count + " tiles. Corners inside another tile: " + overlaps +
      ". Corners outside S: " + outside + ". Star counted as non-convex: " + !packing.exactTiles + ".",
  };
}


/* 5. UNIFORM CENTERS on the annulus 0.3 <= |x| <= 1 (S with a hole).
   40,000 centers are sorted into 80 boxes of equal area (10 rings by
   8 slices). If they are uniform, each box gets about 500, and
   Pearson's chi-square statistic (Pearson, Phil. Mag. 50 (1900) 157)
   has 79 degrees of freedom. Its p-value comes from the Wilson-
   Hilferty approximation (Wilson & Hilferty, PNAS 17 (1931) 684). A
   correct sampler fails this 1 time in 1000. */
function checkUniform() {
  const packing = newPacking({ inS: ANNULUS, inT: DISK });
  const counts = new Array(80).fill(0), total = 40000;
  for (let n = 0; n < total; n++) {
    const [x, y] = packing.drawCenter(alea("uniform/" + n));
    const ring = Math.min(9, Math.floor((x * x + y * y - 0.09) / 0.91 * 10));
    let angle = Math.atan2(y, x); if (angle < 0) angle += 2 * Math.PI;
    const slice = Math.min(7, Math.floor(angle / (2 * Math.PI) * 8));
    counts[ring * 8 + slice]++;
  }
  const expected = total / 80;
  let chi2 = 0;
  for (const c of counts) chi2 += (c - expected) * (c - expected) / expected;
  const p = chiSquarePValue(chi2, 79);
  return {
    name: "5. Uniform centers on an annulus (chi-square, 40,000 centers)",
    pass: p > 0.001,
    details: "Chi-square = " + chi2.toFixed(1) + " with 79 degrees of freedom, p = " + p.toFixed(3) + ".",
  };
}


/* 6. YOUR DENSITY WITH s. On the unit disk,
       f(x, y) = (x^2 + y^2)^((1/s - 2) / 2)
   gives the same centers as your C = λ^s ζ, so |C| should have
   P(|C| <= ρ) = ρ^(1/s). The Kolmogorov-Smirnov test (Kolmogorov,
   Giorn. Ist. Ital. Attuari 4 (1933) 83; Smirnov, Ann. Math. Stat. 19
   (1948) 279) compares 20,000 centers with that. For s = 1, f = 1/|x|
   is infinite at 0, so f may go above its ceiling near 0; how often is
   shown. */
function checkDensity(s) {
  const packing = newPacking({ inS: DISK, inT: DISK, density: (x, y) => Math.pow(x * x + y * y, (1 / s - 2) / 2) });
  const total = 20000, radii = [];
  for (let n = 0; n < total; n++) {
    const [x, y] = packing.drawCenter(alea("density/" + s + "/" + n));
    radii.push(Math.hypot(x, y));
  }
  radii.sort((a, b) => a - b);
  let D = 0;
  for (let k = 0; k < total; k++) {
    const F = Math.pow(radii[k], 1 / s);
    D = Math.max(D, Math.abs(F - k / total), Math.abs(F - (k + 1) / total));
  }
  const p = ksPValue(D, total);
  return {
    name: "6. Your density with s = " + s + " (Kolmogorov-Smirnov, 20,000 centers)",
    pass: p > 0.001,
    details: "D = " + D.toFixed(4) + ", p = " + p.toFixed(3) + ". Times f went above its ceiling: " +
      packing.ceilingMisses + ".",
  };
}


/* 7. SPEED: 50,000 attempts of your gasket, drawn by the sim. The
   picture on the left is the first 20,000 of them. */
let gasketForPicture = null;
function checkSpeed() {
  const packing = newPacking({ inS: DISK, inT: DISK });
  const start = performance.now();
  for (let n = 0; n < 50000; n++) {
    packing.attempt();
    if (n === 19999) gasketForPicture = { count: packing.tiles.count, tiles: packing.tiles };
  }
  const time = performance.now() - start;
  let covered = 0;
  for (let k = 0; k < packing.tiles.count; k++) covered += packing.tiles.r[k] * packing.tiles.r[k];
  return {
    name: "7. Speed: 50,000 attempts of your gasket",
    pass: true,
    details: Math.round(time) + " ms. " + packing.tiles.count + " tiles placed, covering " +
      (100 * covered).toFixed(2) + "% of the disk.",
  };
}


/* ---------------------------------------------------------------------
   p-values for checks 5 and 6
   --------------------------------------------------------------------- */

// The chance that a chi-square with k degrees of freedom is at least x,
// by the Wilson-Hilferty approximation: (x/k)^(1/3) is close to normal
// with mean 1 - 2/(9k) and variance 2/(9k).
function chiSquarePValue(x, k) {
  const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - normalCdf(z);
}

// The standard normal distribution function, from the error function
// (Abramowitz & Stegun, "Handbook of Mathematical Functions", 1964,
// formula 7.1.26, accurate to about 1e-7).
function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// The chance that the Kolmogorov-Smirnov distance of n samples is at
// least D: Kolmogorov's series Q(λ) = 2 Σ (-1)^(k-1) exp(-2 k^2 λ^2),
// with Stephens' correction λ = (√n + 0.12 + 0.11/√n) D (Press et al.,
// "Numerical Recipes", 3rd ed. 2007, Section 14.3.3).
function ksPValue(D, n) {
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D;
  let sum = 0;
  for (let k = 1; k <= 100; k++) sum += 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
  return Math.min(1, Math.max(0, sum));
}


/* ---------------------------------------------------------------------
   Running the checks and drawing the pictures
   --------------------------------------------------------------------- */

// Draw "count" tiles of a packing on a canvas, colored by generation.
function drawTiles(canvas, tiles, count, shape, win) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  const pen = canvas.getContext("2d");
  const scale = canvas.width / (win.xmax - win.xmin);
  let most = 1;
  for (let k = 0; k < count; k++) most = Math.max(most, tiles.generation[k]);
  for (let k = 0; k < count; k++) {
    pen.fillStyle = defaultColor(tiles.generation[k] - 1, most);
    pen.beginPath();
    for (let e = 0; e < shape.px.length; e += 16) {
      const x = (tiles.cx[k] + tiles.r[k] * shape.px[e] - win.xmin) * scale;
      const y = (win.ymax - tiles.cy[k] - tiles.r[k] * shape.py[e]) * scale;
      if (e === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
    }
    pen.fill();
  }
}

const CHECKS = [checkGasket, checkSquares, checkMesh, checkNonConvex, checkUniform,
  () => checkDensity(0.25), () => checkDensity(1), checkSpeed];

if (typeof document !== "undefined") {
  let next = 0, failed = 0;
  // One check at a time, with a short pause so the page can show each row.
  function runNext() {
    if (next === CHECKS.length) {
      document.getElementById("status").textContent = failed === 0 ? "All checks passed." : failed + " check(s) failed.";
      const disk = newPacking({ inS: DISK, inT: DISK });
      drawTiles(document.getElementById("picture-gasket"), gasketForPicture.tiles, gasketForPicture.count, disk.shape, WINDOW);
      const star = newPacking({ inS: HEART, inT: STAR, window: HEART_WINDOW });
      for (let n = 0; n < 3000; n++) star.attempt();
      drawTiles(document.getElementById("picture-star"), star.tiles, star.tiles.count, star.shape, HEART_WINDOW);
      return;
    }
    let result;
    try { result = CHECKS[next](); }
    catch (error) { result = { name: "Check " + (next + 1), pass: false, details: "Stopped with an error: " + error.message }; }
    if (!result.pass) failed++;
    const row = document.createElement("tr");
    row.innerHTML = "<td></td><td class='" + (result.pass ? "pass'>pass" : "fail'>FAIL") + "</td><td></td>";
    row.cells[0].textContent = result.name;
    row.cells[2].textContent = result.details;
    document.getElementById("results").appendChild(row);
    next++;
    setTimeout(runNext, 20);
  }
  setTimeout(runNext, 20);
}
