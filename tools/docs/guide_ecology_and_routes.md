# Guide — Ecology, Routes, and Smell Evidence

Activity: **Observe only.** The ecology workspace does not edit rooms, doors,
CA values, agents, targets, or creature navigation.

## Inspect a Room Route and Smell Gradient

1. Select a creature and open **Observe → World & ecology**.
2. Refresh a bounded snapshot and record its world tick/age. Confirm the
   selected creature's room and metaroom.
3. Choose CA channel 0–19. Use a friendly smell name only when the active world
   explicitly supplies that mapping.
4. Enable room geometry, connections, CA values, sources, agents, and the
   creature-relative layer as needed.
5. Inspect door permeability and the bounded sampled route. Reachability means
   a connection exists under the query threshold; it does not prove the
   creature can or will traverse it.
6. Compare the objective room value, value at the creature, sensory
   availability, and any Inferred relevance as separate claims.
7. Follow explicit agent, room, creature, or log links while preserving the
   world and selected subject.

A gradient can support navigation debugging, but it is not direct evidence
that the creature perceived the source or selected it as a target. For engine
semantics, read [World and Ecology Observatory](world_ecology_observatory.md)
and [The World Ecosystem](world_ecosystem.md).
