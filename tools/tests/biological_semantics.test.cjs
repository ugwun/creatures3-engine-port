"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const semantics = require("../biological_semantics.js");

test("vitality keeps independent observed indicators and treats legacy health as glycogen", () => {
  const chemicals = Array(256).fill(0);
  chemicals[3] = 0.25;
  chemicals[4] = 0.5;
  chemicals[35] = 0.7;
  chemicals[36] = 0.2;
  chemicals[127] = 0.1;
  chemicals[67] = 0.04;

  const vitality = semantics.buildVitalityIndicators(
    { health: 0.99, lifeState: "alert" },
    {
      chemicals,
      organs: [
        { functioning: true, failed: false },
        { functioning: false, failed: true }
      ]
    }
  );

  assert.equal(vitality.reserve.glycogen, 0.5);
  assert.equal(vitality.reserve.glucose, 0.25);
  assert.equal(vitality.energy.atp, 0.7);
  assert.equal(vitality.energy.adp, 0.2);
  assert.equal(vitality.injury, 0.1);
  assert.deepEqual(vitality.organs, {
    total: 2,
    failed: 1,
    atpUnavailableAtLastActivation: 0
  });
  assert.deepEqual(vitality.toxins.map(toxin => toxin.id), [67]);
  assert.deepEqual(vitality.evidenceLevels, {
    measurements: "observed",
    organSummary: "derived",
    toxinDetection: "derived"
  });
  assert.equal(Object.hasOwn(vitality, "score"), false);
});

test("vitality falls back to the compatibility health value only as glycogen", () => {
  const vitality = semantics.buildVitalityIndicators({ health: 0.42 }, null);
  assert.equal(vitality.reserve.glycogen, 0.42);
  assert.equal(vitality.reserve.glucose, null);
});

test("organ role inference identifies its supporting chemicals", () => {
  const inference = semantics.inferOrganRole({
    index: 12,
    reactions: [{ r1: 66, r2: 0, p1: 50, p2: 0 }],
    receptors: [],
    emitters: []
  });

  assert.equal(inference.role, "detoxification");
  assert.equal(inference.evidenceLevel, "inferred");
  assert.deepEqual(inference.chemicalIds, [66]);
  assert.equal(inference.method, "chemical-participation heuristic");
  assert.equal(inference.confidence, null);
  assert.equal(inference.confidenceLabel, "not calibrated");
});

test("vitality toxin panel includes the audited engine-catalogue set", () => {
  assert.deepEqual(
    semantics.TOXINS.map(toxin => toxin.id),
    [56, 66, 67, 68, 69, 70, 71, 72, 75, 78, 79, 80, 81]
  );
});

test("immune inference only uses the engine-catalogued antibody range", () => {
  for (const id of [27, 28, 31]) {
    assert.equal(semantics.inferOrganRole({
      reactions: [{ r1: id, r2: 0, p1: 0, p2: 0 }],
      receptors: [],
      emitters: []
    }), null);
  }

  const inference = semantics.inferOrganRole({
    reactions: [{ r1: 102, r2: 0, p1: 0, p2: 0 }],
    receptors: [],
    emitters: []
  });
  assert.equal(inference.role, "immune activity");
  assert.deepEqual(inference.chemicalIds, [102]);
});

test("organ inference does not assign mammalian names from array position", () => {
  assert.equal(semantics.inferOrganRole({
    index: 0,
    reactions: [],
    receptors: [],
    emitters: []
  }), null);
  assert.equal(semantics.inferOrganRole({
    index: 1,
    reactions: [],
    receptors: [],
    emitters: []
  }), null);
});

test("genome anatomy preserves exact coordinates without mutating the payload", () => {
  const lobes = [
    { index: 0, name: "comb", x: 30, y: 40, width: 4, height: 2 },
    { index: 1, name: "noun", x: 7, y: 9, width: 3, height: 3 }
  ];
  const original = JSON.parse(JSON.stringify(lobes));
  const anatomy = semantics.layoutBrainLobes(lobes, "genome-anatomy");

  assert.deepEqual(anatomy, original);
  assert.notEqual(anatomy[0], lobes[0]);
  assert.deepEqual(lobes, original);
});

test("functional flow is an explicit cloned coordinate transform", () => {
  const lobes = [
    { index: 0, name: "comb", x: 30, y: 40, width: 4, height: 2 },
    { index: 1, name: "noun", x: 7, y: 9, width: 3, height: 3 },
    { index: 2, name: "move", x: 1, y: 2, width: 2, height: 2 }
  ];
  const flow = semantics.layoutBrainLobes(lobes, "functional-flow");

  assert.deepEqual({ x: flow[1].x, y: flow[1].y }, { x: 30, y: 28 });
  assert.deepEqual({ x: flow[2].x, y: flow[2].y }, { x: 30, y: 46 });
  assert.deepEqual({ x: lobes[1].x, y: lobes[1].y }, { x: 7, y: 9 });
  assert.equal(semantics.brainLayoutDescription("functional-flow").evidenceLevel, "derived");
  assert.equal(semantics.brainLayoutDescription("genome-anatomy").evidenceLevel, "observed");
});
