/* =====================================================================
   sequential-discrete-tiling-packing.js  —  the math behind the
   "Sequential Discrete Tiling" sim
   ---------------------------------------------------------------------
   THE MODEL (nadya's)
     D is a finite set of cells of the square grid Z^2 (a uniform
     polyomino, a box, or a region drawn in the graph tool). Tiles are
     k x k squares of cells. For n = 1, 2, 3, ..., while some cell of D
     is uncovered:
       1. U_n is an uncovered cell, all of them equally likely.
       2. k_n is the largest k such that some k x k square of uncovered
          cells of D contains U_n.
       3. Tile n is one of the k_n x k_n squares of uncovered cells that
          contain U_n, all of them equally likely.
     A 1 x 1 square always fits (U_n itself), so every step places a
     tile, and after at most |D| steps D is covered.

   HOW k_n AND THE SQUARES ARE FOUND (exact)
     A square of uncovered cells that contains U lies in U's row, so k_n
     is at most the length of the run of uncovered cells through U along
     its row, and along its column: call the smaller one K. Every
     candidate square lies in the window of cells at most K - 1 away
     from U in x and in y. In that window, for every cell (a, b),
       L(a, b) = the side of the largest square of uncovered cells with
                 (a, b) as its lowest, leftmost cell
     is 0 on a covered cell (or outside D) and otherwise
       L(a, b) = 1 + min( L(a + 1, b), L(a, b + 1), L(a + 1, b + 1) ),
     the usual rule for the largest square in a grid of 0s and 1s (each
     of the three smaller squares must be free, and together they cover
     the bigger one but for its corner (a, b)), worked out from the top
     right of the window down. (Cells past the window count as covered:
     that can only shorten squares that don't matter, since a square of
     side k <= K that contains U never leaves the window.) The square of
     side k at (a, b) contains U exactly when
       k >= max(Ux - a, Uy - b) + 1,
     and is free exactly when k <= L(a, b). So k_n is the largest L(a, b)
     over the corners (a, b) with a <= Ux, b <= Uy and L(a, b) >= max(Ux
     - a, Uy - b) + 1, and the squares to pick from are the corners with
     L(a, b) >= k_n and max(Ux - a, Uy - b) < k_n. This costs about
     (2K)^2 per tile. The check page compares it with trying every
     square.

   THE BETTI NUMBERS of the covered set, each tile a closed square (so
   two tiles that touch only at a corner are joined there):
     beta_0, its connected pieces: each new tile is joined to the tiles
       around it (the ring of cells just outside it, corners included)
       by "union-find" (R. E. Tarjan, "Efficiency of a good but not
       linear set union algorithm", J. ACM 22 (1975) 215-225), so the
       pieces are the tiles minus the joins that merged two pieces.
     beta_1, its holes: beta_0 - chi, from its Euler characteristic chi
       (squareEuler, js/sim-shape.js, which says why).

   RANDOM NUMBERS
     Tile n draws U_n and its square with its own two numbers, from the
     seed and n (seededUniform, js/sim-worker.js), so the same seed
     gives the same packing, and a cell clicked on the page (the next
     U_n) changes only what comes after it.

   Contents:
     newSquareTiling(options)   a packing of the cells options.x, options.y
     squareTilingWorker()       the second thread the page runs it in
   ===================================================================== */

// A new, empty packing of the cells (options.x[v], options.y[v]), v = 0
// .. n - 1, with random numbers from options.seed. Returns "packing":
//   packing.step(chosen)    place the next tile: U is the cell "chosen"
//                           (a cell number) if it is given and uncovered,
//                           a uniform uncovered cell otherwise; false if
//                           every cell is covered already
//   packing.placed          the number of tiles placed
//   packing.covered         the number of cells covered
//   packing.tileOf[v]       the tile on cell v (-1: none yet)
//   packing.tiles           the tiles: x[t], y[t] (the lowest, leftmost
//                           cell), size[t] and u[t] (its cell U), t from 0
//   packing.numbers()       { pieces, holes, largest } now
//   packing.largestSquares(u)   for an uncovered cell u: { size, corners }
//                           (k_n, and every free square of that size
//                           containing u, as [x, y] of its lowest,
//                           leftmost cell), for the check page
function newSquareTiling(options) {
  const n = options.x.length, random = seededUniform(options.seed);
  const cellX = options.x, cellY = options.y;

  // The grid: the box around the cells. free[spot] is 1 on a cell of D
  // that is not covered yet.
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let v = 0; v < n; v++) {
    xmin = Math.min(xmin, cellX[v]); xmax = Math.max(xmax, cellX[v]);
    ymin = Math.min(ymin, cellY[v]); ymax = Math.max(ymax, cellY[v]);
  }
  const across = xmax - xmin + 1, down = ymax - ymin + 1;
  const cellAt = new Int32Array(across * down).fill(-1), free = new Uint8Array(across * down);
  function spotOf(x, y) { return (y - ymin) * across + (x - xmin); }
  function inBox(x, y) { return x >= xmin && x <= xmax && y >= ymin && y <= ymax; }
  function isFree(x, y) { return inBox(x, y) && free[spotOf(x, y)] === 1; }
  for (let v = 0; v < n; v++) {
    cellAt[spotOf(cellX[v], cellY[v])] = v;
    free[spotOf(cellX[v], cellY[v])] = 1;
  }

  // The uncovered cells, in a list (open[0 .. openCount - 1]) with each
  // one's place in it, so a uniform one is quick to draw and to take out.
  const open = new Int32Array(n), placeOf = new Int32Array(n);
  for (let v = 0; v < n; v++) { open[v] = v; placeOf[v] = v; }
  let openCount = n;
  function takeOut(v) {
    const last = open[--openCount], at = placeOf[v];
    open[at] = last; placeOf[last] = at;
  }

  const packing = {
    placed: 0, covered: 0, tileOf: new Int32Array(n).fill(-1),
    tiles: { x: [], y: [], size: [], u: [] },
    step: step, numbers: numbers, largestSquares: largestSquares,
  };
  const tiles = packing.tiles, tileOf = packing.tileOf;
  const parent = [];             // union-find over the tiles
  let pieces = 0, largest = 0;
  const euler = squareEuler();   // (js/sim-shape.js)
  let sideAt = new Int32Array(0);   // L(a, b) in the window (reused from tile to tile)

  // The run of uncovered cells from (x, y) (not counted) in direction
  // (dx, dy).
  function run(x, y, dx, dy) {
    let k = 0;
    while (isFree(x + (k + 1) * dx, y + (k + 1) * dy)) k++;
    return k;
  }

  // k_n and its squares, for the uncovered cell u (see the top).
  function largestSquares(u) {
    const ux = cellX[u], uy = cellY[u];
    const K = Math.min(1 + run(ux, uy, -1, 0) + run(ux, uy, 1, 0), 1 + run(ux, uy, 0, -1) + run(ux, uy, 0, 1));
    const side = 2 * K - 1, x0 = ux - K + 1, y0 = uy - K + 1;   // the window
    if (sideAt.length < side * side) sideAt = new Int32Array(side * side);
    for (let j = side - 1; j >= 0; j--) {
      for (let i = side - 1; i >= 0; i--) {
        let L = 0;
        if (isFree(x0 + i, y0 + j)) {
          const right = i + 1 < side ? sideAt[j * side + i + 1] : 0;
          const up = j + 1 < side ? sideAt[(j + 1) * side + i] : 0;
          const both = i + 1 < side && j + 1 < side ? sideAt[(j + 1) * side + i + 1] : 0;
          L = 1 + Math.min(right, up, both);
        }
        sideAt[j * side + i] = L;
      }
    }
    // The corners at or below and left of U: (x0 + i, y0 + j), i, j < K,
    // which reach U with a square of side K - min(i, j).
    let size = 0;
    for (let j = 0; j < K; j++) {
      for (let i = 0; i < K; i++) {
        const L = sideAt[j * side + i];
        if (L >= K - Math.min(i, j)) size = Math.max(size, L);
      }
    }
    const corners = [];
    for (let j = 0; j < K; j++) {
      for (let i = 0; i < K; i++) {
        if (sideAt[j * side + i] >= size && K - Math.min(i, j) <= size) corners.push([x0 + i, y0 + j]);
      }
    }
    return { size: size, corners: corners };
  }

  function find(t) {
    while (parent[t] !== t) { parent[t] = parent[parent[t]]; t = parent[t]; }
    return t;
  }

  // Put tile t, of side k with its lowest, leftmost cell at (a, b), on
  // the grid, and join it to the tiles around it.
  function place(t, a, b, k) {
    for (let y = b; y < b + k; y++) {
      for (let x = a; x < a + k; x++) {
        const spot = spotOf(x, y), v = cellAt[spot];
        free[spot] = 0;
        tileOf[v] = t;
        takeOut(v);
        euler.add(x, y);
      }
    }
    packing.covered += k * k;
    parent.push(t);
    pieces++;
    for (let s = -1; s <= k; s++) {   // the ring just outside the tile
      join(t, a + s, b - 1); join(t, a + s, b + k);
      if (s >= 0 && s < k) { join(t, a - 1, b + s); join(t, a + k, b + s); }
    }
  }
  function join(t, x, y) {
    if (!inBox(x, y)) return;
    const v = cellAt[spotOf(x, y)];
    if (v === -1 || tileOf[v] === -1) return;
    const r = find(tileOf[v]), s = find(t);
    if (r !== s) { parent[r] = s; pieces--; }
  }

  function step(chosen) {
    if (openCount === 0) return false;
    const m = packing.placed + 1;   // this tile's number, for its random numbers
    const u = chosen !== undefined && chosen >= 0 && tileOf[chosen] === -1
      ? chosen : open[Math.floor(random.uniform(m, 0) * openCount)];
    const found = largestSquares(u);
    const [a, b] = found.corners[Math.floor(random.uniform(m, 1) * found.corners.length)];
    const t = packing.placed++;
    tiles.x.push(a); tiles.y.push(b); tiles.size.push(found.size); tiles.u.push(u);
    largest = Math.max(largest, found.size);
    place(t, a, b, found.size);
    return true;
  }

  function numbers() {
    return { pieces: pieces, holes: pieces - euler.chi(), largest: largest };
  }

  return packing;
}


/* =====================================================================
   THE SECOND THREAD
   ---------------------------------------------------------------------
   runInWorker (js/sim-page.js) runs this in a second thread, with
   newSquareTiling and its helpers copied in, and serveRun
   (js/sim-worker.js) runs its loop: one step is one tile. The page
   sends, besides Play, Pause and Step:
     setup   a new packing: the cells x, y and the seed
     click   place the next tile with U = the cell clicked (if it is
             uncovered)
   It answers with the tile on each cell, each tile's size, the last
   tile and its U, the numbers now, and the run so far for the charts
   (pieces, holes, share covered, size of each tile).
   ===================================================================== */
function squareTilingWorker() {
  let packing = null, trace = null;

  function takeSample(now) {
    keepSample(trace, packing.placed, function () {
      const s = packing.numbers();
      return { pieces: s.pieces, holes: s.holes, covered: 100 * packing.covered / packing.tileOf.length };
    }, now);
  }

  function setup(m) {
    packing = newSquareTiling(m);
    trace = newTrace();
    takeSample(true);
  }

  function place(chosen) {
    if (!packing.step(chosen)) return false;
    takeSample(packing.covered === packing.tileOf.length);
    return true;
  }

  function report(send) {
    const tiles = packing.tiles, last = packing.placed - 1;
    const tileOf = Int32Array.from(packing.tileOf), sizes = Int32Array.from(tiles.size);
    send(Object.assign({
      placed: packing.placed, covered: packing.covered, tileOf: tileOf, sizes: sizes,
      last: last < 0 ? null : { x: tiles.x[last], y: tiles.y[last], size: tiles.size[last], u: tiles.u[last] },
      traceTimes: Float64Array.from(trace.times), tracePieces: Float64Array.from(trace.lists.pieces),
      traceHoles: Float64Array.from(trace.lists.holes), traceCovered: Float64Array.from(trace.lists.covered),
    }, packing.numbers()), [tileOf.buffer, sizes.buffer]);
  }

  serveRun({
    setup: setup, steps: function () { return place(); }, report: report,
    isDone: function () { return packing === null || packing.covered === packing.tileOf.length; },
    messages: { click: function (m) { place(m.cell); } },
  });
}
