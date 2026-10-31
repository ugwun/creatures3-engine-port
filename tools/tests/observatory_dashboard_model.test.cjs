"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../observatory_dashboard_model.js");

function state(overrides = {}) {
  return Object.assign({
    connection: { status: "connected" },
    engine: { paused: false },
    world: {
      identity: { name: "Alpha", key: "Alpha", type: "docked" },
      tick: 120,
      systemTick: 30,
      speed: 1
    },
    selection: { creature: null },
    samples: {
      current: {
        "session:status": {
          capturedAt: "2026-07-28T10:00:01.000Z",
          sampleIntervalMs: 1000,
          evidence: { source: "GET /api/session" },
          value: { worldTick: 120 }
        }
      },
      history: {
        "session:status": [
          { value: { worldTick: 110 } },
          { value: { worldTick: 120 } }
        ]
      }
    },
    recording: { active: false },
    experiment: { id: null, status: "idle" },
    interventions: [],
    navigation: { origin: null }
  }, overrides);
}

test("dashboard distinguishes observed tick movement from pause and staleness", () => {
  const moving = Model.sessionSummary(
    state(), "2026-07-28T10:00:02.000Z");
  assert.equal(moving.timeState, "moving");
  assert.match(moving.timeLabel, /advanced by 10/);
  assert.equal(moving.evidenceLevel, "observed");

  const pausedState = state({ engine: { paused: true } });
  assert.equal(Model.sessionSummary(
    pausedState, "2026-07-28T10:00:02.000Z").timeState, "paused");

  const stale = Model.sessionSummary(
    state(), "2026-07-28T10:00:10.000Z");
  assert.equal(stale.timeState, "stale");
  assert.equal(stale.stale, true);
});

test("population summary preserves exact life-state labels and selected identity", () => {
  const value = Model.creatureSummary(state({
    selection: {
      creature: { id: 7, name: "Ada", moniker: "m-7" }
    }
  }), {
    creaturesCapturedAt: "2026-07-28T10:00:02.000Z",
    creatures: [
      { agentId: 7, name: "Ada", moniker: "m-7", lifeState: "alert" },
      { agentId: 8, name: "Bo", lifeState: "asleep" },
      { agentId: 9, name: "Cy", lifeState: "alert" }
    ]
  });
  assert.equal(value.count, 3);
  assert.deepEqual(value.lifeStates, { Alert: 2, Asleep: 1 });
  assert.equal(value.selected.lifeState, "Alert");
  assert.equal(value.evidenceLevel, "observed");
});

test("recording and recent interventions remain world-qualified", () => {
  const current = state({
    recording: {
      active: true,
      startedAt: "2026-07-28T10:00:00.000Z",
      sampleIntervalMs: 2000
    },
    experiment: {
      id: "experiment-1", name: "Food response", status: "treatment"
    },
    interventions: [
      {
        id: "old", type: "chemical_intervention",
        worldKey: "Beta", tick: 5, source: "other"
      },
      {
        id: "current", type: "chemical_intervention",
        worldKey: "Alpha", tick: 118, source: "Chemistry",
        target: { creatureId: 7, chemicalId: 75 }
      }
    ]
  });
  const dashboard = Model.derive(current, {}, "2026-07-28T10:00:02.000Z");
  assert.equal(dashboard.experiment.active, true);
  assert.equal(dashboard.experiment.name, "Food response");
  assert.equal(dashboard.interventions.length, 1);
  assert.equal(dashboard.interventions[0].route.routeId, "chemicals");
  assert.equal(
    dashboard.interventions[0].route.selections.creature.id, 7);
});

test("diagnostics summarize running scripts and bounded notable logs", () => {
  const result = Model.diagnosticSummary({
    scriptsCapturedAt: "2026-07-28T10:00:02.000Z",
    scripts: [
      {},
      { state: "blocking", blockingCommand: "WAIT" },
      { state: "paused" },
      { state: "blocking" }
    ],
    notableLogs: Array.from({ length: 8 }, (_, index) => ({
      id: index, kind: index === 7 ? "gap" : "record",
      severity: "warning"
    }))
  });
  assert.deepEqual(result.scripts.states, {
    running: 1, waiting: 1, blocking: 1, paused: 1, other: 0
  });
  assert.equal(result.notableLogs.length, 6);
  assert.equal(result.gaps, 1);
});

test("offline and empty-world states remain explicit instead of fabricating data", () => {
  const disconnected = state({
    connection: { status: "disconnected" },
    world: {
      identity: null, tick: null, systemTick: null, speed: null
    },
    samples: { current: {}, history: {} }
  });
  const dashboard = Model.derive(disconnected, {
    creaturesError: "offline",
    scriptsError: "offline"
  });
  assert.equal(dashboard.offline, true);
  assert.equal(dashboard.emptyWorld, true);
  assert.equal(dashboard.session.timeState, "disconnected");
  assert.equal(dashboard.creatures.evidenceLevel, "unknown");
  assert.deepEqual(dashboard.diagnostics.errors, ["offline", "offline"]);
  assert.deepEqual(Model.interventionSummary(disconnected), []);
});
