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
     listenToTool(frame, useDrawing)  the drawing tool inside a sim page,
     showToolStatus(problem, good)      and the line that checks its drawing
     CHART_TEXT, CHART_LINE           the colors of the small charts
     chartPen(canvas)                 get a small chart ready to draw on
     plotOverTime(...)                a small chart of numbers over time
     histogram(...)                   a small histogram
     niceStep, shortLabel, niceNumber numbers for axes and tables

   It also typesets the formulas in the About quadrant (see the end of
   this file), so a page that has formulas loads KaTeX before this file.
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
  let v = Math.round(Number(byId(id).value));
  if (!isFinite(v) || byId(id).value === "") v = fallback;
  v = Math.min(Math.max(v, lo), hi);
  byId(id).value = v;
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
   The drawing tool inside a sim page
   ---------------------------------------------------------------------
   Choosing "Custom" on a sim page swaps the picture for the drawing
   tool (graph-tool.html), loaded in an <iframe> (a page inside the
   page) as graph-tool.html?embed. The sim checks the drawing live and
   says under the tool what's wrong, if anything; Done uses it.
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

// The line under the tool: what's wrong with the drawing (in red), or a
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
   Small charts
   --------------------------------------------------------------------- */

// The charts in the Statistics quadrant use the site's own colors from
// section 1 of css/style.css, so restyling the site restyles them too.
const siteColors = getComputedStyle(document.documentElement);
const CHART_TEXT = siteColors.getPropertyValue("--color-text-muted").trim();   // numbers and labels
const CHART_LINE = siteColors.getPropertyValue("--color-accent").trim();       // lines and bars

// Make a chart canvas sharp at its size on screen, clear it, and return
// its "pen" (what draws on it), set up for small gray text.
function chartPen(canvas) {
  const ratio = window.devicePixelRatio || 1;   // 2 on sharp screens
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  const pen = canvas.getContext("2d");
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in screen pixels from here on
  pen.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  pen.font = "11px sans-serif";
  pen.fillStyle = CHART_TEXT;
  return pen;
}

// Numbers over time: one line for each entry of "lines", { values,
// color }, where values[k] is the number at times[k]. Time goes across,
// from 0 to the last time (labeled with "word", like "step 1,000"), and
// the numbers go up, from 0 to the largest (at least 1).
function plotOverTime(canvas, times, lines, word) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (times.length < 2) return;
  let top = 1;
  for (const line of lines) for (const value of line.values) top = Math.max(top, value);
  const lastTime = times[times.length - 1];
  const left = 44, up = 6, bottom = h - 16;
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  pen.fillText(top.toLocaleString(), left - 6, up);
  pen.fillText("0", left - 6, bottom);
  pen.textBaseline = "bottom";
  pen.fillText(word + " " + (Number.isInteger(lastTime) ? lastTime.toLocaleString()
    : lastTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })), w, h);
  pen.textAlign = "left";
  pen.fillText("0", left, h);
  for (const line of lines) {
    pen.beginPath();
    line.values.forEach(function (value, k) {
      const sx = left + (w - left) * times[k] / Math.max(lastTime, 1e-9);
      const sy = bottom - (bottom - up) * value / top;
      if (k === 0) pen.moveTo(sx, sy); else pen.lineTo(sx, sy);
    });
    pen.strokeStyle = line.color;
    pen.lineWidth = 1.5;
    pen.stroke();
  }
}

// A histogram of "values" with 60 bars, labeled with the tallest count
// and the two ends. With "trimmed", the range is the middle 90% of the
// values, and anything outside goes into the first or last bar.
function histogram(canvas, values, trimmed) {
  const p = chartPen(canvas);
  if (values.length < 2) return;
  const w = canvas.clientWidth, h = canvas.clientHeight, top = 12, bottom = h - 14;
  const sorted = Float64Array.from(values).sort();
  let lo = trimmed ? sorted[Math.floor(0.05 * (sorted.length - 1))] : sorted[0];
  let hi = trimmed ? sorted[Math.ceil(0.95 * (sorted.length - 1))] : sorted[sorted.length - 1];
  // All (nearly) the same value, like an eigenvalue 1 that rounding
  // spreads by about 1e-15: one bar in the middle, not a bar of noise.
  if (!(hi - lo > 1e-9 * Math.max(1, Math.abs(lo)))) { lo -= 0.5; hi = lo + 1; }
  const bars = 60, counts = new Array(bars).fill(0);
  for (const v of sorted) counts[Math.max(0, Math.min(bars - 1, Math.floor((v - lo) / (hi - lo) * bars)))]++;

  const biggest = Math.max(...counts), barWidth = w / bars;
  p.fillText(biggest.toLocaleString(), 0, 9);
  p.fillText(shortLabel(lo), 0, h - 2);
  const last = shortLabel(hi);
  p.fillText(last, w - p.measureText(last).width, h - 2);
  p.fillStyle = CHART_LINE;
  counts.forEach(function (c, i) {
    const barHeight = (bottom - top) * c / biggest;
    if (c > 0) p.fillRect(i * barWidth, bottom - Math.max(1, barHeight), Math.max(1, barWidth - 1), Math.max(1, barHeight));
  });
}

// The nicest of 1, 2, 5, 10, 20, 50, ... (times a power of 10) that is
// at least "rough": the step between grid lines on an axis.
function niceStep(rough) {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const k of [1, 2, 5, 10]) if (k * power >= rough) return k * power;
  return 10 * power;
}

// A number short enough for an axis: 3, 0.25, 1.5e+6.
function shortLabel(v) {
  if (Math.abs(v) < 1e-12) return "0";
  if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(1);
  return String(Number(v.toPrecision(4)));
}

// A number with 4 significant digits: 1.234, 0.0001234 -> 1.234e-4.
function niceNumber(v) {
  if (v === 0) return "0";
  if (!isFinite(v)) return String(v);
  if (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) return v.toExponential(3);
  return String(Number(v.toPrecision(4)));
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
