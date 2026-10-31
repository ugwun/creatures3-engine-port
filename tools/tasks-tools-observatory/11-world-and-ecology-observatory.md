# Task 11 — World and Ecology Observatory

Status: Completed

Depends on: Tasks 03, 04, 06, and 07

## Goal

Make the world itself observable as the environment in which creature behaviour
emerges. Investigators should be able to connect rooms, chemical gradients,
objects, and routes to what a selected creature can actually perceive and do.

## Why this task exists

The current tools are strongest when inspecting one object at a time. Creatures,
however, are embodied agents. Their choices depend on room topology, doors,
chemical diffusion, nearby agents, lifts, portals, and the sensory evidence
available at their position.

Without an ecological view, a failed action can look like a brain or script
problem when the real cause is an inaccessible room, a weak smell gradient, a
closed connection, or a mismatch between the global world state and the
creature's sensed state.

## Feature scope

### Layered world map

Provide a map that can display:

- metaroom and room geometry;
- room adjacency and linked-room relationships;
- doors, permeability, lifts, portals, and other navigational connectors;
- agents, grouped or filtered by classifier;
- selected creature position and current target;
- configurable CA and smell channels;
- sources, sinks, and sampled field strengths;
- recent movement or navigation traces.

Layers must be independently toggleable. Dense worlds must remain readable when
only one question is being investigated.

### Creature-relative inspection

Selecting a creature should distinguish:

- the objective state of the surrounding world;
- the values sampled at the creature's current room or position;
- values known to be available to its senses;
- inferred relevance, clearly labelled as inference.

The UI must never imply that a globally visible object or CA source was
necessarily perceived by the creature.

### Route and affordance inspection

For a selected creature and target, show:

- source room and target room;
- candidate room path, when the engine exposes one;
- traversable and blocked links;
- relevant doors or vehicles;
- CA channel used for navigation, if known;
- changes in route conditions over the recorded interval.

This is an observation surface, not a new navigation algorithm.

### Ecological queries

Support questions such as:

- Which edible agents are reachable from this room?
- Where is this smell produced, and how does it diffuse?
- What is different between the creature's location and the target location?
- Which creatures occupy the same room or metaroom?
- Which link changed immediately before navigation failed?

## Evidence and labelling rules

- Use the engine's actual room graph and CA configuration.
- Do not assign biological names to CA channels unless the world data supplies
  that mapping.
- Mark sampled, derived, and inferred values using the shared evidence model.
- Show sample tick and freshness for every layer that can become stale.
- Explain unavailable data rather than replacing it with a plausible guess.

## Technical direction

- Add bounded, structured API responses for metarooms, rooms, links, agents, and
  requested CA channels.
- Query expensive field data by viewport, room set, or selected channel rather
  than returning the complete world every polling interval.
- Reuse the shared selection context so creatures, agents, rooms, classifiers,
  and scripts can cross-link to their existing inspectors.
- Give map state stable URLs or serializable workspace state so an investigation
  can be reproduced.
- Keep the map renderer separate from the engine data model and transport.
- Avoid changing targetless `APPR`, linked-room navigation, or smell recovery
  behaviour as part of this observability task.

## Documentation and in-product guidance

- Document map layers, room links, permeability, CA channels, smell sources,
  sampling, route evidence, filters, and performance limits.
- Add contextual tips that distinguish global world state, values sampled at a
  creature, values available to its senses, and inferred relevance.
- Add a task guide for investigating a failed food approach through rooms,
  elevators, edible agents, and smell/CA evidence.
- Remove guidance that assigns universal meanings to world-specific CA channels
  or assumes a globally visible object was perceived.

## Deliverables

- Layered room and metaroom map.
- CA/smell field layer with source and sample inspection.
- Agent and creature overlays.
- Route and connection inspector.
- Creature-relative environment panel.
- Focused API and UI tests.

## Acceptance criteria

- A user can start from a creature, inspect its current room, and identify the
  world evidence relevant to a nearby target without copying identifiers.
- Actual world state and creature-relative sampled state are visibly distinct.
- Each layer displays its source tick and freshness.
- Unknown CA semantics remain unknown rather than receiving heuristic names.
- Large or agent-dense worlds can be inspected without unbounded payloads or a
  frozen interface.
- The feature does not alter creature navigation or world simulation behaviour.

## Verification

Completed on 2026-07-27:

- `cmake --build build -j2` completed successfully.
- `ctest --test-dir build --output-on-failure` passed all 477 native tests.
- `node --check tools/ecology_model.js`,
  `node --check tools/ecology_workspace.js`, and
  `node --test tools/tests/*.test.cjs` passed all 11 browser-model test files.
  The focused ecology tests cover sloped room geometry, disconnected graphs,
  permeability thresholds, layer/model filtering, evidence boundaries,
  missing semantics, null room IDs, stale samples, bounded traces, empty data,
  and truncated data.
- A disposable `headlessTest` world contained the canonical two-male,
  two-female Norn cohort. Live API checks observed metaroom 11, 73 rooms,
  linked room 621 ↔ 658, vehicles, dense agent populations, world-supplied
  `fruit` semantics for CA 6, and positive CA 6 emission from bramboo agents.
- Live bound checks requested one room and one agent while retaining the
  selected focus agent, capped requested channels at four, omitted sentinel
  room IDs, and limited connections to 2,000. Viewport filtering returned only
  intersecting rooms and agents.
- Repeated snapshots while paused retained the same world tick and room
  geometry; the engine was resumed before graceful shutdown. The endpoint
  reported `readOnly: true`, and no navigation, CA diffusion, `APPR`, smell
  recovery, agent, or world mutation operation was issued.
- Firefox 152.0.6 exercised creature-to-world selection, all independent
  layers, map-agent inspection, derived connection chains, reachable-agent
  queries, hidden-tab polling suspension, manual refresh, and 720 × 814,
  1600 × 914, and 1920 × 994 layouts. The run rendered 73 rooms, 200 bounded
  connections, 253 agents, 73 field polygons, and two vehicles with no
  captured browser errors or horizontal overflow.
- The linked-room/elevator investigation path was reproduced as observation:
  the UI distinguished the creature's current `IT` from an inspected bramboo,
  labelled the room chain as derived rather than engine-selected, and did not
  claim that global visibility implied perception or edibility.
- The Firefox documentation screenshot was inspected at 1600 × 914, and
  `git diff --check` completed successfully.

## Out of scope

- Replacing engine navigation.
- A general-purpose world editor.
- Assigning universal meanings to world-specific CA channels.
