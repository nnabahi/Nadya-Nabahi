/* =====================================================================
   sim-page.js  —  small helpers that every sim page uses
   ---------------------------------------------------------------------
   Each sim page loads this file before its own code, so these helpers
   are written once instead of being copied into every sim.

   Contents:
     byId(id)                         the element with that id="..."
     checked(name)                    which radio button of a group is ticked
     showMessage(text)                a line of text under the picture
     toolButton(label, onClick, title)   a small button, made in the code
     swatch(color)                    a small square of a color, as HTML
     colorRow(color, label, cells)    a row of a statistics table, with a swatch
     colorShareRows(names, ...)       a coloring's table: cells, share, regions
     readWhole(id, lo, hi, fallback)  a whole number typed in a box
     startWorker(fn, helpers)         run a function in a second thread
     runInWorker(fn, helpers, show)   a sim's second thread, with its runs
     keepAlong(kept, more, at)        add numbers a second thread sent to a list
     sharpPen(canvas, width, height)  a canvas's pen, sharp on sharp screens
     oncePerFrame(draw)               draw at the next screen refresh
     notTooOften(gap, busy, draw)     draw at most every "gap" ms while busy
     the Play, Speed and Seed rows    written once, filled in as the page loads
     buttonHTML(id, label, title)     a small button, as HTML
     showPlaying(on)                  the Play button, while it plays
     speedText(speed, one, many)      "5 moves per second", for the Speed slider
     addRangeBoxes(slider, lo, hi, ...)  "min" and "max" boxes at a slider's ends
     connectSpeedSlider(id, speeds, ...) a Speed slider with those boxes
     connectSliderAndBox(slider, box, set)   a number's slider and box, moving together
     connectPlay(runner, ...)         Play / Pause, Step, Restart and Speed
     connectSeed(onChange)            the Seed box and its New seed button
     pictureHeight(normal)            how tall to draw the picture (taller
                                        in the full screen popup)
     make3D(canvas, height, options)  the 3D view (js/sim-3d.js), loaded when it first shows
     connectStretch(onChange)         the 3D view's Heights slider

   It also fits the statistics into their L-shaped box, typesets the
   formulas in the About box (so a page that has formulas loads KaTeX
   before this file), makes the About tabs work, and puts the full
   screen button on the picture (all at the end of this file). The small charts are in js/sim-charts.js.
   ===================================================================== */


// The element with id="...". (Short for document.getElementById.)
function byId(id) { return document.getElementById(id); }

// Which radio button of a group is ticked: its value="...". For example
// checked("domain") is "box", "torus" or "custom".
function checked(name) { return document.querySelector('input[name="' + name + '"]:checked').value; }

// Show a line of text in the page's <p id="sim-message">, e.g. if the
// sim can't start. An empty text clears it.
function showMessage(text) { byId("sim-message").textContent = text; }

// A small button (class "tool-button") with the words "label", that
// calls onClick() when clicked; "title", if given, shows when the mouse
// rests on it. For buttons the code makes, like the zoom buttons.
function toolButton(label, onClick, title) {
  const button = document.createElement("button");
  button.className = "tool-button";
  button.textContent = label;
  if (title) button.title = title;
  button.addEventListener("click", onClick);
  return button;
}

// A small square of a color ("#rrggbb"), as HTML, to go before a
// color's name in a table or a list.
function swatch(color) { return '<span class="swatch-small" style="background:' + color + '"></span>'; }

// One row of a statistics table, as HTML: a color's swatch and label,
// then the other cells.
function colorRow(color, label, cells) {
  return "<tr><td>" + swatch(color) + label + "</td><td>" + cells.join("</td><td>") + "</td></tr>";
}

// The rows of a coloring's table, one per color c (drawn in names[c]):
// its number, c + first; how many of the "total" cells have it, and
// their share; and how many regions (connected pieces) it has.
function colorShareRows(names, first, counts, total, regions) {
  let rows = "";
  names.forEach(function (name, c) {
    rows += colorRow(name, c + first, [counts[c].toLocaleString(), (100 * counts[c] / total).toFixed(1) + "%",
                                       regions[c].toLocaleString()]);
  });
  return rows;
}

// A whole number from a box, kept between lo and hi (else "fallback").
// The box is updated to show the number actually used.
function readWhole(id, lo, hi, fallback) {
  const box = byId(id);
  let v = Math.round(Number(box.value));
  if (!isFinite(v) || box.value === "") v = fallback;
  v = Math.min(Math.max(v, lo), hi);
  box.value = v;
  return v;
}

// Run the function "fn" in a second thread (a "Web Worker"), so the
// page never freezes while it works. A worker is normally made from a
// file's address, which browsers refuse for pages opened straight from
// the computer (file://). So the function's own text is wrapped in a
// "Blob" (a file made in memory) and the worker is made from that; it
// works both ways. "helpers" (optional) is a list of other functions
// the worker uses, and of constants it uses, given as objects like
// { PHI: PHI }; their text is put in first, so "fn" can use them.
function startWorker(fn, helpers) {
  const parts = (helpers || []).map(function (helper) {
    if (typeof helper === "function") return helper.toString() + "\n";
    return Object.keys(helper).map(function (name) { return "const " + name + " = " + sourceOf(helper[name]) + ";\n"; }).join("");
  });
  parts.push("(" + fn.toString() + ")();");
  const code = new Blob(parts, { type: "text/javascript" });
  return new Worker(URL.createObjectURL(code));
}

// JavaScript text that makes "value" again: a number, a text, true or
// false, a function, or a list or an object of those (for startWorker).
function sourceOf(value) {
  if (typeof value === "function") return value.toString();
  if (Array.isArray(value)) return "[" + value.map(sourceOf).join(", ") + "]";
  if (value !== null && typeof value === "object") {
    return "{ " + Object.keys(value).map(function (key) { return JSON.stringify(key) + ": " + sourceOf(value[key]); }).join(", ") + " }";
  }
  return JSON.stringify(value);
}


// A sim's second thread often sends only what is new since its last
// message (Eden Growth's sites on a graph, Random Walk's visited
// sites). keepAlong copies "more" into the list "kept" (a typed list,
// like a Float64Array) from position "at" on, making the list bigger
// first if it has to be (twice as big, so this happens rarely), and
// returns the list.
function keepAlong(kept, more, at) {
  if (at + more.length > kept.length) {
    const bigger = new kept.constructor(Math.max(at + more.length, 2 * kept.length));
    bigger.set(kept);
    kept = bigger;
  }
  kept.set(more, at);
  return kept;
}


/* ---------------------------------------------------------------------
   Running: drawing, Play, Speed and Seed
   --------------------------------------------------------------------- */

// Get a canvas ready to draw on, "width" by "height" screen pixels (left
// out: its size on the page now), and return its pen, which draws in
// screen pixels. A sharp screen has several pixels per screen pixel
// (window.devicePixelRatio, often 2), and the canvas gets as many, so
// the picture stays sharp. A height given is also the canvas's height
// on the page. (Resizing a canvas also clears it.)
function sharpPen(canvas, width, height) {
  const ratio = window.devicePixelRatio || 1;
  if (width === undefined) width = canvas.clientWidth;
  if (height === undefined) height = canvas.clientHeight;
  else canvas.style.height = height + "px";
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  return pen;
}

// A function that draws at the browser's next screen refresh, at most
// once per refresh however often it is called (for example by every
// message from a sim's second thread). "draw" does the drawing.
function oncePerFrame(draw) {
  let pending = false;
  return function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      draw();
    });
  };
}

// A function that draws, but while busy() is true at most once every
// "gap" milliseconds (for charts that take a while to draw, while the
// sim plays), and every time when it isn't.
function notTooOften(gap, busy, draw) {
  let last = -Infinity;
  return function () {
    const now = performance.now();
    if (busy() && now - last < gap) return;
    last = now;
    draw();
  };
}

// The Play, Speed and Seed rows, written once. A sim page holds empty
// rows where they go, which are filled in as the page loads:
//   <div class="option-row play-row" data-step="One sweep" data-restart="Back to the start, same seed"></div>
//       Play, Step and Restart (before any of the page's own buttons
//       already in the row); data-play, data-step and data-restart say
//       what each one does, shown when the mouse rests on it
//   <div class="option-row speed-row"></div>
//       the Speed slider, and the label after it saying how fast
//   <div class="option-row seed-row"></div>
//       the Seed box, and its button: "New seed" ("A random new seed"),
//       or data-new (data-new-title) instead
// connectPlay and connectSeed (below) make them work.
fillBlocks(".play-row", function (settings) {
  return buttonHTML("play", "Play", settings.play) + buttonHTML("step", "Step", settings.step) +
    buttonHTML("restart", "Restart", settings.restart);
});
fillBlocks(".speed-row", function () {
  return 'Speed <input type="range" class="wide-range" id="speed" min="0" step="1"> <span class="muted" id="speed-label"></span>';
});
fillBlocks(".seed-row", function (settings) {
  return 'Seed <input type="text" id="seed" size="8"> ' +
    buttonHTML("new-seed", settings.new || "New seed", settings.newTitle || "A random new seed");
});

// A small button (class "tool-button"), as HTML: id="id", the words
// "label", and "title" (if given) shown when the mouse rests on it.
function buttonHTML(id, label, title) {
  return '<button class="tool-button" id="' + id + '"' + (title ? ' title="' + title + '"' : "") + ">" + label + "</button>";
}

// The Play button (id="play") says "Pause" and looks pressed while the
// sim plays.
function showPlaying(on) {
  const button = byId("play");
  button.textContent = on ? "Pause" : "Play";
  button.classList.toggle("selected", on);
}

// A speed for the label next to the Speed slider: "5 moves per second"
// (one = "move", many = "moves"), or "as fast as possible" for Infinity.
function speedText(speed, one, many) {
  if (speed === Infinity) return "as fast as possible";
  return speed.toLocaleString() + " " + (speed === 1 ? one : many) + " per second";
}

// Editable "min" and "max" boxes at the two ends of a slider, like
// Desmos's. A long slider range makes a slider jump (2, 5, 10, ... at a
// time, as each pixel is many steps), so typing a smaller range in the
// boxes lets it move one step at a time (its own step, 1 for whole
// numbers). lo and hi are the starting range. With extraNotch, the
// slider goes one step past "max" (for "as fast as possible").
// onChange() runs when a box changes the range (the browser may have
// moved the slider's value to stay inside it).
function addRangeBoxes(slider, lo, hi, onChange, extraNotch) {
  const step = Number(slider.step) || 1;
  const floor = slider.min === "" ? -Infinity : Number(slider.min);   // the lowest "min" allowed
  function box(value, title) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "range-end";
    input.step = step;
    input.value = value;
    input.title = title;
    input.addEventListener("change", setRange);
    return input;
  }
  const low = box(lo, "The slider's left end (min)");
  const high = box(hi, "The slider's right end (max)");
  slider.before(low);
  slider.after(high);
  let range = [lo, hi];            // the last good range, kept if a box gets nonsense
  function setRange() {
    const a = Number(low.value), b = Number(high.value);
    if (low.value !== "" && high.value !== "" && a >= floor && a < b) range = [a, b];
    low.value = range[0];
    high.value = range[1];
    slider.min = range[0];
    slider.max = extraNotch ? range[1] + step : range[1];
    if (onChange) onChange();
  }
  const keep = onChange;
  onChange = null;                 // no onChange for the first setRange
  setRange();
  onChange = keep;
}

// A Speed slider (or a rate slider like it): its value is the speed
// itself, from "min" to "max" (boxes at its ends, addRangeBoxes) in
// steps of 1 (or of the slowest speed, if that is less than 1).
//   id          the slider's id="..."
//   speeds      the slowest and fastest speeds are its starting range;
//               if the list ends in Infinity, one notch past "max" is
//               "as fast as possible"
//   startSpeed  where it starts
//   onChange(speed)  runs whenever it moves, and once at the start
function connectSpeedSlider(id, speeds, startSpeed, onChange) {
  const slider = byId(id);
  const finite = speeds.filter(isFinite);
  const fastest = speeds[speeds.length - 1] === Infinity;
  const slowest = finite[0], top = finite[finite.length - 1];
  slider.step = Math.min(1, slowest);
  slider.min = Math.min(1, slowest);   // "min" can't go below one step
  function read() {
    const value = Number(slider.value);
    onChange(fastest && value > Number(slider.max) - Number(slider.step) / 2 ? Infinity : value);
  }
  addRangeBoxes(slider, slowest, top, read, fastest);
  slider.value = startSpeed === Infinity ? slider.max : startSpeed;
  slider.addEventListener("input", read);
  read();
}

// A number set by a slider and the number box beside it, which move
// together like a Desmos slider: dragging the slider, or typing in the
// box (once it is done), calls set(value) with the new number. Returns
// show(value), for "set" to call first: it keeps the number between
// the box's min and max (the box may reach past the slider's ends),
// whole if the box's step is whole, shows it in both (the box with at
// most 4 decimals), and returns it.
function connectSliderAndBox(sliderId, boxId, set) {
  const slider = byId(sliderId), box = byId(boxId);
  slider.addEventListener("input", function () { set(slider.value); });
  box.addEventListener("change", function () { set(box.value); });
  return function show(value) {
    const lo = box.min === "" ? -Infinity : Number(box.min), hi = box.max === "" ? Infinity : Number(box.max);
    let v = Math.min(Math.max(Number(value) || 0, lo), hi);
    if (Number.isInteger(Number(box.step))) v = Math.round(v);
    slider.value = v;
    box.value = Number(v.toFixed(4));
    return v;
  };
}

// A sim's second thread, as the page sees it. The worker is made from
// "fn" and "helpers" as in startWorker; its run loop and its messages
// are serveRun's (js/sim-worker.js), which is added to the helpers
// here, with makeRunLoop. show(message) gets each report of the
// current run, to draw it. Returns "sim":
//   sim.setup(settings)   a new run from the start, with these settings
//                         (named values for the worker's setup); a new
//                         run starts paused
//   sim.send(message)     one of the sim's own messages (new settings
//                         that don't restart, a click, ...)
//   sim.play(speed), sim.pause(), sim.step(), sim.stopped
//                         for connectPlay, which sets sim.stopped
// A burst of setups (from a slider being dragged) never piles up: while
// the worker works on one, only the newest of the later ones waits, and
// the messages sent after it wait behind it. (A newer setup replaces
// them too: they were for a run that never starts, and every setup
// carries all the page's settings.)
function runInWorker(fn, helpers, show) {
  const worker = startWorker(fn, [makeRunLoop, serveRun].concat(helpers || []));
  const sim = { run: 0 };    // counts setups, so leftovers of an older run are skipped
  let playId = 0;            // counts presses of Play and Pause (see serveRun)
  let working = 0;           // the run whose setup the worker is working on (0: none)
  let waiting = [];          // the newest setup not sent yet, and the messages after it

  function post(message) {
    if (waiting.length) waiting.push(message); else worker.postMessage(message);
  }
  function sendWaiting() {
    if (!waiting.length || working) return;
    working = waiting[0].run;
    for (const message of waiting) worker.postMessage(message);
    waiting = [];
  }

  sim.setup = function (settings) {
    sim.run++;
    waiting = [Object.assign({ type: "setup", run: sim.run }, settings)];
    sendWaiting();
    if (sim.stopped) sim.stopped();    // (serveRun pauses it)
  };
  sim.send = post;
  sim.play = function (speed) { post({ type: "play", speed: speed, id: ++playId }); };
  sim.pause = function () { post({ type: "pause", id: ++playId }); };
  sim.step = function () { post({ type: "step" }); };

  worker.onmessage = function (event) {
    const message = event.data;
    if (message.run === working) { working = 0; sendWaiting(); }
    if (message.run !== sim.run) return;                        // from an older run
    if (!message.playing && message.playId === playId && sim.stopped) sim.stopped();   // it paused by itself
    show(message);
  };
  worker.onerror = function () {
    working = 0;
    showMessage("The sim couldn't start. It loads small libraries from the internet (cdn.jsdelivr.net), " +
                "so check the connection and reload the page.");
  };
  return sim;
}

// Play / Pause, Step, Restart and the Speed slider, for a sim's run loop
// (makeRunLoop, js/sim-worker.js), wherever it runs: "runner" is a sim
// running in a second thread (runInWorker), or the loop itself, for a
// sim that runs on the page.
//   speeds      the Speed slider's slowest and fastest speeds, per
//               second, ending in Infinity for "as fast as possible"
//               (connectSpeedSlider); startSpeed is where it starts
//   one, many   what one step is called, e.g. "sweep" and "sweeps"
//   restart()   starts the run again from the start, paused (in a
//               second thread, sim.setup pauses it; on the page,
//               restart() pauses it itself)
// Returns "player":
//   player.playing           true while the sim plays
//   player.setPlaying(on)    play or pause
//   player.setUnits(one, many)   new names for a step
// Step pauses, then makes one step. When the run pauses by itself (it
// can't go on), the Play button shows it.
function connectPlay(runner, speeds, startSpeed, one, many, restart) {
  const player = { playing: false };
  let speed = startSpeed;

  function showPlay(on) {
    player.playing = on;
    showPlaying(on);
  }
  function showSpeed() { byId("speed-label").textContent = speedText(speed, one, many); }

  player.setPlaying = function (on) {
    showPlay(on);
    if (on) runner.play(speed); else runner.pause();
  };
  player.setUnits = function (newOne, newMany) {
    one = newOne;
    many = newMany;
    showSpeed();
  };
  runner.stopped = function () { showPlay(false); };

  byId("play").addEventListener("click", function () { player.setPlaying(!player.playing); });
  byId("step").addEventListener("click", function () {
    if (player.playing) player.setPlaying(false);
    runner.step();
  });
  byId("restart").addEventListener("click", function () { restart(); });
  connectSpeedSlider("speed", speeds, startSpeed, function (newSpeed) {
    speed = newSpeed;
    showSpeed();
    if (player.playing) runner.play(speed);
  });
  showPlay(false);    // every sim starts paused
  return player;
}

// The Seed box (id="seed") and its "New seed" button (id="new-seed"):
// the same seed gives the same run every time, and New seed picks a
// random one. Either way onChange() runs.
function connectSeed(onChange) {
  byId("seed").addEventListener("change", function () { onChange(); });
  byId("new-seed").addEventListener("click", function () {
    byId("seed").value = String(Math.floor(Math.random() * 100000));
    onChange();
  });
}


/* ---------------------------------------------------------------------
   The 3D view
   ---------------------------------------------------------------------
   The sims with a 3D view (Eden Growth, Sandpiles, Lattice Path
   Counting, Random Walk) load js/sim-3d.js only when you first pick
   "3D", since it needs the library three.js from the internet.
   --------------------------------------------------------------------- */

// Where js/sim-3d.js is, as a full web address worked out now, while
// this file loads: it sits next to this file (js/sim-page.js). Browsers
// don't agree on what a plain "./sim-3d.js" inside import() is counted
// from (this file, or the page), so the full address avoids guessing.
const SIM_3D_URL = new URL("sim-3d.js", document.currentScript.src).href;

// The 3D view of the sim whose flat picture is "canvas": a box right
// after the canvas, with a "Reset view" button in the picture's top
// right corner, both hidden until three.show(true). It is "height"
// pixels tall on the page (in the full screen popup, as tall as that:
// pictureHeight), also after the window changes size. "options":
//   ready()    runs once it has loaded (the page then draws it)
//   failed()   (optional) runs if it couldn't load; the View goes back
//              to "flat", and the message under the picture says why
//   reset()    (optional) what Reset view does, if not look from the
//              starting angle again
// Returns "three":
//   three.code       the 3D code (js/sim-3d.js), and
//   three.view       the 3D picture, both null until it has loaded
//   three.show(on)   show or hide it; the first time it shows, it loads
function make3D(canvas, height, options) {
  const three = { code: null, view: null };
  const box = document.createElement("div");
  box.className = "sim-3d";
  const buttons = document.createElement("div");
  buttons.className = "zoom-buttons";
  buttons.append(toolButton("Reset view", function () {
    if (!three.view) return;
    if (options.reset) options.reset(); else three.code.resetCamera(three.view);
  }, "Look from the starting angle again"));
  canvas.after(box, buttons);
  let loading = false;

  async function load() {
    loading = true;
    showMessage("Loading the 3D view...");
    try {
      three.code = await import(SIM_3D_URL);
    } catch (error) {
      loading = false;
      const flat = document.querySelector('input[name="view"][value="flat"]');   // (a page with a View choice goes back to "flat")
      if (flat) flat.checked = true;
      if (options.failed) options.failed();
      // The browser's own words go at the end, to help find what went wrong.
      showMessage("The 3D view couldn't load. It needs the library three.js from the " +
                  "internet, so check the connection and try again. (The browser said: " +
                  error.message + ")");
      return;
    }
    showMessage("");
    three.view = three.code.make3DView(box, pictureHeight(height));
    options.ready();
  }

  three.show = function (on) {
    box.hidden = buttons.hidden = !on;
    if (on && !three.view && !loading) load();
  };
  window.addEventListener("resize", function () {
    if (three.view) three.code.setHeight(three.view, pictureHeight(height));
  });
  three.show(false);
  return three;
}

// How to move the 3D view, said once: a page holds
// <p class="muted small help-3d"></p> where it goes (before any words
// of the page's own in it).
fillBlocks(".help-3d", function () {
  return "Drag to turn it around, use the mouse wheel or a pinch to zoom, " +
    "and right-drag (or two fingers) to slide it.";
});

// The Heights slider (id="stretch", from -4 to 4) of a 3D view: the
// heights are drawn 2^(value / 2) times as tall, said in words next to
// it (id="stretch-label"). onChange(stretch) runs when it moves. Its
// row is written once: a page holds <div class="option-row stretch-row"></div>.
fillBlocks(".stretch-row", function () {
  return 'Heights <input type="range" id="stretch" min="-4" max="4" step="1" value="0"> ' +
    '<span class="muted" id="stretch-label"></span>';
});
function connectStretch(onChange) {
  const slider = byId("stretch");
  function read() {
    const stretch = Math.pow(2, Number(slider.value) / 2);
    byId("stretch-label").textContent = stretch === 1 ? "normal"
      : (stretch > 1 ? stretch.toFixed(1) + " times taller" : (1 / stretch).toFixed(1) + " times flatter");
    return stretch;
  }
  slider.addEventListener("input", function () { onChange(read()); });
  read();
}


/* ---------------------------------------------------------------------
   Full screen
   ---------------------------------------------------------------------
   Every picture (a <div class="sim-picture">) gets a button in its top
   left corner that opens it as a large popup over the page, with the
   page dimmed around it. Clicking outside the picture, the Esc key, or
   the button again closes it. (The buttons are put on at the end of
   this file.) Every sim already draws its picture again when the window
   changes size, so opening or closing the popup sends that same signal
   (a "resize" event), and the sim asks pictureHeight how tall to draw.
   --------------------------------------------------------------------- */

// The button's icon: two arrows pointing out to the corners (and, to
// close the popup, two arrows pointing in), inside the round button.
// It is drawn in SVG (shapes written as text), in a 24 by 24 square.
const FULL_SCREEN_ICONS = {
  open: "M14 4h6v6M20 4l-6 6M10 20H4v-6M4 20l6-6",
  close: "M14 4v6h6M14 10l6-6M10 20v-6H4M10 14l-6 6",
};
function fullScreenIcon(which) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="' + FULL_SCREEN_ICONS[which] + '"/></svg>';
}

// The picture's box that is open as a popup right now (null if none).
let poppedPicture = null;

// How tall to draw the picture: "normal" (in screen pixels) on the page,
// or the popup's whole height while it is open.
function pictureHeight(normal) {
  return poppedPicture ? poppedPicture.clientHeight : normal;
}

// Put the full screen button on the picture's box "box".
function addFullScreenButton(box) {
  const button = toolButton("", function () { popUp(poppedPicture !== box); });
  button.classList.add("full-screen-button");
  const backdrop = document.createElement("div");    // the dimmed page around the popup
  backdrop.className = "picture-backdrop";
  backdrop.hidden = true;
  const keepPlace = document.createElement("div");   // keeps the picture's place on the page while it is out

  function showIcon(open) {
    button.innerHTML = fullScreenIcon(open ? "close" : "open");
    button.title = open ? "Close (or press Esc, or click outside the picture)" : "Full screen";
  }
  function popUp(open) {
    if (open) {
      keepPlace.style.height = box.offsetHeight + "px";
      box.before(keepPlace);
    } else {
      keepPlace.remove();
    }
    poppedPicture = open ? box : null;
    box.classList.toggle("popped", open);
    backdrop.hidden = !open;
    document.body.classList.toggle("popup-open", open);   // the page behind doesn't scroll
    showIcon(open);
    window.dispatchEvent(new Event("resize"));           // the sim draws the picture at its new size
  }

  backdrop.addEventListener("click", function () { popUp(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && poppedPicture === box) popUp(false);
  });
  showIcon(false);
  box.appendChild(button);
  document.body.appendChild(backdrop);
}


// The L-shaped statistics box (section 6 of css/style.css): the
// tables and charts fill the space under the picture, next to the
// options, and the ones that don't fit there go in the full-width row
// below, in the same order as in the HTML. On a phone (one column)
// they all stay in the statistics box. It is redone whenever the
// picture, the options or the statistics change size.
const statsGrid = document.querySelector(".panel-stats .stat-grid");
const chartsPanel = document.querySelector(".panel-charts");
if (statsGrid && chartsPanel) {
  const chartsGrid = chartsPanel.querySelector(".stat-grid");
  const allStats = Array.from(document.querySelectorAll(".stat"));   // in page order
  const controls = document.querySelector(".panel-controls");
  const phone = window.matchMedia("(max-width: 760px)");

  const fitStats = oncePerFrame(function () {
    for (const stat of allStats) statsGrid.appendChild(stat);       // all back under the picture
    if (!phone.matches) {
      const bottom = controls.getBoundingClientRect().bottom;        // where the options end
      // From the last one up: move each that reaches below the options
      // to the start of the full row (always keep the first one). A
      // hidden one has no place, so it just goes along.
      for (let i = allStats.length - 1; i > 0; i--) {
        if (!allStats[i].hidden && allStats[i].getBoundingClientRect().bottom <= bottom) break;
        chartsGrid.prepend(allStats[i]);
      }
    }
    chartsPanel.hidden = !Array.from(chartsGrid.children).some(function (stat) { return !stat.hidden; });
  });
  const watch = new ResizeObserver(fitStats);
  for (const box of [document.querySelector(".panel-sim"), controls, statsGrid]) watch.observe(box);
  phone.addEventListener("change", fitStats);
}


// The typeset formulas: KaTeX draws every element with class="tex" (a
// <div> as a formula on its own line, a <span> inside a sentence). If
// KaTeX didn't load, the formulas stay as plain text and the sim still
// works.
if (window.katex) {
  for (const element of document.querySelectorAll(".tex")) {
    katex.render(element.textContent, element, { displayMode: element.tagName === "DIV", throwOnError: false });
  }
}


// The About tabs: a sim page splits its About box into tabs, a simple
// version and one with all the details. In the HTML:
//   <nav class="about-tabs">
//     <button class="about-tab selected" data-tab="simple">Simple</button>
//     <button class="about-tab" data-tab="details">All the details</button>
//   </nav>
//   <div data-panel="simple"> ... </div>
//   <div data-panel="details" hidden> ... </div>
// Clicking a tab shows the panel with the same name and hides the others
// ("hidden" hides a panel). The first tab's panel shows when the page
// opens.
for (const bar of document.querySelectorAll(".about-tabs")) {
  const box = bar.parentElement;                      // the About box
  const tabs = bar.querySelectorAll(".about-tab");
  for (const tab of tabs) {
    tab.addEventListener("click", function () {
      for (const other of tabs) other.classList.toggle("selected", other === tab);
      for (const panel of box.querySelectorAll("[data-panel]")) {
        panel.hidden = (panel.dataset.panel !== tab.dataset.tab);
      }
    });
  }
}


// The full screen button on every picture (see "Full screen" above).
for (const box of document.querySelectorAll(".sim-picture")) addFullScreenButton(box);
