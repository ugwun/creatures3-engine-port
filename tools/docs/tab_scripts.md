# Running Scripts Workspace

The **Scripts** workspace is a compact, live inventory of agent CAOS virtual
machines. It answers which owners are active, what classifier/event each VM is
executing, what source statement is currently mapped, and where to inspect it
next.

![Compact grouped Running Scripts workspace in
Firefox](/docs/media/tab_scripts.png)

## Reading a Row

Each compact row shows:

| Field | Meaning |
|---|---|
| Owner | Catalogue identity or gallery name plus the engine's unique agent ID |
| Classifier | Exact script family, genus, species, and event |
| Event | Catalogue event name when one is available |
| State | Running, Waiting, Blocking, Paused, or recently Finished |
| Statement | Source line mapped near the observed bytecode instruction pointer |
| Focus | Moves the game camera to the owner; it does not change simulation state |
| Debugger | Opens the exact owner, classifier, and event in Debugger |
| Details | Reveals IP, blocking command/reason, TARG, IT, capture tick, and full source |

The shared selected agent is moved to the top, marked **Selected**, and kept
expanded inside its classifier group.

## State and Evidence Terminology

- **Running** is the engine's directly reported non-blocking VM state. The
  sample observes the VM between scheduler yields; it is not a CPU profiler.
- **Waiting** is used only when the engine reports that the blocking command is
  `WAIT`.
- **Blocking** means another command is retaining the VM across ticks. `OVER`
  is labelled as waiting for animation completion. For other commands, the UI
  shows the command and **Reason unavailable** instead of guessing.
- **Paused** means this one agent VM is stopped at a Debugger breakpoint. The
  world can still be running; use the global session ribbon for world pause.
- **Finished** is derived when a previously observed instance disappears from
  the next `/api/scripts` samples. It remains for five seconds and is not a
  direct engine completion event.
- **New** and **Changed** are also derived from successive samples. Changed
  compares state, IP, statement, blocking command, TARG, and IT.

The status line reports the API capture tick, active count, response payload
size, request time, render time, and recently finished count. A script row's
exact capture tick is available under **Details**.

## Grouping, Filtering, and Stable Refresh

**Group identical** combines instances with the same
family/genus/species/event classifier. Groups with multiple owners begin
collapsed and show a count plus state summary. Activate the group header to
expand it. Single-instance classifiers stay as direct rows.

Filters can be combined:

- free text searches owner ID/name, gallery, classifier, event, statement,
  blocking command/reason, TARG, and IT;
- State selects one normalized VM state;
- Classifier, Event, and Gallery/kind have dedicated filters;
- Creatures limits owners to agent family 4;
- Changed and New use the derived successive-sample flags.

Rows keep a stable first-observed order, except that the shared selected owner
is deliberately prioritized. Auto-refresh reconciles membership while reusing
existing row DOM, preserving focus, scroll, expanded details, source
disclosure, grouping, and filters.

## Full Source and Payload Behavior

The normal `/api/scripts` response contains only the mapped current statement,
not a copy of every full script. **Load full source** uses the installed
script's classifier endpoint. The browser caches and formats one source per
classifier plus source revision, so identical owners reuse it. The global
**Full source** option expands sources for visible rows and remains explicitly
opt-in.

## Workflow: Busy or Failed Script to Context

1. Open **Scripts** and leave **Group identical** enabled to see which
   classifiers dominate the active population.
2. Filter by a state, gallery, event, or **Changed**. A runtime failure may
   already have finished, so also check the contextual [Log](tab_log.md).
3. Expand the classifier group and identify the owner. If it is the current
   shared selection, look for the orange **Selected** row.
4. Open **Details**. Record the observed tick, exact classifier, IP, TARG/IT,
   and any blocking command/reason. Load full source only if the statement is
   insufficient.
5. Choose **Debugger**. The handoff preserves owner identity, classifier,
   event, gallery, and shared investigation context.
6. In Debugger, inspect variables and source. Set a breakpoint deliberately;
   **Paused** will then synchronize back to Scripts on its next sample.
7. Use browser **Back** to restore Scripts filters, grouping, expansions, Auto
   setting, and scroll position.

For a failed script, treat a Log error record as separate observed evidence.
Task 06 adds richer log time/context correlation; this workspace does not infer
that a changed statement caused a logged failure.

## Empty, Disconnected, and Historical States

A successful empty sample transitions prior rows to recently Finished, then
removes them after five seconds. A network/API failure does not falsely finish
everything: the last sample remains visible and the status line says
**Disconnected/stale**. A world transition clears all script activity before
new-world data renders.

The workspace polls only while Scripts is active and Auto is enabled. Manual
refresh remains available when Auto is off.
