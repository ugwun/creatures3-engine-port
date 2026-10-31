"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeState,
  createTracker,
  buildView,
  formatStateSummary
} = require("../scripts_model.js");

function script(agentId, overrides = {}) {
  return Object.assign({
    agentId,
    family: 2,
    genus: 14,
    species: 8,
    event: 9,
    state: "running",
    ip: 10,
    source: "setv ov00 1",
    gallery: "rotorfly",
    agentFamily: 2,
    agentGenus: 14,
    agentSpecies: 8
  }, overrides);
}

test("blocking state only claims WAIT when the VM reports WAIT", () => {
  assert.equal(normalizeState(script(1)), "running");
  assert.equal(normalizeState(script(1, {
    state: "blocking",
    blockingCommand: "WAIT"
  })), "waiting");
  assert.equal(normalizeState(script(1, {
    state: "blocking",
    blockingCommand: "OVER"
  })), "blocking");
  assert.equal(normalizeState(script(1, { state: "paused" })), "paused");
});

test("tracker records new, changed, and bounded finished transitions", () => {
  const tracker = createTracker({ retentionMs: 5000 });
  let records = tracker.ingest([script(10)], 1000);
  assert.equal(records[0].newlyStarted, true);
  assert.equal(records[0].changed, false);

  records = tracker.ingest([script(10)], 2000);
  assert.equal(records[0].newlyStarted, false);
  assert.equal(records[0].changed, false);

  records = tracker.ingest([script(10, { ip: 12 })], 3000);
  assert.equal(records[0].changed, true);

  records = tracker.ingest([], 4000);
  assert.equal(records[0].displayState, "finished");
  assert.equal(records[0].changed, true);

  records = tracker.ingest([], 5000);
  assert.equal(records[0].changed, false);
  assert.equal(tracker.ingest([], 9001).length, 0);
});

test("filters cover classifier, event, gallery, creature, and activity flags", () => {
  const tracker = createTracker();
  const records = tracker.ingest([
    script(1, {
      family: 4,
      genus: 1,
      species: 2,
      event: 16,
      eventName: "Activate 1",
      gallery: "norn",
      agentFamily: 4
    }),
    script(2, { newlyStarted: false })
  ], 1000);
  records[0].changed = true;

  assert.equal(buildView(records, {
    classifier: "4 1 2",
    event: "activate",
    gallery: "norn",
    creaturesOnly: true,
    changedOnly: true
  }, { grouped: false }).length, 1);
  assert.equal(buildView(records, {
    state: "paused"
  }, { grouped: false }).length, 0);
});

test("groups collapse identical classifiers and prioritize selected agents", () => {
  const tracker = createTracker();
  const records = tracker.ingest([
    script(1),
    script(2),
    script(3, { genus: 5, gallery: "trapper" })
  ], 1000);
  const collapsed = new Set(["2 14 8 9"]);
  const view = buildView(records, {}, {
    grouped: true,
    collapsedGroups: collapsed,
    selectedAgentId: 2
  });

  assert.equal(view.length, 2);
  assert.equal(view[0].classifierKey, "2 14 8 9");
  assert.equal(view[0].records.length, 2);
  assert.equal(view[0].selected, true);
  assert.equal(view[0].collapsed, false);
  assert.equal(view[0].records[0].agentId, 2);
  assert.equal(formatStateSummary(view[0].counts), "2 running");
});
