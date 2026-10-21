/* =====================================================================
   connected-coloring.js  —  the page of the "Random connected
   coloring" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells (on the square grid,
       or on any tiling by regular polygons, its tiles or its corners
       being the cells), a custom one drawn in the graph tool (shown
       inside this page), or a ball of a hyperbolic tiling or a tree.
       The domain code is shared with the other sims: the domains (and
       counting their connected pieces) in js/sim-domains.js, the
       tilings in js/sim-tilings.js, their options and the graph tool
       in js/sim-controls.js, and the hyperbolic tilings and trees, and
       their pictures, in js/sim-graphs.js and js/sim-hyperbolic.js.
     - Builds a starting coloring: an automatic one (N compact blocks)
       or one you draw yourself.
     - Hands both to the Markov chain (connected-coloring-chain.js),
       which runs in a second thread (a "Web Worker"), and draws every
       coloring it sends back, with the statistics.
   Small helpers used by every sim page (byId, readWhole, ...) are in
   js/sim-page.js, the charts (barChart, lineChart, ...) in js/sim-charts.js, and
   moving and zooming the picture in js/sim-view.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The automatic start
     4. Running the chain
     5. Drawing the coloring (and 5b, highlighting one color; 5c,
        watching each move)
     6. Statistics
     7. The domain
     8. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain and number of colors.
const DEFAULTS = { width: 24, height: 24, neighbors: 4, colors: 6, seed: "1" };

const MAX_COLORS = 100;           // the most colors allowed
const MAX_SIDE = 250;             // the biggest box or torus is 250 x 250
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const TRACE_POINTS = 4000;        // the most points each chart over time keeps (the chain keeps them)

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 5, most: 20, cells: 20000 };

// The speeds on the Speed slider, in moves per second.
// Infinity means "as fast as the computer can". The default is low, so
// you can follow the moves; the Speed slider goes faster.
const SPEEDS = [1, 100, Infinity];   // the slider's starting min and max (boxes at its ends change them)
const DEFAULT_SPEED = 10;

// "Watch each move" (section 5c): its Steps slider, in steps of the
// random walk per second, and how long it stops on the other parts of
// a move (picking the colors, the cut, the new colors, accept or
// reject), in seconds: STOP, or less when the steps are fast.
const WATCH_SPEEDS = [1, 200, Infinity];
const DEFAULT_WATCH_SPEED = 50;
const STOP = 1;
const TREE = "#1e1e1e";           // the spanning tree's lines
const WALK = "#ffffff";           // the walk's path (with a TREE-colored edge around it)
const CUT = "#e0201b";            // the edge that gets cut


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js); its kind is domains.kind (section 7)
let N = DEFAULTS.colors;       // number of colors
let colorNames = [];           // colorNames[c] = how color c is drawn, e.g. "#c74440"
let drawnStart = null;         // your own starting coloring, or null for the automatic one
let startShape = "";           // what the start was: "rectangles", "blocks" or "yours"


// The latest coloring and numbers from the chain.
let colors = null;             // colors[v] = color of cell v
let latest = null;             // the numbers, and the run so far (section 5 of connected-coloring-chain.js)
let highlighted = -1;          // the color shown highlighted, or -1 for none (section 5b)


/* =====================================================================
   3. THE AUTOMATIC START
   ---------------------------------------------------------------------
   Like the old site: the domain is cut into a grid of N rectangles,
   in rows, with about the same number in each row, and as many rows as
   makes the rectangles roughly square. (E.g. N = 6 on 24 x 24: 2 rows
   of 3, each rectangle 8 wide and 12 high.) Compact pieces like these
   are a good start: thin stripes would make the chain reject almost
   every move at first. On another tiling the rectangles are drawn in
   side lengths, and each cell goes by where its middle is (cellSpots,
   js/sim-domains.js).

   A drawn region may not cut into rectangles with each color in one
   piece (think of a ring). Then the start is N compact "blocks" instead
   (compactStart below). So is a ball of a hyperbolic tiling or a tree,
   which has no rows and columns.
   ===================================================================== */
function automaticStart(d, count) {
  if (domains.kind === "graph") { startShape = "blocks"; return compactStart(d, count); }
  const rectangles = rectangleStart(d, count);
  startShape = rectangles ? "rectangles" : "blocks";
  return rectangles || compactStart(d, count);
}

// The grid of rectangles over the smallest box around the domain, or
// null if some color would be missing or in more than one piece.
function rectangleStart(d, count) {
  const spot = cellSpots(d);
  const across = spot.xmax - spot.xmin + 1, down = spot.ymax - spot.ymin + 1;
  const rows = Math.min(count, down, Math.max(1, Math.round(Math.sqrt(count * down / across))));
  const rowOf = bands(down, rows);              // row of each line of cells, counted from the top
  const columnsOf = [], firstColorOf = [];      // for each row of rectangles
  let color = 0;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.floor(count / rows) + (r < count % rows ? 1 : 0);
    if (inRow > across) return null;            // narrower than the rectangles it needs
    columnsOf.push(bands(across, inRow));
    firstColorOf.push(color);
    color += inRow;
  }
  const colorOf = new Int32Array(d.n);
  for (let v = 0; v < d.n; v++) {
    const r = rowOf[spot.ymax - spot.y[v]];
    colorOf[v] = firstColorOf[r] + columnsOf[r][spot.x[v] - spot.xmin];
  }
  const pieces = countPieces(d, colorOf, count);
  return pieces.every(function (p) { return p === 1; }) ? colorOf : null;
}

// Cut 0 .. total-1 into "parts" runs of (almost) equal length:
// band[t] = which run t is in.
function bands(total, parts) {
  const band = new Int32Array(total);
  for (let k = 0; k < parts; k++) {
    for (let t = Math.floor(k * total / parts); t < Math.floor((k + 1) * total / parts); t++) band[t] = k;
  }
  return band;
}

// N compact blocks, for any connected domain. N seed cells are spread
// out: the first is the cell farthest from cell 0, and each next one is
// the cell farthest from all seeds so far ("farthest" = most steps
// through the graph). Then every cell takes the color of its nearest
// seed, found by a breadth-first search from all the seeds at once.
// Each cell is reached through a neighbor of its own color, so every
// color is one connected piece.
function compactStart(d, count) {
  const seeds = [];
  let distance = stepsFrom(d, [0]);   // stepsFrom is in js/sim-domains.js
  for (let k = 0; k < count; k++) {
    let far = 0;
    for (let v = 1; v < d.n; v++) if (distance[v] > distance[far]) far = v;
    seeds.push(far);
    distance = stepsFrom(d, seeds);
  }
  // The search from all seeds at once, handing out colors as it goes.
  const colorOf = new Int32Array(d.n).fill(-1);
  const queue = [];
  seeds.forEach(function (s, c) { colorOf[s] = c; queue.push(s); });
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let e = d.first[v]; e < d.first[v + 1]; e++) {
      const w = d.nbr[e];
      if (colorOf[w] === -1) { colorOf[w] = colorOf[v]; queue.push(w); }
    }
  }
  return colorOf;
}


/* =====================================================================
   4. RUNNING THE CHAIN
   ---------------------------------------------------------------------
   The chain is the function chainWorker() in connected-coloring-chain.js,
   with the trace (js/sim-worker.js) copied in for the charts.
   runInWorker (js/sim-page.js) runs it in a second thread, a "Web
   Worker", so the page never freezes. Watching each move, a message
   carries the move's film, shown first (section 5c).
   ===================================================================== */
const sim = runInWorker(chainWorker, [newTrace, keepSample], function (message) {
  if (message.film && watching) startFilm(message); else useMessage(message);
});

// Show the coloring and numbers of a message from the chain.
function useMessage(message) {
  colors = message.colors;
  latest = message;
  drawSoon();
}

// Start the chain again (paused) from the start coloring, with the
// current domain, N and seed.
function restart() {
  film = null;                            // a move being watched is dropped (section 5c)
  if (drawnStart) startShape = "yours";
  colors = drawnStart ? drawnStart.slice() : automaticStart(domain, N);
  traceZoom.from = traceZoom.to = null;   // the charts show the whole new run
  alphaZoom.from = alphaZoom.to = null;
  latest = null;
  sim.setup({ n: domain.n, first: domain.first, nbr: domain.nbr, colors: colors, N: N, seed: byId("seed").value,
              watch: watching, most: TRACE_POINTS });
  showStartInfo();
  drawSoon();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(sim, SPEEDS, DEFAULT_SPEED, "move", "moves", restart);


/* =====================================================================
   5. DRAWING THE COLORING
   ---------------------------------------------------------------------
   Each cell is a square in its color (one polygon, on another tiling),
   with a dark line along every side where two cells of different colors
   meet, or where the domain ends.

   The "view" (js/sim-view.js) says where the picture goes and which
   cells show, and paints them (paintDomain), as in the other sims.
   The picture can be moved and zoomed like a graph in Desmos:
     drag it                          move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   A torus (or a region drawn on one) wraps around, and zoomed out it
   shows several times side by side.

   A ball of a hyperbolic tiling or a tree is drawn by
   js/sim-hyperbolic.js instead: in the disk or the half-plane (drag to
   move around the plane), or, for a tree, spread out in rings, with the
   rest of the tiling in thin gray (drawOnGraph below).
   ===================================================================== */
const simCanvas = byId("sim-canvas");         // the canvas on the page

// Draw at the browser's next screen refresh (at most once per refresh,
// however many colorings arrive in between).
const drawSoon = oncePerFrame(function () { drawColoring(); showStats(); });

const view = makeView(simCanvas, drawSoon);   // where the picture goes, and how far it is moved and zoomed

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, function () { domains.show(); });
const outsideRGB = hexToRGB(OUTSIDE_CELLS);

function drawColoring() {
  if (!domain || !colors || simCanvas.hidden) return;
  if (domains.kind === "graph") { drawOnGraph(); return; }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);

  // The cells, each in its color, with lines between different colors
  // (the outside counts as a color). With a color highlighted,
  // the others are faded. While a move is being watched, the colors
  // are the film's, and its tree and walk go on top (section 5c).
  const paint = colorNames.map(function (name, c) { return hexToRGB(shade(c)); });
  const shown = film ? film.shown : colors;
  paintDomain(view, pen, domain, function (v) { return shown[v]; },
    function (c) { return paint[c]; }, outsideRGB, CELL_LINES, 0);
  if (film) drawFilm(pen);
}

// Hyperbolic plane or tree: the ball's cells in their colors, with the
// rest of the tiling (or tree) in thin gray, and in the disk or the
// half-plane the lines between different colors (drawBall and
// drawBallBorders, js/sim-hyperbolic.js).
function drawOnGraph() {
  const paint = colorNames.map(function (name, c) { return shade(c); });
  const pen = drawBall(disk, domain, function (v) { return paint[colors[v]]; });
  if (disk.picture !== "spread") drawBallBorders(disk, pen, domain, function (v) { return colors[v]; }, CELL_LINES);
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   5b. HIGHLIGHTING ONE COLOR
   ---------------------------------------------------------------------
   Click a cell in the picture (or a bar in the "Size of each color"
   chart) to highlight its color: every other color fades, so the whole
   region of that color is easy to see, even where it winds around.
   Clicking the same color again, or outside the cells, shows every
   color again. The highlight stays on while the chain runs.

   A press that barely moves is a click; one that moves further drags
   the picture, as before (connectPicture, js/sim-view.js). On a
   hyperbolic tiling or tree, one pointer drags across the plane, and
   two fingers slide and zoom the picture.
   ===================================================================== */

// How color c is painted: its own color, or faded if another color is
// highlighted.
function shade(c) {
  if (film && film.pair) {                // watching a move: its two colors stand out
    if (film.pair.includes(c)) return colorNames[c];
  } else if (highlighted === -1 || c === highlighted) return colorNames[c];
  return fadeHex(colorNames[c]);          // (js/sim-highlight.js, shared with the other sims)
}

// Highlight color c (-1: none), or turn it off if it is already on.
function highlight(c) {
  highlighted = (c === highlighted) ? -1 : c;
  showHighlightInfo();
  drawSoon();
}

// The line under the picture: how to highlight, or what is highlighted.
function showHighlightInfo() {
  if (film) return;                       // the line says what the move is doing (section 5c)
  const line = byId("highlight-info");
  if (highlighted === -1 || !colors) {
    line.textContent = "Click a color in the picture, or its bar under Statistics, to highlight it.";
    return;
  }
  line.textContent = "Highlighted: color " + (highlighted + 1) + ", " + colorSizes()[highlighted] + " cells. " +
    (domains.kind === "graph" ? "Click it again to show every color."
                            : "Click it again, or outside the cells, to show every color.");
}

// Dragging, zooming and clicking the picture: a click highlights the
// color under it.
connectPicture(view, disk, function () { return domains.kind === "graph"; }, function (event) {
  if (!colors || film) return;
  const v = cellAtEvent(view, disk, domain, domains.kind === "graph", event);
  if (v === -1) { if (highlighted !== -1) highlight(-1); }   // outside the cells: show every color
  else highlight(colors[v]);
});


/* =====================================================================
   5c. WATCHING EACH MOVE
   ---------------------------------------------------------------------
   With "Watch each move" ticked, every move is shown step by step:
     1. the two colors picked (the others fade);
     2. the random spanning tree of their cells, built by Wilson's
        algorithm: the random walk is the white path, its loops vanish
        as they close, and when it hits the tree it joins it (black);
     3. the cut: one random tree edge flashes red and goes, leaving two
        pieces;
     4. the coin: the pieces get their new colors;
     5. accept or reject, with alpha: a rejected move puts the old
        colors back.
   The chain (connected-coloring-chain.js, section 5) sends each move's
   "film" and waits for "next" before making another one, so the moves
   are the same ones as without watching. The Steps slider sets how
   many steps of the walk show per second; Pause stops in the middle of
   a move, and Step shows one whole move (the rest of the move being
   shown, if any). Not on a hyperbolic tiling or tree (yet).
   ===================================================================== */
let watching = false;          // is "Watch each move" ticked?
let watchSpeed = DEFAULT_WATCH_SPEED;   // steps of the walk per second
let film = null;               // the move being shown, or null

// A new move to show. One still being shown is finished at once.
function startFilm(message) {
  if (film) useMessage(film.message);
  const log = message.film;
  if (!log.pair) { useMessage(message); sim.send({ type: "next" }); return; }   // nothing to show
  film = {
    message: message,
    pair: log.pair, walks: log.walks, root: log.root, cut: log.cut,
    stepping: !player.playing,          // from the Step button: show it all, even paused
    shown: colors.slice(),              // the colors on screen
    middles: cellMiddles(domain),
    parent: new Int32Array(domain.n).fill(-1),   // the tree so far: each cell's next cell toward the root
    inTree: new Uint8Array(domain.n),
    place: new Int32Array(domain.n).fill(-1),    // where each cell is in "path", or -1
    path: [],                           // the walk so far, with its loops erased
    walk: 0, step: 0,                   // which walk, and which step of it
    stage: "pick", wait: stopTime(), owed: 0, last: performance.now(),
  };
  film.inTree[film.root] = 1;
  showFilmInfo();
  requestAnimationFrame(playFilm);
}

// Step, while a move is being shown (paused in the middle of it), shows
// the rest of that move. (The chain makes no new move until this one
// has been shown.)
byId("step").addEventListener("click", function () { if (film) film.stepping = true; });

// How long a stop is: STOP seconds, shorter when the walk is fast.
function stopTime() { return Math.max(0.15, Math.min(STOP, 40 / watchSpeed)); }

// The film runs by the clock, at the browser's screen refresh.
function playFilm(now) {
  if (!film) return;
  const seconds = Math.min(0.25, (now - film.last) / 1000);   // (a hidden tab doesn't jump ahead)
  film.last = now;
  if (player.playing || film.stepping) runFilm(seconds);
  drawSoon();
  if (film) requestAnimationFrame(playFilm);
}

function runFilm(seconds) {
  if (film.stage === "walk") {
    film.owed = Math.min(film.owed + seconds * watchSpeed, 1e7);
    while (film && film.stage === "walk" && film.owed >= 1) { walkStep(); film.owed--; }
    return;
  }
  film.wait -= seconds;
  if (film.wait > 0) return;
  film.wait = stopTime();
  if (film.stage === "pick") film.stage = "walk";
  else if (film.stage === "cut") {                // the coin: the new colors
    film.stage = "recolor";
    for (const [v, c] of film.message.film.proposal) film.shown[v] = c;
  } else if (film.stage === "recolor") {          // accepted or rejected
    film.stage = "verdict";
    film.shown = film.message.colors.slice();
  } else {                                        // done: on to the next move
    const message = film.message;
    film = null;
    useMessage(message);
    sim.send({ type: "next" });
    return;
  }
  showFilmInfo();
}

// One step of Wilson's algorithm: start the next walk, or take one
// step of this one, erasing the loop it closes, or join the tree.
function walkStep() {
  const walk = film.walks[film.walk], path = film.path, place = film.place;
  if (path.length === 0) {                        // a new walk starts
    place[walk[0]] = 0;
    path.push(walk[0]);
    film.step = 1;
  } else {
    const v = walk[film.step++];
    if (film.inTree[v]) {                         // it hit the tree: the path joins it
      path.push(v);
      for (let k = 0; k + 1 < path.length; k++) {
        film.parent[path[k]] = path[k + 1];
        film.inTree[path[k]] = 1;
        place[path[k]] = -1;
      }
      path.length = 0;
      film.walk++;
      if (film.walk === film.walks.length) { film.stage = "cut"; film.wait = stopTime(); }
    } else if (place[v] >= 0) {                   // back on its own path: erase the loop
      for (let k = place[v] + 1; k < path.length; k++) place[path[k]] = -1;
      path.length = place[v] + 1;
    } else {
      place[v] = path.length;
      path.push(v);
    }
  }
  showFilmInfo();
}

// The line under the picture says what is happening.
function showFilmInfo() {
  const f = film, [i, j] = f.pair, alpha = f.message.film.alpha;
  const cells = f.message.film.proposal.length;
  const name = "colors " + (i + 1) + " and " + (j + 1);
  let text = "Move " + f.message.proposed.toLocaleString() + ": ";
  if (f.stage === "pick") text += name + " picked, " + cells + " cells.";
  else if (f.stage === "walk") {
    let inTree = 0;
    for (let v = 0; v < domain.n; v++) inTree += f.inTree[v];
    text += "a random spanning tree of " + name + " (Wilson's algorithm): walk " +
      Math.min(f.walk + 1, f.walks.length) + " of " + f.walks.length + ", " + inTree + " of " + cells + " cells in the tree.";
  } else if (f.stage === "cut") text += "one random edge of the tree is cut, leaving two pieces.";
  else if (f.stage === "recolor") text += "a fair coin gives the two pieces their colors.";
  else text += "α = " + niceNumber(alpha) + ", " +
    (f.message.film.accepted ? "accepted." : "rejected: back to the old colors.");
  byId("highlight-info").textContent = text;
}

// The middle of every cell of domain d, in the picture (cellMiddle,
// js/sim-domains.js), worked out once per domain.
function cellMiddles(d) {
  if (d.middles) return d.middles;
  d.middles = [];
  for (let v = 0; v < d.n; v++) d.middles.push(cellMiddle(d, v));
  return d.middles;
}

// Where to draw cell w's middle when coming from the point "from": on a
// torus, the copy of it nearest "from" (so a line to a neighbor across
// the torus's edge doesn't cross the whole picture).
function nearestMiddle(w, from) {
  const [u, h] = film.middles[w];
  if (!domain.wrap) return [u, h];
  const [across, up] = torusSteps(domain);       // (js/sim-domains.js)
  let best = [u, h], far = Infinity;
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const p = [u + a * across[0] + b * up[0], h + a * across[1] + b * up[1]];
      const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
      if (d < far) { far = d; best = p; }
    }
  }
  return best;
}

// The tree (black), the cut edge (red, only while it is cut), and the
// walk's path (white, with a dot at its head), on every copy that shows.
function drawFilm(pen) {
  const f = film, copies = screenCopies(view, domain);   // (js/sim-view.js; sets view.cell)
  const width = Math.max(1.5, view.cell * 0.18);
  pen.lineCap = pen.lineJoin = "round";
  for (const { sx, sy } of copies) {
    const line = function (path, a, b) {
      path.moveTo(sx(a[0]), sy(a[1]));
      path.lineTo(sx(b[0]), sy(b[1]));
    };
    const tree = new Path2D(), cut = new Path2D(), walk = new Path2D();
    for (let v = 0; v < domain.n; v++) {
      const p = f.parent[v];
      if (p === -1) continue;
      const isCut = v === f.cut[0] && p === f.cut[1];
      if (isCut && f.stage !== "walk" && f.stage !== "cut") continue;   // it's gone
      line(isCut && f.stage === "cut" ? cut : tree, f.middles[v], nearestMiddle(p, f.middles[v]));
    }
    let at = f.middles[f.root];
    pen.fillStyle = TREE;
    pen.beginPath();
    pen.arc(sx(at[0]), sy(at[1]), 1.6 * width, 0, 2 * Math.PI);   // the root
    pen.fill();
    if (f.path.length > 0) {
      at = f.middles[f.path[0]];
      walk.moveTo(sx(at[0]), sy(at[1]));
      for (let k = 1; k < f.path.length; k++) {
        at = nearestMiddle(f.path[k], at);
        walk.lineTo(sx(at[0]), sy(at[1]));
      }
    }
    pen.strokeStyle = TREE;
    pen.lineWidth = width;
    pen.stroke(tree);
    pen.strokeStyle = CUT;
    pen.lineWidth = 2 * width;
    pen.stroke(cut);
    if (f.path.length > 0) {
      pen.strokeStyle = TREE;                    // a dark edge, so white shows on any color
      pen.lineWidth = 2 * width;
      pen.stroke(walk);
      pen.strokeStyle = WALK;
      pen.lineWidth = width;
      pen.stroke(walk);
      pen.fillStyle = WALK;
      pen.beginPath();
      pen.arc(sx(at[0]), sy(at[1]), 1.4 * width, 0, 2 * Math.PI);   // the walk's head
      pen.fill();
      pen.stroke();
    }
  }
}

// The "Watch each move" box and its Steps slider.
byId("watch").addEventListener("change", function () { setWatching(this.checked); });
connectSpeedSlider("watch-speed", WATCH_SPEEDS, DEFAULT_WATCH_SPEED, function (speed) {
  watchSpeed = speed;
  byId("watch-speed-label").textContent = speed === Infinity ? "at once" : speedText(speed, "step", "steps");
});

function setWatching(on) {
  watching = on;
  byId("watch").checked = on;
  byId("watch-options").hidden = !on;
  if (!on && film) { const message = film.message; film = null; useMessage(message); }
  sim.send({ type: "watch", on: on });
  showHighlightInfo();
  drawSoon();
}


/* =====================================================================
   6. STATISTICS
   ---------------------------------------------------------------------
   The table of numbers, and three small charts. The charts get their
   canvas ready, and their colors, from js/sim-charts.js.
   ===================================================================== */
function showStats() {
  if (!domain || !colors) return;
  byId("stat-cells").textContent = domain.n;
  byId("stat-colors").textContent = N;
  const s = latest || { proposed: 0, accepted: 0, boundary: "", pairs: "" };
  byId("stat-proposed").textContent = s.proposed.toLocaleString();
  byId("stat-accepted").textContent = s.accepted.toLocaleString() +
    (s.proposed > 0 ? " (" + (100 * s.accepted / s.proposed).toFixed(1) + "%)" : "");
  byId("stat-boundary").textContent = s.boundary;
  byId("stat-pairs").textContent = s.pairs;
  showHighlightInfo();
  drawSizes();
  drawTrace();
  drawAlphas();
}

// The number of cells of each color.
function colorSizes() {
  const sizes = new Array(N).fill(0);
  for (let v = 0; v < colors.length; v++) sizes[colors[v]]++;
  return sizes;
}

// The colors from the largest to the smallest (ties: the lower color
// number first). This is the order of the bars in the chart.
function largestFirst(sizes) {
  const order = sizes.map(function (size, c) { return c; });
  order.sort(function (a, b) { return sizes[b] - sizes[a] || a - b; });
  return order;
}

// One bar per color, as tall as its number of cells, largest first.
// The bars go from the largest on the left to the smallest on the
// right; each keeps its own color, so you can follow a color as it
// grows and shrinks. A highlighted color's bar stays bright.
let sizesFrame = null;     // where the bars are drawn, for clicks

function drawSizes() {
  const sizes = colorSizes();
  const bars = largestFirst(sizes).map(function (c, place) {
    return { from: place + 0.5, to: place + 1.5, value: sizes[c], color: shade(c) };
  });
  sizesFrame = barChart(byId("sizes-chart"), bars,
    { from: 0.5, to: N + 0.5, whole: true, word: "largest first" },
    { from: 0, to: Math.max(...sizes), round: true, whole: true, word: "cells" });
}

// Clicking a bar highlights its color (section 5b).
byId("sizes-chart").addEventListener("click", function (event) {
  if (!colors || !sizesFrame) return;
  const x = event.clientX - this.getBoundingClientRect().left;
  const place = Math.floor((x - sizesFrame.left) / ((sizesFrame.right - sizesFrame.left) / N));
  const order = largestFirst(colorSizes());
  if (place >= 0 && place < N) highlight(order[place]);
});

// The number of boundary edges against the number of moves accepted. It
// shows the whole run (the chain keeps evenly spaced samples of it, at
// most TRACE_POINTS: keepSample, js/sim-worker.js), rescaled to fit as
// the run goes on; zoom in with the mouse wheel or a pinch, drag to move
// along, and double-click to see the whole run again (chartZoom,
// js/sim-charts.js).
const traceZoom = chartZoom(byId("trace-chart"), drawTrace);

function drawTrace() {
  const points = latest ? pointsOverTime(latest.boundaryTimes, latest.boundaryValues) : [];
  if (points.length < 2) { chartPen(byId("trace-chart")); return; }
  const [from, to] = shownTimes(traceZoom, points[0][0], points[points.length - 1][0]);

  // The points in the stretch shown, plus one on each side, so the line
  // runs all the way to both edges. The numbers on the left go from the
  // lowest to the highest of these points.
  let firstK = 0, lastK = points.length - 1;
  while (firstK + 1 < points.length && points[firstK + 1][0] <= from) firstK++;
  while (lastK - 1 >= 0 && points[lastK - 1][0] >= to) lastK--;
  const series = [{ points: points.slice(firstK, lastK + 1) }];
  const [low, high] = seriesRange(series, 1);
  const frame = lineChart(byId("trace-chart"), series, { from: from, to: to, word: "moves" },
                          { from: low, to: high, round: true, whole: true });
  traceZoom.left = frame.left;
  traceZoom.right = frame.right;
}


// The acceptance probability alpha of each move (section 2 of
// connected-coloring-chain.js) against the move number: one dot per
// move, from 0 at the bottom to 1 at the top. The dashed line is the
// average alpha over the whole run, which is what the share of moves
// accepted (in the table) should be close to. Zoom and drag as on the
// boundary edges chart.
const alphaZoom = chartZoom(byId("alpha-chart"), drawAlphas);

function drawAlphas() {
  const points = latest ? pointsOverTime(latest.alphaTimes, latest.alphaValues) : [];
  if (points.length < 2) { chartPen(byId("alpha-chart")); return; }
  const [from, to] = shownTimes(alphaZoom, points[0][0], points[points.length - 1][0]);
  const average = latest.alphaAverage;
  // The dots are see-through, so crowded dots show darker.
  const frame = lineChart(byId("alpha-chart"), [
    { points: points, dots: true, radius: 1, alpha: 0.5 },
    { points: [[from, average], [to, average]], color: CHART_TEXT, dashed: true, width: 1 },
  ], { from: from, to: to, word: "moves" }, { from: 0, to: 1 });
  alphaZoom.left = frame.left;
  alphaZoom.right = frame.right;

  // The average alpha's value, written above its dashed line.
  const pen = frame.pen;
  pen.textAlign = "right";
  pen.textBaseline = "bottom";
  pen.fillText("average " + average.toFixed(3), frame.right, Math.max(frame.up + 12, frame.sy(average) - 2));
}


/* =====================================================================
   7. THE DOMAIN
   ---------------------------------------------------------------------
   Box / Torus / Custom / Hyperbolic plane or tree, and their options,
   the Lattice options among them (connectDomains, js/sim-controls.js).
   Custom swaps the picture for the graph tool, which this page checks
   live, in two steps:
     1. Draw the region. It must be one connected piece. Then either
        "Use automatic start" (N compact blocks, as for a box), or
        "Draw my own start".
     2. Color the region. The region is locked in the tool (cells
        outside it can't be painted). Every cell needs a color, and
        each color must be one connected piece; the colors you use
        become the N colors.
   ===================================================================== */
let toolStep = 1;          // the tool's step, 1 or 2
let region = null;         // the region drawn in step 1

const domains = connectDomains({
  view: view, player: player, disk: disk,
  box: function () { return boxFromOptions(2, MAX_SIDE, DEFAULTS); },
  ball: function () { return ballFromOptions(disk, BALL); },
  custom: {
    check: checkDrawing,
    onOpen: function () { showStep(1); },
    buttons: ["use-auto", "draw-own", "tool-done"],
    // Step 2 -> "Done": start from your coloring, in the tool's colors.
    done: function (drawing) {
      const start = drawnColoring();
      const names = start.used.map(function (c) { return drawing.palette[c]; });
      domains.use("custom", region, { colorOf: start.colorOf, names: names });
    },
  },
  // A new domain d, and your own coloring of it ("start") or none.
  use: function (d, start) {
    domain = d;
    if (domains.kind === "graph" && watching) setWatching(false);   // not on a hyperbolic tiling or tree (section 5c)
    byId("watch").disabled = domains.kind === "graph";
    startFrom(start);
  },
});

// Show step 1 or 2: its title, its help, and its buttons. (Check the
// drawing again afterwards, with domains.tool.check().)
function showStep(step) {
  toolStep = step;
  byId("step-title").textContent = step === 1
    ? "Step 1 of 2: draw the region"
    : "Step 2 of 2: color the region";
  byId("step-help").textContent = step === 1
    ? "Paint the cells the coloring lives on (any color counts). The region must be one " +
      "connected piece. Then pick an automatic start, or draw your own."
    : "The rule: every cell needs a color, and each color must be one connected piece. " +
      "Cells outside the region are grayed out. The colors you use become the N colors.";
  for (const button of document.querySelectorAll("[data-step]")) {
    button.hidden = Number(button.dataset.step) !== step;
  }
}

// What's wrong with the drawing, if anything, as [problem, good]. The
// buttons that go on (Use automatic start, Draw my own start, Done)
// work only when there is no problem.
function checkDrawing(drawing) {
  if (toolStep === 1) {
    if (drawing.graph.vertices.length === 0) return ["Paint the region first.", ""];
    const region = drawnDomain(drawing.graph, drawing.grid);
    if (region.n < 2) return ["The region needs at least 2 cells.", ""];
    const pieces = countPieces(region, new Int32Array(region.n), 1)[0];
    if (pieces > 1) return ["The region is in " + pieces + " pieces; it must be one connected piece.", ""];
    return ["", region.n + " cells in one connected piece."];
  }
  const start = drawnColoring();
  if (start.uncolored > 0) {
    return [start.uncolored + (start.uncolored === 1 ? " cell has" : " cells have") + " no color yet.", ""];
  }
  if (start.used.length < 2) return ["Use at least 2 colors.", ""];
  if (start.used.length > MAX_COLORS) return ["At most " + MAX_COLORS + " colors, please.", ""];
  const pieces = countPieces(region, start.colorOf, start.used.length);
  const broken = [];
  pieces.forEach(function (count, c) {
    if (count > 1) broken.push("color " + start.used[c] + " is in " + count + " pieces");
  });
  if (broken.length > 0) return ["Each color must be one connected piece: " + broken.join(", ") + ".", ""];
  return ["", start.used.length + " colors, each one connected piece."];
}

// Your drawn coloring of the region, read from the tool. The tool
// numbers colors by palette square (1, 2, ...); the chain wants
// 0 .. N-1, so the colors used are renumbered in order.
//   used[c] = the tool's number of color c;  colorOf[v] = c (or -1)
function drawnColoring() {
  const toolColor = new Map();
  for (const v of domains.tool.drawing.graph.vertices) toolColor.set(v.id, v.color);
  const used = [...new Set(toolColor.values())].sort(function (a, b) { return a - b; });
  const colorOf = new Int32Array(region.n);
  let uncolored = 0;
  region.ids.forEach(function (id, v) {
    if (toolColor.has(id)) colorOf[v] = used.indexOf(toolColor.get(id));
    else { colorOf[v] = -1; uncolored++; }
  });
  return { used: used, colorOf: colorOf, uncolored: uncolored };
}

// Step 1 -> "Use automatic start": the region, with the automatic start.
byId("use-auto").addEventListener("click", function () {
  region = drawnDomain(domains.tool.drawing.graph, domains.tool.drawing.grid);
  domains.use("custom", region);
});

// Step 1 -> "Draw my own start": lock the region and go to step 2.
byId("draw-own").addEventListener("click", function () {
  region = drawnDomain(domains.tool.drawing.graph, domains.tool.drawing.grid);
  domains.tool.frame.contentWindow.postMessage({ type: "lock" }, "*");
  showStep(2);
  domains.tool.check();
});

// Step 2 -> "Back to the region".
byId("tool-back").addEventListener("click", function () {
  domains.tool.frame.contentWindow.postMessage({ type: "unlock" }, "*");
  showStep(1);
  domains.tool.check();
});


/* =====================================================================
   8. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Start from your own coloring "start" ({ colorOf, names }), or,
// without one, from the automatic start with N colors (from 2 to the
// most the domain allows), and restart.
function startFrom(start) {
  drawnStart = start ? start.colorOf : null;
  highlighted = -1;                       // a new start shows every color
  byId("set-colors").max = byId("colors-slider").max = Math.min(MAX_COLORS, domain.n);
  N = showN(start ? start.names.length : N);
  colorNames = start ? start.names : defaultColors(N);
  restart();
}

function showStartInfo() {
  byId("start-info").textContent =
    startShape === "yours" ? "Starting from your own coloring. Changing N switches to the automatic start." :
    startShape === "rectangles" ? "Starting from a grid of " + N + " rectangles." :
    domains.kind === "graph" ? "Starting from " + N + " compact blocks around spread-out cells." :
    "Starting from " + N + " compact blocks (this region can't be cut into a grid of rectangles " +
    "with each color in one piece).";
}

// N: the slider and the number box move together (connectSliderAndBox,
// js/sim-page.js), and the chain restarts live while you drag, like a
// Desmos slider. (startFrom shows N, kept to the colors the domain can
// have.)
const showN = connectSliderAndBox("colors-slider", "set-colors", setColorCount);
function setColorCount(value) {
  N = value;
  startFrom(null);     // a new N always uses the automatic start
}


// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("seed").value = DEFAULTS.seed;
domains.useTicked();
