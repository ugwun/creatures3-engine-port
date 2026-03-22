#!/usr/bin/env node
// -------------------------------------------------------------------------
// Creatures 3 / Docking Station — MCP Server
//
// A Model Context Protocol server that exposes the lc2e engine's REST API
// as MCP tools. The engine must be running with --mcp or --tools flag.
//
// Usage:
//   node server.js                  # default: http://localhost:9980
//   ENGINE_URL=http://host:9980 node server.js
// -------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Configuration ──────────────────────────────────────────────────────
const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:9980";

// ── HTTP helpers ───────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${ENGINE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

function textResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

// ── MCP Server ─────────────────────────────────────────────────────────
const server = new McpServer({
  name: "creatures3-engine",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════════

// ── execute_caos ───────────────────────────────────────────────────────
server.tool(
  "execute_caos",
  "Execute CAOS code on the Creatures engine and return the output. " +
  "CAOS is the scripting language of the Creatures engine. " +
  "Use 'outv' to print integers/floats, 'outs' to print strings. " +
  "Example: 'outs \"hello\"' or 'setv va00 0 enum 4 0 0 addv va00 1 next outv va00'. " +
  "Commands are case-insensitive. Multiple commands can be chained on one line.",
  { caos: z.string().describe("CAOS code to execute") },
  async ({ caos }) => {
    try {
      const result = await apiPost("/api/execute", { caos });
      if (!result.ok) return errorResult(result.error || "CAOS execution failed");
      return textResult(result.output || "(no output)");
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── list_creatures ─────────────────────────────────────────────────────
server.tool(
  "list_creatures",
  "List all creatures (Norns, Grendels, Ettins) in the world with their species, name, " +
  "health, life stage, and top drive levels.",
  {},
  async () => {
    try {
      const creatures = await apiGet("/api/creatures");
      if (!creatures || creatures.length === 0) return textResult("No creatures in the world.");
      return textResult(creatures);
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_creature_chemistry ─────────────────────────────────────────────
server.tool(
  "get_creature_chemistry",
  "Get the full biochemistry of a specific creature — all 256 chemical concentrations. " +
  "Returns chemical ID, name, and concentration for each non-zero chemical.",
  { agentId: z.number().describe("The creature's agent ID (from list_creatures)") },
  async ({ agentId }) => {
    try {
      return textResult(await apiGet(`/api/creature/${agentId}/chemistry`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_creature_brain ─────────────────────────────────────────────────
server.tool(
  "get_creature_brain",
  "Get the brain overview of a creature — all neural lobes and tracts with neuron counts, " +
  "geometry, and aggregate activity.",
  { agentId: z.number().describe("The creature's agent ID (from list_creatures)") },
  async ({ agentId }) => {
    try {
      return textResult(await apiGet(`/api/creature/${agentId}/brain`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_brain_lobe ─────────────────────────────────────────────────────
server.tool(
  "get_brain_lobe",
  "Get detailed neuron states for a specific brain lobe — activity level, winner state, " +
  "and semantic label (drive name, action name, etc.) for each neuron.",
  {
    agentId: z.number().describe("The creature's agent ID"),
    lobeIndex: z.number().describe("Lobe index (from get_creature_brain)"),
  },
  async ({ agentId, lobeIndex }) => {
    try {
      return textResult(await apiGet(`/api/creature/${agentId}/brain/lobe/${lobeIndex}`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_brain_tract ────────────────────────────────────────────────────
server.tool(
  "get_brain_tract",
  "Get dendrite connections for a specific brain tract. Returns source/destination neuron " +
  "pairs with synaptic weights. Capped at 1000 dendrites.",
  {
    agentId: z.number().describe("The creature's agent ID"),
    tractIndex: z.number().describe("Tract index (from get_creature_brain)"),
  },
  async ({ agentId, tractIndex }) => {
    try {
      return textResult(await apiGet(`/api/creature/${agentId}/brain/tract/${tractIndex}`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── list_scripts ───────────────────────────────────────────────────────
server.tool(
  "list_scripts",
  "List all currently running CAOS scripts across all agents. Shows agent ID, " +
  "script classifier (family/genus/species/event), execution state " +
  "(running/blocking/paused), and current source line.",
  {},
  async () => {
    try {
      const scripts = await apiGet("/api/scripts");
      if (!scripts || scripts.length === 0) return textResult("No scripts currently running.");
      return textResult(scripts);
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── list_scriptorium ───────────────────────────────────────────────────
server.tool(
  "list_scriptorium",
  "List all installed scripts in the scriptorium — the engine's script registry. " +
  "Shows classifier (family, genus, species, event) for each installed script.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/scriptorium"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_agent ──────────────────────────────────────────────────────────
server.tool(
  "get_agent",
  "Get full details about a specific agent: classifier, VM state, CAOS source code, " +
  "breakpoints, context handles (TARG/OWNR/FROM/IT), OV00-OV99 variables, " +
  "and VA00-VA99 local variables.",
  { agentId: z.number().describe("The agent's unique ID") },
  async ({ agentId }) => {
    try {
      const agent = await apiGet(`/api/agent/${agentId}`);
      if (agent.error) return errorResult(agent.error);
      return textResult(agent);
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── set_breakpoint ─────────────────────────────────────────────────────
server.tool(
  "set_breakpoint",
  "Set, clear, or clear all breakpoints on a specific agent's CAOS virtual machine.",
  {
    agentId: z.number().describe("The agent's unique ID"),
    action: z.enum(["set", "clear", "clearAll"]).describe("Breakpoint action"),
    ip: z.number().optional().describe("Bytecode instruction pointer (for set/clear)"),
  },
  async ({ agentId, action, ip }) => {
    try {
      return textResult(await apiPost("/api/breakpoint", { agentId, action, ip: ip || 0 }));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── step_agent ─────────────────────────────────────────────────────────
server.tool(
  "step_agent",
  "Step a paused agent's CAOS VM by one instruction. The agent must be at a breakpoint.",
  {
    agentId: z.number().describe("The agent's unique ID"),
    mode: z.enum(["into", "over"]).optional().describe("Step mode (default: 'into')"),
  },
  async ({ agentId, mode }) => {
    try {
      return textResult(await apiPost(`/api/step/${agentId}`, { mode: mode || "into" }));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── continue_agent ─────────────────────────────────────────────────────
server.tool(
  "continue_agent",
  "Resume a paused agent's CAOS VM from a breakpoint.",
  { agentId: z.number().describe("The agent's unique ID") },
  async ({ agentId }) => {
    try {
      return textResult(await apiPost(`/api/continue/${agentId}`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── pause_engine ───────────────────────────────────────────────────────
server.tool(
  "pause_engine",
  "Pause the entire engine simulation. The game world freezes but the API " +
  "remains responsive for queries.",
  {},
  async () => {
    try {
      return textResult(await apiPost("/api/pause"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── resume_engine ──────────────────────────────────────────────────────
server.tool(
  "resume_engine",
  "Resume the engine simulation after pausing.",
  {},
  async () => {
    try {
      return textResult(await apiPost("/api/resume"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_engine_state ───────────────────────────────────────────────────
server.tool(
  "get_engine_state",
  "Check whether the engine is currently paused or running.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/engine-state"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[creatures3-mcp] Server started, engine at ${ENGINE_URL}`);
}

main().catch((err) => {
  console.error("[creatures3-mcp] Fatal error:", err);
  process.exit(1);
});
