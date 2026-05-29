# The World Ecosystem — Deep Dive

The game world in Creatures 3 / Docking Station is not a static backdrop for creature behaviour — it is an actively simulated ecosystem with its own physics, atmospheric chemistry, and spatial topology. Creatures must navigate this environment, sense its conditions, and interact with its objects to survive. This document covers the complete world simulation from engine source code.

> **Overview:** For a high-level introduction to how the world fits into the game's biological architecture, see [Game Philosophy — The World as an Ecosystem](game_philosophy.md).

> **CAOS Reference:** For all the commands that create and manipulate rooms, metarooms, doors, and cellular automata, see [Map & Rooms](caos_map.md). For agent creation and manipulation, see [Agents](caos_agents.md). For agent categories, see [Agent Categories](caos_categories.md).

---

## Spatial Hierarchy — Metarooms, Rooms, and Doors

The world is organized into a strict two-level spatial hierarchy, implemented in [`Map.h`](../../engine/Map/Map.h) and [`Map.cpp`](../../engine/Map/Map.cpp).

### Metarooms — The Large-Scale Environments

**Metarooms** are the top-level spatial containers — large, functionally enclosed environments like the Engineering deck, the Jungle Terrarium, the Norn Meso habitation area, the Bridge, or the Desert Terrarium. Each metaroom is defined by a rectangular bounding box in world coordinates.

| Property | Description | Source |
|---|---|---|
| `metaRoomID` | Unique integer identifier | [`MetaRoom::metaRoomID`](../../engine/Map/Map.h) |
| `positionMin` / `positionMax` | Bounding rectangle corners (world coords) | [`MetaRoom`](../../engine/Map/Map.h) |
| `positionDefault` | Default camera location when entering | [`MetaRoom::positionDefault`](../../engine/Map/Map.h) |
| `backgroundCollection` | Set of available background image filenames | [`MetaRoom::backgroundCollection`](../../engine/Map/Map.h) |
| `background` | Currently displayed background | [`MetaRoom::background`](../../engine/Map/Map.h) |
| `track` | Music track associated with this metaroom | [`MetaRoom::track`](../../engine/Map/Map.h) |

**Engine limits:**

| Limit | Value | Source |
|---|---|---|
| Maximum metarooms | **200** (`MAX_META_ROOMS`) | [`Map.h`](../../engine/Map/Map.h) |
| Maximum rooms | **2,000** (`MAX_ROOMS`) | [`Map.h`](../../engine/Map/Map.h) |

In a typical Docking Station + Creatures 3 combined world, metaroom IDs start at higher bases set via [`BRMI`](caos_map.md) to avoid collisions between the two game modules. The running game currently assigns metaroom 11 to the Norn Meso, for example.

> **CAOS:** [`ADDM`](caos_map.md) creates a metaroom. [`GMAP`](caos_map.md) returns the metaroom at a world coordinate. [`MLOC`](caos_map.md) returns a metaroom's bounds. [`EMID`](caos_map.md) lists all metaroom IDs.

### Rooms — The Fundamental Spatial Units

**Rooms** are the fundamental spatial volumes within metarooms. Every point in the game world that creatures and agents can occupy belongs to exactly one room. Each room is a quadrilateral defined by four boundary edges:

```
      yLeftCeiling ─────────── yRightCeiling
         │                         │
    Left │                         │ Right
    Wall │        Room Interior    │ Wall
         │                         │
      yLeftFloor ──────────── yRightFloor
         │                         │
       xLeft                     xRight
```

The **left and right walls are vertical** (x = `xLeft` and x = `xRight`), but the **floor and ceiling edges can be sloped** independently. This allows irregular terrain — ramps, hills, and uneven surfaces that creatures walk along. The engine stores these as:

| Field | Type | Description |
|---|---|---|
| `startFloor` / `endFloor` | `Vector2D` | Left and right floor endpoints |
| `startCeiling` / `endCeiling` | `Vector2D` | Left and right ceiling endpoints |
| `deltaFloor` / `deltaCeiling` | `Vector2D` | Precomputed slope vectors |
| `centre` | `Vector2D` | Geometric centre of the room |
| `positionMin` / `positionMax` | `Vector2D` | Axis-aligned bounding box |

Each room also maintains:
- A **room type** (integer, 0–15) that determines its CA behaviour rates
- A **permeability** value governing creature/agent passage
- A **music track** override (or inherits from the metaroom)
- Collections of **doors** on each side (left, right, floor, ceiling)
- A **neighbour ID collection** for pathfinding in each direction
- **Cellular automata values** — 20 floating-point properties (see below)

> **CAOS:** [`ADDR`](caos_map.md) creates a room. [`GRAP`](caos_map.md) returns the room at a point. [`ROOM`](caos_map.md) returns the room containing an agent. [`RLOC`](caos_map.md) returns a room's boundary coordinates. [`RTYP`](caos_map.md) gets or sets a room's type.

### Doors — Physical Boundaries Between Rooms

**Doors** are shared boundary edges between adjacent rooms. They control both physical movement and atmospheric diffusion. Each door has:

| Field | Type | Description |
|---|---|---|
| `doorType` | `int` | `0` = left/right (vertical), `1` = ceiling/floor (horizontal) |
| `permiability` | `int` | 0 = impermeable wall, 100 = fully open |
| `parent1` / `parent2` | `int` | IDs of the two rooms sharing this boundary |
| `start` / `end` | `Vector2D` | Physical endpoints of the door edge |
| `length` | `float` | Precomputed door edge length |
| `doorage1` / `doorage2` | `float` | Proportional opening relative to each parent room's perimeter |

The **doorage** calculation is critical to the CA diffusion model. It represents how much of each room's perimeter this door occupies, scaled by permeability:

```cpp
// From Map.h — CalculateDoorDoorage()
float normPerm = doorOrLink.permiability / 100.0f;
float doorage = doorOrLink.length * normPerm * normPerm;
doorage1 = doorage / room1->perimeterLength;
doorage2 = doorage / room2->perimeterLength;
```

The permeability is squared (not linear), meaning a half-open door (`permiability = 50`) lets through only 25% of CA flux — creating a strong non-linear barrier effect. This is physically analogous to how partially open windows transmit heat.

> **CAOS:** [`DOOR`](caos_map.md) sets the permeability between two adjacent rooms.

### Links — Non-Adjacent Room Connections

**Links** are a separate connection mechanism from doors. While doors represent physical shared edges between geometrically adjacent rooms, links create CA-diffusion pathways between **any two rooms** — even rooms in different metarooms. They are used by the bootstrap scripts to create atmospheric connections that bypass normal geometry (e.g., connecting airlocks, teleporters, or ventilation shafts).

Links have the same `parent1`, `parent2`, `permiability`, and `doorage` fields as doors, and participate identically in the CA simulation. The key difference is that link length is computed as the **average room height** of the two connected rooms rather than a physical shared edge length:

```cpp
// From MapCA.cpp — SetLinkPermiability()
float length = ((room1->endFloor.y - room1->endCeiling.y) +
    (room1->startFloor.y - room1->startCeiling.y) +
    (room2->endFloor.y - room2->endCeiling.y) +
    (room2->startFloor.y - room2->startCeiling.y)) / 4.0f;
```

Links are created dynamically via CAOS when their permeability is set to a non-zero value, and destroyed when set to zero.

> **CAOS:** [`LINK`](caos_map.md) sets a link's permeability between two rooms (creating the link if needed; setting to 0 destroys it).

---

## Cellular Automata — The Living Atmosphere

The most distinctive feature of the Creatures 3 world is its **Cellular Automata (CA)** system: a continuous physical simulation that gives every room in the world its own atmospheric state. This is not a scripted effect — it is a genuine diffusion simulation running on every game tick, implemented in [`MapCA.cpp`](../../engine/Map/MapCA.cpp) and [`RoomCA.cpp`](../../engine/Map/RoomCA.cpp).

### The 20 CA Properties

Each room maintains an array of **20 floating-point CA properties** (`caValues[CA_PROPERTY_COUNT]`), representing the physical and chemical state of the air in that volume of space. The engine treats these as generic numerical channels — the specific meaning (temperature, nutrients, smell, etc.) is assigned by the bootstrap CAOS scripts.

The standard DS+C3 bootstrap assigns the following meanings:

| CA Index | Property | Description |
|---|---|---|
| 0 | — | (Unused in standard bootstrap) |
| 1 | Temperature | Ambient heat level in the room |
| 2 | Light | Brightness / illumination |
| 3 | Nutrients | Soil/water nutrient level for plant growth |
| 4 | Radiation | Background radiation level |
| 5 | — | Available for custom use |
| 6–19 | Smell Channels | Agent smell emissions (mapped to categories via `CACL`) |

> **Note:** These assignments are entirely data-driven. The engine's `CACL` command associates classifiers with CA indices, and the `RATE` command sets how each room type processes each CA channel. A total mod could reassign all 20 channels to completely different meanings.

### Room Types and CA Rates

The CA simulation is parameterized by **room type**. The engine supports **16 room types** (0–15), and each room type defines distinct behaviour for each of the 20 CA properties through three rate parameters stored in the [`CARates`](../../engine/Map/CARates.h) class:

| Parameter | Field | Description |
|---|---|---|
| **Gain** | `myGain` | How quickly the property absorbs input from agents in the room (0.0–1.0) |
| **Loss** | `myLoss` | Natural decay rate — how quickly the property reverts to zero (0.0–1.0) |
| **Diffusion** | `myDiffusion` | How readily the property spreads to neighbouring rooms through doors (0.0–1.0) |

These rates are stored in a `[ROOM_TYPE_COUNT][CA_PROPERTY_COUNT]` matrix (16 × 20 = 320 rate triplets) in the Map, set by the bootstrap scripts via `RATE`.

For example, a "Corridor" room type might have high diffusion (air flows freely) and low gain (small rooms don't accumulate much), while a "Greenhouse" room type might have high gain for nutrients and low diffusion for temperature (insulated).

> **CAOS:** [`RATE`](caos_map.md) sets or queries the gain/loss/diffusion rates for a specific room type and CA index.

### The CA Update Algorithm

The CA simulation processes **one CA property per tick** in a round-robin cycle — property 0 on tick 0, property 1 on tick 1, ..., property 19 on tick 19, then back to 0. This means each CA property is fully updated every 20 ticks. The algorithm, implemented in [`Map::UpdateCurrentCAProperty()`](../../engine/Map/MapCA.cpp), proceeds in three phases:

#### Phase 1: Room-Local Update

For each room, the engine computes a new "temp value" that represents the room's CA state after local gain/loss processing. The algorithm from [`UpdateRoomCA()`](../../engine/Map/RoomCA.cpp) works as follows:

```cpp
// Clamp agent input to [0, 1] via saturating transform
float adjustedInput = 1.0 - 1.0 / (inputFromObjectsInRoom + 1.0);

// If current value > adjusted input: decay at loss rate
// If current value < adjusted input: absorb at gain rate
float lossOrGainRate = (newValue > adjustedInput) ? rates.GetLoss() 
                                                   : rates.GetGain();

// Weighted average between current value and input
tempValue = lossOrGainRate * adjustedInput + (1.0 - lossOrGainRate) * newValue;
newValue = 0.0;  // Reset for accumulation in Phase 2
```

This creates an **asymmetric response**: rooms absorb new input at one rate (`gain`) and decay toward zero at a different rate (`loss`). The saturating transform `1 - 1/(x+1)` prevents runaway accumulation — multiple agents in a room still produce a bounded result.

#### Phase 2: Inter-Room Diffusion

After local processing, the engine diffuses CA values between rooms through both **doors** (geometrically adjacent edges) and **links** (explicit non-adjacent connections). The diffusion from [`UpdateDoorCA()`](../../engine/Map/RoomCA.cpp) computes:

```cpp
// Geometric mean of the two rooms' diffusion rates
float diffusionRate = rates1.GetDiffusionRoot() * rates2.GetDiffusionRoot();

// Average the two rooms' temp values
float averageValue = (tempValue1 + tempValue2) / 2.0;

// Blend: each room gets a mix of its own value and the average
// weighted by the door's proportional opening (doorage)
newValue1 += doorage1 * (tempValue1 * (1 - diffusionRate) + averageValue * diffusionRate);
newValue2 += doorage2 * (tempValue2 * (1 - diffusionRate) + averageValue * diffusionRate);
```

The diffusion rate uses the **square root** of each room's diffusion parameter (stored as `myDiffusionRoot`), meaning the effective diffusion between two rooms is the geometric mean of their individual rates. This ensures that an insulated room (diffusion ≈ 0) blocks diffusion even when connected to a high-diffusion corridor.

#### Phase 3: Self-Retention

Finally, each room retains the portion of its temp value not already distributed through doors:

```cpp
room->caValues[property] += room->caTempValue * (1.0 - room->caTotalDoorage);
```

Where `caTotalDoorage` is the sum of all doorage fractions for that room — the proportion of its perimeter that is "open" to neighbours. A fully enclosed room with no doors retains 100% of its value.

#### History Tracking

Each room maintains three generations of CA values:

| Array | Purpose |
|---|---|
| `caValues[20]` | Current tick's values |
| `caOldValues[20]` | Previous tick's values (for computing deltas) |
| `caOlderValues[20]` | Two ticks ago (for projected value estimation) |

The [`PROP`](caos_map.md) CAOS command reads from `caValues`. The engine also supports querying the **change** in CA via `GetRoomPropertyChange()` and **projected** values via `GetProjectedRoomProperty()`.

### Navigable vs. Standard CA

The engine distinguishes between two kinds of CA channels:

**Standard CA** properties (temperature, light, etc.) are updated through the three-phase algorithm above — once per 20 ticks, with gain/loss/diffusion.

**Navigable CA** properties are used by the creature navigation system to find paths to smell sources. They use a different model: instead of the three-phase diffusion, agents call [`AlterCAEmission()`](../../engine/Map/MapCA.cpp), which **recursively propagates** a smell value through the room link graph. The propagation walks through links and navigable doors up to a depth of **30 rooms** (`caDistance = 30`), multiplying the value by each link's diffusion and permeability at each hop:

```cpp
// Recursive propagation through links
float reduce = rates.GetDiffusion() * otherRates.GetDiffusion();
AlterCAEmission(otherRoom, caIndex,
    difference * reduce * link->permiability * 0.01f,
    distance, room->roomID, link);
```

This creates **persistent smell gradients** that creatures can follow to locate food, other creatures, or hazards. At the entry point, the emission value is pre-multiplied by the room's **gain rate** and a **multiplier of 10** (`caMultiplier = 10.0f`) to provide a strong initial signal before recursive propagation begins.

When reading navigable CA values via `GetRoomProperty()`, the raw accumulation is mapped to [0, 1] via the same saturating transform used in Phase 1: `value = 1 - 1/(rawValue + 1)`.

Which CA indices are navigable is defined in the catalogue data under the tag `"Navigable CA Indices"`, loaded by [`Map::GetNavigableCAIndices()`](../../engine/Map/MapCA.cpp).

---

## How Agents Interact with the Atmosphere

Every agent in the game world can emit CA values into the room it occupies, creating a living, breathing atmosphere that reflects what's happening in the world.

### Agent CA Emission

Each agent has three CA-related fields defined in [`Agent.h`](../../engine/Agents/Agent.h):

| Field | Type | Description |
|---|---|---|
| `myCAIndex` | `int` | Which of the 20 CA properties this agent emits into (-1 = none) |
| `myCAIncrease` | `float` | How much it emits per tick |
| `myCAIsNavigable` | `bool` | Whether this is a navigable (smell) CA |

When an agent's timer or bootstrap script calls [`EMIT`](caos_map.md), it sets these values via `Agent::SetEmission()`. The agent's [`HandleCA()`](../../engine/Agents/Agent.cpp) method, called every tick during `Agent::Update()`, processes the emission:

**For standard CA:** On each tick, `HandleCA()` checks if the current CA update cycle has reached this agent's CA index. If so, it adds `myCAIncrease` to the room's `caInput` accumulator via `Map::IncreaseCAInput()`. This input is consumed during the next Phase 1 update.

**For navigable CA:** `HandleCA()` calls `Map::AlterCAEmission()` whenever the agent changes rooms, maintaining a persistent smell gradient centred on the agent's current location. When the agent moves to a new room, it removes its emission from the old room (`-myCAIncrease`) and adds it to the new room.

> **CAOS:** [`EMIT`](caos_map.md) sets an agent's CA emission. [`CACL`](caos_map.md) associates a classifier (family/genus/species) with a CA index, linking agent types to smell channels so creatures can "smell" specific categories of objects.

### The Smell-to-Brain Pipeline

The connection between room CA values and a creature's perception is handled by the [`SensoryFaculty::Update()`](../../engine/Creature/SensoryFaculty.cpp) method. On every sensory update:

1. **Room lookup:** The creature's foot position is used to determine which room it's in via `Map::GetRoomIDForPoint()`

2. **CA → Biochemistry:** All 20 CA values from the current room are read and injected into the creature's **[smell chemicals](biochemistry_deep_dive.md#smell-chemicals-ids-165184)** (chemicals 165–184, starting at `FIRST_SMELL_CHEMICAL = 165`):
   ```cpp
   for (i = 0; i < CA_PROPERTY_COUNT; i++) {
       float smellValue = 0.0f;
       GetMap().GetRoomProperty(roomId, i, smellValue);
       creature.GetBiochemistry()->SetChemical(FIRST_SMELL_CHEMICAL + i, smellValue);
   ```

3. **CA → Brain (Smell Lobe):** The CA values are also mapped to neurons in the creature's **[smell lobe](brain_deep_dive.md#standard-norn-brain-lobes)** (`smel`). The mapping uses `AgentManager::GetCategoryIdFromSmellId()` to convert CA indices to category IDs (matching the [noun lobe's](brain_deep_dive.md#standard-norn-brain-lobes) category system), so the creature can associate smells with specific types of objects:
   ```cpp
   int neuronId = theAgentManager.GetCategoryIdFromSmellId(i);
   brain->SetInput("smel", neuronId, smellValue);
   ```

4. **Self-smell correction:** When the creature itself emits into a navigable CA channel, the engine subtracts the creature's own contribution before setting the brain input. This prevents a creature from "smelling itself":
   ```cpp
   if (neuronId == GetCategoryIdOfAgent(myCreature))
       smellValue = GetMap().GetRoomPropertyMinusMyContribution(myCreature, smellValue);
   ```

This pipeline means that creatures genuinely **smell their environment** through the CA system. A food plant emitting into CA channel 6, for example, creates a diffusion gradient across rooms. A creature in a nearby room receives a non-zero value in smell chemical 171 (`FIRST_SMELL_CHEMICAL + 6 = 171`), and the corresponding `smel` lobe neuron fires, letting the brain associate that smell with the "food" category.

---

## How Creatures Sense the Environment

Beyond smell, creatures sense numerous environmental properties through the biochemistry's **[emitter loci](biochemistry_deep_dive.md#the-locus-system--binding-everything-together)** system. The [`GetLocusAddress()`](../../engine/Creature/Creature.cpp) method in `Creature.cpp` maps environment state to locus addresses that [emitter genes](genome_deep_dive.md#subtype-1--emitter-gene-g_emitter) read and convert to chemical concentrations.

### Sensorimotor Emitter Loci

The following emitter loci (defined in [`BiochemistryConstants.h`](../../engine/Creature/Biochemistry/BiochemistryConstants.h)) provide environmental sensing:

| Locus | ID | Source | Description |
|---|---|---|---|
| `LOC_CONST` | 0 | Always 1.0 | Constant emitter — fires a chemical every tick (used for baseline metabolism) |
| `LOC_ASLEEP` | 1 | `LifeFaculty` | 1.0 if creature is asleep, 0.0 otherwise |
| `LOC_COLDNESS` | 2 | *(unwired)* | Defined as "how far air temp is below blood temperature" but not implemented |
| `LOC_HOTNESS` | 3 | *(unwired)* | Defined as "how far air temp is above blood temperature" but not implemented |
| `LOC_LIGHTLEVEL` | 4 | *(unwired)* | Defined as "how bright the sky is" but not implemented |
| `LOC_CROWDEDNESS` | 5 | `Creature::Update()` | How crowded the room is with creatures of the same type |
| `LOC_RADIATION` | 6 | *(unwired)* | Defined as "how much radiation is present" but not implemented |
| `LOC_TIMEOFDAY` | 7 | *(unwired)* | Defined as "what time of day is it" but not implemented |
| `LOC_SEASON` | 8 | *(unwired)* | Defined as "what time of year is it" but not implemented |
| `LOC_AIRQUALITY` | 9 | `Creature::Update()` | 1.0 for breathable air; 0.0 in water rooms (types 8/9) |
| `LOC_UPSLOPE` | 10 | `Skeleton` physics | How steep the slope the creature faces uphill |
| `LOC_DOWNSLOPE` | 11 | `Skeleton` physics | How steep the slope the creature faces downhill |
| `LOC_HEADWIND` | 12 | *(unwired)* | Defined as "speed of wind coming towards me" but not implemented |
| `LOC_TAILWIND` | 13 | *(unwired)* | Defined as "speed of wind coming from behind" but not implemented |
| `LOC_E_INVOLUNTARY0–7` | 14–21 | `MotorFaculty` | Trigger [involuntary actions](caos_events.md#involuntary-actions-6472) (coughing, sneezing, shivering) |
| `LOC_E_GAIT0–15` | 22–37 | Biochemistry | Trigger specific walking [gaits](genome_deep_dive.md#subtype-4--gait-gene-g_gait) based on chemical state |
| `LOC_E_GAIT16` | 38 | *(unwired)* | Defined in enum but not handled by `GetLocusAddress()` |

> [!IMPORTANT]
> Several loci defined in `BiochemistryConstants.h` (LOC_COLDNESS, LOC_HOTNESS, LOC_LIGHTLEVEL, LOC_RADIATION, LOC_TIMEOFDAY, LOC_SEASON, LOC_HEADWIND, LOC_TAILWIND) are **not wired** in the C3/DS engine. They have no `case` in the `GetLocusAddress()` emitter dispatch and resolve to `myInvalidLocus` (always 0.0). These were likely intended for future implementation or were implemented in earlier Creatures versions.
>
> **How creatures actually sense temperature, light, and radiation:** The `SensoryFaculty` reads all 20 CA values from the creature's current room and writes them directly to **[smell chemicals](biochemistry_deep_dive.md#smell-chemicals-ids-165184)** (chemicals 165–184). Genome-defined [emitter genes](genome_deep_dive.md#subtype-1--emitter-gene-g_emitter) can then read from these smell chemicals and convert them to [drive-affecting chemicals](drives_and_learning.md#the-20-drives). The environmental sensing pathway is: **Room CA → SensoryFaculty → Smell Chemical → Emitter Gene → Drive Chemical**, *not* through the LOC_ emitter loci.

The **crowdedness** and **air quality** loci are particularly notable because they are computed directly in [`Creature::Update()`](../../engine/Creature/Creature.cpp):

```cpp
// Air quality: 0 in water rooms, 1 everywhere else
myAirQualityLocus = 1.0f;
int roomType;
if (GetMap().GetRoomType(roomId, roomType)) {
    if (roomType == WATER_ROOM_TYPE_1 || roomType == WATER_ROOM_TYPE_2)
        myAirQualityLocus = 0.0f;
}

// Crowdedness: read from navigable CA minus own contribution
myCrowdedLocus = 0.0f;
if (GetMap().GetRoomPropertyMinusMyContribution(AgentHandle(*this), value))
    myCrowdedLocus = value;
```

The water room check implements creature **drowning**: rooms of type 8 or 9 are treated as water, setting air quality to zero. Through genetically-defined emitter genes, this triggers chemical changes in the creature's bloodstream that can cause suffocation if the creature doesn't leave the water.

### The Situation Lobe — Environmental Awareness

In addition to the emitter loci, the [`SensoryFaculty::Update()`](../../engine/Creature/SensoryFaculty.cpp) directly writes environmental context to the brain's **[situation lobe](brain_deep_dive.md#standard-norn-brain-lobes)** (`situ`). This lobe receives nine inputs that capture the creature's high-level situational awareness (see also the [Drives & Learning — Situation Lobe](drives_and_learning.md#situation-lobe-situ) for how these integrate with the decision system):

| Neuron | Input | Description |
|---|---|---|
| 0 | `IP_AGE_LEVEL` | Creature's age as a fraction of total lifespan |
| 1 | `IP_IN_VEHICLE` | 1.0 if inside a vehicle (lift, pod, etc.), 0.0 otherwise |
| 2 | `IP_CARRYING_SOMETHING` | 1.0 if carrying an object |
| 3 | `IP_BEING_CARRIED` | 1.0 if being carried by another agent |
| 4 | `IP_FALLING` | 1.0 if not stopped (in motion / falling) |
| 5 | `IP_NEAR_OPPOSITE_SEX` | Proximity to nearest opposite-sex creature (inverse distance) |
| 6 | `IP_MUSIC_MOOD` | Music system mood value (ambient emotional context) |
| 7 | `IP_MUSIC_THREAT` | Music system threat value (danger ambient) |
| 8 | `IP_SELECTED_CREATURE` | 1.0 if this creature is the player's selected creature |

### The Detail Lobe — Object Inspection

When a creature has an "IT" object (the thing it's currently attending to), the **[detail lobe](brain_deep_dive.md#standard-norn-brain-lobes)** (`detl`) receives detailed information about that object (see also [Drives & Learning — Detail Lobe](drives_and_learning.md#detail-lobe-detl) for the complete input parameter reference):

| Neuron | Input | Description |
|---|---|---|
| 0 | `IP_IT_IS_BEING_CARRIED_BY_ME` | 1.0 if IT is being carried by this creature |
| 1 | `IP_IT_IS_BEING_CARRIED_BY_SOMEONE_ELSE` | 1.0 if IT is carried by another agent |
| 2 | `IP_IT_NEARNESS` | Proximity to IT (inverse of X distance, fires at < 128 pixels) |
| 3 | `IP_IT_IS_CREATURE` | 1.0 if IT is a creature |
| 4 | `IP_IT_IS_MYSIBLING` | 1.0 if IT shares a parent with this creature |
| 5 | `IP_IT_IS_MYPARENT` | 1.0 if IT is this creature's mother or father |
| 6 | `IP_IT_IS_MYCHILD` | 1.0 if IT is this creature's offspring |
| 7 | `IP_IT_IS_OPPOSITESEX` | 1.0 if IT is the same species but opposite sex |
| 8 | `IP_IT_IS_OF_THIS_SIZE` | Relative size of IT (width + height / 500) |
| 9 | `IP_IT_IS_SMELLING_THIS_MUCH` | IT's CA emission strength |
| 10 | `IP_IT_IS_FALLING` | 1.0 if IT is not stopped |

This gives creatures remarkably nuanced awareness — they can distinguish family members from strangers, assess object size, detect whether something is being carried, and evaluate proximity, all through genuine neural inputs rather than scripted conditions.

---

## The Agent Taxonomy — Biological Classification

Every object in the world is an [**agent**](caos_agents.md) identified by a three-part classifier: **Family**, **Genus**, and **Species**. This system functions as a biological taxonomy that creatures use to categorize and generalize about the world.

### The Classifier System

| Component | Typical Values | Description |
|---|---|---|
| **Family** | 1 = Simple, 2 = Compound, 3 = Vehicle, 4 = Creature | Basic agent type |
| **Genus** | 1–25 (simple), 1–10 (compound), 1–4 (creature) | Object category within family |
| **Species** | 0–65535 | Specific object type |

> **CAOS:** See [Agents](caos_agents.md) for how classifiers work in agent creation. See [Script Events](caos_events.md) for how scripts are dispatched by classifier.

### Category IDs — The Brain's View of the World

Creatures don't process raw classifiers. Instead, the [`SensoryFaculty`](../../engine/Creature/SensoryFaculty.cpp) maps every agent to one of approximately 40 **category IDs** (the exact number is data-driven from catalogue files). These category IDs correspond directly to neurons in the brain's **[noun lobe](brain_deep_dive.md#standard-norn-brain-lobes)** (`noun`), **smell lobe** (`smel`), **vision lobe** (`visn`), and **attention lobe** (`attn`).

The mapping is defined in the catalogue tag `"Agent Classifier"`:

| Category Range | Family/Genus | Description |
|---|---|---|
| 0–25 | Family 1, Genus 1–25 | Simple agents (plants, food, seeds, etc.) |
| 26–35 | Family 2, Genus 1–10 | Compound agents (machines, dispensers, buttons) |
| 36–39 | Family 4, Genus 1–4 | Creatures (Norn, Grendel, Ettin, Shee) |

> **Deep Dive:** The complete 40-slot category mapping is documented in [Agent Categories](caos_categories.md).

### Category Representative Selection

Each tick, the `SensoryFaculty` selects a single **representative agent** for each category — the "best example" of that type of object that the creature is currently aware of. Five different selection algorithms are available (configured per-category in the catalogue):

| Algorithm | ID | Behaviour |
|---|---|---|
| `PICK_NEAREST_IN_X_DIRECTION` | 0 | Closest object horizontally (default) |
| `PICK_A_RANDOM_ONE` | 1 | Random visible object of this category |
| `PICK_NEAREST_IN_CURRENT_ROOM` | 2 | Closest object in the same room |
| `PICK_NEAREST_TO_GROUND` | 3 | Object closest to the creature's feet |
| `PICK_RANDOM_NEAREST_IN_X_DIRECTION` | 4 | Random from up to 5 nearest objects |

The winning agent becomes the creature's "known agent" for that category. Its position is fed to the **vision lobe** (`visn`) as a normalized X displacement (−1 to +1, representing left/right relative to the creature at visual range 512 pixels), and optionally to the **elevation vision lobe** (`elvn`) as Y displacement.

### Vision — How Creatures See

The creature's visual processing pipeline:

1. **Enumeration:** `AgentManager::FindBySightAndFGS()` finds all agents matching a category classifier within the creature's visual range that pass line-of-sight checks

2. **Filtering:** Invisible agents (`attrInvisible`) are excluded. Agents above the creature's head by more than one body height, or below by more than two body heights, are excluded

3. **Vehicle isolation:** Creatures inside a non-open-air vehicle can only see objects inside the same vehicle. This correctly isolates lift passengers from the outside world

4. **Persistence:** If the creature is already "thinking about" a known agent for a category (noun lobe neuron activity > 0.20), and can still see it, it keeps that agent as the representative — providing cognitive continuity

5. **Carried override:** A carried object always becomes the representative for its category, ensuring creatures remain aware of what they're holding

---

## The Food Web and Ecological Loops

The world's ecosystem forms a multi-layered food web driven by the interaction of CA, agents, and creature biochemistry.

### Plants and the Nutrient Cycle

Plant agents (seeds, fruits, herbs, vegetables) are typically assigned to simple agent genera and emit into specific CA smell channels. They respond to room CA properties like nutrients, temperature, and light:

- **Nutrient uptake:** Plant timer scripts read the room's nutrient CA via [`PROP`](caos_map.md) and grow or reproduce when nutrients are sufficient
- **Growth → Reproduction:** Mature plants spawn seed/fruit agents that can be consumed by creatures
- **Smell emission:** Growing plants emit into navigable CA channels via [`EMIT`](caos_map.md), creating smell gradients that creatures can follow to find food

### Food → Creature Biochemistry

When a creature eats a food agent (firing [event script 12](caos_events.md#core-agent-events-014) = `Eat`), the agent's eat script typically uses [`STIM WRIT`](caos_messages.md) or [`STIM SHOU`](caos_messages.md) to deliver a stimulus to the eating creature. The creature's genetically-defined **[Stimulus genes](genome_deep_dive.md#subtype-0--stimulus-gene-g_stimulus)** then convert the eat event into:

- **Chemical injections:** Nutrient chemicals (starch, fat, protein) enter the bloodstream
- **Drive reduction:** Hunger chemicals decrease, generating a reward signal
- **Learning:** The reward strengthens the neural pathways that led to the eating behaviour

> **Deep Dive:** For the complete stimulus system, all 98 events, and worked learning examples, see [Drives & Reinforcement Learning](drives_and_learning.md).

### Environmental Hazards

The ecosystem includes environmental pressure through:

- **Drowning:** Water rooms (types 8/9) set `myAirQualityLocus` to 0, triggering suffocation chemistry
- **Radiation:** CA channel 4 carries radiation levels; SensoryFaculty writes these to smell chemical 169 (`FIRST_SMELL_CHEMICAL + 4`), and genome-defined emitter genes convert the smell chemical to harmful biochemical effects
- **Temperature:** CA temperature values (channel 1) are written to smell chemical 166 by SensoryFaculty; emitter genes then convert temperature levels into drive-affecting chemicals (coldness/hotness drives)
- **Pathogens:** Antigen chemicals (82–89, see [Biochemistry Deep Dive](biochemistry_deep_dive.md)) simulate infection

### Creature Navigation via CA Gradients

Creatures navigate the world by following CA gradients. The engine provides [`Map::WhichDirectionToFollowCA()`](../../engine/Map/MapCA.cpp) which:

1. Collects all rooms reachable from the current room (via navigable doors and links)
2. Reads the projected CA value for the target channel in each neighbour
3. Returns a direction (`GO_LEFT`, `GO_RIGHT`, `GO_UP`, `GO_DOWN`, `GO_IN`, `GO_OUT`, `GO_WALK_LEFT`, `GO_WALK_RIGHT`, `GO_NOWHERE`) toward the highest (approach) or lowest (retreat) value

The creature's motor faculty uses these directions to generate navigation decisions. For example, when hungry, the brain's decision network activates a "go towards food" behaviour, which triggers the creature to approach the CA gradient of food smell — navigating room by room toward the source.

> **CAOS:** [`HIRP`](caos_map.md) and [`LORP`](caos_map.md) find the adjacent room with highest/lowest CA. These are useful for debugging navigation by checking which direction the gradient points.

---

## Room Types — Predefining Environmental Behaviour

Room types (0–15) serve as environmental **presets** that determine how each CA property behaves in that room. The bootstrap scripts set up the rate matrix via `RATE`, creating a vocabulary of room environments:

| Room Type | Typical Use | CA Behaviour |
|---|---|---|
| 0 | Standard indoor | Moderate gain, moderate loss, moderate diffusion |
| 1–3 | Various outdoor | High diffusion (open air), varied temperature gain |
| 4–5 | Engineered spaces | Low diffusion (sealed), high gain (machinery effects) |
| 8 | Water (surface) | Special: sets air quality to 0 for creatures |
| 9 | Water (deep) | Special: sets air quality to 0 for creatures |

The exact assignments are fully configurable by the bootstrap scripts. The engine only hardcodes two room type meanings: types 8 and 9 trigger the water/drowning mechanic.

> **CAOS:** [`RTYP`](caos_map.md) sets the room type. [`RATE`](caos_map.md) sets the CA rates for a room type / CA index combination.

---

## Source References

| Topic | Source Files |
|---|---|
| Map and room system | [Map.h](../../engine/Map/Map.h), [Map.cpp](../../engine/Map/Map.cpp) |
| Cellular automata simulation | [MapCA.cpp](../../engine/Map/MapCA.cpp), [RoomCA.cpp](../../engine/Map/RoomCA.cpp), [RoomCA.h](../../engine/Map/RoomCA.h) |
| CA rates | [CARates.h](../../engine/Map/CARates.h) |
| Map interface (for testing) | [IMap.h](../../engine/Map/IMap.h) |
| Agent CA emission | [Agent.h](../../engine/Agents/Agent.h), [Agent.cpp](../../engine/Agents/Agent.cpp) |
| Creature environment sensing | [Creature.cpp](../../engine/Creature/Creature.cpp) |
| Sensory faculty (smell, vision) | [SensoryFaculty.h](../../engine/Creature/SensoryFaculty.h), [SensoryFaculty.cpp](../../engine/Creature/SensoryFaculty.cpp) |
| Emitter locus constants | [BiochemistryConstants.h](../../engine/Creature/Biochemistry/BiochemistryConstants.h) |

### See Also

- [Game Philosophy — Overview](game_philosophy.md) — High-level design philosophy
- [Map & Rooms — CAOS Reference](caos_map.md) — All map/room/CA CAOS commands
- [Agents — CAOS Reference](caos_agents.md) — Agent creation and manipulation
- [Creatures — CAOS Reference](caos_creatures.md) — Creature commands including [`APPR`](caos_creatures.md#appr--approach-it) (CA-guided approach)
- [Agent Categories](caos_categories.md) — The 40-slot category system
- [Script Events & Messages](caos_events.md) — Event numbers, creature decisions, and [involuntary actions](caos_events.md#involuntary-actions-6472)
- [Biochemistry Deep Dive](biochemistry_deep_dive.md) — Chemical simulation, [smell chemicals](biochemistry_deep_dive.md#smell-chemicals-ids-165184), and the [locus system](biochemistry_deep_dive.md#the-locus-system--binding-everything-together)
- [Drives & Reinforcement Learning](drives_and_learning.md) — The stimulus system, [sensory lobe inputs](drives_and_learning.md#situation-lobe-situ), and learning loop
- [Brain & SVRules Deep Dive](brain_deep_dive.md) — Neural architecture, [lobe table](brain_deep_dive.md#standard-norn-brain-lobes), and processing pipeline
- [The Digital Genome](genome_deep_dive.md) — Gene definitions for [emitters](genome_deep_dive.md#subtype-1--emitter-gene-g_emitter), [stimuli](genome_deep_dive.md#subtype-0--stimulus-gene-g_stimulus), and [gaits](genome_deep_dive.md#subtype-4--gait-gene-g_gait)
