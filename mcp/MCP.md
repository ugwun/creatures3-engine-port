# Creatures 3 Engine — MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI agents **direct access to the running Creatures 3 / Docking Station engine**. The AI can execute CAOS commands, inspect creature biochemistry and neural activity, debug running scripts, and control the simulation — all through the standardised MCP tool interface.

## How It Works

```
┌──────────────┐      stdio (JSON-RPC)      ┌───────────────┐      HTTP REST       ┌──────────────┐
│   AI Agent   │ ◄─────────────────────────► │  MCP Server   │ ◄──────────────────► │  lc2e engine │
│  (Antigrav)  │   Model Context Protocol    │  (server.js)  │   localhost:9980     │   (--mcp)    │
└──────────────┘                             └───────────────┘                      └──────────────┘
```

The MCP server is a lightweight Node.js adapter that translates MCP tool calls into HTTP requests to the engine's `DebugServer` REST API. It runs as a subprocess spawned by the MCP client, communicating via stdin/stdout JSON-RPC. The engine must be running with `--mcp` or `--tools` to expose the API.

All engine state access is thread-safe: API requests are queued by the `DebugServer` and executed on the main engine thread via a work queue + future pattern (see [`tools/ARCHITECTURE.md`](../tools/ARCHITECTURE.md) for details).

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

The MCP server uses **stdio transport** — the MCP client spawns it as a subprocess and communicates via stdin/stdout.

#### Antigravity (Google)

Edit `.gemini/antigravity/mcp_config.json` (click "Open MCP Config" in the MCP Servers panel):

```json
{
  "mcpServers": {
    "creatures3": {
      "command": "node",
      "args": ["/absolute/path/to/creatures3/mcp/server.js"],
      "env": {
        "ENGINE_URL": "http://localhost:9980"
      }
    }
  }
}
```

Then click **Refresh** in the MCP Servers panel. The `creatures3` server should appear with 25 tools.

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "creatures3": {
      "command": "node",
      "args": ["/absolute/path/to/creatures3/mcp/server.js"],
      "env": {
        "ENGINE_URL": "http://localhost:9980"
      }
    }
  }
}
```

#### Other MCP Clients

Any MCP client that supports stdio transport can connect. The server expects:
- **Command:** `node`
- **Args:** `["/path/to/creatures3/mcp/server.js"]`
- **Environment:** `ENGINE_URL=http://localhost:9980` (optional — defaults to `http://localhost:9980`)

---

## Available Tools (25)

### CAOS Execution

| Tool | Description |
|---|---|
| `execute_caos` | Execute arbitrary CAOS code and return the output. Use `outv` for integers/floats, `outs` for strings. Multiple commands can be chained. This is the most powerful tool — CAOS can read/write nearly any engine state. |

### Creature Inspection

| Tool | Description |
|---|---|
| `list_creatures` | List all creatures (Norns, Grendels, Ettins) with species, name, health, life stage, position, and drive levels |
| `get_creature_chemistry` | Get all 256 biochemical concentrations for a creature, plus organ health/status |
| `get_creature_brain` | Overview of a creature's brain — all lobes and tracts with neuron counts, geometry, and aggregate activity |
| `get_brain_lobe` | Detailed neuron states for a specific lobe — activity level, winner state, and semantic labels (drive names, action names, etc.) |
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

### World Management

| Tool | Description |
|---|---|
| `list_worlds` | List all available worlds, current world name, and world tick |
| `create_world` | Create a new empty world with the given name |
| `load_world` | Load an existing world by name (world switches on next tick) |
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
| `snapshot_all_creatures` | Bulk dump of all creature states (drives, health, position, top 5 chemicals) |

---

## Example Usage (by an AI agent)

Once connected, an AI agent can interact with the game naturally:

**"How many creatures are in the world?"**
→ Agent calls `list_creatures` → gets a JSON array of all creatures with health, drives, etc.

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
| `ENGINE_URL` | `http://localhost:9980` | Base URL of the engine's API server |

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
| `README.md` | This file |
| `.gitignore` | Excludes `node_modules/` |

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
