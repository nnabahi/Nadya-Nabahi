/* =====================================================================
   walk-check.js  —  tests of the shared walker (js/sim-walk.js), for
   walk-check.html
   ---------------------------------------------------------------------
     1. The lattices: every move can be undone, and the moves go to
        the cells next door.
     2. One step: every neighbor equally likely.
     3. The exit laws: exact answers where they are known.
     4. The jumps against plain steps.
   ===================================================================== */

// The lattices tested: the grids, plane tilings (tiles and corners,
// one with several kinds of cell), a Penrose plane, and tilings of
// space (several kinds of cell each).
function testLattices() {
  return [
    { name: "Z (1D)", lattice: gridLattice(1) },
    { name: "Z² (2D squares)", lattice: gridLattice(2) },
    { name: "Z³ (3D cubes)", lattice: gridLattice(3) },
    { name: "Triangles (3⁶), tiles", lattice: tilingLattice(tilingBlock("3/m30/r(h2)", false)) },
    { name: "Hexagons (6³), tiles", lattice: tilingLattice(tilingBlock("6/m30/r(h1)", false)) },
    { name: "3⁶; 3².6², tiles", lattice: tilingLattice(tilingBlock("3-6/m30/r(h2)", false)) },
    { name: "Snub hexagonal (3⁴.6), corners", lattice: tilingLattice(tilingBlock("6-3-3/r60/r(h5)", true)) },
    { name: "Penrose rhombs (P3), tiles", lattice: tilingLattice(penrosePlane(null, tilingBlock("Penrose P3", false))) },
    { name: "3D #22 cubes, vertices", lattice: honeycombLattice(honeycombBlock(22, "vertices")) },
    { name: "3D #1, polyhedra", lattice: honeycombLattice(honeycombBlock(1, "polyhedra")) },
    { name: "3D #12, faces", lattice: honeycombLattice(honeycombBlock(12, "faces")) },
    { name: "3D #11, edges", lattice: honeycombLattice(honeycombBlock(11, "edges")) },
  ];
}


/* =====================================================================
   1. THE LATTICES
   ===================================================================== */

// Every move of every cell of the block (on a Penrose plane, of its
// first 500 cells): the cell it goes to has a move back, no move is
// listed twice, and it goes no farther than longestMove.
function checkMoves(t) {
  const lattice = t.lattice;
  const count = lattice.periodic ? lattice.cellCount : 500;
  let problem = "", moves = 0;
  for (let k = 0; k < count && !problem; k++) {
    const keys = new Set(), p = lattice.placeOf(0, 0, 0, k);
    for (const [k2, dI, dJ, dK] of lattice.movesOf(k)) {
      moves++;
      const key = lattice.keyOf(dI, dJ, dK, k2);
      if (keys.has(key)) problem = "cell " + k + " lists a neighbor twice";
      keys.add(key);
      const back = lattice.movesOf(k2).some(function ([k3, eI, eJ, eK]) { return k3 === k && eI === -dI && eJ === -dJ && eK === -dK; });
      if (!back) problem = "cell " + k + " goes to cell " + k2 + ", which has no move back";
      const far = distanceBetween(p, lattice.placeOf(dI, dJ, dK, k2));
      if (lattice.periodic && far > lattice.longestMove + 1e-9) problem = "a move is longer than longestMove";
    }
  }
  addRow(t.name + ": every move can be undone", !problem,
         problem || moves + " moves from " + count + " cells" + (lattice.periodic ? ", the longest " + fourDigits(lattice.longestMove) : ""));
}


/* =====================================================================
   2. ONE STEP
   ===================================================================== */

// From each cell of the block (the first 20 on a Penrose plane), many
// single steps: each neighbor equally likely (chi-square tests, added up).
function checkStepsEven(t, perCell) {
  const lattice = t.lattice, random = seededUniform("steps " + t.name);
  const count = Math.min(lattice.periodic ? lattice.cellCount : 20, 20);
  let statistic = 0, degrees = 0, n = 0;
  for (let k = 0; k < count; k++) {
    const moves = lattice.movesOf(k), counts = moves.map(function () { return 0; });
    for (let i = 0; i < perCell; i++) {
      const s = newSite(0, 0, 0, k);
      walkStep(lattice, s, random.uniform(n++));
      counts[moves.findIndex(function ([k2, dI, dJ, dK]) { return k2 === s.k && dI === s.I && dJ === s.J && dK === s.K; })]++;
    }
    const test = equalChiSquare(counts);
    statistic += test.statistic;
    degrees += test.degrees;
  }
  const pValue = 1 - jStat.chisquare.cdf(statistic, degrees);
  addRow(t.name + ": one step, every neighbor equally likely", pValue > 0.001,
         count + (count === 1 ? " cell, " : " cells, ") + perCell.toLocaleString() + " steps from each: chi-square " + statistic.toFixed(1) + " on " + degrees +
         " degrees of freedom, p = " + pValue.toFixed(3));
}

// With weights on the grid Z², the moves come in the weights' shares.
function checkWeightedSteps() {
  const lattice = gridLattice(2), weights = [1, 2, 3, 0], cut = cutsOf(weights, 4), random = seededUniform("weights");
  const odds = new Map(weights.map(function (w, m) { return [m, w / 6]; }).filter(function ([, p]) { return p > 0; }));
  const seen = new Map(), runs = 60000;
  for (let n = 0; n < runs; n++) {
    const s = newSite(0, 0, 0, 0);
    walkStep(lattice, s, random.uniform(n), cut);
    const m = GRID_MOVES.findIndex(function ([, dI, dJ]) { return dI === s.I && dJ === s.J; });
    seen.set(m, (seen.get(m) || 0) + 1);
  }
  const test = exactOddsTest(odds, seen, runs, "moves");
  addRow("Z² with weights 1, 2, 3, 0: each move in its weight's share", test.pass, test.text);
}


/* =====================================================================
   3. THE EXIT LAWS: EXACT ANSWERS
   ===================================================================== */

// On Z the ball of radius r is the 2r + 1 sites -r, ..., r; the walk
// leaves it at r + 1 or -(r + 1), each with chance 1/2 by symmetry,
// after (r + 1)^2 steps on average (the gambler's ruin: W. Feller, "An
// Introduction to Probability Theory and Its Applications", vol. 1, 3rd
// ed., Wiley, 1968, Section XIV.3).
function checkLine() {
  const lattice = gridLattice(1), problems = [];
  for (const r of [2, 4, 8, 16, 32]) {
    const law = exitLaw(lattice, 0, r);
    const ends = law.exits.map(function (e) { return e[1]; }).sort(function (a, b) { return a - b; });
    if (ends.join() !== [-(r + 1), r + 1].join()) problems.push("r = " + r + ": leaves at " + ends.join(", "));
    for (const chance of law.chances) if (Math.abs(chance - 0.5) > 1e-12) problems.push("r = " + r + ": a chance of " + chance);
    if (Math.abs(law.meanSteps - (r + 1) * (r + 1)) > 1e-8 * (r + 1) * (r + 1)) problems.push("r = " + r + ": " + law.meanSteps + " steps on average");
  }
  addRow("Z: leaves the ball at ±(r + 1), each with chance 1/2, after (r + 1)² steps on average", problems.length === 0,
         problems.join("; ") || "exact (to 12 digits) for r = 2, 4, 8, 16, 32");
}

// The chances of every exit law add up to 1 before any rounding is
// tidied away (they come from the solve, not from dividing by a total),
// for radii 2, 4 and 8 and every kind of cell.
function checkTotals(t) {
  const lattice = t.lattice;
  let worst = 0, laws = 0;
  for (let k = 0; k < lattice.cellCount; k++) {
    for (const r of [2, 4, 8]) {
      const law = exitLaw(lattice, k, r);
      if (law === null) continue;
      worst = Math.max(worst, Math.abs(law.total - 1));
      laws++;
    }
  }
  addRow(t.name + ": each exit law's chances add up to 1", worst < 1e-9,
         laws + " laws (radii 2, 4, 8, every kind of cell), farthest from 1 by " + worst.toExponential(1));
}

// On Z² and Z³ the exit law looks the same after any turn or mirror
// that keeps the grid (swapping or flipping the axes).
function checkGridSymmetry(dim) {
  const lattice = gridLattice(dim), r = 8, law = exitLaw(lattice, 0, r);
  const chanceAt = new Map();
  law.exits.forEach(function ([, I, J, K], i) { chanceAt.set(I + "," + J + "," + K, law.chances[i]); });
  let worst = 0;
  law.exits.forEach(function ([, I, J, K], i) {
    const images = dim === 2 ? [[J, I, K], [-I, J, K], [I, -J, K]] : [[J, I, K], [K, J, I], [I, K, J], [-I, J, K], [I, -J, K], [I, J, -K]];
    for (const q of images) worst = Math.max(worst, Math.abs((chanceAt.get(q.join(",")) || 0) - law.chances[i]));
  });
  addRow("Z" + (dim === 2 ? "²" : "³") + ": the exit law of the ball of radius 8 keeps the grid's symmetries", worst < 1e-12,
         law.exits.length + " exits; the biggest change under a turn or mirror is " + worst.toExponential(1));
}


/* =====================================================================
   4. JUMPS AGAINST STEPS
   ===================================================================== */

// Many walkers take plain steps from cell k until they leave the ball
// of radius r; where they leave is compared with the exit law (a
// chi-square test).
function checkJumpLaw(t, k, r, runs) {
  const lattice = t.lattice, law = exitLaw(lattice, k, r), random = seededUniform("exits " + t.name);
  const ball = new Set(ballAround(lattice, k, r).sites.map(function ([k2, I, J, K]) { return lattice.keyOf(I, J, K, k2); }));
  const odds = new Map();
  law.exits.forEach(function ([k2, I, J, K], i) { odds.set(lattice.keyOf(I, J, K, k2), law.chances[i] / law.total); });
  const seen = new Map();
  let n = 0;
  for (let run = 0; run < runs; run++) {
    const s = newSite(0, 0, 0, k);
    while (ball.has(lattice.keyOf(s.I, s.J, s.K, s.k))) walkStep(lattice, s, random.uniform(n++));
    const key = lattice.keyOf(s.I, s.J, s.K, s.k);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const test = exactOddsTest(odds, seen, runs, "exits");
  addRow(t.name + ", cell " + k + ", ball of radius " + r + ": plain steps leave it where the exit law says", test.pass, test.text);
}

// jump() picks the biggest safe ball: with room for radius 8 but not
// 16, the walker lands exactly 9 steps from where it was (found by
// going out step by step); with too little room it doesn't move. On a
// Penrose plane it never jumps.
function checkJumpRadius(t) {
  const lattice = t.lattice, jumps = ballJumps(lattice), random = seededUniform("radius " + t.name);
  if (!lattice.periodic) {
    const s = newSite(0, 0, 0, 0);
    addRow(t.name + ": no jumps on a tiling that never repeats", jumps.jump(s, 1000, 0.5) === 0 && s.k === 0, "jump() said no and left the walker");
    return;
  }
  const ring9 = new Set(), within8 = new Set(ballAround(lattice, 0, 8).sites.map(function ([k2, I, J, K]) { return lattice.keyOf(I, J, K, k2); }));
  for (const [k2, I, J, K] of ballAround(lattice, 0, 9).sites) {
    const key = lattice.keyOf(I, J, K, k2);
    if (!within8.has(key)) ring9.add(key);
  }
  let problem = "";
  for (let n = 0; n < 200 && !problem; n++) {
    const s = newSite(0, 0, 0, 0);
    jumps.jump(s, 9 * lattice.longestMove, random.uniform(n));
    if (!ring9.has(lattice.keyOf(s.I, s.J, s.K, s.k))) problem = "a jump landed at a site not 9 steps away";
  }
  const still = newSite(0, 0, 0, 0);
  if (!problem && jumps.jump(still, 2 * lattice.longestMove, 0.5) !== 0) problem = "it jumped with room for radius 1 only";
  addRow(t.name + ": a jump with room for radius 8 lands exactly 9 steps away; with too little room, no jump", !problem,
         problem || "200 jumps, all 9 steps away");
}


/* =====================================================================
   THE LIST OF CHECKS
   ===================================================================== */
runChecksOnClick(function () {
  const lattices = testLattices(), tests = [];
  for (const t of lattices) tests.push(function () { checkMoves(t); });
  for (const t of lattices) tests.push(function () { checkStepsEven(t, 3000); });
  tests.push(checkWeightedSteps, checkLine, function () { checkGridSymmetry(2); }, function () { checkGridSymmetry(3); });
  for (const t of lattices) if (t.lattice.periodic) tests.push(function () { checkTotals(t); });
  for (const t of lattices) {
    if (!t.lattice.periodic) continue;
    tests.push(function () { checkJumpLaw(t, 0, 4, 20000); });
    if (t.lattice.cellCount > 1) tests.push(function () { checkJumpLaw(t, t.lattice.cellCount - 1, 3, 20000); });
  }
  for (const t of lattices) tests.push(function () { checkJumpRadius(t); });
  return tests;
});
