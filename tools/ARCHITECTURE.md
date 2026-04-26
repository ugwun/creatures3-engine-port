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
│                           │  │ std::deque + CV     │     │    │
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
2. **UDP relay thread** in DebugServer receives packets, pushes them into a `std::deque<std::string>` (the SSE log buffer), protected by `std::mutex` + `std::condition_variable`
3. **SSE handler** (`GET /api/events`) uses httplib's chunked content provider. It blocks on the condition variable waiting for new log lines, then writes `data: ...\n\n` SSE events to the client
4. The browser uses `EventSource("/api/events")` to receive the stream — EventSource automatically reconnects on disconnect

---

## File Structure

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
| [`tools/tooltips.js`](tooltips.js) | Global contextual tooltip system: hover event management, positioning, and native title suppression |
| [`tools/app.js`](app.js) | Log tab: SSE connection, message rendering, filtering, controls, tab switching + lifecycle events |
| [`tools/debugger.js`](debugger.js) | Console tab: CAOS REPL with history, error display |
| [`tools/scripts.js`](scripts.js) | Scripts tab: running scripts table with auto-refresh |
| [`tools/debugger_view.js`](debugger_view.js) | Debugger tab: agent list panel with classifier grouping/search, source view, syntax highlighting, breakpoints, stepping, variable inspector |
| [`tools/creatures.js`](creatures.js) | Creatures tab: creature list polling, drive bar visualization, chemistry chart, summary card, auto-refresh |
| [`tools/brain.js`](brain.js) | Brain sub-tab: spatial heatmap with genome-positioned lobes, neuron activity cells, SVG tract lines, interactive dendrite inspection (click-on-tract, click-on-neuron), zoom controls |
| [`tools/caos_ide.js`](caos_ide.js) | CAOS IDE tab: scriptorium browser, code editor with syntax highlighting overlay, run/inject/remove, file save/load |
| [`tools/docs.js`](docs.js) | Docs tab: Markdown-powered Developer Wiki viewer, internal document routing, and interactive Architecture Graph |
| [`tools/marked.min.js`](marked.min.js) | Vendored Markdown parser used by the Developer Wiki |
| [`tools/genetics.js`](genetics.js) | Genetics Kit tab: genome browser, structural modifiers, inline editor, SV Rule bytecodes, crossover, injection, file ops |
| [`tools/gene_renderer.js`](gene_renderer.js) | Genetics Kit DOM factory: dynamic rendering and layout for all 19 genome subtypes with full editable inputs, SVRule visual grid editor with searchable comboboxes, and client-side byte↔entry parsing |
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

1. `utils.js` — shared `escHtml()` + `DevToolsEvents` event bus (must be first)
2. `caos_format.js` — exposes `formatCAOS()` and `highlightCAOS()` on `window`
3. `tooltips.js` — adds the contextual tooltip system (`window.DevToolsTooltips`)
4. `app.js` — Log tab + tab switching / lifecycle events
5. `debugger.js`, `scripts.js`, `debugger_view.js` — Console, Scripts, Debugger tabs
6. `creatures.js`, `brain.js` — Creatures tab + Brain sub-tab
7. `caos_ide.js` — CAOS IDE tab (depends on `highlightCAOS`, `escHtml`, `DevToolsEvents`)
8. `gene_renderer.js`, `genetics.js` — Genetics Kit tab and DOM renderers

All modules (except `utils.js` and `caos_format.js`) are wrapped in IIFEs `(() => { ... })()` to prevent global scope pollution. Shared functions are either defined at global scope by earlier scripts (`escHtml`, `formatCAOS`, `DevToolsEvents`, `DevToolsTooltips`) or communicated via the event bus.

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
| `creature:selected` | agent ID number | `creatures.js` | `brain.js` |

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
| `GET` | `/api/genetics/file/:moniker` | Reads and parses a binary `.gen` file into a JSON genome object |
| `POST` | `/api/genetics/crossover` | Cross-breeds two genomes dynamically via `Genome::Cross` and saves the child |
| `POST` | `/api/genetics/save` | Serializes a modified JSON genome back into binary and saves it to disk |
| `POST` | `/api/genetics/rename` | Safely renames a genome file on disk (rejects if marked as a CORE file) |
| `POST` | `/api/genetics/delete/:moniker` | Safely deletes a genome file from disk (rejects if marked as a CORE file) |
| `POST` | `/api/genetics/inject` | Serializes, saves, and executes a CAOS injection macro to hatch the creature |

**Thread Safety**: All `POST` operations in the Genetics module (`crossover`, `save`, `rename`, `delete`, `inject`) touch the engine's `GenomeStore`, `Genome` binary operations, file system, and `CAOSMachine` structures. As a result, they use the `WorkItem` queue to block HTTP worker threads and execute strictly on the **main thread**.

**Data Integrity & Security**: `CORE` genome files are strictly immutable in the API and UI to prevent engine corruption. For user-modifiable files, the frontend implements non-destructive in-memory state snapshotting (`_originalStr`) to track and visualise uncommitted edits dynamically via the "Modified Genes" UI.

---

## Future Phases

### ~~Phase 2 — Breakpoints & Stepping~~ ✅ Implemented

See [Breakpoint Mechanism](#breakpoint-mechanism) above.

### ~~Phase 3 — Agent Inspector~~ (Partially Implemented)

- ✅ Agent list panel with classifier grouping, search, gallery names, state dots
- ✅ Camera focus on selected agent (`cmrp`)
- ✅ OV00–OV99 agent variable display
- ✅ VA00–VA99 local variable display (when paused)
- ✅ CAOS syntax highlighting in source view
- [ ] Full agent property browser: position, sprite frame, attributes, timer, velocity

### ~~Phase 3.5 — Creature Inspector~~ ✅ Implemented

- ✅ Creature list with species icons, names, life state badges, health bars
- ✅ Drive levels visualization (20 colour-graded horizontal bars)
- ✅ Chemistry view (256 chemicals, sorted bars, ~50 named, non-zero filter)
- ✅ Summary card (moniker, age, sex, health, organs, highest drive)
- ✅ Creature name display (from LinguisticFaculty)
- ✅ 2-second auto-refresh polling
- ✅ Brain spatial heatmap — all lobes positioned at genome coordinates, neurons as coloured cells
- ✅ Lobe labels with darkened genome colours (RGB→HSL, lightness capped at 35%)
- ✅ Winning neuron highlight (orange border + glow)
- ✅ Semantic neuron labels — drive names (`driv`), action names (`verb`/`decn`), category names (`noun`/`attn`/`stim`/`visn`) from `SensoryFaculty`, `CreatureConstants.h`, `BrainScriptFunctions.h`
- ✅ SVG tract connection lines between lobes (thickness/opacity ∝ dendrite count)
- ✅ Click-on-tract dendrite inspection — magenta neuron-to-neuron lines with weight-based opacity
- ✅ Click-on-neuron connection view — shows all incoming/outgoing dendrites across all tracts
- ✅ Info sidebar — lobe winners, tract summary, selected tract/neuron detail
- ✅ Zoom controls — +/−/reset buttons, Ctrl+scroll, 40–300% range
- ✅ Three brain API endpoints: `/brain` (overview), `/brain/lobe/:idx` (neuron states), `/brain/tract/:idx` (dendrites, capped at 1000)

### Phase 4 — CAOS Profiler

- Surface `DBG: PROF` data with browser visualizations
- Flame charts by agent classifier
- Script execution time heatmaps

### ~~Phase 5 — CAOS IDE~~ ✅ Implemented

- ✅ Scriptorium browser sidebar with classifier grouping and human-readable event labels (~30 standard events)
- ✅ Agent name resolution — sidebar groups show human-readable names from `"Agent Help F G S"` catalogue tags via `GET /api/agent-names`
- ✅ Search/filter by classifier number, event number, event name, or agent name (multi-word)
- ✅ Code editor with syntax highlighting overlay (custom textarea + pre, no external dependencies)
- ✅ Line numbers, tab insertion, Ctrl/Cmd+Enter run shortcut
- ✅ Shared `highlightCAOS()` function in `caos_format.js` (keywords, flow control, commands, variables, strings, numbers, comments)
- ✅ Run via `/api/execute` — fresh VM, output displayed in console panel
- ✅ Inject via dedicated `POST /api/scriptorium/inject` — compiles with `OrderFromCAOS`, installs with `InstallScript`
- ✅ Remove via `rscr` CAOS command
- ✅ Save/Load `.cos` files
- ✅ `GET /api/scriptorium/:f/:g/:s/:e` endpoint for fetching individual script source
- ✅ Classifier header fields auto-populated from loaded scripts
- ✅ Output console with colour-coded results, errors, and info messages

### ~~Phase 6 — Genetics Editor~~ ✅ Implemented

- ✅ Fetch and parse `.gen` files directly from disk to JSON
- ✅ Browse `.gen` library with string-based moniker search filtering
- ✅ Real-time structural chromosome editing (Move Up, Move Down, Add, Duplicate, Delete)
- ✅ Inline property editing for thresholds, clock rates, coordinates, parameters, and flags, including custom searchable comboboxes for engine-synchronized chemical selections
- ✅ Visual 16-row SVRule grid editor with searchable Bright-Fi comboboxes for opcodes, operands, and chemical values, with real-time human-readable display sync
- ✅ Deep-search text filtering matching numerical properties housed inside DOM inputs
- ✅ File lifecycle management (New template, Save to engine, Export to browser, Import from browser)
- ✅ Engine cross-breeding algorithms directly wired to the API
- ✅ Full creature injection pipeline integrated to standard CAOS hatching macros

### ~~Phase 7 — Developer Documentation~~ ✅ Implemented

- ✅ Internal Developer Wiki using `marked.min.js` to render Markdown documents dynamically
- ✅ Zero-reload client-side routing and file fetching from `tools/docs/index.json`
- ✅ Auto-generated, scrollable Table of Contents synced to current page headers
- ✅ Internal Markdown link interception mapping file paths into Wiki page loads
- ✅ Sub-view architecture splitting Wiki documentation and interactive C++ Architecture Graph
- ✅ Image constraint and custom styling to maintain "Bright-Fi" high-contrast aesthetic
