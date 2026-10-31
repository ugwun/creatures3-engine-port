// observatory_dashboard_model.js — pure summaries for the Observatory landing view
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ObservatoryDashboardModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const SESSION_SAMPLE_KEY = "session:status";

  function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function stateLabel(value) {
    if (value == null || String(value).trim() === "") return "Unknown";
    return String(value).replace(/[_-]+/g, " ").replace(/\b\w/g,
      character => character.toUpperCase());
  }

  function sampleAge(sample, now) {
    if (!sample || !sample.capturedAt) return null;
    const captured = new Date(sample.capturedAt).getTime();
    const current = now == null ? Date.now() : new Date(now).getTime();
    return Number.isFinite(captured) && Number.isFinite(current)
      ? Math.max(0, current - captured) : null;
  }

  function sessionSummary(state, now) {
    const source = state || {};
    const world = source.world || {};
    const identity = world.identity || null;
    const connection = source.connection || {};
    const sample = source.samples && source.samples.current
      ? source.samples.current[SESSION_SAMPLE_KEY] || null : null;
    const ageMs = sampleAge(sample, now);
    const staleAfterMs = sample
      ? Math.max(3000, Number(sample.sampleIntervalMs || 0) * 2)
      : 3000;
    const stale = connection.status !== "connected" || !sample ||
      Boolean(sample.stale) || ageMs == null || ageMs > staleAfterMs;
    const history = source.samples && source.samples.history &&
      source.samples.history[SESSION_SAMPLE_KEY] || [];
    const observations = history
      .filter(item => item && item.value && item.value.worldTick != null)
      .slice(-2);
    let timeState = "waiting";
    let timeLabel = "Waiting for two world-tick observations";
    if (connection.status !== "connected") {
      timeState = "disconnected";
      timeLabel = "Engine disconnected; tick movement is unknown";
    } else if (!identity || identity.name === "Startup") {
      timeState = "no-world";
      timeLabel = "No simulation world is loaded";
    } else if (source.engine && source.engine.paused === true) {
      timeState = "paused";
      timeLabel = "Simulation is paused";
    } else if (stale) {
      timeState = "stale";
      timeLabel = "Session stream is stale; tick movement is unknown";
    } else if (observations.length > 1) {
      const before = number(observations[0].value.worldTick);
      const after = number(observations[1].value.worldTick);
      if (before != null && after != null && after > before) {
        timeState = "moving";
        timeLabel = "World tick advanced by " + (after - before) +
          " between the last two observations";
      } else {
        timeState = "unchanged";
        timeLabel = "No world-tick change in the last two observations";
      }
    }
    return {
      connection: connection.status || "disconnected",
      worldName: identity && identity.name || null,
      worldType: identity && identity.type || null,
      worldTick: number(world.tick),
      systemTick: number(world.systemTick),
      paused: source.engine ? source.engine.paused : null,
      speed: number(world.speed),
      stale,
      ageMs,
      staleAfterMs,
      timeState,
      timeLabel,
      evidenceLevel: sample ? "observed" : "unknown",
      source: sample && sample.evidence
        ? sample.evidence.source : "GET /api/session"
    };
  }

  function creatureSummary(state, input) {
    const creatures = Array.isArray(input && input.creatures)
      ? input.creatures : [];
    const selected = state && state.selection &&
      state.selection.creature || null;
    const lifeStates = {};
    creatures.forEach(creature => {
      const label = stateLabel(creature.lifeState);
      lifeStates[label] = (lifeStates[label] || 0) + 1;
    });
    const selectedLive = selected && creatures.find(creature =>
      String(creature.agentId) === String(selected.id));
    return {
      count: creatures.length,
      selected: selected ? {
        id: selected.id,
        name: selected.name || selectedLive && selectedLive.name || null,
        moniker: selected.moniker ||
          selectedLive && selectedLive.moniker || null,
        lifeState: selectedLive
          ? stateLabel(selectedLive.lifeState) : null,
        missing: Boolean(selected.missing ||
          input && input.creaturesCapturedAt && !selectedLive)
      } : null,
      lifeStates,
      capturedAt: input && input.creaturesCapturedAt || null,
      stale: Boolean(input && input.creaturesError) ||
        !input || !input.creaturesCapturedAt,
      error: input && input.creaturesError || null,
      evidenceLevel: creatures.length ||
        input && input.creaturesCapturedAt ? "observed" : "unknown",
      source: "GET /api/creatures"
    };
  }

  function experimentSummary(state) {
    const source = state || {};
    const experiment = source.experiment || {};
    const recording = source.recording || {};
    return {
      active: Boolean(recording.active),
      experimentId: experiment.id || null,
      name: experiment.name || null,
      status: experiment.status || "idle",
      startedAt: recording.startedAt || experiment.startedAt || null,
      sampleIntervalMs: number(recording.sampleIntervalMs),
      evidenceLevel: experiment.id || recording.active
        ? "observed" : "unknown",
      source: "ObservatoryState experiment workspace"
    };
  }

  function routeForIntervention(record) {
    const source = record || {};
    const target = source.target || {};
    if (source.type === "chemical_intervention" ||
        source.type === "chemical_syringe") {
      const selections = {};
      if (target.creatureId != null) {
        selections.creature = {
          id: target.creatureId,
          name: target.name,
          moniker: target.moniker
        };
      }
      if (target.chemicalId != null) {
        selections.chemical = {
          id: target.chemicalId,
          name: target.chemicalName
        };
      }
      return {
        routeId: "chemicals",
        tab: "creatures",
        view: "chemistry-intervene",
        primary: selections.creature ? "creature" : "chemical",
        selections
      };
    }
    if (source.type && source.type.startsWith("genome_")) {
      return {
        routeId: "genetics",
        tab: "genetics",
        view: null,
        selections: {}
      };
    }
    if (source.type && (source.type.startsWith("script_") ||
        source.type === "caos_evaluation")) {
      return {
        routeId: "workbench",
        tab: "ide",
        view: null,
        selections: {}
      };
    }
    return {
      routeId: "experiments",
      tab: "experiments",
      view: null,
      selections: {}
    };
  }

  function interventionSummary(state, limit) {
    const source = state || {};
    const worldKey = source.world && source.world.identity &&
      source.world.identity.key;
    if (!worldKey) return [];
    return (source.interventions || [])
      .filter(record => record.worldKey === worldKey)
      .slice(-(limit || 5))
      .reverse()
      .map(record => ({
        id: record.id,
        type: record.type,
        label: stateLabel(record.type),
        tick: number(record.tick),
        source: record.source,
        target: record.target || null,
        result: record.result || null,
        route: routeForIntervention(record),
        evidenceLevel: "observed"
      }));
  }

  function diagnosticSummary(input) {
    const scripts = Array.isArray(input && input.scripts)
      ? input.scripts : [];
    const notableLogs = Array.isArray(input && input.notableLogs)
      ? input.notableLogs.slice(-6).reverse() : [];
    const states = {
      running: 0, waiting: 0, blocking: 0, paused: 0, other: 0
    };
    scripts.forEach(script => {
      const raw = String(script.state || "running").toLowerCase();
      const normalized = raw === "blocking" &&
        String(script.blockingCommand || "").toUpperCase() === "WAIT"
        ? "waiting" : raw;
      const key = Object.prototype.hasOwnProperty.call(states, normalized)
        ? normalized : "other";
      states[key] += 1;
    });
    const errors = [
      input && input.creaturesError,
      input && input.scriptsError
    ].filter(Boolean);
    return {
      scripts: {
        count: scripts.length,
        states,
        capturedAt: input && input.scriptsCapturedAt || null,
        stale: Boolean(input && input.scriptsError) ||
          !input || !input.scriptsCapturedAt,
        source: "GET /api/scripts"
      },
      notableLogs,
      gaps: notableLogs.filter(record =>
        record.kind === "gap").length,
      errors,
      evidenceLevel: scripts.length || notableLogs.length
        ? "observed" : "unknown"
    };
  }

  function pinSummary(input) {
    return (Array.isArray(input && input.pins) ? input.pins : [])
      .slice(0, 6)
      .map(pin => ({
        id: pin.id,
        label: pin.label || pin.id,
        value: pin.value == null ? null : Number(pin.value),
        unit: pin.unit || "raw",
        delta: pin.delta == null ? null : Number(pin.delta),
        tick: pin.tick == null ? null : Number(pin.tick),
        stale: Boolean(pin.stale),
        evidenceLevel: pin.evidenceLevel || "observed"
      }));
  }

  function resumeRoute(state) {
    const source = state || {};
    const target = source.navigation && source.navigation.origin;
    if (target && target.tab && target.tab !== "dashboard") return target;
    const selection = source.selection || {};
    if (selection.creature) {
      return {
        routeId: "creatures",
        tab: "creatures",
        view: "drives",
        worldKey: source.world && source.world.identity &&
          source.world.identity.key,
        primary: "creature",
        selections: { creature: selection.creature }
      };
    }
    if (source.experiment && source.experiment.id) {
      return { routeId: "experiments", tab: "experiments",
        selections: {} };
    }
    return null;
  }

  function derive(state, input, now) {
    const session = sessionSummary(state, now);
    return {
      session,
      creatures: creatureSummary(state, input),
      experiment: experimentSummary(state),
      interventions: interventionSummary(state, 5),
      diagnostics: diagnosticSummary(input),
      pins: pinSummary(input),
      resume: resumeRoute(state),
      offline: session.connection !== "connected",
      emptyWorld: !session.worldName || session.worldName === "Startup"
    };
  }

  return Object.freeze({
    SESSION_SAMPLE_KEY,
    stateLabel,
    sampleAge,
    sessionSummary,
    creatureSummary,
    experimentSummary,
    routeForIntervention,
    interventionSummary,
    diagnosticSummary,
    pinSummary,
    resumeRoute,
    derive
  });
});
