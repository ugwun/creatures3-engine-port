# The Drive System & Reinforcement Learning — Deep Dive

The drive system and stimulus system together form the **motivational architecture** of Creatures 3 — the complete loop through which creatures learn to behave. Drives provide the "why" (a biochemical urgency that motivates action), stimuli provide the "what happened" (discrete environmental events that alter biochemistry), and reinforcement learning provides the "how it's remembered" (synaptic weight changes that solidify successful behaviours into long-term memory).

This document provides a complete technical reference for these systems as implemented in the engine source code.

> **Conceptual overview:** For the high-level philosophical context, see [Game Philosophy & Overview](game_philosophy.md). For the neural network that processes drives and produces decisions, see [Brain & SVRules Deep Dive](brain_deep_dive.md). For the biochemical substrate that carries drive chemicals, see [Biochemistry Deep Dive](biochemistry_deep_dive.md).

> **CAOS Reference:** Use [`DRIV`](caos_creatures.md) to read drive levels, [`DRV!`](caos_creatures.md) for the highest drive. [`STIM WRIT`](caos_messages.md), [`STIM SHOU`](caos_messages.md), [`STIM SIGN`](caos_messages.md), and [`STIM TACT`](caos_messages.md) send stimuli. [`URGE WRIT`](caos_messages.md) / [`URGE SHOU`](caos_messages.md) / [`URGE SIGN`](caos_messages.md) / [`URGE TACT`](caos_messages.md) inject decision and attention overrides. The [Creatures Tab](tab_creatures.md) visualizes live drive levels.

---

## Table of Contents

1. [The 20 Drives](#the-20-drives)
2. [Drive Loci — The Biochemistry-to-Brain Bridge](#drive-loci--the-biochemistry-to-brain-bridge)
3. [The Sensory Pipeline — How Drives Enter the Brain](#the-sensory-pipeline--how-drives-enter-the-brain)
4. [The Decision Pipeline — From Drives to Actions](#the-decision-pipeline--from-drives-to-actions)
5. [The Motor Faculty — Executing Decisions](#the-motor-faculty--executing-decisions)
6. [The Stimulus System](#the-stimulus-system)
7. [Complete Stimulus Event Table](#complete-stimulus-event-table)
8. [The Stimulus Gene](#the-stimulus-gene)
9. [Stimulus Processing — The Engine Pipeline](#stimulus-processing--the-engine-pipeline)
10. [The Reinforcement Learning Loop](#the-reinforcement-learning-loop)
11. [Synchronous Learning — The Attention Gate](#synchronous-learning--the-attention-gate)
12. [Instincts — Pre-Wired Learning](#instincts--pre-wired-learning)
13. [Dreaming — Instinct Processing During REM Sleep](#dreaming--instinct-processing-during-rem-sleep)
14. [Involuntary Actions — Biochemical Reflexes](#involuntary-actions--biochemical-reflexes)
15. [Knowledge Extraction — Teaching Other Creatures](#knowledge-extraction--teaching-other-creatures)
16. [Worked Example: Learning to Eat](#worked-example-learning-to-eat)
17. [Source References](#source-references)

---

## The 20 Drives

Every creature has exactly **20 drives** — floating-point values between 0.0 and 1.0 that represent physiological urgencies. Drives are the creature's primary motivational signal: high drives feel "bad" and the creature is biochemically rewarded for reducing them.

The drives are defined in [`CreatureConstants.h`](../../engine/Creature/CreatureConstants.h):

| Drive # | Constant Name | Chemical ID | Category | Description |
|---|---|---|---|---|
| 0 | `PAIN` | 148 | Biological | Physical discomfort from injury or illness |
| 1 | `HUNGER_FOR_PROTEIN` | 149 | Biological | Need for protein nutrients |
| 2 | `HUNGER_FOR_CARB` | 150 | Biological | Need for carbohydrate nutrients |
| 3 | `HUNGER_FOR_FAT` | 151 | Biological | Need for fat nutrients |
| 4 | `COLDNESS` | 152 | Environmental | Body temperature too low |
| 5 | `HOTNESS` | 153 | Environmental | Body temperature too high |
| 6 | `TIREDNESS` | 154 | Biological | Need for rest |
| 7 | `SLEEPINESS` | 155 | Biological | Need for sleep |
| 8 | `LONELINESS` | 156 | Social | Absence of companions |
| 9 | `CROWDEDNESS` | 157 | Social | Too many creatures nearby |
| 10 | `FEAR` | 158 | Emotional | Perceived threat |
| 11 | `BOREDOM` | 159 | Emotional | Lack of stimulation |
| 12 | `ANGER` | 160 | Emotional | Frustration or hostility |
| 13 | `SEXDRIVE` | 161 | Reproductive | Mating urge |
| 14 | `COMFORT` | 162 | Biological | General wellbeing |
| 15 | `UP` | 163 | Navigational | Urge to move upward |
| 16 | `DOWN` | 164 | Navigational | Urge to move downward |
| 17 | `EXIT` | 165 | Navigational | Urge to leave current area |
| 18 | `ENTER` | 166 | Navigational | Urge to enter an area |
| 19 | `WAIT` | 167 | Navigational | Urge to remain stationary |

> **Note:** Drives 0–14 are the "classic" biological drives. Drives 15–19 are navigational drives added in C3/DS to enable spatial reasoning — they allow the stimulus system to motivate movement through the metaroom network (e.g., travelling through lifts, doors, and between metarooms). For the spatial hierarchy of metarooms, rooms, doors, and how creatures navigate via CA gradients, see [The World Ecosystem — Deep Dive](world_ecosystem.md).

Each drive exists as a **chemical concentration** in the creature's bloodstream. The mapping from drive number to chemical ID is offset by `STIMTOBIOCHEMOFFSET = 148`, defined in [`BiochemistryConstants.h`](../../engine/Creature/Biochemistry/BiochemistryConstants.h). Drive 0 (Pain) maps to chemical 148, drive 1 (Hunger for Protein) to chemical 149, and so on.

> **Important:** The drive-to-chemical mapping is *not* hardcoded at the engine level. It is loaded at runtime from the catalogue string `"drive_chemical_numbers"` in [`SensoryFaculty.cpp`](../../engine/Creature/SensoryFaculty.cpp). This means the game data files define which chemicals correspond to which drives. The standard mapping uses chemicals 148–167, but a modder could theoretically reassign them.

---

## Drive Loci — The Biochemistry-to-Brain Bridge

Drives exist at three distinct layers in the engine, and understanding this layering is crucial:

### Layer 1: Chemical Concentrations

Each drive chemical (148–167) lives in the creature's 256-slot biochemistry array. These chemicals are subject to all normal biochemical processing: half-life decay, reactions, emitters, and receptors. They are set by stimulus events, environmental emitters, and chemical reactions.

### Layer 2: Drive Loci (The Float Array)

The `Creature` class maintains a separate `myDriveLoci[NUMDRIVES]` array of 20 floats, defined in [`Creature.h`](../../engine/Creature/Creature.h). These loci serve as the **receptor target** for drive chemicals:

```cpp
// From Creature.cpp — GetLocusAddress()
case TISSUE_DRIVES:
    if (locus >= LOC_DRIVE0 && locus < LOC_DRIVE0 + NUMDRIVES)
        return &myDriveLoci[locus - LOC_DRIVE0];
```

When a **Receptor gene** binds chemical 148 (Pain) to locus `LOC_DRIVE0` in `TISSUE_DRIVES`, the biochemistry system writes the chemical concentration (after threshold and gain processing) into `myDriveLoci[0]`. This receptor-mediated binding means:

- **Threshold**: A receptor can require a minimum chemical concentration before the drive fires (e.g., the creature doesn't "feel" hungry until protein drops below a threshold)
- **Gain**: A multiplier amplifies or attenuates the chemical signal before it reaches the brain
- **Non-linearity**: Different receptor genes for the same drive chemical can produce different response curves

The drive loci also function as **emitter sources** — emitter genes can read the drive level and excrete chemicals in response (e.g., produce a stress hormone whenever any drive exceeds a threshold). This bidirectional binding is declared in the source:

```cpp
// From BiochemistryConstants.h
LOC_DRIVE0=0,   // These loci are both receptors and emitters.
LOC_DRIVE1,     // Receptors should be attached to each of these loci
LOC_DRIVE2,     // and used to monitor the levels of the various drive
...              // chemicals.
```

### Layer 3: Brain Drive Lobe Inputs

Each tick, the `SensoryFaculty::Update()` method copies the drive loci values directly into the brain's `driv` lobe neurons:

```cpp
// From SensoryFaculty.cpp — Update()
// DRIVE LOBE:
// Copy current drive levels from receptors to DRIVE_LOBE neus
for (i = 0; i < NUMDRIVES; i++) {
    brain->SetInput("driv", i, creature.GetDriveLevel(i));
}
```

And `Creature::GetDriveLevel()` simply returns the locus value:

```cpp
float Creature::GetDriveLevel(int i) {
    if (i < 0 || i >= NUMDRIVES) return -1.0f;
    return myDriveLoci[i];
}
```

This three-layer architecture means that drives flow through a well-defined pipeline:

```
Chemical 148 (Pain)
    ↓ (via Receptor gene: threshold + gain)
myDriveLoci[0] (Pain locus)
    ↓ (via SensoryFaculty::Update)
brain->SetInput("driv", 0, value)
    ↓ (via neural processing)
Neural activity in driv lobe, neuron 0
```

> **Design insight:** The comment in the source explicitly warns: *"Any code inside Creature that needs to monitor drive levels, e.g. for determining facial expressions, etc., should look at these loci, instead of looking at the DRIVE_LOBE neus, as the latter may be unrepresentative due to thresholds, WTA behaviour etc."* — The drive loci are the ground truth; the brain's drive neurons are the *perceived* version after neural processing.

---

## The Sensory Pipeline — How Drives Enter the Brain

The `SensoryFaculty::Update()` method in [`SensoryFaculty.cpp`](../../engine/Creature/SensoryFaculty.cpp) runs every creature tick and populates the brain's sensory input lobes. The drive-related inputs are:

### Drive Lobe (`driv`)
20 neurons, one per drive. Each neuron's input is set directly from the corresponding drive locus value. The drive lobe is typically a **free-running** lobe (not WTA), allowing the creature to simultaneously perceive multiple drives.

### Situation Lobe (`situ`)
Contextual signals that provide environmental awareness:

| Offset | Name | Source |
|---|---|---|
| `IP_AGE_LEVEL` | Life stage (0.0–1.0) | `creature.Life()->GetAge() / NUMAGES` |
| `IP_IN_VEHICLE` | In a vehicle? | `creature.GetCarrier().IsValid()` |
| `IP_CARRYING_SOMETHING` | Holding an object? | `creature.GetCarried() != NULLHANDLE` |
| `IP_BEING_CARRIED` | Being carried? | Movement status == CARRIED |
| `IP_FALLING` | Currently falling? | `!creature.IsStopped()` |
| `IP_NEAR_OPPOSITE_SEX` | Distance to mate | Inverse distance, normalized by visual range |
| `IP_MUSIC_MOOD` | Background music mood | `creature.Music()->Mood()` |
| `IP_MUSIC_THREAT` | Background music threat | `creature.Music()->Threat()` |
| `IP_SELECTED_CREATURE` | Selected by player? | `myCreature == theWorld.GetSelectedCreature()` |

### Detail Lobe (`detl`)
Information about the currently attended object ("IT"):

| Offset | Name | Description |
|---|---|---|
| `IP_IT_IS_BEING_CARRIED_BY_ME` | IT is in my inventory | 1.0 if creature carries IT |
| `IP_IT_IS_BEING_CARRIED_BY_SOMEONE_ELSE` | IT is carried by another | 1.0 if someone else carries IT |
| `IP_IT_NEARNESS` | How close IT is | Normalized inverse distance (fires at <128 pixels) |
| `IP_IT_IS_CREATURE` | IT is a creature | 1.0 if IT is a creature agent |
| `IP_IT_IS_MYSIBLING` | IT is my sibling | Shared mother or father moniker |
| `IP_IT_IS_MYPARENT` | IT is my parent | IT's moniker matches my mother/father |
| `IP_IT_IS_MYCHILD` | IT is my child | My moniker matches IT's mother/father |
| `IP_IT_IS_OPPOSITESEX` | IT is opposite sex | Same family/genus, different sex |
| `IP_IT_IS_OF_THIS_SIZE` | Size of IT | `(width + height) / 500.0` |
| `IP_IT_IS_SMELLING_THIS_MUCH` | Smell intensity of IT | CA increase value |
| `IP_IT_IS_FALLING` | IT is falling | `!a.IsStopped()` |

### Smell Lobe (`smel`)
Populated from the 20 Cellular Automata properties of the room the creature occupies. For the complete three-phase CA diffusion algorithm, navigable smell propagation, and the room-to-brain pipeline, see [The World Ecosystem — Smell-to-Brain Pipeline](world_ecosystem.md#the-smell-to-brain-pipeline):

```cpp
for (i = 0; i < CA_PROPERTY_COUNT; i++) {
    float smellValue = 0.0f;
    theApp.GetWorld().GetMap().GetRoomProperty(roomId, i, smellValue);
    creature.GetBiochemistry()->SetChemical(FIRST_SMELL_CHEMICAL + i, smellValue);
    int neuronId = theAgentManager.GetCategoryIdFromSmellId(i);
    brain->SetInput("smel", neuronId, smellValue);
}
```

This simultaneously sets biochemistry chemicals (starting at chemical 165) and brain neuron inputs, allowing creatures to follow chemical gradients through the room network.

### Vision Lobe (`visn`)
X-displacement to the nearest known agent in each of the ~40 agent categories, normalized by visual range (512 pixels):

```cpp
float xDisplacement = BoundIntoMinusOnePlusOne(
    (myKnownAgents[i].GetAgentReference().GetCentre().x - creature.GetCentre().x)
    / visualRange);
brain->SetInput("visn", i, xDisplacement);
```

---

## The Decision Pipeline — From Drives to Actions

The 14 possible **voluntary actions** a creature can take are defined in [`CreatureConstants.h`](../../engine/Creature/CreatureConstants.h):

| ID | Constant | Action | Requires IT? |
|---|---|---|---|
| 0 | `AC_DEFAULT` | Quiescent (idle) | No |
| 1 | `AC_ACTIVATE1` | Push / Pat | Yes |
| 2 | `AC_ACTIVATE2` | Pull | Yes |
| 3 | `AC_DEACTIVATE` | Slap / Hit | Yes |
| 4 | `AC_APPROACH` | Walk toward IT | Yes |
| 5 | `AC_RETREAT` | Walk away from IT | Yes |
| 6 | `AC_GET` | Pick up IT | Yes |
| 7 | `AC_DROP` | Drop carried object | No |
| 8 | `AC_EXPRESSNEED` | Speak highest drive | No |
| 9 | `AC_REST` | Rest / sleep | No |
| 10 | `AC_TRAVWEST` | Walk west | No |
| 11 | `AC_TRAVEAST` | Walk east | No |
| 12 | `AC_EAT` | Eat IT | Yes |
| 13 | `AC_HIT` | Hit IT | Yes |

The brain's **decision lobe** (`decn`) is a Winner-Takes-All (WTA) lobe whose neuron count is genome-defined. In the standard Norn brain, `decn` has **13 neurons** (a 1×13 grid), matching action IDs 0–12. The winning neuron becomes the creature's chosen action. Note that `NUMACTIONS = 14` (0–13) in the engine constants, so the 14th action (AC_HIT = 13) requires a brain whose `decn` lobe is large enough to include that neuron index.

The mapping between `decn` neuron IDs and script offsets is not hardcoded — it is loaded from the catalogue string `"Action Script To Neuron Mappings"` via [`BrainScriptFunctions.cpp`](../../engine/Creature/Brain/BrainScriptFunctions.cpp):

```cpp
for (int i = 0; i < NUMACTIONS; ++i) {
    myScriptMappings[i] = atoi(theCatalogue.Get(
        "Action Script To Neuron Mappings", i));
    myNeuronMappings[myScriptMappings[i]] = i;
}
```

This catalogue-driven mapping allows the game data to redefine the brain-to-action relationship without engine changes.

---

## The Motor Faculty — Executing Decisions

The [`MotorFaculty`](../../engine/Creature/MotorFaculty.h) translates brain output into physical creature actions. Its `Update()` method in [`MotorFaculty.cpp`](../../engine/Creature/MotorFaculty.cpp) runs every creature tick and performs:

### 1. Attention Selection
```cpp
int winningAttentionId = (myVoluntaryScriptOverrides.attentionScriptNo >= 0) ?
    myVoluntaryScriptOverrides.attentionScriptNo :
    c.GetBrain()->GetWinningId("attn");
AgentHandle winningAgent = c.Sensory()->GetKnownAgent(winningAttentionId);
```

The winning neuron in the `attn` (attention) lobe determines which agent category the creature focuses on. `SensoryFaculty` maintains a `myKnownAgents[]` array mapping each category to a specific visible agent — the "IT" object.

### 2. Involuntary Action Check
Before processing voluntary decisions, the motor faculty checks if any **involuntary action** should override:

```cpp
for (int i = 0; i < NUMINVOL; i++) {
    if (a.latency == 0 &&          // not on cooldown
        a.locus > RndFloat() &&    // probability proportional to signal
        a.locus > strongestSoFar)  // pick strongest candidate
    {
        strongestSoFar = myInvoluntaryActions[i].locus;
        bestInvoluntaryActionId = i;
    }
}
```

The involuntary action loci are controlled by biochemical receptors (see [Involuntary Actions](#involuntary-actions--biochemical-reflexes) below).

### 3. Decision Execution
If no involuntary action fires, the winning `decn` neuron is translated to a script event:

```cpp
int scriptAction = (myVoluntaryScriptOverrides.decisionScriptNo >= 0) ?
    myVoluntaryScriptOverrides.decisionScriptNo :
    GetScriptOffsetFromNeuronId(c.GetBrain()->GetWinningId("decn"));
```

The script classifier is constructed as:
- **Event = scriptAction + 16** for normal "I've been" scripts (e.g., `4 1 1 16` = Norn push)
- **Event = scriptAction + 32** for creature-creature scripts (e.g., `4 1 1 32` = Norn-creature push)

The engine tries the creature-creature script first (offset +32), falling back to the regular script (offset +16) if it doesn't exist. See [Script Events & Messages](caos_events.md) for the complete event mapping.

### 4. CAOS Override
The `URGE` CAOS commands can bypass the brain entirely by setting `myVoluntaryScriptOverrides.attentionScriptNo` and `myVoluntaryScriptOverrides.decisionScriptNo`. When these are ≥0, the motor faculty uses them instead of the brain's winning neurons.

---

## The Stimulus System

The stimulus system handles **discrete events** from the environment and translates them into chemical and neural impacts on the creature. It is the primary mechanism through which the world communicates consequences to the creature's internal systems.

### Stimulus Types

Stimuli are delivered through four sensory channels, defined in the `Stimulus::StimulusType` enum in [`Stimulus.h`](../../engine/Stimulus.h):

| Type | Constant | Range Check | Description |
|---|---|---|---|
| Shout | `typeSHOU` | `c.CanHear(fromAgent)` | Audio range — creature must be able to hear the source |
| Sign | `typeSIGN` | `c.CanSee(fromAgent)` | Visual range — creature must be able to see the source |
| Touch | `typeTACT` | `c.CanTouch(fromAgent)` | Physical contact — creature must be touching the source |
| Write | `typeWRIT` | `c == toCreature` | Direct — sent to a specific creature, no range check |

The `Stimulus::Process()` method in [`Stimulus.cpp`](../../engine/Stimulus.cpp) broadcasts the stimulus to all creatures that pass the range check:

```cpp
for (int i = 0; i < theAgentManager.GetCreatureCollection().size(); i++) {
    AgentHandle c = theAgentManager.GetCreatureByIndex(i);
    if (stimulusType == typeWRIT ? c == toCreature :
        stimulusType == typeSHOU ? c.CanHear(fromAgent) :
        stimulusType == typeSIGN ? c.CanSee(fromAgent) :
        stimulusType == typeTACT ? c.CanTouch(fromAgent) : false) {
        // deliver stimulus to this creature
    }
}
```

---

## Complete Stimulus Event Table

The engine defines **99 built-in stimulus events** (`NUMSTIMULI = 99`, indices 0–98) in [`Stimulus.h`](../../engine/Stimulus.h). Each event has a unique ID and a default description. The actual *chemical effect* of each stimulus is defined per-creature by **Stimulus genes** in the genome — the engine only provides the event IDs and delivery mechanism.

### Passive Senses (0–8)

| ID | Constant | Name | Description |
|---|---|---|---|
| 0 | `STIM_DISAPPOINT` | Disappoint | Punish for a pointless action (e.g., failed activation) |
| 1 | `STIM_POINTERPAT` | Pointer Pat | User has patted the creature (click on head) |
| 2 | `STIM_CREATUREPAT` | Creature Pat | Another creature has patted you |
| 3 | `STIM_POINTERSLAP` | Pointer Slap | User has slapped the creature (click on body) |
| 4 | `STIM_CREATURESLAP` | Creature Slap | Another creature has slapped you |
| 5 | `STIM_APPROACHING_DEPRECATED` | *(deprecated)* | Object approaching (unused in C3) |
| 6 | `STIM_RETREATING_DEPRECATED` | *(deprecated)* | Object retreating (unused in C3) |
| 7 | `STIM_BUMP` | Bump | Creature has hit a wall |
| 8 | `STIM_NEWOBJ_DEPRECATED` | *(deprecated)* | New object in view (unused in C3) |

### Language (9–11)

| ID | Constant | Name | Description |
|---|---|---|---|
| 9 | `STIM_GOBBLEDYGOOK` | Gobbledygook | Heard unrecognized speech |
| 10 | `STIM_POINTERWORD` | Pointer Word | Heard user speak |
| 11 | `STIM_CREATUREWORD` | Creature Word | Heard another creature speak |

### Voluntary Actions (12–27)

| ID | Constant | Name | Timing |
|---|---|---|---|
| 12 | `STIM_QUIESCENT` | Quiescent | PERIODICALLY while idle |
| 13 | `STIM_ACTIVATE1` | Activate1 (Push) | AFTER activation |
| 14 | `STIM_ACTIVATE2` | Activate2 (Pull) | AFTER activation |
| 15 | `STIM_DEACTIVATE` | Deactivate | AFTER deactivation |
| 16 | `STIM_APPROACH` | Approach | PERIODICALLY while watching |
| 17 | `STIM_RETREAT` | Retreat | AFTER retreat |
| 18 | `STIM_GET` | Get | AFTER picking up |
| 19 | `STIM_DROP` | Drop | AFTER dropping |
| 20 | `STIM_EXPRESSNEED` | Express Need | AFTER expressing need |
| 21 | `STIM_REST` | Rest | After resting, before sleeping |
| 22 | `STIM_SLEEP` | Sleep | PERIODICALLY while asleep |
| 23 | `STIM_TRAVWESTEAST` | Walk | PERIODICALLY while walking |
| 24 | `STIM_PUSH` | Push | AFTER being pushed |
| 25 | `STIM_HIT` | Hit | AFTER being hit |
| 26 | `STIM_EAT` | Eat | AFTER eating |
| 27 | `STIM_AC6` | *(reserved)* | — |

### Involuntary Actions (28–35)

| ID | Constant | Name |
|---|---|---|
| 28 | `STIM_INVOL0` | Involuntary 0 (Flinch) |
| 29 | `STIM_INVOL1` | Involuntary 1 (Lay Egg) |
| 30 | `STIM_INVOL2` | Involuntary 2 (Sneeze) |
| 31 | `STIM_INVOL3` | Involuntary 3 (Cough) |
| 32 | `STIM_INVOL4` | Involuntary 4 (Shiver) |
| 33 | `STIM_INVOL5` | Involuntary 5 (Sleep) |
| 34 | `STIM_INVOL6` | Involuntary 6 (Faint) |
| 35 | `STIM_INVOL7` | Involuntary 7 (Unassigned) |

### Social & Combat (36–47)

| ID | Constant | Name | Description |
|---|---|---|---|
| 36–38 | *(deprecated)* | — | C2 edge/falling events, unused in C3 |
| 39 | `STIM_IMPACT` | Impact | After a collision |
| 40 | `STIM_POINTERYES` | Pointer Yes | User spoke "YES" |
| 41 | `STIM_CREATUREYES` | Creature Yes | Creature spoke "YES" |
| 42 | `STIM_POINTERNO` | Pointer No | User spoke "NO" |
| 43 | `STIM_CREATURENO` | Creature No | Creature spoke "NO" |
| 44 | `STIM_AGGRESSION` | Aggression | After performing a HIT |
| 45 | `STIM_MATE` | Mate | After mating |
| 46 | `STIM_OPPSEX_TICKLE` | Opposite Sex Tickle | Tickled by opposite sex |
| 47 | `STIM_SAMESEX_TICKLE` | Same Sex Tickle | Tickled by same sex |

### Navigation (48–54, 75)

| ID | Constant | Name |
|---|---|---|
| 48 | `STIM_GO_NOWHERE` | Go Nowhere |
| 49 | `STIM_GO_IN` | Go In |
| 50 | `STIM_GO_OUT` | Go Out |
| 51 | `STIM_GO_UP` | Go Up |
| 52 | `STIM_GO_DOWN` | Go Down |
| 53 | `STIM_GO_LEFT` | Go Left |
| 54 | `STIM_GO_RIGHT` | Go Right |
| 75 | `STIM_WAIT` | Wait |

### Smell Peaks (55–74)

| ID | Constant | Description |
|---|---|---|
| 55–74 | `STIM_REACHED_PEAK_OF_SMELL0`–`19` | Creature has reached the local maximum of smell gradient 0–19 |

These fire when the creature reaches a point where a particular CA smell concentration is highest in its local area — essentially, it has found the source of the smell.

### Object Interactions (76–98)

| ID | Constant | Name | Description |
|---|---|---|---|
| 76 | `STIM_DISCOMFORT` | Discomfort | General discomfort |
| 77 | `STIM_EATEN_PLANT` | Eaten Plant | Consumed a plant agent |
| 78 | `STIM_EATEN_FRUIT` | Eaten Fruit | Consumed a fruit agent |
| 79 | `STIM_EATEN_FOOD` | Eaten Food | Consumed a food agent |
| 80 | `STIM_EATEN_ANIMAL` | Eaten Animal | Consumed an animal agent |
| 81 | `STIM_EATEN_DETRITUS` | Eaten Detritus | Consumed detritus |
| 82 | `STIM_CONSUME_ALCHOHOL` | Consume Alcohol | Consumed alcohol |
| 83 | `STIM_DANGER_PLANT` | Danger Plant | Interacted with dangerous plant |
| 84 | `STIM_FRIENDLY_PLANT` | Friendly Plant | Interacted with friendly plant |
| 85 | `STIM_PLAY_BUG` | Play Bug | Played with a bug |
| 86 | `STIM_PLAY_CRITTER` | Play Critter | Played with a critter |
| 87 | `STIM_HIT_CRITTER` | Hit Critter | Hit a critter |
| 88 | `STIM_PLAY_DANGER_ANIMAL` | Play Danger Animal | Played with a dangerous animal |
| 89 | `STIM_ACTIVATE_BUTTON` | Activate Button | Activated a button |
| 90 | `STIM_ACTIVATE_MACHINE` | Activate Machine | Activated a machine |
| 91 | `STIM_GOT_MACHINE` | Got Machine | Picked up a machine |
| 92 | `STIM_HIT_MACHINE` | Hit Machine | Hit a machine |
| 93 | `STIM_GOT_CREATURE_EGG` | Got Creature Egg | Picked up a creature egg |
| 94 | `STIM_TRAVELLED_IN_LIFT` | Travelled in Lift | Used a lift |
| 95 | `STIM_TRAVELLED_THROUGH_META_DOOR` | Meta Door | Travelled between metarooms |
| 96 | `STIM_TRAVELLED_THROUGH_INTERNAL_DOOR` | Internal Door | Travelled through an internal door |
| 97 | `STIM_PLAYED_WITH_TOY` | Played with Toy | Played with a toy |
| 98 | `STIM_DROP_ALL` | Drop All | Drop all carried objects |

---

## The Stimulus Gene

Each creature carries a **library of 99 Stimulus genes** (one per built-in stimulus event), read from the genome during construction. These genes define how each stimulus event affects the creature's biochemistry and brain. Two creatures of different species (or even siblings with mutations) can react completely differently to the same event.

The Stimulus gene is subtype 0 of gene type 2 (Creature), defined in the genome as:

| Field | Size | Description |
|---|---|---|
| Stimulus ID | 1 byte | Which of the 98 events (0–97) this gene defines |
| Significance (nounStim) | 1 byte (float) | How much to nudge the `noun` lobe — identifies *what* caused the stimulus |
| Verb ID | 1 byte | Which `verb` neuron to nudge (-1 = auto from `fromAgent`) |
| *(unused verb stim)* | 1 byte | Reserved; read but not used |
| Bit Flags | 1 byte | Bitmask controlling stimulus behaviour (see below) |
| Chemical 0 | 1 byte | Chemical ID to adjust (using stimulus-to-biochemistry offset) |
| Amount 0 | 1 byte (signed float) | How much to add/subtract (negative = remove) |
| Chemical 1 | 1 byte | Second chemical to adjust |
| Amount 1 | 1 byte (signed float) | Second adjustment |
| Chemical 2 | 1 byte | Third chemical to adjust |
| Amount 2 | 1 byte (signed float) | Third adjustment |
| Chemical 3 | 1 byte | Fourth chemical to adjust |
| Amount 3 | 1 byte (signed float) | Fourth adjustment |

### Bit Flags

| Bit | Value | Name | Description |
|---|---|---|---|
| 0 | `0x01` | `MODULATE` | Stimulus intensity varies with event parameters (e.g., gentle vs hard pat) |
| 1 | `0x02` | *(spare)* | Unused |
| 2 | `0x04` | `IFASLEEP` | Stimulus penetrates sleep state (attenuated by 50%); without this, sleeping creatures ignore the event |
| 3 | `0x08` | *(spare)* | Unused |
| 4 | `0x10` | `TRAINING_OFF_FOR_0` | Suppress reinforcement learning for chemical adjustment 0 |
| 5 | `0x20` | `TRAINING_OFF_FOR_1` | Suppress reinforcement learning for chemical adjustment 1 |
| 6 | `0x40` | `TRAINING_OFF_FOR_2` | Suppress reinforcement learning for chemical adjustment 2 |
| 7 | `0x80` | `TRAINING_OFF_FOR_3` | Suppress reinforcement learning for chemical adjustment 3 |

> **Key insight:** The `TRAINING_OFF_FOR_0–3` flags are extremely important. They allow genome designers to inject chemicals *without* triggering the learning system. For example, the "walking" stimulus increases tiredness — but you don't want the creature to *learn* that walking is bad (because the tiredness increase shouldn't produce a punishment signal). By setting the training-off flag on the tiredness chemical adjustment, the chemical still gets injected but no reinforcement signal reaches the brain.

### Chemical Number Mapping

The chemical IDs in stimulus genes use a **rotated numbering system** that is offset by `STIMTOBIOCHEMOFFSET = 148`. The conversion is handled by `Stimulus::StimChemToBioChem()`:

```cpp
// Stimulus chemical 0   → Biochemistry chemical 148 (first drive chemical)
// Stimulus chemical 107 → Biochemistry chemical 255
// Stimulus chemical 108 → Biochemistry chemical 1
// Stimulus chemical 254 → Biochemistry chemical 147
// Stimulus chemical 255 → Biochemistry chemical 0 (unused)
```

This rotation ensures that stimulus chemical 0 maps to the first drive chemical (Pain), making it easy for genome designers to target drives directly: stimulus chemical 0 = drive 0 (Pain), stimulus chemical 1 = drive 1 (Hunger for Protein), etc.

---

## Stimulus Processing — The Engine Pipeline

When a stimulus reaches a specific creature, the `SensoryFaculty::Stimulate(Stimulus s)` method in [`SensoryFaculty.cpp`](../../engine/Creature/SensoryFaculty.cpp) processes it through the following pipeline:

### Step 1: Death Check
Dead creatures ignore all stimuli:
```cpp
if (c.Life()->GetWhetherDead()) return;
```

### Step 2: Sleep Filter
If the creature is asleep and the stimulus doesn't have the `IFASLEEP` flag, it is discarded. One exception: saying the creature's name always wakes it up. If the stimulus *does* have `IFASLEEP`, the neural signals are attenuated by 50%:
```cpp
s.verbStim /= 2.0f;
s.nounStim /= 2.0f;
```

### Step 3: Linguistic Processing
The stimulus text is passed to the linguistic faculty for sentence parsing:
```cpp
c.Linguistic()->HearSentence(s.fromAgent, s.incomingSentence, s.verbIdToStim, s.nounIdToStim);
```

### Step 4: Neural Input
The noun and verb signals are injected into the brain:
- If `nounStim > 1.0f`: **override** the attention lobe (forced focus on that category)
- Else if `nounStim != 0.0f`: nudge the `noun` lobe neuron for that category
- Same pattern for `verbStim` and the `verb` lobe

This is how `URGE` and `STIM` commands influence creature decision-making — they push neural activity toward particular objects and actions.

### Step 5: Chemical Injection (with or without Training)
For each of the 4 chemical adjustments defined in the stimulus gene:

```cpp
for (int i = 0; i < 4; i++) {
    int chemicalId = s.chemicalsToAdjust[i];
    if (chemicalId != 0) {
        float adjustment = BoundIntoMinusOnePlusOne(s.strengthMultiplier * adjustment);
        
        if ((s.bitFlags & stimTrainingOffFlags[i]) || s.forceNoLearning) {
            AdjustChemicalLevel(chemicalId, adjustment);      // no learning
        } else {
            AdjustChemicalLevelWithTraining(chemicalId, adjustment, 
                s.fromScriptEventNo, s.fromAgent);            // with learning
        }
    }
}
```

The critical branch here is **with or without training**. When training is on, the chemical adjustment is passed to `AdjustChemicalLevelWithTraining()`, which injects a reinforcement signal into the brain.

---

## The Reinforcement Learning Loop

The heart of the learning system is `SensoryFaculty::AdjustChemicalLevelWithTraining()`, the most important function in the entire motivational architecture:

```cpp
void SensoryFaculty::AdjustChemicalLevelWithTraining(
    int whichChemical, float adjustment, 
    int fromScriptEventNo, AgentHandle const& fromAgent) 
{
    // 1. Always adjust the chemical
    AdjustChemicalLevel(whichChemical, adjustment);

    // 2. Check if this chemical is a drive
    int drive = GetDriveNumberOfChemical(whichChemical);
    if (drive != -1) {
        // This IS a drive chemical — can trigger learning

        if (fromAgent.IsInvalid()) return;  // no source, no learning

        if (creature.Life()->GetWhetherAlert()) {
            // AWAKE: inject into "resp" lobe (reinforcement)
            brain->SetInput("resp", drive, adjustment);
        } else {
            // ASLEEP: inject into "prox" lobe (proximal/dreaming)
            brain->SetInput("prox", drive, adjustment);
        }
    }
}
```

The key insight: **only drive chemicals can trigger learning**. If a stimulus injects a non-drive chemical (e.g., glycogen, a nutrient), no reinforcement signal is generated. But if it adjusts a drive chemical (148–167), the adjustment amount is sent to the brain's **response lobe** (`resp`).

> **Note on `prox`:** The source code's else-branch sends the signal to a `prox` (proximal) lobe when the creature is asleep. However, the standard Norn/Grendel/Ettin genomes do **not** include a `prox` lobe, so `Brain::SetInput("prox", ...)` silently does nothing. This branch is effectively dead code for all standard creatures. A custom genome that defines a `prox` lobe could receive sleep-state reinforcement.

### The `resp` Lobe — Reinforcement Signal

The `resp` (response) lobe has 20 neurons — one per drive. When `SetInput("resp", drive, adjustment)` is called:

- **Negative adjustment** (drive reduced, e.g., hunger goes down after eating): This is a **reward**. The brain's SVRules detect this and *strengthen* the dendrite weights of the neural pathways that led to the current action.
- **Positive adjustment** (drive increased, e.g., pain increases after hitting a wall): This is a **punishment**. The brain's SVRules *weaken* the relevant dendrite weights.

The reinforcement propagates through the brain via the SVRule opcodes:
- `setRewardChemicalIndex` — which biochemical chemical to monitor for reward
- `setRewardThreshold` — minimum concentration to trigger learning
- `setRewardRate` — how fast to adjust Short-Term weights
- `setPunishmentChemicalIndex`, `setPunishmentThreshold`, `setPunishmentRate` — same for punishment

> **Deep Dive:** For the complete SVRule reinforcement opcode mechanics and ST/LT weight convergence, see [Brain & SVRules Deep Dive — Reinforcement Learning via SVRules](brain_deep_dive.md#reinforcement-learning-via-svrules).

---

## Synchronous Learning — The Attention Gate

The reinforcement learning system includes a crucial safety mechanism called **synchronous learning**, controlled by the game variable `engine_synchronous_learning`. When enabled (value = 1), the engine validates that the creature is *actually paying attention to the right object* before allowing learning:

```cpp
if (theApp.GetWorld().GetGameVar("engine_synchronous_learning").GetInteger() == 1) {
    if (fromAgent != myCreature && fromAgent != thePointer) {
        // Check: creature's decision matches the agent's running script
        int decisionOffset = creature.Motor()->GetCurrentDecisionId();
        int expectedAgentScript = GetExpectedAgentScriptFromDecisionOffset(decisionOffset);
        if (expectedAgentScript == -1 || fromScriptEventNo == -1)
            learn = false;
        else if (fromScriptEventNo != expectedAgentScript)
            learn = false;

        // Check: creature still has attention on the source agent
        if (itAgent != fromAgent)
            learn = false;
    }
}
```

This prevents **spurious learning** — situations where a creature gets rewarded or punished for something it wasn't actually doing. For example, if a creature eats food (reducing hunger) but a nearby machine happens to fire a stimulus at the same time, the attention gate ensures the learning signal only applies to the food interaction, not the machine.

The validation checks:
1. **Script correspondence**: The creature's current decision (from `decn` lobe) must match the script event that triggered the stimulus. For example, if the creature decided "eat" (AC_EAT), the stimulus must come from an eating-related script.
2. **Attention correspondence**: The creature must still be looking at (`IT` == ) the agent that fired the stimulus.
3. **Self and pointer exemption**: Stimuli from the creature itself or the player's pointer always bypass this check.

---

## Instincts — Pre-Wired Learning

Instinct genes provide **innate knowledge** — pre-wired associations between situations, actions, and outcomes that the creature "knows" at birth without having to learn them through experience. They are essentially "cheat-sheet" learning episodes that are replayed during sleep.

### The Instinct Gene

An Instinct gene (type 2, subtype 5) in the genome contains:

| Field | Size | Description |
|---|---|---|
| Input lobe 0 (tissue ID) | 1 byte | Brain lobe for first input (tissue ID, 255=invalid) |
| Input neuron 0 | 1 byte | Neuron to activate in that lobe |
| Input lobe 1 | 1 byte | Second lobe (e.g., `verb` = action lobe) |
| Input neuron 1 | 1 byte | Second neuron |
| Input lobe 2 | 1 byte | Third lobe |
| Input neuron 2 | 1 byte | Third neuron |
| Decision ID | 1 byte | Action to associate (script offset → neuron mapping) |
| Reinforcement drive | 1 byte | Which drive to use as the reinforcement signal (0–255) |
| Reinforcement amount | 1 byte (signed float) | Positive = reward, negative = punishment |

### How Instincts Map Brain Regions

During construction, instinct genes remap their lobe references:
- If the input references the `decn` (decision) lobe, it is remapped to `verb` — the instinct sets up a desired *action*
- If the input references the `attn` (attention) lobe, it is remapped to `noun` — the instinct sets up a desired *object*

```cpp
// From Instinct.cpp constructor:
if (myInputs[i].name == std::string("decn"))
    myInputs[i].name = "verb";
if (myInputs[i].name == std::string("attn"))
    myInputs[i].name = "noun";
```

For noun inputs, the instinct also sets up fake visual and smell signals to simulate the creature "seeing" the object:
```cpp
if (lobeName == std::string("noun")) {
    myBrain->SetInput("visn", myInputs[i].neuronId, 0.1f);  // fake visual
    myBrain->SetInput("smel", myInputs[i].neuronId, 1.0f);  // fake smell
}
```

### Instinct Processing

When an instinct is processed (during REM sleep), it executes a simulated learning episode in [`Instinct::Process()`](../../engine/Creature/Brain/Instinct.cpp):

1. **Clear all brain activity** — start from a clean slate
2. **Set up the scenario** — activate the input neurons to simulate the situation
3. **Force the desired action** — set the verb neuron for the target action
4. **Update the brain** — run one full brain tick so signals propagate through the network
5. **Verify the decision** — check if the `decn` WTA winner matches the intended decision. If not, the instinct is invalid for this brain topology and is discarded
6. **Apply reinforcement** — inject the reinforcement signal into the `resp` lobe:
   ```cpp
   myBrain->SetInput("resp", myReinforcement.driveId, 
       REINFORCEMENT_MODIFIER * myReinforcement.amount);
   ```
   where `REINFORCEMENT_MODIFIER = 0.5f` — instinct reinforcement is half-strength compared to real-world learning
7. **Update the brain again** — a second tick allows the SVRules to process the reinforcement and adjust dendrite weights

This is why instincts function as "pre-wired learning" — they are structurally identical to real learning episodes, just using simulated inputs instead of real sensory data.

---

## Dreaming — Instinct Processing During REM Sleep

Instincts are not processed immediately when genes are expressed. Instead, they are queued and wait until the creature enters **REM (dreaming) sleep**. The connection between sleep and instinct processing is managed by the [`LifeFaculty`](../../engine/Creature/LifeFaculty.cpp):

```cpp
// From LifeFaculty::SetState():
if (s == dreamingState)
    c.GetBrain()->SetWhetherToProcessInstincts(true);
if (myState == dreamingState)
    c.GetBrain()->SetWhetherToProcessInstincts(false);
```

When instinct processing begins, `Brain::SetWhetherToProcessInstincts(true)` executes a two-phase chemical signal protocol:

### Phase 1: Pre-Instinct Warning
```cpp
myPointerToChemicals[preInstinctChemicalNumber] = 1.0;
myPointerToChemicals[instinctChemicalNumber] = 0.0;
UpdateComponents();  // one brain tick with pre-instinct signal
```

This sets a `preInstinctChemical` in the bloodstream and runs one brain update. This gives dendrite SVRules time to prepare — for example, they might save current Short-Term weights before the instinct processing overwrites them.

### Phase 2: Instinct Processing Mode
```cpp
myPointerToChemicals[preInstinctChemicalNumber] = 0.0;
myPointerToChemicals[instinctChemicalNumber] = 1.0;
```

Now the `instinctChemical` is set. SVRules that reference this chemical via the `chem` operand can detect they are in instinct-processing mode and behave differently — typically by converting ST weight changes directly to LT weights (because instinct learning should be permanent, not short-term).

### Processing Loop

During each `Brain::Update()` while instincts are being processed:

1. **One instinct per tick** — instincts are popped from the back of the queue:
   ```cpp
   Instinct *i = myInstincts.back();
   if (i->Process() == true) {
       myInstincts.pop_back();
       delete i;
       return;  // only process one at a time
   }
   ```

2. After all instincts are processed, the brain enters the **knowledge extraction** phase (see below).

3. When knowledge extraction completes, `myInstinctsAreBeingProcessed` is set to `false` and normal brain processing resumes.

> **Design note:** The source code comments explicitly discuss the tradeoff of clearing tract activity during instinct processing: *"If the tracts are cleared then STWs will be set to LTW, i.e. the creature will forget all recently learned weightings stored in STWs."* The engine deliberately does NOT clear tracts, preserving recently learned real-world experience while layering instinct learning on top.

---

## Involuntary Actions — Biochemical Reflexes

The engine supports **8 involuntary (reflex) actions** that bypass the brain's decision system entirely. These are triggered by biochemical receptor loci (`LOC_INVOLUNTARY0` through `LOC_INVOLUNTARY7`) bound to the `MotorFaculty`:

| ID | Standard Assignment | Description |
|---|---|---|
| 0 | Flinch | Reaction to pain |
| 1 | Lay Egg | Triggered when pregnancy reaches full term |
| 2 | Sneeze | Respiratory reflex |
| 3 | Cough | Respiratory reflex |
| 4 | Shiver | Reaction to cold |
| 5 | Sleep | Triggered by extreme tiredness |
| 6 | Faint | Triggered by injury or weakness |
| 7 | *(unassigned)* | Available for custom use |

Each involuntary action has:
- **Locus**: A `float` receptor locus controlled by biochemistry. When a chemical receptor monitoring e.g. Pain writes to `LOC_INVOLUNTARY0`, the value represents how urgently the creature needs to flinch.
- **Latency**: A cooldown counter preventing instant reactivation. The CAOS `LTCY` command sets this, allowing scripts to control how frequently an involuntary action can repeat.

The selection algorithm is probabilistic — the involuntary action fires with a probability proportional to its locus value, and the strongest candidate wins:

```cpp
if (a.latency == 0 &&          // not on cooldown
    a.locus > RndFloat() &&    // random threshold (stronger signal = more likely)
    a.locus > strongestSoFar)  // pick the strongest
```

When an involuntary action fires, it executes the creature's script at event `SCRIPTINVOLUNTARY0 + id` (events 64–71). The script can then set a random latency via `LTCY` to prevent the action from repeating constantly.

---

## Knowledge Extraction — Teaching Other Creatures

After instinct processing completes during dreaming, the brain enters a **knowledge extraction** phase. For each drive, the engine simulates "what would I do if this drive were high?" and records the result:

```cpp
for (int driveId = 0; driveId < numDriveNeurons; driveId++) {
    ClearActivity();
    
    // Simulate: "I can see/smell everything"
    for (int s = 0; s < noNounNeurons; s++)
        SetInput("noun", s, 0.5f);
    for (int v = 0; v < noVisionNeurons; v++)
        SetInput("visn", v, 0.1f);
    
    // Simulate: "This drive is very high"
    SetInput("driv", driveId, 1.0f);
    
    // Run the brain
    UpdateComponents();
    
    // Record: what did the brain decide?
    myAssistanceKnowledge[driveId].attentionId = GetWinningId("attn");  // what to look at
    myAssistanceKnowledge[driveId].decisionId = GetWinningId("decn");   // what to do
    myAssistanceKnowledge[driveId].strength = GetLobeFromTokenString("decn")->
        GetNeuronState(myAssistanceKnowledge[driveId].decisionId, STATE_VAR);
}
```

This `myAssistanceKnowledge[]` array is read by the `LinguisticFaculty` when creatures teach each other concepts. A creature that has learned "when hungry, eat food" can communicate this knowledge to other creatures through the language system — effectively sharing learned survival strategies.

---

## Worked Example: Learning to Eat

Here is the complete tick-by-tick trace of how a creature learns to eat when hungry, integrating all the systems described above:

### Tick 1: Rising Hunger
1. **Biochemistry**: Food chemicals in the stomach are being consumed by digestive reactions. The reaction products decay via half-lives. The Hunger for Protein chemical (ID 149) gradually rises.
2. **Receptor processing**: A Receptor gene monitoring chemical 149 (Hunger for Protein) with a threshold of 0.3 and gain of 1.5 writes the processed value to `myDriveLoci[1]`.
3. **Sensory update**: `SensoryFaculty::Update()` copies `myDriveLoci[1]` to `brain->SetInput("driv", 1, value)`.
4. **Neural processing**: The `driv` lobe's neuron 1 (Hunger for Protein) now has high activation. This propagates through processing lobes (`comb`, `situ`) to the decision lobe (`decn`).

### Tick 2: Making a Decision
5. **Brain update**: The neural network processes all inputs. The `decn` WTA lobe selects a winning action — perhaps `AC_EAT` (neuron 12), if the pathways from the hunger drive through to eating have any weight at all (even random initial weights).
6. **Motor update**: `MotorFaculty::Update()` reads `GetWinningId("decn")` → neuron 12 → `GetScriptOffsetFromNeuronId(12)` → script action `AC_EAT`.
7. **Attention**: The `attn` lobe winner determines which agent category the creature focuses on (e.g., category "food").
8. **IT object**: `SensoryFaculty::GetKnownAgent(attentionId)` returns the nearest visible food agent.
9. **Script execution**: The motor faculty fires script event 28 (`AC_EAT + 16`) on the creature: the "I've been eating" script.

### Tick 3: Eating and Stimulus
10. **CAOS script**: The creature's eating script (e.g., `4 1 1 28`) runs. It animates the creature eating and calls `STIM WRIT` to fire stimulus `STIM_EATEN_FOOD` (ID 79).
11. **Stimulus gene**: The creature's Stimulus gene #79 (Eaten Food) defines:
    - Chemical 0 = stimulus chemical 1 (= biochemistry chemical 149, Hunger for Protein), amount = -0.5 (reduce)
    - Chemical 1 = stimulus chemical 108 (= biochemistry chemical 1, Protein), amount = +0.3 (add nutrient)
    - Training flag on chemical 0: OFF (learning enabled)
    - Training flag on chemical 1: ON (no learning for the nutrient — it's not a drive)

### Tick 4: Reinforcement
12. **Chemical injection**: `AdjustChemicalLevel(149, -0.5f)` — hunger drops immediately.
13. **Training signal**: Because chemical 149 IS drive 1 (Hunger for Protein), and training is enabled:
    ```cpp
    brain->SetInput("resp", 1, -0.5f);  // negative = reward
    ```
14. **Brain response**: The `resp` lobe neuron 1 now has a -0.5 signal (reward for hunger reduction). During the next brain update, dendrite SVRules in tracts connecting to the `decn` lobe detect the reward chemical and increase the Short-Term weights of dendrites that carried the signal path from "food + hungry → eat".

### Ticks 5–N: Consolidation
15. **ST→LT convergence**: Over subsequent ticks, the `setSTtoLTRate` SVRule opcode slowly moves the Long-Term weight toward the elevated Short-Term weight. If the creature repeats the eat-when-hungry behaviour and gets reinforced each time, the LT weight solidifies — the association is permanently learned.
16. **Memory formation**: The creature now reliably eats when hungry, not because anyone programmed `if (hungry) eat()`, but because the biochemistry rewarded the neural pathways that happened to reduce hunger.

---

## Source References

| Topic | Source Files |
|---|---|
| Drive constants & action IDs | [CreatureConstants.h](../../engine/Creature/CreatureConstants.h) |
| Stimulus event enum & data structure | [Stimulus.h](../../engine/Stimulus.h), [Stimulus.cpp](../../engine/Stimulus.cpp) |
| Stimulus processing & reinforcement | [SensoryFaculty.cpp](../../engine/Creature/SensoryFaculty.cpp) |
| Drive loci & GetLocusAddress | [Creature.cpp](../../engine/Creature/Creature.cpp) |
| Biochemistry constants & locus IDs | [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h) |
| Motor faculty & decision execution | [MotorFaculty.cpp](../../engine/Creature/MotorFaculty.cpp) |
| Brain-to-script mappings | [BrainScriptFunctions.cpp](../../engine/Creature/Brain/BrainScriptFunctions.cpp) |
| Instinct processing | [Instinct.h](../../engine/Creature/Brain/Instinct.h), [Instinct.cpp](../../engine/Creature/Brain/Instinct.cpp) |
| Brain update & instinct loop | [Brain.cpp](../../engine/Creature/Brain/Brain.cpp) |
| Life states & dreaming | [LifeFaculty.cpp](../../engine/Creature/LifeFaculty.cpp) |
| Brain architecture & SVRules | [Brain.h](../../engine/Creature/Brain/Brain.h), [SVRule.h](../../engine/Creature/Brain/SVRule.h) |

### External References

- Grand, S. *Creation: Life and How to Make It*. Harvard University Press, 2001.
- Zucconi, A. ["The AI of Creatures"](https://www.alanzucconi.com/2020/07/27/the-ai-of-creatures/). 2020.
- [Creatures Wiki — Drives](https://creatures.fandom.com/wiki/Drive)
- [Creatures Wiki — Stimulus](https://creatures.fandom.com/wiki/Stimulus)
- [Creatures Wiki — Instinct](https://creatures.fandom.com/wiki/Instinct)
