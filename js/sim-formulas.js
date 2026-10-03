/* =====================================================================
   sim-formulas.js  —  reading typed formulas, Desmos-style
   ---------------------------------------------------------------------
   Shared by the graph tool's formula box (sims/graph-tool.js) and the
   sims' own formula boxes (like the tile in the random mountain). A
   page loads math.js (https://mathjs.org) before this file.

   Contents:
     readTree(text)                the typed text as a math.js "tree"
     isFunctionName(path, parent)  is this name used as a function?
   ===================================================================== */


// Turn the typed text into a math.js expression "tree", made more
// Desmos-like in two ways:
//   - "=" means "equals". math.js reads a single "=" as "set y to ...",
//     and refuses  x^2 + y^2 = 4  outright, so before reading, every
//     single "=" (not part of <=, >=, == or !=) becomes "==".
//   - every variable is one letter, so "xy" means x times y (math.js
//     would read it as one variable called "xy"). Names math.js knows,
//     like sin, sqrt or pi, are left alone.
// (math.js runs the function given to "transform" or "filter" once for
// every piece of the tree; "path" says where that piece sits inside its
// "parent".)
function readTree(text) {
  const equalsFixed = text.replace(/(^|[^<>=!])=(?!=)/g, "$1==");
  return math.parse(equalsFixed).transform(function (node, path, parent) {
    const isWord = node.isSymbolNode && /^[a-zA-Z]{2,}$/.test(node.name);
    if (!isWord || isFunctionName(path, parent) || math[node.name] !== undefined) return node;
    // Split e.g. "xyr" into x * y * r. The "true" means the product is
    // written without a multiplication sign, so the preview shows "xyr".
    const letters = node.name.split("").map(function (ch) { return new math.SymbolNode(ch); });
    return letters.reduce(function (product, letter) {
      return new math.OperatorNode("*", "multiply", [product, letter], true);
    });
  });
}

// True for the "sin" in sin(x): a name used as a function, not a variable.
function isFunctionName(path, parent) {
  return Boolean(parent && parent.isFunctionNode && path === "fn");
}
