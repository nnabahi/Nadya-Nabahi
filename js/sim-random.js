/* =====================================================================
   sim-random.js  —  named random variables, like  u ~ unif(0, 1), and
                     the Random variables box that holds them
   ---------------------------------------------------------------------
   Shared by every sim whose formulas use randomness (Sinusoid-ish,
   Matrix Products, Lattice Path Counting, First Passage Percolation).
   A page that loads this file loads before it: math.js, jStat, KaTeX
   (for the preview), js/site.js, js/sim-worker.js (seededUniform),
   js/sim-charts.js (the chart), js/formulas.js, js/sim-laws.js and
   js/sim-law-catalog.js.

   THE BOX. One random variable per line:
       u ~ unif(0, 1)                  u has the uniform law on [0, 1]
       w ~ {x >= 0: e^(-x), 0}         w has this density
       d_k ~ unif([0, 2])              d_1, d_2, ... each 0 or 2
       X = sum(k, 1, 40, d_k / 3^k)    X is this formula of them
   After ~ comes a law: one from the catalog (js/sim-law-catalog.js),
   with numbers or sliders for its parameters, or a density in x, typed
   as in js/sim-laws.js. After = comes a formula of the other random
   variables and sliders; in it, sum(k, a, b, ...) and prod(k, a, b, ...)
   are the sum and the product over k = a, a + 1, ..., b. A name is one
   letter, maybe with digits (u1) or a subscript (e_5); d_k, with a
   letter as its subscript, is a whole family d_1, d_2, ... of
   independent random variables with the same law.

   WHAT A NAME MEANS. Each time a formula is worked out somewhere, a
   name is one number, the same everywhere in it: in [[u, 1 - u], ...]
   both u's are the same. Each place the page works its formulas out (a
   new step, a new edge, a new gap: each page says what its places are)
   gets new, independent copies of every name. d_1, d_2, ... are
   independent too, and inside sum(k, 1, 40, d_k / 3^k), d_k is d_1,
   d_2, ... in turn.

   COUPLING. Each copy is F^-1(U) (drawFromLaw, js/sim-laws.js) for its
   own uniform number U, fixed by the seed, the name, the index k and
   the place (seededUniform, js/sim-worker.js). F^-1(U) has the law F
   (the inverse transform: R. Durrett, "Probability: Theory and
   Examples", 5th ed., Cambridge University Press, 2019, Theorem
   1.2.2). So moving a slider in u's law moves every u a little, the
   same way, and leaves the other names alone.

   Contents:
     1. Reading the lines        readRandomVariables(text, reserved)
     2. Page formulas            randomLetters(tree, declared, own),
                                 randomNamesIn(tree, declared),
                                 prepareFormula(tree, declared)
     3. sum and prod             seriesSum, seriesProd (in math.js)
     4. The laws                 makeRandomVariables(declared, values)
     5. Drawing, place by place  newDrawer(variables, seed),
                                 placeUniforms(seed, name)
     6. Many draws at once       sampleRandomVariables(variables, work),
                                 averagesOf(variables, formulas)
     7. The box on the page      connectRandomBox(options)
   ===================================================================== */


/* =====================================================================
   1. READING THE LINES
   ===================================================================== */

// A name: one letter (Latin or Greek), maybe digits after it, and maybe
// "_" and a subscript: digits (e_5, a name of its own) or one letter
// (d_k, a family).
const RANDOM_NAME = /^(\p{L}\d*)(?:_(\d+|\p{L}))?$/u;

// The box's text, read. "reserved" lists the letters the page itself
// uses (like x and y in Path Counting's X(x, y)), which can't be names
// or sliders.
// Returns "declared":
//   lines        one per line typed (blank lines left out), each with
//                its name, its kind ("law" or "formula"), and what it
//                was read into
//   byName       each line by its name (a family by its letter: "d")
//   names        the names as typed, in order ("u", "d_k", "X")
//   letters      the letters that need a slider, in order
//   tex          all the lines typeset, for KaTeX
// Throws an Error with a plain message (and the line's number) if a
// line can't be read.
function readRandomVariables(text, reserved) {
  const declared = { lines: [], byName: new Map(), names: [], letters: [] }, own = reserved || [];
  const typed = text.split("\n");
  // First every line's name (a formula may use a name from a later line).
  typed.forEach(function (line, k) {
    if (line.trim() === "") return;
    withLineNumber(k, function () {
      const read = splitLine(line, own);
      read.number = k + 1;
      if (declared.byName.has(read.name)) throw new Error(read.shown + " is given twice.");
      declared.lines.push(read);
      declared.byName.set(read.name, read);
      declared.names.push(read.shown);
    });
  });
  // Then what each line says. (The page's own letters can't be sliders
  // either: they mean something else there.)
  const letters = new Set();
  for (const line of declared.lines) {
    withLineNumber(line.number - 1, function () {
      readRight(line, declared);
      for (const letter of line.letters) {
        if (own.includes(letter)) throw new Error(letter + " is the sim's own letter, so the random variables can't use it.");
        letters.add(letter);
      }
    });
  }
  checkForLoops(declared);
  for (const line of declared.lines) {
    if (line.kind === "formula") line.code = prepareFormula(line.tree, declared).compile();
  }
  declared.letters = Array.from(letters);
  declared.tex = "\\begin{aligned}" + declared.lines.map(lineTex).join(" \\\\ ") + "\\end{aligned}";
  return declared;
}

// Run "read" for line k, adding "Line k + 1: " to any problem it finds.
function withLineNumber(k, read) {
  try { read(); }
  catch (problem) { throw new Error("Line " + (k + 1) + ": " + problem.message); }
}

// A line's name and kind: "name ~ law" or "name = formula". The "=" of
// a formula line is the first one that isn't part of <=, >=, == or !=.
function splitLine(line, reserved) {
  let kind, left, right;
  const tilde = line.indexOf("~");
  const equals = line.match(/^([^=<>!~]*?)=(?!=)(.*)$/);
  if (tilde >= 0) { kind = "law"; left = line.slice(0, tilde); right = line.slice(tilde + 1); }
  else if (equals) { kind = "formula"; left = equals[1]; right = equals[2]; }
  else throw new Error("write each line as  u ~ unif(0, 1)  (a random variable and its law) or  X = 2 u + 1  (a formula of them).");
  const shown = left.trim(), parts = shown.match(RANDOM_NAME);
  if (!parts) {
    throw new Error("\"" + shown + "\" can't be a name. A name is one letter, maybe with digits or a subscript: u, u1, e_5, or d_k for a family d_1, d_2, ....");
  }
  const family = Boolean(parts[2]) && !/^\d+$/.test(parts[2]);
  const name = family ? parts[1] : shown;
  if (!family && (math[name] !== undefined || name === "x")) {
    throw new Error(name + " already means something" + (name === "x" ? " (the x of a density)" : " in a formula (" + name + " = " + math[name] + ")") + ".");
  }
  if (reserved.includes(name) || (family && reserved.includes(parts[1]))) throw new Error(name + " can't be a name here: the page uses it.");
  if (right.trim() === "") throw new Error(shown + (kind === "law" ? " ~ needs a law." : " = needs a formula."));
  return { kind: kind, name: name, shown: shown, family: family, index: family ? parts[2] : "", right: right };
}

// What the right side of a line says. A law is one of the catalog's,
// like exp(2), if it is written that way with no x in its parameters
// (the parameters of orbit(T(x), x_0) are the exception: T is a formula
// in x); anything else with an x in it is a density in x. Sets:
//   catalog   { key, args } (the parameters as formulas), or
//   density   the density's formula, or, for a formula line,
//   tree      the formula
// and its slider letters and the names it uses.
function readRight(line, declared) {
  const tree = readTree(line.right);
  line.uses = new Set();
  line.letters = [];
  if (line.kind === "formula") {
    line.tree = tree;
    const found = lettersAndUses(tree, declared, line.family ? [line.index] : []);
    line.letters = found.letters;
    line.uses = found.uses;
    return;
  }
  line.lawTree = tree;
  const node = bareNode(tree), key = node.isFunctionNode && node.fn.isSymbolNode ? node.fn.name : "";
  const entry = LAW_CATALOG[key];
  if (entry && node.args.every(function (a, i) { return (entry.formulas || []).includes(i) || !usesLetter(a, "x"); })) {
    line.catalog = { key: key, args: node.args };
    node.args.forEach(function (a, i) { addLawLetters(line, a, (entry.formulas || []).includes(i) ? ["x"] : [], declared); });
  } else if (usesLetter(tree, "x")) {
    line.density = tree;
    addLawLetters(line, tree, ["x"], declared);
  } else {
    throw new Error(key ? key + " isn't one of the laws (the list is under \"how to type them\")."
                        : "a law is one from the list, like exp(1), or a density in x, like {x >= 0: e^(-x), 0}.");
  }
}

// A law's slider letters. Its numbers can't be random (to make a law
// from random numbers, write it as a formula line, X = ...), and a
// family's law can't depend on its own index: d_1, d_2, ... all have
// the same law.
function addLawLetters(line, tree, own, declared) {
  const found = lettersAndUses(tree, declared, own);
  if (found.uses.size > 0) {
    throw new Error("the numbers in a law can't be random (" + Array.from(found.uses).join(", ") + "). " +
                    "Write it as a formula of random variables instead, like  X = a u + b.");
  }
  if (line.family && found.letters.includes(line.index)) {
    throw new Error(line.shown + "'s law can't depend on " + line.index + ": " + line.name + "_1, " + line.name + "_2, ... all have the same law.");
  }
  for (const letter of found.letters) if (!line.letters.includes(letter)) line.letters.push(letter);
}

// A formula line can't be worked out from itself, even through others
// (X = Y + 1 and Y = X). Searched depth first (each name is looked at
// once), keeping the path so far to say where the loop is.
function checkForLoops(declared) {
  const done = new Set(), path = [];
  function visit(line) {
    if (done.has(line.name)) return;
    const at = path.indexOf(line.name);
    if (at >= 0) {
      const loop = path.slice(at).concat([line.name]).map(function (n) { return declared.byName.get(n).shown; });
      throw new Error(loop[0] + " is worked out from itself: " + loop.join(" → ") + ".");
    }
    path.push(line.name);
    for (const name of line.uses) visit(declared.byName.get(name));
    path.pop();
    done.add(line.name);
  }
  for (const line of declared.lines) visit(line);
}

// One line, typeset: u \sim \mathrm{unif}(0, 1), or X = .... (The &
// lines the lines up at their ~ or =.)
function lineTex(line) {
  return nameTex(line.shown) + (line.kind === "law" ? " &\\sim " : " &= ") + formulaTex(line.kind === "law" ? line.lawTree : line.tree);
}

// Without the brackets around it.
function bareNode(node) {
  while (node.isParenthesisNode) node = node.content;
  return node;
}

// Does the formula use the letter (not as a function's name)?
function usesLetter(tree, letter) {
  return tree.filter(function (node, path, parent) {
    return node.isSymbolNode && node.name === letter && !isFunctionName(path, parent);
  }).length > 0;
}


/* =====================================================================
   2. PAGE FORMULAS THAT USE RANDOM VARIABLES
   ---------------------------------------------------------------------
   A page's own formulas (Matrix Products' entries, say) can use the
   names too. randomLetters finds the letters in one that need a slider,
   and randomNamesIn the random variables it uses; prepareFormula turns
   it into a formula math.js can work out, in which each name is
   drawRandom("name", index) (section 5 gives drawRandom).
   ===================================================================== */

// The letters of a page formula that need a slider: not its own
// variables "own", not the random variables, not a sum's k, and not
// the names math.js already knows (pi, e, sqrt, ...).
function randomLetters(tree, declared, own) {
  return lettersAndUses(tree, declared, own || []).letters;
}

// The random variables a page formula uses, as their lines' names (a
// family by its letter: "d" for d_3 or d_k).
function randomNamesIn(tree, declared) {
  return Array.from(lettersAndUses(tree, declared, []).uses);
}

// What the symbol "name" is, if it is a random variable: the line's
// name and the index, as a formula ("0" for a name with no index; d_3's
// is 3 and d_k's is k), or null.
function randomUse(name, declared) {
  const plain = declared.byName.get(name);
  if (plain && !plain.family) return { name: name, index: new math.ConstantNode(0) };
  const parts = name.match(/^(\p{L}\d*)_(\d+|\p{L})$/u);
  const family = parts && declared.byName.get(parts[1]);
  if (!family || !family.family) return null;
  return { name: parts[1], index: /^\d+$/.test(parts[2]) ? new math.ConstantNode(Number(parts[2])) : new math.SymbolNode(parts[2]) };
}

// d_(k + 1): a family's name, written as a function of its index. Its
// line, or null.
function familyCall(node, declared) {
  if (!node.isFunctionNode || !node.fn.isSymbolNode || node.args.length !== 1) return null;
  const parts = node.fn.name.match(/^(\p{L}\d*)_$/u), family = parts && declared.byName.get(parts[1]);
  return family && family.family ? family : null;
}

// The slider letters of a formula, and the random variables it uses
// (as their lines' names), going through it piece by piece. "bound"
// holds the letters that are not sliders here: the formula's own
// variables, and the k of each sum or product around this piece.
function lettersAndUses(tree, declared, own) {
  const letters = [], uses = new Set();
  function look(node, bound) {
    if (isSeries(node)) {
      look(node.args[1], bound);
      look(node.args[2], bound);
      look(node.args[3], bound.concat([node.args[0].name]));
      return;
    }
    const call = familyCall(node, declared);
    if (call) { uses.add(call.name); look(node.args[0], bound); return; }
    if (node.isSymbolNode) {
      const use = randomUse(node.name, declared);
      if (use) {
        uses.add(use.name);
        if (use.index.isSymbolNode) look(use.index, bound);
      } else if (!bound.includes(node.name) && math[node.name] === undefined && !letters.includes(node.name)) {
        letters.push(node.name);
      }
      return;
    }
    node.forEach(function (child, path) { if (!(node.isFunctionNode && path === "fn")) look(child, bound); });
  }
  look(tree, own);
  return { letters: letters, uses: uses };
}

// The formula with each random variable as drawRandom("name", index),
// and each sum(k, a, b, ...) as seriesSum(k, a, b, ...) (section 3).
function prepareFormula(tree, declared) {
  function draw(name, index) {
    return new math.FunctionNode(new math.SymbolNode("drawRandom"), [new math.ConstantNode(name), index]);
  }
  function prepare(node) {
    if (isSeries(node)) {
      const fn = new math.SymbolNode(node.fn.name === "sum" ? "seriesSum" : "seriesProd");
      return new math.FunctionNode(fn, [node.args[0]].concat(node.args.slice(1).map(prepare)));
    }
    const call = familyCall(node, declared);
    if (call) return draw(call.name, prepare(node.args[0]));
    if (node.isSymbolNode) {
      const use = randomUse(node.name, declared);
      return use ? draw(use.name, use.index) : node;
    }
    return node.map(function (child, path) { return node.isFunctionNode && path === "fn" ? child : prepare(child); });
  }
  return prepare(tree);
}


/* =====================================================================
   3. sum AND prod
   ---------------------------------------------------------------------
   seriesSum(k, a, b, body) is body added up over k = a, a + 1, ..., b
   (0 if b < a); seriesProd the same, multiplied (1 if b < a). math.js
   hands them their pieces unworked ("rawArgs"), so they can set k
   before each turn of the body. At most SERIES_MOST turns.
   ===================================================================== */
const SERIES_MOST = 10000;
const COMPILED = new WeakMap();     // each piece, compiled once

function seriesOf(kind) {
  const series = function (args, math, scope) {
    const letter = args[0].name, from = seriesEnd(args[1], scope), to = seriesEnd(args[2], scope);
    if (to - from + 1 > SERIES_MOST) throw new Error("A " + kind + " can have at most " + SERIES_MOST.toLocaleString() + " terms.");
    const body = compiledOnce(args[3]), had = scope.has(letter), kept = scope.get(letter);
    let total = kind === "sum" ? 0 : 1;
    try {
      for (let k = from; k <= to; k++) {
        scope.set(letter, k);
        const term = Number(body.evaluate(scope));
        total = kind === "sum" ? total + term : total * term;
      }
    } finally {
      if (had) scope.set(letter, kept); else scope.delete(letter);
    }
    return total;
  };
  series.rawArgs = true;
  return series;
}
math.import({ seriesSum: seriesOf("sum"), seriesProd: seriesOf("prod") });

function compiledOnce(node) {
  if (!COMPILED.has(node)) COMPILED.set(node, node.compile());
  return COMPILED.get(node);
}

// Where a sum starts or ends: a whole number.
function seriesEnd(node, scope) {
  const end = Number(compiledOnce(node).evaluate(scope));
  if (!Number.isInteger(end)) throw new Error("A sum's or product's ends must be whole numbers (one is " + end + ").");
  return end;
}


/* =====================================================================
   4. THE LAWS
   ---------------------------------------------------------------------
   makeRandomVariables(declared, values) builds every law, with the
   sliders' values ({ letter: number }), and returns "variables":
     variables.declared      what was read (section 1)
     variables.values        the sliders' values
     variables.laws          each law line's law, by name
     variables.lawOf(name)   any line's law: a formula line's is worked
                             out from many draws (section 6), the first
                             time it is asked for
   Throws an Error with a plain message if a law can't be made.
   ===================================================================== */
function makeRandomVariables(declared, values) {
  const variables = { declared: declared, values: values, laws: new Map() };
  const scope = new Map(Object.entries(values)), estimates = new Map();
  for (const line of declared.lines) {
    if (line.kind !== "law") continue;
    try { variables.laws.set(line.name, line.catalog ? catalogLineLaw(line, scope) : densityLineLaw(line, values)); }
    catch (problem) { throw new Error(line.shown + ": " + problem.message); }
  }
  variables.lawOf = function (name) {
    const line = declared.byName.get(name);
    if (line.kind === "law") return variables.laws.get(name);
    if (!estimates.has(name)) {
      const draws = sampleRandomVariables(variables, function (drawer) { return drawer.value(name, line.family ? 1 : 0); });
      estimates.set(name, lawFromDraws(draws));
    }
    return estimates.get(name);
  };
  return variables;
}

// A catalog law: its parameters worked out (a list, like [1, 2, 3], as
// a plain list; a formula in x, like orbit's T, as a function of x).
function catalogLineLaw(line, scope) {
  const entry = LAW_CATALOG[line.catalog.key];
  const args = line.catalog.args.map(function (arg, i) {
    if ((entry.formulas || []).includes(i)) return formulaInX(arg, scope);
    let v = arg.compile().evaluate(scope);
    if (v && typeof v.toArray === "function") v = math.flatten(v).toArray();
    if (typeof v === "boolean") v = Number(v);
    return v;
  });
  return catalogLaw(line.catalog.key, args);
}

// A formula in x as a plain function of x, keyed by its text and the
// sliders' values (so the catalog keeps the law it makes: catalogLaw).
function formulaInX(tree, scope) {
  const code = tree.compile(), own = new Map(scope);
  const T = function (x) { own.set("x", x); return Number(code.evaluate(own)); };
  T.key = tree.toString() + JSON.stringify(Array.from(scope));
  return T;
}

// A typed density's law (readLaw, js/sim-laws.js).
function densityLineLaw(line, values) {
  const law = readLaw(line.density, values);
  if (law.problem) throw new Error(law.problem);
  return law;
}


/* =====================================================================
   5. DRAWING, PLACE BY PLACE
   ---------------------------------------------------------------------
   newDrawer(variables, seed) gives the values of the random variables,
   one place at a time:
     drawer.at(a, b, ...)        go to the place (a, b, ...), numbers
                                 the page chooses (like a run and a
                                 step): new copies of every name
     drawer.value(name, index)   name's value here (index 0 for a name
                                 that isn't a family's)
     drawer.scope                what math.js works a prepared formula
                                 out with (prepareFormula): the
                                 sliders' values and drawRandom; the
                                 page sets its own variables in it
     drawer.within(place, work)  run work() at another place (a list of
                                 numbers), then come back (Path
                                 Counting's own functions, like d(y),
                                 have places of their own)
   A value is worked out the first time it is asked for at a place and
   then kept until the place changes, so a name is the same number
   everywhere in the place's formulas. placeUniforms(seed, name) gives
   only the uniform numbers behind one name's values, for a page that
   keeps them.
   ===================================================================== */
function newDrawer(variables, seed) {
  return makeDrawer(variables, seededPlaceUniform(seed));
}

// The uniform numbers behind one name's values, place by place:
// uniformAt(place) is the U whose F^-1(U) is the name's value at that
// place (a list of numbers, as drawer.at takes them), for a name whose
// law needs one uniform number. A page that keeps them (FPP keeps one
// per edge) finds a new law's values with F^-1 alone, without a drawer.
function placeUniforms(seed, name) {
  const uniformOf = seededPlaceUniform(seed), key = nameKey(name, 0), folded = [];
  return function (place) { return uniformOf(key, 0, foldNumbers(place, folded)); };
}

// uniformOf(key, j, place) for the seed: the j-th uniform number for a
// draw of the name and index "key" (nameKey) at "place" (foldNumbers),
// from the seed, the key, j and the place (seededUniform,
// js/sim-worker.js).
function seededPlaceUniform(seed) {
  const random = seededUniform(seed), list = [];     // (one list, filled anew for each number)
  return function (key, j, place) {
    list.length = 0;
    for (let k = 0; k < key.length; k++) list.push(key[k]);
    list.push(j);
    for (let k = 0; k < place.length; k++) list.push(place[k]);
    return random.uniformOfList(list);
  };
}

// The drawer, with "uniformOf(key, j, place)" giving the j-th uniform
// number for a draw of the name and index "key" at "place" (most laws
// need only j = 0; a stable law needs two). Keys and places are lists
// of whole numbers (foldNumbers).
function makeDrawer(variables, uniformOf) {
  const declared = variables.declared, scope = new Map(Object.entries(variables.values));
  const drawer = { scope: scope, place: [] };
  let kept = new Map();      // valueId(name, index) -> its value at this place
  const atPlace = [];        // (the place of drawer.at, one list filled anew each time)
  scope.set("drawRandom", function (name, index) { return drawer.value(name, index); });

  drawer.at = function () { drawer.place = foldNumbers(arguments, atPlace); kept.clear(); };
  drawer.within = function (place, work) {
    const outerPlace = drawer.place, outerKept = kept;
    drawer.place = foldNumbers(place);
    kept = new Map();
    try { return work(); }
    finally { drawer.place = outerPlace; kept = outerKept; }
  };
  drawer.value = function (name, index) {
    const id = valueId(name, index);
    let v = kept.get(id);
    if (v !== undefined) return v;
    const line = declared.byName.get(name);
    v = line.kind === "law" ? drawLaw(line, index, id) : workOut(line, index);
    kept.set(id, v);
    return v;
  };
  function drawLaw(line, index, id) {
    const law = variables.laws.get(line.name), key = nameKey(line.name, index, id);
    return drawWith(law, function (j) { return uniformOf(key, j, drawer.place); });
  }
  // A formula line's value; a family's line with its own letter set to
  // the index (and put back after).
  function workOut(line, index) {
    const letter = line.index, had = line.family && scope.has(letter), before = had ? scope.get(letter) : undefined;
    if (line.family) scope.set(letter, index);
    try { return numberOf(line.code.evaluate(scope), line.shown); }
    finally { if (line.family) { if (had) scope.set(letter, before); else scope.delete(letter); } }
  }
  return drawer;
}

// A formula's answer as a number: true/false count as 1/0; anything
// that isn't a number is a problem.
function numberOf(v, name) {
  if (typeof v === "boolean") return Number(v);
  if (typeof v !== "number" || Number.isNaN(v)) throw new Error(name + " came out as " + String(v) + ", not a number.");
  return v;
}

// Numbers as a list of whole numbers of 32 bits, so that different
// lists of numbers never give the same list: a whole number between
// -2^30 and 2^30 as itself (most places are whole numbers, and short
// lists are quick to scramble), and any other number as FOLD_MARK, 2^30,
// which no number kept as itself can be, and then its 64 bits, exactly,
// as two. (-0 and 0 are one place.) Into the list "into", if given
// (emptied first), else a new one.
const FOLD_MARK = 1 << 30, FOLD_FLOAT = new Float64Array(1), FOLD_INTS = new Int32Array(FOLD_FLOAT.buffer);
function foldNumbers(numbers, into) {
  const ints = into || [];
  ints.length = 0;
  for (let k = 0; k < numbers.length; k++) {
    const v = numbers[k];
    if (Number.isInteger(v) && v > -FOLD_MARK && v < FOLD_MARK) { ints.push(v === 0 ? 0 : v); continue; }
    FOLD_FLOAT[0] = v;
    ints.push(FOLD_MARK, FOLD_INTS[0], FOLD_INTS[1]);
  }
  return ints;
}

// A name and an index as a list of whole numbers: the name's text
// scrambled into two (textToNumbers, js/sim-worker.js), then the index
// folded (foldNumbers). Each is made once, and then always the same
// list. ("id", if given, is valueId(name, index), already made.)
const KEYS = new Map(), TEXT_NUMBERS = seededUniform("").textToNumbers;
function nameKey(name, index, id) {
  const known = id || valueId(name, index);
  let key = KEYS.get(known);
  if (key === undefined) {
    key = TEXT_NUMBERS(name).concat(foldNumbers([index]));
    KEYS.set(known, key);
  }
  return key;
}

// A name and an index as one text, to look its value or key up by:
// the name itself for index 0 (a name with no index, or d_0), so that
// most lookups need no new text, else "name|index". (A name is either a
// family's or not, so these never clash.)
function valueId(name, index) {
  return index === 0 ? name : name + "|" + index;
}


/* =====================================================================
   6. MANY DRAWS AT ONCE
   ---------------------------------------------------------------------
   sampleRandomVariables(variables, work) runs work(drawer) for n
   samples of every random variable and returns the list of answers. A
   formula line's law is worked out this way (lawOf, section 4).
   averagesOf(variables, formulas) gives the averages of page formulas
   (Matrix Products' average matrix): on a grid when it can, otherwise
   from these samples.

   The samples are a "Latin hypercube" (M. D. McKay, R. J. Beckman and
   W. J. Conover, "A comparison of three methods for selecting values of
   input variables in the analysis of output from a computer code",
   Technometrics 21 (1979) 239-245): for each name and index, the n
   uniform numbers U behind its n copies are one in each of the n
   stretches [m/n, (m + 1)/n), in a random order of its own. So each
   name on its own is spread over its whole law as evenly as n draws
   can be, and an average of one name, like E[u], is off by far less
   than with independent draws (here, about 1e-7), while different
   names are still as good as independent.

   n is 16,384, or fewer (halving, down to 1,024) when the formula is
   slow, so that it takes about half a second at most.
   ===================================================================== */
const SAMPLES_MOST = 16384, SAMPLES_LEAST = 1024, SAMPLES_TIME = 500;   // milliseconds

function sampleRandomVariables(variables, work) {
  const n = howManySamples(variables, work), drawer = latinDrawer(variables, n), answers = [];
  for (let i = 0; i < n; i++) {
    drawer.sample(i);
    answers.push(work(drawer));
  }
  return answers;
}

// How many samples fit in about SAMPLES_TIME: time a few first (after
// four that aren't timed, while the browser gets the code going).
function howManySamples(variables, work) {
  const trial = newDrawer(variables, "trial");
  for (let k = 0; k < 4; k++) { trial.at(-1 - k); work(trial); }
  const start = performance.now();
  let tried = 0;
  while (tried < 64 && (tried < 4 || performance.now() - start < SAMPLES_TIME / 16)) {
    trial.at(tried++);
    work(trial);
  }
  const each = (performance.now() - start) / tried;
  let n = SAMPLES_MOST;
  while (n > SAMPLES_LEAST && n * each > SAMPLES_TIME) n /= 2;
  return n;
}

// The drawer of the Latin hypercube's n samples: drawer.sample(i) goes
// to sample i. The first uniform number of each draw (j = 0) comes from
// the name's column; the few laws that need more (j >= 1) get the rest
// as plain independent draws.
function latinDrawer(variables, n) {
  const random = seededUniform("latin hypercube"), columns = new Map();
  let i = 0;
  const drawer = makeDrawer(variables, function (key, j) {
    if (j > 0) return random.uniform(...key, j, i);
    if (!columns.has(key)) columns.set(key, latinColumn(random, key, n));
    return columns.get(key)[i];
  });
  drawer.sample = function (k) { i = k; drawer.at(k); };
  return drawer;
}

// n uniform numbers, one in each stretch [m/n, (m + 1)/n), uniform in
// it, the stretches in a uniformly random order (shuffled the
// Fisher-Yates way: D. E. Knuth, "The Art of Computer Programming",
// Vol. 2, 3rd ed., Addison-Wesley, 1997, Section 3.4.2, Algorithm P).
function latinColumn(random, key, n) {
  const order = new Int32Array(n), column = new Float64Array(n);
  for (let m = 0; m < n; m++) order[m] = m;
  for (let m = n - 1; m > 0; m--) {
    const r = Math.floor(random.uniform(...key, -1, m) * (m + 1));
    const swap = order[m]; order[m] = order[r]; order[r] = swap;
  }
  for (let m = 0; m < n; m++) column[m] = (order[m] + random.uniform(...key, -2, m)) / n;
  return column;
}

// The averages of page formulas of the random variables and sliders
// (Matrix Products' entries), E[g] for each: formulas[i] is
// { tree, label }, the label naming it in a problem.
//
// A formula whose random variables come down to at most four names
// with laws (namesBehind), not families, each drawn from one uniform
// number, is g(F1^-1(U1), ..., Fk^-1(Uk)) for independent uniform U's
// (section 5), so its average is the average of that over the cube
// [0, 1]^k. Here
// that is the midpoint rule: the average over the centers of a grid of
// about 20,000 small cubes (GRID_POINTS). It is exact when the formula
// is linear in each U (the center of a small cube then gives its
// average over the cube), like D12's entries u1 and 1 - u1, and very
// close for smooth ones. Every other formula is averaged over the
// samples of sampleRandomVariables, all of them in one go.
const GRID_POINTS = 20736;     // 12^4: 20,736 points for one name, 144 a side for two, ...

function averagesOf(variables, formulas) {
  const averages = [], drawn = [];
  formulas.forEach(function (formula, i) {
    const names = namesBehind(randomNamesIn(formula.tree, variables.declared), variables.declared);
    const code = prepareFormula(formula.tree, variables.declared).compile();
    const work = function (drawer) { return numberOf(code.evaluate(drawer.scope), formula.label); };
    if (onGrid(variables, names)) averages[i] = gridAverage(variables, names, work);
    else drawn.push({ i: i, work: work });
  });
  if (drawn.length > 0) {
    const samples = sampleRandomVariables(variables, function (drawer) {
      return drawn.map(function (one) { return one.work(drawer); });
    });
    drawn.forEach(function (one, m) {
      let sum = 0;
      for (const sample of samples) sum += sample[m];
      averages[one.i] = sum / samples.length;
    });
  }
  return averages;
}

// The names with laws behind the names "names": a formula line's name
// stands for the names its own formula uses, and so on (m = max(v, z)
// comes down to v and z).
function namesBehind(names, declared) {
  const behind = [];
  (function look(list) {
    for (const name of list) {
      const line = declared.byName.get(name);
      if (line.kind === "formula") look(line.uses);
      else if (!behind.includes(name)) behind.push(name);
    }
  })(names);
  return behind;
}

// Can the grid average a formula that comes down to these names with
// laws? (See above.)
function onGrid(variables, names) {
  return names.length <= 4 && names.every(function (name) {
    const line = variables.declared.byName.get(name);
    return line.kind === "law" && !line.family && !variables.laws.get(name).draw;
  });
}

// The midpoint rule: work(drawer) averaged over the centers of the
// grid, G points on the side of each of the k names (G^k at most
// GRID_POINTS). The uniform number behind name a is the center of the
// stretch at[a] of its side.
function gridAverage(variables, names, work) {
  const k = names.length, G = k === 0 ? 1 : Math.floor(Math.pow(GRID_POINTS, 1 / k) + 1e-9);
  const sideOf = new Map(names.map(function (name, a) { return [nameKey(name, 0), a]; }));
  const at = new Array(k).fill(0), total = Math.pow(G, k);
  const drawer = makeDrawer(variables, function (key) { return (at[sideOf.get(key)] + 0.5) / G; });
  let sum = 0;
  for (let i = 0; i < total; i++) {
    for (let a = 0, rest = i; a < k; a++, rest = Math.floor(rest / G)) at[a] = rest % G;
    drawer.at(i);
    sum += work(drawer);
  }
  return sum / total;
}


/* =====================================================================
   7. THE BOX ON THE PAGE
   ---------------------------------------------------------------------
   A page puts  <div class="random-box"></div>  where the box goes (its
   data-about="..." is a line about what this sim's names are, shown
   first), and a <div id="sliders"> of its own for the sliders, then
   calls connectRandomBox (below).
   ===================================================================== */

// The box, as HTML: the lines and their typeset preview, a line for
// problems, the chart of one name's law (with the menu to pick which,
// and one to give it a new law), and how to type them.
function randomBoxHTML(settings) {
  const groups = LAW_GROUPS.map(function (group) {
    const laws = Object.keys(LAW_CATALOG).filter(function (key) { return LAW_CATALOG[key].group === group; });
    return '<optgroup label="' + group + '">' + laws.map(function (key) {
      return '<option value="law:' + key + '">' + LAW_CATALOG[key].name + "</option>";
    }).join("") + "</optgroup>";
  });
  const examples = RANDOM_EXAMPLES.map(function (example, i) { return '<option value="example:' + i + '">' + example.name + "</option>"; });
  return (settings.about ? '<p class="small">' + settings.about + "</p>" : "") +
    '<p class="small">Random variables, one per line:</p>' +
    '<textarea class="formula-input" id="random-text" rows="3" spellcheck="false"></textarea>' +
    '<div class="formula-preview" id="random-preview"></div>' +
    '<p class="muted small" id="random-message"></p>' +
    '<div class="option-row">Chart of <select id="random-chart-of"></select>' +
      '<select id="random-new-law"><option value="">Give it a new law</option>' + groups.join("") +
      '<optgroup label="Formulas of random variables">' + examples.join("") + "</optgroup></select></div>" +
    '<canvas class="chart" id="random-chart"></canvas>' +
    '<p class="muted small" id="random-note"></p>' +
    '<p class="muted small"><code>u ~ unif(0, 1)</code> gives u a law: one from the list, or a density in x ' +
      "like <code>{x &gt;= 0: e^(-x), 0}</code>. <code>X = 2 u + 1</code> makes a random variable from others, " +
      "and <code>d_k</code> is a family d<sub>1</sub>, d<sub>2</sub>, &hellip;, used as in " +
      "<code>sum(k, 1, 40, d_k / 3^k)</code>. Any other letter gets a slider. The chart is " +
      'F(x) = P(X &le; x). <a href="' + SITE_ROOT + 'help/random-variables.html">How to type them, and every law</a>.</p>';
}

// Formulas of random variables for the menu. NAME is the name being
// charted; each line whose name is already in the box replaces it.
const RANDOM_EXAMPLES = [
  { name: "Random digits: Σ d_k / 3^k (the Cantor law)", lines: ["d_k ~ unif([0, 2])", "NAME = sum(k, 1, 40, d_k / 3^k)"] },
  { name: "Bernoulli convolution: Σ s_k λ^k", lines: ["s_k ~ rademacher()", "NAME = sum(k, 0, 80, s_k λ^k)"],
    sliders: { λ: { value: 0.6, min: 0.5, max: 1, step: 0.001 } } },
  { name: "Weierstrass's function at a uniform point", lines: ["v ~ unif(0, 1)", "NAME = sum(n, 0, 30, a^n cos(3^n pi v))"],
    sliders: { a: { value: 0.5, min: 0, max: 1, step: 0.01 } } },
  { name: "A perpetuity: Σ b_k a_1 a_2 ⋯ a_(k−1)", lines: ["a_k ~ unif(0, 1)", "b_k ~ exp(1)", "NAME = sum(k, 1, 30, b_k prod(j, 1, k - 1, a_j))"] },
  { name: "A mixture: one law or another, by a coin flip", lines: ["c ~ bernoulli(1/2)", "v ~ normal(-2, 1)", "z ~ normal(2, 1)", "NAME = {c = 1: v, z}"] },
  { name: "The larger of two", lines: ["v ~ unif(0, 1)", "z ~ unif(0, 1)", "NAME = max(v, z)"] },
];

fillBlocks(".random-box", randomBoxHTML);

// Connect the box. "options":
//   reserved     the letters the page uses itself (can't be names or
//                sliders in the lines)
//   needs        the names the page's model uses (FPP's w), if any:
//                without them the box says what to add
//   check(variables)  (optional) what is wrong with them for this sim
//                ("" if nothing), like FPP's "w can't be negative"
//   onTyped()    (optional) runs when someone types in the box (the
//                page's preset menu then says "Your own")
//   onRead(declared)  runs each time the lines are read anew: the page
//                then reads its own formulas and makes the sliders
//                (the box's letters are declared.letters)
//   sliders()    the page's sliders ({ letter: settings }), which a
//                formula from the menu may set
// While the lines can't be read (half typed, say), the last good
// reading stays and the line under them says what is wrong. Returns
// "box":
//   box.declared          the lines, read (readRandomVariables)
//   box.setText(text)     put text in the box (a preset), and read it
//   box.build(values)     the laws with the sliders' values
//                         (makeRandomVariables), with the chart drawn,
//                         or null (and the problem shown) if they
//                         can't be made
//   box.say(text)         show a problem (the page's own, like a gap
//                         that came out negative)
function connectRandomBox(options) {
  const box = { declared: null, variables: null };
  const text = byId("random-text"), chartOf = byId("random-chart-of"), newLaw = byId("random-new-law");
  box.say = function (message) { byId("random-message").textContent = message; };

  function read() {
    text.rows = Math.max(3, text.value.split("\n").length);     // every line shows
    let declared;
    try { declared = readRandomVariables(text.value, options.reserved); }
    catch (problem) { box.say("Can't read it yet. " + problem.message); return; }
    box.declared = declared;
    if (window.katex) katex.render(declared.tex, byId("random-preview"), { throwOnError: false, displayMode: true });
    showChartChoices(declared);
    options.onRead(declared);
  }

  // The "Chart of" menu: every name, keeping the one picked if it is
  // still there (else the first the page needs, else the first).
  function showChartChoices(declared) {
    const picked = chartOf.value;
    chartOf.innerHTML = declared.lines.map(function (line) {
      return '<option value="' + line.name + '">' + line.shown + "</option>";
    }).join("");
    const names = declared.lines.map(function (line) { return line.name; });
    const need = (options.needs || []).find(function (name) { return names.includes(name); });
    chartOf.value = names.includes(picked) ? picked : need || names[0] || "";
  }

  box.build = function (values) {
    if (!box.declared) return null;
    const missing = (options.needs || []).filter(function (name) { return !box.declared.byName.has(name); });
    if (missing.length > 0) {
      box.say("This sim uses " + missing.join(" and ") + ": add a line like  " + missing[0] + " ~ exp(1).");
      return null;
    }
    let variables;
    try {
      variables = makeRandomVariables(box.declared, values);
      const problem = options.check ? options.check(variables) : "";
      if (problem) { box.say(problem); return null; }
    } catch (problem) {
      box.say(problem.message);
      return null;
    }
    box.say("");
    box.variables = variables;
    chartSoon();
    return variables;
  };

  // The chart of the picked name's law, and how its F was found, drawn
  // once the page is done (a formula's law takes many draws, which
  // shouldn't hold up a slider).
  const chartSoon = oncePerFrame(function () {
    const name = chartOf.value, variables = box.variables;
    if (!name || !variables) { chartPen(byId("random-chart")); byId("random-note").textContent = ""; return; }
    let law;
    try { law = variables.lawOf(name); }
    catch (problem) { box.say(problem.message); return; }
    const line = variables.declared.byName.get(name);
    lawChart(byId("random-chart"), law);
    byId("random-note").textContent = (line.family ? "The law of each of " + line.name + "_1, " + line.name + "_2, ...: " : "") +
                                      lawHowText(line, law) + (law.note ? " " + law.note : "");
  });

  // Replace (or add) the line of "shown" with "line".
  function putLine(lines, shown, line) {
    const at = lines.findIndex(function (l) { const split = l.match(/^\s*([^~=<>!]*?)\s*[~=]/); return split && split[1] === shown; });
    if (at >= 0) lines[at] = line; else lines.push(line);
  }

  // The "Give it a new law" menu: a law from the catalog with its
  // starting parameters, or a formula from RANDOM_EXAMPLES.
  newLaw.addEventListener("change", function () {
    const [kind, which] = newLaw.value.split(":");
    newLaw.value = "";
    const line = box.declared && box.declared.byName.get(chartOf.value);
    const shown = line ? line.shown : (options.needs || ["u"])[0];
    const lines = text.value.split("\n").filter(function (l) { return l.trim() !== ""; });
    if (kind === "law") {
      putLine(lines, shown, shown + " ~ " + which + "(" + LAW_CATALOG[which].defaults.join(", ") + ")");
    } else if (kind === "example") {
      const example = RANDOM_EXAMPLES[Number(which)], sliders = options.sliders ? options.sliders() : {};
      for (const letter in example.sliders || {}) sliders[letter] = Object.assign({}, example.sliders[letter]);
      for (const l of example.lines) {
        const filled = l.replace("NAME", shown);
        putLine(lines, filled.match(/^\s*([^~=<>!]*?)\s*[~=]/)[1], filled);
      }
    } else {
      return;
    }
    text.value = lines.join("\n");
    if (options.onTyped) options.onTyped();
    read();
  });

  chartOf.addEventListener("change", chartSoon);
  text.addEventListener("input", function () {
    if (options.onTyped) options.onTyped();
    read();
  });
  box.setText = function (value) { text.value = value; read(); };
  return box;
}

// How a line's F was found, in words.
function lawHowText(line, law) {
  const draws = law.estimated ? law.estimated.toLocaleString() : "";
  if (line.kind === "formula") return "F worked out from " + draws + " draws, for this chart: the sim works the formula out at each place.";
  if (line.density) return "F added up from the density.";
  const how = LAW_CATALOG[line.catalog.key].how;
  if (how === "estimated") {
    return "F worked out from " + draws + " draws" + (law.draw ? ", for this chart: the sim's own draws are exact." : ".");
  }
  return how === "exact" ? "F from its formula." : "F added up from its density.";
}
