/* =====================================================================
   cellular-automata.js  —  the page of the "Cellular automata" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Reads the settings: 1D or 2D, the number of states b, the
       neighborhood (from the clickable grid of cells, shared with the
       Eden Growth: showOffsetGrid in js/sim-controls.js), the rule
       number n, the edges, the size and the start.
     - Turns n into the rule's table (ruleTable, in
       cellular-automata-rule.js) and hands everything to the rule,
       which runs in a second thread (a "Web Worker").
     - Draws what it sends back: in 1D the tape over time (each row one
       step, the first at the top), in 2D the grid. A click on a cell
       changes its state, and the run starts again from there.
     - Shows the statistics: the clusters (connected pieces of one
       state), their areas and perimeters, and the interface, as in the
       coloring sims.
     - Changing the rule, b, the neighborhood, the edges or the seed
       makes the run again up to the same step, so the picture changes
       at once, like a Desmos slider. Restart goes back to step 0.

   The file is split into numbered sections:
     1. Settings you might want to change
     2. What the page remembers (the "state")
     3. The neighborhood: the clickable grid and presets
     4. The rule number
     5. Running the automaton
     6. Drawing
     7. Moving, zooming and clicking the picture
     8. Statistics
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The default sizes: a tape 201 cells long with 100 rows shown (rule 30
// from one cell just fills it), and a 100 x 100 grid. And the seed.
const DEFAULTS = { length: 201, rows: 100, width: 100, height: 100, seed: "1" };
const MAX_B = 12;                  // the most states
const MAX_LENGTH = 801;            // the longest tape
const MAX_ROWS = 400;              // the most rows shown
const MAX_SIDE = 300;              // the biggest grid
const MAX_TABLE = 1 << 20;         // the most configurations b^k a rule may have (about a million)
const MAX_PICTURE_HEIGHT = 600;    // in screen pixels
const SLIDER_STOPS = 1000;         // the rule slider's last stop: with more rules than this, its stops are spread evenly over them

// The clickable neighborhood grid shows the offsets up to this far from
// the cell itself: -5 .. 5 in 1D, a 5 x 5 square in 2D.
const GRID_REACH = { 1: 5, 2: 2 };

// The neighborhood presets. Each one is a list of offsets: [x] in 1D,
// [x, y] in 2D (y up). The first one of each list is the default.
const NEIGHBORHOODS = {
  1: [
    { name: "{−1, 0, +1}", offsets: [[-1], [0], [1]] },
    { name: "{−2, …, +2}", offsets: [[-2], [-1], [0], [1], [2]] },
    { name: "{−1, +1}", offsets: [[-1], [1]] },
  ],
  2: [
    { name: "8 around + itself", offsets: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] },
    { name: "4 around + itself", offsets: [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]] },
    { name: "8 around", offsets: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] },
    { name: "4 around", offsets: [[0, -1], [-1, 0], [1, 0], [0, 1]] },
  ],
};

// The colors of the states: 0 white and 1 black (as in Wolfram's
// pictures), then the old site's colors (defaultColor, js/sim-colors.js).
// EMPTY is where the 1D picture has no row yet. In the charts, state 0
// is drawn in CHART_ZERO instead of white, so its line shows.
const EMPTY = "#e4e2dc";
const CHART_ZERO = "#b8b5ad";
const BORDER = "#1e1e1e";          // around the dots of the perimeter chart

// The speeds on the Speed slider, in steps per second. Infinity means
// "as fast as the computer can". The default is slow, so you can watch.
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
const DEFAULT_SPEED = 10;


/* =====================================================================
   2. WHAT THE PAGE REMEMBERS (the "state")
   ===================================================================== */

let dim = 1;                 // 1 (a tape) or 2 (a grid)
let b = 2;                   // the number of states, 0 .. b-1
let neighborhood = [];       // the offsets, in the order the rule reads them (orderNeighborhood)
let ruleNumber = 30n;        // n, a BigInt (a whole number with as many digits as it needs)
let table = null;            // the rule's table, from ruleTable; null when the settings can't run
let drawn = null;            // the start you drew by clicking cells, if any
let colorNames = [];         // colorNames[s] = how state s is drawn, e.g. "#ffffff"
let colorRGB = [];           // the same as [red, green, blue], 0 .. 255
let domain = null;           // the picture as a domain of cells (js/sim-domains.js), for drawing and the clusters

let run = 0;                 // counts restarts, so leftovers from an older run are ignored
let latest = null;           // the latest message from the worker (part 2 of cellular-automata-rule.js)
let look = null;             // 1D: the last step shown when scrolled back, or null for the newest


/* =====================================================================
   3. THE NEIGHBORHOOD: THE CLICKABLE GRID AND PRESETS
   ---------------------------------------------------------------------
   As on Eden Growth: a grid of cells around the cell itself
   (outlined, in the middle; here it can be in the neighborhood too).
   Clicking a cell puts it in the neighborhood or takes it out. Every
   change makes the run again up to the same step.
   ===================================================================== */

// Use these offsets as the neighborhood (in the rule's order), and show
// them. Doesn't restart: the caller does.
function setNeighborhood(offsets) {
  const seen = new Set();
  neighborhood = orderNeighborhood(offsets.filter(function (t) {
    const key = offsetKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
  showOffsetGrid(byId("neighborhood-grid"), dim, GRID_REACH[dim], neighborhood, function (list) {
    setNeighborhood(list);
    readRule();
    restart(true);
  }, "clickable");
  byId("neighborhood-info").innerHTML = neighborhood.length === 0 ? "" :
    tex("k = " + neighborhood.length) + (neighborhood.length === 1 ? " cell" : " cells") +
    ", read in this order (the first one is the most significant digit): " +
    neighborhood.map(function (t) { return offsetKey(t) === "0" || offsetKey(t) === "0,0" ? "itself" : tex(offsetText(t)); }).join(", ") + ".";
}

// The preset buttons for this dimension.
function showNeighborhoodPresets() {
  const row = byId("neighborhood-presets");
  row.innerHTML = "";
  for (const preset of NEIGHBORHOODS[dim]) {
    const button = document.createElement("button");
    button.className = "tool-button";
    button.textContent = preset.name;
    button.addEventListener("click", function () {
      setNeighborhood(preset.offsets);
      readRule();
      restart(true);
    });
    row.appendChild(button);
  }
}


/* =====================================================================
   4. THE RULE NUMBER
   ---------------------------------------------------------------------
   n is typed in a text box (it can have hundreds of digits) and kept
   as a BigInt. readRule turns it into the rule's table for the current
   b and neighborhood, and says how big n may be.
   ===================================================================== */

// A formula as typeset math, ready to put in a page's HTML (KaTeX), or
// as plain text if KaTeX didn't load.
function tex(formula) {
  return window.katex ? katex.renderToString(formula, { throwOnError: false }) : formula;
}

// A whole number for a formula, with its thousands commas kept tight
// ("{,}" in KaTeX, which otherwise puts a space after each comma).
function texNumber(v) { return v.toLocaleString("en-US").replace(/,/g, "{,}"); }

// How many rules there are now, b^(b^k), as a BigInt (or 0n if the
// settings can't run).
function ruleCount() {
  return table ? BigInt(b) ** BigInt(table.length) : 0n;
}

// Read n from the box and make the table. Returns false (and says why
// under the box) if the settings can't run; the last good run stays.
function readRule() {
  const info = byId("rule-info");
  const text = byId("rule-box").value.replace(/[\s,]/g, "");   // spaces, line breaks and commas don't count
  table = null;
  if (!/^\d+$/.test(text)) {
    info.textContent = "n has to be a whole number, 0 or more.";
    return false;
  }
  ruleNumber = BigInt(text);
  const k = neighborhood.length;
  if (k === 0) {
    info.textContent = "Pick at least one cell for the neighborhood.";
    return false;
  }
  const size = b ** k;      // the number of configurations
  if (size > MAX_TABLE) {
    info.innerHTML = "With " + tex("b = " + b) + " and " + tex("k = " + k) + " cells there are " +
      tex("b^k = " + texNumber(size)) + " configurations, more than the " + tex(texNumber(MAX_TABLE)) +
      " this page allows. Take out some cells, or lower " + tex("b") + ".";
    return false;
  }
  table = ruleTable(ruleNumber, b, k);
  const digits = Math.ceil(size * Math.log10(b));   // how many digits the biggest rule number has
  let html = tex("b^k = " + b + "^{" + k + "} = " + texNumber(size)) + " configurations, so the rules are " +
    tex("0 \\le n \\le " + b + "^{" + size + "} - 1") + " (" + digits.toLocaleString() + (digits === 1 ? " digit)." : " digits).");
  if (ruleNumber >= ruleCount()) {
    html += " This " + tex("n") + " is bigger, so only its last " + size.toLocaleString() + " digits in base " + b +
      " count: it works as " + tex("n \\bmod " + b + "^{" + size + "}") + ".";
  }
  info.innerHTML = html;
  showSliderAt(ruleNumber);
  return true;
}

// Put the rule number n (a BigInt) in the box.
function showRule(n) {
  byId("rule-box").value = n.toString();
}

// The rule slider. With at most SLIDER_STOPS + 1 rules, stop p is rule p;
// with more, its stops are spread evenly from 0 to the last rule, so
// stop p is rule floor(p (N - 1) / SLIDER_STOPS), N the number of rules.
function sliderRule(p) {
  const N = ruleCount();
  if (N <= BigInt(SLIDER_STOPS + 1)) return BigInt(p);
  return BigInt(p) * (N - 1n) / BigInt(SLIDER_STOPS);
}

// Move the slider to (the stop nearest below) rule n.
function showSliderAt(n) {
  const N = ruleCount(), slider = byId("rule-slider");
  if (N <= BigInt(SLIDER_STOPS + 1)) {
    slider.max = Number(N - 1n);
    slider.value = Number(n < N ? n : n % N);
  } else {
    slider.max = SLIDER_STOPS;
    slider.value = Number((n % N) * BigInt(SLIDER_STOPS) / (N - 1n));
  }
}

// A uniformly random rule: each of its b^k digits in base b is an
// independent uniform digit, so every rule 0 .. N - 1 is equally
// likely.
function randomRule() {
  let n = 0n;
  for (let C = 0; C < table.length; C++) n = n * BigInt(b) + BigInt(Math.floor(Math.random() * b));
  return n;
}


/* =====================================================================
   5. RUNNING THE AUTOMATON
   ---------------------------------------------------------------------
   The rule is automatonWorker() in cellular-automata-rule.js, with
   newAutomaton, automatonStart, stateHash, and the run loop and the
   trace (js/sim-worker.js) copied in. startWorker (js/sim-page.js)
   runs it in a second thread, so the page never freezes.
   ===================================================================== */
const worker = startWorker(automatonWorker, [newAutomaton, automatonStart, stateHash, makeRunLoop, newTrace, keepSample]);

worker.onmessage = function (event) {
  const message = event.data;
  if (message.type !== "state" || message.run !== run) return;   // from an older run
  latest = message;
  showHistory();
  if (message.done && player.playing) player.setPlaying(false);
  drawSoon();
};

worker.onerror = function () {
  showMessage("The sim couldn't start. It loads one small library (seedrandom) from the " +
              "internet, so check the connection and reload the page.");
};

// The size of the tape or grid, and in 1D the rows shown.
function sizes() {
  if (dim === 1) {
    return { width: readWhole("tape-length", 3, MAX_LENGTH, DEFAULTS.length), height: 1,
             rows: readWhole("tape-rows", 3, MAX_ROWS, DEFAULTS.rows) };
  }
  return { width: readWhole("grid-width", 3, MAX_SIDE, DEFAULTS.width),
           height: readWhole("grid-height", 3, MAX_SIDE, DEFAULTS.height), rows: 0 };
}

// Start the run again with the current settings and seed. With
// "keepStep", it is made again up to the step it was at, so a changed
// rule shows the same moment of the run; without, from step 0.
function restart(keepStep) {
  if (!table) return;        // the settings can't run (readRule said why)
  const toStep = keepStep && latest ? latest.time : 0;
  if (!keepStep) look = null;
  const size = sizes();
  run++;
  latest = null;
  showMessage("");
  worker.postMessage({
    type: "setup", run: run, dim: dim, width: size.width, height: size.height, rows: size.rows,
    b: b, offsets: neighborhood, table: table, edge: checked("edge"),
    edgeState: readWhole("edge-state", 0, b - 1, 0), start: byId("start").value, drawn: drawn,
    seed: byId("seed").value, mode: checked("mode"), toStep: toStep, look: look,
  });
  player.carryOn();
}

// Play / Pause, Step, Restart and the Speed slider (connectPlay,
// js/sim-page.js). player.playing is true while the sim plays.
const player = connectPlay(worker, SPEEDS, DEFAULT_SPEED, "step", "steps", function () { restart(false); });


/* =====================================================================
   6. DRAWING
   ---------------------------------------------------------------------
   One square per cell in its state's color. The picture is a domain of
   cells (boxDomain, js/sim-domains.js): in 1D the rectangle of the tape
   over time (rows shown x tape length), in 2D the grid. The view
   (js/sim-view.js) says where it goes and which squares show, and
   paints them (paintCells).
   ===================================================================== */
const simCanvas = byId("sim-canvas");

// Draw at the browser's next screen refresh (at most once per refresh,
// however many messages arrive in between).
const drawSoon = oncePerFrame(function () { drawPicture(); showStats(); });

const view = makeView(simCanvas, drawSoon, 0, 4);
const emptyRGB = hexToRGB(EMPTY);

// The state of each square of the picture: in 1D the tape over time
// (-1 where there is no row yet), in 2D the grid.
function pictureColors() { return dim === 1 ? latest.picture : latest.cells; }

function drawPicture() {
  if (!latest) return;
  const colors = pictureColors();
  const pen = fitPicture(view, domain, MAX_PICTURE_HEIGHT);
  paintCells(view, pen, domain, function (v) { return colors[v]; },
    function (s) { return s < 0 ? emptyRGB : colorRGB[s]; }, emptyRGB);
  pen.restore();
  placeHistoryBar();
}

window.addEventListener("resize", drawSoon);


// 1D, scroll mode: the scroll bar on the right of the picture, shown
// once the run has more rows than the picture. Its tall inner box stands
// for every row kept, the bar's own height for the rows shown, so how
// far it is scrolled says which rows show. At the bottom, the picture
// follows the newest rows.
const historyBar = byId("history-bar");
let settingBar = false;      // true while the page itself moves the bar (so that isn't taken as you scrolling)

// The rows kept and shown now: kept from step "oldest" to "time", and
// the picture's "rows".
function historyRows() {
  const s = latest, rows = Number(byId("tape-rows").value);
  return { oldest: s.oldest, newest: s.time, rows: rows, longer: dim === 1 && Boolean(s.picture) && s.time - s.oldest + 1 > rows };
}

function showHistory() {
  const h = historyRows(), s = latest;
  const changed = historyBar.hidden === h.longer;
  historyBar.hidden = byId("history-label").hidden = !h.longer;
  simCanvas.parentElement.classList.toggle("with-history", h.longer);
  if (changed) window.dispatchEvent(new Event("resize"));   // the picture makes room for the bar, or takes it back
  if (!h.longer) return;
  byId("history-label").textContent = (look === null ? "Showing the newest steps, " : "Showing steps ") +
    s.shownFirst.toLocaleString() + " to " + s.shownLast.toLocaleString() + " of " + s.time.toLocaleString() +
    (s.oldest > 0 ? " (steps before " + s.oldest.toLocaleString() + " were dropped)" : "") +
    ". Scroll, drag the picture, or use the bar on the right to go back.";
  placeHistoryBar();
}

// Size the bar to the picture and scroll it to the rows shown.
function placeHistoryBar() {
  if (historyBar.hidden || !latest) return;
  const h = historyRows(), height = view.height;
  historyBar.style.top = view.top + "px";
  historyBar.style.height = height + "px";
  const total = h.newest - h.oldest + 1;
  byId("history-length").style.height = Math.round(height * total / h.rows) + "px";
  const room = historyBar.scrollHeight - historyBar.clientHeight;      // how far the bar can scroll, in pixels
  const target = Math.round(room * (latest.shownFirst - h.oldest) / Math.max(1, total - h.rows));
  if (Math.abs(historyBar.scrollTop - target) > 1) {
    settingBar = true;
    historyBar.scrollTop = target;
  }
}

historyBar.addEventListener("scroll", function () {
  if (settingBar) { settingBar = false; return; }
  const h = historyRows(), room = historyBar.scrollHeight - historyBar.clientHeight;
  if (room <= 0) return;
  const first = h.oldest + Math.round(historyBar.scrollTop / room * (h.newest - h.oldest + 1 - h.rows));
  lookAt(first + h.rows - 1);
});

// Look at the rows up to step "last" (null, or the newest step, follows
// the newest rows).
function lookAt(last) {
  const h = historyRows();
  look = last === null || last >= h.newest ? null : Math.max(last, h.oldest + h.rows - 1);
  worker.postMessage({ type: "look", last: look });
}

// The mouse wheel over the picture scrolls through the history too,
// while the whole picture shows (not zoomed in). Ctrl + wheel, or a
// pinch on a trackpad, still zooms. This listens on the picture's box
// before the picture itself hears the wheel ("capture"), so it can
// keep the wheel from zooming.
simCanvas.parentElement.addEventListener("wheel", function (event) {
  if (event.target !== simCanvas || historyBar.hidden || view.zoom !== 1 || event.ctrlKey) return;
  event.preventDefault();
  event.stopPropagation();
  historyBar.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
}, { capture: true, passive: false });

// Dragging the picture up or down (mouse or finger) scrolls through the
// history too, while the whole picture shows (zoomed in, a drag moves
// the picture as usual): pulling it down shows earlier rows, one row
// per cell height dragged.
let dragFrom = null;     // where the drag started: the pointer's y, and the last step shown then
simCanvas.addEventListener("pointerdown", function (event) {
  dragFrom = (!historyBar.hidden && view.zoom === 1 && latest) ? { y: event.clientY, last: latest.shownLast } : null;
});
simCanvas.addEventListener("pointermove", function (event) {
  if (!dragFrom) return;
  const rows = Math.round((event.clientY - dragFrom.y) / view.cell);
  if (rows !== 0) lookAt(dragFrom.last - rows);
});
for (const type of ["pointerup", "pointercancel"]) {
  simCanvas.addEventListener(type, function () { dragFrom = null; });
}

// The picture's domain, for the current size, edges and the clusters'
// neighbors. In 2D with wrapping edges it is a torus (so clusters join
// across the edges, and the picture zooms out to show it several times).
// The 1D picture is never joined at its sides: its rows are steps, not
// a ring.
function makePictureDomain() {
  const size = sizes(), links = Number(byId("links").value);
  domain = dim === 1 ? boxDomain(size.width, size.rows, links, false)
                     : boxDomain(size.width, size.height, links, checked("edge") === "wrap");
}

// A new picture shape (dimension, size or edges): a new domain, seen
// whole (useTorus, js/sim-view.js).
function newPicture() {
  makePictureDomain();
  useTorus(view, Boolean(domain.wrap));
}

// The colors of b states.
function setColors() {
  colorNames = ["#ffffff", "#000000"];
  for (let s = 2; s < b; s++) colorNames.push(defaultColor(s - 2, b - 2));
  colorNames.length = b;
  colorRGB = colorNames.map(hexToRGB);
}


/* =====================================================================
   7. MOVING, ZOOMING AND CLICKING THE PICTURE
   ---------------------------------------------------------------------
   Drag to move, mouse wheel or pinch to zoom, and the + / − / Reset
   buttons (connectPicture, js/sim-controls.js). A click on a cell
   changes its state to the next one (b - 1 goes back to 0), and the run
   starts again from there, as "Your drawing". In 1D the click changes
   that column of the newest row (the tape as it is now).
   ===================================================================== */
connectPicture(view, null, function () { return false; }, clickCell, "pointer");

function clickCell(event) {
  if (!latest) return;
  const v = cellUnder(view, domain, pointerSpot(view, event));
  if (v < 0) return;
  const cells = latest.cells.slice();
  const i = dim === 1 ? v % cells.length : v;
  cells[i] = (cells[i] + 1) % b;
  drawn = cells;
  byId("drawn-option").hidden = false;
  byId("start").value = "drawn";
  restart(false);
}

// A drawing only fits the size, dimension and b it was drawn for: when
// one of them changes, it is forgotten, and the start goes back to the
// default one.
function forgetDrawing() {
  drawn = null;
  byId("drawn-option").hidden = true;
  if (byId("start").value === "drawn") byId("start").value = dim === 1 ? "one" : "random";
}

function showClickHelp() {
  byId("click-help").textContent = dim === 1
    ? "Click a cell to change that cell of the tape as it is now; the run starts again from there."
    : "Click a cell to change its state; the run starts again from there.";
}


/* =====================================================================
   8. STATISTICS
   ---------------------------------------------------------------------
   The cells in each state and the interface (neighbor pairs in
   different states) come from the worker, at every step, for the
   charts over time. The clusters (connected pieces of one state), with
   each one's area and perimeter, are found here each time the picture
   is drawn, by findRegions (js/sim-domains.js), through 4 or 8
   neighbors. In 1D the counts and the interface are of the tape as it
   is now, and the clusters are of the whole picture.
   ===================================================================== */
function showStats() {
  if (!latest) return;
  const s = latest, eight = byId("links").value === "8";
  const regions = findRegions(domain, pictureColors());
  const cells = s.cells.length;

  byId("stat-cells").textContent = dim === 1
    ? cells.toLocaleString() + " on the tape (the picture: " + domain.n.toLocaleString() + ")"
    : cells.toLocaleString();
  byId("stat-step").textContent = s.time.toLocaleString();
  byId("stat-repeat").textContent = s.randomEdges ? "never: the edges are random"
    : s.repeat ? (s.repeat.period === 1 ? "stays the same from step " + s.repeat.first.toLocaleString() + " on"
                 : "every " + s.repeat.period.toLocaleString() + " steps, from step " + s.repeat.first.toLocaleString() + " on")
    : s.checked >= 200000 ? "not in the first 200,000 steps" : "not yet";
  byId("stat-interface-name").textContent = "Interface" + (dim === 1 ? " on the tape" : "") +
    " (neighbor pairs in different states)";
  byId("stat-interface").textContent = (eight ? s.interface8 : s.interface4).toLocaleString();
  byId("stat-clusters-name").textContent = dim === 1 ? "Clusters in the picture" : "Clusters";
  byId("stat-clusters").textContent = regions.areas.length.toLocaleString();
  byId("stat-largest").textContent = regions.areas.length ? Math.max(...regions.areas).toLocaleString() + " cells" : "";
  if (s.done) showMessage("The picture is full. Press Restart, or pick \"scroll\" to keep going.");

  // One row per state: cells (now), share, clusters (in the picture).
  const clusters = new Array(b).fill(0);
  for (const c of regions.color) clusters[c]++;
  let rows = "";
  for (let c = 0; c < b; c++) {
    rows += '<tr><td><span class="swatch-small" style="background:' + colorNames[c] + '; border: 1px solid ' + CHART_ZERO + '"></span>' + c +
      '</td><td>' + s.counts[c].toLocaleString() + '</td><td>' + (100 * s.counts[c] / cells).toFixed(1) +
      '%</td><td>' + clusters[c].toLocaleString() + '</td></tr>';
  }
  byId("state-rows").innerHTML = rows;

  // The share of each state over time, and the interface.
  const onTape = dim === 1 ? " on the tape" : "";
  byId("shares-heading").textContent = "Share of each state" + onTape + ", over time";
  byId("interface-heading").textContent = "Interface" + onTape + ", over time";
  byId("areas-heading").textContent = "How many clusters of each size" + (dim === 1 ? " in the picture" : "") +
    " (sizes grouped 1, 2-3, 4-7, ...)";
  const lines = [];
  for (let c = 0; c < b; c++) {
    const values = [];
    for (let j = 0; j < s.traceTimes.length; j++) values.push(s.traceCounts[j * b + c] / cells);
    lines.push({ color: c === 0 ? CHART_ZERO : colorNames[c], values: values });
  }
  plotOverTime(byId("shares-chart"), s.traceTimes, lines, "step");
  plotOverTime(byId("interface-chart"), s.traceTimes,
    [{ color: CHART_LINE, values: Array.from(eight ? s.traceInterface8 : s.traceInterface4) }], "step");

  // The clusters' areas (powerOfTwoBars, js/sim-charts.js), and
  // perimeter against area (perimeterChart).
  powerOfTwoBars(byId("areas-chart"), powerOfTwoBins(regions.areas), " clusters", function (k) { return String(2 ** k); });
  perimeterChart(byId("perimeter-chart"), regions, colorNames, BORDER);
}


/* =====================================================================
   9. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

// The two presets, which are also each dimension's default: rule 30 in
// 1D (from one cell), and Conway's Game of Life in 2D (from a random
// grid). Switching the dimension uses that dimension's preset.
function usePreset(which) {
  dim = which === "life" ? 2 : 1;
  document.querySelector('input[name="dim"][value="' + dim + '"]').checked = true;
  byId("size-1d").hidden = byId("mode-row").hidden = dim !== 1;
  byId("size-2d").hidden = dim !== 2;
  setB(2);
  showNeighborhoodPresets();
  setNeighborhood(NEIGHBORHOODS[dim][0].offsets);
  showRule(dim === 1 ? 30n : lifeRuleNumber(neighborhood, [3], [2, 3]));
  forgetDrawing();
  byId("start").value = dim === 1 ? "one" : "random";
  showClickHelp();
  readRule();
  newPicture();
  restart(false);
}

// b states: the box and the slider, the colors, and the largest fixed
// edge state. Doesn't restart: the caller does.
function setB(value) {
  b = Math.min(Math.max(Math.round(value) || 2, 2), MAX_B);
  byId("b-box").value = byId("b-slider").value = b;
  byId("edge-state").max = b - 1;
  setColors();
}

byId("preset-30").addEventListener("click", function () { usePreset("rule30"); });
byId("preset-life").addEventListener("click", function () { usePreset("life"); });
for (const radio of document.querySelectorAll('input[name="dim"]')) {
  radio.addEventListener("change", function () { usePreset(this.value === "2" ? "life" : "rule30"); });
}

// b: a new number of states (a drawing doesn't fit it any more).
function changeB(value) {
  setB(value);
  forgetDrawing();
  readRule();
  restart(true);
}
byId("b-slider").addEventListener("input", function () { changeB(this.value); });
byId("b-box").addEventListener("change", function () { changeB(this.value); });

// The rule number: every change made while typing (once it reads), the
// slider, and the Random rule button.
byId("rule-box").addEventListener("input", function () { if (readRule()) restart(true); });
byId("rule-slider").addEventListener("input", function () {
  if (!table) return;
  showRule(sliderRule(Number(this.value)));
  if (readRule()) restart(true);
});
byId("random-rule").addEventListener("click", function () {
  if (!table) return;
  showRule(randomRule());
  if (readRule()) restart(true);
});

// The edges: wrapping changes the picture's shape in 2D (a torus or not).
for (const radio of document.querySelectorAll('input[name="edge"]')) {
  radio.addEventListener("change", function () { newPicture(); restart(true); });
}
byId("edge-state").addEventListener("change", function () { restart(true); });

// A new size: a new picture, from step 0.
for (const id of ["tape-length", "tape-rows", "grid-width", "grid-height"]) {
  byId(id).addEventListener("change", function () { forgetDrawing(); newPicture(); restart(false); });
}
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", function () { restart(true); });
}
byId("start").addEventListener("change", function () { restart(false); });

// The clusters' neighbors: only the statistics change.
byId("links").addEventListener("change", function () { makePictureDomain(); drawSoon(); });

// Seed: the same seed gives the same run every time.
connectSeed(function () { restart(true); });


// --- Start ------------------------------------------------------------
byId("b-box").max = byId("b-slider").max = MAX_B;
byId("tape-length").max = MAX_LENGTH;
byId("tape-rows").max = MAX_ROWS;
byId("grid-width").max = byId("grid-height").max = MAX_SIDE;
byId("tape-length").value = DEFAULTS.length;
byId("tape-rows").value = DEFAULTS.rows;
byId("grid-width").value = DEFAULTS.width;
byId("grid-height").value = DEFAULTS.height;
byId("seed").value = DEFAULTS.seed;
usePreset("rule30");          // starts the first run
player.setPlaying(false);     // paused: press Play
