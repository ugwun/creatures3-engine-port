# Creatures 3 Engine — MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI agents **direct access to the running Creatures 3 / Docking Station engine**. The AI can execute CAOS commands, inspect creature biochemistry and neural activity, debug running scripts, and control the simulation — all through the standardised MCP tool interface.

## How It Works

```
┌──────────────┐      stdio (JSON-RPC)      ┌───────────────┐      HTTP REST       ┌──────────────┐
│   AI Agent   │ ◄─────────────────────────► │  MCP Server   │ ◄──────────────────► │  lc2e engine │
│  (any MCP)   │   Model Context Protocol    │  (server.js)  │   localhost:9980     │   (--mcp)    │
└──────────────┘                             └───────────────┘                      └──────────────┘
```

The MCP server is a lightweight Node.js adapter that translates MCP tool calls into HTTP requests to the engine's `DebugServer` REST API. It runs as a subprocess spawned by the MCP client, communicating via stdin/stdout JSON-RPC. The engine must be running with `--mcp` or `--tools` to expose the API.

All engine state access is thread-safe: API requests are queued by the `DebugServer` and executed on the main engine thread via a work queue + future pattern (see the `developer-tools` skill in `.agents/skills/` for details).

---

## Prerequisites

- **Node.js** ≥ 18
- **The engine** built and running with `--mcp` or `--tools`

---

## Setup

### 1. Install dependencies

```bash
cd mcp
npm install
```

### 2. Start the engine with MCP support

```bash
# API-only mode (for AI agents — no browser UI):
./build/lc2e -d "$HOME/Creatures Docking Station/Docking Station" --mcp

# Or with full developer tools AND AI access:
./build/lc2e -d "$HOME/Creatures Docking Station/Docking Station" --tools
```

Both `--mcp` and `--tools` expose the same REST API on port 9980. The difference is that `--tools` additionally serves the browser-based developer tools UI from the `tools/` directory. You can use either flag — the MCP server works with both.

### 3. Configure your MCP client

The adapter uses **stdio transport**: the client spawns it as a subprocess and
talks JSON-RPC over stdin/stdout.

The repository root contains `.mcp.json`, which Claude Code (and other clients
that read that file) picks up automatically when opened in this directory.
It runs `node mcp/server.js` with `ENGINE_URL=http://127.0.0.1:9980`.

Any other MCP client with stdio support needs the equivalent:

- **Command:** `node`
- **Args:** `["/absolute/path/to/repo/mcp/server.js"]`
- **Environment:** `ENGINE_URL=http://127.0.0.1:9980` (optional, the default)
  and `ENGINE_TOKEN` only for an engine started with `--allow-remote-tools`

After the client refreshes, the `creatures3` server exposes 25 tools.

---

## Available Tools (25)

### CAOS Execution

| Tool | Description |
|---|---|
| `execute_caos` | Execute arbitrary CAOS code and return the output. Use `outv` for integers/floats, `outs` for strings. Multiple commands can be chained. This is the most powerful tool — CAOS can read/write nearly any engine state. |

### Creature Inspection

| Tool | Description |
|---|---|
| `list_creatures` | List all creatures with species, name, life stage/state, glycogen reserve (chemical 4), position, and drive levels. Legacy `health` is also glycogen, not overall health |
| `get_creature_chemistry` | Get all 256 biochemical concentrations for a creature, plus organ life-force/execution state |
| `get_creature_brain` | Overview of a creature's brain — all lobes and tracts with neuron counts, exact genome geometry, semantic labels, winner indices, and dendrite counts |
| `get_brain_lobe` | Detailed neuron states with semantic labels both in a top-level array and on each neuron record |
| `get_brain_tract` | Dendrite connections for a specific tract — source/destination neuron pairs with synaptic weights (capped at 1000) |

### Agent & Script Inspection

| Tool | Description |
|---|---|
| `list_scripts` | List all currently running CAOS scripts — agent ID, script classifier, execution state (running/blocking/paused), current source line |
| `list_scriptorium` | List all installed scripts in the scriptorium — the engine's script registry |
| `get_agent` | Full details about an agent: classifier, VM state, CAOS source code, breakpoints, context handles (TARG/OWNR/FROM/IT), OV00–OV99 variables, VA00–VA99 locals |

### Debugging

| Tool | Description |
|---|---|
| `set_breakpoint` | Set, clear, or clear all breakpoints on an agent's CAOS VM. Actions: `set`, `clear`, `clearAll` |
| `step_agent` | Step a paused agent's VM by one instruction. Modes: `into` (default) or `over` |
| `continue_agent` | Resume a paused agent's VM from a breakpoint |

### Engine Control

| Tool | Description |
|---|---|
| `pause_engine` | Pause the entire simulation. The world freezes but the API remains responsive for queries |
| `resume_engine` | Resume the simulation after pausing |
| `get_engine_state` | Check whether the engine is currently paused or running |
| `get_session_status` | Get a coherent world/session sample including world type, ticks, pause state, speed, creature count, and pending switch |

### World Management

| Tool | Description |
|---|---|
| `list_worlds` | List all available worlds, current world name, and world tick |
| `create_world` | Create a new empty world; optional `world_type` is `undocked` (default, DS only) or `docked` (DS + C3) |
| `load_world` | Load an existing world by name and apply its persisted world type (world switches on next tick) |
| `save_world` | Save the current world state to disk |
| `get_world_tick` | Get current world tick, system tick, and world name |

### Creature Lifecycle

| Tool | Description |
|---|---|
| `kill_creature` | Remove a specific creature from the world by agent ID |

### Experiment Control

| Tool | Description |
|---|---|
| `set_tick_rate` | Change simulation speed (multiplier or WOLF fastest mode) |
| `advance_ticks` | Run exactly N ticks then pause — for controlled stepping |
| `get_world_stats` | Aggregate stats: creature count by species, age/sex distribution, engine state |
| `snapshot_all_creatures` | Bulk dump of all creature states (drives, glycogen reserve, position, top 5 chemicals) |

---

## Example Usage (by an AI agent)

Once connected, an AI agent can interact with the game naturally:

**"How many creatures are in the world?"**
→ Agent calls `list_creatures` → gets a JSON array of all creatures with glycogen reserve, drives, life stage, and life state.

**"What is this Norn's highest drive?"**
→ Agent calls `list_creatures`, reads the `highestDrive` field and `drives` array.

**"Check this creature's brain activity"**
→ Agent calls `get_creature_brain` → gets lobes/tracts overview → calls `get_brain_lobe` for specific lobe details.

**"Run a CAOS command to count all agents"**
→ Agent calls `execute_caos` with `"setv va00 0 enum 4 0 0 addv va00 1 next outv va00"` → gets the count.

**"Pause the game, inspect, then resume"**
→ Agent calls `pause_engine`, then `list_creatures` / `get_creature_chemistry`, then `resume_engine`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ENGINE_URL` | `http://127.0.0.1:9980` | Base URL of the engine's API server |
| `ENGINE_TOKEN` | none | Token for an engine started with `--allow-remote-tools` on another machine. Local engines need none. |

---

## Testing the Server

### Manual handshake test

```bash
# Send an MCP initialize message (newline-delimited JSON):
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node server.js 2>/dev/null
```

Expected response (newline-delimited JSON):
```json
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"creatures3-engine","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

### Verify no unwanted files are tracked

```bash
cd mcp && git status
# Should NOT show node_modules/ (covered by .gitignore)
```

---

## File Structure

| File | Purpose |
|---|---|
| `server.js` | MCP server — 25 tools wrapping the engine REST API, stdio transport |
| `package.json` | Node.js package definition (depends on `@modelcontextprotocol/sdk`) |
| `MCP.md` | This file |

---

## Relationship to Developer Tools

The MCP server and the browser-based developer tools are **independent but share the same API backend**:

| Feature | `--tools` | `--mcp` | Both |
|---|---|---|---|
| REST API on port 9980 | ✅ | ✅ | ✅ |
| Browser UI at `http://localhost:9980` | ✅ | ❌ | ✅ |
| MCP stdio server | (needs `mcp/server.js`) | (needs `mcp/server.js`) | (needs `mcp/server.js`) |
| SSE log stream | ✅ | ✅ | ✅ |

The MCP server always connects to the API at `ENGINE_URL`; it doesn't matter whether the engine was started with `--tools` or `--mcp`.

## Observatory Scope and Limitations

The MCP adapter exposes the focused 25-tool engine surface listed above. It
shares the REST backend and biological terminology with the browser, but it
does not expose every browser Observatory workflow or narrow reviewed-change
endpoint.

In particular, the browser currently owns the shared selection/time context,
Observation Strip, Timeline, cohort comparison, Ecology workspace, experiment
manifest recorder, Architecture graph, contextual help, and accessible
alternatives. The adapter also has no dedicated wrapper for safe chemical
intervention, copy-first genetics, reviewed CAOS validation/evaluation, or
checksum-bound exact-event script management. Those contracts are available
through the documented REST API and browser workflow, but should not be
silently reconstructed with a generic tool call.

`execute_caos` is deliberately powerful and can mutate almost any reachable
engine state. Using it can bypass browser previews, stale-target checks,
copy-first rules, duplicate-submit prevention, and provenance records. Read
the repository's `caos-mcp` skill before writing CAOS; prefer dedicated
read-only MCP inspection tools, and use an isolated world for any deliberate
change.

MCP clients should preserve the same evidence boundary as the browser:
endpoint values are **Observed**, calculations are **Derived**, interpretations
are **Inferred**, and inadequately sourced values are **Unknown**. The legacy
`health` property returned by creature listings is glycogen reserve (chemical
4), not overall health. A successful MCP call does not prove why a creature
acted.

Browser and MCP support are capability-based rather than inferred from
connectivity alone. Check `get_session_status`, stable subject identity, and
the relevant response fields before an operation. See the browser's
[API reference](../tools/docs/api_reference.md) and
[migration boundary](../tools/docs/observatory_migration_and_rollback.md).

---

## Engine-Side Implementation

The `--mcp` flag is handled in `engine/Display/SDL/SDL_Main.cpp`:

1. **Flag parsing:** `--mcp` sets `enableMCP = true`
2. **Server start:** Either `--tools` or `--mcp` starts the `DebugServer` — `--tools` with static file serving, `--mcp` without
3. **Polling:** `DebugServer::Poll()` is called every game tick to drain the work queue
4. **Shutdown:** `DebugServer::Stop()` is called on engine exit

The `DebugServer` class (`engine/DebugServer.h`) has two `Start()` overloads:
- `Start(port, staticDir)` — full mode with browser UI (used by `--tools`)
- `Start(port)` — API-only mode (used by `--mcp`)
