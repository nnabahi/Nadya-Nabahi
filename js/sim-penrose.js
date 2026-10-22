/* =====================================================================
   sim-penrose.js  —  Penrose tilings, built exactly
   ---------------------------------------------------------------------
   Penrose's tilings of the plane never repeat: no shift moves one onto
   itself (R. Penrose, Bull. Inst. Math. Appl. 10 (1974) 266-271, and
   "Pentaplexity", Math. Intelligencer 2 (1979) 32-37; B. Grunbaum and
   G. C. Shephard, Tilings and Patterns, 1987, Sec. 10.3, "G&S" below).
   All three of them are here:
     P1  pentagons, stars, boats and diamonds, all with sides 1: regular
         pentagons, five-pointed stars, "boats" (three points of a star)
         and thin "diamonds" (rhombs with corners 36 and 144 degrees).
     P2  kites and darts. Both have sides 1 and phi (phi = (1 + sqrt 5)/2,
         the golden ratio); the kite's corners are 72, 72, 72 and 144
         degrees, the dart's 72, 36, 216 and 36.
     P3  rhombs with sides 1: thick (corners 72 and 108 degrees) and thin
         (36 and 144).

   HOW THEY ARE BUILT. For P2 and P3, cut every tile in half along its
   line of mirror symmetry. The halves are triangles of just two shapes,
   "Robinson triangles" (G&S Sec. 10.3): one with corners 36, 72, 72
   degrees and one with corners 108, 36, 36. A half-kite and a thin
   half-rhomb are the first shape, a half-dart and a thick half-rhomb
   the second. Each triangle splits into smaller triangles of the same
   two shapes, phi times smaller ("deflation", section 2 has the rules).
   So: start from a few big triangles around the middle, split them
   again and again until the halves are the size wanted, then put the
   halves back together into tiles (a half whose other half fell
   outside the patch is left out). The start is the 5-fold symmetric
   "sun" (5 kites around a point) for P2, and for P3 a wheel of 10 thin
   half-rhombs; the tiling then has 5-fold symmetry around the middle
   of the picture. P1 is built the way Penrose found it: each of its
   tiles splits into tiles phi^2 times smaller (section 3), starting
   from one big pentagon whose middle is the middle of the picture.

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
   stay small, about as big as the distance from the middle, except
   for P1's first few big tiles.)

   WHAT COMES OUT. penroseBlock(kind, corners) returns the tiling ("P1",
   "P2" or "P3"; with corners true, its corners are the cells, as
   cornersBlock does for the tilings by regular polygons, but for P1)
   in the form the sims use (as uprightBlock, js/sim-tilings.js, gives):
     cells   the cells of a patch around the middle, each { sides,
             corners (counterclockwise), middle, next, name ("pentagon",
             "star", "boat", "diamond", "kite", "dart", "thin rhomb",
             "thick rhomb" or "corner") }, next[e] = [k, 0, 0] saying
             that across side e is cell k, or [-1, 0, 0] past the
             patch's edge
     a, b    steps far beyond the patch (the patch is one block, never
             repeated; a box only ever uses the block at (0, 0))
     finite  true: tilingBox (js/sim-domains.js) centers a box on the
             patch's middle, and there is no torus
     tilesOnly  true for P1: only its tiles can be the cells. The inner
             corner of a star or a boat has just two tiles around it,
             so as a cell it would be a polygon with two corners, with
             no inside.
   growPenrose(tiling, X, Y) makes the patch hold every cell in the
   rectangle |x| <= X, |y| <= Y around the middle, keeping every cell's
   number, so a box of any size can be cut from it. penroseCornerKinds
   (kind, half) counts the kinds of corner, and penroseTileCounts(half)
   P1's kinds of tile (for the check page). PENROSE_TILINGS lists the
   tilings for the Lattice menus, and penroseFromCode(code, corners)
   builds one from its code there.

   Contents:
     1. Exact numbers
     2. Robinson triangles, and how each one splits (P2, P3)
     3. Penrose's first tiling (P1)
     4. From triangles to tiles (P2, P3)
     5. The tiles, or the corners, as cells
     6. The block for the sims, and growing it
     7. The kinds of corner, and of P1's tiles
     8. In the menus
     9. The whole plane (Random Walk, Eden Growth)
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

// The golden ratio as an ordinary number.
const PHI = (1 + Math.sqrt(5)) / 2;

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

// The same name, or, when the numbers are too big for that (P1's first
// big tiles), the four numbers as text.
function zName(p, q) {
  const s = q ? zPlus(p, q) : p;
  return s.every(function (x) { return x >= -4096 && x <= 4095; }) ? zKey(s) : s.join();
}

// The point as ordinary numbers: x, y, or [x, y].
const ZETA_X = [0, 1, 2, 3].map(function (j) { return Math.cos(j * 2 * Math.PI / 5); });
const ZETA_Y = [0, 1, 2, 3].map(function (j) { return Math.sin(j * 2 * Math.PI / 5); });
function zX(p) { return p[0] + p[1] * ZETA_X[1] + p[2] * ZETA_X[2] + p[3] * ZETA_X[3]; }
function zY(p) { return p[1] * ZETA_Y[1] + p[2] * ZETA_Y[2] + p[3] * ZETA_Y[3]; }
function zToNumbers(p) { return [zX(p), zY(p)]; }


/* =====================================================================
   2. ROBINSON TRIANGLES, AND HOW EACH ONE SPLITS (P2, P3)
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
  let n = 0;
  while (Math.pow(PHI, kind === "P2" ? n + 1 : n) * Math.cos(Math.PI / 10) < radius) n += 2;
  return n;
}


/* =====================================================================
   3. PENROSE'S FIRST TILING (P1)
   ---------------------------------------------------------------------
   Penrose found P1 by splitting a pentagon into smaller ones and
   filling the gaps ("Pentaplexity", 1979). Every tile splits into tiles
   phi^2 times smaller:
     pentagon  a pentagon at each corner and an upside-down one in the
               middle, leaving a thin triangle (half a diamond) in the
               middle of each side
     star      an upside-down star in the middle, whose tips are the old
               star's inner corners; a pentagon across the bottom of
               each point; and a boat in the rest of each point
     boat      as the star it is part of does, for its three points
     diamond   a star at one tip, a boat at the other, a pentagon between
   The half-diamonds on the pentagons' sides fill the rest: two across a
   side between two pentagons make a diamond, and one on a side of a
   star, boat or diamond is the end of a point of the smaller star or
   boat there (those stick out of the old tile by exactly that much).
   Every tile has sides 1, and the tiles meet side to side.

   The pentagons are of three kinds, sharing 0, 2 or 3 sides with a
   star, boat or diamond: Kociemba's PA, PB and PC (H. Kociemba,
   "Computing the Tile Frequencies", kociemba.org/themen/penrose/
   tiling4.html, which gives the rules above with them). A diamond can
   split two ways, the star at either tip, and only one way works
   (Penrose 1979). Its tips point into the two pentagons whose
   half-diamonds made it, and the star goes into the one whose corner
   pentagons at the ends of their shared side become PC pentagons (in
   one, that gives the two PC pentagons a PB pentagon must split into).
   Those become PC exactly when, along the pentagon's other side at
   that corner, the smaller tile next to the corner is not a pentagon
   (pentagonNext). The check page checks the result against Kociemba's
   numbers of each kind of tile.

   A tile here is { kind, corners (exact, counterclockwise from its first
   corner), turn (the direction of its first side, in steps of 36
   degrees) }. The start is one big pentagon whose middle is the middle
   of the picture, upside down for an odd number of splits (the middle
   pentagon of a pentagon is upside down), so that every patch is the
   middle of the next bigger one. A diamond needs to know its
   neighbors' neighbors, so near the start's edge some tiles can't be
   worked out ("gap" tiles mark a half-diamond whose neighbor isn't
   known); the start is made big enough to keep these far from the
   rectangle wanted, and tiles far from it are left out at each step.
   ===================================================================== */

// The directions of each kind of tile's sides in turn, counterclockwise
// from its first corner, in steps of 36 degrees from its first side. A
// star starts at a tip; a boat at its middle tip, and its corners are
// the tip, inner corner, tip, two back corners, tip, inner corner; a
// diamond at the tip with the star (when it splits), then a 144 degree
// corner, the other tip, the other 144 degree corner.
const P1_SIDES = {
  pentagon: [0, 2, 4, 6, 8],
  star: [0, 8, 2, 0, 4, 2, 6, 4, 8, 6],
  boat: [0, 8, 2, 3, 4, 8, 6],
  diamond: [0, 1, 5, 6],
};

// The tile of this kind with its first corner at "at" and its first
// side pointing at 36 turn degrees; units[k] is the side of this size
// pointing at 36 k degrees.
function p1Tile(kind, at, turn, units) {
  turn = ((turn % 10) + 10) % 10;
  const sides = P1_SIDES[kind], corners = [at];
  for (let k = 0; k < sides.length - 1; k++) corners.push(zPlus(corners[k], units[(turn + sides[k]) % 10]));
  return { kind: kind, corners: corners, turn: turn };
}

// The direction of side k of tile t (from corner k to corner k + 1).
function p1SideTurn(t, k) { return (t.turn + P1_SIDES[t.kind][k]) % 10; }

// The sides of length phi^m, pointing at 0, 36, ..., 324 degrees.
function p1Units(m) {
  const units = [];
  for (let k = 0; k < 10; k++) units.push(zTimesPhi(zUnit(k), m));
  return units;
}

// What each kind of tile splits into (units: the smaller tiles' sides;
// big: the tile's own).
const P1_SPLIT = {
  pentagon: function (t, units) {
    const out = t.corners.map(function (p, k) { return p1Tile("pentagon", p, t.turn + 2 * k, units); });
    // The middle one shares a side with the one at the first corner.
    let c = t.corners[0];
    for (const k of [0, 2, 4]) c = zPlus(c, units[(t.turn + k) % 10]);
    out.push(p1Tile("pentagon", c, t.turn + 9, units));
    return out;
  },
  star: function (t, units) { return starParts(t, [0, 2, 4, 6, 8], units); },
  boat: function (t, units, big) { return starParts(p1Tile("star", t.corners[0], t.turn, big), [0, 2, 8], units); },
  diamond: function (t, units) {
    return [p1Tile("star", t.corners[0], t.turn, units), p1Tile("boat", t.corners[2], t.turn + 5, units),
            p1Tile("pentagon", t.corners[1], t.turn + 1, units)];
  },
  gap: function () { return []; },
};

// What a star splits into, for the points with their tips at these
// corners (all five, or a boat's three): the star in the middle, whose
// tips are the old one's inner corners, and for each point the pentagon
// across its bottom (from the inner corner before the tip) and the
// boat at its tip.
function starParts(star, tips, units) {
  const out = [p1Tile("star", star.corners[1], p1SideTurn(star, 1) + 3, units)];
  for (const k of tips) {
    const before = (k + 9) % 10;
    out.push(p1Tile("pentagon", star.corners[before], p1SideTurn(star, before), units));
    out.push(p1Tile("boat", star.corners[k], p1SideTurn(star, k), units));
  }
  return out;
}

// After t splits, is the smaller tile at corner c of t, along t's side s
// (c is s or s + 1), a pentagon? null if not known (a gap tile's base).
// A star or boat point, or a diamond tip, always gives a star's or a
// boat's point; along a diamond's side from a 144 degree corner, the
// star's point if the side goes to the star's tip, else the pentagon;
// along a boat's back side, the middle star's point (section 3's top).
function pentagonNext(t, s, c) {
  switch (t.kind) {
    case "pentagon": return true;
    case "star": return c % 2 === 1;
    case "boat": return c === 1 || c === 6 || (c === 3 && s === 2) || (c === 4 && s === 4);
    case "diamond": return (c === 1 && s === 1) || (c === 3 && s === 2);
    default: return c === 2 ? false : null;
  }
}

// P1's tiles (with ordinary-number points, as tilesOf gives) after
// enough splits to cover the rectangle |x| <= X, |y| <= Y around its
// middle, leaving out at each step the tiles more than 3 of their own
// sides from the rectangle (along with what they split into).
function pentagonTiles(X, Y) {
  const n = p1SplitsToCover(Math.hypot(X, Y));
  let big = p1Units(2 * n), tiles = [p1Start(n)];
  for (let k = n - 1; k >= 0; k--) {
    const units = p1Units(2 * k), margin = 3 * Math.pow(PHI, 2 * k);
    tiles = p1Split(tiles, units, big).filter(function (t) { return p1MightReach(t, X + margin, Y + margin); });
    big = units;
  }
  return tiles.filter(function (t) { return t.kind !== "gap"; }).map(p1Finished);
}

// The fewest splits whose start leaves the disk of this radius clear of
// the tiles that can't be worked out near its edge. Those reach in about
// half the start's side (the check page checks a bigger patch keeps the
// smaller one); a tenth of it is left clear here.
function p1SplitsToCover(radius) {
  let n = 1;
  while (Math.pow(PHI, 2 * n) / 10 < radius + 3) n += 1;
  return n;
}

// The start: a pentagon with sides s = phi^(2 n), its middle at the
// middle of the picture, upside down if n is odd. The pentagon with
// sides 1 from corner 0 has corners 0, 1, 1 + zeta, ..., so its middle
// (their sum over 5) is (4 + 3 zeta + 2 zeta^2 + zeta^3)/5; the start's
// first corner is that times 1 - s (or 1 + s, upside down). The
// division by 5 always comes out whole here (the check page builds P1
// at every size the sims use).
function p1Start(n) {
  const s = zTimesPhi([1, 0, 0, 0], 2 * n), down = n % 2 === 1;
  const fiveMiddles = [0, 0, 0, 0];
  let power = s;
  for (const times of [4, 3, 2, 1]) {
    for (let j = 0; j < 4; j++) fiveMiddles[j] += times * power[j];
    power = zTurn(power);
  }
  const at = [4, 3, 2, 1].map(function (x, j) { return (down ? x + fiveMiddles[j] : x - fiveMiddles[j]) / 5; });
  if (!at.every(Number.isInteger)) throw new Error("The start of a Penrose P1 patch isn't a whole-number point.");
  return p1Tile("pentagon", at, down ? 5 : 0, p1Units(2 * n));
}

// The middle of the picture, (4 + 3 zeta + 2 zeta^2 + zeta^3)/5, as
// ordinary numbers.
const P1_MIDDLE = [zX([4, 3, 2, 1]) / 5, zY([4, 3, 2, 1]) / 5];

// Split every tile, and fill in the diamonds between pentagons (and a
// gap tile on each pentagon's side with nothing across it).
function p1Split(tiles, units, big) {
  const sides = p1Sides(tiles), next = [];
  for (const t of tiles) next.push(...P1_SPLIT[t.kind](t, units, big));
  for (const list of sides.values()) {
    const t = tiles[Math.floor(list[0] / 16)], s = list[0] % 16;
    if (t.kind !== "pentagon") continue;
    if (list.length === 1) next.push(edgeGap(t, s, units));
    else if (tiles[Math.floor(list[1] / 16)].kind === "pentagon") {
      const diamond = diamondBetween(tiles, sides, list, units);
      if (diamond) next.push(diamond);
    }
  }
  return next;
}

// For each side, the tiles with it: a Map from its name (zName of its
// ends) to [16 t + s, ...] for side s of tile t (a tile has at most 10).
function p1Sides(tiles) {
  const sides = new Map();
  tiles.forEach(function (t, k) {
    const n = t.corners.length;
    t.corners.forEach(function (p, s) {
      const name = zName(p, t.corners[(s + 1) % n]);
      if (sides.has(name)) sides.get(name).push(16 * k + s); else sides.set(name, [16 * k + s]);
    });
  });
  return sides;
}

// The half-diamond left on side s of pentagon t, with nothing known
// across it: a gap tile (its corners: the two on the side, then its tip).
function edgeGap(t, s, units) {
  const D = p1SideTurn(t, s), x = zPlus(t.corners[s], units[D]);
  return { kind: "gap", corners: [x, zPlus(x, zOverPhi(units[D])), zPlus(x, units[(D + 2) % 10])], turn: 0 };
}

// The diamond made by the half-diamonds on the side the two pentagons
// in "list" share, or null if what it needs isn't known. Pentagon X goes
// from p to q along it, Y from q to p. Its star goes into X when, at p
// and at q, the smaller tile along X's other side is not a pentagon (and
// then, along Y's other side, it is: the check that the rule holds).
function diamondBetween(tiles, sides, list, units) {
  const X = tiles[Math.floor(list[0] / 16)], i = list[0] % 16;
  const Y = tiles[Math.floor(list[1] / 16)], j = list[1] % 16;
  const votes = [
    acrossIsPentagon(tiles, sides, X, (i + 4) % 5, i), acrossIsPentagon(tiles, sides, X, (i + 1) % 5, (i + 1) % 5),
  ].map(function (v) { return v === null ? null : !v; }).concat([
    acrossIsPentagon(tiles, sides, Y, (j + 1) % 5, (j + 1) % 5), acrossIsPentagon(tiles, sides, Y, (j + 4) % 5, j),
  ]).filter(function (v) { return v !== null; });
  if (votes.length === 0) return null;
  if (votes.some(function (v) { return v !== votes[0]; })) throw new Error("The Penrose P1 rules disagree.");
  const D = p1SideTurn(X, i), side = zPlus(X.corners[i], units[D]);
  return votes[0] ? p1Tile("diamond", zPlus(side, units[(D + 2) % 10]), D + 7, units)
                  : p1Tile("diamond", zPlus(side, units[(D + 8) % 10]), D + 2, units);
}

// pentagonNext for the tile across side s of tile t, at t's corner c
// (null if no tile is known there). That tile goes along the side the
// other way.
function acrossIsPentagon(tiles, sides, t, s, c) {
  const n = t.corners.length;
  const list = sides.get(zName(t.corners[s], t.corners[(s + 1) % n]));
  const other = list.find(function (x) { return tiles[Math.floor(x / 16)] !== t; });
  if (other === undefined) return null;
  const u = tiles[Math.floor(other / 16)], S = other % 16;
  return pentagonNext(u, S, c === s ? (S + 1) % u.corners.length : S);
}

// Might tile t reach into the rectangle |x| <= X, |y| <= Y (around the
// middle of the picture)? Not if the box around its corners misses it.
function p1MightReach(t, X, Y) {
  const xs = t.corners.map(function (p) { return zX(p) - P1_MIDDLE[0]; });
  const ys = t.corners.map(function (p) { return zY(p) - P1_MIDDLE[1]; });
  return Math.min(...xs) <= X && Math.max(...xs) >= -X && Math.min(...ys) <= Y && Math.max(...ys) >= -Y;
}

// The tile as tilesOf gives tiles (section 4), its points measured from
// the middle of the picture. Its name is twice a point inside it: the
// middle of its two side tips (boat), of its tips (diamond), or of a
// corner and the corner two on (pentagon) or of a tip and the inner
// corner across from it (star), from the corner with the smallest
// name, so a tile is named the same however it was made.
function p1Finished(t) {
  const c = t.corners, n = c.length;
  let key;
  if (t.kind === "boat") key = zKey(c[2], c[5]);
  else if (t.kind === "diamond") key = zKey(c[0], c[2]);
  else {
    const step = t.kind === "star" ? 2 : 1, across = t.kind === "star" ? 5 : 2;
    let best = 0;
    for (let k = step; k < n; k += step) if (zKey(c[k]) < zKey(c[best])) best = k;
    key = zKey(c[best], c[(best + across) % n]);
  }
  const corners = startingFromSmallest(c);
  const points = corners.map(function (p) { return [zX(p) - P1_MIDDLE[0], zY(p) - P1_MIDDLE[1]]; });
  return { key: key, kind: t.kind, name: TILE_NAMES[t.kind], corners: corners, points: points, middle: centerOfMass(points) };
}


/* =====================================================================
   4. FROM TRIANGLES TO TILES (P2, P3)
   ---------------------------------------------------------------------
   Two halves of a rhomb share their side b-c; two halves of a kite or
   a dart share their line of symmetry a-c. A tile is { key, kind, name,
   corners (exact, counterclockwise), points (the same as ordinary
   numbers), middle }.
   ===================================================================== */

const TILE_NAMES = { pentagon: "pentagon", star: "star", boat: "boat", diamond: "diamond",
                     kite: "kite", dart: "dart", thin: "thin rhomb", thick: "thick rhomb" };

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
    if (signedArea(corners.map(zToNumbers)) < 0) corners.reverse();   // (js/sim-domains.js)
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
   5. THE TILES, OR THE CORNERS, AS CELLS
   ---------------------------------------------------------------------
   A cell is { key, name, corners, middle, sideKeys }, then "next" from
   linkCells. The corners as cells are as for the tilings by regular
   polygons (cornersBlock, js/sim-tilings.js): each corner of the tiling
   becomes a cell, whose own corners are the middles of the tiles around
   it, and two corners are neighbors when a side of a tile joins them.
   (Not for P1: see tilesOnly at the top of this file.)
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
// side exactly when they are neighbors. (A tile has at most 10 sides.)
function linkCells(cells) {
  const first = new Map();   // side -> 16 k + e, for the first cell k found with it as side e
  cells.forEach(function (cell, k) {
    cell.next = cell.sideKeys.map(function () { return [-1, 0, 0]; });
    cell.sideKeys.forEach(function (side, e) {
      const seen = first.get(side);
      if (seen === undefined) { first.set(side, 16 * k + e); return; }
      first.delete(side);
      const k2 = Math.floor(seen / 16);
      cell.next[e][0] = k2;
      cells[k2].next[seen % 16][0] = k;
    });
    delete cell.sideKeys;
  });
  return cells;
}

// The corners in the rectangle |x| <= X, |y| <= Y, as cells: for each,
// the middles of the tiles around it, in order counterclockwise. The
// tiles must reach 2 farther (a tile's corners are less than 2 from its
// middle), so that they go all the way around each corner.
function cornerCells(tiles, X, Y) {
  const tileLinks = tileCells(tiles);
  const names = tiles.map(function (tile) { return tile.corners.map(function (p) { return zKey(p); }); });
  const number = new Int32Array(16 * tiles.length).fill(-1);   // the cell at corner e of tile t
  const cells = [];
  tiles.forEach(function (tile, t) {
    tile.points.forEach(function ([x, y], e) {
      if (number[16 * t + e] >= 0 || Math.abs(x) > X || Math.abs(y) > Y) return;
      const around = aroundCorner(tiles, tileLinks, names, t, e);
      for (const [t2, e2] of around) number[16 * t2 + e2] = cells.length;
      cells.push({ key: names[t][e], name: "corner", around: around, middle: tile.points[e],
                   corners: around.map(function ([t2]) { return tiles[t2].middle; }) });
    });
  });
  // New side e, from the middle of tile e around the corner to the
  // middle of tile e + 1, crosses the side between them, from this
  // corner to the corner before it in tile e: that one is the neighbor.
  for (const cell of cells) {
    cell.next = cell.around.map(function ([t, e]) {
      const n = tiles[t].corners.length;
      return [number[16 * t + (e + n - 1) % n], 0, 0];
    });
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
// that side. (names[t]: the names of tile t's corners, from zKey.)
function aroundCorner(tiles, tileLinks, names, t, e) {
  const p = names[t][e], start = t, around = [];
  do {
    around.push([t, e]);
    t = tileLinks[t].next[(e + names[t].length - 1) % names[t].length][0];
    if (t < 0) throw new Error("A corner of a Penrose patch has a gap around it.");
    e = names[t].indexOf(p);
  } while (t !== start);
  const keys = around.map(function ([t2]) { return tiles[t2].key; });
  const first = keys.indexOf(Math.min(...keys));
  return around.slice(first).concat(around.slice(0, first));
}


/* =====================================================================
   6. THE BLOCK FOR THE SIMS, AND GROWING IT
   ---------------------------------------------------------------------
   The patch is grown by starting again with more splits (from bigger
   triangles or a bigger pentagon, so the tiles stay the same size).
   For P2 and P3, two splits bring the start back, turned by 36
   degrees: the sun splits into a star (5 darts, tips at the middle)
   and that into a turned sun, and the wheel of thin halves comes back
   the same way; the start is turned to match (section 2), and the
   number of splits goes up by two at a time. For P1, the pentagon in
   the middle of a pentagon is upside down, and so is the start for an
   odd number of splits (section 3). So the patches of the same kind
   agree where they overlap (the check page checks this), and a grown
   patch keeps the old cells' numbers.
   ===================================================================== */

// The tiling "P1", "P2" or "P3" (with corners true, its corners as cells,
// but for P1, whose tiles are always the cells), as a block for the sims
// (see the top of this file), with a small patch to start with.
function penroseBlock(kind, corners) {
  const tilesOnly = (kind === "P1");
  const block = { code: "Penrose " + kind, a: [1, 0], b: [0, 1], rectangle: true, cells: [], vertexTypes: [],
                  corners: Boolean(corners) && !tilesOnly, tilesOnly: tilesOnly, finite: true, penrose: kind, X: 0, Y: 0 };
  growPenrose(block, 10, 10);
  return block;
}

// Make the block hold every cell whose middle is in the rectangle
// |x| <= X, |y| <= Y around the middle of the tiling (in side lengths),
// as well as those it held already. Those keep their numbers; new ones
// are numbered after them, nearest the middle first (so cell 0 is the
// one nearest the middle).
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
  const far = fresh.map(function (cell) { return cell.middle[0] * cell.middle[0] + cell.middle[1] * cell.middle[1]; });
  later.sort(function (j, k) { return far[j] - far[k] || fresh[j].key - fresh[k].key; });
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
// tile's corners are less than 2 from its middle, so the tile (both its
// halves, for P2 and P3) reaches into the rectangle 2 bigger each way,
// and is kept.
function penroseTiles(kind, X, Y) {
  const tiles = kind === "P1" ? pentagonTiles(X + 2, Y + 2) : tilesOf(splitTriangles(kind, X + 2, Y + 2));
  return tiles.filter(function (tile) {
    return Math.abs(tile.middle[0]) <= X && Math.abs(tile.middle[1]) <= Y;
  });
}


/* =====================================================================
   7. THE KINDS OF CORNER, AND OF P1'S TILES (for the check page)
   ---------------------------------------------------------------------
   The tiles may meet at a corner in only a few ways:
     P1  (named here by the angles going around, as for P3: the
         check page checks that they add up to 360 degrees)
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
   penroseTileCounts counts P1's tiles of each kind, for the check page
   to compare with how often Kociemba finds each one (section 3).
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

// The kinds of corner of the tiling "P1", "P2" or "P3" in the square
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
// for a kite or a dart, from where its biggest corner is; for any
// other tile, just its angle.
function cornerRoles(kind, angles) {
  if (kind !== "kite" && kind !== "dart") return angles.map(String);
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
  if (kind === "P1") return what;
  const names = PENROSE_CORNERS[kind];
  return Object.keys(names).find(function (name) { return names[name] === what; }) || "not a Penrose corner: " + what;
}

// P1's tiles whose middles are in the square |x|, |y| <= half around its
// middle, by kind, the pentagons told apart by how many sides they share
// with a star, boat or diamond: a Map from "star", "boat", "diamond" and
// "pentagon touching 0" (2, 3) to how many there are.
function penroseTileCounts(half) {
  const tiles = penroseTiles("P1", half + 2, half + 2), cells = tileCells(tiles), counts = new Map();
  tiles.forEach(function (tile, k) {
    if (Math.abs(tile.middle[0]) > half || Math.abs(tile.middle[1]) > half) return;
    let name = tile.kind;
    if (name === "pentagon") {
      name += " touching " + cells[k].next.filter(function ([j]) { return j >= 0 && tiles[j].kind !== "pentagon"; }).length;
    }
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return counts;
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
   8. IN THE MENUS
   ---------------------------------------------------------------------
   The Lattice menus (addTilingOptions, js/sim-tilings.js) list these
   after the tilings by regular polygons, on the pages that load this
   file. Their "code" goes in the code box (they have no GomJau-Hogg
   code, since they never repeat), and readTiling (js/sim-controls.js)
   builds them from it.
   ===================================================================== */

const PENROSE_TILINGS = [
  { name: "Pentagons, stars, boats and diamonds (P1)", code: "Penrose P1", kinds: "penrose" },
  { name: "Kites and darts (P2)", code: "Penrose P2", kinds: "penrose" },
  { name: "Rhombs (P3)", code: "Penrose P3", kinds: "penrose" },
];

// The Penrose tiling with this code ("Penrose P1", "Penrose P2" or
// "Penrose P3"), or null if the code is none of them.
function penroseFromCode(code, corners) {
  const tiling = PENROSE_TILINGS.find(function (t) { return t.code === code; });
  return tiling ? penroseBlock(code.slice(-2), corners) : null;
}


/* =====================================================================
   9. THE WHOLE PLANE (Random Walk, Eden Growth)
   ---------------------------------------------------------------------
   A walk or a mountain on the whole plane runs in a second thread (a
   "Web Worker", runInWorker in js/sim-page.js). That thread keeps its
   own patch, "the plane", and grows it as the walk or the mountain
   reaches farther out (penroseReach): each time to twice its size,
   from 10 side lengths from the middle each way to 20, 40, 80 and
   160, and no further (PENROSE_PLANE_MOST; that is about 100,000
   tiles, built in a few seconds). It always grows through the same
   sizes, so its cells are numbered the same way every time. The page
   draws with its own copy of the plane's cells, which has only what
   drawing needs (penroseMirror), and the thread sends it the cells it
   doesn't have yet (planeCellsFrom, addPlaneCells). penroseHelpers()
   lists what the thread needs of this file.
   ===================================================================== */

const PENROSE_PLANE_MOST = 160;

// The plane of "tiling" (a Penrose tiling's block, as the page has it):
// "plane" again if it is already that tiling's, else a new one.
function penrosePlane(plane, tiling) {
  if (plane && plane.code === tiling.code && plane.corners === tiling.corners) return plane;
  return penroseBlock(tiling.penrose, tiling.corners);
}

// Make the plane hold every cell within "reach" of the point (x, y) (in
// side lengths from the middle), with all their neighbors (whose
// middles are less than 2 further), growing it if it has to. Returns
// false, leaving it as it is, if that would take it past
// PENROSE_PLANE_MOST.
function penroseReach(plane, x, y, reach) {
  const need = Math.max(Math.abs(x), Math.abs(y)) + reach + 2;
  if (need > PENROSE_PLANE_MOST) return false;
  while (need > Math.min(plane.X, plane.Y)) {
    growPenrose(plane, Math.min(2 * plane.X, PENROSE_PLANE_MOST), Math.min(2 * plane.Y, PENROSE_PLANE_MOST));
  }
  return true;
}

// The cells of the plane from number "from" on, to send to the page:
// their middles, how many corners each has, and the corners, as typed
// lists of numbers (those go from one thread to another much faster
// than lists of lists).
function planeCellsFrom(plane, from) {
  const cells = plane.cells.slice(from);
  const counts = Uint8Array.from(cells, function (cell) { return cell.corners.length; });
  const middles = new Float64Array(2 * cells.length);
  const corners = new Float64Array(2 * counts.reduce(function (a, b) { return a + b; }, 0));
  let at = 0;
  cells.forEach(function (cell, j) {
    middles.set(cell.middle, 2 * j);
    for (const c of cell.corners) { corners.set(c, at); at += 2; }
  });
  return { from: from, counts: counts, middles: middles, corners: corners };
}

// The page's copy of the plane of "tiling" (the page's block of it):
// "mirror" again if it is already that tiling's, else a new one with no
// cells yet. Its cells have only their corners and middles.
function penroseMirror(mirror, tiling) {
  if (mirror && mirror.code === tiling.code && mirror.corners === tiling.corners) return mirror;
  return { code: tiling.code, corners: tiling.corners, a: tiling.a, b: tiling.b, finite: true, cells: [] };
}

// Add the cells the thread sent (planeCellsFrom) to the page's copy,
// skipping those it has already.
function addPlaneCells(mirror, sent) {
  let at = 0;
  sent.counts.forEach(function (count, j) {
    const corners = [];
    for (let c = 0; c < count; c++, at += 2) corners.push([sent.corners[at], sent.corners[at + 1]]);
    if (sent.from + j === mirror.cells.length) {
      mirror.cells.push({ corners: corners, middle: [sent.middles[2 * j], sent.middles[2 * j + 1]] });
    }
  });
}

// What the second thread needs to grow a plane, for runInWorker
// (js/sim-page.js): the functions of sections 1 to 6 and of this one,
// signedArea (js/sim-domains.js), and the constants they use.
function penroseHelpers() {
  return [zPlus, zMinus, zTurn, zTurnBack, zOverPhi, zTimesPhi, zTowards, zUnit, zKey, zName, zX, zY, zToNumbers,
    triangle, startTriangles, splitTriangles, mightReach, splitsToCover,
    p1Tile, p1SideTurn, p1Units, starParts, pentagonNext, pentagonTiles, p1SplitsToCover, p1Start, p1Split, p1Sides,
    edgeGap, diamondBetween, acrossIsPentagon, p1MightReach, p1Finished,
    halfKey, tilesOf, startingFromSmallest, signedArea, centerOfMass,
    tileCells, sideKey, linkCells, cornerCells, aroundCorner,
    penroseBlock, growPenrose, penroseCells, penroseTiles, penrosePlane, penroseReach, planeCellsFrom,
    { ZETA_POWERS: ZETA_POWERS, PHI: PHI, ZETA_X: ZETA_X, ZETA_Y: ZETA_Y, SPLIT: SPLIT, P1_SIDES: P1_SIDES,
      P1_SPLIT: P1_SPLIT, P1_MIDDLE: P1_MIDDLE, TILE_NAMES: TILE_NAMES, PENROSE_PLANE_MOST: PENROSE_PLANE_MOST }];
}
