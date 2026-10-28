/* =====================================================================
   sim-controls.js  —  the options and controls the sims on cells share
   ---------------------------------------------------------------------
   Most sims run on a domain of cells, and their pages have the same
   few controls for it:
     - the Domain options: Box, Torus, Custom (drawn in the graph tool),
       and on most sims "Hyperbolic plane or tree" (on the line: Segment
       and Cycle), and on some the whole plane (or line);
     - the graph tool itself, shown inside the page for Custom;
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
          domainOptionsHTML(settings)       the options themselves, written once
          connectDomains(page)              connect them: what each one does
          fillDomainOptions(defaults, most, ball) their values at the start
          onLine()                          is the domain on the line (1D)?
          sizeFromOptions(least, most, defaults)  the size they say
          boxFromOptions(least, most, defaults)   the box or torus they say
          tilingBoxFromOptions(tiling, ...)  the same, of a given tiling
        and the Lattice options, on pages that have them:
          connectLattice(onChange)          fill in and connect them
          onSquares()                       is the lattice the square grid (or the line)?
          onFiniteTiling()                  is it a tiling that never repeats?
          cornersCanBeCells()               can its corners be the cells?
          readTiling()                      the tiling the Lattice options say
     2. The graph tool inside a sim page
          makeCustomTool(view, player, parts)
          makeToolBox(title, help)          its box: the step bar and the <iframe>
          listenToTool(frame, useDrawing)   the drawings it sends
          showToolStatus(tool, problem, good)   the line that checks them
          atLeastTwoCells(drawing)          the usual check of a drawing
     3. The clickable grid of offsets
          offsetKey(t), offsetText(t)       an offset's name, and as shown
          showOffsetGrid(grid, dim, reach, offsets, setOffsets, center)
   ===================================================================== */


/* =====================================================================
   1. THE DOMAIN OPTIONS
   ---------------------------------------------------------------------
   Most pages hold an empty box for them under their "Domain" heading,
     <div class="domain-options" data-ticked="torus"></div>
   which this file fills in as the page loads (domainOptionsHTML). Its
   settings:
     data-ticked        the kind ticked at the start ("box", "torus", ...)
     data-least         the smallest size the size boxes go down to (2 if
                        left out)
     data-whole         (no value) the whole plane is offered too: "Whole
                        plane" (on the line "Whole line"), and on the
                        hyperbolic plane or tree the whole graph as well
                        as a ball. data-whole="flat": the whole plane, but
                        on the hyperbolic plane or tree only a ball
     data-dim="1"       a page on the line (1D): Segment, Cycle and the
                        size, and nothing else. A page with both (Eden
                        Growth's Dimension option) switches its options
                        with domains.setDim, which sets data-dim.
   Uniform Discrete Tiling writes its own options, with the same ids: its
   Cells menu has just squares, triangles and hexagons, and it has kinds
   of its own (the Aztec diamond, the hexagon of triangles).

   The radio buttons name="domain" pick the kind of domain, and every
   page uses the same ids for the options that go with each:
     whole        nothing more: no size
     box, torus   the boxes set-width and set-height (in the row
                  size-row; on the line only set-width)
     custom       the row custom-row, with the line custom-info and the
                  button edit-custom; the graph tool itself is section 2
     graph        the hyperbolic plane or tree: the rows in graph-rows
                  (js/sim-hyperbolic.js reads them), with data-whole
                  (not "flat") the radio buttons name="graph-region"
                  ("whole" or "ball")
   A page has only the options it offers, and can have its own kinds
   too (Uniform Discrete Tiling's Aztec diamond).

   THE LINE. A segment is a box one cell tall, and a cycle a torus one
   cell tall, so on the line the kinds are the same, with other names
   (DOMAIN_KINDS), and the size is one box.

   THE LATTICE. A page whose sim runs on any tiling (js/sim-tilings.js)
   also has, in the box lattice-rows: the menu set-tiling (the square
   grid, the other tilings with one or two kinds of corner, the Penrose
   tilings on pages that load js/sim-penrose.js, and "Your own code"),
   the box tiling-code with the line tiling-message under it, and the
   row cells-row with the radio buttons name="cells-are" (the tiles or
   the corners of the tiling are the cells). The square grid is the
   usual box or torus; any other tiling is a
   tilingBox (js/sim-domains.js), its size in side lengths. A Penrose
   tiling never repeats, so it has no torus: its Torus option hides.
   The cells-row hides where only the tiles can be cells: on the square
   grid, and on Penrose's first tiling (P1).
   ===================================================================== */

// The kinds of domain, in order, and their names on the line (1D) and
// in the plane (2D); "" where a kind isn't offered. "whole" shows only
// on pages with data-whole.
const DOMAIN_KINDS = [
  ["whole", "Whole line", "Whole plane"],
  ["box", "Segment", "Box"],
  ["torus", "Cycle", "Torus"],
  ["custom", "", "Custom (draw it)"],
  ["graph", "", "Hyperbolic plane or tree"],
];

fillBlocks(".domain-options", domainOptionsHTML);

// The Domain options, as HTML, from the placeholder's settings (above):
// the kinds and the size, and in 2D the Lattice options, the custom
// domain's row, and the hyperbolic plane or tree's rows.
function domainOptionsHTML(settings) {
  const oneD = (settings.dim === "1"), whole = ("whole" in settings);
  const rows = [kindsHTML(settings.ticked, oneD, whole), sizeRowHTML(settings.least || 2, oneD)];
  if (oneD) return rows.join("");
  rows.push(latticeRowsHTML());
  rows.push(customRowHTML(), graphRowsHTML(whole && settings.whole !== "flat"));
  return rows.join("");
}

// The kinds offered (with "ticked" ticked), each name in a <span> so it
// can change with the dimension (showKinds, in connectDomains).
function kindsHTML(ticked, oneD, whole) {
  const labels = DOMAIN_KINDS.map(function ([kind, lineName, planeName]) {
    const name = oneD ? lineName : planeName;
    if (!name || (kind === "whole" && !whole)) return "";
    return '<label><input type="radio" name="domain" value="' + kind + '"' + (kind === ticked ? " checked" : "") +
      "> <span>" + name + "</span></label>";
  });
  return '<div class="option-row">' + labels.join("") + "</div>";
}

// The size: boxes that go down to "least", one on the line, two (width
// and height) in the plane.
function sizeRowHTML(least, oneD) {
  function size(id) { return '<input type="number" id="' + id + '" min="' + least + '" step="1">'; }
  return '<div class="option-row" id="size-row">Size ' + size("set-width") +
    (oneD ? "" : '<span id="height-part"> &times; ' + size("set-height") + "</span>") + "</div>";
}

// The Lattice options (connectLattice reads them).
function latticeRowsHTML() {
  return '<div id="lattice-rows">' +
      '<div class="option-row">Lattice <select id="set-tiling"></select></div>' +
      '<div class="option-row">Code <input type="text" class="tiling-code" id="tiling-code" spellcheck="false" ' +
        'autocomplete="off"> <a class="small" href="' + SITE_ROOT + 'help/gomjau-hogg.html">how codes work</a></div>' +
      '<p class="muted small tiling-message" id="tiling-message"></p>' +
      '<div class="option-row" id="cells-row">Cells are the ' +
        '<label><input type="radio" name="cells-are" value="tiles" checked> tiles</label> ' +
        '<label><input type="radio" name="cells-are" value="corners"> corners</label></div>' +
    "</div>";
}

function customRowHTML() {
  return '<div class="option-row" id="custom-row" hidden><span id="custom-info"></span> ' +
    '<button class="tool-button" id="edit-custom">Edit custom domain</button></div>';
}

// The hyperbolic plane or tree's rows (js/sim-hyperbolic.js reads their
// ids): the graph, the ball (with "whole", a choice of the whole graph
// or the ball), and how it is drawn.
function graphRowsHTML(whole) {
  const radius = 'every cell within R = <input type="number" id="set-ball-radius" min="1" step="1"> steps of the start';
  const region = whole
    ? '<div class="option-row"><label><input type="radio" name="graph-region" value="whole" checked> ' +
        "Whole plane or tree</label></div>" +
      '<div class="option-row"><label><input type="radio" name="graph-region" value="ball"> Ball:</label> ' + radius + "</div>"
    : '<div class="option-row">Ball: ' + radius + "</div>";
  return '<div id="graph-rows" hidden>' +
      '<div class="option-row" id="graph-presets"></div>' +
      '<div class="option-row"><label><input type="radio" name="graph-kind" value="tiling" checked> Tiling {p, q}:</label> ' +
        'p <input type="number" id="set-p" min="3" max="12" step="1" value="7"> ' +
        'q <input type="number" id="set-q" min="3" max="12" step="1" value="3"></div>' +
      '<div class="option-row"><label><input type="radio" name="graph-kind" value="tree"> Tree, degree</label> ' +
        '<input type="number" id="set-degree" min="3" max="12" step="1" value="3"></div>' +
      '<p class="muted small" id="graph-info"></p>' +
      region +
      '<p class="muted small" id="ball-info"></p>' +
      '<div class="option-row">Drawn in ' +
        '<label><input type="radio" name="picture" value="disk" checked> the disk</label> ' +
        '<label><input type="radio" name="picture" value="half"> the half-plane</label> ' +
        '<label id="spread-choice"><input type="radio" name="picture" value="spread"> spread out</label></div>' +
    "</div>";
}

// Connect the Domain options. "page" has the page's own parts:
//   view, player   the picture's view (js/sim-view.js) and its Play /
//                  Pause (connectPlay, js/sim-page.js)
//   box()          the box or torus the options say (usually
//                  boxFromOptions, below)
//   use(d, extra)  start the sim on the new domain d (domains.kind says
//                  what kind it is); "extra" is whatever came with it
//                  (see domains.use)
// and, on pages that offer them:
//   whole()        the whole plane (or line) of the lattice in use
//   disk           the disk view (js/sim-hyperbolic.js)
//   ball()         the domain on the hyperbolic plane or tree the options
//                  say: a ball (usually ballFromOptions,
//                  js/sim-hyperbolic.js) or, with data-whole, maybe the
//                  whole graph; or null if they don't say one
//   custom         the graph tool's parts (makeCustomTool, section 2),
//                  "check" at least; "done" is left out unless the page
//                  does more than use the drawing, and info(d) (if
//                  given) is the line about the custom domain d
//   kinds          the page's own kinds, as { kind: function }: ticking
//                  one, or changing the size while it is ticked, calls
//                  its function, which then calls domains.use
//   show()         show the page's own options that change with the domain
// A picture on the line stays still; any other can be moved and zoomed.
// Returns "domains":
//   domains.kind          the kind in use: "whole", "box", "torus",
//                         "custom", "graph" or one of page.kinds
//   domains.custom        the last custom domain used (null until one is)
//   domains.tool          the graph tool (null on a page without Custom)
//   domains.use(kind, d, extra)   switch to the domain d of that kind:
//                         close the graph tool, start the sim on d
//                         (page.use(d, extra)), and show its options
//   domains.useBox()      switch to the box or torus the options say
//   domains.useTicked()   switch to the kind ticked on the page, as its
//                         options say (the page's start does this)
//   domains.setDim(dim)   switch the options to the line (1) or the
//                         plane (2), with their first kind ticked; then
//                         domains.useTicked() uses it
//   domains.show()        show the options that fit the domain in use
function connectDomains(page) {
  const domains = { kind: checked("domain"), custom: null, tool: null };
  function offers(kind) { return Boolean(radioOf(kind)); }
  function radioOf(kind) { return document.querySelector('input[name="domain"][value="' + kind + '"]'); }
  function closeTool() { if (domains.tool && domains.tool.isOpen) domains.tool.close(); }

  domains.use = function (kind, d, extra) {
    closeTool();
    domains.kind = kind;
    if (kind === "custom") domains.custom = d;
    useTorus(page.view, Boolean(d.wrap), !onLine());   // the whole picture again (js/sim-view.js)
    page.use(d, extra);
    domains.show();
  };

  // (On a Penrose tiling the torus is a box.)
  domains.useBox = function () {
    const d = page.box();
    domains.use(d.wrap ? "torus" : "box", d);
  };

  // The size and Lattice options belong to whichever kind is ticked: the
  // whole plane, one of the page's own, or else a box or torus.
  domains.useTicked = function () {
    const kinds = page.kinds || {}, ticked = checked("domain");
    if (ticked === "whole") domains.use("whole", page.whole());
    else if (kinds[ticked]) kinds[ticked]();
    else domains.useBox();
  };

  domains.setDim = function (dim) {
    const place = document.querySelector(".domain-options");
    place.dataset.dim = String(dim);
    place.querySelector('input[name="domain"]').checked = true;
  };

  // A domain on the hyperbolic plane or tree. If the options don't say
  // one, the domain in use stays.
  function useGraph() {
    closeTool();
    const ball = page.ball();
    if (ball === null) domains.show();
    else domains.use("graph", ball);
  }

  domains.show = function () {
    const kind = domains.kind, isCustom = (kind === "custom"), onGraph = (kind === "graph"), line = onLine();
    showKinds();
    radioOf(kind).checked = true;
    byId("size-row").hidden = isCustom || onGraph || kind === "whole";
    if (byId("height-part")) byId("height-part").hidden = line;
    if (byId("set-tiling")) {
      byId("lattice-rows").hidden = isCustom || onGraph || line;
      byId("cells-row").hidden = !cornersCanBeCells();
    }
    if (offers("custom")) {
      byId("custom-row").hidden = !isCustom;
      if (isCustom) byId("custom-info").textContent = page.custom.info ? page.custom.info(domains.custom)
        : "Your region: " + domains.custom.n + " cells" + (domains.custom.wrap ? ", on a torus." : ".");
    }
    if (offers("graph")) {
      byId("graph-rows").hidden = !onGraph;
      showDiskButtons(page.disk, onGraph && page.disk.picture !== "spread");
    }
    if (page.show) page.show();
  };

  // Name the kinds for the line or the plane (DOMAIN_KINDS), hiding the
  // ones it doesn't offer, and the torus of a tiling that never repeats.
  // (Not on a page that writes its own kinds.)
  function showKinds() {
    if (!document.querySelector(".domain-options")) return;
    for (const [kind, lineName, planeName] of DOMAIN_KINDS) {
      if (!offers(kind)) continue;
      const name = onLine() ? lineName : planeName, label = radioOf(kind).parentElement;
      label.lastChild.textContent = name;   // (its <span>)
      label.hidden = !name || (kind === "torus" && onFiniteTiling());
    }
  }

  for (const radio of document.querySelectorAll('input[name="domain"]')) {
    radio.addEventListener("change", function () {
      if (radio.value === "custom") domains.tool.open();
      else if (radio.value === "graph") useGraph();
      else domains.useTicked();
    });
  }
  for (const id of ["set-width", "set-height"]) {
    if (byId(id)) byId(id).addEventListener("change", domains.useTicked);
  }
  if (byId("set-tiling")) connectLattice(domains.useTicked);
  if (offers("custom")) {
    domains.tool = makeCustomTool(page.view, page.player, Object.assign({
      done: function (drawing) { domains.use("custom", drawnDomain(drawing.graph, drawing.grid)); },
      cancel: domains.show,
    }, page.custom));
    byId("edit-custom").addEventListener("click", domains.tool.open);
  }
  if (offers("graph")) {
    for (const id of ["set-p", "set-q", "set-degree", "set-ball-radius"]) byId(id).addEventListener("change", useGraph);
    for (const radio of document.querySelectorAll('input[name="graph-kind"], input[name="graph-region"]')) {
      radio.addEventListener("change", useGraph);
    }
    showGraphPresets(useGraph);
  }
  return domains;
}

// The options' values at the start: the box's size (defaults.width x
// defaults.height, at most "most" on a side; on the line just the
// width), and, with a "ball" (as in makeBall: its default
// radius R and largest radius "most"), the hyperbolic plane or tree's
// ball.
function fillDomainOptions(defaults, most, ball) {
  byId("set-width").value = defaults.width;
  byId("set-width").max = most;
  if (byId("set-height") && !onLine()) {
    byId("set-height").value = defaults.height;
    byId("set-height").max = most;
  }
  if (ball && byId("set-ball-radius")) {
    byId("set-ball-radius").value = ball.R;
    byId("set-ball-radius").max = ball.most;
  }
}

// Is the domain on the line (1D)? On a page on the line (data-dim="1"),
// and after domains.setDim(1) on a page with both.
function onLine() {
  const place = document.querySelector(".domain-options");
  return Boolean(place) && place.dataset.dim === "1";
}

// The size the options say, { width, height, torus }: whole numbers
// from "least" to "most" ("defaults" when a box is left empty), the
// height 1 on the line; torus is true when Torus (Cycle) is ticked and
// the lattice has one.
function sizeFromOptions(least, most, defaults) {
  return {
    width: readWhole("set-width", least, most, defaults.width),
    height: onLine() ? 1 : readWhole("set-height", least, most, defaults.height),
    torus: checked("domain") === "torus" && !onFiniteTiling(),
  };
}

// The box or torus the options say (sizeFromOptions, as a boxDomain,
// js/sim-domains.js): cells are neighbors when they share a side (on the
// line, the 2 beside each cell). On a lattice
// other than the square grid, the tiling in use (readTiling), as
// tilingBoxFromOptions gives it.
function boxFromOptions(least, most, defaults) {
  if (!onSquares()) return tilingBoxFromOptions(tilingInUse.block, least, most, defaults);
  const size = sizeFromOptions(least, most, defaults);
  return boxDomain(size.width, size.height, 4, size.torus);
}

// The box or torus the options say of a tiling's cells (tilingBox,
// js/sim-domains.js; "tiling" is its block, from tilingBlock in
// js/sim-tilings.js): the sides in side lengths, and at least
// SMALLEST_TILING_BOX of them, so it always has a cell.
function tilingBoxFromOptions(tiling, least, most, defaults) {
  const size = sizeFromOptions(Math.max(least, SMALLEST_TILING_BOX), most, defaults);
  return tilingBox(tiling, size.width, size.height, size.torus);
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

// Is the lattice the square grid? Always on a page with no Lattice
// options, and on the line, which is one row of squares. Its code is
// TILINGS[0]'s.
function onSquares() {
  return onLine() || !byId("set-tiling") || byId("set-tiling").value === "0";
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

// The Lattice options: the menu has the tilings of menuTilings()
// (js/sim-tilings.js) and "Your own code", and starts on the square
// grid. They call onChange (the page's box or torus) when they change.
// Choosing a tiling in the menu puts its code in the box; typing a code
// picks the tiling with that code from the menu, if there is one, and
// otherwise "Your own code". A code that isn't a tiling leaves the
// domain as it was, and the line under the box says what is wrong.
function connectLattice(onChange) {
  const menu = byId("set-tiling"), box = byId("tiling-code");
  addTilingOptions(menu);   // (js/sim-tilings.js)
  menu.appendChild(new Option("Your own code", "own"));
  menu.value = "0";
  box.value = TILINGS[0].code;
  readTiling();

  const changed = function () {
    if (readTiling()) onChange();
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
    const hasTorus = Boolean(document.querySelector('input[name="domain"]'));   // (Random Walk has no domain)
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
   ../graph-tool/graph-tool.html?embed. The tool sends its drawing every
   time it changes (listenToTool), and the line above it says, live,
   what is wrong with the drawing, if anything (showToolStatus). Done
   uses the drawing; Cancel goes back to the domain in use. The sim
   pauses while the tool is open, and after Cancel it carries on if it
   was playing.

   The tool's box (makeToolBox) goes right under the picture's box,
   hidden until the tool opens: a bar with a title, a line saying what
   to draw, that live check, and the buttons Done and Cancel, above the
   tool itself.
   ===================================================================== */

// The graph tool of the picture "view" (js/sim-view.js), on a page with
// Play / Pause "player" (connectPlay, js/sim-page.js). "parts" are the
// page's own:
//   check(drawing)   what the line says about a drawing, as [problem,
//                    good] (one of them ""); Done works only when there
//                    is no problem
//   done(drawing)    use the drawing (after Done)
//   cancel()         show the domain in use again (after Cancel)
// and, if needed:
//   title, help      the bar's title and what to draw, said under it,
//                    if not "Draw the region" and DEFAULT_TOOL_HELP
//   showPicture()    hide or show the picture (tool.isOpen says which);
//                    without it, the canvas and its zoom buttons hide
//                    while the tool is open
//   onOpen()         more to do when the tool opens
// A drawing is { graph, grid, palette } (drawnDomain, in
// js/sim-domains.js, makes a domain of it). Closing the tool draws the
// picture again. Returns the tool:
//   tool.open(), tool.close()   open or close it
//   tool.isOpen                 is it open?
//   tool.drawing                the latest drawing (null until it comes)
//   tool.check()                check the drawing again
//   tool.frame                  the <iframe>
//   tool.title, tool.help       the bar's title and help lines, and its
//   tool.row, tool.doneButton   row of buttons and Done in it (Connected
//   tool.goodButtons            Coloring's two steps change them); the
//                               buttons that work only with a good
//                               drawing ([tool.doneButton] at first)
const DEFAULT_TOOL_HELP = "Paint the cells (any color counts); neighboring cells interact. Then press Done.";
function makeCustomTool(view, player, parts) {
  const tool = Object.assign({ isOpen: false, drawing: null },
                             makeToolBox(parts.title || "Draw the region", parts.help || DEFAULT_TOOL_HELP));
  let wasPlaying = false;     // to carry on after Cancel

  function showPicture() {
    tool.box.hidden = !tool.isOpen;
    if (parts.showPicture) { parts.showPicture(); return; }
    view.canvas.hidden = tool.isOpen;
    showZoomButtons(view);
  }

  tool.open = function () {
    wasPlaying = player.playing;
    if (wasPlaying) player.setPlaying(false);
    tool.isOpen = true;
    showPicture();
    if (!tool.frame.src) tool.frame.src = "../graph-tool/graph-tool.html?embed";   // the first time only
    else tool.frame.contentWindow.postMessage({ type: "unlock" }, "*");   // in case a sim locked it
    if (parts.onOpen) parts.onOpen();
    tool.check();
  };

  tool.close = function () {
    tool.isOpen = false;
    showPicture();
    view.redraw();
  };

  tool.check = function () {
    if (!tool.isOpen) return;
    const [problem, good] = tool.drawing ? parts.check(tool.drawing) : ["Loading the drawing tool...", ""];
    showToolStatus(tool, problem, good);
  };

  listenToTool(tool.frame, function (drawing) { tool.drawing = drawing; tool.check(); });

  tool.doneButton = toolButton("Done", function () {
    tool.close();
    parts.done(tool.drawing);
  });
  tool.goodButtons = [tool.doneButton];
  tool.row.append(tool.doneButton, toolButton("Cancel", function () {
    tool.close();
    parts.cancel();
    if (wasPlaying) player.setPlaying(true);
  }));
  view.canvas.parentElement.after(tool.box);   // right under the picture's box
  return tool;
}

// The tool's box, hidden: the bar (the title, the line of help, the
// live check "status", and an empty row for the buttons) above the
// <iframe> "frame" the tool loads in. Returns those parts, and the
// whole "box".
function makeToolBox(title, help) {
  const box = document.createElement("div");
  box.hidden = true;
  box.innerHTML =
    '<div class="step-bar"><p class="step-title"></p><p class="muted step-help"></p>' +
    '<p class="step-status"></p><div class="option-row"></div></div>' +
    '<iframe class="tool-frame" title="Graph and domain tool"></iframe>';
  const [titleLine, helpLine, status, row] = box.firstChild.children;
  titleLine.textContent = title;
  helpLine.textContent = help;
  return { box: box, title: titleLine, help: helpLine, status: status, row: row, frame: box.lastChild };
}

// Listen to the tool in the iframe "frame". It says how tall it is (so
// the iframe fits it exactly), and every time the drawing changes it
// sends the drawing, { graph, grid, palette }, which is handed on to
// useDrawing.
function listenToTool(frame, useDrawing) {
  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message.type === "height") frame.style.height = message.height + "px";
    if (message.type === "graph") useDrawing(message);
  });
}

// The line above the tool: what's wrong with the drawing (in red), or a
// tick and what's good about it (in green). The buttons that use the
// drawing (tool.goodButtons) work only when nothing is wrong.
function showToolStatus(tool, problem, good) {
  tool.status.textContent = problem || "✓ " + good;   // ✓ is a tick mark
  tool.status.className = "step-status " + (problem ? "problem" : "ok");
  for (const button of tool.goodButtons) button.disabled = Boolean(problem);
}

// The usual check of a drawing: any region of at least two cells, even
// in several pieces.
function atLeastTwoCells(drawing) {
  const cells = drawing.graph.vertices.length;
  return cells < 2 ? ["Paint at least two cells.", ""] : ["", cells + " cells."];
}


/* =====================================================================
   3. THE CLICKABLE GRID OF OFFSETS
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
