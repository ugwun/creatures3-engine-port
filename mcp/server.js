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
import { errorResult, readJson, textResult } from "./results.js";

// ── Configuration ──────────────────────────────────────────────────────
// 127.0.0.1 rather than localhost: lc2e binds IPv4 loopback, and Node 18 tries
// the IPv6 address first without falling back.
const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:9980";
// Required only when lc2e runs with --allow-remote-tools on another machine.
const ENGINE_TOKEN = process.env.ENGINE_TOKEN || "";
const AUTH_HEADERS = ENGINE_TOKEN
  ? { Authorization: `Bearer ${ENGINE_TOKEN}` }
  : {};

// ── HTTP helpers ───────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${ENGINE_URL}${path}`, { headers: AUTH_HEADERS });
  return readJson(res, `GET ${path}`);
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res, `POST ${path}`);
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
  "List all creatures (Norns, Grendels, Ettins) in the world with their species, name " +
  "(the player-given HIST NAME; selfWord is the creature's own word for itself), " +
  "life stage, life state, glycogen reserve (chemical 4), and drive levels. drives[] is " +
  "ordered Pain, Hunger (Protein), Hunger (Carb), Hunger (Fat), Coldness, Hotness, " +
  "Tiredness, Sleepiness, Loneliness, Crowdedness, Fear, Boredom, Anger, Sex Drive, " +
  "Comfort, then the navigation drives Up, Down, Exit, Enter, Wait; highestNeedDrive " +
  "ignores the navigation drives. lifeState 'zombie' means ZOMB 1 (riding a lift, " +
  "holding hands), not death. The legacy health field is retained by the API but is " +
  "also glycogen, not an overall health score.",
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
  "Get the full biochemistry of a specific creature — a 256-entry concentrations array " +
  "indexed by raw chemical ID, plus organ life-force and execution state. chemicalNames " +
  "maps chemical IDs to the game's catalogue names; unnamed IDs are omitted.",
  { agentId: z.number().describe("The creature's agent ID (from list_creatures)") },
  async ({ agentId }) => {
    try {
      return textResult(await apiGet(`/api/creature/${agentId}/chemistry`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_creature_observation ───────────────────────────────────────────
server.tool(
  "get_creature_observation",
  "Get one coherent, same-tick observation of a creature: identity, life state, room, " +
  "nearby agents and smell (CA) channels, vision/smell/noun winners, all 20 drives with " +
  "the highest need drive (0-14) and navigation drive (15-19) reported separately, " +
  "attention target, decision winner, and the CAOS state of its current action. " +
  "Use it to answer 'what is this creature doing and why' in one call.",
  { agentId: z.number().describe("The creature's agent ID (from list_creatures)") },
  async ({ agentId }) => {
    try {
      return textResult(await apiGet(`/api/creature/${agentId}/observation`));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_creature_brain ─────────────────────────────────────────────────
server.tool(
  "get_creature_brain",
  "Get the brain overview of a creature — all neural lobes and tracts with neuron counts, " +
  "exact genome/engine geometry, semantic labels, winner indices, and dendrite counts.",
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
  "and semantic label (drive name, action name, etc.) for each neuron. Labels are included " +
  "both in the top-level labels array and on individual neuron records.",
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

// ── get_session_status ─────────────────────────────────────────────────
server.tool(
  "get_session_status",
  "Get one coherent world/session sample: world name and type, ticks, pause state, game speed, creature count, and any pending world switch.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/session"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: HEADLESS OPERATION — World, Creature, Experiment Tools
// ═══════════════════════════════════════════════════════════════════════

// ── list_worlds ────────────────────────────────────────────────────────
server.tool(
  "list_worlds",
  "List all available worlds, the currently loaded world name, and the current world tick.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/worlds"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── create_world ───────────────────────────────────────────────────────
server.tool(
  "create_world",
  "Create a new empty undocked (Docking Station only) or docked (Docking Station plus Creatures 3) world. The world becomes available for loading.",
  {
    name: z.string().describe("Name for the new world"),
    world_type: z.enum(["undocked", "docked"]).optional()
      .describe("World content type; defaults to undocked")
  },
  async ({ name, world_type = "undocked" }) => {
    try {
      return textResult(await apiPost("/api/world/create", { name, world_type }));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── load_world ─────────────────────────────────────────────────────────
server.tool(
  "load_world",
  "Load an existing world by name. The world switch happens on the next engine tick.",
  { name: z.string().describe("Name of the world to load") },
  async ({ name }) => {
    try {
      return textResult(await apiPost("/api/world/load", { name }));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── save_world ─────────────────────────────────────────────────────────
server.tool(
  "save_world",
  "Save the current world state to disk.",
  {},
  async () => {
    try {
      return textResult(await apiPost("/api/world/save"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_world_tick ─────────────────────────────────────────────────────
server.tool(
  "get_world_tick",
  "Get the current world tick count, system tick, and world name.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/world/tick"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── kill_creature ──────────────────────────────────────────────────────
server.tool(
  "kill_creature",
  "Remove a specific creature from the world by its agent ID.",
  { agentId: z.number().describe("The creature's agent ID (from list_creatures)") },
  async ({ agentId }) => {
    try {
      return textResult(await apiPost("/api/creature/kill", { agentId }));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── set_tick_rate ──────────────────────────────────────────────────────
server.tool(
  "set_tick_rate",
  "Change the simulation speed. Set a multiplier (e.g. 5 = 5× speed) or set fastest=true for maximum speed (WOLF mode).",
  {
    multiplier: z.number().optional().describe("Speed multiplier (e.g. 2 = double speed)"),
    fastest: z.boolean().optional().describe("Set to true for maximum speed (WOLF mode)"),
  },
  async ({ multiplier, fastest }) => {
    try {
      const body = {};
      if (fastest) body.fastest = true;
      else if (multiplier) body.multiplier = multiplier;
      else body.multiplier = 1;
      return textResult(await apiPost("/api/engine/tickrate", body));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── advance_ticks ──────────────────────────────────────────────────────
server.tool(
  "advance_ticks",
  "Run exactly N ticks then pause the engine. Useful for stepping through simulation in controlled increments.",
  { ticks: z.number().describe("Number of ticks to advance") },
  async ({ ticks }) => {
    try {
      return textResult(await apiPost("/api/engine/advance", { ticks }));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── get_world_stats ────────────────────────────────────────────────────
server.tool(
  "get_world_stats",
  "Get aggregate world statistics: creature count by species, age/sex distribution, tick count, and engine state.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/world/stats"));
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// ── snapshot_all_creatures ─────────────────────────────────────────────
server.tool(
  "snapshot_all_creatures",
  "Bulk dump of all creature states at the current tick: drives (named in driveLabels), " +
  "glycogen reserve, position, and the top five chemicals with catalogue names. The legacy " +
  "health field is glycogen, not an overall health score. " +
  "More efficient than calling get_creature_chemistry for each creature individually.",
  {},
  async () => {
    try {
      return textResult(await apiGet("/api/creatures/snapshot"));
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
