/* =====================================================================
   sim-laws.js  —  the law of a random number, typed like a density in
                   Desmos, and drawing from it
   ---------------------------------------------------------------------
   Shared by the sims that let you choose the law (the distribution) of
   a random number, so every one offers the same box and the same
   presets (First Passage Percolation's passage times, so far). A page
   that loads this file loads math.js (https://mathjs.org) and
   js/formulas.js before it.

   You type the law as its density f(x), Desmos style (readTree,
   js/formulas.js): {condition: value, ...} is a piecewise formula. A
   piece whose condition is an equation is a point mass instead of
   density:
       {x = 0: p, x = 3: q, x >= 5: (1 - p - q) e^(5 - x), 0}
   puts mass p at 0 and q at 3, and spreads the rest over [5, infinity)
   with density (1 - p - q) e^(5 - x). A condition x = c puts its mass
   at c; any other equation, like mod(x, 1) = 0, puts mass at each
   whole number where it holds:
       {x < 0: 0, mod(x, 1) = 0: (1 - q) q^x, 0}
   is the geometric law on 0, 1, 2, ... (where the pieces don't say,
   as in {x >= 0: e^(-x)}, f is 0). The masses and the integral of the
   density should add up to 1; if they don't, everything is scaled so
   they do, and the box says so.

   HOW. The law becomes its distribution function F(x) = P(X <= x),
   kept as a table of points (x, F) with straight lines between them;
   a point mass is two points at the same x, a jump. The density is
   added up cell by cell on a fine grid, each cell's mass being f at
   its middle times its width (the "midpoint rule"). The grid's steps
   are powers of 2 (like 1/256), so its cells start and end exactly at
   0, 1, 5 and every number with a short binary expansion: a density
   that jumps there, like the uniform one on [0, 1], comes out exact.
   Elsewhere F is off by about f' h^2 (h the step), around 1e-6 for
   the exponential law.

   A random number with this law is X = F^-1(U), for U uniform in
   (0, 1), where F^-1(u) is the least x with F(x) >= u (the "inverse
   transform"; R. Durrett, "Probability: Theory and Examples", 5th ed.,
   Cambridge University Press, 2019, Theorem 1.2.2): exact at point
   masses, and in between exact for the table. F^-1(u) only goes up as
   u does, and moves a little when the law moves a little, so a sim
   that keeps the same U for each place keeps its sliders coupled.

   Contents:
     LAW_PRESETS                the laws to start from
     lawOptionsHTML()           the box (filled into .law-options)
     connectLaw(onChange)       the box on the page: the formula, its
                                sliders, the presets and the chart of F
     readLaw(tree, values)      a typed density (and its sliders'
                                values) -> the law, as its table
     drawFromLaw(law, u)        F^-1(u)
     lawCDF(law, x)             F(x)
     lawChart(canvas, law)      F drawn as a chart
   ===================================================================== */


// The laws to start from, in the order of the menu. Each has its name,
// its density f(x), and the settings of its sliders (if it has any).
// The exponential law with mean 1 is the default: with it, First
// Passage Percolation's ball on the sites grows exactly like Eden
// growth.
const LAW_PRESETS = {
  exponential: { name: "Exponential, mean 1", f: "{x >= 0: e^(-x), 0}" },
  uniform: { name: "Uniform on [0, 1]", f: "{0 <= x <= 1: 1, 0}" },
  geometric: { name: "Geometric from 0: P(k) = (1 - q) q^k", f: "{x < 0: 0, mod(x, 1) = 0: (1 - q) q^x, 0}",
               sliders: { q: { value: 0.5, min: 0, max: 0.99, step: 0.01 } } },
};

// How finely the density is added up: the fine grid has about this many
// cells across the part of the line where f isn't 0, and the search for
// that part looks at this many cells at a time.
const LAW_CELLS = 16384;
const LAW_SEARCH_CELLS = 1024;

// How far the search for the density and the point masses goes (in
// both directions), and when it stops: once doubling how far it looks
// adds less than LAW_TINY of what it has found.
const LAW_REACH = 1048576;     // 2^20
const LAW_TINY = 1e-12;

// The search for point masses on the whole numbers stops after this
// many whole numbers in a row with no mass (before it finds any), or,
// after it finds some, this many in a row that add less than LAW_TINY.
const LAW_EMPTY_RUN = 1000;
const LAW_TINY_RUN = 1000;


/* ---------------------------------------------------------------------
   THE BOX ON THE PAGE
   --------------------------------------------------------------------- */

fillBlocks(".law-options", lawOptionsHTML);

// The box, as HTML: the presets menu, the formula for f and its
// typeset preview, its sliders, a line for problems and notes, the
// chart of F, and how to type a law.
function lawOptionsHTML() {
  const presets = Object.keys(LAW_PRESETS).map(function (key) {
    return '<option value="' + key + '">' + LAW_PRESETS[key].name + "</option>";
  });
  return '<div class="option-row">Start from <select id="law-preset">' + presets.join("") +
      '<option value="custom" hidden>Your own</option></select></div>' +
    '<p class="small">The density <span class="tex">f(x)</span>:</p>' +
    '<input type="text" class="formula-input" id="law-formula" spellcheck="false">' +
    '<div class="formula-preview" id="law-preview"></div>' +
    '<div id="law-sliders"></div>' +
    '<p class="muted small" id="law-message"></p>' +
    '<canvas class="chart" id="law-chart"></canvas>' +
    '<p class="muted small">Type it as in Desmos: <code>{x &gt;= 0: e^(-x), 0}</code> is ' +
      "e<sup>&minus;x</sup> for x &ge; 0 and 0 otherwise. A piece with an equation is a point " +
      "mass: <code>{x = 3: p, ...}</code> puts mass p at 3, and another equation, like " +
      "<code>mod(x, 1) = 0</code>, puts mass on each whole number where it holds. " +
      "Any other letter gets a slider. The chart is F(x) = P(X &le; x).</p>";
}

// Connect the box. onChange(law) runs with the new law (readLaw) each
// time the formula or a slider changes and the law can be read; while
// it can't (a half-typed formula, say), the last good law stays, and
// the line under the sliders says what is wrong. "check" (optional) is
// the sim's own test of a law that can be read: check(law) is what is
// wrong with it for this sim ("" if nothing), shown the same way (First
// Passage Percolation's times can't be negative). Starts on the first
// preset. Returns "box":
//   box.law             the law in use
//   box.usePreset(key)  switch to a preset of LAW_PRESETS
function connectLaw(onChange, check) {
  const box = { law: null };
  const sliders = {};      // letter -> { value, min, max, step } (makeSlider, js/formulas.js)
  let tree = null;         // the formula, read

  function say(text) { byId("law-message").textContent = text; }

  // Read the formula: its preview, its sliders, and the law.
  function readFormula() {
    const text = byId("law-formula").value.trim();
    try {
      if (text === "") throw new Error("f is empty.");
      tree = readTree(text);
    } catch (problem) {
      say("Can't read it yet. " + problem.message);
      return;
    }
    if (window.katex) katex.render("f(x) = " + formulaTex(tree), byId("law-preview"), { throwOnError: false });
    showSliders(byId("law-sliders"), sliderLetters(tree, ["x"]), sliders, useLaw);   // (js/formulas.js)
    useLaw();
  }

  // The law from the formula and the sliders' values now.
  function useLaw() {
    const law = readLaw(tree, sliderValues(sliders));
    const problem = law.problem || (check ? check(law) : "");
    if (problem) { say(problem); return; }
    say(law.note);
    box.law = law;
    lawChart(byId("law-chart"), law);
    onChange(law);
  }

  box.usePreset = function (key) {
    const preset = LAW_PRESETS[key];
    byId("law-preset").value = key;
    byId("law-formula").value = preset.f;
    for (const letter in preset.sliders || {}) sliders[letter] = Object.assign({}, preset.sliders[letter]);
    readFormula();
  };

  byId("law-preset").addEventListener("change", function () { box.usePreset(byId("law-preset").value); });
  byId("law-formula").addEventListener("input", function () {
    byId("law-preset").value = "custom";
    readFormula();
  });
  box.usePreset(Object.keys(LAW_PRESETS)[0]);
  return box;
}

// F drawn as a chart, from a little left of where the law starts to
// where F reaches 0.999 (the far tail would squash the rest), from 0
// to 1 up. Point masses are the jumps.
function lawChart(canvas, law) {
  const from = Math.min(0, law.least), to = Math.max(from + 1e-9, drawFromLaw(law, 0.999));
  const points = [[from - 0.05 * (to - from), 0]];
  // The table's points in that range (at most about 2000 of them, which
  // is plenty for a chart), keeping every jump.
  const every = Math.max(1, Math.floor(law.xs.length / 2000));
  for (let i = 0; i < law.xs.length; i++) {
    const jump = (i > 0 && law.xs[i] === law.xs[i - 1]) || (i + 1 < law.xs.length && law.xs[i + 1] === law.xs[i]);
    if (law.xs[i] > to) { points.push([to, lawCDF(law, to)]); break; }
    if (jump || i % every === 0) points.push([law.xs[i], law.Fs[i]]);
  }
  lineChart(canvas, [{ points: points }], { from: points[0][0], to: to, word: "x" }, { from: 0, to: 1, word: "F(x)" });
}


/* ---------------------------------------------------------------------
   READING A LAW
   --------------------------------------------------------------------- */

// The law of the density "tree" (read by readTree), with the sliders'
// values "values" ({ letter: number }). Returns the law:
//   xs, Fs      the table of F: F(xs[i]) = Fs[i], straight between
//               (xs only goes up; two equal xs in a row are a jump)
//   least       where the law starts: P(X < least) = 0
//   mean        the mean of X
//   masses      the point masses, as [x, mass] (after scaling)
//   note        a line to show under the box ("" if there is nothing
//               to say), e.g. that the law was scaled to add up to 1
// or { problem } if it can't be one (f negative somewhere, say).
function readLaw(tree, values) {
  let parts;
  try { parts = splitMasses(tree); } catch (problem) { return { problem: problem.message }; }
  // The sliders' values and x, as math.js keeps them (a Map, made once:
  // f is worked out tens of thousands of times).
  const scope = new Map(Object.entries(values));
  // f(x) and the mass at x, with "undefined" (a piece with no
  // "otherwise", NaN) counting as 0, as Desmos draws nothing there.
  function valueAt(compiled, x) {
    scope.set("x", x);
    const v = Number(compiled.evaluate(scope));
    return Number.isNaN(v) ? 0 : v;
  }
  const density = function (x) { return valueAt(parts.density, x); };
  const massAt = function (x) { return valueAt(parts.mass, x); };

  let masses, grid;
  try {
    masses = findMasses(parts, scope, massAt);
    grid = parts.noDensity ? null : densityGrid(density);
  } catch (problem) {
    return { problem: problem.message };
  }
  return lawFromParts(masses, grid);
}

// Split the formula into its density (the formula with every point
// mass piece left out; noDensity if that is 0 everywhere) and its
// masses (each mass piece's value where its equation holds, 0
// everywhere else), both compiled, and where the
// masses may be: the c of each piece "x = c" (as formulas, since c may
// have sliders), and whether some other equation puts masses on the
// whole numbers. A point mass piece hidden inside a bigger formula,
// like 2 {x = 0: 1, 0}, can't be found, so it is refused.
function splitMasses(tree) {
  const points = [];
  let wholeNumbers = false;
  const bare = function (n) { while (n.isParenthesisNode) n = n.content; return n; };
  const hasEquation = function (n) { return n.filter(function (m) { return m.isOperatorNode && m.fn === "equal"; }).length > 0; };
  const isX = function (n) { n = bare(n); return n.isSymbolNode && n.name === "x"; };
  const hasX = function (n) { return n.filter(function (m) { return m.isSymbolNode && m.name === "x"; }).length > 0; };
  // The c of an equation "x = c" (or "c = x") with no x in c, or null.
  function pointOf(condition) {
    const c = bare(condition);
    if (!(c.isOperatorNode && c.fn === "equal")) return null;
    const [a, b] = c.args;
    if (isX(a) && !hasX(b)) return b;
    if (isX(b) && !hasX(a)) return a;
    return null;
  }
  function densityOf(node) {
    const n = bare(node);
    if (!n.isConditionalNode) return node;
    if (hasEquation(n.condition)) {
      const c = pointOf(n.condition);
      if (c) points.push(c.compile()); else wholeNumbers = true;
      return densityOf(n.falseExpr);
    }
    return new math.ConditionalNode(n.condition, densityOf(n.trueExpr), densityOf(n.falseExpr));
  }
  function massOf(node) {
    const n = bare(node);
    if (!n.isConditionalNode) return new math.ConstantNode(0);
    if (hasEquation(n.condition)) return new math.ConditionalNode(n.condition, n.trueExpr, massOf(n.falseExpr));
    return new math.ConditionalNode(n.condition, massOf(n.trueExpr), massOf(n.falseExpr));
  }
  // Is the density 0 whatever x is (every piece left is 0, as in the
  // geometric law)? Then there is no density to look for.
  function isZero(node) {
    const n = bare(node);
    if (n.isConditionalNode) return isZero(n.trueExpr) && isZero(n.falseExpr);
    return n.isConstantNode && Number(n.value) === 0;
  }
  const density = densityOf(tree);
  if (hasEquation(density)) {
    throw new Error("Put each point mass in its own piece, like {x = 0: p, ...}, not inside a bigger formula.");
  }
  return { density: density.compile(), noDensity: isZero(density), mass: massOf(tree).compile(),
           points: points, wholeNumbers: wholeNumbers };
}

// The point masses, as a list of [x, mass] sorted by x, from the
// pieces' points c and, if an equation needs them, the whole numbers.
function findMasses(parts, scope, massAt) {
  const found = new Map();     // x -> its mass
  function look(x) {
    if (found.has(x)) return 0;
    const m = massAt(x);
    if (m < 0 || !isFinite(m)) throw new Error("The point mass at x = " + x + " is " + m + "; it should be 0 or more.");
    if (m > 0) found.set(x, m);
    return m;
  }
  for (const point of parts.points) {
    const c = Number(point.evaluate(scope));
    if (!isFinite(c)) throw new Error("A point mass's place, x = c, isn't a number.");
    look(c);
  }
  if (parts.wholeNumbers) {
    for (const direction of [1, -1]) {
      let total = 0, run = 0, runMass = 0, any = false;
      for (let k = direction === 1 ? 0 : -1; Math.abs(k) <= LAW_REACH; k += direction) {
        const m = look(k);
        total += m; runMass += m; run++;
        any = any || m > 0;
        if (!any && run >= LAW_EMPTY_RUN) break;
        if (any && run >= LAW_TINY_RUN) {
          if (runMass < LAW_TINY * total) break;
          run = 0; runMass = 0;
        }
      }
    }
  }
  return Array.from(found).sort(function (a, b) { return a[0] - b[0]; });
}

// The density on a fine grid: where f isn't 0 (the search), then the
// grid's cells there, with steps a power of 2, and the mass of each
// cell (f at its middle times the step). Returns { start, step, cells }
// (cell i is from start + i step to start + (i + 1) step, with mass
// cells[i]), or null if f is 0 everywhere the search looked.
function densityGrid(density) {
  // The search: [-1, 1], then the new parts of [-2, 2], [-4, 4], ...,
  // each LAW_SEARCH_CELLS cells, until doubling adds almost nothing.
  let low = Infinity, high = -Infinity, total = 0;
  function search(from, to) {
    const h = (to - from) / LAW_SEARCH_CELLS;
    let added = 0;
    for (let i = 0; i < LAW_SEARCH_CELLS; i++) {
      const a = from + i * h, f = cellMass(density, a, h);
      if (f > 0) { low = Math.min(low, a); high = Math.max(high, a + h); added += f; }
    }
    return added;
  }
  total = search(-1, 1);
  for (let reach = 2; reach <= LAW_REACH; reach *= 2) {
    const added = search(-reach, -reach / 2) + search(reach / 2, reach);
    total += added;
    if (total > 0 && added <= LAW_TINY * total) break;
  }
  if (total === 0) return null;
  // The fine grid on [low, high], its step the power of 2 that gives
  // at most LAW_CELLS cells there, its ends whole steps.
  const step = Math.pow(2, Math.ceil(Math.log2((high - low) / LAW_CELLS)));
  const start = Math.floor(low / step) * step, count = Math.ceil((high - start) / step);
  const cells = new Float64Array(count);
  for (let i = 0; i < count; i++) cells[i] = cellMass(density, start + i * step, step);
  return { start: start, step: step, cells: cells };
}

// The mass of the cell from a to a + h: f at its middle times h. f
// can't be negative or infinite.
function cellMass(density, a, h) {
  const f = density(a + h / 2);
  if (f < 0 || !isFinite(f)) {
    throw new Error("f is " + (f < 0 ? "negative" : f) + " near x = " + Number((a + h / 2).toPrecision(4)) +
                    "; a density is 0 or more everywhere.");
  }
  return f * h;
}

// The law from its point masses (sorted [x, mass]) and its density's
// grid (or null): the table of F, scaled to end at 1, and the rest of
// what readLaw returns. The table goes along the grid's points, and
// each point mass is a jump on top of the density's mass up to its
// place (a mass on a grid point comes just after that point, so the
// jump starts at F's value there).
function lawFromParts(masses, grid) {
  const xs = [], Fs = [];
  const densityUpTo = grid ? gridMassUpTo(grid) : function () { return 0; };
  let massSum = 0, k = 0;     // the point masses so far, and the next one
  function jumpsBefore(x) {
    for (; k < masses.length && masses[k][0] < x; k++) {
      const [place, mass] = masses[k], below = densityUpTo(place) + massSum;
      xs.push(place, place);
      Fs.push(below, below + mass);
      massSum += mass;
    }
  }
  if (grid) {
    for (let i = 0; i <= grid.cells.length; i++) {
      const x = grid.start + i * grid.step;
      jumpsBefore(x);
      xs.push(x);
      Fs.push(densityUpTo(x) + massSum);
    }
  }
  jumpsBefore(Infinity);
  return finishLaw(xs, Fs, densityUpTo(Infinity) + massSum, masses);
}

// The density's mass up to z, from its grid: whole cells, and the
// part of the cell z is in (straight across the cell, as the table has
// it).
function gridMassUpTo(grid) {
  const { start, step, cells } = grid;
  const upTo = new Float64Array(cells.length + 1);    // upTo[i]: up to grid point i
  for (let i = 0; i < cells.length; i++) upTo[i + 1] = upTo[i] + cells[i];
  return function (z) {
    const i = Math.floor((z - start) / step);
    if (i < 0) return 0;
    if (i >= cells.length) return upTo[cells.length];
    return upTo[i] + cells[i] * (z - (start + i * step)) / step;
  };
}

// Scale F to end at 1, and the law's other numbers.
function finishLaw(xs, Fs, total, masses) {
  if (!(total > 0)) return { problem: "f adds up to 0: there is nothing to draw from." };
  const law = { xs: Float64Array.from(xs), Fs: Float64Array.from(Fs, function (F) { return F / total; }) };
  law.Fs[law.Fs.length - 1] = 1;
  // Where it starts: the first point of the table after which F goes up.
  let i = 0;
  while (i + 1 < law.Fs.length && law.Fs[i + 1] === 0) i++;
  law.least = law.xs[i];
  // The mean: each straight piece of F is a uniform stretch (or, for a
  // jump, a point), whose mean is its middle.
  law.mean = 0;
  for (let j = 1; j < law.xs.length; j++) law.mean += (law.Fs[j] - law.Fs[j - 1]) * (law.xs[j] + law.xs[j - 1]) / 2;
  law.masses = masses.map(function ([x, m]) { return [x, m / total]; });
  law.note = Math.abs(total - 1) > 1e-6
    ? "f adds up to " + Number(total.toPrecision(6)) + ", not 1, so it is scaled to add up to 1." : "";
  return law;
}


/* ---------------------------------------------------------------------
   DRAWING FROM A LAW
   --------------------------------------------------------------------- */

// F^-1(u), for u in (0, 1): the least x with F(x) >= u. The first
// point of the table with F at least u, and back along the straight
// piece before it (at a jump, that is the jump's place, exactly).
function drawFromLaw(law, u) {
  const xs = law.xs, Fs = law.Fs;
  let lo = 0, hi = Fs.length - 1;     // Fs[hi] = 1 >= u
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Fs[mid] >= u) hi = mid; else lo = mid + 1;
  }
  if (lo === 0) return xs[0];
  const F0 = Fs[lo - 1], F1 = Fs[lo];
  return xs[lo - 1] + (u - F0) / (F1 - F0) * (xs[lo] - xs[lo - 1]);
}

// F(x) = P(X <= x): from the last point of the table at or left of x
// (the top of a jump there), along the straight piece after it.
function lawCDF(law, x) {
  const xs = law.xs, Fs = law.Fs;
  if (x < xs[0]) return 0;
  let lo = 0, hi = xs.length - 1;     // the last i with xs[i] <= x
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid - 1;
  }
  if (lo === xs.length - 1) return 1;
  return Fs[lo] + (x - xs[lo]) / (xs[lo + 1] - xs[lo]) * (Fs[lo + 1] - Fs[lo]);
}
