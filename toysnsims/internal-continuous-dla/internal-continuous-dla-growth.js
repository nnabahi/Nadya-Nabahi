/* =====================================================================
   internal-continuous-dla-growth.js  —  the growth behind the
   "Internal Continuous DLA" sim
   ---------------------------------------------------------------------
   THE MODEL (nadya's). A tile shape T (a disk by default) is fixed, and
   tiles are copies of it moved without turning, in the plane or in
   space. The cluster starts empty. Particles come one at a time: a
   point B does Brownian motion from the source, the origin, carrying
   the tile B + T with it, and stops the first moment B + T overlaps no
   tile of the cluster. That tile joins the cluster (the first one stops
   at once, at the origin). So tiles always just touch and never
   overlap, and after n particles the cluster has n tiles. It is the
   continuous version of internal DLA (P. Diaconis and W. Fulton, "A
   growth model, a game, an algebra, Lagrange inversion, and
   characteristic classes", Rend. Sem. Mat. Univ. Pol. Torino 49 (1991)
   95-119; see Internal Discrete DLA). A hole inside the cluster fills
   once a whole tile fits in it.

   B + T overlaps q + T exactly when B is inside q + D, with D the
   difference set T - T, so B stops the first moment it leaves the
   union U of the sets q + D, at a FREE point: one inside no copy
   (copyCover, js/sim-tile-shape.js). Everything below is exact for
   Brownian motion, except the one stop within EPSILON.

   WALK ON SPHERES (M. Muller, "Some continuous Monte Carlo methods for
   the Dirichlet problem", Ann. Math. Statist. 27 (1956) 569-589). Where
   B is, let r be its distance to the nearest free point, or any
   smaller number. U holds the disk (ball) of radius r around B, so B
   can't stop before it leaves that disk, and Brownian motion leaves a
   disk at a uniform point of its circle. So B jumps straight there:
   exact, by the strong Markov property. For r it takes the larger of
   two lower bounds:
     - how deep B is in the copy it is deepest in (copyCover's depth),
       since that copy holds the whole disk. The copies near B come
       from buckets (newPointBuckets, js/sim-cluster.js);
     - deep inside the cluster, the radius of the INNER BALL (below), a
       ball around the source that U is known to hold, minus how far B
       is from the source.
   THE STOP. Where two copies overlap only a little, B can be near the
   edges of both and still far from any free point, so a small depth
   alone never stops B. When both bounds are below EPSILON (times the
   tile's radius), the free point nearest B is found exactly
   (copyCover's nearestFree). If it is within EPSILON, B stops there:
   its tile then just touches the cluster and overlaps no tile. If not,
   no free point is within EPSILON of B, so B jumps that far. As epsilon
   goes to 0 this is exactly the model.

   THE INNER BALL. The cells of a grid (squares, in space cubes),
   CELL_RADII tile radii wide, are looked at in order of how far each
   cell's middle is from the source (a heap, newHeap, js/sim-worker.js).
   A cell is COVERED when all of it is inside U: when one copy holds the
   disk (ball) around the cell's middle that holds the cell; or else when
   each of its 4 (in space 8) quarters is covered, halving down to
   LEVELS times; and there, when no free point is that near its middle
   (nearestFree). U only grows, so a covered cell stays covered. Say the
   first cell not covered yet has its middle at distance d. A point
   nearer the source than d minus a cell's half-diagonal is in a cell
   whose middle is nearer than d, which was looked at before, so is
   covered: U holds the ball of that radius.

   Random numbers (coupling): move j of particle p uses the uniform
   number made from the seed, p and j (seededUniform,
   js/sim-worker.js), so going from n to n + 1 particles only adds one
   tile.

   The file has these parts, with no drawing and no buttons:
     1. newInternalContinuousDLA(options): the growth itself. The check
        page (internal-continuous-dla-check.html) tests it in the
        browser.
     2. growthWorker(): runs it in a second thread for the sim page.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH
   ===================================================================== */

// The tiles are filed in buckets this many times as wide as D reaches
// (copyCover's reach), so the copies that could hold a point, or come
// within a small distance of it, are in the 3 x 3 (x 3) buckets around it.
const BUCKET_REACHES = 1.1;

// The inner ball's grid: cells this many tile radii wide, quartered at
// most LEVELS times.
const CELL_RADII = 1, LEVELS = 4;

// Make a new growth. "options" has:
//   dim        2 (the plane) or 3 (space)
//   tile       the tile's shape (tilePolygon, or in space
//              tilePolyhedron, js/sim-tile-shape.js)
//   epsilon    the stop, in tile radii (DEFAULT_EPSILON, js/sim-continuum.js,
//              if left out)
//   seed       the seed (any text)
//   seedTiles  (optional, for the check page) the centers [x, y] (in
//              space [x, y, z]) of tiles the cluster starts with (the
//              source, the origin, must then be inside one of their
//              copies of D)
//   smallSteps (optional, for the check page) true: small steps of
//              Brownian motion instead of the jumps (brownianStep and
//              SMALL_STEP_SHARE, js/sim-continuum.js)
// It returns an object whose addParticle() lets one more particle in,
// whose land(p) says where particle p would stop (its tile's center)
// without adding it, whose innerRadius() is the inner ball's radius now,
// and whose path is the latest particle's walk: its places and the
// radii of the circles (spheres) it jumped across, [x, y, r] each (in
// space [x, y, z, r]), with r = 0 where it stopped.
function newInternalContinuousDLA(options) {
  const dims = options.dim, tile = options.tile, rhoMax = tile.rhoMax;
  const cover = copyCover(tile), random = seededUniform(options.seed);
  const epsilon = (options.epsilon || DEFAULT_EPSILON) * rhoMax;
  const buckets = newPointBuckets(dims, BUCKET_REACHES * cover.reach);
  const inner = newInnerBall(dims, CELL_RADII * rhoMax, coveredCell);

  const g = {
    tile: tile,
    cluster: newTileCluster(dims),
    jumps: 0,           // jumps taken, by every particle so far
    path: [],           // the latest particle's walk
    atEdge: false,      // (never: the plane has no edge)
    addParticle: addParticle, land: land, innerRadius: inner.radius,
  };
  const c = g.cluster;
  (options.seedTiles || []).forEach(add);

  function add(place) {
    buckets.add(c.count, place);
    c.add(place);
  }

  function addParticle() {
    add(land(c.count));
    return true;
  }

  // How deep the place is in the copy it is deepest in (-Infinity if no
  // copy is near).
  function deepest(place) {
    let most = -Infinity;
    buckets.within(place, cover.reach, function (i, q) { most = Math.max(most, cover.depth(place, q)); });
    return most;
  }

  // The free point nearest the place, if it is within delta (null if not).
  function nearestFree(place, delta) {
    const near = [];
    buckets.within(place, cover.reach + delta, function (i, q) { near.push(q); });
    return cover.nearestFree(place, delta, near);
  }

  // Whether the cell (a square or cube) with this middle and side is all
  // inside U, after "level" quarterings (see the top). The quarters found
  // covered are kept, as "level|middle", since they stay covered.
  const coveredParts = new Set();
  function coveredCell(middle, side, level) {
    const half = side * Math.sqrt(dims) / 2;
    if (deepest(middle) >= half) return true;
    if (level === LEVELS) return nearestFree(middle, half) === null;
    for (let corner = 0; corner < (1 << dims); corner++) {
      const part = middle.map(function (v, d) { return v + ((corner >> d) & 1 ? side : -side) / 4; });
      const key = (level + 1) + "|" + part.join(",");
      if (coveredParts.has(key)) continue;
      if (!coveredCell(part, side / 2, level + 1)) return false;
      coveredParts.add(key);
    }
    return true;
  }

  // Where particle p stops: its tile's center.
  function land(p) {
    let j = 0;
    const draw = function () { return random.uniform(p, j++); };
    const inside = inner.radius();
    let place = new Array(dims).fill(0);
    g.path = [];
    for (;;) {
      let room = Math.max(inside - Math.hypot(...place), deepest(place));
      if (room < epsilon) {
        const free = nearestFree(place, epsilon);
        if (free) {
          g.path.push(place.concat(0));
          return free;
        }
        room = epsilon;
      }
      g.path.push(place.concat(room));
      const step = options.smallSteps ? brownianStep(dims, room / SMALL_STEP_SHARE, draw) : pointOnSphere(dims, room, draw);
      place = place.map(function (x, d) { return x + step[d]; });
      g.jumps++;
    }
  }

  return g;
}

// The inner ball (see the top): radius() is the radius of a ball around
// the source (the origin) that U is known to hold, 0 if none, with
// covered(middle, side, 0) saying whether a cell of the grid "side" wide
// is all inside U. A cell is filed by its whole-number place "at" (its
// middle is (at + 1/2) side), as one number (each coordinate in 16 bits).
function newInnerBall(dims, side, covered) {
  const heap = newHeap(), seen = new Set(), half = side * Math.sqrt(dims) / 2;
  const middleOf = function (at) { return at.map(function (i) { return (i + 0.5) * side; }); };
  const keyOf = function (at) {
    let key = 0;
    for (let d = 0; d < 3; d++) key = key * 65536 + ((d < dims ? at[d] : 0) + 32768);
    return key;
  };
  const atOf = function (key) {
    const at = [];
    for (let d = 2; d >= 0; d--) { at[d] = key % 65536 - 32768; key = Math.floor(key / 65536); }
    return at.slice(0, dims);
  };
  function file(at) {
    const key = keyOf(at);
    if (seen.has(key)) return;
    seen.add(key);
    heap.add(Math.hypot(...middleOf(at)), key);
  }
  // First the cells with a corner at the source. Every other cell has a
  // neighbor across a side whose middle is nearer the source, so taking
  // out the nearest cell and filing its neighbors keeps every cell
  // nearer than the nearest one waiting already taken out.
  for (let corner = 0; corner < (1 << dims); corner++) {
    file(new Array(dims).fill(0).map(function (_, d) { return (corner >> d) & 1 ? 0 : -1; }));
  }

  function radius() {
    for (;;) {
      const at = atOf(heap.firstItem());
      if (!covered(middleOf(at), side, 0)) return Math.max(0, heap.firstKey() - half);
      heap.take();
      for (let d = 0; d < dims; d++) {
        for (const s of [-1, 1]) {
          const next = at.slice();
          next[d] += s;
          file(next);
        }
      }
    }
  }

  return { radius: radius };
}


/* =====================================================================
   2. THE GROWTH IN A SECOND THREAD
   ---------------------------------------------------------------------
   It runs as every cluster sim's second thread does (serveGrowth,
   js/sim-cluster.js). The page sends the tile typed as a formula
   ("tileFormula", with the sliders' "values"); this thread reads it
   and makes its polygon (in space, its polyhedron: tileFromOptions,
   js/sim-tile-shape.js, with math.js). Its own numbers: the farthest
   tile's center (radius), the radius of gyration of the centers,
   jumps, the latest particle's walk, and in the first report after a
   setup, the tile's outline for drawing (tileOutline). The new tiles
   are sent as their centers, x and y (and z). The charts' samples: the
   radius and the radius of gyration. The run is done at
   MOST_PARTICLES.
   ===================================================================== */
const MOST_PARTICLES = 100000;

function growthWorker() {
  // math.js reads the tile's formula. The version is fixed so an update
  // can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/mathjs@15.2.0/lib/browser/math.js");
  let shapeSent = false;
  serveGrowth({
    make: function (options) {
      shapeSent = false;
      return newInternalContinuousDLA(Object.assign({}, options, { tile: tileFromOptions(options) }));
    },
    most: MOST_PARTICLES, names: TILE_SAMPLES, sample: tileSample, pieces: tilePieces,
    numbers: function (growth) {
      const c = growth.cluster, numbers = { radius: c.farthest, gyration: c.gyration(), jumps: growth.jumps, path: growth.path };
      if (!shapeSent) {
        numbers.shape = tileOutline(growth.tile);
        shapeSent = true;
      }
      return numbers;
    },
  });
}
