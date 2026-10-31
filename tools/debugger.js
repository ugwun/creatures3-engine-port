// debugger.js — Creatures 3 Developer Tools — CAOS Evaluate-now Scratchpad
// Fast path for compile-checked, read-only snippets in a fresh ownerless VM.
"use strict";

(() => {
    const output = document.getElementById("console-output");
    const input = document.getElementById("console-input");
    const btnClear = document.getElementById("btn-console-clear");

    let history = [];
    let histIdx = -1;

    if (!input || !output) return;

    // ── Execute CAOS ──────────────────────────────────────────────────────
    async function executeCAOS(code) {
        // Show command in output
        appendEntry("command", code);

        try {
            const validationResponse = await fetch("/api/caos/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "evaluate", source: code })
            });
            const validation = await validationResponse.json();
            if (!validation.ok) {
                const location = validation.location &&
                    validation.location.line
                    ? ` (line ${validation.location.line}, column ` +
                        `${validation.location.column})`
                    : "";
                appendEntry("error",
                    (validation.error || "Compilation failed") + location);
                return;
            }
            const context = CaosWorkbenchModel.contextSnapshot(
                ObservatoryState.getState(), null,
                window.ExperimentWorkspace &&
                    window.ExperimentWorkspace.isRecording());
            const review = CaosWorkbenchModel.plan({
                mode: "evaluate",
                context,
                source: code,
                validation
            });
            if (review.risk.requiresAcknowledgement) {
                appendEntry("error",
                    "Workbench review required: " +
                    review.risk.explanation);
                appendWorkbenchLink(code);
                return;
            }
            if (!review.canApply) {
                appendEntry("error", review.errors[0] ||
                    "Evaluation context is not ready.");
                return;
            }
            const operation = CaosWorkbenchModel.apiRequest(review);
            const resp = await fetch(operation.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(operation.body)
            });
            const data = await resp.json();

            if (data.ok) {
                if (data.output && data.output.trim()) {
                    appendEntry("result", data.output +
                        ` · ticks ${data.worldTickStart}→${data.worldTickEnd}`);
                } else {
                    appendEntry("result", "(ok — no output) · " +
                        `ticks ${data.worldTickStart}→${data.worldTickEnd}`);
                }
            } else {
                appendEntry("error", data.error || "Unknown error");
            }
        } catch (e) {
            appendEntry("error", `Network error: ${e.message}`);
        }
    }

    function appendWorkbenchLink(code) {
        const row = document.createElement("div");
        row.className = "console-entry console-result";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "console-workbench-link";
        button.textContent = "Review this source in CAOS Workbench";
        button.addEventListener("click", () => {
            window.CaosWorkbenchDraft = code;
            const world = ObservatoryState.getState().world.identity;
            window.DevToolsNavigation.navigate({
                tab: "ide",
                worldKey: world && world.key
            });
        });
        row.appendChild(button);
        output.appendChild(row);
        output.scrollTop = output.scrollHeight;
    }

    // ── Output rendering ──────────────────────────────────────────────────
    function appendEntry(type, text) {
        const el = document.createElement("div");
        el.className = `console-entry console-${type}`;

        if (type === "command") {
            el.innerHTML = `<span class="console-prompt-echo">&gt;</span> <span class="console-code">${escHtml(text)}</span>`;
        } else if (type === "error") {
            el.innerHTML = `<span class="console-error-icon">✗</span> <span class="console-error-text">${escHtml(text)}</span>`;
        } else {
            el.innerHTML = `<span class="console-result-text">${escHtml(text)}</span>`;
        }

        output.appendChild(el);
        output.scrollTop = output.scrollHeight;
    }

    // escHtml is provided by utils.js

    // ── Input handling ────────────────────────────────────────────────────
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const code = input.value.trim();
            if (!code) return;

            // Add to history
            history.push(code);
            if (history.length > 200) history.shift();
            histIdx = -1;

            input.value = "";
            input.style.height = "auto";

            executeCAOS(code);
        } else if (e.key === "ArrowUp" && input.selectionStart === 0) {
            e.preventDefault();
            if (history.length === 0) return;
            if (histIdx === -1) histIdx = history.length;
            histIdx = Math.max(0, histIdx - 1);
            input.value = history[histIdx];
        } else if (e.key === "ArrowDown" && input.selectionStart === input.value.length) {
            e.preventDefault();
            if (histIdx === -1) return;
            histIdx++;
            if (histIdx >= history.length) {
                histIdx = -1;
                input.value = "";
            } else {
                input.value = history[histIdx];
            }
        }
    });

    // Auto-resize textarea
    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    });

    // Clear button
    if (btnClear) {
        btnClear.addEventListener("click", () => {
            // Keep the welcome message, clear everything else
            while (output.children.length > 1) {
                output.removeChild(output.lastChild);
            }
        });
    }
})();
