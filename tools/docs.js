// docs.js — built-in Markdown documentation and architecture routing
"use strict";

(() => {
  const docsWikiList = document.getElementById("docs-wiki-list");
  const docsWikiContent = document.getElementById("docs-wiki-content");
  const docsWikiToc = document.getElementById("docs-wiki-toc");
  const docsWikiSearch = document.getElementById("docs-wiki-search");
  const docsSubTabs = document.querySelectorAll(
    "#docs-sub-tabs .docs-sub-btn");
  const Graph = window.ArchitectureGraph;

  let wikiIndex = [];
  let currentWikiFile = null;
  let wikiLoadSerial = 0;
  let activeSubview = "wiki";

  function activateDocsSubview(tab) {
    activeSubview = tab === "graph" ? "graph" : "wiki";
    docsSubTabs.forEach(button =>
      button.classList.toggle(
        "active", button.dataset.docsTab === activeSubview));
    const wiki = activeSubview === "wiki";
    const wikiView = document.getElementById("docs-wiki-view");
    const graphView = document.getElementById("docs-graph-view");
    const graphControls = document.getElementById("docs-zoom-controls");
    wikiView.hidden = !wiki;
    graphView.hidden = wiki;
    graphControls.hidden = wiki;
    wikiView.style.display = wiki ? "flex" : "none";
    graphView.style.display = wiki ? "none" : "flex";
    graphControls.style.display = wiki ? "none" : "flex";
    if (Graph) Graph.setActive(!wiki);
  }

  docsSubTabs.forEach(button => {
    button.addEventListener("click", () => {
      if (!window.DevToolsNavigation) {
        activateDocsSubview(button.dataset.docsTab);
        return;
      }
      if (button.dataset.docsTab === "graph") {
        DevToolsNavigation.navigateToRoute("architecture");
      } else {
        DevToolsNavigation.openDocs(
          currentWikiFile || "observatory_task_guides.md");
      }
    });
  });

  async function loadWikiIndex() {
    try {
      const response = await fetch("/docs/index.json");
      if (!response.ok) throw new Error("Index not found");
      wikiIndex = await response.json();
      renderWikiSidebar();
      if (!currentWikiFile && wikiIndex.length) {
        await loadWikiPage(wikiIndex[0].file);
      }
    } catch (_) {
      docsWikiList.innerHTML =
        '<div class="crt-empty-hint">Failed to load index.json</div>';
    }
  }

  function renderWikiSidebar() {
    const filter = docsWikiSearch.value.toLowerCase().trim();
    docsWikiList.replaceChildren();
    wikiIndex.forEach(item => {
      if (filter &&
          !item.title.toLowerCase().includes(filter) &&
          !item.file.toLowerCase().includes(filter)) return;
      const element = document.createElement("div");
      element.className = "docs-wiki-item";
      element.textContent = item.title;
      element.classList.toggle(
        "docs-wiki-item--active", item.file === currentWikiFile);
      element.dataset.file = item.file;
      element.tabIndex = 0;
      element.setAttribute("role", "link");
      element.addEventListener("click", () =>
        DevToolsNavigation.openDocs(item.file));
      element.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        DevToolsNavigation.openDocs(item.file);
      });
      docsWikiList.appendChild(element);
    });
  }

  async function loadWikiPage(filename, section) {
    currentWikiFile = filename;
    Array.from(docsWikiList.children).forEach(element => {
      element.classList.toggle(
        "docs-wiki-item--active", element.dataset.file === filename);
    });
    const serial = ++wikiLoadSerial;
    try {
      const response = await fetch("/docs/" + filename);
      if (!response.ok) throw new Error("Could not load " + filename);
      const markdown = await response.text();
      if (serial !== wikiLoadSerial) return;
      docsWikiContent.innerHTML = marked.parse(markdown);
      generateWikiToc();
      interceptWikiLinks();
      if (section) {
        requestAnimationFrame(() => {
          const target = document.getElementById(section);
          if (target) {
            target.scrollIntoView({
              behavior: reducedMotion() ? "auto" : "smooth"
            });
          }
        });
      }
    } catch (error) {
      if (serial !== wikiLoadSerial) return;
      docsWikiContent.innerHTML =
        '<div class="crt-empty-hint">Error: ' +
        escapeText(error.message) + "</div>";
      docsWikiToc.replaceChildren();
    }
  }

  function escapeText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function reducedMotion() {
    const state = window.ObservatoryState &&
      ObservatoryState.getState();
    return Boolean(
      state && state.preferences && state.preferences.reducedMotion) ||
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function generateWikiToc() {
    docsWikiToc.replaceChildren();
    const headers = docsWikiContent.querySelectorAll("h1, h2, h3");
    if (!headers.length) {
      docsWikiToc.innerHTML =
        '<div class="crt-empty-hint">No headings</div>';
      return;
    }
    headers.forEach((heading, index) => {
      if (!heading.id) {
        const slug = heading.textContent.toLowerCase().trim()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        const existing = document.getElementById(slug);
        heading.id = existing ? slug + "-" + index : slug;
      }
      const link = document.createElement("a");
      link.className = "docs-toc-item docs-toc-" +
        heading.tagName.toLowerCase();
      link.href = "#" + heading.id;
      link.textContent = heading.textContent;
      link.addEventListener("click", event => {
        event.preventDefault();
        heading.scrollIntoView({
          behavior: reducedMotion() ? "auto" : "smooth"
        });
      });
      docsWikiToc.appendChild(link);
    });
  }

  function interceptWikiLinks() {
    docsWikiContent.querySelectorAll("a").forEach(link => {
      const href = link.getAttribute("href");
      if (!href || !/\.md(?:#.*)?$/.test(href)) return;
      link.addEventListener("click", event => {
        event.preventDefault();
        const hashIndex = href.indexOf("#");
        let target = hashIndex >= 0
          ? href.substring(0, hashIndex) : href;
        const section = hashIndex >= 0
          ? href.substring(hashIndex + 1) : null;
        if (target.startsWith("./")) target = target.substring(2);
        if (target.startsWith("/docs/"))
          target = target.substring("/docs/".length);
        else if (target.startsWith("/")) target = target.substring(1);
        DevToolsNavigation.openDocs(target, section);
      });
    });
  }

  docsWikiSearch.addEventListener("input", renderWikiSidebar);
  activateDocsSubview("wiki");
  loadWikiIndex();

  window.DocsWiki = Object.freeze({
    loadWikiPage,
    getCurrentFile: () => currentWikiFile
  });

  if (window.DevToolsNavigation) {
    DevToolsNavigation.registerWorkspace("docs", {
      capture() {
        return {
          subview: activeSubview,
          document: currentWikiFile,
          search: docsWikiSearch.value,
          listScrollTop: docsWikiList.scrollTop,
          contentScrollTop: docsWikiContent.scrollTop,
          graph: Graph ? Graph.capture() : null
        };
      },
      restore(saved) {
        if (!saved) return;
        docsWikiSearch.value = saved.search || "";
        renderWikiSidebar();
        activateDocsSubview(saved.subview || "wiki");
        if (Graph && saved.graph) Graph.restore(saved.graph);
        const loading = saved.document
          ? loadWikiPage(saved.document) : Promise.resolve();
        loading.finally(() => requestAnimationFrame(() => {
          docsWikiList.scrollTop = Number(saved.listScrollTop) || 0;
          docsWikiContent.scrollTop =
            Number(saved.contentScrollTop) || 0;
        }));
      },
      open(route) {
        const graph = route.view === "graph";
        activateDocsSubview(graph ? "graph" : "wiki");
        if (graph && Graph) Graph.open(route);
        if (!graph && route.document) {
          loadWikiPage(route.document, route.section);
        }
      }
    });
  }
})();
