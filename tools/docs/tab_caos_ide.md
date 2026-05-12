# CAOS IDE Tab

The **CAOS IDE** tab provides a lightweight, fully-featured browser-based code editor for writing, editing, running, and managing CAOS scripts directly within the active engine.

![CAOS IDE Tab](/docs/media/tab_caos_ide.png)

## Interface Layout

The CAOS IDE uses a three-panel design:
1. **Scriptorium Browser (Left Sidebar):** A directory of installed scripts.
2. **Code Editor & Classifier Header (Center):** The main coding workspace.
3. **Output Console (Bottom):** Results and execution logs.

---

## Scriptorium Browser

The sidebar lists all scripts currently installed in the engine's scriptorium (the central registry that holds all CAOS event scripts).

* **Classifier Grouping:** Scripts are grouped by Family / Genus / Species.
* **Agent Names:** Group headers display the human-readable agent name sourced from the catalogue (e.g., "Teleporter" for `1 1 152`).
* **Event Labels:** Each script entry shows the event number and its human-readable name (e.g., `1` Push, `9` Timer).
* **Search:** Filter scripts by classifier numbers, event names, or agent names (e.g., type `teleporter`).
* **Click to Load:** Clicking any script entry fetches its source from the engine and populates the editor.

---

## Code Editor

A custom, dependency-free text editor designed specifically for CAOS.

* **Syntax Highlighting:** CAOS keywords, flow control structures (`doif`, `loop`), commands, variables (`va00`, `ov00`), and comments are automatically colour-coded.
* **Live Syntax Validation:** Pausing typing for 500ms triggers a background compilation check (`POST /api/validate`). Errors are displayed in a red bar below the header, and the offending line is highlighted in the gutter.
* **Auto-Complete:** Press **Ctrl+Space** (or type 3+ characters) for command suggestions. The dropdown shows parameter signatures and descriptions.
* **Command Help (F1):** Press **F1** with the cursor on any CAOS word to display a floating documentation popup for that command.
* **Smart Indentation:** Automatically indents after block-opening keywords (`doif`, `loop`, `subr`) and supports `Shift+Tab` dedenting.

### Toolbar Actions
* **▶ Run (Ctrl/⌘+Enter):** Executes the editor content in a fresh VM. Output goes to the console.
* **Inject:** Compiles the code and installs it into the Scriptorium under the classifier specified in the header fields. (Strips existing `scrp`/`endm` wrappers).
* **Remove:** Removes the script matching the header classifier from the Scriptorium.
* **Save / Load .cos:** Download the editor content as a `.cos` file or load a local file into the editor.

---

## IDE Breakpoints & Debugger Workflow

The CAOS IDE allows you to set breakpoints on source lines, and then **choose which running agents** should pause at those breakpoints. This bridges the gap between script authoring (IDE) and script execution (Debugger).

1. **Set a Breakpoint:** Click any line number in the gutter. A red dot appears, and the **Breakpoint Panel** opens.
2. **Agent Discovery:** The panel automatically polls the engine to find all agents currently running this specific script.
3. **Bind Agents:** Click the tags of the agents you want to debug. The tags will turn orange.
4. **Debug:** Switch over to the [Debugger Tab](tab_debugger.md). The selected agents will pause execution when they hit the breakpoint, allowing you to step through the code and inspect variables.

### Under the Hood: Breakpoint Coordinate Mapping

A key technical challenge bridging the IDE and the engine is that the CAOS compiler outputs a flat stream of bytecoded instructions (`IP` addresses), which have no inherent concept of "lines of code." Breakpoints within the CAOS VM must be set against these byte-level IPs. 

When you click a line in the IDE's gutter:
1. The frontend calculates the absolute character offset of that line within the raw text string.
2. The IDE issues a background compile via `POST /api/compile-map`. 
3. The `DebugServer` invokes `Orderiser::OrderFromCAOS`, extracting the compiler's `DebugInfo` class, which holds an `std::map<int, int>` linking bytecode `IP` offsets back to source string character offsets.
4. The server returns this mapping to the browser.
5. The IDE cross-references your clicked source character offset with the address map, determines the closest valid CAOS instruction pointer (`IP`), and registers the breakpoint against that specific byte address.

*Note: Because this relies on exact character offsets, breakpoints are automatically cleared when the source text is edited, a new script is loaded, or the page is refreshed.*

## Limitations
* **Run Execution:** Just like the [Console](tab_console.md), the "Run" action has no `OWNR`, blocks yield commands, and runs as a single-shot execution.
* **Source Availability:** Scripts compiled without debug info (e.g., from binary-only worlds) cannot be decompiled back to source.
* **Script Locking:** You cannot *Inject* a script if it is actively being executed by an agent.

---

## See Also

* **[CAOS Command Reference](caos_overview.md)** — Complete glossary of all CAOS commands with syntax, descriptions, and examples. Essential reading for anyone writing CAOS scripts.
* **[Debugger](tab_debugger.md)** — Step through paused agents and inspect VM state after a breakpoint is hit.
* **[Scripts](tab_scripts.md)** — See all currently running scripts at a glance to identify targets for debugging.
* **[Console](tab_console.md)** — For quick one-off CAOS command execution without needing the full IDE.
* **[API Reference](api_reference.md)** — Endpoint documentation for `POST /api/validate`, `POST /api/compile-map`, `POST /api/scriptorium/inject`, and `GET /api/caos-commands`.
