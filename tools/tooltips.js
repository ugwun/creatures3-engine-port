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
    { selector: '#logo', text: 'Creatures 3 Developer Tools — macOS engine port' },
    { selector: '#status-pill', text: 'Engine connection status. Green = connected via SSE, red = disconnected' },
    { selector: '#btn-engine-play', text: 'Resume engine simulation — the game world continues running' },
    { selector: '#btn-engine-pause', text: 'Pause engine simulation — freezes the world but the API stays responsive' },
    { selector: '#opt-tooltips', text: 'Enable or disable these contextual help tooltips. Preference is saved in localStorage' },

    // ── Navigation Tabs ──────────────────────────────────────────────────
    { selector: '.tab-btn[data-tab="creatures"]', text: 'Creature Inspector — view drives, chemistry, organs, and neural brain activity' },
    { selector: '.tab-btn[data-tab="log"]', text: 'Engine Log — real-time log stream from the Flight Recorder with category filtering' },
    { selector: '.tab-btn[data-tab="console"]', text: 'CAOS Console — interactive REPL to execute CAOS commands on the engine' },
    { selector: '.tab-btn[data-tab="scripts"]', text: 'Running Scripts — live table of all CAOS scripts currently executing across all agents' },
    { selector: '.tab-btn[data-tab="debugger"]', text: 'CAOS Debugger — source-level debugger with breakpoints, stepping, and variable inspection' },
    { selector: '.tab-btn[data-tab="ide"]', text: 'CAOS IDE — code editor with syntax highlighting, autocomplete, scriptorium browser, and breakpoints' },
    { selector: '.tab-btn[data-tab="docs"]', text: 'Architecture Docs — interactive class graph of the engine architecture' },
    { selector: '.tab-btn[data-tab="genetics"]', text: 'Genetics Kit — manipulate, cross-breed, and inject custom creature genomes directly into the world' },

    // ── Log Tab ───────────────────────────────────────────────────────────
    { selector: '#search', text: 'Filter log messages by text — only matching rows are shown' },
    { selector: '#btn-pause', text: 'Pause/resume the log stream. Incoming messages are buffered while paused' },
    { selector: '#btn-clear', text: 'Clear all log messages from the display' },
    { selector: '#btn-copy', text: 'Copy all visible (non-filtered) log lines to clipboard' },
    { selector: '#btn-export', text: 'Download the full log as a text file' },
    { selector: '#cat-all', text: 'Toggle all log categories at once' },
    { selector: '#opt-timestamps', text: 'Show/hide timestamps on each log row (relative seconds from session start)' },
    { selector: '#opt-autoscroll', text: 'Automatically scroll to the newest log entry' },
    { selector: '#opt-compact', text: 'Reduce row spacing for a denser log view' },
    { selector: '#pause-overlay', text: 'The log stream is paused. Messages are being buffered and will appear when you resume' },

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
    { selector: '#console-input', text: 'Type CAOS commands here. Enter to execute, Shift+Enter for multi-line. ↑/↓ for history' },
    { selector: '.console-prompt', text: 'CAOS command prompt — type a command and press Enter' },
    { selector: '.console-welcome', text: 'Welcome to the CAOS console. Commands are sent directly to the running engine' },

    // ── Scripts Tab ──────────────────────────────────────────────────────
    { selector: '#btn-scripts-refresh', text: 'Manually refresh the scripts list from the engine' },
    { selector: '#opt-auto-refresh', text: 'Automatically refresh the running scripts list every 2 seconds' },
    { selector: '#scripts-empty', text: 'No CAOS scripts are currently executing. Start or load a world to see active scripts' },

    // ── Debugger Tab ─────────────────────────────────────────────────────
    { selector: '#btn-dbg-focus', text: 'Move the in-game camera to the selected agent\'s position' },
    { selector: '#opt-dbg-follow', text: 'Auto-select and scroll to agents as they hit breakpoints' },
    { selector: '#btn-dbg-continue', text: 'Resume execution of the paused agent until the next breakpoint' },
    { selector: '#btn-dbg-step', text: 'Step into — execute one CAOS instruction and pause again' },
    { selector: '#btn-dbg-stepover', text: 'Step over — execute one instruction, treating subroutines as single steps' },
    { selector: '#dbg-agent-search', text: 'Filter agents by ID, classifier, or gallery name' },
    { selector: '#dbg-agent-panel .dbg-agent-panel-header', text: 'List of all agents with running or paused scripts. Click an agent to inspect it' },
    { selector: '#dbg-source-header', text: 'Displays the classifier and event of the currently selected agent\'s script' },
    { selector: '#dbg-source-view', text: 'CAOS source code view — click line numbers in the gutter to set breakpoints' },
    { selector: '#dbg-agent-empty', text: 'No agents are running scripts. Start a world to see active agents' },

    // Debugger — Inspector panels
    { selector: '#dbg-context-table', text: 'CAOS VM context handles — OWNR (script owner), TARG (current target), FROM (message sender), IT (iterator)' },
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
    { selector: '#opt-creatures-auto', text: 'Automatically refresh creature data every 2 seconds' },
    { selector: '.crt-list-header', text: 'All Norns, Grendels, and Ettins in the current world' },
    { selector: '#crt-list-empty', text: 'No creatures in the world yet. Hatch an egg or import a creature to begin' },

    // Creatures — sub-tabs
    { selector: '.crt-sub-btn[data-subtab="drives"]', text: 'Drive levels — the 20 biological drives (hunger, tiredness, boredom, etc.) that motivate creature behaviour' },
    { selector: '.crt-sub-btn[data-subtab="chemistry"]', text: 'Biochemistry — all 256 chemical concentrations in the creature\'s bloodstream' },
    { selector: '.crt-sub-btn[data-subtab="organs"]', text: 'Organs — biological organs with their reactions, receptors, emitters, and health status' },
    { selector: '.crt-sub-btn[data-subtab="brain"]', text: 'Brain Monitor — spatial neural network visualization with lobe heatmaps, tract connections, and dendrite weights' },

    // Creatures — chemistry controls
    { selector: '.crt-chem-tab-btn[data-chem-tab="monitoring"]', text: 'Monitoring — view all chemical levels and track non-zero concentrations' },
    { selector: '.crt-chem-tab-btn[data-chem-tab="syringe"]', text: 'Syringe — search and inject specific chemicals into the creature\'s bloodstream' },
    { selector: '#crt-syringe-search', text: 'Search for a specific chemical by name or ID among the 256 available chemicals' },
    { selector: '#crt-syringe-amount', text: 'Dosage amount to inject. Positive adds, negative removes. Range runs from -1.0 to 1.0' },
    { selector: '#btn-syringe-inject', text: 'Inject the specified dosage of the selected chemical into the creature' },
    { selector: '#opt-chem-nonzero', text: 'Show only chemicals with non-zero concentrations to reduce clutter' },

    // Creatures — summary panel
    { selector: '.crt-summary-header', text: 'Summary card showing species, name, age, health, and life-stage of the selected creature' },

    // Creatures — dynamic list items & badges
    { selector: '.crt-state-badge', text: 'Life state of this creature — Alert, Dreaming, Asleep, etc.' },
    { selector: '.crt-health-bar', text: 'Health bar — overall creature health (0%–100%)' },
    { selector: '.crt-item-icon', text: 'Species icon — 🐣 Norn, 🦎 Grendel, 🔧 Ettin' },

    // Creatures — Brain sub-view
    { selector: '.crt-brain-panel-title', text: 'Neural network inspector — lobes, tracts, and neuron activation states' },
    { selector: '#crt-brain-viewport', text: 'Spatial brain view — scroll to pan, click neurons to inspect connections, click tracts to see dendrites' },
    { selector: '#crt-brain-info', text: 'Brain info sidebar — shows selected neuron/tract details, lobe list, and connection weights' },

    // Creatures — Organs sub-view (dynamically generated elements)
    { selector: '.org-card-header', text: 'Click to expand/collapse this organ and view its receptors, emitters, and reactions' },
    { selector: '.org-status-badge', text: 'Organ health status — OK (functioning), Impaired (damaged), or Failed (non-functional)' },
    { selector: '.org-count-badge.org-count-r', text: 'Number of receptors — input channels that read chemical concentrations into organ loci' },
    { selector: '.org-count-badge.org-count-e', text: 'Number of emitters — output channels that release chemicals based on organ state' },
    { selector: '.org-count-badge.org-count-x', text: 'Number of reactions — biochemical reactions converting input chemicals into output chemicals' },
    { selector: '.org-stat-label', text: 'Organ statistic — internal clock, energy cost, life force, or repair rate' },
    { selector: '.org-section-title', text: 'Section within the organ detail — Reactions, Receptors, or Emitters' },
    { selector: '.org-rxn-rate', text: 'Reaction rate — 0% is fastest (instant), 100% is slowest (never reacts)' },

    // Creatures — Genome sub-view
    { selector: '.crt-sub-btn[data-subtab="genome"]', text: 'Genome Inspector — structural view of all genes inside this creature\'s DNA with details on biology and brain setup' },
    { selector: '#crt-genome-search, #genetics-genome-search', text: 'Filter genes by searching for text (e.g. "Hunger", "Chem 213")' },
    { selector: '#crt-genome-age, #genetics-genome-age', text: 'Filter genes by their switch-on age (Baby, Child, Adult, etc.)' },
    { selector: '.crt-gene-badge-mut', text: 'Gene mutation flags (M=Mutable, D=Duplicatable, C=Cuttable)' },
    { selector: '.crt-gene-badge-sex', text: 'Sex requirement flag (gene only active in males or females)' },
    { selector: '.crt-gene-badge-dormant', text: 'Dormant flag — this gene will not be expressed during the creature\'s life' },
    { selector: '.crt-gene-badge-gen', text: 'Generation level of this gene' },
    { selector: '.crt-gene-badge-age', text: 'Age stage when this gene becomes active' },
    { selector: '.crt-svrule-container', text: 'CAOS SVRule pseudo-code for neuron initialization or updating' },
    { selector: '#crt-genome-controls .opt-toggle, #genetics-genome-controls .opt-toggle', text: 'Filter genes by primary type (Brain, Biochemistry, Creature physiology, Organ properties)' },

    // ── CAOS IDE Tab ─────────────────────────────────────────────────────
    { selector: '#btn-ide-run', text: 'Execute the editor contents as immediate CAOS code (Ctrl/Cmd+Enter). Like typing in the console' },
    { selector: '#btn-ide-inject', text: 'Install the code as a permanent script in the scriptorium using the classifier above' },
    { selector: '#btn-ide-remove', text: 'Remove the script with the current classifier from the scriptorium' },
    { selector: '#btn-ide-save', text: 'Download the editor contents as a .cos file' },
    { selector: '#btn-ide-load', text: 'Load a .cos file from disk into the editor' },
    { selector: '#btn-ide-refresh', text: 'Reload the scriptorium list from the engine' },
    { selector: '#btn-ide-clear', text: 'Clear the output panel below the editor' },
    { selector: '#ide-search', text: 'Search through installed scriptorium scripts by classifier, event number, or agent name' },
    { selector: '.ide-sidebar-header', text: 'Browse all scripts installed in the engine\'s scriptorium' },
    { selector: '.ide-classifier-label', text: 'Script classifier: Family, Genus, Species, Event — identifies which agent type and event this script handles' },
    { selector: '#ide-family', text: 'Family — broad agent category (e.g. 2=Compound, 3=Simple, 4=Creature)' },
    { selector: '#ide-genus', text: 'Genus — agent group within a family' },
    { selector: '#ide-species', text: 'Species — specific agent type within a genus' },
    { selector: '#ide-event', text: 'Event number — which event triggers this script (e.g. 1=Push, 2=Pull, 3=Hit, 9=Timer)' },
    { selector: '.ide-output-header', text: 'Output from Run commands and inject/remove operations' },
    { selector: '.ide-bp-title', text: 'IDE breakpoints — click line numbers in the gutter to set breakpoints, then bind them to running agents' },
    { selector: '#ide-editor', text: 'CAOS editor — Tab to indent, Ctrl+Space for autocomplete, F1 for command help, Ctrl/Cmd+Enter to run' },
    { selector: '#ide-error-bar', text: 'Syntax validation error — the CAOS compiler found an issue in your code' },
    { selector: '#ide-bp-clear-all', text: 'Remove all breakpoints from the editor and unbind them from all agents' },
    { selector: '.ide-group-header', text: 'Agent script group — click to expand/collapse. Shows all event scripts for this classifier' },
    { selector: '#ide-line-numbers', text: 'Line numbers — click a number to toggle a breakpoint on that line' },

    // ── Docs Tab ─────────────────────────────────────────────────────────
    { selector: '#btn-docs-zoom-out', text: 'Zoom out the architecture graph' },
    { selector: '#btn-docs-zoom-in', text: 'Zoom in the architecture graph' },
    { selector: '#btn-docs-reset', text: 'Reset the graph view to default zoom and position' },
    { selector: '.docs-detail-header', text: 'Click a class node in the graph to see its description, file path, and connections' },
    { selector: '#docs-legend', text: 'Colour key for the architecture layers and connection types' },
    { selector: '#docs-viewport', text: 'Architecture graph — drag to pan, Ctrl+scroll to zoom, click nodes to inspect, drag nodes to rearrange' },

    // Docs — legend layer items
    { selector: '.docs-legend-title', text: 'Legend section heading' },
    { selector: '.docs-node', text: 'Engine class node — click to inspect, drag to reposition' },

    // ── Genetics Kit Tab ─────────────────────────────────────────────────
    { selector: '#genetics-file-search', text: 'Filter genomes in the library by moniker name' },
    { selector: '#btn-genetics-refresh', text: "Refresh the list of available genomes from the engine's GenomeStore" },
    { selector: '#btn-genetics-new', text: 'Create a brand new blank genome' },
    { selector: '#btn-genetics-import', text: 'Load a genome from a JSON file into the editor' },
    { selector: '.genetics-file-item', text: 'Click to load this genome into the inspector' },
    { selector: '.btn-genetics-rename-inline', text: 'Rename this genome file (disabled for core genomes)' },
    { selector: '.btn-genetics-delete-inline', text: 'Delete this genome file from the disk (disabled for core genomes)' },
    { selector: '#btn-genetics-export', text: 'Export the currently inspected genome as a JSON file' },
    { selector: '#btn-genetics-save', text: 'Save the inspected genome back to the Genetics folder as a .gen file' },
    { selector: '#btn-genetics-crossover', text: 'Cross-breed two parent genomes to generate a brand new child genome' },
    { selector: '#genetics-inject-mode', text: 'Select whether to inject the genome as an incubating egg or as a fully hatched baby creature' },
    { selector: '#btn-genetics-inject', text: 'Inject the inspected genome directly into the world. The creature or egg will be spawned on the top floor of the Norn Meso room.' },
    { selector: '.crt-gene-badge-active', text: 'Active — toggle whether this gene will be included when injecting into the engine' },
    { selector: 'label.crt-gene-badge-mut:has(.g-mut)', text: 'Mutable — toggle whether this gene is allowed to mutate during crossovers' },
    { selector: 'label.crt-gene-badge-mut:has(.g-dup)', text: 'Duplicatable — toggle whether this gene can be duplicated during crossovers' },
    { selector: 'label.crt-gene-badge-mut:has(.g-cut)', text: 'Cuttable — toggle whether this gene can be removed during crossovers' },
    { selector: '.crt-gene-input', text: 'Edit gene property. Changes are immediately saved to the loaded genome in-memory' },
    { selector: '.crt-gene-header', text: 'Click to expand/collapse the full gene properties' },
    { selector: '.g-btn-up', text: 'Move this gene backward up the genome (earlier crossover linkage)' },
    { selector: '.g-btn-down', text: 'Move this gene forward down the genome (later crossover linkage)' },
    { selector: '.g-btn-dup', text: 'Duplicate this gene exactly as and append it below' },
    { selector: '.g-btn-del', text: 'Delete this gene entirely from the genome' },
    { selector: '#genetics-add-gene-type', text: 'Select a gene classification to append to the genome' },
    { selector: '#btn-genetics-add-gene', text: 'Append a new blank gene of the selected classification' },
    { selector: '#cross-parent-b-select', text: 'Select the second parent genome to cross-breed with Parent A', context: '#modal-crossover' },
    { selector: '#cross-child-name', text: 'Provide an optional custom name prefix for the resulting child\'s genome file', context: '#modal-crossover' },
    { selector: '#btn-cross-run', text: 'Execute the genetic crossover operation to generate the new child genome', context: '#modal-crossover' },
    { selector: '#btn-cross-cancel', text: 'Cancel the crossover operation', context: '#modal-crossover' },

    // ── Scripts Table Headers ────────────────────────────────────────────
    { selector: '#scripts-table th:nth-child(1)', text: 'Unique numeric ID of the agent running this script' },
    { selector: '#scripts-table th:nth-child(2)', text: 'Classifier: family genus species event — identifies the script type' },
    { selector: '#scripts-table th:nth-child(3)', text: 'Execution state: Running (actively executing), Blocking (waiting)' },
    { selector: '#scripts-table th:nth-child(4)', text: 'Instruction Pointer — current position in the bytecode' },
    { selector: '#scripts-table th:nth-child(5)', text: 'Source code around the current instruction pointer' },

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
function showTooltip(target, text) {
    if (!tooltipEl) tooltipEl = createTooltipElement();
    suppressNativeTitles(target);
    tooltipEl.textContent = text;
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
    restoreNativeTitles();
    if (tooltipEl) {
        tooltipEl.style.opacity = '0';
        setTimeout(() => {
            if (tooltipEl) tooltipEl.style.display = 'none';
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

// ── Find matching tip for an element ──────────────────────────────────────
function findTip(el) {
    for (const tip of TIPS) {
        // Check if the element matches the selector
        try {
            if (!el.matches(tip.selector)) continue;
        } catch (_) { continue; }

        // Check context if specified
        if (tip.context && !el.closest(tip.context)) continue;

        return tip.text;
    }
    return null;
}

// ── Walk up the DOM to find a tooltippable element ────────────────────────
function findTipTarget(el) {
    let node = el;
    // Walk up max 5 levels to find a match
    for (let i = 0; i < 5 && node && node !== document.body; i++) {
        const text = findTip(node);
        if (text) return { element: node, text };
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
            hideTooltip();
        }
        return;
    }

    // Same target — keep showing
    if (match.element === currentTarget) return;

    // New target
    cancelPending();
    hideTooltip();

    // Suppress native title immediately (before the delay) so the browser's
    // own tooltip doesn't race our custom one during the 500ms wait.
    suppressNativeTitles(match.element);

    hoverTimer = setTimeout(() => {
        showTooltip(match.element, match.text);
    }, DELAY_MS);
}

function onMouseOut(e) {
    // Only hide if we're actually leaving the tip target
    const match = findTipTarget(e.relatedTarget);
    if (match && match.element === currentTarget) return;

    cancelPending();
    hideTooltip();
}

function onScroll() {
    cancelPending();
    hideTooltip();
}

function onKeyDown() {
    cancelPending();
    hideTooltip();
}

// ── Install / teardown ────────────────────────────────────────────────────
function install() {
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('keydown', onKeyDown, { passive: true });
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
