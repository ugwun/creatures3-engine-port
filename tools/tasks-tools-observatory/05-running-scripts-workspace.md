# Task 05 — Redesign the Running Scripts Workspace

Status: Completed

Depends on: Task 04

## Goal

Replace the wall of repeated full-source rows with a compact activity workspace
that answers which agents are executing, what they are doing now, and how to
inspect the relevant code.

## User problem

The current Scripts table renders the entire formatted CAOS source in every
row. A normal world may contain many agents running identical timer scripts, so
only a few agents fit on screen and the current instruction is difficult to
locate.

The common question is not “show me every copy of every complete script.” It
is:

- Which scripts are active?
- Which are waiting, blocked, paused, or changing rapidly?
- Which belong to my selected creature or agent?
- What statement is executing now?
- How do I open the exact script in Debugger?

## Compact row design

Each row should show:

- agent portrait or gallery name;
- agent ID and human-readable identity;
- classifier and event name;
- Running, Waiting, Blocking, Paused, or Finished;
- current source statement or small surrounding excerpt;
- bytecode IP behind an expert-details disclosure;
- wait/block reason when the engine can report it;
- current `IT` or `TARG` summary where meaningful;
- one-click focus and debugger actions.

## Grouping and filters

Support:

- grouping identical family/genus/species/event instances;
- collapsing a group to a count and state summary;
- prioritizing the shared selected creature/agent;
- filters for state, classifier, event, gallery, creature, and text;
- “changed since last refresh” and “newly started” filters;
- stable sorting that does not jump on every poll;
- an explicit option to show full source.

## State terminology

Review the current `running` and `blocking` distinction. Where possible,
separate:

- actively executing;
- sleeping on `WAIT`;
- blocked on animation or movement;
- paused at breakpoint;
- finished but retained briefly for history.

If the engine cannot identify the precise blocking primitive, display
“Waiting/blocking — reason unavailable” rather than guessing.

## Technical direction

- Continue to use structured `/api/scripts` data.
- Add current-statement and block-reason fields engine-side if they can be
  derived from VM state and debug information accurately.
- Avoid returning or formatting full source repeatedly when the client already
  has an identical classifier/event source cached.
- Virtualize large lists if real worlds exceed a practical DOM threshold.
- Route selection and debugger handoff through Task 04.

## Documentation and in-product guidance

- Update the running-scripts guide with row states, grouping, filters, source
  expansion, and debugger handoff.
- Add pop-up tips for owner, target, classifier, event, instruction pointer,
  blocked state, and paused VM terminology.
- Include a task guide for moving from a busy or failed script to its agent,
  logs, source, and breakpoint context.
- Remove documentation that depicts full source in every row or conflates a
  paused script VM with a paused world.

## Deliverables

- Compact grouped Scripts workspace.
- Search, filters, stable sort, and expansion.
- Current-statement extraction.
- Debugger and camera-focus handoff.
- Payload/cache improvements if required.
- Updated documentation and screenshots.

## Acceptance criteria

- At least 20 normal script rows fit in a standard 1600×1000 viewport.
- Identical timer-script instances can collapse into one group.
- The selected creature or agent remains easy to find.
- Every row opens the correct agent and event in Debugger.
- Auto-refresh preserves scroll, expansion, grouping, and filters.
- Source is fetched or formatted once per identical installed script where
  practical.
- A large active world does not cause visible refresh flicker.

## Verification

- Test a fresh DS world with many timer scripts.
- Test a creature with changing behavior scripts.
- Pause at a breakpoint and confirm state synchronization with Debugger.
- Finish or destroy an agent and confirm the historical transition.
- Measure DOM count, response size, and refresh rendering time.

## Out of scope

- Full historical ethology; Task 09 owns the timeline.
- Editing installed scripts.
- General log correlation; Task 06 owns it.

## Implementation record

Completed 2026-07-27 on the `codex/developer-tools-observatory` worktree.

- Replaced the repeated full-source table with compact, incrementally
  reconciled activity rows, classifier/event groups, stable ordering, shared
  selection priority, combined filters, expert details, camera focus, and
  exact Debugger handoff.
- Extended `/api/scripts` with a bounded current statement, source revision,
  blocking command/reason, TARG, IT, owner position, and capture tick. Source
  extraction handles the CR-only line endings used by Docking Station CAOS.
- Kept the API's existing `running`, `blocking`, and `paused` states for
  compatibility. The browser labels only an exact `WAIT` command as
  **Waiting** and derives New, Changed, and five-second Finished history from
  successful successive samples.
- Added lazy full-source loading cached by classifier/source revision,
  active-tab-only polling, stale-response/world guards, retained last data on
  request failure, and DOM reuse across membership changes.
- Rewrote the Scripts guide, API and architecture notes, in-product tips, and
  replaced `tools/docs/media/tab_scripts.png` with a Firefox capture from the
  disposable test world.

Verification:

- `node --check` for every changed JavaScript module: passed.
- `node --test tools/tests/*.test.cjs`: 5 test files passed.
- `cmake --build build -j2`: passed.
- `ctest --test-dir build --output-on-failure`: 476/476 passed, including four
  new `DebugServerLogicTest` source-extraction cases.
- `git diff --check` and `tools/docs/index.json` parsing: passed.
- Live isolated engine fixture:
  `/tmp/c3-observatory-task05-XPwxzX`, undocked disposable world
  `Task 05 Scripts`, running at ×1 with two disposable Chichi Norns. A normal
  25-script sample was about 6.5 KiB and its longest mapped statement was 74
  characters. WAIT, OVER, APPR, ordinary running, breakpoint, and destroyed
  agent states were inspected.
- Firefox 152.0.6: 20–21 normal rows fit at 1600×1000; identical instances
  collapsed; selection and stable DOM/scroll survived polling; classifier,
  event, gallery, creature, state, and text filters worked; installed source
  was requested once per unique classifier/revision; Focus and exact Debugger
  handoff worked; Back restored workspace state; hidden Scripts stopped
  updating its sample; a simulated network failure retained stale data and
  recovered; and world pause/resume left the workspace usable.
- Firefox breakpoint fixture agent `#1633` synchronized as **Paused** at
  bytecode IP 8, resumed with its breakpoint cleared, appeared briefly as
  derived **Finished** after destruction, and retired after the bounded
  history window.
- Firefox responsive and clipping checks passed at 720×900, 1600×1000, and
  1920×1080. The final pass reported no captured page errors or unhandled
  rejections, and the screenshot was inspected manually.

The world was left resumed at ×1. Game data, the disposable world, custom
agent/script fixture, transient automation, browser profile, and runtime
captures remained outside Git.
