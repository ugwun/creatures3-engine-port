# CAOS Workbench

The **CAOS Workbench** makes the difference between immediate evaluation,
live-script inspection, and persistent scriptorium changes explicit. It keeps
the existing CAOS editor, command completion, F1 help, formatting, local file
loading, and breakpoint tools, but every action now has a named execution mode
and a reviewed engine context.

![CAOS Workbench replacement review](/docs/images/observatory/caos-workbench-firefox.png)

## Choose the execution model first

| Mode | What happens | Owner and target | Persistence |
|---|---|---|---|
| **Evaluate now** | Compiles and runs the editor source once | Fresh VM, no `OWNR`; the selected agent can be deliberately bound as `TARG` | None |
| **Inspect running** | Opens the selected live script in Debugger | Uses the observed running agent and VM | No new execution |
| **Install event** | Installs a previously absent exact classifier/event | `OWNR` is established later by the engine when the event fires | Stored in the active world's scriptorium |
| **Replace event** | Shows a source diff and conditionally replaces one exact installed event | Same event semantics as Install | Stored; refused if the reviewed installed checksum changed |
| **Remove event** | Removes one exact installed event after confirmation | No VM is run | Persistent removal from the active world's scriptorium |

Loading a script from the Scriptorium Browser selects **Replace event**, because
an event already exists at that exact classifier. Changing to **Install event**
will be blocked until the classifier names an unused event.

## Exact execution context

The context panel shows:

- active world, world tick, system tick, connection, and paused/running state;
- fresh ownerless VM semantics for Evaluate now;
- selected `TARG` identity and classifier, when available;
- selected running-script agent and event;
- active experiment-recording state.

Requests carry the reviewed world name and tick. Target-bound evaluation also
carries the numeric agent ID and expected classifier. The engine checks those
values on its main thread immediately before execution. A changed world, stale
tick, missing agent, or changed agent identity is refused instead of silently
retargeted.

**Pause world during evaluation** briefly pauses a running simulation while the
fresh VM executes, then restores the prior pause state. It never resumes a world
that was already paused.

## Validation and review

The workbench compiles the exact normalized source through
`POST /api/caos/validate`. A successful compilation returns a source checksum;
the apply request must carry the same checksum. Compiler failures include a
one-based line/column location and highlight the source line.

Compilation is not a safety guarantee. The preview separately identifies known
world-mutating and broad/destructive commands. Mutating or unknown Evaluate
source, and every Install/Replace/Remove operation, opens a final review dialog.
The dialog shows the world/tick, owner and target, exact classifier, source and
installed checksums, risk, pause option, and experiment state. Nothing happens
until its acknowledgement is checked.

Replace mode fetches the exact existing source and displays a line diff.
Replace and Remove carry the installed checksum back to the engine. A concurrent
change, missing event, occupied Install target, or locked running script fails
without touching another event.

## Editing and authoring assistance

- **Syntax highlighting** covers commands, flow control, variables, strings,
  numbers, and comments.
- **Ctrl+Space** or three typed characters opens completion derived from the
  engine's registered CAOS command inventory.
- **F1** opens the signature, parameter list, and concise command description.
- **Enter**, **Tab**, **Shift+Tab**, and smart Backspace preserve CAOS block
  indentation.
- **Save .cos / Load .cos** keep local authoring available.
- **Ctrl/⌘+Enter** applies the currently selected explicit mode; it does not
  change modes.

The Scriptorium Browser groups installed events by Family/Genus/Species,
labels known event numbers, supports text search, and loads exact source plus
its checksum.

## Results and handoffs

Evaluate results include output, world-tick interval, wall-clock elapsed time,
and a correlation ID. Script operations include the exact classifier,
completion tick, checksum, elapsed time, and correlation ID. Compiler and
runtime failures include a source location when the engine can map one.

Each successful result offers direct handoffs to **Logs**, **Scripts**, and
**Debugger**, retaining the selected agent context when one exists.

World-changing requests enter an active experiment ledger through the shared
provenance transport. Source text is omitted; the record retains mode, source
length/checksum, exact classifier or target, reviewed world/tick, confirmation
state, and the redacted observed result. Validation-only requests are not
recorded as mutations.

## Breakpoints and running-script inspection

Click an executable line number to compile an address map and create a
source-to-bytecode breakpoint. The breakpoint panel can bind that address to
matching live agents. Editing source clears only that script's invalidated
breakpoint mapping. Use **Inspect running** or a result handoff to continue in
the [Debugger](tab_debugger.md); use [Scripts](tab_scripts.md) to find live VMs.

## Failure semantics

- Event classifiers must be in engine range: Family/Genus `0–255`,
  Species/Event `0–65535`; `0 0 0 0` is not an event target.
- Install refuses an occupied exact classifier.
- Replace and Remove refuse a missing or checksum-changed exact classifier.
- Replace and Remove require confirmation; a locked script is left unchanged.
- Evaluate has no `OWNR`, uses a fresh VM, and cannot persist local variables.
- Yielding commands remain invalid in ownerless single-shot evaluation.
- Disconnect, Startup world, stale context, compilation failure, or mismatched
  validation disables applying.

## Related guides

- [Evaluate-now Scratchpad](tab_console.md)
- [Debugger](tab_debugger.md)
- [Scripts](tab_scripts.md)
- [Experiment Workspaces & Provenance](experiment_workspaces.md)
- [API Reference](api_reference.md)
- [CAOS Command Reference](caos_overview.md)
