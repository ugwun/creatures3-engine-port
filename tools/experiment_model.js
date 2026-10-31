// experiment_model.js — versioned, portable experiment manifests
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ExperimentModel = api;
})(typeof window !== "undefined" ? window :
  (typeof globalThis !== "undefined" ? globalThis : this), function() {
  const SCHEMA_VERSION = 1;
  const KIND = "creatures3_observatory_experiment";
  const MAX_OBSERVATIONS = 10000;
  const MAX_LEDGER = 2000;
  const MAX_ANNOTATIONS = 1000;
  const PHASES = Object.freeze([
    "draft", "baseline", "treatment", "stopped", "cancelled", "imported"
  ]);
  const DEFAULT_LIMITATIONS = Object.freeze([
    "Creatures simulation and repeated protocols are not deterministic.",
    "Random state and external world conditions are not captured.",
    "A world reference is not an embedded world or a replay guarantee.",
    "Browser memory is not a durable scientific record; export the manifest.",
    "Observed associations do not establish a single cause of behaviour."
  ]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function omitEmbeddedContent(value) {
    if (value == null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(omitEmbeddedContent);
    const sensitiveKeys = new Set([
      "asset", "assetdata", "binary", "blob", "bytes", "caos", "content",
      "creaturedata", "creaturefile", "genes", "genome", "payload",
      "savedata", "scriptbody", "scriptsource", "sourcecode",
      "worldarchive", "worlddata"
    ]);
    const result = Object.create(null);
    Object.keys(value).forEach(key => {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      result[key] = sensitiveKeys.has(normalized)
        ? "[content omitted]"
        : omitEmbeddedContent(value[key]);
    });
    return result;
  }

  function iso(value) {
    const date = value == null ? new Date() : new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw new TypeError("A valid wall-clock time is required");
    return date.toISOString();
  }

  function finite(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function cleanText(value, fallback, limit) {
    const result = String(value == null ? "" : value).trim();
    return (result || fallback || "").slice(0, limit || 500);
  }

  function id(prefix, now, random) {
    const timestamp = new Date(now == null ? Date.now() : now).getTime();
    const suffix = Math.floor(
      (random == null ? Math.random() : random) * 0xffffff
    ).toString(36).padStart(5, "0");
    return prefix + "-" + timestamp.toString(36) + "-" + suffix;
  }

  function normalizeSubjects(source) {
    const arms = ["control", "treatment"].map(armId => {
      const arm = source && source[armId] || {};
      const ids = Array.isArray(arm.subjects) ? arm.subjects :
        String(arm.subjects || "").split(",");
      return {
        id: armId,
        label: armId === "control" ? "Control" : "Treatment",
        worldReference: cleanText(arm.worldReference, null, 160) || null,
        subjects: Array.from(new Set(ids.map(value =>
          cleanText(value && value.id != null ? value.id : value, null, 80)
        ).filter(Boolean))).map(subjectId => ({
          kind: "creature",
          id: subjectId
        })),
        note: cleanText(arm.note, null, 500) || null
      };
    });
    return arms;
  }

  function normalizeMeasurements(source) {
    const known = {
      highest_drive: {
        label: "Highest drive level",
        source: "GET /api/creature/:id/observation pressure",
        evidenceLevel: "observed"
      },
      decision: {
        label: "Decision winner",
        source: "GET /api/creature/:id/observation selection",
        evidenceLevel: "observed"
      },
      room: {
        label: "Current room",
        source: "GET /api/creature/:id/observation environment",
        evidenceLevel: "observed"
      }
    };
    const requested = Array.isArray(source) ? source : [];
    return requested.map(item => {
      const signalId = cleanText(
        typeof item === "string" ? item : item.id, null, 100);
      const definition = known[signalId] || {};
      return {
        id: signalId,
        label: cleanText(item && item.label, definition.label ||
          signalId, 160),
        source: cleanText(item && item.source, definition.source ||
          "user-defined observation", 240),
        evidenceLevel: cleanText(
          item && item.evidenceLevel,
          definition.evidenceLevel || "unknown", 20)
      };
    }).filter(item => item.id);
  }

  function normalizeProtocol(source) {
    const protocol = source || {};
    const interval = finite(protocol.samplingIntervalMs);
    return {
      baseline: {
        durationTicks: Math.max(0,
          Math.trunc(finite(protocol.baselineDurationTicks) || 0)),
        description: cleanText(
          protocol.baselineDescription,
          "Observe without the planned intervention.", 500)
      },
      arms: normalizeSubjects(protocol.arms),
      measurements: normalizeMeasurements(protocol.measurements),
      plannedInterventions: (protocol.plannedInterventions || [])
        .slice(0, 100).map(step => ({
          id: cleanText(step.id, id("step"), 100),
          label: cleanText(step.label, "Planned intervention", 200),
          operation: cleanText(step.operation, null, 500) || null
        })),
      samplingIntervalMs: Math.max(500, Math.min(60000, interval || 2000)),
      observationDurationTicks: Math.max(0,
        Math.trunc(finite(protocol.observationDurationTicks) || 0)),
      stoppingCondition: cleanText(protocol.stoppingCondition,
        "Stop manually after the planned observation window.", 500),
      desiredExports: Array.isArray(protocol.desiredExports)
        ? protocol.desiredExports.map(value =>
          cleanText(value, null, 60)).filter(Boolean)
        : ["json"],
      unavoidableDifferences: cleanText(
        protocol.unavoidableDifferences, null, 1000) || null
    };
  }

  function createManifest(definition, context, options) {
    const source = definition || {};
    const engine = context || {};
    const opts = options || {};
    const createdAt = iso(opts.now);
    const experimentId = opts.id || id("experiment", opts.now, opts.random);
    const worldName = cleanText(
      engine.worldName || source.worldName, null, 160) || null;
    return {
      kind: KIND,
      schemaVersion: SCHEMA_VERSION,
      id: experimentId,
      status: "draft",
      metadata: {
        title: cleanText(source.title, "Untitled experiment", 200),
        question: cleanText(source.question, "Question not recorded", 1000),
        hypothesis: cleanText(source.hypothesis, null, 1000) || null,
        createdAt,
        startedAt: null,
        endedAt: null,
        sourceWorld: {
          name: worldName,
          type: cleanText(engine.worldType || source.worldType,
            null, 40) || null,
          explicitlyDisposableOrBranched:
            source.explicitlyDisposableOrBranched === true
        },
        engine: {
          worldSessionId: cleanText(engine.worldSessionId, null, 80) || null,
          buildIdentifier: cleanText(
            engine.engineBuildIdentifier, "unknown", 160),
          buildIdentifierSource: cleanText(
            engine.engineBuildIdentifierSource, "unavailable", 240),
          gameBuildIdentifier: cleanText(
            engine.gameBuildIdentifier, null, 160) || null,
          launch: clone(engine.launch || {
            options: [],
            pathValuesOmitted: true
          })
        },
        initial: {
          worldTick: finite(engine.worldTick),
          systemTick: finite(engine.systemTick),
          gameSpeed: finite(engine.gameSpeed),
          enginePaused: typeof engine.enginePaused === "boolean"
            ? engine.enginePaused : null,
          capturedAtWallTimeMs: finite(engine.capturedAtWallTimeMs)
        }
      },
      protocol: normalizeProtocol(source.protocol),
      observations: [],
      ledger: [],
      annotations: [],
      gaps: [],
      worldBranches: [],
      exports: [],
      references: {
        worlds: worldName ? [worldName] : [],
        assets: []
      },
      limitations: Array.from(new Set(
        DEFAULT_LIMITATIONS.concat(engine.limitations || [])
      )),
      retention: {
        observationLimit: MAX_OBSERVATIONS,
        droppedObservations: 0,
        ledgerLimit: MAX_LEDGER
      }
    };
  }

  function migrate(input) {
    const source = clone(input);
    if (!source || typeof source !== "object")
      throw new TypeError("Experiment manifest must be an object");
    if (source.schemaVersion === SCHEMA_VERSION && source.kind === KIND)
      return source;
    if (source.schemaVersion == null && source.version === 0) {
      return createManifest({
        title: source.title,
        question: source.question,
        hypothesis: source.hypothesis,
        protocol: source.protocol || {}
      }, {
        worldName: source.worldName,
        worldType: source.worldType,
        worldTick: source.startTick,
        gameSpeed: source.gameSpeed
      }, {
        id: source.id,
        now: source.createdAt
      });
    }
    throw new Error(
      "Unsupported experiment manifest version: " +
      String(source.schemaVersion)
    );
  }

  function validate(input) {
    const manifest = migrate(input);
    const errors = [];
    if (!manifest.id) errors.push("id is required");
    if (!manifest.metadata || !manifest.metadata.title)
      errors.push("metadata.title is required");
    if (!manifest.protocol) errors.push("protocol is required");
    const arms = manifest.protocol && manifest.protocol.arms || [];
    if (!arms.some(arm => arm.id === "control"))
      errors.push("control arm is required");
    if (!arms.some(arm => arm.id === "treatment"))
      errors.push("treatment arm is required");
    ["observations", "ledger", "annotations", "gaps"].forEach(field => {
      if (!Array.isArray(manifest[field]))
        errors.push(field + " must be an array");
    });
    return {
      valid: errors.length === 0,
      errors,
      manifest
    };
  }

  function requireManifest(input) {
    const result = validate(input);
    if (!result.valid)
      throw new Error("Invalid experiment manifest: " +
        result.errors.join("; "));
    return clone(result.manifest);
  }

  function setPhase(input, phase, timing) {
    if (!PHASES.includes(phase))
      throw new TypeError("Unknown experiment phase: " + phase);
    const manifest = requireManifest(input);
    manifest.status = phase;
    if ((phase === "baseline" || phase === "treatment") &&
        !manifest.metadata.startedAt) {
      manifest.metadata.startedAt = iso(timing && timing.wallTime);
    }
    if (phase === "stopped" || phase === "cancelled")
      manifest.metadata.endedAt = iso(timing && timing.wallTime);
    return manifest;
  }

  function addObservation(input, observation) {
    const manifest = requireManifest(input);
    const source = observation || {};
    const tick = finite(source.worldTick);
    if (tick == null && !source.timeUnavailableReason)
      throw new TypeError(
        "Observation requires worldTick or timeUnavailableReason");
    const arm = source.arm === "control" ? "control" :
      source.arm === "treatment" ? "treatment" : null;
    if (!arm) throw new TypeError(
      "Observation arm must be control or treatment");
    const record = {
      id: source.id || id("observation", source.wallTime),
      phase: PHASES.includes(source.phase) ? source.phase : manifest.status,
      arm,
      subject: clone(source.subject || null),
      signalId: cleanText(source.signalId, "unknown", 100),
      signalLabel: cleanText(source.signalLabel, source.signalId, 160),
      value: clone(source.value),
      valueLabel: cleanText(source.valueLabel, null, 240) || null,
      worldTick: tick,
      systemTick: finite(source.systemTick),
      wallTime: iso(source.wallTime),
      timeUnavailableReason: tick == null
        ? cleanText(source.timeUnavailableReason, "unavailable", 240)
        : null,
      evidence: {
        level: cleanText(source.evidenceLevel, "unknown", 20),
        source: cleanText(source.source, "unavailable", 240),
        sampleIntervalMs: finite(source.sampleIntervalMs)
      }
    };
    manifest.observations.push(record);
    if (manifest.observations.length > MAX_OBSERVATIONS) {
      const dropped = manifest.observations.length - MAX_OBSERVATIONS;
      manifest.observations.splice(0, dropped);
      manifest.retention.droppedObservations += dropped;
    }
    return manifest;
  }

  function failedOutcome(outcome) {
    return outcome === "observed_failure" ||
      outcome === "network_failure" ||
      outcome === "not_applied_timeout";
  }

  function addLedgerEntry(input, entry) {
    const manifest = requireManifest(input);
    const source = entry || {};
    const requestedTick = finite(source.requestedTick);
    const requestedSequence = finite(source.sequence);
    const record = {
      id: source.id || id("ledger", source.requestedAt),
      sequence: requestedSequence == null
        ? manifest.ledger.length
          ? Math.max(...manifest.ledger.map(item =>
            finite(item.sequence) || 0)) + 1 : 1
        : requestedSequence,
      type: cleanText(source.type, "unknown_mutation", 100),
      userAction: cleanText(source.userAction,
        "User initiated mutation", 240),
      requestedOperation: cleanText(source.requestedOperation,
        "operation unavailable", 240),
      parameters: clone(source.parameters || {}),
      worldKey: cleanText(source.worldKey,
        manifest.metadata.sourceWorld.name, 160) || null,
      requestedTick,
      requestedAt: iso(source.requestedAt),
      timeUnavailableReason: requestedTick == null
        ? cleanText(source.timeUnavailableReason,
          "World tick unavailable at request time", 240)
        : null,
      observedResult: clone(source.observedResult || null),
      completedAt: source.completedAt ? iso(source.completedAt) : null,
      outcome: cleanText(source.outcome, "pending", 80),
      verification: clone(source.verification || {
        state: failedOutcome(source.outcome) ? "failed" : "pending",
        method: failedOutcome(source.outcome)
          ? "request response" : "not yet independently verified",
        worldTick: null,
        wallTime: null
      })
    };
    manifest.ledger.push(record);
    manifest.ledger.sort((left, right) =>
      left.sequence - right.sequence ||
      left.requestedAt.localeCompare(right.requestedAt));
    if (manifest.ledger.length > MAX_LEDGER)
      manifest.ledger.splice(0, manifest.ledger.length - MAX_LEDGER);
    return manifest;
  }

  function verifyLedgerEntry(input, entryId, verification) {
    const manifest = requireManifest(input);
    const entry = manifest.ledger.find(item => item.id === entryId);
    if (!entry) throw new Error("Ledger entry not found: " + entryId);
    const source = verification || {};
    entry.verification = {
      state: ["pending", "verified", "failed", "unavailable"]
        .includes(source.state) ? source.state : "unavailable",
      method: cleanText(source.method,
        "Verification method unavailable", 300),
      worldTick: finite(source.worldTick),
      wallTime: iso(source.wallTime)
    };
    return manifest;
  }

  function openGap(input, reason, timing) {
    const manifest = requireManifest(input);
    const source = timing || {};
    if (manifest.gaps.some(gap => gap.endWallTime == null)) return manifest;
    manifest.gaps.push({
      id: source.id || id("gap", source.wallTime),
      reason: cleanText(reason, "recording unavailable", 240),
      startTick: finite(source.worldTick),
      endTick: null,
      startWallTime: iso(source.wallTime),
      endWallTime: null,
      interpolated: false
    });
    return manifest;
  }

  function closeGap(input, timing) {
    const manifest = requireManifest(input);
    const gap = manifest.gaps.slice().reverse()
      .find(item => item.endWallTime == null);
    if (!gap) return manifest;
    gap.endTick = finite(timing && timing.worldTick);
    gap.endWallTime = iso(timing && timing.wallTime);
    return manifest;
  }

  function addAnnotation(input, annotation) {
    const manifest = requireManifest(input);
    const source = annotation || {};
    const tick = finite(source.worldTick);
    if (tick == null && !source.timeUnavailableReason)
      throw new TypeError(
        "Annotation requires worldTick or timeUnavailableReason");
    manifest.annotations.push({
      id: source.id || id("annotation", source.wallTime),
      type: source.type === "bookmark" ? "bookmark" : "note",
      text: cleanText(source.text, null, 2000),
      worldTick: tick,
      wallTime: iso(source.wallTime),
      timeUnavailableReason: tick == null
        ? cleanText(source.timeUnavailableReason, "unavailable", 240)
        : null
    });
    if (manifest.annotations.length > MAX_ANNOTATIONS)
      manifest.annotations.splice(
        0, manifest.annotations.length - MAX_ANNOTATIONS);
    return manifest;
  }

  function addBranch(input, branch) {
    const manifest = requireManifest(input);
    const source = branch || {};
    const reference = {
      sourceWorld: cleanText(source.sourceWorld, null, 160),
      branchWorld: cleanText(source.branchWorld, null, 160),
      createdAt: iso(source.createdAt),
      worldTick: finite(source.worldTick),
      status: cleanText(source.status, "created", 60),
      loadedAt: source.loadedAt ? iso(source.loadedAt) : null
    };
    manifest.worldBranches.push(reference);
    if (reference.branchWorld &&
        !manifest.references.worlds.includes(reference.branchWorld)) {
      manifest.references.worlds.push(reference.branchWorld);
    }
    return manifest;
  }

  function portableManifest(input, exportedAt) {
    const manifest = requireManifest(input);
    const portable = {};
    [
      "kind", "schemaVersion", "id", "status", "metadata", "protocol",
      "observations", "ledger", "annotations", "gaps", "worldBranches",
      "exports", "references", "limitations", "retention"
    ].forEach(key => {
      portable[key] = omitEmbeddedContent(manifest[key]);
    });
    portable.kind = KIND;
    portable.schemaVersion = SCHEMA_VERSION;
    portable.exports = Array.isArray(portable.exports)
      ? portable.exports : [];
    portable.exports.push({
      format: "json",
      exportedAt: iso(exportedAt)
    });
    portable.references = {
      worlds: Array.isArray(manifest.references &&
        manifest.references.worlds)
        ? omitEmbeddedContent(manifest.references.worlds) : [],
      assets: []
    };
    portable.references.assets = (manifest.references &&
      manifest.references.assets || [])
      .map(reference => ({
        label: cleanText(reference.label, "Local asset", 160),
        localReference: "[local reference omitted]",
        embedded: false
      }));
    portable.exportPolicy = {
      proprietaryWorldsEmbedded: false,
      genomesEmbedded: false,
      creaturesEmbedded: false,
      savesEmbedded: false,
      assetsEmbedded: false
    };
    return portable;
  }

  function serialize(input, exportedAt) {
    return JSON.stringify(portableManifest(input, exportedAt), null, 2);
  }

  function importManifest(value) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const manifest = requireManifest(parsed);
    manifest.status = "imported";
    return manifest;
  }

  function summaries(input) {
    const manifest = requireManifest(input);
    const byArm = { control: {}, treatment: {} };
    manifest.observations.forEach(point => {
      if (!byArm[point.arm]) return;
      const signal = byArm[point.arm][point.signalId] || {
        count: 0, latest: null, gaps: manifest.gaps.length
      };
      signal.count++;
      signal.latest = point;
      byArm[point.arm][point.signalId] = signal;
    });
    return {
      byArm,
      observationCount: manifest.observations.length,
      ledgerCount: manifest.ledger.length,
      gapCount: manifest.gaps.length,
      annotationCount: manifest.annotations.length
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    KIND,
    MAX_OBSERVATIONS,
    DEFAULT_LIMITATIONS,
    createManifest,
    migrate,
    validate,
    setPhase,
    addObservation,
    addLedgerEntry,
    verifyLedgerEntry,
    openGap,
    closeGap,
    addAnnotation,
    addBranch,
    portableManifest,
    serialize,
    importManifest,
    summaries
  });
});
