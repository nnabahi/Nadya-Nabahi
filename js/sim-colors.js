/* =====================================================================
   sim-colors.js  —  the colors the sims share
   ---------------------------------------------------------------------
   The old site's colors, and turning a color from one way of writing
   it into another.

   Contents:
     defaultColor(c, count)   the old site's colors
     hsvToHex, hexToHSV       a color as hue, saturation and brightness,
                              and back
     hexToRGB, rgbToHex       a color "#rrggbb" as three numbers, and back
   ===================================================================== */


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
