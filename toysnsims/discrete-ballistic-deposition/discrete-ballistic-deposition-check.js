/* =====================================================================
   discrete-ballistic-deposition-check.js  —  tests for the growth in
   discrete-ballistic-deposition-growth.js and the strip of a lattice
   in js/sim-deposit.js
   ---------------------------------------------------------------------
   Each test runs the growth (newDiscreteDeposit) directly, with fixed
   seeds, and adds a row to the results table (addRow, js/check-page.js):
     1. The classic rule on the square grid: a particle falling down
        column i makes its height max(h(i - 1), h(i) + 1, h(i + 1)),
        with periodic sides and with walls (on the cubic grid, the same
        with 4 neighbors); and the surface's numbers are those of the
        heights h.
     2. Each column equally likely, on the square grid and the cubic
        grid (Pearson's chi-square test).
     3. Where a vertical line crosses the cells: the pieces of the line
        inside the cells tile it (no gaps, no overlaps, since the cells
        tile the plane or space), and each piece is inside its cell
        (a plain point-in-polygon test, or in space a test against each
        face of a convex cell).
     4. Where a particle stops, against a plain search: every cell the
        line crosses, from high above down to the floor, with no early
        stop.
     5. A big deposit, recounted: no cell twice, each cell next to the
        floor or an earlier cell, and the surface recounted from the
        cells.
     6. Coupling: more particles only add cells.
   ===================================================================== */

// The lattices tested, as newDiscreteDeposit's options; "convex": its
// cells are convex polyhedra (for test 3, in space).
function testLattices() {
  return [
    { name: "Z² (2D squares)", options: { dim: 2 } },
    { name: "Triangles (3⁶), tiles", options: { dim: 2, tiling: tilingBlock("3/m30/r(h2)", false) } },
    { name: "Hexagons (6³), tiles", options: { dim: 2, tiling: tilingBlock("6/m30/r(h1)", false) } },
    { name: "Snub hexagonal (3⁴.6), corners", options: { dim: 2, tiling: tilingBlock("6-3-3/r60/r(h5)", true) } },
    { name: "Truncated hexagonal (3.12²), tiles", options: { dim: 2, tiling: tilingBlock("12-3/m30/r(h3)", false) } },
    { name: "Z³ (3D cubes)", options: { dim: 3, block: honeycombBlock(22, "polyhedra") }, convex: true },
    { name: "3D #1, polyhedra", options: { dim: 3, block: honeycombBlock(1, "polyhedra") }, convex: true },
    { name: "3D #1, vertices", options: { dim: 3, block: honeycombBlock(1, "vertices") } },
  ];
}

// A growth on lattice t, L blocks wide, with these sides and seed, grown
// to n particles.
function grownDeposit(t, sides, L, seed, n) {
  const growth = newDiscreteDeposit(Object.assign({ width: L, sides: sides, seed: seed }, t.options));
  while (growth.cluster.count < n) growth.addParticle();
  return growth;
}

// The sides, in words.
function sidesWords(sides) { return sides === "walls" ? "walls" : "periodic sides"; }

// Cell i of a growth's deposit, as a site.
function depositSite(growth, i) {
  const c = growth.cluster;
  return newSite(c.I[i], c.J[i], c.K[i], c.k[i]);
}

// The strip's width (in space, both widths) and blocks across, for the
// tests' sizes: L blocks in the plane, fewer in space.
const PLANE_BLOCKS = 30, SPACE_BLOCKS = 5;
function blocksFor(t) { return t.options.dim === 3 ? SPACE_BLOCKS : PLANE_BLOCKS; }


/* =====================================================================
   1. THE CLASSIC RULE ON THE SQUARE (CUBIC) GRID
   ---------------------------------------------------------------------
   Column i of the square grid is the squares from x = m + i - 1/2 to
   m + i + 1/2, m being the first square's middle (on the cubic grid,
   column (i, j) the same each way), and the floor is the cells whose
   middle is below 0. So the place a particle falls at is over column
   i = floor(x - m + 1/2), and h(i), the number of cells in column i
   above the floor up to its highest, becomes
       max(h(i - 1), h(i) + 1, h(i + 1))
   (on the cubic grid, the largest of h(i, j) + 1 and its 4 neighbors'
   h; F. Family and T. Vicsek, J. Phys. A 18 (1985); A.-L. Barabasi and
   H. E. Stanley, "Fractal Concepts in Surface Growth", Cambridge
   University Press, 1995, Chapter 2): it lands on top of its own
   column, or beside the top of a taller neighbor. Past a wall there is
   no neighbor; with periodic sides column -1 is column L - 1. The
   surface's height above each of its sample points is then h (the top
   of the column's highest cell, less the top of the floor), so its
   mean, width and highest point are those of h.
   ===================================================================== */
function checkClassicRule(t, sides, L, n) {
  const growth = newDiscreteDeposit(Object.assign({ width: L, sides: sides, seed: "classic " + sides }, t.options));
  const space = t.options.dim === 3, m = space ? t.options.block.cells[0].middle : [0, 0];
  const floorRow = Math.ceil(-m[space ? 2 : 1]) - 1, h = new Array(space ? L * L : L).fill(0);
  const column = function (i, j) {
    if (sides === "walls" && (i < 0 || i >= L || j < 0 || j >= L)) return -1;
    return space ? ((j + L) % L) * L + (i + L) % L : (i + L) % L;
  };
  const heightAt = function (i, j) { const c = column(i, j); return c < 0 ? 0 : h[c]; };
  let wrong = 0;
  for (let p = 0; p < n; p++) {
    growth.addParticle();
    const x = growth.lastFall.point, i = Math.floor(x[0] - m[0] + 0.5), j = space ? Math.floor(x[1] - m[1] + 0.5) : 0;
    const height = space ? Math.max(heightAt(i, j) + 1, heightAt(i - 1, j), heightAt(i + 1, j), heightAt(i, j - 1), heightAt(i, j + 1))
                         : Math.max(heightAt(i, 0) + 1, heightAt(i - 1, 0), heightAt(i + 1, 0));
    const s = depositSite(growth, p);
    if (s.I !== i || (space ? s.J !== j || s.K !== floorRow + height : s.J !== floorRow + height)) wrong++;
    h[column(i, j)] = height;
  }
  const mean = h.reduce(function (a, b) { return a + b; }, 0) / h.length;
  const width = Math.sqrt(h.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / h.length);
  const s = growth.surface;
  const off = Math.max(Math.abs(s.mean() - mean), Math.abs(s.width() - width), Math.abs(s.highest() - Math.max(...h)));
  addRow(t.name + ", " + sidesWords(sides) + ": the classic rule " + (space ? "h = max(h + 1, its 4 neighbors' h)" : "h(i) = max(h(i − 1), h(i) + 1, h(i + 1))"),
         wrong === 0 && off < 1e-9,
         n + " particles, " + h.length + " columns: " + wrong + " landed elsewhere than the rule says; the mean height, width and " +
         "highest point are " + fourDigits(off) + " off those of h (mean " + fourDigits(mean) + ", width " + fourDigits(width) + ")");
}


/* =====================================================================
   2. EACH COLUMN EQUALLY LIKELY
   ---------------------------------------------------------------------
   On the empty floor of the square (cubic) grid, particle p lands in
   row 0 of the column it falls down, and each of the L (L^2) columns
   should be equally likely. Particles 0, 1, 2, ... are dropped, none
   added (land(p)), and their columns counted.
   ===================================================================== */
function checkColumns(t, L, runs) {
  const growth = newDiscreteDeposit(Object.assign({ width: L, sides: "periodic", seed: "columns" }, t.options));
  const space = t.options.dim === 3, counts = new Array(space ? L * L : L).fill(0);
  let offRow = 0;
  for (let p = 0; p < runs; p++) {
    const s = growth.land(p).site;
    if ((space ? s.K : s.J) !== 0) offRow++;
    counts[space ? s.J * L + s.I : s.I]++;
  }
  const test = equalChiSquare(counts);
  addRow(t.name + ": each column equally likely", offRow === 0 && test.pValue > 0.001,
         runs + " particles on the empty floor, " + counts.length + " columns: chi-square " + test.statistic.toFixed(1) + " with " +
         test.degrees + " degrees of freedom, p = " + test.pValue.toFixed(3) + "; " + offRow + " landed off row 0");
}


/* =====================================================================
   3. WHERE A VERTICAL LINE CROSSES THE CELLS
   ---------------------------------------------------------------------
   The cells tile the plane (space), so the pieces of a vertical line
   inside them (crossed, js/sim-deposit.js) must cover it with no gaps
   and no overlaps, between a height that only rows from "low" up reach
   and one that only rows up to "high" reach. And the middle of each
   piece must be inside its cell, found plainly: in the plane by
   counting the cell's edges a ray from it crosses (even: outside); in
   space, for a convex cell, by being on the cell's side of each face.
   With periodic sides a cell is kept as its copy in the strip, so the
   point is moved by whole widths to the copy nearest it.
   ===================================================================== */
function checkLinePieces(t, sides, L, lines) {
  const growth = newDiscreteDeposit(Object.assign({ width: L, sides: sides, seed: "pieces" }, t.options));
  const f = growth.fall, random = seededUniform("pieces " + t.name), lattice = growth.lattice;
  const rise = f.rowTop(1) - f.rowTop(0), tall = f.rowTop(0) - f.rowBottom(0);
  const low = -2, high = low + Math.ceil(tall / rise) + 3, from = f.rowTop(low), to = f.rowBottom(high);
  let gaps = 0, overlaps = 0, outside = 0, pieces = 0;
  for (let r = 0; r < lines; r++) {
    const point = f.dropPoint(random.uniform(r, 0), random.uniform(r, 1)), found = [];
    for (let V = low; V <= high; V++) f.crossed(point, V, function (s, bottom, top) { found.push([bottom, top, s]); });
    found.sort(function (a, b) { return a[0] - b[0]; });
    let at = from, first = true;
    for (const [bottom, top, s] of found) {
      pieces++;
      if (!insideCell(lattice, s, point, (bottom + top) / 2, sides === "walls" ? [0, 0] : f.widths, t.convex)) outside++;
      if (top <= from + 1e-9 || bottom >= to - 1e-9) continue;
      if (first) { if (bottom > from + 1e-9) gaps++; first = false; }
      else if (bottom > at + 1e-9) gaps++;
      else if (bottom < at - 1e-9) overlaps++;
      at = top;
    }
    if (at < to - 1e-9) gaps++;
  }
  const convex = t.options.dim === 2 || t.convex;
  addRow(t.name + ", " + sidesWords(sides) + ": the line's pieces in the cells", gaps === 0 && overlaps === 0 && outside === 0,
         lines + " lines, " + pieces + " pieces: " + gaps + " gaps and " + overlaps + " overlaps along the lines; " +
         (convex ? outside + " pieces not inside their cell" : "(these cells' insides aren't tested plainly)"));
}

// Is the point at "height" on the vertical line through "point" inside
// site s (or a copy of it whole widths across, "widths": [W] or [W, W'],
// [0, 0] for none)? Plainly, as described above. In space only convex
// cells are tested (otherwise: true).
function insideCell(lattice, s, point, height, widths, convex) {
  const shifts = function (W) { return W > 0 ? [-W, 0, W] : [0]; };
  if (lattice.dim === 2) {
    const corners = lattice.tiling ? cornersAt(lattice.tiling, s.I, s.J, s.k)
      : [[s.I - 0.5, s.J - 0.5], [s.I + 0.5, s.J - 0.5], [s.I + 0.5, s.J + 0.5], [s.I - 0.5, s.J + 0.5]];
    return shifts(widths[0]).some(function (dx) { return insidePolygon(corners, point[0] + dx, height); });
  }
  const cell = lattice.block.cells[s.k], place = lattice.placeOf(s.I, s.J, s.K, s.k);
  if (!convex) return true;
  const corners = cell.corners.map(function (c) { return c.map(function (x, d) { return x - cell.middle[d] + place[d]; }); });
  return shifts(widths[0]).some(function (dx) {
    return shifts(widths[1]).some(function (dy) { return insideConvex(corners, cell.faces, place, [point[0] + dx, point[1] + dy, height]); });
  });
}

// Is the point (x, y) inside the polygon with these corners? A ray from
// it to the right crosses the edges an odd number of times exactly
// when it is.
function insidePolygon(corners, x, y) {
  let inside = false;
  for (let e = 0; e < corners.length; e++) {
    const [ax, ay] = corners[e], [bx, by] = corners[(e + 1) % corners.length];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
  }
  return inside;
}

// Is the point p inside the convex polyhedron with these corners and
// faces (lists of corner numbers), whose middle is "middle"? It is on
// the middle's side of each face's plane (or on the plane).
function insideConvex(corners, faces, middle, p) {
  return faces.every(function (face) {
    const a = corners[face[0]], b = corners[face[1]], c = corners[face[2]];
    const normal = cross3(sub3(b, a), sub3(c, a));
    const side = function (q) { return dot3(normal, sub3(q, a)); };
    return side(p) * Math.sign(side(middle)) >= -1e-9 * length3(normal);
  });
}


/* =====================================================================
   4. WHERE A PARTICLE STOPS, AGAINST A PLAIN SEARCH
   ---------------------------------------------------------------------
   After n particles, particles n, n + 1, ... are dropped (land(p)),
   none added, and each is compared with a plain search: every piece of
   the line in every row, from above the deposit's highest cell (by more
   than two neighbors can be apart) down to the rows wholly under the
   floor, and of the empty cells next to the deposit or the floor, the
   one whose piece reaches highest. (The pieces don't overlap, test 3,
   so that is the first one the particle meets going down.)
   ===================================================================== */
function checkStop(t, sides, L, n, runs) {
  const growth = grownDeposit(t, sides, L, "stop", n), f = growth.fall, taken = new Set();
  let highRow = 0;
  for (let i = 0; i < n; i++) {
    const s = depositSite(growth, i);
    taken.add(f.keyOf(s));
    highRow = Math.max(highRow, f.rowOf(s));
  }
  const isTaken = function (s) { return f.isFloor(s) || taken.has(f.keyOf(s)); };
  const nextTo = function (s) { let yes = false; f.forEachNeighbor(s, function (u) { if (isTaken(u)) yes = true; }); return yes; };
  let wrong = 0;
  for (let p = n; p < n + runs; p++) {
    const landed = growth.land(p);
    let best = -Infinity, site = null;
    for (let V = highRow + f.moveRows + 2; f.rowTop(V) >= 0; V--) {
      f.crossed(landed.point, V, function (s, bottom, top) {
        if (top > best && !isTaken(s) && nextTo(s)) { best = top; site = s; }
      });
    }
    if (!site || f.keyOf(site) !== f.keyOf(landed.site) || best !== landed.top) wrong++;
  }
  addRow(t.name + ", " + sidesWords(sides) + ": where a particle stops, against a plain search", wrong === 0,
         runs + " particles dropped on a deposit of " + n + ": " + wrong + " stopped elsewhere than the plain search says");
}


/* =====================================================================
   5. A BIG DEPOSIT, RECOUNTED
   ---------------------------------------------------------------------
   No cell is in the deposit twice, and each cell is next to the floor
   or to a cell that came before it. The surface is recounted from the
   cells: above each sample point, the top of the highest piece of its
   line in the floor or the deposit (rows from the top down, until no
   lower row reaches higher); the floor's level is the mean of the
   floor's own tops; and the mean height, width and highest point
   follow (js/sim-deposit.js, section 4).
   ===================================================================== */
function checkBigDeposit(t, sides, L, n) {
  const growth = grownDeposit(t, sides, L, "big deposit", n), f = growth.fall, taken = new Set();
  let twice = 0, alone = 0, highRow = 0;
  for (let i = 0; i < n; i++) {
    const s = depositSite(growth, i), key = f.keyOf(s);
    let touches = false;
    f.forEachNeighbor(s, function (u) { if (f.isFloor(u) || taken.has(f.keyOf(u))) touches = true; });
    if (taken.has(key) || f.isFloor(s)) twice++;
    if (!touches) alone++;
    taken.add(key);
    highRow = Math.max(highRow, f.rowOf(s));
  }
  const topAt = function (point, counts) {
    let best = -Infinity;
    for (let V = highRow + f.moveRows + 2; f.rowTop(V) > best; V--) {
      f.crossed(point, V, function (s, bottom, top) { if (top > best && counts(s)) best = top; });
    }
    return best;
  };
  const tops = f.samples.map(function (point) { return topAt(point, function (s) { return f.isFloor(s) || taken.has(f.keyOf(s)); }); });
  const floorTops = f.samples.map(function (point) { return topAt(point, f.isFloor); });
  const count = tops.length, average = function (list) { return list.reduce(function (a, b) { return a + b; }, 0) / count; };
  const mean = average(tops), width = Math.sqrt(average(tops.map(function (h) { return (h - mean) * (h - mean); })));
  const level = average(floorTops), s = growth.surface;
  let heightsOff = 0;
  tops.forEach(function (h, m) { heightsOff = Math.max(heightsOff, Math.abs(h - s.heights[m])); });
  const numbersOff = Math.max(Math.abs(s.mean() - (mean - level)), Math.abs(s.width() - width), Math.abs(s.highest() - (Math.max(...tops) - level)));
  addRow(t.name + ", " + sidesWords(sides) + ": a deposit of " + n + " particles, recounted",
         twice === 0 && alone === 0 && heightsOff < 1e-9 && numbersOff < 1e-9,
         twice + " cells taken twice (or in the floor), " + alone + " not next to the floor or an earlier cell; the surface's " +
         count + " heights are " + fourDigits(heightsOff) + " off, its mean height, width and highest point " + fourDigits(numbersOff) + " off");
}


/* =====================================================================
   6. COUPLING
   ===================================================================== */
function checkCoupling(t, L, n, more) {
  const small = grownDeposit(t, "periodic", L, "coupling", n), big = grownDeposit(t, "periodic", L, "coupling", n + more);
  const other = grownDeposit(t, "periodic", L, "another seed", n);
  const key = function (g, i) { return g.fall.keyOf(depositSite(g, i)); };
  let same = true, differ = false;
  for (let i = 0; i < n; i++) {
    if (key(small, i) !== key(big, i)) same = false;
    if (key(other, i) !== key(small, i)) differ = true;
  }
  addRow(t.name + ": more particles only add cells", same && differ,
         "the first " + n + " cells of " + (n + more) + " particles " + (same ? "are" : "are NOT") + " the deposit of " + n +
         "; another seed " + (differ ? "gives another deposit" : "gives the SAME deposit"));
}


function allTests() {
  const lattices = testLattices(), squares = lattices[0], cubes = lattices[5];
  const tests = [
    function () { checkClassicRule(squares, "periodic", 40, 4000); },
    function () { checkClassicRule(squares, "walls", 40, 4000); },
    function () { checkClassicRule(cubes, "periodic", 8, 4000); },
    function () { checkClassicRule(cubes, "walls", 8, 4000); },
    function () { checkColumns(squares, 20, 20000); },
    function () { checkColumns(cubes, 5, 20000); },
  ];
  for (const t of lattices) {
    const L = blocksFor(t), n = t.options.dim === 3 ? 400 : 1500;
    const sides = t.name === squares.name || t.name === cubes.name ? ["periodic", "walls"] : ["periodic"];
    for (const side of sides) {
      tests.push(function () { checkLinePieces(t, side, L, 1000); });
      tests.push(function () { checkStop(t, side, L, n, 200); });
      tests.push(function () { checkBigDeposit(t, side, L, n); });
    }
    tests.push(function () { checkCoupling(t, L, n / 2, n / 2); });
  }
  return tests;
}

runChecksOnClick(allTests);
