/* =====================================================================
   sim-3d.js  —  the 3D view shared by the sims
   ---------------------------------------------------------------------
   What it does, in plain words:
     Draws a 3D picture that you can turn around with the mouse or your
     fingers. For now it draws STACKS: a floor of cells, and on each
     cell a stack of blocks (cubes or coins) as tall as that cell's
     height. The random mountain uses it; later sims (a 3D random walk,
     mountains on other graphs) will add their own kinds of pictures
     here.

       drag (left mouse, one finger)     turn the picture around
       mouse wheel, or pinch             zoom in or out
       right drag, or two fingers        slide the picture

   It uses three.js (https://threejs.org), the standard library for 3D
   in the browser, loaded from the internet like KaTeX. three.js is
   written as a "module" (a file that says which other files it needs
   with "import"), so this file is a module too. A sim page loads it
   only when its 3D view is first switched on:
       const sim3d = await import("../js/sim-3d.js");
   and the page's <script type="importmap"> says where on the internet
   "three" lives. Pages that never switch to 3D never load three.js.

   How the blocks are drawn: a picture can have hundreds of thousands
   of blocks, all the same shape. three.js draws all of them in one go
   with an "InstancedMesh": one shape, plus a list saying where each
   copy goes, how big it is, and its color. Past MAX_BLOCKS blocks,
   each stack is drawn as one solid column instead, so it stays quick.

   Contents:
     make3DView(box, height)       a 3D picture inside the element "box"
     drawStacks(view3d, stacks)    a floor with stacks of blocks on it
     resetCamera(view3d)           look from the starting angle again
   ===================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


/* ---------------------------------------------------------------------
   Settings you might want to change
   --------------------------------------------------------------------- */

// Past this many blocks, each stack is drawn as one solid column. A coin
// has more corners than a cube, so fewer coins are drawn one by one.
const MAX_BLOCKS = { cubes: 250000, coins: 60000 };

// A block takes up this much of its cell's width, so neighboring stacks
// don't melt into each other, and this much of its own height, so you
// can count the blocks in a stack. (When there are many blocks, the
// gaps get too thin to see, and the stack looks like one column.)
const BLOCK_WIDTH = 0.88;
const BLOCK_HEIGHT = 0.86;

// How round a coin is: the number of flat sides around it.
const COIN_SIDES = 24;

// The whole picture is shrunk to fit in a box this big, so it always
// looks the same size, however big the mountain gets (as in 2D).
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
// "view3d", which drawStacks draws into.
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
  // the picture (see drawStacks).
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

// Look at the picture from the starting angle again.
export function resetCamera(view3d) {
  const angle = CAMERA_ANGLE * Math.PI / 180;
  view3d.camera.position.set(0, CAMERA_DISTANCE * Math.sin(angle), CAMERA_DISTANCE * Math.cos(angle));
  view3d.controls.target.set(0, 0.25, 0);
  view3d.controls.update();
  render(view3d);
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

// The shape of one block: a cube or a coin, one unit wide and one unit
// tall, standing on the floor (its bottom at height 0).
function blockShape(shape) {
  const geometry = shape === "coins"
    ? new THREE.CylinderGeometry(0.5, 0.5, 1, COIN_SIDES)
    : new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);   // from "centered at 0" to "standing on 0"
  return geometry;
}

// A shape with room for "count" copies, kept in view3d.meshes[name]. It
// is made again only when the shape changes or more room is needed.
function useMesh(view3d, name, shape, count) {
  let mesh = view3d.meshes[name];
  if (!mesh || mesh.userData.shape !== shape || mesh.userData.room < count) {
    if (mesh) {
      view3d.world.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
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
//   width       (optional) each cell's width; 1 if left out. A cell's
//               blocks are as much taller or shorter as the cell is
//               wider or narrower (so on the Poincare disk, where cells
//               shrink toward the edge, whole stacks shrink with them).
//   floor       the floor: a box { xmin, xmax, ymin, ymax } of cells, a
//               list of cells { x: [...], y: [...] } (e.g. a drawn
//               domain), or a round floor { disk: radius } centered at
//               (0, 0), drawn under everything
//   shape       "cubes" or "coins"
//   stretch     how tall the stacks look: 1 is normal, 2 twice as tall
//   color(k, tallest)   the color [r, g, b] (0..255) of block k (the
//               bottom one is k = 1) when the tallest stack has
//               "tallest" blocks; the top of each stack has the color a
//               top view gives that stack
//   empty, ground   colors [r, g, b] of the empty cells and of the floor
//
// Heights: a block starts out as tall as it is wide. Once the tallest
// stack would be more than half as tall as the floor is wide, every
// block is squashed so it is exactly that tall; "stretch" then makes it
// taller or flatter.
export function drawStacks(view3d, stacks) {
  const n = stacks.x.length, shape = stacks.shape;
  if (view3d.box.clientWidth && view3d.box.clientWidth !== view3d.width) fitToBox(view3d);   // the box changed size
  const widthOf = function (i) { return stacks.width ? stacks.width[i] : 1; };

  // The size of the floor, the most blocks on a cell, and the tallest
  // stack (in cell widths: a block on a cell of width w is w tall).
  const floor = floorBox(stacks);
  const across = stacks.floor.disk ? 2 * stacks.floor.disk
    : Math.max(floor.xmax - floor.xmin + 1, floor.ymax - floor.ymin + 1);
  let tallest = 0, tallestStack = 0, blocks = 0, emptyCells = 0;
  for (let i = 0; i < n; i++) {
    tallest = Math.max(tallest, stacks.height[i]);
    tallestStack = Math.max(tallestStack, stacks.height[i] * widthOf(i));
    blocks += stacks.height[i];
    if (stacks.height[i] === 0) emptyCells++;
  }
  // One block's height on a cell of width 1.
  const block = stacks.stretch * Math.min(1, across / 2 / Math.max(tallestStack, 1));

  // The colors, worked out once per level (not once per block):
  // levelColor[k] is the color of the (k+1)-th block from the bottom.
  const levelColor = [];
  for (let k = 0; k < tallest; k++) levelColor.push(toThree(stacks.color(k + 1, tallest)));

  // The blocks: one by one, or one column per stack if there are too many.
  const oneByOne = blocks <= MAX_BLOCKS[shape];
  const blockMesh = useMesh(view3d, "blocks", shape, oneByOne ? blocks : n - emptyCells);
  let copy = 0;
  for (let i = 0; i < n; i++) {
    const h = stacks.height[i];
    if (h === 0) continue;
    const x = stacks.x[i], z = -stacks.y[i], w = BLOCK_WIDTH * widthOf(i), tall = block * widthOf(i);
    if (oneByOne) {
      for (let k = 0; k < h; k++) placeCopy(blockMesh, copy++, x, k * tall, z, w, BLOCK_HEIGHT * tall, levelColor[k]);
    } else {
      placeCopy(blockMesh, copy++, x, 0, z, w, h * tall, levelColor[h - 1]);
    }
  }
  blockMesh.instanceMatrix.needsUpdate = blockMesh.instanceColor.needsUpdate = true;

  // The empty cells (available, but no block yet): thin gray tiles.
  const emptyMesh = useMesh(view3d, "empty", shape, emptyCells);
  const emptyColor = toThree(stacks.empty);
  copy = 0;
  for (let i = 0; i < n; i++) {
    if (stacks.height[i] !== 0) continue;
    placeCopy(emptyMesh, copy++, stacks.x[i], 0, -stacks.y[i], BLOCK_WIDTH * widthOf(i), 0.05, emptyColor);
  }
  emptyMesh.instanceMatrix.needsUpdate = emptyMesh.instanceColor.needsUpdate = true;

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
    // One big flat box under the whole floor (it is stretched to size).
    const width = floor.xmax - floor.xmin + 1, depth = floor.ymax - floor.ymin + 1;
    const m = floorMesh.instanceMatrix.array;
    m.set([width, 0, 0, 0,  0, 0.04, 0, 0,  0, 0, depth, 0,
           (floor.xmin + floor.xmax) / 2, -0.04, -(floor.ymin + floor.ymax) / 2, 1], 0);
    floorMesh.instanceColor.array.set(groundColor, 0);
  }
  floorMesh.instanceMatrix.needsUpdate = floorMesh.instanceColor.needsUpdate = true;

  // Shrink the whole picture to fit: the floor's middle at the center,
  // and the floor (or the tallest stack, if it is taller) PICTURE_SIZE
  // across.
  const size = Math.max(across, tallestStack * block);
  const scale = PICTURE_SIZE / size;
  view3d.world.scale.setScalar(scale);
  view3d.world.position.set(-scale * (floor.xmin + floor.xmax) / 2, -scale * tallestStack * block / 4,
                            scale * (floor.ymin + floor.ymax) / 2);
  render(view3d);
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
