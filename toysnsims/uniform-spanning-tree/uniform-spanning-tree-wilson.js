/* =====================================================================
   uniform-spanning-tree-wilson.js  —  the tree behind the "Uniform
   Spanning Tree" sim
   ---------------------------------------------------------------------
   What it does, in plain words:
     Builds a uniformly random spanning tree of the domain (the cells,
     joined to their neighbors) with Wilson's algorithm, one step of
     the walk at a time, so the page can show it growing: a random walk
     from a cell not in the tree yet wanders until it hits the tree, its
     loops are erased as soon as they close, and what is left joins the
     tree. Wilson's algorithm itself is shared (newWilson,
     js/sim-spanning.js), which says why the tree is exactly uniform.

   Each step of a walk goes to a uniformly random neighbor. The random
   numbers come from the library seedrandom
   (https://github.com/davidbau/seedrandom), so the same seed gives the
   same tree every time.

   If the domain is in several pieces (a drawn region, say), only the
   piece with the root can have a tree: the walks start only from its
   cells, and the other cells are left out.

   The file has one function, treeWorker(). The sim page
   (uniform-spanning-tree.js) runs it in a second thread (a "Web
   Worker"), with newWilson copied in, so the page never freezes. It
   talks to the page the way every sim's worker does (serveRun,
   js/sim-worker.js). Its one message of its own:
     setup  { n, first, nbr, root, seed }   a new tree from the start
   One step is one step of Wilson's algorithm (a walk starts, or moves
   one cell). The run is done, and pauses by itself, once every cell of
   the root's piece is in the tree. Each report sends the tree so far
   (parent), each cell's color so far (exits: how many times the walks
   stepped out of it), the walk with its loops erased (path), and the
   counts.
   ===================================================================== */

function treeWorker() {
  // seedrandom adds Math.seedrandom(seed). The version number is fixed
  // so an update can never change the sim by surprise.
  importScripts("https://cdn.jsdelivr.net/npm/seedrandom@3.0.5/seedrandom.min.js");

  let first = null, nbr = null, random = Math.random;
  let wilson = null;     // Wilson's algorithm on the domain (newWilson, js/sim-spanning.js)
  let pieceSize = 0;     // the cells of the root's piece

  // A uniformly random neighbor of cell v.
  function randomNeighbor(v) {
    return nbr[first[v] + Math.floor(random() * (first[v + 1] - first[v]))];
  }

  // The cells of the root's piece, in their own order (a search through
  // neighbors finds them; then they are sorted back into number order,
  // the order the walks start in).
  function pieceOf(n, root) {
    const seen = new Uint8Array(n), cells = [root];
    seen[root] = 1;
    for (let head = 0; head < cells.length; head++) {
      const v = cells[head];
      for (let e = first[v]; e < first[v + 1]; e++) {
        const w = nbr[e];
        if (!seen[w]) { seen[w] = 1; cells.push(w); }
      }
    }
    return cells.sort(function (a, b) { return a - b; });
  }

  function setup(m) {
    first = m.first;
    nbr = m.nbr;
    random = new Math.seedrandom(String(m.seed));
    wilson = newWilson(m.n, randomNeighbor);
    const cells = pieceOf(m.n, m.root);
    pieceSize = cells.length;
    wilson.start([m.root], cells);
  }

  function report(send) {
    const parent = wilson.parent.slice(), exits = wilson.exits.slice();
    send({
      parent: parent, exits: exits, path: Int32Array.from(wilson.path),
      steps: wilson.steps, joined: wilson.joined, pieceSize: pieceSize,
    }, [parent.buffer, exits.buffer]);
  }

  serveRun({
    setup: setup,
    steps: function () { wilson.step(); },
    isDone: function () { return wilson.done(); },
    report: report,
  });
}
