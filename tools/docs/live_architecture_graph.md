# Live Architecture Graph

The Architecture Graph connects reviewed engine structure to the current
Observatory investigation without pretending to be a call trace. It remains
fully useful as static documentation when the engine is disconnected.

## Model and Layers

Version 1 is defined in `architecture_model.js`; the renderer calculates
positions from layer and order rather than storing drawing coordinates in the
model.

| Layer | Meaning |
|---|---|
| Engine | Runtime owners such as App, AgentManager, CAOS VM, and DebugServer |
| Domain | Creature, brain, biochemistry, genome, ecology, scripts, and records |
| Transport | REST endpoints and the structured event stream |
| Browser | Shared state, retention, and explicit transformations |
| Surface | Observatory workspaces that consume and present the data |
| External | Recording exports and the optional MCP adapter |

Layer checkboxes hide both nodes and relationships. Search matches stable IDs,
labels, descriptions, endpoints, and maintained source paths.

## Relationship Evidence

The graph never uses colour as the only label. Every relationship exposes its
type in the graph's accessible name, text view, legend, and inspector.

- **Static relationship:** reviewed architecture metadata. It does not mean
  that a runtime path was exercised.
- **Observed activity:** a recent mapped REST/event-stream resource or current
  shared sample.
- **Derived transformation:** a stated mechanical browser calculation or
  projection.
- **Inferred relationship:** interpretive context that remains explicitly
  weaker than a direct engine fact.
- **Selected documented path:** focus for investigation. Selection alone is
  never promoted to Observed.

An edge can have a static architecture type and a separate recent-activity
emphasis. The inspector states both instead of replacing provenance.

## Live Telemetry Limits

Live request highlighting reads the browser's Resource Timing entries. It
retains no response bodies and adds no engine tracing. A mapped endpoint is
marked recently observed for 30 seconds after a browser resource completes.
Resource Timing may omit an event stream or an entry cleared by the browser.
Absence of a highlight therefore means **not observed in this bounded browser
window**, not that the engine path did not run.

The current named route, world, selected identifiers, tick, and recording
state provide investigation context. Context highlighting is visually and
textually separate from observed requests. Opening Architecture from
contextual help can carry a metric path plus the current world, subject, and
world-tick range.

## Graph and Text Views

Graph view supports:

- layer filters and search;
- pointer pan and Ctrl/Cmd+wheel zoom;
- visible zoom, Fit all, and Fit selection actions;
- Tab access to every visible node and relationship;
- arrow-key movement between nearby graph nodes;
- Enter or Space to inspect a focused relationship.

Text view contains the same filtered nodes and relationships grouped by layer.
It is the primary compact alternative for screen readers, reduced visual
space, and users who do not rely on colour or spatial position.

The selected item inspector can open a registered tool, contextual help, or a
built-in reference. Maintained repository source paths are shown as metadata
and explicitly described as unavailable browser links. Every actual button
uses a named internal route.

![The connected Live Architecture Graph in Firefox, showing six filtered
layers, distinct relationship evidence, current creature and chemical
identifiers, recent Chemistry API activity, and the selected metric path
inspector](/docs/images/observatory/live-architecture-graph-firefox.png)

## Data-path Inspector

The metric selector offers reviewed paths for creature drives, chemicals,
room CA values, running CAOS, structured logs, and experiment recording. Each
step names:

- owning component and field;
- unit;
- transformation;
- cadence;
- evidence level.

A path such as:

```text
engine concentration
→ chemistry API field
→ bounded biological series and numeric deltas
→ Creatures display
→ explicit JSON export
```

describes the maintained data contract. Only separately marked recent
requests count as observed live activity.

## Maintainer Checks

`tools/tests/architecture_model.test.cjs` validates unique IDs, endpoints,
acyclic directed relationships, data-path completeness, documentation targets,
and every maintained repository source path. Documentation integrity validates
the contextual-help targets.

When adding a component:

1. Add a stable model node without pixel coordinates.
2. Add relationships with explicit evidence, transformation, cadence, and
   unit where relevant.
3. Add route/help/document/source metadata only when maintained.
4. Extend endpoint matching only for an exact existing URL family.
5. Add or revise a reviewed metric path.
6. Test Graph and Text views with keyboard, reduced motion, a narrow viewport,
   a connected world, and a disconnected engine.
