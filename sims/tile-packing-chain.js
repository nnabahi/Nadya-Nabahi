/* =====================================================================
   tile-packing-chain.js  —  the Markov chain behind the
   "Random tile packing" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     The domain is a set of grid cells (a box, a torus, or a region drawn
     in the graph tool). The tiles are rectangles, e.g. 2x2 and 3x3, and
     may be turned (rotations). A PACKING places tiles on the cells, with
     no overlaps and nothing sticking out of the domain.
       - Gaps off: every cell must be covered (an exact tiling).
       - Gaps on: gaps are allowed, but the packing must be MAXIMAL: no
         tile fits anywhere in the gaps.
     This file runs a Markov chain whose long-run distribution is UNIFORM
     over all such packings: in the long run, every packing is equally
     likely.

     WEIGHTS (nadya, 2026-10-05). Each tile may also get a weight, a
     number >= 0 (1 when not given). Then the long-run probability of a
     packing is proportional to the product of the weights of its tiles:
     with weights 2 and 1, a packing with three tiles of the first kind
     is 2^3 = 8 times as likely as one with none. All weights 1 is the
     uniform distribution above. A tile of weight 0 is left out of the
     tile list altogether (as if it weren't there, so "maximal" doesn't
     count the places where it would fit).

   One move of the chain (agreed with nadya, 2026-10-03):
     1. Drop a disk: its center is a uniformly random point of the domain,
        its radius is exponentially distributed with a small mean.
     2. Delete every tile that touches the disk. The REGION to refill is
        the cells those tiles used plus the empty cells the disk touches.
        No other cell is ever used.
     3. List every refill of the region such that
          (a) the packing is still valid (full cover, or maximal),
          (b) every new tile touches the disk, and
          (c) every empty cell left in the region touches the disk.
     4. Pick one refill from that list at random, each with probability
        proportional to its weight (the product of its tiles' weights;
        uniformly when all weights are 1). The old packing is always on
        the list, so the list is never empty.

   Why the result is exactly uniform. Checks (b) and (c) say: dropping
   the SAME disk on the new packing deletes exactly the new tiles and
   frees exactly the same region, so it gives exactly the same list.
   So for each disk the packings fall into groups (same region, same
   tiles outside it), and the move picks inside the group. With all
   weights 1 it picks uniformly: going from P to Q then has the same
   probability as going from Q to P, the chain is symmetric, and the
   uniform distribution satisfies "detailed balance" and stays put
   (Levin, Peres & Wilmer, "Markov Chains and Mixing Times", 2nd ed.,
   AMS 2017, Proposition 1.20). With weights, write w(P) for the product
   of the weights of P's tiles. Inside a group, the move goes to Q with
   probability w(Q) / S, where S is the sum of the weights of the
   refills (the tiles outside the region are the same for the whole
   group, so they cancel). So
       w(P) * (chance of P -> Q) = w(P) w(Q) / S = w(Q) * (chance of Q -> P),
   which is detailed balance for the distribution proportional to w
   (the "heat-bath" move, same book, Section 3.3).
   A disk that covers the whole domain has a small but positive chance
   (the exponential radius has no upper limit); then the list is every
   packing, so any packing can reach any other, and the old packing is
   always allowed, so the chain converges to uniform from any start
   (same book, Theorem 4.9).

   Skipping a move. Listing a huge region could take forever. So a move
   is SKIPPED (nothing changes) if the region has more than MAX_REGION
   cells, the list has more than "sizeLimit" refills, or listing takes
   more than "workLimit" steps. This keeps the uniform distribution
   exactly: the region, the list and the listing work are the same for
   every packing in the group, so either all of them skip that disk or
   none does, and the symmetry above still holds. (It does give up the
   whole-domain disk, so with limits "every packing can be reached" is
   no longer guaranteed in theory. In practice small disks do the mixing.)

   How the refills are listed (section 3): a backtracking search over
   the region's cells, in a fixed order. At the first cell not decided
   yet, try every allowed tile that covers it, and (with gaps on, if the
   cell may stay empty) also try leaving it empty; then move on to the
   next cell. This is the "exact cover" search of Knuth's Algorithm X
   (D. E. Knuth, "Dancing Links", in Millennial Perspectives in Computer
   Science, 2000, arXiv:cs/0011047), with the cells taken in a fixed
   order. Every refill is found exactly once. While listing, one refill
   is kept, chosen uniformly ("reservoir sampling": keep the k-th refill
   found with probability 1/k; J. S. Vitter, ACM Trans. Math. Software
   11 (1985) 37), so the list itself is never stored. With weights, the
   refill found is kept with probability (its weight) / (the total
   weight of the refills found so far), which keeps each one with
   probability proportional to its weight (P. S. Efraimidis & P. G.
   Spirakis, "Weighted random sampling", Encyclopedia of Algorithms,
   2008, call this the weighted version of the same idea). The weights
   are multiplied as logarithms, so big products can't overflow.

   The starting packing (section 4):
     - Gaps on: go through all tile positions in random order and place
       each one that fits. The result is maximal (a tile that fits at
       the end also fitted when its turn came).
     - Gaps off: built directly, with no search, as nadya asked. A box
       or torus is cut into strips, each one tile height tall, filled
       with tiles of that height; a drawn domain fills each row's runs of
       cells with 1-tall tiles (or each column's runs with 1-wide tiles).
       Which lengths add up is the "coin problem", solved by a small
       table. If nothing works, the sim says so.

   HOW IT RUNS
   Everything is inside one function, tilePacking(). The sim page turns
   it into a "Web Worker" (a second thread, see startWorker in
   js/sim-page.js), where it answers messages from the page (section 6).
   The check page (tile-packing-check.html) calls tilePacking() directly
   and uses the functions it hands back.
   The one library used is seedrandom
   (https://github.com/davidbau/seedrandom), for random numbers that
   repeat exactly when the same seed is used.

   The file is split into numbered sections, all inside tilePacking():
     1. Settings and the state
     2. One move of the chain
     3. Listing the refills of a region
     4. The starting packing
     5. Checks and statistics
     6. Messages from the page, and the run loop
   ===================================================================== */

function tilePacking() {
  const inWorker = typeof importScripts === "function";
  // seedrandom adds Math.seedrandom(seed). The version number is fixed so
  // an update can never change the sim by surprise.
  if (inWorker) importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  const MAX_REGION = 3000;   // regions with more cells are skipped (see the top)


  /* ===================================================================
     1. SETTINGS AND THE STATE
     -------------------------------------------------------------------
     The domain is the object made by js/sim-domains.js: n cells, cell v
     centered at (x[v], y[v]), a box xmin..xmax by ymin..ymax around
     them, cellAt[] saying which cell is where in that box, and "wrap"
     (the x and y range that wraps around, for a torus; else null).

     A PLACEMENT is one tile in one position: an orientation (w by h)
     and the cell at its lower-left corner. All placements that fit in
     the domain are listed once at the start, so a packing is just a set
     of placement numbers, and owner[v] says which placement covers cell
     v (-1 = empty).
     =================================================================== */
  let random = Math.random;
  let gaps = true;           // gaps allowed (then packings must be maximal)
  let touchChecks = true;    // checks (b) and (c) of the move; the check page turns them off to compare
  let meanRadius = 1.5;      // mean radius of the disk, in cells
  let sizeLimit = 10000;     // skip a move whose list is longer than this
  let workLimit = 200000;    // skip a move whose listing takes more steps than this

  // The domain.
  let n = 0, X = null, Y = null;
  let xmin = 0, ymin = 0, boxWidth = 0, boxHeight = 0, cellGrid = null;
  let wrapX0 = 0, wrapY0 = 0, wrapW = 0, wrapH = 0;   // wrapW = 0: no torus

  // The tile orientations: orientation o is orientW[o] wide and orientH[o]
  // tall, and comes from tile number orientTile[o] of the list given.
  // orientLogWeight[o] is the logarithm of that tile's weight.
  let orientW = [], orientH = [], orientTile = [], orientLogWeight = [];

  // The placements, numbered 0 .. P-1. Placement p covers the cells
  // plCell[plStart[p]] .. plCell[plStart[p + 1] - 1], has orientation
  // plOrient[p] and its lower-left cell is plAnchor[p].
  // cellPl[cellPlStart[v]] .. cellPl[cellPlStart[v + 1] - 1] are the
  // placements that cover cell v. (Lists cut into pieces like this are the
  // same trick as the neighbor lists in sim-domains.js.)
  let P = 0, plStart, plCell, plOrient, plAnchor, cellPlStart, cellPl;
  let plByAnchor = new Map();   // orientation and lower-left cell -> placement

  // The packing.
  let owner = null;           // owner[v] = placement covering cell v, or -1
  let tileCount = [];         // tileCount[o] = tiles of orientation o
  let emptyCount = 0;         // empty cells

  // Statistics.
  let moves = 0;              // moves made (skipped ones included)
  let changed = 0;            // moves that changed the packing
  let skipped = 0;            // moves skipped by the limits
  let regionTotal = 0;        // sum of the region sizes
  let choicesTotal = 0;       // sum of the list lengths (moves not skipped)
  let lastDisk = null;        // the last move's disk { x, y, r }, for drawing

  // The heat map (section 5): for every cell, how long it has spent in
  // each "class": 2*o + parity for a tile of orientation o (parity = which
  // checkerboard color its lower-left cell has), or the last class for
  // empty. Times are counted in moves.
  let classes = 1, heatTime = null, heatSince = null, cellClass = null;
  let startMoves = 0;         // the move count when the heat map was last reset

  // Read the settings and list all placements. Returns an error message,
  // or "" if all is well. "s" has: domain, tiles ([{w, h, weight}, ...],
  // weight optional, 1 if left out),
  // rotations, gaps, meanRadius, sizeLimit, workLimit, seed, and,
  // for the check page only, touchChecks and randomFunction.
  function setup(s) {
    gaps = !!s.gaps;
    touchChecks = s.touchChecks !== false;
    meanRadius = s.meanRadius;
    sizeLimit = s.sizeLimit;
    workLimit = s.workLimit;
    if (s.randomFunction) random = s.randomFunction;
    else if (Math.seedrandom) random = new Math.seedrandom(String(s.seed));

    const d = s.domain;
    n = d.n; X = d.x; Y = d.y;
    xmin = d.xmin; ymin = d.ymin;
    boxWidth = d.xmax - d.xmin + 1; boxHeight = d.ymax - d.ymin + 1;
    cellGrid = d.cellAt;
    wrapW = 0; wrapH = 0;
    if (d.wrap) {
      wrapX0 = d.wrap.xmin; wrapY0 = d.wrap.ymin;
      wrapW = d.wrap.xmax - d.wrap.xmin + 1; wrapH = d.wrap.ymax - d.wrap.ymin + 1;
    }

    // Orientations: each tile, and with rotations also the tile turned a
    // quarter turn. The same size twice is kept once (a 2x2 turned is
    // still a 2x2), otherwise one picture would count as two packings.
    // A tile of weight 0 is left out (see WEIGHTS at the top).
    orientW = []; orientH = []; orientTile = []; orientLogWeight = [];
    const seenSizes = new Set();
    s.tiles.forEach(function (t, k) {
      const weight = (t.weight === undefined) ? 1 : t.weight;
      if (!(weight > 0)) return;
      const sizes = s.rotations ? [[t.w, t.h], [t.h, t.w]] : [[t.w, t.h]];
      for (const [w, h] of sizes) {
        if (seenSizes.has(w + "x" + h)) continue;
        seenSizes.add(w + "x" + h);
        orientW.push(w); orientH.push(h); orientTile.push(k); orientLogWeight.push(Math.log(weight));
      }
    });
    if (orientW.length === 0) return "Every tile has weight 0: give at least one tile a weight above 0.";

    listPlacements();

    owner = new Int32Array(n).fill(-1);
    tileCount = orientW.map(function () { return 0; });
    emptyCount = n;
    moves = changed = skipped = regionTotal = choicesTotal = 0;
    lastDisk = null;
    classes = 2 * orientW.length + 1;
    heatTime = new Float64Array(n * classes);
    heatSince = new Float64Array(n);
    cellClass = new Int32Array(n).fill(classes - 1);
    startMoves = 0;
    makeScratch();

    return gaps ? greedyStart() : directStart();
  }

  // Which cell is at grid point (x, y)? -1 if none. On a torus (x, y) is
  // first wrapped back into the grid (as cellAt in sim-domains.js).
  function cellAtXY(x, y) {
    if (wrapW) {
      x = wrapX0 + (((x - wrapX0) % wrapW) + wrapW) % wrapW;
      y = wrapY0 + (((y - wrapY0) % wrapH) + wrapH) % wrapH;
    }
    if (x < xmin || x >= xmin + boxWidth || y < ymin || y >= ymin + boxHeight) return -1;
    return cellGrid[(y - ymin) * boxWidth + (x - xmin)];
  }

  // Every orientation at every lower-left cell, kept if all its cells are
  // in the domain. On a torus a tile as wide as the torus covers the same
  // cells from every starting point; it is kept once.
  function listPlacements() {
    const starts = [0], cells = [], orients = [], anchors = [];
    const sameCells = new Map();   // the cells, written out, -> placement
    plByAnchor = new Map();
    for (let o = 0; o < orientW.length; o++) {
      for (let v = 0; v < n; v++) {
        const these = [];
        for (let j = 0; j < orientH[o]; j++) {
          for (let i = 0; i < orientW[o]; i++) {
            const c = cellAtXY(X[v] + i, Y[v] + j);
            if (c < 0 || these.includes(c)) { these.length = 0; j = orientH[o]; break; }
            these.push(c);
          }
        }
        if (these.length !== orientW[o] * orientH[o]) continue;
        // Repeats can only happen for a tile as wide or as tall as the torus.
        const p = orients.length;
        if (wrapW && (orientW[o] >= wrapW || orientH[o] >= wrapH)) {
          const key = these.slice().sort(function (a, b) { return a - b; }).join(",");
          if (sameCells.has(key)) { plByAnchor.set(o * n + v, sameCells.get(key)); continue; }
          sameCells.set(key, p);
        }
        plByAnchor.set(o * n + v, p);
        for (const c of these) cells.push(c);
        starts.push(cells.length);
        orients.push(o);
        anchors.push(v);
      }
    }
    P = orients.length;
    plStart = Int32Array.from(starts);
    plCell = Int32Array.from(cells);
    plOrient = Int32Array.from(orients);
    plAnchor = Int32Array.from(anchors);

    // The placements covering each cell.
    const lists = [];
    for (let v = 0; v < n; v++) lists.push([]);
    for (let p = 0; p < P; p++) {
      for (let k = plStart[p]; k < plStart[p + 1]; k++) lists[plCell[k]].push(p);
    }
    cellPlStart = new Int32Array(n + 1);
    const all = [];
    for (let v = 0; v < n; v++) {
      cellPlStart[v] = all.length;
      for (const p of lists[v]) all.push(p);
    }
    cellPlStart[n] = all.length;
    cellPl = Int32Array.from(all);
  }

  // Put placement p on the board, or take it off.
  function placeTile(p) {
    for (let k = plStart[p]; k < plStart[p + 1]; k++) setOwner(plCell[k], p);
    tileCount[plOrient[p]]++;
    emptyCount -= plStart[p + 1] - plStart[p];
  }
  function removeTile(p) {
    for (let k = plStart[p]; k < plStart[p + 1]; k++) setOwner(plCell[k], -1);
    tileCount[plOrient[p]]--;
    emptyCount += plStart[p + 1] - plStart[p];
  }

  // Change who covers cell v, keeping the heat map's clock right.
  function setOwner(v, p) {
    owner[v] = p;
    const newClass = classOf(p);
    if (newClass !== cellClass[v]) {
      heatTime[v * classes + cellClass[v]] += moves - heatSince[v];
      heatSince[v] = moves;
      cellClass[v] = newClass;
    }
  }
  function classOf(p) {
    if (p < 0) return classes - 1;
    const a = plAnchor[p];
    return 2 * plOrient[p] + (((X[a] + Y[a]) % 2 + 2) % 2);
  }


  /* ===================================================================
     2. ONE MOVE OF THE CHAIN
     =================================================================== */

  // Scratch space, reused by every move. A "stamp" array marks things by
  // writing the current stamp number into them; bumping the number
  // un-marks everything at once, for free.
  let stamp = 0;
  let inRegion, seenCell, seenPl, position;
  function makeScratch() {
    inRegion = new Int32Array(n); seenCell = new Int32Array(n); position = new Int32Array(n);
    seenPl = new Int32Array(P);
    stamp = 0;
  }

  // Does the disk (cx, cy, r) touch cell v? Cell v is the square of side 1
  // centered at (X[v], Y[v]). On a torus, distances are measured the short
  // way round.
  function touches(v, cx, cy, r) {
    let dx = Math.abs(cx - X[v]), dy = Math.abs(cy - Y[v]);
    if (wrapW) {
      dx %= wrapW; dx = Math.min(dx, wrapW - dx);
      dy %= wrapH; dy = Math.min(dy, wrapH - dy);
    }
    const ex = Math.max(0, dx - 0.5), ey = Math.max(0, dy - 0.5);
    return ex * ex + ey * ey < r * r;
  }

  // "at" is left out for a normal move. A click on the picture gives
  // the cell { x, y } that was clicked: then the disk is centered there
  // (its radius is still random), as if the chain had picked that point.
  function oneMove(at) {
    moves++;

    // Step 1: the disk. A uniform point of the domain: a uniform cell,
    // then a uniform point in its square. An exponential radius:
    // -mean * log(1 - u) for u uniform in [0, 1).
    let cx, cy;
    if (at) {
      cx = at.x; cy = at.y;               // the middle of the clicked cell
    } else {
      const v0 = Math.floor(random() * n);
      cx = X[v0] - 0.5 + random(); cy = Y[v0] - 0.5 + random();
    }
    const r = -meanRadius * Math.log(1 - random());
    lastDisk = { x: cx, y: cy, r: r };

    // Step 2: the tiles to delete and the region.
    stamp++;
    const removed = [], regionCells = [];
    function addToRegion(c) {
      if (inRegion[c] !== stamp) { inRegion[c] = stamp; regionCells.push(c); }
    }
    // Look only at the grid points the disk can reach (on a torus, at
    // most once round in each direction).
    let x0 = Math.floor(cx - r - 0.5), x1 = Math.ceil(cx + r + 0.5);
    let y0 = Math.floor(cy - r - 0.5), y1 = Math.ceil(cy + r + 0.5);
    if (wrapW) {
      if (x1 - x0 + 1 > wrapW) { x0 = wrapX0; x1 = wrapX0 + wrapW - 1; }
      if (y1 - y0 + 1 > wrapH) { y0 = wrapY0; y1 = wrapY0 + wrapH - 1; }
    } else {
      x0 = Math.max(x0, xmin); x1 = Math.min(x1, xmin + boxWidth - 1);
      y0 = Math.max(y0, ymin); y1 = Math.min(y1, ymin + boxHeight - 1);
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = cellAtXY(x, y);
        if (v < 0 || seenCell[v] === stamp) continue;
        seenCell[v] = stamp;
        if (!touches(v, cx, cy, r)) continue;
        const p = owner[v];
        if (p < 0) { addToRegion(v); continue; }   // an empty cell the disk touches
        if (seenPl[p] === stamp) continue;
        seenPl[p] = stamp;
        removed.push(p);                           // a tile the disk touches
        for (let k = plStart[p]; k < plStart[p + 1]; k++) addToRegion(plCell[k]);
      }
    }
    regionTotal += regionCells.length;
    if (regionCells.length > MAX_REGION) { skipped++; return; }

    // Step 3: list the refills, keeping one chosen at random by weight.
    const mayStayEmpty = function (c) { return !touchChecks || touches(c, cx, cy, r); };
    const tileAllowed = function (p) {
      if (!touchChecks) return true;
      for (let k = plStart[p]; k < plStart[p + 1]; k++) {
        if (touches(plCell[k], cx, cy, r)) return true;
      }
      return false;
    };
    const result = listRefills(regionCells, mayStayEmpty, tileAllowed, sizeLimit, workLimit);
    if (result.stopped || !result.kept) { skipped++; return; }   // (kept is never empty: the old packing is on the list)
    choicesTotal += result.count;

    // Step 4: put the chosen refill in (if it differs from the old one).
    if (sameSet(result.kept, removed)) return;
    for (const p of removed) removeTile(p);
    for (const p of result.kept) placeTile(p);
    changed++;
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const byNumber = function (u, v) { return u - v; };
    const sa = a.slice().sort(byNumber), sb = b.slice().sort(byNumber);
    return sa.every(function (v, k) { return v === sb[k]; });
  }


  /* ===================================================================
     3. LISTING THE REFILLS OF A REGION
     -------------------------------------------------------------------
     regionCells   the cells to refill (every tile on them must already
                   be removed from the list of tiles to keep: the caller
                   treats them as free)
     mayStayEmpty  mayStayEmpty(c): may cell c be left empty? (gaps on only)
     tileAllowed   tileAllowed(p): may placement p be used?
     maxCount, maxWork   the limits (see the top of the file)
     onRefill      optional: if given, onRefill(list of placements) is
                   called for every refill (the check page lists them all)
     Returns { count, kept, stopped }: how many refills there are, one of
     them chosen at random by weight (a list of placements; uniformly
     when all weights are 1), and whether a limit was hit (then count and
     kept mean nothing).

     MAXIMAL PACKINGS. With gaps on, a refill is only valid if no tile
     fits in the gaps afterwards. Before the move no tile fitted, and
     nothing outside the region changes, so only tiles that use at least
     one cell of the region can newly fit: a "blocker" is a placement
     whose cells are all in the region or empty already. Each blocker is
     checked once, when its last region cell (in the search order) is
     left empty: if all its region cells are empty, the refill is not
     maximal and the search backs up.
     =================================================================== */
  function listRefills(regionCells, mayStayEmpty, tileAllowed, maxCount, maxWork, onRefill) {
    stamp++;
    const m = regionCells.length;

    // Search order: bottom row first, left to right.
    const cells = regionCells.slice().sort(function (a, b) { return Y[a] - Y[b] || X[a] - X[b]; });
    for (let k = 0; k < m; k++) { inRegion[cells[k]] = stamp; position[cells[k]] = k; }
    const emptyOk = cells.map(function (c) { return gaps && mayStayEmpty(c); });

    // startsAt[k]: allowed tiles inside the region whose first cell (in the
    // search order) is cell k, each as the list of its cells' positions.
    // blockersAt[k]: blockers whose last region cell is cell k, each as the
    // list of positions of its region cells.
    const startsAt = [], blockersAt = [];
    const logWeightOf = function (p) { return orientLogWeight[plOrient[p]]; };
    for (let k = 0; k < m; k++) { startsAt.push([]); blockersAt.push([]); }
    for (let k = 0; k < m; k++) {
      const c = cells[k];
      for (let e = cellPlStart[c]; e < cellPlStart[c + 1]; e++) {
        const p = cellPl[e];
        if (seenPl[p] === stamp) continue;
        seenPl[p] = stamp;
        const inside = [];          // positions of p's cells in the region
        let allInside = true, othersEmpty = true, allMayBeEmpty = true;
        for (let j = plStart[p]; j < plStart[p + 1]; j++) {
          const q = plCell[j];
          if (inRegion[q] === stamp) {
            inside.push(position[q]);
            if (!emptyOk[position[q]]) allMayBeEmpty = false;
          } else {
            allInside = false;
            if (owner[q] >= 0) othersEmpty = false;
          }
        }
        if (allInside && tileAllowed(p)) {
          startsAt[Math.min(...inside)].push({ p: p, cells: inside, logWeight: logWeightOf(p) });
        }
        if (gaps && othersEmpty && allMayBeEmpty) {
          blockersAt[Math.max(...inside)].push(inside);
        }
      }
    }

    // The search itself. state[k]: 0 = not decided, 1 = covered, 2 = empty.
    // logWeight is the logarithm of the weight of the tiles chosen so far,
    // and logTotal the logarithm of the total weight of the refills found.
    const state = new Int8Array(m);
    const chosen = [];
    let count = 0, work = 0, stopped = false, kept = null;
    let logWeight = 0, logTotal = -Infinity;

    function search(k) {
      if (++work > maxWork) { stopped = true; return; }
      while (k < m && state[k] !== 0) k++;
      if (k === m) {
        // A complete refill: keep it with probability (its weight) / (the
        // total weight so far). With all weights 1 that is 1/count.
        count++;
        if (count > maxCount) { stopped = true; return; }
        logTotal = addLogs(logTotal, logWeight);
        if (onRefill) onRefill(chosen.slice());
        else if (random() < Math.exp(logWeight - logTotal)) kept = chosen.slice();
        return;
      }
      // Cover cell k with each allowed tile that starts there and fits.
      for (const t of startsAt[k]) {
        if (!t.cells.every(function (j) { return state[j] === 0; })) continue;
        for (const j of t.cells) state[j] = 1;
        chosen.push(t.p);
        logWeight += t.logWeight;
        search(k + 1);
        logWeight -= t.logWeight;
        chosen.pop();
        for (const j of t.cells) state[j] = 0;
        if (stopped) return;
      }
      // Or leave it empty, if allowed and no blocker becomes a free spot.
      if (emptyOk[k]) {
        state[k] = 2;
        const blocked = blockersAt[k].some(function (b) {
          return b.every(function (j) { return state[j] === 2; });
        });
        if (!blocked) search(k + 1);
        state[k] = 0;
      }
    }
    search(0);
    return { count: count, kept: kept, stopped: stopped };
  }

  // New weights while it runs (weights[k] for tile number k), like a
  // Desmos slider: the chain carries on from the packing it has, now
  // heading for the new distribution. Only for weights above 0; a tile
  // going to or from weight 0 changes the tile list, so the page
  // restarts instead.
  function setWeights(weights) {
    for (let o = 0; o < orientTile.length; o++) orientLogWeight[o] = Math.log(weights[orientTile[o]]);
  }

  // log(e^a + e^b), without overflowing: take out the bigger one first.
  function addLogs(a, b) {
    const big = Math.max(a, b);
    if (big === -Infinity) return -Infinity;
    return big + Math.log(Math.exp(a - big) + Math.exp(b - big));
  }


  /* ===================================================================
     4. THE STARTING PACKING
     Returns "" if a packing was made, else a message for the page.
     =================================================================== */

  // Gaps on: every placement in random order, placed if it fits.
  function greedyStart() {
    const order = [];
    for (let p = 0; p < P; p++) order.push(p);
    for (let k = P - 1; k > 0; k--) {          // shuffle (Fisher-Yates)
      const j = Math.floor(random() * (k + 1));
      const t = order[k]; order[k] = order[j]; order[j] = t;
    }
    for (const p of order) {
      let free = true;
      for (let k = plStart[p]; k < plStart[p + 1]; k++) {
        if (owner[plCell[k]] >= 0) { free = false; break; }
      }
      if (free) placeTile(p);
    }
    return "";
  }

  // Gaps off: build a tiling directly, with no search.
  function directStart() {
    const fullBox = n === boxWidth * boxHeight &&
                    (!wrapW || (boxWidth === wrapW && boxHeight === wrapH));
    const plan = fullBox ? (strips(false) || strips(true)) : (runs(false) || runs(true));
    if (!plan) {
      return "Couldn't build a starting tiling without a search. " +
             "Try allowing gaps, or another size.";
    }
    for (const t of plan) placeTile(t);
    return "";
  }

  // The coin problem: write "length" as a sum of numbers from "sizes"
  // (each used any number of times). Returns the list, or null if it
  // can't be done. last[t] = the size used last to reach t.
  function sumOf(length, sizes) {
    const last = new Int32Array(length + 1).fill(-1);
    last[0] = 0;
    for (let t = 1; t <= length; t++) {
      for (const s of sizes) {
        if (s <= t && last[t - s] >= 0) { last[t] = s; break; }
      }
    }
    if (last[length] < 0) return null;
    const parts = [];
    for (let t = length; t > 0; t -= last[t]) parts.push(last[t]);
    return parts;
  }

  // The placement of orientation o with lower-left corner at grid point (x, y).
  function placementAt(o, x, y) {
    const v = cellAtXY(x, y);
    const p = v < 0 ? undefined : plByAnchor.get(o * n + v);
    return p === undefined ? -1 : p;
  }

  // A full box (or torus) cut into strips. Rows: horizontal strips, each
  // one tile height tall, filled left to right with tiles of that height.
  // columns = true does the same turned a quarter turn.
  function strips(columns) {
    const along = columns ? boxHeight : boxWidth;    // length of a strip
    const across = columns ? boxWidth : boxHeight;   // total of the strip thicknesses
    const thick = function (o) { return columns ? orientW[o] : orientH[o]; };
    const long = function (o) { return columns ? orientH[o] : orientW[o]; };
    // Which thicknesses can make a full strip, and how.
    const fill = new Map();
    for (let o = 0; o < orientW.length; o++) {
      const t = thick(o);
      if (fill.has(t)) continue;
      const lengths = [];
      for (let q = 0; q < orientW.length; q++) if (thick(q) === t) lengths.push(long(q));
      const parts = sumOf(along, lengths);
      if (parts) fill.set(t, parts);
    }
    const layers = sumOf(across, Array.from(fill.keys()));
    if (!layers) return null;
    const plan = [];
    let offset = 0;
    for (const t of layers) {
      let pos = 0;
      for (const len of fill.get(t)) {
        let o = 0;
        while (thick(o) !== t || long(o) !== len) o++;
        const p = columns ? placementAt(o, xmin + offset, ymin + pos)
                          : placementAt(o, xmin + pos, ymin + offset);
        if (p < 0) return null;
        plan.push(p);
        pos += len;
      }
      offset += t;
    }
    return plan;
  }

  // A drawn domain: each row's runs of cells filled with 1-tall tiles
  // (columns = true: each column's runs with 1-wide tiles).
  function runs(columns) {
    const ones = [];   // orientations 1 thick, and their lengths
    for (let o = 0; o < orientW.length; o++) {
      if ((columns ? orientW[o] : orientH[o]) === 1) ones.push(o);
    }
    if (ones.length === 0) return null;
    const lengthOf = function (o) { return columns ? orientH[o] : orientW[o]; };
    const lengths = ones.map(lengthOf);
    const plan = [];
    const lines = columns ? boxWidth : boxHeight, along = columns ? boxHeight : boxWidth;
    for (let a = 0; a < lines; a++) {
      let b = 0;
      while (b < along) {
        const at = function (k) {
          return columns ? cellGrid[k * boxWidth + a] : cellGrid[a * boxWidth + k];
        };
        if (at(b) < 0) { b++; continue; }
        let end = b;
        while (end < along && at(end) >= 0) end++;
        const parts = sumOf(end - b, lengths);
        if (!parts) return null;
        let pos = b;
        for (const len of parts) {
          const o = ones[lengths.indexOf(len)];
          const p = columns ? placementAt(o, xmin + a, ymin + pos)
                            : placementAt(o, xmin + pos, ymin + a);
          if (p < 0) return null;
          plan.push(p);
          pos += len;
        }
        b = end;
      }
    }
    return plan;
  }


  /* ===================================================================
     5. CHECKS AND STATISTICS
     =================================================================== */

  // Is the packing valid? Returns "" if so, else what is wrong.
  function checkPacking() {
    const count = new Int32Array(n);
    const tiles = new Set();
    for (let v = 0; v < n; v++) if (owner[v] >= 0) tiles.add(owner[v]);
    for (const p of tiles) {
      for (let k = plStart[p]; k < plStart[p + 1]; k++) {
        const c = plCell[k];
        count[c]++;
        if (owner[c] !== p) return "cell " + c + " is not marked as covered by its tile";
      }
    }
    for (let v = 0; v < n; v++) {
      if (count[v] > 1) return "tiles overlap at cell " + v;
      if (!gaps && count[v] === 0) return "cell " + v + " is not covered";
    }
    if (gaps) {
      for (let p = 0; p < P; p++) {
        let free = true;
        for (let k = plStart[p]; k < plStart[p + 1]; k++) if (owner[plCell[k]] >= 0) free = false;
        if (free) return "not maximal: a tile still fits (placement " + p + ")";
      }
    }
    return "";
  }

  // The packing written as a short text (its placements, sorted), so the
  // check page can count how often each packing is seen.
  function packingKey() {
    const tiles = new Set();
    for (let v = 0; v < n; v++) if (owner[v] >= 0) tiles.add(owner[v]);
    return Array.from(tiles).sort(function (a, b) { return a - b; }).join(",");
  }

  // Every valid packing of the whole domain (for tiny domains only), as
  // keys like packingKey(), or null if there are too many to list. It is
  // the same search as a move, with the whole domain as the region and
  // every refill written down instead of one chosen.
  function allPackings() {
    const all = [], keys = [];
    for (let v = 0; v < n; v++) all.push(v);
    const result = listRefills(all, function () { return true; }, function () { return true; },
      100000, 50000000, function (refill) {
        keys.push(refill.sort(function (a, b) { return a - b; }).join(","));
      });
    return result.stopped ? null : keys;
  }

  // How many valid packings the whole domain has, without writing them
  // down (for the 8x8 domino count on the check page). -1 if listing takes
  // more than maxWork steps.
  function countPackings(maxWork) {
    const all = [];
    for (let v = 0; v < n; v++) all.push(v);
    let count = 0;
    const result = listRefills(all, function () { return true; }, function () { return true; },
      Infinity, maxWork, function () { count++; });
    return result.stopped ? -1 : count;
  }

  // Refill the given cells (exactly the cells of some tiles) at random
  // among all their exact tilings (uniformly when all weights are 1). Used by the check page to test
  // nadya's random-walk version of the move (tiling_mcmc.py).
  function refillUniform(cells) {
    const old = [];
    for (const c of cells) if (owner[c] >= 0 && !old.includes(owner[c])) old.push(owner[c]);
    const savedGaps = gaps;
    gaps = false;
    const result = listRefills(cells, function () { return false; }, function () { return true; },
                               Infinity, Infinity);
    gaps = savedGaps;
    for (const p of old) removeTile(p);
    for (const p of result.kept) placeTile(p);
    return result.count;
  }

  // The heat map: heat[v * classes + c] = fraction of the moves since the
  // last reset that cell v spent in class c (see section 1).
  function heat() {
    const h = new Float64Array(n * classes);
    const total = Math.max(moves - startMoves, 1);
    for (let v = 0; v < n; v++) {
      for (let c = 0; c < classes; c++) h[v * classes + c] = heatTime[v * classes + c];
      h[v * classes + cellClass[v]] += moves - heatSince[v];
      for (let c = 0; c < classes; c++) h[v * classes + c] /= total;
    }
    return h;
  }

  // Start the heat map's averages again from now (e.g. after the chain
  // has had time to forget its starting packing).
  function resetHeat() {
    heatTime.fill(0);
    heatSince.fill(moves);
    startMoves = moves;
  }

  function stats() {
    return {
      moves: moves, changed: changed, skipped: skipped,
      regionTotal: regionTotal, choicesTotal: choicesTotal,
      tileCount: tileCount.slice(), emptyCount: emptyCount, lastDisk: lastDisk,
    };
  }


  /* ===================================================================
     6. MESSAGES FROM THE PAGE, AND THE RUN LOOP
     (only inside the Web Worker, which the sim page tile-packing.js starts)
     =================================================================== */
  const api = {
    setup: setup, oneMove: oneMove, checkPacking: checkPacking, packingKey: packingKey,
    allPackings: allPackings, countPackings: countPackings, refillUniform: refillUniform,
    heat: heat, resetHeat: resetHeat, stats: stats,
    owner: function () { return owner; },
    placements: function () {
      return { count: P, start: plStart, cell: plCell, orient: plOrient, anchor: plAnchor,
               orientW: orientW, orientH: orientH, orientTile: orientTile };
    },
  };
  if (!inWorker) return api;

  let playing = false, speed = 5, owed = 0, lastTick = 0, timer = null;
  let run = 0;               // which run this is (the page numbers them)
  let sendHeat = false;      // does the page want the heat map?
  const TICK_BUDGET = 25;    // milliseconds of work between two reports

  // The messages the page sends:
  //   setup      start a new run (all of setup()'s settings, plus "run")
  //   play       run at "speed" moves per second (Infinity: flat out)
  //   pause, step
  //   click      one move with the disk centered at the clicked cell { x, y }
  //   settings   a new meanRadius and sizeLimit, without restarting (they
  //              change how fast the chain mixes, not where it ends up)
  //   heat       on: true or false, whether to send the heat map
  //   resetHeat  start the heat map's averages again
  self.onmessage = function (event) {
    const message = event.data;
    if (message.type === "setup") {
      stop();
      run = message.run;
      const error = setup(message);
      self.postMessage({ type: "ready", run: run, error: error, placements: api.placements() });
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
    } else if (message.type === "click") {
      oneMove({ x: message.x, y: message.y });
      report();
    } else if (message.type === "settings") {
      meanRadius = message.meanRadius;
      sizeLimit = message.sizeLimit;
    } else if (message.type === "weights") {
      setWeights(message.weights);
    } else if (message.type === "heat") {
      sendHeat = message.on;
      report();
    } else if (message.type === "resetHeat") {
      resetHeat();
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

  // Send the packing (who covers each cell) and the numbers to the page.
  function report() {
    if (!owner) return;
    const copy = owner.slice();
    const message = { type: "state", run: run, owner: copy, stats: stats() };
    const handOver = [copy.buffer];   // handed over instead of copied again
    if (sendHeat) { message.heat = heat(); handOver.push(message.heat.buffer); }
    self.postMessage(message, handOver);
  }
}
