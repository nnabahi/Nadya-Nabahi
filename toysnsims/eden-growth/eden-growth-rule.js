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

   ON ANY OTHER TILING (2D, the Lattice options on the page). The same
   rule on any tiling by regular polygons (js/sim-tilings.js), its tiles
   or its corners being the cells. A site is then cell z of the tiling's
   repeating block (x, y). The cells aren't all alike, so a list of
   offsets like (1, 0) can't be the same tile for every cell: the tile
   is "every cell within r steps of the site" (a step crosses one side;
   ballTile below), as on a graph (next paragraph). On the square grid
   r = 1 is the 4 neighbors. Distances, the hull and the holes go by the
   middles and polygons of the cells, in side lengths. On a Penrose
   tiling (js/sim-penrose.js), which never repeats, the block is one
   patch around the middle, so a site is always cell z of block (0, 0):
   a box's patch, or on the whole plane a patch that grows as the
   mountain spreads, up to PENROSE_PLANE_MOST from the middle, where it
   stops.

   ON ANY GRAPH ("Graph" on the page). The same rule on a graph whose
   cells are made as they are needed (js/sim-graphs.js): a hyperbolic
   tiling {p,q} or a regular tree. A graph has no offsets, so the tile
   is "every cell within distance r of the site" (the ball of radius r,
   not counting the site). On the line, r = 1 is the tile {-1, +1}; on
   the square grid it is the 4 neighbors. newGraphMountain (part 1b)
   finds its sites its own way, and drops blocks with the same steps as
   the 1D and 2D mountains (mountainSteps, part 1); the check page shows
   that on the line and the square grid it gives exactly the same
   mountain as 1D and 2D, block for block, from the same random numbers.
   (On the line, its sites are counted from left to right too; on other
   graphs, in the order they became available.)

   The file has these parts, with no drawing and no buttons:
     1. newMountain(options): the growth rule itself, on the line, the
        square grid or any other tiling, and mountainSteps, its steps,
        which every mountain shares. The check page
        (eden-growth-check.html) tests it in the browser.
     1b. newGraphMountain(options): the same rule on any graph.
     1c. the holes of a 2D mountain's base (holeHistory, js/sim-shape.js), with the
        step each one was born and the step it died.
     1d. the base's shape (newShape, js/sim-shape.js): its convexity,
        and how far it reaches in each direction.
     2. mountainWorker(): runs a mountain in a second thread (a "Web
        Worker") for the sim page, eden-growth.js, so the page never
        freezes. runInWorker (js/sim-page.js) starts it, with
        newMountain, mountainSteps, ballTile, newGraphMountain, the hyperbolic tilings
        and trees, the trace and random numbers (js/sim-worker.js) and
        the hull and holes (js/sim-shape.js) copied in.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH RULE
   ===================================================================== */


// Make a new mountain. "options" has:
//   dim     1 or 2
//   tile    the offsets: [[dx], ...] in 1D, [[dx, dy], ...] in 2D
//   tiling  (2D only, and only for another tiling than the squares) the
//           tiling's repeating block (uprightBlock, js/sim-tilings.js),
//           or a Penrose tiling's block (js/sim-penrose.js): for a box,
//           its patch, and on the whole plane its plane (penrosePlane),
//           which the mountain grows. A site is then cell z of block
//           (x, y), and "tile" is left out:
//   radius  (with a tiling) r: the tile is every cell within r steps
//   domain  one of
//             { kind: "whole" }
//             { kind: "box", xmin, xmax, ymin, ymax, torus }   (1D: ymin = ymax = 0;
//                 not on another tiling)
//             { kind: "cells", cells: [[x, y], ...], wrap }    (wrap: the torus's
//                 { xmin, xmax, ymin, ymax }, or null): a region drawn in the
//                 graph tool, or on another tiling a box or torus of its cells
//                 [x, y, z] (tilingBox, js/sim-domains.js; a torus wraps around
//                 whole blocks)
//   start   the start site, [x] in 1D, [x, y] in 2D, [x, y, z] on another tiling
//   cap     M, the capacity: the most blocks a site can hold
//           (leave it out for no max)
//   s       the weight s (leave it out for 0: uniform)
//   clocks  a seed: pick with clocks (see the top of this file). Leave
//           it out to pick with the u's handed to step(u).
//   shapeBins  (2D, not on a torus) keep track of the base's shape, for
//           part 1d, as m.shape (newShape, js/sim-shape.js, seen from
//           the start, with shapeBins slices of the circle): its
//           farthest site in each direction, its area, hull and
//           convexity.
// It returns an object whose step(u) drops one block, and whose fields
// say how the mountain looks (see the end of this function).
function newMountain(options) {
  const dim = options.dim;
  const tiling = options.tiling || null;
  const domain = options.domain;
  const bins = options.shapeBins || 0;

  // The cells: on another tiling, cell z of block (x, y) is the cell
  // tiling.cells[z] moved by x a + y b; on the grids, the square of side
  // 1 around (x, y), as the one cell of a block of size 1 (z is always 0).
  // A Penrose tiling has one block, and on the whole plane it grows.
  const block = tiling || { a: [1, 0], b: [0, 1],
    cells: [{ middle: [0, 0], corners: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] }] };
  const finite = Boolean(tiling && tiling.finite), plane = finite && domain.kind === "whole";
  const parts = block.cells.length;

  // Every site gets a number, 0, 1, 2, ..., in the order it becomes
  // available. For site number i:
  const siteX = [];        // its coordinates (on another tiling, its block (x, y) and cell z)
  const siteY = [];
  const siteZ = [];
  const height = [];       // how many blocks are on it (0 = not in the base yet)
  const bornAt = [];       // the step its first block landed (0 for the start)
  const numberOf = new Map();   // a site's key (below) -> its number

  // The available sites, as a list of site numbers. In 1D the list is
  // kept sorted from left to right (see the top of this file).
  const available = [];

  // The tile, as moves [dx, dy, z2] for each kind of cell z: a block on
  // cell z of block (x, y) makes cell z2 of block (x + dx, y + dy)
  // available. On the grids, the offsets T, for the one kind of cell;
  // on another tiling, every cell within r steps (ballTile, below),
  // worked out the first time a cell of that kind joins the base (tileOf).
  const tiles = tiling ? new Map() : new Map([[0, offsetMoves(options.tile)]]);

  // For a drawn domain (or a box or torus of another tiling): the keys
  // of its cells, to look them up quickly.
  const drawnCells = new Set();
  if (domain.kind === "cells") {
    for (const c of domain.cells) drawnCells.add(keyOf(c[0], dim === 2 ? c[1] : 0, c[2] || 0));
  }

  // The torus (or cycle) that coordinates wrap around, or null.
  let wrapRange = null;
  if (domain.kind === "box" && domain.torus) wrapRange = domain;
  if (domain.kind === "cells" && domain.wrap) wrapRange = domain.wrap;

  // The offsets T as moves [dx, dy, 0] (in 1D dy is 0). An offset (0, 0)
  // changes nothing, so it is left out.
  function offsetMoves(offsets) {
    const moves = [];
    for (const t of offsets) {
      const dx = t[0], dy = dim === 2 ? t[1] : 0;
      if (dx !== 0 || dy !== 0) moves.push([dx, dy, 0]);
    }
    return moves;
  }

  // One number per site, for the Map above. Coordinates up to about a
  // million either way, with up to 2048 cells in a block, fit without
  // two sites sharing a key (it stays below 2^53). On a Penrose tiling,
  // every site is in block (0, 0): z.
  function keyOf(x, y, z) {
    return finite ? z : ((x + 1048576) * 2097152 + (y + 1048576)) * parts + z;
  }

  // Is (x, y, z) in the domain? (x, y) has already been wrapped on a torus.
  function inDomain(x, y, z) {
    if (domain.kind === "whole") return true;
    if (domain.kind === "box") {
      return x >= domain.xmin && x <= domain.xmax && y >= domain.ymin && y <= domain.ymax;
    }
    return drawnCells.has(keyOf(x, y, z));
  }

  // Make the site (x, y, z) available, unless it is outside the domain
  // or already available. Returns its number, or -1 if outside the domain.
  function makeAvailable(x, y, z) {
    if (wrapRange) {
      x = wrap(x, wrapRange.xmin, wrapRange.xmax);
      if (dim === 2) y = wrap(y, wrapRange.ymin, wrapRange.ymax);
    }
    if (!inDomain(x, y, z)) return -1;
    const key = keyOf(x, y, z);
    if (numberOf.has(key)) return numberOf.get(key);

    const i = siteX.length;
    siteX.push(x);
    siteY.push(y);
    siteZ.push(z);
    numberOf.set(key, i);
    rule.addSite(i);
    return i;
  }

  // Site i's place, for its alarm clocks (newClocks): (x, y), and z too
  // when a block has more than one cell. On a Penrose tiling, its cell's
  // name, which says where it is (its cell number depends on how the
  // patch grew), in two halves of 26 bits (the clocks take whole numbers
  // of up to 32 bits): so a box and the whole plane have the same clocks.
  function clockPlace(i) {
    if (finite) {
      const key = block.cells[siteZ[i]].key;
      return [Math.floor(key / 67108864), key % 67108864];
    }
    return parts === 1 ? [siteX[i], siteY[i]] : [siteX[i], siteY[i], siteZ[i]];
  }

  // Where site (x, y, z) is in the plane, in side lengths: the middle of
  // its cell (on the grids, (x, y) itself), and its cell's corners.
  function placeOf(x, y, z) {
    const middle = block.cells[z].middle;
    return [x * block.a[0] + y * block.b[0] + middle[0], x * block.a[1] + y * block.b[1] + middle[1]];
  }
  function polygonOf(x, y, z) {
    const u = x * block.a[0] + y * block.b[0], w = x * block.a[1] + y * block.b[1];
    return block.cells[z].corners.map(function (c) { return [c[0] + u, c[1] + w]; });
  }

  // The mountain's numbers, kept up to date by step() below.
  const m = {
    dim: dim,
    tiling: tiling,    // (null on the grids; holeHistory, js/sim-shape.js, reads it)
    siteX: siteX, siteY: siteY, siteZ: siteZ, height: height, available: available, bornAt: bornAt,
    shape: null,       // with shapeBins: the base's shape (newShape, js/sim-shape.js; set with the start below)
    atEdge: false,     // on a Penrose tiling's plane: the mountain has reached its edge
    steps: 0,          // n, the number of steps so far
    time: 0,           // with clocks: when the last block landed
    blocks: 0,         // blocks dropped, including the first one (= n + 1)
    baseSize: 0,       // |D|, the number of sites with a block
    full: 0,           // sites with M blocks (with a capacity)
    maxHeight: 0,
    start: -1,         // the start site's number
    // step(u) and dropOn(i): one step (mountainSteps, below)
    heightAt: heightAt,
    placeOf: placeOf,
    polygonOf: polygonOf,
  };

  // The steps (mountainSteps, below). A site joining the base makes its
  // tile available. In 1D the available sites are kept from left to
  // right (see the top of this file).
  const rule = mountainSteps(m, options, {
    clockPlace: clockPlace,
    orderOf: dim === 2 ? null : function (i) { return siteX[i]; },
    joinsBase: function (i) {
      bornAt[i] = m.blocks - 1;   // the start's block is block 1, step n's is block n + 1
      if (m.shape) m.shape.add(placeOf(siteX[i], siteY[i], siteZ[i]), polygonOf(siteX[i], siteY[i], siteZ[i]));
      for (const [dx, dy, z] of tileOf(siteZ[i])) makeAvailable(siteX[i] + dx, siteY[i] + dy, z);
    },
  });

  // The tile of a cell of kind z (on the grids, z = 0), worked out the
  // first time. On a Penrose tiling's plane, the plane must first hold
  // every cell within 4r + 6 of it: the tile, every cell within r steps
  // (a step goes less than 2), the tiles of those, and the window the
  // holes look at, 5 past the base (js/sim-shape.js). If it can't grow
  // that far (PENROSE_PLANE_MOST, js/sim-penrose.js), the mountain has
  // reached its edge, and the run stops after this step. This cell's
  // own tile is still whole: it was in the tile of a cell that fit.
  function tileOf(z) {
    if (!tiles.has(z)) {
      if (plane) {
        const [x, y] = block.cells[z].middle;
        if (!penroseReach(block, x, y, 4 * options.radius + 6)) m.atEdge = true;
      }
      tiles.set(z, ballTile(tiling, z, options.radius));
    }
    return tiles.get(z);
  }

  // The height at (x, y, z) (in 1D, y = 0; on the grids, z = 0), or 0 if
  // there is no site there.
  function heightAt(x, y, z) {
    const i = numberOf.get(keyOf(x, y || 0, z || 0));
    return i === undefined ? 0 : height[i];
  }

  // The start: one block on the start site.
  const s = options.start;
  m.start = makeAvailable(s[0], dim === 2 ? s[1] : 0, s[2] || 0);
  if (m.start < 0) throw new Error("The start site is outside the domain.");
  if (bins) m.shape = newShape(placeOf(siteX[m.start], siteY[m.start], siteZ[m.start]), bins);
  rule.drop(m.start);

  return m;
}

// On another tiling: the tile of cell z, every cell within r steps of
// it (a step crosses one side), leaving out the cell itself, as moves
// [dx, dy, z2] to cell z2 of the block dx right and dy up. Found by
// going out one step at a time, as ballAround does on a graph
// (js/sim-graphs.js).
function ballTile(tiling, z, r) {
  const seen = new Set(["0,0," + z]), moves = [];
  let layer = [[0, 0, z]];
  for (let step = 0; step < r; step++) {
    const further = [];
    for (const [x, y, k] of layer) {
      for (const [k2, dx, dy] of tiling.cells[k].next) {
        if (k2 < 0) continue;    // (past the edge of a Penrose tiling's patch)
        const key = (x + dx) + "," + (y + dy) + "," + k2;
        if (seen.has(key)) continue;
        seen.add(key);
        further.push([x + dx, y + dy, k2]);
      }
    }
    moves.push(...further);
    layer = further;
  }
  return moves;
}


// The steps of the rule, the same on every mountain whatever its sites
// are (newMountain, newGraphMountain). m is the mountain, with its
// lists m.height and m.available and its counts; "options" are the
// mountain's options (cap, s and clocks are read here); and "sites"
// says how its sites differ:
//   clockPlace(i)   site i's place, for its alarm clocks
//   orderOf(i)      on a line, where site i is from left to right, to
//                   keep the available sites in that order (null: no order)
//   joinsBase(i)    site i just got its first block: make its tile
//                   available (and keep anything else up to date)
// It adds m.step(u) and m.dropOn(i), and returns, for the mountain:
//   addSite(i)      site number i is new: no blocks yet, and available
//   drop(i)         put one block on site i (the start's, say)
//   clocks          the clocks (newClocks, below), or null
function mountainSteps(m, options, sites) {
  const cap = options.cap || Infinity;     // the capacity M (see the top of this file)
  const power = options.s || 0;             // the weight s (see the top of this file)
  const clocks = options.clocks === undefined ? null : newClocks(options.clocks, power);
  const height = m.height, available = m.available;

  function addSite(i) {
    height.push(0);
    if (clocks) clocks.set(i, sites.clockPlace(i), 0, m.time);
    if (!sites.orderOf) {
      available.push(i);
    } else {
      // Insert it where it belongs from left to right. Binary search:
      // the first place whose site lies to its right.
      const x = sites.orderOf(i);
      let lo = 0, hi = available.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sites.orderOf(available[mid]) < x) lo = mid + 1; else hi = mid;
      }
      available.splice(lo, 0, i);
    }
  }

  // One step: drop a block on a random available site. "u" is a uniform
  // random number in [0, 1) (not used with clocks).
  m.step = function (u) {
    m.dropOn(clocks ? clocks.next(m) : pickSite(available, height, power, u));
  };

  // One step with the site chosen, not random (a click on the page):
  // the block goes on available site i.
  m.dropOn = function (i) {
    drop(i);
    m.steps += 1;
  };

  // Put a block on site i; if it is new to the base, it joins it.
  function drop(i) {
    height[i] += 1;
    m.blocks += 1;
    if (height[i] > m.maxHeight) m.maxHeight = height[i];
    if (height[i] >= cap) {   // full: no longer available
      available.splice(available.indexOf(i), 1);
      m.full += 1;
    }
    if (clocks) clocks.set(i, sites.clockPlace(i), height[i] < cap ? height[i] : -1, m.time);
    if (height[i] === 1) {
      m.baseSize += 1;
      sites.joinsBase(i);
    }
  }

  return { addSite: addSite, drop: drop, clocks: clocks };
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
//   set(i, place, h, now)  site i (whose place is a list of whole
//                         numbers, the same from run to run, e.g. its
//                         x and y) has h blocks at time "now": its next
//                         block lands at now + E(place, h) / (h + 1)^s.
//                         h = -1: site i is full, no next block.
//   next(m)               the site whose block lands next; sets m.time
//                         to when.
//   textToNumbers(text)   two whole numbers for a place given as text
//                         (for the cells of a graph)
// The times wait in a heap (newHeap, js/sim-worker.js), so the soonest
// is always first. A site set again (a click put a block on it early)
// leaves its old time in the heap; next() skips times that are out of
// date.
function newClocks(seed, s) {
  const due = [];      // due[i] = when site i's next block lands
  const heap = newHeap();

  // E(place, h): exponential with mean 1, -log(U) for U uniform in
  // (0, 1), always the same for the same seed, place and height
  // (seededUniform, js/sim-worker.js).
  const random = seededUniform(seed);
  function exponential(place, h) {
    return -Math.log(random.uniform(...place, h));
  }

  function set(i, place, h, now) {
    if (h < 0) { due[i] = Infinity; return; }
    const time = now + exponential(place, h) / Math.pow(h + 1, s);
    due[i] = time;
    heap.add(time, i);
  }

  function next(m) {
    for (;;) {
      const time = heap.firstKey(), i = heap.take();
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

  // Every site gets a number, 0, 1, 2, ..., in the order it becomes
  // available. For site number i:
  const siteNode = [];         // its cell in the graph
  const height = [];           // how many blocks are on it
  const siteOf = new Map();    // a cell -> its site number
  const available = [];        // the available sites (on the line: left to right)
  const places = [];           // with clocks: the site's place as two numbers (nameOf, below)

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
    siteOf.set(node, i);
    if (rule.clocks) places.push(rule.clocks.textToNumbers(nameOf(node)));
    rule.addSite(i);
    return i;
  }

  const m = {
    dim: "graph", graph: graph,
    siteNode: siteNode, height: height, available: available,
    steps: 0, time: 0, blocks: 0, baseSize: 0, full: 0, maxHeight: 0, start: -1,
  };

  // A name for a cell that doesn't depend on the order the cells were
  // made in (which changes with the run): where it is, to 9 digits.
  function nameOf(node) {
    return graph.place(node).map(function (v) { return v.toPrecision(9); }).join(",");
  }

  // The steps, exactly as in part 1 (mountainSteps). A site joining the
  // base makes every cell within distance r available. On the line, the
  // available sites are kept from left to right, as in 1D.
  const rule = mountainSteps(m, options, {
    clockPlace: function (i) { return places[i]; },
    orderOf: graph.order ? function (i) { return graph.order(siteNode[i]); } : null,
    joinsBase: function (i) { for (const w of ballAround(graph, siteNode[i], radius)) makeAvailable(w); },
  });

  m.start = makeAvailable(0);
  rule.drop(m.start);
  return m;
}


/* =====================================================================
   1c. THE HOLES AND 1d. HOW CONVEX THE BASE IS
   ---------------------------------------------------------------------
   The holes of a 2D base, with the step each one was born and died,
   are found by holeHistory, and the convex hull by convexHull (both in
   js/sim-shape.js, shared with Random Walk). A hole is a bounded group
   of empty cells; on the square grid these are the holes studied for
   the Eden model in F. Manin, E. Roldan and B. Schweinhart, "Topology
   and local geometry of the Eden model", Discrete Comput. Geom. (2023),
   arXiv:2005.12349.

   The base as the union of its cells (unit squares, or the polygons of
   another tiling), K. Its convexity is area(K) / area(hull of K), where
   the hull is the smallest convex set holding K: 1 when K is convex,
   smaller the more K has bays and holes. The hull of K is the hull of
   its cells' corners, kept up to date as cells join the base (m.shape:
   newShape, js/sim-shape.js, shared with First Passage Percolation).
   ===================================================================== */

/* =====================================================================
   2. THE MOUNTAIN IN A SECOND THREAD
   ---------------------------------------------------------------------
   Random numbers. The page picks with clocks (see the top of this
   file), made from the seed. Each site's alarms depend only on the
   seed, where the site is and its height, whatever the tile, domain,
   capacity or weight. So changing any of them with the same seed
   keeps the same alarms, and the picture changes as little as it can,
   like a Desmos slider.

   It talks to the page the way every sim's worker does (serveRun,
   js/sim-worker.js), one step being one block. Its own messages:
     setup  { dim, tile, domain, start, cap, s, seed, steps, forgetClicks }
         (on another tiling: tiling and radius instead of tile; on a
         graph: dim "graph", and graph and radius instead of tile and start)
         a new mountain, grown at once to "steps" steps with the same
         seed (so changing a setting keeps the step you were at). On a
         Penrose tiling's whole plane, the mountain is on this thread's
         plane of it (kept from run to run while the tiling stays the
         same), and the setup also says how many of the plane's cells the
         page already has, cellsKnown.
     goto   { steps }    jump to that step (back or forward)
     click  { site }     the next block goes on available site number
                         "site" (a click on the picture)

   Clicks. A clicked block is kept as "step n landed on this site", so
   it stays when the run is grown again (going back with "goto", or a
   change to the tile, the domain or the lattice); a setup with
   forgetClicks (the Restart button, a new seed) forgets them. A clicked block lands at
   the time of the block before it, and that site's next alarm starts
   then; every other site keeps its alarms. If the clicked site isn't
   available at that step any more (say the domain changed), that step
   is random as usual.

   It reports the available sites, their heights, and the numbers for
   the Statistics box, and on a Penrose tiling's whole plane the plane's
   cells the page doesn't have yet. The run is done (and pauses by
   itself) at the step limit, when every site is full, or when the
   mountain reaches the edge of a Penrose plane.
   ===================================================================== */
function mountainWorker() {
  const MAX_STEPS = 10000000;   // ten million blocks at most
  const SHAPE_BINS = 180;       // directions for the radius charts (2 degrees each)
  let options = null;           // the latest setup message
  let mountain = null;          // from newMountain() or newGraphMountain() (part 1)
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
  // On a Penrose tiling's whole plane: the plane (penrosePlane,
  // js/sim-penrose.js), and how many of its cells the page has.
  let plane = null, cellsSent = 0;

  // Start again from one block, and grow to "steps" steps.
  function setup(steps) {
    problem = "";
    placesSent = 0;
    holesStep = -1;    // (the holes kept are the old mountain's)
    try {
      const withClocks = Object.assign({}, options, { clocks: String(options.seed), shapeBins: holesWanted() ? SHAPE_BINS : 0 });
      if (onPlane()) {
        plane = penrosePlane(plane, options.tiling);
        cellsSent = options.cellsKnown;
        withClocks.tiling = plane;
      }
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

  // The run can't go on: there is no mountain (the setup had a
  // problem), the step limit, (with a capacity) every site is full, so
  // no block can land anywhere, or the edge of a Penrose plane.
  function isDone() {
    return mountain === null || mountain.steps >= MAX_STEPS || mountain.available.length === 0 || mountain.atEdge;
  }

  function oneStep() {
    const clicked = clicks.has(mountain.steps + 1) ? findSite(clicks.get(mountain.steps + 1)) : -1;
    if (clicked >= 0) mountain.dropOn(clicked);
    else mountain.step();
    takeSample();
  }

  // A name for site i that stays the same from run to run (site numbers
  // can change): the lattice, and its coordinates or its cell of the
  // graph. A site of another lattice has another name, so a click on it
  // waits until that lattice is back.
  function siteName(i) {
    const m = mountain;
    return m.dim === "graph" ? "graph " + options.graph.p + "," + options.graph.q + " " + m.siteNode[i]
      : m.dim + "D " + latticeName() + " " + m.siteX[i] + "," + m.siteY[i] + "," + m.siteZ[i];
  }
  function latticeName() {
    return options.tiling ? options.tiling.code + (options.tiling.corners ? " corners" : "") : "squares";
  }
  // The site with that name, or -1 if it isn't available.
  function findSite(name) {
    for (const i of mountain.available) if (siteName(i) === name) return i;
    return -1;
  }

  // The percent of the sites ever available that are covered (have a
  // block): the base over the base plus the empty available sites. Every
  // site ever made was available once, so that is every site made so far.
  function coveredPercent(m) {
    return 100 * m.baseSize / m.height.length;
  }

  function takeSample() {
    const m = mountain;
    const values = { base: m.baseSize, highest: m.maxHeight, start: m.height[m.start],
                     full: m.full, growing: m.baseSize - m.full, covered: coveredPercent(m) };
    // The shape (2D off a torus), worked out only when a sample is due.
    if (m.shape && m.steps >= trace.next) {
      values.convexity = m.shape.convexity();
      values.radii = m.shape.radii;
    }
    keepSample(trace, m.steps, values);
  }

  const loop = serveRun({
    setup: function (message) {
      options = message;
      if (message.forgetClicks) clicks = new Map();
      setup(message.steps);
    },
    steps: oneStep, isDone: isDone, report: report,
    messages: {
      click: function (message) {
        if (isDone() || !mountain.available.includes(message.site)) return;
        clicks.set(mountain.steps + 1, siteName(message.site));
        oneStep();
      },
      goto: function (message) {
        if (mountain && message.steps < mountain.steps) setup(message.steps);
        else while (!isDone() && mountain.steps < message.steps) oneStep();
      },
    },
  });

  // Send the page the heights of the available sites (in the order they
  // became available), the numbers for the Statistics box, and
  // where the sites are: in 1D and 2D, every site's coordinates; on a
  // graph, the places of the new sites (addPlaces).
  function report(send) {
    const m = mountain;
    if (!m) {
      send({ problem: problem });
      return;
    }
    const message = {
      problem: "", dim: options.dim,
      height: Int32Array.from(m.height),
      start: m.start,
      steps: m.steps, blocks: m.blocks, baseSize: m.baseSize,
      available: m.available.length, covered: coveredPercent(m), maxHeight: m.maxHeight, full: m.full,
      atMax: m.steps >= MAX_STEPS,
      allFull: m.available.length === 0,   // with a capacity: every site is full
      atEdge: m.atEdge,                    // on a Penrose tiling's whole plane: it has reached the plane's edge
      traceSteps: Float64Array.from(trace.times),
      traceBase: Float64Array.from(trace.lists.base),
      traceHighest: Float64Array.from(trace.lists.highest),
      traceStart: Float64Array.from(trace.lists.start),
      traceFull: Float64Array.from(trace.lists.full),
      traceGrowing: Float64Array.from(trace.lists.growing),
      traceCovered: Float64Array.from(trace.lists.covered),
    };
    if (holesWanted()) addHoles(message);
    if (m.shape) {
      message.convexity = m.shape.convexity();
      message.radii = Float64Array.from(m.shape.radii);
      message.traceConvexity = Float64Array.from(trace.lists.convexity);
      message.traceRadii = Float64Array.from(trace.lists.radii);   // SHAPE_BINS numbers per sample
    }
    if (m.dim === "graph") {
      addPlaces(message);
    } else {
      message.x = Int32Array.from(m.siteX);
      message.y = Int32Array.from(m.siteY);
      if (m.tiling) message.z = Int32Array.from(m.siteZ);
    }
    if (onPlane()) addPlane(message);
    // Hand the lists of sites over instead of copying them again.
    const lists = [message.height, message.x, message.y, message.z, message.places].filter(Boolean);
    send(message, lists.map(function (list) { return list.buffer; }));
  }

  // Is the mountain on a Penrose tiling's whole plane?
  function onPlane() {
    return Boolean(options.tiling && options.tiling.finite) && options.domain.kind === "whole";
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

  // On a Penrose tiling's whole plane: the plane's cells the page doesn't
  // have yet.
  function addPlane(message) {
    if (plane.cells.length > cellsSent) {
      message.planeCells = planeCellsFrom(plane, cellsSent);
      cellsSent = plane.cells.length;
    }
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
