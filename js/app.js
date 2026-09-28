/* =========================================================
   App shell: sidebar navigation, hash-based routing, and
   mounting/unmounting simulation modules into #main.

   To add a new simulation:
     1. Create js/sims/yourSim.js exporting a default object
        { id, name, category, description, mount(container) }
        whose mount() returns { destroy() }.
     2. Import it below and add it to the `sims` array.
   That's it — it will appear in the sidebar automatically,
   grouped by its `category`.
   ========================================================= */

import automata from "./sims/automata.js";
import sandpiles from "./sims/sandpiles.js";
import blockgrowth from "./sims/blockgrowth.js";
import walkcoloring from "./sims/walkcoloring.js";
import connectedcoloring from "./sims/connectedcoloring.js";
import gradientpercolation from "./sims/gradientpercolation.js";
import pathcount from "./sims/pathcount.js";
import tilepacking from "./sims/tilepacking.js";
import { el } from "./lib/utils.js";

const sims = [automata, sandpiles, blockgrowth, walkcoloring, connectedcoloring, gradientpercolation, pathcount, tilepacking];

const mainEl = document.getElementById("main");
const navEl = document.getElementById("nav-groups");
const sidebarEl = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");

let activeInstance = null;

function groupByCategory(list) {
  const groups = new Map();
  for (const sim of list) {
    if (!groups.has(sim.category)) groups.set(sim.category, []);
    groups.get(sim.category).push(sim);
  }
  return groups;
}

function buildSidebar() {
  navEl.innerHTML = "";
  const homeItem = el("button", {
    class: "nav-item",
    "data-route": "",
    onclick: () => { window.location.hash = ""; },
  }, ["⌂ ", "Home"]);
  navEl.appendChild(el("div", { class: "nav-group" }, homeItem));

  for (const [category, list] of groupByCategory(sims)) {
    const group = el("div", { class: "nav-group" }, [
      el("div", { class: "nav-group-label" }, category),
      ...list.map((sim) =>
        el("button", {
          class: "nav-item",
          "data-route": sim.id,
          onclick: () => { window.location.hash = sim.id; },
        }, sim.name)
      ),
    ]);
    navEl.appendChild(group);
  }
}

function setActiveNav(route) {
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.getAttribute("data-route") === route);
  });
}

function renderHome() {
  const view = el("div", { id: "home-view" }, [
    el("h1", {}, "Toys n' Sims"),
    el("p", {}, "A collection of interactive simulations of mathematical models — cellular automata, sandpiles, tilings, and more. Pick one from the menu, or a card below, to start playing with it."),
    el("div", { class: "home-grid" }, sims.map((sim) =>
      el("div", { class: "home-card", onclick: () => { window.location.hash = sim.id; } }, [
        el("h3", {}, sim.name),
        el("p", {}, sim.description),
      ])
    )),
  ]);
  mainEl.appendChild(view);
}

function renderSim(sim) {
  const container = el("div");
  const header = el("div", { class: "sim-header" }, [
    el("div", {}, [
      el("h1", {}, sim.name),
      el("p", { class: "sim-desc" }, sim.description),
    ]),
  ]);
  mainEl.appendChild(header);
  mainEl.appendChild(container);
  activeInstance = sim.mount(container);
}

function render() {
  if (activeInstance && activeInstance.destroy) activeInstance.destroy();
  activeInstance = null;
  mainEl.innerHTML = "";

  const route = window.location.hash.replace(/^#/, "");
  setActiveNav(route);

  if (!route) {
    renderHome();
    return;
  }
  const sim = sims.find((s) => s.id === route);
  if (!sim) {
    mainEl.appendChild(el("p", {}, `Unknown simulation: "${route}"`));
    return;
  }
  renderSim(sim);
}

menuToggle.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-open");
});

window.addEventListener("hashchange", render);

buildSidebar();
document.body.classList.add("sidebar-open");
render();
