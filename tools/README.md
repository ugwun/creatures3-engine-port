# Creatures 3 — Developer Tools

Browser-based developer tools for the Creatures 3 / Docking Station engine, served directly from the `lc2e` binary. No external dependencies — no Node.js, no relay scripts, no separate processes.

<!-- TODO: Add screenshot of the full developer tools UI here -->

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

The developer tools UI is organized into four tabs, accessible from the header navigation bar. Each tab has a **contextual toolbar** below the header that shows only the controls relevant to the active tab.

### Log

<!-- TODO: Add screenshot of the Log tab here -->

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

<!-- TODO: Add screenshot of the Console tab here -->

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

<!-- TODO: Add screenshot of the Scripts tab here -->

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

The **Debugger** tab is an interactive CAOS source-level debugger. Select a running agent to see its script source code, set breakpoints, and step through execution one instruction at a time.

**Features:**

- **Agent selector** — dropdown in the toolbar lists all agents with running scripts. Select one to load its source code and VM state.
- **Source view** — full CAOS source displayed with line numbers on a dark background, auto-formatted with line breaks and 4-space indentation. The current execution position is highlighted in orange.
- **Breakpoints** — click any line number to toggle a breakpoint (red marker). Breakpoints pause the script before executing the instruction at that source position.
- **Step controls:**
  - **Continue** — resume execution until the next breakpoint or script completion
  - **Step** — execute exactly one CAOS instruction and pause again (step into)
  - **Step Over** — step but skip over nested blocks (loops, subroutines) by running until the stack depth returns to the original level
- **Context inspector** — right-hand panel showing the current values of OWNR, TARG, FROM, IT, and the bytecode IP
- **State badge** — shows RUNNING / BLOCKING / PAUSED / FINISHED
- **Breakpoint list** — sidebar showing all active breakpoints with remove buttons

**Limitations:**

- Breakpoints are set on bytecode IP addresses (character offsets into the source). The mapping from source lines to IPs uses the `DebugInfo` address map built by the compiler.
- Stepping operates at the bytecode instruction level, not at the CAOS source statement level. Some CAOS statements compile to multiple bytecode operations.
- Breakpoints are per-agent, not global. Setting a breakpoint on one agent does not affect other agents running the same script.

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
    "source": "doif targ <> null"
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