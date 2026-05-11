# Developer Tools Overview

The Creatures 3 / Docking Station engine provides built-in browser-based developer tools, served directly from the `lc2e` binary. These tools require no external dependencies (no Node.js, no relay scripts, no separate processes) and operate with **zero impact** on engine performance when not in use.

![Developer Tools Overview](/docs/media/tools_overview.png)

## Quick Start

To start the engine with developer tools enabled, pass the `--tools` flag:

```bash
./build/lc2e -d "$HOME/Creatures Docking Station/Docking Station" --tools
```

Once the engine is running, open your browser and navigate to:
**http://localhost:9980**

### CLI Options

| Flag | Description |
|---|---|
| `--tools` | Start the developer tools server on port 9980 |
| `--tools /path/to/tools` | Override the default tools directory path |

The tools directory is resolved relative to the executable: `<exe_dir>/../tools/`. If this directory does not exist, it falls back to `./tools/` relative to the current working directory. You can manually override this path using the `--tools /path` argument.

## Interface & Navigation

The developer tools UI is organized into seven primary tabs, accessible from the collapsible left navigation sidebar. Each tab features a **contextual toolbar** located beneath the main header, which displays only the controls relevant to the active tab.

### Global Engine Control (Pause / Play)
The header includes global **▶** (Play) and **❚❚** (Pause) buttons on the right side. These controls manage the global engine simulation. Pausing the engine freezes all game ticks, including:
- Creature AI
- Physics simulation
- Timer scripts
- Agent updates

While the engine is paused, the developer tools UI and the underlying debug server remain **fully responsive**, making it an ideal state for inspecting creatures, agents, and running scripts without the world changing beneath you.

## Available Tabs

Here is a quick overview of the available tabs. Click on any tab for deep-dive documentation:

* **[Log](tab_log.md)**: Real-time streaming of engine log messages.
* **[Console](tab_console.md)**: Interactive CAOS Read-Eval-Print Loop (REPL).
* **[Scripts](tab_scripts.md)**: Live table of all currently running CAOS scripts.
* **[Debugger](tab_debugger.md)**: Interactive CAOS source-level debugger.
* **[CAOS IDE](tab_caos_ide.md)**: Lightweight browser-based code editor for CAOS scripts.
* **[Creatures](tab_creatures.md)**: Live inspector for all creature agents (Norns, Grendels, Ettins).
* **[Genetics Kit](tab_genetics_kit.md)**: Standalone tool for manipulating, cross-breeding, and injecting genomes.
* **Docs**: You are here! The built-in knowledge base.

## API Reference
The developer tools are powered by an embedded HTTP/SSE server. If you want to interact with the engine programmatically, you can refer to the [API Reference](api_reference.md).
