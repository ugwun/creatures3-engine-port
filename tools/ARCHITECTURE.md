# Developer Tools — Architecture

This document describes how the developer tools system is built — its communication architecture, threading model, code structure, and how to extend it with new tools.

---

## Overview

The developer tools are an **embedded HTTP server** inside the `lc2e` binary, activated by the `--tools` CLI flag. Everything — static file serving, REST API, and live log streaming — runs through a single port (9980).

```
┌──────────────────────────────────────────────────────────────┐
│                        lc2e binary                           │
│                                                              │
│  ┌──────────────┐         ┌─────────────────────────────┐    │
│  │FlightRecorder│──UDP───►│       DebugServer            │    │
│  │  (logging)   │  9999   │                              │    │
│  └──────────────┘         │  ┌─────────────────────┐     │    │
│                           │  │   httplib::Server    │     │    │
│                           │  │ (background thread)  │     │    │
│                           │  └──────────┬──────────┘     │    │
│                           │             │                │    │
│  ┌──────────────┐         │    ┌────────▼────────┐       │    │
│  │  Main Loop   │◄──Poll──│    │   Work Queue    │       │    │
│  │ (game tick)  │         │    │ std::queue +     │       │    │
│  │              │────────►│    │ std::promise     │       │    │
│  └──────────────┘ result  │    └─────────────────┘       │    │
│                           │                              │    │
│                           │  ┌─────────────────────┐     │    │
│                           │  │   SSE Log Buffer    │     │    │
│                           │  │ IDs + count/bytes   │     │    │
│                           │  └─────────────────────┘     │    │
│                           └──────────────┬───────────────┘    │
│                                          │                    │
└──────────────────────────────────────────┼────────────────────┘
                                           │ port 9980
                                    ┌──────▼──────┐
                                    │   Browser   │
                                    │             │
                                    │ ┌────┐ ┌──┐ │
                                    │ │Log │ │ ▸│ │
                                    │ └────┘ └──┘ │
                                    └─────────────┘
```

### What replaced what

The previous architecture required Node.js:

```
FlightRecorder → UDP :9999 → relay.js (Node.js) → WS :9998 → Browser
```

The new architecture has zero external dependencies:

```
FlightRecorder → UDP :9999 → DebugServer (in-process) → SSE :9980 → Browser
```

---

## Threading Model

The engine is **single-threaded**. All engine state (agents, scripts, world) must only be accessed from the main thread. The DebugServer bridges this constraint:

### 1. Background HTTP Thread

`httplib::Server` runs in a background `std::thread`, started in `DebugServer::Start()`. It:
- Serves static files from the `tools/` directory
- Handles API requests (`/api/execute`, `/api/scripts`, etc.)
- Handles SSE connections (`/api/events`)

### 2. Work Queue (background → main thread)

API handlers that need engine state create a `WorkItem`:

```cpp
struct WorkItem {
    std::function<std::string()> work;  // the work to do on main thread
    std::promise<std::string> promise;  // result channel
};
```

The handler pushes the item onto a `std::queue<WorkItem*>` (protected by `std::mutex`), then blocks on `std::future::wait_for()` with a timeout.

### 3. Poll() — Main Thread Drain

`DebugServer::Poll()` is called once per game tick from the main loop in `SDL_Main.cpp`. It:
1. Locks the queue mutex
2. Pops all pending work items
3. Executes each item's `work()` lambda (safely on the main thread)
4. Sets the result via `promise.set_value()`
5. The blocked HTTP handler wakes up and returns the response

```
HTTP Thread                     Main Thread
    │                               │
    ├─ push WorkItem ──────────►    │
    ├─ future.wait_for(10s) ...     │
    │                               ├─ Poll()
    │                               ├─ item->work()
    │                               ├─ promise.set_value(result)
    │  ◄──────────── result ────────┤
    ├─ res.set_content(result)      │
    │                               │
```

### 4. SSE Log Streaming

Log streaming works differently — it doesn't use the work queue:

1. **FlightRecorder** sends UDP packets to `127.0.0.1:9999` (broadcast)
2. **UDP relay thread** normalizes structured or legacy packets into a versioned
   envelope. The latest main-thread world/tick snapshot is attached as
   explicitly approximate context.
3. The server buffer stores composite stream/record IDs and is bounded by
   5,000 records and approximately 4 MiB. Eviction counts are retained.
4. **SSE handler** (`GET /api/events`) resumes from `Last-Event-ID`, emits gap
   envelopes for restart or overflow, snapshots pending payloads under the
   mutex, then writes after releasing the mutex.
5. `log_model.js` normalizes records and maintains a second count/byte-bounded
   browser buffer. `log_workspace.js` renders filters, context preview,
   bookmarks/annotations, cross-links, and text/JSON/JSONL export.

---

## File Structure

### Shared browser state and navigation

The observatory browser shell is deliberately independent of feature-module
DOM:

- `observatory_state.js` owns immutable world, selection, evidence, sample, and
  navigation snapshots. A selection has one primary kind and any number of
  related secondary kinds.
- `observatory_navigation.js` owns `#observe?` route serialization,
  identity-bearing link builders, History API snapshots, world validation,
  and workspace adapters.
- `context_strip.js` renders the shared state as accessible navigation and
  clear controls. It does not inspect Creatures, Scripts, Debugger, Log, or
  Docs markup.
- Each feature registers a small `capture`/`restore`/`open` adapter. This is
  how browser Back restores filters and scroll without one feature reaching
  into another feature's DOM.

Cross-links publish stable identifiers to the store and call the navigation
service. Engine APIs provide agent classifier/gallery and creature
room/metaroom fields where they can be read accurately. A route whose
world-qualified target belongs to another active world is rejected before a
workspace opens.

### Engine-side (C++)

| File | Purpose |
|---|---|
| [`engine/DebugServer.h`](../engine/DebugServer.h) | Public API: `Start()`, `Poll()`, `Stop()`, `IsRunning()` |
| [`engine/DebugServer.cpp`](../engine/DebugServer.cpp) | Full implementation: HTTP routes, work queue, SSE log buffer, UDP relay |
| [`engine/Creature/Brain/Brain.h`](../engine/Creature/Brain/Brain.h) | Brain class — public accessors for lobes and tracts (added for brain API) |
| [`engine/Creature/Brain/Lobe.h`](../engine/Creature/Brain/Lobe.h) | Lobe class — public accessors for name, geometry, colour (added for brain API) |
| [`engine/Creature/Brain/Tract.h`](../engine/Creature/Brain/Tract.h) | Tract class — public accessors for dendrites, src/dst lobes (added for brain API) |
| [`engine/contrib/httplib.h`](../engine/contrib/httplib.h) | Vendored [cpp-httplib](https://github.com/yhirose/cpp-httplib) (MIT license, header-only) |
| [`engine/Display/SDL/SDL_Main.cpp`](../engine/Display/SDL/SDL_Main.cpp) | `--tools` flag parsing, `Start()`/`Poll()`/`Stop()` integration |

### Browser-side (HTML/JS/CSS)

| File | Purpose |
|---|---|
| [`tools/index.html`](index.html) | UI shell — tab navigation, panel containers, sidebar |
| [`tools/utils.js`](utils.js) | Shared utilities: `escHtml()` function + `DevToolsEvents` pub/sub event bus |
| [`tools/observatory_state.js`](observatory_state.js) | Immutable shared session/selection/sample store, evidence metadata, freshness, and request deduplication |
| [`tools/observatory_navigation.js`](observatory_navigation.js) | Named route definitions, context-preserving hashes/history, capability metadata, and workspace adapters |
| [`tools/contextual_help_model.js`](contextual_help_model.js) | Authoritative route/panel/action help registry, evidence metadata, guide/reference targets, and live identifier routing |
| [`tools/contextual_help.js`](contextual_help.js) | Accessible non-modal help drawer, stable target resolution, F1/Escape/outside-click handling, and context-preserving Docs actions |
| [`tools/architecture_model.js`](architecture_model.js) | Versioned architecture layers, nodes, relationships, endpoint mappings, metric paths, validation, filtering, and bounded live-context classification |
| [`tools/architecture_graph.js`](architecture_graph.js) | Layered graph/text renderer, pan/zoom/search/filter controls, keyboard interaction, inspectors, and context-preserving links |
| [`tools/tooltips.js`](tooltips.js) | Optional concise hover/focus tips, positioning, native title suppression, and accessible `aria-describedby` relationships |
| [`tools/app.js`](app.js) | Browser shell: session boot, tab switching, navigation, simulation controls |
| [`tools/log_model.js`](log_model.js) | Pure structured/legacy log normalization, bounded retention, duplicate collapse, filters, and exports |
| [`tools/log_workspace.js`](log_workspace.js) | SSE lifecycle, Log rendering, pause semantics, context preview, annotations, and cross-links |
| [`tools/debugger.js`](debugger.js) | Console tab: CAOS REPL with history, error display |
| [`tools/scripts_model.js`](scripts_model.js) | Pure running-script state normalization, bounded transitions, grouping, stable sorting, and filtering |
| [`tools/scripts.js`](scripts.js) | Compact Scripts workspace, active-only polling, incremental rows, source cache, and shared-navigation handoffs |
| [`tools/debugger_view.js`](debugger_view.js) | Debugger tab: agent list panel with classifier grouping/search, source view, syntax highlighting, breakpoints, stepping, variable inspector |
| [`tools/creatures.js`](creatures.js) | Creatures tab: creature list polling, drive bar visualization, chemistry chart, summary card, auto-refresh |
| [`tools/biological_semantics.js`](biological_semantics.js) | Pure semantic helpers: vitality indicator collection, evidence-bearing organ-role inference, and non-mutating Brain layout transforms |
| [`tools/creature_observation.js`](creature_observation.js) | Pure seven-stage observation composer, timing/evidence warnings, competition comparisons, immutable comparison logic, and bounded capture store |
| [`tools/creature_observation_strip.js`](creature_observation_strip.js) | Live Observation Strip controller: active-view polling, freeze/capture/compare presentation, raw evidence, and shared-navigation handoffs |
| [`tools/brain.js`](brain.js) | Brain sub-tab: exact Genome anatomy and explicitly transformed Functional flow modes, neuron activity cells, SVG tract lines, interactive dendrite inspection, zoom controls |
| [`tools/caos_ide.js`](caos_ide.js) | CAOS IDE tab: scriptorium browser, code editor with syntax highlighting overlay, run/inject/remove, file save/load |
| [`tools/docs.js`](docs.js) | Docs tab: Markdown-powered Developer Wiki viewer, internal document routing, section scrolling, and lifecycle delegation to the Architecture Graph |
| [`tools/accessibility_model.js`](accessibility_model.js) | Pure display-preference normalization, editable-target classification, shortcut inventory, and semantic-colour contrast calculations |
| [`tools/accessibility.js`](accessibility.js) | Shared keyboard/display dialog, persisted density and motion settings, shortcut conflict handling, tab semantics, focus restoration, and runtime semantic audit |
| [`tools/marked.min.js`](marked.min.js) | Vendored Markdown parser (v15) used by the Developer Wiki |
| [`tools/genetics.js`](genetics.js) | Copy-first Genetics Kit: trusted identity, source→derived workflow, structured diff, bounded derived editor, reviewed injection, result navigation, and exceptional copy-only file operations |
| [`tools/genetics_experiment_model.js`](genetics_experiment_model.js) | Pure safe-genetics model: new-name validation/suggestion, canonical model checksums, stable gene matching, structured diffs, write readiness, and injection readiness |
| [`tools/gene_renderer.js`](gene_renderer.js) | Genetics DOM factory for all 19 decoded subtypes, serialized bounds, and the SVRule visual grid; inputs are enabled only when the parent workspace selects a verified experimental copy/draft |
| [`tools/caos_format.js`](caos_format.js) | Shared CAOS source pretty-printer (`formatCAOS()`) and syntax highlighter (`highlightCAOS()`) |
| [`tools/style.css`](style.css) | Bright-Fi design system — all styling for all tabs |

### Documentation

| File | Purpose |
|---|---|
| [`TOOLS.md`](TOOLS.md) | Usage guide: quick start, tab descriptions, API reference |
| [`tools/ARCHITECTURE.md`](ARCHITECTURE.md) | This file — technical reference |

---

## Module Architecture

### Script Loading Order

Script tags in `index.html` load in this order:

1. `utils.js`, `observatory_state.js`, and `observatory_navigation.js` establish
   shared utilities, immutable state, and named context routes.
2. `contextual_help_model.js` registers authoritative help before any
   controller creates or annotates targets.
3. Pure state/model modules load next: session context, architecture,
   biological semantics
   and series, creature observation, timeline, comparison, ecology,
   experiments, chemical/genetics safety, CAOS Workbench, and dashboard.
4. `marked.min.js` and `caos_format.js` provide documentation parsing and CAOS
   formatting.
5. `tooltips.js`, `provenance_transport.js`, and `app.js` establish optional
   Tips, provenance transport, the shell, navigation, and simulation controls.
6. `contextual_help.js` binds the shared drawer after the shell has rendered
   route buttons. `accessibility.js` then applies persisted display
   preferences, internal tab semantics, labelled-input fallbacks, and global
   shortcut exclusions. Their mutation observers annotate later dynamic
   targets without owning domain state.
7. Dashboard, Logs, Console, Scripts, Debugger, Creatures, Timeline, Compare,
   Ecology, and Experiment controllers load after their pure models.
8. Brain, organ, genome, Workbench, Architecture, Docs, and Genetics
   controllers finish the feature graph. `architecture_graph.js` depends on
   `architecture_model.js`; `docs.js` depends on `marked.min.js` and delegates
   graph lifecycle to `ArchitectureGraph`; `genetics.js` depends on the gene
   renderer and genetics model.

### Live Architecture Model

`architecture_model.js` is maintained documentation, not a runtime call graph.
Its nodes identify stable components across engine, domain, transport, browser,
surface, and external layers. Relationships carry an explicit static,
observed, derived, or inferred evidence vocabulary. Metric paths separately
record unit, transformation, cadence, and evidence for each hop.

`architecture_graph.js` derives layout from layer and order. It reads bounded
Resource Timing entries to identify recently completed, mapped API requests;
current route and Observatory selections are context only. No response bodies
are retained and no engine tracing is added. Consequently, a selected or
highlighted static path is never promoted to observed execution.

Source locations are optional maintained metadata. The model's Node test
checks every declared source and documentation target in the repository. See
[`docs/live_architecture_graph.md`](docs/live_architecture_graph.md) for the
user-facing evidence contract.

Feature modules are wrapped in IIFEs `(() => { ... })()` to prevent global
scope pollution. Cross-module lifecycle notifications use `DevToolsEvents`.
Authoritative session, identity, selection, and evidence-bearing sample state
uses `ObservatoryState`.

### Shared Observatory State Ownership

`observatory_state.js` owns facts that must agree across tabs:

- connection and pause state;
- current world identity, ticks, speed, and load transition;
- shared selections;
- the current bounded sample cache;
- recording, experiment, intervention, navigation, and display-preference
  contracts.

Feature modules continue to own transport calls and temporary rendering state.
They pass loaders to `ObservatoryState.requestShared()`, which deduplicates
concurrent requests and reduces validated samples. This separation makes
transport replaceable in tests and prevents the store from starting permanent
polling loops.

State changes are actions reduced into deeply frozen snapshots. Feature
modules subscribe with a selector, so only a changed slice invokes a listener.
World-scoped identities use `worldName:localId`; a load transition, changed
world name, or disconnect invalidates them centrally. Samples from an old
world or older tick are rejected. History is capped at 120 samples per key and
intervention provenance at 200 entries.

The exact public state and evidence contract is documented in
[`docs/observatory_state.md`](docs/observatory_state.md). Unit coverage lives
in `tools/tests/observatory_state.test.cjs` and runs without browser or package
dependencies:

```bash
node tools/tests/observatory_state.test.cjs
```

### Reusable Biological Series

`biological_series.js` is a DOM-independent bounded store for drive, chemical,
organ, and selected-neuron samples. A series belongs to a world-qualified
subject session and carries world/system/wall time, pause and speed state,
sampling interval, source endpoint, evidence level, explicit gaps, and
intervention markers. Tick regression creates a new epoch. Storage is capped
at 300 samples per metric and 60,000 total samples, with min/max-envelope
downsampling for display and loss counts retained for export.

`biological_monitor.js` is the browser controller and presentation adapter. It
owns pin order, functional navigation groups, baselines, stale detection,
sparklines, and schema-versioned JSON export. Feature views ingest observations
but do not own history rendering, allowing Timeline and Comparison to consume
the same pure store later.

Unit coverage runs without DOM or package dependencies:

```bash
node tools/tests/biological_series.test.cjs
```

### Atomic Creature Observation

`GET /api/creature/:id/observation` samples Environment through Action inside
one main-thread `WorkItem`. This prevents the browser from assembling a
present-tense view out of unrelated endpoint ticks. The response includes its
world, tick, wall/system time, pause/speed context, explicit unavailable
lobes, limited nearby-agent evidence, competing neural activities, current
attention target, decision/motor state, and owning-agent CAOS VM state.

`creature_observation.js` is transport- and DOM-independent. It composes the
fixed seven-stage schema, attaches evidence records, preserves raw sources,
detects mixed timing, derives weak/close/overtaken competition signals, and
compares immutable captures. Consequence deliberately uses
`BiologicalSeries` adjacent-sample deltas and therefore retains its different
tick and Derived evidence level.

`creature_observation_strip.js` polls only for a world-qualified selected
creature while the Creatures tab and strip are visible. A frozen display does
not stop polling or the engine. World/creature changes reset live, frozen, and
captured state, and serial guards reject late responses from old contexts.
Capture retention is capped at 20 per active subject session.

Pure coverage runs with:

```bash
node tools/tests/creature_observation.test.cjs
```

### Contextual Help and Documentation Routes

`contextual_help_model.js` owns durable help content. Every definition contains
a stable ID, concise meaning, activity, evidence source/cadence, caution,
guide/reference targets, terminology, and review owner. Route IDs use
`route.<route-id>`; fields, panels, and actions use stable prefixes such as
`field.`, `panel.`, and `action.`.

Static targets can declare `data-help-id` directly. A definition can also own a
CSS `selector`; `contextual_help.js` applies its ID to existing matches and
future dynamic nodes through a `MutationObserver`. Registered targets receive
`aria-keyshortcuts="F1"` without changing their native input behavior.

The non-modal drawer resolves help in this order:

1. the directly focused or activated registered target;
2. the most recent registered target, only while it remains connected and
   visible in the active workspace;
3. the current named route.

F1 opens target-specific help, except inside the Workbench editor where its
command-reference F1 behavior remains authoritative. Escape, the visible close
button, or an outside pointer action closes the drawer. Focus returns to the
trigger for keyboard dismissal. Tab is never intercepted.

Optional Tips remain in `tooltips.js`. They are non-interactive hover/focus
descriptions connected with `aria-describedby`; a small hint advertises F1.
The legacy `doc` property only identifies entries that merit that hint during
migration. It no longer creates a link or owns documentation navigation.

Guide/reference actions build an explicit `route=guides` route through
`ContextualHelpModel.documentationRoute()`. The route carries confirmed world
identity, stable selections, and the current world-tick cursor/range.
`docs.js` then renders the named Markdown document and section in the same
investigation history. Legacy `#docs/...` hashes remain supported by
`observatory_navigation.js` as migration aliases.

#### Adding Contextual Help

1. Add the guide/reference Markdown to `tools/docs/` and register new pages in
   `tools/docs/index.json`.
2. Add a complete definition to `contextual_help_model.js`, including owner,
   evidence metadata, caution, and guide target.
3. Add `data-help-id` to a static target or a stable registry selector for a
   dynamic target.
4. Add the exact ID and owner to `contextual_help_inventory.md`.
5. Run `node --test tools/tests/*.test.cjs`; documentation integrity rejects
   missing files/sections, stale routes, and inventory drift.
6. Verify mouse, Tab, F1, Escape, focus return, and narrow/wide layouts in
   Firefox. See `tools/docs/contextual_help_authoring.md` for editorial rules.

### DevToolsEvents — Cross-Module Communication

`DevToolsEvents` (defined in `utils.js`) is a lightweight pub/sub event bus. It decouples modules so they don't query each other's DOM:

```javascript
// Subscribe
DevToolsEvents.on('tab:activated', (tabName) => { ... });
DevToolsEvents.on('creature:selected', (agentId) => { ... });

// Publish
DevToolsEvents.emit('tab:activated', 'scripts');
DevToolsEvents.emit('creature:selected', 42);
```

**Current events:**

| Event | Payload | Producer | Consumers |
|---|---|---|---|
| `tab:activated` | tab name string | `app.js` | `scripts.js`, `debugger_view.js`, `creatures.js`, `brain.js`, `caos_ide.js` |
| `tab:deactivated` | tab name string | `app.js` | `scripts.js`, `debugger_view.js`, `creatures.js`, `brain.js`, `caos_ide.js` |
| `creature:selected` | agent ID number (legacy compatibility) | `creatures.js` | legacy extensions |

Persistent selections do not use this transient event. Creature, brain,
organs, and genome modules select or subscribe through `ObservatoryState`.

### Tab-Aware Polling

Modules that poll the server (Scripts, Debugger, Creatures, Brain) only poll when their tab is active:

1. On `tab:activated` → start `setInterval` polling
2. On `tab:deactivated` → `clearInterval` to stop
3. On initial page load → **no polling** (wait for tab activation)

This prevents unnecessary network traffic and CPU usage when tabs are hidden.

---

## Engine Integration Points

### SDL_Main.cpp

The `--tools` flag is parsed in the CLI argument loop. Three hooks are added:

```cpp
// After crash handlers are installed:
if (enableTools) {
    theDebugServer.Start(9980, toolsDir);
}

// In the main game loop, after UpdateApp():
if (enableTools) {
    theDebugServer.Poll();
}

// In DoShutdown():
if (enableTools) {
    theDebugServer.Stop();
}
```

### Tools Directory Resolution

The engine resolves the `tools/` directory path in this order:
1. **CLI override:** `--tools /path/to/tools` uses the given path directly
2. **Relative to executable:** `_NSGetExecutablePath()` → `<exe_dir>/../tools/`
3. **Fallback:** `./tools/` relative to the current working directory

### FlightRecorder

`FlightRecorder::EnableUDPBroadcast(9999)` sends JSON log lines via UDP. The DebugServer creates a separate UDP socket, binds to `INADDR_ANY:9999`, and receives these packets in a background thread. This means the FlightRecorder code is **completely unchanged** — the DebugServer is a passive listener.

### CAOS Execution

The `/api/execute` endpoint follows the same pattern as `RequestManager`:
1. Compile the CAOS text with `Orderiser::OrderFromCAOS()`
2. Create a fresh `CAOSMachine`
3. Call `StartScriptExecuting()` with `NULLHANDLE` as owner (no OWNR)
4. Redirect output with `SetOutputStream()`
5. Run to completion with `UpdateVM(-1)`
6. Catch `CAOSMachine::RunError` for runtime errors

---

## Design System — Bright-Fi

All developer tools UI follows the **Bright-Fi** aesthetic. This section serves as a reference for implementing new tabs.

### Colour Palette

| Role | Value | CSS Variable | Usage |
|---|---|---|---|
| Base background | `#F2F0EC` | `--off-white` | Content panels, sidebar, script table |
| Negative space | `#000000` | `--black` | Header, structural borders |
| Primary accent | `#FF5F00` | `--orange` | Active tab, status indicators, input bar |
| Secondary accent | `#FF00FF` | `--magenta` | Pause overlay, crash category |
| Category: Error | `#DD0000` | `--cat-error` | Error rows, badges |
| Category: Network | `#0055FF` | `--cat-network` | Network rows, badges |
| Category: World | `#008000` | `--cat-world` | World rows, badges |
| Category: CAOS | `#7700CC` | `--cat-caos` | CAOS rows, badges, script source |

### Typography

- **UI labels:** Inter, weight 800–900, `text-transform: uppercase`, `letter-spacing: 2–3px`
- **Code/output:** JetBrains Mono, 12–14px
- Both fonts loaded via Google Fonts in `index.html`

### UI Conventions

- All borders: hard `1–2px solid black`, **no rounded corners**
- Category badges: solid-fill blocks with white text (e.g. `ERR` on red)
- Error rows: faint red background tint
- State badges: outlined with muted background (e.g. green for `running`, orange for `blocking`)
- Console input bar: black background, orange top border, orange `>` prompt
- Square dots throughout (not circles) for geometric vocabulary

---

## Adding New Tools

### 1. Add a Tab

In `index.html`, add a button to the tab navigation and a panel:

```html
<!-- In #tab-nav -->
<button class="tab-btn" data-tab="newtool">New Tool</button>

<!-- After the other tab panels -->
<div id="tab-newtool" class="tab-panel" hidden>
  <!-- Your content here -->
</div>
```

Tab switching is handled automatically by the event listeners in `app.js` — any button with `data-tab="x"` will show `#tab-x` and hide all other panels.

### 2. Add Controls (Optional)

If your tab needs header controls (buttons, toggles), add a controls div:

```html
<!-- In #toolbar -->
<div id="newtool-controls" class="tab-controls" hidden>
  <button id="btn-newtool-action" class="btn">Action</button>
</div>
```

The matching `*-controls` div is shown/hidden automatically with the tab.

### 3. Create the JavaScript

Create `newtool.js` and include it in `index.html`:

```html
<script src="newtool.js"></script>
```

Wrap your code in an IIFE to avoid polluting the global scope:

```javascript
"use strict";
(() => {
    // Your tab logic here
})();
```

### 4. Add an API Endpoint (If Needed)

In `DebugServer.cpp`, register a new route inside `DebugServer::Start()`:

```cpp
// For read-only endpoints that touch engine state:
myImpl->svr.Get("/api/newtool", [this](const httplib::Request& req, httplib::Response& res) {
    auto* item = new WorkItem();
    item->work = []() -> std::string {
        // Access engine state here (runs on main thread)
        return "{\"result\": \"...\"}";
    };

    auto future = item->promise.get_future();
    {
        std::lock_guard<std::mutex> lock(myImpl->queueMutex);
        myImpl->workQueue.push(item);
    }

    if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
        res.set_content(future.get(), "application/json");
    } else {
        res.status = 504;
        res.set_content("{\"error\":\"Timeout\"}", "application/json");
    }
});
```

> **Critical:** Any endpoint that reads or modifies engine state (agents, scripts, world) **must** use the work queue. Only static file serving and the SSE endpoint can run directly on the HTTP thread.

---

## Breakpoint Mechanism

### State Machine

The `CAOSMachine` VM has four states:

```
┌─────────────┐   FetchOp+Dispatch   ┌────────────┐
│  stateFetch  │─────────────────▶│ stateBlock │  (wait/over)
└──────┬──────┘                   └─────┬──────┘
       │                              │ UnBlock()
       │ IP in breakpoints            │
       ▼                              ▼
┌───────────────┐              ┌──────────────┐
│stateBreakpoint│              │stateFinished│
└───────┬───────┘              └──────────────┘
        │
        │ DebugContinue()/
        │ DebugStepInto()/
        │ DebugStepOver()
        ▼
┌─────────────┐
│  stateFetch  │  (resumes execution)
└─────────────┘
```

### Data Members

```cpp
// In CAOSMachine (private)
std::set<int> myBreakpoints;    // bytecode IPs to break at
bool myDebugStepOnce = false;   // execute one op then re-enter breakpoint
int  myDebugStepOverDepth = -1; // stack depth threshold for step-over
```

### UpdateVM() Integration

The breakpoint check runs at the **top** of the main dispatch loop, before `FetchOp()`:

1. If `myState == stateBreakpoint` → **break** immediately (VM stays paused).
2. If `myIP` is in `myBreakpoints` and not currently stepping → set `stateBreakpoint`, **break**.
3. If `myDebugStepOnce` is true → clear the flag, execute **one** instruction, then set `stateBreakpoint` and **break**.
4. For step-over: if `myDebugStepOverDepth >= 0` and the current stack depth is greater, keep stepping (set `myDebugStepOnce = true` again) instead of pausing.

When the VM is in `stateBreakpoint`, `UpdateVM()` returns `false` (not finished). The agent’s tick continues normally — the VM is simply paused. On the next tick, `UpdateVM()` is called again, detects `stateBreakpoint`, and immediately returns, keeping the script suspended until a debug command (continue/step) changes the state.

### Debug API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/breakpoint` | Set/clear/clearAll breakpoints on agent VM |
| `POST` | `/api/step/:agentId` | Step one instruction (into or over) |
| `POST` | `/api/continue/:agentId` | Resume execution from breakpoint |
| `GET` | `/api/agent/:id` | Full agent state including source, breakpoints, context |

### Genetics API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/genetics/files` | Lists all `.gen` files available in the world's `GENETICS_DIR` |
| `GET` | `/api/genetics/file/:name` | Parses `dna3` and returns genes plus checksum-backed original/copy/source identity |
| `POST` | `/api/genetics/copy` | Creates a verified source→experimental copy without overwrite |
| `POST` | `/api/genetics/crossover` | Creates a no-overwrite native crossover and records both parents |
| `POST` | `/api/genetics/save` | Create-only first save for a normalized new/import browser draft |
| `POST` | `/api/genetics/save-experiment` | Schema/range/stale-checked transactional save of a verified copy |
| `POST` | `/api/genetics/rename` | Explicit confirmed rename of a checksum-matching verified copy |
| `POST` | `/api/genetics/delete/:name` | Explicit confirmed deletion of a checksum-matching verified copy |
| `POST` | `/api/genetics/inject` | Revalidates one exact saved copy/world review, executes construction, and returns the engine-confirmed agent |

**Thread safety:** All genetics POST operations touch engine state, native
`Genome` operations, files, or `CAOSMachine`; each executes through the
main-thread `WorkItem` queue.

**Data integrity:** Originals are read-only through ordinary and direct API
paths. A `.gxp.json` sidecar is trusted only when its schema, derived filename,
algorithm, and derived checksum match the selected binary. Copy/create install
uses no-overwrite primitives. Derived save validates known layouts and fixed
ranges, checks every recorded source, requires the last-read checksum, and
rolls back the binary if metadata cannot be committed. Injection accepts
identity/checksum review fields rather than browser gene content.
