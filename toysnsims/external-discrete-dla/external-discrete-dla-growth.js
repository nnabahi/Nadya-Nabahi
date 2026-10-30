/* =====================================================================
   external-discrete-dla-growth.js  —  the growth behind the "External
   Discrete DLA" sim
   ---------------------------------------------------------------------
   THE MODEL (diffusion-limited aggregation: T. Witten and L. Sander,
   "Diffusion-limited aggregation, a kinetic critical phenomenon",
   Phys. Rev. Lett. 47 (1981) 1400-1403). The cluster starts as the
   seed: the origin (cell 0 of block (0, 0, 0)). Particles come one at a
   time from far away. Each walks (the simple random walk: every
   neighbor equally likely) until it first reaches an empty site next
   to the cluster (an "edge" site, js/sim-cluster.js); it stops there,
   and that site joins the cluster. In 3D a walker may never come back
   (the walk is transient), and only walkers that reach the cluster
   count: one that wanders off for good is replaced by a new one.

   "FROM FAR AWAY": THE ONE APPROXIMATION. Exactly, a particle starts
   at infinity, which no program can do. Here, with "reach" how far the
   farthest edge site can be from the origin (the farthest site of the
   cluster, plus the longest move):
     - LAUNCH: each walker starts at the site nearest a point taken
       uniformly on the circle (in 3D the sphere) of radius
       R = launch x reach around the origin (and at least 2 longest
       moves past the reach).
     - RETURN: a walker that gets farther than FAR_LAUNCHES x R is
       brought back to that circle the way Brownian motion would come
       back (P. Morters and Y. Peres, "Brownian Motion", Cambridge
       University Press, 2010, Chapter 3): in 2D it always comes back,
       at an angle from the Poisson kernel for the outside of a disk (a
       wrapped Cauchy law); in 3D it comes back with chance R / r, at a
       point from the Poisson kernel for the outside of a ball, and
       otherwise it is replaced by a new walker.
   Both would be exact for Brownian motion, and the walk looks like
   Brownian motion from far away, so the error shrinks as R grows. The
   check page measures it against the exact answer on the square grid,
   and the default "launch" comes from that measurement.

   HOW IT IS RUN, EXACTLY OTHERWISE. A walker far from every edge site
   jumps across a ball instead of stepping (ballJumps, js/sim-walk.js):
   as long as the ball holds no edge site, nothing in it could stop the
   walker (it can't reach a cluster site without passing an edge site
   first), so jumping straight to where it first leaves the ball is
   exactly the same as taking every step. The room it has is how far
   the nearest edge site is, bounded below by
     - its distance from the origin, minus reach (the triangle
       inequality), and
     - near the cluster, a search of the edge sites around it (roomAt,
       js/sim-cluster.js), done once and then reused while the walker
       moves: if the room at x0 is r0, the room at x is at least r0
       minus how far x is from x0.
   On a Penrose tiling, which never repeats, it always steps.

   Random numbers (coupling): move j of walker p uses the uniform
   number made from the seed, p and j (seededUniform, js/sim-worker.js),
   so going from n to n + 1 particles only adds one site.

   The file has these parts, with no drawing and no buttons:
     1. newExternalDLA(options): the growth itself. The check page
        (external-discrete-dla-check.html) tests it in the browser.
     2. growthWorker(): runs it in a second thread for the sim page.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH
   ===================================================================== */

// A walker farther than this many launch radii is brought back.
const FAR_LAUNCHES = 4;

// The launch radius the page starts with, in reaches. It comes from the
// check page's measurement on the square grid: from three clusters
// (three sites, 30 and 150 particles), a million walkers each landed
// where the exact law says (a chi-square test) at 2 reaches and more,
// while at 1 reach the 30-particle cluster's landings were off (p about
// 1e-9). So 2 is the smallest launch whose error a million walkers
// can't see.
const DEFAULT_LAUNCH = 2;

// Make a new growth. "options" has:
//   dim        2 or 3
//   tiling     2D: another tiling's repeating block or a Penrose plane
//              (null: the square grid)
//   block      3D: a tiling of space (honeycombBlock, js/sim-honeycombs.js)
//   launch     the launch radius, in reaches (see the top of this file)
//   seed       the seed (any text)
//   seedCells  (optional) the sites the cluster starts as, each
//              [I, J, K, k] (the origin if left out)
//   plainSteps (optional) true: never jump, always step (the check page
//              tests the jumps against this)
// It returns an object whose addParticle() lets one more particle in
// (false, doing nothing, at the edge of a Penrose plane), whose land(p)
// says where walker p would stop (a site), without adding it, and whose
// launchRadius() is the launch circle's radius now.
function newExternalDLA(options) {
  const lattice = latticeFor(options);
  const cluster = newCluster(lattice), jumps = ballJumps(lattice), random = seededUniform(options.seed);
  const start = lattice.placeOf(0, 0, 0, 0), dims = start.length;
  const L = lattice.periodic ? lattice.longestMove : 1;
  const near = 8 * L;       // how far a search of the edge sites looks
  for (const [I, J, K, k] of options.seedCells || [[0, 0, 0, 0]]) cluster.add(newSite(I, J, K, k));
  const seedCount = cluster.count;

  const g = {
    lattice: lattice, cluster: cluster,
    steps: 0,           // plain steps taken, by every walker so far
    jumps: 0,           // jumps taken
    returns: 0,         // walkers brought back to the launch circle
    replaced: 0,        // 3D: walkers that wandered off for good
    atEdge: false,      // on a Penrose tiling: the cluster has reached the edge of the plane
    addParticle: addParticle, land: land, launchRadius: launchRadius,
  };

  // "launch" reaches, and at least 2 longest moves past the reach.
  function launchRadius() {
    const reach = cluster.farthest + L;
    return Math.max(options.launch * reach, reach + 2 * L);
  }

  function addParticle() {
    if (g.atEdge) return false;
    const s = land(cluster.count - seedCount);
    if (s === null) { g.atEdge = true; return false; }
    cluster.add(s);
    return true;
  }

  // Where walker p stops (null if a Penrose plane can't hold its walk).
  function land(p) {
    const reach = cluster.farthest + L, R = launchRadius();
    // (A Penrose plane must hold every cell the walker can reach.)
    if (!lattice.periodic && !lattice.reaches(start, FAR_LAUNCHES * R + 4)) return null;
    let j = 0;
    const draw = function () { return random.uniform(p, j++); };
    let s = siteNear(lattice, pointOnSphere(dims, R, draw));
    let known = null;    // the last search of the edge sites: { place, room }
    while (!cluster.onEdge(s)) {
      const place = lattice.placeOf(s.I, s.J, s.K, s.k), r = distanceBetween(place, start);
      if (r > FAR_LAUNCHES * R) {
        s = siteNear(lattice, broughtBack(place, R, draw));
        known = null;
        continue;
      }
      if (lattice.periodic && !options.plainSteps) {
        let room = r - reach;
        if (room < near) {
          if (known) room = Math.max(room, known.room - distanceBetween(place, known.place));
          if (room < 2 * L) {
            known = { place: place, room: cluster.roomAt(place, near) };
            room = Math.max(room, known.room);
          }
        }
        if (jumps.jump(s, room, draw()) > 0) { g.jumps++; continue; }
      }
      walkStep(lattice, s, draw());
      g.steps++;
    }
    return s;
  }

  // Where a walker at "place", farther than R from the origin, comes
  // back to the circle (sphere) of radius R, or in 3D, if it wanders off
  // for good, where a new walker starts instead.
  function broughtBack(place, R, draw) {
    g.returns++;
    if (dims === 2) return returnPoint2D(place, R, draw());
    const r = distanceBetween(place, start);
    if (draw() < R / r) return returnPoint3D(place, R, draw(), draw());
    g.replaced++;
    return pointOnSphere(3, R, draw);
  }

  return g;
}

// A point taken uniformly on the circle (dims = 2) or sphere (3) of
// radius R around the origin, from uniform numbers draw().
function pointOnSphere(dims, R, draw) {
  const angle = 2 * Math.PI * draw();
  if (dims === 2) return [R * Math.cos(angle), R * Math.sin(angle)];
  const z = 2 * draw() - 1, across = Math.sqrt(1 - z * z);    // (Archimedes: z is uniform on a sphere)
  return [R * across * Math.cos(angle), R * across * Math.sin(angle), R * z];
}

// Where Brownian motion from "place" (at distance r > R) first reaches
// the circle of radius R. Its angle from the direction of the place has
// the density (1 - q^2) / (2 pi (1 + q^2 - 2 q cos t)) with q = R / r
// (the Poisson kernel for the outside of a disk), the wrapped Cauchy
// law, which is t = 2 arctan((1 - q) / (1 + q) tan(pi (u - 1/2))).
function returnPoint2D(place, R, u) {
  const r = Math.hypot(place[0], place[1]), q = R / r;
  const angle = Math.atan2(place[1], place[0]) + 2 * Math.atan((1 - q) / (1 + q) * Math.tan(Math.PI * (u - 0.5)));
  return [R * Math.cos(angle), R * Math.sin(angle)];
}

// Where Brownian motion from "place" (at distance r > R) first reaches
// the sphere of radius R, given that it does. By inversion in the
// sphere (the Kelvin transform), that is where Brownian motion from the
// inside point s = R^2 / r (in the same direction) first leaves the
// ball, whose density at the angle t from that direction is
// proportional to (R^2 - s^2) / (R^2 + s^2 - 2 R s cos t)^(3/2). Its
// cos t, from the uniform u by inverting the distribution function,
// is (R^2 + s^2 - 1/w^2) / (2 R s) with
// w = 2 s u / (R^2 - s^2) + 1 / (R + s); the turn around that direction
// is uniform (from v).
function returnPoint3D(place, R, u, v) {
  const r = Math.hypot(place[0], place[1], place[2]), s = R * R / r;
  const w = 2 * s * u / (R * R - s * s) + 1 / (R + s);
  const cos = Math.min(1, Math.max(-1, (R * R + s * s - 1 / (w * w)) / (2 * R * s))), sin = Math.sqrt(1 - cos * cos);
  const toward = place.map(function (x) { return x / r; });
  const [e1, e2] = perpendicularPair(toward), turn = 2 * Math.PI * v;
  return [0, 1, 2].map(function (d) {
    return R * (cos * toward[d] + sin * (Math.cos(turn) * e1[d] + Math.sin(turn) * e2[d]));
  });
}

// Two unit vectors at right angles to each other and to the unit
// vector "toward".
function perpendicularPair(toward) {
  const other = Math.abs(toward[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = cross3(toward, other), size = length3(e1);
  const first = e1.map(function (x) { return x / size; });
  return [first, cross3(toward, first)];
}

// The site whose middle is nearest "place", or near it: from the
// origin, move to the neighbor nearest the place while one is nearer.
// (On the grids that is the nearest site; on other tilings it is a
// site within a cell or so of the place, which is all a launch needs.)
function siteNear(lattice, place) {
  const s = newSite(0, 0, 0, 0);
  let far = distanceBetween(lattice.placeOf(0, 0, 0, 0), place);
  for (;;) {
    let best = null, bestFar = far;
    for (const [k2, dI, dJ, dK] of lattice.movesOf(s.k)) {
      const f = distanceBetween(lattice.placeOf(s.I + dI, s.J + dJ, s.K + dK, k2), place);
      if (f < bestFar) { best = [k2, dI, dJ, dK]; bestFar = f; }
    }
    if (!best) return s;
    s.I += best[1]; s.J += best[2]; s.K += best[3]; s.k = best[0];
    far = bestFar;
  }
}


/* =====================================================================
   2. THE GROWTH IN A SECOND THREAD
   ---------------------------------------------------------------------
   It runs as every cluster sim's second thread does (serveGrowth,
   js/sim-cluster.js), with newExternalDLA's options from the page. Its
   own numbers: the farthest cell's distance (radius), the radius of
   gyration, the launch radius now, steps, jumps, walkers brought back,
   and in 3D walkers replaced. The charts' samples: the radius and the
   radius of gyration. The run is done at MOST_PARTICLES.
   ===================================================================== */
const MOST_PARTICLES = 100000;

function growthWorker() {
  serveGrowth({
    make: newExternalDLA, most: MOST_PARTICLES, names: ["radius", "gyration"],
    sample: function (growth) { return { radius: growth.cluster.farthest, gyration: growth.cluster.gyration() }; },
    numbers: function (growth) {
      const c = growth.cluster;
      return {
        radius: c.farthest, gyration: c.gyration(), launchRadius: growth.launchRadius(),
        steps: growth.steps, jumps: growth.jumps, returns: growth.returns, replaced: growth.replaced,
      };
    },
  });
}
