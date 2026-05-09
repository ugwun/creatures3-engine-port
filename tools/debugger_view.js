// debugger_view.js — Creatures 3 Developer Tools — Debugger Tab
// Agent list panel with classifier grouping + source view + breakpoints + stepping.
"use strict";

(() => {
    // ── DOM refs ──────────────────────────────────────────────────────────
    const agentListEl = document.getElementById("dbg-agent-list");
    const agentEmptyEl = document.getElementById("dbg-agent-empty");
    const searchInput = document.getElementById("dbg-agent-search");
    const btnFocus = document.getElementById("btn-dbg-focus");
    const btnContinue = document.getElementById("btn-dbg-continue");
    const btnStep = document.getElementById("btn-dbg-step");
    const btnStepOver = document.getElementById("btn-dbg-stepover");
    const sourceLines = document.getElementById("dbg-source-lines");
    const scriptInfo = document.getElementById("dbg-script-info");
    const stateBadge = document.getElementById("dbg-state-badge");
    const ctxOwnr = document.getElementById("dbg-ctx-ownr");
    const ctxTarg = document.getElementById("dbg-ctx-targ");
    const ctxFrom = document.getElementById("dbg-ctx-from");
    const ctxIt = document.getElementById("dbg-ctx-it");
    const ctxIp = document.getElementById("dbg-ctx-ip");
    const bpList = document.getElementById("dbg-breakpoint-list");

    if (!agentListEl || !sourceLines) return;

    // ── State ─────────────────────────────────────────────────────────────
    let currentAgentId = null;
    let currentSource = "";
    let currentBreakpoints = new Set();
    let currentSourcePos = -1;
    let sourceLineOffsets = [];
    let pollTimer = null;
    const POLL_INTERVAL = 1000;
    const STALE_TIMEOUT = 5000;
    let agentPos = null; // { x, y } of currently selected agent
    let searchTerm = "";

    // Agent data model: Map<agentId, AgentInfo>
    // AgentInfo = { id, family, genus, species, event, state, lastSeen }
    const agentMap = new Map();

    // DOM element cache: Map<agentId, HTMLElement>
    const agentItemElements = new Map();
    // Group element cache: Map<classifierKey, HTMLElement>
    const groupElements = new Map();

    // ── Agent list polling ────────────────────────────────────────────────
    async function refreshAgentList() {
        try {
            const resp = await fetch("/api/scripts");
            const scripts = await resp.json();
            mergeAgentData(scripts);
            renderAgentList();
        } catch (e) {
            // Server not reachable
        }
    }

    function mergeAgentData(scripts) {
        const now = Date.now();
        const seenIds = new Set();

        for (const s of scripts) {
            seenIds.add(s.agentId);
            const existing = agentMap.get(s.agentId);
            if (existing) {
                existing.state = s.state;
                existing.event = s.event;
                existing.gallery = s.gallery || existing.gallery;
                existing.lastSeen = now;
                existing.stale = false;
            } else {
                agentMap.set(s.agentId, {
                    id: s.agentId,
                    family: s.family,
                    genus: s.genus,
                    species: s.species,
                    event: s.event,
                    gallery: s.gallery || "",
                    agentFamily: s.agentFamily || 0,
                    state: s.state,
                    lastSeen: now,
                    stale: false,
                });
            }
        }

        // Mark unseen agents as stale, remove those past timeout
        for (const [id, info] of agentMap) {
            if (!seenIds.has(id)) {
                if (!info.stale) {
                    info.stale = true;
                    info.state = "finished";
                    info.lastSeen = info.lastSeen; // keep original
                }
                if (now - info.lastSeen > STALE_TIMEOUT) {
                    agentMap.delete(id);
                    const el = agentItemElements.get(id);
                    if (el) { el.remove(); agentItemElements.delete(id); }
                }
            }
        }
    }

    // ── Group + render ────────────────────────────────────────────────────
    function classifierKey(info) {
        return `${info.family} ${info.genus} ${info.species}`;
    }

    function renderAgentList() {
        // Group agents by classifier
        const groups = new Map(); // classifierKey -> [AgentInfo]
        for (const info of agentMap.values()) {
            const key = classifierKey(info);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(info);
        }

        // Sort groups: creature groups (family 4) first, then alphabetically
        const sortedKeys = [...groups.keys()].sort((a, b) => {
            const aCreature = groups.get(a).some(ag => ag.agentFamily === 4);
            const bCreature = groups.get(b).some(ag => ag.agentFamily === 4);
            if (aCreature !== bCreature) return aCreature ? -1 : 1;
            return a.localeCompare(b);
        });
        for (const key of sortedKeys) {
            groups.get(key).sort((a, b) => a.id - b.id);
        }

        // Show/hide empty state
        const hasAgents = agentMap.size > 0;
        agentEmptyEl.hidden = hasAgents;

        // Remove groups that no longer have agents
        for (const [key, groupEl] of groupElements) {
            if (!groups.has(key)) {
                groupEl.remove();
                groupElements.delete(key);
            }
        }

        // Create/update groups
        for (const key of sortedKeys) {
            const agents = groups.get(key);
            let groupEl = groupElements.get(key);

            if (!groupEl) {
                groupEl = document.createElement("div");
                groupEl.className = "dbg-group";
                groupEl.dataset.key = key;

                const header = el("div", { className: "dbg-group-header" }, [
                    el("span", { className: "dbg-group-classifier", textContent: key }),
                    el("span", { className: "dbg-group-count" })
                ]);
                groupEl.appendChild(header);

                // Insert in sorted order
                insertGroupSorted(groupEl, key);
                groupElements.set(key, groupEl);
            }

            // Update count
            const countEl = groupEl.querySelector(".dbg-group-count");
            const activeCount = agents.filter(a => !a.stale).length;
            countEl.textContent = `${activeCount}`;

            // Create/update agent items within group
            let visibleCount = 0;
            for (const info of agents) {
                let itemEl = agentItemElements.get(info.id);

                if (!itemEl) {
                    itemEl = createAgentItem(info);
                    agentItemElements.set(info.id, itemEl);
                    insertAgentItemSorted(groupEl, itemEl, info.id);
                } else {
                    updateAgentItem(itemEl, info);
                    // Ensure it's in the right group
                    if (itemEl.parentElement !== groupEl) {
                        insertAgentItemSorted(groupEl, itemEl, info.id);
                    }
                }

                // Search filter
                const matchesSearch = !searchTerm ||
                    String(info.id).includes(searchTerm) ||
                    (info.gallery && info.gallery.toLowerCase().includes(searchTerm)) ||
                    key.includes(searchTerm);
                itemEl.hidden = !matchesSearch;
                if (matchesSearch) visibleCount++;
            }

            // Hide entire group if no visible agents
            groupEl.hidden = (visibleCount === 0 && !!searchTerm);
        }

        // Remove orphaned agent elements
        for (const [id, el] of agentItemElements) {
            if (!agentMap.has(id)) {
                el.remove();
                agentItemElements.delete(id);
            }
        }
    }

    function insertGroupSorted(groupEl, key) {
        // Insert the group element in alphabetical order among existing groups
        const existingGroups = agentListEl.querySelectorAll(".dbg-group");
        let insertBefore = null;
        for (const g of existingGroups) {
            if (g.dataset.key > key) {
                insertBefore = g;
                break;
            }
        }
        if (insertBefore) {
            agentListEl.insertBefore(groupEl, insertBefore);
        } else {
            agentListEl.appendChild(groupEl);
        }
    }

    function insertAgentItemSorted(groupEl, itemEl, agentId) {
        const existingItems = groupEl.querySelectorAll(".dbg-agent-item");
        let insertBefore = null;
        for (const item of existingItems) {
            if (parseInt(item.dataset.agentId, 10) > agentId) {
                insertBefore = item;
                break;
            }
        }
        if (insertBefore) {
            groupEl.insertBefore(itemEl, insertBefore);
        } else {
            groupEl.appendChild(itemEl);
        }
    }

    function createAgentItem(info) {
        const galleryLabel = info.gallery ? ` ${info.gallery}` : "";
        const itemEl = el("div", { className: "dbg-agent-item", dataset: { agentId: info.id } }, [
            el("span", { className: "dbg-state-dot" }),
            el("span", { className: "dbg-agent-id", textContent: `#${info.id}` }),
            el("span", { className: "dbg-agent-gallery", textContent: galleryLabel }),
            el("span", { className: "dbg-agent-event", textContent: `evt ${info.event}` })
        ]);

        itemEl.addEventListener("click", () => {
            currentAgentId = info.id;
            // Update selection visual
            agentListEl.querySelectorAll(".dbg-agent-item--selected").forEach(
                s => s.classList.remove("dbg-agent-item--selected")
            );
            itemEl.classList.add("dbg-agent-item--selected");
            fetchAgentState();
        });

        updateAgentItem(itemEl, info);
        return itemEl;
    }

    function updateAgentItem(el, info) {
        // State dot
        const dot = el.querySelector(".dbg-state-dot");
        dot.className = "dbg-state-dot";
        if (info.state === "running") dot.classList.add("dbg-state-dot--running");
        else if (info.state === "blocking") dot.classList.add("dbg-state-dot--blocking");
        else if (info.state === "paused") dot.classList.add("dbg-state-dot--paused");
        else dot.classList.add("dbg-state-dot--finished");

        // Stale visual
        el.classList.toggle("dbg-agent-item--stale", !!info.stale);

        // Selected visual
        el.classList.toggle("dbg-agent-item--selected", info.id === currentAgentId);

        // Gallery label
        const galEl = el.querySelector(".dbg-agent-gallery");
        if (galEl && info.gallery) galEl.textContent = info.gallery;

        // Event label
        const evtEl = el.querySelector(".dbg-agent-event");
        const evtName = window.CAOS_EVENT_NAMES && window.CAOS_EVENT_NAMES[info.event] 
            ? ` (${window.CAOS_EVENT_NAMES[info.event]})` : "";
        evtEl.textContent = `evt ${info.event}${evtName}`;

        // State tag for blocking/paused
        let tagEl = el.querySelector(".dbg-agent-state-tag");
        if (info.state === "blocking" || info.state === "paused") {
            if (!tagEl) {
                tagEl = document.createElement("span");
                tagEl.className = "dbg-agent-state-tag";
                el.appendChild(tagEl);
            }
            tagEl.className = "dbg-agent-state-tag";
            if (info.state === "blocking") {
                tagEl.classList.add("dbg-agent-state-tag--blocking");
                tagEl.textContent = "WAIT";
            } else {
                tagEl.classList.add("dbg-agent-state-tag--paused");
                tagEl.textContent = "⏸";
            }
        } else if (tagEl) {
            tagEl.remove();
        }
    }

    // ── Fetch full agent state ────────────────────────────────────────────
    async function fetchAgentState() {
        if (!currentAgentId) return;

        try {
            const resp = await fetch(`/api/agent/${currentAgentId}`);
            const data = await resp.json();

            if (data.error) {
                scriptInfo.textContent = `Error: ${data.error}`;
                return;
            }

            renderAgentState(data);
        } catch (e) {
            scriptInfo.textContent = `Network error: ${e.message}`;
        }
    }

    // ── Render agent state ────────────────────────────────────────────────
    function renderAgentState(data) {
        // Script info
        if (data.scriptFamily !== undefined) {
            const evtName = window.CAOS_EVENT_NAMES && window.CAOS_EVENT_NAMES[data.scriptEvent] 
                ? ` (${window.CAOS_EVENT_NAMES[data.scriptEvent]})` : "";
            scriptInfo.textContent = `Script ${data.scriptFamily} ${data.scriptGenus} ${data.scriptSpecies} ${data.scriptEvent}${evtName} — Agent #${data.id}`;
        } else {
            scriptInfo.textContent = `Agent #${data.id} — no script`;
        }

        // State badge
        const isPaused = data.paused;
        const isBlocking = data.blocking;
        const isRunning = data.running;
        if (isPaused) {
            stateBadge.textContent = "PAUSED";
            stateBadge.className = "state-badge state-paused";
        } else if (isBlocking) {
            stateBadge.textContent = "BLOCKING";
            stateBadge.className = "state-badge state-blocking";
        } else if (isRunning) {
            stateBadge.textContent = "RUNNING";
            stateBadge.className = "state-badge state-running";
        } else {
            stateBadge.textContent = "FINISHED";
            stateBadge.className = "state-badge state-finished";
        }

        // Context
        ctxOwnr.textContent = data.ownr || "—";
        ctxTarg.textContent = data.targ || "—";
        ctxFrom.textContent = data.from || "—";
        ctxIt.textContent = data.it || "—";
        ctxIp.textContent = data.ip !== undefined ? data.ip : "—";

        // Store position for Focus button
        agentPos = (data.posx !== undefined) ? { x: data.posx, y: data.posy } : null;
        btnFocus.disabled = !agentPos;

        // Breakpoints
        currentBreakpoints = new Set(data.breakpoints || []);

        // Source code
        if (data.source && data.source !== currentSource) {
            currentSource = data.source;
            const formatted = (typeof formatCAOS === "function")
                ? formatCAOS(data.source) : data.source;
            buildSourceView(formatted);
        }

        // Highlight current position
        currentSourcePos = data.sourcePos !== undefined ? data.sourcePos : -1;
        highlightCurrentLine();
        updateBreakpointMarkers();
        updateBreakpointList();

        // Enable/disable buttons
        btnContinue.disabled = !isPaused;
        btnStep.disabled = !isPaused;
        btnStepOver.disabled = !isPaused;

        // OV/VA Variables
        renderVarGrid("dbg-ov-vars", data.ov, "ov", "No non-zero OV variables");
        renderVarGrid("dbg-va-vars", data.va, "va", "No non-zero VA variables");
    }

    function renderVarGrid(containerId, vars, prefix, emptyText) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const entries = vars ? Object.entries(vars) : [];
        if (entries.length === 0) {
            el.innerHTML = `<span class="dbg-empty-hint">${emptyText}</span>`;
            return;
        }

        // Sort by numeric key
        entries.sort((a, b) => Number(a[0]) - Number(b[0]));

        let html = "";
        for (const [idx, val] of entries) {
            const name = `${prefix}${String(idx).padStart(2, "0")}`;
            html += `<span class="dbg-var-key">${name}</span>`;
            html += `<span class="dbg-var-val">${typeof val === "string" ? `"${val}"` : val}</span>`;
        }
        el.innerHTML = html;
    }

    // ── Focus camera ─────────────────────────────────────────────────────
    btnFocus.addEventListener("click", async () => {
        if (!agentPos) return;
        try {
            await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos: `cmrp ${agentPos.x} ${agentPos.y} 0` })
            });
        } catch (e) {
            console.error("Focus error:", e);
        }
    });



    // ── Source view rendering ─────────────────────────────────────────────
    function buildSourceView(src) {
        sourceLines.innerHTML = "";
        sourceLineOffsets = [];

        const lines = src.split("\n");
        let offset = 0;
        lines.forEach((line, idx) => {
            sourceLineOffsets.push(offset);

            const row = document.createElement("div");
            row.className = "dbg-line";
            row.dataset.lineIdx = idx;

            const gutter = document.createElement("span");
            gutter.className = "dbg-gutter";
            gutter.textContent = String(idx + 1);
            gutter.addEventListener("click", () => toggleBreakpointAtLine(idx));

            const bp = document.createElement("span");
            bp.className = "dbg-bp-marker";
            bp.dataset.lineIdx = idx;

            const code = document.createElement("span");
            code.className = "dbg-code";
            code.innerHTML = (typeof window.highlightCAOS === "function") 
                ? window.highlightCAOS(line) : escHtml(line);

            row.appendChild(bp);
            row.appendChild(gutter);
            row.appendChild(code);
            sourceLines.appendChild(row);

            offset += line.length + 1; // +1 for \n
        });
    }

    function highlightCurrentLine() {
        // Remove old highlight
        const old = sourceLines.querySelector(".dbg-line--current");
        if (old) old.classList.remove("dbg-line--current");

        if (currentSourcePos < 0) return;

        // Find which line contains sourcePos
        let lineIdx = 0;
        for (let i = 0; i < sourceLineOffsets.length; i++) {
            if (sourceLineOffsets[i] <= currentSourcePos) {
                lineIdx = i;
            } else {
                break;
            }
        }

        const row = sourceLines.querySelector(`[data-line-idx="${lineIdx}"]`);
        if (row) {
            row.classList.add("dbg-line--current");
            const followCheck = document.getElementById("opt-dbg-follow");
            if (!followCheck || followCheck.checked) {
                row.scrollIntoView({ block: "center", behavior: "smooth" });
            }
        }
    }

    function updateBreakpointMarkers() {
        const markers = sourceLines.querySelectorAll(".dbg-bp-marker");
        markers.forEach(m => {
            m.classList.remove("dbg-bp-active");
        });

        for (const bp of currentBreakpoints) {
            // Map breakpoint IP (character offset) to source line index
            let lineIdx = 0;
            for (let i = 0; i < sourceLineOffsets.length; i++) {
                if (sourceLineOffsets[i] <= bp) {
                    lineIdx = i;
                } else {
                    break;
                }
            }
            const marker = sourceLines.querySelector(`.dbg-bp-marker[data-line-idx="${lineIdx}"]`);
            if (marker) marker.classList.add("dbg-bp-active");
        }
    }

    function updateBreakpointList() {
        bpList.innerHTML = "";
        if (currentBreakpoints.size === 0) {
            bpList.innerHTML = '<span class="dbg-empty-hint">Click a line number to set a breakpoint</span>';
            return;
        }

        for (const bp of currentBreakpoints) {
            const item = el("div", { className: "dbg-bp-item" }, [
                el("span", { className: "dbg-bp-dot" }),
                ` IP ${bp} `,
                el("button", { className: "dbg-bp-remove", dataset: { ip: bp }, textContent: "×" })
            ]);
            bpList.appendChild(item);
        }

        // Remove breakpoint handlers
        bpList.querySelectorAll(".dbg-bp-remove").forEach(btn => {
            btn.addEventListener("click", async () => {
                const ip = parseInt(btn.dataset.ip, 10);
                await sendBreakpointAction("clear", ip);
            });
        });
    }

    function clearSourceView() {
        sourceLines.innerHTML = "";
        scriptInfo.textContent = "No agent selected";
        stateBadge.textContent = "—";
        stateBadge.className = "state-badge";
        ctxOwnr.textContent = "—";
        ctxTarg.textContent = "—";
        ctxFrom.textContent = "—";
        ctxIt.textContent = "—";
        ctxIp.textContent = "—";
        bpList.innerHTML = '<span class="dbg-empty-hint">Click a line number to set a breakpoint</span>';
        currentSource = "";
        currentBreakpoints = new Set();
        currentSourcePos = -1;
        agentPos = null;
        btnFocus.disabled = true;
        btnContinue.disabled = true;
        btnStep.disabled = true;
        btnStepOver.disabled = true;
    }

    // ── Breakpoint toggling ──────────────────────────────────────────────
    async function toggleBreakpointAtLine(lineIdx) {
        if (!currentAgentId) return;

        const charOffset = sourceLineOffsets[lineIdx] || 0;
        const action = currentBreakpoints.has(charOffset) ? "clear" : "set";
        await sendBreakpointAction(action, charOffset);
    }

    async function sendBreakpointAction(action, ip) {
        if (!currentAgentId) return;

        try {
            const resp = await fetch("/api/breakpoint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId: currentAgentId, ip: ip, action: action })
            });
            const data = await resp.json();
            if (data.ok) {
                currentBreakpoints = new Set(data.breakpoints);
                updateBreakpointMarkers();
                updateBreakpointList();
            }
        } catch (e) {
            console.error("Breakpoint error:", e);
        }
    }

    // ── Step / Continue ──────────────────────────────────────────────────
    btnContinue.addEventListener("click", async () => {
        if (!currentAgentId) return;
        try {
            await fetch(`/api/continue/${currentAgentId}`, { method: "POST" });
            // Wait a tick, then refresh
            setTimeout(fetchAgentState, 100);
        } catch (e) {
            console.error("Continue error:", e);
        }
    });

    btnStep.addEventListener("click", async () => {
        if (!currentAgentId) return;
        try {
            const resp = await fetch(`/api/step/${currentAgentId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "into" })
            });
            const data = await resp.json();
            if (data.ok) {
                // Refresh full agent state to update source view
                await fetchAgentState();
            }
        } catch (e) {
            console.error("Step error:", e);
        }
    });

    btnStepOver.addEventListener("click", async () => {
        if (!currentAgentId) return;
        try {
            const resp = await fetch(`/api/step/${currentAgentId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "over" })
            });
            const data = await resp.json();
            if (data.ok) {
                await fetchAgentState();
            }
        } catch (e) {
            console.error("Step over error:", e);
        }
    });

    // ── Search filtering ──────────────────────────────────────────────────
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            searchTerm = searchInput.value.trim().toLowerCase();
            renderAgentList();
        });
    }

    // ── Polling ──────────────────────────────────────────────────────────
    function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => {
            refreshAgentList();
            if (currentAgentId) fetchAgentState();
        }, POLL_INTERVAL);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ── Tab lifecycle: only poll when Debugger tab is active ───────────
    DevToolsEvents.on('tab:activated', (tab) => {
        if (tab === 'debugger') {
            startPolling();
            refreshAgentList();
        }
    });

    DevToolsEvents.on('tab:deactivated', (tab) => {
        if (tab === 'debugger') {
            stopPolling();
        }
    });

    // Don't poll on load — wait for tab activation
})();
