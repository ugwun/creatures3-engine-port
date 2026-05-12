# CAOS Reference: History

Commands for creature life events and moniker history.

---

## History Commands (HIST)

### HIST EVNT — Trigger Life Event

**Syntax:** `HIST EVNT moniker (string) event_type (integer) related_moniker_1 (string) related_moniker_2 (string)`
**Type:** Command

Triggers a life event of the given type. Some events are triggered automatically by the engine, some need triggering from CAOS, and others are custom events. All new events call the Life Event script.

---

### HIST UTXT — Set User Text

**Syntax:** `HIST UTXT moniker (string) event_no (integer) new_value (string)`
**Type:** Command

For the given life event, sets the user text.

---

### HIST NAME — Rename Creature

**Syntax:** `HIST NAME moniker (string) new_name (string)`
**Type:** Command

Renames the creature with the given moniker.

---

### HIST WIPE — Purge History

**Syntax:** `HIST WIPE moniker (string)`
**Type:** Command

Purge the creature history for the given moniker. Only applies if the genome isn't referenced by any slot, and the creature is fully dead or exported. Use `OOWW` to test this first.

---

### HIST FOTO — Set Photo

**Syntax:** `HIST FOTO moniker (string) event_no (integer) new_value (string)`
**Type:** Command

For the given life event, sets the associated photograph. Use `SNAP` to take the photograph first. Overwrites any existing photo (old photo goes to attic).

---

## History Integer R-Values

### HIST COUN — Event Count

**Syntax:** `HIST COUN moniker (string)`
**Type:** Integer R-Value

Returns the number of life events for the given moniker. Returns 0 if no events or moniker doesn't exist.

---

### HIST TYPE — Event Type

**Syntax:** `HIST TYPE moniker (string) event_no (integer)`
**Type:** Integer R-Value

Returns the type of the given life event:

| Type | Description |
|---|---|
| 0 | Conceived (natural) |
| 1 | Spliced (GENE CROS) |
| 2 | Engineered (GENE LOAD) |
| 3 | Born (BORN command) |
| 4 | Aged (life stage change) |
| 5 | Exported |
| 6 | Imported |
| 7 | Died |
| 8 | Became pregnant |
| 9 | Impregnated |
| 10 | Child born |
| 11 | Laid by mother |
| 12 | Laid an egg |
| 13 | Photographed |
| 14 | Cloned |
| 15 | Clone source |
| 100+ | Custom events |

---

### HIST WTIK — World Tick of Event

**Syntax:** `HIST WTIK moniker (string) event_no (integer)`
**Type:** Integer R-Value

Returns the world tick when the life event happened.

---

### HIST TAGE — Age at Event

**Syntax:** `HIST TAGE moniker (string) event_no (integer)`
**Type:** Integer R-Value

Returns the age in ticks of the creature when the event happened. Returns -1 if the creature was not in the world, wasn't born yet, or was fully dead.

---

### HIST RTIM — Real Time of Event

**Syntax:** `HIST RTIM moniker (string) event_no (integer)`
**Type:** Integer R-Value

Returns the real world time when the event happened (seconds since epoch). Use `RTIF` to format for display.

---

### HIST CAGE — Life Stage at Event

**Syntax:** `HIST CAGE moniker (string) event_no (integer)`
**Type:** Integer R-Value

Returns the life stage of the creature when the event happened.

---

### HIST GEND — Gender

**Syntax:** `HIST GEND moniker (string)`
**Type:** Integer R-Value

Returns gender: 1 for male, 2 for female, -1 if not born yet.

---

### HIST GNUS — Genus

**Syntax:** `HIST GNUS moniker (string)`
**Type:** Integer R-Value

Returns genus: 1 for Norn, 2 for Grendel, 3 for Ettin.

---

### HIST VARI — Variant

**Syntax:** `HIST VARI moniker (string)`
**Type:** Integer R-Value

Returns the variant. -1 if not born yet.

---

### HIST FIND — Find Event by Type

**Syntax:** `HIST FIND moniker (string) event_type (integer) from_index (integer)`
**Type:** Integer R-Value

Searches for a life event of a certain type. Search begins **after** `from_index`. Specify -1 to find the first event. Returns the event number, or -1 if not found.

---

### HIST FINR — Reverse Find Event

**Syntax:** `HIST FINR moniker (string) event_type (integer) from_index (integer)`
**Type:** Integer R-Value

Same as `HIST FIND` but searches backwards. Specify -1 to find the last event.

---

### HIST MUTE — Point Mutations

**Syntax:** `HIST MUTE moniker (string)`
**Type:** Integer R-Value

Returns the number of point mutations the genome received during crossover.

---

### HIST CROS — Crossover Points

**Syntax:** `HIST CROS moniker (string)`
**Type:** Integer R-Value

Returns the number of crossover points when the genome was made.

---

### HIST WVET — Verified (DS)

**Syntax:** `HIST WVET moniker (string)`
**Type:** Integer R-Value

Returns 1 if the creature's history was online-verified, 0 otherwise. Offline stub returns 0.

---

### HIST SEAN / HIST TIME / HIST YEAR / HIST DATE

These function like `SEAN`, `TIME`, `YEAR`, `DATE` but accept a world tick parameter instead of using the current tick.

---

## History String R-Values

### HIST MON1 / HIST MON2 — Associated Monikers

**Syntax:** `HIST MON1 moniker (string) event_no (integer)` / `HIST MON2 ...`
**Type:** String R-Value

Returns the first/second associated moniker for the given life event.

---

### HIST UTXT — Get User Text

**Syntax:** `HIST UTXT moniker (string) event_no (integer)`
**Type:** String R-Value

Returns the user text for the given life event.

---

### HIST WNAM — World Name of Event

**Syntax:** `HIST WNAM moniker (string) event_no (integer)`
**Type:** String R-Value

Returns the name of the world the event happened in.

---

### HIST WUID — World UID of Event

**Syntax:** `HIST WUID moniker (string) event_no (integer)`
**Type:** String R-Value

Returns the unique identifier of the world the event happened in.

---

### HIST NAME — Creature Name

**Syntax:** `HIST NAME moniker (string)`
**Type:** String R-Value

Returns the name of the creature with the given moniker.

---

### HIST NEXT / HIST PREV — Navigate Monikers

**Syntax:** `HIST NEXT moniker (string)` / `HIST PREV moniker (string)`
**Type:** String R-Value

Returns the next/previous moniker with a history. Pass empty string for first/last.

---

### HIST FOTO — Get Photo

**Syntax:** `HIST FOTO moniker (string) event_no (integer)`
**Type:** String R-Value

Returns the filename of the associated photograph, or empty string if none.

---

### HIST NETU — Network User (DS)

**Syntax:** `HIST NETU moniker (string) event_no (integer)`
**Type:** String R-Value

Returns the network username associated with the moniker at the event. Offline stub returns "".

---

## Related Commands

### OOWW — Can Wipe?

**Syntax:** `OOWW moniker (string)`
**Type:** Integer R-Value

Returns the status for whether `HIST WIPE` will work: 0 = OK to wipe, 1 = creature is still alive, 2 = references exist.

---

### NWLD — Number of Worlds

**Syntax:** `NWLD`
**Type:** Integer R-Value

Returns the total number of worlds (for use with `WRLD`).

---

[← Back to CAOS Overview](caos_overview.md)
