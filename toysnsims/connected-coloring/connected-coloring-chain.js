/* =====================================================================
   connected-coloring-chain.js  —  the Markov chain behind the
   "Random connected coloring" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     The domain is a graph (the cells, joined to their neighbors). A
     "connected N-coloring" gives every cell one of N colors so that
     each color is used and forms one connected piece. This file runs a
     Markov chain whose long-run distribution is UNIFORM over all
     connected N-colorings: in the long run, every such coloring is
     equally likely.

   One move of the chain (ReCom, "recombination", from DeFord, Duchin &
   Solomon, Harvard Data Science Review 3(1), 2021,
   doi:10.1162/99608f92.eb30390f), with a Metropolis-Hastings correction:
     1. Pick a pair of colors i, j that touch, uniformly among the
        A(X) touching pairs of the current coloring X.
     2. Merge them: M = C_i u C_j (it is connected, since C_i and C_j
        each are, and they touch).
     3. Draw a uniformly random spanning tree T of M, with Wilson's
        algorithm (D. B. Wilson, "Generating random spanning trees more
        quickly than the cover time", STOC 1996, doi:10.1145/237814.237880).
     4. Cut a uniformly random edge of T. A tree minus one edge falls into
        exactly two connected pieces, P and Q.
     5. Toss a fair coin: heads, P gets color i and Q gets j; tails, the
        other way round. Call the new coloring Y.
     6. Accept Y with probability
          alpha = min(1,  A(X)/A(Y)  *  tau(C_i) tau(C_j) / (tau(P) tau(Q))
                              *  k(C_i, C_j) / k(P, Q) ),
        otherwise keep X. Here tau(S) is the number of spanning trees of
        the cells S, and k(S, R) is the number of edges joining S to R.

   Why this alpha makes the chain uniform. A spanning tree of M with one
   chosen edge that splits M into {P, Q} is the same thing as a spanning
   tree of P, a spanning tree of Q, and one edge joining them. So step 4
   splits M into {P, Q} with probability
          tau(P) tau(Q) k(P, Q) / ( tau(M) (|M| - 1) ),
   and the proposal probability is
          q(X -> Y) = 1/A(X) * 1/2 * tau(P) tau(Q) k(P, Q) / ( tau(M) (|M| - 1) ).
   The move back from Y to X merges the same M, so q(Y -> X) is the same
   with C_i, C_j and A(Y) in place of P, Q and A(X). The Metropolis-
   Hastings rule (Metropolis, Rosenbluth, Rosenbluth, Teller & Teller,
   J. Chem. Phys. 21 (1953) 1087, doi:10.1063/1.1699114; Hastings,
   Biometrika 57 (1970) 97, doi:10.1093/biomet/57.1.97) for a uniform
   target accepts with min(1, q(Y -> X) / q(X -> Y)), which is the alpha
   above: tau(M) and |M| - 1 cancel. The coin in step 5 matters: without
   it, which piece gets color i depends on where Wilson's walk was
   rooted, and the formula for q would be wrong.

   tau(S) comes from Kirchhoff's matrix-tree theorem, and the random
   spanning tree from Wilson's algorithm. Both are shared with the
   Uniform Spanning Tree sim, in js/sim-spanning.js (newTreeCounter and
   newWilson), which says how they work.

   The one library used is seedrandom
   (https://github.com/davidbau/seedrandom), for random numbers that
   repeat exactly when the same seed is used.

   HOW IT RUNS
   The whole chain is one function, chainWorker(). The sim page
   (connected-coloring.js) turns that function into a "Web Worker": a
   second thread that runs the chain without freezing the page, with
   newWilson and newTreeCounter (js/sim-spanning.js) copied in. The page
   and the worker talk by sending each other messages (section 4), as
   every sim's do.

   The file is split into numbered sections, all inside chainWorker():
     1. The state of the chain
     2. One move of the chain
     3. The random spanning tree, and cutting it
     4. Messages from the page
   ===================================================================== */

function chainWorker() {
  // seedrandom adds Math.seedrandom(seed): a random-number function that
  // gives the same numbers every time for the same seed. The version
  // number is fixed so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");


  /* ===================================================================
     1. THE STATE OF THE CHAIN
     -------------------------------------------------------------------
     The domain is a graph with n cells numbered 0 .. n-1. The neighbors
     of cell v are  nbr[first[v]], nbr[first[v] + 1], ..., nbr[first[v + 1] - 1]
     (one long list, cut into pieces by "first"; this is the usual
     compact way to store a graph, called CSR).
     =================================================================== */
  let n = 0;               // number of cells
  let first = null;        // where each cell's neighbors start in nbr
  let nbr = null;          // all the neighbor lists, one after another
  let N = 0;               // number of colors
  let color = null;        // color[v] = color of cell v, 0 .. N-1
  let between = null;      // between[i*N + j] (i < j) = edges joining colors i and j
  let pairs = 0;           // A(X): how many pairs of colors touch
  let boundary = 0;        // edges whose two ends have different colors
  let logTau = null;       // logTau[c] = log(number of spanning trees of color c)
  let random = Math.random;
  let proposed = 0;        // moves tried
  let accepted = 0;        // moves accepted
  let sweeps = 1;          // flips before each move, in sweeps (1 sweep = n flips; section 2b)
  let flips = 0, flipped = 0;   // flips tried, and flips accepted
  let stale = null;        // stale[c]: a flip changed color c, so logTau[c] must be worked out again
  let seen = null, seenStamp = 0;   // marks for the flips' connectivity check
  let boundaryTrace = null;   // the boundary edges against the moves accepted, for the chart (keepSample, js/sim-worker.js)
  let alphaTrace = null;      // each move's acceptance probability alpha, against the move number, for the chart
  let alphaSum = 0;           // the sum of every move's alpha, for their average
  let film = null;         // "watch each move": what this move did, for the page to show (section 4)

  // Scratch space, one number per cell, reused by every move.
  // A "stamp" array marks cells by writing the current stamp number into
  // them; bumping the number un-marks every cell at once, for free.
  let inM;                 // a stamp array: inM[v] === mStamp when v is in M
  let mStamp = 0;
  let side, oldColor, newColor, path;
  let wilson = null;       // Wilson's algorithm on the cells of M (newWilson, js/sim-spanning.js)
  let treeCounter = null;  // counts spanning trees (newTreeCounter, js/sim-spanning.js)

  function setup(message) {
    n = message.n;
    first = message.first;
    nbr = message.nbr;
    N = message.N;
    color = Int32Array.from(message.colors);
    random = new Math.seedrandom(String(message.seed));
    proposed = 0;
    accepted = 0;
    flips = flipped = 0;
    sweeps = message.sweeps;
    seen = new Int32Array(n);
    stale = new Uint8Array(N);

    inM = new Int32Array(n);
    side = new Int8Array(n);
    oldColor = new Int32Array(n); newColor = new Int32Array(n);
    path = new Int32Array(n);
    wilson = newWilson(n, randomNeighborInM);
    treeCounter = newTreeCounter(n, first, nbr);

    // Count the edges between each pair of colors.
    between = new Int32Array(N * N);
    pairs = 0;
    boundary = 0;
    for (let v = 0; v < n; v++) {
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (w < v || color[w] === color[v]) continue;   // each edge once; same color isn't a boundary
        const key = pairKey(color[v], color[w]);
        if (between[key] === 0) pairs++;
        between[key]++;
        boundary++;
      }
    }

    // The spanning trees of each color, remembered from move to move.
    logTau = new Float64Array(N);
    for (let c = 0; c < N; c++) logTau[c] = treeCounter.logCount(cellsOfColor(c));

    // The charts start with the start's boundary edges.
    boundaryTrace = newTrace(message.most);
    alphaTrace = newTrace(message.most);
    alphaSum = 0;
    keepSample(boundaryTrace, 0, { boundary: boundary });
  }

  // After each move, samples for the charts: its alpha, against the
  // move number, and the boundary edges, against the moves accepted.
  function takeSamples(alpha) {
    alphaSum += alpha;
    keepSample(alphaTrace, proposed, { alpha: alpha });
    keepSample(boundaryTrace, accepted, { boundary: boundary });
  }

  // Where the pair of colors a, b is stored in "between".
  function pairKey(a, b) { return a < b ? a * N + b : b * N + a; }

  function cellsOfColor(c) {
    const cells = [];
    for (let v = 0; v < n; v++) if (color[v] === c) cells.push(v);
    return cells;
  }


  /* ===================================================================
     2. ONE MOVE OF THE CHAIN (steps 1-6 at the top of the file)
     =================================================================== */
  function oneMove() {
    for (let k = Math.round(sweeps * n); k > 0; k--) oneFlip();   // the flips first (section 2b)
    if (film) film.before = color.slice();
    proposed++;

    // Step 1: the touching pairs of colors, and one picked at random.
    const touching = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) if (between[i * N + j] > 0) touching.push(i * N + j);
    }
    if (touching.length === 0) return;   // only possible with a single color
    const key = touching[Math.floor(random() * touching.length)];
    const i = Math.floor(key / N), j = key % N;
    if (film) film.pair = [i, j];
    for (const c of [i, j]) {                  // flips changed these colors: count their trees again
      if (stale[c]) { logTau[c] = treeCounter.logCount(cellsOfColor(c)); stale[c] = 0; }
    }
    const pairsBefore = pairs;                 // A(X)
    const kBefore = between[key];              // k(C_i, C_j)

    // Step 2: M = the cells of color i or j, marked in inM.
    mStamp++;
    const M = [];
    for (let v = 0; v < n; v++) {
      if (color[v] === i || color[v] === j) { M.push(v); inM[v] = mStamp; }
    }

    // Steps 3 and 4: a random spanning tree of M, cut at a random edge.
    // Every cell except the root has exactly one tree edge going up to
    // its parent, so a random edge = the edge above a random non-root cell.
    const root = M[Math.floor(random() * M.length)];
    randomSpanningTree(M, root);
    let cut;
    do { cut = M[Math.floor(random() * M.length)]; } while (cut === root);
    markPieceBelow(M, cut);                    // side[v] = 1 in P (below the cut), 2 in Q
    if (film) { film.root = root; film.cut = [cut, wilson.parent[cut]]; }

    // Step 5: the fair coin decides which piece gets color i.
    const colorP = random() < 0.5 ? i : j;
    const colorQ = (colorP === i) ? j : i;
    let changed = 0;
    for (const v of M) {
      oldColor[v] = color[v];
      newColor[v] = (side[v] === 1) ? colorP : colorQ;
      if (newColor[v] !== color[v]) changed++;
    }
    if (film) film.proposal = M.map(function (v) { return [v, newColor[v]]; });
    if (changed === 0) {                       // Y = X: alpha = 1 and nothing moves
      accepted++;
      if (film) { film.alpha = 1; film.accepted = true; }
      takeSamples(1);
      return;
    }

    // Step 6: recolor for real, measure Y, then keep it or put X back.
    recolor(M, newColor);
    const pairsAfter = pairs;                  // A(Y)
    const kAfter = between[key];               // k(P, Q)
    const newI = M.filter(function (v) { return color[v] === i; });
    const newJ = M.filter(function (v) { return color[v] === j; });
    const logTauI = treeCounter.logCount(newI);
    const logTauJ = treeCounter.logCount(newJ);

    const logAlpha = Math.log(pairsBefore) - Math.log(pairsAfter)
                   + (logTau[i] + logTau[j]) - (logTauI + logTauJ)
                   + Math.log(kBefore) - Math.log(kAfter);
    const alpha = Math.min(1, Math.exp(logAlpha));

    const accept = logAlpha >= 0 || Math.log(random()) < logAlpha;
    if (film) { film.alpha = alpha; film.accepted = accept; }
    if (accept) {
      logTau[i] = logTauI;
      logTau[j] = logTauJ;
      accepted++;
    } else {
      recolor(M, oldColor);                  // rejected: back to X
    }
    takeSamples(alpha);
  }


  /* ===================================================================
     2b. SINGLE-CELL FLIPS
     -------------------------------------------------------------------
     Before each move above, the chain makes "sweeps" x n flips. A flip
     picks a uniformly random cell v and a uniformly random neighbor w of
     v, and proposes giving v the color of w. With
       a = how many neighbors of v have v's color now, and
       b = how many have w's color,
     the chance of proposing this flip is (1/n)(b/deg v), and of the flip
     back (1/n)(a/deg v), so the Metropolis-Hastings rule for the uniform
     target accepts with min(1, a/b). The flip only happens if v's old
     color stays one connected piece without v (v's new color stays
     connected, since v touches it). Every flip and every move keeps the
     uniform distribution, so doing them in a fixed order does too. The
     flips roughen the borders cheaply; the moves make the big changes.
     =================================================================== */
  function oneFlip() {
    flips++;
    const v = Math.floor(random() * n);
    const start = first[v], degree = first[v + 1] - start;
    const c = color[nbr[start + Math.floor(random() * degree)]], old = color[v];
    if (c === old) return;
    let a = 0, b = 0;
    for (let e = start; e < first[v + 1]; e++) {
      if (color[nbr[e]] === old) a++;
      else if (color[nbr[e]] === c) b++;
    }
    if (a > b && random() >= b / a) return;   // rejected (min(1, a/b) < 1)
    if (a === 0 || !staysConnected(v, old)) return;   // v alone in its color, or v holds it together
    mStamp++;
    inM[v] = mStamp;
    newColor[v] = c;
    recolor([v], newColor);
    stale[old] = stale[c] = 1;
    flipped++;
  }

  // Do the cells of color "old" next to v stay connected without v? A
  // search from one of them through color "old", never entering v,
  // stopping once it has found them all.
  function staysConnected(v, old) {
    seenStamp++;
    seen[v] = seenStamp;
    let wanted = 0, startCell = -1;
    for (let e = first[v]; e < first[v + 1]; e++) {
      const w = nbr[e];
      if (color[w] !== old || seen[w] === seenStamp) continue;
      seen[w] = seenStamp;                    // (counted once, even if a neighbor repeats)
      wanted++;
      startCell = w;
    }
    seenStamp++;
    seen[v] = seenStamp;
    seen[startCell] = seenStamp;
    const queue = [startCell];
    let found = 0;
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      if (isNeighbor(u, v)) found++;
      if (found === wanted) return true;
      for (let e = first[u]; e < first[u + 1]; e++) {
        const w = nbr[e];
        if (color[w] === old && seen[w] !== seenStamp) { seen[w] = seenStamp; queue.push(w); }
      }
    }
    return false;
  }

  function isNeighbor(u, v) {
    for (let e = first[v]; e < first[v + 1]; e++) if (nbr[e] === u) return true;
    return false;
  }

  // Give each cell v of "cells" the color target[v], keeping between,
  // pairs and boundary up to date. Only edges touching "cells" can
  // change, so only those are taken out and put back.
  // ("cells" is always M, the cells marked in inM.)
  function recolor(cells, target) {
    countEdges(cells, -1);
    for (const v of cells) color[v] = target[v];
    countEdges(cells, +1);
  }

  // Add (sign = +1) or remove (sign = -1) every edge touching "cells".
  function countEdges(cells, sign) {
    for (const v of cells) {
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (inM[w] === mStamp && w < v) continue;   // both ends in M: count it once
        if (color[w] === color[v]) continue;
        const key = pairKey(color[v], color[w]);
        if (sign < 0 && between[key] === 1) pairs--;   // this pair stops touching
        if (sign > 0 && between[key] === 0) pairs++;   // this pair starts touching
        between[key] += sign;
        boundary += sign;
      }
    }
  }


  /* ===================================================================
     3. THE RANDOM SPANNING TREE, AND CUTTING IT
     =================================================================== */

  // A uniformly random spanning tree of the cells of M ("cells", marked
  // in inM), as wilson.parent: Wilson's algorithm (newWilson,
  // js/sim-spanning.js), each walk stepping to a random neighbor inside
  // M. While watching each move, every walk is kept, cell by cell, from
  // its start to the cell where it hits the tree (film.walks), so the
  // page can show it again.
  function randomSpanningTree(cells, root) {
    wilson.start([root], cells);
    if (!film) { wilson.finish(); return; }
    film.walks = [];
    for (let v = wilson.step(); v !== -1; v = wilson.step()) {
      if (wilson.newWalk) film.walks.push([v]);
      else film.walks[film.walks.length - 1].push(v);
    }
  }

  // A uniformly random neighbor of v inside M. Pick any neighbor and
  // try again if it's outside M: every neighbor inside M is equally
  // likely to come out.
  function randomNeighborInM(v) {
    const start = first[v], count = first[v + 1] - start;
    for (;;) {
      const w = nbr[start + Math.floor(random() * count)];
      if (inM[w] === mStamp) return w;
    }
  }

  // Cutting the tree edge from "cut" up to its parent splits M in two.
  // side[v] = 1 if v is below the cut (its way up to the root passes
  // through "cut"), and 2 otherwise. Walk up from each cell until a cell
  // whose side is already known; everything on the way has that side.
  function markPieceBelow(cells, cut) {
    for (const v of cells) side[v] = 0;
    side[cut] = 1;
    for (const u of cells) {
      let length = 0, v = u;
      while (side[v] === 0) {
        if (wilson.parent[v] === -1) { side[v] = 2; break; }   // the root is never below the cut
        path[length++] = v;
        v = wilson.parent[v];
      }
      for (let k = 0; k < length; k++) side[path[k]] = side[v];
    }
  }


  /* ===================================================================
     4. MESSAGES FROM THE PAGE
     -------------------------------------------------------------------
     The worker talks to the page the way every sim's worker does
     (serveRun, js/sim-worker.js). Its own messages:
       setup  { n, first, nbr, colors, N, seed, watch, sweeps, most }   a new run
                        ("watch": is "watch each move" on? "most": the
                        most samples each chart keeps)
       watch  { on }    "watch each move" on or off
       sweeps { sweeps }   flips before each move, in sweeps (section 2b)
       next   {}        (watching) the page has shown the last move
     It reports the colors, the numbers for the Statistics box, and the
     run so far for the two charts (the boundary edges, and the
     acceptance probability alpha of the moves, with its average).

     Watching each move, each move also sends what it did ("film": the
     two colors, every walk of Wilson's algorithm, the root, the cut
     edge, the proposed colors, alpha, and accepted or not), and the
     next move waits until the page has shown this one and sends
     "next". The moves are the same as without watching: the same seed
     gives the same run.
     =================================================================== */
  let watching = false;    // "watch each move" is on
  let showing = false;     // watching: the page is still showing the last move
  let lastReported = -1;   // the move count last sent to the page

  // One step: one move, or, watching, one move with its film once the
  // page has shown the last one (until then it waits: false).
  function oneStep() {
    if (watching && showing) return false;
    film = watching ? {} : null;
    oneMove();
    showing = watching;
  }

  function report(send) {
    if (proposed === lastReported) return;   // nothing new to show
    lastReported = proposed;
    const copy = color.slice();
    send({
      colors: copy,
      proposed: proposed,
      accepted: accepted,
      flips: flips,
      flipped: flipped,
      boundary: boundary,
      pairs: pairs,
      boundaryTimes: Float64Array.from(boundaryTrace.times),
      boundaryValues: Float64Array.from(boundaryTrace.lists.boundary),
      alphaTimes: Float64Array.from(alphaTrace.times),
      alphaValues: Float64Array.from(alphaTrace.lists.alpha || []),   // (none before the first move)
      alphaAverage: alphaSum / Math.max(proposed, 1),
      film: film,
    }, [copy.buffer]);
    film = null;
  }

  serveRun({
    setup: function (message) {
      setup(message);
      watching = message.watch;
      showing = false;
      lastReported = -1;
    },
    steps: oneStep, report: report,
    messages: {
      watch: function (message) { watching = message.on; showing = false; },
      sweeps: function (message) { sweeps = message.sweeps; },
      next: function () { showing = false; },
    },
  });
}
