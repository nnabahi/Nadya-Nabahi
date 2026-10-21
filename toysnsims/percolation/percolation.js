/* =====================================================================
   percolation.js  —  the page of the two percolation sims
   ---------------------------------------------------------------------
   One script for both pages: site-percolation.html and
   bond-percolation.html. Each page says which it is in its <body> tag
   (data-kind="site" or data-kind="bond"), and this script reads that.

   What it does, in plain words:
     - Builds the domain: a box or torus of cells (on the square grid,
       or on any tiling by regular polygons, its tiles or its corners
       being the cells), a region drawn in the graph tool (shown inside
       this page), or a ball of a hyperbolic tiling or a tree. The
       domain code is shared with the other sims: the domains in
       js/sim-domains.js, the tilings in js/sim-tilings.js, their
       options and the graph tool in js/sim-controls.js, and the
       hyperbolic tilings and trees, and their pictures, in
       js/sim-graphs.js and js/sim-hyperbolic.js.
     - Gives every cell (site) or every edge (bond) its own random
       number U, from the seed. At the p on the slider, the ones with
       U < p are open (percolation-clusters.js finds the clusters).
     - Draws the clusters, each in its own color, and the statistics.
     - Play raises p slowly, in steps of 0.001, so you watch the
       clusters grow and join.
   All of this is quick (well under a second even for the biggest
   domain), so it runs in the page itself, with no second thread.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Computing the clusters
     4. Colors
     5. Drawing
     6. Moving, zooming and clicking a cluster
     7. Statistics
     8. Play: raising p
     9. The domain
     10. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

const KIND = document.body.dataset.kind;   // "site" or "bond"

// The default domain, p and seed, for each kind. Bond percolation
// starts smaller, so the edges show.
const DEFAULTS = KIND === "site"
  ? { width: 128, height: 128, neighbors: 4, p: 0.593, seed: "1" }
  : { width: 48, height: 48, neighbors: 4, p: 0.5, seed: "1" };

const MAX_SIDE = KIND === "site" ? 400 : 300;   // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const CLOSED = "#ffffff";         // closed cells (site), or cells with no open edge (bond)
const OPEN = "#5d6370";           // open cells in the "open or closed" colors
const OTHERS = "#c9ccd3";         // the other clusters in the "largest cluster" colors
const SMALLEST_EDGE_CELL = 6;     // bond: cells at least this big are drawn as dots and edges

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 6, most: 20, cells: 20000 };

// The critical point p_c on the square grid, where an infinite cluster
// first appears (see "All the details" for where these come from).
// null where no exact or well-established value is known. (On a tree,
// see criticalPoint.)
const CRITICAL = KIND === "site" ? { 4: 0.592746, 8: 1 - 0.592746 } : { 4: 0.5, 8: null };

// The critical points known exactly on the other tilings, by the
// tiling's code (js/sim-tilings.js) and whether its tiles or its
// corners are the cells. The tiles of triangles and the corners of
// hexagons make the same graph (the honeycomb), and so do the tiles of
// hexagons and the corners of triangles (the triangular lattice). Each
// is written as a key of EXACT, which gives its value.
const EXACT = {
  "1/2": 1 / 2,
  "2 sin(π/18)": 2 * Math.sin(Math.PI / 18),
  "1 − 2 sin(π/18)": 1 - 2 * Math.sin(Math.PI / 18),
  "√(1 − 2 sin(π/18))": Math.sqrt(1 - 2 * Math.sin(Math.PI / 18)),
};
const TILING_CRITICAL = KIND === "site" ? {
  "3/m30/r(h2)": { corners: "1/2" },                       // triangles
  "6/m30/r(h1)": { tiles: "1/2" },                         // hexagons
  "6-3-6/m30/r(v4)": { corners: "1 − 2 sin(π/18)" },       // kagome
  "12-3/m30/r(h3)": { corners: "√(1 − 2 sin(π/18))" },     // truncated hexagonal
} : {
  "3/m30/r(h2)": { tiles: "1 − 2 sin(π/18)", corners: "2 sin(π/18)" },
  "6/m30/r(h1)": { tiles: "2 sin(π/18)", corners: "1 − 2 sin(π/18)" },
};

// Play and Step raise p by P_STEP (the p slider's own step), Play this
// many times per second (the Speed slider).
const P_STEP = 0.001;
const SPEEDS = [1, 100];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 5;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domain = null;          // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js); its kind is domains.kind (section 9)
let edges = null;           // every edge once (edgesOf in percolation-clusters.js)
let entryEdge = null;       // entryEdge[e] = the edge of neighbor entry e (domain.nbr[e])
let U = null;               // one random number per cell (site) or edge (bond)
let swept = null;           // the clusters for every p (sweep in percolation-clusters.js)
let p = DEFAULTS.p;         // the p on the slider
let result = null;          // the clusters at p (percolate in percolation-clusters.js)
const highlight = newHighlight();   // a clicked cell: its cluster is highlighted (js/sim-highlight.js)


/* =====================================================================
   3. COMPUTING THE CLUSTERS
   ===================================================================== */

// A new domain or a new seed: new random numbers, and the sweep over
// every p (for the charts).
function newNumbers() {
  const count = KIND === "site" ? domain.n : edges.count;
  U = uniformNumbers(count, byId("seed").value);
  swept = sweep(domain, KIND, U, edges);
  computeClusters();
}

// The clusters at the current p. (If p goes down far enough that the
// clicked cell leaves every cluster, nothing is highlighted until it
// is in one again: js/sim-highlight.js.)
function computeClusters() {
  result = percolate(domain, KIND, p, U, edges);
  drawSoon();
}

// For each entry of the neighbor lists of domain d (d.nbr), the number
// of its edge in "edges", to look up whether an edge is open when
// drawing.
function makeEntryEdges(d, edges) {
  const lookup = new Int32Array(d.nbr.length);
  for (let e = 0; e < edges.count; e++) {
    const a = edges.a[e], b = edges.b[e];
    for (let k = d.first[a]; k < d.first[a + 1]; k++) if (d.nbr[k] === b) lookup[k] = e;
    for (let k = d.first[b]; k < d.first[b + 1]; k++) if (d.nbr[k] === a) lookup[k] = e;
  }
  return lookup;
}

// Is cell v in a cluster worth coloring? For site: v is open. For
// bond: v has an open edge (a cell on its own stays white).
function inCluster(v) {
  if (result.root[v] === -1) return false;
  return KIND === "site" || result.name[result.root[v]] !== -1;
}


/* =====================================================================
   4. COLORS
   ---------------------------------------------------------------------
   Each cluster is colored by its name (see percolation-clusters.js),
   so it keeps its color as p grows. In site percolation, when clusters
   merge, the new cluster takes the color of the biggest one. The hue
   of name k steps around the color wheel by the golden ratio, which
   keeps neighboring names far apart in color. Colors are remembered
   once worked out.
   ===================================================================== */
const nameColors = new Map();
function colorOfName(k) {
  if (!nameColors.has(k)) {
    const hue = (k * 0.6180339887) % 1 * 360;
    const saturation = 0.45 + 0.35 * ((k * 0.7548776662) % 1);
    nameColors.set(k, hexToRGB(hsvToHex(hue, saturation, 0.92)));
  }
  return nameColors.get(k);
}

// How the cluster with root r is colored (r = -1: a closed cell), as
// [red, green, blue], with the Colors menu.
const closedRGB = hexToRGB(CLOSED), openRGB = hexToRGB(OPEN), othersRGB = hexToRGB(OTHERS);
const accentRGB = hexToRGB(CHART_LINE), outsideRGB = hexToRGB(OUTSIDE_CELLS);
function rgbOfRoot(r) {
  if (r === -1 || (KIND === "bond" && result.name[r] === -1)) return closedRGB;
  const mode = byId("colors").value;
  let rgb = mode === "open" ? openRGB
    : mode === "largest" ? (r === result.largestRoot ? accentRGB : othersRGB)
    : colorOfName(result.name[r]);
  // A clicked cluster stands out: every other cluster fades (fadeRGB,
  // js/sim-highlight.js).
  if (highlight.inside !== null && r !== highlight.color) rgb = fadeRGB(rgb);
  return rgb;
}


/* =====================================================================
   5. DRAWING
   ---------------------------------------------------------------------
   Site percolation: one square per cell, in its cluster's color
   (closed cells white), with a dark line between different clusters
   when the cells are big enough to see.

   Bond percolation, when the cells are big enough: a dot per cell and
   a line for every open edge, in its cluster's color. Zoomed far out,
   where lines would be a blur, each cell is a square in its cluster's
   color instead (cells with no open edge white).

   On any other tiling, the same with each cell its own polygon: site
   percolation paints the polygons, and bond percolation draws a dot in
   the middle of each cell and a line for each open edge (a polygon per
   cell, zoomed far out).

   The "view" (js/sim-view.js) says where the picture goes and which
   squares show; it also moves and zooms it (section 6).

   On a hyperbolic tiling or tree, the picture is the disk, the
   half-plane or (a tree) spread out in rings. Site percolation draws
   each cell in its cluster's color (drawBall, js/sim-hyperbolic.js).
   Bond percolation draws the graph itself, as on the square grid: a
   line for every open edge in its cluster's color, thin gray lines for
   the closed ones, and no cells (drawBallBonds, js/sim-hyperbolic.js).
   A ring marks the start cell.
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh).
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });

const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, function () { domains.show(); });

function drawPicture() {
  if (!domain || !result || simCanvas.hidden) return;
  findHighlight(highlight, domain, clusterGroups());   // the clicked cell's cluster, now
  if (domains.kind === "graph") { drawOnBall(); return; }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  const asEdges = KIND === "bond" && view.size * view.zoom >= SMALLEST_EDGE_CELL;
  if (asEdges && domain.lattice) {
    drawTilingEdges(pen);
  } else if (asEdges) {
    drawEdges(pen);
  } else {
    // Squares or polygons (paintDomain, js/sim-view.js). Each cell's
    // group is its cluster's root (-1 for white), so in site percolation
    // the lines go between clusters.
    paintDomain(view, pen, domain, groupOf, rgbOfRoot, outsideRGB, KIND === "site" ? CELL_LINES : null, SMALLEST_BORDERED_CELL);
  }
  pen.restore();
}

// The group of cell v in the picture: its cluster's root, or -1 (white).
function groupOf(v) { return inCluster(v) ? result.root[v] : -1; }

// Every cell's group, as one list: the clusters, as a coloring whose
// regions are exactly the clusters (for the highlight). Two neighbors
// with the same root are in the same cluster, and a cluster is joined
// up through its open sites or edges, so a search through neighbors of
// the same root finds the whole cluster.
function clusterGroups() {
  const groups = new Int32Array(domain.n);
  for (let v = 0; v < domain.n; v++) groups[v] = groupOf(v);
  return groups;
}

// Bond percolation, big cells: the dots and the open edges. Each square
// looks at the squares to its right and above (and, with 8 neighbors,
// diagonally), and if their cells share an open edge, a line joins the
// two middles.
function drawEdges(pen) {
  const cells = cellsShown(view, domain);
  const cols = view.cols, rows = view.rows, size = view.cell;
  pen.fillStyle = CLOSED;
  pen.fillRect(view.left, 0, view.width, view.height);
  const bonds = bondPaths(size);
  const looks = [[1, 0], [0, -1], [1, -1], [1, 1]];   // right, up, up-right, down-right (rows go down)
  const middleX = function (i) { return squareLeft(view, view.firstI + i) + size / 2; };
  const middleY = function (k) { return squareTop(view, view.firstK + k) + size / 2; };

  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < cols; i++) {
      const v = cells[k * cols + i];
      if (v === -1) {               // not in the domain
        pen.fillStyle = OUTSIDE_CELLS;
        pen.fillRect(squareLeft(view, view.firstI + i), squareTop(view, view.firstK + k), size + 1, size + 1);
        continue;
      }
      const x = middleX(i), y = middleY(k);
      const lines = bonds.dot(v, x, y);
      if (lines === null) continue;
      for (const [di, dk] of looks) {
        if (i + di >= cols || k + dk < 0 || k + dk >= rows) continue;
        const w = cells[(k + dk) * cols + i + di];
        if (w === -1 || !isOpenEdge(v, w)) continue;
        lines.moveTo(x, y);
        lines.lineTo(middleX(i + di), middleY(k + dk));
      }
    }
  }
  bonds.draw(pen);
}

// Bond percolation on a tiling, big cells: a dot in the middle of every
// cell, and a line for every open edge, from the cell with the smaller
// number to the middle of the cell across the side (on a torus, the
// copy of it in the next block over, so the line doesn't cross the
// whole picture). On a torus every copy that shows is drawn.
function drawTilingEdges(pen) {
  pen.fillStyle = CLOSED;
  pen.fillRect(view.left, 0, view.width, view.height);
  const copies = screenCopies(view, domain);      // (js/sim-view.js; sets view.cell)
  const bonds = bondPaths(view.cell), tiles = domain.tiling.cells;
  for (const { sx, sy } of copies) {
    for (let v = 0; v < domain.n; v++) {
      const [u, w] = cellMiddle(domain, v);
      const x = sx(u), y = sy(w);
      if (!nearScreen(view, x, y)) continue;
      const lines = bonds.dot(v, x, y);
      if (lines === null) continue;
      tiles[domain.part[v]].next.forEach(function ([k, dI, dJ], e) {
        const other = domain.sides[v][e];
        if (other < v || !isOpenEdge(v, other)) return;
        const [bu, bw] = blockStart(domain, domain.x[v] + dI, domain.y[v] + dJ);
        lines.moveTo(x, y);
        lines.lineTo(sx(bu + tiles[k].middle[0]), sy(bw + tiles[k].middle[1]));
      });
    }
  }
  bonds.draw(pen);
}

// Is the edge between neighbors v and w open?
function isOpenEdge(v, w) {
  for (let e = domain.first[v]; e < domain.first[v + 1]; e++) {
    if (domain.nbr[e] === w) return U[entryEdge[e]] < p;
  }
  return false;
}

// The dots and lines of bond percolation, for cells "size" pixels
// across, collected by color so each color is drawn at once (much
// faster than one line at a time):
//   dot(v, x, y)   the dot of cell v at (x, y); returns the path to
//                  put v's open edges in, or null if v has none (its
//                  dot is small and gray)
//   draw(pen)      draw them all
function bondPaths(size) {
  const paths = new Map();          // color -> the lines (and dots) in that color
  const loose = new Path2D();       // the dots of cells with no open edge
  const radius = Math.max(1.2, size * 0.13);
  return {
    dot: function (v, x, y) {
      if (!inCluster(v)) {
        loose.moveTo(x + radius * 0.6, y);
        loose.arc(x, y, radius * 0.6, 0, 2 * Math.PI);
        return null;
      }
      const color = rgbToHex(rgbOfRoot(result.root[v]));
      if (!paths.has(color)) paths.set(color, { lines: new Path2D(), dots: new Path2D() });
      const path = paths.get(color);
      path.dots.moveTo(x + radius, y);
      path.dots.arc(x, y, radius, 0, 2 * Math.PI);
      return path.lines;
    },
    draw: function (pen) {
      pen.fillStyle = OTHERS;
      pen.fill(loose);
      pen.lineWidth = Math.max(1.5, size * 0.22);
      pen.lineCap = "round";
      for (const [color, path] of paths) {
        pen.strokeStyle = color;
        pen.stroke(path.lines);
        pen.fillStyle = color;
        pen.fill(path.dots);
      }
    },
  };
}

// Hyperbolic plane or tree: the cells in their clusters' colors (site),
// or the open edges in their clusters' colors (bond), and a ring around
// the start.
function drawOnBall() {
  let pen;
  if (KIND === "site") {
    pen = drawBall(disk, domain, function (v) {
      return rgbToHex(rgbOfRoot(inCluster(v) ? result.root[v] : -1));
    });
  } else {
    const height = pictureHeight(BALL_HEIGHT);
    if (disk.picture === "spread") {
      pen = drawSpreadTree(disk, height, domain.n, function (v) { return domain.depth[v]; },
        function (v) { return domain.angle[v]; }, function () { return null; });
    } else {
      pen = diskPen(disk, height);
      drawDiskFrame(disk, pen, height, CLOSED, UNDER_COLOR);
    }
    drawBallBonds(disk, pen, domain, function (e) { return U[entryEdge[e]] < p; },
      function (v) { return inCluster(v) ? rgbToHex(rgbOfRoot(result.root[v])) : null; }, OTHERS);
  }
  const start = ballSpot(disk, domain, 0);
  if (start !== null) {
    pen.beginPath();
    pen.arc(start.x, start.y, Math.max(4, Math.min(12, 0.5 * start.size)), 0, 2 * Math.PI);
    pen.strokeStyle = CELL_LINES;
    pen.lineWidth = 2;
    pen.stroke();
  }
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. MOVING, ZOOMING AND CLICKING A CLUSTER
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-view.js). A press that hardly
   moves is a click instead: clicking a cell in a cluster highlights
   that cluster (the others fade), and it stays highlighted as p changes
   and it grows. Clicking it again, or a white cell, clears it.
   On a hyperbolic tiling or tree, one pointer drags across the plane
   instead, and two fingers slide and zoom the picture; a click works
   the same.
   ===================================================================== */
connectPicture(view, {
  disk: disk, onGraph: function () { return domains.kind === "graph"; },
  onClick: function (event) { clickCell(cellAtEvent(view, disk, domain, domains.kind === "graph", event)); },
});

function clickCell(v) {
  clickHighlight(highlight, v, clusterGroups());
  drawSoon();
}


/* =====================================================================
   7. STATISTICS
   ===================================================================== */
function showStats() {
  if (!result) return;
  const n = domain.n;
  const largest = result.largestRoot === -1 ? 0 : result.size[result.largestRoot];
  const total = KIND === "site" ? n : edges.count;
  const onGraph = domains.kind === "graph";

  byId("stat-cells").textContent = n.toLocaleString();
  byId("stat-edges").textContent = edges.count.toLocaleString();
  byId("stat-p").textContent = p.toFixed(3);
  byId("stat-open").textContent = result.openCount.toLocaleString() + " of " + total.toLocaleString() +
    " (" + (100 * result.openCount / Math.max(total, 1)).toFixed(1) + "%)";
  byId("stat-clusters").textContent = result.clusters.toLocaleString();
  byId("stat-largest").textContent = largest.toLocaleString() + " cells (" + (100 * largest / n).toFixed(1) + "% of all cells)";
  // (On a ball, "crosses" means the start's cluster reaches the edge:
  // see ballForPercolation in percolation-clusters.js.)
  byId("stat-cross-name").textContent = onGraph ? "The start's cluster reaches the edge of the ball"
    : domain.wrap ? "Some cluster wraps around the torus" : "Some cluster crosses from the left side to the right";
  byId("stat-cross").textContent = result.crossed ? "yes" : "no";
  byId("stat-cross-at").textContent = swept.crossAt === null ? "never" : "p = " + swept.crossAt.toFixed(4);
  byId("stat-cross-at-name").textContent = onGraph ? "First reaches the edge at"
    : domain.wrap ? "First wraps around at" : "First crosses at";
  byId("stat-selected").textContent = highlight.inside === null ? "none (click a cluster)"
    : highlight.size.toLocaleString() + " cells";

  drawCurve(byId("largest-chart"), function (k) { return largestAt(k) / n; }, "largest cluster / cells");
  drawCurve(byId("clusters-chart"), function (k) { return clustersAt(k) / n; }, "clusters / cells");
  drawSizesChart();
}

// The largest cluster and the number of clusters once k elements are
// open (from the sweep; k = 0 means nothing open yet).
function largestAt(k) { return k === 0 ? (KIND === "site" ? 0 : 1) : swept.largest[k - 1]; }
function clustersAt(k) { return k === 0 ? (KIND === "site" ? 0 : domain.n) : swept.clusters[k - 1]; }

// A curve over p from 0 to 1, for this sample: "valueAt(k)" is the
// value once k elements are open. A dot marks the current p, and a
// dashed line the critical point p_c, when it is known.
function drawCurve(canvas, valueAt, label) {
  const POINTS = 400, points = [];
  for (let j = 0; j <= POINTS; j++) points.push([j / POINTS, valueAt(openAt(swept, j / POINTS))]);
  const frame = lineChart(canvas, [{ points: points }], { from: 0, to: 1, word: "p" },
                          { from: 0, to: Math.max(1e-9, seriesRange([{ points: points }], 1)[1]), round: true, word: label });
  const pen = frame.pen;
  const pc = criticalPoint();
  if (pc !== null) {
    pen.setLineDash([3, 3]);
    pen.strokeStyle = CHART_TEXT;
    pen.lineWidth = 1;
    pen.beginPath(); pen.moveTo(frame.sx(pc), frame.up); pen.lineTo(frame.sx(pc), frame.bottom); pen.stroke();
    pen.setLineDash([]);
    pen.textAlign = "left";
    pen.textBaseline = "top";
    pen.fillText("p_c", frame.sx(pc) + 3, frame.up);
  }
  pen.beginPath();
  pen.arc(frame.sx(p), frame.sy(valueAt(openAt(swept, p))), 4, 0, 2 * Math.PI);
  pen.fillStyle = CHART_LINE;
  pen.fill();
}

// How many clusters there are of each size at the current p, grouped
// by powers of 2: 1, 2-3, 4-7, 8-15, ... (each bar labeled by the
// smallest size in it; powerOfTwoBars, js/sim-charts.js). Bond clusters
// of one cell (no open edge) are left out.
function drawSizesChart() {
  const sizes = [];
  for (let v = 0; v < domain.n; v++) {
    if (result.root[v] === v && inCluster(v)) sizes.push(result.size[v]);
  }
  powerOfTwoBars(byId("sizes-chart"), powerOfTwoBins(sizes), "clusters");
}

// The critical point for the domain in use: for a box or torus, where
// the cells sit on the square grid with 4 or 8 neighbors, or on a
// tiling where it is known exactly (tilingCritical), and for a tree of
// degree d, where it is 1/(d - 1) for both site and bond percolation
// (see "All the details"). No exact value is known for the hyperbolic
// tilings.
function criticalPoint() {
  if (domains.kind === "custom") return null;
  if (domains.kind === "graph") return isTree(disk.spec) ? 1 / (disk.spec.p - 1) : null;
  if (domain.lattice) return tilingCritical() === null ? null : EXACT[tilingCritical()];
  return CRITICAL[byId("set-neighbors").value];
}

// The exact critical point on the tiling in use, as a key of EXACT, or
// null if there is none.
function tilingCritical() {
  const known = TILING_CRITICAL[domain.tiling.code];
  return (known && known[domain.tiling.corners ? "corners" : "tiles"]) || null;
}


/* =====================================================================
   8. PLAY: RAISING p
   ---------------------------------------------------------------------
   Play and Step raise p by P_STEP (rounded to a multiple of it), on the
   run loop every sim uses (makeRunLoop, js/sim-worker.js), up to p = 1.
   A step only moves p; the clusters are found once for each batch of
   steps (setP, section 10).
   ===================================================================== */
const raising = makeRunLoop(function () { p = Math.min(1, Math.round((p + P_STEP) / P_STEP) * P_STEP); },
                            function () { setP(p); },
                            function () { return p >= 1; });

// Restart: back to p = 0, paused.
function restart() {
  player.setPlaying(false);
  setP(0);
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js).
const player = connectPlay(raising, SPEEDS, DEFAULT_SPEED, "step of 0.001", "steps of 0.001", restart);


/* =====================================================================
   9. THE DOMAIN
   ---------------------------------------------------------------------
   Box / Torus / Custom / Hyperbolic plane or tree, and their options,
   the Lattice options among them (connectDomains, js/sim-controls.js).
   Custom swaps the picture for the graph tool, where any drawing of at
   least two cells works, even one in several pieces. A new domain gets
   its edges, new random numbers and the sweep.
   ===================================================================== */
const domains = connectDomains({
  view: view, player: player, disk: disk,
  box: function () { return boxFromOptions(2, MAX_SIDE, DEFAULTS); },
  ball: function () {
    const ball = ballFromOptions(disk, BALL);
    return ball === null ? null : ballForPercolation(ball);
  },
  custom: {
    check: atLeastTwoCells,
    help: KIND === "site" ? "Paint the cells that can be open (any color counts). Then press Done."
      : "Paint the cells (any color counts). Every pair of neighboring cells gets an edge, open or closed. Then press Done.",
  },
  use: function (d) {
    domain = d;
    edges = edgesOf(d);
    entryEdge = makeEntryEdges(d, edges);
    clearHighlight(highlight);
    newNumbers();
  },
  show: showCritical,
});

// The critical point's row, for the domain in use.
function showCritical() {
  const onGraph = (domains.kind === "graph");
  const pc = criticalPoint();
  byId("critical-row").hidden = (pc === null);
  if (pc !== null) {
    byId("critical-value").textContent = onGraph ? "= 1/" + (disk.spec.p - 1)
      : domain.lattice ? "= " + tilingCritical() + (pc === 0.5 ? "" : " ≈ " + pc.toFixed(4))
      : pc === 0.5 ? "= 1/2" : "≈ " + pc.toFixed(4);
    byId("critical-where").textContent = onGraph ? "tree" : domain.lattice ? "lattice" : "grid";
  }
}


/* =====================================================================
   10. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// p: the slider and the box move together (connectSliderAndBox,
// js/sim-page.js), and the picture follows live while you drag, like a
// Desmos slider.
const showP = connectSliderAndBox("p-slider", "p-box", setP);

// A new p, from the slider, the box, Play or Step.
function setP(value) {
  p = showP(value);
  computeClusters();
  player.showDone();    // at p = 1, Play and Step are grayed out
}

byId("p-critical").addEventListener("click", function () { setP(criticalPoint()); });

// Colors.
byId("colors").addEventListener("change", drawSoon);

// Seed: the same seed gives the same numbers U every time.
connectSeed(function () { clearHighlight(highlight); newNumbers(); });


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("seed").value = DEFAULTS.seed;
showP(p);
domains.useTicked();
