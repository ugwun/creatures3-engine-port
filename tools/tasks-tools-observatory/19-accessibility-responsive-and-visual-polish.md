# Task 19 — Accessibility, Responsive Design, and Visual Polish

Status: Completed

Depends on: Tasks 16, 17, and 18

## Goal

Make the completed observatory coherent, legible, keyboard-accessible, and
usable across practical viewport sizes and extended investigative sessions.

## Why this task exists

Scientific tools fail when status is encoded only by colour, tables become
unusable without a mouse, or dense data disappears on a smaller screen.
Accessibility is also a test of conceptual clarity: every chart, control, and
state should have a meaningful name and non-visual representation.

This task provides a systematic pass after the major workflow and navigation
changes, while earlier tasks remain responsible for basic accessible
implementation.

## Feature scope

### Keyboard and focus

- Provide logical tab order and visible focus.
- Support navigation, selection, chart inspection, dialogs, and dismissals
  without a mouse.
- Restore focus after dialogs and route transitions.
- Avoid global shortcuts while focus is inside editable controls.
- Publish a discoverable shortcut list and allow conflicts to be disabled.

### Screen-reader semantics

- Give controls and changing status regions meaningful accessible names.
- Use correct table, heading, tab, dialog, and live-region semantics.
- Provide textual summaries and data tables for charts and maps.
- Announce connection, recording, mutation result, and validation changes
  without excessive chatter.

### Colour, contrast, and motion

- Meet the chosen project contrast target for text and essential indicators.
- Never rely on colour alone for evidence level, freshness, selection, or error.
- Support reduced motion for animated traces and graph transitions.
- Use consistent semantic colours across light and dark presentation.

### Responsive behaviour

Define and test layouts for:

- narrow single-panel inspection;
- common laptop widths;
- wide multi-panel investigation;
- high-density and zoomed text settings.

Preserve the session ribbon, critical warnings, selection identity, and mutation
context at all supported sizes.

### Dense data ergonomics

- Use stable columns and user-controlled density.
- Virtualize or paginate long tables where needed.
- Keep identifiers copyable.
- Preserve units, sample times, and evidence markers when layouts collapse.
- Provide precise chart focus values and range descriptions.

### Visual system

Consolidate:

- typography and spacing;
- panel hierarchy;
- state and evidence badges;
- chart palettes and intervention markers;
- icons with text alternatives;
- empty, loading, stale, disconnected, and error states.

Decorative species imagery or portraits may add warmth, but must not replace
identity labels or consume the space needed for evidence.

## Technical direction

- Establish reusable accessible primitives before fixing every instance.
- Add automated accessibility checks while retaining manual testing.
- Use CSS layout and container-aware behaviour rather than device-specific
  assumptions.
- Measure table, timeline, map, and graph performance with representative data.
- Keep theme tokens semantic and centralized.
- Avoid a visual rewrite that changes engine or feature semantics.

## Documentation and in-product guidance

- Document supported viewport behaviours, keyboard operation, shortcut
  conflicts, chart/map/graph alternatives, theme semantics, and reduced motion.
- Ensure pop-up tips and help drawers are keyboard reachable, dismissible,
  screen-reader labelled, non-blocking, and available without hover.
- Update screenshots and walkthroughs for the final responsive layouts and add
  keyboard-only instructions where interaction is not self-evident.
- Remove inaccessible shortcut guidance, colour-only legends, hover-only help,
  and layout assumptions invalidated by the responsive pass.

## Deliverables

- Accessibility and responsive audit.
- Remediated shared components and primary workflows.
- Chart/map/graph text alternatives.
- Semantic theme and state tokens.
- Automated accessibility checks.
- Documented supported layouts and manual test matrix.

## Acceptance criteria

- Primary observe, experiment, develop, and learn workflows are completable by
  keyboard.
- Critical state is available to screen readers and is not encoded only by
  colour.
- Text zoom and supported narrow layouts do not hide targets, warnings, units, or
  session state.
- Reduced-motion preferences are respected.
- Large tables and timelines remain responsive with representative data.
- Empty, loading, stale, disconnected, and error states are visually and
  semantically distinct.

## Verification

- Run automated checks for semantics, labels, focus traps, and contrast.
- Manually test keyboard-only operation and at least one screen-reader workflow.
- Test target viewport widths, browser zoom, reduced motion, light/dark themes,
  and high-density datasets.
- Re-run the core task guides from Task 17 under keyboard-only and narrow-layout
  conditions.

## Out of scope

- Supporting obsolete browser engines not otherwise supported by the project.
- Decorative redesign detached from usability.
- Replacing all domain terminology with simplified but inaccurate labels.

## Implementation record

Completed on 2026-07-28.

### Delivered

- Added a shared accessibility model and runtime layer with normalized,
  browser-local Comfortable/Compact density, reduced-motion, and global
  shortcut preferences. The visible **Display** dialog publishes the keyboard
  map, supports outside/Escape dismissal through a native modal, and restores
  focus to its opener.
- Added a first-focus skip link, restrained route announcer, complete
  accessible input fallbacks, reusable tablist/tab/tabpanel semantics, roving
  arrow-key behavior, toggle-button state, consistent global focus treatment,
  and editable-control exclusions for F1, Shift+?, and Alt+Left. Global
  shortcuts can be disabled without removing visible controls.
- Added keyboard-reachable brain neurons and SVG tracts with exact lobe,
  neuron, activity, state, tract, and dendrite labels. Added arrow-key roving
  focus and a textual detail region while treating dense dendrite drawings as
  decorative.
- Added exact timeline mark/list labels with evidence and tick ranges, and
  restored focus across timeline and ecology rerenders. Ecology rooms and
  agents now expose roles and exact focus labels, while a native room table
  presents tick, metaroom, CA value, connections, agents, and bounded-result
  status as a complete map alternative.
- Centralized contrast-checked semantic text, state, evidence, and focus
  tokens for the light content surfaces, black chrome, and dark ecology map.
  Critical states retain words, edges, or icons in addition to colour.
  Removed remote font requests so the interface remains deterministic and
  fully styled offline.
- Consolidated narrow header/toolbar behavior, touch-size menu controls,
  independently scrollable dense tables/toolbars, compact rows, and global
  reduced-motion handling for both the Observatory preference and
  `prefers-reduced-motion`.
- Reworked Timeline retained-byte accounting from a full-buffer serialization
  on every event to incremental entry accounting. Representative ingestion of
  2,500 exact records now retains the bounded 2,000-event window without the
  previous quadratic cost, while import, annotations, duration, count, byte,
  and bookmark-aware bounds remain enforced.
- Added automated checks for semantic contrast, preference normalization,
  editable-target shortcut suppression, unique shortcut documentation, shell
  semantic primitives, offline fonts, and representative 5,000-log /
  2,500-timeline performance.
- Added the **Accessibility and Responsive Operation** reference, a complete
  keyboard-only Observatory tour, task-guide/contextual-help entries,
  architecture/tool documentation, and wide/narrow Firefox screenshots.

### Review corrections

- Restored focus to the replacement SVG target after ecology inspection
  rerendered the map.
- Restored focus to the equivalent timeline mark or retained-event record
  after selection rerendered both presentations.
- Made global shortcut disabling release commands to the browser or assistive
  technology instead of capturing them silently, while preserving visible
  Help and Display actions.
- Kept tab focus inside hidden-route transitions honest by moving it to the
  newly visible workspace only when the previous panel owned focus.
- Preserved import byte accounting and derived-event precedence while
  optimizing dense Timeline retention.

### Verification

- `node --test tools/tests/*.test.cjs`: 20/20 suites passed.
- `ctest --test-dir build --output-on-failure`: 488/488 tests passed.
- JavaScript syntax checks, documentation index/link/help integrity, unique
  HTML IDs, JSON parsing, and `git diff --check` passed.
- Firefox 152.0.6 against the isolated `headlessTest` world:
  - Firefox's computed accessibility tree reported labelled button roles for
    the session summary, navigation, and Display controls;
  - a runtime semantic audit returned zero unnamed visible controls, invalid
    tabs, or unnamed native dialogs across Dashboard, Creatures, Timeline,
    Compare, Ecology, Logs, Scripts, Debugger, Experiments, Workbench, and
    Architecture;
  - real Enter/Escape verified both session and Display dialogs and opener
    focus restoration; real Shift+? opened Display;
  - disabling global shortcuts kept F1 and Shift+? inert in the Log filter,
    while the visible Display button remained operable;
  - real arrow/Enter operation covered grouped navigation, creature and
    chemistry tabs, ecology room inspection, timeline event selection, and
    brain neuron movement;
  - the ecology alternative contained 73 observed room rows and five labelled
    columns; Timeline retained precise evidence/tick labels and source detail;
    Architecture text mode retained all 48 nodes and 51 relationships;
  - Experiment and Workbench review surfaces were reached without applying an
    experiment, intervention, CAOS command, genome operation, or other world
    mutation;
  - 720×900, 1600×940, and 1920×1080 viewports had no document-level
    horizontal overflow and retained the session ribbon, menu, workspace, and
    session-state context;
  - Firefox chrome zoom was set to a true 200% (`devicePixelRatio` 2,
    effective width 800 CSS pixels) without hiding the session, menu, or
    workspace or introducing document overflow;
  - Compact density, reduced motion, and shortcut settings survived reload and
    remained available during an explicit disconnected state;
  - no JavaScript errors or unhandled rejections were captured, and the final
    live engine state was running, unpaused, at speed ×1.
- The representative automated dense-data pass completed inside the
  2.5-second contract and retained its documented hard bounds. The live
  Firefox timeline handled 120 rapid structured inputs in approximately
  0.35 seconds.
- Light content, black chrome, and the dark map were visually checked with
  non-colour labels and distinct focus indicators. Both new screenshots were
  inspected at original resolution.

Documentation screenshots:

![Keyboard and display settings verified in
Firefox](/docs/images/observatory/accessibility-display-dialog-firefox.png)

![Narrow Observatory layout verified in
Firefox](/docs/images/observatory/narrow-observatory-firefox.png)
