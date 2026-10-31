# Developer Tools Overview

The Creatures 3 / Docking Station engine provides built-in browser-based developer tools, served directly from the `lc2e` binary. These tools require no external dependencies (no Node.js, no relay scripts, no separate processes) and operate with **zero impact** on engine performance when not in use.

![The Observatory dashboard and grouped navigation in
Firefox](/docs/images/observatory/observatory-dashboard-firefox.png)

## Quick Start

To start the engine with developer tools enabled, pass the `--tools` flag:

```bash
./build/lc2e -d "$HOME/Creatures Docking Station/Docking Station" --tools
```

Once the engine is running, open your browser and navigate to:
**http://localhost:9980**

## Evidence and freshness

Not every displayed value is equally direct or current. Direct engine reads
are labelled **Observed**, calculations from those reads are **Derived**,
interpretations are **Inferred**, and missing capture context is **Unknown**.
Shared samples carry a world identity and tick; disconnecting marks the last
sample stale rather than leaving it presented as live. Read
[Observatory State and Evidence](observatory_state.md) for the exact contracts
and Creatures-specific examples.

### CLI Options

| Flag | Description |
|---|---|
| `--tools` | Start the developer tools server on port 9980 |
| `--tools /path/to/tools` | Override the default tools directory path |

The tools directory is resolved relative to the executable: `<exe_dir>/../tools/`. If this directory does not exist, it falls back to `./tools/` relative to the current working directory. You can manually override this path using the `--tools /path` argument.

## Interface & Navigation

The developer tools open on an Observatory dashboard and organize work into
four intent groups: **Observe**, **Experiment**, **Develop**, and **Learn**.
The collapsible left navigation keeps every advanced workspace discoverable
while visually marking routes that can lead to a reviewed world change. Each
workspace has a contextual toolbar beneath the header.

The dashboard summarizes the live session, creature population, current
experiment or recording, recent interventions, diagnostics, and retained
biological pins. Card-level freshness makes disconnected and no-world states
explicit. See [Observatory Navigation and
Dashboard](observatory_navigation_dashboard.md).

### Contextual help and task guides

Choose the visible **Help** button for the active route, or focus a registered
field, chart, panel, or consequential action and press F1. The shared drawer
states meaning, activity, evidence/source, update cadence, interpretation
caution, optional shortcut, related terms, and the current world/subject/time
identifiers. Opening a guide or reference retains that context and does not
change the world.

Optional Tips work on pointer hover and keyboard focus through
`aria-describedby`. They are non-interactive and never repurpose Tab. Start
with the [Observatory Task Guides](observatory_task_guides.md), and use the
[Glossary and Evidence Legend](observatory_glossary.md) when a term is
unfamiliar.

Contextual help also offers **Trace data path** where a reviewed metric path is
known. It opens the [Live Architecture Graph](live_architecture_graph.md) with
the current world, stable selections, tick/range, and path intact. Static
structure, recent observed requests, mechanical transformations, and inferred
context remain explicitly distinct.

### World and session ribbon

The persistent header ribbon shows the confirmed world, world type, simulation
state, speed, world tick, creature count, and age of the latest shared status
sample. Click it for exact world/system ticks, source and connection details,
pending load context, and explicit speed controls. See
[World and Session Status](session_status.md).

### Shared investigation context

The strip below the toolbar keeps the confirmed world, primary subject, and
related selections visible while you move between tools. Its **Back** action
restores the previous investigation, including filters and scroll position.
Creature, script, Debugger, structured Log, and Docs links use this shared
route model instead of asking you to copy IDs or opening a new browser tab.
See [Shared Context and Cross-Navigation](shared_context_navigation.md).

### Global engine control

The header includes text-labelled **Resume simulation** and **Pause simulation**
actions. Pausing the engine freezes all game ticks, including:
- Creature AI
- Physics simulation
- Timer scripts
- Agent updates

While the engine is paused, the developer tools UI and the underlying debug server remain **fully responsive**, making it an ideal state for inspecting creatures, agents, and running scripts without the world changing beneath you.

The Log tab's **Pause stream** action is independent: it buffers Log rendering
without pausing the simulation.

## Available Workspaces

The grouped routes lead to these detailed workspaces:

- **Observe:** [Creatures](tab_creatures.md),
  [Ethology Timeline](ethology_timeline.md),
  [Comparison](creature_cohort_comparison.md),
  [World & Ecology](world_ecology_observatory.md),
  [Running Scripts](tab_scripts.md), and [Logs](tab_log.md).
- **Experiment:** [Experiment Workspaces](experiment_workspaces.md),
  [reviewed chemical interventions](safe_chemical_interventions.md) with
  baseline/confirmation/provenance, and the copy-first
  [Genetics Kit](tab_genetics_kit.md).
- **Develop:** [CAOS Workbench](tab_caos_ide.md), the read-only
  [Scratchpad](tab_console.md), [Debugger](tab_debugger.md), and engine/API
  diagnostics.
- **Learn:** [task guides](observatory_task_guides.md), the CAOS reference, the
  [live architecture graph](live_architecture_graph.md), and the [evidence
  terminology](observatory_glossary.md). You are reading this built-in
  knowledge base.

### The built-in wiki

The Docs workspace renders the Markdown pages listed in `tools/docs/index.json`
entirely in the browser. The left list filters pages by title as you type; the
right sidebar is a table of contents generated from the page's headings, whose
IDs are URL-safe slugs of the heading text (`## Brain Sub-Tab` →
`brain-sub-tab`). Links between pages are routed without a reload, and images
scale to the reading pane. A page or section can be deep-linked with the
shared route form, for example
`#observe?route=guides&tab=docs&view=wiki&doc=tools_overview.md`; the older
`#docs/file.md` and `#docs/file.md:section` forms still work. Opening a page
keeps the current world and subject context. See
[Welcome to the Wiki](intro.md) for how to add a page.

## API Reference
The developer tools are powered by an embedded HTTP/SSE server. If you want to interact with the engine programmatically, you can refer to the [API Reference](api_reference.md).
