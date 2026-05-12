# CAOS Reference: Time & World

Commands relating to world time, ticks, seasons, and engine pace.

---

## World Time

### WTIK — World Tick

**Syntax:** `WTIK`
**Type:** Integer R-Value

Returns the current world tick count.

---

### RTIM — Real Time

**Syntax:** `RTIM`
**Type:** Integer R-Value

Returns the current real world time — seconds since midnight, 1 January 1970 in UTC. Use `RTIF` to format for display.

---

### RTIF — Format Real Time

**Syntax:** `RTIF real_time (integer) format (string)`
**Type:** String R-Value

Takes a real world time (as returned by `RTIM` or `HIST RTIM`) and converts it to a localized string for display. Format codes:

| Code | Description |
|---|---|
| `%a` | Abbreviated weekday name |
| `%A` | Full weekday name |
| `%b` | Abbreviated month name |
| `%B` | Full month name |
| `%c` | Date and time representation |
| `%d` | Day of month (01–31) |
| `%H` | Hour in 24-hour format (00–23) |
| `%I` | Hour in 12-hour format (01–12) |
| `%m` | Month (01–12) |
| `%M` | Minute (00–59) |
| `%S` | Second (00–59) |
| `%Y` | Year with century |
| `%%` | Literal percent sign |

```
sets va00 rtif rtim "%A, %B %d %Y - %H:%M:%S"
outs va00
```

---

## Game Time

### TIME — Time of Day

**Syntax:** `TIME`
**Type:** Integer R-Value

Returns the current time of day in the game world.

---

### DATE — Day of Season

**Syntax:** `DATE`
**Type:** Integer R-Value

Returns the current day within the current season.

---

### SEAN — Season

**Syntax:** `SEAN`
**Type:** Integer R-Value

Returns the current season of the game world.

---

### YEAR — Year

**Syntax:** `YEAR`
**Type:** Integer R-Value

Returns the number of game years elapsed.

---

### DAYT — Day of Week

**Syntax:** `DAYT`
**Type:** Integer R-Value

Returns the current day within the week.

---

### MONT — Month

**Syntax:** `MONT`
**Type:** Integer R-Value

Returns the current month of the year.

---

### MSEC — System Milliseconds

**Syntax:** `MSEC`
**Type:** Integer R-Value

Returns the number of milliseconds since some arbitrary point (usually system start). Useful for measuring time intervals.

---

### ETIK — Engine Ticks

**Syntax:** `ETIK`
**Type:** Integer R-Value

Returns the number of ticks since the engine was loaded. (As opposed to `WTIK` which counts since the world was created.)

---

## Pause Management

### WPAU — World Pause

**Syntax (command):** `WPAU paused (integer)`
**Type:** Command

Pauses and unpauses the game. This is the same as `PAUS` but works on the world level — everything pauses, including creature ageing and world time.

**Syntax (integer RV):** `WPAU`
**Type:** Integer R-Value

Returns 1 if the world is paused, 0 otherwise.

---

## Speed Control

### WOLF — Wolfing Run Flags

**Syntax:** `WOLF kanga_mask (integer) eeyore_mask (integer)`
**Type:** Integer R-Value

Controls various wolfing-run features via AND and EOR masks on the following bits:

| Bit | Description |
|---|---|
| 1 | Display rendering (turning off speeds game up) |
| 2 | Fastest ticks (run as fast as possible instead of 20fps cap) |
| 4 | Refresh display at end of tick (flag auto-clears after refresh) |
| 8 | Autokill (auto-kill agents that generate run errors) |

Returns the resulting flags value.

---

### RACE — Tick Duration

**Syntax:** `RACE`
**Type:** Integer R-Value

Returns the time in milliseconds the last tick took overall. Has a minimum of 50ms on fast machines. Accounts for all time including event handling and window processing. Compare `PACE`.

---

### SCOL — Scroll Control

**Syntax:** `SCOL and_mask (integer) eor_mask (integer) up_speeds (byte-string) down_speeds (byte-string)`
**Type:** Integer R-Value

Controls scrolling functions via AND/EOR masks:

| Bit | Description |
|---|---|
| 1 | Screen edge nudgy scrolling |
| 2 | Keyboard scrolling |
| 4 | Middle mouse button screen dragging |
| 8 | Mouse wheel screen scrolling |

The byte strings set pixel counts for nudgy/keyboard scrolling acceleration/deceleration. Use `[]` to leave unchanged.

---

### BUZZ — Tick Speed (DS)

**Syntax (command):** `BUZZ interval_ms (integer)`
**Type:** Command

Sets tick interval in milliseconds — lower values mean faster ticks. (DS stub.)

**Syntax (integer RV):** `BUZZ`
**Type:** Integer R-Value

Returns the current tick interval.

---

### PACE — Tick Rate Satisfaction

**Syntax:** `PACE`
**Type:** Float R-Value

Returns the tick rate satisfaction factor:
- Factor 1 — ticks are taking the expected time
- Factor > 1 — the engine is running too slowly
- Factor < 1 — the engine has spare processing time

This is averaged over the last 10 ticks. Agents can use this to adjust resource usage according to spare processing time.

---

[← Back to CAOS Overview](caos_overview.md)
