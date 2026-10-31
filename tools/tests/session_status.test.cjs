"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("../observatory_state.js");
const {
  SAMPLE_KEY,
  normalizeSessionStatus,
  applySessionStatus,
  deriveSessionView,
  formatAge,
  pollInterval,
  createBrowserController
} = require("../session_status.js");

function status(overrides = {}) {
  return normalizeSessionStatus({
    worldName: "Alpha",
    worldType: "undocked",
    worldTick: 1234,
    systemTick: 1300,
    paused: false,
    gameSpeed: 2,
    creatureCount: 4,
    loadPending: false,
    requestedWorldName: null,
    requestedWorldType: null,
    ...overrides
  }, "2026-07-27T10:00:00Z");
}

function response(body, ok = true, httpStatus = 200) {
  return {
    ok,
    status: httpStatus,
    async json() {
      return body;
    }
  };
}

test("normalizes the complete structured session response", () => {
  const value = status();
  assert.equal(value.worldName, "Alpha");
  assert.equal(value.worldType, "undocked");
  assert.equal(value.worldTick, 1234);
  assert.equal(value.systemTick, 1300);
  assert.equal(value.paused, false);
  assert.equal(value.gameSpeed, 2);
  assert.equal(value.creatureCount, 4);
  assert.equal(value.loadPending, false);
  assert.equal(value.capturedAt, "2026-07-27T10:00:00.000Z");

  const startup = status({
    worldName: "Startup",
    worldType: null,
    worldTick: 0,
    creatureCount: -2
  });
  assert.equal(startup.worldType, "startup");
  assert.equal(startup.creatureCount, 0);
});

test("applies one observed session sample to shared state", () => {
  const store = createStore();
  applySessionStatus(store, status(), 1000);

  const state = store.getState();
  assert.equal(state.connection.status, "connected");
  assert.equal(state.world.identity.name, "Alpha");
  assert.equal(state.world.identity.type, "undocked");
  assert.equal(state.world.tick, 1234);
  assert.equal(state.world.systemTick, 1300);
  assert.equal(state.world.speed, 2);
  assert.equal(state.engine.paused, false);
  assert.equal(state.samples.current[SAMPLE_KEY].value.creatureCount, 4);
  assert.equal(state.samples.current[SAMPLE_KEY].evidence.level, "observed");
  assert.equal(state.samples.current[SAMPLE_KEY].evidence.source, "GET /api/session");
});

test("derives running, paused, loading, no-world, and stale ribbon states", () => {
  const store = createStore();
  applySessionStatus(store, status(), 1000);

  let view = deriveSessionView(store.getState(), "2026-07-27T10:00:00.400Z");
  assert.equal(view.stateKey, "running");
  assert.equal(view.worldLabel, "Alpha");
  assert.equal(view.worldTypeLabel, "Undocked");
  assert.equal(view.activeWorldTypeLabel, "Undocked");
  assert.equal(view.speedText, "×2");
  assert.equal(view.tickText, "Tick 1,234");
  assert.equal(view.creaturesText, "4 creatures");
  assert.equal(view.stale, false);

  store.dispatch({
    type: "recording/set",
    payload: { active: true, startedAt: "2026-07-27T10:00:00Z" }
  });
  store.dispatch({
    type: "experiment/set",
    payload: {
      id: "exp-1",
      name: "Food baseline",
      status: "active",
      startedAt: "2026-07-27T10:00:00Z"
    }
  });
  view = deriveSessionView(store.getState(), "2026-07-27T10:00:00.400Z");
  assert.equal(view.activityText, "Recording · Food baseline");

  store.dispatch({ type: "engine/pause", payload: { paused: true } });
  view = deriveSessionView(store.getState(), "2026-07-27T10:00:01Z");
  assert.equal(view.stateKey, "paused");

  applySessionStatus(store, status({
    worldTick: 1235,
    loadPending: true,
    requestedWorldName: "Beta",
    requestedWorldType: "docked"
  }), 1000);
  view = deriveSessionView(store.getState(), "2026-07-27T10:00:01Z");
  assert.equal(view.stateKey, "loading");
  assert.equal(view.worldLabel, "Beta");
  assert.equal(view.worldTypeLabel, "Docked");
  assert.equal(view.activeWorldLabel, "Alpha");
  assert.equal(view.activeWorldTypeLabel, "Undocked");
  assert.equal(view.requestedWorldLabel, "Beta · Docked");
  assert.equal(view.previousWorldText, "Previous world: Alpha");

  store.dispatch({
    type: "connection/status",
    payload: {
      status: "disconnected",
      changedAt: "2026-07-27T10:00:02Z",
      error: "offline"
    }
  });
  view = deriveSessionView(store.getState(), "2026-07-27T10:00:02Z");
  assert.equal(view.stateKey, "disconnected");
  assert.equal(view.worldLabel, "Beta");
  assert.equal(view.previousWorldText, "Previous world: Alpha");
  assert.equal(view.stale, true);

  const startupStore = createStore();
  applySessionStatus(startupStore, status({
    worldName: "Startup",
    worldType: "startup",
    worldTick: 0,
    systemTick: 1,
    creatureCount: 0
  }), 1000);
  view = deriveSessionView(startupStore.getState(), "2026-07-27T10:00:00Z");
  assert.equal(view.stateKey, "no-world");
  assert.equal(view.worldLabel, "No world");

  view = deriveSessionView(store.getState(), "2026-07-27T10:00:05Z");
  assert.equal(view.stale, true);
  assert.match(view.freshnessText, /^Stale/);
  assert.equal(formatAge(65000), "updated 1m 05s ago");
});

test("concurrent controller consumers share one session request", async () => {
  const store = createStore();
  let calls = 0;
  const controller = createBrowserController({
    store,
    fetch: async () => {
      calls += 1;
      await Promise.resolve();
      return response({
        worldName: "Alpha",
        worldType: "undocked",
        worldTick: 10,
        systemTick: 11,
        paused: false,
        gameSpeed: 1,
        creatureCount: 2,
        loadPending: false
      });
    },
    now: () => new Date("2026-07-27T10:00:00Z")
  });

  const [first, second] = await Promise.all([
    controller.refresh(false),
    controller.refresh(false)
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(store.getState().samples.current[SAMPLE_KEY].value.creatureCount, 2);
});

test("hidden pages slow polling unless an observatory recording is active", () => {
  const store = createStore();
  assert.equal(pollInterval(store.getState(), false), 1000);
  assert.equal(pollInterval(store.getState(), true), 5000);

  store.dispatch({
    type: "recording/set",
    payload: { active: true, startedAt: "2026-07-27T10:00:00Z" }
  });
  assert.equal(pollInterval(store.getState(), true), 1000);
});

test("poll failures first mark stale and only then declare disconnection", async () => {
  const store = createStore();
  let shouldFail = false;
  const controller = createBrowserController({
    store,
    fetch: async () => {
      if (shouldFail) throw new Error("offline");
      return response({
        worldName: "Alpha",
        worldType: "undocked",
        worldTick: 10,
        systemTick: 11,
        paused: false,
        gameSpeed: 1,
        creatureCount: 1,
        loadPending: false
      });
    },
    now: () => new Date("2026-07-27T10:00:00Z")
  });

  await controller.refresh(true);
  shouldFail = true;
  await assert.rejects(() => controller.refresh(true), /offline/);
  assert.equal(store.getState().connection.status, "connected");
  assert.equal(store.getState().samples.current[SAMPLE_KEY].stale, true);

  await assert.rejects(() => controller.refresh(true), /offline/);
  await assert.rejects(() => controller.refresh(true), /offline/);
  assert.equal(store.getState().connection.status, "disconnected");
  assert.equal(store.getState().connection.error, "offline");
});

test("speed changes are explicit and followed by an engine-truth refresh", async () => {
  const store = createStore();
  const requests = [];
  const controller = createBrowserController({
    store,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/engine/tickrate") {
        return response({ ok: true, multiplier: 4 });
      }
      return response({
        worldName: "Alpha",
        worldType: "undocked",
        worldTick: 20,
        systemTick: 21,
        paused: false,
        gameSpeed: 4,
        creatureCount: 3,
        loadPending: false
      });
    },
    now: () => new Date("2026-07-27T10:00:00Z")
  });

  await controller.setSpeed(4);
  assert.equal(requests[0].url, "/api/engine/tickrate");
  assert.deepEqual(JSON.parse(requests[0].options.body), { multiplier: 4 });
  assert.equal(requests[1].url, "/api/session");
  assert.equal(store.getState().world.speed, 4);
});
