/* =====================================================================
   sandpiles-pile.js  —  the toppling rule behind the "Sandpiles" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Every cell v of the domain holds height[v] grains of sand. Each cell
     has a threshold: its number of neighbors in the full lattice (4 or
     8), counting neighbors that lie outside the domain. A cell with at
     least that many grains is unstable and may TOPPLE: it loses
     threshold grains, and each of its neighbors gains one. A grain sent
     to a neighbor outside the domain leaves the system: it falls into
     the "sink". A cell can also be made a sink cell itself (the torus
     with one sink): it never holds sand and eats every grain it gets.

   This is the abelian sandpile of P. Bak, C. Tang and K. Wiesenfeld,
   "Self-organized criticality", Phys. Rev. Lett. 59 (1987) 381-384,
   written for any graph as in D. Dhar, "Self-organized critical state
   of sandpile automaton models", Phys. Rev. Lett. 64 (1990) 1613-1616.

   The abelian property (Dhar 1990): the final stable pile, and how many
   times each cell topples on the way, do NOT depend on the order of
   the topples. So the order only changes the animation. nadya's rule
   for the animation is to pick the next cell uniformly among the
   unstable ones (her Sandpiles.js). "Jump to the end" (stabilize below)
   uses any order it likes, and gets the same answer.

   No sink at all (the torus without a sink cell): grains can never
   leave, so the pile may topple forever. A. Björner, L. Lovász and
   P. Shor, "Chip-firing games on graphs", European J. Combin. 12
   (1991) 283-291: on a connected graph, if every cell has toppled at
   least once, the toppling never ends. So the pile watches for that
   and reports "never stabilizes".

   The identity. For any domain with a sink, among the "recurrent" piles
   (the ones that come back again and again when grains are dropped at
   random) there is one, the identity e, such that adding e to a
   recurrent pile c and toppling gives back c. With M the fullest stable
   pile (threshold - 1 grains on every cell) and ° meaning "topple until
   stable",
                         e = ( 2M - (2M)° )°
   (Y. Le Borgne and D. Rossin, "On the identity of the sandpile group",
   Discrete Math. 256 (2002) 775-790; see also A. E. Holroyd, L. Levine,
   K. Mészáros, Y. Peres, J. Propp and D. B. Wilson, "Chip-firing and
   rotor-routing on directed graphs", 2008). Why: 2M - (2M)° differs from
   the empty pile only by topples, and it is at least M everywhere,
   which makes its stable version recurrent; e is the only recurrent
   pile that differs from the empty pile only by topples.

   Recurrent or not: Dhar's "burning test" (Dhar 1990). Add to every
   cell one grain for each of its edges to the sink, then topple until
   stable. The pile was recurrent exactly when every cell toppled once.

   The file has no drawing and no buttons. The check page
   (sims/sandpiles-check.html) tests it in the browser.
   ===================================================================== */


// Make a new sandpile. "options" has:
//   domain      a domain from js/sim-domains.js (box, torus or drawn)
//   threshold   a number (4 or 8: the lattice's number of neighbors), or
//               a list with one threshold per cell
//   sinks       (optional) a list of cells that are sink cells
// The pile starts empty; use setHeights to fill it.
function newPile(options) {
  const d = options.domain;
  const n = d.n;

  // ---------- the graph, worked out once ----------

  const threshold = new Int32Array(n);
  const isSink = new Uint8Array(n);
  for (const s of options.sinks || []) isSink[s] = 1;
  // offEdge[v] = grains that leave the system when v topples: one per
  // lattice neighbor outside the domain.
  const offEdge = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    threshold[v] = typeof options.threshold === "number" ? options.threshold : options.threshold[v];
    offEdge[v] = threshold[v] - (d.first[v + 1] - d.first[v]);
    if (offEdge[v] < 0) throw new Error("cell " + v + " has more neighbors than its threshold");
  }

  // Split the cells (sink cells left out) into connected pieces, and
  // note which pieces can lose grains (a "leaky" piece). A piece that
  // can't is the "no sink" case above.
  const piece = new Int32Array(n).fill(-1);
  const pieceSize = [], pieceLeaky = [];
  for (let start = 0; start < n; start++) {
    if (isSink[start] || piece[start] !== -1) continue;
    const p = pieceSize.length;
    let size = 0, leaky = false;
    const queue = [start];
    piece[start] = p;
    while (queue.length > 0) {
      const v = queue.pop();
      size++;
      if (offEdge[v] > 0) leaky = true;
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (isSink[w]) { leaky = true; continue; }
        if (piece[w] === -1) { piece[w] = p; queue.push(w); }
      }
    }
    pieceSize.push(size);
    pieceLeaky.push(leaky);
  }
  const hasSink = pieceLeaky.every(function (leaky) { return leaky; });

  // ---------- the state ----------

  const height = new Int32Array(n);       // grains on each cell
  const odometer = new Float64Array(n);   // how many times each cell toppled
  const pile = {
    domain: d, threshold: threshold, isSink: isSink, offEdge: offEdge,
    height: height, odometer: odometer,
    hasSink: hasSink,     // false: some piece can never lose grains
    topples: 0,           // topples so far
    lost: 0,              // grains that fell into the sink
    startGrains: 0,       // grains when setHeights was last called
    added: 0,             // grains added since (removed ones count as minus)
    neverStabilizes: false,
  };

  // The unstable cells, kept in a list so one can be picked uniformly.
  // where[v] = position of v in the list, or -1.
  const unstable = new Int32Array(n);
  const where = new Int32Array(n).fill(-1);
  let unstableCount = 0;

  // Put v in the list or take it out, whichever is right now.
  function refresh(v) {
    const should = !isSink[v] && height[v] >= threshold[v];
    if (should && where[v] === -1) {
      where[v] = unstableCount;
      unstable[unstableCount++] = v;
    } else if (!should && where[v] !== -1) {
      // Move the last cell of the list into v's place.
      const last = unstable[--unstableCount];
      unstable[where[v]] = last;
      where[last] = where[v];
      where[v] = -1;
    }
  }

  // For the "no sink" check: which cells have toppled since the check
  // was last restarted, and how many in each piece.
  const toppledSince = new Uint8Array(n);
  const piecesToppled = new Int32Array(pieceSize.length);
  function restartNoSinkCheck() {
    toppledSince.fill(0);
    piecesToppled.fill(0);
    pile.neverStabilizes = false;
  }
  function noteTopple(v) {
    if (toppledSince[v]) return;
    toppledSince[v] = 1;
    const p = piece[v];
    piecesToppled[p]++;
    if (!pieceLeaky[p] && piecesToppled[p] === pieceSize[p]) pile.neverStabilizes = true;
  }

  // Topple cell v "times" times at once (all the toppling goes through here).
  function toppleTimes(v, times) {
    height[v] -= times * threshold[v];
    odometer[v] += times;
    pile.topples += times;
    pile.lost += times * offEdge[v];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (isSink[w]) pile.lost += times;
      else height[w] += times;
    }
    noteTopple(v);
  }

  // Undo one topple of v (the exact reverse of toppleTimes(v, 1)).
  function untopple(v) {
    height[v] += threshold[v];
    odometer[v] -= 1;
    pile.topples -= 1;
    pile.lost -= offEdge[v];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (isSink[w]) pile.lost -= 1;
      else { height[w] -= 1; refresh(w); }
    }
    refresh(v);
  }

  // ---------- undo and redo ----------
  // Every topple made by step() or round() is written in a history, so
  // Undo can take it back. A "step" is one topple (step) or one round
  // (round); Undo takes back one step. The history keeps the last
  // HISTORY_SIZE topples (older ones are forgotten). After an Undo, the
  // next step replays the undone one first, as in nadya's Sandpiles.js.
  const HISTORY_SIZE = 1 << 20;
  let historyCell = null, historyStepStart = null;   // made on the first topple (they are big)
  let historyEnd = 0, historyLength = 0;
  let redo = [];   // undone steps, each a list of cells, last undone at the end

  function remember(v, firstOfStep) {
    if (historyCell === null) {
      historyCell = new Int32Array(HISTORY_SIZE);
      historyStepStart = new Uint8Array(HISTORY_SIZE);   // 1 = first topple of a step
    }
    historyCell[historyEnd] = v;
    historyStepStart[historyEnd] = firstOfStep ? 1 : 0;
    historyEnd = (historyEnd + 1) % HISTORY_SIZE;
    historyLength = Math.min(historyLength + 1, HISTORY_SIZE);
  }
  function forgetHistory() { historyLength = 0; redo = []; }

  // ---------- what the page calls ----------

  // Is the pile stable (no cell can topple)?
  pile.isStable = function () { return unstableCount === 0; };
  pile.unstableCount = function () { return unstableCount; };

  // Grains on the table now (sink cells hold none).
  pile.grains = function () {
    let total = 0;
    for (let v = 0; v < n; v++) total += height[v];
    return total;
  };

  // Start again from the heights h (a list with one number per cell).
  // Sink cells get 0. The counts and the history start over.
  pile.setHeights = function (h) {
    for (let v = 0; v < n; v++) {
      height[v] = isSink[v] ? 0 : h[v];
      odometer[v] = 0;
    }
    unstableCount = 0;
    where.fill(-1);
    for (let v = 0; v < n; v++) refresh(v);
    pile.topples = 0;
    pile.lost = 0;
    pile.added = 0;
    pile.startGrains = pile.grains();
    forgetHistory();
    restartNoSinkCheck();
  };

  // Add k grains to cell v (k may be negative to remove grains; a cell
  // never goes below 0). Clicking, and the storm, use this. Returns the
  // number of grains actually added.
  pile.addGrains = function (v, k) {
    if (isSink[v]) return 0;
    if (height[v] + k < 0) k = -height[v];
    height[v] += k;
    pile.added += k;
    refresh(v);
    redo = [];
    // Removing grains breaks the "no sink" reasoning, so start it over.
    if (k < 0) restartNoSinkCheck();
    return k;
  };

  // Drop one grain on a uniformly random cell (not a sink cell). u is a
  // uniform random number in [0, 1). Returns the cell.
  const ordinaryCells = [];
  for (let v = 0; v < n; v++) if (!isSink[v]) ordinaryCells.push(v);
  pile.dropGrain = function (u) {
    const v = ordinaryCells[Math.floor(u * ordinaryCells.length)];
    pile.addGrains(v, 1);
    return v;
  };

  // One step of the animation, one topple: the cell is picked uniformly
  // among the unstable cells, with u uniform in [0, 1) (or an undone
  // step is replayed). Returns the cell, or -1 if the pile is stable.
  pile.step = function (u) {
    if (redo.length > 0) return replay();
    if (unstableCount === 0) return -1;
    const v = unstable[Math.floor(u * unstableCount)];
    toppleTimes(v, 1);
    refresh(v);
    for (let e = d.first[v]; e < d.first[v + 1]; e++) refresh(d.nbr[e]);
    remember(v, true);
    return v;
  };

  // One round of the animation: every cell that is unstable now topples
  // once, all at the same time (the usual picture of the BTW model).
  // Returns how many cells toppled.
  pile.round = function () {
    if (redo.length > 0) return replay() === -1 ? 0 : 1;
    const now = Array.from(unstable.subarray(0, unstableCount));
    // Toppling them one after another is the same as all at once: a
    // topple only adds grains to the others, so each stays unstable
    // until its own turn.
    now.forEach(function (v, k) {
      toppleTimes(v, 1);
      remember(v, k === 0);
    });
    for (const v of now) {
      refresh(v);
      for (let e = d.first[v]; e < d.first[v + 1]; e++) refresh(d.nbr[e]);
    }
    return now.length;
  };

  // Take back the last step (one topple, or one whole round). Returns
  // false if there is nothing to undo.
  pile.undo = function () {
    if (historyLength === 0) return false;
    const cells = [];
    while (historyLength > 0) {
      historyEnd = (historyEnd - 1 + HISTORY_SIZE) % HISTORY_SIZE;
      historyLength--;
      cells.push(historyCell[historyEnd]);
      untopple(historyCell[historyEnd]);
      if (historyStepStart[historyEnd]) break;
    }
    redo.push(cells.reverse());
    // Undoing topples breaks the "no sink" reasoning, so start it over.
    restartNoSinkCheck();
    return true;
  };

  // Replay the last undone step. Returns its first cell.
  function replay() {
    const cells = redo.pop();
    cells.forEach(function (v, k) {
      toppleTimes(v, 1);
      remember(v, k === 0);
    });
    for (const v of cells) {
      refresh(v);
      for (let e = d.first[v]; e < d.first[v + 1]; e++) refresh(d.nbr[e]);
    }
    return cells[0];
  }

  // "Jump to the end": topple until stable, as fast as possible. A cell
  // with h grains topples floor(h / threshold) times at once (allowed by
  // the abelian property). Returns true when stable, false if the pile
  // never stabilizes (no sink, see the top of this file). The history
  // is cleared: Undo can't go back through a jump.
  pile.stabilize = function () {
    forgetHistory();
    const stack = Array.from(unstable.subarray(0, unstableCount));
    while (stack.length > 0) {
      const v = stack.pop();
      if (height[v] < threshold[v]) continue;   // already toppled by an earlier visit
      toppleTimes(v, Math.floor(height[v] / threshold[v]));
      refresh(v);
      for (let e = d.first[v]; e < d.first[v + 1]; e++) {
        const w = d.nbr[e];
        if (!isSink[w] && height[w] >= threshold[w]) stack.push(w);
        refresh(w);
      }
      if (pile.neverStabilizes) return false;
    }
    return true;
  };

  // A second pile on the same domain, for the identity and the burning
  // test below. Made once, the first time it is needed.
  let scratchPile = null;
  function scratch() {
    if (scratchPile === null) scratchPile = newPile(options);
    return scratchPile;
  }

  // The fullest stable pile M: threshold - 1 grains on every cell.
  pile.fullest = function () {
    const m = new Int32Array(n);
    for (let v = 0; v < n; v++) m[v] = isSink[v] ? 0 : threshold[v] - 1;
    return m;
  };

  // The identity e = (2M - (2M)°)° (see the top of this file), as a list
  // of heights. null if some piece of the domain has no sink, since then
  // there is no identity. Works on a copy: this pile is not changed.
  pile.identity = function () {
    if (!hasSink) return null;
    const other = scratch();
    const twoM = pile.fullest().map(function (m) { return 2 * m; });
    other.setHeights(twoM);
    other.stabilize();
    const difference = twoM.map(function (h, v) { return h - other.height[v]; });
    other.setHeights(difference);
    other.stabilize();
    return Int32Array.from(other.height);
  };

  // Dhar's burning test (see the top of this file): is this stable pile
  // recurrent? null if the pile is not stable or there is no sink.
  // Works on a copy: this pile is not changed.
  pile.isRecurrent = function () {
    if (!hasSink || unstableCount > 0) return null;
    const other = scratch();
    const burnt = new Int32Array(n);
    for (let v = 0; v < n; v++) {
      if (isSink[v]) continue;
      let fromSink = offEdge[v];
      for (let e = d.first[v]; e < d.first[v + 1]; e++) if (isSink[d.nbr[e]]) fromSink++;
      burnt[v] = height[v] + fromSink;
    }
    other.setHeights(burnt);
    other.stabilize();
    for (let v = 0; v < n; v++) if (!isSink[v] && other.odometer[v] !== 1) return false;
    return true;
  };

  return pile;
}


// The starting heights from nadya's Sandpiles.js (SquareGrid.js), for
// any domain. "kind" and the numbers in "s" are:
//   "empty"                   no sand
//   "linear"  s.value, s.slope   cell number k gets value + k * slope
//                             (cells numbered row by row, as in hers)
//   "random"  s.most          each cell uniform in 0, 1, ..., s.most
//   "full"    s.height        every cell s.height
//   "center"  s.grains        s.grains on the middle cell
// "random" is a function giving uniform numbers in [0, 1) (only "random"
// uses it). Heights below 0 become 0.
function startHeights(d, kind, s, random) {
  const h = new Int32Array(d.n);
  for (let v = 0; v < d.n; v++) {
    if (kind === "linear") h[v] = Math.max(0, s.value + v * s.slope);
    else if (kind === "random") h[v] = Math.floor(random() * (s.most + 1));
    else if (kind === "full") h[v] = s.height;
  }
  if (kind === "center") h[middleCell(d)] = s.grains;
  return h;
}

// The middle cell: in a box, the cell (floor((W-1)/2), floor((H-1)/2))
// as in nadya's code; in general, the cell nearest the middle of the
// smallest box around the domain.
function middleCell(d) {
  const mx = d.xmin + Math.floor((d.xmax - d.xmin) / 2);
  const my = d.ymin + Math.floor((d.ymax - d.ymin) / 2);
  let best = 0, bestDistance = Infinity;
  for (let v = 0; v < d.n; v++) {
    const distance = (d.x[v] - mx) * (d.x[v] - mx) + (d.y[v] - my) * (d.y[v] - my);
    if (distance < bestDistance) { best = v; bestDistance = distance; }
  }
  return best;
}
