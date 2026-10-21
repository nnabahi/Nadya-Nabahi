# Wants

Things nadya wants on the site later, but not now. Each line says what it
is and where the details are. When one gets built, it moves out of here
(and into SIMS.md if it is a new sim).

## Eden Growth

- **A real 3D Eden model**: growth on the cubic lattice (cells are unit
  cubes), not just the 2D mountain drawn in 3D.
- **Holes in 3D**: with the 3D model, the 3D version of the holes charts
  (cavities, Betti number 2), as in F. Manin, É. Roldán and
  B. Schweinhart, "Topology and local geometry of the Eden model",
  Discrete & Computational Geometry (2023), arXiv:2005.12349. The 2D
  holes are on the page (holeHistory in eden-growth-rule.js).
- **The bacteria rule**: a random bacterium copies itself into its own cell
  or into a neighbor (or only into an empty neighbor). Today's rule is not a
  special case of it, so it would be a second rule to switch to.
- **Highlight all cells of height h**: pick a height h and every cell
  (or stack) of another height fades, even in the 3D view, where the
  other cubes or coins turn gray or see-through. Sandpiles too (both
  sims are height functions). nadya, 2026-10-21; the click-to-highlight
  of a region (js/sim-highlight.js) is the closest thing today.

## Sandpiles

- **Highlight all cells of height h**: as for Eden Growth above, also in
  the 3D view.

## Random Walk

- **3D holes**: tunnels (beta_1) and cavities (beta_2) of the visited
  cubes, and the 3D outer boundary. The 2D holes are on the page.
- **The 3D hull over time**: today the page shows the hull's surface area
  and volume now (worked out by three.js when it draws); charts over time
  would need a 3D hull in the second thread.
- **Box-counting dimension** of the visited set (left out of the first
  version, 2026-10-15).
- **Other lattices and more walkers**: the walk on triangles or hexagons,
  several walkers, cut points of the path (Brownian cut points have
  dimension 3/4: Lawler, Schramm and Werner).

## Ising & Potts

- **The exact Ising critical point on every tiling**: today the β_c
  button shows only on the square grid, triangles, hexagons and the
  corners of kagome. For Ising (q = 2) on any doubly periodic planar
  graph, β_c is the root of an equation built from the graph's repeating
  block: D. Cimasoni and H. Duminil-Copin, "The critical temperature for
  the Ising model on planar doubly periodic graphs", Electronic Journal of
  Probability 18 (2013), paper 44. A. Codello, "Exact Curie temperature
  for the Ising model on Archimedean and Laves lattices", Journal of
  Physics A 43 (2010) 385002, lists the values for the 11 Archimedean
  tilings and their duals, to check against.

## Uniform Spanning Tree

From nadya's Lyons and Peres figures (plan:
/mnt/project-files/spanning-tree/plan.md, in the project's files).

- **The forest**: the wired uniform spanning forest, the boundary glued
  into one root (Fig 10.2, distances to the outer boundary in 3D).
  Wilson's algorithm already takes several roots (newWilson,
  js/sim-spanning.js). nadya, 2026-10-21: "forget the forest for now".
- **Net turns** (Fig 2.5): left turns minus right turns along the tree
  path from a fixed cell (planar pictures only).
- **The Peano curve** (Fig 4.11): the curve around the tree, its hue
  showing progress along it (planar pictures only).
- **Square tilings** (Figs 9.4, 9.5): Brooks, Smith, Stone and Tutte's
  squares from a unit current, in a rectangle (corner to corner) or a
  cylinder (middle to boundary). Linked to the tree by Kirchhoff: the
  current through an edge is the chance the tree path crosses it
  forward minus backward. nadya: net turns, the Peano curve and the
  square tilings go together, later.
