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

   The file has two parts, with no drawing and no buttons:
     1. newMountain(options): the growth rule itself. The check page
        (sims/random-mountain-check.html) tests it in the browser.
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
         a new mountain, grown at once to "steps" steps with the same
         seed (so changing a setting keeps the step you were at)
     { type: "play", speed }   drop "speed" blocks per second
                               (Infinity = as fast as possible)
     { type: "pause" }
     { type: "step" }          one block
     { type: "goto", steps }   jump to that step (back or forward)
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

  // Start again from one block, and grow to "steps" steps.
  function setup(steps) {
    random = new Math.seedrandom(String(options.seed));
    problem = "";
    try {
      mountain = newMountain(options);
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
    mountain.step(random());
    takeSample();
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

  // Send the available sites (their coordinates and heights) and the
  // numbers to the page.
  function report() {
    if (!mountain) {
      self.postMessage({ type: "state", run: run, problem: problem });
      return;
    }
    const m = mountain;
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
}
