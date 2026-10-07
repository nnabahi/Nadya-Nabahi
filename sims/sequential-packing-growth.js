/* =====================================================================
   sequential-packing-growth.js  —  the math behind the "Random
   sequential packing" sim (continuous space)
   ---------------------------------------------------------------------
   THE MODEL (nadya's, as on the old site)
     S is a domain and T a tile shape, both typed as conditions in x and
     y, e.g.  S: x^2 + y^2 <= 1,  T: max(|x|, |y|) <= 1. T is centered at
     the origin. rT + C means "T scaled by r, then moved so its center
     is at C". For n = 1, 2, 3, ...
       - C_n is drawn from the density f on S (f = 1 means uniform),
       - R_n = 0 if C_n lands in an earlier tile; otherwise R_n is the
         largest r such that rT + C_n fits inside S without overlapping
         the earlier tiles,
       - tile n is R_n T + C_n. Its PARENT is what stopped it from
         growing: the edge of S (parent -1) or an earlier tile.
     With S = T = the unit disk this is nadya's random gasket:
       R_n = min( 1 - |C_n|,  min_i ( |C_n - C_i| - R_i ) ).

   HOW R_n IS COMPUTED
   (a) T's own ruler. For a vector v, g(v) is the smallest λ with v in
       λT (the "gauge" of T). For the disk g(v) = |v|; for the square
       max(|x|, |y|) <= 1 it is max(|v_x|, |v_y|). A point y is inside
       rT + C exactly when g(y - C) < r (for T star-shaped about its
       center, which growing needs anyway).
   (b) One formula for everything. rT + C overlaps an obstacle (the
       outside of S, or an earlier tile) exactly when some point y on
       the obstacle's edge has g(y - C) < r. [Why: if the two overlap
       and neither holds the other, the inside of rT + C is connected,
       so it must cross the obstacle's edge.] So
           R_n = the smallest g(y - C_n) over all points y on the edge
                 of S and on the edges of the earlier tiles,
       or 0 when C_n is already inside a tile.
   (c) Exact tile distances. When T is convex and symmetric (disk,
       square, ellipse, diamond, ...), the smallest g(y - C) over the
       edge of tile i is exactly g(C - C_i) - R_i, just like the disk
       formula. This uses aT + bT = (a+b)T for convex T (Schneider,
       "Convex Bodies: The Brunn-Minkowski Theory", 2nd ed., Cambridge
       2014, Section 3.1) and that the gauge of a symmetric convex body
       is a norm (Rockafellar, "Convex Analysis", Princeton 1970,
       Section 15). For any other T (not convex, or not symmetric) the
       edge of tile i is searched edge by edge, skipping the parts that
       are too far away to matter. That is slower, but exact for T's
       polygon.
   (d) T is replaced by a polygon with 4096 corners at equally spaced
       angles, each corner found by binary search on T's condition.
       Every step after that is exact for this polygon.
   (e) The edge of S is found once, by "marching squares" (Lorensen &
       Cline, "Marching cubes", SIGGRAPH 1987, the 2D version) on a
       512 x 512 grid: it becomes many short line segments, each end
       pinned down by binary search on S's condition. Segments that cut
       across a curve or a corner are split until they follow the true
       edge to within a millionth of the window. Features of S thinner
       than one grid square can be missed.
   (f) The mesh (nadya's idea): obstacles are filed in nested grids,
       each 4 times finer than the last, every obstacle in the grid
       whose squares match its size. A new center checks the squares
       around it, ring by ring, and stops once the rings are farther
       away than the best R found so far. This is a "hierarchical
       grid" (Ericson, "Real-Time Collision Detection", Morgan Kaufmann
       2005, ch. 7). Each attempt then costs about the same, however
       many tiles there are.

   HOW C_n IS DRAWN
     Rejection sampling (von Neumann, "Various techniques used in
     connection with random digits", 1951; Devroye, "Non-Uniform Random
     Variate Generation", Springer 1986, Section II.3): each square of
     the 512 x 512 grid gets a ceiling M for f, read off f at its
     corners with a safety margin. Pick a square with probability
     proportional to M, a uniform point in it, and keep the point if
     it is in S and a uniform number times M is below f there;
     otherwise try again. This is exactly the density f on S as long
     as f never goes above the ceiling. If it ever does, the count
     "ceilingMisses" goes up, so the page can warn about it. For f = 1
     the ceilings are exact and it is simply uniform on S.

     Every attempt n gets its own random numbers, from the seed and n
     (with seedrandom's "alea" generator,
     https://github.com/davidbau/seedrandom). So dragging the number of
     attempts only adds or removes tiles at the end, and a small change
     to S, T or f moves the picture a little instead of reshuffling it.

   USING THIS FILE
     packingCore() returns an object with
       setup(options)   new S, T, f, window and seed; clears all tiles
       attempt()        do the next attempt (draw C_n, grow its tile)
       addClick(x, y)   the next attempt with a center you clicked
       placeAt(x, y)    the same with a given center (for the checks)
       tiles            the placed tiles (see section 6)
     It uses no library itself; the page passes in its formulas as
     plain functions and the random-number maker. The check page runs
     it directly. The sim page runs it in a Web Worker, through
     packingWorker() at the end of this file (section 8), which reads
     the typed formulas with math.js.

   The code is in numbered sections, all inside packingCore():
     1. The tile shape T: its polygon and its ruler g
     2. The edge of S (marching squares)
     3. Drawing C_n from the density f
     4. The mesh of obstacles
     5. The distance from a center to each kind of obstacle
     6. The tiles, and one attempt
     7. setup
   and, outside packingCore():
     8. packingWorker(): runs it in a second thread for the sim page
   ===================================================================== */

function packingCore() {
  const TAU = 2 * Math.PI;


  /* ===================================================================
     1. THE TILE SHAPE T: ITS POLYGON AND ITS RULER g
     -------------------------------------------------------------------
     Corner k sits at angle θ_k = 2πk/M, at distance rho[k] from the
     center: the farthest point of T in that direction. Between corners
     k and k+1 the polygon edge is a straight line, and there the ruler
     is linear: g(v) = gx[k] * v_x + gy[k] * v_y.
     =================================================================== */
  const M = 4096;                    // corners of T's polygon
  let rho = null, px = null, py = null, gx = null, gy = null;
  let rhoMax = 1;                    // T fits in a disk of this radius
  const cosM = new Float64Array(M), sinM = new Float64Array(M);   // the corner directions θ_k
  for (let k = 0; k < M; k++) { cosM[k] = Math.cos(TAU * k / M); sinM[k] = Math.sin(TAU * k / M); }
  let tMinX = 0, tMaxX = 0, tMinY = 0, tMaxY = 0;   // the smallest box around T
  let areaT = 0;
  let exactTiles = false;            // true when T is convex and symmetric (section 5)

  // How far T reaches in the direction (ux, uy): step out, doubling,
  // until we leave T, then binary search between the last point inside
  // and the first point outside.
  function reach(inT, ux, uy) {
    let lo = 0, hi = 1e-6;
    while (inT(hi * ux, hi * uy) && hi < 1e6) { lo = hi; hi *= 2; }
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (inT(mid * ux, mid * uy)) lo = mid; else hi = mid;
    }
    return lo;
  }

  function buildShape(inT) {
    if (!inT(0, 0)) throw new Error("T must contain its center (0, 0).");
    rho = new Float64Array(M);
    for (let k = 0; k < M; k++) rho[k] = reach(inT, cosM[k], sinM[k]);

    // Symmetric? (Same reach in opposite directions, up to the binary
    // search's rounding.) If so, make it exactly symmetric.
    rhoMax = 0;
    for (let k = 0; k < M; k++) rhoMax = Math.max(rhoMax, rho[k]);
    if (rhoMax === 0) throw new Error("T has no area around its center.");
    let symmetric = true;
    for (let k = 0; k < M / 2; k++) {
      if (Math.abs(rho[k] - rho[k + M / 2]) > 1e-7 * rhoMax) { symmetric = false; break; }
    }
    if (symmetric) {
      for (let k = 0; k < M / 2; k++) rho[k] = rho[k + M / 2] = (rho[k] + rho[k + M / 2]) / 2;
    }

    // The corners, the smallest box around them, and T's area (shoelace formula).
    px = new Float64Array(M); py = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      px[k] = rho[k] * cosM[k];
      py[k] = rho[k] * sinM[k];
    }
    tMinX = Math.min(...px); tMaxX = Math.max(...px);
    tMinY = Math.min(...py); tMaxY = Math.max(...py);
    areaT = 0;
    for (let k = 0; k < M; k++) {
      const j = (k + 1) % M;
      areaT += (px[k] * py[j] - px[j] * py[k]) / 2;
    }

    // The ruler on each edge: the line through corners k and k+1 is
    // { v : cross(v, d) = cross(P_k, d) } with d = P_{k+1} - P_k, and
    // g(v) is the λ that puts v/λ on that line.
    gx = new Float64Array(M); gy = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      const j = (k + 1) % M;
      const dx = px[j] - px[k], dy = py[j] - py[k];
      const den = px[k] * dy - py[k] * dx;
      gx[k] = dy / den;
      gy[k] = -dx / den;
    }

    // Convex? (Every corner turns the same way, up to rounding.)
    let convex = true;
    for (let k = 0; k < M; k++) {
      const a = (k + 1) % M, b = (k + 2) % M;
      const turn = (px[a] - px[k]) * (py[b] - py[a]) - (py[a] - py[k]) * (px[b] - px[a]);
      if (turn < -1e-9 * rhoMax * rhoMax) { convex = false; break; }
    }
    exactTiles = convex && symmetric;
    buildRuns();
  }

  // For tileEdgeDistance: T's polygon edges are grouped into "runs" of
  // RUN_EDGES edges, and those into "big runs" of BIG_RUN runs. Each
  // gets a circle around it (center and radius, in T's own units), so
  // a whole group can be skipped when it is too far away.
  const RUN_EDGES = 16, BIG_RUN = 16;
  let runs = null, bigRuns = null;
  function circleAround(firstCorner, lastCorner) {
    let sx = 0, sy = 0;
    for (let k = firstCorner; k <= lastCorner; k++) { sx += px[k % M]; sy += py[k % M]; }
    sx /= lastCorner - firstCorner + 1; sy /= lastCorner - firstCorner + 1;
    let radius = 0;
    for (let k = firstCorner; k <= lastCorner; k++) radius = Math.max(radius, Math.hypot(px[k % M] - sx, py[k % M] - sy));
    return [sx, sy, radius];
  }
  let most = [];   // the sparse table for mostRho (section 5)
  function buildRuns() {
    most = [rho];
    for (let level = 1; (1 << level) <= M; level++) {
      const prev = most[level - 1], next = new Float64Array(M), half = 1 << (level - 1);
      for (let k = 0; k < M; k++) next[k] = Math.max(prev[k], prev[(k + half) % M]);
      most.push(next);
    }
    runs = []; bigRuns = [];
    for (let k = 0; k < M; k += RUN_EDGES) runs.push(circleAround(k, k + RUN_EDGES));
    for (let k = 0; k < M; k += RUN_EDGES * BIG_RUN) bigRuns.push(circleAround(k, k + RUN_EDGES * BIG_RUN));
  }

  // T's ruler: g(v) = the smallest λ with v in λT.
  function g(vx, vy) {
    let angle = Math.atan2(vy, vx);
    if (angle < 0) angle += TAU;
    let k = Math.floor(angle * M / TAU);
    if (k >= M) k = M - 1;
    return gx[k] * vx + gy[k] * vy;
  }


  /* ===================================================================
     2. THE EDGE OF S (MARCHING SQUARES)
     -------------------------------------------------------------------
     The window (the part of the plane the sim looks at) is covered by
     a grid with one extra square all around, so S \cap window always
     has a closed edge. Each grid corner is marked in or out of S. Where
     a grid line runs from "in" to "out", the edge of S crosses it; the
     crossing point is found by binary search. Each grid square then
     joins its crossing points with one or two line segments.
     =================================================================== */
  const GRID = 512;
  let inSW = null;                  // in S and in the window
  let x0 = 0, y0 = 0, h = 1;        // grid corner (i, j) is at (x0 + i h, y0 + j h)
  let nx = 0, ny = 0;               // grid squares across and up
  let inside = null;                // inside[j * (nx + 1) + i] = 1 if corner (i, j) is in S
  let segments = [];                // the edge of S: [ax, ay, bx, by] for each piece
  let areaS = 0;

  function buildEdge(win) {
    h = Math.max(win.xmax - win.xmin, win.ymax - win.ymin) / GRID;
    x0 = win.xmin - h; y0 = win.ymin - h;
    nx = Math.ceil((win.xmax - win.xmin) / h) + 2;
    ny = Math.ceil((win.ymax - win.ymin) / h) + 2;
    inside = new Uint8Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) inside[j * (nx + 1) + i] = inSW(x0 + i * h, y0 + j * h) ? 1 : 0;
    }
    function isIn(i, j) { return inside[j * (nx + 1) + i] === 1; }

    // The crossing point on the grid line from corner (i1, j1) to its
    // neighbor (i2, j2), remembered so each one is computed once.
    const found = new Map();
    function crossing(i1, j1, i2, j2) {
      const key = (j1 * (nx + 1) + i1) * 2 + (j1 === j2 ? 0 : 1);
      if (found.has(key)) return found.get(key);
      let ax = x0 + i1 * h, ay = y0 + j1 * h, bx = x0 + i2 * h, by = y0 + j2 * h;
      if (!isIn(i1, j1)) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }   // now a is in, b is out
      for (let k = 0; k < 40; k++) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (inSW(mx, my)) { ax = mx; ay = my; } else { bx = mx; by = my; }
      }
      const point = [(ax + bx) / 2, (ay + by) / 2];
      found.set(key, point);
      return point;
    }

    // Each segment is stored with one grid corner next to it, "ref",
    // and whether that corner is in S. The segment is then turned so S
    // is on its left (needed for the area below).
    segments = [];
    function addSegment(p, q, refI, refJ) {
      const rx = x0 + refI * h, ry = y0 + refJ * h;
      const side = (q[0] - p[0]) * (ry - p[1]) - (q[1] - p[1]) * (rx - p[0]);   // > 0: ref is on the left
      if ((side > 0) === isIn(refI, refJ)) segments.push([p[0], p[1], q[0], q[1]]);
      else segments.push([q[0], q[1], p[0], p[1]]);
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // Corners a (bottom left), b (bottom right), c (top right), d (top left).
        const a = isIn(i, j), b = isIn(i + 1, j), c = isIn(i + 1, j + 1), d = isIn(i, j + 1);
        if (a === b && b === c && c === d) continue;
        const bottom = a !== b ? crossing(i, j, i + 1, j) : null;
        const right = b !== c ? crossing(i + 1, j, i + 1, j + 1) : null;
        const top = d !== c ? crossing(i, j + 1, i + 1, j + 1) : null;
        const left = a !== d ? crossing(i, j, i, j + 1) : null;
        const cut = [bottom, right, top, left].filter(Boolean);
        if (cut.length === 2) {
          // One segment; the in-corners are all on one side of it.
          addSegment(cut[0], cut[1], i, j);
        } else {
          // A "saddle": a and c on one side, b and d on the other. The
          // middle of the square decides which two corners are cut off.
          const middle = inSW(x0 + (i + 0.5) * h, y0 + (j + 0.5) * h);
          if (a !== middle) {   // cut off corners a and c
            addSegment(left, bottom, i, j);
            addSegment(right, top, i + 1, j + 1);
          } else {              // cut off corners b and d
            addSegment(bottom, right, i + 1, j);
            addSegment(top, left, i, j + 1);
          }
        }
      }
    }

    // Where the true edge bends (a curve, or a corner of S inside a grid
    // square), a straight segment cuts across it. So look across the
    // middle of each segment for the true edge; if it is more than
    // EDGE_TOLERANCE away, split the segment there, and repeat (at most
    // 12 times). Corners of S are then pinned down closely too.
    const EDGE_TOLERANCE = 1e-6 * GRID * h;
    const straight = segments;
    segments = [];
    function refine(ax, ay, bx, by, depth) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
      if (depth < 12 && len > 0) {
        const nx = -(by - ay) / len, ny = (bx - ax) / len;   // points into S (S is on the left)
        // A point in S and a point out of S on the line across the middle.
        let inX = mx, inY = my, outX = mx - len * nx, outY = my - len * ny;
        if (!inSW(mx, my)) { outX = mx; outY = my; inX = mx + len * nx; inY = my + len * ny; }
        if (inSW(inX, inY) && !inSW(outX, outY)) {
          for (let k = 0; k < 30; k++) {
            const qx = (inX + outX) / 2, qy = (inY + outY) / 2;
            if (inSW(qx, qy)) { inX = qx; inY = qy; } else { outX = qx; outY = qy; }
          }
          const ex = (inX + outX) / 2, ey = (inY + outY) / 2;
          if (Math.hypot(ex - mx, ey - my) > EDGE_TOLERANCE) {
            refine(ax, ay, ex, ey, depth + 1);
            refine(ex, ey, bx, by, depth + 1);
            return;
          }
        }
      }
      segments.push([ax, ay, bx, by]);
    }
    for (const s of straight) refine(s[0], s[1], s[2], s[3], 0);

    // With S on the left of every segment, S's area is (1/2) * the sum
    // of cross(a, b) over the segments (Green's theorem).
    areaS = 0;
    for (const s of segments) areaS += (s[0] * s[3] - s[2] * s[1]) / 2;
    if (segments.length === 0) {
      throw new Error(inside.some(v => v === 1) ? "S has no edge in the window." : "S is empty in the window.");
    }
  }


  /* ===================================================================
     3. DRAWING C_n FROM THE DENSITY f
     -------------------------------------------------------------------
     Every grid square with a corner in S gets a ceiling M for f: the
     largest value at its in-S corners, plus the spread between its
     largest and smallest value as a margin (so a flat f gets an exact
     ceiling). Where f is infinite or undefined at a corner (like
     1/|x| at 0), the ceiling comes from 16 points inside the square,
     doubled. ceiling[] holds the running totals, so a square is picked
     by binary search.
     =================================================================== */
  let density = null;
  let squares = null;         // the grid squares that can hold C_n: index j * nx + i
  let ceilingOf = null;       // each one's ceiling M
  let ceilingSum = null;      // running totals of the ceilings
  let total = 0;              // all the ceilings added up
  let rowEnd = null;          // where each row of squares ends in the list
  let ceilingMisses = 0;      // times f was found above its ceiling
  let negativeF = false;      // f < 0 somewhere (it is then treated as 0)

  function fAt(x, y) {
    const v = Number(density(x, y));
    if (v < 0) { negativeF = true; return 0; }
    return v;
  }

  function buildSampler() {
    negativeF = false;
    // f at every in-S grid corner (NaN for corners outside S).
    const fc = new Float64Array((nx + 1) * (ny + 1)).fill(NaN);
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        if (inside[j * (nx + 1) + i]) fc[j * (nx + 1) + i] = fAt(x0 + i * h, y0 + j * h);
      }
    }
    const list = [], ceilings = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // The square's 4 corners, as positions in "inside" and "fc".
        const c0 = j * (nx + 1) + i, c1 = c0 + 1, c2 = c0 + nx + 1, c3 = c2 + 1;
        if (!(inside[c0] || inside[c1] || inside[c2] || inside[c3])) continue;
        let hi = 0, lo = Infinity, odd = false;
        for (const c of [c0, c1, c2, c3]) {
          if (!inside[c]) continue;
          if (!isFinite(fc[c])) { odd = true; continue; }
          if (fc[c] > hi) hi = fc[c];
          if (fc[c] < lo) lo = fc[c];
        }
        let ceiling = lo === Infinity ? 0 : hi + (hi - lo);
        if (odd) {
          // Infinite or undefined at a corner: look inside the square instead.
          let inner = 0;
          for (let a = 0; a < 4; a++) {
            for (let b = 0; b < 4; b++) {
              const v = fAt(x0 + (i + (a + 0.5) / 4) * h, y0 + (j + (b + 0.5) / 4) * h);
              if (isFinite(v)) inner = Math.max(inner, v);
            }
          }
          ceiling = Math.max(ceiling, 2 * inner);
        }
        if (ceiling > 0) { list.push(j * nx + i); ceilings.push(ceiling); }
      }
    }
    if (list.length === 0) throw new Error("f is 0 everywhere on S.");
    squares = Int32Array.from(list);
    ceilingOf = Float64Array.from(ceilings);
    ceilingSum = new Float64Array(list.length);
    total = 0;
    for (let k = 0; k < list.length; k++) { total += ceilingOf[k]; ceilingSum[k] = total; }
    // Where each row of squares ends in the list (the list goes row by row).
    const ends = [];
    for (let k = 0; k < list.length; k++) {
      if (k === list.length - 1 || Math.floor(list[k + 1] / nx) !== Math.floor(list[k] / nx)) ends.push(k);
    }
    rowEnd = Int32Array.from(ends);
    ceilingMisses = 0;
  }

  // Keep a leftover inside [0, 1) (rounding can push it a hair out).
  function inUnit(t) { return Math.min(Math.max(t, 0), 1 - 1e-12); }

  // One center C_n, drawn from f on S with the random numbers "random".
  //
  // Like reading a CDF backwards, one direction at a time: the first
  // number u picks a row of squares (in proportion to the row's total
  // ceiling), and how far u went past the rows below it ("leftover",
  // uniform on [0, 1) once the row is picked) gives y inside that row.
  // The second number picks a square in the row the same way, and its
  // leftover gives x. So when a slider changes f a little, the ceilings
  // change a little and each center slides a little, instead of jumping
  // somewhere else. That is what keeps the picture moving smoothly
  // while you drag a slider.
  function drawCenter(random) {
    for (;;) {
      // The row: the first one whose running total passes u.
      const u = random() * total;
      let lo = 0, hi = rowEnd.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ceilingSum[rowEnd[mid]] > u) hi = mid; else lo = mid + 1; }
      const first = lo > 0 ? rowEnd[lo - 1] + 1 : 0, last = rowEnd[lo];
      const below = first > 0 ? ceilingSum[first - 1] : 0;
      const yLeft = (u - below) / (ceilingSum[last] - below);
      // The square in that row: the first one whose running total passes v.
      const v = below + random() * (ceilingSum[last] - below);
      lo = first; hi = last;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ceilingSum[mid] > v) hi = mid; else lo = mid + 1; }
      const before = lo > 0 ? ceilingSum[lo - 1] : 0;
      const xLeft = (v - before) / ceilingOf[lo];
      const i = squares[lo] % nx, j = Math.floor(squares[lo] / nx);
      const x = x0 + (i + inUnit(xLeft)) * h, y = y0 + (j + inUnit(yLeft)) * h;
      const test = random() * ceilingOf[lo];
      if (!inSW(x, y)) continue;
      const f = fAt(x, y);
      if (f > ceilingOf[lo]) ceilingMisses++;
      if (test < f) return [x, y];
    }
  }


  /* ===================================================================
     4. THE MESH OF OBSTACLES
     -------------------------------------------------------------------
     An obstacle is a piece of the edge of S (a segment) or a tile.
     Level 0 has 8 x 8 squares over the window; each next level is 4
     times finer. An obstacle goes to the finest level whose squares
     are at least as big as the obstacle's box, so it touches at most
     4 squares there (the very first tiles can be bigger and touch
     more). cells[level] maps a square's number to its obstacles, and
     onLevel[level] lists all of a level's obstacles.
     =================================================================== */
  const LEVELS = 8;
  let meshX = 0, meshY = 0, meshSide = 1;
  let cellSize = [], cells = [], onLevel = [];
  let useMesh = true;           // false: check every obstacle (for the check page)

  // Obstacle o: kind[o] = 0 for a segment, 1 for a tile; ref[o] = which one.
  let kind = [], ref = [];
  let seen = new Int32Array(1024), stamp = 0;

  function buildMesh(win) {
    meshX = win.xmin - 2 * h; meshY = win.ymin - 2 * h;
    meshSide = Math.max(win.xmax - win.xmin, win.ymax - win.ymin) + 4 * h;
    cellSize = []; cells = []; onLevel = [];
    for (let level = 0; level < LEVELS; level++) {
      cellSize.push(meshSide / (8 * Math.pow(4, level)));
      cells.push(new Map());
      onLevel.push([]);
    }
    kind = []; ref = [];
  }

  function squareKey(level, i, j) { return j * (8 * Math.pow(4, level) + 4) + i; }

  // File obstacle (k, r) with box [xa, xb] x [ya, yb].
  function addObstacle(k, r, xa, xb, ya, yb) {
    const o = kind.length;
    kind.push(k); ref.push(r);
    if (o >= seen.length) { const bigger = new Int32Array(seen.length * 2); bigger.set(seen); seen = bigger; }
    const size = Math.max(xb - xa, yb - ya);
    let level = 0;
    while (level + 1 < LEVELS && cellSize[level + 1] >= size) level++;
    const s = cellSize[level];
    onLevel[level].push(o);
    for (let j = Math.floor((ya - meshY) / s); j <= Math.floor((yb - meshY) / s); j++) {
      for (let i = Math.floor((xa - meshX) / s); i <= Math.floor((xb - meshX) / s); i++) {
        const key = squareKey(level, i, j);
        if (!cells[level].has(key)) cells[level].set(key, []);
        cells[level].get(key).push(o);
      }
    }
  }


  /* ===================================================================
     5. THE DISTANCE FROM A CENTER TO EACH KIND OF OBSTACLE
     -------------------------------------------------------------------
     "Distance" always means: the largest r such that rT + C does not
     overlap the obstacle (section (b) of the header).
     =================================================================== */

  // Segment from (ax, ay) to (bx, by): the smallest g(y - C) along it,
  // exactly. Inside one of T's angle slices g is linear, so along the
  // segment g(y - C) is made of straight pieces, which bend only where
  // the direction from C passes one of T's corner directions θ_j. Its
  // smallest value is therefore at an end of the segment or at one of
  // those bends, and at a bend y - C points along θ_j, so
  // g(y - C) = |y - C| / rho[j].
  function segmentDistance(cx, cy, ax, ay, bx, by) {
    const ux = ax - cx, uy = ay - cy, wx = bx - ax, wy = by - ay;   // y - C = u + t w, for t from 0 to 1
    let best = Math.min(g(ux, uy), g(ux + wx, uy + wy));
    const from = Math.atan2(uy, ux);
    let turn = Math.atan2(uy + wy, ux + wx) - from;                // how far the direction turns
    if (turn > Math.PI) turn -= TAU;
    if (turn < -Math.PI) turn += TAU;
    if (Math.abs(turn) > Math.PI - 1e-12) return 0;               // C is on the segment
    // The corner directions passed, from j0 to j1 (going the way the direction turns).
    const step = turn > 0 ? 1 : -1;
    let j0 = turn > 0 ? Math.floor(from * M / TAU) + 1 : Math.ceil(from * M / TAU) - 1;
    const j1 = turn > 0 ? Math.floor((from + turn) * M / TAU) : Math.ceil((from + turn) * M / TAU);
    for (let j = j0; step > 0 ? j <= j1 : j >= j1; j += step) {
      const k = ((j % M) + M) % M;
      // Where the line from C in direction θ_k meets the segment: cross(dir, u + t w) = 0.
      const across = cosM[k] * wy - sinM[k] * wx;
      if (across === 0) continue;
      const t = -(cosM[k] * uy - sinM[k] * ux) / across;
      if (t <= 0 || t >= 1) continue;
      best = Math.min(best, Math.hypot(ux + t * wx, uy + t * wy) / rho[k]);
    }
    return best;
  }

  // The ordinary distance from (cx, cy) to the segment from a to b.
  function pointToSegment(cx, cy, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + t * dx - cx, ay + t * dy - cy);
  }

  // Tile t, when T is not convex and symmetric: the smallest g(y - C)
  // over the edges of its polygon. To keep this fast:
  //   - big runs and runs of edges that are too far away are skipped,
  //   - a first pass looks only at the corners (one g each), which
  //     gives a value of "best" very close to the answer,
  //   - a second pass works out the exact value only for the edges
  //     that could still beat it.
  // "Too far" uses a lower bound for g: ordinary distance divided by
  // the most T reaches in the directions the part is seen in.
  function tileEdgeDistance(cx, cy, t, best) {
    const tx = tiles.cx[t], ty = tiles.cy[t], tr = tiles.r[t];
    function tooFar(circle) {
      return circleLowerBound(tx + tr * circle[0] - cx, ty + tr * circle[1] - cy, tr * circle[2]) >= best;
    }
    const near = [];   // the runs that pass
    for (let big = 0; big < bigRuns.length; big++) {
      if (tooFar(bigRuns[big])) continue;
      for (let run = big * BIG_RUN; run < (big + 1) * BIG_RUN; run++) if (!tooFar(runs[run])) near.push(run);
    }
    for (const run of near) {
      for (let k = run * RUN_EDGES; k < (run + 1) * RUN_EDGES; k++) best = Math.min(best, g(tx + tr * px[k] - cx, ty + tr * py[k] - cy));
    }
    for (const run of near) {
      if (tooFar(runs[run])) continue;
      for (let k = run * RUN_EDGES; k < (run + 1) * RUN_EDGES; k++) {
        const j = (k + 1) % M;
        const ax = tx + tr * px[k] - cx, ay = ty + tr * py[k] - cy, bx = tx + tr * px[j] - cx, by = ty + tr * py[j] - cy;
        if (pointToSegment(0, 0, ax, ay, bx, by) / reachBetween(ax, ay, bx, by) >= best) continue;
        best = Math.min(best, segmentDistance(0, 0, ax, ay, bx, by));
      }
    }
    return best;
  }

  // The most T reaches (largest rho) over the directions from the
  // direction of (ax, ay) to that of (bx, by), turning the short way.
  // Within slice k the polygon edge stays within max(rho[k], rho[k+1])
  // of the center, so the slices touched, plus one, are enough.
  function reachBetween(ax, ay, bx, by) {
    const from = Math.atan2(ay, ax);
    let turn = Math.atan2(by, bx) - from;
    if (turn > Math.PI) turn -= TAU;
    if (turn < -Math.PI) turn += TAU;
    const lo = Math.min(from, from + turn), hi = Math.max(from, from + turn);
    return mostRho(Math.floor(lo * M / TAU), Math.floor(hi * M / TAU) + 1);
  }

  // A lower bound for g(y - C) over a circle (center (dx, dy) from C,
  // given radius): its nearest ordinary distance, divided by the most
  // T reaches in the directions the circle covers.
  function circleLowerBound(dx, dy, radius) {
    const dist = Math.hypot(dx, dy);
    if (dist <= radius) return 0;
    const middle = Math.atan2(dy, dx), half = Math.asin(radius / dist);
    return (dist - radius) / mostRho(Math.floor((middle - half) * M / TAU), Math.floor((middle + half) * M / TAU) + 1);
  }

  // The largest rho[k] for k from k0 to k1 (going around past M is
  // fine). most[level][k] holds the largest of rho[k .. k + 2^level - 1],
  // so any range is covered by two overlapping blocks (a "sparse
  // table"; Bender & Farach-Colton, LATIN 2000).
  function mostRho(k0, k1) {
    const length = k1 - k0 + 1;
    if (length >= M) return rhoMax;
    const start = ((k0 % M) + M) % M;
    const level = Math.floor(Math.log2(length));
    return Math.max(most[level][start], most[level][(start + length - (1 << level)) % M]);
  }

  // Look at every obstacle near (cx, cy). Returns { inTile, distance,
  // obstacle }: inTile = the tile holding the center (or -1); otherwise
  // the distance to the nearest obstacle and which one it is.
  function nearest(cx, cy) {
    stamp++;
    let best = Infinity, bestO = -1, inTile = -1;

    function look(o) {
      if (seen[o] === stamp) return;
      seen[o] = stamp;
      // The slower distances are skipped when even a quick lower
      // bound (from ordinary distance, as g(v) >= |v| / rhoMax) can't
      // beat the best so far.
      let d;
      if (kind[o] === 1) {
        const t = ref[o], tx = tiles.cx[t], ty = tiles.cy[t], tr = tiles.r[t];
        const v = g(cx - tx, cy - ty);
        if (v < tr) { inTile = t; return; }
        if (exactTiles) d = v - tr;
        else {
          if ((Math.hypot(cx - tx, cy - ty) - tr * rhoMax) / rhoMax >= best) return;
          d = tileEdgeDistance(cx, cy, t, best);
        }
      } else {
        const s = segments[ref[o]];
        if (pointToSegment(cx, cy, s[0], s[1], s[2], s[3]) / rhoMax >= best) return;
        d = segmentDistance(cx, cy, s[0], s[1], s[2], s[3]);
      }
      if (d < best) { best = d; bestO = o; }
    }
    function lookSquare(level, i, j) {
      const list = cells[level].get(squareKey(level, i, j));
      if (!list) return;
      for (const o of list) { look(o); if (inTile >= 0) return; }
    }

    if (!useMesh) {
      for (let o = 0; o < kind.length && inTile < 0; o++) look(o);
      return { inTile, distance: best, obstacle: bestO };
    }

    // Pass 1: the center's own square and its 8 neighbors, on every
    // level. A tile holding the center is always found here, since it
    // is filed in every square its box touches.
    for (let level = 0; level < LEVELS; level++) {
      if (onLevel[level].length === 0) continue;
      const s = cellSize[level];
      const ci = Math.floor((cx - meshX) / s), cj = Math.floor((cy - meshY) / s);
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 1; i <= ci + 1; i++) { lookSquare(level, i, j); if (inTile >= 0) return { inTile }; }
      }
    }

    // Pass 2: farther rings, level by level. Everything in ring k is at
    // least (k - 1) squares away, and g(v) >= |v| / rhoMax, so once
    // (k - 1) * size / rhoMax >= best, nothing farther can win. When
    // the rings would cover more squares than the level has obstacles,
    // it is cheaper to check that level's obstacles one by one.
    for (let level = 0; level < LEVELS; level++) {
      const list = onLevel[level];
      if (list.length === 0) continue;
      const s = cellSize[level];
      const rings = best === Infinity ? Infinity : Math.floor(best * rhoMax / s) + 1;
      if ((2 * rings + 1) * (2 * rings + 1) > list.length) {
        for (const o of list) look(o);
        continue;
      }
      const ci = Math.floor((cx - meshX) / s), cj = Math.floor((cy - meshY) / s);
      for (let k = 2; (k - 1) * s < best * rhoMax; k++) {
        for (let i = ci - k; i <= ci + k; i++) { lookSquare(level, i, cj - k); lookSquare(level, i, cj + k); }
        for (let j = cj - k + 1; j <= cj + k - 1; j++) { lookSquare(level, ci - k, j); lookSquare(level, ci + k, j); }
      }
    }
    return { inTile, distance: best, obstacle: bestO };
  }


  /* ===================================================================
     6. THE TILES, AND ONE ATTEMPT
     -------------------------------------------------------------------
     tiles.count tiles, numbered 0 .. count-1 in the order placed:
       cx, cy     the center C          r          the size R (> 0)
       parent     what stopped it: a tile number, or -1 for the edge of S
       generation 1 if its parent is the edge, else its parent's + 1
       children   how many later tiles have it as their parent
       attempt    the attempt n that placed it (1, 2, 3, ...)
     Attempts that land inside a tile place nothing (R_n = 0).
     =================================================================== */
  const tiles = { count: 0, cx: [], cy: [], r: [], parent: [], generation: [], children: [], attempt: [] };
  let attempts = 0;
  let edgeChildren = 0;          // tiles whose parent is the edge of S
  let seed = "1", makeRandom = null;
  let clicks = {};               // attempt n -> [x, y]: centers you clicked

  function clearTiles() {
    for (const key of Object.keys(tiles)) if (key !== "count") tiles[key] = [];
    tiles.count = 0;
    attempts = 0;
    edgeChildren = 0;
  }

  // Grow a tile at (cx, cy). Returns the new tile's number, or -1 if
  // the center landed inside a tile.
  function placeAt(cx, cy) {
    attempts++;
    if (!inSW(cx, cy)) return -1;
    const found = nearest(cx, cy);
    if (found.inTile >= 0 || !(found.distance > 0)) return -1;
    const o = found.obstacle;
    const parent = kind[o] === 1 ? ref[o] : -1;
    const t = tiles.count++;
    tiles.cx.push(cx); tiles.cy.push(cy); tiles.r.push(found.distance);
    tiles.parent.push(parent);
    tiles.generation.push(parent < 0 ? 1 : tiles.generation[parent] + 1);
    tiles.children.push(0);
    tiles.attempt.push(attempts);
    if (parent < 0) edgeChildren++; else tiles.children[parent]++;
    const R = found.distance;
    addObstacle(1, t, cx + R * tMinX, cx + R * tMaxX, cy + R * tMinY, cy + R * tMaxY);
    return t;
  }

  // The next attempt n: its own random numbers, a center, a tile. If
  // you clicked a point for attempt n (see "clicks" in setup), that
  // point is the center instead of a random one.
  function attempt() {
    const clicked = clicks[attempts + 1];
    if (clicked) return placeAt(clicked[0], clicked[1]);
    const random = makeRandom(seed + "/" + (attempts + 1));
    const [cx, cy] = drawCenter(random);
    return placeAt(cx, cy);
  }

  // A center you clicked, used as the next attempt if a tile fits there.
  // Returns true if a tile was placed. If not (the point is inside a
  // tile or outside S), nothing changes: the attempt is not used up.
  function addClick(x, y) {
    if (placeAt(x, y) < 0) { attempts--; return false; }
    clicks[attempts] = [x, y];
    return true;
  }


  /* ===================================================================
     7. SETUP
     -------------------------------------------------------------------
     options:
       inS(x, y), inT(x, y)   true/false: the conditions for S and T
       density(x, y)          f (a number >= 0); leave out for uniform
       window                 { xmin, xmax, ymin, ymax }: where S is looked for
       seed                   any text or number
       makeRandom(text)       returns a random-number function for that text
                              (seedrandom's alea)
       clicks                 { n: [x, y], ... }: attempts whose center you
                              clicked (leave out for none)
       useMesh                false to check every obstacle (default true)
     Returns facts about the shapes, for the page to show.
     =================================================================== */
  function setup(options) {
    const win = options.window;
    inSW = function (x, y) {
      return x >= win.xmin && x <= win.xmax && y >= win.ymin && y <= win.ymax && Boolean(options.inS(x, y));
    };
    density = options.density || function () { return 1; };
    seed = String(options.seed);
    makeRandom = options.makeRandom;
    clicks = Object.assign({}, options.clicks);
    useMesh = options.useMesh !== false;
    buildShape(options.inT);
    buildEdge(win);
    buildSampler();
    buildMesh(win);
    clearTiles();
    for (let k = 0; k < segments.length; k++) {
      const s = segments[k];
      addObstacle(0, k, Math.min(s[0], s[2]), Math.max(s[0], s[2]), Math.min(s[1], s[3]), Math.max(s[1], s[3]));
    }
    return { exactTiles, areaS, areaT, edgeSegments: segments.length, negativeF };
  }

  return {
    setup, attempt, addClick, placeAt, drawCenter, tiles, g,
    get attempts() { return attempts; },
    get edgeChildren() { return edgeChildren; },
    get ceilingMisses() { return ceilingMisses; },
    get segments() { return segments; },
    get areaS() { return areaS; },
    get areaT() { return areaT; },
    get exactTiles() { return exactTiles; },
    get shape() { return { px, py, rhoMax }; },
  };
}


/* =====================================================================
   8. THE WORKER: RUNNING THE PACKING IN A SECOND THREAD
   ---------------------------------------------------------------------
   The sim page (sequential-packing.js) turns this function into a "Web
   Worker", together with packingCore() above, so the work never freezes
   the page. They talk by messages:

   page -> worker
     { type: "setup", run, S, T, f, values, window, seed, clicks, target }
         S, T, f: the typed formulas, already tidied by readTree (in
         js/formulas.js) and written out with every "*" shown; values:
         the sliders, e.g. { s: 0.5 }; clicks: the centers you clicked
         ({ n: [x, y] }). Starts again from no tiles, and works until
         "target" attempts are done.
     { type: "target", target }       work until this many attempts
     { type: "click", x, y, at }      a clicked center, as attempt at + 1
                                      (only if exactly "at" are done)
   worker -> page
     { type: "ready", run, info, segments, shapeX, shapeY }
         after a setup: facts about S and T, the edge of S (4 numbers
         per segment) and T's polygon (128 corners), for drawing.
     { type: "clicked", run, placed, ready, x, y, at }   did the clicked tile fit?
     { type: "tiles", run, attempts, ceilingMisses, cx, cy, r, parent, generation, attempt }
         the tiles placed since the last message (all tiles of one run
         arrive in order), and how many attempts are done.
     { type: "error", run, message }  the formulas couldn't be used
   "run" numbers each setup, so the page can ignore messages from an
   older one.
   ===================================================================== */

function packingWorker() {
  // math.js reads the formulas; seedrandom's alea gives each attempt its
  // own repeatable random numbers. Version numbers are fixed so an
  // update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/mathjs@15.2.0/lib/browser/math.js");
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/lib/alea.min.js");

  let core = null, run = 0, target = 0, sent = 0, working = false;

  // A typed condition (S or T) as a function of (x, y) that gives
  // true or false. A point where the formula can't be worked out (say
  // sqrt of a negative number) counts as outside.
  function condition(text, values, name) {
    const formula = math.compile(text);
    const scope = Object.assign({}, values);
    function test(x, y) {
      scope.x = x; scope.y = y;
      try { return formula.evaluate(scope) === true; } catch (error) { return false; }
    }
    scope.x = 0; scope.y = 0;
    const sample = formula.evaluate(scope);
    if (sample !== true && sample !== false) {
      throw new Error(name + " should be a condition (true or false), like x^2 + y^2 <= 1.");
    }
    return test;
  }

  // The density f as a function of (x, y) that gives a number (NaN where
  // it can't be worked out, which then counts as 0).
  function number(text, values) {
    const formula = math.compile(text);
    const scope = Object.assign({}, values);
    return function (x, y) {
      scope.x = x; scope.y = y;
      try {
        const v = formula.evaluate(scope);
        return typeof v === "number" ? v : NaN;
      } catch (error) { return NaN; }
    };
  }

  // Do attempts for about 40 milliseconds, send the new tiles, and come
  // back (through setTimeout, so new messages from the page get in).
  function work() {
    if (!core) { working = false; return; }
    const start = performance.now();
    while (core.attempts < target && performance.now() - start < 40) core.attempt();
    const t = core.tiles, count = t.count;
    if (count > sent || core.attempts >= target) {
      postMessage({
        type: "tiles", run: run, attempts: core.attempts, ceilingMisses: core.ceilingMisses,
        cx: t.cx.slice(sent, count), cy: t.cy.slice(sent, count), r: t.r.slice(sent, count),
        parent: t.parent.slice(sent, count), generation: t.generation.slice(sent, count),
        attempt: t.attempt.slice(sent, count),
      });
      sent = count;
    }
    if (core.attempts < target) setTimeout(work, 0);
    else working = false;
  }
  function startWorking() {
    if (!working) { working = true; setTimeout(work, 0); }
  }

  onmessage = function (event) {
    const m = event.data;
    if (m.type === "setup") {
      run = m.run;
      target = m.target;
      sent = 0;
      core = null;
      try {
        const packing = packingCore();
        const info = packing.setup({
          inS: condition(m.S, m.values, "S"),
          inT: condition(m.T, m.values, "T"),
          density: number(m.f, m.values),
          window: m.window,
          seed: m.seed,
          makeRandom: alea,
          clicks: m.clicks,
        });
        core = packing;
        // T's polygon, 128 of its corners, for drawing.
        const shape = packing.shape, shapeX = [], shapeY = [];
        for (let k = 0; k < shape.px.length; k += shape.px.length / 128) { shapeX.push(shape.px[k]); shapeY.push(shape.py[k]); }
        postMessage({ type: "ready", run: run, info: info, segments: packing.segments.flat(), shapeX: shapeX, shapeY: shapeY });
        startWorking();
      } catch (error) {
        postMessage({ type: "error", run: run, message: error.message });
      }
    } else if (m.type === "target") {
      target = m.target;
      startWorking();
    } else if (m.type === "click") {
      // Only when the worker is exactly at attempt "at" (the page then
      // asks for the next attempt). Otherwise the page starts a new setup.
      const ready = core && core.attempts === m.at && target === m.at;
      const placed = ready && core.addClick(m.x, m.y);
      if (placed) target = m.at + 1;
      postMessage({ type: "clicked", run: run, placed: placed, ready: ready, x: m.x, y: m.y, at: m.at });
      if (placed) startWorking();
    }
  };
}
