# Observatory Navigation and Dashboard

The Developer Tools open on a calm overview of the connected world. The
navigation is grouped by investigative intent: **Observe**, **Experiment**,
**Develop**, and **Learn**. It does not hide advanced tools; it makes the
difference between reading evidence and changing a world visible before you
enter a workspace.

![The Observatory overview in Firefox, showing the grouped navigation, moving
session, four-creature population, experiment context, intervention ledger,
diagnostics, and pinned signals](/docs/images/observatory/observatory-dashboard-firefox.png)

## First Visit

Start with the persistent session ribbon and the first dashboard card:

1. Confirm the expected world is connected and whether simulation time is
   moving, paused, disconnected, or unavailable because no world is loaded.
2. Choose **Observe** to follow a creature, review a time range, compare a
   cohort, inspect ecology, or correlate scripts and logs.
3. Choose **Experiment** before a deliberate intervention. These routes use
   reviewed preconditions and provenance; their magenta **Reviewed change**
   marker does not claim that entering the workspace itself mutates the world.
4. Choose **Develop** for CAOS authoring and execution diagnosis. Scratchpad is
   the explicitly read-only fast path; Workbench includes reviewed mutating
   modes.
5. Choose **Learn** for task guides, the CAOS reference, the live architecture
   graph, and the evidence vocabulary.

The **Resume investigation** card returns to the most recent non-dashboard
workspace. Shared subject and time context remain attached when the target
workspace supports them.

## Reading the Dashboard

Dashboard cards are summaries, not a synchronized snapshot of every endpoint.
Each card names its evidence level and freshness:

- **World & simulation** reuses the shared `/api/session` sample. Tick movement
  is derived only after two observations; a single sample says it is waiting.
- **Creatures** polls `/api/creatures` only while the dashboard is visible and
  shows exact population and reported life-state counts. It does not infer that
  a state is biologically unusual.
- **Experiment** and **Recent interventions** read the shared experiment,
  recording, and world-qualified provenance state.
- **Scripts, logs & stream gaps** uses a bounded scripts poll and retained
  notable log/gap events. Counts are diagnostic evidence, not a causal claim.
- **Pinned signals** summarizes already retained biological samples. A pin with
  no sample says so instead of presenting a zero.

Dashboard creature and script requests are shared and bounded to a five-second
refresh cadence while this route is active. Other panels keep their own
documented sampling contracts. The manual **Refresh overview** action starts a
new dashboard capture without increasing the background rate.

When the engine disconnects, last-known values are retained only as stale
evidence and tick movement becomes unknown. In the `Startup` no-world state,
the dashboard stays navigable and explains which live capabilities need a
loaded simulation world.

## Route Map

| Group | Route ID | Workspace | Activity | Required context |
|---|---|---|---|---|
| Observe | `dashboard` | Observatory overview | Observe | None |
| Observe | `creatures` | Creature drives and biology | Observe | Connection, world |
| Observe | `timeline` | Ethology timeline | Observe | Connection, world, creature |
| Observe | `compare` | Creature/cohort comparison | Observe | Connection, world |
| Observe | `ecology` | World & ecology | Observe | Connection, world |
| Observe | `scripts` | Running scripts | Observe | Connection, world |
| Observe | `logs` | Contextual logs | Observe | Connection |
| Experiment | `experiments` | Experiment workspaces | Reviewed change | Connection, world |
| Experiment | `chemicals` | Chemical intervention | Reviewed change | Connection, world, creature |
| Experiment | `genetics` | Genetics experiments | Reviewed change | Connection, world |
| Develop | `workbench` | CAOS Workbench | Reviewed change | Connection, world |
| Develop | `scratchpad` | Evaluate-now Scratchpad | Read only | Connection, world |
| Develop | `debugger` | Script Debugger | Develop | Connection, world |
| Develop | `diagnostics` | Engine/API diagnostics | Develop | Connection |
| Learn | `guides` | Task-oriented wiki | Learn | None |
| Learn | `caos-reference` | CAOS reference | Learn | None |
| Learn | `architecture` | Architecture graph | Learn | None |
| Learn | `evidence` | Evidence and terms | Learn | None |

A route whose capability is unavailable remains visible and explains what is
missing. This is intentional: an offline user can still find documentation and
understand which world or selection a live workspace needs.

## Deep Links and Preserved Context

Named routes use the shared `#observe?` form:

```text
#observe?route=dashboard&tab=dashboard
#observe?route=timeline&tab=timeline&world=DevTools+Audit&primary=creature&creature=422
#observe?route=compare&tab=compare&world=DevTools+Audit&primary=creature&at=1200&from=1000&to=1300&creature=422
```

`route` gives the human-meaningful destination. `world`, stable selection
identifiers, and optional `at`/`from`/`to` world ticks preserve the
investigation. Refresh, browser Back/Forward, navigation buttons, and dashboard
cards all use the same route model. The context strip displays a retained time
range as, for example, `Ticks 1000–1300`.

World-qualified selections are rejected visibly if a different world is
loaded. Creature and agent identity fingerprints are retained to prevent a
reused numeric ID from silently changing the subject.

## Existing Bookmark Migration

Existing links remain accepted:

| Existing hash | Named route |
|---|---|
| `#overview`, `#dashboard` | `dashboard` |
| `#creatures` | `creatures` |
| `#timeline` | `timeline` |
| `#compare` | `compare` |
| `#world`, `#ecology` | `ecology` |
| `#experiments` | `experiments` |
| `#genetics` | `genetics` |
| `#log` | `logs` |
| `#console` | `scratchpad` |
| `#scripts` | `scripts` |
| `#debugger` | `debugger` |
| `#ide` | `workbench` |
| `#docs` | `guides` |

Legacy `#docs/filename.md:section` links also continue to open the internal
wiki. New links should use named routes because they carry capability,
activity, and help metadata.

## Keyboard and Narrow Screens

Tab reaches every route and dashboard action. Within the navigation only,
Arrow Up/Down moves between routes and Home/End moves to the first/last route.
These keys are not captured while editing CAOS or typing in another control.

At narrow widths the navigation becomes an overlay opened by the menu button;
the dashboard becomes a single column and preserves every status card. Escape
closes the overlay and restores focus without changing the current route.

## Related Guides

- [Shared Context and Cross-Navigation](shared_context_navigation.md)
- [World and Session Status](session_status.md)
- [Observatory State and Evidence](observatory_state.md)
- [Experiment Workspaces and Provenance](experiment_workspaces.md)
- [CAOS Workbench and Scratchpad](tab_caos_ide.md)
