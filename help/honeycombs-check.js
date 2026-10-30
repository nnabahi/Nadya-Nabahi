/* =====================================================================
   honeycombs-check.js  —  a look at the 3D tilings (js/sim-honeycombs.js)
   and tests of them, for honeycombs-check.html
   ---------------------------------------------------------------------
     1. The picture: a box of one tiling's cells, colored by type.
     2. Each tiling against the paper's List 1, and its geometry.
     3. The tilings with the same vertex are different tilings.
     4. Boxes, tori and steps in the whole of space.
   ===================================================================== */


/* =====================================================================
   1. THE PICTURE
   ===================================================================== */

const PICTURE_HEIGHT = 520;

const three = make3D(byId("picture"), PICTURE_HEIGHT, { ready: drawTiling });
addHoneycombOptions(byId("tiling"));
for (const { kind, name } of CELL_KINDS) byId("kind").appendChild(new Option(name, kind));
byId("draw").addEventListener("click", function () { three.show(true); drawTiling(); });

// Draw a box of the chosen tiling's cells, each type in its own color,
// and list the types with their colors and how many of each are in the box.
function drawTiling() {
  if (!three.view) return;
  const block = honeycombBlock(Number(byId("tiling").value), byId("kind").value);
  const size = Math.max(1, Number(byId("size").value) || 6);
  const d = honeycombBox(block, size, size, size, false);
  const colors = defaultColors(block.types.length).map(hexToRGB);
  const typeOf = block.cells.map(function (cell) { return block.types.indexOf(cell.type); });
  three.code.drawCells(three.view, {
    x: d.x, y: d.y, z: d.z, part: d.part, block: block,
    color: function (i) { return colors[typeOf[d.part[i]]]; },
  });
  const counts = block.types.map(function () { return 0; });
  for (let v = 0; v < d.n; v++) counts[typeOf[d.part[v]]]++;
  byId("types").innerHTML = "";
  block.types.forEach(function (type, t) {
    const item = document.createElement("li");
    item.innerHTML = swatch(rgbToHex(colors[t]));
    item.append(" " + type + ": " + counts[t] + " in the box");
    byId("types").appendChild(item);
  });
}


/* =====================================================================
   2. EACH TILING
   ===================================================================== */

// All the cells of a block within "reach" of the block (0, 0, 0) (each
// way, in blocks), as { middle, cell } with cell = [I, J, K, k].
function cellsAround(block, reach) {
  const found = [];
  for (let I = -reach; I <= reach; I++) for (let J = -reach; J <= reach; J++) for (let K = -reach; K <= reach; K++) {
    block.cells.forEach(function (cell, k) { found.push({ middle: honeycombMiddle(block, I, J, K, k), cell: [I, J, K, k] }); });
  }
  return found;
}

// The volume of a cell with faces (going counterclockwise seen from
// outside): the sum, over triangles cut from each face, of the cones
// from the middle, each a sixth of a box product.
function cellVolume(cell) {
  let volume = 0;
  for (const face of cell.faces) {
    const p = face.map(function (c) { return sub3(cell.corners[c], cell.middle); });
    for (let k = 1; k + 1 < p.length; k++) volume += dot3(p[0], cross3(p[k], p[k + 1])) / 6;
  }
  return volume;
}

// Whether a face's corners are a flat regular polygon with sides of length 1.
function isRegularFace(corners) {
  const middle = average3(corners), radius = length3(sub3(corners[0], middle));
  return onOnePlane(corners) && corners.every(function (p, k) {
    return Math.abs(length3(sub3(p, corners[(k + 1) % corners.length])) - 1) < 1e-6 &&
           Math.abs(length3(sub3(p, middle)) - radius) < 1e-6;
  });
}

// Whether every cell of a block is its neighbors' neighbor: if cell k
// has [k2, I, J, K] in its next, cell k2 has [k, -I, -J, -K].
function neighborsBothWays(block) {
  return block.cells.every(function (cell, k) {
    return cell.next.every(function ([k2, I, J, K]) {
      return block.cells[k2].next.some(function (n) { return n[0] === k && n[1] === -I && n[2] === -J && n[3] === -K; });
    });
  });
}

// How far out to look around a vertex: far enough to tell #3 from #4
// (they differ three layers away), and not a distance between two
// vertices of any tiling (4 is, on the cubes: then rounding would keep
// some vertices 4 away and drop others).
const LOOK = 3.93;

// For a vertex: how far the other vertices within LOOK are, in order,
// as text (to compare vertices, and tilings).
function distanceProfile(block, around, k) {
  const me = block.cells[k].middle, far = [];
  for (const { middle } of around) {
    const d = length3(sub3(middle, me));
    if (d > 1e-6 && d < LOOK) far.push(d.toFixed(5));
  }
  return far.sort().join(" ");
}

// The vertices of a tiling, with what's around each.
function vertexProfiles(number) {
  const block = honeycombBlock(number, "vertices");
  const reach = Math.ceil(LOOK / Math.min(block.a[0], block.b[1], block.c[2]));
  const around = cellsAround(block, reach);
  return block.cells.map(function (cell, k) { return distanceProfile(block, around, k); });
}

// The smallest whole numbers in the ratio of some numbers, as "2 : 1".
function ratioText(numbers) {
  const smallest = Math.min.apply(null, numbers);
  for (let times = 1; times <= 48; times++) {
    const scaled = numbers.map(function (x) { return x / smallest * times; });
    if (scaled.every(function (x) { return Math.abs(x - Math.round(x)) < 1e-6; })) return scaled.map(Math.round).join(" : ");
  }
  return numbers.join(" : ");
}

// The polyhedra in a vertex name and how many meet at a vertex, like
// [["3.4.4", 6], ["4.4.4", 4]] for "(3.4.4)⁶.(4.4.4)⁴".
function readVertexName(name) {
  const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return name.match(/\([0-9.]+\)[⁰¹²³⁴⁵⁶⁷⁸⁹]*/g).map(function (part) {
    const power = part.slice(part.indexOf(")") + 1);
    return [part.slice(1, part.indexOf(")")),
            power === "" ? 1 : Number(power.split("").map(function (c) { return SUPER.indexOf(c); }).join(""))];
  });
}

// One tiling against List 1, and its geometry.
function testTiling(entry) {
  const started = performance.now();
  const polyhedra = honeycombBlock(entry.number, "polyhedra"), faces = honeycombBlock(entry.number, "faces");
  const edges = honeycombBlock(entry.number, "edges"), vertices = honeycombBlock(entry.number, "vertices");
  const title = "#" + entry.number + " " + entry.name;
  const found = [];

  // The vertex, and the ratio of polyhedra it implies: each polyhedron
  // meets as many vertices as it has corners, so a block holds
  // (how many meet at a vertex) / (its corners) of them per vertex.
  const sameVertex = vertices.types.length === 1 && vertices.types[0] === entry.symbol;
  found.push("vertex " + vertices.types.join(" | "));
  const parts = readVertexName(entry.symbol);
  const cornersOf = {};
  for (const cell of polyhedra.cells) cornersOf[cell.type] = cell.corners.length;
  const counts = parts.map(function ([name]) { return polyhedra.cells.filter(function (c) { return c.type === name; }).length; });
  const fromVertex = parts.map(function ([name, meet]) { return meet / (cornersOf[name] || NaN); });
  const ratio = ratioText(counts), expected = ratioText(fromVertex);
  const ratioOK = parts.length === 1 || ratio === expected;
  if (parts.length > 1) {
    found.push("polyhedra " + ratio + " (" + parts.map(function (p) { return p[0]; }).join(" : ") + "), as its vertex says" +
               (entry.ratio && entry.ratio !== ratio ? "; the paper prints " + entry.ratio : ""));
  }

  // Edges 1 long, faces regular.
  const edgesOK = edges.cells.every(function (cell) { return Math.abs(length3(sub3(cell.corners[0], cell.corners[1])) - 1) < 1e-6; });
  const facesOK = faces.cells.every(function (cell) { return isRegularFace(cell.corners); });

  // The block filled, by polyhedra and by the vertices' cells.
  const blockVolume = polyhedra.a[0] * polyhedra.b[1] * polyhedra.c[2];
  const sum = function (block) { return block.cells.reduce(function (s, cell) { return s + cellVolume(cell); }, 0); };
  const filled = Math.abs(sum(polyhedra) - blockVolume) < 1e-6 * blockVolume;
  const dualFilled = Math.abs(sum(vertices) - blockVolume) < 1e-6 * blockVolume;
  found.push("block " + blockVolume.toFixed(4) + " filled by its polyhedra (" + sum(polyhedra).toFixed(4) +
             ") and its vertices' cells (" + sum(vertices).toFixed(4) + ")");

  // Euler, neighbors both ways, and every vertex alike.
  const euler = polyhedra.cells.every(function (cell) {
    const sides = cell.faces.reduce(function (s, f) { return s + f.length; }, 0);
    return cell.corners.length - sides / 2 + cell.faces.length === 2;
  });
  const bothWays = [polyhedra, faces, edges, vertices].every(neighborsBothWays);
  const profiles = vertexProfiles(entry.number);
  const alike = profiles.every(function (p) { return p === profiles[0]; });
  found.push([polyhedra, faces, edges, vertices].map(function (b) { return b.cells.length + " " + b.kind; }).join(", ") + " per block");
  found.push((performance.now() - started).toFixed(0) + " ms");

  const pass = sameVertex && ratioOK && edgesOK && facesOK && filled && dualFilled && euler && bothWays && alike;
  const failed = [[sameVertex, "the vertex isn't " + entry.symbol], [ratioOK, "the ratio isn't " + expected],
                  [edgesOK, "an edge isn't 1 long"], [facesOK, "a face isn't regular"], [filled, "the polyhedra don't fill the block"],
                  [dualFilled, "the vertices' cells don't fill the block"], [euler, "a polyhedron fails Euler's formula"],
                  [bothWays, "a cell isn't its neighbor's neighbor"], [alike, "the vertices see different distances"]]
    .filter(function (f) { return !f[0]; }).map(function (f) { return f[1]; });
  addRow(title, pass, (failed.length ? "PROBLEMS: " + failed.join("; ") + ". " : "") + found.join("; ") + ".");
}


/* =====================================================================
   3. TILINGS WITH THE SAME VERTEX ARE DIFFERENT
   ---------------------------------------------------------------------
   #1 and #2, #3 and #4, #11 and #12, and #13, #14 and #15 have the same
   polyhedra around every vertex; the vertices around a vertex, out to
   LOOK, tell them apart.
   ===================================================================== */

function testDifferent() {
  const groups = [[1, 2], [3, 4], [11, 12], [13, 14, 15]];
  for (const group of groups) {
    const seen = group.map(function (n) { return vertexProfiles(n)[0]; });
    const different = seen.every(function (p, i) { return seen.indexOf(p) === i; });
    addRow("#" + group.join(", #") + " are different tilings", different,
           different ? "The vertices around a vertex, out to " + LOOK + ", are at different distances in each."
                     : "Two of them look the same around a vertex.");
  }
}


/* =====================================================================
   4. BOXES, TORI AND THE WHOLE OF SPACE
   ===================================================================== */

// The cubes: a 3 x 4 x 5 box has 60 cells and 2*4*5 + 3*3*5 + 3*4*4 = 133
// pairs of neighbors; a 4 x 5 x 6 torus has 120 cells, each with 6
// neighbors.
function testCubes() {
  const block = honeycombBlock(22, "polyhedra");
  const box = honeycombBox(block, 3, 4, 5, false), torus = honeycombBox(block, 4, 5, 6, true);
  const pairs = box.nbr.length / 2;
  const six = Array.from({ length: torus.n }, function (_, v) { return torus.first[v + 1] - torus.first[v]; }).every(function (c) { return c === 6; });
  addRow("Cubes: a box and a torus", box.n === 60 && pairs === 133 && torus.n === 120 && six,
         "3 x 4 x 5 box: " + box.n + " cells, " + pairs + " pairs of neighbors (should be 60 and 133); 4 x 5 x 6 torus: " +
         torus.n + " cells, " + (six ? "each with 6 neighbors" : "NOT each with 6 neighbors") + ".");
}

// On a torus of every tiling and kind of cell, each cell has exactly as
// many neighbors as its cell in the block (the torus is big enough that
// they are all different cells); in a box, at most that many.
function testTori() {
  let problems = [], tried = 0;
  for (const entry of HONEYCOMBS) {
    for (const { kind } of CELL_KINDS) {
      const block = honeycombBlock(entry.number, kind);
      const torus = honeycombBox(block, 1, 1, 1, true), box = honeycombBox(block, 5, 5, 5, false);
      tried++;
      for (const [d, exact] of [[torus, true], [box, false]]) {
        for (let v = 0; v < d.n; v++) {
          const have = d.first[v + 1] - d.first[v], should = block.cells[d.part[v]].next.length;
          if (exact ? have !== should : have > should) { problems.push("#" + entry.number + " " + kind); break; }
        }
      }
    }
  }
  addRow("Every tiling and kind of cell: tori and boxes", problems.length === 0,
         problems.length ? "Wrong numbers of neighbors on: " + problems.join(", ") + "."
                         : tried + " tori and boxes, each cell with the right number of neighbors.");
}

// In the whole of space: a step to each neighbor and back (with
// honeycombStep) comes back to the same cell, and the neighbor's middle
// is where its block says.
function testSteps() {
  let steps = 0, ok = true;
  for (const entry of HONEYCOMBS) {
    for (const { kind } of CELL_KINDS) {
      const block = honeycombBlock(entry.number, kind);
      block.cells.forEach(function (cell, k) {
        const start = [2, -1, 3, k];
        cell.next.forEach(function (n, e) {
          const there = honeycombStep(block, start, e);
          const back = block.cells[there[3]].next.findIndex(function (m) { return m[0] === k && m[1] === -n[1] && m[2] === -n[2] && m[3] === -n[3]; });
          if (back < 0 || honeycombKey(honeycombStep(block, there, back)) !== honeycombKey(start)) ok = false;
          steps++;
        });
      });
    }
  }
  addRow("Steps in the whole of space", ok, steps + " steps to a neighbor and back, " + (ok ? "all back where they started." : "NOT all back where they started."));
}


function allTests() {
  return HONEYCOMBS.map(function (entry) { return function () { testTiling(entry); }; })
    .concat([testDifferent, testCubes, testTori, testSteps]);
}
runChecksOnClick(allTests);
