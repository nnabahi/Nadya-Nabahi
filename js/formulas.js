/* =====================================================================
   formulas.js  —  typed formulas and their sliders, like Desmos
   ---------------------------------------------------------------------
   Shared by the graph tool's formula box and the sims that take typed
   formulas (like the random sequential packing). A page that loads this
   file loads math.js (https://mathjs.org) before it, which does the
   actual reading of the formulas.

   Contents:
     readTree(text)                 read a typed formula, Desmos style
     formulaTex(tree)               the formula typeset by KaTeX, with
                                      {condition: a, b} drawn as cases
     sliderLetters(tree)            the letters in it that need a slider
     isFunctionName(path, parent)   is this name used as a function?
     NEW_SLIDER, SMALLEST_STEP      a new slider's settings
     makeSlider(name, s, onChange)  one slider row:  r = [1] ===o=== min max step
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

// The formula typeset by KaTeX (as a string KaTeX draws), with a
// piecewise formula drawn the way Desmos shows it, as cases:
//   { a   if c
//   { b   otherwise
// (math.js asks "handler" about every piece of the tree first; it
// answers only for the "c ? a : b" pieces, and math.js does the rest.)
function formulaTex(tree) {
  const options = { parenthesis: "keep", implicit: "hide", handler: casesTex };
  return tree.toTex(options);
  function casesTex(node) {
    let n = bare(node);
    if (!n.isConditionalNode) return undefined;
    const rows = [];
    while (n.isConditionalNode) {
      rows.push(bare(n.trueExpr).toTex(options) + " & \\text{if } " + bare(n.condition).toTex(options));
      n = bare(n.falseExpr);
    }
    if (!(n.isSymbolNode && n.name === "NaN")) rows.push(n.toTex(options) + " & \\text{otherwise}");
    return "\\begin{cases}" + rows.join(" \\\\ ") + "\\end{cases}";
  }
  // Without the brackets piecewise put around each piece.
  function bare(n) {
    while (n.isParenthesisNode) n = n.content;
    return n;
  }
}

// The letters in the formula that need a slider: everything except x, y
// and names math.js already knows (pi, e, sqrt, ...).
function sliderLetters(tree) {
  const names = tree
    .filter(function (node, path, parent) {
      return node.isSymbolNode && !isFunctionName(path, parent);
    })
    .map(function (node) { return node.name; });
  return [...new Set(names)].filter(function (name) {
    return name !== "x" && name !== "y" && math[name] === undefined;
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
