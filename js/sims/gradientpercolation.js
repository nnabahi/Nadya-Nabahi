/* =========================================================
   Gradient percolation.

   Each cell (i, j) of an L x L grid is filled independently at
   random with probability f(x, y) (evaluated at the cell center,
   clipped to >= 0, normalized by its max over the grid). Where
   that probability crosses the site-percolation threshold, a
   ragged interface forms between the largest filled cluster and
   the largest empty cluster. This is the model Sapoval, Rosso and
   Gouyet introduced in 1985 to describe the ragged boundary left
   by inter-diffusing metals: because occupation probability
   varies smoothly across the grid, the interface stays pinned
   near the row/curve where that probability crosses p_c ≈ 0.592746
   (site percolation, square lattice), and over a wide range of
   scales it looks statistically fractal, with a measured/theoretical
   dimension close to 7/4 ≈ 1.75.

   References:
   - Gouyet, J.-F. & Rosso, M. (2005). "Diffusion fronts and
     gradient percolation: A survey." Physica A, 357(1), 86–96.
   - Nolin, P. "SLE(6) and the geometry of diffusion fronts."
     arXiv:0912.3770.
   - Ziff, R. M. (2011). "Results for a critical threshold for 2d
     percolation I." arXiv:1103.3243.

   Adapted from a standalone prototype the user supplied, ported
   onto this site's shared CanvasGrid/control-panel conventions.
   ========================================================= */

import { CanvasGrid } from "../lib/grid.js";
import { mixHex, el } from "../lib/utils.js";
import { compileExpr, freeVariables, RESERVED_NAMES } from "../lib/mathexpr.js";
import { renderMathPreview, syncVarSliders } from "../lib/mathinput.js";

const CANVAS_PX = 560;
const COLORS = {
  empty: "#232730",
  emptyOther: "#2c313b",
  filled: "#cf7238",
  filledOther: "#8a5a3c",
  boundary: "#ffd166",
  boundaryHalo: "#0f1115",
};

function computeField(fn, L, varArgs) {
  const p = new Float64Array(L * L);
  let maxVal = 0, anyNegative = false, anyBad = false;
  for (let j = 0; j < L; j++) {
    const yc = (j + 0.5) / L;
    for (let i = 0; i < L; i++) {
      const xc = (i + 0.5) / L;
      let v;
      try { v = fn(xc, yc, ...varArgs); } catch (err) { v = NaN; }
      if (typeof v !== "number" || !isFinite(v)) { anyBad = true; v = 0; }
      if (v < 0) { anyNegative = true; v = 0; }
      p[j * L + i] = v;
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal > 0) for (let k = 0; k < p.length; k++) p[k] /= maxVal;
  return { p, maxVal, anyNegative, anyBad };
}

function drawSample(p) {
  const filled = new Uint8Array(p.length);
  for (let k = 0; k < p.length; k++) filled[k] = Math.random() < p[k] ? 1 : 0;
  return filled;
}

function labelComponents(stateArr, L) {
  const label = new Int32Array(L * L).fill(-1);
  const sizes = [];
  const stack = new Int32Array(L * L);
  let nextLabel = 0;
  for (let start = 0; start < L * L; start++) {
    if (stateArr[start] !== 1 || label[start] !== -1) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = nextLabel;
    let size = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      size++;
      const i = idx % L, j = (idx / L) | 0;
      if (i > 0) { const n = idx - 1; if (stateArr[n] === 1 && label[n] === -1) { label[n] = nextLabel; stack[sp++] = n; } }
      if (i < L - 1) { const n = idx + 1; if (stateArr[n] === 1 && label[n] === -1) { label[n] = nextLabel; stack[sp++] = n; } }
      if (j > 0) { const n = idx - L; if (stateArr[n] === 1 && label[n] === -1) { label[n] = nextLabel; stack[sp++] = n; } }
      if (j < L - 1) { const n = idx + L; if (stateArr[n] === 1 && label[n] === -1) { label[n] = nextLabel; stack[sp++] = n; } }
    }
    sizes.push(size);
    nextLabel++;
  }
  return { label, sizes };
}

function analyze(filled, L) {
  const filledComp = labelComponents(filled, L);
  const empty = new Uint8Array(filled.length);
  for (let k = 0; k < filled.length; k++) empty[k] = filled[k] ? 0 : 1;
  const emptyComp = labelComponents(empty, L);

  let mainFilledId = -1, mainFilledSize = 0;
  for (let a = 0; a < filledComp.sizes.length; a++) if (filledComp.sizes[a] > mainFilledSize) { mainFilledSize = filledComp.sizes[a]; mainFilledId = a; }
  let mainEmptyId = -1, mainEmptySize = 0;
  for (let b = 0; b < emptyComp.sizes.length; b++) if (emptyComp.sizes[b] > mainEmptySize) { mainEmptySize = emptyComp.sizes[b]; mainEmptyId = b; }

  return {
    filledLabel: filledComp.label, mainFilledId, mainFilledSize,
    emptyLabel: emptyComp.label, mainEmptyId, mainEmptySize,
  };
}

function boundaryEdges(filled, L, an) {
  const edges = [];
  if (an.mainFilledId === -1 || an.mainEmptyId === -1) return edges;
  for (let j = 0; j < L; j++) {
    for (let i = 0; i < L; i++) {
      const idx = j * L + i;
      if (filled[idx] !== 1 || an.filledLabel[idx] !== an.mainFilledId) continue;
      if (i > 0) { const n = idx - 1; if (filled[n] !== 1 && an.emptyLabel[n] === an.mainEmptyId) edges.push([i, j, "L"]); }
      if (i < L - 1) { const n = idx + 1; if (filled[n] !== 1 && an.emptyLabel[n] === an.mainEmptyId) edges.push([i, j, "R"]); }
      if (j > 0) { const n = idx - L; if (filled[n] !== 1 && an.emptyLabel[n] === an.mainEmptyId) edges.push([i, j, "D"]); }
      if (j < L - 1) { const n = idx + L; if (filled[n] !== 1 && an.emptyLabel[n] === an.mainEmptyId) edges.push([i, j, "U"]); }
    }
  }
  return edges;
}

/** Every edge of the largest filled cluster against ANY empty cell (not
 *  just the largest empty cluster). Unlike boundaryEdges() above, this is
 *  always a closed ring around the main blob, since it doesn't care which
 *  empty component sits on the other side. */
function perimeterEdges(filled, L, an) {
  const edges = [];
  if (an.mainFilledId === -1) return edges;
  for (let j = 0; j < L; j++) {
    for (let i = 0; i < L; i++) {
      const idx = j * L + i;
      if (filled[idx] !== 1 || an.filledLabel[idx] !== an.mainFilledId) continue;
      if (i > 0) { const n = idx - 1; if (filled[n] !== 1) edges.push([i, j, "L"]); }
      if (i < L - 1) { const n = idx + 1; if (filled[n] !== 1) edges.push([i, j, "R"]); }
      if (j > 0) { const n = idx - L; if (filled[n] !== 1) edges.push([i, j, "D"]); }
      if (j < L - 1) { const n = idx + L; if (filled[n] !== 1) edges.push([i, j, "U"]); }
    }
  }
  return edges;
}

export default {
  id: "gradientpercolation",
  name: "Gradient Percolation",
  category: "Growth & percolation",
  description:
    "Each cell of an L×L grid is filled at random with a probability f(x, y) you choose. Where that probability crosses the percolation threshold, a ragged fractal interface forms between the two largest clusters.",

  mount(container) {
    const state = {
      L: 120,
      fnExpr: "y",
      fn: null,
      varNames: [],
      vars: {},
      p: null,
      filled: null,
      analysis: null,
      edges: [],
      edgesInterface: [],
      edgesPerimeter: [],
      boundaryMode: "interface",
      viewMode: "result",
      highlightClusters: true,
      showBoundary: true,
    };

    const canvas = el("canvas");
    const grid = new CanvasGrid(canvas, state.L, state.L, 4);

    const errorEl = el("p", { class: "hint", style: { color: "#ff6b6b", display: "none" } }, "");
    const normNoteEl = el("span", { class: "val" }, "");
    const statsEl = el("p", { class: "hint" }, "");
    const previewEl = el("div", { class: "math-preview" });
    const varsPanel = el("div");

    const applyFieldResult = (res) => {
      state.p = res.p;
      normNoteEl.textContent = res.maxVal > 0 ? `normalized by max f = ${res.maxVal.toFixed(3)}` : "f ≤ 0 everywhere";
      if (res.anyBad) { errorEl.textContent = "f produced a non-finite value at some points; those cells were treated as 0."; errorEl.style.display = ""; }
      else if (res.anyNegative) { errorEl.textContent = "f went negative at some points; those cells were clipped to 0 before normalizing."; errorEl.style.display = ""; }
    };

    // Re-evaluate f over the grid with the CURRENT compiled fn and CURRENT
    // slider values -- used when only a slider moves or L changes, so we
    // don't have to reparse/recompile the expression every frame.
    const recomputeField = () => {
      errorEl.style.display = "none";
      try {
        const varArgs = state.varNames.map((n) => state.vars[n].value);
        applyFieldResult(computeField(state.fn, state.L, varArgs));
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "";
      }
      resample();
    };

    // Reparse the expression text (new function body, possibly a new set
    // of free variables -> resync the slider panel), then evaluate it.
    const rebuildField = () => {
      errorEl.style.display = "none";
      try {
        const varNames = freeVariables(state.fnExpr, RESERVED_NAMES);
        const { fn, latex, usedFallback } = compileExpr(state.fnExpr, varNames);
        state.fn = fn;
        const varsChanged = varNames.length !== state.varNames.length || varNames.some((n, i) => n !== state.varNames[i]);
        state.varNames = varNames;
        if (varsChanged) syncVarSliders(varsPanel, state.vars, state.varNames, recomputeField);
        renderMathPreview(previewEl, latex, usedFallback ? "Advanced expression (comparisons/ternaries) — live preview unavailable, and ^ here means bitwise XOR, not power; use ** for exponents." : "");
        const varArgs = state.varNames.map((n) => state.vars[n].value);
        applyFieldResult(computeField(state.fn, state.L, varArgs));
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "";
        state.p = new Float64Array(state.L * state.L);
        normNoteEl.textContent = "";
      }
      resample();
    };

    const updateActiveEdges = () => {
      state.edges = state.boundaryMode === "perimeter" ? state.edgesPerimeter : state.edgesInterface;
    };

    const resample = () => {
      state.filled = drawSample(state.p);
      state.analysis = analyze(state.filled, state.L);
      state.edgesInterface = boundaryEdges(state.filled, state.L, state.analysis);
      state.edgesPerimeter = perimeterEdges(state.filled, state.L, state.analysis);
      updateActiveEdges();
      draw();
      updateStats();
    };

    const draw = () => {
      const L = state.L;
      const cellSize = Math.max(1, Math.min(20, CANVAS_PX / L));
      grid.resize(L, L, cellSize);

      if (state.viewMode === "heatmap") {
        for (let j = 0; j < L; j++) {
          for (let i = 0; i < L; i++) {
            const v = state.p[j * L + i];
            grid.fillCell(i, L - 1 - j, mixHex(COLORS.empty, COLORS.filled, v));
          }
        }
        return;
      }

      const an = state.analysis;
      for (let j = 0; j < L; j++) {
        for (let i = 0; i < L; i++) {
          const idx = j * L + i;
          const isFilled = state.filled[idx] === 1;
          let color;
          if (isFilled) color = (!state.highlightClusters || an.filledLabel[idx] === an.mainFilledId) ? COLORS.filled : COLORS.filledOther;
          else color = (!state.highlightClusters || an.emptyLabel[idx] === an.mainEmptyId) ? COLORS.empty : COLORS.emptyOther;
          grid.fillCell(i, L - 1 - j, color);
        }
      }
      if (state.showBoundary && state.edges.length) drawBoundary(cellSize, L);
    };

    const drawBoundary = (cell, L) => {
      const path = new Path2D();
      for (const [i, j, dir] of state.edges) {
        const x0 = i * cell, y0 = (L - 1 - j) * cell;
        if (dir === "L") { path.moveTo(x0, y0); path.lineTo(x0, y0 + cell); }
        else if (dir === "R") { path.moveTo(x0 + cell, y0); path.lineTo(x0 + cell, y0 + cell); }
        else if (dir === "U") { path.moveTo(x0, y0); path.lineTo(x0 + cell, y0); }
        else { path.moveTo(x0, y0 + cell); path.lineTo(x0 + cell, y0 + cell); }
      }
      grid.ctx.lineCap = "round";
      grid.ctx.strokeStyle = COLORS.boundaryHalo;
      grid.ctx.lineWidth = Math.max(2.5, cell * 0.5);
      grid.ctx.stroke(path);
      grid.ctx.strokeStyle = COLORS.boundary;
      grid.ctx.lineWidth = Math.max(1.2, cell * 0.22);
      grid.ctx.stroke(path);
    };

    const fmtPct = (x) => (100 * x).toFixed(1) + "%";
    const updateStats = () => {
      const total = state.L * state.L;
      let filledCount = 0;
      for (let k = 0; k < state.filled.length; k++) filledCount += state.filled[k];
      const emptyCount = total - filledCount;
      const an = state.analysis;
      const boundaryLabel = state.boundaryMode === "perimeter" ? "cluster perimeter" : "interface";
      statsEl.textContent =
        `Cells: ${total.toLocaleString()} (L=${state.L})  •  filled: ${fmtPct(filledCount / total)}  •  ` +
        `main filled cluster: ${an.mainFilledSize.toLocaleString()}${filledCount ? ` (${fmtPct(an.mainFilledSize / filledCount)})` : ""}  •  ` +
        `main empty cluster: ${an.mainEmptySize.toLocaleString()}${emptyCount ? ` (${fmtPct(an.mainEmptySize / emptyCount)})` : ""}  •  ` +
        `${boundaryLabel}: ${state.edges.length.toLocaleString()} edges`;
    };

    // ---------- Controls ----------
    const fnInput = el("input", { type: "text", value: state.fnExpr, spellcheck: "false", autocomplete: "off" });
    fnInput.addEventListener("input", () => { state.fnExpr = fnInput.value; rebuildField(); });

    const presetDefs = [
      ["y", "y"], ["x", "x"], ["x*y", "x·y"], ["1-y", "1−y"],
      ["sin(pi x)sin(pi y)", "dome"], ["sqrt(x^2+y^2)/sqrt(2)", "radial"],
      ["sin(a pi x)sin(b pi y)", "waves (a,b)"],
    ];
    const presetRow = el("div", { class: "btn-row", style: { marginTop: "8px" } },
      presetDefs.map(([expr, label]) => el("button", {
        class: "btn",
        onclick: () => { fnInput.value = expr; state.fnExpr = expr; rebuildField(); },
      }, label))
    );

    const lInput = el("input", { type: "range", min: "10", max: "240", value: state.L });
    const lVal = el("span", { class: "val" }, String(state.L));
    lInput.addEventListener("input", () => { lVal.textContent = lInput.value; });
    lInput.addEventListener("change", () => { state.L = parseInt(lInput.value, 10); recomputeField(); });

    const regenBtn = el("button", { class: "btn primary", onclick: resample }, "Regenerate sample");

    const resultViewBtn = el("button", { class: "btn active", onclick: () => setView("result") }, "Percolation result");
    const heatmapViewBtn = el("button", { class: "btn", onclick: () => setView("heatmap") }, "Probability field f");
    const setView = (mode) => {
      state.viewMode = mode;
      resultViewBtn.classList.toggle("active", mode === "result");
      heatmapViewBtn.classList.toggle("active", mode === "heatmap");
      draw();
    };

    const clustersCheck = el("input", { type: "checkbox", checked: "checked" });
    clustersCheck.addEventListener("change", () => { state.highlightClusters = clustersCheck.checked; draw(); });
    const boundaryCheck = el("input", { type: "checkbox", checked: "checked" });
    boundaryCheck.addEventListener("change", () => { state.showBoundary = boundaryCheck.checked; draw(); });

    const interfaceModeBtn = el("button", { class: "btn active", onclick: () => setBoundaryMode("interface") }, "Interface (2 largest)");
    const perimeterModeBtn = el("button", { class: "btn", onclick: () => setBoundaryMode("perimeter") }, "Full perimeter");
    const setBoundaryMode = (mode) => {
      state.boundaryMode = mode;
      interfaceModeBtn.classList.toggle("active", mode === "interface");
      perimeterModeBtn.classList.toggle("active", mode === "perimeter");
      updateActiveEdges();
      draw();
      updateStats();
    };

    const swatchKey = el("div", { class: "swatch-row" }, [
      el("span", {}, [el("i", { style: { background: COLORS.filled } }), "main filled"]),
      el("span", {}, [el("i", { style: { background: COLORS.filledOther } }), "other filled"]),
      el("span", {}, [el("i", { style: { background: COLORS.empty } }), "main empty"]),
      el("span", {}, [el("i", { style: { background: COLORS.emptyOther } }), "other empty"]),
      el("span", {}, [el("i", { style: { background: COLORS.boundary } }), "interface"]),
    ]);

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [
        el("label", {}, ["f(x, y) =", normNoteEl]),
        fnInput,
        previewEl,
        presetRow,
        errorEl,
      ]),
      varsPanel,
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [el("label", {}, ["Grid size L", lVal]), lInput]),
      el("div", { class: "btn-row" }, [regenBtn]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "View"),
        el("div", { class: "btn-row" }, [resultViewBtn, heatmapViewBtn]),
      ]),
      el("div", { class: "control-row" }, [
        el("label", { class: "checkbox-row" }, [clustersCheck, "highlight main clusters"]),
        el("label", { class: "checkbox-row" }, [boundaryCheck, "highlight boundary"]),
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, "Boundary type"),
        el("div", { class: "btn-row" }, [interfaceModeBtn, perimeterModeBtn]),
      ]),
      swatchKey,
      el("div", { class: "control-divider" }),
      statsEl,
      el("p", { class: "hint" }, "x runs left→right, y runs bottom→top. f is sampled at each cell's center, clipped to 0 if negative, and normalized by its max over the grid so it's a valid probability. Type naturally — x^2, 2x, 2(x+1)(y-1), sin(pi*x) all work — and any other letter you use (a, k, radius, ...) gets its own slider below, initial range −5…5, editable."),
    ]);

    rebuildField();

    const aboutBlock = el("div", { class: "sim-canvas-wrap", style: { marginTop: "18px", maxWidth: "820px", lineHeight: "1.6" } }, [
      el("h3", { style: { fontSize: "14px", margin: "0 0 8px" } }, "About this model"),
      el("p", { class: "hint" },
        "Clusters are found with 4-connectivity (cells sharing an edge, not a corner). By default the gold line is the \"Interface\" — specifically the set of edges between the largest filled cluster and the largest empty cluster, not every filled/unfilled boundary in the grid. Wherever the blob's true edge touches a smaller, disconnected empty pocket instead of the one big empty region — common near the percolation threshold, where the front has real pinches and isolated fjords — no edge is drawn there, so this line is often ragged with genuine gaps rather than a closed ring. Switch \"Boundary type\" to \"Full perimeter\" for a view that instead traces every edge of the largest filled cluster against any empty cell, regardless of which empty component it belongs to — that one is always a closed ring, useful for just seeing where the main blob ends."),
      el("p", { class: "hint" },
        "This is the model Sapoval, Rosso and Gouyet introduced in 1985 to describe the ragged boundary left by inter-diffusing metals: because occupation probability varies smoothly across the grid, the interface stays pinned near the region where that probability crosses the site-percolation threshold p_c ≈ 0.592746 for the square lattice, and over a wide range of scales it looks statistically fractal, with a measured/theoretical dimension close to 7/4 ≈ 1.75. With the default f(x,y) = y and a large L, you should see exactly this: a self-affine, roughly horizontal ragged line hugging the row where the fill probability is near p_c."),
      el("p", { class: "hint" },
        "This front is not itself an SLE(6) curve, despite sharing SLE(6)'s dimension 7/4: Nolin (2008) shows that for the linear-gradient strip, any subsequential scaling limit of the front's law is singular with respect to SLE(6) — the steady gradient breaks the exact conformal symmetry that critical (constant-p) percolation's interface has. It also isn't a canonically directed curve with a fixed left/right endpoint the way a chordal SLE trace is; that requires also fixing boundary conditions on the left and right edges of the domain (as in the classical percolation exploration path), which this model — like Nolin's — doesn't impose. Here the front just spans the grid horizontally, perpendicular to the gradient direction."),
      el("ol", { style: { fontSize: "12px", color: "var(--text-dim)", paddingLeft: "18px" } }, [
        el("li", {}, [
          "Gouyet, J.-F. & Rosso, M. (2005). ",
          el("a", { href: "https://ideas.repec.org/a/eee/phsmap/v357y2005i1p86-96.html", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Diffusion fronts and gradient percolation: A survey"),
          ". Physica A, 357(1), 86–96.",
        ]),
        el("li", {}, [
          "Nolin, P. (2008). ",
          el("a", { href: "https://arxiv.org/pdf/math/0610682", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Critical exponents of planar gradient percolation"),
          ". Annals of Probability, 36(5), 1748–1776. arXiv:math/0610682. (Also see his ",
          el("a", { href: "https://static.ias.edu/pcmi/2007/Nolin.pdf", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "PCMI lecture notes"),
          " for the singular-w.r.t.-SLE(6) statement quoted above.)",
        ]),
        el("li", {}, [
          "Ziff, R. M. (2011). ",
          el("a", { href: "https://arxiv.org/pdf/1103.3243", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Results for a critical threshold… for 2d percolation I"),
          ". arXiv:1103.3243.",
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
