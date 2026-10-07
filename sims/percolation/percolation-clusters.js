/* =====================================================================
   percolation-clusters.js  —  the math behind the two percolation sims
   (Bernoulli site percolation and Bernoulli bond percolation)
   ---------------------------------------------------------------------
   What it does, in plain words:
     SITE percolation: every cell is OPEN with probability p, and closed
     otherwise, independently. BOND percolation: every edge (each pair of
     neighbors) is open with probability p, independently. A CLUSTER is
     a connected piece of open stuff: open cells joined through open
     neighbors (site), or cells joined through open edges (bond; a cell
     with no open edge is a cluster of one cell).

   One random number per cell (site) or per edge (bond). Each element
   gets its own uniform number U in [0, 1), once, from the seed, and is
   open exactly when U < p. This is the "standard coupling": the same
   numbers serve every p at once, so raising p only ever opens more
   (G. Grimmett, "Percolation", 2nd ed., Springer 1999, Chapter 1).
   That is why the picture morphs smoothly as the p slider moves.

   Finding clusters: "union-find" (B. A. Galler and M. J. Fischer, "An
   improved equivalence algorithm", Comm. ACM 7 (1964) 301-303; with
   path compression and union by size it takes almost constant time per
   step, R. E. Tarjan, J. ACM 22 (1975) 215-225). Every cluster is a
   little tree of its cells, with one cell at the top, its "root";
   joining two clusters hangs the smaller tree under the root of the
   bigger one.

   All p at once: open the elements one at a time, in order of their
   numbers U, joining clusters as you go. After the k-th one opens, the
   picture is exactly the picture at any p between the k-th and the
   (k+1)-th smallest U. So one pass gives the largest cluster and the
   number of clusters for EVERY p, for this sample (M. E. J. Newman and
   R. M. Ziff, "Efficient Monte Carlo algorithm and high-precision
   results for percolation", Phys. Rev. Lett. 85 (2000) 4104-4107).

   Crossing and wrapping. On a box (or a drawn region), a cluster
   CROSSES when it touches both the leftmost and the rightmost column.
   On a torus, a cluster WRAPS when it goes all the way around: each
   cell remembers where it sits relative to its root, measured in the
   plane before the torus is glued; if two cells of the same cluster
   meet across an edge but their positions disagree, the cluster has
   closed a loop around the torus (the method of Newman and Ziff, same
   paper).
   On a ball of a hyperbolic tiling or a tree (ballForPercolation), the
   "left column" is the start cell alone and the "right column" is the
   edge of the ball, so a cluster CROSSES when the start's cluster
   reaches the edge.

   Colors that keep still. Each cluster is named after its OLDEST
   element: the one with the smallest U, the first to open as p grows.
   When two clusters join, the bigger cluster keeps the older name. The
   sim colors each cluster by its name, so as p grows a cluster keeps
   its color, and the clusters it swallows take that color too.

   The file has no drawing and no buttons. The sim pages
   (percolation.js) and the check page (percolation-check.js) use it.

   Contents:
     uniformNumbers(count, seed)   one U per element, from the seed
     edgesOf(d)                    each edge of the domain once
     ballForPercolation(ball)      a ball of a hyperbolic tiling or a
                                   tree, made ready for the rest
     percolate(d, kind, p, U, edges)   the clusters at one p
     sweep(d, kind, U, edges)      the clusters for every p (Newman-Ziff)
     openAt(swept, p)              from a sweep: how many are open at p
   ===================================================================== */


// "count" uniform numbers in [0, 1), the same ones for the same seed
// (from the library seedrandom, https://github.com/davidbau/seedrandom).
function uniformNumbers(count, seed) {
  const random = new Math.seedrandom(String(seed));
  const U = new Float64Array(count);
  for (let k = 0; k < count; k++) U[k] = random();
  return U;
}

// Every edge of domain d once: a[e] and b[e] are its two cells (a < b),
// and (dx[e], dy[e]) the step from a to b in the plane. On a torus an
// edge that crosses the glued side steps the short way round (from the
// last column to the first is a step of +1, not -(width - 1)).
function edgesOf(d) {
  const a = [], b = [], dx = [], dy = [];
  for (let v = 0; v < d.n; v++) {
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (w <= v) continue;              // each edge once, from its smaller end
      const step = stepBetween(d, v, w);
      a.push(v); b.push(w); dx.push(step[0]); dy.push(step[1]);
    }
  }
  return { count: a.length, a: Int32Array.from(a), b: Int32Array.from(b),
           dx: Int32Array.from(dx), dy: Int32Array.from(dy) };
}

// A ball of a hyperbolic tiling or a tree (makeBall, js/sim-hyperbolic.js)
// has no columns. Give it some: x[v] = the number of steps from the
// start (cell 0) to v, found by a breadth-first search, so the start is
// the only cell with x = 0 (the "left column") and the edge of the ball
// is the cells with the most steps (the "right column"). Then a cluster
// "crosses" exactly when the start's cluster reaches the edge. (Every
// cell on a shortest path from the start to v is nearer the start than
// v, so inside the ball, x is the same as in the whole tiling or tree.)
function ballForPercolation(ball) {
  const n = ball.n, x = new Int32Array(n).fill(-1), queue = [0];
  x[0] = 0;
  for (let k = 0; k < queue.length; k++) {
    const v = queue[k];
    for (let e = ball.first[v]; e < ball.first[v + 1]; e++) {
      const w = ball.nbr[e];
      if (x[w] === -1) { x[w] = x[v] + 1; queue.push(w); }
    }
  }
  ball.x = x;
  ball.y = new Int32Array(n);       // all 0: there is only one "row"
  ball.xmin = 0;
  ball.xmax = Math.max(...x);
  ball.wrap = null;
  return ball;
}

// The step from cell v to its neighbor w, the short way round a torus.
function stepBetween(d, v, w) {
  let sx = d.x[w] - d.x[v], sy = d.y[w] - d.y[v];
  if (d.wrap) {
    const width = d.wrap.xmax - d.wrap.xmin + 1, height = d.wrap.ymax - d.wrap.ymin + 1;
    if (sx > width / 2) sx -= width;
    if (sx < -width / 2) sx += width;
    if (sy > height / 2) sy -= height;
    if (sy < -height / 2) sy += height;
  }
  return [sx, sy];
}


/* ---------------------------------------------------------------------
   Union-find, with positions (for wrapping) and names (for colors)
   --------------------------------------------------------------------- */

// A fresh union-find on n cells, each its own cluster. U is the list
// of numbers, used to keep the oldest name.
function newUnionFind(d, U) {
  const n = d.n;
  const uf = {
    parent: new Int32Array(n),     // the cell above v in its tree (itself at the root)
    size: new Int32Array(n).fill(1),   // at a root: the number of cells in the cluster
    offX: new Int32Array(n),       // where v sits minus where its parent sits
    offY: new Int32Array(n),
    name: new Int32Array(n).fill(-1),  // at a root: the cluster's oldest element (-1: none yet)
    left: new Uint8Array(n),       // at a root: the cluster touches the leftmost column
    right: new Uint8Array(n),      //            ... and the rightmost column
    U: U,
    largest: 1,                    // the biggest cluster so far
    crossed: false,                // some cluster crosses (box) or wraps (torus)
    rootX: 0, rootY: 0,            // set by find: where the cell sits minus where its root sits
  };
  for (let v = 0; v < n; v++) {
    uf.parent[v] = v;
    uf.left[v] = d.x[v] === d.xmin ? 1 : 0;
    uf.right[v] = d.x[v] === d.xmax ? 1 : 0;
  }
  return uf;
}

// The root of v's cluster. Also sets uf.rootX, uf.rootY: where v sits
// minus where the root sits. On the way it hangs every cell it passes
// straight under the root ("path compression"), so later finds are
// quick.
function find(uf, v) {
  // Walk up to the root, adding up the offsets.
  let root = v, sx = 0, sy = 0;
  while (uf.parent[root] !== root) { sx += uf.offX[root]; sy += uf.offY[root]; root = uf.parent[root]; }
  // Walk up again, hanging each cell straight under the root.
  let w = v, wx = sx, wy = sy;
  while (uf.parent[w] !== root && w !== root) {
    const up = uf.parent[w], upX = wx - uf.offX[w], upY = wy - uf.offY[w];
    uf.parent[w] = root; uf.offX[w] = wx; uf.offY[w] = wy;
    w = up; wx = upX; wy = upY;
  }
  uf.rootX = sx; uf.rootY = sy;
  return root;
}

// The older of two names (the one with the smaller U); -1 means none.
function olderName(uf, s, t) {
  if (s === -1) return t;
  if (t === -1) return s;
  return uf.U[s] <= uf.U[t] ? s : t;
}

// Join the clusters of a and b, across an edge that steps (sx, sy)
// from a to b. Returns true if they were two clusters before.
function union(uf, a, b, sx, sy) {
  const ra = find(uf, a), ax = uf.rootX, ay = uf.rootY;
  const rb = find(uf, b), bx = uf.rootX, by = uf.rootY;
  if (ra === rb) {
    // Same cluster already. Going a -> b along the edge should land
    // where the tree says b is; if not, the cluster went round the torus.
    if (ax + sx !== bx || ay + sy !== by) uf.crossed = true;
    return false;
  }
  // Hang the smaller tree under the bigger one's root. rb sits at
  // (a's place) + step - (b's offset), relative to ra.
  let top = ra, low = rb, lowX = ax + sx - bx, lowY = ay + sy - by;
  if (uf.size[ra] < uf.size[rb]) { top = rb; low = ra; lowX = -lowX; lowY = -lowY; }
  uf.parent[low] = top; uf.offX[low] = lowX; uf.offY[low] = lowY;
  uf.size[top] += uf.size[low];
  uf.name[top] = olderName(uf, uf.name[top], uf.name[low]);
  uf.left[top] |= uf.left[low];
  uf.right[top] |= uf.right[low];
  if (uf.size[top] > uf.largest) uf.largest = uf.size[top];
  return true;
}

// Off a torus, a cluster crosses when it touches both side columns.
function checkCrossing(uf, d, root) {
  if (!d.wrap && uf.left[root] && uf.right[root]) uf.crossed = true;
}


/* ---------------------------------------------------------------------
   The clusters at one p
   ---------------------------------------------------------------------
   kind is "site" or "bond"; U holds one number per cell (site) or per
   edge (bond, in the order of edgesOf). Returns:
     root[v]      the root of cell v's cluster (-1 for a closed cell)
     size[r]      at a root r: the cluster's number of cells
     name[r]      at a root r: its oldest element (a cell for site, an
                  edge for bond; -1 for a bond cluster of one cell)
     openCount    the number of open cells (site) or open edges (bond)
     clusters     the number of clusters
     largestRoot  the root of the biggest cluster (-1 if none)
     crossed      some cluster crosses (box) or wraps (torus)
   --------------------------------------------------------------------- */
function percolate(d, kind, p, U, edges) {
  const uf = newUnionFind(d, U);
  let openCount = 0;
  if (kind === "site") {
    for (let v = 0; v < d.n; v++) if (U[v] < p) { uf.name[v] = v; openCount++; }
    for (let e = 0; e < edges.count; e++) {
      const a = edges.a[e], b = edges.b[e];
      if (U[a] < p && U[b] < p) union(uf, a, b, edges.dx[e], edges.dy[e]);
    }
  } else {
    for (let e = 0; e < edges.count; e++) {
      if (!(U[e] < p)) continue;
      openCount++;
      union(uf, edges.a[e], edges.b[e], edges.dx[e], edges.dy[e]);
      const r = find(uf, edges.a[e]);
      uf.name[r] = olderName(uf, uf.name[r], e);
    }
  }

  // Every cell's root, the number of clusters and the biggest one.
  const root = new Int32Array(d.n);
  let clusters = 0, largestRoot = -1;
  for (let v = 0; v < d.n; v++) {
    if (kind === "site" && !(U[v] < p)) { root[v] = -1; continue; }
    const r = find(uf, v);
    root[v] = r;
    if (r === v) {
      clusters++;
      checkCrossing(uf, d, r);
      if (largestRoot === -1 || uf.size[r] > uf.size[largestRoot]) largestRoot = r;
    }
  }
  return { root: root, size: uf.size, name: uf.name, openCount: openCount, clusters: clusters,
           largestRoot: largestRoot, crossed: uf.crossed };
}


/* ---------------------------------------------------------------------
   The clusters for every p at once (Newman and Ziff)
   ---------------------------------------------------------------------
   Opens the elements one at a time in order of U. Returns:
     values[k]     the (k+1)-th smallest U: the p at which the (k+1)-th
                   element opens
     largest[k]    the biggest cluster's size once it has opened
     clusters[k]   the number of clusters then
     crossAt       the p at which a cluster first crosses (box) or
                   wraps (torus); null if never
   (For site percolation the clusters count only open cells; for bond,
   every cell is in some cluster, so at p = 0 there are n clusters of
   one cell.)
   --------------------------------------------------------------------- */
function sweep(d, kind, U, edges) {
  const count = U.length;
  const order = Array.from({ length: count }, function (_, k) { return k; });
  order.sort(function (s, t) { return U[s] - U[t]; });
  const uf = newUnionFind(d, U);
  const values = new Float64Array(count), largest = new Int32Array(count), clusterCount = new Int32Array(count);
  let crossAt = null;

  // For site percolation: which cells are open so far.
  const isOpen = new Uint8Array(d.n);
  let clusters = kind === "site" ? 0 : d.n;
  if (kind === "site") uf.largest = 0;

  for (let k = 0; k < count; k++) {
    const element = order[k];
    if (kind === "site") {
      const v = element;
      isOpen[v] = 1;
      uf.name[v] = v;
      clusters++;
      if (uf.largest < 1) uf.largest = 1;
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (!isOpen[w]) continue;
        const step = stepBetween(d, v, w);
        if (union(uf, v, w, step[0], step[1])) clusters--;
      }
      checkCrossing(uf, d, find(uf, v));
    } else {
      const a = edges.a[element], b = edges.b[element];
      if (union(uf, a, b, edges.dx[element], edges.dy[element])) clusters--;
      const r = find(uf, a);
      uf.name[r] = olderName(uf, uf.name[r], element);
      checkCrossing(uf, d, r);
    }
    values[k] = U[element];
    largest[k] = uf.largest;
    clusterCount[k] = clusters;
    if (crossAt === null && uf.crossed) crossAt = U[element];
  }
  return { values: values, largest: largest, clusters: clusterCount, crossAt: crossAt };
}

// From a sweep: how many elements are open at p (the number of U's
// below p), found by halving the sorted list ("binary search").
function openAt(swept, p) {
  let lo = 0, hi = swept.values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (swept.values[mid] < p) lo = mid + 1; else hi = mid;
  }
  return lo;
}
