---
name: run-creatures-experiment
description: Run reproducible Creatures Docking Station experiments with a fresh typed world, the canonical four-Norn cohort, MCP monitoring, controlled speed or duration, and a structured report. Use when asked to create an experimental world, inject two male and two female Norns, compare treatments, run an accelerated or timed simulation, monitor population behavior, or preserve a headless world for later GUI inspection.
---

# Run Creatures Experiment

Use a controlled four-Norn fixture and record enough state to make behavioral
experiments comparable. Prefer MCP for all live inspection and control.

## Load Repository Guidance

Before touching a live engine:

1. Read the repository `AGENTS.md`.
2. Read `.agents/skills/caos-mcp/SKILL.md` before writing or executing CAOS.
3. Consult `mcp/MCP.md` for MCP setup and tool behavior.
4. Consult `tools/TOOLS.md` only when the experiment needs developer-tool or
   Genetics Kit details.

Treat game data, genomes, and saved worlds as user data. Never delete or
overwrite them unless the user names the exact target and explicitly requests
it.

## Define the Protocol

Resolve or clearly state these parameters before running:

- world name and world type: default to `undocked`; use `docked` only when the
  experiment requires Creatures 3 content
- game-data directory: default to an isolated copy; use original data only when
  explicitly requested
- treatment and control conditions
- speed, simulated duration, and observation interval
- final save and shutdown requirements

Use separate fresh worlds for treatment and control runs. Reusing a world
introduces age, script, chemical, and random-state differences. Engine behavior
is not strictly deterministic, so describe results as observations rather than
perfectly reproducible outcomes.

## Preflight Safely

1. Confirm the engine build and required game data exist.
2. Confirm the four source genomes exist:
   `norn.astro.48`, `norn.bondi.48`, `norn.harlequin.48`, and
   `norn.zebra.48`.
3. Ensure no other instrumented engine is using port 9980.
4. Check whether the requested world already exists. Choose a unique name or
   stop for confirmation; never silently replace it.
5. Start one engine with MCP enabled. Use headless mode unless visual rendering
   is itself under test.

If the MCP client's `create_world` schema lacks `world_type`, restart or refresh
the MCP adapter. Do not silently substitute direct REST calls.

## Create and Seed the World

1. Create the world through MCP with the selected `world_type`.
2. Confirm the current world, persisted type, tick, pause state, and game speed.
3. Read `tests/caos/inject_four_norns.cos` from the working tree.
4. Verify the standard Norn Meso placement used by the script is present. The
   fixture is intended for a standard Docking Station world, not a minimal map.
5. Execute that exact file through MCP `execute_caos`, or pass it with
   `--run-cos` when startup execution is part of the requested protocol.

Do not maintain a second inline copy of the injector. Its game variable
`c3_test_four_norns_injected` makes it idempotent within one world.

## Verify the Fixture

Pause briefly for a consistent snapshot, then verify:

- exactly four live Norns exist
- two are male and two are female
- their agent IDs, monikers, life stages, positions, and health are recorded
- the injector guard is set
- no CAOS or engine errors occurred

Resume immediately after inspection. Never leave a world paused unintentionally.
If verification fails, stop the run and report the mismatch instead of adding
more creatures.

## Run and Observe

Capture a baseline before applying any treatment: world tick, speed, creature
snapshot, positions, health, life stages, and relevant drives or chemistry.
Record the exact environment variables, options, or CAOS used for treatment.

Prefer engine tick deltas over wall-clock estimates. Use `advance_ticks` for
short controlled trials or set the tick rate for longer accelerated runs.
During long runs:

- check world and population state at the agreed interval
- track deaths, births, movement patterns, repeated actions, and engine errors
- collect treatment-specific measurements without changing unrelated state
- send a concise progress update at least once per minute of real time

Do not intervene unless the protocol permits it. If safety or engine stability
requires intervention, record exactly what changed and when.

## Finish and Report

Take a final snapshot and compare it with baseline. Restore normal speed, ensure
the engine is unpaused, save only when requested, and shut down gracefully with
Ctrl+C. Confirm shutdown completed.

Report:

1. configuration: world name/type, data directory category, build, speed,
   simulated duration, and treatment
2. fixture verification: count, sexes, identities, and injection result
3. observations: timestamp or tick-based timeline and measured behavior
4. final state: survivors, births/deaths, positions, health, and anomalies
5. artifacts: saved world and any logs, without adding proprietary data to Git
6. limitations: randomness, missing telemetry, intervention, or incomplete run
