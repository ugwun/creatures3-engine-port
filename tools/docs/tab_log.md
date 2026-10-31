# Log — Contextual Engine Evidence

The **Log** tab records live engine messages as time-aligned investigative
evidence. It uses Server-Sent Events (SSE), keeps a bounded history while you
move between tools, and distinguishes message severity from the subsystem that
produced the message.

![Contextual Log workspace](/docs/media/tab_log.png)

## Read the two clocks correctly

Each row can show:

- **Wall time**, the timestamp supplied by the engine source. If the source did
  not supply one, the record explicitly uses browser/server receipt time.
- **World tick**, the simulation position used to align a record with creature,
  script, and later Timeline observations.
- **System tick**, available in the context preview and structured export.

Wall time continues while the simulation is paused; world tick does not.
**Exact main-thread context** was captured with the Developer Tools action.
**Nearest engine snapshot** means a FlightRecorder message was combined with
the most recent main-thread poll, so its tick is useful context but is not
claimed as the exact tick at which the message originated. Older records with
neither are labelled **context unavailable**.

## Filter and investigate

The sidebar separates:

- **Severity:** Info, Warning, Error, and Critical.
- **Subsystem:** Error, Shutdown, Network, World, CAOS, Sound, Crash,
  Developer tools, and Other.
- **Context:** world name, agent ID, `family genus species` classifier, script
  event, and time range.

**Since world load** starts at the latest visible world-boundary record.
**Around context tick** uses a selected event tick when available, otherwise
the current shared world tick, plus or minus the configured window. Search
matches message text, annotation, world, correlation ID, and classifiers.

Consecutive identical engine messages collapse to one row with an `×N` count.
The first/last wall times and world ticks and the duplicate count remain in
structured exports. Actions with different correlation IDs do not collapse,
because they are separate interventions.

Select a row or choose **Preview context** before navigating away. The preview
shows provenance, both ticks, context timing, agent/script classifiers,
bytecode IP, and correlation ID. When structured identity is present it offers
**Open agent**, **Open in Scripts**, and **Open in Debugger**. Modern records
never derive agent IDs from arbitrary prose. Only explicitly marked legacy
records use the compatibility parser.

Bookmarks (`★`) and annotations are retained with the in-memory record and
included in JSON/JSONL exports. Browser Back restores Log filters, display
options, and scroll position after a cross-link.

## Stream pause is not simulation pause

**Pause stream** freezes Log rendering only. The bounded model continues to
ingest records and reports the buffered count; the world simulation continues.
Use the persistent **Pause simulation** action to stop world ticks. Resuming the
stream renders the retained records.

The stream-state label describes only SSE:

- **Stream live** — the SSE connection is open.
- **Stream connecting/reconnecting** — EventSource is establishing or
  restoring the connection.

It is independent of the API/session state in the header ribbon.

## Retention and explicit gaps

Both server and browser retain at most **5,000 records** and approximately
**4 MiB**. The browser additionally limits rendered DOM rows to the latest
2,000 matching rows. Switching tools does not discard the bounded model.

A gap row is evidence that continuity is unknown:

- `disconnect` — the browser lost the SSE connection;
- `server_restart` — the EventSource session ID belongs to an older server;
- `server_history_truncated` or `server_buffer_overflow` — the bounded server
  could not replay part of the range;
- `client_buffer_overflow` — the browser discarded its oldest retained
  records.

Gap rows remain visible even when other filters are restrictive, so filtered
records from opposite sides are never presented as a continuous sequence.

SSE event IDs use `streamId:recordId`. EventSource sends the last accepted ID
when it reconnects, so records are resumed without duplicates when they are
still retained. A world-boundary row visibly separates world sessions.

## Structured record schema

New records use schema version 2. Fields can be `null` when a source cannot
supply them:

```json
{
  "schemaVersion": 2,
  "kind": "record",
  "streamId": "1785152071258-85556",
  "recordId": 68,
  "source": "debug_server",
  "severity": "info",
  "subsystem": "developer_tools",
  "message": "Debugger set breakpoint for agent #622 at bytecode IP 518",
  "monotonicMs": null,
  "wallTimeMs": 1785152152138,
  "receivedAtWallTimeMs": 1785152152138,
  "worldName": "test3",
  "worldTick": 110035,
  "systemTick": 1579,
  "enginePaused": false,
  "gameSpeed": 1,
  "contextTiming": "engine_main_thread",
  "agent": {"id": 622, "family": 4, "genus": 1, "species": 1},
  "script": {"family": 4, "genus": 0, "species": 0, "event": 20, "ip": 52},
  "correlationId": "breakpoint-…-4"
}
```

FlightRecorder still emits and the server still supplies the compatibility
aliases `t`, `cat`, and `msg`. Unstructured input remains readable with
`legacy: true`. Invalid legacy byte sequences are replaced safely rather than
terminating the stream.

## Export

The toolbar exports the currently filtered set:

- **JSONL** — one complete record per line, suited to scripts and notebooks;
- **JSON** — a formatted array;
- **Text** — readable wall time, tick, severity/subsystem, message, and
  duplicate count.

JSON and JSONL preserve gap reasons, drop counts, ticks, context timing,
agent/script metadata, correlations, bookmarks, annotations, and duplicate
ranges. **Copy** uses the readable text representation of the filtered set.

## Trace a record

1. Select the row and verify whether context is exact, nearest, or unavailable.
2. Note the world and tick; use **Around context tick** to reduce nearby noise.
3. Check the correlation ID to group a breakpoint, CAOS execution, save/load,
   pause/resume, or debugger action.
4. Follow **Open agent** to inspect the owner, **Open in Scripts** for current
   activity, or **Open in Debugger** for source and bytecode position.
5. Add an annotation before exporting JSONL so the investigative conclusion
   travels with its supporting record.

See the [API Reference](api_reference.md) for the underlying endpoints.
