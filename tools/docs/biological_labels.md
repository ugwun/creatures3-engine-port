# How to Read Biological Labels

The observatory separates engine measurements from calculations and
interpretations. Use the evidence badge beside a label to check which kind you
are seeing:

- **Observed** values come directly from an engine endpoint.
- **Derived** values are mechanically calculated from observed values.
- **Inferred** labels are heuristics with named supporting evidence.
- **Unknown** means the available evidence does not justify a label.

Raw chemical IDs, organ indices, lobe coordinates, and neuron indices remain
visible so a friendly label never replaces the underlying engine identity.

## Glycogen Is Not a Health Score

The legacy API field `health` calls `LifeFaculty::Health()`, which returns
chemical **4**, glycogen. It is retained for compatibility, but it is not an
overall health or hit-point score.

The creature list therefore labels its compact bar **Gly** and the summary
shows **Glycogen reserve (chemical 4)**. The vitality section is deliberately a
collection rather than a scalar:

- glycogen (4) and glucose (3);
- ATP (35) and ADP (36);
- oxygen (30) and dissolved carbon dioxide (24);
- injury (127) and listed toxin concentrations;
- the last reported organ ATP-availability flag and failure flag;
- life state.

A low glycogen concentration alone does not establish that a creature is ill.
The Chemistry view exposes the raw concentration for direct comparison. Raw
concentrations are **Observed**. The toxin threshold result and aggregate organ
counts are **Derived** and are labelled separately.

## Organ Role Inference

An organ is a genome-defined biochemical compartment. It should not be assumed
to map to a mammalian organ.

The Organs view always uses the stable title `Organ N`. A secondary **Likely
role** may appear when a chemical-participation heuristic matches. That label
is **Inferred** and lists the supporting chemical names and IDs. Its confidence
is explicitly **not calibrated**; the UI does not convert a rule match into an
unsupported probability. Expanding the card exposes the exact reactions,
receptors, and emitters that produced the inference.

If no rule matches, the view says **not classified** instead of inventing a
role. Organ badges report **ATP available**, **ATP unavailable**, or **Failed**.
ATP availability is the flag stored by the engine after the organ's most recent
activation; it is not a diagnosis of impairment. The long-term life-force
percentage is **Derived** from long-term life force divided by initial life
force.

## Brain Layout Modes

**Genome anatomy** is the default. It plots each lobe at the exact `x` and `y`
coordinates returned by `GET /api/creature/:id/brain`. This is **Observed**
geometry.

**Functional flow** is a **Derived**, transformed view for reading common
sensory and decision pathways. It aligns noun, vision, and stimulus lobes
around the combination lobe and moves the movement lobe below it. The toolbar
keeps the active mode and transformation visible. Switching modes never
changes the engine payload or genome.

Both the brain overview and detailed lobe endpoint include semantic labels.
The detailed endpoint returns a top-level `labels` array and a `label` on each
neuron, so API and MCP clients do not need to combine differently timed
responses.

## Age, Life Stage, and Life State

`age` is the numbered gene-expression **life stage** (`0` Baby through `6`
Senile). `ageInTicks` is the engine tick age since proper birth. `lifeState`
reports execution state such as Alert, Asleep, Dreaming, Unconscious, Zombie,
or Dead. These fields answer different questions and are displayed separately.

`sex` is the engine's sex value used for sex-linked gene expression (`1` male,
`2` female). It is not inferred from appearance.
