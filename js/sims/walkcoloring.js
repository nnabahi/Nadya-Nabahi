/* =========================================================
   Random walk coloring (competing walkers) on a torus.

   Two independent simple random walks move on Z_L (1D) or
   (Z_L)^2 (2D), wrapping around at the edges. Every site keeps
   whichever walker's color first reaches it; already-colored
   sites are left alone by later visits (from either walker).
   Built from the process as described in conversation, not
   from a specific original script (this repo's RandomColoredWalk*.py
   files weren't read while building this) — generalizes the
   same idea: two colorings racing to cover a torus.
   ========================================================= */

import { CanvasGrid } from "../lib/grid.js";
import { el } from "../lib/utils.js";

const CANVAS_PX = 560;
const WALKER_COLORS = ["#5eb1ff", "#ff6b6b"];
const WALKER_NAMES = ["Walker 1", "Walker 2"];
const TEXT_DIM = "#9aa1b4";
const BORDER = "#2a2f3d";

/* ---------- small reusable histogram renderer ---------- */
function drawHistogram(canvas, values, color, xLabel) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#161922";
  ctx.fillRect(0, 0, W, H);
  const padL = 30, padB = 22, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  if (!values.length) {
    ctx.fillStyle = TEXT_DIM;
    ctx.font = "12px sans-serif";
    ctx.fillText("no data", padL, H / 2);
    return;
  }

  const min = Math.min(...values), max = Math.max(...values);
  const nBins = Math.min(12, Math.max(1, max - min + 1));
  const binW = (max - min + 1) / nBins;
  const counts = new Array(nBins).fill(0);
  for (const v of values) {
    let b = Math.floor((v - min) / binW);
    if (b >= nBins) b = nBins - 1;
    counts[b]++;
  }
  const maxCount = Math.max(...counts);

  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();

  const barGap = 2;
  const barW = plotW / nBins;
  ctx.fillStyle = color;
  for (let i = 0; i < nBins; i++) {
    const h = (counts[i] / maxCount) * (plotH - 4);
    ctx.fillRect(padL + i * barW + barGap / 2, H - padB - h, Math.max(1, barW - barGap), h);
  }

  ctx.fillStyle = TEXT_DIM;
  ctx.font = "10px sans-serif";
  ctx.fillText(String(Math.round(min)), padL, H - 6);
  ctx.fillText(String(Math.round(max)), W - padR - 16, H - 6);
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("count", 0, 0);
  ctx.restore();
  ctx.textAlign = "left";
  ctx.fillText(xLabel, padL, padT - 2);
}

/* ---------- live auto-rescaling arrival chart (N(t) per walker) ---------- */
function drawArrivalChart(canvas, hist1, hist2, curSteps) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#161922";
  ctx.fillRect(0, 0, W, H);
  const padL = 36, padB = 24, padT = 10, padR = 12;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const lastN = (h) => (h.length ? h[h.length - 1].n : 0);
  const xMax = Math.max(curSteps, 1);
  const yMax = Math.max(lastN(hist1), lastN(hist2), 1);
  const X = (t) => padL + (t / xMax) * plotW;
  const Y = (n) => H - padB - (n / yMax) * plotH;

  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();

  const drawSeries = (hist, color) => {
    if (!hist.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(hist[0].t), Y(hist[0].n));
    let prev = hist[0];
    for (let i = 1; i < hist.length; i++) {
      const cur = hist[i];
      ctx.lineTo(X(cur.t), Y(prev.n)); // hold
      ctx.lineTo(X(cur.t), Y(cur.n)); // jump
      prev = cur;
    }
    ctx.lineTo(X(curSteps), Y(prev.n)); // hold to now
    ctx.stroke();
  };
  drawSeries(hist1, WALKER_COLORS[0]);
  drawSeries(hist2, WALKER_COLORS[1]);

  ctx.fillStyle = TEXT_DIM;
  ctx.font = "10px sans-serif";
  ctx.fillText("0", padL - 4, H - padB + 12);
  ctx.fillText(String(xMax), W - padR - 20, H - padB + 12);
  ctx.fillText(String(yMax), 4, padT + 8);
  ctx.fillText("0", 4, H - padB);
  ctx.fillText("t (steps)", W - padR - 46, H - 4);
  ctx.save();
  ctx.translate(10, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("N(t) sites colored", 0, 0);
  ctx.restore();
}

/* ---------- union-find ---------- */
function makeUF(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  return { find, union };
}

export default {
  id: "walkcoloring",
  name: "Random Walk Coloring",
  category: "Random walks & stochastic processes",
  description:
    "Two random walkers move on a torus of side length L; each site is painted with whichever walker's color first arrives there and keeps it forever after. Place both walkers, then watch the territory each one claims.",

  mount(container) {
    const state = {
      dim: 1,
      L: 61,
      walkers: [{ pos: [0] }, { pos: [0] }],
      colorGrid: null, // Uint8Array, 0 = uncolored, 1/2 = walker index+1
      placing: null,
      steps: 0,
      playing: false,
      stepsPerFrame: 4,
      raf: null,
      done: false,
      area: [0, 0], // sites claimed by each walker so far (incremental)
      history: [[], []], // arrival records per walker: {t, n}
    };

    const idxOf = (p) => (state.dim === 1 ? p[0] : p[1] * state.L + p[0]);

    const defaultPositions = () => {
      const L = state.L;
      if (state.dim === 1) {
        state.walkers[0].pos = [Math.floor(L / 4)];
        state.walkers[1].pos = [Math.floor((3 * L) / 4)];
      } else {
        state.walkers[0].pos = [Math.floor(L / 4), Math.floor(L / 4)];
        state.walkers[1].pos = [Math.floor((3 * L) / 4), Math.floor((3 * L) / 4)];
      }
    };

    const initGrid = () => {
      const n = state.dim === 1 ? state.L : state.L * state.L;
      state.colorGrid = new Uint8Array(n);
      state.steps = 0;
      state.done = false;
      state.area = [1, 1];
      state.history = [[{ t: 0, n: 1 }], [{ t: 0, n: 1 }]];
      for (let w = 0; w < 2; w++) state.colorGrid[idxOf(state.walkers[w].pos)] = w + 1;
    };

    const recordArrival = (w) => {
      state.area[w]++;
      state.history[w].push({ t: state.steps, n: state.area[w] });
    };

    const moveWalker = (w) => {
      const L = state.L;
      const p = state.walkers[w].pos;
      if (state.dim === 1) {
        p[0] = (((p[0] + (Math.random() < 0.5 ? -1 : 1)) % L) + L) % L;
      } else {
        const axis = Math.random() < 0.5 ? 0 : 1;
        const delta = Math.random() < 0.5 ? -1 : 1;
        p[axis] = (((p[axis] + delta) % L) + L) % L;
      }
      const i = idxOf(p);
      if (state.colorGrid[i] === 0) {
        state.colorGrid[i] = w + 1;
        recordArrival(w);
      }
    };

    const stepOnce = () => {
      if (state.done) return;
      state.steps++;
      moveWalker(0);
      moveWalker(1);
    };

    // ---------- Drawing ----------
    const canvas = el("canvas");
    const grid = new CanvasGrid(canvas, state.L, 1, 10);
    const arrivalCanvas = el("canvas", { width: "820", height: "220" });

    const draw = () => {
      drawArrivalChart(arrivalCanvas, state.history[0], state.history[1], state.steps);
      const L = state.L;
      const rows = state.dim === 1 ? 1 : L;
      const cellSize = Math.max(2, Math.min(26, CANVAS_PX / Math.max(L, rows)));
      grid.resize(L, rows, cellSize);
      grid.clear("#0f1115");
      for (let i = 0; i < state.colorGrid.length; i++) {
        const c = state.colorGrid[i];
        if (c === 0) continue;
        const col = state.dim === 1 ? i : i % L;
        const row = state.dim === 1 ? 0 : Math.floor(i / L);
        grid.fillCell(col, row, WALKER_COLORS[c - 1]);
      }
      for (let w = 0; w < 2; w++) {
        const p = state.walkers[w].pos;
        const col = p[0];
        const row = state.dim === 1 ? 0 : p[1];
        grid.ctx.strokeStyle = "#ffffff";
        grid.ctx.lineWidth = Math.max(1, cellSize * 0.12);
        grid.ctx.strokeRect(col * cellSize + 1, row * cellSize + 1, cellSize - 2, cellSize - 2);
      }
    };

    canvas.addEventListener("click", (evt) => {
      if (state.placing === null) return;
      const cell = grid.eventToCell(evt);
      if (!cell) return;
      placeWalker(state.placing, state.dim === 1 ? [cell.col] : [cell.col, cell.row]);
    });

    const placeWalker = (w, pos) => {
      state.walkers[w].pos = pos;
      const i = idxOf(pos);
      if (state.colorGrid[i] === 0) {
        state.colorGrid[i] = w + 1;
        recordArrival(w);
      }
      syncCoordInputs();
      draw();
      updateStats();
    };

    // ---------- Loop ----------
    const loop = () => {
      for (let i = 0; i < state.stepsPerFrame; i++) {
        stepOnce();
        if (state.done) break;
      }
      draw();
      updateStats();
      if (state.done) { stop(); return; }
      state.raf = requestAnimationFrame(loop);
    };

    const play = () => {
      if (state.playing || state.done) return;
      state.playing = true;
      playBtn.textContent = "Pause";
      playBtn.classList.add("active");
      state.raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      state.playing = false;
      playBtn.textContent = "Play";
      playBtn.classList.remove("active");
      cancelAnimationFrame(state.raf);
    };

    const resetAll = () => {
      stop();
      defaultPositions();
      initGrid();
      syncCoordInputs();
      draw();
      updateStats();
    };
    const resetColorsOnly = () => {
      stop();
      initGrid();
      draw();
      updateStats();
    };

    // ---------- Live stats (area1/area2/interface length) ----------
    const statsEl = el("p", { class: "hint" }, "");
    const doneEl = el("p", { class: "hint", style: { color: "#7bd88f" } }, "");

    const computeInterfaceLen = () => {
      const L = state.L;
      let interfaceLen = 0;
      if (state.dim === 1) {
        for (let i = 0; i < L; i++) {
          const c = state.colorGrid[i], nb = state.colorGrid[(i + 1) % L];
          if (c !== 0 && nb !== 0 && c !== nb) interfaceLen++;
        }
      } else {
        for (let y = 0; y < L; y++) {
          for (let x = 0; x < L; x++) {
            const c = state.colorGrid[y * L + x];
            if (c === 0) continue;
            const right = state.colorGrid[y * L + ((x + 1) % L)];
            const down = state.colorGrid[((y + 1) % L) * L + x];
            if (right !== 0 && right !== c) interfaceLen++;
            if (down !== 0 && down !== c) interfaceLen++;
          }
        }
      }
      return interfaceLen;
    };

    const updateStats = () => {
      const total = state.dim === 1 ? state.L : state.L * state.L;
      const colored = state.area[0] + state.area[1];
      const interfaceLen = computeInterfaceLen();
      statsEl.textContent =
        `Steps: ${state.steps}  •  ${WALKER_NAMES[0]} area: ${state.area[0]}  •  ${WALKER_NAMES[1]} area: ${state.area[1]}  •  interface length: ${interfaceLen}  •  colored: ${colored}/${total}`;
      if (!state.done && colored === total) {
        state.done = true;
        doneEl.textContent = "Fully colored — walk stopped.";
      } else if (!state.done) {
        doneEl.textContent = "";
      }
    };

    // ---------- Region / loop analysis (on demand) ----------
    const analysisWrap = el("div", { style: { marginTop: "18px" } });

    const regionSizes = (colorValue) => {
      const L = state.L;
      const n = state.dim === 1 ? L : L * L;
      const visited = new Uint8Array(n);
      const sizes = [];
      const neighborsOf = (i) => {
        if (state.dim === 1) return [(i - 1 + L) % L, (i + 1) % L];
        const x = i % L, y = Math.floor(i / L);
        return [
          ((x - 1 + L) % L) + y * L,
          ((x + 1) % L) + y * L,
          x + (((y - 1 + L) % L)) * L,
          x + (((y + 1) % L)) * L,
        ];
      };
      for (let i = 0; i < n; i++) {
        if (visited[i] || state.colorGrid[i] !== colorValue) continue;
        let size = 0;
        const stack = [i];
        visited[i] = 1;
        while (stack.length) {
          const cur = stack.pop();
          size++;
          for (const nb of neighborsOf(cur)) {
            if (!visited[nb] && state.colorGrid[nb] === colorValue) { visited[nb] = 1; stack.push(nb); }
          }
        }
        sizes.push(size);
      }
      return sizes;
    };

    const interfaceLoopLengths2D = () => {
      const L = state.L;
      const cIdx = (i, j) => (((i % L) + L) % L) + ((((j % L) + L) % L)) * L;
      const uf = makeUF(L * L);
      const edges = [];
      for (let y = 0; y < L; y++) {
        for (let x = 0; x < L; x++) {
          const c = state.colorGrid[y * L + x];
          if (c === 0) continue;
          const right = state.colorGrid[y * L + ((x + 1) % L)];
          if (right !== 0 && right !== c) {
            const a = cIdx(x + 1, y), b = cIdx(x + 1, y + 1);
            edges.push([a, b]); uf.union(a, b);
          }
          const down = state.colorGrid[((y + 1) % L) * L + x];
          if (down !== 0 && down !== c) {
            const a = cIdx(x, y + 1), b = cIdx(x + 1, y + 1);
            edges.push([a, b]); uf.union(a, b);
          }
        }
      }
      const counts = new Map();
      for (const [a] of edges) {
        const r = uf.find(a);
        counts.set(r, (counts.get(r) || 0) + 1);
      }
      return Array.from(counts.values());
    };

    const runAnalysis = () => {
      analysisWrap.innerHTML = "";
      const sizes1 = regionSizes(1);
      const sizes2 = regionSizes(2);

      const mkHistBlock = (title, values, color) => {
        const c = el("canvas", { width: "250", height: "150" });
        const wrap = el("div", {}, [
          el("p", { class: "hint" }, `${title}: ${values.length} region${values.length === 1 ? "" : "s"}`),
          c,
        ]);
        drawHistogram(c, values, color, "region size");
        return wrap;
      };

      const row = el("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap" } }, [
        mkHistBlock(`${WALKER_NAMES[0]} regions`, sizes1, WALKER_COLORS[0]),
        mkHistBlock(`${WALKER_NAMES[1]} regions`, sizes2, WALKER_COLORS[1]),
      ]);

      if (state.dim === 2) {
        const loops = interfaceLoopLengths2D();
        const c = el("canvas", { width: "250", height: "150" });
        row.appendChild(el("div", {}, [
          el("p", { class: "hint" }, `Interface loops: ${loops.length} loop${loops.length === 1 ? "" : "s"}`),
          c,
        ]));
        drawHistogram(c, loops, "#f4d35e", "loop length (edges)");
      }

      analysisWrap.appendChild(el("h3", { style: { fontSize: "14px", margin: "0 0 8px" } }, "Region & interface analysis"));
      analysisWrap.appendChild(row);
    };

    // ---------- Coordinate inputs ----------
    const x1Input = el("input", { type: "number", min: "1" });
    const y1Input = el("input", { type: "number", min: "1" });
    const x2Input = el("input", { type: "number", min: "1" });
    const y2Input = el("input", { type: "number", min: "1" });
    const y1Row = el("div", { class: "control-row" }, [el("label", {}, `${WALKER_NAMES[0]} y (1..L)`), y1Input]);
    const y2Row = el("div", { class: "control-row" }, [el("label", {}, `${WALKER_NAMES[1]} y (1..L)`), y2Input]);

    const syncCoordInputs = () => {
      x1Input.max = String(state.L); y1Input.max = String(state.L);
      x2Input.max = String(state.L); y2Input.max = String(state.L);
      x1Input.value = state.walkers[0].pos[0] + 1;
      x2Input.value = state.walkers[1].pos[0] + 1;
      if (state.dim === 2) {
        y1Input.value = state.walkers[0].pos[1] + 1;
        y2Input.value = state.walkers[1].pos[1] + 1;
      }
      y1Row.style.display = state.dim === 2 ? "" : "none";
      y2Row.style.display = state.dim === 2 ? "" : "none";
    };

    const applyCoords = (w) => {
      const L = state.L;
      const clampCoord = (v) => Math.min(L - 1, Math.max(0, (parseInt(v, 10) || 1) - 1));
      const x = clampCoord(w === 0 ? x1Input.value : x2Input.value);
      const pos = state.dim === 1 ? [x] : [x, clampCoord(w === 0 ? y1Input.value : y2Input.value)];
      placeWalker(w, pos);
    };
    x1Input.addEventListener("change", () => applyCoords(0));
    y1Input.addEventListener("change", () => applyCoords(0));
    x2Input.addEventListener("change", () => applyCoords(1));
    y2Input.addEventListener("change", () => applyCoords(1));

    // ---------- Other controls ----------
    const dimSelect = el("select", {}, [
      el("option", { value: "1" }, "1D"),
      el("option", { value: "2" }, "2D"),
    ]);
    dimSelect.addEventListener("change", () => {
      state.dim = parseInt(dimSelect.value, 10);
      lSlider.max = state.dim === 1 ? "400" : "120";
      state.L = Math.min(state.L, parseInt(lSlider.max, 10));
      lSlider.value = state.L;
      lVal.textContent = String(state.L);
      analysisWrap.innerHTML = "";
      resetAll();
    });

    const lSlider = el("input", { type: "range", min: "5", max: "400", value: state.L });
    const lVal = el("span", { class: "val" }, String(state.L));
    lSlider.addEventListener("input", () => {
      state.L = parseInt(lSlider.value, 10);
      lVal.textContent = String(state.L);
    });
    lSlider.addEventListener("change", () => { analysisWrap.innerHTML = ""; resetAll(); });

    const speedInput = el("input", { type: "range", min: "1", max: "100", value: state.stepsPerFrame });
    const speedVal = el("span", { class: "val" }, String(state.stepsPerFrame));
    speedInput.addEventListener("input", () => {
      state.stepsPerFrame = parseInt(speedInput.value, 10);
      speedVal.textContent = String(state.stepsPerFrame);
    });

    const place1Btn = el("button", {
      class: "btn", style: { borderColor: WALKER_COLORS[0], color: WALKER_COLORS[0] },
      onclick: () => { state.placing = state.placing === 0 ? null : 0; syncPlaceButtons(); },
    }, `Place ${WALKER_NAMES[0]} by click`);
    const place2Btn = el("button", {
      class: "btn", style: { borderColor: WALKER_COLORS[1], color: WALKER_COLORS[1] },
      onclick: () => { state.placing = state.placing === 1 ? null : 1; syncPlaceButtons(); },
    }, `Place ${WALKER_NAMES[1]} by click`);
    const syncPlaceButtons = () => {
      place1Btn.classList.toggle("active", state.placing === 0);
      place2Btn.classList.toggle("active", state.placing === 1);
    };

    const playBtn = el("button", { class: "btn primary", onclick: () => (state.playing ? stop() : play()) }, "Play");
    const stepBtn = el("button", { class: "btn", onclick: () => { stepOnce(); draw(); updateStats(); } }, "Step");
    const resetColorsBtn = el("button", { class: "btn", onclick: resetColorsOnly }, "Reset colors");
    const resetAllBtn = el("button", { class: "btn", onclick: resetAll }, "Reset all");
    const analyzeBtn = el("button", { class: "btn primary", onclick: runAnalysis }, "Analyze regions");

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [el("label", {}, "Dimension"), dimSelect]),
      el("div", { class: "control-row" }, [el("label", {}, ["Torus size L", lVal]), lSlider]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "Position the walkers"),
        el("div", { class: "btn-row" }, [place1Btn, place2Btn]),
      ]),
      el("div", { class: "control-row" }, [el("label", {}, `${WALKER_NAMES[0]} x (1..L)`), x1Input]),
      y1Row,
      el("div", { class: "control-row" }, [el("label", {}, `${WALKER_NAMES[1]} x (1..L)`), x2Input]),
      y2Row,
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [el("label", {}, ["Steps per frame", speedVal]), speedInput]),
      el("div", { class: "btn-row" }, [playBtn, stepBtn]),
      el("div", { class: "btn-row", style: { marginTop: "8px" } }, [resetColorsBtn, resetAllBtn]),
      el("div", { class: "btn-row", style: { marginTop: "8px" } }, [analyzeBtn]),
      statsEl,
      doneEl,
      el("p", { class: "hint" }, "White outline = a walker's current position. Coordinates are 1-indexed. The walk stops automatically once every site is colored."),
    ]);

    defaultPositions();
    initGrid();
    syncCoordInputs();
    draw();
    updateStats();

    const arrivalBlock = el("div", { class: "sim-canvas-wrap", style: { marginTop: "18px", maxWidth: "820px" } }, [
      el("p", { class: "hint", style: { margin: "0 0 6px" } },
        `Arrival process N(t): sites claimed over time (${WALKER_NAMES[0]} in blue, ${WALKER_NAMES[1]} in red). Axes auto-rescale as the walk progresses.`),
      arrivalCanvas,
    ]);

    const wrapper = el("div", {}, [
      el("div", { class: "sim-layout" }, [
        el("div", { class: "sim-canvas-wrap" }, canvas),
        controls,
      ]),
      arrivalBlock,
      analysisWrap,
    ]);
    container.appendChild(wrapper);

    return {
      destroy() { stop(); },
    };
  },
};
