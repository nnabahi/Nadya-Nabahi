/* =====================================================================
   discrete-ballistic-deposition-growth.js  —  the growth behind the
   "Discrete Ballistic Deposition" sim
   ---------------------------------------------------------------------
   THE MODEL (ballistic deposition, in the form of F. Family and
   T. Vicsek, "Scaling of the active zone in the Eden process on
   percolation networks and the ballistic deposition model", J. Phys. A
   (1985)). A strip of a lattice, L blocks
   wide (in space, L by L), has a floor: every cell below height 0
   (newFallingLattice, js/sim-deposit.js). Particles come one at a time.
   Each falls straight down a vertical line, at a uniformly random place
   across the strip, from high above. It stops in the FIRST cell it
   passes through that is next to the deposit (a neighbor of a cell of
   the deposit, or of the floor), and that cell joins the deposit. So a
   particle that brushes the side of a column sticks to it there, which
   leaves holes and overhangs under the surface.

   On the square grid this is the classic rule: a particle falls down a
   uniformly random column i, and the column's new height is
       h(i) = max(h(i - 1), h(i) + 1, h(i + 1)).
   (The check page tests the two against each other.)

   All of that is the LINE rule. The EDGES rule (nadya's, for lattices
   other than the squares) lets the particle fall along the lattice's
   edges instead. It starts in the cell the line crosses lowest in the
   first row (layer, in space) too high to be next to the deposit, and
   at each step moves to a uniformly random DOWN neighbor: one whose
   middle is lower, so the edge to it points at an angle strictly
   between 0 and -pi (its dot product with (0, -1) is positive; in
   space, with (0, 0, -1)). It stops as soon as it is next to the
   deposit (or if it has no down neighbor). On the square grid each
   cell's one down neighbor is the one below, so there the two rules
   are the same (the check page tests that too).

   HOW THE LINE RULE'S CELL IS FOUND, EXACTLY. Going down the line, the first cell next to
   the deposit is always above every cell of the deposit on the line:
   the cell just above the deposit's highest cell on the line shares a
   side (in space, a face) with it, so it is next to the deposit. So the
   particle's cell is the HIGHEST cell on the line that is empty and
   next to the deposit. Rows (in space, layers) are looked at from the
   top down, from the highest row a cell next to the deposit can be in
   (the deposit's highest row, plus the most rows apart two neighbors
   can be), and the search stops as soon as no lower row can reach
   higher than the best cell found.

   Random numbers (coupling): the p-th random particle (counting from 0,
   and not counting the ones dropped by a click) falls at the place made
   from uniform numbers (p, 0) (and (p, 1) in space) of the seed
   (seededUniform, js/sim-worker.js), and under the edges rule picks its
   steps with (p, 2), (p, 3), ... So going from n to n + 1 particles
   only adds one cell, and a click doesn't change what the random
   particles do.

   The file has these parts, with no drawing and no buttons:
     1. newDiscreteDeposit(options): the growth itself. The check page
        (discrete-ballistic-deposition-check.html) tests it in the
        browser.
     2. growthWorker(): runs it in a second thread for the sim page.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH
   ===================================================================== */

// Make a new growth. "options" has:
//   dim        2 or 3
//   tiling     2D: another tiling's upright block (null: the square grid)
//   block      3D: a tiling of space (honeycombBlock, js/sim-honeycombs.js)
//   width      L, the strip's width in blocks (each way, in space)
//   sides      "periodic" or "walls"
//   rule       "line" (straight down the line) or "edges" (down the
//              lattice's edges)
//   seed       the seed (any text)
// It returns the growth:
//   addParticle(place)   let one more particle fall (true): the next
//                   random one, or with "place" ([x], or [x, y] in space),
//                   one falling there (false if that's outside the walls)
//   land(p, point)  where random particle p would stop, without adding
//                   it (or, with "point", a particle falling there):
//                   { site, path } (its cell, and the points it
//                   passes: the line rule's is where it stops, at the
//                   top of its cell on the line; the edges rule's its
//                   start on the line, then the middles of the cells
//                   it passes, unwrapped)
//   dropped         how many particles fell at a chosen place
//   cluster         the deposit's cells, by number: count, and I, J, K, k
//   fall            the strip (newFallingLattice, js/sim-deposit.js)
//   surface         the surface (newSurface, js/sim-deposit.js)
//   floor           the floor's top layer, as sites (for drawing)
//   filled          the area (in space, volume) of the deposit's cells
//   lastFall        the latest particle's { path }
function newDiscreteDeposit(options) {
  const lattice = latticeFor(options);
  const fall = newFallingLattice(lattice, options.width, options.sides === "walls");
  const random = seededUniform(options.seed);
  const rule = options.rule === "edges" ? "edges" : "line", walls = options.sides === "walls";
  const across = fall.dims - 1;
  const taken = new Set();          // the keys of the deposit's cells
  const cluster = { count: 0, I: [], J: [], K: [], k: [] };
  const surface = newSurface(fall.samples.length);
  fall.samples.forEach(function (point, m) { surface.start(m, fall.floorTopAt(point)); });
  surface.settle();
  const floor = fall.floorTop();
  let highestRow = Math.max(...floor.map(fall.rowOf));    // no taken cell is in a higher row

  const g = {
    lattice: lattice, fall: fall, cluster: cluster, surface: surface, floor: floor,
    filled: 0, lastFall: null, atEdge: false, dropped: 0, addParticle: addParticle, land: land,
  };

  function isTaken(s) { return fall.isFloor(s) || taken.has(fall.keyOf(s)); }
  function touches(s) {
    let yes = false;
    fall.forEachNeighbor(s, function (t) { if (!yes && isTaken(t)) yes = true; });
    return yes;
  }

  // Where a particle falls: random particle p at its uniform place, or a
  // clicked one at its chosen point. Its walk's choices (the edges rule)
  // use uniform numbers (p, 2), (p, 3), ... for random particle p, and
  // (-1 - q, 2), (-1 - q, 3), ... for the q-th clicked one.
  function land(p, chosen) {
    const point = chosen || fall.dropPoint(random.uniform(p, 0), random.uniform(p, 1));
    const who = chosen ? -g.dropped : p;
    return rule === "edges" ? walkDown(point, who) : alongLine(point);
  }

  // THE LINE RULE: the highest empty cell on the line next to the deposit.
  function alongLine(point) {
    let site = null, best = -Infinity;
    const lowestRow = highestRow - 1000 * (fall.moveRows + 1);    // (never reached: the floor stops it long before)
    for (let V = highestRow + fall.moveRows; fall.rowTop(V) > best; V--) {
      if (V < lowestRow) throw new Error("A particle fell through the floor.");
      fall.crossed(point, V, function (s, bottom, top) {
        if (top <= best || isTaken(s) || !touches(s)) return;
        site = newSite(s.I, s.J, s.K, s.k);
        best = top;
      });
    }
    return { site: site, path: [point.concat(best)] };
  }

  // THE EDGES RULE: start in the lowest cell the line crosses in the
  // first row no cell next to the deposit can be in, then step to a
  // uniformly random DOWN neighbor (one whose middle is lower) until a
  // neighbor is in the deposit or the floor. (A cell with no down
  // neighbor would stop it too.) The path is the middles it passes,
  // unwrapped (so it doesn't jump across a periodic edge).
  function walkDown(point, who) {
    let site = null, bottom0 = Infinity;
    fall.crossed(point, highestRow + fall.moveRows + 1, function (s, bottom) {
      if (bottom < bottom0) { site = newSite(s.I, s.J, s.K, s.k); bottom0 = bottom; }
    });
    let at = placeOf(site);
    const path = [point.concat(at[across]), at];
    for (let step = 0; !touches(site); step++) {
      const down = [];
      fall.forEachNeighbor(site, function (t) { if (fall.heightOf(t) < fall.heightOf(site)) down.push(t); });
      if (down.length === 0) break;
      const next = down[Math.floor(random.uniform(who, 2 + step) * down.length)];
      const move = placeOf(next).map(function (x, d) { return x - placeOf(site)[d]; });
      for (let d = 0; d < across; d++) if (!walls) move[d] -= fall.widths[d] * Math.round(move[d] / fall.widths[d]);
      at = at.map(function (x, d) { return x + move[d]; });
      path.push(at);
      site = next;
    }
    return { site: site, path: path };
  }

  function placeOf(s) { return lattice.placeOf(s.I, s.J, s.K, s.k); }

  function addParticle(place) {
    const point = place ? fall.placeIn(place) : null;
    if (place && !point) return false;
    if (point) g.dropped++;
    const landed = land(cluster.count - g.dropped, point), s = landed.site;
    taken.add(fall.keyOf(s));
    cluster.I.push(s.I); cluster.J.push(s.J); cluster.K.push(s.K); cluster.k.push(s.k);
    cluster.count++;
    highestRow = Math.max(highestRow, fall.rowOf(s));
    fall.samplesUnder(s, surface.raise);
    g.filled += fall.sizeOf(s);
    g.lastFall = { path: landed.path };
    return true;
  }

  return g;
}


/* =====================================================================
   2. THE GROWTH IN A SECOND THREAD
   ---------------------------------------------------------------------
   It runs as every cluster sim's second thread does (serveGrowth,
   js/sim-cluster.js), with newDiscreteDeposit's options from the page.
   Its own numbers (depositNumbers, js/sim-deposit.js; the page shows
   them with showDepositStats, js/sim-cluster-page.js): the mean height,
   the interface
   width, the highest point, how much of the room under the surface is
   filled, and the latest particle's fall. The charts' samples: the mean
   height and the width. The new cells are sent as sites, and in the
   first report after a setup, the floor's top layer too. The run is
   done at MOST_PARTICLES.
   ===================================================================== */
const MOST_PARTICLES = 200000;

function growthWorker() {
  serveGrowth({
    make: newDiscreteDeposit, most: MOST_PARTICLES, names: DEPOSIT_SAMPLES, sample: depositSample,
    numbers: function (growth) {
      return depositNumbers(growth, growth.fall.widths);
    },
    pieces: function (growth, from) {
      const c = growth.cluster, pieces = {
        siteI: Int32Array.from(c.I.slice(from)), siteJ: Int32Array.from(c.J.slice(from)),
        siteK: Int32Array.from(c.K.slice(from)), sitePart: Int32Array.from(c.k.slice(from)),
      };
      if (from === 0) {
        const floor = growth.floor;
        pieces.floor = {
          I: Int32Array.from(floor, function (s) { return s.I; }), J: Int32Array.from(floor, function (s) { return s.J; }),
          K: Int32Array.from(floor, function (s) { return s.K; }), part: Int32Array.from(floor, function (s) { return s.k; }),
        };
      }
      return pieces;
    },
  });
}
