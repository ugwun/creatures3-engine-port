# CAOS Reference: Agent Categories

Creatures perceive the world through a **40-slot category system**. Every agent in the game is classified into one of these categories based on its `family` and `genus`. These categories feed directly into the creature's brain — they are the neurons in the `noun` lobe that represent "what am I looking at?"

Understanding this system is essential for building agents that creatures can learn to interact with.

---

## How Categories Work

The creature's `SensoryFaculty` scans all visible agents each tick and classifies them using two parallel catalogue arrays defined in `Docking Station.catalogue`:

- **`"Agent Classifiers"`** — 40 classifier patterns `(family genus species)`. Species `0` = wildcard (matches any species).
- **`"Agent Categories"`** — 40 human-readable names, one per slot.

The engine function `GetCategoryIdOfClassifier()` iterates through the classifier list and returns the first match. If no classifier matches, it returns **slot 39** (`"something"`) — the error/catch-all category.

### The Perception Pipeline

```
Agent Classifier (family/genus/species)
        ↓
  SensoryFaculty::GetCategoryIdOfClassifier()
        ↓
  Brain Category Slot (0–39)
        ↓
  "noun" lobe neuron activation
        ↓
  Creature perceives object as "food", "toy", "dispenser", etc.
        ↓
  "verb" lobe neuron decides action (push, pull, eat, approach...)
        ↓
  Reinforcement learning: "pushing a dispenser reduced my hunger!"
```

> **Key insight:** The brain only distinguishes objects by **family and genus**. Species is always a wildcard (`0`) in the classifier table. This means a creature sees *all* agents with `family 2, genus 23` as "dispensers" — it cannot tell species 1 from species 800. Species only matters at the script level (which Scriptorium scripts fire).

---

## Complete Category Table

### Family 2 — Simple & Compound Objects (Slots 0–25)

| Slot | Classifier | Category | Description | Algorithm |
|------|-----------|----------|-------------|-----------|
| 0 | 999 999 999 | **self** | The creature itself | Nearest X |
| 1 | 2 1 0 | **hand** | Player pointer | Nearest X |
| 2 | 2 2 0 | **door** | Doors | Nearest X |
| 3 | 2 3 0 | **seed** | Seeds | Random nearest |
| 4 | 2 4 0 | **plant** | Plants | Nearest X |
| 5 | 2 5 0 | **weed** | Weeds | Nearest X |
| 6 | 2 6 0 | **leaf** | Leaves | Nearest X |
| 7 | 2 7 0 | **flower** | Flowers | Nearest X |
| 8 | 2 8 0 | **fruit** | Fruits | Random nearest |
| 9 | 2 9 0 | **manky** | Decayed/rotten food | Nearest X |
| 10 | 2 10 0 | **detritus** | Waste and debris | Nearest X |
| 11 | 2 11 0 | **food** | Edible items | Random nearest |
| 12 | 2 12 0 | **button** | Buttons and switches | Nearest X |
| 13 | 2 13 0 | **bug** | Bugs (small insects) | Nearest X |
| 14 | 2 14 0 | **pest** | Pests (harmful insects) | Nearest X |
| 15 | 2 15 0 | **critter** | Small animals | Nearest X |
| 16 | 2 16 0 | **beast** | Large animals | Nearest X |
| 17 | 2 17 0 | **nest** | Nests | Nearest X |
| 18 | 2 18 0 | **animal egg** | Animal eggs | Nearest X |
| 19 | 2 19 0 | **weather** | Weather effects | Nearest X |
| 20 | 2 20 0 | **bad** | Dangerous things | Nearest X |
| 21 | 2 21 0 | **toy** | Toys | Random |
| 22 | 2 22 0 | **incubator** | Incubators | Nearest X |
| 23 | 2 23 0 | **dispenser** | Food dispensing machines | Nearest X |
| 24 | 2 24 0 | **tool** | Tools | Nearest X |
| 25 | 2 25 0 | **potion** | Potions | Nearest X |

### Family 3 — Complex Agents (Slots 26–35)

| Slot | Classifier | Category | Description | Algorithm |
|------|-----------|----------|-------------|-----------|
| 26 | 3 1 0 | **elevator** | Elevators / lifts | Nearest X |
| 27 | 3 2 0 | **teleporter** | Teleporters | Nearest X |
| 28 | 3 3 0 | **machinery** | Machinery | Random |
| 29 | 3 4 0 | **creature egg** | Creature eggs | Nearest X |
| 30 | 3 5 0 | **norn home** | Norn habitats | Nearest X |
| 31 | 3 6 0 | **grendel home** | Grendel habitats | Nearest X |
| 32 | 3 7 0 | **ettin home** | Ettin habitats | Random |
| 33 | 3 8 0 | **gadget** | Gadgets | Nearest X |
| 34 | 3 9 0 | **portal** | Portals | Nearest X |
| 35 | 3 10 0 | **vehicle** | Vehicles | Nearest X |

### Family 4 — Creatures (Slots 36–39)

| Slot | Classifier | Category | Description | Algorithm |
|------|-----------|----------|-------------|-----------|
| 36 | 4 1 0 | **norn** | Norns | Nearest X |
| 37 | 4 2 0 | **grendel** | Grendels | Nearest X |
| 38 | 4 3 0 | **ettin** | Ettins | Nearest X |
| 39 | 4 4 0 | **something** | Unknown / error catch-all | — |

---

## Representative Algorithms

When multiple agents of the same category are visible, the brain must choose one as the "representative" — the specific agent that the creature pays attention to. The algorithm used is defined per category in the `"Category Representative Algorithms"` catalogue:

| ID | Algorithm | Description |
|---|---|---|
| 0 | **Nearest in X** | Picks the closest agent horizontally. The default for most categories. |
| 1 | **Random** | Picks a random visible agent of this category. Used for toys, machinery, gadgets. |
| 2 | **Nearest in room** | Picks the closest agent in the creature's current room only. |
| 3 | **Nearest to ground** | Picks the agent closest to the floor (lowest Y). |
| 4 | **Random nearest** | Picks randomly from the 5 nearest agents. Used for seeds, fruit, food. |

> **Why "Random nearest" for food?** If the nearest food item was always chosen, all creatures would cluster around the same carrot. The random-nearest algorithm introduces variety — each Norn might choose a different nearby food item, leading to more natural-looking behaviour.

---

## CAOS Commands

Three commands let you query the category system from CAOS scripts:

### CATI — Category ID for Classifier

```caos
outv cati 2 23 0
* Returns: 23 (the "dispenser" slot)

outv cati 4 1 0
* Returns: 36 (the "norn" slot)

outv cati 2 99 0
* Returns: 39 (the "something" error slot — genus 99 is unknown)
```

Returns the category slot index for the given `(family, genus, species)` classifier. See [CATI](caos_agents.md#cati--category-id-for-classifier) in the Agents reference.

### CATA — Category ID for Target

```caos
rtar 2 23 800
outv cata
* Returns: 23 (same as cati, but reads from TARG's classifier)
```

Returns the category slot of `TARG`'s classifier. See [CATA](caos_agents.md#cata--category-id-for-target-ds) in the Agents reference.

### CATX — Category Name

```caos
outs catx 23
* Returns: "dispenser"

outs catx 39
* Returns: "something"
```

Returns the human-readable name for a given category slot. See [CATX](caos_agents.md#catx--category-name) in the Agents reference.

---

## Practical Examples

### Checking what category your agent is

```caos
* Create a feeder and check its category
new: simp 2 23 800 "ball" 6 0 500
outs "Category: " outs catx cata
outs " (slot " outv cata outs ")"
* Output: Category: dispenser (slot 23)
```

### Finding out why creatures ignore your agent

```caos
* Is your agent falling into the error category?
rtar 2 100 1
doif cata eq 39
    outs "WARNING: This agent is in the 'something' category!\n"
    outs "Creatures cannot form meaningful associations with it.\n"
    outs "Change your genus to one from the Agent Categories table."
endi
```

### Listing all categories and their representatives

```caos
* For each category, show the creature's current representative
targ norn
setv va00 0
loop
    outs catx va00
    outs ": "
    doif agnt va00 ne null
        outv agnt va00
    else
        outs "(none)"
    endi
    outs "\n"
    addv va00 1
untl va00 ge 40
```

### Common genus choices for custom agents

| Use Case | Recommended Genus | Category | Why |
|---|---|---|---|
| Food dispenser | **23** | dispenser | Creatures learn to push dispensers when hungry |
| Edible item | **11** | food | Creatures learn to eat food items |
| Interactive toy | **21** | toy | Creatures learn to play with toys when bored |
| Decoration | **24** | tool | Creatures can interact but won't seek it out |
| Hazardous object | **20** | bad | Creatures learn to avoid dangerous things |
| Plant / regrowable | **4** | plant | Fits into the ecosystem's plant category |

---

## Where to Find the Data

The category system is defined in **catalogue files** and loaded by the engine at startup:

| Data | Catalogue Tag | File |
|---|---|---|
| Classifier patterns | `"Agent Classifiers"` | `Catalogue/Docking Station.catalogue` |
| Category names | `"Agent Categories"` | `Catalogue/Docking Station.catalogue` |
| Representative algorithms | `"Category Representative Algorithms"` | `Catalogue/Docking Station.catalogue` |
| Brain lobe neuron labels | `"Agent Categories"` | `Catalogue/Brain.catalogue` |
| CA smell-to-category mapping | `"Cellular Automata Names"` | `Catalogue/Docking Station.catalogue` |

The engine implementation lives in `SensoryFaculty.cpp`:
- `SetupStaticVariablesFromCatalogue()` — loads the arrays at startup
- `GetCategoryIdOfClassifier()` — the matching function
- `Update()` — scans visible agents and selects representatives per category

---

## Relationship to Other Systems

### Brain Lobes

The following brain lobes use category IDs as their neuron index (see [Standard Norn Brain Lobes](brain_deep_dive.md#standard-norn-brain-lobes) for the complete architecture):

| Lobe | Quad | Purpose |
|---|---|---|
| Attention | `attn` | Which category the creature is paying attention to |
| Decision | `decn` | What action to take with the attended category |
| Noun | `noun` | Input: which categories are being stimulated |
| Vision | `visn` | Input: X displacement of each category's representative |
| Smell | `smel` | Input: room CA smell levels per category |
| Stim Source | `stim` | Which category triggered the last stimulus |

### BHVR (Creature Permissions)

The [`BHVR`](caos_agents.md#bhvr--setget-creature-permissions) command controls which actions creatures are *allowed* to perform on an agent. Even if your agent is in the right category, creatures won't interact with it unless `BHVR` is set. `BHVR` gates the `verb` lobe — it tells the brain which action neurons are valid for this agent.

### Stimuli (STIM WRIT)

When a creature interacts with an agent, the engine sends a **stimulus** to the creature. The stimulus includes the agent's category ID, which the brain uses for associative learning. If the agent is in category 39 ("something"), the learning signal is essentially noise — the creature can't form useful memories.

See [Messages & Stimuli](caos_messages.md) for the `STIM WRIT` and `STIM SHOU` commands.

---

[← Back to CAOS Overview](caos_overview.md)
