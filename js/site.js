/* =====================================================================
   site.js  —  the pieces of HTML that many pages share, written once
   ---------------------------------------------------------------------
   A page holds an empty placeholder where a shared piece goes, and the
   script that owns that piece fills it in as the page loads, with
   fillBlocks below. The placeholder's data-... settings say how this
   page's copy differs (for example which link is the active one).

   This file fills the top bar. Every page has
     <header class="topbar" data-active="toysnsims.html"></header>
     <script src="js/site.js"></script>
   (data-active is the file whose link stands out), with the script
   right after the bar so the bar is there before the rest of the page
   shows. The other pieces are filled by the files that make them work,
   like the Domain options (js/sim-controls.js).
   ===================================================================== */


// The way from this page to the site's main folder, e.g. "../../" on a
// sim page: this script's own address, as the page wrote it, without
// the "js/site.js" at its end. Links the code writes start with it.
const SITE_ROOT = document.currentScript.getAttribute("src").replace("js/site.js", "");


// Fill every placeholder that matches "selector" (a CSS selector) with
// the HTML that build(settings) returns, where settings are that
// placeholder's data-... values (data-active="..." is settings.active).
function fillBlocks(selector, build) {
  for (const place of document.querySelectorAll(selector)) place.innerHTML = build(place.dataset);
}

// The top bar's links, left to right: [file, label].
const SITE_LINKS = [
  ["about.html", "About Me"],
  ["writing.html", "Writing"],
  ["index.html", "Home"],
  ["resume-and-publications.html", "Resume &amp; Publications"],
  ["toysnsims.html", "Toys n' Sims"],
];

// The top bar.
fillBlocks("header.topbar", function (settings) {
  const links = SITE_LINKS.map(function ([file, label]) {
    const active = file === settings.active ? ' class="active"' : "";
    return '<a href="' + SITE_ROOT + file + '"' + active + ">" + label + "</a>";
  });
  return "<nav>" + links.join("") + "</nav>";
});
