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
- **Step-reinforced walks** (from a talk abstract nadya shared, 2026-10-21, J. Bertoin):
  at step n, with probability 1 - p_n the walk repeats a uniformly chosen
  earlier step, otherwise it takes a fresh step. A chart of the scaling
  exponent, against the plain walk. J. Bertoin, "Scaling exponents of
  step-reinforced random walks", Probab. Theory Related Fields 179 (2021)
  295-315. Related: the elephant random walk, G. Schütz and S. Trimper,
  Phys. Rev. E 70 (2004) 045101. Exact and easy.

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
- **3D Ising interfaces** (from a talk abstract nadya shared, 2026-10-21, E. Lubetzky): the 3D Ising model in
  a box with plus above and minus below (Dobrushin boundary), the
  interface drawn as a surface in the 3D view, and its maximum height
  against log n. R. Gheissari and E. Lubetzky, "Maximum and shape of
  interfaces in 3D Ising crystals", Comm. Pure Appl. Math. 75 (2022)
  2575-2684; R. Dobrushin, Theory Probab. Appl. 17 (1972) 582-600.
  Doable for boxes up to about 40 per side; at low temperature the chain
  mixes slowly, so pictures are approximate.

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
- **Graphs drawn by their circle packing** (from a talk abstract nadya shared, 2026-10-21, R. Peled): any
  triangulation can be drawn as a packing of tangent circles (Koebe,
  Andreev, Thurston), computed by a simple iteration (C. Collins and
  K. Stephenson, Comput. Geom. 25 (2003) 233-256). Recurrent graphs pack
  the plane and transient ones pack the disk: Z.-X. He and O. Schramm,
  "Hyperbolic and parabolic packings", Discrete Comput. Geom. 14 (1995)
  123-149. This would give percolation (and the walk) a picture on any
  triangulation from the graph tool. The talk's bounds on p_c are
  theorems, not pictures.
- **Zero or infinitely many infinite clusters** (from a talk abstract nadya shared, 2026-10-21, M. Harel, with
  A. Glazman and N. Zelesko): on the hyperbolic disk, show how many big
  clusters cross a ball, as p moves; on planar graphs for p <= 1/2 the
  number of infinite clusters is 0 or infinity. Check the paper's
  reference before using it.
- **Crossing probabilities** (from a talk abstract nadya shared, 2026-10-21, V. Tassion): a chart of the
  probability that a rectangle is crossed left to right, against its
  aspect ratio, with Cardy's formula overlaid on the triangular lattice
  (J. Cardy, J. Phys. A 25 (1992) L201; proved by Smirnov 2001, above).
  RSW for general symmetric, positively correlated models:
  L. Köhler-Schindler and V. Tassion, "Crossing probabilities for planar
  percolation", Duke Math. J. (2023). Exact and cheap.

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

## Random planar maps (new sim)

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
- **Percolation on random triangulations** (from a talk abstract nadya shared, 2026-10-21, O. Bernardi): a
  percolated triangulation is encoded by a Kreweras walk in the quarter
  plane, so sampling is exact. O. Bernardi, N. Holden and X. Sun,
  "Percolation on triangulations: a bijective path to Liouville quantum
  gravity", Mem. Amer. Math. Soc. (2023).
- **Brownian map geodesics** (from a talk abstract nadya shared, 2026-10-21, J.-F. Le Gall): a uniform
  quadrangulation, sampled exactly from a labeled tree (the
  Cori-Vauquelin-Schaeffer bijection; labels are distances to the root,
  so geodesics to the root are free). The Brownian map is its limit:
  J.-F. Le Gall, Ann. Probab. 41 (2013) 2880-2960; G. Miermont, Acta
  Math. 210 (2013) 319-401. The geodesic stars of the talk are a
  dimension result; a picture can show the geodesics to one point, not
  the stars themselves.

## Last passage percolation (queued)

- **Geodesic networks** (from a talk abstract nadya shared, 2026-10-21, D. Dauvergne): in LPP on Z^2, draw the
  geodesics between many pairs of points and highlight where they meet
  and split. The directed landscape is the limit: D. Dauvergne,
  J. Ortmann and B. Virág, "The directed landscape", Acta Math. 229
  (2022) 201-285. The classification is D. Dauvergne, "The 27 geodesic
  networks in the directed landscape", arXiv:2302.07802 (check this
  reference before using it). On a finite grid the exotic networks are
  only approximate.

## Loop O(n) model (new sim)

- from a talk abstract nadya shared, 2026-10-21 (M. Harel): loops on the hexagonal lattice, weight
  x^(edges) n^(loops), by Markov chain. For n in [1,2] and x in
  [1/sqrt 2, 1], every face is surrounded by infinitely many loops
  (Glazman, Harel and Zelesko; check the reference). n = 1 is the Ising
  model's domain walls, so the Ising page can check it. Weighted, not
  uniform, by definition of the model.

## Random temporal graphs (new sim)

- from a talk abstract nadya shared, 2026-10-21 (N. Kamčev): G(n,p) with a uniform random time on each edge;
  shortest and longest increasing paths between two vertices, and the
  temporal diameter, near np = log n. Exact and easy. N. Broutin,
  N. Kamčev and G. Lugosi, "Increasing paths in random temporal graphs"
  (check the reference). Earlier: O. Angel, A. Ferber, B. Sudakov and
  V. Tassion, "Long monotone trails in random edge-labellings of random
  graphs", Combin. Probab. Comput. 29 (2020) 22-30.

## Minimal factorizations of a cycle (new sim)

- from a talk abstract nadya shared, 2026-10-21 (I. Kortchemski): a uniform factorization of (1,...,n) into n-1
  transpositions, drawn as chords in a disk, adding the first k one by
  one to see the phase transition. There are n^(n-2) of them
  (J. Dénes, 1959), in bijection with labeled trees, so sampling is
  exact. V. Féray and I. Kortchemski, "The geometry of random minimal
  factorizations of a long cycle via biconditioned bitype random trees",
  Ann. Henri Lebesgue 1 (2018) 109-186.
