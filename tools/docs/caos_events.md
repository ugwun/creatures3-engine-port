# CAOS Reference: Script Events & Messages

Every interactive behaviour in Creatures 3 / Docking Station is driven by **events**. When a creature pushes a button, the engine fires an event. When a timer ticks, when an agent collides with a wall, when a creature decides to eat something — events. Understanding the event system is essential for building agents that behave correctly in the world.

This reference documents **every built-in event number** defined by the engine, sourced directly from `AgentConstants.h`, `AgentConstants.cpp`, and `Message.h` in the engine source.

> **Related:** Events deliver messages to agents. See [Messages & Stimuli](caos_messages.md) for the `MESG WRIT` and `STIM` commands. See [Agent Categories](caos_categories.md) for how creatures perceive different types of agents.

---

## How Events Work

### The Event Pipeline

When something happens to an agent — a creature pushes it, its timer fires, it collides with a wall — the engine executes the following pipeline:

```
Trigger (creature push, timer tick, collision, etc.)
        ↓
  Message created with message ID (0–14 for core messages)
        ↓
  Agent::HandleMessage() — dispatches to handler
        ↓
  Handler remaps message ID → script event number
        ↓
  ExecuteScriptForEvent(event, from, p1, p2)
        ↓
  Scriptorium lookup: scrp <family> <genus> <species> <event>
        ↓
  Script executes with OWNR, FROM, _P1_, _P2_ set
```

### Message IDs vs Script Event Numbers

A common source of confusion: the **message ID** used with `MESG WRIT` is *not always* the same as the **script event number** in the Scriptorium. The engine remaps core messages (0–14) to different script event numbers. For custom messages (≥ 16), the message number maps directly to the script event number — no remapping.

### Context Variables

When an event script runs, the following context variables are set:

| Variable | Description |
|---|---|
| `OWNR` | The agent whose script is executing |
| `FROM` | The agent that sent the message (or `NULL` for timer/collision events) |
| `_P1_` | First message parameter (type varies by event) |
| `_P2_` | Second message parameter (type varies by event) |
| `_IT_` | The creature's current attention target (only meaningful for creature scripts) |

---

## Message ID → Script Event Mapping

The `MESG WRIT` and `MESG WRT+` commands use **message IDs**. The engine intercepts messages 0–14 and routes them through specific handler functions that remap them to **script event numbers**. For messages ≥ 16, the message number is used directly as the script event number via `HandleOther()`.

| Message ID | Message Name | → Script Event | Handler Function | BHVR Gated? |
|---|---|---|---|---|
| 0 | Activate 1 | **1** | `HandleActivate1()` | ✅ `permCanActivate1` |
| 1 | Activate 2 | **2** | `HandleActivate2()` | ✅ `permCanActivate2` |
| 2 | Deactivate | **0** | `HandleDeactivate()` | ✅ `permCanDeactivate` |
| 3 | Hit | **3** | `HandleHit()` | ✅ `permCanHit` |
| 4 | Pickup | **4** | `HandlePickup()` | ✅ `permCanPickUp` |
| 5 | Drop | **5** | `HandleDrop()` | ❌ |
| 12 | Eat | **12** | `HandleEat()` | ✅ `permCanEat` |
| 13 | Start Hold Hands | **13** | `HandleStartHoldHands()` | ❌ |
| 14 | Stop Hold Hands | **14** | `HandleStopHoldHands()` | ❌ |
| ≥ 16 | *(custom)* | **= message ID** | `HandleOther()` | ❌ |

> **Why the offset?** Message ID 0 (Activate 1) maps to script event **1**, not event 0. This is because internally `HandleActivate1()` calls `ExecuteScriptForEvent(SCRIPTACTIVATE1)`, and `SCRIPTACTIVATE1 = 1`. The original engine separated the message numbering (what's sent) from the script numbering (what's executed). This is a historical quirk that you simply have to memorise.

> **BHVR gating:** When a creature sends a message to an agent, the engine checks the agent's `BHVR` (creature permissions) before executing the handler. If the permission flag isn't set, the message is silently discarded. Messages from non-creatures (the pointer, other agents) bypass `BHVR` checks.

---

## Core Agent Events (0–14)

These events can fire on **any agent** — simple objects, compound agents, vehicles, and creatures alike. They are the foundation of all agent interaction.

| Event | Name | Trigger | FROM | _P1_ | _P2_ |
|---|---|---|---|---|---|
| 0 | **Deactivate** | Agent receives a deactivate message | Sender | — | — |
| 1 | **Activate 1** (Push) | Agent receives an activate 1 message. Fires on left-click or creature push | Sender | — | — |
| 2 | **Activate 2** (Pull) | Agent receives an activate 2 message. Fires on right-click or creature pull | Sender | — | — |
| 3 | **Hit** | Agent receives a hit message | Sender | — | — |
| 4 | **Pickup** | Agent has been picked up by something other than a vehicle | Carrier | — | — |
| 5 | **Drop** | Agent has been dropped by something other than a vehicle | Dropper | — | — |
| 6 | **Collision** | Agent collides with a room boundary or obstacle | `NULL` | X velocity | Y velocity |
| 7 | **Bump** | A creature walks into a wall | `NULL` | — | — |
| — | *(8 unused)* | | | | |
| 9 | **Timer** | Timer fires at the interval set by `TICK` | `NULL` | — | — |
| — | *(10–11 unused)* | | | | |
| 12 | **Eat** | A creature eats this agent | Eater | — | — |
| 13 | **Start Hold Hands** | A creature starts holding hands with the pointer | Pointer | — | — |
| 14 | **Stop Hold Hands** | A creature stops holding hands with the pointer | Pointer | — | — |

> **Player clicks and creature actions share the same events.** When the player left-clicks an agent, the engine sends `Activate 1` (message 0), which triggers script event 1 — the same event that fires when a creature pushes the agent. Your Push script must handle both cases. The `FROM` variable distinguishes them: when a creature pushes, `FROM` is the creature; when the player clicks, `FROM` is the pointer agent or `NULL`. Use `crea from` to check.

### BHVR — Creature Permission Flags

The `BHVR` command controls which actions creatures are *allowed* to perform on an agent. Even if your agent has the right event scripts, creatures won't interact with it unless `BHVR` is set. These flags gate the creature's `verb` brain lobe — they tell the brain which action neurons are valid for this agent.

| Bit | Value | Permission | Gates Event |
|---|---|---|---|
| 0 | 1 | **Activate 1** | Event 1 (Push) |
| 1 | 2 | **Activate 2** | Event 2 (Pull) |
| 2 | 4 | **Deactivate** | Event 0 |
| 3 | 8 | **Hit** | Event 3 |
| 4 | 16 | **Eat** | Event 12 |
| 5 | 32 | **Pick Up** | Event 4 (Pickup) |

Common `BHVR` values:
- `bhvr 1` — creatures can push only
- `bhvr 3` — creatures can push and pull
- `bhvr 15` — push, pull, deactivate, and hit
- `bhvr 48` — eat and pick up (for food items)
- `bhvr 63` — all permissions enabled

> **Important:** Setting `BHVR` validates that the corresponding event scripts exist in the Scriptorium. If you set `bhvr 3` but haven't injected scripts for events 1 and 2, the engine throws a runtime error. Always inject event scripts *before* setting `BHVR`. **Exception:** The Pickup permission (bit 5, value 32) is *not* validated — the engine intentionally skips this check because many agents allow creature pickup without a dedicated Pickup script.

---

## Creature Decision Scripts — On Agents (16–31)

When a creature's brain decides to perform an action with its attention on an **ordinary agent** (not another creature), the engine executes one of these scripts on the **creature itself**. These scripts define how the creature physically performs each action — the walking animation, the reaching gesture, the eating motion, etc.

The creature's `decn` (decision) brain lobe has 16 neurons, one per action. The winning neuron maps to one of these script events via the `"Action Script To Neuron Mappings"` catalogue entry.

| Event | Name | Brain Neuron | Requires IT? | Description |
|---|---|---|---|---|
| 16 | **Quiescent** | 0 (Default) | ❌ | Stand and watch it — idle behaviour |
| 17 | **Activate 1** (Push) | 1 | ✅ | Push / activate the IT object |
| 18 | **Activate 2** (Pull) | 2 | ✅ | Pull the IT object |
| 19 | **Deactivate** | 3 | ✅ | Deactivate the IT object |
| 20 | **Approach** (Seek) | 4 | ✅ | Walk up and look at it |
| 21 | **Retreat** (Avoid) | 5 | ✅ | Walk or run away from it |
| 22 | **Pickup** (Get) | 6 | ✅ | Pick it up |
| 23 | **Drop** | 7 | ❌ | Drop anything you're carrying |
| 24 | **Need** (Express Need) | 8 | ❌ | Say what's bothering you |
| 25 | **Rest** | 9 | ❌ | Becoming sleepy |
| 26 | **West** (Travel West) | 10 | ❌ | Walk idly to the west |
| 27 | **East** (Travel East) | 11 | ❌ | Walk idly to the east |
| 28 | **Eat** | 12 | ✅ | Eat the IT object |
| 29 | **Hit** | 13 | ✅ | Hit the IT object |
| 30 | *Undefined* | — | — | Reserved for future expansion |
| 31 | *Undefined* | — | — | Reserved for future expansion |

> **Key concept: "Requires IT" actions.** Some actions (push, eat, approach) require the creature to have a valid IT object — the agent its attention is focused on. Others (drop, rest, wander) are self-directed and don't need a target. The engine function `DoesThisScriptRequireAnItObject()` in `BrainScriptFunctions.cpp` hard-codes which actions need an IT.

> **How these connect to core events (0–14):** When a creature executes script 17 (Activate 1 on Agents), the creature's action script typically sends a `MESG WRIT` to the IT agent with message 0 (Activate 1). This causes the IT agent's event 1 (Push) script to fire. So the creature's decision script (17) triggers the agent's interaction script (1) — two scripts, two agents, working together.

---

## Creature Decision Scripts — On Creatures (32–47)

The **exact same 16 actions**, but executed when the creature's attention is focused on **another creature** rather than an ordinary agent. The action names and neuron mappings mirror events 16–31.

| Event | Name | Description |
|---|---|---|
| 32 | **Quiescent** | Stand and twiddle your thumbs |
| 33 | **Activate 1** | Mating script (approach opposite sex) |
| 34 | **Activate 2** | Mating script |
| 35 | **Deactivate** | Deactivate the other creature |
| 36 | **Approach** | Go up and look at the other creature |
| 37 | **Retreat** | Walk or run away from the other creature |
| 38 | **Pickup** | Pick up the other creature |
| 39 | **Drop** | Drop anything you're carrying |
| 40 | **Need** | Say what's bothering you |
| 41 | **Rest** | Rest or sleep |
| 42 | **West** | Walk idly to west |
| 43 | **East** | Walk idly to east |
| 44 | **Eat** | Eat the other creature (Grendels!) |
| 45 | **Hit** | Hit the other creature |
| 46 | *Undefined* | Reserved for future expansion |
| 47 | *Undefined* | Reserved for future expansion |

> **Why two sets?** Creatures behave differently depending on whether their attention is on an object or another creature. When a Norn sees a carrot and decides to eat, script 28 fires (Eat on Agents). When a Grendel sees a Norn and decides to eat, script 44 fires (Eat on Creatures). The action animations, sound effects, and biochemical consequences can all be different.

> **Mating:** Events 33 and 34 are specifically used for mating behaviour. When a creature's brain decides to "activate 1" another creature of the opposite sex, the mating script handles the approach, the `MATE` command, and any resulting pregnancy.

---

## "I've Been" Events (0–5, 12)

A separate but related concept: when a creature is the **target** of an action (not the actor), the engine fires one of the core events (0–5, 12) on the creature. These are called "I've been" events because they represent things done *to* the creature:

| Event | "I've Been..." | Trigger |
|---|---|---|
| 0 | Deactivated | Something deactivated me |
| 1 | Pushed (Activated 1) | Something pushed me |
| 2 | Pulled (Activated 2) | Something pulled me |
| 3 | Hit | Something hit me |
| 4 | Picked up | Something picked me up |
| 5 | Dropped | Something dropped me |
| 12 | Eaten | Something tried to eat me |

The engine function `IsThisAnIveBeenScript()` identifies these events. They're used by the learning system to update the creature's neural associations — "I was hit by a Grendel, that was bad."

---

## Involuntary Actions (64–72)

Involuntary actions are **chemically triggered reflexes**. They fire when a specific chemoreceptor recommends the action more highly than any voluntary action. After firing, the `LTCY` command can set a cooldown period to prevent the action from repeating continuously. The receptor/emitter locus system that connects chemicals to these actions is described in [Biochemistry — Locus System](biochemistry_deep_dive.md#the-locus-system).

| Event | Name | Description |
|---|---|---|
| 64 | **Flinch** | Reflexive flinch from pain |
| 65 | **Lay Egg** | Egg-laying when pregnancy reaches full term |
| 66 | **Sneeze** | Sneezing |
| 67 | **Cough** | Coughing |
| 68 | **Shiver** | Shivering when cold |
| 69 | **Sleep** | Falling asleep |
| 70 | **Fainting** | Fainting from weakness |
| 71 | *Unassigned* | Reserved for future expansion |
| 72 | **Die** | Special involuntary action — death animation. Called when a creature dies. |

> **Latency timing:** After an involuntary action fires, the script can call `LTCY action min max` to set a cooldown timer. For example, `LTCY 4 20 60` (action 4 = shivering, using the involuntary action's index 0–7) sets a random cooldown of 20–60 ticks. This prevents continuous shivering and creates more natural-looking behaviour. The latency timer runs on the biochemistry tick rate (every 4 game ticks), so `LTCY 4 20 60` gives a cooldown of roughly 4–12 seconds.

---

## Raw Input Events (73–79)

These events deliver raw keyboard and mouse input to agents. They only fire if the agent's `IMSK` (input mask) is set to include the corresponding input type.

| Event | Name | Requires IMSK | _P1_ | _P2_ |
|---|---|---|---|---|
| 73 | **Raw Key Down** | Yes | Key code | — |
| 74 | **Raw Key Up** | Yes | Key code | — |
| 75 | **Raw Mouse Move** | Yes | New X position | New Y position |
| 76 | **Raw Mouse Down** | Yes | Button (1=left, 2=right, 4=middle) | — |
| 77 | **Raw Mouse Up** | Yes | Button (1=left, 2=right, 4=middle) | — |
| 78 | **Raw Mouse Wheel** | Yes | Delta (120 units per click) | — |
| 79 | **Raw Translated Char** | Yes | Translated key code | — |

> **IMSK flags:** `IMSK 1` = mouse move, `IMSK 2` = mouse down, `IMSK 4` = mouse up, `IMSK 8` = mouse wheel, `IMSK 16` = translate. Combine flags: `IMSK 31` captures all input. See [Input & Pointer](caos_input.md).

> **Raw vs Translated:** Event 73/74 give raw key codes (platform-specific scan codes). Event 79 gives translated characters after the Input Method Editor processes them — useful for international text input (e.g. Japanese IME). For simple key detection, use event 73. For text input, use `PAT: TEXT` parts instead.

---

## UI Events (90–100)

This range is reserved for **cooked UI events** generated by the `PointerAgent`. These are higher-level interpretations of raw mouse input.

| Event | Name | Description |
|---|---|---|
| 90 | *(UI range start)* | Minimum of UI event range |
| 92 | **UI Mouse Down** | Mouse click on an agent — cooked by the pointer |
| 100 | *(UI range end)* | Maximum of UI event range |

> Events in the 90–100 range are internally dispatched through `HandleUI()`, which defaults to `HandleOther()`. Avoid using event numbers in this range for custom agent messaging.

---

## Pointer Events (101–118)

These events fire on the **pointer agent** (the player's hand) when the player interacts with other agents. The script classifier matches the *target agent's* classifier, not the pointer's own classifier. This lets you define pointer-specific reactions for different agent types.

| Event | Name | Description |
|---|---|---|
| 101 | **Pointer Activate 1** | Player left-clicks an agent (activate 1). Script classifier matches the activated agent. |
| 102 | **Pointer Activate 2** | Player left-clicks an agent (activate 2). Script classifier matches the activated agent. |
| 103 | **Pointer Deactivate** | Player deactivates an agent. Script classifier matches the deactivated agent. |
| 104 | **Pointer Pickup** | Player picks up an agent. Script classifier matches the picked-up agent. |
| 105 | **Pointer Drop** | Player drops an agent. Script classifier matches the dropped agent. |
| 110 | **Pointer Port Select** | Player manipulates a port on an agent. |
| 111 | **Pointer Port Connect** | Player completes a connection between two ports. |
| 112 | **Pointer Port Disconnect** | Player disconnects two previously connected ports. |
| 113 | **Pointer Port Cancel** | Player cancels a port operation mid-way. |
| 114 | **Pointer Port Error** | Error in the port configuration the player attempted. |
| 115 | **Pointer Hold Hands** | Pointer initiates holding hands with a creature. |
| 116 | **Pointer Clicked Background** | Player clicked on empty space (no agent under pointer). |
| 117 | **Pointer Action Dispatch** | Informs the pointer what action clicking would take on the creature under it. `_P1_`: 0 = no action, 1 = deactivate (slap), 2 = activate 1 (tickle). |
| 118 | **Connection Break** | Called on an agent when any of its ports are broken due to exceeding the maximum connection distance. |

---

## System Events (120–128)

System events are fired by the engine in response to world-level or lifecycle changes. They are broadcast to **all agents** that have the corresponding script installed.

| Event | Name | Scope | _P1_ | _P2_ |
|---|---|---|---|---|
| 120 | **Selected Creature Changed** | All agents with this script | New creature | Previous creature |
| 121 | **Vehicle Pickup** | The picked-up agent | — | — |
| 122 | **Vehicle Drop** | The dropped agent | — | — |
| 123 | **Window Resized** | All agents with this script | — | — |
| 124 | **Got Carried Agent** | The carrier agent | — | — |
| 125 | **Lost Carried Agent** | The former carrier agent | — | — |
| 126 | **Make Speech Bubble** | All agents with this script | Text being spoken | Speaking creature |
| 127 | **Life Event** | All agents with this script | Moniker | Event index |
| 128 | **World Loaded** | All agents with this script | — | — |

> **Event 120 — Selected Creature Changed:** Fires when the player selects a different creature with the `NORN` command. The bootstrap UI scripts use this to update HUD elements. `_P1_` is the newly selected creature, `_P2_` is the previously selected one.

> **Event 126 — Make Speech Bubble:** Every agent with a script for event 126 is called whenever any creature speaks. This is how the speech bubble agents in the DS bootstrap work — they listen globally for speech events and render floating text. `_P1_` is the spoken text string, `_P2_` is the speaking creature.

> **Event 127 — Life Event:** Broadcast whenever `HIST EVNT` creates a new life event — births, deaths, aging, etc. `_P1_` is the moniker of the creature the event happened to, `_P2_` is the event index (which can be used with `HIST TYPE`, `HIST NAME`, etc. to query event details).

> **Event 128 — World Loaded:** Fires once after the world has finished loading, whether from bootstrap (fresh world) or from a saved file. Useful for one-time initialization that needs to run after all agents are deserialized.

---

## Special Events (200, 255)

| Event | Name | Description |
|---|---|---|
| 200 | **Mate** | Reserved for mating scripts. Not directly used by the engine — it's a convention for creature-to-creature mating coordination. Tells a male to mate with the female specified by the decision scripts. |
| 255 | **Agent Exception** | Fires when an agent's script tries to access an invalid agent (e.g. reading `OVxx` on a `NULL` target). If this script exists for `OWNR`, it's called instead of throwing a runtime error, allowing graceful recovery. |

---

## Custom Events (≥ 256)

Event numbers **256 and above** are reserved for agent developers. The engine never fires these automatically — they are exclusively for custom inter-agent communication via `MESG WRIT` and `MESG WRT+`.

```caos
* Send custom message 300 to another agent
mesg wrt+ targ 300 42 "hello" 0

* The receiving agent handles it with:
scrp 2 23 801 300
    * _p1_ = 42, _p2_ = "hello"
    outv _p1_
endm
```

> **Avoid 90–100:** This range is reserved for UI events. Use numbers ≥ 100 for custom messages between your own agents, or ≥ 256 for maximum safety.

---

## Complete Event Number Map

For quick reference, here is every event number in the engine and its purpose:

| Range | Purpose | Count |
|---|---|---|
| **0–14** | Core agent events (activate, hit, pickup, timer, eat, etc.) | 12 active |
| **16–31** | Creature decision scripts — attention on agents | 16 |
| **32–47** | Creature decision scripts — attention on creatures | 16 |
| **64–72** | Involuntary actions (flinch, sneeze, die, etc.) | 9 |
| **73–79** | Raw input events (keyboard, mouse) | 7 |
| **90–100** | UI events (reserved for pointer) | — |
| **101–118** | Pointer events (pointer reacting to player actions) | 14 |
| **120–128** | System events (world loaded, creature changed, etc.) | 9 |
| **200** | Mate (convention for mating scripts) | 1 |
| **255** | Agent Exception (error recovery) | 1 |
| **≥ 256** | Custom — for agent developers | ∞ |

---

## Practical Examples

### Checking what events an agent handles

```caos
* List all script events for a specific agent classifier
gids spcs 2 23 800
* Output: space-delimited list of event numbers, e.g. "1 2 9"
```

### Testing if a specific script exists

```caos
* Does classifier 2 23 800 have a Push (event 1) script?
outv sorq 2 23 800 1
* Returns: 1 (yes) or 0 (no)
```

### Building a complete interactive agent

A well-built agent typically implements this set of events:

| Event | Purpose | Priority |
|---|---|---|
| *(Install)* | Create agent, set physics, init state | Required |
| **1** (Push) | Primary creature interaction | Required |
| **2** (Pull) | Secondary creature interaction | Optional |
| **0** (Deactivate) | Tertiary interaction (shift-click) | Optional |
| **9** (Timer) | Periodic state updates, regeneration | Common |
| **4** (Pickup) | Reaction when picked up | Optional |
| **5** (Drop) | Reaction when dropped | Optional |
| **6** (Collision) | Reaction when hitting a wall | Optional |
| **12** (Eat) | Reaction when a creature eats it | For food items |

### Sending messages between your own agents

```caos
* Send custom message 300 with food count as parameter
setv va00 ov00
inst
enum 2 23 801
    mesg wrt+ targ 300 va00 0 0
next
```

### Creating a creature action script

```caos
* Script 17 on classifier 4 1 0 — Norn pushes an agent
scrp 4 1 0 17
    * _IT_ is the agent the creature is paying attention to
    * Walk toward it, then push it
    setv va00 0
    doif byit eq 0
        appr
        setv va00 byit
    endi
    doif va00 eq 1 or byit eq 1
        touc
        mesg writ _it_ 0
    endi
endm
```

---

## Relationship to Other Systems

### Brain Lobes

The creature's brain drives the entire decision cycle. Key lobes involved in event generation:

| Lobe | Quad | Role in Events |
|---|---|---|
| `decn` | Decision | Winning neuron selects the action (maps to events 16–31 or 32–47) |
| `verb` | Verb | Mirrors `decn` — represents what the creature intends to do |
| `attn` | Attention | Which [category](caos_categories.md) the creature is focused on |
| `noun` | Noun | What type of object the creature perceives |

### Stimuli

When a core event (0–5, 12) fires on a creature, the engine can send a **stimulus** to the creature's brain. The stimulus includes the agent's [category](caos_categories.md), enabling associative learning. For example, when a creature pushes a dispenser (category 23) and its hunger decreases, the brain learns: "pushing dispensers reduces hunger." The chemical effects of each stimulus are defined by [Stimulus genes](genome_deep_dive.md#subtype-0--stimulus-gene-g_stimulus) in the creature's genome.

See [Messages & Stimuli](caos_messages.md) for the `STIM WRIT` and `STIM SHOU` commands.

### The Scriptorium

All event scripts live in the **Scriptorium** — the engine's central script registry. Scripts are installed with `scrp family genus species event ... endm` blocks in `.cos` bootstrap files, or injected at runtime via the CAOS IDE. The Scriptorium supports **classifier inheritance**: if no script exists for the exact `(family, genus, species, event)` tuple, the engine falls back to `(family, genus, 0, event)`, then `(family, 0, 0, event)`.

Use `SORQ` to check if a script exists, `SORC` to retrieve its source, and `SCRX` to remove it.

---

## Where to Find the Data

The event system is defined in the engine source:

| Data | Source File |
|---|---|
| Script event constants (enum) | `engine/Agents/AgentConstants.h` |
| Event names and descriptions | `engine/Agents/AgentConstants.cpp` |
| Message ID constants (enum) | `engine/Message.h` |
| Message names and descriptions | `engine/Message.cpp` |
| Message → handler dispatch | `engine/Agents/Agent.cpp` — `HandleMessage()` |
| Handler → script event mapping | `engine/Agents/Agent.cpp` — `HandleActivate1()` etc. |
| BHVR permission flags | `engine/Agents/Agent.h` — `permCanActivate1` etc. |
| Creature action enum | `engine/Creature/CreatureConstants.h` — `decisionoffsets` |
| Brain-to-action catalogue mapping | `engine/Creature/Brain/BrainScriptFunctions.cpp` |
| Action-to-neuron mapping | `Catalogue/Docking Station.catalogue` — `"Action Script To Neuron Mappings"` |

---

[← Back to CAOS Overview](caos_overview.md)
