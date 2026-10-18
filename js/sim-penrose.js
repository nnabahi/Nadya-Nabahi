/* =====================================================================
   sim-penrose.js  —  Penrose tilings, built exactly
   ---------------------------------------------------------------------
   Penrose's tilings of the plane never repeat: no shift moves one onto
   itself (R. Penrose, Bull. Inst. Math. Appl. 10 (1974) 266-271, and
   "Pentaplexity", Math. Intelligencer 2 (1979) 32-37; B. Grunbaum and
   G. C. Shephard, Tilings and Patterns, 1987, Sec. 10.3, "G&S" below).
   Two of them are here:
     P2  kites and darts. Both have sides 1 and phi (phi = (1 + sqrt 5)/2,
         the golden ratio); the kite's corners are 72, 72, 72 and 144
         degrees, the dart's 72, 36, 216 and 36.
     P3  rhombs with sides 1: thick (corners 72 and 108 degrees) and thin
         (36 and 144).

   HOW THEY ARE BUILT. Cut every tile in half along its line of mirror
   symmetry. The halves are triangles of just two shapes, "Robinson
   triangles" (G&S Sec. 10.3): one with corners 36, 72, 72 degrees and
   one with corners 108, 36, 36. A half-kite and a thin half-rhomb are
   the first shape, a half-dart and a thick half-rhomb the second. Each
   triangle splits into smaller triangles of the same two shapes, phi
   times smaller ("deflation", section 2 has the rules). So: start from
   a few big triangles around the middle, split them again and again
   until the halves are the size wanted, then put the halves back
   together into tiles (a half whose other half fell outside the patch
   is left out). The start is the 5-fold symmetric "sun" (5 kites
   around a point) for P2, and for P3 a wheel of 10 thin half-rhombs;
   the tiling then has 5-fold symmetry around the middle of the
   picture.

   EXACT NUMBERS. Every side of every tile points in one of 10
   directions, the multiples of 36 degrees. Write zeta for the point at
   72 degrees on the circle of radius 1 (as a complex number). The
   sides of length 1 are then +-1, +-zeta, +-zeta^2, +-zeta^3 and
   +-zeta^4, and every corner is a whole-number combination of those.
   Since 1 + zeta + zeta^2 + zeta^3 + zeta^4 = 0, every such point is
       a + b zeta + c zeta^2 + d zeta^3
   with whole numbers a, b, c, d, in exactly one way (zeta is a root of
   no smaller whole-number polynomial than 1 + x + x^2 + x^3 + x^4: S.
   Lang, Algebra, 3rd ed., Springer, 2002, Ch. VI, Thm. 3.1). Splitting a
   triangle needs "1/phi of the way from p to q", and 1/phi = phi - 1 =
   zeta + zeta^4 is such a number too, so the splitting never needs a
   fraction: every corner is worked out exactly, and two corners are
   the same only when their four whole numbers are equal. (The numbers
   stay small, about as big as the distance from the middle.)

   WHAT COMES OUT. penroseBlock(kind, corners) returns the tiling ("P2"
   or "P3"; with corners true, its corners are the cells, as
   cornersBlock does for the tilings by regular polygons) in the form
   the sims use (as uprightBlock, js/sim-tilings.js, gives):
     cells   the cells of a patch around the middle, each { sides,
             corners (counterclockwise), middle, next, name ("kite",
             "dart", "thin rhomb", "thick rhomb" or "corner") },
             next[e] = [k, 0, 0] saying that across side e is cell k,
             or [-1, 0, 0] past the patch's edge
     a, b    steps far beyond the patch (the patch is one block, never
             repeated; a box only ever uses the block at (0, 0))
     finite  true: tilingBox (js/sim-domains.js) centers a box on the
             patch's middle, and there is no torus
   growPenrose(tiling, X, Y) makes the patch hold every cell in the
   rectangle |x| <= X, |y| <= Y around the middle, keeping every cell's
   number, so a box of any size can be cut from it. penroseCornerKinds
   (kind, half) counts the kinds of corner (for the check page).
   PENROSE_TILINGS lists the tilings for the Lattice menus, and
   penroseFromCode(code, corners) builds one from its code there.

   Contents:
     1. Exact numbers
     2. Robinson triangles, and how each one splits
     3. From triangles to tiles
     4. The tiles, or the corners, as cells
     5. The block for the sims, and growing it
     6. The kinds of corner
     7. In the menus
   ===================================================================== */


/* =====================================================================
   1. EXACT NUMBERS
   ---------------------------------------------------------------------
   A point a + b zeta + c zeta^2 + d zeta^3 (see the top of this file)
   is the list [a, b, c, d] of whole numbers.
   ===================================================================== */

// zeta^0 .. zeta^4 (zeta^4 = -1 - zeta - zeta^2 - zeta^3).
const ZETA_POWERS = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [-1, -1, -1, -1]];

function zPlus(p, q) { return [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]]; }
function zMinus(p, q) { return [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]]; }

// p times zeta (p turned by 72 degrees), and p times zeta^4 = 1/zeta
// (turned back by 72 degrees), using zeta^4 = -1 - zeta - zeta^2 - zeta^3.
function zTurn(p) { return [-p[3], p[0] - p[3], p[1] - p[3], p[2] - p[3]]; }
function zTurnBack(p) { return [p[1] - p[0], p[2] - p[0], p[3] - p[0], -p[0]]; }

// p / phi = p (zeta + zeta^4), since 1/phi = phi - 1 = 2 cos 72 degrees.
function zOverPhi(p) { return zPlus(zTurn(p), zTurnBack(p)); }

// p times phi^n (n >= 0): phi = 1 + 1/phi.
function zTimesPhi(p, n) {
  for (let k = 0; k < n; k++) p = zPlus(p, zOverPhi(p));
  return p;
}

// The point 1/phi of the way from p to q: p + zOverPhi(q - p), worked
// out in one go (this is most of the work of splitting).
function zTowards(p, q) {
  const d0 = q[0] - p[0], d1 = q[1] - p[1], d2 = q[2] - p[2], d3 = q[3] - p[3];
  return [p[0] - d0 + d1 - d3, p[1] + d2 - d3, p[2] - d0 + d1, p[3] - d0 + d2 - d3];
}

// The side of length 1 pointing at 36 k degrees: (-1)^k zeta^(3k mod 5)
// (36 degrees is half of 72, and minus a point turns it half a turn).
function zUnit(k) {
  k = ((k % 10) + 10) % 10;
  const v = ZETA_POWERS[(3 * k) % 5];
  return k % 2 === 1 ? v.map(function (x) { return -x; }) : v.slice();
}

// A name for the point p, or with q for the point p + q (equal points,
// equal names): its four whole numbers packed into one number, 13 bits
// each. That holds them while they are between -4096 and 4095; they
// stay below 400 in the biggest patch a sim asks for, and twice that
// for the sum of two points.
function zKey(p, q) {
  let key = 0;
  for (let j = 0; j < 4; j++) {
    const x = q ? p[j] + q[j] : p[j];
    if (x < -4096 || x > 4095) throw new Error("This Penrose patch is too big.");
    key = key * 8192 + x + 4096;
  }
  return key;
}

// The point as ordinary numbers: x, y, or [x, y].
const ZETA_X = [0, 1, 2, 3].map(function (j) { return Math.cos(j * 2 * Math.PI / 5); });
const ZETA_Y = [0, 1, 2, 3].map(function (j) { return Math.sin(j * 2 * Math.PI / 5); });
function zX(p) { return p[0] + p[1] * ZETA_X[1] + p[2] * ZETA_X[2] + p[3] * ZETA_X[3]; }
function zY(p) { return p[1] * ZETA_Y[1] + p[2] * ZETA_Y[2] + p[3] * ZETA_Y[3]; }
function zToNumbers(p) { return [zX(p), zY(p)]; }


/* =====================================================================
   2. ROBINSON TRIANGLES, AND HOW EACH ONE SPLITS
   ---------------------------------------------------------------------
   A triangle is { kind, a, b, c } with exact points a, b, c:
     P3  "thin"  half a thin rhomb: a is the 36 degree corner, b and c
                 the ends of the side shared with the other half
         "thick" half a thick rhomb: a is the 108 degree corner, b and c
                 as for "thin"
     P2  "kite"  half a kite: a its tip (the 72 degree corner on the
                 line of symmetry), b its side corner, c the 144 degree
                 corner (the line of symmetry is a to c)
         "dart"  half a dart: a its 216 degree corner, b its side corner,
                 c its tip (the line of symmetry is a to c)
   Each splits into triangles phi times smaller, each with its own
   kind, as below. The rhombs' rules are the usual ones (as in G&S
   Sec. 10.3). For the kite and the dart they are the usual "a kite
   becomes two kites and two half-darts, a dart one kite and two
   half-darts" (G&S Sec. 10.3), cut in half:
     half-kite  mark p at 1/phi of the way from the tip a to c, and q at
                1/phi of the way from the side corner b to a. The two
                halves of a whole kite, with its tip at b, and half a
                dart, whose other half is across the old side a-b.
     half-dart  mark r at 1/phi of the way from the tip c to b. Half a
                kite, with its tip at c (its other half is in the
                dart's other half), and half a dart.
   The check page checks that every half finds its other half, that the
   tiles leave no gaps and don't overlap, and that every corner is one
   of the kinds a Penrose tiling may have.
   ===================================================================== */

function triangle(kind, a, b, c) { return { kind: kind, a: a, b: b, c: c }; }

const SPLIT = {
  thin: function (t) {
    const p = zTowards(t.a, t.b);
    return [triangle("thin", t.c, p, t.b), triangle("thick", p, t.c, t.a)];
  },
  thick: function (t) {
    const q = zTowards(t.b, t.a), r = zTowards(t.b, t.c);
    return [triangle("thick", r, t.c, t.a), triangle("thick", q, r, t.b), triangle("thin", r, q, t.a)];
  },
  kite: function (t) {
    const p = zTowards(t.a, t.c), q = zTowards(t.b, t.a);
    return [triangle("kite", t.b, q, p), triangle("kite", t.b, t.c, p), triangle("dart", q, p, t.a)];
  },
  dart: function (t) {
    const r = zTowards(t.c, t.b);
    return [triangle("kite", t.c, r, t.a), triangle("dart", r, t.a, t.b)];
  },
};

// The triangles to start from, n splits before the halves are the size
// wanted (so they are phi^n times bigger):
//   P2  the sun: 5 kites around the middle, tips there, sides phi^n and
//       phi^(n+1) (so in the end the kites have sides 1 and phi)
//   P3  10 thin halves around the middle, every other one mirrored,
//       sides phi^n (in the end, rhombs with sides 1)
// Two splits bring the middle back turned by 36 degrees (section 5), so
// the start is turned by 36 degrees for n = 2, 3, 6, 7, ...: then the
// tiling comes out the same for every n.
function startTriangles(kind, n) {
  const middle = [0, 0, 0, 0], turn = Math.floor(n / 2) % 2, out = [];
  if (kind === "P2") {
    for (let i = 0; i < 5; i++) {
      const bottom = zTimesPhi(zUnit(2 * i + turn), n + 1);
      out.push(triangle("kite", middle, zTimesPhi(zUnit(2 * i - 1 + turn), n + 1), bottom));
      out.push(triangle("kite", middle, zTimesPhi(zUnit(2 * i + 1 + turn), n + 1), bottom));
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const b = zTimesPhi(zUnit(i + turn), n), c = zTimesPhi(zUnit(i + 1 + turn), n);
      out.push(i % 2 === 0 ? triangle("thin", middle, c, b) : triangle("thin", middle, b, c));
    }
  }
  return out;
}

// The triangles after enough splits to cover the rectangle |x| <= X,
// |y| <= Y around the middle, leaving out each triangle that misses it
// (and with it the smaller ones it would split into, which lie inside
// it).
function splitTriangles(kind, X, Y) {
  const n = splitsToCover(kind, Math.hypot(X, Y));
  let triangles = startTriangles(kind, n);
  for (let k = 0; k < n; k++) {
    const next = [];
    for (const t of triangles) {
      for (const s of SPLIT[t.kind](t)) if (mightReach(s, X, Y)) next.push(s);
    }
    triangles = next;
  }
  return triangles;
}

// Might the triangle reach into the rectangle |x| <= X, |y| <= Y? Not
// if the box around its corners misses it.
function mightReach(t, X, Y) {
  return Math.min(zX(t.a), zX(t.b), zX(t.c)) <= X && Math.max(zX(t.a), zX(t.b), zX(t.c)) >= -X &&
         Math.min(zY(t.a), zY(t.b), zY(t.c)) <= Y && Math.max(zY(t.a), zY(t.b), zY(t.c)) >= -Y;
}

// The fewest splits whose start covers the disk of this radius around
// the middle (an even number of them: section 5). The start's 10
// corners are phi^n (P3) or phi^(n+1) (P2) from the middle, so it
// reaches at least cos 18 degrees of that all round.
function splitsToCover(kind, radius) {
  const phi = (1 + Math.sqrt(5)) / 2;
  let n = 0;
  while (Math.pow(phi, kind === "P2" ? n + 1 : n) * Math.cos(Math.PI / 10) < radius) n += 2;
  return n;
}


/* =====================================================================
   3. FROM TRIANGLES TO TILES
   ---------------------------------------------------------------------
   Two halves of a rhomb share their side b-c; two halves of a kite or
   a dart share their line of symmetry a-c. A tile is { key, kind, name,
   corners (exact, counterclockwise), points (the same as ordinary
   numbers), middle }.
   ===================================================================== */

const TILE_NAMES = { kite: "kite", dart: "dart", thin: "thin rhomb", thick: "thick rhomb" };

// Which halves belong together: twice the middle of the side they share
// (b-c for a rhomb, a-c for a kite or a dart). That point is inside the
// tile, so no other tile has it: it names the tile.
function halfKey(t) {
  return t.kind === "thin" || t.kind === "thick" ? zKey(t.b, t.c) : zKey(t.a, t.c);
}

// The tiles the triangles make: each pair of halves put together (a
// half whose other half was left out makes none).
function tilesOf(triangles) {
  const waiting = new Map(), tiles = [];
  for (const t of triangles) {
    const key = halfKey(t), s = waiting.get(key);
    if (s === undefined) { waiting.set(key, t); continue; }
    waiting.delete(key);
    // Around the tile: a rhomb is s.a, s.b, t.a, s.c; a kite is its tip,
    // a side corner, its 144 degree corner, the other side corner; a
    // dart likewise.
    let corners = (s.kind === "thin" || s.kind === "thick") ? [s.a, s.b, t.a, s.c] : [s.a, s.b, s.c, t.b];
    if (signedArea(corners.map(zToNumbers)) < 0) corners.reverse();
    corners = startingFromSmallest(corners);
    const points = corners.map(zToNumbers);
    tiles.push({ key: key, kind: s.kind, name: TILE_NAMES[s.kind], corners: corners, points: points,
                 middle: centerOfMass(points) });
  }
  return tiles;
}

// The corners, going around the same way, starting from the one with
// the smallest name: so a tile's sides are numbered the same in every
// patch, whichever of its halves came first.
function startingFromSmallest(corners) {
  const keys = corners.map(function (p) { return zKey(p); });
  const first = keys.indexOf(Math.min(...keys));
  return corners.slice(first).concat(corners.slice(0, first));
}

// The area of a polygon given by its corners (as ordinary numbers),
// positive when they go counterclockwise ("shoelace formula").
function signedArea(points) {
  let twice = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k], q = points[(k + 1) % points.length];
    twice += p[0] * q[1] - q[0] * p[1];
  }
  return twice / 2;
}

// The middle of a polygon: its center of mass (inside it for every tile
// here, the dart included).
function centerOfMass(points) {
  let area = 0, x = 0, y = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k], q = points[(k + 1) % points.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    area += cross; x += (p[0] + q[0]) * cross; y += (p[1] + q[1]) * cross;
  }
  return [x / (3 * area), y / (3 * area)];
}


/* =====================================================================
   4. THE TILES, OR THE CORNERS, AS CELLS
   ---------------------------------------------------------------------
   A cell is { key, name, corners, middle, sideKeys }, then "next" from
   linkCells. The corners as cells are as for the tilings by regular
   polygons (cornersBlock, js/sim-tilings.js): each corner of the tiling
   becomes a cell, whose own corners are the middles of the tiles around
   it, and two corners are neighbors when a side of a tile joins them.
   ===================================================================== */

// The tiles as cells.
function tileCells(tiles) {
  return linkCells(tiles.map(function (tile) {
    const n = tile.corners.length;
    return { key: tile.key, name: tile.name, corners: tile.points, middle: tile.middle,
             sideKeys: tile.corners.map(function (p, e) { return sideKey(p, tile.corners[(e + 1) % n]); }) };
  }));
}

// A name for the side from p to q: twice its middle (no two sides of a
// tiling have the same middle).
function sideKey(p, q) { return zKey(p, q); }

// Fill in each cell's "next" from the names of its sides: next[e] =
// [k, 0, 0], k the other cell with side e, or -1. Two cells share a
// side exactly when they are neighbors. (Every tile has 4 sides.)
function linkCells(cells) {
  const first = new Map();   // side -> 4 k + e, for the first cell k found with it as side e
  cells.forEach(function (cell, k) {
    cell.next = cell.sideKeys.map(function () { return [-1, 0, 0]; });
    cell.sideKeys.forEach(function (side, e) {
      const seen = first.get(side);
      if (seen === undefined) { first.set(side, 4 * k + e); return; }
      first.delete(side);
      const k2 = Math.floor(seen / 4);
      cell.next[e][0] = k2;
      cells[k2].next[seen % 4][0] = k;
    });
    delete cell.sideKeys;
  });
  return cells;
}

// The corners in the rectangle |x| <= X, |y| <= Y, as cells: for each,
// the middles of the tiles around it, in order counterclockwise. The
// tiles must reach 2 farther (a tile is less than 2 across), so that
// they go all the way around each corner.
function cornerCells(tiles, X, Y) {
  const tileLinks = tileCells(tiles);
  const number = new Int32Array(4 * tiles.length).fill(-1);   // the cell at corner e of tile t
  const cells = [];
  tiles.forEach(function (tile, t) {
    tile.corners.forEach(function (p, e) {
      const [x, y] = tile.points[e];
      if (number[4 * t + e] >= 0 || Math.abs(x) > X || Math.abs(y) > Y) return;
      const around = aroundCorner(tiles, tileLinks, t, e);
      for (const [t2, e2] of around) number[4 * t2 + e2] = cells.length;
      cells.push({ key: zKey(p), name: "corner", around: around, middle: tile.points[e],
                   corners: around.map(function ([t2]) { return tiles[t2].middle; }) });
    });
  });
  // New side e, from the middle of tile e around the corner to the
  // middle of tile e + 1, crosses the side between them, from this
  // corner to the corner before it in tile e: that one is the neighbor.
  for (const cell of cells) {
    cell.next = cell.around.map(function ([t, e]) { return [number[4 * t + (e + 3) % 4], 0, 0]; });
    delete cell.around;
  }
  return cells;
}

// The tiles around corner e of tile t, counterclockwise, each as [the
// tile's number, which of its corners this is], starting from the tile
// with the smallest name (so the corner's sides are numbered the same
// in every patch). A tile reaches counterclockwise round the corner
// from its side to the corner after this one to its side to the corner
// before it (side e - 1), and the next tile around is the one across
// that side.
function aroundCorner(tiles, tileLinks, t, e) {
  const p = zKey(tiles[t].corners[e]), start = t, around = [];
  do {
    around.push([t, e]);
    t = tileLinks[t].next[(e + 3) % 4][0];
    if (t < 0) throw new Error("A corner of a Penrose patch has a gap around it.");
    e = tiles[t].corners.findIndex(function (q) { return zKey(q) === p; });
  } while (t !== start);
  const keys = around.map(function ([t2]) { return tiles[t2].key; });
  const first = keys.indexOf(Math.min(...keys));
  return around.slice(first).concat(around.slice(0, first));
}


/* =====================================================================
   5. THE BLOCK FOR THE SIMS, AND GROWING IT
   ---------------------------------------------------------------------
   The patch is grown by starting again with more splits (from bigger
   triangles, so the tiles stay the same size). Two splits bring the
   start back, turned by 36 degrees: the sun splits into a star (5
   darts, tips at the middle) and that into a turned sun, and the wheel
   of thin halves comes back the same way. With the start turned to
   match (section 2), the patches of the same kind agree where they
   overlap (the check page checks this), so a grown patch keeps the old
   cells' numbers. The number of splits goes up by two at a time.
   ===================================================================== */

// The tiling "P2" or "P3" (with corners true, its corners as cells), as
// a block for the sims (see the top of this file), with a small patch
// to start with.
function penroseBlock(kind, corners) {
  const block = { code: "Penrose " + kind, a: [1, 0], b: [0, 1], rectangle: true, cells: [], vertexTypes: [],
                  corners: Boolean(corners), finite: true, penrose: kind, X: 0, Y: 0 };
  growPenrose(block, 10, 10);
  return block;
}

// Make the block hold every cell whose middle is in the rectangle
// |x| <= X, |y| <= Y around the middle of the tiling (in side lengths),
// as well as those it held already. Those keep their numbers; new ones
// are numbered after them.
function growPenrose(block, X, Y) {
  X = Math.max(X, block.X);
  Y = Math.max(Y, block.Y);
  if (X === block.X && Y === block.Y) return;
  const fresh = penroseCells(block.penrose, block.corners, X, Y);
  const place = new Map(block.cells.map(function (cell, k) { return [cell.key, k]; }));
  const order = new Array(block.cells.length).fill(-1), later = [];
  fresh.forEach(function (cell, k) {
    if (place.has(cell.key)) order[place.get(cell.key)] = k; else later.push(k);
  });
  if (order.includes(-1)) throw new Error("A grown Penrose patch lost a cell of the smaller one.");
  const sorted = order.concat(later), newNumber = new Int32Array(fresh.length);
  sorted.forEach(function (k, n) { newNumber[k] = n; });
  for (const cell of fresh) {
    cell.sides = cell.corners.length;
    for (const across of cell.next) if (across[0] >= 0) across[0] = newNumber[across[0]];
  }
  block.cells = sorted.map(function (k) { return fresh[k]; });
  block.X = X;
  block.Y = Y;
  // The block is never repeated in a box: its steps are well beyond it.
  block.a = [4 * (X + Y), 0];
  block.b = [0, 4 * (X + Y)];
}

// The cells whose middles are in the rectangle |x| <= X, |y| <= Y: the
// tiling's tiles, or (corners true) its corners.
function penroseCells(kind, corners, X, Y) {
  return corners ? cornerCells(penroseTiles(kind, X + 2, Y + 2), X, Y) : tileCells(penroseTiles(kind, X, Y));
}

// The tiles whose middles are in the rectangle |x| <= X, |y| <= Y. A
// tile is less than 2 across, so both its halves reach into the
// rectangle 2 bigger each way, and are kept.
function penroseTiles(kind, X, Y) {
  return tilesOf(splitTriangles(kind, X + 2, Y + 2)).filter(function (tile) {
    return Math.abs(tile.middle[0]) <= X && Math.abs(tile.middle[1]) <= Y;
  });
}


/* =====================================================================
   6. THE KINDS OF CORNER (for the check page)
   ---------------------------------------------------------------------
   The tiles may meet at a corner in only a few ways:
     P2  Conway's seven (named in M. Gardner, Scientific American 236,
         January 1977, 110-121; G&S Sec. 10.3), told apart by which
         corners of which tiles meet there. A kite's "tip" is its
         corner on its line of symmetry opposite the 144 degree one
         ("bottom"); a dart's "tip" is its 72 degree corner, its
         "inner" corner the 216 degree one; the rest are "sides".
     P3  de Bruijn's eight (N. G. de Bruijn, Indag. Math. 43 (1981)
         39-66), told apart by the angles going around (the smallest
         way to write them, turning or mirroring), so that two of them,
         S and S5, look the same: five 72 degree corners.
   ===================================================================== */

const PENROSE_CORNERS = {
  P2: {
    sun: "kite tip, kite tip, kite tip, kite tip, kite tip",
    star: "dart tip, dart tip, dart tip, dart tip, dart tip",
    ace: "dart inner, kite side, kite side",
    deuce: "dart side, dart side, kite bottom, kite bottom",
    jack: "dart side, dart side, kite bottom, kite tip, kite tip",
    queen: "dart tip, kite side, kite side, kite side, kite side",
    king: "dart tip, dart tip, dart tip, kite side, kite side",
  },
  P3: {
    "S or S5": "72.72.72.72.72",
    S3: "36.36.72.36.36.72.72",
    S4: "36.36.72.72.72.72",
    J: "108.108.36.72.36",
    Q: "144.144.72",
    K: "144.72.72.72",
    D: "108.108.144",
  },
};

// The kinds of corner of the tiling "P2" or "P3" in the square
// |x|, |y| <= half around its middle: a Map from the kind's name
// (PENROSE_CORNERS) to how many there are. A corner of no such kind is
// named by what meets there.
function penroseCornerKinds(kind, half) {
  const at = new Map();   // corner -> its point and [ { direction, angle, role } ]
  for (const tile of penroseTiles(kind, half + 2, half + 2)) {
    const angles = cornerAngles(tile.points), roles = cornerRoles(tile.kind, angles), n = tile.points.length;
    tile.corners.forEach(function (p, e) {
      const key = zKey(p), [x, y] = tile.points[e], [ax, ay] = tile.points[(e + 1) % n];
      if (!at.has(key)) at.set(key, { point: tile.points[e], list: [] });
      at.get(key).list.push({ direction: Math.atan2(ay - y, ax - x), angle: angles[e], role: roles[e] });
    });
  }
  const kinds = new Map();
  for (const corner of at.values()) {
    if (Math.abs(corner.point[0]) > half || Math.abs(corner.point[1]) > half) continue;
    const name = cornerKindName(kind, corner.list.sort(function (s, t) { return s.direction - t.direction; }));
    kinds.set(name, (kinds.get(name) || 0) + 1);
  }
  return kinds;
}

// The angles of a polygon at its corners, in whole degrees.
function cornerAngles(points) {
  const n = points.length;
  return points.map(function ([x, y], e) {
    const [bx, by] = points[(e + n - 1) % n], [ax, ay] = points[(e + 1) % n];
    const turn = Math.atan2(by - y, bx - x) - Math.atan2(ay - y, ax - x);
    return Math.round((turn * 180 / Math.PI + 720) % 360);
  });
}

// Which corner of its tile each corner is, as PENROSE_CORNERS names it:
// for a rhomb, just its angle; for a kite or a dart, from where its
// biggest corner is.
function cornerRoles(kind, angles) {
  if (kind === "thin" || kind === "thick") return angles.map(String);
  const big = angles.indexOf(Math.max(...angles));   // the kite's bottom, the dart's inner corner
  return angles.map(function (angle, e) {
    if (e === big) return kind === "kite" ? "kite bottom" : "dart inner";
    return kind + (e === (big + 2) % 4 ? " tip" : " side");
  });
}

// The name of the kind of corner with these tiles' corners going around
// it (each { angle, role }).
function cornerKindName(kind, list) {
  const total = list.reduce(function (sum, s) { return sum + s.angle; }, 0);
  if (total !== 360) return "a gap or an overlap (the angles add up to " + total + " degrees)";
  const what = kind === "P2" ? list.map(function (s) { return s.role; }).sort().join(", ")
                             : smallestRotation(list.map(function (s) { return s.angle; }));
  const names = PENROSE_CORNERS[kind];
  return Object.keys(names).find(function (name) { return names[name] === what; }) || "not a Penrose corner: " + what;
}

// The smallest way to write a list going around, turned or mirrored.
function smallestRotation(list) {
  let best = null;
  for (const way of [list, list.slice().reverse()]) {
    for (let k = 0; k < way.length; k++) {
      const name = way.slice(k).concat(way.slice(0, k)).join(".");
      if (best === null || name < best) best = name;
    }
  }
  return best;
}


/* =====================================================================
   7. IN THE MENUS
   ---------------------------------------------------------------------
   The Lattice menus (addTilingOptions, js/sim-tilings.js) list these
   after the tilings by regular polygons, on the pages that load this
   file. Their "code" goes in the code box (they have no GomJau-Hogg
   code, since they never repeat), and readTiling (js/sim-controls.js)
   builds them from it.
   ===================================================================== */

const PENROSE_TILINGS = [
  { name: "Kites and darts (P2)", code: "Penrose P2", kinds: "penrose" },
  { name: "Rhombs (P3)", code: "Penrose P3", kinds: "penrose" },
];

// The Penrose tiling with this code ("Penrose P2" or "Penrose P3"), or
// null if the code is none of them.
function penroseFromCode(code, corners) {
  const tiling = PENROSE_TILINGS.find(function (t) { return t.code === code; });
  return tiling ? penroseBlock(code.slice(-2), corners) : null;
}
