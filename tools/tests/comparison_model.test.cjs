"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../comparison_model.js");

function creature(id, overrides = {}) {
  return Object.assign({
    agentId: id,
    moniker: "moniker-" + id,
    name: "Creature " + id,
    family: 4,
    genus: 1,
    species: 1,
    sex: id % 2 ? 1 : 2,
    age: 4,
    ageInTicks: 1000 + id,
    lifeState: "alert",
    dead: false,
    glycogenReserve: id / 10,
    drives: [0.1, id / 10],
    highestDrive: 1,
    currentAttentionId: 4,
    currentDecisionId: 7,
    currentTargetAgentId: 99,
    currentTargetCategory: "food",
    actionState: "blocking",
    blockingCommand: "APPR",
    selectedChemicals: [
      { id: 204, concentration: id / 100 }
    ],
    organCount: 4,
    functioningOrgans: 4,
    failedOrgans: 0,
    roomId: 10 + id,
    metaRoomId: 1,
    posX: id * 10,
    posY: id * 20
  }, overrides);
}

function snapshot(tick, creatures, overrides = {}) {
  return Object.assign({
    schemaVersion: 1,
    source: "GET /api/creatures/snapshot",
    contextTiming: "engine_main_thread",
    worldName: "Comparison World",
    worldKey: "world:comparison",
    worldTick: tick,
    systemTick: tick + 100,
    capturedAtWallTimeMs: tick * 50,
    enginePaused: false,
    gameSpeed: 1,
    requestedChemicalIds: [204],
    creatures
  }, overrides);
}

test("statistics expose n, missing values, spread, and raw outliers", () => {
  const result = Model.summarize([
    { id: "a", value: 1 },
    { id: "b", value: 2 },
    { id: "c", value: 3 },
    { id: "d", value: 100 },
    { id: "missing", value: null }
  ]);
  assert.equal(result.n, 4);
  assert.equal(result.total, 5);
  assert.equal(result.missing, 1);
  assert.equal(result.median, 2.5);
  assert.equal(result.min, 1);
  assert.equal(result.max, 100);
  assert.deepEqual(result.outliers.map(value => value.id), ["d"]);
  assert.equal(result.individuals.length, 5);

  const empty = Model.summarize([{ id: "x", value: null }]);
  assert.equal(empty.n, 0);
  assert.equal(empty.missing, 1);
  assert.equal(empty.mean, null);
});

test("snapshot normalization preserves identity and selected measures", () => {
  const value = Model.normalizeSnapshot(snapshot(50, [creature(1)]));
  assert.equal(value.worldTick, 50);
  assert.equal(value.creatures[0].key, "creature:moniker-1");
  assert.equal(value.creatures[0].sex, 1);
  assert.equal(value.creatures[0].lifeState, "alert");
  assert.equal(value.creatures[0].lastObservedWorldTick, 50);
  assert.equal(value.creatures[0].currentAttentionId, 4);
  assert.equal(value.creatures[0].currentDecisionId, 7);
  assert.equal(Model.metricValue(value.creatures[0], "drive:1"), 0.1);
  assert.equal(Model.metricValue(value.creatures[0], "chemical:204"), 0.01);
  assert.equal(Model.metricValue(value.creatures[0], "failed_organs"), 0);
});

test("cohort history retains removed and dead members explicitly", () => {
  const history = Model.createHistory({ maxSnapshots: 3 });
  history.ingest(snapshot(10, [
    creature(1),
    creature(2, { dead: true, lifeState: "dead" })
  ]));
  const second = history.ingest(snapshot(20, [creature(1)]));
  const absent = second.snapshot.creatures.find(member =>
    member.agentId === 2);
  assert.equal(absent.status, "dead");
  assert.match(absent.missingReason, /dead creature absent/);
  assert.equal(absent.lastObservedWorldTick, 10);
  assert.equal(Model.metricValue(absent, "glycogen"), null);
  const demographics = Model.demographics(second.snapshot);
  assert.equal(demographics.n, 2);
  assert.equal(demographics.present, 1);
  assert.equal(demographics.dead, 1);

  history.ingest(snapshot(30, []));
  history.ingest(snapshot(40, []));
  assert.equal(history.activeSession().snapshotCount, 3);
  assert.equal(history.activeSession().droppedSnapshots, 1);
});

test("world switches and tick regressions create isolated history sessions", () => {
  const history = Model.createHistory();
  history.ingest(snapshot(100, [creature(1)]));
  history.ingest(snapshot(50, [creature(1)]));
  history.ingest(snapshot(60, [creature(1)], {
    worldKey: "world:other",
    worldName: "Other"
  }));
  assert.equal(history.sessions().length, 3);
  assert.deepEqual(history.sessions().map(session =>
    session.worldKey), [
      "world:comparison", "world:comparison", "world:other"
  ]);
});

test("distributions retain cohort membership and missing values", () => {
  const normalized = Model.normalizeSnapshot(snapshot(10, [
    creature(1),
    creature(2),
    creature(3, { glycogenReserve: null })
  ]));
  const result = Model.distribution(normalized, "glycogen");
  assert.equal(result.total, 3);
  assert.equal(result.n, 2);
  assert.equal(result.missing, 1);
  assert.equal(result.individuals[0].worldTick, 10);
});

test("nearest tick alignment labels offsets and tolerance failures", () => {
  const values = [
    Model.normalizeSnapshot(snapshot(100, [creature(1)])),
    Model.normalizeSnapshot(snapshot(140, [creature(1)]))
  ];
  const aligned = Model.nearestSnapshot(values, 125, 30);
  assert.equal(aligned.actualTick, 140);
  assert.equal(aligned.tickOffset, 15);
  assert.equal(aligned.missing, false);
  const missing = Model.nearestSnapshot(values, 300, 30);
  assert.equal(missing.missing, true);
  assert.match(missing.missingReason, /tick tolerance/);

  const series = Model.alignSeries({
    a: [{ worldTick: 100, value: 1 }],
    b: [{ worldTick: 140, value: 2 }]
  }, [120], 15);
  assert.equal(series[0].members.a.missing, true);
  assert.equal(series[0].members.b.missing, true);
});

test("movement and behavior rates keep units and subject membership", () => {
  const values = [
    Model.normalizeSnapshot(snapshot(10, [
      creature(1, { posX: 0, posY: 0, roomId: 1 })
    ])),
    Model.normalizeSnapshot(snapshot(20, [
      creature(1, { posX: 3, posY: 4, roomId: 2 })
    ]))
  ];
  const movement = Model.movement(
    values, "creature:moniker-1", 10, 20
  );
  assert.equal(movement.movementDistance, 5);
  assert.deepEqual(movement.roomsVisited, [1, 2]);

  const rates = Model.eventRates([{
    subjectKey: "creature:moniker-1",
    category: "action",
    transitionKind: "script_start",
    startTick: 10,
    endTick: 20,
    count: 2
  }, {
    subjectKey: "creature:other",
    category: "action",
    transitionKind: "script_start",
    startTick: 10,
    endTick: 20
  }], 0, 100, ["creature:moniker-1"]);
  assert.equal(rates[0].count, 2);
  assert.equal(rates[0].ratePer1000Ticks, 20);
});

test("genome comparison exposes structure without embedding genes", () => {
  const left = {
    moniker: "left",
    genes: [
      { type: 1, subtype: 2 },
      { type: 1, subtype: 2 }
    ]
  };
  const right = {
    moniker: "right",
    genes: [
      { type: 1, subtype: 2 },
      { type: 2, subtype: 0 }
    ]
  };
  const diff = Model.diffGenomes(left, right);
  assert.equal(diff.geneCountDelta, 0);
  assert.deepEqual(diff.structural, [
    { key: "1/2", left: 2, right: 1, delta: -1 },
    { key: "2/0", left: 0, right: 1, delta: 1 }
  ]);
  assert.equal("genes" in diff.left, false);
});

test("comparison definitions round-trip without engine payloads", () => {
  const definition = Model.normalizeDefinition({
    id: "compare-1",
    name: "Two Norns",
    mode: "individual",
    worldKey: "world:comparison",
    memberKeys: ["a", "b", "a"],
    metricIds: ["drive:1", "glycogen"],
    timebase: "relative",
    anchorEventId: "event-5"
  });
  assert.deepEqual(definition.memberKeys, ["a", "b"]);
  const parsed = Model.parseDefinition(
    Model.serializeDefinition(definition)
  );
  assert.deepEqual(parsed, definition);
  assert.throws(() => Model.parseDefinition({
    kind: "wrong",
    schemaVersion: 1
  }), /Unsupported/);
});
