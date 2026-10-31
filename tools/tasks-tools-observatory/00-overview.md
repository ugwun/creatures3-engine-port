# Developer Tools Observatory — Implementation Overview

Status: Completed

## Purpose

This backlog turns the existing Developer Tools from a collection of powerful
inspectors into an observatory for digital life.

The current tools expose a great deal of engine state: creature drives,
biochemistry, organs, genomes, neural activity, running CAOS, breakpoints,
logs, and engine architecture. Their main limitation is not missing raw data.
It is that the user must mentally reconstruct the relationship between those
systems and must do so without a stable experimental record.

The observatory should support a scientific loop:

1. Observe an autonomous creature and its environment.
2. Notice a change or recurring pattern.
3. Form a hypothesis without presenting it as certain.
4. Make a deliberate, recorded intervention when necessary.
5. Compare the outcome with a baseline.
6. Preserve enough evidence for another person to inspect the result.

The tools must reveal the interacting processes that produce behaviour without
reducing Creatures to a conventional scripted-AI debugger.

## Product principle

> Show evidence of an emergent process, not a fabricated deterministic
> explanation.

The UI may report that hunger increased, a food smell was present, attention
selected food, the decision lobe selected Eat, and an Eat script ran. It must
not collapse those observations into the claim “the Norn ate because it was
hungry.” Concurrent neural, biochemical, environmental, and scripted systems
make that causal statement stronger than the evidence supports.

## Core design principles

### Biological honesty

- Use engine-accurate names and units.
- Distinguish direct engine facts from UI inference.
- Show confidence and supporting evidence for inferred labels.
- Preserve raw values and identifiers behind progressive disclosure.
- Do not invent a single health score for a multi-system organism.

### Temporal context

- A value without its history is often misleading.
- Samples, events, interventions, and exports use world ticks as the primary
  simulation timebase.
- Wall-clock timestamps may supplement world ticks but never replace them.
- Every polled panel shows its sample age and paused/running state.

### Creature autonomy

- Observation is the default mode.
- Interventions are explicit, attributable, and recorded.
- The tools do not silently train, rescue, reposition, feed, or otherwise
  change creatures.
- Friendly summaries describe observable state rather than assigning intent.

### Experimental safety

- Use disposable or branched worlds for invasive work.
- Preview scope before mutation.
- Record before/after values and the exact world tick.
- Explain when an action cannot truly be undone after simulation continues.
- Editing core genome files is never the default path.

### Connected investigation

- World, creature, agent, script, chemical, neuron, tract, gene, and log
  selections should cross-link instead of becoming isolated tabs.
- A user should be able to follow evidence across systems without copying IDs.
- The same selection and time context should remain visible during navigation.

### Progressive disclosure

- Default views answer common questions in plain language.
- Expert views expose exact classifiers, bytecode IPs, neuron state variables,
  chemical IDs, CA channels, and genome bytes.
- Compact summaries expand in place or open a dedicated inspector.

## Scope

The backlog covers:

- correctness and evidence labeling;
- world/session awareness;
- shared investigative context;
- script, debugger, and log usability;
- stable biological monitoring and history;
- a live creature observation strip and ethology timeline;
- individual and cohort comparison;
- world geometry, CA gradients, smells, and affordances;
- experiment branching and intervention provenance;
- safe Syringe and Genetics workflows;
- CAOS authoring workflow clarity;
- navigation, overview, documentation, accessibility, and release validation.

It does not attempt to replace the game UI, prescribe creature behaviour, add
top-down AI, or make the simulation deterministic.

## Numbering and implementation order

Every task filename begins with a two-digit number. That number is the intended
implementation order and also encodes the principal dependency chain.

Tasks should normally be completed in ascending order. A later task may start
early only when all of its stated dependencies are satisfied and it does not
establish a competing data model or navigation pattern.

If a new task must be inserted, prefer a suffix such as `07a` rather than
renumbering completed work and breaking links.

## Ordered backlog

| Order | Task | Primary outcome | Depends on |
|---:|---|---|---|
| 01 | [Define the observatory state and evidence model](01-observatory-state-and-evidence-model.md) | Shared vocabulary, state contracts, and evidence levels | — |
| 02 | [Correct biological semantics](02-correct-biological-semantics.md) | Trustworthy health, organ, brain, and API labels | 01 |
| 03 | [Add the world and session status ribbon](03-world-and-session-status-ribbon.md) | World, tick, speed, pause state, and freshness always visible | 01 |
| 04 | [Add shared selection and cross-navigation](04-shared-selection-and-cross-navigation.md) | Persistent world/creature/agent context across tools | 01, 03 |
| 05 | [Redesign running scripts](05-running-scripts-workspace.md) | Compact, filterable script activity with debugger handoff | 04 |
| 06 | [Correlate logs with engine context](06-contextual-logs-and-timebase.md) | Searchable logs tied to ticks, agents, scripts, and worlds | 03, 04 |
| 07 | [Add stable biological time-series monitoring](07-biological-time-series-monitoring.md) | Trends, deltas, pinning, and stable ordering | 01–04 |
| 08 | [Build the live creature observation strip](08-live-creature-observation-strip.md) | One compact view of current perception, decision, action, and physiology | 02, 04, 07 |
| 09 | [Build the ethology timeline](09-ethology-timeline.md) | Scrubbable, evidence-based behavioural history | 06–08 |
| 10 | [Add creature and cohort comparison](10-creature-and-cohort-comparison.md) | Side-by-side individuals and aggregate population views | 07, 09 |
| 11 | [Build the world and ecology observatory](11-world-and-ecology-observatory.md) | Rooms, CA gradients, smells, sources, agents, and affordances | 03, 04, 06, 07 |
| 12 | [Add experiment workspaces and provenance](12-experiment-workspaces-and-provenance.md) | Baselines, branches, treatment records, and exports | 03, 06, 07, 09, 11 |
| 13 | [Make chemical interventions safe](13-safe-chemical-interventions.md) | Previewed and recorded Syringe experiments | 07, 12 |
| 14 | [Make genetics experiments safe](14-safe-genetics-experiments.md) | Copy-first genome editing, diffs, and experimental injection | 02, 12 |
| 15 | [Clarify the CAOS authoring workflow](15-caos-authoring-workflow.md) | Clear Scratchpad versus Scriptorium roles and safer mutation | 04–06, 12 |
| 16 | [Create the observatory navigation and dashboard](16-observatory-navigation-and-dashboard.md) | Task-oriented information architecture and landing view | 03–15 |
| 17 | [Rework contextual help and documentation](17-contextual-help-and-task-guides.md) | Accessible help and workflow-oriented guides | 16 |
| 18 | [Connect the architecture graph to live context](18-live-architecture-graph.md) | Architecture as an investigative map rather than a static diagram | 04, 16, 17 |
| 19 | [Complete accessibility and responsive polish](19-accessibility-responsive-and-visual-polish.md) | Keyboard, contrast, layout, and motion quality | 16–18 |
| 20 | [Validate, document, and release the observatory](20-validation-documentation-and-release.md) | End-to-end verification, current docs, and rollout evidence | 01–19 |

## Delivery phases

### Phase A — Trustworthy foundations

Tasks 01–04 define the state model, fix misleading semantics, expose the active
world, and establish shared selection. All later observatory features depend
on these contracts.

### Phase B — Engine activity clarity

Tasks 05–06 make scripts and logs compact, searchable, and correlated. These
streams become evidence sources for the timeline rather than isolated tools.

### Phase C — Temporal creature observation

Tasks 07–10 add stable histories, a present-tense observation strip, a
scrubbable ethology timeline, and comparison between individuals or cohorts.

### Phase D — Ecology and safe experimentation

Tasks 11–14 expose embodiment and environmental gradients, then build a common
experimental protocol for chemical and genetic intervention.

### Phase E — Authoring and information architecture

Tasks 15–18 clarify CAOS workflows and reorganize the interface around Observe,
Experiment, Develop, and Learn. Contextual documentation and the architecture
graph become part of the investigative workflow.

### Phase F — Product quality and release

Tasks 19–20 finish accessibility, responsive behavior, verification,
documentation, screenshots, and rollout readiness.

## Shared technical direction

### Browser architecture

- Extend `DevToolsEvents` or replace it with a small documented store that
  supports subscriptions, immutable snapshots, and typed state conventions.
- Keep modules decoupled from one another's DOM.
- Poll only while a consumer is active, unless a recording session explicitly
  requires background sampling.
- Centralize polling where multiple panels consume the same endpoint.

### Engine and API architecture

- Prefer explicit structured endpoints over constructing observational data
  through hidden CAOS execution.
- Keep engine access on the main thread through the existing DebugServer work
  queue.
- Bound history buffers and large neural/chemical payloads.
- Add focused pure logic helpers and GoogleTest coverage for transformations,
  classifications, and serialization.
- Preserve API compatibility where practical; version or add fields rather
  than changing established meanings silently.

### Time model

Every observational sample should be able to carry:

```text
worldName
worldTick
systemTick
enginePaused
gameSpeed
capturedAtWallTime
sourceEndpoint
```

UI-generated events should additionally record their sampling interval and
whether values are exact engine events or inferred from successive samples.

### Evidence levels

Use a consistent vocabulary:

- **Observed** — directly reported by engine state or a recorded engine event.
- **Derived** — mechanically calculated from observed values.
- **Inferred** — heuristic interpretation with supporting evidence.
- **Unknown** — insufficient evidence; do not fill the gap with a narrative.

## Documentation and in-product guidance strategy

Documentation is part of each feature, not a final release activity. Every
numbered task contains a **Documentation and in-product guidance** section that
identifies:

- Developer Tools pages, task guides, API/MCP material, examples, and
  screenshots to update;
- pop-up tips, tooltips, help-drawer entries, first-visit guidance, and
  accessible alternatives to add or revise;
- terminology, evidence labels, safety warnings, and limitations that must be
  explained at the point of use;
- obsolete or misleading guidance that must be removed.

The work is intentionally divided into three layers:

1. **Feature ownership** — Tasks 01–16 and 18–19 ship their own documentation
   and contextual guidance alongside implementation.
2. **Shared guidance system** — Task 17 establishes the help patterns, content
   inventory, task-guide structure, editorial rules, and stale-content checks
   used across the tools.
3. **Release audit** — Task 20 verifies coverage, accuracy, accessibility, live
   links, and consistency. It must not defer feature documentation until the end.

Concise help appears near the relevant control or data. Longer explanations and
workflows live in task-oriented guides. Both use the same terminology and
evidence model, and both remain accessible when the engine is disconnected.

## Global acceptance criteria

Every completed feature must:

- work with the engine running and paused;
- show its active world and sample age;
- distinguish observed, derived, and inferred information;
- preserve raw identifiers where useful;
- avoid unrecorded world or genome mutation;
- handle no-world, no-creature, disconnected, loading, and stale-data states;
- avoid polling when its view and recording services are inactive;
- include focused automated coverage proportional to risk;
- include a live isolated-world verification when proprietary data is required;
- complete its documentation and in-product guidance section in the same task;
- keep pop-up tips, tooltips, help drawers, task guides, screenshots, and
  feature inventories consistent with the implemented interface;
- leave the engine resumed and at normal speed after live verification.

## Verification strategy

Use three layers:

1. **Pure unit tests** for formatting, classification, evidence labeling,
   history reduction, comparison math, and safety-state transitions.
2. **Browser module tests** for store behavior, rendering decisions, keyboard
   interaction, and endpoint error handling.
3. **Serial integration tests** with an isolated game-data copy and disposable
   world for endpoint shape, live sampling, pause/resume, and intervention
   provenance.

Manual validation should include narrow, standard, and wide viewport captures
for every visually material task.

## Definition of complete

The observatory is complete when a developer can:

- identify the active world and simulation state at all times;
- select a creature once and follow it across every relevant tool;
- observe environmental input, internal state, neural selection, active CAOS,
  and physiological consequences on one timebase;
- compare two creatures or a cohort without exporting and joining data by hand;
- conduct a chemical or genetic experiment without silently modifying personal
  data or losing the baseline;
- move from a visual fact to the underlying chemical, neuron, tract, gene,
  agent, script, log, documentation, and source context;
- distinguish exact engine state from UI inference;
- reproduce the investigation from exported evidence.

## Completion

Tasks 01–20 were completed, reviewed, tested in Firefox against isolated
worlds, documented, and committed locally. The final release evidence,
supported limits, known limitations, migration boundary, rollback procedure,
and exact verification commands are maintained in
[`observatory_release_validation.md`](../docs/observatory_release_validation.md)
and
[`observatory_migration_and_rollback.md`](../docs/observatory_migration_and_rollback.md).
The owner-facing operating guide is
[`developer-tools-observatory-handoff.md`](../docs/developer-tools-observatory-handoff.md).
No Observatory commit was pushed as part of this roadmap.
