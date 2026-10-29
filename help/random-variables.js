/* =====================================================================
   random-variables.js  —  the Random Variables help page: a box to try,
                           and the table of every law
   ---------------------------------------------------------------------
   The box is the one the sims use (js/sim-random.js), with no sim
   behind it: type lines, move the sliders, and see any name's F. The
   tables list every law of js/sim-law-catalog.js, made from the
   catalog itself, so they always match what the box knows.

   The file is split into sections:
     1. The box to try
     2. The tables of laws
   ===================================================================== */


/* =====================================================================
   1. THE BOX TO TRY
   ===================================================================== */

// The lines the box starts with: random digits, as a family and a sum
// (nearly the Cantor law).
const FIRST_LINES = "X = sum(k, 1, 40, d_k / 3^k)\nd_k ~ unif([0, 2])";

// The sliders' numbers ({ letter: { value, min, max, step } }).
const sliders = {};

const box = connectRandomBox({
  reserved: [],
  onRead: function (declared) {
    showSliders(byId("sliders"), declared.letters, sliders, useSliders);   // (js/formulas.js)
    useSliders();
  },
  sliders: function () { return sliders; },
});

// The laws with the sliders' values now (the box draws the chart).
function useSliders() {
  box.build(sliderValues(sliders));
}


/* =====================================================================
   2. THE TABLES OF LAWS
   ===================================================================== */

// The source shown for a law with none of its own: the page's
// reference [3] for continuous laws, [4] for discrete ones.
const DISCRETE_GROUPS = [LAW_GROUPS[0], LAW_GROUPS[1]];
function lawSource(entry) {
  return entry.source || (DISCRETE_GROUPS.includes(entry.group) ? "[4]" : "[3]");
}

// What the "F" column says, for each kind of law.
const HOW_SHOWN = { exact: "from its formula", "added up": "added up from its density", estimated: "worked out from draws" };

// One table row: the cells' texts (set as text, so nothing in them is
// read as HTML), the first in a <code>.
function lawRow(cells) {
  const row = document.createElement("tr");
  cells.forEach(function (text, i) {
    const cell = document.createElement("td");
    if (i === 0) cell.appendChild(document.createElement("code")).textContent = text;
    else cell.textContent = text;
    row.appendChild(cell);
  });
  return row;
}

// A heading and a table for each group of the catalog, in the menu's
// order.
function showLawTables() {
  const holder = byId("law-tables");
  for (const group of LAW_GROUPS) {
    holder.appendChild(document.createElement("h3")).textContent = group;
    const wide = holder.appendChild(document.createElement("div"));
    wide.className = "help-wide";        // (scrolls sideways on a phone)
    const table = wide.appendChild(document.createElement("table"));
    table.className = "check-table";
    const body = table.appendChild(document.createElement("tbody"));
    body.innerHTML = "<tr><th>Typed as</th><th>Law</th><th>Values</th><th>Starts at</th><th>F</th><th>Source</th></tr>";
    for (const key in LAW_CATALOG) {
      const entry = LAW_CATALOG[key];
      if (entry.group !== group) continue;
      body.appendChild(lawRow([
        key + "(" + entry.params.join(", ") + ")", entry.name, entry.values,
        key + "(" + entry.defaults.join(", ") + ")", HOW_SHOWN[entry.how], lawSource(entry),
      ]));
    }
  }
}


// --- Start ------------------------------------------------------------
showLawTables();
box.setText(FIRST_LINES);
