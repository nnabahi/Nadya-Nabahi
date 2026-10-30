/* =====================================================================
   sim-laws.js  —  the law of a random number: kept as its distribution
                   function F, read from a typed density, and drawn from
   ---------------------------------------------------------------------
   Shared by every sim that lets you choose the law (the distribution)
   of a random number, through the Random variables box
   (js/sim-random.js). The named laws, like normal(0, 1), are in
   js/sim-law-catalog.js; this file is what they are all built from. A
   page that loads this file loads math.js (https://mathjs.org) and
   js/formulas.js before it.

   A LAW, here, is the distribution of one random number X, kept as an
   object with:
     xs, Fs       a table of its distribution function F(x) = P(X <= x):
                  F(xs[i]) = Fs[i], with straight lines between. xs only
                  goes up; two equal xs in a row are a jump, a point
                  mass. The table is what the law's chart shows.
     least, most  where X can be: P(least <= X <= most) = 1 (they may be
                  -Infinity and Infinity)
     mean         the mean E[X] (Infinity, -Infinity, or NaN when X has
                  no mean, like the Cauchy law)
     masses       the point masses, as [x, mass]
     quantile(u)  F^-1(u) exactly, for a law that has a formula for it
     cdf(x)       F(x) exactly, for a law that has a formula for it
     draw(uniform)  for the few laws that need more than one uniform
                  number for a draw (stable laws, say): a draw, from
                  uniform(0), uniform(1), ...
     estimated    for a law worked out from draws (a formula of other
                  random variables), how many; 0 otherwise
     note         a line to show under the box ("" if nothing)

   DRAWING. A random number with law F is X = F^-1(U), for U uniform in
   (0, 1), where F^-1(u) is the least x with F(x) >= u (the "inverse
   transform"; R. Durrett, "Probability: Theory and Examples", 5th ed.,
   Cambridge University Press, 2019, Theorem 1.2.2). F^-1(u) only goes
   up as u does, and moves a little when the law moves a little, so a
   sim that keeps the same U for each place keeps its sliders coupled.

   Contents:
     readLaw(tree, values)      a typed density -> its law
     lawFromCDF(spec)           a law from its exact F (and F^-1, if known)
     lawFromDensity(spec)       a law from its density, added up
     gaussLegendre(n)           the points and weights of Gauss-Legendre quadrature
     lawFromMasses(spec)        a law on whole numbers, from its masses
     pointMassLaw(c)            all the mass at c
     lawFromDraws(values)       a law worked out from many draws
     sizeBiasedLaw(law)         the law with each value's chance times the value
     drawFromLaw(law, u)        F^-1(u)
     drawWith(law, uniform)     a draw, from as many uniform numbers as it needs
     lawCDF(law, x)             F(x)
     lawChart(canvas, law)      F drawn as a chart
   ===================================================================== */


// How finely a typed density is added up: the fine grid has about this
// many cells across the part of the line where f isn't 0, and the
// search for that part looks at this many cells at a time.
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

// A typed density must add up to 1. Adding it up on the grid is off by
// a little (most for a density that goes to infinity at an end, like
// 1/sqrt(x) near 0: about 0.003 there), so a total this close to 1
// counts as 1 and is scaled to exactly 1; anything further is refused.
const LAW_ADDS_UP = 0.005;

// Tables made from an exact F: how many points to start with, the most
// any straight piece may rise (a piece that rises more is split until
// it doesn't), and how little may be left beyond the table's ends.
const TABLE_POINTS = 2048;
const TABLE_RISE = 1 / 4096;
const TABLE_TAIL = 1e-15;

// Tables made from a density: how many cells it is added up over.
const DENSITY_CELLS = 8192;

// A law worked out from draws keeps at most about this many points.
const DRAWS_TABLE = 8192;


/* ---------------------------------------------------------------------
   READING A TYPED DENSITY
   ---------------------------------------------------------------------
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
   density must add up to 1: if they don't, the law is refused, and the
   box says what they add up to.

   HOW. The law becomes its table of F. The density is added up cell
   by cell on a fine grid, each cell's mass being f at its middle times
   its width (the "midpoint rule"). The grid's steps are powers of 2
   (like 1/256), so its cells start and end exactly at 0, 1, 5 and every
   number with a short binary expansion: a density that jumps there,
   like the uniform one on [0, 1], comes out exact. Elsewhere F is off
   by about f' h^2 (h the step), around 1e-6 for the exponential law.
   --------------------------------------------------------------------- */

// The law of the density "tree" (read by readTree), with the sliders'
// values "values" ({ letter: number }). Returns the law, or { problem }
// if it can't be one (f negative somewhere, or not adding up to 1).
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
// grid (or null): the table of F, and the rest of what readLaw returns.
// The table goes along the grid's points, and each point mass is a
// jump on top of the density's mass up to its place (a mass on a grid
// point comes just after that point, so the jump starts at F's value
// there).
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
  return finishTypedLaw(xs, Fs, densityUpTo(Infinity) + massSum, masses);
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

// A typed law's table, once it adds up to 1 (within LAW_ADDS_UP): F
// scaled to end at exactly 1, and the law's other numbers.
function finishTypedLaw(xs, Fs, total, masses) {
  if (!(total > 0)) return { problem: "f adds up to 0: there is nothing to draw from." };
  if (Math.abs(total - 1) > LAW_ADDS_UP) {
    return { problem: "f adds up to " + Number(total.toPrecision(4)) + ", not 1. A density (with its point masses) " +
                      "must add up to 1." };
  }
  const law = finishTable(xs, Fs.map(function (F) { return F / total; }));
  law.masses = masses.map(function ([x, m]) { return [x, m / total]; });
  law.Fs[law.Fs.length - 1] = 1;
  return law;
}


/* ---------------------------------------------------------------------
   LAWS FROM THEIR FORMULAS (the catalog's laws, js/sim-law-catalog.js)
   ---------------------------------------------------------------------
   A law with a formula for F gets a table of exact values of F. The
   table's points are spread so that every part of the line where X
   has mass gets many of them:
     - on a bounded stretch [a, b], at x = a + (b - a)(1 - cos(pi t))/2
       for t evenly spaced in [0, 1], closer together near the ends,
       where densities like the arcsine law's go to infinity;
     - on a half line [a, infinity), at x = a + s t / (1 - t), with s
       the distance from a to the median;
     - on the whole line, at x = m + s tan(pi (t - 1/2)), with m the
       median and s half the distance between the quartiles.
   Then every straight piece where F rises more than TABLE_RISE is cut
   in half until it doesn't, and the table goes on out (doubling its
   reach) until less than TABLE_TAIL of the mass is left beyond it.
   A draw beyond the table's ends (a chance below TABLE_TAIL) comes
   from F itself, by halving (bisection).
   --------------------------------------------------------------------- */

// A law from its exact distribution function. "spec" has:
//   cdf(x)          F(x), exactly (or as near as the computer can)
//   least, most     where X can be (may be -Infinity, Infinity)
//   quantile(u)     F^-1(u), if there is a formula for it (optional)
//   mean            E[X], if known (optional; else from the table)
function lawFromCDF(spec) {
  const cdf = spec.cdf, quantile = spec.quantile || function (u) { return invertCDF(cdf, u, spec.least, spec.most); };
  const xs = startingPoints(spec.least, spec.most, quantile);
  const table = refineTable(xs, xs.map(cdf), cdf);
  extendTails(table, cdf, spec.least, spec.most, quantile(0.5));
  const law = finishTable(table.xs, table.Fs);
  law.cdf = cdf;
  if (spec.quantile) law.quantile = spec.quantile;
  law.least = spec.least;
  law.most = spec.most;
  if (spec.mean !== undefined) law.mean = spec.mean;
  return law;
}

// The table's first points (see above), from where X can be and its
// quantiles (for the median and quartiles).
function startingPoints(least, most, quantile) {
  const xs = [], n = TABLE_POINTS;
  if (isFinite(least) && isFinite(most)) {
    for (let i = 0; i <= n; i++) xs.push(least + (most - least) * (1 - Math.cos(Math.PI * i / n)) / 2);
  } else if (isFinite(least) || isFinite(most)) {
    // A half line: [least, infinity), or (-infinity, most] the other way round.
    const end = isFinite(least) ? least : most, side = isFinite(least) ? 1 : -1;
    const s = Math.abs(quantile(0.5) - end) || 1;
    for (let i = 0; i < n; i++) xs.push(end + side * s * (i / n) / (1 - i / n));
    if (side < 0) xs.reverse();
  } else {
    const m = quantile(0.5), s = (quantile(0.75) - quantile(0.25)) / 2 || 1;
    for (let i = 1; i < n; i++) xs.push(m + s * Math.tan(Math.PI * (i / n - 0.5)));
  }
  return xs;
}

// Cut every straight piece of the table where F rises more than
// TABLE_RISE in half, again and again (at most 50 times over), so that
// a law whose mass sits in a small part of the line still gets enough
// points there. Returns { xs, Fs } (plain lists).
function refineTable(xs, Fs, cdf) {
  const outX = [xs[0]], outF = [Fs[0]];
  // (F never goes down, though rounding in a formula could make it look
  // so: each point's F is at least the one before it.)
  for (let i = 1; i < xs.length; i++) {
    const F0 = outF[outF.length - 1];
    addPiece(xs[i - 1], F0, xs[i], Math.max(Fs[i], F0), 0);
  }
  return { xs: outX, Fs: outF };
  function addPiece(x0, F0, x1, F1, depth) {
    if (F1 - F0 > TABLE_RISE && depth < 60 && x1 - x0 > 1e-15 * Math.max(Math.abs(x0), Math.abs(x1))) {
      const xm = (x0 + x1) / 2, Fm = Math.min(Math.max(cdf(xm), F0), F1);
      addPiece(x0, F0, xm, Fm, depth + 1);
      addPiece(xm, Fm, x1, F1, depth + 1);
    } else {
      outX.push(x1);
      outF.push(F1);
    }
  }
}

// Go on out past the table's ends, doubling the distance from the
// median each time, until less than TABLE_TAIL is left beyond them.
function extendTails(table, cdf, least, most, median) {
  const { xs, Fs } = table;
  for (let k = 0; k < 2000 && isFinite(xs[xs.length - 1]) && 1 - Fs[Fs.length - 1] > TABLE_TAIL; k++) {
    const last = xs[xs.length - 1];
    const x = Math.min(most, last + Math.max(last - median, 1));
    xs.push(x);
    Fs.push(Math.max(cdf(x), Fs[Fs.length - 1]));
    if (x === most) break;
  }
  for (let k = 0; k < 2000 && isFinite(xs[0]) && Fs[0] > TABLE_TAIL; k++) {
    const first = xs[0];
    const x = Math.max(least, first - Math.max(median - first, 1));
    xs.unshift(x);
    Fs.unshift(Math.min(cdf(x), Fs[0]));
    if (x === least) break;
  }
}

// F^-1(u) from F itself: the least x with F(x) >= u, found by halving
// (bisection), after first doubling outward from the median-ish guess
// until the answer is caught between two points. For a law on whole
// numbers ("whole"), the answer is a whole number.
function invertCDF(cdf, u, least, most, whole) {
  let lo, hi;
  const start = isFinite(least) ? least : isFinite(most) ? most : 0;
  if (cdf(start) >= u) {
    hi = start;
    lo = start;
    for (let step = 1; cdf(lo) >= u; step *= 2) {
      if (lo <= least || step > 1e300) return Math.max(lo, least);
      lo = Math.max(least, hi - step);
    }
  } else {
    lo = start;
    hi = start;
    for (let step = 1; cdf(hi) < u; step *= 2) {
      if (hi >= most || step > 1e300) return Math.min(hi, most);
      hi = Math.min(most, lo + step);
    }
  }
  // Now F(lo) < u <= F(hi).
  for (let k = 0; k < 200; k++) {
    if (whole ? hi - lo <= 1 : hi - lo <= 1e-15 * Math.max(1, Math.abs(lo))) break;
    const mid = whole ? Math.floor((lo + hi) / 2) : (lo + hi) / 2;
    if (cdf(mid) >= u) hi = mid; else lo = mid;
  }
  return hi;
}

// A law from its density, added up: for the catalog's laws with no
// formula for F. "spec" has:
//   density(x)      the density (it should add up to 1)
//   least, most     where X can be
//   middle, scale   for a law on a half line or the whole line, about
//                   where its mass is and how spread out (like the
//                   points above: its median and half the distance
//                   between its quartiles, roughly)
//   cells           how many cells to add it up over (default DENSITY_CELLS)
//   mean            E[X], if known
// The density is added up over the cells of t, x = x(t) as above, each
// cell by Gauss-Legendre quadrature with 4 points (exact for
// polynomials of degree 7; W. H. Press et al., "Numerical Recipes", 3rd
// ed., Cambridge University Press, 2007, Section 4.6), of f(x(t)) x'(t).
function lawFromDensity(spec) {
  const n = spec.cells || DENSITY_CELLS, h = 1 / n;
  const map = stretchOfT(spec);
  // The table's points are at the cells' ends, except an end that is
  // infinitely far away, which moves to the middle of its cell (the
  // mass of that last cell is next to nothing).
  const pointAt = function (t) { return isFinite(map.x(t)) ? map.x(t) : map.x(t === 0 ? h / 2 : 1 - h / 2); };
  const xs = [pointAt(0)], Fs = [0];
  let total = 0;
  for (let i = 0; i < n; i++) {
    let mass = 0;
    for (let g = 0; g < 4; g++) {
      const t = i * h + h * (1 + GAUSS4.points[g]) / 2, f = spec.density(map.x(t));
      if (f > 0 && isFinite(f)) mass += GAUSS4.weights[g] * f * map.dx(t);
    }
    total += mass * h / 2;
    xs.push(pointAt((i + 1) * h));
    Fs.push(total);
  }
  const law = finishTable(xs, Fs.map(function (F) { return F / total; }));
  law.least = spec.least;
  law.most = spec.most;
  if (spec.mean !== undefined) law.mean = spec.mean;
  return law;
}

// x(t) and its derivative x'(t) for t in [0, 1], spreading the points
// as for a table made from F (see above).
function stretchOfT(spec) {
  const { least, most } = spec;
  if (isFinite(least) && isFinite(most)) {
    return { x: function (t) { return least + (most - least) * (1 - Math.cos(Math.PI * t)) / 2; },
             dx: function (t) { return (most - least) * Math.PI * Math.sin(Math.PI * t) / 2; } };
  }
  const s = spec.scale || 1;
  if (isFinite(least)) {
    return { x: function (t) { return t >= 1 ? Infinity : least + s * t / (1 - t); },
             dx: function (t) { return s / ((1 - t) * (1 - t)); } };
  }
  if (isFinite(most)) {
    return { x: function (t) { return t <= 0 ? -Infinity : most - s * (1 - t) / t; },
             dx: function (t) { return s / (t * t); } };
  }
  const m = spec.middle || 0;
  return { x: function (t) { return t <= 0 ? -Infinity : t >= 1 ? Infinity : m + s * Math.tan(Math.PI * (t - 0.5)); },
           dx: function (t) { const c = Math.cos(Math.PI * (t - 0.5)); return s * Math.PI / (c * c); } };
}

// The n Gauss-Legendre points and weights on [-1, 1]: the points are
// the roots of the Legendre polynomial P_n, found by Newton's method
// (Numerical Recipes, Section 4.6, routine "gauleg"). A weighted sum of
// f at these n points is exact for polynomials up to degree 2n - 1.
function gaussLegendre(n) {
  const points = [], weights = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5));   // first guess
    let slope = 1;
    for (let step = 0; step < 100; step++) {
      // p1 = Legendre polynomial P_n(z), from the three-term recurrence.
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      slope = n * (z * p1 - p2) / (z * z - 1);             // P_n'(z)
      const previous = z;
      z = previous - p1 / slope;                           // Newton step
      if (Math.abs(z - previous) < 1e-15) break;
    }
    points.push(z);
    weights.push(2 / ((1 - z * z) * slope * slope));
  }
  return { points: points, weights: weights };
}
const GAUSS4 = gaussLegendre(4);

// A law on whole numbers, from its masses. "spec" has:
//   mass(k)         P(X = k)
//   least, most     the smallest and largest k (may be -Infinity, Infinity)
//   middle          for a law on all the whole numbers, where to start
//                   looking (the masses are found outward from there)
//   cdf(k)          F(k) exactly, for a law whose masses go on so long
//                   (like the zeta law's) that they can't all be listed
//   reach           with cdf, how many whole numbers to list at most
//                   (default 2^20), when listing them all would be slow
//   mean            E[X], if known
// The masses are listed until all but 1e-14 of the mass is found (or
// "reach" of them); with "cdf", a draw past them comes from F itself.
function lawFromMasses(spec) {
  const found = new Map(), reach = spec.cdf && spec.reach ? spec.reach : LAW_REACH;
  let total = 0;
  function add(k) {
    const m = spec.mass(k);
    if (m > 0 && isFinite(m)) { found.set(k, m); total += m; }
  }
  if (isFinite(spec.least) && isFinite(spec.most) && spec.most - spec.least <= LAW_REACH) {
    for (let k = spec.least; k <= spec.most; k++) add(k);
  } else {
    const middle = isFinite(spec.least) ? spec.least : isFinite(spec.most) ? spec.most : Math.round(spec.middle || 0);
    add(middle);
    for (let r = 1; r <= reach && total < 1 - 1e-14; r++) {
      if (middle + r <= spec.most) add(middle + r);
      if (middle - r >= spec.least) add(middle - r);
    }
  }
  const masses = Array.from(found).sort(function (a, b) { return a[0] - b[0]; });
  if (masses.length === 0) throw new Error("This law has no mass anywhere.");
  // The table of jumps. F before the first listed mass is what lies
  // left of it (from cdf, or 0).
  const xs = [], Fs = [];
  let F = spec.cdf ? spec.cdf(masses[0][0] - 1) : 0;
  for (const [k, m] of masses) {
    xs.push(k, k);
    Fs.push(F, F + m);
    F += m;
  }
  if (!spec.cdf) { const top = Fs[Fs.length - 1]; for (let i = 0; i < Fs.length; i++) Fs[i] /= top; }
  const law = finishTable(xs, Fs);
  law.masses = masses;
  law.least = spec.least;
  law.most = spec.most;
  if (spec.cdf) { law.cdf = spec.cdf; law.whole = true; }
  if (spec.mean !== undefined) law.mean = spec.mean;
  return law;
}

// All the mass at the one point c.
function pointMassLaw(c) {
  const law = finishTable([c, c], [0, 1]);
  law.masses = [[c, 1]];
  law.quantile = function () { return c; };
  law.cdf = function (x) { return x >= c ? 1 : 0; };
  return law;
}

// A law worked out from many draws ("values", a list of numbers): its
// table is the empirical F, F(x) = (how many draws are <= x) / n, with
// a draw that comes up again and again (a point mass) kept as a jump,
// and the rest (points in a row with no repeats) as straight pieces
// through the middles of their steps, thinned to about DRAWS_TABLE
// points.
function lawFromDraws(values) {
  const sorted = Float64Array.from(values).sort(), n = sorted.length;
  const xs = [], Fs = [];
  const every = Math.max(1, Math.floor(n / DRAWS_TABLE));
  let i = 0, sum = 0;
  for (const v of sorted) sum += v;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1] === sorted[i]) j++;
    if (j > i || i === 0 || i === n - 1) {
      // A repeated value (a jump), or an end.
      xs.push(sorted[i], sorted[i]);
      Fs.push(i / n, (j + 1) / n);
    } else if (i % every === 0) {
      xs.push(sorted[i]);
      Fs.push((i + 0.5) / n);
    }
    i = j + 1;
  }
  const law = finishTable(xs, Fs);
  law.mean = sum / n;
  law.estimated = n;
  law.masses = [];
  return law;
}

// The size-biased law of a law on [0, infinity) with a finite mean:
// each value's chance times the value, divided by the mean,
//   P*(X in dx) = x P(X in dx) / E[X],
// the law of the gap that covers a given point in a stationary renewal
// process (W. Feller, "An Introduction to Probability Theory and Its
// Applications", Vol. II, 2nd ed., Wiley, 1971, Section XI.4). From the
// table: a straight piece of F from x0 to x1 is a uniform stretch of
// mass F1 - F0, whose size-biased mass is (F1 - F0)(x0 + x1)/2, and a
// jump at x of mass m becomes m x; the whole is scaled to add up to 1.
function sizeBiasedLaw(law) {
  const xs = law.xs, Fs = law.Fs, out = [0];
  for (let i = 1; i < xs.length; i++) out.push(out[i - 1] + (Fs[i] - Fs[i - 1]) * (xs[i] + xs[i - 1]) / 2);
  const total = out[out.length - 1];
  const biased = finishTable(xs, out.map(function (F) { return F / total; }));
  biased.masses = law.masses.map(function ([x, m]) { return [x, m * x / total]; }).filter(function ([x, m]) { return m > 0; });
  return biased;
}

// A table's law: the table as typed arrays, and the numbers that come
// from it (where the law starts and ends, and its mean: each straight
// piece of F is a uniform stretch, or for a jump a point, whose mean is
// its middle).
function finishTable(xs, Fs) {
  const law = { xs: Float64Array.from(xs), Fs: Float64Array.from(Fs), masses: [], estimated: 0, note: "" };
  let i = 0;
  while (i + 1 < law.Fs.length && law.Fs[i + 1] === 0) i++;
  law.least = law.xs[i];
  let j = law.Fs.length - 1;
  while (j > 0 && law.Fs[j - 1] >= law.Fs[law.Fs.length - 1]) j--;
  law.most = law.xs[j];
  law.mean = 0;
  for (let k = 1; k < law.xs.length; k++) law.mean += (law.Fs[k] - law.Fs[k - 1]) * (law.xs[k] + law.xs[k - 1]) / 2;
  return law;
}


/* ---------------------------------------------------------------------
   DRAWING FROM A LAW
   --------------------------------------------------------------------- */

// F^-1(u), for u in (0, 1): the law's own formula if it has one;
// otherwise the first point of the table with F at least u, and back
// along the straight piece before it (at a jump, that is the jump's
// place, exactly). Past the table's ends, from F itself. For a law with
// an exact F, one more step makes it closer: with x the point found, F
// is worked out at x, and the answer is found the same way again on the
// piece of the table's line, now from x0 to x or from x to x1, where u
// is (the "false position" method: W. H. Press et al., "Numerical
// Recipes", 3rd ed., Cambridge University Press, 2007, Section 9.2).
function drawFromLaw(law, u) {
  if (law.quantile) return law.quantile(u);
  const xs = law.xs, Fs = law.Fs, last = Fs.length - 1;
  if (law.cdf && (u > Fs[last] || u <= Fs[0])) return invertCDF(law.cdf, u, law.least, law.most, law.whole);
  let lo = 0, hi = last;     // Fs[hi] >= u
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Fs[mid] >= u) hi = mid; else lo = mid + 1;
  }
  if (lo === 0) return xs[0];
  let x0 = xs[lo - 1], x1 = xs[lo], F0 = Fs[lo - 1], F1 = Fs[lo];
  const x = x0 + (u - F0) / (F1 - F0) * (x1 - x0);
  if (!law.cdf || law.whole || x0 === x1) return x;
  const F = Math.min(Math.max(law.cdf(x), F0), F1);
  if (F >= u) { x1 = x; F1 = F; } else { x0 = x; F0 = F; }
  return F1 > F0 ? x0 + (u - F0) / (F1 - F0) * (x1 - x0) : x;
}

// A draw, from the uniform numbers uniform(0), uniform(1), ...: the
// law's own way if it needs more than one (law.draw), otherwise
// F^-1(uniform(0)).
function drawWith(law, uniform) {
  return law.draw ? law.draw(uniform) : drawFromLaw(law, uniform(0));
}

// F(x) = P(X <= x): the law's own formula if it has one; otherwise
// from the last point of the table at or left of x (the top of a jump
// there), along the straight piece after it.
function lawCDF(law, x) {
  if (law.cdf) return law.cdf(x);
  const xs = law.xs, Fs = law.Fs;
  if (x < xs[0]) return 0;
  let lo = 0, hi = xs.length - 1;     // the last i with xs[i] <= x
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid - 1;
  }
  if (lo === xs.length - 1) return Fs[lo];
  return Fs[lo] + (x - xs[lo]) / (xs[lo + 1] - xs[lo]) * (Fs[lo + 1] - Fs[lo]);
}

// F drawn as a chart, from F^-1(0.001) to F^-1(0.999) (the far tails
// would squash the rest), or from where the law starts or ends if that
// is near, with a little room on each side (or from c - 1 to c + 1, if
// it is all at one point c); from 0 to 1 up. Point masses are the
// jumps.
function lawChart(canvas, law) {
  let from = drawFromLaw(law, 0.001), to = drawFromLaw(law, 0.999);
  const span = Math.max(to - from, 1e-9);
  if (isFinite(law.least) && law.least > from - span) from = law.least;
  if (isFinite(law.most) && law.most < to + span) to = law.most;
  if (!(to - from > 1e-9 * Math.max(1, Math.abs(from)))) { from -= 1; to += 1; }   // all at one point
  const room = 0.05 * (to - from);
  const left = from - room, right = to + room;
  // The table's points in that range (at most about 2000 of them, which
  // is plenty for a chart), keeping every jump.
  const points = [[left, lawCDF(law, left)]];
  const every = Math.max(1, Math.floor(law.xs.length / 2000));
  for (let i = 0; i < law.xs.length; i++) {
    if (law.xs[i] <= left) continue;
    if (law.xs[i] >= right) break;
    const jump = (i > 0 && law.xs[i] === law.xs[i - 1]) || (i + 1 < law.xs.length && law.xs[i + 1] === law.xs[i]);
    if (jump || i % every === 0) points.push([law.xs[i], law.Fs[i]]);
  }
  points.push([right, lawCDF(law, right)]);
  lineChart(canvas, [{ points: points }], { from: left, to: right, word: "x" }, { from: 0, to: 1, word: "F(x)" });
}
