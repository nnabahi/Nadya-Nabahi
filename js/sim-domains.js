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
     lattice    "triangle" or "hexagon" for the domains of section 2
                below, "tiling" for a tiling's (then also tiling, part,
                index, sides, onLeft and onRight: see tilingBox); left
                out for squares

   OTHER LATTICES (at the end of this file). Besides squares, a domain's cells can be
   triangles or hexagons, all with sides of length 1. Their cells still
   get whole numbers (x, y): y is the row, and x the place in the row.
   Only the picture is different:
     triangles   row y lies between heights y*h and (y+1)*h, with
                 h = sqrt(3)/2 (the height of a triangle). Triangle
                 (x, y) has its middle at x/2 across, and points up when
                 x + y is odd, down when x + y is even. Its neighbors are
                 the triangles left and right of it, and the one below
                 it (pointing up) or above it (pointing down).
     hexagons    hexagon (x, y) has its middle at (x + 1/2, y*h) in odd
                 rows and (x, y*h) in even ones (each odd row is shifted
                 half a hexagon to the right), with 6 neighbors.
   The cells can also be the tiles, or the corners, of any tiling by
   regular polygons (js/sim-tilings.js reads it from its code), or of a
   Penrose tiling (js/sim-penrose.js): then (x, y) is the block of the
   tiling the cell is in, as the last part of this file explains.
   cornersOf (cellCorners for triangles and hexagons) gives a cell's
   corners, and cellAtPoint the cell at a point of the picture.

   Contents:
     wrap(v, lo, hi)          wrap a whole number around, for tori
     wrapNumber(v, size)      the same for any number
     least(list), most(list)  the smallest and biggest number of a list
     boxDomain(...)           a box or torus of cells
     aztecDiamond(N)          the Aztec diamond of order N
     latticeBox(...)          a box or torus of triangles or hexagons
     triangleHexagon(N)       a hexagon of side N, cut into triangles
     tilingBox(...)           a box or torus of a tiling's cells
     cellNeighbors(cell)      a tiling cell's neighbors, each once
     tilingCells(...)         some cells of a tiling, to draw (a growing set)
     cornersOf(d, v)          the corners of a cell that is a polygon
     cellCorners(...)         the corners of a triangle or hexagon cell
     cellMiddle(d, v)         the middle of a cell, in the picture
     cellRadius(d, v)         how far a cell's middle is from its sides
     cellSpots(d)             where the cells are, in whole numbers (for starts)
     pictureBox(d)            the box around the domain's picture
     torusSteps(d)            the steps by which a torus's picture repeats
     cellAtPoint(d, u, w)     which cell is at the point (u, w) of the picture
     drawnDomain(...)         a region drawn in the graph tool
     makeDomain(...)          a domain from its cells and edges (the
                              three above use it)
     cellAt(d, x, y)          which cell is at (x, y)
     stepsFrom(d, starts)     distances through the domain
     countPieces(d, colorOf, count)   the connected pieces of each color
     findRegions(d, colors)   the same pieces, each with its area and perimeter

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

// A width x height box of cells, with 4 or 8 neighbors. If "torus" is
// true, the right edge is glued to the left and the top to the bottom.
function boxDomain(width, height, neighbors, torus) {
  const xs = [], ys = [], edges = [];
  // As in the graph tool: each cell looks right and up (and, with 8
  // neighbors, diagonally), wrapping around on a torus.
  const steps = neighbors === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      xs.push(x);
      ys.push(y);
      for (const [dx, dy] of steps) {
        let nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          if (!torus) continue;
          nx = wrap(nx, 0, width - 1);
          ny = wrap(ny, 0, height - 1);
        }
        edges.push([y * width + x, ny * width + nx]);
      }
    }
  }
  const wrapRange = torus ? { xmin: 0, xmax: width - 1, ymin: 0, ymax: height - 1 } : null;
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
  return makeDomain(graph.vertices.map(function (v) { return v.x; }),
                    graph.vertices.map(function (v) { return v.y; }),
                    edges, wrapRange, graph.vertices.map(function (v) { return v.id; }));
}

// Build the domain object described at the top of this file, from the
// cells' coordinates (xs, ys) and the edges as pairs of cell numbers.
function makeDomain(xs, ys, edges, wrapRange, ids) {
  const n = xs.length;

  // Neighbor lists, each edge in both directions. A Set drops repeats
  // (a torus 2 wide meets the same neighbor on both sides), and a cell
  // is never its own neighbor.
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

  const d = {
    n: n, x: Int32Array.from(xs), y: Int32Array.from(ys),
    first: first, nbr: Int32Array.from(all), wrap: wrapRange, ids: ids,
    xmin: least(xs), xmax: most(xs), ymin: least(ys), ymax: most(ys),
  };
  const boxWidth = d.xmax - d.xmin + 1;
  d.cellAt = new Int32Array(boxWidth * (d.ymax - d.ymin + 1)).fill(-1);
  for (let v = 0; v < n; v++) d.cellAt[(d.y[v] - d.ymin) * boxWidth + (d.x[v] - d.xmin)] = v;
  return d;
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

// The number of steps from the nearest of the cells "starts" to every
// cell (a breadth-first search). -1 for cells that can't be reached.
function stepsFrom(d, starts) {
  const steps = new Int32Array(d.n).fill(-1);
  const queue = starts.slice();
  for (const s of starts) steps[s] = 0;
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (steps[w] === -1) { steps[w] = steps[v] + 1; queue.push(w); }
    }
  }
  return steps;
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
// same color. colors[v] is cell v's color, or -1 for a cell with no
// color yet (it is in no region). For each region r:
//   areas[r]       its number of cells
//   perimeters[r]  the number of edges from it to a cell of another
//                  color (cells with no color don't count), so the
//                  perimeters of all regions add up to twice the
//                  interface (the edges between two colors)
//   color[r]       its color
function findRegions(d, colors) {
  const seen = new Uint8Array(d.n);    // 1 once a cell's region is found
  const areas = [], perimeters = [], regionColor = [];
  const stack = [];
  for (let s = 0; s < d.n; s++) {
    if (colors[s] === -1 || seen[s]) continue;
    let area = 0, perimeter = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length > 0) {
      const v = stack.pop();
      area++;
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (colors[w] === colors[v]) {
          if (!seen[w]) { seen[w] = 1; stack.push(w); }
        } else if (colors[w] !== -1) {
          perimeter++;
        }
      }
    }
    areas.push(area);
    perimeters.push(perimeter);
    regionColor.push(colors[s]);
  }
  return { areas: areas, perimeters: perimeters, color: regionColor };
}


/* ---------------------------------------------------------------------
   Other lattices: triangles and hexagons (see the top of the file)
   --------------------------------------------------------------------- */

const ROW_HEIGHT = Math.sqrt(3) / 2;   // h: the height of a row of triangles or hexagons

// A width x height box of triangles or hexagons ("lattice" says which):
// "height" rows of "width" cells. If "torus" is true, the right edge is
// glued to the left and the top to the bottom; then the width of a
// triangle box and the height of both must be even, so the pattern
// (up, down, ... or the shifted rows) carries on across the seams.
function latticeBox(lattice, width, height, torus) {
  const xs = [], ys = [], edges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      xs.push(x);
      ys.push(y);
      for (const [dx, dy] of latticeSteps(lattice, x, y)) {
        let nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          if (!torus) continue;
          nx = wrap(nx, 0, width - 1);
          ny = wrap(ny, 0, height - 1);
        }
        edges.push([y * width + x, ny * width + nx]);
      }
    }
  }
  const wrapRange = torus ? { xmin: 0, xmax: width - 1, ymin: 0, ymax: height - 1 } : null;
  const d = makeDomain(xs, ys, edges, wrapRange, null);
  d.lattice = lattice;
  return d;
}

// The steps from cell (x, y) to its neighbors to the right and above
// (the others find it with their own steps, as in boxDomain).
function latticeSteps(lattice, x, y) {
  if (lattice === "triangle") {
    // Right always; up only for a triangle pointing down (x + y even).
    return (x + y) % 2 === 0 ? [[1, 0], [0, 1]] : [[1, 0]];
  }
  // Hexagons: right, and the two above (up-left and up-right), which in
  // an odd row (shifted right) are x and x + 1, in an even row x - 1 and x.
  return y % 2 !== 0 ? [[1, 0], [0, 1], [1, 1]] : [[1, 0], [-1, 1], [0, 1]];
}

// The regular hexagon of side N, cut into 6 N^2 triangles: the triangles
// whose middles are inside the hexagon with corners (N, 0), (N/2, N h),
// (-N/2, N h), (-N, 0), (-N/2, -N h), (N/2, -N h), centered on a corner
// of the triangles. Its sides run along the triangles' sides, so each
// triangle is either all in or all out. Tilings of it by rhombi (two
// triangles side by side) are the "lozenge tilings" of a hexagon.
function triangleHexagon(N) {
  const xs = [], ys = [], index = new Map();
  for (let y = -N; y < N; y++) {
    for (let x = -2 * N - 1; x <= 2 * N + 1; x++) {
      const up = ((x + y) % 2 + 2) % 2 === 1;
      const u = x / 2, w = (y + (up ? 1 : 2) / 3) * ROW_HEIGHT;   // its middle
      if (Math.abs(w) < N * ROW_HEIGHT && Math.sqrt(3) * Math.abs(u) + Math.abs(w) < Math.sqrt(3) * N) {
        index.set(x + "," + y, xs.length);
        xs.push(x);
        ys.push(y);
      }
    }
  }
  const edges = [];
  for (let v = 0; v < xs.length; v++) {
    for (const [dx, dy] of latticeSteps("triangle", xs[v], ys[v])) {
      const w = index.get((xs[v] + dx) + "," + (ys[v] + dy));
      if (w !== undefined) edges.push([v, w]);
    }
  }
  const d = makeDomain(xs, ys, edges, null, null);
  d.lattice = "triangle";
  return d;
}

// The corners of cell (x, y) of a triangle or hexagon lattice, in the
// picture, as [[u, w], ...] going around it. (The sims' second threads
// get a copy of this function, so it uses nothing from outside it.)
function cellCorners(lattice, x, y) {
  const h = Math.sqrt(3) / 2;
  if (lattice === "triangle") {
    const left = (x - 1) / 2, right = (x + 1) / 2, bottom = y * h, top = (y + 1) * h;
    return ((x + y) % 2 + 2) % 2 === 1
      ? [[left, bottom], [right, bottom], [x / 2, top]]    // pointing up
      : [[right, top], [left, top], [x / 2, bottom]];     // pointing down
  }
  const u = x + ((y % 2 + 2) % 2) / 2, w = y * h, r = 1 / Math.sqrt(3);   // r: middle to corner
  const corners = [];
  for (let k = 0; k < 6; k++) {
    const angle = Math.PI / 6 + k * Math.PI / 3;
    corners.push([u + r * Math.cos(angle), w + r * Math.sin(angle)]);
  }
  return corners;
}

// The middle of cell v of domain d, in the picture. (For the corners
// of a tiling, the corner itself.)
function cellMiddle(d, v) {
  if (!d.lattice) return [d.x[v], d.y[v]];
  if (d.lattice === "tiling") {
    const [u, w] = blockStart(d, d.x[v], d.y[v]), middle = d.tiling.cells[d.part[v]].middle;
    return [middle[0] + u, middle[1] + w];
  }
  const corners = cellCorners(d.lattice, d.x[v], d.y[v]);
  let u = 0, w = 0;
  for (const c of corners) { u += c[0]; w += c[1]; }
  return [u / corners.length, w / corners.length];
}

// How far the middle of cell v of domain d is from the nearest of its
// sides: the radius of the biggest circle around the middle that fits
// in the cell (1/2 for a square). A number written on a cell, or a coin
// standing on it in 3D, is sized by it. On a tiling it is worked out
// once for each cell of the repeating block, and kept.
function cellRadius(d, v) {
  if (!d.lattice) return 0.5;
  if (d.lattice !== "tiling") return sideDistance(cellMiddle(d, v), cornersOf(d, v));
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
  if (d.lattice !== "tiling") return d;
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
// around (x, y).
function pictureBox(d) {
  if (!d.lattice) return { left: d.xmin - 0.5, right: d.xmax + 0.5, bottom: d.ymin - 0.5, top: d.ymax + 0.5 };
  if (d.pictureBox) return d.pictureBox;
  if (d.lattice === "tiling" && d.wrap) {
    // One copy of the torus: its blocks across and up (for a tiling
    // whose blocks are slanted, the copies above are shifted sideways:
    // torusSteps).
    d.pictureBox = { left: 0, right: blockStart(d, d.wrap.xmax + 1, 0)[0], bottom: 0, top: blockStart(d, 0, d.wrap.ymax + 1)[1] };
    return d.pictureBox;
  }
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (let v = 0; v < d.n; v++) {
    for (const [u, w] of cornersOf(d, v)) {
      left = Math.min(left, u); right = Math.max(right, u);
      bottom = Math.min(bottom, w); top = Math.max(top, w);
    }
  }
  if (d.wrap) {
    // One copy of the torus: a whole number of cells across (half a
    // triangle per x for triangles, one hexagon per x for hexagons) and
    // of rows up.
    const across = (d.wrap.xmax - d.wrap.xmin + 1) * (d.lattice === "triangle" ? 0.5 : 1);
    right = left + across;
    top = bottom + (d.wrap.ymax - d.wrap.ymin + 1) * ROW_HEIGHT;
  }
  d.pictureBox = { left: left, right: right, bottom: bottom, top: top };
  return d.pictureBox;
}

// The two steps by which the picture of a torus repeats: across, and up
// (up is slanted for a tiling with slanted blocks).
function torusSteps(d) {
  if (d.lattice === "tiling") return [blockStart(d, d.wrap.xmax + 1, 0), blockStart(d, 0, d.wrap.ymax + 1)];
  const box = pictureBox(d);
  return [[box.right - box.left, 0], [0, box.top - box.bottom]];
}

// Which cell of domain d has the point (u, w) of the picture in it, or
// -1 if none. For squares, the nearest grid point. For the other
// lattices, the cells around the point are tried, and the one whose
// corners go around it wins.
function cellAtPoint(d, u, w) {
  if (!d.lattice) return cellAt(d, Math.round(u), Math.round(w));
  if (d.lattice === "tiling") return tilingCellAt(d, u, w);
  const row = Math.floor(w / ROW_HEIGHT + (d.lattice === "hexagon" ? 0.5 : 0));
  const across = d.lattice === "triangle" ? Math.round(2 * u) : Math.round(u);
  for (let y = row - 1; y <= row + 1; y++) {
    for (let x = across - 2; x <= across + 2; x++) {
      if (pointInCell(cellCorners(d.lattice, x, y), u, w)) return cellAt(d, x, y);
    }
  }
  return -1;
}

// Is the point (u, w) inside the cell with these corners (a shape with
// no dents, like a triangle or hexagon)? It is when it is on the same
// side of every side.
function pointInCell(corners, u, w) {
  let sign = 0;
  for (let k = 0; k < corners.length; k++) {
    const [u0, w0] = corners[k], [u1, w1] = corners[(k + 1) % corners.length];
    const cross = (u1 - u0) * (w - w0) - (w1 - w0) * (u - u0);
    if (cross !== 0) {
      if (sign !== 0 && Math.sign(cross) !== sign) return false;
      sign = Math.sign(cross);
    }
  }
  return true;
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
// lengths), or, for a tiling that never repeats (js/sim-penrose.js),
// the same rectangle centered on the tiling's middle. A torus is a
// whole number of blocks each way, as near width x height as it can be,
// but at least enough that a cell's neighbors are all different cells. Besides the usual (section 1), the domain
// has
//   tiling, part, index   the block, cell v being cell part[v] of block
//                         (x[v], y[v]), and index "I,J,k" -> v
//   sides[v][e]           the cell across side e of cell v (-1: none)
//   onLeft, onRight       for a box, 1 for the cells on its left (right)
//                         edge: those with a missing neighbor whose
//                         middle is left of the box (right of it), as
//                         the left column is for squares
// (cellAt isn't used: a block has several cells.)
function tilingBox(tiling, width, height, torus) {
  const [A, bx, B] = [tiling.a[0], tiling.b[0], tiling.b[1]];
  const cells = [];   // [I, J, k] for each cell of the domain
  let wrapRange = null, left = 0, bottom = 0;   // (left, bottom): the box's corner
  if (tiling.finite) {
    // One big block, which must reach 2 past the box (a cell's
    // neighbors' middles are less than 2 from its own), so that the
    // cells just outside the box are known too.
    left = -width / 2;
    bottom = -height / 2;
    growPenrose(tiling, width / 2 + 2, height / 2 + 2);
    tiling.cells.forEach(function (cell, k) {
      const [u, w] = cell.middle;
      if (u >= left && u < left + width && w >= bottom && w < bottom + height) cells.push([0, 0, k]);
    });
    // Row by row, by their middles: the block's numbers depend on how it
    // grew, and the box should be the same whichever way it did.
    const middle = function (c) { return tiling.cells[c[2]].middle; };
    cells.sort(function (c, d) { return middle(c)[1] - middle(d)[1] || middle(c)[0] - middle(d)[0]; });
  } else if (torus) {
    let reach = 1;    // the farthest block a neighbor is in
    for (const cell of tiling.cells) for (const [, I, J] of cell.next) reach = Math.max(reach, Math.abs(I), Math.abs(J));
    const across = Math.max(2 * reach + 1, Math.round(width / A)), up = Math.max(2 * reach + 1, Math.round(height / B));
    for (let J = 0; J < up; J++) for (let I = 0; I < across; I++) tiling.cells.forEach(function (cell, k) { cells.push([I, J, k]); });
    wrapRange = { xmin: 0, xmax: across - 1, ymin: 0, ymax: up - 1 };
  } else {
    for (let J = -1; J * B < height + B; J++) {
      for (let I = Math.floor(-J * bx / A) - 2; I * A + J * bx < width + A; I++) {
        tiling.cells.forEach(function (cell, k) {
          const u = cell.middle[0] + I * A + J * bx, w = cell.middle[1] + J * B;
          if (u >= 0 && u < width && w >= 0 && w < height) cells.push([I, J, k]);
        });
      }
    }
  }
  // Number the cells, then join each to the cell across each side.
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
      if (w === -1 && k2 >= 0) {   // the neighbor is outside the box: is it off the left or right side?
        const u = tiling.cells[k2].middle[0] + I2 * A + J2 * bx;
        if (u < left) onLeft[v] = 1;
        if (u >= left + width) onRight[v] = 1;
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
  d.sides = sides;   // as latticeSides (js/sim-view.js) gives for the other lattices
  if (!torus) { d.onLeft = onLeft; d.onRight = onRight; }
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

// Where block (I, J) of domain d's tiling starts, in the picture.
function blockStart(d, I, J) {
  const t = d.tiling;
  return [I * t.a[0] + J * t.b[0], I * t.a[1] + J * t.b[1]];
}

// The corners of cell v of a domain with polygons for cells (a tiling,
// or triangles or hexagons), in the picture.
function cornersOf(d, v) {
  if (d.lattice !== "tiling") return cellCorners(d.lattice, d.x[v], d.y[v]);
  const [u, w] = blockStart(d, d.x[v], d.y[v]);
  return d.tiling.cells[d.part[v]].corners.map(function (c) { return [c[0] + u, c[1] + w]; });
}

// The cell of a tiling domain at the point (u, w), or -1 if none: the
// blocks around the point are tried, and the cell whose corners go
// around it wins. A tiling that never repeats has one block, and only
// the cells near the point are tried.
function tilingCellAt(d, u, w) {
  const t = d.tiling, [A, bx, B] = [t.a[0], t.b[0], t.b[1]];
  if (t.finite) {
    const k = cellsNear(t, u, w).find(function (k) { return pointInPolygon(t.cells[k].corners, u, w); });
    const v = k === undefined ? undefined : d.index.get("0,0," + k);
    return v === undefined ? -1 : v;
  }
  const J0 = Math.floor(w / B), I0 = Math.floor((u - J0 * bx) / A);
  for (let J = J0 - 2; J <= J0 + 2; J++) {
    for (let I = I0 - 2; I <= I0 + 2; I++) {
      const [su, sw] = blockStart(d, I, J);
      for (let k = 0; k < t.cells.length; k++) {
        const corners = t.cells[k].corners.map(function (c) { return [c[0] + su, c[1] + sw]; });
        if (!pointInCell(corners, u, w)) continue;
        const I2 = d.wrap ? wrap(I, 0, d.wrap.xmax) : I, J2 = d.wrap ? wrap(J, 0, d.wrap.ymax) : J;
        const v = d.index.get(I2 + "," + J2 + "," + k);
        return v === undefined ? -1 : v;
      }
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

// Is the point (u, w) inside the polygon with these corners (dents
// allowed, like a Penrose dart's)? It is when the line from it straight
// to the right crosses the polygon's sides an odd number of times.
function pointInPolygon(corners, u, w) {
  let inside = false;
  for (let k = 0, j = corners.length - 1; k < corners.length; j = k++) {
    const [u0, w0] = corners[j], [u1, w1] = corners[k];
    if ((w0 > w) !== (w1 > w) && u < u0 + (w - w0) * (u1 - u0) / (w1 - w0)) inside = !inside;
  }
  return inside;
}

// A tiling domain of the cells listed (cell v is cell part[v] of block
// (x[v], y[v])), for drawing a set of cells that grows, like a walk's
// visited cells or a mountain's sites. Its picture's box is the box
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
