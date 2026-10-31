# Observatory State and Evidence

The observatory uses one shared browser session model for connection status,
world identity, selections, samples, and evidence. A panel may keep temporary
rendering state, but it must not invent a second active world, selected
creature, or definition of freshness.

The shared store is available as `window.ObservatoryState`. Its snapshots are
immutable. Modules read with `getState()`, update through documented actions or
`select()`, and use selector subscriptions rather than querying another
module's DOM.

## Session and world contract

`connection.status` is `connecting`, `connected`, or `disconnected`.
`engine.paused` is `true`, `false`, or `null` before the first response.

The world shape is:

```text
world: {
  identity: { name, type, key } | null,
  status: "none" | "startup" | "loading" | "loaded" | "disconnected",
  tick: integer | null,
  systemTick: integer | null,
  speed: number | null,
  transition: { targetName, targetType, startedAt } | null
}
```

World `key` is the world name plus the engine's `worldSessionId`
(`name@session`), so it identifies one load of a world and everything keyed to
it resets on reload. Use `identity.name` for display and comparison with world
names. Links and routes keep only the name. When no session is known, the key
is the exact world name. `"Startup"` is represented
explicitly with status `startup`; an empty world name is `none`. Agent IDs are
never global identities. Agent-scoped keys use `worldName:agentId`, for example
`My World:42`.

Beginning a world load immediately clears creature, agent, script, brain
element, gene, and room selections and all world samples. A detected change of
world identity performs the same reset before new data is published.
Disconnection clears those selections and marks the last samples stale.
Reconnection alone does not make an old sample fresh.

The persistent ribbon applies `world/session` atomically from the shared
[`GET /api/session`](session_status.md) response. A pending target remains
visible until the endpoint confirms that target as active.

## Selection contract

The shared selection object has these slots:

```text
selection: {
  creature, agent, script, chemical, brainElement, gene, room
}
```

A world-scoped selection is either `null` or an immutable object containing
`id`, `worldKey`, and `key`, with optional display details such as a creature
name or moniker. Chemical identities are world-independent and therefore
survive a world reset. Tab activation and navigation do not modify selection.

Use:

```javascript
ObservatoryState.select("creature", creature.agentId, {
  name: creature.name,
  moniker: creature.moniker
});

const unsubscribe = ObservatoryState.subscribe(
  state => state.selection.creature,
  selection => renderCreature(selection)
);
```

Subscriptions compare only their selected value and return an unsubscribe
function. This keeps unrelated state updates from rerendering every panel.

## Timebase and sample contract

World ticks are normalized to integers. Wall times are normalized to UTC
ISO-8601 strings. Every stored sample contains:

```text
{
  key, value,
  worldKey, tick, capturedAt, sampleIntervalMs,
  evidence,
  stale, staleReason
}
```

`samples.current` contains the latest value per sample key.
`samples.history` retains at most 120 entries per key as a short diagnostic
buffer. It is not the recording or timeline system.

Responses from a different world are discarded. Within one world, a response
with a lower tick cannot replace a newer response. Shared fetches use
`requestShared(key, loader, metadata)`: simultaneous callers using the same key
receive the same promise and cause only one transport request. Shared scalar
session reads may opt into a short `cacheForMs` window; that cache is capped at
64 request keys. Transport code remains in the feature module; the store owns
deduplication, validation, and reduction.

Freshness is not the same as tick age. By default a connected sample is fresh
for the greater of one second or twice its polling interval. A sample is stale
immediately when disconnected, explicitly invalidated, too old in wall time,
or associated with a different world. Pausing the engine does not rewrite its
capture time or evidence.

## Evidence level contract

Use these exact visible labels and accessible meanings everywhere:

| Badge | Concise description | Accessible name | Creatures example |
|---|---|---|---|
| **Observed** | Read directly from the engine at the stated world tick. | Observed evidence: read directly from the engine | A Norn's glucose concentration returned by the chemistry endpoint. |
| **Derived** | Calculated from observed engine values using a stated method. | Derived evidence: calculated from observed engine values | Change in hunger calculated from two polled drive samples. |
| **Inferred** | A labelled interpretation supported by evidence, not a direct engine fact. | Inferred evidence: an interpretation supported by engine evidence | Likely seeking food, inferred from hunger, the winning decision, and movement. |
| **Unknown** | The source, time, or interpretation is not known well enough to classify. | Unknown evidence: source or interpretation is not established | A legacy panel value whose capture tick was not recorded. |

The header's **Evidence** button opens the reusable explanation. Feature code
can create the same accessible trigger with
`ObservatoryState.createEvidenceBadge(evidence)`.

Evidence metadata records the level, source endpoint or engine event, world,
tick, capture time, and polling interval. Derived values should also record
their calculation method. Inferred values are rejected unless they include an
`inferenceLabel` and a non-empty `supportingEvidence` list. Heuristics must
include confidence from `0` to `1`.

```javascript
const evidence = ObservatoryState.createEvidence("inferred", {
  source: "feeding-intent heuristic v1",
  worldKey: "My World",
  tick: 7812,
  inferenceLabel: "Likely seeking food",
  supportingEvidence: ["drive:hunger", "decision:eat", "motion:toward-food"],
  heuristic: true,
  confidence: 0.76
});
```

An attractive visualization does not raise its evidence level. If source or
capture metadata is missing, label the value **Unknown** rather than presenting
it as equally direct or current.

## Other shared domains

The base model also reserves bounded or scalar state for:

- `recording`: active state, start time, and sampling interval;
- `experiment`: ID, name, lifecycle status, and start time;
- `interventions`: a bounded list of provenance records (maximum 200). Each
  record has `id`, `type`, `target`, `worldKey`, integer `tick`, ISO-8601
  `performedAt`, `source`, `parameters`, `reason`, and `result`;
- `navigation`: origin and return target;
- `preferences`: display timebase, freshness multiplier, and reduced motion.

The Timeline consumes these shared selections, interventions, connection
state, and evidence rules through its own bounded pure recording reducer.
Later observatory tasks should continue to add focused reducers and tests
rather than parallel global variables or permanent polling loops.

## State actions

Reducers recognize these event contracts:

| Action | Required payload | Effect |
|---|---|---|
| `connection/status` | `status`; optional `changedAt`, `error` | Updates transport state; disconnect resets world-scoped selections and stales samples. |
| `engine/pause` | `paused` | Updates the shared engine pause fact. |
| `world/loading` | target `name`; optional `startedAt` | Invalidates world-scoped state before transport begins loading. |
| `world/sync` | `worldName`, `worldTick`; optional `systemTick`, `worldType`, `gameSpeed` | Normalizes current identity and detects a world switch. |
| `selection/set` | `kind`, `value`; optional `details` | Changes one shared selection. Prefer `select()`. |
| `sample/received` | normalized `sample` | Internal validated sample reduction. Prefer `recordSample()` or `requestShared()`. |
| `recording/set` | recording fields | Extends current recording state. |
| `experiment/set` | experiment fields | Extends current experiment state. |
| `intervention/add` | provenance record | Appends one record within the 200-item bound. Prefer `addIntervention()`. |
| `navigation/set` | `origin`, `returnTarget` | Sets cross-navigation context. |
| `preference/set` | `key`, `value` | Changes one display preference. |
