# Wants

Things nadya wants on the site later, but not now. Each line says what it
is and where the details are. When one gets built, it moves out of here
(and into SIMS.md if it is a new sim).

"(talk: Name)" marks ideas from the talk abstracts, papers and talk
titles nadya shared on 2026-10-21. A title alone only names the topic;
check the talk or paper before building.

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

## First passage percolation (queued)

- **LQG geodesics**: FPP with edge weights e^{ξh} on a GFF sample
  ("Liouville FPP"), from Scott Sheffield's work, nadya 2026-10-21. J.
  Ding, J. Dubédat, A. Dunlap and H. Falconet, "Tightness of Liouville
  first passage percolation for γ in (0,2)", Publ. Math. IHÉS 132 (2020);
  E. Gwynne and J. Miller, "Existence and uniqueness of the Liouville
  quantum gravity metric for γ in (0,2)", Invent. Math. 223 (2021)
  213-333.

## Internal DLA (queued as "inside DLA")

- **Fluctuations**: the picture of how far the cluster is from a disk,
  from Scott Sheffield's work, nadya 2026-10-21. The fluctuations are
  logarithmic and converge to a variant of the GFF: D. Jerison, L. Levine
  and S. Sheffield, "Logarithmic fluctuations for internal DLA", J. Amer.
  Math. Soc. 25 (2012) 271-301, and "Internal DLA and the Gaussian free
  field", Duke Math. J. 163 (2014) 267-308.
- **Self-interacting walks** (talk: V. Beffara, "From internal DLA to
  self-interacting walks"): title only, so check the talk first.

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

## Uniform spanning tree and forest (being planned in its own thread)

- **Talks to read for it** (talks: F. Viklund, M. Kozdron, R. Kenyon,
  A. Nachmias, M. Barlow, L. Dumaz, L. Addario-Berry): the chance that
  loop-erased random walk uses a given edge (C. Beneš, G. Lawler and
  F. Viklund, arXiv:1402.7345), a random walk proof of the matrix-tree
  theorem (a check page idea), essential spanning forests, the planar
  USF, scaling limits, and squarings of rectangles (the square tilings of
  Lyons-Peres Sec. 9).

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
