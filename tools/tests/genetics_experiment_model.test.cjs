const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../genetics_experiment_model.js");

function gene(id, overrides) {
  return Object.assign({
    id,
    type: 1,
    subtype: 4,
    typeName: "Biochemistry",
    subtypeName: "InitConc",
    generation: 1,
    switchOnTime: 0,
    flags: { mutable: true, dupable: false, cutable: false },
    mutability: 10,
    variant: 0,
    active: true,
    data: { chemical: 35, amount: 100 }
  }, overrides || {});
}

test("validates safe names and chooses a collision-free copy name", () => {
  assert.equal(Model.validateName("starter_experiment_01").valid, true);
  assert.equal(Model.validateName("../starter").valid, false);
  assert.equal(Model.validateName("starter.gen").valid, false);
  assert.equal(Model.validateName("starter/name").valid, false);
  assert.equal(
    Model.suggestCopyName("starter", [
      "starter_experiment_01", "starter_experiment_02"
    ]),
    "starter_experiment_03");
  assert.equal(
    Model.suggestCopyName("norn.astro.48", []),
    "norn_astro_48_experiment_01");
});

test("creates stable checksums independent of object property order", () => {
  assert.equal(
    Model.checksum({ genes: [{ id: 1, data: { a: 1, b: 2 } }] }),
    Model.checksum({ genes: [{ data: { b: 2, a: 1 }, id: 1 }] })
  );
  assert.notEqual(
    Model.checksum({ genes: [gene(1)] }),
    Model.checksum({ genes: [gene(1, { data: { chemical: 35, amount: 101 } })] })
  );
  assert.equal(
    Model.checksum({ label: "genome 🧬" }),
    Model.checksum({ label: "genome 🧬" }));
});

test("reports field, structural, enabled, and reordered gene changes", () => {
  const source = {
    genes: [gene(1), gene(2, { type: 0, subtype: 0 })]
  };
  const derived = {
    genes: [
      gene(2, { type: 0, subtype: 0 }),
      gene(1, { active: false, data: { chemical: 35, amount: 110 } }),
      gene(3)
    ]
  };
  const diff = Model.structuredDiff(source, derived);
  assert.equal(diff.changed, true);
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.reordered, 2);
  assert.equal(diff.summary.modified, 1);
  assert.equal(diff.summary.fieldChanges, 2);
  const modified = diff.changes.find(change => change.kind === "modified");
  assert.deepEqual(
    modified.fields.map(field => field.path),
    ["active", "data.amount"]);
  assert.equal(modified.relatedView, "chemistry");
});

test("labels unknown gene layouts without inventing a biological meaning", () => {
  const diff = Model.structuredDiff(
    { genes: [] },
    { genes: [gene(9, { type: 9, subtype: 9, typeName: "Unknown" })] }
  );
  assert.equal(diff.changes[0].decoding.evidenceLevel, "unknown");
  assert.match(diff.changes[0].decoding.limitation, /not decoded/);
  const readiness = Model.writeReadiness({
    genes: [gene(9, { type: 9, subtype: 9, typeName: "Unknown" })]
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /unknown/);
});

test("blocks values that cannot round-trip through fixed genome fields", () => {
  const tooLarge = Model.writeReadiness({
    genes: [gene(1, { data: { chemical: 35, amount: 300 } })]
  });
  assert.equal(tooLarge.ready, false);
  assert.match(tooLarge.errors.join(" "), /0 to 255/);

  const malformedBytes = Model.writeReadiness({
    genes: [gene(1, {
      type: 1,
      subtype: 3,
      data: { halfLives: [255] }
    })]
  });
  assert.equal(malformedBytes.ready, false);
  assert.match(malformedBytes.errors.join(" "), /exactly 256 bytes/);

  const missingRuleBytes = Model.writeReadiness({
    genes: [gene(1, {
      type: 0,
      subtype: 0,
      data: { lobeName: "driv", updateTime: 1 }
    })]
  });
  assert.equal(missingRuleBytes.ready, false);
  assert.match(
    missingRuleBytes.errors.join(" "),
    /initRuleBytes is required/);
});

test("requires a saved experimental copy and reviewed branch before injection", () => {
  const base = {
    connected: true,
    worldName: "Disposable Genetics",
    isExperimentalCopy: true,
    savedChecksum: "fnv:1",
    currentChecksum: "fnv:1",
    disposableOrBranchedConfirmed: true,
    reviewConfirmed: true
  };
  assert.equal(Model.injectionReadiness(base).ready, true);
  const blocked = Model.injectionReadiness(Object.assign({}, base, {
    currentChecksum: "fnv:2",
    reviewConfirmed: false
  }));
  assert.equal(blocked.ready, false);
  assert.match(blocked.errors.join(" "), /Save/);
  assert.match(blocked.errors.join(" "), /final/);
});

test("every addable gene type is valid and writable as created", () => {
  const counts = { 0: 3, 1: 6, 2: 9, 3: 1 };
  Object.keys(counts).forEach(typeKey => {
    const type = Number(typeKey);
    for (let subtype = 0; subtype < counts[type]; subtype++) {
      const gene = Model.createBlankGene(type, subtype);
      const readiness = Model.writeReadiness({ genes: [gene] });
      assert.deepEqual(readiness.errors, [], type + "/" + subtype);
      assert.equal(gene.switchOnLabel, "Baby");
      assert.equal(gene.switchOnTime, 0);
    }
  });
});

test("blank neural genes carry complete fixed-length rules", () => {
  [0, 2].forEach(subtype => {
    const gene = Model.createBlankGene(0, subtype);
    assert.equal(gene.data.initRuleBytes.length, 48);
    assert.equal(gene.data.updateRuleBytes.length, 48);
    assert.deepEqual(gene.data.initRule, []);
  });
});

test("blank genes do not share rule arrays", () => {
  const first = Model.createBlankGene(0, 0);
  const second = Model.createBlankGene(0, 0);
  first.data.initRuleBytes[0] = 9;
  assert.equal(second.data.initRuleBytes[0], 0);
});

test("new gene IDs are unique per type and fit the file format", () => {
  const genes = [
    { type: 0, subtype: 0, id: 0 },
    { type: 0, subtype: 0, id: 1 },
    { type: 0, subtype: 2, id: 0 }
  ];
  assert.equal(Model.nextGeneId(genes, 0, 0), 2);
  assert.equal(Model.nextGeneId(genes, 0, 2), 1);
  assert.equal(Model.nextGeneId(genes, 1, 0), 0);

  const full = Array.from({ length: 256 }, (_, id) =>
    ({ type: 1, subtype: 0, id }));
  assert.equal(Model.nextGeneId(full, 1, 0), null);
});
