/* =====================================================================
   uniform-polyomino-chain.js  —  the second thread of the "Uniform
   Polyomino" sim
   ---------------------------------------------------------------------
   The chain itself is newPolyomino, in js/sim-polyomino.js (Sequential
   Discrete Tiling uses it too, for its domain). This file runs it in a
   second thread (a "Web Worker") for the sim page,
   uniform-polyomino.js, so the page never freezes: runInWorker
   (js/sim-page.js) starts it, with the chain's helpers
   (polyominoHelpers) and the trace (js/sim-worker.js) copied in.

   The page sends, besides Play, Pause and Step (serveRun,
   js/sim-worker.js):
     setup     a new run: the options of newPolyomino
     settings  new K, b and s: the chain carries on with them, like a
               Desmos slider
     goto      jump to move m (back or forward): the run is made again
               from the start, with the same seed, up to move m
   It answers with the cells, the chain's numbers now, and the run so
   far (for the charts): edge and site perimeter, cycles and holes.
   ===================================================================== */

function polyominoWorker() {
  let options = null;     // the run's options (with the latest K, b and s)
  let chain = null;       // the chain (newPolyomino)
  let trace = null;       // the run so far, for the charts (keepSample, js/sim-worker.js)

  // A sample for the charts, when one is due (or "now").
  function takeSample(now) {
    keepSample(trace, chain.moves, function () {
      const n = chain.numbers();
      return { edge: n.edgePerimeter, site: n.sitePerimeter, cycles: n.cycles, holes: n.holes };
    }, now);
  }

  function setup(m) {
    options = m;
    chain = newPolyomino(options);
    trace = newTrace();
    takeSample(true);
  }

  function oneMove() {
    chain.step();
    takeSample();
  }

  // Jump to move m: back means making the run again from the start.
  function goTo(m) {
    if (m.steps < chain.moves) setup(options);
    while (chain.moves < m.steps) oneMove();
    takeSample(true);
  }

  function report(send) {
    const x = Int32Array.from(chain.x), y = Int32Array.from(chain.y);
    send(Object.assign({
      moves: chain.moves, changed: chain.changed, x: x, y: y,
      traceTimes: Float64Array.from(trace.times), traceEdge: Float64Array.from(trace.lists.edge),
      traceSite: Float64Array.from(trace.lists.site), traceCycles: Float64Array.from(trace.lists.cycles),
      traceHoles: Float64Array.from(trace.lists.holes),
    }, chain.numbers()), [x.buffer, y.buffer]);
  }

  serveRun({
    setup: setup, steps: oneMove, report: report,
    messages: {
      settings: function (m) {
        chain.most = options.most = m.most;
        chain.edgeHeat = options.edgeHeat = m.edgeHeat;
        chain.siteHeat = options.siteHeat = m.siteHeat;
      },
      goto: goTo,
    },
  });
}
