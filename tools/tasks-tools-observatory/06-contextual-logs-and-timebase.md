# Task 06 — Correlate Logs with Engine Context

Status: Completed

Depends on: Tasks 03 and 04

## Goal

Turn the log stream into time-aligned investigative evidence that can be
correlated with worlds, agents, scripts, interventions, and timeline events.

## User problem

The current Log tab is useful for raw engine output but is dominated by
bootstrap messages in a fresh world and uses a separate relative-time concept
from creature and world observations. It cannot reliably answer what world
tick, agent, or script a message relates to.

## Unified timebase

Every new structured log record should carry as much of the following as the
source can supply:

- world name;
- world tick;
- system tick;
- wall-clock time;
- category and severity;
- agent ID and classifier;
- script classifier/event and source location;
- correlation ID for an intervention or API request.

Legacy unstructured messages remain supported and are explicitly marked when
context is unavailable.

## Log workspace behavior

Add:

- severity separate from subsystem category;
- stable filters for world, agent, classifier, event, and time range;
- bookmarks and annotations;
- “since world load” and “around selected tick” ranges;
- duplicate collapse for repetitive messages;
- context preview before following a link;
- links to the related Agent, Script, Debugger, Timeline, or Experiment record;
- export as structured JSON/JSONL in addition to readable text.

The existing category and text filters remain available.

## Stream semantics

- Rename the local control **Pause stream**.
- Show the number and time range of buffered records.
- State clearly that pausing the stream does not pause the simulation.
- Preserve records while switching tools within a bounded memory policy.
- Mark gaps caused by disconnect, buffer overflow, or server restart.

## Technical direction

- Preserve SSE for live delivery.
- Introduce a structured envelope while retaining compatibility with raw
  FlightRecorder text.
- Centralize parsing and timestamp normalization.
- Bound browser and server buffers by both count and approximate memory.
- Add correlation metadata at important DebugServer and intervention call
  sites.
- Do not parse agent IDs from arbitrary log text when structured metadata is
  available.

## Documentation and in-product guidance

- Document the structured log schema, time fields, correlation identifiers,
  retention limits, dropped-record markers, and export format.
- Add contextual tips for world tick versus wall time, stream pause versus
  simulation pause, and gaps caused by disconnection or overflow.
- Add a guide for tracing a log record to its agent, script, source, and
  timeline position.
- Remove examples that imply browser receipt time is the time an engine event
  occurred.

## Deliverables

- Structured log envelope and compatibility path.
- Unified tick/wall-time display.
- Context filters and cross-links.
- Duplicate collapse and gap markers.
- JSONL export with metadata.
- Tests for parsing, ordering, buffering, and reconnection.

## Acceptance criteria

- A record with agent/script context can open the correct inspector.
- A user can show logs around a selected timeline tick.
- World loads visibly divide log sessions.
- Buffer pause and simulation pause are unambiguous.
- Disconnects create explicit gaps instead of silently joining unrelated
  records.
- Export preserves tick and context metadata.
- Legacy text-only records remain readable.

## Verification

- Capture startup, world load, CAOS error, breakpoint, intervention, save, and
  graceful shutdown records.
- Disconnect and reconnect the browser during active logging.
- Generate repeated messages and verify collapse without losing counts.
- Compare exported tick ordering with world state.
- Verify memory bounds during a long accelerated run.

## Out of scope

- General-purpose engine tracing.
- Persisting unlimited logs in world saves.
- Replacing existing FlightRecorder categories.

## Completion record

Implemented on 2026-07-27.

- Added a versioned structured envelope with wall/monotonic/world/system time,
  severity, subsystem, source, correlation, and structured agent/script
  context while retaining `t`, `cat`, and `msg`.
- Added world boundaries, composite SSE IDs, `Last-Event-ID` replay, explicit
  restart/overflow gaps, UTF-8-safe serialization, and count/byte bounds on
  both server and browser.
- Moved Log out of the shell into a pure tested model and dedicated workspace
  with stable filters, time ranges, duplicate collapse, preview-before-follow,
  bookmarks, annotations, and JSON/JSONL/text export.
- Correlated CAOS execution, breakpoint, step/continue, simulation
  pause/resume, world load/save, and graceful server shutdown actions.
- Verified focused C++ and browser-model tests, full Firefox interaction at
  720×900, 1600×1000, and 1920×1080, live rendering pause with continuing
  ingestion, world boundaries, structured Agent/Scripts/Debugger links,
  reconnect replay and restart gaps, and invalid legacy UTF-8 traffic.
