// caos_ide.js — Creatures 3 Developer Tools — CAOS Workbench
// Lightweight CAOS script editor with scriptorium browser, syntax highlighting,
// explicit execution/install/debug modes, reviewed context, and file save/load.
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

    const btnApply = document.getElementById("btn-ide-apply");
    const btnSave = document.getElementById("btn-ide-save");
    const btnLoad = document.getElementById("btn-ide-load");
    const btnClearOutput = document.getElementById("btn-ide-clear");
    const btnRefresh = document.getElementById("btn-ide-refresh");
    const fileInput = document.getElementById("ide-file-input");
    const searchInput = document.getElementById("ide-search");
    const modeButtons = [...document.querySelectorAll(".ide-mode-button")];
    const modeDescription = document.getElementById("ide-mode-description");
    const contextSummary = document.getElementById("ide-context-summary");
    const previewStatus = document.getElementById("ide-preview-status");
    const diffPreview = document.getElementById("ide-diff-preview");
    const evaluateOptions = document.getElementById("ide-evaluate-options");
    const bindTarget = document.getElementById("ide-bind-target");
    const pauseBeforeRun = document.getElementById("ide-pause-before-run");
    const toolbarStatus = document.getElementById("ide-toolbar-status");
    const confirmDialog = document.getElementById("ide-confirm-dialog");
    const confirmTitle = document.getElementById("ide-confirm-title");
    const confirmSummary = document.getElementById("ide-confirm-summary");
    const confirmCheckbox = document.getElementById("ide-confirm-checkbox");
    const confirmError = document.getElementById("ide-confirm-error");
    const confirmApply = document.getElementById("ide-confirm-apply");

    if (!editorTextarea || !sidebarList) return;

    // ── CAOS Event Name Map ───────────────────────────────────────────────
    const EVENT_NAMES = window.CAOS_EVENT_NAMES || {};

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
    let loadedScript = null;     // Raw source + checksum reviewed from engine
    let isActive = false;
    let searchTerm = "";
    let authoringMode = "evaluate";
    let validationResult = null;
    let validationSerial = 0;
    let currentReview = null;
    let reviewSerial = 0;
    let applyInFlight = false;

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

    // Breakpoint state — per-script storage
    // Each script gets its own breakpoint context keyed by classifier string "F G S E".
    let scriptBreakpointStore = new Map();  // classifier key → { breakpoints, addressMap, lineToIp, bindings, sourceHash }

    // Active working copies (loaded from store on script switch)
    let ideBreakpoints = new Set();     // Set of 0-based line indices with breakpoints
    let addressMap = new Map();         // IP (int) → source char position (int)
    let lineToIp = new Map();           // line index (0-based) → first bytecode IP
    let bpAgentBindings = new Map();    // line index → Set of agent IDs bound
    let bpSourceHash = "";             // Hash of source when address map was fetched
    let bpAgentPollTimer = null;        // Timer for polling agent list

    const Workbench = window.CaosWorkbenchModel;
    if (!Workbench) return;

    function currentClassifier() {
        return {
            family: Number(classifierInputs.family.value),
            genus: Number(classifierInputs.genus.value),
            species: Number(classifierInputs.species.value),
            event: Number(classifierInputs.event.value)
        };
    }

    function sameClassifier(left, right) {
        return left && right &&
            ["family", "genus", "species", "event"].every(
                field => Number(left[field]) === Number(right[field]));
    }

    function liveContext() {
        const state = ObservatoryState.getState();
        const selectedScript = state.selection && state.selection.script;
        return Workbench.contextSnapshot(
            state,
            selectedScript && !selectedScript.missing
                ? {
                    agentId: Number(selectedScript.agentId),
                    family: Number(selectedScript.family),
                    genus: Number(selectedScript.genus),
                    species: Number(selectedScript.species),
                    event: Number(selectedScript.event)
                }
                : null,
            window.ExperimentWorkspace &&
                window.ExperimentWorkspace.isRecording());
    }

    function existingForClassifier() {
        const context = liveContext();
        return loadedScript &&
            sameClassifier(loadedScript.classifier, currentClassifier()) &&
            loadedScript.worldName === context.worldName
            ? loadedScript
            : null;
    }

    function buildReview() {
        return Workbench.plan({
            mode: authoringMode,
            context: liveContext(),
            source: editorTextarea.value,
            classifier: currentClassifier(),
            existingScript: existingForClassifier(),
            validation: validationResult
        });
    }

    function contextRow(label, value) {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value == null || value === "" ? "—" : String(value);
        return [dt, dd];
    }

    function renderReview() {
        const review = buildReview();
        const context = review.context;
        modeDescription.textContent = review.modeDefinition.description;
        btnApply.textContent = review.modeDefinition.action;
        evaluateOptions.hidden = authoringMode !== "evaluate";

        contextSummary.replaceChildren(
            ...contextRow("World", context.worldName),
            ...contextRow("Ticks",
                context.worldTick == null ? null :
                    context.worldTick + " world / " +
                    (context.systemTick == null ? "—" : context.systemTick) +
                    " system"),
            ...contextRow("Engine",
                context.connectionStatus + " · " +
                (context.enginePaused ? "paused" : "running")),
            ...contextRow("Owner", "none (fresh VM)"),
            ...contextRow("Selected TARG",
                context.targetAgentId
                    ? "#" + context.targetAgentId +
                        (context.targetAgentClassifier
                            ? " · " + [
                                context.targetAgentClassifier.family,
                                context.targetAgentClassifier.genus,
                                context.targetAgentClassifier.species
                              ].join(" ")
                            : "")
                    : "none"),
            ...contextRow("Running script",
                context.runningScript
                    ? "#" + context.runningScript.agentId + " · " + [
                        context.runningScript.family,
                        context.runningScript.genus,
                        context.runningScript.species,
                        context.runningScript.event
                      ].join(" ")
                    : "none selected"),
            ...contextRow("Experiment",
                context.experimentRecording ? "recording" : "not recording")
        );
        bindTarget.disabled = !context.targetAgentId;
        if (!context.targetAgentId) bindTarget.checked = false;

        previewStatus.replaceChildren();
        const lines = [];
        if (validationResult && !["debug", "remove"].includes(authoringMode)) {
            lines.push({
                className: validationResult.ok
                    ? "ide-preview-ok" : "ide-preview-error",
                text: validationResult.ok
                    ? "✓ Engine compilation passed · " +
                        validationResult.sourceChecksum
                    : "✗ " + (validationResult.error ||
                        "Engine compilation failed")
            });
        }
        review.errors.forEach(text =>
            lines.push({ className: "ide-preview-error", text: "✗ " + text }));
        review.warnings.forEach(text =>
            lines.push({ className: "ide-preview-warning", text: "⚠ " + text }));
        if (!lines.length) {
            lines.push({
                className: "ide-preview-ok",
                text: "✓ Exact context and operation are ready for review."
            });
        }
        lines.forEach(line => {
            const item = document.createElement("div");
            item.className = line.className;
            item.textContent = line.text;
            previewStatus.appendChild(item);
        });

        if (review.mode === "replace" && review.diff.length) {
            diffPreview.hidden = false;
            diffPreview.textContent = review.diff.map(row =>
                (row.type === "add" ? "+ " :
                    row.type === "remove" ? "− " : "  ") + row.text
            ).join("\n");
        } else {
            diffPreview.hidden = true;
            diffPreview.textContent = "";
        }

        btnApply.disabled = applyInFlight || !review.canApply;
        toolbarStatus.textContent = review.canApply
            ? (review.requiresConfirmation
                ? "Ready for final confirmation"
                : "Ready · no mutation confirmation required")
            : (review.errors[0] || "Waiting for review");
        return review;
    }

    async function fetchExactScriptForClassifier() {
        const serial = ++reviewSerial;
        const target = Workbench.classifier(currentClassifier());
        if (!target.valid) {
            if (!sameClassifier(
                loadedScript && loadedScript.classifier,
                currentClassifier())) {
                loadedScript = null;
            }
            renderReview();
            return null;
        }
        if (existingForClassifier()) {
            renderReview();
            return loadedScript;
        }
        try {
            const value = target.value;
            const response = await fetch(
                `/api/scriptorium/${value.family}/${value.genus}/` +
                `${value.species}/${value.event}`);
            const data = await response.json();
            if (serial !== reviewSerial) return null;
            loadedScript = data.error ? null : {
                classifier: value,
                source: data.source,
                checksum: data.checksum ||
                    Workbench.fingerprint(data.source),
                worldName: data.worldName || liveContext().worldName
            };
        } catch (_) {
            if (serial === reviewSerial) loadedScript = null;
        }
        renderReview();
        return loadedScript;
    }

    function setMode(mode) {
        if (!Workbench.MODES[mode]) return;
        authoringMode = mode;
        modeButtons.forEach(button => {
            const selected = button.dataset.mode === mode;
            button.classList.toggle("ide-mode-button--active", selected);
            button.setAttribute("aria-checked", selected ? "true" : "false");
        });
        if (["install", "replace", "remove"].includes(mode))
            fetchExactScriptForClassifier();
        else
            renderReview();
    }

    modeButtons.forEach(button =>
        button.addEventListener("click", () => setMode(button.dataset.mode)));

    // Build a classifier key string for breakpoint store lookups
    function classifierKey(f, g, s, e) {
        return `${f} ${g} ${s} ${e}`;
    }

    function currentClassifierKey() {
        const f = parseInt(classifierInputs.family.value) || 0;
        const g = parseInt(classifierInputs.genus.value) || 0;
        const s = parseInt(classifierInputs.species.value) || 0;
        const ev = parseInt(classifierInputs.event.value) || 0;
        if (f === 0 && g === 0 && s === 0 && ev === 0) return null;
        return classifierKey(f, g, s, ev);
    }

    // Save current breakpoint state to the store for the current classifier
    function saveBreakpointContext() {
        const key = currentClassifierKey();
        if (!key) return;
        if (ideBreakpoints.size === 0) {
            // No breakpoints — remove from store if present
            scriptBreakpointStore.delete(key);
            return;
        }
        scriptBreakpointStore.set(key, {
            breakpoints: new Set(ideBreakpoints),
            addressMap: new Map(addressMap),
            lineToIp: new Map(lineToIp),
            bindings: new Map([...bpAgentBindings].map(([k, v]) => [k, new Set(v)])),
            sourceHash: bpSourceHash
        });
    }

    // Restore breakpoint state from the store for a given classifier
    function restoreBreakpointContext(f, g, s, e) {
        const key = classifierKey(f, g, s, e);
        const stored = scriptBreakpointStore.get(key);
        if (stored) {
            ideBreakpoints = new Set(stored.breakpoints);
            addressMap = new Map(stored.addressMap);
            lineToIp = new Map(stored.lineToIp);
            bpAgentBindings = new Map([...stored.bindings].map(([k, v]) => [k, new Set(v)]));
            bpSourceHash = stored.sourceHash;
        } else {
            ideBreakpoints = new Set();
            addressMap = new Map();
            lineToIp = new Map();
            bpAgentBindings = new Map();
            bpSourceHash = "";
        }
    }

    // Check if any script in the store has breakpoints
    function hasAnyBreakpoints() {
        if (ideBreakpoints.size > 0) return true;
        for (const ctx of scriptBreakpointStore.values()) {
            if (ctx.breakpoints.size > 0) return true;
        }
        return false;
    }

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
            const labelSpanChildren = [el("span", { className: "ide-group-classifier", textContent: key })];
            if (name) {
                labelSpanChildren.push(el("span", { className: "ide-group-name", textContent: name }));
            }
            
            const header = el("div", { className: "ide-group-header" }, [
                el("span", { className: "ide-group-label" }, labelSpanChildren),
                el("span", { className: "ide-group-count", textContent: entries.length })
            ]);
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

                let hidden = false;
                if (!matchesSearch) hidden = true;
                else visibleInGroup++;

                const item = el("div", {
                    className: "ide-script-item",
                    hidden: hidden,
                    title: `scrp ${entry.family} ${entry.genus} ${entry.species} ${entry.event}`,
                    dataset: {
                        family: entry.family,
                        genus: entry.genus,
                        species: entry.species,
                        event: entry.event
                    }
                }, [
                    el("span", { className: "ide-event-num", textContent: entry.event }),
                    el("span", { className: "ide-event-name", textContent: evtName })
                ]);

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

    let scriptLoadSerial = 0;

    async function loadScript(entry) {
        const serial = ++scriptLoadSerial;
        const editorAtRequest = editorTextarea.value;
        const modeAtRequest = authoringMode;
        try {
            const resp = await fetch(`/api/scriptorium/${entry.family}/${entry.genus}/${entry.species}/${entry.event}`);
            const data = await resp.json();
            // Only the latest choice may fill the editor, and only if the user
            // has not moved on. Comparing contents covers every way of editing,
            // since autocomplete and indenting change the text without an
            // input event.
            if (serial !== scriptLoadSerial ||
                    editorTextarea.value !== editorAtRequest ||
                    authoringMode !== modeAtRequest) return;

            if (data.error) {
                appendOutput("error", data.error);
                return;
            }

            // Save breakpoint context for the currently loaded script before switching
            saveBreakpointContext();

            // Format and load into editor
            const formatted = (typeof formatCAOS === "function")
                ? formatCAOS(data.source) : data.source;
            editorTextarea.value = formatted;

            // Set classifier fields
            classifierInputs.family.value = entry.family;
            classifierInputs.genus.value = entry.genus;
            classifierInputs.species.value = entry.species;
            classifierInputs.event.value = entry.event;
            loadedClassifier = { ...entry };
            loadedScript = {
                classifier: { ...entry },
                source: data.source,
                checksum: data.checksum ||
                    Workbench.fingerprint(data.source),
                worldName: data.worldName || liveContext().worldName
            };
            validationResult = null;

            // Restore breakpoint context for the newly loaded script
            restoreBreakpointContext(entry.family, entry.genus, entry.species, entry.event);

            syncEditorDisplay();
            renderBreakpointPanel();

            const evtName = EVENT_NAMES[entry.event];
            const suffix = evtName ? ` (${evtName})` : "";
            appendOutput("info", `Loaded ${entry.family} ${entry.genus} ${entry.species} : ${entry.event}${suffix}`);
            setMode("replace");
            runValidation();
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

    // Sync on any input — also trigger debounced validation + clear current script breakpoints
    editorTextarea.addEventListener("input", () => {
        ++validationSerial;
        validationResult = null;
        syncEditorDisplay();
        scheduleValidation();
        scheduleAutocomplete();
        renderReview();
        // Clear breakpoints for the CURRENT script only when source changes
        // (address map is invalidated for this script, other scripts are unaffected)
        if (ideBreakpoints.size > 0) {
            clearCurrentScriptBreakpoints();
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

        // Ctrl/Cmd+Enter applies the currently selected explicit mode
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            btnApply.click();
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
            const preferences = ObservatoryState.getState().preferences;
            if (preferences && preferences.shortcutsEnabled === false) return;
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
        validateTimer = setTimeout(runValidation, 1500);
    }

    async function runValidation(force) {
        const code = editorTextarea.value.trim();
        if (!code || !isActive) {
            clearError();
            return;
        }

        // Don't validate while user is actively using autocomplete —
        // the code is incomplete and will always fail compilation
        if (acVisible && !force) return;

        // Don't validate if cursor is at the very end — user is likely still typing
        if (!force &&
            editorTextarea.selectionStart === editorTextarea.value.length) {
            const lastLine = code.split("\n").pop().trim();
            // If the last line is just a partial keyword (no args/closing), skip
            if (lastLine && !lastLine.includes(" ") && lastLine.length < 6) return;
        }

        const serial = ++validationSerial;
        try {
            const resp = await fetch("/api/caos/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: authoringMode,
                    source: authoringMode === "install" ||
                        authoringMode === "replace"
                        ? Workbench.unwrapEventSource(code)
                        : code
                })
            });
            const data = await resp.json();
            if (serial !== validationSerial) return;
            validationResult = data;

            if (data.ok) {
                clearError();
            } else {
                const position = data.location
                    ? data.location.position : -1;
                showError(data.error || "Unknown error", position, code);
            }
            renderReview();
        } catch (_) {
            // Network error — don't show validation errors if server unreachable
            if (serial !== validationSerial) return;
            validationResult = null;
            renderReview();
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

        // Clean up raw compiler errors — they can include long token dumps
        // e.g. "Expected numeric rvalue at token 'room targ 3 0 2 endi doif ...'" 
        // Truncate at the first closing quote after "at token '" to keep it readable
        let cleanMsg = msg;
        const tokenMatch = cleanMsg.match(/at token\s+'([^']{0,30})/);
        if (tokenMatch) {
            const before = cleanMsg.substring(0, cleanMsg.indexOf("at token"));
            const tokenVal = tokenMatch[1] || "(end of input)";
            cleanMsg = before + `at token '${tokenVal}'`;
        }
        // Fallback: cap length at 120 chars
        if (cleanMsg.length > 120) cleanMsg = cleanMsg.substring(0, 117) + "…";

        if (errorBar && errorMsg) {
            errorMsg.textContent = cleanMsg + (errorLine > 0 ? ` (line ${errorLine})` : "");
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

    Object.values(classifierInputs).forEach(input =>
        input.addEventListener("input", () => {
            if (["install", "replace", "remove"].includes(authoringMode))
                fetchExactScriptForClassifier();
            else
                renderReview();
        }));
    [bindTarget, pauseBeforeRun].forEach(input =>
        input.addEventListener("change", renderReview));

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
        clearError(); // dismiss any stale validation error while typing
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

    // ── Reviewed workbench operations ─────────────────────────────────────
    function confirmRows(review) {
        const target = review.context.targetAgentId
            ? "#" + review.context.targetAgentId
            : "none";
        const exactClassifier =
            ["install", "replace", "remove"].includes(review.mode)
                ? review.classifier.key : "not applicable";
        return [
            ["Operation", review.modeDefinition.label],
            ["World", review.context.worldName + " at tick " +
                review.context.worldTick],
            ["Owner / TARG", "owner none / " +
                (bindTarget.checked ? target : "not bound")],
            ["Classifier", exactClassifier],
            ["Source checksum", review.mode === "remove"
                ? "not applicable" : review.sourceChecksum],
            ["Installed checksum", review.existingChecksum || "none"],
            ["Risk", review.mode === "evaluate"
                ? review.risk.level + " — " + review.risk.explanation
                : "scriptorium mutation"],
            ["Pause before run", review.mode === "evaluate"
                ? (pauseBeforeRun.checked ? "yes" : "no") : "not applicable"],
            ["Experiment", review.context.experimentRecording
                ? "recording; operation enters the ledger"
                : "not recording"]
        ];
    }

    function showConfirmation(review) {
        currentReview = review;
        confirmTitle.textContent = review.modeDefinition.action;
        const list = document.createElement("dl");
        confirmRows(review).forEach(([name, value]) => {
            const dt = document.createElement("dt");
            const dd = document.createElement("dd");
            dt.textContent = name;
            dd.textContent = value;
            list.append(dt, dd);
        });
        confirmSummary.replaceChildren(list);
        confirmCheckbox.checked = false;
        confirmApply.disabled = true;
        confirmError.textContent = "";
        confirmDialog.showModal();
    }

    confirmCheckbox.addEventListener("change", () => {
        confirmApply.disabled = !confirmCheckbox.checked || applyInFlight;
        confirmError.textContent = "";
    });

    confirmDialog.addEventListener("close", () => {
        if (!applyInFlight) currentReview = null;
    });
    confirmDialog.addEventListener("click", event => {
        if (event.target === confirmDialog && !applyInFlight)
            confirmDialog.close();
    });

    async function prepareApply() {
        if (applyInFlight) return;
        if (!["debug", "remove"].includes(authoringMode)) {
            await runValidation(true);
        }
        if (["install", "replace", "remove"].includes(authoringMode)) {
            await fetchExactScriptForClassifier();
        }
        const review = buildReview();
        renderReview();
        if (!review.canApply) {
            appendOutput("error", review.errors[0] ||
                "Operation is not ready for review.");
            return;
        }
        if (review.requiresConfirmation)
            showConfirmation(review);
        else
            performReview(review, false);
    }

    async function performReview(review, confirmed) {
        applyInFlight = true;
        renderReview();
        confirmApply.disabled = true;
        const firstLine = review.source.split("\n")[0];
        appendOutput("command", review.modeDefinition.label +
            (firstLine ? " · " + firstLine +
                (review.source.includes("\n") ? " …" : "") : ""));
        try {
            const operation = Workbench.apiRequest(review, {
                bindTarget: bindTarget.checked,
                pauseBeforeRun: pauseBeforeRun.checked,
                riskAcknowledged: confirmed,
                confirmed
            });
            if (operation.kind === "navigate") {
                const world = ObservatoryState.getState().world.identity;
                window.DevToolsNavigation.navigate({
                    tab: "debugger",
                    view: "agent",
                    worldKey: world && world.key,
                    primary: "agent",
                    selections: {
                        agent: { id: operation.agentId }
                    }
                });
                appendOutput("result",
                    "Opened selected running script in Debugger.");
                return;
            }

            const response = await fetch(operation.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(operation.body)
            });
            const data = await response.json();
            if (!data.ok) {
                const location = data.location && data.location.line
                    ? ` (line ${data.location.line}, column ${data.location.column})`
                    : "";
                appendOutput("error",
                    (data.error || "Operation failed") + location);
                return;
            }

            if (review.mode === "evaluate") {
                const output = data.output && data.output.trim();
                appendOutput("result",
                    (output || "(ok — no output)") +
                    ` · world ticks ${data.worldTickStart}→${data.worldTickEnd}` +
                    ` · ${data.elapsedWallMs} ms · ${data.correlationId}`);
            } else {
                appendOutput("result",
                    `${review.modeDefinition.label} completed ✓ · ` +
                    `${review.classifier.key} · tick ${data.worldTick} · ` +
                    data.correlationId);
                if (review.mode === "remove") {
                    loadedClassifier = null;
                    loadedScript = null;
                } else {
                    loadedClassifier = {
                        family: review.classifier.family,
                        genus: review.classifier.genus,
                        species: review.classifier.species,
                        event: review.classifier.event
                    };
                    loadedScript = {
                        classifier: loadedClassifier,
                        source: review.source,
                        checksum: data.sourceChecksum,
                        worldName: data.worldName || review.context.worldName
                    };
                }
                await refreshScriptorium();
            }
            appendHandoffs(data, review);
        } catch (error) {
            appendOutput("error", `Network error: ${error.message}`);
        } finally {
            applyInFlight = false;
            if (confirmDialog.open) confirmDialog.close();
            currentReview = null;
            renderReview();
        }
    }

    function appendHandoffs(data, review) {
        const row = document.createElement("div");
        row.className = "ide-output-entry ide-output-handoffs";
        const label = document.createElement("span");
        label.textContent = "Continue in ";
        row.appendChild(label);
        [
            ["Logs", "log"],
            ["Scripts", "scripts"],
            ["Debugger", "debugger"]
        ].forEach(([name, tab]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "ide-handoff";
            button.textContent = name;
            button.addEventListener("click", () => {
                const world = ObservatoryState.getState().world.identity;
                window.DevToolsNavigation.navigate({
                    tab,
                    worldKey: world && world.key,
                    primary: review.context.targetAgentId ? "agent" : null,
                    selections: review.context.targetAgentId
                        ? { agent: { id: review.context.targetAgentId } }
                        : {}
                });
            });
            row.appendChild(button);
        });
        outputEl.appendChild(row);
        outputEl.scrollTop = outputEl.scrollHeight;
    }

    btnApply.addEventListener("click", prepareApply);
    confirmApply.addEventListener("click", () => {
        if (!confirmCheckbox.checked || !currentReview) {
            confirmError.textContent =
                "Review acknowledgement is required.";
            return;
        }
        performReview(currentReview, true);
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
    // and breakpoints are set using BYTECODE IPs (matching CAOSMachine::myIP).
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
                        sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
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

    // Find all agents matching a given classifier (family/genus/species).
    // Event is not used for enum — all agents of that FGS will be returned.
    async function discoverAgentsForFGS(f, g, s) {
        if (f === 0 && g === 0 && s === 0) return [];

        try {
            // Use CAOS enum to find all agents matching the classifier —
            // much more reliable than /api/scripts which only shows scripts
            // that are actively executing at poll time (timer scripts run
            // for a brief instant, so they're almost never caught).
            const caos = `inst setv va00 0 enum ${f} ${g} ${s} doif va00 lt 20 outs "," outv unid addv va00 1 endi next`;
            const resp = await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos })
            });
            const data = await resp.json();

            if (!data.ok || !data.output) return [];

            // Parse comma-separated agent IDs from output (first token is empty)
            const ids = data.output.trim().split(",").filter(Boolean).map(s => parseInt(s.trim()));
            return ids.filter(id => !isNaN(id) && id > 0).map(id => ({
                id,
                state: "timer",
                gallery: ""
            }));
        } catch (_) {
            return [];
        }
    }

    // Convenience: discover agents for the current classifier header
    async function discoverAgentsForClassifier() {
        const f = parseInt(classifierInputs.family.value) || 0;
        const g = parseInt(classifierInputs.genus.value) || 0;
        const s = parseInt(classifierInputs.species.value) || 0;
        return discoverAgentsForFGS(f, g, s);
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
            await sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
        } else {
            // Add binding
            bindings.add(agentId);
            await sendBreakpointToAgent(agentId, info.bytecodeIp, "set");
        }

        await renderBreakpointPanel();
    }

    // Render the breakpoint panel — shows ALL breakpoints across ALL scripts,
    // grouped by script classifier with headers.
    async function renderBreakpointPanel() {
        if (!bpPanel || !bpListEl) return;

        // Save current context first so the store is up to date
        saveBreakpointContext();

        // Collect all scripts that have breakpoints
        const allScripts = new Map(); // key → { breakpoints, lineToIp, bindings }
        const curKey = currentClassifierKey();

        // Gather from the store
        for (const [key, ctx] of scriptBreakpointStore) {
            if (ctx.breakpoints.size > 0) {
                allScripts.set(key, ctx);
            }
        }

        // Also include current active state if it has breakpoints and isn't in the store yet
        if (curKey && ideBreakpoints.size > 0 && !allScripts.has(curKey)) {
            allScripts.set(curKey, {
                breakpoints: ideBreakpoints,
                lineToIp: lineToIp,
                bindings: bpAgentBindings,
                sourceHash: bpSourceHash
            });
        }

        if (allScripts.size === 0) {
            bpPanel.hidden = true;
            stopBpAgentPoll();
            return;
        }

        bpPanel.hidden = false;
        startBpAgentPoll();

        // Count total breakpoints and bound agents across all scripts
        let totalBpCount = 0;
        const allBoundAgents = new Set();
        for (const ctx of allScripts.values()) {
            totalBpCount += ctx.breakpoints.size;
            for (const bindings of ctx.bindings.values()) {
                for (const id of bindings) allBoundAgents.add(id);
            }
        }

        if (bpCountEl) {
            bpCountEl.textContent = `${totalBpCount} bp · ${allScripts.size} script${allScripts.size > 1 ? "s" : ""}`
                + (allBoundAgents.size > 0 ? ` · ${allBoundAgents.size} bound` : "");
        }

        // Build ALL DOM content into a fragment BEFORE touching the live DOM.
        // This eliminates the flash caused by clearing innerHTML then awaiting
        // async agent discovery before appending new content.
        const fragment = document.createDocumentFragment();

        // Discover agents per FGS (cache to avoid duplicate CAOS calls)
        const agentCache = new Map(); // "F G S" → agents array

        for (const [key, ctx] of allScripts) {
            const parts = key.split(" ").map(Number);
            const [f, g, s, ev] = parts;
            const fgsKey = `${f} ${g} ${s}`;

            // Discover agents (cached per FGS)
            let agents;
            if (agentCache.has(fgsKey)) {
                agents = agentCache.get(fgsKey);
            } else {
                agents = await discoverAgentsForFGS(f, g, s);
                agentCache.set(fgsKey, agents);
            }

            const isCurrent = (key === curKey);

            // Group container
            const groupEl = document.createElement("div");
            groupEl.className = "ide-bp-group" + (isCurrent ? " ide-bp-group--current" : "");

            // Group header: classifier + agent name + event label
            const headerEl = document.createElement("div");
            headerEl.className = "ide-bp-group-header";

            const classEl = document.createElement("span");
            classEl.className = "ide-bp-group-classifier";
            classEl.textContent = `${f} ${g} ${s}`;
            headerEl.appendChild(classEl);

            const agName = agentNames[fgsKey] || "";
            if (agName) {
                const nameEl = document.createElement("span");
                nameEl.className = "ide-bp-group-name";
                nameEl.textContent = agName;
                headerEl.appendChild(nameEl);
            }

            const evtEl = document.createElement("span");
            evtEl.className = "ide-bp-group-event";
            const evtName = EVENT_NAMES[ev];
            evtEl.textContent = evtName ? `${ev} ${evtName}` : `evt ${ev}`;
            headerEl.appendChild(evtEl);

            // Click header to jump to this script in the editor
            if (!isCurrent) {
                headerEl.style.cursor = "pointer";
                headerEl.title = `Load script ${f} ${g} ${s} event ${ev}`;
                headerEl.addEventListener("click", () => {
                    loadScript({ family: f, genus: g, species: s, event: ev });
                });
            }

            groupEl.appendChild(headerEl);

            // Breakpoint rows within this group
            const sortedLines = [...ctx.breakpoints].sort((a, b) => a - b);
            for (const lineIdx of sortedLines) {
                const info = ctx.lineToIp.get(lineIdx);
                const bindings = ctx.bindings.get(lineIdx) || new Set();

                const row = document.createElement("div");
                row.className = "ide-bp-item";

                // Red dot
                const dot = document.createElement("span");
                dot.className = "ide-bp-dot";
                row.appendChild(dot);

                // Line number — clickable: loads the script and scrolls to line
                const lineEl = document.createElement("span");
                lineEl.className = "ide-bp-line";
                lineEl.textContent = `Line ${lineIdx + 1}`;
                lineEl.title = "Jump to line";
                const navKey = key;
                const navLine = lineIdx;
                const navF = f, navG = g, navS = s, navEv = ev;
                lineEl.addEventListener("click", () => {
                    navigateToBreakpointLine(navKey, navF, navG, navS, navEv, navLine);
                });
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
                    noAgents.textContent = "no agents";
                    agentsEl.appendChild(noAgents);
                } else {
                    for (const agent of agents) {
                        const tag = document.createElement("span");
                        const isOn = bindings.has(agent.id);
                        tag.className = `ide-bp-agent-tag ${isOn ? "ide-bp-agent-tag--on" : "ide-bp-agent-tag--off"}`;
                        tag.textContent = `#${agent.id}`;
                        tag.title = `${isOn ? "Remove from" : "Apply to"} agent #${agent.id}`;

                        // Capture values for closure
                        const capturedKey = key;
                        const capturedLineIdx = lineIdx;
                        const capturedAgentId = agent.id;
                        tag.addEventListener("click", () => {
                            toggleAgentBindingForScript(capturedKey, capturedLineIdx, capturedAgentId);
                        });
                        agentsEl.appendChild(tag);
                    }
                }
                row.appendChild(agentsEl);

                // Remove button
                const removeBtn = document.createElement("button");
                removeBtn.className = "ide-bp-remove";
                removeBtn.textContent = "×";
                removeBtn.title = "Remove breakpoint";
                const capturedKey2 = key;
                const capturedLine2 = lineIdx;
                removeBtn.addEventListener("click", () => {
                    removeBreakpointFromScript(capturedKey2, capturedLine2);
                });
                row.appendChild(removeBtn);

                groupEl.appendChild(row);
            }

            fragment.appendChild(groupEl);
        }

        // Single atomic DOM swap — replaces old content with the fully-built fragment
        bpListEl.innerHTML = "";
        bpListEl.appendChild(fragment);
    }

    // Navigate to a breakpoint line: load the script if needed, then scroll the editor
    async function navigateToBreakpointLine(scriptKey, f, g, s, ev, lineIdx) {
        const curKey = currentClassifierKey();
        if (scriptKey !== curKey) {
            // Load the script first (this also restores breakpoints)
            await loadScript({ family: f, genus: g, species: s, event: ev });
        }
        scrollEditorToLine(lineIdx);
    }

    // Scroll the editor textarea so that the given line (0-based) is visible and highlighted
    function scrollEditorToLine(lineIdx) {
        const lineHeight = 20; // matches CSS line-height
        const editorHeight = editorTextarea.clientHeight;
        // Center the line in the viewport
        const targetScroll = Math.max(0, (lineIdx * lineHeight) - (editorHeight / 2) + lineHeight);
        editorTextarea.scrollTop = targetScroll;
        editorHighlight.scrollTop = targetScroll;
        editorLineNums.scrollTop = targetScroll;

        // Briefly flash the line number in the gutter to indicate where we landed
        const lineSpans = editorLineNums.querySelectorAll("span");
        if (lineSpans[lineIdx]) {
            lineSpans[lineIdx].classList.add("ide-line-flash");
            setTimeout(() => lineSpans[lineIdx].classList.remove("ide-line-flash"), 1200);
        }
    }

    // Toggle agent binding for a breakpoint in a specific script (may not be current)
    async function toggleAgentBindingForScript(scriptKey, lineIdx, agentId) {
        const curKey = currentClassifierKey();
        if (scriptKey === curKey) {
            // Operating on the current active script — use the working copies
            await toggleAgentBinding(lineIdx, agentId);
            return;
        }

        // Operating on a different script — modify the store directly
        const ctx = scriptBreakpointStore.get(scriptKey);
        if (!ctx) return;

        const info = ctx.lineToIp.get(lineIdx);
        if (!info) return;

        let bindings = ctx.bindings.get(lineIdx);
        if (!bindings) {
            bindings = new Set();
            ctx.bindings.set(lineIdx, bindings);
        }

        if (bindings.has(agentId)) {
            bindings.delete(agentId);
            await sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
        } else {
            bindings.add(agentId);
            await sendBreakpointToAgent(agentId, info.bytecodeIp, "set");
        }

        await renderBreakpointPanel();
    }

    // Remove a breakpoint from a specific script (may not be current)
    async function removeBreakpointFromScript(scriptKey, lineIdx) {
        const curKey = currentClassifierKey();
        if (scriptKey === curKey) {
            // Operating on current script — use the working copies
            await toggleBreakpointAtLine(lineIdx);
            return;
        }

        // Operating on a different script — modify the store directly
        const ctx = scriptBreakpointStore.get(scriptKey);
        if (!ctx) return;

        ctx.breakpoints.delete(lineIdx);
        const bindings = ctx.bindings.get(lineIdx);
        if (bindings) {
            const info = ctx.lineToIp.get(lineIdx);
            if (info) {
                for (const agentId of bindings) {
                    sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
                }
            }
            ctx.bindings.delete(lineIdx);
        }

        // Remove from store if empty
        if (ctx.breakpoints.size === 0) {
            scriptBreakpointStore.delete(scriptKey);
        }

        await renderBreakpointPanel();
    }

    // Clear breakpoints for the CURRENT script only (called on source edit)
    async function clearCurrentScriptBreakpoints() {
        // Clear from all bound agents for current breakpoints
        for (const [lineIdx, bindings] of bpAgentBindings) {
            const info = lineToIp.get(lineIdx);
            if (info) {
                for (const agentId of bindings) {
                    sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
                }
            }
        }

        ideBreakpoints.clear();
        bpAgentBindings.clear();
        bpSourceHash = "";

        // Also remove from store
        const key = currentClassifierKey();
        if (key) scriptBreakpointStore.delete(key);

        syncEditorDisplay();
        await renderBreakpointPanel();
    }

    // Clear ALL breakpoints across ALL scripts
    async function clearAllBreakpoints() {
        // Clear from all bound agents in the current working copies
        for (const [lineIdx, bindings] of bpAgentBindings) {
            const info = lineToIp.get(lineIdx);
            if (info) {
                for (const agentId of bindings) {
                    sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
                }
            }
        }

        // Clear from all bound agents in the store
        for (const [key, ctx] of scriptBreakpointStore) {
            for (const [lineIdx, bindings] of ctx.bindings) {
                const info = ctx.lineToIp.get(lineIdx);
                if (info) {
                    for (const agentId of bindings) {
                        sendBreakpointToAgent(agentId, info.bytecodeIp, "clear");
                    }
                }
            }
        }

        // Reset all state
        ideBreakpoints.clear();
        bpAgentBindings.clear();
        bpSourceHash = "";
        scriptBreakpointStore.clear();

        syncEditorDisplay();
        if (bpPanel) bpPanel.hidden = true;
        stopBpAgentPoll();
    }

    // Poll agent list while breakpoints are active
    function startBpAgentPoll() {
        if (bpAgentPollTimer) return;
        bpAgentPollTimer = setInterval(() => {
            if (hasAnyBreakpoints() && isActive) {
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
            if (typeof window.CaosWorkbenchDraft === "string") {
                editorTextarea.value = window.CaosWorkbenchDraft;
                window.CaosWorkbenchDraft = null;
                validationResult = null;
                syncEditorDisplay();
                setMode("evaluate");
                appendOutput("info",
                    "Source moved from Scratchpad for explicit review.");
            }
            refreshScriptorium();
            fetchCommandDictionary(); // pre-fetch for autocomplete and help
            renderReview();
            if (editorTextarea.value.trim()) runValidation(true);
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

    ObservatoryState.subscribe(
        state => [
            state.connection.status,
            state.world.identity && state.world.identity.key,
            state.world.tick,
            state.world.systemTick,
            state.engine.paused,
            state.selection.agent && state.selection.agent.key,
            state.selection.creature && state.selection.creature.key,
            state.selection.script && state.selection.script.key,
            state.recording.active
        ].join("|"),
        () => {
            if (isActive && !confirmDialog.open) renderReview();
        }
    );

    setMode("evaluate");
})();
