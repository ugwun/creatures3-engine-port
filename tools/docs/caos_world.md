# CAOS Reference: World Management

Commands for saving, loading, and managing worlds.

---

## World Operations

### SAVE — Save World

**Syntax:** `SAVE`
**Type:** Command

Saves the current world to disk.

---

### LOAD — Load World

**Syntax:** `LOAD world_name (string)`
**Type:** Command

Loads the specified world. The world switch happens on the next engine tick.

---

### QUIT — Quit Engine

**Syntax:** `QUIT`
**Type:** Command

Quits the engine.

---

### RGAM — Hard Reset

**Syntax:** `RGAM`
**Type:** Command

Hard-resets the engine back to the initial world selection splash screen.

---

## World Creation & Deletion

### WRLD — Create/Get World Name

**Syntax (command):** `WRLD world_name (string)`
**Type:** Command

Creates a new world directory for the given world name.

**Syntax (string RV):** `WRLD world_index (integer)`
**Type:** String R-Value

Returns the name of the world specified by world_index (0 to `NWLD`-1).

---

### DELW — Delete World

**Syntax:** `DELW world_name (string)`
**Type:** Command

Deletes the specified world directory and all its contents.

---

### NWLD — World Count

**Syntax:** `NWLD`
**Type:** Integer R-Value

Returns the number of worlds (for use with string RV `WRLD`).

---

### RGAM — Refresh Game Settings

**Syntax:** `RGAM`
**Type:** Command

Refreshes all settings that are normally read from game variables at start up (e.g. the length of a day). This allows you to change such settings on the fly.

---

## World Queries

### WNAM — Current World Name

**Syntax:** `WNAM`
**Type:** String R-Value

Returns the name of the currently loaded world.

---

### WUID — Current World UID

**Syntax:** `WUID`
**Type:** String R-Value

Returns the unique identifier of the currently loaded world.

---

### PSWD — World Password

**Syntax:** `PSWD worldIndex (integer)`
**Type:** String R-Value

Returns the password for the specified world. Empty string if not password protected.

---

### PSWD — Set World Password

**Syntax (command):** `PSWD password (string)`
**Type:** Command

Sets the password for the current world.

---

### WNTI — World Name to Index

**Syntax:** `WNTI world (string)`
**Type:** Integer R-Value

Returns the index of the given world name. Returns -1 if the world doesn't exist.

---

## DS Stubs

### WEBB — Open URL (DS)

**Syntax:** `WEBB url (string)`
**Type:** Command

Open a URL in the default web browser. (Stub: not supported on this port.)

---

### TINO — Tinderbox Command (DS)

**Syntax:** `TINO x (integer) y (integer) z (integer) p1 (anything) p2 (anything)`
**Type:** Command

Tinderbox/network coordinate command. (Stub.)

---

### CATO — Catalogue Command (DS)

**Syntax:** `CATO n (integer)`
**Type:** Command

Catalogue command. (Stub.)

---

[← Back to CAOS Overview](caos_overview.md)
