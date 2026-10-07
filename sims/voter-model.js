/* =====================================================================
   voter-model.js  —  the page of the "Generalized voter model" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Builds the domain: a box or torus of cells, a region drawn in
       the graph tool (shown inside this page), or a ball of a
       hyperbolic tiling or a tree. The domain code is shared with the
       other sims: the domains in js/sim-domains.js, their options and
       the graph tool in js/sim-controls.js, and the hyperbolic tilings
       and trees, and their pictures, in js/sim-hyperbolic.js.
     - Reads the typed rule g(x), Desmos style (js/formulas.js): every
       letter other than x gets a slider. It hands the worker a table of
       g at the only shares a cell can see, 0, 1/d, ..., 1.
     - Hands everything to the worker (voter-chain.js), which runs in a
       second thread (a "Web Worker"), and draws every coloring it sends
       back, with the statistics.
     - Changing g, its sliders or the noise changes the rule while it
       runs; the opinions carry on from where they are. Restart goes
       back to the start (same seed, same random numbers). Changing q,
       the domain, the start or the seed restarts.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. Reading the rule g, with sliders
     4. Running the opinions
     5. Drawing the opinions
     6. Moving and zooming
     7. Statistics
     8. Custom domains: the graph tool inside this page
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default domain, number of opinions, noise and seed.
const DEFAULTS = { width: 100, height: 100, neighbors: 4, q: 2, noise: 0, seed: "1" };

// The rules in the "Rule" menu: g(x) as typed, and the sliders it starts
// with. x is the share of a cell's neighbors holding an opinion.
const PRESETS = {
  voter:    { g: "x" },
  power:    { g: "x^a", sliders: { a: { value: 2, min: 0, max: 6, step: 0.1 } } },
  majority: { g: "x > 1/2 ? 1 : (x == 1/2 ? 1/2 : 0)" },
  anti:     { g: "1 - x" },
};

const MAX_Q = 12;                 // the most opinions
const MAX_SIDE = 400;             // the biggest box or torus
const MAX_PICTURE_HEIGHT = 600;   // in screen pixels
const BORDER = "#1e1e1e";         // the lines between opinions
const OUTSIDE = "#ecebe7";        // around a custom domain (cells not in it)
const SMALLEST_BORDERED_CELL = 4; // cells smaller than this (in pixels) get no border lines

// Hyperbolic plane or tree: the ball's default radius R, its largest
// R, and the most cells it may have (a ball of a hyperbolic tiling grows
// exponentially with R).
const BALL = { R: 6, most: 20, cells: 20000 };

// The speeds on the Speed slider, in units of time per second (in one
// unit, each cell's clock rings once on average). Infinity means "as
// fast as the computer can".
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_SPEED = SPEEDS.indexOf(5);


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let domainKind = "torus";      // "box", "torus", "custom" or "graph": the domain in use
let domain = null;             // the domain graph (js/sim-domains.js), or a ball (makeBall, js/sim-hyperbolic.js)
let customDomain = null;       // the last custom domain drawn, if any
let q = DEFAULTS.q;            // number of opinions
let noise = DEFAULTS.noise;    // eps: the chance of a uniformly random opinion
let rule = null;               // g as a compiled math.js formula
let sliders = {};              // the sliders' numbers, by letter: { value, min, max, step }
let colorNames = [];           // colorNames[c] = how opinion c is drawn, e.g. "#f2735a"
let colorRGB = [];             // the same as [red, green, blue], 0 .. 255

let playing = false;           // it starts paused; Play sets it going
let speedIndex = DEFAULT_SPEED;
let run = 0;                   // counts restarts, so leftovers from an older run are ignored
let latest = null;             // the latest message from the worker (section 2 of voter-chain.js)


/* =====================================================================
   3. READING THE RULE g, WITH SLIDERS
   ---------------------------------------------------------------------
   readTree (js/formulas.js) reads the typed g Desmos style; every
   letter other than x gets a slider. "a ? b : c" means "b if a is
   true, else c". The typeset preview comes from KaTeX.
   ===================================================================== */
function readRule() {
  let tree;
  try {
    const text = byId("formula-g").value.trim();
    if (text === "") throw new Error("it is empty.");
    tree = readTree(text);
  } catch (problem) {
    // Usually just a half-typed formula: keep the last good rule.
    byId("formula-message").textContent = "Can't read g yet: " + problem.message;
    return false;
  }
  if (window.katex) {
    katex.render("g(x) = " + tree.toTex({ parenthesis: "keep", implicit: "hide" }), byId("preview-g"), { throwOnError: false });
  }
  const holder = byId("sliders");
  holder.innerHTML = "";
  for (const letter of sliderLetters(tree)) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], sendParams));
  }
  rule = tree.compile();
  return true;
}

// The table of g at every share a cell of this domain can see
// (makeTable in voter-chain.js), with the sliders' current values.
function currentTable() {
  let maxDegree = 1;
  for (let v = 0; v < domain.n; v++) maxDegree = Math.max(maxDegree, domain.first[v + 1] - domain.first[v]);
  const scope = {};
  for (const letter in sliders) scope[letter] = sliders[letter].value;
  let failed = "";
  const table = makeTable(function (x) {
    scope.x = x;
    try { return rule.evaluate(scope); } catch (problem) { failed = problem.message; return NaN; }
  }, maxDegree);
  byId("formula-message").textContent = failed ? "Can't work out g: " + failed : table.problem;
  return table;
}

// Fill in a preset's g and sliders.
function usePreset(key) {
  const p = PRESETS[key];
  byId("formula-g").value = p.g;
  for (const letter in p.sliders || {}) sliders[letter] = Object.assign({}, p.sliders[letter]);
  if (readRule()) sendParams();
}


/* =====================================================================
   4. RUNNING THE OPINIONS
   ---------------------------------------------------------------------
   The opinions are voterWorker() in voter-chain.js, with newVoter and
   voterStart copied in. startWorker (js/sim-page.js) runs it in a
   second thread, so the page never freezes.
   ===================================================================== */
const worker = startWorker(voterWorker, [newVoter, voterStart]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  latest = message;
  if (message.frozen && playing) setPlaying(false);
  drawSoon();
};

worker.onerror = function () {
  showMessage("The sim couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// Start again from the start, with the current settings and seed.
function restart() {
  if (!domain || !rule) return;
  run++;
  latest = null;
  showMessage("");
  worker.postMessage({
    type: "setup", run: run, n: domain.n, first: domain.first, nbr: domain.nbr, x: domain.x,
    q: q, table: currentTable(), noise: noise, start: byId("start").value, seed: byId("seed").value,
  });
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
}

// A new g, slider value or noise: the opinions carry on with them.
function sendParams() {
  if (!domain || !rule || !latest) return;
  worker.postMessage({ type: "params", table: currentTable(), noise: noise });
}

function setPlaying(on) {
  playing = on;
  worker.postMessage(on ? { type: "play", speed: SPEEDS[speedIndex] } : { type: "pause" });
  showPlaying(on);
}


/* =====================================================================
   5. DRAWING THE OPINIONS
   ---------------------------------------------------------------------
   One square per cell in its opinion's color, and a dark line where
   two opinions meet when the cells are big enough to see. The view
   (js/sim-view.js) says where the picture goes and which squares show,
   and paints them (paintCells).
   On a hyperbolic tiling or tree, each cell is drawn in its opinion's
   color in the disk, the half-plane or (a tree) spread out in rings
   (drawBall, js/sim-hyperbolic.js).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawColoring(); showStats(); });

const view = makeView(simCanvas, drawSoon, 0, SMALLEST_BORDERED_CELL);

// Hyperbolic plane or tree: which graph, how it is drawn, and how far
// the plane has been moved (js/sim-hyperbolic.js). The view above zooms
// and slides its pictures too.
const disk = makeDiskView(simCanvas, view, showDomainChoice);
const outsideRGB = hexToRGB(OUTSIDE);

function drawColoring() {
  if (!domain || !latest || simCanvas.hidden) return;
  const colors = latest.colors;
  if (domainKind === "graph") {
    drawBall(disk, domain, function (v) { return colorNames[colors[v]]; });
    return;
  }
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  const shown = paintCells(view, pen, domain,
    function (v) { return colors[v]; }, function (k) { return colorRGB[k]; }, outsideRGB);
  if (view.cell >= SMALLEST_BORDERED_CELL) drawBorders(view, pen, shown, BORDER);
  pen.restore();
}

window.addEventListener("resize", drawSoon);


/* =====================================================================
   6. MOVING AND ZOOMING
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-controls.js). On a torus it also
   zooms out, showing the torus several times side by side.
   On a hyperbolic tiling or tree, one pointer drags across the plane
   instead, and two fingers slide and zoom the picture.
   ===================================================================== */
connectPicture(view, disk, function () { return domainKind === "graph"; });


/* =====================================================================
   7. STATISTICS
   ---------------------------------------------------------------------
   The counts and the agreeing pairs come from the worker. The
   "domains" (connected pieces of one opinion) are counted here
   (countPieces, js/sim-domains.js).
   ===================================================================== */
function showStats() {
  if (!domain || !latest) return;
  const s = latest, n = domain.n;
  byId("stat-cells").textContent = n.toLocaleString();
  byId("stat-time").textContent = s.time.toLocaleString();
  byId("stat-disagree").textContent = (s.pairs - s.agree).toLocaleString() + " of " + s.pairs.toLocaleString() +
    " (" + (100 * (1 - s.agree / Math.max(s.pairs, 1))).toFixed(2) + "%)";
  byId("stat-alive").textContent = Array.from(s.counts).filter(function (c) { return c > 0; }).length + " of " + q;
  const domains = countPieces(domain, s.colors, q).reduce(function (a, b) { return a + b; }, 0);
  byId("stat-domains").textContent = domains.toLocaleString();
  byId("stat-consensus").textContent = s.consensusTime === null ? "not yet" : "at time " + s.consensusTime.toLocaleString();
  showMessage(s.frozen ? "Consensus: one opinion everywhere, and with this rule nothing can change it." : "");

  let rows = "";
  for (let c = 0; c < q; c++) {
    rows += '<tr><td><span class="swatch-small" style="background:' + colorNames[c] + '"></span>' + (c + 1) +
      '</td><td>' + s.counts[c].toLocaleString() + '</td><td>' + (100 * s.counts[c] / n).toFixed(1) + '%</td></tr>';
  }
  byId("color-rows").innerHTML = rows;

  const lines = [];
  for (let c = 0; c < q; c++) {
    const values = [];
    for (let j = 0; j < s.traceTimes.length; j++) values.push(s.traceCounts[j * q + c] / n);
    lines.push({ color: colorNames[c], values: values });
  }
  plotOverTime(byId("shares-chart"), s.traceTimes, lines, "time");
  plotOverTime(byId("disagree-chart"), s.traceTimes, [{ color: CHART_LINE, values: Array.from(s.traceDisagree) }], "time");
}


/* =====================================================================
   8. CUSTOM DOMAINS: THE GRAPH TOOL INSIDE THIS PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page): makeCustomTool, in
   js/sim-controls.js. Any drawing works, even one in several pieces.
   Done uses it.
   ===================================================================== */
const tool = makeCustomTool({
  view: view,
  isPlaying: function () { return playing; },
  setPlaying: setPlaying,
  check: function (drawing) {
    const cells = drawing.graph.vertices.length;
    return cells < 2 ? ["Paint at least two cells.", ""] : ["", cells + " cells."];
  },
  done: function (drawing) {
    customDomain = drawnDomain(drawing.graph, drawing.grid);
    useDomain("custom", customDomain);
  },
  cancel: function () { showDomainChoice(); drawSoon(); },
});


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// Switch to a new domain, and restart.
function useDomain(kind, d) {
  domainKind = kind;
  domain = d;
  useTorus(view, Boolean(d.wrap));   // moving and zooming (js/sim-view.js)
  showDomainChoice();
  restart();
}

// The box or torus from the boxes on the page. (Choosing one while the
// graph tool is open closes it.)
function useBox() {
  if (tool.isOpen) tool.close();
  const d = boxFromOptions(2, MAX_SIDE, DEFAULTS);
  useDomain(d.wrap ? "torus" : "box", d);
}

// A ball of a hyperbolic tiling or a tree, from the options on the page
// (ballFromOptions, js/sim-hyperbolic.js), with the start cell in the
// middle of the picture. The "Stripes" start needs a number x for each cell: here
// it is the direction of the cell's middle from the start, in
// thousandths of a turn, so the stripes are slices around the start.
function useGraph() {
  if (tool.isOpen) tool.close();
  const ball = ballFromOptions(disk, BALL);
  if (ball === null) { showDomainChoice(); return; }
  ball.x = new Int32Array(ball.n);
  for (let v = 0; v < ball.n; v++) {
    const [mx, my] = motionApply(ballPlace(ball, v), 0, 0);    // the middle of cell v, in the disk
    const turns = Math.atan2(my, mx) / (2 * Math.PI);          // between -1/2 and 1/2
    ball.x[v] = Math.floor(1000 * (turns + 0.5)) % 1000;
  }
  useDomain("graph", ball);
}

// Show the options that fit the domain in use, and tick its radio button.
function showDomainChoice() {
  showDomainOptions(domainKind, customDomain, disk);
}

// q opinions, each drawn in the old site's colors. Restarts.
function setQ(value) {
  q = Math.min(Math.max(Math.round(value) || 2, 2), MAX_Q);
  byId("q-box").value = byId("q-slider").value = q;
  colorNames = [];
  for (let c = 0; c < q; c++) colorNames.push(defaultColor(c, q));
  colorRGB = colorNames.map(hexToRGB);
  restart();
}

// The noise: the slider and the box move together, live.
function setNoise(value) {
  noise = Math.min(Math.max(Number(value) || 0, 0), 1);
  byId("noise-slider").value = noise;
  byId("noise-box").value = Number(noise.toFixed(4));
  sendParams();
}

byId("q-slider").addEventListener("input", function () { setQ(this.value); });
byId("q-box").addEventListener("change", function () { setQ(this.value); });
byId("noise-slider").addEventListener("input", function () { setNoise(this.value); });
byId("noise-box").addEventListener("change", function () { setNoise(this.value); });
byId("start").addEventListener("change", restart);

// The rule: a preset, or g typed by hand (then the menu says "your own").
byId("preset").addEventListener("change", function () { usePreset(byId("preset").value); });
byId("formula-g").addEventListener("input", function () {
  byId("preset").value = "custom";
  if (readRule()) sendParams();
});

// Domain: Box / Torus / Custom / Hyperbolic plane or tree, and their
// options (js/sim-controls.js).
connectDomainChoice({ box: useBox, torus: useBox, custom: tool.open, graph: useGraph });

// Play / Pause, Step, Restart.
byId("play").addEventListener("click", function () { setPlaying(!playing); });
byId("step").addEventListener("click", function () {
  if (playing) setPlaying(false);
  worker.postMessage({ type: "step" });
});
byId("restart").addEventListener("click", restart);

// Speed.
function showSpeed() { byId("speed-label").textContent = speedText(SPEEDS[speedIndex], "unit of time", "units of time"); }
byId("speed").addEventListener("input", function () {
  speedIndex = Number(this.value);
  showSpeed();
  if (playing) worker.postMessage({ type: "play", speed: SPEEDS[speedIndex] });
});

// Seed: the same seed gives the same run every time.
connectSeed(restart);


// --- Start ------------------------------------------------------------
fillDomainOptions(DEFAULTS, MAX_SIDE, BALL);
byId("q-box").max = byId("q-slider").max = MAX_Q;
byId("noise-slider").value = byId("noise-box").value = noise;
byId("seed").value = DEFAULTS.seed;
byId("speed").max = SPEEDS.length - 1;
byId("speed").value = speedIndex;
showSpeed();
byId("preset").value = "voter";
byId("formula-g").value = PRESETS.voter.g;
readRule();
domain = boxDomain(DEFAULTS.width, DEFAULTS.height, DEFAULTS.neighbors, true);
useTorus(view, true);
showDomainChoice();
setQ(DEFAULTS.q);    // sets the colors and starts the first run
setPlaying(false);   // paused: press Play
