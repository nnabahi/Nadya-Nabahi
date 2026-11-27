/* =====================================================================
   continuous-ballistic-deposition-growth.js  —  the growth behind the
   "Continuous Ballistic Deposition" sim
   ---------------------------------------------------------------------
   THE MODEL. A tile shape T (a disk by default) is fixed, and tiles are
   copies of it moved without turning, in the plane or in space. The
   floor is the line y = 0 (in space, the plane z = 0), W wide (in space,
   W by W). Particles come one at a time. Each carries a tile straight
   down, from high above, with its center on a vertical line at a
   uniformly random place across, and stops the first time its tile
   touches the floor or a tile already there. It stays there. So a tile
   that brushes the side of another sticks to it, as in the discrete
   sim, and the deposit has holes under its surface. For disks this is
   the usual off-lattice ballistic deposition.

   WHERE IT STOPS, EXACTLY. With its center at c, the tile c + T touches
   or overlaps the tile q + T exactly when c is in q + D, D = T - T (the
   difference set: copyGap, js/sim-tile-shape.js). Coming down from high
   above, the center first reaches q + D at the TOP of q + D above its
   line, and first reaches the floor when T's lowest point does. So the
   stopping height is the highest of
     - minus the lowest point of T (the floor), and
     - q's height plus D's top above the line, over the placed tiles q
   (fallingTile, js/sim-deposit.js). Nothing here is approximate: in the
   plane D's top comes from its polygon (exact for the tile's polygon of
   TILE_CORNERS corners), for a disk (ball) from its circle (sphere).

   Only the tiles near the line can matter, so the tiles are filed in
   columns at least as wide as D, each column's tiles by height. Going
   down a column from its highest tile, the search stops as soon as a
   tile is too low for its D to reach above the best stop so far.

   SIDES. Periodic (the right edge glued to the left; in space also the
   back to the front): the place is uniform on 0 <= x < W, and tiles
   across the edge count as near. Then W must be at least twice D's
   width, so a tile meets another only once. Walls: the tile stays
   between them, so its center is uniform on the x where it fits.

   Random numbers (coupling): the p-th random particle (counting from 0,
   and not counting the ones dropped by a click) falls at the place made
   from uniform numbers (p, 0) (and (p, 1) in space) of the seed
   (seededUniform, js/sim-worker.js), so going from n to n + 1 particles
   only adds one tile, and a click doesn't change where the random
   particles fall.

   The file has these parts, with no drawing and no buttons:
     1. newContinuousDeposit(options): the growth itself. The check page
        (continuous-ballistic-deposition-check.html) tests it in the
        browser.
     2. growthWorker(): runs it in a second thread for the sim page.
   ===================================================================== */


/* =====================================================================
   1. THE GROWTH
   ===================================================================== */

// The surface is measured at sample points this many to each tile width
// across (each way, in space).
const SAMPLES_PER_TILE = { 2: 8, 3: 3 };

// Make a new growth. "options" has:
//   dim        2 or 3
//   tile       the tile's polygon or polyhedron (tileFromOptions,
//              js/sim-tile-shape.js)
//   width      W, the floor's width (each way, in space)
//   sides      "periodic" or "walls"
//   seed       the seed (any text)
// It returns the growth:
//   addParticle(place)   let one more particle fall (true): the next
//                   random one, or with "place" ([x], or [x, y] in space),
//                   one falling there (false if its tile doesn't fit
//                   there between the walls)
//   land(p, point)  where random particle p's tile would stop, without
//                   adding it (or, with "point", a tile falling there):
//                   its center, [x, y] (in space [x, y, z])
//   dropped         how many particles fell at a chosen place
//   cluster         the tiles' centers (newTileCluster, js/sim-cluster.js)
//   surface         the surface (newSurface, js/sim-deposit.js)
//   tile, fit       the tile's shape, and its fallingTile
//   filled          the area (in space, volume) of the tiles
//   lastFall        the latest particle's { path }: [its center where
//                   it stopped] (the line it fell along goes through it)
function newContinuousDeposit(options) {
  const shape = options.tile, dims = shape.dims === 3 ? 3 : 2, across = dims - 1;
  const fit = fallingTile(shape), W = options.width, walls = options.sides === "walls";
  const random = seededUniform(options.seed);
  for (let d = 0; d < across; d++) {
    if (walls && W < fit.right[d] - fit.left[d]) throw new Error("The floor is narrower than the tile.");
    if (!walls && W < 2 * fit.reach[d]) throw new Error("With periodic sides the floor must be at least twice the tile's width (" + niceWidth(2 * fit.reach[d]) + ").");
  }
  const cluster = newTileCluster(dims);

  // The columns: "count" across (each way, in space), each at least D's
  // width; column c's tiles by height, lowest first.
  const count = Math.max(1, Math.floor(W / Math.max(...fit.reach))), columnWidth = W / count;
  const columns = [];
  for (let c = 0; c < Math.pow(count, across); c++) columns.push([]);
  const heightOf = function (i) { return dims === 2 ? cluster.y[i] : cluster.z[i]; };
  const columnOf = function (point) {
    const at = point.map(function (x) { return Math.min(count - 1, Math.max(0, Math.floor(wrapped(x) / columnWidth))); });
    return dims === 2 ? at[0] : at[1] * count + at[0];
  };

  // The surface's sample points, evenly spread over where the centers
  // can be: periodic, 0 <= x < W; with walls, the x where the tile fits
  // (nearer a wall than that, a tile seldom reaches down, so the surface
  // there would mostly be the floor). "first" is where they start, each
  // way, and "gap" how far apart they are.
  const tileWidth = Math.max(...fit.right.map(function (r, d) { return r - fit.left[d]; }));
  const first = [], span = [];
  for (let d = 0; d < across; d++) {
    first.push(walls ? -fit.left[d] : 0);
    span.push(walls ? W - (fit.right[d] - fit.left[d]) : W);
  }
  const per = Math.max(1, Math.ceil(SAMPLES_PER_TILE[dims] * Math.max(...span) / tileWidth));
  const gap = span.map(function (w) { return w / per; });
  const samples = [];
  const sampleAt = function (i, d) { return first[d] + (i + 0.5) * gap[d]; };
  if (dims === 2) for (let i = 0; i < per; i++) samples.push([sampleAt(i, 0)]);
  else for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) samples.push([sampleAt(i, 0), sampleAt(j, 1)]);
  const surface = newSurface(samples.length);
  samples.forEach(function (p, m) { surface.start(m, 0); });
  surface.settle();

  const g = {
    cluster: cluster, surface: surface, tile: shape, fit: fit, samples: samples,
    filled: 0, lastFall: null, atEdge: false, dropped: 0, addParticle: addParticle, land: land,
  };

  // Periodic: a place across moved by whole widths into 0 <= x < W, and
  // the gap between two places across, the shortest way round.
  function wrapped(x) { return walls ? x : x - W * Math.floor(x / W); }
  function apart(x) { return walls ? x : x - W * Math.round(x / W); }

  // The place particle p falls at: periodic, uniform on 0 <= x < W;
  // walls, uniform where the tile fits between them.
  function dropPoint(p) {
    const point = [];
    for (let d = 0; d < across; d++) {
      const u = random.uniform(p, d);
      point.push(walls ? -fit.left[d] + u * (W - (fit.right[d] - fit.left[d])) : u * W);
    }
    return point;
  }

  // The columns within D's reach of the point, each once.
  function columnsNear(point) {
    const ranges = point.map(function (x, d) {
      const low = Math.floor((x - fit.reach[d]) / columnWidth), high = Math.floor((x + fit.reach[d]) / columnWidth);
      const list = [];
      for (let c = low; c <= high && list.length < count; c++) {
        const k = walls ? c : ((c % count) + count) % count;
        if (k >= 0 && k < count && list.indexOf(k) < 0) list.push(k);
      }
      return list;
    });
    if (dims === 2) return ranges[0];
    const near = [];
    for (const j of ranges[1]) for (const i of ranges[0]) near.push(j * count + i);
    return near;
  }

  function land(p, chosen) {
    const point = chosen || dropPoint(p);
    let best = -fit.low;          // on the floor
    for (const c of columnsNear(point)) {
      const column = columns[c];
      for (let n = column.length - 1; n >= 0; n--) {
        const i = column[n], h = heightOf(i);
        if (h + fit.differenceHeight <= best) break;    // this tile and every lower one are too low
        const dx = apart(point[0] - cluster.x[i]), dy = dims === 3 ? apart(point[1] - cluster.y[i]) : 0;
        if (Math.abs(dx) > fit.reach[0] || (dims === 3 && Math.abs(dy) > fit.reach[1])) continue;
        best = Math.max(best, h + fit.differenceTop(dx, dy));
      }
    }
    return point.concat(best);
  }

  // A place someone chose (a click) as the line a tile can fall along:
  // periodic, moved by whole widths into 0 <= x < W; walls, null if the
  // tile doesn't fit there between them.
  function placeIn(place) {
    const point = place.map(wrapped);
    const fits = point.every(function (x, d) { return !walls || (x + fit.left[d] >= 0 && x + fit.right[d] <= W); });
    return fits ? point : null;
  }

  function addParticle(place) {
    const point = place ? placeIn(place) : null;
    if (place && !point) return false;
    if (point) g.dropped++;
    const center = land(cluster.count - g.dropped, point), i = cluster.count;
    cluster.add(center);
    // Into its column, kept by height (a new tile is usually near the top).
    const column = columns[columnOf(center.slice(0, across))];
    let n = column.length;
    while (n > 0 && heightOf(column[n - 1]) > center[across]) n--;
    column.splice(n, 0, i);
    raiseSurface(center);
    g.filled += fit.size;
    g.lastFall = { path: [center] };
    return true;
  }

  // The samples under the new tile: each lifted to the tile's top there.
  function raiseSurface(center) {
    const ranges = [];
    for (let d = 0; d < across; d++) {
      ranges.push([Math.ceil((center[d] + fit.left[d] - first[d]) / gap[d] - 0.5), Math.floor((center[d] + fit.right[d] - first[d]) / gap[d] - 0.5)]);
    }
    if (dims === 2) ranges.push([0, 0]);
    for (let j = ranges[1][0]; j <= ranges[1][1]; j++) {
      for (let i = ranges[0][0]; i <= ranges[0][1]; i++) {
        const di = ((i % per) + per) % per, dj = ((j % per) + per) % per;
        if (walls && (i !== di || (dims === 3 && j !== dj))) continue;
        const dx = sampleAt(i, 0) - center[0], dy = dims === 3 ? sampleAt(j, 1) - center[1] : 0;
        const top = fit.tileTop(dx, dy);
        if (top > -Infinity) surface.raise(dims === 2 ? di : dj * per + di, center[across] + top);
      }
    }
  }

  return g;
}

// A width for a message: 4 significant digits.
function niceWidth(w) { return Number(w.toPrecision(4)).toString(); }


/* =====================================================================
   2. THE GROWTH IN A SECOND THREAD
   ---------------------------------------------------------------------
   It runs as every cluster sim's second thread does (serveGrowth,
   js/sim-cluster.js). The page sends the tile typed as a formula
   ("tileFormula", with the sliders' "values"); this thread reads it and
   makes its polygon (in space, its polyhedron: tileFromOptions,
   js/sim-tile-shape.js, with math.js). Its numbers are both deposition
   sims' (depositNumbers, js/sim-deposit.js), and in the first report
   after a setup, the tile's outline for drawing (tileOutline). The new
   tiles are sent as their centers, x and y (and z). The charts'
   samples: the mean height and the width. The run is done at
   MOST_PARTICLES.
   ===================================================================== */
const MOST_PARTICLES = 100000;

function growthWorker() {
  // math.js reads the tile's formula. The version is fixed so an update
  // can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/mathjs@15.2.0/lib/browser/math.js");
  let shapeSent = false;
  serveGrowth({
    make: function (options) {
      shapeSent = false;
      return newContinuousDeposit(Object.assign({}, options, { tile: tileFromOptions(options) }));
    },
    most: MOST_PARTICLES, names: DEPOSIT_SAMPLES, sample: depositSample, pieces: tilePieces,
    numbers: function (growth, options) {
      const widths = growth.tile.dims === 3 ? [options.width, options.width] : [options.width];
      const numbers = depositNumbers(growth, widths);
      if (!shapeSent) {
        numbers.shape = tileOutline(growth.tile);
        shapeSent = true;
      }
      return numbers;
    },
  });
}
