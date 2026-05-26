# The Brain — Neural Architecture & SVRules Deep Dive

The Creatures 3/DS brain is a spatial, modular, fully soft-coded neural network that uses genetically-defined microcode to process sensory input and produce motor output. This document provides the complete technical reference for the brain architecture and the SVRule micro-virtual machine that drives it.

> **CAOS Reference:** The [`BRN:`](caos_brain.md) commands allow reading and writing neuron states, dendrite weights, and SVRule values. [`ATTN`](caos_creatures.md) and [`DECN`](caos_creatures.md) query the creature's current attention and decision.

> **Genome Reference:** Brain lobes, tracts, and organ genes define the neural topology. See [The Digital Genome](genome_deep_dive.md#type-0--brain-genes-braingene) for the binary gene data layouts.

> **Biochemistry Reference:** The brain reads chemical concentrations via SVRule `chem` operands and writes to the bloodstream via NeuroEmitters. See [Biochemistry Deep Dive](biochemistry_deep_dive.md#neuroemitters--brain-to-chemistry-bridge).

> **Developer Tools:** The [Creatures Tab Brain Monitor](tab_creatures.md) provides a real-time spatial visualization of all lobes, tract connections, and neuron states.

---

## Architecture Overview

The brain is implemented as a `Faculty` — a modular subsystem of the `Creature` class that is initialized from the genome and updated once per brain tick. It contains three primary component types:

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Brain (Faculty)                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │          BrainComponents (sorted by updateAtTime)              │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │  │
│  │  │  Lobe 0  │  │  Lobe 1  │  │ Tract 0  │  │  Lobe 2  │ ...    │  │
│  │  │  "driv"  │  │  "decn"  │  │driv→decn │  │  "attn"  │        │  │
│  │  │ 20 neur. │  │ 13 neur. │  │ N dendrs │  │ 40 neur. │        │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │  │
│  │       │              │              │              │           │  │
│  │       │  SVRule(init) │  SVRule(init) │  SVRule(init) │        │  │
│  │       │  SVRule(upd)  │  SVRule(upd)  │  SVRule(upd)  │        │  │
│  │       │              │              │              │           │  │
│  └───────┴──────────────┴──────────────┴──────────────┴───────────┘  │
│                                                                      │
│  ┌────────────────────────┐   ┌─────────────────────────────┐        │
│  │    Instincts (queue)   │   │ Biochemistry (float[256])   │        │
│  │  pre-wired reflexes    │   │  chemicals → SVRule operands │       │
│  └────────────────────────┘   └─────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### Class Hierarchy

| Class | Base | Role |
|---|---|---|
| [Brain](../../engine/Creature/Brain/Brain.h) | `Faculty` | Top-level container — lobes, tracts, instincts, knowledge vectors |
| [BrainComponent](../../engine/Creature/Brain/BrainComponent.h) | `PersistentObject` | Abstract base for lobes and tracts — holds init/update SVRules, update ordering |
| [Lobe](../../engine/Creature/Brain/Lobe.h) | `BrainComponent` | Rectangular grid of neurons with a shared SVRule pair |
| [Tract](../../engine/Creature/Brain/Tract.h) | `BrainComponent` | Dendrite bundle connecting two lobes — manages migration and reinforcement |
| [SVRule](../../engine/Creature/Brain/SVRule.h) | `PersistentObject` | 16-instruction micro-program — the processing logic for neurons and dendrites |
| [Neuron](../../engine/Creature/Brain/Neuron.h) | `struct` | 8 float state variables + an ID |
| [Dendrite](../../engine/Creature/Brain/Dendrite.h) | `struct` | Synapse between two neurons — 8 float weight variables + source/dest pointers |
| [Instinct](../../engine/Creature/Brain/Instinct.h) | `PersistentObject` | Pre-wired reflex loaded from genome — processed during REM sleep |

### System Limits

| Constant | Value | Source |
|---|---|---|
| `MAX_LOBES` | 255 | [BrainConstants.h](../../engine/Creature/Brain/BrainConstants.h) |
| `MAX_TRACTS` | 255 | BrainConstants.h |
| `MAX_NEURONS_PER_LOBE` | 65,025 (255×255) | BrainConstants.h |
| `MAX_DENDRITES_PER_TRACT` | 65,025 (255×255) | BrainConstants.h |
| `MAX_INSTINCTS` | 255 | BrainConstants.h |
| `NUM_SVRULE_VARIABLES` | 8 | BrainConstants.h |
| SVRule length | 16 instructions (48 bytes) | [SVRule.h](../../engine/Creature/Brain/SVRule.h) |

### Initialization from Genome

When a creature is constructed from its genome (`Brain::ReadFromGenome()`), the following sequence executes:

1. **Lobe creation** — the genome is scanned for all `BRAINGENE` / `G_LOBE` genes. Each lobe gene is parsed to create a `Lobe` object with its genome-defined position, dimensions, SVRules, and neuron array. Lobes are added to `myLobes` and `myBrainComponents`.

2. **Tract creation** — the genome is scanned for `BRAINGENE` / `G_TRACT` genes. Each tract attaches to its source and destination lobes (by 4-character token), creates its dendrite connections according to the connectivity flags, and loads its SVRules. Tracts are added to `myTracts` and `myBrainComponents`.

3. **Component sorting** — all brain components (lobes and tracts interleaved) are sorted by their `myUpdateAtTime` field. This determines the processing order: components with lower update times fire first, allowing the genome to define explicit information flow pipelines.

4. **Biochemistry registration** — each component receives a pointer to the creature's 256-chemical array, enabling SVRules to read chemical concentrations directly.

5. **Initialization** — each component's `Initialise()` method runs its Init SVRule once against every neuron or dendrite (or clears them, depending on the `myRunInitRuleAlwaysFlag`).

6. **Instinct loading** — all `CREATUREGENE` / `G_INSTINCT` genes are parsed into `Instinct` objects and queued for processing during the creature's next REM sleep cycle.

### The Update Loop

On each brain tick, `Brain::Update()` executes:

- **Normal mode**: Calls `UpdateComponents()` — iterates `myBrainComponents` in sorted order, calling `DoUpdate()` on each lobe and tract.
- **Instinct mode**: When `myInstinctsAreBeingProcessed` is true (during REM sleep), the brain processes one instinct per tick instead of running its normal update cycle. Two chemicals signal instinct processing: `preInstinctChemicalNumber` fires for one tick before instincts begin, and `instinctChemicalNumber` stays elevated throughout. These chemicals allow SVRules to detect "we are dreaming" and adjust learning rates accordingly.

---

## Lobes — The Processing Units

A **lobe** is a rectangular grid of neurons, defined in the genome with explicit spatial coordinates and dimensions. Each lobe has a 4-character name token (e.g., `driv`, `decn`, `noun`), SVRules that govern its neurons' behaviour, and optional Winner-Takes-All (WTA) logic.

### Genome Fields ([Lobe Gene](genome_deep_dive.md#subtype-0--lobe-gene-g_lobe) — Type 0, Subtype 0)

| Field | Type | Description |
|---|---|---|
| Token | 4-char | Lobe name identifier (e.g., `driv`, `decn`, `attn`) |
| UpdateAtTime | int | Processing order priority (lower = earlier in the tick) |
| X, Y | int, int | Position on the brain canvas (for the Brain Monitor visualization) |
| Width, Height | byte, byte | Neuron grid dimensions — total neurons = Width × Height |
| Colour | 3 bytes | RGB display colour for the Brain Monitor |
| WTA flag | byte | Whether this lobe uses Winner-Takes-All competition (read from genome but handled by SVRules) |
| TissueId | byte | Biochemistry tissue ID — used by [receptors/emitters](biochemistry_deep_dive.md#the-locus-system) to address neurons as loci |
| RunInitRuleAlways | byte | If nonzero, the Init SVRule runs on every tick (not just on creation) |
| Init SVRule | 48 bytes | 16-instruction micro-program run on neuron creation |
| Update SVRule | 48 bytes | 16-instruction micro-program run on every brain tick |

### Standard Norn Brain Lobes

A standard C3/DS Norn brain contains the following lobes, confirmed by live engine data:

| Index | Name | Neurons | Grid | Position | Category | Description |
|---|---|---|---|---|---|---|
| 0 | `driv` | 20 | 20×1 | (30, 55) | Drive & State | [Drive](biochemistry_deep_dive.md#drives--the-motivation-system) levels from biochemistry — one neuron per drive |
| 1 | `decn` | 13 | 1×13 | (50, 22) | Decision | Final action decision — Winner-Takes-All selects one action |
| 2 | `attn` | 40 | 40×1 | (5, 75) | Decision | Attention focus — which object category the creature is attending to |
| 3 | `visn` | 40 | 40×1 | (6, 8) | Perception | Visual input — what the creature can currently see (one neuron per [agent category](caos_categories.md#complete-category-table)) |
| 4 | `move` | 40 | 40×1 | (10, 12) | Motor | Motor control — movement processing |
| 5 | `comb` | 440 | 40×11 | (5, 22) | Processing | Concept combination — the largest lobe, combining perception with drives |
| 6 | `stim` | 40 | 40×1 | (5, 17) | Drive & State | [Stimulus](caos_events.md#involuntary-actions-6472) source tracking — which object caused the last stimulus |
| 7 | `noun` | 40 | 40×1 | (0, 0) | Perception | Object [category](caos_categories.md) identification — "what am I looking at?" |
| 8 | `verb` | 13 | 1×13 | (49, 3) | Perception | Available [actions](caos_events.md#creature-decision-scripts--on-agents-1631) — "what can I do?" |
| 9 | `smel` | 40 | 40×1 | (5, 4) | Perception | Smell processing — chemical gradient detection |
| 10 | `resp` | 40 | 40×1 | (60, 22) | Processing | Response formulation |
| 11 | `detl` | 40 | 40×1 | (65, 22) | Processing | Object detail processing |
| 12 | `situ` | 440 | 40×11 | (10, 35) | Processing | Situation assessment — context evaluation |
| 13 | `forf` | 40 | 40×1 | (5, 50) | Processing | Friend-or-foe classification |
| 14 | `mood` | 40 | 40×1 | (5, 60) | Drive & State | Aggregate emotional/mood state |

> **Note:** The exact lobe count and layout varies between Norns, Grendels, and Ettins, and can change further through genetic mutation. The table above reflects the standard Norn genome shipped with Creatures 3 / Docking Station.

### Lobe Update Cycle

When `Lobe::DoUpdate()` executes ([Lobe.cpp](../../engine/Creature/Brain/Lobe.cpp)):

1. A **dummy spare neuron** is created to serve as the initial WTA candidate (prevents the first neuron from automatically winning).

2. For each neuron `i` in the lobe:
   - The neuron's accumulated `myNeuronInput[i]` is loaded into `SVRule::invalidVariables[0]` — this is how incoming dendrite signals reach the neuron.
   - `myNeuronInput[i]` is reset to `0.0f` — inputs accumulate additively between updates via `SetNeuronInput()`.
   - If `myRunInitRuleAlwaysFlag` is true, the Init SVRule runs first.
   - The Update SVRule runs against the neuron's 8 state variables.
   - If either SVRule returns `setSpareNeuronToCurrent`, the current neuron becomes the **spare neuron** (the WTA leader so far), and `myWinningNeuronId` is updated.

3. After all neurons are processed, the lobe records `myWinningNeuronId` — the index of the last neuron that set the spare flag.

### Winner-Takes-All (WTA) Competition

WTA is not a hardcoded lobe property — it is implemented entirely within SVRules using the `doWinnerTakesAll` opcode (opcode 42). This opcode:

1. Compares `neuron[STATE_VAR]` against `spare[STATE_VAR]` (the current winner's state)
2. If the current neuron's state is **higher or equal**:
   - The spare neuron's `OUTPUT_VAR` is zeroed (previous winner loses)
   - The current neuron's `OUTPUT_VAR` is set to its `STATE_VAR` (it becomes the new winner)
   - Returns `setSpareNeuronToCurrent` — updating the spare pointer

This means WTA competition is just another SVRule instruction that genome authors choose to include (or omit) in a lobe's Update rule. Lobes like `decn` (decision) and `attn` (attention) typically include WTA to force a single winning action/focus. Perception lobes like `noun` and `visn` typically do **not** include WTA, allowing multiple neurons to fire simultaneously.

### The Input Mechanism

Neurons receive input through two pathways:

1. **Direct input** — via `Brain::SetInput(lobeName, neuronId, value)`. This is how the Sensory Faculty, Stimulus system, and instinct processing inject signals. Inputs are **additive** — calling `SetInput("noun", 5, 0.3)` adds 0.3 to neuron 5's input accumulator, not replaces it.

2. **Dendrite input** — via tract SVRules. When a tract's Update SVRule writes to `neuron[INPUT_VAR]` (the destination neuron's input variable), the signal is directly written into the neuron's state. The compound opcodes `divideAndAddToNeuronInput` and `multiplyAndAddToNeuronInput` specifically add weighted signals to `neuron[INPUT_VAR]`.

### Neuron State Variables

Each neuron maintains exactly 8 floating-point state variables, defined in [SVRule.h](../../engine/Creature/Brain/SVRule.h#L16-L25):

| Index | Enum Name | Common Name | Description |
|---|---|---|---|
| 0 | `STATE_VAR` | State | Core excitation level — the neuron's "activity" value |
| 1 | `INPUT_VAR` | Input | Accumulated input from dendrites and direct `SetInput()` calls |
| 2 | `OUTPUT_VAR` | Output | Finalized signal transmitted to outgoing dendrites |
| 3 | `THIRD_VAR` | S3 | General-purpose scratch variable for SVRule computations |
| 4 | `FOURTH_VAR` | S4 | Scratch variable — also used as the preserve/restore target |
| 5 | `FIFTH_VAR` | S5 | General-purpose scratch variable |
| 6 | `SIXTH_VAR` | S6 | General-purpose scratch variable |
| 7 | `NGF_VAR` | NGF | Neural Growth Factor — attracts migrating dendrites to this neuron |

The `FOURTH_VAR` (index 4) has a special role: the `preserveVariable` and `restoreVariable` opcodes use it as a temporary register, copying a specified variable into S4 and restoring from S4 respectively. The `preserveSpareVariable` and `restoreSpareVariable` opcodes perform the same operation on the spare neuron's S4.

### Biochemistry Locus Addressing

The brain exposes neuron state variables to the biochemistry system through the `GetLocusAddress()` mechanism. When a biochemical [Receptor or Emitter](biochemistry_deep_dive.md#the-locus-system) gene specifies `organ = ORGAN_BRAIN` and a tissue ID matching a lobe's `myTissueId`, the brain returns a pointer to the specified neuron's state variable:

```
locus = (neuron_index × noOfVariablesAvailableAsLoci) + state_variable_index
```

This allows biochemical receptors to **write** [drive chemical](biochemistry_deep_dive.md#drives--the-motivation-system) levels directly into the `driv` lobe's neurons, and biochemical emitters to **read** neuron states back as chemical concentrations. The bridge is bidirectional — chemistry influences the brain, and the brain influences chemistry. See [Biochemistry Deep Dive — Locus System](biochemistry_deep_dive.md#the-locus-system) for the full addressing scheme.

---

## Tracts — Neural Wiring

A **tract** is a bundle of dendrites (synaptic connections) between a source lobe and a destination lobe. Tracts define the brain's connectivity — which lobes can communicate and how information flows between them.

### Genome Fields ([Tract Gene](genome_deep_dive.md#subtype-2--tract-gene-g_tract) — Type 0, Subtype 2)

| Field | Type | Description |
|---|---|---|
| UpdateAtTime | int | Processing order priority |
| Source Lobe Token | 4-char | Source lobe name (e.g., `driv`) |
| Source Neuron Range | int min, int max | Which neurons in the source lobe participate |
| Source Dendrites Per Neuron | int | How many dendrites each source neuron fans out |
| Dest Lobe Token | 4-char | Destination lobe name (e.g., `decn`) |
| Dest Neuron Range | int min, int max | Which neurons in the destination lobe participate |
| Dest Dendrites Per Neuron | int | How many dendrites each dest neuron receives |
| Random Connect & Migrate | bool | If true, dendrites are randomly connected and can migrate |
| Random Count | bool | If true, actual dendrite count per neuron is random up to the specified max |
| Source NGF Index | byte | Which neuron state variable controls source-side migration |
| Dest NGF Index | byte | Which neuron state variable controls destination-side migration |
| RunInitRuleAlways | byte | If nonzero, Init SVRule runs every tick |
| Init SVRule | 48 bytes | Dendrite initialization micro-program |
| Update SVRule | 48 bytes | Dendrite update micro-program (runs every brain tick) |

### Connectivity Modes

Tracts support two fundamentally different connectivity patterns, determined by the `myDendritesAreRandomlyConnectedAndMigrate` flag:

#### Deterministic Wiring (Random Connect = false)

Dendrites are created in a fixed, repeating pattern. The algorithm iterates through source and destination neuron lists with wrap-around:

```
for each pair (src_i, dst_j):
    create Dendrite(src_i, dst_j)
    advance src every (src dendrites per neuron) steps
    advance dst every (dst dendrites per neuron) steps
    wrap both to beginning when exhausted
    stop when both wrap simultaneously
```

This creates a regular, lattice-like connectivity. Both source and destination dendrite counts must be nonzero.

#### Random Wiring with Migration (Random Connect = true)

Dendrites are randomly connected. Exactly one side (source or destination) must have its dendrite count set to zero — this is the **unconstrained** side. The constrained side determines the number of dendrites per neuron:

- **Source unconstrained** (source count = 0): For each destination neuron, create N dendrites to randomly chosen source neurons. No duplicate connections allowed.
- **Destination unconstrained** (destination count = 0): For each source neuron, create N dendrites to randomly chosen destination neurons.

If `myNoOfDendritesPerNeuronIsRandomUpToSpecifiedUpperBound` is true, the actual count per neuron is `Rnd(1, N)` rather than exactly `N`.

Random wiring enables **dendrite migration** — the brain's neuroplasticity mechanism (detailed below).

### Tract Update Cycle

When `Tract::DoUpdate()` executes ([Tract.cpp](../../engine/Creature/Brain/Tract.cpp)):

1. If migration is enabled, `MigrateWeakDendrites()` runs first — relocating weak dendrites before processing.

2. For each dendrite in the tract:
   - If `myRunInitRuleAlwaysFlag` is true, the Init SVRule runs with the dendrite's context.
   - The Update SVRule runs with:
     - `inputVariables` = source neuron's 8 state variables
     - `dendriteVariables` = the dendrite's 8 weight variables
     - `neuronVariables` = destination neuron's 8 state variables
     - `spareNeuronVariables` = source lobe's spare neuron variables
     - `srcNeuronId` = source neuron's `idInList`
     - `dstNeuronId` = destination neuron's `idInList`
   - `ProcessRewardAndPunishment()` is called — applying biochemically-driven weight changes.
   - If migration is enabled, `UpdateWeakDendritesList()` tracks the weakest dendrites for next cycle's migration.

### Reward and Punishment Reinforcement

Each tract maintains two `ReinforcementDetails` objects — one for reward and one for punishment. These are configured at runtime by SVRule opcodes (`setRewardThreshold`, `setRewardRate`, `setRewardChemicalIndex`, etc.).

When reinforcement is active ([Tract.h](../../engine/Creature/Brain/Tract.h#L104-L129)):

1. The `ProcessRewardAndPunishment()` method checks if the reward/punishment chemical concentration exceeds the configured threshold.
2. If it does, `ReinforceAVariable()` modifies a dendrite's weight by the configured rate, scaled by the chemical level. The specific variable reinforced depends on the implementation — typically the short-term weight `WEIGHT_SHORTTERM_VAR`.

This mechanism is what allows creatures to learn from experience — [biochemical reward chemicals](biochemistry_deep_dive.md#drives--the-motivation-system) (produced when drives are reduced) propagate through the reinforcement system to strengthen the specific neural pathways that led to the rewarded action.

---

## Dendrites — Synaptic Connections

A **dendrite** is a synapse between a specific source neuron and a specific destination neuron within a tract. It carries weight information that modulates signal transmission and can be modified by learning.

### Dendrite State Variables

Each dendrite maintains 8 floating-point weight variables, defined in [SVRule.h](../../engine/Creature/Brain/SVRule.h#L27-L36):

| Index | Enum Name | Common Name | Description |
|---|---|---|---|
| 0 | `WEIGHT_SHORTTERM_VAR` | WeightST | Short-term synaptic weight — recent learning, volatile |
| 1 | `WEIGHT_LONGTERM_VAR` | WeightLT | Long-term synaptic weight — consolidated memory |
| 2 | `SECOND_DENDRITE_VAR` | S2 | Scratch variable for SVRule computations |
| 3 | `THIRD_DENDRITE_VAR` | S3 | Scratch variable |
| 4 | `FOURTH_DENDRITE_VAR` | S4 | Scratch variable |
| 5 | `FIFTH_DENDRITE_VAR` | S5 | Scratch variable |
| 6 | `SIXTH_DENDRITE_VAR` | S6 | Scratch variable |
| 7 | `STRENGTH_VAR` | Strength | How permanent the dendrite is — resistance to migration |

### Short-Term / Long-Term Weight Convergence

The ST/LT weight system implements a two-stage memory mechanism:

1. **Short-term weight (WeightST)** — modified rapidly by reinforcement events. When a creature performs a rewarded action, the SVRules quickly increase the ST weight of the dendrites that carried the winning signal.

2. **Long-term weight (WeightLT)** — converges slowly toward the ST weight over time. The convergence is controlled by two SVRule opcodes:
   - `doSetSTtoLTRate` — sets the rate at which ST tends toward LT (forgetting recent changes)
   - `doSetLTtoSTRateAndDoWeightSTLTWeightConvergence` — sets the LT→ST rate AND performs the actual convergence calculation

The convergence formula, from [SVRule.cpp](../../engine/Creature/Brain/SVRule.cpp#L456-L472):

```
oldSTW = dendrite[WEIGHT_SHORTTERM_VAR]
oldLTW = dendrite[WEIGHT_LONGTERM_VAR]

// ST tends toward LT at STtoLTRate:
dendrite[WEIGHT_SHORTTERM_VAR] += (oldLTW - oldSTW) × STtoLTRate

// LT tends toward ST at LTtoSTRate:
dendrite[WEIGHT_LONGTERM_VAR] += (oldSTW - oldLTW) × LTtoSTRate
```

This creates a dual-timescale memory:
- **Fast changes** to ST weight encode recent experiences
- **Slow convergence** of LT toward ST consolidates repeated patterns into permanent memory
- If a reinforcement is not repeated, ST eventually relaxes back toward LT — the creature "forgets" the transient experience
- During instinct processing, the instinct chemical signals the SVRules to use high LT→ST convergence rates, effectively burning instincts directly into long-term memory

---

## Dendrite Migration — True Neuroplasticity

The most profound feature of the brain is **dendrite migration**: in tracts with random wiring enabled, weak dendrites can physically detach from their current connections and re-attach to different neurons based on Neural Growth Factor (NGF) gradients.

### The Migration Algorithm

Migration is executed by `Tract::MigrateWeakDendrites()` at the beginning of each tract update, before any dendrite SVRules fire:

**Phase 1 — Identify weak dendrites:** During the previous update cycle, `UpdateWeakDendritesList()` tracked the `myMaxMigrations` weakest dendrites (lowest `Strength` variable value, configurable via `Brain.catalogue` → `"Migration Parameters"`).

**Phase 2 — Find migration targets:**

1. **Destination target**: The algorithm scans all destination-lobe neurons for the one with the highest NGF state variable (indexed by `myDst.neuralGrowthFactorStateVariableIndex`). If no neuron has a positive NGF, migration is cancelled entirely.

2. **Source targets**: `FindNNeuronsWithHighestGivenState()` finds the top-N source-lobe neurons with the highest value in their NGF state variable (indexed by `mySrc.neuralGrowthFactorStateVariableIndex`).

**Phase 3 — Attempt migration:** For each potential source neuron with positive NGF:

1. Check if a dendrite already exists between this source and the destination target. If so, skip.
2. Search the weak dendrites list for one whose `Strength` is **less than** the source neuron's NGF level.
3. If found, **rewire** the dendrite: update its `srcNeuron` and `dstNeuron` pointers.
4. Re-initialize the migrated dendrite using the Init SVRule (or clear its weights if `myRunInitRuleAlwaysFlag` is set).

### What Controls NGF?

NGF is just another neuron state variable (typically `states[7]`, but the specific index is configurable per-tract via the genome). SVRules in the lobe's update rule can inflate a neuron's NGF when:

- The neuron fires strongly (high `STATE_VAR`)
- The neuron contributed to a rewarded action
- Biochemical signals indicate heightened plasticity

Conversely, SVRules can suppress NGF when a neuron's connections are well-established, effectively "freezing" the local wiring.

### The Effect

Through migration, an initially chaotic brain physically rewires itself based on experience:
- Successful stimulus→action pathways accumulate strong dendrites (high Strength → immune to migration)
- Unsuccessful pathways lose their dendrites (low Strength → candidates for migration)
- Recycled dendrites re-attach to high-NGF neurons — areas of active learning

The creature's brain literally changes shape over its lifetime. This is genuine unsupervised neural self-organization, not a lookup table or scripted behaviour.

---

## Instincts — Pre-Wired Reflexes

**Instincts** are genetically defined associations that prime the brain's neural pathways during REM sleep, giving newborn creatures a head start in learning survival behaviours without requiring trial-and-error from scratch.

### Genome Fields (Instinct Gene — [Type 2, Subtype 5](genome_deep_dive.md#subtype-5--instinct-gene-g_instinct))

| Field | Type | Description |
|---|---|---|
| Inputs (×3) | tissue ID + neuron ID | Three lobe/neuron pairs defining the stimulus context |
| Decision Script ID | byte | Which action should be taken (maps to `decn` neuron via catalogue) |
| Reinforcement Drive | byte | Which drive chemical to use for reinforcement (0–255) |
| Reinforcement Amount | signed float | Positive = reward, negative = punishment |

### Processing Sequence

Instincts are processed during REM sleep, one per brain tick, by `Instinct::Process()` ([Instinct.cpp](../../engine/Creature/Brain/Instinct.cpp)):

1. **Clear brain activity** — all neuron states are zeroed.

2. **Set up context** — the three input lobe/neuron pairs are activated:
   - `noun` inputs also trigger corresponding `visn` (vision at 0.1) and `smel` (smell at 1.0) neurons — simulating seeing and smelling the target object.
   - `verb` and `noun` neuron IDs are remapped through the `BrainScriptFunctions` [catalogue mapping](caos_events.md#creature-decision-scripts--on-agents-1631), converting script event IDs to decision neuron IDs. The `noun` neuron ID maps to an [agent category](caos_categories.md) slot.

3. **Force the desired action** — the decision neuron (`verb` lobe) corresponding to the instinct's target action is set to 1.0.

4. **Run the brain** — `UpdateComponents()` propagates signals through all lobes and tracts.

5. **Verify success** — if the `decn` (decision) lobe's winner matches the desired action, the instinct proceeds. Otherwise, the instinct is discarded as incompatible with this brain's wiring.

6. **Apply reinforcement** — the reinforcement drive neuron in the `resp` (response) lobe is activated with the instinct's reward/punishment amount (scaled by `REINFORCEMENT_MODIFIER = 0.5`).

7. **Run the brain again** — a second `UpdateComponents()` pass allows the reward signal to propagate through the dendrite SVRules, strengthening the pathways that led to the correct action.

### Instinct Signaling Chemicals

Two chemicals signal the instinct processing state to the brain's SVRules:

- `preInstinctChemicalNumber` — set to 1.0 for one tick before instinct processing begins, then cleared. This warns the SVRules to prepare (e.g., save current ST weights).
- `instinctChemicalNumber` — set to 1.0 throughout the entire instinct processing period. SVRules can read this via the `chem` operand and switch to high LT→ST convergence rates, ensuring instinct-driven weight changes are immediately committed to long-term memory.

After all instincts are processed, the brain also builds its **knowledge table** (`myAssistanceKnowledge`) — for each drive, it simulates "what would I do about this drive?" and records the winning attention/decision pair. This knowledge is used by the Linguistic Faculty when creatures teach each other concepts.

---

## SVRules — The Brain's Microcode

The **State Variable Rule (SVRule)** system is the computational engine of the brain. Rather than hardcoding how neurons integrate inputs or how dendrites transmit signals, the engine provides a micro-virtual machine. SVRules are genetically defined 48-byte micro-programs that execute inside every neuron and dendrite on every brain tick.

> **Editing SVRules:** The [Genetics Kit](tab_genetics_kit.md) provides a visual 16-row grid editor for composing and modifying SVRules with real-time pseudo-code preview. SVRules can also be modified at runtime via [`BRN: SETL`](caos_brain.md) (lobes) and [`BRN: SETT`](caos_brain.md) (tracts).

### Architecture

An SVRule is an array of exactly **16 instructions** (`SVRule::length = 16`), each stored as an `SVRuleEntry` struct:

```cpp
struct SVRuleEntry {
    int opCode;           // Which operation to perform
    int operandVariable;  // What data source to use
    int arrayIndex;       // Index into the data source (variable index or chemical ID)
    float floatValue;     // Pre-computed float (arrayIndex / 248, clamped to [0, 1])
};
```

The execution model is **accumulator-based** — a single floating-point `accumulator` register is initialized from `inputVariables[0]` (the first state variable of the input context) and serves as the primary working register for all operations.

### Encoding

In the genome, each instruction occupies **3 bytes**:

| Byte | Field | Encoding |
|---|---|---|
| 0 | Opcode | `GetCodonLessThan(69)` — value 0–68 |
| 1 | Operand | `GetCodonLessThan(16)` — value 0–15 |
| 2 | Value/Index | `GetCodonLessThan(N)` where N = 8 for variable indices, 256 for chemical/float indices |

The `floatValue` field is derived from the raw byte: `floatValue = byte / 248.0f`, clamped to `[0.0, 1.0]`. The divisor 248 (not 255) was chosen to ensure that common fractions like 1/2, 1/4, etc. can be represented exactly.

The total size of one SVRule is `16 × 3 = 48 bytes` — carefully chosen to fit within a single CPU cache line on 1990s hardware (L1 cache lines were typically 32 or 64 bytes). This allowed the engine to execute millions of SVRule evaluations per second without cache misses.

### Execution Context

When an SVRule fires, it receives four arrays of 8 floats plus two integer IDs:

| Parameter | Lobe Context | Tract Context |
|---|---|---|
| `inputVariables` | `SVRule::invalidVariables` (input[0] = neuron's external input) | Source neuron's 8 state variables |
| `dendriteVariables` | `SVRule::invalidVariables` (unused) | The dendrite's 8 weight variables |
| `neuronVariables` | The current neuron's 8 state variables | Destination neuron's 8 state variables |
| `spareNeuronVariables` | The lobe's current WTA winner's variables | Source lobe's spare neuron variables |
| `srcNeuronId` | The current neuron's `idInList` | Source neuron's `idInList` |
| `dstNeuronId` | The current neuron's `idInList` | Destination neuron's `idInList` |

The accumulator is initialized to `inputVariables[0]` — in lobe context this is the neuron's accumulated input signal; in tract context this is the source neuron's `STATE_VAR`.

---

## SVRule Opcode Reference

All 69 opcodes are enumerated in [SVRule.h](../../engine/Creature/Brain/SVRule.h#L60-L113) and their types defined in [SVRule.cpp](../../engine/Creature/Brain/SVRule.cpp#L13-L66).

### Operation Types

Each opcode has one of three types that determines how operands are handled:

| Type | Enum | Behaviour |
|---|---|---|
| No Operand | `operationTakesNoOperand` | The instruction uses no operand data — the operand/value bytes are ignored |
| Reads Operand | `operationReadsFromAnOperand` | The operand is resolved to a float value, then the opcode processes it |
| Writes Operand | `operationWritesToAnOperand` | The operand is resolved to a pointer, then the opcode writes to it |

### Operand Reference

All 16 operand types, from [SVRule.h](../../engine/Creature/Brain/SVRule.h#L119-L143):

| ID | Enum | Name | Type | Description |
|---|---|---|---|---|
| 0 | `accumulatorCode` | `acc` | No index | The accumulator register itself |
| 1 | `inputNeuronCode` | `input` | Variable index | Input (source) neuron's state variables — index 0–7 |
| 2 | `dendriteCode` | `dend` | Variable index | Dendrite weight variables — index 0–7 |
| 3 | `neuronCode` | `neuron` | Variable index | Current (destination) neuron's state variables — index 0–7 |
| 4 | `spareNeuronCode` | `spare` | Variable index | Spare (WTA winner) neuron's state variables — index 0–7 |
| 5 | `randomCode` | `random` | No index | Random float in [0.0, 1.0) via `RndFloat()` |
| 6 | `chemicalIndexedBySourceNeuronIdCode` | `chemSrc` | Chemical index | `chemicals[(index + srcNeuronId) % 256]` |
| 7 | `chemicalCode` | `chem` | Chemical index | `chemicals[index % 256]` — direct chemical lookup |
| 8 | `chemicalIndexedByDestinationNeuronIdCode` | `chemDst` | Chemical index | `chemicals[(index + dstNeuronId) % 256]` |
| 9 | `zeroCode` | `zero` | No index | Constant `0.0` |
| 10 | `oneCode` | `one` | No index | Constant `1.0` |
| 11 | `valueCode` | `float` | Float | `byte / 248.0` — value range [0.0, 1.0] |
| 12 | `negativeValueCode` | `negFloat` | Float | `-(byte / 248.0)` — value range [-1.0, 0.0] |
| 13 | `valueTenCode` | `float×10` | Float | `(byte / 248.0) × 10` — value range [0.0, 10.0] |
| 14 | `valueTenthCode` | `float÷10` | Float | `(byte / 248.0) / 10` — value range [0.0, 0.1] |
| 15 | `valueIntCode` | `int` | Float | `floor(byte / 248.0 × 248)` — integer cast of raw byte value |

### Chemical Indexing by Neuron ID

The `chemSrc` and `chemDst` operands are particularly powerful. They compute the chemical index as `(base_index + neuron_id) % 256`, which means:

- Different neurons in the same lobe read **different** chemicals based solely on their position
- A single SVRule instruction like `load chemSrc[148]` in a 20-neuron `driv` lobe will read [chemical 148](biochemistry_deep_dive.md#drives--the-motivation-system) for neuron 0 (Pain), 149 for neuron 1 (Hunger for Protein), 150 for neuron 2 (Hunger for Carbohydrate), etc.

This geometric coupling between brain layout and [biochemistry](biochemistry_deep_dive.md) is what allows a single SVRule to implement the entire drive-sensing mechanism — no per-neuron configuration needed.

### Complete Opcode Table

The opcode IDs below are the actual C++ enum values from [SVRule.h](../../engine/Creature/Brain/SVRule.h#L60-L113), counted sequentially.

| ID | Enum Name | Display Name | Type | Semantics |
|---|---|---|---|---|
| **Control Flow** | | | | |
| 0 | `stopImmediately` | `stop` | No operand | Halt execution immediately — remaining instructions are skipped |
| 30 | `noOperation` | `nop` | No operand | Do nothing — advance to next instruction |
| 31 | `setToSpareNeuron` | `setSpare` | No operand | Flag this neuron as the new spare/WTA candidate; returns `setSpareNeuronToCurrent` |
| 42 | `doWinnerTakesAll` | `wta` | No operand | If `neuron[STATE] >= spare[STATE]`: zero spare OUTPUT, set neuron OUTPUT = STATE, flag as spare |
| 52 | `gotoLine` | `goto` | Reads operand | Jump to line `int(operand)` — forward-only (no backward jumps to prevent infinite loops) |
| 48 | `ifZeroGoto` | `if=0 goto` | Reads operand | If `acc == 0`, jump to line `int(operand)` (forward-only) |
| 49 | `ifNZeroGoto` | `if≠0 goto` | Reads operand | If `acc != 0`, jump to line `int(operand)` (forward-only) |
| 67 | `ifNegativeGoto` | `if<0 goto` | Reads operand | If `acc < 0`, jump to line `int(operand)` (forward-only) |
| 68 | `ifPositiveGoto` | `if>0 goto` | Reads operand | If `acc > 0`, jump to line `int(operand)` (forward-only) |
| **Load/Store** | | | | |
| 1 | `blankOperand` | `blank` | Writes operand | Set `*operand = 0.0` |
| 2 | `storeAccumulatorInto` | `store` | Writes operand | Set `*operand = BoundIntoMinusOnePlusOne(acc)` |
| 3 | `loadAccumulatorFrom` | `load` | Reads operand | Set `acc = operand` |
| 34 | `addAndStoreIn` | `add+store` | Writes operand | Set `*operand = BoundIntoMinusOnePlusOne(acc + *operand)` |
| 35 | `tendToAndStoreIn` | `tend+store` | Writes operand | Set `*operand = BoundIntoMinusOnePlusOne(acc×(1−tendRate) + (*operand)×tendRate)` |
| 45 | `storeAbsInto` | `storeAbs` | Writes operand | Set `*operand = BoundIntoZeroOne(abs(acc))` |
| **Arithmetic** | | | | |
| 16 | `add` | `add` | Reads operand | `acc += operand` |
| 17 | `subtract` | `sub` | Reads operand | `acc -= operand` |
| 18 | `subtractFrom` | `subFrom` | Reads operand | `acc = operand - acc` |
| 19 | `multiplyBy` | `mul` | Reads operand | `acc *= operand` |
| 20 | `divideBy` | `div` | Reads operand | `acc /= operand` (no-op if operand is 0) |
| 21 | `divideInto` | `divInto` | Reads operand | `acc = operand / acc` (no-op if acc is 0) |
| 22 | `minIntoAccumulator` | `min` | Reads operand | `acc = min(acc, operand)` |
| 23 | `maxIntoAccumulator` | `max` | Reads operand | `acc = max(acc, operand)` |
| 26 | `negateOperandIntoAccumulator` | `negate` | Reads operand | `acc = -operand` |
| 27 | `loadAbsoluteValueOfOperandIntoAccumulator` | `abs` | Reads operand | `acc = abs(operand)` |
| 28 | `getDistanceTo` | `dist` | Reads operand | `acc = abs(acc - operand)` |
| 29 | `flipAccumulatorAround` | `flip` | Reads operand | `acc = operand - acc` (same as `subtractFrom`) |
| 32 | `boundInZeroOne` | `bound01` | Reads operand | `acc = clamp(operand, 0.0, 1.0)` |
| 33 | `boundInMinusOnePlusOne` | `bound±1` | Reads operand | `acc = clamp(operand, -1.0, 1.0)` |
| **Tend (Weighted Average)** | | | | |
| 24 | `setTendRate` | `tendRate` | Reads operand | `tendRate = abs(operand)` — sets the interpolation rate for subsequent `tend` operations |
| 25 | `tendAccumulatorToOperandAtTendRate` | `tend` | Reads operand | `acc = acc×(1−tendRate) + operand×tendRate` — linear interpolation toward the operand |
| **Conditional (Skip Next Instruction)** | | | | |
| 4 | `ifEqualTo` | `if=` | Reads operand | If `acc != operand`, skip next instruction |
| 5 | `ifNotEqualTo` | `if≠` | Reads operand | If `acc == operand`, skip next instruction |
| 6 | `ifGreaterThan` | `if>` | Reads operand | If `acc <= operand`, skip next instruction |
| 7 | `ifLessThan` | `if<` | Reads operand | If `acc >= operand`, skip next instruction |
| 8 | `ifGreaterThanOrEqualTo` | `if>=` | Reads operand | If `acc < operand`, skip next instruction |
| 9 | `ifLessThanOrEqualTo` | `if<=` | Reads operand | If `acc > operand`, skip next instruction |
| 10 | `ifZero` | `if=0` | Reads operand | If `operand != 0`, skip next |
| 11 | `ifNonZero` | `if≠0` | Reads operand | If `operand == 0`, skip next |
| 12 | `ifPositive` | `if>0` | Reads operand | If `operand <= 0`, skip next |
| 13 | `ifNegative` | `if<0` | Reads operand | If `operand >= 0`, skip next |
| 14 | `ifNonNegative` | `if>=0` | Reads operand | If `operand < 0`, skip next |
| 15 | `ifNonPositive` | `if<=0` | Reads operand | If `operand > 0`, skip next |
| **Conditional Stop** | | | | |
| 46 | `ifZeroStop` | `if=0 stop` | Reads operand | If `operand == 0`, halt execution |
| 47 | `ifNZeroStop` | `if≠0 stop` | Reads operand | If `operand != 0`, halt execution |
| 53 | `ifLessThanStop` | `if< stop` | Reads operand | If `acc < operand`, halt execution |
| 54 | `ifGreaterThanStop` | `if> stop` | Reads operand | If `acc > operand`, halt execution |
| 55 | `ifLessThanOrEqualStop` | `if<= stop` | Reads operand | If `acc <= operand`, halt execution |
| 56 | `ifGreaterThanOrEqualStop` | `if>= stop` | Reads operand | If `acc >= operand`, halt execution |
| **Compound Neural Operations** | | | | |
| 50 | `divideAndAddToNeuronInput` | `div+addInput` | Reads operand | `acc /= operand; neuron[INPUT] += acc` (bounded, no-op if operand is 0) |
| 51 | `mulitplyAndAddToNeuronInput` | `mul+addInput` | Reads operand | `acc *= operand; neuron[INPUT] += acc` (bounded) |
| **C2-Style Slider Opcodes** | | | | |
| 36 | `doNominalThreshold` | `threshold` | Reads operand | If `neuron[INPUT] < operand`, set `neuron[INPUT] = 0` |
| 37 | `doLeakageRate` | `leakage` | Reads operand | Set `tendRate = operand` (alias for setTendRate) |
| 38 | `doRestState` | `restState` | Reads operand | `neuron[INPUT] = neuron[INPUT]×(1−tendRate) + operand×tendRate` |
| 39 | `doInputGainLoHi` | `inputGain` | Reads operand | `neuron[INPUT] *= operand` — attenuate or amplify input |
| 40 | `doPersistence` | `persist` | Reads operand | `neuron[STATE] = neuron[INPUT]×(1−operand) + neuron[STATE]×operand` |
| 41 | `doSignalNoise` | `noise` | Reads operand | `neuron[STATE] += operand × RndFloat()` — add random noise |
| **Reinforcement / Memory Opcodes** | | | | |
| 43 | `doSetSTtoLTRate` | `setSTtoLT` | Reads operand | Set the tract's ST→LT convergence rate |
| 44 | `doSetLTtoSTRateAndDoWeightSTLTWeightConvergence` | `setLTtoST+converge` | Reads operand | Set the LT→ST rate AND perform the bidirectional convergence calculation |
| 57 | `setRewardThreshold` | `rewThresh` | Reads operand | Set the reward chemical threshold for this tract |
| 58 | `setRewardRate` | `rewRate` | Reads operand | Set the reward reinforcement rate |
| 59 | `setRewardChemicalIndex` | `rewChem` | Reads operand | Set which chemical to monitor for reward — also enables reinforcement |
| 60 | `setPunishmentThreshold` | `punThresh` | Reads operand | Set the punishment chemical threshold |
| 61 | `setPunishmentRate` | `punRate` | Reads operand | Set the punishment reinforcement rate |
| 62 | `setPunishmentChemicalIndex` | `punChem` | Reads operand | Set which chemical to monitor for punishment — also enables reinforcement |
| **Variable Preservation** | | | | |
| 63 | `preserveVariable` | `preserve` | Reads operand | Copy `neuron[int(operand) % 8]` → `neuron[FOURTH_VAR]` |
| 64 | `restoreVariable` | `restore` | Reads operand | Copy `neuron[FOURTH_VAR]` → `neuron[int(operand) % 8]` |
| 65 | `preserveSpareVariable` | `preserveSpare` | Reads operand | Copy `spare[int(operand) % 8]` → `spare[FOURTH_VAR]` |
| 66 | `restoreSpareVariable` | `restoreSpare` | Reads operand | Copy `spare[FOURTH_VAR]` → `spare[int(operand) % 8]` |

> **Note on opcode grouping:** The opcode IDs are not numerically contiguous within each functional category because the C++ enum was extended over multiple development phases. The C2-style slider opcodes (36–41), the WTA and memory opcodes (42–44), and the conditional stop/goto opcodes (46–52) all reflect historical layering. The `noOfOpCodes` sentinel is 69, giving a total of 69 valid opcodes (0–68).

### Bounding Functions

Two bounding functions are used throughout SVRule execution:

| Function | Range | Formula |
|---|---|---|
| `BoundIntoZeroOne(x)` | [0.0, 1.0] | `max(0.0, min(1.0, x))` |
| `BoundIntoMinusOnePlusOne(x)` | [-1.0, 1.0] | `max(-1.0, min(1.0, x))` |

The `store` opcode applies `BoundIntoMinusOnePlusOne` to the accumulator before writing, ensuring that stored values never exceed the [-1, +1] range. The `storeAbs` opcode applies `BoundIntoZeroOne` to `abs(acc)`.

### Jump Semantics

All goto/jump opcodes enforce **forward-only jumps**: `if (newLoc > i) i = newLoc - 1`. The `-1` compensates for the `for` loop's `i++`. If the target line is at or before the current line, the jump is silently ignored. This prevents infinite loops within the 16-instruction program.

The target line number is computed from the operand as `int(operand) - 1` (1-indexed to 0-indexed conversion).

---

## Common SVRule Patterns

These patterns appear frequently in default genome SVRules and illustrate common neural processing idioms:

### Leaky Integrator (Perception Lobe)

```
load  input[STATE]      // acc = source neuron's activity
tendRate float[0.5]     // set decay rate
tend  neuron[STATE]     // acc = acc×0.5 + neuron[STATE]×0.5
store neuron[STATE]     // neuron[STATE] = smoothed value
stop
```

The neuron's state gradually decays toward the input, creating a low-pass filter that smooths out rapid fluctuations in sensory input.

### Winner-Takes-All (Decision Lobe)

```
load  neuron[INPUT]     // acc = accumulated dendrite input
threshold float[0.1]    // zero input if below 0.1
leakage float[0.8]      // set tendency rate
restState float[0.0]    // tend input toward 0 (leaky)
inputGain float[0.5]    // attenuate
persist float[0.3]      // state = input×0.7 + state×0.3
noise float[0.02]       // add tiny random noise
wta                     // Winner-Takes-All competition
stop
```

The C2-style slider opcodes create a leaky, noisy integrator. The `wta` instruction forces a single neuron to win, suppressing all others.

### Hebbian Learning (Dendrite Update)

```
load  input[STATE]       // acc = source neuron's state (pre-synaptic)
mul   neuron[STATE]      // acc *= dest neuron's state (post-synaptic)
mul   dend[WEIGHT_ST]    // acc *= current weight → Hebbian triple
store dend[WEIGHT_ST]    // update short-term weight
setSTtoLT float[0.1]    // ST→LT convergence rate
setLTtoST+converge float[0.05] // LT→ST rate + do convergence
stop
```

The weight change is proportional to the product of pre-synaptic activity, post-synaptic activity, and the current weight — a classic Hebbian rule where "neurons that fire together wire together."

### Reward-Gated Plasticity (Dendrite Update)

```
rewChem chem[168]        // monitor chemical 168 (reward)
rewThresh float[0.1]    // only reinforce when reward > 0.1
rewRate float[0.3]      // reinforcement strength
punChem chem[169]        // monitor chemical 169 (punishment)
punThresh float[0.1]    // only punish when punishment > 0.1
punRate float[0.3]      // punishment strength
setSTtoLT float[0.05]   // slow ST→LT convergence
setLTtoST+converge float[0.01] // very slow LT→ST
stop
```

The first 6 instructions configure the reinforcement system. The actual weight changes happen in `ProcessRewardAndPunishment()` after the SVRule completes — the SVRule only sets the parameters.

---

## CAOS Brain Commands

The `BRN:` command family provides programmatic access to the brain, primarily designed for the original Creatures 3 "Vat Kit" tool. All commands operate on the current `TARG` creature.

> **Full command reference:** See [CAOS: Brain](caos_brain.md) for syntax details.

| Command | Description |
|---|---|
| `BRN: SETN` lobe neuron state value | Set a neuron's state variable |
| `BRN: SETD` tract dendrite weight value | Set a dendrite's weight variable |
| `BRN: SETL` lobe line value | Set a float value in a lobe's SVRule |
| `BRN: SETT` tract line value | Set a float value in a tract's SVRule |
| `BRN: DMPB` | Dump brain sizes (for Vat Kit binary protocol) |
| `BRN: DMPL` lobe | Dump lobe binary data |
| `BRN: DMPT` tract | Dump tract binary data |
| `BRN: DMPN` lobe neuron | Dump neuron binary data |
| `BRN: DMPD` tract dendrite | Dump dendrite binary data |
| `KLOB` | Count lobes in brain (integer r-value) |
| `KTRA` | Count tracts in brain (integer r-value) |
| `ATTN` | Get winning attention neuron ID (integer r-value) |
| `DECN` | Get winning decision neuron ID (integer r-value) |

### Decision Neuron to Action Mapping

The winning `decn` neuron maps to creature actions through a catalogue-driven mapping defined in `"Action Script To Neuron Mappings"`. Scripts 16–31 fire when the creature's attention is on an ordinary agent; scripts 32–47 fire when attending to another creature (see [Creature Decision Scripts](caos_events.md#creature-decision-scripts--on-agents-1631)). The standard mapping for a C3/DS Norn:

| Neuron ID | Action | Creature Script Event |
|---|---|---|
| 0 | Quiescent | — (no action) |
| 1 | Push (Activate1) | Script 16 / 32 |
| 2 | Pull (Activate2) | Script 17 / 33 |
| 3 | Stop (Deactivate) | Script 18 / 34 |
| 4 | Approach | Script 19 / 35 |
| 5 | Retreat | Script 20 / 36 |
| 6 | Get | Script 21 / 37 |
| 7 | Drop | Script 22 / 38 |
| 8 | Express Need | Script 23 / 39 |
| 9 | Rest | Script 24 / 40 |
| 10 | Walk West | Script 25 / 41 |
| 11 | Walk East | Script 26 / 42 |
| 12 | Eat | Script 27 / 43 |

> **See also:** [Script Events & Messages](caos_events.md) for the complete mapping of creature decision neurons to CAOS script events.

---

## Source References

| Topic | Source Files |
|---|---|
| Brain container | [Brain.h](../../engine/Creature/Brain/Brain.h), [Brain.cpp](../../engine/Creature/Brain/Brain.cpp) |
| Brain component base | [BrainComponent.h](../../engine/Creature/Brain/BrainComponent.h), [BrainComponent.cpp](../../engine/Creature/Brain/BrainComponent.cpp) |
| Lobe implementation | [Lobe.h](../../engine/Creature/Brain/Lobe.h), [Lobe.cpp](../../engine/Creature/Brain/Lobe.cpp) |
| Tract implementation | [Tract.h](../../engine/Creature/Brain/Tract.h), [Tract.cpp](../../engine/Creature/Brain/Tract.cpp) |
| SVRule micro-VM | [SVRule.h](../../engine/Creature/Brain/SVRule.h), [SVRule.cpp](../../engine/Creature/Brain/SVRule.cpp) |
| Neuron struct | [Neuron.h](../../engine/Creature/Brain/Neuron.h), [Neuron.cpp](../../engine/Creature/Brain/Neuron.cpp) |
| Dendrite struct | [Dendrite.h](../../engine/Creature/Brain/Dendrite.h), [Dendrite.cpp](../../engine/Creature/Brain/Dendrite.cpp) |
| Instinct processing | [Instinct.h](../../engine/Creature/Brain/Instinct.h), [Instinct.cpp](../../engine/Creature/Brain/Instinct.cpp) |
| Brain constants | [BrainConstants.h](../../engine/Creature/Brain/BrainConstants.h) |
| Action → neuron mapping | [BrainScriptFunctions.cpp](../../engine/Creature/Brain/BrainScriptFunctions.cpp) |

### External References

- Grand, S. *Creation: Life and How to Make It*. Harvard University Press, 2001. — Chapter 10: "A Recipe for Thought" covers the neural architecture design.
- [Creatures Wiki — Brain](https://creatures.fandom.com/wiki/Brain)
- [Creatures Wiki — Decision Lobe](https://creatures.fandom.com/wiki/Decision_lobe)
- [Creatures Wiki — Lobe](https://creatures.fandom.com/wiki/Lobe)
- [Creatures Wiki — Tract](https://creatures.fandom.com/wiki/Tract)
- [Documented C3/DS SVRules — Creatures Caves Forum](https://www.creaturescaves.com/forum.php?view=12&thread=7608)

---

[← Back to Game Philosophy](game_philosophy.md) · [Genome Deep Dive →](genome_deep_dive.md) · [Biochemistry Deep Dive →](biochemistry_deep_dive.md) · [Agent Categories](caos_categories.md) · [Script Events](caos_events.md) · [Creatures Tab](tab_creatures.md)
