/* =====================================================================
   sim-graphs.js  —  graphs beyond the square grid, shared by the sims
   ---------------------------------------------------------------------
   What it does, in plain words:
     Builds graphs that a sim can run on, ONE CELL AT A TIME, as the sim
     asks for them. That is what lets a mountain grow forever on the
     hyperbolic plane or on a tree, where "the whole graph" could never
     fit in the computer: the number of cells within distance R of a
     cell grows exponentially in R (true for every hyperbolic tiling
     {p,q} and every regular tree of degree 3 or more; R. Lyons and
     Y. Peres, "Probability on Trees and Networks", Cambridge 2016,
     Chapter 6).

   The graphs (cells are numbered 0, 1, 2, ... in the order they are
   made; cell 0 is the start):
     line          the whole numbers ..., -1, 0, 1, ...
     grid          the square grid, each cell joined to the 4 it shares
                   a side with
     tiling {p,q}  the hyperbolic plane tiled by regular p-gons, q of
                   them around each corner; cells are joined across
                   their sides, so each cell has p neighbors. It exists
                   exactly when 1/p + 1/q < 1/2 (H. S. M. Coxeter,
                   "Regular Polytopes", 3rd ed., Dover 1973).
     tree          the regular tree of degree d. It is drawn as the
                   tiling {d, infinity}: ideal d-gons (corners at
                   infinity, on the edge of the disk), joined across
                   their sides. Two such cells share at most a side and
                   never surround anything, so the cells and their
                   sides make exactly the tree (for d = 3 this is the
                   Farey tessellation).

   How the hyperbolic plane is drawn: the Poincare disk, the inside of
   the unit circle, where straight lines are circle arcs meeting the
   edge at right angles, and things shrink toward the edge. Its
   "rigid motions" are the maps
       z -> (a z + b) / (conj(b) z + conj(a)),   |a|^2 - |b|^2 = 1,
   for complex numbers a, b (A. F. Beardon, "The Geometry of Discrete
   Groups", Springer 1983, Chapter 7). Each cell remembers the motion
   [a, b] that carries the first cell (centered at 0) onto it, for
   drawing. The cell across side k of the first cell is where the
   first cell lands when turned half way around the middle of its side
   k (a "half-turn").

   Which cell is next to which, though, is NOT worked out from those
   motions far from the start, where the computer's numbers are too
   rough to tell cells apart: near the start, tilingRules learns the
   few kinds of cells and how their neighbors are found, and from then
   on cells are built from those rules with whole numbers only (see
   tilingRules).

   Sizes of the first cell (for a regular p-gon with angles 2 pi / q,
   cut into 2p right triangles with angles pi/p and pi/q; Beardon,
   Chapter 7, the formulas for triangles with a right angle):
       cosh(inradius)     = cos(pi/q) / sin(pi/p)
       cosh(circumradius) = cot(pi/p) cot(pi/q)
       cosh(circumradius) = cosh(inradius) cosh(half a side)
   A point at hyperbolic distance s from 0 sits at |z| = tanh(s/2).

   Contents (all of it also runs inside a sim's second thread, so the
   functions only call each other):
     makeGraph(spec)             a graph that grows as it is asked
     tilingShape(p, q)           the first cell's sizes and outline
     motionTimes, motionApply    composing and applying motions
     halfTurn(shape, k)          the half-turn about side k's middle
     tilingByGeometry, tilingByRules   the two ways of building a tiling
     learnedRules(shape)         a tiling's rules, learned once
     tilingRules(shape, cells)   the kinds of cells of a tiling
     testRules(shape, kinds)     checks them against geometry
     coshFromStart(motion)       how far a cell is from the start
     spreadPlace(graph, v)       where a tree's cell goes in the "spread out" picture
     hashTable()                 a fast table from pairs of numbers
     ballAround(graph, v, r)     the cells within distance r of v
   ===================================================================== */


// The first cell of the tiling {p,q} (q = Infinity for a tree): its
// inradius r and circumradius (hyperbolic), where the middle of each side is in the disk
// (sides[k] = [x, y]), and its outline as a list of points [x, y] in
// the disk, going around it (each side bent along its circle arc).
function tilingShape(p, q) {
  const inradius = Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / p));
  // Half the length of a side: infinite for a tree (ideal corners).
  const halfSide = q === Infinity ? Infinity
    : Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)) / Math.cosh(inradius));
  const middle = Math.tanh(inradius / 2);   // a side's middle, as |z| in the disk
  const sides = [], outline = [];
  const SAMPLES = 8;                        // points along each side
  for (let k = 0; k < p; k++) {
    const angle = 2 * Math.PI * k / p;      // side k faces this way
    sides.push([middle * Math.cos(angle), middle * Math.sin(angle)]);
    // Side k: the arc through its middle at right angles to the ray to
    // it. Turned to face along the x axis, it is the image of the y
    // axis under z -> (z + middle) / (1 + middle z); the point i t on
    // the y axis lands on it, with t = tanh(distance along the side / 2).
    const tEnd = halfSide === Infinity ? 1 : Math.tanh(halfSide / 2);
    for (let j = -SAMPLES; j < SAMPLES; j++) {
      const t = tEnd * Math.sin(Math.PI / 2 * j / SAMPLES);    // closer together near the corners
      // (i t + m) / (1 + m i t), worked out with complex numbers:
      const den = 1 + middle * middle * t * t;
      const x = (middle + middle * t * t) / den, y = (t - middle * middle * t) / den;
      outline.push([x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
    }
  }
  // The circumradius (middle to a corner): infinite for a tree.
  const circumradius = q === Infinity ? Infinity : Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
  return { p: p, q: q, inradius: inradius, circumradius: circumradius, middle: middle, sides: sides, outline: outline };
}

// Motions are kept as [a.re, a.im, b.re, b.im]. Doing motion B first,
// then A, is the motion "A times B":
//   a = a1 a2 + b1 conj(b2),   b = a1 b2 + b1 conj(a2).
function motionTimes(A, B) {
  const [ar, ai, br, bi] = A, [cr, ci, dr, di] = B;
  return [ar * cr - ai * ci + br * dr + bi * di,
          ar * ci + ai * cr + bi * dr - br * di,
          ar * dr - ai * di + br * cr + bi * ci,
          ar * di + ai * dr + bi * cr - br * ci];
}

// Where motion A takes the point (x, y): (a z + b) / (conj(b) z + conj(a)).
function motionApply(A, x, y) {
  const [ar, ai, br, bi] = A;
  const nr = ar * x - ai * y + br, ni = ar * y + ai * x + bi;     // a z + b
  const dr = br * x + bi * y + ar, di = br * y - bi * x - ai;     // conj(b) z + conj(a)
  const d2 = dr * dr + di * di;
  return [(nr * dr + ni * di) / d2, (ni * dr - nr * di) / d2];
}

// Make a graph. "spec" is one of
//   { kind: "line" }   { kind: "grid" }
//   { kind: "tiling", p, q }   (q = Infinity: the regular tree of degree p)
// The graph has:
//   count()          how many cells have been made so far
//   neighbors(v)     the cells next to cell v, in a fixed order (they
//                    are made the first time they are asked for). Past
//                    MAX_CELLS cells no new cells are made, and "full"
//                    becomes true.
//   place(v)         where cell v is: [x, y, 0, 0] on the line or grid,
//                    or its motion [a.re, a.im, b.re, b.im] on a tiling
//   order            on the line: order(v) = x, so a sim can keep cells
//                    in order from left to right; otherwise null
//   shape            on a tiling: tilingShape(p, q), for drawing
//   exact            false if a tiling had to be built by geometry (see
//                    below), which only reaches about distance 23
function makeGraph(spec) {
  const MAX_CELLS = 1000000;
  const places = [];               // places[v] = place(v)
  const nbrs = [];                 // nbrs[v] = cell v's neighbors, once made
  const cellAt = new Map();        // a cell's key (a short text) -> its number
  const graph = { count: function () { return places.length; },
                  place: function (v) { return places[v]; }, order: null, full: false, exact: true };

  // Make a cell with this key and place, or find the one already there.
  // Returns its number, or -1 if no more cells can be made.
  function cell(key, place) {
    const known = cellAt.get(key);
    if (known !== undefined) return known;
    if (places.length >= MAX_CELLS) { graph.full = true; return -1; }
    cellAt.set(key, places.length);
    places.push(place);
    return places.length - 1;
  }

  // --- The line and the grid: a cell is known by its coordinates. ---
  if (spec.kind === "line" || spec.kind === "grid") {
    // The neighbors, in this order. (For the grid it is the order of
    // the 2D mountain's "4 neighbors" tile, so the two number their
    // sites the same way.)
    const steps = spec.kind === "line" ? [[1, 0], [-1, 0]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (spec.kind === "line") graph.order = function (v) { return places[v][0]; };
    cell("0,0", [0, 0, 0, 0]);
    graph.neighbors = function (v) {
      if (!nbrs[v]) {
        const [x, y] = places[v];
        nbrs[v] = steps.map(function (s) { return cell((x + s[0]) + "," + (y + s[1]), [x + s[0], y + s[1], 0, 0]); });
      }
      return nbrs[v];
    };
    return graph;
  }

  // --- A hyperbolic tiling {p,q}, or a tree as {p, infinity}. ---
  // Built exactly from the tiling's rules (tilingByRules) when they can
  // be learned, which is so for every tree and most tilings with small
  // p and q (the ones whose mountains reach far out). Otherwise built by
  // geometry (tilingByGeometry), which only reaches about distance 23
  // from the start: beyond that the computer's numbers are too rough.
  graph.shape = tilingShape(spec.p, spec.q);
  const kinds = learnedRules(graph.shape);
  graph.exact = kinds !== null;
  if (graph.exact) tilingByRules(graph, kinds, MAX_CELLS);
  else tilingByGeometry(graph, MAX_CELLS);
  const cellNeighbors = graph.neighbors;
  graph.neighbors = function (v) {
    if (!nbrs[v]) nbrs[v] = cellNeighbors(v);
    return nbrs[v];
  };
  return graph;
}

// The half-turn about the middle m of side k of the first cell: move m
// to 0, turn by half a circle, move back. Worked out, it is the motion
// a = i cosh(r), b = -i sinh(r) e^(i angle), with r the inradius and
// angle = 2 pi k / p the direction of side k.
function halfTurn(shape, k) {
  const angle = 2 * Math.PI * k / shape.p;
  const c = Math.cosh(shape.inradius), s = Math.sinh(shape.inradius);
  return [0, c, s * Math.sin(angle), -s * Math.cos(angle)];
}

// The rules of a tiling (tilingRules), learned from 60000 cells near
// the start, or if that isn't enough from 250000 (slower); null if they
// can't be learned. Learned rules are kept (in learnedRules.kept) so a
// tiling is only learned once.
function learnedRules(shape) {
  if (!learnedRules.kept) learnedRules.kept = new Map();
  const name = shape.p + "," + shape.q;
  if (!learnedRules.kept.has(name)) {
    let kinds = null;
    for (const cells of [60000, 250000]) {
      try { kinds = tilingRules(shape, cells); break; } catch (problem) { kinds = null; }
    }
    learnedRules.kept.set(name, kinds);
  }
  return learnedRules.kept.get(name);
}

// cosh of the hyperbolic distance from the start's middle to the middle
// of the cell with motion M (it is |a|^2 + |b|^2).
function coshFromStart(M) {
  return M[0] * M[0] + M[1] * M[1] + M[2] * M[2] + M[3] * M[3];
}

// THE TILING BY GEOMETRY. Fills in graph.count, place, neighbors (in the
// order of the first cell's sides), and full. The cell across side k of
// a cell with motion A has motion A H_k (H_k = halfTurn(shape, k)); each
// cell is known by where its middle is, on a grid of small squares. In
// the disk, middles crowd together near the edge, so the grid is laid
// on the "hyperboloid" picture of the plane instead, where they don't:
// the middle of the cell with motion [a, b] sits at the point 2 a b (a
// complex number) there, and two points at hyperbolic distance d are
// always at least d apart in that picture. A new cell is filed under
// every square within GRID / 4 of its middle and looked up in the one
// square its middle falls in; rounding errors move a middle by far less
// than GRID / 4, so a cell found twice always finds itself, and middles
// of different cells (at least 8 GRID apart) never share a square.
//   Far out, rounding errors grow with the size of the numbers (about
// 1e-14 of it), so cells are made only while 2 a b stays below
// GRID * 1e10: errors of at most about GRID / 10000. That is distance
// 22 to 25 from the start.
function tilingByGeometry(graph, maxCells) {
  const shape = graph.shape, p = shape.p;
  const GRID = shape.inradius / 4, FARTHEST = GRID * 1e10;
  const halfTurns = [];
  for (let k = 0; k < p; k++) halfTurns.push(halfTurn(shape, k));
  const places = [], squares = hashTable();
  graph.full = false;
  graph.count = function () { return places.length; };
  graph.place = function (v) { return places[v]; };

  // The cell with motion M, found or made; -1 if it can't be made.
  function find(M) {
    // Scale back to |a|^2 - |b|^2 = 1 exactly (rounding errors drift).
    const norm = Math.sqrt(M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3]);
    const ar = M[0] / norm, ai = M[1] / norm, br = M[2] / norm, bi = M[3] / norm;
    const X = 2 * (ar * br - ai * bi), Y = 2 * (ar * bi + ai * br);
    if (X * X + Y * Y > FARTHEST * FARTHEST) { graph.full = true; return -1; }
    const known = squares.find(Math.floor(X / GRID), Math.floor(Y / GRID));
    if (known !== -1) return known;
    if (places.length >= maxCells) { graph.full = true; return -1; }
    const v = places.length;
    places.push([ar, ai, br, bi]);
    for (const dx of [-GRID / 4, GRID / 4]) {
      for (const dy of [-GRID / 4, GRID / 4]) squares.file(Math.floor((X + dx) / GRID), Math.floor((Y + dy) / GRID), v);
    }
    return v;
  }
  find([1, 0, 0, 0]);                          // cell 0: the first cell, centered at 0
  graph.neighbors = function (v) {
    const found = [];
    for (const H of halfTurns) {
      const w = find(motionTimes(places[v], H));
      if (w >= 0) found.push(w);
    }
    return found;
  };
}

// THE TILING BY RULES. Fills in graph.count, place, neighbors and full,
// with cells built from the kinds learned by tilingRules, using whole
// numbers only, so it is exact however far out it goes. Each cell has
// its own numbering of its sides, going around it counterclockwise,
// with side 0 facing its "parent" (the neighbor it was made from, one
// step closer to the start); neighbors(v) lists them in that order.
function tilingByRules(graph, kinds, maxCells) {
  const shape = graph.shape, p = shape.p, q = shape.q;
  // The motion from a cell to its child across side i (so that the
  // child's side 0 faces back): turn so side 0 goes to side i, then
  // the half-turn about the middle of side i.
  const toChild = [];
  for (let i = 0; i < p; i++) {
    const turn = [Math.cos(Math.PI * i / p), Math.sin(Math.PI * i / p), 0, 0];   // z -> z turned by 2 pi i / p
    toChild.push(motionTimes(halfTurn(shape, i), turn));
  }
  const places = [];
  let room = 1 << 12;                          // cells the arrays have room for
  let across = new Int32Array(room * p).fill(-1);   // across[v p + i]: the cell across side i of v (-1: not found yet)
  let facing = new Int8Array(room * p);        // facing[v p + i]: the side of that cell that faces v
  let kindOf = new Int32Array(room);           // kindOf[v]: the kind of cell v
  graph.full = false;
  graph.count = function () { return places.length; };
  graph.place = function (v) { return places[v]; };

  function makeCell(kind, place) {
    if (places.length >= maxCells) { graph.full = true; return -1; }
    const v = places.length;
    if (v === room) {                          // out of room: twice as much
      room *= 2;
      const a = new Int32Array(room * p).fill(-1), f = new Int8Array(room * p), k = new Int32Array(room);
      a.set(across); f.set(facing); k.set(kindOf);
      across = a; facing = f; kindOf = k;
    }
    places.push(place);
    kindOf[v] = kind;
    return v;
  }
  // Join side i of v to side j of w.
  function join(v, i, w, j) {
    if (across[w * p + j] !== -1 && across[w * p + j] !== v) throw new Error("tiling rules broke at cell " + v);
    across[v * p + i] = w; facing[v * p + i] = j;
    across[w * p + j] = v; facing[w * p + j] = i;
  }

  // The cell across side i of cell v: already known, or made (if v is
  // its parent), or found by walking around a corner of v (the rule
  // says which). Every step of a walk asks for a neighbor of a cell
  // closer to the start than v, or crosses straight to a child or a
  // parent (see tilingRules), so this always finishes. Returns -1 if
  // no more cells can be made.
  function cross(v, i) {
    const known = across[v * p + i];
    if (known !== -1) return known;
    const kind = kinds[kindOf[v]];
    if (kind.owns[i]) {
      const u = makeCell(kind.child[i], motionTimes(places[v], toChild[i]));
      if (u >= 0) join(v, i, u, 0);
      return u;
    }
    // Around a corner: q - 1 steps from v, each time crossing the side
    // just after (turn +1) or just before (turn -1) the one we came in by.
    let x = v, side = kind.walk[i][0];
    const turn = kind.walk[i][1];
    for (let step = 1; step < q; step++) {
      const y = cross(x, side);
      if (y < 0) return -1;
      side = (facing[x * p + side] + turn + p) % p;
      x = y;
    }
    join(v, i, x, side);
    return x;
  }

  makeCell(0, [1, 0, 0, 0]);                   // cell 0: the first cell, centered at 0 (kind 0)
  // The parent of cell v (v > 0), and which of the parent's sides v is
  // across: [parent, side].
  graph.parent = function (v) { return [across[v * p], facing[v * p]]; };
  graph.neighbors = function (v) {
    const found = [];
    for (let i = 0; i < p; i++) {
      const w = cross(v, i);
      if (w >= 0) found.push(w);
    }
    return found;
  };
}

// THE RULES OF THE TILING {p,q}: what kinds of cells there are and how
// each kind's neighbors are found. A cell's kind says, for each of its
// sides (numbered from its parent, side 0), whether the cell across it
// is one step closer to the start, as close, or one step farther, and
// how the cells around each of its corners are placed. There are only
// a few kinds, and a cell's kind decides its children's kinds:
// hyperbolic tilings have finitely many "cone types" (J. W. Cannon,
// "The combinatorial structure of cocompact discrete hyperbolic
// groups", Geometriae Dedicata 16 (1984), 123-148).
//   The rules are read off the cells near the start, made by geometry,
// where the numbers are precise. Then they are tested: cells made by
// the rules are walked out to distance 14 along 40 random paths, and
// every neighbor of every cell on the way must be where geometry says.
// If the rules can't be learned from the cells near the start (very big
// tilings have too many cells to look far enough), or the test fails,
// this throws an error. Returns a list of kinds; kind 0 is the first
// cell. For kind t and side i:
//   kinds[t].owns[i]    true if the cell across side i is this cell's
//                       child (one step farther, and this cell is its
//                       parent);
//   kinds[t].child[i]   then the child's kind;
//   kinds[t].walk[i]    otherwise [start, turn]: the cell across side i
//                       is found by crossing side "start" and then going
//                       around the corner, crossing q - 1 sides in all,
//                       each time the side just after (turn +1) or just
//                       before (turn -1) the one we came in by.
function tilingRules(shape, cells) {
  const p = shape.p, q = shape.q;

  // 1. THE CELLS NEAR THE START, BY GEOMETRY, breadth first (layer by
  // layer), until there are "cells" of them. depth[v] is the number of
  // steps from the start to cell v; near[v] lists its neighbors (for
  // the cells that got that far, and not past where geometry stops).
  const sample = { shape: shape };
  tilingByGeometry(sample, Infinity);
  const depth = [0], near = [];
  for (let v = 0; v < sample.count() && sample.count() < cells; v++) {
    const around = sample.neighbors(v);
    if (around.length < p) break;
    near[v] = around;
    for (const w of around) if (depth[w] === undefined) depth[w] = depth[v] + 1;
  }
  const facingSide = function (v, k) { return near[near[v][k]].indexOf(v); };
  // A cell whose neighbors' neighbors are all known.
  const known = function (v) { return near[v] !== undefined && near[v].every(function (w) { return near[w] !== undefined; }); };

  // 2. EACH CELL'S PARENT. The neighbors one step closer to the start
  // are one side, or two sides next to each other; the parent is the
  // first of them going counterclockwise. "first[v]" is that side, in
  // the geometric numbering (so side i of the cell's own numbering is
  // geometric side first[v] + i).
  const first = [0];
  for (let v = 1; v < near.length; v++) {
    if (!near[v]) continue;
    const up = [];
    for (let k = 0; k < p; k++) if (depth[near[v][k]] === depth[v] - 1) up.push(k);
    if (up.length === 1) first[v] = up[0];
    else if (up.length === 2 && (up[0] + 1) % p === up[1]) first[v] = up[0];
    else if (up.length === 2 && (up[1] + 1) % p === up[0]) first[v] = up[1];
    else throw new Error("tiling {" + p + "," + q + "}: unexpected parents");
  }
  const geo = function (v, i) { return (first[v] + i) % p; };   // own side i -> geometric side

  // 3. KINDS. A cell's description: for each side (own numbering), -1,
  // 0 or +1 for a neighbor closer, as close, or farther, and "c" if
  // that neighbor is its child; then for each corner, how the cells
  // around it are placed (see aroundCorner).
  // (null if v is too far out for that: some cell needed isn't known.)
  function describe(v) {
    if (!known(v)) return null;
    let text = v === 0 ? "start" : "";
    for (let i = 0; i < p; i++) {
      const w = near[v][geo(v, i)];
      const owns = depth[w] === depth[v] + 1 && facingSide(v, geo(v, i)) === first[w];
      text += " " + (depth[w] - depth[v]) + (owns ? "c" : "");
    }
    for (let j = 0; j < p && q !== Infinity; j++) {
      const corner = aroundCorner(v, j);
      if (corner === null) return null;
      text += " /" + corner;
    }
    return text;
  }
  // The cells around the corner between own sides j and j + 1 of v,
  // going one way around and then the other: how much farther from the
  // start each is than v, up to the first that is 2 or more farther
  // (beyond that they are all farther still, and not needed).
  function aroundCorner(v, j) {
    let text = "";
    for (const [start, turn] of [[(j + 1) % p, 1], [j, -1]]) {
      let x = v, side = geo(v, start);
      for (let step = 1; step < q; step++) {
        const y = near[x][side], d = depth[y] - depth[v];
        text += " " + d;
        if (d >= 2) break;
        if (!near[y]) return null;
        side = (facingSide(x, side) + turn + p) % p;
        x = y;
      }
      text += " |";
    }
    return text;
  }
  // Which side of its parent cell v hangs from (parent's own numbering).
  const parentOf = function (v) { return near[v][first[v]]; };
  const slotOf = function (v) { return (facingSide(v, first[v]) - first[parentOf(v)] + p) % p; };
  // The description is not always enough to decide the children's
  // kinds, so a kind also remembers the descriptions of the cell's
  // parent, grandparent, ... ("history" generations back) and which
  // side of each it hangs from. The fewest generations that work are
  // used.
  function kindName(v, history) {
    const text = describe(v);
    if (v === 0 || history === 0 || text === null) return text;
    const before = kindName(parentOf(v), history - 1);
    return before === null ? null : text + " < " + slotOf(v) + before;
  }

  // Walk around a corner of v, starting across own side "start" and
  // turning by "turn" each time: the cells passed through, in order
  // (the last one is the cell across the side we wanted).
  // Returns null if it gets to cells that aren't known well enough.
  function walkAround(v, start, turn) {
    const passed = [];
    let x = v, side = geo(v, start);
    for (let step = 1; step < q; step++) {
      if (!known(x)) return null;
      const y = near[x][side];
      side = (facingSide(x, side) + turn + p) % p;
      x = y;
      passed.push(x);
    }
    return known(x) ? passed : null;
  }

  // The rules of cell v: for each side, whether v owns the cell across
  // it, and if not, a safe corner walk to it. A walk is safe if it
  // starts at a side of v whose rule is already settled, and every
  // cell it passes on the way either is closer to the start than v, or
  // crosses straight to its own child or its parent (no searching).
  // Then working out any cell's neighbors only ever asks for neighbors
  // of cells closer to the start, so it always finishes.
  // Returns null if v is too far out for its rules to be read off, and
  // throws an error if there is no safe walk to some neighbor.
  function rulesOf(v, kindOfCell) {
    const rule = { owns: [], child: [], walk: [] };
    const settled = [];
    for (let i = 0; i < p; i++) {
      const w = near[v][geo(v, i)];
      rule.owns[i] = depth[w] === depth[v] + 1 && facingSide(v, geo(v, i)) === first[w];
      if (rule.owns[i]) {
        if (kindOfCell[w] === undefined) return null;
        rule.child[i] = kindOfCell[w];
      }
      settled[i] = rule.owns[i] || (i === 0 && v !== 0);   // children, and the parent
    }
    let progress = q !== Infinity, tooFar = false;
    while (progress) {
      progress = false;
      for (let i = 0; i < p; i++) {
        if (settled[i]) continue;
        for (const [start, turn] of [[(i - 1 + p) % p, -1], [(i + 1) % p, 1]]) {
          if (!settled[start]) continue;
          const passed = walkAround(v, start, turn);
          if (passed === null) { tooFar = true; continue; }
          if (passed[passed.length - 1] !== near[v][geo(v, i)]) throw new Error("tiling {" + p + "," + q + "}: a corner walk went wrong");
          let safe = true;
          for (let j = 0; j < passed.length - 1; j++) {
            const x = passed[j], y = passed[j + 1];
            if (depth[x] < depth[v]) continue;
            const toChild = depth[y] === depth[x] + 1 && parentOf(y) === x;
            const toParent = x !== 0 && parentOf(x) === y;
            if (!toChild && !toParent) safe = false;
          }
          if (safe) { rule.walk[i] = [start, turn]; settled[i] = true; progress = true; break; }
        }
      }
    }
    if (settled.indexOf(false) === -1) return rule;
    if (tooFar) return null;
    throw new Error("tiling {" + p + "," + q + "}: no safe way to find a neighbor");
  }

  // 4. TRY 0, 1, 2, ... GENERATIONS OF HISTORY, until every cell of a
  // kind has the same rules, and every kind needed has its rules known.
  for (let history = 0; history <= 6; history++) {
    const kindOfCell = [], kinds = [], named = new Map();
    for (let v = 0; v < near.length; v++) {
      const name = kindName(v, history);
      if (name === null) continue;
      if (!named.has(name)) { named.set(name, kinds.length); kinds.push(null); }
      kindOfCell[v] = named.get(name);
    }
    let agree = true;
    for (let v = 0; v < near.length && agree; v++) {
      if (kindOfCell[v] === undefined) continue;
      const rule = rulesOf(v, kindOfCell);
      if (rule === null) continue;
      const t = kindOfCell[v];
      if (kinds[t] === null) kinds[t] = rule;
      else if (JSON.stringify(kinds[t]) !== JSON.stringify(rule)) agree = false;
    }
    // Every kind a cell can have (the first cell's, its children's,
    // their children's, ...) needs its rules.
    const needed = [0];
    for (let n = 0; agree && n < needed.length; n++) {
      if (kinds[needed[n]] === null) agree = false;
      else for (const c of kinds[needed[n]].child) if (c !== undefined && needed.indexOf(c) === -1) needed.push(c);
    }
    if (agree) {
      testRules(shape, kinds);
      return kinds;
    }
  }
  throw new Error("tiling {" + p + "," + q + "}: could not learn its kinds of cells");
}

// Test the rules of a tiling (see tilingRules): build cells by the
// rules, walk out from the start along 40 random paths to distance 14,
// and check every cell on the way: p different neighbors, each listing
// the cell back, each with its middle at distance 2 inradius from the
// cell's (where geometry says). Throws an error if any check fails.
function testRules(shape, kinds) {
  const test = { shape: shape };
  tilingByRules(test, kinds, 200000);
  const p = shape.p;
  // Distance between the middles of cells with motions A and B: with
  // z = b / conj(a) the middle in the disk, 1 - |z|^2 = 1 / |a|^2, and
  // cosh(distance) = 1 + 2 |z1 - z2|^2 / ((1 - |z1|^2)(1 - |z2|^2))
  // (Beardon, Chapter 7).
  const apart = function (A, B) {
    const [x1, y1] = motionApply(A, 0, 0), [x2, y2] = motionApply(B, 0, 0);
    const a1 = A[0] * A[0] + A[1] * A[1], a2 = B[0] * B[0] + B[1] * B[1];
    return Math.acosh(1 + 2 * ((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2)) * a1 * a2);
  };
  let seed = 12345;                            // a fixed sequence of random numbers
  const random = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let path = 0; path < 40; path++) {
    let v = 0;
    while (coshFromStart(test.place(v)) < Math.cosh(14)) {
      const around = test.neighbors(v);
      if (around.length !== p || new Set(around).size !== p) throw new Error("rules test: wrong neighbors");
      for (const w of around) {
        if (test.neighbors(w).indexOf(v) === -1) throw new Error("rules test: one-way neighbors");
        if (Math.abs(apart(test.place(v), test.place(w)) - 2 * shape.inradius) > 1e-6) throw new Error("rules test: a neighbor in the wrong place");
      }
      const farther = around.filter(function (w) { return coshFromStart(test.place(w)) > coshFromStart(test.place(v)); });
      v = farther[Math.floor(random() * farther.length)];
    }
  }
}

// Where cell v of a tree goes in the "spread out" picture of the tree
// (a page's third way to draw a tree, besides the disk and the half-
// plane): [depth, angle], with depth its number of steps from the start
// (it goes on the circle of that radius) and angle in turns (0 to 1).
// The start's p children share the whole circle equally, and every
// other cell's p - 1 children share its slice of the circle equally,
// in order counterclockwise (the usual "radial" drawing of a tree).
// Only for a tree built by rules (graph.parent). Each cell's depth and
// slice are kept in graph.spread, worked out from its parent's.
function spreadPlace(graph, v) {
  const p = graph.shape.p;
  if (!graph.spread) graph.spread = { depth: [0], low: [0], width: [1] };
  const kept = graph.spread;
  // Go up to the nearest cell already worked out, then back down.
  const chain = [];
  for (let u = v; kept.depth[u] === undefined; u = graph.parent(u)[0]) chain.push(u);
  while (chain.length > 0) {
    const u = chain.pop();
    const [parent, side] = graph.parent(u);
    const share = parent === 0 ? 1 / p : kept.width[parent] / (p - 1);
    const slot = parent === 0 ? side : side - 1;      // side 0 of every cell but the start faces its parent
    kept.depth[u] = kept.depth[parent] + 1;
    kept.low[u] = kept.low[parent] + slot * share;
    kept.width[u] = share;
  }
  return [kept.depth[v], kept.low[v] + kept.width[v] / 2];
}

// A table from pairs of whole numbers (i, j) to cell numbers, for
// makeGraph: find(i, j) is the cell filed under (i, j), or -1 if none;
// file(i, j, v) files cell v there. It is a "hash table", the usual way
// to look things up quickly: (i, j) goes in the slot numbered by mixing
// i and j into one number (its "hash"); if that slot is taken by
// another pair, in the next free slot. When the table is half full, it
// is made twice as big.
function hashTable() {
  let size = 1 << 16, filled = 0;
  let keyI = new Int32Array(size), keyJ = new Int32Array(size), cell = new Int32Array(size).fill(-1);

  // The slot of (i, j): where it is, or the free slot where it would go.
  function slot(i, j) {
    const mask = size - 1;
    // Mix i and j well, so nearby pairs land in far-apart slots.
    let h = Math.imul(i, 0x9E3779B1) ^ j;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = (h ^ (h >>> 13)) & mask;
    while (cell[h] !== -1 && (keyI[h] !== i || keyJ[h] !== j)) h = (h + 1) & mask;
    return h;
  }
  function find(i, j) { return cell[slot(i, j)]; }
  function file(i, j, v) {
    const h = slot(i, j);
    if (cell[h] !== -1) return;          // already filed
    keyI[h] = i; keyJ[h] = j; cell[h] = v;
    filled++;
    if (2 * filled > size) {             // half full: twice as big
      const oldI = keyI, oldJ = keyJ, oldCell = cell;
      size *= 2;
      keyI = new Int32Array(size); keyJ = new Int32Array(size); cell = new Int32Array(size).fill(-1);
      filled = 0;
      for (let k = 0; k < oldCell.length; k++) if (oldCell[k] !== -1) file(oldI[k], oldJ[k], oldCell[k]);
    }
  }
  return { find: find, file: file };
}

// The cells within distance r of cell v (not v itself), nearest first:
// a breadth-first search, taking each cell's neighbors in their order.
function ballAround(graph, v, r) {
  if (r === 1) return graph.neighbors(v);
  const seen = new Set([v]), found = [];
  let layer = [v];
  for (let d = 0; d < r; d++) {
    const next = [];
    for (const u of layer) {
      for (const w of graph.neighbors(u)) {
        if (seen.has(w)) continue;
        seen.add(w);
        found.push(w);
        next.push(w);
      }
    }
    layer = next;
  }
  return found;
}
