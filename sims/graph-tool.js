/* =====================================================================
   graph-tool.js  —  the Graph & domain tool, GRID MODE (step 1)
   ---------------------------------------------------------------------
   What it does, in plain words:
     - Draws a square grid. Each grid cell (x, y) is the unit square
       centred at the point (x, y), i.e. [x-1/2, x+1/2] x [y-1/2, y+1/2].
     - You paint cells with colours. Colour 0 means "off" (not in the
       domain); colours 1, 2, 3, ... are handed to sims as numbers.
     - The painted cells, plus the edges between painted neighbours,
       form a graph. That graph is what a sim will receive.

   The drawing, zooming, panning and touch support all come from
   Cytoscape.js, a JavaScript graph library loaded in graph-tool.html.
   It also does graph work like counting connected pieces, a bit like
   networkx does in Python. Its manual: https://js.cytoscape.org

   Cytoscape words used below:
     - "cy"           the Cytoscape drawing (one per page).
     - "node"         a vertex. Here: one grid cell, drawn as a square
                      or a dot.
     - "edge"         a line between two nodes.
     - "data"         numbers stored on a node, e.g. its colour.
     - "class"        a label on a node or edge (like class="..." in
                      HTML) that the style rules below can pick out.
     - "position"     where a node is drawn, in Cytoscape's own units.
                      Cytoscape's y axis points DOWN, so the point (x, y)
                      is drawn at (x * UNIT, -y * UNIT).

   The file is split into numbered sections:
     1. Settings you might want to change (colours, sizes)
     2. What the tool remembers (the "state")
     3. How things look (the style rules)
     4. Building the grid
     5. Painting, undo and redo
     6. The graph: statistics and getGraph()
     7. Saving, loading, copying and pasting
     8. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The palette. Position 0 is "off" (the eraser). Every other position is
// a colour you can paint with; its number (1, 2, ...) is what a sim gets.
// Placeholder colours: change them freely, or add more lines.
const PALETTE = [
  null,        // 0 = off
  "#3a5a7a",   // 1 blue
  "#c0504d",   // 2 red
  "#e8a33d",   // 3 orange
  "#5b9b57",   // 4 green
  "#8064a2",   // 5 purple
  "#3fa7a3",   // 6 teal
  "#d16fa8",   // 7 pink
  "#6b4f3a",   // 8 brown
];

const OFF_COLOUR  = "#ffffff";   // an unpainted cell
const GRID_LINES  = "#dedbd4";   // thin lines between cells, faint edges
const AXIS_COLOUR = "#22252b";   // the x and y axes, and painted edges

const UNIT = 20;            // size of one cell, in Cytoscape units
const TICK_EVERY = 5;       // a number on the axes every 5 cells
const MAX_CELLS = 10000;    // biggest grid allowed (e.g. 100 x 100)


/* =====================================================================
   2. WHAT THE TOOL REMEMBERS (the "state")
   ===================================================================== */

// The grid settings. They match the boxes in the Options quadrant.
const grid = {
  xmin: -10, xmax: 10,
  ymin: -10, ymax: 10,
  neighbours: 4,       // 4 = share a side; 8 = sides or corners
  torus: false,        // true = right edge joins left, top joins bottom
};

// The colour of every painted cell, e.g. { "3,-2": 1, "0,0": 4 }.
// A cell that isn't listed is off (colour 0).
let colourOf = {};

let currentColour = 1;   // the palette colour you're painting with
let tool = "paint";      // "paint" or "move"
let view = "cells";      // "cells" or "dots"

// Undo and redo. Each entry is one brush stroke (or one button press):
// a Map from cell name "x,y" to { before: colour, after: colour }.
let undoStack = [];
let redoStack = [];
let stroke = null;        // the stroke being drawn right now, or null
let strokeColour = 0;     // the colour this stroke paints
let lastPoint = null;     // where the pointer was a moment ago

// The 8 copies drawn around the grid when it's a torus.
const COPY_SHIFTS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];


// Small helpers.
function cellName(x, y) { return x + "," + y; }
function colourAt(x, y) { return colourOf[cellName(x, y)] || 0; }
function width()  { return grid.xmax - grid.xmin + 1; }
function height() { return grid.ymax - grid.ymin + 1; }

function inGrid(x, y) {
  return x >= grid.xmin && x <= grid.xmax && y >= grid.ymin && y <= grid.ymax;
}

// Where the point (x, y) is drawn. Minus sign: Cytoscape's y points down.
function drawAt(x, y) { return { x: x * UNIT, y: -y * UNIT }; }

// Wrap a number into the range lo..hi, for the torus.
// E.g. with lo = 0, hi = 9: 10 -> 0, -1 -> 9.
function wrap(v, lo, hi) {
  const n = hi - lo + 1;
  return lo + (((v - lo) % n) + n) % n;
}

// The name of a torus copy of cell (x, y), shifted by (sx, sy) grids.
function copyName(sx, sy, x, y) { return "copy " + sx + " " + sy + " " + cellName(x, y); }


/* =====================================================================
   3. HOW THINGS LOOK (the style rules)
   ---------------------------------------------------------------------
   Cytoscape styles work like CSS: a list of { selector, style } rules,
   and later rules win over earlier ones. "node.cell" means nodes with
   class "cell"; "node[colour = 2]" means nodes whose colour data is 2.
   This is a function because cells view and dots view look different.
   ===================================================================== */
function makeStyle() {
  const dots = (view === "dots");

  const rules = [
    // Draw things in the order given by "z-index": higher is on top.
    { selector: "node", style: { "z-index-compare": "manual", "z-index": 2 } },
    { selector: "edge", style: { "z-index-compare": "manual", "z-index": 1, "curve-style": "straight" } },

    // An unpainted cell: a white square with a thin border (cells view),
    // or a small faint dot (dots view).
    {
      selector: "node.cell, node.copy",
      style: dots
        ? { shape: "ellipse", width: 0.2 * UNIT, height: 0.2 * UNIT, "background-color": GRID_LINES }
        : { shape: "rectangle", width: UNIT, height: UNIT, "background-color": OFF_COLOUR,
            "border-width": 1, "border-color": GRID_LINES },
    },
    // Torus copies are faded, so the real grid stands out.
    { selector: "node.copy", style: { opacity: 0.4 } },
  ];

  // One rule per palette colour. Painted dots are drawn bigger.
  for (let c = 1; c < PALETTE.length; c++) {
    const look = { "background-color": PALETTE[c] };
    if (dots) { look.width = 0.45 * UNIT; look.height = 0.45 * UNIT; }
    rules.push({ selector: "node[colour = " + c + "]", style: look });
  }

  // Edges are only drawn in dots view: faint grid lines, and thick lines
  // between two painted dots (class "on"). Faint diagonals (8 neighbours)
  // and the long wrap-around edges of a torus are never drawn.
  rules.push(
    { selector: "edge.lattice",          style: { display: dots ? "element" : "none", width: 1, "line-color": GRID_LINES } },
    { selector: "edge.lattice.diagonal", style: { display: "none" } },
    { selector: "edge.lattice.on",       style: { display: dots ? "element" : "none", width: 3, "line-color": AXIS_COLOUR } },
    { selector: "edge.wrap",             style: { display: "none" } },
  );

  // The axes, and the numbers along them. "events: no" means you can't
  // click them; clicks go straight through to the grid.
  rules.push(
    { selector: "node.axis-end", style: { width: 1, height: 1, opacity: 0, events: "no" } },
    { selector: "edge.axis", style: { width: 2, "line-color": AXIS_COLOUR, opacity: 0.6, "z-index": 5, events: "no" } },
    {
      selector: "node.tick",
      style: {
        label: "data(label)", "font-size": 9, color: AXIS_COLOUR,
        "text-valign": "bottom", "text-halign": "right",
        width: 1, height: 1, "background-opacity": 0, "z-index": 6, events: "no",
      },
    },
  );

  return rules;
}


// Create the Cytoscape drawing inside <div id="graph-area">.
const cy = cytoscape({
  container: document.getElementById("graph-area"),
  style: makeStyle(),
  minZoom: 0.05,
  maxZoom: 10,
  boxSelectionEnabled: false,   // dragging never draws a selection box
  autoungrabify: true,          // cells can't be dragged around
  autounselectify: true,        // clicking doesn't "select" anything
  userPanningEnabled: false,    // dragging paints; the Move tool turns panning on
});


/* =====================================================================
   4. BUILDING THE GRID
   ---------------------------------------------------------------------
   Called at the start and whenever a grid setting changes. Throws away
   everything Cytoscape is showing and makes it again from "grid" and
   "colourOf".
   ===================================================================== */
function buildGrid() {
  // Forget painted cells that are now outside the grid.
  for (const name of Object.keys(colourOf)) {
    const [x, y] = name.split(",").map(Number);
    if (!inGrid(x, y)) delete colourOf[name];
  }

  const elements = [];   // everything to draw, collected here first

  // One node per cell.
  for (let x = grid.xmin; x <= grid.xmax; x++) {
    for (let y = grid.ymin; y <= grid.ymax; y++) {
      elements.push({
        group: "nodes", classes: "cell",
        data: { id: cellName(x, y), x: x, y: y, colour: colourAt(x, y) },
        position: drawAt(x, y),
      });
    }
  }

  // Torus: 8 faded copies around the grid, so you can see it wrap.
  if (grid.torus) {
    for (const [sx, sy] of COPY_SHIFTS) {
      for (let x = grid.xmin; x <= grid.xmax; x++) {
        for (let y = grid.ymin; y <= grid.ymax; y++) {
          elements.push({
            group: "nodes", classes: "copy",
            data: { id: copyName(sx, sy, x, y), colour: colourAt(x, y) },
            position: drawAt(x + sx * width(), y + sy * height()),
          });
        }
      }
    }
  }

  // The edges. Each cell looks right and up (and, with 8 neighbours,
  // diagonally right-up and right-down); looking the other ways would
  // only find the same edges again.
  const steps = grid.neighbours === 8 ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
  const seen = new Set();   // edges already made, so none is made twice

  for (let x = grid.xmin; x <= grid.xmax; x++) {
    for (let y = grid.ymin; y <= grid.ymax; y++) {
      for (const [dx, dy] of steps) {
        let nx = x + dx, ny = y + dy;
        let wrapped = false;
        if (!inGrid(nx, ny)) {
          if (!grid.torus) continue;           // off the edge: no neighbour
          nx = wrap(nx, grid.xmin, grid.xmax); // torus: come back the other side
          ny = wrap(ny, grid.ymin, grid.ymax);
          wrapped = true;
        }
        if (nx === x && ny === y) continue;    // a tiny torus can wrap onto itself

        const a = cellName(x, y), b = cellName(nx, ny);
        const pair = a < b ? a + "|" + b : b + "|" + a;
        if (seen.has(pair)) continue;          // a tiny torus can repeat an edge
        seen.add(pair);

        let classes = "lattice";
        if (dx !== 0 && dy !== 0) classes += " diagonal";
        if (wrapped) classes += " wrap";
        elements.push({ group: "edges", classes: classes, data: { source: a, target: b } });
      }
    }
  }

  elements.push(...makeAxes());

  // Swap the old drawing for the new one. "batch" makes Cytoscape redraw
  // once at the end instead of after every single change.
  cy.batch(function () {
    cy.elements().remove();
    cy.add(elements);
    cy.edges(".lattice").forEach(updateEdge);
  });
  cy.fit(cy.nodes(".cell"), 30);

  // Undo can't go back across a grid change, so start a fresh history.
  undoStack = [];
  redoStack = [];

  if (grid.torus && (width() <= 2 || height() <= 2)) {
    showMessage("On a torus this narrow, wrapping around would repeat edges or join a cell to " +
                "itself. Each edge is kept once, and no cell is joined to itself.");
  }
  updateStats();
}


// The x and y axes: two long lines, each drawn between two invisible
// end points, plus a number every TICK_EVERY cells.
function makeAxes() {
  const pad = grid.torus ? Math.max(width(), height()) : 2;   // reach past the grid
  const left = grid.xmin - pad, right = grid.xmax + pad;
  const bottom = grid.ymin - pad, top = grid.ymax + pad;

  const parts = [
    { group: "nodes", classes: "axis-end", data: { id: "x-axis-left" },   position: drawAt(left, 0) },
    { group: "nodes", classes: "axis-end", data: { id: "x-axis-right" },  position: drawAt(right, 0) },
    { group: "nodes", classes: "axis-end", data: { id: "y-axis-bottom" }, position: drawAt(0, bottom) },
    { group: "nodes", classes: "axis-end", data: { id: "y-axis-top" },    position: drawAt(0, top) },
    { group: "edges", classes: "axis", data: { source: "x-axis-left",   target: "x-axis-right" } },
    { group: "edges", classes: "axis", data: { source: "y-axis-bottom", target: "y-axis-top" } },
  ];

  // First multiple of TICK_EVERY at or after "from".
  function firstTick(from) { return Math.ceil(from / TICK_EVERY) * TICK_EVERY; }

  for (let t = firstTick(left); t <= right; t += TICK_EVERY) {
    parts.push({ group: "nodes", classes: "tick", data: { id: "tick-x " + t, label: String(t) }, position: drawAt(t, 0) });
  }
  for (let t = firstTick(bottom); t <= top; t += TICK_EVERY) {
    if (t === 0) continue;   // "0" is already written at the origin
    parts.push({ group: "nodes", classes: "tick", data: { id: "tick-y " + t, label: String(t) }, position: drawAt(0, t) });
  }
  return parts;
}


/* =====================================================================
   5. PAINTING, UNDO AND REDO
   ===================================================================== */

// Give cell (x, y) colour c, and remember it for undo if a stroke is going.
function setColour(x, y, c) {
  const before = colourAt(x, y);
  if (before === c) return;

  if (stroke) {
    const name = cellName(x, y);
    if (!stroke.has(name)) stroke.set(name, { before: before });
    stroke.get(name).after = c;
  }

  if (c === 0) delete colourOf[cellName(x, y)];
  else colourOf[cellName(x, y)] = c;

  // Recolour the cell, its torus copies, and the edges touching it.
  const node = cy.getElementById(cellName(x, y));
  node.data("colour", c);
  if (grid.torus) {
    for (const [sx, sy] of COPY_SHIFTS) cy.getElementById(copyName(sx, sy, x, y)).data("colour", c);
  }
  node.connectedEdges().forEach(updateEdge);
}

// An edge is "on" (part of the domain) when both of its ends are painted.
function updateEdge(edge) {
  const bothPainted = edge.source().data("colour") > 0 && edge.target().data("colour") > 0;
  edge.toggleClass("on", bothPainted);
}

// Which cell is under a point of the drawing? null if none.
// Rounding finds the nearest centre, because cell (x, y) is centred at (x, y).
function cellAt(point) {
  let x = Math.round(point.x / UNIT);
  let y = Math.round(-point.y / UNIT);
  if (grid.torus) {               // any copy counts as the real cell
    x = wrap(x, grid.xmin, grid.xmax);
    y = wrap(y, grid.ymin, grid.ymax);
  }
  return inGrid(x, y) ? { x: x, y: y } : null;
}

// Paint every cell along the straight line from point a to point b.
// (A fast mouse can jump several cells between two updates; this fills
// the gap so the stroke has no holes.)
function paintAlong(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const pieces = Math.max(1, Math.ceil(distance / (UNIT / 2)));
  for (let i = 1; i <= pieces; i++) {
    const t = i / pieces;
    const cell = cellAt({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    if (cell) setColour(cell.x, cell.y, strokeColour);
  }
}

// Pointer (mouse or finger) goes down: start a stroke.
cy.on("tapstart", function (event) {
  if (tool !== "paint") return;
  stroke = new Map();
  lastPoint = event.position;

  // Starting on a cell that already has the current colour erases
  // instead, so a single click toggles a cell on and off.
  const cell = cellAt(event.position);
  const startsOnSameColour = cell && currentColour !== 0 && colourAt(cell.x, cell.y) === currentColour;
  strokeColour = startsOnSameColour ? 0 : currentColour;

  if (cell) setColour(cell.x, cell.y, strokeColour);
});

// Pointer moves: keep painting if a stroke is going.
cy.on("tapdrag", function (event) {
  if (!stroke) return;
  cy.batch(function () { paintAlong(lastPoint, event.position); });
  lastPoint = event.position;
});

// Pointer comes up (on or off the drawing): the stroke is finished.
cy.on("tapend", finishStroke);
window.addEventListener("pointerup", finishStroke);

function finishStroke() {
  if (!stroke) return;
  if (stroke.size > 0) {
    undoStack.push(stroke);
    redoStack = [];            // a new change makes old redos meaningless
  }
  stroke = null;
  updateStats();
}

// Run "change" (which calls setColour many times) as one undoable step.
// Used by the Fill / Clear / Invert buttons and by pasting.
function asOneStep(change) {
  stroke = new Map();
  cy.batch(change);
  finishStroke();
}

function forEachCell(doThis) {
  for (let x = grid.xmin; x <= grid.xmax; x++) {
    for (let y = grid.ymin; y <= grid.ymax; y++) doThis(x, y);
  }
}

// Undo / redo: replay a stroke's "before" (or "after") colours.
function undo() { replay(undoStack, redoStack, "before"); }
function redo() { replay(redoStack, undoStack, "after"); }

function replay(from, to, which) {
  const step = from.pop();
  if (!step) return;
  cy.batch(function () {
    step.forEach(function (change, name) {
      const [x, y] = name.split(",").map(Number);
      setColour(x, y, change[which]);
    });
  });
  to.push(step);
  updateStats();
}


/* =====================================================================
   6. THE GRAPH: STATISTICS AND getGraph()
   ---------------------------------------------------------------------
   The domain graph = the painted cells, plus the edges whose two ends
   are both painted (the edges with class "on").
   ===================================================================== */

// The graph a sim will receive, as plain lists:
//   { vertices: [ {id: "3,-2", x: 3, y: -2, colour: 1}, ... ],
//     edges:    [ ["3,-2", "4,-2"], ... ] }
function getGraph() {
  const vertices = cy.nodes(".cell[colour > 0]").map(function (node) {
    return { id: node.id(), x: node.data("x"), y: node.data("y"), colour: node.data("colour") };
  });
  const edges = cy.edges(".on").map(function (edge) {
    return [edge.source().id(), edge.target().id()];
  });
  return { vertices: vertices, edges: edges };
}

// Fill in the Statistics quadrant.
function updateStats() {
  const painted = cy.nodes(".cell[colour > 0]");
  const edges = cy.edges(".on");
  // components(): Cytoscape splits the graph into its connected pieces.
  const pieces = painted.union(edges).components().length;

  document.getElementById("stat-vertices").textContent = painted.length;
  document.getElementById("stat-edges").textContent = edges.length;
  document.getElementById("stat-pieces").textContent = pieces;

  // How many cells of each colour, as a list with a colour swatch.
  const list = document.getElementById("stat-colours");
  list.innerHTML = "";
  for (let c = 1; c < PALETTE.length; c++) {
    const count = cy.nodes(".cell[colour = " + c + "]").length;
    if (count === 0) continue;
    const item = document.createElement("li");
    item.innerHTML = '<span class="swatch-small" style="background:' + PALETTE[c] + '"></span>' +
                     "colour " + c + ": " + count;
    list.appendChild(item);
  }
}


/* =====================================================================
   7. SAVING, LOADING, COPYING AND PASTING
   ---------------------------------------------------------------------
   Two text formats:
     - JSON: keeps everything (grid settings, positions, colours). Used
       for Save / Load. Looks like:
         { "format": "graph-tool", "mode": "grid", "grid": {...},
           "vertices": [...], "edges": [...] }
     - Edge list: one edge per line, "3,-2 4,-2". Easy to use in other
       programs (networkx: nx.read_edgelist), but it forgets colours
       and any painted cell with no painted neighbour.
   ===================================================================== */

function toJSONText() {
  const graph = getGraph();
  const data = {
    format: "graph-tool",
    version: 1,
    mode: "grid",
    grid: grid,
    vertices: graph.vertices,
    edges: graph.edges,
  };
  // One line per part, so the file is easy to read in a text editor.
  const lines = Object.keys(data).map(function (k) {
    return "  " + JSON.stringify(k) + ": " + JSON.stringify(data[k]);
  });
  return "{\n" + lines.join(",\n") + "\n}\n";
}

function toEdgeListText() {
  const lines = ["# Edge list from the graph tool. Vertex x,y is the cell centred at (x, y)."];
  for (const [a, b] of getGraph().edges) lines.push(a + " " + b);
  return lines.join("\n") + "\n";
}

// Put text in the box on the page and try to copy it to the clipboard.
function showAndCopy(text) {
  const box = document.getElementById("text-box");
  box.value = text;
  if (!navigator.clipboard) {
    return showMessage("Select the text in the box below and copy it.");
  }
  navigator.clipboard.writeText(text).then(
    function () { showMessage("Copied. The text is also in the box below."); },
    function () { showMessage("Couldn't copy automatically: select the text in the box and copy it."); }
  );
}

// Download the drawing as a .json file.
function saveFile() {
  const file = new Blob([toJSONText()], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "domain.json";
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

// Load from text: JSON if it starts with "{", otherwise an edge list.
function loadText(text) {
  text = text.trim();
  if (text === "") return showMessage("Nothing to load: the box is empty.");
  if (text.startsWith("{")) loadJSON(text);
  else loadEdgeList(text);
}

function loadJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (problem) {
    return showMessage("That isn't valid JSON, so nothing was loaded.");
  }
  if (data.mode !== "grid" || !data.grid || !Array.isArray(data.vertices)) {
    return showMessage("That isn't a grid-mode drawing, so nothing was loaded.");
  }

  const settings = {
    xmin: Number(data.grid.xmin), xmax: Number(data.grid.xmax),
    ymin: Number(data.grid.ymin), ymax: Number(data.grid.ymax),
    neighbours: Number(data.grid.neighbours) === 8 ? 8 : 4,
    torus: data.grid.torus === true,
  };
  const problem = checkSettings(settings);
  if (problem) return showMessage("Nothing was loaded: " + problem);

  Object.assign(grid, settings);
  colourOf = {};
  for (const v of data.vertices) {
    const c = Number(v.colour);
    if (Number.isInteger(v.x) && Number.isInteger(v.y) && c > 0 && c < PALETTE.length) {
      colourOf[cellName(v.x, v.y)] = c;
    }
  }
  showSettings();
  buildGrid();
  showMessage("Loaded. (Undo history starts fresh after loading.)");
}

// In grid mode, an edge list can only say which cells to paint: the grid
// itself decides the edges. So every vertex named "x,y" gets painted in
// the current colour (colour 1 if the eraser is chosen).
function loadEdgeList(text) {
  const names = [];
  for (const line of text.split("\n")) {
    const words = line.trim().split(/\s+/);
    if (words[0] === "" || words[0].startsWith("#")) continue;   // blank or comment
    names.push(words[0]);                    // a line may name just one vertex
    if (words.length > 1) names.push(words[1]);
  }

  const cells = [];
  for (const name of names) {
    const match = /^(-?\d+),(-?\d+)$/.exec(name);
    if (!match) {
      return showMessage('Nothing was loaded: in grid mode every vertex must be named like "3,-2". ' +
                         "Other edge lists will load in free mode (step 3).");
    }
    cells.push({ x: Number(match[1]), y: Number(match[2]) });
  }

  const colour = currentColour || 1;
  let outside = 0;
  asOneStep(function () {
    for (const cell of cells) {
      if (inGrid(cell.x, cell.y)) setColour(cell.x, cell.y, colour);
      else outside++;
    }
  });
  showMessage("Painted the edge list's vertices. The grid decides the edges, so only the vertices were used." +
              (outside > 0 ? " " + outside + " vertex names were outside the grid and skipped." : ""));
}


/* =====================================================================
   8. CONNECTING THE BUTTONS ON THE PAGE
   ===================================================================== */

function byId(id) { return document.getElementById(id); }

function showMessage(text) { byId("tool-message").textContent = text; }

// --- Tools: Paint / Move / Fit view ---------------------------------
function chooseTool(name) {
  tool = name;
  cy.userPanningEnabled(name === "move");      // dragging pans only in Move
  byId("tool-paint").classList.toggle("selected", name === "paint");
  byId("tool-move").classList.toggle("selected", name === "move");
  byId("graph-area").classList.toggle("moving", name === "move");
}
byId("tool-paint").addEventListener("click", function () { chooseTool("paint"); });
byId("tool-move").addEventListener("click", function () { chooseTool("move"); });
byId("tool-fit").addEventListener("click", function () { cy.fit(cy.nodes(".cell"), 30); });
byId("tool-undo").addEventListener("click", undo);
byId("tool-redo").addEventListener("click", redo);

// Ctrl+Z (Cmd+Z on a Mac) undoes; Ctrl+Shift+Z or Ctrl+Y redoes.
// Ignored while typing in a box, so it doesn't fight the box's own undo.
document.addEventListener("keydown", function (event) {
  if (event.target.matches("input, textarea, select")) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
  else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); redo(); }
});

// --- The palette: one round button per colour -----------------------
function buildPalette() {
  const holder = byId("palette");
  for (let c = 0; c < PALETTE.length; c++) {
    const button = document.createElement("button");
    button.className = "swatch";
    button.title = c === 0 ? "Off (eraser)" : "Colour " + c;
    if (c === 0) button.textContent = "×";       // the × sign
    else button.style.background = PALETTE[c];
    button.addEventListener("click", function () {
      currentColour = c;
      for (const other of holder.children) other.classList.remove("selected");
      button.classList.add("selected");
      chooseTool("paint");
    });
    if (c === currentColour) button.classList.add("selected");
    holder.appendChild(button);
  }
}

// --- Grid settings ----------------------------------------------------
// Returns a sentence describing what's wrong, or "" if all is fine.
function checkSettings(s) {
  const numbers = [s.xmin, s.xmax, s.ymin, s.ymax];
  if (!numbers.every(Number.isInteger)) return "the grid limits must be whole numbers.";
  if (s.xmin > s.xmax || s.ymin > s.ymax) return "each minimum must be at most its maximum.";
  const cells = (s.xmax - s.xmin + 1) * (s.ymax - s.ymin + 1);
  if (cells > MAX_CELLS) return "that grid has " + cells + " cells; the most allowed is " + MAX_CELLS + ".";
  return "";
}

// Copy the grid settings into the boxes on the page.
function showSettings() {
  byId("set-xmin").value = grid.xmin;
  byId("set-xmax").value = grid.xmax;
  byId("set-ymin").value = grid.ymin;
  byId("set-ymax").value = grid.ymax;
  byId("set-neighbours").value = String(grid.neighbours);
  byId("set-torus").checked = grid.torus;
}

// Read the boxes; if they make sense, rebuild the grid.
function applySettings() {
  const settings = {
    xmin: Number(byId("set-xmin").value), xmax: Number(byId("set-xmax").value),
    ymin: Number(byId("set-ymin").value), ymax: Number(byId("set-ymax").value),
    neighbours: Number(byId("set-neighbours").value),
    torus: byId("set-torus").checked,
  };
  const problem = checkSettings(settings);
  if (problem) {
    showSettings();   // put the old values back
    return showMessage("Grid not changed: " + problem);
  }
  Object.assign(grid, settings);
  showMessage("");
  buildGrid();
}
for (const id of ["set-xmin", "set-xmax", "set-ymin", "set-ymax", "set-neighbours", "set-torus"]) {
  byId(id).addEventListener("change", applySettings);   // "change" = after you finish editing
}

// Cells view / dots view: same graph, different picture.
for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", function () {
    view = radio.value;
    cy.style().fromJson(makeStyle()).update();
  });
}

// --- Fill / Clear / Invert ------------------------------------------
byId("do-fill").addEventListener("click", function () {
  asOneStep(function () { forEachCell(function (x, y) { setColour(x, y, currentColour); }); });
});
byId("do-clear").addEventListener("click", function () {
  asOneStep(function () { forEachCell(function (x, y) { setColour(x, y, 0); }); });
});
byId("do-invert").addEventListener("click", function () {
  const paint = currentColour || 1;   // with the eraser chosen, invert paints colour 1
  asOneStep(function () {
    forEachCell(function (x, y) { setColour(x, y, colourAt(x, y) > 0 ? 0 : paint); });
  });
});

// --- Save / load / copy / paste --------------------------------------
byId("do-save").addEventListener("click", saveFile);
byId("do-load").addEventListener("click", function () { byId("load-file").click(); });
byId("load-file").addEventListener("change", function () {
  const file = byId("load-file").files[0];
  if (file) file.text().then(loadText);
  byId("load-file").value = "";   // so loading the same file again still works
});
byId("do-copy-json").addEventListener("click", function () { showAndCopy(toJSONText()); });
byId("do-copy-edges").addEventListener("click", function () { showAndCopy(toEdgeListText()); });
byId("do-paste").addEventListener("click", function () { loadText(byId("text-box").value); });


// --- Start ------------------------------------------------------------
buildPalette();
showSettings();
buildGrid();
