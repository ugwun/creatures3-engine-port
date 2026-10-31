# Developer Tools Observatory — Owner Hand-off

This is the practical guide to the Developer Tools Observatory. It explains what
changed, how to use it, how to read its evidence, how to avoid unintended world
changes, and exactly what was verified before hand-off.

The Observatory turns the former collection of developer tabs into a connected
investigative environment:

1. orient to the active simulation;
2. select a subject once;
3. follow environmental, biological, neural, script, and behavioral evidence;
4. compare or record it on explicit timebases;
5. make a deliberate change only through a reviewed workflow;
6. preserve enough context to reproduce and critique the investigation.

It is experimental developer tooling. It helps you assemble evidence around an
action, but it does **not prove why a creature acted**, make a non-deterministic
simulation deterministic, or make an applied mutation reversible.

## Start Here: Prerequisites and Launch

Build from the repository root:

```bash
cmake -S . -B build
cmake --build build
```

Choose one launch mode:

```bash
# Browser Observatory and REST/SSE API
./build/lc2e -d "/path/to/Docking Station" --tools

# API only; use mcp/server.js separately for MCP stdio
./build/lc2e -d "/path/to/Docking Station" --mcp

# Headless engine with both APIs enabled
./build/lc2e -d "/path/to/Docking Station" \
  --headless --world "Disposable Test World"
```

Open `http://localhost:9980` for browser mode. Run only one instrumented engine
on port 9980. Keep the `lc2e` binary and served `tools/` directory at the same
revision.

The server only accepts this machine. To open the tools from another computer,
add `--allow-remote-tools` and use the URL it prints, which carries a token.

Use an isolated game-data copy and disposable world for intervention,
genetics, world-branch, script-install, or destructive debugging work. Never
begin those workflows in a personal data directory merely to “try the UI.”

For MCP:

```bash
cd mcp
npm install
```

Configure the client to spawn `node /absolute/path/to/mcp/server.js`, with
`ENGINE_URL=http://localhost:9980` when needed. Starting `lc2e --mcp` exposes
HTTP; it does not itself start the stdio adapter. The repository-level
`mcp/MCP.md` is the complete adapter manual; the browser-readable
[release limitations](observatory_release_validation.md#known-limitations)
summarize its Observatory boundary.

## How to Read the Observatory

Every important claim belongs to one of four evidence levels:

- **Observed** — read directly from an engine endpoint or event at a stated
  capture tick.
- **Derived** — mechanically calculated from Observed values using a stated
  method, such as a delta, median, route, or display transform.
- **Inferred** — a labelled interpretation supported by evidence, not a direct
  engine fact.
- **Unknown** — the source, timing, mapping, or interpretation is insufficient.

These labels describe provenance, not importance. An Inferred label can be
useful; it simply must not masquerade as an engine fact.

Important semantic boundaries:

- legacy `health` means glycogen reserve, chemical 4—not overall health;
- inferred organ roles are not genome-supplied anatomical names;
- Brain **Genome** layout is exact, while **Functional** layout is a display
  transform;
- a CA channel gets a friendly smell/category label only when the active world
  supplies that mapping;
- a temporal sequence or concurrent signal is not proof of causation or intent;
- an agent being reachable or food-category-like is not, by itself, proof that
  it was perceived or eaten.

Use [Evidence & Terms](observatory_glossary.md) when a label is unfamiliar and
[How to Read Biological Labels](biological_labels.md) for engine mappings.

## The Global Shell

![Observatory overview in Firefox, with grouped navigation, session state,
investigation context, and live summary cards](/docs/images/observatory/observatory-dashboard-firefox.png)

The left navigation has four activity groups:

- **Observe** — Dashboard, Creatures, Timeline, Compare, Ecology, Scripts, Logs.
- **Experiment** — Workspaces, Chemical intervention, Genetics experiments.
- **Develop** — Workbench, Scratchpad, Debugger, Diagnostics.
- **Learn** — Task guides, CAOS reference, Architecture, Evidence & terms.

Routes that can lead to mutation carry **Reviewed change**. The marker means
the workspace contains a consequential path; merely opening it does not mutate
the world. Unavailable routes remain visible and explain which connection,
world, or creature selection they need.

### World and Session Ribbon

![World/session ribbon and exact details dialog in
Firefox](/docs/images/observatory/session-status-ribbon-firefox.png)

The persistent center ribbon answers:

- which world and world type are active;
- whether the engine is running, paused, connecting, loading, disconnected, or
  has no world;
- speed, world tick, creature count, and sample age;
- whether a world switch is pending.

Open it for exact world/system ticks, capture source, connection state, and
speed controls. **Pause simulation** freezes game ticks but leaves the tools
server responsive. **Resume simulation** restores the engine. Log’s **Pause
stream** is different: it pauses Log rendering, not the simulation.

After any controlled pause, intervention review, test, or failed workflow,
verify this ribbon before continuing. Normal hand-off state is running at
speed 1.

### Shared Selection and Time Context

![Creature selection carried across the shared context strip in
Firefox](/docs/images/observatory/shared-context-creature-firefox.png)

Selecting a creature, agent, room, chemical, script, genome, or record updates
the shared context. Related selections can coexist; one item remains primary.
Named links preserve:

- active world identity;
- stable subject identifiers and identity fingerprints;
- current route/view;
- optional cursor tick or tick range.

The context strip lets you clear one subject without destroying the entire
investigation. Browser Back/Forward restores supported workspace filters,
selection, disclosure, and scroll. A selection from another world or a reused
numeric ID fails visibly instead of silently changing subjects.

### Help, Evidence, and Display

![Contextual Help drawer showing activity, evidence, source, cadence, caution,
and guide links](/docs/images/observatory/contextual-help-drawer-firefox.png)

- **Help** explains the active route.
- Focus a registered field, metric, panel, or action and press **F1** for
  target-specific source, cadence, evidence, caution, and live identifiers.
- **Evidence** opens the shared evidence vocabulary near the trigger. Escape or
  outside click closes it.
- **Display** or **Shift+?** opens the keyboard map and browser-local density,
  reduced-motion, and shortcut settings.

![Keyboard and Display dialog in
Firefox](/docs/images/observatory/accessibility-display-dialog-firefox.png)

Global shortcuts are suppressed while typing and can be disabled for
assistive-technology conflicts.

## Guided Tour: Observe

### 1. Observatory Overview

Start on **Observe → Overview**.

1. Confirm world, type, state, speed, and freshness in the ribbon.
2. Read the World & simulation card first.
3. Check creature population, active experiment/recording, recent
   interventions, scripts/log gaps, and pinned biological signals.
4. Use **Resume investigation** to return to the most recent detailed route.

Dashboard cards have separate capture times; they are not one atomic snapshot.
Creature and script summaries poll no faster than five seconds and only while
the dashboard is visible.

### 2. Creatures

Choose **Observe → Creatures**, then select a live creature.

The workspace contains:

- **Drives** — raw drive concentrations, highest-drive marker, trends, and
  stable pins.
- **Chemistry** — 256 concentrations, catalogue names, raw IDs, series, and
  the separate reviewed Intervene view.
- **Organs** — observed execution/life-force state plus clearly labelled role
  interpretations.
- **Brain** — exact Genome geometry, Functional display layout, lobe winners,
  keyboard-reachable neurons, tract/dendrite inspection, and raw values.
- **Genome** — decoded expressed genes and engine identifiers without turning
  friendly text into biological certainty.

The Live Observation Strip sits above these subviews:

![Seven-stage live Observation Strip in
Firefox](/docs/images/observatory/live-observation-strip-firefox.png)

Read its seven concurrent stages:

1. Environment
2. Perception
3. Internal pressure
4. Attention
5. Selection
6. Action
7. Consequence

Each stage carries evidence and tick context. “Consequence” may be Unknown when
there is no adequate later sample. Use **Freeze view** to inspect without
stopping the simulation, **Capture** for a named comparison, and **Raw** when
you need exact endpoint fields. Source-inspector links retain the creature and
world context.

### 3. Ethology Timeline

Choose **Observe → Ethology timeline** after selecting a creature.

![Ethology Timeline with bounded event lanes and retained evidence in
Firefox](/docs/images/observatory/ethology-timeline-firefox.png)

1. Choose a 1, 2, or 5 second sampling interval.
2. Start recording and give the session a meaningful name.
3. Watch creature, biological, decision/action, script, log, and intervention
   lanes align on world ticks.
4. Select a mark for before/after values, uncertainty, and source records.
5. Bookmark important events; scrub history; use **Return to live** afterward.
6. Export when the browser-memory recording matters.

Polled transitions span a tick interval. Exact events and sampled transitions
remain visibly different. Gaps are retained rather than interpolated.

### 4. Compare

Choose **Observe → Compare**.

![Creature and cohort comparison in
Firefox](/docs/images/observatory/creature-cohort-comparison-firefox.png)

1. Pick Individuals, Self/ranges, or Cohort.
2. Add the selected creature or choose **All present**.
3. Select explicit measures, including pinned chemicals where needed.
4. Refresh one coherent bulk snapshot or enable active-view sampling.
5. Read every result with its unit, `n`, missing count, spread, and raw
   individuals.
6. Save/export the definition or report; compare exactly two genome structures
   only when needed.

Median and IQR describe this sampled cohort. They are not a healthy target for
an individual. Dead or missing recorded members remain explicit.

### 5. World and Ecology

Choose **Observe → World & ecology**.

![World/ecology room graph, CA layers, agent evidence, and textual room table in
Firefox](/docs/images/observatory/world-ecology-observatory-firefox.png)

1. Select a metaroom and CA channel.
2. Toggle rooms, doors, explicit links, agents, field, and route layers.
3. Inspect a room or agent; use the textual room table when a map is
   inconvenient.
4. Select a creature to compare current room, IT target, sensory availability,
   CA values, and nearby/reachable agents.
5. Set a permeability threshold before reading a Derived connection chain.
6. Check endpoint truncation flags before treating the view as complete.

In the validated fixture, metaroom 11 exposed 73 rooms, 201 connections,
explicit links 628↔600, 666↔621, and 621↔658, lift/elevator-like agents, and
world-supplied fruit/CA 6 evidence. The workflow never changes room links,
navigation, CA diffusion, targetless `APPR`, elevator behavior, or smell
recovery.

### 6. Running Scripts

Choose **Observe → Running scripts**.

1. Filter by state, classifier, event, gallery, creature, Changed, or New.
2. Turn on **Group identical** for repeated timer/event instances.
3. Read the compact current statement; open **Details** for exact IP,
   blocking command/reason, TARG, IT, ticks, and source revision.
4. Use **Debugger** to preserve the owner and exact script/event context.

**Waiting** appears only for an identified `WAIT`. Other blocked VMs remain
**Blocking**. **Finished**, **Changed**, and **New** are Derived from successive
samples. Full installed source is fetched on demand and revision-cached.

### 7. Logs and Diagnostics

Choose **Observe → Logs** for structured SSE evidence or **Develop →
Diagnostics** for error/API-gap emphasis.

1. Filter severity independently from subsystem.
2. Add text, world, agent, classifier, event, time, or context-tick filters.
3. Open Context for exact timing, agent/script identity, bytecode IP, and
   correlation ID.
4. Bookmark or annotate a retained record.
5. Follow Agent, Scripts, or Debugger links with context preserved.
6. Export JSONL/JSON/text when the record must leave bounded browser memory.

World boundaries, server restart, reconnect, and retention overflow appear as
explicit rows. Server and browser each retain at most 5,000 records and about
4 MiB.

## Guided Tour: Experiment

### 1. Experiment Workspaces

Choose **Experiment → Workspaces** before a planned treatment.

![Experiment protocol, control/treatment arms, recording, and provenance in
Firefox](/docs/images/observatory/experiment-workspace-firefox.png)

1. Enter title, question, hypothesis, baseline duration, arms, measurements,
   sampling interval, planned intervention, observation duration, stopping
   condition, and unavoidable differences.
2. Mark the world disposable/branched only when that is actually true.
3. **Create protocol** to capture sanitized engine/world provenance.
4. **Start baseline**; wait for the intended evidence.
5. **Begin treatment**, then perform the separately reviewed intervention.
6. Add notes/bookmarks and inspect the intervention ledger.
7. Stop recording, export the schema-v1 manifest, then reopen it to verify the
   record.

The manifest is a portable evidence record, not a world save. It omits worlds,
creatures, genome binaries, gene arrays, assets, and local paths by default.
Legacy draft version 0 migrates; unsupported future versions fail visibly.

Use **Preview branch** to review a save-and-copy of the active world. It never
loads, overwrites, or deletes the destination. Loading the new branch is a
separate decision.

### 2. Safe Chemical Intervention

Choose a creature, then **Experiment → Chemical intervention**.

![Final chemical intervention review in
Firefox](/docs/images/observatory/safe-chemical-intervention-firefox.png)

1. Select chemical ID 1–255; slot 0 is reserved.
2. Capture a baseline or explicitly accept that it was skipped.
3. Choose **Adjust by dose** or **Set target concentration**.
4. Read the current Observed value and Derived immediate clamped preview.
5. Choose **Review intervention**.
6. Recheck creature name, agent ID, moniker, world, sample tick, operation,
   pause behavior, and follow-up plan.
7. Cancel/Escape/outside-click if anything is wrong.
8. Apply only after the final review; then inspect before/requested/after,
   correlation ID, intervention ledger, Timeline, and follow-up series.

The engine rechecks world, creature moniker, sample tick, and expected
concentration on its main thread. Duplicate submissions are blocked. The
immediate inverse dose cannot reverse metabolism or downstream effects; an
applied chemical change cannot be truly undone.

### 3. Copy-first Genetics

Choose **Experiment → Genetics experiments**.

![Copy-first Genetics experiment and injection review in
Firefox](/docs/images/observatory/safe-genetics-experiment-firefox.png)

1. Select a source and inspect its protection, checksum, format, and
   provenance.
2. Create a collision-free experimental copy. Never edit the original.
3. Change the copy and inspect the structured source→derived diff.
4. Save only after schema/range and stale-source validation.
5. Choose egg/creature mode and sex.
6. Open final injection review.
7. Confirm exact derived/source checksums, diff, active disposable/branch
   world, mode, and explicit acknowledgements.
8. Apply, then open the resulting creature and retain the provenance record.

Only verified experimental copies can be renamed/deleted, and those operations
have separate confirmations. Injection is a world mutation. Deleting the new
creature later does not restore the prior simulation trajectory.

## Guided Tour: Develop

### 1. CAOS Workbench

Choose **Develop → CAOS Workbench**.

![CAOS Workbench with explicit mode, bound context, validation, and final review
in Firefox](/docs/images/observatory/caos-workbench-firefox.png)

The five modes are separate contracts:

- **Evaluate now** — checksum-bound source in a fresh ownerless VM; optional
  reviewed TARG binding.
- **Inspect running** — navigate to an observed active VM without executing
  source.
- **Install event** — exact classifier must be absent.
- **Replace event** — exact classifier and installed checksum must still match.
- **Remove event** — exact classifier/checksum plus explicit confirmation.

Procedure:

1. Choose the mode before writing source.
2. For event modes, enter exact family/genus/species/event.
3. Inspect bound world, tick, and optional target.
4. Validate exact source; read risk, checksum, error location, and diff.
5. If the context changes, validate again.
6. Open the final review for mutating/acknowledged modes.
7. Apply once; inspect output, correlation ID, ticks, elapsed time, and Logs.

Blocking commands cannot yield in the fresh evaluation VM. An installed,
replaced, or removed script cannot be truly undone except by a separately
reviewed compensating operation or world rollback.

### 2. Scratchpad

Choose **Develop → Evaluate-now Scratchpad** for short read-only ownerless
queries.

1. Enter source and press Enter; use Shift+Enter for a newline.
2. The engine compiles it first and binds the checksum to the current world.
3. Known mutation, broad/destructive, blocking, or unknown commands are
   refused and offered to Workbench.
4. Use Up/Down for history.

Scratchpad has no OWNR/TARG and each command uses a fresh VM. Variables do not
persist between commands.

### 3. Debugger

Choose **Develop → Debugger** or arrive from Scripts/Logs.

1. Select an exact running agent VM.
2. Read source, current IP, state, OWNR/TARG/FROM/IT, and variables.
3. Set a breakpoint on a source line.
4. Use Continue, Step Into, or Step Over.
5. Clear breakpoints and continue the VM when finished.

A paused VM is not the same as a paused world. Do not leave an agent suspended
accidentally.

## Guided Tour: Learn

### Task Guides

Choose **Learn → Task guides** when you have a question rather than a tab in
mind. The guides cover orientation, behavior investigation, time series,
comparison, ecology, safe experiments, CAOS, keyboard use, and data-path
tracing. They remain available while disconnected.

### CAOS Reference

Choose **Learn → CAOS reference** for maintained command/category documents.
This is language documentation, not permission to execute arbitrary source in
a personal world.

### Live Architecture

Choose **Learn → Architecture**.

![Live Architecture graph with layers, metric path, recent-request evidence,
and inspector in Firefox](/docs/images/observatory/live-architecture-graph-firefox.png)

1. Filter engine, domain, transport, browser, surface, and external layers.
2. Search for an endpoint, field, component, route, or concept.
3. Select a node or relationship for evidence, limitations, and links.
4. Choose a metric path such as drive, chemical, CA, script statement, log
   record, or genome provenance.
5. Compare static metadata with recent mapped request evidence.
6. Toggle the full text representation when preferable.

The graph has 48 nodes and 51 maintained relationships. Recent Resource Timing
can show that a mapped request completed in this browser during the previous
30 seconds. It does not trace response bodies or prove the whole static path
executed.

## Time, Freshness, Recording, and Provenance

Keep these concepts separate:

- **World tick** advances with simulation time and freezes while paused.
- **System tick** and wall capture time may continue while the world is paused.
- **Sample interval** describes how often a browser recorder asked, not how
  often the biological state changed.
- **Freshness** compares capture age with the producing cadence. A stale sample
  remains historical evidence; it is not current state.
- **Exact event** is an engine/log/intervention record at a tick.
- **Derived transition** spans two samples and has interval uncertainty.
- **Recording** is browser memory unless its guide says otherwise. Explicit
  background recording is the exception to inactive-view polling suspension.
- **Provenance** keeps subject/world identity, parameters, requested operation,
  observed result, ticks, checksums/correlation, gaps, annotations, and stated
  limitations separate.

Bounded history is intentional. Consult
[Release Validation](observatory_release_validation.md#performance-and-supported-limits)
before a long run, and export evidence before its retention window matters.

## Accessibility, Keyboard, and Responsive Behavior

The verified interface supports:

- skip link and route announcements;
- semantic dialog names and focus restoration;
- Tab through all routes and primary controls;
- Arrow Up/Down plus Home/End within navigation;
- Arrow Left/Right within internal tabs and roving graph/room/timeline/brain
  collections where documented;
- Escape for dialogs, drawers, and narrow navigation;
- F1 contextual help and Shift+? Display settings;
- Alt+Left Observatory history;
- Comfortable/Compact density, reduced motion, and shortcut disable;
- labelled text alternatives for brain, Timeline, Ecology, biological series,
  and Architecture;
- 720×900 narrow, 1600×940 standard, 1920×1080 wide, and 200% zoom.

![Narrow Observatory navigation and single-column dashboard in
Firefox](/docs/images/observatory/narrow-observatory-firefox.png)

Global shortcuts do nothing inside editable controls. Browser text zoom remains
independent of Observatory density. If a shortcut conflicts with assistive
technology, disable Observatory shortcuts in Display.

## Migration and Compatibility

Preferred links use:

```text
#observe?route=timeline&tab=timeline&world=WorldName&primary=creature&creature=622
```

Useful legacy hashes such as `#creatures`, `#log`, `#console`, `#scripts`,
`#debugger`, `#ide`, and `#docs` still map to named routes. Old
`#docs/file.md:section` links still open the wiki.

Legacy `/api/execute`, `/api/validate`, and `/api/scriptorium/inject` remain for
compatibility. New reviewed clients should use `/api/caos/validate`,
`/api/caos/evaluate`, and `/api/caos/script`. Log schema 2 retains legacy
aliases; established Scripts state strings remain while the browser derives
additional activity labels.

Versioned imports reject unsupported schemas instead of guessing. See
[Migration and Rollback](observatory_migration_and_rollback.md) for the full
schema table and procedure.

## Rollback, Troubleshooting, and Cleanup

### Before a Code Rollback

1. Stop recordings and export evidence that must survive.
2. Confirm world, pause state, and speed; resume at speed 1 unless the protocol
   deliberately says otherwise.
3. Shut down the engine gracefully.
4. Check out the earlier local commit/branch and rebuild the matching binary
   and tools bundle.
5. Test the earlier build against an isolated copy first.
6. Open only export schemas that build explicitly supports.

A code rollback does not reverse an applied chemical, injected creature,
genome file operation, script mutation, saved world, or exported file.

### Common Problems

**A route says context is missing**

- Check the ribbon for connection and loaded world.
- Select a live creature where required.
- Clear a historical/missing selection and select the current subject.

**Values look frozen**

- Distinguish frozen Observation view, paused Log rendering, paused recording,
  disabled Auto, hidden/inactive polling, and globally paused simulation.
- Check sample age and world-tick movement in the ribbon.

**A review refuses a target**

- Refresh the live target.
- Check active world, moniker/classifier/checksum, sample tick, current
  concentration/source revision, and confirmation.
- Do not weaken the guard; rebuild the review from current evidence.

**A map or cohort looks incomplete**

- Read truncation and missing counts.
- Narrow the metaroom/viewport, channels, filters, cohort, or tick range.
- Do not treat omitted rows as zero.

**Browser and engine disagree**

- Confirm the served `tools/` directory belongs to the built binary.
- Inspect `/api/session`, the feature endpoint/schema, Diagnostics, Logs, and
  Architecture recent-request status.
- Hard-reload Firefox after changing browser files.

**MCP can read the engine but not reproduce a browser workflow**

- The adapter intentionally exposes 25 focused tools, not every Observatory
  workflow or narrow reviewed-change endpoint.
- Do not replace missing review/provenance by casually using `execute_caos`.

### End-of-Session Cleanup

1. Stop or export active recordings.
2. Close mutation review dialogs without applying if unfinished.
3. Clear debugger breakpoints and continue paused VMs.
4. Verify the engine is running at the intended speed, normally 1.
5. Shut down `lc2e` gracefully.
6. Remove disposable runtime data outside Git when you no longer need it.
7. Confirm Git contains no world, save, creature, genome, log, CAOS injection,
   or proprietary asset generated by the session.

## Task and Commit Index

| Task | Outcome | Local commit |
|---:|---|---|
| 01 | Shared immutable world, selection, evidence, sample, history, request, and intervention state | `ffed600` — Add observatory state and evidence model |
| 02 | Correct glycogen/organ/Brain biological semantics and API/MCP parity | `6d6f938` — Correct biological semantics in developer tools |
| 03 | Persistent world/session ribbon, exact state, freshness, and speed controls | `f20cf8e` — Add world and session status ribbon |
| 04 | World-qualified shared selection, deep links, Back/Forward, and cross-navigation | `9b86b67` — Add shared observatory navigation context |
| 05 | Compact, filterable, source-revision-aware Running Scripts workspace | `892f3a1` — Redesign running scripts workspace |
| 06 | Structured tick-aware logs, SSE gaps/replay, context, annotations, and exports | `b80efb3` — Add contextual observatory logs |
| 07 | Bounded biological series, pins, trends, intervals, gaps, and export | `af5db69` — Add stable biological time-series monitoring |
| 08 | Seven-stage live creature observation endpoint and strip | `2a6f70e` — Add live creature observation strip |
| 09 | Bounded world-tick Ethology Timeline with sampled/exact evidence | `28465e6` — Add bounded ethology timeline |
| 10 | Individuals, self/range, and cohort comparison with raw/missing statistics | `c4939d5` — Add creature and cohort comparison |
| 11 | Read-only rooms, links, agents, CA fields, routes, and ecology evidence | `054bcff` — Add world and ecology observatory |
| 12 | Protocol, recording, provenance, branch preview, portable experiment manifest | `3d97095` — Add experiment workspaces and provenance |
| 13 | Narrow stale-safe chemical preview, confirmation, result, and ledger | `1b5a31f` — Add safe chemical intervention workflow |
| 14 | Protected copy-first genome diff/save/injection workflow | `9f6f8b6` — Add safe genetics experiment workflow |
| 15 | Explicit CAOS Evaluate/Inspect/Install/Replace/Remove contracts | `4bdea84` — Add explicit CAOS authoring workflow |
| 16 | Four-group named navigation and live Observatory dashboard | `998d81b` — Add Observatory navigation and dashboard |
| 17 | Authoritative contextual help, offline task guides, and integrity checks | `67b9928` — Add contextual help and task guides |
| 18 | 48-node/51-edge live-context Architecture graph and metric paths | `5d96c43` — Add live Observatory architecture graph |
| 19 | Keyboard, semantics, focus, contrast, reduced motion, responsive and zoom polish | `fa23f7b` — Improve Observatory accessibility and responsive design |
| 20 | Product release audit, supported limits, migration/rollback, MCP boundary, and release gate | `7396da1` — Validate and document Observatory release |

This hand-off is the final additional documentation commit. None of the listed
commits was pushed by Codex.

## Exact Final Validation Matrix

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

The full report, performance boundaries, and known limitations are in
[Observatory Release Validation](observatory_release_validation.md).

## Known Limitations to Keep Visible

- Simulation non-determinism remains.
- Cross-endpoint panels are sampled, not globally atomic.
- Browser histories are bounded and session-local until exported.
- CA meaning depends on the active world.
- Architecture recent-request status is not runtime call tracing.
- Evidence correlation is not causal proof.
- Applied world, chemical, creature, genome, script, save, or file changes
  cannot be truly undone.
- The MCP adapter is not feature-parity with the browser Observatory.

## Hand-off Confirmation

Tasks 01–20 are implemented. The 31 October 2026 corrections are committed
locally on `codex/developer-tools-observatory`, reviewed, and tested in real
Firefox against both a synthetic engine and a live one on isolated data. No
required game or proprietary artifact is in Git, and no commit was pushed.
