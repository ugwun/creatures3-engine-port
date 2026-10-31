"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStore,
  downsample
} = require("../biological_series.js");

function context(tick, overrides = {}) {
  return Object.assign({
    worldKey: "world-a",
    worldName: "World A",
    subjectKey: "creature:7",
    subjectLabel: "Ada",
    worldTick: tick,
    systemTick: tick + 100,
    wallTimeMs: tick * 50,
    enginePaused: false,
    gameSpeed: 1,
    sampleIntervalMs: 2000,
    expectedTickDelta: 40,
    sourceEndpoint: "GET /api/creatures"
  }, overrides);
}

function metric(id, value, overrides = {}) {
  return Object.assign({
    id,
    label: id,
    value,
    unit: "concentration",
    group: "metabolism"
  }, overrides);
}

test("series retain ticks, deltas, baseline, rates, and evidence metadata", () => {
  const store = createStore();
  store.ingest(context(100), [metric("chemical:4", 0.2)]);
  store.ingest(context(140), [metric("chemical:4", 0.3)]);
  store.ingest(context(180), [metric("chemical:4", 0.25)]);
  const session = store.activeSession("world-a", "creature:7");
  store.setBaseline(session.id, 100);
  const view = store.metricView("world-a", "creature:7", "chemical:4");

  assert.equal(view.summary.current, 0.25);
  assert.ok(Math.abs(view.summary.previousDelta - (-0.05)) < 1e-9);
  assert.ok(Math.abs(view.summary.baselineDelta - 0.05) < 1e-9);
  assert.equal(view.summary.minimum, 0.2);
  assert.equal(view.summary.maximum, 0.3);
  assert.equal(view.samples[0].sourceEndpoint, "GET /api/creatures");
  assert.equal(view.samples[0].evidenceLevel, "observed");
});

test("paused worlds retain a state change but suppress identical duplicates", () => {
  const store = createStore();
  store.ingest(context(100, { enginePaused: true }), [
    metric("drive:6", 0.4)
  ]);
  const duplicate = store.ingest(context(100, {
    enginePaused: true,
    wallTimeMs: 9000
  }), [metric("drive:6", 0.4)]);
  const intervention = store.ingest(context(100, {
    enginePaused: true,
    wallTimeMs: 10000
  }), [metric("drive:6", 0.6)]);

  assert.equal(duplicate.skippedPausedDuplicates, 1);
  assert.equal(intervention.added, 1);
  assert.equal(store.metricView(
    "world-a", "creature:7", "drive:6"
  ).samples.length, 2);
});

test("missed tick intervals are explicit and accelerated samples expose gaps", () => {
  const store = createStore();
  store.ingest(context(100), [metric("chemical:35", 0.5)]);
  store.ingest(context(300, { gameSpeed: 5 }), [
    metric("chemical:35", 0.4)
  ]);
  const view = store.metricView(
    "world-a", "creature:7", "chemical:35"
  );
  assert.equal(view.samples[1].gapBefore, true);
  assert.equal(view.samples[1].missedIntervals, 4);
  assert.equal(view.summary.gapCount, 1);
});

test("bounds per-series and total history while retaining drop counts", () => {
  const store = createStore({
    maxSamplesPerSeries: 3,
    maxTotalSamples: 5
  });
  for (let i = 0; i < 6; i++) {
    store.ingest(context(100 + i * 40), [
      metric("drive:1", i / 10),
      metric("drive:2", i / 20)
    ]);
  }
  assert.equal(store.stats().totalSamples <= 5, true);
  assert.equal(store.metricView(
    "world-a", "creature:7", "drive:1"
  ).samples.length <= 3, true);
  const session = store.activeSession("world-a", "creature:7");
  const dropped = ["drive:1", "drive:2"].reduce((total, id) => {
    const series = store.getSeries(session.id, id);
    return total + (series ? series.droppedSamples : 0);
  }, 0);
  assert.equal(dropped > 0, true);
});

test("world, creature, and regressed-tick sessions never merge", () => {
  const store = createStore();
  store.ingest(context(100), [metric("drive:1", 0.1)]);
  store.ingest(context(140, { subjectKey: "creature:8" }), [
    metric("drive:1", 0.2)
  ]);
  store.ingest(context(10), [metric("drive:1", 0.3)]);
  store.ingest(context(20, { worldKey: "world-b" }), [
    metric("drive:1", 0.4)
  ]);

  assert.equal(store.stats().sessionCount, 4);
  assert.equal(store.metricView(
    "world-a", "creature:7", "drive:1"
  ).samples.length, 1);
  assert.equal(store.metricView(
    "world-a", "creature:8", "drive:1"
  ).summary.current, 0.2);
});

test("pin order, explicit sort modes, and export remain stable", () => {
  const store = createStore();
  store.pin("chemical:35");
  store.pin("drive:6");
  const records = [
    { id: "drive:6", label: "Tiredness", value: 0.1, previousDelta: 0.1, group: "drives" },
    { id: "chemical:35", label: "ATP", value: 0.8, previousDelta: -0.2, group: "metabolism" },
    { id: "chemical:4", label: "Glycogen", value: 0.5, previousDelta: 0.01, group: "reserves" }
  ];
  assert.deepEqual(
    store.orderMetrics(records, "pinned_order").map(row => row.id),
    ["chemical:35", "drive:6", "chemical:4"]
  );
  assert.deepEqual(
    store.orderMetrics(records, "absolute_change").map(row => row.id),
    ["chemical:35", "drive:6", "chemical:4"]
  );

  store.ingest(context(100), [metric("chemical:35", 0.8)]);
  const session = store.activeSession("world-a", "creature:7");
  const exported = store.exportSession(session.id);
  assert.equal(exported.kind, "biological_series_session");
  assert.deepEqual(exported.pinnedMetricIds, ["chemical:35", "drive:6"]);
  assert.equal(exported.series[0].samples[0].worldTick, 100);
});

test("downsampling preserves first, last, and extrema within a hard cap", () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    worldTick: index,
    value: index === 50 ? 10 : Math.sin(index / 10)
  }));
  const visible = downsample(samples, 20);
  assert.equal(visible.length <= 20, true);
  assert.equal(visible[0].worldTick, 0);
  assert.equal(visible.at(-1).worldTick, 99);
  assert.equal(visible.some(sample => sample.value === 10), true);
});

test("a tick-zero baseline survives export", () => {
  const store = createStore();
  store.ingest(context(0), [metric("drive:1", 0.1)]);
  const session = store.activeSession("world-a", "creature:7");
  store.setBaseline(session.id, 0);
  assert.equal(store.exportSession(session.id).baselineTick, 0);
});

test("interventions are attached once to the first following sample", () => {
  const store = createStore();
  store.ingest(context(100), [metric("chemical:35", 0.2)]);
  const intervention = {
    id: "dose-1",
    type: "chemical_syringe",
    tick: 120,
    source: "Creatures / Syringe",
    target: { creatureId: 7, chemicalId: 35 },
    parameters: { chemicalId: 35 }
  };
  store.ingest(context(140, { interventions: [intervention] }), [
    metric("chemical:35", 0.4),
    metric("chemical:30", 0.8)
  ]);
  store.ingest(context(180, { interventions: [intervention] }), [
    metric("chemical:35", 0.3)
  ]);
  const samples = store.metricView(
    "world-a", "creature:7", "chemical:35"
  ).samples;
  assert.deepEqual(samples[1].interventions.map(item => item.id), ["dose-1"]);
  assert.deepEqual(samples[2].interventions, []);
  assert.deepEqual(store.metricView(
    "world-a", "creature:7", "chemical:30"
  ).samples[0].interventions, []);
});

test("same-tick interventions are retained once when the value changes", () => {
  const store = createStore();
  store.ingest(context(100, { enginePaused: true }), [
    metric("chemical:35", 0.2)
  ]);
  const intervention = {
    id: "paused-dose",
    type: "chemical_syringe",
    tick: 100,
    source: "Creatures / Syringe",
    target: { chemicalId: 35 }
  };
  store.ingest(context(100, {
    enginePaused: true,
    interventions: [intervention]
  }), [metric("chemical:35", 0.4)]);
  store.ingest(context(100, {
    enginePaused: true,
    interventions: [intervention]
  }), [metric("chemical:35", 0.4)]);
  const samples = store.metricView(
    "world-a", "creature:7", "chemical:35"
  ).samples;
  assert.equal(samples.length, 2);
  assert.deepEqual(samples[1].interventions.map(item => item.id), [
    "paused-dose"
  ]);
});

test("same-tick interventions survive an unchanged paused value", () => {
  const store = createStore();
  store.ingest(context(100, { enginePaused: true }), [
    metric("chemical:35", 0.2)
  ]);
  const intervention = {
    id: "unchanged-paused-dose",
    type: "chemical_syringe",
    tick: 100,
    source: "Creatures / Syringe",
    target: { chemicalId: 35 }
  };
  store.ingest(context(100, {
    enginePaused: true,
    interventions: [intervention]
  }), [metric("chemical:35", 0.2)]);
  store.ingest(context(100, {
    enginePaused: true,
    interventions: [intervention]
  }), [metric("chemical:35", 0.2)]);
  const samples = store.metricView(
    "world-a", "creature:7", "chemical:35"
  ).samples;
  assert.equal(samples.length, 2);
  assert.deepEqual(samples[1].interventions.map(item => item.id), [
    "unchanged-paused-dose"
  ]);
});

test("ending a world session creates a new epoch even without tick regression", () => {
  const store = createStore();
  store.ingest(context(100), [metric("drive:1", 0.1)]);
  const first = store.activeSession("world-a", "creature:7");
  store.endWorldSession("world-a");
  store.ingest(context(140), [metric("drive:1", 0.2)]);
  const second = store.activeSession("world-a", "creature:7");
  assert.notEqual(second.id, first.id);
  assert.equal(second.epoch, 2);
  assert.equal(store.stats().sessionCount, 2);
});

test("separator characters cannot merge unrelated world and subject keys", () => {
  const store = createStore();
  store.ingest(context(100, {
    worldKey: "world|a",
    subjectKey: "creature:7"
  }), [metric("drive:1", 0.1)]);
  store.ingest(context(100, {
    worldKey: "world_a",
    subjectKey: "creature:7"
  }), [metric("drive:1", 0.2)]);
  store.ingest(context(100, {
    worldKey: "world",
    subjectKey: "a|creature:7"
  }), [metric("drive:1", 0.3)]);

  assert.equal(store.stats().sessionCount, 3);
  assert.equal(store.metricView(
    "world|a", "creature:7", "drive:1"
  ).summary.current, 0.1);
  assert.equal(store.metricView(
    "world_a", "creature:7", "drive:1"
  ).summary.current, 0.2);
  assert.equal(store.metricView(
    "world", "a|creature:7", "drive:1"
  ).summary.current, 0.3);
});
