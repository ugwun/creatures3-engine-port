---
name: caos-mcp
description: >
  CAOS language glossary and reference for interacting with the Creatures 3 engine
  via the MCP server. Read this skill BEFORE using the execute_caos tool or writing
  any CAOS code. It covers syntax rules, command reference, common patterns, gotchas,
  and the MCP tool-to-CAOS mapping so the agent can write correct CAOS on the first try.
---

# CAOS Language — MCP Quick Reference

CAOS (**C**reatures **A**gent **O**bject **S**cript) is the scripting language of the
Creatures 3 / Docking Station engine. When using the `execute_caos` MCP tool, you
are sending CAOS code that runs on the engine's main thread in a fresh VM.

> **Read this entire file before writing any CAOS code.** It will prevent you from
> rediscovering syntax rules and common pitfalls every session.

---

## 1. Critical MCP/Console Rules

These rules apply **every time** you use `execute_caos`. Violating them causes
runtime errors or silent failures.

| Rule | Why |
|---|---|
| **Always prefix with `inst`** when using `enum`, `esee`, `etch`, `reps`, or any iterative construct | Without it, iteration yields between steps and throws `sidBlockingDisallowed` |
| **Use `outv` for numbers, `outs` for strings** | These are the ONLY way to return data. There is no `print` command |
| **Never use `wait`, `over`, or `anim ... over`** | They block and throw `sidBlockingDisallowed` in console/MCP context |
| **VA variables reset each execution** | `va00`–`va99` do not persist between separate `execute_caos` calls. Set and use them in the same call |
| **No `ownr`** | The MCP console has no owner agent. Commands requiring `ValidateOwner()` will fail |
| **Set `targ` before reading agent properties** | Commands like `posx`, `fmly`, `unid`, `drv!` operate on the current `targ` |
| **Null-check `targ` before accessing properties** | `doif targ <> null ... endi` prevents runtime errors |
| **Use `mvsf` over `mvto` for placement** | `mvsf` finds the nearest valid floor position; `mvto` can place agents in walls |

---

## 2. Language Fundamentals

### Syntax
- **Case-insensitive**: `SETV`, `setv`, `Setv` are identical
- **Space-delimited tokens**: every token separated by spaces — `addv va00 3` not `addvva003`
- **4-character tokens**: most commands are exactly 4 chars (e.g., `setv`, `outs`, `enum`)
- **Comments**: lines starting with `*` — `* this is a comment`
- **String literals**: double-quoted — `"hello world"`
- **Multi-command chaining**: commands can be on one line — `setv va00 42 outv va00`
- **Byte-strings**: bracketed integer lists — `[0 1 2 3 255]` (used for animation)

### Data Types
| Code | Type | Example |
|---|---|---|
| integer | whole number | `42`, `-1` |
| float | decimal | `3.14`, `0.5` |
| string | text in quotes | `"hello"` |
| agent | reference to an agent | `targ`, `null`, `agnt 42` |
| variable | writable storage | `va00`, `ov05`, `game "key"` |

### Comparison & Logic Operators
- **Comparisons**: `=`, `<>` (not equal), `<`, `>`, `<=`, `>=`
- Alternative forms: `eq`, `ne`, `gt`, `ge`, `lt`, `le`
- **Logical**: `and`, `or` — evaluated left-to-right, no precedence grouping

---

## 3. Variables

| Variable | Scope | Persists? | Usage |
|---|---|---|---|
| `va00`–`va99` | Local to single execution | ❌ Resets each call | Temp calculations |
| `ov00`–`ov99` | Per-agent (on `targ`) | ✅ With agent | Agent state storage |
| `mv00`–`mv99` | Per-agent (on `ownr`) | ✅ With agent | ⚠️ Not available in MCP (no `ownr`) |
| `game "name"` | Global | ✅ Saved with world | `setv game "my_var" 42` / `outv game "my_var"` |
| `name "name"` | Per-agent | ✅ With agent | Named attributes (DS) |
| `_p1_`, `_p2_` | Message params | ❌ | Only in message handler scripts |

### Numeric Operations
| Command | Syntax | Description |
|---|---|---|
| `setv` | `setv var value` | Set variable to value |
| `addv` | `addv var value` | var = var + value |
| `subv` | `subv var value` | var = var − value |
| `mulv` | `mulv var value` | var = var × value |
| `divv` | `divv var value` | var = var ÷ value |
| `modv` | `modv var value` | var = var % value |
| `negv` | `negv var` | var = −var |
| `absv` | `absv var` | var = |var| |
| `andv` | `andv var value` | Bitwise AND |
| `orrv` | `orrv var value` | Bitwise OR |

### Numeric R-Values
| Command | Syntax | Returns |
|---|---|---|
| `rand` | `rand min max` | Random integer in [min, max] |
| `sqrt` | `sqrt value` | Square root (float) |
| `sin_` | `sin_ degrees` | Sine (float) |
| `cos_` | `cos_ degrees` | Cosine (float) |
| `atan` | `atan y x` | Arctangent in degrees (float) |

### String Operations
| Command | Syntax | Description |
|---|---|---|
| `sets` | `sets var "text"` | Set string variable |
| `adds` | `adds var "text"` | Append to string variable |
| `subs` | `subs "text" start length` | Substring (1-indexed) |
| `strl` | `strl "text"` | String length |
| `vtos` | `vtos number` | Number → string |
| `stoi` | `stoi "text"` | String → integer |
| `stof` | `stof "text"` | String → float |
| `lowa` | `lowa "TEXT"` | Lowercase |

---

## 4. Flow Control

### Conditionals
```caos
doif va00 > 10 and va00 < 20
    outs "In range"
elif va00 = 0
    outs "Zero"
else
    outs "Other"
endi
```

### Loops
```caos
* Counted loop
reps 5
    outv va00
    addv va00 1
repe

* Until loop
setv va00 0
loop
    addv va00 1
untl va00 >= 10

* Forever loop (needs stop or will hang!)
loop
    addv va00 1
    doif va00 > 100
        stop
    endi
ever
```

### Subroutines
```caos
gsub myFunc
outs "Back from sub"
stop

subr myFunc
    outs "In subroutine"
retn
```
> ⚠️ Always place `stop` before `subr` definitions to prevent fall-through.

### Execution Control
| Command | Description |
|---|---|
| `inst` | Instant mode — run everything in one tick. **Required for MCP** |
| `slow` | Exit instant mode |
| `stop` | Stop current script |
| `lock` | Prevent script interruption by messages |
| `unlk` | End lock section |

---

## 5. Agent Commands

### Creating Agents
| Command | Syntax | Description |
|---|---|---|
| `new: simp` | `new: simp family genus species "sprite" image_count first_image plane` | Create simple agent (sets `targ`) |
| `new: comp` | `new: comp family genus species "sprite" image_count first_image plane` | Create compound agent |
| `new: vhcl` | `new: vhcl family genus species "sprite" image_count first_image plane` | Create vehicle |
| `new: crea` | `new: crea family gene_agent genome_slot sex variant` | Hatch creature from genome |

### Targeting
| Command | Returns/Does |
|---|---|
| `targ agnt <id>` | Target agent by unique ID |
| `rtar F G S` | Target random matching agent |
| `null` | Null agent reference (for comparisons) |
| `norn` | Currently selected creature |
| `from` | Agent that sent current message (⚠️ not in MCP) |
| `it` | Last attention target |
| `carr` | Agent carrying `targ` |
| `held` | Agent held by `targ` |
| `pntr` | The pointer/hand agent |

### Agent Properties (Read/Write)
| Property | Set | Get | Description |
|---|---|---|---|
| `attr` | `attr 199` | `outv attr` | Attribute bitmask (1=Carryable, 2=Mouseable, 4=Activateable, 64=Wallbound, 128=Physics) |
| `bhvr` | `bhvr 3` | `outv bhvr` | Creature permission bitmask (1=Push, 2=Pull, 4=Deactivate, 8=Hit, 16=Eat, 32=Pickup) |
| `tick` | `tick 100` | `outv tick` | Timer rate (ticks between event 9 fires; 0=disabled) |
| `accg` | `accg 5.0` | `outv accg` | Gravity (5.0 = standard creature gravity; 0.3 = default) |
| `elas` | `elas 10` | `outv elas` | Elasticity/bounce (0–100) |
| `fric` | `fric 80` | `outv fric` | Friction (0–100) |
| `aero` | `aero 10` | `outv aero` | Air resistance |
| `perm` | `perm 100` | `outv perm` | Wall permeability (1–100) |
| `plne` | `plne 500` | `outv plne` | Drawing plane (higher = nearer camera) |
| `rnge` | `rnge 200.0` | `outv rnge` | Sight/hearing range |

### Agent Identification (Read-Only)
| Command | Returns | Description |
|---|---|---|
| `unid` | integer | Unique agent ID |
| `fmly` | integer | Family classifier |
| `gnus` | integer | Genus classifier |
| `spcs` | integer | Species classifier |
| `totl F G S` | integer | Count of matching agents (0=wildcard) |

### Agent Position
| Command | Type | Description |
|---|---|---|
| `posx`, `posy` | FloatRV | Centre position |
| `posl`, `posr`, `post`, `posb` | FloatRV | Bounding box edges |
| `wdth`, `hght` | IntegerRV | Dimensions |
| `mvto x y` | Command | Move to absolute position |
| `mvsf x y` | Command | Move to nearest safe floor position |
| `mvby dx dy` | Command | Move relative |
| `mvft x y` | Command | Move creature's down foot to position |

### Agent Destruction
```caos
kill targ    * Destroy current target agent
```

### Sprite & Animation
| Command | Description |
|---|---|
| `gall "sprite" first_image` | Change sprite gallery |
| `pose index` | Set sprite frame (relative to `base`) |
| `base index` | Set base image index |
| `anim [0 1 2 3 255]` | Set animation (255 = loop marker) |

---

## 6. Enumeration

Enumeration iterates agents matching a classifier. **`0` = wildcard.**

```caos
* ALWAYS use inst in MCP!
inst
setv va00 0
enum 4 0 0          * All creatures (family 4)
    addv va00 1
next
outv va00
```

| Command | Iterates Over |
|---|---|
| `enum F G S ... next` | All agents matching classifier |
| `esee F G S ... next` | Agents `ownr` can see (within `rnge`) |
| `etch F G S ... next` | Agents touching `ownr` |
| `epas F G S ... next` | Passengers of vehicle `targ` |
| `econ agent ... next` | Agents connected via ports |

> `enum 0 0 0 ... next` iterates **ALL** agents in the world.

> After `enum` completes, `targ` is restored to its pre-enumeration value.

> `kill targ` inside `enum` is safe — the iterator handles it.

---

## 7. Creature-Specific Commands

Creatures are agents with **family = 4**. Genus: 1=Norn, 2=Grendel, 3=Ettin, 4=Shee.

### Lifecycle
| Command | Description |
|---|---|
| `born` | Register creature birth in history system |
| `dead` | Kill creature (stops brain/biochem, closes eyes) |
| `ages N` | Force creature to age N times |
| `cage` | Life stage (0=Baby, 1=Child, …, 6=Senile) |
| `tage` | Age in ticks since `born` |
| `crea agent` | Returns 1 if agent is a creature, 0 otherwise |
| `zomb 1/0` | Zombie mode (no brain/biochem updates) |

### Drives (20 drives, IDs 0–19)
| ID | Drive | ID | Drive |
|---|---|---|---|
| 0 | Pain | 10 | Boredom |
| 1 | Hunger for protein | 11 | Anger |
| 2 | Hunger for carbs | 12 | Sex drive |
| 3 | Hunger for fat | 13 | Fear |
| 4 | Coldness | 14 | Tiredness |
| 5 | Hotness | 15 | Sleepiness |
| 6 | Drowning | 16 | Loneliness |
| 7 | Poison | 17 | Crowding |
| 8 | Suffocation | 18 | Stress (travel) |
| 9 | Thirst | 19 | Stress (danger) |

```caos
* Read a specific drive (float 0.0–1.0)
targ norn
outv driv 1       * Hunger for protein

* Get highest drive ID
outv drv!
```

> ⚠️ **Drive chemicals are at IDs 148–164, NOT 0–19.** The `driv` command
> reads drive levels; `chem` reads/writes biochemical concentrations.

### Biochemistry
```caos
* Inject chemical into creature
targ agnt <creature_id>
chem 35 1.0        * Inject chemical 35 at concentration 1.0
chem 149 -1.0      * Extract hunger-for-protein chemical

* Read chemical concentration (float 0.0–1.0)
outv chem 35
```

### Stimulus & Urges
| Command | Description |
|---|---|
| `stim writ creature stimulus_id strength` | Trigger stimulus on specific creature |
| `stim shou stimulus strength` | Stimulus to all creatures that can hear `ownr` |
| `sway writ creature d1 a1 d2 a2 d3 a3 d4 a4` | Directly adjust 4 drives |
| `urge writ creature noun verb_id verb_stim` | Urge creature to perform action |

### Creature Appearance & Communication
| Command | Description |
|---|---|
| `vocb` | Teach creature all vocabulary |
| `sayn` | Creature speaks its highest need |
| `wear body_id set_number layer` | Apply clothing |
| `face set_number` | Set facial expression |
| `aslp 1/0` | Put to sleep / wake |
| `drea 1/0` | Dream (processes instincts) |

### Brain Inspection
| Command | Description |
|---|---|
| `klob` | Number of lobes in creature's brain |
| `ktra` | Number of tracts |
| `brn: setn lobe neuron state value` | Set neuron state variable |
| `brn: setd tract dendrite weight value` | Set dendrite weight |

Standard brain lobes (15): `noun`, `verb`, `visn`, `comb`, `decn`, `driv`, `attn`,
`stim`, `move`, `detl`, `situ`, `resp`, `forf`, `mood`, `smel`.

---

## 8. Script Events

### Common Event Numbers
| Event | Name | Trigger |
|---|---|---|
| 0 | Deactivate | Shift-click or creature deactivate |
| 1 | Activate 1 (Push) | Left-click / creature push |
| 2 | Activate 2 (Pull) | Right-click / creature pull |
| 3 | Hit | Creature hits agent |
| 4 | Pickup | Agent picked up |
| 5 | Drop | Agent dropped |
| 9 | Timer | Every N ticks (set by `tick`) |
| 10 | Constructor | Runs once when agent created |
| 12 | Eat | Creature eats agent |
| ≥256 | Custom | User-defined |

### Message → Event Mapping (Critical Gotcha!)
Message ID ≠ Script event number for core messages 0–14:
- Message 0 (Activate1) → **Event 1** (not 0!)
- Message 1 (Activate2) → **Event 2**
- Message 2 (Deactivate) → **Event 0**
- For custom messages ≥16, message number = event number directly

### Script Management
| Command | Description |
|---|---|
| `scrp F G S E ... endm` | Define event script (for .cos files, not console) |
| `rscr F G S E` | Remove script from scriptorium |
| `scrx F G S E` | Remove script (alternate) |
| `sorq F G S E` | Check if script exists (returns 1/0) |
| `sorc F G S E` | Get script source code |

### Messaging
```caos
* Send message to agent (triggers event script)
mesg writ agnt 42 1        * Send event 1 (Push)

* Send message with parameters and delay
mesg wrt+ agnt 42 1 100 200 10    * event 1, p1=100, p2=200, delay=10 ticks
```

---

## 9. Camera & Map

### Camera
| Command | Description |
|---|---|
| `cmrp x y pan` | Centre camera on position (pan: 0=jump, 1=smooth) |
| `cmra x y pan` | Set camera top-left to position |
| `cmrt pan` | Centre camera on `targ` |
| `trck agent x% y% style transition` | Camera tracks agent |
| `meta metaroom_id` | Switch to metaroom |
| `cmrx`, `cmry` | Current camera position |
| `wndw`, `wndh` | Window dimensions |

### Map & Rooms
| Command | Description |
|---|---|
| `gmap x y` | Metaroom ID at coordinates (-1 if outside) |
| `grap x y` | Room ID at coordinates (-1 if outside) |
| `room agent` | Room ID containing agent |
| `prop room_id ca_idx value` | Set cellular automata value in room |
| `door r1 r2 perm` | Set door permeability between rooms |

---

## 10. Genetics & Genome

### Genome Commands
| Command | Description |
|---|---|
| `gene load agent slot "moniker"` | Load .gen file into genome slot |
| `gene cros child_a slot mum_a slot dad_a slot mc md dc dd` | Cross two genomes |
| `gene clon dest_a slot src_a slot` | Clone genome |
| `gene kill agent slot` | Clear genome slot |
| `gene move dest_a slot src_a slot` | Move genome between slots |
| `gtos slot` | Get moniker of genome in slot |
| `mtoc "moniker"` | Get creature agent from moniker |

### Full Creature Injection Pipeline

> ⚠️ **`gene load` requires an existing genome file.** The argument is the
> filename stem (without `.gen`). List available genomes in the `Genetics/`
> directory — typical DS files include `norn.bondi.48`, `norn.zebra.48`,
> `gren.banshee.49`, etc. A bare `"norn"` will fail with "Gene file not found".

```caos
new: simp 1 1 1 "blnk" 1 0 0      * Create temporary "blank" agent (genome carrier)
gene load targ 1 "<moniker>"        * Load .gen file into genome slot 1 of the temp agent
setv va00 unid                      * Store temp agent's unique ID in va00
new: crea 4 targ 1 <sex> 0         * Hatch creature from genome slot 1 (family 4 = creature)
                                     * Sex: 0=random, 1=male, 2=female; Variant: 0=random
born                                 * Register birth in history system
                                     *   → LifeEvent::typeBorn on child
                                     *   → LifeEvent::typeChildBorn on both parents
accg game "c3_creature_accg"         * Gravitational acceleration (default: 5.0)
attr game "c3_creature_attr"         * Agent attributes (default: 198)
bhvr game "c3_creature_bhvr"         * Click behaviours (default: 15)
perm game "c3_creature_perm"         * Wall permeability (default: 100)
setv va01 unid                       * Store new creature's unique ID in va01
targ agnt va00                       * Re-select the temporary blank agent
kill targ                            * Destroy the temporary agent
targ agnt va01                       * Re-select the creature
mvsf 1000 8900                       * Move to safe position in Norn Meso (Metaroom 11)
```

> ⚠️ **World placement:** `mvsf 1000 8900` is the standard Docking Station
> Norn Meso position. If your world does not contain Metaroom 11 (e.g. a
> custom or minimal test world), this will crash the engine or place the
> creature in limbo. **Always verify the target position exists** by checking
> existing creature positions first:
>
> ```caos
> inst
> enum 4 0 0
>     outs "ID=" outv unid outs " pos=(" outv posx outs "," outv posy outs ")\n"
> next
> ```
>
> Then use coordinates from an existing creature's location for `mvsf`.

> **Why the temporary agent?** `GENE LOAD` requires an existing agent to hold
> the genome slot. The `blnk` agent acts as a genome carrier. After `NEW: CREA`
> reads the genome and constructs the creature, the carrier is destroyed.
>
> **Why game variables for physics?** Using `game "c3_creature_accg"` etc.
> matches the physics config from the DS bootstrap egg-hatching scripts in
> `creatureBreeding.cos`. Hardcoded values (e.g. `accg 5.0`) work but may
> diverge from what the game's own scripts set.

---

## 11. World & Time

| Command | Description |
|---|---|
| `wnam` | Current world name (StringRV) |
| `wtik` | Current world tick count |
| `rtim` | Real time (seconds since epoch) |
| `sean` | Current season (0=spring, 1=summer, 2=autumn, 3=winter) |
| `save` | Save world |
| `load "name"` | Load world (switches next tick) |
| `wpau 1/0` | Pause/resume world ticking |
| `race N` | Run N ticks at max speed |

---

## 12. History System

| Command | Description |
|---|---|
| `hist name "moniker"` | Get/set creature name |
| `hist gend "moniker"` | Gender (1=male, 2=female) |
| `hist gnus "moniker"` | Genus (1=Norn, 2=Grendel, 3=Ettin) |
| `hist mon1 "moniker"` | Mother's moniker |
| `hist mon2 "moniker"` | Father's moniker |
| `hist coun "moniker"` | Count of life events |
| `hist type "moniker" idx` | Event type at index |
| `hist tage "moniker"` | Total age in ticks |

Life event types: 0=Conceived, 1=Spliced, 2=Engineered, 3=Born, 4=Aged,
5=Exported, 6=Imported, 7=Died, 8=Pregnant, 9=Impregnated, 10=Child born.

---

## 13. Agent Categories (Brain Perception)

Creatures perceive agents through a 40-slot category system. The `noun` lobe neuron
indices correspond to categories. Key categories:

| ID | Category | Classifier (F/G) | ID | Category | Classifier |
|---|---|---|---|---|---|
| 3 | Seed | 2/3 | 19 | Weather | 2/19 |
| 4 | Plant | 2/4 | 20 | Bad | 2/20 |
| 8 | Fruit | 2/8 | 21 | Toy | 2/21 |
| 11 | Food | 2/11 | 23 | Dispenser | 2/23 |
| 12 | Button | 2/12 | 29 | Creature Egg | 3/4 |
| 13 | Bug | 2/13 | 36 | Norn | 4/1 |
| 16 | Beast | 2/16 | 37 | Grendel | 4/2 |
| 17 | Nest | 2/17 | 38 | Ettin | 4/3 |

```caos
outv cati 2 23 0    * → 23 (dispenser category)
outs catx 23        * → "dispenser"
```

> If an agent falls into category 39 ("something"), creatures cannot form useful
> memories about it. Always choose an appropriate genus for custom agents.

---

## 14. Sounds

| Command | Description |
|---|---|
| `snde "file"` | Play sound effect (fire-and-forget) |
| `sndc "file"` | Play controlled sound on `targ` (one per agent) |
| `sndl "file"` | Play looping sound on `targ` |
| `stpc` | Stop controlled sound on `targ` |

---

## 15. Debug & Inspection

| Command | Description |
|---|---|
| `cstk` | Returns C++ stack trace (StringRV, custom to this port) |
| `mann "command"` | Returns help text for a CAOS command |
| `dbg: paws` | Pause engine (debug) |
| `dbg: play` | Resume engine (debug) |
| `dbg: asrt condition` | Assert (crashes if false in debug builds) |

---

## 16. MCP Tool → CAOS Mapping

Most MCP tools call REST endpoints that internally execute CAOS or query engine state
directly. However, `execute_caos` is the most powerful tool — it can do anything the
other tools do and more. Here's what each MCP tool does internally, so you know when
to use `execute_caos` instead:

| MCP Tool | Equivalent CAOS / API | When to use `execute_caos` instead |
|---|---|---|
| `list_creatures` | `GET /api/creatures` | When you need custom filtering or data not in the API response |
| `get_creature_chemistry` | `GET /api/creature/:id/chemistry` | To inject chemicals: `chem id amount` |
| `get_creature_brain` | `GET /api/creature/:id/brain` | To modify neuron states: `brn: setn` |
| `list_scripts` | `GET /api/scripts` | To get script source: `sorc F G S E` |
| `pause_engine` / `resume_engine` | `POST /api/pause` / `POST /api/resume` | `wpau 1` / `wpau 0` or `dbg: paws` / `dbg: play` |
| `get_world_tick` | `GET /api/world/tick` | `outv wtik` |
| `kill_creature` | `POST /api/creature/kill` | `targ agnt <id> dead kill targ` |
| `advance_ticks` | `POST /api/engine/advance` | `race N` (runs N ticks at max speed) |

---

## 17. Common Patterns (Copy-Paste Ready)

### Count agents by type
```caos
inst
setv va00 0
enum 4 0 0
    addv va00 1
next
outv va00
```

### List all creature positions and drives
```caos
inst
enum 4 0 0
    outs "ID=" outv unid
    outs " Pos=(" outv posx outs "," outv posy outs ")"
    outs " TopDrive=" outv drv!
    outs "\n"
next
```

### Inject chemical into a specific creature
```caos
targ agnt <creature_id>
chem <chemical_id> <amount>
```

### Move camera to an agent
```caos
targ agnt <id>
cmrp posx posy 0
```

### Build a report string (concatenation pattern)
```caos
inst
sets va01 ""
enum 4 0 0
    adds va01 "ID="
    adds va01 vtos unid
    adds va01 " "
next
outs va01
```

### TARG save/restore pattern
```caos
setv va00 unid           * Save current targ's ID
* ... switch targ ...
targ agnt va00           * Restore original targ
```

### Safely target and query
```caos
targ agnt <id>
doif targ <> null
    outv posx
    outs " "
    outv posy
endi
```

### Clean up agents and scripts
```caos
inst
enum 2 100 1
    kill targ
next
scrx 2 100 1 9           * Remove timer script
```

> ⚠️ Always kill agents BEFORE removing their scripts.

### Simulate a player click from MCP
```caos
inst
rtar 2 23 800
mesg wrt+ targ 0 0 0 0   * Message 0 = Activate1 → triggers Event 1
```

### Query all drives of a creature
```caos
inst
targ norn
doif targ <> null
    setv va01 0
    loop
        outs "Drive "
        outv va01
        outs ": "
        outv driv va01
        outs "\n"
        addv va01 1
    untl va01 >= 20
endi
```

### Set creature permissions
```caos
* IMPORTANT: bhvr must be set AFTER injecting event scripts!
* It validates that the corresponding scripts exist.
rtar 2 23 800
bhvr 3                    * Push (1) + Pull (2)
```

---

## 18. Reference: Output Commands

The only way to get data out of `execute_caos`:

| Command | Usage | Example |
|---|---|---|
| `outs` | Print string | `outs "hello"` |
| `outv` | Print number | `outv 42` or `outv posx` |
| `outs vtos expr` | Print number as part of string | `outs vtos unid` |

You **cannot** mix `outs` and `outv` in a single expression. They are separate
commands that each append to the output stream.

---

## Further Reference

The full CAOS documentation lives in the developer tools wiki at
`tools/docs/caos_*.md`. Key files:

| File | Covers |
|---|---|
| `caos_overview.md` | Language fundamentals, type system |
| `caos_agents.md` | Agent creation, properties, enumeration, targeting |
| `caos_variables.md` | Variables, math, strings, type conversion |
| `caos_flow.md` | Conditionals, loops, subroutines |
| `caos_creatures.md` | Lifecycle, drives, biochemistry, brain, appearance |
| `caos_events.md` | Event system, message→event mapping, BHVR |
| `caos_categories.md` | 40-slot perception system |
| `caos_tutorial.md` | Beginner walkthrough with examples |
| `caos_tutorial_intermediate.md` | Advanced patterns, compound agents, feeders |
