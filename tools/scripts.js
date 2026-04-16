// scripts.js — Creatures 3 Developer Tools — Scripts Tab
// Polls /api/scripts and renders the running scripts table.
"use strict";

(() => {
    const tbody = document.getElementById("scripts-tbody");
    const emptyDiv = document.getElementById("scripts-empty");
    const table = document.getElementById("scripts-table");
    const container = document.getElementById("scripts-container");
    const btnRefresh = document.getElementById("btn-scripts-refresh");
    const optAuto = document.getElementById("opt-auto-refresh");

    if (!tbody || !table) return;

    let autoTimer = null;
    const POLL_INTERVAL = 2000; // ms

    // ── Fetch and render ──────────────────────────────────────────────────
    async function refreshScripts() {
        try {
            const resp = await fetch("/api/scripts");
            const scripts = await resp.json();
            renderScripts(scripts);
        } catch (e) {
            // Server not reachable — show empty state
            renderScripts([]);
        }
    }

    function renderScripts(scripts) {
        // Remember scroll position to preserve user's place
        const wasAtTop = container ? container.scrollTop < 10 : true;

        tbody.innerHTML = "";

        if (scripts.length === 0) {
            table.hidden = true;
            emptyDiv.hidden = false;
            return;
        }

        table.hidden = false;
        emptyDiv.hidden = true;

        for (const s of scripts) {
            const evtName = window.CAOS_EVENT_NAMES && window.CAOS_EVENT_NAMES[s.event] 
                ? ` (${window.CAOS_EVENT_NAMES[s.event]})` : "";
            const classifier = `${s.family} ${s.genus} ${s.species} ${s.event}${evtName}`;
            
            let stateClass = "state-running";
            if (s.state === "blocking") stateClass = "state-blocking";
            else if (s.state === "paused") stateClass = "state-paused";

            const sourceRaw = s.source || "—";
            const sourceFormatted = (typeof formatCAOS === "function" && sourceRaw !== "—")
                ? formatCAOS(sourceRaw) : sourceRaw;

            const tr = el("tr", { className: "script-row" }, [
                el("td", { className: "col-id", textContent: s.agentId }),
                el("td", { className: "col-classifier" }, el("code", { textContent: classifier })),
                el("td", { className: "col-state" }, el("span", { className: `state-badge ${stateClass}`, textContent: s.state })),
                el("td", { className: "col-ip", textContent: s.ip }),
                el("td", { className: "col-source" }, el("pre", { className: "caos-source", textContent: sourceFormatted }))
            ]);

            tbody.appendChild(tr);
        }

        // Autoscroll: if user was near the top, stay at top
        if (wasAtTop && container) {
            container.scrollTop = 0;
        }
    }

    // escHtml is provided by utils.js

    // ── Controls ──────────────────────────────────────────────────────────
    if (btnRefresh) {
        btnRefresh.addEventListener("click", refreshScripts);
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        autoTimer = setInterval(refreshScripts, POLL_INTERVAL);
    }

    function stopAutoRefresh() {
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
    }

    if (optAuto) {
        optAuto.addEventListener("change", () => {
            if (optAuto.checked && isScriptsTabActive) startAutoRefresh();
            else stopAutoRefresh();
        });
    }

    // ── Tab lifecycle: only poll when Scripts tab is active ───────────────
    let isScriptsTabActive = false;

    DevToolsEvents.on('tab:activated', (tab) => {
        if (tab === 'scripts') {
            isScriptsTabActive = true;
            refreshScripts();
            if (optAuto && optAuto.checked) startAutoRefresh();
        }
    });

    DevToolsEvents.on('tab:deactivated', (tab) => {
        if (tab === 'scripts') {
            isScriptsTabActive = false;
            stopAutoRefresh();
        }
    });

    // Don't poll on load — wait for tab activation
})();
