# CAOS Command Reference

**CAOS** (**C**reatures **A**gent **O**bject **S**cript) is the scripting language used by the Creatures 3 and Docking Station engine (C2e). Every interactive object in the game world — from buttons and lifts to Norns and Grendels — is driven by CAOS scripts.

This reference documents **every command** available in the engine, extracted directly from the engine source code.

---

## Language Basics

### Commands vs. R-Values

CAOS has two fundamental kinds of operations:

| Kind | Description | Example |
|---|---|---|
| **Command** | Performs an action (imperative statement) | `MVTO 100 200` |
| **Integer R-Value** | Returns an integer value | `FMLY`, `RAND 1 10` |
| **Float R-Value** | Returns a floating-point value | `POSX`, `ACCG` |
| **String R-Value** | Returns a string value | `GALL`, `WNAM` |
| **Agent R-Value** | Returns an agent reference | `TARG`, `OWNR`, `NULL` |
| **Variable** | Read/write named storage | `VA00`–`VA99`, `OV00`–`OV99`, `GAME` |

Many command names are **overloaded** — the same 4-character name can appear as both a command and an r-value. For example, `POSE` as a command sets the pose, while `POSE` as an integer r-value reads the current pose.

### Data Types

| Type Code | Name | Description |
|---|---|---|
| `i` | integer | A whole number |
| `f` | float | A floating-point decimal number |
| `d` | decimal | Either integer or float (auto-detected) |
| `s` | string | A text string, enclosed in double quotes |
| `a` | agent | A reference to an agent in the world |
| `v` | variable | A writable variable (`VAxx`, `OVxx`, `MVxx`, `GAME`, etc.) |
| `b` | byte-string | A bracketed list of integers, e.g. `[1 2 3 255]` |
| `c` | condition | A boolean condition (e.g. `ov00 GT 5`) |
| `m` | anything | Any type (integer, float, string, or agent) |
| `#` | label | A subroutine label name |

### Script Structure

Scripts are identified by a **classifier** — a tuple of `(family, genus, species, event)`:

```
scrp 2 16 4 4
  * This script runs when event 4 (Activate 1) fires
  * on an agent with classifier 2 16 4
  snde "beep"
endm
```

Install scripts run once when injected:

```
* Install script — runs immediately
new: simp 2 16 4 "mysprite" 3 0 500
attr 195
tick 100
```

### Conditions

Used with `DOIF`, `ELIF`, `UNTL`, and `DBG: ASRT`:

```
doif ov00 gt 5 and ov00 lt 10
  * code block
endi
```

**Comparison operators:** `EQ` (=), `NE` (<>), `GT` (>), `GE` (>=), `LT` (<), `LE` (<=)

**Logical operators:** `AND`, `OR` — evaluated left to right (no precedence grouping).

---

## Command Categories

Commands are organized into the following categories. Click a link to see the full reference for that category.

| Category | Description |
|---|---|
| [Flow Control](caos_flow.md) | `DOIF`, `ELIF`, `ELSE`, `ENDI`, `LOOP`, `REPS`, `GSUB`, etc. |
| [Variables & Math](caos_variables.md) | `SETV`, `ADDV`, `SETS`, `RAND`, `GAME`, `VAxx`, `OVxx`, etc. |
| [Agents](caos_agents.md) | `NEW: SIMP/COMP/VHCL`, `KILL`, `ATTR`, `ENUM`, `TARG`, etc. |
| [Motion & Physics](caos_motion.md) | `MVTO`, `MVBY`, `VELO`, `ACCG`, `AERO`, `ELAS`, `FRIC`, etc. |
| [Scripts & Execution](caos_scripts.md) | `INST`, `SLOW`, `WAIT`, `STOP`, `LOCK`, `CAOS`, etc. |
| [Camera & Display](caos_camera.md) | `CMRA`, `CMRP`, `META`, `TRCK`, `SNAP`, `LINE`, `TINT`, etc. |
| [Map & Rooms](caos_map.md) | `ADDM`, `ADDR`, `ROOM`, `DOOR`, `PROP`, `RATE`, `EMIT`, etc. |
| [Creatures](caos_creatures.md) | `NEW: CREA`, `BORN`, `DEAD`, `AGES`, `CHEM`, `DRIV`, etc. |
| [Brain](caos_brain.md) | `BRN: SETN`, `BRN: SETD`, `BRN: SETL`, etc. |
| [Compounds & Parts](caos_compounds.md) | `PAT: DULL/BUTT/TEXT`, `PART`, `PTXT`, `FCUS`, etc. |
| [Vehicles](caos_vehicles.md) | `CABN`, `CABP`, `CABW`, `SPAS`, `RPAS`, `DPAS`, `EPAS`, etc. |
| [Input & Pointer](caos_input.md) | `CLAC`, `CLIK`, `IMSK`, `PURE`, `MOUS`, `KEYD`, etc. |
| [Sounds & Music](caos_sounds.md) | `SNDE`, `SNDC`, `SNDL`, `STPC`, `FADE`, `MMSC`, `RMSC`, etc. |
| [Files & I/O](caos_files.md) | `FILE OOPE/OCLO/IOPE/ICLO`, `OUTS`, `OUTV`, `INNL`, etc. |
| [Time & World](caos_time.md) | `WTIK`, `TIME`, `SEAN`, `YEAR`, `DATE`, `WOLF`, `PACE`, etc. |
| [History](caos_history.md) | `HIST EVNT/COUN/TYPE/NAME`, `OOWW`, etc. |
| [Genetics](caos_genetics.md) | `GENE LOAD/CROS/CLON/MOVE/KILL`, `GTOS`, `MTOC`, `MTOA` |
| [Resources (PRAY)](caos_resources.md) | `PRAY REFR/GARB/INJT/EXPO/IMPO`, etc. |
| [Ports](caos_ports.md) | `PRT: INEW/ONEW/JOIN/SEND`, `ECON`, etc. |
| [Messages](caos_messages.md) | `MESG WRIT`, `MESG WRT+`, `STIM`, `URGE`, `SWAY`, `ORDR` |
| [Debug](caos_debug.md) | `DBG: PAWS/PLAY/TOCK/TACK`, `MANN`, `HELP`, `HEAP`, etc. |
| [Networking (DS)](caos_net.md) | `NET: LINE/HEAR/PASS` — DS online stubs |
| [World Management](caos_world.md) | `SAVE`, `LOAD`, `QUIT`, `WRLD`, `DELW`, `WNAM`, etc. |
