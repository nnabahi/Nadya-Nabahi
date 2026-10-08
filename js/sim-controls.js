/* =====================================================================
   sim-controls.js  —  the options and controls the sims on cells share
   ---------------------------------------------------------------------
   Most sims run on a domain of cells, and their pages have the same
   few controls for it:
     - the Domain options: Box, Torus, Custom (drawn in the graph tool),
       and on most sims "Hyperbolic plane or tree";
     - the graph tool itself, shown inside the page for Custom;
     - a picture you can drag, zoom and click.
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
     2. The graph tool inside a sim page
          makeCustomTool(page)
     3. Dragging, zooming and clicking the picture
          connectPicture(view, disk, onGraph, onClick, cursor)
   ===================================================================== */


/* =====================================================================
   1. THE DOMAIN OPTIONS
   ---------------------------------------------------------------------
   Every page uses the same ids: the radio buttons name="domain", the
   boxes set-width, set-height and set-neighbors (in the rows size-row
   and neighbors-row), the row custom-row with custom-info and the
   button edit-custom, and for the hyperbolic plane or tree the rows in
   graph-rows (js/sim-hyperbolic.js reads them).
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
function boxFromOptions(least, most, defaults) {
  const width = readWhole("set-width", least, most, defaults.width);
  const height = readWhole("set-height", least, most, defaults.height);
  const neighbors = byId("set-neighbors") ? Number(byId("set-neighbors").value) : 4;
  return boxDomain(width, height, neighbors, checked("domain") === "torus");
}


/* =====================================================================
   2. THE GRAPH TOOL INSIDE A SIM PAGE
   ---------------------------------------------------------------------
   Choosing "Custom" swaps the picture for the graph tool, loaded in an
   <iframe> (a page inside this page) from the same folder, as
   graph-tool.html?embed. The tool sends its drawing
   every time it changes (listenToTool, js/sim-page.js), and the line
   above it says, live, what is wrong with the drawing, if anything
   (showToolStatus). Done uses the drawing; Cancel goes back to the
   domain in use. The sim pauses while the tool is open, and after
   Cancel it carries on if it was playing.

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
//   tool.carryOn()              play again, if it was playing when the
//                               tool opened
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
    if (!frame.src) frame.src = "graph-tool.html?embed";   // the first time only
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

  tool.carryOn = function () { if (wasPlaying) page.setPlaying(true); };

  listenToTool(frame, function (drawing) { tool.drawing = drawing; tool.check(); });

  byId("tool-done").addEventListener("click", function () {
    tool.close();
    page.done(tool.drawing);
  });
  for (const button of document.querySelectorAll("#tool-cancel, .tool-cancel")) {
    button.addEventListener("click", function () {
      tool.close();
      page.cancel();
      tool.carryOn();
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

// Connect the picture of "view" (its canvas). "disk" is the page's disk
// view (js/sim-hyperbolic.js), or null on a page with no hyperbolic
// plane or tree, and onGraph() says whether the picture shows one right
// now. onClick(event) (optional) gets every click, with its pointer
// event. "cursor" (optional) is the mouse cursor over the picture, for
// example "pointer" (a pointing hand) where a click does something; it
// turns into a closed hand ("grabbing") while the picture is pressed.
function connectPicture(view, disk, onGraph, onClick, cursor) {
  const canvas = view.canvas;
  const pressed = new Set();    // the pointers pressed on the picture (their ids)
  let pressedAt = null;         // where the first of them went down
  let dragged = false;          // true once it moved too far (or two fingers came down): not a click
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
    if (pressed.size === 0) { pressedAt = { x: event.clientX, y: event.clientY }; dragged = false; }
    pressed.add(event.pointerId);
    if (pressed.size > 1) dragged = true;           // two fingers: a pinch, not a click
    pressPointer(view, event);
    startDrag();
  });

  canvas.addEventListener("pointermove", function (event) {
    if (cursor) canvas.style.cursor = pressed.size > 0 ? "grabbing" : cursor;
    if (!pressed.has(event.pointerId)) return;
    if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >= CLICK_DISTANCE) dragged = true;
    if (disk && disk.dragFrom && view.pointers.has(event.pointerId)) {
      view.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });   // where a second finger starts from
      dragPlane(disk, event.clientX, event.clientY);
      view.redraw();
    } else {
      movePointer(view, event);
    }
  });

  function release(event, isClick) {
    if (!pressed.delete(event.pointerId)) return;
    releasePointer(view, event);
    startDrag();
    if (isClick && onClick && pressed.size === 0 && !dragged) onClick(event);
  }
  canvas.addEventListener("pointerup", function (event) { release(event, true); });
  canvas.addEventListener("pointercancel", function (event) { release(event, false); });
}
