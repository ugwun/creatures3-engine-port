# Task 03 — Add the World and Session Status Ribbon

Status: Completed

Depends on: Task 01

## Goal

Make the active simulation context visible at all times so a user cannot
mistake which world, tick, speed, or pause state they are observing or
modifying.

## User problem

The current header shows connection and icon-only play/pause controls, but not
the world name, world type, tick, speed, sample freshness, or load transition.
This is especially risky when CAOS, Syringe, Genetics, save/load, or MCP tools
can mutate persistent state.

The Log tab also has its own Pause action, making “pause” ambiguous between the
log stream and the simulation.

## Required ribbon

The persistent ribbon should show:

- current world name;
- undocked or docked world type when known;
- Running, Paused, Loading, Disconnected, or No World;
- game speed;
- world tick;
- creature count summary;
- age of the last successful status sample;
- active experiment/recording marker when applicable;
- a clear indication when data belongs to the previous world during loading.

Example:

```text
DevTools Audit 20260725 · Undocked · Running ×1 · Tick 17,578
4 creatures · updated 0.4s ago
```

## Interaction requirements

- Use text and icons together for simulation state.
- Rename Log Pause to **Pause stream**.
- Name the global action **Pause simulation**.
- Do not imply a paused browser stream pauses the world.
- During a deferred world load, show the requested world and retain a visible
  “switch pending” state until the engine confirms it.
- Clicking the world name opens the future World workspace or an interim
  status popover.
- Speed changes require an explicit control and visible result.

## Technical direction

- Consume the shared state model from Task 01.
- Use existing world, tick, engine-state, speed, and stats endpoints where
  possible.
- Add world type or status fields to a structured endpoint if the browser
  cannot obtain them accurately.
- Centralize status polling and let other panels subscribe.
- Use a slower background cadence when the tab is not focused, except during
  active recording.

## Documentation and in-product guidance

- Document every ribbon field, its unit/source, update cadence, and the
  difference between engine pause, stream pause, and disconnection.
- Add contextual tips for world type, world tick, game speed, sample age, and
  freshness warnings.
- Update launch and connection guidance for `--tools`, `--mcp`, and headless
  sessions where the ribbon behaviour differs.
- Remove ambiguous “paused” or “offline” guidance that does not say which layer
  stopped.

## Deliverables

- Persistent ribbon in the global shell.
- Clear simulation and log-stream control labels.
- Loading, stale, disconnected, and no-world states.
- Status popover with exact ticks and endpoint freshness.
- Documentation and tooltip updates.
- Focused UI and API tests.

## Acceptance criteria

- The active world is visible on every main tab and creature subview.
- Running and Paused are understandable without interpreting icon color.
- Log stream pause cannot be confused with simulation pause.
- A world switch never displays new-world data under the old-world name.
- Stale state is visible after failed polling.
- The ribbon remains usable at narrow widths without hiding world identity or
  pause state.
- The status request is shared rather than duplicated by each tab.

## Verification

- Start with no world, load an undocked world, switch to a docked world, and
  observe all transitional states.
- Pause and resume from both the browser and MCP.
- Change speed and confirm the ribbon follows engine truth.
- Disconnect the server and confirm the last state becomes visibly stale.
- Capture narrow, standard, and wide screenshots.

## Out of scope

- Full world creation and experiment branching.
- The ecology map.
- Historical world statistics.
