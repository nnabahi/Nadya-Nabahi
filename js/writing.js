// writing.js — runs on writing.html.
//
// Each post is a <details class="card post"> box. This file does two things:
//   1. sorts the posts newest first, by the date in each post's "post-date";
//   2. turns each post's Markdown text into formatted text, with the math
//      typeset by KaTeX.
//
// It also gives each open post a comment box at its bottom, via giscus
// (https://giscus.app): comments are stored in this repo's Discussions
// tab, and people sign in with GitHub to write one.
//
// Libraries it uses (loaded by writing.html before this file):
//   marked  (marked.parse)        Markdown -> HTML
//   KaTeX   (katex.renderToString) a formula -> HTML

// The giscus settings, copied from giscus.app. Until repoId and
// categoryId are filled in, the posts simply have no comment box.
const GISCUS = {
  repo:       "nnabahi/Nadya-Nabahi",
  repoId:     "",
  category:   "Announcements",
  categoryId: "",
};

sortPostsNewestFirst();
document.querySelectorAll('script[type="text/markdown"]').forEach(renderPost);
document.querySelectorAll(".post").forEach(post =>
  post.addEventListener("toggle", () => { if (post.open) showComments(post); }));


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

// Puts the comment box at the bottom of this post. giscus allows one box
// per page, so the box leaves the post it was in before. Each post's
// comments are filed under its id (the id="..." on its <details>), so
// changing a title keeps its comments.
function showComments(post) {
  if (!GISCUS.repoId || !GISCUS.categoryId) return;
  document.querySelectorAll(".giscus, .giscus-loader").forEach(old => old.remove());

  const box = document.createElement("div");
  box.className = "giscus";              // giscus puts its comments into this div
  post.appendChild(box);
  post.appendChild(giscusLoader(post.id));
}

// The <script> that loads giscus, with its settings as data-... attributes.
function giscusLoader(term) {
  const script = document.createElement("script");
  script.className = "giscus-loader";
  script.src = "https://giscus.app/client.js";
  script.crossOrigin = "anonymous";
  script.async = true;
  const settings = {
    "repo": GISCUS.repo,
    "repo-id": GISCUS.repoId,
    "category": GISCUS.category,
    "category-id": GISCUS.categoryId,
    "mapping": "specific",               // file comments under our own name ...
    "term": term,                        // ... the post's id
    "strict": "1",
    "reactions-enabled": "1",
    "emit-metadata": "0",
    "input-position": "bottom",
    "theme": "light",
    "lang": "en",
  };
  for (const [name, value] of Object.entries(settings)) script.setAttribute("data-" + name, value);
  return script;
}
