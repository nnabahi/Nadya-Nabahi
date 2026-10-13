# Wants

Things nadya wants on the site later, but not now. Each line says what it
is and where the details are. When one gets built, it moves out of here
(and into SIMS.md if it is a new sim).

## Eden Growth

- **A real 3D Eden model**: growth on the cubic lattice (cells are unit
  cubes), not just the 2D mountain drawn in 3D.
- **Holes: their births and deaths** (persistent homology), in 2D and, with
  the 3D model, in 3D. As in F. Manin, É. Roldán and B. Schweinhart,
  "Topology and local geometry of the Eden model", Discrete & Computational
  Geometry (2023), arXiv:2005.12349. Charts: number of holes (Betti
  numbers) over time, and persistence (death − birth) against birth and
  against death. A hole is born when a block closes it off (or splits an
  older hole) and dies when its last cell is filled; when a hole splits, the
  half that lives longer keeps the old birth (the elder rule). It can be
  computed exactly in one pass backwards in time with union–find. Plan
  draft: the project file eden-growth/holes-plan.md.
- **The bacteria rule**: a random bacterium copies itself into its own cell
  or into a neighbor (or only into an empty neighbor). Today's rule is not a
  special case of it, so it would be a second rule to switch to.
