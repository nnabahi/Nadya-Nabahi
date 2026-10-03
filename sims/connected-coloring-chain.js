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

   tau(S) comes from Kirchhoff's Matrix-Tree Theorem (G. Kirchhoff,
   Annalen der Physik und Chemie 72 (1847) 497-508; see Godsil & Royle,
   "Algebraic Graph Theory", Springer 2001, Section 13.2): tau(S) is the
   determinant of the Laplacian matrix of S with one row and the matching
   column removed. That matrix is symmetric positive definite, so its
   determinant is the product of the squared diagonal entries of its
   Cholesky factor (Golub & Van Loan, "Matrix Computations", 4th ed.,
   Section 4.2). Numbering the cells in breadth-first order keeps every
   nonzero entry close to the diagonal (a "band" of width b), and a
   banded Cholesky factorization then costs about |S| b^2 steps instead
   of |S|^3 / 3 (same book, Section 4.3). Spanning-tree counts are huge,
   so everything is kept as logarithms.

   No library does these steps in JavaScript, so they are written out
   below. The one library used is seedrandom
   (https://github.com/davidbau/seedrandom), for random numbers that
   repeat exactly when the same seed is used.

   HOW IT RUNS
   The whole chain is one function, chainWorker(). The sim page
   (connected-coloring.js) turns that function into a "Web Worker": a
   second thread that runs the chain without freezing the page. The page
   and the worker talk by sending each other messages (section 5).

   The file is split into numbered sections, all inside chainWorker():
     1. The state of the chain
     2. One move of the chain
     3. Wilson's algorithm, and cutting the tree
     4. Counting spanning trees (log of a determinant)
     5. Messages from the page, and the run loop
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
  let size = null;         // size[c] = number of cells of color c
  let between = null;      // between[i*N + j] (i < j) = edges joining colors i and j
  let pairs = 0;           // A(X): how many pairs of colors touch
  let boundary = 0;        // edges whose two ends have different colors
  let logTau = null;       // logTau[c] = log(number of spanning trees of color c)
  let random = Math.random;
  let proposed = 0;        // moves tried
  let accepted = 0;        // moves accepted
  let run = 0;             // which run this is (the page numbers them)

  // Scratch space, one number per cell, reused by every move.
  // A "stamp" array marks cells by writing the current stamp number into
  // them; bumping the number un-marks every cell at once, for free.
  let inM, inTree, member, seen;   // stamp arrays
  let mStamp = 0, treeStamp = 0, memberStamp = 0, seenStamp = 0;
  let parent, next, side, oldColor, newColor, order, position, path;
  let band = new Float64Array(1024);   // the banded matrix (section 4); grows when needed

  function setup(message) {
    n = message.n;
    first = message.first;
    nbr = message.nbr;
    N = message.N;
    color = Int32Array.from(message.colors);
    random = new Math.seedrandom(String(message.seed));
    run = message.run;
    proposed = 0;
    accepted = 0;

    inM = new Int32Array(n); inTree = new Int32Array(n);
    member = new Int32Array(n); seen = new Int32Array(n);
    parent = new Int32Array(n); next = new Int32Array(n);
    side = new Int8Array(n);
    oldColor = new Int32Array(n); newColor = new Int32Array(n);
    order = new Int32Array(n); position = new Int32Array(n); path = new Int32Array(n);

    // Count the colors, and the edges between each pair of colors.
    size = new Int32Array(N);
    between = new Int32Array(N * N);
    pairs = 0;
    boundary = 0;
    for (let v = 0; v < n; v++) {
      size[color[v]]++;
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
    for (let c = 0; c < N; c++) logTau[c] = logSpanningTrees(cellsOfColor(c));
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
     Returns true if the move was accepted.
     =================================================================== */
  function oneMove() {
    proposed++;

    // Step 1: the touching pairs of colors, and one picked at random.
    const touching = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) if (between[i * N + j] > 0) touching.push(i * N + j);
    }
    if (touching.length === 0) return false;   // only possible with a single color
    const key = touching[Math.floor(random() * touching.length)];
    const i = Math.floor(key / N), j = key % N;
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

    // Step 5: the fair coin decides which piece gets color i.
    const colorP = random() < 0.5 ? i : j;
    const colorQ = (colorP === i) ? j : i;
    let changed = 0;
    for (const v of M) {
      oldColor[v] = color[v];
      newColor[v] = (side[v] === 1) ? colorP : colorQ;
      if (newColor[v] !== color[v]) changed++;
    }
    if (changed === 0) { accepted++; return true; }   // Y = X: alpha = 1 and nothing moves

    // Step 6: recolor for real, measure Y, then keep it or put X back.
    recolor(M, newColor);
    const pairsAfter = pairs;                  // A(Y)
    const kAfter = between[key];               // k(P, Q)
    const newI = M.filter(function (v) { return color[v] === i; });
    const newJ = M.filter(function (v) { return color[v] === j; });
    const logTauI = logSpanningTrees(newI);
    const logTauJ = logSpanningTrees(newJ);

    const logAlpha = Math.log(pairsBefore) - Math.log(pairsAfter)
                   + (logTau[i] + logTau[j]) - (logTauI + logTauJ)
                   + Math.log(kBefore) - Math.log(kAfter);

    if (logAlpha >= 0 || Math.log(random()) < logAlpha) {
      logTau[i] = logTauI;
      logTau[j] = logTauJ;
      accepted++;
      return true;
    }
    recolor(M, oldColor);                    // rejected: back to X
    return false;
  }

  // Give each cell v of "cells" the color target[v], keeping size,
  // between, pairs and boundary up to date. Only edges touching "cells"
  // can change, so only those are taken out and put back.
  // ("cells" is always M, the cells marked in inM.)
  function recolor(cells, target) {
    countEdges(cells, -1);
    for (const v of cells) {
      size[color[v]]--;
      color[v] = target[v];
      size[color[v]]++;
    }
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
     3. WILSON'S ALGORITHM, AND CUTTING THE TREE
     =================================================================== */

  // A uniformly random spanning tree of the cells marked in inM, as
  // parent[v] (the next cell on the way to the root). Wilson's algorithm:
  // start a random walk from a cell not yet in the tree and stop when it
  // hits the tree. Remembering only the LAST step out of each cell
  // erases the walk's loops; the loop-free path joins the tree. Repeat
  // until every cell is in the tree.
  function randomSpanningTree(cells, root) {
    treeStamp++;
    inTree[root] = treeStamp;
    parent[root] = -1;
    for (const u of cells) {
      let v = u;
      while (inTree[v] !== treeStamp) {        // walk until the tree is hit
        next[v] = randomNeighborInM(v);
        v = next[v];
      }
      v = u;
      while (inTree[v] !== treeStamp) {        // add the loop-erased path
        inTree[v] = treeStamp;
        parent[v] = next[v];
        v = next[v];
      }
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
        if (parent[v] === -1) { side[v] = 2; break; }   // the root is never below the cut
        path[length++] = v;
        v = parent[v];
      }
      for (let k = 0; k < length; k++) side[path[k]] = side[v];
    }
  }


  /* ===================================================================
     4. COUNTING SPANNING TREES: log tau(S)
     -------------------------------------------------------------------
     tau(S) = det(L), where L is the Laplacian of S (degree on the
     diagonal, -1 for each edge) with one cell's row and column removed.
     Steps:
       a. Number the cells in breadth-first order, starting from a cell
          far from the middle, so neighbors get nearby numbers.
       b. Drop the last cell; build L, keeping only its band: the
          entries at most b places left of the diagonal (b = the largest
          gap in numbers between two neighbors). The rest are zero.
       c. Cholesky: L = R R^T with R lower triangular and inside the same
          band. Then det L = (product of R's diagonal)^2, so
          log det L = sum of log(R[p][p]^2).
     Row p of the band is stored as band[p * width + (p - q)] for the
     entries q = p - b, ..., p of that row (width = b + 1).
     =================================================================== */
  function logSpanningTrees(cells) {
    const m = cells.length - 1;          // size of the matrix L
    if (m <= 0) return 0;                // one cell: one tree, and log 1 = 0
    memberStamp++;
    for (const v of cells) member[v] = memberStamp;

    // a. Breadth-first order, twice: the last cell of the first search
    //    is far from where it started, a good place to start the second.
    const count = breadthFirstOrder(cells[0]);
    if (count !== cells.length) throw new Error("a color is not connected");
    breadthFirstOrder(order[count - 1]);

    // b. The band width b, then the matrix itself.
    let b = 0;
    for (let p = 0; p < m; p++) {
      const v = order[p];
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] === memberStamp && position[w] < p) b = Math.max(b, p - position[w]);
      }
    }
    const width = b + 1;
    if (band.length < m * width) band = new Float64Array(m * width * 2);
    band.fill(0, 0, m * width);
    for (let p = 0; p < m; p++) {
      const v = order[p];
      let degree = 0;
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] !== memberStamp) continue;
        degree++;                                      // the dropped cell still counts here
        if (position[w] < p) band[p * width + (p - position[w])] = -1;
      }
      band[p * width] = degree;
    }

    // c. Banded Cholesky, overwriting the band with R.
    let logDet = 0;
    for (let p = 0; p < m; p++) {
      const qFrom = Math.max(0, p - b);
      for (let q = qFrom; q <= p; q++) {
        // s = L[p][q] - (sum over r < q of R[p][r] R[q][r])
        let s = band[p * width + (p - q)];
        for (let r = Math.max(qFrom, q - b); r < q; r++) {
          s -= band[p * width + (p - r)] * band[q * width + (q - r)];
        }
        if (q === p) {
          logDet += Math.log(s);                      // s = R[p][p]^2
          band[p * width] = Math.sqrt(s);
        } else {
          band[p * width + (p - q)] = s / band[q * width];
        }
      }
    }
    return logDet;
  }

  // Number the cells marked in "member" in breadth-first order from
  // "start": order[0], order[1], ... and position[v] = v's number.
  // Returns how many cells were reached.
  function breadthFirstOrder(start) {
    seenStamp++;
    let head = 0, tail = 0;
    order[tail++] = start;
    seen[start] = seenStamp;
    while (head < tail) {
      const v = order[head++];
      position[v] = head - 1;
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (member[w] === memberStamp && seen[w] !== seenStamp) {
          seen[w] = seenStamp;
          order[tail++] = w;
        }
      }
    }
    return tail;
  }


  /* ===================================================================
     5. MESSAGES FROM THE PAGE, AND THE RUN LOOP
     -------------------------------------------------------------------
     The page sends:
       { type: "setup", run, n, first, nbr, colors, N, seed }   a new run
       { type: "play", speed }    run "speed" moves per second
                                  (Infinity = as fast as possible)
       { type: "pause" }
       { type: "step" }           one move
     The worker answers with "state" messages: the colors, and the
     numbers for the Statistics quadrant. Each one carries its run
     number, so the page can ignore leftovers from an older run.
     =================================================================== */
  let playing = false;
  let speed = 50;
  let owed = 0;            // moves due but not yet made
  let lastTick = 0;
  let timer = null;
  let lastReported = -1;   // the move count last sent to the page
  const TICK_BUDGET = 25;  // milliseconds of work between two reports

  self.onmessage = function (event) {
    const message = event.data;
    if (message.type === "setup") {
      stop();
      setup(message);
      lastReported = -1;
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
      stop();
    } else if (message.type === "step") {
      oneMove();
      report();
    }
  };

  function stop() {
    playing = false;
    clearTimeout(timer);
  }

  // Make the moves that are due (at most TICK_BUDGET ms of work), send
  // the result to the page, and come back a moment later.
  function tick() {
    const now = performance.now();
    const until = now + TICK_BUDGET;
    if (speed === Infinity) {
      do oneMove(); while (performance.now() < until);
    } else {
      owed = Math.min(owed + speed * (now - lastTick) / 1000, speed);   // at most 1 second behind
      while (owed >= 1 && performance.now() < until) { oneMove(); owed--; }
    }
    lastTick = now;
    report();
    if (playing) timer = setTimeout(tick, 10);
  }

  // Send the colors and the numbers to the page.
  function report() {
    if (proposed === lastReported) return;   // nothing new to show
    lastReported = proposed;
    const copy = color.slice();
    self.postMessage({
      type: "state",
      run: run,
      colors: copy,
      proposed: proposed,
      accepted: accepted,
      boundary: boundary,
      pairs: pairs,
    }, [copy.buffer]);   // hand the copy over instead of copying it again
  }
}
