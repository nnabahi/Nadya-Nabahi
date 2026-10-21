/* =====================================================================
   sim-controls.js  —  the options and controls the sims on cells share
   ---------------------------------------------------------------------
   Most sims run on a domain of cells, and their pages have the same
   few controls for it:
     - the Domain options: Box, Torus, Custom (drawn in the graph tool),
       and on most sims "Hyperbolic plane or tree";
     - the graph tool itself, shown inside the page for Custom;
     - a picture you can drag, zoom and click;
     - a clickable grid of cells for picking a set of offsets (the random
       mountain's tile, the cellular automata's neighborhood).
   Each sim used to have its own copy of the code for these. Now they
   are written once, here. Each helper is handed what is different on
   each page (what a click does, what makes a drawing good enough, ...)
   and does the rest.

   Load it after js/sim-page.js, js/sim-domains.js, js/sim-view.js and
   (on pages with the hyperbolic plane or tree) js/sim-hyperbolic.js.

   Contents:
     1. The Domain options
          connectDomainChoice(choices)      what each Domain option does
          showDomainOptions(kind, custom, disk)   show the options of the domain in use
          fillDomainOptions(defaults, most, ball) their values at the start
          boxFromOptions(least, most, defaults)   the box or torus they say
        and the Lattice options, on pages that have them:
          onSquares()                       is the lattice the square grid?
          onFiniteTiling()                  is it a tiling that never repeats?
          cornersCanBeCells()               can its corners be the cells?
          readTiling()                      the tiling the Lattice options say
     2. The graph tool inside a sim page
          makeCustomTool(page)
     3. Dragging, zooming and clicking the picture
          makeClickTracker()                is a press a click or a drag?
          connectPicture(view, disk, onGraph, onClick, cursor)
          cellAtEvent(view, disk, d, onGraph, event)   the cell under the pointer
     4. The clickable grid of offsets
          offsetKey(t), offsetText(t)       an offset's name, and as shown
          showOffsetGrid(grid, dim, reach, offsets, setOffsets, center)
   ===================================================================== */


/* =====================================================================
   1. THE DOMAIN OPTIONS
   ---------------------------------------------------------------------
   Every page uses the same ids: the radio buttons name="domain", the
   boxes set-width, set-height and set-neighbors (in the rows size-row
   and neighbors-row), the row custom-row with custom-info and the
   button edit-custom, and for the hyperbolic plane or tree the rows in
   graph-rows (js/sim-hyperbolic.js reads them).

   THE LATTICE. A page whose sim runs on any tiling (js/sim-tilings.js)
   also has, in the box lattice-rows: the menu set-tiling (the square
   grid, the other tilings with one or two kinds of corner, the Penrose
   tilings on pages that load js/sim-penrose.js, and "Your own code"),
   the box tiling-code with the line tiling-message under it, and the
   row cells-row with the radio buttons name="cells-are" (the tiles or
   the corners of the tiling are the cells). The square grid is the
   usual box or torus, with its Neighbors option; any other tiling is a
   tilingBox (js/sim-domains.js), its size in side lengths. A Penrose
   tiling never repeats, so it has no torus: its Torus option hides.
   The cells-row hides where only the tiles can be cells: on the square
   grid, and on Penrose's first tiling (P1).
   ===================================================================== */

// What each Domain option does: "choices" gives a function for each
// value of the radio buttons, for example
//   { box: useBox, torus: useBox, custom: openTool, graph: useGraph }
// Changing the size or the neighbors calls the box's function again,
// "Edit custom domain" calls the custom one, and (with a graph) changing
// the graph or the ball's radius R calls the graph's. The preset
// buttons of the hyperbolic plane or tree are made here too.
function connectDomainChoice(choices) {
  for (const radio of document.querySelectorAll('input[name="domain"]')) {
    radio.addEventListener("change", function () { choices[radio.value](); });
  }
  for (const id of ["set-width", "set-height", "set-neighbors"]) {
    if (byId(id)) byId(id).addEventListener("change", choices.box);
  }
  if (byId("set-tiling")) connectLattice(choices.box);
  byId("edit-custom").addEventListener("click", choices.custom);
  if (!choices.graph) return;
  for (const id of ["set-p", "set-q", "set-degree", "set-ball-radius"]) byId(id).addEventListener("change", choices.graph);
  for (const radio of document.querySelectorAll('input[name="graph-kind"]')) radio.addEventListener("change", choices.graph);
  showGraphPresets(choices.graph);
}

// Show the options that fit the domain in use ("box", "torus", "custom"
// or "graph"), and tick its radio button. "custom" is the last custom
// domain drawn (or null), described in its row; "disk" is the page's
// disk view (js/sim-hyperbolic.js): "Back to the start" shows on the
// hyperbolic plane or tree, except for a tree spread out.
function showDomainOptions(kind, custom, disk) {
  document.querySelector('input[name="domain"][value="' + kind + '"]').checked = true;
  const isCustom = (kind === "custom"), onGraph = (kind === "graph");
  byId("size-row").hidden = byId("neighbors-row").hidden = isCustom || onGraph;
  if (byId("set-tiling")) {
    byId("lattice-rows").hidden = isCustom || onGraph;
    byId("neighbors-row").hidden = isCustom || onGraph || !onSquares();
    byId("cells-row").hidden = !cornersCanBeCells();
    const torus = document.querySelector('input[name="domain"][value="torus"]');
    if (torus) torus.parentElement.hidden = onFiniteTiling();
  }
  byId("custom-row").hidden = !isCustom;
  byId("graph-rows").hidden = !onGraph;
  byId("disk-reset").hidden = !onGraph || disk.picture === "spread";   // with the zoom buttons
  if (isCustom && custom) {
    byId("custom-info").textContent = "Your region: " + custom.n + " cells" + (custom.wrap ? ", on a torus." : ".");
  }
}

// The options' values at the start: the box's size (defaults.width x
// defaults.height, at most "most" on a side) and neighbors, and, with a
// "ball" (as in makeBall: its default radius R and largest radius
// "most"), the hyperbolic plane or tree's ball.
function fillDomainOptions(defaults, most, ball) {
  byId("set-width").value = defaults.width;
  byId("set-height").value = defaults.height;
  byId("set-width").max = byId("set-height").max = most;
  if (byId("set-neighbors")) byId("set-neighbors").value = String(defaults.neighbors);
  if (ball) {
    byId("set-ball-radius").value = ball.R;
    byId("set-ball-radius").max = ball.most;
  }
}

// The box or torus the options say (boxDomain, js/sim-domains.js): its
// sides are whole numbers from "least" to "most" ("defaults" when a box
// is left empty), and with no Neighbors option cells have 4 neighbors.
// On a lattice other than the square grid, a tilingBox of the tiling in
// use (readTiling), the sides in side lengths, and at least
// SMALLEST_TILING_BOX of them, so it always has a cell.
function boxFromOptions(least, most, defaults) {
  if (!onSquares()) least = Math.max(least, SMALLEST_TILING_BOX);
  const width = readWhole("set-width", least, most, defaults.width);
  const height = readWhole("set-height", least, most, defaults.height);
  const torus = checked("domain") === "torus" && !onFiniteTiling();
  if (!onSquares()) return tilingBox(tilingInUse.block, width, height, torus);
  const neighbors = byId("set-neighbors") ? Number(byId("set-neighbors").value) : 4;
  return boxDomain(width, height, neighbors, torus);
}

// A box of a tiling is at least this many side lengths on a side, so it
// always holds a cell: every point of the plane is less than 2 side
// lengths from a tile's middle and from a corner (a point in a tile is
// at most as far from them as the tile's corners are from its middle,
// 1.93 for the biggest tile, the 12-gon), so the middle of a box 4 side
// lengths on a side has one of each within the box.
const SMALLEST_TILING_BOX = 4;

// The tiling built last from the Lattice options, so it is built again
// only when they change: { code, corners, block } with "block" from
// uprightBlock (js/sim-tilings.js), and "corners" true when its corners
// are the cells.
let tilingInUse = null;

// Is the lattice the square grid? (Always, on a page with no Lattice
// options.) Its code is TILINGS[0]'s.
function onSquares() {
  return !byId("set-tiling") || byId("set-tiling").value === "0";
}

// Is the lattice a tiling that never repeats (js/sim-penrose.js)? It has
// no torus.
function onFiniteTiling() {
  return !onSquares() && Boolean(tilingInUse.block.finite);
}

// Can the corners of the lattice be the cells, as well as its tiles? Not
// on the square grid (they would be squares again), nor on Penrose's
// first tiling (js/sim-penrose.js: the inner corners of its stars and
// boats touch just two tiles).
function cornersCanBeCells() {
  return !onSquares() && !tilingInUse.block.tilesOnly;
}

// The Lattice menu: the tilings of menuTilings() (js/sim-tilings.js),
// and "Your own code". Starts on the square grid.
function fillLatticeMenu() {
  const menu = byId("set-tiling");
  addTilingOptions(menu);   // (js/sim-tilings.js)
  menu.appendChild(new Option("Your own code", "own"));
  menu.value = "0";
  byId("tiling-code").value = TILINGS[0].code;
  readTiling();
}

// The Lattice options call "useBox" (the page's box or torus) when they
// change. Choosing a tiling in the menu puts its code in the box; typing
// a code picks the tiling with that code from the menu, if there is one,
// and otherwise "Your own code". A code that isn't a tiling leaves the
// domain as it was, and the line under the box says what is wrong.
function connectLattice(useBox) {
  const menu = byId("set-tiling"), box = byId("tiling-code");
  const changed = function () {
    if (readTiling()) useBox();
  };
  menu.addEventListener("change", function () {
    if (menu.value !== "own") box.value = menuTilings()[Number(menu.value)].code;
    changed();
  });
  box.addEventListener("change", function () {
    const k = menuTilings().findIndex(function (tiling) { return tiling.code === box.value.trim(); });
    menu.value = k === -1 ? "own" : String(k);
    changed();
  });
  for (const radio of document.querySelectorAll('input[name="cells-are"]')) radio.addEventListener("change", changed);
}

// Build the tiling the Lattice options say (tilingInUse), unless it is
// built already. Returns false, and says why under the code box, if the
// code isn't a tiling; otherwise the line names its kinds of corner. On
// pages that load js/sim-penrose.js, the code can also be a Penrose
// tiling's (PENROSE_TILINGS), which never repeats.
function readTiling() {
  const code = byId("tiling-code").value.trim(), corners = checked("cells-are") === "corners";
  if (tilingInUse && tilingInUse.code === code && tilingInUse.corners === corners) return true;
  const message = byId("tiling-message");
  try {
    const block = tilingBlock(code, corners);   // (js/sim-tilings.js)
    tilingInUse = { code: code, corners: corners, block: block };
    const hasTorus = Boolean(document.querySelector('input[name="domain"], #domain-choice'));   // (Random Walk has no domain)
    message.textContent = !block.finite ? "Its corners: " + block.vertexTypes.map(cornerShort).join(", ") + "." :
      "It never repeats" + (hasTorus ? ", so there is no torus" : "") + ", and its point of five-fold symmetry is in the middle." +
      (block.tilesOnly ? " Only its tiles can be the cells: the inner corner of a star or a boat touches just two tiles." : "");
    message.classList.remove("problem");
    return true;
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("problem");
    return false;
  }
}


/* =====================================================================
   2. THE GRAPH TOOL INSIDE A SIM PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page), from
   ../graph-tool/graph-tool.html?embed. The tool sends its drawing every time it
   changes (listenToTool, js/sim-page.js), and the line above it says,
   live, what is wrong with the drawing, if anything (showToolStatus).
   Done uses the drawing; Cancel goes back to the domain in use. The
   sim pauses while the tool is open, and after Cancel it carries on if
   it was playing.

   The page's HTML has the tool's box, id="custom-area" (hidden), with
   the line id="step-status", the buttons id="tool-done" and
   id="tool-cancel" (or class="tool-cancel"), and the <iframe>
   id="tool-frame".
   ===================================================================== */

// "page" has the page's own parts:
//   view                   the picture's view (js/sim-view.js)
//   isPlaying(), setPlaying(on)   whether the sim plays, and Play / Pause
//   check(drawing)         what the line says about a drawing, as
//                          [problem, good] (one of them ""); Done works
//                          only when there is no problem
//   done(drawing)          use the drawing (after Done)
//   cancel()               show the domain in use again (after Cancel)
// and, if needed:
//   showPicture()          hide or show the picture (tool.isOpen says
//                          which); without it, the canvas and its zoom
//                          buttons hide while the tool is open
//   onOpen()               more to do when the tool opens
//   buttons                the ids of the buttons that need a good
//                          drawing (["tool-done"] if left out)
// A drawing is { graph, grid, palette } (drawnDomain, in
// js/sim-domains.js, makes a domain of it). Returns the tool:
//   tool.open(), tool.close()   open or close it
//   tool.isOpen                 is it open?
//   tool.drawing                the latest drawing (null until it comes)
//   tool.check()                check the drawing again
//   tool.frame                  the <iframe>
function makeCustomTool(page) {
  const frame = byId("tool-frame");
  const tool = { isOpen: false, drawing: null, frame: frame };
  let wasPlaying = false;     // to carry on after Cancel

  function showPicture() {
    byId("custom-area").hidden = !tool.isOpen;
    if (page.showPicture) { page.showPicture(); return; }
    page.view.canvas.hidden = tool.isOpen;
    showZoomButtons(page.view);
  }

  tool.open = function () {
    wasPlaying = page.isPlaying();
    if (wasPlaying) page.setPlaying(false);
    tool.isOpen = true;
    showPicture();
    if (!frame.src) frame.src = "../graph-tool/graph-tool.html?embed";   // the first time only
    else frame.contentWindow.postMessage({ type: "unlock" }, "*");   // in case a sim locked it
    if (page.onOpen) page.onOpen();
    tool.check();
  };

  tool.close = function () {
    tool.isOpen = false;
    showPicture();
  };

  tool.check = function () {
    if (!tool.isOpen) return;
    const [problem, good] = tool.drawing ? page.check(tool.drawing) : ["Loading the drawing tool...", ""];
    showToolStatus(problem, good, page.buttons);
  };

  listenToTool(frame, function (drawing) { tool.drawing = drawing; tool.check(); });

  byId("tool-done").addEventListener("click", function () {
    tool.close();
    page.done(tool.drawing);
  });
  for (const button of document.querySelectorAll("#tool-cancel, .tool-cancel")) {
    button.addEventListener("click", function () {
      tool.close();
      page.cancel();
      if (wasPlaying) page.setPlaying(true);
    });
  }
  return tool;
}


/* =====================================================================
   3. DRAGGING, ZOOMING AND CLICKING THE PICTURE
   ---------------------------------------------------------------------
   The view (js/sim-view.js) moves and zooms the picture:
     drag                             move it
     mouse wheel, or pinch            zoom in or out, around the pointer
     the + / − / Reset buttons        zoom in, zoom out, show it all again
   On a hyperbolic tiling or tree, in the disk or the half-plane, one
   pointer drags across the plane instead (startPlaneDrag and dragPlane,
   js/sim-hyperbolic.js), and two fingers slide and zoom the picture.
   A press that hardly moves, with one pointer, is a click instead.
   ("Pointer" events cover the mouse, a pen and fingers alike.)
   ===================================================================== */

const CLICK_DISTANCE = 5;     // a press that moves less than this (in pixels) is a click, not a drag

// Telling a click from a drag: call press, move and release with each
// pointer event on the picture; release(event) says whether the press
// that just ended was a click (one pointer, which hardly moved).
function makeClickTracker() {
  const pressed = new Set();    // the pointers pressed on the picture (their ids)
  let pressedAt = null;         // where the first of them went down
  let dragged = false;          // true once it moved too far (or two fingers came down): not a click
  return {
    isPressed: function () { return pressed.size > 0; },
    press: function (event) {
      if (pressed.size === 0) { pressedAt = { x: event.clientX, y: event.clientY }; dragged = false; }
      pressed.add(event.pointerId);
      if (pressed.size > 1) dragged = true;           // two fingers: a pinch, not a click
    },
    // Returns false for a pointer that isn't pressed on the picture.
    move: function (event) {
      if (!pressed.has(event.pointerId)) return false;
      if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >= CLICK_DISTANCE) dragged = true;
      return true;
    },
    // Returns null for a pointer that wasn't pressed on the picture.
    release: function (event) {
      if (!pressed.delete(event.pointerId)) return null;
      return pressed.size === 0 && !dragged;
    },
  };
}

// Connect the picture of "view" (its canvas). "disk" is the page's disk
// view (js/sim-hyperbolic.js), or null on a page with no hyperbolic
// plane or tree, and onGraph() says whether the picture shows one right
// now. onClick(event) (optional) gets every click, with its pointer
// event. "cursor" (optional) is the mouse cursor over the picture, for
// example "pointer" (a pointing hand) where a click does something; it
// turns into a closed hand ("grabbing") while the picture is pressed.
function connectPicture(view, disk, onGraph, onClick, cursor) {
  const canvas = view.canvas;
  const clicks = makeClickTracker();
  // (On phones, a finger on a picture that can move drags it instead of
  // scrolling the page: "touch-action: none" in css/style.css.)

  // On a hyperbolic tiling or tree, exactly one pointer pressed drags
  // across the plane.
  function startDrag() {
    if (!disk) return;
    if (onGraph()) startPlaneDrag(disk);
    else disk.dragFrom = null;
  }

  canvas.addEventListener("pointerdown", function (event) {
    clicks.press(event);
    pressPointer(view, event);
    startDrag();
  });

  canvas.addEventListener("pointermove", function (event) {
    if (cursor) canvas.style.cursor = clicks.isPressed() ? "grabbing" : cursor;
    if (!clicks.move(event)) return;
    if (disk && disk.dragFrom && view.pointers.has(event.pointerId)) {
      view.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });   // where a second finger starts from
      dragPlane(disk, event.clientX, event.clientY);
      view.redraw();
    } else {
      movePointer(view, event);
    }
  });

  function release(event, mayClick) {
    const isClick = clicks.release(event);
    if (isClick === null) return;
    releasePointer(view, event);
    startDrag();
    if (mayClick && isClick && onClick) onClick(event);
  }
  canvas.addEventListener("pointerup", function (event) { release(event, true); });
  canvas.addEventListener("pointercancel", function (event) { release(event, false); });
}

// The cell under a pointer event on the picture (-1: none): with
// "onGraph" (a hyperbolic tiling or tree), the cell of ball d
// (ballCellUnder, js/sim-hyperbolic.js); otherwise the cell of domain d
// (cellUnder, js/sim-view.js).
function cellAtEvent(view, disk, d, onGraph, event) {
  return onGraph ? ballCellUnder(disk, d, event) : cellUnder(view, d, pointerSpot(view, event));
}

/* =====================================================================
   4. THE CLICKABLE GRID OF OFFSETS
   ---------------------------------------------------------------------
   As on the old site: a grid of small cells around a cell in the middle.
   An "offset" says where a cell is from the middle one: [x] in 1D, or
   [x, y] in 2D (x to the right, y up). Clicking a cell puts its offset
   in the set, or takes it out. Eden Growth picks its tile T
   this way, and the cellular automata their neighborhood.
   ===================================================================== */

// An offset's name, "x" in 1D or "x,y" in 2D (to look it up in a Set),
// and as it is shown, "x" or "(x, y)".
function offsetKey(t) { return t.length === 1 ? String(t[0]) : t[0] + "," + t[1]; }
function offsetText(t) { return t.length === 1 ? String(t[0]) : "(" + t[0] + ", " + t[1] + ")"; }

// Fill the box "grid" (a <div class="tile-grid">) with one small button
// per offset out to "reach" from the middle: a single row in 1D, a
// square in 2D (top row first, as y goes up). A cell is lit up when its
// offset is in the list "offsets", and clicking it calls
// setOffsets(the new list), which should show the grid again.
// The middle cell, offset 0: with center = "fixed" it is dark and can't
// be clicked (the mountain's site itself); with center = "clickable" it
// is outlined and can be clicked like the others (the cell itself, in a
// cellular automaton's neighborhood). "dim" is 1 or 2.
function showOffsetGrid(grid, dim, reach, offsets, setOffsets, center) {
  const inSet = new Set(offsets.map(offsetKey));
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = "repeat(" + (2 * reach + 1) + ", 1fr)";
  grid.classList.toggle("one-row", dim === 1);
  const top = dim === 1 ? 0 : reach;      // 1D: the one row y = 0
  for (let y = top; y >= -top; y--) {
    for (let x = -reach; x <= reach; x++) {
      const t = dim === 1 ? [x] : [x, y], key = offsetKey(t);
      const cell = document.createElement("button");
      cell.className = "tile-cell";
      grid.appendChild(cell);
      const middle = (x === 0 && y === 0);
      if (middle && center === "fixed") {
        cell.classList.add("center");
        cell.title = "the site itself";
        cell.disabled = true;
        continue;
      }
      if (middle) cell.classList.add("own");
      cell.title = middle ? "the cell itself" : offsetText(t);
      if (inSet.has(key)) cell.classList.add("on");
      cell.addEventListener("click", function () {
        setOffsets(inSet.has(key) ? offsets.filter(function (u) { return offsetKey(u) !== key; })
                                  : offsets.concat([t]));
      });
    }
  }
}
