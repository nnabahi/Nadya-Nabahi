/* =====================================================================
   genre-filter.js  —  the genre buttons on toys.html
   ---------------------------------------------------------------------
   What it does, in plain words:
     0. Put the cards in alphabetical order by name, with the pinned
        card (class="card pinned", the drawing tool) first.
     1. Look at every sim card on the page and collect the genre names
        written in its <ul class="tags"> list.
     2. Make one button per genre (plus an "All" button) inside
        <div id="genre-filters">.
     3. When a button is clicked, hide every card that doesn't have that
        genre, and show the ones that do.

   You never need to edit this file to add a sim or a genre. Just add
   the genre as an <li> on a card in toys.html and a button appears;
   the card can go anywhere in the list, and it is sorted into place.

   A few JavaScript words used below:
     - "const x = ..."   gives a name (x) to a value.
     - "document.querySelectorAll('.card')"  finds every element on the
        page with class="card", like a CSS selector does.
     - "function name(...) { ... }"  a named set of steps you can reuse.
     - "for (const card of cards) { ... }"  do the steps once per card.
   ===================================================================== */


// Step 0: sort the cards by their names (the <h3>), A to Z, with the
// pinned card first. Moving each card to the end of the list, in that
// order, leaves them sorted.
const cardGrid = document.querySelector(".card-grid");
const sortedCards = Array.from(cardGrid.querySelectorAll(".card")).sort(function (a, b) {
  const aPinned = a.classList.contains("pinned"), bPinned = b.classList.contains("pinned");
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  return a.querySelector("h3").textContent.localeCompare(b.querySelector("h3").textContent);
});
for (const card of sortedCards) cardGrid.appendChild(card);


// The box where the buttons go, and all the sim cards.
const filterBar = document.getElementById("genre-filters");
const cards = document.querySelectorAll(".card-grid .card");


// Read the genre names off one card, e.g. ["Coloring", "Random walk"].
function genresOf(card) {
  const tagItems = card.querySelectorAll(".tags li");
  const names = [];
  for (const item of tagItems) {
    names.push(item.textContent.trim());   // trim() drops stray spaces
  }
  return names;
}


// Step 1: count how many cards have each genre.
// "counts" ends up looking like { "Coloring": 2, "Random walk": 1 }.
const counts = {};
for (const card of cards) {
  for (const genre of genresOf(card)) {
    counts[genre] = (counts[genre] || 0) + 1;
  }
}

// Alphabetical order for the buttons.
const genreNames = Object.keys(counts).sort();


// Show only the cards that have the chosen genre.
// chosen = null means "All": show every card.
function applyFilter(chosen) {
  for (const card of cards) {
    const matches = chosen === null || genresOf(card).includes(chosen);
    card.hidden = !matches;   // hidden = true makes the card disappear
  }

  // Highlight the button that's currently selected.
  for (const button of filterBar.querySelectorAll("button")) {
    const isSelected = button.dataset.genre === (chosen || "");
    button.classList.toggle("selected", isSelected);
  }
}


// Make one button. "label" is the text shown; "genre" is what it filters by.
function makeButton(label, genre) {
  const button = document.createElement("button");
  button.className = "filter-button";
  button.textContent = label;
  button.dataset.genre = genre || "";        // remembered on the button
  button.addEventListener("click", function () {
    applyFilter(genre);                      // run applyFilter when clicked
  });
  filterBar.appendChild(button);             // put it on the page
}


// Step 2: build the buttons. "All" first, then each genre with its count.
makeButton("All (" + cards.length + ")", null);
for (const genre of genreNames) {
  makeButton(genre + " (" + counts[genre] + ")", genre);
}

// Start with everything showing and "All" highlighted.
applyFilter(null);
