/* =========================================================
   Lattice path-counting recursion.

     f(x, y) = X(x, y) f(x-1, y) + Y(x, y) f(x, y-1),   f(0, 0) = 1,

   where X(i, j) is only defined for i >= 1, j >= 0 and Y(i, j) is
   only defined for i >= 0, j >= 1 -- each term is simply absent
   (contributes 0) outside its own domain, so f(0,0)=1 is the only
   "free" value and every other f(x, y) is forced by the recursion.

   X(i,j) and Y(i,j) are BOTH typed Desmos-style formulas (same input,
   same live preview + auto-sliders as f(x,y) in Gradient Percolation),
   bound to (i, j, N). Any value that "gates" X or Y is treated as open
   when it's finite and nonzero (so both a bare 1 and a 0/1-valued
   piecewise work as a gate).

   Beyond X and Y, you can define any number of extra NAMED ROWS, each
   typed Desmos-style as "name = expression" (e.g.
   "d = [discretedist([2,3],[1-p,p]).random() for j=[0...N]]"), and
   then reference that name from X, Y, or any OTHER named row, exactly
   like a Desmos variable -- indexed (d[j]) if it's a list, used
   directly if it's a scalar. Rows are resolved in dependency order
   (a row that references another is simply computed after it; a
   circular reference is reported as an error) so it doesn't matter
   what order you type them in. "N" (the grid extent) is always
   available too, e.g. in a range like [0...N].

   [a...b] is an inclusive integer range (ascending or descending),
   and [expr for v1=list1, v2=list2, ...] is a Desmos-style list
   comprehension over the Cartesian product of its clauses (as many
   loop variables as you like) -- both work anywhere an expression
   does, not just in a named row.

   SLIDERS are global and shared by name, the way Desmos's are: type
   the same free variable (like p) into X, Y, and/or a named row, and
   they all share the exact same slider -- one value, one bounded
   range, and a typeable number box right next to the slider, not just
   a drag handle.

   COUPLED randomness: every random()/randint(a,b)/discretedist(v,w)
   .random() anywhere (X, Y, a named row, or inside a comprehension)
   gets its own persistent, lazily-filled source of per-evaluation
   Uniform(0,1) values -- fixed once an index is first read and reused
   on every recompute, so moving a slider like p in {random()<p:1,0}
   only ever turns cells ON as p increases (never off), the classic
   "coupling from a single uniform" construction, rather than
   reshuffling independently every time. Editing a formula's TEXT
   keeps existing random sites' values too (matched positionally by
   where they appear in the expression) and only ever adds fresh ones
   for genuinely new call sites; only "Regenerate randomness" redraws
   everything from scratch. See js/lib/mathexpr.js's LatentPool /
   `latent` option for the compiler side of this; js/lib/mathinput.js
   has nothing to do with it (that's just the preview/slider glue).
   None of this has anything to do with Desmos's own computation
   engine, just the comfortable typing experience plus this one extra
   guarantee sims like this one need.

   In the trivial case X = Y = 1 everywhere, f(x, y) = C(x+y, x) [2],
   and the slice of f along an anti-diagonal x+y=n, viewed as a
   function of x, is exactly a Binomial(n, 1/2) shape -- which the
   de Moivre-Laplace theorem [1] says converges (after centering and
   scaling by sqrt(n)) to a Gaussian as n -> infinity. The slice view
   below reproduces that convergence for the trivial rule (slope
   s=1), and lets you search for the slope that produces a similar
   Gaussian shape once X/Y are randomized and no longer symmetric
   between the two coordinate directions -- see the "About" section
   below for a heuristic (not a theorem) about where that slope should
   land for the periodic-Y construction.

   Because f grows combinatorially (like C(x+y,x), i.e. roughly
   2^(x+y)), everything below is computed in log-space
   (L(x,y) = log f(x,y)) via a numerically-stable log-sum-exp, so
   cell values never overflow a 64-bit float even for large grids.

   References:
   [1] de Moivre, A. (1738) / Laplace, P.-S. (1812). See
       https://en.wikipedia.org/wiki/De_Moivre%E2%80%93Laplace_theorem
       and Feller, W. An Introduction to Probability Theory and Its
       Applications, Vol. 1, 3rd ed., Ch. VII, for a modern statement.
   [2] NIST Digital Library of Mathematical Functions, §26.3
       "Lattice Paths: Binomial Coefficients", https://dlmf.nist.gov/26.3
       (see also https://en.wikipedia.org/wiki/Lattice_path).
   ========================================================= */

import { el, heatColor } from "../lib/utils.js";
import { compileExpr, freeVariablesScoped, reservedNamesFor, parseDefinition, LatentPool } from "../lib/mathexpr.js";
import { renderMathPreview, syncVarSliders } from "../lib/mathinput.js";

const CANVAS_PX = 560;
const CHART_W = 720, CHART_H = 360;
const DEAD_COLOR = "#12141b";
const FALLBACK_NOTE = "Advanced expression — live preview unavailable (also uncoupled: random() here uses fresh randomness, not the coupled per-site fields).";
const DEFAULT_D_TEXT = "d = [discretedist([2,3],[1-p,p]).random() for j=[0...N]]";

function logaddexp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return hi + Math.log1p(Math.exp(lo - hi));
}

function idx(N, x, y) {
  return x * (N + 1) + y;
}

/** Splits the free identifiers of `expr` (scope-aware: a comprehension's
 *  own loop variables don't count) into `deps` -- names that refer to
 *  another named row, resolved in dependency order and passed in as a
 *  bound argument -- and `sliderVars` -- everything else, which becomes
 *  (or shares) a global Desmos-style slider. `boundBase` is the plain
 *  bound-argument names already in scope (e.g. ["i","j","N"] for X/Y,
 *  ["N"] for a named row) so those don't show up as either. */
function analyzeExprNames(expr, boundBase, auxNames) {
  const allFree = freeVariablesScoped(expr, reservedNamesFor(boundBase, []));
  const deps = allFree.filter((n) => auxNames.includes(n));
  const sliderVars = allFree.filter((n) => !auxNames.includes(n));
  return { deps, sliderVars };
}

/** Kahn's-algorithm topological sort of named rows by their `deps`
 *  (each entry: { name, deps: [...other row names it references] }).
 *  Returns the rows in an order where every row comes after everything
 *  it depends on. Throws if there's a circular reference. */
function topoSortRows(rows) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const inDegree = new Map(rows.map((r) => [r.name, 0]));
  const adj = new Map(rows.map((r) => [r.name, []]));
  for (const r of rows) {
    for (const dep of r.deps) {
      if (!byName.has(dep)) continue; // dependency isn't a currently-valid row; surfaces as a runtime error instead
      adj.get(dep).push(r.name);
      inDegree.set(r.name, inDegree.get(r.name) + 1);
    }
  }
  const queue = rows.filter((r) => inDegree.get(r.name) === 0).map((r) => r.name);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of adj.get(n)) {
      inDegree.set(m, inDegree.get(m) - 1);
      if (inDegree.get(m) === 0) queue.push(m);
    }
  }
  if (order.length !== rows.length) {
    const stuck = rows.filter((r) => !order.includes(r.name)).map((r) => r.name);
    throw new Error("Circular dependency among named rows: " + stuck.join(", "));
  }
  return order.map((n) => byName.get(n));
}

function computeLogF(N, fnX, poolX, depsXValues, varArgsX, fnY, poolY, depsYValues, varArgsY) {
  const size = (N + 1) * (N + 1);
  const Lg = new Float64Array(size).fill(-Infinity);
  const xOpen = new Uint8Array(size);
  const yOpen = new Uint8Array(size);
  Lg[idx(N, 0, 0)] = 0;
  for (let x = 0; x <= N; x++) {
    for (let y = 0; y <= N; y++) {
      if (x === 0 && y === 0) continue;
      let acc = -Infinity;
      if (x >= 1) {
        let vx;
        try { vx = fnX(x, y, N, poolX.sites, ...depsXValues, ...varArgsX); } catch (err) { vx = 0; }
        if (isFinite(vx) && vx !== 0) {
          xOpen[idx(N, x, y)] = 1;
          acc = logaddexp(acc, Lg[idx(N, x - 1, y)]);
        }
      }
      if (y >= 1) {
        let vy;
        try { vy = fnY(x, y, N, poolY.sites, ...depsYValues, ...varArgsY); } catch (err) { vy = 0; }
        if (isFinite(vy) && vy !== 0) {
          yOpen[idx(N, x, y)] = 1;
          acc = logaddexp(acc, Lg[idx(N, x, y - 1)]);
        }
      }
      Lg[idx(N, x, y)] = acc;
    }
  }
  return { Lg, xOpen, yOpen };
}

function logRange(Lg) {
  let min = Infinity, max = -Infinity, reachable = 0;
  for (let k = 0; k < Lg.length; k++) {
    const v = Lg[k];
    if (v === -Infinity) continue;
    reachable++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (reachable === 0) { min = 0; max = 0; }
  return { min, max, reachable, total: Lg.length };
}

/** Walk the line x + s*y = c by integer y in [0,N], rounding x to the
 *  nearest lattice column at each step. */
function slicePoints(N, Lg, s, c) {
  const pts = [];
  for (let y = 0; y <= N; y++) {
    const x = Math.round(c - s * y);
    if (x < 0 || x > N) continue;
    pts.push({ x, y, L: Lg[idx(N, x, y)] });
  }
  return pts;
}

export default {
  id: "pathcount",
  name: "Lattice Path Counting",
  category: "Trees, graphs & combinatorics",
  description:
    "f(x,y) = X(x,y) f(x-1,y) + Y(x,y) f(x,y-1), f(0,0)=1 — X(i,j) and Y(i,j) are both typed Desmos-style formulas, and can reference any number of named rows (list comprehensions, ranges) with global, shared-by-name sliders and coupled randomness. See the lattice + open-edge overlay on the heatmap, or slice log f along a line and compare to a fitted Gaussian.",

  mount(container) {
    const state = {
      N: 60,
      exprX: "1",
      exprY: "{mod(i,d[j])=0:1,0}",
      fnX: null, fnY: null,
      varNamesX: [], depsX: [], siteCountX: 0, poolX: new LatentPool(),
      varNamesY: [], depsY: [], siteCountY: 0, poolY: new LatentPool(),
      vars: {}, // ONE global slider store, shared by name across X, Y, and every named row
      manualVars: [], // names pinned into the slider panel by "+ Add slider" even when not (yet) referenced anywhere
      auxRows: [], // [{ id, text, name, expr, deps, varNames, fn, latex, usedFallback, siteCount, pool, error, previewEl, errorEl }]
      auxRowCounter: 0,
      auxOrder: [], // valid named rows in dependency order
      auxValues: {}, // name -> evaluated value (array or scalar), rebuilt every regenerateAll
      Lg: null, xOpenArr: null, yOpenArr: null,
      range: { min: 0, max: 0, reachable: 0, total: 0 },
      view: "heatmap",
      showLattice: true,
      slope: 1,
      sliceC: 60,
    };

    const canvas = el("canvas");
    const ctx = canvas.getContext("2d");
    const statsEl = el("p", { class: "hint" }, "");
    const sliceStatsEl = el("p", { class: "hint" }, "");
    const errorEl = el("p", { class: "hint", style: { color: "#ff6b6b", display: "none" } }, "");

    const LATENT_XY = { indexExpr: "i*(N+1)+j" };
    const LATENT_TOP = { indexExpr: "0" };

    // ---------- Core recompute ----------

    const evalAuxRow = (row) => {
      const varArgs = row.varNames.map((n) => state.vars[n].value);
      const depArgs = row.deps.map((n) => state.auxValues[n]);
      row.pool.ensureCount(row.siteCount);
      state.auxValues[row.name] = row.fn(state.N, row.pool.sites, ...depArgs, ...varArgs);
    };

    const regenerateAll = () => {
      errorEl.style.display = "none";
      try {
        const N = state.N;
        state.auxValues = {};
        for (const row of state.auxOrder) evalAuxRow(row);

        const varArgsX = state.varNamesX.map((n) => state.vars[n].value);
        const depArgsX = state.depsX.map((n) => state.auxValues[n]);
        state.poolX.ensureCount(state.siteCountX);

        const varArgsY = state.varNamesY.map((n) => state.vars[n].value);
        const depArgsY = state.depsY.map((n) => state.auxValues[n]);
        state.poolY.ensureCount(state.siteCountY);

        const res = computeLogF(N, state.fnX, state.poolX, depArgsX, varArgsX, state.fnY, state.poolY, depArgsY, varArgsY);
        state.Lg = res.Lg;
        state.xOpenArr = res.xOpen;
        state.yOpenArr = res.yOpen;
        state.range = logRange(state.Lg);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "";
        return;
      }
      draw();
      updateStats();
    };

    const hardRegenerate = () => {
      for (const row of state.auxRows) if (row.pool) row.pool.hardReset();
      state.poolX.hardReset();
      state.poolY.hardReset();
      regenerateAll();
    };

    // ---------- Drawing ----------

    const drawOverlay = (cell, N) => {
      if (!state.showLattice || cell < 3) return;
      const latticePath = new Path2D();
      const W = (N + 1) * cell, H = (N + 1) * cell;
      for (let g = 0; g <= N + 1; g++) {
        const p = g * cell;
        latticePath.moveTo(p, 0); latticePath.lineTo(p, H);
        latticePath.moveTo(0, p); latticePath.lineTo(W, p);
      }
      ctx.strokeStyle = "#4a4f5d";
      ctx.lineWidth = 1;
      ctx.stroke(latticePath);

      // Cell (x,y) has its bottom-left corner AT the lattice point (x,y)
      // (that's exactly the fillRect placement above: row=N-y puts the
      // cell's bottom edge at pixel (N+1-y)*cell). So corner/lattice
      // point (x,y) itself sits at pixel (x*cell, (N+1-y)*cell) -- right
      // on the grey mesh above, not offset into any cell's interior.
      // X(i,j) connects corners (i-1,j)-(i,j): same pixel_y => HORIZONTAL.
      // Y(i,j) connects corners (i,j-1)-(i,j): same pixel_x => VERTICAL.
      const edgePath = new Path2D();
      for (let x = 1; x <= N; x++) {
        for (let y = 0; y <= N; y++) {
          if (!state.xOpenArr[idx(N, x, y)]) continue;
          const py = (N + 1 - y) * cell;
          edgePath.moveTo((x - 1) * cell, py); edgePath.lineTo(x * cell, py);
        }
      }
      for (let x = 0; x <= N; x++) {
        for (let y = 1; y <= N; y++) {
          if (!state.yOpenArr[idx(N, x, y)]) continue;
          const px = x * cell;
          edgePath.moveTo(px, (N + 2 - y) * cell); edgePath.lineTo(px, (N + 1 - y) * cell);
        }
      }
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(1, Math.min(2, cell * 0.25));
      ctx.stroke(edgePath);
    };

    const drawHeatmap = () => {
      if (!state.Lg) return;
      const N = state.N;
      const cell = Math.max(1, Math.min(14, CANVAS_PX / (N + 1)));
      const W = Math.ceil((N + 1) * cell), H = Math.ceil((N + 1) * cell);
      canvas.width = W;
      canvas.height = H;
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, W, H);
      const { min, max } = state.range;
      const span = max - min;
      for (let x = 0; x <= N; x++) {
        for (let y = 0; y <= N; y++) {
          const v = state.Lg[idx(N, x, y)];
          const color = v === -Infinity ? DEAD_COLOR : heatColor(span > 0 ? (v - min) / span : 1);
          ctx.fillStyle = color;
          const col = x, row = N - y; // y increases upward
          ctx.fillRect(Math.floor(col * cell), Math.floor(row * cell), Math.ceil(cell), Math.ceil(cell));
        }
      }
      drawOverlay(cell, N);
    };

    const drawSlice = () => {
      if (!state.Lg) return;
      canvas.width = CHART_W;
      canvas.height = CHART_H;
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, CHART_W, CHART_H);

      const pts = slicePoints(state.N, state.Lg, state.slope, state.sliceC);
      const finite = pts.filter((p) => p.L > -Infinity);

      const padL = 44, padR = 16, padT = 16, padB = 34;
      const plotW = CHART_W - padL - padR, plotH = CHART_H - padT - padB;
      ctx.strokeStyle = "#2a2f3d";
      ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      if (finite.length === 0) {
        ctx.fillStyle = "#9aa1b4";
        ctx.font = "13px sans-serif";
        ctx.fillText("No reachable lattice point on this line for the current field.", padL + 10, padT + plotH / 2);
        sliceStatsEl.textContent = "";
        return;
      }

      const maxL = Math.max(...finite.map((p) => p.L));
      let wsum = 0;
      for (const p of finite) { p.w = Math.exp(p.L - maxL); wsum += p.w; }
      for (const p of finite) p.w /= wsum;

      let mean = 0;
      for (const p of finite) mean += p.w * p.y;
      let variance = 0;
      for (const p of finite) variance += p.w * (p.y - mean) * (p.y - mean);
      const std = Math.sqrt(variance);

      const yMin = Math.min(...finite.map((p) => p.y));
      const yMax = Math.max(...finite.map((p) => p.y));
      const ySpan = Math.max(1, yMax - yMin);
      const wMax = Math.max(...finite.map((p) => p.w));
      const gaussPeak = variance > 0 ? 1 / Math.sqrt(2 * Math.PI * variance) : wMax;
      const vMax = Math.max(wMax, gaussPeak) * 1.15;

      const xOf = (y) => padL + ((y - yMin) / ySpan) * plotW;
      const yOf = (w) => padT + plotH - (w / vMax) * plotH;

      // bars (the actual discrete weights, unit y-spacing so bin width = 1)
      ctx.fillStyle = "#5eb1ff";
      const barW = Math.max(1, plotW / (ySpan + 1) - 1);
      for (const p of finite) {
        const bx = xOf(p.y);
        const by = yOf(p.w);
        ctx.fillRect(bx - barW / 2, by, barW, padT + plotH - by);
      }

      // Gaussian overlay, same mean/variance, compared directly since
      // the discrete points are unit-spaced in y (bin width 1).
      if (variance > 0) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const steps = 200;
        for (let i = 0; i <= steps; i++) {
          const y = yMin + (i / steps) * ySpan;
          const g = (1 / Math.sqrt(2 * Math.PI * variance)) * Math.exp(-((y - mean) ** 2) / (2 * variance));
          const px = xOf(y), py = yOf(g);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.fillStyle = "#9aa1b4";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(yMin), padL - 4, padT + plotH + 16);
      ctx.fillText(String(yMax), padL + plotW - 16, padT + plotH + 16);
      ctx.fillText("y", padL + plotW / 2, padT + plotH + 16);

      sliceStatsEl.textContent =
        `line: x + ${state.slope}·y = ${state.sliceC}  •  ${finite.length} reachable points (of ${pts.length} on the line)  •  ` +
        `mean(y) = ${mean.toFixed(2)}  •  std(y) = ${std.toFixed(2)}`;
    };

    const draw = () => (state.view === "heatmap" ? drawHeatmap() : drawSlice());

    const fmtPct = (x) => (100 * x).toFixed(1) + "%";
    const updateStats = () => {
      if (!state.Lg) return;
      const { min, max, reachable, total } = state.range;
      statsEl.textContent =
        `grid: (N+1)×(N+1) = ${total.toLocaleString()} cells (N=${state.N})  •  ` +
        `reachable (f>0): ${fmtPct(reachable / total)}  •  log f range: [${isFinite(min) ? min.toFixed(1) : "—"}, ${isFinite(max) ? max.toFixed(1) : "—"}]`;
    };

    // ---------- Controls: X(i,j) / Y(i,j) / named rows ----------

    const xInput = el("input", { type: "text", value: state.exprX, spellcheck: "false", autocomplete: "off" });
    const previewX = el("div", { class: "math-preview" });

    const yInput = el("input", { type: "text", value: state.exprY, spellcheck: "false", autocomplete: "off" });
    const previewY = el("div", { class: "math-preview" });

    const rowsContainer = el("div");
    const globalVarsPanel = el("div");

    const renderAuxRows = () => {
      rowsContainer.innerHTML = "";
      for (const row of state.auxRows) {
        const input = el("input", { type: "text", value: row.text, spellcheck: "false", autocomplete: "off" });
        const preview = el("div", { class: "math-preview" });
        const rowErrorEl = el("p", { class: "hint", style: { color: "#ff6b6b" } }, "");
        row.previewEl = preview;
        row.errorEl = rowErrorEl;
        input.addEventListener("input", () => { row.text = input.value; rebuildAll(); });
        const removeBtn = el("button", { class: "btn", title: "Remove this row", onclick: () => {
          state.auxRows = state.auxRows.filter((r) => r !== row);
          renderAuxRows();
          rebuildAll();
        } }, "×");
        rowsContainer.appendChild(el("div", { class: "control-row" }, [
          el("div", { class: "btn-row", style: { alignItems: "center", flexWrap: "nowrap" } }, [input, removeBtn]),
          preview,
          rowErrorEl,
        ]));
      }
    };

    const addRow = (text) => {
      state.auxRowCounter++;
      state.auxRows.push({
        id: state.auxRowCounter,
        text: text || `r${state.auxRowCounter} = 1`,
        name: null, expr: null, deps: [], varNames: [],
        fn: null, latex: null, usedFallback: false, siteCount: 0,
        pool: new LatentPool(), error: null, previewEl: null, errorEl: null,
      });
    };

    const addRowBtn = el("button", { class: "btn", onclick: () => {
      addRow(null);
      renderAuxRows();
      rebuildAll();
    } }, "+ Add named row");

    /** Recompiles X, Y, and every named row from their current typed
     *  text, in dependency order, and rebuilds the single global slider
     *  panel from the union of free variables across all of them. Call
     *  this whenever expression TEXT changes (or a row is added/removed)
     *  -- not on every slider drag, which only needs regenerateAll(). */
    const rebuildAll = () => {
      errorEl.style.display = "none";
      try {
        const parsed = state.auxRows.map((row) => ({ row, def: parseDefinition(row.text) }));
        const nameCounts = {};
        for (const { def } of parsed) { if (def) nameCounts[def.name] = (nameCounts[def.name] || 0) + 1; }
        const auxNamesAll = [...new Set(parsed.filter((p) => p.def && nameCounts[p.def.name] === 1).map((p) => p.def.name))];

        for (const { row, def } of parsed) {
          if (!def) {
            row.name = null; row.fn = null;
            row.error = 'Type "name = expression", e.g. d = [0...N]';
            if (row.errorEl) row.errorEl.textContent = row.error;
            if (row.previewEl) renderMathPreview(row.previewEl, null, "");
            continue;
          }
          if (nameCounts[def.name] > 1) {
            row.name = null; row.fn = null;
            row.error = `Duplicate name "${def.name}" — already used by another row.`;
            if (row.errorEl) row.errorEl.textContent = row.error;
            if (row.previewEl) renderMathPreview(row.previewEl, null, "");
            continue;
          }
          row.name = def.name;
          row.expr = def.expr;
          try {
            const otherAuxNames = auxNamesAll.filter((n) => n !== row.name);
            const { deps, sliderVars } = analyzeExprNames(row.expr, ["N"], otherAuxNames);
            row.deps = deps;
            row.varNames = sliderVars;
            const { fn, latex, usedFallback, siteCount } = compileExpr(row.expr, row.varNames, ["N", "_L", ...deps], LATENT_TOP);
            row.fn = fn; row.latex = latex; row.usedFallback = usedFallback; row.siteCount = siteCount;
            row.error = null;
            if (row.errorEl) row.errorEl.textContent = "";
            if (row.previewEl) renderMathPreview(row.previewEl, latex, usedFallback ? FALLBACK_NOTE : "");
          } catch (err) {
            row.fn = null;
            row.error = err.message;
            if (row.errorEl) row.errorEl.textContent = row.error;
            if (row.previewEl) renderMathPreview(row.previewEl, null, "");
          }
        }

        const validRows = state.auxRows.filter((r) => r.name && r.fn);
        state.auxOrder = topoSortRows(validRows);

        const { deps: depsX, sliderVars: varNamesX } = analyzeExprNames(state.exprX, ["i", "j", "N"], auxNamesAll);
        const cx = compileExpr(state.exprX, varNamesX, ["i", "j", "N", "_L", ...depsX], LATENT_XY);
        state.fnX = cx.fn; state.depsX = depsX; state.varNamesX = varNamesX; state.siteCountX = cx.siteCount;
        renderMathPreview(previewX, cx.latex, cx.usedFallback ? FALLBACK_NOTE : "");

        const { deps: depsY, sliderVars: varNamesY } = analyzeExprNames(state.exprY, ["i", "j", "N"], auxNamesAll);
        const cy = compileExpr(state.exprY, varNamesY, ["i", "j", "N", "_L", ...depsY], LATENT_XY);
        state.fnY = cy.fn; state.depsY = depsY; state.varNamesY = varNamesY; state.siteCountY = cy.siteCount;
        renderMathPreview(previewY, cy.latex, cy.usedFallback ? FALLBACK_NOTE : "");

        // Manually-added sliders (from "+ Add slider") are pinned into the
        // panel even when nothing currently references their name -- but
        // if a named row has since claimed that same name, the row wins
        // (that name is a dependency now, not a slider) so it's dropped
        // here rather than shown as a contradictory extra slider.
        state.manualVars = state.manualVars.filter((n) => !auxNamesAll.includes(n));
        const union = new Set([...varNamesX, ...varNamesY, ...state.manualVars]);
        for (const row of validRows) for (const n of row.varNames) union.add(n);
        syncVarSliders(globalVarsPanel, state.vars, [...union].sort(), regenerateAll, {
          removable: new Set(state.manualVars),
          onRemove: (name) => {
            state.manualVars = state.manualVars.filter((n) => n !== name);
            rebuildAll();
          },
        });
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "";
        return;
      }
      regenerateAll();
    };

    xInput.addEventListener("input", () => { state.exprX = xInput.value; rebuildAll(); });
    yInput.addEventListener("input", () => { state.exprY = yInput.value; rebuildAll(); });

    const presetTrivial = el("button", { class: "btn", onclick: () => {
      state.exprX = "1"; xInput.value = "1";
      state.exprY = "1"; yInput.value = "1";
      rebuildAll();
    } }, "Preset: all edges open");
    const presetClassic = el("button", { class: "btn", onclick: () => {
      state.exprX = "1"; xInput.value = "1";
      state.exprY = "{mod(i,d[j])=0:1,0}"; yInput.value = state.exprY;
      if (state.auxRows.length === 0) addRow(DEFAULT_D_TEXT);
      else state.auxRows[0].text = DEFAULT_D_TEXT;
      renderAuxRows();
      rebuildAll();
    } }, "Preset: d∈{2,3}");
    const presetBernoulliX = el("button", { class: "btn", onclick: () => {
      state.exprX = "{random()<p:1,0}"; xInput.value = state.exprX;
      rebuildAll();
    } }, "Preset: Bernoulli(p) X");

    // ---------- Controls: grid size + regenerate ----------

    const nInput = el("input", { type: "range", min: "20", max: "250", value: String(state.N) });
    const nVal = el("span", { class: "val" }, String(state.N));
    nInput.addEventListener("input", () => { nVal.textContent = nInput.value; });
    nInput.addEventListener("change", () => {
      state.N = parseInt(nInput.value, 10);
      state.sliceC = Math.min(state.sliceC, 2 * state.N);
      cInput.max = String(2 * state.N);
      cInput.value = String(state.sliceC);
      cVal.textContent = String(state.sliceC);
      // No recompile needed: N is just a bound argument every compiled
      // function already takes, and LatentPool sites are lazily keyed
      // by whatever index is actually read -- a bigger grid just reads
      // more (fresh) indices, it doesn't invalidate existing ones.
      regenerateAll();
    });

    const regenBtn = el("button", { class: "btn primary", onclick: hardRegenerate }, "Regenerate randomness");
    const latticeCheck = el("input", { type: "checkbox", checked: "checked" });
    latticeCheck.addEventListener("change", () => { state.showLattice = latticeCheck.checked; draw(); });

    // ---------- Controls: view ----------

    const heatmapBtn = el("button", { class: "btn active", onclick: () => setView("heatmap") }, "Heatmap (log f)");
    const sliceBtn = el("button", { class: "btn", onclick: () => setView("slice") }, "Slice + Gaussian fit");
    const sliceControls = el("div", { style: { display: "none" } });
    const setView = (v) => {
      state.view = v;
      heatmapBtn.classList.toggle("active", v === "heatmap");
      sliceBtn.classList.toggle("active", v === "slice");
      sliceControls.style.display = v === "slice" ? "" : "none";
      statsEl.style.display = v === "heatmap" ? "" : "none";
      sliceStatsEl.style.display = v === "slice" ? "" : "none";
      draw();
    };

    const slopeInput = el("input", { type: "number", step: "0.01", value: String(state.slope), style: { width: "90px" } });
    slopeInput.addEventListener("change", () => { state.slope = parseFloat(slopeInput.value) || 0; draw(); });
    const cInput = el("input", { type: "range", min: "0", max: String(2 * state.N), value: String(state.sliceC) });
    const cVal = el("span", { class: "val" }, String(state.sliceC));
    cInput.addEventListener("input", () => {
      state.sliceC = parseFloat(cInput.value);
      cVal.textContent = String(state.sliceC);
      draw();
    });
    sliceControls.appendChild(el("div", { class: "control-row" }, [
      el("label", {}, "Line: x + slope·y = c"),
      el("div", { class: "btn-row", style: { alignItems: "center" } }, ["slope =", slopeInput]),
      el("div", { class: "control-row", style: { marginTop: "8px" } }, [
        el("label", {}, ["c", cVal]),
        cInput,
      ]),
    ]));

    // ---------- Controls: manually-added sliders ----------

    /** Picks a short, currently-unused name for a brand new slider --
     *  single letters first (skipping math/const names and anything
     *  already a named row, an existing slider, or bound to i/j/N),
     *  then v1, v2, ... once those run out. */
    const nextFreeSliderName = () => {
      const auxNamesNow = state.auxRows.filter((r) => r.name).map((r) => r.name);
      const reserved = reservedNamesFor(["i", "j", "N"], auxNamesNow);
      const used = new Set([...reserved, ...Object.keys(state.vars), ...state.manualVars]);
      for (const c of "abcqrstuvwklmnfghoz") {
        if (!used.has(c)) return c;
      }
      let k = 1;
      while (used.has(`v${k}`)) k++;
      return `v${k}`;
    };

    const addSliderBtn = el("button", { class: "btn", onclick: () => {
      state.manualVars.push(nextFreeSliderName());
      rebuildAll();
    } }, "+ Add slider");

    // ---------- Layout ----------

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [
        el("label", {}, "X(i,j) ="),
        xInput, previewX,
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, "Y(i,j) ="),
        yInput, previewY,
      ]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "Named rows — type \"name = expression\" (e.g. d = [0...N], or reference another row's name anywhere in X, Y, or another row)"),
        rowsContainer,
        el("div", { class: "btn-row" }, [addRowBtn]),
      ]),
      errorEl,
      el("div", { class: "btn-row", style: { marginTop: "4px" } }, [presetTrivial, presetClassic, presetBernoulliX]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [el("label", {}, ["Grid extent N", nVal]), nInput]),
      el("div", { class: "btn-row" }, [regenBtn]),
      el("div", { class: "control-row" }, [
        el("label", { class: "checkbox-row" }, [latticeCheck, "show lattice + open edges (heatmap view, black = open, hidden below ~3px cells)"]),
      ]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "Sliders (global — shared by name across X, Y, and every named row)"),
        globalVarsPanel,
        el("div", { class: "btn-row" }, [addSliderBtn]),
      ]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "View"),
        el("div", { class: "btn-row" }, [heatmapBtn, sliceBtn]),
      ]),
      sliceControls,
      el("div", { class: "control-divider" }),
      statsEl,
      sliceStatsEl,
      el("p", { class: "hint" }, "i, j are bound to the cell coordinates; N is the grid extent (usable anywhere, e.g. [0...N]). Type naturally: mod(a,b), a=b (equality), a<b, {cond : a, b} (Desmos-style piecewise, b is \"otherwise\"), [a...b] (integer range), [expr for v1=list1, v2=list2] (list comprehension, as many loop variables as you like), and discretedist(v,w).random() (weighted random pick) all work — as does referencing any named row's value by name, indexed (d[j]) if it's a list. Any other letter becomes a slider, global and shared by name (range −5…5 by default, editable, with a typeable value box), so typing p into two different boxes gives them the exact same slider. Every random()/randint/.random() gets its own persistent source of randomness, fixed until you click \"Regenerate randomness\" — so e.g. dragging p in {random()<p:1,0} only ever turns edges on as p rises, never reshuffles the ones already on. Recomputes live as you type."),
    ]);

    sliceStatsEl.style.display = "none";
    addRow(DEFAULT_D_TEXT);
    renderAuxRows();
    rebuildAll();

    const aboutBlock = el("div", { class: "sim-canvas-wrap", style: { marginTop: "18px", maxWidth: "820px", lineHeight: "1.6" } }, [
      el("h3", { style: { fontSize: "14px", margin: "0 0 8px" } }, "About this model"),
      el("p", { class: "hint" },
        "f(x,y) counts weighted lattice paths to the origin through a field of open/closed edges: X(i,j) gates the edge arriving at (i,j) from the left (from (i-1,j)), Y(i,j) gates the edge arriving from below (from (i,j-1)) — any finite, nonzero value counts as \"open\", and the heatmap's overlay draws exactly these open edges in black over a thin grey lattice. Named rows like d[j] are values computed once (typically a comprehension over j, e.g. a random pick per column via discretedist([2,3],[1-p,p]).random() reproduces \"d_j ∈ {2,3} with P(d_j=3)=p\"), then referenced from X and/or Y like any Desmos variable, so with the default Y(i,j) = {mod(i,d[j])=0 : 1, 0}, a path can only step upward out of column i at the rows j where d_j divides i."),
      el("p", { class: "hint" },
        "Every independent random() / randint(a,b) / discretedist(v,w).random() anywhere in a formula draws from its own persistent Uniform(0,1) field, one value per index it's actually evaluated at (a grid cell for X/Y, an iteration of a comprehension, or just once for a top-level scalar), generated lazily and then held fixed across ordinary recomputes (typing, slider drags, and grid-size changes only ever add newly-needed values, never reshuffle existing ones). This is the standard \"coupling from a single uniform\" construction: e.g. X(i,j) = {random()<p : 1, 0} compares a FIXED per-cell u against the CURRENT p, so as you drag p up, cells only ever cross from closed to open (u<p becomes true) and never back, instead of the whole field reshuffling independently on every recompute."),
      el("p", { class: "hint" },
        "When X=Y=1 everywhere (\"all edges open\"), f(x,y) reduces to the ordinary count of monotone lattice paths from the origin to (x,y), which is the binomial coefficient C(x+y, x) — see DLMF §26.3 and the \"Lattice path\" reference below. Slicing along the anti-diagonal x+y=n and viewing f(x, n-x) as a function of x then gives exactly (up to the factor 2^n) the row of Pascal's triangle, i.e. a Binomial(n, 1/2) shape; the de Moivre–Laplace theorem is the classical statement that this shape converges, after centering at the mean and scaling by √n, to a Gaussian as n→∞. That's the slope=1 case reproduced by the \"all edges open\" preset above."),
      el("p", { class: "hint" },
        "This is a heuristic, not a theorem: once Y is periodic with period d_j drawn i.i.d. from a distribution (say period 2 with probability 1−p and period 3 with probability p), a path effectively needs roughly (2 + p) upward steps' worth of \"row-crossing attempts\" per successful upward step, on average, since a row only lets a path through when the period divides the path's current x-coordinate. That suggests the anti-diagonal slope that keeps the path count balanced between horizontal and vertical steps — and hence plausibly closest to a symmetric, Gaussian-shaped slice — shifts from x+y=c (slope 1) toward x+(2+p)y=c (slope 2+p) as p increases from 0 to 1. Use the slope input in the slice view to search around that estimate and see how the empirical mean/std (and how Gaussian the bars actually look) respond; nothing here guarantees convergence to a Gaussian for the general periodic construction the way de Moivre–Laplace does for the trivial one."),
      el("ol", { style: { fontSize: "12px", color: "var(--text-dim)", paddingLeft: "18px" } }, [
        el("li", {}, [
          "De Moivre, A. (1738) / Laplace, P.-S. (1812). ",
          el("a", { href: "https://en.wikipedia.org/wiki/De_Moivre%E2%80%93Laplace_theorem", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "De Moivre–Laplace theorem"),
          ". See also Feller, W. An Introduction to Probability Theory and Its Applications, Vol. 1, 3rd ed., Ch. VII.",
        ]),
        el("li", {}, [
          "NIST Digital Library of Mathematical Functions, §26.3 ",
          el("a", { href: "https://dlmf.nist.gov/26.3", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Lattice Paths: Binomial Coefficients"),
          ". See also ",
          el("a", { href: "https://en.wikipedia.org/wiki/Lattice_path", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Lattice path"),
          " (Wikipedia).",
        ]),
        el("li", {}, [
          "The coupling-from-a-single-uniform trick used for the sliders above is a standard variance-reduction / monotone-coupling device; see e.g. Propp, J. & Wilson, D. (1996). ",
          el("a", { href: "https://www.sciencedirect.com/science/article/pii/S0196677496900341", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Exact sampling with coupled Markov chains and applications to statistical mechanics"),
          ". Random Structures & Algorithms, 9(1-2), 223–252, for the broader technique this borrows its spirit from (monotone coupling, not the exact-sampling algorithm itself).",
        ]),
      ]),
    ]);

    const wrapper = el("div", {}, [
      el("div", { class: "sim-layout" }, [
        el("div", { class: "sim-canvas-wrap" }, canvas),
        controls,
      ]),
      aboutBlock,
    ]);
    container.appendChild(wrapper);

    return {
      destroy() {},
    };
  },
};
