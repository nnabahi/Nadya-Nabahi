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

## Site Percolation

From Scott Sheffield's work (nadya, 2026-10-21: "in full generality",
since the site should be a bit extravagant in what it can simulate).

- **Exploration paths and CLE(6), on every graph the page offers**: draw
  the interface between open and closed clusters (one exploration path
  from the boundary, or every loop at once). On the triangular lattice
  these converge to SLE(6) and CLE(6): S. Smirnov, "Critical percolation
  in the plane", C. R. Acad. Sci. Paris 333 (2001) 239-244;
  F. Camia and C. Newman, "Two-dimensional critical percolation: the full
  scaling limit", Comm. Math. Phys. 268 (2006) 1-38; the loop ensembles
  are from S. Sheffield, "Exploration trees and conformal loop
  ensembles", Duke Math. J. 147 (2009) 79-129. On other lattices the
  same limit is only conjectured. Note: site interfaces are clean only on
  triangulations (every face a triangle); on other graphs we must choose
  a rule (for example, closed sites connect diagonally, the "matching"
  graph), so that needs a decision when built.
- **Random-turn Hex**: a playable game on the same board. Each turn a
  coin picks who moves; optimal play matches the percolation crossing
  probability. Y. Peres, O. Schramm, S. Sheffield and D. Wilson,
  "Random-turn Hex and other selection games", Amer. Math. Monthly 114
  (2007) 373-387.

## Gaussian free field (new sim)

From Scott Sheffield's work, nadya 2026-10-21.

- **The discrete GFF**: an exact sample on any domain (one linear solve),
  shown with the 3D height view. S. Sheffield, "Gaussian free fields for
  mathematicians", Probab. Theory Related Fields 139 (2007) 521-541.
- **Its level lines**: the zero contour line converges to SLE(4).
  O. Schramm and S. Sheffield, "Contour lines of the two-dimensional
  discrete Gaussian free field", Acta Math. 202 (2009) 21-137.
- **The LQG area measure**: e^{γh}dx, drawn as dyadic squares that each
  hold the same quantum area. Approximate (h has to be smoothed), as in
  the definition. B. Duplantier and S. Sheffield, "Liouville quantum
  gravity and KPZ", Invent. Math. 185 (2011) 333-393.
- **Imaginary geometry flow lines**: only rough pictures are possible,
  since h is not a function. J. Miller and S. Sheffield, "Imaginary
  geometry I: interacting SLEs", Probab. Theory Related Fields 164 (2016)
  553-705.

## First passage percolation (queued)

- **LQG geodesics**: FPP with edge weights e^{ξh} on a GFF sample
  ("Liouville FPP"), from Scott Sheffield's work, nadya 2026-10-21.
  J. Ding, J. Dubédat, A. Dunlap and H. Falconet, "Tightness of Liouville
  first passage percolation for γ in (0,2)", Publ. Math. IHÉS 132 (2020)
  353-403; E. Gwynne and J. Miller, "Existence and uniqueness of the
  Liouville quantum gravity metric for γ in (0,2)", Invent. Math. 223
  (2021) 213-333.

## Internal DLA (queued as "inside DLA")

- **Fluctuations**: the picture of how far the cluster is from a disk,
  from Scott Sheffield's work, nadya 2026-10-21. The fluctuations are
  logarithmic and converge to a variant of the GFF: D. Jerison, L. Levine
  and S. Sheffield, "Logarithmic fluctuations for internal DLA", J. Amer.
  Math. Soc. 25 (2012) 271-301, and "Internal DLA and the Gaussian free
  field", Duke Math. J. 163 (2014) 267-308.

## Tree-weighted random planar maps (new sim)

From Scott Sheffield's work (the animations from his ICM talk "What is a
random surface?"), nadya 2026-10-21.

- **Exact sampling**: a uniform planar map with a marked spanning tree is
  encoded by a hamburger-cheeseburger word, a walk in the quarter plane.
  R. Mullin, "On the enumeration of tree-rooted maps", Canad. J. Math. 19
  (1967) 174-183; S. Sheffield, "Quantum gravity and inventory
  accumulation", Ann. Probab. 44 (2016) 3804-3848.
- **Drawing it**: the Tutte embedding is one large linear solve (E. Gwynne,
  J. Miller and S. Sheffield, "The Tutte embedding of the mated-CRT map
  converges to Liouville quantum gravity", Ann. Probab. 49 (2021)
  1677-1717). His spherical Smith embedding is a square tiling, like
  Lyons-Peres Sec. 9, and is a much bigger build (F. Bertacco, E. Gwynne
  and S. Sheffield, "Scaling limits of planar maps under the Smith
  embedding", arXiv:2306.02988; check this reference before using it).
