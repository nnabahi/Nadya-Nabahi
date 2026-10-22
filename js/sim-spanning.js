/* =====================================================================
   sim-spanning.js  —  spanning trees, shared by the sims
   ---------------------------------------------------------------------
   What it does, in plain words:
     A spanning tree of a graph (here: the cells, joined to their
     neighbors) is a set of its edges that joins every cell to every
     other in exactly one way: no loops, nothing left out. This file
     makes uniformly random spanning trees, counts spanning trees, and
     measures distances inside a tree. Uniform Spanning Tree and
     Connected Coloring use it.

   Contents:
     newWilson(n, nextCell)        Wilson's algorithm, one step at a time
     newTreeCounter(n, first, nbr) log of the number of spanning trees
                                   (Kirchhoff's matrix-tree theorem)
     treeDistances(n, parent, root, sources)
                                   how far each cell is, in the tree,
                                   from the nearest of some cells
     treePath(parent, a, b)        the path in the tree from a to b
     rerootTree(parent, r)         the same tree, with r as its root

   Every function here keeps its constants inside it, and uses only
   what it is given, so a worker can get a copy of it (runInWorker,
   js/sim-page.js), as the sims' second threads do.

   Trees are stored as "parent" lists: parent[v] is the next cell on the
   way from cell v to the root, and -1 for the root (and for cells not in
   the tree yet).
   ===================================================================== */


/* ---------------------------------------------------------------------
   Wilson's algorithm
   ---------------------------------------------------------------------
   D. B. Wilson, "Generating random spanning trees more quickly than the
   cover time", STOC 1996, doi:10.1145/237814.237880. Start with the root
   (or several roots) as the tree. From a cell not in the tree yet, walk
   at random until the walk hits the tree, erasing each loop as soon as
   the walk closes it; then add what is left of the walk (a path, with
   no loops) to the tree. Repeat until every cell is in. If each step
   goes to a uniformly random neighbor, the tree is exactly a uniformly
   random spanning tree, whatever order the walks start in (R. Lyons and
   Y. Peres, "Probability on Trees and Networks", Cambridge 2016,
   Theorem 4.1). With several roots, it is a uniformly random spanning
   tree of the graph with all the roots glued into one cell.

   The "colors" of Lyons and Peres's Figures 4.3 and 4.4 (same book,
   Section 4.1): picture each cell as holding a stack of random
   neighbors, and the walk always leaving a cell along the next one in
   its stack. A cell's color is how far down its stack the tree's edge
   from it was: the number of times the walks stepped out of it. The
   book proves the colors are independent of the tree. exits[v] counts
   them.

   newWilson(n, nextCell) makes the algorithm for a graph with cells
   0 .. n-1. nextCell(v) is where the walk goes from v: a uniformly
   random neighbor (or, to show a walk again, the next cell of the walk
   as it was).
     wilson.start(roots, cells)  start again: the tree is the roots, and
                                 the walks start from "cells" (a list), in
                                 that order, skipping the ones already in
                                 the tree by then
     wilson.step()               one step: start the next walk, or move
                                 the walk one cell, erasing the loop it
                                 closes or joining the tree. Returns the
                                 cell the walk is now at, or -1 once
                                 every cell of "cells" is in the tree
     wilson.newWalk              (after a step) did that step start a walk?
     wilson.finish()             steps until the tree is done
     wilson.done()               is every cell of "cells" in the tree?
     wilson.inTree(v)            is cell v in the tree?
     wilson.parent, .exits       the tree so far, and the colors so far
     wilson.path                 the walk so far, with its loops erased:
                                 its start first, where it is now last
     wilson.steps, .joined       steps the walks made, cells in the tree
   It keeps its lists from one start to the next (only the cells of
   "cells" are reset), so starting again on a few cells is quick:
   Connected Coloring makes a tree of two colors' cells at every move.
   --------------------------------------------------------------------- */
function newWilson(n, nextCell) {
  const wilson = {
    parent: new Int32Array(n).fill(-1),
    exits: new Int32Array(n),
    path: [],
    newWalk: false,
    steps: 0,
    joined: 0,
  };
  // inTree[v] === stamp: v is in the tree. Starting again bumps the
  // stamp, which takes every cell out of the tree at once.
  const inTree = new Int32Array(n);
  let stamp = 0;
  const place = new Int32Array(n).fill(-1);   // where each cell is in "path", or -1
  let order = [], next = 0;                   // the cells walks start from, and the next one to try

  wilson.start = function (roots, cells) {
    stamp++;
    order = cells;
    next = 0;
    for (const v of wilson.path) place[v] = -1;
    wilson.path.length = 0;
    wilson.steps = 0;
    for (const v of cells) { wilson.parent[v] = -1; wilson.exits[v] = 0; }
    for (const r of roots) { inTree[r] = stamp; wilson.parent[r] = -1; }
    wilson.joined = roots.length;
  };

  wilson.inTree = function (v) { return inTree[v] === stamp; };

  // Skip the start cells that are in the tree already.
  function skipJoined() {
    while (next < order.length && inTree[order[next]] === stamp) next++;
  }

  wilson.done = function () {
    skipJoined();
    return wilson.path.length === 0 && next === order.length;
  };

  wilson.step = function () {
    const path = wilson.path;
    wilson.newWalk = path.length === 0;
    if (wilson.newWalk) {                          // start the next walk
      skipJoined();
      if (next === order.length) return -1;
      const u = order[next];
      place[u] = 0;
      path.push(u);
      return u;
    }
    const head = path[path.length - 1], v = nextCell(head);
    wilson.exits[head]++;
    wilson.steps++;
    if (inTree[v] === stamp) {                     // it hit the tree: the path joins it
      for (let k = 0; k < path.length; k++) {
        const u = path[k];
        wilson.parent[u] = k + 1 < path.length ? path[k + 1] : v;
        inTree[u] = stamp;
        place[u] = -1;
      }
      wilson.joined += path.length;
      path.length = 0;
    } else if (place[v] >= 0) {                    // back on its own path: erase the loop
      for (let k = place[v] + 1; k < path.length; k++) place[path[k]] = -1;
      path.length = place[v] + 1;
    } else {                                       // a new cell
      place[v] = path.length;
      path.push(v);
    }
    return v;
  };

  wilson.finish = function () {
    while (wilson.step() !== -1) { /* keep walking */ }
  };

  return wilson;
}


/* ---------------------------------------------------------------------
   Counting spanning trees: log tau(S)
   ---------------------------------------------------------------------
   tau(S), the number of spanning trees of the cells S, comes from
   Kirchhoff's matrix-tree theorem (G. Kirchhoff, Annalen der Physik und
   Chemie 72 (1847) 497-508; see Godsil & Royle, "Algebraic Graph
   Theory", Springer 2001, Section 13.2): tau(S) is the determinant of
   the Laplacian matrix L of S (degree on the diagonal, -1 for each
   edge) with one cell's row and the matching column removed. That
   matrix is symmetric positive definite, so its determinant is the
   product of the squared diagonal entries of its Cholesky factor (Golub
   & Van Loan, "Matrix Computations", 4th ed., Section 4.2). Spanning
   tree counts are huge, so everything is kept as logarithms.

   The steps:
     a. Number the cells in breadth-first order, starting from a cell
        far from the middle, so neighbors get nearby numbers.
     b. Drop the last cell; build L, keeping only its band: the entries
        at most b places left of the diagonal (b = the largest gap in
        numbers between two neighbors). The rest are zero.
     c. Cholesky: L = R R^T with R lower triangular and inside the same
        band. Then det L = (product of R's diagonal)^2, so
        log det L = sum of log(R[p][p]^2).
   Row p of the band is stored as band[p * width + (p - q)] for the
   entries q = p - b, ..., p of that row (width = b + 1). Step c costs
   about m b^2 steps (m = the size of L) instead of m^3 / 3 (same book,
   Section 4.3). On the square grid b^2 is at most a few times m, but on
   a tree or a hyperbolic tiling (where most of a ball's cells are near
   its edge) it can be a hundred times m; when b^2 is more than
   WIDE_BAND times m, logByRemoval (below) finds the determinant instead.

   newTreeCounter(n, first, nbr) makes the counter for a graph with
   cells 0 .. n-1, the neighbors of cell v being nbr[first[v]] ..
   nbr[first[v + 1] - 1]:
     counter.logCount(cells)   log tau(cells), for a connected list of cells
   (It throws an error if the cells are not connected: then there is no
   spanning tree.)
   --------------------------------------------------------------------- */
function newTreeCounter(n, first, nbr) {
  const WIDE_BAND = 10;
  // Scratch space, one number per cell, reused by every count. A
  // "stamp" list marks cells by writing the current stamp number into
  // them; bumping the number un-marks every cell at once, for free.
  const member = new Int32Array(n), seen = new Int32Array(n);
  let memberStamp = 0, seenStamp = 0;
  const order = new Int32Array(n), position = new Int32Array(n);
  let band = new Float64Array(1024);   // the banded matrix; grows when needed

  function logCount(cells) {
    const m = cells.length - 1;          // size of the matrix L
    if (m <= 0) return 0;                // one cell: one tree, and log 1 = 0
    memberStamp++;
    for (const v of cells) member[v] = memberStamp;

    // a. Breadth-first order, twice: the last cell of the first search
    //    is far from where it started, a good place to start the second.
    const count = breadthFirstOrder(cells[0]);
    if (count !== cells.length) throw new Error("the cells are not connected");
    breadthFirstOrder(order[count - 1]);

    // b. The band width b, then the matrix itself.
    let b = 0;
    for (let p = 0; p < m; p++) {
      const v = order[p];
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] === memberStamp && position[w] < p) b = Math.max(b, p - position[w]);
      }
    }
    if (b * b > WIDE_BAND * m) return logByRemoval(cells, m);
    const width = b + 1;
    if (band.length < m * width) band = new Float64Array(m * width * 2);
    band.fill(0, 0, m * width);
    for (let p = 0; p < m; p++) {
      const v = order[p];
      let degree = 0;
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] !== memberStamp) continue;
        degree++;                                      // the dropped cell still counts here
        if (position[w] < p) band[p * width + (p - position[w])] = -1;
      }
      band[p * width] = degree;
    }

    // c. Banded Cholesky, overwriting the band with R.
    let logDet = 0;
    for (let p = 0; p < m; p++) {
      const qFrom = Math.max(0, p - b);
      for (let q = qFrom; q <= p; q++) {
        // s = L[p][q] - (sum over r < q of R[p][r] R[q][r])
        let s = band[p * width + (p - q)];
        for (let r = Math.max(qFrom, q - b); r < q; r++) {
          s -= band[p * width + (p - r)] * band[q * width + (q - r)];
        }
        if (q === p) {
          logDet += Math.log(s);                      // s = R[p][p]^2
          band[p * width] = Math.sqrt(s);
        } else {
          band[p * width + (p - q)] = s / band[q * width];
        }
      }
    }
    return logDet;
  }

  /* log tau(S) the other way, by removing the cells one at a time
     (Gaussian elimination). L is the matrix of a graph with weighted
     edges: row p has the weight of each edge from p (1 at first) and, on
     the diagonal, the sum of those weights, the edge to the dropped cell
     included. Removing the cell in row p leaves the "Schur complement"
     (Horn & Johnson, "Matrix Analysis", 2nd ed., Cambridge 2013, Section
     0.8.5), which is again the matrix of a graph (Kron reduction;
     F. Dorfler & F. Bullo, IEEE Trans. Circuits and Systems I 60 (2013)
     150-163):
       - the determinant is multiplied by d = L[p][p] (so log d is added);
       - each neighbor a of p, joined to it with weight w_a, loses
         w_a^2 / d from its diagonal entry;
       - every two neighbors a, b of p get w_a w_b / d added to the
         weight of the edge joining them (a new edge if there was none).
     Each step removes a cell with the fewest neighbors left (the
     "minimum degree" order, which adds few new edges; A. George &
     J. W. H. Liu, SIAM Review 31 (1989) 1-19). On a tree that is always
     a leaf, which adds no edge at all. Since L is positive definite,
     every d is positive (Golub & Van Loan, Section 4.2), and the logs of
     the d's add up to log det L.
     ("cells" is marked in "member", and cells[m] is the dropped cell.) */
  function logByRemoval(cells, m) {
    // The matrix. Row p is the cell cells[p] (cells[m], the dropped
    // cell, has no row). Row p's neighbors are the rows joined[p][0],
    // joined[p][1], ..., with edge weights weight[p][0], weight[p][1],
    // ...; diagonal[p] = L[p][p].
    for (let p = 0; p <= m; p++) position[cells[p]] = p;
    const diagonal = new Float64Array(m), joined = [], weight = [];
    for (let p = 0; p < m; p++) {
      const v = cells[p];
      joined.push([]);
      weight.push([]);
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] !== memberStamp) continue;
        diagonal[p]++;
        if (position[w] < m) { joined[p].push(position[w]); weight[p].push(1); }
      }
    }

    // The rows waiting to be removed, sorted by how many neighbors they
    // have left: withCount[k] = the rows with k neighbors.
    const withCount = [];
    function file(p) {
      const k = joined[p].length;
      if (!withCount[k]) withCount[k] = new Set();
      withCount[k].add(p);
    }
    for (let p = 0; p < m; p++) file(p);

    let logDet = 0, fewest = 0;
    for (let removed = 0; removed < m; removed++) {
      // A row with the fewest neighbors left. (Removing a row takes one
      // neighbor from each of its neighbors, so the fewest can only go
      // down by one each time.)
      fewest = Math.max(fewest - 1, 0);
      while (!withCount[fewest] || withCount[fewest].size === 0) fewest++;
      const p = withCount[fewest].values().next().value;
      withCount[fewest].delete(p);

      const d = diagonal[p], near = joined[p], nearWeight = weight[p];
      logDet += Math.log(d);
      // Take p out of its neighbors' lists (moving the last one into its spot).
      for (const a of near) {
        withCount[joined[a].length].delete(a);
        const k = joined[a].indexOf(p);
        joined[a][k] = joined[a][joined[a].length - 1]; joined[a].pop();
        weight[a][k] = weight[a][weight[a].length - 1]; weight[a].pop();
      }
      // The new diagonal entries and edge weights.
      for (let s = 0; s < near.length; s++) {
        const a = near[s], wa = nearWeight[s];
        diagonal[a] -= wa * wa / d;
        for (let t = s + 1; t < near.length; t++) {
          const b = near[t], extra = wa * nearWeight[t] / d;
          const k = joined[a].indexOf(b);
          if (k >= 0) {
            weight[a][k] += extra;
            weight[b][joined[b].indexOf(a)] += extra;
          } else {
            joined[a].push(b); weight[a].push(extra);
            joined[b].push(a); weight[b].push(extra);
          }
        }
      }
      for (const a of near) file(a);
    }
    return logDet;
  }

  // Number the cells marked in "member" in breadth-first order from
  // "start": order[0], order[1], ... and position[v] = v's number.
  // Returns how many cells were reached.
  function breadthFirstOrder(start) {
    seenStamp++;
    let head = 0, tail = 0;
    order[tail++] = start;
    seen[start] = seenStamp;
    while (head < tail) {
      const v = order[head++];
      position[v] = head - 1;
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] === memberStamp && seen[w] !== seenStamp) {
          seen[w] = seenStamp;
          order[tail++] = w;
        }
      }
    }
    return tail;
  }

  return { logCount: logCount };
}


/* ---------------------------------------------------------------------
   Distances in a tree
   --------------------------------------------------------------------- */

// How far each cell is, in the tree, from the nearest of the cells
// "sources" (cells in the tree): the number of tree edges on the way.
// The tree is parent (see the top of the file), growing from "root";
// its cells are the root and every cell with a parent. Returns a list
// with the distance of each cell, and -1 for cells not in the tree.
// (A breadth-first search along the tree's edges, both ways: down to
// the children, and up to the parent.)
function treeDistances(n, parent, root, sources) {
  // The children of each cell: children[firstChild[v] ..
  // firstChild[v + 1] - 1] (the CSR way, as for the neighbors).
  const firstChild = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) if (parent[v] !== -1) firstChild[parent[v] + 1]++;
  for (let v = 0; v < n; v++) firstChild[v + 1] += firstChild[v];
  const children = new Int32Array(firstChild[n]), filled = firstChild.slice(0, n);
  for (let v = 0; v < n; v++) if (parent[v] !== -1) children[filled[parent[v]]++] = v;

  const distance = new Int32Array(n).fill(-1), queue = new Int32Array(n);
  let head = 0, tail = 0;
  const reach = function (w, d) {
    if (distance[w] !== -1) return;
    distance[w] = d;
    queue[tail++] = w;
  };
  for (const s of sources) if (s === root || parent[s] !== -1) reach(s, 0);
  while (head < tail) {
    const v = queue[head++], d = distance[v] + 1;
    if (parent[v] !== -1) reach(parent[v], d);
    for (let k = firstChild[v]; k < firstChild[v + 1]; k++) reach(children[k], d);
  }
  return distance;
}

// The path in the tree from cell a to cell b, as a list of cells from a
// to b, or null if either is not in the tree (or they are in different
// trees, with several roots). The way up from a to the root is marked,
// then the way up from b goes until it meets it.
function treePath(parent, a, b) {
  const up = new Map();                        // cell on a's way up -> its place on it
  const fromA = [];
  for (let v = a; v !== -1; v = parent[v]) { up.set(v, fromA.length); fromA.push(v); }
  const fromB = [];
  let v = b;
  while (v !== -1 && !up.has(v)) { fromB.push(v); v = parent[v]; }
  if (v === -1) return null;                   // they never met
  return fromA.slice(0, up.get(v) + 1).concat(fromB.reverse());
}

// The same tree as "parent", with the cell r (in the tree) as its root:
// a new parent list, in which the cells on the way from r up to the old
// root point the other way. Every edge stays; only the direction to the
// root changes. (Wilson's algorithm gives the same uniform tree from any
// root, so a uniform tree moved to a new root is still uniform.)
function rerootTree(parent, r) {
  const moved = parent.slice();
  let child = -1;
  for (let v = r; v !== -1; ) {
    const up = parent[v];
    moved[v] = child;
    child = v;
    v = up;
  }
  return moved;
}
