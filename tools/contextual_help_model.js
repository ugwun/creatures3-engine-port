// contextual_help_model.js — authoritative contextual-help metadata and routes
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ContextualHelpModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const ACTIVITY_LABELS = Object.freeze({
    observe: "Observes the world",
    "read-only": "Read-only query",
    "reviewed-change": "Can lead to a reviewed change",
    develop: "Development and diagnosis",
    learn: "Documentation only"
  });

  const EVIDENCE_LABELS = Object.freeze({
    observed: "Observed",
    derived: "Derived",
    inferred: "Inferred",
    unknown: "Unknown",
    mixed: "Mixed evidence"
  });

  function freezeDefinition(definition) {
    return Object.freeze(Object.assign({}, definition, {
      evidence: Object.freeze(Object.assign({}, definition.evidence)),
      guide: definition.guide
        ? Object.freeze(Object.assign({}, definition.guide)) : null,
      reference: definition.reference
        ? Object.freeze(Object.assign({}, definition.reference)) : null,
      terms: Object.freeze((definition.terms || []).slice())
    }));
  }

  const DEFINITIONS = [
    {
      id: "concept.evidence-levels",
      selector: "button.evidence-badge",
      title: "Evidence levels",
      summary: "Observed, Derived, Inferred, and Unknown state how a claim was produced, not whether it is important.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Shared Observatory evidence contract",
        cadence: "Definitions are static and available offline."
      },
      caution: "A plausible interpretation is still Inferred. Do not promote it to an engine fact without a direct source.",
      guide: {
        document: "observatory_glossary.md",
        section: "evidence-and-authorship",
        label: "Read the evidence legend"
      },
      reference: {
        document: "observatory_state.md",
        section: "evidence-level-contract",
        label: "Open the evidence contract"
      },
      terms: ["evidence", "observed", "derived", "inferred", "unknown"],
      owner: "Task 01 / Task 17"
    },
    {
      id: "action.accessibility-settings",
      selector: "#btn-accessibility",
      title: "Keyboard and display settings",
      summary: "Publish keyboard commands and adjust density, reduced motion, and global shortcut conflict handling.",
      activity: "learn",
      evidence: {
        level: "observed",
        source: "Browser-local Observatory accessibility preferences",
        cadence: "Applied immediately and retained in this browser."
      },
      caution: "Display preferences do not change engine state, evidence, sampling, or reviewed-change safeguards.",
      guide: {
        document: "guide_keyboard_observatory.md",
        section: "check-help-and-conflicts",
        label: "Run the keyboard tour"
      },
      reference: {
        document: "accessibility_and_responsive.md",
        label: "Open accessibility reference"
      },
      terms: ["keyboard", "density", "reduced motion", "shortcut conflict"],
      owner: "Task 19"
    },
    {
      id: "route.dashboard",
      routeId: "dashboard",
      title: "Observatory overview",
      summary: "Orient to the live session, population, experiment, interventions, diagnostics, and retained signals.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Shared session sample, bounded creature/script reads, Observatory state",
        cadence: "Session is shared globally; dashboard summaries refresh at most every 5 seconds while visible."
      },
      caution: "Cards come from different captures. Their values are not guaranteed to be simultaneous.",
      guide: {
        document: "guide_orient_and_observe.md",
        section: "orient-to-a-world-and-select-a-creature",
        label: "Orient and select a creature"
      },
      reference: {
        document: "observatory_navigation_dashboard.md",
        section: "reading-the-dashboard",
        label: "Read dashboard details"
      },
      terms: ["world tick", "sample time", "freshness"],
      owner: "Task 16"
    },
    {
      id: "route.creatures",
      routeId: "creatures",
      title: "Live creature observation",
      summary: "Inspect one creature's current drives, chemistry, organs, brain, genome, and evidence-linked observation strip.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Creature, brain, chemistry, organ, genome, and script endpoints",
        cadence: "Each panel states its own active-view polling interval and sample age."
      },
      caution: "Concurrent biological and neural signals support investigation; they do not prove a single cause or intent.",
      guide: {
        document: "guide_orient_and_observe.md",
        section: "observe-perception-attention-action-and-consequence",
        label: "Follow one creature"
      },
      reference: {
        document: "tab_creatures.md",
        label: "Open creature reference"
      },
      terms: ["drive", "stimulus", "attention", "decision", "action", "consequence"],
      owner: "Tasks 02, 07, 08"
    },
    {
      id: "route.timeline",
      routeId: "timeline",
      title: "Ethology timeline",
      summary: "Review bounded sampled observations and recorded events on world ticks for one selected creature.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Retained creature, script, log, biological, and intervention records",
        cadence: "User-selected 1, 2, or 5 second wall-time sampling; exact events remain separately labelled."
      },
      caution: "A temporal sequence is evidence of order, not proof that the earlier event caused the later one.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "investigate-a-surprising-or-failed-action",
        label: "Investigate an action"
      },
      reference: {
        document: "ethology_timeline.md",
        label: "Open timeline reference"
      },
      terms: ["world tick", "sample time", "action", "consequence"],
      owner: "Task 09"
    },
    {
      id: "route.compare",
      routeId: "compare",
      title: "Creature and cohort comparison",
      summary: "Compare exact individuals, retained ranges, or an explicit cohort with raw values and missingness.",
      activity: "observe",
      evidence: {
        level: "derived",
        source: "Observed individual samples and mechanically calculated summaries",
        cadence: "Manual capture or active-view interval selected in the Compare toolbar."
      },
      caution: "A cohort median or IQR describes the sampled cohort; it is not a healthy target for an individual.",
      guide: {
        document: "guide_follow_and_compare.md",
        section: "compare-an-individual-with-a-cohort",
        label: "Compare an individual and cohort"
      },
      reference: {
        document: "creature_cohort_comparison.md",
        label: "Open comparison reference"
      },
      terms: ["cohort", "median", "missing data", "sample time"],
      owner: "Task 10"
    },
    {
      id: "route.ecology",
      routeId: "ecology",
      title: "World and ecology",
      summary: "Inspect room geometry, connections, CA fields, sources, agents, and creature-relative environmental evidence.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Bounded ecology snapshot and selected-creature context",
        cadence: "Manual or active-view snapshot; capture tick and age are shown."
      },
      caution: "Reachability, CA strength, sensory availability, and an inferred affordance are different claims.",
      guide: {
        document: "guide_ecology_and_routes.md",
        section: "inspect-a-room-route-and-smell-gradient",
        label: "Inspect a route and smell"
      },
      reference: {
        document: "world_ecology_observatory.md",
        label: "Open ecology reference"
      },
      terms: ["room", "CA channel", "smell gradient", "affordance"],
      owner: "Task 11"
    },
    {
      id: "route.scripts",
      routeId: "scripts",
      title: "Running scripts",
      summary: "Follow active, waiting, blocked, paused, and recently finished CAOS virtual machines.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "GET /api/scripts plus derived activity changes between captures",
        cadence: "Manual refresh or a 2 second active-view interval."
      },
      caution: "A running script is observed execution context; it does not by itself explain a creature's biological decision.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "correlate-a-runtime-error-with-source-and-agent-context",
        label: "Trace runtime context"
      },
      reference: {
        document: "tab_scripts.md",
        label: "Open script reference"
      },
      terms: ["CAOS", "event script", "blocking", "bytecode IP"],
      owner: "Task 05"
    },
    {
      id: "route.logs",
      routeId: "logs",
      title: "Contextual logs",
      summary: "Search retained engine and API records with world-tick, agent, script, and correlation context.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Structured server-sent log and API records",
        cadence: "Event-driven stream with explicit reconnect, restart, and retention gaps."
      },
      caution: "Legacy prose without structured identifiers is not guessed into an agent or script target.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "correlate-a-runtime-error-with-source-and-agent-context",
        label: "Trace a runtime error"
      },
      reference: {
        document: "tab_log.md",
        label: "Open log reference"
      },
      terms: ["world tick", "correlation", "gap", "agent identity"],
      owner: "Task 06"
    },
    {
      id: "route.experiments",
      routeId: "experiments",
      title: "Experiment workspaces",
      summary: "Define a protocol, separate baseline/control/treatment, record gaps and interventions, and export provenance.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "User-authored protocol plus observed samples, actions, and engine confirmations",
        cadence: "Explicit recording interval selected by the investigator."
      },
      caution: "Creating a protocol does not change the world. Treatment actions must still be separately previewed and confirmed.",
      guide: {
        document: "guide_safe_experiments.md",
        section: "record-a-baseline-and-intervention",
        label: "Record a baseline and intervention"
      },
      reference: {
        document: "experiment_workspaces.md",
        label: "Open experiment reference"
      },
      terms: ["baseline", "control", "treatment", "user-authored", "provenance"],
      owner: "Task 12"
    },
    {
      id: "route.chemicals",
      routeId: "chemicals",
      title: "Chemical intervention",
      summary: "Preview and record one signed dose or absolute concentration target for the selected creature.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "Observed current concentration, derived clamp preview, confirmed engine result",
        cadence: "Fresh target capture immediately before preview and apply."
      },
      caution: "The projection is an immediate numeric clamp, not a prediction of downstream biology or behavior.",
      guide: {
        document: "guide_safe_experiments.md",
        section: "safely-test-a-chemical-change",
        label: "Safely test a chemical"
      },
      reference: {
        document: "safe_chemical_interventions.md",
        label: "Open chemical safety reference"
      },
      terms: ["concentration", "dose", "intervention", "world tick"],
      owner: "Task 13"
    },
    {
      id: "route.genetics",
      routeId: "genetics",
      title: "Genetics experiments",
      summary: "Inspect trusted identity, edit an experimental copy, review a structured diff, save, and deliberately inject.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "Observed genome bytes/checksums, decoded fields, derived diff, engine-confirmed file operations",
        cadence: "On-demand reads with checksum and stale-state revalidation before writes."
      },
      caution: "Editing browser memory is reversible; saving or injecting is not. Never use a protected original as the write target.",
      guide: {
        document: "guide_safe_experiments.md",
        section: "safely-test-a-genome-change",
        label: "Safely test a genome"
      },
      reference: {
        document: "tab_genetics_kit.md",
        label: "Open genetics safety reference"
      },
      terms: ["genome", "gene", "checksum", "life stage", "injection"],
      owner: "Task 14"
    },
    {
      id: "route.workbench",
      routeId: "workbench",
      title: "CAOS Workbench",
      summary: "Choose explicit Evaluate, Inspect, Install, Replace, or Remove authoring modes with reviewed context.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "Compiler validation, reviewed world/target/script checksums, engine execution response",
        cadence: "On demand; context is revalidated immediately before execution or mutation."
      },
      caution: "Evaluate now is ownerless and can still mutate in reviewed modes. Installed event scripts persist in the world.",
      guide: {
        document: "guide_caos_workflows.md",
        section: "evaluate-caos-and-install-an-event-script",
        label: "Choose a CAOS workflow"
      },
      reference: {
        document: "tab_caos_ide.md",
        label: "Open Workbench reference"
      },
      shortcut: "Ctrl/Cmd+Enter applies the selected mode after review.",
      terms: ["immediate CAOS", "installed event script", "ownerless", "classifier"],
      owner: "Task 15"
    },
    {
      id: "route.scratchpad",
      routeId: "scratchpad",
      title: "Evaluate-now Scratchpad",
      summary: "Run short compile-checked, known-read-only ownerless CAOS expressions.",
      activity: "read-only",
      evidence: {
        level: "observed",
        source: "Compiler validation and immediate ownerless engine evaluation",
        cadence: "One explicit request per Enter press."
      },
      caution: "Scratchpad rejects known mutation, unknown commands, and blocking/yielding source; transfer other work to Workbench.",
      guide: {
        document: "guide_caos_workflows.md",
        section: "evaluate-caos-and-install-an-event-script",
        label: "Choose Scratchpad or Workbench"
      },
      reference: {
        document: "tab_console.md",
        label: "Open Scratchpad reference"
      },
      shortcut: "Enter evaluates; Shift+Enter inserts a new line.",
      terms: ["immediate CAOS", "ownerless", "read-only"],
      owner: "Task 15"
    },
    {
      id: "route.debugger",
      routeId: "debugger",
      title: "CAOS Debugger",
      summary: "Inspect source, instruction position, variables, targets, and breakpoints for one observed running VM.",
      activity: "develop",
      evidence: {
        level: "observed",
        source: "Selected agent VM, compiled source map, and debugger endpoints",
        cadence: "Manual selection plus active debugger refresh/step actions."
      },
      caution: "Pause and step affect the selected VM; the global simulation pause is a separate control.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "correlate-a-runtime-error-with-source-and-agent-context",
        label: "Trace source and agent context"
      },
      reference: {
        document: "tab_debugger.md",
        label: "Open Debugger reference"
      },
      terms: ["event script", "bytecode IP", "OWNR", "TARG"],
      owner: "Tasks 05, 06"
    },
    {
      id: "route.diagnostics",
      routeId: "diagnostics",
      title: "Engine and API diagnostics",
      summary: "Start from explicit stream gaps, endpoint failures, and correlated engine records.",
      activity: "develop",
      evidence: {
        level: "observed",
        source: "Structured log/API records and connection state",
        cadence: "Event-driven with explicit polling failures and retained gaps."
      },
      caution: "An error record describes a failure site. Follow structured context before assigning a cause.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "correlate-a-runtime-error-with-source-and-agent-context",
        label: "Diagnose a runtime error"
      },
      reference: {
        document: "tab_log.md",
        label: "Open diagnostics reference"
      },
      terms: ["gap", "correlation", "source context"],
      owner: "Task 06"
    },
    {
      id: "route.guides",
      routeId: "guides",
      title: "Task-oriented guides",
      summary: "Choose a guide by the question you are investigating rather than by an implementation tab.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Reviewed documentation linked to live route metadata",
        cadence: "Static and available while the engine is offline."
      },
      caution: "Examples explain a method; they do not imply the same interpretation is valid for every creature or world.",
      guide: {
        document: "observatory_task_guides.md",
        label: "Open the guide index"
      },
      reference: {
        document: "contextual_help_authoring.md",
        label: "Read help authoring rules"
      },
      terms: ["task guide", "investigative intent"],
      owner: "Task 17"
    },
    {
      id: "route.caos-reference",
      routeId: "caos-reference",
      title: "CAOS reference",
      summary: "Browse engine commands, values, parameter signatures, and language semantics.",
      activity: "learn",
      evidence: {
        level: "observed",
        source: "Maintained engine command inventory and reviewed reference prose",
        cadence: "Static and available offline."
      },
      caution: "Command availability does not imply that running it is safe in the current world or ownerless context.",
      guide: {
        document: "guide_caos_workflows.md",
        label: "Use CAOS safely"
      },
      reference: {
        document: "caos_overview.md",
        label: "Open CAOS reference"
      },
      terms: ["CAOS", "command", "r-value"],
      owner: "Task 17"
    },
    {
      id: "route.architecture",
      routeId: "architecture",
      title: "Architecture graph",
      summary: "Relate engine systems and source responsibilities while retaining the current investigation.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Reviewed architecture inventory; live context is added only where explicitly mapped",
        cadence: "Static graph plus current shared Observatory context."
      },
      caution: "A dependency edge documents an implementation relationship, not a biological causal pathway.",
      guide: {
        document: "guide_trace_data_path.md",
        section: "trace-a-selected-metric-from-engine-to-export",
        label: "Trace a live metric"
      },
      reference: {
        document: "live_architecture_graph.md",
        label: "Open architecture reference"
      },
      terms: ["engine architecture", "dependency"],
      owner: "Tasks 17, 18"
    },
    {
      id: "route.evidence",
      routeId: "evidence",
      title: "Evidence and terminology",
      summary: "Use the shared vocabulary for time, biology, inference, authorship, and CAOS execution.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Shared Observatory evidence and editorial contracts",
        cadence: "Static and available offline."
      },
      caution: "Friendly labels must preserve their evidence level and supporting identifiers.",
      guide: {
        document: "observatory_glossary.md",
        label: "Open glossary and evidence legend"
      },
      reference: {
        document: "biological_labels.md",
        label: "Open biological label guidance"
      },
      terms: ["evidence", "terminology", "biological honesty"],
      owner: "Tasks 01, 02, 17"
    },
    {
      id: "panel.architecture-inspector",
      selector: "#docs-detail-panel",
      title: "Architecture data-path inspector",
      summary: "Inspect one maintained node, relationship, or metric path with units, transformations, cadence, evidence, and links.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Versioned architecture metadata plus bounded browser Resource Timing and current Observatory context",
        cadence: "Static model; live request/context status refreshes every 2 seconds while visible."
      },
      caution: "Selecting a node or documented path does not prove it executed. Only separately marked recent requests are Observed.",
      guide: {
        document: "guide_trace_data_path.md",
        section: "trace-a-selected-metric-from-engine-to-export",
        label: "Trace a selected metric"
      },
      reference: {
        document: "live_architecture_graph.md",
        section: "data-path-inspector",
        label: "Read data-path semantics"
      },
      terms: ["data path", "transformation", "cadence", "evidence"],
      owner: "Task 18"
    },
    {
      id: "field.architecture-search",
      selector: "#architecture-search",
      title: "Architecture search",
      summary: "Filter visible nodes by stable ID, label, meaning, endpoint, or maintained source path.",
      activity: "learn",
      evidence: {
        level: "observed",
        source: "Versioned architecture node metadata",
        cadence: "Immediate browser filtering."
      },
      caution: "A search result is a metadata match; it says nothing about current runtime activity.",
      guide: {
        document: "guide_trace_data_path.md",
        section: "trace-a-selected-metric-from-engine-to-export",
        label: "Trace a selected metric"
      },
      reference: {
        document: "live_architecture_graph.md",
        section: "model-and-layers",
        label: "Read model semantics"
      },
      terms: ["stable ID", "source metadata", "endpoint"],
      owner: "Task 18"
    },
    {
      id: "field.architecture-layers",
      selector: "#architecture-filter-panel",
      title: "Architecture layer and evidence filters",
      summary: "Show or hide engine, domain, transport, browser, surface, and external layers while retaining explicit evidence keys.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Versioned layer and relationship vocabulary",
        cadence: "Immediate browser filtering; static while offline."
      },
      caution: "Hiding a layer removes it from this view only. It does not remove the component or relationship from the model.",
      guide: {
        document: "guide_trace_data_path.md",
        section: "trace-a-selected-metric-from-engine-to-export",
        label: "Trace through layers"
      },
      reference: {
        document: "live_architecture_graph.md",
        section: "relationship-evidence",
        label: "Read evidence styling"
      },
      terms: ["layer", "static", "observed", "derived", "inferred"],
      owner: "Task 18"
    },
    {
      id: "field.architecture-path",
      selector: "#architecture-path-select",
      title: "Metric data path",
      summary: "Choose a reviewed sequence from engine/domain ownership through transport, transformation, display, and optional export.",
      activity: "learn",
      evidence: {
        level: "mixed",
        source: "Versioned metric-path definitions and current route trace identifier",
        cadence: "Static definition; recent endpoint status refreshes every 2 seconds."
      },
      caution: "The selected path documents possible flow. Only recent mapped request evidence marks live observation.",
      guide: {
        document: "guide_trace_data_path.md",
        section: "trace-a-selected-metric-from-engine-to-export",
        label: "Trace a metric"
      },
      reference: {
        document: "live_architecture_graph.md",
        section: "data-path-inspector",
        label: "Read path fields"
      },
      terms: ["unit", "transformation", "cadence", "export"],
      owner: "Task 18"
    },
    {
      id: "action.architecture-fit",
      selector: "#architecture-fit-selection",
      title: "Fit architecture selection",
      summary: "Center the selected node at a readable zoom, or fit the complete filtered graph when no node is selected.",
      activity: "learn",
      evidence: {
        level: "observed",
        source: "Browser graph layout and current selection",
        cadence: "Immediate presentation-only action."
      },
      caution: "Fit changes only pan and zoom. It does not change filters, evidence, selection, or the world.",
      guide: {
        document: "guide_trace_data_path.md",
        section: "trace-a-selected-metric-from-engine-to-export",
        label: "Navigate the graph"
      },
      reference: {
        document: "live_architecture_graph.md",
        section: "graph-and-text-views",
        label: "Read graph controls"
      },
      terms: ["pan", "zoom", "selection"],
      owner: "Task 18"
    },
    {
      id: "panel.biological-monitor",
      selector: "#crt-bio-monitor",
      title: "Biological time-series monitor",
      summary: "Retain bounded observed samples, show mechanical deltas, and keep explicit stable signal pins.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Selected creature drives and chemistry samples",
        cadence: "Active-view or explicit background recording interval shown beside the monitor."
      },
      caution: "A trend describes retained samples; it does not establish a preferred range or causal explanation.",
      guide: {
        document: "guide_follow_and_compare.md",
        section: "follow-a-drive-or-chemical-over-time",
        label: "Follow a signal over time"
      },
      reference: {
        document: "tab_creatures.md",
        section: "sampling-retention-and-stale-data",
        label: "Read monitor details"
      },
      terms: ["sample time", "delta", "pin"],
      owner: "Task 07"
    },
    {
      id: "panel.observation-strip",
      selector: "#crt-observation-strip",
      title: "Creature observation strip",
      summary: "Align present perception, stimulus, attention, decision, action, consequence, and physiology without asserting one cause.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Selected creature, brain, script, and biological endpoint samples",
        cadence: "Bounded live sampling while creature observation is active."
      },
      caution: "The seven columns are a temporal investigative scaffold, not a deterministic pipeline.",
      guide: {
        document: "guide_orient_and_observe.md",
        section: "observe-perception-attention-action-and-consequence",
        label: "Read the observation strip"
      },
      reference: {
        document: "live_creature_observation.md",
        label: "Open observation-strip reference"
      },
      terms: ["stimulus", "attention", "decision", "action", "consequence"],
      owner: "Task 08"
    },
    {
      id: "action.biological-record",
      selector: "#crt-bio-record",
      title: "Biological history recording",
      summary: "Pause or resume browser-side drive and chemistry history for the selected creature.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Browser recording state and selected-creature biological samples",
        cadence: "The 1, 2, or 5 second interval selected beside the control."
      },
      caution: "Pausing history does not pause the live creature view, the simulation, or another Observatory recorder.",
      guide: {
        document: "guide_follow_and_compare.md",
        section: "follow-a-drive-or-chemical-over-time",
        label: "Follow a signal over time"
      },
      reference: {
        document: "tab_creatures.md",
        section: "sampling-retention-and-stale-data",
        label: "Read biological recording details"
      },
      terms: ["recording", "sample time", "drive", "concentration"],
      owner: "Task 07"
    },
    {
      id: "action.biological-pin",
      selector: "[data-bio-pin]",
      title: "Pin a biological signal",
      summary: "Keep this exact metric in the shared biological tray with a stable identity and explicit order.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Browser pin state and retained samples for the selected metric",
        cadence: "Pin state changes immediately; values follow the biological recording interval."
      },
      caution: "Pinning preserves visibility and retained history; it does not mark the value as important or abnormal.",
      guide: {
        document: "guide_follow_and_compare.md",
        section: "follow-a-drive-or-chemical-over-time",
        label: "Follow a pinned signal"
      },
      reference: {
        document: "tab_creatures.md",
        section: "sampling-retention-and-stale-data",
        label: "Read pin and retention details"
      },
      terms: ["pin", "metric identity", "retention"],
      owner: "Task 07"
    },
    {
      id: "action.timeline-record",
      selector: "#timeline-record",
      title: "Timeline recording",
      summary: "Pause or resume browser-side timeline sampling while preserving a visible boundary.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Browser recording state and retained timeline samples",
        cadence: "The selected 1, 2, or 5 second interval."
      },
      caution: "Pausing this recording does not pause the simulation or the Log stream.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "investigate-a-surprising-or-failed-action",
        label: "Record an investigation"
      },
      reference: {
        document: "ethology_timeline.md",
        section: "start-a-recording",
        label: "Read recording details"
      },
      terms: ["recording", "sample time", "world tick"],
      owner: "Task 09"
    },
    {
      id: "action.timeline-bookmark",
      selector: ".timeline-event__bookmark",
      title: "Bookmark a timeline event",
      summary: "Mark one retained event for preferential retention and later review in this browser session.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Browser bookmark state attached to one retained timeline event",
        cadence: "Immediate browser state; it does not request a new engine sample."
      },
      caution: "A bookmark expresses investigative interest. It does not raise the event's evidence level or establish causality.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "investigate-a-surprising-or-failed-action",
        label: "Investigate a bookmarked event"
      },
      reference: {
        document: "ethology_timeline.md",
        label: "Read timeline retention details"
      },
      terms: ["bookmark", "retention", "evidence"],
      owner: "Task 09"
    },
    {
      id: "field.timeline-scrubber",
      selector: "#timeline-scrubber",
      title: "Timeline world-tick cursor",
      summary: "Choose a retained world tick and inspect the nearest available observation.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "Retained exact events and nearest sampled observations",
        cadence: "Historical; no new engine request is implied by moving the cursor."
      },
      caution: "Nearest sampled state may not have been captured at the exact event tick; each row shows its timing.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "investigate-a-surprising-or-failed-action",
        label: "Scrub an action"
      },
      reference: {
        document: "ethology_timeline.md",
        section: "scrub-zoom-and-inspect",
        label: "Read cursor details"
      },
      terms: ["world tick", "sample time"],
      owner: "Task 09"
    },
    {
      id: "field.ecology-ca-channel",
      selector: "#ecology-channel",
      title: "Cellular-automata channel",
      summary: "Choose one CA channel and inspect its sampled room values, sources, and selected-creature context.",
      activity: "observe",
      evidence: {
        level: "mixed",
        source: "World ecology snapshot and optional smell-category mapping",
        cadence: "At the ecology snapshot tick."
      },
      caution: "A friendly smell name appears only when the active world explicitly maps that CA channel.",
      guide: {
        document: "guide_ecology_and_routes.md",
        section: "inspect-a-room-route-and-smell-gradient",
        label: "Inspect a CA gradient"
      },
      reference: {
        document: "world_ecology_observatory.md",
        section: "ca-and-smell-channels",
        label: "Read CA semantics"
      },
      terms: ["CA channel", "smell gradient", "room"],
      owner: "Task 11"
    },
    {
      id: "action.experiment-record",
      selector: "#experiment-start",
      title: "Start experiment baseline",
      summary: "Begin explicit background baseline recording for the reviewed protocol and world.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "User-authored protocol and observed samples",
        cadence: "Protocol sampling interval."
      },
      caution: "Recording observes; later treatment actions may change the world and remain separate ledger entries.",
      guide: {
        document: "guide_safe_experiments.md",
        section: "record-a-baseline-and-intervention",
        label: "Record a baseline"
      },
      reference: {
        document: "experiment_workspaces.md",
        section: "baseline-control-and-treatment",
        label: "Read experiment details"
      },
      terms: ["baseline", "recording", "user-authored"],
      owner: "Task 12"
    },
    {
      id: "action.chemical-intervention",
      selector: "#btn-syringe-inject",
      title: "Review chemical intervention",
      summary: "Refresh the exact target, preview clamping, and open a final confirmation before any concentration change.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "Observed concentration and derived immediate projection",
        cadence: "Fresh precondition capture immediately before confirmation."
      },
      caution: "Applying the intervention is not a reversible preview after simulation continues.",
      guide: {
        document: "guide_safe_experiments.md",
        section: "safely-test-a-chemical-change",
        label: "Safely test a chemical"
      },
      reference: {
        document: "safe_chemical_interventions.md",
        section: "perform-a-small-recorded-intervention",
        label: "Read intervention safety"
      },
      terms: ["dose", "concentration", "intervention"],
      owner: "Task 13"
    },
    {
      id: "action.genetics-injection",
      selector: "#btn-genetics-inject",
      title: "Review genome injection",
      summary: "Review a saved experimental checksum, structured diff, operation, and branch world before injection.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "Observed checksums, derived diff, selected operation, active world context",
        cadence: "On demand with stale checksum/world revalidation."
      },
      caution: "Injection creates a new world object and is not an undo operation. Use a disposable or chosen branch.",
      guide: {
        document: "guide_safe_experiments.md",
        section: "safely-test-a-genome-change",
        label: "Safely test a genome"
      },
      reference: {
        document: "tab_genetics_kit.md",
        section: "review-and-inject",
        label: "Read injection safety"
      },
      terms: ["genome", "checksum", "injection", "life stage"],
      owner: "Task 14"
    },
    {
      id: "field.workbench-mode",
      selector: "#ide-mode-buttons",
      title: "CAOS authoring mode",
      summary: "Choose whether source is evaluated now, inspected, installed, replaced, or removed.",
      activity: "reviewed-change",
      evidence: {
        level: "mixed",
        source: "Compiler, selected mode, reviewed world/target/script state",
        cadence: "Validated after edits and rechecked at apply time."
      },
      caution: "Mode changes execution semantics. Review the context summary and diff before applying.",
      guide: {
        document: "guide_caos_workflows.md",
        section: "evaluate-caos-and-install-an-event-script",
        label: "Choose the correct CAOS mode"
      },
      reference: {
        document: "tab_caos_ide.md",
        section: "choose-the-execution-model-first",
        label: "Read authoring modes"
      },
      shortcut: "Ctrl/Cmd+Enter applies the selected mode; F1 opens command help in the editor.",
      terms: ["immediate CAOS", "installed event script", "classifier"],
      owner: "Task 15"
    },
    {
      id: "field.log-context",
      selector: "#log-context-preview",
      title: "Log context preview",
      summary: "Review exact timing, structured agent/script identity, and correlation before following a link.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Selected retained log record",
        cadence: "Event record; immutable inside the browser retention window."
      },
      caution: "Unavailable structured context remains unavailable; ordinary prose is not parsed as a modern target.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "correlate-a-runtime-error-with-source-and-agent-context",
        label: "Trace a runtime error"
      },
      reference: {
        document: "tab_log.md",
        section: "trace-a-record",
        label: "Read context handoff details"
      },
      terms: ["correlation", "agent identity", "event script"],
      owner: "Task 06"
    },
    {
      id: "action.log-bookmark",
      selector: ".log-bookmark",
      title: "Bookmark a log record",
      summary: "Keep one retained structured record easy to find while tracing its world, agent, script, or correlation context.",
      activity: "observe",
      evidence: {
        level: "observed",
        source: "Browser bookmark state attached to one retained log record",
        cadence: "Immediate browser state; the original event record remains unchanged."
      },
      caution: "Bookmarking records investigative interest only. It does not confirm the record as a root cause.",
      guide: {
        document: "guide_investigate_behavior.md",
        section: "correlate-a-runtime-error-with-source-and-agent-context",
        label: "Trace a bookmarked record"
      },
      reference: {
        document: "tab_log.md",
        section: "trace-a-record",
        label: "Read log tracing details"
      },
      terms: ["bookmark", "log record", "correlation"],
      owner: "Task 06"
    }
  ].map(freezeDefinition);

  const HELP_DEFINITIONS = Object.freeze(DEFINITIONS.reduce(
    (result, definition) => {
      result[definition.id] = definition;
      return result;
    }, {}
  ));

  const HELP_TARGETS = Object.freeze(DEFINITIONS
    .filter(definition => definition.selector)
    .map(definition => Object.freeze({
      helpId: definition.id,
      selector: definition.selector
    })));

  function get(helpId) {
    return HELP_DEFINITIONS[String(helpId || "")] || null;
  }

  function forRoute(routeId) {
    return get("route." + String(routeId || "dashboard"));
  }

  function contextIdentifiers(state, route) {
    const source = state || {};
    const currentRoute = route || {};
    const result = [];
    const world = source.world && source.world.identity;
    if (world) result.push({ label: "World", value: world.name });
    if (source.world && source.world.tick != null) {
      result.push({
        label: "World tick",
        value: String(source.world.tick)
      });
    }
    const primary = source.selection && source.selection.primary;
    let primaryId = null;
    if (primary) {
      const selectedPrimary = source.selection[primary.kind];
      primaryId = primary.id != null
        ? primary.id
        : selectedPrimary && selectedPrimary.id;
      result.push({
        label: "Primary subject",
        value: primaryId == null
          ? primary.kind
          : primary.kind + " " + primaryId
      });
    }
    const selections = source.selection || {};
    [
      "creature", "agent", "script", "chemical", "room", "metaroom",
      "genome", "logRecord", "timelineEvent"
    ].forEach(kind => {
      const selected = selections[kind];
      if (!selected) return;
      if (primary && primary.kind === kind &&
          primaryId != null &&
          String(selected.id) === String(primaryId)) return;
      result.push({
        label: kind.replace(/\B[A-Z]/g, " $&"),
        value: String(selected.id)
      });
    });
    if (currentRoute.time) {
      const time = currentRoute.time;
      result.push({
        label: "Time context",
        value: time.startTick != null || time.endTick != null
          ? (time.startTick == null ? "…" : time.startTick) + "–" +
            (time.endTick == null ? "…" : time.endTick) + " world ticks"
          : "world tick " + time.cursorTick
      });
    }
    if (source.experiment && source.experiment.id) {
      result.push({
        label: "Experiment",
        value: source.experiment.name || source.experiment.id
      });
    }
    return result;
  }

  function documentationRoute(target, state, currentRoute) {
    if (!target || !target.document) return null;
    const source = state || {};
    const selections = {};
    const selection = source.selection || {};
    Object.keys(selection).forEach(kind => {
      if (kind !== "primary" && selection[kind]) {
        selections[kind] = selection[kind];
      }
    });
    return {
      routeId: "guides",
      tab: "docs",
      view: "wiki",
      document: target.document,
      section: target.section || null,
      worldKey: source.world && source.world.identity
        ? source.world.identity.key : null,
      primary: selection.primary ? selection.primary.kind : null,
      selections,
      time: currentRoute && currentRoute.time || null
    };
  }

  function search(query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return DEFINITIONS.slice();
    return DEFINITIONS.filter(definition => [
      definition.id,
      definition.title,
      definition.summary,
      definition.caution,
      definition.terms.join(" ")
    ].some(value => String(value).toLowerCase().includes(needle)));
  }

  function validate(routeDefinitions) {
    const errors = [];
    const ids = new Set();
    DEFINITIONS.forEach(definition => {
      if (ids.has(definition.id))
        errors.push("Duplicate help ID: " + definition.id);
      ids.add(definition.id);
      [
        "id", "title", "summary", "activity", "evidence",
        "caution", "guide", "owner"
      ].forEach(field => {
        if (!definition[field])
          errors.push(definition.id + " is missing " + field);
      });
      if (!definition.evidence.level ||
          !definition.evidence.source ||
          !definition.evidence.cadence) {
        errors.push(definition.id + " has incomplete evidence metadata");
      }
    });
    const routes = Array.isArray(routeDefinitions)
      ? routeDefinitions : [];
    routes.forEach(route => {
      if (!forRoute(route.id))
        errors.push("Route has no help definition: " + route.id);
    });
    DEFINITIONS.filter(definition => definition.routeId)
      .forEach(definition => {
        if (!routes.some(route => route.id === definition.routeId))
          errors.push("Help references unknown route: " + definition.routeId);
      });
    return errors;
  }

  return Object.freeze({
    ACTIVITY_LABELS,
    EVIDENCE_LABELS,
    HELP_DEFINITIONS,
    HELP_TARGETS,
    get,
    forRoute,
    contextIdentifiers,
    documentationRoute,
    search,
    validate
  });
});
