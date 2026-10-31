"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Experiment = require("../experiment_model.js");
const Transport = require("../provenance_transport.js");

function context() {
  return {
    worldName: "Disposable Experiment",
    worldType: "undocked",
    worldTick: 100,
    systemTick: 200,
    enginePaused: false,
    gameSpeed: 1,
    engineBuildIdentifier: "abc123-dirty",
    engineBuildIdentifierSource: "CMake-configured source revision",
    gameBuildIdentifier: "195",
    launch: {
      headless: true,
      developerTools: true,
      options: ["--headless", "--world", "Disposable Experiment"],
      pathValuesOmitted: true
    }
  };
}

function definition() {
  return {
    title: "Food approach",
    question: "Does the treatment differ from the control?",
    explicitlyDisposableOrBranched: true,
    protocol: {
      baselineDurationTicks: 200,
      arms: {
        control: { subjects: ["41"] },
        treatment: { subjects: ["42"] }
      },
      measurements: ["highest_drive", "decision", "room"],
      samplingIntervalMs: 2000,
      observationDurationTicks: 400,
      stoppingCondition: "Stop after 400 ticks.",
      desiredExports: ["json"]
    }
  };
}

function manifest() {
  return Experiment.createManifest(definition(), context(), {
    id: "experiment-1",
    now: "2026-07-27T10:00:00Z",
    random: 0.5
  });
}

test("creates a versioned manifest with explicit control and treatment arms", () => {
  const value = manifest();
  assert.equal(value.kind, Experiment.KIND);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.protocol.arms[0].id, "control");
  assert.deepEqual(value.protocol.arms[1].subjects,
    [{ kind: "creature", id: "42" }]);
  assert.equal(value.metadata.initial.worldTick, 100);
  assert.equal(value.metadata.engine.launch.pathValuesOmitted, true);
  assert.match(value.limitations.join(" "), /not deterministic/i);
});

test("migrates legacy draft metadata and rejects unsupported versions", () => {
  const migrated = Experiment.migrate({
    version: 0,
    id: "old-1",
    title: "Old draft",
    question: "What changed?",
    worldName: "Old World",
    startTick: 9,
    createdAt: "2026-07-27T10:00:00Z",
    protocol: {
      arms: {
        control: { subjects: ["1"] },
        treatment: { subjects: ["2"] }
      }
    }
  });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.metadata.sourceWorld.name, "Old World");
  assert.throws(() => Experiment.migrate({
    kind: Experiment.KIND,
    schemaVersion: 99
  }), /Unsupported experiment manifest version: 99/);
});

test("requires explicit sample timing and keeps arms distinct", () => {
  let value = Experiment.setPhase(manifest(), "baseline", {
    wallTime: "2026-07-27T10:01:00Z"
  });
  value = Experiment.addObservation(value, {
    arm: "control",
    subject: { kind: "creature", id: "41" },
    signalId: "highest_drive",
    signalLabel: "Highest drive",
    value: 0.6,
    worldTick: 120,
    wallTime: "2026-07-27T10:01:01Z",
    evidenceLevel: "observed",
    source: "GET /api/creature/:id/observation"
  });
  value = Experiment.addObservation(value, {
    arm: "treatment",
    subject: { kind: "creature", id: "42" },
    signalId: "highest_drive",
    signalLabel: "Highest drive",
    value: null,
    worldTick: null,
    timeUnavailableReason: "Engine disconnected",
    wallTime: "2026-07-27T10:01:02Z",
    evidenceLevel: "unknown",
    source: "GET /api/creature/:id/observation"
  });
  const summary = Experiment.summaries(value);
  assert.equal(summary.byArm.control.highest_drive.count, 1);
  assert.equal(summary.byArm.treatment.highest_drive.count, 1);
  assert.equal(value.observations[1].timeUnavailableReason,
    "Engine disconnected");
  assert.throws(() => Experiment.addObservation(value, {
    arm: "control",
    signalId: "room",
    wallTime: "2026-07-27T10:01:03Z"
  }), /worldTick or timeUnavailableReason/);
});

test("records disconnected intervals as explicit non-interpolated gaps", () => {
  let value = Experiment.openGap(manifest(), "Engine disconnected", {
    worldTick: 150,
    wallTime: "2026-07-27T10:02:00Z"
  });
  value = Experiment.closeGap(value, {
    worldTick: 175,
    wallTime: "2026-07-27T10:02:05Z"
  });
  assert.deepEqual(value.gaps[0], {
    id: value.gaps[0].id,
    reason: "Engine disconnected",
    startTick: 150,
    endTick: 175,
    startWallTime: "2026-07-27T10:02:00.000Z",
    endWallTime: "2026-07-27T10:02:05.000Z",
    interpolated: false
  });
});

test("orders ledger entries by request sequence and separates verification", () => {
  let value = Experiment.addLedgerEntry(manifest(), {
    id: "second",
    sequence: 2,
    type: "simulation_resume",
    userAction: "Resume simulation",
    requestedOperation: "/api/resume",
    requestedTick: 140,
    requestedAt: "2026-07-27T10:03:00Z",
    outcome: "observed_success",
    observedResult: { ok: true, paused: false }
  });
  value = Experiment.addLedgerEntry(value, {
    id: "first",
    sequence: 1,
    type: "simulation_pause",
    userAction: "Pause simulation",
    requestedOperation: "/api/pause",
    requestedTick: 139,
    requestedAt: "2026-07-27T10:03:01Z",
    outcome: "observed_success",
    observedResult: { ok: true, paused: true }
  });
  assert.deepEqual(value.ledger.map(item => item.id), ["first", "second"]);
  assert.equal(value.ledger[0].verification.state, "pending");
  value = Experiment.verifyLedgerEntry(value, "first", {
    state: "verified",
    method: "Session endpoint confirmed paused",
    worldTick: 139,
    wallTime: "2026-07-27T10:03:02Z"
  });
  assert.equal(value.ledger[0].verification.state, "verified");
});

test("portable export contains references but no proprietary payloads", () => {
  let value = Experiment.addBranch(manifest(), {
    sourceWorld: "Disposable Experiment",
    branchWorld: "Treatment Branch",
    createdAt: "2026-07-27T10:04:00Z",
    worldTick: 180,
    status: "created_not_loaded"
  });
  value.references.assets.push({
    label: "Local image",
    localReference: "/private/path/image.c16",
    content: "binary"
  });
  value.unrecognizedTopLevelPayload = {
    worldArchive: "proprietary save bytes"
  };
  value.ledger.push({
    id: "nested-payload",
    sequence: 1,
    parameters: {
      safe: "retained",
      nested: { genes: [{ proprietary: "bytes" }] }
    },
    observedResult: {
      safe: true,
      nested: { worldData: "proprietary world bytes" }
    }
  });
  const exported = JSON.parse(Experiment.serialize(
    value, "2026-07-27T10:05:00Z"));
  assert.equal(exported.exportPolicy.savesEmbedded, false);
  assert.equal(exported.exportPolicy.genomesEmbedded, false);
  assert.deepEqual(exported.references.worlds,
    ["Disposable Experiment", "Treatment Branch"]);
  assert.equal(exported.references.assets[0].embedded, false);
  assert.equal("content" in exported.references.assets[0], false);
  assert.equal("unrecognizedTopLevelPayload" in exported, false);
  assert.equal(exported.ledger[0].parameters.safe, "retained");
  assert.equal(exported.ledger[0].parameters.nested.genes,
    "[content omitted]");
  assert.equal(exported.ledger[0].observedResult.nested.worldData,
    "[content omitted]");
});

test("redacts CAOS and genome payloads while retaining exact operation metadata", () => {
  const reviewedChemical = Transport.sanitizeRequest(
    "/api/creature/42/chemical-intervention",
    JSON.stringify({
      chemicalId: 35,
      operation: "adjust",
      requestedValue: 0.05,
      expectedConcentration: 0.4,
      sampleWorldTick: 120,
      baselineStatus: "manual_baseline"
    }));
  assert.equal(reviewedChemical.type, "chemical_intervention");
  assert.equal(reviewedChemical.parameters.creatureId, 42);
  assert.equal(reviewedChemical.parameters.chemicalId, 35);
  assert.equal(reviewedChemical.parameters.operation, "adjust");
  assert.equal(reviewedChemical.parameters.expectedConcentration, 0.4);
  assert.equal(reviewedChemical.parameters.baselineStatus, "manual_baseline");

  const chemical = Transport.sanitizeRequest("/api/execute",
    JSON.stringify({
      caos: "enum 4 0 0\n doif unid eq 42\n chem 35 0.1\n endi\nnext"
    }));
  assert.equal(chemical.type, "chemical_syringe");
  assert.equal(chemical.parameters.creatureId, 42);
  assert.equal(chemical.parameters.chemicalId, 35);
  assert.equal(chemical.parameters.amount, 0.1);
  assert.equal(chemical.parameters.sourceOmitted, true);
  assert.equal("caos" in chemical.parameters, false);

  const genome = Transport.sanitizeRequest("/api/genetics/inject",
    JSON.stringify({
      derivedName: "test_experiment_01",
      expectedChecksum: "fnv1a64:1234",
      reviewedSourceName: "test",
      reviewedSourceChecksum: "fnv1a64:source",
      confirmedWorldName: "Disposable Experiment",
      disposableConfirmed: true,
      reviewConfirmed: true,
      injectMode: "creature",
      gender: 1
    }));
  assert.equal(genome.type, "genome_injection");
  assert.equal(genome.parameters.derivedName, "test_experiment_01");
  assert.equal(genome.parameters.expectedChecksum, "fnv1a64:1234");
  assert.equal(genome.parameters.reviewedSourceName, "test");
  assert.equal(
    genome.parameters.reviewedSourceChecksum,
    "fnv1a64:source");
  assert.equal(genome.parameters.confirmedWorldName,
    "Disposable Experiment");
  assert.equal(genome.parameters.reviewConfirmed, true);
  assert.equal("genes" in genome.parameters, false);

  const genomeCopy = Transport.sanitizeRequest("/api/genetics/copy",
    JSON.stringify({
      sourceName: "test",
      derivedName: "test_experiment_01"
    }));
  assert.equal(genomeCopy.type, "genome_copy");
  assert.equal(genomeCopy.parameters.sourceName, "test");
  assert.equal(genomeCopy.parameters.derivedName, "test_experiment_01");

  const nestedResult = Transport.sanitizeResult({
    ok: true,
    result: {
      safe: "retained",
      details: {
        genome: { bytes: "secret" },
        scriptSource: "doif forever"
      }
    }
  });
  assert.equal(nestedResult.result.safe, "retained");
  assert.equal(nestedResult.result.details.genome, "[content omitted]");
  assert.equal(nestedResult.result.details.scriptSource, "[content omitted]");
});

test("captures successful and failed mutating fetches without changing responses", async () => {
  const records = [];
  const response = {
    ok: true,
    status: 200,
    clone() {
      return { json: async () => ({ ok: true, paused: true }) };
    }
  };
  const wrapped = Transport.createFetch(async () => response, {
    baseUrl: "http://localhost:9980/",
    now: () => "2026-07-27T10:06:00Z",
    getContext: () => ({
      worldKey: "Disposable Experiment",
      worldTick: 200,
      experimentId: "experiment-1"
    }),
    emit: record => records.push(record)
  });
  assert.equal(await wrapped("/api/pause", { method: "POST" }), response);
  assert.equal(records[0].type, "simulation_pause");
  assert.equal(records[0].outcome, "observed_success");
  assert.equal(records[0].requestedTick, 200);

  const errors = [];
  const failing = Transport.createFetch(async () => {
    throw new Error("offline");
  }, {
    baseUrl: "http://localhost:9980/",
    emit: record => errors.push(record)
  });
  await assert.rejects(() => failing("/api/world/save", {
    method: "POST"
  }), /offline/);
  assert.equal(errors[0].outcome, "network_failure");
});

test("provenance never records a refusal as a success", () => {
  const ok = { ok: true, status: 200 };
  const outcome = Transport.outcomeFor;
  assert.equal(outcome(ok, { ok: true }), "observed_success");
  assert.equal(outcome(ok, { ok: true, output: "", error: "" }),
    "observed_success");
  assert.equal(outcome(ok, { error: "Cannot rename core genome" }),
    "observed_failure");
  assert.equal(outcome(ok, { ok: false }), "observed_failure");
  assert.equal(outcome(ok, { status: "error" }), "observed_failure");
  assert.equal(outcome({ ok: false, status: 400 }, {}), "observed_failure");
  assert.equal(outcome({ ok: false, status: 504 }, { error: "Timeout" }),
    "not_applied_timeout");
});

test("a request that timed out counts as a failed ledger entry", () => {
  const manifest = Experiment.createManifest({}, {}, { now: 0, id: "e" });
  const next = Experiment.addLedgerEntry(manifest, {
    outcome: "not_applied_timeout",
    requestedAt: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(next.ledger[next.ledger.length - 1].verification.state, "failed");
});
