# Guide — Orient and Observe

Activity: **Observe only.** These steps do not pause, train, feed, move, or
otherwise change a creature.

## Orient to a World and Select a Creature

1. Start on **Observe → Overview**.
2. Read the session ribbon. Confirm the expected world, `RUNNING` or `PAUSED`
   state, speed, world tick, and freshness. `Startup` means no simulation world
   is loaded.
3. Read the dashboard's **Creatures** card. An exact zero is valid only after a
   successful `/api/creatures` capture; `—` means the population is unknown.
4. Choose **Follow a creature** or **Observe → Creatures**.
5. Select a creature by name/moniker and agent ID. The context strip should now
   show the world and creature. The numeric ID is world-scoped; the moniker is
   retained as an identity fingerprint.
6. If the engine disconnects, stop drawing conclusions from the last values.
   They remain visible only as stale evidence.

Expected result: the same creature remains selected when you open Timeline,
Compare, Ecology, Scripts, Logs, or a guide. No world mutation is recorded.

## Observe Perception Attention Action and Consequence

1. With a creature selected, keep the engine running to observe live changes,
   or pause globally for a stable point inspection.
2. Read the seven-stage observation strip from left to right:
   perception, stimulus, attention, decision, action, consequence, physiology.
3. Expand a stage to inspect its raw identifier, capture tick, source, and
   evidence label.
4. Follow explicit links to a room, chemical, brain element, script, or log
   record. Use Back to return to the same subject and time context.
5. Open **Ethology timeline** when you need history. Use its world-tick cursor
   to compare the order of retained observations.

Interpretation caution: the strip aligns concurrent systems for investigation.
It does not assert that perception caused attention, that a drive caused a
decision, or that an observed script caused the later physiological change.

Related reference: [Following One Creature Live](live_creature_observation.md).
