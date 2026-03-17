// debugger.js — Creatures 3 Developer Tools — CAOS Console Tab
// Interactive REPL for sending CAOS commands to the engine.
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
            const resp = await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caos: code })
            });
            const data = await resp.json();

            if (data.ok) {
                if (data.output && data.output.trim()) {
                    appendEntry("result", data.output);
                } else {
                    appendEntry("result", "(ok — no output)");
                }
            } else {
                appendEntry("error", data.error || "Unknown error");
            }
        } catch (e) {
            appendEntry("error", `Network error: ${e.message}`);
        }
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

    function escHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

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
