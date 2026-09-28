/* =========================================================
   Random Sequential Tile Packing.

   S is a domain and T is a "tile" shape, both typed Desmos-style as
   set-builder PREDICATES over (x,y) -- e.g. S = "sqrt(x^2+y^2)<=1" for
   the closed unit disk, or T = "max(abs(x),abs(y))<=1" for the closed
   unit square. T is understood to be centered at the origin; we take
   the closure of both S and T (a "<=" predicate already includes its
   own boundary, which is exactly that).

   rT + p means: scale T by r >= 0 through the origin, then translate
   so the result is centered at p -- i.e. rT + p = { r*t + p : t in T }.

   f is any nonnegative function with finite integral over S (default
   1, uniform); C_n is drawn from the probability measure proportional
   to f restricted to S.

   The packing itself is a sequential growth process:
     R_1 = sup{ r >= 0 : rT + C_1 subset S },  D_1 = R_1 T + C_1.
     K_n = D_1 union ... union D_n.
     R_{n+1} = sup{ r >= 0 : rT + C_{n+1} subset S \ K_n }
             ( = 0 if C_{n+1} already lands in K_n ),
     D_{n+1} = R_{n+1} T + C_{n+1}.
   In words: drop a random point, grow the biggest copy of T centered
   there that avoids leaving S or overlapping anything already placed,
   freeze it, repeat. With T = S = a disk and f uniform this is exactly
   the classic random Apollonian circle-packing construction [2]; here
   T and S are each arbitrary typed shapes, and R_n's growth-until-
   blocked rule is the same idea as random sequential adsorption [1].
   C_n is still drawn i.i.d. from f on ALL of S at every step (not from
   S \ K_{n-1}), so plenty of draws for large n land inside an already-
   placed tile and simply contribute R_n = 0 -- that's expected, not a
   bug, and is exactly why "number of attempts" (this sim's slider N)
   and "number of tiles actually placed" are different numbers.

   NUMERICAL METHOD (there's no closed form for R_n against arbitrary
   S, T, and a union of previously-placed tiles):
     - T's own boundary is precomputed ONCE (whenever T's formula or
       sliders change) as a radial function rho_T(theta) sampled at M
       equally-spaced angles: for each direction, binary-search along
       the ray from the origin for the last r at which T's predicate is
       still true. This assumes T is star-shaped about the origin (true
       for any convex T containing 0, and for plenty of non-convex T's
       too) -- growth is only well-defined/monotonic under that
       assumption, so a pathological T will just give a wrong-looking
       (but not crashing) result.
     - For a candidate point C_n, the same M boundary directions --
       scaled by a trial r and shifted to C_n -- are tested: every one
       of those M points must satisfy S's predicate AND fail every
       existing tile's predicate (evaluated in that tile's own local
       coordinates, (x-C_i)/R_i, since D_i = R_i T + C_i). Because a
       growing star-shaped region's boundary is the first place it can
       meet an obstacle, binary-searching r for the largest value where
       all M points still pass gives R_n. This is an M-point polygon
       APPROXIMATION of the true boundary, so very fine concave detail
       in T narrower than the angular spacing 2*pi/M can be missed --
       a genuine numerical limitation, not just a rendering shortcut.
     - Each existing tile keeps a precomputed bounding "reach" (its own
       R_i times T's max radial extent) so a candidate boundary point
       that's provably too far away skips the (more expensive) exact
       predicate test entirely.
     - C_n itself is drawn by discretizing S into a grid, evaluating f
       at each in-S cell, and building a cumulative distribution over
       the (f * cell-area) weights -- i.e. inverse-transform sampling
       [3] from a piecewise-constant approximation of f/integral_S(f).
       This is what "compute f's integral and normalize" means in
       practice: dividing by the running total IS the normalization,
       so f never needs to be typed as an already-normalized density.
     - Every random draw (which grid cell, where inside it, for attempt
       n) comes from its own persistent, lazily-filled source of
       Uniform(0,1) values (see js/lib/mathexpr.js's LatentPool), keyed
       by the attempt index n -- so dragging N only ever ADDS attempts
       (attempts 1..N stay exactly the same tiles), and only editing a
       formula, a slider's value, or the view extent actually reshuffles
       anything, the same "coupling from a single uniform" idea used
       throughout this site.

   References:
   [1] Evans, J. W. (1993). Random and cooperative sequential
       adsorption. Reviews of Modern Physics, 65(4), 1281-1329.
       https://doi.org/10.1103/RevModPhys.65.1281
   [2] Apollonian gasket / Apollonian circle packing -- see
       https://en.wikipedia.org/wiki/Apollonian_gasket and Graham, R.L.,
       Lagarias, J.C., Mallows, C.L., Wilks, A.R., Yan, C.H. (2005).
       Apollonian Circle Packings: Geometry and Group Theory I.
       Discrete & Computational Geometry, 34(4), 547-585.
   [3] Inverse transform sampling -- see
       https://en.wikipedia.org/wiki/Inverse_transform_sampling and
       Devroye, L. (1986). Non-Uniform Random Variate Generation.
       Springer-Verlag.
   ========================================================= */

import { el, heatColor } from "../lib/utils.js";
import { compileExpr, freeVariablesScoped, reservedNamesFor, LatentPool } from "../lib/mathexpr.js";
import { renderMathPreview, syncVarSliders } from "../lib/mathinput.js";

const CANVAS_PX = 560;
const BOUNDARY_M = 64; // directions used to approximate T's boundary (and test candidate tiles against it)
const GRID_RES = 200; // grid resolution used both for the f/S sampling distribution and the background shading
const T_RADIAL_CAP = 1000; // generous upper bound for T's own binary-searched radial extent
const FALLBACK_NOTE = "Advanced expression — live preview unavailable (also uncoupled: random() here uses fresh randomness, not the coupled per-site fields).";

const RESERVED_XY = reservedNamesFor(["x", "y"], []);
const RESERVED_F = reservedNamesFor(["x", "y", "_i"], []);

let _cosK = null, _sinK = null; // precomputed once (BOUNDARY_M is a fixed constant)
function boundaryDirs() {
  if (_cosK) return { cosK: _cosK, sinK: _sinK };
  _cosK = new Float64Array(BOUNDARY_M);
  _sinK = new Float64Array(BOUNDARY_M);
  for (let k = 0; k < BOUNDARY_M; k++) {
    const theta = (2 * Math.PI * k) / BOUNDARY_M;
    _cosK[k] = Math.cos(theta);
    _sinK[k] = Math.sin(theta);
  }
  return { cosK: _cosK, sinK: _sinK };
}

/** Binary-searches T's own boundary in each of the M fixed directions
 *  (radial function rho(theta), T assumed star-shaped about the
 *  origin), plus T's max radial reach and its r=1 polygon area (via
 *  the shoelace formula on the M boundary points) -- area(rT) scales
 *  as r^2 * area, a property of uniform scaling through a fixed point. */
function buildTileBoundary(fnT, varArgsT, cosK, sinK) {
  let originVal;
  try { originVal = fnT(0, 0, ...varArgsT); } catch (err) { originVal = 0; }
  if (!isFinite(originVal) || originVal === 0) {
    throw new Error("T must contain its own center (the origin) — check T's formula.");
  }
  const M = cosK.length;
  const rho = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const dx = cosK[k], dy = sinK[k];
    let lo = 0, hi = T_RADIAL_CAP;
    for (let iter = 0; iter < 25; iter++) {
      const mid = (lo + hi) / 2;
      let v;
      try { v = fnT(mid * dx, mid * dy, ...varArgsT); } catch (err) { v = 0; }
      if (isFinite(v) && v !== 0) lo = mid; else hi = mid;
    }
    rho[k] = lo;
  }
  let maxRho = 0;
  for (let k = 0; k < M; k++) if (rho[k] > maxRho) maxRho = rho[k];
  let area2 = 0;
  for (let k = 0; k < M; k++) {
    const k2 = (k + 1) % M;
    const x1 = rho[k] * cosK[k], y1 = rho[k] * sinK[k];
    const x2 = rho[k2] * cosK[k2], y2 = rho[k2] * sinK[k2];
    area2 += x1 * y2 - x2 * y1;
  }
  return { rho, maxRho, area: Math.abs(area2) / 2 };
}

/** Discretizes [-B,B]x[-B,B] into GRID_RES^2 cells, keeps the ones
 *  whose CENTER satisfies S, evaluates f at each (coupled per the
 *  cell's flat grid index, independent of which cells end up inside
 *  S, so editing S doesn't reshuffle f's own randomness elsewhere),
 *  and builds a cumulative-weight array over (f * cell area) for
 *  inverse-transform sampling. `insideGrid` (a flat boolean-ish
 *  Uint8Array over ALL G*G cells) is kept separately for the
 *  background shading, since the sparse cellsX/cellsY/cum arrays only
 *  cover the accepted cells. */
function buildDistribution(fnS, varArgsS, fnF, varArgsF, poolF, B, G) {
  const cellW = (2 * B) / G;
  const cellsX = [], cellsY = [];
  const weights = [];
  const insideGrid = new Uint8Array(G * G);
  let areaS = 0;
  let i = 0;
  for (let row = 0; row < G; row++) {
    const cy = B - (row + 0.5) * cellW;
    for (let col = 0; col < G; col++) {
      const cx = -B + (col + 0.5) * cellW;
      let sv;
      try { sv = fnS(cx, cy, ...varArgsS); } catch (err) { sv = 0; }
      if (isFinite(sv) && sv !== 0) {
        insideGrid[row * G + col] = 1;
        areaS += cellW * cellW;
        let fv;
        try { fv = fnF(cx, cy, i, poolF.sites, ...varArgsF); } catch (err) { fv = 0; }
        if (!isFinite(fv) || fv < 0) fv = 0;
        cellsX.push(cx);
        cellsY.push(cy);
        weights.push(fv * cellW * cellW);
      }
      i++;
    }
  }
  const cum = new Float64Array(weights.length);
  let running = 0;
  for (let k = 0; k < weights.length; k++) { running += weights[k]; cum[k] = running; }
  return { cellsX, cellsY, cellW, cum, total: running, areaS, insideGrid, G };
}

function sampleIndex(dist, u) {
  if (dist.cum.length === 0) return -1;
  const target = u * dist.total;
  let lo = 0, hi = dist.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist.cum[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function pointFeasible(cx, cy, fnS, varArgsS, fnT, varArgsT, tiles) {
  let sv;
  try { sv = fnS(cx, cy, ...varArgsS); } catch (err) { sv = 0; }
  if (!isFinite(sv) || sv === 0) return false;
  for (let ti = 0; ti < tiles.length; ti++) {
    const t = tiles[ti];
    const dx = cx - t.x, dy = cy - t.y;
    if (dx * dx + dy * dy > t.reach * t.reach) continue;
    let tv;
    try { tv = fnT((cx - t.x) / t.r, (cy - t.y) / t.r, ...varArgsT); } catch (err) { tv = 0; }
    if (isFinite(tv) && tv !== 0) return false;
  }
  return true;
}

/** Binary-searches the critical radius (caller must already know r=0
 *  is feasible, i.e. pointFeasible(cx,cy,...) was true) by testing all
 *  M precomputed boundary directions of the candidate tile at each
 *  trial r against S and every existing tile's local predicate. */
function findCriticalRadius(cx, cy, rho, cosK, sinK, fnS, varArgsS, fnT, varArgsT, tiles, rCap) {
  const M = rho.length;
  const feasible = (r) => {
    for (let k = 0; k < M; k++) {
      const px = cx + r * rho[k] * cosK[k];
      const py = cy + r * rho[k] * sinK[k];
      let sv;
      try { sv = fnS(px, py, ...varArgsS); } catch (err) { sv = 0; }
      if (!isFinite(sv) || sv === 0) return false;
      for (let ti = 0; ti < tiles.length; ti++) {
        const t = tiles[ti];
        const dx = px - t.x, dy = py - t.y;
        if (dx * dx + dy * dy > t.reach * t.reach) continue;
        let tv;
        try { tv = fnT((px - t.x) / t.r, (py - t.y) / t.r, ...varArgsT); } catch (err) { tv = 0; }
        if (isFinite(tv) && tv !== 0) return false;
      }
    }
    return true;
  };
  let lo = 0, hi = rCap;
  for (let iter = 0; iter < 25; iter++) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

export default {
  id: "tilepacking",
  name: "Random Sequential Tile Packing",
  category: "Packing & tilings",
  description:
    "Drop random points in a domain S (measure f) and grow the biggest copy of a tile shape T centered at each one that avoids leaving S or overlapping anything already placed. With disks for both S and T this is the classic random Apollonian circle packing — here S, T, and f are all typed Desmos-style, so any star-shaped tile works.",

  mount(container) {
    const state = {
      exprS: "sqrt(x^2+y^2)<=1",
      exprT: "sqrt(x^2+y^2)<=1",
      exprF: "1",
      fnS: null, fnT: null, fnF: null,
      varNamesS: [], varNamesT: [], varNamesF: [], siteCountF: 0,
      poolF: new LatentPool(),
      pointPool: new LatentPool(), // 3 sites: which cell / x-offset / y-offset, keyed by attempt index n
      vars: {}, // ONE global slider store, shared by name across S, T, and f
      manualVars: [],
      B: 1.3, // half-width of the sampling/view box [-B,B]x[-B,B] -- must comfortably contain S
      N: 150, // number of attempts (slider) -- includes R_n=0 duds
      tiles: [], placedCount: 0, attemptsRun: 0,
      dist: null, tileBoundary: null,
    };

    const canvas = el("canvas");
    const ctx = canvas.getContext("2d");
    const statsEl = el("p", { class: "hint" }, "");
    const errorEl = el("p", { class: "hint", style: { color: "#ff6b6b", display: "none" } }, "");
    const { cosK, sinK } = boundaryDirs();

    // ---------- Controls: S / T / f ----------

    const sInput = el("input", { type: "text", value: state.exprS, spellcheck: "false", autocomplete: "off" });
    const previewS = el("div", { class: "math-preview" });
    const tInput = el("input", { type: "text", value: state.exprT, spellcheck: "false", autocomplete: "off" });
    const previewT = el("div", { class: "math-preview" });
    const fInput = el("input", { type: "text", value: state.exprF, spellcheck: "false", autocomplete: "off" });
    const previewF = el("div", { class: "math-preview" });
    const globalVarsPanel = el("div");

    const nextFreeSliderName = () => {
      const used = new Set([...RESERVED_XY, ...Object.keys(state.vars), ...state.manualVars]);
      for (const c of "abcdghklmnopqrstuvwz") if (!used.has(c)) return c;
      let k = 1;
      while (used.has(`v${k}`)) k++;
      return `v${k}`;
    };
    const addSliderBtn = el("button", { class: "btn", onclick: () => {
      state.manualVars.push(nextFreeSliderName());
      recompute();
    } }, "+ Add slider");

    // ---------- Drawing ----------

    const toPx = (x, y, W, H) => [((x + state.B) / (2 * state.B)) * W, ((state.B - y) / (2 * state.B)) * H];

    const draw = () => {
      const G = GRID_RES;
      const cell = CANVAS_PX / G;
      const W = Math.ceil(G * cell), H = Math.ceil(G * cell);
      canvas.width = W;
      canvas.height = H;
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, W, H);
      if (state.dist) {
        ctx.fillStyle = "#1a1e28";
        const { insideGrid } = state.dist;
        for (let row = 0; row < G; row++) {
          for (let col = 0; col < G; col++) {
            if (insideGrid[row * G + col]) ctx.fillRect(Math.floor(col * cell), Math.floor(row * cell), Math.ceil(cell), Math.ceil(cell));
          }
        }
      }
      if (state.tileBoundary && state.tiles.length) {
        const { rho } = state.tileBoundary;
        const M = rho.length;
        let maxR = 0;
        for (const t of state.tiles) if (t.r > maxR) maxR = t.r;
        const logMax = Math.log(maxR + 1e-9);
        const logMin = Math.log((state.tileBoundary.minR || 1e-9) + 1e-9);
        for (const t of state.tiles) {
          const path = new Path2D();
          for (let k = 0; k < M; k++) {
            const x = t.x + t.r * rho[k] * cosK[k];
            const y = t.y + t.r * rho[k] * sinK[k];
            const [px, py] = toPx(x, y, W, H);
            if (k === 0) path.moveTo(px, py); else path.lineTo(px, py);
          }
          path.closePath();
          const span = logMax - logMin;
          const t01 = span > 0 ? (Math.log(t.r + 1e-9) - logMin) / span : 1;
          ctx.fillStyle = heatColor(t01);
          ctx.fill(path);
          ctx.strokeStyle = "#0f1115";
          ctx.lineWidth = 1;
          ctx.stroke(path);
        }
      }
    };

    const fmtPct = (x) => (100 * x).toFixed(1) + "%";
    const updateStats = () => {
      if (!state.dist) { statsEl.textContent = ""; return; }
      const coveredArea = state.tiles.reduce((s, t) => s + t.r * t.r * state.tileBoundary.area, 0);
      const frac = state.dist.areaS > 0 ? coveredArea / state.dist.areaS : 0;
      statsEl.textContent =
        `attempts: ${state.attemptsRun}  •  tiles placed: ${state.placedCount}  •  ` +
        `area(S) ≈ ${state.dist.areaS.toFixed(3)}  •  covered ≈ ${fmtPct(frac)}  •  ∫_S f ≈ ${state.dist.total.toFixed(3)}`;
    };

    // ---------- Core recompute ----------

    const recompute = () => {
      errorEl.style.display = "none";
      try {
        const varNamesS = freeVariablesScoped(state.exprS, RESERVED_XY);
        const csS = compileExpr(state.exprS, varNamesS, ["x", "y"]);
        state.fnS = csS.fn; state.varNamesS = varNamesS;
        renderMathPreview(previewS, csS.latex, csS.usedFallback ? FALLBACK_NOTE : "");

        const varNamesT = freeVariablesScoped(state.exprT, RESERVED_XY);
        const csT = compileExpr(state.exprT, varNamesT, ["x", "y"]);
        state.fnT = csT.fn; state.varNamesT = varNamesT;
        renderMathPreview(previewT, csT.latex, csT.usedFallback ? FALLBACK_NOTE : "");

        const varNamesF = freeVariablesScoped(state.exprF, RESERVED_F);
        const csF = compileExpr(state.exprF, varNamesF, ["x", "y", "_i", "_L"], { indexExpr: "_i" });
        state.fnF = csF.fn; state.varNamesF = varNamesF; state.siteCountF = csF.siteCount;
        renderMathPreview(previewF, csF.latex, csF.usedFallback ? FALLBACK_NOTE : "");
        state.poolF.ensureCount(state.siteCountF);

        const union = new Set([...varNamesS, ...varNamesT, ...varNamesF, ...state.manualVars]);
        syncVarSliders(globalVarsPanel, state.vars, [...union].sort(), recompute, {
          removable: new Set(state.manualVars),
          onRemove: (name) => {
            state.manualVars = state.manualVars.filter((n) => n !== name);
            recompute();
          },
        });

        const varArgsS = state.varNamesS.map((n) => state.vars[n].value);
        const varArgsT = state.varNamesT.map((n) => state.vars[n].value);
        const varArgsF = state.varNamesF.map((n) => state.vars[n].value);

        state.tileBoundary = buildTileBoundary(state.fnT, varArgsT, cosK, sinK);
        const rCap = (6 * state.B) / Math.max(state.tileBoundary.maxRho, 1e-9);

        state.dist = buildDistribution(state.fnS, varArgsS, state.fnF, varArgsF, state.poolF, state.B, GRID_RES);
        if (state.dist.cellsX.length === 0) {
          throw new Error("S has no points within the current view extent — increase it, or check S's formula.");
        }
        if (state.dist.total <= 0) {
          throw new Error("f is zero (or negative) everywhere in S — no valid density to sample points from.");
        }

        state.pointPool.ensureCount(3);
        const tiles = [];
        let minR = Infinity;
        for (let n = 0; n < state.N; n++) {
          const u = state.pointPool.sites[0](n);
          const ou = state.pointPool.sites[1](n);
          const ov = state.pointPool.sites[2](n);
          const idx = sampleIndex(state.dist, u);
          const cx = state.dist.cellsX[idx] + (ou - 0.5) * state.dist.cellW;
          const cy = state.dist.cellsY[idx] + (ov - 0.5) * state.dist.cellW;
          if (!pointFeasible(cx, cy, state.fnS, varArgsS, state.fnT, varArgsT, tiles)) continue;
          const r = findCriticalRadius(cx, cy, state.tileBoundary.rho, cosK, sinK, state.fnS, varArgsS, state.fnT, varArgsT, tiles, rCap);
          if (r > 0) {
            tiles.push({ x: cx, y: cy, r, reach: r * state.tileBoundary.maxRho });
            if (r < minR) minR = r;
          }
        }
        state.tileBoundary.minR = isFinite(minR) ? minR : 0;
        state.tiles = tiles;
        state.attemptsRun = state.N;
        state.placedCount = tiles.length;
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "";
        return;
      }
      draw();
      updateStats();
    };

    const hardRegenerate = () => {
      state.poolF.hardReset();
      state.pointPool.hardReset();
      recompute();
    };

    sInput.addEventListener("input", () => { state.exprS = sInput.value; recompute(); });
    tInput.addEventListener("input", () => { state.exprT = tInput.value; recompute(); });
    fInput.addEventListener("input", () => { state.exprF = fInput.value; recompute(); });

    const presetDisks = el("button", { class: "btn", onclick: () => {
      state.exprS = "sqrt(x^2+y^2)<=1"; sInput.value = state.exprS;
      state.exprT = "sqrt(x^2+y^2)<=1"; tInput.value = state.exprT;
      recompute();
    } }, "Preset: circles in a disk");
    const presetSquaresInDisk = el("button", { class: "btn", onclick: () => {
      state.exprS = "sqrt(x^2+y^2)<=1"; sInput.value = state.exprS;
      state.exprT = "max(abs(x),abs(y))<=1"; tInput.value = state.exprT;
      recompute();
    } }, "Preset: squares in a disk");
    const presetCirclesInSquare = el("button", { class: "btn", onclick: () => {
      state.exprS = "max(abs(x),abs(y))<=1"; sInput.value = state.exprS;
      state.exprT = "sqrt(x^2+y^2)<=1"; tInput.value = state.exprT;
      recompute();
    } }, "Preset: circles in a square");

    // ---------- Controls: view extent + N + regenerate ----------

    const bInput = el("input", { type: "range", min: "0.5", max: "4", step: "0.05", value: String(state.B) });
    const bVal = el("span", { class: "val" }, state.B.toFixed(2));
    bInput.addEventListener("input", () => { bVal.textContent = parseFloat(bInput.value).toFixed(2); });
    bInput.addEventListener("change", () => { state.B = parseFloat(bInput.value); recompute(); });

    const nInput = el("input", { type: "range", min: "0", max: "400", value: String(state.N) });
    const nVal = el("span", { class: "val" }, String(state.N));
    nInput.addEventListener("input", () => { nVal.textContent = nInput.value; });
    nInput.addEventListener("change", () => { state.N = parseInt(nInput.value, 10); recompute(); });

    const regenBtn = el("button", { class: "btn primary", onclick: hardRegenerate }, "Regenerate randomness");

    // ---------- Layout ----------

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [el("label", {}, "S ="), sInput, previewS]),
      el("div", { class: "control-row" }, [el("label", {}, "T ="), tInput, previewT]),
      el("div", { class: "control-row" }, [el("label", {}, "f ="), fInput, previewF]),
      errorEl,
      el("div", { class: "btn-row", style: { marginTop: "4px" } }, [presetDisks, presetSquaresInDisk, presetCirclesInSquare]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [el("label", {}, ["View / search extent B", bVal]), bInput]),
      el("div", { class: "control-row" }, [el("label", {}, ["Attempts N", nVal]), nInput]),
      el("div", { class: "btn-row" }, [regenBtn]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "Sliders (global — shared by name across S, T, and f)"),
        globalVarsPanel,
        el("div", { class: "btn-row" }, [addSliderBtn]),
      ]),
      el("div", { class: "control-divider" }),
      statsEl,
      el("p", { class: "hint" }, "S and T are typed as the bare membership predicate (no \"{(x,y): ...}\" wrapper needed) — mod(a,b), a=b, a<b, {cond:a,b}, [a,b,c], and so on all work the same as elsewhere on this site. T must contain the origin. Tiles are colored by radius (blue = small, red = large, on a log scale). Any letter other than x/y becomes a slider, global and shared by name across S, T, and f, editable with a typeable value box; \"+ Add slider\" creates one you haven't used yet. Every random draw (which point C_n is, and any random() inside f) has its own persistent source of randomness — dragging N only adds attempts, it never reshuffles ones already placed; only editing a formula, a slider, the view extent, or clicking \"Regenerate randomness\" reshuffles anything."),
    ]);

    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
    recompute();

    const aboutBlock = el("div", { class: "sim-canvas-wrap", style: { marginTop: "18px", maxWidth: "820px", lineHeight: "1.6" } }, [
      el("h3", { style: { fontSize: "14px", margin: "0 0 8px" } }, "About this model"),
      el("p", { class: "hint" },
        "At each step n, a point C_n is drawn from the probability measure proportional to f restricted to S, and the biggest copy of T centered there that fits inside S and avoids every previously-placed tile is grown and frozen. With T and S both disks and f uniform this reproduces the classic random Apollonian circle packing; letting T and S be arbitrary typed shapes generalizes the same growth-until-blocked idea (a special case of random sequential adsorption) to squares, arbitrary star-shaped tiles, and arbitrary domains."),
      el("p", { class: "hint" },
        "Because there's no closed form for the critical radius against an arbitrary domain, tile shape, and set of already-placed tiles, it's found numerically: T's own boundary is approximated once by binary-searching its radial extent rho(theta) in 64 fixed directions (T is assumed star-shaped about the origin, so this is well-defined), and for a candidate point, those same 64 directions — scaled by a trial radius and shifted to the point — are tested against S and every existing tile's own local predicate; binary-searching the trial radius converges to the critical value. This is an approximation (a 64-point polygon standing in for the true boundary), and any concave detail in T finer than that angular spacing can be missed."),
      el("p", { class: "hint" },
        "C_n's distribution is built by discretizing S into a grid, evaluating f at each in-S cell, and treating the (f × cell-area) weights as a piecewise-constant density — a standard inverse-transform sampling construction. This automatically normalizes whatever f you type (its running total over S is exactly the ∫_S f shown in the stats line), so f never needs to be pre-normalized by hand."),
      el("ol", { style: { fontSize: "12px", color: "var(--text-dim)", paddingLeft: "18px" } }, [
        el("li", {}, [
          "Evans, J. W. (1993). Random and cooperative sequential adsorption. ",
          el("a", { href: "https://doi.org/10.1103/RevModPhys.65.1281", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Reviews of Modern Physics, 65(4), 1281–1329"),
          ".",
        ]),
        el("li", {}, [
          "Graham, R.L., Lagarias, J.C., Mallows, C.L., Wilks, A.R., Yan, C.H. (2005). Apollonian Circle Packings: Geometry and Group Theory I. Discrete & Computational Geometry, 34(4), 547–585. See also ",
          el("a", { href: "https://en.wikipedia.org/wiki/Apollonian_gasket", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Apollonian gasket"),
          " (Wikipedia).",
        ]),
        el("li", {}, [
          "Inverse transform sampling — see ",
          el("a", { href: "https://en.wikipedia.org/wiki/Inverse_transform_sampling", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "Inverse transform sampling"),
          " (Wikipedia), and Devroye, L. (1986). Non-Uniform Random Variate Generation. Springer-Verlag, for the general theory.",
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
