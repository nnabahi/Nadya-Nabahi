/* =====================================================================
   sim-domains.js  —  domains and colors shared by the sims
   ---------------------------------------------------------------------
   Every sim that lives on cells (a box, a torus, or a region drawn in
   the graph tool) turns its domain into the same kind of object, built
   here, so the code is written in one place only. A sim page loads this
   file before its own code.

   A domain is an object with:
     n          number of cells, numbered 0 .. n-1
     x[v], y[v] where cell v is (cell (x, y) is centered at (x, y), as in
                the graph tool)
     first, nbr the neighbors of v are nbr[first[v]] .. nbr[first[v+1] - 1]
                (one long list, cut into pieces by "first"; the usual
                compact way to store a graph, called CSR)
     wrap       for a torus, the x and y range that wraps around; else null
     xmin .. ymax, cellAt   the smallest box around the cells, and which
                cell sits at each place in it (-1 = none), for drawing
     ids[v]     for a drawn domain, the graph tool's name "x,y" of cell v

   Contents:
     wrap(v, lo, hi)          wrap a whole number around, for tori
     wrapNumber(v, size)      the same for any number
     boxDomain(...)           a box or torus of cells
     drawnDomain(...)         a region drawn in the graph tool
     cellAt(d, x, y)          which cell is at (x, y)
     stepsFrom(d, starts)     distances through the domain
     defaultColor(c, count)   the old site's colors
     hexToRGB(hex)            "#rrggbb" as three numbers
   ===================================================================== */


// Wrap a number into lo..hi, for tori. E.g. lo = 0, hi = 9: 10 -> 0, -1 -> 9.
function wrap(v, lo, hi) {
  const n = hi - lo + 1;
  return lo + (((v - lo) % n) + n) % n;
}

// Wrap a number into 0 .. size (not including size). Like wrap(), but
// for any number, not just whole ones. E.g. size = 10: 12.5 -> 2.5.
function wrapNumber(v, size) { return ((v % size) + size) % size; }

// A width x height box of cells, with 4 or 8 neighbors. If "torus" is
// true, the right edge is glued to the left and the top to the bottom.
function boxDomain(width, height, neighbors, torus) {
  const xs = [], ys = [], edges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) { xs.push(x); ys.push(y); }
  }
  // As in the graph tool: each cell looks right and up (and, with 8
  // neighbors, diagonally), wrapping around on a torus.
  const steps = neighbors === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const [dx, dy] of steps) {
        let nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          if (!torus) continue;
          nx = wrap(nx, 0, width - 1);
          ny = wrap(ny, 0, height - 1);
        }
        edges.push([y * width + x, ny * width + nx]);
      }
    }
  }
  const wrapRange = torus ? { xmin: 0, xmax: width - 1, ymin: 0, ymax: height - 1 } : null;
  return makeDomain(xs, ys, edges, wrapRange, null);
}

// A domain drawn in the graph tool. "graph" is the tool's getGraph():
// { vertices: [{id, x, y, color}, ...], edges: [[id, id], ...] }, and
// "toolGrid" its grid settings (for the torus).
function drawnDomain(graph, toolGrid) {
  const index = new Map();
  graph.vertices.forEach(function (v, k) { index.set(v.id, k); });
  const edges = graph.edges.map(function (e) { return [index.get(e[0]), index.get(e[1])]; });
  const wrapRange = toolGrid.torus
    ? { xmin: toolGrid.xmin, xmax: toolGrid.xmax, ymin: toolGrid.ymin, ymax: toolGrid.ymax }
    : null;
  return makeDomain(graph.vertices.map(function (v) { return v.x; }),
                    graph.vertices.map(function (v) { return v.y; }),
                    edges, wrapRange, graph.vertices.map(function (v) { return v.id; }));
}

// Build the domain object described at the top of this file, from the
// cells' coordinates (xs, ys) and the edges as pairs of cell numbers.
function makeDomain(xs, ys, edges, wrapRange, ids) {
  const n = xs.length;

  // Neighbor lists, each edge in both directions. A Set drops repeats
  // (a torus 2 wide meets the same neighbor on both sides), and a cell
  // is never its own neighbor.
  const lists = [];
  for (let v = 0; v < n; v++) lists.push(new Set());
  for (const [a, b] of edges) {
    if (a === b) continue;
    lists[a].add(b);
    lists[b].add(a);
  }
  const first = new Int32Array(n + 1), all = [];
  for (let v = 0; v < n; v++) {
    first[v] = all.length;
    for (const w of lists[v]) all.push(w);
  }
  first[n] = all.length;

  const d = {
    n: n, x: Int32Array.from(xs), y: Int32Array.from(ys),
    first: first, nbr: Int32Array.from(all), wrap: wrapRange, ids: ids,
    xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys),
  };
  const boxWidth = d.xmax - d.xmin + 1;
  d.cellAt = new Int32Array(boxWidth * (d.ymax - d.ymin + 1)).fill(-1);
  for (let v = 0; v < n; v++) d.cellAt[(d.y[v] - d.ymin) * boxWidth + (d.x[v] - d.xmin)] = v;
  return d;
}

// Which cell of domain d is at (x, y)? -1 if none. On a torus, (x, y)
// is first wrapped back into the grid.
function cellAt(d, x, y) {
  if (d.wrap) {
    x = wrap(x, d.wrap.xmin, d.wrap.xmax);
    y = wrap(y, d.wrap.ymin, d.wrap.ymax);
  }
  if (x < d.xmin || x > d.xmax || y < d.ymin || y > d.ymax) return -1;
  return d.cellAt[(y - d.ymin) * (d.xmax - d.xmin + 1) + (x - d.xmin)];
}

// The number of steps from the nearest of the cells "starts" to every
// cell (a breadth-first search). -1 for cells that can't be reached.
function stepsFrom(d, starts) {
  const steps = new Int32Array(d.n).fill(-1);
  const queue = starts.slice();
  for (const s of starts) steps[s] = 0;
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (steps[w] === -1) { steps[w] = steps[v] + 1; queue.push(w); }
    }
  }
  return steps;
}

// How color c (of "count" colors) is drawn: the old site's colors.
// Hues are spread evenly from red (0 degrees) round to magenta (300; going
// all the way to 360 would come back to red), each color a little more
// saturated than the last, all bright. Hue, saturation and brightness
// ("HSV") are turned into the usual "#rrggbb".
function defaultColor(c, count) {
  const hue = c / Math.max(count, 1) * 300;
  const saturation = count <= 1 ? 0.85 : 0.55 + 0.30 * c / (count - 1);
  return hsvToHex(hue, saturation, 0.95);
}

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = value - chroma;
  const [r, g, b] =
    hue < 60  ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] :
    hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return "#" + [r, g, b].map(function (t) {
    return Math.round((t + m) * 255).toString(16).padStart(2, "0");
  }).join("");
}

// "#rrggbb" -> [red, green, blue], each 0 .. 255 (for pictures drawn
// pixel by pixel).
function hexToRGB(hex) {
  return [1, 3, 5].map(function (k) { return parseInt(hex.slice(k, k + 2), 16); });
}
