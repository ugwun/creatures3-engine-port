# Biochemistry & The Chemical Simulation — Deep Dive

Every creature in Creatures 3 maintains an internal "bloodstream" — a **256-slot array of floating-point chemical concentrations** updated on every engine tick. This is not an abstract health bar system. It is a genuine chemistry simulation where chemicals interact through genetically-defined reactions, decay at individual half-life rates, and drive the creature's physiology through receptor and emitter bindings.

The biochemistry is arguably the most complex runtime system in the game, and the area where community knowledge has been most fragmented and lost. This document is the authoritative technical reference, derived directly from the engine source code.

> **Conceptual Overview:** For a high-level introduction to how biochemistry fits into the A-Life architecture, see [Game Philosophy & Overview](game_philosophy.md).

> **CAOS Commands:** Use [`CHEM`](caos_creatures.md) to read or adjust chemical concentrations. Use [`LOCI`](caos_creatures.md) to read or set biochemical locus values. Use [`ORGN`](caos_creatures.md), [`ORGF`](caos_creatures.md), and [`INJR`](caos_creatures.md) to inspect and damage organs. The [Creatures Tab](tab_creatures.md) shows live biochemistry in the developer tools.

> **Genome Reference:** For the binary gene format of biochemistry genes (Receptor, Emitter, Reaction, Half-Lives, Initial Concentration, Neuroemitter), see [The Digital Genome — Deep Dive](genome_deep_dive.md#type-1--biochemistry-genes-biochemistrygene).

> **Brain Reference:** The biochemistry system bridges to the neural network through NeuroEmitters (brain→chemistry) and SVRule `chem` operands (chemistry→brain). For the full brain architecture, neuron state variables, and the 69-opcode SVRule instruction set, see [Brain & SVRules Deep Dive](brain_deep_dive.md).

---

## Architecture Overview

The biochemistry system is structured as a hierarchy of classes within the engine:

```
┌──────────────────────────────────────────────────────────────┐
│                      Creature                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Biochemistry (Faculty #4)                 │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────┐          │  │
│  │  │  myChemicalConcs[256]  (the bloodstream) │          │  │
│  │  │  myChemicalDecayRates[256]               │          │  │
│  │  └──────────────────────────────────────────┘          │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │  │
│  │  │  Organ 0     │  │  Organ 1     │  │  Organ N    │   │  │
│  │  │  (body)      │  │  (stomach)   │  │  (liver)    │   │  │
│  │  │              │  │              │  │             │   │  │
│  │  │  Receptors[] │  │  Receptors[] │  │ Receptors[] │   │  │
│  │  │  Emitters[]  │  │  Emitters[]  │  │ Emitters[]  │   │  │
│  │  │  Reactions[] │  │  Reactions[] │  │ Reactions[] │   │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘   │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────┐              │  │
│  │  │  NeuroEmitters[128]                  │              │  │
│  │  │  (brain → bloodstream bridge)        │              │  │
│  │  └──────────────────────────────────────┘              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Source:** The main class is [Biochemistry](../../engine/Creature/Biochemistry/Biochemistry.h) — a `Faculty` (one of 9 faculties that compose a `Creature`). It owns all organs, neuroemitters, chemical concentrations, and decay rates.

The `Biochemistry` faculty is always faculty index **4** in the creature's faculty array, as established in the [Creature constructor](../../engine/Creature/Creature.cpp#L410).

---

## The Chemical Bloodstream

At the core of the system is a simple pair of arrays, defined in [Biochemistry.h](../../engine/Creature/Biochemistry/Biochemistry.h#L60-L61):

```cpp
float myChemicalConcs[NUMCHEM];      // 256 chemical concentrations (0.0–1.0)
float myChemicalDecayRates[NUMCHEM]; // 256 decay multipliers (applied per tick)
```

**Key constants** from [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h):

| Constant | Value | Description |
|---|---|---|
| `NUMCHEM` | 256 | Total number of chemical slots |
| `MAXORGANS` | 128 | Maximum organs per creature |
| `MAXRECEPTORS` | 128 | Maximum receptors per organ |
| `MAXEMITTERS` | 128 | Maximum emitters per organ |
| `MAXREACTIONS` | 128 | Maximum reactions per organ |
| `MAX_NEUROEMITTERS` | 128 | Maximum neuroemitters per creature |

All chemical concentrations are clamped to the range `[0.0, 1.0]` by the helper function `BoundIntoZeroOne()`, called by every operation that modifies concentrations:

```cpp
void Biochemistry::AddChemical(int chem, float amount) {
    if (chem)  // chemical 0 is "none" — always ignored
        myChemicalConcs[chem] = BoundIntoZeroOne(myChemicalConcs[chem] + amount);
}
```

Chemical **0** is reserved as "none" — all add/subtract operations on chemical 0 are silently ignored. This allows genes to specify "no chemical" for unused reaction slots.

---

## The Update Loop

Every engine tick, `Biochemistry::Update()` executes the complete simulation cycle. The code is in [Biochemistry.cpp](../../engine/Creature/Biochemistry/Biochemistry.cpp#L317-L349):

```
1. Update all NeuroEmitters (brain → chemistry)
2. Update all Organs (receptors, emitters, reactions)
3. Apply chemical decay (half-lives)
```

### Step 1 — NeuroEmitters

For each neuroemitter, the engine checks if its internal biotick has elapsed. If so, it reads three neuron activation values from the brain, multiplies them together, and injects up to four chemicals in proportion to the combined activation:

```cpp
float neuronInputsMultiplied = 1.0f;
for (o = 0; o < NeuroEmitter::noOfNeuronalInputs; o++) {
    neuronInputsMultiplied *= *(n->myNeuronalInputs[o]);
}
for (o = 0; o < NeuroEmitter::noOfChemicalEmissions; o++) {
    AddChemical(n->myChemicalEmissions[o].chemicalId,
                n->myChemicalEmissions[o].amount * neuronInputsMultiplied);
}
```

This multiplicative combination means **all three monitored neurons must fire simultaneously** for maximum chemical emission. If any one neuron is inactive (0.0), no chemical is emitted.

### Step 2 — Organs

Each organ's `Update()` is called in sequence. Organs process their own receptors, emitters, and reactions on their individual clock rates (see [The Organ System](#the-organ-system) below).

### Step 3 — Chemical Decay

After all active processing, every chemical decays according to its half-life:

```cpp
for (i = 0; i < NUMCHEM; i++)
    myChemicalConcs[i] *= myChemicalDecayRates[i];
```

The decay rate is a per-tick multiplier: a value of `0.99` means the chemical loses 1% per tick, while `1.0` means no decay (permanent). A value of `0.0` means instant decay — the chemical vanishes completely each tick.

> **Note:** Creatures update on every 4th engine tick (offset by their `myUpdateTickOffset`), not every single tick. This means creatures process biochemistry at ¼ the engine tick rate. See [Creature::Update()](../../engine/Creature/Creature.cpp#L201).

---

## The Complete Chemical ID Reference

The 256 chemical slots are organized into functional groups. While the engine processes them purely as interacting numerical concentrations, the game data assigns biological meaning. This table is sourced from the engine's internal structure and the [chemical name dictionary](../creatures.js#L9-L189) in the developer tools.

### Metabolic Chemicals (IDs 1–14)

| ID | Name | Function |
|---|---|---|
| 0 | *(none)* | Reserved — all operations on chemical 0 are ignored |
| 1 | Lactate | Metabolic byproduct |
| 2 | Pyruvate | Metabolic intermediate |
| 3 | Glucose | Primary energy source |
| 4 | **Glycogen** | Energy storage (`CHEM_GLYCOGEN`) — broken down to synthesize ATP |
| 5 | Starch | Plant-derived carbohydrate |
| 6 | Fatty Acid | Fat metabolism intermediate |
| 7 | Cholesterol | Fat metabolism product |
| 8 | Triglyceride | Fat storage |
| 9 | Adipose Tissue | Body fat |
| 10 | Fat | Dietary fat |
| 11 | Muscle Tissue | Structural protein |
| 12 | Protein | Dietary protein |
| 13 | Amino Acid | Protein building block |
| 14 | Triglyceride | Alternate triglyceride |

### Respiratory & Waste Chemicals (IDs 24–33)

| ID | Name | Function |
|---|---|---|
| 24 | Dissolved Carbon Dioxide | Respiratory waste |
| 25 | Urea | Metabolic waste |
| 26 | Ammonia | Protein catabolism byproduct |
| 27 | Antibody 3 | *(also mapped in immune range)* |
| 28 | Antibody 4 | *(also mapped in immune range)* |
| 29 | Air | Breathable atmosphere |
| 30 | Oxygen | Respiratory input |
| 31 | Antibody 7 | *(also mapped in immune range)* |
| 33 | Water | Hydration |

### Energy System (IDs 34–36)

| ID | Name | Function |
|---|---|---|
| 34 | Energy | General energy |
| **35** | **ATP** | Universal energy currency (`CHEM_ATP`). Every organ consumes ATP to function; insufficient ATP causes organ damage |
| **36** | **ADP** | ATP waste product (`CHEM_ADP`). Produced when organs consume energy |

> **The ATP/ADP Cycle:** This is the central metabolic loop. Glycogen (4) is broken down by reactions to produce ATP (35). Every organ that processes its reactions consumes ATP and produces ADP (36). If ATP runs out, organs cannot function and take damage. Reactions must recycle ADP back into ATP to keep the creature alive.

### Hormonal & Reproductive (IDs 39–54)

| ID | Name | Function |
|---|---|---|
| 39 | Arousal Potential | Sexual arousal buildup |
| 40 | Libido Lowerer | Post-mating refractory |
| 41 | Opposite Sex Pheromone | Triggers approach behavior to opposite sex |
| 46 | Oestrogen | Female sex hormone |
| 47 | Oestrogen | Female sex hormone (variant) |
| **48** | **Progesterone** | Regulates reproductive cycle; spikes during pregnancy (`CHEM_PROGESTERONE`) |
| 49 | Gonadotrophin | Stimulates reproductive organs |
| 53 | Testosterone | Male sex hormone |
| 54 | Inhibin | Reproductive feedback inhibitor |

### Medicinal & Enzymatic (IDs 50–51, 92–100, 112–119, 124–125)

| ID | Name | Function |
|---|---|---|
| 50 | EDTA | Chelating agent (treats heavy metal poisoning) |
| 51 | Sodium Thiosulphate | Detoxifying agent (treats cyanide) |
| 92 | Medicine One | General medicine |
| 93 | Anti-oxidant | Protects against oxidative damage |
| 94 | Prostaglandin | Anti-inflammatory |
| 95 | EDTA | Chelating agent |
| 96 | Sodium Thiosulphite | Detoxifying agent |
| 97 | Arnica | Herbal remedy (reduces injury) |
| 98 | Vitamin E | Antioxidant vitamin |
| 99 | Vitamin C | Immune support vitamin |
| 100 | Antihistamine | Treats allergic reactions |
| 112 | Anabolic Steroid | Muscle growth |
| 113 | Pistle | Creature Labs proprietary |
| 114 | Insulin | Glucose regulation |
| 115 | Glycolase | Glycogen metabolism enzyme |
| 116 | Dehydrogenase | Metabolic enzyme |
| 117 | Adrenalin | Fight-or-flight response |
| 118 | Grendel Nitrate | Species-specific toxin |
| 119 | Ettin Nitrate | Species-specific toxin |
| 124 | Activase | Metabolic activator |
| 125 | Life | Life force chemical |

### Toxins & Pathogens (IDs 56, 66–81)

| ID | Name | Function |
|---|---|---|
| 56 | Geddonase | Destructive enzyme |
| 66 | Heavy Metals | Accumulated toxin (treated by EDTA) |
| 67 | Cyanide | Lethal toxin (treated by Sodium Thiosulphate) |
| 68 | Belladonna | Poisonous alkaloid |
| 69 | Geddonase | Destructive enzyme |
| 70 | Glycotoxin | Disrupts glucose metabolism |
| 71 | Sleep Toxin | Induces forced sleep |
| 72 | Fever Toxin | Causes fever |
| 73 | Histamine A | Allergic reaction mediator |
| 74 | Histamine B | Allergic reaction mediator |
| 75 | Alcohol | Intoxicant |
| 78 | ATP Decoupler | Disrupts energy metabolism |
| 79 | Carbon Monoxide | Oxygen displacement toxin |
| 80 | Fear Toxin | Induces fear drive |
| 81 | Muscle Toxin | Impairs movement |

### Immune System — Antigens (IDs 82–89)

Antigens represent active infections. Each antigen corresponds to a specific pathogen type. The immune system must produce matching antibodies to fight them.

| ID | Name | Constant |
|---|---|---|
| 82 | Antigen 0 | `FIRST_ANTIGEN` |
| 83 | Antigen 1 | |
| 84 | Antigen 2 | |
| 85 | Antigen 3 | |
| 86 | Antigen 4 | |
| 87 | Antigen 5 | |
| 88 | Antigen 6 | |
| 89 | Antigen 7 | `LAST_ANTIGEN` |

### Immune System — Antibodies (IDs 102–109)

Antibodies are produced by the immune system's biochemical reactions in response to antigens. Each antibody targets the corresponding antigen (Antibody 0 fights Antigen 0, etc.).

| ID | Name |
|---|---|
| 102 | Antibody 0 |
| 103 | Antibody 1 |
| 104 | Antibody 2 |
| 105 | Antibody 3 |
| 106 | Antibody 4 |
| 107 | Antibody 5 |
| 108 | Antibody 6 |
| 109 | Antibody 7 |

### Injury & Stress (IDs 127–128, 187–195)

| ID | Name | Function |
|---|---|---|
| **127** | **Injury** | Tracks physical damage (`CHEM_INJURY`). Emitted when organs take damage; consumed during healing |
| 128 | Stress | General stress indicator |

**Stress chemicals** (IDs 187–195) track elevated drive levels for individual subsystems:

| ID | Stress Type |
|---|---|
| 187 | Stress (Hunger for Carb) |
| 188 | Stress (Hunger for Protein) |
| 189 | Stress (Hunger for Fat) |
| 190 | Stress (Anger) |
| 191 | Stress (Fear) |
| 192 | Stress (Pain) |
| 193 | Stress (Sleep) |
| 194 | Stress (Tired) |
| 195 | Stress (Crowded) |

### Drive Backup Chemicals (IDs 131–145)

Each of the 15 primary drives (indices 0–14) has a "backup" chemical that stores the previous drive level, enabling the engine to detect drive *changes* (deltas) for reinforcement learning:

| ID | Backup For |
|---|---|
| 131 | Pain |
| 132 | Hunger for Protein |
| 133 | Hunger for Carbohydrate |
| 134 | Hunger for Fat |
| 135 | Coldness |
| 136 | Hotness |
| 137 | Tiredness |
| 138 | Sleepiness |
| 139 | Loneliness |
| 140 | Crowdedness |
| 141 | Fear |
| 142 | Boredom |
| 143 | Anger |
| 144 | Sex Drive |
| 145 | Comfort |

### Drive Chemicals (IDs 148–167)

The 20 drive chemicals represent the creature's physiological urgencies — the drives that motivate behaviour. For the complete motivational pipeline — how these chemicals flow through receptor loci to the brain, how stimuli adjust them, and how adjustments trigger reinforcement learning — see [Drives & Reinforcement Learning](drives_and_learning.md). Defined in [CreatureConstants.h](../../engine/Creature/CreatureConstants.h#L56-L78):

| Drive # | Name | Chemical ID | Constant |
|---|---|---|---|
| 0 | Pain | 148 | `PAIN` |
| 1 | Hunger for Protein | 149 | `HUNGER_FOR_PROTEIN` |
| 2 | Hunger for Carbohydrate | 150 | `HUNGER_FOR_CARB` |
| 3 | Hunger for Fat | 151 | `HUNGER_FOR_FAT` |
| 4 | Coldness | 152 | `COLDNESS` |
| 5 | Hotness | 153 | `HOTNESS` |
| 6 | Tiredness | 154 | `TIREDNESS` / `CHEM_TIREDNESS` |
| 7 | Sleepiness | 155 | `SLEEPINESS` / `CHEM_SLEEPINESS` |
| 8 | Loneliness | 156 | `LONELINESS` |
| 9 | Crowdedness | 157 | `CROWDEDNESS` |
| 10 | Fear | 158 | `FEAR` |
| 11 | Boredom | 159 | `BOREDOM` |
| 12 | Anger | 160 | `ANGER` |
| 13 | Sex Drive | 161 | `SEXDRIVE` |
| 14 | Comfort | 162 | `COMFORT` |
| 15 | Up | 163 | `UP` |
| 16 | Down | 164 | `DOWN` |
| 17 | Exit | 165 | `EXIT` |
| 18 | Enter | 166 | `ENTER` |
| 19 | Wait | 167 | `WAIT` |

> The first 15 drives (Pain through Comfort, indices 0–14) are the traditional biological drives. Drives 15–19 (Up, Down, Exit, Enter, Wait) are navigational drives that motivate spatial movement through the world.

### Smell Chemicals (IDs 165–184)

Smell chemicals are written by the `SensoryFaculty` from the CA (Cellular Automata) values of the room the creature occupies. They allow creatures to follow chemical gradients across the room network. For the complete CA diffusion algorithm, navigable smell propagation, and the room-to-brain pipeline, see [The World Ecosystem — Deep Dive](world_ecosystem.md#the-smell-to-brain-pipeline).

| ID | Name | CA Property |
|---|---|---|
| 165 | CA Smell 0 | Sound |
| 166 | CA Smell 1 | Light |
| 167 | CA Smell 2 | Heat |
| 168 | CA Smell 3 | Water |
| 169 | CA Smell 4 | Nutrient |
| 170 | CA Smell 5 | Water (variant) |
| 171 | CA Smell 6 | Protein |
| 172 | CA Smell 7 | Carbohydrate |
| 173 | CA Smell 8 | Fat |
| 174 | CA Smell 9 | Flowers |
| 175 | CA Smell 10 | Machinery |
| 176 | CA Smell 11 | *(unassigned)* |
| 177 | CA Smell 12 | Norn scent |
| 178 | CA Smell 13 | Grendel scent |
| 179 | CA Smell 14 | Ettin scent |
| 180 | CA Smell 15 | Norn home |
| 181 | CA Smell 16 | Grendel home |
| 182 | CA Smell 17 | Ettin home |
| 183 | CA Smell 18 | *(unassigned)* |
| 184 | CA Smell 19 | *(unassigned)* |

The constant `FIRST_SMELL_CHEMICAL = 165` marks the start of this range.

> **Important — Drive/Smell Overlap:** Chemical IDs 165–167 are shared between the navigational drive chemicals (Exit=165, Enter=166, Wait=167) and the first 3 smell channels (Sound, Light, Heat). This is an intentional design: a single chemical concentration serves double duty as both a navigational drive and a CA smell property. This overlap means that environmental CA properties directly influence navigational drives — a creature can literally "smell" an exit.

### Brain Chemicals (IDs 198–213)

These chemicals are used by the brain's SVRule system for reinforcement learning and sleep cycling:

| ID | Name | Function |
|---|---|---|
| 198 | Brain Chemical 1 | SVRule processing |
| 199 | Up | Navigational drive (brain-side) |
| 200 | Down | Navigational drive (brain-side) |
| 201 | Exit | Navigational drive (brain-side) |
| 202 | Enter | Navigational drive (brain-side) |
| 203 | Wait | Navigational drive (brain-side) |
| **204** | **Reward** | Positive reinforcement signal — strengthens active synaptic weights |
| **205** | **Punishment** | Negative reinforcement signal — weakens active synaptic weights |
| 206–211 | Brain Chemical 9–14 | SVRule processing |
| 212 | Pre-REM Sleep | Sleep cycle transition |
| 213 | REM Sleep | Deep sleep phase |

### Additional Chemicals

| ID | Name | Function |
|---|---|---|
| 15–16 | *(unassigned)* | Available for genome use |
| 17 | Downatrophin | Reduces down-drive |
| 18 | Upatrophin | Reduces up-drive |
| 129 | Sleepase | Sleep-inducing enzyme |
| 247 | Alcohol | Alternate alcohol entry |
| 248 | Defibrillator | Emergency cardiac intervention |
| 249 | Medicine One | Alternate medicine |
| 250 | Medicine Two | Second-line treatment |
| 251 | Medicine Three | Third-line treatment |
| 252 | Arnica | Alternate herbal remedy |
| 253 | Vitamin E | Alternate vitamin |
| 254 | Vitamin C | Alternate vitamin |
| 255 | Drowsiness | Sleep-related |

### The STIM-to-Biochem Offset

The stimulus system uses a different numbering scheme from the biochemistry. The constant `STIMTOBIOCHEMOFFSET = 148` maps between them, as explained in [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h#L5-L15):

```
Chemical 0       = Stim chemical 255   (wraps around)
Chemicals 148–255 = Stim chemicals 0–107
Chemicals 1–147   = Stim chemicals 108–254
```

This offset ensures that stimulus chemical 0 maps to biochemistry chemical 148 — the first drive chemical (Pain). This is why the stimulus system directly targets drive chemicals for reinforcement learning.

---

## The Organ System

Creatures possess multiple internal **organs** (up to 128), each defined by an Organ gene. Every organ is an independent biological engine with its own clock, health, and a collection of receptors, emitters, and reactions.

**Source:** [Organ.h](../../engine/Creature/Biochemistry/Organ.h) and [Organ.cpp](../../engine/Creature/Biochemistry/Organ.cpp).

### The Implicit "Body" Organ

The first organ (organ 0) is always created implicitly during embryogenesis, even if no Organ gene exists. It gathers all biochemistry genes (receptors, emitters, reactions) that appear *before* the first explicit Organ gene in the genome. This is the creature's "body" — a default organ that handles fundamental biochemistry. See [Biochemistry::ReadFromGenome()](../../engine/Creature/Biochemistry/Biochemistry.cpp#L247-L258).

### Organ Properties

Each organ maintains several genetically-defined properties:

| Property | Source | Description |
|---|---|---|
| `loc_ClockRate` | Organ gene | How frequently the organ activates. A rate of 0.5 means the organ processes every 2 ticks |
| `myInitialLifeForce` | `loc_LifeForce × myBaseLifeForce` | Total structural integrity at birth. `myBaseLifeForce = 1,000,000` |
| `myShortTermLifeForce` | Dynamic | Current health — reduced by injury, partially restored by repair |
| `myLongTermLifeForce` | Dynamic | Irreversible damage tracker — trends slowly toward `myShortTermLifeForce` but is NOT restored by healing |
| `myLongTermRateOfRepair` | Organ gene | How quickly the organ can heal (rate of ST→LT convergence) |
| `myEnergyCost` | Computed | ATP cost per activation = `0.0078 + (receptors + emitters + reactions) / 2550` |
| `myDamageDueToZeroEnergy` | Organ gene | Damage inflicted when the organ cannot get ATP |

### The Organ Update Cycle

On every biochemistry tick, each organ's [Update()](../../engine/Creature/Biochemistry/Organ.cpp#L408-L455) follows this sequence:

```
1. Check if organ has failed (myLongTermLifeForce ≤ 0.5)
   → If failed, do nothing — organ is dead

2. Advance internal clock by loc_ClockRate
   → If clock < 1.0, process only clock-rate receptors, then return
   → If clock ≥ 1.0, subtract 1.0 and do full processing:

3. Consume Energy (ATP → ADP)
   → If ATP available: consume myEnergyCost, produce ADP
   → If ATP unavailable: inflict myDamageDueToZeroEnergy as injury

4. Process Emitters (read loci → emit chemicals)
5. Process Reactions (transform chemicals)
6. Repair Injury (ST ← LT convergence)
7. Process Applied Injury (from loc_InjuryToApply receptor)
8. Process All Receptors (chemical → locus modulation)
9. Decay Life Force (natural aging of the organ)
```

### Energy Metabolism — The ATP Cycle

The ATP consumption logic is in [Organ::ConsumeEnergy()](../../engine/Creature/Biochemistry/Organ.cpp#L759-L770):

```cpp
bool Organ::ConsumeEnergy() {
    if (myBiochemistryOwner->GetChemical(CHEM_ATP) >= myEnergyCost) {
        myBiochemistryOwner->SubChemical(CHEM_ATP, myEnergyCost);
        myBiochemistryOwner->AddChemical(CHEM_ADP, myEnergyCost);
        return true;   // energy available
    }
    return false;  // starving — organ will take damage
}
```

This creates the fundamental metabolic pressure: creatures must continuously break down food chemicals into ATP to keep their organs running. If ATP runs out, organs take damage proportional to `myDamageDueToZeroEnergy`, eventually failing entirely.

### Organ Damage & Repair

Organ health uses a **dual-track** system:

- **Short-Term Life Force (`myShortTermLifeForce`)** — fluctuates with injury and repair. Can be healed.
- **Long-Term Life Force (`myLongTermLifeForce`)** — slowly trends toward the short-term value but is **never healed**. Represents permanent, irreversible aging damage.

When an organ is injured ([Organ::Injure()](../../engine/Creature/Biochemistry/Organ.cpp#L462-L471)):

```cpp
void Organ::Injure(float damage) {
    myShortTermLifeForce = BoundedSub(myShortTermLifeForce, damage);
    loc_LifeForce = myShortTermLifeForce / myInitialLifeForce;
    myBiochemistryOwner->AddChemical(CHEM_INJURY, LF_TO_LOC(damage));
}
```

Injury reduces the short-term life force and emits the **Injury chemical** (127) into the bloodstream — making the creature "feel" the damage.

Repair ([RepairInjury()](../../engine/Creature/Biochemistry/Organ.cpp#L486-L508)) works through a moving average:
- The long-term life force **always** degrades toward the short-term (irreversible damage)
- If energy is available, the short-term life force is repaired toward the long-term value
- The Injury chemical is consumed during repair

An organ **fails** when `myLongTermLifeForce ≤ 0.5` (`myMinLifeForce`). A failed organ performs no processing — all its reactions, receptors, and emitters stop. This is catastrophic if it's a vital organ like the stomach or liver.

Natural decay occurs at a rate of `myRateOfDecay = 1.0e-5` per activation, meaning organs very slowly degrade even without injury — creatures age.

### Organ Failure Cascade

Failed organs create a dangerous feedback loop:
1. Organ fails → its reactions stop processing
2. Critical metabolic reactions stop → ATP production drops
3. Other organs can't get ATP → they start taking damage
4. More organs fail → cascade

This is how creatures die of "natural causes" — accumulated organ damage from aging, disease, or starvation eventually triggers a cascade of organ failures.

---

## Chemical Receptors

**Receptors** are the input side of the biochemistry: they monitor chemical concentrations in the bloodstream and convert them into physiological effects by modulating internal **loci**.

**Source:** [Receptor.h](../../engine/Creature/Biochemistry/Receptor.h) and the processing logic in [Organ::ProcessReceptors()](../../engine/Creature/Biochemistry/Organ.cpp#L623-L694).

### Receptor Structure

Each receptor is defined by a gene and contains:

| Field | Type | Description |
|---|---|---|
| `IDOrgan` | int | Which organ it binds to (0=Brain, 1=Creature, 2=Organ, 3=Reaction) |
| `IDTissue` | int | Tissue within that organ (e.g., Somatic, Circulatory, Drives) |
| `IDLocus` | int | Specific locus within the tissue |
| `Chem` | int | Chemical ID to monitor (0 = unused) |
| `Threshold` | float | Minimum concentration before the receptor activates |
| `Nominal` | float | Baseline signal value |
| `Gain` | float | Amplification factor |
| `Effect` | int | Flags: `RE_REDUCE` (subtract from nominal), `RE_DIGITAL` (on/off response) |
| `Dest` | float* | Resolved pointer to the actual locus in memory |

### Receptor Processing Algorithm

Receptors that share the same locus are grouped together and processed as a unit. The algorithm in [ProcessReceptors()](../../engine/Creature/Biochemistry/Organ.cpp#L623-L694):

1. **For each group of receptors sharing a locus:**
2. Sum the nominals of all active receptors → `totalOfAllNominals`
3. For each receptor in the group:
   - Read `inputSignal = GetChemical(Chem) - Threshold`
   - Clamp to zero if below threshold
   - If `RE_DIGITAL`: `inputSignal = Gain` (all-or-nothing)
   - If analogue: `inputSignal *= Gain` (proportional)
   - If `RE_REDUCE`: accumulate into `termToSubSoFar`
   - Else: accumulate into `termToAddSoFar`
4. Compute `result = average(nominals) + average(addTerms) - average(subTerms)`
5. Write result to the shared locus: `*Dest = result`

**Special case — Death:** For the `LOC_DIE` locus (Creature → Immune → Die), the calculation uses an OR-like formula instead of averaging: if the net signal is positive, the result is 1.0 (die), otherwise 0.0 (live). This means any single receptor reaching its threshold can trigger death.

### Receptor Flags

| Flag | Value | Effect |
|---|---|---|
| `RE_REDUCE` | 1 | Chemical **reduces** the nominal signal instead of raising it |
| `RE_DIGITAL` | 2 | Response is binary: if chemical > threshold, output = Gain regardless of actual concentration |

---

## Chemical Emitters

**Emitters** are the output side: they monitor internal loci and excrete chemicals into the bloodstream when conditions are met.

**Source:** [Emitter.h](../../engine/Creature/Biochemistry/Emitter.h) and the processing logic in [Organ::ProcessAll()](../../engine/Creature/Biochemistry/Organ.cpp#L576-L620).

### Emitter Structure

| Field | Type | Description |
|---|---|---|
| `IDOrgan` | int | Source organ |
| `IDTissue` | int | Source tissue |
| `IDLocus` | int | Source locus |
| `Chem` | int | Chemical ID to emit |
| `Threshold` | float | Minimum locus value before emission begins |
| `bioTickRate` | float | Sampling frequency (1/rate from genome) |
| `Gain` | float | How much chemical per unit of locus signal |
| `Effect` | int | Flags: `EM_REMOVE`, `EM_DIGITAL`, `EM_INVERT` |
| `Source` | float* | Resolved pointer to the source locus |

### Emitter Processing

```cpp
sig = (e->Effect & EM_INVERT) ? 1.0f - *e->Source : *e->Source;
// ... check biotick timing ...
if (sig) {
    if ((conc = sig - e->Threshold) > 0) {
        if (e->Effect & EM_DIGITAL)
            AddChemical(e->Chem, e->Gain);       // fixed emission
        else
            AddChemical(e->Chem, conc * e->Gain); // proportional emission
        if (e->Effect & EM_REMOVE)
            *e->Source = 0;                        // clear locus after reading
    }
}
```

### Emitter Flags

| Flag | Value | Effect |
|---|---|---|
| `EM_REMOVE` | 1 | Zero the source locus after emission — enables short chemical bursts |
| `EM_DIGITAL` | 2 | Output = Gain value if signal > threshold, regardless of signal magnitude |
| `EM_INVERT` | 4 | Invert the locus value (`1.0 - value`) before computing output. Saves having to define both "I am hot" and "I am cold" loci |

---

## Chemical Reactions

**Reactions** transform reactant chemicals into product chemicals, simulating metabolic processes like digestion, detoxification, and energy production.

**Source:** [Reaction.h](../../engine/Creature/Biochemistry/Reaction.h) and [Organ::ProcessReaction()](../../engine/Creature/Biochemistry/Organ.cpp#L699-L739).

### Reaction Structure

Every reaction has the form:

```
n₁ R₁ + n₂ R₂ ──rate──→ n₃ P₁ + n₄ P₂
```

Where R₁, R₂ are reactant chemicals, P₁, P₂ are product chemicals, n₁–n₄ are proportions, and rate controls how much reacts per tick.

| Field | Type | Description |
|---|---|---|
| `propR1` | float | Proportion of reactant 1 |
| `R1` | int | Reactant 1 chemical ID (0 = none) |
| `propR2` | float | Proportion of reactant 2 |
| `R2` | int | Reactant 2 chemical ID (0 = none) |
| `Rate` | float | Reaction rate (0 = slow, 1 = fast). **Note:** The genome encodes this inverted (genome 0 = fast, 255 = slow); the engine stores `1.0 - genomeFloat` |
| `propP1` | float | Proportion of product 1 |
| `P1` | int | Product 1 chemical ID (0 = none) |
| `propP2` | float | Proportion of product 2 |
| `P2` | int | Product 2 chemical ID (0 = none) |

### Reaction Rate Computation

The `Rate` field stored in the reaction is `1.0 - genomeFloat`, because the genome encodes rate as "0 = fast, 1.0 = slow" (genome byte 0 means fast reaction, byte 255 means slow reaction). The engine inverts this on load so that the stored `Rate` field is 0 = slow, 1 = fast. The actual per-tick reaction rate is then computed using an exponential half-life formula:

```cpp
float inputFloat = (1.0f - rn->Rate) * 32.0f;
float halfLifeInTicks = powf(2.2f, inputFloat);
float rate = 1.0f - powf(0.5f, 1.0f / halfLifeInTicks);
```

This produces a rate from 0 (nothing reacts) to ~1 (everything reacts instantly). The same formula is used for [chemical half-lives](#half-lives).

### Reaction Processing Algorithm

From [ProcessReaction()](../../engine/Creature/Biochemistry/Organ.cpp#L699-L739):

1. Calculate available moles of each reactant: `avail1 = Conc(R1) / propR1`, `avail2 = Conc(R2) / propR2`
2. The limiting reactant determines the reaction scale: `avail = min(avail1, avail2)`
3. Apply the rate: `avail *= rate`
4. Consume reactants: `SubChemical(R1, avail × propR1)`, `SubChemical(R2, avail × propR2)`
5. Produce products: `AddChemical(P1, avail × propP1)`, `AddChemical(P2, avail × propP2)`

### Reaction Patterns

The [Reaction.h](../../engine/Creature/Biochemistry/Reaction.h) header documents the available reaction styles:

| Pattern | Form | Description |
|---|---|---|
| Transmutation | A → B | Exponential conversion |
| Decay | A → nothing | Chemical elimination |
| Amplification | A → 2A | Self-catalysing growth |
| Combination | A + B → C | Two inputs, one output |
| Full reaction | A + B → C + D | Two inputs, two outputs |
| Enzyme | A + B → A + C | A is conserved but required (catalyst) |
| Generation | A → A + B | Produces B in response to A's presence |
| Constant production | nothing → A | Produces A at a constant rate (~16 moles/n ticks) |

> **Enzyme-like reactions** are particularly important: `A + B → A + C` means chemical A acts as a catalyst — it is required for the reaction but not consumed. This allows the genome to create metabolic pathways that only function when a specific enzyme chemical is present.

---

## NeuroEmitters — Brain-to-Chemistry Bridge

**NeuroEmitters** bridge the neural network and the biochemical bloodstream. They monitor neuron firing patterns in the brain and convert neural activity into chemical injections. For the brain architecture that produces these neuron activations — lobes, tracts, SVRules, and neuron state variables — see [Brain & SVRules Deep Dive](brain_deep_dive.md).

**Source:** [NeuroEmitter.h](../../engine/Creature/Biochemistry/NeuroEmitter.h) and the update logic in [Biochemistry::Update()](../../engine/Creature/Biochemistry/Biochemistry.cpp#L321-L338).

### NeuroEmitter Structure

| Field | Description |
|---|---|
| `myNeuronalInputs[3]` | Pointers to 3 neuron state variables in the brain |
| `bioTickRate` | Sampling frequency |
| `myChemicalEmissions[4]` | Up to 4 chemical/amount pairs to emit |

### How NeuroEmitters Work

1. The 3 monitored neuron activations are **multiplied together** (not summed)
2. The product is used as a scaling factor for 4 chemical emissions
3. All 3 neurons must be active for maximum emission; any one being zero produces no output

This multiplicative design means neuroemitters function as **coincidence detectors**: they only emit chemicals when a specific combination of brain regions is simultaneously active. For example, a neuroemitter could be wired to detect when the creature is both paying attention to food (attention lobe) and performing the eat action (decision lobe), emitting a satisfaction chemical only when both conditions are met.

### Gene Expression and Replacement

During genome expression, neuroemitters are processed uniquely. If a later-switching gene specifies the same 3 neuronal loci as an existing neuroemitter, **it replaces the existing one** rather than adding a duplicate. This allows life-stage genes to alter the chemicals emitted by the same brain pattern as the creature ages. See [Biochemistry::ReadFromGenome()](../../engine/Creature/Biochemistry/Biochemistry.cpp#L162-L208).

---

## Half-Lives — Chemical Decay

Every chemical has a genetically-defined **half-life** that determines how quickly it naturally decays in the absence of reactions. A single Half-Lives gene contains 256 bytes — one per chemical.

The genome-to-decay-rate conversion in [Biochemistry::ReadFromGenome()](../../engine/Creature/Biochemistry/Biochemistry.cpp#L212-L229):

```cpp
float inputFloat = genome.GetFloat() * 32.0f;
if (inputFloat == 0.0f) {
    myChemicalDecayRates[c] = 0.0f;          // instant decay
} else {
    float halfLifeInTicks = pow(2.2f, inputFloat);
    myChemicalDecayRates[c] = pow(0.5f, 1.0f / halfLifeInTicks);
}
```

| Genome Byte | `GetFloat()` | `inputFloat` | Half-Life (ticks) | Per-Tick Multiplier | Effect |
|---|---|---|---|---|---|
| 0 | 0.0 | 0.0 | — | 0.0 | Chemical vanishes instantly each tick |
| ~8 | 0.031 | 1.0 | ~2 | ~0.707 | Very fast decay |
| ~32 | 0.125 | 4.0 | ~23 | ~0.970 | Fast decay |
| ~128 | 0.502 | 16.1 | ~86,000 | ~0.999992 | Very slow decay (near-permanent) |
| 255 | 1.0 | 32.0 | ~1.7 billion | ~1.0 | Essentially permanent |

The decay rate is a **per-tick multiplier** applied at the end of every biochemistry update. A rate of `0.99` means the chemical retains 99% of its concentration each tick, producing exponential decay that smoothly approaches zero.

This creates natural **homeostasis**: chemicals introduced by stimuli, reactions, or emitters will naturally dissipate unless continuously replenished. Drive chemicals decay, meaning the creature's motivations fade over time unless the underlying conditions persist.

---

## Initial Concentrations

**Initial Concentration genes** (`G_INJECT`, Biochemistry subtype 4) inject specific starting amounts of chemicals into the creature's bloodstream during embryogenesis. Each gene specifies one chemical ID and one starting amount.

From [Biochemistry::ReadFromGenome()](../../engine/Creature/Biochemistry/Biochemistry.cpp#L237-L241):

```cpp
c = genome.GetByte();                       // chemical ID
myChemicalConcs[c] = genome.GetFloat();     // starting concentration (0.0–1.0)
```

Late-switching Initial Concentration genes **reset** the chemical to the new value when they activate at a later life stage — this was a design decision from C2e that allows aging to alter the creature's baseline chemistry. The original C2 behaviour (where aging did NOT reset concentrations) was considered incorrect by the original developers, as noted in the source comment.

---

## The Locus System — Binding Everything Together

The **locus system** is the addressing mechanism that connects the abstract world of receptor/emitter genes to the concrete world of engine variables. Every receptor and emitter specifies a 4-part address: `(type, organ, tissue, locus)` that identifies exactly which internal variable it reads from or writes to.

### Locus Resolution Chain

When an organ binds its receptors and emitters during initialization ([Organ::BindToLoci()](../../engine/Creature/Biochemistry/Organ.cpp#L78-L101)), each gene's address is resolved to a `float*` pointer:

```
Organ::GetLocusAddress(type, organ, tissue, locus)
  ├── organ == ORGAN_ORGAN (2)
  │     → Internal organ locus (clock rate, life force, repair rate, injury)
  ├── organ == ORGAN_REACTION (3)
  │     → Reaction rate locus (&myReactions[tissue].Rate)
  └── default
        → Biochemistry::GetCreatureLocusAddress(type, organ, tissue, locus)
              → Creature::GetLocusAddress(type, organ, tissue, locus)
                    ├── Query all 9 Faculties (Brain, Sensory, Motor, etc.)
                    └── Handle ORGAN_CREATURE loci directly
```

### Organ IDs (The "Organ" Field)

From the [OrganIDs](../../engine/Creature/Biochemistry/BiochemistryConstants.h#L64-L74) enum:

| ID | Name | Description |
|---|---|---|
| 0 | `ORGAN_BRAIN` | Brain lobes — tissue = lobe ID, locus = neuron state variable |
| 1 | `ORGAN_CREATURE` | Creature-level loci organized by tissue type |
| 2 | `ORGAN_ORGAN` | Internal organ loci (clock rate, life force, repair rate) |
| 3 | `ORGAN_REACTION` | Reaction rate modulation (tissue = reaction index) |

### Creature Tissue IDs

When `organ == ORGAN_CREATURE`, the `tissue` field selects a subsystem. From the [CreatureTissueIDs](../../engine/Creature/Biochemistry/BiochemistryConstants.h#L76-L86) enum:

| ID | Name | Description |
|---|---|---|
| 0 | `TISSUE_SOMATIC` | Body, appearance, muscles |
| 1 | `TISSUE_CIRCULATORY` | 32 floating loci (shared receptor/emitter) |
| 2 | `TISSUE_REPRODUCTIVE` | Sex, pregnancy, ovulation |
| 3 | `TISSUE_IMMUNE` | Disease resistance, death trigger |
| 4 | `TISSUE_SENSORIMOTOR` | Environmental sensing, involuntary actions, gaits |
| 5 | `TISSUE_DRIVES` | The 20 drive loci |

### Receptor Locus Reference

Complete receptor locus mapping from [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h#L197-L273) and [BiochemistryConstants.cpp](../../engine/Creature/Biochemistry/BiochemistryConstants.cpp#L7-L90):

| Organ | Tissue | Locus | Name | Description |
|---|---|---|---|---|
| Brain | Lobe ID | 0–3 | Neuron N, State 0–3 | Neuron state variables (4 per neuron) |
| Creature | 0 Somatic | 0–6 | Age 0–6 | Aging triggers: activate to advance life stage |
| Creature | 1 Circulatory | 0–31 | Floating 0–31 | Dual-purpose loci (both receptor and emitter) |
| Creature | 2 Reproductive | 0 | Ovulate | Controls gamete production |
| Creature | 2 Reproductive | 1 | Receptive | Female receptivity to mating |
| Creature | 2 Reproductive | 2 | ChanceOfMutation | Heritable mutation rate |
| Creature | 2 Reproductive | 3 | DegreeOfMutation | Heritable mutation magnitude |
| Creature | 3 Immune | 0 | Die | If > 0, creature dies |
| Creature | 4 Sensorimotor | 0–7 | Involuntary 0–7 | Trigger: flinch, lay egg, sneeze, cough, shiver, sleep, faint, drown |
| Creature | 4 Sensorimotor | 8–24 | Gait 0–16 | Trigger walking gaits |
| Creature | 5 Drives | 0–19 | Drive 0–19 | Drive chemical → brain bridge |
| Organ | — | 0 | Clock Rate | Modulate organ processing speed |
| Organ | — | 1 | Rate of Repair | Modulate organ healing rate |
| Organ | — | 2 | Injury | Apply damage to the organ |
| Reaction | Reaction # | 0 | Rate | Modulate a specific reaction's rate |

### Emitter Locus Reference

Complete emitter locus mapping from [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h#L133-L192) and [BiochemistryConstants.cpp](../../engine/Creature/Biochemistry/BiochemistryConstants.cpp#L93-L161):

| Organ | Tissue | Locus | Name | Description |
|---|---|---|---|---|
| Brain | Lobe ID | 0–3 | Neuron N, State 0–3 | Neuron state variables |
| Creature | 0 Somatic | 0 | Muscles | Energy expended on movement this tick |
| Creature | 1 Circulatory | 0–31 | Floating 0–31 | Dual-purpose loci |
| Creature | 2 Reproductive | 0 | Fertile | Has a gamete available |
| Creature | 2 Reproductive | 1 | Pregnant | Female has both egg and sperm |
| Creature | 2 Reproductive | 2 | Ovulate | Gamete production state |
| Creature | 2 Reproductive | 3 | Receptive | Receptivity state |
| Creature | 2 Reproductive | 4 | Chance of Mutation | Current mutation chance |
| Creature | 2 Reproductive | 5 | Degree of Mutation | Current mutation degree |
| Creature | 3 Immune | 0 | Dead | > 0 if creature is dead |
| Creature | 4 Sensorimotor | 0 | **Constant** | Always 1.0 — enables regular timed emission |
| Creature | 4 Sensorimotor | 1 | Asleep | 1.0 if asleep, 0.0 otherwise |
| Creature | 4 Sensorimotor | 2 | Coldness | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 3 | Hotness | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 4 | Light Level | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 5 | Crowdedness | How many/close others of your kind |
| Creature | 4 Sensorimotor | 6 | Radiation | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 7 | Time of Day | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 8 | Season | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 9 | Air Quality | 0.0 for air, 1.0 for water |
| Creature | 4 Sensorimotor | 10 | Up Slope | Steepness of slope facing creature |
| Creature | 4 Sensorimotor | 11 | Down Slope | Steepness of slope behind creature |
| Creature | 4 Sensorimotor | 12 | Head Wind | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 13 | Tail Wind | *(DEPRECATED)* |
| Creature | 4 Sensorimotor | 14–21 | Involuntary 0–7 | Trigger involuntary actions |
| Creature | 4 Sensorimotor | 22–38 | Gait 0–16 | Trigger walking gaits |
| Creature | 5 Drives | 0–19 | Drive 0–19 | Drive chemical emission |
| Organ | — | 0 | Clock Rate | Emit organ's current processing speed |
| Organ | — | 1 | Rate of Repair | Emit organ's current repair rate |
| Organ | — | 2 | Life Force | Emit organ's current health |

> **The Constant Locus (`LOC_CONST`):** This emitter locus is always 1.0. By attaching an emitter to it, genome designers can create a chemical that is continuously produced at a fixed rate — useful for baseline metabolic chemicals. The creature sets `myConstantLocus = 1.0f` during [Init()](../../engine/Creature/Creature.cpp#L364).

> **The Floating Loci (0–31):** These 32 loci serve as general-purpose registers that can have both a receptor AND an emitter attached to the same address. This allows complex chemical feedback loops: "produce chemical B when chemical A exceeds threshold" — something reactions alone cannot handle, because reactions can't apply thresholds.

### Locus Resolution for Sensory Loci

Several emitter loci read environmental data from the game world, not from the chemistry:

- **Air Quality** (`LOC_AIRQUALITY`): Set in [Creature::Update()](../../engine/Creature/Creature.cpp#L218-L227) — reads the room type at the creature's head position. Water rooms (types 8, 9) set this to 0.0; normal rooms set it to 1.0.
- **Crowdedness** (`LOC_CROWDEDNESS`): Set in [Creature::Update()](../../engine/Creature/Creature.cpp#L230-L234) — reads the creature presence CA property from the room system.
- **Slope** (`LOC_UPSLOPE`, `LOC_DOWNSLOPE`): Set during movement processing.

These are resolved in [Creature::GetLocusAddress()](../../engine/Creature/Creature.cpp#L602-L676).

> **Note:** Several additional sensory loci defined in `BiochemistryConstants.h` (LOC_COLDNESS, LOC_HOTNESS, LOC_LIGHTLEVEL, LOC_RADIATION, LOC_TIMEOFDAY, LOC_SEASON, LOC_HEADWIND, LOC_TAILWIND) are **not wired** in the C3/DS engine. Creatures actually sense temperature, light, and radiation through the **smell chemical pipeline** — the SensoryFaculty reads CA values from the room and writes them to chemicals 165–184. For the complete environmental sensing architecture, see [The World Ecosystem — Sensorimotor Emitter Loci](world_ecosystem.md#sensorimotor-emitter-loci).

---

## Worked Example: How Digestion Works

To illustrate how these systems interact, here's a complete trace of what happens when a creature eats food:

1. **Creature eats a food agent** → the agent's eat script fires a stimulus (`STIM WRIT`)
2. **Stimulus gene activates** → injects Starch (5) and other nutrient chemicals into the bloodstream
3. **Stomach organ's reactions process:**
   - `Starch + Glycolase → Glucose + ∅` (enzyme-catalysed breakdown)
   - `Glucose + ∅ → Glycogen + ∅` (storage)
   - `Glycogen + Dehydrogenase → ATP + ADP` (energy production)
4. **Drive receptor detects** dropping Hunger for Carbohydrate chemical
5. **Drive locus value decreases** → injected into brain's drive lobe
6. **Drive reduction triggers reward** → Reward chemical (204) enters bloodstream
7. **Brain's SVRules detect reward** → strengthen the dendrite weights that led to the "eat" decision
8. **Creature learns:** eating reduces hunger

Each step involves a different component: stimulus genes, reaction genes, receptor genes, emitter genes, and the brain's SVRule system — all working together through the shared chemical bloodstream.

---

## Inspecting Biochemistry with Developer Tools

### Creatures Tab — Chemistry View

The [Creatures Tab](tab_creatures.md) Chemistry sub-tab displays all 256 chemical concentrations as colour-coded bars, sorted by value for quick identification. Chemicals are categorized by colour:

- **Purple** — Drive chemicals (148–164)
- **Red** — Antigens (82–89), Injury (127)
- **Orange** — Antibodies (24–31)
- **Green** — Smell chemicals (165–184)
- **Gold** — ATP (35)
- **Blue** — All other chemicals

Use the **Non-zero only** toggle to filter out inactive chemicals and focus on what's actually happening in the creature's bloodstream.

### Creatures Tab — Organs View

The [Organs sub-tab](tab_creatures.md) lists all organs as expandable cards showing health bars, status badges, and component counts. Click to expand and view:

- **Reactions** with chemical formulas and rate bars
- **Receptors** with locus bindings and thresholds
- **Emitters** with source loci and gain values

### Syringe Tool

The Chemistry syringe tool allows you to inject or extract specific chemicals directly into a creature's bloodstream for testing. Select a chemical, set a dosage (−1.0 to +1.0), and inject.

### CAOS Commands

| Command | Description |
|---|---|
| `chem <chemId>` | Read current concentration of a chemical (float 0.0–1.0) |
| `chem <chemId> <amount>` | Set chemical concentration directly |
| `driv <driveNum>` | Read a drive level |
| `drv!` | Returns the creature's highest current drive index |
| `loci <type> <organ> <tissue> <locus>` | Read a locus value |
| `loci <type> <organ> <tissue> <locus> <value>` | Set a locus value |
| `orgn <organNum>` | Returns organ count or a specific organ's health |
| `orgf <organNum>` | Returns whether an organ has failed |
| `injr <organNum> <amount>` | Inflict damage on a specific organ |

### MCP Tools

The [MCP server](../mcp/MCP.md) provides:

| Tool | Description |
|---|---|
| `get_creature_chemistry` | All 256 chemical concentrations + organ health for a creature |
| `snapshot_all_creatures` | Bulk dump including top 5 chemicals for each creature |

---

## Source References

| Topic | Source Files |
|---|---|
| Biochemistry class | [Biochemistry.h](../../engine/Creature/Biochemistry/Biochemistry.h), [Biochemistry.cpp](../../engine/Creature/Biochemistry/Biochemistry.cpp) |
| Chemical constants | [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h), [BiochemistryConstants.cpp](../../engine/Creature/Biochemistry/BiochemistryConstants.cpp) |
| Organ system | [Organ.h](../../engine/Creature/Biochemistry/Organ.h), [Organ.cpp](../../engine/Creature/Biochemistry/Organ.cpp) |
| Receptor struct | [Receptor.h](../../engine/Creature/Biochemistry/Receptor.h), [Receptor.cpp](../../engine/Creature/Biochemistry/Receptor.cpp) |
| Emitter struct | [Emitter.h](../../engine/Creature/Biochemistry/Emitter.h), [Emitter.cpp](../../engine/Creature/Biochemistry/Emitter.cpp) |
| Reaction struct | [Reaction.h](../../engine/Creature/Biochemistry/Reaction.h) |
| Chemical struct | [Chemical.h](../../engine/Creature/Biochemistry/Chemical.h) |
| NeuroEmitter | [NeuroEmitter.h](../../engine/Creature/Biochemistry/NeuroEmitter.h), [NeuroEmitter.cpp](../../engine/Creature/Biochemistry/NeuroEmitter.cpp) |
| ChemicallyActive interface | [ChemicallyActive.h](../../engine/Creature/Biochemistry/ChemicallyActive.h) |
| Locus resolution (Creature) | [Creature.cpp](../../engine/Creature/Creature.cpp#L602-L676) |
| Drive constants | [CreatureConstants.h](../../engine/Creature/CreatureConstants.h) |
| Chemical names (tools) | [creatures.js](../creatures.js#L9-L189) |

### External References

- Grand, S. *Creation: Life and How to Make It*. Harvard University Press, 2001.
- [Creatures Wiki — Biochemistry](https://creatures.fandom.com/wiki/Biochemistry)
- [Creatures Wiki — Chemical](https://creatures.fandom.com/wiki/Chemical)
- [Creatures Wiki — Receptor](https://creatures.fandom.com/wiki/Receptor)
- [Creatures Wiki — Organ](https://creatures.fandom.com/wiki/Organ)
- [GameWare Chemical List (archived)](https://web.archive.org/web/20110807073010/http://www.gamewaredevelopment.co.uk/cdn/C3chemicalList.php)

---

[← Back to Game Philosophy & Overview](game_philosophy.md) · [The Digital Genome](genome_deep_dive.md) · [CAOS: Creatures](caos_creatures.md) · [Creatures Tab](tab_creatures.md)
