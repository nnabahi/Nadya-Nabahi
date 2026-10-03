/* =====================================================================
   random-mountain-growth.js  —  the growth rule behind the "Random
   mountain" sim
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

   The order of the available sites. Step 1 turns a uniform number u in
   [0, 1) into the site number floor(u * |S|), where |S| is the number
   of available sites, exactly as randmountain.py does. In 1D the sites
   are counted from left to right, as in nadya's Python, so the same
   list of u's gives exactly her mountain. In 2D they are counted in the
   order they became available. Either way every site is equally likely.

   This file is the math only: no drawing, no buttons. The sim page
   runs it in a second thread, and sims/random-mountain-check.html tests
   it in the browser.
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
// It returns an object whose step(u) drops one block, and whose fields
// say how the mountain looks (see the end of this function).
function newMountain(options) {
  const dim = options.dim;
  const domain = options.domain;

  // Every site gets a number, 0, 1, 2, ..., in the order it becomes
  // available. For site number i:
  const siteX = [];        // its coordinates
  const siteY = [];
  const height = [];       // how many blocks are on it (0 = not in the base yet)
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
    siteX: siteX, siteY: siteY, height: height, available: available,
    steps: 0,          // n, the number of steps so far
    blocks: 0,         // blocks dropped, including the first one (= n + 1)
    baseSize: 0,       // |D|, the number of sites with a block
    maxHeight: 0,
    start: -1,         // the start site's number
    step: step,
    heightAt: heightAt,
  };

  // Drop one block. "u" is a uniform random number in [0, 1).
  // Returns the number of the site it landed on.
  function step(u) {
    const i = available[Math.floor(u * available.length)];
    drop(i);
    m.steps += 1;
    return i;
  }

  // Put a block on site i, and if it is new to the base, make its
  // tile neighbors available.
  function drop(i) {
    height[i] += 1;
    m.blocks += 1;
    if (height[i] > m.maxHeight) m.maxHeight = height[i];
    if (height[i] === 1) {
      m.baseSize += 1;
      for (const t of tile) makeAvailable(siteX[i] + t[0], siteY[i] + t[1]);
    }
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
