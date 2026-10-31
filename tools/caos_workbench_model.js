// caos_workbench_model.js — pure planning and review model for CAOS work
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CaosWorkbenchModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const MODES = Object.freeze({
    evaluate: Object.freeze({
      label: "Evaluate now",
      action: "Evaluate reviewed source",
      description: "Compile and run source in a fresh ownerless VM."
    }),
    debug: Object.freeze({
      label: "Inspect running",
      action: "Open in Debugger",
      description: "Inspect the selected live script without executing editor source."
    }),
    install: Object.freeze({
      label: "Install event",
      action: "Install reviewed script",
      description: "Install a new exact classifier/event in the active world's scriptorium."
    }),
    replace: Object.freeze({
      label: "Replace event",
      action: "Replace reviewed script",
      description: "Replace the exact installed event only if its checksum is unchanged."
    }),
    remove: Object.freeze({
      label: "Remove event",
      action: "Remove reviewed script",
      description: "Remove the exact installed event only after explicit confirmation."
    })
  });

  const MUTATING_COMMANDS = new Set([
    "accg", "aslp", "attr", "bhvr", "chem", "dead", "delg", "door", "emit",
    "gene", "kill", "load", "mcrt", "mvby", "mvft", "mvsf", "mvto",
    "new:", "perm", "pose", "prop", "save", "scrp", "scrx", "rscr",
    "stim", "sway", "tick", "urge", "wpau"
  ]);
  const DESTRUCTIVE_COMMANDS = new Set([
    "dead", "delg", "gene", "kill", "load", "new:", "rscr", "scrx"
  ]);
  const WRITE_COMMANDS = new Set([
    "absv", "adds", "addv", "andv", "divv", "modv", "mulv", "negv", "orrv",
    "seta", "sets", "setv", "subv"
  ]);
  // Preview only, while typing. The engine's compile-based verdict decides;
  // see DebugServerLogic::ReviewCaosUsage and plan() below.
  const SAFE_COMMANDS = new Set([
    "addv", "adds", "andv", "dbg:", "divv", "doif", "elif", "else", "endi",
    "enum", "epas", "esee", "etch", "ever", "from", "gids", "goto", "gsub",
    "inst", "lock", "loop", "modv", "mulv", "negv", "next", "orrv", "outs",
    "outv", "outx", "ownr", "repe", "reps", "retn", "rtar", "seta", "sets",
    "setv", "slow", "star", "stop", "subr", "subv", "targ", "ttar", "unlk",
    "untl", "wait", "wild"
  ]);

  function fingerprint(text) {
    // FNV-1a 64-bit, matching DebugServerLogic::Fnv1a64Checksum.
    let hash = 0xcbf29ce484222325n;
    const bytes = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(String(text || ""))
      : Buffer.from(String(text || ""), "utf8");
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return "fnv1a64:" + hash.toString(16).padStart(16, "0");
  }

  function classifier(value) {
    const input = value || {};
    const result = {};
    const errors = [];
    ["family", "genus", "species", "event"].forEach(field => {
      const number = Number(input[field]);
      const maximum = field === "family" || field === "genus" ? 255 : 65535;
      if (!Number.isInteger(number) || number < 0 || number > maximum) {
        errors.push(field + " must be an integer from 0 to " + maximum);
      } else {
        result[field] = number;
      }
    });
    result.key = errors.length ? null :
      [result.family, result.genus, result.species, result.event].join(" ");
    if (!errors.length && result.family === 0 && result.genus === 0 &&
        result.species === 0 && result.event === 0) {
      errors.push("Classifier 0 0 0 0 is not an event-script target");
    }
    return { valid: errors.length === 0, value: result, errors };
  }

  function unwrapEventSource(source) {
    return String(source || "")
      .replace(/^\s*scrp\s+\d+\s+\d+\s+\d+\s+\d+\s*/i, "")
      .replace(/\s*endm\s*$/i, "")
      .trim();
  }

  function tokens(source) {
    const withoutStrings = String(source || "").replace(
      /"(?:""|\\.|[^"])*"/g, " ");
    return withoutStrings
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*\*.*$/, " "))
      .join("\n")
      .toLowerCase()
      .match(/[a-z][a-z0-9]*:?/g) || [];
  }

  function analyzeRisk(source) {
    const found = [...new Set(tokens(source))];
    const destructive = found.filter(token => DESTRUCTIVE_COMMANDS.has(token));
    const mutating = found.filter(token => MUTATING_COMMANDS.has(token));
    const sequence = tokens(source);
    const variableWrites = [];
    for (let index = 0; index + 1 < sequence.length; ++index) {
      if (WRITE_COMMANDS.has(sequence[index]) &&
          !/^va\d\d$/.test(sequence[index + 1])) {
        variableWrites.push(sequence[index] + " " + sequence[index + 1]);
      }
    }
    mutating.push(...variableWrites);
    const unknown = found.filter(token =>
      !MUTATING_COMMANDS.has(token) &&
      !DESTRUCTIVE_COMMANDS.has(token) &&
      !SAFE_COMMANDS.has(token) &&
      !/^(va|ov|mv|sv)\d\d$/.test(token));
    let level = "read-only";
    if (destructive.length) level = "broad-or-destructive";
    else if (mutating.length) level = "mutating";
    else if (unknown.length) level = "unknown";
    return {
      level,
      commands: found,
      mutating,
      destructive,
      unknown,
      requiresAcknowledgement: level !== "read-only",
      explanation: level === "read-only"
        ? "No known world-mutating command was found."
        : level === "mutating"
          ? "Known world-mutating commands: " + mutating.join(", ") + "."
          : level === "broad-or-destructive"
            ? "Broad or destructive commands: " + destructive.join(", ") + "."
            : "Unclassified commands require expert review: " +
              unknown.slice(0, 8).join(", ") + "."
    };
  }

  // The engine's verdict comes from what the compiler actually emitted.
  function reviewedRisk(preview, validation) {
    const engine = validation && validation.ok === true && validation.risk;
    if (!engine || !engine.level) return preview;
    const operations = engine.operations || [];
    return Object.assign({}, preview, {
      level: engine.level,
      mutating: operations,
      destructive: engine.level === "broad-or-destructive" ? operations : [],
      unknown: [],
      requiresAcknowledgement: Boolean(engine.requiresAcknowledgement),
      explanation: engine.level === "read-only"
        ? "The compiled script only reads the world."
        : (engine.warning || "Engine review required") +
          (operations.length ? ": " + operations.join(", ") + "." : ".")
    });
  }

  function lineDiff(before, after) {
    const left = String(before || "").split(/\r?\n/);
    const right = String(after || "").split(/\r?\n/);
    const rows = left.length + 1;
    const columns = right.length + 1;
    const lcs = Array.from({ length: rows }, () => Array(columns).fill(0));
    for (let i = left.length - 1; i >= 0; --i) {
      for (let j = right.length - 1; j >= 0; --j) {
        lcs[i][j] = left[i] === right[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const result = [];
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        result.push({ type: "same", text: left[i] });
        ++i;
        ++j;
      } else if (j < right.length &&
          (i === left.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
        result.push({ type: "add", text: right[j++] });
      } else {
        result.push({ type: "remove", text: left[i++] });
      }
    }
    return result;
  }

  function selectedAgent(state) {
    const selection = state && state.selection;
    return selection && (selection.agent || selection.creature) || null;
  }

  function contextSnapshot(state, runningScript, recording) {
    const source = state || {};
    const world = source.world || {};
    const identity = world.identity;
    const agent = selectedAgent(source);
    return {
      worldName: identity && identity.name || null,
      worldSessionId: identity && identity.sessionId || null,
      worldTick: world.tick == null ? null : Number(world.tick),
      systemTick: world.systemTick == null ? null : Number(world.systemTick),
      connectionStatus: source.connection && source.connection.status ||
        "disconnected",
      enginePaused: source.engine ? source.engine.paused : null,
      targetAgentId: agent && Number(agent.id),
      targetAgentClassifier: agent && agent.family != null ? {
        family: Number(agent.family),
        genus: Number(agent.genus),
        species: Number(agent.species)
      } : null,
      ownerAgentId: null,
      runningScript: runningScript || null,
      experimentRecording: Boolean(recording ||
        source.recording && source.recording.active)
    };
  }

  function contextErrors(context) {
    const errors = [];
    if (!context || !context.worldName || context.worldName === "Startup")
      errors.push("Load a non-Startup world before authoring CAOS.");
    if (!context || context.connectionStatus !== "connected")
      errors.push("The engine connection is not live.");
    return errors;
  }

  function plan(input) {
    const request = input || {};
    const mode = MODES[request.mode] ? request.mode : "evaluate";
    const context = request.context || {};
    const source = mode === "install" || mode === "replace"
      ? unwrapEventSource(request.source)
      : String(request.source || "").trim();
    const target = classifier(request.classifier);
    const existing = request.existingScript || null;
    const validation = request.validation || null;
    const errors = contextErrors(context);
    const warnings = [];
    const risk = reviewedRisk(analyzeRisk(source), validation);

    if (mode !== "debug" && mode !== "remove" && !source)
      errors.push("CAOS source is required.");
    if (mode === "debug" && !context.runningScript)
      errors.push("Select a currently running script before opening the debugger.");
    if (["install", "replace", "remove"].includes(mode) && !target.valid)
      errors.push(...target.errors);
    if (mode === "install" && existing)
      errors.push("An event is already installed at this classifier; choose Replace event.");
    if (["replace", "remove"].includes(mode) && !existing)
      errors.push("No installed event exists at this exact classifier.");
    if (validation && validation.ok === false)
      errors.push("Compilation failed; correct the reported source error.");
    if (validation && validation.ok === true &&
        validation.sourceChecksum &&
        validation.sourceChecksum !== fingerprint(source))
      errors.push("Engine validation belongs to different source; compile again.");
    if (!validation && !["debug", "remove"].includes(mode))
      errors.push("Compile the exact source with the engine before applying.");
    if (mode === "evaluate" && risk.requiresAcknowledgement)
      warnings.push(risk.explanation);
    if (mode === "remove")
      warnings.push("Removal deletes the exact installed event from the active world's scriptorium.");
    if (mode === "replace")
      warnings.push("Replacement is conditional on the reviewed installed-source checksum.");

    return {
      mode,
      modeDefinition: MODES[mode],
      source,
      sourceChecksum: fingerprint(source),
      classifier: target.value,
      context,
      existingScript: existing,
      existingChecksum: existing && (existing.checksum ||
        fingerprint(existing.source || "")),
      risk,
      diff: mode === "replace" && existing
        ? lineDiff(existing.source || "", source)
        : [],
      errors,
      warnings,
      canApply: errors.length === 0,
      requiresConfirmation: mode === "remove" || mode === "replace" ||
        mode === "install" ||
        mode === "evaluate" && risk.requiresAcknowledgement
    };
  }

  function apiRequest(review, options) {
    const opts = options || {};
    if (!review || !review.canApply)
      throw new TypeError("A valid reviewed CAOS plan is required");
    if (review.mode === "debug") {
      return { kind: "navigate", tab: "debugger",
        agentId: review.context.runningScript.agentId };
    }
    const body = {
      mode: review.mode,
      expectedWorldName: review.context.worldName,
      expectedWorldSessionId: review.context.worldSessionId,
      expectedWorldTick: review.context.worldTick
    };
    if (review.mode === "evaluate") {
      Object.assign(body, {
        source: review.source,
        sourceChecksum: review.sourceChecksum,
        targetAgentId: opts.bindTarget
          ? review.context.targetAgentId || null
          : null,
        expectedTargetClassifier: opts.bindTarget
          ? review.context.targetAgentClassifier || null
          : null,
        pauseBeforeRun: Boolean(opts.pauseBeforeRun),
        riskAcknowledged: Boolean(opts.riskAcknowledged)
      });
      return { kind: "request", url: "/api/caos/evaluate", body };
    }
    Object.assign(body, {
      classifier: review.classifier,
      confirmed: Boolean(opts.confirmed),
      expectedExistingChecksum: review.existingChecksum || null
    });
    if (review.mode !== "remove") {
      body.source = review.source;
      body.sourceChecksum = review.sourceChecksum;
    }
    return { kind: "request", url: "/api/caos/script", body };
  }

  function lineAndColumn(source, position) {
    const value = Number(position);
    if (!Number.isInteger(value) || value < 0) return null;
    const prefix = String(source || "").slice(0, value);
    const lines = prefix.split(/\r?\n/);
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  return Object.freeze({
    MODES,
    fingerprint,
    classifier,
    unwrapEventSource,
    analyzeRisk,
    lineDiff,
    contextSnapshot,
    plan,
    apiRequest,
    lineAndColumn
  });
});
