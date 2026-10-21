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
   js/sim-page.js, the charts' (chartPen, ...) in js/sim-charts.js, and
   moving and zooming the picture in js/sim-view.js.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The automatic start
     4. Running the chain
     5. Drawing the coloring (and 5b, highlighting one color; 5c,
        watching each move)
     6. Statistics
     7. Custom domains: the graph tool inside this page
     8. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain and number of colors.
const DEFAULTS = { width: 24, height: 24, neighbors: 4, colors: 6, seed: "1" };

const MAX_COLORS = 100;           // the most colors allowed
const MAX_SIDE = 250;             // the biggest box or torus is 100 x 100
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // the lines between colors
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const TRACE_POINTS = 4000;        // the most points each chart over time keeps (section 6)

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

let domainKind = "box";        // "box", "torus", "custom" or "graph": the domain in use
let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
let customDomain = null;       // the last custom domain drawn, if any
let N = DEFAULTS.colors;       // number of colors
let colorNames = [];           // colorNames[c] = how color c is drawn, e.g. "#c74440"
let drawnStart = null;         // your own starting coloring, or null for the automatic one
let startShape = "";           // what the start was: "rectangles", "blocks" or "yours"

let run = 0;                   // counts restarts, so leftovers from an older run are ignored

// The latest coloring and numbers from the chain.
let colors = null;             // colors[v] = color of cell v
let latest = null;             // { proposed, accepted, boundary, pairs }
let trace = [];                // [moves accepted, boundary edges] pairs, for the chart
let traceEvery = 1;            // the chart keeps one message in this many (section 6)
let alphaTrace = [];           // [move, alpha] pairs, for the acceptance chart
let alphaEvery = 1;            // that chart keeps one move in this many
let alphaSum = 0, alphaCount = 0;   // for the average alpha over the whole run
let messages = 0;              // messages from the chain in this run
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
  if (domainKind === "graph") { startShape = "blocks"; return compactStart(d, count); }
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
   with the run loop (js/sim-worker.js) copied in. startWorker
   (js/sim-page.js) runs it in a second thread, a "Web Worker", so the
   page never freezes.
   ===================================================================== */
const worker = startWorker(chainWorker, [makeRunLoop]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  if (message.film && watching) { startFilm(message); return; }   // shown first (section 5c)
  useMessage(message);
};

// Show the coloring and numbers of a message from the chain.
function useMessage(message) {
  colors = message.colors;
  latest = message;
  keepForChart(message);
  drawSoon();
}

worker.onerror = function () {
  showMessage("The chain couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start the chain again from the start coloring, with the current
// domain, N and seed.
function restart() {
  run++;
  film = null;                            // a move being watched is dropped (section 5c)
  if (drawnStart) startShape = "yours";
  colors = drawnStart ? drawnStart.slice() : automaticStart(domain, N);
  trace = [];
  traceEvery = 1;
  messages = 0;
  alphaTrace = [];
  alphaEvery = 1;
  alphaSum = alphaCount = 0;
  traceZoom.from = traceZoom.to = null;   // the charts show the whole new run
  alphaZoom.from = alphaZoom.to = null;
  latest = null;
  worker.postMessage({
    type: "setup", run: run,
    n: domain.n, first: domain.first, nbr: domain.nbr,
    colors: colors, N: N, seed: byId("seed").value,
  });
  player.carryOn();
  showStartInfo();
  drawSoon();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(worker, SPEEDS, DEFAULT_SPEED, "move", "moves", restart);


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
const disk = makeDiskView(simCanvas, view, showDomainChoice);
const outsideRGB = hexToRGB(OUTSIDE);

function drawColoring() {
  if (!domain || !colors || simCanvas.hidden) return;
  if (domainKind === "graph") { drawOnGraph(); return; }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);

  // The cells, each in its color, with lines between different colors
  // (the outside counts as a color). With a color highlighted,
  // the others are faded. While a move is being watched, the colors
  // are the film's, and its tree and walk go on top (section 5c).
  const paint = colorNames.map(function (name, c) { return hexToRGB(shade(c)); });
  const shown = film ? film.shown : colors;
  paintDomain(view, pen, domain, function (v) { return shown[v]; },
    function (c) { return paint[c]; }, outsideRGB, BORDER, 0);
  if (film) drawFilm(pen);
}

// Hyperbolic plane or tree: the ball's cells in their colors, with the
// rest of the tiling (or tree) in thin gray, and in the disk or the
// half-plane the lines between different colors (drawBall and
// drawBallBorders, js/sim-hyperbolic.js).
function drawOnGraph() {
  const paint = colorNames.map(function (name, c) { return shade(c); });
  const pen = drawBall(disk, domain, function (v) { return paint[colors[v]]; });
  if (disk.picture !== "spread") drawBallBorders(disk, pen, domain, function (v) { return colors[v]; }, BORDER);
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
   the picture, as before (connectPicture, js/sim-controls.js). On a
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
    (domainKind === "graph" ? "Click it again to show every color."
                            : "Click it again, or outside the cells, to show every color.");
}

// Dragging, zooming and clicking the picture: a click highlights the
// color under it.
connectPicture(view, disk, function () { return domainKind === "graph"; }, function (event) {
  if (!colors || film) return;
  const v = cellAtEvent(view, disk, domain, domainKind === "graph", event);
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
   a move, and Step shows one whole move. Not on a hyperbolic tiling or
   tree (yet).
   ===================================================================== */
let watching = false;          // is "Watch each move" ticked?
let watchSpeed = DEFAULT_WATCH_SPEED;   // steps of the walk per second
let film = null;               // the move being shown, or null

// A new move to show. One still being shown is finished at once.
function startFilm(message) {
  if (film) useMessage(film.message);
  const log = message.film;
  if (!log.pair) { useMessage(message); worker.postMessage({ type: "next" }); return; }   // nothing to show
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
    worker.postMessage({ type: "next" });
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
  worker.postMessage({ type: "watch", on: on });
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
function drawSizes() {
  const canvas = byId("sizes-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sizes = colorSizes();
  const biggest = Math.max(...sizes);
  pen.textBaseline = "top";
  pen.fillText("largest: " + biggest + " cells", 0, 0);
  // The bars go from the largest on the left to the smallest on the
  // right; each keeps its own color, so you can follow a color as it
  // grows and shrinks. A highlighted color's bar stays bright.
  const top = 16, barWidth = w / N;
  largestFirst(sizes).forEach(function (c, place) {
    const barHeight = Math.max(1, (h - top) * sizes[c] / biggest);
    pen.fillStyle = shade(c);
    pen.fillRect(place * barWidth + 1, h - barHeight, Math.max(1, barWidth - 2), barHeight);
  });
}

// Clicking a bar highlights its color (section 5b).
byId("sizes-chart").addEventListener("click", function (event) {
  if (!colors) return;
  const box = this.getBoundingClientRect();
  const place = Math.floor((event.clientX - box.left) / (box.width / N));
  const order = largestFirst(colorSizes());
  if (place >= 0 && place < N) highlight(order[place]);
});

// The "boundary edges" chart keeps the whole run. Each message from the
// chain is one point; when there are TRACE_POINTS of them, every other
// point is dropped and from then on only one message in twice as many
// is kept. So the points stay evenly spread over the whole run, however
// long it gets.
function keepForChart(message) {
  messages++;
  if ((messages - 1) % traceEvery !== 0) return;
  trace.push([message.accepted, message.boundary]);
  if (trace.length >= TRACE_POINTS) {
    trace = trace.filter(function (p, k) { return k % 2 === 0; });
    traceEvery *= 2;
  }
  keepAlphas(message.alphas);
}

// The acceptance chart keeps its points the same way, but per move:
// "alphas" is move, alpha, move, alpha, ... for every move since the
// last message, and the chart keeps one move in alphaEvery.
function keepAlphas(alphas) {
  for (let k = 0; k < alphas.length; k += 2) {
    const move = alphas[k], alpha = alphas[k + 1];
    alphaSum += alpha;
    alphaCount++;
    if ((move - 1) % alphaEvery !== 0) continue;
    alphaTrace.push([move, alpha]);
    if (alphaTrace.length >= TRACE_POINTS) {
      alphaTrace = alphaTrace.filter(function (p, j) { return j % 2 === 0; });
      alphaEvery *= 2;
    }
  }
}

// The number of boundary edges against the number of moves accepted. It
// shows the whole run, rescaled to fit as the run goes on; zoom in with
// the mouse wheel or a pinch, drag to move along, and double-click to
// see the whole run again (chartZoom, js/sim-charts.js).
const traceZoom = chartZoom(byId("trace-chart"), drawTrace);

function drawTrace() {
  const canvas = byId("trace-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (trace.length < 2) return;
  const [from, to] = shownTimes(traceZoom, trace[0][0], trace[trace.length - 1][0]);

  // The points in the stretch shown, plus one on each side, so the line
  // runs all the way to both edges. The numbers on the left are the
  // lowest and highest of these points.
  let firstK = 0, lastK = trace.length - 1;
  while (firstK + 1 < trace.length && trace[firstK + 1][0] <= from) firstK++;
  while (lastK - 1 >= 0 && trace[lastK - 1][0] >= to) lastK--;
  const points = trace.slice(firstK, lastK + 1);
  let low = Infinity, high = -Infinity;
  for (const p of points) { low = Math.min(low, p[1]); high = Math.max(high, p[1]); }

  const left = 40, top = 6, bottom = h - 16;
  traceZoom.left = left;
  traceZoom.right = w;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(String(high), left - 6, top);
  pen.fillText(String(low), left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText("moves " + Math.round(to).toLocaleString(), w, h);
  pen.textAlign = "left";
  pen.fillText(Math.round(from).toLocaleString(), left, h);

  pen.save();
  pen.beginPath();
  pen.rect(left, 0, w - left, bottom + 1);
  pen.clip();                                   // keep the line off the numbers
  pen.beginPath();
  points.forEach(function (p, k) {
    const sx = left + (w - left) * (p[0] - from) / Math.max(1e-9, to - from);
    const sy = bottom - (bottom - top) * (p[1] - low) / Math.max(1, high - low);
    if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
  });
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
  pen.restore();
}


// The acceptance probability alpha of each move (section 2 of
// connected-coloring-chain.js) against the move number: one dot per
// move, from 0 at the bottom to 1 at the top. The dashed line is the
// average alpha over the whole run, which is what the share of moves
// accepted (in the table) should be close to. Zoom and drag as on the
// boundary edges chart.
const alphaZoom = chartZoom(byId("alpha-chart"), drawAlphas);

function drawAlphas() {
  const canvas = byId("alpha-chart");
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (alphaTrace.length < 2) return;
  const [from, to] = shownTimes(alphaZoom, alphaTrace[0][0], alphaTrace[alphaTrace.length - 1][0]);

  const left = 40, top = 6, bottom = h - 16;
  alphaZoom.left = left;
  alphaZoom.right = w;
  const yOf = function (alpha) { return bottom - (bottom - top) * alpha; };
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText("1", left - 6, top);
  pen.fillText("0", left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText("moves " + Math.round(to).toLocaleString(), w, h);
  pen.textAlign = "left";
  pen.fillText(Math.round(from).toLocaleString(), left, h);

  pen.save();
  pen.beginPath();
  pen.rect(left, 0, w - left, bottom + 1);
  pen.clip();                                   // keep the dots off the numbers
  pen.fillStyle = CHART_LINE;
  pen.globalAlpha = 0.5;                        // see-through, so crowded dots show darker
  for (const p of alphaTrace) {
    if (p[0] < from || p[0] > to) continue;
    const sx = left + (w - left) * (p[0] - from) / Math.max(1e-9, to - from);
    pen.fillRect(sx - 1, yOf(p[1]) - 1, 2, 2);
  }
  pen.restore();

  // The average alpha, dashed, with its value written above it.
  const average = alphaSum / alphaCount;
  pen.strokeStyle = CHART_TEXT;
  pen.setLineDash([4, 3]);
  pen.beginPath();
  pen.moveTo(left, yOf(average));
  pen.lineTo(w, yOf(average));
  pen.stroke();
  pen.setLineDash([]);
  pen.textAlign = "right";
  pen.textBaseline = "bottom";
  pen.fillText("average " + average.toFixed(3), w, Math.max(top + 12, yOf(average) - 2));
}


/* =====================================================================
   7. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page): makeCustomTool, in
   js/sim-controls.js. This page checks the drawing live. Two steps:
     1. Draw the region. It must be one connected piece. Then either
        "Use automatic start" (N compact blocks, as for a box), or
        "Draw my own start".
     2. Color the region. The region is locked in the tool (cells
        outside it can't be painted). Every cell needs a color, and
        each color must be one connected piece; the colors you use
        become the N colors.
   ===================================================================== */
let toolStep = 1;          // the tool's step, 1 or 2

// Show step 1 or 2: its title, its help, and its buttons. (Check the
// drawing again afterwards, with tool.check().)
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
  const pieces = countPieces(customDomain, start.colorOf, start.used.length);
  const broken = [];
  pieces.forEach(function (count, c) {
    if (count > 1) broken.push("color " + start.used[c] + " is in " + count + " pieces");
  });
  if (broken.length > 0) return ["Each color must be one connected piece: " + broken.join(", ") + ".", ""];
  return ["", start.used.length + " colors, each one connected piece."];
}

// Step 2 -> "Done": start from your coloring, in the tool's colors. It
// carries on running only if it was running before the tool opened.
// Cancel: back to whatever was running before.
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return player.playing; },
  setPlaying: player.setPlaying,
  onOpen: function () { showStep(1); },
  buttons: ["use-auto", "draw-own", "tool-done"],
  check: checkDrawing,
  done: function (drawing) {
    const start = drawnColoring();
    const names = start.used.map(function (c) { return drawing.palette[c]; });
    useDomain("custom", customDomain, start.colorOf, names);
    tool.carryOn();
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
});

// Your drawn coloring of customDomain, read from the tool. The tool
// numbers colors by palette square (1, 2, ...); the chain wants
// 0 .. N-1, so the colors used are renumbered in order.
//   used[c] = the tool's number of color c;  colorOf[v] = c (or -1)
function drawnColoring() {
  const toolColor = new Map();
  for (const v of tool.drawing.graph.vertices) toolColor.set(v.id, v.color);
  const used = [...new Set(toolColor.values())].sort(function (a, b) { return a - b; });
  const colorOf = new Int32Array(customDomain.n);
  let uncolored = 0;
  customDomain.ids.forEach(function (id, v) {
    if (toolColor.has(id)) colorOf[v] = used.indexOf(toolColor.get(id));
    else { colorOf[v] = -1; uncolored++; }
  });
  return { used: used, colorOf: colorOf, uncolored: uncolored };
}

// Step 1 -> "Use automatic start": the region, with the automatic start.
// (It carries on running only if it was running before the tool opened.)
byId("use-auto").addEventListener("click", function () {
  customDomain = drawnDomain(tool.drawing.graph, tool.drawing.grid);
  tool.close();
  useDomain("custom", customDomain, null, null);
  tool.carryOn();
});

// Step 1 -> "Draw my own start": lock the region and go to step 2.
byId("draw-own").addEventListener("click", function () {
  customDomain = drawnDomain(tool.drawing.graph, tool.drawing.grid);
  tool.frame.contentWindow.postMessage({ type: "lock" }, "*");
  showStep(2);
  tool.check();
});

// Step 2 -> "Back to the region".
byId("tool-back").addEventListener("click", function () {
  tool.frame.contentWindow.postMessage({ type: "unlock" }, "*");
  showStep(1);
  tool.check();
});


/* =====================================================================
   8. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain and restart. "start" is your own coloring
// (with "names", its colors) or null for the automatic start.
function useDomain(kind, d, start, names) {
  domainKind = kind;
  domain = d;
  drawnStart = start;
  highlighted = -1;                       // a new domain starts with every color shown
  const most = Math.min(MAX_COLORS, domain.n);
  N = start ? names.length : Math.min(Math.max(N, 2), most);
  colorNames = start ? names : [];
  for (let c = colorNames.length; c < N; c++) colorNames.push(defaultColor(c, N));
  if (kind === "graph" && watching) setWatching(false);   // not on a hyperbolic tiling or tree (section 5c)
  byId("watch").disabled = kind === "graph";
  useTorus(view, Boolean(domain.wrap));   // moving and zooming; zooming out past the whole picture only on a torus (js/sim-view.js)
  byId("set-colors").max = byId("colors-slider").max = most;
  byId("set-colors").value = byId("colors-slider").value = N;
  showDomainChoice();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it, and carries on running if it was
// running before the tool opened.)
function useBox() {
  const toolWasOpen = tool.isOpen;
  if (toolWasOpen) tool.close();
  const d = boxFromOptions(2, MAX_SIDE, DEFAULTS);
  useDomain(d.wrap ? "torus" : "box", d, null, null);
  if (toolWasOpen) tool.carryOn();
}

// A ball of a hyperbolic tiling or a tree, from the options on the
// page (ballFromOptions, js/sim-hyperbolic.js), with the start cell in
// the middle of the picture.
function useGraph() {
  const toolWasOpen = tool.isOpen;
  if (toolWasOpen) tool.close();
  const ball = ballFromOptions(disk, BALL);
  if (ball === null) { showDomainChoice(); return; }
  useDomain("graph", ball, null, null);
  if (toolWasOpen) tool.carryOn();
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
}

function showStartInfo() {
  byId("start-info").textContent =
    startShape === "yours" ? "Starting from your own coloring. Changing N switches to the automatic start." :
    startShape === "rectangles" ? "Starting from a grid of " + N + " rectangles." :
    domainKind === "graph" ? "Starting from " + N + " compact blocks around spread-out cells." :
    "Starting from " + N + " compact blocks (this region can't be cut into a grid of rectangles " +
    "with each color in one piece).";
}

// Domain: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options, the Lattice options among them (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

// N: the slider and the number box move together, and the chain restarts
// live while you drag, like a Desmos slider.
function setColorCount(value) {
  N = Math.round(value) || 2;                  // useDomain keeps it from 2 to the most allowed
  useDomain(domainKind, domain, null, null);   // a new N always uses the automatic start
}
byId("colors-slider").addEventListener("input", function () { setColorCount(Number(this.value)); });
byId("set-colors").addEventListener("change", function () { setColorCount(Number(this.value)); });


// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
fillLatticeMenu();
byId("seed").value = DEFAULTS.seed;
useBox();
player.setPlaying(false);   // paused: press Play to start
