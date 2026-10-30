/* =====================================================================
   sim-sites.js  —  a page's copy of the sites its second thread found
   ---------------------------------------------------------------------
   Random Walk's visited sites and a DLA cluster's sites are both a
   growing list of lattice sites (js/sim-walk.js), which the second
   thread sends a few at a time, and which the page draws: as squares,
   as a tiling's polygons, or in 3D. newSitePile() keeps them:
     pile.count              how many sites
     pile.I, pile.J, pile.K  site i's block (whole numbers; on the grids
     pile.part               its point) and its cell in the block
     pile.keep(from, I, J, K, part)   add the sites sent (typed lists),
                             numbered from "from" on (0: start afresh)
     pile.squaresShown(spare)   2D squares: the box around the sites,
                             "spare" squares more each way, which looks
                             sites up quickly (for paintCells,
                             js/sim-view.js)
     pile.tilingShown(tiling, extra)   2D on another tiling: the sites
                             as a tiling domain (tilingCells,
                             js/sim-domains.js), cell v being site v,
                             then the "extra" cells (a list x, y, part,
                             x, y, part, ...)
   On the squares, the sites are also put in a grid, so the picture can
   find the site at (x, y) at once: grid.cells[(y - ymin) * across +
   (x - xmin)] is its number (-1 if none). The grid doubles in size
   when a site lands outside it.
   ===================================================================== */

function newSitePile() {
  const pile = {
    count: 0,
    I: new Int32Array(1024), J: new Int32Array(1024), K: new Int32Array(1024), part: new Int32Array(1024),
    grid: null, gridded: 0,    // the grid, and how many sites are in it
  };

  pile.keep = function (from, I, J, K, part) {
    if (from === 0) { pile.count = 0; pile.grid = null; pile.gridded = 0; }
    pile.I = keepAlong(pile.I, I, from);
    pile.J = keepAlong(pile.J, J, from);
    pile.K = keepAlong(pile.K, K, from);
    pile.part = keepAlong(pile.part, part, from);
    pile.count = from + I.length;
  };

  // Is (x, y) outside the grid (or is there no grid yet)?
  function outsideGrid(x, y) {
    const grid = pile.grid;
    return !grid || x < grid.xmin || x > grid.xmax || y < grid.ymin || y > grid.ymax;
  }

  // The site at (x, y) on the squares, or -1.
  function squareSite(x, y) {
    if (outsideGrid(x, y)) return -1;
    return pile.grid.cells[(y - pile.grid.ymin) * pile.grid.across + (x - pile.grid.xmin)];
  }

  // Put the sites not in the grid yet in it (the sites are on the
  // squares), making it bigger first when one is outside it.
  function fillGrid() {
    for (let i = pile.gridded; i < pile.count; i++) {
      const x = pile.I[i], y = pile.J[i];
      if (outsideGrid(x, y)) pile.grid = biggerGrid(x, y, i);
      pile.grid.cells[(y - pile.grid.ymin) * pile.grid.across + (x - pile.grid.xmin)] = i;
    }
    pile.gridded = pile.count;
  }

  // A grid twice as big as the old one (at least 65 across), around both
  // it and the site (x, y), holding sites 0 .. upTo - 1.
  function biggerGrid(x, y, upTo) {
    const old = pile.grid;
    const half = old ? Math.max(old.xmax - old.xmin, old.ymax - old.ymin) + 1 : 32;
    const cx = old ? Math.round((old.xmin + old.xmax) / 2) : x, cy = old ? Math.round((old.ymin + old.ymax) / 2) : y;
    const reach = Math.max(half, Math.abs(x - cx) + 1, Math.abs(y - cy) + 1);
    const bigger = { xmin: cx - reach, xmax: cx + reach, ymin: cy - reach, ymax: cy + reach, across: 2 * reach + 1 };
    bigger.cells = new Int32Array(bigger.across * bigger.across).fill(-1);
    for (let j = 0; j < upTo; j++) bigger.cells[(pile.J[j] - bigger.ymin) * bigger.across + (pile.I[j] - bigger.xmin)] = j;
    return bigger;
  }

  pile.squaresShown = function (spare) {
    fillGrid();
    const box = boxAround(pile.I.subarray(0, pile.count), pile.J.subarray(0, pile.count), spare);   // (js/sim-domains.js)
    return Object.assign(box, { wrap: null, lookup: squareSite });
  };

  pile.tilingShown = function (tiling, extra) {
    const more = extra ? extra.length / 3 : 0, n = pile.count + more;
    const x = new Int32Array(n), y = new Int32Array(n), part = new Int32Array(n);
    x.set(pile.I.subarray(0, pile.count));
    y.set(pile.J.subarray(0, pile.count));
    part.set(pile.part.subarray(0, pile.count));
    for (let e = 0; e < more; e++) {
      x[pile.count + e] = extra[3 * e];
      y[pile.count + e] = extra[3 * e + 1];
      part[pile.count + e] = extra[3 * e + 2];
    }
    return tilingCells(tiling, x, y, part);
  };

  return pile;
}
