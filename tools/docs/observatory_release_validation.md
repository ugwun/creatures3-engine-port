# Observatory Release Validation

This report is the release gate for the numbered Developer Tools Observatory
roadmap. The first version, dated 28 July 2026, claimed the roadmap was complete.
A manual review and a code review on 31 October 2026 disproved that: its checks
exercised models and source text, not real clicks or layout, and several safety
statements were untrue. This version records what was then fixed and how it was
verified. It is evidence for this build, not a claim that every future engine
build or world behaves identically.
Release classification: **experimental developer preview**. Reviewed-change
safeguards reduce mistakes; they are not a stability or reversibility promise.

The Observatory is an investigative instrument. It distinguishes **Observed**
engine values, mechanically **Derived** values, labelled **Inferred**
interpretations, and **Unknown** claims whose source or capture context is not
adequate. It can assemble evidence around an action; it does not prove why an
autonomous creature acted.

## End-to-End Investigation Matrix

| Investigation | Release evidence | Result |
|---|---|---|
| Orient to a running world | Dashboard, persistent session ribbon, exact world/ticks/speed, route capabilities | Passed running and paused |
| Follow environment → perception → drive → attention → decision → action → consequence | Selected live Norn, Observation Strip, Brain, biological monitor, Timeline | Passed; differing capture ticks remained visible |
| Correlate unexpected action with scripts and logs | Observation script stage, Running Scripts details, structured Log context, Debugger hand-off | Passed without implying causation |
| Inspect topology and smell | Metaroom 11, 73 rooms, 201 door/link connections, CA channel table and route trace | Passed, including links 628↔600, 666↔621, and 621↔658 |
| Compare a creature with a cohort | Explicit individual/cohort members, raw values, median/IQR, missing-data counts | Passed with 13 live Norns |
| Record baseline and chemical intervention | Experiment protocol, retained baseline, checksum/world-bound review, provenance ledger | Passed in the Task 12/13 disposable-world protocol; final release pass used preview/cancel only |
| Create and trace a copy-first genome experiment | Protected source identity, verified copy, structural diff, reviewed injection result | Passed in the Task 14 disposable-data protocol; originals remained unchanged |
| Evaluate CAOS and manage an event script | Validate/checksum/evaluate and exact-event Install/Replace/Remove review | Passed in the Task 15 disposable-world protocol; final pass used read-only evaluation |
| Export and reopen an experiment | Portable schema-v1 manifest, validation, legacy draft migration, unsupported-version rejection | Passed with no genome arrays or binary game data in the export |
| Trace a live metric through architecture | Glycogen and drive metric paths, mapped recent requests, text alternative, source/docs links | Passed while connected and disconnected |

The live ecology investigation included explicit linked rooms, lift/elevator
agents, the world's fruit-category bramboo food candidates, and CA 6 evidence.
It observed the existing map and agents only. Category and reachability were
not promoted to proof of edibility or perception, and the workflow did not
change linked-room navigation, elevator behavior, agent emissions, or smell
recovery.

## Semantic Audit

- The legacy field called `health` is documented and displayed as glycogen
  reserve (chemical 4), not overall health.
- Organ names that are not directly supplied by the genome are explicitly
  role inferences with evidence and confidence, not Observed anatomy.
- Brain **Genome** layout uses exact genome coordinates. **Functional** layout
  is a labelled display transform and cannot be mistaken for physical anatomy.
- CA channels are numeric engine channels. A sensory name appears only when the
  active world maps that channel; an unmapped channel says its meaning is
  unknown.
- Drive, chemical, neuron, tract, room, agent, script, and genome identifiers
  remain available beside friendly labels.
- World ticks, system ticks, wall capture times, sampling intervals, and stale
  ages are named separately. A sampled interval is not presented as an exact
  event.
- Temporal order and correlation are not described as proof of cause or intent.
  Heuristics retain **Inferred** labels, method notes, and confidence limits.

The source mappings and calculations are documented in
[How to Read Biological Labels](biological_labels.md), the feature references,
and the metric paths in the [Live Architecture Graph](live_architecture_graph.md).

## Safety Audit

- World-qualified creature, agent, script, genome, and intervention targets are
  revalidated before use. Reused numeric IDs and stale worlds fail visibly.
- Reviewed mutation requests bind the source/checksum, expected world and tick,
  target identity where applicable, and an explicit confirmation.
- In-flight submissions disable their initiating control. Genome injection
  needs a review identifier that works once, in the world session it was
  reviewed in, for 12,000 ticks. Reviews are spent before anything is created.
- The API binds loopback and rejects foreign `Host` headers and cross-origin
  requests. Remote access is opt-in, behind a token.
- A `504` means the engine did not run the request and never will. Provenance
  records it as `not_applied_timeout`, and records refusals as failures.
- Chemical changes are narrow concentration changes with before/requested/after
  evidence. Genetics is copy-first; core and unverified genomes cannot be
  overwritten, renamed, deleted, or injected as experimental copies.
- Workbench separates read-only evaluation from exact-event
  Install/Replace/Remove. Risk comes from what the compiler emitted and
  defaults to deny: only flow control, output and VM-local state count as
  read-only. Scratchpad refuses everything else, and the engine enforces it.
- Pause, resume, speed, save/load pending state, active world, and sample age
  remain in the persistent ribbon. Cancelled reviews do not pause or mutate the
  engine.
- Experiment exports contain logical identities, values, checksums, provenance,
  and limitations. They omit genome binaries, gene arrays, worlds, creatures,
  local data paths, and other proprietary game data by default.
- A completed chemical change, injected creature, installed script, saved
  world, or exported file cannot be truly undone by a UI label. The documented
  recovery is a separate compensating action or a disposable-world rollback.

## Performance and Supported Limits

These are deliberate retention or request boundaries, not estimates of total
engine capacity:

| Surface | Supported boundary and degradation |
|---|---|
| Shared Observatory state | 120 samples per history key, 200 intervention records, 64 shared request-cache entries; oldest entries leave first |
| Structured logs | 5,000 records and about 4 MiB on both server and browser; explicit gap records report overflow/restart |
| Biological series | 300 samples per series, 60,000 samples total, 400 seen intervention IDs per series; oldest unpinned history is evicted |
| Ethology timeline | 3,000 events, 600 snapshots, about 4 MiB, and 50,000 world ticks per recording, and the 24 most recent recordings; bookmarks receive retention preference and gaps remain explicit |
| Comparison | 180 cohort snapshots; nearest-tick matching defaults to 200 ticks and reports missing matches |
| Ecology | Up to 400 rooms, 500 agents, 2,000 connections, and four CA channels per request; truncation flags and complete counts remain visible |
| Ecology route trace | 80 retained trace steps; incomplete or unavailable paths say so |
| Experiments | 10,000 observations, 2,000 ledger entries, and 1,000 annotations; dropped-observation counts are retained |
| Scripts | Two-second active polling and five-second recently-finished retention; installed full source is fetched on demand, with up to 200 revisions cached |
| Dashboard | Creature/script summaries no faster than five seconds and only while visible |
| Architecture | Static 48-node model; bounded Resource Timing metadata from the previous 30 seconds, refreshed every two seconds only while visible |

Representative pure-model tests cover 5,000-log retention, 2,500 timeline
entries, large scripts, dense ecology payloads, cohort histories, and graph
filtering. The post-build Firefox release pass covered 13 creatures, 148
matching agents, 73 rooms, 201 connections, all primary routes, 720×900
through 1920×1080
viewports, and 200% zoom without document overflow.

## Accessibility and Resilience

- All 18 named routes and primary controls are keyboard reachable. Graphical
  brain, timeline, ecology, biological-series, and architecture views have
  labelled interactive elements and textual alternatives.
- Focus returns after dialogs and responsive navigation close; route, internal
  tab, room, timeline, neuron, tract, and graph collections support appropriate
  arrow-key movement.
- Semantic colour pairs meet the tested contrast thresholds; reduced motion,
  density, and shortcut-conflict preferences are browser-local.
- Offline Learn routes, evidence definitions, contextual help, and display
  settings remain usable without an engine.
- Loading, no-world, no-creature, stale, disconnected, reconnect, paused, and
  running states have explicit UI contracts. Last-known data never silently
  becomes a current sample.
- Feature polling and recording services stop when their workspace is inactive,
  except the documented persistent session ribbon, the log stream, and an
  explicitly active background recording. Log records are stored off-route but
  only drawn while the tab is open.
- Polled panels update existing nodes through `DomPatch`, so refreshes keep open
  disclosures, focus, typed text and scroll position. A focused control whose
  subject changes is replaced rather than reused, so focus can be lost but never
  moves silently onto a different creature, agent or chemical.

## Exact Verification Results

The 31 October 2026 corrections were verified on Fedora with Firefox 158 at the
1530×840 notebook viewport, and against an isolated copy of the game data. Live
runs used the undocked `headlessTest` world.

| Layer | Command / fixture | Result |
|---|---|---|
| Build | `cmake --build build` | Passed |
| Native, model and Firefox suites | `ctest --test-dir build -LE integration` | 523/523 passed. Two of those entries run 194 model tests and 61 synthetic Firefox tests, of which 8 need a live engine and skip |
| Integration tiers, full game data copy | `CREATURES_GAME_DIR=… ctest --test-dir build -L integration` | 5/5 passed |
| Firefox against live `lc2e` | `OBSERVATORY_URL=… OBSERVATORY_ALLOW_CHANGES=1 node --test --test-concurrency=1 tools/tests/browser/{ecology,layout,refresh,workflows}.browser.cjs` | 29 passed, 2 fixture-only skipped |
| Live workflows included | Scratchpad refusal, Workbench install/replace/remove, Debugger breakpoint and step, chemical intervention, genome save and single injection, experiment lifecycle, world branch, same-world reload | Passed |
| Network | Loopback bind; foreign `Host` and `Origin` rejected; crash datagram ignored; `--allow-remote-tools` token, cookie and SSE from a LAN address, with a real Firefox session | Passed |
| Script line mapping | Every installed script in the test world: 791 scripts, 28,867 formatted lines | None misaligned |
| Viewports | 1530×840 on every route, 1920×1080 for Brain, 720×900 captured | No clipped controls or overflowing labels |

Integration tiers need the sibling `Creatures 3` folder, so they run against a
copy of the whole install rather than `Docking Station` alone. Live tests change
the world and genome files, so they ran on isolated copies only.

The first release pass used the same isolated-data method but relied on model
and source-text tests, which is how interaction and layout defects escaped it.
Its results are superseded by the table above.

## Known Limitations

- Creatures simulations are non-deterministic. A world name, source revision,
  protocol, and saved baseline improve reproducibility but do not guarantee the
  same future trajectory.
- Browser panels sample at different bounded cadences. Even when values share a
  world tick, a complete multi-endpoint display is not an atomic engine
  snapshot unless the endpoint explicitly says it is.
- The Observation Strip, timeline, comparison, and architecture graph organize
  evidence; none proves why a creature acted.
- The architecture graph is maintained metadata with recent-request
  highlighting, not a full runtime call tracer.
- CA labels depend on the active world's category mapping. Unmapped meanings
  remain Unknown.
- The browser cannot make an applied world/genome/script mutation reversible.
  Use disposable worlds, copy-first genomes, recorded provenance, and the
  rollback procedure.
- Browser-local recordings and annotations are bounded and are not a durable
  laboratory database until exported.
- The MCP adapter exposes a focused 25-tool engine surface, not every browser
  Observatory workflow or narrow reviewed-change endpoint.
- `/api/execute`, used by MCP and legacy tools, still runs any CAOS without
  review. Access control limits who can reach it, not what it can do.
- Any local process can reach the API. Loopback is a boundary against other
  machines and web pages, not against other programs on this one.
- Compile-based risk review classifies what a script does, not what it means.
  A read-only script can still be expensive, and acknowledgement is a human
  check rather than a sandbox.
- Screenshots from the original build remain in this branch's earlier commits.

## Structured Feedback

When reviewing another build, report against an investigative workflow rather
than only visual preference:

1. Name the route and goal from the end-to-end matrix.
2. Record world type, running/paused state, speed, selected stable identifier,
   world tick, sample age, viewport, zoom, and browser version.
3. State which claim was confusing or wrong and whether it was labelled
   Observed, Derived, Inferred, or Unknown.
4. For a reviewed change, state where target, preview, confirmation,
   provenance, cancellation, or result verification became unclear. Do not
   attach proprietary world/genome/creature data.
5. Include exact reproduction steps, expected result, observed result, and
   whether reconnect or browser Back changed it.
6. Rate orientation, evidence clarity, cross-navigation, safety confidence,
   responsiveness, and recovery guidance from 1–5, with one concrete reason
   for each score.

## Release Checklist

- Complete — Tasks 01–20 have implementation, review, focused tests, live
  Firefox evidence, documentation, and descriptive local commits.
- Complete — All global acceptance criteria have release evidence.
- Complete — Biological, causal, temporal, confidence, and evidence labels
  were reconciled.
- Complete — Mutation previews, stale-target rejection, copy-first genetics,
  provenance, and cancellation paths were reviewed.
- Complete — Build, unit, UI-model, documentation, accessibility, API, and
  serial live integration checks passed.
- Complete — Route, endpoint, export, workspace-schema, migration, and rollback
  boundaries are documented.
- Complete — Final diff and tracked-file audit found no proprietary or
  generated game data.
- Complete — Engine state was restored to running at normal speed after live
  verification.
- Complete — Release remains local; no branch or commit was pushed.

See [Migration and Rollback](observatory_migration_and_rollback.md) before
mixing an older browser bundle, engine binary, bookmark, or saved export with
this release.
