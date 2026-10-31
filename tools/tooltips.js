// tooltips.js — Creatures 3 Developer Tools — Tooltip System
// Contextual help tooltips for all UI elements. Can be disabled via toggle.
"use strict";

(() => {

// ── Tooltip Registry ──────────────────────────────────────────────────────
// Each entry: { selector, text, [context] }
// `context` optionally restricts to a parent (e.g. a specific tab panel).
const TIPS = [

    // ── Header ────────────────────────────────────────────────────────────
    { selector: '#btn-nav-toggle', text: 'Toggle the left navigation sidebar on/off' },
    { selector: '#logo', text: 'Creatures 3 Developer Tools — macOS engine port', doc: 'tools_overview.md' },
    { selector: '#session-summary', text: 'Active world, simulation state, game speed, world tick, creature count, and status-sample freshness. Click for exact session details and speed controls', doc: 'session_status.md' },
    { selector: '#session-world', text: 'The active world, or the requested world while a deferred switch is pending', doc: 'session_status.md:world-identity-and-load-transitions' },
    { selector: '#session-state', text: 'Simulation state: Running, Paused, Loading, Disconnected, or No World', doc: 'session_status.md:simulation-api-and-stream-state' },
    { selector: '#session-speed', text: 'Current engine game-speed multiplier reported by the shared session endpoint', doc: 'session_status.md:field-reference' },
    { selector: '#session-tick', text: 'Current world tick — the primary simulation timebase for observatory evidence', doc: 'session_status.md:field-reference' },
    { selector: '#session-age', text: 'Browser wall-time age of the most recent successful shared status sample. Stale values remain visible but are labelled', doc: 'session_status.md:freshness-and-polling' },
    { selector: '#creator-badge', text: 'Created by Cyril Sadovsky — view LinkedIn profile' },
    { selector: '#btn-engine-play', text: 'Resume engine simulation — the game world continues running' },
    { selector: '#btn-engine-pause', text: 'Pause engine simulation — freezes the world but the API stays responsive' },
    { selector: '#btn-evidence-help', text: 'Definitions and examples for Observed, Derived, Inferred, and Unknown evidence', doc: 'observatory_state.md:evidence-level-contract' },
    { selector: '#btn-accessibility', text: 'Keyboard map, data density, reduced motion, and global shortcut conflict settings', doc: 'accessibility_and_responsive.md' },
    { selector: '#opt-tooltips', text: 'Enable or disable these contextual help tooltips. Preference is saved in localStorage' },

    // ── Intent navigation and dashboard ──────────────────────────────────
    { selector: '.nav-route-button[data-route-id="dashboard"]', text: 'Observatory Overview — live session movement, population, recording, interventions, streams, and resumable context', doc: 'observatory_navigation_dashboard.md' },
    { selector: '.nav-route-button[data-route-id="creatures"]', text: 'Observe a creature — present biology, behavior, and evidence without changing the world', doc: 'tab_creatures.md' },
    { selector: '.nav-route-button[data-route-id="timeline"]', text: 'Ethology Timeline — bounded, scrubbable evidence for the selected creature', doc: 'ethology_timeline.md' },
    { selector: '.nav-route-button[data-route-id="compare"]', text: 'Compare individuals, retained ranges, or an explicit cohort without treating an average as a target', doc: 'creature_cohort_comparison.md' },
    { selector: '.nav-route-button[data-route-id="ecology"]', text: 'World & Ecology — rooms, links, CA fields, agents, and creature-relative evidence', doc: 'world_ecology_observatory.md' },
    { selector: '.nav-route-button[data-route-id="scripts"]', text: 'Running Scripts — active, blocked, paused, and recently finished agent VMs', doc: 'tab_scripts.md' },
    { selector: '.nav-route-button[data-route-id="logs"]', text: 'Contextual Logs — tick-correlated engine and API records', doc: 'tab_log.md' },
    { selector: '.nav-route-button[data-route-id="experiments"]', text: 'Experiment Workspaces — baseline, treatment, provenance, gaps, and export', doc: 'experiment_workspaces.md' },
    { selector: '.nav-route-button[data-route-id="chemicals"]', text: 'Reviewed change — preview and record one chemical concentration intervention for the selected creature', doc: 'safe_chemical_interventions.md' },
    { selector: '.nav-route-button[data-route-id="genetics"]', text: 'Reviewed change — copy-first genome experiments and deliberate derived-genome injection', doc: 'tab_genetics_kit.md' },
    { selector: '.nav-route-button[data-route-id="workbench"]', text: 'CAOS Workbench — explicit Evaluate, Inspect, Install, Replace, and Remove workflows', doc: 'tab_caos_ide.md' },
    { selector: '.nav-route-button[data-route-id="scratchpad"]', text: 'Scratchpad — compile-checked fast path for short read-only ownerless expressions', doc: 'tab_console.md' },
    { selector: '.nav-route-button[data-route-id="debugger"]', text: 'CAOS Debugger — inspect breakpoints, source, and variables for a selected running VM', doc: 'tab_debugger.md' },
    { selector: '.nav-route-button[data-route-id="diagnostics"]', text: 'Engine Diagnostics — start Logs with API gaps and correlated execution context in mind', doc: 'tab_log.md' },
    { selector: '.nav-route-button[data-route-id="guides"]', text: 'Task Guides — choose a workflow by investigative intent', doc: 'observatory_task_guides.md' },
    { selector: '.nav-route-button[data-route-id="caos-reference"]', text: 'CAOS Reference — engine commands, values, and language semantics', doc: 'caos_overview.md' },
    { selector: '.nav-route-button[data-route-id="architecture"]', text: 'Architecture Graph — trace reviewed structure and bounded observed requests without treating a selected path as execution', doc: 'live_architecture_graph.md' },
    { selector: '.nav-route-button[data-route-id="evidence"]', text: 'Evidence & Terms — time, biology, authorship, CAOS, Observed, Derived, Inferred, and Unknown', doc: 'observatory_glossary.md' },
    { selector: '#dashboard-refresh', text: 'Refresh bounded creature and running-script summaries now. Session status is already shared globally', doc: 'observatory_navigation_dashboard.md:reading-the-dashboard' },
    { selector: '#dashboard-orientation', text: 'Open the first-visit orientation guide without requiring a live engine', doc: 'observatory_navigation_dashboard.md:first-visit' },
    { selector: '.dashboard-intents', text: 'Route by investigative intent. Experiment and CAOS authoring routes are visibly marked as reviewed-change workspaces', doc: 'observatory_navigation_dashboard.md:first-visit' },
    { selector: '#dashboard-interventions-card', text: 'Recent world-qualified interventions recorded by the shared Observatory store', doc: 'observatory_navigation_dashboard.md:reading-the-dashboard' },
    { selector: '#dashboard-diagnostics-card', text: 'Bounded running-script snapshots plus notable warning/error/gap records observed in this browser session', doc: 'observatory_navigation_dashboard.md:reading-the-dashboard' },

    // ── Log Tab ───────────────────────────────────────────────────────────
    { selector: '#log-stream-state', text: 'Connection state of the Log event stream only. It does not indicate whether the simulation is paused', doc: 'tab_log.md' },
    { selector: '#search', text: 'Filter log messages by text — only matching rows are shown' },
    { selector: '#btn-pause', text: 'Pause or resume Log rendering only. Incoming messages are buffered; the simulation continues running' },
    { selector: '#btn-clear', text: 'Clear all log messages from the display' },
    { selector: '#btn-copy', text: 'Copy all visible (non-filtered) log lines to clipboard' },
    { selector: '#btn-export', text: 'Download the full log as a text file' },
    { selector: '#cat-all', text: 'Toggle all log categories at once' },
    { selector: '#opt-timestamps', text: 'Show/hide timestamps on each log row (relative seconds from session start)' },
    { selector: '#opt-autoscroll', text: 'Automatically scroll to the newest log entry' },
    { selector: '#opt-compact', text: 'Reduce row spacing for a denser log view' },
    { selector: '#pause-overlay', text: 'The log stream is paused. Messages are being buffered and will appear when you resume' },

    // ── Timeline Tab ─────────────────────────────────────────────────────
    { selector: '#timeline-record', text: 'Pause or resume timeline sampling. A visible boundary is retained; the simulation is unaffected', doc: 'ethology_timeline.md:start-a-recording' },
    { selector: '#timeline-background', text: 'Continue sampling the selected creature when Timeline is not visible' },
    { selector: '#timeline-interval', text: 'Choose a 1, 2, or 5 second wall-time interval. Faster worlds span more ticks per sample' },
    { selector: '#timeline-memory', text: 'Hard in-browser memory bound for retained events and atomic snapshots' },
    { selector: '#timeline-duration', text: 'Maximum rolling world-tick span; the first storage bound reached trims older evidence' },
    { selector: '#timeline-export', text: 'Export retained provenance as reloadable JSON/JSONL or a CSV event table', doc: 'ethology_timeline.md:export-and-offline-review' },
    { selector: '#timeline-import', text: 'Open a version 1 JSON or JSONL recording for offline review' },
    { selector: '#timeline-scrubber', text: 'Move the historical world-tick cursor; the nearest retained seven-stage observation appears at right', doc: 'ethology_timeline.md:scrub-zoom-and-inspect' },
    { selector: '#timeline-zoom', text: 'Change the visible tick span. Display aggregation never removes retained export records' },
    { selector: '.timeline-mark', text: 'A retained event or sampled interval. Dashed edges are Derived; solid edges are Observed' },
    { selector: '.timeline-event__bookmark', text: 'Preferentially retain this event and mark it for later review' },
    { selector: '#timeline-open-source', text: 'Open the event source inspector with world-qualified context; Back returns to this cursor' },

    // ── Comparison Tab ───────────────────────────────────────────────────
    { selector: '#compare-refresh', text: 'Capture one coherent cohort snapshot now, even when automatic sampling is disabled', doc: 'creature_cohort_comparison.md:choose-subjects-and-measures' },
    { selector: '#compare-interval', text: 'Wall-time polling interval. Faster worlds span more world ticks and may under-sample movement or short events' },
    { selector: '#compare-auto', text: 'Poll only while Compare is visible; disabling this does not pause the simulation' },
    { selector: '#compare-modes', text: 'Choose same-tick individuals, one-creature retained ranges, or a cohort distribution' },
    { selector: '#compare-subject-list', text: 'Explicit world-qualified membership. Dead or removed recorded members remain visible', doc: 'creature_cohort_comparison.md:choose-subjects-and-measures' },
    { selector: '#compare-measures', text: 'Every aggregate reports unit, n, missing values, spread, and raw individuals; no value is a healthy target' },
    { selector: '#compare-timebase', text: 'Align by world tick or offsets from a retained intervention. Relative mode requires an anchor' },
    { selector: '#compare-anchor', text: 'A retained Timeline intervention used for relative-time alignment and evidence handoff' },
    { selector: '.compare-distribution', text: 'Median and IQR with one point per raw individual. Marked IQR outliers can open their Timeline', doc: 'creature_cohort_comparison.md:statistics-and-missing-data' },
    { selector: '#compare-save-definition', text: 'Keep this comparison definition in browser memory so it can be reopened after tab navigation' },
    { selector: '#compare-export-report', text: 'Export definition, provenance, and raw cohort summaries without proprietary genome payloads' },
    { selector: '#compare-genomes', text: 'Fetch exactly two live genomes on demand and compare only structural gene-type counts' },

    // ── World and ecology observatory ───────────────────────────────────
    { selector: '#ecology-refresh', text: 'Capture a bounded, coherent world snapshot now. This reads engine state and does not pause or edit the world', doc: 'world_ecology_observatory.md:sampling-freshness-and-reproduction' },
    { selector: '#ecology-channel', text: 'Choose CA 0–19. A name is shown only when the active world supplies a smell-category mapping', doc: 'world_ecology_observatory.md:ca-and-smell-channels' },
    { selector: '#ecology-map', text: 'Observed room geometry and independently toggleable ecology layers. Global visibility does not imply creature perception', doc: 'world_ecology_observatory.md:map-layers' },
    { selector: '#ecology-permeability', text: 'Display/query threshold for sampled connections. It is not the selected creature’s complete navigation rule', doc: 'world_ecology_observatory.md:connection-and-route-evidence' },
    { selector: '#ecology-query-reachable', text: 'List agents connected through the bounded sampled graph. Reachability is not proof of edibility, perception, or affordance', doc: 'world_ecology_observatory.md:connection-and-route-evidence' },
    { selector: '#ecology-relative', text: 'Separates objective world state, values sampled at the creature, sensory availability, and inferred relevance', doc: 'world_ecology_observatory.md:start-from-a-creature' },

    // ── Experiment workspaces and provenance ────────────────────────────
    { selector: '#experiment-create', text: 'Capture the protocol plus current engine, world, tick, speed, and sanitized launch provenance as a browser draft', doc: 'experiment_workspaces.md:create-a-minimal-beforeafter-experiment' },
    { selector: '#experiment-start', text: 'Start explicit background baseline recording. Unmarked personal worlds require a separate acknowledgement', doc: 'experiment_workspaces.md:baseline-control-and-treatment' },
    { selector: '#experiment-treatment', text: 'Mark the treatment window. This does not perform the planned intervention by itself', doc: 'experiment_workspaces.md:create-a-minimal-beforeafter-experiment' },
    { selector: '#experiment-export', text: 'Export protocol, observations, gaps, notes, and redacted provenance; no proprietary game payloads are embedded', doc: 'experiment_workspaces.md:export-and-reopen' },
    { selector: '#experiment-branch-preview', text: 'Check name collision, then review a save-and-copy operation. Existing worlds are never overwritten', doc: 'experiment_workspaces.md:safe-world-branches' },
    { selector: '#experiment-ledger', text: 'User action, requested API operation, observed response, and verification state remain separate', doc: 'experiment_workspaces.md:intervention-ledger' },

    // Log — category filters (each checkbox label in the sidebar)
    { selector: '.cat-toggle[style*="#DD0000"]', text: 'Errors — engine error messages, CAOS runtime exceptions, and failed operations' },
    { selector: '.cat-toggle[style*="#FF5F00"]', text: 'Shutdown — engine startup and shutdown lifecycle messages' },
    { selector: '.cat-toggle[style*="#0055FF"]', text: 'Network — PRAY/CAOS2PRAY networking, babel client, and connection events' },
    { selector: '.cat-toggle[style*="#008000"]', text: 'World — world loading, saving, switching, and map/room events' },
    { selector: '.cat-toggle[style*="#7700CC"]', text: 'CAOS — script execution, scriptorium events, and VM diagnostics' },
    { selector: '.cat-toggle[style*="#007799"]', text: 'Sound — audio system events: MNG music, sound effect playback, and mixer status' },
    { selector: '.cat-toggle[style*="#FF00FF"]', text: 'Crash — fatal errors, assertions, and unhandled exceptions' },
    { selector: '.cat-toggle[style*="#555555"]', text: 'Other — miscellaneous messages not matching any named category' },

    // Log — sidebar section titles
    { selector: '.sidebar-title', text: 'Configuration section for the log display', context: '#sidebar' },

    // ── Console Tab ──────────────────────────────────────────────────────
    { selector: '#btn-console-clear', text: 'Clear the console output history' },
    { selector: '#console-input', text: 'Type CAOS commands here. Enter to execute, Shift+Enter for multi-line. ↑/↓ for history', doc: 'tab_console.md' },
    { selector: '.console-prompt', text: 'CAOS command prompt — type a command and press Enter' },
    { selector: '.console-welcome', text: 'Welcome to the CAOS console. Commands are sent directly to the running engine' },

    // ── Scripts Tab ──────────────────────────────────────────────────────
    { selector: '#btn-scripts-refresh', text: 'Manually refresh the scripts list from the engine' },
    { selector: '#opt-auto-refresh', text: 'Automatically refresh the running scripts list every 2 seconds' },
    { selector: '#scripts-empty', text: 'No CAOS scripts are currently executing. Start or load a world to see active scripts' },
    { selector: '#scripts-search', text: 'Filter by agent ID, identity, gallery, classifier, event, current statement, blocking command, TARG, or IT' },
    { selector: '#scripts-state-filter', text: 'Filter the normalized VM state. Waiting is reported only when the engine identifies WAIT; other blocked operations remain Blocking' },
    { selector: '#scripts-classifier-filter', text: 'Filter the exact family genus species event classifier' },
    { selector: '#scripts-event-filter', text: 'Filter by numeric event or its catalogue name' },
    { selector: '#scripts-gallery-filter', text: 'Filter by gallery name or catalogue agent kind' },
    { selector: '#scripts-group-filter', text: 'Collapse identical classifier/event instances into stable groups with state counts' },
    { selector: '#scripts-creature-filter', text: 'Show only scripts whose owning agent has creature family 4' },
    { selector: '#scripts-changed-filter', text: 'Derived filter: show scripts whose state, IP, statement, command, TARG, or IT changed since the preceding sample' },
    { selector: '#scripts-new-filter', text: 'Derived filter: show scripts first observed in the latest sample' },
    { selector: '#scripts-full-source', text: 'Fetch and show installed full source on demand. Identical classifier/revision sources are fetched and formatted once' },
    { selector: '#scripts-sample-status', text: 'Observed API capture tick, active count, payload size, request time, and render time. Recently finished is derived from successive samples' },
    { selector: '.script-identity', text: 'The owning agent: catalogue identity or gallery, plus the engine unique ID. The selected shared agent is prioritized' },
    { selector: '.script-classifier code', text: 'Exact family genus species event classifier for this running script' },
    { selector: '.script-classifier small', text: 'Numeric script event and its catalogue name where available' },
    { selector: '.script-state .state-badge', text: 'Agent VM state. A paused VM is stopped at a breakpoint; it does not imply that the world is paused' },
    { selector: '.script-statement', text: 'Observed source statement mapped near the current bytecode instruction pointer' },
    { selector: '.script-actions button:nth-child(1)', text: 'Move the game camera to the owning agent without changing its simulation state' },
    { selector: '.script-actions button:nth-child(2)', text: 'Open this exact owner, classifier, and event in Debugger' },
    { selector: '.script-actions button:nth-child(3)', text: 'Reveal expert IP, blocking command/reason, TARG, IT, capture tick, and optional full source' },
    { selector: '[data-script-fact="ip"]', text: 'Bytecode instruction pointer. It is expert execution context, not a source line number' },
    { selector: '[data-script-fact="command"]', text: 'The exact command retained by the VM while blocked; unavailable while ordinary execution advances' },
    { selector: '[data-script-fact="reason"]', text: 'WAIT and OVER have known completion conditions. Other blocking commands are labelled reason unavailable rather than guessed' },
    { selector: '[data-script-fact="targ"]', text: 'TARG — the current target handle used by agent-oriented CAOS commands' },
    { selector: '[data-script-fact="it"]', text: 'IT — the current IT agent handle supplied by the VM, or unavailable when invalid' },

    // ── Debugger Tab ─────────────────────────────────────────────────────
    { selector: '#btn-dbg-focus', text: 'Move the in-game camera to the selected agent\'s position' },
    { selector: '#opt-dbg-follow', text: 'Auto-select and scroll to agents as they hit breakpoints' },
    { selector: '#btn-dbg-continue', text: 'Resume execution of the paused agent until the next breakpoint' },
    { selector: '#btn-dbg-step', text: 'Step into — execute one CAOS instruction and pause again' },
    { selector: '#btn-dbg-stepover', text: 'Step over — execute one instruction, treating subroutines as single steps' },
    { selector: '#dbg-agent-search', text: 'Filter agents by ID, classifier, or gallery name' },
    { selector: '#dbg-agent-panel .dbg-agent-panel-header', text: 'List of all agents with running or paused scripts. Click an agent to inspect it' },
    { selector: '#dbg-source-header', text: 'Displays the classifier and event of the currently selected agent\'s script' },
    { selector: '#dbg-source-view', text: 'CAOS source code view — click line numbers in the gutter to set breakpoints', doc: 'tab_debugger.md:source-view' },
    { selector: '#dbg-agent-empty', text: 'No agents are running scripts. Start a world to see active agents' },

    // Debugger — Inspector panels
    { selector: '#dbg-context-table', text: 'CAOS VM context handles — OWNR (script owner), TARG (current target), FROM (message sender), IT (iterator)', doc: 'tab_debugger.md:inspector-panel' },
    { selector: '#dbg-state-badge', text: 'Current execution state of the selected agent\'s CAOS VM' },
    { selector: '#dbg-ov-vars', text: 'OV variables (OV00–OV99) — per-agent persistent variables, showing only non-zero values' },
    { selector: '#dbg-va-vars', text: 'VA variables (VA00–VA99) — local (stack-frame) variables for the current script' },
    { selector: '#dbg-breakpoint-list', text: 'Active breakpoints on this agent. Click a line number in the source view to toggle breakpoints' },

    // Debugger — context keys (individual rows)
    { selector: '#dbg-ctx-ownr', text: 'OWNR — the agent that owns (started) the currently running script' },
    { selector: '#dbg-ctx-targ', text: 'TARG — the current target agent; commands like MVTO operate on this' },
    { selector: '#dbg-ctx-from', text: 'FROM — the agent that sent the last message (MESG WRT+)' },
    { selector: '#dbg-ctx-it', text: 'IT — the current iterator value (set by ENUM/ESEE/ETCH/EPAS loops)' },
    { selector: '#dbg-ctx-ip', text: 'IP — the instruction pointer: current byte offset in the script bytecode' },

    // Debugger — legend items
    { selector: '.dbg-state-dot--running', text: 'Running — agent is actively executing CAOS instructions', context: '#dbg-agent-legend' },
    { selector: '.dbg-state-dot--blocking', text: 'Blocking — agent is waiting (WAIT, OVER, animation lock, etc.)', context: '#dbg-agent-legend' },
    { selector: '.dbg-state-dot--paused', text: 'Paused — agent is stopped at a breakpoint', context: '#dbg-agent-legend' },
    { selector: '.dbg-state-dot--finished', text: 'Finished — script has completed execution', context: '#dbg-agent-legend' },

    // ── Creatures Tab ────────────────────────────────────────────────────
    { selector: '#btn-creatures-refresh', text: 'Manually refresh the creature list from the engine' },
    { selector: '#btn-creatures-focus', text: 'Move the in-game camera to the selected creature\'s position' },
    { selector: '#opt-creatures-auto', text: 'Automatically refresh creature data at the Biological monitor interval' },
    { selector: '.crt-list-header', text: 'All Norns, Grendels, and Ettins in the current world' },
    { selector: '#crt-list-empty', text: 'No creatures in the world yet. Hatch an egg or import a creature to begin' },
    { selector: '#crt-observation-strip > summary', text: 'Seven evidence-bearing views of one creature captured at explicit world ticks', doc: 'live_creature_observation.md' },
    { selector: '#crt-observation-freeze', text: 'Hold the displayed observation while the engine and live polling continue', doc: 'live_creature_observation.md:freeze-capture-and-compare' },
    { selector: '#crt-observation-capture', text: 'Save the newest live tick as a named, immutable capture for this creature and world' },
    { selector: '#crt-observation-compare', text: 'Label each live stage Changed or Unchanged against a saved capture' },
    { selector: '#crt-observation-raw', text: 'Reveal the exact JSON backing every friendly stage without changing the sample' },
    { selector: '.observation-stage', text: 'A source-labelled observation stage; arrows show reading order, not proven causation', doc: 'live_creature_observation.md:the-seven-stages' },
    { selector: '.observation-stage__target', text: 'Open the exact observed IT or owning creature agent in Debugger' },
    { selector: '.observation-stage footer button', text: 'Open the detailed workspace for this card while preserving Observatory context' },
    { selector: '#crt-bio-monitor > summary', text: 'Bounded, world-qualified histories shared by drives, chemistry, organs, and selected neurons', doc: 'tab_creatures.md:biological-monitor' },
    { selector: '#crt-bio-record', text: 'Pause or resume history recording without stopping the live creature view', doc: 'tab_creatures.md:sampling-retention-and-stale-data' },
    { selector: '#crt-bio-interval', text: 'Choose a 1, 2, or 5 second wall-time sampling interval' },
    { selector: '#crt-bio-order', text: 'Choose an explicit stable row order; ordering never changes mode implicitly', doc: 'tab_creatures.md:stable-ordering-and-pins' },
    { selector: '#crt-bio-baseline', text: 'Use the current world tick as the comparison baseline for Δbase' },
    { selector: '#crt-bio-export', text: 'Export the active creature and world session as versioned JSON' },
    { selector: '.bio-spark', text: 'Unsmooth observed samples. Hover a point for exact tick, value, pause state, gap, or intervention details' },
    { selector: '.bio-pin', text: 'Pin or unpin this signal in the shared biological monitoring tray' },

    // Creatures — sub-tabs
    { selector: '.crt-sub-btn[data-subtab="drives"]', text: 'Drive levels — the 20 biological drives (hunger, tiredness, boredom, etc.) that motivate creature behaviour', doc: 'tab_creatures.md:drives-sub-tab' },
    { selector: '.crt-sub-btn[data-subtab="chemistry"]', text: 'Biochemistry — all 256 chemical concentrations in the creature\'s bloodstream', doc: 'tab_creatures.md:chemistry-sub-tabs' },
    { selector: '.crt-sub-btn[data-subtab="organs"]', text: 'Organs — genome-defined compartments with observed life-force state and explicitly inferred likely roles', doc: 'tab_creatures.md:organs-sub-tab' },
    { selector: '.crt-sub-btn[data-subtab="brain"]', text: 'Brain Monitor — switch between exact genome anatomy and a visibly transformed functional-flow layout', doc: 'tab_creatures.md:brain-sub-tab' },

    // Creatures — chemistry controls
    { selector: '.crt-chem-tab-btn[data-chem-tab="monitoring"]', text: 'Monitoring — view all chemical levels and track non-zero concentrations' },
    { selector: '.crt-chem-tab-btn[data-chem-tab="syringe"]', text: 'Intervene — compose, preview, confirm, and record a live chemical concentration change', doc: 'tab_creatures.md:safe-chemical-interventions' },
    { selector: '#crt-syringe-search', text: 'Search all 256 raw chemical identifiers and their catalogue display names' },
    { selector: '#chemical-capture-baseline', text: 'Pin the selected chemical and mark the current biological-series sample as the comparison baseline', doc: 'safe_chemical_interventions.md:observe-before-and-after' },
    { selector: '#crt-syringe-amount', text: 'Adjustment is a signed dose from −1 to +1; target is an absolute concentration from 0 to 1. The preview shows engine clamping', doc: 'safe_chemical_interventions.md:concentration-dose-and-target' },
    { selector: '#chemical-pause-behavior', text: 'Chemical interventions preserve the current pause state. A world already paused is never silently resumed' },
    { selector: '#chemical-preview-after', text: 'Derived immediate projection using the engine’s numeric range and clamping; it is not a prediction of downstream biology' },
    { selector: '#btn-syringe-inject', text: 'Refresh the target, then review the exact creature, chemical, operation, sampled value, and projection before mutation', doc: 'safe_chemical_interventions.md:perform-a-small-recorded-intervention' },
    { selector: '#opt-chem-nonzero', text: 'Show only chemicals with non-zero concentrations to reduce clutter' },

    // Creatures — summary panel
    { selector: '.crt-summary-header', text: 'Summary card showing identity, life stage, life state, and separate observed vitality indicators' },

    // Creatures — dynamic list items & badges
    { selector: '.crt-state-badge', text: 'Life state of this creature — Alert, Dreaming, Asleep, etc.' },
    { selector: '.crt-glycogen-bar', text: 'Glycogen reserve — chemical 4 concentration shown as a compact bar; this is not overall health', doc: 'biological_labels.md:glycogen-is-not-a-health-score' },
    { selector: '.crt-item-icon', text: 'Species icon — 🐣 Norn, 🦎 Grendel, 🔧 Ettin' },

    // Creatures — Brain sub-view
    { selector: '.crt-brain-panel-title', text: 'Neural network inspector — lobes, tracts, and neuron activation states' },
    { selector: '#crt-brain-viewport', text: 'Spatial brain view — scroll to pan, click neurons to inspect connections, click tracts to see dendrites', doc: 'tab_creatures.md:spatial-heatmap' },
    { selector: '#crt-brain-info', text: 'Brain info sidebar — shows selected neuron/tract details, lobe list, and connection weights' },

    // Creatures — Organs sub-view (dynamically generated elements)
    { selector: '.org-card-header', text: 'Click to expand/collapse this organ and view its receptors, emitters, and reactions' },
    { selector: '.org-status-badge', text: 'Observed organ state — ATP available or unavailable at the most recent activation, or Failed; this is not a diagnosis' },
    { selector: '.org-role .evidence-badge', text: 'Organ roles are chemical-participation heuristics. Expand the organ to inspect the supporting reactions, receptors, and emitters', doc: 'biological_labels.md:organ-role-inference' },
    { selector: '#crt-brain-layout-toolbar', text: 'Genome anatomy preserves engine coordinates. Functional flow visibly transforms selected lobe positions for readability', doc: 'biological_labels.md:brain-layout-modes' },
    { selector: '.org-count-badge.org-count-r', text: 'Number of receptors — input channels that read chemical concentrations into organ loci' },
    { selector: '.org-count-badge.org-count-e', text: 'Number of emitters — output channels that release chemicals based on organ state' },
    { selector: '.org-count-badge.org-count-x', text: 'Number of reactions — biochemical reactions converting input chemicals into output chemicals' },
    { selector: '.org-stat-label', text: 'Organ statistic — internal clock, energy cost, life force, or repair rate' },
    { selector: '.org-section-title', text: 'Section within the organ detail — Reactions, Receptors, or Emitters' },
    { selector: '.org-rxn-rate', text: 'Reaction rate — 0% is fastest (instant), 100% is slowest (never reacts)' },

    // Creatures — Genome sub-view
    { selector: '.crt-sub-btn[data-subtab="genome"]', text: 'Genome Inspector — structural view of all genes inside this creature\'s DNA with details on biology and brain setup', doc: 'tab_creatures.md:genome-sub-tab' },
    { selector: '#crt-genome-search, #genetics-genome-search', text: 'Filter genes by searching for text (e.g. "Hunger", "Chem 213")' },
    { selector: '#crt-genome-age, #genetics-genome-age', text: 'Filter genes by their switch-on age (Baby, Child, Adult, etc.)' },
    { selector: '.crt-gene-badge-mut', text: 'Gene mutation flags (M=Mutable, D=Duplicatable, C=Cuttable)' },
    { selector: '.crt-gene-badge-sex', text: 'Sex requirement flag (gene only active in males or females)' },
    { selector: '.crt-gene-badge-dormant', text: 'Dormant flag — this gene will not be expressed during the creature\'s life' },
    { selector: '.crt-gene-badge-gen', text: 'Generation level of this gene' },
    { selector: '.crt-gene-badge-age', text: 'Age stage when this gene becomes active' },
    { selector: '.crt-svrule-container', text: 'SVRule section — human-readable pseudo-code for neuron/dendrite initialization or update logic. Click the edit toggle to modify instructions' },
    { selector: '.svrule-summary', text: 'Expand the visual SVRule grid editor — edit opcodes, operands, and values for each instruction row. Changes update the display in real-time' },
    { selector: '.svrule-grid-header', text: 'SVRule instruction columns: Opcode (operation), Operand (data source), Value (parameter or chemical index)' },
    { selector: '.svrule-row', text: 'One 3-byte SVRule instruction. Each row encodes an Opcode, Operand, and Value byte in the 48-byte rule buffer' },
    { selector: '.svrule-combo .crt-combobox-trigger', text: 'Click to open a searchable dropdown. Type to filter by name or index number' },
    { selector: '.svrule-val-text', text: 'Numeric value for this instruction — integer (0–255) or float depending on the operand type' },
    { selector: '#crt-genome-controls .opt-toggle, #genetics-genome-controls .opt-toggle', text: 'Filter genes by primary type (Brain, Biochemistry, Creature physiology, Organ properties)' },

    // ── CAOS Workbench ───────────────────────────────────────────────────
    { selector: '#btn-ide-apply', text: 'Apply the currently selected explicit mode after engine compilation and context review (Ctrl/Cmd+Enter)' },
    { selector: '.ide-mode-button[data-mode="evaluate"]', text: 'Evaluate once in a fresh ownerless VM; optional selected TARG and pause-before-run are explicit' },
    { selector: '.ide-mode-button[data-mode="debug"]', text: 'Open the selected currently running script in Debugger without executing editor source' },
    { selector: '.ide-mode-button[data-mode="install"]', text: 'Install only when this exact classifier/event is absent' },
    { selector: '.ide-mode-button[data-mode="replace"]', text: 'Review existing source and a diff, then conditionally replace the exact checksum-matching event' },
    { selector: '.ide-mode-button[data-mode="remove"]', text: 'Review and confirm removal of the exact checksum-matching event' },
    { selector: '#ide-context-summary', text: 'Exact reviewed world, ticks, engine state, owner, target, running script, and experiment state' },
    { selector: '#ide-preview-status', text: 'Compiler result and conservative mutation warnings. Compilation is not a safety guarantee' },
    { selector: '#btn-ide-save', text: 'Download the editor contents as a .cos file' },
    { selector: '#btn-ide-load', text: 'Load a .cos file from disk into the editor' },
    { selector: '#btn-ide-refresh', text: 'Reload the scriptorium list from the engine' },
    { selector: '#btn-ide-clear', text: 'Clear the output panel below the editor' },
    { selector: '#ide-search', text: 'Search through installed scriptorium scripts by classifier, event number, or agent name' },
    { selector: '.ide-sidebar-header', text: 'Browse all scripts installed in the engine\'s scriptorium', doc: 'tab_caos_ide.md:scriptorium-browser' },
    { selector: '.ide-classifier-label', text: 'Script classifier: Family, Genus, Species, Event — identifies which agent type and event this script handles' },
    { selector: '#ide-family', text: 'Family — broad agent category (e.g. 2=Compound, 3=Simple, 4=Creature)' },
    { selector: '#ide-genus', text: 'Genus — agent group within a family' },
    { selector: '#ide-species', text: 'Species — specific agent type within a genus' },
    { selector: '#ide-event', text: 'Event number — which event triggers this script (e.g. 1=Push, 2=Pull, 3=Hit, 9=Timer)' },
    { selector: '.ide-output-header', text: 'Results include mode, output or error, tick/elapsed context, correlation ID, and workspace handoffs' },
    { selector: '.ide-bp-title', text: 'IDE breakpoints — click line numbers in the gutter to set breakpoints, then bind them to running agents' },
    { selector: '#ide-editor', text: 'CAOS editor — Tab to indent, Ctrl+Space for completion, F1 for command help, Ctrl/Cmd+Enter to apply the selected mode', doc: 'tab_caos_ide.md:editing-and-authoring-assistance' },
    { selector: '#ide-error-bar', text: 'Syntax validation error — the CAOS compiler found an issue in your code' },
    { selector: '#ide-bp-clear-all', text: 'Remove all breakpoints from the editor and unbind them from all agents' },
    { selector: '.ide-group-header', text: 'Agent script group — click to expand/collapse. Shows all event scripts for this classifier' },
    { selector: '#ide-line-numbers', text: 'Line numbers — click a number to toggle a breakpoint on that line' },

    // ── Docs Tab ─────────────────────────────────────────────────────────
    { selector: '.docs-sub-btn[data-docs-tab="wiki"]', text: 'Developer Wiki — browse documentation, guides, and API references' },
    { selector: '.docs-sub-btn[data-docs-tab="graph"]', text: 'Architecture Graph — layered engine-to-interface model with separate static, observed, derived, and inferred evidence' },
    { selector: '#btn-docs-zoom-out', text: 'Zoom out the architecture graph' },
    { selector: '#btn-docs-zoom-in', text: 'Zoom in the architecture graph' },
    { selector: '#btn-docs-reset', text: 'Fit every currently visible architecture node in the viewport' },
    { selector: '.docs-wiki-item', text: 'Click to load this documentation page into the viewer' },
    { selector: '.docs-toc-item', text: 'Click to scroll directly to this section on the current page' },
    { selector: '#docs-legend', text: 'Filters and text-labelled evidence key for architecture layers, relationships, and bounded live context' },
    { selector: '#docs-viewport', text: 'Architecture graph — drag or use arrow keys to pan, Ctrl/Cmd+scroll to zoom, and inspect keyboard-reachable nodes and relationships' },

    // Docs — legend layer items
    { selector: '.docs-legend-title', text: 'Legend section heading' },
    { selector: '.docs-node', text: 'Architecture component — activate to inspect its maintained metadata, context, evidence, and links' },

    // ── Genetics Kit Tab ─────────────────────────────────────────────────
    { selector: '#genetics-file-search', text: 'Filter genomes in the library by moniker name' },
    { selector: '#btn-genetics-refresh', text: "Refresh the list of available genomes from the engine's GenomeStore" },
    { selector: '#btn-genetics-new', text: 'Create a new browser-only experimental draft; no engine file is created until an explicit save' },
    { selector: '#btn-genetics-import', text: 'Load and validate genome JSON as a browser-only experimental draft' },
    { selector: '.genetics-file-item', text: 'Load this source or experimental copy; originals open read-only' },
    { selector: '#genetics-experiment-safety', text: 'Trusted file identity, source checksums, live-reference status, and the copy-first workflow' },
    { selector: '#genetics-copy-name', text: 'Unique, path-safe filename for a new experimental copy; extensions and directory notation are rejected' },
    { selector: '#btn-genetics-create-copy', text: 'Copy the selected source without overwriting it and record source and derived checksums' },
    { selector: '#genetics-diff-panel', text: 'Observed source-to-derived changes by stable gene key and field, with raw evidence and decoding limits' },
    { selector: '#genetics-modified-section', text: 'Live summary of genes changed in browser memory; the saved copy remains unchanged until Save copy succeeds' },
    { selector: '#genetics-modified-section .crt-gene-badge', text: 'Click to scroll directly to this modified gene and highlight it in the editor' },
    { selector: '.btn-genetics-rename-inline', text: 'Exceptional confirmed rename for a verified experimental copy only' },
    { selector: '.btn-genetics-delete-inline', text: 'Separate typed-confirmation deletion for a verified experimental copy only; never required for editing' },
    { selector: '#btn-genetics-export', text: 'Export the currently inspected genome as a JSON file' },
    { selector: '#btn-genetics-save', text: 'Serialize only the selected experimental copy after schema and stale-check validation; originals cannot be overwritten' },
    { selector: '#btn-genetics-crossover', text: 'Create a collision-free derived crossover with checksums for both parents', doc: 'tab_genetics_kit.md:crossover' },
    { selector: '#genetics-inject-mode', text: 'Select whether to inject the genome as an incubating egg or as a fully hatched baby creature' },
    { selector: '#genetics-inject-gender', text: 'Choose the sex of the injected creature — Random lets the engine decide, or force Male / Female' },
    { selector: '#btn-genetics-inject', text: 'Open a final review of the exact saved checksum, source, diff, operation, and active world; injection requires a disposable or chosen branch confirmation', doc: 'tab_genetics_kit.md:review-and-inject' },
    { selector: '#genetics-injection-dialog', text: 'Final world mutation review. Cancel, Escape, or click outside to leave the world unchanged' },
    { selector: '.crt-gene-badge-active', text: 'Active — include this gene when the experimental copy is saved; disabled genes appear explicitly in the diff' },
    { selector: 'label.crt-gene-badge-mut:has(.g-mut)', text: 'Mutable — toggle whether this gene is allowed to mutate during crossovers' },
    { selector: 'label.crt-gene-badge-mut:has(.g-dup)', text: 'Duplicatable — toggle whether this gene can be duplicated during crossovers' },
    { selector: 'label.crt-gene-badge-mut:has(.g-cut)', text: 'Cuttable — toggle whether this gene can be removed during crossovers' },
    { selector: '.crt-gene-input', text: 'Edit a bounded decoded field in browser memory; review its exact before/after value before saving' },
    { selector: '.crt-gene-header', text: 'Click to expand/collapse the full gene properties' },
    { selector: '.g-btn-up', text: 'Move this gene backward up the genome (earlier crossover linkage)' },
    { selector: '.g-btn-down', text: 'Move this gene forward down the genome (later crossover linkage)' },
    { selector: '.g-btn-dup', text: 'Duplicate this gene exactly as and append it below' },
    { selector: '.g-btn-del', text: 'Delete this gene entirely from the genome' },
    { selector: '#genetics-add-gene-type', text: 'Select a gene classification to append to the genome' },
    { selector: '#btn-genetics-add-gene', text: 'Append a new blank gene of the selected classification' },
    { selector: '#cross-parent-b-search, #cross-parent-b-list', text: 'Find and select the second source genome', context: '#modal-crossover' },
    { selector: '#cross-child-name', text: 'Choose a new path-safe derived genome name; existing files and protected names are rejected', context: '#modal-crossover' },
    { selector: '#btn-cross-run', text: 'Create a new derived crossover without modifying either parent', context: '#modal-crossover' },
    { selector: '#btn-cross-cancel', text: 'Cancel the crossover operation', context: '#modal-crossover' },

    // ── Debugger Inspector Titles ────────────────────────────────────────
    { selector: '.dbg-inspector-title', text: 'Section heading in the variable inspector panel', context: '#dbg-inspector-panel' },
];

// ── State ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'devtools-tooltips-enabled';
let enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; // default true
let tooltipEl = null;     // the floating tooltip element
let hoverTimer = null;    // delay timer
let currentTarget = null; // element we're hovering
let savedTitles = [];     // { element, title } pairs suppressed to avoid native tooltip
let hideTimer = null;
let fadeTimer = null;
let describedTarget = null;
let previousDescription = null;

const DELAY_MS = 500;     // hover delay before showing
const FADE_MS = 120;      // fade-in animation duration

// ── Native title suppression ──────────────────────────────────────────────
// Browser-native `title` tooltips conflict with ours. When we detect a hover
// on a tip target, suppress all `title` attrs on it and ancestors, then
// restore them when the custom tooltip hides.
function suppressNativeTitles(el) {
    restoreNativeTitles(); // clear any previous batch
    let node = el;
    while (node && node !== document.documentElement) {
        if (node.hasAttribute && node.hasAttribute('title')) {
            savedTitles.push({ element: node, title: node.getAttribute('title') });
            node.removeAttribute('title');
        }
        node = node.parentElement;
    }
}

function restoreNativeTitles() {
    for (const entry of savedTitles) {
        try { entry.element.setAttribute('title', entry.title); } catch (_) {}
    }
    savedTitles = [];
}

// ── Create tooltip element ────────────────────────────────────────────────
function createTooltipElement() {
    const el = document.createElement('div');
    el.id = 'devtools-tooltip';
    el.setAttribute('role', 'tooltip');
    el.style.cssText = `
        position: fixed;
        z-index: 10000;
        max-width: 320px;
        padding: 8px 12px;
        background: var(--near-black, #0A0A0A);
        color: rgba(255, 255, 255, 0.85);
        font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        font-size: 11px;
        font-weight: 500;
        line-height: 1.5;
        letter-spacing: 0.2px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-left: 3px solid var(--orange, #FF5F00);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        pointer-events: none;
        opacity: 0;
        transition: opacity ${FADE_MS}ms ease;
        word-wrap: break-word;
    `;
    document.body.appendChild(el);
    return el;
}

// ── Position the tooltip near the target ──────────────────────────────────
function positionTooltip(target) {
    if (!tooltipEl) return;
    const rect = target.getBoundingClientRect();
    const tipW = tooltipEl.offsetWidth;
    const tipH = tooltipEl.offsetHeight;
    const pad = 8;

    // Try below the element first
    let top = rect.bottom + pad;
    let left = rect.left + (rect.width / 2) - (tipW / 2);

    // Clamp horizontal
    if (left < pad) left = pad;
    if (left + tipW > window.innerWidth - pad) left = window.innerWidth - tipW - pad;

    // If it overflows below, put it above
    if (top + tipH > window.innerHeight - pad) {
        top = rect.top - tipH - pad;
    }

    // If it overflows above too, just put it below anyway
    if (top < pad) top = rect.bottom + pad;

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

// ── Show / hide ───────────────────────────────────────────────────────────
function showTooltip(target, text, doc) {
    if (!tooltipEl) tooltipEl = createTooltipElement();
    if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
    }
    suppressNativeTitles(target);
    tooltipEl.textContent = text;

    if (doc || target.dataset.helpId) {
        const hint = document.createElement('span');
        hint.className = 'tooltip-help-hint';
        hint.textContent = 'F1 · open contextual help';
        tooltipEl.appendChild(hint);
    }
    tooltipEl.style.pointerEvents = 'none';
    describedTarget = target;
    previousDescription = target.getAttribute('aria-describedby');
    const descriptions = (previousDescription || "")
        .split(/\s+/).filter(Boolean);
    if (!descriptions.includes(tooltipEl.id)) descriptions.push(tooltipEl.id);
    target.setAttribute('aria-describedby', descriptions.join(" "));

    tooltipEl.style.opacity = '0';
    tooltipEl.style.display = 'block';

    // Position after layout
    requestAnimationFrame(() => {
        positionTooltip(target);
        tooltipEl.style.opacity = '1';
    });
    currentTarget = target;
}

function hideTooltip() {
    cancelScheduledHide();
    restoreNativeTitles();
    if (describedTarget) {
        if (previousDescription)
            describedTarget.setAttribute(
                'aria-describedby', previousDescription);
        else
            describedTarget.removeAttribute('aria-describedby');
    }
    describedTarget = null;
    previousDescription = null;
    if (tooltipEl) {
        tooltipEl.style.opacity = '0';
        tooltipEl.style.pointerEvents = 'none';
        fadeTimer = setTimeout(() => {
            if (tooltipEl) tooltipEl.style.display = 'none';
            fadeTimer = null;
        }, FADE_MS);
    }
    currentTarget = null;
}

function cancelPending() {
    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }
}

function scheduleHide() {
    cancelScheduledHide();
    hideTimer = setTimeout(() => hideTooltip(), 80);
}

function cancelScheduledHide() {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
}

// ── Find matching tip for an element ──────────────────────────────────────
function findTip(el) {
    for (const tip of TIPS) {
        // Check if the element matches the selector
        try {
            if (!el.matches(tip.selector)) continue;
        } catch (_) { continue; }

        // Check context if specified
        if (tip.context && !el.closest(tip.context)) continue;

        return { text: tip.text, doc: tip.doc || null };
    }
    return null;
}

// ── Walk up the DOM to find a tooltippable element ────────────────────────
function findTipTarget(el) {
    let node = el;
    // Walk up max 5 levels to find a match
    for (let i = 0; i < 5 && node && node !== document.body; i++) {
        const match = findTip(node);
        if (match) return { element: node, text: match.text, doc: match.doc };
        node = node.parentElement;
    }
    return null;
}

// ── Global event listeners ────────────────────────────────────────────────
function onMouseOver(e) {
    if (!enabled) return;

    const match = findTipTarget(e.target);
    if (!match) {
        // If we're hovering away from any tip target, hide
        if (currentTarget) {
            cancelPending();
            scheduleHide();
        }
        return;
    }

    // Same target — keep showing
    if (match.element === currentTarget) return;

    // New target
    cancelPending();
    cancelScheduledHide();
    hideTooltip();

    // Suppress native title immediately (before the delay) so the browser's
    // own tooltip doesn't race our custom one during the 500ms wait.
    suppressNativeTitles(match.element);

    hoverTimer = setTimeout(() => {
        showTooltip(match.element, match.text, match.doc);
    }, DELAY_MS);
}

function onMouseOut(e) {
    // Only hide if we're actually leaving the tip target
    const match = findTipTarget(e.relatedTarget);
    if (match && match.element === currentTarget) return;

    cancelPending();
    scheduleHide();
}

function onScroll() {
    cancelPending();
    hideTooltip();
}

function onKeyDown(e) {
    // Tooltips never consume keyboard input. F1 is handled by the shared
    // contextual-help drawer; Tab continues native focus navigation.
    cancelPending();
    hideTooltip();
}

function onFocusIn(e) {
    if (!enabled) return;
    const match = findTipTarget(e.target);
    if (!match) return;
    cancelPending();
    cancelScheduledHide();
    hideTooltip();
    showTooltip(match.element, match.text, match.doc);
}

function onFocusOut(e) {
    if (e.target !== currentTarget &&
        !(currentTarget && currentTarget.contains(e.target))) return;
    cancelPending();
    scheduleHide();
}

// ── Install / teardown ────────────────────────────────────────────────────
function install() {
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
}

function setEnabled(val) {
    enabled = !!val;
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    if (!enabled) {
        cancelPending();
        hideTooltip();
    }
    // Update the toggle checkbox if it exists
    const cb = document.getElementById('opt-tooltips');
    if (cb) cb.checked = enabled;
}

// ── UI: Add toggle to header ──────────────────────────────────────────────
function addToggle() {
    const headerRight = document.getElementById('header-right');
    if (!headerRight) return;

    // Add separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 20px; background: rgba(255,255,255,0.12); margin: 0 8px;';
    headerRight.insertBefore(sep, headerRight.firstChild);

    // Add toggle
    const label = document.createElement('label');
    label.className = 'opt-toggle';
    label.style.cssText = 'color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;';
    label.innerHTML = `<input type="checkbox" id="opt-tooltips" ${enabled ? 'checked' : ''} style="accent-color: var(--orange); width: 13px; height: 13px;" /> <span style="font-size: 11px;">💡</span> Tips`;
    headerRight.insertBefore(label, headerRight.firstChild);

    label.querySelector('input').addEventListener('change', (e) => {
        setEnabled(e.target.checked);
    });
}

// ── Boot ──────────────────────────────────────────────────────────────────
install();
addToggle();

// Expose for external control if needed
window.DevToolsTooltips = { setEnabled, isEnabled: () => enabled };

})();
