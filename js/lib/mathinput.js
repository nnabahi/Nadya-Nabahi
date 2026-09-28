/* =========================================================
   DOM glue for mathexpr.js: a live KaTeX-rendered preview of a
   typed expression, and Desmos-style auto-generated sliders for
   any free variable in it. Self-hosted -- KaTeX is loaded from
   this site's own css/katex + js/lib/katex.min.js, lazily, the
   first time a sim actually needs it.
   ========================================================= */

import { el, clamp } from "./utils.js";

let katexLoadPromise = null;

/** Lazily inject KaTeX's stylesheet + script (once per page load) and
 *  resolve with the global `katex` object. Self-hosted, no CDN. */
export function ensureKatex() {
  if (katexLoadPromise) return katexLoadPromise;
  katexLoadPromise = new Promise((resolve, reject) => {
    if (window.katex) { resolve(window.katex); return; }
    if (!document.querySelector('link[data-katex]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "css/katex/katex.min.css";
      link.dataset.katex = "1";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "js/lib/katex.min.js";
    script.onload = () => resolve(window.katex);
    script.onerror = () => reject(new Error("Could not load the math preview renderer."));
    document.head.appendChild(script);
  });
  return katexLoadPromise;
}

/** Render `latex` into `container`. If latex is null (the friendly
 *  parser didn't recognize the expression -- comparisons, ternaries,
 *  etc.), shows a small explanatory note instead. */
export function renderMathPreview(container, latex, fallbackNote) {
  if (!latex) {
    container.textContent = fallbackNote || "";
    container.classList.add("math-preview-note");
    return;
  }
  container.classList.remove("math-preview-note");
  ensureKatex()
    .then((katex) => {
      try {
        katex.render(latex, container, { throwOnError: false, displayMode: false });
      } catch (err) {
        container.textContent = "";
      }
    })
    .catch(() => {
      container.textContent = "";
    });
}

function fmtVal(x) {
  return Number.isFinite(x) ? String(Math.round(x * 1000) / 1000) : "0";
}

/**
 * Keeps `container` full of one slider row per name in `varNames`,
 * reusing each variable's current {value,min,max,step} (stored in
 * `vars`, keyed by name) across rebuilds so editing the expression
 * doesn't reset sliders for variables that are still present.
 * Calls onChange() whenever a slider, its typed value, or its range
 * is edited.
 *
 * Each row has both a bounded range slider AND a typeable number box
 * for the value (Desmos-style), kept in sync in both directions: drag
 * the slider and the box updates; type a value in the box (then blur
 * or press Enter) and the slider jumps to it, auto-growing min/max
 * first if the typed value falls outside the slider's current bounds.
 *
 * `opts.removable` (a Set of names) and `opts.onRemove(name)` are
 * optional -- pass both to add a "Remove slider" button under any row
 * whose name is in that set (e.g. a caller-managed list of sliders
 * that were created directly, via an "+ Add slider" button, rather
 * than detected from a formula -- those wouldn't otherwise have any
 * way to go away again, since a formula-detected slider just vanishes
 * on its own once nothing references its name any more). Omit `opts`
 * entirely for the old behavior (no remove buttons at all).
 */
export function syncVarSliders(container, vars, varNames, onChange, opts = {}) {
  const { removable = null, onRemove = null } = opts;
  for (const name of Object.keys(vars)) {
    if (!varNames.includes(name)) delete vars[name];
  }
  container.innerHTML = "";
  for (const name of varNames) {
    if (!vars[name]) vars[name] = { value: 1, min: -5, max: 5, step: 0.01 };
    const v = vars[name];

    const valInput = el("input", {
      type: "number", class: "val", value: fmtVal(v.value), step: "any", title: "type a value",
    });
    const slider = el("input", {
      type: "range", min: String(v.min), max: String(v.max), step: String(v.step), value: String(v.value),
    });
    const minInput = el("input", { type: "number", value: String(v.min), step: "any", title: "slider min" });
    const maxInput = el("input", { type: "number", value: String(v.max), step: "any", title: "slider max" });

    slider.addEventListener("input", () => {
      v.value = parseFloat(slider.value);
      valInput.value = fmtVal(v.value);
      onChange();
    });
    valInput.addEventListener("change", () => {
      let val = parseFloat(valInput.value);
      if (!isFinite(val)) { valInput.value = fmtVal(v.value); return; }
      if (val < v.min) { v.min = val; minInput.value = String(v.min); slider.min = String(v.min); }
      if (val > v.max) { v.max = val; maxInput.value = String(v.max); slider.max = String(v.max); }
      v.value = val;
      slider.value = String(v.value);
      valInput.value = fmtVal(v.value);
      onChange();
    });
    minInput.addEventListener("change", () => {
      let lo = parseFloat(minInput.value);
      if (!isFinite(lo)) lo = v.min;
      if (lo >= v.max) lo = v.max - Math.abs(v.step || 0.01);
      v.min = lo;
      v.value = clamp(v.value, v.min, v.max);
      slider.min = String(v.min);
      slider.value = String(v.value);
      valInput.value = fmtVal(v.value);
      onChange();
    });
    maxInput.addEventListener("change", () => {
      let hi = parseFloat(maxInput.value);
      if (!isFinite(hi)) hi = v.max;
      if (hi <= v.min) hi = v.min + Math.abs(v.step || 0.01);
      v.max = hi;
      v.value = clamp(v.value, v.min, v.max);
      slider.max = String(v.max);
      slider.value = String(v.value);
      valInput.value = fmtVal(v.value);
      onChange();
    });

    const rowChildren = [
      el("label", {}, [`${name} =`, valInput]),
      slider,
      el("div", { class: "minmax-row" }, [minInput, maxInput]),
    ];
    if (removable && removable.has(name) && onRemove) {
      const removeBtn = el("button", {
        class: "btn", style: { marginTop: "6px", width: "100%" }, title: `Remove the "${name}" slider`,
      }, `Remove ${name}`);
      removeBtn.addEventListener("click", () => onRemove(name));
      rowChildren.push(removeBtn);
    }
    container.appendChild(el("div", { class: "control-row var-slider-row" }, rowChildren));
  }
}
