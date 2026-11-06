# Creatures 3 — Developer Tools

Browser-based developer tools for the Creatures 3 / Docking Station engine,
served directly from the `lc2e` binary. No Node.js, relay scripts, or separate
processes are involved on the engine side.

This file is the entry point. The detailed workspace guides, task guides, and
the REST API reference live in the built-in wiki under [`docs/`](docs/) and
are served inside the tools. Engine-side architecture and extension rules are
in the repository's `developer-tools` skill (`.agents/skills/developer-tools/`).

## Quick start

```bash
./build/lc2e -d "/path/to/Docking Station" --tools
# open http://localhost:9980
```

| Flag | Description |
|---|---|
| `--tools` | Start the developer tools server on port 9980 |
| `--tools /path/to/tools` | Serve the UI from another `tools/` directory |
| `--mcp` | Start the API only, without the browser UI |
| `--headless` | No display or audio; implies `--tools` and `--mcp` |
| `--allow-remote-tools` | Listen on all interfaces with token-protected access |

The tools directory resolves to `<executable>/../tools`, then `./tools`.
Keep the built binary and its `tools/` directory at the same revision. When
`--tools` is not passed the server does not start and costs nothing.

## Access and safety

The API can execute arbitrary CAOS and rewrite genome files, so it serves only
this machine: it binds `127.0.0.1`, sends no CORS headers, and rejects foreign
`Host` headers and cross-origin or cross-site API requests. With
`--allow-remote-tools` the engine listens on all interfaces, requires a token
for anything but local requests, and prints an access URL at startup; set
`LC2E_TOOLS_TOKEN` to choose the token.

Use an isolated copy of your game data or a disposable world for experiments.
A code rollback does not reverse a world, genome, chemical, creature, script,
or file change that has already happened; such operations cannot be truly
undone. See [Migration and Rollback](docs/observatory_migration_and_rollback.md)
before mixing binary and tools revisions.

## Evidence contract

Displayed values do not all have the same source or freshness. Direct endpoint
reads are **Observed**; calculations are **Derived**; interpretations are
**Inferred**; values without adequate capture metadata are **Unknown**.
Samples carry their world identity, capture tick, and polling interval, and a
disconnect marks the last sample stale. The compatibility field `health` is
glycogen reserve (chemical 4), not overall health. A cross-panel narrative
does not prove why a creature acted. The shared contract is in
[Observatory State and Evidence](docs/observatory_state.md) and the
[glossary](docs/observatory_glossary.md).

## The Observatory

The tools open on an overview dashboard and group workspaces into **Observe**,
**Experiment**, **Develop**, and **Learn** in the collapsible left navigation.
Routes that can lead to mutation are labelled **Reviewed change**; unavailable
routes stay visible and say which connection, world, or selection they need.
Deep links use `#observe?route=<id>&tab=<tab>` and can carry the world,
selections, and an `at`/`from`/`to` tick context; flat hashes such as
`#creatures` remain aliases.

The persistent header ribbon shows the world, world type, simulation state,
speed, tick, creature count, and sample age, with exact ticks and speed
controls behind a click. **Pause simulation** freezes every game tick while the
UI and API stay responsive; the Log's **Pause stream** only stops rendering.
The **Display** action (Shift+?) publishes the keyboard map and density,
motion, and shortcut preferences. **Help** or F1 opens contextual help for
the focused element; task guides and references open in the wiki without
losing the current context.

| Group | Workspace | What it is for | Guide |
|---|---|---|---|
| Observe | Overview | Session, population, recording, interventions, and diagnostics at a glance | [Navigation & Dashboard](docs/observatory_navigation_dashboard.md) |
| Observe | Creatures | Live observation strip, drives, chemistry, organs, genome, and brain of one creature | [Creatures](docs/tab_creatures.md), [Following One Creature Live](docs/live_creature_observation.md) |
| Observe | Timeline | Bounded nine-lane history of one creature with gaps made explicit | [Ethology Timeline](docs/ethology_timeline.md) |
| Observe | Compare | Same-tick individual tables and cohort summaries | [Creature and Cohort Comparison](docs/creature_cohort_comparison.md) |
| Observe | World | Read-only room geometry, doors, agents, CA samples, and movement traces | [World and Ecology Observatory](docs/world_ecology_observatory.md) |
| Observe | Scripts | Grouped running CAOS VMs with state, blocking reason, and source statement | [Scripts](docs/tab_scripts.md) |
| Observe | Logs | Structured SSE log with two clocks, context filters, bookmarks, and export | [Log](docs/tab_log.md) |
| Experiment | Experiments | Versioned protocol, recording, provenance ledger, and safe world branches | [Experiment Workspaces](docs/experiment_workspaces.md) |
| Experiment | Chemicals | Reviewed chemical adjustments with baseline and confirmation | [Safe Chemical Interventions](docs/safe_chemical_interventions.md) |
| Experiment | Genetics Kit | Copy-first genome editing, SVRule grid, crossover, and reviewed injection | [Genetics Kit](docs/tab_genetics_kit.md), [The Digital Genome](docs/genome_deep_dive.md) |
| Develop | CAOS Workbench | Editor with completion and F1 help; Evaluate, Inspect, Install, Replace, Remove | [CAOS Workbench](docs/tab_caos_ide.md) |
| Develop | Scratchpad | Immediate read-only CAOS evaluation, including the `cstk` stack tracer | [Scratchpad](docs/tab_console.md) |
| Develop | Debugger | Source-level breakpoints, stepping, and VM inspection per agent | [Debugger](docs/tab_debugger.md) |
| Learn | Docs | This wiki, the CAOS reference, deep dives, and the live architecture graph | [Overview](docs/tools_overview.md), [Live Architecture Graph](docs/live_architecture_graph.md) |

Accessibility, responsive layouts, and keyboard-only operation are covered in
[Accessibility and Responsive Operation](docs/accessibility_and_responsive.md)
and the [Keyboard-only Observatory Tour](docs/guide_keyboard_observatory.md).
The release-time checks for the whole product are recorded in the
[release validation report](docs/observatory_release_validation.md).

## REST and SSE API

Every endpoint is served on port 9980 next to the static files. Endpoints that
touch engine state run on the main thread through a work queue; a `504` means
the engine never ran the request. The complete reference with request and
response shapes is [`docs/api_reference.md`](docs/api_reference.md). Index:

| Area | Endpoints |
|---|---|
| Engine state | `POST /api/pause`, `POST /api/resume`, `GET /api/engine-state`, `GET /api/session` |
| CAOS, reviewed | `POST /api/caos/validate`, `POST /api/caos/evaluate`, `POST /api/caos/script` |
| CAOS, legacy | `POST /api/execute`, `POST /api/validate`, `POST /api/scriptorium/inject` |
| Authoring support | `POST /api/compile-map`, `GET /api/caos-commands`, `GET /api/agent-names` |
| Scripts | `GET /api/scripts`, `GET /api/scriptorium`, `GET /api/scriptorium/:f/:g/:s/:e` |
| Debugging | `GET /api/agent/:id`, `POST /api/breakpoint`, `POST /api/step/:agentId`, `POST /api/continue/:agentId` |
| Creatures | `GET /api/creatures`, `GET /api/creatures/snapshot`, `GET /api/creature/:id/observation`, `.../chemistry`, `.../organs`, `.../genome`, `POST /api/creature/:id/chemical-intervention` |
| Brain | `GET /api/creature/:id/brain`, `.../brain/lobe/:lobe`, `.../brain/tract/:tract`, `.../brain/lobe/:lobe/neuron/:neuron` |
| World and experiments | `GET /api/ecology/snapshot`, `GET /api/experiment/context`, `POST /api/world/branch` |
| Genetics | `GET /api/genetics/files`, `GET /api/genetics/file/:name`, `POST /api/genetics/{copy,crossover,save,save-experiment,rename,inject}`, `POST /api/genetics/delete/:name` |
| Log stream | `GET /api/events` (SSE, resumable with `Last-Event-ID`) |

AI agents should prefer the MCP adapter in `mcp/` over raw REST; see
[`mcp/MCP.md`](../mcp/MCP.md).

## Design

The UI follows the **Bright-Fi** design language: warm off-white `#F2F0EC`
panels, a black header, hard 1–2 px black borders with no rounded corners,
hazard orange `#FF5F00` as primary accent and magenta `#FF00FF` as secondary,
Inter in heavy uppercase for labels and JetBrains Mono for code. All styling
is in `style.css`; the palette and conventions are listed in the
`developer-tools` skill.

## Crash reporter

The engine includes an in-process crash reporter that catches `SIGSEGV`,
`SIGBUS`, `SIGABRT`, `SIGFPE`, `SIGILL`, and `SIGTRAP`, prints a demangled
stack trace to stderr, and exits. While the tools run, the crash information
also appears in the Log workspace under the Crash subsystem.

## Testing the tools

```bash
node --test tools/tests/*.test.cjs                                   # pure models and documentation integrity
node --test --test-concurrency=1 tools/tests/browser/*.browser.cjs   # real Firefox against a synthetic engine
```

Both also run under `ctest`. The Firefox suites skip themselves when Firefox is
absent. The mutating workflow suite can target a live engine on a disposable
data copy with `OBSERVATORY_URL=http://127.0.0.1:9980/` and
`OBSERVATORY_ALLOW_CHANGES=1`.
