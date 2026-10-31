# Task 04 — Add Shared Selection and Cross-Navigation

Status: Completed

Depends on: Tasks 01 and 03

## Goal

Allow a user to select a world object once and follow its related evidence
across Creatures, Scripts, Debugger, Logs, Brain, Chemistry, Organs, Genome,
World, CAOS, and documentation.

## User problem

The current tools expose related systems in separate tabs. Users repeatedly
copy agent IDs, classifiers, chemical numbers, or monikers and then reconstruct
the relationship manually.

Navigation should preserve investigative context rather than reset it.

## Shared context

The context model should support:

- world and world tick;
- creature and agent;
- running script and event;
- classifier and gallery;
- room and metaroom;
- chemical;
- brain lobe, neuron, and tract;
- organ, reaction, receptor, and emitter;
- genome and gene;
- log record;
- timeline event.

Not every selection is simultaneously primary. Define a primary subject and
related secondary selections so choosing a chemical does not discard the
selected creature.

## Context strip

Provide a compact, persistent breadcrumb such as:

```text
DevTools Audit / Norn “eem” / Agent #422 / Room 680 / Chemical 149
```

Each segment should be navigable and individually clearable.

## Required cross-links

- Creature → its current agent, script, genome, brain, chemistry, organs, room.
- Script row → selected agent in Debugger.
- Log record with agent/script metadata → related inspector.
- Chemical → monitoring history, participating reactions, receptors, emitters,
  and genome genes.
- Drive → associated drive neuron and chemicals.
- Brain neuron/tract → genome structure and current activity.
- Gene → expressed living structure where that mapping is known.
- Room/agent in World → creature perception and CA context.
- Timeline event → the source panel at the recorded tick or nearest retained
  sample.

## Navigation behavior

- Back returns to the prior investigation, not merely the prior tab.
- Opening a detail may replace the center pane or use a side inspector; avoid
  spawning browser tabs by default.
- Preserve filters and scroll position when returning.
- Clearly state when a historical target no longer exists.
- Clear agent-scoped context on world change.
- Never re-target a newly created agent that reused a historical numeric ID.

## Technical direction

- Implement selection actions through the shared store.
- Add stable link-builder helpers rather than module-specific click behavior.
- Extend APIs with contextual identifiers only when the engine can supply them
  accurately.
- Use semantic mappings already shared by CAOS formatting, Brain, and creature
  data instead of duplicating lookup tables.

## Documentation and in-product guidance

- Add a Developer Tools guide to selection scope, context persistence,
  invalidation, pinning, and deep links.
- Add contextual tips to the shared context strip explaining what is selected,
  how fresh it is, and which views will follow it.
- Document each supported cross-link and the identifiers preserved during the
  transition.
- Retire instructions that require copying IDs between tabs when a contextual
  link now exists.

## Deliverables

- Shared context strip and clear controls.
- Cross-navigation service and route/history model.
- Initial links across Creatures, Scripts, Debugger, Logs, and Docs.
- Extension hooks for later World, Timeline, and Experiment tasks.
- Unit tests for context preservation and world reset.
- Updated module architecture documentation.

## Acceptance criteria

- Selecting a creature in Creatures makes it the subject in every applicable
  tool.
- Clicking a running script opens the correct agent and event in Debugger.
- Browser back restores the previous tool, selection, filters, and scroll
  position.
- A world load clears invalid context before rendering new-world data.
- A missing or dead agent produces a historical/missing state instead of
  selecting an unrelated agent.
- Cross-navigation does not require modules to query one another's DOM.

## Verification

- Follow a creature from Drives to Brain, active script, room, and genome.
- Follow an engine error to the relevant agent/script where metadata exists.
- Switch worlds while deep context is selected.
- Kill a disposable test agent and revisit its historical link.
- Test keyboard activation and browser back/forward behavior.

## Out of scope

- Full timeline retention.
- Ecology rendering.
- Inferring causal relationships.

## Implementation record

Completed 2026-07-27 on the `codex/developer-tools-observatory` worktree.

- Added world-qualified primary and related selections, `#observe?` deep
  links, History API workspace snapshots, a persistent context strip, and
  extension kinds for the later World, Timeline, and Experiment tasks.
- Added initial contextual handoffs across Creatures, Chemistry, Scripts,
  Debugger, structured Log records, Docs, and tooltip documentation links.
  Agent classifier/gallery and creature room/metaroom identifiers come from
  engine APIs rather than display-text parsing.
- Added historical missing-target and identity-reuse protection. World loads
  clear world-scoped selections and old Debugger evidence before new-world
  data renders; global chemical/classifier/gallery concepts may remain.
- Added
  `tools/docs/images/observatory/shared-context-creature-firefox.png`, captured
  in Firefox from an isolated disposable world.

Verification:

- `node --test tools/tests/*.test.cjs`: 4 test files passed.
- `node --check` for every changed JavaScript module: passed.
- `cmake --build build -j2`: passed.
- `ctest --test-dir build --output-on-failure`: 472/472 passed.
- `git diff --check` and `tools/docs/index.json` parsing: passed.
- Live isolated engine fixture:
  `/tmp/c3-observatory-task04-TAPvcx`, undocked disposable worlds
  `Task 04 Context` and `Task 04 Empty`, running at ×1. Verified the added
  `/api/scripts`, `/api/agent/:id`, and `/api/creatures` identity fields.
- Firefox 152.0.6: followed a disposable creature through Drives, Brain,
  Genome, Chemistry, and Debugger; selected a chemical and script by keyboard;
  restored tab, selection, filter/scroll state with Back/Forward; opened Docs
  in the same browser tab; resolved legacy and world-qualified startup deep
  links; rejected an old-world link; killed a disposable agent and observed
  the historical **MISSING** state; switched worlds and confirmed old Debugger
  source, context handles, variables, message parameters, and breakpoints were
  cleared.
- Firefox responsive checks passed at 720×900, 1440×1000, and 1920×1080 with
  no page overflow or captured page errors.

All game data, disposable worlds, transient screenshots, and browser profiles
remained outside Git.
