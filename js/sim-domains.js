/* =====================================================================
   sim-domains.js  —  the domains the sims live on
   ---------------------------------------------------------------------
   Every sim that lives on cells (a box, a torus, or a region drawn in
   the graph tool) turns its domain into the same kind of object, built
   here, so the code is written in one place only. A sim page loads this
   file before its own code.

   A domain is an object with:
     n          number of cells, numbered 0 .. n-1
     x[v], y[v] where cell v is (cell (x, y) is centered at (x, y), as in
                the graph tool)
     first, nbr the neighbors of v are nbr[first[v]] .. nbr[first[v+1] - 1]
                (one long list, cut into pieces by "first"; the usual
                compact way to store a graph, called CSR)
     wrap       for a torus, the x and y range that wraps around; else null
     xmin .. ymax, cellAt   the smallest box around the cells, and which
                cell sits at each place in it (-1 = none), for drawing
     ids[v]     for a drawn domain, the graph tool's name "x,y" of cell v
     lattice    "tiling" for a tiling's cells (then also tiling, part,
                index and sides, and for a box onLeft and onRight: see
                tilingBox); left out for squares

   OTHER LATTICES (at the end of this file). Besides squares, a
   domain's cells can be the tiles, or the corners, of any tiling by
   regular polygons, triangles and hexagons among them (js/sim-tilings.js
   reads it from its code), or of a Penrose tiling (js/sim-penrose.js):
   then (x, y) is the block of the tiling the cell is in, as the last
   part of this file explains. cornersOf gives a cell's corners, and
   cellAtPoint the cell at a point of the picture.

   Contents:
     wrap(v, lo, hi)          wrap a whole number around, for tori
     wrapNumber(v, size)      the same for any number
     least(list), most(list)  the smallest and biggest number of a list
     boxAround(x, y, spare, which)   the box around some points
     boxDomain(...)           a box or torus of cells
     aztecDiamond(N)          the Aztec diamond of order N
     drawnDomain(...)         a region drawn in the graph tool
     makeDomain(...)          a domain from its cells and edges (every
                              domain is built by it)
     neighborLists(n, edges)  its neighbor lists, as first and nbr
     cellAt(d, x, y)          which cell is at (x, y)
     searchFrom(d, starts)    a search from some cells: how far each
                              cell is from the nearest, and which it is
     stepsFrom(d, starts)     ... just how far
     farthestFrom(d, starts)  the cell farthest from some cells
     spreadOut(d, count, first)   cells spread out over the domain
     countPieces(d, colorOf, count)   the connected pieces of each color
     findRegions(d, colors)   the same pieces, each with its area and perimeter
     regionOf(d, colors, s)   the piece holding cell s (to highlight it)
     spreadRegion(...)        the search that finds a piece (both use it)
   Where the cells are in the picture:
     cellMiddle(d, v)         the middle of a cell
     cellMiddles(d)           ... every cell's middle, as a list
     cellRadius(d, v)         how far a cell's middle is from its sides
     sideDistance(p, corners) how far a point is from a polygon's nearest side
     cellSpots(d)             where the cells are, in whole numbers (for starts)
     pictureBox(d)            the box around the domain's picture
     torusSteps(d)            the steps by which a torus's picture repeats
     cellAtPoint(d, u, w)     which cell is at the point (u, w)
     cellNearestPoint(d, u, w)   the cell whose middle is nearest (u, w)
   Tilings:
     tilingBox(...)           a box or torus of a tiling's cells
     tilingHexagon(...)       a hexagon of a tiling's cells (of triangles:
                              the hexagon of the lozenge tilings)
     cellNeighbors(cell)      a tiling cell's neighbors, each once
     blockStart(tiling, I, J) where block (I, J) of a tiling starts
     middleAt(tiling, I, J, k)    the middle of cell k of that block ...
     cornersAt(tiling, I, J, k)   ... and its corners
     cornersOf(d, v)          the corners of a domain's cell
     tilingCell(d, I, J, k)   cell k of block (I, J)
     blocksNear(d, u, w, reach)   the blocks near a point
     pointInPolygon(corners, u, w)   is a point inside a cell?
     signedArea(corners)      a polygon's area (less than 0 if its
                              corners go clockwise)
     tilingCells(...)         some cells of a tiling, to draw (a growing set)
     widestCell(tiling)       the farthest a cell's corner is from its middle
   3D tilings (js/sim-honeycombs.js):
     honeycombBox(...)        a box or torus of a 3D tiling's cells
     honeycombCell(d, I, J, K, k)   cell k of block (I, J, K)

   (The colors the sims share are in js/sim-colors.js.)
   ===================================================================== */


// Wrap a number into lo..hi, for tori. E.g. lo = 0, hi = 9: 10 -> 0, -1 -> 9.
function wrap(v, lo, hi) {
  const n = hi - lo + 1;
  return lo + (((v - lo) % n) + n) % n;
}

// Wrap a number into 0 .. size (not including size). Like wrap(), but
// for any number, not just whole ones. E.g. size = 10: 12.5 -> 2.5.
function wrapNumber(v, size) { return ((v % size) + size) % size; }

// The smallest and the biggest number of a list (Infinity and -Infinity
// for an empty one). Not Math.min(...list): handing a function more than
// about 100,000 numbers at once overflows the browser's stack.
function least(list) { return list.reduce(function (a, b) { return Math.min(a, b); }, Infinity); }
function most(list) { return list.reduce(function (a, b) { return Math.max(a, b); }, -Infinity); }

// The smallest box { xmin, xmax, ymin, ymax } around the points
// (x[i], y[i]), with "spare" more all round: for each i in the list
// "which", or, if it is left out, for every i.
function boxAround(x, y, spare, which) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const count = which ? which.length : x.length;
  for (let k = 0; k < count; k++) {
    const i = which ? which[k] : k;
    xmin = Math.min(xmin, x[i]); xmax = Math.max(xmax, x[i]);
    ymin = Math.min(ymin, y[i]); ymax = Math.max(ymax, y[i]);
  }
  return { xmin: xmin - spare, xmax: xmax + spare, ymin: ymin - spare, ymax: ymax + spare };
}

// A width x height box of cells, with 4 neighbors (sharing a side) or 8
// (sides or corners: only Cellular Automata's cluster counts use 8; the
// sims' domains are always 4). If "torus" is true, the right edge is
// glued to the left and the top to the bottom. The cells are (x, y) for
// x from 0 to width - 1 and y from 0 to height - 1, or with "centered",
// shifted so cell (0, 0) is in the middle (First Passage Percolation's
// whole plane, a box that grows around it).
function boxDomain(width, height, neighbors, torus, centered) {
  const xs = [], ys = [], edges = [];
  const dx = centered ? Math.floor(width / 2) : 0, dy = centered ? Math.floor(height / 2) : 0;
  // As in the graph tool: each cell looks right and up (and, with 8
  // neighbors, diagonally), wrapping around on a torus.
  const steps = neighbors === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      xs.push(x - dx);
      ys.push(y - dy);
      for (const [sx, sy] of steps) {
        let nx = x + sx, ny = y + sy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          if (!torus) continue;
          nx = wrap(nx, 0, width - 1);
          ny = wrap(ny, 0, height - 1);
        }
        edges.push([y * width + x, ny * width + nx]);
      }
    }
  }
  const wrapRange = torus ? { xmin: -dx, xmax: width - 1 - dx, ymin: -dy, ymax: height - 1 - dy } : null;
  return makeDomain(xs, ys, edges, wrapRange, null);
}

// The Aztec diamond of order N: the cells (x, y), x and y from -N to N-1,
// whose centers (x + 1/2, y + 1/2) satisfy |x + 1/2| + |y + 1/2| <= N.
// Its rows have 2, 4, ..., 2N, 2N, ..., 4, 2 cells, 2N(N + 1) in all.
// Each cell's neighbors are the 4 cells next to it.
function aztecDiamond(N) {
  const xs = [], ys = [], edges = [], index = new Map();
  for (let y = -N; y < N; y++) {
    for (let x = -N; x < N; x++) {
      if (Math.abs(x + 0.5) + Math.abs(y + 0.5) <= N) { index.set(x + "," + y, xs.length); xs.push(x); ys.push(y); }
    }
  }
  for (let v = 0; v < xs.length; v++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const w = index.get((xs[v] + dx) + "," + (ys[v] + dy));
      if (w !== undefined) edges.push([v, w]);
    }
  }
  return makeDomain(xs, ys, edges, null, null);
}

// A domain drawn in the graph tool. "graph" is the tool's getGraph():
// { vertices: [{id, x, y, color}, ...], edges: [[id, id], ...] }, and
// "toolGrid" its grid settings (for the torus).
function drawnDomain(graph, toolGrid) {
  const index = new Map();
  graph.vertices.forEach(function (v, k) { index.set(v.id, k); });
  const edges = graph.edges.map(function (e) { return [index.get(e[0]), index.get(e[1])]; });
  const wrapRange = toolGrid.torus
    ? { xmin: toolGrid.xmin, xmax: toolGrid.xmax, ymin: toolGrid.ymin, ymax: toolGrid.ymax }
    : null;
  const d = makeDomain(graph.vertices.map(function (v) { return v.x; }),
                       graph.vertices.map(function (v) { return v.y; }),
                       edges, wrapRange, graph.vertices.map(function (v) { return v.id; }));
  return d;
}

// Build the domain object described at the top of this file, from the
// cells' coordinates (xs, ys) and the edges as pairs of cell numbers.
function makeDomain(xs, ys, edges, wrapRange, ids) {
  const n = xs.length, { first, nbr } = neighborLists(n, edges);
  const d = {
    n: n, x: Int32Array.from(xs), y: Int32Array.from(ys),
    first: first, nbr: nbr, wrap: wrapRange, ids: ids,
    xmin: least(xs), xmax: most(xs), ymin: least(ys), ymax: most(ys),
  };
  const boxWidth = d.xmax - d.xmin + 1;
  d.cellAt = new Int32Array(boxWidth * (d.ymax - d.ymin + 1)).fill(-1);
  for (let v = 0; v < n; v++) d.cellAt[(d.y[v] - d.ymin) * boxWidth + (d.x[v] - d.xmin)] = v;
  return d;
}

// The neighbor lists of n cells joined by "edges" ([a, b] pairs), each
// edge both ways, in the form every domain keeps them: cell v's
// neighbors are nbr[first[v]] .. nbr[first[v + 1] - 1]. A Set drops
// repeats (a torus 2 wide meets the same neighbor on both sides), and a
// cell is never its own neighbor.
function neighborLists(n, edges) {
  const lists = [];
  for (let v = 0; v < n; v++) lists.push(new Set());
  for (const [a, b] of edges) {
    if (a === b) continue;
    lists[a].add(b);
    lists[b].add(a);
  }
  const first = new Int32Array(n + 1), all = [];
  for (let v = 0; v < n; v++) {
    first[v] = all.length;
    for (const w of lists[v]) all.push(w);
  }
  first[n] = all.length;
  return { first: first, nbr: Int32Array.from(all) };
}

// Which cell of domain d is at (x, y)? -1 if none. On a torus, (x, y)
// is first wrapped back into the grid. (A picture whose cells live
// somewhere else can give its own d.lookup(x, y) instead: Random Walk
// keeps its visited sites in a grid that grows as the walk spreads.)
function cellAt(d, x, y) {
  if (d.lookup) return d.lookup(x, y);
  if (d.wrap) {
    x = wrap(x, d.wrap.xmin, d.wrap.xmax);
    y = wrap(y, d.wrap.ymin, d.wrap.ymax);
  }
  if (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax) return -1;
  return d.cellAt[(y - d.ymin) * (d.xmax - d.xmin + 1) + (x - d.xmin)];
}

// A breadth-first search through domain d from the cells "starts" all
// at once. For each cell v: steps[v], the number of steps from the
// nearest start, and from[v], which start that is (its place in
// "starts"; of two as near, the one the search reached v from first).
// Both are -1 for cells no start can reach.
function searchFrom(d, starts) {
  const steps = new Int32Array(d.n).fill(-1), from = new Int32Array(d.n).fill(-1);
  const queue = starts.slice();
  starts.forEach(function (s, k) { steps[s] = 0; from[s] = k; });
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (steps[w] === -1) { steps[w] = steps[v] + 1; from[w] = from[v]; queue.push(w); }
    }
  }
  return { steps: steps, from: from };
}

// The number of steps from the nearest of the cells "starts" to every
// cell (-1 for cells that can't be reached).
function stepsFrom(d, starts) { return searchFrom(d, starts).steps; }

// The cell farthest (in steps) from the nearest of the cells "starts"
// (of several as far, the one with the smallest number).
function farthestFrom(d, starts) {
  const steps = stepsFrom(d, starts);
  let far = 0;
  for (let v = 1; v < d.n; v++) if (steps[v] > steps[far]) far = v;
  return far;
}

// "count" cells spread out over domain d: "first", then each time the
// cell farthest from all those picked so far.
function spreadOut(d, count, first) {
  const picked = [first];
  while (picked.length < count) picked.push(farthestFrom(d, picked));
  return picked;
}

// How many connected pieces each color has: pieces[c] for the colors
// c = 0 .. count-1, where colorOf[v] is cell v's color (the regions of
// findRegions, below, counted by color). Their sum is the number of
// pieces of one color in all; with every cell color 0, pieces[0] is the
// number of pieces of the domain.
function countPieces(d, colorOf, count) {
  const pieces = new Array(count).fill(0);
  for (const c of findRegions(d, colorOf).color) pieces[c]++;
  return pieces;
}

// The regions of a coloring: a region is a connected piece of one
// color, found by a search from each cell through its neighbors of the
// same color (spreadRegion, below). colors[v] is cell v's color, or -1
// for a cell with no color yet (it is in no region). For each region r:
//   areas[r]       its number of cells
//   perimeters[r]  the number of edges from it to a cell of another
//                  color (cells with no color don't count), so the
//                  perimeters of all regions add up to twice the
//                  interface (the edges between two colors)
//   color[r]       its color
function findRegions(d, colors) {
  const seen = new Uint8Array(d.n);    // 1 once a cell's region is found
  const areas = [], perimeters = [], regionColor = [];
  for (let s = 0; s < d.n; s++) {
    if (colors[s] === -1 || seen[s]) continue;
    const cells = spreadRegion(d, colors, s, seen);
    let perimeter = 0;
    for (const v of cells) {
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const c = colors[d.nbr[e]];
        if (c !== colors[s] && c !== -1) perimeter++;
      }
    }
    areas.push(cells.length);
    perimeters.push(perimeter);
    regionColor.push(colors[s]);
  }
  return { areas: areas, perimeters: perimeters, color: regionColor };
}

// The region of cell s (it must have a color): every cell joined to s
// through neighbors of its color, as a list of 1s and 0s, one per cell
// (1 = in the region). The sims highlight a clicked cell's region with
// it (js/sim-highlight.js).
function regionOf(d, colors, s) {
  const inside = new Uint8Array(d.n);
  spreadRegion(d, colors, s, inside);
  return inside;
}

// The search behind findRegions and regionOf: start at cell s and go
// from each cell found to its neighbors of the same color, until there
// are no more. Marks each cell found in "seen" (one number per cell,
// set to 1), skips cells already marked, and returns the cells found.
function spreadRegion(d, colors, s, seen) {
  const cells = [s], color = colors[s];
  seen[s] = 1;
  for (let k = 0; k < cells.length; k++) {
    const v = cells[k];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (colors[w] === color && !seen[w]) { seen[w] = 1; cells.push(w); }
    }
  }
  return cells;
}


/* ---------------------------------------------------------------------
   Where the cells are in the picture
   ---------------------------------------------------------------------
   Square cell (x, y) is the square of side 1 around the point (x, y);
   a tiling's cells are its polygons (the last part of this file).
   --------------------------------------------------------------------- */

// The middle of cell v of domain d, in the picture. (For the corners
// of a tiling, the corner itself.)
function cellMiddle(d, v) {
  if (!d.lattice) return [d.x[v], d.y[v]];
  return middleAt(d.tiling, d.x[v], d.y[v], d.part[v]);
}

// The middle of every cell of domain d (cellMiddle), as a list, worked
// out once per domain and kept.
function cellMiddles(d) {
  if (d.middles) return d.middles;
  d.middles = [];
  for (let v = 0; v < d.n; v++) d.middles.push(cellMiddle(d, v));
  return d.middles;
}

// How far the middle of cell v of domain d is from the nearest of its
// sides: the radius of the biggest circle around the middle that fits
// in the cell (1/2 for a square). A number written on a cell, or a coin
// standing on it in 3D, is sized by it. On a tiling it is worked out
// once for each cell of the repeating block, and kept.
function cellRadius(d, v) {
  if (!d.lattice) return 0.5;
  if (!d.radii) d.radii = d.tiling.cells.map(function (cell) { return sideDistance(cell.middle, cell.corners); });
  return d.radii[d.part[v]];
}

// How far the point p is from the nearest side of the polygon with
// these corners (from the cross product: twice the area of the
// triangle p makes with a side, over the side's length).
function sideDistance(p, corners) {
  let nearest = Infinity;
  corners.forEach(function (a, k) {
    const b = corners[(k + 1) % corners.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    nearest = Math.min(nearest, Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1]));
  });
  return nearest;
}

// Where the cells of domain d are, in whole numbers, for the starts
// that cut a domain into stripes or rectangles: { x, y, xmin, xmax,
// ymin, ymax }, as a domain has them. On the square grid they are the
// domain's own; on any other tiling, the middle of each cell rounded
// down to whole side lengths (so small cells can share a spot, and big
// ones leave spots empty). Worked out once per domain, and kept.
function cellSpots(d) {
  if (!d.lattice) return d;
  if (d.spots) return d.spots;
  const x = new Int32Array(d.n), y = new Int32Array(d.n);
  for (let v = 0; v < d.n; v++) {
    const [u, w] = cellMiddle(d, v);
    x[v] = Math.floor(u); y[v] = Math.floor(w);
  }
  d.spots = { x: x, y: y, xmin: least(x), xmax: most(x), ymin: least(y), ymax: most(y) };
  return d.spots;
}

// The box around domain d's picture: { left, right, bottom, top }. On a
// torus it is one copy of the torus, which repeats every (right - left)
// across and (top - bottom) up. Square cells are the squares of side 1
// around (x, y). A page whose picture shows only part of a domain (the
// whole plane, a box that grows to stay ahead of what is shown: First
// Passage Percolation) sets d.shown to that part's box (for squares,
// along their sides), and then that is the picture's box.
function pictureBox(d) {
  if (d.shown) return d.shown;
  if (!d.lattice) return { left: d.xmin - 0.5, right: d.xmax + 0.5, bottom: d.ymin - 0.5, top: d.ymax + 0.5 };
  if (d.pictureBox) return d.pictureBox;
  if (d.wrap) {
    // One copy of the torus: its blocks across and up (for a tiling
    // whose blocks are slanted, the copies above are shifted sideways:
    // torusSteps).
    const [across, up] = torusSteps(d);
    d.pictureBox = { left: 0, right: across[0], bottom: 0, top: up[1] };
    return d.pictureBox;
  }
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (let v = 0; v < d.n; v++) {
    for (const [u, w] of cornersOf(d, v)) {
      left = Math.min(left, u); right = Math.max(right, u);
      bottom = Math.min(bottom, w); top = Math.max(top, w);
    }
  }
  d.pictureBox = { left: left, right: right, bottom: bottom, top: top };
  return d.pictureBox;
}

// The two steps by which the picture of a torus repeats: across, and up
// (up is slanted for a tiling with slanted blocks).
function torusSteps(d) {
  if (d.lattice) return [blockStart(d.tiling, d.wrap.xmax + 1, 0), blockStart(d.tiling, 0, d.wrap.ymax + 1)];
  const box = pictureBox(d);
  return [[box.right - box.left, 0], [0, box.top - box.bottom]];
}

// Which cell of domain d has the point (u, w) of the picture in it, or
// -1 if none: for squares, the nearest grid point; on a tiling, the
// cell whose corners go around it (tilingCellAt).
function cellAtPoint(d, u, w) {
  return d.lattice ? tilingCellAt(d, u, w) : cellAt(d, Math.round(u), Math.round(w));
}

// The cell of domain d whose middle (cellMiddle) is nearest the point
// (u, w) of the picture: the first of them, if several are as near.
function cellNearestPoint(d, u, w) {
  let best = 0, bestFar = Infinity;
  for (let v = 0; v < d.n; v++) {
    const [x, y] = cellMiddle(d, v), far = Math.hypot(x - u, y - w);
    if (far < bestFar) { best = v; bestFar = far; }
  }
  return best;
}


/* ---------------------------------------------------------------------
   Tilings: any tiling by regular polygons (js/sim-tilings.js)
   ---------------------------------------------------------------------
   The tiling comes as its block from uprightBlock (js/sim-tilings.js):
   blocks sit at I a + J b for whole numbers I, J, and each has the same
   cells, cell k of block (I, J) being d.part[v] = k with d.x[v] = I and
   d.y[v] = J. Then a torus wraps I and J around, just as x and y wrap
   on a torus of squares. A Penrose tiling (js/sim-penrose.js) never
   repeats: it is one block ("finite"), a patch that grows to fit the
   box, and every cell is in block (0, 0).
   --------------------------------------------------------------------- */

// A box or torus of a tiling's cells. A box is the cells whose middles
// are in the rectangle 0 <= u < width, 0 <= w < height (in side
// lengths), or, for a tiling that never repeats (js/sim-penrose.js) and
// with "centered", the same rectangle centered on the tiling's middle
// (0, 0). A torus is a
// whole number of blocks each way, as near width x height as it can be,
// but at least enough that a cell's neighbors are all different cells.
// Besides the usual (section 1), the domain has
//   tiling, part, index   the block, cell v being cell part[v] of block
//                         (x[v], y[v]), and index "I,J,k" -> v
//   sides[v][e]           the cell across side e of cell v (-1: none)
//   onLeft, onRight       for a box, 1 for the cells on its left (right)
//                         edge: those with a missing neighbor whose
//                         middle is left of the box (right of it), as
//                         the left column is for squares
// (cellAt isn't used: a block has several cells.)
function tilingBox(tiling, width, height, torus, centered) {
  if (torus && !tiling.finite) return tilingTorus(tiling, width, height);
  const box = tiling.finite || centered ? { left: -width / 2, bottom: -height / 2, width: width, height: height }
                            : { left: 0, bottom: 0, width: width, height: height };
  return makeTilingDomain(tiling, cellsInBox(tiling, box, null), null, box);
}

// The torus of tilingBox: "across" blocks by "up" blocks.
function tilingTorus(tiling, width, height) {
  let reach = 1;    // the farthest block a neighbor is in
  for (const cell of tiling.cells) for (const [, I, J] of cell.next) reach = Math.max(reach, Math.abs(I), Math.abs(J));
  const across = Math.max(2 * reach + 1, Math.round(width / tiling.a[0]));
  const up = Math.max(2 * reach + 1, Math.round(height / tiling.b[1]));
  const cells = [];
  for (let J = 0; J < up; J++) for (let I = 0; I < across; I++) tiling.cells.forEach(function (cell, k) { cells.push([I, J, k]); });
  return makeTilingDomain(tiling, cells, { xmin: 0, xmax: across - 1, ymin: 0, ymax: up - 1 }, null);
}

// The regular hexagon of side N on a tiling (in side lengths), lying
// flat, with its middle on a corner of the tiling (the first corner of
// the block's first cell): the cells whose middles are inside it, as a
// domain like tilingBox's (with no onLeft or onRight). On the triangle
// tiling its sides run along the triangles' sides, so it is cut into
// 6 N^2 whole triangles, and its tilings by rhombi (two triangles side
// by side) are the "lozenge tilings" of a hexagon.
function tilingHexagon(tiling, N) {
  const [cu, cw] = tiling.cells[0].corners[0], h = Math.sqrt(3) / 2;
  // Its corners are (N, 0), (N/2, N h), (-N/2, N h), (-N, 0), ... from
  // the middle; the slanted sides are on the lines sqrt(3) |u| + |w| = sqrt(3) N.
  const inside = function (u, w) {
    return Math.abs(w - cw) < N * h && Math.sqrt(3) * Math.abs(u - cu) + Math.abs(w - cw) < Math.sqrt(3) * N;
  };
  const box = { left: cu - N, bottom: cw - N * h, width: 2 * N, height: 2 * N * h };
  return makeTilingDomain(tiling, cellsInBox(tiling, box, inside), null, null);
}

// The cells [I, J, k] (cell k of block (I, J)) of a tiling whose
// middles (u, w) are in the rectangle "box" ({ left, bottom, width,
// height }) and, if "inside" isn't null, have inside(u, w) true too. A
// tiling that never repeats first grows to reach 2 past the box (a
// cell's neighbors' middles are less than 2 from its own), so that the
// cells just outside the box are known too; then its cells are put in
// order row by row, by their middles: the block's numbers depend on
// how it grew, and the box should be the same whichever way it did.
function cellsInBox(tiling, box, inside) {
  const right = box.left + box.width, top = box.bottom + box.height, cells = [];
  const keep = function (u, w) {
    return u >= box.left && u < right && w >= box.bottom && w < top && (!inside || inside(u, w));
  };
  if (tiling.finite) {
    growPenrose(tiling, Math.max(-box.left, right) + 2, Math.max(-box.bottom, top) + 2);
    tiling.cells.forEach(function (cell, k) { if (keep(cell.middle[0], cell.middle[1])) cells.push([0, 0, k]); });
    const middle = function (c) { return tiling.cells[c[2]].middle; };
    return cells.sort(function (c, d) { return middle(c)[1] - middle(d)[1] || middle(c)[0] - middle(d)[0]; });
  }
  const [A, bx, B] = [tiling.a[0], tiling.b[0], tiling.b[1]];
  for (let J = Math.floor(box.bottom / B) - 1; J * B < top + B; J++) {
    for (let I = Math.floor((box.left - J * bx) / A) - 2; I * A + J * bx < right + A; I++) {
      for (let k = 0; k < tiling.cells.length; k++) if (keep(...middleAt(tiling, I, J, k))) cells.push([I, J, k]);
    }
  }
  return cells;
}

// The domain of the tiling's cells listed ([I, J, k] for cell v = 0, 1,
// ...), as tilingBox describes it: each cell joined to the cell across
// each side. "wrapRange" is the torus's (or null), and "box" the
// rectangle the cells were picked from, for onLeft and onRight (or
// null: then the domain has neither).
function makeTilingDomain(tiling, cells, wrapRange, box) {
  const index = new Map();
  cells.forEach(function ([I, J, k], v) { index.set(I + "," + J + "," + k, v); });
  const edges = [], sides = [];
  const onLeft = new Uint8Array(cells.length), onRight = new Uint8Array(cells.length);
  cells.forEach(function ([I, J, k], v) {
    sides.push(tiling.cells[k].next.map(function ([k2, dI, dJ]) {
      let I2 = I + dI, J2 = J + dJ;
      if (wrapRange) { I2 = wrap(I2, 0, wrapRange.xmax); J2 = wrap(J2, 0, wrapRange.ymax); }
      const w = index.has(I2 + "," + J2 + "," + k2) ? index.get(I2 + "," + J2 + "," + k2) : -1;
      if (w > v) edges.push([v, w]);
      if (box && w === -1 && k2 >= 0) {   // the neighbor is outside the box: is it off the left or right side?
        const u = middleAt(tiling, I2, J2, k2)[0];
        if (u < box.left) onLeft[v] = 1;
        if (u >= box.left + box.width) onRight[v] = 1;
      }
      return w;
    }));
  });
  const d = makeDomain(cells.map(function (c) { return c[0]; }), cells.map(function (c) { return c[1]; }),
                       edges, wrapRange, null);
  d.lattice = "tiling";
  d.tiling = tiling;
  d.part = Int32Array.from(cells.map(function (c) { return c[2]; }));
  d.index = index;
  d.sides = sides;
  if (box) { d.onLeft = onLeft; d.onRight = onRight; }
  return d;
}

// The cells across a tiling cell's sides ("next"), each once, as
// [k, dx, dy]. Two cells share at most one side, except in Penrose's
// P1, where a pentagon in the notch of a star or a boat shares two
// sides with it: the corner between those touches no other tile, so
// the two cells really meet along one bent side.
function cellNeighbors(cell) {
  const seen = new Set();
  return cell.next.filter(function ([k, dx, dy]) {
    const key = k + "," + dx + "," + dy;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Where block (I, J) of a tiling starts, in the picture: I a + J b.
function blockStart(tiling, I, J) {
  return [I * tiling.a[0] + J * tiling.b[0], I * tiling.a[1] + J * tiling.b[1]];
}

// The middle of cell k of block (I, J) of a tiling, in the picture: the
// cell's middle in the block, moved to where the block starts.
function middleAt(tiling, I, J, k) {
  const [u, w] = blockStart(tiling, I, J), middle = tiling.cells[k].middle;
  return [middle[0] + u, middle[1] + w];
}

// The corners of cell k of block (I, J) of a tiling, in the picture.
function cornersAt(tiling, I, J, k) {
  const [u, w] = blockStart(tiling, I, J);
  return tiling.cells[k].corners.map(function (c) { return [c[0] + u, c[1] + w]; });
}

// The corners of cell v of domain d, in the picture (of a square, its 4
// corners, from the lower left going counterclockwise).
function cornersOf(d, v) {
  if (!d.lattice) {
    const x = d.x[v], y = d.y[v];
    return [[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]];
  }
  return cornersAt(d.tiling, d.x[v], d.y[v], d.part[v]);
}

// Cell k of block (I, J) of a tiling domain (wrapped around on a
// torus), or -1 if the domain doesn't have it.
function tilingCell(d, I, J, k) {
  if (d.wrap) { I = wrap(I, 0, d.wrap.xmax); J = wrap(J, 0, d.wrap.ymax); }
  const v = d.index.get(I + "," + J + "," + k);
  return v === undefined ? -1 : v;
}

// The blocks of a tiling domain that can have a cell whose middle is
// at most "reach" from the point (u, w) each way, as [I, J], row by row
// from the bottom. The cells of block (I, J) have their middles at
// (I + s) a + (J + t) b, for s and t from 0 to 1 (and one more block
// below and to the left takes in the middles right on a block's
// edge). On a torus the blocks aren't wrapped around, so a block can
// come twice, once for each copy of it near the point. Only for a
// tiling that repeats.
function blocksNear(d, u, w, reach) {
  const t = d.tiling, [A, bx, B] = [t.a[0], t.b[0], t.b[1]], blocks = [];
  for (let J = Math.floor((w - reach) / B) - 1; J <= Math.floor((w + reach) / B); J++) {
    // Along row J, (J + t) b is from J bx to (J + 1) bx across.
    const lo = u - reach - Math.max(J * bx, (J + 1) * bx), hi = u + reach - Math.min(J * bx, (J + 1) * bx);
    for (let I = Math.floor(lo / A) - 1; I <= Math.floor(hi / A); I++) blocks.push([I, J]);
  }
  return blocks;
}

// The cell of a tiling domain at the point (u, w), or -1 if none: the
// cells of the blocks near the point are tried (a cell's corners are
// at most widestCell from its middle), and the one whose corners go
// around it wins. A tiling that never repeats has one block, and only
// the cells near the point are tried.
function tilingCellAt(d, u, w) {
  const t = d.tiling;
  if (t.finite) {
    const k = cellsNear(t, u, w).find(function (k) { return pointInPolygon(t.cells[k].corners, u, w); });
    return k === undefined ? -1 : tilingCell(d, 0, 0, k);
  }
  for (const [I, J] of blocksNear(d, u, w, widestCell(t))) {
    for (let k = 0; k < t.cells.length; k++) {
      if (pointInPolygon(cornersAt(t, I, J, k), u, w)) return tilingCell(d, I, J, k);
    }
  }
  return -1;
}

// The cells of a tiling that never repeats whose middles are within 2
// of the point (u, w) each way, so every cell with the point in it (a
// cell's corners are less than 2 from its middle). The cells are put
// in unit squares by their middles once, and again when the tiling
// grows.
function cellsNear(t, u, w) {
  if (!t.squares || t.squares.count !== t.cells.length) {
    const squares = new Map();
    t.cells.forEach(function (cell, k) {
      const key = Math.floor(cell.middle[0]) + "," + Math.floor(cell.middle[1]);
      if (squares.has(key)) squares.get(key).push(k); else squares.set(key, [k]);
    });
    t.squares = { count: t.cells.length, map: squares };
  }
  const near = [];
  for (let i = Math.floor(u) - 2; i <= Math.floor(u) + 2; i++) {
    for (let j = Math.floor(w) - 2; j <= Math.floor(w) + 2; j++) near.push(...(t.squares.map.get(i + "," + j) || []));
  }
  return near;
}

// Is the point (u, w) inside the polygon with these corners (any
// polygon, dents allowed, like a Penrose dart's)? It is when the line
// from it straight to the right crosses the polygon's sides an odd
// number of times.
function pointInPolygon(corners, u, w) {
  let inside = false;
  for (let k = 0, j = corners.length - 1; k < corners.length; j = k++) {
    const [u0, w0] = corners[j], [u1, w1] = corners[k];
    if ((w0 > w) !== (w1 > w) && u < u0 + (w - w0) * (u1 - u0) / (w1 - w0)) inside = !inside;
  }
  return inside;
}

// The area of the polygon with these corners, in order: positive when
// they go counterclockwise, negative when they go clockwise (the
// "shoelace formula").
function signedArea(corners) {
  let twice = 0;
  for (let k = 0; k < corners.length; k++) {
    const p = corners[k], q = corners[(k + 1) % corners.length];
    twice += p[0] * q[1] - q[0] * p[1];
  }
  return twice / 2;
}

// A tiling domain of the cells listed (cell v is cell part[v] of block
// (x[v], y[v])), for drawing a set of cells that grows, like a walk's
// visited cells or Eden Growth's sites. Its picture's box is the box
// around the cells' middles, with one cell and one side length to
// spare all round. It has no sides (none are drawn between its cells)
// and no index (tilingBox's domains have both).
function tilingCells(tiling, x, y, part) {
  const d = { n: x.length, lattice: "tiling", tiling: tiling, wrap: null, x: x, y: y, part: part };
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (let v = 0; v < d.n; v++) {
    const [u, w] = cellMiddle(d, v);
    left = Math.min(left, u); right = Math.max(right, u);
    bottom = Math.min(bottom, w); top = Math.max(top, w);
  }
  const spare = 1 + widestCell(tiling);
  d.pictureBox = { left: left - spare, right: right + spare, bottom: bottom - spare, top: top + spare };
  return d;
}

// The farthest any corner of a tiling's cell is from its middle.
function widestCell(tiling) {
  let widest = 0;
  for (const cell of tiling.cells) {
    for (const c of cell.corners) widest = Math.max(widest, Math.hypot(c[0] - cell.middle[0], c[1] - cell.middle[1]));
  }
  return widest;
}


/* ---------------------------------------------------------------------
   3D tilings (js/sim-honeycombs.js)
   ---------------------------------------------------------------------
   As for the plane tilings: the tiling comes as its block (from
   honeycombBlock, with cells that are its vertices, edges, faces or
   polyhedra), blocks sit at I a + J b + K c for whole numbers I, J, K,
   and each has the same cells, cell k of block (I, J, K) being
   d.part[v] = k with d.x[v] = I, d.y[v] = J and d.z[v] = K. A torus
   wraps I, J and K around. On the cubes (#22) every block has one cell,
   so (x, y, z) is just where the cell is in the cubic grid Z^3.
   --------------------------------------------------------------------- */

// A box or torus of a 3D tiling's cells. A box is the cells whose middles
// are in 0 <= x < width, 0 <= y < height, 0 <= z < depth (in side
// lengths). A torus is a whole number of blocks each way, as near width
// x height x depth as it can be, but at least enough that a cell's
// neighbors are all different cells. The domain has n, first and nbr as
// every domain (section 1), and
//   x, y, z, part   cell v is cell part[v] of block (x[v], y[v], z[v])
//   wrap            for a torus, { xmin, xmax, ymin, ymax, zmin, zmax }:
//                   the blocks that wrap around; else null
//   lattice         "honeycomb"
//   honeycomb       the block
//   index           "I,J,K,k" -> v
//   sides[v][e]     the cell that is the block's next[e] of cell v (-1:
//                   none, outside the box)
function honeycombBox(block, width, height, depth, torus) {
  const size = [width, height, depth], steps = [block.a[0], block.b[1], block.c[2]], cells = [];
  if (torus) {
    let reach = 1;    // the farthest block a neighbor is in
    for (const cell of block.cells) for (const [, I, J, K] of cell.next) reach = Math.max(reach, Math.abs(I), Math.abs(J), Math.abs(K));
    const count = size.map(function (s, k) { return Math.max(2 * reach + 1, Math.round(s / steps[k])); });
    for (let K = 0; K < count[2]; K++) for (let J = 0; J < count[1]; J++) for (let I = 0; I < count[0]; I++) {
      block.cells.forEach(function (cell, k) { cells.push([I, J, K, k]); });
    }
    return makeHoneycombDomain(block, cells, { xmin: 0, xmax: count[0] - 1, ymin: 0, ymax: count[1] - 1, zmin: 0, zmax: count[2] - 1 });
  }
  // The blocks that can hold a middle inside the box (a middle is in
  // its own block), row by row.
  const last = size.map(function (s, k) { return Math.ceil(s / steps[k]); });
  for (let K = 0; K < last[2]; K++) for (let J = 0; J < last[1]; J++) for (let I = 0; I < last[0]; I++) {
    block.cells.forEach(function (cell, k) {
      const m = honeycombMiddle(block, I, J, K, k);
      if (m[0] < width && m[1] < height && m[2] < depth) cells.push([I, J, K, k]);
    });
  }
  return makeHoneycombDomain(block, cells, null);
}

// The domain of the 3D tiling's cells listed ([I, J, K, k] for cell v = 0,
// 1, ...), as honeycombBox describes it, each joined to its neighbors.
// "wrapRange" is the torus's (or null).
function makeHoneycombDomain(block, cells, wrapRange) {
  const index = new Map();
  cells.forEach(function ([I, J, K, k], v) { index.set(I + "," + J + "," + K + "," + k, v); });
  const edges = [];
  const sides = cells.map(function ([I, J, K, k], v) {
    return block.cells[k].next.map(function ([k2, dI, dJ, dK]) {
      let I2 = I + dI, J2 = J + dJ, K2 = K + dK;
      if (wrapRange) { I2 = wrap(I2, 0, wrapRange.xmax); J2 = wrap(J2, 0, wrapRange.ymax); K2 = wrap(K2, 0, wrapRange.zmax); }
      const w = index.has(I2 + "," + J2 + "," + K2 + "," + k2) ? index.get(I2 + "," + J2 + "," + K2 + "," + k2) : -1;
      if (w > v) edges.push([v, w]);
      return w;
    });
  });
  const { first, nbr } = neighborLists(cells.length, edges);
  const column = function (c) { return Int32Array.from(cells.map(function (cell) { return cell[c]; })); };
  return { n: cells.length, first: first, nbr: nbr, x: column(0), y: column(1), z: column(2), part: column(3),
           wrap: wrapRange, lattice: "honeycomb", honeycomb: block, index: index, sides: sides };
}

// Cell k of block (I, J, K) of a 3D tiling's domain (wrapped around on a
// torus), or -1 if the domain doesn't have it.
function honeycombCell(d, I, J, K, k) {
  if (d.wrap) { I = wrap(I, 0, d.wrap.xmax); J = wrap(J, 0, d.wrap.ymax); K = wrap(K, 0, d.wrap.zmax); }
  const v = d.index.get(I + "," + J + "," + K + "," + k);
  return v === undefined ? -1 : v;
}
