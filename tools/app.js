// app.js — Creatures 3 Developer Tools — Log Tab
// WebSocket client that receives log lines from the embedded DebugServer.
"use strict";

// ── State ─────────────────────────────────────────────────────────────────
let paused = false;
let pauseBuffer = [];
let allMessages = [];         // master log (never cleared by filter)
let totalMessages = 0;
let errorCount = 0;

const MAX_VISIBLE_ROWS = 2000; // keep DOM lean

// ── DOM refs ──────────────────────────────────────────────────────────────
const logInner = document.getElementById("log-inner");
const scrollAnchor = document.getElementById("scroll-anchor");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const searchInput = document.getElementById("search");
const btnPause = document.getElementById("btn-pause");
const btnClear = document.getElementById("btn-clear");
const btnCopy = document.getElementById("btn-copy");
const btnExport = document.getElementById("btn-export");
const pauseOverlay = document.getElementById("pause-overlay");
const pauseBuffered = document.getElementById("pause-buffered");
const optTs = document.getElementById("opt-timestamps");
const optScroll = document.getElementById("opt-autoscroll");
const optCompact = document.getElementById("opt-compact");

// ── Category config ───────────────────────────────────────────────────────
const CATEGORIES = [
    { mask: 1, cls: "cat-error", label: "ERR" },
    { mask: 16, cls: "cat-shutdown", label: "SHUT" },
    { mask: 2, cls: "cat-network", label: "NET" },
    { mask: 4, cls: "cat-world", label: "WRLD" },
    { mask: 8, cls: "cat-caos", label: "CAOS" },
    { mask: 32, cls: "cat-sound", label: "SND" },
    { mask: 64, cls: "cat-crash", label: "CRSH" },
];
function categorize(cat) {
    for (const c of CATEGORIES) if (cat & c.mask) return c;
    return { cls: "cat-other", label: "LOG" };
}

// No longer needed — filter reads checkbox state directly in isCatEnabled().

// ── SSE connection ───────────────────────────────────────────────────────
let evtSource = null;

function connect() {
    setStatus("connecting");
    evtSource = new EventSource("/api/events");

    evtSource.onopen = () => setStatus("connected");

    evtSource.onerror = () => {
        setStatus("disconnected");
        // EventSource automatically reconnects, but we update status
    };

    evtSource.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (_) { return; }
        if (paused) {
            pauseBuffer.push(msg);
            pauseBuffered.textContent = pauseBuffer.length;
        } else {
            appendMessage(msg);
        }
    };
}

function setStatus(state) {
    statusPill.className = `pill pill--${state}`;
    statusText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
}

// ── Rendering ─────────────────────────────────────────────────────────────
function appendMessage(msg) {
    allMessages.push(msg);
    totalMessages++;

    const cat = categorize(msg.cat);
    if (msg.cat & 1) { errorCount++; }

    // Format timestamp as relative seconds with 2 decimal places
    const tSec = (msg.t / 1000).toFixed(2);

    const row = document.createElement("div");
    row.className = `log-row ${msg.cat === 0 ? "cat-banner" : cat.cls}`;
    row.dataset.cat = msg.cat;
    row.dataset.msg = msg.msg.toLowerCase();

    if (msg.cat === 0) {
        // System banner ("── connected ──" etc.)
        row.innerHTML = `<span class="log-msg">${escHtml(msg.msg)}</span>`;
    } else {
        row.innerHTML =
            `<span class="log-ts" style="${optTs.checked ? "" : "display:none"}">${tSec}s</span>` +
            `<span class="log-cat">${cat.label}</span>` +
            `<span class="log-msg">${escHtml(msg.msg)}</span>`;
    }

    // Apply current search filter
    applyRowFilter(row);

    logInner.appendChild(row);

    // Trim DOM to prevent memory blow-up
    while (logInner.children.length > MAX_VISIBLE_ROWS) {
        logInner.removeChild(logInner.firstChild);
    }

    if (optScroll.checked && !paused) {
        scrollAnchor.scrollIntoView({ block: "end" });
    }
}

function applyRowFilter(row) {
    const q = searchInput.value.toLowerCase();
    const catEnabled = isCatEnabled(parseInt(row.dataset.cat, 10));
    const msgMatch = !q || row.dataset.msg.includes(q);
    row.classList.toggle("hidden", !catEnabled || !msgMatch);
}

function isCatEnabled(cat) {
    if (cat === 0) return true; // system banners always visible
    for (const cb of document.querySelectorAll(".cat-toggle input[data-mask]")) {
        if (!cb.checked) continue;
        const raw = cb.dataset.mask;
        const mask = raw.startsWith("0x") ? parseInt(raw, 16) : parseInt(raw, 10);
        if (mask === 0xFFFFFFFF) return true; // "All" is checked
        if (cat & mask) return true;
    }
    return false;
}

function refilterAll() {
    for (const row of logInner.children) applyRowFilter(row);
}

// escHtml is provided by utils.js

// ── Controls ──────────────────────────────────────────────────────────────
btnPause.addEventListener("click", () => {
    paused = !paused;
    btnPause.textContent = paused ? "Resume" : "Pause";
    btnPause.classList.toggle("active", paused);
    pauseOverlay.hidden = !paused;
    if (!paused) {
        // Flush buffer
        pauseBuffer.forEach(appendMessage);
        pauseBuffer = [];
        pauseBuffered.textContent = 0;
    }
});

btnClear.addEventListener("click", () => {
    logInner.innerHTML = "";
    allMessages = [];
    totalMessages = 0; errorCount = 0;
});

btnExport.addEventListener("click", () => {
    const lines = allMessages.map(m => `[${(m.t / 1000).toFixed(2)}s] [cat=${m.cat}] ${m.msg}`).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "creatures3_log.txt" });
    a.click(); URL.revokeObjectURL(url);
});

searchInput.addEventListener("input", refilterAll);

btnCopy.addEventListener("click", () => {
    // Collect only the rows currently visible (not hidden by filter or search).
    const lines = [];
    for (const row of logInner.children) {
        if (row.classList.contains("hidden")) continue;
        const ts = row.querySelector(".log-ts");
        const cat = row.querySelector(".log-cat");
        const msg = row.querySelector(".log-msg");
        if (!msg) continue; // safety
        const parts = [];
        if (ts && ts.style.display !== "none") parts.push(ts.textContent.trim());
        if (cat) parts.push(`[${cat.textContent.trim()}]`);
        parts.push(msg.textContent.trim());
        lines.push(parts.join(" "));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
        const orig = btnCopy.textContent;
        btnCopy.textContent = `Copied (${lines.length})`;
        setTimeout(() => { btnCopy.textContent = orig; }, 1800);
    }).catch(() => {
        btnCopy.textContent = "Failed";
        setTimeout(() => { btnCopy.textContent = "Copy"; }, 1800);
    });
});

// Category toggles
const allCb = document.querySelector("#cat-all input");
const indivCbs = Array.from(document.querySelectorAll(".cat-toggle input[data-mask]"))
    .filter(cb => cb !== allCb && cb.dataset.mask !== "0xFFFFFFFF");

if (allCb) {
    allCb.addEventListener("change", () => {
        // When "All" is toggled, set every individual checkbox to match.
        indivCbs.forEach(cb => { cb.checked = allCb.checked; });
        refilterAll();
    });
}

indivCbs.forEach(cb => {
    cb.addEventListener("change", () => {
        // If any individual category is toggled, uncheck "All" (it no longer
        // means everything). Re-check All automatically if all are back on.
        if (allCb) {
            allCb.checked = indivCbs.every(c => c.checked);
        }
        refilterAll();
    });
});

// Display options
optTs.addEventListener("change", () => {
    document.querySelectorAll(".log-ts").forEach(el => {
        el.style.display = optTs.checked ? "" : "none";
    });
});
optScroll.addEventListener("change", () => {
    if (optScroll.checked) scrollAnchor.scrollIntoView({ block: "end" });
});
optCompact.addEventListener("change", () => {
    document.body.classList.toggle("compact", optCompact.checked);
});



// ── Boot ─────────────────────────────────────────────────────────────────
connect();

// ── Tab switching ────────────────────────────────────────────────────────
let activeTab = 'log'; // track current active tab

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const newTab = btn.dataset.tab;
        if (newTab === activeTab) return; // already active

        // Notify the outgoing tab
        DevToolsEvents.emit('tab:deactivated', activeTab);

        // Deactivate all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
        document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; p.classList.remove('tab-panel--active'); });
        document.querySelectorAll('.tab-controls').forEach(c => { c.hidden = true; });

        // Activate clicked tab
        btn.classList.add('tab-btn--active');
        const tabId = `tab-${newTab}`;
        const panel = document.getElementById(tabId);
        if (panel) { panel.hidden = false; panel.classList.add('tab-panel--active'); }

        // Show matching controls
        const ctrl = document.getElementById(`${newTab}-controls`);
        if (ctrl) ctrl.hidden = false;

        // Notify the incoming tab
        activeTab = newTab;
        DevToolsEvents.emit('tab:activated', newTab);
    });
});

// ── Engine Pause/Play controls ───────────────────────────────────────
const btnEnginePlay = document.getElementById('btn-engine-play');
const btnEnginePause = document.getElementById('btn-engine-pause');

function setEnginePausedUI(paused) {
    if (paused) {
        btnEnginePlay.classList.remove('engine-ctrl--active');
        btnEnginePause.classList.add('engine-ctrl--active');
    } else {
        btnEnginePlay.classList.add('engine-ctrl--active');
        btnEnginePause.classList.remove('engine-ctrl--active');
    }
}

btnEnginePlay.addEventListener('click', () => {
    fetch('/api/resume', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.ok) setEnginePausedUI(d.paused); })
        .catch(() => {});
});

btnEnginePause.addEventListener('click', () => {
    fetch('/api/pause', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.ok) setEnginePausedUI(d.paused); })
        .catch(() => {});
});

// Sync initial engine pause state on connect
function syncEngineState() {
    fetch('/api/engine-state')
        .then(r => r.json())
        .then(d => setEnginePausedUI(d.paused))
        .catch(() => {});
}
// Fetch on page load (after SSE connects)
setTimeout(syncEngineState, 500);
