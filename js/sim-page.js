/* =====================================================================
   sim-page.js  —  small helpers that every sim page uses
   ---------------------------------------------------------------------
   Each sim page loads this file before its own code, so these helpers
   are written once instead of being copied into every sim.

   Contents:
     byId(id)                         the element with that id="..."
     showMessage(text)                a line of text under the picture
     readWhole(id, lo, hi, fallback)  a whole number typed in a box
     startWorker(fn)                  run a function in a second thread
     CHART_TEXT, CHART_LINE           the colors of the small charts
     chartPen(canvas)                 get a small chart ready to draw on

   It also typesets the formulas in the About quadrant (see the end of
   this file), so a page that has formulas loads KaTeX before this file.
   ===================================================================== */


// The element with id="...". (Short for document.getElementById.)
function byId(id) { return document.getElementById(id); }

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
// works both ways.
function startWorker(fn) {
  const code = new Blob(["(" + fn.toString() + ")();"], { type: "text/javascript" });
  return new Worker(URL.createObjectURL(code));
}

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

// The typeset formulas: KaTeX draws every element with class="tex" (a
// <div> as a formula on its own line, a <span> inside a sentence). If
// KaTeX didn't load, the formulas stay as plain text and the sim still
// works.
if (window.katex) {
  for (const element of document.querySelectorAll(".tex")) {
    katex.render(element.textContent, element, { displayMode: element.tagName === "DIV", throwOnError: false });
  }
}
