// contextual_help.js — accessible, context-preserving help drawer
"use strict";

(() => {
  const Model = window.ContextualHelpModel;
  if (!Model) return;

  const dom = {
    open: document.getElementById("btn-context-help"),
    evidence: document.getElementById("btn-evidence-help"),
    drawer: document.getElementById("context-help-drawer"),
    scrim: document.getElementById("context-help-scrim"),
    close: document.getElementById("context-help-close"),
    title: document.getElementById("context-help-title"),
    activity: document.getElementById("context-help-activity"),
    evidenceLevel: document.getElementById("context-help-evidence"),
    summary: document.getElementById("context-help-summary"),
    source: document.getElementById("context-help-source"),
    cadence: document.getElementById("context-help-cadence"),
    caution: document.getElementById("context-help-caution"),
    shortcutSection:
      document.getElementById("context-help-shortcut-section"),
    shortcut: document.getElementById("context-help-shortcut"),
    identifiers: document.getElementById("context-help-identifiers"),
    noIdentifiers:
      document.getElementById("context-help-no-identifiers"),
    terms: document.getElementById("context-help-terms"),
    guide: document.getElementById("context-help-guide"),
    reference: document.getElementById("context-help-reference"),
    architecture:
      document.getElementById("context-help-architecture"),
    status: document.getElementById("context-help-status")
  };

  let currentHelpId = null;
  let lastContextTarget = null;
  let returnFocus = null;

  function routeHelpId() {
    const route = window.DevToolsNavigation &&
      DevToolsNavigation.getCurrentRoute();
    return "route." + (route && route.routeId || "dashboard");
  }

  function targetWithHelp(element) {
    return element && element.closest
      ? element.closest("[data-help-id]") : null;
  }

  function helpIdForElement(element) {
    const target = targetWithHelp(element);
    return target && target.dataset.helpId || null;
  }

  function applyShortcut(element) {
    if (!element.dataset.helpId || !Model.get(element.dataset.helpId)) return;
    const shortcuts = (element.getAttribute("aria-keyshortcuts") || "")
      .split(/\s+/).filter(Boolean);
    if (!shortcuts.includes("F1")) shortcuts.push("F1");
    element.setAttribute("aria-keyshortcuts", shortcuts.join(" "));
  }

  function isVisibleContextTarget(element) {
    const target = targetWithHelp(element);
    return Boolean(target &&
      target.isConnected &&
      !target.closest("[hidden], [aria-hidden='true']") &&
      target.getClientRects().length);
  }

  function applyTargets(root) {
    const explicit = [];
    if (root.matches && root.matches("[data-help-id]")) explicit.push(root);
    if (root.querySelectorAll) {
      explicit.push(...Array.from(
        root.querySelectorAll("[data-help-id]")));
    }
    explicit.forEach(applyShortcut);

    Model.HELP_TARGETS.forEach(target => {
      let elements = [];
      try {
        if (root.matches && root.matches(target.selector)) elements.push(root);
        if (root.querySelectorAll)
          elements = elements.concat(
            Array.from(root.querySelectorAll(target.selector)));
      } catch (_) {
        return;
      }
      elements.forEach(element => {
        if (!element.dataset.helpId) element.dataset.helpId = target.helpId;
        applyShortcut(element);
      });
    });
  }

  function definition(helpId) {
    return Model.get(helpId) || Model.forRoute(
      String(helpId || "").replace(/^route\./, "")) ||
      Model.forRoute("dashboard");
  }

  function text(element, value) {
    element.textContent = value == null ? "Unknown" : String(value);
  }

  function renderIdentifiers() {
    const state = ObservatoryState.getState();
    const route = window.DevToolsNavigation
      ? DevToolsNavigation.getCurrentRoute() : null;
    const identifiers = Model.contextIdentifiers(state, route);
    dom.identifiers.replaceChildren();
    identifiers.forEach(identifier => {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = identifier.label;
      value.textContent = identifier.value;
      group.append(term, value);
      dom.identifiers.appendChild(group);
    });
    dom.identifiers.hidden = identifiers.length === 0;
    dom.noIdentifiers.hidden = identifiers.length !== 0;
  }

  function render(helpId) {
    const item = definition(helpId);
    if (!item) return false;
    currentHelpId = item.id;
    text(dom.title, item.title);
    text(dom.summary, item.summary);
    text(dom.activity,
      Model.ACTIVITY_LABELS[item.activity] || item.activity);
    dom.activity.dataset.activity = item.activity;
    text(dom.evidenceLevel,
      Model.EVIDENCE_LABELS[item.evidence.level] ||
        item.evidence.level);
    dom.evidenceLevel.dataset.evidence = item.evidence.level;
    text(dom.source, item.evidence.source);
    text(dom.cadence, item.evidence.cadence);
    text(dom.caution, item.caution);
    dom.shortcutSection.hidden = !item.shortcut;
    text(dom.shortcut, item.shortcut || "");
    dom.terms.replaceChildren();
    item.terms.forEach(term => {
      const chip = document.createElement("span");
      chip.textContent = term;
      dom.terms.appendChild(chip);
    });
    renderIdentifiers();
    dom.guide.hidden = !item.guide;
    dom.guide.textContent = item.guide && item.guide.label ||
      "Open task guide";
    dom.reference.hidden = !item.reference;
    dom.reference.textContent = item.reference &&
      item.reference.label || "Open reference";
    dom.architecture.hidden = !window.ArchitectureModel;
    dom.status.textContent = item.title + " contextual help loaded.";
    return true;
  }

  function open(helpId, trigger) {
    if (!render(helpId || routeHelpId())) return false;
    returnFocus = trigger || document.activeElement;
    dom.drawer.hidden = false;
    dom.scrim.hidden = false;
    document.body.classList.add("context-help-open");
    dom.open.setAttribute("aria-expanded", "true");
    dom.evidence.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => dom.close.focus());
    return true;
  }

  function openForElement(element) {
    const helpId = helpIdForElement(element) ||
      (isVisibleContextTarget(lastContextTarget)
        ? helpIdForElement(lastContextTarget) : null) ||
      routeHelpId();
    return open(helpId, element);
  }

  function close(options) {
    if (dom.drawer.hidden) return;
    dom.drawer.hidden = true;
    dom.scrim.hidden = true;
    document.body.classList.remove("context-help-open");
    dom.open.setAttribute("aria-expanded", "false");
    dom.evidence.setAttribute("aria-expanded", "false");
    const focus = returnFocus;
    returnFocus = null;
    if (!options || options.restoreFocus !== false) {
      if (focus && focus.isConnected && typeof focus.focus === "function")
        focus.focus();
    }
  }

  function follow(target) {
    const item = definition(currentHelpId);
    const destination = item && item[target];
    if (!destination || !window.DevToolsNavigation) return;
    const route = Model.documentationRoute(
      destination,
      ObservatoryState.getState(),
      DevToolsNavigation.getCurrentRoute()
    );
    close({ restoreFocus: false });
    if (route) DevToolsNavigation.navigate(route);
  }

  function traceArchitecture() {
    if (!window.ArchitectureModel ||
        !window.ObservatoryNavigation ||
        !window.DevToolsNavigation) return;
    const state = ObservatoryState.getState();
    const currentRoute = DevToolsNavigation.getCurrentRoute();
    const mapping = ArchitectureModel.ROUTE_CONTEXT[
      currentRoute.routeId] || {};
    let trace = mapping.pathId || null;
    if (state.selection && state.selection.chemical &&
        ["creatures", "timeline", "compare", "chemicals"]
          .includes(currentRoute.routeId))
      trace = "creature.chemical";
    const route = ObservatoryNavigation.routeForDefinition(
      "architecture", state, currentRoute);
    if (!route) return;
    route.trace = trace;
    close({ restoreFocus: false });
    DevToolsNavigation.navigate(route);
  }

  applyTargets(document);
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) applyTargets(node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("focusin", event => {
    const target = targetWithHelp(event.target);
    if (target) lastContextTarget = target;
  });
  document.addEventListener("pointerdown", event => {
    const target = targetWithHelp(event.target);
    if (target) lastContextTarget = target;
    if (!dom.drawer.hidden &&
        !dom.drawer.contains(event.target) &&
        !dom.open.contains(event.target) &&
        !dom.evidence.contains(event.target)) {
      close();
    }
  }, { passive: true });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dom.drawer.hidden) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "F1" || event.defaultPrevented) return;
    const preferences = ObservatoryState.getState().preferences;
    if (preferences && preferences.shortcutsEnabled === false) return;
    if (window.AccessibilityModel &&
        AccessibilityModel.isEditableTarget(event.target)) return;
    if (openForElement(event.target)) event.preventDefault();
  });

  dom.open.addEventListener("click", event =>
    openForElement(event.currentTarget));
  dom.evidence.addEventListener("click", event =>
    open("concept.evidence-levels", event.currentTarget));
  dom.close.addEventListener("click", () => close());
  dom.scrim.addEventListener("click", () => close());
  dom.guide.addEventListener("click", () => follow("guide"));
  dom.reference.addEventListener("click", () => follow("reference"));
  dom.architecture.addEventListener("click", traceArchitecture);

  ObservatoryState.subscribe(
    state => ({
      world: state.world,
      selection: state.selection,
      experiment: state.experiment
    }),
    () => {
      if (!dom.drawer.hidden) renderIdentifiers();
    },
    (left, right) =>
      left.world === right.world &&
      left.selection === right.selection &&
      left.experiment === right.experiment
  );
  if (window.DevToolsNavigation) {
    DevToolsNavigation.subscribe(() => {
      if (!dom.drawer.hidden) renderIdentifiers();
    });
  }

  window.ContextualHelp = Object.freeze({
    open,
    openForElement,
    close,
    render,
    resolve: helpIdForElement,
    getCurrentHelpId: () => currentHelpId,
    isOpen: () => !dom.drawer.hidden
  });
})();
