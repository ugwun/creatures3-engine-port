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

The developer tools UI is organized into five tabs, accessible from the header navigation bar. Each tab has a **contextual toolbar** below the header that shows only the controls relevant to the active tab.

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