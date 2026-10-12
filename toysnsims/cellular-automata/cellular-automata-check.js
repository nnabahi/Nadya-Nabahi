/* =====================================================================
   cellular-automata-check.js  —  the tests on cellular-automata-check.html
   ---------------------------------------------------------------------
   Tests of the rule in cellular-automata-rule.js, each against a
   description written out separately here:

     1. The table: table[C] is digit C of n in base b, worked out the
        slow way, floor(n / b^C) mod b, for random b, k and n.
     2. Rule 30: one step is new = left XOR (itself OR right), its usual
        description (S. Wolfram, Rev. Mod. Phys. 55 (1983) 601-644).
     3. The Game of Life: the rule number made by lifeRuleNumber, run on
        a random torus, against counting the 8 cells around each cell
        (born with 3, survives with 2 or 3; M. Gardner, Scientific
        American 223(4) (1970) 120-123). And a glider moves one cell
        diagonally every 4 steps.
     4. The edges, with the rule "copy the cell on your left" (rule 2 on
        the neighborhood {-1}): wrapping turns the tape one cell right,
        fixed edges in state 1 fill the tape with 1s, and random edges
        bring in 1s about half the time.
     5. Repeats: a blinker on a torus comes back after 2 steps, and the
        fingerprint (stateHash) sees it.

   Random numbers come from the library seedrandom, with fixed seeds,
   so the tests do the same thing every time.
   ===================================================================== */

const MOORE = orderNeighborhood([[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);

// An automaton with the rule n (a BigInt) on the ordered neighborhood.
function automaton(n, b, offsets, width, height, cells, edge, edgeState, seed) {
  return newAutomaton({ width: width, height: height, offsets: offsets, table: ruleTable(n, b, offsets.length),
                        b: b, edge: edge, edgeState: edgeState || 0, cells: cells,
                        random: new Math.seedrandom(seed || "edges") });
}

// Cells from a list of [x, y] that are 1 on a width x height grid.
function cellsFrom(list, width, height) {
  const cells = new Uint8Array(width * height);
  for (const [x, y] of list) cells[y * width + x] = 1;
  return cells;
}

function same(a, c) { return a.length === c.length && a.every(function (v, i) { return v === c[i]; }); }


/* 1. The table reads the digits of n. */
function testTable() {
  const random = new Math.seedrandom("table");
  let worst = 0, entries = 0;
  for (let trial = 0; trial < 40; trial++) {
    const b = 2 + Math.floor(random() * 5), k = 1 + Math.floor(random() * 4), size = b ** k;
    let n = 0n;
    for (let d = 0; d < size + 3; d++) n = n * BigInt(b) + BigInt(Math.floor(random() * b));   // a few digits too many
    const table = ruleTable(n, b, k);
    for (let C = 0; C < size; C++) {
      if (BigInt(table[C]) !== (n / BigInt(b) ** BigInt(C)) % BigInt(b)) worst++;
      entries++;
    }
  }
  addRow("The table reads the digits of n", worst === 0,
         entries + " table entries for 40 random b (2 to 6), k (1 to 4) and n: " + worst +
         " differ from floor(n / b^C) mod b.");
}

/* 2. Rule 30 is new = left XOR (itself OR right). */
function testRule30() {
  const random = new Math.seedrandom("rule 30"), W = 60;
  let wrong = 0;
  for (let trial = 0; trial < 20; trial++) {
    const cells = new Uint8Array(W).map(function () { return random() < 0.5 ? 1 : 0; });
    const auto = automaton(30n, 2, orderNeighborhood([[-1], [0], [1]]), W, 1, cells, "wrap");
    auto.step();
    for (let x = 0; x < W; x++) {
      const left = cells[(x + W - 1) % W], self = cells[x], right = cells[(x + 1) % W];
      if (auto.cells[x] !== (left ^ (self | right))) wrong++;
    }
  }
  addRow("Rule 30", wrong === 0,
         "20 random tapes of " + W + " cells, one step: " + wrong + " cells differ from left XOR (itself OR right).");
}

/* 3. The Game of Life, and a glider. */
function testLife() {
  const n = lifeRuleNumber(MOORE, [3], [2, 3]), W = 30, H = 25;
  const random = new Math.seedrandom("life");
  let cells = new Uint8Array(W * H).map(function () { return random() < 0.35 ? 1 : 0; });
  const auto = automaton(n, 2, MOORE, W, H, cells, "wrap");
  let wrong = 0;
  for (let step = 0; step < 30; step++) {
    auto.step();
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let around = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) around += cells[((y + dy + H) % H) * W + (x + dx + W) % W];
        }
        next[y * W + x] = (around === 3 || (around === 2 && cells[y * W + x])) ? 1 : 0;
      }
    }
    for (let i = 0; i < W * H; i++) if (next[i] !== auto.cells[i]) wrong++;
    cells = next;
  }
  addRow("The Game of Life", wrong === 0,
         "The rule number has " + n.toString().length + " digits. 30 steps on a random " + W + " × " + H +
         " torus: " + wrong + " cells differ from counting the 8 cells around (born with 3, survives with 2 or 3).");

  // A glider (y goes up): .#. / ..# / ### moves 1 right and 1 down every 4 steps.
  const glider = [[1, 2], [2, 1], [0, 0], [1, 0], [2, 0]], S = 10;
  const g = automaton(n, 2, MOORE, S, S, cellsFrom(glider.map(function (p) { return [p[0] + 3, p[1] + 5]; }), S, S), "wrap");
  for (let step = 0; step < 4; step++) g.step();
  const moved = cellsFrom(glider.map(function (p) { return [p[0] + 4, p[1] + 4]; }), S, S);
  addRow("A glider", same(g.cells, moved), "After 4 steps the glider is the same shape, 1 cell right and 1 cell down.");
}

/* 4. The edges. */
function testEdges() {
  const copyLeft = [[-1]], W = 12;
  const random = new Math.seedrandom("edge start");
  const cells = new Uint8Array(W).map(function () { return random() < 0.5 ? 1 : 0; });

  const wrapped = automaton(2n, 2, copyLeft, W, 1, cells, "wrap");
  wrapped.step();
  const turned = cells.map(function (v, x) { return cells[(x + W - 1) % W]; });
  addRow("Edges: wrap around", same(wrapped.cells, turned), "Copying the left cell turns the ring one cell to the right.");

  const fixed = automaton(2n, 2, copyLeft, W, 1, cells, "fixed", 1);
  for (let step = 0; step < W; step++) fixed.step();
  addRow("Edges: fixed", fixed.cells.every(function (v) { return v === 1; }),
         "With every cell outside in state 1, copying the left cell fills the tape with 1s after " + W + " steps.");

  const noisy = automaton(2n, 2, copyLeft, W, 1, cells, "random", 0, "random edges");
  let ones = 0;
  const steps = 4000;
  for (let step = 0; step < steps; step++) { noisy.step(); ones += noisy.cells[0]; }
  const z = binomialZ(ones, steps, 0.5);
  addRow("Edges: random", Math.abs(z) < 4,
         "The leftmost cell copies a random outside cell: " + ones + " ones in " + steps +
         " steps, " + z.toFixed(2) + " standard deviations from half (passes below 4).");
}

/* 5. A blinker repeats every 2 steps. */
function testRepeat() {
  const n = lifeRuleNumber(MOORE, [3], [2, 3]), S = 7;
  const blinker = automaton(n, 2, MOORE, S, S, cellsFrom([[2, 3], [3, 3], [4, 3]], S, S), "wrap");
  const fingerprints = [stateHash(blinker.cells)];
  for (let step = 0; step < 2; step++) { blinker.step(); fingerprints.push(stateHash(blinker.cells)); }
  addRow("Repeats", fingerprints[2] === fingerprints[0] && fingerprints[1] !== fingerprints[0],
         "A blinker (3 live cells in a row) is back after 2 steps, not after 1, and its fingerprint says so.");
}

runChecksOnClick(function () { return [testTable, testRule30, testLife, testEdges, testRepeat]; });
