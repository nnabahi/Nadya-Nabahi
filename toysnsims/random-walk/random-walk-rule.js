/* =====================================================================
   random-walk-rule.js  —  the walk behind the "Random Walk" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     One walker starts at the origin of the line (1D), the square grid
     (2D) or the cubic grid (3D). Each step it moves to one of its 2d
     neighbors: in direction k with probability w_k / (w_1 + ... + w_2d),
     where the w's are the weights typed on the page. All weights equal
     (the default, all 1) is the simple random walk: every neighbor
     equally likely.

     The directions, in order: 1D  +x, -x           (right, left)
                               2D  +x, -x, +y, -y   (right, left, up, down)
                               3D  +x, -x, +y, -y, +z, -z
     (in the 3D picture x goes right, y away from you and z up).

     In 2D the walk can also run on any other tiling by regular polygons
     (js/sim-tilings.js), its tiles or its corners being the cells. There
     each step goes to one of the cell's neighbors, all equally likely
     (no weights), and a site is cell z of the tiling's block (x, y). Its
     distances, hull and holes go by the middles and polygons of the
     cells, in side lengths.

   Random numbers (coupling). Step n uses one uniform number u_n in
   (0, 1), made from the seed and n only (seededUniform,
   js/sim-worker.js). On the grids the step goes in the first direction
   k whose running total (w_1 + ... + w_k) / (all of them) is above
   u_n: that cuts (0, 1) into pieces, one per direction, each as long
   as its chance. Moving a weight a little only moves the cuts a
   little, so only the steps whose u_n sits near a cut change, and the
   walk changes little by little, the way the p slider moves Bernoulli
   percolation. (Each step changed sends the rest of the walk off in a
   new place, though, so a big change of a weight changes a lot.) On
   another tiling the step goes to neighbor number
   floor(u_n * the number of neighbors) of the cell's list.

   What it keeps track of, step by step:
     the position S_n and its distance |S_n| from the origin
     the largest distance so far, max_{k <= n} |S_k| (straight-line)
     the range R_n: how many different sites have been visited
     how many times the walk has come back to the origin
     each site's first visit (bornAt), for the holes and the colors
     for the convex hull, only the sites that could be on it:
       1D the lowest and highest site; 2D the lowest and highest site
       of each column x; 3D the lowest and highest z over each (x, y);
       on another tiling, the lowest and highest y for each (x, z)
       (those cells' middles lie on one line, in the block's step b)

   The file has these parts, with no drawing and no buttons:
     1. newWalk(options): the walk itself. The check page
        (random-walk-check.html) tests it in the browser.
     2. Its shape: the hull (2D: convexHull, js/sim-shape.js). The
        holes and the outer boundary are holeHistory and frontierLength
        (js/sim-shape.js).
     3. walkWorker(): runs a walk in a second thread (a "Web Worker")
        for the sim page, random-walk.js, so the page never freezes.
        startWorker (js/sim-page.js) starts it, with newWalk, the run
        loop, trace and random numbers (js/sim-worker.js), the hull,
        holes and outer boundary (js/sim-shape.js) and blockStart
        (js/sim-domains.js) copied in.
   ===================================================================== */


/* =====================================================================
   1. THE WALK
   ===================================================================== */

// Make a new walk. "options" has:
//   dim      1, 2 or 3
//   weights  one weight per direction (2, 4 or 6 numbers, at least 0,
//            not all 0), in the order at the top of this file
//   tiling   2D only, and only for another tiling than the squares: the
//            tiling's repeating block (uprightBlock, js/sim-tilings.js).
//            Then the weights are left out.
//   seed     the seed (any text)
// It returns an object whose step() moves the walker once, and whose
// fields say where it has been (see the end of this function).
function newWalk(options) {
  const dim = options.dim, tiling = options.tiling || null;
  // The 2d directions, as moves [dx, dy, dz], and the cuts (on the grids).
  const MOVES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].slice(0, 2 * dim);
  const cut = tiling ? null : cutsOf(options.weights, MOVES.length);
  const random = seededUniform(options.seed);

  // Every visited site gets a number, 0, 1, 2, ..., in the order it
  // was first visited. For site number i:
  const siteX = [], siteY = [], siteZ = [];
  const bornAt = [];            // the step it was first visited (0 for the origin)
  // A site's key, to look up its number: in 1D and 2D one whole number
  // (the walk stays within 2^21 of the origin, so x * 2^22 + y never
  // mixes two sites up); in 3D and on another tiling, text "x,y,z".
  function keyOf(x, y, z) { return dim === 3 || tiling ? x + "," + y + "," + z : x * 4194304 + y; }
  const numberOf = new Map();

  const w = {
    dim: dim,
    tiling: tiling,             // (null on the grids)
    x: 0, y: 0, z: 0,           // where the walker is now, S_n (on another tiling: block (x, y), cell z)
    steps: 0,                   // n
    distance: 0,                // |S_n|
    maxDistance: 0,             // max over k <= n of |S_k|
    returns: 0,                 // how many k in 1..n have S_k = 0
    lowest: 0, highest: 0,      // 1D: the lowest and highest site visited
    columns: new Map(),         // 2D: "x,z" -> [lowest y, highest y] (z is 0 on squares); 3D: "x,y" -> [lowest z, highest z]
    siteX: siteX, siteY: siteY, siteZ: siteZ, bornAt: bornAt,
    step: step,
    placeOf: placeOf,
  };
  const start = placeOf(0, 0, 0);

  // 2D: where site (x, y, z) is in the plane, in side lengths: on the
  // square grid (x, y) itself; on another tiling the middle of cell z
  // of block (x, y) (blockStart, js/sim-domains.js: the walk carries its
  // tiling the way a domain does).
  function placeOf(x, y, z) {
    if (!tiling) return [x, y];
    const [u, v] = blockStart(w, x, y), middle = tiling.cells[z].middle;
    return [u + middle[0], v + middle[1]];
  }

  // The walker is at (x, y, z) at step n: note the site, if it is new.
  function visit(x, y, z, n) {
    const key = keyOf(x, y, z);
    if (numberOf.has(key)) return;
    numberOf.set(key, siteX.length);
    siteX.push(x); siteY.push(y); siteZ.push(z); bornAt.push(n);
    if (dim === 1) {
      w.lowest = Math.min(w.lowest, x);
      w.highest = Math.max(w.highest, x);
    } else {
      const columnKey = dim === 2 ? x + "," + z : x + "," + y, height = dim === 2 ? y : z;
      const column = w.columns.get(columnKey);
      if (!column) w.columns.set(columnKey, [height, height]);
      else { column[0] = Math.min(column[0], height); column[1] = Math.max(column[1], height); }
    }
  }

  // On the grids: the direction for a uniform u, the first whose cut is
  // above u, and the move.
  function moveOnGrid(u) {
    let k = 0;
    while (cut[k] <= u) k++;
    w.x += MOVES[k][0]; w.y += MOVES[k][1]; w.z += MOVES[k][2];
  }

  // On another tiling: to one of the cell's neighbors, all equally
  // likely, neighbor number floor(u * how many) of its list "next".
  function moveOnTiling(u) {
    const next = tiling.cells[w.z].next, [z, dx, dy] = next[Math.floor(u * next.length)];
    w.x += dx; w.y += dy; w.z = z;
  }

  // |S_n|: how far the walker is from where it started (on another
  // tiling, from the middle of the first cell to the middle of this one).
  function distanceNow() {
    if (!tiling) return Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
    const [u, v] = placeOf(w.x, w.y, w.z);
    return Math.sqrt((u - start[0]) * (u - start[0]) + (v - start[1]) * (v - start[1]));
  }

  // One step: move as u_n says (see the top of this file), then update
  // the numbers and note the site.
  function step() {
    const n = w.steps + 1, u = random.uniform(n);
    if (tiling) moveOnTiling(u); else moveOnGrid(u);
    w.steps = n;
    w.distance = distanceNow();
    w.maxDistance = Math.max(w.maxDistance, w.distance);
    if (w.x === 0 && w.y === 0 && w.z === 0) w.returns += 1;
    visit(w.x, w.y, w.z, n);
  }

  visit(0, 0, 0, 0);
  return w;
}

// The cuts for these weights, one per direction ("count" of them):
// cut[k] = (w_1 + ... + w_(k+1)) / (all of them), the last one 1.
// Says what is wrong if the weights can't be used.
function cutsOf(weights, count) {
  if (weights.length !== count) throw new Error("There should be " + count + " weights.");
  let total = 0;
  for (const w of weights) {
    if (!(w >= 0)) throw new Error("Every weight must be a number, 0 or more.");
    total += w;
  }
  if (!(total > 0)) throw new Error("At least one weight must be above 0.");
  const cut = [];
  let sum = 0;
  for (const w of weights) { sum += w; cut.push(sum / total); }
  cut[cut.length - 1] = 1;
  return cut;
}


/* =====================================================================
   2. THE SHAPE OF THE VISITED SITES
   ===================================================================== */

// 2D: the convex hull of the visited sites (the smallest convex set
// holding them, its sides straight lines between sites; on another
// tiling, between the middles of the cells): its corners, perimeter and
// area. Only the lowest and highest site of each column can be a
// corner, so only those go to convexHull (js/sim-shape.js).
function walkHull(w) {
  const points = [];
  for (const [key, [low, high]] of w.columns) {
    const [x, z] = key.split(",").map(Number);
    points.push(w.placeOf(x, low, z));
    if (high > low) points.push(w.placeOf(x, high, z));
  }
  const corners = convexHull(points);
  return { corners: corners, perimeter: polygonPerimeter(corners), area: polygonArea(corners) };
}

// 3D: the sites that can be corners of the hull (the lowest and highest
// over each (x, y)), as x0, y0, z0, x1, ... The page finds the hull of
// these with three.js.
function hullCandidates3D(w) {
  const points = [];
  for (const [key, [low, high]] of w.columns) {
    const [x, y] = key.split(",").map(Number);
    points.push(x, y, low);
    if (high > low) points.push(x, y, high);
  }
  return points;
}


/* =====================================================================
   3. THE WALK IN A SECOND THREAD
   ---------------------------------------------------------------------
   The page sends:
     { type: "setup", run, dim, weights, tiling, seed, steps }
         a new walk (newWalk's options), walked at once to "steps"
         steps with the same seed (so changing a weight keeps the step
         you were at)
     { type: "play", speed }   "speed" steps per second
                               (Infinity = as fast as possible)
     { type: "pause" }
     { type: "step" }          one step
     { type: "goto", steps }   jump to that step (back or forward)

   The worker answers with "state" messages: the numbers for the
   Statistics box (on another tiling, with "place": where the walker's
   cell's middle is), the samples for the charts, and the sites visited
   since its last message (the page keeps them all). Each carries its
   run number, so the page can ignore leftovers from an older run.
   ===================================================================== */
function walkWorker() {
  const MAX_STEPS = 2000000;    // two million steps at most
  let options = null;           // the latest setup message
  let walk = null;              // from newWalk() (part 1)
  let run = 0;
  let problem = "";             // e.g. "At least one weight must be above 0."
  let trace = null;             // the run so far, for the charts over time (newTrace, js/sim-worker.js)
  let sitesSent = 0;            // the sites the page already has
  let pathSent = 0;             // 1D: the positions the page already has
  let path = [];                // 1D: the position at every step
  // 2D: the outer boundary's length, worked out at steps about 10% apart
  // (a log-log chart needs no more): at frontierSteps[k] it was
  // frontierValues[k].
  let frontierSteps = [], frontierValues = [], frontierNext = 1;
  // 2D: the holes (holeHistory, js/sim-shape.js). Worked out again for
  // each message, but while playing at most a fifth of the time.
  let holes = null, holesStep = -1, holesFree = 0;

  // Start again from the origin, and walk to "steps" steps.
  function setup(steps) {
    problem = "";
    sitesSent = pathSent = 0;
    path = [0];
    frontierSteps = []; frontierValues = []; frontierNext = 1;
    holes = null; holesStep = -1;
    try {
      walk = newWalk(options);
    } catch (error) {
      walk = null;
      problem = error.message;
      return;
    }
    trace = newTrace();
    takeSample();
    while (walk.steps < steps && !isDone()) oneStep();
  }

  function isDone() { return walk !== null && walk.steps >= MAX_STEPS; }

  function oneStep() {
    if (!walk || isDone()) return;
    walk.step();
    if (walk.dim === 1) path.push(walk.x);
    if (walk.dim === 2 && walk.steps >= frontierNext) keepFrontier();
    takeSample();
  }

  // 2D: the outer boundary's length now, for its chart.
  function keepFrontier() {
    frontierSteps.push(walk.steps);
    frontierValues.push(frontierLength(walk));
    frontierNext = Math.ceil(walk.steps * 1.1);
  }

  function takeSample() {
    const w = walk;
    if (w.steps < trace.next) return;
    const values = { distance: w.distance, maxDistance: w.maxDistance, range: w.siteX.length, returns: w.returns };
    if (w.dim === 2) {
      const hull = walkHull(w);
      values.perimeter = hull.perimeter;
      values.area = hull.area;
    }
    keepSample(trace, w.steps, values);
  }

  // Play, Pause and Speed: the run loop (js/sim-worker.js).
  const loop = makeRunLoop(oneStep, report, isDone);

  self.onmessage = function (event) {
    const message = event.data;
    if (message.type === "setup") {
      options = message;
      run = message.run;
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
    } else if (message.type === "goto") {
      if (walk && message.steps < walk.steps) setup(message.steps);
      else while (walk && walk.steps < message.steps && !isDone()) oneStep();
      report();
    }
  };

  // Send the page the numbers, the charts' samples, and the sites (and
  // in 1D the positions) new since the last message.
  function report() {
    const w = walk;
    if (!w) {
      self.postMessage({ type: "state", run: run, problem: problem });
      return;
    }
    const lists = trace.lists;
    const message = {
      type: "state", run: run, problem: "", dim: w.dim,
      steps: w.steps, x: w.x, y: w.y, z: w.z, place: w.tiling ? w.placeOf(w.x, w.y, w.z) : null,
      distance: w.distance, maxDistance: w.maxDistance, range: w.siteX.length, returns: w.returns,
      lowest: w.lowest, highest: w.highest,
      atMax: isDone(),
      traceSteps: Float64Array.from(trace.times),
      traceDistance: Float64Array.from(lists.distance),
      traceMaxDistance: Float64Array.from(lists.maxDistance),
      traceRange: Float64Array.from(lists.range),
      traceReturns: Float64Array.from(lists.returns),
    };
    addNewSites(message);
    if (w.dim === 1) addNewPath(message);
    if (w.dim === 2) { addShape2D(message); addHoles(message); }
    if (w.dim === 3) message.hullPoints = Float64Array.from(hullCandidates3D(w));
    self.postMessage(message);
  }

  // The sites new since the last message: site numbers sitesFrom on.
  function addNewSites(message) {
    const w = walk;
    message.sitesFrom = sitesSent;
    message.siteX = Int32Array.from(w.siteX.slice(sitesSent));
    message.siteY = Int32Array.from(w.siteY.slice(sitesSent));
    message.siteZ = Int32Array.from(w.siteZ.slice(sitesSent));
    message.bornAt = Int32Array.from(w.bornAt.slice(sitesSent));
    sitesSent = w.siteX.length;
  }

  // 1D: the positions new since the last message: steps pathFrom on.
  function addNewPath(message) {
    message.pathFrom = pathSent;
    message.path = Int32Array.from(path.slice(pathSent));
    pathSent = path.length;
  }

  // 2D: the hull now and over time, and the outer boundary over time.
  function addShape2D(message) {
    message.hull = walkHull(walk);
    message.tracePerimeter = Float64Array.from(trace.lists.perimeter);
    message.traceArea = Float64Array.from(trace.lists.area);
    message.frontierSteps = Float64Array.from(frontierSteps);
    message.frontierValues = Float64Array.from(frontierValues);
  }

  // 2D: the holes now, their births and deaths, their sizes, and beta_1
  // at the times of the charts' samples (as in Eden Growth).
  function addHoles(message) {
    const w = walk, now = performance.now();
    if (holesStep !== w.steps && (!loop.playing || now >= holesFree)) {
      holes = holeHistory(w, w.steps);
      holesStep = w.steps;
      holesFree = now + 4 * (performance.now() - now);
    }
    const times = trace.times.filter(function (t) { return t <= holesStep; });
    message.holes = {
      step: holesStep, now: holes.openBirths.length, closed: holes.deaths.length,
      births: Float64Array.from(holes.births), deaths: Float64Array.from(holes.deaths),
      cells: Int32Array.from(holes.holeCells), sizes: Int32Array.from(holes.holeSizes),
      times: Float64Array.from(times), beta: bettiOverTime(holes, times),
    };
  }
}
