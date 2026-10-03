/* =====================================================================
   check-page.js  —  small helpers the check pages share
   ---------------------------------------------------------------------
   A check page (like sims/sandpiles-check.html) tests a sim's math on
   its own and shows the results in a table. The check pages with a
   "Run the checks" button load this file, after js/sim-page.js (for
   byId) and before their own tests.

   Contents:
     addRow(test, pass, text)   one row of the results table
     runChecksOnClick(tests)    the "Run the checks" button
     readNumbers(text)          the numbers in a list pasted from Python
   ===================================================================== */


// One row of the results table (<tbody id="results">): pass or FAIL,
// the test's name, and what the test found.
function addRow(test, pass, text) {
  const row = document.createElement("tr");
  row.innerHTML = "<td></td><td></td><td></td>";
  row.children[0].textContent = pass ? "✓ pass" : "✗ FAIL";
  row.children[0].className = pass ? "check-pass" : "check-fail";
  row.children[1].textContent = test;
  row.children[2].textContent = text;
  byId("results").appendChild(row);
}

// The "Run the checks" button (id="run-checks"). Each press empties the
// table, asks allTests() for a fresh list of tests (functions that each
// add their own rows), and runs them one at a time with a pause between
// them, so the page shows each result as it comes. The button is off
// until the last one is done.
function runChecksOnClick(allTests) {
  const button = byId("run-checks");
  button.addEventListener("click", function () {
    byId("results").innerHTML = "";
    const tests = allTests();
    button.disabled = true;
    function next() {
      if (tests.length === 0) { button.disabled = false; return; }
      tests.shift()();
      setTimeout(next, 0);
    }
    next();
  });
}

// The numbers in a list printed by Python, like "[[0, 1], [2, 3]]"
// (brackets and commas are skipped).
function readNumbers(text) {
  return text.replace(/[\[\]]/g, " ").split(/[\s,]+/).filter(function (s) { return s !== ""; }).map(Number);
}
