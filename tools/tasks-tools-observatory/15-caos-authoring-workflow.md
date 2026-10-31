# Task 15 — CAOS Authoring Workflow

Status: Completed

Depends on: Tasks 04, 05, 06, and 12

## Goal

Unify CAOS exploration, execution, script installation, and debugging into a
workflow that makes execution context and world-changing consequences obvious.

## Why this task exists

The tools currently expose both a scratchpad-style console and a script-focused
IDE, but their relationship is not immediately clear. “Run” can mean executing
an ownerless command now or installing event code for later, and errors often
force the user to search elsewhere for context.

CAOS should remain powerful while becoming easier to reason about as a live
intervention in an autonomous world.

## Feature scope

### Explicit execution modes

Present distinct modes within a CAOS workbench:

- **Evaluate now** — run source immediately in a fresh, ownerless VM;
- **Inspect or debug** — attach context to a selected running script;
- **Install event script** — validate and install into the scriptorium;
- **Replace event script** — show existing source and a diff before replacement;
- **Remove event script** — show the exact classifier and event with confirmation.

Each mode must explain owner, target, blocking behaviour, and persistence.

### Context bar

Show the current:

- world and tick;
- paused/running state;
- selected agent and classifier;
- owner and target bindings, when applicable;
- script classifier and event;
- experiment recording state.

Stale or invalid contexts prevent execution rather than silently retargeting it.

### Validation and preview

Before a mutating or persistent operation:

- parse or compile when the engine supports it;
- identify syntax location and provide nearby reference help;
- preview classifier/event ownership;
- show an existing-script diff;
- warn about commands with broad or destructive effects;
- allow a deliberate pause-before-run option.

Validation is not a claim that runtime behaviour is safe.

### Authoring assistance

Provide:

- command and parameter completion from a versioned command inventory;
- inline signatures and concise descriptions;
- links to fuller reference material;
- saved local snippets with clear scope;
- format and indentation assistance that preserves CAOS syntax;
- insertion of selected identifiers without manual copying.

### Execution results and debugging handoff

Results should include status, output, error location, world tick, and elapsed
simulation interval. From an error or running script, the user should be able to
open logs, the script workspace, selected agent, or debugger at the same context.

### Provenance

World-changing executions can be recorded in the experiment ledger with source
text or a checksum, execution mode, context, tick, and observed result. Secrets
or proprietary payloads must not be captured inadvertently.

## Technical direction

- Represent execution mode and bindings explicitly in API requests.
- Keep validation and execution as separate operations with independent results.
- Derive command assistance from the engine's actual registered command metadata
  where possible; version any maintained supplemental descriptions.
- Reuse the running-script and log correlation identifiers.
- Make install, replace, and remove idempotence and failure semantics explicit.
- Preserve a compact scratchpad path for expert use.

## Documentation and in-product guidance

- Update CAOS documentation around the explicit Evaluate, Debug, Install,
  Replace, and Remove modes and their owner, target, persistence, and blocking
  semantics.
- Add inline command help and contextual tips for bindings, validation limits,
  classifier/event identity, mutation risk, and experiment recording.
- Add separate task guides for evaluating a read-only expression and safely
  installing, inspecting, replacing, or removing an event script.
- Remove wording that treats the scratchpad, running-script debugger, and
  scriptorium as interchangeable execution contexts.

## Deliverables

- Unified CAOS workbench with explicit modes.
- Shared execution context bar.
- Validation, diagnostics, and existing-script diff.
- Command completion and contextual reference.
- Debugger, logs, and script-workspace handoffs.
- Experiment provenance integration.

## Acceptance criteria

- A new user can distinguish immediate evaluation from scriptorium installation
  before running any code.
- The exact owner, target, classifier, event, and persistence model are visible
  when relevant.
- Replacing or removing a script always identifies the existing target.
- Syntax and runtime errors link to the responsible source and surrounding
  context.
- Stale selections and changed worlds cannot receive an accidental execution.
- Expert users can still execute a short ownerless snippet without navigating a
  multi-step wizard.

## Verification

- Unit-test execution-mode requests, context invalidation, validation errors,
  diffs, and provenance redaction.
- In an isolated world, evaluate a read-only expression, install a temporary
  event script, inspect it in the running-scripts workspace, and remove it.
- Verify failure paths for missing owner, stale agent, invalid classifier,
  syntax error, runtime error, disconnect, and repeated submission.

## Out of scope

- Making arbitrary CAOS execution intrinsically safe.
- Replacing the complete CAOS language reference.
- Changing CAOS runtime semantics.

## Implementation and verification record

Completed with an explicit five-mode CAOS Workbench, a guarded read-only
Scratchpad, checksum-bound engine endpoints, conditional exact-event mutation,
redacted experiment provenance, and result handoffs. Existing editor
completion, F1 help, formatting, local files, scriptorium browsing, and
breakpoints remain available.

Verification covered the pure request/risk/diff model, provenance redaction,
C++ context and mutation guards, compilation, a disposable live world, and
actual Firefox 152.0.6. The live suite evaluated ownerless source, exercised
pause restoration, installed/replaced/removed a temporary exact event, and
confirmed failures for checksum drift, unacknowledged mutation, changed world,
missing target, syntax error, duplicate install, stale replacement, and
unconfirmed removal. Firefox covered final dialogs and cancellation,
Scratchpad handoff, output handoffs, disconnect blocking, no console errors,
and 720×900, 1600×914, and 1920×1080 layouts.

Screenshot:
`tools/docs/images/observatory/caos-workbench-firefox.png`.
