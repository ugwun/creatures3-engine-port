# CAOS Reference: Resources (PRAY)

Commands for working with the PRAY resource system — installing agents, exporting/importing creatures, and managing resource files.

---

## Resource Management

### PRAY REFR — Refresh Resources

**Syntax:** `PRAY REFR`
**Type:** Command

Refreshes the engine's view of the Resource directory. Execute this if files in the directory may have changed. Forces a `PRAY GARB` automatically.

---

### PRAY GARB — Garbage Collect Resources

**Syntax:** `PRAY GARB force (integer)`
**Type:** Command

Clears cached resource data. If force is 0, only forgets unused resources. If non-zero, forgets all loaded resources.

---

## Resource Queries

### PRAY COUN — Count Resources

**Syntax:** `PRAY COUN resource_type (string)`
**Type:** Integer R-Value

Returns the number of resource chunks tagged with the given type (4 characters max).

---

### PRAY TEST — Test Resource Availability

**Syntax:** `PRAY TEST resource_name (string)`
**Type:** Integer R-Value

Checks for chunk existence:
- 0 — not available
- 1 — cached and ready
- 2 — on disk, uncompressed
- 3 — on disk, compressed

---

### PRAY SIZE — Resource Size

**Syntax:** `PRAY SIZE resource_name (string)`
**Type:** Integer R-Value

Returns the size of the chunk in bytes.

---

### PRAY AGTI — Get Integer Tag

**Syntax:** `PRAY AGTI resource_name (string) integer_tag (string) default_value (integer)`
**Type:** Integer R-Value

Returns the value of an integer tag associated with the named resource. Falls back to `default_value` if the tag doesn't exist.

---

### PRAY AGTS — Get String Tag

**Syntax:** `PRAY AGTS resource_name (string) string_tag (string) default_value (string)`
**Type:** String R-Value

Returns the value of a string tag associated with the named resource. Falls back to `default_value`.

---

## Resource Navigation

### PRAY NEXT / PRAY PREV — Navigate Resources

**Syntax:** `PRAY NEXT resource_type (string) last_known (string)` / `PRAY PREV ...`
**Type:** String R-Value

Returns the next/previous resource chunk name of the given type. If `last_known` is not found, returns the last/first resource of that type.

---

### PRAY FORE / PRAY BACK — Navigate Resources (DS)

**Syntax:** `PRAY FORE resource_type (string) last_known (string)` / `PRAY BACK ...`
**Type:** String R-Value

DS equivalents of `PRAY NEXT` / `PRAY PREV`.

---

## Agent Installation

### PRAY DEPS — Check Dependencies

**Syntax:** `PRAY DEPS resource_name (string) do_install (integer)`
**Type:** Integer R-Value

Checks (and optionally installs) dependencies for a resource. Return 0 for success.

---

### PRAY FILE — Install File

**Syntax:** `PRAY FILE resource_name (string) resource_type (integer) do_install (integer)`
**Type:** Integer R-Value

Installs a single file from the resource. If `do_install` is 0, just checks. Returns 0 for success, 1 for error.

---

### PRAY INJT — Inject Agent

**Syntax:** `PRAY INJT resource_name (string) do_install (integer) report_var (variable)`
**Type:** Integer R-Value

Injects an agent from a PRAY chunk. If `do_install` is 0, checks only. Returns:
- 0 — success
- -1 — script not found
- -2 — injection failed
- -3 — dependency evaluation failed

---

## Creature Import/Export

### PRAY EXPO — Export Creature

**Syntax:** `PRAY EXPO chunk_name (string)`
**Type:** Integer R-Value

Exports the target creature. If successful, the creature is removed from the world. Returns 0 for success, 1 if already on disk.

---

### PRAY IMPO — Import Creature

**Syntax:** `PRAY IMPO moniker (string) actually_do_it (integer) keep_file (integer)`
**Type:** Integer R-Value

Imports a creature by moniker. Returns:
- 0 — success
- 1 — histories couldn't reconcile (creature cloned)
- 2 — moniker not found
- 3 — genome files couldn't be loaded

Set `actually_do_it` to 1 to perform, 0 to query. The new creature is `TARG`eted after import.

---

### PRAY MAKE — Build PRAY File

**Syntax:** `PRAY MAKE which_journal_spot (integer) journal_name (string) which_pray_spot (integer) pray_name (string) report_destination (variable)`
**Type:** Integer R-Value

Returns 0 for success. Report variable is set to the builder output. Journal spot 0 for world journal, 1 for global. Pray spot 0 for "My Agents", 1 for "My Creatures".

---

### PRAY KILL — Cancel Download (DS)

**Syntax:** `PRAY KILL moniker (string)`
**Type:** Integer R-Value

Cancels a pending PRAY download. Offline stub returns 0.

---

[← Back to CAOS Overview](caos_overview.md)
