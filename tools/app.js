// app.js — Creatures 3 Developer Tools shell and shared navigation
"use strict";

(() => {

// ── Boot ─────────────────────────────────────────────────────────────────
const sessionController = SessionStatus.mount({
    store: ObservatoryState
});

sessionController.start();

// ── Declarative navigation and workspace switching ──────────────────────
let activeTab = "dashboard";

const observatoryNavigation = ObservatoryNavigation.createNavigationService({
    store: ObservatoryState,
    window,
    activeTab
});
window.DevToolsNavigation = observatoryNavigation;

function activateTab(newTab) {
    if (!document.getElementById(`tab-${newTab}`)) return false;
    if (newTab === activeTab) {
        observatoryNavigation.setActiveTab(newTab);
        return true;
    }

    const oldPanel = document.getElementById(`tab-${activeTab}`);
    const focusWasInsidePanel = oldPanel &&
        oldPanel.contains(document.activeElement);
    DevToolsEvents.emit("tab:deactivated", activeTab);
    document.querySelectorAll(".tab-btn").forEach(button =>
        button.classList.remove("tab-btn--active")
    );
    document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.hidden = true;
        panel.classList.remove("tab-panel--active");
    });
    document.querySelectorAll(".tab-controls").forEach(controls => {
        controls.hidden = true;
    });

    const panel = document.getElementById(`tab-${newTab}`);
    if (panel) {
        panel.hidden = false;
        panel.classList.add("tab-panel--active");
    }
    const controls = document.getElementById(`${newTab}-controls`);
    if (controls) controls.hidden = false;
    document.body.classList.toggle("no-toolbar", newTab === "genetics");

    activeTab = newTab;
    observatoryNavigation.setActiveTab(newTab);
    const definition = ObservatoryNavigation.definitionForRoute(
        observatoryNavigation.getCurrentRoute());
    const routeLabel = definition ? definition.label : newTab;
    const skip = document.getElementById("skip-to-workspace");
    const announcer = document.getElementById("route-announcer");
    if (skip) skip.href = "#tab-" + newTab;
    if (announcer) announcer.textContent =
        routeLabel + " workspace opened.";
    if (focusWasInsidePanel && panel) {
        panel.tabIndex = -1;
        panel.focus({ preventScroll: true });
    }
    DevToolsEvents.emit("tab:activated", newTab);
    return true;
}

observatoryNavigation.setTabActivator(activateTab);

const primaryNavigation = document.getElementById("primary-navigation");
const navigationCapabilityStatus =
    document.getElementById("navigation-capability-status");
let announcedRouteId = null;

function renderPrimaryNavigation() {
    const fragment = document.createDocumentFragment();
    ObservatoryNavigation.NAVIGATION_GROUPS.forEach(group => {
        const section = document.createElement("section");
        section.className = "nav-group";
        section.dataset.navGroup = group.id;
        const heading = document.createElement("h2");
        heading.className = "nav-group__heading";
        heading.textContent = group.label;
        heading.title = group.description;
        section.appendChild(heading);
        ObservatoryNavigation.ROUTE_DEFINITIONS
            .filter(route => route.group === group.id)
            .forEach(route => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "tab-btn nav-route-button";
                button.dataset.routeId = route.id;
                button.dataset.tab = route.tab;
                button.dataset.activity = route.activity;
                button.dataset.helpId = "route." + route.id;
                button.title = route.description;
                const label = document.createElement("span");
                label.className = "nav-route-button__label";
                label.textContent = route.label;
                button.appendChild(label);
                if (route.activity === "reviewed-change") {
                    const risk = document.createElement("span");
                    risk.className = "nav-route-button__risk";
                    risk.textContent = "Reviewed change";
                    button.appendChild(risk);
                }
                button.addEventListener("click", () =>
                    observatoryNavigation.navigateToRoute(route.id)
                );
                button.addEventListener("focus", () => {
                    const availability =
                        ObservatoryNavigation.routeAvailability(
                            route, ObservatoryState.getState());
                    navigationCapabilityStatus.textContent =
                        availability.reason;
                });
                section.appendChild(button);
            });
        fragment.appendChild(section);
    });
    primaryNavigation.replaceChildren(fragment);
}

function updatePrimaryNavigation() {
    const route = observatoryNavigation.getCurrentRoute();
    const definition = ObservatoryNavigation.definitionForRoute(route);
    const activeId = definition && definition.id;
    document.querySelectorAll(".nav-route-button").forEach(button => {
        const selected = button.dataset.routeId === activeId;
        const routeDefinition = ObservatoryNavigation.routeDefinition(
            button.dataset.routeId);
        const availability = ObservatoryNavigation.routeAvailability(
            routeDefinition, ObservatoryState.getState());
        button.classList.toggle("tab-btn--active", selected);
        button.classList.toggle(
            "nav-route-button--unavailable", !availability.available);
        button.setAttribute("aria-current", selected ? "page" : "false");
        button.setAttribute(
            "aria-description",
            routeDefinition.description + " " + availability.reason
        );
        button.dataset.available = String(availability.available);
    });
    const activity = definition ? definition.activity : "observe";
    document.body.dataset.workspaceActivity = activity;
    navigationCapabilityStatus.textContent = definition
        ? ObservatoryNavigation.routeAvailability(
            definition, ObservatoryState.getState()).reason
        : "";
    if (definition && definition.id !== announcedRouteId) {
        announcedRouteId = definition.id;
        const announcer = document.getElementById("route-announcer");
        const skip = document.getElementById("skip-to-workspace");
        if (announcer) announcer.textContent =
            definition.label + " workspace opened.";
        if (skip) skip.href = "#tab-" + definition.tab;
        const focus = document.activeElement;
        if (focus === document.body ||
            focus && focus.closest && focus.closest("[hidden]")) {
            const panel = document.getElementById("tab-" + definition.tab);
            if (panel) {
                panel.tabIndex = -1;
                panel.focus({ preventScroll: true });
            }
        }
    }
}

primaryNavigation.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Escape"]
        .includes(event.key)) return;
    if (event.key === "Escape") {
        if (window.matchMedia("(max-width: 760px)").matches) {
            document.body.classList.add("nav-collapsed");
            document.getElementById("btn-nav-toggle").focus();
            event.preventDefault();
        }
        return;
    }
    const buttons = Array.from(
        primaryNavigation.querySelectorAll(".nav-route-button"));
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 :
        event.key === "End" ? buttons.length - 1 :
        event.key === "ArrowDown"
            ? (current + 1) % buttons.length
            : (current - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
});

renderPrimaryNavigation();

ObservatoryContextStrip.mount({
    store: ObservatoryState,
    navigation: observatoryNavigation
});
observatoryNavigation.start();
observatoryNavigation.subscribe(updatePrimaryNavigation);
ObservatoryState.subscribe(
    state => ({
        connection: state.connection,
        world: state.world,
        creature: state.selection.creature,
        recording: state.recording
    }),
    updatePrimaryNavigation,
    (left, right) =>
        left.connection === right.connection &&
        left.world === right.world &&
        left.creature === right.creature &&
        left.recording === right.recording
);
updatePrimaryNavigation();

// ── Engine Pause/Play controls ───────────────────────────────────────────
const btnEnginePlay = document.getElementById("btn-engine-play");
const btnEnginePause = document.getElementById("btn-engine-pause");

function setEnginePausedUI(paused) {
    ObservatoryState.dispatch({
        type: "engine/pause",
        payload: { paused }
    });
    renderEnginePausedUI(paused);
}

function renderEnginePausedUI(paused) {
    if (paused) {
        btnEnginePlay.classList.remove("engine-ctrl--active");
        btnEnginePause.classList.add("engine-ctrl--active");
    } else {
        btnEnginePlay.classList.add("engine-ctrl--active");
        btnEnginePause.classList.remove("engine-ctrl--active");
    }
    btnEnginePlay.setAttribute("aria-pressed", paused ? "false" : "true");
    btnEnginePause.setAttribute("aria-pressed", paused ? "true" : "false");
}

btnEnginePlay.addEventListener("click", () => {
    fetch("/api/resume", { method: "POST" })
        .then(response => response.json())
        .then(data => {
            if (data.ok) {
                setEnginePausedUI(data.paused);
                sessionController.refresh(true).catch(() => {});
            }
        })
        .catch(() => {});
});

btnEnginePause.addEventListener("click", () => {
    fetch("/api/pause", { method: "POST" })
        .then(response => response.json())
        .then(data => {
            if (data.ok) {
                setEnginePausedUI(data.paused);
                sessionController.refresh(true).catch(() => {});
            }
        })
        .catch(() => {});
});

ObservatoryState.subscribe(
    state => state.engine.paused,
    value => {
        if (value != null) renderEnginePausedUI(value);
    }
);

setTimeout(() => DevToolsEvents.emit("tab:activated", activeTab), 100);

// ── Nav Sidebar Toggle ───────────────────────────────────────────────────
const btnNavToggle = document.getElementById("btn-nav-toggle");
if (btnNavToggle) {
    btnNavToggle.setAttribute("aria-controls", "left-nav");
    btnNavToggle.setAttribute("aria-expanded", "true");
    btnNavToggle.setAttribute("aria-label", "Close workspace navigation");
    btnNavToggle.addEventListener("click", () => {
        document.body.classList.toggle("nav-collapsed");
        const expanded = !document.body.classList.contains("nav-collapsed");
        btnNavToggle.setAttribute("aria-expanded", String(expanded));
        btnNavToggle.setAttribute("aria-label",
            (expanded ? "Close" : "Open") + " workspace navigation");
        if (expanded) {
            const active = document.querySelector(
                ".nav-route-button.tab-btn--active");
            if (active) active.focus();
        }
    });
    if (window.matchMedia("(max-width: 760px)").matches) {
        document.body.classList.add("nav-collapsed");
        btnNavToggle.setAttribute("aria-expanded", "false");
        btnNavToggle.setAttribute(
            "aria-label", "Open workspace navigation");
    }
}

})();
