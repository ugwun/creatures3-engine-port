# The Philosophy of Creatures 3 — Digital Biology

Creatures 3 (C3) and Creatures Docking Station (DS), developed by Creature Labs (formerly CyberLife Technology) and released between 1999 and 2001, represent one of the most ambitious artificial life simulations ever created for consumer hardware. Designed by Steve Grand, the game implements a radically different approach to virtual creatures — one rooted in biology rather than game AI.

This document explains the game's philosophy and core systems: how the creatures actually work under the hood, and why the architecture is so remarkable.

---

## Artificial Life, Not Artificial Intelligence

Traditional game AI relies on explicitly programmed behaviour: Finite State Machines, behaviour trees, goal-oriented action planning, or scripted pathfinding. An NPC "eats when hungry" because a programmer wrote code that says `if (hunger > threshold) { eat(); }`.

Creatures 3 does something fundamentally different. **There is no line of code anywhere in the engine that tells a creature what to do.** No behaviour is scripted. No state machine drives their actions. Instead, creatures are built from the bottom up using three biologically-inspired subsystems that interact to produce emergent behaviour:

```
┌──────────────────────────────────────────────────────┐
│                    BEHAVIOUR                         │
│            (emergent — never programmed)             │
├──────────────────────────────────────────────────────┤
│                                                      │
│   ┌──────────┐    ┌──────────────┐    ┌──────────┐   │
│   │ GENETICS │───→│ BIOCHEMISTRY │◄──→│  BRAIN   │   │
│   │  (DNA)   │    │ (256 chems)  │    │ (neural) │   │
│   └──────────┘    └──────────────┘    └──────────┘   │
│        │                 ▲                  │        │
│        │                 │                  │        │
│        ▼                 └──────────────────┘        │
│   Gene expression      Continuous feedback loop      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Genetics** provides the blueprint. The digital genome codes for physical structures — the layout of neural lobes, the configuration of internal organs, the rules governing chemical reactions — but it never codes for behaviours directly.

**Biochemistry** manages the creature's physiology. A continuous simulation of 256 chemicals flows through the creature's bloodstream, driving digestion, immunity, hormones, and drives like hunger, pain, and fear.

**The Brain** is a genuine neural network that processes sensory input and produces motor output. It is not a lookup table or decision tree — it physically rewires itself based on experience, forming and strengthening synaptic connections through reinforcement learning.

Behaviour emerges from the interaction of these three systems. When a creature "learns to eat when hungry," what actually happens is:

1. The biochemistry raises hunger chemicals in the bloodstream
2. Chemical receptors transfer these concentrations to the brain's drive lobe
3. The neural network chaotically tries different actions
4. Eating triggers a stimulus that injects food chemicals
5. Chemical reactions digest the food, lowering hunger
6. The drive reduction generates a reward signal
7. The reward strengthens the neural pathways that led to eating

The creature was never told to eat. It discovered eating through trial, error, and biochemical reinforcement — exactly as a real organism would.

> Steve Grand's book *Creation: Life and How to Make It* (2001) provides the theoretical foundation for this approach. His central argument is that genuine intelligence cannot be programmed from the top down — it must emerge organically from the local interactions of simpler, biologically inspired subsystems operating concurrently.

### Historical Context

The C3/DS architecture sits within the broader artificial life research community of the 1990s, sharing intellectual roots with the complex systems theories of the Santa Fe Institute and Thomas Ray's *Tierra* simulation (1991). However, while academic A-Life systems like Tierra focused on self-replicating machine code in abstract memory, Creatures implemented autonomous, embodied agents within a spatially defined, computationally expensive ecosystem — complete with genetics, biochemistry, neural networks, and a simulated physical world. Running all of this simultaneously on late-1990s consumer desktop hardware was a remarkable engineering achievement.

The game attracted serious academic attention. A 1997 paper by Grand et al., ["Artificial Life: Autonomous Software Agents for Home Entertainment"](https://www.sussex.ac.uk/informatics/cogslib/reports/csrp/csrp434.pdf), presented the architecture to the research community. Several independent researchers published studies on the creatures' learning capabilities and neural dynamics.

---

## The World as an Ecosystem

The game world is not a static backdrop — it is an actively simulated ecosystem that the creatures must navigate and interact with to survive.

> **Deep Dive:** For the complete technical reference — spatial hierarchy internals, the three-phase CA diffusion algorithm with source-level formulas, the CA-to-brain smell pipeline, emitter loci, the agent taxonomy, and the full food web architecture — see [The World Ecosystem — Deep Dive](world_ecosystem.md).

> **CAOS Reference:** For the commands that create and manipulate rooms, metarooms, doors, and cellular automata, see [Map & Rooms](caos_map.md).

### Metarooms and Rooms

The world is organized into a two-level spatial hierarchy:

- **Metarooms** are large, functionally enclosed environments — an engineering deck, a jungle terrarium, the Norn Meso habitation area, etc. The engine supports up to 200 metarooms.
- **Rooms** are the fundamental spatial units within metarooms. Each room is a polygon defined by four boundary edges (left wall, right wall, ceiling, floor) that can be sloped to create irregular terrain. The engine supports up to 2,000 rooms.

Rooms connect to each other through **doors** — shared boundary edges between adjacent rooms. Each door has a **permeability** value (0 = impermeable wall, 100 = fully open) that controls both creature/agent movement and environmental diffusion. See [`DOOR`](caos_map.md) and [`PERM`](caos_agents.md) for the CAOS commands.

### Cellular Automata — The Living Atmosphere

Each room maintains its own set of **20 Cellular Automata (CA) properties** — floating-point values representing the physical and chemical state of the atmosphere in that volume of space. These properties are continuously simulated, diffusing between connected rooms based on door permeability.

The CA system is configured per room type through three parameters:

| Parameter | Description |
|---|---|
| **Gain** | How quickly the property value increases from input |
| **Loss** | Natural decay rate of the property |
| **Diffusion** | How readily the property spreads to neighbouring rooms |

The specific assignment of the 20 CA slots to environmental properties (temperature, light, radiation, nutrients, smell channels, etc.) is handled by the game's bootstrap scripts rather than the engine itself — the engine provides 20 generic, fully diffusable property channels that the game data maps to specific environmental meanings.

Creatures actively sense these environmental properties through their biochemistry. Emitter loci like `LOC_COLDNESS`, `LOC_HOTNESS`, `LOC_LIGHTLEVEL`, `LOC_CROWDEDNESS`, `LOC_RADIATION`, `LOC_AIRQUALITY`, `LOC_UPSLOPE`, `LOC_DOWNSLOPE`, `LOC_HEADWIND`, and `LOC_TAILWIND` read room CA values and convert them into chemical concentrations in the creature's bloodstream. Combined with genetically-defined smell receptors, creatures can follow chemical gradients across the room network to track food sources or avoid hazardous areas.

### The Agent Taxonomy

Every object in the game world — from plants and animals to machines, toys, and creatures themselves — is an **agent** identified by a three-part classifier: **Family**, **Genus**, and **Species**. See [Agents](caos_agents.md) for how agents are created and manipulated via CAOS.

This classification works as a biological taxonomy. The creature's brain categorizes objects by their classifier, allowing it to generalize learned behaviours across related objects. If a creature learns that eating objects of a particular category reduces hunger, it can apply that knowledge to any new species within that category, even if it has never encountered it before. The complete 40-slot category mapping is documented in [Agent Categories](caos_categories.md).

The ecosystem forms a multi-layered food web: plants extract CA nutrients to grow and reproduce; herbivorous animals consume plants; food sources provide biochemical payloads when eaten; machines and toys provide utility or entertainment. Creatures must navigate this ecological web to survive — finding food, avoiding hazards, managing their temperature, and interacting with the social environment of other creatures.

---

## Genetics — The Digital Genome

At the foundation of every creature is its genome: a binary file in the proprietary `dna3` format that encodes the complete biological blueprint of the organism.

> **Deep Dive:** For the complete byte-level format specification, all 19 gene subtypes, and the full crossover algorithm, see [The Digital Genome — Deep Dive](genome_deep_dive.md).

> **CAOS Reference:** For loading, crossing, and manipulating genomes via CAOS, see [Genetics](caos_genetics.md). The [Genetics Kit Tab](tab_genetics_kit.md) provides a visual interface for inspecting genomes.

### What the Genome Codes For

The genome does **not** encode behaviours. It encodes *structures*:

- The spatial layout and processing rules of brain lobes
- The wiring patterns of neural tracts
- The chemical reactions that occur in each organ
- The receptor and emitter bindings that connect biochemistry to physiology
- The appearance, poses, gaits, and facial expressions
- The stimulus responses that define how events affect the creature chemically

A typical Norn genome contains roughly 200–350 genes across 19 distinct subtypes. During embryogenesis (when the creature is constructed from its genome), the engine sequentially parses the gene file and builds the creature's physical structures: allocating organs, instantiating neural lobes at their genome-defined coordinates, wiring neural tracts, setting chemical half-lives, and assembling body parts from sprite data.

**This translation from genotype to phenotype is irreversible.** Changes to the genome file after hatching do not affect the living creature. The genome is read once during construction and then carried as an inert blueprint — exactly as in real biology, where DNA is transcribed during development but the physical organism runs independently afterward.

### The Gene Header

Every gene in the `dna3` file begins with a 4-byte `gene` marker followed by an 8-byte header:

| Offset | Field | Size | Description |
|---|---|---|---|
| +4 | Type | 1 byte | Gene type: `0`=Brain, `1`=Biochemistry, `2`=Creature, `3`=Organ |
| +5 | Subtype | 1 byte | Gene subtype (e.g., Brain: `0`=Lobe, `1`=Brain Organ, `2`=Tract) |
| +6 | ID | 1 byte | Sequential gene identifier (used for crossover alignment) |
| +7 | Generation | 1 byte | Clone generation counter (incremented on gene duplication) |
| +8 | Switch-On Time | 1 byte | Life stage when gene activates (see Life Stages below) |
| +9 | Flags | 1 byte | Mutability and expression flags (bitmask) |
| +10 | Mutability | 1 byte | Mutation breadth weighting (higher = more susceptible to mutation) |
| +11 | Variant | 1 byte | Behaviour variant (`0`=express always, `1`–`8`=specific variant only) |

#### Flag Bitmask

| Bit | Value | Name | Description |
|---|---|---|---|
| 0 | `0x01` | `MUT` | Gene allows point mutations during crossover |
| 1 | `0x02` | `DUP` | Gene may be duplicated by cutting errors |
| 2 | `0x04` | `CUT` | Gene may be deleted by cutting errors |
| 3 | `0x08` | `LINKMALE` | Gene only expressed in males |
| 4 | `0x10` | `LINKFEMALE` | Gene only expressed in females |
| 5 | `0x20` | `MIGNORE` | Gene is carried but never expressed (dormant) |

The **dormancy flag** (`MIGNORE`) is a powerful evolutionary mechanism. A dormant gene contributes nothing to the current creature but is passed down through generations intact. A future mutation could flip this flag off, suddenly reactivating a gene that has been silent for many generations — analogous to atavistic traits in real biology.

#### Life Stages and Gene Expression Timing

The C3/DS biological life cycle contains **seven** genetically-triggered stages. Each gene has a switch-on time that determines when it activates:

| Value | Stage | Description |
|---|---|---|
| 0 | Baby | Initial embryological phase — T=0 genes create brain, organs, body |
| 1 | Child | Language instincts, early learning |
| 2 | Adolescent | Response to opposite sex begins; ovulation starts |
| 3 | Youth | Pair-bonding and mating time |
| 4 | Adult | Mature relationships |
| 5 | Old | Declining interest in opposite sex; failing faculties |
| 6 | Senile | Slowly poisoning yourself to death (aging chemicals accumulate) |

Gene switch-on times are themselves mutable — a mutation could cause a gene normally expressed in adulthood to activate during childhood, or delay a critical developmental gene until old age. This allows evolution to experiment with different life history strategies.

### The Four Gene Types

| Type | ID | Description | Subtypes |
|---|---|---|---|
| **Brain** | 0 | Neural topology, SVRule microcode, dendritic wiring | Lobe, Brain Organ, Tract |
| **Biochemistry** | 1 | Chemical simulation, metabolic pathways, biological interfaces | Receptor, Emitter, Reaction, Half-Lives, Initial Concentration, Neuroemitter |
| **Creature** | 2 | External phenotype, sensory responses, physical reflexes | Stimulus, Genus, Appearance, Pose, Gait, Instinct, Pigment, Pigment Bleed, Expression |
| **Organ** | 3 | Internal biological engines that process biochemicals | Organ |

---

## Sexual Reproduction — Crossover and Mutation

Creatures reproduce sexually. When two creatures mate, the engine generates an entirely new genome for the offspring through a sophisticated crossover algorithm that simulates biological meiosis.

> **Deep Dive:** For the complete crossover algorithm walkthrough, mutation probability formulas, and cutting error mechanics, see [The Digital Genome — Deep Dive](genome_deep_dive.md#sexual-reproduction--crossover-and-mutation).

> **CAOS Reference:** [`GENE CROS`](caos_genetics.md) performs crossover from CAOS. [`MATE`](caos_creatures.md) triggers the in-game mating sequence. Mutation counts can be queried with [`HIST MUTE`](caos_history.md) and crossover points with [`HIST CROS`](caos_history.md).

### The Crossover Algorithm

The crossover is implemented in `Genome::CrossLoop()`:

1. **Strand selection**: A parent strand (mum or dad) is chosen randomly as the starting source.

2. **Gene copying**: Genes are copied sequentially from the current source strand into the child genome. Gene data codons may mutate during copying (see below), but the gene header is copied without mutation (except the switch-on time).

3. **Crossover points**: After copying a random number of genes (between 10 and `LINKAGE × 2`, where `LINKAGE = 50`), the algorithm attempts to swap to the other parent's strand. It only crosses over when both strands are synchronized — i.e., the alternate parent has a gene with the same Gene ID as the current position.

4. **Genetic linkage**: Because crossovers happen every ~50 genes on average (range: 10–100), genes that are near each other in the genome have a high probability of being inherited together as a contiguous block. This prevents complex polygenic traits — like a neural lobe paired with its necessary biochemical receptor — from being destructively scrambled during every mating event.

5. **Termination**: When the end-of-genome marker (`gend`) is reached on the source strand, the child genome is terminated and parent monikers are written into the Genus gene.

### Mutation

During crossover, two types of errors are intentionally simulated:

**Point Mutations**: Individual codons within gene data can mutate. The probability per codon is:

```
1 / (MUTATIONRATE × (256 − Mutability) / 256 × (256 − ParentChanceOfMutation) / 256)
```

where `MUTATIONRATE = 4800`. The *magnitude* of a mutation is shaped using a power function: `pow(random, degree)`, where `degree` derives from the parent's `DegreeOfMutation`. This ensures small, subtle mutations are common while catastrophic large-scale changes are rare.

**Cutting Errors**: At each crossover point, there is a `1/CUTERRORRATE` (`1/80`) chance of a structural error:

- **Duplication (50%)**: The gene from the previous strand is copied again. The duplicate's generation counter is incremented. Only occurs if the gene's `DUP` flag is set.
- **Deletion (50%)**: One gene on the new strand is skipped. Only occurs if the gene's `CUT` flag is set.

Gene duplication is arguably the most important mechanism for genuine evolution. It provides redundant genetic material that can accumulate mutations freely, potentially evolving entirely new functions without destroying the original gene that the creature needs for survival — mirroring the role of gene duplication in real evolutionary biology.

### Heritable Mutation Rates

Remarkably, the mutation rates themselves are heritable biochemical traits. The creature's biochemistry includes loci for `ChanceOfMutation` and `DegreeOfMutation` that influence gamete volatility. If environmental toxins alter these chemical levels, or if the genes governing these traits mutate, a lineage can evolve to become highly mutation-prone in hostile environments (accelerating adaptation) or genetically rigid in stable ones (preserving successful genotypes).

### Monikers

Every genome is assigned a **moniker** — a unique identifier generated from an MD5 hash seeded with timestamps, mouse position, world tick, agent count, and random data. Monikers guarantee universal uniqueness and enable genealogical tracking across the entire game history. Use [`GTOS`](caos_genetics.md) to retrieve a creature's moniker, and the [`HIST`](caos_history.md) commands to query the creature's complete life event history by moniker.

---

## Biochemistry — The Chemical Simulation

Every creature maintains an internal "bloodstream" represented by a **256-slot array of floating-point chemical concentrations**, updated on every engine tick. This is not an abstract health bar system — it is a genuine chemistry simulation where chemicals interact through genetically-defined reactions, decay at individual rates, and drive the creature's physiology through receptor and emitter bindings.

> **Deep Dive:** For the complete chemical simulation internals — the update loop, organ architecture, receptor/emitter processing algorithms, reaction rate formulas, and the full chemical ID reference — see [Biochemistry & The Chemical Simulation — Deep Dive](biochemistry_deep_dive.md).

> **CAOS Reference:** Use [`CHEM`](caos_creatures.md) to read or adjust chemical concentrations. Use [`LOCI`](caos_creatures.md) to read or set biochemical locus values. Use [`ORGN`](caos_creatures.md), [`ORGF`](caos_creatures.md), and [`INJR`](caos_creatures.md) to inspect and damage organs. The [Creatures Tab](tab_creatures.md) shows live biochemistry in the developer tools.

### The Chemical Landscape

The 256 chemical slots are organized into functional groups. While the engine processes them purely as interacting numerical concentrations (chemical IDs 0–255), the game data assigns biological meaning:

#### Drive Chemicals (Slots 148–167)

These 20 chemicals represent the creature's physiological urgencies — the drives that motivate behaviour:

| Drive # | Name | Chemical ID |
|---|---|---|
| 0 | Pain | 148 |
| 1 | Hunger for Protein | 149 |
| 2 | Hunger for Carbohydrate | 150 |
| 3 | Hunger for Fat | 151 |
| 4 | Coldness | 152 |
| 5 | Hotness | 153 |
| 6 | Tiredness | 154 |
| 7 | Sleepiness | 155 |
| 8 | Loneliness | 156 |
| 9 | Crowdedness | 157 |
| 10 | Fear | 158 |
| 11 | Boredom | 159 |
| 12 | Anger | 160 |
| 13 | Sex Drive | 161 |
| 14 | Comfort | 162 |
| 15 | Up | 163 |
| 16 | Down | 164 |
| 17 | Exit | 165 |
| 18 | Enter | 166 |
| 19 | Wait | 167 |

> The first 14 drives (Pain through Comfort) are the traditional biological drives. Drives 15–19 (Up, Down, Exit, Enter, Wait) are navigational drives that motivate spatial movement through the world.

#### Key Chemical Groups

| Group | Chemical IDs | Description |
|---|---|---|
| Energy Metabolism | Glycogen (4), ATP (35), ADP (36) | Glycogen is broken down to synthesize ATP, the universal energy currency. ATP degrades to ADP through exertion. |
| Reproductive | Progesterone (48) | Regulates the reproductive cycle; spikes during pregnancy |
| Injury | Injury chemical (127) | Tracks physical damage |
| Immune System | Antigens (82–89), Antibodies | Pathogens trigger antigen production; the immune system produces targeted antibodies |
| Drive Chemicals | 148–167 | The 20 physiological drives (see table above) |
| Smell Chemicals | 165+ | Volatile compounds emitted into the CA environment |

> **Note on chemical numbering**: The stimulus system uses a different numbering offset (`STIMTOBIOCHEMOFFSET = 148`) to map stimulus chemicals to biochemistry chemicals. Stimulus chemical 0 maps to biochemistry chemical 148 (the first drive chemical). This offset ensures that stimuli directly target drive chemicals for reinforcement learning.

### The Organ System

Creatures possess multiple internal **organs** (up to 128), each defined by an Organ gene. Every organ is an independent biological engine with its own:

| Property | Description |
|---|---|
| **Clock Rate** | Processing speed — how frequently the organ processes its reactions |
| **Life Force** | Structural integrity; damage reduces this |
| **Rate of Repair** | How quickly the organ heals |
| **ATP Damage Coefficient** | How much ATP is consumed to repair damage |

If an organ takes damage from accumulated toxins or injury, its clock rate slows, crippling the biochemical pathways that depend on it. A damaged liver processes toxins more slowly; a damaged stomach digests food less efficiently. Organs can fail entirely if their life force reaches zero.

### Receptors, Emitters, and Reactions

The biochemistry is driven by three types of genetically-defined biological machinery:

**Chemical Receptors** monitor a specific chemical's concentration in the bloodstream. When the concentration passes a genetically-defined threshold (modified by a gain multiplier), the receptor binds to an internal **locus** — converting a chemical value into a physiological effect. For example, a receptor might monitor the Hunger for Protein chemical and bind to the brain's drive lobe, making the creature "feel" hungry when protein levels drop.

**Chemical Emitters** are the functional inverse. They monitor an internal locus (like the creature's asleep state, or its body temperature) and excrete a targeted chemical into the bloodstream when a threshold is breached.

**Chemical Reactions** transform reactant chemicals into product chemicals at a genetically-defined rate. For example, a liver organ might contain a reaction that converts toxins and ATP into harmless waste products. Each reaction specifies two reactants and two products with individual proportions.

**Neuroemitters** bridge the brain and the bloodstream. Attached to specific brain lobes, they monitor neuron firing patterns and convert neural activity into up to four distinct chemical injections — allowing brain states to directly influence body chemistry.

**Half-Lives** define the natural decay rate for each of the 256 chemicals. A single Half-Lives gene contains 256 bytes, each specifying how quickly the corresponding chemical degrades over time. This creates a natural homeostasis — chemicals introduced by stimuli or reactions will naturally dissipate unless continuously replenished.

**Initial Concentrations** define the creature's baseline chemical state at birth. These genes inject specific starting amounts of chemicals, establishing the creature's initial physiological condition.

---

## The Drive System

The 20 drives form the motivational core of the creature — the critical bridge between the biochemical body and the neural brain.

> **Deep Dive:** For the complete technical reference — including the three-layer drive locus architecture, all 99 stimulus events, the reinforcement learning pipeline, instinct processing, and synchronous learning — see [Drives & Reinforcement Learning](drives_and_learning.md).

> **CAOS Reference:** Use [`DRIV`](caos_creatures.md) to read or adjust drive levels directly. [`DRV!`](caos_creatures.md) returns the creature's highest current drive. The [`SWAY`](caos_messages.md) commands adjust multiple drives simultaneously.

Drives exist initially as chemical concentrations in the bloodstream (chemicals 148–167). They have no behavioural meaning until **Chemical Receptors** bind them to the engine's 20 hardcoded **Drive Loci** (`LOC_DRIVE0` through `LOC_DRIVE19`).

Once bound, the drive chemical levels are injected directly into the **Drive Lobe** (`driv`) of the neural network, where they become the electrical excitation levels of specific drive neurons. The brain "feels" each drive as neural activity proportional to its chemical concentration.

### Drive Reduction = Reward

The entire learning mechanism relies on a single fundamental principle: **reducing a drive generates a reward signal**.

When a creature experiences high hunger (high drive chemical), its neural network explores different actions. If it randomly performs an action that leads to eating, food chemicals enter the stomach, biochemical reactions digest the food, and the hunger chemical drops. The engine detects this negative delta in the drive locus and generates a global reward signal.

This reward signal propagates through the brain via reward chemicals, strengthening the specific neural pathways (dendrite weights) that led to the eating behaviour. Over time, the creature reliably "learns" to eat when hungry — not because anyone programmed this behaviour, but because the biochemistry rewarded the neural pathways that happened to reduce hunger.

Because drives are entirely soft-encoded via chemical numbering and receptor genes, mutations can alter a creature's fundamental motivations. A mutation might accidentally map the Pain chemical to the Sex Drive locus, creating an organism with radically different survival instincts. Whether such a mutation is adaptive or fatal depends entirely on the environment — exactly as in real evolution.

---

## The Brain — Neural Architecture

The creature's brain is a spatial, modular, fully soft-coded neural network. It is not a conventional game AI system — it is a genuine neural network that processes inputs, forms associations, and produces outputs through dynamically changing synaptic weights.

> **Deep Dive:** For the complete technical reference — class hierarchy, lobe/tract/dendrite internals, the SVRule micro-VM architecture, the full 69-opcode instruction set, dendrite migration algorithm, and instinct processing — see [Brain & SVRules Deep Dive](brain_deep_dive.md).

> **CAOS Reference:** The [`BRN:`](caos_brain.md) commands allow reading and writing neuron states, dendrite weights, and SVRule values. [`ATTN`](caos_creatures.md) and [`DECN`](caos_creatures.md) query the creature's current attention and decision. The [Creatures Tab](tab_creatures.md) visualizes brain activity in real time.

### Lobes — The Processing Units

The brain is organized into **lobes**: rectangular grids of neurons, each defined in the genome with explicit position coordinates (x, y) and dimensions (width × height in neurons). The spatial layout is not cosmetic — it determines how dendrites (neural connections) can physically reach between lobes.

A standard C3/DS creature has approximately 15 lobes:

| Category | Lobes | Description |
|---|---|---|
| **Perception** | `noun`, `verb`, `visn`, `smel`, `detl` | What the creature sees, what actions are available, visual processing, smell processing, object detail |
| **Processing** | `comb`, `situ`, `resp`, `forf` | Concept combination, situation assessment, response formulation, friend-or-foe classification |
| **Decision** | `attn`, `decn`, `move` | Attention focus, final action decision, motor control |
| **Drive & State** | `driv`, `mood`, `stim` | Drive levels from biochemistry, aggregate emotional state, stimulus source tracking |

#### Winner-Takes-All vs. Free-Running

Lobes operate in two modes:

- **Free-running lobes** (perception and processing) allow multiple neurons to fire simultaneously, representing overlapping concepts — a creature can recognize both "food" and "danger" at the same time.
- **Winner-Takes-All (WTA) lobes** (notably `decn`) force a single neuron to win and suppress all others. This prevents the creature from attempting conflicting actions simultaneously — it must decide to *either* eat *or* flee, never both at once.

### Neurons — 8 State Variables

Each neuron maintains 8 floating-point state variables:

| Index | Name | Description |
|---|---|---|
| 0 | State | Core excitation level at the current tick |
| 1 | Input | Accumulated signal from all incoming dendrites |
| 2 | Output | Finalized signal transmitted to outgoing dendrites |
| 3 | Third (S3) | Spare variable used by SVRule computations |
| 4 | Fourth (S4) | Spare variable (also used for preserve/restore operations) |
| 5 | Fifth (S5) | Spare variable |
| 6 | Sixth (S6) | Spare variable |
| 7 | NGF | Neural Growth Factor — attracts migrating dendrites |

### The Processing Pipeline

Each brain tick, sensory information flows through the network:

1. **Perception**: External stimuli from the environment enter the perception lobes (`noun`, `verb`, `visn`, `smel`)
2. **Processing**: Excitation propagates through processing lobes (`comb`, `situ`), evaluating context against internal drives (`driv`)
3. **Decision**: Signals converge on the decision lobe (`decn`), where WTA competition selects a single winning action
4. **Motor output**: The winning `decn` neuron triggers the corresponding CAOS script — a physical action in the world (push, pull, eat, approach, retreat, etc.). See [Script Events & Messages](caos_events.md) for the complete mapping of decision neurons to event scripts.

The 14 action neurons in `decn` correspond directly to the engine's action constants: Quiescent, Activate1, Activate2, Deactivate, Approach, Retreat, Get, Drop, Express Need, Rest, Walk West, Walk East, Eat, and Hit. These map to creature script events 16–29 (and 32–45 for alternative scripts) — see the [creature decision scripts table](caos_events.md) for details.

---

## SVRules — The Brain's Microcode

> **Deep Dive:** For the complete opcode-by-opcode reference, operand encoding, execution context, common SVRule patterns, and the reinforcement learning opcodes, see [Brain & SVRules Deep Dive — SVRule Opcode Reference](brain_deep_dive.md#svrule-opcode-reference).

The most remarkable engineering feature of the brain is the **State Variable Rule (SVRule)** system. Rather than hardcoding how neurons integrate their inputs or calculate their outputs, the engine provides a fully functioning micro-virtual machine. SVRules are genetically defined 48-byte micro-programs executed by every neuron and dendrite on every brain tick.

### The Micro-VM

An SVRule consists of exactly **16 instructions**, each 3 bytes long (opcode, operand, value). The execution model uses an **accumulator-based architecture** — a single working register that operations load into, transform, and store from.

This 48-byte limit was carefully chosen: the entire SVRule fits within a single CPU cache line on 1990s hardware, allowing the engine to execute millions of micro-instructions per second across the entire neural network without stalling the main game loop.

### Opcodes (69 Operations)

The instruction set is specialized for neural processing:

| Category | Opcodes |
|---|---|
| **Control** | `stop`, `nop` (no operation), `goto`, conditional gotos |
| **Load/Store** | `load` (into accumulator), `store` (from accumulator), `blank` (zero out) |
| **Arithmetic** | `add`, `subtract`, `subtractFrom`, `multiply`, `divide`, `divideInto`, `min`, `max` |
| **Comparison** | `if=`, `if≠`, `if>`, `if<`, `if≥`, `if≤`, `ifZero`, `ifNonZero`, `ifPositive`, `ifNegative` |
| **Conditional Stop** | `ifZeroStop`, `ifNonZeroStop`, `if<Stop`, `if>Stop` |
| **Neural** | `tend` (weighted average), `wta` (Winner-Takes-All), `bound` (clamp to [0,1] or [-1,1]), `setSpareNeuron` |
| **Reward/Punishment** | `setRewardThreshold`, `setRewardRate`, `setRewardChemicalIndex`, `setPunishmentThreshold`, `setPunishmentRate`, `setPunishmentChemicalIndex` |
| **C2-style Sliders** | `nominalThreshold`, `leakageRate`, `restState`, `inputGainLoHi`, `persistence`, `signalNoise` |
| **Memory** | `setSTtoLTRate`, `setLTtoSTRate` (short-term ↔ long-term weight convergence) |
| **Compound** | `addAndStoreIn`, `tendToAndStoreIn`, `divideAndAddToNeuronInput`, `multiplyAndAddToNeuronInput` |

### Operands (16 Data Sources)

Operands determine what data the opcode interacts with:

| Operand | Description |
|---|---|
| `acc` | The accumulator itself |
| `input` | Input neuron state variables (indexed by variable number) |
| `dend` | Dendrite state variables |
| `neuron` | Current neuron state variables |
| `spare` | Spare neuron state variables (used by WTA) |
| `random` | Random float [0, 1) |
| `chem` | Direct chemical concentration from the bloodstream |
| `chemSrcIdx` | Chemical indexed by source neuron ID |
| `chemDstIdx` | Chemical indexed by destination neuron ID |
| `zero` | Constant 0.0 |
| `one` | Constant 1.0 |
| `float` | Encoded float value (byte ÷ 248) |
| `negFloat` | Negated float value |
| `floatx10` | Float × 10 |
| `float÷10` | Float ÷ 10 |
| `int` | Integer value |

The ability to index chemicals by neuron ID is particularly powerful — it directly couples the brain's geometric layout to the biochemistry, allowing different neurons to read different chemicals based solely on their position within a lobe.

### Initialization vs. Update Rules

Both lobes and tracts define two SVRules:

- **Initialization Rule**: Executed once when a neuron or dendrite is first created, or when a migrating dendrite attaches to a new connection. Sets the baseline state.
- **Update Rule**: Executed on every brain tick. For neurons, this calculates the new State from Input, applies leakage, and computes Output. For dendrites, this manages synaptic weight dynamics.

### Reinforcement Learning via SVRules

The SVRule reward/punishment opcodes implement genuine reinforcement learning:

1. When a creature performs an action and the biochemistry generates a reward chemical (because a drive was reduced), the dendrite's Update SVRule detects this chemical via `setRewardChemicalIndex`
2. If the reward exceeds `setRewardThreshold`, the SVRule rapidly increases the dendrite's **Short-Term (ST) weight** at `setRewardRate`
3. Over subsequent ticks, the `setSTtoLTRate` opcode slowly "tends" the **Long-Term (LT) weight** toward the elevated ST weight
4. If the behaviour is repeated and reinforced, the LT weight solidifies — encoding a permanent memory
5. If punishment occurs instead, the ST weight collapses, preventing the LT memory from forming

This ST→LT convergence mechanism means the creature has both short-term working memory (recent experiences that might not be repeated) and long-term memory (solidified patterns reinforced over time).

---

## Tracts and Dendrites — Neural Wiring and Learning

> **Deep Dive:** For the complete dendrite migration algorithm, connectivity modes, ST/LT weight convergence formulas, and the reinforcement processing internals, see [Brain & SVRules Deep Dive — Tracts](brain_deep_dive.md#tracts--neural-wiring).

While lobes contain the computing neurons, communication between lobes is handled by **tracts** — genetically defined connections specifying a source lobe, a destination lobe, and neuron range mappings.

### Dendrites — Synaptic Connections

Within each tract, individual **dendrites** act as synapses between specific neurons. Like neurons, dendrites maintain 8 state variables:

| Index | Name | Description |
|---|---|---|
| 0 | WeightST | Short-term synaptic weight (recent learning) |
| 1 | WeightLT | Long-term synaptic weight (consolidated memory) |
| 2–6 | S2–S6 | Scratch variables for SVRule computations |
| 7 | Strength | How permanent the dendrite is (resistance to migration) |

### Dendrite Migration — True Neuroplasticity

The most profound feature of the brain is **dendrite migration**: loose or low-strength dendrites can physically detach from their current connection and migrate to attach to different neurons.

The mechanism uses the **Neural Growth Factor (NGF)**:

1. When a neuron in a destination lobe fires successfully and contributes to a rewarded action, its SVRule inflates its NGF state variable
2. During the brain tick, loose dendrites in connecting tracts scan the destination lobe geometrically
3. They migrate to attach to the neuron with the highest NGF concentration
4. Once attached, the dendrite's **Strength** variable increases as it successfully transmits signals
5. High Strength makes a dendrite permanent and resistant to further migration

Through this mechanism, an initially chaotic, semi-random brain physically rewires its connections based on experience. Successful stimulus→action pathways become hardwired; unsuccessful ones are pruned and their dendrites recycled to new connections. The creature's brain literally changes shape over its lifetime — embodying genuine unsupervised learning.

---

## The Stimulus System — Closing the Loop

The stimulus system is the final component that completes the biological feedback loop. It handles discrete events from the environment and translates them into chemical and neural impacts on the creature.

> **Deep Dive:** For the complete stimulus event table, the stimulus gene format, the reinforcement learning pipeline with synchronous learning, and a worked "learning to eat" example, see [Drives & Reinforcement Learning](drives_and_learning.md).

> **CAOS Reference:** Use [`STIM WRIT`](caos_messages.md) to send a stimulus to a specific creature, or [`STIM SHOU`/`STIM SIGN`/`STIM TACT`](caos_messages.md) to broadcast stimuli by hearing, sight, or touch. The [`URGE`](caos_messages.md) commands influence creature decision-making by suggesting specific actions. See [Script Events & Messages](caos_events.md) for how events fire stimuli.

### Built-in Stimuli

The engine defines approximately 98 built-in stimulus events, organized into functional categories:

| Category | Examples | Description |
|---|---|---|
| **Social** | Pat (user), Pat (creature), Slap (user), Slap (creature) | Interactions from the user's hand or other creatures |
| **Physical** | Bump, Impact, Falling | Collisions and physics events |
| **Language** | Gobbledygook, Pointer Word, Creature Word, Yes, No | Speech perception and communication |
| **Actions** | Quiescent, Activate, Approach, Get, Drop, Eat, Hit, Push, Rest, Sleep | Events emitted during creature actions |
| **Involuntary** | Invol 0–7 | Reflex actions (coughing, sneezing, shivering, etc.) |
| **Navigation** | Go Nowhere/In/Out/Up/Down/Left/Right | Spatial movement events |
| **Smell Peaks** | Reached Peak of Smell 0–19 | Creature has reached the local maximum of a smell gradient |
| **Object Interaction** | Eaten Plant/Fruit/Food/Animal, Play Bug, Activate Machine, etc. | Category-specific interaction results |

### The Stimulus Gene

How a creature reacts to each stimulus is defined genetically — not hardcoded. Each **Stimulus gene** specifies:

- **Stimulus ID**: Which of the ~99 built-in events this gene responds to
- **Neural impact**: Significance and intensity of the signal fired into the brain's `stim` lobe, plus noun/verb identification
- **Chemical adjustments**: Up to 4 chemicals injected into or removed from the bloodstream when this stimulus fires
- **Bit flags**:
  - `MODULATE` — stimulus intensity varies with event parameters (e.g., gentle pat vs. hard slap)
  - `IFASLEEP` — stimulus penetrates the sleep state (without this, sleeping creatures ignore the event)
  - `TRAINING_OFF_FOR_0–3` — suppress specific learning feedback loops during the interaction

### The Reinforcement Learning Loop

The stimulus system drives the continuous learning cycle:

1. **Action**: The brain's `decn` lobe outputs a decision (e.g., "eat food")
2. **Stimulus**: The engine fires the corresponding stimulus event (e.g., `STIM_EATEN_FOOD`)
3. **Chemical change**: The Stimulus gene injects chemicals — e.g., reducing hunger chemicals and adding nutrient chemicals
4. **Drive change**: Chemical receptors detect the drop in hunger drive chemicals
5. **Reward**: The drive reduction triggers a reward signal that propagates through the brain
6. **Learning**: Active dendrite SVRules capture the reward, strengthening the ST weights of the pathways that led to "eating food"
7. **Memory**: Over repeated experiences, ST weights converge to LT weights — the behaviour is learned

This loop runs continuously. Every action a creature takes generates stimuli that produce chemical changes that affect drives that generate reward or punishment signals that reshape the neural network. The creature is always learning, always adapting, always changing — a genuine digital organism navigating its world through biochemical reinforcement rather than programmed behaviour.

---

## Source References

This documentation is based on the actual Creatures 3 engine source code:

| Topic | Source Files |
|---|---|
| Life stages and drives | [CreatureConstants.h](../../engine/Creature/CreatureConstants.h) |
| Genome structure | [Genome.h](../../engine/Creature/Genome.h), [Genome.cpp](../../engine/Creature/Genome.cpp) |
| Chemical constants | [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h) |
| Organ system | [Organ.h](../../engine/Creature/Biochemistry/Organ.h), [Organ.cpp](../../engine/Creature/Biochemistry/Organ.cpp) |
| Receptor/Emitter loci | [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h) |
| Brain architecture | [Brain.h](../../engine/Creature/Brain/Brain.h), [Lobe.h](../../engine/Creature/Brain/Lobe.h) |
| SVRule system | [SVRule.h](../../engine/Creature/Brain/SVRule.h), [SVRule.cpp](../../engine/Creature/Brain/SVRule.cpp) |
| Tracts and dendrites | [Tract.h](../../engine/Creature/Brain/Tract.h), [Dendrite.h](../../engine/Creature/Brain/Dendrite.h) |
| Stimulus system | [Stimulus.h](../../engine/Stimulus.h), [Stimulus.cpp](../../engine/Stimulus.cpp) |
| Room system and CA | [Map.h](../../engine/Map/Map.h), [CARates.h](../../engine/Map/CARates.h) |
| Sensory faculty | [SensoryFaculty.h](../../engine/Creature/SensoryFaculty.h) |

### External References

- Grand, S. *Creation: Life and How to Make It*. Harvard University Press, 2001.
- Grand, S. et al. ["Artificial Life: Autonomous Software Agents for Home Entertainment"](https://www.sussex.ac.uk/informatics/cogslib/reports/csrp/csrp434.pdf). University of Sussex CSRP 434.
- Zucconi, A. ["The AI of Creatures"](https://www.alanzucconi.com/2020/07/27/the-ai-of-creatures/). 2020.
- [Creatures Wiki — Brain](https://creatures.fandom.com/wiki/Brain)
- [Creatures Wiki — Decision Lobe](https://creatures.fandom.com/wiki/Decision_lobe)
- [Creatures Wiki — Digital DNA](https://creatures.fandom.com/wiki/Digital_DNA)
- [Documented C3/DS SVRules — Creatures Caves Forum](https://www.creaturescaves.com/forum.php?view=12&thread=7608)
