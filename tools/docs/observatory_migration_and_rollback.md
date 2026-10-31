# Observatory Migration and Rollback

The Observatory preserves useful existing URLs and additive API fields where
practical. It does not promise that arbitrary browser files from one commit
will work against an unrelated engine binary. Keep the `tools/` directory and
`lc2e` binary from the same build when validating or reporting defects.

## Route Compatibility

New bookmarks use named hashes such as:

```text
#observe?route=timeline&tab=timeline&world=headlessTest&primary=creature&creature=622
```

Existing flat hashes remain aliases: `#creatures`, `#timeline`, `#compare`,
`#world`, `#ecology`, `#experiments`, `#genetics`, `#log`, `#console`,
`#scripts`, `#debugger`, `#ide`, and `#docs`. Existing
`#docs/document.md:section` links continue to open the internal wiki.

New links should use named routes because they preserve world-qualified
selection and tick context. When an old bookmark cannot provide that context,
the destination opens without inventing it and visibly requests a selection.

## API Compatibility Boundary

Established endpoint fields were retained or extended additively, except for
these deliberate safety changes:

- the API binds `127.0.0.1` and sends no CORS headers, so other machines and
  pages from other origins are refused until `--allow-remote-tools` is used;
- `/api/genetics/inject` requires `reviewId`, `reviewedWorldSessionId` and
  `reviewedWorldTick`, and each review works once;
- `/api/caos/validate` reports `risk` from what the compiler emitted, and
  `/api/caos/evaluate` enforces it, so unrecognised commands now need
  acknowledgement;
- the UDP log relay drops anything that is not a well-formed record;
- timed-out genetics routes return `504` instead of `200`.

Otherwise:

- `/api/execute`, `/api/validate`, and `/api/scriptorium/inject` remain legacy
  compatibility endpoints;
- new interactive clients should use checksum/world-bound
  `/api/caos/validate`, `/api/caos/evaluate`, and `/api/caos/script`;
- `/api/scripts` retains `running`, `blocking`, and `paused`; the browser
  derives **Waiting**, **Changed**, **New**, and recently **Finished**;
- log schema 2 retains legacy `cat`, `t`, and `msg` aliases;
- `health` remains a compatibility field but means glycogen reserve, not
  overall health;
- new Observatory snapshots carry `schemaVersion`, source, world/system tick,
  wall capture time, and explicit truncation or availability metadata.

The browser detects connection, active world, creature selection, route
requirements, schema version where versioned exports are opened, and optional
payload fields. A missing optional capability produces an unavailable or
Unknown state. It must not be replaced with a plausible zero.

The MCP adapter does not expose every narrow Observatory endpoint. See
[`mcp/MCP.md`](../../mcp/MCP.md#observatory-scope-and-limitations) before using
generic `execute_caos` as a substitute: it can bypass browser review and
provenance safeguards.

## Saved and Exported Schemas

| Artifact | Current schema | Compatibility |
|---|---:|---|
| Shared route/hash | Named `#observe?` fields | Legacy flat hashes migrate; unknown fields are ignored |
| Structured log | 2 | Schema-1/legacy FlightRecorder records normalize with reduced provenance |
| Biological-series export | 1 | Exact version required by its importer |
| Timeline recording | 1 | Unsupported versions fail visibly |
| Comparison definition/report | 1 | Unsupported versions fail visibly |
| Experiment manifest | 1 | Legacy draft version 0 migrates; later/unknown versions fail visibly |
| Architecture metadata | 1 | Browser and metadata ship together; invalid nodes/edges fail validation |
| Accessibility preferences | Browser-local object | Unknown values normalize to safe defaults |

Experiment export is the portable investigation record. It sanitizes local
paths and omits proprietary worlds, creatures, genome binaries, gene arrays,
and game assets. Screenshots are explanatory evidence, not importable state.

## Rollback Procedure

1. Stop recordings and export any experiment manifest, comparison, timeline,
   or biological history that must be retained.
2. Confirm the active world and whether it is paused. Resume at speed 1 unless
   the protocol deliberately requires another state.
3. Shut down the instrumented engine gracefully. Do not replace `tools/` while
   it is serving a browser session.
4. Check out the earlier local Observatory commit or switch back to the
   previous branch. Rebuild `lc2e`; keep its matching `tools/` bundle.
5. Launch against an isolated data copy first. Do not load a personal world to
   test a rollback.
6. Reopen portable exports only when the older build documents support for
   their schema. Keep the JSON file external when it reports an unsupported
   version.
7. Verify session world, pause state, speed, and creature identity before
   resuming investigation.

Rolling back code does not reverse an already applied chemical change,
injected creature, genome file operation, installed script, saved world, or
external export. Those operations cannot be truly undone. Recover from an
untouched disposable baseline or perform a separately reviewed compensating
operation.

## Capability Detection

The navigation remains fully visible and evaluates each route against:

- engine connection;
- loaded non-Startup world;
- stable selected creature where required;
- world-qualified target identity;
- supported export or response schema.

The session ribbon and dashboard distinguish disconnected, loading, no-world,
no-creature, stale, paused, and running states. Learn routes and packaged docs
work offline. Active feature pollers stop when their workspace closes; a
recording continues only when the investigator explicitly left it active.

For a mixed-version diagnostic, inspect `/api/session`, the requested feature
endpoint, its `schemaVersion` and field availability, and the Architecture
graph's recent-request status. Do not infer support from HTTP connectivity
alone.
