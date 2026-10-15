// writing.js — runs on writing.html.
//
// Each post is a <details class="card post"> box. This file does two things:
//   1. sorts the posts newest first, by the date in each post's "post-date";
//   2. turns each post's Markdown text into formatted text, with the math
//      typeset by KaTeX.
//
// Libraries it uses (loaded by writing.html before this file):
//   marked  (marked.parse)        Markdown -> HTML
//   KaTeX   (katex.renderToString) a formula -> HTML

sortPostsNewestFirst();
document.querySelectorAll('script[type="text/markdown"]').forEach(renderPost);


// Moves the posts into date order, newest at the top. Dates are written
// YEAR-MONTH-DAY, so comparing them as text gives the right order.
function sortPostsNewestFirst() {
  const posts = [...document.querySelectorAll(".post")];
  const dateOf = post => post.querySelector(".post-date").textContent.trim();
  posts.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  posts.forEach(post => post.parentNode.appendChild(post));  // appending moves it to the end
}

// Replaces one <script type="text/markdown"> block with the formatted post.
function renderPost(script) {
  const body = document.createElement("div");
  body.className = "post-body";
  body.innerHTML = markdownToHtml(removeIndent(script.textContent));
  script.replaceWith(body);
}

// Markdown would mangle math ("_" and "*" mean slanted text to it), so the
// math is set aside first, the rest goes through marked, and then each
// formula is typeset by KaTeX and put back where it was.
function markdownToHtml(markdown) {
  const formulas = [];
  const withoutMath = setAsideMath(markdown, formulas);
  return putMathBack(marked.parse(withoutMath), formulas);
}

// Swaps every $$...$$ (own line) and $...$ (in a sentence) for a marker
// like MATH0END, MATH1END, ..., and remembers the formulas in order.
// "(?<!\\)" skips a dollar written as \$, which marked shows as a plain $.
function setAsideMath(markdown, formulas) {
  return markdown.replace(/(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)\$/g, (match, display, inline) => {
    formulas.push({ tex: display ?? inline, displayMode: display !== undefined });
    return "MATH" + (formulas.length - 1) + "END";
  });
}

// Swaps each marker back for its typeset formula.
function putMathBack(html, formulas) {
  return html.replace(/MATH(\d+)END/g, (match, i) =>
    katex.renderToString(formulas[i].tex, { displayMode: formulas[i].displayMode, throwOnError: false }));
}

// Removes the indent shared by every line, so the text can be indented
// inside writing.html. (Markdown would read 4 leading spaces as code.)
function removeIndent(text) {
  const lines = text.split("\n");
  const indents = lines.filter(line => line.trim() !== "").map(line => line.match(/^ */)[0].length);
  const shared = Math.min(...indents);
  return lines.map(line => line.slice(shared)).join("\n").trim();
}
