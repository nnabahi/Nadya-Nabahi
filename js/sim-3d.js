/* =====================================================================
   sim-3d.js  —  the 3D view shared by the sims
   ---------------------------------------------------------------------
   What it does, in plain words:
     Draws a 3D picture that you can turn around with the mouse or your
     fingers. It draws two kinds of picture:
       STACKS: a floor of cells, and on each cell a stack of blocks
         (cubes, coins, or blocks in the shape of the cell's tile) as
         tall as that cell's height. Eden Growth
         and Sandpiles use it, on the square grid and on hyperbolic tilings
         and trees (their edges drawn as lines on the floor).
       SURFACES: a colored surface over a grid, like a graph
         z = h(x, y) in Desmos 3D, with balls on some of its points.
         Lattice Path Counting uses it.
       CELLS: cubes floating in space, one per cell of the cubic grid,
         with a see-through convex hull around them. Random Walk uses
         it in 3D.

       drag (left mouse, one finger)     turn the picture around
       mouse wheel, or pinch             zoom in or out
       right drag, or two fingers        slide the picture

   It uses three.js (https://threejs.org), the standard library for 3D
   in the browser, loaded from the internet like KaTeX. three.js is
   written as a "module" (a file that says which other files it needs
   with "import"), so this file is a module too. A sim page loads it
   only when its 3D view is first switched on (make3D, js/sim-page.js),
   and the page's <script type="importmap"> says where on the internet
   "three" lives. Pages that never switch to 3D never load three.js.

   How the blocks are drawn: a picture can have hundreds of thousands
   of blocks, all the same shape. three.js draws all of them in one go
   with an "InstancedMesh": one shape, plus a list saying where each
   copy goes, how big it is, and its color. Tile-shaped blocks can all
   be different (on the Poincare disk no two cells look alike), so they
   are all put into one shape together instead, made again each time.
   Past MAX_BLOCKS blocks, each stack is drawn as one solid column
   instead, so it stays quick.

   Contents:
     make3DView(box, height)       a 3D picture inside the element "box"
     drawStacks(view3d, stacks)    a floor with stacks of blocks on it
     drawSurface(view3d, surface)  a surface over a grid, with balls on it
     drawCells(view3d, cells)      cubes in space, and their convex hull
     resetCamera(view3d, toward)   look from the starting angle again
     setHeight(view3d, height)     make the picture taller or shorter (full screen popup)
   ===================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ConvexHull } from "three/addons/math/ConvexHull.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";


/* ---------------------------------------------------------------------
   Settings you might want to change
   --------------------------------------------------------------------- */

// Past this many blocks, each stack is drawn as one solid column. A coin
// has more corners than a cube, so fewer coins are drawn one by one, and
// tile-shaped blocks take more memory (each has its own corners).
const MAX_BLOCKS = { cubes: 250000, coins: 60000, tiles: 60000 };

// A block takes up this much of its cell's width, so neighboring stacks
// don't melt into each other, and this much of its own height, so you
// can count the blocks in a stack. (When there are many blocks, the
// gaps get too thin to see, and the stack looks like one column.)
const BLOCK_WIDTH = 0.88;
const BLOCK_HEIGHT = 0.86;

// On a round floor all blocks share one size, which shrinks as stacks
// reach smaller cells out toward the edge, but not below this part of
// the widest cell's width (the cell in the middle): cells smaller than
// that are too small to see stacks on anyway, so their blocks spill a
// little over their cell.
const SMALLEST_SHARED_WIDTH = 0.1;

// How round a coin is: the number of flat sides around it.
const COIN_SIDES = 24;

// The whole picture is shrunk to fit in a box this big, so it always
// looks the same size, however big the stacks get (as in 2D).
const PICTURE_SIZE = 2;

// Where the camera starts: this far from the middle of the picture,
// looking down at this angle (in degrees above the floor).
const CAMERA_DISTANCE = 3.0;
const CAMERA_ANGLE = 35;


/* ---------------------------------------------------------------------
   Making the 3D view
   --------------------------------------------------------------------- */

// Make a 3D picture filling the element "box" (a <div> on the page),
// "height" screen pixels tall and as wide as the box. Returns the
// "view3d", which drawStacks and drawSurface draw into.
export function make3DView(box, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);   // sharp on sharp screens
  box.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  // The light: a soft light from everywhere (sky above, ground below),
  // plus a "sun" from the upper left, so each side of a block gets its
  // own shade and the blocks look solid.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-2, 4, 3);
  scene.add(sun);

  // Everything that gets drawn goes in "world", which is shrunk to fit
  // the picture (see fitWorld).
  const world = new THREE.Group();
  scene.add(world);

  // Turning, zooming and sliding with the mouse or fingers. The picture
  // is drawn again only when something changes.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener("change", function () { render(view3d); });

  const view3d = {
    box: box, height: height, renderer: renderer, scene: scene, camera: camera,
    controls: controls, world: world,
    meshes: {},          // the shapes drawn, by name (see useMesh)
  };
  resetCamera(view3d);
  fitToBox(view3d);
  window.addEventListener("resize", function () { fitToBox(view3d); });
  return view3d;
}

// Look at the picture from the starting angle again. "toward"
// (optional) is the direction [x, y] on the floor to look in; the
// starting angle looks north, [0, 1].
export function resetCamera(view3d, toward) {
  const angle = CAMERA_ANGLE * Math.PI / 180, [tx, ty] = toward || [0, 1];
  const back = CAMERA_DISTANCE * Math.cos(angle) / Math.hypot(tx, ty);   // the camera stands behind, facing "toward"
  view3d.camera.position.set(-tx * back, CAMERA_DISTANCE * Math.sin(angle), ty * back);
  view3d.controls.target.set(0, 0.25, 0);
  view3d.controls.update();
  render(view3d);
}

// Make the picture "height" screen pixels tall (e.g. in the full screen popup).
export function setHeight(view3d, height) {
  view3d.height = height;
  fitToBox(view3d);
}

// Make the picture as wide as its box (after the window changes size).
function fitToBox(view3d) {
  const width = view3d.box.clientWidth || 300;
  view3d.width = width;
  view3d.renderer.setSize(width, view3d.height);
  view3d.camera.aspect = width / view3d.height;
  view3d.camera.updateProjectionMatrix();
  render(view3d);
}

function render(view3d) { view3d.renderer.render(view3d.scene, view3d.camera); }


/* ---------------------------------------------------------------------
   Shapes and colors
   --------------------------------------------------------------------- */

// The shape of one block: a cube, a coin or a ball, one unit wide and
// one unit tall, standing on the floor (its bottom at height 0).
function blockShape(shape) {
  const geometry = shape === "coins" ? new THREE.CylinderGeometry(0.5, 0.5, 1, COIN_SIDES)
    : shape === "balls" ? new THREE.SphereGeometry(0.5, 16, 12)
    : new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);   // from "centered at 0" to "standing on 0"
  return geometry;
}

// A shape with room for "count" copies, kept in view3d.meshes[name]. It
// is made again only when the shape changes or more room is needed.
function useMesh(view3d, name, shape, count) {
  let mesh = view3d.meshes[name];
  if (!mesh || mesh.userData.shape !== shape || mesh.userData.room < count) {
    if (mesh) dropMesh(view3d, mesh);
    const room = Math.max(64, 2 * count);           // room to grow, so this happens rarely
    mesh = new THREE.InstancedMesh(blockShape(shape), new THREE.MeshLambertMaterial(), room);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3 * room), 3);
    mesh.frustumCulled = false;                    // the copies move around; always draw them
    mesh.userData = { shape: shape, room: room };
    view3d.world.add(mesh);
    view3d.meshes[name] = mesh;
  }
  mesh.count = count;                              // draw this many copies
  return mesh;
}

// Take a mesh out of the picture and free its memory.
function dropMesh(view3d, mesh) {
  view3d.world.remove(mesh);
  mesh.geometry.dispose();
  if (mesh.dispose) mesh.dispose();   // (an InstancedMesh has more to free)
}

// Put copy number i of a mesh at (x, bottom, z), sized width x tall x
// width, in color rgb (three numbers 0..1, as three.js wants them).
// three.js keeps where each copy goes as a 4 x 4 "matrix"; for a shape
// that is only stretched and moved, it is these 16 numbers.
function placeCopy(mesh, i, x, bottom, z, width, tall, rgb) {
  const m = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
  m.set([width, 0, 0, 0,  0, tall, 0, 0,  0, 0, width, 0,  x, bottom, z, 1], 16 * i);
  c[3 * i] = rgb[0]; c[3 * i + 1] = rgb[1]; c[3 * i + 2] = rgb[2];
}

// A color [red, green, blue] (each 0..255, as on the page) in the form
// three.js draws with. (three.js mixes light in "linear" color, so the
// page's colors are converted; THREE.Color does that.)
const scratch = new THREE.Color();
function toThree(rgb) {
  scratch.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  return [scratch.r, scratch.g, scratch.b];
}


/* ---------------------------------------------------------------------
   Stacks of blocks
   --------------------------------------------------------------------- */

// Draw a floor with a stack of blocks on each cell. "stacks" has:
//   x, y        where each cell's middle is on the floor (lists of
//               numbers; y goes "north", away from where you start)
//   height      how many blocks each cell has (0: an empty cell, drawn
//               as a thin gray tile)
//   width       (optional) each cell's width; 1 if left out. Only the
//               blocks' width changes with it: every block is equally
//               tall, so a stack's height always shows how many blocks
//               it has. On a round floor (the Poincare disk, where cells
//               shrink toward the edge) every block instead gets the
//               same size, the width of the smallest cell with a block
//               (but at least SMALLEST_SHARED_WIDTH of the widest cell),
//               and as tall as that is wide: see "One size on a round
//               floor" below.
//   floor       the floor: a box { xmin, xmax, ymin, ymax } of cells, a
//               list of cells { x: [...], y: [...] } (e.g. a drawn
//               domain), or a round floor { disk: radius } centered at
//               (0, 0), drawn under everything
//   shape       "cubes", "coins" or "tiles" (each block in the shape of
//               its cell: give "corners")
//   corners     (for "tiles") each cell's corners on the floor, in
//               order around it: a list [[x, y], [x, y], ...] per cell.
//               A block is its cell shrunk toward the middle (x, y), to
//               the block's width over the cell's
//   stretch     how tall the stacks look: 1 is normal, 2 twice as tall
//   fixedSize   (optional) true: every block stays a cube however tall
//               the stacks get, and the picture fits the floor only, so
//               a tall stack shoots up out of the top of the picture
//   color(k, tallest, kind)   the color [r, g, b] (0..255) of block k
//               (the bottom one is k = 1) when the tallest stack has
//               "tallest" blocks; the top of each stack has the color a
//               top view gives that stack
//   kind        (optional) a whole number for each cell: cells of
//               different kinds can color their blocks differently, and
//               color gets the cell's kind (Sandpiles: the grains that
//               make the cell topple). 0 for every cell if left out.
//   empty, ground   colors [r, g, b] of the empty cells and of the floor
//   lines, lineColor    (optional) thin lines on the floor, e.g. the
//               tiling under the stacks: a list [x1, y1, x2, y2, ...],
//               one line from (x1, y1) to (x2, y2) and so on, and their
//               color [r, g, b]
//   topLines, topLineColor   (optional) lines over the tops of the
//               stacks, e.g. a path: a list [x1, y1, h1, x2, y2, h2, ...],
//               one line from (x1, y1) at the top of h1 blocks to (x2, y2)
//               at the top of h2 blocks, and so on, and their color
//
// Heights: a block starts out as tall as a cell of width 1 is wide (a
// cube; on a round floor, as tall as the shared width). Once the
// tallest stack would be more than half as tall as the floor is wide,
// every block is squashed so it is exactly that tall (unless
// fixedSize); "stretch" then makes it taller or flatter.
export function drawStacks(view3d, stacks) {
  const n = stacks.x.length, shape = stacks.shape;
  if (view3d.box.clientWidth && view3d.box.clientWidth !== view3d.width) fitToBox(view3d);   // the box changed size
  const widthOf = function (i) { return stacks.width ? stacks.width[i] : 1; };

  // The size of the floor, and the most blocks on a cell.
  const floor = floorBox(stacks);
  const across = stacks.floor.disk ? 2 * stacks.floor.disk
    : Math.max(floor.xmax - floor.xmin + 1, floor.ymax - floor.ymin + 1);
  let tallest = 0, blocks = 0, emptyCells = 0;
  for (let i = 0; i < n; i++) {
    tallest = Math.max(tallest, stacks.height[i]);
    blocks += stacks.height[i];
    if (stacks.height[i] === 0) emptyCells++;
  }
  // One size on a round floor: every block as wide as the smallest cell
  // that has a block (but at least SMALLEST_SHARED_WIDTH of the widest
  // cell), so the stacks farthest out fit their cells and every stack's
  // height is counted in the same blocks. Elsewhere "shared" is 1 and
  // each block is as wide as its own cell.
  let shared = 1;
  if (stacks.floor.disk) {
    let smallest = Infinity, widest = 0;
    for (let i = 0; i < n; i++) {
      widest = Math.max(widest, widthOf(i));
      if (stacks.height[i] > 0) smallest = Math.min(smallest, widthOf(i));
    }
    shared = smallest === Infinity ? 1 : Math.max(smallest, SMALLEST_SHARED_WIDTH * widest);
  }
  const blockWidth = function (i) { return stacks.floor.disk ? shared : widthOf(i); };

  // One block's height (a cube on a cell of width "shared", until the
  // tallest stack would be more than half as tall as the floor is wide;
  // with fixedSize, always a cube).
  const squash = stacks.fixedSize ? 1 : Math.min(1, across / 2 / Math.max(tallest * shared, 1e-9));
  const block = stacks.stretch * squash * shared;

  // The colors, worked out once per kind of cell and level (not once
  // per block): levelColors(kind)[k] is the color of the (k+1)-th block
  // from the bottom.
  const levels = new Map();
  const levelColors = function (kind) {
    if (!levels.has(kind)) {
      const list = [];
      for (let k = 0; k < tallest; k++) list.push(toThree(stacks.color(k + 1, tallest, kind)));
      levels.set(kind, list);
    }
    return levels.get(kind);
  };

  // The blocks: one by one, or one column per stack if there are too many.
  const oneByOne = blocks <= MAX_BLOCKS[shape];
  const blockMaker = makeBlocks(view3d, "blocks", stacks, function (i) {
    return oneByOne ? stacks.height[i] : Math.min(stacks.height[i], 1);
  });
  for (let i = 0; i < n; i++) {
    const h = stacks.height[i];
    if (h === 0) continue;
    const w = BLOCK_WIDTH * blockWidth(i);
    const levelColor = levelColors(stacks.kind ? stacks.kind[i] : 0);
    if (oneByOne) {
      for (let k = 0; k < h; k++) blockMaker.put(i, k * block, BLOCK_HEIGHT * block, w, levelColor[k]);
    } else {
      blockMaker.put(i, 0, h * block, w, levelColor[h - 1]);
    }
  }
  blockMaker.done();

  // The empty cells (available, but no block yet): thin gray tiles.
  const emptyMaker = makeBlocks(view3d, "empty", stacks, function (i) { return stacks.height[i] === 0 ? 1 : 0; });
  const emptyColor = toThree(stacks.empty);
  for (let i = 0; i < n; i++) {
    if (stacks.height[i] === 0) emptyMaker.put(i, 0, 0.05, BLOCK_WIDTH * widthOf(i), emptyColor);
  }
  emptyMaker.done();

  // The floor: flat square tiles, a little below the blocks, or one
  // flat round coin for a round floor.
  const floorCells = stacks.floor.x ? stacks.floor : null;
  const floorCount = floorCells ? floorCells.x.length : 1;
  const floorMesh = useMesh(view3d, "floor", stacks.floor.disk ? "coins" : "cubes", floorCount);
  const groundColor = toThree(stacks.ground);
  if (stacks.floor.disk) {
    placeCopy(floorMesh, 0, 0, -0.04, 0, 2 * stacks.floor.disk, 0.04, groundColor);
  } else if (floorCells) {
    for (let i = 0; i < floorCount; i++) placeCopy(floorMesh, i, floorCells.x[i], -0.04, -floorCells.y[i], 1, 0.04, groundColor);
  } else {
    placeFloorBox(floorMesh, floor, groundColor);
  }
  floorMesh.instanceMatrix.needsUpdate = floorMesh.instanceColor.needsUpdate = true;
  drawLines(view3d, stacks.lines || NO_LINES, stacks.lineColor);
  drawTopLines(view3d, stacks.topLines || NO_LINES, block, stacks.topLineColor);
  fitWorld(view3d, floor, across, stacks.fixedSize ? 0 : tallest * block);
  render(view3d);
}

// One big flat box under a whole box floor { xmin, xmax, ymin, ymax }:
// copy 0 of "mesh", stretched to size, in color rgb (from toThree).
function placeFloorBox(mesh, floor, rgb) {
  const width = floor.xmax - floor.xmin + 1, depth = floor.ymax - floor.ymin + 1;
  mesh.instanceMatrix.array.set([width, 0, 0, 0,  0, 0.04, 0, 0,  0, 0, depth, 0,
    (floor.xmin + floor.xmax) / 2, -0.04, -(floor.ymin + floor.ymax) / 2, 1], 0);
  mesh.instanceColor.array.set(rgb, 0);
}

// Shrink the whole picture to fit: the floor's middle at the center,
// and the floor ("across" wide) or the picture's height ("tall", if it
// is taller) PICTURE_SIZE across.
function fitWorld(view3d, floor, across, tall) {
  const scale = PICTURE_SIZE / Math.max(across, tall);
  view3d.world.scale.setScalar(scale);
  view3d.world.position.set(-scale * (floor.xmin + floor.xmax) / 2, -scale * tall / 4,
                            scale * (floor.ymin + floor.ymax) / 2);
}

// The thin lines on the floor, just above it. They are built again only
// when the list of lines is a new one.
const NO_LINES = [];
function drawLines(view3d, lines, rgb) {
  const segments = lineSegments(view3d, "lines", lines.length > 0, rgb);
  if (segments.userData.from === lines) return;
  segments.userData.from = lines;
  const points = new Float32Array(3 * lines.length / 2);    // (x, height, z) for each end
  for (let k = 0; k < lines.length / 2; k++) {
    points[3 * k] = lines[2 * k];
    points[3 * k + 1] = 0.002;
    points[3 * k + 2] = -lines[2 * k + 1];
  }
  setPoints(segments, points);
}

// The lines over the tops of the stacks (topLines, in drawStacks), each
// block "block" tall. They are built again every time, since the
// blocks' height changes as the stacks grow.
function drawTopLines(view3d, lines, block, rgb) {
  const segments = lineSegments(view3d, "topLines", lines.length > 0, rgb);
  const points = new Float32Array(lines.length);            // (x, height, z) for each end
  for (let k = 0; k < lines.length / 3; k++) {
    points[3 * k] = lines[3 * k];
    points[3 * k + 1] = lines[3 * k + 2] * block + 0.01;
    points[3 * k + 2] = -lines[3 * k + 1];
  }
  setPoints(segments, points);
}

// The view's lines called "name" (made the first time), shown or not,
// in the color rgb (if given). three.js draws them as "LineSegments":
// a list of points, joined two by two.
function lineSegments(view3d, name, show, rgb) {
  if (!view3d[name]) {
    view3d[name] = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    view3d[name].frustumCulled = false;
    view3d.world.add(view3d[name]);
  }
  const segments = view3d[name];
  segments.visible = show;
  if (rgb) segments.material.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  return segments;
}

// New points for some lines: (x, height, z) for each end.
function setPoints(segments, points) {
  segments.geometry.dispose();
  segments.geometry = new THREE.BufferGeometry();
  segments.geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
}

// The smallest box { xmin, xmax, ymin, ymax } around the floor.
function floorBox(stacks) {
  const f = stacks.floor;
  if (f.disk) return { xmin: -f.disk, xmax: f.disk, ymin: -f.disk, ymax: f.disk };
  if (!f.x) return f;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < f.x.length; i++) {
    xmin = Math.min(xmin, f.x[i]); xmax = Math.max(xmax, f.x[i]);
    ymin = Math.min(ymin, f.y[i]); ymax = Math.max(ymax, f.y[i]);
  }
  return { xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax };
}

// Room for the blocks of drawStacks in the mesh view3d.meshes[name]:
// blocksOn(i) of them on cell i. Returns
//   put(i, bottom, tall, width, rgb)   one more block on cell i, from
//                height "bottom" up, "tall" high and "width" wide
//   done()     tell three.js the blocks changed (after the last put)
// Cubes and coins are copies of one shape (useMesh); tile-shaped blocks
// are prisms put together into one shape (useTileMesh).
function makeBlocks(view3d, name, stacks, blocksOn) {
  const n = stacks.x.length;
  if (stacks.shape !== "tiles") {
    let count = 0;
    for (let i = 0; i < n; i++) count += blocksOn(i);
    const mesh = useMesh(view3d, name, stacks.shape, count);
    let copy = 0;
    return {
      put: function (i, bottom, tall, width, rgb) {
        placeCopy(mesh, copy++, stacks.x[i], bottom, -stacks.y[i], width, tall, rgb);
      },
      done: function () { mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true; },
    };
  }
  let points = 0, triangles = 0;
  for (let i = 0; i < n; i++) {
    const p = stacks.corners[i].length;
    points += blocksOn(i) * 2 * p;
    triangles += blocksOn(i) * (3 * p - 2);
  }
  const mesh = useTileMesh(view3d, name, points, triangles);
  return {
    put: function (i, bottom, tall, width, rgb) {
      const shrink = width / (stacks.width ? stacks.width[i] : 1);
      addPrism(mesh, stacks.corners[i], stacks.x[i], stacks.y[i], shrink, bottom, tall, rgb);
    },
    done: function () {
      const geometry = mesh.geometry;
      geometry.setDrawRange(0, 3 * mesh.userData.triangles);
      geometry.attributes.position.needsUpdate = geometry.attributes.color.needsUpdate = true;
      geometry.index.needsUpdate = true;
    },
  };
}

// A shape for tile-shaped blocks with room for "points" corners and
// "triangles" triangles, kept in view3d.meshes[name] like useMesh, and
// emptied. Each triangle is shaded flat (flatShading), so the prisms'
// sides can share their corners with the top and still look sharp.
function useTileMesh(view3d, name, points, triangles) {
  let mesh = view3d.meshes[name];
  if (!mesh || mesh.userData.shape !== "tiles" || mesh.userData.room < points || mesh.userData.triangleRoom < triangles) {
    if (mesh) dropMesh(view3d, mesh);
    const room = Math.max(256, 2 * points), triangleRoom = Math.max(256, 2 * triangles);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * room), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(3 * room), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(3 * triangleRoom), 1));
    mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    mesh.userData = { shape: "tiles", room: room, triangleRoom: triangleRoom };
    view3d.world.add(mesh);
    view3d.meshes[name] = mesh;
  }
  mesh.userData.points = mesh.userData.triangles = 0;
  return mesh;
}

// Add to a tile mesh one block: the polygon "corners" ([[x, y], ...] on
// the floor) shrunk by "shrink" toward (mx, my), stood up from height
// "bottom" to bottom + tall, in color rgb (from toThree). Its corners
// are p points on the bottom, then p on the top; each side is two
// triangles, and the top is cut into p - 2 (topTriangles). The bottom
// is left open: it is never seen, standing on the floor or a block.
function addPrism(mesh, corners, mx, my, shrink, bottom, tall, rgb) {
  const u = mesh.userData, p = corners.length, first = u.points;
  const where = mesh.geometry.attributes.position.array, color = mesh.geometry.attributes.color.array;
  const index = mesh.geometry.index.array;
  for (let k = 0; k < p; k++) {
    const x = mx + shrink * (corners[k][0] - mx), z = -(my + shrink * (corners[k][1] - my));
    where.set([x, bottom, z], 3 * (first + k));
    where.set([x, bottom + tall, z], 3 * (first + p + k));
    color.set(rgb, 3 * (first + k));
    color.set(rgb, 3 * (first + p + k));
  }
  let t = 3 * u.triangles;
  for (let k = 0; k < p; k++) {
    const next = (k + 1) % p;
    index.set([first + k, first + next, first + p + next,  first + k, first + p + next, first + p + k], t);
    t += 6;
  }
  for (const [a, b, c] of topTriangles(corners)) {
    index.set([first + p + a, first + p + b, first + p + c], t);
    t += 3;
  }
  u.points += 2 * p;
  u.triangles = t / 3;
}

// A polygon cut into triangles, as lists [a, b, c] of corner numbers. A
// convex one is a fan from corner 0. Others (like a Penrose dart) are cut
// by three.js (ShapeUtils, the "earcut" method), once per shape: their
// cuts are kept, keyed by the corners' positions around the first one.
const cutsKept = new Map();
function topTriangles(corners) {
  const p = corners.length;
  if (isConvex(corners)) {
    const fan = [];
    for (let k = 1; k < p - 1; k++) fan.push([0, k, k + 1]);
    return fan;
  }
  const [x0, y0] = corners[0];
  const key = corners.map(function ([x, y]) { return (x - x0).toFixed(3) + "," + (y - y0).toFixed(3); }).join(" ");
  if (!cutsKept.has(key)) {
    const outline = corners.map(function ([x, y]) { return new THREE.Vector2(x, y); });
    cutsKept.set(key, THREE.ShapeUtils.triangulateShape(outline, []));
  }
  return cutsKept.get(key);
}

// Whether a polygon is convex: going around it, it always turns the
// same way.
function isConvex(corners) {
  const p = corners.length;
  let left = false, right = false;
  for (let k = 0; k < p; k++) {
    const [ax, ay] = corners[k], [bx, by] = corners[(k + 1) % p], [cx, cy] = corners[(k + 2) % p];
    const turn = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (turn > 1e-12) left = true;
    if (turn < -1e-12) right = true;
  }
  return !(left && right);
}


/* ---------------------------------------------------------------------
   Surfaces
   --------------------------------------------------------------------- */

// Draw a colored surface over a grid, like a graph z = h(x, y) in Desmos
// 3D, with a row of balls on it joined by a line. "surface" has:
//   size        the grid: the points (x, y) with x and y from 0 to size - 1
//   height      each point's height, from 0 to 1, in a list where point
//               (x, y) is number x + size * y; NaN where there is no surface
//   show        false to hide the surface (the floor and balls still show)
//   color(t)    the color [r, g, b] (0..255) of height t
//   balls       { x: [...], y: [...], height: [...] }: a ball at each
//               (x, y), at that height, joined in order by a line
//   ballColor   the balls' and their line's color [r, g, b]
//   ground      the floor's color [r, g, b]
//   lines, lineColor    thin lines on the floor, as in drawStacks
//   stretch     how tall: height 1 is drawn a quarter as tall as the
//               floor is wide, times "stretch"
//
// How the surface is drawn: every square of the grid is cut into two
// triangles along a diagonal. Each triangle is flat (three points always
// lie on one plane), and its color fades evenly ("linearly") from one
// corner's color to the next, so the whole surface is smooth in color.
// A triangle with a corner where there is no surface is left out.
export function drawSurface(view3d, surface) {
  if (view3d.box.clientWidth && view3d.box.clientWidth !== view3d.width) fitToBox(view3d);   // the box changed size
  const n = surface.size, top = surface.stretch * n / 4;   // the height of 1, in cells

  // The surface: one corner ("vertex") per grid point, with its place
  // and color, and a list of triangles, three corner numbers each.
  // three.js colors each triangle from its corners' colors.
  const places = new Float32Array(3 * n * n), colors = new Float32Array(3 * n * n);
  const palette = [];                      // 256 colors, worked out once
  for (let k = 0; k < 256; k++) palette.push(toThree(surface.color(k / 255)));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = x + n * y, h = surface.height[p];
      places.set([x, (isNaN(h) ? 0 : h * top) + 0.03, -y], 3 * p);   // a hair above the floor, so they don't flicker into each other
      colors.set(palette[isNaN(h) ? 0 : Math.round(255 * Math.min(Math.max(h, 0), 1))], 3 * p);
    }
  }
  const triangles = [];
  const there = function (p) { return !isNaN(surface.height[p]); };
  for (let y = 0; y + 1 < n; y++) {
    for (let x = 0; x + 1 < n; x++) {
      const p = x + n * y, right = p + 1, up = p + n, upRight = p + n + 1;
      if (there(p) && there(right) && there(upRight)) triangles.push(p, right, upRight);
      if (there(p) && there(upRight) && there(up)) triangles.push(p, upRight, up);
    }
  }
  if (!view3d.surface) {
    // DoubleSide: both sides of the surface show (it can be seen from below).
    view3d.surface = new THREE.Mesh(new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    view3d.world.add(view3d.surface);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(places, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();         // which way each corner faces, for the light
  view3d.surface.geometry.dispose();
  view3d.surface.geometry = geometry;
  view3d.surface.visible = surface.show !== false;

  // The balls, a little bigger than a cell so they show on a big grid,
  // their middles on the surface.
  const balls = surface.balls, count = balls.x.length;
  const ballMesh = useMesh(view3d, "balls", "balls", count);
  const ballColor = toThree(surface.ballColor), diameter = Math.max(0.6, n / 60);
  const path = new Float32Array(3 * count);
  for (let i = 0; i < count; i++) {
    const h = balls.height[i] * top;
    placeCopy(ballMesh, i, balls.x[i], h - diameter / 2, -balls.y[i], diameter, diameter, ballColor);
    path.set([balls.x[i], h, -balls.y[i]], 3 * i);
  }
  ballMesh.instanceMatrix.needsUpdate = ballMesh.instanceColor.needsUpdate = true;
  if (!view3d.ballLine) {
    view3d.ballLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    view3d.ballLine.frustumCulled = false;
    view3d.world.add(view3d.ballLine);
  }
  view3d.ballLine.geometry.dispose();
  view3d.ballLine.geometry = new THREE.BufferGeometry();
  view3d.ballLine.geometry.setAttribute("position", new THREE.BufferAttribute(path, 3));
  view3d.ballLine.material.color.setRGB(...ballColor);   // already linear

  // The floor: one flat box under the grid, with the lines on it.
  const floor = { xmin: 0, xmax: n - 1, ymin: 0, ymax: n - 1 };
  const floorMesh = useMesh(view3d, "floor", "cubes", 1);
  placeFloorBox(floorMesh, floor, toThree(surface.ground));
  floorMesh.instanceMatrix.needsUpdate = floorMesh.instanceColor.needsUpdate = true;
  drawLines(view3d, surface.lines || NO_LINES, surface.lineColor);
  fitWorld(view3d, floor, 1.2 * n, top);   // a little room around the floor
  render(view3d);
}


/* ---------------------------------------------------------------------
   Cells in space
   --------------------------------------------------------------------- */

// Draw one cube per cell of the cubic grid, a ball where the walker is,
// and the convex hull of some points as a see-through solid. "cells" has:
//   x, y, z     each cell's place (lists of whole numbers; x goes right,
//               y away from where you start, z up)
//   color(i)    cell i's color [r, g, b] (0..255)
//   at          [x, y, z]: where the ball goes (the walker), and
//   atColor     its color [r, g, b]
//   hull        (optional) the points to take the convex hull of, as
//               x0, y0, z0, x1, ... (in the same places as the cells)
//   hullColor   its color [r, g, b]
// Past MAX_BLOCKS.cubes cells, only the last ones in the list are drawn.
// Returns the hull's surface area and volume, { area, volume } (both 0
// while the points are all on one plane), found by three.js's
// ConvexHull (the "Quickhull" algorithm: C. B. Barber, D. P. Dobkin
// and H. Huhdanpaa, "The Quickhull algorithm for convex hulls", ACM
// Trans. Math. Software 22 (1996) 469-483).
export function drawCells(view3d, cells) {
  if (view3d.box.clientWidth && view3d.box.clientWidth !== view3d.width) fitToBox(view3d);   // the box changed size
  const n = cells.x.length, from = Math.max(0, n - MAX_BLOCKS.cubes);
  // three.js has "up" as its second number, and its third pointing
  // toward you, so the cell (x, y, z) goes at (x, z, -y).
  const blockMesh = useMesh(view3d, "blocks", "cubes", n - from);
  let low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let i = from; i < n; i++) {
    const place = [cells.x[i], cells.z[i], -cells.y[i]];
    for (let c = 0; c < 3; c++) { low[c] = Math.min(low[c], place[c]); high[c] = Math.max(high[c], place[c]); }
    placeCopy(blockMesh, i - from, place[0], place[1] - BLOCK_WIDTH / 2, place[2], BLOCK_WIDTH, BLOCK_WIDTH, toThree(cells.color(i)));
  }
  blockMesh.instanceMatrix.needsUpdate = blockMesh.instanceColor.needsUpdate = true;

  const ball = useMesh(view3d, "walker", "balls", 1);
  const [ax, ay, az] = cells.at;
  placeCopy(ball, 0, ax, az - 0.6, -ay, 1.2, 1.2, toThree(cells.atColor));
  ball.instanceMatrix.needsUpdate = ball.instanceColor.needsUpdate = true;

  // The hull: its measures, and a see-through solid.
  const measures = { area: 0, volume: 0 };
  const points = [];
  if (cells.hull) {
    for (let k = 0; k < cells.hull.length; k += 3) {
      points.push(new THREE.Vector3(cells.hull[k], cells.hull[k + 2], -cells.hull[k + 1]));
    }
  }
  let solid = null;
  if (points.length >= 4) {
    try {
      const hull = new ConvexHull().setFromPoints(points);
      for (const face of hull.faces) {
        // A face's area, and its plane's distance from (0, 0, 0)
        // ("constant"): the volume is the sum of the pyramids from
        // (0, 0, 0) on the faces, area x distance / 3.
        measures.area += face.area;
        measures.volume += face.area * face.constant / 3;
      }
      if (!(isFinite(measures.area) && isFinite(measures.volume) && measures.volume > 1e-9)) {
        measures.area = measures.volume = 0;          // flat: all the points on one plane
      } else {
        solid = new ConvexGeometry(points);
      }
    } catch (error) {
      measures.area = measures.volume = 0;
    }
  }
  if (!view3d.hull) {
    view3d.hull = new THREE.Mesh(new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    view3d.world.add(view3d.hull);
  }
  view3d.hull.geometry.dispose();
  view3d.hull.geometry = solid || new THREE.BufferGeometry();
  view3d.hull.visible = Boolean(solid);
  if (cells.hullColor) view3d.hull.material.color.setRGB(...toThree(cells.hullColor));

  // Shrink the whole picture to fit, with its middle at the center (and
  // room to spare, so it still fits when turned around).
  const across = 1.4 * (Math.max(high[0] - low[0], high[1] - low[1], high[2] - low[2], 1) + 2);
  const scale = PICTURE_SIZE / across;
  view3d.world.scale.setScalar(scale);
  view3d.world.position.set(-scale * (low[0] + high[0]) / 2, -scale * (low[1] + high[1]) / 2 + 0.25,
                            -scale * (low[2] + high[2]) / 2);
  render(view3d);
  return measures;
}
