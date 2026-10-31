"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStore,
  createEvidence,
  EVIDENCE_LEVELS,
  HISTORY_LIMIT,
  compoundKey
} = require("../observatory_state.js");

function connectedWorld(store, name = "Alpha", tick = 10) {
  store.dispatch({
    type: "connection/status",
    payload: { status: "connected", changedAt: "2026-07-25T10:00:00Z" }
  });
  store.dispatch({
    type: "world/sync",
    payload: { worldName: name, worldTick: tick, systemTick: tick + 5, gameSpeed: 2 }
  });
}

function observedMetadata(worldKey, tick, capturedAt = "2026-07-25T10:00:00Z") {
  return {
    worldKey,
    tick,
    capturedAt,
    sampleIntervalMs: 2000,
    evidenceLevel: "observed",
    evidence: { source: "GET /api/creatures" }
  };
}

test("state snapshots are immutable and selections use world-qualified keys", () => {
  const store = createStore();
  connectedWorld(store);

  const selection = store.select("creature", 42, { name: "Ada" });
  assert.equal(selection.key, "Alpha:42");
  assert.equal(selection.worldKey, "Alpha");
  assert.equal(compoundKey("Alpha", 42), "Alpha:42");
  assert.ok(Object.isFrozen(store.getState()));
  assert.ok(Object.isFrozen(store.getState().selection));
  assert.throws(() => {
    store.getState().selection.creature.id = 7;
  }, TypeError);
});

test("selection survives unrelated navigation and preference transitions", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42);

  store.dispatch({
    type: "navigation/set",
    payload: { origin: "creatures", returnTarget: "drives" }
  });
  store.dispatch({
    type: "preference/set",
    payload: { key: "timebase", value: "wallTime" }
  });

  assert.equal(store.getState().selection.creature.id, 42);
});

test("primary and related selections coexist without discarding context", () => {
  const store = createStore();
  connectedWorld(store);

  store.select("creature", 42, { name: "Ada" }, true);
  store.select("agent", 42, { family: 4 });
  store.select("chemical", 148, { name: "Glucose" });

  let selection = store.getState().selection;
  assert.equal(selection.primary.kind, "creature");
  assert.equal(selection.agent.id, 42);
  assert.equal(selection.chemical.id, 148);

  store.setPrimary("chemical");
  selection = store.getState().selection;
  assert.equal(selection.primary.kind, "chemical");
  assert.equal(selection.creature.id, 42);
  assert.equal(selection.agent.id, 42);

  store.select("chemical", null);
  selection = store.getState().selection;
  assert.equal(selection.primary, null);
  assert.equal(selection.creature.id, 42);
});

test("selection history restores same-world context and rejects old-world targets", () => {
  const store = createStore();
  connectedWorld(store, "Alpha");
  store.select("creature", 42, { name: "Ada" }, true);
  store.select("chemical", 148, { name: "Glucose" });
  const alphaSelection = JSON.parse(JSON.stringify(store.getState().selection));

  store.select("creature", 7, { name: "Bex" }, true);
  store.dispatch({
    type: "selection/restore",
    payload: { selection: alphaSelection }
  });
  assert.equal(store.getState().selection.creature.id, 42);
  assert.equal(store.getState().selection.primary.kind, "creature");

  store.dispatch({
    type: "world/sync",
    payload: { worldName: "Beta", worldTick: 1 }
  });
  store.dispatch({
    type: "selection/restore",
    payload: { selection: alphaSelection }
  });
  assert.equal(store.getState().selection.creature, null);
  assert.equal(store.getState().selection.primary, null);
  assert.equal(store.getState().selection.chemical.id, 148);
});

test("narrow subscriptions only run when their selected slice changes", () => {
  const store = createStore();
  connectedWorld(store);
  let selectionNotifications = 0;
  const unsubscribe = store.subscribe(
    state => state.selection.creature,
    () => { selectionNotifications += 1; }
  );

  store.dispatch({ type: "engine/pause", payload: { paused: true } });
  store.select("creature", 9);
  store.dispatch({ type: "engine/pause", payload: { paused: false } });
  unsubscribe();
  store.select("creature", 10);

  assert.equal(selectionNotifications, 1);
});

test("world loading clears world-scoped state before the new world arrives", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42, null, true);
  store.select("chemical", 148);
  store.recordSample("creatures:list", [{ agentId: 42 }], observedMetadata("Alpha", 10));

  store.dispatch({
    type: "world/loading",
    payload: { name: "Beta", startedAt: "2026-07-25T10:01:00Z" }
  });

  const loading = store.getState();
  assert.equal(loading.world.status, "loading");
  assert.equal(loading.world.transition.targetName, "Beta");
  assert.equal(loading.selection.creature, null);
  assert.equal(loading.selection.primary, null);
  assert.equal(loading.selection.chemical.id, 148);
  assert.deepEqual(loading.samples.current, {});

  store.dispatch({
    type: "world/sync",
    payload: { worldName: "Beta", worldTick: 1 }
  });
  assert.equal(store.getState().world.identity.key, "Beta");
  assert.equal(store.getState().selection.creature, null);
});

test("session sync preserves a pending world transition until confirmation", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42);

  store.dispatch({
    type: "world/session",
    payload: {
      worldName: "Alpha",
      worldType: "undocked",
      worldTick: 12,
      systemTick: 20,
      gameSpeed: 1,
      loadPending: true,
      requestedWorldName: "Beta",
      requestedWorldType: "docked",
      capturedAt: "2026-07-25T10:01:00Z"
    }
  });

  let state = store.getState();
  assert.equal(state.world.status, "loading");
  assert.equal(state.world.identity.name, "Alpha");
  assert.equal(state.world.transition.targetName, "Beta");
  assert.equal(state.world.transition.targetType, "docked");
  assert.equal(state.selection.creature, null);
  const startedAt = state.world.transition.startedAt;

  store.dispatch({
    type: "world/session",
    payload: {
      worldName: "Alpha",
      worldType: "undocked",
      worldTick: 13,
      systemTick: 21,
      gameSpeed: 1,
      loadPending: true,
      requestedWorldName: "Beta",
      requestedWorldType: "docked",
      capturedAt: "2026-07-25T10:01:01Z"
    }
  });
  state = store.getState();
  assert.equal(state.world.transition.startedAt, startedAt);
  assert.equal(state.world.tick, 13);

  store.dispatch({
    type: "world/session",
    payload: {
      worldName: "Beta",
      worldType: "docked",
      worldTick: 1,
      systemTick: 22,
      gameSpeed: 1,
      loadPending: false,
      capturedAt: "2026-07-25T10:01:02Z"
    }
  });
  state = store.getState();
  assert.equal(state.world.status, "loaded");
  assert.equal(state.world.identity.name, "Beta");
  assert.equal(state.world.identity.type, "docked");
  assert.equal(state.world.transition, null);
});

test("disconnect resets world-scoped selection and marks current samples stale", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42);
  store.recordSample("creatures:list", [{ agentId: 42 }], observedMetadata("Alpha", 10));

  store.dispatch({
    type: "connection/status",
    payload: {
      status: "disconnected",
      changedAt: "2026-07-25T10:00:03Z",
      error: "stream closed"
    }
  });

  let state = store.getState();
  assert.equal(state.selection.creature, null);
  assert.equal(state.samples.current["creatures:list"].stale, true);
  assert.equal(state.samples.current["creatures:list"].staleReason, "disconnected");
  assert.equal(store.freshness(state.samples.current["creatures:list"]).status, "stale");

  store.dispatch({
    type: "connection/status",
    payload: { status: "connected", changedAt: "2026-07-25T10:00:04Z" }
  });
  state = store.getState();
  assert.equal(state.samples.current["creatures:list"].stale, true);

  store.recordSample(
    "creatures:list",
    [{ agentId: 43 }],
    observedMetadata("Alpha", 11, "2026-07-25T10:00:04Z")
  );
  assert.equal(store.getState().samples.current["creatures:list"].stale, false);
});

test("a failed poll can mark one sample stale without disconnecting", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42);
  store.recordSample("session:status", { paused: false }, {
    worldKey: "Alpha",
    tick: 10,
    capturedAt: "2026-07-25T10:00:00Z",
    sampleIntervalMs: 1000,
    evidenceLevel: "observed",
    evidence: { source: "GET /api/session" }
  });

  store.dispatch({
    type: "sample/stale",
    payload: { key: "session:status", reason: "poll-failed" }
  });

  const state = store.getState();
  assert.equal(state.connection.status, "connected");
  assert.equal(state.selection.creature.id, 42);
  assert.equal(state.samples.current["session:status"].stale, true);
  assert.equal(state.samples.current["session:status"].staleReason, "poll-failed");
});

test("freshness follows capture age and polling interval", () => {
  const store = createStore();
  connectedWorld(store);
  const sample = store.recordSample(
    "creatures:list",
    [],
    observedMetadata("Alpha", 10, "2026-07-25T10:00:00Z")
  );

  assert.equal(store.freshness(sample, {
    now: "2026-07-25T10:00:03Z"
  }).status, "fresh");
  const stale = store.freshness(sample, {
    now: "2026-07-25T10:00:05Z"
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.reason, "age-exceeded");
});

test("older and old-world responses cannot overwrite the current sample", () => {
  const store = createStore();
  connectedWorld(store, "Alpha", 20);
  store.recordSample("creatures:list", ["new"], observedMetadata("Alpha", 20));
  store.recordSample("creatures:list", ["old"], observedMetadata("Alpha", 19));
  assert.deepEqual(store.getState().samples.current["creatures:list"].value, ["new"]);

  store.dispatch({
    type: "world/sync",
    payload: { worldName: "Beta", worldTick: 1 }
  });
  const late = store.recordSample(
    "creatures:list",
    ["late-alpha"],
    observedMetadata("Alpha", 21)
  );
  assert.equal(late, null);
  assert.equal(store.getState().samples.current["creatures:list"], undefined);
});

test("concurrent shared consumers use one loader and receive one snapshot", async () => {
  const store = createStore();
  connectedWorld(store);
  let calls = 0;
  let resolveLoader;
  const loader = () => {
    calls += 1;
    return new Promise(resolve => { resolveLoader = resolve; });
  };

  const first = store.requestShared(
    "creatures:list",
    loader,
    observedMetadata("Alpha", 10)
  );
  const second = store.requestShared(
    "creatures:list",
    loader,
    observedMetadata("Alpha", 10)
  );
  assert.equal(first, second);
  assert.equal(calls, 0, "loaders begin in a microtask");
  await Promise.resolve();
  assert.equal(calls, 1);

  resolveLoader([{ agentId: 42 }]);
  const [firstSample, secondSample] = await Promise.all([first, second]);
  assert.equal(firstSample, secondSample);
  assert.equal(firstSample.value[0].agentId, 42);
});

test("near-sequential shared session reads use the bounded short cache", async () => {
  const store = createStore();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { worldName: "Startup", worldTick: 1 };
  };

  const first = await store.requestShared("session:world-tick", loader, {
    store: false,
    cacheForMs: 500
  });
  const second = await store.requestShared("session:world-tick", loader, {
    store: false,
    cacheForMs: 500
  });

  assert.equal(first, second);
  assert.equal(calls, 1);
});

test("inferred evidence requires a label and supporting evidence", () => {
  assert.throws(() => createEvidence("inferred", {
    source: "observatory heuristic",
    supportingEvidence: ["drive:hunger"]
  }), /inference label/);
  assert.throws(() => createEvidence("inferred", {
    source: "observatory heuristic",
    inferenceLabel: "Seeking food"
  }), /supporting evidence/);

  const evidence = createEvidence("inferred", {
    source: "observatory heuristic",
    inferenceLabel: "Seeking food",
    supportingEvidence: ["drive:hunger", "decision:eat"],
    heuristic: true,
    confidence: 0.75,
    worldKey: "Alpha",
    tick: 10
  });
  assert.equal(evidence.label, "Inferred");
  assert.equal(evidence.confidence, 0.75);
  assert.equal(EVIDENCE_LEVELS.observed.label, "Observed");
});

test("no-world and Startup world states are explicit", () => {
  const store = createStore();
  store.dispatch({ type: "world/sync", payload: { worldName: "", worldTick: 0 } });
  assert.equal(store.getState().world.status, "none");
  assert.equal(store.getState().world.identity, null);

  store.dispatch({
    type: "world/sync",
    payload: { worldName: "Startup", worldTick: 3 }
  });
  assert.equal(store.getState().world.status, "startup");
  assert.equal(store.getState().world.identity.type, "startup");
});

test("sample history is bounded", () => {
  const store = createStore();
  connectedWorld(store);
  for (let tick = 0; tick < HISTORY_LIMIT + 10; tick += 1) {
    store.recordSample(
      "creatures:list",
      [tick],
      observedMetadata("Alpha", tick, new Date(1784973600000 + tick).toISOString())
    );
  }
  const history = store.getState().samples.history["creatures:list"];
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].tick, 10);
});

test("interventions carry world and time provenance", () => {
  const store = createStore();
  connectedWorld(store, "Alpha", 15);
  const intervention = store.addIntervention({
    id: "dose-1",
    type: "chemical-adjustment",
    target: { creatureKey: "Alpha:42", chemicalId: 35 },
    source: "Chemistry syringe",
    parameters: { amount: 0.1 },
    reason: "Controlled test",
    performedAt: "2026-07-25T10:02:00Z"
  });

  assert.equal(intervention.worldKey, "Alpha");
  assert.equal(intervention.tick, 15);
  assert.equal(intervention.performedAt, "2026-07-25T10:02:00.000Z");
  assert.throws(() => store.addIntervention({
    type: "chemical-adjustment",
    source: "Chemistry syringe"
  }), /id, type, and source/);
});

test("reloading the same world discards session state", () => {
  const store = createStore();
  const session = (worldSessionId, worldTick) => store.dispatch({
    type: "world/session",
    payload: { worldName: "Lab", worldSessionId, worldTick }
  });
  session("1-2.1", 100);
  const before = store.getState().world.identity.key;
  store.select("creature", 42, { moniker: "a" }, true);
  store.recordSample("creature:42:drives", { hunger: 1 }, {
    tick: 100,
    evidenceLevel: "observed",
    evidence: { source: "test" }
  });

  session("1-2.2", 5);

  const state = store.getState();
  assert.notEqual(state.world.identity.key, before);
  assert.equal(state.world.identity.name, "Lab");
  assert.equal(state.world.tick, 5);
  assert.equal(state.selection.creature, null);
  assert.deepEqual(state.samples.current, {});
});

test("later samples without a session id keep the current session", () => {
  const store = createStore();
  store.dispatch({
    type: "world/session",
    payload: { worldName: "Lab", worldSessionId: "1-2.1", worldTick: 100 }
  });
  const key = store.getState().world.identity.key;
  store.select("creature", 42, { moniker: "a" }, true);
  store.dispatch({
    type: "world/sync",
    payload: { worldName: "Lab", worldTick: 101 }
  });
  assert.equal(store.getState().world.identity.key, key);
  assert.ok(store.getState().selection.creature);
});

test("a pending reload of the active world shows as loading", () => {
  const store = createStore();
  store.dispatch({
    type: "world/session",
    payload: { worldName: "Lab", worldSessionId: "1-2.1", worldTick: 100 }
  });
  store.dispatch({
    type: "world/session",
    payload: {
      worldName: "Lab",
      worldSessionId: "1-2.1",
      worldTick: 101,
      loadPending: true,
      requestedWorldName: "Lab"
    }
  });
  assert.equal(store.getState().world.status, "loading");
});
