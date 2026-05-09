// docs.js — Creatures 3 Developer Tools — Docs Tab
// Generates and manages the interactive architecture code graph
"use strict";

(() => {

// ── Graph Data ────────────────────────────────────────────────────────
const NODES = [
    { id: "App", layer: "core", label: "App", x: 150, y: 50, desc: "Main application loop, OS abstraction (SDL interface), input pumping. Holds the root Singletons." },
    { id: "DebugServer", layer: "core", label: "DebugServer", x: 450, y: 50, desc: "Embedded HTTP/REST API and SSE streaming server that powers these Developer Tools." },
    
    { id: "AgentManager", layer: "logic", label: "AgentManager", x: 150, y: 200, desc: "Manages the lifecycle, ticking, registration, and garbage collection of all Agents in the engine." },
    { id: "Map", layer: "logic", label: "Map / IMap", x: 450, y: 200, desc: "Room system and basic physics engine. Maintains floor zones, line-of-sight, boundaries, and spatial lookup." },
    { id: "DisplayEngine", layer: "logic", label: "DisplayEngine", x: 750, y: 200, desc: "Coordinates sprites, backgrounds, drawing surfaces, and rendering order (z-order)." },

    { id: "Agent", layer: "entities", label: "Agent", x: 250, y: 350, desc: "Base class for all interactive objects. Has an ID, a Classifier (Family/Genus/Species), script execution state, and basic spatial data." },
    
    { id: "CompoundAgent", layer: "entities", label: "CompoundAgent", x: 50, y: 500, desc: "An Agent composed of multiple parts (SpritePart, UITextPart). Used for vehicles, UI machines, buttons." },
    { id: "Creature", layer: "entities", label: "Creature", x: 250, y: 500, desc: "The main digital life-form class (Norn, Grendel). Inherits from Agent but adds genetics, brain, biochemistry, and skeletal rendering." },
    { id: "PointerAgent", layer: "entities", label: "PointerAgent", x: 450, y: 350, desc: "Specializes the hand cursor agent." },

    { id: "CAOSMachine", layer: "vm", label: "CAOSMachine", x: 750, y: 350, desc: "The virtual machine executing CAOS bytecodes for Agents. Each running script has its own CAOSMachine." },
    { id: "Scriptorium", layer: "vm", label: "Scriptorium", x: 750, y: 500, desc: "Registry of all installed CAOS macros/scripts, indexed by Classifier (Family/Genus/Species/Event)." },
    { id: "Orderiser", layer: "vm", label: "Orderiser", x: 950, y: 500, desc: "The CAOS compiler. Translates CAOS source code into bytecoded execution blocks for the CAOSMachine." },

    { id: "Skeleton", layer: "sim", label: "Skeleton", x: 50, y: 650, desc: "Manages limbs, joints, and sprite rendering for Creatures. Calculates poses and animations." },
    { id: "Brain", layer: "sim", label: "Brain", x: 250, y: 650, desc: "Neural network simulation for Creatures. The brain evaluates inputs and decides outputs through a network of Lobes and Tracts driven by SV (State Variable) Rules." },
    { id: "Lobe", layer: "sim", label: "Lobe", x: 200, y: 800, desc: "A collection of state-storing Neurons ('gray matter'). Some Lobes use Winner-Takes-All (WTA) rules (decn, attn, comb) to pick a single winning neuron, while sensory Lobes (driv, visn, move, stim) process states in parallel. Interestingly, the 'detl' and 'situ' Lobes are vestigial: the engine updates their states endlessly, but they have no outgoing connections!" },
    { id: "Tract", layer: "sim", label: "Tract", x: 100, y: 800, desc: "A bundle of Dendrites carrying Synaptic Weights between a source and destination Lobe ('white matter'). Tracts define the neural wiring pattern. For example, the stim->comb Tract uses column-based mapping, meaning missing noun categories in the environment natively result in completely inactive columns in the Concepts memory." },
    { id: "Biochemistry", layer: "sim", label: "Biochemistry", x: 450, y: 650, desc: "Simulates the concentrations of up to 256 chemicals reacting over time, representing drives and toxins." },
    { id: "Genome", layer: "sim", label: "Genome", x: 350, y: 800, desc: "Holds encoded genetic instructions to construct the Brain, Biochemistry, and initial traits." },

    { id: "CreaturesArchive", layer: "data", label: "CreaturesArchive", x: 950, y: 650, desc: "Binary serialization system using zlib compression. Reads/writes object graphs." },
    { id: "PersistentObject", layer: "data", label: "PersistentObject", x: 950, y: 800, desc: "Base class providing lightweight RTTI and polymorphic serialization. Practically all engine objects inherit from this." },
];

const EDGES = [
    { src: "App", dst: "AgentManager" },
    { src: "App", dst: "Map" },
    { src: "App", dst: "DisplayEngine" },
    { src: "App", dst: "DebugServer", dashed: true },
    
    { src: "AgentManager", dst: "Agent" },
    { src: "Map", dst: "Agent" },
    { src: "DisplayEngine", dst: "Agent" },
    
    { src: "Agent", dst: "CAOSMachine" },
    { src: "CAOSMachine", dst: "Scriptorium" },
    { src: "Orderiser", dst: "Scriptorium" },
    
    { src: "Agent", dst: "CompoundAgent" },
    { src: "Agent", dst: "Creature" },
    { src: "PointerAgent", dst: "Agent", label: "inherits" },
    { src: "CompoundAgent", dst: "Agent", label: "inherits" },
    { src: "Creature", dst: "Agent", label: "inherits" },

    { src: "Creature", dst: "Skeleton" },
    { src: "Creature", dst: "Brain" },
    { src: "Creature", dst: "Biochemistry" },
    
    { src: "Brain", dst: "Lobe" },
    { src: "Brain", dst: "Tract" },
    { src: "Tract", dst: "Lobe", dashed: true },

    { src: "Genome", dst: "Brain", dashed: true },
    { src: "Genome", dst: "Biochemistry", dashed: true },

    { src: "PersistentObject", dst: "Agent", label: "inherits" },
    { src: "CreaturesArchive", dst: "PersistentObject", dashed: true }
];

const LAYER_COLORS = {
    core: "#000000",
    logic: "#0055FF",
    entities: "#008000",
    vm: "#7700CC",
    sim: "#FF5F00",
    data: "#555555"
};

// ── DOM refs ─────────────────────────────────────────────────────────────
const container = document.getElementById("docs-container");
const graphWrap = document.getElementById("docs-graph-wrap");
const nodesContainer = document.getElementById("docs-nodes-container");
const edgesSvg = document.getElementById("docs-edges-svg");
const detailContent = document.getElementById("docs-detail-content");
const btnReset = document.getElementById("btn-docs-reset");

// ── State ─────────────────────────────────────────────────────────────────
let zoomLevel = 1.0;
let panX = 50;
let panY = 50;
let isPanning = false;
let startPanX = 0, startPanY = 0;
let selectedNodeId = null;

// Node dragging
let draggingNodeId = null;
let nodeStartX = 0;
let nodeStartY = 0;

// Node DOM mapping for easy edge calculation
const nodeEls = {};

// ── Initialization ────────────────────────────────────────────────────────
function initGraph() {
    nodesContainer.innerHTML = "";
    edgesSvg.innerHTML = "";
    initDefs();

    // Find boundaries to resize SVG container
    let maxX = 0;
    let maxY = 0;

    // Render nodes
    NODES.forEach(n => {
        const el = document.createElement("div");
        el.className = "docs-node";
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
        el.innerHTML = `<div class="docs-node-label">${escHtml(n.label)}</div>`;
        
        // Use layer color as top border accent
        const color = LAYER_COLORS[n.layer] || "#000";
        el.style.borderTop = `4px solid ${color}`;

        el.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            draggingNodeId = n.id;
            nodeStartX = e.clientX;
            nodeStartY = e.clientY;
            el.style.zIndex = "100";
        });

        el.addEventListener("click", (e) => {
            e.stopPropagation();
            selectNode(n.id);
        });

        nodesContainer.appendChild(el);
        nodeEls[n.id] = el;

        if (n.x + 200 > maxX) maxX = n.x + 200;
        if (n.y + 100 > maxY) maxY = n.y + 100;
    });

    // Make wrap big enough initially
    graphWrap.style.width = `${maxX + 600}px`;
    graphWrap.style.height = `${maxY + 600}px`;
    edgesSvg.setAttribute("width", maxX + 600);
    edgesSvg.setAttribute("height", maxY + 600);

    // Initial render
    setTimeout(() => {
        renderEdges();
        updateTransform();
    }, 10);
}

function renderEdges() {
    // Clear old paths, keep defs
    Array.from(edgesSvg.querySelectorAll("path")).forEach(p => p.remove());

    EDGES.forEach(edge => {
            const srcEl = nodeEls[edge.src];
            const dstEl = nodeEls[edge.dst];
            if (!srcEl || !dstEl) return;

            const w = srcEl.clientWidth;
            const h = srcEl.clientHeight;
            
            // source center bottom
            const x1 = parseInt(srcEl.style.left) + (w / 2);
            const y1 = parseInt(srcEl.style.top) + h + 2; 

            // dst center top
            const x2 = parseInt(dstEl.style.left) + (dstEl.clientWidth / 2);
            const y2 = parseInt(dstEl.style.top) - 2;

            drawEdge(x1, y1, x2, y2, edge);
        });
}

function drawEdge(x1, y1, x2, y2, edge) {
    // Basic elbow path
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    
    const dy = Math.abs(y2 - y1);
    const midY = y1 + (dy / 2);
    
    // M x1 y1  C x1 midY, x2 midY, x2 y2
    const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#888");
    path.setAttribute("stroke-width", "2");
    
    if (edge.dashed) {
        path.setAttribute("stroke-dasharray", "4 4");
    }

    // Add marker
    path.setAttribute("marker-end", "url(#arrowhead)");
    edgesSvg.appendChild(path);

    // Invisible wide path for easier hovering
    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", d);
    hitPath.setAttribute("fill", "none");
    hitPath.setAttribute("stroke", "transparent");
    hitPath.setAttribute("stroke-width", "12");
    hitPath.style.pointerEvents = "stroke";
    hitPath.style.cursor = "pointer";

    hitPath.addEventListener("mouseenter", () => {
        path.setAttribute("stroke", "#FF5F00");
        path.setAttribute("stroke-width", "3");
        if (nodeEls[edge.src]) nodeEls[edge.src].classList.add("docs-node--highlighted");
        if (nodeEls[edge.dst]) nodeEls[edge.dst].classList.add("docs-node--highlighted");
    });
    
    hitPath.addEventListener("mouseleave", () => {
        path.setAttribute("stroke", "#888");
        path.setAttribute("stroke-width", "2");
        if (nodeEls[edge.src]) nodeEls[edge.src].classList.remove("docs-node--highlighted");
        if (nodeEls[edge.dst]) nodeEls[edge.dst].classList.remove("docs-node--highlighted");
    });

    edgesSvg.appendChild(hitPath);
}

// Draw arrowhead def
function initDefs() {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto-start-reverse");
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
    polygon.setAttribute("fill", "#888");
    marker.appendChild(polygon);
    defs.appendChild(marker);
    edgesSvg.appendChild(defs);
}

function selectNode(id) {
    selectedNodeId = id;
    
    // Highlight
    for (const nId in nodeEls) {
        nodeEls[nId].classList.toggle("docs-node--selected", nId === id);
    }

    const node = NODES.find(n => n.id === id);
    if (!node) return;

    detailContent.innerHTML = `
        <div class="docs-detail-title" style="border-left: 4px solid ${LAYER_COLORS[node.layer] || '#000'}">
            ${escHtml(node.id)}
        </div>
        <div class="docs-detail-meta">Layer: ${escHtml(node.layer.toUpperCase())}</div>
        <div class="docs-detail-desc">${escHtml(node.desc)}</div>
    `;
}

// ── Pan and Zoom ──────────────────────────────────────────────────────────
function updateTransform() {
    graphWrap.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

const viewport = document.getElementById("docs-viewport");

viewport.addEventListener("wheel", (e) => {
    // Only zoom if Ctrl is pressed or viewport is hovered
    if (!e.ctrlKey && !e.metaKey) return;
    
    e.preventDefault();
    const zoomPointX = e.offsetX;
    const zoomPointY = e.offsetY;

    // Local coordinates of the cursor before scale
    const lx = (zoomPointX - panX) / zoomLevel;
    const ly = (zoomPointY - panY) / zoomLevel;

    // Apply zoom
    const zoomDir = e.deltaY > 0 ? -1 : 1;
    let newScale = zoomLevel + (zoomDir * 0.1 * zoomLevel);
    newScale = Math.max(0.2, Math.min(newScale, 3.0)); // restrict

    // Adjust pan to zoom into mouse cursor
    panX = zoomPointX - (lx * newScale);
    panY = zoomPointY - (ly * newScale);
    zoomLevel = newScale;

    updateTransform();
}, { passive: false });

viewport.addEventListener("mousedown", (e) => {
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
    viewport.style.cursor = "grabbing";
});

let isDocsActive = false;
DevToolsEvents.on('tab:activated', (tab) => { if (tab === 'docs') isDocsActive = true; });
DevToolsEvents.on('tab:deactivated', (tab) => { if (tab === 'docs') isDocsActive = false; });

window.addEventListener("mousemove", (e) => {
    if (!isDocsActive) return;
    if (draggingNodeId) {
        const dx = (e.clientX - nodeStartX) / zoomLevel;
        const dy = (e.clientY - nodeStartY) / zoomLevel;
        nodeStartX = e.clientX;
        nodeStartY = e.clientY;
        
        const node = NODES.find(n => n.id === draggingNodeId);
        if (node) {
            node.x += dx;
            node.y += dy;
            nodeEls[node.id].style.left = `${node.x}px`;
            nodeEls[node.id].style.top = `${node.y}px`;
            renderEdges();
        }
        return;
    }

    if (!isPanning) return;
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    updateTransform();
});

window.addEventListener("mouseup", () => {
    if (!isDocsActive) return;
    if (draggingNodeId) {
        const el = nodeEls[draggingNodeId];
        if (el) el.style.zIndex = "";
        draggingNodeId = null;
    }
    if (isPanning) {
        isPanning = false;
        viewport.style.cursor = "grab";
    }
});

// Deselect on bg click
viewport.addEventListener("click", () => {
    selectedNodeId = null;
    for (const nId in nodeEls) {
        nodeEls[nId].classList.remove("docs-node--selected");
    }
    detailContent.innerHTML = `<div class="docs-empty-hint">Click a class node to see its description</div>`;
});

const btnZoomIn = document.getElementById("btn-docs-zoom-in");
const btnZoomOut = document.getElementById("btn-docs-zoom-out");

btnReset.addEventListener("click", () => {
    zoomLevel = 1.0;
    panX = 50;
    panY = 50;
    updateTransform();
});

function applyZoom(delta) {
    // Zoom around center of viewport
    const viewportRect = viewport.getBoundingClientRect();
    const zoomPointX = viewportRect.width / 2;
    const zoomPointY = viewportRect.height / 2;

    const lx = (zoomPointX - panX) / zoomLevel;
    const ly = (zoomPointY - panY) / zoomLevel;

    let newScale = zoomLevel + delta;
    newScale = Math.max(0.2, Math.min(newScale, 3.0));

    panX = zoomPointX - (lx * newScale);
    panY = zoomPointY - (ly * newScale);
    zoomLevel = newScale;

    updateTransform();
}

btnZoomIn.addEventListener("click", () => applyZoom(0.2));
btnZoomOut.addEventListener("click", () => applyZoom(-0.2));

// Initialize on first load
// (Defs are now called in initGraph)
initGraph();

// ── Wiki Subsystem ────────────────────────────────────────────────────────
const docsWikiList = document.getElementById("docs-wiki-list");
const docsWikiContent = document.getElementById("docs-wiki-content");
const docsWikiToc = document.getElementById("docs-wiki-toc");
const docsControls = document.getElementById("docs-controls");

const docsSubTabs = document.querySelectorAll("#docs-sub-tabs .docs-sub-btn");
const docsSubViews = document.querySelectorAll(".docs-subview");

let wikiIndex = [];
let currentWikiFile = null;

docsSubTabs.forEach(btn => {
    btn.addEventListener("click", () => {
        docsSubTabs.forEach(b => b.classList.remove("active"));
        
        const tab = btn.dataset.docsTab;
        if (tab === "wiki") {
            btn.classList.add("active");
            document.getElementById("docs-wiki-view").style.display = "flex";
            document.getElementById("docs-graph-view").style.display = "none";
            document.getElementById("docs-zoom-controls").style.display = "none";
        } else {
            btn.classList.add("active");
            document.getElementById("docs-wiki-view").style.display = "none";
            document.getElementById("docs-graph-view").style.display = "flex";
            document.getElementById("docs-zoom-controls").style.display = "flex";
        }
    });
});

async function loadWikiIndex() {
    try {
        const res = await fetch("/docs/index.json");
        if (!res.ok) throw new Error("Index not found");
        wikiIndex = await res.json();
        renderWikiSidebar();
        if (wikiIndex.length > 0) {
            loadWikiPage(wikiIndex[0].file);
        }
    } catch (err) {
        docsWikiList.innerHTML = `<div class="crt-empty-hint">Failed to load index.json</div>`;
    }
}

function renderWikiSidebar() {
    docsWikiList.innerHTML = "";
    wikiIndex.forEach(item => {
        const el = document.createElement("div");
        el.className = "docs-wiki-item";
        el.textContent = item.title;
        el.dataset.file = item.file;
        el.addEventListener("click", () => loadWikiPage(item.file));
        docsWikiList.appendChild(el);
    });
}

async function loadWikiPage(filename) {
    currentWikiFile = filename;
    
    // Update active state in sidebar
    Array.from(docsWikiList.children).forEach(el => {
        el.classList.toggle("docs-wiki-item--active", el.dataset.file === filename);
    });

    try {
        const res = await fetch(`/docs/${filename}`);
        if (!res.ok) throw new Error(`Could not load ${filename}`);
        const text = await res.text();
        
        docsWikiContent.innerHTML = marked.parse(text);
        generateWikiTOC();
        interceptWikiLinks();
    } catch (err) {
        docsWikiContent.innerHTML = `<div class="crt-empty-hint">Error: ${err.message}</div>`;
        docsWikiToc.innerHTML = "";
    }
}

function generateWikiTOC() {
    docsWikiToc.innerHTML = "";
    const headers = docsWikiContent.querySelectorAll("h1, h2, h3");
    
    if (headers.length === 0) {
        docsWikiToc.innerHTML = `<div class="crt-empty-hint">No headings</div>`;
        return;
    }

    headers.forEach((h, i) => {
        if (!h.id) h.id = `wiki-h-${i}`;
        
        const link = document.createElement("a");
        link.className = `docs-toc-item docs-toc-${h.tagName.toLowerCase()}`;
        link.href = `#${h.id}`;
        link.textContent = h.textContent;
        link.addEventListener("click", (e) => {
            e.preventDefault();
            h.scrollIntoView({ behavior: "smooth" });
        });
        docsWikiToc.appendChild(link);
    });
}

function interceptWikiLinks() {
    const links = docsWikiContent.querySelectorAll("a");
    links.forEach(a => {
        const href = a.getAttribute("href");
        if (href && href.endsWith(".md")) {
            a.addEventListener("click", (e) => {
                e.preventDefault();
                // Strip leading ./ or / if present
                let target = href;
                if (target.startsWith("./")) target = target.substring(2);
                if (target.startsWith("/")) target = target.substring(1);
                loadWikiPage(target);
            });
        }
    });
}

// Initial hide of docs zoom controls since Wiki is the default tab
docsControls.hidden = true;

// Kick off wiki load
loadWikiIndex();

})();
