/* =====================================================================
   sim-polyomino.js  —  random polyominoes: a Markov chain whose
   long-run distribution is uniform (or tilted by two "heat" sliders)
   ---------------------------------------------------------------------
   A POLYOMINO with N cells is a set of N squares of the grid Z^2 that
   is connected through shared sides. Polyominoes that are translates
   of each other count as the same; rotations and reflections count as
   different (the "fixed" polyominoes). Holes are allowed. There are
   1, 2, 6, 19, 63, 216, 760, ... of them with N = 1, 2, 3, ... cells
   (OEIS A001168; D. H. Redelmeier, "Counting polyominoes: yet another
   attack", Discrete Math. 36 (1981) 191-203). Nobody has a formula,
   so a random one is drawn with a Markov chain instead.

   THE TARGET. With L(P) the EDGE PERIMETER (sides between a cell of P
   and a cell outside) and T(P) the SITE PERIMETER (cells outside P
   next to a cell of P), the chain's long-run law is
       pi(P)  proportional to  exp( b L(P) + s T(P) ),
   b and s being the two heat sliders. b = s = 0 is the uniform law.
     - L and the cycles of P's graph (cells joined across shared sides)
       are the same thing: each cell has 4 sides, so 4N = 2E + L with E
       the number of shared sides, and a connected graph has E - N + 1
       independent cycles (R. Diestel, "Graph Theory", 5th ed.,
       Springer, 2017, Section 1.9), so cycles = N + 1 - L/2. b < 0
       favors fat blobs, b > 0 stringy trees.
     - s = log(1 - p) gives p^N (1 - p)^T: the law of the cluster of a
       cell in Bernoulli site percolation with parameter p, given that
       it has N cells (E. Roldán, "Topological, geometric and
       combinatorial properties of random polyominoes", PhD thesis,
       CIMAT, 2018, Section 3.4 and Appendix A.1.3).

   THE MOVE (nadya's batch move). Draw n uniformly from 1, ..., K (K
   is the "up to K cells" slider; n at most N - 1). Then
     1. take out n cells X of P, a uniform pick of n of its N cells;
        call what is left R = P \ X;
     2. if some cell of X is not next to R, stop: P stays (the TOUCH
        RULE, below);
     3. put in n cells Y, a uniform pick of n cells of the site
        perimeter of R (cells outside R next to it; X's cells are among
        them, so Y may give some back);
     4. if R + Y is not connected, P stays;
     5. else move to P' = R + Y with chance min(1, pi(P') / pi(P))
        (Metropolis: N. Metropolis, A. W. Rosenbluth, M. N. Rosenbluth,
        A. H. Teller and E. Teller, J. Chem. Phys. 21 (1953) 1087-1092).
   Why pi is kept. Going from P to P' through the leftover R has chance
   P(n) / C(N, n) / C(|site perimeter of R|, n): it depends only on R
   and n, never on P or P'. The way back from P' through the same R
   (take out Y, put X back) has exactly the same chance, and is allowed
   exactly when the way there is: both need X and Y inside R's site
   perimeter. So steps 1-4 propose P -> P' as often as P' -> P, and
   step 5 makes the chain reversible for pi (D. A. Levin, Y. Peres and
   E. L. Wilmer, "Markov Chains and Mixing Times", 2nd ed., AMS 2017,
   Section 3.2). Without the touch rule the way back can be impossible:
   take the last two cells of a straight line; the end cell is not next
   to the rest, the line can turn into a shape the way back can't undo,
   and the chain drifts away from pi (the check page shows it).
   With n = 1 the touch rule always holds, and the move is Roldán's
   chain (her thesis, Appendix A.1.1; she proves it irreducible and
   aperiodic, Theorem 8, and starts it from the straight line of N
   cells). Here it starts from a round blob instead (nadya's choice):
   from a line only its two end cells can move, while from a blob most
   cells can, and in our runs with N = 200 the blob's shape settled two
   to three times sooner. Since n = 1 can always be drawn, every K gives an
   irreducible, aperiodic chain, so it converges to pi. How fast is not
   known in general; for a close cousin of n = 1 (Stauffer's move, with
   a Metropolis ratio) D. Coupier, J. Gheysens and N. Wicker, "Uniform
   sampling of fixed size polyominoes", Methodol. Comput. Appl. Probab.
   28 (2026) 2, prove a bound of order N^(c log N) moves.

   HOW IT IS KEPT. The chain keeps a grid of squares around P, with
   room to spare all round, and for each square of it: which cell of P
   is there (if any), how many of its 4 neighbors are in P (so the
   number of shared sides E, and the site perimeter, are updated as
   cells come and go), and where it is in the list of the site
   perimeter (so one of its cells can be drawn uniformly). When P comes
   near the grid's edge (it drifts as it changes), a new grid is made
   around it. The holes come from Euler's formula (squareEuler,
   js/sim-shape.js) when they are asked for: P is one piece, so
   holes = 1 - chi. Is R + Y connected? If R is, so is R + Y, as each
   cell of Y is next to R. Each piece of R has a cell next to X (P was
   connected), so R is connected exactly when its cells next to X are
   all joined through R; that is looked at first near X, which settles
   most moves. If R is in pieces, R + Y is connected exactly when R's
   cells next to X and Y's cells are all joined. Searches from all of
   them at once (allJoined) stop as soon as one of them has gone round
   a whole piece, so a small piece cut off costs little.

   RANDOM NUMBERS. Every choice in move m uses uniform numbers made from
   the seed and m (seededUniform, js/sim-worker.js), so the same seed
   gives the same run, and moving a slider changes only the moves it
   decides differently.

   Contents:
     newPolyomino(options)    the chain
     polyominoCells(options)  a random polyomino, after some moves (a
                              domain for Sequential Discrete Tiling)
     polyominoHelpers()       what a second thread needs for these
     polyominoDomain(cells)   some cells as a domain (js/sim-domains.js),
                              to draw them or run a sim on them
     The options on a page (K, b and s, written once into a page's
     placeholder, for Uniform Polyomino and Sequential Discrete Tiling):
     polyominoOptionsHTML(), connectPolyominoOptions(onChange)
   ===================================================================== */


// A new chain, started from the round blob of the N cells nearest (0,
// 0). "options":
//   cells        N, the number of cells (at least 1)
//   most         K: each move takes out n cells, n uniform from 1 to K
//   edgeHeat     b, the weight of the edge perimeter (0 if left out)
//   siteHeat     s, the weight of the site perimeter (0 if left out)
//   seed         the seed (any text)
//   noTouchRule  (the check page only) true: skip the touch rule, to show
//                the chain is then wrong
// Returns the chain:
//   chain.step()      one move; says whether P changed
//   chain.x, chain.y  the cells of P (lists of N whole numbers, in no
//                     particular order)
//   chain.moves       moves made so far; chain.changed, how many changed P
//   chain.most, chain.edgeHeat, chain.siteHeat   K, b and s (a page may
//                     change them as it runs)
//   chain.numbers()   { edgePerimeter, sitePerimeter, cycles, holes,
//                     width, height } of P now
function newPolyomino(options) {
  const N = options.cells, random = seededUniform(options.seed);
  const ROOM = 3;                 // P's cells stay at least this far from the grid's edge
  const chain = {
    x: new Int32Array(N), y: new Int32Array(N),
    moves: 0, changed: 0,
    most: options.most, edgeHeat: options.edgeHeat || 0, siteHeat: options.siteHeat || 0,
    step: step, numbers: numbers,
  };

  // What the chain keeps (see the top of this file).
  let size = 0;                   // cells in P now (N, except in the middle of a move)
  let shared = 0;                 // E: pairs of cells of P side by side
  const rim = { x: [], y: [] };   // the site perimeter, as a list
  // The grid: square (x, y) is spot (y - y0) * across + (x - x0). Its
  // neighbors are the spots 1 and "across" away.
  let x0 = 0, y0 = 0, across = 0, down = 0;
  let cellAt;                     // 1 + its place in chain.x, chain.y, or 0 for a square not in P
  let touch;                      // how many of its neighbors are in P
  let rimAt;                      // 1 + its place in the rim's list, or 0 for a square not on the rim
  let mark, team, stamp = 0;      // allJoined's notes, by spot
  let cramped = false;            // has a cell come too near the grid's edge?

  function spotOf(x, y) { return (y - y0) * across + (x - x0); }
  function sidesOf(spot) { return [spot + 1, spot - 1, spot + across, spot - across]; }
  function xOf(spot) { return spot % across + x0; }
  function yOf(spot) { return Math.floor(spot / across) + y0; }

  // A new grid around P's cells, with room to spare all round (half as
  // much again as P is wide or tall, and at least 8), and everything it
  // keeps worked out again.
  function makeGrid() {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < size; i++) {
      xmin = Math.min(xmin, chain.x[i]); xmax = Math.max(xmax, chain.x[i]);
      ymin = Math.min(ymin, chain.y[i]); ymax = Math.max(ymax, chain.y[i]);
    }
    const spare = 8 + Math.ceil(Math.max(xmax - xmin, ymax - ymin) / 2);
    x0 = xmin - spare; y0 = ymin - spare;
    across = xmax - xmin + 1 + 2 * spare; down = ymax - ymin + 1 + 2 * spare;
    cellAt = new Int32Array(across * down);
    touch = new Uint8Array(across * down);
    rimAt = new Int32Array(across * down);
    mark = new Int32Array(across * down);
    team = new Int32Array(across * down);
    stamp = 0;
    rim.x = []; rim.y = [];
    for (let i = 0; i < size; i++) cellAt[spotOf(chain.x[i], chain.y[i])] = i + 1;
    for (let i = 0; i < size; i++) for (const near of sidesOf(spotOf(chain.x[i], chain.y[i]))) touch[near]++;
    for (let i = 0; i < size; i++) {
      for (const near of sidesOf(spotOf(chain.x[i], chain.y[i]))) {
        if (cellAt[near] === 0 && rimAt[near] === 0) addToRim(near);
      }
    }
    cramped = false;
  }

  function addToRim(spot) {
    rim.x.push(xOf(spot));
    rim.y.push(yOf(spot));
    rimAt[spot] = rim.x.length;
  }
  // Take a square off the rim's list: the last one takes its place.
  function dropFromRim(spot) {
    const k = rimAt[spot] - 1, last = rim.x.length - 1;
    rimAt[spot] = 0;
    if (k !== last) {
      rim.x[k] = rim.x[last];
      rim.y[k] = rim.y[last];
      rimAt[spotOf(rim.x[k], rim.y[k])] = k + 1;
    }
    rim.x.pop();
    rim.y.pop();
  }

  // Put the cell (x, y) in P, keeping everything up to date.
  function addCell(x, y) {
    const spot = spotOf(x, y);
    if (rimAt[spot] > 0) dropFromRim(spot);
    cellAt[spot] = size + 1;
    chain.x[size] = x;
    chain.y[size] = y;
    size++;
    shared += touch[spot];
    for (const near of sidesOf(spot)) {
      touch[near]++;
      if (touch[near] === 1 && cellAt[near] === 0) addToRim(near);
    }
    if (x - x0 < ROOM || y - y0 < ROOM || x0 + across - 1 - x < ROOM || y0 + down - 1 - y < ROOM) cramped = true;
  }

  // Take the cell (x, y) out of P: the last cell of the lists takes its place.
  function removeCell(x, y) {
    const spot = spotOf(x, y), k = cellAt[spot] - 1, last = size - 1;
    cellAt[spot] = 0;
    if (k !== last) {
      chain.x[k] = chain.x[last];
      chain.y[k] = chain.y[last];
      cellAt[spotOf(chain.x[k], chain.y[k])] = k + 1;
    }
    size--;
    shared -= touch[spot];
    if (touch[spot] > 0) addToRim(spot);
    for (const near of sidesOf(spot)) {
      touch[near]--;
      if (touch[near] === 0 && rimAt[near] > 0) dropFromRim(near);
    }
  }

  // The start: the N cells nearest (0, 0), a round blob (cells as far
  // from (0, 0) as each other go in order of angle). It is one piece
  // with no holes, since every cell but (0, 0) has a side-neighbor
  // nearer (0, 0). The cells within "reach" of (0, 0) are more than N:
  // their squares cover the disk of radius reach - 1/sqrt(2), of area
  // more than N.
  const reach = Math.ceil(Math.sqrt(N / Math.PI)) + 1, near = [];
  for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) near.push([x, y]);
  near.sort(function ([a, b], [c, d]) { return (a * a + b * b) - (c * c + d * d) || Math.atan2(b, a) - Math.atan2(d, c); });
  for (let i = 0; i < N; i++) { chain.x[i] = near[i][0]; chain.y[i] = near[i][1]; }
  size = N;
  makeGrid();
  for (let i = 0; i < N; i++) shared += touch[spotOf(chain.x[i], chain.y[i])];
  shared /= 2;

  // Is the square at "spot" next to the leftover R = P minus the cells
  // "out" (a Set of spots)?
  function nextToLeftover(spot, out) {
    for (const near of sidesOf(spot)) if (cellAt[near] > 0 && !out.has(near)) return true;
    return false;
  }

  // A pick of n different squares, as lists xs, ys and the Set of their
  // spots. draw(j) gives the j-th try's square as [x, y]; a try is kept
  // if it is new and ok(spot).
  function pick(n, draw, ok) {
    const xs = [], ys = [], spots = new Set();
    for (let j = 0; spots.size < n; j++) {
      const [x, y] = draw(j), spot = spotOf(x, y);
      if (spots.has(spot) || !ok(spot)) continue;
      spots.add(spot);
      xs.push(x);
      ys.push(y);
    }
    return { xs: xs, ys: ys, spots: spots };
  }

  // n different cells of P, a uniform pick (random numbers of move m,
  // labeled 1).
  function pickFromP(m, n) {
    return pick(n, function (j) {
      const k = Math.floor(random.uniform(m, 1, j) * N);
      return [chain.x[k], chain.y[k]];
    }, function () { return true; });
  }

  // n different cells of the site perimeter of R = P minus X, a uniform
  // pick (random numbers of move m, labeled 2). How: draw uniformly from
  // P's rim and X together (which hold all of R's site perimeter) and
  // keep a cell only if it is next to R and not picked yet.
  function pickFromLeftoverRim(m, n, X) {
    const outside = rim.x.length, choices = outside + n;
    return pick(n, function (j) {
      const k = Math.floor(random.uniform(m, 2, j) * choices);
      return k < outside ? [rim.x[k], rim.y[k]] : [X.xs[k - outside], X.ys[k - outside]];
    }, function (spot) { return nextToLeftover(spot, X.spots); });
  }

  // How many cells the site perimeter of R = P minus X has: the rim of
  // P, less its cells next to X that are not next to R, plus X's cells
  // that are next to R.
  function leftoverRimSize(X) {
    let count = rim.x.length;
    const seen = new Set();
    for (const spot of X.spots) {
      if (nextToLeftover(spot, X.spots)) count++;
      for (const near of sidesOf(spot)) {
        if (seen.has(near) || rimAt[near] === 0) continue;
        seen.add(near);
        if (!nextToLeftover(near, X.spots)) count--;
      }
    }
    return count;
  }

  // Is P connected, after X went out and Y came in? (See the top of
  // this file.)
  function stillConnected(X, Y) {
    const nearX = new Set();
    for (const spot of X.spots) for (const near of sidesOf(spot)) if (cellAt[near] > 0 && !Y.spots.has(near)) nearX.add(near);
    const box = boxAround(X.xs, X.ys, 1);   // (js/sim-domains.js)
    const inR = function (spot) { return !Y.spots.has(spot); };
    const inRNearX = function (spot) {
      const x = xOf(spot), y = yOf(spot);
      return x >= box.xmin && x <= box.xmax && y >= box.ymin && y <= box.ymax && inR(spot);
    };
    if (allJoined(nearX, inRNearX) || allJoined(nearX, inR)) return true;
    const wanted = new Set(nearX);
    for (const spot of Y.spots) wanted.add(spot);
    return allJoined(wanted, function () { return true; });
  }

  // Are the cells "wanted" (spots of cells of P) all joined to each
  // other through cells of P that pass allowed(spot)? A search spreads
  // from each of them at once, one cell at a time in turn, and two
  // searches that meet become one. It stops as soon as there is one
  // search left (yes), or a search has nowhere left to go while others
  // remain (no: it went round a whole piece without meeting them). So a
  // small piece cut off is found after about as many steps as it has
  // cells, not as many as P has. A spot's notes count only when
  // mark[spot] is this search's stamp (so they need no clearing).
  function allJoined(wanted, allowed) {
    if (wanted.size <= 1) return true;
    stamp++;
    const queues = [], leader = [], waiting = [];
    for (const spot of wanted) {
      mark[spot] = stamp;
      team[spot] = queues.length;
      leader.push(queues.length);
      waiting.push(1);
      queues.push([spot]);
    }
    let searches = queues.length;
    const find = function (t) { while (leader[t] !== t) t = leader[t] = leader[leader[t]]; return t; };
    for (let turn = 0; ; turn = (turn + 1) % queues.length) {
      const queue = queues[turn];
      if (queue.length === 0) continue;
      const spot = queue.pop(), mine = find(turn);
      waiting[mine]--;
      for (const near of sidesOf(spot)) {
        if (cellAt[near] === 0 || !allowed(near)) continue;
        if (mark[near] !== stamp) {
          mark[near] = stamp;
          team[near] = turn;
          queue.push(near);
          waiting[mine]++;
          continue;
        }
        const other = find(team[near]);
        if (other === mine) continue;
        leader[other] = mine;                    // the two searches met: now one
        waiting[mine] += waiting[other];
        if (--searches === 1) return true;
      }
      if (waiting[mine] === 0) return false;    // a whole piece, without the others
    }
  }

  // Swap the cells "from" out of P and the cells "to" in.
  function swapCells(from, to) {
    for (let i = 0; i < from.xs.length; i++) removeCell(from.xs[i], from.ys[i]);
    for (let i = 0; i < to.xs.length; i++) addCell(to.xs[i], to.ys[i]);
  }

  function sameCells(X, Y) {
    for (const spot of Y.spots) if (!X.spots.has(spot)) return false;
    return true;
  }

  // log pi(P), up to a constant.
  function logWeight() { return chain.edgeHeat * (4 * N - 2 * shared) + chain.siteHeat * rim.x.length; }

  // One move (see the top of this file).
  function step() {
    const m = ++chain.moves;
    if (N < 2) return false;
    const n = Math.min(1 + Math.floor(random.uniform(m, 0) * chain.most), N - 1);
    const X = pickFromP(m, n);
    if (!options.noTouchRule) {
      for (const spot of X.spots) if (!nextToLeftover(spot, X.spots)) return false;
    }
    if (leftoverRimSize(X) < n) return false;
    const Y = pickFromLeftoverRim(m, n, X);
    if (sameCells(X, Y)) return false;
    const before = logWeight();
    swapCells(X, Y);
    const keep = stillConnected(X, Y) && random.uniform(m, 3) < Math.exp(logWeight() - before);
    if (!keep) swapCells(Y, X);
    else chain.changed++;
    if (cramped) makeGrid();
    return keep;
  }

  // The numbers of P now. (The holes by Euler's formula, worked out
  // afresh: P is one piece, so holes = 1 - chi.)
  function numbers() {
    const euler = squareEuler();   // (js/sim-shape.js)
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < N; i++) {
      euler.add(chain.x[i], chain.y[i]);
      xmin = Math.min(xmin, chain.x[i]); xmax = Math.max(xmax, chain.x[i]);
      ymin = Math.min(ymin, chain.y[i]); ymax = Math.max(ymax, chain.y[i]);
    }
    return {
      edgePerimeter: 4 * N - 2 * shared, sitePerimeter: rim.x.length,
      cycles: shared - N + 1, holes: 1 - euler.chi(),
      width: xmax - xmin + 1, height: ymax - ymin + 1,
    };
  }

  return chain;
}


// A random polyomino: "options" as for newPolyomino, and "moves", how
// many moves of the chain to make. Returns its cells, { x, y }.
function polyominoCells(options) {
  const chain = newPolyomino(options);
  while (chain.moves < options.moves) chain.step();
  return { x: chain.x, y: chain.y };
}


// What a second thread needs for these (runInWorker, js/sim-page.js):
// this file's functions, Euler's formula (js/sim-shape.js), the box
// around some cells (js/sim-domains.js) and the random numbers
// (js/sim-worker.js).
function polyominoHelpers() {
  return [newPolyomino, polyominoCells, squareEuler, boxAround, seededUniform];
}


// The cells { x, y } (lists of whole numbers) as a domain, the kind
// every sim on cells uses (makeDomain, js/sim-domains.js): cells are
// neighbors when they share a side. (On the page only.)
function polyominoDomain(cells) {
  const index = new Map(), edges = [];
  for (let v = 0; v < cells.x.length; v++) index.set(cells.x[v] + "," + cells.y[v], v);
  for (let v = 0; v < cells.x.length; v++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const w = index.get((cells.x[v] + dx) + "," + (cells.y[v] + dy));
      if (w !== undefined) edges.push([v, w]);
    }
  }
  return makeDomain(Array.from(cells.x), Array.from(cells.y), edges, null, null);
}


/* =====================================================================
   THE OPTIONS ON A PAGE
   ---------------------------------------------------------------------
   The chain's K, b and s, each a slider with a box, and the p that s
   stands for, with a "p = p_c" button. A page holds an empty box for
   them,
     <div class="polyomino-options" data-headings></div>
   which is filled in as the page loads (polyominoOptionsHTML), and
   connectPolyominoOptions makes them work. With data-headings each
   option gets a heading of its own (Uniform Polyomino, where they are
   the main options); without, each is one named row (Sequential
   Discrete Tiling, where they sit under the Domain heading).
   ===================================================================== */

// K, b and s at the start (b = s = 0: uniform), and the sliders' ends
// (the boxes take any number; K at most POLYOMINO_MOST).
const POLYOMINO_DEFAULTS = { most: 1, edgeHeat: 0, siteHeat: 0 };
const POLYOMINO_MOST = 10;
const POLYOMINO_HEAT = { edge: [-2, 2], site: [-5, 2] };

// The critical point of Bernoulli site percolation on the square grid,
// p_c = 0.59274621(13), known only numerically (M. E. J. Newman and R.
// M. Ziff, "Efficient Monte Carlo algorithm and high-precision results
// for percolation", Phys. Rev. Lett. 85 (2000) 4104-4107).
const SITE_PC = 0.59274621;

fillBlocks(".polyomino-options", polyominoOptionsHTML);

// The options, as HTML, with a heading for each (settings.headings,
// from data-headings) or else a label at the start of its row.
function polyominoOptionsHTML(settings) {
  function slider(heading, label, name, id, min, max, step) {
    const box = '<input type="number" id="' + id + '-box" step="' + step + '"' +
      (id === "most" ? ' min="1" max="' + max + '"' : "") + '>';
    const range = '<input type="range" class="wide-range" id="' + id + '-slider" min="' + min + '" max="' + max +
      '" step="' + step + '">';
    return "headings" in settings
      ? '<h3 class="option-heading">' + heading + '</h3><div class="option-row">' + name + " = " + box + " " + range + "</div>"
      : '<div class="option-row">' + label + ": " + name + " = " + box + " " + range + "</div>";
  }
  return slider("Cells moved at once, up to K", "Cells moved at once", "K", "most", 1, POLYOMINO_MOST, 1) +
    '<p class="muted small">Each move takes out n cells, n anywhere from 1 to K, and puts n back. ' +
      "K = 1 is Rold&aacute;n's chain.</p>" +
    slider("Edge perimeter heat b", "Edge perimeter heat", "b", "edge", POLYOMINO_HEAT.edge[0], POLYOMINO_HEAT.edge[1], 0.01) +
    '<p class="muted small">b &gt; 0 favors a long edge perimeter (stringy), b &lt; 0 a short one ' +
      "(round, with many cycles).</p>" +
    slider("Site perimeter heat s", "Site perimeter heat", "s", "site", POLYOMINO_HEAT.site[0], POLYOMINO_HEAT.site[1], 0.01) +
    '<div class="option-row"><button class="tool-button" id="site-critical" ' +
      'title="Set s to the critical point of site percolation">p = p<sub>c</sub></button> ' +
      '<span class="muted small" id="site-p"></span></div>' +
    '<p class="muted small">Both heats at 0: every polyomino with N cells is equally likely.</p>';
}

// Make the options work (each slider and its box move together:
// connectSliderAndBox, js/sim-page.js), starting from
// POLYOMINO_DEFAULTS. Every change calls onChange(). Returns the values
// now, kept up to date: { most, edgeHeat, siteHeat }, as newPolyomino
// takes them.
function connectPolyominoOptions(onChange) {
  const values = Object.assign({}, POLYOMINO_DEFAULTS);
  const showMost = connectSliderAndBox("most-slider", "most-box", function (value) {
    values.most = showMost(value);
    onChange();
  });
  const showEdgeHeat = connectSliderAndBox("edge-slider", "edge-box", function (value) {
    values.edgeHeat = showEdgeHeat(value);
    onChange();
  });
  const showSiteHeat = connectSliderAndBox("site-slider", "site-box", function (value) {
    setSiteHeat(value);
    onChange();
  });

  // A new s, and the percolation p it stands for when s < 0: s = log(1 - p).
  function setSiteHeat(value) {
    values.siteHeat = showSiteHeat(value);
    byId("site-p").textContent = values.siteHeat < 0
      ? "With b = 0, this is site percolation with p = 1 − e^s = " + (1 - Math.exp(values.siteHeat)).toFixed(4) + "."
      : values.siteHeat === 0 ? "s = 0: no tilt (percolation as p goes to 0)."
      : "s > 0 favors a long site perimeter: no percolation p does that.";
  }

  // The button that sets p = p_c, s = log(1 - p_c).
  byId("site-critical").addEventListener("click", function () {
    setSiteHeat(Math.log(1 - SITE_PC));
    onChange();
  });

  showMost(values.most);
  showEdgeHeat(values.edgeHeat);
  setSiteHeat(values.siteHeat);
  return values;
}
