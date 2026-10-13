/* =====================================================================
   sim-charts.js  —  the small charts in a sim's Statistics box
   ---------------------------------------------------------------------
   Shared by the sims and their check pages, so every chart looks the
   same. Each chart is a <canvas> on the page; these draw on it. Load
   this file after js/sim-page.js.

   Contents:
     CHART_TEXT, CHART_LINE           the colors of the charts
     chartPen(canvas)                 get a chart ready to draw on
     plotOverTime(...)                numbers over time, as lines
     histogram(...)                   a histogram of some numbers
     powerOfTwoBins(sizes)            sizes grouped by powers of 2 ...
     powerOfTwoBars(...)              ... drawn as bars
     stackedSizeBars(...)             region sizes, one bar per size, stacked by color
     perimeterChart(...)              perimeter against area of each region
     chartZoom(canvas, redraw),       zoom a chart in time (wheel, pinch,
       shownTimes(zoom, first, last)    drag, double-click for all of it)
     niceStep, shortLabel, niceNumber numbers for axes and tables
   ===================================================================== */


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
  const pen = chartPen(canvas);
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
  pen.fillText(biggest.toLocaleString(), 0, 9);
  pen.fillText(shortLabel(lo), 0, h - 2);
  const last = shortLabel(hi);
  pen.fillText(last, w - pen.measureText(last).width, h - 2);
  pen.fillStyle = CHART_LINE;
  counts.forEach(function (c, i) {
    const barHeight = Math.max(1, (bottom - top) * c / biggest);
    if (c > 0) pen.fillRect(i * barWidth, bottom - barHeight, Math.max(1, barWidth - 1), barHeight);
  });
}

// How many of "sizes" (whole numbers, at least 1) there are of each
// size, grouped by powers of 2: bins[b] counts the sizes from 2^b to
// 2^(b+1) - 1, so 1, 2-3, 4-7, 8-15, ... (Sizes go from 1 to many
// thousands, and this keeps the chart readable.)
function powerOfTwoBins(sizes) {
  const bins = [];
  for (const size of sizes) {
    const b = Math.floor(Math.log2(size));
    while (bins.length <= b) bins.push(0);
    bins[b]++;
  }
  return bins;
}

// One bar per entry of "bins" (as from powerOfTwoBins), labeled under it
// by label(b), the smallest size in bar b. The tallest bar's count is
// written at the top left, as "most: 120" followed by "word" (e.g.
// " clusters"). With "logScale", the bars' heights are on a logarithmic
// scale (log of count + 1), so a power law shows as bars falling evenly.
function powerOfTwoBars(canvas, bins, word, label, logScale) {
  const pen = chartPen(canvas);
  if (bins.length === 0) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const most = Math.max(...bins);
  const top = 14, bottom = h - 14, barWidth = w / bins.length;
  const tall = function (count) {
    return logScale ? Math.log10(count + 1) / Math.log10(most + 1) : count / most;
  };
  pen.textBaseline = "top";
  pen.fillText("most: " + most.toLocaleString() + word, 0, 0);
  pen.textAlign = "center";
  bins.forEach(function (count, b) {
    const barHeight = count === 0 ? 0 : Math.max(1, (bottom - top) * tall(count));
    pen.fillStyle = CHART_LINE;
    pen.fillRect(b * barWidth + 1, bottom - barHeight, Math.max(1, barWidth - 2), barHeight);
    pen.fillStyle = CHART_TEXT;
    pen.fillText(label(b), (b + 0.5) * barWidth, bottom + 2);
  });
}

// How many regions there are of each size, as bars stacked by color:
// size across, count up. "sizes" are the regions' sizes (whole numbers,
// at least 1), colorOf[r] is region r's color, and colors[c] is how
// color c is drawn. In each bar, color 0 is at the bottom, then 1 on top
// of it, and so on (so with red and green, green sits on red).
// Each bar is one size (1, 2, 3, ...) when they fit at least 2 pixels
// wide; otherwise each bar holds k sizes in a row, with k as small as
// fits: 1-2, 3-4, ... or 1-3, 4-6, ... and so on.
// With "logCounts", a bar's height is log(count + 1) instead of the
// count, so a few big regions still show next to many small ones; its
// colors split that height in proportion to their counts.
// The tallest bar's count is written at the top left, followed by
// "word" (e.g. " regions").
function stackedSizeBars(canvas, sizes, colorOf, colors, logCounts, word) {
  const pen = chartPen(canvas);
  if (sizes.length === 0) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const top = 14, bottom = h - 14;
  let biggest = 1;
  for (const size of sizes) biggest = Math.max(biggest, size);

  // How many sizes go in one bar, which bar a size goes in, and how
  // many bars there are.
  const perBar = Math.max(1, Math.ceil(biggest / (w / 2)));
  function barOf(size) { return Math.floor((size - 1) / perBar); }
  const bars = barOf(biggest) + 1;

  // counts[b][c] = the number of regions of color c in bar b, and
  // totals[b] = all of bar b's regions.
  const counts = [], totals = new Array(bars).fill(0);
  for (let b = 0; b < bars; b++) counts.push(new Array(colors.length).fill(0));
  sizes.forEach(function (size, r) {
    counts[barOf(size)][colorOf[r]]++;
    totals[barOf(size)]++;
  });
  const most = Math.max(...totals);
  function tall(count) { return logCounts ? Math.log10(count + 1) / Math.log10(most + 1) : count / most; }

  // The bars: each color's piece on top of the ones before it.
  const barWidth = w / bars, gap = barWidth >= 4 ? 1 : 0;
  counts.forEach(function (bar, b) {
    if (totals[b] === 0) return;
    const height = (bottom - top) * tall(totals[b]);
    let y = bottom;
    bar.forEach(function (count, c) {
      if (count === 0) return;
      const piece = height * count / totals[b];
      pen.fillStyle = colors[c];
      pen.fillRect(b * barWidth + gap, y - piece, Math.max(1, barWidth - 2 * gap), piece);
      y -= piece;
    });
  });

  // The labels: the tallest count, and about 6 round sizes (1, 5, 10,
  // 15, ... or 1, 20, 40, ...), each under the bar it is in.
  pen.fillStyle = CHART_TEXT;
  pen.textBaseline = "top";
  pen.fillText("most: " + most.toLocaleString() + word +
    (perBar > 1 ? " (each bar: " + perBar + " sizes)" : "") + (logCounts ? ", log scale" : ""), 0, 0);
  pen.textAlign = "center";
  function label(size) {    // kept inside the chart at both ends
    const text = size.toLocaleString(), half = pen.measureText(text).width / 2;
    pen.fillText(text, Math.min(Math.max((barOf(size) + 0.5) * barWidth, half), w - half), bottom + 2);
  }
  label(1);
  const every = niceStep(bars * perBar / 6);
  for (let size = every; size <= bars * perBar; size += every) if (size > 1) label(size);
}

// Each region (from findRegions, js/sim-domains.js) as a dot: area
// across, perimeter up, both on logarithmic scales (so 1, 10, 100, ...
// are evenly spaced), filled with its color (colorNames[color], with a
// thin "border" line around it). Regions with no other color next to
// them (perimeter 0) are left out.
function perimeterChart(canvas, regions, colorNames, border) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const left = 34, up = 18, bottom = h - 16;
  let maxArea = 10, maxPerimeter = 10;
  regions.areas.forEach(function (area, r) {
    maxArea = Math.max(maxArea, area);
    maxPerimeter = Math.max(maxPerimeter, regions.perimeters[r]);
  });
  const xTop = Math.ceil(Math.log10(maxArea)), yTop = Math.ceil(Math.log10(maxPerimeter));
  function sx(area) { return left + (w - left - 8) * Math.log10(area) / xTop; }
  function sy(perimeter) { return bottom - (bottom - up) * Math.log10(perimeter) / yTop; }

  // The axes' marks at 1, 10, 100, ...
  pen.textAlign = "center";
  pen.textBaseline = "top";
  for (let k = 0; k <= xTop; k++) pen.fillText(String(10 ** k), sx(10 ** k), bottom + 3);
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  for (let k = 0; k <= yTop; k++) pen.fillText(String(10 ** k), left - 5, sy(10 ** k));
  pen.textBaseline = "bottom";
  pen.fillText("area", w, bottom);
  pen.textAlign = "left";
  pen.textBaseline = "top";
  pen.fillText("perimeter", left + 4, 0);

  pen.lineWidth = 0.5;
  pen.strokeStyle = border;
  regions.areas.forEach(function (area, r) {
    const perimeter = regions.perimeters[r];
    if (perimeter === 0) return;
    pen.beginPath();
    pen.arc(sx(area), sy(perimeter), 2.5, 0, 2 * Math.PI);
    pen.fillStyle = colorNames[regions.color[r]];
    pen.fill();
    pen.stroke();
  });
}

// Zooming a chart in time, like the pictures: on the chart,
//   mouse wheel, or pinch   zoom in or out around the pointer
//   drag                    move along in time
//   double-click            show the whole run again
// chartZoom(canvas, redraw) remembers which stretch of time is shown;
// "redraw" draws the chart again. When drawing, the chart asks
// shownTimes(zoom, first, last), where first .. last is the whole run,
// for the stretch to draw, and sets zoom.left and zoom.right to where
// time 'from' and time 'to' go on the canvas (in screen pixels).
// While the chart shows the whole run, it keeps growing with the run;
// zoomed in, it stays on the same stretch of time.
function chartZoom(canvas, redraw) {
  const zoom = {
    from: null, to: null,    // the stretch shown; null = the whole run
    first: 0, last: 1,       // the whole run (set by shownTimes)
    left: 0, right: 1,       // where the stretch goes on the canvas
    pointers: new Map(),     // the mouse or fingers pressed on the chart
  };
  canvas.classList.add("zoomable");

  // The time under a spot on the canvas, x pixels from its left side.
  function timeAt(x) {
    const [from, to] = shownTimes(zoom, zoom.first, zoom.last);
    return from + (to - from) * (x - zoom.left) / Math.max(1, zoom.right - zoom.left);
  }
  // Zoom by "factor" (below 1 zooms in) around the spot x pixels in.
  function zoomAround(factor, x) {
    const [from, to] = shownTimes(zoom, zoom.first, zoom.last);
    const t = timeAt(x);
    const width = Math.max((to - from) * factor, 1e-9);
    if (width >= zoom.last - zoom.first) { zoom.from = zoom.to = null; }   // all of it
    else { zoom.from = t - (t - from) * factor; zoom.to = zoom.from + width; }
    redraw();
  }
  function canvasX(event) { return event.clientX - canvas.getBoundingClientRect().left; }
  function spread() {      // the middle of the pressed pointers, and how far apart they are
    const p = Array.from(zoom.pointers.values());
    if (p.length === 1) return { x: p[0], apart: 0 };
    return { x: (p[0] + p[1]) / 2, apart: Math.abs(p[0] - p[1]) };
  }

  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();                        // don't scroll the page
    zoomAround(Math.exp(event.deltaY * 0.002), canvasX(event));
  }, { passive: false });
  canvas.addEventListener("dblclick", function () { zoom.from = zoom.to = null; redraw(); });
  canvas.addEventListener("pointerdown", function (event) {
    zoom.pointers.set(event.pointerId, canvasX(event));
    canvas.setPointerCapture(event.pointerId);     // keep getting moves even off the chart
  });
  canvas.addEventListener("pointermove", function (event) {
    if (!zoom.pointers.has(event.pointerId)) return;
    const before = spread();
    zoom.pointers.set(event.pointerId, canvasX(event));
    const after = spread();
    if (after.apart > 0 && before.apart > 0) zoomAround(before.apart / after.apart, after.x);   // pinch
    // Drag: the time under the pointer stays under the pointer.
    const [from, to] = shownTimes(zoom, zoom.first, zoom.last);
    if (zoom.from === null || after.x === before.x) return;
    const shift = (before.x - after.x) * (to - from) / Math.max(1, zoom.right - zoom.left);
    zoom.from = from + shift;
    zoom.to = to + shift;
    redraw();
  });
  for (const type of ["pointerup", "pointercancel"]) {
    canvas.addEventListener(type, function (event) { zoom.pointers.delete(event.pointerId); });
  }
  return zoom;
}

// The stretch of time [from, to] to draw, for a run from "first" to
// "last": the whole run, or the zoomed-in stretch, kept inside the run.
function shownTimes(zoom, first, last) {
  zoom.first = first;
  zoom.last = last;
  if (zoom.from === null || !(last > first)) return [first, Math.max(last, first + 1e-9)];
  const width = Math.min(zoom.to - zoom.from, last - first);
  zoom.from = Math.min(Math.max(zoom.from, first), last - width);
  zoom.to = zoom.from + width;
  return [zoom.from, zoom.to];
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
