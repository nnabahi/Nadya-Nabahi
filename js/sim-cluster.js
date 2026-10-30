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
   filed in buckets BUCKET_MOVES longest moves wide (newPointBuckets,
   below), searched ring by ring around the place.

   Pieces the continuous DLA sims share with it:
     newPointBuckets(dims, width)   points filed in buckets, the cubes
                       (squares in 2D, intervals in 1D) of a grid
                       "width" wide, with the nearest ones to a place
                       found ring by ring
     newGyration(dims) the radius of gyration of points as they come
     newTileCluster(dims)   their cluster of tiles, and tileSample,
                       tilePieces and TILE_SAMPLES, for serveGrowth
   ===================================================================== */

const BUCKET_MOVES = 4;

function newCluster(lattice) {
  const start = lattice.placeOf(0, 0, 0, 0);
  const width = BUCKET_MOVES * (lattice.periodic ? lattice.longestMove : 1);
  const numberOf = new Map();        // a member's key -> its number
  const edge = new Map();            // an edge site's key -> its place
  const buckets = newPointBuckets(start.length, width);   // the edge sites, by their keys
  const nearHeap = newHeap();        // edge sites by distance from the start (item: an index into heapKeys)
  const heapKeys = [];
  const spread = newGyration(start.length);

  const c = {
    count: 0, I: [], J: [], K: [], k: [], distance: [], farthest: 0,
    add: add, has: has, onEdge: onEdge, gyration: spread.radius, nearestEdge: nearestEdge, roomAt: roomAt,
  };

  function has(s) { return numberOf.has(lattice.keyOf(s.I, s.J, s.K, s.k)); }
  function onEdge(s) { return edge.has(lattice.keyOf(s.I, s.J, s.K, s.k)); }

  function add(s) {
    const key = lattice.keyOf(s.I, s.J, s.K, s.k), n = c.count;
    if (edge.has(key)) {
      buckets.remove(key, edge.get(key));
      edge.delete(key);
    }
    numberOf.set(key, n);
    c.I.push(s.I); c.J.push(s.J); c.K.push(s.K); c.k.push(s.k);
    const at = lattice.placeOf(s.I, s.J, s.K, s.k), far = distanceBetween(at, start);
    spread.add(at);
    c.distance.push(far);
    c.farthest = Math.max(c.farthest, far);
    c.count++;
    // Its empty neighbors are edge sites now.
    for (const [k2, dI, dJ, dK] of lattice.movesOf(s.k)) {
      const I = s.I + dI, J = s.J + dJ, K = s.K + dK, key2 = lattice.keyOf(I, J, K, k2);
      if (numberOf.has(key2) || edge.has(key2)) continue;
      const place = lattice.placeOf(I, J, K, k2);
      edge.set(key2, place);
      buckets.add(key2, place);
      nearHeap.add(distanceBetween(place, start), heapKeys.length);
      heapKeys.push(key2);
    }
    return n;
  }

  function nearestEdge() {
    while (nearHeap.size() > 0 && !edge.has(heapKeys[nearHeap.firstItem()])) nearHeap.take();
    return nearHeap.size() > 0 ? nearHeap.firstKey() : Infinity;
  }

  function roomAt(place, cap) {
    return buckets.nearest(place, cap, 0, function (key, p) { return distanceBetween(place, p); });
  }

  return c;
}

// Points filed in buckets, the cubes (squares in 2D, intervals in 1D)
// of a grid "width" wide, so the ones near a place are found quickly.
// Each point has a name (any number or text) and a place. It gives
//   add(name, place), remove(name, place)
//   nearest(place, cap, slack, distanceOf)   the smallest
//       distanceOf(name, point's place, best so far) over the points,
//       when that is below cap (otherwise a number at least cap), where
//       distanceOf is never below the straight-line distance from the
//       place minus "slack" (so a point standing for a shape of radius
//       slack can be measured to its shape). The search looks at the
//       bucket around the place, then the ring of buckets around that,
//       and so on. After ring m, every point not looked at yet is at
//       least m widths away, so it stops as soon as m widths minus
//       slack is more than the smallest found so far, or more than cap.
//   roughDistance(place, cap)   a quick lower bound on the distance from
//       the place to the nearest point: to the nearest bucket with a
//       point in it, looking out ring by ring the same way (at least cap
//       if none is nearer than cap)
//   within(place, radius, visit)   visit(name, point's place) for every
//       point within radius of the place (and some a little farther):
//       the rings of buckets out to m, with m widths at least radius
function newPointBuckets(dims, width) {
  const buckets = new Map();   // a bucket's key -> its points (a Map from their names to their places)

  // The bucket of a place, as one whole number (each of up to 3
  // coordinates in 16 bits), from the bucket coordinates of the place
  // ("at", a list of whole numbers).
  function bucketKey(at) {
    let key = 0;
    for (let d = 0; d < 3; d++) key = key * 65536 + ((d < at.length ? at[d] : 0) + 32768);
    return key;
  }
  function bucketAt(place) { return place.map(function (x) { return Math.floor(x / width); }); }

  function add(name, place) {
    const b = bucketKey(bucketAt(place));
    if (!buckets.has(b)) buckets.set(b, new Map());
    buckets.get(b).set(name, place);
  }
  function remove(name, place) {
    const inside = buckets.get(bucketKey(bucketAt(place)));
    if (inside) inside.delete(name);
  }

  function nearest(place, cap, slack, distanceOf) {
    const center = bucketAt(place), at = center.slice();
    let best = Infinity;
    for (let m = 0; ; m++) {
      // Every bucket in ring m: some coordinate exactly m away, none more.
      forEachInRing(dims, m, function (offset) {
        for (let d = 0; d < dims; d++) at[d] = center[d] + offset[d];
        const inside = buckets.get(bucketKey(at));
        if (inside) for (const [name, p] of inside) best = Math.min(best, distanceOf(name, p, best));
      });
      const unseen = m * width - slack;     // every point in rings beyond m gives at least this
      if (best <= unseen || unseen >= cap) return Math.min(best, unseen);
    }
  }

  function roughDistance(place, cap) {
    const center = bucketAt(place), at = center.slice();
    let best = Infinity;
    for (let m = 0; ; m++) {
      forEachInRing(dims, m, function (offset) {
        for (let d = 0; d < dims; d++) at[d] = center[d] + offset[d];
        const inside = buckets.get(bucketKey(at));
        if (!inside || inside.size === 0) return;
        let squared = 0;   // to the bucket's box
        for (let d = 0; d < dims; d++) {
          const low = at[d] * width, out = Math.max(low - place[d], 0, place[d] - low - width);
          squared += out * out;
        }
        best = Math.min(best, Math.sqrt(squared));
      });
      const unseen = m * width;
      if (best <= unseen || unseen >= cap) return Math.min(best, unseen);
    }
  }

  function within(place, radius, visit) {
    const center = bucketAt(place), at = center.slice();
    for (let m = 0; ; m++) {
      forEachInRing(dims, m, function (offset) {
        for (let d = 0; d < dims; d++) at[d] = center[d] + offset[d];
        const inside = buckets.get(bucketKey(at));
        if (inside) for (const [name, p] of inside) visit(name, p);
      });
      if (m * width >= radius) return;
    }
  }

  return { add: add, remove: remove, nearest: nearest, roughDistance: roughDistance, within: within };
}

// The radius of gyration of points as they come: the root mean square
// distance from their mean. The mean squared distance from the mean is
// the mean squared length minus the mean's squared length.
// add(place) counts one more point; radius() is the radius now.
function newGyration(dims) {
  const sum = new Array(dims).fill(0);   // the sum of the places, and of their squared lengths
  let squares = 0, count = 0;
  function add(place) {
    for (let d = 0; d < dims; d++) { sum[d] += place[d]; squares += place[d] * place[d]; }
    count++;
  }
  function radius() {
    let meanSquared = 0;
    for (const x of sum) meanSquared += (x / count) * (x / count);
    return Math.sqrt(Math.max(0, squares / count - meanSquared));
  }
  return { add: add, radius: radius };
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
     how.pieces(growth, from)      (optional) the cluster's pieces from
                          number "from" on, for a report; left out, they
                          are the lattice sites below (latticePieces)
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
     sitesFrom            the number of the first piece new since the
                          last report, and the new pieces: on a lattice,
     siteI, siteJ, siteK, sitePart, siteDistance
                          the sites (block, cell and distance from the
                          start)
     planeCells           on a Penrose tiling, the plane's cells the
                          page doesn't have yet (planeCellsFrom,
                          js/sim-penrose.js)
   The run is done (and pauses by itself) at how.most, or at the edge of
   a Penrose plane.
   ===================================================================== */
function serveGrowth(how) {
  const pieces = how.pieces || latticePieces;
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
    const n = growth.cluster.count, traceLists = {};
    for (const name of how.names) traceLists[name] = Float64Array.from(trace.lists[name] || []);
    const message = Object.assign(how.numbers(growth, options), pieces(growth, sitesSent), {
      problem: "", dim: options.dim, particles: n, atMax: n >= how.most, atEdge: growth.atEdge,
      traceParticles: Float64Array.from(trace.times), traceLists: traceLists, sitesFrom: sitesSent,
    });
    sitesSent = n;
    if (plane && options.tiling && options.tiling.finite && plane.cells.length > cellsSent) {
      message.planeCells = planeCellsFrom(plane, cellsSent);
      cellsSent = plane.cells.length;
    }
    send(message);
  }
}

// A cluster of tiles (the continuous DLA sims): their centers, in the
// order they joined.
//   add(place)      one more tile, centered at the place ([x, y], or
//                   [x, y, z] in space)
//   count, x, y, z  how many, and their centers' coordinates (z in space)
//   farthest        how far the farthest center is from the origin
//   gyration()      the centers' radius of gyration (newGyration)
function newTileCluster(dims) {
  const spread = newGyration(dims);
  const c = { count: 0, x: [], y: [], z: [], farthest: 0, gyration: spread.radius, add: add };
  function add(place) {
    spread.add(place);
    c.x.push(place[0]); c.y.push(place[1]);
    if (dims === 3) c.z.push(place[2]);
    c.farthest = Math.max(c.farthest, Math.hypot(...place));
    c.count++;
  }
  return c;
}

// For serveGrowth, a cluster of tiles': its samples for the charts (the
// farthest center, and the radius of gyration), and its tiles from
// number "from" on (their centers, x, y and z).
const TILE_SAMPLES = ["radius", "gyration"];
function tileSample(growth) { return { radius: growth.cluster.farthest, gyration: growth.cluster.gyration() }; }
function tilePieces(growth, from) {
  const c = growth.cluster;
  return { x: Float64Array.from(c.x.slice(from)), y: Float64Array.from(c.y.slice(from)), z: Float64Array.from(c.z.slice(from)) };
}

// A lattice cluster's sites from number "from" on: their blocks, cells
// and distances from the start.
function latticePieces(growth, from) {
  const c = growth.cluster;
  return {
    siteI: Int32Array.from(c.I.slice(from)), siteJ: Int32Array.from(c.J.slice(from)),
    siteK: Int32Array.from(c.K.slice(from)), sitePart: Int32Array.from(c.k.slice(from)),
    siteDistance: Float64Array.from(c.distance.slice(from)),
  };
}

// The functions to copy into a worker (runInWorker, js/sim-page.js).
function clusterHelpers() {
  return [newCluster, newPointBuckets, newGyration, forEachInRing, serveGrowth, latticePieces, newTileCluster, tileSample,
          tilePieces, { BUCKET_MOVES: BUCKET_MOVES, TILE_SAMPLES: TILE_SAMPLES }];
}
