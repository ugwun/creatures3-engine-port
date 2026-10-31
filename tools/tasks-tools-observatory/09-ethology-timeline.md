# Task 09 — Build the Ethology Timeline

Status: Completed

Depends on: Tasks 06–08

## Goal

Create a bounded, scrubbable history of observed creature behavior and its
environmental, neural, scripted, and physiological context.

## User problem

Creatures behavior is temporal. A static snapshot can show a current drive or
decision but cannot reveal whether it preceded an action, resulted from it, or
was merely sampled at the same time.

The timeline should make event order inspectable while remaining honest about
polling gaps and concurrent processes.

## Timeline contents

Record or derive events such as:

- life-state and age-stage changes;
- highest-drive changes and threshold crossings;
- attention and decision winner changes;
- current `IT` or target changes;
- creature script/event start, block, resume, and finish;
- meaningful movement between rooms/metarooms;
- interaction messages such as pickup, eat, hit, activate, or speech;
- large pinned chemical changes;
- reward and punishment pulses;
- organ impairment/failure;
- births, deaths, and mating-related lifecycle events;
- explicit user interventions;
- log errors correlated with the selected subject.

## Evidence representation

Each timeline item includes:

- world and tick range;
- observed, derived, or inferred label;
- source records;
- subject and related agents;
- uncertainty or sampling gap;
- before/after values where applicable;
- intervention correlation ID when relevant.

Items derived from polling must say that the transition occurred between two
sample ticks, not at an invented exact tick.

## Interaction design

- Scrub by world tick.
- Zoom between individual instructions/events and longer behavior periods.
- Filter by environment, perception, neural, action, physiology, lifecycle,
  intervention, and error.
- Select an event to reconstruct the nearest retained observation strip.
- Bookmark, annotate, and export ranges.
- Compare live state with the selected historical tick.
- Make gaps and recording pauses visually explicit.

## Recording policy

- Keep a bounded rolling buffer by default.
- Allow an explicit named recording session with a configured duration or
  memory limit.
- Warn before an accelerated run exceeds the chosen resolution.
- Do not persist recordings into proprietary world saves by default.
- Export observations separately as repository-safe JSON/JSONL/CSV where the
  data does not embed proprietary assets or genomes.

## Technical direction

- Reuse Task 07 series and Task 06 structured records.
- Add a pure event-reduction layer that converts successive samples into
  derived transitions.
- Prefer explicit engine events when they exist.
- Store raw source references or compact source snapshots for auditability.
- Implement interval queries and downsampling.
- Avoid recording full brain and chemistry payloads for every creature unless
  explicitly configured.

## Documentation and in-product guidance

- Document event lanes, sampling sources, evidence styles, recording limits,
  gaps, bookmarks, scrubbing, and export/reload semantics.
- Add contextual tips for inferred transitions, concurrent events, incomplete
  intervals, and the selected historical versus live time cursor.
- Add a guide for constructing and reviewing an evidence-based behavioural
  episode without turning sequence into proof of causation.
- Remove timeline guidance that implies sampled transitions are exact engine
  events.

## Deliverables

- Recording controls and bounded history.
- Timeline rendering, filters, zoom, and scrub.
- Event-reduction library.
- Annotation and export.
- Historical observation reconstruction.
- Automated tests for ordering, gaps, derivation, and bounds.

## Acceptance criteria

- A user can follow one eating or sleeping sequence across several systems.
- Derived transitions expose their sample interval.
- Explicit events take precedence over weaker polling inference.
- Recording gaps cannot be mistaken for inactivity.
- Timeline selection cross-navigates to source inspectors.
- Default recording remains within documented CPU and memory limits.
- Export contains enough provenance to reproduce the displayed sequence.

## Verification

- Record normal, paused, accelerated, disconnected, and world-switch sessions.
- Exercise a sequence involving room movement and an interaction target.
- Compare event order with direct script and chemistry inspection.
- Export and reload a recording without the original live engine.
- Test long runs and verify bounded storage/downsampling.

## Out of scope

- Claiming psychological intent.
- Unlimited archival storage.
- Automated intervention based on detected behavior.

## Implementation

- `ethology_timeline.js` provides the pure, bounded reducer, interval queries,
  explicit-event precedence, display downsampling, session/epoch isolation,
  annotations, and versioned JSON/JSONL/CSV codecs.
- `timeline_workspace.js` supplies the nine-lane live/offline workspace,
  polling lifecycle, filters, scrub/zoom controls, nearest atomic observation
  reconstruction, source navigation, and recording limits.
- The atomic creature observation now includes life-faculty age stage and tick
  age. Normalized structured Log records and shared interventions feed the
  subject-qualified timeline.
- Documentation, contextual tips, and a Firefox screenshot live in
  `tools/docs/ethology_timeline.md`.

## Verification completed

- Pure reducer coverage exercises transition ordering and uncertainty,
  script start/block/resume/finish, gaps, explicit-event precedence,
  interventions, world/subject/tick-regression isolation, hard bounds,
  downsampling, bookmarks/annotations, nearest snapshots, and JSON/JSONL
  offline round trips.
- Firefox 152 verified live normal, engine-paused, 8x accelerated,
  recording-paused, disconnected, and world-switch states. It also verified
  historical scrubbing, all nine lanes, seven reconstructed stages,
  annotations, source cross-navigation and Back, offline reload, and no
  horizontal page/panel overflow at 720, 1600, and 1920 pixels.
- The accelerated warning refreshes on speed-only changes. Gaps explicitly
  say that missing samples are not inactivity.
- `cmake --build build`, the browser-model suite, and the full CTest suite
  pass.
