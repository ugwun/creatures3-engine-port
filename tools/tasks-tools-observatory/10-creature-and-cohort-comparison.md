# Task 10 — Add Creature and Cohort Comparison

Status: Completed

Depends on: Tasks 07 and 09

## Goal

Support comparison between individuals, time ranges, genomes, and cohorts
without requiring users to export raw data and join it manually.

## Comparison modes

### Individual versus individual

Compare two or more creatures at the same or nearest available world tick:

- identity, sex, species, age, and life state;
- drives and vital indicators;
- pinned chemicals and organ health;
- attention and decision activity;
- behavior-event frequencies;
- rooms visited and movement range;
- relevant genome structural differences.

### Individual versus self

Compare:

- current state versus a captured baseline;
- before versus after an intervention;
- one life stage versus another;
- two timeline ranges.

### Cohort

Summarize:

- population and survivor counts;
- sex/species/age distributions;
- births and deaths;
- median and spread of selected measures;
- room occupancy and movement;
- behavior-event rates;
- outliers and missing data.

## Scientific presentation

- Show distributions and raw individuals, not only averages.
- State cohort size for every statistic.
- Show missing samples and deaths rather than dropping them.
- Avoid ranking creatures as “best” or “smartest.”
- Do not compare values from materially different ticks without labeling the
  offset.
- Preserve genome and treatment provenance when available.

## Interaction design

- Add subjects from the shared selection context.
- Pin comparison measures from any compatible inspector.
- Synchronize charts by world tick or relative time from a marked event.
- Allow overlays, small multiples, and difference tables.
- Link outliers back to their timeline.
- Save a comparison definition without embedding proprietary genome data.

## Technical direction

- Consume Task 07 series and Task 09 events.
- Use bulk snapshot endpoints for cohort state.
- Add pure statistical helpers with explicit missing-data behavior.
- Keep expensive genome/brain comparisons on demand.
- Define repository-safe export schemas.

## Documentation and in-product guidance

- Document individual, baseline, cohort, and aggregate comparison modes,
  membership rules, units, missing data, and summary calculations.
- Add pop-up tips for sample size, range, distribution, normalization, and
  non-comparable measurements.
- Add a guide for comparing two creatures or a treatment cohort while retaining
  individual variation and provenance.
- Remove tips that treat a cohort average as a normal or healthy target for an
  individual creature.

## Deliverables

- Comparison workspace.
- Individual, self/baseline, and cohort modes.
- Measure picker and synchronized time ranges.
- Statistical and difference helpers.
- Outlier-to-timeline navigation.
- Export and documentation.

## Acceptance criteria

- Users can compare two creatures without copying IDs.
- Tick offsets and missing samples are visible.
- Cohort statistics always show `n`.
- Dead or removed creatures remain represented historically.
- Before/after intervention comparison links to the intervention record.
- Comparison definitions survive tab navigation and can be reopened.
- Statistical helpers have focused tests.

## Verification

- Compare the canonical four-Norn cohort.
- Compare one creature before and after sleep or feeding.
- Remove or kill a disposable creature during recording.
- Compare normal-speed and accelerated samples with unequal resolution.
- Validate empty, single-subject, and partially missing cohorts.

## Out of scope

- Declaring treatment causality from one stochastic run.
- Automated breeding selection.
- Genome mutation itself.

## Implementation

- `comparison_model.js` provides pure snapshot normalization, bounded
  world/epoch-qualified cohort history, explicit missing-member retention,
  quantiles/IQR/outliers, nearest-tick alignment, movement and event rates,
  genome structural fingerprints, and repository-safe comparison-definition
  codecs.
- `comparison_workspace.js` supplies same-tick individual, self/range, and
  cohort modes. It consumes Task 07 series and Task 09 events, supports
  intervention-relative ranges, links subjects/outliers back to Timeline,
  retains in-memory definitions across tab navigation, and fetches structural
  genome data only on demand.
- `GET /api/creatures/snapshot` is a coherent main-thread bulk endpoint with
  world/tick provenance, demographics, drives, glycogen, compact organ state,
  attention/decision/action state, geometry, and up to 16 explicitly
  requested chemicals.
- Documentation, contextual tips, API reference, statistical definitions,
  workflow guidance, and the Firefox screenshot live in
  `tools/docs/creature_cohort_comparison.md`.

## Verification completed

- Pure model tests cover statistics and raw outliers, missing values,
  normalization, dead/removed identities and last-observed ticks, bounded
  history, world/tick-regression isolation, nearest-tick tolerance, movement,
  event rates, structural genome diffs, and definition round trips.
- Firefox 152 exercised an exact canonical four-Norn cohort (two male, two
  female) at normal and 8× speed. It verified empty and single selections,
  four-way same-tick comparison, attention/decision/action fields, a logged
  glycogen intervention, intervention-relative self ranges, unequal cadence,
  two-creature structural genome comparison, definition save/reopen, room and
  movement summaries, raw distributions/outliers, and Timeline handoff.
- A disposable fourth creature was removed after cohort recording. Firefox
  retained all four identities while reporting three present, one missing,
  `n=3`, and last-observed tick provenance. Manual refresh worked with
  automatic sampling disabled.
- Firefox reported no uncaught errors and kept the comparison results usable
  without page-level horizontal overflow at 720, 1600, and 1920 pixels. The
  documentation screenshot was captured from the live four-Norn cohort.
- `cmake --build build`, all browser model tests, `git diff --check`, and the
  full CTest suite pass.
