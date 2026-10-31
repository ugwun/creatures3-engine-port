"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Model = require("../caos_workbench_model.js");
const Provenance = require("../provenance_transport.js");

function context(extra) {
  return Object.assign({
    worldName: "Task 15",
    worldSessionId: "1-2.3",
    worldTick: 100,
    systemTick: 200,
    connectionStatus: "connected",
    enginePaused: false,
    targetAgentId: 42,
    targetAgentClassifier: { family: 2, genus: 3, species: 4 },
    ownerAgentId: null,
    runningScript: null,
    experimentRecording: true
  }, extra || {});
}

test("uses the same stable checksum contract as the engine", () => {
  assert.equal(Model.fingerprint(""), "fnv1a64:cbf29ce484222325");
  assert.equal(Model.fingerprint("abc"), "fnv1a64:e71fa2190541574b");
});

test("distinguishes read-only, mutating, destructive, and unknown source", () => {
  assert.equal(Model.analyzeRisk('outs "hello" outv wtik').level, "unknown");
  assert.equal(Model.analyzeRisk('outs "hello" outv va00').level, "read-only");
  assert.equal(Model.analyzeRisk("setv va00 4 chem 75 va00").level, "mutating");
  assert.equal(Model.analyzeRisk("setv ov00 4").level, "mutating");
  assert.equal(Model.analyzeRisk("rtar 2 3 4 outv ov00").level, "read-only");
  assert.equal(Model.analyzeRisk("rscr 2 3 4 5").level, "broad-or-destructive");
  assert.equal(Model.analyzeRisk('rtar 4 0 0 aslp 1').level, "mutating");
  assert.equal(Model.analyzeRisk('setv game "probe" 1').level, "mutating");
  assert.equal(Model.analyzeRisk('sets name "probe" "x"').level, "mutating");
  assert.equal(Model.analyzeRisk("setv va00 1").level, "read-only");
});

test("install refuses an occupied classifier and replace binds its checksum", () => {
  const existing = { source: 'outs "old"' };
  const install = Model.plan({
    mode: "install",
    context: context(),
    source: 'outs "new"',
    classifier: { family: 2, genus: 3, species: 4, event: 5 },
    existingScript: existing,
    validation: { ok: true }
  });
  assert.equal(install.canApply, false);
  assert.match(install.errors.join(" "), /Replace event/);

  const replace = Model.plan({
    mode: "replace",
    context: context(),
    source: 'scrp 2 3 4 5\nouts "new"\nendm',
    classifier: { family: 2, genus: 3, species: 4, event: 5 },
    existingScript: existing,
    validation: { ok: true }
  });
  assert.equal(replace.canApply, true);
  assert.equal(replace.source, 'outs "new"');
  assert.equal(replace.existingChecksum, Model.fingerprint(existing.source));
  assert.ok(replace.diff.some(row => row.type === "remove"));
  assert.ok(replace.diff.some(row => row.type === "add"));
});

test("remove requires an exact existing script and explicit request confirmation", () => {
  const review = Model.plan({
    mode: "remove",
    context: context(),
    classifier: { family: 2, genus: 3, species: 4, event: 5 },
    existingScript: { source: "stop", checksum: "fnv1a64:0123456789abcdef" }
  });
  assert.equal(review.canApply, true);
  assert.equal(review.requiresConfirmation, true);
  const request = Model.apiRequest(review, { confirmed: true });
  assert.equal(request.url, "/api/caos/script");
  assert.equal(request.body.mode, "remove");
  assert.equal(request.body.confirmed, true);
  assert.equal(request.body.expectedExistingChecksum,
    "fnv1a64:0123456789abcdef");
});

test("evaluate carries reviewed world and optional target but never an owner", () => {
  const review = Model.plan({
    mode: "evaluate",
    context: context(),
    source: 'outs "hello"',
    validation: { ok: true }
  });
  const request = Model.apiRequest(review, {
    bindTarget: true,
    pauseBeforeRun: true
  });
  assert.equal(request.url, "/api/caos/evaluate");
  assert.equal(request.body.expectedWorldName, "Task 15");
  assert.equal(request.body.expectedWorldSessionId, "1-2.3");
  assert.equal(request.body.targetAgentId, 42);
  assert.equal(request.body.pauseBeforeRun, true);
  assert.equal(Object.hasOwn(request.body, "ownerAgentId"), false);
  assert.equal(Object.hasOwn(request.body, "classifier"), false);
});

test("stale or incomplete context and invalid classifiers block applying", () => {
  const review = Model.plan({
    mode: "install",
    context: context({ worldName: "Startup", connectionStatus: "disconnected" }),
    source: "stop",
    classifier: { family: -1, genus: 3, species: 4, event: 5 },
    validation: { ok: true }
  });
  assert.equal(review.canApply, false);
  assert.match(review.errors.join(" "), /non-Startup world/);
  assert.match(review.errors.join(" "), /connection is not live/);
  assert.match(review.errors.join(" "), /family/);
});

test("running-script inspection is navigation, not source execution", () => {
  const runningScript = {
    agentId: 99,
    family: 2,
    genus: 3,
    species: 4,
    event: 5
  };
  const review = Model.plan({
    mode: "debug",
    context: context({ runningScript })
  });
  assert.equal(review.canApply, true);
  assert.deepEqual(Model.apiRequest(review), {
    kind: "navigate", tab: "debugger", agentId: 99
  });
});

test("maps compiler offsets to one-based source locations", () => {
  assert.deepEqual(Model.lineAndColumn("one\ntwo", 5), { line: 2, column: 2 });
  assert.equal(Model.lineAndColumn("one", -1), null);
});

test("stale engine validation cannot authorize changed source", () => {
  const review = Model.plan({
    mode: "evaluate",
    context: context(),
    source: 'outs "changed"',
    validation: {
      ok: true,
      sourceChecksum: Model.fingerprint('outs "old"')
    }
  });
  assert.equal(review.canApply, false);
  assert.match(review.errors.join(" "), /different source/);
});

test("remove requests omit unrelated editor source", () => {
  const review = Model.plan({
    mode: "remove",
    context: context(),
    source: 'outs "not part of removal"',
    classifier: { family: 2, genus: 3, species: 4, event: 5 },
    existingScript: { source: "stop" }
  });
  const request = Model.apiRequest(review, { confirmed: true });
  assert.equal(Object.hasOwn(request.body, "source"), false);
  assert.equal(Object.hasOwn(request.body, "sourceChecksum"), false);
});

test("redacts reviewed source while preserving reproducible CAOS provenance", () => {
  const captured = Provenance.sanitizeRequest("/api/caos/script",
    JSON.stringify({
      mode: "replace",
      source: 'outs "secret"',
      sourceChecksum: "fnv1a64:one",
      expectedExistingChecksum: "fnv1a64:old",
      expectedWorldName: "Task 15",
      expectedWorldTick: 12,
      classifier: { family: 2, genus: 3, species: 4, event: 5 },
      confirmed: true
    }));
  assert.equal(captured.type, "script_replace");
  assert.equal(captured.parameters.sourceOmitted, true);
  assert.equal(captured.parameters.sourceLength, 13);
  assert.equal(Object.hasOwn(captured.parameters, "source"), false);
  assert.equal(captured.parameters.expectedExistingChecksum, "fnv1a64:old");
});

test("plan trusts the engine's compiled verdict over the source preview", () => {
  const context = { worldName: "Lab", connectionStatus: "connected" };
  const source = "outv cage";
  const preview = Model.plan({
    mode: "evaluate",
    context,
    source,
    validation: { ok: true, sourceChecksum: Model.fingerprint(source) }
  });
  assert.equal(preview.risk.level, "unknown");

  const readOnly = Model.plan({
    mode: "evaluate",
    context,
    source,
    validation: {
      ok: true,
      sourceChecksum: Model.fingerprint(source),
      risk: {
        level: "read-only", requiresAcknowledgement: false, operations: []
      }
    }
  });
  assert.equal(readOnly.risk.level, "read-only");
  assert.equal(readOnly.requiresConfirmation, false);

  const acting = Model.plan({
    mode: "evaluate",
    context,
    source: "outv twin targ 0",
    validation: {
      ok: true,
      risk: {
        level: "mutating",
        requiresAcknowledgement: true,
        warning: "Source contains world-mutating CAOS commands",
        operations: ["twin"]
      }
    }
  });
  assert.equal(acting.risk.level, "mutating");
  assert.equal(acting.requiresConfirmation, true);
  assert.match(acting.risk.explanation, /twin/);
});
