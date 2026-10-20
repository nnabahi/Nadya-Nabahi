/* =====================================================================
   sim-tilings.js  —  tilings of the plane by regular polygons, read
                      from their GomJau-Hogg code
   ---------------------------------------------------------------------
   Every tiling here is made of regular polygons with sides of length 1
   that meet edge to edge, and repeats in two directions. Each one is
   written in GomJau-Hogg notation (V. Gomez-Jauregui, H. Hogg, C.
   Manchado and C. Otero, "GomJau-Hogg's notation for automatic
   generation of k-uniform tessellations with ANTWERP v3.0", Symmetry
   13 (2021), 2376; "the paper" below). For example the
   (3.4.6.4) tiling is
       6-4-3/m30/r(c2)
   which says: a hexagon in the middle; a square on its first side
   going clockwise from straight up; a triangle on the square's first
   free side; then mirror the whole pattern across lines through the
   middle, 30 degrees apart; then turn it half a turn around the 2nd
   middle of a polygon ("c2", counting clockwise from straight up); and
   keep doing those two moves forever. Section 3 below has the rules in
   full, and the help page help/gomjau-hogg.html explains them with
   pictures.

   The code here is written from the paper. Where the paper doesn't say
   exactly what to do (the order of sides that sit at the same angle,
   for example), it follows the authors' own program, ANTWERP.

   EXACT NUMBERS. A regular polygon whose sides point in directions that
   are multiples of 15 degrees has every corner at a point whose x and y
   are numbers  a + b*sqrt(2) + c*sqrt(3) + d*sqrt(6)  with fractions
   a, b, c, d, because cos and sin of the multiples of 15 degrees are
   such numbers (cos 15° = (sqrt(6) + sqrt(2))/4, for example). Sums,
   products and quotients of such numbers are again such numbers (they
   form a field, Q(sqrt 2, sqrt 3)). So every point is worked out
   exactly, with whole numbers (JavaScript's BigInt), and two corners
   are the same corner only when they are exactly equal: no rounding,
   no "close enough". Section 1 has this arithmetic.

   WHAT COMES OUT. tilingFromCode(code) returns the tiling's REPEATING
   BLOCK:
     t1, t2      the two shortest steps that move the tiling onto
                 itself, as [x, y] (the block repeats at every
                 i * t1 + j * t2, for whole numbers i and j)
     cells       the polygons of one block, each { sides, corners
                 (going around counterclockwise), middle, next }, where
                 next[e] = [k, i, j] says that across side e (from corner
                 e to corner e + 1) is cell k of the block i * t1 + j * t2
                 away
     vertexTypes the kinds of corner in the tiling, like "3.4.6.4"
   (plain JavaScript numbers, for drawing; the exact numbers stay
   inside this file). cornersBlock(block) gives the same tiling with
   its CORNERS as the cells (the dual tiling), in the same form, and
   uprightBlock(block) turns either one upright, ready to lay out in
   rows (section 9), and tilingBlock(code, corners) does all three, as
   the sims need it (or builds a Penrose tiling, js/sim-penrose.js, from
   its code). TILINGS lists the tilings in the sims' menus
   (section 10, with addTilingOptions, which puts them in a menu, and
   cornerShort, which writes a kind of corner the short way). For the
   help page, codeSteps(code) gives the tiling one block of its code at
   a time (section 5).
   Anything wrong with a code is thrown as an Error with a message in
   plain words, to show next to the code box.

   Contents:
     1. Exact numbers, sqrt(2) and sqrt(3) included
     2. Points, directions and moves of the plane
     3. Reading a code
     4. Polygons
     5. Building the tiling: placing the polygons, then the moves
     6. The repeating block
     7. Checking the block is a tiling, and its kinds of corner
     8. The corners as cells (the dual tiling)
     9. Ready for the sims: rows across
    10. The tilings in the menus
   ===================================================================== */


/* =====================================================================
   1. EXACT NUMBERS
   ---------------------------------------------------------------------
   A number (a + b sqrt2 + c sqrt3 + d sqrt6) / den is stored as
   { n: [a, b, c, d], den } with whole numbers (BigInt, written 5n),
   den > 0 and no common factor of all five, so each number is written
   in exactly one way (and keyOf gives equal numbers equal keys).
   ===================================================================== */

function bigGcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) { const r = a % b; a = b; b = r; }
  return a;
}

// The number (a + b sqrt2 + c sqrt3 + d sqrt6) / den, in lowest terms.
function exact(a, b, c, d, den) {
  if (den === undefined) den = 1n;
  if (den < 0n) { a = -a; b = -b; c = -c; d = -d; den = -den; }
  let g = bigGcd(bigGcd(bigGcd(a, b), bigGcd(c, d)), den);
  if (g === 0n) g = 1n;
  return { n: [a / g, b / g, c / g, d / g], den: den / g };
}

// A fraction p / q (p, q ordinary whole numbers).
function fraction(p, q) { return exact(BigInt(p), 0n, 0n, 0n, BigInt(q === undefined ? 1 : q)); }

const ZERO = fraction(0), ONE = fraction(1);

function plus(x, y) {
  const n = [];
  for (let k = 0; k < 4; k++) n.push(x.n[k] * y.den + y.n[k] * x.den);
  return exact(n[0], n[1], n[2], n[3], x.den * y.den);
}

function negate(x) { return exact(-x.n[0], -x.n[1], -x.n[2], -x.n[3], x.den); }

function minus(x, y) { return plus(x, negate(y)); }

// (a + b√2 + c√3 + d√6)(e + f√2 + g√3 + h√6), multiplied out with
// √2√2 = 2, √3√3 = 3, √6√6 = 6, √2√3 = √6, √2√6 = 2√3, √3√6 = 3√2.
function times(x, y) {
  const [a, b, c, d] = x.n, [e, f, g, h] = y.n;
  return exact(
    a * e + 2n * b * f + 3n * c * g + 6n * d * h,
    a * f + b * e + 3n * c * h + 3n * d * g,
    a * g + c * e + 2n * b * h + 2n * d * f,
    a * h + d * e + b * g + c * f,
    x.den * y.den);
}

// 1 / x. Write x = (A + B sqrt3) / den with A = a + b sqrt2 and
// B = c + d sqrt2. Then 1/x = den (A - B sqrt3) / N with
// N = A^2 - 3 B^2 = p + q sqrt2, and 1/N = (p - q sqrt2) / (p^2 - 2 q^2).
// (Multiplying by these "conjugates" is the usual way to clear square
// roots out of the bottom of a fraction.)
function inverse(x) {
  const [a, b, c, d] = x.n;
  if (a === 0n && b === 0n && c === 0n && d === 0n) throw new Error("Can't divide by zero.");
  const p = a * a + 2n * b * b - 3n * (c * c + 2n * d * d);   // N = p + q sqrt2
  const q = 2n * a * b - 6n * c * d;
  const top = times(exact(a, b, -c, -d, 1n), exact(p, -q, 0n, 0n, 1n));   // (A - B sqrt3)(p - q sqrt2)
  return times(top, exact(x.den, 0n, 0n, 0n, p * p - 2n * q * q));
}

function over(x, y) { return times(x, inverse(y)); }

function isZero(x) { return x.n[0] === 0n && x.n[1] === 0n && x.n[2] === 0n && x.n[3] === 0n; }

function equal(x, y) { return keyOf(x) === keyOf(y); }

function keyOf(x) { return x.n.join(",") + "/" + x.den; }

// The number as an ordinary JavaScript number (about 16 digits).
function toNumber(x) {
  return (Number(x.n[0]) + Number(x.n[1]) * Math.SQRT2 + Number(x.n[2]) * Math.sqrt(3) +
          Number(x.n[3]) * Math.sqrt(6)) / Number(x.den);
}

// -1, 0 or 1. Zero is decided exactly (1, sqrt2, sqrt3 and sqrt6 can't
// add up to 0 with fractions that aren't all 0); otherwise the sign of
// the ordinary number, which can't be wrong unless the number is tiny,
// and for the small tilings here it never is (if it were, this says so
// instead of guessing).
function sign(x) {
  if (isZero(x)) return 0;
  const v = toNumber(x);
  const size = (Math.abs(Number(x.n[0])) + Math.abs(Number(x.n[1])) * 1.5 + Math.abs(Number(x.n[2])) * 1.8 +
                Math.abs(Number(x.n[3])) * 2.5) / Number(x.den);
  if (Math.abs(v) <= 1e-9 * size) throw new Error("A number came too close to 0 to tell its sign.");
  return Math.sign(v);
}

// Whether x is a whole number, and which.
function wholeNumber(x) {
  if (x.den !== 1n || x.n[1] !== 0n || x.n[2] !== 0n || x.n[3] !== 0n) return null;
  return Number(x.n[0]);
}

// The largest whole number <= x.
function floorOf(x) {
  const k = Math.floor(toNumber(x) + 1e-9);
  // Just below a whole number, or exactly on it? Decide exactly.
  return sign(minus(x, fraction(k))) < 0 ? k - 1 : k;
}


/* =====================================================================
   2. POINTS, DIRECTIONS AND MOVES OF THE PLANE
   ---------------------------------------------------------------------
   A point is [x, y], two exact numbers, with y going up. Every side of
   every polygon is 1 long and points in one of the 24 directions
   k * 15 degrees (k = 0 .. 23, counterclockwise from the x axis); UNIT_STEPS[k]
   is that step.

   The moves that carry a tiling onto itself are turns and mirrors. A
   move is { r, f, t }: first mirror across the x axis if f is 1, then
   turn by r * 15 degrees around 0, then shift by the point t:
       p  ->  turn(r) (f ? [p.x, -p.y] : p) + t.
   ===================================================================== */

// cos(k * 15 degrees) for k = 0 .. 6.
const COS15 = [
  ONE,
  exact(0n, 1n, 0n, 1n, 4n),   // cos 15 = (sqrt2 + sqrt6) / 4
  exact(0n, 0n, 1n, 0n, 2n),   // cos 30 = sqrt3 / 2
  exact(0n, 1n, 0n, 0n, 2n),   // cos 45 = sqrt2 / 2
  fraction(1, 2),              // cos 60
  exact(0n, -1n, 0n, 1n, 4n),  // cos 75 = (sqrt6 - sqrt2) / 4
  ZERO,                        // cos 90
];

// cos and sin of k * 15 degrees, for any whole k.
function cosOf(k) {
  k = ((k % 24) + 24) % 24;
  if (k > 12) k = 24 - k;                     // cos(-a) = cos(a)
  return k > 6 ? negate(COS15[12 - k]) : COS15[k];   // cos(180 - a) = -cos(a)
}
function sinOf(k) { return cosOf(6 - k); }    // sin(a) = cos(90 - a)

const UNIT_STEPS = [];
for (let k = 0; k < 24; k++) UNIT_STEPS.push([cosOf(k), sinOf(k)]);

function pointPlus(p, q) { return [plus(p[0], q[0]), plus(p[1], q[1])]; }
function pointMinus(p, q) { return [minus(p[0], q[0]), minus(p[1], q[1])]; }
function pointScale(s, p) { return [times(s, p[0]), times(s, p[1])]; }
function pointKey(p) { return keyOf(p[0]) + ";" + keyOf(p[1]); }
function pointToNumbers(p) { return [toNumber(p[0]), toNumber(p[1])]; }
function cross(p, q) { return minus(times(p[0], q[1]), times(p[1], q[0])); }
function dot(p, q) { return plus(times(p[0], q[0]), times(p[1], q[1])); }

// The direction k (0 .. 23) of the step from a to b, which must be one
// of the 24 unit steps.
function directionOf(a, b) {
  const step = pointMinus(b, a);
  const [x, y] = pointToNumbers(step);
  const k = ((Math.round(Math.atan2(y, x) / (Math.PI / 12)) % 24) + 24) % 24;
  if (pointKey(step) !== pointKey(UNIT_STEPS[k])) throw new Error("A side isn't 1 long in one of the 24 directions.");
  return k;
}

// Turn the point p by r * 15 degrees around 0.
function turn(r, p) {
  const c = cosOf(r), s = sinOf(r);
  return [minus(times(c, p[0]), times(s, p[1])), plus(times(s, p[0]), times(c, p[1]))];
}

function move(m, p) {
  return pointPlus(turn(m.r, m.f ? [p[0], negate(p[1])] : p), m.t);
}

// The move "first b, then a".
function combine(a, b) {
  return { r: (((a.f ? -b.r : b.r) + a.r) % 24 + 24) % 24, f: a.f ^ b.f, t: move(a, b.t) };
}

const STAY = { r: 0, f: 0, t: [ZERO, ZERO] };

// Half a turn around the point p.
function halfTurnAround(p) {
  return { r: 12, f: 0, t: pointScale(fraction(2), p) };
}

// The mirror across the line through p whose direction is "m * 7.5
// degrees" (m whole). Mirroring across the line at angle a is the same
// as mirroring across the x axis, then turning by 2a; 2a = m * 15.
function mirrorThrough(p, m) {
  const linear = { r: ((m % 24) + 24) % 24, f: 1, t: [ZERO, ZERO] };
  return { r: linear.r, f: 1, t: pointMinus(p, move(linear, p)) };
}

// For the mirror line through 0 and the point v turned a quarter turn
// (the line through v at right angles to the line from 0 to v): its m
// (as in mirrorThrough). A mirror of a tiling of these polygons always
// has a direction that is a multiple of 7.5 degrees; if this one
// doesn't, it can't be part of a tiling.
function mirrorAcross(v) {
  const u = [negate(v[1]), v[0]];   // the line's direction
  const length2 = dot(u, u);
  // cos and sin of twice the line's angle: (ux^2 - uy^2, 2 ux uy) / |u|^2.
  const c2 = over(minus(times(u[0], u[0]), times(u[1], u[1])), length2);
  const s2 = over(times(fraction(2), times(u[0], u[1])), length2);
  for (let m = 0; m < 24; m++) {
    if (equal(c2, cosOf(m)) && equal(s2, sinOf(m))) return m;
  }
  return -1;
}

// The angle of the point p clockwise from straight up, from 0 up to
// (not including) 2 pi. The paper numbers points and places polygons
// in this order: "first fill the upper right quadrant and then move
// clockwise".
function clockwiseFromUp(p) {
  const [x, y] = pointToNumbers(p);
  let angle = Math.atan2(x, y);
  if (angle < 0) angle += 2 * Math.PI;
  return angle;
}

// Order two points clockwise from straight up; two points in exactly
// the same direction from 0 go nearest first.
function compareClockwise(p, q) {
  if (isZero(cross(p, q)) && sign(dot(p, q)) > 0) return sign(minus(dot(p, p), dot(q, q)));
  return clockwiseFromUp(p) - clockwiseFromUp(q);
}


/* =====================================================================
   3. READING A CODE
   ---------------------------------------------------------------------
   A code is blocks separated by "/". The first block places polygons;
   each block after it is a move (paper, Section 3).

   Placing polygons: phases separated by "-", polygons in a phase by ",".
     - The first phase is one polygon, the SEED: 3, 4, 6, 8 or 12 sides.
       It sits in the middle, with two of its sides upright (a triangle
       instead has its left side on the y axis, going up from 0, and
       points right).
     - Each later phase puts its polygons on the free sides of the
       previous phase's polygons, one per side, going clockwise from
       straight up. A 0 skips a free side.

   Moves, each one of:
     r<angle>   turn around the middle by <angle> (30, 45, 60, 90, 120
                or 180; 180 if left out), and again by twice that, four
                times that, ..., while it is under 360 degrees, each time
                keeping everything there was and adding the turned copy
     m<angle>   the same with mirrors: first across the line <angle>
                clockwise from straight up, then twice that, ...
     r(c2), r(v5), r(h7)    half a turn around a point
     m(c2), m(v5), m(h7)    the mirror across a line through a point
   The point is the 2nd middle of a polygon (c2), the 5th corner (v5) or
   the 7th middle of a side (h7), counting each kind clockwise from
   straight up (nearest first at the same angle), and leaving out the
   middle of the plane. They are counted again before each move. A
   mirror through a side's middle runs along the side; through a corner
   or a polygon's middle, at right angles to the line from the middle of
   the plane.

   Then all the moves are done again, in order, forever: the tiling is
   everything the moves can carry the first polygons to.
   ===================================================================== */

const POLYGON_SIDES = [3, 4, 6, 8, 12];
const MOVE_ANGLES = [30, 45, 60, 90, 120, 180];

function readCode(code) {
  const blocks = String(code).replace(/\s+/g, "").split("/");
  const phases = blocks[0].split("-").map(function (phase, k) {
    return phase.split(",").map(function (text) {
      if (!/^\d+$/.test(text)) throw new Error("\"" + text + "\" in the polygons part isn't a number of sides.");
      const sides = Number(text);
      if (k === 0 && !POLYGON_SIDES.includes(sides)) throw new Error("The first polygon must have 3, 4, 6, 8 or 12 sides.");
      if (sides !== 0 && !POLYGON_SIDES.includes(sides)) throw new Error("Polygons must have 3, 4, 6, 8 or 12 sides (or 0 to skip a side), not " + sides + ".");
      return sides;
    });
  });
  if (phases[0].length !== 1) throw new Error("The first part before the first \"-\" must be one polygon.");
  const moves = [];
  for (const text of blocks.slice(1)) {
    if (text === "") continue;   // "//" (in a few of the paper's codes): nothing to do
    const match = /^([mr])(\d*)(?:\(([cvh])(\d+)\))?$/i.exec(text);
    if (!match) throw new Error("\"" + text + "\" isn't a move like m30, r60, r(h2) or m(c3).");
    const kind = match[1].toLowerCase(), angle = match[2] === "" ? 180 : Number(match[2]);
    if (match[3]) {
      if (match[2] !== "") throw new Error("\"" + text + "\": a move around a point has no angle.");
      moves.push({ kind: kind, point: match[3].toLowerCase() + Number(match[4]), text: text });
    } else {
      if (!MOVE_ANGLES.includes(angle)) throw new Error("\"" + text + "\": the angle must be 30, 45, 60, 90, 120 or 180.");
      moves.push({ kind: kind, angle: angle, text: text });
    }
  }
  return { seed: phases[0][0], phases: phases.slice(1), moves: moves, text: blocks[0] };
}


/* =====================================================================
   4. POLYGONS
   ---------------------------------------------------------------------
   A polygon is { sides, corners }, its corners exact points going
   around counterclockwise. Side e goes from corner e to corner e + 1.
   ===================================================================== */

// The regular polygon with "sides" sides, starting at the point
// "start" and going first in direction k, turning left (by 360 / sides
// degrees, which is 24 / sides steps of 15 degrees) at each corner.
function regularPolygon(sides, start, k) {
  const corners = [start];
  for (let e = 0; e < sides - 1; e++) {
    corners.push(pointPlus(corners[e], UNIT_STEPS[((k + e * 24 / sides) % 24 + 24) % 24]));
  }
  return { sides: sides, corners: corners };
}

// The seed polygon: two sides upright (direction 90 degrees, k = 6),
// the middle at 0. Its right side starts at (apothem, -1/2), where the
// apothem (middle to side) is cot(180 / sides degrees) / 2. A triangle
// has its left side on the y axis from 0 up and points right.
function seedPolygon(sides) {
  if (sides === 3) return regularPolygon(3, [ZERO, ZERO], 2);
  const apothem = {
    4: fraction(1, 2),
    6: exact(0n, 0n, 1n, 0n, 2n),   // sqrt3 / 2
    8: exact(1n, 1n, 0n, 0n, 2n),   // (1 + sqrt2) / 2
    12: exact(2n, 0n, 1n, 0n, 2n),  // (2 + sqrt3) / 2
  }[sides];
  return regularPolygon(sides, [apothem, fraction(-1, 2)], 6);
}

// The polygon with "sides" sides on the far side of the side from a to
// b of a counterclockwise polygon: it goes b -> a first, then on around.
function polygonOnSide(sides, a, b) {
  return regularPolygon(sides, b, (directionOf(a, b) + 12) % 24);
}

function polygonMiddle(polygon) {
  let x = ZERO, y = ZERO;
  for (const c of polygon.corners) { x = plus(x, c[0]); y = plus(y, c[1]); }
  return pointScale(fraction(1, polygon.sides), [x, y]);
}

// A polygon moved by a move. A mirror turns the corners clockwise, so
// they are put back in counterclockwise order.
function movePolygon(m, polygon) {
  const corners = polygon.corners.map(function (c) { return move(m, c); });
  if (m.f) corners.reverse();
  return { sides: polygon.sides, corners: corners };
}

function sideMiddle(a, b) { return pointScale(fraction(1, 2), pointPlus(a, b)); }

// Its sides, each { a, b, middle }.
function polygonSides(polygon) {
  const sides = [];
  for (let e = 0; e < polygon.sides; e++) {
    const a = polygon.corners[e], b = polygon.corners[(e + 1) % polygon.sides];
    sides.push({ a: a, b: b, middle: sideMiddle(a, b), polygon: polygon });
  }
  return sides;
}

// The angle inside each corner, in degrees: 60, 90, 120, 135 or 150.
function cornerAngle(sides) { return 180 - 360 / sides; }

// The area of the polygon with sides of length 1: sides / (4 tan(180 / sides degrees)).
function regularArea(sides) {
  return {
    3: exact(0n, 0n, 1n, 0n, 4n),   // sqrt3 / 4
    4: ONE,
    6: exact(0n, 0n, 3n, 0n, 2n),   // 3 sqrt3 / 2
    8: exact(2n, 2n, 0n, 0n, 1n),   // 2 + 2 sqrt2
    12: exact(6n, 0n, 3n, 0n, 1n),  // 6 + 3 sqrt3
  }[sides];
}


/* =====================================================================
   5. BUILDING THE TILING
   ---------------------------------------------------------------------
   A "patch" is a list of polygons, with a key for each (its middle) so
   no polygon is added twice.
   ===================================================================== */

function makePatch() { return { polygons: [], keys: new Set(), sideCount: new Map() }; }

function addToPatch(patch, polygon) {
  const key = pointKey(polygonMiddle(polygon));
  if (patch.keys.has(key)) return false;
  patch.keys.add(key);
  patch.polygons.push(polygon);
  for (const side of polygonSides(polygon)) {
    const k = pointKey(side.middle);
    patch.sideCount.set(k, (patch.sideCount.get(k) || 0) + 1);
  }
  return true;
}

// A side is free when no other polygon of the patch has it too.
function isFree(patch, side) { return patch.sideCount.get(pointKey(side.middle)) === 1; }

// Order sides for placing polygons: clockwise from straight up by their
// middles, except that sides lying on the y axis go last (as in
// ANTWERP).
function compareSides(s, t) {
  const sOnAxis = isZero(s.a[0]) && isZero(s.b[0]), tOnAxis = isZero(t.a[0]) && isZero(t.b[0]);
  if (sOnAxis !== tOnAxis) return sOnAxis ? 1 : -1;
  return compareClockwise(s.middle, t.middle);
}

// Stage 1 of the paper: the seed, then each phase on the free sides of
// the phase before it.
function placePolygons(reading) {
  const patch = makePatch();
  const seed = seedPolygon(reading.seed);
  addToPatch(patch, seed);
  let previous = [seed];
  reading.phases.forEach(function (phase, p) {
    const sides = previous.flatMap(polygonSides).sort(compareSides);
    const placed = [];
    let skip = 0;   // how many free sides the 0s so far keep free
    for (const count of phase) {
      if (count === 0) { skip++; continue; }
      let free = 0, side = null;
      for (const s of sides) {
        if (!isFree(patch, s)) continue;
        if (free === skip) { side = s; break; }
        free++;
      }
      if (!side) throw new Error("Phase " + (p + 2) + " has more polygons than there are free sides to put them on.");
      const polygon = polygonOnSide(count, side.a, side.b);
      if (!addToPatch(patch, polygon)) throw new Error("Phase " + (p + 2) + " puts a polygon on top of another one.");
      placed.push(polygon);
    }
    previous = placed;
  });
  return patch;
}

// The points a move can be around (paper, Section 3.2.2): polygon
// middles (c), corners (v) and side middles (h), each with the direction
// of its mirror line (as in mirrorThrough). Numbered from 1 within
// each kind, clockwise from straight up, nearest first at the same
// angle; the middle of the plane is left out.
function movePoints(patch) {
  const found = new Map();
  // m is the mirror line's direction; left out, it is at right angles
  // to the line from the middle of the plane.
  const add = function (kind, p, m) {
    if (isZero(p[0]) && isZero(p[1])) return;
    const key = pointKey(p);
    if (!found.has(key)) found.set(key, { kind: kind, p: p, m: m === undefined ? mirrorAcross(p) : m });
  };
  for (const polygon of patch.polygons) add("c", polygonMiddle(polygon));
  for (const polygon of patch.polygons) {
    for (const side of polygonSides(polygon)) {
      add("v", side.a);
      add("h", side.middle, 2 * directionOf(side.a, side.b));   // along the side: m = 2k
    }
  }
  const sorted = Array.from(found.values()).sort(function (s, t) { return compareClockwise(s.p, t.p); });
  const named = new Map(), counts = { c: 0, v: 0, h: 0 };
  for (const point of sorted) named.set(point.kind + (++counts[point.kind]), point);
  named.counts = counts;
  return named;
}

// The moves of one block of the code (one "m30" makes several), as
// moves of the plane.
function movesOf(step, patch) {
  if (step.point) {
    const points = movePoints(patch);
    const point = points.get(step.point);
    if (!point) {
      const kind = step.point[0], count = points.counts[kind];
      throw new Error("\"" + step.text + "\": there is no point " + step.point + " (there are " + count + " " +
        { c: "polygon middles", v: "corners", h: "side middles" }[kind] + " to choose from at this step).");
    }
    if (step.kind === "r") return [halfTurnAround(point.p)];
    if (point.m < 0) throw new Error("\"" + step.text + "\": that mirror line can't be part of a tiling.");
    return [mirrorThrough(point.p, point.m)];
  }
  // Around the middle: angle, 2 x angle, 4 x angle, ... under 360. A
  // turn by a clockwise is r = -a / 15. A mirror line a clockwise from
  // straight up has the angle 90 - a counterclockwise from the x axis,
  // so m = 2 (90 - a) / 15.
  const list = [];
  for (let a = step.angle; a < 360; a *= 2) {
    list.push(step.kind === "r"
      ? { r: ((-a / 15) % 24 + 24) % 24, f: 0, t: [ZERO, ZERO] }
      : mirrorThrough([ZERO, ZERO], (180 - 2 * a) / 15));
  }
  return list;
}

// Read a code and do each move once (stage 2 of the paper). Returns the
// first polygons and every move of the code, which together make the
// whole tiling. If "eachBlock" is given, eachBlock(text, patch) is
// called after each block of the code, with the patch so far.
function tilingSeed(code, eachBlock) {
  const reading = readCode(code);
  const patch = placePolygons(reading);
  if (eachBlock) eachBlock(reading.text, patch);
  const firstPolygons = patch.polygons.slice();
  const moves = [];
  for (const step of reading.moves) {
    for (const m of movesOf(step, patch)) {
      moves.push(m);
      for (const polygon of patch.polygons.slice()) addToPatch(patch, movePolygon(m, polygon));
    }
    if (eachBlock) eachBlock(step.text, patch);
  }
  if (moves.length === 0) throw new Error("A tiling needs at least one move after the polygons (like /m30/r(h2)).");
  return { firstPolygons: firstPolygons, moves: moves, patch: patch };
}

// The code built one block at a time, for the help page
// (help/gomjau-hogg.html). Returns { steps, problem }: for the polygons,
// then each move, a step { text, polygons, points } with the polygons
// so far (each { sides, corners }) and the points c1, v1, h1, ... that
// a move after it can be around (each { name, at }), in ordinary
// numbers; "problem" is what is wrong with the code (null if nothing),
// and the steps stop where it went wrong.
function codeSteps(code) {
  const steps = [];
  try {
    tilingSeed(code, function (text, patch) {
      steps.push({
        text: text,
        polygons: patch.polygons.map(function (polygon) {
          return { sides: polygon.sides, corners: polygon.corners.map(pointToNumbers) };
        }),
        points: Array.from(movePoints(patch), function ([name, point]) {
          return { name: name, at: pointToNumbers(point.p) };
        }),
      });
    });
    return { steps: steps, problem: null };
  } catch (error) {
    return { steps: steps, problem: error.message };
  }
}


/* =====================================================================
   6. THE REPEATING BLOCK
   ---------------------------------------------------------------------
   Every move of the code, and every combination of them, carries the
   tiling onto itself; together they are the tiling's symmetries (its
   wallpaper group). Forgetting the shift, each symmetry is one of a few
   turns and mirrors (the "point group"); the symmetries that only shift
   are the steps the tiling repeats by. Both come straight from the
   moves of the code:
     1. Combine the moves until every turn and mirror they make has
        been seen, keeping one symmetry for each (its "representative").
     2. For each representative c and each move s, the symmetry s c
        has a representative c' with the same turn or mirror, so
        c'^-1 s c only shifts. These shifts give every repeating step
        (Schreier's lemma: O. Schreier, Die Untergruppen der freien
        Gruppen, Abh. Math. Sem. Hamburg 5 (1927); see also A. Seress,
        Permutation Group Algorithms, 2003, Lemma 4.2.1).
     3. Write them in terms of two of them that point different ways,
        and find two steps that make all of them (as with whole numbers,
        by Euclid's algorithm; H. Cohen, A Course in Computational
        Algebraic Number Theory, 1993, Sec. 2.4.2).
     4. Make those two as short as possible: then t1 is the shortest
        step and t2 the shortest one in another direction (Lagrange's
        and Gauss's reduction; J. W. S. Cassels, An Introduction to the
        Geometry of Numbers, 1959, Ch. I).
   ===================================================================== */

// The move that undoes m.
function undoMove(m) {
  const linear = { r: m.f ? m.r : (24 - m.r) % 24, f: m.f, t: [ZERO, ZERO] };
  return { r: linear.r, f: m.f, t: pointScale(fraction(-1), move(linear, m.t)) };
}

function isPureShift(m) { return m.r === 0 && m.f === 0; }

// Step 1: one symmetry for each turn or mirror the moves make.
function representatives(moves) {
  const found = new Map([["0,0", STAY]]);
  const queue = [STAY];
  for (let head = 0; head < queue.length; head++) {
    for (const m of moves) {
      const next = combine(m, queue[head]);
      const key = next.r + "," + next.f;
      if (!found.has(key)) { found.set(key, next); queue.push(next); }
    }
  }
  return found;
}

// Step 2: shifts that, combined, make every repeating step.
function repeatingSteps(moves, reps) {
  const steps = [];
  for (const c of reps.values()) {
    for (const m of moves) {
      const next = combine(m, c);
      const shift = combine(undoMove(reps.get(next.r + "," + next.f)), next);
      if (!isPureShift(shift)) throw new Error("A combination of moves came out wrong (this is a bug).");
      if (!(isZero(shift.t[0]) && isZero(shift.t[1]))) steps.push(shift.t);
    }
  }
  return steps;
}

// Whole numbers: the largest common factor g of a and b, with p and q
// so that p a + q b = g (Euclid's algorithm, kept track of).
function euclid(a, b) {
  let [r0, r1, p0, p1, q0, q1] = [a, b, 1n, 0n, 0n, 1n];
  while (r1 !== 0n) {
    const k = r0 / r1;
    [r0, r1, p0, p1, q0, q1] = [r1, r0 - k * r1, p1, p0 - k * p1, q1, q0 - k * q1];
  }
  return r0 < 0n ? [-r0, -p0, -q0] : [r0, p0, q0];
}

// Step 3: two steps that make every step in the list (and nothing
// more). Each step is s b1 + u b2 for fractions s and u; times the
// common denominator D they are whole numbers, and Euclid's algorithm
// brings the pairs down to two: (x, y) and (0, z).
function stepsBasis(steps) {
  const b1 = steps[0];
  const b2 = steps.find(function (p) { return !isZero(cross(b1, p)); });
  if (!b2) throw new Error("This code only repeats in one direction, so it can't cover the plane.");
  const places = steps.map(function (p) {
    const place = blockPlace(p, b1, b2);
    for (const v of place) {
      if (v.n[1] !== 0n || v.n[2] !== 0n || v.n[3] !== 0n) throw new Error("This code's moves don't fit together into a grid of blocks, so they can't make a tiling.");
    }
    return place;
  });
  let D = 1n;
  for (const [s, u] of places) D = D * s.den / bigGcd(D, s.den), D = D * u.den / bigGcd(D, u.den);
  let [x, y, z] = [D, 0n, D];   // b1 is (D, 0) and b2 is (0, D)
  for (const [s, u] of places) {
    const a = s.n[0] * (D / s.den), b = u.n[0] * (D / u.den);
    const [g, p, q] = euclid(x, a);
    z = bigGcd(z, (a / g) * y - (x / g) * b);
    [x, y] = [g, p * y + q * b];
  }
  const along = function (i, j) {   // (i b1 + j b2) / D
    return pointScale(exact(1n, 0n, 0n, 0n, D), pointPlus(pointScale(exact(i, 0n, 0n, 0n), b1), pointScale(exact(j, 0n, 0n, 0n), b2)));
  };
  return [along(x, y), along(0n, z)];
}

// Step 4: the shortest two steps (Lagrange's reduction), t2
// counterclockwise from t1.
function shortestSteps(t1, t2) {
  const shorter = function (p, q) { return sign(minus(dot(p, p), dot(q, q))) < 0; };
  if (shorter(t2, t1)) [t1, t2] = [t2, t1];
  for (;;) {
    const k = floorOf(plus(over(dot(t1, t2), dot(t1, t1)), fraction(1, 2)));
    t2 = pointMinus(t2, pointScale(fraction(k), t1));
    if (!shorter(t2, t1)) break;
    [t1, t2] = [t2, t1];
  }
  if (sign(cross(t1, t2)) < 0) t2 = pointScale(fraction(-1), t2);
  return [t1, t2];
}

// The repeating steps t1, t2, and one symmetry for each kind of turn
// and mirror ("turns").
function latticeOf(seed) {
  const reps = representatives(seed.moves);
  const steps = repeatingSteps(seed.moves, reps);
  if (steps.length === 0) throw new Error("This code doesn't repeat, so it can't cover the plane.");
  const [t1, t2] = shortestSteps.apply(null, stepsBasis(steps));
  return { t1: t1, t2: t2, turns: Array.from(reps.values()) };
}

// Where the point p is in the grid of blocks: [s, u] with
// p = s t1 + u t2 (exact; s and u needn't be whole).
function blockPlace(p, t1, t2) {
  const det = cross(t1, t2);
  return [over(cross(p, t2), det), over(cross(t1, p), det)];
}

// The polygon shifted by the step p.
function shiftBy(polygon, p) {
  return { sides: polygon.sides, corners: polygon.corners.map(function (c) { return pointPlus(c, p); }) };
}

// Shift the polygon by i t1 + j t2.
function shiftPolygon(polygon, i, j, t1, t2) {
  return shiftBy(polygon, pointPlus(pointScale(fraction(i), t1), pointScale(fraction(j), t2)));
}

// The polygon shifted by whole steps so its middle is in the block
// { s t1 + u t2 : 0 <= s, u < 1 }.
function intoBlock(polygon, t1, t2) {
  const [s, u] = blockPlace(polygonMiddle(polygon), t1, t2);
  return shiftPolygon(polygon, -floorOf(s), -floorOf(u), t1, t2);
}

// A name for a polygon that two polygons share only when they are the
// same polygon.
function polygonKey(polygon) {
  return polygon.sides + ":" + polygon.corners.map(pointKey).sort().join("|");
}

// One polygon in the block for each one in the tiling: the code's first
// polygons, moved by each kind of turn and mirror, then into the block.
function blockPolygons(seed, lattice) {
  const cells = [], keys = new Set();
  for (const m of lattice.turns) {
    for (const polygon of seed.firstPolygons) {
      const moved = intoBlock(movePolygon(m, polygon), lattice.t1, lattice.t2);
      const key = polygonKey(moved);
      if (!keys.has(key)) { keys.add(key); cells.push(moved); }
    }
  }
  return cells;
}

// The code's moves can make only some of the tiling's symmetries. In
// 3/m30/r(h2), for example, they only shift the triangles by sqrt(3)
// steps, though the triangles repeat every 1 step. So the block can be
// bigger than it has to be. A shift that carries the block's polygons
// onto themselves (up to whole steps) is a repeating step too, and
// moves the first polygon onto another of its kind; trying each of
// those finds them all. Returns the smallest block, its cells in a
// steady order (by kind, then by place), so the same code always
// numbers its cells the same way.
function smallestBlock(cells, lattice) {
  const { t1, t2 } = lattice;
  const keys = new Set(cells.map(polygonKey));
  const isRepeat = function (step) {
    return cells.every(function (cell) { return keys.has(polygonKey(intoBlock(shiftBy(cell, step), t1, t2))); });
  };
  const steps = [t1, t2];
  const first = polygonMiddle(cells[0]);
  for (const cell of cells.slice(1)) {
    if (cell.sides !== cells[0].sides) continue;
    const step = pointMinus(polygonMiddle(cell), first);
    if (isRepeat(step)) steps.push(step);
  }
  let block = { t1: t1, t2: t2, cells: cells };
  if (steps.length > 2) {
    const [s1, s2] = shortestSteps.apply(null, stepsBasis(steps));
    const smaller = new Map();
    for (const cell of cells) {
      const moved = intoBlock(cell, s1, s2);
      smaller.set(polygonKey(moved), moved);
    }
    block = { t1: s1, t2: s2, cells: Array.from(smaller.values()) };
  }
  block.cells.sort(function (a, b) {
    if (a.sides !== b.sides) return a.sides - b.sides;
    const [ax, ay] = pointToNumbers(polygonMiddle(a)), [bx, by] = pointToNumbers(polygonMiddle(b));
    return ay - by || ax - bx;
  });
  return block;
}


/* =====================================================================
   7. CHECKING THE BLOCK IS A TILING
   ---------------------------------------------------------------------
   The block's polygons, repeated, tile the plane exactly when
     - every side is shared with exactly one other polygon,
     - the angles at every corner add up to 360 degrees, and
     - the polygons' areas add up to the block's area |t1 x t2|
       (with gaps they'd add up to less, with overlaps to more).
   The kinds of corner come from the polygons around each corner, in
   order around it, written as in Cundy and Rollett's notation (H. M.
   Cundy and A. P. Rollett, Mathematical Models, 1961): "3.4.6.4" is a
   triangle, square, hexagon and square around a corner.
   ===================================================================== */

// The block's polygons and their copies in the blocks around it (up to
// "reach" blocks away), with an index of where each side and corner is.
function blockNeighborhood(cells, lattice, reach) {
  const sides = new Map(), corners = new Map();
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      cells.forEach(function (cell, k) {
        const copy = shiftPolygon(cell, i, j, lattice.t1, lattice.t2);
        polygonSides(copy).forEach(function (side, e) {
          const key = pointKey(side.middle);
          if (!sides.has(key)) sides.set(key, []);
          sides.get(key).push({ k: k, i: i, j: j, e: e });
        });
        copy.corners.forEach(function (c, e) {
          const key = pointKey(c);
          if (!corners.has(key)) corners.set(key, []);
          corners.get(key).push({ k: k, i: i, j: j, e: e, polygon: copy });
        });
      });
    }
  }
  return { sides: sides, corners: corners };
}

// For each cell and each of its sides, the cell across it: [k, i, j].
function cellsAcross(cells, near) {
  return cells.map(function (cell, k) {
    return polygonSides(cell).map(function (side) {
      const others = near.sides.get(pointKey(side.middle)).filter(function (o) { return !(o.k === k && o.i === 0 && o.j === 0); });
      if (others.length === 0) throw new Error("This code leaves gaps: a side has nothing across it.");
      if (others.length > 1) throw new Error("This code makes polygons overlap: a side is shared by three polygons.");
      return [others[0].k, others[0].i, others[0].j];
    });
  });
}

// The polygons around the corner p, in order counterclockwise around it.
function polygonsAround(p, near) {
  const around = near.corners.get(pointKey(p)).slice();
  const [px, py] = pointToNumbers(p);
  const angleOf = function (o) {
    const [mx, my] = pointToNumbers(polygonMiddle(o.polygon));
    return Math.atan2(my - py, mx - px);
  };
  return around.sort(function (a, b) { return angleOf(a) - angleOf(b); });
}

// "3.4.6.4": the polygons' sides around a corner, read the way that
// comes first (smallest), going either way around and starting anywhere.
function cornerName(sidesAround) {
  let best = null;
  const n = sidesAround.length;
  for (const list of [sidesAround, sidesAround.slice().reverse()]) {
    for (let s = 0; s < n; s++) {
      const read = list.slice(s).concat(list.slice(0, s));
      if (best === null || compareLists(read, best) < 0) best = read;
    }
  }
  return best.join(".");
}
function compareLists(a, b) {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

function checkBlock(cells, lattice, near) {
  // Areas.
  let area = ZERO;
  for (const cell of cells) area = plus(area, regularArea(cell.sides));
  let blockArea = cross(lattice.t1, lattice.t2);
  if (sign(blockArea) < 0) blockArea = negate(blockArea);
  const compare = sign(minus(area, blockArea));
  if (compare < 0) throw new Error("This code leaves gaps between the polygons.");
  if (compare > 0) throw new Error("This code makes polygons overlap.");
  // Angles at the corners, and the kinds of corner.
  const kinds = new Set();
  for (const cell of cells) {
    for (const c of cell.corners) {
      const around = polygonsAround(c, near);
      let total = 0;
      for (const o of around) total += cornerAngle(o.polygon.sides);
      if (total !== 360) throw new Error("This code doesn't close up: the angles at a corner add up to " + total + " degrees, not 360.");
      kinds.add(cornerName(around.map(function (o) { return o.polygon.sides; })));
    }
  }
  return Array.from(kinds).sort();
}


/* =====================================================================
   THE MAIN FUNCTION
   ===================================================================== */

// The repeating block of the tiling with this GomJau-Hogg code, as
// described at the top of this file. Throws an Error with a message in
// plain words if the code isn't a tiling.
function tilingFromCode(code) {
  const seed = tilingSeed(code);
  const symmetries = latticeOf(seed);
  const block = smallestBlock(blockPolygons(seed, symmetries), symmetries);
  const near = blockNeighborhood(block.cells, block, 2);
  const across = cellsAcross(block.cells, near);
  const vertexTypes = checkBlock(block.cells, block, near);
  return {
    code: code,
    t1: pointToNumbers(block.t1),
    t2: pointToNumbers(block.t2),
    cells: block.cells.map(function (cell, k) {
      return {
        sides: cell.sides,
        corners: cell.corners.map(pointToNumbers),
        middle: pointToNumbers(polygonMiddle(cell)),
        next: across[k],
      };
    }),
    vertexTypes: vertexTypes,
    exact: { block: block, near: near },   // for cornersBlock
  };
}


// The tiling with this code as the sims use it: the block from
// uprightBlock, with the tiles or (corners true) the corners as the
// cells; or, on the pages that load js/sim-penrose.js, the Penrose
// tiling with this code (PENROSE_TILINGS). Throws an Error with a
// message in plain words if the code is neither.
function tilingBlock(code, corners) {
  const penrose = typeof penroseFromCode === "undefined" ? null : penroseFromCode(code, corners);
  if (penrose) return penrose;
  const block = tilingFromCode(code);
  return uprightBlock(corners ? cornersBlock(block) : block);
}


/* =====================================================================
   8. THE CORNERS AS CELLS (THE DUAL TILING)
   ---------------------------------------------------------------------
   Put a cell on every corner of the tiling, and make two of them
   neighbors when a side of the tiling joins them. The cell drawn for a
   corner is the polygon through the middles of the polygons around it
   (for the 11 tilings with one kind of corner, these are the Laves
   tilings, like the Cairo pentagons; Grunbaum and Shephard, Tilings and
   Patterns, 1987, Sec. 2.7). Sides of the new cell cross the old sides
   at the corner, so side e of the new cell (from the middle of polygon
   e to the middle of polygon e + 1 around the corner) has across it the
   corner at the other end of the side between those two polygons.
   ===================================================================== */

function cornersBlock(block) {
  const { near } = block.exact, lattice = block.exact.block, cells = lattice.cells;
  // One corner of each kind up to the repeating steps: each moved into
  // the block, with a number.
  const placed = [], index = new Map();
  const homeOf = function (p) {
    const [s, u] = blockPlace(p, lattice.t1, lattice.t2);
    const i = floorOf(s), j = floorOf(u);
    const home = pointMinus(p, pointPlus(pointScale(fraction(i), lattice.t1), pointScale(fraction(j), lattice.t2)));
    return { home: home, i: i, j: j };
  };
  for (const cell of cells) {
    for (const c of cell.corners) {
      const { home } = homeOf(c);
      const key = pointKey(home);
      if (!index.has(key)) { index.set(key, placed.length); placed.push(home); }
    }
  }
  const newCells = placed.map(function (corner) {
    const around = polygonsAround(corner, near);
    const middles = around.map(function (o) { return polygonMiddle(o.polygon); });
    const next = around.map(function (o, e) {
      const after = around[(e + 1) % around.length].polygon;
      // The side of o.polygon from this corner that "after" also has:
      // its other end.
      const corners = o.polygon.corners, n = corners.length, at = o.e;
      const sideKeys = new Set(polygonSides(after).map(function (s) { return pointKey(s.middle); }));
      let other = null;
      for (const neighbor of [corners[(at + 1) % n], corners[(at + n - 1) % n]]) {
        if (sideKeys.has(pointKey(sideMiddle(corner, neighbor)))) other = neighbor;
      }
      if (!other) throw new Error("Couldn't find the side between two polygons around a corner.");
      const { home, i, j } = homeOf(other);
      return [index.get(pointKey(home)), i, j];
    });
    return {
      sides: around.length,
      corners: middles.map(pointToNumbers),
      middle: pointToNumbers(corner),
      next: next,
    };
  });
  return {
    code: block.code,
    t1: block.t1, t2: block.t2,
    cells: newCells,
    vertexTypes: block.vertexTypes,
    corners: true,
  };
}


/* =====================================================================
   9. READY FOR THE SIMS: ROWS ACROSS
   ---------------------------------------------------------------------
   The sims lay blocks side by side in rows, in a box or a torus. For
   that, uprightBlock turns the tiling so a shortest step points
   straight right (the triangles then point up and down, as on the
   other pages), and, when the tiling repeats straight up too, makes
   the block a rectangle:
       a = [A, 0]   the step to the next block to the right
       b = [0, B]   the step to the block above
   Every tiling with a turn or a mirror in it has such a rectangle (its
   lattice is square, hexagonal or rectangular, possibly centered); one
   without has a slanted b, and its blocks are parallelograms. The
   cells are as in tilingFromCode, with next[e] = [k, I, J]: across side
   e is cell k of the block I steps right and J up. This part works with
   ordinary numbers, rounded to 6 decimals to match points: everything
   here is a sum of a few whole steps of a block that is already exact.
   ===================================================================== */

const MOST_STEPS = 12;   // how many steps along t1 and t2 to look for a rectangle

function uprightBlock(block) {
  const [a, turned] = turnedSteps(block);
  const t1 = turned(block.t1), t2 = turned(block.t2);
  const b = stepStraightUp(t1, t2, a) || stepUpSlanted(t1, t2);
  const old = block.cells.map(function (cell) {
    return { sides: cell.sides, corners: cell.corners.map(turned), middle: turned(cell.middle), next: cell.next };
  });
  // The cells of the new block: the old cells, shifted by whole steps,
  // whose middles are in it.
  const place = blockCoordinates(a, b);
  const cells = [], index = new Map();
  const spread = Math.ceil(Math.max(Math.hypot(...a), Math.hypot(...b)) / Math.min(Math.hypot(...t1), Math.hypot(...t2))) + 2;
  old.forEach(function (cell, k) {
    for (let i = -spread; i <= spread; i++) {
      for (let j = -spread; j <= spread; j++) {
        const shift = [i * t1[0] + j * t2[0], i * t1[1] + j * t2[1]];
        const middle = [cell.middle[0] + shift[0], cell.middle[1] + shift[1]];
        const [I, J] = place(middle);
        if (I !== 0 || J !== 0) continue;
        index.set(numberKey(middle), cells.length);
        cells.push({ sides: cell.sides, from: k, shift: [i, j], middle: middle,
                     corners: cell.corners.map(function (c) { return [c[0] + shift[0], c[1] + shift[1]]; }) });
      }
    }
  });
  // Who is across each side, as a cell of the new blocks.
  for (const cell of cells) {
    cell.next = old[cell.from].next.map(function ([k, i, j]) {
      const s = i + cell.shift[0], u = j + cell.shift[1];
      const middle = [old[k].middle[0] + s * t1[0] + u * t2[0], old[k].middle[1] + s * t1[1] + u * t2[1]];
      const [I, J] = place(middle);
      const home = [middle[0] - I * a[0] - J * b[0], middle[1] - I * a[1] - J * b[1]];
      return [index.get(numberKey(home)), I, J];
    });
    delete cell.from;
    delete cell.shift;
  }
  return { code: block.code, a: a, b: b, rectangle: Math.abs(b[0]) < 1e-9, cells: cells,
           vertexTypes: block.vertexTypes, corners: Boolean(block.corners) };
}

// The step a (a shortest step, turned to point straight right), and the
// turn that takes it there. Of the shortest steps, the one closest to
// pointing right is turned, so a tiling that has one pointing right
// isn't turned at all.
function turnedSteps(block) {
  const t1 = block.t1, t2 = block.t2;
  const length = Math.hypot(...t1);
  let best = t1;
  for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const v = [i * t1[0] + j * t2[0], i * t1[1] + j * t2[1]];
    if (Math.abs(Math.hypot(...v) - length) > 1e-9) continue;
    const angle = Math.atan2(v[1], v[0]), bestAngle = Math.atan2(best[1], best[0]);
    // closest to pointing right; of two as close, the one pointing up a little
    if (Math.abs(angle) < Math.abs(bestAngle) - 1e-9 || (Math.abs(Math.abs(angle) - Math.abs(bestAngle)) < 1e-9 && angle > bestAngle)) best = v;
  }
  const c = best[0] / length, s = -best[1] / length;   // turn by minus best's angle
  const turned = function (p) { return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; };
  return [[length, 0], turned];
}

// The shortest whole step i t1 + j t2 that points straight up, or null
// if there is none (a slanted lattice).
function stepStraightUp(t1, t2, a) {
  let best = null;
  for (let i = -MOST_STEPS; i <= MOST_STEPS; i++) {
    for (let j = -MOST_STEPS; j <= MOST_STEPS; j++) {
      const v = [i * t1[0] + j * t2[0], i * t1[1] + j * t2[1]];
      if (v[1] < 1e-9 || Math.abs(v[0]) > 1e-9 * Math.abs(a[0])) continue;
      if (best === null || v[1] < best[1]) best = [0, v[1]];
    }
  }
  return best;
}

// For a slanted lattice, the step to the row of blocks above: of the
// whole steps that point up, the lowest, and of those the least
// slanted. (The lowest rise of any step is the block's area over A, so
// this b and a together reach every block.)
function stepUpSlanted(t1, t2) {
  let best = null;
  for (let i = -MOST_STEPS; i <= MOST_STEPS; i++) {
    for (let j = -MOST_STEPS; j <= MOST_STEPS; j++) {
      const v = [i * t1[0] + j * t2[0], i * t1[1] + j * t2[1]];
      if (v[1] < 1e-9) continue;
      if (best === null || v[1] < best[1] - 1e-9 ||
          (Math.abs(v[1] - best[1]) < 1e-9 && Math.abs(v[0]) < Math.abs(best[0]))) best = v;
    }
  }
  return best;
}

// The block [I, J] a point is in, for blocks at I a + J b: the whole
// numbers below its place, with a little room so points on a block's
// left or lower edge count as in it.
function blockCoordinates(a, b) {
  const det = a[0] * b[1] - a[1] * b[0];
  return function (p) {
    const s = (p[0] * b[1] - p[1] * b[0]) / det, u = (a[0] * p[1] - a[1] * p[0]) / det;
    return [Math.floor(s + 1e-9), Math.floor(u + 1e-9)];
  };
}

// A name for a point, the same for points equal to 6 decimals.
function numberKey(p) { return Math.round(p[0] * 1e6) + "," + Math.round(p[1] * 1e6); }


/* =====================================================================
   10. THE TILINGS IN THE MENUS
   ---------------------------------------------------------------------
   The 11 tilings where every corner looks the same (the 3 regular ones
   and the 8 Archimedean ones; that these are all of them is in
   Grunbaum and Shephard, Tilings and Patterns, 1987, Sec. 2.1), and the
   20 with two kinds of corner ("2-uniform"; Sec. 2.2 there), named as
   in Cundy and Rollett. The codes are the paper's Table 1, except two
   that make a different tiling than the one named there (the paper's
   own Figure 11 shows 3-6/m30/r(c2) with corners where three hexagons
   meet): for 3⁶; 3².6² the code is 3-6/m30/r(h2) instead, and for
   [3³.4²; 3².4.3.4]² it is 4-3,3,3-4,3/r(h4)/r(h4)/r(h15). The check
   page builds every one and checks its kinds of corner. "kinds" is the
   number of kinds of corner (for the menu's headings).
   ===================================================================== */

const TILINGS = [
  { name: "Squares (4⁴)", code: "4/m45/r(h1)", kinds: 1 },
  { name: "Triangles (3⁶)", code: "3/m30/r(h2)", kinds: 1 },
  { name: "Hexagons (6³)", code: "6/m30/r(h1)", kinds: 1 },
  { name: "Truncated hexagonal (3.12²)", code: "12-3/m30/r(h3)", kinds: 1 },
  { name: "Rhombitrihexagonal (3.4.6.4)", code: "6-4-3/m30/r(c2)", kinds: 1 },
  { name: "Truncated trihexagonal (4.6.12)", code: "12-6,4/m30/r(c2)", kinds: 1 },
  { name: "Kagome (3.6.3.6)", code: "6-3-6/m30/r(v4)", kinds: 1 },
  { name: "Truncated square (4.8²)", code: "8-4/m90/r(h4)", kinds: 1 },
  { name: "Snub square (3².4.3.4)", code: "4-3-3,4/r90/r(h2)", kinds: 1 },
  { name: "Elongated triangular (3³.4²)", code: "4-3/m90/r(h2)", kinds: 1 },
  { name: "Snub hexagonal (3⁴.6)", code: "6-3-3/r60/r(h5)", kinds: 1 },
  { name: "3⁶; 3².4.3.4", code: "3-4-3/m30/r(c3)", kinds: 2 },
  { name: "3.4.6.4; 3².4.3.4", code: "6-4-3,3/m30/r(h1)", kinds: 2 },
  { name: "3.4.6.4; 3³.4²", code: "6-4-3-3/m30/r(h5)", kinds: 2 },
  { name: "3.4.6.4; 3.4².6", code: "6-4-3,4-6/m30/r(c4)", kinds: 2 },
  { name: "4.6.12; 3.4.6.4", code: "12-4,6-3/m30/r(c3)", kinds: 2 },
  { name: "3⁶; 3².4.12", code: "12-3,4-3/m30/r(c3)", kinds: 2 },
  { name: "3.12²; 3.4.3.12", code: "12-0,3,3-0,4/m45/m(h1)", kinds: 2 },
  { name: "3⁶; 3².6²", code: "3-6/m30/r(h2)", kinds: 2 },
  { name: "[3⁶; 3⁴.6]¹", code: "6-3,3-3/m30/r(h1)", kinds: 2 },
  { name: "[3⁶; 3⁴.6]²", code: "6-3-3,3-3/r60/r(h8)", kinds: 2 },
  { name: "3².6²; 3⁴.6", code: "6-3/m90/r(h1)", kinds: 2 },
  { name: "3.6.3.6; 3².6²", code: "6-3,6/m90/r(h3)", kinds: 2 },
  { name: "[3.4².6; 3.6.3.6]¹", code: "6-3,4-6-3,4-6,4/m90/r(c6)", kinds: 2 },
  { name: "[3.4².6; 3.6.3.6]²", code: "6-3,4/m90/r(h4)", kinds: 2 },
  { name: "[3³.4²; 3².4.3.4]¹", code: "4-3,3-4,3/r90/m(h3)", kinds: 2 },
  { name: "[3³.4²; 3².4.3.4]²", code: "4-3,3,3-4,3/r(h4)/r(h4)/r(h15)", kinds: 2 },
  { name: "[4⁴; 3³.4²]¹", code: "4-3/m(h4)/m(h3)/r(h2)", kinds: 2 },
  { name: "[4⁴; 3³.4²]²", code: "4-4-3-3/m90/r(h3)", kinds: 2 },
  { name: "[3⁶; 3³.4²]¹", code: "4-3,4-3,3/m90/r(h3)", kinds: 2 },
  { name: "[3⁶; 3³.4²]²", code: "4-3-3-3/m90/r(h7)/r(h5)", kinds: 2 },
];

// The tilings in the Lattice menus: TILINGS, and after them, on the
// pages that load js/sim-penrose.js, the Penrose tilings.
function menuTilings() {
  return typeof PENROSE_TILINGS === "undefined" ? TILINGS : TILINGS.concat(PENROSE_TILINGS);
}

// Put the tilings of menuTilings() in a <select> menu, under headings,
// each option's value its place in that list.
function addTilingOptions(menu) {
  const headings = { 1: "Every corner alike", 2: "Two kinds of corner", penrose: "Penrose (never repeats)" };
  let group = null;
  menuTilings().forEach(function (tiling, k) {
    if (!group || group.dataset.kinds !== String(tiling.kinds)) {
      group = document.createElement("optgroup");
      group.label = headings[tiling.kinds];
      group.dataset.kinds = tiling.kinds;
      menu.appendChild(group);
    }
    group.appendChild(new Option(tiling.name, String(k)));
  });
}

// A kind of corner the short way, as in Cundy and Rollett: 3.3.3.4.4
// is 3³.4² (a run of equal polygons gets a power).
function cornerShort(name) {
  const POWERS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const parts = name.split("."), out = [];
  for (let k = 0; k < parts.length; ) {
    let run = 1;
    while (k + run < parts.length && parts[k + run] === parts[k]) run++;
    out.push(parts[k] + (run > 1 ? String(run).split("").map(function (c) { return POWERS[c]; }).join("") : ""));
    k += run;
  }
  return out.join(".");
}
