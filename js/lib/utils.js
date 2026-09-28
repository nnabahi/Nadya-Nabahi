/* =========================================================
   Shared math / color helpers used across simulations.
   Kept dependency-free so any sim module can import it.
   ========================================================= */

export function mod(value, m) {
  return ((value % m) + m) % m;
}

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function randInt(lo, hi) {
  // inclusive of lo, exclusive of hi
  return lo + Math.floor(Math.random() * (hi - lo));
}

export function arrSum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

/* ---------- Color ---------- */

export function hsvToRgb([h, s, v]) {
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export function rgbToHex([r, g, b]) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hsvToHex(hsv) {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToRgbArr(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Linearly interpolate between two hex colors, t in [0,1]. */
export function mixHex(hexA, hexB, t) {
  t = clamp(t, 0, 1);
  const a = hexToRgbArr(hexA), b = hexToRgbArr(hexB);
  return rgbToHex([
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]);
}

/** A pleasant categorical/sequential palette generator: index i of n. */
export function paletteColor(i, n, satLow = 0.55, satHigh = 0.85, val = 0.95) {
  const hue = (i / Math.max(n, 1)) * 300; // avoid wrapping back to red
  const sat = n <= 1 ? satHigh : satLow + ((satHigh - satLow) * i) / (n - 1);
  return hsvToHex([hue, sat, val]);
}

/** A continuous "heat" colormap: t in [0,1] -> blue (cold/low) through to red (hot/high). */
export function heatColor(t) {
  const c = clamp(t, 0, 1);
  const hue = 225 - 225 * c;
  const sat = 0.7;
  const val = 0.35 + 0.55 * c;
  return hsvToHex([hue, sat, val]);
}

/* ---------- Small DOM helpers ---------- */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}
