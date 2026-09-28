/* =========================================================
   A small self-contained math-expression engine for simulations
   that take a user-typed function like f(x, y) as input.

   Responsibilities:
     - Tokenize/parse a "friendly" math syntax: ^ means exponentiation
       (not JS's bitwise XOR), and multiplication can be implicit
       (2x, 2(x+1), (x+1)(x-1), 2pi*r, ...).
     - Also understands a handful of Desmos-style extras: list
       literals [a, b, c], indexing d[j], comparisons (a=b, a<b, ...,
       using a single "=" for equality the way Desmos does), a
       piecewise block {cond : a, b} (b is the "otherwise" value, and
       may itself be another {cond2 : a2, b2} to chain conditions),
       and .method(...) calls -- currently just discretedist(v, w)
       .random(), a weighted pick from a value list v with weights w.
     - Compile the parsed expression to a real JS function via
       `new Function`, sandboxed to a fixed whitelist of math names,
       bound to whatever argument names the caller asks for (x,y by
       default; a sim wanting X(i,j) can ask for ["i","j"] instead,
       optionally with extra bound names like a precomputed array).
     - Render the same parse tree to LaTeX for a live KaTeX preview,
       so exponents/fractions/square roots/piecewise braces show up
       typeset properly as you type, the way Wolfram Alpha or Desmos
       show your input back to you (this module has nothing to do
       with either's computation engine -- it's just a parser + two
       renderers).
     - Detect "free variables" in an expression (identifiers that
       aren't a bound argument or a known math name) so a sim can
       offer a Desmos-style slider for each one automatically.

   Anything the parser doesn't recognize (&&, ||, JS ternary ?: ...)
   falls back to being compiled as raw JS, exactly as before this
   module existed, just without a LaTeX preview. This keeps existing
   advanced expressions working while giving the common case (and now
   the piecewise/list/comparison case too) the nicer typing experience.
   ========================================================= */

export const MATH_FN_NAMES = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "sqrt", "cbrt", "abs", "exp", "log", "log2", "log10",
  "pow", "min", "max", "floor", "ceil", "round", "sign",
  "hypot", "random", "randint", "mod", "discretedist",
]);

export const MATH_CONST_NAMES = new Set(["pi", "PI", "e", "E"]);

/** Everything that's a "reserved" name -- not eligible to become a
 *  Desmos-style slider variable, and (for functions) special-cased
 *  in the parser as a function call rather than implicit multiplication.
 *  Assumes the classic x,y-bound usage; sims with different bound
 *  argument names (X(i,j), ...) should use reservedNamesFor() instead. */
export const RESERVED_NAMES = new Set([
  "x", "y", ...MATH_FN_NAMES, ...MATH_CONST_NAMES,
]);

/** Like RESERVED_NAMES, but for a function bound to arbitrary argument
 *  names (e.g. reservedNamesFor(["i","j"], ["d"]) for a X(i,j) box that
 *  also has a precomputed array `d` in scope and shouldn't treat "d" as
 *  a free/slider variable). */
export function reservedNamesFor(boundArgs, extraNames = []) {
  return new Set([...boundArgs, ...extraNames, ...MATH_FN_NAMES, ...MATH_CONST_NAMES]);
}

const FUNCTION_PREAMBLE =
  "var sin=Math.sin, cos=Math.cos, tan=Math.tan, asin=Math.asin, acos=Math.acos, atan=Math.atan, atan2=Math.atan2," +
  " sqrt=Math.sqrt, cbrt=Math.cbrt, abs=Math.abs, exp=Math.exp, log=Math.log, log2=Math.log2, log10=Math.log10," +
  " pow=Math.pow, min=Math.min, max=Math.max, floor=Math.floor, ceil=Math.ceil, round=Math.round, sign=Math.sign," +
  " hypot=Math.hypot, PI=Math.PI, E=Math.E, pi=Math.PI, e=Math.E," +
  " random=Math.random, randint=function(a,b){ return Math.floor(a + Math.random() * (Math.floor(b) - Math.ceil(a) + 1)); }," +
  " mod=function(a,b){ return ((a % b) + b) % b; }," +
  " discretedist=function(v,w){ return { __dist: true, v: v, w: w }; }," +
  " _distRandom=function(dist){" +
  "   if (!dist || !dist.__dist) throw new Error('.random() can only be called on discretedist(v, w)');" +
  "   var v = dist.v, w = dist.w, total = 0;" +
  "   for (var k = 0; k < w.length; k++) total += Math.max(0, w[k]);" +
  "   if (total <= 0) return v.length ? v[0] : 0;" +
  "   var r = Math.random() * total;" +
  "   for (var k = 0; k < w.length; k++) { var wt = Math.max(0, w[k]); if (r < wt) return v[k]; r -= wt; }" +
  "   return v[v.length - 1];" +
  " }," +
  " _randintFromU=function(u,a,b){ return Math.floor(a + u * (Math.floor(b) - Math.ceil(a) + 1)); }," +
  " _distRandomFromU=function(u,dist){" +
  "   if (!dist || !dist.__dist) throw new Error('.random() can only be called on discretedist(v, w)');" +
  "   var v = dist.v, w = dist.w, total = 0;" +
  "   for (var k = 0; k < w.length; k++) total += Math.max(0, w[k]);" +
  "   if (total <= 0) return v.length ? v[0] : 0;" +
  "   var target = u * total, cum = 0;" +
  "   for (var k = 0; k < w.length; k++) { cum += Math.max(0, w[k]); if (target < cum) return v[k]; }" +
  "   return v[v.length - 1];" +
  " }," +
  " _range=function(a,b){" +
  "   a = Math.round(a); b = Math.round(b);" +
  "   var out = [];" +
  "   if (b >= a) { for (var k = a; k <= b; k++) out.push(k); }" +
  "   else { for (var k = a; k >= b; k--) out.push(k); }" +
  "   return out;" +
  " };\n";

/* ---------- Free-variable detection (used for the slider UI) ---------- */

/** Identifiers in `expr` that aren't in `reserved` -- the free
 *  variables a Desmos-style expression input should get sliders for. */
export function freeVariables(expr, reserved = RESERVED_NAMES) {
  const found = new Set();
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m;
  while ((m = re.exec(expr))) {
    if (!reserved.has(m[0])) found.add(m[0]);
  }
  return [...found].sort();
}

/** Walks an already-parsed AST collecting every comprehension loop
 *  variable name used anywhere in it (e.g. the "i","j" in
 *  "[i+j for i=[1...N], j=[1...N]]"), into `out` (a Set, default fresh).
 *  Unlike collectIdentifiers below, this ignores scope entirely -- it's
 *  a flat "what names does this expression bind anywhere" query, handy
 *  for a caller that just wants to know which names NOT to offer as,
 *  say, a new row/slider name (freeVariablesScoped uses the properly
 *  scope-aware collectIdentifiers instead, so a name shadowed outside
 *  its own comprehension body is still treated as free there). */
export function collectComprehensionNames(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  switch (node.type) {
    case "num": case "ident": break;
    case "neg": collectComprehensionNames(node.arg, out); break;
    case "group": collectComprehensionNames(node.expr, out); break;
    case "pow": collectComprehensionNames(node.base, out); collectComprehensionNames(node.exponent, out); break;
    case "call": for (const a of node.args) collectComprehensionNames(a, out); break;
    case "list": for (const it of node.items) collectComprehensionNames(it, out); break;
    case "index": collectComprehensionNames(node.target, out); collectComprehensionNames(node.index, out); break;
    case "method":
      collectComprehensionNames(node.target, out);
      for (const a of node.args) collectComprehensionNames(a, out);
      break;
    case "cmp": collectComprehensionNames(node.left, out); collectComprehensionNames(node.right, out); break;
    case "piecewise":
      for (const b of node.branches) { collectComprehensionNames(b.cond, out); collectComprehensionNames(b.val, out); }
      if (node.else !== null) collectComprehensionNames(node.else, out);
      break;
    case "bin": collectComprehensionNames(node.left, out); collectComprehensionNames(node.right, out); break;
    case "range": collectComprehensionNames(node.from, out); collectComprehensionNames(node.to, out); break;
    case "comprehension":
      for (const cl of node.clauses) { out.add(cl.name); collectComprehensionNames(cl.list, out); }
      collectComprehensionNames(node.body, out);
      break;
    default: break;
  }
  return out;
}

/** Walks an already-parsed AST collecting every genuine identifier
 *  REFERENCE (i.e. every "ident" node -- never a function/method name,
 *  which the grammar always keeps out of "ident" nodes, and never a
 *  syntax keyword like the comprehension's contextual "for", which
 *  isn't stored in the AST as an identifier at all), tracking bound
 *  names (comprehension loop variables) as it descends so a name is
 *  only collected where it's actually free. This is what
 *  freeVariablesScoped uses instead of scanning raw source text with a
 *  regex, precisely so syntax like "for" can never be mistaken for a
 *  variable the way it would be if `expr` were just pattern-matched as
 *  a string. `bound` is the set of names currently in scope (added to
 *  going into a comprehension's body, restored on the way back out);
 *  `out` collects every free reference found (a Set, default fresh). */
export function collectIdentifiers(node, bound = new Set(), out = new Set()) {
  if (!node || typeof node !== "object") return out;
  switch (node.type) {
    case "num": return out;
    case "ident":
      if (!bound.has(node.name)) out.add(node.name);
      return out;
    case "neg": collectIdentifiers(node.arg, bound, out); return out;
    case "group": collectIdentifiers(node.expr, bound, out); return out;
    case "pow": collectIdentifiers(node.base, bound, out); collectIdentifiers(node.exponent, bound, out); return out;
    case "call": for (const a of node.args) collectIdentifiers(a, bound, out); return out;
    case "list": for (const it of node.items) collectIdentifiers(it, bound, out); return out;
    case "index": collectIdentifiers(node.target, bound, out); collectIdentifiers(node.index, bound, out); return out;
    case "method":
      collectIdentifiers(node.target, bound, out);
      for (const a of node.args) collectIdentifiers(a, bound, out);
      return out;
    case "cmp": collectIdentifiers(node.left, bound, out); collectIdentifiers(node.right, bound, out); return out;
    case "piecewise":
      for (const b of node.branches) { collectIdentifiers(b.cond, bound, out); collectIdentifiers(b.val, bound, out); }
      if (node.else !== null) collectIdentifiers(node.else, bound, out);
      return out;
    case "bin": collectIdentifiers(node.left, bound, out); collectIdentifiers(node.right, bound, out); return out;
    case "range": collectIdentifiers(node.from, bound, out); collectIdentifiers(node.to, bound, out); return out;
    case "comprehension": {
      // Each clause's source list is evaluated in the OUTER scope (it
      // can reference an earlier clause's loop variable, Cartesian-
      // product style, but not its own or a later one); the body sees
      // every clause's loop variable as bound.
      const innerBound = new Set(bound);
      for (const cl of node.clauses) {
        collectIdentifiers(cl.list, innerBound, out);
        innerBound.add(cl.name);
      }
      collectIdentifiers(node.body, innerBound, out);
      return out;
    }
    default: return out;
  }
}

/** Like freeVariables, but scope-aware and AST-based rather than a raw
 *  text scan: parses `expr` with the friendly grammar first, then walks
 *  the AST (via collectIdentifiers) so only genuine identifier
 *  REFERENCES count, comprehension loop variables are correctly bound
 *  only within their own body, and syntax like the comprehension's
 *  contextual "for" keyword can never be mistaken for a free variable
 *  the way a plain regex-over-text approach would (a real bug this
 *  replaced: "[random() for i=[0...N]]" used to surface a phantom "for"
 *  slider and then fail to compile, since "for" is a reserved JS word
 *  and can't be used as a function parameter name). Falls back to the
 *  plain regex-based freeVariables for text outside the friendly
 *  grammar (raw-JS fallback expressions), since there's no AST to
 *  scope-check there. */
export function freeVariablesScoped(expr, reserved = RESERVED_NAMES) {
  const ast = parseFriendly(expr, MATH_FN_NAMES);
  if (!ast) return freeVariables(expr, reserved);
  const found = collectIdentifiers(ast, new Set(), new Set());
  return [...found].filter((n) => !reserved.has(n)).sort();
}

/** Detects a Desmos-style "name = expr" definition row (e.g. typing
 *  "d = [discretedist([2,3],[1-p,p]).random() for j=[1...N]]" into a
 *  freeform box). Returns { name, expr } or null if `text` doesn't start
 *  with a bare "IDENT =" prefix (careful not to match comparisons like
 *  "a==b" or "a<=b" -- the negative lookahead rejects "==", and a
 *  non-"=" character right after the identifier, as in "<=", simply
 *  fails to match at all). Deliberately does NOT support a
 *  "name(params) = expr" function-row form -- named rows here are
 *  always values/lists, never called like functions. */
export function parseDefinition(text) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?!=)([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { name: m[1], expr: m[2] };
}

/* ---------- Coupled-randomness storage ("LatentPool") ----------
   Each independent random-generating call site in a compiled expression
   (see assignRandomSites/currentLatent above) needs its own persistent
   field of per-index uniforms, u_0, u_1, u_2, ... one per evaluation
   index (a grid cell, a comprehension iteration, ...) -- generated lazily
   the first time that index is actually evaluated, and kept fixed after
   that until an explicit hard reset. makeLatentSite() returns one such
   field as a callable accessor `(i) => u_i` (backed by a Map so it never
   needs to know its eventual size up front -- essential once sites can
   live inside a comprehension, whose element count is only known once
   the loop actually runs). LatentPool bundles one accessor per site for
   a whole compiled expression (siteCount of them); its `.sites` array is
   exactly what should be passed as the compiled function's `_L` argument,
   since the generated code calls it as `_L[site](index)`. ---------- */

/** One persistent, lazily-filled field of per-index uniforms. */
export function makeLatentSite() {
  const cache = new Map();
  const accessor = (i) => {
    let v = cache.get(i);
    if (v === undefined) {
      v = Math.random();
      cache.set(i, v);
    }
    return v;
  };
  accessor.reset = () => cache.clear();
  return accessor;
}

/** A pool of LatentSite accessors, one per random-generating call site
 *  in a compiled expression. `ensureCount(n)` grows the pool (lazily
 *  creating new sites) to at least n entries without disturbing existing
 *  ones -- call it whenever a recompile might have changed siteCount.
 *  `hardReset()` clears every site's cache, so the next read of any
 *  index reshuffles a fresh uniform for it (the "Regenerate randomness"
 *  action). `.sites` is the array to pass as `_L`. */
export class LatentPool {
  constructor() {
    this.sites = [];
  }
  ensureCount(count) {
    while (this.sites.length < count) this.sites.push(makeLatentSite());
  }
  hardReset() {
    for (const s of this.sites) s.reset();
  }
}

/* ---------- Tokenizer ---------- */

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      // A "." here is a decimal point UNLESS it's actually the start of
      // a "..." ellipsis (range syntax [a...b]) -- don't swallow that dot.
      if (src[j] === "." && src.slice(j, j + 3) !== "...") { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      tokens.push({ type: "num", raw: src.slice(i, j), value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: "ident", name: src.slice(i, j) });
      i = j;
      continue;
    }
    if (src.slice(i, i + 3) === "...") {
      tokens.push({ type: "..." });
      i += 3;
      continue;
    }
    if ("<>=!".includes(c)) {
      const two = src.slice(i, i + 2);
      if (two === "<=" || two === ">=" || two === "==" || two === "!=") {
        tokens.push({ type: "cmp", op: two === "==" ? "=" : two });
        i += 2;
        continue;
      }
      if (c === "!") { tokens.push({ type: "other", raw: c }); i++; continue; }
      tokens.push({ type: "cmp", op: c }); // '<' '>' '='
      i++;
      continue;
    }
    if ("+-*/^%(),.[]{}:".includes(c)) {
      tokens.push({ type: c });
      i++;
      continue;
    }
    // Anything else (&&, ||, JS ternary ?:, ...) isn't part of this
    // grammar -- bail out so the caller can fall back to raw JS.
    tokens.push({ type: "other", raw: c });
    i++;
  }
  tokens.push({ type: "eof" });
  return tokens;
}

/* ---------- Recursive-descent parser ----------
   compare := addExpr (cmpOp addExpr)?               // cmpOp: = < > <= >= !=
   addExpr := term (('+' | '-') term)*
   term    := unary (( '*' | '/' | '%' ) unary | <implicit-factor>)*
   unary   := '-' unary | '+' unary | pow
   pow     := postfix ('^' unary)?                    // right-assoc
   postfix := primary ( '[' compare ']' | '.' IDENT '(' args ')' )*
   primary := NUMBER | IDENT | IDENT '(' args ')' | '(' compare ')'
            | '[' ']'                                   // empty list
            | '[' compare '...' compare ']'             // integer range, e.g. [1...N]
            | '[' compare 'for' clause (',' clause)* ']' // comprehension (Cartesian product)
            | '[' items ']'                            // list literal
            | '{' branch (',' branch)* '}'              // piecewise
   branch  := compare (':' compare)?                    // no ':' => "otherwise" value
   clause  := IDENT '=' compare                          // loop variable = source list/range
   args, items := (compare (',' compare)*)?
   ========================================================= */

class ParseError extends Error {}

/* ---------- Coupled randomness ----------
   For sims that want a random() / randint(a,b) / discretedist(v,w).random()
   to be MONOTONIC and STABLE under a slider (the classic "coupling from a
   single uniform" trick: fix u ~ Uniform(0,1) once per evaluation site and
   compare against it, so e.g. "random() < p" only ever turns MORE cells
   on as p increases, and nothing resets just because p moved), each
   random-generating node gets its own site index (assigned by
   assignRandomSites below, in AST-order, so two "random()" calls in one
   expression get two independent u's), and compileExpr's `latent` option
   makes astToJs compile it against a caller-supplied, persistent array of
   per-site uniform fields (`_L`) instead of calling Math.random() fresh
   every time. See pathcount.js for the array-management side of this
   (growing/persisting `_L` across recomputes, only refilling it on an
   explicit "regenerate"). ---------- */

function assignRandomSites(node, state) {
  if (!node || typeof node !== "object") return;
  switch (node.type) {
    case "num": case "ident": return;
    case "neg": assignRandomSites(node.arg, state); return;
    case "group": assignRandomSites(node.expr, state); return;
    case "pow": assignRandomSites(node.base, state); assignRandomSites(node.exponent, state); return;
    case "call":
      if (node.name === "random" || node.name === "randint") node.__site = state.next++;
      for (const a of node.args) assignRandomSites(a, state);
      return;
    case "list": for (const it of node.items) assignRandomSites(it, state); return;
    case "index": assignRandomSites(node.target, state); assignRandomSites(node.index, state); return;
    case "method":
      if (node.name === "random") node.__site = state.next++;
      assignRandomSites(node.target, state);
      for (const a of node.args) assignRandomSites(a, state);
      return;
    case "cmp": assignRandomSites(node.left, state); assignRandomSites(node.right, state); return;
    case "piecewise":
      for (const b of node.branches) { assignRandomSites(b.cond, state); assignRandomSites(b.val, state); }
      if (node.else !== null) assignRandomSites(node.else, state);
      return;
    case "bin": assignRandomSites(node.left, state); assignRandomSites(node.right, state); return;
    case "range": assignRandomSites(node.from, state); assignRandomSites(node.to, state); return;
    case "comprehension":
      assignRandomSites(node.body, state);
      for (const cl of node.clauses) assignRandomSites(cl.list, state);
      return;
    default: return;
  }
}

/** Transient compile-time context stack: pushed/popped by compileExpr
 *  around its single (synchronous, non-reentrant) astToJs(ast) call, so
 *  the "call"/"method" cases below know whether to emit coupled-latent
 *  code and, if so, how to index the current evaluation site (the top of
 *  the stack). A "comprehension" node pushes its OWN context (keyed by a
 *  flat per-iteration counter, see astToJs's "comprehension" case) while
 *  it compiles its body, then pops it back off -- so random-generating
 *  calls inside a comprehension get their own independent coupled site
 *  per iteration, while calls outside any comprehension keep using
 *  whatever context the caller passed to compileExpr. Empty (and
 *  currentLatent() returns null) for any caller that didn't ask for
 *  coupling in the first place. */
let _latentStack = [];
function currentLatent() {
  return _latentStack.length ? _latentStack[_latentStack.length - 1] : null;
}

function parseTokens(tokens, reservedFns) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    if (peek().type !== type) throw new ParseError(`Expected "${type}"`);
    return next();
  };

  function canStartFactor(tok) {
    return tok.type === "num" || tok.type === "ident" || tok.type === "(";
  }

  function parseArgList(closeType) {
    const items = [];
    if (peek().type !== closeType) {
      items.push(parseCompare());
      while (peek().type === ",") { next(); items.push(parseCompare()); }
    }
    expect(closeType);
    return items;
  }

  function parseBranch() {
    const first = parseCompare();
    if (peek().type === ":") {
      next();
      const val = parseCompare();
      return { cond: first, val };
    }
    return { otherwise: first };
  }

  function parsePiecewise() {
    expect("{");
    const branches = [];
    let elseNode = null;
    for (;;) {
      const b = parseBranch();
      if (b.otherwise !== undefined) elseNode = b.otherwise;
      else branches.push(b);
      if (peek().type === ",") { next(); continue; }
      break;
    }
    expect("}");
    return { type: "piecewise", branches, else: elseNode };
  }

  function parsePrimary() {
    const tok = peek();
    if (tok.type === "num") { next(); return { type: "num", value: tok.value, raw: tok.raw }; }
    if (tok.type === "ident") {
      next();
      if (peek().type === "(" && reservedFns.has(tok.name)) {
        next();
        const args = parseArgList(")");
        return { type: "call", name: tok.name, args };
      }
      return { type: "ident", name: tok.name };
    }
    if (tok.type === "(") {
      next();
      const inner = parseCompare();
      expect(")");
      return { type: "group", expr: inner };
    }
    if (tok.type === "[") {
      next();
      if (peek().type === "]") { next(); return { type: "list", items: [] }; }
      const first = parseCompare();
      if (peek().type === "...") {
        next();
        const to = parseCompare();
        expect("]");
        return { type: "range", from: first, to };
      }
      if (peek().type === "ident" && peek().name === "for") {
        next();
        const clauses = [];
        for (;;) {
          const nameTok = expect("ident");
          if (peek().type !== "cmp" || peek().op !== "=") throw new ParseError('Expected "=" in comprehension clause');
          next();
          const listExpr = parseCompare();
          clauses.push({ name: nameTok.name, list: listExpr });
          if (peek().type === ",") { next(); continue; }
          break;
        }
        expect("]");
        return { type: "comprehension", body: first, clauses };
      }
      const items = [first];
      while (peek().type === ",") { next(); items.push(parseCompare()); }
      expect("]");
      return { type: "list", items };
    }
    if (tok.type === "{") return parsePiecewise();
    throw new ParseError("Unexpected token");
  }

  function parsePostfix() {
    let node = parsePrimary();
    for (;;) {
      if (peek().type === "[") {
        next();
        const indexExpr = parseCompare();
        expect("]");
        node = { type: "index", target: node, index: indexExpr };
      } else if (peek().type === ".") {
        next();
        const methodTok = expect("ident");
        expect("(");
        const args = parseArgList(")");
        node = { type: "method", target: node, name: methodTok.name, args };
      } else break;
    }
    return node;
  }

  function parsePow() {
    const base = parsePostfix();
    if (peek().type === "^") {
      next();
      const exponent = parseUnary();
      return { type: "pow", base, exponent };
    }
    return base;
  }

  function parseUnary() {
    if (peek().type === "-") { next(); return { type: "neg", arg: parseUnary() }; }
    if (peek().type === "+") { next(); return parseUnary(); }
    return parsePow();
  }

  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      const tok = peek();
      if (tok.type === "*" || tok.type === "/" || tok.type === "%") {
        next();
        const right = parseUnary();
        left = { type: "bin", op: tok.type, left, right };
      } else if (canStartFactor(tok)) {
        const right = parseUnary();
        left = { type: "bin", op: "*", left, right, implicit: true };
      } else break;
    }
    return left;
  }

  function parseAdd() {
    let left = parseTerm();
    for (;;) {
      const tok = peek();
      if (tok.type === "+" || tok.type === "-") {
        next();
        const right = parseTerm();
        left = { type: "bin", op: tok.type, left, right };
      } else break;
    }
    return left;
  }

  function parseCompare() {
    const left = parseAdd();
    if (peek().type === "cmp") {
      const op = next().op;
      const right = parseAdd();
      return { type: "cmp", op, left, right };
    }
    return left;
  }

  const ast = parseCompare();
  if (peek().type !== "eof") throw new ParseError("Unexpected trailing input");
  return ast;
}

/** Parse `expr` with the friendly grammar. Returns the AST, or null if
 *  the expression uses syntax outside this grammar (&&, ||, JS ternary
 *  ?:, ...) -- callers should fall back to treating the raw text as JS
 *  in that case. */
export function parseFriendly(expr, reservedFns = MATH_FN_NAMES) {
  try {
    const tokens = tokenize(expr);
    if (tokens.some((t) => t.type === "other")) return null;
    return parseTokens(tokens, reservedFns);
  } catch (err) {
    if (err instanceof ParseError) return null;
    throw err;
  }
}

/* ---------- AST -> JS source ---------- */

export function astToJs(node) {
  switch (node.type) {
    case "num": return String(node.value);
    case "ident": return node.name;
    case "neg": return `(-${astToJs(node.arg)})`;
    case "group": return `(${astToJs(node.expr)})`;
    case "pow": return `(Math.pow(${astToJs(node.base)}, ${astToJs(node.exponent)}))`;
    case "call": {
      if (node.name === "random" && node.__site !== undefined) {
        const lat = currentLatent();
        if (lat) return `_L[${node.__site}](${lat.indexExpr})`;
        return "random()";
      }
      if (node.name === "randint" && node.__site !== undefined) {
        const a = node.args.map(astToJs);
        const lat = currentLatent();
        if (lat) return `_randintFromU(_L[${node.__site}](${lat.indexExpr}), ${a[0]}, ${a[1]})`;
        return `randint(${a.join(", ")})`;
      }
      return `${node.name}(${node.args.map(astToJs).join(", ")})`;
    }
    case "list": return `[${node.items.map(astToJs).join(", ")}]`;
    case "index": return `(${astToJs(node.target)})[Math.trunc(${astToJs(node.index)})]`;
    case "range": return `_range(${astToJs(node.from)}, ${astToJs(node.to)})`;
    case "comprehension": {
      const clauseCode = [];
      for (const cl of node.clauses) {
        const listVar = `_lst_${cl.name}`;
        const kVar = `_k_${cl.name}`;
        clauseCode.push(`var ${listVar} = ${astToJs(cl.list)};`);
        clauseCode.push(`for (var ${kVar} = 0; ${kVar} < ${listVar}.length; ${kVar}++) {`);
        clauseCode.push(`var ${cl.name} = ${listVar}[${kVar}];`);
      }
      _latentStack.push({ indexExpr: "_idx" });
      let bodyJs;
      try {
        bodyJs = astToJs(node.body);
      } finally {
        _latentStack.pop();
      }
      const closeBraces = node.clauses.map(() => "}").join(" ");
      return `(function(){ var _out=[]; var _idx=0; ${clauseCode.join(" ")} _out.push(${bodyJs}); _idx++; ${closeBraces} return _out; })()`;
    }
    case "method": {
      if (node.name === "random" && node.args.length === 0) {
        const targetJs = astToJs(node.target);
        const lat = currentLatent();
        if (lat && node.__site !== undefined) return `_distRandomFromU(_L[${node.__site}](${lat.indexExpr}), ${targetJs})`;
        return `_distRandom(${targetJs})`;
      }
      throw new Error(`Unsupported method ".${node.name}(...)" -- only .random() on discretedist(v, w) is supported.`);
    }
    case "cmp": {
      const jsOp = node.op === "=" ? "===" : node.op;
      return `((${astToJs(node.left)} ${jsOp} ${astToJs(node.right)}) ? 1 : 0)`;
    }
    case "piecewise": {
      let s = "";
      for (const b of node.branches) s += `(${astToJs(b.cond)}) ? (${astToJs(b.val)}) : `;
      s += node.else !== null ? `(${astToJs(node.else)})` : "0";
      return `(${s})`;
    }
    case "bin": return `(${astToJs(node.left)} ${node.op} ${astToJs(node.right)})`;
    default: throw new Error("Unknown node type");
  }
}

/* ---------- AST -> LaTeX (for the live preview) ---------- */

function identLatex(name) {
  if (name === "pi" || name === "PI") return "\\pi ";
  if (name === "e" || name === "E") return "e";
  if (name.length === 1) return name;
  return `\\mathit{${name}}`;
}

const SIMPLE_TRIG = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan",
  asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan",
};

function callLatex(node) {
  const a = node.args.map(astToLatex);
  switch (node.name) {
    case "sqrt": return `\\sqrt{${a[0]}}`;
    case "cbrt": return `\\sqrt[3]{${a[0]}}`;
    case "abs": return `\\left|${a[0]}\\right|`;
    case "exp": return `e^{${a[0]}}`;
    case "log": return `\\ln\\left(${a[0]}\\right)`;
    case "log2": return `\\log_2\\left(${a[0]}\\right)`;
    case "log10": return `\\log_{10}\\left(${a[0]}\\right)`;
    case "pow": return `{${a[0]}}^{${a[1]}}`;
    case "min": return `\\min\\left(${a.join(", ")}\\right)`;
    case "max": return `\\max\\left(${a.join(", ")}\\right)`;
    case "floor": return `\\lfloor ${a[0]} \\rfloor`;
    case "ceil": return `\\lceil ${a[0]} \\rceil`;
    case "sign": return `\\operatorname{sgn}\\left(${a[0]}\\right)`;
    case "atan2": return `\\operatorname{atan2}\\left(${a.join(", ")}\\right)`;
    case "random": return `\\operatorname{random}\\left(\\right)`;
    case "mod": return `${a[0]} \\bmod ${a[1]}`;
    default:
      if (SIMPLE_TRIG[node.name]) return `${SIMPLE_TRIG[node.name]}\\left(${a[0]}\\right)`;
      return `\\operatorname{${node.name}}\\left(${a.join(", ")}\\right)`;
  }
}

/** True if `node` needs explicit \left(\right) wrapping to be
 *  unambiguous when it's a factor, a power base, or negated. */
function isCompound(node) {
  return node.type === "bin" && (node.op === "+" || node.op === "-");
}

function wrapped(node) {
  const s = astToLatex(node);
  return isCompound(node) ? `\\left(${s}\\right)` : s;
}

const CMP_LATEX = { "=": "=", "<": "<", ">": ">", "<=": "\\leq", ">=": "\\geq", "!=": "\\neq" };

export function astToLatex(node) {
  switch (node.type) {
    case "num": return node.raw !== undefined ? node.raw : String(node.value);
    case "ident": return identLatex(node.name);
    case "neg": return `-${wrapped(node.arg)}`;
    case "group": return `\\left(${astToLatex(node.expr)}\\right)`;
    case "pow": {
      const base = (node.base.type === "num" || node.base.type === "ident" ||
        node.base.type === "call" || node.base.type === "group")
        ? astToLatex(node.base) : `\\left(${astToLatex(node.base)}\\right)`;
      return `{${base}}^{${astToLatex(node.exponent)}}`;
    }
    case "call": return callLatex(node);
    case "list": return `\\left[${node.items.map(astToLatex).join(", ")}\\right]`;
    case "index": return `${wrapped(node.target)}\\left[${astToLatex(node.index)}\\right]`;
    case "range": return `\\left[${astToLatex(node.from)} \\ldots ${astToLatex(node.to)}\\right]`;
    case "comprehension": {
      const clauses = node.clauses.map((c) => `${identLatex(c.name)}=${astToLatex(c.list)}`).join(",\\ ");
      return `\\left[${astToLatex(node.body)} \\text{ for } ${clauses}\\right]`;
    }
    case "method": return `${wrapped(node.target)}.\\operatorname{${node.name}}\\left(${node.args.map(astToLatex).join(", ")}\\right)`;
    case "cmp": return `${astToLatex(node.left)} ${CMP_LATEX[node.op] || node.op} ${astToLatex(node.right)}`;
    case "piecewise": {
      const rows = node.branches.map((b) => `${astToLatex(b.val)} & \\text{if } ${astToLatex(b.cond)}`);
      if (node.else !== null) rows.push(`${astToLatex(node.else)} & \\text{otherwise}`);
      return `\\begin{cases} ${rows.join(" \\\\ ")} \\end{cases}`;
    }
    case "bin": {
      if (node.op === "/") return `\\frac{${astToLatex(node.left)}}{${astToLatex(node.right)}}`;
      if (node.op === "%") return `${wrapped(node.left)} \\bmod ${wrapped(node.right)}`;
      if (node.op === "*") {
        const sep = node.implicit ? "\\," : " \\cdot ";
        return `${wrapped(node.left)}${sep}${wrapped(node.right)}`;
      }
      return `${astToLatex(node.left)} ${node.op} ${astToLatex(node.right)}`;
    }
    default: return "";
  }
}

/* ---------- Putting it together ---------- */

/**
 * Compile a user-typed expression into a function of (...boundArgs,
 * ...varNames) -- boundArgs defaults to ["x","y"] for the classic f(x,y)
 * case; a sim can pass e.g. ["i","j","d"] for a X(i,j) box that also
 * wants a precomputed array `d` available in scope (referenced as d[j]).
 *
 * Tries the friendly grammar first (so ^ means power, multiplication can
 * be implicit, and Desmos-style lists/indexing/comparisons/piecewise all
 * work); if that syntax isn't recognized (&&, ||, JS ternary ?: -- rare
 * once the friendly grammar covers comparisons/piecewise), falls back to
 * compiling the raw text as JS (where ^ is bitwise XOR, as in plain JS).
 *
 * `latent`, if given, is `{ indexExpr }` (a raw JS snippet, e.g.
 * "i*_N1+j" or "j", built from names already in boundArgs) that makes
 * every random()/randint(a,b)/discretedist(v,w).random() in the
 * expression compile against a persistent per-site uniform array `_L`
 * (see the "Coupled randomness" note above parseTokens) instead of
 * calling Math.random() fresh each time -- the caller must include
 * "_L" (and whatever names indexExpr references, e.g. "_N1") in
 * boundArgs itself, and pass matching values when calling the compiled
 * fn. Omit `latent` (the default) for the old, uncoupled behavior.
 *
 * Returns { fn, latex, usedFallback, siteCount } -- siteCount is how many
 * independent random-generating call sites were found (0 if none, or if
 * the raw-JS fallback was used), so the caller knows how many per-site
 * arrays to keep in `_L`. Throws on a genuine compile error (bad JS,
 * unknown identifier used as a function, ...).
 */
export function compileExpr(expr, varNames, boundArgs = ["x", "y"], latent = null) {
  if (!expr || !expr.trim()) throw new Error("Enter an expression.");
  const ast = parseFriendly(expr, MATH_FN_NAMES);
  let body, latex, usedFallback, siteCount = 0;
  if (ast) {
    const siteState = { next: 0 };
    assignRandomSites(ast, siteState);
    siteCount = siteState.next;
    _latentStack.push(latent);
    try {
      body = astToJs(ast);
      latex = astToLatex(ast);
    } finally {
      _latentStack.pop();
    }
    usedFallback = false;
  } else {
    const ALLOWED_EXPR = /^[0-9a-zA-Z_+\-*/%.,()[\]{}\s<>=!&|^~?:]*$/;
    if (!ALLOWED_EXPR.test(expr)) {
      throw new Error("Only numbers, bound variables, math operators, function names (sin, cos, sqrt, mod, discretedist, ...), and your own slider-variable names are allowed.");
    }
    body = expr;
    latex = null;
    usedFallback = true;
  }
  const source = '"use strict";\n' + FUNCTION_PREAMBLE + "return (" + body + ");";
  let fn;
  try {
    fn = new Function(...boundArgs, ...varNames, source);
  } catch (err) {
    throw new Error("Could not parse that expression.");
  }
  return { fn, latex, usedFallback, siteCount };
}
