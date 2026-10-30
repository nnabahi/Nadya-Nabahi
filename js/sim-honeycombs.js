/* =====================================================================
   sim-honeycombs.js  —  tilings of 3D space by polyhedra, with their
                         vertices, edges, faces or polyhedra as cells
   ---------------------------------------------------------------------
   A tiling of space by polyhedra is called a "honeycomb". The ones here
   are the 28 UNIFORM tilings of 3-space: every polyhedron is a uniform
   polyhedron with sides of length 1, they meet face to face, and every
   vertex looks the same as every other (B. Grunbaum, "Uniform tilings
   of 3-space", Geombinatorics 4 (1994), 49-56; "the paper" below; its
   List 1 numbers them #1 to #28, and so does this file). #22, the
   cubes, is the cubic grid Z^3.

   CELLS. A sim can live on any of the four kinds of piece of a tiling:
     vertices    neighbors when an edge joins them
     edges       neighbors when they share a vertex
     faces       neighbors when they share an edge
     polyhedra   neighbors when they share a face
   (two pieces are neighbors when they share a piece one size down;
   vertices, which have nothing smaller, when one edge holds both).

   HOW THE TILINGS ARE MADE. Each is made from its polyhedra, given by
   their corners, in a big piece of space (section 2), in one of four
   ways, as the paper describes them:
     - the kaleidoscope (Wythoff's construction): four mirrors around a
       small tetrahedron reflect it to fill space, and a point placed
       inside it, reflected too, gives the corners of the polyhedra
       (W. A. Wythoff, "A relation between the polytopes of the
       C600-family", Proc. KNAW 20 (1918), 966-970; H. S. M. Coxeter,
       Regular Polytopes, 3rd ed., Dover 1973). #1, 5, 6, 7, 8, 9, 10,
       20, 21, 25, 27 and 28.
     - prisms: a tiling of the plane (js/sim-tilings.js), each polygon
       stood up 1 tall, in layers. #11, 13, 14, 16, 17, 18, 19, 22, 23,
       24 and 26.
     - layers of tetrahedra and octahedra, or of triangular prisms,
       between flat layers of triangles stacked in a pattern. #2, 3, 4.
     - layers of triangular prisms lying on their sides, and of cubes,
       turned a quarter turn from layer to layer. #12 and 15.
   Then the same code for all of them (section 3) finds the faces (where
   two polyhedra share 3 or more corners), the edges (the sides of the
   faces), the shortest steps that move the tiling onto itself along
   x, y and z, and cuts out one REPEATING BLOCK of each kind of cell.

   Numbers: corners are ordinary JavaScript numbers, matched when they
   agree to 6 decimals (as uprightBlock does for the 2D tilings), and
   the check page (help/honeycombs-check.html) checks every tiling
   against the paper's List 1.

   WHAT COMES OUT. honeycombBlock(number, kind) returns the repeating
   block of tiling #number with cells of the kind ("vertices", "edges",
   "faces" or "polyhedra"):
     a, b, c     the steps [x, y, z] to the next block along x, y and z
                 (a = [A, 0, 0], b = [0, B, 0], c = [0, 0, C]): block
                 (I, J, K) starts at I a + J b + K c
     cells       the cells of one block, each
                   middle   where it is, [x, y, z]
                   next     its neighbors, as [k, I, J, K]: cell k of
                            the block I, J, K steps away (the same form
                            as the 2D tilings' next, one more number)
                   corners, faces   its shape, for drawing: corners
                            [[x, y, z], ...] and faces, each a list of
                            corner numbers going counterclockwise seen
                            from outside. A polyhedron is itself (its
                            face f is the one shared with next[f]); a
                            face is one polygon; an edge is its two ends,
                            with no faces; a vertex is drawn as the
                            polyhedron through the middles of the
                            polyhedra around it (the "dual" cell, as in
                            2D: its face e crosses the edge to next[e])
                   type     what kind of cell it is, e.g. "3.4.4" for a
                            triangular prism (the polygons around one of
                            its corners), or for a vertex the polyhedra
                            around it, as in the paper: "(3.4.4)⁶.(4.4.4)⁴"
     types       the different types, in order
   A sim on the whole of space keeps each cell as [I, J, K, k] and steps
   with next (honeycombStep), so no box is needed; js/sim-domains.js
   makes boxes and tori of these cells.

   Contents:
     1. Points in space
     2. Making the polyhedra: kaleidoscope, prisms, layers
     3. From polyhedra to cells: faces, edges, the repeating block
     4. Names for kinds of corner
     5. The 28 tilings, and the menu
   ===================================================================== */


/* =====================================================================
   1. POINTS IN SPACE
   ---------------------------------------------------------------------
   A point is [x, y, z].
   ===================================================================== */

function add3(p, q) { return [p[0] + q[0], p[1] + q[1], p[2] + q[2]]; }
function sub3(p, q) { return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; }
function scale3(s, p) { return [s * p[0], s * p[1], s * p[2]]; }
function dot3(p, q) { return p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; }
function cross3(p, q) { return [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; }
function length3(p) { return Math.sqrt(dot3(p, p)); }

// The average of some points (the middle of a polygon or polyhedron
// whose corners are all equally far from it, as here).
function average3(points) {
  let sum = [0, 0, 0];
  for (const p of points) sum = add3(sum, p);
  return scale3(1 / points.length, sum);
}

// A name for a point, the same for points equal to 6 decimals.
function spaceKey(p) { return Math.round(p[0] * 1e6) + "," + Math.round(p[1] * 1e6) + "," + Math.round(p[2] * 1e6); }

// The mirror image of p in the plane through a, b and c.
function mirror3(p, a, b, c) {
  const n = cross3(sub3(b, a), sub3(c, a));
  return sub3(p, scale3(2 * dot3(sub3(p, a), n) / dot3(n, n), n));
}

// How far p is from the plane through a, b and c.
function planeDistance(p, a, b, c) {
  const n = cross3(sub3(b, a), sub3(c, a));
  return Math.abs(dot3(sub3(p, a), n)) / length3(n);
}

// Whether some points all lie on one plane (or one line): the plane
// through the first point, the point farthest from it, and the point
// farthest from the line through those two.
function onOnePlane(points) {
  const p = points[0];
  let q = p, far = 0;
  for (const r of points) if (length3(sub3(r, p)) > far) { far = length3(sub3(r, p)); q = r; }
  const line = sub3(q, p);
  let s = p, off = 0;
  for (const r of points) {
    const d = length3(cross3(sub3(r, p), line));
    if (d > off) { off = d; s = r; }
  }
  if (off < 1e-9) return true;
  for (const r of points) if (planeDistance(r, p, q, s) > 1e-6) return false;
  return true;
}

// The points "points" going counterclockwise around their middle, seen
// from the side "up" points to (they lie on a plane across "up").
function aroundAxis(points, middle, up) {
  const n = scale3(1 / length3(up), up);
  let u = null;
  for (const p of points) {
    const v = sub3(p, middle), flat = sub3(v, scale3(dot3(v, n), n));
    if (length3(flat) > 1e-9) { u = scale3(1 / length3(flat), flat); break; }
  }
  const w = cross3(n, u);
  const angle = function (p) { const v = sub3(p, middle); return Math.atan2(dot3(v, w), dot3(v, u)); };
  return points.map(function (p, i) { return [angle(p), i]; })
               .sort(function (x, y) { return x[0] - y[0]; })
               .map(function (x) { return x[1]; });
}


/* =====================================================================
   2. MAKING THE POLYHEDRA
   ---------------------------------------------------------------------
   Each way returns { tiles, center, reach }: the polyhedra, each a list
   of its corners [x, y, z] (sides of length 1), with every polyhedron
   whose middle is less than "reach" from "center" there.
   ===================================================================== */

// THE KALEIDOSCOPE. Four mirrors (planes) around a small tetrahedron,
// the "chamber", reflect it again and again until copies of it fill
// space with no gaps or overlaps. Up to size, only three tetrahedra do
// this (H. S. M. Coxeter, "Discrete groups generated by reflections",
// Annals of Math. 35 (1934), 588-621): here they are, with their
// corners on a grid of half cubes (mirror i is the face across from
// corner i).
const KALEIDOSCOPES = {
  // a 48th of a cube, from its middle (0, 0, 0) out to a corner: [4,3,4]
  cube: [[0, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0], [0.5, 0.5, 0.5]],
  // two of those, glued along a mirror: [4,3^(1,1)]
  halfCube: [[0, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]],
  // two of those, glued again: [3^[4]]
  quarterCube: [[0, 0, 0], [1, 0, 0], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]],
};
// (Gluing works because the two chambers' far corners and a corner of
// the face between them are in a line, so the two together are again a
// tetrahedron, with one mirror fewer.)
//
// Wythoff's construction: choose some of the four mirrors (the "rings"),
// and put one point in the chamber, on every mirror not chosen and
// equally far from every mirror chosen. Its copies in all the chambers
// are the corners of the tiling. Reflected in a chosen mirror, the
// point moves twice its distance from it, so that distance is half a
// side. Around each corner j of a chamber, the copies of the point in
// the chambers that share that corner are the corners of one
// polyhedron (unless they lie on a plane, a line or a point: then
// there is no polyhedron there).
function kaleidoscopeTiles(chamber, rings, reach) {
  // Where the point is in the chamber: weights[i] times corner i, added
  // up. Its distance from mirror i is weights[i] times corner i's
  // distance from that mirror ("heights").
  const heights = chamber.map(function (p, i) {
    const others = chamber.filter(function (q, j) { return j !== i; });
    return planeDistance(p, others[0], others[1], others[2]);
  });
  let weights = heights.map(function (h, i) { return rings.indexOf(i) >= 0 ? 1 / h : 0; });
  const total = weights.reduce(function (s, w) { return s + w; }, 0);
  weights = weights.map(function (w) { return w / total; });
  const side = 2 / total;                      // twice the point's distance from a chosen mirror

  // Reflect the chamber across its faces, again and again, keeping the
  // copies whose middles are within "reach" (in cube widths) of (0, 0, 0).
  const reachHere = reach * side, seen = new Set(), queue = [chamber];
  const around = new Map();                    // "j|corner" -> the copies of the point around that corner
  seen.add(spaceKey(average3(chamber)));
  for (let at = 0; at < queue.length; at++) {
    const corners = queue[at];
    let point = [0, 0, 0];
    corners.forEach(function (p, i) { point = add3(point, scale3(weights[i], p)); });
    corners.forEach(function (p, j) {
      const key = j + "|" + spaceKey(p);
      if (!around.has(key)) around.set(key, { center: p, points: new Map() });
      around.get(key).points.set(spaceKey(point), point);
    });
    for (let i = 0; i < 4; i++) {
      const others = corners.filter(function (q, j) { return j !== i; });
      const next = corners.slice();
      next[i] = mirror3(corners[i], others[0], others[1], others[2]);
      const key = spaceKey(average3(next));
      if (seen.has(key) || length3(average3(next)) > reachHere) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  // The polyhedra whose corners all came out: around a corner at least
  // one chamber's width inside the ball of chambers made.
  let width = 0;
  for (const p of chamber) for (const q of chamber) width = Math.max(width, length3(sub3(p, q)));
  const tiles = [];
  for (const { center, points } of around.values()) {
    if (length3(center) > reachHere - width) continue;
    const corners = Array.from(points.values());
    if (corners.length < 4 || onOnePlane(corners)) continue;
    tiles.push(corners.map(function (p) { return scale3(1 / side, p); }));
  }
  return { tiles: tiles, center: [0, 0, 0], reach: (reachHere - width) / side };
}

// PRISMS over a tiling of the plane (its GomJau-Hogg code, as in
// js/sim-tilings.js): each polygon stood up from height K to K + 1, for
// every whole number K.
function prismTiles(code, reach) {
  const flat = tilingBlock(code, false);       // (js/sim-tilings.js)
  const across = Math.ceil(reach / flat.a[0]) + 1, up = Math.ceil(reach / flat.b[1]) + 1, tiles = [];
  for (let I = -across; I <= across; I++) {
    for (let J = -up; J <= up; J++) {
      const shift = [I * flat.a[0] + J * flat.b[0], I * flat.a[1] + J * flat.b[1]];
      for (const cell of flat.cells) {
        const corners = cell.corners.map(function (p) { return [p[0] + shift[0], p[1] + shift[1]]; });
        for (let K = -Math.ceil(reach); K <= Math.ceil(reach); K++) {
          tiles.push(corners.map(function (p) { return [p[0], p[1], K]; })
                     .concat(corners.map(function (p) { return [p[0], p[1], K + 1]; })));
        }
      }
    }
  }
  return { tiles: tiles, center: [0, 0, 0.5], reach: reach };
}

// LAYERS OF TRIANGLES. Flat layers of the triangle tiling, one above
// another, each with its corners at one of three spots A, B, C (B and C
// are the middles of the up and down triangles of A), stacked in the
// pattern "letters", repeated (e.g. "ABC": A, B, C, A, B, C, ...).
// Between two layers at the same spot: triangular prisms, 1 tall.
// Between two at different spots: tetrahedra (a triangle of one with
// the corner of the other right above or below its middle) and
// octahedra (a triangle of each, the one above turned around), sqrt(2/3)
// apart (the height of a tetrahedron of side 1).
const TRIANGLE_SPOTS = { A: [0, 0], B: [0.5, Math.sqrt(3) / 6], C: [1, Math.sqrt(3) / 3] };
const TRIANGLE_STEPS = [[1, 0], [0.5, Math.sqrt(3) / 2]];

function triangleLayerTiles(letters, reach) {
  const count = Math.ceil(reach) + 2, tiles = [];
  const letterOf = function (L) { return letters[((L % letters.length) + letters.length) % letters.length]; };
  const gap = function (L) { return letterOf(L) === letterOf(L + 1) ? 1 : Math.sqrt(2 / 3); };
  // the heights of layers -count .. count
  const height = new Map([[0, 0]]);
  for (let L = 0; L < count; L++) height.set(L + 1, height.get(L) + gap(L));
  for (let L = 0; L > -count; L--) height.set(L - 1, height.get(L) - gap(L - 1));
  for (let L = -count; L < count; L++) {
    const below = TRIANGLE_SPOTS[letterOf(L)], above = TRIANGLE_SPOTS[letterOf(L + 1)];
    const z0 = height.get(L), z1 = height.get(L + 1);
    const lift = function (corners, z) { return corners.map(function (p) { return [p[0], p[1], z]; }); };
    for (const t of trianglesAround(below, count)) {
      if (below === above) tiles.push(lift(t.corners, z0).concat(lift(t.corners, z1)));
      else if (onTriangleGrid(t.middle, above)) tiles.push(lift(t.corners, z0).concat([[t.middle[0], t.middle[1], z1]]));
      else tiles.push(lift(t.corners, z0).concat(lift(triangleWithMiddle(t.middle, above), z1)));
    }
    if (below === above) continue;
    for (const t of trianglesAround(above, count)) {
      if (onTriangleGrid(t.middle, below)) tiles.push(lift(t.corners, z1).concat([[t.middle[0], t.middle[1], z0]]));
    }
  }
  return { tiles: tiles, center: [0, 0, 0], reach: count - 2 };
}

// The triangles of the layer at "spot" with a corner at spot + i s1 + j s2
// (s1, s2 the steps above) for i and j from -count to count, each
// { corners, middle } (corners and middle as [x, y]).
function trianglesAround(spot, count) {
  const [s1, s2] = TRIANGLE_STEPS, triangles = [];
  const at = function (i, j) { return [spot[0] + i * s1[0] + j * s2[0], spot[1] + i * s1[1] + j * s2[1]]; };
  for (let i = -2 * count; i <= 2 * count; i++) {
    for (let j = -2 * count; j <= 2 * count; j++) {
      for (const corners of [[at(i, j), at(i + 1, j), at(i, j + 1)], [at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]]) {
        const middle = [(corners[0][0] + corners[1][0] + corners[2][0]) / 3, (corners[0][1] + corners[1][1] + corners[2][1]) / 3];
        if (Math.hypot(middle[0], middle[1]) <= count) triangles.push({ corners: corners, middle: middle });
      }
    }
  }
  return triangles;
}

// Whether the point [x, y] is a corner of the triangle layer at "spot".
function onTriangleGrid(p, spot) {
  const [s1, s2] = TRIANGLE_STEPS;
  const j = (p[1] - spot[1]) / s2[1], i = (p[0] - spot[0]) - j * s2[0];
  return Math.abs(i - Math.round(i)) < 1e-6 && Math.abs(j - Math.round(j)) < 1e-6;
}

// The triangle of the layer at "spot" whose middle is the point p.
function triangleWithMiddle(p, spot) {
  const [s1, s2] = TRIANGLE_STEPS;
  const up = [p[0] - 0.5, p[1] - Math.sqrt(3) / 6];
  if (onTriangleGrid(up, spot)) return [up, [up[0] + s1[0], up[1] + s1[1]], [up[0] + s2[0], up[1] + s2[1]]];
  const c = [p[0] - 1, p[1] - Math.sqrt(3) / 3];       // the corner below and to the left of a down triangle
  return [[c[0] + s1[0], c[1] + s1[1]], [c[0] + s1[0] + s2[0], c[1] + s1[1] + s2[1]], [c[0] + s2[0], c[1] + s2[1]]];
}

// LAYERS TURNED A QUARTER TURN. Each layer, from the bottom up, is one
// of "layers", repeated:
//   "x"     triangular prisms lying on a square side, long side along x,
//           alternately point up and point down: sqrt(3)/2 tall (the
//           paper's slab S14)
//   "y"     the same, long side along y
//   "cube"  cubes
// Each layer's bottom corners are a square grid; a prism layer's top
// grid is its bottom one moved half a step across the prisms.
function turnedLayerTiles(layers, reach) {
  const count = Math.ceil(reach) + 2, h = Math.sqrt(3) / 2, tiles = [];
  const kindOf = function (L) { return layers[((L % layers.length) + layers.length) % layers.length]; };
  const shift = { x: [0, 0.5], y: [0.5, 0], cube: [0, 0] }, tall = { x: h, y: h, cube: 1 };
  // the bottom of layers -count .. count: [ox, oy, z]
  const bottom = new Map([[0, [0, 0, 0]]]);
  for (let L = 0; L < count; L++) {
    const [ox, oy, z] = bottom.get(L), s = shift[kindOf(L)];
    bottom.set(L + 1, [ox + s[0], oy + s[1], z + tall[kindOf(L)]]);
  }
  for (let L = 0; L > -count; L--) {
    const [ox, oy, z] = bottom.get(L), s = shift[kindOf(L - 1)];
    bottom.set(L - 1, [ox - s[0], oy - s[1], z - tall[kindOf(L - 1)]]);
  }
  for (let L = -count; L < count; L++) {
    const [ox, oy, z0] = bottom.get(L), kind = kindOf(L), z1 = z0 + tall[kind];
    for (let i = -count; i <= count; i++) {
      for (let j = -count; j <= count; j++) {
        const x = ox + i, y = oy + j;
        if (kind === "cube") {
          tiles.push([[x, y, z0], [x + 1, y, z0], [x, y + 1, z0], [x + 1, y + 1, z0],
                      [x, y, z1], [x + 1, y, z1], [x, y + 1, z1], [x + 1, y + 1, z1]]);
          continue;
        }
        // across the prisms (u) and along them (v): u is y for "x"
        const place = kind === "x" ? function (v, u, z) { return [v, u, z]; } : function (v, u, z) { return [u, v, z]; };
        const v0 = kind === "x" ? x : y, u0 = kind === "x" ? y : x;
        for (const [a, b, c] of [[[u0, z0], [u0 + 1, z0], [u0 + 0.5, z1]], [[u0 + 0.5, z1], [u0 + 1.5, z1], [u0 + 1, z0]]]) {
          const prism = [];
          for (const v of [v0, v0 + 1]) for (const [u, z] of [a, b, c]) prism.push(place(v, u, z));
          tiles.push(prism);
        }
      }
    }
  }
  return { tiles: tiles, center: [0, 0, 0], reach: count - 2 };
}


/* =====================================================================
   3. FROM POLYHEDRA TO CELLS
   ---------------------------------------------------------------------
   honeycombParts(made) finds the vertices and polyhedra of the
   polyhedra "made" (from section 2), and addFaces the faces and edges of
   some of the polyhedra (only those near the block are needed, and there
   can be many thousands of polyhedra):
     vertices[v]   the point
     tiles[t]      { corners: vertex numbers, middle, faces }
     faces[f]      { corners: vertex numbers going counterclockwise seen
                     from outside tiles[0], tiles: the two polyhedra,
                     edges, middle }
     edges[e]      { ends: two vertex numbers, faces, middle }
   plus, for each vertex, its tiles and edges (tilesAt, edgesAt). Two
   polyhedra that share 3 or more corners share a face (in a
   face-to-face tiling by convex polyhedra, two that share only an edge
   or a vertex share 2 or 1).
   ===================================================================== */

function honeycombParts(made) {
  const vertices = [], vertexOf = new Map(), tilesAt = [];
  const tiles = made.tiles.map(function (corners, t) {
    const numbers = [];
    for (const p of corners) {
      const key = spaceKey(p);
      if (!vertexOf.has(key)) { vertexOf.set(key, vertices.length); vertices.push(p); tilesAt.push([]); }
      const v = vertexOf.get(key);
      if (numbers.indexOf(v) < 0) { numbers.push(v); tilesAt[v].push(t); }
    }
    return { corners: numbers, middle: average3(numbers.map(function (v) { return vertices[v]; })), faces: [] };
  });
  return { vertices: vertices, tiles: tiles, tilesAt: tilesAt, faces: [], edges: [], faceOf: new Map(), edgeOf: new Map(),
           edgesAt: vertices.map(function () { return []; }), center: made.center, reach: made.reach };
}

// Find the faces of the polyhedra "which" (tile numbers), and their
// edges.
function addFaces(parts, which) {
  const { vertices, tiles, tilesAt, faces, edges } = parts;
  for (const t of which) {
    const tile = tiles[t], shared = new Map();
    for (const v of tile.corners) {
      for (const u of tilesAt[v]) if (u !== t) { if (!shared.has(u)) shared.set(u, []); shared.get(u).push(v); }
    }
    for (const [u, corners] of shared) {
      const key = Math.min(t, u) + "," + Math.max(t, u);
      if (corners.length < 3 || parts.faceOf.has(key)) continue;
      const points = corners.map(function (v) { return vertices[v]; }), middle = average3(points);
      const order = aroundAxis(points, middle, sub3(middle, tile.middle));
      parts.faceOf.set(key, faces.length);
      tile.faces.push(faces.length);
      tiles[u].faces.push(faces.length);
      faces.push({ corners: order.map(function (i) { return corners[i]; }), tiles: [t, u], edges: [], middle: middle });
      addEdges(parts, faces.length - 1);
    }
  }
}

// The edges of face f: its sides.
function addEdges(parts, f) {
  const face = parts.faces[f], n = face.corners.length;
  for (let i = 0; i < n; i++) {
    const a = face.corners[i], b = face.corners[(i + 1) % n], key = Math.min(a, b) + "," + Math.max(a, b);
    if (!parts.edgeOf.has(key)) {
      parts.edgeOf.set(key, parts.edges.length);
      parts.edgesAt[a].push(parts.edges.length);
      parts.edgesAt[b].push(parts.edges.length);
      parts.edges.push({ ends: [a, b], faces: [], middle: scale3(0.5, add3(parts.vertices[a], parts.vertices[b])) });
    }
    const e = parts.edgeOf.get(key);
    parts.edges[e].faces.push(f);
    face.edges.push(e);
  }
}

// Whether polyhedron t's faces all came out: every side of its faces is
// a side of exactly two of them. (A polyhedron at the edge of the piece
// of space that was made is missing the faces it shares with polyhedra
// that weren't made.)
function isClosed(parts, t) {
  const count = new Map();
  for (const f of parts.tiles[t].faces) for (const e of parts.faces[f].edges) count.set(e, (count.get(e) || 0) + 1);
  for (const c of count.values()) if (c !== 2) return false;
  return count.size > 0;
}

// The four kinds of cell, each as { middle(i), count, near(i), shape(i) }
// over the parts: near(i) lists the cell's neighbors (sharing a piece
// one size down, see the top of this file), and shape(i) is its
// { corners, faces } for drawing.
function cellKinds(parts) {
  const { vertices, tiles, faces, edges } = parts;
  const corner = function (v) { return vertices[v]; };
  return {
    polyhedra: {
      count: tiles.length,
      middle: function (t) { return tiles[t].middle; },
      near: function (t) { return tiles[t].faces.map(function (f) { return faces[f].tiles[0] === t ? faces[f].tiles[1] : faces[f].tiles[0]; }); },
      shape: function (t) {
        const tile = tiles[t];
        return { corners: tile.corners.map(corner),
                 faces: tile.faces.map(function (f) {
                   const face = faces[f], order = face.tiles[0] === t ? face.corners : face.corners.slice().reverse();
                   return order.map(function (v) { return tile.corners.indexOf(v); });
                 }) };
      },
    },
    faces: {
      count: faces.length,
      middle: function (f) { return faces[f].middle; },
      near: function (f) {
        const found = [];
        for (const e of faces[f].edges) for (const g of edges[e].faces) if (g !== f && found.indexOf(g) < 0) found.push(g);
        return found;
      },
      shape: function (f) { return { corners: faces[f].corners.map(corner), faces: [faces[f].corners.map(function (v, i) { return i; })] }; },
    },
    edges: {
      count: edges.length,
      middle: function (e) { return edges[e].middle; },
      near: function (e) {
        const found = [];
        for (const v of edges[e].ends) for (const g of parts.edgesAt[v]) if (g !== e && found.indexOf(g) < 0) found.push(g);
        return found;
      },
      shape: function (e) { return { corners: edges[e].ends.map(corner), faces: [] }; },
    },
    vertices: {
      count: vertices.length,
      middle: function (v) { return vertices[v]; },
      near: function (v) { return parts.edgesAt[v].map(function (e) { return edges[e].ends[0] === v ? edges[e].ends[1] : edges[e].ends[0]; }); },
      shape: function (v) { return dualCell(parts, v); },
    },
  };
}

// The cell drawn for vertex v: the polyhedron whose corners are the
// middles of the polyhedra around v, and whose face e (one for each
// edge at v, in the order of parts.edgesAt[v]) goes through the middles
// of the polyhedra around that edge. Those middles are all equally far
// from the edge's two ends, so each face is flat and crosses the edge
// at a right angle.
function dualCell(parts, v) {
  const around = parts.tilesAt[v], corners = around.map(function (t) { return parts.tiles[t].middle; });
  const faces = parts.edgesAt[v].map(function (e) {
    const [a, b] = parts.edges[e].ends, w = a === v ? b : a;
    const onEdge = [];
    around.forEach(function (t, i) { if (parts.tiles[t].corners.indexOf(w) >= 0) onEdge.push(i); });
    const points = onEdge.map(function (i) { return corners[i]; });
    return aroundAxis(points, average3(points), sub3(parts.vertices[w], parts.vertices[v]))
      .map(function (k) { return onEdge[k]; });
  });
  return { corners: corners, faces: faces };
}

// The shortest step along x, y and z that moves the tiling onto itself:
// every polyhedron near the middle, moved by it, lands on one exactly
// like it (the same shape, turned the same way). The steps tried are the
// distances along that line from the polyhedron nearest the middle to
// others like it. null if too little of the tiling was made to tell: a
// step is only trusted when it is tested across a piece of space more
// than a step wide.
function repeatSteps(parts) {
  const { tiles, center } = parts, test = parts.reach - 2, shapeAt = new Map();
  const near = tiles.filter(function (tile) { return length3(sub3(tile.middle, center)) < parts.reach; });
  if (near.length === 0) return null;
  for (const tile of near) shapeAt.set(spaceKey(tile.middle), tileShape(parts, tile));
  let first = near[0];
  for (const tile of near) if (length3(sub3(tile.middle, center)) < length3(sub3(first.middle, center))) first = tile;
  const firstShape = tileShape(parts, first);
  const steps = [0, 1, 2].map(function (axis) {
    const tries = [];
    for (const tile of near) {
      const d = sub3(tile.middle, first.middle);
      if (d[axis] < 1e-6 || ![0, 1, 2].every(function (k) { return k === axis || Math.abs(d[k]) < 1e-6; })) continue;
      if (shapeAt.get(spaceKey(tile.middle)) === firstShape) tries.push(d[axis]);
    }
    tries.sort(function (p, q) { return p - q; });
    for (const step of tries) {
      if (step > test) break;
      const move = [0, 0, 0];
      move[axis] = step;
      const fits = near.every(function (tile) {
        const moved = add3(tile.middle, move);
        if (length3(sub3(moved, center)) > test) return true;   // too near the edge to tell
        return shapeAt.get(spaceKey(moved)) === shapeAt.get(spaceKey(tile.middle));
      });
      if (fits) return step;
    }
    return null;
  });
  return steps.every(function (step) { return step !== null; }) ? steps : null;
}

// A polyhedron's shape, as text: where its corners are from its middle.
function tileShape(parts, tile) {
  return tile.corners.map(function (v) { return spaceKey(sub3(parts.vertices[v], tile.middle)); }).sort().join(" ");
}

// Where the block (0, 0, 0) starts: near the middle of the piece of
// space made, with each of its walls as far as it can be from the
// middles of all the cells (so no cell's middle sits on a wall, and
// rounding can never put it in the wrong block).
function blockOrigin(parts, steps) {
  // (the cells in a ball around a whole block are one of every cell, at
  // least, so they show every place a cell can be in a block)
  const all = [], around = length3(steps) / 2 + 1;
  for (const list of [parts.vertices, parts.tiles.map(function (t) { return t.middle; }),
                      parts.faces.map(function (f) { return f.middle; }), parts.edges.map(function (e) { return e.middle; })]) {
    for (const p of list) if (length3(sub3(p, parts.center)) < around) all.push(p);
  }
  return [0, 1, 2].map(function (axis) {
    const size = steps[axis], start = parts.center[axis] - size / 2;
    let best = start, bestGap = -1;
    for (let k = 0; k < 64; k++) {
      const wall = start + k * size / 64;
      let gap = Infinity;
      for (const p of all) {
        const off = (((p[axis] - wall) % size) + size) % size;
        gap = Math.min(gap, off, size - off);
      }
      if (gap > bestGap + 1e-9) { bestGap = gap; best = wall; }
    }
    return best;
  });
}

// The block (I, J, K) a point is in.
function blockOfPoint(p, origin, steps) {
  return [0, 1, 2].map(function (k) { return Math.floor((p[k] - origin[k]) / steps[k]); });
}

// The repeating block of one kind of cell (see the top of this file).
function cutBlock(parts, kind, origin, steps) {
  const cells = cellKinds(parts)[kind];
  const index = new Map(), mine = [];
  const homeKey = function (p, at) { return spaceKey([0, 1, 2].map(function (k) { return p[k] - at[k] * steps[k]; })); };
  for (let i = 0; i < cells.count; i++) {
    const p = cells.middle(i), at = blockOfPoint(p, origin, steps);
    if (at[0] === 0 && at[1] === 0 && at[2] === 0) { index.set(homeKey(p, at), mine.length); mine.push(i); }
  }
  return mine.map(function (i) {
    const shape = cells.shape(i);
    return {
      middle: sub3(cells.middle(i), origin),
      corners: shape.corners.map(function (p) { return sub3(p, origin); }),
      faces: shape.faces,
      next: cells.near(i).map(function (j) {
        const p = cells.middle(j), at = blockOfPoint(p, origin, steps), k = index.get(homeKey(p, at));
        if (k === undefined) throw new Error("A neighbor of a cell isn't in the block: the tiling doesn't repeat as it should.");
        return [k, at[0], at[1], at[2]];
      }),
      type: cellType(parts, kind, i),
    };
  });
}


/* =====================================================================
   4. NAMES FOR KINDS OF CORNER
   ---------------------------------------------------------------------
   A polyhedron is named by the polygons around one of its corners, in
   order (3.4.4 is a triangular prism, 4.6.6 a truncated octahedron), and
   a vertex of the tiling by the polyhedra around it, with a power for
   each kind: (3.4.4)⁶.(4.4.4)⁴ is 6 triangular prisms and 4 cubes. Both
   are written as the paper writes them.
   ===================================================================== */

// The polygons around corner v of polyhedron t, in order around it:
// start at one face, then go to the face across one of its sides at v,
// and so on.
function polygonsAtCorner(parts, t, v) {
  const at = parts.tiles[t].faces.filter(function (f) { return parts.faces[f].corners.indexOf(v) >= 0; });
  const sides = [];
  let f = at[0], from = -1;
  for (let k = 0; k < at.length; k++) {
    sides.push(parts.faces[f].corners.length);
    const next = at.find(function (g) {
      return g !== f && g !== from && parts.faces[g].edges.some(function (e) { return parts.faces[f].edges.indexOf(e) >= 0; });
    });
    from = f;
    f = next;
  }
  return sides;
}

// The smallest way to write a list going around in a circle, starting
// anywhere and going either way (3.4.3.4, not 4.3.4.3).
function smallestTurn(list) {
  let best = null;
  for (const way of [list, list.slice().reverse()]) {
    for (let s = 0; s < way.length; s++) {
      const turned = way.slice(s).concat(way.slice(0, s));
      if (best === null || compareNumberLists(turned, best) < 0) best = turned;
    }
  }
  return best;
}

// Compare two lists of numbers like words in a dictionary.
function compareNumberLists(p, q) {
  for (let k = 0; k < Math.min(p.length, q.length); k++) if (p[k] !== q[k]) return p[k] - q[k];
  return p.length - q.length;
}

// The name of polyhedron t, like "3.4.4".
function polyhedronName(parts, t) {
  return smallestTurn(polygonsAtCorner(parts, t, parts.tiles[t].corners[0])).join(".");
}

// The name of vertex v of the tiling, like "(3.4.4)⁶.(4.4.4)⁴": the
// polyhedra around it, in dictionary order.
function vertexName(parts, v) {
  const counts = new Map();
  for (const t of parts.tilesAt[v]) { const name = polyhedronName(parts, t); counts.set(name, (counts.get(name) || 0) + 1); }
  const names = Array.from(counts.keys()).sort(function (p, q) {
    return compareNumberLists(p.split(".").map(Number), q.split(".").map(Number));
  });
  return names.map(function (name) { return "(" + name + ")" + (counts.get(name) > 1 ? superscript(counts.get(name)) : ""); }).join(".");
}

function superscript(n) { return String(n).split("").map(function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]; }).join(""); }

// The type of cell i of a kind: a polyhedron's name; a vertex's name; a
// face's polygon and the polyhedra on its two sides; an edge's
// polyhedra in order around it.
function cellType(parts, kind, i) {
  if (kind === "polyhedra") return polyhedronName(parts, i);
  if (kind === "vertices") return vertexName(parts, i);
  if (kind === "faces") {
    const names = parts.faces[i].tiles.map(function (t) { return polyhedronName(parts, t); }).sort();
    return parts.faces[i].corners.length + "-gon between " + names.join(" and ");
  }
  const [a, b] = parts.edges[i].ends;
  const around = parts.tilesAt[a].filter(function (t) { return parts.tiles[t].corners.indexOf(b) >= 0; });
  const order = aroundAxis(around.map(function (t) { return parts.tiles[t].middle; }), parts.edges[i].middle,
                           sub3(parts.vertices[b], parts.vertices[a]));
  const names = order.map(function (k) { return polyhedronName(parts, around[k]); });
  // the smallest way around, comparing names as text
  let best = null;
  for (const way of [names, names.slice().reverse()]) {
    for (let s = 0; s < way.length; s++) {
      const turned = way.slice(s).concat(way.slice(0, s)).join(" ");
      if (best === null || turned < best) best = turned;
    }
  }
  return "edge in " + best;
}


/* =====================================================================
   5. THE 28 TILINGS
   ---------------------------------------------------------------------
   As in the paper's List 1: its number, a name from its description,
   the paper's vertex name ("symbol") and ratio of polyhedra (both for
   the check page), how it is made, and how far to make it ("reach", in
   side lengths from its middle: enough to cut out a block, found by
   trying; madeHoneycomb goes farther if it ever isn't). For the kaleidoscope, "rings"
   are the mirrors the point is off (mirror i is across from corner i
   of the chamber in KALEIDOSCOPES). Which rings make which tiling was
   found by trying them all and naming what came out (section 4); the
   check page checks every one against the paper. The prisms use the
   plane tilings of js/sim-tilings.js, by name.
   ===================================================================== */

const HONEYCOMBS = [
  { number: 1, reach: 6, name: "Tetrahedra and octahedra", symbol: "(3.3.3)⁸.(3.3.3.3)⁶", ratio: "1 : 2",
    make: function (r) { return triangleLayerTiles("ABC", r); } },
  { number: 2, reach: 4, name: "Tetrahedra and octahedra, mirrored layers", symbol: "(3.3.3)⁸.(3.3.3.3)⁶", ratio: "1 : 2",
    make: function (r) { return triangleLayerTiles("AB", r); } },
  { number: 3, reach: 9, name: "Tetrahedra, octahedra and triangular prisms", symbol: "(3.3.3)⁴.(3.3.3.3)³.(3.4.4)⁶", ratio: "2 : 1 : 3",
    make: function (r) { return triangleLayerTiles("AABBCC", r); } },
  { number: 4, reach: 6, name: "Tetrahedra, octahedra and triangular prisms, mirrored layers", symbol: "(3.3.3)⁴.(3.3.3.3)³.(3.4.4)⁶", ratio: "2 : 1 : 3",
    make: function (r) { return triangleLayerTiles("AABB", r); } },
  { number: 5, reach: 9, name: "Tetrahedra, rhombicuboctahedra and cubes", symbol: "(3.3.3).(3.4.4.4)³.(4.4.4)", ratio: "2 : 1 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.halfCube, [0, 2], r); } },
  { number: 6, reach: 9, name: "Tetrahedra and truncated tetrahedra", symbol: "(3.3.3)².(3.6.6)⁶", ratio: "1 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.quarterCube, [0, 2], r); } },
  { number: 7, reach: 6, name: "Octahedra and cuboctahedra", symbol: "(3.3.3.3)².(3.4.3.4)⁴", ratio: "1 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [1], r); } },
  { number: 8, reach: 9, name: "Octahedra and truncated cubes", symbol: "(3.3.3.3).(3.8.8)⁴", ratio: "1 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [0, 1], r); } },
  { number: 9, reach: 9, name: "Cuboctahedra, rhombicuboctahedra and cubes", symbol: "(3.4.3.4).(3.4.4.4)².(4.4.4)²", ratio: "1 : 1 : 3",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [1, 3], r); } },
  { number: 10, reach: 13.5, name: "Cuboctahedra, truncated tetrahedra and truncated octahedra", symbol: "(3.4.3.4).(3.6.6)².(4.6.6)²", ratio: "1 : 2 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.halfCube, [1, 2], r); } },
  { number: 11, reach: 4, name: "Triangular prisms", symbol: "(3.4.4)¹²", ratio: "",
    make: function (r) { return prismTiles(planeCode("Triangles (3⁶)"), r); } },
  { number: 12, reach: 6, name: "Triangular prisms, layers turned a quarter turn", symbol: "(3.4.4)¹²", ratio: "",
    make: function (r) { return turnedLayerTiles(["x", "y"], r); } },
  { number: 13, reach: 6, name: "Prisms over the elongated triangular tiling", symbol: "(3.4.4)⁶.(4.4.4)⁴", ratio: "2 : 1",
    make: function (r) { return prismTiles(planeCode("Elongated triangular (3³.4²)"), r); } },
  { number: 14, reach: 4, name: "Prisms over the snub square tiling", symbol: "(3.4.4)⁶.(4.4.4)⁴", ratio: "2 : 1",
    make: function (r) { return prismTiles(planeCode("Snub square (3².4.3.4)"), r); } },
  { number: 15, reach: 13.5, name: "Triangular prisms and cubes, prism layers turned a quarter turn", symbol: "(3.4.4)⁶.(4.4.4)⁴", ratio: "2 : 1",
    make: function (r) { return turnedLayerTiles(["x", "cube", "y", "cube"], r); } },
  { number: 16, reach: 9, name: "Prisms over the rhombitrihexagonal tiling", symbol: "(3.4.4)².(4.4.4)⁴.(4.4.6)²", ratio: "2 : 3 : 1",
    make: function (r) { return prismTiles(planeCode("Rhombitrihexagonal (3.4.6.4)"), r); } },
  { number: 17, reach: 9, name: "Prisms over the snub hexagonal tiling", symbol: "(3.4.4)⁸.(4.4.6)²", ratio: "8 : 1",
    make: function (r) { return prismTiles(planeCode("Snub hexagonal (3⁴.6)"), r); } },
  { number: 18, reach: 6, name: "Prisms over the kagome tiling", symbol: "(3.4.4)⁴.(4.4.6)⁴", ratio: "2 : 1",
    make: function (r) { return prismTiles(planeCode("Kagome (3.6.3.6)"), r); } },
  { number: 19, reach: 9, name: "Prisms over the truncated hexagonal tiling", symbol: "(3.4.4)².(4.4.12)⁴", ratio: "2 : 1",
    make: function (r) { return prismTiles(planeCode("Truncated hexagonal (3.12²)"), r); } },
  { number: 20, reach: 13.5, name: "Rhombicuboctahedra, truncated cubes, cubes and octagonal prisms", symbol: "(3.4.4.4).(3.8.8).(4.4.4).(4.4.8)²", ratio: "1 : 1 : 3 : 3",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [0, 1, 3], r); } },
  { number: 21, reach: 20.25, name: "Truncated tetrahedra, truncated cubes and truncated cuboctahedra", symbol: "(3.6.6).(3.8.8).(4.6.8)²", ratio: "2 : 1 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.halfCube, [0, 1, 2], r); } },
  { number: 22, reach: 4, name: "Cubes", symbol: "(4.4.4)⁸", ratio: "",
    make: function (r) { return prismTiles(planeCode("Squares (4⁴)"), r); } },
  { number: 23, reach: 13.5, name: "Prisms over the truncated trihexagonal tiling", symbol: "(4.4.4)².(4.4.6)².(4.4.12)²", ratio: "3 : 2 : 1",
    make: function (r) { return prismTiles(planeCode("Truncated trihexagonal (4.6.12)"), r); } },
  { number: 24, reach: 6, name: "Prisms over the truncated square tiling", symbol: "(4.4.4)².(4.4.8)⁴", ratio: "1 : 1",
    make: function (r) { return prismTiles(planeCode("Truncated square (4.8², 8 neighbors square)"), r); } },
  { number: 25, reach: 13.5, name: "Cubes, truncated octahedra and truncated cuboctahedra", symbol: "(4.4.4).(4.6.6).(4.6.8)²", ratio: "3 : 1 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [0, 1, 2], r); } },
  { number: 26, reach: 6, name: "Hexagonal prisms", symbol: "(4.4.6)⁶", ratio: "",
    make: function (r) { return prismTiles(planeCode("Hexagons (6³)"), r); } },
  { number: 27, reach: 20.25, name: "Octagonal prisms and truncated cuboctahedra", symbol: "(4.4.8)².(4.6.8)²", ratio: "3 : 1",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [0, 1, 2, 3], r); } },
  { number: 28, reach: 13.5, name: "Truncated octahedra", symbol: "(4.6.6)⁴", ratio: "",
    make: function (r) { return kaleidoscopeTiles(KALEIDOSCOPES.cube, [1, 2], r); } },
];

// The kinds of cell, for menus.
const CELL_KINDS = [
  { kind: "polyhedra", name: "Polyhedra" },
  { kind: "faces", name: "Faces" },
  { kind: "edges", name: "Edges" },
  { kind: "vertices", name: "Vertices" },
];

// The GomJau-Hogg code of the plane tiling with this name in TILINGS
// (js/sim-tilings.js).
function planeCode(name) {
  const tiling = TILINGS.find(function (t) { return t.name === name; });
  if (!tiling) throw new Error("No plane tiling is called " + name + ".");
  return tiling.code;
}

// The parts of tiling #number, the steps it repeats by, and where its
// block (0, 0, 0) starts; worked out once, then kept. The tiling is made
// out to its "reach" (side lengths from its middle), and farther and
// farther if that isn't enough around one block.
const honeycombsKept = new Map();
function madeHoneycomb(number) {
  if (!honeycombsKept.has(number)) {
    const entry = HONEYCOMBS.find(function (h) { return h.number === number; });
    if (!entry) throw new Error("There is no tiling #" + number + ".");
    for (let reach = entry.reach; !honeycombsKept.has(number); reach *= 1.5) {
      if (reach > 60) throw new Error("Couldn't make enough of tiling #" + number + ".");
      const parts = honeycombParts(entry.make(reach));
      const steps = repeatSteps(parts);
      if (!steps) continue;
      // the block will be less than |steps| from the middle
      const near = [], far = length3(steps) + widestTile(parts);
      parts.tiles.forEach(function (tile, t) { if (length3(sub3(tile.middle, parts.center)) < far) near.push(t); });
      addFaces(parts, near);
      const origin = blockOrigin(parts, steps);
      if (!madeEnough(parts, origin, steps)) continue;
      honeycombsKept.set(number, { entry: entry, parts: parts, steps: steps, origin: origin, blocks: {} });
    }
  }
  return honeycombsKept.get(number);
}

// Whether enough of the tiling was made around the block (0, 0, 0): the
// polyhedra that can touch the block (their middles at most the widest
// polyhedron's reach from it) are all closed. Then every polyhedron
// around a cell of the block is there, with all its faces (they join
// up face to face, and each one's neighbors are there), so every cell
// of the block has all its neighbors and its whole shape.
function madeEnough(parts, origin, steps) {
  const widest = widestTile(parts);
  let enough = true;
  parts.tiles.forEach(function (tile, t) {
    const near = [0, 1, 2].every(function (k) {
      return tile.middle[k] > origin[k] - widest && tile.middle[k] < origin[k] + steps[k] + widest;
    });
    if (near && !isClosed(parts, t)) enough = false;
  });
  return enough;
}

// The farthest any polyhedron's corner is from its middle.
function widestTile(parts) {
  let widest = 0;
  for (const tile of parts.tiles) for (const v of tile.corners) widest = Math.max(widest, length3(sub3(parts.vertices[v], tile.middle)));
  return widest;
}

// The repeating block of tiling #number, with cells of the given kind
// ("vertices", "edges", "faces" or "polyhedra"), as described at the top
// of this file.
function honeycombBlock(number, kind) {
  const made = madeHoneycomb(number);
  if (!made.blocks[kind]) {
    const cells = cutBlock(made.parts, kind, made.origin, made.steps);
    const types = [];
    for (const cell of cells) if (types.indexOf(cell.type) < 0) types.push(cell.type);
    made.blocks[kind] = {
      number: number, name: made.entry.name, kind: kind, id: number + " " + kind,
      a: [made.steps[0], 0, 0], b: [0, made.steps[1], 0], c: [0, 0, made.steps[2]],
      cells: cells, types: types,
    };
  }
  return made.blocks[kind];
}

// Where the middle of cell k of block (I, J, K) is.
function honeycombMiddle(block, I, J, K, k) {
  const m = block.cells[k].middle;
  return [m[0] + I * block.a[0], m[1] + J * block.b[1], m[2] + K * block.c[2]];
}

// The cell [I, J, K, k] (cell k of block (I, J, K)) one step from
// "cell" to its neighbor number e (anywhere in space, no box).
function honeycombStep(block, cell, e) {
  const [k, dI, dJ, dK] = block.cells[cell[3]].next[e];
  return [cell[0] + dI, cell[1] + dJ, cell[2] + dK, k];
}

// A name for the cell [I, J, K, k], for keeping cells in a Map or Set.
function honeycombKey(cell) { return cell[0] + "," + cell[1] + "," + cell[2] + "," + cell[3]; }

// Put the tilings in a <select> menu, each option's value its number,
// with the cubes first (as Z^3 is the usual one).
function addHoneycombOptions(menu) {
  const cubes = HONEYCOMBS.find(function (h) { return h.number === 22; });
  for (const h of [cubes].concat(HONEYCOMBS.filter(function (h) { return h !== cubes; }))) {
    menu.appendChild(new Option("#" + h.number + " " + h.name + " " + h.symbol, String(h.number)));
  }
}
