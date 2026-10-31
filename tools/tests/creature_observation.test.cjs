"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STAGES,
  composeObservation,
  compareObservation,
  competitionFor,
  createCaptureStore
} = require("../creature_observation.js");

function lobe(lobeName, winnerId, winnerLabel, winnerActivity, alternative) {
  return {
    lobe: lobeName,
    available: true,
    winnerId,
    winnerLabel,
    winnerActivity,
    candidates: [
      { id: winnerId, label: winnerLabel, activity: winnerActivity },
      alternative || {
        id: winnerId + 1,
        label: "Alternative",
        activity: Math.max(0, winnerActivity - 0.3)
      }
    ]
  };
}

function endpoint(overrides = {}) {
  const base = {
    schemaVersion: 1,
    source: "GET /api/creature/:id/observation",
    worldName: "Observation Test",
    worldTick: 100,
    systemTick: 500,
    capturedAtWallTimeMs: 1000,
    enginePaused: false,
    gameSpeed: 1,
    creature: {
      agentId: 7,
      moniker: "test-moniker",
      name: "Ada",
      roomId: 4,
      metaRoomId: 1
    },
    environment: {
      roomId: 4,
      metaRoomId: 1,
      nearbySameRoomCount: 1,
      caChannels: [{
        id: 7,
        categoryId: 11,
        label: "Food",
        value: 0.42
      }],
      nearby: [{
        agentId: 9,
        gallery: "food",
        distanceSquared: 400,
        family: 2,
        genus: 11,
        species: 1
      }]
    },
    perception: {
      channels: [
        lobe("visn", 11, "Food", 0.8),
        lobe("smel", 11, "Food", 0.6),
        lobe("noun", 11, "Food", 0.7)
      ]
    },
    pressure: {
      highestDriveId: 2,
      highestDriveLabel: "Hunger (Carb)",
      highestDriveValue: 0.75,
      drives: []
    },
    attention: Object.assign(lobe("attn", 11, "Food", 0.8), {
      motorAttentionId: 11,
      currentTarget: {
        agentId: 9,
        categoryId: 11,
        categoryLabel: "Food",
        gallery: "food",
        family: 2,
        genus: 11,
        species: 1
      },
      introspective: false
    }),
    selection: Object.assign(lobe("decn", 12, "Eat", 0.9), {
      currentActionOffset: 12,
      currentInvoluntaryAction: -1
    }),
    action: {
      running: true,
      state: "blocking",
      blockingCommand: "OVER",
      blockReason: "OVER animation completion",
      script: { family: 4, genus: 1, species: 1, event: 28 },
      sourceStatement: "over",
      targ: 7,
      itAtScriptStart: 9
    }
  };
  return Object.assign(base, overrides);
}

function compose(overrides = {}) {
  return composeObservation(Object.assign({
    endpoint: endpoint(),
    worldKey: "Observation Test",
    subjectKey: "creature:test-moniker",
    subjectLabel: "Ada",
    sampleIntervalMs: 2000,
    capturedAtWallTimeMs: 1100,
    eventNames: { 28: "Eat on Agents" },
    recentChanges: [{
      id: "drive:2",
      label: "Hunger (Carb)",
      previousDelta: -0.1,
      worldTick: 100,
      sourceEndpoint: "GET /api/creatures"
    }]
  }, overrides));
}

test("composes all seven stages with source ticks and careful wording", () => {
  const observation = compose();
  assert.deepEqual(
    observation.stages.map(stage => stage.id),
    STAGES.map(stage => stage.id)
  );
  assert.equal(
    observation.stages.every(stage => stage.evidence.worldTick === 100),
    true
  );
  assert.equal(observation.timing.aligned, true);
  assert.match(observation.stages[3].summary, /Food/);
  assert.match(observation.stages[3].detail, /Current IT/);
  assert.match(observation.stages[5].summary, /Eat on Agents/);
  assert.doesNotMatch(JSON.stringify(observation), /\bbecause\b/i);
  assert.match(observation.causalWarning, /not a certain causal chain/);
});

test("missing endpoint data keeps every stage visible as unknown", () => {
  const observation = composeObservation({
    endpoint: { error: "Creature not found" },
    worldKey: "Observation Test",
    subjectKey: "creature:missing"
  });
  assert.equal(observation.stages.length, 7);
  assert.equal(
    observation.stages.every(stage =>
      stage.status === "unknown" &&
        stage.summary === "Unknown" &&
        stage.evidence.worldTick === null
    ),
    true
  );
  assert.match(observation.timing.warning, /Creature not found/);
});

test("nonstandard missing lobes become unknown stages instead of disappearing", () => {
  const raw = endpoint({
    perception: { channels: [] },
    attention: { available: false },
    selection: { available: false }
  });
  const observation = compose({ endpoint: raw, recentChanges: [] });
  for (const id of ["perception", "attention", "selection", "consequence"]) {
    assert.equal(
      observation.stages.find(stage => stage.id === id).status,
      "unknown"
    );
  }
});

test("different consequence ticks expose cadence and ordering uncertainty", () => {
  const observation = compose({
    recentChanges: [{
      id: "chemical:35",
      label: "ATP",
      previousDelta: 0.1,
      worldTick: 96,
      sourceEndpoint: "GET /api/creature/:id/chemistry"
    }]
  });
  assert.deepEqual(observation.timing.ticks, [96, 100]);
  assert.equal(observation.timing.aligned, false);
  assert.match(observation.timing.warning, /cannot establish exact event order/);
  assert.equal(
    observation.stages.find(stage => stage.id === "consequence")
      .evidence.level,
    "derived"
  );
});

test("weak or close winners retain the competing observed value", () => {
  const result = competitionFor(lobe(
    "attn", 11, "Food", 0.18,
    { id: 6, label: "Toy", activity: 0.16 }
  ));
  assert.equal(result.weak, true);
  assert.equal(result.close, true);
  assert.equal(result.alternative.label, "Toy");
  assert.equal(result.evidenceLevel, "derived");
});

test("a stronger non-winner is reported as an overtaking signal", () => {
  const result = competitionFor(lobe(
    "visn", 0, "Self", 0,
    { id: 11, label: "Food", activity: 0.7 }
  ));
  assert.equal(result.overtaken, true);
  assert.equal(result.close, false);
  assert.match(result.explanation, /stronger activity/);
});

test("perception exposes an overtaking signal without replacing the recorded winner", () => {
  const raw = endpoint({
    perception: {
      channels: [
        lobe("visn", 0, "Self", 0,
          { id: 11, label: "Food", activity: 0.7 })
      ]
    }
  });
  const perception = compose({ endpoint: raw }).stages.find(
    stage => stage.id === "perception"
  );
  assert.equal(perception.summary, "visn Self");
  assert.equal(perception.competition.overtaken, true);
  assert.equal(perception.competition.alternative.label, "Food");
});

test("idle action is an observed VM state rather than unknown intent", () => {
  const raw = endpoint({
    action: {
      running: false,
      state: "idle",
      script: null,
      targ: null,
      itAtScriptStart: null
    }
  });
  const action = compose({ endpoint: raw }).stages.find(
    stage => stage.id === "action"
  );
  assert.equal(action.status, "available");
  assert.equal(action.summary, "No running creature script");
  assert.match(action.detail, /observed VM state/);
});

test("raw endpoint and retained-series sources survive composition", () => {
  const observation = compose();
  assert.equal(observation.rawSources.endpoint.action.sourceStatement, "over");
  assert.equal(
    observation.rawSources.recentChanges[0].sourceEndpoint,
    "GET /api/creatures"
  );
  assert.equal(
    observation.stages.find(stage => stage.id === "attention")
      .targetNavigation.id,
    9
  );
  const action = observation.stages.find(stage => stage.id === "action");
  assert.equal(action.navigation.tab, "scripts");
  assert.equal(action.targetNavigation.tab, "debugger");
});

test("comparison labels changed and unchanged stages without mutating inputs", () => {
  const first = compose();
  const captured = {
    id: "capture-1",
    name: "Before",
    worldTick: first.worldTick,
    observation: first
  };
  const changedEndpoint = endpoint();
  changedEndpoint.pressure.highestDriveValue = 0.5;
  const second = compose({ endpoint: changedEndpoint });
  const compared = compareObservation(second, captured);
  assert.equal(
    compared.stages.find(stage => stage.id === "environment").comparison,
    "unchanged"
  );
  assert.equal(
    compared.stages.find(stage => stage.id === "pressure").comparison,
    "changed"
  );
  assert.equal(first.stages[2].comparison, undefined);
});

test("capture store is bounded and clears across creature or world sessions", () => {
  const store = createCaptureStore({ limit: 2 });
  const observation = compose();
  store.add("First", observation, 2000);
  store.add("Second", observation, 2100);
  store.add("Third", observation, 2200);
  assert.deepEqual(
    store.all().map(capture => capture.name),
    ["Second", "Third"]
  );
  assert.equal(store.latest().worldTick, 100);

  store.setSession("Observation Test", "creature:other");
  assert.equal(store.stats().count, 0);
  store.add("", Object.assign({}, observation, {
    subjectKey: "creature:other",
    worldTick: 120
  }), 2300);
  assert.equal(store.latest().name, "Observation at tick 120");

  store.setSession("Different World", "creature:other");
  assert.equal(store.latest(), null);
});

test("input lobes report their strongest signal rather than a winner", () => {
  const observation = composeObservation({
    creatureKey: "creature:a",
    endpoint: {
      worldName: "Lab",
      worldTick: 10,
      creature: { agentId: 1 },
      perception: {
        channels: [{
          lobe: "smel",
          available: true,
          winnerId: null,
          candidates: [
            { id: 4, label: "fruit", activity: 0.87 },
            { id: 0, label: "self", activity: 0 }
          ]
        }]
      }
    }
  });
  const stage = observation.stages.find(item => item.id === "perception");
  assert.equal(stage.status, "available");
  assert.match(stage.summary, /smel fruit/);
  assert.equal(stage.competition, null);
});
