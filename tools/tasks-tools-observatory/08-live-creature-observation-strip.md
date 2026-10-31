# Task 08 — Build the Live Creature Observation Strip

Status: Completed

Depends on: Tasks 02, 04, and 07

## Goal

Provide one compact, present-tense view that assembles the strongest available
evidence about what a selected creature is sensing, attending to, selecting,
executing, and experiencing physiologically.

## Product rule

The strip reports observations. It does not claim to know the creature's
reason, goal, emotion, or intention.

Prefer:

> Highest drive: hunger for carbohydrate. Attention winner: food. Decision
> winner: Eat. Current script: Eat event, approaching agent #913.

Avoid:

> The Norn decided to eat because it was hungry.

## Observation stages

Display a horizontal or compact stacked sequence:

1. **Environment** — room, nearby relevant agents, CA/smell channels.
2. **Perception** — active visual/smell/category signals.
3. **Internal pressure** — highest drives and rapidly changing physiology.
4. **Attention** — attention-lobe winner and current `IT` when available.
5. **Selection** — decision-lobe winner and activity strength.
6. **Action** — creature event/script, blocking state, and target.
7. **Consequence** — recent drive, chemical, reward, punishment, or organ
   changes.

Each stage must show its sample tick and evidence level.

## Uncertainty behavior

- Show “Unknown” when a stage lacks a reliable mapping.
- State when values came from different ticks.
- Warn when polling cadence is too slow to establish event order.
- Do not equate current `IT` with attention unless engine evidence supports it.
- Do not equate the current script with the neural decision when the mapping is
  indirect.
- Show competing values when a winner is weak or rapidly changing.

## Interaction design

- Click a stage to open its source inspector.
- Freeze the strip without pausing the world.
- Capture a named observation at the current tick.
- Compare the live strip with the previous capture.
- Toggle friendly labels and raw expert state.
- Keep the strip available as a collapsible shared panel on organism-focused
  views.

## Technical direction

- Compose existing world, creature, brain-lobe, agent, and script data through
  the shared state store.
- Add structured perception or current-target endpoint data only where
  necessary.
- Use the history service for recent changes.
- Keep composition logic pure and unit-testable.
- Preserve every source record used to render a captured observation.

## Documentation and in-product guidance

- Add a Developer Tools guide to the environment → perception → drive →
  attention → decision → action → consequence strip and its evidence limits.
- Give every stage a contextual tip describing its engine source, freshness,
  evidence level, and links to deeper inspectors.
- Include examples of careful observational wording and explicitly warn against
  collapsing the strip into a deterministic “why” explanation.
- Remove help text that assigns intention or causation solely from a selected
  action, drive, or target.

## Deliverables

- Live observation strip.
- Evidence and sample-tick display.
- Freeze/capture action.
- Source-panel cross-navigation.
- Friendly/raw presentation modes.
- Composition tests and isolated-world validation.

## Acceptance criteria

- Every displayed fact can reveal its source and capture tick.
- Missing stages render as unknown rather than disappearing.
- The strip never labels a sequence as a certain cause.
- A user can reach the relevant Brain, Chemistry, Scripts, Agent, or World
  inspector from one click.
- Capturing the strip does not pause or mutate the world.
- A world or creature switch cannot retain stale stage data.

## Verification

- Observe eating, sleeping, approach, speech, and idle/quiescent sequences.
- Capture rapidly changing attention and decision winners.
- Pause the world between source queries and confirm tick alignment.
- Test a creature with nonstandard brain/genome structures.
- Validate disconnected and partially unavailable endpoints.

## Out of scope

- Long-term timeline and event detection.
- Automated diagnosis.
- Behaviour recommendations or creature control.

## Implementation notes

- Added `GET /api/creature/:id/observation`, a schema-versioned main-thread
  sample that keeps world/time/pause context, creature identity and geometry,
  complete same-room counts, five nearest agents, all 20 room CA/smell
  channels, perception/attention/decision lobe winners and competitors,
  drives, current `IT`, motor state, and the owning CAOS VM in one tick.
  Missing lobes and targets remain explicit null/unavailable records.
- Added a DOM-independent composer with a fixed seven-stage contract,
  evidence/tick/source records, careful Unknown behavior, mixed-cadence
  warnings, derived weak/close/overtaken competition signals, preserved raw
  sources, immutable comparisons, and a bounded 20-capture session store.
- Added the collapsible Creatures Live Observation Strip. Polling occurs only
  for an active, selected, world-qualified creature and follows the Biological
  Monitor interval. Freeze affects only rendering; capture always preserves
  the newest live tick.
- Added named capture comparison, raw expert state, stale status, and source
  handoffs to Brain, Drives, Chemistry, Scripts, and Debugger. Scripts now
  consumes normalized route details to filter by the exact owner, classifier,
  and event. Creature identity is retained through Debugger navigation and
  Browser Back.
- Added responsive card styling, contextual tips, a dedicated guide, API and
  architecture documentation, and a Firefox screenshot.

## Verification record

- All 11 focused composition/capture tests passed. They cover the fixed stage
  order, null ticks, disconnected/error responses, nonstandard missing lobes,
  mixed source ticks, weak/close/overtaken winners, perception competition,
  idle VM wording, raw provenance, immutable comparison, bounds, and
  creature/world isolation. All eight `tools/tests/*.test.cjs` files passed.
- Live fixture: isolated undocked world `Task 08 Live Observation`, seeded
  with the canonical two-male/two-female Norn cohort. Early live sampling
  confirmed that a juvenile Astro genome without `smel` still rendered
  available visual/noun evidence and an explicit unavailable smell channel.
- Firefox 152.0.6 verified seven cards and evidence badges, one-tick alignment
  for Environment through Action, 20 CA channels, weak competition, raw
  payloads, display-only freeze while live ticks advanced, named captures,
  seven per-stage comparison labels, and explicit Unknown Consequence before
  two retained samples.
- A paused-world Firefox check queried the strip twice at tick 73,231; both
  endpoint samples and all six atomic stages stayed aligned. The world was
  immediately resumed.
- Source navigation was exercised from Action to filtered Scripts, Selection
  to Brain, current/owning agents to Debugger, and back through browser
  history. Switching to creature 408 and to disposable world
  `Task 08 Switch Check` cleared live, frozen, selection, and capture state;
  the original world was restored without an identity warning.
- Natural read-only observations covered Eat (event 28), Rest/sleep (event
  25 and an earlier dreaming life state), Need/speech (event 24), Approach
  (event 20), Quiescent (events 16/32), and no-running-script idle. A short
  8× sampling pass was restored to 1× afterward.
- Firefox viewports 720×900, 1600×1000, and 1920×1080 had no body/root
  horizontal overflow; the narrow strip used its own horizontal scroll
  container. No page or console errors were captured.
- Visual proof:
  `tools/docs/images/observatory/live-observation-strip-firefox.png`.
- `cmake --build build -j2` succeeded and all 477 CTest cases passed. Final
  JavaScript syntax, docs-index JSON, and `git diff --check` checks passed.
