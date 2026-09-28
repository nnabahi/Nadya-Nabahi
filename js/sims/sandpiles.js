/* =========================================================
   Abelian sandpile model. Cells topple once they hold 4+
   grains, distributing one grain to each orthogonal neighbor.
   Port + cleanup of the original Sandpiles.js/SquareGrid.js.
   ========================================================= */

import { CanvasGrid } from "../lib/grid.js";
import { randInt, el } from "../lib/utils.js";

const COLORS = [
  "#0f1115", "#3a5f80", "#5eb1ff", "#7bd88f",
  "#f4d35e", "#ee964b", "#f95738", "#c1121f", "#ffffff",
];
const colorFor = (v) => COLORS[Math.min(v, COLORS.length - 1)];

export default {
  id: "sandpiles",
  name: "Abelian Sandpile",
  category: "Cellular automata",
  description:
    "Drop grains of sand on a grid; any cell with 4 or more grains topples, spilling one grain to each neighbor. Click to add or remove sand.",

  mount(container) {
    const state = {
      w: 40,
      h: 40,
      mode: "random", // empty | random | full | center | linear
      clickMode: "add", // add | remove
      cells: new Uint8Array(0),
      toppling: false,
      storming: false,
      topplesPerFrame: 25,
      stormRate: 2, // grains dropped per second while storming
      raf: null,
      lastStorm: 0,
    };

    const idx = (x, y) => y * state.w + x;

    const makeInitial = () => {
      const n = state.w * state.h;
      const cells = new Uint8Array(n);
      if (state.mode === "random") {
        for (let i = 0; i < n; i++) cells[i] = randInt(0, 4);
      } else if (state.mode === "full") {
        cells.fill(3);
      } else if (state.mode === "center") {
        cells[idx(Math.floor(state.w / 2), Math.floor(state.h / 2))] = 64;
      } else if (state.mode === "linear") {
        for (let y = 0; y < state.h; y++)
          for (let x = 0; x < state.w; x++) cells[idx(x, y)] = Math.min(255, x + y);
      }
      return cells;
    };

    // ---------- DOM ----------
    const CANVAS_PX = 560;
    const canvas = el("canvas");
    let cellSize = CANVAS_PX / Math.max(state.w, state.h);
    const grid = new CanvasGrid(canvas, state.w, state.h, cellSize);

    const drawAll = () => {
      grid.clear("#ffffff");
      for (let y = 0; y < state.h; y++) {
        for (let x = 0; x < state.w; x++) {
          const v = state.cells[idx(x, y)];
          if (v > 0) grid.fillCell(x, y, colorFor(v));
        }
      }
    };

    const redrawCell = (x, y) => {
      const v = state.cells[idx(x, y)];
      grid.fillCell(x, y, v > 0 ? colorFor(v) : "#ffffff");
    };

    const topple = (x, y) => {
      state.cells[idx(x, y)] -= 4;
      redrawCell(x, y);
      if (x > 0) { state.cells[idx(x - 1, y)]++; redrawCell(x - 1, y); }
      if (x < state.w - 1) { state.cells[idx(x + 1, y)]++; redrawCell(x + 1, y); }
      if (y > 0) { state.cells[idx(x, y - 1)]++; redrawCell(x, y - 1); }
      if (y < state.h - 1) { state.cells[idx(x, y + 1)]++; redrawCell(x, y + 1); }
    };

    const findUnstable = () => {
      for (let y = 0; y < state.h; y++)
        for (let x = 0; x < state.w; x++)
          if (state.cells[idx(x, y)] >= 4) return { x, y };
      return null;
    };

    const stepOnce = () => {
      const c = findUnstable();
      if (!c) return false;
      topple(c.x, c.y);
      return true;
    };

    const dropRandomGrain = () => {
      const x = randInt(0, state.w), y = randInt(0, state.h);
      state.cells[idx(x, y)]++;
      redrawCell(x, y);
    };

    const loop = (t) => {
      if (state.toppling) {
        for (let i = 0; i < state.topplesPerFrame; i++) {
          if (!stepOnce()) break;
        }
      }
      if (state.storming) {
        if (t - state.lastStorm > 1000 / state.stormRate) {
          dropRandomGrain();
          state.lastStorm = t;
        }
      }
      state.raf = requestAnimationFrame(loop);
    };

    const reset = () => {
      state.cells = makeInitial();
      const size = Math.max(2, Math.min(state.w, state.h) > 0 ? CANVAS_PX / Math.max(state.w, state.h) : 10);
      grid.resize(state.w, state.h, Math.max(2, Math.min(24, size)));
      drawAll();
    };

    canvas.addEventListener("click", (evt) => {
      const cell = grid.eventToCell(evt);
      if (!cell) return;
      const i = idx(cell.col, cell.row);
      if (state.clickMode === "add") state.cells[i]++;
      else if (state.cells[i] > 0) state.cells[i]--;
      redrawCell(cell.col, cell.row);
    });

    // ---------- Controls ----------
    const wInput = el("input", { type: "number", min: "3", max: "150", value: state.w });
    const hInput = el("input", { type: "number", min: "3", max: "150", value: state.h });
    const modeSelect = el("select", {}, [
      el("option", { value: "empty" }, "Empty"),
      el("option", { value: "random", selected: "selected" }, "Random"),
      el("option", { value: "full" }, "Full (3 everywhere)"),
      el("option", { value: "center" }, "Center pile"),
      el("option", { value: "linear" }, "Linear ramp"),
    ]);
    const clickSelect = el("select", {}, [
      el("option", { value: "add", selected: "selected" }, "Click adds sand"),
      el("option", { value: "remove" }, "Click removes sand"),
    ]);
    const speedInput = el("input", { type: "range", min: "1", max: "400", value: state.topplesPerFrame });
    const speedVal = el("span", { class: "val" }, String(state.topplesPerFrame));
    const stormInput = el("input", { type: "range", min: "1", max: "200", value: state.stormRate });
    const stormVal = el("span", { class: "val" }, String(state.stormRate));

    wInput.addEventListener("change", () => { state.w = Math.max(3, Math.min(150, parseInt(wInput.value, 10) || 40)); reset(); });
    hInput.addEventListener("change", () => { state.h = Math.max(3, Math.min(150, parseInt(hInput.value, 10) || 40)); reset(); });
    modeSelect.addEventListener("change", () => { state.mode = modeSelect.value; reset(); });
    clickSelect.addEventListener("change", () => { state.clickMode = clickSelect.value; });
    speedInput.addEventListener("input", () => { state.topplesPerFrame = parseInt(speedInput.value, 10); speedVal.textContent = String(state.topplesPerFrame); });
    stormInput.addEventListener("input", () => { state.stormRate = parseInt(stormInput.value, 10); stormVal.textContent = String(state.stormRate); });

    const toppleBtn = el("button", {
      class: "btn primary",
      onclick: () => { state.toppling = !state.toppling; toppleBtn.classList.toggle("active", state.toppling); toppleBtn.textContent = state.toppling ? "Pause toppling" : "Start toppling"; },
    }, "Start toppling");
    const stormBtn = el("button", {
      class: "btn",
      onclick: () => { state.storming = !state.storming; stormBtn.classList.toggle("active", state.storming); stormBtn.textContent = state.storming ? "Stop storm" : "Start storm"; },
    }, "Start storm");
    const stepBtn = el("button", { class: "btn", onclick: stepOnce }, "Step");
    const resetBtn = el("button", { class: "btn", onclick: reset }, "Reset");

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [
        el("label", {}, ["Width", el("span", { class: "val" }, String(state.w))]),
        wInput,
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Height", el("span", { class: "val" }, String(state.h))]),
        hInput,
      ]),
      el("div", { class: "control-row" }, [el("label", {}, "Initial fill"), modeSelect]),
      el("div", { class: "control-row" }, [el("label", {}, "Click behavior"), clickSelect]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Topple speed", speedVal]),
        speedInput,
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Storm rate (grains/sec)", stormVal]),
        stormInput,
      ]),
      el("div", { class: "btn-row" }, [toppleBtn, stormBtn]),
      el("div", { class: "btn-row", style: { marginTop: "8px" } }, [stepBtn, resetBtn]),
      el("p", { class: "hint" }, "Click the grid to add or remove single grains anywhere. Start toppling to let unstable cells (4+ grains) cascade automatically; start a storm to keep dropping random grains at the same time."),
    ]);

    reset();
    state.raf = requestAnimationFrame(loop);

    const wrapper = el("div", { class: "sim-layout" }, [
      el("div", { class: "sim-canvas-wrap" }, canvas),
      controls,
    ]);
    container.appendChild(wrapper);

    return {
      destroy() {
        cancelAnimationFrame(state.raf);
      },
    };
  },
};
