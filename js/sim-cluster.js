/* =====================================================================
   sim-cluster.js  —  a cluster of sites growing on a lattice (the DLA
                      family)
   ---------------------------------------------------------------------
   A cluster is a set of sites of a lattice (js/sim-walk.js), each with
   the number it joined as (0, 1, 2, ...). Its EDGE is the empty sites
   next to it: every site not in it with a neighbor in it. A walker
   inside the cluster (Internal DLA) stops on the first empty site it
   reaches, which is always an edge site; a walker outside it (External
   DLA) stops on the first edge site it reaches. So both ask the same
   question: how far is the nearest edge site? That says how big a ball
   the walker may jump across (ballJumps, js/sim-walk.js).

   newCluster(lattice) returns the cluster:
     add(s)            put site s ({ I, J, K, k }) in; returns its number
     has(s)            is site s in it?
     onEdge(s)         is site s an edge site?
     count             how many sites are in it
     I, J, K, k        its sites, by number
     distance          each site's distance from the start (the middle of
                       cell 0 of block (0, 0, 0)), by number
     farthest          the largest of those
     gyration()        its radius of gyration: the root mean square
                       distance of its sites from their mean
     nearestEdge()     how far the edge site nearest the start is
                       (Infinity while the cluster is empty)
     roomAt(place, cap)   a lower bound on the distance from the place
                       to the nearest edge site: that distance itself
                       when it is below cap, and at least cap otherwise
   Distances are straight lines between cells' middles, in side lengths.
   serveGrowth(how) (the end of this file) runs a sim that grows a
   cluster in its second thread.

   nearestEdge keeps the edge sites in a heap by distance from the
   start (newHeap, js/sim-worker.js); a site that has joined the cluster
   since it was filed is thrown away when it comes to the top.

   How roomAt finds the nearest edge site quickly: the edge sites are
   filed in "buckets", the cubes (squares in 2D, intervals in 1D) of a
   grid BUCKET_MOVES longest moves wide. The search looks at the bucket
   around the place, then the ring of buckets around that, and so on.
   After ring m, every edge site not looked at yet is at least m bucket
   widths away, so it stops as soon as that is more than the nearest
   found so far, or more than cap.
   ===================================================================== */

const BUCKET_MOVES = 4;

function newCluster(lattice) {
  const start = lattice.placeOf(0, 0, 0, 0);
  const width = BUCKET_MOVES * (lattice.periodic ? lattice.longestMove : 1);
  const numberOf = new Map();        // a member's key -> its number
  const edge = new Map();            // an edge site's key -> its place
  const buckets = new Map();         // a bucket's key -> the places of the edge sites in it (a Map from their keys)
  const nearHeap = newHeap();        // edge sites by distance from the start (item: an index into heapKeys)
  const heapKeys = [];

  const sum = start.map(function () { return 0; });   // the sum of the sites' places, and of their squared lengths
  let squares = 0;

  const c = {
    count: 0, I: [], J: [], K: [], k: [], distance: [], farthest: 0,
    add: add, has: has, onEdge: onEdge, gyration: gyration, nearestEdge: nearestEdge, roomAt: roomAt,
  };

  function has(s) { return numberOf.has(lattice.keyOf(s.I, s.J, s.K, s.k)); }
  function onEdge(s) { return edge.has(lattice.keyOf(s.I, s.J, s.K, s.k)); }

  // The bucket of a place, as one whole number (each of up to 3
  // coordinates in 16 bits), from the bucket coordinates of the place
  // ("at", a list of whole numbers).
  function bucketKey(at) {
    let key = 0;
    for (let d = 0; d < 3; d++) key = key * 65536 + ((d < at.length ? at[d] : 0) + 32768);
    return key;
  }
  function bucketAt(place) { return place.map(function (x) { return Math.floor(x / width); }); }

  function add(s) {
    const key = lattice.keyOf(s.I, s.J, s.K, s.k), n = c.count;
    if (edge.has(key)) {
      buckets.get(bucketKey(bucketAt(edge.get(key)))).delete(key);
      edge.delete(key);
    }
    numberOf.set(key, n);
    c.I.push(s.I); c.J.push(s.J); c.K.push(s.K); c.k.push(s.k);
    const at = lattice.placeOf(s.I, s.J, s.K, s.k), far = distanceBetween(at, start);
    for (let d = 0; d < sum.length; d++) { sum[d] += at[d]; squares += at[d] * at[d]; }
    c.distance.push(far);
    c.farthest = Math.max(c.farthest, far);
    c.count++;
    // Its empty neighbors are edge sites now.
    for (const [k2, dI, dJ, dK] of lattice.movesOf(s.k)) {
      const I = s.I + dI, J = s.J + dJ, K = s.K + dK, key2 = lattice.keyOf(I, J, K, k2);
      if (numberOf.has(key2) || edge.has(key2)) continue;
      const place = lattice.placeOf(I, J, K, k2), b = bucketKey(bucketAt(place));
      edge.set(key2, place);
      if (!buckets.has(b)) buckets.set(b, new Map());
      buckets.get(b).set(key2, place);
      nearHeap.add(distanceBetween(place, start), heapKeys.length);
      heapKeys.push(key2);
    }
    return n;
  }

  // The mean squared distance from the mean is the mean squared length
  // minus the mean's squared length.
  function gyration() {
    let meanSquared = 0;
    for (const x of sum) meanSquared += (x / c.count) * (x / c.count);
    return Math.sqrt(Math.max(0, squares / c.count - meanSquared));
  }

  function nearestEdge() {
    while (nearHeap.size() > 0 && !edge.has(heapKeys[nearHeap.firstItem()])) nearHeap.take();
    return nearHeap.size() > 0 ? nearHeap.firstKey() : Infinity;
  }

  function roomAt(place, cap) {
    const center = bucketAt(place), at = center.slice();
    let best = Infinity;
    for (let m = 0; ; m++) {
      // Every bucket in ring m: some coordinate exactly m away, none more.
      forEachInRing(center.length, m, function (offset) {
        for (let d = 0; d < at.length; d++) at[d] = center[d] + offset[d];
        const inside = buckets.get(bucketKey(at));
        if (inside) for (const p of inside.values()) best = Math.min(best, distanceBetween(place, p));
      });
      const unseen = m * width;     // every edge site in rings beyond m is at least this far
      if (best <= unseen || unseen >= cap) return Math.min(best, unseen);
    }
  }

  return c;
}

// Call visit(offset) for every offset (a list of dims whole numbers)
// whose largest entry, in absolute value, is exactly m.
function forEachInRing(dims, m, visit) {
  const offset = new Array(dims).fill(-m);
  for (;;) {
    if (offset.some(function (v) { return Math.abs(v) === m; })) visit(offset);
    let d = 0;
    while (d < dims && offset[d] === m) { offset[d] = -m; d++; }
    if (d === dims) return;
    offset[d]++;
  }
}


/* =====================================================================
   THE SECOND THREAD OF A SIM THAT GROWS A CLUSTER
   ---------------------------------------------------------------------
   serveGrowth(how) is the whole second thread of such a sim (each DLA
   sim's growthWorker). It talks to the page the way every sim's worker
   does (serveRun, js/sim-worker.js). "how" says what is the sim's own:
     how.make(options)    a new growth from the page's options: it has
                          lattice, cluster, addParticle() (false at the
                          edge of a Penrose plane) and atEdge
     how.most             the most particles it lets in
     how.sample(growth, options)   the numbers kept for the charts
                          after a particle joins (keepSample, by name)
     how.names            their names
     how.numbers(growth, options)  the sim's own numbers for a report
   The page's messages:
     setup  { ...options, particles, cellsKnown }
         a new growth (how.make's options, with "tiling" a Penrose
         tiling or not, "dim" and "seed"), grown at once to "particles"
         particles (at least 1). On a Penrose tiling it grows on this
         thread's plane of it (kept while the tiling stays the same), and
         the page already has the plane's cells up to cellsKnown.
     goto   { steps }     grow to that many particles (or start again and
                          grow to that many, if fewer)
   Each report has the sim's numbers and
     problem              what went wrong making the growth ("" if nothing)
     dim, particles       the dimension, and the cells in the cluster
     atMax, atEdge        it stopped at how.most, or at a Penrose plane's edge
     traceParticles       the particles at each sample, and traceLists,
                          each sample's numbers, by name
     sitesFrom, siteI, siteJ, siteK, sitePart, siteDistance
                          the sites new since the last report (block,
                          cell and distance from the start; site number
                          sitesFrom first)
     planeCells           on a Penrose tiling, the plane's cells the
                          page doesn't have yet (planeCellsFrom,
                          js/sim-penrose.js)
   The run is done (and pauses by itself) at how.most, or at the edge of
   a Penrose plane.
   ===================================================================== */
function serveGrowth(how) {
  let options = null, growth = null, problem = "", trace = null;
  let sitesSent = 0, plane = null, cellsSent = 0;

  function setup(particles) {
    problem = "";
    sitesSent = 0;
    try {
      const finite = options.tiling && options.tiling.finite;
      if (finite) { plane = penrosePlane(plane, options.tiling); cellsSent = options.cellsKnown; }
      growth = how.make(finite ? Object.assign({}, options, { tiling: plane }) : options);
    } catch (error) {
      growth = null;
      problem = error.message;
      return;
    }
    trace = newTrace();
    while (growth.cluster.count < Math.max(1, particles) && !isDone()) oneParticle();
  }

  function isDone() { return growth === null || growth.cluster.count >= how.most || growth.atEdge; }

  function oneParticle() {
    if (!growth.addParticle()) return;
    keepSample(trace, growth.cluster.count, function () { return how.sample(growth, options); });
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

  function report(send) {
    if (!growth) { send({ problem: problem }); return; }
    const c = growth.cluster, n = c.count, traceLists = {};
    for (const name of how.names) traceLists[name] = Float64Array.from(trace.lists[name] || []);
    const message = Object.assign(how.numbers(growth, options), {
      problem: "", dim: options.dim, particles: n, atMax: n >= how.most, atEdge: growth.atEdge,
      traceParticles: Float64Array.from(trace.times), traceLists: traceLists,
      sitesFrom: sitesSent,
      siteI: Int32Array.from(c.I.slice(sitesSent)), siteJ: Int32Array.from(c.J.slice(sitesSent)),
      siteK: Int32Array.from(c.K.slice(sitesSent)), sitePart: Int32Array.from(c.k.slice(sitesSent)),
      siteDistance: Float64Array.from(c.distance.slice(sitesSent)),
    });
    sitesSent = n;
    if (plane && options.tiling && options.tiling.finite && plane.cells.length > cellsSent) {
      message.planeCells = planeCellsFrom(plane, cellsSent);
      cellsSent = plane.cells.length;
    }
    send(message);
  }
}

// The functions to copy into a worker (runInWorker, js/sim-page.js).
function clusterHelpers() { return [newCluster, forEachInRing, serveGrowth, { BUCKET_MOVES: BUCKET_MOVES }]; }
