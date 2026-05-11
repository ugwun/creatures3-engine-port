# Scripts Tab

The **Scripts** tab displays a live, polling table of all currently running CAOS scripts across all agents in the world.

![Scripts Tab](/docs/media/tab_scripts.png)

## Overview

The table provides a comprehensive snapshot of the active script ecosystem. 

| Column | Description |
|---|---|
| **Agent ID** | The unique ID of the agent executing the script (`GetUniqueID()`). |
| **Classifier** | The script's Family, Genus, Species, and Event number, often accompanied by a human-readable name (e.g., `2 13 100 9 (Timer)`). |
| **State** | The current execution state of the script: `running`, `blocking` (waiting on commands like `wait`, `over`), or `paused` (hit an IDE breakpoint). |
| **IP** | The current Instruction Pointer offset within the compiled bytecode. |
| **Current Source** | The CAOS source code surrounding the current IP, automatically formatted with line breaks and 4-space indentation for readability. |

## Features

* **Auto-Refresh:** By default, the table polls the underlying `GET /api/scripts` endpoint every 2 seconds to keep the data fresh.
* **Manual Refresh:** Click the "Refresh" button in the toolbar for an immediate, synchronous update.
* **Toggle Auto-Polling:** Uncheck the "Auto" box to disable automatic polling. This is useful if you want to inspect a specific snapshot of execution state without it jumping.
* **Empty State Handling:** When no scripts are running (for example, if no world is loaded), a helpful message is displayed rather than an empty table.

## Under the Hood: How it Works

When the frontend polls the `GET /api/scripts` endpoint, the `DebugServer` schedules a `WorkItem` to run on the engine's main thread (to avoid data races). 

Here is the exact pipeline the engine follows to gather this data (refer to `engine/DebugServer.cpp`):

1.  **Agent Traversal:** The server accesses the global `AgentManager::GetAgentIDMap()` and iterates through every active agent in the game.
2.  **VM State Check:** For each agent, it inspects its internal `CAOSMachine` (Virtual Machine). It skips any agent where `vm.IsRunning()` is false.
3.  **Classifier Extraction:** If the VM is active, it retrieves the associated `MacroScript*` to extract the script's `Classifier` (Family, Genus, Species, Event).
4.  **Source Code Mapping:** To provide the contextual "Current Source" snippet, the engine leverages the compiler's `DebugInfo` map. It takes the VM's current instruction pointer (`vm.GetIP()`) and resolves it backwards into the original `std::string` source code, extracting the exact text of the current executing line.

Because this traversal is executed directly within the main thread's game tick execution loop, the state presented is a guaranteed, exact snapshot of that specific tick, free from multi-threading artifacts.

## Visual Badges

To make scanning the script table easier, the state of each script is represented by a colour-coded badge:

* **Green Badge:** The script is actively `running`.
* **Orange Badge:** The script is `blocking` (waiting on a timer or animation).
* **Orange Outlined Badge (with ⏸):** The script is `paused` at a user-defined breakpoint.

If you identify a script that requires deeper investigation, you can set breakpoints for it in the [CAOS IDE](tab_caos_ide.md) and step through its execution in the [Debugger](tab_debugger.md).

*For details on interacting with the script data programmatically, check the [API Reference](api_reference.md).*
