/* =====================================================================
   sim-page.js  —  small helpers that every sim page uses
   ---------------------------------------------------------------------
   Each sim page loads this file before its own code, so these helpers
   are written once instead of being copied into every sim.

   Contents:
     byId(id)                         the element with that id="..."
     checked(name)                    which radio button of a group is ticked
     showMessage(text)                a line of text under the picture
     readWhole(id, lo, hi, fallback)  a whole number typed in a box
     startWorker(fn, helpers)         run a function in a second thread
     oncePerFrame(draw)               draw at the next screen refresh
     showPlaying(on)                  the Play button, while it plays
     speedText(speed, one, many)      "5 moves per second", for the Speed slider
     addRangeBoxes(slider, lo, hi, ...)  "min" and "max" boxes at a slider's ends
     connectSpeedSlider(id, speeds, ...) a Speed slider with those boxes
     connectPlay(worker, ...)         Play / Pause, Step, Restart and Speed
     connectSeed(onChange)            the Seed box and its New seed button
     listenToTool(frame, useDrawing)  the drawing tool inside a sim page,
     showToolStatus(problem, good, buttons)   and the line that checks its drawing
     pictureHeight(normal)            how tall to draw the picture (taller
                                        in the full screen popup)

   It also typesets the formulas in the About quadrant (so a page that
   has formulas loads KaTeX before this file), makes the About tabs
   work, and puts the full screen button on the picture (all at the end
   of this file). The small charts are in js/sim-charts.js.
   ===================================================================== */


// The element with id="...". (Short for document.getElementById.)
function byId(id) { return document.getElementById(id); }

// Which radio button of a group is ticked: its value="...". For example
// checked("domain") is "box", "torus" or "custom".
function checked(name) { return document.querySelector('input[name="' + name + '"]:checked').value; }

// Show a line of text in the page's <p id="sim-message">, e.g. if the
// sim can't start. An empty text clears it.
function showMessage(text) { byId("sim-message").textContent = text; }

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
// the worker uses; their text is put in first, so "fn" can call them.
function startWorker(fn, helpers) {
  const parts = (helpers || []).map(function (helper) { return helper.toString() + "\n"; });
  parts.push("(" + fn.toString() + ")();");
  const code = new Blob(parts, { type: "text/javascript" });
  return new Worker(URL.createObjectURL(code));
}


/* ---------------------------------------------------------------------
   Running: drawing, Play, Speed and Seed
   --------------------------------------------------------------------- */

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

// Play / Pause, Step, Restart and the Speed slider, for a sim whose math
// runs in a second thread on the shared run loop (makeRunLoop,
// js/sim-worker.js), which understands "play", "pause" and "step".
//   speeds      the Speed slider's slowest and fastest speeds, per
//               second, ending in Infinity for "as fast as possible"
//               (connectSpeedSlider); startSpeed is where it starts
//   one, many   what one step is called, e.g. "sweep" and "sweeps"
//   restart()   what the Restart button does
// Returns "player": player.playing is true while the sim plays,
// player.setPlaying(on) plays or pauses, and player.carryOn() tells a
// freshly restarted run to play if the sim was playing.
// (Sandpiles and percolation run differently and have their own.)
function connectPlay(worker, speeds, startSpeed, one, many, restart) {
  const player = { playing: false };
  let speed = startSpeed;
  function sendPlay() { worker.postMessage({ type: "play", speed: speed }); }

  player.setPlaying = function (on) {
    player.playing = on;
    if (on) sendPlay(); else worker.postMessage({ type: "pause" });
    showPlaying(on);
  };
  player.carryOn = function () { if (player.playing) sendPlay(); };

  byId("play").addEventListener("click", function () { player.setPlaying(!player.playing); });
  byId("step").addEventListener("click", function () {
    if (player.playing) player.setPlaying(false);
    worker.postMessage({ type: "step" });
  });
  byId("restart").addEventListener("click", function () { restart(); });

  connectSpeedSlider("speed", speeds, startSpeed, function (newSpeed) {
    speed = newSpeed;
    byId("speed-label").textContent = speedText(speed, one, many);
    if (player.playing) sendPlay();
  });
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
   The drawing tool inside a sim page
   ---------------------------------------------------------------------
   Choosing "Custom" on a sim page swaps the picture for the drawing
   tool, loaded in an <iframe> (a page inside the page) as
   graph-tool.html?embed. The sim checks the drawing live and says above
   the tool what's wrong, if anything; Done uses it. makeCustomTool
   (js/sim-controls.js) does all of that with these two.
   --------------------------------------------------------------------- */

// Listen to the tool in the iframe "frame". It says how tall it is (so
// the iframe fits it exactly), and every time the drawing changes it
// sends the drawing, { graph, grid, palette }, which is handed on to
// useDrawing. (drawnDomain, in js/sim-domains.js, makes a domain of it.)
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
// drawing work only when nothing is wrong: Done, or the buttons with
// the ids in the list "buttons".
function showToolStatus(problem, good, buttons) {
  const status = byId("step-status");
  status.textContent = problem || "✓ " + good;   // ✓ is a tick mark
  status.className = "step-status " + (problem ? "problem" : "ok");
  for (const id of buttons || ["tool-done"]) byId(id).disabled = Boolean(problem);
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
  const button = document.createElement("button");
  button.className = "tool-button full-screen-button";
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

  button.addEventListener("click", function () { popUp(poppedPicture !== box); });
  backdrop.addEventListener("click", function () { popUp(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && poppedPicture === box) popUp(false);
  });
  showIcon(false);
  box.appendChild(button);
  document.body.appendChild(backdrop);
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
