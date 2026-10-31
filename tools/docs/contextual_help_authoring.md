# Contextual Help Authoring

Contextual help is a product contract, not a substitute for clear labels.
Feature authors register stable help identifiers in
`contextual_help_model.js`; the drawer and documentation-integrity tests use
that inventory.

## Register a Help Identifier

Each definition must provide:

- stable `id` and optional CSS `selector`;
- concise title and plain-language meaning;
- activity: observe, read-only, reviewed-change, develop, or learn;
- evidence level, exact source, and update/freshness cadence;
- an interpretation caution;
- task-guide target and optional reference target;
- relevant terms, optional shortcut, and owning task.

Route help IDs use `route.<route-id>` and must exist for every declarative
navigation route. Static/dynamic fields can declare `data-help-id` directly or
use a registry selector. The boot-time target resolver adds `F1` to
`aria-keyshortcuts` without changing the element's normal keyboard behavior.

## Write Concise Pop-up Content

- Begin with what the control/value does.
- Use engine-accurate names and units.
- State whether the source is observed, mechanically derived, inferred, or
  unavailable.
- Name polling or event cadence and stale behavior.
- Put one important interpretation limitation beside the value.
- Keep workflow steps in the task guide, not the tooltip.

Tooltips are optional accelerators for pointer and keyboard focus. They are
non-interactive, use `aria-describedby`, and say that F1 opens details. Never
capture Tab to pin a tooltip.

## Preserve Live Context

Drawer guide/reference buttons build an explicit named Docs route carrying:

- confirmed world identity;
- primary and related stable selections;
- current world-tick cursor/range;
- current experiment identity in the drawer's identifier list.

Opening help or a guide never executes CAOS, changes recording, pauses the
simulation, or mutates the world.

## Editorial Rules

- Prefer “supports the hypothesis” to “proves” for concurrent biological,
  neural, ecological, and scripted evidence.
- Never turn a time sequence into a causal sentence without a direct engine
  event that supports it.
- Keep concentration/dose, drive/chemical, life stage/life state,
  immediate/installed CAOS, and pause-recording/pause-simulation distinct.
- Mark user-authored hypotheses and notes as provenance, not engine facts.
- Examples must use disposable names/IDs and must not include proprietary
  assets, genomes, creatures, saves, or personal paths.
- Screenshots need descriptive alt text and should use isolated test worlds.
- Keyboard instructions list visible controls first, shortcuts second.
- Review ownership belongs to the feature task; Task 20 performs the release
  audit but does not defer missing feature documentation.

## Stale-content Checks

`tools/tests/documentation_integrity.test.cjs` verifies:

- indexed documents and local Markdown/image links resolve;
- section targets exist;
- every navigation route owns a help definition;
- help guide/reference targets resolve;
- help inventory IDs match the JavaScript registry;
- obsolete `Tab`-to-pin guidance is absent.

Run it with the complete browser module suite:

```bash
node --test tools/tests/*.test.cjs
```
