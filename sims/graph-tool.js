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
     5. The background: grid lines (like Desmos) and torus copies
     6. Painting, undo and redo
     7. The graph: statistics and getGraph()
     8. Saving, loading, copying and pasting
     9. Connecting the buttons on the page
   ===================================================================== */


/* =====================================================================
   1. SETTINGS YOU MIGHT WANT TO CHANGE
   ===================================================================== */

// The starting palette: 14 colours, shown as a grid 7 across and 2 high.
// Position 0 is "off" (the eraser). Every other position is a colour you
// can paint with; its number (1, 2, ...) is what a sim gets. On the page
// you can swap any colour or add more, and Save keeps them.
let palette = [
  null,        // 0 = off
  // first row
  "#c74440",   // 1 red
  "#fa7e19",   // 2 orange
  "#e0b000",   // 3 yellow
  "#388c46",   // 4 green
  "#1fa3a3",   // 5 teal
  "#2d70b3",   // 6 blue
  "#6042a6",   // 7 purple
  // second row
  "#d64ca0",   // 8 pink
  "#7a5230",   // 9 brown
  "#9ad13b",   // 10 lime
  "#5bb3e6",   // 11 sky blue
  "#a58fd6",   // 12 lavender
  "#8a8a8a",   // 13 grey
  "#000000",   // 14 black
];

// The background grid, like Desmos: black axes, grey lines every
// MAJOR_EVERY cells, light grey lines every cell.
const BACKGROUND   = "#ffffff";   // inside the grid's x/y limits
const OUTSIDE_GRID = "#f0f0f0";   // outside them (no cells there)
const MINOR_LINE   = "#e4e4e4";   // every cell
const MAJOR_LINE   = "#b4b4b4";   // every MAJOR_EVERY cells
const AXIS_LINE    = "#000000";   // the lines x = 0 and y = 0
const LABEL_COLOUR = "#333333";   // the numbers along the axes
const MAJOR_EVERY  = 5;

const OFF_DOT     = "#bdbdbd";   // an unpainted dot (dots view)
const EDGE_COLOUR = "#333333";   // an edge between two painted dots

const UNIT = 20;            // size of one cell, in Cytoscape units
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

    // An unpainted cell is see-through, so the background grid lines
    // (section 5) show. An unpainted dot is a small grey dot.
    {
      selector: "node.cell",
      style: dots
        ? { shape: "ellipse", width: 0.2 * UNIT, height: 0.2 * UNIT, "background-color": OFF_DOT }
        : { shape: "rectangle", width: UNIT, height: UNIT, "background-opacity": 0 },
    },
  ];

  // One rule per palette colour. Painted cells are slightly see-through,
  // like Desmos shading, so the grid lines still show; painted dots are
  // drawn bigger.
  for (let c = 1; c < palette.length; c++) {
    const look = { "background-color": palette[c], "background-opacity": dots ? 1 : 0.85 };
    if (dots) { look.width = 0.45 * UNIT; look.height = 0.45 * UNIT; }
    rules.push({ selector: "node[colour = " + c + "]", style: look });
  }

  // Edges are drawn only in dots view, and only between two painted dots
  // (class "on"); the background grid already shows the rest of the
  // lattice. The long wrap-around edges of a torus are never drawn.
  rules.push(
    { selector: "edge.lattice",    style: { display: "none" } },
    { selector: "edge.lattice.on", style: { display: dots ? "element" : "none", width: 3, "line-color": EDGE_COLOUR } },
    { selector: "edge.wrap",       style: { display: "none" } },
  );

  return rules;
}

// Apply the style rules again (after changing the view or a colour).
function restyle() {
  cy.style().fromJson(makeStyle()).update();
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


  // Swap the old drawing for the new one. "batch" makes Cytoscape redraw
  // once at the end instead of after every single change.
  cy.batch(function () {
    cy.elements().remove();
    cy.add(elements);
    cy.edges(".lattice").forEach(updateEdge);
  });
  cy.fit(cy.nodes(".cell"), 30);
  drawBackground();

  // Undo can't go back across a grid change, so start a fresh history.
  undoStack = [];
  redoStack = [];

  if (grid.torus && (width() <= 2 || height() <= 2)) {
    showMessage("On a torus this narrow, wrapping around would repeat edges or join a cell to " +
                "itself. Each edge is kept once, and no cell is joined to itself.");
  }
  updateStats();
}


/* =====================================================================
   5. THE BACKGROUND: GRID LINES (like Desmos) AND TORUS COPIES
   ---------------------------------------------------------------------
   Cytoscape doesn't draw grid lines, so this draws them on a second
   <canvas id="grid-lines"> that sits underneath Cytoscape's drawing.
   Whenever the view moves or zooms, Cytoscape sends a "viewport" event
   and the background is drawn again.

     - light grey lines every cell: in cells view they are the cell
       borders (at x = ..., -0.5, 0.5, 1.5, ...); in dots view they go
       through the dots (at whole numbers)
     - grey lines every MAJOR_EVERY cells, at x = 0, 5, 10, ...
     - black axes at x = 0 and y = 0, with numbers along them
     - on a torus: faded copies of the drawing in every direction
   ===================================================================== */
const linesCanvas = document.getElementById("grid-lines");

function drawBackground() {
  // Make the canvas's pixels match its size on screen. "ratio" is 2 on
  // high-resolution screens; drawing at that density keeps lines sharp.
  const ratio = window.devicePixelRatio || 1;
  const w = linesCanvas.clientWidth, h = linesCanvas.clientHeight;
  linesCanvas.width = w * ratio;
  linesCanvas.height = h * ratio;
  const pen = linesCanvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // from now on, draw in screen pixels

  // Where the point (x, y) is on screen right now, and back again.
  const scale = UNIT * cy.zoom();               // screen pixels per cell
  const pan = cy.pan();
  function screenX(x) { return x * scale + pan.x; }
  function screenY(y) { return -y * scale + pan.y; }
  const left = -pan.x / scale, right = (w - pan.x) / scale;     // x at the screen's edges
  const top = pan.y / scale, bottom = (pan.y - h) / scale;      // y at the screen's edges

  // Lines are 1 pixel wide; the +0.5 puts them exactly on a pixel, so
  // they look crisp instead of blurry.
  function verticalLine(x, colour, thickness) {
    const sx = Math.round(screenX(x)) + 0.5;
    pen.strokeStyle = colour; pen.lineWidth = thickness;
    pen.beginPath(); pen.moveTo(sx, 0); pen.lineTo(sx, h); pen.stroke();
  }
  function horizontalLine(y, colour, thickness) {
    const sy = Math.round(screenY(y)) + 0.5;
    pen.strokeStyle = colour; pen.lineWidth = thickness;
    pen.beginPath(); pen.moveTo(0, sy); pen.lineTo(w, sy); pen.stroke();
  }

  // 1. Grey everywhere, white inside the grid's limits. (A torus has
  //    copies of the grid everywhere, so then it's all white.)
  pen.fillStyle = grid.torus ? BACKGROUND : OUTSIDE_GRID;
  pen.fillRect(0, 0, w, h);
  pen.fillStyle = BACKGROUND;
  pen.fillRect(screenX(grid.xmin - 0.5), screenY(grid.ymax + 0.5), width() * scale, height() * scale);

  // 2. Light lines every cell (skipped when zoomed so far out that
  //    they would be closer than 4 pixels and just look grey).
  if (scale >= 4) {
    const offset = (view === "cells") ? 0.5 : 0;
    for (let x = Math.ceil(left - offset) + offset; x <= right; x++) verticalLine(x, MINOR_LINE, 1);
    for (let y = Math.ceil(bottom - offset) + offset; y <= top; y++) horizontalLine(y, MINOR_LINE, 1);
  }

  // 3. Grey lines every MAJOR_EVERY cells.
  const major = MAJOR_EVERY * scale;   // pixels between grey lines
  if (major >= 4) {
    for (let x = Math.ceil(left / MAJOR_EVERY) * MAJOR_EVERY; x <= right; x += MAJOR_EVERY) verticalLine(x, MAJOR_LINE, 1);
    for (let y = Math.ceil(bottom / MAJOR_EVERY) * MAJOR_EVERY; y <= top; y += MAJOR_EVERY) horizontalLine(y, MAJOR_LINE, 1);
  }

  // 4. The axes.
  verticalLine(0, AXIS_LINE, 1.5);
  horizontalLine(0, AXIS_LINE, 1.5);

  // 5. Numbers at the grey lines, next to the axes. When an axis is off
  //    screen, its numbers stay along the nearest edge (as in Desmos).
  if (major >= 28) {
    pen.fillStyle = LABEL_COLOUR;
    pen.font = "11px sans-serif";
    const xAxisAt = Math.min(Math.max(screenY(0), 0), h - 14);   // height of the x-axis numbers
    const yAxisAt = Math.min(Math.max(screenX(0), 24), w);       // the y-axis numbers end here
    pen.textAlign = "center";
    pen.textBaseline = "top";
    for (let x = Math.ceil(left / MAJOR_EVERY) * MAJOR_EVERY; x <= right; x += MAJOR_EVERY) {
      if (x !== 0) pen.fillText(String(x), screenX(x), xAxisAt + 3);
    }
    pen.textAlign = "right";
    pen.textBaseline = "middle";
    for (let y = Math.ceil(bottom / MAJOR_EVERY) * MAJOR_EVERY; y <= top; y += MAJOR_EVERY) {
      if (y !== 0) pen.fillText(String(y), yAxisAt - 4, screenY(y));
    }
    pen.fillText("0", yAxisAt - 4, xAxisAt + 9);
  }

  // 6. Torus: faded copies of the drawing, repeated in every direction as
  //    far as the screen reaches, so panning never runs out. They are
  //    only pictures (the real grid is the one Cytoscape draws on top);
  //    clicking a copy paints the real cell, because cellAt() wraps every
  //    point back into the grid.
  if (grid.torus) drawTorusCopies(pen, scale, screenX, screenY, left, right, bottom, top);
}

function drawTorusCopies(pen, scale, screenX, screenY, left, right, bottom, top) {
  const W = width(), H = height();

  // Copy (i, j) is the grid moved right by i*W and up by j*H.
  // These are the first and last copies that reach onto the screen.
  const iFrom = Math.ceil((left - grid.xmax - 0.5) / W), iTo = Math.floor((right - grid.xmin + 0.5) / W);
  const jFrom = Math.ceil((bottom - grid.ymax - 0.5) / H), jTo = Math.floor((top - grid.ymin + 0.5) / H);
  const copies = (iTo - iFrom + 1) * (jTo - jFrom + 1);
  if (copies > 400) return;   // zoomed out too far to see anything useful

  const painted = cy.nodes(".cell[colour > 0]");
  const edges = cy.edges(".on").not(".wrap");   // wrap-around edges are never drawn
  const dots = (view === "dots");

  pen.globalAlpha = 0.4;   // faded
  for (let i = iFrom; i <= iTo; i++) {
    for (let j = jFrom; j <= jTo; j++) {
      if (i === 0 && j === 0) continue;   // that's the real grid
      const dx = i * W, dy = j * H;

      // Dots view: the small grey unpainted dots, if they're big enough to see.
      if (dots && scale >= 6) {
        pen.fillStyle = OFF_DOT;
        forEachCell(function (x, y) {
          if (colourAt(x, y) === 0) circle(pen, screenX(x + dx), screenY(y + dy), 0.1 * scale);
        });
      }
      // Dots view: the edges between painted dots.
      if (dots) {
        pen.strokeStyle = EDGE_COLOUR;
        pen.lineWidth = 3 * cy.zoom();
        edges.forEach(function (edge) {
          const a = edge.source().data(), b = edge.target().data();
          pen.beginPath();
          pen.moveTo(screenX(a.x + dx), screenY(a.y + dy));
          pen.lineTo(screenX(b.x + dx), screenY(b.y + dy));
          pen.stroke();
        });
      }
      // The painted cells (squares) or dots (circles).
      painted.forEach(function (node) {
        const x = node.data("x") + dx, y = node.data("y") + dy;
        pen.fillStyle = palette[node.data("colour")];
        if (dots) circle(pen, screenX(x), screenY(y), 0.225 * scale);
        else pen.fillRect(screenX(x) - scale / 2, screenY(y) - scale / 2, scale, scale);
      });
    }
  }
  pen.globalAlpha = 1;

  // A dashed outline around the real grid, so you can tell which copy it is.
  pen.strokeStyle = MAJOR_LINE;
  pen.lineWidth = 1.5;
  pen.setLineDash([6, 4]);
  pen.strokeRect(screenX(grid.xmin - 0.5), screenY(grid.ymax + 0.5), W * scale, H * scale);
  pen.setLineDash([]);
}

// A filled circle of radius r centred at (sx, sy) on screen.
function circle(pen, sx, sy, r) {
  pen.beginPath();
  pen.arc(sx, sy, r, 0, 2 * Math.PI);
  pen.fill();
}

// The torus copies are drawn on the background, so it must be redrawn
// whenever a colour changes. (Without a torus there's nothing to update.)
function redrawCopies() {
  if (grid.torus) drawBackground();
}

// Redraw the lines whenever the view moves or zooms, or the window resizes.
cy.on("viewport", drawBackground);
window.addEventListener("resize", drawBackground);


/* =====================================================================
   6. PAINTING, UNDO AND REDO
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

  // Recolour the cell and the edges touching it. (Torus copies are
  // redrawn by redrawCopies(), once per mouse move rather than per cell.)
  const node = cy.getElementById(cellName(x, y));
  node.data("colour", c);
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
  redrawCopies();
});

// Pointer moves: keep painting if a stroke is going.
cy.on("tapdrag", function (event) {
  if (!stroke) return;
  cy.batch(function () { paintAlong(lastPoint, event.position); });
  lastPoint = event.position;
  redrawCopies();
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
  redrawCopies();
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
  redrawCopies();
  updateStats();
}


/* =====================================================================
   7. THE GRAPH: STATISTICS AND getGraph()
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
  for (let c = 1; c < palette.length; c++) {
    const count = cy.nodes(".cell[colour = " + c + "]").length;
    if (count === 0) continue;
    const item = document.createElement("li");
    item.innerHTML = '<span class="swatch-small" style="background:' + palette[c] + '"></span>' +
                     "colour " + c + ": " + count;
    list.appendChild(item);
  }
}


/* =====================================================================
   8. SAVING, LOADING, COPYING AND PASTING
   ---------------------------------------------------------------------
   Two text formats:
     - JSON: keeps everything (grid settings, palette, positions,
       colours). Used for Save / Load. Looks like:
         { "format": "graph-tool", "mode": "grid", "grid": {...},
           "palette": [...], "vertices": [...], "edges": [...] }
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
    palette: palette.slice(1),   // the colours, without the "off" at position 0
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

  // The palette, if the file has one made of "#rrggbb" colours.
  const isColour = function (text) { return /^#[0-9a-fA-F]{6}$/.test(text); };
  if (Array.isArray(data.palette) && data.palette.length > 0 && data.palette.every(isColour)) {
    palette = [null].concat(data.palette);
    if (currentColour >= palette.length) currentColour = 1;
  }

  colourOf = {};
  for (const v of data.vertices) {
    const c = Number(v.colour);
    if (Number.isInteger(v.x) && Number.isInteger(v.y) && c > 0 && c < palette.length) {
      colourOf[cellName(v.x, v.y)] = c;
    }
  }
  showSettings();
  buildPalette();
  restyle();
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
   9. CONNECTING THE BUTTONS ON THE PAGE
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

// --- The palette: a grid of colour squares, 7 across --------------------
// Click a square to paint with it. "Swap colour" changes the chosen
// square's colour and "+ Add colour" adds a new square; both open the
// browser's own colour chooser, an invisible <input type="color">.
function buildPalette() {
  const holder = byId("palette");
  holder.innerHTML = "";                         // empty it, then add one square per colour
  for (let c = 1; c < palette.length; c++) {
    const square = document.createElement("button");
    square.className = "swatch";
    square.title = "Colour " + c;
    square.style.background = palette[c];
    square.classList.toggle("selected", c === currentColour);
    square.addEventListener("click", function () { chooseColour(c); });
    holder.appendChild(square);
  }
  byId("eraser").classList.toggle("selected", currentColour === 0);
  byId("swap-colour").disabled = (currentColour === 0);   // the eraser has no colour to swap
  byId("current-colour").textContent =
    currentColour === 0 ? "Erasing." : "Painting with colour " + currentColour + ".";
}

function chooseColour(c) {
  currentColour = c;
  buildPalette();
  chooseTool("paint");
}
byId("eraser").addEventListener("click", function () { chooseColour(0); });

// Open the colour chooser. "adding" remembers which button opened it.
const chooser = byId("colour-chooser");
let adding = false;
function openChooser(startColour) {
  chooser.value = startColour;
  if (chooser.showPicker) chooser.showPicker();   // newer browsers
  else chooser.click();                           // older ones
}
byId("swap-colour").addEventListener("click", function () {
  adding = false;
  openChooser(palette[currentColour]);
});
byId("add-colour").addEventListener("click", function () {
  adding = true;
  openChooser("#888888");
});

// "change" happens once a colour has been picked.
chooser.addEventListener("change", function () {
  if (adding) {
    palette.push(chooser.value);           // a new square at the end
    currentColour = palette.length - 1;
  } else {
    palette[currentColour] = chooser.value;
  }
  buildPalette();
  restyle();        // repaint cells of that colour
  redrawCopies();   // and their torus copies
  updateStats();    // the colour list shows the swatches too
});

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
    restyle();
    drawBackground();   // the light lines move between cell borders and dots
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
