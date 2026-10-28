/* =====================================================================
   first-passage-percolation-rule.js  —  the model behind the "First
   Passage Percolation" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Every edge of the domain (or, with "Weights on cells", every cell)
     gets a random passage time tau >= 0, all independent, all with the
     law chosen in the law box (js/sim-laws.js). Crossing an edge takes
     its time; with the times on the cells, stepping onto a cell takes
     that cell's time (the start's own time is never paid). The passage
     time T(x, y) is the least total time of a path from x to y, and a
     path that takes exactly that long is a geodesic.

     The ball B(t) is every cell with T(0, x) <= t: where a fluid poured
     in at the start 0 has reached by time t. Dijkstra's algorithm finds
     the cells in exactly that order, the nearest (in time) first, one
     at a time, so watching it work is watching B(t) grow.

   THE RANDOM TIMES. Each edge (or cell) has its own uniform number U in
   (0, 1), from the seed and where it is (seededUniform,
   js/sim-worker.js), and its time is tau = F^-1(U), F being the law's
   distribution function (drawFromLaw, js/sim-laws.js). So the same seed
   gives the same times, a box that grows keeps the times it had, and
   moving a slider of the law moves every time a little, the same way
   (F^-1 only goes up as U does): the sliders are coupled, as the p of
   Bernoulli percolation is.

   This file has no drawing and no buttons. The sim's page
   (first-passage-percolation.js) and its check page
   (first-passage-percolation-check.js) use it, with the domains of
   js/sim-domains.js and js/sim-hyperbolic.js.

   Contents:
     placeOf(d, v)                  where cell v is, as three whole numbers
     newWeights(d, seed, onCells)   one U per edge (or per cell)
     passageTimes(weights, law)     the times tau = F^-1(U)
     stepTime(times, e, w)          the time of a step along neighbor entry e, onto w
     newSearch(d, times, start)     Dijkstra's algorithm, one cell at a time
     geodesic(search, v)            the geodesic from the start to v
     pathBetween(d, times, a, b, edge)   T(a, b) and a geodesic between them
     randomOrder(d, seed, cells)    some cells in a uniformly random order
     edgeCells(d)                   the cells on the domain's edge
     edgeKey(d, v, w)               one number for the edge between v and w
   ===================================================================== */


// Which kind of number seededUniform is asked for, so an edge's U, a
// cell's U and a cell's place in the random order (randomOrder) are
// never the same number.
const EDGE_TAG = 1, CELL_TAG = 2, ORDER_TAG = 3;

// Where cell v of domain d is, as three whole numbers that are the same
// in every domain that has that cell: (x, y, 0) for a square, (I, J, k)
// for cell k of block (I, J) of a tiling, the middle in 1/1024ths of a
// side length for a tiling that never repeats (its cells' numbers
// depend on how its patch grew: js/sim-penrose.js), and for a ball of
// the hyperbolic plane or a tree, its number (makeBall numbers the cells
// outward from the start, the same way in every ball of a graph).
function placeOf(d, v) {
  if (!d.x) return [v, 0, 0];
  if (d.tiling && d.tiling.finite) {
    const [u, w] = cellMiddle(d, v);
    return [Math.round(1024 * u), Math.round(1024 * w), 0];
  }
  return [d.x[v], d.y[v], d.part ? d.part[v] : 0];
}

// One uniform number U in (0, 1) for every edge of domain d, or, with
// "onCells", for every cell, from the seed and their places (placeOf).
// Returns { onCells, U }: with the numbers on the edges, U[e] belongs to
// entry e of the neighbor lists (d.nbr[e]), and the two entries of an
// edge, v -> w and w -> v, get the same number (from the two places in
// the same order, the smaller first).
function newWeights(d, seed, onCells) {
  const random = seededUniform(seed), places = [];
  for (let v = 0; v < d.n; v++) places.push(placeOf(d, v));
  if (onCells) return { onCells: true, U: Float64Array.from(places, function (p) { return random.uniform(CELL_TAG, ...p); }) };
  const U = new Float64Array(d.nbr.length);
  for (let v = 0; v < d.n; v++) {
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const [a, b] = inOrder(places[v], places[d.nbr[e]]);
      U[e] = random.uniform(EDGE_TAG, ...a, ...b);
    }
  }
  return { onCells: false, U: U };
}

// Two places, the smaller first (comparing the first numbers, then the
// second, then the third).
function inOrder(p, q) {
  for (let k = 0; k < 3; k++) if (p[k] !== q[k]) return p[k] < q[k] ? [p, q] : [q, p];
  return [p, q];
}

// The passage times: tau = F^-1(U) for each U of "weights", with F the
// distribution function of "law" (readLaw, js/sim-laws.js). Returns
// { onCells, tau }, tau lined up with weights.U.
function passageTimes(weights, law) {
  return { onCells: weights.onCells, tau: Float64Array.from(weights.U, function (u) { return drawFromLaw(law, u); }) };
}

// The time of the step from a cell along its neighbor entry e (d.nbr[e]
// = w): the edge's time, or with the times on the cells, w's.
function stepTime(times, e, w) {
  return times.onCells ? times.tau[w] : times.tau[e];
}


/* ---------------------------------------------------------------------
   DIJKSTRA'S ALGORITHM
   E. W. Dijkstra, "A note on two problems in connexion with graphs",
   Numer. Math. 1 (1959) 269-271. Every cell waits with the least time
   found so far for reaching it (Infinity at first, 0 for the start).
   Each step "settles" the waiting cell with the least time: that time
   is T(start, cell), since every other way there passes through a cell
   that is reached later, and times are never negative. Then each of its
   neighbors gets the time through it, if that is less. The waiting
   cells are kept in a heap (newHeap, js/sim-worker.js), so the least is
   always first; a cell whose time goes down is added again, and its
   older, larger entry is skipped when it comes up.
   --------------------------------------------------------------------- */

// Dijkstra's algorithm on domain d with the passage times "times"
// (passageTimes), from the cell "start". Returns "search":
//   search.next()     settle the next cell (the one with the least T),
//                     and return it, or -1 if every cell it can reach
//                     is settled
//   search.peek()     the cell next() would settle, without settling it
//                     (-1 if none)
//   search.order      the cells settled so far, in order
//   search.T[v]       T(start, v) once v is settled (before that, the
//                     least time found so far, Infinity if none)
//   search.parent[v]  the cell before v on its geodesic (-1 for the
//                     start, and for a cell not reached yet)
//   search.settled[v] 1 once v is settled
function newSearch(d, times, start) {
  const T = new Float64Array(d.n).fill(Infinity), parent = new Int32Array(d.n).fill(-1);
  const settled = new Uint8Array(d.n), heap = newHeap();
  const search = { start: start, T: T, parent: parent, settled: settled, order: [] };
  T[start] = 0;
  heap.add(0, start);

  search.peek = function () {
    while (heap.size() > 0 && settled[heap.firstItem()]) heap.take();   // older entries of settled cells
    return heap.size() > 0 ? heap.firstItem() : -1;
  };

  search.next = function () {
    const v = search.peek();
    if (v === -1) return -1;
    heap.take();
    settled[v] = 1;
    search.order.push(v);
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (settled[w]) continue;
      const t = T[v] + stepTime(times, e, w);
      if (t < T[w]) { T[w] = t; parent[w] = v; heap.add(t, w); }
    }
    return v;
  };
  return search;
}

// The geodesic Dijkstra found from the start to the settled cell v, as
// the list of its cells from the start to v.
function geodesic(search, v) {
  const path = [];
  for (let c = v; c !== -1; c = search.parent[c]) path.push(c);
  return path.reverse();
}

// T(a, b) and a geodesic from a to b: Dijkstra from a, stopped once b
// is settled. Returns { time, path } (path from a to b), or null if b
// can't be reached from a. With "edge" (from edgeCells, for a box that
// stands for the whole plane), it returns { atEdge: true } instead if a
// cell on the domain's edge would be settled before b: then a path
// leaving the box might be quicker, so the answer needs a bigger box.
// (Every path that leaves the box passes through an edge cell first,
// and the times inside the box are the plane's, so until an edge cell
// is settled, the box's T is the plane's.)
function pathBetween(d, times, a, b, edge) {
  const search = newSearch(d, times, a);
  for (;;) {
    const v = search.peek();
    if (v === -1) return null;
    if (v !== b && edge && edge[v]) return { atEdge: true };
    search.next();
    if (v === b) return { time: search.T[b], path: geodesic(search, b) };
  }
}


/* ---------------------------------------------------------------------
   THE PAIRS, AND THE EDGE OF A DOMAIN
   --------------------------------------------------------------------- */

// The cells "cells" of domain d in a uniformly random order: sorted by
// a uniform number each, from the seed and their places (placeOf). Any
// first 2n of them are a uniformly random set of 2n cells, in a
// uniformly random order, so pairing them in order (the 1st with the
// 2nd, the 3rd with the 4th, ...) pairs them uniformly too. The order
// stays the same when n changes, and when the domain grows.
function randomOrder(d, seed, cells) {
  const random = seededUniform(seed);
  const key = new Map(cells.map(function (v) { return [v, random.uniform(ORDER_TAG, ...placeOf(d, v))]; }));
  return cells.slice().sort(function (v, w) { return key.get(v) - key.get(w); });
}

// The cells of domain d on its edge, as a list of 0s and 1s: those with
// a neighbor missing. On the square grid, the cells with fewer than 4
// neighbors; on another tiling, those with a side that has no cell
// across it (d.sides); on a ball of the hyperbolic plane or a tree, its
// outermost layer, R steps from the start (whose cells have neighbors
// one step further out).
function edgeCells(d) {
  const edge = new Uint8Array(d.n);
  if (!d.x) {
    const steps = stepsFrom(d, [0]);       // (js/sim-domains.js)
    for (let v = 0; v < d.n; v++) edge[v] = steps[v] === d.R ? 1 : 0;
  } else if (d.sides) {
    for (let v = 0; v < d.n; v++) edge[v] = d.sides[v].includes(-1) ? 1 : 0;
  } else {
    for (let v = 0; v < d.n; v++) edge[v] = d.first[v + 1] - d.first[v] < 4 ? 1 : 0;
  }
  return edge;
}

// One number for the edge between neighbors v and w of domain d, the
// same both ways (for counting how many geodesics use each edge).
function edgeKey(d, v, w) {
  return v < w ? v * d.n + w : w * d.n + v;
}
