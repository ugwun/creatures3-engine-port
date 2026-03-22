// caos_ide.js — Creatures 3 Developer Tools — CAOS IDE Tab
// Lightweight CAOS script editor with scriptorium browser, syntax highlighting,
// run/inject/remove, and file save/load.
"use strict";

(() => {
    // ── DOM refs ──────────────────────────────────────────────────────────
    const sidebarList = document.getElementById("ide-script-list");
    const editorTextarea = document.getElementById("ide-editor");
    const editorHighlight = document.getElementById("ide-highlight");
    const editorLineNums = document.getElementById("ide-line-numbers");
    const outputEl = document.getElementById("ide-output");
    const classifierInputs = {
        family: document.getElementById("ide-family"),
        genus: document.getElementById("ide-genus"),
        species: document.getElementById("ide-species"),
        event: document.getElementById("ide-event"),
    };

    const btnRun = document.getElementById("btn-ide-run");
    const btnInject = document.getElementById("btn-ide-inject");
    const btnRemove = document.getElementById("btn-ide-remove");
    const btnSave = document.getElementById("btn-ide-save");
    const btnLoad = document.getElementById("btn-ide-load");
    const btnClearOutput = document.getElementById("btn-ide-clear");
    const btnRefresh = document.getElementById("btn-ide-refresh");
    const fileInput = document.getElementById("ide-file-input");
    const searchInput = document.getElementById("ide-search");

    if (!editorTextarea || !sidebarList) return;

    // ── CAOS Event Name Map ───────────────────────────────────────────────
    // Standard event numbers used in Creatures 3 / Docking Station.
    const EVENT_NAMES = {
        0: "Deactivate",
        1: "Push",
        2: "Pull",
        3: "Hit",
        4: "Pickup",
        5: "Drop",
        6: "Collision",
        7: "Bump",
        8: "Impact",
        9: "Timer",
        10: "Constructor",
        11: "Destructor",
        12: "Eat",
        13: "Hold Hands",
        14: "Stop Holding",
        16: "UI Mouse Down",
        17: "UI Mouse Up",
        72: "Agent Exception",
        92: "Selected Creature Changed",
        99: "Pointer Activate (1)",
        100: "Pointer Activate (2)",
        101: "Pointer Deactivate",
        102: "Pointer Pickup",
        103: "Pointer Drop",
        116: "Creature Speaks Word",
        120: "Life Event",
        121: "Key Down",
        122: "Key Up",
        123: "Mouse Moved",
        124: "Mouse Scroll",
        125: "New Creature Arrival",
        126: "Creature Departure",
        127: "Agent Import",
        128: "Agent Export",
        135: "Connection Made",
        150: "VM Stopped",
    };

    function eventLabel(num) {
        const name = EVENT_NAMES[num];
        return name ? `${num} ${name}` : `${num}`;
    }

    // ── State ─────────────────────────────────────────────────────────────
    let scriptoriumData = [];    // Array of { family, genus, species, event }
    let agentNames = {};         // Map of "F G S" → agent name from catalogue
    let loadedClassifier = null; // Which script is loaded from scriptorium
    let isActive = false;
    let searchTerm = "";

    // ── Scriptorium browser ───────────────────────────────────────────────
    async function refreshScriptorium() {
        try {
            const [scripResp, namesResp] = await Promise.all([
                fetch("/api/scriptorium"),
                fetch("/api/agent-names")
            ]);
            scriptoriumData = await scripResp.json();
            try {
                agentNames = await namesResp.json();
            } catch (_) {
                agentNames = {};
            }
            renderScriptorium();
        } catch (e) {
            appendOutput("error", `Failed to fetch scriptorium: ${e.message}`);
        }
    }

    function renderScriptorium() {
        sidebarList.innerHTML = "";

        if (scriptoriumData.length === 0) {
            sidebarList.innerHTML = '<div class="ide-empty-hint">No scripts installed. Load a world first.</div>';
            return;
        }

        // Group by family:genus:species
        const groups = new Map();
        for (const s of scriptoriumData) {
            const key = `${s.family} ${s.genus} ${s.species}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(s);
        }

        // Sort groups
        const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));

        for (const key of sortedKeys) {
            const entries = groups.get(key);
            entries.sort((a, b) => a.event - b.event);

            const groupEl = document.createElement("div");
            groupEl.className = "ide-group";

            const name = agentNames[key] || "";
            const header = document.createElement("div");
            header.className = "ide-group-header";
            header.innerHTML = `<span class="ide-group-label"><span class="ide-group-classifier">${key}</span>${name ? `<span class="ide-group-name">${escHtml(name)}</span>` : ""}</span><span class="ide-group-count">${entries.length}</span>`;
            header.addEventListener("click", () => {
                groupEl.classList.toggle("ide-group--collapsed");
            });
            groupEl.appendChild(header);

            let visibleInGroup = 0;
            for (const entry of entries) {
                // Build searchable text for this entry (includes agent name)
                const evtName = EVENT_NAMES[entry.event] || "";
                const agentName = agentNames[key] || "";
                const searchText = `${entry.family} ${entry.genus} ${entry.species} ${entry.event} ${evtName} ${agentName}`.toLowerCase();
                const matchesSearch = !searchTerm || searchTerm.split(/\s+/).every(t => searchText.includes(t));

                const item = document.createElement("div");
                item.className = "ide-script-item";
                if (!matchesSearch) item.hidden = true;
                else visibleInGroup++;

                item.innerHTML = `<span class="ide-event-num">${entry.event}</span><span class="ide-event-name">${evtName}</span>`;
                item.title = `scrp ${entry.family} ${entry.genus} ${entry.species} ${entry.event}`;
                item.dataset.family = entry.family;
                item.dataset.genus = entry.genus;
                item.dataset.species = entry.species;
                item.dataset.event = entry.event;

                item.addEventListener("click", () => {
                    // Highlight selected
                    sidebarList.querySelectorAll(".ide-script-item--selected").forEach(
                        el => el.classList.remove("ide-script-item--selected")
                    );
                    item.classList.add("ide-script-item--selected");
                    loadScript(entry);
                });

                groupEl.appendChild(item);
            }

            // Hide entire group if no visible scripts
            if (searchTerm && visibleInGroup === 0) groupEl.hidden = true;

            // Auto-expand groups when searching
            if (searchTerm && visibleInGroup > 0) groupEl.classList.remove("ide-group--collapsed");

            sidebarList.appendChild(groupEl);
        }
    }

    async function loadScript(entry) {
        try {
            const resp = await fetch(`/api/scriptorium/${entry.family}/${entry.genus}/${entry.species}/${entry.event}`);
            const data = await resp.json();

            if (data.error) {
                appendOutput("error", data.error);
                return;
            }

            // Format and load into editor
            const formatted = (typeof formatCAOS === "function")
                ? formatCAOS(data.source) : data.source;
            editorTextarea.value = formatted;
            syncEditorDisplay();

            // Set classifier fields
            classifierInputs.family.value = entry.family;
            classifierInputs.genus.value = entry.genus;
            classifierInputs.species.value = entry.species;
            classifierInputs.event.value = entry.event;
            loadedClassifier = { ...entry };

            const evtName = EVENT_NAMES[entry.event];
            const suffix = evtName ? ` (${evtName})` : "";
            appendOutput("info", `Loaded ${entry.family} ${entry.genus} ${entry.species} : ${entry.event}${suffix}`);
        } catch (e) {
            appendOutput("error", `Failed to load script: ${e.message}`);
        }
    }

    // ── Editor display sync ───────────────────────────────────────────────
    function syncEditorDisplay() {
        const text = editorTextarea.value;
        const lines = text.split("\n");

        // Line numbers
        let numsHtml = "";
        for (let i = 1; i <= lines.length; i++) {
            numsHtml += i + "\n";
        }
        editorLineNums.textContent = numsHtml;

        // Syntax highlight overlay
        let highlightHtml = "";
        for (const line of lines) {
            highlightHtml += (typeof highlightCAOS === "function")
                ? highlightCAOS(line) : escHtml(line);
            highlightHtml += "\n";
        }
        editorHighlight.innerHTML = highlightHtml;
    }

    // Sync on any input
    editorTextarea.addEventListener("input", syncEditorDisplay);

    // Sync scroll
    editorTextarea.addEventListener("scroll", () => {
        editorHighlight.scrollTop = editorTextarea.scrollTop;
        editorHighlight.scrollLeft = editorTextarea.scrollLeft;
        editorLineNums.scrollTop = editorTextarea.scrollTop;
    });

    // Tab key inserts 4 spaces
    editorTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const start = editorTextarea.selectionStart;
            const end = editorTextarea.selectionEnd;
            const val = editorTextarea.value;
            editorTextarea.value = val.substring(0, start) + "    " + val.substring(end);
            editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 4;
            syncEditorDisplay();
        }
    });

    // Ctrl/Cmd+Enter to run
    editorTextarea.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            btnRun.click();
        }
    });

    // Initial sync
    syncEditorDisplay();

    // ── Run ───────────────────────────────────────────────────────────────
    btnRun.addEventListener("click", async () => {
        const code = editorTextarea.value.trim();
        if (!code) return;

        const firstLine = code.split("\n")[0];
        appendOutput("command", firstLine + (code.includes("\n") ? " …" : ""));

        try {
            const resp = await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos: code })
            });
            const data = await resp.json();

            if (data.ok) {
                const out = data.output && data.output.trim();
                appendOutput("result", out || "(ok — no output)");
            } else {
                appendOutput("error", data.error || "Unknown error");
            }
        } catch (e) {
            appendOutput("error", `Network error: ${e.message}`);
        }
    });

    // ── Inject (install script to scriptorium) ────────────────────────────
    btnInject.addEventListener("click", async () => {
        const code = editorTextarea.value.trim();
        if (!code) return;

        const f = parseInt(classifierInputs.family.value) || 0;
        const g = parseInt(classifierInputs.genus.value) || 0;
        const s = parseInt(classifierInputs.species.value) || 0;
        const ev = parseInt(classifierInputs.event.value) || 0;

        if (f === 0 && g === 0 && s === 0 && ev === 0) {
            appendOutput("error", "Set family/genus/species/event before injecting.");
            return;
        }

        // Strip any existing SCRP/ENDM wrapper from the source
        const bodyTrimmed = code
            .replace(/^\s*scrp\s+\d+\s+\d+\s+\d+\s+\d+\s*/i, "")
            .replace(/\s*endm\s*$/i, "")
            .trim();

        appendOutput("info", `Injecting as ${f} ${g} ${s} ${ev}…`);

        try {
            const resp = await fetch("/api/scriptorium/inject", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    family: f, genus: g, species: s, event: ev,
                    source: bodyTrimmed
                })
            });
            const data = await resp.json();

            if (data.ok) {
                appendOutput("result", "Script installed in scriptorium ✓");
                loadedClassifier = { family: f, genus: g, species: s, event: ev };
                await refreshScriptorium();
            } else {
                appendOutput("error", data.error || "Inject failed");
            }
        } catch (e2) {
            appendOutput("error", `Network error: ${e2.message}`);
        }
    });

    // ── Remove ────────────────────────────────────────────────────────────
    btnRemove.addEventListener("click", async () => {
        const f = parseInt(classifierInputs.family.value) || 0;
        const g = parseInt(classifierInputs.genus.value) || 0;
        const s = parseInt(classifierInputs.species.value) || 0;
        const ev = parseInt(classifierInputs.event.value) || 0;

        if (f === 0 && g === 0 && s === 0 && ev === 0) {
            appendOutput("error", "Set classifier to remove a script.");
            return;
        }

        const caos = `rscr ${f} ${g} ${s} ${ev}`;
        appendOutput("info", `Removing ${f} ${g} ${s} ${ev}…`);

        try {
            const resp = await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos })
            });
            const data = await resp.json();

            if (data.ok) {
                appendOutput("result", "Script removed ✓");
                loadedClassifier = null;
                await refreshScriptorium();
            } else {
                appendOutput("error", data.error || "Remove failed");
            }
        } catch (e2) {
            appendOutput("error", `Network error: ${e2.message}`);
        }
    });

    // ── Save / Load .cos ──────────────────────────────────────────────────
    btnSave.addEventListener("click", () => {
        const code = editorTextarea.value;
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const name = loadedClassifier
            ? `${loadedClassifier.family}_${loadedClassifier.genus}_${loadedClassifier.species}_${loadedClassifier.event}.cos`
            : "script.cos";
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        a.click();
        URL.revokeObjectURL(url);
        appendOutput("info", `Saved as ${name}`);
    });

    btnLoad.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            editorTextarea.value = ev.target.result;
            syncEditorDisplay();
            appendOutput("info", `Loaded ${file.name} (${file.size} bytes)`);
        };
        reader.readAsText(file);
        fileInput.value = ""; // reset for re-selecting same file
    });

    // ── Output panel ──────────────────────────────────────────────────────
    function appendOutput(type, text) {
        const el = document.createElement("div");
        el.className = `ide-output-entry ide-output-${type}`;

        if (type === "command") {
            el.innerHTML = `<span class="ide-out-prompt">▶</span> <span class="ide-out-code">${escHtml(text)}</span>`;
        } else if (type === "error") {
            el.innerHTML = `<span class="ide-out-error-icon">✗</span> <span class="ide-out-error">${escHtml(text)}</span>`;
        } else if (type === "info") {
            el.innerHTML = `<span class="ide-out-info">${escHtml(text)}</span>`;
        } else {
            el.innerHTML = `<span class="ide-out-result">${escHtml(text)}</span>`;
        }

        outputEl.appendChild(el);
        outputEl.scrollTop = outputEl.scrollHeight;
    }

    // Clear output
    btnClearOutput.addEventListener("click", () => {
        outputEl.innerHTML = "";
    });

    // Refresh scriptorium
    btnRefresh.addEventListener("click", () => {
        refreshScriptorium();
    });

    // Search filtering
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            searchTerm = searchInput.value.trim().toLowerCase();
            renderScriptorium();
        });
    }

    // ── Tab lifecycle ─────────────────────────────────────────────────────
    DevToolsEvents.on("tab:activated", (tab) => {
        if (tab === "ide") {
            isActive = true;
            refreshScriptorium();
        }
    });

    DevToolsEvents.on("tab:deactivated", (tab) => {
        if (tab === "ide") {
            isActive = false;
        }
    });
})();
