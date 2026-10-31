# World and Session Status

The persistent header ribbon identifies the simulation context behind every
Developer Tools view. It uses one shared `GET /api/session` sample, so tabs do
not maintain competing ideas of the active world, pause state, speed, or tick.

Click anywhere on the ribbon to open exact session details and the explicit
speed control. Click outside the popover, press Escape, or use its close button
to dismiss it.

![World and session ribbon with its status popover open in Firefox](/docs/images/observatory/session-status-ribbon-firefox.png)

The screenshot shows a confirmed docked world running at normal speed. The
popover is anchored below the persistent ribbon and reports the exact values
behind its compact summary.

## Field reference

| Ribbon field | Meaning | Source and unit |
|---|---|---|
| World | Confirmed active world; while a switch is pending, the requested world is shown and the previous world remains named | `worldName` and `requestedWorldName` from `GET /api/session` |
| World type | `Undocked`, `Docked`, or `Startup` when known | Loaded-world metadata represented by `worldType` |
| State | `Running`, `Paused`, `Loading`, `Disconnected`, or `No World` | Engine pause state, API connection state, and world transition |
| Speed | Engine tick-rate multiplier such as `×1` or `×4` | `gameSpeed`; dimensionless multiplier |
| Tick | Current world tick | `worldTick`; primary simulation timebase |
| Creatures | Number of creature agents currently present | `creatureCount` |
| Activity | Active recording and named experiment, when present | Shared observatory recording/experiment state |
| Updated | Browser wall-time age since the last successful response | Derived from the sample's capture time |

The details popover additionally shows the confirmed active world's type, the
system tick, exact capture time, source endpoint, API connection, and any
pending-world target with its requested type. These status fields are
**Observed** engine values. Their displayed age is **Derived** from browser
wall time.

## World identity and load transitions

World-scoped agent IDs are meaningful only inside one world. A deferred load
therefore enters an explicit `Loading` state as soon as the request is
accepted. The ribbon displays the requested world and labels the confirmed
active world as the previous world until the engine reports the switch.

The server latches REST/MCP world-load requests until the requested world is
observed as active. This prevents the browser's one-second poll from missing a
short deferred-load flag. When the identity changes, world-scoped selections
and samples are cleared before new-world data renders.

`Startup` is shown as **No World**. Developer Tools and APIs remain available,
but there is no playable world context for creature or ecology data.

## Simulation, API, and stream state

These are separate controls and must not be conflated:

- **Pause simulation** stops world ticks, creature processing, physics, timer
  scripts, and agent updates. The API and browser remain responsive.
- **Resume simulation** restarts global simulation updates.
- **Pause stream** on the Log tab only stops rendering incoming Log messages.
  Messages buffer in the browser and the simulation continues.
- **Disconnected** means repeated shared session requests could not reach the
  engine API. The last values remain visible but stale.
- **Stream reconnecting** concerns only the Log event stream. It does not imply
  that the simulation or session endpoint is offline.

Pause or resume through MCP is reflected by the next shared status sample, just
like a browser action.

## Freshness and polling

The browser polls once per second while visible and once every five seconds
while the page is hidden. An active observatory recording retains the
one-second cadence in the background so its evidence stream is not silently
downsampled. All consumers use the central poller's state instead of starting
tab-specific status loops.

A failed poll immediately marks the last status sample stale. Three consecutive
failures declare the API disconnected. A successful response reconnects the
session and replaces the stale sample. The freshness threshold is at least
three seconds, or twice the active polling interval when that is longer.

Paused world ticks do not make a newly captured status sample stale: freshness
measures when the browser last confirmed engine state, not whether simulation
time advanced.

## Reloading the same world

Each world load gets a new `worldSessionId`, including a reload of the world
already open. A reload rewinds time under the same name, so selections, samples
and recordings from before it are discarded rather than mixed with the restored
simulation.

## Changing speed

Open the ribbon, choose a multiplier, and select **Apply speed**. Your choice
stays in the list across refreshes until it is applied. The browser
posts the explicit value to `POST /api/engine/tickrate`, then refreshes
`GET /api/session` and displays engine truth. A successful response does not
silently imply another value.

Changing speed affects simulation timing and is not the same as pause. Restore
`×1` after accelerated verification unless the experiment protocol says
otherwise.

## Launch-mode behavior

- `--tools` serves the browser UI and API. The ribbon is visible on every tab
  and creature subview.
- `--mcp` exposes the same structured endpoint without serving the browser UI.
  MCP pause, resume, load, and speed actions remain observable through
  `GET /api/session`.
- `--headless` enables the tools/API services without display or audio. If the
  static tools are served, Firefox shows the same ribbon and freshness rules.
- If no world is requested at launch, Startup appears as **No World**.

Only one instrumented engine should use port 9980 at a time.
