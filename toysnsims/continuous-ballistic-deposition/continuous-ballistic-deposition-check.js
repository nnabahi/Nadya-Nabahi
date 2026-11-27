/* =====================================================================
   continuous-ballistic-deposition-check.js  —  tests for the growth in
   continuous-ballistic-deposition-growth.js and the falling tile in
   js/sim-deposit.js, in the plane and in space
   ---------------------------------------------------------------------
   Each test runs the growth (newContinuousDeposit) directly, with fixed
   seeds, and adds a row to the results table (addRow, js/check-page.js):
     1. The top of D = T - T above each point (where a falling tile
        stops on another), against a plain answer: the highest a point
        of the tile at dx can be above a point of the tile at 0, over
        many places across. And the top of T, for the surface.
     2. Where a tile stops, against a plain search over every tile (no
        columns, no early stop).
     3. A big deposit, recounted: no two tiles overlap, and each touches
        the floor or a tile that came before it, found with the gap
        between two tiles (copyGap, js/sim-tile-shape.js), not with
        D's top; with walls, every tile is between them. And the
        surface, recounted from every tile.
     4. The places the tiles fall at are uniform across the floor
        (Pearson's chi-square test).
     5. Coupling: more particles only add tiles (checkTileCoupling,
        js/check-page.js).
     6. A floor too narrow for the tile is refused.
     7. Clicks (checkClicks, js/check-page.js).
   ===================================================================== */

// The tiles tested: tilePolygon (in the plane) or tilePolyhedron (in
// space, js/sim-tile-shape.js) of the sim's presets, written as tests of
// points, the way readShape makes them from the formulas. Each has
// "deepest(d)" (js/check-page.js): for the copies centered d apart, the
// smallest ruler value of a point of one inside the other, below 1 when
// they overlap. And the width W of the floor its tests use.
function testTiles() {
  const star = tilePolygon(function (x, y) { return Math.hypot(x, y) <= 1 + 0.5 * Math.cos(5 * Math.atan2(y, x)); });
  return [
    { name: "Disks", dims: 2, shape: tilePolygon(function (x, y) { return x * x + y * y <= 1; }), deepest: ballDeepest, W: 40 },
    { name: "Squares", dims: 2, shape: tilePolygon(function (x, y) { return Math.max(Math.abs(x), Math.abs(y)) <= 1; }),
      deepest: boxDeepest, W: 40 },
    { name: "Your star", dims: 2, shape: star, deepest: function (d) { return deepestCorner(star, d[0], d[1]); }, W: 40 },
    { name: "Balls", dims: 3, shape: tilePolyhedron(function (x, y, z) { return x * x + y * y + z * z <= 1; }), deepest: ballDeepest, W: 10 },
    { name: "Cubes", dims: 3, shape: tilePolyhedron(function (x, y, z) { return Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 1; }),
      deepest: boxDeepest, W: 10 },
  ];
}

// The growth's maker for tile t's tests (for grownTiles and
// checkTileCoupling, js/check-page.js), with t's floor and these sides.
function makerFor(t, sides) {
  return function (options) { return newContinuousDeposit(Object.assign({ width: t.W, sides: sides }, options)); };
}

// The sides, in words.
function sidesWords(sides) { return sides === "walls" ? "walls" : "periodic sides"; }

// The places across, as [x] or [x, y], that are copies of each other on
// a floor W wide with these sides: just the place with walls, and with
// periodic sides the place moved by -W, 0 and W (each way).
function copiesAcross(place, W, sides) {
  if (sides === "walls") return [place];
  const steps = [-W, 0, W], copies = [];
  if (place.length === 1) for (const dx of steps) copies.push([place[0] + dx]);
  else for (const dx of steps) for (const dy of steps) copies.push([place[0] + dx, place[1] + dy]);
  return copies;
}

// Tile i's center, [x, y] or [x, y, z], and its place across.
function centerOf(growth, i) {
  const c = growth.cluster;
  return c.z.length > 0 ? [c.x[i], c.y[i], c.z[i]] : [c.x[i], c.y[i]];
}


/* =====================================================================
   1. THE TOP OF D, AND OF T
   ---------------------------------------------------------------------
   With the tile's center at height 0, T's top and bottom above the
   place u across (top(u), bottom(u)) come plainly from its polygon:
   the highest and lowest of its edges there. D = T - T is the points
   s - t, s and t in T, so D's top above dx is the most s_y - t_y can be
   with s_x - t_x = dx: the largest top(u + dx) - bottom(u) over u. That
   is taken over GRID_STEPS + 1 evenly spaced places u across T (and dx
   a whole number of their steps), so it can only be a little low:
   fallingTile's answer (differenceTop) must be no lower, and only a
   little higher. For a disk of radius r, D is the disk of radius 2r, so
   its top is sqrt(4 r^2 - dx^2) exactly. T's own top (tileTop) must be
   exactly top(u).
   ===================================================================== */
const GRID_STEPS = 8000;

function checkTops(t, places) {
  const fit = fallingTile(t.shape), s = t.shape, left = Math.min(...s.px), right = Math.max(...s.px);
  const step = (right - left) / GRID_STEPS, tops = [], bottoms = [];
  for (let k = 0; k <= GRID_STEPS; k++) {
    tops.push(edgeHeight(s, left + k * step, Math.max));
    bottoms.push(edgeHeight(s, left + k * step, Math.min));
  }
  let low = 0, high = 0, tileOff = 0;
  for (let k = 0; k < places; k++) {
    const j = Math.round(-GRID_STEPS + 2 * GRID_STEPS * (k + 0.5) / places), dx = j * step;
    let plain = -Infinity;
    if (s.round) plain = Math.sqrt(4 * s.rhoMax * s.rhoMax - dx * dx);
    else for (let i = Math.max(0, -j); i <= Math.min(GRID_STEPS, GRID_STEPS - j); i++) plain = Math.max(plain, tops[i + j] - bottoms[i]);
    const found = fit.differenceTop(dx, 0);
    low = Math.max(low, plain - found);
    high = Math.max(high, found - plain);
    const u = left + (right - left) * (k + 0.5) / places;
    tileOff = Math.max(tileOff, Math.abs(fit.tileTop(u, 0) - (s.round ? Math.sqrt(s.rhoMax * s.rhoMax - u * u) : edgeHeight(s, u, Math.max))));
  }
  const tolerance = s.round ? 1e-12 : 1e-2 * s.rhoMax;
  addRow(t.name + ": the top of D = T − T and of T", low < 1e-9 * s.rhoMax && high < tolerance && tileOff < 1e-12,
         places + " places across: D's top is at most " + fourDigits(low) + " below the plain answer and " + fourDigits(high) +
         " above it" + (s.round ? " (exact for a disk)" : " (the plain answer is the best of " + (GRID_STEPS + 1) + " places, so a little low)") +
         "; T's top is " + fourDigits(tileOff) + " off");
}

// The highest (most = Math.max) or lowest (Math.min) of the polygon's
// edges above the place u across, or -Infinity (Infinity) if none is.
function edgeHeight(s, u, most) {
  let best = most === Math.max ? -Infinity : Infinity;
  for (let e = 0; e < s.px.length; e++) {
    const f = (e + 1) % s.px.length, ax = s.px[e], bx = s.px[f];
    if ((ax <= u) !== (bx <= u)) best = most(best, s.py[e] + (u - ax) * (s.py[f] - s.py[e]) / (bx - ax));
  }
  return best;
}


/* =====================================================================
   2. WHERE A TILE STOPS, AGAINST A PLAIN SEARCH
   ---------------------------------------------------------------------
   After n particles, particles n, n + 1, ... are dropped (land(p)),
   none added, and each is compared with a plain search: the highest of
   the floor's stop (minus T's lowest point) and, over every tile q and
   each of its copies across, q's height plus D's top above the gap.
   (The growth works out a gap across the periodic edge as the gap less
   the nearest whole number of widths, so the two can differ by
   rounding: they must agree to 1e-9 of the height.)
   ===================================================================== */
function checkStop(t, sides, n, runs) {
  const growth = grownTiles(makerFor(t, sides), t, "stop", n), fit = growth.fit, across = t.dims - 1;
  let wrong = 0, worst = 0;
  for (let p = n; p < n + runs; p++) {
    const landed = growth.land(p), x = landed.slice(0, across);
    let best = -fit.low;
    for (let i = 0; i < n; i++) {
      const q = centerOf(growth, i);
      for (const copy of copiesAcross(q.slice(0, across), t.W, sides)) {
        best = Math.max(best, q[across] + fit.differenceTop(x[0] - copy[0], across === 2 ? x[1] - copy[1] : 0));
      }
    }
    worst = Math.max(worst, Math.abs(best - landed[across]));
    if (Math.abs(best - landed[across]) > 1e-9 * Math.max(1, best)) wrong++;
  }
  addRow(t.name + ", " + sidesWords(sides) + ": where a tile stops, against a plain search", wrong === 0,
         runs + " particles dropped on a deposit of " + n + ": " + wrong + " stopped elsewhere than the plain search says (the " +
         "largest difference " + fourDigits(worst) + ", rounding)");
}


/* =====================================================================
   3. A BIG DEPOSIT, RECOUNTED
   ---------------------------------------------------------------------
   For each tile: how deep any other tile (or a copy across) goes into
   it (deepest, js/check-page.js), and its gap to the floor (its lowest
   point's height, from T's polygon or polyhedron) or to the nearest
   tile that came before it (copyGap): 0 when it touches. With walls,
   each tile is between them. The surface is recounted: above each
   sample point, the highest top of any tile there (T's top, from its
   polygon or polyhedron in a plain way: tileTop is tested in test 1),
   or the floor, 0.
   ===================================================================== */
function checkBigDeposit(t, sides, n) {
  const growth = grownTiles(makerFor(t, sides), t, "big deposit", n), s = t.shape, gaps = copyGap(s), fit = growth.fit;
  const across = t.dims - 1, reach = 2 * s.rhoMax + 1e-9;
  const lowest = Math.min(...(t.dims === 3 ? s.pz : s.py));
  const centers = [];
  for (let i = 0; i < n; i++) centers.push(centerOf(growth, i));
  const near = function (a, b) { return a.every(function (x, d) { return Math.abs(x - b[d]) <= reach; }); };
  let worstGap = 0, deepest = Infinity, outside = 0;
  centers.forEach(function (a, i) {
    let nearest = a[across] + lowest;      // the gap to the floor
    centers.forEach(function (q, j) {
      if (j === i) return;
      for (const copy of copiesAcross(q.slice(0, across), t.W, sides)) {
        const b = copy.concat(q[across]);
        if (!near(a, b)) continue;
        if (j < i) nearest = Math.min(nearest, gaps.gap(a, b, nearest));
        deepest = Math.min(deepest, t.deepest(a.map(function (x, d) { return x - b[d]; })));
      }
    });
    worstGap = Math.max(worstGap, nearest);
    if (sides === "walls" && a.slice(0, across).some(function (x, d) { return x + fit.left[d] < -1e-9 || x + fit.right[d] > t.W + 1e-9; })) outside++;
  });
  // The surface, recounted.
  const heights = growth.samples.map(function (point) {
    let best = 0;
    for (const q of centers) {
      for (const copy of copiesAcross(q.slice(0, across), t.W, sides)) {
        best = Math.max(best, q[across] + plainTileTop(t, point.map(function (x, d) { return x - copy[d]; })));
      }
    }
    return best;
  });
  let heightsOff = 0;
  heights.forEach(function (h, m) { heightsOff = Math.max(heightsOff, Math.abs(h - growth.surface.heights[m])); });
  const mean = heights.reduce(function (a, b) { return a + b; }, 0) / heights.length;
  const width = Math.sqrt(heights.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / heights.length);
  const numbersOff = Math.max(Math.abs(growth.surface.mean() - mean), Math.abs(growth.surface.width() - width));
  addRow(t.name + ", " + sidesWords(sides) + ": a deposit of " + n + " particles, recounted",
         worstGap < 1e-9 * s.rhoMax && deepest > 1 - 1e-9 && outside === 0 && heightsOff < 1e-9 && numbersOff < 1e-9,
         "each tile touches the floor or an earlier tile (the largest gap " + fourDigits(worstGap) + "); no point of a tile inside " +
         "another by more than " + fourDigits(Math.max(0, 1 - deepest)) + " of its size; " +
         (sides === "walls" ? outside + " tiles not between the walls; " : "") + "the surface's " + heights.length + " heights are " +
         fourDigits(heightsOff) + " off, its mean height and width " + fourDigits(numbersOff) + " off");
}

// T's top above the place d across from its center (-Infinity if none):
// a disk's or ball's from its radius, a box's from its corners, and
// otherwise from its polygon (edgeHeight).
function plainTileTop(t, d) {
  const s = t.shape;
  if (d.some(function (x) { return Math.abs(x) > s.rhoMax; })) return -Infinity;     // (too far across)
  if (s.round) {
    const left = s.rhoMax * s.rhoMax - d.reduce(function (sum, x) { return sum + x * x; }, 0);
    return left >= 0 ? Math.sqrt(left) : -Infinity;
  }
  if (t.dims === 3) {
    const inside = [s.px, s.py].every(function (c, k) { return d[k] >= Math.min(...c) && d[k] <= Math.max(...c); });
    return inside ? Math.max(...s.pz) : -Infinity;
  }
  return edgeHeight(s, d[0], Math.max);
}


/* =====================================================================
   4. UNIFORM PLACES
   ---------------------------------------------------------------------
   Particles 0, 1, 2, ... are dropped (land(p)), none added, and the
   places they fall at counted in equal pieces of where a center can
   be: with periodic sides 0 <= x < W, with walls the places where the
   tile fits between them (each way, in space).
   ===================================================================== */
const PLACE_PIECES = { 2: 20, 3: 5 };
function checkPlaces(t, sides, runs) {
  const growth = makerFor(t, sides)({ dim: t.dims, tile: t.shape, seed: "places " + t.name + " " + sides }), fit = growth.fit, across = t.dims - 1;
  const pieces = PLACE_PIECES[t.dims], counts = new Array(Math.pow(pieces, across)).fill(0);
  let outside = 0;
  for (let p = 0; p < runs; p++) {
    const landed = growth.land(p);
    let cell = 0;
    for (let d = across - 1; d >= 0; d--) {
      const from = sides === "walls" ? -fit.left[d] : 0, to = sides === "walls" ? t.W - fit.right[d] : t.W;
      const share = (landed[d] - from) / (to - from);
      if (share < 0 || share >= 1) outside++;
      cell = cell * pieces + Math.min(pieces - 1, Math.max(0, Math.floor(share * pieces)));
    }
    counts[cell]++;
  }
  const test = equalChiSquare(counts);
  addRow(t.name + ", " + sidesWords(sides) + ": uniform places across", outside === 0 && test.pValue > 0.001,
         runs + " particles, " + counts.length + " equal pieces: chi-square " + test.statistic.toFixed(1) + " with " + test.degrees +
         " degrees of freedom, p = " + test.pValue.toFixed(3) + "; " + outside + " outside where a center can be");
}


/* =====================================================================
   6. A FLOOR TOO NARROW
   ---------------------------------------------------------------------
   With periodic sides the floor must be at least twice as wide as the
   tile (so a tile meets another only once, not also its copy across),
   and with walls at least as wide as the tile.
   ===================================================================== */
function checkNarrow(t) {
  const fit = fallingTile(t.shape), width = fit.right[0] - fit.left[0];
  const refused = function (sides, W) {
    try { newContinuousDeposit({ dim: t.dims, tile: t.shape, width: W, sides: sides, seed: "narrow" }); return false; }
    catch (error) { return true; }
  };
  const right = refused("periodic", 1.9 * width) && !refused("periodic", 2.1 * width) && refused("walls", 0.9 * width) && !refused("walls", 1.1 * width);
  addRow(t.name + ": a floor too narrow is refused", right,
         "periodic sides need at least twice the tile's width, walls at least its width: " + (right ? "so it is" : "NOT so"));
}


/* =====================================================================
   7. CLICKS
   ---------------------------------------------------------------------
   checkClicks (js/check-page.js), with a click 0.37 of the way across
   the floor (and 0.61 of the way back, in space).
   ===================================================================== */
function checkTileClicks(t, sides, n) {
  const make = function () { return makerFor(t, sides)({ dim: t.dims, tile: t.shape, seed: "clicks" }); };
  const place = [0.37 * t.W].concat(t.dims === 3 ? [0.61 * t.W] : []);
  const key = function (g, i) { return centerOf(g, i).map(function (x) { return x.toFixed(9); }).join(" "); };   // (to rounding: a place moved a width over and back)
  checkClicks(t.name + ", " + sidesWords(sides), make, key, n, n, place, place.map(function () { return t.W; }), sides === "walls");
}


function allTests() {
  const tests = [];
  for (const t of testTiles()) {
    const n = t.dims === 3 ? 500 : 800;
    if (t.dims === 2) tests.push(function () { checkTops(t, 400); });
    for (const sides of ["periodic", "walls"]) {
      tests.push(function () { checkStop(t, sides, n, 200); });
      tests.push(function () { checkBigDeposit(t, sides, n); });
      tests.push(function () { checkPlaces(t, sides, 20000); });
    }
    tests.push(function () { checkTileCoupling(makerFor(t, "periodic"), t, n / 2, n / 2); });
    tests.push(function () { checkNarrow(t); });
    for (const sides of ["periodic", "walls"]) tests.push(function () { checkTileClicks(t, sides, n / 2); });
  }
  return tests;
}

runChecksOnClick(allTests);
