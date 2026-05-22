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
// Sourced from engine/Agents/AgentConstants.h/.cpp and engine/Message.h.
window.CAOS_EVENT_NAMES = {
    // Core agent events (0–14)
    0: "Deactivate",
    1: "Push (Activate 1)",
    2: "Pull (Activate 2)",
    3: "Hit",
    4: "Pickup",
    5: "Drop",
    6: "Collision",
    7: "Bump",
    9: "Timer",
    12: "Eat",
    13: "Start Hold Hands",
    14: "Stop Hold Hands",
    // Creature decision scripts — on agents (16–31)
    16: "Quiescent on Agents",
    17: "Activate 1 on Agents",
    18: "Activate 2 on Agents",
    19: "Deactivate on Agents",
    20: "Approach on Agents",
    21: "Retreat on Agents",
    22: "Pickup on Agents",
    23: "Drop on Agents",
    24: "Need on Agents",
    25: "Rest on Agents",
    26: "West on Agents",
    27: "East on Agents",
    28: "Eat on Agents",
    29: "Hit on Agents",
    // Creature decision scripts — on creatures (32–47)
    32: "Quiescent on Creatures",
    33: "Activate 1 on Creatures",
    34: "Activate 2 on Creatures",
    35: "Deactivate on Creatures",
    36: "Approach on Creatures",
    37: "Retreat on Creatures",
    38: "Pickup on Creatures",
    39: "Drop on Creatures",
    40: "Need on Creatures",
    41: "Rest on Creatures",
    42: "West on Creatures",
    43: "East on Creatures",
    44: "Eat on Creatures",
    45: "Hit on Creatures",
    // Involuntary actions (64–72)
    64: "Flinch",
    65: "Lay Egg",
    66: "Sneeze",
    67: "Cough",
    68: "Shiver",
    69: "Sleep",
    70: "Fainting",
    72: "Die",
    // Raw input events (73–79)
    73: "Raw Key Down",
    74: "Raw Key Up",
    75: "Raw Mouse Move",
    76: "Raw Mouse Down",
    77: "Raw Mouse Up",
    78: "Raw Mouse Wheel",
    79: "Raw Translated Char",
    // UI events (90–100)
    92: "UI Mouse Down",
    // Pointer events (101–118)
    101: "Pointer Activate 1",
    102: "Pointer Activate 2",
    103: "Pointer Deactivate",
    104: "Pointer Pickup",
    105: "Pointer Drop",
    110: "Pointer Port Select",
    111: "Pointer Port Connect",
    112: "Pointer Port Disconnect",
    113: "Pointer Port Cancel",
    114: "Pointer Port Error",
    115: "Pointer Hold Hands",
    116: "Pointer Clicked Background",
    117: "Pointer Action Dispatch",
    118: "Connection Break",
    // System events (120–128)
    120: "Selected Creature Changed",
    121: "Vehicle Pickup",
    122: "Vehicle Drop",
    123: "Window Resized",
    124: "Got Carried Agent",
    125: "Lost Carried Agent",
    126: "Make Speech Bubble",
    127: "Life Event",
    128: "World Loaded",
    // Special events
    200: "Mate",
    255: "Agent Exception",
};
