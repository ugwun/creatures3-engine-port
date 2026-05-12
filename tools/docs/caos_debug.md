# CAOS Reference: Debug

Commands for debugging, profiling, and inspecting the engine.

---

## Engine Control (DBG:)

### DBG: PAWS — Pause Engine

**Syntax:** `DBG: PAWS`
**Type:** Command

Pauses everything in the game. No game-driven ticks will occur until `DBG: PLAY` is issued. Only useful for debugging — use `PAUS` for gameplay pausing.

---

### DBG: PLAY — Resume Engine

**Syntax:** `DBG: PLAY`
**Type:** Command

Undoes a previously given `DBG: PAWS`.

---

### DBG: TOCK — Force Tick

**Syntax:** `DBG: TOCK`
**Type:** Command

Forces a tick to occur. Useful in external apps to drive the game clock manually.

---

### DBG: FLSH — Flush Input

**Syntax:** `DBG: FLSH`
**Type:** Command

Flushes the system's input buffers — usually only useful if `DBG: PAWS`ed.

---

## Debug Output

### DBG: OUTV — Debug Output Value

**Syntax:** `DBG: OUTV value (decimal)`
**Type:** Command

Send a number to the debug log. Use `DBG: POLL` to retrieve.

---

### DBG: OUTS — Debug Output String

**Syntax:** `DBG: OUTS value (string)`
**Type:** Command

Send a string to the debug log. Use `DBG: POLL` to retrieve.

---

### DBG: POLL — Poll Debug Output

**Syntax:** `DBG: POLL`
**Type:** Command

Takes all `DBG: OUTV` and `DBG: OUTS` output to date and writes it to the output stream.

---

## Profiling

### DBG: PROF — Agent Profile Data

**Syntax:** `DBG: PROF`
**Type:** Command

Sends agent profile information to the output stream. Gives data about time spent running update and message handling code for each classifier, in CSV format (loadable into spreadsheets).

---

### DBG: CPRO — Clear Profile Data

**Syntax:** `DBG: CPRO`
**Type:** Command

Clears agent profiling information. Measurements output with `DBG: PROF` start from this point.

---

## Documentation

### DBG: HTML — Generate CAOS Docs

**Syntax:** `DBG: HTML sort_order (integer)`
**Type:** Command

Sends CAOS documentation to the output stream. Sort order: 0 for alphabetical, 1 for categorical.

---

### MANN — Man Page

**Syntax:** `MANN command (string)`
**Type:** Command

Sends the man page (help text) for a specific CAOS command to the output stream.

---

### HELP — Help

**Syntax:** `HELP`
**Type:** Command

Outputs basic help to the output stream.

---

## Assertions & Debugging

### DBG: ASRT — Assert Condition

**Syntax:** `DBG: ASRT condition`
**Type:** Command

Confirms that a condition is true. If it isn't, displays a runtime error dialog.

```
dbg: asrt ov00 gt 0
```

---

### DBG: WTIK — Set World Tick

**Syntax:** `DBG: WTIK new_world_tick (integer)`
**Type:** Command

Changes the world tick to the given value. **Only for debugging** — will leave confusing history information and change delayed message timing. Main use: jump to different seasons/times of day.

---

### DBG: TACK — Track Agent

**Syntax:** `DBG: TACK follow (agent)`
**Type:** Command

Pauses the game when the given agent next executes a single line of CAOS code. This pause is mid-tick. Either another `DBG: TACK` or `DBG: PLAY` will continue execution.

> **Warning:** The tacked agent's VM is mid-processing, so some CAOS commands may be unpredictable. Don't `KILL` the tacking agent.

---

### TACK — Get Tracked Agent

**Syntax:** `TACK`
**Type:** Agent R-Value

Returns the agent currently being `DBG: TACK`ed.

---

## Debug Queries

### CODF / CODG / CODS / CODE — Script Classifier

**Type:** Integer R-Value

Returns information about the script currently being run by target:

| Command | Returns |
|---|---|
| `CODF` | Family of running script (-1 if idle) |
| `CODG` | Genus of running script (-1 if idle) |
| `CODS` | Species of running script (-1 if idle) |
| `CODE` | Event number of running script (-1 if idle) |

---

### CODP — Source Code Offset

**Syntax:** `CODP`
**Type:** Integer R-Value

Returns the offset into the source code of the next instruction to be executed by the target. Use `SORC` to get the source code. Returns -1 if the target is not running anything.

---

### PAWS — Check Debug Pause

**Syntax:** `PAWS`
**Type:** Integer R-Value

Returns 1 if the engine is debug-paused (via `DBG: PAWS`), 0 if running.

---

### APRO — Search Help Text

**Syntax:** `APRO search_text (string)`
**Type:** Command

Lists all command names whose help text contains the given search string.

---

### MEMX — Memory Information

**Syntax:** `MEMX`
**Type:** Command

Sends information about allocated memory to the output stream: Memory Load, Total Physical, Available Physical, Total Page File, Available Page File, Total Virtual, Available Virtual.

---

### DBG# — Debug VM Info

**Syntax:** `DBG# variable (integer)`
**Type:** String R-Value

Dumps debug information for the virtual machine of target. Variable values:

| Value | Returns |
|---|---|
| -1 | Whether in INST or not |
| -2 | Whether in LOCK or not |
| -3 | Current TARG of virtual machine |
| -4 | OWNR |
| -5 | FROM — who sent the message |
| -6 | IT — if creature, where attention was |
| -7 | PART number for compound agents |
| -8 | _P1_ — first message parameter |
| -9 | _P2_ — second message parameter |
| 0–99 | Local variables VA00 to VA99 |

---

### DBGA — Debug Agent Info

**Syntax:** `DBGA variable (integer)`
**Type:** String R-Value

Dumps debug information for target. Variable can be: 0–99 for OV00–OV99, or -1 for timer tick counter.

---

### HEAP — Heap Size

**Syntax:** `HEAP index (integer)`
**Type:** Integer R-Value

Returns a measure of the agent heap size. 0 for VM, 1 for creature (returns -1 if not a creature).

---

### CSTK — C++ Stack Trace

**Syntax:** `CSTK`
**Type:** String R-Value

Returns a formatted string containing the C++ stack trace from where the CAOS command was evaluated. For debugging purposes.

---

[← Back to CAOS Overview](caos_overview.md)
