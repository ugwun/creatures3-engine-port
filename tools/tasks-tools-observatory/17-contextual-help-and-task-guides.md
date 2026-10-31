# Task 17 — Contextual Help and Task Guides

Status: Completed

Depends on: Task 16

## Goal

Teach the tools at the moment a question arises, using task-oriented guidance,
precise terminology, and links that preserve the user's live context.

## Why this task exists

Reference documentation is necessary but rarely matches an investigator's first
question. Users need to know how to observe a Norn, investigate an action,
compare two creatures, understand a CA channel, or safely test a script.

Contextual guidance also prevents misleading shortcuts. Keyboard behaviour such
as using Tab to pin data conflicts with standard navigation and makes the
interface harder to discover and use.

## Feature scope

### Task-oriented guide index

Provide guides for common goals, including:

- orient to a world and select a creature;
- observe perception, attention, action, and consequence;
- investigate a surprising or failed action;
- follow a drive or chemical over time;
- compare an individual with a cohort;
- inspect a room route and smell gradient;
- record a baseline and intervention;
- safely test a chemical or genome change;
- evaluate CAOS and install an event script;
- correlate a runtime error with source and agent context.

Each guide states whether it observes or changes the world.

### Contextual help drawer

From a field, chart, panel, or action, provide:

- concise meaning and unit;
- evidence level and data source;
- update cadence and freshness;
- interpretation cautions;
- relevant guide and reference links;
- current identifiers that can be carried into the linked view.

Help text must not turn heuristic labels into facts.

### Terminology and evidence legend

Maintain a shared glossary for:

- world tick, sample time, and wall-clock time;
- direct, derived, inferred, and user-authored evidence;
- drive, stimulus, attention, decision, action, and consequence;
- concentration, dose, organ state, and life stage;
- immediate CAOS execution and installed event scripts.

### Discoverable controls

- Use visible pin, bookmark, record, and help controls.
- Provide documented shortcuts as optional accelerators.
- Do not capture Tab or other standard navigation keys for feature actions.
- Display shortcut hints in menus and accessible labels.

### Documentation integrity

Ensure the documented feature and tab inventory matches the actual UI. Add
automated checks for broken local links, missing guide targets, and stale route
references where practical.

## Technical direction

- Give fields and panels stable help identifiers.
- Store concise help metadata close to the data definition when possible.
- Generate repetitive command or metric reference content from authoritative
  inventories, while keeping interpretive prose reviewed.
- Link guides into live routes using explicit context parameters rather than
  fragile UI state.
- Keep the help surface usable with the engine disconnected.
- Avoid shipping proprietary screenshots or data.

## Documentation and in-product guidance

- Document how feature authors register help identifiers, concise pop-up
  content, full task guides, evidence metadata, shortcuts, and live-context
  links.
- Create and maintain an inventory mapping every primary panel, field, chart,
  and consequential action to its help content and owning task.
- Replace legacy one-off tooltips and intrusive first-run pop-ups with the shared
  accessible pattern, preserving valuable content during migration.
- Add editorial guidance for biological honesty, causal restraint, terminology,
  accessibility, examples, screenshots, review ownership, and stale-content
  detection.

## Deliverables

- Task-guide index and initial guide set.
- Contextual help drawer.
- Shared glossary and evidence legend.
- Visible pin/bookmark/record controls.
- Accessible shortcut help.
- Documentation-link validation.

## Acceptance criteria

- Every primary observatory surface has a concise description, evidence
  explanation, and task-guide entry.
- A user can complete the common investigation workflows without consulting
  repository source.
- Help links preserve relevant live context without changing the world.
- Standard keyboard navigation works throughout the UI.
- Documentation inventory and actual navigation no longer disagree.
- Inferred and heuristic material is consistently labelled in help content.

## Verification

- Test help identifier resolution, deep links, route context, and offline use.
- Run automated local-link and route-reference checks.
- Complete each guide against an isolated live world and revise steps that rely
  on hidden knowledge.
- Test keyboard-only and screen-reader navigation through help and controls.

## Out of scope

- A complete tutorial for Creatures gameplay.
- Reproducing every external CAOS reference page.
- Treating tooltips as a substitute for sound interface labels.

## Implementation record

Completed on 2026-07-28.

### Delivered

- Added one authoritative contextual-help registry with 33 reviewed
  definitions. It covers all 18 named Observatory routes, the evidence
  contract, primary panels and fields, high-risk actions, and visible
  record/pin/bookmark controls.
- Added an accessible non-modal drawer with activity, evidence level, exact
  source, update/freshness cadence, interpretation caution, optional shortcut,
  related terms, and current world/subject/time identifiers. Help is available
  from the visible header action, registered targets with F1, and interactive
  evidence badges.
- Guide and reference actions now use an explicit named Docs route and retain
  confirmed world identity, stable selections, and world-tick cursor/range
  without changing the simulation.
- Replaced tooltip Tab-to-pin behavior with normal Tab navigation, keyboard
  focus descriptions through `aria-describedby`, and a non-interactive F1
  hint. Escape, the visible close button, and outside clicks dismiss the
  drawer.
- Added a task-guide index with eleven concrete workflows covering the ten
  requested goal areas, splitting chemical and genome safety into separate
  guides. Added the shared glossary/evidence legend, help inventory, and
  authoring/editorial rules.
- Added automated integrity checks for indexed documents, local files and
  images, Markdown section anchors, navigation help targets, exact inventory
  coverage, and obsolete Tab-to-pin behavior. Existing broken local anchors
  discovered by the validator were repaired rather than exempted.
- Updated the built-in overview and tool documentation, Learn routes, and
  Firefox screenshot.

### Review corrections

- Discarded remembered help targets when their workspace is hidden, preventing
  the global Help action from reopening stale field help after navigation.
- Registered every interactive evidence badge with the shared evidence help
  identifier while leaving display-only badges non-focusable.
- Resolved primary IDs from the live store's kind-only primary shape and
  removed duplicate primary/related-subject rows, so help never displays an
  `undefined` identifier.
- Cancelled stale tooltip fade timers so rapid keyboard or pointer movement
  cannot hide a newly opened tooltip.
- Kept disconnected behavior honest: concise help metadata remains usable in
  an already loaded page; an uncached full guide still requires the embedded
  static-file host.

### Verification

- `node --test tools/tests/*.test.cjs`: 18/18 suites passed.
- `ctest --test-dir build --output-on-failure`: 488/488 tests passed.
- JavaScript syntax checks, JSON parsing, unique HTML IDs, documentation-link
  integrity, and `git diff --check` passed.
- Firefox 152.0.6 against the isolated `headlessTest` world:
  - real Tab navigation advanced between route controls without interception;
  - real F1 opened the exact timeline-field help, and Escape restored focus;
  - header Help, Evidence, generated evidence badges, biological Record, and
    biological Pin exposed stable help IDs and accessible names;
  - outside pointer activation closed the drawer;
  - the selected creature and ticks 1000–1300 survived the drawer-to-guide
    handoff and remained visible in the context strip;
  - all eleven concrete guide targets were opened against the live isolated
    world without applying an intervention, injecting a genome, executing
    CAOS, or starting an experiment;
  - 720×900, 1600×940, and 1920×1080 layouts had no horizontal overflow and
    retained visible Help/close controls;
  - no JavaScript errors or unhandled promise rejections were captured.
- With the real engine stopped while Firefox remained loaded, route-level
  help retained its static source/cadence/caution content and produced the
  correct context-preserving guide route while the connection was explicitly
  disconnected.
- Before shutdown, the isolated engine was running at speed ×1 and not paused.
  The engine and Firefox were then stopped cleanly.

Documentation screenshot:

![Task 17 contextual help verified in
Firefox](/docs/images/observatory/contextual-help-drawer-firefox.png)
