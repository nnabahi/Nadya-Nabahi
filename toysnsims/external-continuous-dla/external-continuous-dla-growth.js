/* =====================================================================
   external-continuous-dla-growth.js  —  the growth behind the
   "External Continuous DLA" sim
   ---------------------------------------------------------------------
   THE MODEL (nadya's). A tile shape T (a disk by default) is fixed, and
   tiles are copies of it moved without turning, in the plane or in
   space. The cluster starts as one tile, centered at the origin.
   Particles come one at a time from infinity: a point B does Brownian
   motion, carrying the tile B + T with it, and stops at the first time
   B + T touches the cluster. That tile joins the cluster. For disks
   (balls) this is the classic off-lattice DLA (P. Meakin,
   "Diffusion-controlled cluster formation in 2-6-dimensional space",
   Phys. Rev. A 27 (1983) 1495-1507).

   B + T touches the tile q + T exactly when B is in q + D, with D the
   difference set T - T (copyGap, js/sim-tile-shape.js). So B is a point
   doing Brownian motion until it first reaches the union U of the sets
   q + D: its stopping place has the harmonic measure from infinity of
   U. Everything below is exact for Brownian motion, except the one
   stop within EPSILON of U.

   FROM INFINITY, EXACTLY. U fits inside the circle (in space, the
   sphere) of radius R = (the farthest tile's center) + (the most D
   reaches, 2 rhoMax). Brownian motion from infinity first meets that
   circle at a uniform point, by symmetry, so each particle starts there
   (pointOnSphere, js/sim-continuum.js). A particle that later gets
   outside the circle is brought back to it the way Brownian motion
   comes back (brownianReturn, the Poisson kernel). In space Brownian
   motion may never come back (it does only with chance R / r from
   distance r), so "from infinity" there means: given that it reaches
   the cluster. A particle that wanders off for good is replaced by a
   new one on the sphere, which is that same law. (P. Morters and
   Y. Peres, "Brownian Motion", Cambridge University Press, 2010,
   Chapter 3.)

   WALK ON SPHERES (M. Muller, "Some continuous Monte Carlo methods for
   the Dirichlet problem", Ann. Math. Statist. 27 (1956) 569-589).
   Where B is, let r be its distance to U, or any smaller number. The
   circle (sphere) of radius r around B holds no point of U, so B can't
   stop before it leaves that disk (ball), and Brownian motion leaves a
   disk at a uniform point of its circle. So B jumps straight there:
   exact, by the strong Markov property. The distance r comes from the tiles
   near B, filed in buckets (newPointBuckets, js/sim-cluster.js):
     - first, the distance to the nearest bucket of a coarse grid that
       holds a tile at all, minus the most D reaches (quick);
     - if that is within NEAR_RADII tile radii, the exact gap to each
       tile that near (copyGap; when the gap is big, a lower bound at
       least half of it is enough, and quicker for a tile that isn't
       convex).
   THE ONE APPROXIMATION: the jumps get smaller as B nears U and never
   quite reach it, so B stops once it is within EPSILON (times the
   tile's size) of U, and then slides straight to the nearest point of
   U: its tile then just touches the cluster and overlaps no tile. As
   epsilon goes to 0 this is exactly the model. The number of jumps
   grows only like log(1 / epsilon), in the plane and in space, since U
   has a cone of a fixed opening at each point of its edge (I. Binder
   and M. Braverman, "The rate of convergence of the walk on spheres
   algorithm", Geom. Funct. Anal. 22 (2012) 558-587, Theorem 2 with
   Corollary 3; without the cones it could be log(1 / epsilon) squared
   in the plane, and a power of 1 / epsilon in space).

   Random numbers (coupling): move j of particle p uses the uniform
   number made from the seed, p and j (seededUniform, js/sim-worker.js),
   so going from n to n + 1 particles only adds one tile.

   The file has these parts, with no drawing and no buttons:
     1. newExternalContinuousDLA(options): the growth itself. The check
        page (external-continuous-dla-check.html) tests it in the
        browser.
     2. growthWorker(): runs it in a second thread for the sim page.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH
   ===================================================================== */

// A particle stops within this much of touching, in tile radii (rhoMax),
// unless the page says otherwise.
const DEFAULT_EPSILON = 1e-4;

// With the option smallSteps (for the check page), B moves in small
// steps of Brownian motion instead of jumping across each circle of
// radius r: the steps have standard deviation r / SMALL_STEP_SHARE in
// each direction, so a step reaches past the circle only with a chance
// of about 1 in 270,000 (past the sphere, in space, about 1 in 65,000:
// a step's length over its standard deviation has the chi law with 2,
// or 3, degrees of freedom), and past U, which is farther, even less
// often.
const SMALL_STEP_SHARE = 5;

// How far around B the tiles are looked at one by one, in tile radii,
// in buckets this wide; and the width of the coarse buckets, which only
// say whether they hold a tile, looked at out to the launch circle.
const NEAR_RADII = 8, BUCKET_RADII = 4, COARSE_RADII = 32;

// Make a new growth. "options" has:
//   dim        2 (the plane) or 3 (space)
//   tile       the tile's shape (tilePolygon, or in space
//              tilePolyhedron, js/sim-tile-shape.js)
//   epsilon    the stop, in tile radii (DEFAULT_EPSILON if left out)
//   seed       the seed (any text)
//   seedTiles  (optional, for the check page) the centers [x, y] (in
//              space [x, y, z]) of the tiles the cluster starts as,
//              instead of one at the origin
//   seedShape  (optional, for the check page) a shape the cluster
//              starts as, instead of one tile: { reach, gap(place,
//              best), slide }, with reach how far it reaches from the
//              origin once the tile's own reach is added (so a particle
//              outside that can't touch it), and gap and slide as in
//              copyGap but measured from the particle's place
//   smallSteps (optional, for the check page) true: small steps of
//              Brownian motion instead of the jumps (brownianStep,
//              js/sim-continuum.js)
// It returns an object whose addParticle() lets one more particle in,
// whose land(p) says where particle p would stop (its tile's center),
// without adding it, and whose path is the latest particle's walk: its
// places and the radii of the circles (spheres) it jumped across,
// [x, y, r] each (in space [x, y, z, r]). r is 0 where it stopped
// (before the slide), and -1 where it got outside the launch circle,
// to be brought back to it (or in space, replaced by a new particle).
function newExternalContinuousDLA(options) {
  const dims = options.dim, tile = options.tile, rhoMax = tile.rhoMax;
  const gaps = copyGap(tile), random = seededUniform(options.seed);
  const epsilon = (options.epsilon || DEFAULT_EPSILON) * rhoMax, near = NEAR_RADII * rhoMax;
  const buckets = newPointBuckets(dims, BUCKET_RADII * rhoMax), coarse = newPointBuckets(dims, COARSE_RADII * rhoMax);
  const spread = newGyration(dims);
  const seedShape = options.seedShape || null;

  const g = {
    tile: tile,
    cluster: { count: 0, x: [], y: [], z: [], farthest: 0, gyration: spread.radius },
    jumps: 0,           // jumps taken, by every particle so far
    returns: 0,         // particles brought back to the launch circle
    replaced: 0,        // in space: particles that wandered off for good
    path: [],           // the latest particle's walk
    atEdge: false,      // (never: the plane has no edge)
    addParticle: addParticle, land: land, launchRadius: launchRadius,
  };
  const c = g.cluster;
  (options.seedTiles || (seedShape ? [] : [new Array(dims).fill(0)])).forEach(add);

  function add(place) {
    buckets.add(c.count, place);
    coarse.add(c.count, place);
    spread.add(place);
    c.x.push(place[0]); c.y.push(place[1]);
    if (dims === 3) c.z.push(place[2]);
    c.farthest = Math.max(c.farthest, Math.hypot(...place));
    c.count++;
  }

  function addParticle() {
    add(land(c.count));
    return true;
  }

  // U fits inside this circle (sphere).
  function launchRadius() {
    return Math.max(c.count > 0 ? c.farthest + 2 * rhoMax : 0, seedShape ? seedShape.reach : 0);
  }

  // Where particle p stops: its tile's center.
  function land(p) {
    let j = 0;
    const draw = function () { return random.uniform(p, j++); };
    const R = launchRadius();
    let place = pointOnSphere(dims, R, draw);
    g.path = [];
    for (;;) {
      // How far U is: first a quick lower bound from the coarse buckets;
      // within NEAR_RADII of a tile, the nearest tile's gap.
      let slide = null;
      let room = coarse.roughDistance(place, R) - 2 * rhoMax;
      if (room < near) {
        room = Math.max(room, buckets.nearest(place, near, 2 * rhoMax, function (i, q, best) {
          return gaps.gap(place, q, best, 4 * epsilon);
        }));
        if (room < near) slide = gaps.slide;
      }
      if (seedShape) {
        const toSeed = seedShape.gap(place, room);
        if (toSeed < room) { room = toSeed; slide = seedShape.slide; }
      }
      if (room < epsilon) {
        g.path.push(place.concat(0));
        return place.map(function (x, d) { return x + slide[d]; });
      }
      g.path.push(place.concat(room));
      const step = options.smallSteps ? brownianStep(dims, room / SMALL_STEP_SHARE, draw) : pointOnSphere(dims, room, draw);
      place = place.map(function (x, d) { return x + step[d]; });
      g.jumps++;
      // Outside the launch circle (sphere): back to it the way Brownian
      // motion comes back, or in space, if it never would, a new particle
      // in its place. (This is asked only after a jump: a point put on
      // the circle can come out a hair outside it by rounding.)
      if (Math.hypot(...place) > R) {
        g.path.push(place.concat(-1));
        const back = brownianReturn(place, R, draw);
        if (back) g.returns++; else g.replaced++;
        place = back || pointOnSphere(dims, R, draw);
      }
    }
  }

  return g;
}


/* =====================================================================
   2. THE GROWTH IN A SECOND THREAD
   ---------------------------------------------------------------------
   It runs as every cluster sim's second thread does (serveGrowth,
   js/sim-cluster.js). The page sends the tile typed as a formula
   ("tileFormula", with the sliders' "values"); this thread reads it
   (readShape, js/sim-tile-shape.js, with math.js) and makes its
   polygon (in space, its polyhedron). Its own numbers: the farthest
   tile's center (radius), the radius of gyration of the centers, the
   launch radius, jumps, particles brought back, in space particles
   replaced, the latest particle's walk, and in the first report after
   a setup, the tile's outline for drawing (tileOutline). The new tiles
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
      const inT = readShape(options.tileFormula, options.values, "The tile", options.dim);
      const tile = options.dim === 3 ? tilePolyhedron(inT) : tilePolygon(inT);
      return newExternalContinuousDLA(Object.assign({}, options, { tile: tile }));
    },
    most: MOST_PARTICLES, names: ["radius", "gyration"],
    sample: function (growth) { return { radius: growth.cluster.farthest, gyration: growth.cluster.gyration() }; },
    numbers: function (growth, options) {
      const c = growth.cluster, numbers = {
        radius: c.farthest, gyration: c.gyration(), launchRadius: growth.launchRadius(),
        jumps: growth.jumps, returns: growth.returns, replaced: growth.replaced, path: growth.path,
      };
      if (!shapeSent) {
        numbers.shape = tileOutline(growth.tile);
        shapeSent = true;
      }
      return numbers;
    },
    pieces: function (growth, from) {
      const c = growth.cluster;
      return { x: Float64Array.from(c.x.slice(from)), y: Float64Array.from(c.y.slice(from)), z: Float64Array.from(c.z.slice(from)) };
    },
  });
}
