/* =========================================================
   Random block growth (generalized).

   S_0 = {0} ∪ T, where T is any finite subset of Z^d (a "tile"),
   chosen interactively below. X_0 = 0. For n >= 1, X_n ~ Unif(S_{n-1}),
   H(x,n) = #{k <= n : X_k = x}, and S_n = S_{n-1} ∪ (X_n + T).

   D_n = {x : H(x,n) > 0} is the "grown" region; S_n \\ D_n is its
   boundary (cells adjacent to something grown, but not grown themselves
   yet). The default tile T = {±e_1, ..., ±e_d} reproduces the classic
   1D "random block stack" (ported from RandBlockStack.py) and its 2D
   analogue; any other tile can be designed interactively and grows a
   different-shaped mountain.
   ========================================================= */

import { CanvasGrid } from "../lib/grid.js";
import { randInt, heatColor, el, clamp } from "../lib/utils.js";

const CANVAS_PX = 560;

function defaultTile(dim) {
  return dim === 1 ? [[-1], [1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
}

function keyOf(dim, p) {
  return dim === 1 ? p[0] : `${p[0]},${p[1]}`;
}

function pointOf(dim, key) {
  if (dim === 1) return [key];
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

export default {
  id: "blockgrowth",
  name: "Random Block Growth",
  category: "Growth & percolation",
  description:
    "A random growth process: at each step a site is chosen uniformly from the current filled region and its boundary, gets stacked one higher, and spreads a user-designed tile of neighbors into the boundary. Design your own tile and watch the mountain grow differently.",

  mount(container) {
    const state = {
      dim: 1,
      tile: defaultTile(1),
      cells: new Map(), // key -> height
      sList: [], // keys currently in S (grown or boundary)
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      steps: 0,
      maxHeight: 1,
      playing: false,
      stepsPerFrame: 15,
      raf: null,
    };

    // ---------- Core process ----------

    const addToS = (p) => {
      const k = keyOf(state.dim, p);
      if (state.cells.has(k)) return;
      state.cells.set(k, 0);
      state.sList.push(k);
      const [x, y = 0] = p;
      state.bounds.minX = Math.min(state.bounds.minX, x);
      state.bounds.maxX = Math.max(state.bounds.maxX, x);
      state.bounds.minY = Math.min(state.bounds.minY, y);
      state.bounds.maxY = Math.max(state.bounds.maxY, y);
    };

    const initProcess = () => {
      state.cells = new Map();
      state.sList = [];
      state.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      state.steps = 0;
      state.maxHeight = 1;
      const origin = state.dim === 1 ? [0] : [0, 0];
      addToS(origin);
      state.cells.set(keyOf(state.dim, origin), 1); // H(0,0) = 1
      for (const t of state.tile) addToS(t);
    };

    const stepOnce = () => {
      const idx = randInt(0, state.sList.length);
      const key = state.sList[idx];
      const h = state.cells.get(key) + 1;
      state.cells.set(key, h);
      if (h > state.maxHeight) state.maxHeight = h;
      const p = pointOf(state.dim, key);
      for (const t of state.tile) {
        const np = state.dim === 1 ? [p[0] + t[0]] : [p[0] + t[0], p[1] + t[1]];
        addToS(np);
      }
      state.steps++;
    };

    // ---------- Drawing ----------

    const canvas = el("canvas");
    const ctx = canvas.getContext("2d");
    const grid2d = new CanvasGrid(canvas, 1, 1, 10);

    const draw1D = () => {
      const { minX, maxX } = state.bounds;
      const pad = 1;
      const lo = minX - pad, hi = maxX + pad;
      const cols = hi - lo + 1;
      const W = Math.max(CANVAS_PX, cols * 3);
      const H = 420;
      canvas.width = W;
      canvas.height = H;
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, W, H);
      const barW = W / cols;
      const maxH = Math.max(state.maxHeight, 1);
      const usableH = H - 20;
      for (const [key, h] of state.cells) {
        if (h <= 0) continue;
        const x = key;
        const col = x - lo;
        const barH = (h / maxH) * usableH;
        ctx.fillStyle = heatColor(h / maxH);
        ctx.fillRect(col * barW, H - barH, Math.max(1, barW - 1), barH);
      }
      // baseline
      ctx.strokeStyle = "#2a2f3d";
      ctx.beginPath();
      ctx.moveTo(0, H - 0.5);
      ctx.lineTo(W, H - 0.5);
      ctx.stroke();
    };

    const draw2D = () => {
      const { minX, maxX, minY, maxY } = state.bounds;
      const pad = 1;
      const cols = maxX - minX + 1 + pad * 2;
      const rows = maxY - minY + 1 + pad * 2;
      const cellSize = Math.max(2, Math.min(26, CANVAS_PX / Math.max(cols, rows)));
      grid2d.resize(cols, rows, cellSize);
      grid2d.clear("#0f1115");
      const maxH = Math.max(state.maxHeight, 1);
      for (const [key, h] of state.cells) {
        if (h <= 0) continue;
        const [x, y] = pointOf(2, key);
        const col = x - minX + pad;
        const row = maxY - y + pad; // flip so +y is up
        grid2d.fillCell(col, row, heatColor(h / maxH));
      }
    };

    const draw = () => (state.dim === 1 ? draw1D() : draw2D());

    const loop = () => {
      for (let i = 0; i < state.stepsPerFrame; i++) stepOnce();
      draw();
      updateStats();
      state.raf = requestAnimationFrame(loop);
    };

    const reset = () => {
      stop();
      initProcess();
      draw();
      updateStats();
    };

    const play = () => {
      if (state.playing) return;
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

    // ---------- Stats ----------
    const statsEl = el("p", { class: "hint" }, "");
    const updateStats = () => {
      statsEl.textContent =
        `Steps: ${state.steps}  •  |S|: ${state.cells.size}  •  max height: ${state.maxHeight}`;
    };

    // ---------- Tile editor ----------
    const K1 = 10, K2 = 5; // 1D offsets -K1..K1 ; 2D offsets -K2..K2 square (clickable preview grid only --
    // the radius generator below can build a tile far bigger than this preview, see note above applyTile)
    let editSet = new Set(state.tile.map((t) => keyOf(state.dim, t)));
    const tileEditorWrap = el("div");

    const renderTileEditor = () => {
      tileEditorWrap.innerHTML = "";
      const grid = el("div", {
        style: {
          display: "grid",
          gap: "3px",
          gridTemplateColumns: state.dim === 1
            ? `repeat(${K1 * 2 + 1}, 1fr)`
            : `repeat(${K2 * 2 + 1}, 1fr)`,
          marginBottom: "10px",
        },
      });

      const makeCell = (p, disabled) => {
        const k = keyOf(state.dim, p);
        const btn = el("button", {
          style: {
            width: "100%",
            aspectRatio: "1",
            border: "1px solid var(--border)",
            borderRadius: "3px",
            background: disabled ? "#333846" : (editSet.has(k) ? "#5eb1ff" : "#12141b"),
            cursor: disabled ? "default" : "pointer",
            padding: "0",
          },
          title: disabled ? "origin" : `(${p.join(", ")})`,
          onclick: disabled ? undefined : () => {
            if (editSet.has(k)) editSet.delete(k); else editSet.add(k);
            renderTileEditor();
          },
        });
        return btn;
      };

      if (state.dim === 1) {
        for (let dx = -K1; dx <= K1; dx++) {
          grid.appendChild(makeCell([dx], dx === 0));
        }
      } else {
        for (let dy = K2; dy >= -K2; dy--) {
          for (let dx = -K2; dx <= K2; dx++) {
            grid.appendChild(makeCell([dx, dy], dx === 0 && dy === 0));
          }
        }
      }
      tileEditorWrap.appendChild(grid);
    };

    const applyTile = () => {
      state.tile = Array.from(editSet).map((k) => pointOf(state.dim, k));
      reset();
    };

    const setPreset = (points) => {
      editSet = new Set(points.map((p) => keyOf(state.dim, p)));
      renderTileEditor();
    };

    const presets1D = [
      ["Nearest ±1 (default)", () => [[-1], [1]]],
      ["±1, ±2", () => [[-2], [-1], [1], [2]]],
      ["Right-only", () => [[1]]],
      ["Random", () => {
        const opts = []; for (let d = -K1; d <= K1; d++) if (d !== 0) opts.push([d]);
        opts.sort(() => Math.random() - 0.5);
        return opts.slice(0, 3);
      }],
    ];
    const presets2D = [
      ["Plus / von Neumann (default)", () => [[1, 0], [-1, 0], [0, 1], [0, -1]]],
      ["Square / Moore (8)", () => {
        const pts = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) pts.push([dx, dy]);
        return pts;
      }],
      ["Disk r=2", () => {
        const pts = [];
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if ((dx || dy) && dx * dx + dy * dy <= 4) pts.push([dx, dy]);
        return pts;
      }],
      ["Diagonals (X)", () => [[1, 1], [1, -1], [-1, 1], [-1, -1]]],
      ["Random", () => {
        const opts = [];
        for (let dx = -K2; dx <= K2; dx++) for (let dy = -K2; dy <= K2; dy++) if (dx || dy) opts.push([dx, dy]);
        opts.sort(() => Math.random() - 0.5);
        return opts.slice(0, 6);
      }],
    ];

    const presetRow = el("div", { class: "btn-row", style: { marginBottom: "10px" } });
    const buildPresetButtons = () => {
      presetRow.innerHTML = "";
      const presets = state.dim === 1 ? presets1D : presets2D;
      for (const [label, fn] of presets) {
        presetRow.appendChild(el("button", {
          class: "btn",
          onclick: () => setPreset(fn()),
        }, label));
      }
    };

    // A tile point p only ever enters S as (some already-filled parent) + t
    // for t in T, so every newly-filled cell sits within T's own reach of
    // ITS parent -- but that parent can be an old, out-of-the-way cell, so
    // with a wide enough T the next fill can still land far from the rest
    // of the *current* blob. The small click grid below is deliberately
    // just a preview window (its range is K1/K2, for hand-designing a
    // shape); this generator builds a tile of any radius, well past what's
    // practical to click cell-by-cell, so a genuinely wide-reaching T (and
    // the long jumps it enables) is actually reachable.
    const radiusInput = el("input", { type: "number", min: "1", max: "60", value: "2", style: { width: "70px" } });
    const generateRadiusTile = () => {
      const r = clamp(parseInt(radiusInput.value, 10) || 1, 1, 60);
      let pts;
      if (state.dim === 1) {
        pts = [];
        for (let d = -r; d <= r; d++) if (d !== 0) pts.push([d]);
      } else {
        pts = [];
        const r2 = r * r;
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if ((dx || dy) && dx * dx + dy * dy <= r2) pts.push([dx, dy]);
          }
        }
      }
      setPreset(pts);
    };
    const radiusLabel = el("label", {}, "");
    const updateRadiusLabel = () => {
      radiusLabel.textContent = state.dim === 1
        ? "Custom reach ±r (beyond the grid above)"
        : "Custom disk radius r (beyond the grid above)";
    };
    updateRadiusLabel();
    const radiusRow = el("div", { class: "control-row" }, [
      radiusLabel,
      el("div", { class: "btn-row" }, [
        radiusInput,
        el("button", { class: "btn", onclick: generateRadiusTile }, "Generate disk"),
      ]),
      el("p", { class: "hint" }, "A big radius means a big |T| -- each step adds up to |T| new cells to S. Turn \"Steps per frame\" down for large radii so the tab stays responsive."),
    ]);

    // A FILLED disk of radius r has O(r^2) interior points but only O(r)
    // points on its outer edge, so once that interior fills in, an
    // overwhelming majority of future draws land back on already-filled
    // interior cells (raising height / "stacking") rather than on the
    // thin outer shell (spreading). That's expected, not a bug -- it's
    // why the process is called a "block STACK". A thin RING/annulus
    // tile (only the shell itself, no interior) keeps almost all of its
    // mass at the reach r, so far more draws actually extend the frontier
    // -- much more visible long jumps for the same radius.
    const ringInnerInput = el("input", { type: "number", min: "0", max: "60", value: "2", style: { width: "60px" } });
    const ringOuterInput = el("input", { type: "number", min: "0", max: "60", value: "2", style: { width: "60px" } });
    const generateRingTile = () => {
      let r1 = clamp(parseInt(ringInnerInput.value, 10) || 0, 0, 60);
      let r2 = clamp(parseInt(ringOuterInput.value, 10) || 0, 0, 60);
      if (r1 > r2) [r1, r2] = [r2, r1];
      let pts;
      if (state.dim === 1) {
        pts = [];
        for (let d = -r2; d <= r2; d++) if (d !== 0 && Math.abs(d) >= r1) pts.push([d]);
      } else {
        pts = [];
        const lo2 = r1 * r1, hi2 = r2 * r2;
        for (let dx = -r2; dx <= r2; dx++) {
          for (let dy = -r2; dy <= r2; dy++) {
            const d2 = dx * dx + dy * dy;
            if ((dx || dy) && d2 >= lo2 && d2 <= hi2) pts.push([dx, dy]);
          }
        }
      }
      setPreset(pts);
    };
    const ringRow = el("div", { class: "control-row" }, [
      el("label", {}, "Custom ring: inner r1 to outer r2 (mostly spreading, little stacking)"),
      el("div", { class: "btn-row" }, [
        ringInnerInput, ringOuterInput,
        el("button", { class: "btn", onclick: generateRingTile }, "Generate ring"),
      ]),
    ]);

    // ---------- Controls ----------
    const dimSelect = el("select", {}, [
      el("option", { value: "1" }, "1D"),
      el("option", { value: "2" }, "2D"),
    ]);
    dimSelect.addEventListener("change", () => {
      state.dim = parseInt(dimSelect.value, 10);
      state.tile = defaultTile(state.dim);
      editSet = new Set(state.tile.map((t) => keyOf(state.dim, t)));
      buildPresetButtons();
      renderTileEditor();
      updateRadiusLabel();
      reset();
    });

    const speedInput = el("input", { type: "range", min: "1", max: "400", value: state.stepsPerFrame });
    const speedVal = el("span", { class: "val" }, String(state.stepsPerFrame));
    speedInput.addEventListener("input", () => {
      state.stepsPerFrame = parseInt(speedInput.value, 10);
      speedVal.textContent = String(state.stepsPerFrame);
    });

    const playBtn = el("button", { class: "btn primary", onclick: () => (state.playing ? stop() : play()) }, "Play");
    const stepBtn = el("button", { class: "btn", onclick: () => { stepOnce(); draw(); updateStats(); } }, "Step");
    const resetBtn = el("button", { class: "btn", onclick: reset }, "Reset");
    const applyBtn = el("button", { class: "btn primary", onclick: applyTile }, "Apply tile & reset");

    buildPresetButtons();
    renderTileEditor();

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [el("label", {}, "Dimension"), dimSelect]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, "Tile T (click cells to toggle, then Apply)"),
        tileEditorWrap,
        presetRow,
      ]),
      radiusRow,
      ringRow,
      el("div", { class: "btn-row" }, [applyBtn]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [
        el("label", {}, ["Steps per frame", speedVal]),
        speedInput,
      ]),
      el("div", { class: "btn-row" }, [playBtn, stepBtn, resetBtn]),
      statsEl,
      el("p", { class: "hint" }, "Color encodes height (blue = low, red = tallest). Every step is drawn uniformly over the ENTIRE current S (every cell ever filled or made available, not just the surface of the blob) — but a new cell only ever enters S as (an already-filled cell) + a tile offset, so a freshly-filled cell is always within T's reach of the specific older cell that spawned it, even when that puts it far from wherever the blob has been growing most recently. With the default small tile that reach is just 1, so growth looks Eden-model-local."),
      el("p", { class: "hint" }, "A filled disk of radius r looks like it \"caps out\" at roughly radius r and stops spreading — that's real, and it's not a bug: a disk has O(r²) interior cells but only O(r) cells on its outer edge, so once the interior is filled in, an overwhelming majority of draws land back on already-filled interior cells (raising height, i.e. stacking) rather than the thin outer shell (spreading). Watch the stats line: max height keeps climbing fast while the visible extent barely grows — that's this effect, confirmed. For visible long-range jumps instead of a tall stack, use a thin \"Custom ring\" tile (inner r1 ≈ outer r2) — almost all of its mass sits right at the reach, so most draws actually extend the frontier."),
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
