# Task 02 — Correct Biological Semantics

Status: Completed

Depends on: Task 01

## Goal

Remove misleading biological labels and make the interface explicit about what
is measured directly, what is calculated, and what is heuristically inferred.

## Problems to correct

### “Health” is glycogen

`LifeFaculty::Health()` currently returns the concentration of
`CHEM_GLYCOGEN`. The Developer Tools render that value as an overall health
percentage and a health bar.

This makes a normal creature with a modest glycogen reserve appear critically
ill and reinforces a conventional game-health model that Creatures does not
actually use.

Replace the label with **Glycogen reserve** or **Energy reserve: glycogen**.

If a broader vitality summary is added, it must remain a collection of
indicators rather than an invented scalar:

- glycogen and glucose reserve;
- ATP/ADP state;
- oxygen and carbon dioxide;
- injury and relevant toxins;
- failed organs and the engine's last reported ATP-availability state;
- life state.

### Organ roles are heuristic

The Organs view currently guesses names such as “Liver / Detox” from the
chemicals participating in an organ.

Render these as:

```text
Organ 5
Likely role: detoxification
Inference: contains reactions involving heavy metals and glycotoxin
```

Do not imply that every genome compartment maps to a mammalian organ.

### Brain position is transformed

The Brain view currently rearranges selected lobes for readability while its
documentation describes genome-defined spatial positions.

Provide explicit modes:

- **Genome anatomy** — exact coordinates supplied by the genome/engine.
- **Functional flow** — a clearly labeled transformed layout optimized for
  reading sensory and decision pathways.

The active mode and any transformation must be visible.

### API and semantic-label parity

Review browser and MCP endpoint descriptions against actual payloads. In
particular, detailed brain-lobe payloads should provide the semantic labels
their documentation promises, or the documentation should state that callers
must obtain labels from the overview payload.

## Scope

- Correct labels, tooltips, docs, and example payloads.
- Add evidence badges and supporting explanations.
- Add the two Brain layout modes.
- Audit health, organ, brain, drive, chemical, age, and life-state wording.
- Add compatibility fields rather than silently repurposing established API
  fields when external consumers may depend on them.

## Documentation and in-product guidance

- Update Developer Tools biology, organs, brain, genome, API, and MCP
  documentation with the audited names, mappings, confidence, and source.
- Revise pop-up tips so glycogen is not called general health, heuristic organ
  names identify themselves as heuristic, and brain-layout modes explain their
  transformations.
- Add a short “How to read biological labels” guide with links to raw
  identifiers and engine evidence.
- Remove screenshots, examples, and legacy tips that preserve incorrect or
  overconfident terminology.

## Deliverables

- Corrected Creatures summary and list.
- An evidence-aware vitality summary.
- Inference badges and expandable evidence in Organs.
- Genome anatomy and Functional flow Brain modes.
- Correct browser/MCP/API documentation.
- Regression coverage for semantic mappings and layout selection.

## Acceptance criteria

- No UI surface labels glycogen alone as overall “Health.”
- A user can inspect the exact raw value and chemical ID.
- Every guessed organ role is visibly marked as inferred.
- The supporting chemicals or reactions for each organ inference are
  inspectable.
- Genome anatomy mode exactly matches coordinates returned by the engine.
- Functional flow mode cannot be mistaken for genome anatomy.
- Brain semantic labels are available through a documented, consistent API
  path.
- Screenshots and guides use current terminology.

## Verification

- Inspect baby, adult, ill, unconscious, and dead creatures in an isolated
  world.
- Compare displayed glycogen with direct chemistry output.
- Compare Brain genome mode coordinates with the API response.
- Exercise a genome with organs that do not match the current heuristics.
- Run focused unit and integration tests for new or changed endpoint fields.

## Out of scope

- Diagnosing why a creature is ill.
- Prescribing treatment.
- Adding historical charts; that belongs to Task 07.
