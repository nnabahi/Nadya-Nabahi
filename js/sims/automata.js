/* =========================================================
   Elementary 1D cellular automaton, generalized to any base
   and any Wolfram-style rule number. Port + cleanup of the
   original Basic1DAutomata.js, rebuilt on CanvasGrid.
   ========================================================= */

import { CanvasGrid } from "../lib/grid.js";
import { mod, randInt, paletteColor, el } from "../lib/utils.js";

const CELL_PX = 12;
const CANVAS_COLS_MAX = 140;

export default {
  id: "automata",
  name: "1D Cellular Automata",
  category: "Cellular automata",
  description:
    "Elementary automata over any base and rule number. Click a cell in the top row to toggle it, then step or play forward.",

  mount(container) {
    const state = {
      width: 61,
      base: 2,
      rule: 30,
      speed: 8, // rows per second
      playing: false,
      rows: [], // history of rows (arrays of ints), row 0 = initial
      timer: null,
    };

    const ruleDigits = () => {
      const span = state.base ** 3;
      let digits = parseInt(state.rule, 10).toString(state.base).split("").map(Number);
      while (digits.length < span) digits.unshift(0);
      return digits; // index 0 = most significant neighborhood value
    };

    const randomRow = (w) =>
      Array.from({ length: w }, () => randInt(0, state.base));

    const nextRow = (row) => {
      const digits = ruleDigits();
      const span = digits.length;
      const w = row.length;
      const out = new Array(w);
      for (let i = 0; i < w; i++) {
        const left = row[mod(i - 1, w)];
        const mid = row[i];
        const right = row[mod(i + 1, w)];
        const neighborhoodValue = left * state.base * state.base + mid * state.base + right;
        out[i] = digits[span - 1 - neighborhoodValue];
      }
      return out;
    };

    // ---------- DOM ----------
    const canvas = el("canvas");
    const grid = new CanvasGrid(canvas, state.width, 1, CELL_PX);

    const colorFor = (val) => paletteColor(val, state.base);

    const drawAll = () => {
      const visibleCols = Math.min(state.width, CANVAS_COLS_MAX);
      grid.resize(state.width, Math.max(state.rows.length, 1), CELL_PX);
      grid.clear();
      state.rows.forEach((row, r) => {
        row.forEach((val, c) => grid.fillCell(c, r, colorFor(val)));
      });
    };

    const pushRow = (row) => {
      state.rows.push(row);
      grid.resize(state.width, state.rows.length, CELL_PX);
      row.forEach((val, c) => grid.fillCell(c, state.rows.length - 1, colorFor(val)));
    };

    const reset = () => {
      stop();
      state.rows = [];
      pushRow(randomRow(state.width));
    };

    const step = () => {
      if (state.rows.length === 0) return;
      pushRow(nextRow(state.rows[state.rows.length - 1]));
    };

    const prev = () => {
      if (state.rows.length <= 1) return;
      state.rows.pop();
      drawAll();
    };

    const play = () => {
      if (state.playing) return;
      state.playing = true;
      playBtn.textContent = "Pause";
      playBtn.classList.add("active");
      state.timer = setInterval(step, 1000 / state.speed);
    };

    const stop = () => {
      state.playing = false;
      playBtn.textContent = "Play";
      playBtn.classList.remove("active");
      clearInterval(state.timer);
    };

    canvas.addEventListener("click", (evt) => {
      const cell = grid.eventToCell(evt);
      if (!cell || cell.row !== 0) return;
      state.rows[0][cell.col] = mod(state.rows[0][cell.col] + 1, state.base);
      // recompute everything after row 0 since the seed changed
      const seed = state.rows[0];
      state.rows = [seed];
      drawAll();
    });

    // ---------- Controls ----------
    const widthInput = el("input", {
      type: "number", min: "5", max: String(CANVAS_COLS_MAX), value: state.width,
    });
    const baseInput = el("input", { type: "number", min: "2", max: "6", value: state.base });
    const ruleInput = el("input", { type: "number", min: "0", value: state.rule });
    const speedInput = el("input", { type: "range", min: "1", max: "60", value: state.speed });
    const speedVal = el("span", { class: "val" }, String(state.speed));

    widthInput.addEventListener("change", () => {
      state.width = Math.max(5, Math.min(CANVAS_COLS_MAX, parseInt(widthInput.value, 10) || 61));
      reset();
    });
    baseInput.addEventListener("change", () => {
      state.base = Math.max(2, Math.min(6, parseInt(baseInput.value, 10) || 2));
      reset();
    });
    ruleInput.addEventListener("change", () => {
      state.rule = Math.max(0, parseInt(ruleInput.value, 10) || 0);
      const seed = state.rows[0] || randomRow(state.width);
      state.rows = [seed];
      drawAll();
    });
    speedInput.addEventListener("input", () => {
      state.speed = parseInt(speedInput.value, 10);
      speedVal.textContent = String(state.speed);
      if (state.playing) { stop(); play(); }
    });

    const playBtn = el("button", { class: "btn primary", onclick: () => (state.playing ? stop() : play()) }, "Play");
    const stepBtn = el("button", { class: "btn", onclick: step }, "Step");
    const prevBtn = el("button", { class: "btn", onclick: prev }, "Undo");
    const resetBtn = el("button", { class: "btn", onclick: reset }, "Reset");
    const randomizeBtn = el("button", {
      class: "btn",
      onclick: () => { state.rows[0] = randomRow(state.width); state.rows = [state.rows[0]]; drawAll(); },
    }, "Randomize row 0");

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [
        el("label", {}, ["Tape width", el("span", { class: "val" }, String(state.width))]),
        widthInput,
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Base (states per cell)", el("span", { class: "val" }, String(state.base))]),
        baseInput,
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Rule number", el("span", { class: "val" }, String(state.rule))]),
        ruleInput,
      ]),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Speed (rows/sec)", speedVal]),
        speedInput,
      ]),
      el("div", { class: "control-divider" }),
      el("div", { class: "btn-row" }, [playBtn, stepBtn, prevBtn, resetBtn]),
      el("div", { class: "btn-row", style: { marginTop: "8px" } }, [randomizeBtn]),
      el("p", { class: "hint" }, "Click a cell in the top row to toggle its value, then Play or Step to evolve the rule forward. Undo removes the last generated row."),
    ]);

    reset();

    const wrapper = el("div", { class: "sim-layout" }, [
      el("div", { class: "sim-canvas-wrap" }, canvas),
      controls,
    ]);
    container.appendChild(wrapper);

    return {
      destroy() {
        stop();
      },
    };
  },
};
