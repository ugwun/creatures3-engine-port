// architecture_model.js — versioned Observatory architecture and data paths
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ArchitectureModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const VERSION = 1;

  const LAYERS = Object.freeze([
    Object.freeze({
      id: "engine", label: "Engine", description: "Runtime and server owners"
    }),
    Object.freeze({
      id: "domain", label: "Domain", description: "Creature and world systems"
    }),
    Object.freeze({
      id: "transport", label: "Transport", description: "REST and event streams"
    }),
    Object.freeze({
      id: "browser", label: "Browser", description: "State and transformations"
    }),
    Object.freeze({
      id: "surface", label: "Surface", description: "Investigation workspaces"
    }),
    Object.freeze({
      id: "external", label: "External", description: "Exports and MCP clients"
    })
  ]);

  const EVIDENCE = Object.freeze({
    static: Object.freeze({
      label: "Static relationship",
      description: "Reviewed architecture metadata; no live execution implied."
    }),
    observed: Object.freeze({
      label: "Observed activity",
      description: "A recent mapped request without a known failure, " +
        "or a current shared sample."
    }),
    derived: Object.freeze({
      label: "Derived transformation",
      description: "A stated mechanical transformation of observed values."
    }),
    inferred: Object.freeze({
      label: "Inferred relationship",
      description: "Interpretive context, never direct runtime evidence."
    })
  });

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value))
      return value;
    Object.keys(value).forEach(key => freeze(value[key]));
    return Object.freeze(value);
  }

  function node(id, layer, label, summary, options) {
    return freeze(Object.assign({
      id, layer, label, summary,
      kind: "component",
      order: 0,
      routeId: null,
      helpId: null,
      document: null,
      section: null,
      source: null,
      endpoint: null
    }, options || {}));
  }

  const NODES = Object.freeze([
    node("engine.app", "engine", "App", "Owns the simulation loop and world.",
      { order: 10, source: "engine/App.cpp" }),
    node("engine.agent-manager", "engine", "AgentManager",
      "Owns registered agents and their lifecycle.",
      { order: 20, source: "engine/AgentManager.cpp" }),
    node("engine.map", "engine", "Map",
      "Owns metarooms, rooms, doors, CA fields, and spatial queries.",
      { order: 30, source: "engine/Map/Map.cpp" }),
    node("engine.caos-vm", "engine", "CAOS VM",
      "Runs installed and immediate CAOS in explicit machine contexts.",
      { order: 40, source: "engine/Caos/CAOSMachine.cpp" }),
    node("engine.debug-server", "engine", "DebugServer",
      "Moves bounded API work onto the engine thread and serves Tools.",
      {
        order: 50, source: "engine/DebugServer.cpp",
        document: "api_reference.md"
      }),

    node("domain.agent", "domain", "Agents",
      "World-scoped objects with classifiers, position, and scripts.",
      { order: 10, source: "engine/Agents/Agent.cpp" }),
    node("domain.creature", "domain", "Creature",
      "Digital-life object joining faculties, genome, brain, and chemistry.",
      {
        order: 20, source: "engine/Creature/Creature.cpp",
        routeId: "creatures", helpId: "route.creatures",
        document: "live_creature_observation.md"
      }),
    node("domain.brain", "domain", "Brain",
      "Lobes, neurons, tracts, winners, and SVRule updates.",
      {
        order: 30, source: "engine/Creature/Brain/Brain.cpp",
        routeId: "creatures", document: "brain_deep_dive.md"
      }),
    node("domain.biochemistry", "domain", "Biochemistry",
      "Chemical concentrations, organs, reactions, receptors, and emitters.",
      {
        order: 40,
        source: "engine/Creature/Biochemistry/Biochemistry.cpp",
        routeId: "creatures", document: "biochemistry_deep_dive.md"
      }),
    node("domain.genome", "domain", "Genome",
      "Encoded genes used to construct creature systems and life-stage state.",
      {
        order: 50, source: "engine/Creature/Genome.cpp",
        routeId: "genetics", helpId: "route.genetics",
        document: "genome_deep_dive.md"
      }),
    node("domain.ecology", "domain", "World ecology",
      "Rooms, connectivity, CA channels, sources, and creature-relative space.",
      {
        order: 60, source: "engine/Map/Map.cpp",
        routeId: "ecology", helpId: "route.ecology",
        document: "world_ecology_observatory.md"
      }),
    node("domain.scripts", "domain", "Running scripts",
      "Observed virtual machines, blocking state, source, and context.",
      {
        order: 70, source: "engine/Caos/CAOSMachine.cpp",
        routeId: "scripts", helpId: "route.scripts",
        document: "tab_scripts.md"
      }),
    node("domain.logs", "domain", "Engine records",
      "Structured and legacy engine/API records with timing and context.",
      {
        order: 80, source: "engine/DebugServer.cpp",
        routeId: "logs", helpId: "route.logs", document: "tab_log.md"
      }),

    node("api.session", "transport", "Session API",
      "World identity, pause, speed, ticks, and connection freshness.",
      {
        order: 10, kind: "endpoint", endpoint: "GET /api/session",
        document: "api_reference.md", section: "session-and-engine-state"
      }),
    node("api.creatures", "transport", "Creature APIs",
      "Creature lists and bounded population snapshots.",
      {
        order: 20, kind: "endpoint",
        endpoint: "GET /api/creatures and /api/creatures/snapshot",
        document: "api_reference.md"
      }),
    node("api.observation", "transport", "Observation API",
      "Seven-stage selected-creature evidence with source and tick metadata.",
      {
        order: 30, kind: "endpoint",
        endpoint: "GET /api/creature/:id/observation",
        document: "api_reference.md"
      }),
    node("api.chemistry", "transport", "Chemistry API",
      "Current chemical concentrations for one exact creature.",
      {
        order: 40, kind: "endpoint",
        endpoint: "GET /api/creature/:id/chemistry",
        document: "api_reference.md"
      }),
    node("api.brain", "transport", "Brain APIs",
      "Brain layout, lobe, neuron, tract, and dendrite observations.",
      {
        order: 50, kind: "endpoint",
        endpoint: "GET /api/creature/:id/brain/…",
        document: "api_reference.md"
      }),
    node("api.ecology", "transport", "Ecology API",
      "Bounded room, edge, CA, source, and agent snapshot.",
      {
        order: 60, kind: "endpoint", endpoint: "GET /api/ecology",
        document: "api_reference.md"
      }),
    node("api.scripts", "transport", "Script APIs",
      "Running machines, installed scripts, sources, and compile maps.",
      {
        order: 70, kind: "endpoint",
        endpoint: "GET /api/scripts and /api/scriptorium",
        document: "api_reference.md"
      }),
    node("stream.logs", "transport", "Event stream",
      "Server-sent structured log, API, gap, and world-boundary records.",
      {
        order: 80, kind: "endpoint", endpoint: "SSE /api/events",
        document: "api_reference.md"
      }),
    node("api.experiment", "transport", "Experiment context API",
      "World provenance and branch/disposable status for protocols.",
      {
        order: 90, kind: "endpoint",
        endpoint: "GET /api/experiment/context",
        document: "experiment_workspaces.md"
      }),
    node("api.genetics", "transport", "Genetics APIs",
      "Trusted file identities, copies, saves, diffs, and injection results.",
      {
        order: 100, kind: "endpoint", endpoint: "/api/genetics/…",
        document: "tab_genetics_kit.md"
      }),
    node("api.caos", "transport", "CAOS APIs",
      "Validation, reviewed execution, script mutation, and debugging.",
      {
        order: 110, kind: "endpoint",
        endpoint: "/api/caos/validate, /api/execute, /api/scriptorium/…",
        document: "tab_caos_ide.md"
      }),

    node("browser.state", "browser", "Observatory state",
      "Immutable world, selection, sample, recording, and evidence contracts.",
      {
        order: 10, source: "tools/observatory_state.js",
        document: "observatory_state.md"
      }),
    node("browser.navigation", "browser", "Context routes",
      "Named routes preserve world, selections, time, and history.",
      {
        order: 20, source: "tools/observatory_navigation.js",
        document: "shared_context_navigation.md"
      }),
    node("browser.observation", "browser", "Observation composer",
      "Aligns separately sourced stages without asserting a why-chain.",
      {
        order: 30, source: "tools/creature_observation.js",
        document: "live_creature_observation.md"
      }),
    node("browser.series", "browser", "Biological series",
      "Retains bounded samples and mechanically derives deltas and trends.",
      {
        order: 40, source: "tools/biological_series.js",
        document: "tab_creatures.md",
        section: "sampling-retention-and-stale-data"
      }),
    node("browser.timeline", "browser", "Timeline recorder",
      "Retains sampled observations and exact events on world ticks.",
      {
        order: 50, source: "tools/ethology_timeline.js",
        document: "ethology_timeline.md"
      }),
    node("browser.comparison", "browser", "Comparison model",
      "Calculates explicit cohort/range summaries and missingness.",
      {
        order: 60, source: "tools/comparison_model.js",
        document: "creature_cohort_comparison.md"
      }),
    node("browser.ecology", "browser", "Ecology model",
      "Builds bounded map, route, CA, and creature-relative projections.",
      {
        order: 70, source: "tools/ecology_model.js",
        document: "world_ecology_observatory.md"
      }),
    node("browser.logs", "browser", "Log retention",
      "Normalizes and retains structured records, gaps, and bookmarks.",
      {
        order: 80, source: "tools/log_model.js", document: "tab_log.md"
      }),
    node("browser.experiment", "browser", "Experiment model",
      "Separates user-authored protocol, observed samples, and interventions.",
      {
        order: 90, source: "tools/experiment_model.js",
        document: "experiment_workspaces.md"
      }),
    node("browser.provenance", "browser", "Provenance transport",
      "Carries reviewed actions and engine results into the experiment ledger.",
      {
        order: 100, source: "tools/provenance_transport.js",
        document: "experiment_workspaces.md"
      }),

    node("surface.dashboard", "surface", "Overview",
      "Live orientation and bounded Observatory summaries.",
      {
        order: 10, routeId: "dashboard", helpId: "route.dashboard",
        document: "observatory_navigation_dashboard.md"
      }),
    node("surface.creatures", "surface", "Creatures",
      "Live biology, observation strip, monitoring, brain, organs, and genome.",
      {
        order: 20, routeId: "creatures", helpId: "route.creatures",
        document: "tab_creatures.md"
      }),
    node("surface.timeline", "surface", "Timeline",
      "Historical event and sampled-state investigation.",
      {
        order: 30, routeId: "timeline", helpId: "route.timeline",
        document: "ethology_timeline.md"
      }),
    node("surface.compare", "surface", "Compare",
      "Individual, retained-range, and cohort comparison.",
      {
        order: 40, routeId: "compare", helpId: "route.compare",
        document: "creature_cohort_comparison.md"
      }),
    node("surface.ecology", "surface", "World & ecology",
      "Room graph, CA fields, sources, agents, and relative context.",
      {
        order: 50, routeId: "ecology", helpId: "route.ecology",
        document: "world_ecology_observatory.md"
      }),
    node("surface.scripts", "surface", "Running scripts",
      "Compact current and retained CAOS machine activity.",
      {
        order: 60, routeId: "scripts", helpId: "route.scripts",
        document: "tab_scripts.md"
      }),
    node("surface.logs", "surface", "Logs",
      "Search, context preview, gaps, correlations, and handoffs.",
      {
        order: 70, routeId: "logs", helpId: "route.logs",
        document: "tab_log.md"
      }),
    node("surface.experiments", "surface", "Experiments",
      "Protocol, baseline, treatment, ledger, and exports.",
      {
        order: 80, routeId: "experiments", helpId: "route.experiments",
        document: "experiment_workspaces.md"
      }),
    node("surface.chemicals", "surface", "Chemical intervention",
      "Previewed and confirmed concentration change.",
      {
        order: 90, routeId: "chemicals", helpId: "route.chemicals",
        document: "safe_chemical_interventions.md"
      }),
    node("surface.genetics", "surface", "Genetics",
      "Copy-first genome experiment and deliberate injection.",
      {
        order: 100, routeId: "genetics", helpId: "route.genetics",
        document: "tab_genetics_kit.md"
      }),
    node("surface.workbench", "surface", "CAOS Workbench",
      "Explicit evaluate, inspect, install, replace, and remove modes.",
      {
        order: 110, routeId: "workbench", helpId: "route.workbench",
        document: "tab_caos_ide.md"
      }),
    node("surface.architecture", "surface", "Architecture graph",
      "Static model with explicitly bounded live-context highlighting.",
      {
        order: 120, routeId: "architecture",
        helpId: "route.architecture",
        document: "live_architecture_graph.md"
      }),

    node("external.exports", "external", "Recording exports",
      "Portable JSON/JSONL evidence with schema and provenance.",
      {
        order: 10, kind: "external",
        document: "experiment_workspaces.md"
      }),
    node("external.mcp", "external", "MCP adapter",
      "Node stdio adapter that calls the same REST API when configured.",
      {
        order: 20, kind: "external", source: "mcp/server.js",
        document: "api_reference.md"
      })
  ]);

  function edge(id, from, to, relationship, evidence, options) {
    return freeze(Object.assign({
      id, from, to, relationship, evidence,
      label: relationship,
      unit: null,
      transformation: "None",
      cadence: "On demand",
      endpointNode: null
    }, options || {}));
  }

  const EDGES = Object.freeze([
    edge("app-agents", "engine.app", "engine.agent-manager", "owns", "static"),
    edge("app-map", "engine.app", "engine.map", "owns", "static"),
    edge("app-server", "engine.app", "engine.debug-server", "hosts", "static"),
    edge("agents-agent", "engine.agent-manager", "domain.agent", "manages", "static"),
    edge("agent-creature", "domain.agent", "domain.creature", "specializes", "static"),
    edge("creature-brain", "domain.creature", "domain.brain", "contains", "static"),
    edge("creature-biochem", "domain.creature", "domain.biochemistry", "contains", "static"),
    edge("creature-genome", "domain.creature", "domain.genome", "constructed from", "static"),
    edge("map-ecology", "engine.map", "domain.ecology", "supplies", "static"),
    edge("vm-scripts", "engine.caos-vm", "domain.scripts", "executes", "static"),
    edge("server-logs", "engine.debug-server", "domain.logs", "records", "static"),

    edge("server-session", "engine.debug-server", "api.session", "serves", "static"),
    edge("creature-api", "domain.creature", "api.creatures", "serializes", "static"),
    edge("creature-observation", "domain.creature", "api.observation", "samples", "static"),
    edge("biochem-chemistry", "domain.biochemistry", "api.chemistry", "serializes", "static",
      { unit: "concentration 0..1" }),
    edge("brain-api", "domain.brain", "api.brain", "serializes", "static"),
    edge("ecology-api", "domain.ecology", "api.ecology", "serializes", "static"),
    edge("scripts-api", "domain.scripts", "api.scripts", "serializes", "static"),
    edge("logs-stream", "domain.logs", "stream.logs", "streams", "static"),
    edge("server-experiment", "engine.debug-server", "api.experiment", "serves", "static"),
    edge("genome-genetics", "domain.genome", "api.genetics", "reads/writes reviewed copy", "static"),
    edge("vm-caos", "engine.caos-vm", "api.caos", "validates/executes", "static"),

    edge("session-state", "api.session", "browser.state", "normalizes", "observed",
      { cadence: "Shared status polling", endpointNode: "api.session" }),
    edge("creatures-state", "api.creatures", "browser.state", "selects from", "observed",
      { cadence: "Active-view bounded polling", endpointNode: "api.creatures" }),
    edge("observation-compose", "api.observation", "browser.observation", "aligns", "derived",
      {
        transformation: "Stage-by-stage timing/evidence composition",
        cadence: "Active creature observation polling",
        endpointNode: "api.observation"
      }),
    edge("chemistry-series", "api.chemistry", "browser.series", "retains", "derived",
      {
        unit: "concentration 0..1",
        transformation: "Bounded samples, Δprev, Δbaseline, rate",
        cadence: "Selected 1/2/5 second interval",
        endpointNode: "api.chemistry"
      }),
    edge("observation-timeline", "browser.observation", "browser.timeline", "records", "derived",
      {
        transformation: "Sample/event retention on world ticks",
        cadence: "Timeline recording interval",
        endpointNode: "api.observation"
      }),
    edge("series-timeline", "browser.series", "browser.timeline", "records changes", "derived",
      {
        transformation: "Threshold/change event derivation",
        cadence: "Timeline recording interval",
        endpointNode: "api.chemistry"
      }),
    edge("creatures-comparison", "api.creatures", "browser.comparison", "summarizes", "derived",
      {
        transformation: "Raw points, n/missing, median, IQR",
        cadence: "Manual or active-view capture",
        endpointNode: "api.creatures"
      }),
    edge("ecology-browser", "api.ecology", "browser.ecology", "projects", "derived",
      {
        transformation: "Room graph, CA overlays, bounded route",
        cadence: "Manual or active-view snapshot",
        endpointNode: "api.ecology"
      }),
    edge("ecology-observation-context", "browser.ecology",
      "browser.observation", "may support interpretation", "inferred",
      {
        transformation: "Investigator-selected environmental context",
        cadence: "Only when explicitly compared at compatible ticks"
      }),
    edge("stream-browser-logs", "stream.logs", "browser.logs", "retains", "observed",
      { cadence: "Event driven", endpointNode: "stream.logs" }),
    edge("experiment-browser", "api.experiment", "browser.experiment", "qualifies", "observed",
      { cadence: "Protocol creation and world revalidation", endpointNode: "api.experiment" }),
    edge("provenance-experiment", "browser.provenance", "browser.experiment", "appends", "observed",
      { cadence: "Confirmed reviewed actions" }),
    edge("state-navigation", "browser.state", "browser.navigation", "provides context", "observed"),

    edge("state-dashboard", "browser.state", "surface.dashboard", "renders", "derived"),
    edge("observation-creatures", "browser.observation", "surface.creatures", "renders", "derived"),
    edge("series-creatures", "browser.series", "surface.creatures", "renders", "derived"),
    edge("timeline-surface", "browser.timeline", "surface.timeline", "renders", "derived"),
    edge("comparison-surface", "browser.comparison", "surface.compare", "renders", "derived"),
    edge("ecology-surface", "browser.ecology", "surface.ecology", "renders", "derived"),
    edge("scripts-surface", "api.scripts", "surface.scripts", "renders", "observed",
      { endpointNode: "api.scripts" }),
    edge("logs-surface", "browser.logs", "surface.logs", "renders", "observed"),
    edge("experiment-surface", "browser.experiment", "surface.experiments", "renders", "derived"),
    edge("chemistry-intervention", "api.chemistry", "surface.chemicals", "previews against", "derived",
      { endpointNode: "api.chemistry" }),
    edge("genetics-surface", "api.genetics", "surface.genetics", "renders", "derived",
      { endpointNode: "api.genetics" }),
    edge("caos-surface", "api.caos", "surface.workbench", "reviews", "derived",
      { endpointNode: "api.caos" }),
    edge("navigation-architecture", "browser.navigation", "surface.architecture", "supplies context", "observed"),

    edge("timeline-export", "browser.timeline", "external.exports", "exports", "derived"),
    edge("experiment-export", "browser.experiment", "external.exports", "exports", "derived"),
    edge("server-mcp", "engine.debug-server", "external.mcp", "serves REST to", "static")
  ]);

  function path(id, label, routeIds, steps) {
    return freeze({ id, label, routeIds, steps });
  }

  function step(nodeId, field, unit, transformation, cadence, evidence) {
    return freeze({
      nodeId, field, unit, transformation, cadence, evidence
    });
  }

  const PATHS = Object.freeze([
    path("creature.drive", "Creature drive → retained display",
      ["creatures", "timeline", "compare"], [
        step("domain.biochemistry", "Drive chemical", "concentration 0..1",
          "Engine biochemical update", "Engine tick", "observed"),
        step("api.chemistry", "chemicals[id]", "concentration 0..1",
          "Numeric serialization", "On request", "observed"),
        step("browser.series", "metric sample", "concentration 0..1",
          "Bounded retention and numeric deltas", "1/2/5 seconds", "derived"),
        step("surface.creatures", "bar and sparkline", "concentration and Δ",
          "Display scaling only", "Active view", "derived"),
        step("external.exports", "series JSON", "raw values and ticks",
          "Schema serialization", "Explicit export", "derived")
      ]),
    path("creature.chemical", "Chemical concentration → intervention context",
      ["creatures", "chemicals", "experiments"], [
        step("domain.biochemistry", "Chemical slot", "concentration 0..1",
          "Engine biochemical update", "Engine tick", "observed"),
        step("api.chemistry", "chemicals[id]", "concentration 0..1",
          "Numeric serialization", "Fresh request", "observed"),
        step("browser.series", "retained chemical", "concentration and Δ",
          "Bounded history", "1/2/5 seconds", "derived"),
        step("surface.chemicals", "clamp preview", "signed dose or target",
          "Immediate numeric clamp only", "Explicit review", "derived"),
        step("browser.provenance", "intervention record", "before/after and ticks",
          "Confirmed action/result pairing", "On apply", "observed")
      ]),
    path("ecology.ca", "Room CA value → ecology display",
      ["ecology"], [
        step("domain.ecology", "Room CA channel", "engine CA value",
          "Engine CA update", "Engine tick", "observed"),
        step("api.ecology", "rooms[].ca[channel]", "engine CA value",
          "Bounded snapshot serialization", "On snapshot", "observed"),
        step("browser.ecology", "CA overlay and route", "value and permeability",
          "Geometry projection / route query", "Snapshot cadence", "derived"),
        step("surface.ecology", "room colour, source, route", "labelled CA value",
          "Display mapping", "Active snapshot", "derived")
      ]),
    path("scripts.runtime", "CAOS machine → Running Scripts",
      ["scripts", "debugger", "workbench"], [
        step("domain.scripts", "VM state and context", "state/IP/identifiers",
          "Engine observation", "Engine scheduling", "observed"),
        step("api.scripts", "script rows", "state/IP/identifiers",
          "Bounded serialization", "2 seconds or manual", "observed"),
        step("surface.scripts", "grouped activity row", "state and age",
          "Stable grouping/sorting", "Active view", "derived")
      ]),
    path("logs.record", "Engine record → contextual Log",
      ["logs", "diagnostics"], [
        step("domain.logs", "Structured record", "ticks/context/message",
          "Engine/API record creation", "Event driven", "observed"),
        step("stream.logs", "SSE event", "JSON record",
          "Stream serialization", "Event driven", "observed"),
        step("browser.logs", "retained record", "normalized fields",
          "Normalization, gap and duplicate handling", "Event driven", "derived"),
        step("surface.logs", "row and context preview", "structured context",
          "Filter and presentation", "Active stream", "derived")
      ]),
    path("experiment.recording", "Observed sample → experiment export",
      ["experiments", "chemicals", "genetics"], [
        step("api.experiment", "world context", "world/tick/speed",
          "Context serialization", "Protocol/revalidation", "observed"),
        step("browser.experiment", "protocol and samples", "ticks and measures",
          "User-authored protocol plus retained observations",
          "Recording interval", "derived"),
        step("browser.provenance", "action/result ledger", "operation and ticks",
          "Reviewed action/result pairing", "On intervention", "observed"),
        step("surface.experiments", "baseline/treatment workspace", "phase and gaps",
          "Presentation", "Recording interval", "derived"),
        step("external.exports", "manifest JSON", "schema/provenance",
          "Schema serialization", "Explicit export", "derived")
      ])
  ]);

  const ROUTE_CONTEXT = freeze({
    dashboard: {
      nodes: ["surface.dashboard", "browser.state", "api.session"],
      pathId: null
    },
    creatures: {
      nodes: ["surface.creatures", "domain.creature", "api.observation",
        "api.chemistry", "browser.observation", "browser.series"],
      pathId: "creature.drive"
    },
    timeline: {
      nodes: ["surface.timeline", "browser.timeline", "domain.creature"],
      pathId: "creature.drive"
    },
    compare: {
      nodes: ["surface.compare", "browser.comparison", "api.creatures"],
      pathId: "creature.drive"
    },
    ecology: {
      nodes: ["surface.ecology", "domain.ecology", "api.ecology",
        "browser.ecology"],
      pathId: "ecology.ca"
    },
    scripts: {
      nodes: ["surface.scripts", "domain.scripts", "api.scripts"],
      pathId: "scripts.runtime"
    },
    logs: {
      nodes: ["surface.logs", "domain.logs", "stream.logs", "browser.logs"],
      pathId: "logs.record"
    },
    diagnostics: {
      nodes: ["surface.logs", "domain.logs", "stream.logs", "browser.logs"],
      pathId: "logs.record"
    },
    experiments: {
      nodes: ["surface.experiments", "api.experiment",
        "browser.experiment", "browser.provenance"],
      pathId: "experiment.recording"
    },
    chemicals: {
      nodes: ["surface.chemicals", "domain.biochemistry",
        "api.chemistry", "browser.provenance"],
      pathId: "creature.chemical"
    },
    genetics: {
      nodes: ["surface.genetics", "domain.genome", "api.genetics"],
      pathId: "experiment.recording"
    },
    workbench: {
      nodes: ["surface.workbench", "engine.caos-vm", "api.caos"],
      pathId: "scripts.runtime"
    },
    architecture: {
      nodes: ["surface.architecture", "browser.navigation"],
      pathId: null
    }
  });

  const ENDPOINT_MATCHERS = freeze([
    { nodeId: "api.session", pattern: /^\/api\/(?:session|engine-state|world\/tick)/ },
    { nodeId: "api.creatures", pattern: /^\/api\/creatures(?:\/snapshot)?(?:\?|$)/ },
    { nodeId: "api.observation", pattern: /^\/api\/creature\/[^/]+\/(?:observation|organs)(?:\?|$)/ },
    { nodeId: "api.chemistry", pattern: /^\/api\/creature\/[^/]+\/chemistry(?:\?|$)/ },
    { nodeId: "api.brain", pattern: /^\/api\/creature\/[^/]+\/brain(?:\/|$)/ },
    { nodeId: "api.ecology", pattern: /^\/api\/ecology(?:\?|$)/ },
    { nodeId: "api.scripts", pattern: /^\/api\/(?:scripts|scriptorium|compile-map)(?:\/|\?|$)/ },
    { nodeId: "stream.logs", pattern: /^\/api\/events(?:\?|$)/ },
    { nodeId: "api.experiment", pattern: /^\/api\/(?:experiment|worlds|world\/branch)(?:\/|\?|$)/ },
    { nodeId: "api.genetics", pattern: /^\/api\/genetics(?:\/|$)/ },
    { nodeId: "api.caos", pattern: /^\/api\/(?:caos|execute|breakpoint|continue|step)(?:\/|$)/ }
  ]);

  function endpointForUrl(rawUrl) {
    let pathname;
    try {
      pathname = new URL(String(rawUrl), "http://observatory.local").pathname;
    } catch (_) {
      pathname = String(rawUrl || "").split("?")[0];
    }
    const match = ENDPOINT_MATCHERS.find(item =>
      item.pattern.test(pathname));
    return match ? match.nodeId : null;
  }

  function liveContext(state, route, resourceEntries, nowMs) {
    const source = state || {};
    const currentRoute = route || {};
    const routeId = currentRoute.routeId || "dashboard";
    const mapping = ROUTE_CONTEXT[routeId] || { nodes: [], pathId: null };
    const now = Number(nowMs) || Date.now();
    const recentEndpoints = {};
    (resourceEntries || []).forEach(entry => {
      const nodeId = endpointForUrl(entry.name);
      if (!nodeId) return;
      const responseStatus = entry.responseStatus == null
        ? null : Number(entry.responseStatus);
      if (responseStatus != null && responseStatus >= 400) return;
      const responseEnd = Number(entry.responseEnd) || 0;
      const ageMs = performanceAge(entry, now, responseEnd);
      if (ageMs > 30000) return;
      const previous = recentEndpoints[nodeId];
      if (!previous || previous.ageMs > ageMs) {
        recentEndpoints[nodeId] = {
          nodeId,
          ageMs: Math.max(0, Math.round(ageMs)),
          url: String(entry.name),
          status: responseStatus
        };
      }
    });
    const observedNodeIds = Object.keys(recentEndpoints);
    const selection = source.selection || {};
    const selectionContext = {
      creature: "domain.creature",
      agent: "domain.agent",
      script: "domain.scripts",
      room: "domain.ecology",
      chemical: "domain.biochemistry",
      genome: "domain.genome",
      logRecord: "domain.logs",
      timelineEvent: "browser.timeline"
    };
    const selectedContextNodes = Object.keys(selectionContext)
      .filter(kind => selection[kind])
      .map(kind => selectionContext[kind]);
    const contextNodeIds = mapping.nodes.concat(selectedContextNodes).filter(
      id => !observedNodeIds.includes(id));
    const derivedNodeIds = [];
    EDGES.forEach(item => {
      if (item.evidence !== "derived" || !item.endpointNode ||
          !recentEndpoints[item.endpointNode]) return;
      derivedNodeIds.push(item.to);
    });
    const identifiers = [];
    if (source.world && source.world.identity) {
      identifiers.push({
        label: "World", value: source.world.identity.name
      });
    }
    if (source.world && source.world.tick != null) {
      identifiers.push({
        label: "Sample tick", value: String(source.world.tick)
      });
    }
    [
      "creature", "agent", "script", "room", "chemical", "genome",
      "logRecord", "timelineEvent"
    ].forEach(kind => {
      if (selection[kind]) identifiers.push({
        label: kind, value: String(selection[kind].id)
      });
    });
    if (source.recording && source.recording.active) {
      identifiers.push({
        label: "Recording", value: "Active"
      });
      derivedNodeIds.push("browser.experiment");
    }
    return freeze({
      connected: source.connection &&
        source.connection.status === "connected",
      routeId,
      pathId: mapping.pathId,
      observedNodeIds: unique(observedNodeIds),
      contextNodeIds: unique(contextNodeIds),
      derivedNodeIds: unique(derivedNodeIds),
      recentEndpoints,
      identifiers
    });
  }

  function performanceAge(entry, now, responseEnd) {
    if (entry && entry.__ageMs != null) return Number(entry.__ageMs);
    if (typeof performance !== "undefined" &&
        performance.timeOrigin != null) {
      return now - (performance.timeOrigin + responseEnd);
    }
    return now - responseEnd;
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function visibleModel(layerIds, query) {
    const allowed = new Set(Array.isArray(layerIds)
      ? layerIds : LAYERS.map(layer => layer.id));
    const needle = String(query || "").trim().toLowerCase();
    const nodes = NODES.filter(item =>
      allowed.has(item.layer) &&
      (!needle || [
        item.id, item.label, item.summary, item.endpoint,
        item.source
      ].some(value => String(value || "").toLowerCase().includes(needle))));
    const ids = new Set(nodes.map(item => item.id));
    return {
      nodes,
      edges: EDGES.filter(item =>
        ids.has(item.from) && ids.has(item.to))
    };
  }

  function validate() {
    const errors = [];
    const layerIds = new Set(LAYERS.map(item => item.id));
    const nodeIds = new Set();
    NODES.forEach(item => {
      if (nodeIds.has(item.id)) errors.push("Duplicate node: " + item.id);
      nodeIds.add(item.id);
      if (!layerIds.has(item.layer))
        errors.push("Unknown node layer: " + item.id + " → " + item.layer);
      if (!item.label || !item.summary)
        errors.push("Incomplete node: " + item.id);
    });
    const edgeIds = new Set();
    EDGES.forEach(item => {
      if (edgeIds.has(item.id)) errors.push("Duplicate edge: " + item.id);
      edgeIds.add(item.id);
      if (!nodeIds.has(item.from) || !nodeIds.has(item.to))
        errors.push("Broken edge: " + item.id);
      if (!EVIDENCE[item.evidence])
        errors.push("Unknown edge evidence: " + item.id);
    });
    const pathIds = new Set();
    PATHS.forEach(item => {
      if (pathIds.has(item.id)) errors.push("Duplicate path: " + item.id);
      pathIds.add(item.id);
      if (item.steps.length < 2)
        errors.push("Short data path: " + item.id);
      item.steps.forEach(itemStep => {
        if (!nodeIds.has(itemStep.nodeId))
          errors.push("Broken data path: " + item.id + " → " +
            itemStep.nodeId);
        ["field", "unit", "transformation", "cadence", "evidence"]
          .forEach(field => {
            if (!itemStep[field])
              errors.push("Incomplete path step: " + item.id + " → " +
                itemStep.nodeId + " → " + field);
          });
      });
    });
    Object.keys(ROUTE_CONTEXT).forEach(routeId => {
      const mapping = ROUTE_CONTEXT[routeId];
      mapping.nodes.forEach(id => {
        if (!nodeIds.has(id))
          errors.push("Broken route context: " + routeId + " → " + id);
      });
      if (mapping.pathId && !pathIds.has(mapping.pathId))
        errors.push("Broken route path: " + routeId + " → " +
          mapping.pathId);
    });
    return errors;
  }

  function nodeById(id) {
    return NODES.find(item => item.id === id) || null;
  }

  function edgeById(id) {
    return EDGES.find(item => item.id === id) || null;
  }

  function pathById(id) {
    return PATHS.find(item => item.id === id) || null;
  }

  return freeze({
    VERSION,
    LAYERS,
    EVIDENCE,
    NODES,
    EDGES,
    PATHS,
    ROUTE_CONTEXT,
    ENDPOINT_MATCHERS,
    endpointForUrl,
    liveContext,
    visibleModel,
    validate,
    nodeById,
    edgeById,
    pathById
  });
});
