# Task 16 — Observatory Navigation and Dashboard

Status: Completed

Depends on: Tasks 03 through 15

## Goal

Reorganize the developer UI around investigative intent and provide a calm
landing view of the live world, active observations, and recent interventions.

## Why this task exists

A flat collection of technical tabs reflects implementation areas, not the
questions people bring to the tools. It also gives every capability equal
visual weight, whether the user is watching one creature or changing persistent
scripts.

Navigation should reveal a coherent observatory: first orient to the world, then
observe, experiment, develop, or learn. This reorganization belongs after the
core workflows exist so it reflects real tasks rather than hypothetical
categories.

## Information architecture

Use four primary groups:

### Observe

- Observatory overview
- Live creature observation
- Ethology timeline
- Biology and brain
- Creature/cohort comparison
- World and ecology
- Running scripts and logs

### Experiment

- Experiment workspaces
- Chemical interventions
- Genetics experiments
- Recordings and exports

### Develop

- CAOS workbench
- Scriptorium and debugger
- Agent and classifier inspection
- Engine/API diagnostics

### Learn

- Task-oriented guides
- CAOS reference
- Live architecture graph
- Terminology and evidence legend

Names can evolve through usability testing, but the distinction between
observing and mutating must remain clear.

## Observatory dashboard

The default landing surface should answer:

- Which world and engine session is connected?
- Is simulation time moving?
- Which creatures are present, selected, or in an unusual state?
- Is a recording or experiment active?
- Which interventions occurred recently?
- Are there script errors, API gaps, or stale streams?
- Where can the current investigation be resumed?

Use summaries and small trends, not a dense wall of every available metric.

### Dashboard cards

Candidate cards include:

- world/session status;
- creature population and current selection;
- active recordings and protocols;
- recent intervention ledger;
- script errors and notable logs;
- pinned biological signals;
- saved investigation workspaces.

Each card must link to the detailed surface with context preserved.

## Navigation behaviour

- Preserve shared selection, time range, and experiment context across sections.
- Keep URLs deep-linkable and meaningful.
- Show breadcrumbs or context trails for cross-navigation.
- Mark mutating workspaces and actions consistently.
- Allow keyboard and pointer navigation without intercepting ordinary editing
  keys.
- Provide a compact layout at narrow widths rather than hiding essential state.
- Retain redirects or migration handling for useful existing tool URLs.

## Technical direction

- Define navigation declaratively with route metadata, group, mutation risk,
  required capabilities, and contextual help target.
- Use the shared observatory store rather than panel-specific global state.
- Lazy-load expensive views without losing the global session ribbon.
- Make unsupported capabilities visible with an explanation instead of silently
  hiding them.
- Keep dashboard polling bounded and reuse existing streams where possible.
- Avoid embedding business logic in navigation components.

## Documentation and in-product guidance

- Update the Developer Tools overview, feature inventory, route map, screenshots,
  and deep-link examples to match Observe, Experiment, Develop, and Learn.
- Add dashboard and navigation tips explaining card freshness, preserved
  context, capability warnings, and the distinction between observing and
  mutating workspaces.
- Add a first-visit orientation guide that starts at session status and routes
  users by investigative intent.
- Remove obsolete flat-tab instructions and document redirects or replacements
  for bookmarked routes.

## Deliverables

- Grouped primary navigation.
- Observatory dashboard.
- Deep links and preserved investigation context.
- Existing-route migration or redirects.
- Responsive navigation patterns.
- Navigation and dashboard tests.

## Acceptance criteria

- A first-time user can identify where to observe a creature, run an experiment,
  author CAOS, and find documentation from the top-level navigation.
- Observational and mutating activities are visually distinct.
- Moving between linked views preserves selected subject and time context.
- The dashboard makes paused, disconnected, stale, and recording states obvious.
- Existing useful deep links have a documented migration path.
- The dashboard remains useful in an empty world and when the engine is offline.

## Verification

- Test route metadata, redirects, context preservation, capability gating, and
  keyboard navigation.
- Conduct task-based checks for observing a creature, diagnosing a failed action,
  running an experiment, and editing a script.
- Verify empty world, many creatures, disconnected engine, active recording,
  narrow viewport, and browser refresh.

## Out of scope

- Reimplementing the feature panels completed in earlier tasks.
- A customizable portal or general widget marketplace.
- Hiding advanced capabilities solely to simplify the first screen.

## Implementation record

Completed on 2026-07-28.

### Delivered

- Replaced the flat tab list with 18 declarative named routes grouped under
  Observe, Experiment, Develop, and Learn. Each route records activity,
  capabilities, contextual help, tab/view mapping, and a stable route ID.
- Added an Observatory overview as the default route. It summarizes the shared
  session, exact creature population/life states, experiment and recording
  context, world-qualified interventions, running-script/log diagnostics,
  retained biological pins, and a resumable investigation.
- Added explicit reviewed-change markers for experiment, chemical, genetics,
  and CAOS Workbench routes. Unavailable workspaces remain visible and explain
  their missing connection, world, or creature capability.
- Extended shared routes with retained world-tick cursor/range context and
  added Timeline and Compare workspace capture/restore adapters. Creature
  selection and tick range now survive linked navigation, browser history, and
  refresh.
- Retained useful flat hashes such as `#creatures` and `#console`, plus existing
  `#docs/...` links, as migration aliases.
- Added keyboard navigation scoped to the navigation, narrow-screen overlay
  behavior, one/two/three-column dashboard layouts, route/card tips, a
  first-visit guide, route map, migration table, deep-link examples, and a
  Firefox screenshot.

### Review corrections

- Counted raw script rows through the same running/waiting/blocking semantics
  used by the Running Scripts workspace instead of treating absent state as
  “other”.
- Kept recent interventions empty without a confirmed world identity so
  records can never leak across world context.
- Distinguished endpoint failures from stream gaps in dashboard diagnostics.
- Restored the manual Refresh action when an in-flight request is abandoned
  and the dashboard is revisited offline.
- Marked a retained creature selection missing after a successful empty
  population capture rather than relying on a non-zero population.

### Verification

- `node --test tools/tests/*.test.cjs`: 16 suites passed.
- `ctest --test-dir build --output-on-failure`: 488/488 tests passed.
- Syntax checks passed for every changed/new JavaScript module; the docs index
  parses as JSON; HTML IDs are unique; `git diff --check` passes.
- Firefox 152.0.6, disposable `headlessTest` world with four canonical test
  Norns:
  - default dashboard, four intent groups, 18 named routes, and reviewed-change
    markers;
  - route-capability display and keyboard Arrow/Home/End handling;
  - live creature observation and chemical-intervention handoff;
  - diagnosis, experiment, and CAOS-authoring routes, including verification
    that an editor Arrow key is not intercepted;
  - selected creature and ticks 1000–1300 preserved from Timeline to Compare,
    through the context strip and browser refresh;
  - `#console` legacy bookmark migration;
  - active recording/experiment presentation;
  - 250-creature population derivation;
  - 720×900, 1600×914, and 1920×1080 layouts without horizontal overflow;
  - no JavaScript errors or unhandled promise rejections.
- With the real engine stopped while Firefox remained open, the dashboard
  retained `headlessTest` only as stale evidence, reported the connection
  disconnected, and described tick movement as unknown.
- With a real no-world engine (`Startup`), Firefox reported an explicit
  no-simulation-world state and stale creature evidence without inventing a
  population.
- The final engine state was running, speed ×1, not recording, and not paused;
  both the engine and Firefox were then stopped cleanly.

Documentation screenshot:

![Task 16 Observatory dashboard verified in
Firefox](/docs/images/observatory/observatory-dashboard-firefox.png)
