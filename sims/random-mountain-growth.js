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
        (sims/random-mountain-check.html) tests it in the browser.
     1b. newGraphMountain(options): the same rule on any graph.
     2. mountainWorker(): runs a mountain in a second thread (a "Web
        Worker") for the sim page, random-mountain.js, so the page never
        freezes. startWorker (js/sim-page.js) starts it, with
        newMountain copied in.
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
    dropOn: dropOn,
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

  // One step with the site chosen, not random (a click on the page):
  // the block goes on available site i.
  function dropOn(i) {
    drop(i);
    m.steps += 1;
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

  // For a ball: the cells allowed (the start and everything within R).
  let inside = null;
  if (options.domain.kind === "ball") inside = new Set([0].concat(ballAround(graph, 0, options.domain.layers)));

  // Make a cell available, unless it is outside the domain or already
  // available. Returns its site number, or -1 if outside the domain.
  function makeAvailable(node) {
    if (inside && !inside.has(node)) return -1;
    if (siteOf.has(node)) return siteOf.get(node);
    const i = siteNode.length;
    siteNode.push(node);
    height.push(0);
    siteOf.set(node, i);
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
    steps: 0, blocks: 0, baseSize: 0, maxHeight: 0, start: -1,
    step: step, dropOn: dropOn,
  };

  // Drop one block, exactly as in part 1.
  function step(u) {
    const i = available[Math.floor(u * available.length)];
    drop(i);
    m.steps += 1;
    return i;
  }

  function drop(i) {
    height[i] += 1;
    m.blocks += 1;
    if (height[i] > m.maxHeight) m.maxHeight = height[i];
    if (height[i] === 1) {
      m.baseSize += 1;
      for (const w of ballAround(graph, siteNode[i], radius)) makeAvailable(w);
    }
  }

  // One step on a chosen site (a click), as in part 1.
  function dropOn(i) {
    drop(i);
    m.steps += 1;
  }

  m.start = makeAvailable(0);
  drop(m.start);
  return m;
}


/* =====================================================================
   2. THE MOUNTAIN IN A SECOND THREAD
   ---------------------------------------------------------------------
   Random numbers. The library seedrandom
   (https://github.com/davidbau/seedrandom) gives random numbers that
   repeat exactly for the same seed. Step n always uses the n-th number
   u_n, whatever the tile or domain. So changing the tile or the domain
   with the same seed reuses the same u's, and the picture changes as
   little as it can, like a Desmos slider.

   The page sends:
     { type: "setup", run, dim, tile, domain, start, seed, steps }
         (or, for a graph: dim "graph", graph, radius, domain)
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
   Restart button, a new seed) forgets them. Step n still uses up its
   number u_n, so every other step keeps its own random number. If the
   clicked site isn't available at that step any more (say the domain
   changed), that step is random as usual.
   The worker answers with "state" messages: the available sites, their
   heights, and the numbers for the Statistics quadrant. Each carries
   its run number, so the page can ignore leftovers from an older run.
   ===================================================================== */
function mountainWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  const MAX_STEPS = 10000000;   // ten million blocks at most
  let options = null;           // the latest setup message
  let mountain = null;          // from newMountain() (part 1)
  let random = null;            // the seeded random numbers
  let run = 0;
  let problem = "";             // e.g. "The start site is outside the domain."
  let clicks = new Map();       // step n -> the site clicked for it (see siteName)

  // Start again from one block, and grow to "steps" steps.
  function setup(steps) {
    random = new Math.seedrandom(String(options.seed));
    problem = "";
    placesSent = 0;
    try {
      mountain = options.dim === "graph" ? newGraphMountain(options) : newMountain(options);
    } catch (error) {
      mountain = null;
      problem = error.message;
      return;
    }
    traceSteps = []; traceBase = []; traceHighest = []; traceStart = [];
    traceGap = 1;
    nextSample = 0;
    takeSample();
    while (mountain.steps < Math.min(steps, MAX_STEPS)) oneStep();
  }

  function oneStep() {
    if (!mountain || mountain.steps >= MAX_STEPS) return;
    const u = random();                       // always used up, so step n keeps u_n
    const clicked = clicks.has(mountain.steps + 1) ? findSite(clicks.get(mountain.steps + 1)) : -1;
    if (clicked >= 0) mountain.dropOn(clicked);
    else mountain.step(u);
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
    for (let i = 0; i < mountain.height.length; i++) if (siteName(i) === name) return i;
    return -1;
  }

  // The run so far, for the charts over time. A sample is taken every
  // traceGap steps; when there are more than MAX_SAMPLES, every other one
  // is dropped and traceGap doubles, so a long run keeps evenly spaced
  // samples from start to end.
  const MAX_SAMPLES = 1000;
  let traceSteps = [], traceBase = [], traceHighest = [], traceStart = [];
  let traceGap = 1, nextSample = 0;

  function takeSample() {
    if (mountain.steps < nextSample) return;
    traceSteps.push(mountain.steps);
    traceBase.push(mountain.baseSize);
    traceHighest.push(mountain.maxHeight);
    traceStart.push(mountain.height[mountain.start]);
    nextSample = mountain.steps + traceGap;
    if (traceSteps.length > MAX_SAMPLES) {
      const even = function (value, k) { return k % 2 === 0; };
      traceSteps = traceSteps.filter(even);
      traceBase = traceBase.filter(even);
      traceHighest = traceHighest.filter(even);
      traceStart = traceStart.filter(even);
      traceGap *= 2;
    }
  }

  // The run loop, as in the other sims: every few milliseconds, drop the
  // blocks that are due (at most TICK_BUDGET ms of work), then report.
  let playing = false, speed = 20, owed = 0, lastTick = 0, timer = null;
  const TICK_BUDGET = 25;

  self.onmessage = function (event) {
    const message = event.data;
    if (message.type === "setup") {
      options = message;
      run = message.run;
      if (message.forgetClicks) clicks = new Map();
      setup(message.steps);
      report();
    } else if (message.type === "play") {
      speed = message.speed;
      if (!playing) {
        playing = true;
        owed = 0;
        lastTick = performance.now();
        timer = setTimeout(tick, 0);
      }
    } else if (message.type === "pause") {
      playing = false;
      clearTimeout(timer);
    } else if (message.type === "step") {
      oneStep();
      report();
    } else if (message.type === "click") {
      if (mountain && message.site >= 0 && message.site < mountain.height.length && mountain.steps < MAX_STEPS) {
        clicks.set(mountain.steps + 1, siteName(message.site));
        oneStep();
        report();
      }
    } else if (message.type === "goto") {
      if (mountain && message.steps < mountain.steps) setup(message.steps);
      else while (mountain && mountain.steps < Math.min(message.steps, MAX_STEPS)) oneStep();
      report();
    }
  };

  function tick() {
    const now = performance.now();
    const until = now + TICK_BUDGET;
    if (speed === Infinity) {
      do oneStep(); while (performance.now() < until);
    } else {
      owed = Math.min(owed + speed * (now - lastTick) / 1000, speed);   // at most 1 second behind
      while (owed >= 1 && performance.now() < until) { oneStep(); owed--; }
    }
    lastTick = now;
    report();
    if (playing) timer = setTimeout(tick, 10);
  }

  // On a graph, where each site is (its cell's place in the graph) only
  // has to be sent once: each message carries the places of the sites
  // made since the last message, starting with site number placesFrom.
  let placesSent = 0;

  // Send the available sites (their coordinates and heights) and the
  // numbers to the page.
  function report() {
    if (!mountain) {
      self.postMessage({ type: "state", run: run, problem: problem });
      return;
    }
    const m = mountain;
    if (options.dim === "graph") { reportGraph(m); return; }
    const x = Int32Array.from(m.siteX), y = Int32Array.from(m.siteY), h = Int32Array.from(m.height);
    self.postMessage({
      type: "state", run: run, problem: "", dim: options.dim,
      x: x, y: y, height: h,             // every available site, in the order they became available
      start: m.start,
      steps: m.steps, blocks: m.blocks, baseSize: m.baseSize,
      available: m.available.length, maxHeight: m.maxHeight,
      atMax: m.steps >= MAX_STEPS,
      traceSteps: Float64Array.from(traceSteps),
      traceBase: Float64Array.from(traceBase),
      traceHighest: Float64Array.from(traceHighest),
      traceStart: Float64Array.from(traceStart),
    }, [x.buffer, y.buffer, h.buffer]);   // hand the copies over instead of copying again
  }

  // The same for a mountain on a graph.
  function reportGraph(m) {
    const count = m.siteNode.length, from = placesSent;
    const places = new Float64Array(4 * (count - from));
    for (let i = from; i < count; i++) places.set(m.graph.place(m.siteNode[i]), 4 * (i - from));
    // On a tree (built by rules), where each site goes in the page's
    // "spread out" picture too: its depth and angle (spreadPlace).
    let spread;
    if (m.graph.shape && m.graph.shape.q === Infinity && m.graph.parent) {
      spread = new Float64Array(2 * (count - from));
      for (let i = from; i < count; i++) spread.set(spreadPlace(m.graph, m.siteNode[i]), 2 * (i - from));
    }
    placesSent = count;
    const h = Int32Array.from(m.height);
    self.postMessage({
      type: "state", run: run, dim: "graph",
      problem: !m.graph.full ? "" : m.graph.exact
        ? "The graph has reached a million cells, the most this page makes, so the mountain can't spread any further out."
        : "The mountain has reached the edge of what this page can build of this tiling (about distance 23 " +
          "from the start), so it can't spread any further out.",
      exact: m.graph.exact,
      // With the first message of a run, the tiling's rules (if it has
      // any), so the page can build the tiling too, to draw it under the
      // mountain, without learning them again (see learnedRules).
      rules: from === 0 && m.graph.shape
        ? { name: m.graph.shape.p + "," + m.graph.shape.q, kinds: learnedRules(m.graph.shape) } : undefined,
      height: h, placesFrom: from, places: places, spread: spread,
      start: m.start,
      steps: m.steps, blocks: m.blocks, baseSize: m.baseSize,
      available: m.available.length, maxHeight: m.maxHeight,
      atMax: m.steps >= MAX_STEPS,
      traceSteps: Float64Array.from(traceSteps),
      traceBase: Float64Array.from(traceBase),
      traceHighest: Float64Array.from(traceHighest),
      traceStart: Float64Array.from(traceStart),
    }, [h.buffer, places.buffer]);
  }
}
