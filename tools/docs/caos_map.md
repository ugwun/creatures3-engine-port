# CAOS Reference: Map & Rooms

Commands for creating and managing the room system, metarooms, cellular automata (CAs), and spatial queries.

---

## Map Setup

### MAPD — Set Map Dimensions

**Syntax:** `MAPD width (integer) height (integer)`
**Type:** Command

Sets the dimensions of the map. These are the maximum world coordinates. Metarooms are rectangles within this area.

---

### MAPK — Reset Map

**Syntax:** `MAPK`
**Type:** Command

Resets the map to be empty.

---

### BRMI — Set Index Bases

**Syntax:** `BRMI metaroom_base (integer) room_base (integer)`
**Type:** Command

Sets the Map's Metaroom and Room index bases for adding new rooms/metarooms.

---

## Metarooms

### ADDM — Add Metaroom

**Syntax:** `ADDM x (integer) y (integer) width (integer) height (integer) background (string)`
**Type:** Integer R-Value

Creates a new metaroom with the given coordinates. Specifies the starting background file. Returns the id of the new metaroom.

---

### DELM — Delete Metaroom

**Syntax:** `DELM metaroom_id (integer)`
**Type:** Command

Deletes the specified metaroom from the map.

---

### ADDB — Add Background

**Syntax:** `ADDB metaroom_id (integer) background_file (string)`
**Type:** Command

Add a new background to the given metaroom. Use `BKGD` to change the current displayed background.

---

### GMAP — Get Metaroom at Point

**Syntax:** `GMAP x (float) y (float)`
**Type:** Integer R-Value

Returns the metaroom id at point x, y. Returns -1 if outside the room system.

---

### EMID — Enumerate Metaroom IDs

**Syntax:** `EMID`
**Type:** String R-Value

Returns a string containing all the metaroom ids in the world separated by spaces.

---

### MLOC — Metaroom Location

**Syntax:** `MLOC metaroom_id (integer)`
**Type:** String R-Value

Returns the location of the specified metaroom as a string: `x y width height`.

---

### BKDS — Backgrounds for Metaroom

**Syntax:** `BKDS metaroom_id (integer)`
**Type:** String R-Value

Returns a string containing all the background names for the specified metaroom in a comma separated list.

---

### MAPW / MAPH — Map Dimensions

**Type:** Integer R-Value

| Command | Returns |
|---|---|
| `MAPW` | Total width of the map |
| `MAPH` | Total height of the map |

---

## Rooms

### ADDR — Add Room

**Syntax:** `ADDR metaroom_id (integer) x_left (integer) x_right (integer) y_left_ceiling (integer) y_right_ceiling (integer) y_left_floor (integer) y_right_floor (integer)`
**Type:** Integer R-Value

Creates a new room within a metaroom. Rooms have vertical left and right walls, but potentially sloped floors and ceilings. Returns the id of the new room.

---

### DELR — Delete Room

**Syntax:** `DELR room_id (integer)`
**Type:** Command

Deletes the specified room from the map.

---

### ROOM — Get Room ID

**Syntax:** `ROOM agent (agent)`
**Type:** Integer R-Value

Returns the id of the room containing the midpoint of the specified agent.

---

### GRAP — Get Room at Point

**Syntax:** `GRAP x (float) y (float)`
**Type:** Integer R-Value

Returns the room id at point x, y. Returns -1 if outside the room system.

---

### GRID — Adjacent Room

**Syntax:** `GRID agent (agent) direction (integer)`
**Type:** Integer R-Value

Returns the ID of a room adjacent to the agent in the given direction. A straight line is drawn from the centre of the agent until it hits a room. Directions are `LEFT`, `RGHT`, `_UP_`, or `DOWN`. Returns -1 if no room is found.

---

### RTYP — Set/Get Room Type

**Syntax (command):** `RTYP room_id (integer) room_type (integer)`
**Type:** Command

Sets the type of a room. The meaning of the types depends on the game. `RATE` also uses the room type.

**Syntax (integer RV):** `RTYP room_id (integer)`
**Type:** Integer R-Value

Returns the type of a room, or -1 if not a valid room id.

---

### ERID — Enumerate Room IDs

**Syntax:** `ERID metaroom_id (integer)`
**Type:** String R-Value

Returns a string of all room ids in the specified metaroom separated by spaces. Returns all rooms if `metaroom_id` is -1.

---

### RLOC — Room Location

**Syntax:** `RLOC room_id (integer)`
**Type:** String R-Value

Returns the location of the specified room as: `xLeft xRight yLeftCeiling yRightCeiling yLeftFloor yRightFloor`.

---

### TORX / TORY — Relative Position to Room

**Syntax:** `TORX room_id (integer)` / `TORY room_id (integer)`
**Type:** Float R-Value

Returns relative X/Y position of the centre of the given room from target's top left corner.

---

## Doors & Links

### DOOR — Set/Get Door Permeability

**Syntax (command):** `DOOR room_id1 (integer) room_id2 (integer) permeability (integer)`
**Type:** Command

Sets the permeability of the door between two rooms. Used for both CAs and physical motion. See also `PERM`.

**Syntax (integer RV):** `DOOR room_id1 (integer) room_id2 (integer)`
**Type:** Integer R-Value

Returns the door permeability between two rooms.

---

### LINK — Set/Get Room Link (CA)

**Syntax (command):** `LINK room1 (integer) room2 (integer) permeability (integer)`
**Type:** Command

Sets the permeability of the link between rooms, creating the link if none exists. Set to 0 to close (destroy) the link. Used for CAs. See also `DOOR`.

**Syntax (integer RV):** `LINK room1 (integer) room2 (integer)`
**Type:** Integer R-Value

Returns the permeability of the link, or 0 if no link exists.

---

## Cellular Automata (CAs)

### PROP — Set/Get CA Level

**Syntax (command):** `PROP room_id (integer) ca_index (integer) ca_value (float)`
**Type:** Command

Sets the level of a CA in a particular room. There are 16 CAs and their meaning depends on the game. Level is between 0 and 1.

**Syntax (float RV):** `PROP room_id (integer) ca_index (integer)`
**Type:** Float R-Value

Returns the value of a CA in a room.

---

### RATE — Set/Get CA Rates

**Syntax (command):** `RATE room_type (integer) ca_index (integer) gain (float) loss (float) diffusion (float)`
**Type:** Command

Sets various rates for a CA in a particular type of room. Values 0 to 1. Gain is susceptibility to absorb from agents in the room. Loss is amount lost to atmosphere. Diffusion is amount spread to adjacent rooms.

**Syntax (string RV):** `RATE room_type (integer) ca_index (integer)`
**Type:** String R-Value

Returns a string containing gain, loss, and diffusion rates for that combination of room type and CA.

---

### ALTR — Adjust CA

**Syntax:** `ALTR room_id (integer) ca_index (integer) ca_delta (float)`
**Type:** Command

Directly adjusts the level of a CA in a room. Specify room_id of -1 to use the room at the midpoint of the target agent.

---

### EMIT — Emit CA

**Syntax:** `EMIT ca_index (integer) amount (float)`
**Type:** Command

Target now constantly emits an amount of a CA into the room it is in.

```
emit 0 0.5
* Constantly emit 0.5 of CA 0 into the current room
```

---

### CACL — Associate CA with Classifier

**Syntax:** `CACL family (integer) genus (integer) species (integer) ca_index (integer)`
**Type:** Command

Associates the classification specified with the CA specified. This allows linking CAs to classifiers within creatures' brains.

---

### DOCA — Update CAs

**Syntax:** `DOCA no_of_updates (integer)`
**Type:** Command

Updates all CAs the specified number of times.

---

### HIRP — Highest CA Room

**Syntax:** `HIRP room_id (integer) ca_index (integer) directions (integer)`
**Type:** Integer R-Value

Returns the id of the room adjacent to this one with the highest concentration of the given CA. Direction 0 for left/right, 1 for any direction.

---

### LORP — Lowest CA Room

**Syntax:** `LORP room_id (integer) ca_index (integer) directions (integer)`
**Type:** Integer R-Value

Returns the id of the room adjacent to this one with the lowest concentration of the given CA. Direction 0 for left/right, 1 for any direction.

---

## Direction Constants

| Command | Type | Returns |
|---|---|---|
| `LEFT` | Integer R-Value | Value of the left constant |
| `RGHT` | Integer R-Value | Value of the right constant |
| `_UP_` | Integer R-Value | Value of the up constant |
| `DOWN` | Integer R-Value | Value of the down constant |

---

[← Back to CAOS Overview](caos_overview.md)
