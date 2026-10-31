# Task 01 — Define the Observatory State and Evidence Model

Status: Completed

## Goal

Define the shared state, time, identity, and evidence contracts required by all
observatory features before new panels begin storing overlapping versions of
the same information.

## Why this comes first

The existing modules fetch and render their own data independently. That works
for isolated tabs, but an ethology timeline, shared context bar, comparison
view, experiment ledger, and ecology map all need the same definitions of:

- active world;
- selected creature and agent;
- simulation time;
- sample freshness;
- direct versus derived versus inferred information;
- intervention provenance.

Without this task, later features will disagree about identity, time, stale
data, and what counts as evidence.

## Scope

### State domains

Define documented shapes for:

- engine connection and pause state;
- world identity, type, ticks, speed, and load transition;
- selected creature, agent, script, chemical, brain element, gene, and room;
- current sample and bounded history;
- recording and experiment state;
- intervention records;
- navigation origin and return target;
- user display preferences.

### Evidence metadata

Every derived presentation must be able to state:

- evidence level: observed, derived, inferred, or unknown;
- source endpoint or engine event;
- world and tick at capture;
- sample interval when derived from polling;
- supporting values for an inference;
- confidence when a heuristic is used.

### Shared browser store

Introduce a small observable store or formally extend `DevToolsEvents`.

Required behavior:

- immutable state snapshots;
- narrowly scoped subscriptions;
- no module-to-module DOM queries;
- preservation of selection across tab changes;
- explicit reset on world load or disconnect;
- deduplication of concurrent requests for shared data;
- testable state transitions.

This task should not introduce a large framework. The existing zero-dependency
browser architecture remains a constraint unless a separate decision changes
it.

## Technical direction

- Add a dedicated module such as `observatory_state.js`.
- Load it after `utils.js` and before feature modules.
- Keep transport fetching separate from state reduction.
- Use stable compound keys such as `worldName:agentId`.
- Never assume an agent ID remains meaningful after a world switch.
- Normalize world ticks as integers and wall time as ISO-8601 strings.
- Define a bounded-history policy, but do not implement full timeline storage
  until Task 07 and Task 09.

## Documentation and in-product guidance

- Add a Developer Tools reference page for the shared session, selection,
  timebase, freshness, and evidence-level contracts.
- Add a reusable pop-up/help-drawer explanation for **Observed**, **Derived**,
  **Inferred**, and **Unknown**, including one Creatures-specific example of
  each.
- Define the exact badge labels, concise descriptions, and accessible names that
  later tasks must reuse.
- Remove or revise guidance that presents every displayed value as equally
  direct or current.

## Deliverables

- State and event contract documentation.
- Shared store implementation.
- Selection and world-reset reducers.
- Evidence metadata helpers.
- Fresh/stale calculation helpers.
- Unit tests for state transitions and subscription behavior.
- Architecture documentation describing ownership of shared state.

## Acceptance criteria

- Two modules can consume one shared creature snapshot without duplicate
  polling.
- Selecting a creature survives navigation between existing tools.
- Loading another world clears agent-scoped selections before new data renders.
- Every stored sample includes world identity and tick metadata.
- Inferred data cannot be stored without an inference label and supporting
  evidence field.
- Disconnection marks samples stale rather than presenting them as live.
- The implementation adds no unbounded arrays or permanent polling loops.

## Verification

- Unit-test selection, disconnect, reconnect, and world-switch transitions.
- Simulate out-of-order responses and verify older samples do not overwrite
  newer ticks.
- Verify no-world and Startup-world states.
- Inspect browser network activity to confirm shared consumers do not duplicate
  requests.

## Out of scope

- Final navigation design.
- Long-term recording and export.
- Interpretation of specific biological values.
- Any world or creature mutation.
