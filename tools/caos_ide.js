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

    // Error bar DOM refs
    const errorBar = document.getElementById("ide-error-bar");
    const errorMsg = document.getElementById("ide-error-msg");
    const errorDismiss = document.getElementById("ide-error-dismiss");
    const autocompleteEl = document.getElementById("ide-autocomplete");
    const helpPopupEl = document.getElementById("ide-help-popup");
    const helpNameEl = document.getElementById("ide-help-name");
    const helpTypeEl = document.getElementById("ide-help-type");
    const helpParamsEl = document.getElementById("ide-help-params");
    const helpDescEl = document.getElementById("ide-help-desc");
    const helpCloseEl = document.getElementById("ide-help-close");

    // Breakpoint panel DOM refs
    const bpPanel = document.getElementById("ide-bp-panel");
    const bpListEl = document.getElementById("ide-bp-list");
    const bpCountEl = document.getElementById("ide-bp-count");
    const bpClearAllBtn = document.getElementById("ide-bp-clear-all");

    // ── State ─────────────────────────────────────────────────────────────
    let scriptoriumData = [];    // Array of { family, genus, species, event }
    let agentNames = {};         // Map of "F G S" → agent name from catalogue
    let loadedClassifier = null; // Which script is loaded from scriptorium
    let isActive = false;
    let searchTerm = "";

    // Validation state
    let validateTimer = null;
    let errorLine = -1;          // 1-indexed line with error, or -1

    // Autocomplete state
    let caosCommands = null;     // Cached command dictionary from API
    let acVisible = false;
    let acItems = [];            // Filtered items currently shown
    let acIndex = -1;            // Active selection index
    let acTypingTimer = null;

    // Help state
    let helpVisible = false;

    // Breakpoint state
    let ideBreakpoints = new Set();     // Set of 0-based line indices with breakpoints
    let addressMap = new Map();         // IP (int) → source char position (int)
    let lineToIp = new Map();           // line index (0-based) → first bytecode IP
    let bpAgentBindings = new Map();    // line index → Set of agent IDs bound
    let bpSourceHash = "";             // Hash of source when address map was fetched
    let bpAgentPollTimer = null;        // Timer for polling agent list

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

        // Line numbers — with error line highlighting + breakpoint markers
        editorLineNums.innerHTML = "";
        for (let i = 1; i <= lines.length; i++) {
            const span = document.createElement("span");
            span.textContent = i;
            const lineIdx = i - 1;
            if (i === errorLine) span.classList.add("ide-line-error");
            if (ideBreakpoints.has(lineIdx)) span.classList.add("ide-line-bp");

            // Click to toggle breakpoint
            span.addEventListener("click", () => toggleBreakpointAtLine(lineIdx));

            editorLineNums.appendChild(span);
            editorLineNums.appendChild(document.createTextNode("\n"));
        }

        // Syntax highlight overlay
        let highlightHtml = "";
        for (const line of lines) {
            highlightHtml += (typeof highlightCAOS === "function")
                ? highlightCAOS(line) : escHtml(line);
            highlightHtml += "\n";
        }
        editorHighlight.innerHTML = highlightHtml;
    }

    // Sync on any input — also trigger debounced validation + clear breakpoints
    editorTextarea.addEventListener("input", () => {
        syncEditorDisplay();
        scheduleValidation();
        scheduleAutocomplete();
        // Clear breakpoints when source changes (address map is invalidated)
        if (ideBreakpoints.size > 0) {
            clearAllBreakpoints();
        }
    });

    // Sync scroll
    editorTextarea.addEventListener("scroll", () => {
        editorHighlight.scrollTop = editorTextarea.scrollTop;
        editorHighlight.scrollLeft = editorTextarea.scrollLeft;
        editorLineNums.scrollTop = editorTextarea.scrollTop;
    });

    // CAOS block-opening keywords — trigger +1 indent on Enter
    const INDENT_OPEN = new Set([
        "doif", "elif", "else", "enum", "esee", "etch", "epas", "econ",
        "loop", "reps", "subr"
    ]);
    const TAB = "    "; // 4 spaces

    // Tab key inserts 4 spaces (or accepts autocomplete)
    editorTextarea.addEventListener("keydown", (e) => {
        // Autocomplete navigation
        if (acVisible) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                acIndex = Math.min(acIndex + 1, acItems.length - 1);
                renderAutocomplete();
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                acIndex = Math.max(acIndex - 1, 0);
                renderAutocomplete();
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                if (acIndex >= 0 && acIndex < acItems.length) {
                    e.preventDefault();
                    acceptAutocomplete(acItems[acIndex]);
                    return;
                }
            }
            if (e.key === "Escape") {
                e.preventDefault();
                hideAutocomplete();
                return;
            }
        }

        // ── Smart Enter — auto-indent ─────────────────────────────────────
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();

            const cursor = editorTextarea.selectionStart;
            const val = editorTextarea.value;

            // Find the start of the current line
            let lineStart = cursor;
            while (lineStart > 0 && val[lineStart - 1] !== "\n") lineStart--;

            // Extract existing leading whitespace
            let indentLen = 0;
            while (lineStart + indentLen < cursor && val[lineStart + indentLen] === " ") indentLen++;
            const currentIndent = " ".repeat(indentLen);

            // Check if the current line starts with a block-opening keyword
            const lineText = val.substring(lineStart, cursor).trimStart().split(/\s+/)[0].toLowerCase();
            const extraIndent = INDENT_OPEN.has(lineText) ? TAB : "";

            const insert = "\n" + currentIndent + extraIndent;
            editorTextarea.value = val.substring(0, cursor) + insert + val.substring(editorTextarea.selectionEnd);
            editorTextarea.selectionStart = editorTextarea.selectionEnd = cursor + insert.length;

            syncEditorDisplay();
            scheduleValidation();
            return;
        }

        // ── Smart Backspace — dedent by full indent level ─────────────────
        if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const cursor = editorTextarea.selectionStart;
            const selEnd = editorTextarea.selectionEnd;

            // Only act when there's no selection
            if (cursor === selEnd && cursor > 0) {
                const val = editorTextarea.value;

                // Find the start of the current line
                let lineStart = cursor;
                while (lineStart > 0 && val[lineStart - 1] !== "\n") lineStart--;

                // Text before cursor on this line
                const beforeCursor = val.substring(lineStart, cursor);

                // Only smart-delete if cursor is in leading whitespace (pure spaces)
                if (/^ +$/.test(beforeCursor) && beforeCursor.length > 0) {
                    e.preventDefault();

                    // Snap back to the previous tab stop
                    const col = beforeCursor.length;
                    const deleteCount = ((col - 1) % 4) + 1 || 4;

                    editorTextarea.value = val.substring(0, cursor - deleteCount) + val.substring(cursor);
                    editorTextarea.selectionStart = editorTextarea.selectionEnd = cursor - deleteCount;

                    syncEditorDisplay();
                    scheduleValidation();
                    return;
                }
            }
        }

        // ── Tab — insert 4 spaces (or dedent with Shift+Tab) ─────────────
        if (e.key === "Tab" && !acVisible) {
            e.preventDefault();
            const start = editorTextarea.selectionStart;
            const end = editorTextarea.selectionEnd;
            const val = editorTextarea.value;

            if (e.shiftKey) {
                // Shift+Tab: remove up to 4 spaces before cursor on this line
                let lineStart = start;
                while (lineStart > 0 && val[lineStart - 1] !== "\n") lineStart--;
                const beforeCursor = val.substring(lineStart, start);
                const leading = beforeCursor.match(/^ */)[0];
                const remove = Math.min(leading.length, 4);
                if (remove > 0) {
                    editorTextarea.value = val.substring(0, lineStart) + val.substring(lineStart + remove, start) + val.substring(end);
                    editorTextarea.selectionStart = editorTextarea.selectionEnd = start - remove;
                    syncEditorDisplay();
                    scheduleValidation();
                }
            } else {
                editorTextarea.value = val.substring(0, start) + TAB + val.substring(end);
                editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 4;
                syncEditorDisplay();
            }
            return;
        }

        // Ctrl/Cmd+Enter to run
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            btnRun.click();
            return;
        }

        // Ctrl+Space to trigger autocomplete (Cmd+Space is Spotlight on macOS)
        if (e.ctrlKey && !e.metaKey && e.key === " ") {
            e.preventDefault();
            triggerAutocomplete();
            return;
        }

        // F1 to show command help
        if (e.key === "F1") {
            e.preventDefault();
            triggerHelp();
            return;
        }
    });

    // Hide autocomplete and help on blur
    editorTextarea.addEventListener("blur", () => {
        setTimeout(() => {
            hideAutocomplete();
            // Don't hide help on blur — user should be able to read it
        }, 150);
    });

    // Dismiss help popup with Escape even when editor is not focused
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && helpVisible) {
            hideHelp();
        }
    });

    // Initial sync
    syncEditorDisplay();

    // ── Syntax Validation ─────────────────────────────────────────────────
    function scheduleValidation() {
        if (validateTimer) clearTimeout(validateTimer);
        validateTimer = setTimeout(runValidation, 500);
    }

    async function runValidation() {
        const code = editorTextarea.value.trim();
        if (!code || !isActive) {
            clearError();
            return;
        }

        try {
            const resp = await fetch("/api/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos: code })
            });
            const data = await resp.json();

            if (data.ok) {
                clearError();
            } else {
                showError(data.error || "Unknown error", data.position, code);
            }
        } catch (_) {
            // Network error — don't show validation errors if server unreachable
        }
    }

    function showError(msg, position, code) {
        // Map character position to line number
        errorLine = -1;
        if (position >= 0 && code) {
            let line = 1;
            for (let i = 0; i < Math.min(position, code.length); i++) {
                if (code[i] === "\n") line++;
            }
            errorLine = line;
        }

        if (errorBar && errorMsg) {
            errorMsg.textContent = msg + (errorLine > 0 ? ` (line ${errorLine})` : "");
            errorBar.hidden = false;
        }
        syncEditorDisplay(); // re-render to show gutter highlight
    }

    function clearError() {
        errorLine = -1;
        if (errorBar) errorBar.hidden = true;
        syncEditorDisplay();
    }

    if (errorDismiss) {
        errorDismiss.addEventListener("click", clearError);
    }

    // ── Auto-Complete ─────────────────────────────────────────────────────
    async function fetchCommandDictionary() {
        if (caosCommands) return;
        try {
            const resp = await fetch("/api/caos-commands");
            caosCommands = await resp.json();
        } catch (_) {
            caosCommands = [];
        }
    }

    function getWordAtCursor() {
        const pos = editorTextarea.selectionStart;
        const text = editorTextarea.value;
        // Walk back to find word start
        let start = pos;
        while (start > 0 && /[a-zA-Z0-9_:#]/.test(text[start - 1])) start--;
        // Walk forward to find word end
        let end = pos;
        while (end < text.length && /[a-zA-Z0-9_:#]/.test(text[end])) end++;
        return {
            word: text.substring(start, pos).toLowerCase(),
            fullWord: text.substring(start, end),
            start,
            end: pos
        };
    }

    function isInsideString() {
        const pos = editorTextarea.selectionStart;
        const text = editorTextarea.value.substring(0, pos);
        let inStr = false;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '"') inStr = !inStr;
        }
        return inStr;
    }

    function scheduleAutocomplete() {
        if (acTypingTimer) clearTimeout(acTypingTimer);
        acTypingTimer = setTimeout(() => {
            const { word } = getWordAtCursor();
            if (word.length >= 3 && !isInsideString()) {
                triggerAutocomplete();
            } else {
                hideAutocomplete();
            }
        }, 200);
    }

    async function triggerAutocomplete() {
        await fetchCommandDictionary();
        if (!caosCommands || caosCommands.length === 0) return;
        if (isInsideString()) return;

        const { word } = getWordAtCursor();
        if (!word) { hideAutocomplete(); return; }

        // Filter by prefix match, deduplicate by name
        const seen = new Set();
        acItems = [];
        for (const cmd of caosCommands) {
            const lowerName = cmd.name.toLowerCase();
            if (lowerName.startsWith(word) && !seen.has(lowerName)) {
                seen.add(lowerName);
                acItems.push(cmd);
                if (acItems.length >= 12) break;
            }
        }

        if (acItems.length === 0) {
            hideAutocomplete();
            return;
        }

        // If exact match is the only result, don't show
        if (acItems.length === 1 && acItems[0].name.toLowerCase() === word) {
            hideAutocomplete();
            return;
        }

        acIndex = 0;
        acVisible = true;
        positionAutocomplete();
        renderAutocomplete();
    }

    function positionAutocomplete() {
        if (!autocompleteEl) return;
        // Compute cursor position in the textarea
        const pos = editorTextarea.selectionStart;
        const text = editorTextarea.value.substring(0, pos);
        const lines = text.split("\n");
        const lineNum = lines.length;
        const colNum = lines[lines.length - 1].length;

        // Approximate pixel position (using font metrics)
        const lineHeight = 20; // matches CSS line-height
        const charWidth = 7.8; // approximate for JetBrains Mono 13px
        const gutterWidth = 44; // line numbers width

        const top = (lineNum * lineHeight) - editorTextarea.scrollTop + 2;
        const left = (colNum * charWidth) + gutterWidth - editorTextarea.scrollLeft;

        autocompleteEl.style.top = Math.max(0, top) + "px";
        autocompleteEl.style.left = Math.max(0, Math.min(left, editorTextarea.clientWidth - 200)) + "px";
    }

    function renderAutocomplete() {
        if (!autocompleteEl) return;
        autocompleteEl.innerHTML = "";
        autocompleteEl.hidden = false;

        acItems.forEach((cmd, i) => {
            const div = document.createElement("div");
            div.className = "ide-ac-item" + (i === acIndex ? " ide-ac-item--active" : "");

            const typeClass = cmd.type.toLowerCase().replace(/\s+/g, "-");

            div.innerHTML =
                `<span class="ide-ac-name">${escHtml(cmd.name)}</span>` +
                `<span class="ide-ac-type ide-ac-type--${typeClass}">${escHtml(cmd.type)}</span>` +
                (cmd.params ? `<span class="ide-ac-params">${escHtml(cmd.params)}</span>` : "") +
                `<span class="ide-ac-desc">${escHtml(cmd.description)}</span>`;

            div.addEventListener("mousedown", (e) => {
                e.preventDefault();
                acceptAutocomplete(cmd);
            });

            autocompleteEl.appendChild(div);
        });

        // Scroll active item into view
        const activeEl = autocompleteEl.querySelector(".ide-ac-item--active");
        if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
    }

    function acceptAutocomplete(cmd) {
        const { start, end } = getWordAtCursor();
        const text = editorTextarea.value;
        const insertName = cmd.name.toLowerCase();

        editorTextarea.value = text.substring(0, start) + insertName + text.substring(end);
        editorTextarea.selectionStart = editorTextarea.selectionEnd = start + insertName.length;
        editorTextarea.focus();

        hideAutocomplete();
        syncEditorDisplay();
        scheduleValidation();
    }

    function hideAutocomplete() {
        acVisible = false;
        acItems = [];
        acIndex = -1;
        if (autocompleteEl) autocompleteEl.hidden = true;
    }

    // ── Command Help (F1) ─────────────────────────────────────────────
    async function triggerHelp() {
        await fetchCommandDictionary();
        if (!caosCommands || caosCommands.length === 0) return;

        // Get the full word under the cursor (walk both directions)
        const pos = editorTextarea.selectionStart;
        const text = editorTextarea.value;
        let start = pos;
        let end = pos;
        while (start > 0 && /[a-zA-Z0-9_:#]/.test(text[start - 1])) start--;
        while (end < text.length && /[a-zA-Z0-9_:#]/.test(text[end])) end++;
        const word = text.substring(start, end).toUpperCase();
        if (!word) return;

        // Find all entries matching this name (may be multiple types)
        const matches = caosCommands.filter(c => c.name.toUpperCase() === word);
        if (matches.length === 0) {
            // Not a known command — show a brief "not found" note
            showHelp({ name: word, type: "unknown", params: "", description: "No help available for '" + word + "'." }, start, text);
            return;
        }

        // Merge multiple type entries into one help card:
        // primary entry = the command table entry (preferred), fallback to first
        const primary = matches.find(c => c.type === "command") || matches[0];
        showHelp(primary, start, text, matches.length > 1 ? matches : null);
    }

    function showHelp(cmd, wordStart, text, allMatches) {
        if (!helpPopupEl) return;

        // Populate header
        helpNameEl.textContent = cmd.name;
        helpTypeEl.textContent = cmd.type;

        // Build params list
        helpParamsEl.innerHTML = "";
        if (allMatches && allMatches.length > 1) {
            // Show all type variants
            for (const m of allMatches) {
                const row = document.createElement("div");
                row.className = "ide-help-param";
                row.innerHTML =
                    `<span class="ide-help-param-type">${escHtml(m.type)}</span>` +
                    (m.params ? `<span class="ide-help-param-name">${escHtml(m.params)}</span>` : "");
                helpParamsEl.appendChild(row);
            }
        } else if (cmd.params) {
            // Parse space-separated param names — pair them with type chars from the format string
            const paramNames = cmd.params.split(" ").filter(Boolean);
            for (const pname of paramNames) {
                const row = document.createElement("div");
                row.className = "ide-help-param";
                row.innerHTML =
                    `<span class="ide-help-param-name">${escHtml(pname)}</span>`;
                helpParamsEl.appendChild(row);
            }
        }

        // Description — use the full description from the command
        helpDescEl.textContent = cmd.description || "(no description)";

        // Position the popup at the word location
        const lines = text.substring(0, wordStart).split("\n");
        const lineNum = lines.length;
        const colNum = lines[lines.length - 1].length;
        const lineHeight = 20;
        const charWidth = 7.8;
        const gutterWidth = 44;

        let top = (lineNum * lineHeight) - editorTextarea.scrollTop - 2;
        let left = (colNum * charWidth) + gutterWidth - editorTextarea.scrollLeft;

        // Ensure popup stays within the editor area
        const editorRect = editorTextarea.getBoundingClientRect();
        const maxLeft = editorTextarea.clientWidth - 370;
        left = Math.max(0, Math.min(left, maxLeft));

        // If near the bottom, flip upward
        const editorHeight = editorTextarea.clientHeight;
        if (top + 180 > editorHeight) {
            top = Math.max(0, top - 180);
        }

        helpPopupEl.style.top = top + "px";
        helpPopupEl.style.left = left + "px";
        helpPopupEl.hidden = false;
        helpVisible = true;

        // Close autocomplete if open
        hideAutocomplete();
    }

    function hideHelp() {
        helpVisible = false;
        if (helpPopupEl) helpPopupEl.hidden = true;
    }

    if (helpCloseEl) {
        helpCloseEl.addEventListener("click", hideHelp);
    }

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

    // ── Breakpoints ──────────────────────────────────────────────────────

    // Fetch the address map and build line-to-instruction mappings
    // We use the compile-map to determine which lines have instructions,
    // but breakpoints are set using SOURCE CHARACTER OFFSETS (matching the Debugger).
    async function fetchAddressMap() {
        const code = editorTextarea.value;
        if (!code.trim()) return false;

        const hash = simpleHash(code);
        if (hash === bpSourceHash && addressMap.size > 0) return true; // cached

        try {
            const resp = await fetch("/api/compile-map", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos: code })
            });
            const data = await resp.json();
            if (!data.ok) return false;

            // Build addressMap: bytecoded IP → source char position
            addressMap = new Map();
            for (const [ipStr, srcPos] of Object.entries(data.map)) {
                addressMap.set(parseInt(ipStr, 10), srcPos);
            }

            // Compute line character offsets from the editor text
            const lines = code.split("\n");
            const lineCharOffsets = [];
            let offset = 0;
            for (const line of lines) {
                lineCharOffsets.push(offset);
                offset += line.length + 1;
            }

            // Build lineToIp: line index → { charOffset, bytecodeIp }
            // For each address map entry, find which source line it maps to
            lineToIp = new Map();
            for (const [ip, srcPos] of addressMap) {
                let lineIdx = 0;
                for (let i = 0; i < lineCharOffsets.length; i++) {
                    if (lineCharOffsets[i] <= srcPos) lineIdx = i;
                    else break;
                }

                // Store the first (lowest) IP for each line, with the line's char offset
                if (!lineToIp.has(lineIdx) || ip < (lineToIp.get(lineIdx).bytecodeIp || Infinity)) {
                    lineToIp.set(lineIdx, {
                        charOffset: lineCharOffsets[lineIdx],
                        bytecodeIp: ip,
                    });
                }
            }

            bpSourceHash = hash;
            return true;
        } catch (_) {
            return false;
        }
    }

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return String(hash);
    }

    // Toggle a breakpoint at the given line index (0-based)
    async function toggleBreakpointAtLine(lineIdx) {
        // Ensure we have the address map
        const ok = await fetchAddressMap();
        if (!ok) {
            appendOutput("error", "Cannot set breakpoint \u2014 code has errors.");
            return;
        }

        if (ideBreakpoints.has(lineIdx)) {
            // Remove breakpoint
            ideBreakpoints.delete(lineIdx);
            // Clear from all bound agents
            const boundAgents = bpAgentBindings.get(lineIdx);
            if (boundAgents) {
                const info = lineToIp.get(lineIdx);
                if (info) {
                    for (const agentId of boundAgents) {
                        sendBreakpointToAgent(agentId, info.charOffset, "clear");
                    }
                }
                bpAgentBindings.delete(lineIdx);
            }
        } else {
            // Set breakpoint
            if (!lineToIp.has(lineIdx)) {
                // No bytecode instruction on this line
                appendOutput("info", `No instruction on line ${lineIdx + 1} \u2014 breakpoint skipped.`);
                return;
            }
            ideBreakpoints.add(lineIdx);
            bpAgentBindings.set(lineIdx, new Set());
        }

        syncEditorDisplay();
        await renderBreakpointPanel();
    }

    // Find all agents currently running a script matching the current classifier
    async function discoverAgentsForClassifier() {
        const f = parseInt(classifierInputs.family.value) || 0;
        const g = parseInt(classifierInputs.genus.value) || 0;
        const s = parseInt(classifierInputs.species.value) || 0;
        const ev = parseInt(classifierInputs.event.value) || 0;

        if (f === 0 && g === 0 && s === 0 && ev === 0) return [];

        try {
            const resp = await fetch("/api/scripts");
            const scripts = await resp.json();

            return scripts.filter(a =>
                a.family === f && a.genus === g && a.species === s && a.event === ev
            ).map(a => ({
                id: a.agentId,
                state: a.state,
                gallery: a.gallery || ""
            }));
        } catch (_) {
            return [];
        }
    }

    // Send a breakpoint set/clear to a specific agent
    async function sendBreakpointToAgent(agentId, ip, action) {
        try {
            await fetch("/api/breakpoint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId, ip, action })
            });
        } catch (_) {
            // Silently fail — agent may have been destroyed
        }
    }

    // Toggle a breakpoint binding for a specific agent
    async function toggleAgentBinding(lineIdx, agentId) {
        const info = lineToIp.get(lineIdx);
        if (!info) return;

        let bindings = bpAgentBindings.get(lineIdx);
        if (!bindings) {
            bindings = new Set();
            bpAgentBindings.set(lineIdx, bindings);
        }

        if (bindings.has(agentId)) {
            // Remove binding
            bindings.delete(agentId);
            await sendBreakpointToAgent(agentId, info.charOffset, "clear");
        } else {
            // Add binding
            bindings.add(agentId);
            await sendBreakpointToAgent(agentId, info.charOffset, "set");
        }

        await renderBreakpointPanel();
    }

    // Render the breakpoint panel
    async function renderBreakpointPanel() {
        if (!bpPanel || !bpListEl) return;

        if (ideBreakpoints.size === 0) {
            bpPanel.hidden = true;
            stopBpAgentPoll();
            return;
        }

        bpPanel.hidden = false;
        startBpAgentPoll();

        // Discover agents for current classifier
        const agents = await discoverAgentsForClassifier();

        if (bpCountEl) {
            const agentCount = new Set();
            for (const bindings of bpAgentBindings.values()) {
                for (const id of bindings) agentCount.add(id);
            }
            const boundCount = agentCount.size;
            bpCountEl.textContent = `${ideBreakpoints.size} bp` +
                (agents.length > 0 ? ` · ${boundCount}/${agents.length} agents` : "");
        }

        // Build breakpoint list
        bpListEl.innerHTML = "";
        const sortedLines = [...ideBreakpoints].sort((a, b) => a - b);

        for (const lineIdx of sortedLines) {
            const info = lineToIp.get(lineIdx);
            const bindings = bpAgentBindings.get(lineIdx) || new Set();

            const row = document.createElement("div");
            row.className = "ide-bp-item";

            // Red dot
            const dot = document.createElement("span");
            dot.className = "ide-bp-dot";
            row.appendChild(dot);

            // Line number
            const lineEl = document.createElement("span");
            lineEl.className = "ide-bp-line";
            lineEl.textContent = `Line ${lineIdx + 1}`;
            row.appendChild(lineEl);

            // IP
            const ipEl = document.createElement("span");
            ipEl.className = "ide-bp-ip";
            ipEl.textContent = info ? `IP ${info.bytecodeIp}` : "\u2014";
            row.appendChild(ipEl);

            // Agent tags
            const agentsEl = document.createElement("span");
            agentsEl.className = "ide-bp-agents";

            if (agents.length === 0) {
                const noAgents = document.createElement("span");
                noAgents.className = "ide-bp-no-agents";
                noAgents.textContent = "no agents running";
                agentsEl.appendChild(noAgents);
            } else {
                for (const agent of agents) {
                    const tag = document.createElement("span");
                    const isOn = bindings.has(agent.id);
                    tag.className = `ide-bp-agent-tag ${isOn ? "ide-bp-agent-tag--on" : "ide-bp-agent-tag--off"}`;
                    tag.textContent = `#${agent.id}`;
                    tag.title = `${isOn ? "Remove from" : "Apply to"} agent #${agent.id}${agent.gallery ? " (" + agent.gallery + ")" : ""}`;
                    tag.addEventListener("click", () => toggleAgentBinding(lineIdx, agent.id));
                    agentsEl.appendChild(tag);
                }
            }
            row.appendChild(agentsEl);

            // Remove button
            const removeBtn = document.createElement("button");
            removeBtn.className = "ide-bp-remove";
            removeBtn.textContent = "×";
            removeBtn.title = "Remove breakpoint";
            removeBtn.addEventListener("click", () => {
                toggleBreakpointAtLine(lineIdx);
            });
            row.appendChild(removeBtn);

            bpListEl.appendChild(row);
        }
    }

    // Clear all breakpoints
    async function clearAllBreakpoints() {
        // Clear from all bound agents
        for (const [lineIdx, bindings] of bpAgentBindings) {
            const info = lineToIp.get(lineIdx);
            if (info) {
                for (const agentId of bindings) {
                    sendBreakpointToAgent(agentId, info.charOffset, "clear");
                }
            }
        }

        ideBreakpoints.clear();
        bpAgentBindings.clear();
        syncEditorDisplay();
        if (bpPanel) bpPanel.hidden = true;
        stopBpAgentPoll();
    }

    // Poll agent list while breakpoints are active
    function startBpAgentPoll() {
        if (bpAgentPollTimer) return;
        bpAgentPollTimer = setInterval(() => {
            if (ideBreakpoints.size > 0 && isActive) {
                renderBreakpointPanel();
            }
        }, 3000);
    }

    function stopBpAgentPoll() {
        if (bpAgentPollTimer) {
            clearInterval(bpAgentPollTimer);
            bpAgentPollTimer = null;
        }
    }

    // Clear All button handler
    if (bpClearAllBtn) {
        bpClearAllBtn.addEventListener("click", clearAllBreakpoints);
    }

    // ── Tab lifecycle ─────────────────────────────────────────────────────
    DevToolsEvents.on("tab:activated", (tab) => {
        if (tab === "ide") {
            isActive = true;
            refreshScriptorium();
            fetchCommandDictionary(); // pre-fetch for autocomplete and help
        }
    });

    DevToolsEvents.on("tab:deactivated", (tab) => {
        if (tab === "ide") {
            isActive = false;
            hideAutocomplete();
            hideHelp();
            stopBpAgentPoll();
        }
    });
})();
