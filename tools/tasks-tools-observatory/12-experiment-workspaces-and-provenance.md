# Task 12 — Experiment Workspaces and Provenance

Status: Completed

Depends on: Tasks 03, 06, 07, 09, and 11

## Goal

Turn ad hoc observation into a reproducible experimental workflow with an
explicit baseline, protocol, intervention history, and exportable provenance.

## Why this task exists

Creatures is non-deterministic, stateful, and highly sensitive to its
environment. A graph or striking moment is not persuasive unless the investigator
can say which world was used, when recording began, what changed, and how a
control differs from a treatment.

The tools should encourage careful curiosity without pretending that a saved
world makes every run deterministic.

## Feature scope

### Experiment workspace

An experiment workspace records:

- title, question, and optional hypothesis;
- source world and world type;
- engine build identifier and launch options;
- start tick, wall-clock start time, and initial game speed;
- selected creatures, agents, rooms, and signals;
- sampling intervals and recording gaps;
- interventions with exact world ticks;
- notes and bookmarks;
- result exports and references to saved world branches.

### Protocol builder

Allow a user to define:

1. baseline observation interval;
2. control and treatment subjects or worlds;
3. measurements to record;
4. intervention steps;
5. observation duration or stopping condition;
6. desired exports.

The builder should remain useful for informal investigation. A hypothesis is
encouraged, not mandatory.

### Baselines and comparison

Make it easy to:

- record before and after windows;
- keep an untreated control;
- compare repeated trials;
- branch from a named baseline world;
- annotate unavoidable differences between runs.

Do not claim bit-for-bit reproducibility when random state or external world
conditions are not captured.

### Provenance ledger

All mutating actions initiated through the tools should be eligible for the
experiment ledger, including:

- CAOS execution;
- chemical changes;
- genome or gene changes;
- script installation, replacement, or removal;
- pause, resume, speed, save, load, and branch operations.

The ledger distinguishes user action, requested operation, observed result, and
verification state.

### Export

Export a portable, non-proprietary manifest containing:

- protocol and metadata;
- recorded observations;
- intervention ledger;
- annotations and bookmarks;
- references to local worlds or assets without embedding proprietary content;
- explicit limitations and recording gaps.

## Safety and world handling

- Default experiments to a disposable or explicitly branched world.
- Warn before using a personal or non-disposable world.
- Never overwrite an existing named world without explicit confirmation.
- Do not offer deletion as an incidental part of creating an experiment.
- Make save/load/branch status and failure visible.
- Record when the world is paused and ensure completion or cancellation does not
  silently leave it paused.

## Technical direction

- Define a versioned experiment manifest independent of any one UI panel.
- Use the shared timebase and evidence model for every recorded measurement.
- Store lightweight metadata in the browser or an explicit export; do not assume
  that browser state is a durable scientific record.
- Provide engine operations needed for safe world naming, save, and branch
  workflows through narrow APIs.
- Include schema migration or a clear unsupported-version message.
- Make recording resilient to temporary disconnection and preserve visible gaps.

## Documentation and in-product guidance

- Document experiment manifests, protocols, baselines, controls, treatments,
  recording gaps, provenance, branching, save behaviour, and export limits.
- Add pop-up guidance at consequential steps explaining disposable worlds,
  name collisions, non-determinism, paused state, and what the export omits.
- Add a task guide for creating, running, annotating, exporting, and reopening a
  minimal reproducible experiment.
- Remove instructions that imply a saved world or repeated protocol guarantees
  deterministic replay.

## Deliverables

- Experiment workspace shell and protocol builder.
- Baseline, control, and treatment configuration.
- Intervention/provenance ledger.
- Annotation and bookmark support.
- Versioned manifest and data export.
- Safe world branch/save workflow.

## Acceptance criteria

- A user can define, run, annotate, and export a small before/after experiment.
- Every recorded point and intervention has a world tick or an explicit
  unavailable-time marker.
- A disconnected interval appears as a gap, not as interpolated evidence.
- Control and treatment data cannot be confused in graphs or exports.
- The workspace reports sources of non-reproducibility.
- No proprietary game data is embedded in an export by default.

## Verification

Completed on 2026-07-27:

- `cmake --build build -j2` completed successfully, including the new
  provenance and branch endpoints and the failed-save hardening in
  `World::Save`.
- `ctest --test-dir build --output-on-failure` passed all 477 native tests.
- `node --check` passed for the experiment model, provenance transport, and
  workspace, and `node --test tools/tests/*.test.cjs` passed all 12
  browser-model test files. Focused tests cover manifest schema validation,
  legacy migration, unsupported versions, arm separation, timing rules,
  non-interpolated gaps, ordered ledger verification, portable export, CAOS
  and genome redaction, and successful and failed transport requests.
- A fresh isolated undocked world named `Task12 Baseline` used the canonical
  four-Norn cohort: two male and two female Norns. Live API checks verified
  sanitized source/launch provenance, source confirmation, non-loading branch
  creation, collision rejection, and an explicit save-stage failure with no
  branch directory created. The forced read-only save failure originally
  exposed an archive assertion; the save path was hardened, rebuilt, and
  rerun, after which the engine returned a structured failure and remained
  alive.
- Firefox 152.0.6 ran a real control/treatment experiment using Norns 410 and
  414. It retained 84 observations split evenly between arms, continued
  explicit recording while the Experiments tab was hidden, recorded and
  verified pause/resume interventions, added a note and bookmark, stopped
  cleanly, and reopened a portable schema-v1 manifest with the same protocol
  labels, start/end times, and gap.
- The engine was shut down gracefully while baseline recording was active.
  Firefox observed the disconnection after the configured failure threshold,
  displayed an open gap, and closed it after the same isolated world
  reconnected. The gap retained wall-clock bounds and
  `interpolated: false`; missing creature requests during the outage remained
  explicitly unavailable rather than becoming guessed samples.
- A second Firefox run loaded the created branch during recording. The world
  switch cancelled the experiment, kept its six existing observations,
  retained an open non-interpolated `Active world changed during recording`
  gap, and recorded the world-load request. The test then restored
  `Task12 Baseline`, confirmed a connected session, normal speed, and a running
  engine.
- Firefox also exercised the personal-workflow controls, branch-name
  collision feedback, source/destination confirmation, successful creation of
  `Task12 Firefox Branch`, and the explicit separate load affordance. The
  created branch remained unloaded, appeared in both the manifest and a
  verified ledger entry, and no existing world was overwritten or deleted.
- Responsive checks passed at 720 × 814, 1600 × 914, and 1920 × 994 with all
  three experiment regions present, no captured browser runtime errors, and
  no horizontal page overflow. The 1600-pixel Firefox documentation
  screenshot was inspected before inclusion.
- `git diff --check` completed successfully. All tests used the disposable
  `/tmp` game-data copy; the engine ended resumed at speed 1 before final
  shutdown.

## Out of scope

- Claiming deterministic replay.
- Bundling worlds, genomes, saves, or proprietary assets into Git.
- Automating statistical conclusions.
