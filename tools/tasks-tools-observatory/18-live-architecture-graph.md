# Task 18 — Live Architecture Graph

Status: Completed

Depends on: Tasks 04, 16, and 17

## Goal

Connect the static explanation of engine architecture to the live object, data,
and execution context currently being investigated.

## Why this task exists

An architecture diagram is useful for orientation, but it becomes far more
valuable when a user can trace a selected creature's data from the engine,
through an API and stream, to a panel or graph. Conversely, a live panel should
make it possible to discover where its information originates and what its
limitations are.

The graph must remain honest: static relationships are not evidence that a
particular runtime path was exercised.

## Feature scope

### Layered architecture graph

Represent selectable layers such as:

- world and engine subsystems;
- creatures, agents, scripts, map, biochemistry, and brain domains;
- observatory REST and event-stream endpoints;
- shared browser state and recording pipeline;
- feature surfaces and exports;
- MCP adapter relationships where relevant.

Users can filter layers so the graph remains comprehensible.

### Live-context highlighting

When opened from a panel or selected entity, highlight:

- the panel and API/stream it consumes;
- the engine domain that supplies the data;
- selected identifiers and sample tick;
- active recording or transformation stages;
- known derived or inferred steps.

Use different styles for static documentation, observed live activity, and
inferred relationships.

### Bidirectional navigation

Graph nodes can link to:

- the corresponding tool surface;
- contextual help and task guides;
- API or MCP documentation;
- relevant repository source locations when available;
- live agent, creature, room, script, or experiment context.

Source links should use maintained metadata rather than guessed filenames.

### Data-path inspector

For a selected metric, show a compact path such as:

engine value → API field → shared sample → derived display → recording export

At each step include unit, transformation, cadence, and evidence level.

## Interaction and accessibility

- Support pan, zoom, search, fit-to-selection, and layer filters.
- Provide a text/tree representation with the same information.
- Make nodes and edges keyboard reachable.
- Avoid relying on colour alone to distinguish relationship types.
- Keep the graph responsive for the documented node count.

## Technical direction

- Define architecture data as versioned structured metadata, not coordinates
  embedded in drawing code.
- Separate static relationships from live telemetry.
- Let feature and API definitions contribute stable node identifiers and links.
- Treat source-location metadata as optional and validate it during development.
- Do not add costly general tracing solely to animate the graph; use existing
  request, stream, and recording information first.
- Render large sections on demand.

## Documentation and in-product guidance

- Document the architecture model, layers, node/edge vocabulary, evidence
  styling, live telemetry limits, text view, and source-link maintenance.
- Add contextual tips that distinguish static architecture, observed activity,
  derived transformations, and inferred relationships.
- Add a guide for tracing a selected live metric from engine value through API,
  browser state, display transformation, and export.
- Remove diagrams or captions that imply a static connection proves a runtime
  path was exercised.

## Deliverables

- Structured architecture model.
- Layered interactive graph and equivalent text view.
- Live-context and evidence highlighting.
- Bidirectional tool, documentation, API, and source links.
- Metric data-path inspector.
- Graph integrity and accessibility tests.

## Acceptance criteria

- From a live metric, a user can identify its engine domain, transport,
  transformations, and UI consumer.
- Static, observed, and inferred relationships are visibly distinct.
- Every displayed link resolves or is explicitly unavailable.
- The graph is usable without a pointing device or colour perception.
- Opening the graph with no engine connection still provides the static
  architecture.
- Live highlighting never claims that an unobserved runtime path was executed.

## Verification

- Validate unique node/edge identifiers, link targets, source paths, and cycles
  where the model disallows them.
- Test context handoff from creature biology, world ecology, running scripts,
  logs, and experiment recording.
- Compare live highlighting with network and engine observations in an isolated
  session.
- Test disconnected, partial-capability, reduced-motion, and narrow-screen
  states.

## Out of scope

- A complete call graph of the C++ engine.
- Full distributed tracing.
- Editing engine architecture from the graph.

## Implementation record

Completed on 2026-07-28.

### Delivered

- Replaced the mutable 21-class drawing with a versioned 48-node,
  51-relationship architecture model covering engine, domain, transport,
  browser, surface, and external layers. Layout is derived from layer and
  order; the model contains no drawing coordinates.
- Added layer filters, search, pointer and keyboard pan/zoom, Fit all, Fit
  selection, arrow-key node navigation, keyboard-reachable SVG
  relationships, and a 48-node equivalent text view.
- Separated reviewed static structure, recently observed successful mapped
  requests, mechanical derived transformations, inferred relationships,
  investigation context, and the selected documentary path. Selecting or
  carrying a path never promotes it to observed execution.
- Added bounded Resource Timing highlighting without response-body retention,
  fetch wrapping, or engine tracing. Exact session, creature, observation,
  chemistry, brain, ecology, scripts, event-stream, experiment, genetics, and
  CAOS endpoint families are mapped for 30 seconds.
- Added six reviewed metric paths for creature drives, chemicals, ecology CA,
  running scripts, structured logs, and experiment recording. Every step
  states owner, field, unit, transformation, cadence, and evidence.
- Added inspectors and maintained links to named tools, contextual help, and
  built-in references. Repository source locations are displayed as validated
  metadata and explicitly unavailable as browser links.
- Added **Trace data path** to contextual help with world, stable selections,
  and tick cursor/range preservation. Added the Live Architecture reference,
  observe-only tracing guide, task-guide entry, five graph-specific help
  definitions, updated architecture/tool documentation, and a Firefox
  screenshot.

### Review corrections

- Synchronized both `hidden` semantics and display styling for Docs subviews
  and stopped the Docs controller from re-hiding a toolbar already activated
  by the shell, restoring keyboard focus to graph controls.
- Added selected creature, agent, chemical, room, script, genome, log-record,
  and timeline-event domain context without labelling selection alone as
  observed execution; corrected the agent component's stable ID.
- Kept an explicit all-layers-off state empty instead of silently restoring
  every layer.
- Ignored known HTTP failures when classifying observed data activity, so a
  failed endpoint cannot imply a successfully exercised data path.
- Limited the retained-chemical path override to creature/chemical
  investigations, preserving Ecology, Scripts, Logs, and Experiment handoffs.
- Restored focus after graph/text node or relationship selection, added
  selected-state semantics to the text view, and allowed the three contextual
  help actions to wrap on narrow screens.

### Verification

- `node --test tools/tests/*.test.cjs`: 19/19 suites passed.
- `ctest --test-dir build --output-on-failure`: 488/488 tests passed.
- JavaScript syntax checks, JSON parsing, unique HTML IDs, maintained source,
  route/help/document link validation, DAG validation, documentation
  integrity, and `git diff --check` passed.
- Firefox 152.0.6 against the isolated `headlessTest` world:
  - rendered model v1 with 48 nodes, 51 keyboard-reachable relationships, six
    layer filters, four text-labelled evidence styles, and six selectable
    metric paths;
  - highlighted recent successful Session, Creatures, Observation, Chemistry,
    and Scripts requests separately from selected creature/chemical context
    and derived consumers;
  - exposed metric units, transformations, cadence, and evidence, and kept
    source paths visibly unavailable as browser links;
  - verified all-layers filtering, search plus real Escape clearing,
    arrow-key node movement, Enter relationship inspection, text-view parity,
    Fit selection, named tool links, and browser Back restoration;
  - preserved creature and ticks 1000–1300 through contextual
    **Trace data path**, and verified Ecology, Scripts, Logs, and Experiment
    handoffs to their distinct reviewed paths;
  - verified reduced-motion rules and 720×900, 1600×940, and 1920×1080 layouts
    without document-level horizontal overflow;
  - captured no JavaScript errors or unhandled promise rejections and applied
    no intervention, experiment, CAOS, genome, or other world mutation.
- With the real engine stopped while Firefox remained loaded, all 48 static
  nodes, 51 relationships, and the selected five-step metric path remained
  usable in text view while connection status explicitly reported
  disconnected and no live execution was claimed.
- Before final shutdown, the disposable world was running at speed ×1 and was
  not paused. The engine and Firefox were then stopped cleanly.

Documentation screenshot:

![Task 18 Live Architecture Graph verified in
Firefox](/docs/images/observatory/live-architecture-graph-firefox.png)
