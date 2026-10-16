/* =====================================================================
   eden-growth-rule.js  —  the growth rule behind the "Eden
   Growth" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Blocks are dropped one at a time. The "base" is the set of sites
     that have at least one block. A "tile" T is a list of offsets (in
     1D numbers like -1 and +1, in 2D pairs like (1, 0)). The sites a
     block may land on, the "available" sites, are the start site and
     every site that is (a base site) + (an offset in T).

     Start: one block on the start site (usually 0), so the base is
     {start} and the available sites are {start} together with start + T.

     Each step:
       1. pick an available site uniformly at random;
       2. drop a block there (its height goes up by 1);
       3. if the site had no block before, it joins the base, and the
          sites (site + t), for every t in T, become available too.

     The uniform pick in step 1 is the only random thing.

   The capacity (optional). With a capacity M, a site that reaches
   M blocks is full: it stops being available, so no block lands on it
   again. With M = 1 every block lands on a new site, so the base grows
   by one site each step: that is Eden's growth model. With no max (the
   default) nothing changes. On a bounded domain the run stops once
   every site is full.

   The weight s (optional). Step 1 can favor tall or short sites: an
   available site with h blocks is picked with weight (h + 1)^s, the
   number of blocks it will have once this one lands, raised to the
   power s. With s = 0 (the default) every weight is 1, so the pick is
   uniform, as above. With s > 0 tall sites are picked more often, with
   s < 0 less often. An empty site always has weight 1, so with max
   height M = 1 (every available site empty) s changes nothing.

   nadya's models are this rule with a particular tile:
     T = {-1, +1}       the two-sided mountain (randmountain.py,
                        RandBlockStack.py): the block lands on the base
                        or one site past either end
     T = {+1}           the one-sided mountain (randonesidedmountain.py)
     T = the 4 neighbors   the 2D mountain (claudeakadeleteme.py)

   The domain. By default the mountain lives on the whole line (1D) or
   the whole plane (2D) and can grow forever. It can also be kept inside
   a box (a segment in 1D), a torus (a cycle in 1D) or a set of cells
   drawn in the graph tool. Sites outside the domain never become
   available; on a torus, offsets wrap around.

   Two ways to make the random picks, with exactly the same odds:

   With clocks (the sim page). Every site has an alarm clock for each
   height h: a random time E(x, h) with the exponential distribution of
   mean 1, made from the seed, the site's place and h only (newClocks
   below). When site x becomes available, or gets its h-th block, its
   next block is set to land E(x, h) / (h + 1)^s later; the alarm that
   rings first gets the next block. Exponential alarms racing each other
   ring first with chance (their rate) / (all the rates together), and
   they forget how long they have waited, so the next site is picked
   with weight (h + 1)^s, as in step 1 (the jump chain of a
   continuous-time Markov chain: J. R. Norris, Markov Chains, Cambridge
   1997, Theorem 2.3.3 and section 2.6). The point: E(x, h) doesn't
   depend on s, the capacity or the tile, so moving them with the
   same seed changes the mountain smoothly, the way the p slider moves
   Bernoulli percolation. With M = 1 this is Richardson's model, first
   passage percolation (D. Richardson, Proc. Cambridge Philos. Soc. 74
   (1973) 515-528).

   With a list of uniform numbers (the check page, to match nadya's
   Python). Step 1 turns a uniform number u in [0, 1) into the site
   number floor(u * |S|), where |S| is the number of available sites,
   exactly as randmountain.py does. In 1D the sites are counted from
   left to right, as in nadya's Python, so the same list of u's gives
   exactly her mountain. In 2D they are counted in the order they
   became available. Either way every site is equally likely.

   ON ANY GRAPH ("Graph" on the page). The same rule on a graph whose
   cells are made as they are needed (js/sim-graphs.js): a hyperbolic
   tiling {p,q} or a regular tree. A graph has no offsets, so the tile
   is "every cell within distance r of the site" (the ball of radius r,
   not counting the site). On the line, r = 1 is the tile {-1, +1}; on
   the square grid it is the 4 neighbors. The 1D and 2D mountains keep
   their own code (part 1), untouched; newGraphMountain (part 1b) is
   separate, and the check page shows that on the line and the square
   grid it gives exactly the same mountain as 1D and 2D, block for
   block, from the same random numbers. (On the line, its sites are
   counted from left to right too; on other graphs, in the order they
   became available.)

   The file has these parts, with no drawing and no buttons:
     1. newMountain(options): the growth rule itself. The check page
        (eden-growth-check.html) tests it in the browser.
     1b. newGraphMountain(options): the same rule on any graph.
     1c. the holes of a 2D mountain's base (holeHistory, js/sim-shape.js), with the
        step each one was born and the step it died.
     1d. convexity(m): the base's area over the area of its convex hull.
     2. mountainWorker(): runs a mountain in a second thread (a "Web
        Worker") for the sim page, eden-growth.js, so the page never
        freezes. startWorker (js/sim-page.js) starts it, with
        newMountain, newGraphMountain, the hyperbolic tilings and trees,
        the run loop, trace and random numbers (js/sim-worker.js) and the
        hull and holes (js/sim-shape.js) copied in.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH RULE
   ===================================================================== */


// Make a new mountain. "options" has:
//   dim     1 or 2
//   tile    the offsets: [[dx], ...] in 1D, [[dx, dy], ...] in 2D
//   domain  one of
//             { kind: "whole" }
//             { kind: "box", xmin, xmax, ymin, ymax, torus }   (1D: ymin = ymax = 0)
//             { kind: "cells", cells: [[x, y], ...], wrap }    (wrap: the torus's
//                 { xmin, xmax, ymin, ymax }, or null; a region drawn in the graph tool)
//   start   the start site, [x] in 1D or [x, y] in 2D
//   cap     M, the capacity: the most blocks a site can hold
//           (leave it out for no max)
//   s       the weight s (leave it out for 0: uniform)
//   clocks  a seed: pick with clocks (see the top of this file). Leave
//           it out to pick with the u's handed to step(u).
//   shapeBins  (2D, not on a torus) keep track of the base's shape, for
//           part 1d: m.radii[k] is the farthest distance from the start
//           (straight-line, middle to middle) of a base site whose
//           direction from the start is in slice k of shapeBins equal
//           slices of the circle (slice 0 starts at angle -180 degrees,
//           to the left), 0 if none yet; m.columns has, for each x,
//           the lowest and highest y of the base there.
// It returns an object whose step(u) drops one block, and whose fields
// say how the mountain looks (see the end of this function).
function newMountain(options) {
  const dim = options.dim;
  const domain = options.domain;
  const cap = options.cap || Infinity;     // the capacity M (see the top of this file)
  const power = options.s || 0;             // the weight s (see the top of this file)
  const clocks = options.clocks === undefined ? null : newClocks(options.clocks, power);
  const bins = options.shapeBins || 0;

  // Every site gets a number, 0, 1, 2, ..., in the order it becomes
  // available. For site number i:
  const siteX = [];        // its coordinates
  const siteY = [];
  const height = [];       // how many blocks are on it (0 = not in the base yet)
  const bornAt = [];       // the step its first block landed (0 for the start)
  const numberOf = new Map();   // a site's key (below) -> its number

  // The available sites, as a list of site numbers. In 1D the list is
  // kept sorted from left to right (see the top of this file).
  const available = [];

  // The tile, always as pairs (in 1D the second number is 0). An offset
  // (0, 0) changes nothing, so it is left out.
  const tile = [];
  for (const t of options.tile) {
    const dx = t[0], dy = dim === 2 ? t[1] : 0;
    if (dx !== 0 || dy !== 0) tile.push([dx, dy]);
  }

  // For a drawn domain: the keys of its cells, to look them up quickly.
  const drawnCells = new Set();
  if (domain.kind === "cells") {
    for (const c of domain.cells) drawnCells.add(keyOf(c[0], dim === 2 ? c[1] : 0));
  }

  // The torus (or cycle) that coordinates wrap around, or null.
  let wrapRange = null;
  if (domain.kind === "box" && domain.torus) wrapRange = domain;
  if (domain.kind === "cells" && domain.wrap) wrapRange = domain.wrap;

  // One number per site, for the Map above. Coordinates up to about a
  // million either way fit without two sites sharing a key.
  function keyOf(x, y) {
    return (x + 1048576) * 2097152 + (y + 1048576);
  }

  // Wrap a number into lo..hi, for tori. E.g. lo = 0, hi = 9: 10 -> 0, -1 -> 9.
  // (As wrap in js/sim-domains.js, which the second thread can't see.)
  function wrap(v, lo, hi) {
    const n = hi - lo + 1;
    return lo + (((v - lo) % n) + n) % n;
  }

  // Is (x, y) in the domain? (x, y) has already been wrapped on a torus.
  function inDomain(x, y) {
    if (domain.kind === "whole") return true;
    if (domain.kind === "box") {
      return x >= domain.xmin && x <= domain.xmax && y >= domain.ymin && y <= domain.ymax;
    }
    return drawnCells.has(keyOf(x, y));
  }

  // Make the site (x, y) available, unless it is outside the domain or
  // already available. Returns its number, or -1 if outside the domain.
  function makeAvailable(x, y) {
    if (wrapRange) {
      x = wrap(x, wrapRange.xmin, wrapRange.xmax);
      if (dim === 2) y = wrap(y, wrapRange.ymin, wrapRange.ymax);
    }
    if (!inDomain(x, y)) return -1;
    const key = keyOf(x, y);
    if (numberOf.has(key)) return numberOf.get(key);

    const i = siteX.length;
    siteX.push(x);
    siteY.push(y);
    height.push(0);
    numberOf.set(key, i);
    if (clocks) clocks.set(i, x, y, 0, m.time);

    if (dim === 2) {
      available.push(i);
    } else {
      // 1D: insert it where it belongs from left to right. Binary
      // search: the first place whose site lies to the right of x.
      let lo = 0, hi = available.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (siteX[available[mid]] < x) lo = mid + 1; else hi = mid;
      }
      available.splice(lo, 0, i);
    }
    return i;
  }

  // The mountain's numbers, kept up to date by step() below.
  const m = {
    dim: dim,
    siteX: siteX, siteY: siteY, height: height, available: available, bornAt: bornAt,
    radii: bins ? new Float64Array(bins) : null, columns: bins ? new Map() : null,
    steps: 0,          // n, the number of steps so far
    time: 0,           // with clocks: when the last block landed
    blocks: 0,         // blocks dropped, including the first one (= n + 1)
    baseSize: 0,       // |D|, the number of sites with a block
    full: 0,           // sites with M blocks (with a capacity)
    maxHeight: 0,
    start: -1,         // the start site's number
    step: step,
    dropOn: dropOn,
    heightAt: heightAt,
  };

  // One step: drop a block on a random available site. "u" is a uniform
  // random number in [0, 1) (not used with clocks).
  function step(u) {
    dropOn(clocks ? clocks.next(m) : pickSite(available, height, power, u));
  }

  // One step with the site chosen, not random (a click on the page):
  // the block goes on available site i.
  function dropOn(i) {
    drop(i);
    m.steps += 1;
  }

  // Put a block on site i, and if it is new to the base, make its
  // tile neighbors available.
  function drop(i) {
    height[i] += 1;
    m.blocks += 1;
    if (height[i] > m.maxHeight) m.maxHeight = height[i];
    if (height[i] >= cap) {   // full: no longer available
      available.splice(available.indexOf(i), 1);
      m.full += 1;
    }
    if (clocks) clocks.set(i, siteX[i], siteY[i], height[i] < cap ? height[i] : -1, m.time);
    if (height[i] === 1) {
      bornAt[i] = m.blocks - 1;   // the start's block is block 1, step n's is block n + 1
      m.baseSize += 1;
      if (bins) addToShape(siteX[i], siteY[i]);
      for (const t of tile) makeAvailable(siteX[i] + t[0], siteY[i] + t[1]);
    }
  }

  // A new base site (x, y): its slice's radius and its column (see shapeBins).
  function addToShape(x, y) {
    const dx = x - siteX[m.start], dy = y - siteY[m.start];
    if (dx !== 0 || dy !== 0) {
      const k = Math.min(bins - 1, Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * bins));
      m.radii[k] = Math.max(m.radii[k], Math.sqrt(dx * dx + dy * dy));
    }
    const column = m.columns.get(x);
    if (!column) m.columns.set(x, [y, y]);
    else { column[0] = Math.min(column[0], y); column[1] = Math.max(column[1], y); }
  }

  // The height at (x, y) (in 1D, y = 0), or 0 if there is no site there.
  function heightAt(x, y) {
    const i = numberOf.get(keyOf(x, y || 0));
    return i === undefined ? 0 : height[i];
  }

  // The start: one block on the start site.
  const s = options.start;
  m.start = makeAvailable(s[0], dim === 2 ? s[1] : 0);
  if (m.start < 0) throw new Error("The start site is outside the domain.");
  drop(m.start);

  return m;
}


// Step 1: turn a uniform number u in [0, 1) into one of the available
// sites (a list of site numbers; height[i] = site i's blocks). With
// s = 0 it is site number floor(u * |S|), exactly as randmountain.py
// does. Otherwise site i has weight (height[i] + 1)^s: lay the weights
// end to end, and take the site whose stretch u * (their total) lands in.
function pickSite(available, height, s, u) {
  if (s === 0) return available[Math.floor(u * available.length)];
  let total = 0;
  for (const i of available) total += Math.pow(height[i] + 1, s);
  let left = u * total;
  for (const i of available) {
    left -= Math.pow(height[i] + 1, s);
    if (left < 0) return i;
  }
  return available[available.length - 1];   // only if rounding left a tiny bit over
}


// The clocks (see the top of this file), for a seed and the weight s.
//   set(i, a, b, h, now)  site i (whose place is the two whole numbers
//                         a, b, the same from run to run) has h blocks at
//                         time "now": its next block lands at
//                         now + E(a, b, h) / (h + 1)^s.
//                         h = -1: site i is full, no next block.
//   next(m)               the site whose block lands next; sets m.time
//                         to when.
//   textToNumbers(text)   two whole numbers for a place given as text
//                         (for the cells of a graph)
// The times wait in a "heap", lists kept so the soonest is always
// first. A site set again (a click put a block on it early) leaves its
// old time in the heap; next() skips times that are out of date.
function newClocks(seed, s) {
  const due = [];      // due[i] = when site i's next block lands
  const times = [], sites = [];   // the heap: times[k] is never later than times[2k+1], times[2k+2]

  // E(a, b, h): exponential with mean 1, -log(U) for U uniform in (0, 1),
  // always the same for the same seed, place and height (seededUniform,
  // js/sim-worker.js).
  const random = seededUniform(seed);
  function exponential(a, b, h) {
    return -Math.log(random.uniform(a, b, h));
  }

  function set(i, a, b, h, now) {
    if (h < 0) { due[i] = Infinity; return; }
    const time = now + exponential(a, b, h) / Math.pow(h + 1, s);
    due[i] = time;
    // Add it at the end, and move it up while it is sooner than its parent.
    let k = times.length;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (times[up] <= time) break;
      times[k] = times[up]; sites[k] = sites[up]; k = up;
    }
    times[k] = time; sites[k] = i;
  }

  function next(m) {
    for (;;) {
      const time = times[0], i = sites[0];
      // Take the first out: put the last one in front, then move it
      // down while a child is sooner.
      const lastTime = times.pop(), lastSite = sites.pop();
      const n = times.length;
      if (n > 0) {
        let k = 0;
        for (;;) {
          const a = 2 * k + 1, b = a + 1;
          let soonest = -1, soonestTime = lastTime;
          if (a < n && times[a] < soonestTime) { soonest = a; soonestTime = times[a]; }
          if (b < n && times[b] < soonestTime) { soonest = b; soonestTime = times[b]; }
          if (soonest < 0) break;
          times[k] = times[soonest]; sites[k] = sites[soonest]; k = soonest;
        }
        times[k] = lastTime; sites[k] = lastSite;
      }
      if (due[i] === time) {   // not out of date
        m.time = time;
        return i;
      }
    }
  }

  return { set: set, next: next, textToNumbers: random.textToNumbers };
}


/* =====================================================================
   1b. THE GROWTH RULE ON ANY GRAPH
   ---------------------------------------------------------------------
   The same rule as part 1, on a graph from makeGraph (js/sim-graphs.js),
   whose cells are numbered 0, 1, 2, ... as they are made.
   ===================================================================== */

// Make a new mountain on a graph. "options" has:
//   graph    what makeGraph wants, e.g. { kind: "tiling", p: 7, q: 3 },
//            or a graph makeGraph already made (many runs can share one:
//            how cells are numbered doesn't change the mountain)
//   radius   r: a block landing on a new site makes every cell within
//            distance r of it available
//   domain   { kind: "whole" } (it can grow forever), or
//            { kind: "ball", layers: R } (only the cells within
//            distance R of the start)
//   cap     M, the capacity: the most blocks a site can hold
//           (leave it out for no max)
//   s       the weight s (leave it out for 0: uniform)
//   clocks  a seed: pick with clocks, as in newMountain
// The start is cell 0 of the graph. It returns the same kind of object
// as newMountain, with siteNode[i] = the graph's cell for site i instead
// of siteX, siteY.
function newGraphMountain(options) {
  const graph = options.graph.neighbors ? options.graph : makeGraph(options.graph);
  const radius = options.radius;
  const cap = options.cap || Infinity;     // the capacity M (see the top of this file)
  const power = options.s || 0;             // the weight s (see the top of this file)
  const clocks = options.clocks === undefined ? null : newClocks(options.clocks, power);

  // Every site gets a number, 0, 1, 2, ..., in the order it becomes
  // available. For site number i:
  const siteNode = [];         // its cell in the graph
  const height = [];           // how many blocks are on it
  const siteOf = new Map();    // a cell -> its site number
  const available = [];        // the available sites (on the line: left to right)
  const placeA = [], placeB = [];   // with clocks: the site's place as two numbers (nameOf, below)

  // For a ball: the cells allowed (the start and everything within R).
  const inside = options.domain.kind === "ball"
    ? new Set([0].concat(ballAround(graph, 0, options.domain.layers))) : null;

  // Make a cell available, unless it is outside the domain or already
  // available. Returns its site number, or -1 if outside the domain.
  function makeAvailable(node) {
    if (inside && !inside.has(node)) return -1;
    if (siteOf.has(node)) return siteOf.get(node);
    const i = siteNode.length;
    siteNode.push(node);
    height.push(0);
    siteOf.set(node, i);
    if (clocks) {
      const [a, b] = clocks.textToNumbers(nameOf(node));
      placeA.push(a); placeB.push(b);
      clocks.set(i, a, b, 0, m.time);
    }
    if (!graph.order) {
      available.push(i);
    } else {
      // On the line: insert it where it belongs from left to right, as
      // in 1D (binary search for the first site to its right).
      const x = graph.order(node);
      let lo = 0, hi = available.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (graph.order(siteNode[available[mid]]) < x) lo = mid + 1; else hi = mid;
      }
      available.splice(lo, 0, i);
    }
    return i;
  }

  const m = {
    dim: "graph", graph: graph,
    siteNode: siteNode, height: height, available: available,
    steps: 0, time: 0, blocks: 0, baseSize: 0, full: 0, maxHeight: 0, start: -1,
    step: step, dropOn: dropOn,
  };

  // A name for a cell that doesn't depend on the order the cells were
  // made in (which changes with the run): where it is, to 9 digits.
  function nameOf(node) {
    return graph.place(node).map(function (v) { return v.toPrecision(9); }).join(",");
  }

  // One step, random or on a chosen site, exactly as in part 1.
  function step(u) {
    dropOn(clocks ? clocks.next(m) : pickSite(available, height, power, u));
  }
  function dropOn(i) {
    drop(i);
    m.steps += 1;
  }
  function drop(i) {
    height[i] += 1;
    m.blocks += 1;
    if (height[i] > m.maxHeight) m.maxHeight = height[i];
    if (height[i] >= cap) {   // full: no longer available
      available.splice(available.indexOf(i), 1);
      m.full += 1;
    }
    if (clocks) clocks.set(i, placeA[i], placeB[i], height[i] < cap ? height[i] : -1, m.time);
    if (height[i] === 1) {
      m.baseSize += 1;
      for (const w of ballAround(graph, siteNode[i], radius)) makeAvailable(w);
    }
  }

  m.start = makeAvailable(0);
  drop(m.start);
  return m;
}


/* =====================================================================
   1c. THE HOLES AND 1d. HOW CONVEX THE BASE IS
   ---------------------------------------------------------------------
   The holes of a 2D base, with the step each one was born and died,
   are found by holeHistory, and the convex hull by convexHull (both in
   js/sim-shape.js, shared with Random Walk). A hole is a bounded group
   of empty squares; these are the holes studied for the Eden model in
   F. Manin, E. Roldan and B. Schweinhart, "Topology and local geometry
   of the Eden model", Discrete Comput. Geom. (2023), arXiv:2005.12349.

   The base as the union of its unit squares, K. Its convexity is
   area(K) / area(hull of K), where the hull is the smallest convex set
   holding K: 1 when K is convex, smaller the more K has bays and holes.
   The hull of K is the hull of its squares' corners, and only the
   lowest and highest square of each column can have a corner on the
   hull, so only the lowest and highest corner on each vertical grid
   line are handed to convexHull.
   ===================================================================== */
function convexity(m) {
  // Along the vertical grid lines X = x - 1/2: the lowest and highest
  // corner on each, from the columns on either side of it.
  let xmin = Infinity, xmax = -Infinity;
  for (const x of m.columns.keys()) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
  const points = [];
  for (let x = xmin; x <= xmax + 1; x++) {
    let low = Infinity, high = -Infinity;
    for (const column of [m.columns.get(x - 1), m.columns.get(x)]) {
      if (column) { low = Math.min(low, column[0] - 0.5); high = Math.max(high, column[1] + 0.5); }
    }
    if (low === Infinity) continue;   // a gap between columns (a drawn domain)
    points.push([x - 0.5, low]);
    if (high > low) points.push([x - 0.5, high]);
  }
  return m.baseSize / polygonArea(convexHull(points));
}

/* =====================================================================
   2. THE MOUNTAIN IN A SECOND THREAD
   ---------------------------------------------------------------------
   Random numbers. The page picks with clocks (see the top of this
   file), made from the seed. Each site's alarms depend only on the
   seed, where the site is and its height, whatever the tile, domain,
   capacity or weight. So changing any of them with the same seed
   keeps the same alarms, and the picture changes as little as it can,
   like a Desmos slider.

   The page sends:
     { type: "setup", run, dim, tile, domain, start, cap, s, seed, steps, forgetClicks }
         (on a graph: dim "graph", and graph and radius instead of tile and start)
         a new mountain, grown at once to "steps" steps with the same
         seed (so changing a setting keeps the step you were at)
     { type: "play", speed }   drop "speed" blocks per second
                               (Infinity = as fast as possible)
     { type: "pause" }
     { type: "step" }          one block
     { type: "goto", steps }   jump to that step (back or forward)
     { type: "click", site }   the next block goes on available site
                               number "site" (a click on the picture)

   Clicks. A clicked block is kept as "step n landed on this site", so
   it stays when the run is grown again (going back with "goto", or a
   change to the tile or the domain); a setup with forgetClicks (the
   Restart button, a new seed) forgets them. A clicked block lands at
   the time of the block before it, and that site's next alarm starts
   then; every other site keeps its alarms. If the clicked site isn't
   available at that step any more (say the domain changed), that step
   is random as usual.

   The worker answers with "state" messages: the available sites, their
   heights, and the numbers for the Statistics box. Each carries
   its run number, so the page can ignore leftovers from an older run.
   ===================================================================== */
function mountainWorker() {
  const MAX_STEPS = 10000000;   // ten million blocks at most
  const SHAPE_BINS = 180;       // directions for the radius charts (2 degrees each)
  let options = null;           // the latest setup message
  let mountain = null;          // from newMountain() or newGraphMountain() (part 1)
  let run = 0;
  let problem = "";             // e.g. "The start site is outside the domain."
  let clicks = new Map();       // step n -> the site clicked for it (see siteName)
  let trace = null;             // the run so far, for the charts over time (newTrace, js/sim-worker.js)
  // On a graph, where each site is (its cell's place in the graph) only
  // has to be sent once: each message carries the places of the sites
  // made since the last message, starting with site number placesFrom.
  let placesSent = 0;
  // The holes (part 1c), in 2D off a torus. Worked out again for each
  // message, but while playing at most a fifth of the time: "holes" is
  // the last answer, for the step holesStep, and holesFree is when the
  // next one may start.
  let holes = null, holesStep = -1, holesFree = 0;

  // Start again from one block, and grow to "steps" steps.
  function setup(steps) {
    problem = "";
    placesSent = 0;
    try {
      const withClocks = Object.assign({}, options, { clocks: String(options.seed), shapeBins: holesWanted() ? SHAPE_BINS : 0 });
      mountain = options.dim === "graph" ? newGraphMountain(withClocks) : newMountain(withClocks);
    } catch (error) {
      mountain = null;
      problem = error.message;
      return;
    }
    trace = newTrace();
    takeSample();
    while (mountain.steps < steps && !isDone()) oneStep();
  }

  // The run can't go on: the step limit, or (with a capacity) every
  // site is full, so no block can land anywhere.
  function isDone() {
    return mountain !== null && (mountain.steps >= MAX_STEPS || mountain.available.length === 0);
  }

  function oneStep() {
    if (!mountain || isDone()) return;
    const clicked = clicks.has(mountain.steps + 1) ? findSite(clicks.get(mountain.steps + 1)) : -1;
    if (clicked >= 0) mountain.dropOn(clicked);
    else mountain.step();
    takeSample();
  }

  // A name for site i that stays the same from run to run (site numbers
  // can change): its coordinates, or its cell of the graph.
  function siteName(i) {
    const m = mountain;
    return m.dim === "graph" ? "graph " + m.siteNode[i] : m.dim + "D " + m.siteX[i] + "," + m.siteY[i];
  }
  // The site with that name, or -1 if it isn't available.
  function findSite(name) {
    for (const i of mountain.available) if (siteName(i) === name) return i;
    return -1;
  }

  function takeSample() {
    const m = mountain;
    const values = { base: m.baseSize, highest: m.maxHeight, start: m.height[m.start],
                     full: m.full, growing: m.baseSize - m.full };
    // The shape (2D off a torus), worked out only when a sample is due.
    if (m.radii && m.steps >= trace.next) {
      values.convexity = convexity(m);
      values.radii = m.radii;
    }
    keepSample(trace, m.steps, values);
  }

  // Play, Pause and Speed: the run loop (js/sim-worker.js), dropping the
  // blocks that are due. When the run can't go on it pauses by itself.
  const loop = makeRunLoop(oneStep, report, isDone);

  self.onmessage = function (event) {
    const message = event.data;
    if (message.type === "setup") {
      options = message;
      run = message.run;
      if (message.forgetClicks) clicks = new Map();
      setup(message.steps);
      report();
    } else if (message.type === "play") {
      loop.play(message.speed);
    } else if (message.type === "pause") {
      loop.pause();
      report();
    } else if (message.type === "step") {
      oneStep();
      report();
    } else if (message.type === "click") {
      if (mountain && mountain.available.includes(message.site) && !isDone()) {
        clicks.set(mountain.steps + 1, siteName(message.site));
        oneStep();
        report();
      }
    } else if (message.type === "goto") {
      if (mountain && message.steps < mountain.steps) setup(message.steps);
      else while (mountain && mountain.steps < message.steps && !isDone()) oneStep();
      report();
    }
  };

  // Send the page the heights of the available sites (in the order they
  // became available), the numbers for the Statistics box, and
  // where the sites are: in 1D and 2D, every site's coordinates; on a
  // graph, the places of the new sites (addPlaces).
  function report() {
    const m = mountain;
    if (!m) {
      self.postMessage({ type: "state", run: run, problem: problem });
      return;
    }
    const message = {
      type: "state", run: run, problem: "", dim: options.dim,
      height: Int32Array.from(m.height),
      start: m.start,
      steps: m.steps, blocks: m.blocks, baseSize: m.baseSize,
      available: m.available.length, maxHeight: m.maxHeight, full: m.full,
      atMax: m.steps >= MAX_STEPS,
      allFull: m.available.length === 0,   // with a capacity: every site is full
      traceSteps: Float64Array.from(trace.times),
      traceBase: Float64Array.from(trace.lists.base),
      traceHighest: Float64Array.from(trace.lists.highest),
      traceStart: Float64Array.from(trace.lists.start),
      traceFull: Float64Array.from(trace.lists.full),
      traceGrowing: Float64Array.from(trace.lists.growing),
    };
    if (holesWanted()) addHoles(message);
    if (m.radii) {
      message.convexity = convexity(m);
      message.radii = Float64Array.from(m.radii);
      message.traceConvexity = Float64Array.from(trace.lists.convexity);
      message.traceRadii = Float64Array.from(trace.lists.radii);   // SHAPE_BINS numbers per sample
    }
    if (m.dim === "graph") {
      addPlaces(message);
    } else {
      message.x = Int32Array.from(m.siteX);
      message.y = Int32Array.from(m.siteY);
    }
    // Hand the lists of sites over instead of copying them again.
    const lists = [message.height, message.x, message.y, message.places].filter(Boolean);
    self.postMessage(message, lists.map(function (list) { return list.buffer; }));
  }

  // Holes (and the shape charts) only make sense in 2D, off a torus
  // (where "bounded" means nothing).
  function holesWanted() {
    const d = options.domain;
    return options.dim === 2 && !(d.kind === "box" && d.torus) && !(d.kind === "cells" && d.wrap);
  }

  // The holes now, their births and deaths, and beta_1 at the times of
  // the charts' samples.
  function addHoles(message) {
    const m = mountain, now = performance.now();
    if (holesStep !== m.steps && (!loop.playing || now >= holesFree)) {
      holes = holeHistory(m, m.steps);
      holesStep = m.steps;
      holesFree = now + 4 * (performance.now() - now);
    }
    // beta_1 at step t: births up to t minus deaths up to t (at the
    // samples up to holesStep; the holes may be a little behind).
    const times = trace.times.filter(function (t) { return t <= holesStep; });
    const beta = bettiOverTime(holes, times);
    message.holes = {
      step: holesStep, now: holes.openBirths.length, closed: holes.deaths.length,
      births: Float64Array.from(holes.births), deaths: Float64Array.from(holes.deaths),
      cells: Int32Array.from(holes.holeCells), times: Float64Array.from(times), beta: beta,
    };
  }

  // On a graph: the places of the sites made since the last message,
  // from site number placesFrom on (and on a tree built by rules, where
  // they go in the page's "spread out" picture too: their depth and
  // angle, spreadPlace); a problem if the graph can't grow any more;
  // and with the first message of a run the tiling's rules (if it has
  // any), so the page can build the tiling too, to draw it under the
  // mountain, without learning them again (see learnedRules).
  function addPlaces(message) {
    const graph = mountain.graph, sites = mountain.siteNode;
    const from = placesSent, count = sites.length;
    message.placesFrom = from;
    message.places = new Float64Array(4 * (count - from));
    for (let i = from; i < count; i++) message.places.set(graph.place(sites[i]), 4 * (i - from));
    if (graph.shape && graph.shape.q === Infinity && graph.parent) {
      message.spread = new Float64Array(2 * (count - from));
      for (let i = from; i < count; i++) message.spread.set(spreadPlace(graph, sites[i]), 2 * (i - from));
    }
    placesSent = count;
    message.exact = graph.exact;
    if (graph.full) {
      message.problem = graph.exact
        ? "The graph has reached a million cells, the most this page makes, so the mountain can't spread any further out."
        : "The mountain has reached the edge of what this page can build of this tiling (about distance 23 " +
          "from the start), so it can't spread any further out.";
    }
    if (from === 0 && graph.shape) {
      message.rules = { name: graph.shape.p + "," + graph.shape.q, kinds: learnedRules(graph.shape) };
    }
  }
}
