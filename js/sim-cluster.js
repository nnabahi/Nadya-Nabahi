/* =====================================================================
   sim-cluster.js  —  a cluster of sites growing on a lattice (the DLA
                      family)
   ---------------------------------------------------------------------
   A cluster is a set of sites of a lattice (js/sim-walk.js), each with
   the number it joined as (0, 1, 2, ...). Its EDGE is the empty sites
   next to it: every site not in it with a neighbor in it. A walker
   inside the cluster (Internal DLA) stops on the first empty site it
   reaches, which is always an edge site. So how far the nearest edge
   site is says how big a ball the walker may jump across (ballJumps,
   js/sim-walk.js).

   newCluster(lattice) returns the cluster:
     add(s)            put site s ({ I, J, K, k }) in; returns its number
     has(s)            is site s in it?
     count             how many sites are in it
     I, J, K, k        its sites, by number
     distance          each site's distance from the start (the middle of
                       cell 0 of block (0, 0, 0)), by number
     farthest          the largest of those
     nearestEdge()     how far the edge site nearest the start is
                       (Infinity while the cluster is empty)
   Distances are straight lines between cells' middles, in side lengths.

   nearestEdge keeps the edge sites in a heap by distance from the
   start (newHeap, js/sim-worker.js); a site that has joined the cluster
   since it was filed is thrown away when it comes to the top.
   ===================================================================== */

function newCluster(lattice) {
  const start = lattice.placeOf(0, 0, 0, 0);
  const numberOf = new Map();        // a member's key -> its number
  const edge = new Set();            // the edge sites' keys
  const nearHeap = newHeap();        // edge sites by distance from the start (item: an index into heapKeys)
  const heapKeys = [];

  const c = {
    count: 0, I: [], J: [], K: [], k: [], distance: [], farthest: 0,
    add: add, has: has, nearestEdge: nearestEdge,
  };

  function has(s) { return numberOf.has(lattice.keyOf(s.I, s.J, s.K, s.k)); }

  function add(s) {
    const key = lattice.keyOf(s.I, s.J, s.K, s.k), n = c.count;
    edge.delete(key);
    numberOf.set(key, n);
    c.I.push(s.I); c.J.push(s.J); c.K.push(s.K); c.k.push(s.k);
    const far = distanceBetween(lattice.placeOf(s.I, s.J, s.K, s.k), start);
    c.distance.push(far);
    c.farthest = Math.max(c.farthest, far);
    c.count++;
    // Its empty neighbors are edge sites now.
    for (const [k2, dI, dJ, dK] of lattice.movesOf(s.k)) {
      const I = s.I + dI, J = s.J + dJ, K = s.K + dK, key2 = lattice.keyOf(I, J, K, k2);
      if (numberOf.has(key2) || edge.has(key2)) continue;
      edge.add(key2);
      nearHeap.add(distanceBetween(lattice.placeOf(I, J, K, k2), start), heapKeys.length);
      heapKeys.push(key2);
    }
    return n;
  }

  function nearestEdge() {
    while (nearHeap.size() > 0 && !edge.has(heapKeys[nearHeap.firstItem()])) nearHeap.take();
    return nearHeap.size() > 0 ? nearHeap.firstKey() : Infinity;
  }

  return c;
}

// The functions to copy into a worker (runInWorker, js/sim-page.js).
function clusterHelpers() { return [newCluster]; }
