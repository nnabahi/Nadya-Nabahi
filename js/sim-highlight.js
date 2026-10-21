/* =====================================================================
   sim-highlight.js  —  click a cell to highlight its region
   ---------------------------------------------------------------------
   Shared by the sims whose cells have colors (opinions, spins, states,
   tiles, clusters). A REGION is a connected piece of one color: the
   cells joined to each other through neighbors of the same color, with
   "neighbor" meaning what the sim itself means by it (regionOf,
   js/sim-domains.js). That works the same on every domain: squares,
   other tilings, Penrose tilings, hyperbolic tilings and trees.

   Clicking a cell highlights its region: every other cell fades (it is
   mixed with white). The highlight FOLLOWS THE CLICKED CELL: as the sim
   runs, it shows whatever region holds that cell right now, so you can
   watch one region grow, shrink or split. (If the cell changes color,
   the highlight moves to its new region.) Clicking the region again, or
   outside the cells, turns the highlight off.

   How a page uses it:
     const highlight = newHighlight();       once
     clickHighlight(highlight, v, colors)    on a click on cell v (-1: outside)
     findHighlight(highlight, d, colors)     before each drawing
     isFaded(highlight, v)                   is cell v faded?
   and, to paint with it (js/sim-view.js),
     highlightGroups(highlight, groupOf, count)   for paintDomain / paintCells
     highlightRGB(rgbOf, count)                   ... with these colors
     highlightCSS(highlight, colorOf)             for drawBall, paintLattice
     highlightText(highlight, word, name)         the line under the picture
     highlightTextIf(highlight, on, word, name)   ... where a click can also do something else
   "colors" is the sim's coloring, one color number per cell (-1 for a
   cell with no color, which is in no region).

   Load this file after js/sim-colors.js and js/sim-domains.js.
   ===================================================================== */


// Faded cells are mixed with this much white (0 = unchanged, 1 = white).
const FADE = 0.8;

// A color [red, green, blue] (0 .. 255), or "#rrggbb", faded.
function fadeRGB(rgb) { return rgb.map(function (t) { return t + (255 - t) * FADE; }); }
function fadeHex(hex) { return rgbToHex(fadeRGB(hexToRGB(hex))); }

// A page's highlight: nothing clicked yet.
//   cell     the clicked cell (-1: none)
//   inside   inside[v] = 1 for the cells of its region, or null when
//            nothing is highlighted (worked out by findHighlight)
//   color    the region's color, and size its number of cells
function newHighlight() {
  return { cell: -1, inside: null, color: -1, size: 0 };
}

// A click on cell v (-1: outside the cells). It highlights v's region,
// or turns the highlight off if v is already in it, or is outside, or
// has no color.
function clickHighlight(h, v, colors) {
  const again = h.inside !== null && v !== -1 && h.inside[v] === 1;
  h.cell = (v === -1 || colors[v] === -1 || again) ? -1 : v;
  h.inside = null;           // worked out again before the next drawing
}

// Turn the highlight off (for a new domain, say, where the clicked cell
// means something else).
function clearHighlight(h) {
  h.cell = -1;
  h.inside = null;
}

// Find the clicked cell's region in the coloring as it is now, before
// drawing. While the cell has no color (a gap, say), nothing is
// highlighted, and its region shows again once it has one.
function findHighlight(h, d, colors) {
  h.inside = null;
  h.color = -1;
  h.size = 0;
  if (h.cell === -1 || h.cell >= d.n || colors[h.cell] === -1) return;
  h.inside = regionOf(d, colors, h.cell);
  h.color = colors[h.cell];
  for (let v = 0; v < d.n; v++) h.size += h.inside[v];
}

// Is cell v faded? (Only while a region is highlighted.)
function isFaded(h, v) { return h.inside !== null && h.inside[v] === 0; }

// For painting with paintDomain or paintCells (js/sim-view.js), whose
// cells are in groups 0 .. count-1 (their colors, usually): a faded
// cell goes in group + count instead, and highlightRGB paints those
// groups faded. Lines between groups stay where they were, since a
// region never has a neighbor of its own color outside it.
function highlightGroups(h, groupOf, count) {
  return function (v) { const g = groupOf(v); return g >= 0 && isFaded(h, v) ? g + count : g; };
}
function highlightRGB(rgbOf, count) {
  return function (g) { return g >= count ? fadeRGB(rgbOf(g - count)) : rgbOf(g); };
}

// For pictures colored cell by cell with CSS colors ("#rrggbb"), such
// as drawBall (js/sim-hyperbolic.js): colorOf(v) with the faded cells
// faded. Each color is faded once and remembered.
function highlightCSS(h, colorOf) {
  const faded = new Map();
  return function (v) {
    const color = colorOf(v);
    if (!isFaded(h, v) || color === null) return color;
    if (!faded.has(color)) faded.set(color, fadeHex(color));
    return faded.get(color);
  };
}

// The line under the picture: how to highlight, or what is highlighted.
// "word" is what the sim calls a region ("region", "domain",
// "cluster"), and name(c) what it calls color c (like "opinion 2").
function highlightText(h, word, name) {
  if (h.cell === -1) return "Click a cell to highlight its " + word + " (its connected piece of one color).";
  if (h.inside === null) return "The clicked cell has no color right now: its " + word +
    " shows again once it has one. Click another cell, or outside the cells, to choose again.";
  return "Highlighted: a " + word + " of " + name(h.color) + ", " + h.size.toLocaleString() +
    (h.size === 1 ? " cell" : " cells") + ". Click it again, or outside the cells, to show everything.";
}

// The same line, on a page where a click can do something else instead
// (a choice under the picture): it says nothing unless clicks highlight
// ("on" true) or a region is still highlighted.
function highlightTextIf(h, on, word, name) {
  return on || h.cell !== -1 ? highlightText(h, word, name) : "";
}
