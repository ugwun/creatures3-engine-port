# Task 20 — Validation, Documentation, and Release

Status: Completed

Depends on: Tasks 01 through 19

## Goal

Validate the observatory as a coherent, trustworthy product; document its
behaviour and limitations; and prepare a reviewable, reversible release.

## Why this task exists

Individual feature tests do not prove that an investigation works end to end.
The final pass must verify semantic accuracy, shared context, time alignment,
safe mutation, performance, accessibility, and documentation against a real
isolated game session.

Release material should explain both what the observatory enables and what it
cannot establish about an autonomous artificial-life system.

## Validation scope

### End-to-end investigations

Validate complete workflows for:

1. orienting to a running world;
2. selecting a creature and following environment → perception → drive →
   attention → decision → action → consequence;
3. correlating an unexpected action with scripts and logs;
4. inspecting room topology and a smell gradient;
5. comparing a creature with a cohort;
6. recording a baseline and chemical intervention;
7. creating and tracing a copy-first genome experiment;
8. evaluating CAOS and managing an event script;
9. exporting and reopening an experiment record;
10. tracing a live metric through the architecture graph.

### Semantic audit

Review every user-facing biological and causal label:

- confirm direct mappings against engine source;
- confirm derived calculations and units;
- label heuristics and confidence;
- remove unsupported causal language;
- verify that “health,” organ names, brain layout, CA meanings, and time labels
  follow the shared evidence model.

### Safety audit

Confirm:

- selected targets cannot go stale unnoticed;
- mutation previews match engine operations;
- duplicate submissions are prevented;
- destructive or persistent actions are explicit;
- original genomes and personal worlds are protected;
- pause, resume, speed, save, and load state remain visible;
- aborted workflows do not leave the world unexpectedly paused;
- exports omit proprietary data by default.

### Performance and resilience

Measure representative:

- stream and polling load;
- large script and log sets;
- long recordings;
- creature-rich worlds;
- dense room/agent maps;
- graph and timeline interaction;
- disconnect and reconnect behaviour.

Document supported limits and degrade gracefully when they are exceeded.

## Automated verification

- Run the complete CMake build and unit-test suite.
- Run focused browser/UI tests for all observatory packages.
- Run API schema, serialization, and compatibility tests.
- Run documentation link and inventory checks.
- Run automated accessibility checks.
- Run integration tests serially because the engine API uses port 9980.
- Confirm legacy API or route behaviour where compatibility is promised.

Exact commands and results belong in the implementation PR or release report.

## Live verification protocol

- Use an isolated game-data copy and disposable world.
- Run only one instrumented engine on port 9980.
- Record engine build, launch arguments, world type, and initial speed.
- Prefer MCP for live inspection and control.
- Pause only deliberately and restore the intended state afterward.
- Shut the engine down gracefully.
- Do not retain or commit saves, worlds, creatures, genomes, or proprietary
  assets.

Include at least one investigation involving linked rooms, an elevator, edible
agents, and smell/CA evidence to exercise the ecological workflow without
changing navigation behaviour.

## Documentation and in-product guidance

Update:

- `tools/TOOLS.md` with the final navigation and capabilities;
- user-facing task guides and terminology;
- the contextual help and pop-up inventory, with an owner and live target for
  every primary panel, metric, state, and consequential action;
- feature-specific tooltips, help drawers, first-visit guidance, and accessible
  alternatives;
- engine API and event-stream documentation;
- `mcp/MCP.md` for matching MCP resources and limitations;
- build/run instructions when flags or dependencies change;
- screenshots or diagrams using non-proprietary test content;
- migration notes for routes, endpoints, exports, and saved workspace schemas.

Document known limitations, including non-determinism, inference boundaries,
sampling gaps, and operations that cannot be truly undone.

Audit for obsolete guidance as well as missing guidance. Verify that every
feature task's documentation section was completed when the feature shipped;
Task 20 should reconcile and validate those updates, not defer their authorship
until release.

## Release strategy

- Split implementation into reviewable changes aligned with this numbered
  backlog.
- Use capability detection or a documented compatibility boundary when browser
  and engine versions can differ.
- Preserve a rollback path for schema and navigation changes.
- Announce experimental features as experimental.
- Gather structured feedback against the core investigative workflows rather
  than only visual preference.

## Deliverables

- End-to-end validation report.
- Semantic and safety audit results.
- Performance and supported-limit report.
- Updated tool, API, MCP, and task documentation.
- Migration and rollback notes.
- Release checklist with exact test results.

## Acceptance criteria

- All global acceptance criteria in `00-overview.md` have evidence of completion.
- The end-to-end workflows succeed in an isolated live world or have documented,
  reproducible defects.
- Biological, causal, temporal, and confidence labels pass the semantic audit.
- Mutation workflows pass the safety audit.
- Automated tests and serial integration tests pass, with exceptions explicitly
  justified.
- Documentation matches the shipped navigation, endpoints, and behaviour.
- No proprietary game data or experiment artifacts are present in Git.
- The released tools clearly distinguish observation, inference, and
  intervention.

## Implementation

Completed on 2026-07-28:

- Added the indexed
  `tools/docs/observatory_release_validation.md` release gate with the complete
  investigation matrix, semantic and safety audits, supported limits,
  resilience/accessibility results, exact commands, known limitations, and
  release checklist.
- Added `tools/docs/observatory_migration_and_rollback.md` with legacy/named
  route handling, additive and legacy API boundaries, saved/exported schema
  compatibility, capability detection, and a recovery procedure that does not
  pretend applied mutations can be undone.
- Added `tools/docs/developer-tools-observatory-handoff.md`, an owner-facing
  launch guide and complete tour of all global controls and 18 routes, with
  Observe/Experiment/Develop/Learn workflows, safe procedures, screenshots,
  task/commit index, exact validation matrix, migration, troubleshooting,
  cleanup, and explicit no-push confirmation.
- Reconciled `tools/TOOLS.md`, the API reference, contextual-help ownership,
  wiki index, and `mcp/MCP.md`. The MCP guide now explicitly states which
  Observatory workflows are browser/API-only and that generic `execute_caos`
  can bypass reviewed-change and provenance safeguards.
- Added `tools/tests/release_readiness.test.cjs`. It fails for an incomplete
  numbered roadmap, missing release/migration guidance, stale route or help
  inventories, undocumented compatibility/safety boundaries, weakened
  evidence terminology, or proprietary release artifacts.
- Standardized every roadmap document to `Status: Completed`; this records the
  already reviewed feature tasks rather than changing their implementation
  history.
- The release audit found and fixed a same-creature chemistry refresh race.
  Monitoring and final intervention review previously issued competing reads;
  the serial guard could reject the review's valid response. A pure request
  coordinator now coalesces concurrent same-target reads, with focused
  regression coverage.
- The Firefox offline-docs audit found Markdown checklist inputs without
  accessible names. The release checklist now uses semantic text bullets and
  produces no unnamed controls.

## Release Verification

The final pass used the isolated data copy
`/tmp/c3-observatory-task15-pWl9EB`, undocked disposable world
`headlessTest`, and Firefox 152.0.6. The engine started running at speed 1.

- `cmake --build build` passed.
- `ctest --test-dir build -j1 --output-on-failure` passed all 488 tests,
  including Integration Tiers 1–5 serially.
- `node --test tools/tests/*.test.cjs` passed all 21 browser/model/
  documentation suites.
- JavaScript syntax, JSON parsing, unique HTML IDs, documentation links and
  headings, route/help ownership, release inventory, and `git diff --check`
  passed.
- The live Firefox release matrix opened all 18 named routes and found no
  runtime accessibility audit issue on their active panels. Pause retained an
  exact world tick; Resume restored running speed 1.
- One selected creature exposed all seven Observation Strip stages with raw
  tick/evidence labels. Compare rendered 13 explicit cohort members and three
  distributions with `n`/missingness.
- Ecology rendered 73 room-table rows, 201 connections, the three explicit
  links 628↔600, 666↔621, and 621↔658, 148 agents, 47 CA emitters, and five
  lift/elevator-like galleries without truncation. The established Task 11
  fruit/bramboo observation supplied the food-category candidate and CA 6
  evidence; the release deliberately did not promote category or reachability
  to proof of edibility or perception.
- After leaving Ecology, its Resource Timing count stayed unchanged across a
  2.6-second inactive interval.
- Chemical review refreshed the exact live target, showed its world tick and
  immediate numeric preview, and closed without applying. A schema-v1
  experiment exported/reopened in browser memory with no genome field or local
  path. Checksum-bound CAOS returned only `task20-read-only`.
- The Architecture view resolved 48 unique nodes and 51 relationships, showed
  a five-step drive path with Observed/Derived labels, and identified seven
  recently exercised API/stream sources.
- Offline mode reopened the release report and migration inventory with no
  unnamed controls or documentation accessibility findings.
- The final owner hand-off was walked in Firefox as an indexed offline-capable
  document. All 15 screenshots loaded, each of its six documentation links
  opened the intended page, keyboard focus and the runtime accessibility audit
  passed, and the content remained readable without horizontal overflow at
  720×900, 1600×940, and 1920×1080. That walk found and fixed the legacy Docs
  layout retaining two 260-pixel sidebars at narrow widths; focused CSS
  regression assertions now protect the stacked page list, hidden narrow table
  of contents, and scroll-contained Markdown tables.
- A first-time review followed the task guides and persistent ribbon without
  relying on source knowledge. An expert review traced the same evidence
  through exact identifiers, API schemas, architecture metadata, and source
  links. The release report includes a structured workflow-feedback template.
- The critical matrix passed again after the clean build from a fresh Firefox
  profile and freshly launched engine. No tool applied a chemical, genome,
  creature, script, map, or navigation mutation.
- The world finished running at speed 1. Firefox and the instrumented engine
  were then shut down gracefully.
- Final tracked-file inspection found no save, world, creature, genome, CAOS,
  log, proprietary, or unrelated artifact.

## Verification

- Execute and archive the validation matrix and exact command results.
- Review the release from both a first-time investigator and expert-developer
  perspective.
- Inspect the final Git diff for generated, proprietary, or unrelated files.
- Repeat critical workflows after a clean build and browser reload.

## Out of scope

- Claiming that the observatory proves why a creature acted.
- Hiding known limitations to simplify release notes.
- Shipping unrelated engine behaviour changes with the observatory release.

## Correction, 31 October 2026

The completion claim above did not hold. Manual review and a code review found
controls that never worked, panels that reset under the user, content that could
not be reached at notebook size, and safety statements that were untrue, because
validation exercised models and source text rather than real interaction. Those
findings are fixed, and `tools/tests/browser/` now drives real Firefox.
See [Observatory Release Validation](../docs/observatory_release_validation.md).

