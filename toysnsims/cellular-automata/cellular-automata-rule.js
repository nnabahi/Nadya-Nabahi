/* =====================================================================
   cellular-automata-rule.js  —  the rule behind the "Cellular automata"
   sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Every cell of a tape (1D) or a grid (2D) is in one of b states,
     0 .. b-1. At each step, every cell looks at its neighborhood: k
     cells at fixed offsets from it (picked on the clickable grid; the
     cell itself may or may not be one of them). All cells change at
     once, by the same rule.

     The rule is a number n, numbered as S. Wolfram does ("Statistical
     mechanics of cellular automata", Rev. Mod. Phys. 55 (1983)
     601-644):
       - List the neighborhood in a fixed order: in 1D from left to
         right; in 2D from the bottom-left cell, row by row (each row
         left to right), to the top-right cell. The cell itself, if it is
         in, keeps its place in the list.
       - Read the states of the listed cells, c_0 c_1 ... c_(k-1), as a
         number written in base b, the first one the most significant
         digit:   C = c_0 b^(k-1) + c_1 b^(k-2) + ... + c_(k-1).
         So 0 <= C < b^k: C says which of the b^k possible
         "configurations" the neighborhood is in.
       - The cell's new state is digit number C of n written in base b,
         counting from the right (digit 0 is the last, least significant
         one). There are b^(b^k) rules, 0 <= n < b^(b^k).
     For example, b = 2 and the neighborhood {left, itself, right}:
     rule 30 = 00011110 in base 2, so a cell whose neighborhood reads
     100 (C = 4) becomes digit 4 of 00011110, which is 1.

     The rule numbers can be huge (Conway's Game of Life is a number
     with 140 digits), so the page keeps n as a BigInt (a whole number
     with as many digits as it needs) and turns it, once, into a table:
     table[C] = the new state for configuration C. A step is then one
     look-up per cell.

     Edges: the cells just outside the tape or grid are filled in before
     every step, in one of three ways:
       "wrap"    the tape is a ring and the grid a torus: the cells past
                 the right edge are the ones at the left edge, and so on
       "fixed"   every cell outside is in state k (one fixed state)
       "random"  every cell outside is in a uniformly random state, new
                 at every step

   The file has two parts, with no drawing and no buttons:
     1. orderNeighborhood, ruleTable, lifeRuleNumber, newAutomaton,
        automatonStart and stateHash: the rule, a start, and a short
        "fingerprint" of a state (to notice when the run repeats). The
        check page (cellular-automata-check.html) tests them in the
        browser.
     2. automatonWorker(): runs it in a second thread (a "Web Worker")
        for the sim page, cellular-automata.js, so the page never
        freezes. runInWorker (js/sim-page.js) starts it, with
        newAutomaton, automatonStart, stateHash and the trace
        (js/sim-worker.js) copied in.
   ===================================================================== */


/* =====================================================================
   1. THE RULE
   ===================================================================== */

// The neighborhood in the order the rule reads it: in 1D from left to
// right; in 2D the bottom row first, each row from left to right. Each
// offset is [x] in 1D or [x, y] in 2D (y goes up).
function orderNeighborhood(offsets) {
  return offsets.slice().sort(function (s, t) {
    if (s.length === 1) return s[0] - t[0];
    return (s[1] - t[1]) || (s[0] - t[0]);
  });
}

// The rule table for rule n (a BigInt), b states and k cells:
// table[C] = digit number C of n in base b, counting from the right,
// for C = 0 .. b^k - 1. Digits past the end of n are 0, and digits of a
// too big n past b^k are not used (so a too big n works as
// n mod b^(b^k)). toString(b) writes n in base b (b from 2 to 36, with
// the letters a, b, c, ... as the digits past 9).
function ruleTable(n, b, k) {
  const size = b ** k;
  const digits = n.toString(b);   // most significant digit first
  const table = new Uint8Array(size);
  for (let C = 0; C < size && C < digits.length; C++) {
    table[C] = parseInt(digits[digits.length - 1 - C], b);
  }
  return table;
}

// The rule number (a BigInt) of a "Life-like" rule with 2 states, for
// the neighborhood "ordered" (in the order of orderNeighborhood, with
// the cell itself, [0, 0], in it): a cell in state 0 is born (becomes
// 1) when the number of its other cells in state 1 is in the list
// "born", and a cell in state 1 survives (stays 1) when that number is
// in "survive"; otherwise the cell becomes 0. Conway's Game of Life is
// born [3], survive [2, 3] on the 8 cells around a cell (M. Gardner,
// "Mathematical Games", Scientific American 223(4) (1970) 120-123).
// Built digit by digit from the most significant one: digit C is the
// new state for configuration C.
function lifeRuleNumber(ordered, born, survive) {
  const k = ordered.length;
  const self = k - 1 - ordered.findIndex(function (t) { return t[0] === 0 && t[1] === 0; });  // the cell's binary digit in C
  let n = 0n;
  for (let C = 2 ** k - 1; C >= 0; C--) {
    let ones = 0;
    for (let i = 0; i < k; i++) ones += (C >> i) & 1;
    const alive = (C >> self) & 1;
    const next = alive ? survive.includes(ones - 1) : born.includes(ones);
    n = 2n * n + (next ? 1n : 0n);
  }
  return n;
}

// A tape or grid of cells that follows the rule. options:
//   width, height   its size (height = 1 for a tape); cell (x, y) is
//                   cells[y * width + x], with y = 0 the bottom row
//   offsets         the neighborhood, in the order of orderNeighborhood
//   table           from ruleTable
//   b               the number of states
//   edge            "wrap", "fixed" or "random"; edgeState is the state
//                   outside for "fixed"
//   cells           the start (a list of states, one per cell)
//   random          uniform numbers in [0, 1), for "random" edges
// Returns the automaton: its cells (the current state) and step().
//
// How a step works: the cells are copied into a bigger grid, "padded",
// with a frame around them as wide as the neighborhood reaches, and the
// frame is filled in by the edge rule. Then every cell's configuration
// C can be read straight off the padded grid, the same way for every
// cell, edge or not.
function newAutomaton(options) {
  const W = options.width, H = options.height, b = options.b, table = options.table;
  const random = options.random, edge = options.edge, edgeState = options.edgeState;
  const offsets = options.offsets, k = offsets.length;
  const auto = { cells: Uint8Array.from(options.cells) };

  // How far the neighborhood reaches across (rx) and up or down (ry),
  // and the padded grid, PW x PH.
  let rx = 0, ry = 0;
  for (const t of offsets) {
    rx = Math.max(rx, Math.abs(t[0]));
    if (t.length > 1) ry = Math.max(ry, Math.abs(t[1]));
  }
  const PW = W + 2 * rx, PH = H + 2 * ry;
  const padded = new Uint8Array(PW * PH);
  // Where each listed cell is in the padded grid, from the cell itself.
  const jumps = offsets.map(function (t) { return t[0] + (t.length > 1 ? t[1] : 0) * PW; });
  let next = new Uint8Array(W * H);

  // Fill the padded grid: the cells, and the frame by the edge rule.
  function pad() {
    const cells = auto.cells;
    for (let py = 0; py < PH; py++) {
      const y = py - ry;
      for (let px = 0; px < PW; px++) {
        const x = px - rx;
        let state;
        if (x >= 0 && x < W && y >= 0 && y < H) state = cells[y * W + x];
        else if (edge === "wrap") state = cells[(((y % H) + H) % H) * W + (((x % W) + W) % W)];
        else if (edge === "fixed") state = edgeState;
        else state = Math.floor(random() * b);
        padded[py * PW + px] = state;
      }
    }
  }

  // One step: every cell at once.
  auto.step = function () {
    pad();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const here = (y + ry) * PW + (x + rx);
        let C = 0;
        for (let i = 0; i < k; i++) C = C * b + padded[here + jumps[i]];   // read the digits, first one most significant
        next[y * W + x] = table[C];
      }
    }
    const old = auto.cells;
    auto.cells = next;
    next = old;
  };

  return auto;
}

// The start: "one" (every cell 0 but the middle one, in state 1),
// "random" (every cell a uniformly random state), "zeros" (every cell
// 0), or "drawn" (the cells "drawn", as drawn on the page).
function automatonStart(kind, W, H, b, drawn, random) {
  const cells = new Uint8Array(W * H);
  if (kind === "one") cells[Math.floor(H / 2) * W + Math.floor(W / 2)] = 1;
  else if (kind === "random") for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(random() * b);
  else if (kind === "drawn" && drawn && drawn.length === cells.length) cells.set(drawn);
  return cells;
}

// A "fingerprint" of a state: a whole number below 2^53 that changes
// completely when any cell changes, so two states with the same
// fingerprint are, all but certainly, the same state. This is the
// public-domain hash "cyrb53" by bryc
// (https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js).
function stateHash(cells) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < cells.length; i++) {
    h1 = Math.imul(h1 ^ cells[i], 2654435761);
    h2 = Math.imul(h2 ^ cells[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}


/* =====================================================================
   2. THE WORKER: RUNNING IT IN A SECOND THREAD
   ---------------------------------------------------------------------
   It talks to the page the way every sim's worker does (serveRun,
   js/sim-worker.js). Its own messages:
     setup  { dim, width, height, rows, b, offsets, table, edge,
              edgeState, start, drawn, seed, mode, toStep, look, links }
                         a new run from the start. "links" are the
                         tape's or grid's cells as a domain, with 4
                         and with 8 neighbors ({ 4: ..., 8: ... }), for
                         counting the clusters. In 1D, "rows" is how
                         many rows the picture shows and "mode" is
                         "fill" (stop when the picture is full) or
                         "scroll" (the oldest row leaves at the top;
                         every row is kept, so you can scroll back).
                         With toStep > 0, the run is made again up to
                         that step at once (a changed rule shows the
                         same moment of the run), for at most about a
                         second of work. "look" is as below.
     look   { last }     1D: show the rows up to step "last" (to scroll
                         back through the run), or the newest ones as
                         they come (last = null)
   It reports the cells, in 1D the picture (the tape over time), and
   the numbers for the Statistics box. In 1D fill mode the run is done
   (and pauses by itself) once the picture is full.
   ===================================================================== */
function automatonWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  const MAX_REMEMBERED = 200000;   // look for a repeat among this many states at most
  const REPLAY_BUDGET = 1000;      // milliseconds: the most time a "toStep" may take
  const MAX_HISTORY = 20000000;    // 1D: keep at most this many cells of old rows (the oldest go first)

  let m = null;               // the setup message
  let auto = null, time = 0;
  let history = [];           // 1D: every row so far (the tape at each step), from step "oldest" on
  let oldest = 0;
  let look = null;            // 1D: the last step to show, or null for the newest
  let seen = null;            // fingerprint -> the step it was first seen at
  let repeat = null;          // { first, period } once the run comes back to an earlier state
  let trace = null;           // the run so far, for the charts over time (keepSample, js/sim-worker.js)
  let counts = null, interface4 = 0, interface8 = 0;

  // The statistics of the current tape or grid: the cells in each
  // state, and the interface: neighbor pairs in different states, side
  // by side or one above the other (interface4), and also corner to
  // corner (interface8). Pairs across the edge count only when the
  // edges wrap around.
  function measure() {
    const W = m.width, H = m.height, cells = auto.cells, wrapping = m.edge === "wrap";
    counts = new Int32Array(m.b);
    let sides = 0, corners = 0;
    function differ(x, y, x2, y2) {
      if (x2 < 0 || x2 >= W || y2 < 0 || y2 >= H) {
        if (!wrapping) return 0;
        x2 = ((x2 % W) + W) % W;
        y2 = ((y2 % H) + H) % H;
      }
      return cells[y * W + x] !== cells[y2 * W + x2] ? 1 : 0;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Each pair once: the cell to the right, the one above, and (2D)
        // the two corners on the right. (The page keeps sizes at least 3,
        // so wrapping around never meets the same pair twice.)
        counts[cells[y * W + x]]++;
        sides += differ(x, y, x + 1, y);
        if (H > 1) {
          sides += differ(x, y, x, y + 1);
          corners += differ(x, y, x + 1, y + 1) + differ(x, y, x + 1, y - 1);
        }
      }
    }
    interface4 = sides;
    interface8 = sides + corners;
  }

  // 1D: keep the tape as it is now. A very long run drops its oldest
  // rows, 1000 at a time, to stay under MAX_HISTORY cells.
  function keepRow() {
    if (m.dim !== 1) return;
    history.push(auto.cells.slice());
    if ((history.length - 1000) * m.width > MAX_HISTORY) {
      history.splice(0, 1000);
      oldest += 1000;
    }
  }

  // 1D: the picture, rows x width, -1 where there is no row: the rows
  // up to step "look" (or the newest), the earliest at the top. (Row
  // y = 0 is the bottom row.)
  function makePicture() {
    const W = m.width, R = m.rows;
    const last = look === null ? time : Math.min(Math.max(look, oldest + R - 1), time);
    const first = Math.max(oldest, last - R + 1);
    const picture = new Int8Array(R * W).fill(-1);
    for (let t = first; t <= last; t++) picture.set(history[t - oldest], (R - 1 - (t - first)) * W);
    return { picture: picture, first: first, last: last };
  }

  // Look for the current state among the earlier ones. (With random
  // edges the run never truly repeats, so it doesn't look.)
  function lookForRepeat() {
    if (repeat || m.edge === "random" || seen.size >= MAX_REMEMBERED) return;
    const key = stateHash(auto.cells);
    if (seen.has(key)) repeat = { first: seen.get(key), period: time - seen.get(key) };
    else seen.set(key, time);
  }

  // A sample for the charts. The clusters (connected pieces of one
  // state) of each state, through 4 and through 8 neighbors, are
  // counted only when a sample is due (countPieces, js/sim-domains.js,
  // copied in by the page), since that looks at every cell.
  function takeSample() {
    keepSample(trace, time, function () {
      return { counts: counts, interface4: interface4, interface8: interface8,
               pieces4: countPieces(m.links[4], auto.cells, m.b), pieces8: countPieces(m.links[8], auto.cells, m.b) };
    });
  }

  // 1D in fill mode: done once the picture is full.
  function isDone() { return m.dim === 1 && m.mode === "fill" && time >= m.rows - 1; }

  function setup(message) {
    m = message;
    const cells = automatonStart(m.start, m.width, m.height, m.b, m.drawn, new Math.seedrandom(m.seed + " start"));
    auto = newAutomaton({ width: m.width, height: m.height, offsets: m.offsets, table: m.table, b: m.b,
                          edge: m.edge, edgeState: m.edgeState, cells: cells,
                          random: new Math.seedrandom(m.seed + " edges") });
    time = 0;
    repeat = null;
    seen = new Map();
    trace = newTrace();
    history = [];
    oldest = 0;
    look = m.look;
    keepRow();
    lookForRepeat();
    measure();
    takeSample();
    const until = performance.now() + REPLAY_BUDGET;
    while (time < m.toStep && !isDone() && performance.now() < until) oneStep();
  }

  function oneStep() {
    auto.step();
    time++;
    keepRow();
    lookForRepeat();
    measure();
    takeSample();
  }

  function report(send) {
    const shown = m.dim === 1 ? makePicture() : null;
    send({
      time: time, cells: auto.cells.slice(),
      picture: shown && shown.picture, shownFirst: shown && shown.first, shownLast: shown && shown.last,
      oldest: oldest, done: isDone(),
      counts: counts.slice(), interface4: interface4, interface8: interface8,
      repeat: repeat, checked: seen.size, randomEdges: m.edge === "random",
      traceTimes: Float64Array.from(trace.times), traceCounts: Int32Array.from(trace.lists.counts),
      traceInterface4: Float64Array.from(trace.lists.interface4),
      traceInterface8: Float64Array.from(trace.lists.interface8),
      tracePieces4: Int32Array.from(trace.lists.pieces4), tracePieces8: Int32Array.from(trace.lists.pieces8),
    });
  }

  serveRun({
    setup: setup, steps: oneStep, isDone: isDone, report: report,
    messages: {
      look: function (message) { look = message.last; },
    },
  });
}
