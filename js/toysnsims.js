/* =====================================================================
   toysnsims.js  —  the Toys n' Sims list page (toysnsims.html)
   ---------------------------------------------------------------------
   What it does, in plain words:
     1. Sort A to Z by name: the families, the sims inside each family,
        the sporadic models and the tools. A pinned card
        (class="card pinned", the Graph & Domain Tool) goes first in its
        own group.
     2. Families: put each family's colored bar on top of its panel,
        and open one panel at a time when its family card is clicked.
     3. Genre buttons: make one button per genre written on the
        sporadic models' cards, and hide the cards that don't match.

   You never need to edit this file to add a sim, a family or a genre.
   Just add the card, family block or genre <li> in toysnsims.html.

   If this script is ever missing or broken, the page still works:
   every family panel and every card just stays visible.

   A few JavaScript words used below:
     - "const x = ..."   gives a name (x) to a value.
     - "document.querySelectorAll('.card')"  finds every element on the
        page with class="card", like a CSS selector does.
     - "function name(...) { ... }"  a named set of steps you can reuse.
     - "for (const card of cards) { ... }"  do the steps once per card.
   ===================================================================== */


// The name of a card or a family: its first <h3>.
function nameOf(item) {
  return item.querySelector("h3").textContent;
}

// Put the items of a grid in order: pinned items (class="pinned") first,
// then A to Z by name. Moving each item to the end of the grid, in that
// order, leaves them sorted.
function sortGrid(grid) {
  const items = Array.from(grid.children).sort(function (a, b) {
    const aPinned = a.classList.contains("pinned"), bPinned = b.classList.contains("pinned");
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return nameOf(a).localeCompare(nameOf(b));
  });
  for (const item of items) grid.appendChild(item);
}


/* ---------------------------------------------------------------------
   Families
   --------------------------------------------------------------------- */

// Make a family's colored bar: the clickable top of its Simple text
// (a <details>), showing the family card's name and one line, so that
// text is written only once, on the card.
function addFamilyBar(family) {
  const bar = document.createElement("summary");
  bar.className = "family-bar";
  const words = document.createElement("div");
  words.innerHTML = family.querySelector(".family-card").innerHTML;
  bar.appendChild(words);
  family.querySelector(".family-text").prepend(bar);
}

// Open one family's panel and close all the others.
// chosen = null closes them all.
function showFamily(families, chosen) {
  for (const family of families) {
    const isOpen = family === chosen;
    family.querySelector(".family-panel").hidden = !isOpen;
    family.querySelector(".family-card").classList.toggle("open", isOpen);
    family.querySelector(".family-card").setAttribute("aria-expanded", isOpen);
  }
}

// Make a family card act like a button: a click (or Enter or Space,
// for the keyboard) opens its panel, or closes it if it's open.
function makeFamilyCardClickable(families, family) {
  const card = family.querySelector(".family-card");
  card.setAttribute("role", "button");
  card.tabIndex = 0;   // lets the Tab key reach it
  function toggle() {
    const isOpen = !family.querySelector(".family-panel").hidden;
    showFamily(families, isOpen ? null : family);
  }
  card.addEventListener("click", toggle);
  card.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();   // Space would otherwise scroll the page
    toggle();
  });
}

function setUpFamilies() {
  const families = Array.from(document.querySelectorAll(".family"));
  for (const family of families) {
    addFamilyBar(family);
    makeFamilyCardClickable(families, family);
  }
  showFamily(families, null);   // all closed to start
}


/* ---------------------------------------------------------------------
   Genre buttons (sporadic models only)
   --------------------------------------------------------------------- */

// Read the genre names off one card, e.g. ["Coloring", "Random walk"].
// (trim() drops stray spaces.)
function genresOf(card) {
  return Array.from(card.querySelectorAll(".tags li"), function (item) { return item.textContent.trim(); });
}

// Count how many cards have each genre,
// e.g. { "Coloring": 2, "Random walk": 1 }.
function countGenres(cards) {
  const counts = {};
  for (const card of cards) {
    for (const genre of genresOf(card)) {
      counts[genre] = (counts[genre] || 0) + 1;
    }
  }
  return counts;
}

// Show only the cards that have the chosen genre, and highlight its
// button. chosen = null means "All": show every card.
function applyFilter(filterBar, cards, chosen) {
  for (const card of cards) {
    // hidden = true makes the card disappear.
    card.hidden = chosen !== null && !genresOf(card).includes(chosen);
  }
  for (const button of filterBar.querySelectorAll("button")) {
    button.classList.toggle("selected", button.dataset.genre === (chosen || ""));
  }
}

// Make one button. "label" is the text shown; "genre" is what it filters
// by (null for "All"), remembered on the button.
function makeFilterButton(filterBar, cards, label, genre) {
  const button = document.createElement("button");
  button.className = "filter-button";
  button.textContent = label;
  button.dataset.genre = genre || "";
  button.addEventListener("click", function () { applyFilter(filterBar, cards, genre); });
  filterBar.appendChild(button);
}

// "All" first, then each genre A to Z with its count.
function setUpGenreButtons() {
  const filterBar = document.getElementById("genre-filters");
  const cards = Array.from(document.querySelectorAll("#sporadic .card"));
  const counts = countGenres(cards);
  makeFilterButton(filterBar, cards, "All (" + cards.length + ")", null);
  for (const genre of Object.keys(counts).sort()) {
    makeFilterButton(filterBar, cards, genre + " (" + counts[genre] + ")", genre);
  }
  applyFilter(filterBar, cards, null);   // everything showing to start
}


/* ---------------------------------------------------------------------
   Run the three steps.
   --------------------------------------------------------------------- */
for (const grid of document.querySelectorAll(".card-grid")) sortGrid(grid);
setUpFamilies();
setUpGenreButtons();
