// debugger_view.js — Creatures 3 Developer Tools — Debugger Tab
// Source view with breakpoints, stepping, and variable inspection.
"use strict";

(() => {
    // ── DOM refs ──────────────────────────────────────────────────────────
    const agentSelect = document.getElementById("dbg-agent-select");
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

    if (!agentSelect || !sourceLines) return;

    let currentAgentId = null;
    let currentSource = "";
    let currentBreakpoints = new Set();
    let currentSourcePos = -1;
    let sourceLineOffsets = []; // character offset for start of each line
    let pollTimer = null;
    const POLL_INTERVAL = 1000;

    // ── Agent list polling ────────────────────────────────────────────────
    async function refreshAgentList() {
        try {
            const resp = await fetch("/api/scripts");
            const scripts = await resp.json();
            updateAgentSelect(scripts);
        } catch (e) {
            // Server not reachable
        }
    }

    function updateAgentSelect(scripts) {
        const prevVal = agentSelect.value;
        // Keep "Select agent…" option and re-populate
        while (agentSelect.options.length > 1) agentSelect.remove(1);

        for (const s of scripts) {
            const opt = document.createElement("option");
            opt.value = s.agentId;
            const stateTag = s.state === "paused" ? " ⏸" : "";
            opt.textContent = `#${s.agentId} — ${s.family} ${s.genus} ${s.species} ${s.event} [${s.state}]${stateTag}`;
            agentSelect.appendChild(opt);
        }

        // Restore previous selection if still available
        if (prevVal) {
            agentSelect.value = prevVal;
            if (agentSelect.value !== prevVal) {
                // Agent no longer available
                currentAgentId = null;
                clearSourceView();
            }
        }
    }

    // ── Agent selection ───────────────────────────────────────────────────
    agentSelect.addEventListener("change", () => {
        const id = agentSelect.value;
        if (!id) {
            currentAgentId = null;
            clearSourceView();
            return;
        }
        currentAgentId = parseInt(id, 10);
        fetchAgentState();
    });

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
            scriptInfo.textContent = `Script ${data.scriptFamily} ${data.scriptGenus} ${data.scriptSpecies} ${data.scriptEvent} — Agent #${data.id}`;
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

        // Breakpoints
        currentBreakpoints = new Set(data.breakpoints || []);

        // Source code
        if (data.source && data.source !== currentSource) {
            currentSource = data.source;
            buildSourceView(data.source);
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
    }

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
            code.textContent = line || " ";

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
            row.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }

    function updateBreakpointMarkers() {
        const markers = sourceLines.querySelectorAll(".dbg-bp-marker");
        markers.forEach(m => {
            m.classList.remove("dbg-bp-active");
        });

        // We need to map IP-based breakpoints to line numbers
        // For now, mark all lines that have a breakpoint IP within their offset range
        for (const bp of currentBreakpoints) {
            // Find the line this BP maps to by finding the source position
            // Since we only have bytecode IPs and the source is mapped via DebugInfo,
            // we'll need to get the source pos from the server. For now, we mark based
            // on the IP value as a reference.

            // The breakpoint list in the sidebar will show the raw IPs
        }
    }

    function updateBreakpointList() {
        bpList.innerHTML = "";
        if (currentBreakpoints.size === 0) {
            bpList.innerHTML = '<span class="dbg-empty-hint">Click a line number to set a breakpoint</span>';
            return;
        }

        for (const bp of currentBreakpoints) {
            const item = document.createElement("div");
            item.className = "dbg-bp-item";
            item.innerHTML = `<span class="dbg-bp-dot"></span> IP ${bp} <button class="dbg-bp-remove" data-ip="${bp}">×</button>`;
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
        btnContinue.disabled = true;
        btnStep.disabled = true;
        btnStepOver.disabled = true;
    }

    // ── Breakpoint toggling ──────────────────────────────────────────────
    async function toggleBreakpointAtLine(lineIdx) {
        if (!currentAgentId) return;

        // We need to compute the bytecode IP for this source line.
        // The DebugInfo maps bytecode → source, but we need source → bytecode.
        // We'll use the source character offset of this line as an approximation
        // and let the server figure out the nearest bytecode IP.
        // For now, use the line's character offset as the IP to set.
        // TODO: Add a proper source-to-IP mapping endpoint

        const charOffset = sourceLineOffsets[lineIdx] || 0;

        // Check if there's already a breakpoint near this line
        // For now, toggle based on char offset as a proxy
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

    // Start polling and initial fetch
    startPolling();
    refreshAgentList();
})();
