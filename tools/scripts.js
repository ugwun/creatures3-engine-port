// scripts.js — Creatures 3 Developer Tools — Scripts Tab
// Polls /api/scripts and renders the running scripts table.
"use strict";

(() => {
    const tbody = document.getElementById("scripts-tbody");
    const emptyDiv = document.getElementById("scripts-empty");
    const table = document.getElementById("scripts-table");
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
        tbody.innerHTML = "";

        if (scripts.length === 0) {
            table.hidden = true;
            emptyDiv.hidden = false;
            return;
        }

        table.hidden = false;
        emptyDiv.hidden = true;

        for (const s of scripts) {
            const tr = document.createElement("tr");
            tr.className = "script-row";

            const classifier = `${s.family} ${s.genus} ${s.species} ${s.event}`;
            const stateClass = s.state === "blocking" ? "state-blocking" : "state-running";

            tr.innerHTML =
                `<td class="col-id">${s.agentId}</td>` +
                `<td class="col-classifier"><code>${escHtml(classifier)}</code></td>` +
                `<td class="col-state"><span class="state-badge ${stateClass}">${s.state}</span></td>` +
                `<td class="col-ip">${s.ip}</td>` +
                `<td class="col-source"><code>${escHtml(s.source || "—")}</code></td>`;

            tbody.appendChild(tr);
        }
    }

    function escHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

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
            if (optAuto.checked) startAutoRefresh();
            else stopAutoRefresh();
        });
    }

    // Start auto-refresh by default
    startAutoRefresh();

    // Also do an immediate refresh
    refreshScripts();
})();
