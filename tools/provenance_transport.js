// provenance_transport.js — redacted provenance for mutating Developer Tools requests
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ProvenanceTransport = api;
})(typeof window !== "undefined" ? window :
  (typeof globalThis !== "undefined" ? globalThis : this), function() {
  const BODY_LIMIT = 40;
  let sequence = 0;

  function text(value, limit) {
    const result = String(value == null ? "" : value);
    return result.slice(0, limit || 160);
  }

  function scalarObject(value, depth) {
    if (depth > 3) return "[omitted]";
    if (value == null || typeof value === "string" ||
        typeof value === "number" || typeof value === "boolean") {
      return typeof value === "string" ? text(value, 200) : value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, BODY_LIMIT).map(item =>
        scalarObject(item, depth + 1));
    }
    if (typeof value !== "object") return String(value);
    const result = {};
    Object.keys(value).slice(0, BODY_LIMIT).forEach(key => {
      result[key] = scalarObject(value[key], depth + 1);
    });
    return result;
  }

  function parsedBody(body) {
    if (body == null || body === "") return null;
    if (typeof body === "object" && !(body instanceof String)) return body;
    try {
      return JSON.parse(String(body));
    } catch (_) {
      return { bodyLength: String(body).length, contentOmitted: true };
    }
  }

  function classify(endpoint, payload) {
    if (endpoint === "/api/pause")
      return { type: "simulation_pause", label: "Pause simulation" };
    if (endpoint === "/api/resume")
      return { type: "simulation_resume", label: "Resume simulation" };
    if (endpoint === "/api/engine/tickrate")
      return { type: "simulation_speed", label: "Change simulation speed" };
    if (endpoint === "/api/world/save")
      return { type: "world_save", label: "Save active world" };
    if (endpoint === "/api/world/load")
      return { type: "world_load", label: "Load world" };
    if (endpoint === "/api/world/create")
      return { type: "world_create", label: "Create world" };
    if (endpoint === "/api/world/branch")
      return { type: "world_branch", label: "Create world branch" };
    if (endpoint === "/api/scriptorium/inject")
      return { type: "script_install", label: "Install or replace script" };
    if (endpoint === "/api/caos/evaluate")
      return { type: "caos_evaluation", label: "Evaluate reviewed CAOS" };
    if (endpoint === "/api/caos/script") {
      const mode = payload && payload.mode;
      if (mode === "install")
        return { type: "script_install", label: "Install reviewed event script" };
      if (mode === "replace")
        return { type: "script_replace", label: "Replace reviewed event script" };
      if (mode === "remove")
        return { type: "script_remove", label: "Remove reviewed event script" };
    }
    if (endpoint.startsWith("/api/breakpoint"))
      return { type: "breakpoint_change", label: "Change breakpoint" };
    if (endpoint.startsWith("/api/continue/"))
      return { type: "script_continue", label: "Continue agent script" };
    if (endpoint.startsWith("/api/step/"))
      return { type: "script_step", label: "Step agent script" };
    if (endpoint.includes("/genetics/crossover"))
      return { type: "genome_crossover", label: "Create crossed genome" };
    if (endpoint.includes("/genetics/copy"))
      return { type: "genome_copy", label: "Create experimental genome copy" };
    if (endpoint.includes("/genetics/save"))
      return { type: "genome_save", label: "Save genome file" };
    if (endpoint.includes("/genetics/delete/"))
      return { type: "genome_delete", label: "Delete genome file" };
    if (endpoint.includes("/genetics/rename"))
      return { type: "genome_rename", label: "Rename genome file" };
    if (endpoint.includes("/genetics/inject"))
      return { type: "genome_injection", label: "Inject genome" };
    const chemicalEndpoint =
      /^\/api\/creature\/(\d+)\/chemical-intervention$/.exec(endpoint);
    if (chemicalEndpoint) {
      return {
        type: "chemical_intervention",
        label: "Apply reviewed chemical intervention",
        detected: { creatureId: Number(chemicalEndpoint[1]) }
      };
    }
    if (endpoint === "/api/execute") {
      const caos = String(payload && payload.caos || "");
      const chemical = /\bchem\s+(\d+)\s+(-?(?:\d+\.?\d*|\.\d+))/i
        .exec(caos);
      const creature = /\bunid\s+eq\s+(\d+)/i.exec(caos);
      if (chemical) {
        return {
          type: "chemical_syringe",
          label: "Change creature chemical",
          detected: {
            chemicalId: Number(chemical[1]),
            amount: Number(chemical[2]),
            creatureId: creature ? Number(creature[1]) : null
          }
        };
      }
      if (/^\s*rscr\b/i.test(caos))
        return { type: "script_remove", label: "Remove script" };
      return { type: "caos_execution", label: "Execute CAOS" };
    }
    return {
      type: "api_mutation",
      label: "Mutating API request"
    };
  }

  function sanitizeRequest(endpoint, body) {
    const payload = parsedBody(body);
    const classification = classify(endpoint, payload);
    let parameters = scalarObject(payload, 0);
    if (/^\/api\/creature\/\d+\/chemical-intervention$/.test(endpoint)) {
      parameters = Object.assign({}, classification.detected || {},
        scalarObject(payload, 0));
    } else if (endpoint === "/api/execute") {
      const caos = String(payload && payload.caos || "");
      parameters = Object.assign({}, classification.detected || {}, {
        statementPreview: text(caos.split(/\r?\n/)[0].trim(), 120),
        sourceLength: caos.length,
        sourceOmitted: true
      });
    } else if (endpoint === "/api/scriptorium/inject") {
      parameters = {
        family: payload && payload.family,
        genus: payload && payload.genus,
        species: payload && payload.species,
        event: payload && payload.event,
        sourceLength: String(payload && payload.source || "").length,
        sourceOmitted: true
      };
    } else if (endpoint === "/api/caos/evaluate" ||
        endpoint === "/api/caos/script") {
      parameters = {
        mode: payload && payload.mode,
        sourceChecksum: payload && payload.sourceChecksum,
        sourceLength: String(payload && payload.source || "").length,
        sourceOmitted: Boolean(payload && payload.source),
        classifier: payload && payload.classifier,
        expectedWorldName: payload && payload.expectedWorldName,
        expectedWorldSessionId: payload && payload.expectedWorldSessionId,
        expectedWorldTick: payload && payload.expectedWorldTick,
        targetAgentId: payload && payload.targetAgentId,
        expectedTargetClassifier:
          payload && payload.expectedTargetClassifier,
        pauseBeforeRun: payload && payload.pauseBeforeRun,
        riskAcknowledged: payload && payload.riskAcknowledged,
        confirmed: payload && payload.confirmed,
        expectedExistingChecksum:
          payload && payload.expectedExistingChecksum
      };
    } else if (endpoint.startsWith("/api/genetics/")) {
      parameters = {
        moniker: payload && payload.moniker,
        saveName: payload && payload.saveName,
        sourceName: payload && payload.sourceName,
        sourceChecksum: payload && payload.sourceChecksum,
        reviewedSourceName: payload && payload.reviewedSourceName,
        reviewedSourceChecksum: payload && payload.reviewedSourceChecksum,
        reviewedSecondParentName:
          payload && payload.reviewedSecondParentName,
        reviewedSecondParentChecksum:
          payload && payload.reviewedSecondParentChecksum,
        derivedName: payload && payload.derivedName,
        expectedChecksum: payload && payload.expectedChecksum,
        parentA: payload && payload.parentA,
        parentB: payload && payload.parentB,
        child: payload && payload.child,
        oldName: payload && payload.oldName,
        newName: payload && payload.newName,
        injectMode: payload && payload.injectMode,
        gender: payload && payload.gender,
        confirmedWorldName: payload && payload.confirmedWorldName,
        reviewId: payload && payload.reviewId,
        reviewedWorldSessionId: payload && payload.reviewedWorldSessionId,
        reviewedWorldTick: payload && payload.reviewedWorldTick,
        disposableConfirmed: payload && payload.disposableConfirmed,
        reviewConfirmed: payload && payload.reviewConfirmed,
        geneCount: payload && payload.geneCount != null
          ? payload.geneCount
          : payload && Array.isArray(payload.genes)
            ? payload.genes.length : null,
        genomePayloadOmitted: Boolean(payload && payload.genes)
      };
    }
    return {
      type: classification.type,
      userAction: classification.label,
      requestedOperation: endpoint,
      parameters
    };
  }

  function sanitizeResult(payload) {
    if (payload == null) return null;
    const sensitiveKeys = new Set([
      "asset", "assetdata", "binary", "blob", "bytes", "caos", "content",
      "creaturedata", "creaturefile", "genes", "genome", "payload",
      "savedata", "scriptbody", "scriptsource", "source", "sourcecode",
      "worldarchive", "worlddata"
    ]);
    function redact(value) {
      if (value == null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(redact);
      const result = {};
      Object.keys(value).forEach(key => {
        const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
        result[key] = sensitiveKeys.has(normalized)
          ? "[content omitted]" : redact(value[key]);
      });
      return result;
    }
    return redact(scalarObject(payload, 0));
  }

  // A response can be HTTP 200 and still a refusal: many routes report a
  // rejected operation with nothing but an error field. A 504 means the
  // engine did not run the request and never will (see DebugServerWork.h).
  function outcomeFor(response, result) {
    if (response.status === 504) return "not_applied_timeout";
    const rejected = !response.ok ||
      Boolean(result && (result.ok === false ||
        result.status === "error" || result.error));
    return rejected ? "observed_failure" : "observed_success";
  }

  function endpointFor(input, baseUrl) {
    try {
      const value = typeof input === "string"
        ? input : input && input.url;
      const url = new URL(value, baseUrl || "http://localhost/");
      return url.origin === new URL(
        baseUrl || "http://localhost/").origin
        ? url.pathname : null;
    } catch (_) {
      return null;
    }
  }

  function createFetch(originalFetch, options) {
    const opts = options || {};
    const now = opts.now || (() => new Date().toISOString());
    const getContext = opts.getContext || (() => ({}));
    const emit = opts.emit || (() => {});
    const baseUrl = opts.baseUrl || "http://localhost/";
    return async function provenanceFetch(input, init) {
      const request = init || {};
      const method = String(request.method ||
        (input && input.method) || "GET").toUpperCase();
      const endpoint = endpointFor(input, baseUrl);
      if (!endpoint || !endpoint.startsWith("/api/") ||
          method === "GET" || method === "HEAD" ||
          ["/api/validate", "/api/caos/validate", "/api/compile-map"]
            .includes(endpoint)) {
        return originalFetch(input, init);
      }
      const context = getContext() || {};
      const captured = sanitizeRequest(endpoint, request.body);
      const requestSequence = ++sequence;
      const record = {
        id: "mutation-" + Date.now() + "-" + requestSequence,
        sequence: requestSequence,
        method,
        endpoint,
        requestedAt: now(),
        requestedTick: context.worldTick == null
          ? null : Number(context.worldTick),
        worldKey: context.worldKey || null,
        experimentId: context.experimentId || null,
        type: captured.type,
        userAction: captured.userAction,
        requestedOperation: captured.requestedOperation,
        parameters: captured.parameters
      };
      try {
        const response = await originalFetch(input, init);
        let result = null;
        try {
          result = sanitizeResult(await response.clone().json());
        } catch (_) {
          result = { body: "Non-JSON response omitted" };
        }
        emit(Object.assign({}, record, {
          completedAt: now(),
          responseStatus: response.status,
          outcome: outcomeFor(response, result),
          observedResult: result
        }));
        return response;
      } catch (error) {
        emit(Object.assign({}, record, {
          completedAt: now(),
          responseStatus: null,
          outcome: "network_failure",
          observedResult: {
            error: text(error && error.message || error, 240)
          }
        }));
        throw error;
      }
    };
  }

  function install(root, eventBus, store) {
    if (!root || !root.fetch || root.__provenanceFetchInstalled) return false;
    const original = root.fetch.bind(root);
    root.fetch = createFetch(original, {
      baseUrl: root.location && root.location.href,
      getContext() {
        const state = store && store.getState ? store.getState() : {};
        return {
          worldKey: state.world && state.world.identity &&
            state.world.identity.key,
          worldTick: state.world && state.world.tick,
          experimentId: state.experiment && state.experiment.id
        };
      },
      emit(record) {
        if (eventBus && eventBus.emit)
          eventBus.emit("provenance:mutation", record);
      }
    });
    root.__provenanceFetchInstalled = true;
    return true;
  }

  return Object.freeze({
    classify,
    sanitizeRequest,
    sanitizeResult,
    outcomeFor,
    createFetch,
    install
  });
});

if (typeof window !== "undefined" &&
    typeof DevToolsEvents !== "undefined" &&
    window.ObservatoryState &&
    window.ProvenanceTransport) {
  window.ProvenanceTransport.install(
    window, DevToolsEvents, window.ObservatoryState);
}
