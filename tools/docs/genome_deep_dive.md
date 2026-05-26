# The Digital Genome — Deep Dive

At the foundation of every creature in Creatures 3 is its **genome**: a binary file in the proprietary `dna3` format that encodes the complete biological blueprint of the organism. This document is the authoritative technical reference for how genomes work — from the binary file format to the crossover algorithm that produces offspring.

> **Conceptual Overview:** For a high-level introduction to how genetics fits into the A-Life architecture, see [Game Philosophy & Overview](game_philosophy.md).

> **CAOS Commands:** For loading, crossing, and manipulating genomes via CAOS scripts, see [CAOS: Genetics](caos_genetics.md). The [Genetics Kit Tab](tab_genetics_kit.md) provides a visual interface for inspecting and editing genomes.

> **Brain Reference:** Brain genes (Lobe, Tract, Brain Organ) define the neural network. For the complete runtime architecture — lobes, tracts, dendrites, SVRule microcode, dendrite migration, instincts, and the 69-opcode instruction set — see [Brain & SVRules Deep Dive](brain_deep_dive.md).

---

## What the Genome Encodes

The genome does **not** encode behaviours. It encodes *structures*:

- The spatial layout and processing rules of brain lobes (see [Brain & SVRules Deep Dive](brain_deep_dive.md))
- The wiring patterns of neural tracts and their SVRule micro-programs (see [SVRule Opcode Reference](brain_deep_dive.md#svrule-opcode-reference))
- The chemical reactions that occur in each organ
- The receptor and emitter bindings that connect biochemistry to physiology
- The appearance, poses, gaits, and facial expressions
- The stimulus-response definitions that determine how events affect the creature chemically

A typical Norn genome contains roughly **200–350 genes** across **19 distinct subtypes** grouped into 4 major gene types. During embryogenesis (when the creature is constructed from its genome), the engine sequentially parses the gene file and builds the creature's physical structures: allocating organs, instantiating neural lobes at their genome-defined coordinates, wiring neural tracts, setting chemical half-lives, and assembling body parts from sprite data.

**This translation from genotype to phenotype is irreversible.** Changes to the genome file after hatching do not affect the living creature. The genome is read once during construction and then carried as an inert blueprint — exactly as in real biology, where DNA is transcribed during development but the physical organism runs independently afterward.

---

## The `dna3` Binary File Format

Genome files use a simple sequential binary format with marker-delimited genes:

```
┌─────────────────────────────────────────┐
│  File Header: "dna3" (4 bytes)          │ ← DNA3TOKEN
├─────────────────────────────────────────┤
│  Gene 1: "gene" marker + header + data  │ ← GENETOKEN
│  Gene 2: "gene" marker + header + data  │
│  ...                                    │
│  Gene N: "gene" marker + header + data  │
├─────────────────────────────────────────┤
│  End Marker: "gend" (4 bytes)           │ ← ENDGENOMETOKEN
└─────────────────────────────────────────┘
```

**Source:** These token constants are defined in [Genome.h](../../engine/Creature/Genome.h#L26-L28):

```cpp
const int DNA3TOKEN     = Tok('d','n','a','3');  // Start of .gen file
const int GENETOKEN     = Tok('g','e','n','e');  // Start of each gene
const int ENDGENOMETOKEN = Tok('g','e','n','d'); // End of genome
```

The engine also recognises a `gext` token (gene extension marker) for forward-compatibility, though no standard C3/DS genes use it. See [Genome::TestCodonExtn()](../../engine/Creature/Genome.cpp#L577-L585).

When the engine loads a `.gen` file in [Genome::ReadFromFile()](../../engine/Creature/Genome.cpp#L97-L151), it validates the `dna3` header and rejects older format files (Creatures 1/2) with a `genome_old_dna` error. The 4-byte file header is stripped, and the remaining bytes (gene data + `gend` marker) are loaded into a contiguous memory buffer.

---

## The Gene Header

Every gene begins with a 4-byte `gene` marker followed by an **8-byte header**. The header layout is defined by the [geneheaderoffsets](../../engine/Creature/Genome.h#L31-L42) enum:

| Offset | Field | Size | Enum Constant | Description |
|---|---|---|---|---|
| +0 | Marker | 4 bytes | — | The literal ASCII bytes `g`, `e`, `n`, `e` |
| +4 | Type | 1 byte | `GH_TYPE` | Gene type: `0`=Brain, `1`=Biochemistry, `2`=Creature, `3`=Organ |
| +5 | Subtype | 1 byte | `GH_SUB` | Gene subtype (e.g. `0`=Lobe, `1`=Brain Organ, `2`=Tract for Brain genes) |
| +6 | ID | 1 byte | `GH_ID` | Sequential identifier — used for crossover alignment and editor tracking |
| +7 | Generation | 1 byte | `GH_GEN` | Clone generation counter — incremented when a gene is duplicated by a cutting error |
| +8 | Switch-On Time | 1 byte | `GH_SWITCHON` | Life stage when gene activates (see [Life Stages](#life-stages-and-gene-expression-timing) below) |
| +9 | Flags | 1 byte | `GH_FLAGS` | Mutability and expression flags (see [Flag Bitmask](#flag-bitmask) below) |
| +10 | Mutability | 1 byte | `GH_MUTABILITY` | Mutation breadth weighting (0–255). Higher values make the gene more susceptible to point mutations during crossover |
| +11 | Variant | 1 byte | `GH_VARIANT` | Behaviour variant: `0` = express in all variants, `1`–`8` = express only in creatures of that specific variant |

The total header length including the 4-byte marker is **12 bytes** (`GH_LENGTH`).

### Flag Bitmask

The flags byte controls mutability and sex-linked expression. Defined in the [mutflags](../../engine/Creature/Genome.h#L53-L60) enum:

| Bit | Value | Name | Description |
|---|---|---|---|
| 0 | `0x01` | `MUT` | Gene allows point mutations during crossover. If unset, all data codons are copied verbatim — only the switch-on time may still mutate |
| 1 | `0x02` | `DUP` | Gene may be duplicated by cutting errors during crossover |
| 2 | `0x04` | `CUT` | Gene may be deleted by cutting errors during crossover |
| 3 | `0x08` | `LINKMALE` | Gene only expressed in males. Skipped during expression if the creature is female |
| 4 | `0x10` | `LINKFEMALE` | Gene only expressed in females. Skipped during expression if the creature is male |
| 5 | `0x20` | `MIGNORE` | Dormancy flag — gene is carried in the genome but **never expressed**. It contributes nothing to the current creature but is faithfully copied to offspring. A future mutation could flip this flag off, reactivating a gene that has been silent for many generations — analogous to atavistic traits in real biology |

> **Note:** If neither `LINKMALE` nor `LINKFEMALE` is set, the gene is expressed in all creatures regardless of sex. If both are set simultaneously (which is possible through mutation), the gene is also expressed in all creatures — the engine checks `(flags & (LINKMALE|LINKFEMALE)) == 0` as the "express always" condition.

**Source:** The expression logic is in [Genome::GetGeneType()](../../engine/Creature/Genome.cpp#L611-L670), where the `MIGNORE` check happens first (line 641) — a dormant gene is skipped before sex or variant checks.

### Life Stages and Gene Expression Timing

Every gene has a switch-on time that determines **when** during the creature's life it activates. The C3/DS biological life cycle contains **seven** genetically-triggered stages, defined in [CreatureConstants.h](../../engine/Creature/CreatureConstants.h#L6-L16):

| Value | Stage | Constant | Description |
|---|---|---|---|
| 0 | Baby | `AGE_BABY` | Initial embryological phase — T=0 genes create the brain, organs, and body structure |
| 1 | Child | `AGE_CHILD` | Language instincts activate, early learning begins |
| 2 | Adolescent | `AGE_ADOLESCENT` | Response to opposite sex begins; ovulation starts |
| 3 | Youth | `AGE_YOUTH` | Pair-bonding and mating time |
| 4 | Adult | `AGE_ADULT` | Mature relationships |
| 5 | Old | `AGE_OLD` | Declining interest in opposite sex; failing faculties |
| 6 | Senile | `AGE_SENILE` | Slowly poisoning yourself to death — aging chemicals accumulate |

Gene expression is controlled by [Genome::TimeToSwitchOn()](../../engine/Creature/Genome.cpp#L674-L693), which supports four scanning modes defined in the [geneswitchoverrides](../../engine/Creature/Genome.h#L159-L172) enum:

| Mode | Constant | Behaviour |
|---|---|---|
| Default | `SWITCH_AGE` | Gene activates only when the creature's current age exactly matches the gene's switch-on time |
| Always | `SWITCH_ALWAYS` | Gene activates every time the genome is scanned — used for re-reading appearance genes at different life stages |
| Embryo | `SWITCH_EMBRYO` | Gene activates if the creature's age is 0 (Baby), regardless of what switch-on time the gene header says. This is a safety net: if a critical brain lobe gene's switch-on time mutates away from 0, the engine forces it to express during embryogenesis anyway |
| Up to Age | `SWITCH_UPTOAGE` | Gene activates if its switch-on time is less than or equal to the creature's current age. Used to accumulate genes from earlier life stages |

> **Important:** Switch-on times are themselves mutable — they are data codons within the gene header that can be altered by point mutations during crossover. A mutation could cause a gene normally expressed in adulthood to activate during childhood, or delay a critical developmental gene until old age. This allows evolution to experiment with different life history strategies. However, the `SWITCH_EMBRYO` override protects critical brain genes from catastrophic timing mutations.

> **Special case — Organ genes:** The expression engine skips the switch-on time check entirely for Organ genes (`type == 3 && subtype == 0`), as seen in [GetGeneType() line 637](../../engine/Creature/Genome.cpp#L637). Organs always express when found, regardless of life stage.

---

## The Four Gene Types and 19 Subtypes

Genes are organized into four major types, each with multiple subtypes. These are defined as enums in [Genome.h](../../engine/Creature/Genome.h#L76-L131).

### Type 0 — Brain Genes (`BRAINGENE`)

Brain genes define the creature's neural network architecture. The brain is not pre-programmed — every aspect of its topology and processing rules is genetically encoded.

> **Deep Dive:** For the complete runtime behaviour of these genes — how lobes process neurons, how tracts wire dendrites, the SVRule micro-VM execution model, dendrite migration, and the instinct system — see [Brain & SVRules Deep Dive](brain_deep_dive.md).

#### Subtype 0 — Lobe Gene (`G_LOBE`)

Defines a brain lobe: a rectangular grid of neurons with spatial position, processing rules, and display colour.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Lobe Name | 4 bytes | ASCII identifier (e.g. `noun`, `verb`, `decn`, `driv`) |
| +4 | Update Time | 2 bytes (BE) | Brain ticks between updates — higher values slow this lobe's processing |
| +6 | X Position | 2 bytes (BE) | X coordinate of the lobe on the brain canvas |
| +8 | Y Position | 2 bytes (BE) | Y coordinate of the lobe on the brain canvas |
| +10 | Width | 1 byte | Number of neurons wide |
| +11 | Height | 1 byte | Number of neurons tall |
| +12 | Red | 1 byte | Lobe colour (R component) for visualization |
| +13 | Green | 1 byte | Lobe colour (G component) |
| +14 | Blue | 1 byte | Lobe colour (B component) |
| +15 | WTA | 1 byte | Winner-Takes-All flag: if non-zero, only one neuron in this lobe can fire at a time |
| +16 | Tissue | 1 byte | Tissue ID for biochemical coupling |
| +17 | Init Always | 1 byte | If set, re-run the init rule even on subsequent genome scans |
| +18 | Padding | 7 bytes | Reserved (zeroed) |
| +25 | Init Rule | 48 bytes | SVRule micro-program executed once when the lobe is first created |
| +73 | Update Rule | 48 bytes | SVRule micro-program executed every brain tick on every neuron in this lobe |

**Total data size:** 121 bytes.

#### Subtype 1 — Brain Organ Gene (`G_BORGAN`)

Configures the biological organ that powers the brain (clock rate, damage tolerance).

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Clock Rate | 1 byte | Processing speed of the brain organ |
| +1 | Damage Rate | 1 byte | Rate at which damage accumulates |
| +2 | Life Force | 1 byte | Structural integrity — if this reaches zero, the organ fails |
| +3 | Biotick Start | 1 byte | Starting phase offset in the biochemistry tick cycle |
| +4 | ATP Damage Coefficient | 1 byte | How much ATP is consumed to repair damage |

**Total data size:** 5 bytes.

#### Subtype 2 — Tract Gene (`G_TRACT`)

Defines a neural tract: a bundle of dendrite connections between two lobes. Tracts carry signals (and learning) between brain regions.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Update Time | 2 bytes (BE) | Brain ticks between updates |
| +2 | Source Lobe | 4 bytes | ASCII name of the source lobe |
| +6 | Source Lower | 2 bytes (BE) | First neuron index in source lobe to connect from |
| +8 | Source Upper | 2 bytes (BE) | Last neuron index in source lobe to connect from |
| +10 | Source Num | 2 bytes (BE) | Number of dendrites per destination neuron connecting to source |
| +12 | Dest Lobe | 4 bytes | ASCII name of the destination lobe |
| +16 | Dest Lower | 2 bytes (BE) | First neuron index in destination lobe |
| +18 | Dest Upper | 2 bytes (BE) | Last neuron index in destination lobe |
| +20 | Dest Num | 2 bytes (BE) | Number of dendrites per destination neuron connecting to destination |
| +22 | Migrates | 1 byte | If non-zero, dendrites can migrate between neurons (neuroplasticity) |
| +23 | Random | 1 byte | If non-zero, initial dendrite connections are randomized rather than sequential |
| +24 | Source Variable | 1 byte | Which source neuron state variable (0–7) the dendrite reads |
| +25 | Dest Variable | 1 byte | Which destination neuron state variable (0–7) the dendrite writes to |
| +26 | Init Always | 1 byte | Re-initialize on subsequent genome scans |
| +27 | Padding | 5 bytes | Reserved (zeroed) |
| +32 | Init Rule | 48 bytes | SVRule executed when a dendrite is first created or migrates to a new connection |
| +80 | Update Rule | 48 bytes | SVRule executed every brain tick — manages synaptic weight dynamics and learning |

**Total data size:** 128 bytes.

---

### Type 1 — Biochemistry Genes (`BIOCHEMISTRYGENE`)

Biochemistry genes define the creature's internal chemistry simulation — the 256-chemical bloodstream, metabolic reactions, and the interfaces between the chemical world and the neural/physical worlds.

> **Deep Dive:** For the complete runtime behaviour of these genes — how the organ update loop processes them, the receptor/emitter algorithms, the reaction rate formula, and the locus resolution chain — see [Biochemistry & The Chemical Simulation — Deep Dive](biochemistry_deep_dive.md).

#### Subtype 0 — Receptor Gene (`G_RECEPTOR`)

A receptor monitors a specific chemical concentration and converts it into a physiological effect by binding to an internal locus.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Organ | 1 byte | Which organ contains this receptor |
| +1 | Tissue | 1 byte | Tissue category (identifies the subsystem: `0`=creature, `1`=organ, etc.) |
| +2 | Locus | 1 byte | Which specific locus within the tissue to bind to (e.g. drive lobe input, threshold, etc.) |
| +3 | Chemical | 1 byte | Chemical ID (0–255) to monitor in the bloodstream |
| +4 | Threshold | 1 byte | Minimum concentration before the receptor activates |
| +5 | Nominal | 1 byte | Nominal (baseline) value subtracted from the reading |
| +6 | Gain | 1 byte | Amplification factor applied to the chemical-minus-nominal signal |
| +7 | Flags | 1 byte | Inverted output flag, digital (on/off) vs. analogue |

**Total data size:** 8 bytes.

#### Subtype 1 — Emitter Gene (`G_EMITTER`)

The functional inverse of a receptor — an emitter monitors an internal locus and excretes a chemical into the bloodstream.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Organ | 1 byte | Which organ contains this emitter |
| +1 | Tissue | 1 byte | Tissue category |
| +2 | Locus | 1 byte | Which locus to read from |
| +3 | Chemical | 1 byte | Chemical ID (0–255) to inject into the bloodstream |
| +4 | Threshold | 1 byte | Minimum locus value before emission begins |
| +5 | Rate | 1 byte | How frequently the emitter samples |
| +6 | Gain | 1 byte | How much chemical is emitted per unit of locus value |
| +7 | Flags | 1 byte | Clear-source flag (zero the locus after reading) |

**Total data size:** 8 bytes.

#### Subtype 2 — Reaction Gene (`G_REACTION`)

Defines a chemical reaction that transforms reactants into products. Reactions run inside organs at the organ's clock rate.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Reactant 1 Amount | 1 byte | Proportion of reactant 1 consumed per tick |
| +1 | Reactant 1 Chemical | 1 byte | Chemical ID of reactant 1 |
| +2 | Reactant 2 Amount | 1 byte | Proportion of reactant 2 consumed per tick |
| +3 | Reactant 2 Chemical | 1 byte | Chemical ID of reactant 2 |
| +4 | Product 1 Amount | 1 byte | Proportion of product 1 produced per tick |
| +5 | Product 1 Chemical | 1 byte | Chemical ID of product 1 |
| +6 | Product 2 Amount | 1 byte | Proportion of product 2 produced per tick |
| +7 | Product 2 Chemical | 1 byte | Chemical ID of product 2 |
| +8 | Rate | 1 byte | Reaction rate — how much of the available reactants are consumed per processing cycle |

**Total data size:** 9 bytes.

#### Subtype 3 — Half-Lives Gene (`G_HALFLIFE`)

A single gene containing the natural decay rates for **all 256 chemicals**. Each byte specifies how quickly the corresponding chemical degrades over time, creating natural homeostasis — chemicals introduced by stimuli or reactions will naturally dissipate unless continuously replenished.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Half-Lives | 256 bytes | One byte per chemical (ID 0–255). Higher values = slower decay. Value 0 = instant decay; value 255 = essentially permanent |

**Total data size:** 256 bytes.

#### Subtype 4 — Initial Concentration Gene (`G_INJECT`)

Defines a chemical's baseline concentration at birth.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Chemical | 1 byte | Chemical ID (0–255) |
| +1 | Amount | 1 byte | Starting concentration (0–255, mapped to 0.0–1.0) |

**Total data size:** 2 bytes.

#### Subtype 5 — Neuroemitter Gene (`G_NEUROEMITTER`)

Bridges the brain and the bloodstream. Attached to specific brain lobes, neuroemitters monitor neuron firing patterns and convert neural activity into chemical injections — allowing brain states to directly influence body chemistry.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Lobe 0 | 1 byte | First lobe to sample |
| +1 | Neuron 0 | 1 byte | Neuron index within lobe 0 |
| +2 | Lobe 1 | 1 byte | Second lobe to sample |
| +3 | Neuron 1 | 1 byte | Neuron index within lobe 1 |
| +4 | Lobe 2 | 1 byte | Third lobe to sample |
| +5 | Neuron 2 | 1 byte | Neuron index within lobe 2 |
| +6 | Rate | 1 byte | Sampling rate (ticks between checks) |
| +7 | Chemical 0 | 1 byte | First chemical to emit |
| +8 | Amount 0 | 1 byte | Amount of chemical 0 |
| +9 | Chemical 1 | 1 byte | Second chemical to emit |
| +10 | Amount 1 | 1 byte | Amount of chemical 1 |
| +11 | Chemical 2 | 1 byte | Third chemical to emit |
| +12 | Amount 2 | 1 byte | Amount of chemical 2 |
| +13 | Chemical 3 | 1 byte | Fourth chemical to emit |
| +14 | Amount 3 | 1 byte | Amount of chemical 3 |

**Total data size:** 15 bytes.

---

### Type 2 — Creature Genes (`CREATUREGENE`)

Creature genes control the external phenotype — how the creature looks, moves, and reacts to sensory events — plus behavioural instincts.

#### Subtype 0 — Stimulus Gene (`G_STIMULUS`)

Defines how the creature chemically reacts to a sensory event (e.g. being patted, eating food, bumping a wall). See [Script Events & Messages](caos_events.md) for the complete list of ~98 built-in stimulus events.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Stimulus ID | 1 byte | Which of the ~98 built-in events this gene responds to |
| +1 | Significance | 1 byte | Neural significance of the stimulus signal |
| +2 | Input | 1 byte | Noun/verb identification for the brain's perception lobes |
| +3 | Intensity | 1 byte | Strength of the signal fired into the brain |
| +4 | Features | 1 byte | Bit flags: `MODULATE` (intensity varies with event params), `IFASLEEP` (penetrates sleep), `TRAINING_OFF_FOR_0–3` (suppress learning loops) |
| +5 | Chemical 0 | 1 byte | First chemical to adjust |
| +6 | Amount 0 | 1 byte | Signed amount (-1.0 to +1.0, encoded as `(byte - 128) / 128`) |
| +7 | Chemical 1 | 1 byte | Second chemical to adjust |
| +8 | Amount 1 | 1 byte | Signed amount |
| +9 | Chemical 2 | 1 byte | Third chemical to adjust |
| +10 | Amount 2 | 1 byte | Signed amount |
| +11 | Chemical 3 | 1 byte | Fourth chemical to adjust |
| +12 | Amount 3 | 1 byte | Signed amount |

**Total data size:** 13 bytes. Chemical amounts use signed float encoding: `readFloat8()` returns `((int)byte - 128) / 128.0`.

#### Subtype 1 — Genus Gene (`G_GENUS`)

The first gene in every genome. Encodes the creature's genus and stores parent monikers after crossover.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Genus | 1 byte | `1`=Norn, `2`=Grendel, `3`=Ettin, `4`=Shee |
| +1 | Mother Moniker | 32 bytes | Mother's moniker string (written during [Genome::Cross()](../../engine/Creature/Genome.cpp#L190-L229), zero-padded) |
| +33 | Father Moniker | 32 bytes | Father's moniker string (written during crossover) |

**Total data size:** 65 bytes. The field offsets are defined in the [headeroffsets](../../engine/Creature/Genome.h#L46-L50) enum: `GO_GENUS = GH_LENGTH` (12), `GO_MUM = 13`, `GO_DAD = 45`.

#### Subtype 2 — Appearance Gene (`G_APPEARANCE`)

Defines sprite variants for a body region.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Part (Body Region) | 1 byte | See [body regions table](#body-regions) below |
| +1 | Variant | 1 byte | Sprite variant index (selects between different visual designs) |
| +2 | Species | 1 byte | Species sub-variant |

**Total data size:** 3 bytes.

##### Body Regions

From the [bodyregions](../../engine/Creature/Genome.h#L141-L153) enum:

| Value | Name | Constant | Description |
|---|---|---|---|
| 0 | Head | `REGION_HEAD` | Head sprite set |
| 1 | Body | `REGION_BODY` | Torso sprite set |
| 2 | Legs | `REGION_LEGS` | Both thighs, shins, and feet |
| 3 | Arms | `REGION_ARMS` | Both upper and lower arms |
| 4 | Tail | `REGION_TAIL` | Both parts of the tail. If no Appearance gene exists for the tail, no tail is created |
| 5 | Hair | `REGION_HAIR` | Hair sprite — genetically specified (new in C3) |

The creature's skeleton consists of up to **17 body parts** (from [SkeletonConstants.h](../../engine/Creature/SkeletonConstants.h#L10-L29)): head, body, left/right thigh, shin, foot, left/right humerus, radius, tail root, tail tip, left/right ear, and hair.

#### Subtype 3 — Pose Gene (`G_POSE`)

Defines a body pose — the arrangement of all limbs.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Pose Number | 1 byte | Identifier for this pose (referenced by Gait genes) |
| +1 | Pose String | 16 bytes | ASCII string of limb positions. Each character encodes a position for one body part (direction, head, body, left thigh, left shin, left foot, right thigh, etc.) |

**Total data size:** 17 bytes.

#### Subtype 4 — Gait Gene (`G_GAIT`)

Defines a walking animation as a sequence of poses.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Gait Number | 1 byte | Gait identifier |
| +1 | Pose Sequence | 8 bytes | Indices into the Pose gene table — the 8 poses that make up one walking cycle |

**Total data size:** 9 bytes.

#### Subtype 5 — Instinct Gene (`G_INSTINCT`)

Hard-wires an instinctive neural pathway — a "pre-learned" behaviour pattern that fires a reinforcement signal during embryogenesis to bias the brain toward a particular stimulus→action mapping before any learning has occurred.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Lobe 0 | 1 byte | First lobe to wire into |
| +1 | Cell 0 | 1 byte | Neuron in lobe 0 |
| +2 | Lobe 1 | 1 byte | Second lobe to wire into |
| +3 | Cell 1 | 1 byte | Neuron in lobe 1 |
| +4 | Lobe 2 | 1 byte | Third lobe to wire into |
| +5 | Cell 2 | 1 byte | Neuron in lobe 2 |
| +6 | Action | 1 byte | Which of the 14 actions (see [decision offsets](../../engine/Creature/CreatureConstants.h#L36-L53)) the instinct drives toward |
| +7 | Reinforcement Chemical | 1 byte | Chemical ID used as the reward signal |
| +8 | Reinforcement Amount | 1 byte | Amount of reward chemical injected |

**Total data size:** 9 bytes.

#### Subtype 6 — Pigment Gene (`G_PIGMENT`)

Defines one colour channel of the creature's skin pigmentation.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Pigment | 1 byte | Colour channel: `0`=Red, `1`=Green, `2`=Blue |
| +1 | Amount | 1 byte | Intensity of that colour channel (0–255) |

**Total data size:** 2 bytes.

#### Subtype 7 — Pigment Bleed Gene (`G_PIGMENTBLEED`)

Applies colour transformation effects to the creature's base pigmentation.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Rotation | 1 byte | Hue rotation amount |
| +1 | Swap | 1 byte | Colour channel swap effect |

**Total data size:** 2 bytes.

#### Subtype 8 — Expression Gene (`G_EXPRESSION`)

Links drive levels to facial expressions. When the weighted sum of the specified drives exceeds a threshold, the creature displays the corresponding facial expression.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Expression | 1 byte | Expression index: `0`=Normal, `1`=Happy, `2`=Sad, `3`=Angry, `4`=Surprise, `5`=Sleepy (from [SkeletonConstants.h](../../engine/Creature/SkeletonConstants.h#L52-L68)) |
| +1 | Padding | 1 byte | Unused |
| +2 | Weight | 1 byte | Overall weight/threshold for the expression |
| +3 | Drive 0 | 1 byte | First drive to monitor (see [drive offsets](../../engine/Creature/CreatureConstants.h#L56-L78)) |
| +4 | Amount 0 | 1 byte | Contribution weight of drive 0 |
| +5 | Drive 1 | 1 byte | Second drive |
| +6 | Amount 1 | 1 byte | Contribution weight |
| +7 | Drive 2 | 1 byte | Third drive |
| +8 | Amount 2 | 1 byte | Contribution weight |
| +9 | Drive 3 | 1 byte | Fourth drive |
| +10 | Amount 3 | 1 byte | Contribution weight |

**Total data size:** 11 bytes.

---

### Type 3 — Organ Genes (`ORGANGENE`)

#### Subtype 0 — Organ Gene (`G_ORGAN`)

Defines an internal biological organ. Every creature can have up to **128 organs**, each independently processing the biochemical reactions, receptors, and emitters that are assigned to it.

| Offset | Field | Size | Description |
|---|---|---|---|
| +0 | Clock Rate | 1 byte | Processing speed — how frequently the organ processes its reactions (higher = faster) |
| +1 | Damage Rate | 1 byte | How quickly the organ accumulates damage from toxins and injury |
| +2 | Life Force | 1 byte | Structural integrity. If this reaches zero, the organ fails entirely |
| +3 | Biotick Start | 1 byte | Starting phase offset — staggers organ processing across ticks to distribute CPU load |
| +4 | ATP Damage Coefficient | 1 byte | How much ATP (energy currency) is consumed to repair each unit of damage |

**Total data size:** 5 bytes.

> **Note:** Organ genes are **exempt from switch-on time checks**. The engine always expresses them regardless of the creature's current life stage (see [GetGeneType() line 637](../../engine/Creature/Genome.cpp#L637)).

---

## The Gene Expression Engine

When a creature reaches a new life stage, or when embryogenesis begins, the engine scans the genome using [Genome::GetGeneType()](../../engine/Creature/Genome.cpp#L611-L670). This function implements a sequential parser with filtering:

1. **Sequential scan**: Starting from the current genome pointer position, scan forward through the byte buffer looking for the next `gene` marker
2. **Header parsing**: Read the 8-byte header to extract type, subtype, switch-on time, flags, and variant
3. **Switch-on check**: Unless the gene is an Organ gene, verify that the current life stage matches the gene's switch-on time (or use one of the override modes)
4. **Sex check**: Skip genes that are sex-linked to the opposite sex. Skip dormant (`MIGNORE`) genes entirely
5. **Variant check**: If the gene specifies a variant (1–8), skip it unless the creature's variant matches. Variant 0 means "express always"
6. **Type match**: If the gene's type and subtype match the requested type, return `true` and leave the genome pointer positioned at the first data codon. The caller then reads gene-specific data bytes using [GetCodon()](../../engine/Creature/Genome.cpp#L525-L534), [GetByte()](../../engine/Creature/Genome.h#L306), [GetFloat()](../../engine/Creature/Genome.h#L312), etc.

### Codon Reading and Range Enforcement

The function [GetCodon(min, max)](../../engine/Creature/Genome.cpp#L525-L534) reads a single byte from the genome and forces it into the expected range using modular wrapping (not truncation). This ensures that even if a mutation pushes a codon outside its valid range, it wraps around rather than being clamped — preserving the distribution of possible values:

```cpp
int Genome::GetCodon(int min, int max) {
    int c = *myGenePointer++;           // read byte (0–255)
    if ((c >= min) && (c <= max)) return c;  // in range? use it
    return c % (max - min + 1) + min;        // wrap around
}
```

Convenience wrappers provide typed access:

| Method | Returns | Encoding |
|---|---|---|
| `GetByte()` | 0–255 | Raw byte value |
| `GetFloat()` | 0.0–1.0 | `byte / 255.0` |
| `GetSignedFloat()` | -1.0 to +1.0 | `(GetCodon(0, 248) / 124.0) - 1.0` |
| `GetInt()` | 0–65535 | Two bytes, big-endian (`high * 256 + low`) |
| `GetBool()` | true/false | Non-zero = true |

---

## Sexual Reproduction — Crossover and Mutation

Creatures reproduce sexually. When two creatures mate, the engine generates an entirely new genome for the offspring through a sophisticated crossover algorithm that simulates biological meiosis.

> **CAOS Reference:** [`GENE CROS`](caos_genetics.md) performs crossover from CAOS. The [Genetics Kit Tab](tab_genetics_kit.md) provides a visual **Cross** tool that calls the same engine function.

### The Crossover Algorithm

The crossover is implemented in [Genome::Cross()](../../engine/Creature/Genome.cpp#L190-L229) and [Genome::CrossLoop()](../../engine/Creature/Genome.cpp#L232-L361):

**1. Initialization** — A parent strand (`src`) is chosen randomly (50/50 mum or dad). Both parent genomes are reset to their first gene. The child genome buffer is allocated with space for both parents' genes combined plus safety margin.

**2. Gene Copying** — Genes are copied sequentially from `src` into the child genome. Each gene is copied by [CopyGene()](../../engine/Creature/Genome.cpp#L408-L436):
- The header is copied without mutation up to `GH_SWITCHON` (the first 8 bytes including the marker)
- The switch-on time codon **may** mutate (it goes through `CopyCodon`)
- The flags byte is copied without mutation (the `MUT`/`DUP`/`CUT` flags must remain intact to preserve genome integrity)
- All remaining data codons may mutate if the gene's `MUT` flag is set

**3. Crossover Points** — After copying a random number of genes (between 10 and `LINKAGE × 2` where `LINKAGE = 50`, giving a range of 10–100), the algorithm attempts to swap to the other parent's strand. It only crosses over when both strands are **synchronized** — i.e., the alternate parent has a gene with the same [GeneID](../../engine/Creature/Genome.cpp#L389-L392) as the current position. GeneID is a 24-bit composite: `(type << 16) | (subtype << 8) | id`.

Additionally, crossover will not occur while copying through a block of genes with identical Gene IDs — this prevents splitting apart a sequence of related genes (like multiple Appearance genes for different body parts).

**4. Genetic Linkage** — Because crossovers happen every ~50 genes on average, genes that are near each other in the genome have a high probability of being inherited together as a contiguous block. This prevents complex polygenic traits — like a neural lobe paired with its necessary biochemical receptor — from being destructively scrambled during every mating event. The original designer comment in [Genome.h](../../engine/Creature/Genome.h#L63-L66) explains: *"Big numbers imply higher likelihood that nearby genes remain linked in offspring."*

**5. Strand Swapping** — At a valid crossover point, the `src` and `alt` pointers are swapped. The `myCrossoverCrossCount` is incremented for genealogical tracking.

**6. Cutting Errors** — At each crossover point, there is a `1/CUTERRORRATE` (`1/80`) chance of a structural error. If triggered, the error type is chosen randomly:

- **Duplication (50%)**: The gene from the **previous** strand (the one just swapped away from) is copied again into the child, with its generation counter incremented to mark it as a clone. Only occurs if the gene's `DUP` flag is set. Gene duplication is arguably the most important mechanism for genuine evolution — it provides redundant genetic material that can accumulate mutations freely, potentially evolving entirely new functions without destroying the original gene that the creature needs for survival.

- **Deletion (50%)**: One gene on the **new** strand is skipped by calling `NextMarker()`. Only occurs if the gene's `CUT` flag is set.

**7. Termination** — When the end-of-genome marker (`gend`) is reached on the source strand, or the child genome buffer is full, [Terminate()](../../engine/Creature/Genome.cpp#L364-L369) writes the `gend` marker and sets the final genome length. Parent monikers are then written into the Genus gene.

### Point Mutations

During gene copying, individual data codons may mutate. The mutation logic is in [Genome::CopyCodon()](../../engine/Creature/Genome.cpp#L440-L482):

**Probability per codon:**

```
ChanceOfMutation = MUTATIONRATE                          // base: 4800
ChanceOfMutation = ChanceOfMutation × (256 - Mutability) / 256
ChanceOfMutation = ChanceOfMutation × (256 - ParentChanceOfMutation) / 256

Mutation occurs if: Rnd(ChanceOfMutation) == 0            // i.e., 1/ChanceOfMutation
```

Three factors multiply together to determine mutation probability:
- `MUTATIONRATE` (4800) — the base rate, a compile-time constant
- `Mutability` (0–255) — per-gene, from the gene header. Higher = more likely to mutate
- `ParentChanceOfMutation` (0–255) — from the parent creature's biochemistry. Higher = more likely

**Mutation magnitude** — When a mutation occurs, the magnitude is shaped using a power function:

```cpp
double dDegree = 1.0 + (127.0 * ((255 - ParentDegreeOfMutation) / 255.0));
// dDegree ranges from 1.0 (linear, wide mutations) to 128.0 (tight bell curve, subtle mutations)

double dP = pow(RndFloat(), dDegree);
byte MutationMask = (byte)(255.0 * dP);
if (MutationMask == 0x00) MutationMask = 0x01;  // at least one bit flips

byte NewCodon = Codon ^ MutationMask;  // XOR applies the mutation
```

This ensures **small, subtle mutations are far more common** than catastrophic large-scale changes — the power function heavily skews toward low values of `MutationMask`, meaning typically only one or two bits flip. Only very rarely (when `RndFloat()` returns a high value) does a large portion of the byte change.

### Heritable Mutation Rates

Remarkably, the mutation rates themselves are heritable biochemical traits. The creature's biochemistry includes loci for `ChanceOfMutation` and `DegreeOfMutation` that influence gamete volatility. These values are passed to `Cross()` as the `ParentChanceOfMutation` and `ParentDegreeOfMutation` parameters.

If environmental toxins alter these chemical levels, or if the genes governing these traits mutate, a lineage can evolve to become highly mutation-prone in hostile environments (accelerating adaptation) or genetically rigid in stable ones (preserving successful genotypes). This is a form of **evolvability** — the mutation rate itself is subject to natural selection.

---

## Monikers — Universal Genome Identifiers

Every genome is assigned a **moniker**: a 32-character universally unique identifier. Monikers are generated by [GenomeStore::TryGenerateUniqueMoniker()](../../engine/Creature/GenomeStore.cpp#L381-L407) with the format:

```
GGG-FFFF-XXXXX-XXXXX-XXXXX-XXXXX
 │    │    └──────────────────────── 20-char unique hash (from GenerateUniqueIdentifier)
 │    └─────────────────────────────  4-char friendly name (from Catalogue "Moniker Friendly Names")
 └──────────────────────────────────  3-digit generation number (from CalculateGenerationNumber)
```

The unique hash portion is computed by [GenerateUniqueIdentifier()](../../engine/General.cpp#L273-L376), which feeds an **MD5 hash** with a cocktail of entropy sources to guarantee universal uniqueness:

- Current timestamp (both standard and high-performance)
- Parent genome monikers (for crossover)
- Error message header (contains date and username)
- Number of agents currently in the world
- System tick and world tick
- Mouse position and velocity
- Current simulation speed
- 200–300 random bytes

The MD5 digest is then encoded into a human-readable format using a 32-character dictionary (`abcdefghjklmnpqrstuvwxyz23456789` — note the absence of `i`, `l`, `o`, `0`, and `1` to avoid visual ambiguity), split into four 5-character groups separated by hyphens.

### Generation Numbers

The 3-digit generation prefix is calculated by [GenomeStore::CalculateGenerationNumber()](../../engine/Creature/MonikerGeneration.cpp#L21-L50):

- **Crossover** (both parent monikers present): `max(mum_generation, dad_generation) + 1`
- **Clone** (one parent moniker): preserve the parent's generation number
- **Engineered** (no parents): `0 + 1 = 1`
- Clamped to `[0, 999]` for format compatibility

The generation counter in the moniker is distinct from the generation counter in individual gene headers (`GH_GEN`), which tracks gene duplication events.

### CAOS Commands for Monikers

| Command | Description |
|---|---|
| [`GTOS`](caos_genetics.md) | Returns the moniker from a genome slot on the target agent |
| [`MTOC`](caos_genetics.md) | Returns the creature agent with the given moniker |
| [`MTOA`](caos_genetics.md) | Returns any agent referencing the given moniker |

Monikers enable the complete genealogical tracking of every creature across its entire life history — see [CAOS: History](caos_history.md) for the `HIST` commands.

---

## Source References

| Topic | Source Files |
|---|---|
| Genome class, crossover algorithm | [Genome.h](../../engine/Creature/Genome.h), [Genome.cpp](../../engine/Creature/Genome.cpp) |
| Genome storage, moniker generation | [GenomeStore.h](../../engine/Creature/GenomeStore.h), [GenomeStore.cpp](../../engine/Creature/GenomeStore.cpp) |
| Generation number calculation | [MonikerGeneration.cpp](../../engine/Creature/MonikerGeneration.cpp) |
| Unique identifier (MD5) | [General.cpp](../../engine/General.cpp) (GenerateUniqueIdentifier) |
| Life stages, actions, drives | [CreatureConstants.h](../../engine/Creature/CreatureConstants.h) |
| Skeleton body parts, expressions | [SkeletonConstants.h](../../engine/Creature/SkeletonConstants.h) |
| Binary genome parser (JSON) | [DebugServer.cpp](../../engine/DebugServer.cpp) (parseGenomeFileToJson, line ~1465) |

### External References

- Grand, S. *Creation: Life and How to Make It*. Harvard University Press, 2001.
- [Creatures Wiki — Digital DNA](https://creatures.fandom.com/wiki/Digital_DNA)
- [Creatures Wiki — Genetics](https://creatures.fandom.com/wiki/Genetics)

---

[← Back to Game Philosophy & Overview](game_philosophy.md) · [CAOS: Genetics](caos_genetics.md) · [Genetics Kit Tab](tab_genetics_kit.md)
