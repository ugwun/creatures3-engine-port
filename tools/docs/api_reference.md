# API Reference

The Developer Tools are powered by an embedded HTTP/SSE server running on port **9980** alongside the static tool files.

If you wish to interact with the engine programmatically, you can query these endpoints directly. For a general introduction, see the [Developer Tools Overview](tools_overview.md).

> **Note on Concurrency:** Endpoints that modify engine state are executed on the main thread via a thread-safe `WorkItem` queue to prevent data races. See `ARCHITECTURE.md` for details.

## Compatibility and Evidence Contract

The browser bundle and engine binary from one build are the supported pairing.
New Observatory snapshot and mutation responses are schema-versioned where
they cross a persistence or feature boundary, and additive fields are preferred
for established endpoints. Missing optional fields are unavailable evidence;
clients must not substitute a plausible zero.

`/api/execute`, `/api/validate`, and `/api/scriptorium/inject` remain legacy
compatibility endpoints. New interactive flows use the checksum-, world-, and
target-bound CAOS endpoints documented below. Log schema 2 retains the legacy
`cat`, `t`, and `msg` aliases, and `/api/scripts` retains its established
engine state strings while the browser derives additional display states.

Direct response fields are **Observed** unless the endpoint says otherwise.
Mechanical transforms are **Derived**, labelled interpretations are
**Inferred**, and inadequately sourced claims are **Unknown**. In particular,
legacy `health` is glycogen reserve (chemical 4), not overall health. See
[Migration and Rollback](observatory_migration_and_rollback.md) for route,
export, and mixed-version behavior.

## Access

The API can execute arbitrary CAOS and rewrite genome files, so it serves only
this machine: it binds `127.0.0.1`, sends no CORS headers, and rejects foreign
`Host` headers and cross-origin or cross-site API requests. To use it from
another machine, start `lc2e` with `--allow-remote-tools`. That listens on all
interfaces, requires a token for anything but local requests, and prints an
access URL at startup. Set `LC2E_TOOLS_TOKEN` to choose the token.

Rejected requests return `403`, or `401` when a remote token is missing or
wrong. A `504` means the engine did not run the request and never will: work
that has not started when its request times out is abandoned.

---

## Engine State & Flow Control

### `POST /api/pause`
Pauses the global engine simulation. All game ticks freeze.

### `POST /api/resume`
Resumes the global engine simulation.

### `GET /api/engine-state`
Returns the current pause state (`{"paused": true/false}`).

### `GET /api/session`

Returns one coherent session sample for the persistent observatory ribbon:

```json
{
  "worldName": "DevTools Audit",
  "worldSessionId": "1793431727648-219627.1",
  "worldType": "undocked",
  "worldTick": 17578,
  "systemTick": 17920,
  "paused": false,
  "gameSpeed": 1,
  "creatureCount": 4,
  "loadPending": false,
  "requestedWorldName": null,
  "requestedWorldType": null
}
```

`worldType` is `"undocked"`, `"docked"`, `"startup"`, or `null` when it
cannot be established. A deferred REST/MCP load sets `loadPending` and retains
the requested name/type until that load finishes or fails. See
[World and Session Status](session_status.md).

`worldSessionId` changes on every world load, including reloading the same
world, and across engine restarts. Reloading a save rewinds time under the same
name, so anything tied to one run of a world must compare this value.

---

## Execution & Compilation

*Used by the [Scratchpad](tab_console.md) and
[CAOS Workbench](tab_caos_ide.md).*

### `POST /api/caos/validate`

Compile exact CAOS source without executing it. Validation and execution are
separate operations; `validationIsSafety` is always `false`. The response's
`risk` comes from what the compiler emitted: `level` is `read-only`, `mutating`,
`broad-or-destructive`, or `unknown` when the source did not compile, and
`operations` lists what caused it. `/api/caos/evaluate` enforces the same review.

```json
{
  "mode": "evaluate",
  "source": "outs \"hello\""
}
```

```json
{
  "ok": true,
  "sourceChecksum": "fnv1a64:6e68a8c5425fdc80",
  "validationIsSafety": false,
  "risk": {
    "level": "read-only",
    "requiresAcknowledgement": false,
    "warning": ""
  },
  "error": null,
  "location": null
}
```

On compilation failure, `location` contains zero-based `position` and one-based
`line`/`column`.

### `POST /api/caos/evaluate`

Evaluate checksum-bound source in a fresh ownerless VM. The engine rechecks the
reviewed world/tick and optional target ID/classifier on its main thread.

```json
{
  "mode": "evaluate",
  "source": "outs \"hello\"",
  "sourceChecksum": "fnv1a64:6e68a8c5425fdc80",
  "expectedWorldName": "Experiment Branch",
  "expectedWorldTick": 12040,
  "targetAgentId": null,
  "expectedTargetClassifier": null,
  "pauseBeforeRun": true,
  "riskAcknowledged": false
}
```

The optional target must include an expected `{family, genus, species}`
classifier. Known mutating/broad source requires `riskAcknowledged: true`.
Successful responses include `ownerAgentId: null`, optional `targetAgentId`,
output, risk, world/system tick bounds, pause handling, elapsed wall time,
source checksum, and correlation ID. Stale world context, changed target
identity, checksum mismatch, or missing acknowledgement returns `ok: false`
without executing source.

### `POST /api/caos/script`

Apply one explicit exact-event operation:

- `install`: classifier must be absent;
- `replace`: classifier must exist and
  `expectedExistingChecksum` must match;
- `remove`: classifier/checksum must match and `confirmed` must be true.

Install/Replace also send normalized `source` and `sourceChecksum`; Remove omits
source. All modes send `expectedWorldName`, `expectedWorldTick`, and:

```json
{
  "classifier": {
    "family": 2,
    "genus": 18,
    "species": 16,
    "event": 9
  }
}
```

Family/Genus range is `0–255`; Species/Event is `0–65535`; `0 0 0 0` is
invalid. The operation refuses an occupied install target, missing replace or
remove target, checksum drift, changed/stale world, failed compilation, or a
script locked by a running VM. Results include exact classifier, checksum,
world/system tick, elapsed wall time, and correlation ID.

### `POST /api/execute`
Legacy compatibility endpoint. It compiles and executes CAOS on the main thread
in a fresh ownerless VM, but does not carry reviewed world/target/checksum
context. New interactive clients should use `/api/caos/validate` followed by
`/api/caos/evaluate`.

**Request:**
```json
{ "caos": "outs \"hello\"" }
```

**Response:**
```json
{
  "ok": true,
  "output": "hello",
  "error": ""
}
```
*(Timeout: 10 seconds. Returns HTTP 504 if the main thread is blocked).*

### `POST /api/validate`
Legacy compilation-only endpoint. It returns syntax or compilation errors but
does not bind the result to a source checksum. New clients should use
`/api/caos/validate`.

### `POST /api/compile-map`
Compiles CAOS code and returns the address-to-source-position map. Used by the IDE to map source line character offsets to bytecode IPs for breakpoints.

### `GET /api/caos-commands`
Returns a structured JSON catalog of all supported CAOS commands, functions, and variables. Used for IDE autocompletion.

---

## Breakpoint & Debugging

*Used by the [Debugger](tab_debugger.md) and
[CAOS Workbench](tab_caos_ide.md).*

### `GET /api/agent/:id`
Get full details about a specific agent: VM state, CAOS source code, variables (OV00-OV99, VA00-VA99), and context handles.
The response includes the owning agent's `family`, `genus`, `species`, and
`gallery`; cross-navigation uses those values as an identity fingerprint
before revisiting a historical numeric ID.

### `POST /api/breakpoint`
Set, clear, or clear all breakpoints on a specific agent's CAOS virtual machine.
**Request:**
```json
{ "agentId": 42, "action": "set", "ip": 156 }
```

### `POST /api/step/:agentId`
Step a paused agent's CAOS VM by one instruction (`into` or `over`).

### `POST /api/continue/:agentId`
Resume a paused agent's execution from a breakpoint.

---

## Script & Scriptorium Management

*Used by the [Scripts](tab_scripts.md) and
[CAOS Workbench](tab_caos_ide.md).*

### `GET /api/scripts`
List all currently running CAOS scripts across all active agents.
Each row includes the running script classifier (`family`, `genus`, `species`,
`event`) plus the owning agent's stable numeric ID, gallery, and
`agentFamily`/`agentGenus`/`agentSpecies` classifier. These identifiers allow
the Scripts workspace to hand the exact observed target to Debugger without
parsing display text.

The row also includes:

- `source`: only the statement mapped near the observed bytecode `ip`;
- `sourceRevision`: stable fingerprint used to cache identical installed
  source without returning it in every active row;
- `blockingCommand` and `blockReason`: populated while the VM is blocked;
  precise reasons are reported for `WAIT` and `OVER`, otherwise
  `Reason unavailable`;
- `targ` and `it`: current agent-handle IDs, or `0` when invalid;
- `posX`/`posY`: owner position for camera focus;
- `worldTick`: exact world tick captured for the endpoint snapshot.

The existing `state` values remain `running`, `blocking`, and `paused` for API
compatibility. The UI derives **Waiting** only from
`state: "blocking"` plus `blockingCommand: "WAIT"`, and derives recently
**Finished** from disappearance between samples.

### `GET /api/scriptorium`
List all installed scripts in the engine's script registry.

### `GET /api/scriptorium/:f/:g/:s/:e`
Get an exact installed event's source, stable FNV-1a checksum, classifier,
world name, world tick, and system tick. No wildcard fallback is used.

### `POST /api/scriptorium/inject`
Legacy compatibility endpoint that compiles source and installs or replaces it
without a reviewed precondition. The Workbench uses `/api/caos/script` so
Install cannot silently replace and Replace/Remove are checksum-bound.

---

## Creatures & Brain

*Used by the [Creatures](tab_creatures.md) tab. For the underlying neural architecture, see [Brain & SVRules Deep Dive](brain_deep_dive.md). For the chemical simulation model, see [Biochemistry Deep Dive](biochemistry_deep_dive.md).*

### `GET /api/creatures`
List all active creatures (Norns, Grendels, Ettins) in the world. `age` is a
life-stage index and `ageInTicks` is tick age. `glycogenReserve` is the
concentration of chemical 4.

The legacy `health` field remains for compatibility, but it is exactly the
same glycogen concentration, not overall health. New clients should use
`glycogenReserve` and may verify its raw identity with
`glycogenChemicalId: 4`.

Each creature row also includes `roomId` and `metaRoomId` when its current
position resolves to engine map geometry. Missing geometry is omitted rather
than guessed.

### `GET /api/creatures/snapshot`

Returns all active creatures in one engine-main-thread work item for coherent
same-tick cohort comparison. Root provenance includes schema/source,
world/system ticks, wall capture time, world name, pause state, game speed,
and `requestedChemicalIds`.

Each creature includes identity and classifier, sex, life state, life-stage
index, tick age, glycogen reserve, all drives and highest-drive ID, compact
organ functioning/failed counts, position/room/metaroom, and compact current
attention, target, decision, action, and blocking-command state.

The optional `chemicals` query is a comma-separated set of chemical IDs:

```text
GET /api/creatures/snapshot?chemicals=4,72,90
```

At most 16 unique valid IDs are accepted. They are returned in
`selectedChemicals` for each creature; the endpoint never expands this into
all 256 chemicals or full organ/genome payloads. Invalid IDs are ignored.
See [Creature and Cohort Comparison](creature_cohort_comparison.md).

### `GET /api/ecology/snapshot`

Returns one read-only, engine-main-thread sample of bounded world geometry and
ecology evidence. Root provenance includes schema/source, world/system ticks,
wall capture time, pause state, speed, selected metaroom, viewport, explicit
limits, and truncation flags.

Query parameters:

```text
GET /api/ecology/snapshot?metaroom=4&channels=0,3&roomLimit=250&agentLimit=250&focusAgent=622
GET /api/ecology/snapshot?metaroom=4&channels=3&left=900&right=1800&top=700&bottom=1300
```

- `metaroom` selects one actual engine metaroom; invalid/missing values fall
  back to the current camera metaroom or first available metaroom.
- `channels` accepts at most four unique CA IDs from 0 through 19.
- `roomLimit` is clamped to 1–400 and `agentLimit` to 1–500.
- `focusAgent` retains one selected agent inside a truncated agent result when
  that agent matches the metaroom/viewport.
- all four viewport coordinates are required before viewport filtering applies.

`metaRooms` contains bounded summaries. `rooms` contains exact sloped geometry,
room type, and current/change/projected values for requested channels.
`connections` contains actual door segments and explicit linked-room
relationships with permeability, bounded to 2,000. `agents` contains classifier, gallery,
position/room, creature/vehicle type, world category when configured, and
configured CA emission.

Channel labels are null unless the active world maps the smell ID to a sensory
category. `caNavigable` reports map configuration; it does not identify the CA
chosen for a particular action. `readOnly: true` states the endpoint contract.
See [World and Ecology Observatory](world_ecology_observatory.md).

### `GET /api/experiment/context`

Returns one engine-main-thread provenance sample for an experiment manifest:
world/system ticks, pause and speed, the CMake-configured source identifier,
game build identifier when available, and sanitized logical launch options.
Local game, tools, and CAOS file paths are replaced with
`[local path omitted]`. The response states that source identity and a saved
world do not make the simulation deterministic.

### `POST /api/world/branch`

Safely saves and copies the active non-Startup world without loading the copy:

```json
{
  "name": "Experiment treatment 01",
  "confirmedSourceWorld": "Experiment baseline",
  "reviewedWorldSessionId": "1793431727648-219627.1"
}
```

`confirmedSourceWorld` and `reviewedWorldSessionId` must still match the active
world. Invalid names, the
active name, and existing destination directories are rejected before the
save. A successful operation saves the source, copies the directory, verifies
the copied world archive, and returns `loaded: false`. It never overwrites or
deletes a world. Failures identify `validation`, `save`, `copy`, `verify`,
`request`, or `timeout` as the stage.

Use `POST /api/world/load` separately after reviewing a successful branch.
See [Experiment Workspaces and Provenance](experiment_workspaces.md).

### `GET /api/creature/:id/observation`

Returns schema-versioned present-tense evidence for the selected creature in
one engine-main-thread sample. The root includes `worldName`, `worldTick`,
`systemTick`, `capturedAtWallTimeMs`, `enginePaused`, and `gameSpeed`.

The response groups:

- creature identity, life state, age-stage index, tick age, position, room,
  and metaroom;
- a complete same-room count, the five nearest same-room agents, and all 20
  current room CA/smell-channel values;
- available `visn`, `smel`, and `noun` winners and their two strongest
  sampled candidates;
- all 20 drives and the highest drive;
- attention winner, motor attention ID, introspection flag, and current `IT`
  with target classifier, gallery, position, room, and metaroom;
- decision winner, motor action offset, and involuntary action;
- owning-agent CAOS VM state, script classifier/event, mapped source
  statement, blocking command/reason, `TARG`, and script-start `IT`.

Every requested lobe remains represented with `available: false` and null
winner fields when a genome omits it. `environment.nearbyTruncated` says
whether the five returned neighbors are a subset. The response is atomic
through Action; the browser's Derived Consequence stage comes separately from
retained Biological Monitor samples.

```json
{
  "schemaVersion": 1,
  "source": "GET /api/creature/:id/observation",
  "contextTiming": "engine_main_thread",
  "worldName": "Observation Test",
  "worldTick": 711,
  "creature": {
    "agentId": 404,
    "lifeState": "alert",
    "ageStage": 4,
    "ageInTicks": 81144,
    "roomId": 660,
    "metaRoomId": 11
  },
  "environment": {
    "nearbySameRoomCount": 6,
    "nearby": [],
    "nearbyTruncated": true,
    "caChannels": [
      {"id": 7, "categoryId": 11, "label": "food", "value": 0.42}
    ]
  },
  "attention": {
    "available": true,
    "winnerId": 11,
    "winnerLabel": "critter",
    "currentTarget": {"agentId": 250, "categoryLabel": "critter"}
  },
  "selection": {
    "available": true,
    "winnerLabel": "Pull",
    "currentActionOffset": 6
  },
  "action": {
    "state": "blocking",
    "blockingCommand": "APPR",
    "script": {"family": 4, "genus": 0, "species": 0, "event": 22}
  }
}
```

An invalid or non-creature ID returns a JSON `error`. The browser converts
that response into seven explicit Unknown stages rather than reusing an older
subject's data. See [Following One Creature Live](live_creature_observation.md).

### `GET /api/creature/:id/genome`
Parses and returns the full JSON representation of the creature's live genome.

### `GET /api/creature/:id/chemistry`
Get all 256 chemical concentrations and compact organ status. The response is
sampled in one engine-main-thread work item and includes schema/source,
world/system ticks, world name, and wall capture time. Timeline uses this
provenance for pinned-chemical, reward/punishment, and organ-status events;
its tick can differ slightly from the separate atomic observation request.

### `GET /api/creature/:id/organs`
Get the current state and parameters of all genome-defined biochemical
compartments. The endpoint does not assign organ roles; any likely role shown
by the browser is an explicitly inferred chemical-participation heuristic.

### `POST /api/creature/:id/chemical-intervention`

Apply one reviewed chemical adjustment on the engine main thread. This is the
narrow browser mutation endpoint; callers should not generate CAOS for the
safe-intervention workflow.

Required request fields:

```json
{
  "chemicalId": 35,
  "operation": "adjust",
  "requestedValue": 0.05,
  "confirmedWorldName": "Disposable Test",
  "expectedMoniker": "001-test-moniker",
  "sampleWorldTick": 1200,
  "expectedConcentration": 0.4,
  "extremeConfirmed": false,
  "pauseMode": "preserve",
  "baselineStatus": "manual_baseline",
  "baselineTick": 1160
}
```

`operation` is `adjust` for a signed dose in `[-1, 1]` or `target` for an
absolute concentration in `[0, 1]`. Chemical `0` is rejected. The endpoint
rejects a changed world/moniker, samples older than 200 world ticks, or a
current concentration differing from the reviewed value by more than `0.01`.
Clamped adjustments and changes larger than `0.25` require
`extremeConfirmed: true`. Only `pauseMode: "preserve"` is accepted.

Successful response:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "stage": "complete",
  "correlationId": "chemical-intervention-1",
  "target": {"agentId": 42, "moniker": "001-test-moniker", "chemicalId": 35},
  "operation": "adjust",
  "requestedValue": 0.05,
  "requestedChange": 0.05,
  "beforeValue": 0.4,
  "projectedImmediateValue": 0.45,
  "afterValue": 0.45,
  "appliedChange": 0.05,
  "clamped": false,
  "worldTick": 1202,
  "systemTick": 8800,
  "enginePaused": false,
  "pauseBehavior": "preserve"
}
```

Validation and precondition failures return `ok: false`, `stage`, and `error`
without applying a mutation. HTTP 504 indicates a main-thread timeout. See
[Safe Chemical Interventions](safe_chemical_interventions.md).

### `GET /api/creature/:id/brain`
Get the brain overview of a creature — all neural lobes and tracts with neuron
counts, semantic `labels`, and exact genome/engine `x` and `y` geometry.

### `GET /api/creature/:id/brain/lobe/:lobe`
Get detailed neuron states for a specific brain lobe. Semantic labels are
available on this same response as both a top-level `labels` array and each
neuron's `label`, as well as on the overview response.

### `GET /api/creature/:id/brain/tract/:tract`
Get dendrite connections for a specific brain tract. Returns source/destination neuron pairs with synaptic weights.

---

## Genetics Endpoints

These endpoints implement the
[copy-first Genetics Kit](tab_genetics_kit.md). Binary content stays in the
engine's Genetics directory; responses and experiment records contain
identity, checksums, decoded structure, and result handles rather than
embedded proprietary assets.

| Method | Path | Contract |
|---|---|---|
| `GET` | `/api/genetics/files` | Returns sorted `{name,isCore,isExperimental,metadataStatus,origin,sourceName}` identities. `isExperimental` is true only when the sidecar matches the exact filename and current binary checksum. |
| `GET` | `/api/genetics/file/:name` | Returns decoded `dna3` genes plus `identity`: current checksum, protection, verified origin, source/second-parent identity, and creation context. Unsafe names and malformed/truncated files are rejected. |
| `POST` | `/api/genetics/copy` | Request `{sourceName,derivedName}`. Creates without overwrite, verifies source stability, and returns both checksums, world/tick, and correlation ID. |
| `POST` | `/api/genetics/crossover` | Request `{parentA,parentB,child}`. Creates a new native `Genome::Cross` result without changing either parent and records both parent checksums. |
| `POST` | `/api/genetics/save` | Create-only first save for a browser new/import draft. Request is decoded genome JSON plus `saveName` and `draftOrigin`. Existing `.gen`, `.gno`, or metadata names are never replaced. |
| `POST` | `/api/genetics/save-experiment` | Transactional save of a verified copy. Request is decoded genome JSON plus `saveName` and `expectedChecksum`; known layouts and fixed ranges are validated and all recorded sources must still match. Returns previous/new checksums. |
| `POST` | `/api/genetics/rename` | Request `{oldName,newName,expectedChecksum,confirmed:true}`. Only a checksum-matching verified experimental copy can be renamed; destinations cannot collide with files, protected names, or metadata. |
| `POST` | `/api/genetics/delete/:name` | Request `{expectedChecksum,confirmed:true}`. Deletes only a checksum-matching verified experimental copy and its sidecar. Originals and protected files are refused. |
| `POST` | `/api/genetics/inject` | Narrow reviewed mutation request; no gene payload. Requires the exact saved derived/source checksums, confirmed non-Startup world, disposable/branch confirmation, final review, mode, and sex. Returns the new agent ID, classifier, generated genome moniker, ticks, pause state, and correlation ID. |

Injection request:

```json
{
  "derivedName": "norn_astro_48_experiment_01",
  "expectedChecksum": "fnv1a64:ca76b5cff985e8af",
  "reviewedSourceName": "norn.astro.48",
  "reviewedSourceChecksum": "fnv1a64:115c0bfe4ed1b1ae",
  "reviewedSecondParentName": null,
  "reviewedSecondParentChecksum": null,
  "confirmedWorldName": "Disposable Genetics",
  "disposableConfirmed": true,
  "reviewConfirmed": true,
  "injectMode": "creature",
  "gender": 1
}
```

All POST handlers execute engine/file work on the main-thread queue. A
successful injection is confirmed by the new live entry in the engine agent
map. Experiment provenance sanitization retains the identities, checksums,
world, agent result, and tick while omitting gene arrays and binary content.

---

## Log Streaming

*Used by the [Log](tab_log.md) tab.*

### `GET /api/events`

A long-lived SSE stream of schema-versioned log envelopes. Each normal event
has an SSE ID in `streamId:recordId` form. Reconnect with the standard
`Last-Event-ID` header to resume retained records without duplication.

Records include severity, subsystem, message, wall/monotonic time, available
world/system ticks, context timing, and optional structured agent, script, and
correlation metadata. The legacy `cat`, `t`, and `msg` aliases remain present
for FlightRecorder compatibility.

`kind` can be `record`, `world_boundary`, or `gap`. Gap reasons include server
restart and bounded-history overflow. Server retention is 5,000 records and
approximately 4 MiB. See [Log — Contextual Engine Evidence](tab_log.md) for
the complete schema and provenance rules.

---

## Metadata

### `GET /api/agent-names`
Returns human-readable agent names for classifiers in the scriptorium, resolved from `"Agent Help F G S"` catalogue tags.
