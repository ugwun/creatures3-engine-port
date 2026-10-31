// observatory_dashboard.js — bounded live landing view for investigative work
"use strict";

(() => {
  const Model = window.ObservatoryDashboardModel;
  const Navigation = window.ObservatoryNavigation;
  if (!Model || !Navigation || !window.DevToolsNavigation) return;

  const POLL_INTERVAL_MS = 5000;
  const dom = {
    root: document.getElementById("observatory-dashboard"),
    refresh: document.getElementById("dashboard-refresh"),
    orientation: document.getElementById("dashboard-orientation"),
    toolbarFreshness: document.getElementById("dashboard-toolbar-freshness"),
    hero: document.getElementById("dashboard-hero-state"),
    heroLabel: document.getElementById("dashboard-hero-label"),
    heroDetail: document.getElementById("dashboard-hero-detail"),
    resume: document.getElementById("dashboard-resume"),
    resumeDetail: document.getElementById("dashboard-resume-detail"),
    resumeOpen: document.getElementById("dashboard-resume-open"),
    sessionCard: document.getElementById("dashboard-session-card"),
    sessionEvidence: document.getElementById("dashboard-session-evidence"),
    sessionSummary: document.getElementById("dashboard-session-summary"),
    sessionFreshness: document.getElementById("dashboard-session-freshness"),
    creaturesEvidence: document.getElementById("dashboard-creatures-evidence"),
    creatureCount: document.getElementById("dashboard-creature-count"),
    selectedCreature: document.getElementById("dashboard-selected-creature"),
    lifeStates: document.getElementById("dashboard-life-states"),
    creaturesFreshness:
      document.getElementById("dashboard-creatures-freshness"),
    experimentCard: document.getElementById("dashboard-experiment-card"),
    recordingBadge: document.getElementById("dashboard-recording-badge"),
    experimentName: document.getElementById("dashboard-experiment-name"),
    experimentDetail: document.getElementById("dashboard-experiment-detail"),
    interventions: document.getElementById("dashboard-interventions"),
    diagnosticsState:
      document.getElementById("dashboard-diagnostics-state"),
    scriptSummary: document.getElementById("dashboard-script-summary"),
    notableLogs: document.getElementById("dashboard-notable-logs"),
    pins: document.getElementById("dashboard-pins")
  };

  let tabActive = true;
  let timer = null;
  let requestSerial = 0;
  let lastRefreshAt = null;
  let resumeTarget = null;
  let input = {
    creatures: [],
    creaturesCapturedAt: null,
    creaturesError: null,
    scripts: [],
    scriptsCapturedAt: null,
    scriptsError: null,
    notableLogs: [],
    pins: []
  };

  function escapeText(value) {
    return value == null ? "—" : String(value);
  }

  function formatTick(value) {
    return value == null ? "—" : Number(value).toLocaleString();
  }

  function formatAge(milliseconds) {
    if (milliseconds == null) return "No successful sample";
    if (milliseconds < 10000)
      return (milliseconds / 1000).toFixed(1) + " s ago";
    if (milliseconds < 60000)
      return Math.floor(milliseconds / 1000) + " s ago";
    return Math.floor(milliseconds / 60000) + " min ago";
  }

  function evidence(element, level) {
    ["observed", "derived", "inferred", "unknown"].forEach(value =>
      element.classList.toggle(
        "evidence-badge--" + value, value === level));
    element.textContent = Model.stateLabel(level);
  }

  function definitionList(element, rows) {
    const fragment = document.createDocumentFragment();
    rows.forEach(([termText, valueText]) => {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = termText;
      value.textContent = escapeText(valueText);
      group.append(term, value);
      fragment.appendChild(group);
    });
    DomPatch.updateChildren(element, fragment);
  }

  function chip(text, state) {
    const value = document.createElement("span");
    value.className = "dashboard-chip";
    if (state) value.dataset.state = state;
    value.textContent = text;
    return value;
  }

  function readPins() {
    if (!window.BiologicalMonitor) return [];
    return BiologicalMonitor.store.pinnedMetrics().map(id => {
      const view = BiologicalMonitor.currentView(id);
      const latest = view && view.samples[view.samples.length - 1];
      return {
        id,
        label: view && view.metric && view.metric.label || id,
        unit: view && view.metric && view.metric.unit || "raw",
        value: view && view.summary.current,
        delta: view && view.summary.previousDelta,
        tick: latest && latest.worldTick,
        stale: !latest || latest.stale,
        evidenceLevel: view && view.metric &&
          view.metric.evidenceLevel || "observed"
      };
    });
  }

  function renderSession(view) {
    const session = view.session;
    dom.hero.dataset.state = session.timeState;
    dom.heroLabel.textContent = session.worldName || (
      view.offline ? "Engine disconnected" : "No world loaded");
    dom.heroDetail.textContent = session.timeLabel;
    dom.sessionCard.dataset.state = session.timeState;
    evidence(dom.sessionEvidence, session.evidenceLevel);
    definitionList(dom.sessionSummary, [
      ["World", session.worldName || "No loaded world"],
      ["Connection", Model.stateLabel(session.connection)],
      ["Simulation", session.paused == null ? "Unknown" :
        session.paused ? "Paused" : "Running"],
      ["Speed", session.speed == null ? "—" : "×" + session.speed],
      ["World tick", formatTick(session.worldTick)],
      ["System tick", formatTick(session.systemTick)]
    ]);
    dom.sessionFreshness.textContent =
      (session.stale ? "Stale · " : "Fresh · ") +
      formatAge(session.ageMs) + " · " + session.source;
    dom.toolbarFreshness.textContent =
      session.worldName
        ? session.worldName + " · tick " + formatTick(session.worldTick) +
          " · " + (session.stale ? "stale" : "fresh")
        : session.timeLabel;
  }

  function renderCreatures(view) {
    const creatures = view.creatures;
    evidence(dom.creaturesEvidence, creatures.evidenceLevel);
    dom.creatureCount.textContent = creatures.evidenceLevel === "unknown"
      ? "—" : String(creatures.count);
    dom.selectedCreature.textContent = creatures.selected
      ? (creatures.selected.missing ? "Historical selection · " : "Selected · ") +
        (creatures.selected.name || "Creature #" + creatures.selected.id) +
        (creatures.selected.lifeState
          ? " · " + creatures.selected.lifeState : "")
      : "No creature selected";
    const lifeStates = Object.entries(creatures.lifeStates)
      .map(([label, count]) => chip(label + " " + count));
    if (!lifeStates.length) {
      lifeStates.push(chip(
        view.offline ? "Population unavailable offline" :
          view.emptyWorld ? "No simulation world" : "No creatures observed"));
    }
    DomPatch.updateChildren(dom.lifeStates, lifeStates);
    dom.creaturesFreshness.textContent = creatures.error
      ? "Stale · " + creatures.error
      : creatures.capturedAt
        ? "Observed " + formatAge(
          Date.now() - new Date(creatures.capturedAt).getTime()) +
          " · " + creatures.source
        : "Waiting for " + creatures.source;
  }

  function renderExperiment(view) {
    const experiment = view.experiment;
    dom.experimentCard.dataset.state =
      experiment.active ? "recording" : experiment.status;
    dom.recordingBadge.textContent =
      experiment.active ? "Recording" : "Not recording";
    dom.recordingBadge.dataset.state =
      experiment.active ? "recording" : "idle";
    dom.experimentName.textContent =
      experiment.name || "No experiment open";
    dom.experimentDetail.textContent = experiment.active
      ? Model.stateLabel(experiment.status) +
        (experiment.sampleIntervalMs == null ? "" :
          " · sample every " + experiment.sampleIntervalMs + " ms")
      : experiment.experimentId
        ? "Draft status · " + Model.stateLabel(experiment.status)
        : "Create a protocol before a deliberate intervention.";
  }

  function navigate(route) {
    if (!route) return;
    const world = ObservatoryState.getState().world.identity;
    DevToolsNavigation.navigate(Object.assign({}, route, {
      worldKey: route.worldKey || world && world.key
    }));
  }

  function renderInterventions(view) {
    dom.interventions.classList.toggle(
      "dashboard-empty", view.interventions.length === 0);
    if (!view.interventions.length) {
      dom.interventions.textContent =
        "No interventions recorded for this world.";
      return;
    }
    DomPatch.replaceChanged(dom.interventions, view.interventions.map(intervention => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dashboard-list-row dashboard-list-row--change";
      const identity = document.createElement("span");
      const label = document.createElement("strong");
      const detail = document.createElement("small");
      label.textContent = intervention.label;
      detail.textContent = "tick " + formatTick(intervention.tick) +
        " · " + (intervention.source || "source unavailable");
      identity.append(label, detail);
      const open = document.createElement("span");
      open.textContent = "Inspect →";
      row.append(identity, open);
      row.addEventListener("click", () => navigate(intervention.route));
      return row;
    }));
  }

  function renderDiagnostics(view) {
    const diagnostics = view.diagnostics;
    const script = diagnostics.scripts;
    DomPatch.updateChildren(dom.scriptSummary, [
      chip(script.count + " active VMs", script.stale ? "stale" : "fresh"),
      chip(script.states.running + " running"),
      chip(script.states.waiting + " waiting"),
      chip(script.states.blocking + " blocking"),
      chip(script.states.paused + " paused")
    ]);
    const issueCount = diagnostics.errors.length + diagnostics.gaps;
    dom.diagnosticsState.textContent = issueCount
      ? issueCount + " issue" + (issueCount === 1 ? "" : "s")
      : script.stale ? "Stale" : "Live";
    dom.diagnosticsState.dataset.state = issueCount
      ? "warning" : script.stale ? "stale" : "live";
    dom.notableLogs.classList.toggle(
      "dashboard-empty", diagnostics.notableLogs.length === 0);
    if (!diagnostics.notableLogs.length) {
      dom.notableLogs.textContent = diagnostics.errors.length
        ? diagnostics.errors.join(" · ")
        : "No notable log records observed in this browser session.";
      return;
    }
    DomPatch.replaceChanged(dom.notableLogs, diagnostics.notableLogs.map(record => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dashboard-list-row";
      const identity = document.createElement("span");
      const label = document.createElement("strong");
      const detail = document.createElement("small");
      label.textContent = record.message || Model.stateLabel(record.kind);
      detail.textContent = Model.stateLabel(record.severity) +
        (record.worldTick == null ? "" :
          " · tick " + formatTick(record.worldTick));
      identity.append(label, detail);
      const open = document.createElement("span");
      open.textContent = "Logs →";
      row.append(identity, open);
      row.addEventListener("click", () => {
        const selections = {
          logRecord: {
            id: record.id,
            message: record.message,
            worldTick: record.worldTick,
            correlationId: record.correlationId
          }
        };
        navigate({
          routeId: "logs", tab: "log", view: "record",
          primary: "logRecord", selections
        });
      });
      return row;
    }));
  }

  function renderPins(view) {
    dom.pins.classList.toggle("dashboard-empty", view.pins.length === 0);
    if (!view.pins.length) {
      dom.pins.textContent =
        "Pin biological signals while observing a creature.";
      return;
    }
    DomPatch.updateChildren(dom.pins, view.pins.map(pin => {
      const row = document.createElement("div");
      row.className = "dashboard-signal-row";
      const identity = document.createElement("span");
      const label = document.createElement("strong");
      const detail = document.createElement("small");
      label.textContent = pin.label;
      detail.textContent = pin.tick == null
        ? "No retained sample"
        : "Observed tick " + formatTick(pin.tick) +
          (pin.stale ? " · stale" : "");
      identity.append(label, detail);
      const value = document.createElement("span");
      value.className = "dashboard-signal-value";
      value.textContent = pin.value == null ? "—" :
        pin.value.toFixed(3) + " " + pin.unit +
        (pin.delta == null ? "" :
          " · Δ " + (pin.delta >= 0 ? "+" : "") + pin.delta.toFixed(3));
      row.append(identity, value);
      return row;
    }));
  }

  function render() {
    input.pins = readPins();
    const view = Model.derive(ObservatoryState.getState(), input, Date.now());
    renderSession(view);
    renderCreatures(view);
    renderExperiment(view);
    renderInterventions(view);
    renderDiagnostics(view);
    renderPins(view);
    resumeTarget = view.resume;
    dom.resume.hidden = !resumeTarget;
    if (resumeTarget) {
      const definition = Navigation.definitionForRoute(resumeTarget);
      dom.resumeDetail.textContent =
        (definition ? definition.label : resumeTarget.tab) +
        " · shared subject and time context will be preserved";
    }
    return view;
  }

  async function request(endpoint, key, force) {
    return ObservatoryState.requestShared(
      "dashboard:" + key,
      async () => {
        const response = await fetch(endpoint);
        const data = await response.json();
        if (!response.ok || data && data.error)
          throw new Error(data.error || "HTTP " + response.status);
        return data;
      },
      { store: false, cacheForMs: force ? 0 : 1000 }
    );
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = tabActive ? setTimeout(() => refresh(false), POLL_INTERVAL_MS) : null;
  }

  async function refresh(force) {
    if (!tabActive) return;
    const serial = ++requestSerial;
    const state = ObservatoryState.getState();
    const worldKey = state.world.identity && state.world.identity.key;
    if (state.connection.status !== "connected" ||
        !worldKey || state.world.identity.name === "Startup") {
      input.creaturesError = state.connection.status === "connected"
        ? "No simulation world is loaded" : "Engine disconnected";
      input.scriptsError = input.creaturesError;
      dom.refresh.disabled = false;
      dom.refresh.textContent = "Refresh overview";
      render();
      schedule();
      return;
    }
    // Only a requested refresh is announced; the periodic one must not flicker.
    if (force) {
      dom.refresh.disabled = true;
      dom.refresh.textContent = "Refreshing…";
    }
    const [creatures, scripts] = await Promise.allSettled([
      request("/api/creatures", "creatures:" + worldKey, force),
      request("/api/scripts", "scripts:" + worldKey, force)
    ]);
    const activeWorld = ObservatoryState.getState().world.identity;
    if (serial !== requestSerial || !tabActive ||
        !activeWorld || activeWorld.key !== worldKey) return;
    const capturedAt = new Date().toISOString();
    if (creatures.status === "fulfilled" &&
        Array.isArray(creatures.value)) {
      input.creatures = creatures.value;
      input.creaturesCapturedAt = capturedAt;
      input.creaturesError = null;
    } else {
      input.creaturesError = creatures.reason
        ? creatures.reason.message : "Creature stream unavailable";
    }
    if (scripts.status === "fulfilled" && Array.isArray(scripts.value)) {
      input.scripts = scripts.value;
      input.scriptsCapturedAt = capturedAt;
      input.scriptsError = null;
    } else {
      input.scriptsError = scripts.reason
        ? scripts.reason.message : "Script stream unavailable";
    }
    lastRefreshAt = Date.now();
    dom.refresh.disabled = false;
    dom.refresh.textContent = "Refresh overview";
    render();
    schedule();
  }

  document.querySelectorAll("[data-dashboard-route]").forEach(button => {
    button.addEventListener("click", () =>
      DevToolsNavigation.navigateToRoute(button.dataset.dashboardRoute));
  });
  document.querySelector("[data-dashboard-action='session']")
    .addEventListener("click", () =>
      document.getElementById("session-summary").click());
  dom.orientation.addEventListener("click", () =>
    DevToolsNavigation.navigateToRoute("guides"));
  dom.refresh.addEventListener("click", () => refresh(true));
  dom.resumeOpen.addEventListener("click", () => navigate(resumeTarget));
  window.addEventListener("biological-monitor:changed", render);
  DevToolsEvents.on("log:record", record => {
    if (!record || !["warning", "error", "critical"].includes(
        record.severity) && record.kind !== "gap") return;
    input.notableLogs = input.notableLogs.concat([record]).slice(-20);
    if (tabActive) render();
  });
  DevToolsEvents.on("tab:activated", tab => {
    if (tab !== "dashboard") return;
    tabActive = true;
    refresh(false);
  });
  DevToolsEvents.on("tab:deactivated", tab => {
    if (tab !== "dashboard") return;
    tabActive = false;
    requestSerial += 1;
    if (timer) clearTimeout(timer);
    timer = null;
  });
  ObservatoryState.subscribe(
    state => ({
      connection: state.connection,
      world: state.world,
      engine: state.engine,
      selection: state.selection,
      experiment: state.experiment,
      recording: state.recording,
      interventions: state.interventions,
      navigation: state.navigation,
      samples: state.samples
    }),
    (next, previous) => {
      const nextWorld = next.world.identity && next.world.identity.key;
      const previousWorld = previous.world.identity &&
        previous.world.identity.key;
      if (nextWorld !== previousWorld) {
        input.creatures = [];
        input.creaturesCapturedAt = null;
        input.scripts = [];
        input.scriptsCapturedAt = null;
        input.notableLogs = [];
      }
      if (tabActive) render();
    },
    (left, right) =>
      left.connection === right.connection &&
      left.world === right.world &&
      left.engine === right.engine &&
      left.selection === right.selection &&
      left.experiment === right.experiment &&
      left.recording === right.recording &&
      left.interventions === right.interventions &&
      left.navigation === right.navigation &&
      left.samples === right.samples
  );
  DevToolsNavigation.registerWorkspace("dashboard", {
    capture() {
      return { scrollTop: dom.root.scrollTop, refreshedAt: lastRefreshAt };
    },
    restore(saved) {
      if (!saved) return;
      requestAnimationFrame(() => {
        dom.root.scrollTop = Number(saved.scrollTop) || 0;
      });
    },
    open() { render(); }
  });

  render();
  refresh(false);
  window.ObservatoryDashboard = Object.freeze({
    render,
    refresh,
    getSnapshot: () => Model.derive(
      ObservatoryState.getState(), input, Date.now()),
    isActive: () => tabActive
  });
})();
