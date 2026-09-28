/* =========================================================
   Random connected N-coloring of an L x L grid, sampled with
   ReCom (REcombination): a Markov chain over connected partitions
   of a planar graph, introduced for political redistricting by
   DeFord, Duchin & Solomon, "Recombination: A Family of Markov
   Chains for Redistricting," Harvard Data Science Review 3(1)
   (2021).

   Each step:
     1. List every pair of colors that currently share an edge of
        the grid, and pick one pair (C_i, C_j) uniformly at random.
     2. Merge their cells into one induced subgraph M = C_i u C_j.
        M is always connected: C_i and C_j are each connected on
        their own, and (by construction) share at least one edge.
     3. Draw a spanning tree T of M uniformly at random, via
        Wilson's algorithm -- repeated loop-erased random walks
        from every vertex not yet attached to the tree, until all
        of M is (D. B. Wilson, "Generating Random Spanning Trees
        More Quickly than the Cover Time," Proc. STOC 1996,
        pp. 296-303).
     4. T has exactly |M| - 1 edges; cut one of them, chosen
        uniformly at random. Removing an edge from a tree always
        splits it into exactly two connected pieces, C_i' and
        C_j' -- the proposed new subdomains.
     5. Accept the proposed recoloring Y (replacing the current
        coloring X) with probability
          min( 1,
               [A(X)/A(Y)]
             * [(tau(C_i) * tau(C_j)) / (tau(C_i') * tau(C_j'))]
             * [k(C_i,C_j) / k(C_i',C_j')] ),
        where A(*) is the number of adjacent color pairs in a
        coloring, tau(*) is the number of spanning trees of an
        induced subgraph -- by Kirchhoff's Matrix-Tree Theorem,
        the determinant of that subgraph's Laplacian matrix with
        any one row and the matching column removed (G. Kirchhoff,
        "Ueber die Aufloesung der Gleichungen, auf welche man bei
        der Untersuchung der linearen Vertheilung galvanischer
        Stroeme gefuehrt wird," Annalen der Physik und Chemie
        72(12) (1847), 497-508; see also Godsil & Royle, Algebraic
        Graph Theory, Springer (2001), Theorem 13.2.3) -- and
        k(A,B) is the number of grid edges directly connecting
        sets A and B. This is a Metropolis-Hastings correction
        (Metropolis, Rosenbluth, Rosenbluth, Teller & Teller,
        "Equation of State Calculations by Fast Computing
        Machines," J. Chem. Phys. 21(6) (1953), 1087-1092;
        Hastings, "Monte Carlo Sampling Methods Using Markov
        Chains and Their Applications," Biometrika 57(1) (1970),
        97-109) for the fact that a merged region with more
        spanning trees, or a boundary with more crossing edges, is
        proposed (and un-proposed) at a different rate than one
        with fewer -- correcting for that rate is exactly what
        makes this chain's stationary distribution the *uniform*
        distribution over connected N-colorings, rather than only
        some distribution that favors connected colorings.

        Every tau and every ratio above is computed in log-space
        (sums/differences of log-determinants and log-counts)
        since spanning-tree counts grow exponentially with region
        size and would overflow a plain double for anything but
        tiny grids; the acceptance draw compares log(uniform(0,1))
        against the log-ratio directly, so nothing is ever
        exponentiated back out of log-space at all.

   This replaces an earlier, cheaper single-cell "flip" chain
   (repeatedly try to recolor one boundary cell to match a
   neighbor), which was also Metropolis-Hastings-corrected for
   uniformity but mixes far more slowly in practice: ReCom's
   tree-based moves can reshape an entire color region in one
   step instead of one cell at a time, which is also why ReCom is
   the standard choice for sampling redistricting plans in
   practice rather than cell-by-cell reassignment chains.

   Performance note: a step's cost is dominated by its four
   Matrix-Tree determinants, each roughly O(size^3) in the cell
   count of the region involved -- fast at this sim's default
   grid size, but the reason its size slider tops out lower than
   this site's other cellular sims, and why a step can visibly
   pause once a color has grown to cover a large share of the
   grid (nothing stops one color from doing so; this chain, as
   specified, has no population-balance constraint added on top).

   Starting configuration: the grid starts as N compact, roughly-
   square blocks (buildBlockPartition below), not N thin stripes.
   This isn't cosmetic -- it's close to load-bearing. A region's
   spanning-tree count tau grows sharply with how compact it is
   (a solid block packs far more internal grid edges, hence far
   more spanning trees, than a thread-thin strip of the same
   area -- empirically an *exponential* relationship in the
   region's boundary length: Clelland, Bossenbroek, Heckmaster,
   Nelson, Rock & VanAusdall, "Compactness statistics for
   spanning tree recombination," arXiv:2103.02699 (2021)). Since
   this chain's acceptance probability above is weighted by
   tau(C_i)*tau(C_j) / (tau(C_i')*tau(C_j')), starting from N
   extremely thin stripes (tau near its minimum for that area)
   makes almost every proposed recombination -- which, left to
   its own devices, tends to propose more "typical", higher-tau
   splits -- land far out on the low side of that ratio, so
   log(alpha) comes out hugely negative and step after step gets
   rejected outright. Starting compact instead avoids that cliff:
   these blocks are already much closer to a "typical" shape
   under the target measure, so ordinary proposals land within
   reach of ratio 1 and actually get accepted.
   ========================================================= */

import { CanvasGrid } from "../lib/grid.js";
import { randInt, paletteColor, el } from "../lib/utils.js";

const CANVAS_PX = 560;
const FASTFORWARD_STEPS = 100;

/** Partition the L x L grid into N connected color blocks arranged as a
 *  roughly-square grid of roughly-square rectangles -- e.g. N=20 on a
 *  40x40 grid gives 4 rows of 5 blocks, each about 10x8, rather than 20
 *  one-cell-wide stripes. See the "Starting configuration" note in the
 *  file header for why this compact start matters for ReCom specifically
 *  (a thin-stripe start makes essentially every proposal get rejected). */
function buildBlockPartition(L, N) {
  const colorGrid = new Int32Array(L * L);
  const R = Math.max(1, Math.min(N, Math.round(Math.sqrt(N))));

  const bandRows = new Array(R);
  { const base = Math.floor(L / R), rem = L % R; for (let b = 0; b < R; b++) bandRows[b] = base + (b < rem ? 1 : 0); }
  const bandCols = new Array(R);
  { const base = Math.floor(N / R), rem = N % R; for (let b = 0; b < R; b++) bandCols[b] = base + (b < rem ? 1 : 0); }

  let rowStart = 0, colorId = 0;
  for (let b = 0; b < R; b++) {
    const h = bandRows[b];
    const cols = bandCols[b];
    const base = Math.floor(L / cols), rem = L % cols;
    let colStart = 0;
    for (let c = 0; c < cols; c++) {
      const w = base + (c < rem ? 1 : 0);
      for (let y = rowStart; y < rowStart + h; y++) {
        for (let x = colStart; x < colStart + w; x++) {
          colorGrid[y * L + x] = colorId;
        }
      }
      colorId++;
      colStart += w;
    }
    rowStart += h;
  }
  return colorGrid;
}

function neighborsOf(i, L) {
  const x = i % L, y = (i - x) / L;
  const list = [];
  if (x > 0) list.push(i - 1);
  if (x < L - 1) list.push(i + 1);
  if (y > 0) list.push(i - L);
  if (y < L - 1) list.push(i + L);
  return list;
}

/** Every distinct pair of colors [a, b] (a < b) that share at least one
 *  grid edge in the current coloring. */
function getAdjacentColorPairs(colorGrid, L) {
  const seen = new Set();
  const pairs = [];
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      const ci = colorGrid[i];
      if (x < L - 1) {
        const cj = colorGrid[i + 1];
        if (cj !== ci) {
          const a = Math.min(ci, cj), b = Math.max(ci, cj);
          const key = a * 100000 + b;
          if (!seen.has(key)) { seen.add(key); pairs.push([a, b]); }
        }
      }
      if (y < L - 1) {
        const cj = colorGrid[i + L];
        if (cj !== ci) {
          const a = Math.min(ci, cj), b = Math.max(ci, cj);
          const key = a * 100000 + b;
          if (!seen.has(key)) { seen.add(key); pairs.push([a, b]); }
        }
      }
    }
  }
  return pairs;
}

/** Number of grid edges with one endpoint in vertsA and the other flagged
 *  in inBFlag (a Uint8Array over all L*L cells, 1 where the "B" side is). */
function countCrossEdges(vertsA, inBFlag, L) {
  let count = 0;
  for (const v of vertsA) {
    for (const nb of neighborsOf(v, L)) {
      if (inBFlag[nb]) count++;
    }
  }
  return count;
}

/** A uniformly-random spanning tree of the subgraph induced on `vertices`
 *  (all flagged in `inFlag`, a Uint8Array over all L*L cells), via
 *  Wilson's algorithm: repeated loop-erased random walks from every
 *  vertex not yet attached to the tree, until all of them are (see the
 *  file header for the citation). Returns a list of |vertices|-1 edges
 *  [u, v] (cell indices); [] if `vertices` has fewer than 2 elements. */
function uniformSpanningTree(vertices, inFlag, L) {
  const m = vertices.length;
  if (m <= 1) return [];
  const inTree = new Set();
  const root = vertices[randInt(0, m)];
  inTree.add(root);
  const next = new Map();
  for (const start of vertices) {
    if (inTree.has(start)) continue;
    let u = start;
    while (!inTree.has(u)) {
      const nbrs = neighborsOf(u, L).filter((nb) => inFlag[nb]);
      next.set(u, nbrs[randInt(0, nbrs.length)]);
      u = next.get(u);
    }
    u = start;
    while (!inTree.has(u)) {
      inTree.add(u);
      u = next.get(u);
    }
  }
  const edges = [];
  for (const v of vertices) {
    if (v !== root) edges.push([v, next.get(v)]);
  }
  return edges;
}

/** log(|determinant|) of an explicit `size` x `size` matrix (an array of
 *  Float64Array rows), via Gaussian elimination with partial pivoting.
 *  Used only on reduced graph Laplacians, whose determinant (a spanning-
 *  tree count, by Kirchhoff's theorem) is always a positive integer for
 *  the connected vertex sets this sim ever calls it on -- so the sign
 *  flips from row swaps are never actually significant here, only the
 *  magnitude, which is why only log(|pivot|) is accumulated. */
function logDeterminant(rows, size) {
  if (size === 0) return 0; // det of the empty (0x0) matrix is 1 by convention
  const A = rows.map((r) => Float64Array.from(r));
  let logDet = 0;
  for (let col = 0; col < size; col++) {
    let piv = col;
    let maxAbs = Math.abs(A[col][col]);
    for (let r = col + 1; r < size; r++) {
      const av = Math.abs(A[r][col]);
      if (av > maxAbs) { maxAbs = av; piv = r; }
    }
    if (maxAbs < 1e-9) return -Infinity; // singular -- shouldn't happen for a connected subgraph
    if (piv !== col) { const tmp = A[col]; A[col] = A[piv]; A[piv] = tmp; }
    const pivotVal = A[col][col];
    logDet += Math.log(Math.abs(pivotVal));
    for (let r = col + 1; r < size; r++) {
      const factor = A[r][col] / pivotVal;
      if (factor !== 0) {
        for (let c = col; c < size; c++) A[r][c] -= factor * A[col][c];
      }
    }
  }
  return logDet;
}

/** log of the number of spanning trees of the subgraph induced by
 *  `vertices` -- Kirchhoff's Matrix-Tree Theorem, see the file header.
 *  A single vertex has exactly one (empty) spanning tree, so log(1) = 0
 *  is returned directly, without building a matrix at all. */
function logSpanningTreeCount(vertices, L) {
  const m = vertices.length;
  if (m <= 1) return 0;
  const localIndex = new Map();
  for (let k = 0; k < m; k++) localIndex.set(vertices[k], k);
  const full = [];
  for (let k = 0; k < m; k++) full.push(new Float64Array(m));
  for (let k = 0; k < m; k++) {
    const v = vertices[k];
    let deg = 0;
    for (const nb of neighborsOf(v, L)) {
      const li = localIndex.get(nb);
      if (li !== undefined) {
        deg++;
        full[k][li] -= 1;
      }
    }
    full[k][k] += deg;
  }
  const reduced = [];
  for (let r = 1; r < m; r++) {
    const row = new Float64Array(m - 1);
    for (let c = 1; c < m; c++) row[c - 1] = full[r][c];
    reduced.push(row);
  }
  return logDeterminant(reduced, m - 1);
}

export default {
  id: "connectedcoloring",
  name: "Random Connected Coloring",
  category: "Trees, graphs & combinatorics",
  description:
    "Among all ways to color an L×L grid with N colors so every color forms one connected region, sample one via ReCom -- a Markov chain that merges two adjacent colors, redraws the pair with a uniform random spanning tree, and cuts it, corrected to target the exact uniform distribution.",

  mount(container) {
    const state = {
      L: 24,
      N: 6,
      colorGrid: null,
      colorCounts: null,
      steps: 0,
      attempts: 0,
      lastLogAlpha: null,
      playing: false,
      stepsPerFrame: 1,
      raf: null,
    };

    const total = () => state.L * state.L;

    const recomputeColorCounts = () => {
      const counts = new Array(state.N).fill(0);
      for (let i = 0; i < state.colorGrid.length; i++) counts[state.colorGrid[i]]++;
      state.colorCounts = counts;
    };

    const initGrid = () => {
      state.colorGrid = buildBlockPartition(state.L, state.N);
      recomputeColorCounts();
      state.steps = 0;
      state.attempts = 0;
      state.lastLogAlpha = null;
    };

    // One ReCom step: see the file header for the full derivation.
    const attemptRecomStep = () => {
      state.attempts++;
      const L = state.L;
      const colorGrid = state.colorGrid;
      const n = total();

      const pairsX = getAdjacentColorPairs(colorGrid, L);
      const AX = pairsX.length;
      if (AX === 0) return false; // only possible with a single color present

      const [ci, cj] = pairsX[randInt(0, AX)];

      const Cin = [];
      const Cjn = [];
      for (let v = 0; v < n; v++) {
        if (colorGrid[v] === ci) Cin.push(v);
        else if (colorGrid[v] === cj) Cjn.push(v);
      }
      const Mvertices = Cin.concat(Cjn);
      const inM = new Uint8Array(n);
      for (const v of Mvertices) inM[v] = 1;

      const treeEdges = uniformSpanningTree(Mvertices, inM, L);
      if (treeEdges.length !== Mvertices.length - 1) return false; // defensive; M is always connected by construction

      const cutIdx = randInt(0, treeEdges.length);
      const treeAdj = new Map();
      for (const v of Mvertices) treeAdj.set(v, []);
      for (let k = 0; k < treeEdges.length; k++) {
        if (k === cutIdx) continue;
        const [a, b] = treeEdges[k];
        treeAdj.get(a).push(b);
        treeAdj.get(b).push(a);
      }
      const comp1Flag = new Uint8Array(n);
      const comp1 = [];
      const startV = treeEdges[cutIdx][0];
      comp1Flag[startV] = 1;
      const stack = [startV];
      while (stack.length) {
        const cur = stack.pop();
        comp1.push(cur);
        for (const nb of treeAdj.get(cur)) {
          if (!comp1Flag[nb]) { comp1Flag[nb] = 1; stack.push(nb); }
        }
      }
      const comp2 = [];
      const inComp2 = new Uint8Array(n);
      for (const v of Mvertices) {
        if (!comp1Flag[v]) { comp2.push(v); inComp2[v] = 1; }
      }

      // Tentatively recolor (comp1 -> ci, comp2 -> cj) to measure A(Y);
      // reverted below if the move ends up rejected.
      const saved = new Int32Array(Mvertices.length);
      for (let k = 0; k < Mvertices.length; k++) saved[k] = colorGrid[Mvertices[k]];
      for (const v of comp1) colorGrid[v] = ci;
      for (const v of comp2) colorGrid[v] = cj;
      const AY = getAdjacentColorPairs(colorGrid, L).length;

      const inCj = new Uint8Array(n);
      for (const v of Cjn) inCj[v] = 1;
      const kOriginal = countCrossEdges(Cin, inCj, L);
      const kProposed = countCrossEdges(comp1, inComp2, L);

      const logTauI = logSpanningTreeCount(Cin, L);
      const logTauJ = logSpanningTreeCount(Cjn, L);
      const logTauIp = logSpanningTreeCount(comp1, L);
      const logTauJp = logSpanningTreeCount(comp2, L);

      const logAlpha =
        (Math.log(AX) - Math.log(AY)) +
        ((logTauI + logTauJ) - (logTauIp + logTauJp)) +
        (Math.log(kOriginal) - Math.log(kProposed));
      state.lastLogAlpha = logAlpha;

      const accept = logAlpha >= 0 || Math.log(Math.random()) < logAlpha;
      if (!accept) {
        for (let k = 0; k < Mvertices.length; k++) colorGrid[Mvertices[k]] = saved[k];
        return false;
      }

      recomputeColorCounts();
      state.steps++;
      return true;
    };

    // ---------- Drawing ----------
    const canvas = el("canvas");
    const grid = new CanvasGrid(canvas, state.L, state.L, 10);
    const sizesCanvas = el("canvas", { width: "260", height: "90" });

    const draw = () => {
      const cellSize = Math.max(2, Math.min(26, CANVAS_PX / state.L));
      grid.resize(state.L, state.L, cellSize);
      for (let y = 0; y < state.L; y++) {
        for (let x = 0; x < state.L; x++) {
          grid.fillCell(x, y, paletteColor(state.colorGrid[y * state.L + x], state.N));
        }
      }
      drawSizes();
    };

    const drawSizes = () => {
      const ctx = sizesCanvas.getContext("2d");
      const W = sizesCanvas.width, H = sizesCanvas.height;
      ctx.fillStyle = "#161922";
      ctx.fillRect(0, 0, W, H);
      const N = state.N;
      const maxC = Math.max(...state.colorCounts, 1);
      const barW = W / N;
      for (let i = 0; i < N; i++) {
        const h = (state.colorCounts[i] / maxC) * (H - 4);
        ctx.fillStyle = paletteColor(i, N);
        ctx.fillRect(i * barW + 1, H - h, Math.max(1, barW - 2), h);
      }
    };

    // ---------- Loop ----------
    const loop = () => {
      for (let i = 0; i < state.stepsPerFrame; i++) attemptRecomStep();
      draw();
      updateStats();
      state.raf = requestAnimationFrame(loop);
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
    const reset = () => {
      stop();
      initGrid();
      draw();
      updateStats();
    };
    const fastForward = () => {
      for (let i = 0; i < FASTFORWARD_STEPS; i++) attemptRecomStep();
      draw();
      updateStats();
    };

    const statsEl = el("p", { class: "hint" }, "");
    const updateStats = () => {
      const rate = state.attempts ? ((state.steps / state.attempts) * 100).toFixed(1) : "0.0";
      const alphaStr = Number.isFinite(state.lastLogAlpha) ? state.lastLogAlpha.toFixed(2) : "—";
      statsEl.textContent =
        `Accepted ReCom steps: ${state.steps}  •  proposals: ${state.attempts} (${rate}% accepted)  •  last log-acceptance: ${alphaStr}`;
    };

    // ---------- Controls ----------
    const lInput = el("input", { type: "number", min: "4", max: "100", value: state.L });
    const nInput = el("input", { type: "number", min: "2", max: String(state.L * state.L), value: state.N });
    lInput.addEventListener("change", () => {
      state.L = Math.max(4, Math.min(100, parseInt(lInput.value, 10) || 24));
      lInput.value = state.L;
      nInput.max = String(state.L * state.L);
      state.N = Math.max(2, Math.min(state.L * state.L, state.N));
      nInput.value = state.N;
      reset();
    });
    nInput.addEventListener("change", () => {
      state.N = Math.max(2, Math.min(state.L * state.L, parseInt(nInput.value, 10) || 2));
      nInput.value = state.N;
      reset();
    });

    const speedInput = el("input", { type: "range", min: "1", max: "20", value: state.stepsPerFrame });
    const speedVal = el("span", { class: "val" }, String(state.stepsPerFrame));
    speedInput.addEventListener("input", () => {
      state.stepsPerFrame = parseInt(speedInput.value, 10);
      speedVal.textContent = String(state.stepsPerFrame);
    });

    const playBtn = el("button", { class: "btn primary", onclick: () => (state.playing ? stop() : play()) }, "Play");
    const stepBtn = el("button", { class: "btn", onclick: () => { attemptRecomStep(); draw(); updateStats(); } }, "Step");
    const ffBtn = el("button", { class: "btn", onclick: fastForward }, `+${FASTFORWARD_STEPS} steps`);
    const resetBtn = el("button", { class: "btn", onclick: reset }, "New start (same L, N)");

    const controls = el("div", { class: "controls" }, [
      el("div", { class: "control-row" }, [el("label", {}, "Grid size L"), lInput]),
      el("div", { class: "control-row" }, [el("label", {}, "Number of colors N"), nInput]),
      el("div", { class: "control-divider" }),
      el("div", { class: "control-row" }, [el("label", {}, ["ReCom steps per frame", speedVal]), speedInput]),
      el("div", { class: "btn-row" }, [playBtn, stepBtn]),
      el("div", { class: "btn-row", style: { marginTop: "8px" } }, [ffBtn, resetBtn]),
      statsEl,
      el("div", { class: "control-row" }, [el("label", {}, "Color class sizes"), sizesCanvas]),
      el("p", { class: "hint" },
        "Each step merges a random pair of adjacent colors, draws a uniformly random spanning tree of the merged region (Wilson's algorithm), and cuts a random edge of that tree to split it back into two regions -- accepted or rejected with a Metropolis–Hastings probability built from exact spanning-tree counts (Kirchhoff's Matrix-Tree Theorem) and boundary-edge counts, so that in the long run this samples exactly uniformly among connected N-colorings, not just approximately so. See the file header for the full derivation and citations."),
      el("p", { class: "hint" },
        "Each step's cost grows roughly with the cube of the merged region's cell count (it needs four spanning-tree-count determinants), which is why the grid size here tops out lower than this site's other cellular sims, and why a step can visibly pause if one color has grown to cover a large share of the grid."),
      el("p", { class: "hint" },
        "The grid starts as N compact blocks rather than N thin stripes on purpose: a thin, spread-out color has an unusually low spanning-tree count for its size, so almost every proposed recombination out of a stripy start gets rejected by the acceptance step above. Starting compact keeps proposals within reach of being accepted from the first step. See the file header's \"Starting configuration\" note for why."),
    ]);

    reset();

    const wrapper = el("div", { class: "sim-layout" }, [
      el("div", { class: "sim-canvas-wrap" }, canvas),
      controls,
    ]);
    container.appendChild(wrapper);

    return {
      destroy() { stop(); },
    };
  },
};
