# API Reference

The Developer Tools are powered by an embedded HTTP/SSE server running on port **9980** alongside the static tool files.

If you wish to interact with the engine programmatically, you can query these endpoints directly. For a general introduction, see the [Developer Tools Overview](tools_overview.md).

> **Note on Concurrency:** Endpoints that modify engine state are executed on the main thread via a thread-safe `WorkItem` queue to prevent data races. See the repository's `developer-tools` skill for details.

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
Pauses the global engine simulation. All game ticks stop; the debug server and
UI remain responsive. Response: `{ "ok": true, "paused": true }`.

### `POST /api/resume`
Resumes the global engine simulation. Response: `{ "ok": true, "paused": false }`.

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
  "displayBacklog": 0,
  "loadPending": false,
  "requestedWorldName": null,
  "requestedWorldType": null
}
```

`displayBacklog` counts the dirty rectangles and background tiles queued for
the main camera's next draw. It stays near zero; headless engines discard it
every frame because they never draw.

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
On a compilation or runtime error the response is
`{ "ok": false, "output": "", "error": "Invalid command 'foo'" }`.

*(Timeout: 10 seconds. Returns HTTP 504 if the main thread is blocked).*

### `POST /api/validate`
Legacy compilation-only endpoint. It returns syntax or compilation errors but
does not bind the result to a source checksum. New clients should use
`/api/caos/validate`.

**Request:** `{ "caos": "setv va00 42\noutv va00" }`

**Response:** `{ "ok": true }`, or on error
`{ "ok": false, "error": "Invalid command", "position": 24 }`. `position` is
the zero-based character offset in the source, or `-1` when unavailable.
Timeout 5 seconds; the compiled script is discarded.

### `POST /api/compile-map`
Compiles CAOS code and returns the bytecode address → source position map.
The Workbench uses it to find which lines hold executable instructions and to
map line numbers to bytecode IPs for breakpoints.

**Request:** `{ "caos": "setv va00 42\noutv va00" }`

**Response:**
```json
{ "ok": true, "map": { "0": 0, "6": 15, "12": 28 } }
```

Keys are bytecode IP addresses (as strings); values are the source character
offset where that instruction begins. Blank lines, comments, and continuation
lines of multi-token instructions produce no entry. Errors return
`{ "ok": false, "error": "Syntax error at token 'xyz'" }`. Timeout 5 seconds;
the map comes from the compiler's `DebugInfo` address map.

### `GET /api/caos-commands`
Returns the CAOS command dictionary used for auto-completion, built from
`CAOSDescription::MakeGrandTable()`, sorted alphabetically, and cached after
the first call.

```json
[
  { "name": "SETV", "type": "command", "params": "variable_name value",
    "description": "Sets the given variable to the given value." },
  { "name": "POSX", "type": "integer", "params": "",
    "description": "Returns the X position of TARG." }
]
```

`type` is `command`, `integer`, `float`, `string`, `agent`, or `variable`.
Descriptions are HTML-stripped and truncated to about 150 characters;
undocumented commands are omitted. Only the first call touches the main thread.

---

## Breakpoint & Debugging

*Used by the [Debugger](tab_debugger.md) and
[CAOS Workbench](tab_caos_ide.md).*

### `GET /api/agent/:id`
Get full details about a specific agent: VM state, CAOS source code, variables (OV00-OV99, VA00-VA99), and context handles.
The response includes the owning agent's `family`, `genus`, `species`, and
`gallery`; cross-navigation uses those values as an identity fingerprint
before revisiting a historical numeric ID.

```json
{
  "id": 42,
  "family": 2, "genus": 13, "species": 100,
  "gallery": "balloonbug",
  "running": true, "blocking": false, "paused": true,
  "ip": 156,
  "posx": 5200, "posy": 1300,
  "scriptFamily": 2, "scriptGenus": 13, "scriptSpecies": 100, "scriptEvent": 9,
  "source": "inst\nsetv va00 42\nouts \"hello\"\n...",
  "sourcePos": 24,
  "breakpoints": [156, 200],
  "targ": 67, "ownr": 42, "from": 0, "it": 0,
  "variables": {},
  "vmState": "..."
}
```

### `POST /api/breakpoint`
Set, clear, or clear all breakpoints on a specific agent's CAOS virtual machine.
**Request:**
```json
{ "agentId": 42, "action": "set", "ip": 156 }
```

`action` is `"set"`, `"clear"`, or `"clearAll"` (which ignores `ip`).
**Response:** `{ "ok": true, "breakpoints": [156, 200] }`.

### `POST /api/step/:agentId`
Step a paused agent's CAOS VM by one instruction. The agent must be paused at
a breakpoint. **Request:** `{ "mode": "into" }` or `{ "mode": "over" }`.

```json
{ "ok": true, "ip": 160, "paused": true, "running": true, "blocking": false, "sourcePos": 30 }
```

### `POST /api/continue/:agentId`
Resume a paused agent's execution from a breakpoint. Response: `{ "ok": true }`.

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

```json
[
  {
    "agentId": 42,
    "family": 2, "genus": 13, "species": 100, "event": 9,
    "state": "running",
    "ip": 156,
    "source": "doif targ <> null",
    "sourceRevision": "50ca98130c5a42dc",
    "blockingCommand": "", "blockReason": "",
    "targ": 77, "it": 0,
    "posX": 5200, "posY": 1300,
    "worldTick": 8144,
    "gallery": "balloonbug",
    "agentFamily": 2, "agentGenus": 13, "agentSpecies": 100
  }
]
```

### `GET /api/scriptorium`
List all installed scripts in the engine's script registry:
`[ { "family": 2, "genus": 13, "species": 100, "event": 9 }, ... ]`.

### `GET /api/scriptorium/:f/:g/:s/:e`
Get an exact installed event's source, stable FNV-1a checksum, classifier,
world name, world tick, and system tick. No wildcard fallback is used.

```json
{
  "source": "setv va00 42\noutv va00",
  "checksum": "fnv1a64:…",
  "referenceCount": 0,
  "classifier": { "family": 2, "genus": 18, "species": 16, "event": 9 },
  "worldName": "Experiment Branch",
  "worldTick": 12040,
  "systemTick": 318
}
```

`referenceCount` is the number of locks held on the script: one per VM
running it and one per `CALL` caller waiting on it. A locked script cannot be
replaced or removed. A missing script returns `{ "error": "Script not
found" }`. Timeout 5 seconds.

### `POST /api/scriptorium/inject`
Legacy compatibility endpoint that compiles source and installs or replaces it
without a reviewed precondition. The Workbench uses `/api/caos/script` so
Install cannot silently replace and Replace/Remove are checksum-bound.

**Request:**
```json
{ "family": 2, "genus": 18, "species": 16, "event": 9, "source": "setv va00 42\noutv va00" }
```

**Response:** `{ "ok": true }`, or
`{ "ok": false, "error": "Failed to install — script may be locked" }`.
Timeout 10 seconds. The engine compiles with `Orderiser::OrderFromCAOS()`,
assigns the classifier with `MacroScript::SetClassifier()`, and registers the
script with `Scriptorium::InstallScript()`.

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

```json
[
  {
    "agentId": 42,
    "moniker": "abc1-def2-...",
    "name": "Alice",
    "genus": 1, "species": 1, "sex": 2,
    "age": 3, "ageInTicks": 12500,
    "lifeState": "alert",
    "health": 0.85,
    "healthMeaning": "glycogen concentration (legacy compatibility)",
    "glycogenReserve": 0.85,
    "glycogenChemicalId": 4,
    "posX": 3400, "posY": 2100,
    "roomId": 680, "metaRoomId": 0,
    "drives": [0.1, 0.3, 0.8, "..."],
    "highestDrive": 2
  }
]
```

`name` is the creature's given name from its `LinguisticFaculty` (empty when
unnamed). `drives` holds 20 floats in `driveoffsets` enum order.

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

```json
{
  "chemicals": [0.0, 0.1, "...", 0.72, "..."],
  "organCount": 5,
  "organs": [
    {
      "index": 0,
      "clockRate": 0.5,
      "lifeForce": 0.98, "shortTermLifeForce": 0.95, "longTermLifeForce": 0.98,
      "energyCost": 0.01,
      "functioning": true, "failed": false,
      "receptorCount": 4, "emitterCount": 2, "reactionCount": 3
    }
  ]
}
```

`chemicals` is a flat array of 256 floats indexed by chemical ID.
`functioning` combines the engine's latest organ energy flag with the failure
state: for a non-failed organ, `false` means ATP was unavailable at its most
recent activation, not a diagnosis of impairment. Timeout 5 seconds.

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

```json
{
  "lobes": [
    { "index": 0, "name": "verb", "neuronCount": 40, "winner": 4,
      "x": 0, "y": 0, "width": 8, "height": 5, "colour": [255, 0, 0],
      "labels": ["Quiescent", "Push", "Pull", "Stop", "Approach", "..."] }
  ],
  "tracts": [
    { "index": 0, "name": "vis to attn", "dendriteCount": 160, "srcLobe": "visn", "dstLobe": "attn" }
  ]
}
```

### `GET /api/creature/:id/brain/lobe/:lobe`
Get detailed neuron states for a specific brain lobe. Semantic labels are
available on this same response as both a top-level `labels` array and each
neuron's `label`, as well as on the overview response.

```json
{
  "name": "verb", "neuronCount": 40, "winner": 4,
  "labels": ["Quiescent", "Push", "..."],
  "neurons": [
    { "id": 0, "label": "Quiescent", "states": [0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0] },
    { "id": 1, "label": "Push", "states": [0.9, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0] }
  ]
}
```

### `GET /api/creature/:id/brain/tract/:tract`
Get dendrite connections for a specific brain tract. Returns source/destination
neuron pairs with synaptic weights, capped at 1000 dendrites.

```json
{
  "name": "vis to attn", "srcLobe": "visn", "dstLobe": "attn",
  "dendriteCount": 160, "dendritesReturned": 160,
  "dendrites": [
    { "id": 0, "src": 3, "dst": 7, "weights": [0.8, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0] }
  ]
}
```

### `GET /api/creature/:id/brain/lobe/:lobe/neuron/:neuron`
Deep inspection of one neuron: its state variables, the decompiled lobe and
tract SVRules that apply to it, and every dendrite connection pointing to or
from it. The Brain sub-tab's Deep Neuron Detail panel uses this endpoint.

```json
{
  "lobeIndex": 1, "lobeName": "decn",
  "neuronId": 11, "neuronCount": 13, "isWinner": false,
  "states": [ { "name": "state", "value": 0.0016 }, { "name": "input", "value": 0.0 } ],
  "initRule": [],
  "updateRule": [ { "op": "load", "operand": "neuron", "idx": 1, "val": 0.004 } ],
  "tractRules": [
    { "tractIndex": 4, "tractName": "comb->decn", "initRule": [],
      "updateRule": [ { "op": "load", "operand": "input", "idx": 2, "val": 0.008 } ] }
  ],
  "connections": [
    { "tractIndex": 10, "tractName": "verb->decn", "direction": "incoming",
      "srcLobeIdx": 8, "srcLobe": "verb", "dstLobeIdx": 1, "dstLobe": "decn",
      "srcNeuron": 11, "dstNeuron": 11,
      "weights": [ { "name": "stw", "value": 0 }, { "name": "ltw", "value": 0 } ] }
  ]
}
```

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

Example shapes:

```json
// GET /api/genetics/files
[
  { "name": "norn.astro.48", "isCore": true, "isExperimental": false,
    "metadataStatus": "absent", "origin": "protected_original", "sourceName": null },
  { "name": "norn_astro_48_experiment_01", "isCore": false, "isExperimental": true,
    "metadataStatus": "verified", "origin": "copy", "sourceName": "norn.astro.48" }
]
```

```json
// GET /api/genetics/file/:name (abridged)
{
  "moniker": "985-haze-kszy7-...",
  "geneCount": 287,
  "identity": {
    "currentName": "985-haze-kszy7-...", "format": "dna3",
    "checksum": "fnv1a64:115c0bfe4ed1b1ae", "checksumAlgorithm": "FNV-1a-64",
    "isProtected": false, "isExperimental": false, "metadataStatus": "absent",
    "origin": "original", "sourceName": null, "sourceChecksum": null
  },
  "genes": [
    { "type": 2, "subtype": 1, "typeName": "Creature", "subtypeName": "Genus",
      "id": 0, "generation": 0, "switchOnTime": 0, "switchOnLabel": "Embryo",
      "flags": { "mutable": true, "dupable": false, "cutable": false,
                 "maleOnly": false, "femaleOnly": false, "dormant": false },
      "flagsRaw": 1, "mutability": 156, "variant": 0,
      "data": { "genus": 1, "motherMoniker": "...", "fatherMoniker": "..." } }
  ]
}
```

Each gene carries the parsed 8-byte header and a `data` object whose shape
depends on type/subtype (see [The Digital Genome](genome_deep_dive.md)). Lobe
and Tract genes include decompiled SVRule arrays. An unreadable file returns
`{ "error": "Could not open genome file" }`.

```json
// POST /api/genetics/copy
{ "sourceName": "norn.astro.48", "derivedName": "norn_astro_48_experiment_01" }
// → { "ok": true, "sourceChecksum": "...", "derivedChecksum": "...", "worldName": "...", "worldTick": 1234, "correlationId": "..." }
```

```json
// POST /api/genetics/crossover
{ "parentA": "985-haze-kszy7-...", "parentB": "000-chld-4a3b2c1d-...", "child": "comparison_cross_01" }
// → { "ok": true, "status": "success", "child": "comparison_cross_01", "childChecksum": "fnv1a64:...",
//     "parentA": "...", "parentAChecksum": "...", "parentB": "...", "parentBChecksum": "...",
//     "worldTick": 1234, "correlationId": "genome-crossover-..." }
```

Crossover runs `Genome::Cross()` with mutation parameters `(200, 200, 200,
200)`, deliberately high so the developer tool produces diverse offspring; the
game's own breeding uses creature-specific rates from biochemistry.

A successful injection returns the engine-confirmed result:

```json
{
  "ok": true, "status": "success",
  "derivedChecksum": "fnv1a64:ca76b5cff985e8af",
  "sourceName": "norn.astro.48",
  "worldName": "Disposable Genetics", "worldTick": 463, "enginePaused": false,
  "result": { "agentId": 429, "isCreature": true,
              "engineeredFrom": "norn_astro_48_experiment_01",
              "genomeMoniker": "001-rune-mezz8-73syc-zh7f6-vaalw",
              "moniker": "001-rune-mezz8-73syc-zh7f6-vaalw" }
}
```

A stale checksum returns
`{ "ok": false, "error": "The saved genome checksum changed; reload and review again" }`.
`genomeMoniker` is the engine-generated live identity, not the private
template name. All genetics endpoints time out after 5 seconds.

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

**Event format:**
```
id: 1785152071258-85556:68
data: {"schemaVersion":2,"kind":"record","severity":"info","subsystem":"world","worldName":"test3","worldTick":110035,"wallTimeMs":1785152152138,"message":"World loaded successfully","cat":4,"t":1234567,"msg":"World loaded successfully"}

data: {"schemaVersion":2,"kind":"gap","reason":"server_restart","droppedCount":0,"message":"Log stream restarted; records between sessions are unavailable"}
```

The compatibility aliases are `cat` (category bitmask: 1=error, 2=network,
4=world, 8=caos, 16=shutdown, 32=sound, 64=crash), `t` (monotonic
milliseconds), and `msg` (message text).

---

## Metadata

### `GET /api/agent-names`
Returns human-readable agent names for classifiers in the scriptorium, resolved from `"Agent Help F G S"` catalogue tags.

```json
{ "2 3 16": "Tuba seed", "1 1 152": "Teleporter", "2 21 18": "Commedia" }
```

Keys are `"family genus species"` strings; classifiers without a catalogue
entry are omitted. Timeout 5 seconds.
