/* =====================================================================
   sim-deposit.js  —  what the ballistic deposition sims share: a strip
                      of a lattice cut by vertical lines, the shape of a
                      falling tile, and the surface of a deposit
   ---------------------------------------------------------------------
   In ballistic deposition particles fall STRAIGHT DOWN onto a floor and
   stick where they first touch it or the deposit. So both sims ask
   where a vertical line meets things:
     - the discrete sim: which cells of the lattice the line crosses,
       and how high up each piece of the line inside a cell is;
     - the continuous sim: how high the top of a tile's shape is above
       each point, so a falling tile can be stopped exactly where it
       first touches another.
   And both measure the deposit's surface the same way (newSurface).

   A STRIP OF A LATTICE (the discrete sim). The lattice is one of the
   lattices of js/sim-walk.js: in the plane the square grid or a tiling
   turned upright (uprightBlock, js/sim-tilings.js: its block repeats at
   I a + J b with a = [A, 0] pointing straight right), in space a tiling
   of space (honeycombBlock, js/sim-honeycombs.js: its block is a box,
   repeating at I a + J b + K c). Up is y in the plane and z in space.
   The strip is L blocks wide (in space, L by L blocks across), so its
   width is W = L A, and
     - PERIODIC sides: the strip's right edge is glued to its left (in
       space, also its back to its front), so moving L blocks across
       comes back to the same cell. Each cell is kept as its one copy
       whose middle is in the window 0 <= x < W (and 0 <= y < W', in space);
     - WALLS: the strip is the blocks 0 .. L - 1 across, and cells on
       either side of a wall are not neighbors. That only makes sense
       when the block's sides cut no cell (the square grid, the cubes),
       so a page offers walls only then (wallsFit).
   The FLOOR is every cell whose middle is below height 0: those count
   as already in the deposit, from the start.

   newFallingLattice(lattice, L, walls) gives
     dims                 2 or 3
     widths               [W], or in space [W, W'] (W' = L B, B the
                          block's depth)
     moveRows             the most rows (layers in space) apart two
                          neighbors can be
     rowTop(V), rowBottom(V)   no cell of row V (layer V in space) reaches
                          higher or lower than these
     rowOf(s)             the row of site s (its J in the plane, its K in
                          space)
     heightOf(s)          how high the middle of site s is
     isFloor(s)           is site s in the floor?
     keyOf(s)             one whole number per site (for sites at or
                          above the floor's top: rows from -1 up)
     forEachNeighbor(s, visit)   visit(t) for each neighbor t of site s
     crossed(point, V, visit)    visit(s, bottom, top) for each piece of
                          the vertical line through "point" ([x], or
                          [x, y] in space) inside a cell of row V: the
                          cell (a site), and how high the piece goes
     dropPoint(u, v)      the point a particle falls along, from one or
                          two uniform numbers in (0, 1): uniform across
                          the strip
     placeIn(point)       a point someone chose (a click) as one of the
                          strip's: moved by whole widths into it (periodic
                          sides), or null if it is outside (walls)
     samples              the points where the surface is measured: PER
                          evenly spaced across each block (each way)
     samplesUnder(s, visit)   visit(m, top) for each sample m whose line
                          crosses site s, with how high the cell's top
                          is there
     floorTopAt(point)    how high the floor's top is above the point
     floorTop()           the sites of the floor's top layer: floor
                          cells with a neighbor that is not floor (what
                          a page draws as the floor)
     sizeOf(s)            the cell's area (in space, its volume)
   A site is { I, J, K, k } as everywhere (js/sim-walk.js).

   THE SHAPE OF A FALLING TILE (the continuous sim). A tile T, moved
   without turning, falls down a vertical line and stops the first time
   it touches the floor or a placed tile q + T. It touches q + T exactly
   when its center is in q + D, with D = T - T (js/sim-tile-shape.js), so
   falling straight down it first touches q + T when its center is at
   the TOP of q + D above its line. fallingTile(shape) gives, for the
   tile's polygon or polyhedron,
     differenceTop(dx, dy)   how high D's top is above the point
                          (dx, dy) across from its center (-Infinity if
                          the line misses D)
     tileTop(dx, dy)      the same for T itself (for the surface)
     reach                how far across D reaches each way: [x], or
                          [x, y] in space
     differenceHeight     how high D reaches at all (its top's highest)
     low                  how low T reaches below its center (at most 0)
     left, right          T's horizontal extent: [x], or [x, y] in space
     size                 T's area (in space, its volume)
   In the plane D's top is found exactly, for the polygon of the tile
   (upperProfile: the highest of its edges above the point). In space
   the tile must be a ball or a box with its sides along x, y and z, for
   now (both are exact).

   THE SURFACE. newSurface(count) keeps the height of the deposit above
   each of "count" sample points: the top of the highest cell or tile
   above it. Its mean, less the floor's, is the mean height h, and the
   standard deviation of the heights is the interface width w: the
   numbers the theory of surface growth is about (A.-L. Barabasi and
   H. E. Stanley, "Fractal Concepts in Surface Growth", Cambridge
   University Press, 1995, Chapter 2).

   Contents:
     1. A cell's shape, and where a vertical line crosses it
     2. A strip of a lattice
     3. The shape of a falling tile
     4. The surface
     5. The list of helpers, for workers
   ===================================================================== */

// The ranges of blocks (and of samples) a cell may reach are widened by
// this much, so a line exactly on a cell's side, which rounding might
// put a hair outside it, is still looked at: whether the line crosses
// the cell is then up to lineCrossings.
const LINE_SLACK = 1e-9;

// How many surface samples go across each block (each way, in space).
// In the plane 8, so even a tiling's widest cell has a few; in space
// 3, so a cube has one in its middle (of 9) and there aren't too many.
const SAMPLES_PER_BLOCK = { 2: 8, 3: 3 };


/* =====================================================================
   1. A CELL'S SHAPE, AND WHERE A VERTICAL LINE CROSSES IT
   ---------------------------------------------------------------------
   A cell's shape is kept with its corners where they are in block
   (0, 0) (or (0, 0, 0)), and its horizontal extent, so the blocks a line
   can cross are found at once.
     IN THE PLANE: its corners. The line x = u crosses an edge when the
       edge's two ends are on either side of it (one end with x <= u,
       the other with x > u: each crossing is counted once, even through
       a corner). Going up the line, the crossings go in and out of the
       cell in turn (the even-odd rule), so sorted, they pair up into
       the pieces of the line inside the cell.
     IN SPACE: its faces, each cut into triangles as a fan from the
       face's middle (as js/sim-3d.js draws them, so two cells that
       share a face share its triangles). The line through (u, v)
       crosses a triangle when (u, v) is inside the triangle seen from
       above; the height there comes from the triangle's plane. Then the
       same even-odd pairing.
   A line through a corner or along an edge happens with chance 0 (the
   points are drawn from uniform numbers).
   ===================================================================== */

// The cell shapes of a lattice's block, and how blocks repeat:
//   dims          2 or 3
//   across        [A] in the plane, [A, B] in space: the steps across
//   up            in the plane the step b = [bx, by] to the row above;
//                 in space the height C of a layer
//   cells         each cell's shape (flatShape or solidShape)
function cellShapes(lattice) {
  if (lattice.dim === 2) {
    const tiling = lattice.tiling;
    if (tiling && tiling.finite) throw new Error("A tiling that never repeats has no strip of blocks.");
    const square = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    return {
      dims: 2, across: [tiling ? tiling.a[0] : 1], up: tiling ? tiling.b : [0, 1],
      cells: tiling ? tiling.cells.map(function (cell) { return flatShape(cell.corners, cell.middle); }) : [flatShape(square, [0, 0])],
    };
  }
  const block = lattice.block;
  if (!block) throw new Error("In 3D the lattice must be a tiling of space.");
  return {
    dims: 3, across: [block.a[0], block.b[1]], up: block.c[2],
    cells: block.cells.map(function (cell) { return solidShape(cell.corners, cell.faces, cell.middle); }),
  };
}

// A cell in the plane: its corners (xs, ys), middle, horizontal extent
// (low, high: [x] each), lowest and highest points, and area (the
// shoelace formula).
function flatShape(corners, middle) {
  const xs = Float64Array.from(corners, function (c) { return c[0]; });
  const ys = Float64Array.from(corners, function (c) { return c[1]; });
  let area = 0;
  for (let e = 0; e < xs.length; e++) {
    const f = (e + 1) % xs.length;
    area += xs[e] * ys[f] - xs[f] * ys[e];
  }
  return {
    xs: xs, ys: ys, middle: middle, low: [Math.min(...xs)], high: [Math.max(...xs)],
    bottom: Math.min(...ys), top: Math.max(...ys), size: Math.abs(area) / 2,
  };
}

// A cell in space: its faces as triangles (9 numbers each, three
// corners [x, y, z]), middle, horizontal extent (low, high: [x, y]
// each), lowest and highest points, and volume (each triangle with the
// point 0 makes a tetrahedron; with the faces going counterclockwise
// seen from outside, their signed volumes add up to the cell's). A cell
// with no faces (an edge of a tiling) or one face (a face) has no
// inside, so no line crosses it.
function solidShape(corners, faces, middle) {
  const triangles = [];
  let volume = 0;
  if (faces.length > 1) {
    for (const face of faces) {
      const m = [0, 1, 2].map(function (c) { return face.reduce(function (sum, i) { return sum + corners[i][c]; }, 0) / face.length; });
      for (let e = 0; e < face.length; e++) {
        const p = corners[face[e]], q = corners[face[(e + 1) % face.length]];
        triangles.push(...m, ...p, ...q);
        volume += dot3(m, cross3(p, q)) / 6;
      }
    }
  }
  const at = function (c) { return corners.map(function (p) { return p[c]; }); };
  return {
    triangles: Float64Array.from(triangles), middle: middle,
    low: [Math.min(...at(0)), Math.min(...at(1))], high: [Math.max(...at(0)), Math.max(...at(1))],
    bottom: Math.min(...at(2)), top: Math.max(...at(2)), size: Math.abs(volume),
  };
}

// The heights where the vertical line through (u, v) (v only in space)
// crosses the shape's edges (faces), sorted: crossings 0 and 1 are the
// first piece inside the cell, 2 and 3 the next, and so on.
function lineCrossings(shape, u, v) {
  const heights = [];
  if (shape.xs) {
    const xs = shape.xs, ys = shape.ys, n = xs.length;
    for (let e = 0; e < n; e++) {
      const f = (e + 1) % n;
      if ((xs[e] <= u) !== (xs[f] <= u)) heights.push(ys[e] + (u - xs[e]) * (ys[f] - ys[e]) / (xs[f] - xs[e]));
    }
  } else {
    const t = shape.triangles;
    for (let i = 0; i < t.length; i += 9) {
      const z = triangleHeight(t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5], t[i + 6], t[i + 7], t[i + 8], u, v);
      if (z !== null) heights.push(z);
    }
  }
  return heights.sort(function (a, b) { return a - b; });
}

// How high the triangle with corners (x0, y0, z0), (x1, y1, z1),
// (x2, y2, z2) is above (u, v), or null if (u, v) isn't inside it seen
// from above (or the triangle stands upright, so no line goes through
// it). The weights w0, w1, w2 of the corners are the areas of the
// triangles (u, v) makes with the other two corners: all of the sign of
// their sum exactly when (u, v) is inside.
// A line through an edge or a corner (a weight 0) is counted for just
// one of the triangles that meet there: it counts as inside when a tiny
// step in x (if that changes nothing, in y) would take it inside, the
// way lineCrossings counts a corner on the line in the plane. This is
// "simulation of simplicity" (H. Edelsbrunner and E. P. Mucke, ACM
// Trans. Graphics 9 (1990) 66-104). Without it a line through a shared
// edge would cross the cell's surface twice there, and its pieces would
// come out wrong; the surface's sample lines often go through corners.
// (Two triangles sharing an edge work out its weight from the same two
// products in the other order, so it comes out exactly opposite, 0 or
// not, and so does its step.)
function triangleHeight(x0, y0, z0, x1, y1, z1, x2, y2, z2, u, v) {
  const w0 = (x1 - u) * (y2 - v) - (y1 - v) * (x2 - u);
  const w1 = (x2 - u) * (y0 - v) - (y2 - v) * (x0 - u);
  const w2 = (x0 - u) * (y1 - v) - (y0 - v) * (x1 - u);
  const all = w0 + w1 + w2;
  if (all === 0) return null;
  const s = all > 0 ? 1 : -1;
  // A weight's change for a step in x, and in y: w0 changes by
  // y1 - y2 for each step in x, and by x2 - x1 for each step in y.
  if (!(insideSide(s * w0, s * (y1 - y2), s * (x2 - x1)) && insideSide(s * w1, s * (y2 - y0), s * (x0 - x2)) &&
        insideSide(s * w2, s * (y0 - y1), s * (x1 - x0)))) return null;
  return (w0 * z0 + w1 * z1 + w2 * z2) / all;
}

// Is a weight w inside (above 0), or 0 and going inside for a tiny step
// in x (by stepX each step), or if that is 0 too, in y?
function insideSide(w, stepX, stepY) { return w > 0 || (w === 0 && (stepX > 0 || (stepX === 0 && stepY > 0))); }


/* =====================================================================
   2. A STRIP OF A LATTICE
   ---------------------------------------------------------------------
   See the top of this file. Row V is J in the plane and K in space;
   the steps across are I (and J in space).
   ===================================================================== */

// Can this lattice have walls: are its blocks boxes (in the plane,
// rectangles: b points straight up) whose sides cut no cell? Its shapes
// come from cellShapes.
function wallsFit(shapes) {
  if (shapes.dims === 2 && Math.abs(shapes.up[0]) > 1e-9) return false;
  return shapes.across.every(function (A, d) {
    const left = Math.min(...shapes.cells.map(function (c) { return c.low[d]; }));
    return shapes.cells.every(function (c) { return c.high[d] <= left + A + 1e-9; });
  });
}

function newFallingLattice(lattice, L, walls) {
  const shapes = cellShapes(lattice), dims = shapes.dims, cells = shapes.cells, cellCount = cells.length;
  if (walls && !wallsFit(shapes)) throw new Error("This lattice's blocks cut through cells, so it can't have walls: its sides are periodic.");
  const across = shapes.across, widths = across.map(function (A) { return L * A; }), W = widths[0];
  const slant = dims === 2 ? shapes.up[0] : 0, rise = dims === 2 ? shapes.up[1] : shapes.up;
  const tops = cells.map(function (c) { return c.top; }), bottoms = cells.map(function (c) { return c.bottom; });
  const highest = Math.max(...tops), lowest = Math.min(...bottoms);
  // Where the strip starts: the left (and front) side of block 0.
  const start = across.map(function (A, d) { return Math.min(...cells.map(function (c) { return c.low[d]; })); });
  let moveRows = 0;
  for (let k = 0; k < cellCount; k++) for (const move of lattice.movesOf(k)) moveRows = Math.max(moveRows, Math.abs(move[dims === 2 ? 2 : 3]));

  const f = {
    dims: dims, widths: widths, moveRows: moveRows,
    rowTop: function (V) { return V * rise + highest; },
    rowBottom: function (V) { return V * rise + lowest; },
    rowOf: rowOf, heightOf: heightOf, isFloor: isFloor, keyOf: keyOf, forEachNeighbor: forEachNeighbor,
    crossed: crossed, dropPoint: dropPoint, placeIn: placeIn, samplesUnder: samplesUnder, floorTopAt: floorTopAt, floorTop: floorTop,
    sizeOf: function (s) { return cells[s.k].size; },
  };

  function rowOf(s) { return dims === 2 ? s.J : s.K; }
  function heightOf(s) { const p = lattice.placeOf(s.I, s.J, s.K, s.k); return p[dims - 1]; }
  function isFloor(s) { return heightOf(s) < 0; }

  // The site's one copy in the window (periodic sides): moved by whole
  // strips across until its middle is in 0 <= x < W (and 0 <= y < W).
  function inWindow(s) {
    if (walls) return s;
    const p = lattice.placeOf(s.I, s.J, s.K, s.k);
    s.I -= L * Math.floor(p[0] / W);
    if (dims === 3) s.J -= L * Math.floor(p[1] / widths[1]);
    return s;
  }
  // With walls: is the site in the strip (its blocks 0 .. L - 1 across)?
  function inStrip(s) { return s.I >= 0 && s.I < L && (dims === 2 || (s.J >= 0 && s.J < L)); }

  // In the window, a row's blocks across are within a few of
  // -V slant / A (a slanted block shifts each row sideways), so this key
  // stays a whole number below 2^53 for every row the sims reach.
  function keyOf(s) {
    if (dims === 2) return ((s.J + 2) * (L + 8) + (s.I + Math.floor(s.J * slant / across[0]) + 4)) * cellCount + s.k;
    return (((s.K + 2) * (L + 2) + (s.J + 1)) * (L + 2) + (s.I + 1)) * cellCount + s.k;
  }

  function forEachNeighbor(s, visit) {
    for (const [k2, dI, dJ, dK] of lattice.movesOf(s.k)) {
      const t = newSite(s.I + dI, s.J + dJ, s.K + dK, k2);
      if (walls && !inStrip(t)) continue;
      visit(inWindow(t));
    }
  }

  // The pieces of the line through "point" in cells of row V. For each
  // cell of the block, the blocks across whose copy of it reaches the
  // line: block I's copy covers low + I A + (row V's slant) to
  // high + ..., so I runs over a short range (in space, I and J).
  function crossed(point, V, visit) {
    const lift = V * rise;
    for (let k = 0; k < cellCount; k++) {
      const c = cells[k];
      const x = point[0] - V * slant, Ilow = Math.ceil((x - c.high[0]) / across[0] - LINE_SLACK), Ihigh = Math.floor((x - c.low[0]) / across[0] + LINE_SLACK);
      let Jlow = 0, Jhigh = 0;
      if (dims === 3) { Jlow = Math.ceil((point[1] - c.high[1]) / across[1] - LINE_SLACK); Jhigh = Math.floor((point[1] - c.low[1]) / across[1] + LINE_SLACK); }
      for (let I = Ilow; I <= Ihigh; I++) {
        for (let J = Jlow; J <= Jhigh; J++) {
          const heights = lineCrossings(c, x - I * across[0], dims === 3 ? point[1] - J * across[1] : 0);
          if (heights.length < 2) continue;
          const s = dims === 2 ? newSite(I, V, 0, k) : newSite(I, J, V, k);
          if (walls && !inStrip(s)) continue;
          inWindow(s);
          for (let i = 0; i + 1 < heights.length; i += 2) visit(s, heights[i] + lift, heights[i + 1] + lift);
        }
      }
    }
  }

  // Uniform across the strip, from its left (and front) side.
  function dropPoint(u, v) {
    return dims === 2 ? [start[0] + u * W] : [start[0] + u * W, start[1] + v * widths[1]];
  }

  function placeIn(point) {
    const moved = point.map(function (x, d) { return walls ? x : x - widths[d] * Math.floor((x - start[d]) / widths[d]); });
    return moved.every(function (x, d) { return x >= start[d] && x < start[d] + widths[d]; }) ? moved : null;
  }

  // The sample points: PER across each block (each way), in the middle
  // of equal parts of the strip.
  const across1 = SAMPLES_PER_BLOCK[dims] * L, gaps = widths.map(function (w) { return w / across1; });
  f.samples = [];
  if (dims === 2) for (let i = 0; i < across1; i++) f.samples.push([start[0] + (i + 0.5) * gaps[0]]);
  else for (let j = 0; j < across1; j++) for (let i = 0; i < across1; i++) f.samples.push([start[0] + (i + 0.5) * gaps[0], start[1] + (j + 0.5) * gaps[1]]);

  // The samples whose line crosses site s (as placed: its copy in the
  // window), and how high its top is above each. A sample point is
  // taken at the copy (a whole strip across) that the cell reaches.
  // (Sample i is at start + (i + 0.5) gap across, so the cell, from
  // low to high, is over the samples i from (low - start) / gap - 0.5
  // to (high - start) / gap - 0.5; in space the same each way.)
  function samplesUnder(s, visit) {
    const c = cells[s.k], place = lattice.placeOf(s.I, s.J, s.K, s.k);
    const base = place.map(function (x, d) { return x - c.middle[d]; });   // where this copy's block starts
    const over = function (d) {
      return [Math.ceil((base[d] + c.low[d] - start[d]) / gaps[d] - 0.5 - LINE_SLACK), Math.floor((base[d] + c.high[d] - start[d]) / gaps[d] - 0.5 + LINE_SLACK)];
    };
    const wrapped = function (n) { return ((n % across1) + across1) % across1; };
    const iRange = over(0), jRange = dims === 3 ? over(1) : [0, 0];
    for (let j = jRange[0]; j <= jRange[1]; j++) {
      for (let i = iRange[0]; i <= iRange[1]; i++) {
        const u = start[0] + (i + 0.5) * gaps[0] - base[0], v = dims === 3 ? start[1] + (j + 0.5) * gaps[1] - base[1] : 0;
        const heights = lineCrossings(c, u, v);
        if (heights.length < 2) continue;
        visit(dims === 2 ? wrapped(i) : wrapped(j) * across1 + wrapped(i), heights[heights.length - 1] + base[dims - 1]);
      }
    }
  }

  // The highest top of a floor cell crossed by the line through the
  // point: rows from the floor's top down, until no lower row can reach
  // higher than the best found.
  function floorTopAt(point) {
    let best = -Infinity;
    for (let V = Math.ceil(-lowest / rise) + 1; f.rowTop(V) > best; V--) {
      crossed(point, V, function (s, bottom, top) { if (top > best && isFloor(s)) best = top; });
    }
    return best;
  }

  // The floor's top layer: floor cells, in the window, with a neighbor
  // that is not floor. They are in the rows from just below 0 down to
  // moveRows rows lower (a neighbor is at most that many rows away).
  function floorTop() {
    const found = [];
    for (let V = Math.ceil(-lowest / rise) + 1; f.rowTop(V) >= -(moveRows + 1) * rise; V--) {
      forEachInRow(V, function (s) {
        if (!isFloor(s)) return;
        let edge = false;
        forEachNeighbor(s, function (t) { if (!isFloor(t)) edge = true; });
        if (edge) found.push(s);
      });
    }
    return found;
  }

  // Every site of row V, in the window (with walls: in the strip).
  function forEachInRow(V, visit) {
    for (let k = 0; k < cellCount; k++) {
      if (dims === 3) {
        for (let J = 0; J < L; J++) for (let I = 0; I < L; I++) visit(newSite(I, J, V, k));
        continue;
      }
      const m = lattice.placeOf(0, V, 0, k)[0];      // the middle of block (0, V)'s copy
      for (let I = Math.ceil(-m / across[0] - 1e-9); I * across[0] + m < W - 1e-9; I++) visit(newSite(I, V, 0, k));
    }
  }

  return f;
}


/* =====================================================================
   3. THE SHAPE OF A FALLING TILE
   ---------------------------------------------------------------------
   See the top of this file. In the plane, the tops of T and of
   D = T - T come from their polygons (D's outline: differenceOutline,
   js/sim-tile-shape.js), by upperProfile. A disk is exact: T's top at
   dx is sqrt(r^2 - dx^2), and D is the disk of radius 2r. In space a
   ball is the same with dx^2 + dy^2, and a box with half-widths
   (hx, hy, hz) has D the box with half-widths (2hx, 2hy, 2hz).
   ===================================================================== */

// How many bins upperProfile files a polygon's edges in.
const PROFILE_BINS = 512;

function fallingTile(shape) {
  if (shape.dims === 3) return fallingSolid(shape);
  const r = shape.rhoMax;
  const D = shape.round ? null : differenceOutline(shape);
  const tTop = shape.round ? null : upperProfile(shape.px, shape.py);
  const dTop = shape.round ? null : upperProfile(D.x, D.y);
  const width = shape.maxX - shape.minX;
  return {
    differenceTop: shape.round ? function (dx) { return roundTop(2 * r, dx, 0); } : dTop,
    tileTop: shape.round ? function (dx) { return roundTop(r, dx, 0); } : tTop,
    reach: [width], differenceHeight: shape.maxY - shape.minY, low: shape.minY,
    left: [shape.minX], right: [shape.maxX], size: shape.area,
  };
}

// In space: a ball or a box with its sides along x, y and z.
function fallingSolid(shape) {
  const r = shape.rhoMax;
  if (shape.round) {
    return {
      differenceTop: function (dx, dy) { return roundTop(2 * r, dx, dy); },
      tileTop: function (dx, dy) { return roundTop(r, dx, dy); },
      reach: [2 * r, 2 * r], differenceHeight: 2 * r, low: -r, left: [-r, -r], right: [r, r], size: 4 / 3 * Math.PI * r * r * r,
    };
  }
  if (!shape.box) throw new Error("In 3D the tile must be a ball, or a box with its sides along x, y and z, for now.");
  const low = [shape.px, shape.py, shape.pz].map(function (c) { return Math.min(...c); });
  const high = [shape.px, shape.py, shape.pz].map(function (c) { return Math.max(...c); });
  const [hx, hy, hz] = shape.box;
  return {
    differenceTop: function (dx, dy) { return Math.abs(dx) <= 2 * hx && Math.abs(dy) <= 2 * hy ? 2 * hz : -Infinity; },
    tileTop: function (dx, dy) { return dx >= low[0] && dx <= high[0] && dy >= low[1] && dy <= high[1] ? high[2] : -Infinity; },
    reach: [2 * hx, 2 * hy], differenceHeight: 2 * hz, low: low[2], left: [low[0], low[1]], right: [high[0], high[1]],
    size: 8 * hx * hy * hz,
  };
}

// The top of a disk (ball) of radius R centered at 0 above (dx, dy).
function roundTop(R, dx, dy) {
  const s = R * R - dx * dx - dy * dy;
  return s >= 0 ? Math.sqrt(s) : -Infinity;
}

// The top of the polygon with corners (xs, ys) above the point x = u: the
// highest of its edges there (each edge counted when its ends are on
// either side of the line, as in lineCrossings), or -Infinity if the
// line misses it. The edges are filed in PROFILE_BINS bins across, so
// only the few over u are looked at.
function upperProfile(xs, ys) {
  const n = xs.length, left = Math.min(...xs), right = Math.max(...xs), width = (right - left) || 1;
  const bins = [];
  for (let b = 0; b < PROFILE_BINS; b++) bins.push([]);
  const binOf = function (x) { return Math.min(PROFILE_BINS - 1, Math.max(0, Math.floor((x - left) / width * PROFILE_BINS))); };
  for (let e = 0; e < n; e++) {
    const f = (e + 1) % n;
    for (let b = binOf(Math.min(xs[e], xs[f])); b <= binOf(Math.max(xs[e], xs[f])); b++) bins[b].push(e);
  }
  return function (u) {
    if (u < left || u > right) return -Infinity;
    let best = -Infinity;
    for (const e of bins[binOf(u)]) {
      const f = (e + 1) % n;
      if ((xs[e] <= u) !== (xs[f] <= u)) best = Math.max(best, ys[e] + (u - xs[e]) * (ys[f] - ys[e]) / (xs[f] - xs[e]));
    }
    return best;
  };
}


/* =====================================================================
   4. THE SURFACE
   ---------------------------------------------------------------------
   start(m, height) sets sample m's height before the first particle
   (the floor's), and settle() then takes their mean as the floor's
   level. raise(m, height) lifts sample m to that height, if it is
   higher. mean() is the mean height above the floor's level, width()
   the standard deviation of the heights, highest() the highest. The
   sums of the heights and of their squares are kept up to date.
   ===================================================================== */
function newSurface(count) {
  const h = new Float64Array(count);
  let sum = 0, squares = 0, floor = 0, top = -Infinity;
  const surface = {
    heights: h,
    start: function (m, height) { h[m] = height; },
    settle: function () {
      sum = 0; squares = 0;
      for (const x of h) { sum += x; squares += x * x; }
      floor = sum / count;
      top = Math.max(...h);
    },
    raise: function (m, height) {
      if (!(height > h[m])) return;
      sum += height - h[m];
      squares += height * height - h[m] * h[m];
      h[m] = height;
      if (height > top) top = height;
    },
    mean: function () { return sum / count - floor; },
    width: function () { const mean = sum / count; return Math.sqrt(Math.max(0, squares / count - mean * mean)); },
    highest: function () { return top - floor; },
    floor: function () { return floor; },
  };
  return surface;
}


// What both sims' second threads report (serveGrowth,
// js/sim-cluster.js): the samples for the charts, the mean height and
// the width; and the numbers, those two with the highest point, the
// share of the room under the mean surface that is filled (the
// deposit's area, or volume, over the mean height times the floor's
// area, once the mean height is above 0), the latest particle's fall
// and the strip's widths. "growth" has surface, filled and lastFall.
const DEPOSIT_SAMPLES = ["height", "width"];
function depositSample(growth) { return { height: growth.surface.mean(), width: growth.surface.width() }; }
function depositNumbers(growth, widths) {
  const s = growth.surface, floorArea = widths.reduce(function (a, b) { return a * b; }, 1);
  return {
    height: s.mean(), width: s.width(), highest: s.highest(),
    filledShare: s.mean() > 0 ? growth.filled / (s.mean() * floorArea) : NaN,
    fall: growth.lastFall, widths: widths,
  };
}


/* =====================================================================
   5. THE LIST OF HELPERS, FOR WORKERS
   ===================================================================== */
function depositHelpers() {
  return [cellShapes, flatShape, solidShape, lineCrossings, triangleHeight, insideSide, wallsFit, newFallingLattice,
          fallingTile, fallingSolid, roundTop, upperProfile, newSurface, depositSample, depositNumbers,
          { LINE_SLACK: LINE_SLACK, SAMPLES_PER_BLOCK: SAMPLES_PER_BLOCK, PROFILE_BINS: PROFILE_BINS, DEPOSIT_SAMPLES: DEPOSIT_SAMPLES }];
}
