/* =====================================================================
   external-continuous-dla-growth.js  —  the growth behind the
   "External Continuous DLA" sim
   ---------------------------------------------------------------------
   THE MODEL (nadya's). A tile shape T (a disk by default) is fixed, and
   tiles are copies of it moved without turning. The cluster starts as
   one tile, centered at the origin. Particles come one at a time from
   infinity: a point B does Brownian motion, carrying the tile B + T
   with it, and stops at the first time B + T touches the cluster. That
   tile joins the cluster. For disks this is the classic off-lattice
   DLA (P. Meakin, "Diffusion-controlled cluster formation in
   2-6-dimensional space", Phys. Rev. A 27 (1983) 1495-1507).

   B + T touches the tile q + T exactly when B is in q + D, with D the
   difference set T - T (copyGap, js/sim-tile-shape.js). So B is a point
   doing Brownian motion until it first reaches the union U of the sets
   q + D: its stopping place has the harmonic measure from infinity of
   U. Everything below is exact for Brownian motion, except the one
   stop within EPSILON of U.

   FROM INFINITY, EXACTLY. U fits inside the circle of radius
   R = (the farthest tile's center) + (the most D reaches, 2 rhoMax).
   Brownian motion from infinity first meets that circle at a uniform
   point, by symmetry, so each particle starts there (pointOnSphere,
   js/sim-continuum.js). A particle that later gets outside the circle
   is brought back to it the way Brownian motion comes back
   (brownianReturn, the Poisson kernel). (P. Morters and Y. Peres,
   "Brownian Motion", Cambridge University Press, 2010, Chapter 3.)

   WALK ON SPHERES (M. Muller, "Some continuous Monte Carlo methods for
   the Dirichlet problem", Ann. Math. Statist. 27 (1956) 569-589).
   Where B is, let r be its distance to U, or any smaller number. The
   circle of radius r around B holds no point of U, so B can't stop
   before it leaves that disk, and Brownian motion leaves a disk at a
   uniform point of its circle. So B jumps straight there: exact, by
   the strong Markov property. The distance r comes from the tiles
   near B, filed in buckets (newPointBuckets, js/sim-cluster.js):
     - within NEAR_RADII tile radii, the exact gap to each tile
       (copyGap; when the gap is big, a lower bound at least half of it
       is enough, and quicker for a tile that isn't convex);
     - past that, the distance to the nearest bucket of a coarser grid
       that holds a tile at all, minus the most D reaches.
   THE ONE APPROXIMATION: the jumps get smaller as B nears U and never
   quite reach it, so B stops once it is within EPSILON (times the
   tile's size) of U, and then slides straight to the nearest point of
   U: its tile then just touches the cluster and overlaps no tile. As
   epsilon goes to 0 this is exactly the model. The number of jumps
   grows only like log(1 / epsilon), since U has a cone of a fixed
   opening at each point of its edge (I. Binder and M. Braverman, "The
   rate of convergence of the walk on spheres algorithm", Geom. Funct.
   Anal. 22 (2012) 558-587, Theorem 2 with Corollary 3; in a general
   planar domain it would be log(1 / epsilon) squared).

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
// of about 1 in a million.
const SMALL_STEP_SHARE = 5;

// How far around B the tiles are looked at one by one, in tile radii,
// in buckets this wide; and the width of the coarse buckets, which only
// say whether they hold a tile, looked at out to the launch circle.
const NEAR_RADII = 8, BUCKET_RADII = 4, COARSE_RADII = 32;

// Make a new growth. "options" has:
//   dim        2 (3 comes with the 3D tiles)
//   tile       the tile's shape (tilePolygon, js/sim-tile-shape.js)
//   epsilon    the stop, in tile radii (DEFAULT_EPSILON if left out)
//   seed       the seed (any text)
//   seedTiles  (optional, for the check page) the centers [x, y] of
//              the tiles the cluster starts as, instead of one at (0, 0)
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
// places and the radii of the circles it jumped across, [x, y, r] each.
// r is 0 where it stopped (before the slide), and -1 where it got
// outside the launch circle, to be brought back to it.
function newExternalContinuousDLA(options) {
  const dims = options.dim, tile = options.tile, rhoMax = tile.rhoMax;
  const gaps = copyGap(tile), random = seededUniform(options.seed);
  const epsilon = (options.epsilon || DEFAULT_EPSILON) * rhoMax, near = NEAR_RADII * rhoMax;
  const buckets = newPointBuckets(dims, BUCKET_RADII * rhoMax), coarse = newPointBuckets(dims, COARSE_RADII * rhoMax);
  const spread = newGyration(dims);
  const seedShape = options.seedShape || null;

  const g = {
    tile: tile,
    cluster: { count: 0, x: [], y: [], farthest: 0, gyration: spread.radius },
    jumps: 0,           // jumps taken, by every particle so far
    returns: 0,         // particles brought back to the launch circle
    path: [],           // the latest particle's walk
    atEdge: false,      // (never: the plane has no edge)
    addParticle: addParticle, land: land, launchRadius: launchRadius,
  };
  const c = g.cluster;
  (options.seedTiles || (seedShape ? [] : [[0, 0]])).forEach(add);

  function add(place) {
    buckets.add(c.count, place);
    coarse.add(c.count, place);
    spread.add(place);
    c.x.push(place[0]); c.y.push(place[1]);
    c.farthest = Math.max(c.farthest, Math.hypot(place[0], place[1]));
    c.count++;
  }

  function addParticle() {
    add(land(c.count));
    return true;
  }

  // U fits inside this circle.
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
      const r = Math.hypot(place[0], place[1]);
      if (r > R) {
        g.path.push([place[0], place[1], -1]);
        place = brownianReturn(place, R, draw);
        g.returns++;
        continue;
      }
      // How far U is: the nearest tile's gap, or past NEAR_RADII a lower
      // bound from the coarse buckets.
      let slide = null;
      let room = buckets.nearest(place, near, 2 * rhoMax, function (i, q, best) {
        return gaps.gap(place[0] - q[0], place[1] - q[1], best, 4 * epsilon);
      });
      if (room < near) slide = gaps.slide;
      else room = Math.max(room, coarse.roughDistance(place, R) - 2 * rhoMax);
      if (seedShape) {
        const toSeed = seedShape.gap(place, room);
        if (toSeed < room) { room = toSeed; slide = seedShape.slide; }
      }
      if (room < epsilon) {
        g.path.push([place[0], place[1], 0]);
        return [place[0] + slide[0], place[1] + slide[1]];
      }
      g.path.push([place[0], place[1], room]);
      const step = options.smallSteps ? brownianStep(dims, room / SMALL_STEP_SHARE, draw) : pointOnSphere(dims, room, draw);
      place = [place[0] + step[0], place[1] + step[1]];
      g.jumps++;
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
   polygon. Its own numbers: the farthest tile's center (radius), the
   radius of gyration of the centers, the launch radius, jumps,
   particles brought back, the latest particle's walk, and in the
   first report after a setup, the tile's polygon (128 of
   its corners) for drawing. The new tiles are sent as their centers,
   x and y. The charts' samples: the radius and the radius of gyration.
   The run is done at MOST_PARTICLES.
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
      const tile = tilePolygon(readShape(options.tileFormula, options.values, "The tile"));
      return newExternalContinuousDLA(Object.assign({}, options, { tile: tile }));
    },
    most: MOST_PARTICLES, names: ["radius", "gyration"],
    sample: function (growth) { return { radius: growth.cluster.farthest, gyration: growth.cluster.gyration() }; },
    numbers: function (growth, options) {
      const c = growth.cluster, numbers = {
        radius: c.farthest, gyration: c.gyration(), launchRadius: growth.launchRadius(),
        jumps: growth.jumps, returns: growth.returns, path: growth.path,
      };
      if (!shapeSent) {
        numbers.shape = tileOutline(growth.tile);
        shapeSent = true;
      }
      return numbers;
    },
    pieces: function (growth, from) {
      return { x: Float64Array.from(growth.cluster.x.slice(from)), y: Float64Array.from(growth.cluster.y.slice(from)) };
    },
  });
}
