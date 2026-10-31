# Guide — Investigate Behavior and Runtime Context

Activity: **Observe/develop.** Timeline, Logs, Scripts, and source inspection do
not change the world. Debugger pause/step actions affect the selected VM and
are explicitly labelled.

## Investigate a Surprising or Failed Action

1. Select the creature and open **Observe → Ethology timeline**.
2. Confirm the recording interval and memory/tick bounds. Start or resume
   browser recording if evidence was not already retained; this does not pause
   the simulation.
3. Find the action or the interval in which the expected action did not occur.
   Bookmark the event if you need it preferentially retained.
4. Scrub to its world tick. Inspect perception, stimulus, attention, decision,
   action/script, consequence, and physiology as separately sourced rows.
5. Follow the script handoff to Running Scripts or Debugger. Follow structured
   log context when an error, blocking operation, or gap exists.
6. Compare a preceding and following retained range rather than relying on a
   single value.
7. Record a hypothesis as a note or experiment question. Label it Inferred and
   list the observed/derived support.

If evidence is missing, say what is missing: a sampling gap, no structured
agent context, no retained prior tick, or an endpoint failure. Do not fill the
gap with a narrative.

## Correlate a Runtime Error with Source and Agent Context

1. Open **Observe → Logs** or **Develop → Engine diagnostics**.
2. Filter to errors/warnings and the relevant world-tick range.
3. Select the record and read its context preview before following anything:
   world/system tick, exact or nearest timing, agent identity, script
   classifier/event/IP, and correlation ID.
4. If structured agent context exists, open Running Scripts or Debugger. A
   modern prose message without those fields intentionally offers no guessed
   target.
5. In Running Scripts, confirm the observed agent and exact classifier/event.
   `WAIT` is Waiting; other engine-managed blocking operations remain Blocking.
6. In Debugger, compare the current instruction/source with the retained error
   tick. A currently running VM may already have advanced.
7. Return with Back. The selected log record, agent/script subject, and route
   history remain available.

Related references: [Contextual Logs](tab_log.md), [Running
Scripts](tab_scripts.md), and [Debugger](tab_debugger.md).
