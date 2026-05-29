# Intermediate CAOS Tutorial: Build a Creature Feeder

Welcome back! In the [beginner tutorial](caos_tutorial.md) you learned the fundamentals — variables, loops, simple agents, the Scriptorium, and basic debugging. Now it's time to build something **real**.

In this tutorial you will build a working **Creature Feeder** — an interactive gadget that creatures can push to receive food. Along the way you'll learn compound agents, sprite animation, physics, creature interaction, inter-agent messaging, and multi-script debugging.

**What you'll build:**

- A compound agent with multiple visual parts
- A constructor script that initialises state and physics
- Creature event scripts (Push, Pull, Activate)
- Biochemistry injection — actually feeding creatures
- Agent-to-agent messaging with `MESG WRT+`
- A full multi-script debugging workflow

> **Prerequisites:** Complete the [beginner tutorial](caos_tutorial.md) first. The engine must be running with `--tools` and a world with at least one creature must be loaded. Open `http://localhost:9980` in your browser.

---

## Part 1: Understanding Compound Agents

In the beginner tutorial, every agent we created used `new: simp` — a **simple agent** with a single sprite. That works for simple props like food items and seeds, but if you look at the real agents in the Docking Station world — the Teleporters, the Medical Bay, the Learning Room consoles — they all have **multiple visual components** that work together: displays that update independently, buttons that respond to clicks, indicator lights that show state.

These are **compound agents**, and they're the backbone of the game's gadget ecosystem. Understanding them unlocks the ability to build agents that feel like they belong in the world.

### 1.1 — Simple vs Compound

| Feature | Simple Agent (`new: simp`) | Compound Agent (`new: comp`) |
|---|---|---|
| Parts | 1 sprite only | Multiple parts (buttons, displays, indicators) |
| Click regions | Whole agent is clickable | Each part has independent click handling |
| Animation | Single animation | Each part animates independently |
| Use case | Food items, simple seeds, critters | Machines, gadgets, vendors, control panels |

### 1.2 — Your First Compound Agent

Let's start by creating a compound agent to understand the pattern. In the **CAOS IDE**, type and run (**▶ Run**):

```caos
* === Part 1: Basic Compound Agent ===
* Create a compound agent using the "ball" sprite
* Classifier: family=2, genus=100, species=700

new: comp 2 100 700 "ball" 6 0 500

* Add a second part — an indicator using the same sprite
* pat: dull creates a non-interactive display part
* Part 1, sprite "ball", first image 0, offset (30, -20), relative plane +1
pat: dull 1 "ball" 0 30 -20 1

* Move the whole agent to a visible position
mvto 1000 8900

* Set attributes: Carryable + Mouseable + Activateable + Wallbound + Physics
attr 199

outs "Compound agent created! ID: "
outv unid
```

You should see the agent appear in the world — **two ball sprites**, with the second offset to the right and slightly above.

![two ball sprite](/docs/media/two_ball_sprite.png)

> **Key concept: Parts.** Part 0 is created automatically by `new: comp`. Additional parts are added with `pat: dull` (display-only), `pat: butt` (clickable button), or `pat: text` (text display). Parts are positioned relative to part 0.

### 1.3 — Controlling Individual Parts

Each part can be animated independently. Run this:

```caos
* Target our compound agent
rtar 2 100 700

* Animate part 0 (the main body)
part 0
anim [0 1 2 3 4 5 255]

* Set part 1 to a fixed pose
part 1
pose 3
```

The main body loops through all 6 frames while the indicator stays fixed on frame 3. The `part` command selects which part subsequent `pose`/`anim` commands affect.

### 1.4 — Clean Up

```caos
inst
enum 2 100 700
    kill targ
next
outs "Cleaned up!"
```

---

## Part 2: Designing the Feeder

Before writing any code, let's think about what we're building and how it fits into the game's ecosystem.

In Creatures, the world is a living system. Creatures have **biochemistry** — 256 chemicals flowing through their bloodstream, driving their behaviour. When a Norn is hungry, specific chemicals build up, triggering drives that make the creature seek food. The existing food agents (carrots, seeds, fruits) work by injecting specific nutrient chemicals when a creature eats them. Our feeder will tap into exactly the same biochemistry pipeline, making it feel native to the game.

### 2.1 — The Design

Our feeder will use these game mechanics:

| Component | Implementation | Game System |
|---|---|---|
| **Visual body** | Part 0 — the main feeder body | Sprite/rendering system |
| **State indicator** | Part 1 — shows ready or recharging | Compound agent parts |
| **Food supply** | `ov00` — tracks remaining food (starts at 5) | Agent variable state |
| **Recharge timer** | Event 9 (Timer) — refills food supply over time | Script scheduler |
| **Creature feeding** | Event 1 (Push) — creatures push it to receive food | Creature decision-making + biochemistry |
| **Player interaction** | Event 1 also handles player left-click (see §4.3) | Input/activation system |
| **Status check** | Event 2 (Pull) — shows remaining food count | Creature interaction permissions |

This design mirrors how real game agents are structured. Browse the **Scriptorium** in the CAOS IDE and look at any complex agent — you'll find the same pattern: an install script that creates and configures the agent, plus a set of event scripts that define its behaviour.

### 2.2 — Choosing a Classifier

Every agent needs a unique classifier `(family, genus, species)`. The classifier determines which scripts in the Scriptorium apply to it — when a creature pushes an agent with classifier `2 23 800`, the engine looks up script `scrp 2 23 800 1` (family, genus, species, event=Push).

We'll use:

- **Family 2** — simple/compound objects (the standard family for gadgets and interactive items)
- **Genus 23** — the "dispenser" genus (see below)
- **Species 800** — our unique feeder species

> **Critical concept: Brain Categories.** The genus isn't just a number — it determines how creatures **perceive** the agent. Every creature has a `SensoryFaculty` that maps agent classifiers to one of 40 **brain categories** using the `"Agent Classifiers"` catalogue. These categories feed directly into the creature's `noun` brain lobe — neurons labelled "food", "toy", "dispenser", "door", etc. The creature can only learn associations with objects that fall into a known category. See [Standard Norn Brain Lobes](brain_deep_dive.md#standard-norn-brain-lobes) for the complete lobe table.
>
> Family 2, genus 23 maps to the **"dispenser"** category (brain slot 23). This means Norns will perceive our feeder as a dispenser, allowing their brains to form associations like *"when I push a dispenser, my hunger goes down"* through the reinforcement learning system. If we used an unrecognised genus (like 100), the feeder would fall into the catch-all **"something"** error category (slot 39) — the creature could physically interact with it, but its brain couldn't form meaningful memories about it.
>
> Some key genus-to-category mappings for family 2: genus 8 = "fruit", genus 11 = "food", genus 21 = "toy", genus 23 = "dispenser", genus 24 = "tool". You can verify any classifier's category in the Console: `outv cati 2 23 0` returns `23` (the "dispenser" slot).
>
> **Species** (800) can be anything — the brain only distinguishes by family and genus. Species differentiates your agent at the script level (so your feeder's scripts don't clash with other dispensers).
>
> For the complete 40-slot category table and detailed explanation, see the [Agent Categories Reference](caos_categories.md).

### 2.3 — OV Variables as State

In the beginner tutorial, you used `ov00` as a simple counter. For the feeder, we'll use multiple OV variables as a **state machine**:

| Variable | Purpose | Initial Value |
|---|---|---|
| `ov00` | Food remaining | 5 |
| `ov01` | Maximum food capacity | 5 |
| `ov02` | Recharge rate (ticks between refills) | 100 |
| `ov03` | Total food dispensed (lifetime counter) | 0 |

> **Reminder:** OV variables (`ov00`–`ov99`) belong to the **agent** and persist between script executions. VA variables (`va00`–`va99`) are **local** to a single script run and are lost when the script finishes.

---

## Part 3: Building the Feeder — Install Script

The install script is the foundation of any agent — it creates the agent in the world, sets up its physical properties, initialises its internal state, and starts its timer. Think of it as the agent's "birth" — everything it needs to function must be configured here, because event scripts can only run on an agent that already exists.

### 3.1 — The Install Script

This is the **Run** script that creates the feeder agent and initialises all its state. Type this in the CAOS IDE and click **▶ Run**:

```caos
* =============================================
* CREATURE FEEDER — Install Script
* =============================================
* Creates the feeder agent and sets up initial state.
* Run this once with the Run button.

* Create the compound agent
* Using "ball" sprite: 6 frames, starting at 0, plane 500
new: comp 2 23 800 "ball" 6 0 500

* Add a status indicator part
* Part 1: positioned to the right, slightly above, one plane closer
pat: dull 1 "ball" 0 25 -15 1

* Move to a safe position in the Norn Meso
mvsf 1000 8900

* === Physics ===
attr 199
* 199 = Carryable(1) + Mouseable(2) + Activateable(4) + Wallbound(64) + Physics(128)

accg 5.0
* Gravity — the feeder falls to the floor like a real object

elas 10
* Low bounce — it's a machine, not a ball

fric 80
* High friction — stays put when placed

aero 10
* Some air resistance

* NOTE: We don't set bhvr (creature permissions) yet!
* bhvr requires the event scripts to exist in the Scriptorium first.
* We'll set it after injecting the event scripts in Part 4.

* === State Variables ===
setv ov00 5
* Food remaining

setv ov01 5
* Maximum capacity

setv ov02 100
* Recharge rate in ticks (~5 seconds between refills)

setv ov03 0
* Lifetime dispense counter

* === Visual Setup ===
* Set the main body to frame 0 (full/ready state)
part 0
pose 0

* Set the indicator to frame 5 (ready indicator)
part 1
pose 5

* === Start the Timer ===
tick 100
* Timer fires every 100 ticks (~5 seconds) for recharging

* === Set interaction range ===
rnge 200.0
* Creatures can see/interact with it from 200 pixels away

outs "Creature Feeder installed! ID: "
outv unid
outs "\nFood supply: "
outv ov00
outs "/"
outv ov01
```

### 3.2 — Verify the Agent Exists

After running the install script, let's confirm the agent was created properly:

1. Switch to the **Console** and run: `outv totl 2 23 800` — you should see `1`
2. Switch to the **Scripts** tab — you won't see anything for our agent *yet*, because the timer event script hasn't been injected into the Scriptorium. The `tick 100` command tells the agent to *fire* event 9 every 100 ticks, but the script that *handles* event 9 doesn't exist until we inject it in Part 4. The timer will simply fire into the void until then.

> **Don't see the Scripts tab updating?** Click **Refresh** or ensure "Auto" polling is enabled.

### 3.3 — Understanding the Physics Setup

The physics properties we set are crucial — they determine how the feeder interacts with the physical world: gravity, room boundaries, and creature movement.

Let's verify they're applied correctly. Go to the **Console** and run:

```caos
rtar 2 23 800
outs "Gravity: " outv accg
outs "\nElasticity: " outv elas
outs "\nFriction: " outv fric
outs "\nAttributes: " outv attr
```

Each physics property serves a specific purpose:

| Property | Value | Effect |
|---|---|---|
| `accg` (gravity) | 5.0 | Falls realistically — same value the game uses for creatures (`c3_creature_accg`) |
| `elas` (elasticity) | 10 | Almost no bounce when dropped — it's a heavy machine, not a bouncy ball |
| `fric` (friction) | 80 | Stays put — won't slide across the floor when a creature pushes it |
| `aero` (air resistance) | 10 | Slight drag — slows down if somehow thrown through the air |
| `attr` (attributes) | 199 | Physics + Wallbound + Activateable + Mouseable + Carryable |

> **Two separate flag systems: `attr` vs `bhvr`.** This is a common point of confusion. `attr` controls what the *engine* does with the agent — does gravity apply? Can the mouse interact with it? Does it collide with walls? Meanwhile, `bhvr` controls what *creatures* are allowed to do with it — which actions appear in the creature's neural decision-making system. A creature's brain has a `verb` lobe with neurons for actions like Push, Pull, Hit, and Eat. Setting `bhvr 3` (Push + Pull) means the creature's brain is *allowed* to decide to push or pull this agent. Without it, the feeder would be physically present but neurally invisible — creatures would walk right past it. See [Brain & SVRules Deep Dive](brain_deep_dive.md) for the complete neural architecture.

### 3.4 — About `mvsf` and the Room System

Notice we used `mvsf 1000 8900` instead of `mvto 1000 8900`. The `mvsf` command ("move to safe location") is essential for placing agents reliably. The Creatures world is divided into **rooms** — enclosed areas defined by the map system. An agent must be inside a valid room to interact with physics, creatures, and other agents. If you use `mvto` to place an agent at coordinates that aren't inside any room, the agent will exist in limbo — invisible to creatures, unaffected by gravity, essentially broken.

`mvsf` takes your target coordinates and finds the nearest valid in-room position, ensuring the agent always lands on solid ground inside a real room. Always prefer `mvsf` over `mvto` when placing agents for the first time. For the complete spatial hierarchy — metarooms, rooms, doors, and how the room system supports physics and creature navigation — see [The World Ecosystem — Deep Dive](world_ecosystem.md).

---

## Part 4: Event Scripts — Making It Interactive

Now comes the core of the tutorial: giving the feeder **behaviour** through event scripts. Each event script is injected into the Scriptorium under our classifier.

Remember the distinction from the beginner tutorial: **Run** executes code immediately and it's gone. **Inject** stores the script permanently in the Scriptorium, where the engine calls it automatically whenever the corresponding event fires on a matching agent. This is how the entire game world works — every carrot, every door, every teleporter has event scripts in the Scriptorium defining its behaviour.

### 4.1 — The Timer Script (Event 9)

The timer script handles automatic food recharging. This models a real-world concept: the feeder has an internal reservoir that slowly refills. Many game agents use this pattern — plants regrow, machines recharge, environmental effects cycle.

Set the classifier header in the CAOS IDE to **Family: 2, Genus: 23, Species: 800, Event: 9**, type the following, and click **Inject**:

```caos
* =============================================
* CREATURE FEEDER — Timer Script (Event 9)
* =============================================
* Fires every ov02 ticks.
* Slowly refills the food supply up to maximum.

* Only refill if below capacity
doif ov00 lt ov01
    * Add one unit of food
    addv ov00 1

    * Update the visual indicator based on food level
    part 1
    doif ov00 ge ov01
        * Full — show ready indicator
        pose 5
    elif ov00 gt 2
        * Partially full
        pose 3
    elif ov00 gt 0
        * Running low
        pose 1
    endi
endi
```

After injecting, verify it's working:

1. Go to the **Console** and drain the food: `rtar 2 23 800 setv ov00 0`
2. Wait ~25 seconds (5 timer fires × 5 seconds each)
3. Check the food level: `rtar 2 23 800 outv ov00`
4. It should have refilled back towards 5!

### 4.2 — The Push Script (Event 1) — Feeding Creatures

This is the star of the show — when a creature pushes the feeder, it gets food. But before we write the code, let's understand *what feeding actually means* in the Creatures biochemistry system.

**How creature nutrition works:**

Every creature has a bloodstream containing 256 chemicals. When a creature eats food, the food agent injects specific chemicals into the creature's blood. These chemicals are then processed by the creature's organs through biochemical reactions:

1. **Starch** (chemical 5) is a raw carbohydrate energy source
2. The creature's digestive organ contains **reactions** that convert Starch into **Glucose** (the primary energy carrier)
3. Glucose drives down the **Hunger for Carbohydrate** drive (drive 2)
4. As the drive decreases, the corresponding neurons in the `driv` brain lobe lose activation
5. The creature's `decn` (decision) lobe shifts attention away from food-seeking behaviour

This chain — **chemical → reaction → drive → brain → behaviour** — is the core feedback loop that makes Creatures feel alive.

> **Critical concept: Drive Chemical IDs.** In Creatures 3, each drive has a **dedicated drive chemical** that lives at a *specific* chemical ID — but they're NOT chemicals 0–19! The drive chemicals start at ID **148**: Pain=148, Hunger for Protein=**149**, Hunger for Carbohydrate=**150**, Hunger for Fat=151, and so on up to 164. You can verify this yourself: open the **Chemistry** sub-tab in the Creatures tab and filter for chemicals 148–164. These IDs are defined in the engine's `drive_chemical_numbers` catalogue. Meanwhile, chemicals 1–13 are metabolic substances like Lactate, Pyruvate, Glucose, and Protein — completely unrelated to drives! This distinction trips up many CAOS scripters.

Our feeder will take a shortcut and directly manipulate these drive chemicals, bypassing the slow digestion pipeline.

> **Tip:** You can explore this pipeline yourself using the **Creatures** tab. Select a creature and compare the **Chemistry** sub-tab (raw chemical levels), the **Drives** sub-tab (processed drive levels), and the **Brain** sub-tab (neural activation). Watch how they're connected!

Now set the classifier to **2 / 23 / 800 / 1** and **Inject**:

```caos
* =============================================
* CREATURE FEEDER — Push Script (Event 1)
* =============================================
* This script fires in TWO cases:
*   1. A creature pushed the feeder (FROM = the creature)
*   2. The player left-clicked the feeder (FROM = the pointer or null)
* We handle both cases with a two-step creature lookup.

* Check if we have food
doif ov00 gt 0
    * Dispense! Subtract one unit
    subv ov00 1

    * Increment lifetime counter
    addv ov03 1

    * Animate the dispense action on part 0
    part 0
    anim [1 2 3 4 5 0 255 5]
    * Plays frames 1→2→3→4→5→0 then stops

    * === Find a creature to feed ===
    * Save our reference before changing TARG
    setv va00 unid
    setv va01 0

    * Step 1: Try to use FROM (the creature that pushed us)
    doif from ne null
        doif crea from eq 1
            * FROM is a creature — target it directly
            targ from
            setv va01 1
        endi
    endi

    * Step 2: If FROM wasn't a creature (player click),
    * find any creature in the world
    doif va01 eq 0
        rtar 4 0 0
        doif targ ne null
            setv va01 1
        endi
    endi

    * === Feed the creature ===
    doif va01 eq 1
        * Each drive has a dedicated 'drive chemical' (see Part 4.2 intro).
        * Chemical 149 = 'Hunger for protein' (drive 1)
        * Chemical 150 = 'Hunger for carbohydrate' (drive 2)
        * We satisfy hunger instantly by subtracting these chemicals!
        * NOTE: these are NOT chemicals 1 and 2! Those are Lactate/Pyruvate.
        chem 149 -1.0
        chem 150 -1.0

        * Also give some Starch (5) for the digestion pipeline
        chem 5 0.5
    endi

    * Restore TARG to ourselves
    targ agnt va00

    * Update the indicator
    part 1
    doif ov00 le 0
        * Empty — show empty indicator
        pose 0
    elif ov00 le 2
        * Running low
        pose 1
    else
        * Still has food
        pose 3
    endi
else
    * No food — animate a "deny" response
    part 0
    anim [5 4 5 4 0 255 4]
endi
```

> **Critical concept: Event 1 = Player Click AND Creature Push.** When the player left-clicks an agent, the engine sends message `ACTIVATE1` (message ID 0), which maps to **script event 1** — the same event that fires when a creature pushes the agent. This means your Push script must handle *both* cases. The key difference is the `FROM` variable: when a creature pushes, `FROM` is the creature; when the player clicks, `FROM` is the pointer agent (or null). We check `crea from` to distinguish them.

> **Key concept: The `rtar` fallback.** When `FROM` isn't a creature (player click), we use `rtar 4 0 0` to find a creature. `rtar` (Random Target) picks a random agent matching the classifier anywhere in the world. Family 4 = creatures, genus/species 0 = wildcard. This means the feeder will feed *some* creature, though not necessarily the nearest one. For a production agent, you might use `esee 4 0 0` (enum agents in sight) instead — but `esee` respects line-of-sight through walls, which can be tricky in multi-room metarooms.

> **Key concept: TARG switching.** The `chem` command operates on TARG, so we need to change TARG to the creature. But this changes TARG away from our feeder! We save our own ID in `va00` first, then use `targ agnt va00` to switch back afterwards. Forgetting this restore step is one of the most common CAOS bugs — subsequent commands would accidentally operate on the creature instead of the feeder, causing subtle and confusing misbehaviour.

> **Why not use `stim writ` instead of `chem`?** You might wonder why we don't just use `stim writ targ 79` (the stimulus for "Ate Food") like a Carrot does. The `stim writ` command sends a stimulus to the creature, which triggers the brain's reinforcement learning system — the creature needs to have *attention* on the feeder, and the [stimulus gene](genome_deep_dive.md#subtype-0--stimulus-gene-g_stimulus) for "Ate Food from a dispenser" needs to exist in the creature's genome. Our direct `chem` approach bypasses all of that and works reliably regardless of the creature's attention state. In a production agent, you'd ideally use *both*: `stim writ` so the creature learns, plus `chem` as a guaranteed fallback. For this tutorial, `chem` alone keeps things simple and predictable.

### 4.3 — Understanding Event Numbers

Before we continue, let's clarify a common source of confusion: the mapping between **message IDs** and **script event numbers**.

When the player left-clicks an agent, the engine sends message `ACTIVATE1` (message ID **0**). But this triggers **script event 1** — NOT event 0! The mapping is:

| Player Action | Message ID | Script Event | Tutorial Name |
|---|---|---|---|
| Left-click | ACTIVATE1 (0) | **Event 1** | Push Script |
| Right-click | ACTIVATE2 (1) | **Event 2** | Pull Script |
| Shift-click | DEACTIVATE (2) | **Event 0** | — |
| Pick up | PICKUP (4) | **Event 4** | — |

This means our Push Script (Event 1) handles *both* creature pushes AND player clicks — which is exactly why we added the `rtar` fallback in the previous section.

> **Why the offset?** The original Creatures engine used a different numbering for messages vs. scripts. Message ID 0 maps to script event 1 because the internal `HandleActivate1()` function dispatches to `SCRIPTACTIVATE1 = 1`. This is a historical quirk that you simply have to memorise.

> For the **complete table** of all ~70 built-in events — including creature decision scripts, involuntary actions, pointer events, and system events — see the [Script Events & Messages](caos_events.md) reference.

### 4.4 — The Pull Script (Event 2) — Status Report

When a creature pulls the feeder, it reports its status. Set classifier to **2 / 23 / 800 / 2** and **Inject**:

```caos
* =============================================
* CREATURE FEEDER — Pull Script (Event 2)
* =============================================
* A creature pulled the feeder. Just animate to acknowledge.

* Quick acknowledgement animation
part 0
anim [0 3 0 255 2]
```

### 4.5 — Enabling Creature Permissions (`bhvr`)

Now that all event scripts are installed in the Scriptorium, we can finally set the creature interaction permissions. Run this in the **Console**:

```caos
rtar 2 23 800
bhvr 3
outs "Creature permissions set! bhvr = "
outv bhvr
```

> **Why didn't we set `bhvr` in the install script?** The `bhvr` command validates that the corresponding event scripts actually exist in the Scriptorium. Setting `bhvr 3` (Push + Pull) requires scripts for events 1 and 2 to be installed for classifier `2 23 800`. If you try to set `bhvr` before injecting those scripts, the engine throws: *"Tried to set BHVR when the agent doesn't have one of the appropriate scripts."*
>
> This is a safety mechanism — the engine prevents you from advertising capabilities that don't exist. A creature's brain would try to Push the agent, but with no Push script to handle the event, nothing would happen. The engine catches this mistake at setup time rather than letting it fail silently at runtime.
>
> **The takeaway:** Always inject your event scripts *before* setting `bhvr`. The correct workflow is: **create agent → inject scripts → set permissions.**

Let's verify the creature permissions are now active:

```caos
rtar 2 23 800
outs "Attributes: " outv attr
outs "\nBehaviour: " outv bhvr
```

You should see `Behaviour: 3` — creatures can now Push (1) and Pull (2) the feeder.

> **`attr` vs `bhvr` — two separate flag systems.** This is a common point of confusion. `attr` controls what the *engine* does with the agent — does gravity apply? Can the mouse interact with it? Does it collide with walls? Meanwhile, `bhvr` controls what *creatures* are allowed to do with it — which actions appear in the creature's neural decision-making system. A creature's brain has a `verb` lobe with neurons for actions like Push, Pull, Hit, and Eat. Setting `bhvr 3` means the creature's brain is *allowed* to decide to push or pull this agent. Without it, the feeder would be physically present but neurally invisible — creatures would walk right past it.

### 4.6 — Testing the Complete Agent

Now let's test everything together. In the **Console**:

```caos
* Check the feeder's state
rtar 2 23 800
outs "Food: " outv ov00 outs "/" outv ov01
outs "\nTotal dispensed: " outv ov03
```

To simulate a player clicking the feeder, we send it an `ACTIVATE1` message (message ID **0** — which triggers script event 1):

```caos
* Send ACTIVATE1 (message 0) to the feeder
* This triggers the Push Script (event 1)
inst
rtar 2 23 800
mesg wrt+ targ 0 0 0 0
```

The feeder's Push Script fires: it decrements the food counter, plays the dispensing animation, and uses the `rtar 4 0 0` fallback to find a creature to feed (since `FROM` from the Console is null, not a creature).

> **Important:** After triggering the feeder, you must wait a few seconds before checking the creature's drives. The `chem` command modifies the creature's chemical concentrations immediately, but the creature's **biochemistry organs** need several ticks to process those chemicals into drive changes. Check the **Drives** sub-tab after 5–10 seconds to see the hunger reduction.

> **Testing tip:** To simulate a *creature* pushing the feeder (so `FROM` is a real creature), pick up a Norn with your hand pointer and drop it next to the feeder. The Norn's brain may decide to push the feeder on its own — or you can set `bhvr 3` first (see section 4.5) and wait for the creature to interact naturally.

---

## Part 5: Verifying with the Creatures Tab

The **Creatures** tab is the most powerful tool for verifying that your agent actually integrates with the game's biology systems. Let's use it to prove our feeder is working correctly.

### 5.1 — Setting Up the Observation

1. Switch to the **Creatures** tab
2. Select a creature from the list — pick one that's awake and active
3. Click the **Focus** button in the toolbar to snap the camera to this creature
4. Note the creature's current state in the **Summary Card** on the right: health, highest drive, age

### 5.2 — Watching Drive Changes

1. Click the **Drives** sub-tab
2. Note the current Hunger levels — pay attention to **Hunger for Protein (drive 1)** and **Hunger for Carbohydrate (drive 2)**.
3. Go back to Console and trigger the feeder a few times with the `mesg wrt+` command from section 4.6.
4. Wait a few seconds for the biochemistry to tick, then return to **Creatures** — the hunger drives should have dropped significantly!

The negative `chem` commands we used inject directly into the creature's drive chemical slots (chemicals 149 and 150), which are the actual chemicals that the `driv` lobe reads. Within a few biochemistry ticks, the drives recalculate from the new chemical levels and the creature feels satisfied.

### 5.3 — Monitoring Chemistry

While `stim` affects drives directly, the actual metabolic pipeline handles real chemicals like Starch. In a real game object, you often do both: trigger the stimulus so the creature feels full, and inject a real nutrient that will metabolize over time to provide lasting Energy (like Sodium thiosulphate or Glucose).
If you were to inject chemicals via script (e.g., `chem 5 0.5`), you could observe them here:

1. With the same creature selected, click the **Chemistry** sub-tab
2. Toggle **"Non-zero only"** to reduce clutter — this filters out the ~200 chemicals that are at zero concentration
3. If you used the Syringe to inject Chemical 5 (Starch), look for it near the top of the list
4. The concentration will gradually decay
5. The decay is driven by **chemical half-lives** — each chemical has a genetically defined decay rate (see [Half-Lives Gene](genome_deep_dive.md#subtype-3--half-lives-gene-g_halflife)). You can inspect these in the creature's genome via the **Genome** sub-tab (look for the "Halflives" gene under Biochemistry)

### 5.4 — Using the Syringe for Experimentation

Before committing chemical choices to code, the **Syringe** is invaluable for rapid prototyping:

1. Click the **Syringe** toggle in the Chemistry sub-tab toolbar
2. Search for a chemical by name or ID
3. Set a dosage (e.g., 0.5) and click inject
4. Immediately observe the effect on the Drives sub-tab

This workflow — **Syringe → observe Drives → code into agent** — is much faster than editing CAOS scripts and re-injecting. Use it to discover which chemicals have the most interesting effects before wiring them into your feeder.

---

## Part 6: Inter-Agent Messaging

So far, the feeder works in isolation — it does its job, but nothing else in the world knows about it. In a real game ecosystem, agents communicate constantly. The Teleporter sends messages to its destination pad. Elevators send messages to their call buttons. The egg-laying machinery coordinates between multiple agents to produce a new creature.

The CAOS messaging system (`MESG WRT+`) is how agents talk to each other. It's the glue that turns a collection of isolated objects into a living, interconnected world. Let's add a **companion agent** — a notification beacon — that reacts when the feeder dispenses food.

### 6.1 — Creating the Beacon

Run this install script:

```caos
* =============================================
* FOOD BEACON — Install Script
* =============================================
* A companion agent that reacts to feeder events.

new: simp 2 23 801 "ball" 6 0 510
mvsf 1060 8900
attr 67
* 67 = Carryable(1) + Mouseable(2) + Wallbound(64)
* No Physics — it floats in place

setv ov00 0
* ov00 = flash counter

outs "Beacon installed! ID: "
outv unid
```

### 6.2 — Beacon Response Script

The beacon listens for a custom message. Set classifier to **2 / 23 / 801 / 100** and **Inject**:

```caos
* =============================================
* FOOD BEACON — Message Handler (Event 100)
* =============================================
* Triggered when the feeder sends us a message.
* _P1_ contains the food remaining count.

* Flash animation to indicate food was dispensed
anim [1 2 3 4 5 0 255 5]

* Store the food count from the message
setv ov00 _p1_
```

![feeder and beacon](/docs/media/feeder-beacon.png)

> **Why event 100?** The engine intercepts messages 0–14 and remaps them to different script events (see the table in section 4.3 — message 0 = ACTIVATE1 → event 1, not event 0). For custom inter-agent messaging, use event numbers **≥ 100** (avoid 90–100 which are reserved for UI). These go through the engine's `HandleOther` path, where the message number maps **directly** to the script event number — no remapping, no surprises.

### 6.3 — Connecting the Feeder to the Beacon

Now we need to modify the feeder's Push script to notify the beacon. The key command is `mesg wrt+`:

```
mesg wrt+ agent message_id param1 param2 delay
```

This sends a message to another agent with two parameters and an optional tick delay.

Let's update the Push script. Set classifier to **2 / 23 / 800 / 1** and re-inject this updated version:

```caos
* =============================================
* CREATURE FEEDER — Push Script (Event 1) [UPDATED]
* =============================================
* Now notifies the beacon after dispensing.

doif ov00 gt 0
    subv ov00 1
    addv ov03 1

    part 0
    anim [1 2 3 4 5 0 255 5]

    * Find a creature to feed (same logic as before)
    setv va00 unid
    setv va01 0
    doif from ne null
        doif crea from eq 1
            targ from
            setv va01 1
        endi
    endi
    doif va01 eq 0
        rtar 4 0 0
        doif targ ne null
            setv va01 1
        endi
    endi
    doif va01 eq 1
        chem 149 -1.0
        chem 150 -1.0
        chem 5 0.5
    endi
    targ agnt va00

    * === NEW: Notify all beacons ===
    * Send custom message 100 to all 2 23 801 agents
    * _P1_ = remaining food, _P2_ = 0
    * Save food count BEFORE enum changes TARG!
    setv va02 ov00
    setv va00 unid
    inst
    enum 2 23 801
        mesg wrt+ targ 100 va02 0 0
    next
    targ agnt va00

    * Update indicator
    part 1
    doif ov00 le 0
        pose 0
    elif ov00 le 2
        pose 1
    else
        pose 3
    endi
else
    part 0
    anim [5 4 5 4 0 255 4]
endi
```

> **Key concept: `MESG WRT+` with parameters.** The message carries data via `_P1_` and `_P2_`. Here we pass the remaining food count so the beacon knows the feeder's state. The receiving script reads these with `_p1_` and `_p2_`.

---

## Part 7: Debugging the Complete System

With four event scripts running across two agents, things can get complex. A bug in the Push script might silently break the beacon notification. A misplaced `targ` might inject chemicals into the wrong agent. The Debugger lets you trace execution across this entire chain, step by step.

This section teaches the full **IDE → Debugger** workflow — the same process you'd use to debug any misbehaving agent in the game.

### 7.1 — Setting Cross-Script Breakpoints

1. In the **CAOS IDE**, load the Push script: find `2 23 800` in the scriptorium sidebar and click event `1`
2. Click the line number next to `subv ov00 1` to set a breakpoint (red dot)
3. In the **Breakpoint Panel**, click the agent tag to bind it (turns orange)

![debugger bind](/docs/media/debugger-bind.png)

Now load the beacon's handler: find `2 23 801`, event `100`:
1. Click the line next to `anim [1 2 3 4 5 0 255 5]` to set a breakpoint
2. Bind the beacon agent

### 7.2 — Triggering and Stepping

Trigger the feeder from the Console:

```caos
inst
rtar 2 23 800
setv va00 unid
rtar 4 0 0
mesg wrt+ agnt va00 1 0 0 0
```

Now switch to the **Debugger** tab:

1. The feeder agent should appear paused at your breakpoint
2. Look at the **Inspector Panel** — you'll see:
   - **OWNR** = the feeder (agent that owns the script)
   - **FROM** = the creature that "pushed" it
   - **OV00** = current food remaining (before decrement)

![debugger inspector](/docs/media/debugger-inspector.png)

3. Click **Step** to execute `subv ov00 1` — watch OV00 decrease by 1
4. Click **Continue** to let the Push script finish

After the push script sends the message to the beacon, the beacon should pause at its breakpoint:

1. Find the beacon in the agent list (classifier `2 23 801`)
2. Click it — you can now inspect `_p1_` in the **Message Params** section of the inspector

![debugger msg params](/docs/media/debugger-msg-params.png)

### 7.3 — Watching State Flow

This multi-agent debugging reveals the complete data flow:

```
Creature pushes feeder
  → Push script runs on feeder (OWNR = feeder, FROM = creature)
    → ov00 decremented
    → Chemicals injected into creature (TARG switch: feeder → creature → feeder)
    → MESG WRT+ sent to beacon with _P1_ = remaining food
      → Beacon script runs (OWNR = beacon, _P1_ = food count)
        → Beacon animates and stores count
```

Use the Debugger to verify each step in this chain.

---

## Part 8: Putting It All Together

### 8.1 — The Complete Script Set

Here's a summary of everything we've built:

| Script | Classifier | Purpose |
|---|---|---|
| Feeder Install | Run once | Creates feeder, sets physics, initialises state |
| Feeder Timer | 2 23 800 / 9 | Auto-refills food supply |
| Feeder Push | 2 23 800 / 1 | Dispenses food when pushed or clicked |
| Feeder Pull | 2 23 800 / 2 | Status acknowledgement animation |
| Beacon Install | Run once | Creates notification beacon |
| Beacon Handler | 2 23 801 / 100 | Reacts to feeder notifications |

### 8.2 — Monitoring in the Scripts Tab

Switch to the **Scripts** tab to see all your scripts running live. You should see:

- `2 23 800` event `9` — Timer script, state: `blocking` (waiting between timer fires)
- When a creature pushes: `2 23 800` event `1` — briefly appears as `running`
- When the beacon is notified: `2 23 801` event `100` — briefly appears as `running`

### 8.3 — Complete Teardown

When you're done experimenting, clean everything up:

```caos
* Kill agents first — this stops any running/paused scripts
inst
enum 2 23 800
    kill targ
next
enum 2 23 801
    kill targ
next

* Now remove scriptorium entries (safe — no scripts are in use)
scrx 2 23 800 1
scrx 2 23 800 2
scrx 2 23 800 9
scrx 2 23 801 100

outs "All cleaned up!"
```

---

## What You've Learned

This tutorial covered intermediate CAOS concepts that go far beyond the beginner level:

| Concept | What You Learned |
|---|---|
| **Compound agents** | `new: comp`, `pat: dull`, `part`, multi-part animation |
| **Physics** | `accg`, `elas`, `fric`, `aero` — making objects behave physically |
| **Agent attributes** | `attr` flags vs `bhvr` creature permissions — two separate systems |
| **Multiple event scripts** | Timer (9), Push (1), Pull (2), Custom Message (100) — a full behaviour set |
| **`FROM` variable** | Identifying which creature triggered an event |
| **TARG management** | Saving/restoring TARG when switching between agents mid-script |
| **Creature chemistry** | `chem` to inject nutrients, chemical IDs, verifying with the Chemistry tab |
| **Visibility enumeration** | `esee` — finding agents within range, vs `enum` for all agents |
| **Inter-agent messaging** | `mesg wrt+` with parameters (`_P1_`, `_P2_`), message-driven architecture |
| **Multi-script debugging** | Cross-script breakpoints, watching state flow between agents |
| **OV state machines** | Using multiple OV variables as structured agent state |

---

## Quick Reference: New Commands

| Command | Syntax | Purpose |
|---|---|---|
| `new: comp` | `new: comp f g s "sprite" count first plane` | Create compound agent |
| `pat: dull` | `pat: dull part_id "sprite" first rx ry rplane` | Add display part |
| `pat: butt` | `pat: butt part_id "sprite" first count rx ry rplane anim msg opt` | Add button part |
| `part` | `part id` | Select part for pose/anim |
| `accg` | `accg gravity` | Set gravity (pixels/tick²) |
| `elas` | `elas percent` | Set bounce (0–100) |
| `fric` | `fric percent` | Set friction (0–100) |
| `aero` | `aero percent` | Set air resistance |
| `bhvr` | `bhvr flags` | Set creature interaction permissions |
| `rnge` | `rnge distance` | Set visibility/interaction range |
| `chem` | `chem id amount` | Inject chemical into creature |
| `crea` | `crea agent` | Test if agent is a creature (returns 0/1) |
| `from` | `from` | Agent that sent the current message |
| `esee` | `esee f g s ... next` | Enumerate visible agents |
| `etch` | `etch f g s ... next` | Enumerate touching agents |
| `mesg wrt+` | `mesg wrt+ agent msg p1 p2 delay` | Send message with parameters |
| `_p1_` / `_p2_` | `_p1_` | Read message parameters in handler |
| `mvsf` | `mvsf x y` | Move to safe location near (x,y) |

---

## Where to Go Next

- **[CAOS Command Reference](caos_overview.md)** — Full glossary of every CAOS command
- **[The Digital Genome](genome_deep_dive.md)** — How genes encode brain lobes, chemical reactions, stimulus responses, and half-lives
- **[Compounds & Parts](caos_compounds.md)** — Complete reference for compound agent parts
- **[Messages & Stimuli](caos_messages.md)** — All messaging, stimulus, and urge commands
- **[Motion & Physics](caos_motion.md)** — Physics properties and movement commands
- **[Creatures](caos_creatures.md)** — Biochemistry, drives, and creature control commands
- **[Debugger Tab](tab_debugger.md)** — Advanced debugging features

---

*This tutorial was written for the Creatures 3 / Docking Station Developer Tools. All examples have been tested against a live engine instance.*
