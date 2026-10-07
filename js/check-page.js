/* =====================================================================
   check-page.js  —  small helpers the check pages share
   ---------------------------------------------------------------------
   A check page (like sims/sandpiles-check.html) tests a sim's math on
   its own and shows the results in a table. Every check page has a
   link back to its sim at the top, and the same table: pass or FAIL,
   what was checked, and what the test found. The check pages load
   this file after js/sim-page.js (for byId) and before their own
   tests.

   Contents:
     addRow(test, pass, text)   one row of the results table
     runChecksOnClick(tests)    the "Run the checks" button
     readNumbers(text)          the numbers in a list pasted from Python
   and the tests several pages use (the p-values come from the library
   jStat, which those pages load):
     pooledChiSquare(odds, seen, runs)   do counts match exact odds?
     equalChiSquare(counts)              are some outcomes equally likely?
     binomialZ(count, trials, p)         how far a count is from its mean
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
// until the last one is done. A test that crashes gets a FAIL row
// saying what went wrong, and the others still run.
function runChecksOnClick(allTests) {
  const button = byId("run-checks");
  button.addEventListener("click", function () {
    byId("results").innerHTML = "";
    const tests = allTests();
    button.disabled = true;
    function next() {
      if (tests.length === 0) { button.disabled = false; return; }
      try { tests.shift()(); }
      catch (error) { addRow("A check crashed", false, "It stopped with an error: " + error.message); }
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


/* ---------------------------------------------------------------------
   The tests several pages use
   ---------------------------------------------------------------------
   Pearson's chi-square test (K. Pearson, Philosophical Magazine 50
   (1900) 157-175): with "expected" the count each outcome should have,
   the statistic is the sum of (seen - expected)^2 / expected. If the
   counts come from the right odds, it has about the chi-square
   distribution with (number of groups - 1) degrees of freedom, and the
   p-value is the chance of a statistic at least this big. A page
   passes p above 0.001, so a correct sim fails 1 time in 1000.
   --------------------------------------------------------------------- */

// Do the counts match exact odds? "odds" maps each possible outcome to
// its probability, "seen" maps outcomes to how often they came up, in
// "runs" runs. Outcomes expected fewer than 5 times are pooled into one
// group, the usual rule (W. G. Cochran, "Some methods for strengthening
// the common chi-square tests", Biometrics 10 (1954) 417-451).
// Returns { statistic, groups, degrees, pValue }.
function pooledChiSquare(odds, seen, runs) {
  let statistic = 0, groups = 0, pooledSeen = 0, pooledExpected = 0;
  for (const [outcome, p] of odds) {
    const expected = p * runs, observed = seen.get(outcome) || 0;
    if (expected < 5) { pooledSeen += observed; pooledExpected += expected; continue; }
    statistic += (observed - expected) ** 2 / expected;
    groups += 1;
  }
  if (pooledExpected > 0) {
    statistic += (pooledSeen - pooledExpected) ** 2 / pooledExpected;
    groups += 1;
  }
  const degrees = groups - 1;
  return { statistic: statistic, groups: groups, degrees: degrees, pValue: 1 - jStat.chisquare.cdf(statistic, degrees) };
}

// Are the outcomes equally likely? "counts" is how often each came up.
// Returns { statistic, degrees, pValue }.
function equalChiSquare(counts) {
  let total = 0;
  for (const c of counts) total += c;
  const expected = total / counts.length;
  let statistic = 0;
  for (const c of counts) statistic += (c - expected) ** 2 / expected;
  const degrees = counts.length - 1;
  return { statistic: statistic, degrees: degrees, pValue: 1 - jStat.chisquare.cdf(statistic, degrees) };
}

// How many standard deviations "count" is from its mean, when each of
// "trials" independent tries succeeds with probability p: the count is
// binomial, with mean trials p and standard deviation
// sqrt(trials p (1 - p)). Pages pass below 4 (in absolute value):
// by the normal approximation (the central limit theorem, R. Durrett,
// "Probability: Theory and Examples", 5th ed., Cambridge University
// Press, 2019, Theorem 3.4.1), a correct sim is that far off about 1
// time in 16000.
function binomialZ(count, trials, p) {
  return (count - trials * p) / Math.sqrt(trials * p * (1 - p));
}
