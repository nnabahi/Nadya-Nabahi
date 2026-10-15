/* =====================================================================
   sim-shape.js  —  the shape of a set of cells: its convex hull and
   its holes
   ---------------------------------------------------------------------
   Shared by Eden Growth (the shape and holes of its base) and Random
   Walk (the hull and holes of the cells the walker has visited), and
   by their check pages. A sim's second thread (a "Web Worker") can't
   see the page's scripts, so a sim hands these functions to startWorker
   (js/sim-page.js) in its list of helpers, which copies them in. That
   is also why each one keeps everything it needs inside it.

   Contents:
     convexHull(points)        the corners of the smallest convex polygon
                               holding some points
     polygonArea(corners)      a polygon's area ...
     polygonPerimeter(corners) ... and the length around it
     holeHistory(...)          the holes of a set of square cells, with
                               the step each one opened and closed
     bettiOverTime(holes, times)   the number of holes at given steps
   ===================================================================== */


// The convex hull of "points" (a list of [x, y]): the corners of the
// smallest convex polygon holding them all, going around
// counterclockwise. Points on a side of the hull, between two corners,
// are left out. Two points give [a, b] (a flat "polygon", there and
// back), one point gives [] (nothing to go around).
// How: Andrew's "monotone chain" (A. M. Andrew, "Another efficient
// algorithm for convex hulls in two dimensions", Inform. Process. Lett.
// 9 (1979) 216-219). Sort the points left to right; walk along them,
// keeping only left turns, for the lower edge; then the same right to
// left for the upper edge.
function convexHull(points) {
  const sorted = points.slice().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
  // Turning left (> 0), right (< 0) or straight (0) going o -> a -> b.
  function turn(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  const hull = [];
  for (const pass of [sorted, sorted.slice().reverse()]) {
    const start = hull.length;
    for (const p of pass) {
      while (hull.length >= start + 2 && turn(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();   // its last point starts the other edge
  }
  return hull;
}

// The area inside a polygon, from its corners in order (the "shoelace
// formula").
function polygonArea(corners) {
  let twice = 0;
  for (let k = 0; k < corners.length; k++) {
    const p = corners[k], q = corners[(k + 1) % corners.length];
    twice += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(twice) / 2;
}

// The length around a polygon, from its corners in order (for the flat
// hull [a, b] of two points: there and back, twice the distance).
function polygonPerimeter(corners) {
  let length = 0;
  for (let k = 0; k < corners.length; k++) {
    const p = corners[k], q = corners[(k + 1) % corners.length];
    length += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return length;
}


/* =====================================================================
   THE HOLES OF A SET OF CELLS, OVER TIME
   ---------------------------------------------------------------------
   The set K is a union of unit squares (cells) that only grows: cell i
   joins it at step bornAt[i]. The holes of K are the bounded pieces of
   the plane outside K: groups of empty cells joined side to side (cells
   meeting only at a corner are apart, since K holds that corner) that
   can't reach far away. Their number is the first Betti number
   beta_1(K).

   A hole is born at the step that closes it off, or that splits an
   older hole in two, and dies at the step that fills its last cell. At
   a split, the piece that dies last keeps the old birth (the "elder
   rule" of persistent homology: H. Edelsbrunner, D. Letscher and A.
   Zomorodian, "Topological persistence and simplification", Discrete
   Comput. Geom. 28 (2002) 511-533).

   All of it is found at once, going backwards in time, with a
   "union-find" (a quick way to keep track of groups as they join):
   first the empty cells now, joined to their empty neighbors; then the
   cells of K taken away last-born first.
   Going backwards:
     - a cell with no empty neighbor is a hole of one cell that,
       forwards, died at that step;
     - a cell joining several groups is, forwards, a split: the group
       that dies last (the outside never dies) carries on, and each of
       the others was born at that step.
   Every group carries the step it dies at. Groups that are still holes
   now die "later than now", and the outside later than everything.
   ===================================================================== */

// The holes of the cells given by siteX, siteY and bornAt (the step
// each cell joined; a cell with no bornAt, or a negative one, isn't in
// the set, and cells with bornAt 0 were there from the start). "now" is
// the step the run is at. Returns
//   births, deaths   one entry per hole that has died: born at step
//                    births[k], died at step deaths[k]
//   openBirths       the birth step of each hole still open now
//   holeCells        the cells of the holes now, as x0, y0, x1, y1, ...
//   holeSizes        how many cells each hole has now
// beta_1 at step t is (births and openBirths up to t) - (deaths up to t).
function holeHistory(siteX, siteY, bornAt, now) {
  // The box around the set, one cell bigger all round, so its edge is
  // outside the set and joins the outside.
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const inside = [];
  for (let i = 0; i < siteX.length; i++) {
    if (!(bornAt[i] >= 0)) continue;
    inside.push(i);
    xmin = Math.min(xmin, siteX[i]); xmax = Math.max(xmax, siteX[i]);
    ymin = Math.min(ymin, siteY[i]); ymax = Math.max(ymax, siteY[i]);
  }
  const result = { births: [], deaths: [], openBirths: [], holeCells: [], holeSizes: [] };
  if (inside.length === 0) return result;
  xmin -= 1; xmax += 1; ymin -= 1; ymax += 1;
  const across = xmax - xmin + 1, down = ymax - ymin + 1;
  const count = across * down, OUTSIDE = count;   // cell number y * across + x, and one more for the outside

  // The step each cell was filled (-1 = empty now).
  const filledAt = new Float64Array(count).fill(-1);
  for (const i of inside) filledAt[(siteY[i] - ymin) * across + (siteX[i] - xmin)] = bornAt[i];

  // The union-find. leader[c] points toward the cell that speaks for
  // c's group; diesAt[leader] is when that group dies (forwards).
  const LATER = now + 1;        // still a hole now: it dies after now
  const leader = new Int32Array(count + 1);
  const diesAt = new Float64Array(count + 1);
  for (let c = 0; c <= count; c++) leader[c] = c;
  diesAt[OUTSIDE] = Infinity;
  function find(c) {
    while (leader[c] !== c) { leader[c] = leader[leader[c]]; c = leader[c]; }   // (halving the path on the way)
    return c;
  }
  // Join two groups; the one that dies later speaks for both.
  function join(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (diesAt[a] < diesAt[b]) leader[a] = b; else leader[b] = a;
  }

  // Now: the empty cells, joined side to side, and the box's edge
  // joined to the outside.
  for (let y = 0; y < down; y++) {
    for (let x = 0; x < across; x++) {
      const c = y * across + x;
      if (filledAt[c] >= 0) continue;
      diesAt[c] = LATER;
      if (x === 0 || y === 0 || x === across - 1 || y === down - 1) join(c, OUTSIDE);
      if (x > 0 && filledAt[c - 1] < 0) join(c, c - 1);
      if (y > 0 && filledAt[c - across] < 0) join(c, c - across);
    }
  }
  const outside = find(OUTSIDE);
  const sizeOf = new Map();     // a hole's leader -> how many cells it has
  for (let c = 0; c < count; c++) {
    if (filledAt[c] >= 0) continue;
    const g = find(c);
    if (g === outside) continue;
    result.holeCells.push(c % across + xmin, Math.floor(c / across) + ymin);
    sizeOf.set(g, (sizeOf.get(g) || 0) + 1);
  }
  result.holeSizes = Array.from(sizeOf.values());

  // Backwards: take the cells away, last-born first (the cells there
  // from the start, born at step 0, stay).
  const order = inside.filter(function (i) { return bornAt[i] > 0; });
  order.sort(function (i, j) { return bornAt[j] - bornAt[i]; });
  for (const i of order) {
    const x = siteX[i] - xmin, y = siteY[i] - ymin, c = y * across + x, step = bornAt[i];
    filledAt[c] = -1;
    // The groups of its empty neighbors (each once).
    const groups = [];
    for (const n of [c - 1, c + 1, c - across, c + across]) {
      if (filledAt[n] >= 0) continue;
      const g = find(n);
      if (!groups.includes(g)) groups.push(g);
    }
    if (groups.length === 0) {   // forwards: a hole of one cell, filled at this step
      diesAt[c] = step;
      continue;
    }
    // Forwards, filling c split one group into these: the one that dies
    // last carries on, the others were born at this step.
    let elder = groups[0];
    for (const g of groups) if (diesAt[g] > diesAt[elder]) elder = g;
    for (const g of groups) {
      if (g === elder) continue;
      if (diesAt[g] === LATER) result.openBirths.push(step);
      else { result.births.push(step); result.deaths.push(diesAt[g]); }
    }
    diesAt[c] = diesAt[elder];
    for (const g of groups) join(c, g);
  }
  return result;
}

// beta_1, the number of holes, at each of the steps "times" (in order),
// from the births and deaths found by holeHistory: the holes born up to
// step t, minus those that died up to step t.
function bettiOverTime(holes, times) {
  const births = holes.births.concat(holes.openBirths).sort(function (a, b) { return a - b; });
  const deaths = holes.deaths.slice().sort(function (a, b) { return a - b; });
  const beta = new Float64Array(times.length);
  let b = 0, d = 0;
  times.forEach(function (t, k) {
    while (b < births.length && births[b] <= t) b++;
    while (d < deaths.length && deaths[d] <= t) d++;
    beta[k] = b - d;
  });
  return beta;
}
