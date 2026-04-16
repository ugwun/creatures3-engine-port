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

// ── DOM Helper ────────────────────────────────────────────────────────────
// Lightweight utility for building DOM elements to replace string-concatenation
window.el = function(tag, props, children) {
    const element = document.createElement(tag);
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (key === 'className' || key === 'class') {
                element.className = value;
            } else if (key === 'dataset') {
                for (const [dKey, dVal] of Object.entries(value)) {
                    element.dataset[dKey] = dVal;
                }
            } else if (key === 'style') {
                if (typeof value === 'string') {
                    element.style.cssText = value;
                } else {
                    Object.assign(element.style, value);
                }
            } else if (key === 'events') {
                for (const [evt, handler] of Object.entries(value)) {
                    element.addEventListener(evt, handler);
                }
            } else {
                element[key] = value; // innerHTML, textContent, id, etc.
            }
        }
    }
    if (children) {
        if (!Array.isArray(children)) children = [children];
        for (const child of children) {
            if (child == null || child === false) continue;
            if (typeof child === 'string' || typeof child === 'number') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        }
    }
    return element;
};

// ── Event Bus ─────────────────────────────────────────────────────────────
// Simple pub/sub for decoupled communication between tab modules.
//
// Usage:
//   DevToolsEvents.on("tab:activated", (tabName) => { ... });
//   DevToolsEvents.emit("tab:activated", "scripts");
//
// Events:
//   "tab:activated"      — fired with tab name when a tab becomes visible
//   "tab:deactivated"    — fired with tab name when a tab is hidden
//   "creature:selected"  — fired with agentId when a creature is selected in the list
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

// ── CAOS Event Names ──────────────────────────────────────────────────────
// Standard event numbers used in Creatures 3 / Docking Station.
// Merged from existing codebase and standard CAOS community references.
window.CAOS_EVENT_NAMES = {
    0: "Deactivate",
    1: "Push",
    2: "Pull",
    3: "Hit",
    4: "Pickup",
    5: "Drop",
    6: "Collision",
    7: "Bump",
    8: "Exception",
    9: "Timer",
    10: "Constructor",
    11: "Destructor",
    12: "Eat",
    13: "Hold Hands / Emit Track",
    14: "UI Mouse Enter",
    15: "UI Mouse Leave",
    16: "UI Mouse Down",
    17: "UI Mouse Up",
    72: "Agent Exception",
    73: "Impending Death",
    92: "Selected Creature Changed",
    99: "Pointer Activate (1)",
    100: "Pointer Activate (2)",
    101: "Pointer Deactivate",
    102: "Pointer Pickup",
    103: "Pointer Drop",
    114: "System Event",
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
