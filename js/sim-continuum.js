/* =====================================================================
   sim-continuum.js  —  Brownian motion: what the continuous sims share
   ---------------------------------------------------------------------
   Pieces of Brownian motion in the plane (dims = 2) or in space (3)
   that are exact, used by the DLA sims: the continuous ones, and the
   far field of External Discrete DLA.
     pointOnSphere(dims, R, draw)    a uniform point on the circle or
                                     sphere of radius R around the
                                     origin: where Brownian motion from
                                     infinity first meets it, by
                                     symmetry; also, around a point,
                                     where it first leaves a ball (the
                                     walk on spheres)
     brownianReturn(place, R, draw)  where Brownian motion from a place
                                     outside that circle or sphere first
                                     comes back to it (in 3D, null if it
                                     never does)
     returnPoint2D, returnPoint3D, perpendicularPair   their parts
     brownianStep(dims, sd, draw)    a move of Brownian motion over a
                                     short time (the check pages follow
                                     it in small steps, against the
                                     exact jumps)
   and two numbers the continuous DLA sims share: DEFAULT_EPSILON, where
   their walk on spheres stops, and SMALL_STEP_SHARE, for the check
   pages' small steps.
   "draw" is a function giving uniform numbers in [0, 1).
   The source for all of it: P. Morters and Y. Peres, "Brownian Motion",
   Cambridge University Press, 2010, Chapter 3 (the Poisson kernel,
   inversion in a sphere, and the chance R / r of ever reaching the
   sphere of radius R from distance r in 3D).
   Load it after js/sim-honeycombs.js (its 3D vectors dot3, cross3,
   length3).
   ===================================================================== */

// The continuous DLA sims' particle stops within this much of where it
// would stop, in tile radii (the walk on spheres never quite gets
// there), unless the page says otherwise.
const DEFAULT_EPSILON = 1e-4;

// With the option smallSteps (for the check pages), a particle moves in
// small steps of Brownian motion instead of jumping across each circle
// of radius r: the steps have standard deviation r / SMALL_STEP_SHARE in
// each direction, so a step reaches past the circle only with a chance
// of about 1 in 270,000 (past the sphere, in space, about 1 in 65,000:
// a step's length over its standard deviation has the chi law with 2,
// or 3, degrees of freedom), and past where the particle would stop,
// which is farther, even less often.
const SMALL_STEP_SHARE = 5;

// A point taken uniformly on the circle (dims = 2) or sphere (3) of
// radius R around the origin, from uniform numbers draw().
function pointOnSphere(dims, R, draw) {
  const angle = 2 * Math.PI * draw();
  if (dims === 2) return [R * Math.cos(angle), R * Math.sin(angle)];
  const z = 2 * draw() - 1, across = Math.sqrt(1 - z * z);    // (Archimedes: z is uniform on a sphere)
  return [R * across * Math.cos(angle), R * across * Math.sin(angle), R * z];
}

// Where Brownian motion from "place" (at distance r > R) first reaches
// the circle of radius R. Its angle from the direction of the place has
// the density (1 - q^2) / (2 pi (1 + q^2 - 2 q cos t)) with q = R / r
// (the Poisson kernel for the outside of a disk), the wrapped Cauchy
// law, which is t = 2 arctan((1 - q) / (1 + q) tan(pi (u - 1/2))).
function returnPoint2D(place, R, u) {
  const r = Math.hypot(place[0], place[1]), q = R / r;
  const angle = Math.atan2(place[1], place[0]) + 2 * Math.atan((1 - q) / (1 + q) * Math.tan(Math.PI * (u - 0.5)));
  return [R * Math.cos(angle), R * Math.sin(angle)];
}

// Where Brownian motion from "place" (at distance r > R) first reaches
// the sphere of radius R, given that it does. By inversion in the
// sphere (the Kelvin transform), that is where Brownian motion from the
// inside point s = R^2 / r (in the same direction) first leaves the
// ball, whose density at the angle t from that direction is
// proportional to (R^2 - s^2) / (R^2 + s^2 - 2 R s cos t)^(3/2). Its
// cos t, from the uniform u by inverting the distribution function,
// is (R^2 + s^2 - 1/w^2) / (2 R s) with
// w = 2 s u / (R^2 - s^2) + 1 / (R + s); the turn around that direction
// is uniform (from v).
function returnPoint3D(place, R, u, v) {
  const r = Math.hypot(place[0], place[1], place[2]), s = R * R / r;
  const w = 2 * s * u / (R * R - s * s) + 1 / (R + s);
  const cos = Math.min(1, Math.max(-1, (R * R + s * s - 1 / (w * w)) / (2 * R * s))), sin = Math.sqrt(1 - cos * cos);
  const toward = place.map(function (x) { return x / r; });
  const [e1, e2] = perpendicularPair(toward), turn = 2 * Math.PI * v;
  return [0, 1, 2].map(function (d) {
    return R * (cos * toward[d] + sin * (Math.cos(turn) * e1[d] + Math.sin(turn) * e2[d]));
  });
}

// Two unit vectors at right angles to each other and to the unit
// vector "toward".
function perpendicularPair(toward) {
  const other = Math.abs(toward[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = cross3(toward, other), size = length3(e1);
  const first = e1.map(function (x) { return x / size; });
  return [first, cross3(toward, first)];
}

// Where Brownian motion from "place" (farther than R from the origin)
// first comes back to the circle (sphere) of radius R: in 2D it always
// does (it is recurrent); in 3D only with chance R / r, and otherwise
// it wanders off for good and this gives null.
function brownianReturn(place, R, draw) {
  if (place.length === 2) return returnPoint2D(place, R, draw());
  const r = Math.hypot(place[0], place[1], place[2]);
  return draw() < R / r ? returnPoint3D(place, R, draw(), draw()) : null;
}

// A move of Brownian motion over the time sd^2: each coordinate is
// normal, with mean 0 and standard deviation sd, made from two uniform
// numbers per pair of coordinates (G. Box and M. Muller, "A note on the
// generation of random normal deviates", Ann. Math. Statist. 29 (1958)
// 610-611).
function brownianStep(dims, sd, draw) {
  const step = [];
  while (step.length < dims) {
    const size = sd * Math.sqrt(-2 * Math.log(1 - draw())), angle = 2 * Math.PI * draw();
    step.push(size * Math.cos(angle), size * Math.sin(angle));
  }
  return step.slice(0, dims);
}


/* =====================================================================
   FOR A SECOND THREAD: everything above, to hand to runInWorker
   (js/sim-page.js) as helpers.
   ===================================================================== */
function continuumHelpers() {
  return [pointOnSphere, brownianReturn, returnPoint2D, returnPoint3D, perpendicularPair, brownianStep,
          { DEFAULT_EPSILON: DEFAULT_EPSILON, SMALL_STEP_SHARE: SMALL_STEP_SHARE }];
}
