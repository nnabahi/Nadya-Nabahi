/* =====================================================================
   sim-walk.js  —  a walker on any lattice: one step at a time, or one
                   exact jump across a ball
   ---------------------------------------------------------------------
   LATTICES. Every lattice a walker can live on is written the same
   way: a REPEATING BLOCK of cells, copied to every block position
   (I, J, K) (whole numbers; J = K = 0 in 1D and K = 0 in 2D), and for
   each cell k of the block its MOVES: its neighbors, each as
   [k2, dI, dJ, dK], cell k2 of the block dI, dJ, dK further along. A
   SITE is cell k of block (I, J, K), kept as { I, J, K, k }.
     gridLattice(dim)         the grids Z, Z^2, Z^3: one cell per block
                              (k = 0), so (I, J, K) is the point itself;
                              the moves in the order +x, -x, +y, -y, +z, -z
     tilingLattice(tiling)    a tiling of the plane (tilingBlock,
                              js/sim-tilings.js), its tiles or its corners
                              being the cells, or the plane of a Penrose
                              tiling (penrosePlane, js/sim-penrose.js):
                              one block that grows, so I = J = K = 0
     honeycombLattice(block)  a tiling of space (honeycombBlock,
                              js/sim-honeycombs.js)
   Each one gives
     dim                  1, 2 or 3
     movesOf(k)           the moves of cell k (each neighbor once)
     placeOf(I, J, K, k)  where the site's middle is: [x], [x, y] or [x, y, z]
     keyOf(I, J, K, k)    one whole number per site, to keep sites in a Map
     longestMove          the farthest apart two neighbors' middles are
     periodic             false only for a Penrose plane (it never repeats)
     reaches(place, r)    whether every cell within r of the place is
                          there (only a Penrose plane can say no; it
                          grows when it can)

   ONE STEP (walkStep): the walker moves to one of its cell's
   neighbors, all equally likely (the simple random walk), using one
   uniform number u in (0, 1): neighbor number floor(u * how many). On
   the grids a sim can give weights instead (cutsOf; the Random Walk
   sim does): then u picks the first move whose cut is above u.

   ONE JUMP (ballJumps, section 2): far from anything that could stop
   it, the walker skips all its steps inside a ball around it and jumps
   straight to where it first leaves the ball, with exactly the right
   chances.

   Contents:
     1. Lattices and steps
     2. Exact jumps across balls
     3. The list of helpers, for workers
   ===================================================================== */


/* =====================================================================
   1. LATTICES AND STEPS
   ===================================================================== */

// The six moves of the grids, in the order the weights come in.
const GRID_MOVES = [[0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];

// A site's key: one whole number. Blocks stay within 2^12 of the
// middle (a walk that far is millions of steps), and the cell numbers
// below "cellCount", so the key stays below 2^53 and no two sites share
// one for blocks up to 2^14 cells.
function siteKeyMaker(cellCount) {
  return function (I, J, K, k) { return (((I + 4096) * 8192 + (J + 4096)) * 8192 + (K + 4096)) * cellCount + k; };
}

// Z, Z^2 or Z^3 (dim = 1, 2 or 3).
function gridLattice(dim) {
  const moves = GRID_MOVES.slice(0, 2 * dim);
  return {
    dim: dim, periodic: true, longestMove: 1, cellCount: 1,
    movesOf: function () { return moves; },
    placeOf: function (I, J, K) { return [I, J, K].slice(0, dim); },
    keyOf: siteKeyMaker(1),
    reaches: function () { return true; },
  };
}

// A tiling of the plane (its repeating block, or a Penrose plane).
// Its moves are the cells across each side (cellNeighbors,
// js/sim-domains.js), made for each cell the first time they are asked
// for. A Penrose plane is one block that grows: its new cells get new
// numbers, and the old ones keep theirs.
function tilingLattice(tiling) {
  const moves = [];
  const lattice = {
    dim: 2, tiling: tiling, periodic: !tiling.finite, cellCount: tiling.cells.length,
    movesOf: function (k) {
      return moves[k] || (moves[k] = cellNeighbors(tiling.cells[k]).map(function ([k2, dI, dJ]) { return [k2, dI, dJ, 0]; }));
    },
    placeOf: function (I, J, K, k) { return middleAt(tiling, I, J, k); },
    keyOf: tiling.finite ? function (I, J, K, k) { return k; } : siteKeyMaker(tiling.cells.length),
    reaches: function (place, r) { return !tiling.finite || penroseReach(tiling, place[0], place[1], r); },
  };
  lattice.longestMove = tiling.finite ? NaN : longestMoveOf(lattice);
  return lattice;
}

// A tiling of space (honeycombBlock, js/sim-honeycombs.js).
function honeycombLattice(block) {
  const moves = block.cells.map(function (cell) { return cell.next; });
  const lattice = {
    dim: 3, block: block, periodic: true, cellCount: block.cells.length,
    movesOf: function (k) { return moves[k]; },
    placeOf: function (I, J, K, k) { return honeycombMiddle(block, I, J, K, k); },
    keyOf: siteKeyMaker(block.cells.length),
    reaches: function () { return true; },
  };
  lattice.longestMove = longestMoveOf(lattice);
  return lattice;
}

// The farthest apart two neighbors' middles are, over every cell of
// the block and every move.
function longestMoveOf(lattice) {
  let longest = 0;
  for (let k = 0; k < lattice.cellCount; k++) {
    const p = lattice.placeOf(0, 0, 0, k);
    for (const [k2, dI, dJ, dK] of lattice.movesOf(k)) longest = Math.max(longest, distanceBetween(p, lattice.placeOf(dI, dJ, dK, k2)));
  }
  return longest;
}

// The straight-line distance between two places (1, 2 or 3 numbers each).
function distanceBetween(p, q) {
  let sum = 0;
  for (let c = 0; c < p.length; c++) sum += (p[c] - q[c]) * (p[c] - q[c]);
  return Math.sqrt(sum);
}

// A new site, cell k of block (I, J, K).
function newSite(I, J, K, k) { return { I: I, J: J, K: K, k: k }; }

// One step of the walker at site s (changed in place), for a uniform u
// in (0, 1): to its cell's move number floor(u * how many), all equally
// likely, or, given cuts (from cutsOf), to the first move whose cut is
// above u.
function walkStep(lattice, s, u, cut) {
  const moves = lattice.movesOf(s.k);
  let m = 0;
  if (cut) { while (cut[m] <= u) m++; } else m = Math.floor(u * moves.length);
  const [k2, dI, dJ, dK] = moves[m];
  s.I += dI; s.J += dJ; s.K += dK; s.k = k2;
}

// The cuts for these weights, one per move ("count" of them):
// cut[m] = (w_1 + ... + w_(m+1)) / (all of them), the last one 1. Moving
// a weight a little moves the cuts a little, so only the steps whose u
// sits near a cut change (the way the p slider moves Bernoulli
// percolation). Says what is wrong if the weights can't be used.
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
   2. EXACT JUMPS ACROSS BALLS
   ---------------------------------------------------------------------
   The BALL of radius r around a site is every site at most r steps
   away. A walker starting at its middle stays inside for a while and
   then leaves it, at a site exactly r + 1 steps away. Where it leaves
   has a law of its own (the "exit law"), and by the strong Markov
   property (J. R. Norris, "Markov Chains", Cambridge University Press,
   1997, Theorem 1.4.2) the walk after that is a fresh walk from there.
   So, as long as nothing inside the ball could have stopped the walker
   (no cluster, no wall), jumping straight to a site drawn from the
   exit law is EXACTLY the same as taking all the steps.

   Working out the exit law. Let G(x) be how many times, on average,
   the walker is at site x before it leaves (the "Green's function" of
   the ball: G. Lawler and V. Limic, "Random Walk: A Modern
   Introduction", Cambridge University Press, 2010, Section 4.6). Each
   step from x goes to each of its deg(x) neighbors with chance
   1/deg(x), so with f(x) = G(x) / deg(x),
       deg(y) f(y) - (the sum of f(x) over the neighbors x of y in the
       ball) = 1 if y is the middle, 0 otherwise,       for y in the ball,
   that is (D - A) f = e, with D the degrees and A the neighbor table of
   the ball. And the chance to leave at a site y outside is the sum of
   f(x) over its neighbors x in the ball. D - A is symmetric and
   positive definite, so it is solved by conjugate gradients (M.
   Hestenes and E. Stiefel, "Methods of conjugate gradients for solving
   linear systems", J. Res. Nat. Bur. Standards 49 (1952), 409-436),
   until what is left over is at the level of rounding error.

   Because the lattice repeats, the law for cell k of block (0, 0, 0)
   serves every copy of cell k: the sites just shift by the block. So
   each table is worked out once, the first time it is needed, for the
   radii 2, 4, 8, ... (as long as the ball has at most MOST_BALL_SITES
   sites). A Penrose plane never repeats, so there the walker always
   steps.

   Choosing the ball. A sim says how much ROOM there is: no site
   closer than "room" (straight-line distance, from the walker's middle)
   could stop it. Every site of the ball of radius r is at most
   r * longestMove away, so the biggest radius with r * longestMove
   below the room is safe. Distances are worked out in floating point,
   a little off in the last digits, so "below" leaves ROOM_SPARE to
   spare: a site exactly r * longestMove away (as on a straight line of
   r moves) must not count as outside the ball.
   ===================================================================== */

const MOST_BALL_SITES = 200000;
const ROOM_SPARE = 1e-6;

// The jumps of a lattice. jump(s, room, u) moves the walker at site s
// (in place) across the biggest safe ball, using the uniform u, and
// says how many steps that stood for on average; it returns 0 and
// leaves s as it is when there is no ball of radius 2 or more with that
// much room (then the sim takes one step).
function ballJumps(lattice) {
  const tables = [];         // tables[k][j]: cell k's exit law from the ball of radius 2^(j+1)
  let biggest = Infinity;    // the biggest j left: lowered when a ball has too many sites

  function tableFor(k, j) {
    if (!tables[k]) tables[k] = [];
    if (tables[k][j] === undefined) tables[k][j] = exitLaw(lattice, k, Math.pow(2, j + 1));
    return tables[k][j];
  }

  function jump(s, room, u) {
    if (!lattice.periodic) return 0;
    // The biggest j whose radius 2^(j+1) is safe.
    let j = -1;
    while (j < biggest && Math.pow(2, j + 2) * lattice.longestMove < room - ROOM_SPARE) j++;
    for (; j >= 0; j--) {
      const table = tableFor(s.k, j);
      if (table === null) { biggest = j - 1; continue; }
      const [k2, dI, dJ, dK] = table.exits[pickFromCumulative(table.cumulative, u)];
      s.I += dI; s.J += dJ; s.K += dK; s.k = k2;
      return table.meanSteps;
    }
    return 0;
  }

  return { jump: jump, tableFor: tableFor };
}

// The first index whose running total is above u (a binary search).
function pickFromCumulative(cumulative, u) {
  let low = 0, high = cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] > u) high = mid; else low = mid + 1;
  }
  return low;
}

// The exit law of the ball of radius r around cell k of block (0, 0, 0):
// { exits, chances, cumulative, meanSteps, sites }, where exits are the
// sites it can leave at, as [k2, I, J, K], with their chances (and
// running totals), and meanSteps is the average number of steps inside
// (the sum of G). null if the ball has more than MOST_BALL_SITES sites.
function exitLaw(lattice, k, r) {
  const ball = ballAround(lattice, k, r);
  if (ball === null) return null;
  const f = solveBall(ball);
  const chanceOf = new Map();
  for (let x = 0; x < ball.sites.length; x++) {
    for (const y of ball.outside[x]) chanceOf.set(y, (chanceOf.get(y) || 0) + f[x]);
  }
  const exits = [], chances = [];
  for (const [y, chance] of chanceOf) { exits.push(ball.outsideSites.get(y)); chances.push(chance); }
  const total = chances.reduce(function (a, b) { return a + b; }, 0);
  const cumulative = [];
  let sum = 0;
  for (const chance of chances) { sum += chance / total; cumulative.push(sum); }
  cumulative[cumulative.length - 1] = 1;
  let meanSteps = 0;
  for (let x = 0; x < ball.sites.length; x++) meanSteps += ball.degree[x] * f[x];
  return { exits: exits, chances: chances, total: total, cumulative: Float64Array.from(cumulative), meanSteps: meanSteps, sites: ball.sites.length };
}

// The ball of radius r around cell k of block (0, 0, 0), found by
// going out one step at a time ("breadth-first search"): its sites
// (site 0 the middle), each one's degree, its neighbors inside (by
// number) and outside (by key), and the sites just outside, by key.
function ballAround(lattice, k, r) {
  const numberOf = new Map(), sites = [[k, 0, 0, 0]];
  numberOf.set(lattice.keyOf(0, 0, 0, k), 0);
  let ring = [0];
  for (let step = 1; step <= r; step++) {
    const next = [];
    for (const x of ring) {
      const [kx, I, J, K] = sites[x];
      for (const [k2, dI, dJ, dK] of lattice.movesOf(kx)) {
        const key = lattice.keyOf(I + dI, J + dJ, K + dK, k2);
        if (numberOf.has(key)) continue;
        numberOf.set(key, sites.length);
        next.push(sites.length);
        sites.push([k2, I + dI, J + dJ, K + dK]);
        if (sites.length > MOST_BALL_SITES) return null;
      }
    }
    ring = next;
  }
  const degree = [], inside = [], outside = [], outsideSites = new Map();
  for (const [kx, I, J, K] of sites) {
    const moves = lattice.movesOf(kx), mine = [], away = [];
    for (const [k2, dI, dJ, dK] of moves) {
      const key = lattice.keyOf(I + dI, J + dJ, K + dK, k2);
      if (numberOf.has(key)) mine.push(numberOf.get(key));
      else { away.push(key); outsideSites.set(key, [k2, I + dI, J + dJ, K + dK]); }
    }
    degree.push(moves.length);
    inside.push(mine);
    outside.push(away);
  }
  return { sites: sites, degree: degree, inside: inside, outside: outside, outsideSites: outsideSites };
}

// Solve (D - A) f = e (e: 1 at the middle, site 0, else 0) on a ball,
// by conjugate gradients, starting from f = 0.
function solveBall(ball) {
  const n = ball.sites.length;
  const f = new Float64Array(n), rest = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  rest[0] = 1; p[0] = 1;
  let restSquared = 1;
  function times(v, out) {     // out = (D - A) v
    for (let x = 0; x < n; x++) {
      let sum = ball.degree[x] * v[x];
      for (const y of ball.inside[x]) sum -= v[y];
      out[x] = sum;
    }
  }
  for (let round = 0; round < 20 * n && restSquared > 1e-30; round++) {
    times(p, Ap);
    let pAp = 0;
    for (let x = 0; x < n; x++) pAp += p[x] * Ap[x];
    const alpha = restSquared / pAp;
    let newSquared = 0;
    for (let x = 0; x < n; x++) {
      f[x] += alpha * p[x];
      rest[x] -= alpha * Ap[x];
      newSquared += rest[x] * rest[x];
    }
    const beta = newSquared / restSquared;
    for (let x = 0; x < n; x++) p[x] = rest[x] + beta * p[x];
    restSquared = newSquared;
  }
  return f;
}


/* =====================================================================
   3. THE LIST OF HELPERS, FOR WORKERS
   ---------------------------------------------------------------------
   A worker can't see this file, so a page copies these functions into
   it (runInWorker, js/sim-page.js). The constants go along as an
   object.
   ===================================================================== */
function walkHelpers() {
  return [siteKeyMaker, gridLattice, tilingLattice, honeycombLattice, longestMoveOf, distanceBetween, newSite, walkStep, cutsOf,
    ballJumps, pickFromCumulative, exitLaw, ballAround, solveBall,
    { GRID_MOVES: GRID_MOVES, MOST_BALL_SITES: MOST_BALL_SITES, ROOM_SPARE: ROOM_SPARE }];
}
