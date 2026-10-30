/* =====================================================================
   internal-discrete-dla-growth.js  —  the growth behind the "Internal
   Discrete DLA" sim
   ---------------------------------------------------------------------
   THE MODEL (internal diffusion-limited aggregation, P. Diaconis and W.
   Fulton, "A growth model, a game, an algebra, Lagrange inversion, and
   characteristic classes", Rend. Sem. Mat. Univ. Pol. Torino 49 (1991)
   95-119). The cluster starts empty. Particles come one at a time.
   Each starts at the source, the origin (cell 0 of block (0, 0, 0)),
   and walks (the simple random walk: every neighbor equally likely)
   until it first reaches a site not in the cluster; it stops there,
   and that site joins the cluster. The first particle stops at once,
   at the origin. After n particles the cluster has exactly n sites.

   It runs on any lattice of js/sim-walk.js: the line, the square grid
   or any tiling of the plane (Penrose included), or any tiling of
   space.

   HOW IT IS RUN, EXACTLY. A particle deep inside the cluster jumps
   across a ball instead of stepping (ballJumps, js/sim-walk.js): as
   long as the ball holds only cluster sites, nothing in it could stop
   the particle, so jumping straight to where it first leaves the ball
   is exactly the same as taking every step. The room it has is how far
   the nearest empty site next to the cluster is (an "edge" site,
   js/sim-cluster.js): every empty site the particle could reach first
   is one of those. A lower bound for that: the nearest edge site to
   the origin, minus how far the particle is from the origin (the
   triangle inequality). Near the cluster's edge that leaves no room,
   and the particle steps (a search of the edge sites around it would
   allow small jumps there too, but tried out it was slower than the
   steps it saves: 5 seconds against 0.2 for 10,000 particles in 3D).
   On a Penrose tiling, which never repeats, it always steps.

   Random numbers (coupling): move j of particle p uses the uniform
   number made from the seed, p and j (seededUniform,
   js/sim-worker.js). So particle p walks the same way whatever came
   after it, and going from n to n + 1 particles only adds one site.

   THE NUMBERS IT KEEPS. Distances are straight lines between the
   middles of cells, from the origin's middle, in side lengths.
     inner radius   how far the nearest empty site next to the cluster
                    is (on the grids Z, Z², Z³ this is the nearest
                    empty site of all, since every site has a neighbor
                    nearer the origin, which then must be in the
                    cluster)
     outer radius   how far the farthest site of the cluster is
   On the grids the cluster grows like a ball (G. Lawler, M. Bramson
   and D. Griffeath, "Internal diffusion limited aggregation", Ann.
   Probab. 20 (1992) 2117-2140): the ball with n sites has radius
   rho_n, with 2 rho + 1 = n (1D), pi rho^2 = n (2D), 4/3 pi rho^3 = n
   (3D), and the errors rho_n - inner and outer - rho_n are tiny:
   O(log n) in 2D (D. Jerison, L. Levine and S. Sheffield, "Logarithmic
   fluctuations for internal DLA", J. Amer. Math. Soc. 25 (2012)
   271-301; A. Asselah and A. Gaudillière, Ann. Probab. 41 (2013)
   1115-1159) and O(sqrt(log n)) in 3D (Jerison, Levine and Sheffield,
   "Internal DLA in higher dimensions", Electron. J. Probab. 18 (2013)
   no. 98).

   The file has these parts, with no drawing and no buttons:
     1. newInternalDLA(options): the growth itself. The check page
        (internal-discrete-dla-check.html) tests it in the browser.
     2. growthWorker(): runs it in a second thread for the sim page.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH
   ===================================================================== */

// Make a new growth. "options" has:
//   dim        1, 2 or 3
//   tiling     2D: another tiling's repeating block or a Penrose plane
//              (null: the square grid)
//   block      3D: a tiling of space (honeycombBlock, js/sim-honeycombs.js)
//   seed       the seed (any text)
//   plainSteps (optional) true: never jump, always step (the check page
//              compares the two)
// It returns an object whose addParticle() lets one more particle in
// (false, doing nothing, at the edge of a Penrose plane).
function newInternalDLA(options) {
  const lattice = latticeFor(options);
  const cluster = newCluster(lattice), jumps = ballJumps(lattice), random = seededUniform(options.seed);
  const start = lattice.placeOf(0, 0, 0, 0);

  const g = {
    lattice: lattice, cluster: cluster,
    steps: 0,           // plain steps taken, by every particle so far
    jumps: 0,           // jumps taken
    atEdge: false,      // on a Penrose tiling: the cluster has reached the edge of the plane
    addParticle: addParticle,
  };

  // How much room the particle at "place" has (see the top of this file).
  function roomAt(place) { return cluster.nearestEdge() - distanceBetween(place, start); }

  function addParticle() {
    if (g.atEdge) return false;
    const p = cluster.count, s = newSite(0, 0, 0, 0);
    let j = 0;
    while (cluster.count > 0 && cluster.has(s)) {
      const place = lattice.placeOf(s.I, s.J, s.K, s.k);
      if (!lattice.periodic && !lattice.reaches(place, 4)) { g.atEdge = true; return false; }
      if (lattice.periodic && !options.plainSteps && jumps.jump(s, roomAt(place), random.uniform(p, j++)) > 0) { g.jumps++; continue; }
      walkStep(lattice, s, random.uniform(p, j++));
      g.steps++;
    }
    if (!lattice.periodic && !lattice.reaches(lattice.placeOf(s.I, s.J, s.K, s.k), 4)) { g.atEdge = true; return false; }
    cluster.add(s);
    return true;
  }

  return g;
}

// The lattice newInternalDLA's options say (js/sim-walk.js).
function latticeFor(options) {
  if (options.dim === 3) return honeycombLattice(options.block);
  return options.tiling ? tilingLattice(options.tiling) : gridLattice(options.dim);
}

// rho_n: the radius of the ball with n sites on the grids (see the top
// of this file).
function ballRadius(dim, n) {
  if (dim === 1) return (n - 1) / 2;
  if (dim === 2) return Math.sqrt(n / Math.PI);
  return Math.cbrt(3 * n / (4 * Math.PI));
}


/* =====================================================================
   2. THE GROWTH IN A SECOND THREAD
   ---------------------------------------------------------------------
   It talks to the page the way every sim's worker does (serveRun,
   js/sim-worker.js). Its own messages:
     setup  { dim, tiling, block, grid, seed, particles, cellsKnown }
         a new growth (newInternalDLA's options; "grid" says the lattice
         is Z, Z² or Z³, for the ball radius), grown at once to
         "particles" particles with the same seed (at least 1: the
         cluster starts as the origin alone). On a Penrose tiling
         it grows on this thread's plane of it (kept while the tiling
         stays the same), and the page already has its cells up to
         cellsKnown.
     goto   { steps }        grow to that many particles (or start
                             again and grow to that many, if fewer)
   It reports the numbers for the Statistics box, the samples for the
   charts, and the sites new since its last report, and on a Penrose
   tiling the plane's cells the page doesn't have yet. The run is done
   (and pauses by itself) at MOST_PARTICLES, or at the edge of a
   Penrose plane.
   ===================================================================== */
const MOST_PARTICLES = 1000000;

function growthWorker() {
  let options = null, growth = null, problem = "", trace = null;
  let sitesSent = 0, plane = null, cellsSent = 0;

  function setup(particles) {
    problem = "";
    sitesSent = 0;
    try {
      const finite = options.tiling && options.tiling.finite;
      if (finite) { plane = penrosePlane(plane, options.tiling); cellsSent = options.cellsKnown; }
      growth = newInternalDLA(finite ? Object.assign({}, options, { tiling: plane }) : options);
    } catch (error) {
      growth = null;
      problem = error.message;
      return;
    }
    trace = newTrace();
    while (growth.cluster.count < Math.max(1, particles) && !isDone()) oneParticle();
  }

  function isDone() { return growth === null || growth.cluster.count >= MOST_PARTICLES || growth.atEdge; }

  function oneParticle() {
    if (!growth.addParticle()) return;
    const c = growth.cluster, n = c.count;
    keepSample(trace, n, function () {
      const values = { inner: c.nearestEdge(), outer: c.farthest };
      if (options.grid) {
        const rho = ballRadius(options.dim, n);
        values.innerError = rho - values.inner;
        values.outerError = values.outer - rho;
      }
      return values;
    });
  }

  serveRun({
    setup: function (message) { options = message; setup(message.particles); },
    steps: oneParticle, isDone: isDone, report: report,
    messages: {
      goto: function (message) {
        if (growth && message.steps < growth.cluster.count) setup(message.steps);
        else while (!isDone() && growth.cluster.count < message.steps) oneParticle();
      },
    },
  });

  // The numbers, the charts' samples, and the sites new since the last
  // report (each one's block I, J, K and cell k; its number is its place
  // in the list).
  function report(send) {
    if (!growth) { send({ problem: problem }); return; }
    const c = growth.cluster, lists = trace.lists, n = c.count;
    const message = {
      problem: "", dim: options.dim, grid: options.grid,
      particles: n, steps: growth.steps, jumps: growth.jumps,
      inner: c.nearestEdge(), outer: c.farthest, rho: options.grid ? ballRadius(options.dim, n) : null,
      atMax: n >= MOST_PARTICLES, atEdge: growth.atEdge,
      traceParticles: Float64Array.from(trace.times),
      traceInner: Float64Array.from(lists.inner || []), traceOuter: Float64Array.from(lists.outer || []),
      traceInnerError: Float64Array.from(lists.innerError || []), traceOuterError: Float64Array.from(lists.outerError || []),
      sitesFrom: sitesSent,
      siteI: Int32Array.from(c.I.slice(sitesSent)), siteJ: Int32Array.from(c.J.slice(sitesSent)),
      siteK: Int32Array.from(c.K.slice(sitesSent)), sitePart: Int32Array.from(c.k.slice(sitesSent)),
      siteDistance: Float64Array.from(c.distance.slice(sitesSent)),
    };
    sitesSent = n;
    if (plane && options.tiling && options.tiling.finite && plane.cells.length > cellsSent) {
      message.planeCells = planeCellsFrom(plane, cellsSent);
      cellsSent = plane.cells.length;
    }
    send(message);
  }
}
