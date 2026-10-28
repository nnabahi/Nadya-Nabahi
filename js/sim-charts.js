/* =====================================================================
   sim-charts.js  —  the small charts in a sim's Statistics box
   ---------------------------------------------------------------------
   Shared by the sims and their check pages, so every chart looks the
   same and every chart has numbered axes. Each chart is a <canvas> on
   the page; these draw on it. Load this file after js/sim-page.js.

   Contents:
     1. Colors and the pen
          CHART_TEXT, CHART_LINE     the colors of the charts
          chartPen(canvas)           get a chart ready to draw on
     2. Axes: the numbers along a chart's sides
          chartFrame(canvas, x, y)   a chart with two numbered axes
          shortLabel(v, step)        a number short enough for an axis
          multiplesOf(step, from, to)   where the ticks (or grid lines) go
     3. Drawing inside the axes
          drawSeries(frame, series)  lines or dots
          drawBars(frame, bars)      bars, one color or stacked
          drawHeat(frame, ...)       a heat map
          lineChart, barChart, heatChart   a frame and its drawing at once
          seriesRange(series, k)     the smallest and largest x (k = 0) or y (k = 1)
     4. The charts the sims share
          plotOverTime(...)          numbers over time, as lines
          pointsOverTime(times, values)   [time, number] points, from a trace
          colorLines(...)            one line per color, from a trace, for plotOverTime
          regionsChart(...)          the number of regions of each color over time
          histogram(...)             a histogram of some numbers
          powerOfTwoBins(sizes)      sizes grouped by powers of 2 ...
          powerOfTwoBars(...)        ... drawn as bars
          stackedSizeBars(...)       region sizes, one bar per size, stacked by color, log-log
          perimeterChart(...)        perimeter against area of each region
          persistenceChart(...)      how long each hole lived, log-log
          radiusChart, radiusHeatChart   a shape's farthest cell in each
                                     direction, now and over time
                                     (Eden Growth, First Passage Percolation)
          logLogChart(...)           numbers against numbers, log-log,
                                       with a guide line of a given slope
     5. Zooming in time
          chartZoom(canvas, redraw), shownTimes(zoom, first, last)
     6. Numbers
          niceStep, niceNumber
   ===================================================================== */


/* =====================================================================
   1. COLORS AND THE PEN
   ===================================================================== */

// The charts in the Statistics box use the site's own colors from
// section 1 of css/style.css, so restyling the site restyles them too.
const siteColors = getComputedStyle(document.documentElement);
const CHART_TEXT = siteColors.getPropertyValue("--color-text-muted").trim();   // numbers and labels
const CHART_LINE = siteColors.getPropertyValue("--color-accent").trim();       // lines and bars
const CHART_GRID = siteColors.getPropertyValue("--color-grid").trim();         // the light lines across

// Get a chart canvas ready (sharpPen, js/sim-page.js) and return its
// "pen" (what draws on it), set up for small gray text.
function chartPen(canvas) {
  const pen = sharpPen(canvas);
  pen.font = "11px sans-serif";
  pen.fillStyle = CHART_TEXT;
  return pen;
}


/* =====================================================================
   2. AXES: THE NUMBERS ALONG A CHART'S SIDES
   ---------------------------------------------------------------------
   Every chart is drawn in a "frame": the plot in the middle, with
   numbered ticks up its left side (the y axis) and along its bottom
   (the x axis), and a thin light line across the plot at each y tick,
   under the chart, so a value anywhere (the newest, at the right end,
   too) can be read against the numbers on the left. An axis is an object with these keys (only "from" and
   "to" are needed):
     from, to   the numbers at its two ends
     scale      "linear" (the default); "log": 1, 10, 100, ... evenly
                spaced ("from" must be above 0); or "log+1": the log of
                the number plus 1, so that 0 fits too (for counts)
     round      true: move the ends out to the nearest ticks (or, on a
                log scale, powers of 10), so both ends are numbered
     whole      true: ticks only at whole numbers (bars, counts)
     step       a fixed step between ticks (e.g. 90 for degrees)
     text(v)    how to write the tick at v (the default is shortLabel)
     word       what the axis is: written at the bottom right for x,
                above the plot at the top left for y
     ticks      false: no numbers on this axis
   Ticks sit at nice numbers: 1, 2 or 5 times a power of 10, about
   X_TICKS of them across and Y_TICKS up, fewer when their numbers would
   crowd each other. On a log scale they are 1, 2, 5, 10, 20, 50, ...
   when there is room, else 1, 10, 100, ..., else fewer powers of 10.
   ===================================================================== */
const X_TICKS = 10, Y_TICKS = 3;
const TICK_GAP = 6;        // the least room between two tick numbers, in pixels
const TEXT_HEIGHT = 11;    // the height of a number (the pen's 11px font)

// Clear the chart and draw the axes x and y on it. Returns the frame:
// the pen, where the plot sits (left, right, up, bottom, in pixels),
// and sx(v), sy(v), the spot on the screen of the number v on the x
// and y axis. Draw the chart itself with section 3, or with the pen.
function chartFrame(canvas, x, y) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  x = readyAxis(x);
  y = readyAxis(y);
  // The y ticks first: their numbers decide how wide the left margin is.
  const up = y.word ? 18 : 6;
  const bottom = h - (x.ticks === false && !x.word ? 4 : 16);
  const yTicks = pickTicks(y, bottom - up, Y_TICKS, function () { return TEXT_HEIGHT; });
  const widest = Math.max(0, ...yTicks.map(function (t) { return pen.measureText(t.text).width; }));
  const left = y.ticks === false ? 4 : Math.ceil(widest) + 8, right = w - 4;
  const xTicks = pickTicks(x, right - left, X_TICKS, function (text) { return pen.measureText(text).width; });
  const frame = {
    pen: pen, w: w, h: h, left: left, right: right, up: up, bottom: bottom,
    sx: function (v) { return left + (right - left) * axisPlace(x, v); },
    sy: function (v) { return bottom - (bottom - up) * axisPlace(y, v); },
  };
  chartAxes(frame, x, xTicks, y, yTicks);
  return frame;
}

// A copy of an axis with its defaults filled in and its data's ends
// kept (dataFrom, dataTo), with room to draw even when both ends are
// the same number.
function readyAxis(axis) {
  const a = Object.assign({ scale: "linear", text: shortLabel }, axis);
  if (!isFinite(a.from) || !isFinite(a.to)) { a.from = a.scale === "log" ? 1 : 0; a.to = a.from + 1; }
  if (a.scale === "log" && !(a.from > 0)) a.from = a.to > 1 ? 1 : a.to / 10;   // a log scale has no 0
  if (!(a.to > a.from)) a.to = a.scale === "log" ? a.from * 10 : a.from + 1;
  a.dataFrom = a.from;
  a.dataTo = a.to;
  return a;
}

// Where the number v is on an axis: 0 at its "from" end, 1 at its "to".
function axisPlace(axis, v) {
  const at = axisUnits(axis);
  return (at(v) - at(axis.from)) / (at(axis.to) - at(axis.from));
}
function axisUnits(axis) {
  if (axis.scale === "log") return Math.log10;
  if (axis.scale === "log+1") return function (v) { return Math.log10(v + 1); };
  return function (v) { return v; };
}

// The ticks of an axis that is "pixels" long, as a list of { at, text }:
// the densest choice of nice numbers with at most about 1.5 times
// "wanted" ticks whose numbers don't crowd ("sizeOf(text)": how much
// room a number takes along the axis), or the sparsest choice if none
// fits. With "round", this also moves the axis' ends out.
function pickTicks(axis, pixels, wanted, sizeOf) {
  if (axis.ticks === false) return [];
  const choices = axis.scale === "linear" ? linearChoices(axis, wanted) : logChoices(axis);
  let ticks = [];
  for (const choose of choices) {
    ticks = choose();
    if (ticks.length <= 1.5 * wanted && ticksFit(ticks, axis, pixels, sizeOf)) break;
  }
  return axis.scale === "log+1" ? withZero(ticks, axis, pixels, sizeOf) : ticks;
}

// A "log+1" axis starts at 0, which sits close to 1 (1 is at log 2):
// the 0 tick goes first, and the 1 tick is left out if they would crowd.
function withZero(ticks, axis, pixels, sizeOf) {
  if (axis.from > 0) return ticks;
  const zero = { at: 0, text: axis.text(0, 1) };
  if (ticks.length > 0 && !ticksFit([zero, ticks[0]], axis, pixels, sizeOf)) ticks = ticks.slice(1);
  return [zero].concat(ticks);
}

// The choices for a linear axis, densest first: ticks every "step", for
// the nice steps from about 1/wanted of the axis up to all of it.
function linearChoices(axis, wanted) {
  if (axis.step) return [function () { return linearTicks(axis, axis.step); }];
  const range = axis.dataTo - axis.dataFrom, choices = [];
  let step = niceStep(range / wanted);
  if (axis.whole) step = Math.max(1, step);
  for (;;) {
    const each = step;
    choices.push(function () { return linearTicks(axis, each); });
    if (step > range) return choices;        // the last choice: at most two ticks
    step = niceStep(step * 1.5);             // the next nice step: 1 -> 2 -> 5 -> 10 -> ...
  }
}

// The ticks at the multiples of "step" from one end of a linear axis to
// the other (with "round", the ends move out to multiples of step first).
function linearTicks(axis, step) {
  axis.from = axis.dataFrom;
  axis.to = axis.dataTo;
  if (axis.round) {
    axis.from = Math.floor(axis.from / step + 1e-9) * step;
    axis.to = Math.ceil(axis.to / step - 1e-9) * step;
  }
  return multiplesOf(step, axis.from, axis.to).map(function (v) { return { at: v, text: axis.text(v, step) }; });
}

// The multiples of "step" from "from" to "to" (also the grid lines of
// a plane picture, js/sim-view.js).
function multiplesOf(step, from, to) {
  const list = [];
  for (let k = Math.ceil(from / step - 1e-9); k * step <= to + 1e-9 * step; k++) {
    list.push(Number((k * step).toPrecision(12)));   // 0.30000000000000004 -> 0.3
  }
  return list;
}

// The choices for a log axis, densest first: 1, 2, 5 in each power of
// 10; just the powers of 10; then every 2nd, 3rd, 5th or 10th power.
function logChoices(axis) {
  const choices = [[[1, 2, 5], 1], [[1], 1], [[1], 2], [[1], 3], [[1], 5], [[1], 10]];
  return choices.map(function ([firsts, every]) {
    return function () { return logTicks(axis, firsts, every); };
  });
}

// The ticks f * 10^p on a log axis, for f in "firsts" and every
// "every"-th power p. (A "log+1" axis gets its 0 in pickTicks.)
function logTicks(axis, firsts, every) {
  axis.from = axis.dataFrom;
  axis.to = axis.dataTo;
  if (axis.round) {
    if (axis.scale === "log") axis.from = Math.pow(10, Math.floor(Math.log10(axis.from) + 1e-9));
    axis.to = Math.pow(10, Math.ceil(Math.log10(axis.to) - 1e-9));
  }
  const ticks = [];
  const lowest = Math.floor(Math.log10(Math.max(axis.from, axis.scale === "log" ? 1e-300 : 1)));
  for (let power = lowest; power <= Math.ceil(Math.log10(axis.to)); power++) {
    if (((power % every) + every) % every !== 0) continue;
    for (const f of firsts) {
      const v = Number((f * Math.pow(10, power)).toPrecision(12));
      if (v < axis.from * (1 - 1e-9) || v > axis.to * (1 + 1e-9) || (axis.whole && v < 1)) continue;
      ticks.push({ at: v, text: axis.text(v, v) });
    }
  }
  return ticks;
}

// Whether the numbers of these ticks keep TICK_GAP pixels apart.
function ticksFit(ticks, axis, pixels, sizeOf) {
  for (let k = 1; k < ticks.length; k++) {
    const apart = pixels * (axisPlace(axis, ticks[k].at) - axisPlace(axis, ticks[k - 1].at));
    if (apart < (sizeOf(ticks[k].text) + sizeOf(ticks[k - 1].text)) / 2 + TICK_GAP) return false;
  }
  return true;
}

// The light lines across at the y ticks, the two axis lines, a small
// mark at each tick with its number, and the axes' words. An x number stays right of the y numbers and left of
// the x axis' word (one that would run into the word is left out).
function chartAxes(frame, x, xTicks, y, yTicks) {
  const pen = frame.pen;
  pen.save();
  pen.fillStyle = CHART_GRID;
  for (const t of yTicks) {
    const at = Math.round(frame.sy(t.at));
    if (at < frame.bottom) pen.fillRect(frame.left, at, frame.right - frame.left, 1);   // (the x axis is at the bottom)
  }
  pen.strokeStyle = pen.fillStyle = CHART_TEXT;
  pen.lineWidth = 1;
  pen.beginPath();
  pen.moveTo(frame.left - 0.5, frame.up);
  pen.lineTo(frame.left - 0.5, frame.bottom + 0.5);
  pen.lineTo(frame.right, frame.bottom + 0.5);
  pen.stroke();

  // Up the left side.
  pen.textAlign = "right";
  pen.textBaseline = "middle";
  for (const t of yTicks) {
    const at = Math.round(frame.sy(t.at));
    pen.fillRect(frame.left - 4, at, 3, 1);
    pen.fillText(t.text, frame.left - 6, Math.max(TEXT_HEIGHT / 2, at));
  }
  pen.textAlign = "left";
  pen.textBaseline = "top";
  if (y.word) pen.fillText(y.word, 0, 0);

  // Along the bottom.
  let wordStart = frame.w;
  if (x.word) {
    pen.textAlign = "right";
    pen.fillText(x.word, frame.w, frame.bottom + 4);
    wordStart = frame.w - pen.measureText(x.word).width - TICK_GAP;
    pen.textAlign = "left";
  }
  for (const t of xTicks) {
    const at = Math.round(frame.sx(t.at)), width = pen.measureText(t.text).width;
    const start = Math.min(Math.max(frame.left - 2, at - width / 2), frame.w - width);
    if (start + width > wordStart) continue;
    pen.fillRect(at, frame.bottom + 1, 1, 3);
    pen.fillText(t.text, start, frame.bottom + 4);
  }
  pen.restore();
}

// A number short enough for an axis: 3, 0.25, 1.5k, 20k, 1M, 2e-5.
// "step" (optional) is the step between the axis' ticks, which decides
// how many decimals show; without it, up to 4 significant digits.
function shortLabel(v, step) {
  const size = Math.abs(v);
  if (size < 1e-12) return "0";
  let text;
  if (size >= 1e9 || size < 1e-3) {
    const power = Math.floor(Math.log10(size));
    text = Number((v / Math.pow(10, power)).toPrecision(step ? 2 : 3)) + "e" + power;
  } else {
    const unit = size >= 1e6 ? 1e6 : size >= 1e3 ? 1e3 : 1;
    const decimals = step ? Math.max(0, -Math.floor(Math.log10(step / unit) + 1e-9)) : null;
    text = (decimals === null ? Number((v / unit).toPrecision(4)) : Number((v / unit).toFixed(Math.min(decimals, 12)))) +
      (unit === 1e6 ? "M" : unit === 1e3 ? "k" : "");
  }
  return text.replace(/^-/, "\u2212");   // a real minus sign, −
}


/* =====================================================================
   3. DRAWING INSIDE THE AXES
   ---------------------------------------------------------------------
   Each takes the frame from chartFrame and draws with its sx and sy,
   so the drawing always matches the numbers on the axes.
   ===================================================================== */

// Lines or dots. Each entry of "series" is
//   { points: [[x, y], ...], color, dashed, width, dots, radius, alpha, border }
// "color" (default CHART_LINE) may also be a function of the point's
// place k in the list (for dots of different colors); "dashed": a
// dashed line (e.g. what theory says); "width": the line's width
// (default 1.5); "dots": dots of radius "radius" (default 2.5) instead
// of a line; "alpha": how see-through, from 0 (invisible) to 1 (the
// default); "border": the color of a thin line around each dot. Points
// off a log axis (0 or less) are left out. Everything stays inside the
// plot, so nothing covers the numbers.
function drawSeries(frame, series) {
  const pen = frame.pen;
  pen.save();
  clipToPlot(frame);
  for (const s of series) {
    pen.globalAlpha = s.alpha === undefined ? 1 : s.alpha;
    if (s.dots) chartDots(frame, s); else chartLine(frame, s);
  }
  pen.restore();
}

function chartLine(frame, s) {
  const pen = frame.pen;
  pen.beginPath();
  let started = false;
  for (const [vx, vy] of s.points) {
    const px = frame.sx(vx), py = frame.sy(vy);
    if (!isFinite(px) || !isFinite(py)) continue;
    if (started) pen.lineTo(px, py); else pen.moveTo(px, py);
    started = true;
  }
  pen.strokeStyle = s.color || CHART_LINE;
  pen.lineWidth = s.width || 1.5;
  pen.setLineDash(s.dashed ? [4, 3] : []);
  pen.stroke();
  pen.setLineDash([]);
}

function chartDots(frame, s) {
  const pen = frame.pen, radius = s.radius || 2.5;
  pen.lineWidth = 0.5;
  if (s.border) pen.strokeStyle = s.border;
  s.points.forEach(function ([vx, vy], k) {
    const px = frame.sx(vx), py = frame.sy(vy);
    if (!isFinite(px) || !isFinite(py)) return;
    pen.beginPath();
    pen.arc(px, py, radius, 0, 2 * Math.PI);
    pen.fillStyle = typeof s.color === "function" ? s.color(k) : s.color || CHART_LINE;
    pen.fill();
    if (s.border) pen.stroke();
  });
}

// Bars standing on the bottom of the plot. Each bar is
//   { from, to, value, color, border }   from x = from to x = to, "value" tall
// or has "pieces": [{ value, color }, ...] in place of value and color:
// pieces stacked from the bottom up, splitting the bar's height in
// proportion to their values (so on a log scale too, each piece's share
// of the bar is its share of the total). "color" defaults to CHART_LINE;
// "border": the color of a thin line around the bar. Bars wider than 4
// pixels get a 1 pixel gap on each side.
function drawBars(frame, bars) {
  const pen = frame.pen;
  pen.save();
  clipToPlot(frame);
  for (const bar of bars) {
    const pieces = bar.pieces || [{ value: bar.value, color: bar.color }];
    const total = pieces.reduce(function (sum, piece) { return sum + piece.value; }, 0);
    if (!(total > 0)) continue;
    const x0 = frame.sx(bar.from), x1 = frame.sx(bar.to);
    const gap = x1 - x0 >= 4 ? 1 : 0, width = Math.max(1, x1 - x0 - 2 * gap);
    const height = Math.max(1, frame.bottom - frame.sy(total));
    let top = frame.bottom;
    for (const piece of pieces) {
      if (!(piece.value > 0)) continue;
      const tall = height * piece.value / total;
      pen.fillStyle = piece.color || CHART_LINE;
      pen.fillRect(x0 + gap, top - tall, width, tall);
      top -= tall;
    }
    if (bar.border) {
      pen.strokeStyle = bar.border;
      pen.lineWidth = 0.5;
      pen.strokeRect(x0 + gap, frame.bottom - height, width, height);
    }
  }
  pen.restore();
}

// A heat map filling the plot: "columns" across and "rows" up (row 0 at
// the bottom), cell (c, r) colored colorAt(c, r), an [r, g, b] list
// (each 0 to 255), or left blank where it gives null.
function drawHeat(frame, columns, rows, colorAt) {
  const tiny = document.createElement("canvas");   // one pixel per cell, stretched to the plot
  tiny.width = columns;
  tiny.height = rows;
  const tinyPen = tiny.getContext("2d");
  const image = tinyPen.createImageData(columns, rows);
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const rgb = colorAt(c, r);
      if (!rgb) continue;
      const p = 4 * ((rows - 1 - r) * columns + c);
      image.data[p] = rgb[0]; image.data[p + 1] = rgb[1]; image.data[p + 2] = rgb[2]; image.data[p + 3] = 255;
    }
  }
  tinyPen.putImageData(image, 0, 0);
  frame.pen.imageSmoothingEnabled = false;
  frame.pen.drawImage(tiny, frame.left, frame.up, frame.right - frame.left, frame.bottom - frame.up);
}

// Keep what is drawn next inside the plot (with a few pixels to spare,
// so a line along the top or a dot at the right end shows whole).
function clipToPlot(frame) {
  frame.pen.beginPath();
  frame.pen.rect(frame.left, frame.up - 4, frame.w - frame.left, frame.bottom - frame.up + 4);
  frame.pen.clip();
}

// A frame and its drawing at once; each returns the frame, for any
// extra marks.
function lineChart(canvas, series, x, y) {
  const frame = chartFrame(canvas, x, y);
  drawSeries(frame, series);
  return frame;
}
function barChart(canvas, bars, x, y) {
  const frame = chartFrame(canvas, x, y);
  drawBars(frame, bars);
  return frame;
}
function heatChart(canvas, columns, rows, colorAt, x, y) {
  const frame = chartFrame(canvas, x, y);
  drawHeat(frame, columns, rows, colorAt);
  return frame;
}

// The smallest and largest x (k = 0) or y (k = 1) of the points of all
// the series, leaving out any that aren't numbers.
function seriesRange(series, k) {
  let low = Infinity, high = -Infinity;
  for (const s of series) {
    for (const point of s.points) {
      if (!isFinite(point[k])) continue;
      low = Math.min(low, point[k]);
      high = Math.max(high, point[k]);
    }
  }
  return [low, high];
}


/* =====================================================================
   4. THE CHARTS THE SIMS SHARE
   ===================================================================== */

// Numbers over time: one line for each entry of "lines", { values,
// color, dashed }, where values[k] is the number at times[k] ("dashed":
// optional, true for a dashed line, e.g. what theory says). Time goes
// across, from 0 to the last time, under the word "word" (like "step"),
// and the numbers go up, from 0 (or the lowest, if below 0) to the
// largest (at least 1) rounded up to a tick, or to "top" if given (e.g.
// 100 for a percent).
function plotOverTime(canvas, times, lines, word, top) {
  if (times.length < 2) { chartPen(canvas); return; }
  const series = lines.map(function (line) {
    return { points: pointsOverTime(times, line.values), color: line.color, dashed: line.dashed };
  });
  const [low, high] = seriesRange(series, 1);
  return lineChart(canvas, series, { from: 0, to: times[times.length - 1], word: word },
                   { from: Math.min(0, low), to: top || Math.max(1, high), round: !top });
}

// The points [times[k], values[k]] of a chart over time.
function pointsOverTime(times, values) {
  return Array.from(values, function (v, k) { return [times[k], v]; });
}

// One line per color for plotOverTime, from a trace that keeps "count"
// numbers per sample (one per color), one sample after another: line c
// has the numbers flat[k * count + c] (times "scale", e.g. 1 / cells
// for shares), drawn in lineColor(c).
function colorLines(flat, samples, count, lineColor, scale) {
  const lines = [];
  for (let c = 0; c < count; c++) {
    const values = [];
    for (let k = 0; k < samples; k++) values.push(flat[k * count + c] * (scale || 1));
    lines.push({ color: lineColor(c), values: values });
  }
  return lines;
}

// The number of regions (connected pieces of one color) over time: one
// line per color, the regions of that color, drawn in lineColor(c), and
// a gray one for all the regions together. "pieces" keeps "count"
// numbers per sample, one sample after another (countPieces,
// js/sim-domains.js, at each sample of the trace).
function regionsChart(canvas, times, pieces, count, lineColor, word) {
  const lines = colorLines(pieces, times.length, count, lineColor);
  const total = times.map(function (t, k) {
    let sum = 0;
    for (let c = 0; c < count; c++) sum += pieces[k * count + c];
    return sum;
  });
  lines.push({ color: CHART_TEXT, values: Array.from(total) });
  plotOverTime(canvas, times, lines, word);
}

// A histogram of "values" with 60 bars of equal width. With "trimmed",
// the range is the middle 90% of the values, and anything outside goes
// into the first or last bar. With "log", the values must be above 0,
// and the bars are of equal width on a log scale (1, 10, 100, ...
// evenly spaced), for values from tiny to huge.
function histogram(canvas, values, trimmed, log) {
  if (values.length < 2) { chartPen(canvas); return; }
  const place = log ? Math.log10 : function (v) { return v; };     // where a value goes across ...
  const value = log ? function (u) { return Math.pow(10, u); } : place;   // ... and back
  const sorted = Float64Array.from(values, place).sort();
  let lo = trimmed ? sorted[Math.floor(0.05 * (sorted.length - 1))] : sorted[0];
  let hi = trimmed ? sorted[Math.ceil(0.95 * (sorted.length - 1))] : sorted[sorted.length - 1];
  // All (nearly) the same value, like an eigenvalue 1 that rounding
  // spreads by about 1e-15: one bar in the middle, not a bar of noise.
  if (!(hi - lo > 1e-9 * Math.max(1, Math.abs(lo)))) { lo -= 0.5; hi = lo + 1; }
  const BARS = 60, counts = new Array(BARS).fill(0);
  for (const u of sorted) counts[Math.max(0, Math.min(BARS - 1, Math.floor((u - lo) / (hi - lo) * BARS)))]++;
  const bars = counts.map(function (count, i) {
    return { from: value(lo + (hi - lo) * i / BARS), to: value(lo + (hi - lo) * (i + 1) / BARS), value: count };
  });
  return barChart(canvas, bars, { from: value(lo), to: value(hi), scale: log ? "log" : "linear" },
                  { from: 0, to: Math.max(...counts), round: true, whole: true });
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

// One bar per entry of "bins" (as from powerOfTwoBins), numbered under
// it by the smallest size in it (1, 2, 4, 8, ...), counting "word" (e.g.
// "clusters") up the left. With "logScale", the counts are on a
// logarithmic scale (log of count + 1), so a power law shows as bars
// falling evenly.
function powerOfTwoBars(canvas, bins, word, logScale) {
  if (bins.length === 0) { chartPen(canvas); return; }
  const bars = bins.map(function (count, b) { return { from: b - 0.5, to: b + 0.5, value: count }; });
  return barChart(canvas, bars,
    { from: -0.5, to: bins.length - 0.5, whole: true, word: "size", text: function (b) { return shortLabel(Math.pow(2, b), Math.pow(2, b)); } },
    { from: 0, to: Math.max(...bins), scale: logScale ? "log+1" : "linear", round: !logScale, whole: true, word: word });
}

// How many regions there are of each size, as bars stacked by color,
// on a log-log chart: size across, count up, both on logarithmic
// scales (so a power law would show as bars falling along a straight
// line). "sizes" are the regions' sizes (whole numbers, at least 1),
// colorOf[r] is region r's color, and colors[c] is how color c is drawn.
// Every size has its own bar, never merged with others: size s goes
// from log(s - 1/2) to log(s + 1/2) across, so it sits over its tick,
// small sizes get wide bars and big ones thin bars packed close
// together. A bar's height is log(count + 1), and its colors split
// that height in proportion to their counts: color 0 at the bottom,
// then 1 on top of it, and so on (so with red and green, green sits on
// red). "word" says what is counted (e.g. "regions").
function stackedSizeBars(canvas, sizes, colorOf, colors, word) {
  if (sizes.length === 0) { chartPen(canvas); return; }
  // counts.get(s)[c] = the number of regions of size s and color c.
  const counts = new Map();
  let biggest = 1, most = 1;
  sizes.forEach(function (size, r) {
    if (!counts.has(size)) counts.set(size, new Array(colors.length).fill(0));
    counts.get(size)[colorOf[r]]++;
    biggest = Math.max(biggest, size);
  });
  const bars = [];
  counts.forEach(function (bar, size) {
    most = Math.max(most, bar.reduce(function (a, b) { return a + b; }, 0));
    bars.push({ from: size - 0.5, to: size + 0.5, pieces: bar.map(function (count, c) { return { value: count, color: colors[c] }; }) });
  });
  return barChart(canvas, bars,
    { from: 0.5, to: biggest + 0.5, scale: "log", whole: true, word: "size" },
    { from: 0, to: most, scale: "log+1", whole: true, word: "number of " + word + " (log-log)" });
}

// Each region (from findRegions, js/sim-domains.js) as a dot: area
// across, perimeter up, both on logarithmic scales (so 1, 10, 100, ...
// are evenly spaced), filled with its color (colorNames[color], with a
// thin "border" line around it). Regions with no other color next to
// them (perimeter 0) are left out.
function perimeterChart(canvas, regions, colorNames, border) {
  const points = [], colors = [];
  regions.areas.forEach(function (area, r) {
    if (regions.perimeters[r] === 0) return;
    points.push([area, regions.perimeters[r]]);
    colors.push(colorNames[regions.color[r]]);
  });
  const series = [{ points: points, dots: true, border: border, color: function (k) { return colors[k]; } }];
  return lineChart(canvas, series,
    { from: 1, to: Math.max(10, seriesRange(series, 0)[1]), scale: "log", word: "area" },
    { from: 1, to: Math.max(10, seriesRange(series, 1)[1]), scale: "log", round: true, word: "perimeter" });
}

// Each hole that has closed, as a dot: how long it lived (its
// persistence, died - born) up, against when it was born, or when it
// died ("against"), across. Holes are timed in steps (Eden Growth), or
// with "unit" set to "time", in time t (First Passage Percolation).
// Both scales are logarithmic (1, 10, 100, ... evenly spaced), as most
// holes close soon and births go from the first one to "now"; in steps
// both start at 1, in time at the first birth (or death) and the
// shortest life. A hole that lived no time at all (born and filled at
// the same moment, when several cells join at once) is left out: the
// set never has it. So is a hole born at time 0, against its birth (it
// was there from the start, and 0 has no place on a log scale). Dots
// are see-through, so where many fall together the color is darker.
function persistenceChart(canvas, births, deaths, against, now, unit) {
  const inTime = unit === "time";
  const points = [];
  for (let k = 0; k < births.length; k++) {
    const x = against === "death" ? deaths[k] : births[k];
    if (deaths[k] > births[k] && x > 0) points.push([x, deaths[k] - births[k]]);
  }
  const series = [{ points: points, dots: true, alpha: 0.35 }];
  if (inTime && !(now > 0)) { chartPen(canvas); return; }
  const [x0] = seriesRange(series, 0), [y0, y1] = seriesRange(series, 1);
  const xFrom = !inTime ? 1 : points.length ? x0 : now / 10, yFrom = !inTime ? 1 : points.length ? y0 : xFrom;
  const word = inTime ? "time t" : "step";
  return lineChart(canvas, series,
    { from: xFrom, to: Math.max(now, 10 * xFrom), scale: "log", word: (against === "death" ? "died at " : "born at ") + word },
    { from: yFrom, to: Math.max(10 * yFrom, y1), scale: "log", round: true, word: inTime ? "lived (time)" : "lived (steps)" });
}

// The gray of the radius charts' circle (the average) and of directions
// with no cell yet.
const RADIUS_GRAY = "#c9c6bf";

// The farthest cell in each direction (radii[k] for the slice k of the
// circle, from -180 degrees: newShape, js/sim-shape.js), over their
// average, as a loop around the start: a disk would be the gray circle (radius 1). Directions with
// no site yet are left out.
function radiusChart(canvas, radii) {
  const pen = chartPen(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const average = meanRadius(radii, 0, radii.length);
  if (average === 0) return;
  let biggest = 1.2;
  for (const r of radii) biggest = Math.max(biggest, r / average);
  const cx = w / 2, cy = h / 2, unit = (Math.min(w, h) / 2 - 6) / biggest;   // screen pixels for radius 1
  pen.strokeStyle = RADIUS_GRAY;
  pen.lineWidth = 1;
  pen.beginPath();
  pen.arc(cx, cy, unit, 0, 2 * Math.PI);
  pen.stroke();
  pen.textAlign = "left";
  pen.textBaseline = "top";
  pen.fillText("gray: the average", 0, 0);
  pen.beginPath();
  let drawing = false;
  radii.forEach(function (r, k) {
    if (r === 0) { drawing = false; return; }
    const angle = -Math.PI + (k + 0.5) * 2 * Math.PI / radii.length;
    const x = cx + unit * (r / average) * Math.cos(angle), y = cy - unit * (r / average) * Math.sin(angle);
    if (drawing) pen.lineTo(x, y); else pen.moveTo(x, y);
    drawing = true;
  });
  if (drawing && radii[0] > 0) {   // close the loop
    const r = radii[0];
    const angle = -Math.PI + 0.5 * 2 * Math.PI / radii.length;
    pen.lineTo(cx + unit * (r / average) * Math.cos(angle), cy - unit * (r / average) * Math.sin(angle));
  }
  pen.strokeStyle = CHART_LINE;
  pen.lineWidth = 1.5;
  pen.stroke();
}

// The average of radii[from .. to - 1], leaving out the 0s (no site yet).
function meanRadius(radii, from, to) {
  let total = 0, count = 0;
  for (let k = from; k < to; k++) if (radii[k] > 0) { total += radii[k]; count++; }
  return count === 0 ? 0 : total / count;
}

// The radii over time: one column per sample (times[j], called "word"
// along the bottom, like "step"), one row per direction (bins of them,
// -180 degrees at the bottom), colored by the radius over that sample's
// average: blue below, white at 1, red above (full color at 25% off).
// Gray: no cell that way yet.
function radiusHeatChart(canvas, times, radii, bins, word) {
  const columns = times.length;
  if (columns < 2) { chartPen(canvas); return; }
  const blue = hexToRGB("#3b6fb6"), red = hexToRGB("#c8402f"), gray = hexToRGB(RADIUS_GRAY);
  const averages = times.map(function (t, j) { return meanRadius(radii, j * bins, (j + 1) * bins); });
  function colorAt(j, k) {
    const r = radii[j * bins + k];
    if (r === 0) return gray;
    const off = Math.max(-1, Math.min(1, (r / averages[j] - 1) / 0.25));   // -1 .. 1
    const to = off < 0 ? blue : red, a = Math.abs(off);
    return [0, 1, 2].map(function (c) { return Math.round(255 + (to[c] - 255) * a); });
  }
  // Directions up the left (-180 degrees at the bottom), time along the bottom.
  heatChart(canvas, columns, bins, colorAt, { from: 0, to: times[columns - 1], word: word },
            { from: -180, to: 180, step: 90, text: function (angle) { return shortLabel(angle) + "°"; } });
}

// Numbers against numbers, both on logarithmic scales (1, 10, 100, ...
// evenly spaced), so a power law, y = c x^a, shows as a straight line of
// slope a. Each entry of "series" is as for drawSeries (a line, or
// dots); points with a number 0 or less are left out. "xWord" and
// "yWord" say what the numbers are. With "slope", a dashed gray guide
// line of that slope goes through the last point of the first series,
// to compare with.
function logLogChart(canvas, series, xWord, yWord, slope) {
  const positive = series.map(function (s) {
    return Object.assign({}, s, { points: s.points.filter(function (p) { return p[0] > 0 && p[1] > 0; }) });
  });
  if (positive[0].points.length < 2) { chartPen(canvas); return; }
  const [x0, x1] = seriesRange(positive, 0), [y0, y1] = seriesRange(positive, 1);
  if (slope) positive.unshift(guideLine(positive[0].points, slope, x0));
  return lineChart(canvas, positive, { from: x0, to: x1, scale: "log", word: xWord },
                   { from: y0, to: y1, scale: "log", round: true, word: yWord });
}

// The line y = c x^slope through the last of "points", from x = "from"
// to that point: dashed and gray, as a guide.
function guideLine(points, slope, from) {
  const [x1, y1] = points[points.length - 1];
  return { points: [[from, y1 * Math.pow(from / x1, slope)], [x1, y1]], color: CHART_TEXT, dashed: true, width: 1 };
}


/* =====================================================================
   5. ZOOMING IN TIME
   ===================================================================== */

// Zooming a chart in time, like the pictures, and with their code
// (connectWheel and connectPicture, js/sim-view.js, which the page loads
// too: the zoom says how it moves, with slide and zoomAt, as a picture's
// view does). On the chart,
//   mouse wheel, or pinch   zoom in or out around the pointer
//   drag                    move along in time
//   double-click            show the whole run again
// chartZoom(canvas, redraw) remembers which stretch of time is shown;
// "redraw" draws the chart again. When drawing, the chart asks
// shownTimes(zoom, first, last), where first .. last is the whole run,
// for the stretch to draw, and sets zoom.left and zoom.right to where
// time 'from' and time 'to' go on the canvas (in screen pixels): the
// frame's left and right.
// While the chart shows the whole run, it keeps growing with the run;
// zoomed in, it stays on the same stretch of time.
function chartZoom(canvas, redraw) {
  const zoom = {
    canvas: canvas, redraw: redraw,
    from: null, to: null,    // the stretch shown; null = the whole run
    first: 0, last: 1,       // the whole run (set by shownTimes)
    left: 0, right: 1,       // where the stretch goes on the canvas
    top: 0, movable: true, pointers: new Map(),   // (for js/sim-view.js)
  };

  // The time under a spot on the canvas, x pixels from its left side.
  function timeAt(x) {
    const [from, to] = shownTimes(zoom, zoom.first, zoom.last);
    return from + (to - from) * (x - zoom.left) / Math.max(1, zoom.right - zoom.left);
  }
  // Zoom by "factor" (2: twice as close) around the spot x pixels in.
  zoom.zoomAt = function (factor, x) {
    const [from, to] = shownTimes(zoom, zoom.first, zoom.last);
    const t = timeAt(x);
    const width = Math.max((to - from) / factor, 1e-9);
    if (width >= zoom.last - zoom.first) { zoom.from = zoom.to = null; }   // all of it
    else { zoom.from = t - (t - from) / factor; zoom.to = zoom.from + width; }
  };
  // Drag by dx pixels: the time under the pointer stays under it.
  zoom.slide = function (dx) {
    if (zoom.from === null) return;    // the whole run: nowhere to move
    const [from, to] = shownTimes(zoom, zoom.first, zoom.last);
    const shift = -dx * (to - from) / Math.max(1, zoom.right - zoom.left);
    zoom.from = from + shift;
    zoom.to = to + shift;
  };

  canvas.classList.add("scrollable");
  connectWheel(zoom);
  connectPicture(zoom);
  canvas.addEventListener("dblclick", function () { zoom.from = zoom.to = null; redraw(); });
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


/* =====================================================================
   6. NUMBERS
   ===================================================================== */

// The nicest of 1, 2, 5, 10, 20, 50, ... (times a power of 10) that is
// at least "rough": the step between grid lines on an axis.
function niceStep(rough) {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const k of [1, 2, 5, 10]) if (k * power >= rough) return k * power;
  return 10 * power;
}

// A number with 4 significant digits: 1.234, 0.0001234 -> 1.234e-4.
function niceNumber(v) {
  if (v === 0) return "0";
  if (!isFinite(v)) return String(v);
  if (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) return v.toExponential(3);
  return String(Number(v.toPrecision(4)));
}
