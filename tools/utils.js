// utils.js — Creatures 3 Developer Tools — Shared Utilities
// Common functions and a lightweight event bus for cross-module communication.
"use strict";

// ── HTML escaping ─────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Event Bus ─────────────────────────────────────────────────────────────
// Simple pub/sub for decoupled communication between tab modules.
//
// Usage:
//   DevToolsEvents.on("tab:activated", (tabName) => { ... });
//   DevToolsEvents.emit("tab:activated", "scripts");
//
// Events:
//   "tab:activated"   — fired with tab name when a tab becomes visible
//   "tab:deactivated" — fired with tab name when a tab is hidden
//
const DevToolsEvents = (() => {
    const listeners = {};

    return {
        on(event, callback) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
        },

        off(event, callback) {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(cb => cb !== callback);
        },

        emit(event, ...args) {
            if (!listeners[event]) return;
            for (const cb of listeners[event]) {
                try { cb(...args); } catch (e) { console.error(`DevToolsEvents error [${event}]:`, e); }
            }
        }
    };
})();
