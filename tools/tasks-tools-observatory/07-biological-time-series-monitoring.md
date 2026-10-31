# Task 07 — Add Stable Biological Time-Series Monitoring

Status: Completed

Depends on: Tasks 01–04

## Goal

Make drives, chemicals, organs, and selected neural values understandable as
changes over time rather than isolated bars that reorder every refresh.

## User problem

The Chemistry view sorts by current concentration on every poll. Rows move as
values change, making it difficult to track one chemical or compare successive
states. Drives and organ status similarly show current values without trend,
rate, sampling interval, or retained baseline.

## Monitoring model

Support bounded histories for:

- all creature drives;
- pinned chemicals;
- pinned organ health and rates;
- selected lobe/neuron state variables;
- reward and punishment chemicals;
- vital energy, respiratory, injury, and toxin indicators.

Histories use world ticks and retain sampling metadata.

## Interaction design

### Stable ordering

Offer explicit order modes:

- canonical ID;
- functional group;
- current value;
- absolute change;
- user-defined pinned order.

Do not change order implicitly while the user is inspecting a row.

### Trends

Each monitored row may show:

- current value;
- delta from previous sample;
- delta from selected baseline;
- compact sparkline;
- minimum, maximum, and rate over the visible interval;
- stale or missed-sample indicator.

### Pinning and groups

Users can pin values into a monitoring tray and browse functional groups:

- energy and metabolism;
- respiration;
- digestion and reserves;
- drives and backups;
- immunity;
- smells and environmental channels;
- reproduction;
- stress, injury, and toxins;
- sleep and reinforcement.

Groups are navigation aids, not claims that chemicals have only one function.

## Sampling behavior

- Default sampling should be useful without overwhelming the engine.
- Active recording may use a configurable tick or wall-time interval.
- Paused worlds record one state change and then stop duplicating identical
  samples.
- Accelerated simulations must expose skipped intervals.
- Switching creatures does not mix histories.
- Loading worlds clears incompatible live history but may retain labeled
  historical sessions for comparison.

## Technical direction

- Build on Task 01 state and evidence metadata.
- Add a bounded ring-buffer service.
- Prefer bulk creature snapshots for cohort monitoring.
- Fetch detailed chemistry or neural state only for selected/pinned subjects.
- Keep rendering independent from storage so Timeline and Comparison can reuse
  the same series.
- Define downsampling for long visible ranges.

## Documentation and in-product guidance

- Document sampling, stable ordering, pinning, deltas, smoothing, gaps, units,
  retention, and export behaviour for every biological series.
- Add chart help for inspecting exact values, sample age, intervention markers,
  and the difference between concentration, rate, and change.
- Add a guide for following one drive, chemical, organ value, or neural signal
  over time without over-interpreting correlation.
- Remove tips that describe a latest value as a trend or hide that samples were
  skipped.

## Deliverables

- Stable-order controls.
- Pinning tray and functional grouping.
- Sparklines and delta indicators.
- Baseline selection.
- Bounded history service with downsampling.
- Exportable series schema.
- Unit tests for sampling, gaps, bounds, and deltas.

## Acceptance criteria

- A pinned chemical remains in a stable position while its value changes.
- Users can distinguish previous-sample delta from baseline delta.
- Paused simulation state does not fill history with duplicate samples.
- Missed samples and stale data are visible.
- History memory remains bounded during long sessions.
- Creature and world switches cannot merge unrelated series.
- Timeline and Comparison can consume the same stored samples.

## Verification

- Monitor digestion after a feeding event.
- Monitor sleepiness and tiredness across sleep/wake transitions.
- Monitor a chemical intervention without assuming an instantaneous effect is
  the final biological consequence.
- Run at normal and accelerated speed and inspect gaps/downsampling.
- Test multiple selected creatures and a world switch.

## Out of scope

- Causal narrative generation.
- Full environment/CA history.
- Invasive intervention controls.

## Implementation notes

- Added a DOM-independent, schema-versioned bounded series store with
  world/creature session isolation, tick-regression epochs, pause duplicate
  suppression, explicit missed intervals, baselines, deltas, rates, stable
  sorting, pin order, min/max-envelope downsampling, intervention attachment,
  and JSON export.
- Added the shared Biological monitor to all Creatures biological sub-tabs.
  It records all drives; pinned and vital/reinforcement chemicals; organ
  health/rate values while visible; and selected neuron states while visible.
- Chemistry now defaults to canonical ID order instead of re-sorting by
  concentration. Current value and absolute change remain available as
  explicit user-selected modes.
- Added exact-value sparkline targets, min/max/rate summaries, stale/drop/gap
  warnings, intervention markers, configurable 1/2/5-second polling, and
  phone-width stacked layout.
- Successful Syringe actions now enter the Task 01 intervention ledger, so the
  following sample can carry their provenance.

## Verification record

- Pure series tests cover metadata, previous/baseline deltas, rate, pause
  suppression, accelerated gaps, per-series/global bounds, drop counts,
  creature/world/tick-regression isolation, pin and order stability, export,
  extrema-preserving downsampling, tick-zero baselines, and one-time
  targeted intervention attachment. All 13 focused tests passed, as did every
  existing `tools/tests/*.test.cjs` test.
- Live engine fixture: isolated undocked world `Task 07 Biological Monitor`,
  two disposable Norns (Astro male and Harlequin female), initial speed 1×.
- Firefox 152.0.6: exercised drives, chemistry, all five order modes, pin
  tray/reordering, baseline, organ metrics, selected-neuron states, 4× gap
  visibility, restored 1× speed, pause/resume duplicate suppression, and
  creature and world switching. A Syringe intervention produced markers only
  on ATP series. No captured page errors.
- Firefox viewports: 720×814, 1600×914, and 1920×994 CSS pixels. Body
  horizontal overflow remained zero; the narrow layout stacked the creature
  selector over a 560-pixel detail workspace.
- Visual proof: `tools/docs/media/tab_creatures.png`.
- `cmake --build build -j2` succeeded and all 477 CTest cases passed.
- Final syntax checks and `git diff --check` passed.
