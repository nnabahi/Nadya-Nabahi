/* =====================================================================
   about-tabs.js  —  the tabs in a sim's "About" box
   ---------------------------------------------------------------------
   A sim page can split its About box into tabs, e.g. a simple version
   and one with all the details. In the HTML:

     <nav class="about-tabs">
       <button class="about-tab selected" data-tab="simple">Simple</button>
       <button class="about-tab" data-tab="details">All the details</button>
     </nav>
     <div data-panel="simple"> ... </div>
     <div data-panel="details" hidden> ... </div>

   Clicking a tab shows the panel with the same name and hides the
   others ("hidden" hides a panel). The first tab's panel is the one
   shown when the page opens.
   ===================================================================== */

for (const bar of document.querySelectorAll(".about-tabs")) {
  const box = bar.parentElement;                      // the About box
  const tabs = bar.querySelectorAll(".about-tab");
  for (const tab of tabs) {
    tab.addEventListener("click", function () {
      for (const other of tabs) other.classList.toggle("selected", other === tab);
      for (const panel of box.querySelectorAll("[data-panel]")) {
        panel.hidden = (panel.dataset.panel !== tab.dataset.tab);
      }
    });
  }
}
