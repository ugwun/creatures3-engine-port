// architecture_graph.js — layered live-context architecture workspace
"use strict";

(() => {
  const Model = window.ArchitectureModel;
  if (!Model) return;

  const dom = {
    view: document.getElementById("docs-graph-view"),
    viewport: document.getElementById("docs-viewport"),
    graph: document.getElementById("docs-graph-wrap"),
    nodes: document.getElementById("docs-nodes-container"),
    edges: document.getElementById("docs-edges-svg"),
    textView: document.getElementById("architecture-text-view"),
    filters: document.getElementById("architecture-layer-filters"),
    evidence: document.getElementById("architecture-evidence-legend"),
    liveSummary: document.getElementById("architecture-live-summary"),
    identifiers:
      document.getElementById("architecture-live-identifiers"),
    detail: document.getElementById("docs-detail-content"),
    search: document.getElementById("architecture-search"),
    path: document.getElementById("architecture-path-select"),
    toggle: document.getElementById("architecture-view-toggle"),
    fitAll: document.getElementById("btn-docs-reset"),
    fitSelection:
      document.getElementById("architecture-fit-selection"),
    zoomIn: document.getElementById("btn-docs-zoom-in"),
    zoomOut: document.getElementById("btn-docs-zoom-out"),
    status: document.getElementById("architecture-toolbar-status")
  };

  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 68;
  const COLUMN_GAP = 94;
  const ROW_GAP = 34;
  const PADDING_X = 72;
  const PADDING_Y = 68;
  const layerColors = {
    engine: "#111111",
    domain: "#ff5f00",
    transport: "#0055ff",
    browser: "#7700cc",
    surface: "#16804c",
    external: "#555555"
  };

  let active = false;
  let textMode = false;
  let selected = null;
  let selectedPathId = null;
  let enabledLayers = new Set(Model.LAYERS.map(layer => layer.id));
  let zoom = 1;
  let panX = 20;
  let panY = 20;
  let panning = null;
  let layout = new Map();
  let graphWidth = 1200;
  let graphHeight = 900;
  let live = Model.liveContext({}, {}, [], Date.now());
  let timer = null;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentRoute() {
    return window.DevToolsNavigation
      ? DevToolsNavigation.getCurrentRoute() : {};
  }

  function resourceEntries() {
    if (!window.performance ||
        typeof performance.getEntriesByType !== "function") return [];
    return performance.getEntriesByType("resource");
  }

  function activePathId() {
    const route = currentRoute();
    return selectedPathId || route.trace || live.pathId || null;
  }

  function activePath() {
    return Model.pathById(activePathId());
  }

  function refreshLive() {
    live = Model.liveContext(
      ObservatoryState.getState(),
      currentRoute(),
      resourceEntries(),
      Date.now()
    );
    render();
  }

  function statusForNode(nodeId) {
    if (live.observedNodeIds.includes(nodeId)) return "observed";
    if (live.derivedNodeIds.includes(nodeId)) return "derived";
    if (live.contextNodeIds.includes(nodeId)) return "context";
    const dataPath = activePath();
    if (dataPath && dataPath.steps.some(step => step.nodeId === nodeId))
      return "path";
    return "static";
  }

  function renderFilters() {
    dom.filters.replaceChildren();
    Model.LAYERS.forEach(layer => {
      const label = document.createElement("label");
      label.className = "architecture-layer-filter";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = layer.id;
      input.checked = enabledLayers.has(layer.id);
      input.addEventListener("change", () => {
        if (input.checked) enabledLayers.add(layer.id);
        else enabledLayers.delete(layer.id);
        render();
      });
      const swatch = document.createElement("span");
      swatch.className = "architecture-layer-swatch";
      swatch.style.setProperty("--layer-color", layerColors[layer.id]);
      const words = document.createElement("span");
      words.innerHTML = "<strong>" + esc(layer.label) + "</strong><small>" +
        esc(layer.description) + "</small>";
      label.append(input, swatch, words);
      dom.filters.appendChild(label);
    });
  }

  function renderEvidenceLegend() {
    dom.evidence.replaceChildren();
    Object.keys(Model.EVIDENCE).forEach(level => {
      const item = document.createElement("div");
      item.className = "architecture-evidence-key architecture-evidence-key--" +
        level;
      item.innerHTML = "<span aria-hidden=\"true\"></span><div><strong>" +
        esc(Model.EVIDENCE[level].label) + "</strong><small>" +
        esc(Model.EVIDENCE[level].description) + "</small></div>";
      dom.evidence.appendChild(item);
    });
    const path = document.createElement("div");
    path.className = "architecture-evidence-key architecture-evidence-key--path";
    path.innerHTML = "<span aria-hidden=\"true\"></span><div><strong>" +
      "Selected documented path</strong><small>Focus only; it does not " +
      "claim recent execution.</small></div>";
    dom.evidence.appendChild(path);
  }

  function renderLiveContext() {
    const endpointCount = Object.keys(live.recentEndpoints).length;
    dom.liveSummary.textContent = live.connected
      ? endpointCount
        ? endpointCount + " API/stream source" +
          (endpointCount === 1 ? "" : "s") +
          " observed in this browser within 30 seconds."
        : "Connected, with no mapped request observed in the last 30 seconds."
      : "Engine disconnected. Static architecture remains available.";
    dom.identifiers.replaceChildren();
    live.identifiers.forEach(identifier => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = identifier.label;
      dd.textContent = identifier.value;
      row.append(dt, dd);
      dom.identifiers.appendChild(row);
    });
  }

  function visible() {
    return Model.visibleModel(
      Array.from(enabledLayers),
      dom.search.value
    );
  }

  function calculateLayout(nodes) {
    layout = new Map();
    let tallest = 0;
    Model.LAYERS.forEach((layer, column) => {
      const members = nodes.filter(node => node.layer === layer.id)
        .sort((left, right) => left.order - right.order);
      tallest = Math.max(tallest, members.length);
      members.forEach((node, row) => {
        layout.set(node.id, {
          x: PADDING_X + column * (NODE_WIDTH + COLUMN_GAP),
          y: PADDING_Y + row * (NODE_HEIGHT + ROW_GAP),
          width: NODE_WIDTH,
          height: NODE_HEIGHT
        });
      });
    });
    graphWidth = PADDING_X * 2 +
      Model.LAYERS.length * NODE_WIDTH +
      (Model.LAYERS.length - 1) * COLUMN_GAP;
    graphHeight = PADDING_Y * 2 +
      Math.max(1, tallest) * NODE_HEIGHT +
      Math.max(0, tallest - 1) * ROW_GAP;
  }

  function renderGraph(model) {
    calculateLayout(model.nodes);
    dom.nodes.replaceChildren();
    dom.edges.replaceChildren();
    dom.graph.style.width = graphWidth + "px";
    dom.graph.style.height = graphHeight + "px";
    dom.nodes.style.width = graphWidth + "px";
    dom.nodes.style.height = graphHeight + "px";
    dom.edges.setAttribute("width", graphWidth);
    dom.edges.setAttribute("height", graphHeight);
    renderMarkers();

    model.nodes.forEach(node => {
      const box = layout.get(node.id);
      const button = document.createElement("button");
      const status = statusForNode(node.id);
      button.type = "button";
      button.className = "docs-node architecture-node--" + status +
        (selected && selected.type === "node" && selected.id === node.id
          ? " docs-node--selected" : "");
      button.dataset.architectureNode = node.id;
      button.dataset.layer = node.layer;
      button.style.left = box.x + "px";
      button.style.top = box.y + "px";
      button.style.setProperty("--layer-color", layerColors[node.layer]);
      button.setAttribute("aria-label",
        node.label + ". " + node.layer + " layer. " +
        nodeStatusLabel(status) + ". " + node.summary);
      button.innerHTML =
        "<span class=\"architecture-node__layer\">" +
          esc(Model.LAYERS.find(layer => layer.id === node.layer).label) +
        "</span><strong class=\"docs-node-label\">" +
          esc(node.label) +
        "</strong><small>" + esc(node.kind) + "</small>";
      button.addEventListener("click", event => {
        event.stopPropagation();
        select("node", node.id);
      });
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
          .includes(event.key)) return;
        const next = nearestNode(node.id, event.key, model.nodes);
        if (!next) return;
        event.preventDefault();
        const target = dom.nodes.querySelector(
          "[data-architecture-node=\"" + CSS.escape(next.id) + "\"]");
        if (target) target.focus();
      });
      dom.nodes.appendChild(button);
    });
    model.edges.forEach(renderEdge);
    updateTransform();
  }

  function nodeStatusLabel(status) {
    if (status === "observed") return "Recent request observed";
    if (status === "derived") return "Derived from a recent request";
    if (status === "context") return "Current investigation context only";
    if (status === "path") return "Part of selected documented path";
    return "Static architecture";
  }

  function nearestNode(id, key, nodes) {
    const origin = layout.get(id);
    if (!origin) return null;
    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    const sign = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    let best = null;
    let bestScore = Infinity;
    nodes.forEach(node => {
      if (node.id === id) return;
      const box = layout.get(node.id);
      if (!box) return;
      const primary = horizontal ? box.x - origin.x : box.y - origin.y;
      if (Math.sign(primary) !== sign) return;
      const secondary = horizontal
        ? Math.abs(box.y - origin.y) : Math.abs(box.x - origin.x);
      const score = Math.abs(primary) + secondary * 1.5;
      if (score < bestScore) {
        best = node;
        bestScore = score;
      }
    });
    return best;
  }

  function renderMarkers() {
    const defs = document.createElementNS(
      "http://www.w3.org/2000/svg", "defs");
    ["static", "observed", "derived", "inferred"].forEach(level => {
      const marker = document.createElementNS(
        "http://www.w3.org/2000/svg", "marker");
      marker.id = "architecture-arrow-" + level;
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", "7");
      marker.setAttribute("refY", "4");
      marker.setAttribute("orient", "auto");
      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg", "path");
      arrow.setAttribute("d", "M0,0 L8,4 L0,8 z");
      arrow.setAttribute("class", "architecture-arrow architecture-arrow--" +
        level);
      marker.appendChild(arrow);
      defs.appendChild(marker);
    });
    dom.edges.appendChild(defs);
  }

  function renderEdge(edge) {
    const from = layout.get(edge.from);
    const to = layout.get(edge.to);
    if (!from || !to) return;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max(40, Math.abs(x2 - x1) * 0.45);
    const d = "M " + x1 + " " + y1 + " C " +
      (x1 + bend) + " " + y1 + ", " +
      (x2 - bend) + " " + y2 + ", " + x2 + " " + y2;
    const group = document.createElementNS(
      "http://www.w3.org/2000/svg", "g");
    const liveEdge = Boolean(edge.endpointNode &&
      live.recentEndpoints[edge.endpointNode]);
    group.classList.add("architecture-edge-group");
    group.dataset.evidence = edge.evidence;
    if (liveEdge) group.classList.add("architecture-edge-group--live");
    if (selected && selected.type === "edge" && selected.id === edge.id)
      group.classList.add("architecture-edge-group--selected");

    const line = document.createElementNS(
      "http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", d);
    line.setAttribute("class", "architecture-edge architecture-edge--" +
      edge.evidence);
    line.setAttribute("marker-end",
      "url(#architecture-arrow-" + edge.evidence + ")");
    const hit = document.createElementNS(
      "http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", d);
    hit.setAttribute("class", "architecture-edge-hit");
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "button");
    hit.setAttribute("aria-label",
      Model.nodeById(edge.from).label + " " + edge.label + " " +
      Model.nodeById(edge.to).label + ". " +
      Model.EVIDENCE[edge.evidence].label +
      (liveEdge ? ". Recent mapped endpoint activity observed." : ""));
    hit.dataset.architectureEdge = edge.id;
    hit.addEventListener("click", event => {
      event.stopPropagation();
      select("edge", edge.id);
    });
    hit.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select("edge", edge.id);
    });
    hit.addEventListener("focus", () =>
      group.classList.add("architecture-edge-group--focused"));
    hit.addEventListener("blur", () =>
      group.classList.remove("architecture-edge-group--focused"));
    group.append(line, hit);
    dom.edges.appendChild(group);
  }

  function renderText(model) {
    dom.textView.replaceChildren();
    Model.LAYERS.forEach(layer => {
      const members = model.nodes.filter(node => node.layer === layer.id);
      if (!members.length) return;
      const section = document.createElement("section");
      section.setAttribute("role", "group");
      section.setAttribute("aria-labelledby",
        "architecture-text-layer-" + layer.id);
      const heading = document.createElement("h2");
      heading.id = "architecture-text-layer-" + layer.id;
      heading.textContent = layer.label + " layer";
      section.appendChild(heading);
      members.sort((left, right) => left.order - right.order)
        .forEach(node => {
          const item = document.createElement("article");
          item.className = "architecture-text-node architecture-text-node--" +
            statusForNode(node.id) +
            (selected && selected.type === "node" && selected.id === node.id
              ? " architecture-text-node--selected" : "");
          item.setAttribute("role", "treeitem");
          item.setAttribute("aria-selected", String(Boolean(
            selected && selected.type === "node" && selected.id === node.id)));
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.architectureNode = node.id;
          button.textContent = node.label;
          button.addEventListener("click", () => select("node", node.id));
          const summary = document.createElement("p");
          summary.textContent = node.summary;
          const relationships = document.createElement("ul");
          model.edges.filter(edge =>
            edge.from === node.id || edge.to === node.id)
            .forEach(edge => {
              const li = document.createElement("li");
              const edgeButton = document.createElement("button");
              edgeButton.type = "button";
              edgeButton.className = "architecture-text-edge--" +
                edge.evidence +
                (selected && selected.type === "edge" &&
                  selected.id === edge.id
                  ? " architecture-text-edge--selected" : "");
              edgeButton.dataset.architectureEdge = edge.id;
              const other = Model.nodeById(
                edge.from === node.id ? edge.to : edge.from);
              edgeButton.textContent = edge.label + " · " + other.label +
                " · " + Model.EVIDENCE[edge.evidence].label;
              edgeButton.addEventListener("click",
                () => select("edge", edge.id));
              li.appendChild(edgeButton);
              relationships.appendChild(li);
            });
          item.append(button, summary, relationships);
          section.appendChild(item);
        });
      dom.textView.appendChild(section);
    });
  }

  function renderPath(dataPath) {
    if (!dataPath) return "";
    return "<section class=\"architecture-path\">" +
      "<h3>" + esc(dataPath.label) + "</h3>" +
      "<p class=\"architecture-path__limit\">Documented data flow. Steps " +
      "are live only when separately marked by recent request evidence.</p>" +
      "<ol>" + dataPath.steps.map((item, index) => {
        const owner = Model.nodeById(item.nodeId);
        return "<li data-evidence=\"" + esc(item.evidence) + "\">" +
          "<span class=\"architecture-path__number\">" + (index + 1) +
          "</span><div><strong>" + esc(owner.label) + "</strong>" +
          "<code>" + esc(item.field) + "</code>" +
          "<dl><div><dt>Unit</dt><dd>" + esc(item.unit) +
          "</dd></div><div><dt>Transformation</dt><dd>" +
          esc(item.transformation) +
          "</dd></div><div><dt>Cadence</dt><dd>" + esc(item.cadence) +
          "</dd></div><div><dt>Evidence</dt><dd>" +
          esc(Model.EVIDENCE[item.evidence].label) +
          "</dd></div></dl></div></li>";
      }).join("") + "</ol></section>";
  }

  function nodeActions(node) {
    const actions = [];
    if (node.routeId) {
      actions.push("<button type=\"button\" data-architecture-route=\"" +
        esc(node.routeId) + "\">Open tool</button>");
    }
    if (node.helpId) {
      actions.push("<button type=\"button\" data-architecture-help=\"" +
        esc(node.helpId) + "\">Open help</button>");
    }
    if (node.document) {
      actions.push("<button type=\"button\" data-architecture-doc=\"" +
        esc(node.document) + "\" data-architecture-section=\"" +
        esc(node.section || "") + "\">Open reference</button>");
    }
    return actions.length
      ? "<div class=\"architecture-detail-actions\">" +
        actions.join("") + "</div>" : "";
  }

  function renderInspector() {
    const dataPath = activePath();
    let content = "";
    if (selected && selected.type === "node") {
      const node = Model.nodeById(selected.id);
      const status = statusForNode(node.id);
      const endpoint = live.recentEndpoints[node.id];
      content += "<article class=\"architecture-detail\">" +
        "<span class=\"architecture-detail__status architecture-detail__status--" +
        esc(status) + "\">" + esc(nodeStatusLabel(status)) + "</span>" +
        "<h2>" + esc(node.label) + "</h2>" +
        "<p>" + esc(node.summary) + "</p>" +
        "<dl><div><dt>Stable ID</dt><dd><code>" + esc(node.id) +
        "</code></dd></div><div><dt>Layer</dt><dd>" +
        esc(node.layer) + "</dd></div>" +
        (node.endpoint
          ? "<div><dt>Transport</dt><dd><code>" +
            esc(node.endpoint) + "</code></dd></div>" : "") +
        (node.source
          ? "<div><dt>Source metadata</dt><dd><code>" +
            esc(node.source) +
            "</code><small>Repository source is recorded but unavailable " +
            "as a browser link.</small></dd></div>" : "") +
        (endpoint
          ? "<div><dt>Recent activity</dt><dd>" +
            Math.round(endpoint.ageMs / 100) / 10 +
            " s ago" + (endpoint.status
              ? " · HTTP " + endpoint.status : "") + "</dd></div>" : "") +
        "</dl>" + nodeActions(node) + "</article>";
    } else if (selected && selected.type === "edge") {
      const edge = Model.edgeById(selected.id);
      const from = Model.nodeById(edge.from);
      const to = Model.nodeById(edge.to);
      const endpoint = edge.endpointNode &&
        live.recentEndpoints[edge.endpointNode];
      content += "<article class=\"architecture-detail\">" +
        "<span class=\"architecture-detail__status architecture-detail__status--" +
        esc(edge.evidence) + "\">" +
        esc(Model.EVIDENCE[edge.evidence].label) + "</span>" +
        "<h2>" + esc(from.label) + " → " + esc(to.label) + "</h2>" +
        "<p>" + esc(edge.label) + "</p><dl>" +
        "<div><dt>Stable ID</dt><dd><code>" + esc(edge.id) +
        "</code></dd></div><div><dt>Relationship</dt><dd>" +
        esc(edge.relationship) + "</dd></div><div><dt>Unit</dt><dd>" +
        esc(edge.unit || "Not applicable") +
        "</dd></div><div><dt>Transformation</dt><dd>" +
        esc(edge.transformation) + "</dd></div><div><dt>Cadence</dt><dd>" +
        esc(edge.cadence) + "</dd></div>" +
        (endpoint
          ? "<div><dt>Recent activity</dt><dd>Mapped endpoint observed " +
            Math.round(endpoint.ageMs / 100) / 10 + " s ago</dd></div>"
          : "<div><dt>Live activity</dt><dd>Not observed in the current " +
            "30-second browser window.</dd></div>") +
        "</dl></article>";
    }
    content += renderPath(dataPath);
    if (!content) {
      content = "<div class=\"docs-empty-hint\">Choose a metric or select " +
        "a node or relationship. Static connections do not prove runtime " +
        "execution.</div>";
    }
    DomPatch.update(dom.detail, content);
  }

  dom.detail.addEventListener("click", event => {
    const route = event.target.closest("[data-architecture-route]");
    if (route) {
      DevToolsNavigation.navigateToRoute(route.dataset.architectureRoute);
      return;
    }
    const help = event.target.closest("[data-architecture-help]");
    if (help) {
      if (window.ContextualHelp) {
        ContextualHelp.open(help.dataset.architectureHelp, help);
      }
      return;
    }
    const doc = event.target.closest("[data-architecture-doc]");
    if (doc) {
      DevToolsNavigation.openDocs(
        doc.dataset.architectureDoc,
        doc.dataset.architectureSection || null);
    }
  });

  function renderPathSelect() {
    const prior = selectedPathId || "";
    dom.path.replaceChildren();
    const automatic = document.createElement("option");
    automatic.value = "";
    const mapped = Model.pathById(currentRoute().trace || live.pathId);
    automatic.textContent = mapped
      ? "Auto · " + mapped.label : "Auto · no metric selected";
    dom.path.appendChild(automatic);
    Model.PATHS.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      dom.path.appendChild(option);
    });
    dom.path.value = prior;
  }

  function render() {
    renderLiveContext();
    renderPathSelect();
    const model = visible();
    renderGraph(model);
    renderText(model);
    dom.viewport.hidden = textMode;
    dom.textView.hidden = !textMode;
    dom.toggle.textContent = textMode ? "Graph view" : "Text view";
    dom.toggle.setAttribute("aria-pressed", String(textMode));
    dom.status.textContent = model.nodes.length + " nodes · " +
      model.edges.length + " relationships · " +
      Object.keys(live.recentEndpoints).length + " recently observed";
    renderInspector();
  }

  function select(type, id) {
    selected = { type, id };
    render();
    const selector = type === "node"
      ? "[data-architecture-node=\"" + CSS.escape(id) + "\"]"
      : "[data-architecture-edge=\"" + CSS.escape(id) + "\"]";
    const container = textMode ? dom.textView
      : (type === "node" ? dom.nodes : dom.edges);
    const target = container.querySelector(selector);
    if (target) target.focus();
  }

  function updateTransform() {
    dom.graph.style.transform = "translate(" + panX + "px," + panY +
      "px) scale(" + zoom + ")";
  }

  function fitAll() {
    const width = dom.viewport.clientWidth;
    const height = dom.viewport.clientHeight;
    if (!width || !height) return;
    zoom = Math.min(1.2, Math.max(0.2,
      Math.min((width - 32) / graphWidth, (height - 32) / graphHeight)));
    panX = (width - graphWidth * zoom) / 2;
    panY = (height - graphHeight * zoom) / 2;
    updateTransform();
  }

  function fitSelection() {
    if (!selected || selected.type !== "node") {
      fitAll();
      return;
    }
    const box = layout.get(selected.id);
    if (!box) return;
    zoom = Math.max(0.7, Math.min(1.5, zoom));
    panX = dom.viewport.clientWidth / 2 -
      (box.x + box.width / 2) * zoom;
    panY = dom.viewport.clientHeight / 2 -
      (box.y + box.height / 2) * zoom;
    updateTransform();
  }

  function changeZoom(delta) {
    const next = Math.max(0.2, Math.min(3, zoom + delta));
    const centerX = dom.viewport.clientWidth / 2;
    const centerY = dom.viewport.clientHeight / 2;
    const localX = (centerX - panX) / zoom;
    const localY = (centerY - panY) / zoom;
    zoom = next;
    panX = centerX - localX * zoom;
    panY = centerY - localY * zoom;
    updateTransform();
  }

  function setActive(value) {
    active = Boolean(value);
    if (active) {
      refreshLive();
      requestAnimationFrame(() => {
        if (!selected) fitAll();
      });
      if (!timer) timer = setInterval(refreshLive, 2000);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function open(route) {
    if (route && route.trace &&
        Model.pathById(route.trace)) selectedPathId = route.trace;
    refreshLive();
    requestAnimationFrame(fitAll);
  }

  function capture() {
    return {
      textMode,
      selected,
      selectedPathId,
      enabledLayers: Array.from(enabledLayers),
      search: dom.search.value,
      zoom,
      panX,
      panY
    };
  }

  function restore(saved) {
    if (!saved) return;
    textMode = Boolean(saved.textMode);
    selected = saved.selected || null;
    selectedPathId = Model.pathById(saved.selectedPathId)
      ? saved.selectedPathId : null;
    enabledLayers = new Set(
      (saved.enabledLayers || Model.LAYERS.map(layer => layer.id))
        .filter(id => Model.LAYERS.some(layer => layer.id === id))
    );
    dom.search.value = saved.search || "";
    zoom = Number(saved.zoom) || 1;
    panX = Number(saved.panX) || 0;
    panY = Number(saved.panY) || 0;
    renderFilters();
    render();
    updateTransform();
  }

  renderFilters();
  renderEvidenceLegend();
  dom.path.addEventListener("change", () => {
    selectedPathId = dom.path.value || null;
    render();
  });
  dom.search.addEventListener("input", render);
  dom.search.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !dom.search.value) return;
    dom.search.value = "";
    render();
  });
  dom.toggle.addEventListener("click", () => {
    textMode = !textMode;
    render();
  });
  dom.fitAll.addEventListener("click", fitAll);
  dom.fitSelection.addEventListener("click", fitSelection);
  dom.zoomIn.addEventListener("click", () => changeZoom(0.2));
  dom.zoomOut.addEventListener("click", () => changeZoom(-0.2));
  dom.viewport.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 0.15 : -0.15);
  }, { passive: false });
  dom.viewport.addEventListener("pointerdown", event => {
    if (event.target.closest &&
        event.target.closest(".docs-node, .architecture-edge-hit")) return;
    panning = {
      pointerId: event.pointerId,
      x: event.clientX - panX,
      y: event.clientY - panY
    };
    dom.viewport.setPointerCapture(event.pointerId);
  });
  dom.viewport.addEventListener("pointermove", event => {
    if (!panning || event.pointerId !== panning.pointerId) return;
    panX = event.clientX - panning.x;
    panY = event.clientY - panning.y;
    updateTransform();
  });
  dom.viewport.addEventListener("pointerup", event => {
    if (!panning || event.pointerId !== panning.pointerId) return;
    panning = null;
    dom.viewport.releasePointerCapture(event.pointerId);
  });
  dom.viewport.addEventListener("click", event => {
    if (event.target !== dom.viewport &&
        event.target !== dom.graph &&
        event.target !== dom.nodes) return;
    selected = null;
    render();
  });
  dom.viewport.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
      .includes(event.key) || event.target !== dom.viewport) return;
    event.preventDefault();
    const amount = event.shiftKey ? 80 : 30;
    if (event.key === "ArrowLeft") panX += amount;
    if (event.key === "ArrowRight") panX -= amount;
    if (event.key === "ArrowUp") panY += amount;
    if (event.key === "ArrowDown") panY -= amount;
    updateTransform();
  });

  ObservatoryState.subscribe(
    state => ({
      connection: state.connection,
      world: state.world,
      selection: state.selection,
      recording: state.recording
    }),
    () => { if (active) refreshLive(); },
    (left, right) =>
      left.connection === right.connection &&
      left.world === right.world &&
      left.selection === right.selection &&
      left.recording === right.recording
  );
  if (window.DevToolsNavigation) {
    DevToolsNavigation.subscribe(() => {
      if (active) refreshLive();
    });
  }

  render();

  window.ArchitectureGraph = Object.freeze({
    setActive,
    open,
    capture,
    restore,
    refresh: refreshLive,
    selectNode(id) {
      if (!Model.nodeById(id)) return false;
      select("node", id);
      return true;
    },
    selectEdge(id) {
      if (!Model.edgeById(id)) return false;
      select("edge", id);
      return true;
    },
    getState: () => ({
      active,
      textMode,
      selected,
      selectedPathId: activePathId(),
      live
    })
  });
})();
