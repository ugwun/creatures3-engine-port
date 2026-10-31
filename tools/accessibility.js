// accessibility.js — shared keyboard, semantics, and display preferences
"use strict";

(() => {
  const Model = window.AccessibilityModel;
  const store = window.ObservatoryState;
  const dialog = document.getElementById("accessibility-dialog");
  const openButton = document.getElementById("btn-accessibility");
  const closeButton = document.getElementById("accessibility-close");
  const density = document.getElementById("accessibility-density");
  const reducedMotion = document.getElementById(
    "accessibility-reduced-motion");
  const shortcuts = document.getElementById("accessibility-shortcuts");
  const shortcutList = document.getElementById("accessibility-shortcut-list");
  const status = document.getElementById("accessibility-status");
  const storageKey = "creatures3.observatory.accessibility.v1";
  let restoreFocus = null;

  function readSaved() {
    try {
      return Model.normalizePreferences(JSON.parse(
        localStorage.getItem(storageKey) || "{}"));
    } catch (_) {
      return Model.normalizePreferences();
    }
  }

  function preferences() {
    const current = store.getState().preferences;
    return Model.normalizePreferences(current);
  }

  function save(value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (_) {
      // The controls still apply for this page when storage is unavailable.
    }
  }

  function dispatchPreferences(value) {
    Object.keys(value).forEach(key => store.dispatch({
      type: "preference/set",
      payload: { key, value: value[key] }
    }));
  }

  function apply(value) {
    const next = Model.normalizePreferences(value);
    document.body.dataset.density = next.density;
    document.body.dataset.reducedMotion = String(next.reducedMotion);
    document.body.dataset.shortcutsEnabled = String(next.shortcutsEnabled);
    density.value = next.density;
    reducedMotion.checked = next.reducedMotion;
    shortcuts.checked = next.shortcutsEnabled;
    return next;
  }

  function updatePreference() {
    const next = Model.normalizePreferences({
      density: density.value,
      reducedMotion: reducedMotion.checked,
      shortcutsEnabled: shortcuts.checked
    });
    dispatchPreferences(next);
    save(next);
    apply(next);
    status.textContent = "Display preferences applied.";
  }

  function open() {
    if (dialog.open) return;
    restoreFocus = document.activeElement;
    dialog.showModal();
    density.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function labelInputs() {
    const labels = {
      search: "Filter log messages",
      "crt-filter-search": "Filter creatures by name",
      "crt-genome-search": "Filter expressed creature genes",
      "ide-search": "Search installed scripts",
      "docs-wiki-search": "Search documentation pages",
      "genetics-file-search": "Search genome files",
      "genetics-genome-search": "Filter genome genes",
      "cross-parent-b-search": "Search genome files for parent B",
      "compare-definition-name": "Comparison definition name",
      "timeline-name": "Timeline recording name",
      "experiment-note": "Experiment observation note",
      "log-annotation": "Log record annotation",
      "console-input": "CAOS console command",
      "dbg-agent-search": "Filter debugger agents",
      "ide-family": "Classifier family",
      "ide-genus": "Classifier genus",
      "ide-species": "Classifier species",
      "ide-event": "Classifier event",
      "ide-editor": "CAOS source editor"
    };
    Object.keys(labels).forEach(id => {
      const element = document.getElementById(id);
      if (element && !element.getAttribute("aria-label") &&
          !element.getAttribute("aria-labelledby")) {
        element.setAttribute("aria-label", labels[id]);
      }
    });
  }

  const tabGroups = [
    {
      list: "#docs-sub-tabs", tabs: ".docs-sub-btn",
      active: "active", value: "docsTab",
      panel(value) {
        return document.getElementById("docs-" + value + "-view");
      }
    },
    {
      list: "#crt-sub-tabs", tabs: ".crt-sub-btn",
      active: "crt-sub-btn--active", value: "subtab",
      panel(value) {
        return document.getElementById("crt-" + value);
      }
    },
    {
      list: "#crt-chem-sub-tabs", tabs: ".crt-chem-tab-btn",
      active: "crt-chem-tab-btn--active", value: "chemTab",
      panel(value) {
        return document.getElementById(
          "crt-chem-" + value + "-view");
      }
    }
  ];

  function setupTabGroup(config, groupIndex) {
    const list = document.querySelector(config.list);
    if (!list) return;
    list.setAttribute("role", "tablist");
    const tabs = Array.from(list.querySelectorAll(config.tabs));

    function sync() {
      tabs.forEach((tab, index) => {
        const selected = tab.classList.contains(config.active);
        const value = tab.dataset[config.value];
        const panel = config.panel(value);
        if (!tab.id) tab.id = "accessible-tab-" + groupIndex + "-" + index;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (panel) {
          if (!panel.id) panel.id = "accessible-panel-" +
            groupIndex + "-" + index;
          tab.setAttribute("aria-controls", panel.id);
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", tab.id);
          panel.tabIndex = 0;
        }
      });
    }

    list.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 :
        event.key === "End" ? tabs.length - 1 :
        event.key === "ArrowRight"
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
      requestAnimationFrame(sync);
    });
    tabs.forEach(tab => tab.addEventListener(
      "click", () => requestAnimationFrame(sync)));
    new MutationObserver(sync).observe(list, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class"]
    });
    sync();
  }

  function setupToggleGroups() {
    [
      ["#crt-filter-genus", ".crt-genus-btn", "crt-genus-btn--active"],
      ["#compare-mode-group", "[data-compare-mode]", "active"]
    ].forEach(([selector, buttons, activeClass]) => {
      const group = document.querySelector(selector);
      if (!group) return;
      group.querySelectorAll(buttons).forEach(button => {
        button.setAttribute("aria-pressed",
          String(button.classList.contains(activeClass)));
        button.addEventListener("click", () => requestAnimationFrame(() => {
          group.querySelectorAll(buttons).forEach(candidate =>
            candidate.setAttribute("aria-pressed", String(
              candidate.classList.contains(activeClass))));
        }));
      });
    });
  }

  function accessibleName(element) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map(id => {
        const label = document.getElementById(id);
        return label ? label.textContent : "";
      }).join(" ").trim();
      if (text) return text;
    }
    const aria = element.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    if (element.id) {
      const explicit = document.querySelector(
        "label[for='" + CSS.escape(element.id) + "']");
      if (explicit && explicit.textContent.trim())
        return explicit.textContent.trim();
    }
    const wrapping = element.closest("label");
    if (wrapping && wrapping.textContent.trim())
      return wrapping.textContent.trim();
    return (element.textContent || element.title || "").trim();
  }

  function isRendered(element) {
    if (element.hidden || element.closest("[hidden]")) return false;
    return getComputedStyle(element).display !== "none";
  }

  function audit(root) {
    const scope = root || document;
    const issues = [];
    scope.querySelectorAll(
      "button, input:not([type='hidden']), select, textarea, [role='button']"
    ).forEach(element => {
      if (isRendered(element) && !accessibleName(element)) {
        issues.push({
          rule: "accessible-name",
          target: element.id || element.className || element.tagName
        });
      }
    });
    scope.querySelectorAll("[role='tab']").forEach(tab => {
      if (!tab.hasAttribute("aria-selected") ||
          !tab.getAttribute("aria-controls")) {
        issues.push({
          rule: "tab-semantics",
          target: tab.id || tab.textContent.trim()
        });
      }
    });
    scope.querySelectorAll("dialog").forEach(item => {
      if (!item.getAttribute("aria-label") &&
          !item.getAttribute("aria-labelledby")) {
        issues.push({
          rule: "dialog-name",
          target: item.id || "dialog"
        });
      }
    });
    return issues;
  }

  shortcutList.innerHTML = Model.SHORTCUTS.map(shortcut =>
    "<li><kbd>" + shortcut.keys + "</kbd><span>" +
    shortcut.label + "</span></li>").join("");

  openButton.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  density.addEventListener("change", updatePreference);
  reducedMotion.addEventListener("change", updatePreference);
  shortcuts.addEventListener("change", updatePreference);
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener("close", () => {
    if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus();
    restoreFocus = null;
  });
  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || !preferences().shortcutsEnabled ||
        Model.isEditableTarget(event.target)) return;
    if (event.key === "?" && event.shiftKey) {
      event.preventDefault();
      open();
      return;
    }
    if (event.key === "ArrowLeft" && event.altKey &&
        window.DevToolsNavigation) {
      event.preventDefault();
      window.DevToolsNavigation.back();
    }
  });

  labelInputs();
  tabGroups.forEach(setupTabGroup);
  setupToggleGroups();
  const saved = readSaved();
  dispatchPreferences(saved);
  apply(saved);
  store.subscribe(
    state => state.preferences,
    value => apply(value)
  );

  window.Accessibility = Object.freeze({
    audit,
    open,
    close,
    preferences
  });
})();
