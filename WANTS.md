# Wants

Things nadya wants on the site later, but not now. Each line says what it
is and where the details are. When one gets built, it moves out of here
(and into SIMS.md if it is a new sim).

"(talk: Name)" marks ideas from the talk abstracts, papers and talk
titles nadya shared on 2026-10-21. A title alone only names the topic;
check the talk or paper before building.

## Eden Growth

- **A real 3D Eden model**: growth on the cubic lattice (cells are unit
  cubes), not just the 2D mountain drawn in 3D. Being planned (2026-10-30)
  in the thread "Run sims on 3D graphs", which puts the graph sims on Z^3.
  Eden Growth already has 1D and 2D.
- **Holes in 3D**: with the 3D model, the 3D version of the holes charts
  (cavities, Betti number 2), as in F. Manin, É. Roldán and
  B. Schweinhart, "Topology and local geometry of the Eden model",
  Discrete & Computational Geometry (2023), arXiv:2005.12349. The 2D
  holes are on the page (holeHistory, js/sim-shape.js).
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
- **More walkers and cut points**: several walkers, and the cut points of
  the path. Brownian cut points have dimension 2 - ξ(1, 1) = 3/4: G. Lawler,
  "Hausdorff dimension of cut points for Brownian motion", Electron. J.
  Probab. 1 (1996) paper 2, with ξ(1, 1) = 5/4 from G. Lawler, O. Schramm
  and W. Werner, "Values of Brownian intersection exponents II: Plane
  exponents", Acta Math. 187 (2001) 275-308. The walk already runs on
  every tiling in the Lattice menu.
- **Step-reinforced walks** (talk: J. Bertoin): at step n, with
  probability 1 - p_n the walk repeats a uniformly chosen earlier step,
  otherwise it takes a fresh step. A chart of the scaling exponent,
  against the plain walk. J. Bertoin, "Scaling exponents of
  step-reinforced random walks", Probab. Theory Related Fields 179 (2021).
  Related: the elephant random walk, G. Schütz and S. Trimper, Phys. Rev.
  E 70 (2004) 045101. Exact and easy.
- **Random interlacements** (talk: A.-S. Sznitman): run the walk on a 3D
  torus of side N for u N^3 steps and show the vacant set (the sites
  never visited) as u moves. Its local limit is the vacant set of random
  interlacements (D. Windisch, "Random walk on a discrete torus and
  random interlacements", Electron. Commun. Probab. 13 (2008)), which
  has a percolation transition in u:
  A.-S. Sznitman, "Vacant set of random interlacements and percolation",
  Ann. of Math. 171 (2010) 2039-2087. Exact and easy; reuses the 3D view.
- **Late points** (talk: P. Sousi): the last sites of a torus to be
  visited before the walk covers it. In 3D and up they look uniformly
  random: J. Miller and P. Sousi, "Uniformity of the late points of
  random walk on Z_n^d for d >= 3", arXiv:1309.3265. Exact and easy.

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
- **3D Ising interfaces** (talk: E. Lubetzky): the 3D Ising model in a box
  with plus above and minus below (Dobrushin boundary), the interface
  drawn as a surface in the 3D view, and its maximum height against log n.
  R. Gheissari and E. Lubetzky, "Maximum and shape of interfaces in 3D
  Ising crystals", Comm. Pure Appl. Math. 75 (2022); R. Dobrushin, Theory
  Probab. Appl. 17 (1972) 582-600. Doable for boxes up to about 40 per
  side; at low temperature the chain mixes slowly, so pictures are
  approximate.
- **FK (random-cluster) view and its loops** (talk: A. Kemppainen): show
  the FK clusters behind Swendsen-Wang, and the loops between clusters
  and dual clusters. At criticality for q = 2 they converge to CLE(16/3):
  A. Kemppainen and S. Smirnov, "Conformal invariance of boundary
  touching loops of FK Ising model", Comm. Math. Phys. 369 (2019).
- **Continuous vs. discontinuous transition** (talk: H. Duminil-Copin):
  at β_c the planar Potts model is continuous for q <= 4 and
  discontinuous for q > 4, which a picture or a magnetization chart near
  β_c shows. H. Duminil-Copin, V. Sidoravicius and V. Tassion,
  "Continuity of the phase transition for planar random-cluster and
  Potts models with 1 <= q <= 4", Comm. Math. Phys. 349 (2017) 47-107;
  H. Duminil-Copin, M. Gagnebin, M. Harel, I. Manolescu and V. Tassion,
  "Discontinuity of the phase transition for the planar random-cluster
  and Potts models with q > 4", Ann. Sci. ENS 54 (2021).

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
- **Graphs drawn by their circle packing** (talk: R. Peled): any
  triangulation can be drawn as a packing of tangent circles (Koebe,
  Andreev, Thurston), computed by a simple iteration (C. Collins and
  K. Stephenson, Comput. Geom. 25 (2003)). Recurrent graphs pack
  the plane and transient ones pack the disk: Z.-X. He and O. Schramm,
  "Hyperbolic and parabolic packings", Discrete Comput. Geom. 14 (1995)
  123-149. This would give percolation (and the walk) a picture on any
  triangulation from the graph tool. The talk's bounds on p_c are
  theorems, not pictures.
- **Zero or infinitely many infinite clusters** (talk: M. Harel, with
  A. Glazman and N. Zelesko): on the hyperbolic disk, show how many big
  clusters cross a ball, as p moves; on planar graphs for p <= 1/2 the
  number of infinite clusters is 0 or infinity. A. Glazman, M. Harel and
  N. Zelesko, "Planar percolation and the loop O(n) model",
  arXiv:2508.20917.
- **Crossing probabilities** (talk: V. Tassion): a chart of the
  probability that a rectangle is crossed left to right, against its
  aspect ratio, with Cardy's formula overlaid on the triangular lattice
  (J. Cardy, J. Phys. A 25 (1992) L201; proved by Smirnov 2001, above).
  RSW for general symmetric, positively correlated models:
  L. Köhler-Schindler and V. Tassion, "Crossing probabilities for planar
  percolation", Duke Math. J. 172 (2023). Exact and cheap.
- **Recurrence of planar graph limits** (talk: O. Gurel-Gurevich): fits
  with the circle packing pictures above. O. Gurel-Gurevich and
  A. Nachmias, "Recurrence of planar graph limits", Ann. of Math. 177
  (2013) 761-781.
- **The backbone** (talk: C. Garban): highlight the sites of a crossing
  cluster that have two disjoint paths to the two sides.
- **Near-critical percolation** (talk: G. Pete): with the coupling we
  already use, watch the picture as p moves through p_c in a window of
  width about n^(-3/4) (the exponent on the triangular lattice:
  S. Smirnov and W. Werner, "Critical exponents for two-dimensional
  percolation", Math. Res. Lett. 8 (2001)).

## Bond Percolation

- **Scale-free percolation** (talk: R. van der Hofstad): every site gets
  a random weight, and sites x, y are joined with probability
  1 - exp(-λ W_x W_y / |x-y|^α), so long edges exist. M. Deijfen,
  R. van der Hofstad and G. Hooghiemstra, "Scale-free percolation",
  Ann. Inst. Henri Poincaré Probab. Stat. 49 (2013). Exact; the
  picture needs a way to draw long edges.

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
- **The maximum** (talks: L.-P. Arguin, O. Zindy): where the maximum of
  the field sits, and a chart of the max against
  m_n = 2 sqrt(g) log n - (3/4) sqrt(g) log log n, g = 2/π (for the
  normalization E h_x^2 ~ g log n). M. Bramson,
  J. Ding and O. Zeitouni, "Convergence in law of the maximum of the
  two-dimensional discrete Gaussian free field", Comm. Pure Appl. Math.
  69 (2016) 62-123.
- **Gaussian multiplicative chaos** (talks: R. Rhodes, J. Miller): the
  LQG measure above is the main example; the lecture series are good
  background for the About text.

## First Passage Percolation

- **LQG geodesics**: FPP with edge weights e^{ξh} on a GFF sample
  ("Liouville FPP"), from Scott Sheffield's work, nadya 2026-10-21. J.
  Ding, J. Dubédat, A. Dunlap and H. Falconet, "Tightness of Liouville
  first passage percolation for γ in (0,2)", Publ. Math. IHÉS 132 (2020);
  E. Gwynne and J. Miller, "Existence and uniqueness of the Liouville
  quantum gravity metric for γ in (0,2)", Invent. Math. 223 (2021)
  213-333.

## Internal DLA (part of the DLA family, being built)

- **Fluctuations**: the picture of how far the cluster is from a disk,
  from Scott Sheffield's work, nadya 2026-10-21. The fluctuations are
  logarithmic and converge to a variant of the GFF: D. Jerison, L. Levine
  and S. Sheffield, "Logarithmic fluctuations for internal DLA", J. Amer.
  Math. Soc. 25 (2012) 271-301, and "Internal DLA and the Gaussian free
  field", Duke Math. J. 163 (2014) 267-308.
- **Self-interacting walks** (talk: V. Beffara, "From internal DLA to
  self-interacting walks"): title only, so check the talk first.
- **More tiles for Internal Continuous DLA** (nadya 2026-10-30: it
  starts with convex tiles in the plane, and balls and cubes in space).
  Next, tiles with dents in the plane, like the star: Claude times one
  first and reports. Its D = T - T is no longer a convex polygon; its
  outline comes from merging the edges of T and -T (a convolution: L.
  Guibas, L. Ramshaw and J. Stolfi, "A kinetic framework for
  computational geometry", Proc. 24th IEEE FOCS (1983) 100-111). Later,
  in space: other convex tiles (boxes of other proportions, octahedra,
  ellipsoids) and tiles with dents.

## Random planar maps (new sim)

The first two are from Scott Sheffield's work (the animations from his ICM
talk "What is a random surface?"), nadya 2026-10-21.

- **Tree-weighted maps, exact sampling**: a uniform planar map with a
  marked spanning tree is encoded by a hamburger-cheeseburger word, a walk
  in the quarter plane. R. Mullin, "On the enumeration of tree-rooted
  maps", Canad. J. Math. 19 (1967) 174-183; S. Sheffield, "Quantum gravity
  and inventory accumulation", Ann. Probab. 44 (2016) 3804-3848.
- **Tree-weighted maps, drawing them**: the Tutte embedding is one large
  linear solve (E. Gwynne, J. Miller and S. Sheffield, "The Tutte
  embedding of the mated-CRT map converges to Liouville quantum gravity",
  Ann. Probab. 49 (2021)). His spherical Smith embedding is a square
  tiling, like Lyons-Peres Sec. 9, and is a much bigger build (F.
  Bertacco, E. Gwynne and S. Sheffield, "Scaling limits of planar maps
  under the Smith embedding", arXiv:2306.02988).
- **Percolation on random triangulations** (talk: O. Bernardi): a
  percolated triangulation is encoded by a Kreweras walk in the quarter
  plane, so sampling is exact. O. Bernardi, N. Holden and X. Sun,
  "Percolation on triangulations: a bijective path to Liouville quantum
  gravity", Mem. Amer. Math. Soc. (2023).
- **Brownian map geodesics** (talk: J.-F. Le Gall): a uniform
  quadrangulation, sampled exactly from a labeled tree (the
  Cori-Vauquelin-Schaeffer bijection; labels are distances to the root,
  so geodesics to the root are free). The Brownian map is its limit:
  J.-F. Le Gall, Ann. Probab. 41 (2013) 2880-2960; G. Miermont, Acta
  Math. 210 (2013) 319-401. The geodesic stars of the talk are a
  dimension result (J.-F. Le Gall, "Geodesic stars in random geometry",
  arXiv:2102.00489); a picture can show the geodesics to one point, not
  the stars themselves.
- **FK-weighted maps** (talks: G. Ray, X. Sun): the hamburger-cheeseburger
  word above with "fresh" orders at rate p gives maps weighted by the FK
  model instead of one tree (Sheffield 2016, above). One extra slider.
- **Peeling** (talk: T. Budd): explore a random map one face at a time,
  as a growing picture. T. Budd, "The peeling process of infinite
  Boltzmann planar maps", Electron. J. Combin. 23 (2016).
- **Drawing maps** (talks: V. Beffara, S. Rohde, K. Stephenson): ways to
  draw a map (circle packing, Tutte, conformal tilings), the same
  drawing question as above.

## Last passage percolation (queued)

- **Geodesic networks** (talk: D. Dauvergne): in LPP on Z^2, draw the
  geodesics between many pairs of points and highlight where they meet and
  split. The directed landscape is the limit: D. Dauvergne, J. Ortmann and
  B. Virág, "The directed landscape", Acta Math. 229 (2022) 201-285. The
  classification is D. Dauvergne, "The 27 geodesic networks in the
  directed landscape", arXiv:2302.07802. On a finite grid the exotic
  networks are only approximate.
- **Semi-infinite geodesics and Busemann functions** (paper nadya shared):
  draw the geodesics from every point in one direction and watch them
  coalesce, and mark the points with two geodesics in that direction. In
  Brownian LPP: T. Seppäläinen and E. Sorensen, "Busemann process and
  semi-infinite geodesics in Brownian last-passage percolation", Ann.
  Inst. Henri Poincaré Probab. Stat. 59 (2023). On Z^2 the exponential LPP
  version is exact and easy.
- **The broken line process and polymer pinning** (paper and picture
  nadya shared, 2026-10-30: "look at how gorgeous this is"): Hammersley's
  picture of Ulam's problem. Rotate by 45 degrees; every Poisson point in
  a domain sends out two particles, at speeds +1 and -1, more particles
  come in from the boundary, and two particles that meet both die. Their
  paths are broken lines with slopes ±1, and the longest increasing path
  from (0,0) to (n,n) collects exactly as many points as there are lines
  between the two corners, about 2n of them. V. Beffara, V. Sidoravicius,
  H. Spohn and M. E. Vares, "Polymer pinning in a random medium as
  influence percolation", IMS Lecture Notes-Monograph Series 48 (2006)
  1-15, arXiv:math/0507142 (Sec. 2.2 builds the lines); the limit 2 is
  from J. M. Hammersley, "A few seedlings of research", Proc. Sixth
  Berkeley Symp. 1 (1972) 345-394, and D. Aldous and P. Diaconis,
  "Hammersley's interacting particle process and longest increasing
  subsequences", Probab. Theory Related Fields 103 (1995) 199-213. The
  paper's question is a slider: add extra Poisson points of intensity λ
  on the diagonal and watch whether the geodesic gets pinned to it
  (expected for every λ > 0, not proved). Geodesics wander about n^(2/3)
  without the diagonal: K. Johansson, "Transversal fluctuations for
  increasing subsequences on the plane", Probab. Theory Related Fields
  116 (2000) 445-456. Exact and easy; the picture is the lines
  themselves, drawn over the points.

## Loop O(n) model (new sim)

- **The model** (talk: M. Harel): loops on the hexagonal lattice, weight
  x^(edges) n^(loops), by Markov chain. For n in [1,2] and x in
  [1/sqrt 2, 1], every face is surrounded by infinitely many loops
  (A. Glazman, M. Harel and N. Zelesko, "Planar percolation and the loop
  O(n) model", arXiv:2508.20917). n = 1 is the Ising
  model's domain walls, so the Ising page can check it. Weighted, not
  uniform, by definition of the model.

## Random temporal graphs (new sim)

- **Increasing paths** (talk: N. Kamčev): G(n,p) with a uniform random
  time on each edge; shortest and longest increasing paths between two
  vertices, and the temporal diameter, near np = log n. Exact and easy. N.
  Broutin, N. Kamčev and G. Lugosi, "Increasing paths in random temporal
  graphs", Ann. Appl. Probab. 34 (2024). Earlier: O. Angel, A. Ferber, B.
  Sudakov and V. Tassion, "Long monotone trails in random edge-labellings
  of random graphs", Combin. Probab. Comput. 29 (2020).

## Minimal factorizations of a cycle (new sim)

- **Chord pictures** (talk: I. Kortchemski): a uniform factorization of
  (1,...,n) into n-1 transpositions, drawn as chords in a disk, adding the
  first k one by one to see the phase transition. There are n^(n-2) of
  them (J. Dénes, 1959), in bijection with labeled trees, so sampling is
  exact. V. Féray and I. Kortchemski, "The geometry of random minimal
  factorizations of a long cycle via biconditioned bitype random trees",
  Ann. Henri Lebesgue 1 (2018).

## Line ensembles (new sim)

From the papers nadya shared, 2026-10-21.

- **Non-crossing paths with the Gibbs property**: the level lines of a
  lozenge tiling are non-crossing lattice paths, so the Uniform Discrete
  Tiling sampler already makes a line ensemble; show the paths, and the
  top one against the Airy_2 prediction. Brownian Gibbs property:
  I. Corwin and A. Hammond, "Brownian Gibbs property for Airy line
  ensembles", Invent. Math. 195 (2014) 441-508. The top curve determines
  the whole ensemble: E. Dimitrov and K. Matetski, "Characterization of
  Brownian Gibbsian line ensembles", Ann. Probab. 49 (2021).
- **Hall-Littlewood plane partitions and log-gamma polymers**: the two
  models of the talk, each with its own line ensemble. E. Dimitrov, "KPZ
  and Airy limits of Hall-Littlewood random plane partitions",
  Ann. Inst. Henri Poincaré Probab. Stat. 54 (2018);
  T. Seppäläinen, "Scaling for a one-dimensional directed polymer with
  boundary conditions", Ann. Probab. 40 (2012) 19-73. Weighted models,
  not uniform; needs a plan.

## Loop ensembles (new sim)

nadya, 2026-10-21 ("loop ensembles"). The CLE(6) loops from percolation
are under Site Percolation and the FK loops under Ising & Potts.

- **Random walk loop soup and its clusters**: a Poisson cloud of random
  walk loops at intensity c; the outer boundaries of its clusters give
  CLE(κ) for κ in (8/3, 4]. G. Lawler and W. Werner, "The Brownian loop
  soup", Probab. Theory Related Fields 128 (2004) 565-588; S. Sheffield
  and W. Werner, "Conformal loop ensembles: the Markovian
  characterization and the loop-soup construction", Ann. of Math. 176
  (2012) 1827-1917; random walk version: G. Lawler and
  J. Trujillo Ferreras, "Random walk loop soup", Trans. Amer. Math. Soc.
  359 (2007) 767-787. Talks: W. Werner, E. Aïdékon (nested loops),
  S. Watson (CLE(4)).

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
- **Talks to read for it** (talks: F. Viklund, M. Kozdron, R. Kenyon,
  A. Nachmias, M. Barlow, L. Dumaz, L. Addario-Berry): the chance that
  loop-erased random walk uses a given edge (C. Beneš, G. Lawler and
  F. Viklund, arXiv:1402.7345), a random walk proof of the matrix-tree
  theorem (a check page idea), essential spanning forests, the planar
  USF, scaling limits, and squarings of rectangles (the square tilings of
  Lyons-Peres Sec. 9).

## Uniform Discrete Tiling

- **Percolation stats of the tiling** (nadya, 2026-10-30, thread "Tile
  packing"): for each kind of cell, the clusters of touching cells of that
  kind, with the distributions of their areas and perimeters, and "Betti
  numbers if we really want to be crazy". The kinds follow the "Color by"
  menu: by tile size, a tile and its rotations are one kind; by
  direction, each rotation is its own kind. Area and perimeter are cheap:
  the clusters come from findRegions (js/sim-domains.js) and the
  perimeter chart from perimeterChart (js/sim-charts.js), as on the
  Cellular Automata page. Betti numbers per cluster would be new code,
  since the holes counter in js/sim-shape.js follows one growing set
  rather than measuring a fixed picture.

## Forest fires (queued)

- **Planar lattices do not recover** (talk: I. Manolescu): on a planar
  lattice, a fire that burns whole clusters keeps the density below p_c
  forever. D. Kiss, I. Manolescu and V. Sidoravicius, "Planar lattices
  do not recover from forest fires", Ann. Probab. 43 (2015).

## Random trees and fragmentation (new sim)

- **Trees by aggregation** (talk: B. Haas): glue a new branch to a
  uniform point at each step (Rémy's algorithm is a special case).
  N. Curien and B. Haas, "Random trees constructed by aggregation",
  Ann. Inst. Fourier 67 (2017).
- **Line-breaking** (talk: C. Goldschmidt): Aldous's line-breaking
  construction of the Brownian tree, and the stable version.
  D. Aldous, "The continuum random tree I", Ann. Probab. 19 (1991) 1-28.
- **Looptrees** (talk: I. Kortchemski): N. Curien and I. Kortchemski,
  "Random stable looptrees", Electron. J. Probab. 19 (2014) 108.
- **Fragmentations** (talk: J. Bertoin, "Compensated fragmentations"):
  title only; a fragmentation picture (a stick or a mass breaking at
  random times) is easy, the compensated version needs the talk.

## Random graphs (new sims)

- **The multiplicative coalescent** (talk: V. Limic): the component
  sizes of G(n,p) as p grows through 1/n. D. Aldous, "Brownian
  excursions, critical random graphs and the multiplicative coalescent",
  Ann. Probab. 25 (1997) 812-854. Exact and easy.
- **The k-SAT threshold** (talk: N. Sun): random k-SAT formulas and the
  fraction satisfiable as the clause density grows. J. Ding, A. Sly and
  N. Sun, "Proof of the satisfiability conjecture for large k",
  Ann. of Math. 196 (2022) 1-388. A solver limits it to small n.
- The temporal graphs above would fit here too.

## Heat Flow (new sim, parked 2026-10-30)

Plan draft 1: /mnt/project-files/heat-flow/plan.md (thread "Build heat
flow sim"). SIMS.md lists it as an idea and keeps D2, D3 and D15.

- **Operators on bi-infinite sequences** (nadya, 2026-10-30): f(a)_n =
  (1/2)(a_{n-1} + a_{n+1}) on A^Z, the same for sin(1/x), then 2D and any
  tiling. f - I is half the discrete Laplacian, so iterating f is the
  discrete heat equation, and f^t(a)_n = 2^(-t) Σ_m C(t,m) a_{n+2m-t} is
  her D3: G. Lawler, *Random Walk and the Heat Equation*, AMS Student
  Math. Library 55 (2010), ch. 1. As an infinite matrix it is a
  tridiagonal Toeplitz operator with spectrum [-1, 1]: A. Böttcher and
  B. Silbermann, *Analysis of Toeplitz Operators*, 2nd ed., Springer
  (2006), ch. 1. The bi-infinite case is exact with no boundary, since
  W sites after t steps only need the W + 2t starting values around them.
- **The general version in the plan**: f(a)_x = λ a_x + (1 - λ)(average
  over the neighbors of x) on every domain, optionally weights on chosen
  offsets (D2 as a preset), starting values from a formula or the shared
  Random variables box, a graph view and a space-time view (shared with
  Cellular Automata).
- **Open questions in the plan**: what A is (the reals, or Z/p with p odd,
  which gives Pascal's triangle mod p); sin(1/x) at 0 and on which grid;
  the edge rule on finite domains; D15's random environment now or later;
  λ and the offset weights together or just λ.

## Brownian motion (new sim, parked 2026-10-30)

- **Brownian motion** (nadya, 2026-10-30, thread "Build Brownian motion
  sim": "brownian motion thread!"). Not yet scoped; she has not said
  which model she means. Candidates found then: the continuous version of
  Random Walk (1D, 2D, 3D paths with its range, hull, holes and frontier
  stats; the Brownian frontier has dimension 4/3: G. Lawler, O. Schramm
  and W. Werner, "The dimension of the planar Brownian frontier is 4/3",
  Math. Res. Lett. 8 (2001) 401-411), her Brownian bridge "rough ellipse"
  (SIMS.md, Random bridges / mountains) and randombrowniansin.py
  (MODELS.md). Whatever it is shares the Brownian code planned for the
  continuous DLA sims (js/sim-continuum.js, walk on spheres;
  /mnt/project-files/dla/plan.md), so that code is written once.

## Fractal domains (every sim with the Domain options, parked 2026-10-30)

Plan draft 2: /mnt/project-files/fractal-domains/plan.md (thread "Add
fractal domains"), covering the whole Wikipedia list of fractals by
Hausdorff dimension. Fractal percolation is already an idea in SIMS.md.

- **Her Sierpinski, both ways** (nadya, 2026-10-30): site, S_0 = {(0,0)},
  S_{n+1} = S_n ∪ (S_n + (2^n, 0)) ∪ (S_n + (0, 2^n)); edge, S_0 = {e_1,
  e_2}, the same rule. The site version is Pascal's triangle mod 2, and by
  Lucas' theorem it extends to every prime p (A. Granville, "Arithmetic
  properties of binomial coefficients I", CMS Conf. Proc. 20 (1997)).
  With square neighbors the site version is a tree; the edge version has
  one loop per hole.
- **Five general ways to turn a fractal into a domain**, each its own PR:
  a grid digit rule (Sierpinski, carpet, Vicsek, Cantor dust, T-square),
  self-similar graphs from a list of maps (J. Hutchinson, "Fractals and
  self-similarity", Indiana Univ. Math. J. 30 (1981) 713-747), the cells
  inside a fractal region (Koch snowflake, Julia sets, Apollonian gasket,
  attractors), a sim's own result saved as a domain (percolation
  clusters, Eden clusters, her Sequential Continuous Tiling's leftover
  space), and fractal shapes for the continuous sims. The plan ends with
  four choices for her: order, presets, the random digit rule, and
  neighbors and walls.
- **The T-square** (nadya: "ive drawn the T-square fractal more than a
  million times when i was younger, there has to be some way of using it
  here"): an IFS with condensation (M. Barnsley, *Fractals Everywhere*,
  Academic Press (1988), Sec. 3.9). The filled set has dimension 2 and
  its boundary log 3 / log 2. Every square has a power-of-2 side, so on
  the grid it is exact. Uses in the plan: a domain, a "color by level"
  picture, its boundary for exit times, and a preset of the IFS sim.
- **Her question: a recurrent walk inside Z^3** (nadya, 2026-10-30: a
  non-trivial, maybe random, subset of Z^3 whose walk is recurrent, or a
  special dimension above 2 where one still exists). The plan's answer:
  which edges are kept decides it, not the points (the UST of Z^3 spans
  every point and is one-ended, so recurrent: R. Pemantle, Ann. Probab.
  19 (1991) 1559-1574; I. Benjamini, R. Lyons, Y. Peres and O. Schramm,
  Ann. Probab. 29 (2001) 1-65); the right parameter is the spectral
  dimension, and every d_f >= 1 with 2 <= d_w <= d_f + 1 occurs (M.
  Barlow, "Which values of the volume growth and escape time exponent
  are possible for a graph?", Rev. Mat. Iberoam. 20 (2004) 1-31), so no
  special threshold above 2 exists. A candidate of her own kind: Pascal
  mod p in Z^3, of dimension log C(p+2,3) / log p, recurrent if one
  resistance number is > 1 (not yet checked; a check page could compute
  it). Waits for the 3D thread.

## IFS sim (new sim, nadya's call)

- **Iterated function systems** (nadya, 2026-10-30: "i think this will
  eventually spawn (at the very least) an IFS sim"): maps you edit (and
  maybe drag, as in Desmos), the level-n picture against the chaos game,
  condensation sets (the T-square), and optional weights on the maps
  (renormalized, blank = uniform). The chaos game draws the attractor:
  M. Barnsley and S. Demko, "Iterated function systems and the global
  construction of fractals", Proc. R. Soc. Lond. A 399 (1985) 243-275.
  The fractal domains above need the same machinery, so it would be
  shared code (plan: /mnt/project-files/fractal-domains/plan.md).

## Other new sims

- **Competitive erosion** (talk: Y. Peres): two colors of random walkers
  enter from two boundary arcs and recolor the first site of the other
  color they hit; the interface settles on a curve that is conformally
  invariant. S. Ganguly, L. Levine, Y. Peres and J. Propp, "Competitive
  erosion is conformally invariant", arXiv:1503.06989. Exact and easy.
- **Laplacian growth, Hastings-Levitov** (talk: A. Turner): grow a
  cluster by composing random conformal maps, each adding a small
  particle. F. Johansson Viklund, A. Sola and A. Turner, "Small-particle
  limits in a regularized Laplacian random growth model",
  arXiv:1309.2194. Exact up to the particle shape.
- **The compulsive gambler** (talk: D. Aldous): agents meet at random and
  bet everything, winning in proportion to their wealth. Title only;
  check the talk.
- **Poisson line processes** (talk: W. Kendall, "Google maps and improper
  Poisson line processes"): random lines as a road network, and fastest
  routes on it. W. Kendall, "From random lines to metric spaces",
  Ann. Probab. 45 (2017).
- **Finitely dependent coloring** (talk: A. Holroyd, "Local graph
  coloring"): a random proper 4-coloring of Z where far-apart colors are
  independent. A. Holroyd and T. Liggett, "Finitely dependent coloring",
  Forum Math. Pi 4 (2016) e9.
