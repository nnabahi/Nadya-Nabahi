# Nadya Nabahi — personal website

Plain HTML and CSS, plus one small script for the genre filter. No frameworks, no build step: open any `.html` file in a
browser and it works.

## What's where

| File | What it is |
| --- | --- |
| `index.html` | Home page (image area + welcome line) |
| `about.html` | About Me |
| `resume.html` | Resume |
| `publications.html` | Publications |
| `toys.html` | Toys n' Sims: a list of all simulations |
| `sims/` | One page per simulation |
| `sims/example.html` | Blank sim showing the four-quadrant layout; copy it to start a new sim |
| `css/style.css` | The single stylesheet for every page |
| `js/genre-filter.js` | Builds the genre buttons on `toys.html` and hides/shows cards |

## Common changes

- **Change colors or fonts:** edit section 1 at the top of `css/style.css`.
- **Add a page:** copy an existing page, then add its link to the top bar
  on *every* page (the top bar is copied into each file).
- **Add a sim:** copy `sims/example.html`, fill in the four boxes, and add a
  card for it on `toys.html` with its genre labels (`<li>` items in the
  card's `<ul class="tags">`). New genres get a filter button automatically.
- **Move the sim quadrants around:** edit `grid-template-areas` in section 6
  of `css/style.css`.

The earlier version of the site (with the old simulations) is saved in git
history at commit `8e68754`.
