/* =====================================================================
   sim-shape.js  —  the shape of a set of cells: its convex hull and
   its holes
   ---------------------------------------------------------------------
   Shared by Eden Growth (the shape and holes of its base), Random Walk
   (the hull and holes of the cells the walker has visited) and First
   Passage Percolation (the shape and holes of the ball), and by their
   check pages. A sim's second thread (a "Web Worker") can't
   see the page's scripts, so a sim hands these functions to runInWorker
   (js/sim-page.js) in its list of helpers, which copies them in:
   shapeHelpers() lists them, with the two of js/sim-domains.js they
   use.

   Contents:
     convexHull(points)        the corners of the smallest convex polygon
                               holding some points
     growingHull()             the same, kept up to date as points come
     polygonArea(corners)      a polygon's area ...
     polygonPerimeter(corners) ... and the length around it
     newShape(from, bins)      a growing set's farthest cell in each
                               direction, its area, hull and convexity
     holeHistory(set, now)     the holes of a set of cells (squares, or
                               any tiling's cells), with the step each
                               one opened and closed
     bettiOverTime(holes, times)   the number of holes at given steps
     holeReporter()            the holes for a sim's reports, kept up
                               to date without slowing a run down
     frontierLength(set)       the length of the set's outer boundary
     cellWindow(...)           the cells around a set that these two
                               look at (squareWindow, tilingWindow,
                               finiteWindow)
     shapeHelpers()            all of them, for a second thread
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

// The convex hull of a set of points that only grows: hull.add(p) adds
// the point p, and hull.corners() is the hull's corners now, as
// convexHull gives them. Only the corners so far are kept: the hull of
// the set with p is the hull of those and p. A point inside the hull
// (or on its edge) changes nothing, and is checked in one pass around
// it; otherwise the hull is found again.
function growingHull() {
  let kept = [];   // the corners so far (or, while there is just one point, that point)
  // Is p inside the convex polygon with these corners (counterclockwise),
  // or on its edge? Then it is on the left of every side, or on it.
  function inside(p) {
    if (kept.length < 3) return false;
    for (let k = 0; k < kept.length; k++) {
      const a = kept[k], b = kept[(k + 1) % kept.length];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false;
    }
    return true;
  }
  return {
    add: function (p) {
      if (inside(p)) return;
      const corners = convexHull(kept.concat([p]));
      kept = corners.length > 0 ? corners : [p];
    },
    corners: function () { return kept.length > 1 ? kept : []; },
  };
}

// The area inside a polygon, from its corners in order, either way
// around (signedArea, js/sim-domains.js).
function polygonArea(corners) { return Math.abs(signedArea(corners)); }

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


// The shape of a set of cells that only grows, seen from the point
// "from" ([u, w], the middle of the start cell), kept up to date as
// cells join it, for the shape charts (Eden Growth, First Passage
// Percolation):
//   shape.add(middle, corners)   a cell joins: its middle and its corners
//   shape.radii[k]   the farthest distance (straight-line, from "from" to
//                    a cell's middle, in side lengths) of a cell of the
//                    set whose direction from "from" is in slice k of
//                    "bins" equal slices of the circle (slice 0 starts at
//                    -180 degrees, to the left), or 0 if none yet
//   shape.area       the set's area, K being the union of its cells
//   shape.hull       the convex hull of its cells' corners (growingHull),
//                    which is the hull of K
//   shape.convexity()   area(K) / area(hull of K): 1 when K is convex,
//                    smaller the more K has bays and holes
function newShape(from, bins) {
  const shape = { radii: new Float64Array(bins), area: 0, hull: growingHull() };
  shape.add = function (middle, corners) {
    const dx = middle[0] - from[0], dy = middle[1] - from[1];
    if (dx !== 0 || dy !== 0) {
      const k = Math.min(bins - 1, Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * bins));
      shape.radii[k] = Math.max(shape.radii[k], Math.sqrt(dx * dx + dy * dy));
    }
    for (const corner of corners) shape.hull.add(corner);
    shape.area += polygonArea(corners);
  };
  shape.convexity = function () { return shape.area / polygonArea(shape.hull.corners()); };
  return shape;
}

/* =====================================================================
   THE HOLES OF A SET OF CELLS, OVER TIME
   ---------------------------------------------------------------------
   The set K is a union of closed cells that only grows: cell i joins it
   at step bornAt[i]. The cells are unit squares, or the polygons of
   any tiling by regular polygons (js/sim-tilings.js; its tiles, or its
   corners drawn as the polygons around them). The holes of K are the
   bounded pieces of the plane outside K: groups of empty cells joined
   side to side that can't reach far away. (Cells meeting only at a
   corner don't need joining: if K misses that corner, every cell
   around it is empty, and they are joined side to side around it.)
   Their number is the first Betti number beta_1(K).

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
       the others was born at that step;
     - the groups left at the end, other than the outside, are the holes
       of the set at the start: born at step 0.
   Every group carries the step it dies at. Groups that are still holes
   now die "later than now", and the outside later than everything.

   Both this and the outer boundary (frontierLength) look at a finite
   "window" of cells around K, whose outermost cells are far enough
   from K to join the outside (cellWindow, below).
   ===================================================================== */

// The holes of a set of cells. "set" has, for each cell i, siteX[i]
// and siteY[i] (a square's x and y), and bornAt[i] (the step it joined;
// a cell with no bornAt, or a negative one, isn't in the set, and cells
// with bornAt 0 were there from the start). On another tiling it also
// has "tiling" (the tiling's repeating block, uprightBlock in
// js/sim-tilings.js), and cell i is cell siteZ[i] of block (siteX[i],
// siteY[i]). "now" is the step the run is at. Returns
//   births, deaths   one entry per hole that has died: born at step
//                    births[k], died at step deaths[k]
//   openBirths       the birth step of each hole still open now
//   holeCells        the cells of the holes now, as x0, y0, x1, y1, ...
//                    (on another tiling x0, y0, z0, x1, y1, z1, ...)
//   holeSizes        how many cells each hole has now
// beta_1 at step t is (births and openBirths up to t) - (deaths up to t).
function holeHistory(set, now) {
  const inside = [];
  for (let i = 0; i < set.siteX.length; i++) if (set.bornAt[i] >= 0) inside.push(i);
  const result = { births: [], deaths: [], openBirths: [], holeCells: [], holeSizes: [] };
  if (inside.length === 0) return result;
  const window = cellWindow(set, inside);
  const count = window.count, OUTSIDE = count;   // the window's cells, and one more for the outside

  // The step each cell was filled (-1 = empty now).
  const filledAt = new Float64Array(count).fill(-1);
  for (const i of inside) filledAt[window.cellOf(i)] = set.bornAt[i];

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

  // Now: the empty cells, joined to their empty neighbors, and the
  // window's edge joined to the outside.
  for (let c = 0; c < count; c++) {
    if (filledAt[c] >= 0) continue;
    diesAt[c] = LATER;
    if (window.onEdge(c)) join(c, OUTSIDE);
    for (const n of window.neighbors(c)) if (filledAt[n] < 0) join(c, n);
  }
  const outside = find(OUTSIDE);
  const sizeOf = new Map();     // a hole's leader -> how many cells it has
  for (let c = 0; c < count; c++) {
    if (filledAt[c] >= 0) continue;
    const g = find(c);
    if (g === outside) continue;
    result.holeCells.push(...window.siteOf(c));
    sizeOf.set(g, (sizeOf.get(g) || 0) + 1);
  }
  result.holeSizes = Array.from(sizeOf.values());

  // Backwards: take the cells away, last-born first (the cells there
  // from the start, born at step 0, stay).
  const order = inside.filter(function (i) { return set.bornAt[i] > 0; });
  order.sort(function (i, j) { return set.bornAt[j] - set.bornAt[i]; });
  for (const i of order) {
    const c = window.cellOf(i), step = set.bornAt[i];
    filledAt[c] = -1;
    // The groups of its empty neighbors (each once).
    const groups = [];
    for (const n of window.neighbors(c)) {
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

  // What is left is the set at the start (the cells born at step 0). If
  // it has holes of its own (First Passage Percolation's ball at time 0,
  // when some times are 0), each was born at step 0.
  const startHoles = new Set();
  for (let c = 0; c < count; c++) if (filledAt[c] < 0 && find(c) !== find(OUTSIDE)) startHoles.add(find(c));
  for (const g of startHoles) {
    if (diesAt[g] === LATER) result.openBirths.push(0);
    else { result.births.push(0); result.deaths.push(diesAt[g]); }
  }
  return result;
}

// The length of the outer boundary of a set of cells ("set" as in
// holeHistory, without bornAt: every cell is in it): the number of
// sides between a cell of the set and an empty cell that can reach far
// away (not in a hole). It is the perimeter of the set with its holes
// filled in, in side lengths. Found by a flood fill of the empty cells
// from the window's edge.
function frontierLength(set) {
  const inside = [];
  for (let i = 0; i < set.siteX.length; i++) inside.push(i);
  const window = cellWindow(set, inside);
  // 1 = in the set, 2 = empty and reached from outside, 0 = not yet reached.
  const state = new Uint8Array(window.count);
  for (const i of inside) state[window.cellOf(i)] = 1;
  const todo = [];
  for (let c = 0; c < window.count; c++) if (window.onEdge(c)) { state[c] = 2; todo.push(c); }
  let sides = 0;
  while (todo.length > 0) {
    for (const n of window.neighbors(todo.pop())) {
      if (state[n] === 1) sides++;
      else if (state[n] === 0) { state[n] = 2; todo.push(n); }
    }
  }
  return sides;
}

// The window of cells around the cells "inside" of a set (as in
// holeHistory): the box of squares around them, one square bigger all
// round, or on another tiling the box of blocks around them, a few
// blocks bigger all round. Its cells are numbered 0 .. count-1, and it
// says
//   cellOf(i)      the window's number for cell i of the set
//   siteOf(c)      which cell window cell c is, as [x, y] (on another
//                  tiling [x, y, z], as the set has them)
//   onEdge(c)      is c on the window's edge? Those cells are empty and
//                  can reach far away.
//   neighbors(c)   c's neighbors across its sides, those in the window
function cellWindow(set, inside) {
  if (!set.tiling) return squareWindow(set, inside);
  return set.tiling.finite ? finiteWindow(set, inside) : tilingWindow(set, inside);
}

// The window of squares: the box around the set, one square bigger all
// round, so its edge is outside the set. Square (x, y) is number
// (y - ymin) * across + (x - xmin).
function squareWindow(set, inside) {
  const { xmin, xmax, ymin, ymax } = boxAround(set.siteX, set.siteY, 1, inside);   // (js/sim-domains.js)
  const across = xmax - xmin + 1, down = ymax - ymin + 1, count = across * down;
  return {
    count: count,
    cellOf: function (i) { return (set.siteY[i] - ymin) * across + (set.siteX[i] - xmin); },
    siteOf: function (c) { return [c % across + xmin, Math.floor(c / across) + ymin]; },
    onEdge: function (c) {
      const x = c % across, y = Math.floor(c / across);
      return x === 0 || y === 0 || x === across - 1 || y === down - 1;
    },
    neighbors: function (c) {
      const x = c % across, list = [];
      if (x > 0) list.push(c - 1);
      if (x < across - 1) list.push(c + 1);
      if (c >= across) list.push(c - across);
      if (c + across < count) list.push(c + across);
      return list;
    },
  };
}

// The window of another tiling's cells: whole blocks, around the set's
// blocks with reach + 1 more blocks all round, where a cell's neighbors
// are at most "reach" blocks away (each cell's list "next" says which).
// So the cells of the outermost blocks and all their neighbors are
// empty, and reach far away through empty blocks.
// Cell z of block (x, y) is number
//   ((y - ymin) * across + (x - xmin)) * parts + z.
function tilingWindow(set, inside) {
  const cells = set.tiling.cells, parts = cells.length;
  let reach = 1;
  for (const cell of cells) for (const [, dx, dy] of cell.next) reach = Math.max(reach, Math.abs(dx), Math.abs(dy));
  const { xmin, xmax, ymin, ymax } = boxAround(set.siteX, set.siteY, reach + 1, inside);
  const across = xmax - xmin + 1, up = ymax - ymin + 1;
  // The window's number for cell z of the window's block (i, j), or -1
  // if that block isn't in the window.
  const numberOf = function (i, j, z) {
    return i < 0 || j < 0 || i >= across || j >= up ? -1 : (j * across + i) * parts + z;
  };
  return {
    count: across * up * parts,
    cellOf: function (i) { return numberOf(set.siteX[i] - xmin, set.siteY[i] - ymin, set.siteZ[i]); },
    siteOf: function (c) {
      const block = Math.floor(c / parts);
      return [block % across + xmin, Math.floor(block / across) + ymin, c % parts];
    },
    onEdge: function (c) {
      const block = Math.floor(c / parts), i = block % across, j = Math.floor(block / across);
      return i === 0 || j === 0 || i === across - 1 || j === up - 1;
    },
    neighbors: function (c) {
      const block = Math.floor(c / parts), i = block % across, j = Math.floor(block / across), list = [];
      for (const [z, dx, dy] of cells[c % parts].next) {
        const n = numberOf(i + dx, j + dy, z);
        if (n >= 0) list.push(n);
      }
      return list;
    },
  };
}

// The window of a tiling that never repeats (js/sim-penrose.js): one
// block, a patch around the middle. The window is the patch's cells
// whose middles are within 5 of the box around the set's middles. Its
// edge is the cells more than 3 out, and those missing a neighbor (at
// the edge of the patch): none can be in a hole, as every cell of the
// set lies within 2 of that box (a cell's corners are less than 2 from
// its middle). The cells up to 3 out have all their neighbors in the
// window (their middles are less than 2 further out). Cell k of the
// patch is number numberOf[k] of the window.
function finiteWindow(set, inside) {
  const cells = set.tiling.cells;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const i of inside) {
    const [x, y] = cells[set.siteZ[i]].middle;
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  // How far the middle of cell k is out of the box (0 inside it).
  const out = function (k) {
    const [x, y] = cells[k].middle;
    return Math.max(xmin - x, x - xmax, ymin - y, y - ymax, 0);
  };
  const list = [], numberOf = new Int32Array(cells.length).fill(-1);
  cells.forEach(function (cell, k) {
    if (out(k) <= 5) { numberOf[k] = list.length; list.push(k); }
  });
  return {
    count: list.length,
    cellOf: function (i) { return numberOf[set.siteZ[i]]; },
    siteOf: function (c) { return [0, 0, list[c]]; },
    onEdge: function (c) {
      return out(list[c]) > 3 || cells[list[c]].next.some(function ([k]) { return k < 0; });
    },
    neighbors: function (c) {
      const near = [];
      for (const [k] of cells[list[c]].next) if (k >= 0 && numberOf[k] >= 0) near.push(numberOf[k]);
      return near;
    },
  };
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

// The holes of a set that grows step by step, for a sim's second
// thread to send its page: report(set, step, busy, times) gives the
// holes of "set" (as in holeHistory) at step "step", as
//   step           the step they are for
//   now, closed    how many holes are open, and how many have closed
//   births, deaths the steps the closed ones were born and died
//   cells, sizes   the open ones' cells (holeCells) and sizes
//   times, beta    beta_1 at the steps "times" up to "step"
// They are worked out again at each new step, but while "busy" (the
// sim is playing) at most a fifth of the time; in between, the last
// ones are given again, for an older step. A new run gets a new
// reporter (the holes kept are the old run's).
function holeReporter() {
  let holes = null, holesStep = -1, free = 0;
  return function report(set, step, busy, times) {
    const start = performance.now();
    if (holesStep !== step && (!busy || start >= free)) {
      holes = holeHistory(set, step);
      holesStep = step;
      free = start + 4 * (performance.now() - start);
    }
    const upTo = times.filter(function (t) { return t <= holesStep; });
    return {
      step: holesStep, now: holes.openBirths.length, closed: holes.deaths.length,
      births: Float64Array.from(holes.births), deaths: Float64Array.from(holes.deaths),
      cells: Int32Array.from(holes.holeCells), sizes: Int32Array.from(holes.holeSizes),
      times: Float64Array.from(upTo), beta: bettiOverTime(holes, upTo),
    };
  };
}

// What a second thread needs to use this file, for runInWorker
// (js/sim-page.js): its functions, and signedArea and boxAround
// (js/sim-domains.js).
function shapeHelpers() {
  return [convexHull, growingHull, polygonArea, polygonPerimeter, newShape, holeHistory, bettiOverTime, holeReporter,
          frontierLength, cellWindow, squareWindow, tilingWindow, finiteWindow, signedArea, boxAround];
}
