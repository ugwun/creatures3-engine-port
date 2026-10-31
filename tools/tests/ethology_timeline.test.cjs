"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Timeline = require("../ethology_timeline.js");

function observation(tick, changes = {}) {
  const endpoint = {
    schemaVersion: 1,
    source: "GET /api/creature/:id/observation",
    contextTiming: "engine_main_thread",
    worldName: changes.worldName || "Timeline World",
    worldTick: tick,
    systemTick: tick + 1000,
    capturedAtWallTimeMs: tick * 50,
    enginePaused: Boolean(changes.enginePaused),
    gameSpeed: changes.gameSpeed == null ? 1 : changes.gameSpeed,
    creature: {
      agentId: changes.agentId == null ? 7 : changes.agentId,
      moniker: changes.moniker || "ada-moniker",
      name: changes.name || "Ada",
      lifeState: changes.lifeState || "alert",
      ageStage: changes.ageStage == null ? 2 : changes.ageStage,
      ageInTicks: changes.ageInTicks == null ? tick : changes.ageInTicks,
      roomId: changes.roomId == null ? 4 : changes.roomId,
      metaRoomId: changes.metaRoomId == null ? 1 : changes.metaRoomId,
      posX: changes.posX == null ? 100 : changes.posX,
      posY: changes.posY == null ? 200 : changes.posY
    },
    environment: {
      roomId: changes.roomId == null ? 4 : changes.roomId,
      metaRoomId: changes.metaRoomId == null ? 1 : changes.metaRoomId
    },
    pressure: {
      highestDriveId: changes.highestDriveId == null
        ? 2 : changes.highestDriveId,
      highestDriveLabel: changes.highestDriveLabel || "Hunger",
      highestDriveValue: changes.highestDriveValue == null
        ? 0.4 : changes.highestDriveValue,
      drives: changes.drives || [
        { id: 2, label: "Hunger", value: 0.4 }
      ]
    },
    attention: {
      winnerId: changes.attentionId == null ? 11 : changes.attentionId,
      winnerLabel: changes.attentionLabel || "Food",
      winnerActivity: 0.8,
      currentTarget: changes.target === undefined ? {
        agentId: 9,
        family: 2,
        genus: 11,
        species: 1,
        gallery: "food",
        categoryId: 11,
        categoryLabel: "Food"
      } : changes.target
    },
    selection: {
      winnerId: changes.decisionId == null ? 12 : changes.decisionId,
      winnerLabel: changes.decisionLabel || "Eat",
      winnerActivity: 0.9,
      currentActionOffset: changes.decisionId == null
        ? 12 : changes.decisionId
    },
    action: changes.action || {
      running: false,
      state: "idle"
    }
  };
  return {
    schemaVersion: 1,
    worldKey: changes.worldKey || "world:timeline",
    subjectKey: "creature:" + endpoint.creature.moniker,
    subjectLabel: endpoint.creature.name,
    worldTick: tick,
    systemTick: endpoint.systemTick,
    capturedAtWallTimeMs: endpoint.capturedAtWallTimeMs,
    enginePaused: endpoint.enginePaused,
    gameSpeed: endpoint.gameSpeed,
    stages: changes.actionLabel ? [{
      id: "action",
      summary: changes.actionLabel + " · running"
    }] : [],
    rawSources: { endpoint }
  };
}

function physiology(metricValue = 0.1, organStatus = "healthy") {
  return {
    sourceRecords: [{
      type: "creature_chemistry",
      source: "GET /api/creature/:id/chemistry",
      worldTick: 100
    }],
    metrics: [
      {
        id: "chemical:204",
        label: "Reward",
        value: metricValue,
        unit: "concentration",
        largeDelta: 0.05
      }
    ],
    organs: [{
      id: "organ:3",
      label: "Immune organ",
      status: organStatus,
      lifeForce: organStatus === "healthy" ? 0.9 : 0.2
    }]
  };
}

test("polled transitions retain ranges, provenance, and uncertainty", () => {
  const store = Timeline.createStore();
  assert.equal(store.ingestObservation(observation(100), {
    sampleIntervalMs: 1000,
    physiology: physiology(0)
  }).events.length, 0);

  const result = store.ingestObservation(observation(120, {
    lifeState: "asleep",
    ageStage: 3,
    roomId: 8,
    metaRoomId: 2,
    highestDriveId: 3,
    highestDriveLabel: "Tiredness",
    drives: [{ id: 2, label: "Hunger", value: 0.82 }],
    attentionId: 12,
    attentionLabel: "Machine",
    target: {
      agentId: 10,
      family: 2,
      genus: 12,
      species: 1,
      gallery: "mach",
      categoryId: 12,
      categoryLabel: "Machine"
    },
    decisionId: 15,
    decisionLabel: "Rest"
  }), {
    sampleIntervalMs: 1000,
    physiology: physiology(0.2, "impaired")
  });

  const events = result.events;
  for (const kind of [
    "life_state", "age_stage", "room_change", "highest_drive",
    "drive_threshold", "attention_winner", "attention_target",
    "decision_winner", "reinforcement_pulse", "organ_status"
  ]) {
    assert.ok(events.some(event => event.transitionKind === kind), kind);
  }
  const room = events.find(event => event.transitionKind === "room_change");
  assert.deepEqual([room.startTick, room.endTick], [100, 120]);
  assert.equal(room.exactTick, false);
  assert.equal(room.evidenceLevel, "derived");
  assert.match(room.uncertainty, /between sampled ticks 100 and 120/);
  assert.equal(room.sourceRecords.length, 2);
  assert.equal(room.subjectAgentId, 7);
  const reward = events.find(event =>
    event.transitionKind === "reinforcement_pulse");
  assert.ok(reward.sourceRecords.some(source =>
    source.type === "creature_chemistry"));
});

test("script start, block, resume, and finish remain sampled transitions", () => {
  const store = Timeline.createStore();
  store.ingestObservation(observation(10), { sampleIntervalMs: 1000 });
  const script = { family: 4, genus: 1, species: 1, event: 28 };
  store.ingestObservation(observation(20, {
    actionLabel: "Eat",
    action: { running: true, state: "running", script, targ: 7,
      itAtScriptStart: 9 }
  }), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(30, {
    actionLabel: "Eat",
    action: { running: true, state: "blocking", blockingCommand: "OVER",
      blockReason: "animation", script, targ: 7, itAtScriptStart: 9 }
  }), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(40, {
    actionLabel: "Eat",
    action: { running: true, state: "running", script, targ: 7,
      itAtScriptStart: 9 }
  }), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(50), { sampleIntervalMs: 1000 });
  const kinds = store.query().map(event => event.transitionKind);
  assert.ok(kinds.includes("script_start"));
  assert.ok(kinds.includes("script_block"));
  assert.ok(kinds.includes("script_resume"));
  assert.ok(kinds.includes("script_finish"));
  assert.ok(store.query().filter(event =>
    event.category === "action").every(event => !event.exactTick));
});

test("gaps are explicit and cannot be hidden by category filters", () => {
  const store = Timeline.createStore();
  store.ingestObservation(observation(10), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(100), { sampleIntervalMs: 1000 });
  store.markGap("recording_paused", {
    startTick: 100,
    endTick: 110,
    label: "Recording paused"
  });
  const gaps = store.query({ categories: ["action"] });
  assert.equal(gaps.length, 2);
  assert.ok(gaps.every(event => event.category === "gap"));
  assert.match(gaps[0].uncertainty,
    /(not evidence.*inactive|no inactivity is implied)/i);
});

test("explicit subject log event supersedes weaker overlapping action inference", () => {
  const store = Timeline.createStore();
  const script = { family: 4, genus: 1, species: 1, event: 28 };
  store.ingestObservation(observation(10), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(20, {
    actionLabel: "Eat",
    action: { running: true, state: "running", script }
  }), { sampleIntervalMs: 1000 });
  assert.ok(store.query().some(event =>
    event.transitionKind === "script_start"));
  const explicit = store.ingestLog({
    id: "log-1",
    worldName: "Timeline World",
    worldTick: 15,
    contextTiming: "engine_main_thread",
    severity: "info",
    subsystem: "caos",
    message: "Eat event dispatched",
    agent: { id: 7 },
    script
  });
  assert.equal(explicit.explicit, true);
  assert.equal(explicit.exactTick, true);
  assert.ok(!store.query().some(event =>
    event.transitionKind === "script_start"));
  assert.equal(store.ingestLog({
    id: "wrong-agent",
    worldTick: 15,
    severity: "error",
    agent: { id: 99 },
    message: "Unrelated"
  }), null);
});

test("interventions preserve target, exact tick, and correlation", () => {
  const store = Timeline.createStore();
  store.ingestObservation(observation(10), { sampleIntervalMs: 1000 });
  const event = store.ingestIntervention({
    id: "iv-1",
    type: "chemical_write",
    label: "Set hunger",
    tick: 12,
    worldKey: "world:timeline",
    target: { creatureId: 7 },
    correlationId: "corr-1"
  });
  assert.equal(event.category, "intervention");
  assert.equal(event.evidenceLevel, "observed");
  assert.equal(event.exactTick, true);
  assert.equal(event.correlationId, "corr-1");
});

test("world, creature, and tick-regression contexts never mix", () => {
  const store = Timeline.createStore();
  store.ingestObservation(observation(10), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(20, {
    moniker: "bea-moniker", agentId: 8, name: "Bea"
  }), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(5, {
    moniker: "ada-moniker"
  }), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(6, {
    worldKey: "world:other", worldName: "Other World"
  }), { sampleIntervalMs: 1000 });
  const sessions = store.allSessions();
  assert.equal(sessions.length, 4, JSON.stringify(sessions, null, 2));
  assert.equal(new Set(sessions.map(session =>
    session.worldKey + "/" + session.subjectKey + "/" + session.epoch
  )).size, 4);
});

test("bounds, query, downsampling, bookmarks, and nearest snapshot are stable", () => {
  const store = Timeline.createStore({
    maxEvents: 10,
    maxSnapshots: 3,
    maxBytes: 100000,
    maxDurationTicks: 1000
  });
  for (let tick = 0; tick <= 120; tick += 10) {
    store.ingestObservation(observation(tick, {
      attentionId: tick / 10,
      attentionLabel: "Category " + tick
    }), { sampleIntervalMs: 500 });
  }
  const session = store.activeSession();
  assert.ok(session.eventCount <= 10);
  assert.ok(session.snapshotCount <= 3);
  assert.ok(session.droppedEvents > 0);
  const all = store.query();
  const selected = all[all.length - 1];
  assert.equal(store.updateEvent(session.id, selected.id, {
    bookmarked: true,
    annotation: "Review this change"
  }), true);
  assert.equal(store.getEvent(session.id, selected.id).annotation,
    "Review this change");
  assert.equal(store.nearestSnapshot(session.id, 115).worldTick, 110);

  const many = Array.from({ length: 12 }, (_, index) => ({
    id: "e" + index,
    category: "action",
    startTick: index,
    endTick: index,
    explicit: index < 6,
    bookmarked: index === 6
  }));
  const sampled = store.downsample(many, 4);
  assert.ok(sampled.length >= 7);
  assert.ok(many.filter(event =>
    event.explicit || event.bookmarked).every(event =>
      sampled.some(item => item.id === event.id)));
});

test("duration is a hard bound even for bookmarks", () => {
  const store = Timeline.createStore({
    maxEvents: 100,
    maxSnapshots: 100,
    maxBytes: 1000000,
    maxDurationTicks: 20
  });
  store.ingestObservation(observation(10), { sampleIntervalMs: 500 });
  store.ingestObservation(observation(20, {
    attentionId: 12
  }), { sampleIntervalMs: 500 });
  const old = store.query()[0];
  store.updateEvent(store.activeSession().id, old.id, {
    bookmarked: true
  });
  store.ingestObservation(observation(60, {
    attentionId: 13
  }), { sampleIntervalMs: 500 });
  assert.ok(!store.query().some(event => event.id === old.id));
  assert.ok(store.activeSession().droppedEvents > 0);
});

test("JSON and JSONL round-trip into read-only offline sessions", () => {
  const store = Timeline.createStore();
  store.ingestObservation(observation(10), { sampleIntervalMs: 1000 });
  store.ingestObservation(observation(20, {
    roomId: 5
  }), { sampleIntervalMs: 1000 });
  const payload = store.exportSession();
  const json = Timeline.serializeRecording(payload, "json");
  const jsonl = Timeline.serializeRecording(payload, "jsonl");
  const csv = Timeline.serializeRecording(payload, "csv");
  assert.equal(Timeline.parseRecording(json).events.length,
    payload.events.length);
  assert.equal(Timeline.parseRecording(jsonl).snapshots.length,
    payload.snapshots.length);
  assert.match(csv, /"evidenceLevel"/);
  assert.match(csv, /"sourceRecords"/);

  const offline = Timeline.createStore();
  const imported = offline.importRecording(jsonl);
  assert.equal(imported.imported, true);
  assert.equal(imported.readOnly, true);
  assert.equal(offline.query({ sessionId: imported.id }).length,
    payload.events.length);
  assert.equal(offline.nearestSnapshot(imported.id, 19).worldTick, 20);
});

test("old recordings are discarded instead of growing without limit", () => {
  const store = Timeline.createStore();
  for (let index = 0; index < 40; index++) {
    store.setContext({
      worldKey: "Lab@1-1.1",
      worldName: "Lab",
      subjectKey: "creature:" + index,
      subjectLabel: "Subject " + index,
      worldTick: index
    });
  }
  const sessions = store.allSessions();
  assert.ok(sessions.length <= 25, sessions.length + " sessions retained");
  assert.ok(sessions.some(session => session.subjectKey === "creature:39"));
});
