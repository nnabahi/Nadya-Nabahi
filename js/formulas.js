/* =====================================================================
   formulas.js  —  typed formulas and their sliders, like Desmos
   ---------------------------------------------------------------------
   Shared by the graph tool's formula box and the sims that take typed
   formulas (like Sequential Continuous Tiling). A page that loads this
   file loads math.js (https://mathjs.org) before it, which does the
   actual reading of the formulas.

   Contents:
     readTree(text)                 read a typed formula, Desmos style
     formulaTex(tree)               the formula typeset by KaTeX, with
                                      {condition: a, b} drawn as cases
     nameTex(name)                  a name typeset, u1 as u_1
     isSeries(node)                 is it sum(k, a, b, ...) or prod(k, a, b, ...)?
     sliderLetters(tree, own)       the letters in it that need a slider
     isFunctionName(path, parent)   is this name used as a function?
     NEW_SLIDER, SMALLEST_STEP      a new slider's settings
     makeSlider(name, s, onChange)  one slider row:  r = [1] ===o=== min max step
     showSliders(holder, letters, sliders, onChange)   a row for each letter
     sliderValues(sliders)          the sliders' values, { letter: value }
     readFormulaBoxes(...)          a page's formula boxes read, with
                                      their previews and sliders
     curveHalves(text)              a curve (x(t), y(t)) split in two
   ===================================================================== */


// Turn the typed text into a math.js expression "tree", made more
// Desmos-like in three ways:
//   - {condition: a, b} means "a if the condition holds, otherwise b",
//     as in Desmos (see piecewise below).
//   - "=" means "equals". math.js reads a single "=" as "set y to ...",
//     and refuses  x^2 + y^2 = 4  outright, so before reading, every
//     single "=" (not part of <=, >=, == or !=) becomes "==".
//   - every variable is one letter, so "xy" means x times y (math.js
//     would read it as one variable called "xy"). Greek letters count
//     too, so "δu" means δ times u. Names math.js knows, like sin, sqrt
//     or pi, are left alone.
// (math.js runs the function given to "transform" or "filter" once for
// every piece of the tree; "path" says where that piece sits inside its
// "parent".)
function readTree(text) {
  const equalsFixed = piecewise(text).replace(/(^|[^<>=!])=(?!=)/g, "$1==");
  return math.parse(equalsFixed).transform(function (node, path, parent) {
    // \p{L} is any letter, Latin or Greek (the "u" flag lets the test use it).
    const isWord = node.isSymbolNode && /^\p{L}{2,}$/u.test(node.name);
    if (!isWord || isFunctionName(path, parent) || math[node.name] !== undefined) return node;
    // Split e.g. "xyr" into x * y * r. The "true" means the product is
    // written without a multiplication sign, so the preview shows "xyr".
    const letters = Array.from(node.name).map(function (ch) { return new math.SymbolNode(ch); });
    return letters.reduce(function (product, letter) {
      return new math.OperatorNode("*", "multiply", [product, letter], true);
    });
  });
}

// Desmos's piecewise formulas, written the way math.js reads them:
//   {c: a, b}          ->  (c ? a : b)        a if c holds, otherwise b
//   {c1: a, c2: b, d}  ->  (c1 ? a : c2 ? b : d)
//   {c: a}             ->  (c ? a : NaN)      no "otherwise": undefined, as in Desmos
//   {c}                ->  (c ? 1 : NaN)
// They can sit inside each other: {x > 0: {y > 0: 1, 2}, 3}.
function piecewise(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") { out += text[i]; continue; }
    const end = closingBrace(text, i);
    const parts = splitOutside(text.slice(i + 1, end), ",").map(piecewise);
    // Build it from the back: a last part with no ":" (after other
    // parts) is the "otherwise".
    let result = "NaN";
    if (parts.length > 1 && splitOutside(parts[parts.length - 1], ":").length === 1) result = parts.pop();
    for (let k = parts.length - 1; k >= 0; k--) {
      const [condition, value] = splitOutside(parts[k], ":");
      result = "(" + condition + ") ? (" + (value === undefined ? "1" : value) + ") : (" + result + ")";
    }
    out += "(" + result + ")";
    i = end;
  }
  return out;
}

// Where the "}" that closes the "{" at position "start" is.
function closingBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("a { has no matching }.");
}

// Split "text" at every "mark" (like "," or ":") that is not inside
// brackets, so  mod(x, 3) = 0 : 1  splits at the ":" but not the ",".
function splitOutside(text, mark) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === mark && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

// The formula typeset by KaTeX (as a string KaTeX draws), the way
// Desmos shows it: a piecewise formula as cases,
//   { a   if c
//   { b   otherwise
// a name with digits or a subscript as u_1 or d_k (nameTex), a list
// [1, 2, 3] on one line, and sum(k, a, b, ...) as a sum sign with k = a
// under it and b over it (prod the same, with a product sign).
// (math.js asks "handler" about every piece of the tree first; it
// answers only for those pieces, and math.js does the rest.)
function formulaTex(tree) {
  const options = { parenthesis: "keep", implicit: "hide", handler: pieceTex };
  return tree.toTex(options);
  function pieceTex(node) {
    if (node.isSymbolNode && /^\p{L}(\d|_)/u.test(node.name)) return nameTex(node.name);
    if (node.isArrayNode && !node.items.some(function (item) { return item.isArrayNode; })) {
      return "\\left[" + node.items.map(function (item) { return item.toTex(options); }).join(", ") + "\\right]";
    }
    if (isSeries(node)) {
      const [k, a, b, body] = node.args, inner = bare(body);
      const wrap = inner.isConditionalNode || (inner.isOperatorNode && (inner.fn === "add" || inner.fn === "subtract"));
      return (node.fn.name === "sum" ? "\\sum" : "\\prod") + "_{" + k.name + "=" + a.toTex(options) + "}^{" + b.toTex(options) + "} " +
             (wrap ? "\\left(" + body.toTex(options) + "\\right)" : body.toTex(options));
    }
    if (node.isFunctionNode && node.fn.isSymbolNode && /_$/.test(node.fn.name) && node.args.length === 1) {
      return "{" + nameTex(node.fn.name.slice(0, -1)) + "}_{" + node.args[0].toTex(options) + "}";
    }
    return casesTex(node);
  }
  function casesTex(node) {
    let n = bare(node);
    if (!n.isConditionalNode) return undefined;
    const rows = [];
    while (n.isConditionalNode) {
      rows.push(bare(n.trueExpr).toTex(options) + " & \\text{if } " + bare(n.condition).toTex(options));
      n = bare(n.falseExpr);
    }
    const none = (n.isSymbolNode && n.name === "NaN") || (n.isConstantNode && Number.isNaN(n.value));   // no "otherwise"
    if (!none) rows.push(n.toTex(options) + " & \\text{otherwise}");
    return "\\begin{cases}" + rows.join(" \\\\ ") + "\\end{cases}";
  }
  // Without the brackets piecewise put around each piece.
  function bare(n) {
    while (n.isParenthesisNode) n = n.content;
    return n;
  }
}

// A name typeset as Desmos does: the digits after its letter, or what
// comes after "_", as a subscript (u1 as u_1, e_5 as e_5, d_k as d_k).
function nameTex(name) {
  const parts = name.match(/^(\p{L})(\d*)(?:_(\w+))?$/u);
  if (!parts) return name;
  const sub = [parts[2], parts[3]].filter(Boolean).join(",");
  return parts[1] + (sub ? "_{" + sub + "}" : "");
}

// Is "node" a sum or product over a letter, sum(k, a, b, ...), with k
// running from a to b? (A sum of four numbers, sum(1, 2, 3, 4), is
// math.js's own.)
function isSeries(node) {
  return node.isFunctionNode && node.fn.isSymbolNode && (node.fn.name === "sum" || node.fn.name === "prod") &&
         node.args.length === 4 && node.args[0].isSymbolNode && /^\p{L}$/u.test(node.args[0].name);
}

// The letters in the formula that need a slider: everything except its
// own variables "own" (x and y if left out) and names math.js already
// knows (pi, e, sqrt, ...).
function sliderLetters(tree, own) {
  if (own === undefined) own = ["x", "y"];
  const names = tree
    .filter(function (node, path, parent) {
      return node.isSymbolNode && !isFunctionName(path, parent);
    })
    .map(function (node) { return node.name; });
  return Array.from(new Set(names)).filter(function (name) {
    return !own.includes(name) && math[name] === undefined;
  });
}

// True for the "sin" in sin(x): a name used as a function, not a variable.
function isFunctionName(path, parent) {
  return Boolean(parent && parent.isFunctionNode && path === "fn");
}


// --- Sliders, like Desmos ---------------------------------------------
// A new slider's settings, and the smallest step a slider can have.
const NEW_SLIDER = { value: 1, min: -10, max: 10, step: 0.1 };
const SMALLEST_STEP = 0.001;

// One slider row for letter "name":
//     r = [1]  ====o====   min [-10]  max [10]  step [0.1]
// "s" holds its numbers ({ value, min, max, step }) and is changed in
// place; "onChange" runs whenever the value, min or max changes.
function makeSlider(name, s, onChange) {
  const row = document.createElement("div");
  row.className = "slider-row";
  row.innerHTML =
    '<span class="slider-name"></span>' +
    '<input type="number" class="slider-value" title="Value">' +
    '<input type="range" class="slider-range">' +
    '<span class="slider-limits">' +
      'min <input type="number" class="slider-min"> ' +
      'max <input type="number" class="slider-max"> ' +
      'step <input type="number" class="slider-step" min="' + SMALLEST_STEP + '">' +
    '</span>';
  row.querySelector(".slider-name").textContent = name + " =";

  const value = row.querySelector(".slider-value");
  const range = row.querySelector(".slider-range");
  const min = row.querySelector(".slider-min");
  const max = row.querySelector(".slider-max");
  const step = row.querySelector(".slider-step");

  // Copy the slider's numbers into its boxes.
  function show() {
    range.min = s.min; range.max = s.max; range.step = s.step; range.value = s.value;
    value.value = s.value; value.step = s.step;
    min.value = s.min; max.value = s.max; step.value = s.step;
  }

  // Dragging the slider.
  range.addEventListener("input", function () {
    s.value = Number(range.value);
    value.value = s.value;
    onChange();
  });
  // Typing a value. Like Desmos, a value past min or max stretches the range.
  value.addEventListener("input", function () {
    const v = Number(value.value);
    if (value.value === "" || !isFinite(v)) return;   // half-typed, e.g. "-"
    s.value = v;
    if (v < s.min) s.min = v;
    if (v > s.max) s.max = v;
    range.min = s.min; range.max = s.max; range.value = v;
    min.value = s.min; max.value = s.max;
    onChange();
  });
  // Changing min, max or step (checked when you finish typing).
  min.addEventListener("change", function () {
    const v = Number(min.value);
    if (min.value !== "" && v < s.max) { s.min = v; s.value = Math.max(s.value, v); }
    show(); onChange();
  });
  max.addEventListener("change", function () {
    const v = Number(max.value);
    if (max.value !== "" && v > s.min) { s.max = v; s.value = Math.min(s.value, v); }
    show(); onChange();
  });
  step.addEventListener("change", function () {
    const v = Number(step.value);
    if (step.value !== "" && v > 0) s.step = Math.max(v, SMALLEST_STEP);
    show();
  });

  show();
  return row;
}

// One slider row per letter (makeSlider), in the box "holder", in place
// of the rows it had. "sliders" maps each letter to its numbers: a new
// letter gets a fresh copy of NEW_SLIDER, and a letter keeps its numbers
// even if it leaves the formula and comes back. "onChange" is as for
// makeSlider.
function showSliders(holder, letters, sliders, onChange) {
  holder.innerHTML = "";
  for (const letter of letters) {
    if (!sliders[letter]) sliders[letter] = Object.assign({}, NEW_SLIDER);   // a fresh copy
    holder.appendChild(makeSlider(letter, sliders[letter], onChange));
  }
}

// The sliders' values now, as { letter: value } (what math.js needs to
// work a formula out).
function sliderValues(sliders) {
  const values = {};
  for (const letter in sliders) values[letter] = sliders[letter].value;
  return values;
}


// --- A page's formula boxes ---------------------------------------------
// The sims that take typed shapes (Sequential Continuous Tiling, External
// Continuous DLA) read their boxes the same way. For each NAME in
// "names", the box id="formula-NAME" is read (readTree), and typeset by
// KaTeX in id="preview-NAME"; the names in "curves" may also be typed as
// a curve (x(t), y(t)), with t from 0 to 2π. Every other letter gets a
// slider in the box "holder", shared by all the formulas (showSliders;
// "onChange" runs when one moves), in the order the letters first
// appear (a Set keeps that order, and each letter once); a curve's t
// gets none.
// It returns { NAME: the formula }, each written out with every "*"
// shown, so the second thread reads exactly what the preview shows (a
// curve as { x, y }). If one can't be read (usually it is just half
// typed), it says why in id="formula-message" and returns null, so the
// page keeps its last good run.
function readFormulaBoxes(names, curves, sliders, holder, onChange) {
  const trees = {};      // name -> [tree], or [x tree, y tree] for a curve
  for (const name of names) {
    const text = byId("formula-" + name).value.trim();
    try {
      if (text === "") throw new Error("it is empty.");
      trees[name] = ((curves.includes(name) && curveHalves(text)) || [text]).map(readTree);
    } catch (problem) {
      byId("formula-message").textContent = "Can't read " + name + " yet: " + problem.message;
      return null;
    }
    if (window.katex) {
      const tex = trees[name].map(formulaTex);
      katex.render(tex.length === 2 ? "\\left(" + tex.join(",\\ ") + "\\right)" : tex[0], byId("preview-" + name),
                   { throwOnError: false });
    }
  }
  byId("formula-message").textContent = "";

  const letters = new Set(names.flatMap(function (name) {
    const own = trees[name].length === 2 ? ["x", "y", "t"] : ["x", "y"];
    return trees[name].flatMap(function (tree) { return sliderLetters(tree, own); });
  }));
  showSliders(holder, letters, sliders, onChange);

  const formulas = {};
  for (const name of names) {
    const written = trees[name].map(function (tree) { return tree.toString({ implicit: "show" }); });
    formulas[name] = written.length === 2 ? { x: written[0], y: written[1] } : written[0];
  }
  return formulas;
}

// If "text" is a curve "(x(t), y(t))", its two halves; otherwise null.
function curveHalves(text) {
  if (!/^\(.*\)$/s.test(text)) return null;
  const halves = splitOutside(text.slice(1, -1), ",");
  return halves.length === 2 ? halves : null;
}
