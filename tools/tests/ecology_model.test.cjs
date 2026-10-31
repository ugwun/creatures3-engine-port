"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Ecology = require("../ecology_model.js");

function sample(overrides) {
  return Ecology.normalizeSnapshot(Object.assign({
    schemaVersion: 1,
    source: "GET /api/ecology/snapshot",
    worldName: "Disposable",
    worldTick: 120,
    capturedAtWallTimeMs: 1000,
    selectedMetaRoomId: 4,
    channels: [{
      id: 3,
      worldCategoryId: null,
      worldCategoryLabel: null,
      semanticSource: null
    }],
    rooms: [
      {
        id: 10, metaRoomId: 4, left: 0, right: 100,
        ceilingLeft: 0, ceilingRight: 0,
        floorLeft: 100, floorRight: 100,
        ca: [{ channelId: 3, value: 0.2, change: 0.01 }]
      },
      {
        id: 11, metaRoomId: 4, left: 100, right: 200,
        ceilingLeft: 0, ceilingRight: 0,
        floorLeft: 100, floorRight: 100,
        ca: [{ channelId: 3, value: 0.5, change: 0.02 }]
      },
      {
        id: 12, metaRoomId: 4, left: 200, right: 300,
        ceilingLeft: 0, ceilingRight: 0,
        floorLeft: 100, floorRight: 100,
        ca: [{ channelId: 3, value: 0.1, change: -0.01 }]
      }
    ],
    connections: [
      { kind: "door", roomA: 10, roomB: 11, permeability: 80 },
      { kind: "link", roomA: 11, roomB: 12, permeability: 20 }
    ],
    agents: [
      {
        agentId: 7, roomId: 10, metaRoomId: 4,
        posX: 25, posY: 50, family: 4, genus: 1,
        species: 1, isCreature: true
      },
      {
        agentId: 8, roomId: 12, metaRoomId: 4,
        posX: 250, posY: 50, family: 2, genus: 11,
        species: 1, isCreature: false
      }
    ]
  }, overrides));
}

test("keeps unknown CA meanings unknown", () => {
  assert.equal(Ecology.channelName(sample().channels[0]),
    "CA 3 · meaning unknown");
  assert.equal(Ecology.channelName({
    id: 3,
    worldCategoryLabel: "Food"
  }), "Food · CA 3");
});

test("creates room polygons from actual sloped geometry", () => {
  assert.equal(Ecology.roomPolygon(sample().rooms[0]),
    "0,0 100,0 100,100 0,100");
});

test("derives a connectivity chain without calling it an engine route", () => {
  const route = Ecology.candidatePath(sample(), 10, 12, 10);
  assert.equal(route.status, "candidate");
  assert.deepEqual(route.rooms, [10, 11, 12]);
  assert.match(route.method, /not an engine-selected route/);

  const blocked = Ecology.candidatePath(sample(), 10, 12, 50);
  assert.equal(blocked.status, "disconnected");
});

test("reachable agent query respects graph and classifier filters", () => {
  assert.deepEqual(Ecology.reachableAgents(sample(), 10, {
    minimumPermeability: 50
  }).map(agent => agent.agentId), [7]);
  assert.deepEqual(Ecology.reachableAgents(sample(), 10, {
    minimumPermeability: 10,
    family: 2
  }).map(agent => agent.agentId), [8]);
});

test("compares coherent room CA samples without assigning causation", () => {
  const result = Ecology.compareRooms(sample(), 10, 11, 3);
  assert.equal(result.difference, 0.3);
  assert.equal(result.method,
    "target room sample minus source room sample");
});

test("separates objective, sampled, sensory, and inferred evidence", () => {
  const relative = Ecology.creatureRelative(sample(), {
    creature: { agentId: 7, roomId: 10 },
    environment: {
      roomId: 10,
      caChannels: [{ id: 3, value: 0.2 }]
    },
    perception: {
      channels: [{
        lobe: "smel",
        available: true,
        winnerId: 5,
        winnerLabel: "Food",
        winnerActivity: 0.8
      }]
    },
    attention: {
      currentTarget: { agentId: 8 }
    }
  }, 3);
  assert.equal(relative.objective.evidence, "observed");
  assert.equal(relative.sampledAtCreature.channel.value, 0.2);
  assert.equal(relative.sensoryAvailability.winnerId, 5);
  assert.equal(relative.inferredRelevance.evidence, "inferred");
});

test("reports the strongest channel and smell signal when there is no winner", () => {
  const relative = Ecology.creatureRelative(sample(), {
    creature: { agentId: 7, roomId: 10 },
    environment: {
      roomId: 10,
      caRoomId: 12,
      caChannels: [
        { id: 0, value: 0, label: "Sound" },
        { id: 3, value: 0.2, label: "Food" },
        { id: 8, value: 0.9, label: "Water" }
      ]
    },
    perception: {
      channels: [{
        lobe: "smel",
        available: true,
        winnerId: null,
        winnerLabel: null,
        winnerActivity: null,
        candidates: [
          { id: 4, label: "fruit", activity: 0.87 },
          { id: 0, label: "self", activity: 0 }
        ]
      }]
    }
  }, 0);
  assert.equal(relative.sampledAtCreature.roomId, 12);
  assert.equal(relative.sampledAtCreature.channel.value, 0);
  assert.equal(relative.sampledAtCreature.strongestChannel.id, 8);
  assert.equal(relative.sensoryAvailability.strongest.label, "fruit");
  assert.match(relative.sensoryAvailability.note, /no winner/);
});

test("a creature outside every room has no sample, not a zero", () => {
  const relative = Ecology.creatureRelative(sample(), {
    creature: { agentId: 7, roomId: 10 },
    environment: { roomId: 10, caRoomId: null, caChannels: [] },
    perception: { channels: [] }
  }, 0);
  assert.equal(relative.sampledAtCreature.roomId, null);
  assert.equal(relative.sampledAtCreature.available, false);
  assert.ok(!relative.sampledAtCreature.channel);
});

test("an all-zero room has no strongest channel", () => {
  const relative = Ecology.creatureRelative(sample(), {
    creature: { agentId: 7, roomId: 10 },
    environment: {
      roomId: 10,
      caChannels: [{ id: 0, value: 0 }, { id: 1, value: 0 }]
    },
    perception: { channels: [] }
  }, 0);
  assert.equal(relative.sampledAtCreature.available, true);
  assert.equal(relative.sampledAtCreature.strongestChannel, null);
});

test("does not infer relevance from proximity when target is absent", () => {
  const relative = Ecology.creatureRelative(sample(), {
    creature: { agentId: 7, roomId: 10 },
    environment: { roomId: 10, caChannels: [] },
    perception: { channels: [] },
    attention: { currentTarget: null }
  }, 3);
  assert.equal(relative.sensoryAvailability.evidence, "unknown");
  assert.equal(relative.inferredRelevance.evidence, "unknown");
});

test("marks old captures stale and retains a bounded trace", () => {
  assert.equal(Ecology.sampleFreshness(sample(), 8001, 3000).status,
    "stale");
  let trace = [];
  for (let tick = 0; tick < 100; tick++) {
    trace = Ecology.updateTrace(trace, sample({
      worldTick: tick,
      agents: [{
        agentId: 7, roomId: 10, metaRoomId: 4,
        posX: tick, posY: 50
      }]
    }), 7);
  }
  assert.equal(trace.length, Ecology.TRACE_LIMIT);
  assert.equal(trace[0].worldTick, 20);
  const switched = Ecology.updateTrace(trace, sample({
    worldTick: 100,
    agents: [{
      agentId: 7, roomId: 99, metaRoomId: 5,
      posX: 1, posY: 2
    }]
  }), 7);
  assert.equal(switched.length, 1);
});

test("normalizes empty and truncated samples", () => {
  const empty = Ecology.normalizeSnapshot({
    roomsTruncated: true,
    agentsTruncated: true,
    connectionsTruncated: true
  });
  assert.deepEqual(empty.rooms, []);
  assert.equal(empty.roomsTruncated, true);
  assert.equal(empty.readOnly, false);
  assert.equal(empty.connectionsTruncated, true);
  assert.equal(empty.selectedMetaRoomId, null);
  assert.equal(Ecology.roomById(empty, null), null);
  assert.equal(Ecology.agentById(empty, null), null);
});
