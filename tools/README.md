# Creatures 3 — Developer Tools

Browser-based developer tools for the Creatures 3 / Docking Station engine, served directly from the `lc2e` binary. No external dependencies — no Node.js, no relay scripts, no separate processes.

![Developer Tools — Log Tab](developer_tools_logs.png)

---

## Quick Start

```bash
# Start the engine with developer tools enabled
./build/lc2e -d "$HOME/Creatures Docking Station/Docking Station" --tools

# Open in your browser:
#   http://localhost:9980
```

The tools server runs on port **9980**. When `--tools` is not passed, the server does not start and there is **zero impact** on engine performance.

### CLI Options

| Flag | Description |
|---|---|
| `--tools` | Start the developer tools server on port 9980 |
| `--tools /path/to/tools` | Override the default tools directory path |

The tools directory is resolved relative to the executable: `<exe_dir>/../tools/`. If this doesn't exist, it falls back to `./tools/` relative to the current working directory. The `--tools /path` form overrides both.

---

## Tabs

The developer tools UI is organized into six tabs, accessible from the header navigation bar. Each tab has a **contextual toolbar** below the header that shows only the controls relevant to the active tab.

**Engine Pause/Play:** The header includes **▶** (play) and **❚❚** (pause) buttons on the right side. These control the global engine simulation — pausing freezes all game ticks (creature AI, physics, timer scripts, agent updates) while keeping the developer tools UI and debug server fully responsive. Useful for inspecting creatures and agents in a frozen state.

### Log

The **Log** tab provides a real-time stream of engine log messages via Server-Sent Events (SSE). It replaces the old `monitor/` + `relay.js` setup with a zero-dependency embedded solution.

**Features:**

- **Live streaming** — log messages appear as the engine produces them, with sub-second latency
- **Category filtering** — toggle visibility by category using the sidebar checkboxes:
  - **Errors** (red) — runtime errors, assertion failures
  - **Shutdown** (orange) — engine shutdown sequence
  - **Network** (blue) — network/socket activity
  - **World** (green) — world loading, saving, creation
  - **CAOS** (purple) — CAOS script activity
  - **Sound** (teal) — audio system messages
  - **Crash** (magenta) — crash reports, signal handlers
  - **Other** (grey) — uncategorized messages
- **Text search** — filter messages by content using the search box
- **Pause / Resume** — temporarily stop rendering new messages; buffered messages are flushed on resume
- **Copy** — copy all visible (filtered) log lines to clipboard
- **Export** — download the entire log history as a `.txt` file
- **Display options:**
  - Timestamps — show/hide relative timestamps
  - Auto-scroll — automatically scroll to the latest message
  - Compact rows — reduce row height for denser viewing

Messages are colour-coded by category with a left border indicator and a category badge (e.g. `ERR`, `NET`, `WRLD`). Error and crash messages also have a tinted background for visibility.

### Console

![Developer Tools — Console Tab](developer_tools_console.png)

The **Console** tab is an interactive CAOS REPL (Read-Eval-Print Loop). It compiles and executes CAOS commands on the engine's main thread and displays the output immediately.

**Usage:**

```
> outs "hello world"
hello world

> outv 2 + 3
5

> setv va00 42
(ok — no output)

> outv va00
42
```

**Features:**

- **Instant execution** — commands are compiled by the `Orderiser` and executed by a fresh `CAOSMachine` on the main thread
- **Command history** — press ↑/↓ to recall previous commands (up to 200 entries)
- **Multi-line input** — press Shift+Enter for multi-line CAOS scripts; Enter alone executes
- **Error display** — compilation errors and runtime errors are shown in red with a `✗` marker
- **Clear output** — the "Clear Output" button in the header resets the console

**Limitations:**

- **No OWNR** — the console has no owner agent. Commands that require `ValidateOwner()` (e.g. `targ ownr`) will throw a runtime error. This matches the behavior of the original Windows CAOS Tool.
- **No blocking commands** — commands like `wait`, `over`, `anim ... over` will throw `sidBlockingDisallowed` because the console script runs to completion in a single call (`UpdateVM(-1)`). Use `inst` mode for enumeration loops.
- **Single execution** — each command runs in a fresh VM instance. Variables (`va00`–`va99`) do not persist between commands.

### Scripts

![Developer Tools — Scripts Tab](developer_tools_scripts.png)

The **Scripts** tab shows a live table of all currently running CAOS scripts across all agents in the world.

**Columns:**

| Column | Description |
|---|---|
| Agent ID | The agent's unique ID (`GetUniqueID()`) |
| Classifier | Family, Genus, Species, Event (e.g. `2 13 100 9`) |
| State | `running`, `blocking` (waiting on `wait`, `over`, etc.), or `paused` (at a breakpoint) |
| IP | Current instruction pointer in the bytecode |
| Current Source | The CAOS source at the current IP, auto-formatted with line breaks and 4-space indentation |

**Features:**

- **Auto-refresh** — the table polls `GET /api/scripts` every 2 seconds by default
- **Manual refresh** — click "Refresh" for an immediate update
- **Toggle auto** — uncheck "Auto" to disable automatic polling
- **Empty state** — when no scripts are running (e.g. no world loaded), a message is shown instead of an empty table

Running scripts are shown with a green badge; blocking scripts with an orange badge; paused scripts (at a breakpoint) with an orange outlined badge tagged ⏸.

### Debugger

![Developer Tools — Debugger Tab](developer_tools_debugger.png)

The **Debugger** tab is an interactive CAOS source-level debugger. A persistent **agent list panel** on the left shows all agents with running scripts, grouped by classifier. Select an agent to see its source code, set breakpoints, and step through execution.

**Agent List Panel:**

- **Classifier grouping** — agents are grouped by their script's Family/Genus/Species (e.g. all `2 13 9` scripts together)
- **Stable sorting** — agents within each group are sorted by ID and stay in fixed positions. Incremental DOM updates prevent flickering
- **Gallery names** — each agent shows its sprite base name (e.g. `balloonbug`, `lift`, `norn`) for quick identification
- **State dots** — colour-coded indicators: green (running), orange (blocking/waiting), orange outlined (paused at breakpoint), grey outlined (finished)
- **Stale agents** — agents whose scripts have finished are greyed out for 5 seconds before being removed
- **Search** — filter agents by ID, gallery name, or classifier using the search box
- **Creature priority** — groups containing creature agents (family 4: Norns, Grendels, Ettins) are sorted to the top
- **Legend** — a compact state dot legend at the bottom of the panel

**Source View:**

- Full CAOS source displayed with line numbers, auto-formatted with line breaks and 4-space indentation
- The current execution position is highlighted in orange
- **Follow toggle** — checkbox in the toolbar to enable/disable auto-scrolling to the current execution line. Uncheck to freely browse the source while the script runs
- **CAOS syntax highlighting** — keywords, numbers, and strings are colour-coded for readability

**Breakpoints:**

- Click any line number to toggle a breakpoint (red marker in the gutter)
- Breakpoints pause the script before executing the instruction at that source position
- All active breakpoints are listed in the inspector panel with remove buttons

**Step Controls:**

- **Continue** — resume execution until the next breakpoint or script completion
- **Step** — execute exactly one CAOS instruction and pause again (step into)
- **Step Over** — step but skip over nested blocks (loops, subroutines)

**Camera Focus:**

- **Focus** button in the toolbar moves the in-game camera to center on the selected agent's position using the `cmrp` CAOS command

**Inspector Panel:**

- **Context** — current values of OWNR, TARG, FROM, IT, and bytecode IP
- **State badge** — shows RUNNING / BLOCKING / PAUSED / FINISHED
- **OV Variables** — displays non-zero OV00–OV99 agent variables
- **VA Variables** — displays non-zero VA00–VA99 local script variables (when paused at a breakpoint)
- **Breakpoint list** — all active breakpoints with remove buttons

**Limitations:**

- Breakpoints are set on bytecode IP addresses (character offsets into the source). The mapping from source lines to IPs uses the `DebugInfo` address map built by the compiler
- Stepping operates at the bytecode instruction level, not at the CAOS source statement level
- Breakpoints are per-agent, not global

### Creatures

The **Creatures** tab is a live inspector for all creature agents (Norns, Grendels, Ettins) in the world. It provides real-time drive levels and biochemistry data for analysing creature behaviour and health.

**Layout:** Three-panel design — creature list sidebar (left), detail panel with sub-tabs (centre), summary card (right).

**Creature List:**

- All creatures in the world, listed with species icon (🐣 Norn, 🦎 Grendel, 🔧 Ettin)
- Creature name shown as primary label (if named), otherwise genus + short moniker
- Life state badge (alert, asleep, dreaming, unconscious, dead, zombie)
- Tiny health bar on each list item
- Click to select and inspect

**Drives Sub-Tab:**

![Developer Tools — Drives View](developer_tools_drives.png)

- 20 horizontal bars for all creature drives (Pain, Hunger, Tiredness, Sex Drive, etc.)
- Colour gradient: green (low) → yellow (mid) → red (high)
- Highest drive highlighted with an orange accent border
- Numeric values displayed alongside each bar

**Chemistry Sub-Tab:**

![Developer Tools — Chemistry View](developer_tools_chemistry.png)

- All 256 biochemical concentrations displayed as colour-coded bars
- Sorted by value (highest first) for quick identification
- "Non-zero only" toggle to filter out inactive chemicals
- ~50 well-known chemicals labelled by name (Glycogen, ATP, ADP, antigens, drives, etc.)
- Colour-coded by category: purple (drives), red (antigens), orange (antibodies), green (smells), blue (general)

**Summary Card:**

- Species icon and genus label
- Creature name (if assigned)
- Moniker, sex, age stage, life state, health percentage
- Position in world, agent ID
- Highest active drive
- Organ status list (functioning / impaired / failed) with life force values

**Toolbar Controls:**

- **Refresh** — manually fetch latest data
- **Auto (2s)** — toggle automatic 2-second polling (enabled by default)

**Brain Sub-Tab:**

![Developer Tools — Brain Monitor](developer_tools_brain_monitor.png)

The **Brain** sub-tab provides a real-time spatial visualization of the creature's neural network, inspired by the original Creatures 3 "Brain in VAT" tool. All lobes are rendered simultaneously on a 2D canvas at their genome-defined positions, giving an immediate overview of what the creature is thinking and how information flows through its brain.

**Spatial Heatmap:**

- All lobes (typically 15 in a C3/DS brain: `noun`, `verb`, `visn`, `comb`, `decn`, `driv`, `attn`, `stim`, `move`, `detl`, `situ`, `resp`, `forf`, `mood`, `smel`) are positioned according to their genome coordinates (`x`, `y`, `width`, `height`)
- Each neuron within a lobe is a coloured cell:
  - **Dark/transparent** = inactive (activity ≈ 0)
  - **Bright orange** = highly active (activity ≈ 1)
- The **winning neuron** (highest activation) in each lobe is highlighted with an orange border and glow
- Lobe names are displayed above each lobe rectangle in a colour derived from the genome colour (darkened for readability)
- The background uses a subtle dot grid to help gauge distances

**Neuron Inspection:**

- **Hover** any neuron cell to see a tooltip with:
  - Lobe name and neuron ID
  - Semantic label (if known): drive names for `driv`, action names for `verb`/`decn`, category names for `noun`/`attn`/`stim`/`visn`
  - Activity level (state 0) and all non-zero SVRule state variables (S1–S7)
- **Click** a neuron to highlight it and see all its incoming/outgoing dendrite connections drawn as magenta lines to connected neurons in other lobes. A magenta circle marks the selected neuron. Click again to dismiss

**Tract Connection Lines:**

- Orange SVG lines connect the centres of lobes that are linked by neural tracts
- Line thickness and opacity are proportional to dendrite count — thicker lines indicate more connections
- **Hover** a tract line to see the tract name and dendrite count
- **Click** a tract line (or click a tract in the sidebar) to fetch its dendrite data and draw individual neuron-to-neuron connections as magenta lines, with opacity based on dendrite weight (heavier = more opaque). Click again to dismiss

**Info Sidebar:**

- **Lobes section** — lists all lobes with neuron count, winning neuron ID, and winning neuron label (e.g. `driv 20n · ★0 Pain` means the Pain drive has the highest output)
- **Tracts section** — lists all tracts with source/destination lobe names and dendrite count
- **Selected Tract** — when a tract is clicked, shows tract name, source → destination, total dendrite count, number of active (non-zero weight) dendrites, and maximum weight
- **Selected Neuron** — when a neuron is clicked, shows lobe name, neuron ID, and semantic label

**Zoom:**

- **Zoom controls** in the top-right corner of the viewport: **−** (zoom out), percentage display, **+** (zoom in), **⟲** (reset to 100%)
- **Ctrl+Scroll** (or ⌘+Scroll on macOS) on the viewport to zoom in/out smoothly
- Zoom range: 40% to 300%
- Zooming re-renders all lobe positions, neuron cells, and tract lines at the new scale — labels scale proportionally

**Auto-Refresh:**

- Brain overview and all lobe neuron states are polled every 2 seconds when the Brain sub-tab is visible
- Dendrite data is fetched **on-demand** only (when clicking a tract or neuron) and is not auto-polled, as tract data can be large
- Switching creatures clears the brain view and loads data for the newly selected creature

### CAOS IDE

![Developer Tools — CAOS IDE](developer_tools_caos_ide.png)

The **CAOS IDE** tab is a lightweight browser-based code editor for writing, editing, running, and managing CAOS scripts directly in the running engine. It provides a scriptorium browser, a syntax-highlighted editor, and an output console.

**Layout:** Three-panel design — scriptorium sidebar (left), code editor with classifier header (centre), output console (bottom).

**Scriptorium Browser (Left Sidebar):**

The sidebar lists all scripts currently installed in the engine's scriptorium — the central registry that holds all CAOS event scripts loaded from `.cos` bootstrap files.

- **Classifier grouping** — scripts are grouped by Family/Genus/Species (e.g. `2 18 16`)
- **Agent names** — each group header shows the human-readable agent name from the catalogue (e.g. "Tuba seed" for `2 3 16`, "Teleporter" for `1 1 152`). Classifiers without catalogue entries show just the number
- **Event labels** — each script entry shows both the event number and a human-readable name: `1` Push, `2` Pull, `9` Timer, `10` Constructor, `12` Eat, etc. (~30 standard events are labelled; unknown events show just the number)
- **Click to load** — clicking a script entry fetches its source from the engine and loads it into the editor with syntax highlighting
- **Collapsible groups** — click a group header to collapse/expand its event list
- **Search** — filter scripts by classifier number, event number, event name, or agent name (e.g. type `teleporter` to find all Teleporter scripts, or `carrot` to find the carrot agent). Multi-word queries match all terms. Groups auto-expand when filtering
- **⟳ Scripts** — toolbar button to manually refresh the scriptorium list

**Code Editor (Centre):**

- **Syntax highlighting** — CAOS keywords, flow control (`doif`, `loop`, `scrp`, `endm`), commands (`setv`, `targ`, `mvto`), variables (`va00`–`va99`, `ov00`–`ov99`), strings, numbers, and comments are colour-coded using the shared `highlightCAOS()` tokenizer
- **Live syntax validation** — editor content is validated against the engine's compiler 500ms after typing stops. On error, a red error bar appears below the header showing the error message with line number, and the gutter highlights the offending line in red. Validation uses `POST /api/validate` which compiles without executing
- **Auto-complete** — press **Ctrl+Space** to show a dropdown of matching CAOS commands at the cursor position, or just type 3+ characters for automatic suggestions. The dropdown shows the command name, type badge (command/integer/float/string/agent/variable), parameter signature, and a brief description. Navigate with ↑↓ arrows, accept with Enter/Tab, dismiss with Escape. The command dictionary is fetched once from `GET /api/caos-commands` and cached in memory
- **Line numbers** — displayed in a gutter on the left; the error line is highlighted red when a syntax error is detected
- **Smart indentation** — the editor behaves like a code editor:
  - **Enter** continues at the same indent level. After a block-opening keyword (`doif`, `elif`, `else`, `enum`, `esee`, `etch`, `epas`, `econ`, `loop`, `reps`, `subr`) the next line is indented one level deeper (4 spaces)
  - **Backspace** in leading whitespace snaps back to the previous tab stop (deletes to the nearest multiple of 4), not one character at a time
  - **Tab** inserts 4 spaces; **Shift+Tab** removes up to 4 leading spaces (dedent)
- **Command help (F1)** — press F1 with the cursor on any CAOS word to show a floating popup with the command name, type, parameter names, and full description. Dismiss with Escape or the ✕ button
- **No external dependencies** — custom editor using a `<textarea>` overlaid with a syntax highlighting `<pre>`, no CodeMirror or Monaco

**Classifier Header:**

Four numeric input fields (Family, Genus, Species, Event) above the editor. These are auto-populated when loading a script from the scriptorium and are used by the Inject and Remove actions.

**Toolbar Actions:**

| Button | Shortcut | Description |
|---|---|---|
| **▶ Run** | Ctrl/⌘+Enter | Executes the editor content as CAOS code via `/api/execute`. Output and errors appear in the output panel. Runs in a fresh VM with no owner agent |
| **Inject** | — | Compiles the editor content and installs it in the scriptorium under the classifier specified in the header fields. Uses the dedicated `/api/scriptorium/inject` endpoint. Strips any existing `scrp`/`endm` wrapper automatically |
| **Remove** | — | Removes the script matching the classifier fields from the scriptorium using `rscr` |
| **Save .cos** | — | Downloads the editor content as a `.cos` file. If a scriptorium script is loaded, the filename reflects the classifier (e.g. `2_18_16_9.cos`) |
| **Load .cos** | — | Opens a file picker to load a `.cos`, `.txt`, or `.caos` file into the editor |
| **⟳ Scripts** | — | Refreshes the scriptorium sidebar |
| **Clear Output** | — | Clears the output panel |

**Output Console (Bottom):**

- Displays execution results from Run, status messages from Inject/Remove/Save/Load, and error messages
- Colour-coded: green `▶` prompt for commands, white for results, red `✗` for errors, muted italic for info messages

**Limitations:**

- **Run** behaves like the Console tab — no OWNR, no blocking commands, single-shot execution
- **Inject** requires the classifier fields to be set. If all four are zero, it shows an error
- **Source availability** — scripts compiled without debug info (e.g. from binary-only worlds) may report "No source available" when loaded
- **Script locking** — if a scriptorium script is currently being executed by an agent, Inject will fail with "script may be locked"
- **Auto-complete positioning** — the dropdown uses approximate font metrics; on non-standard zoom levels the position may drift slightly

---

## API Reference

All API endpoints are served on port 9980 alongside the static files. Endpoints that modify engine state are executed on the main thread via a work queue (see [ARCHITECTURE.md](./ARCHITECTURE.md)).

### `POST /api/execute`

Compile and execute CAOS code. The code runs on the main thread in a fresh `CAOSMachine` with no owner agent.

**Request:**
```json
{ "caos": "outs \"hello\"" }
```

**Response:**
```json
{
  "ok": true,
  "output": "hello",
  "error": ""
}
```

On error (compilation or runtime):
```json
{
  "ok": false,
  "output": "",
  "error": "Invalid command 'foo'"
}
```

**Timeout:** 10 seconds. Returns HTTP 504 if the main thread doesn't process the request in time.

### `GET /api/scripts`

List all currently running CAOS scripts across all agents.

**Response:**
```json
[
  {
    "agentId": 42,
    "family": 2,
    "genus": 13,
    "species": 100,
    "event": 9,
    "state": "running",
    "ip": 156,
    "source": "doif targ <> null",
    "gallery": "balloonbug",
    "agentFamily": 2
  }
]
```

### `GET /api/scriptorium`

List all installed scripts in the scriptorium (the engine's script registry).

**Response:**
```json
[
  { "family": 2, "genus": 13, "species": 100, "event": 9 },
  { "family": 1, "genus": 2, "species": 14, "event": 3 }
]
```

### `GET /api/scriptorium/:f/:g/:s/:e`

Get the source code of a specific scriptorium script by classifier.

**Response (success):**
```json
{ "source": "setv va00 42\noutv va00" }
```

**Response (not found):**
```json
{ "error": "Script not found" }
```

**Timeout:** 5 seconds.

### `POST /api/scriptorium/inject`

Compile CAOS source and install it in the scriptorium under the given classifier. The source should be the script body **without** the `scrp`/`endm` wrapper.

**Request:**
```json
{
  "family": 2,
  "genus": 18,
  "species": 16,
  "event": 9,
  "source": "setv va00 42\noutv va00"
}
```

**Response (success):**
```json
{ "ok": true }
```

**Response (error):**
```json
{ "ok": false, "error": "Failed to install — script may be locked" }
```

**Timeout:** 10 seconds. Uses `Orderiser::OrderFromCAOS()` to compile, `MacroScript::SetClassifier()` to assign the classifier, and `Scriptorium::InstallScript()` to register it.

### `GET /api/agent-names`

Get human-readable agent names for all classifiers in the scriptorium, resolved from `"Agent Help F G S"` catalogue tags.

**Response:**
```json
{
  "2 3 16": "Tuba seed",
  "1 1 152": "Teleporter",
  "2 21 18": "Commedia"
}
```

Keys are `"family genus species"` strings. Only classifiers with matching catalogue entries are included.

**Timeout:** 5 seconds.

### `POST /api/validate`

Compile CAOS code without executing it. Returns success or error details. Used by the IDE for live syntax error highlighting.

**Request:** `Content-Type: application/json`
```json
{ "caos": "setv va00 42\noutv va00" }
```

**Response (ok):**
```json
{ "ok": true }
```

**Response (error):**
```json
{ "ok": false, "error": "Invalid command", "position": 24 }
```

The `position` field is the character offset within the source text (0-indexed), or -1 if unavailable. The IDE maps this to a line number for gutter highlighting.

**Timeout:** 5 seconds. Uses `Orderiser::OrderFromCAOS()` and discards the compiled script.

### `GET /api/caos-commands`

Returns the full CAOS command dictionary for auto-complete. Built from `CAOSDescription::MakeGrandTable()`, sorted alphabetically, and cached after first call.

**Response:**
```json
[
  {
    "name": "SETV",
    "type": "command",
    "params": "variable_name value",
    "description": "Sets the given variable to the given value."
  },
  {
    "name": "POSX",
    "type": "integer",
    "params": "",
    "description": "Returns the X position of TARG."
  }
]
```

Each entry includes the command name, type (command/integer/float/string/agent/variable), parameter help names, and a one-line description (HTML-stripped, truncated to ~150 chars). Undocumented commands are excluded.

**Timeout:** 5 seconds on first call; subsequent calls return from cache without hitting the main thread.

### `GET /api/agent/:id`

Get detailed state about a specific agent, its VM, source code, breakpoints, and context handles. This is the primary endpoint used by the Debugger tab.

**Response:**
```json
{
  "id": 42,
  "family": 2, "genus": 13, "species": 100,
  "running": true, "blocking": false, "paused": true,
  "ip": 156,
  "posx": 5200, "posy": 1300,
  "scriptFamily": 2, "scriptGenus": 13, "scriptSpecies": 100, "scriptEvent": 9,
  "source": "inst\nsetv va00 42\nouts \"hello\"\n...",
  "sourcePos": 24,
  "breakpoints": [156, 200],
  "targ": 67, "ownr": 42, "from": 0, "it": 0,
  "variables": {},
  "vmState": "..."
}
```

### `POST /api/breakpoint`

Set or clear a breakpoint on a specific agent's VM.

**Request:**
```json
{ "agentId": 42, "ip": 156, "action": "set" }
```

`action` must be `"set"`, `"clear"`, or `"clearAll"`. For `"clearAll"`, the `ip` field is ignored.

**Response:**
```json
{ "ok": true, "breakpoints": [156, 200] }
```

### `POST /api/step/:agentId`

Single-step a paused agent. The agent must be in the `paused` state (at a breakpoint).

**Request:**
```json
{ "mode": "into" }
```

`mode` is `"into"` (step one instruction) or `"over"` (step over nested blocks).

**Response:**
```json
{
  "ok": true,
  "ip": 160,
  "paused": true,
  "running": true,
  "blocking": false,
  "sourcePos": 30
}
```

### `POST /api/continue/:agentId`

Resume execution of a paused agent.

**Response:**
```json
{ "ok": true }
```

### `POST /api/pause`

Pause the global engine simulation. All game ticks stop; the debug server and UI remain responsive.

**Response:**
```json
{ "ok": true, "paused": true }
```

### `POST /api/resume`

Resume the global engine simulation.

**Response:**
```json
{ "ok": true, "paused": false }
```

### `GET /api/engine-state`

Query the current engine pause state.

**Response:**
```json
{ "paused": false }
```

### `GET /api/creatures`

List all creature agents (family 4) in the world with drives, life state, and health.

**Response:**
```json
[
  {
    "agentId": 42,
    "moniker": "abc1-def2-...",
    "name": "Alice",
    "genus": 1,
    "species": 1,
    "sex": 2,
    "age": 3,
    "ageInTicks": 12500,
    "lifeState": "alert",
    "health": 0.85,
    "posX": 3400,
    "posY": 2100,
    "drives": [0.1, 0.3, 0.8, "..."],
    "highestDrive": 2
  }
]
```

The `name` field is the creature's given name from its `LinguisticFaculty` (empty string if unnamed). `drives` is an array of 20 float values matching the `driveoffsets` enum order.

### `GET /api/creature/:id/chemistry`

Get all 256 chemical concentrations and organ status for a specific creature.

**Response:**
```json
{
  "chemicals": [0.0, 0.1, "...", 0.72, "..."],
  "organCount": 5,
  "organs": [
    {
      "index": 0,
      "clockRate": 0.5,
      "lifeForce": 0.98,
      "shortTermLifeForce": 0.95,
      "longTermLifeForce": 0.98,
      "energyCost": 0.01,
      "functioning": true,
      "failed": false,
      "receptorCount": 4,
      "emitterCount": 2,
      "reactionCount": 3
    }
  ]
}
```

`chemicals` is a flat array of 256 float values indexed by chemical ID.

**Timeout:** 5 seconds. Returns HTTP 504 on timeout.

### `GET /api/creature/:id/brain`

Get brain overview: all lobes (with neuron labels) and tracts.

**Response:**
```json
{
  "lobes": [
    {
      "index": 0, "name": "verb", "neuronCount": 40, "winner": 4,
      "x": 0, "y": 0, "width": 8, "height": 5,
      "colour": [255, 0, 0],
      "labels": ["Quiescent", "Push", "Pull", "Stop", "Approach", "..."]
    }
  ],
  "tracts": [
    {"index": 0, "name": "vis to attn", "dendriteCount": 160, "srcLobe": "visn", "dstLobe": "attn"}
  ]
}
```

### `GET /api/creature/:id/brain/lobe/:lobeIdx`

Get all neuron states for a specific lobe.

**Response:**
```json
{
  "name": "verb", "neuronCount": 40, "winner": 4,
  "neurons": [
    {"id": 0, "states": [0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]},
    {"id": 1, "states": [0.9, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]}
  ]
}
```

### `GET /api/creature/:id/brain/tract/:tractIdx`

Get dendrite connections and weights for a specific tract. Capped at 1000 dendrites.

**Response:**
```json
{
  "name": "vis to attn", "srcLobe": "visn", "dstLobe": "attn",
  "dendriteCount": 160, "dendritesReturned": 160,
  "dendrites": [
    {"id": 0, "src": 3, "dst": 7, "weights": [0.8, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]}
  ]
}
```

### `GET /api/events`

Server-Sent Events (SSE) endpoint for live log streaming. Connects once and receives a continuous stream of log lines.

**Event format:**
```
data: {"cat":4,"t":1234567,"msg":"World loaded successfully"}

data: {"cat":1,"t":1234890,"msg":"Runtime error in agent 2 13 100"}
```

Each `data:` line contains a JSON object with:
- `cat` — category bitmask (1=error, 2=network, 4=world, 8=caos, 16=shutdown, 32=sound, 64=crash)
- `t` — timestamp in milliseconds since engine start
- `msg` — log message text

---

## Design

The tools UI follows the **"Bright-Fi"** design language — a Utopian Graphic-Core aesthetic with sharp geometric elements, bold contrast, and industrial typography.

- **Colour palette:** Black (`#000`) header and structural borders, warm off-white (`#F2F0EC`) content, hazard orange (`#FF5F00`) primary accent, cyber magenta (`#FF00FF`) secondary accent
- **Typography:** Inter (weight 800–900, ALL-CAPS, wide letter-spacing) for UI labels; JetBrains Mono for code/output
- **Geometry:** All borders are hard 1–2px solid black. No rounded corners. Square dots, not circles
- **Category badges:** solid-fill coloured blocks with white text (e.g. `ERR` on red, `NET` on blue)

---

## Crash Reporter

The engine includes an in-process crash reporter that catches fatal signals (`SIGSEGV`, `SIGBUS`, `SIGABRT`, `SIGFPE`, `SIGILL`, `SIGTRAP`) and prints a demangled stack trace to stderr before exiting. If the developer tools are running, the crash information also appears in the Log tab.