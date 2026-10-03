/* =====================================================================
   random-walk-colouring-walk.js  —  the walkers behind the "Random walk
   colouring" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     N random walkers move on the domain (a graph: the cells, joined to
     their neighbours). Walker i carries colour i. Every cell keeps the
     colour of the first walker to land on it, and keeps it for good.
     The run ends when every cell is coloured (the "cover time").

   Each step of a walker goes to a uniformly chosen neighbour of its
   cell (so a cell on the edge of a box, with 3 neighbours, picks each
   with probability 1/3). This is the simple random walk on the graph.

   Two models:

   1. DISCRETE TIME. At each step n = 1, 2, 3, ... every walker moves
      once, all at the same moment. Then each uncoloured cell that is
      now occupied takes the colour of one of the walkers on it, chosen
      uniformly. This is done as in nadya's Python
      (RandomColoredWalkOnLTaurus): put the walkers in a uniformly random
      order, and let them claim their cells in that order; the first one
      to reach an uncoloured cell gets it. Every walker on a cell is
      equally likely to come first in a random order, so the choice is
      uniform. The random order is the Fisher-Yates shuffle (D. E. Knuth,
      "The Art of Computer Programming", Vol. 2, 3rd ed., 1997,
      Section 3.4.2, Algorithm P).

   2. CONTINUOUS TIME. Each walker has its own clock that rings at rate
      1 (exponential waiting times with mean 1), and moves one step when
      it rings. The first of N independent Exp(1) clocks rings after an
      Exp(N) time, it is equally likely to be any of the N, and which one
      it is does not depend on when (J. R. Norris, "Markov Chains",
      Cambridge University Press, 1997, Theorem 2.3.3). Exponential
      clocks have no memory (same book, Theorem 2.3.1), so after a ring
      all N clocks are again fresh Exp(1) clocks. So the run is:
          wait an Exp(N) time, pick a uniform walker, move it one step,
      over and over. Two clocks never ring at the same moment
      (probability 0), so no tie-breaking is needed after the start.
      This is how nadya's Python merges the two clocks
      (RandomColoredWalk.py, RandomColoredWalkFinal.py).

   The start, in both models: every cell with walkers on it takes the
   colour of one of them, chosen uniformly (the same random order).

   Random numbers. The library seedrandom
   (https://github.com/davidbau/seedrandom) gives random numbers that
   repeat exactly for the same seed. Each walker has its own stream, used
   only for its own steps, so walker i's k-th step uses the same random
   number in both models: with the same seed, the walkers follow the
   same paths in discrete and continuous time, and only the timing
   differs. The random orders and the clocks have streams of their own.

   HOW IT RUNS
   The whole thing is one function, walkWorker(). The sim page
   (random-walk-colouring.js) turns it into a "Web Worker": a second
   thread, so the page never freezes. The page and the worker talk by
   sending each other messages (section 4).

   The file is split into numbered sections, all inside walkWorker():
     1. The state of the walkers
     2. Claiming cells
     3. One step of each model
     4. The run so far, for the plots over time
     5. Messages from the page, and the run loop
   ===================================================================== */

function walkWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");


  /* ===================================================================
     1. THE STATE OF THE WALKERS
     -------------------------------------------------------------------
     The domain has n cells numbered 0 .. n-1. The neighbours of cell v
     are nbr[first[v]], ..., nbr[first[v + 1] - 1].
     =================================================================== */
  let n = 0, first = null, nbr = null;
  let N = 0;               // number of walkers
  let model = "discrete";  // "discrete" or "continuous"
  let position = null;     // position[i] = the cell walker i is on
  let colour = null;       // colour[v] = colour of cell v, or -1 if not coloured yet
  let sizes = null;        // sizes[i] = number of cells of colour i
  let coloured = 0;        // number of coloured cells
  let interfaceEdges = 0;  // edges joining two cells of different colours
  let time = 0;            // discrete: steps so far; continuous: the time t
  let moves = 0;           // single walker steps so far
  let nextRing = 0;        // continuous time: when the next clock rings
  let coverTime = null;    // when the last cell was coloured
  let walkerRandom = [];   // walkerRandom[i] = walker i's own random numbers
  let orderRandom = null;  // random numbers for the random orders
  let clockRandom = null;  // random numbers for the clocks
  let order = null;        // the walkers in a random order (section 2)
  let run = 0;             // which run this is (the page numbers them)

  function setup(message) {
    n = message.n;
    first = message.first;
    nbr = message.nbr;
    N = message.starts.length;
    model = message.model;
    run = message.run;
    const seed = String(message.seed);

    walkerRandom = [];
    for (let i = 0; i < N; i++) walkerRandom.push(new Math.seedrandom(seed + " walker " + i));
    orderRandom = new Math.seedrandom(seed + " order");
    clockRandom = new Math.seedrandom(seed + " clock");

    position = Int32Array.from(message.starts);
    colour = new Int32Array(n).fill(-1);
    sizes = new Int32Array(N);
    order = new Int32Array(N);
    coloured = 0;
    interfaceEdges = 0;
    time = 0;
    moves = 0;
    coverTime = null;

    // The start: the walkers claim their own cells, in a random order.
    claimInRandomOrder();
    if (coloured === n) coverTime = 0;
    if (model === "continuous") nextRing = waitingTime();

    traceTimes = []; traceInterface = []; traceSizes = [];
    traceGap = 1;
    nextSample = 0;
    takeSample();
  }


  /* ===================================================================
     2. CLAIMING CELLS
     =================================================================== */

  // Cell v gets colour i. The interface is kept up to date as we go: an
  // edge starts joining two colours exactly when its second cell gets
  // coloured, so we look at v's neighbours that are already coloured.
  function claim(v, i) {
    colour[v] = i;
    sizes[i]++;
    coloured++;
    for (let e = first[v]; e < first[v + 1]; e++) {
      const c = colour[nbr[e]];
      if (c !== -1 && c !== i) interfaceEdges++;
    }
  }

  // Put the walkers in a uniformly random order (Fisher-Yates: for
  // k = N-1 down to 1, swap place k with a uniformly chosen place
  // 0 .. k), then let each claim its cell if nobody has. So among the
  // walkers on an uncoloured cell, each is equally likely to get it.
  function claimInRandomOrder() {
    for (let k = 0; k < N; k++) order[k] = k;
    for (let k = N - 1; k > 0; k--) {
      const j = Math.floor(orderRandom() * (k + 1));
      const t = order[k]; order[k] = order[j]; order[j] = t;
    }
    for (let k = 0; k < N; k++) {
      const i = order[k];
      if (colour[position[i]] === -1) claim(position[i], i);
    }
  }

  // Walker i steps to a uniformly chosen neighbour of its cell, using
  // its own random numbers.
  function stepWalker(i) {
    const v = position[i];
    const degree = first[v + 1] - first[v];
    if (degree > 0) position[i] = nbr[first[v] + Math.floor(walkerRandom[i]() * degree)];
    moves++;
  }

  // An Exp(N) waiting time: if U is uniform on (0, 1], then -log(U) / N
  // is exponential with rate N (Norris, Markov Chains, Section 2.3).
  // 1 - random() is in (0, 1], so the logarithm is never of 0.
  function waitingTime() {
    return -Math.log(1 - clockRandom()) / N;
  }


  /* ===================================================================
     3. ONE STEP OF EACH MODEL
     -------------------------------------------------------------------
     "One step" is one unit of time in both models: in discrete time,
     every walker moves once; in continuous time, the clocks run for one
     unit of time, in which each walker moves once on average.
     =================================================================== */
  function oneStep() {
    if (coloured === n) return;            // finished
    moveOn();
    takeSample();
  }

  // One unit of time of the current model.
  function moveOn() {
    if (model === "discrete") {
      for (let i = 0; i < N; i++) stepWalker(i);
      claimInRandomOrder();
      time++;
      if (coloured === n) coverTime = time;
    } else {
      const until = Math.floor(time) + 1;
      while (nextRing <= until) {
        time = nextRing;
        const i = Math.floor(clockRandom() * N);   // which clock rang
        stepWalker(i);
        if (colour[position[i]] === -1) {
          claim(position[i], i);
          if (coloured === n) { coverTime = time; return; }
        }
        nextRing = time + waitingTime();
      }
      time = until;
    }
  }


  /* ===================================================================
     4. THE RUN SO FAR, FOR THE PLOTS OVER TIME
     -------------------------------------------------------------------
     A "sample" is the time, the interface and the size of each colour.
     One is taken every traceGap steps. When there are more than
     MAX_SAMPLES, every other one is dropped and traceGap doubles, so a
     long run keeps evenly spaced samples from start to end.
     =================================================================== */
  const MAX_SAMPLES = 1000;
  let traceTimes = [], traceInterface = [], traceSizes = [];   // traceSizes: N numbers per sample
  let traceGap = 1;
  let nextSample = 0;

  function takeSample() {
    if (time < nextSample && coloured < n) return;
    traceTimes.push(time);
    traceInterface.push(interfaceEdges);
    for (let i = 0; i < N; i++) traceSizes.push(sizes[i]);
    nextSample = time + traceGap;
    if (traceTimes.length > MAX_SAMPLES) {
      traceTimes = traceTimes.filter(function (t, k) { return k % 2 === 0; });
      traceInterface = traceInterface.filter(function (t, k) { return k % 2 === 0; });
      traceSizes = traceSizes.filter(function (t, k) { return Math.floor(k / N) % 2 === 0; });
      traceGap *= 2;
    }
  }


  /* ===================================================================
     5. MESSAGES FROM THE PAGE, AND THE RUN LOOP
     -------------------------------------------------------------------
     The page sends:
       { type: "setup", run, n, first, nbr, starts, model, seed }   a new run
       { type: "play", speed }    run "speed" steps per second
                                  (Infinity = as fast as possible)
       { type: "pause" }
       { type: "step" }           one step
     The worker answers with "state" messages: the colours, where the
     walkers are, and the numbers for the Statistics quadrant. Each one
     carries its run number, so the page can ignore leftovers from an
     older run. It stops by itself when every cell is coloured.
     =================================================================== */
  let playing = false;
  let speed = 5;
  let owed = 0;            // steps due but not yet made
  let lastTick = 0;
  let timer = null;
  const TICK_BUDGET = 25;  // milliseconds of work between two reports

  self.onmessage = function (event) {
    const message = event.data;
    if (message.type === "setup") {
      stop();
      setup(message);
      report();
    } else if (message.type === "play") {
      speed = message.speed;
      if (!playing && coloured < n) {
        playing = true;
        owed = 0;
        lastTick = performance.now();
        timer = setTimeout(tick, 0);
      }
    } else if (message.type === "pause") {
      stop();
    } else if (message.type === "step") {
      oneStep();
      report();
    }
  };

  function stop() {
    playing = false;
    clearTimeout(timer);
  }

  // Make the steps that are due (at most TICK_BUDGET ms of work), send
  // the result to the page, and come back a moment later.
  function tick() {
    const now = performance.now();
    const until = now + TICK_BUDGET;
    if (speed === Infinity) {
      do oneStep(); while (coloured < n && performance.now() < until);
    } else {
      owed = Math.min(owed + speed * (now - lastTick) / 1000, speed);   // at most 1 second behind
      while (owed >= 1 && coloured < n && performance.now() < until) { oneStep(); owed--; }
    }
    lastTick = now;
    if (coloured === n) stop();
    report();
    if (playing) timer = setTimeout(tick, 10);
  }

  let lastReported = -1;
  function report() {
    if (time === lastReported && time > 0) return;   // nothing new to show
    lastReported = time;
    const colourCopy = colour.slice(), positionCopy = position.slice();
    self.postMessage({
      type: "state",
      run: run,
      colours: colourCopy,
      positions: positionCopy,
      sizes: sizes.slice(),
      coloured: coloured,
      interfaceEdges: interfaceEdges,
      time: time,
      moves: moves,
      done: coloured === n,
      coverTime: coverTime,
      traceTimes: Float64Array.from(traceTimes),
      traceInterface: Int32Array.from(traceInterface),
      traceSizes: Int32Array.from(traceSizes),
    }, [colourCopy.buffer, positionCopy.buffer]);   // hand the copies over instead of copying again
  }
}
