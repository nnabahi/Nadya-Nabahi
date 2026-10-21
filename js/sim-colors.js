/* =====================================================================
   sim-colors.js  —  the colors the sims share
   ---------------------------------------------------------------------
   The old site's colors, the colors every picture of cells shares, and
   turning a color from one way of writing it into another.

   Contents:
     CELL_LINES, OUTSIDE_CELLS, NO_COLOR   the colors of every picture of cells
     defaultColor(c, count)   the old site's colors
     defaultColors(count)     ... all "count" of them, as a list
     hsvToHex, hexToHSV       a color as hue, saturation and brightness,
                              and back
     hexToRGB, rgbToHex       a color "#rrggbb" as three numbers, and back
     heatColor(t)             blue (t = 0) to red (t = 1), for heights
   ===================================================================== */


// Every picture of cells is drawn with these:
const CELL_LINES = "#1e1e1e";      // the lines between cells of different colors
const OUTSIDE_CELLS = "#ecebe7";   // where there are no cells: around a drawn domain, or a hyperbolic ball
const NO_COLOR = "#ffffff";        // a cell with no color (-1): not reached yet, or a gap

// How color c (of "count" colors) is drawn: the old site's colors.
// Hues are spread evenly from red (0 degrees) round to magenta (300; going
// all the way to 360 would come back to red), each color a little more
// saturated than the last, all bright. Hue, saturation and brightness
// ("HSV") are turned into the usual "#rrggbb".
function defaultColor(c, count) {
  const hue = c / Math.max(count, 1) * 300;
  const saturation = count <= 1 ? 0.85 : 0.55 + 0.30 * c / (count - 1);
  return hsvToHex(hue, saturation, 0.95);
}

// All "count" of them, as a list: color c is defaultColor(c, count).
function defaultColors(count) {
  const colors = [];
  for (let c = 0; c < count; c++) colors.push(defaultColor(c, count));
  return colors;
}

// Hue (0 .. 360), saturation and brightness (0 .. 1) -> "#rrggbb".
function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = value - chroma;
  const [r, g, b] =
    hue < 60  ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] :
    hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return "#" + [r, g, b].map(function (t) {
    return Math.round((t + m) * 255).toString(16).padStart(2, "0");
  }).join("");
}

// "#rrggbb" -> [hue, saturation, brightness], the other way round, as in
// nadya's ColorFunctions.js (the sandpiles sim mixes colors with it).
function hexToHSV(hex) {
  const [r, g, b] = hexToRGB(hex).map(function (t) { return t / 255; });
  const most = Math.max(r, g, b), least = Math.min(r, g, b), spread = most - least;
  let hue = 0;
  if (spread > 0) {
    if (most === r) hue = 60 * (((g - b) / spread) % 6);
    else if (most === g) hue = 60 * (2 + (b - r) / spread);
    else hue = 60 * (4 + (r - g) / spread);
  }
  if (hue < 0) hue += 360;
  return [hue, most === 0 ? 0 : spread / most, most];
}

// "#rrggbb" -> [red, green, blue], each 0 .. 255 (for pictures drawn
// pixel by pixel), and back.
function hexToRGB(hex) {
  return [1, 3, 5].map(function (k) { return parseInt(hex.slice(k, k + 2), 16); });
}
function rgbToHex(rgb) {
  return "#" + rgb.map(function (t) { return Math.round(t).toString(16).padStart(2, "0"); }).join("");
}

// A height t from 0 (low: dark blue) to 1 (high: red), as [red, green,
// blue], each 0 .. 255. The colors run smoothly in between, the same way
// as Eden Growth's heights: the hue goes from 225 (blue) to 0
// (red), and the color gets brighter on the way up.
function heatColor(t) {
  const down = 1 - Math.min(Math.max(t, 0), 1);   // 1 at the bottom, 0 at the top
  return hexToRGB(hsvToHex(225 * down, 0.7, 0.9 - 0.55 * down));
}
