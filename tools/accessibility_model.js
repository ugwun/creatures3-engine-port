// accessibility_model.js — pure accessibility preferences and contrast helpers
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AccessibilityModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const DEFAULTS = Object.freeze({
    density: "comfortable",
    reducedMotion: false,
    shortcutsEnabled: true
  });

  const SHORTCUTS = Object.freeze([
    Object.freeze({
      keys: "F1",
      label: "Contextual help for the focused control",
      global: true
    }),
    Object.freeze({
      keys: "Shift+?",
      label: "Keyboard and display settings",
      global: true
    }),
    Object.freeze({
      keys: "Alt+ArrowLeft",
      label: "Return to the previous investigation",
      global: true
    }),
    Object.freeze({
      keys: "Arrow keys",
      label: "Move within navigation, tab lists, maps, and graphs",
      global: false
    }),
    Object.freeze({
      keys: "Enter or Space",
      label: "Open or inspect the focused item",
      global: false
    }),
    Object.freeze({
      keys: "Escape",
      label: "Dismiss the current dialog, drawer, or narrow menu",
      global: false
    })
  ]);

  // Each pair is a semantic foreground on its named background. These values
  // are intentionally duplicated in style.css and protected by unit tests.
  const CONTRAST_PAIRS = Object.freeze([
    Object.freeze({
      name: "body text", foreground: "#0a0a0a", background: "#ffffff",
      target: 7
    }),
    Object.freeze({
      name: "muted text", foreground: "#555555", background: "#ffffff",
      target: 4.5
    }),
    Object.freeze({
      name: "accent text", foreground: "#a33d00", background: "#ffffff",
      target: 4.5
    }),
    Object.freeze({
      name: "success text", foreground: "#12663d", background: "#ffffff",
      target: 4.5
    }),
    Object.freeze({
      name: "warning text", foreground: "#7a4500", background: "#ffffff",
      target: 4.5
    }),
    Object.freeze({
      name: "danger text", foreground: "#a5001a", background: "#ffffff",
      target: 4.5
    }),
    Object.freeze({
      name: "info text", foreground: "#185eaa", background: "#ffffff",
      target: 4.5
    }),
    Object.freeze({
      name: "dark surface text", foreground: "#ffffff", background: "#000000",
      target: 7
    }),
    Object.freeze({
      name: "dark surface accent", foreground: "#ff8a45", background: "#000000",
      target: 4.5
    })
  ]);

  function normalizePreferences(value) {
    const input = value && typeof value === "object" ? value : {};
    return Object.freeze({
      density: input.density === "compact" ? "compact" : DEFAULTS.density,
      reducedMotion: input.reducedMotion === true,
      shortcutsEnabled: input.shortcutsEnabled !== false
    });
  }

  function isEditableTarget(target) {
    if (!target || typeof target !== "object") return false;
    if (target.isContentEditable) return true;
    const tagName = String(target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tagName)) return true;
    if (typeof target.closest === "function") {
      return Boolean(target.closest(
        "input, textarea, select, [contenteditable='true'], [role='textbox']"
      ));
    }
    return false;
  }

  function channel(value) {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  }

  function rgb(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!match) throw new TypeError("Expected a six-digit hexadecimal colour");
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function luminance(hex) {
    const components = rgb(hex).map(channel);
    return 0.2126 * components[0] +
      0.7152 * components[1] +
      0.0722 * components[2];
  }

  function contrastRatio(foreground, background) {
    const first = luminance(foreground);
    const second = luminance(background);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
  }

  return Object.freeze({
    DEFAULTS,
    SHORTCUTS,
    CONTRAST_PAIRS,
    normalizePreferences,
    isEditableTarget,
    luminance,
    contrastRatio
  });
});
