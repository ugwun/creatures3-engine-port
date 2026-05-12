# CAOS Reference: Vehicles

Commands for managing vehicles — compound agents that can carry other agents.

---

## Cabin Definition

### CABN — Set Cabin Rectangle

**Syntax:** `CABN left (integer) top (integer) right (integer) bottom (integer)`
**Type:** Command

Sets the bounding rectangle of the target vehicle's cabin (the area where passengers are contained). Coordinates are relative to part 0 of the vehicle.

---

### CABL / CABR / CABB / CABT — Cabin Rect Queries

**Type:** Integer R-Value

| Command | Returns |
|---|---|
| `CABL` | Relative position of left side of cabin |
| `CABR` | Relative position of right side of cabin |
| `CABT` | Relative position of top side of cabin |
| `CABB` | Relative position of bottom side of cabin |

---

### CABV — Set/Get Cabin Room ID

**Syntax (command):** `CABV room_id (integer)`
**Type:** Command

Sets the room number which things in the cabin think they are in. Default is -1, meaning the room is determined by the vehicle's position. Set this if the vehicle ever leaves the room system.

**Syntax (integer RV):** `CABV`
**Type:** Integer R-Value

Returns the cabin room number.

---

### CABW — Set Cabin Width/Capacity

**Syntax:** `CABW cabin_capacity (integer)`
**Type:** Command

Set the capacity or width of the cabin. Determines how many passengers the cabin can hold — each passenger is placed on a separate plane. Use `CABP` to set the plane of the first agent. Default 0 means unlimited passengers on the same plane.

---

### CABP — Set/Get Passenger Plane

**Syntax (command):** `CABP plane (integer)`
**Type:** Command

Set the plane that vehicle passengers are at, relative to the vehicle's plane.

**Syntax (integer RV):** `CABP`
**Type:** Integer R-Value

Returns the plane that passengers of the vehicle are at.

---

## Passenger Management

### DPAS — Drop All Passengers

**Syntax:** `DPAS family (integer) genus (integer) species (integer)`
**Type:** Command

This drops all passengers (or those matching the classifier) from the target vehicle. Use 0 0 0 for all passengers.

---

### GPAS — Get Passengers

**Syntax:** `GPAS family (integer) genus (integer) species (integer) rect (integer)`
**Type:** Command

Vehicle picks up all agents matching the given classifier within the cabin area. Use 0 0 0 for all. `rect` 0 considers the whole cabin, 1 for a smaller area.

---

### SPAS — Specific Pick Up

**Syntax:** `SPAS vehicle (agent) passenger (agent)`
**Type:** Command

Makes a vehicle pick up a specific passenger.

---

### RPAS — Remove Specific Passenger

**Syntax:** `RPAS vehicle (agent) passenger (agent)`
**Type:** Command

Drops a specific passenger from a vehicle.

---

### EPAS — Enumerate Passengers

**Syntax:** `EPAS family (integer) genus (integer) species (integer)`
**Type:** Command

Iterates through the target vehicle's passengers matching the given classifier. Use like `ENUM`.

```
epas 0 0 0
    outv unid
    outs " "
next
```

---

### XVEC / YVEC — Cabin Velocity

**Syntax (command):** `XVEC x_velocity (integer)` / `YVEC y_velocity (integer)`
**Type:** Command

Sets the cabin's velocity differential (bumps passengers inside).

**Syntax (integer RV):** `XVEC` / `YVEC`
**Type:** Integer R-Value

Returns the cabin's velocity differential.

---

### BUMP — Vehicle Bumped

**Syntax:** `BUMP`
**Type:** Integer R-Value

Returns 1 if the vehicle bumped into a wall on the last tick, 0 if not.

---

[← Back to CAOS Overview](caos_overview.md)
