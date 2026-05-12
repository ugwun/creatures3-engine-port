# CAOS Reference: Motion & Physics

Commands for moving agents, setting velocity, and controlling physics properties.

---

## Movement Commands

### MVTO — Move To (Absolute)

**Syntax:** `MVTO x (float) y (float)`
**Type:** Command

Move the top left corner of the target agent to the given world coordinates. Use `MVFT` instead to move creatures.

```
mvto 500 200
```

---

### MVBY — Move By (Relative)

**Syntax:** `MVBY delta_x (float) delta_y (float)`
**Type:** Command

Move the target agent by relative distances, which can be negative or positive.

---

### MVSF — Move to Safe Location

**Syntax:** `MVSF x (float) y (float)`
**Type:** Command

Move the target agent into a safe map location somewhere in the vicinity of x, y. Only works on autonomous agents (see `MOVS`). Works like a safe `MVFT` for creatures.

---

### MVFT — Move Foot To (Creatures)

**Syntax:** `MVFT x (float) y (float)`
**Type:** Command | Category: Creatures

Move creature's down foot to position x, y. Use this instead of `MVTO` for creatures.

---

### FLTO — Float To

**Syntax:** `FLTO screen_x (float) screen_y (float)`
**Type:** Command

Move the top left corner of target to either the given screen coordinates, or the given coordinates relative to the agent it is `FREL` to. Useful for floating agents.

---

### FREL — Float Relative To

**Syntax (command):** `FREL relative (agent)`
**Type:** Command

Sets an agent for target to float relative to. To make target actually float, you need to set attribute Floatable as well. Set to `NULL` to float relative to the main camera (default). Use `FLTO` to set the relative position.

---

## Velocity

### VELO — Set Velocity

**Syntax:** `VELO x_velocity (float) y_velocity (float)`
**Type:** Command

Set velocity, measured in pixels per tick.

```
velo 5.0 -3.0
* Move right 5px and up 3px per tick
```

---

### VELX — Horizontal Velocity

**Type:** Variable (read/write, float)

Horizontal velocity in pixels per tick.

---

### VELY — Vertical Velocity

**Type:** Variable (read/write, float)

Vertical velocity in pixels per tick.

---

## Physics Properties

### ACCG — Set/Get Gravity

**Syntax (command):** `ACCG acceleration (float)`
**Type:** Command

Set acceleration due to gravity in pixels per tick squared.

**Syntax (float RV):** `ACCG`
**Type:** Float R-Value

Returns target's acceleration due to gravity.

---

### AERO — Set/Get Aerodynamics

**Syntax (command):** `AERO aerodynamics (integer)`
**Type:** Command

Set aerodynamic factor as a percentage. The velocity is reduced by this factor each tick.

**Syntax (integer RV):** `AERO`
**Type:** Integer R-Value

Returns aerodynamic factor as a percentage.

---

### ELAS — Set/Get Elasticity

**Syntax (command):** `ELAS elasticity (integer)`
**Type:** Command

Set the elasticity percentage. An agent with elasticity 100 will bounce perfectly, one with 0 won't bounce at all.

**Syntax (integer RV):** `ELAS`
**Type:** Integer R-Value

Returns the elasticity percentage.

---

### FRIC — Set/Get Friction

**Syntax (command):** `FRIC friction (integer)`
**Type:** Command

Set physics friction percentage, normally from 0 to 100. Speed is lost by this amount when an agent slides along the floor.

**Syntax (integer RV):** `FRIC`
**Type:** Integer R-Value

Returns physics friction percentage.

---

## Movement Queries

### MOVS — Movement Status

**Syntax:** `MOVS`
**Type:** Integer R-Value

Returns the movement status of the target:

| Value | Status |
|---|---|
| 0 | Autonomous |
| 1 | Mouse driven |
| 2 | Floating |
| 3 | In vehicle |
| 4 | Carried |

---

### FALL — Is Falling?

**Syntax:** `FALL`
**Type:** Integer R-Value

Returns 1 if target is moving under the influence of gravity, or 0 if it is at rest.

---

### WALL — Last Wall Direction

**Syntax:** `WALL`
**Type:** Integer R-Value

Returns the direction of the last wall the agent collided with. Directions are `LEFT`, `RGHT`, `_UP_`, or `DOWN`.

---

## Movement Tests

### TMVT — Test Move To

**Syntax:** `TMVT x (float) y (float)`
**Type:** Integer R-Value

Test if target can move to the given location and still lie validly within the room system. Returns 1 if it can, 0 if it can't.

---

### TMVB — Test Move By

**Syntax:** `TMVB delta_x (float) delta_y (float)`
**Type:** Integer R-Value

Similar to `TMVT`, only tests a `MVBY`.

---

### TMVF — Test Move Foot

**Syntax:** `TMVF x (float) y (float)`
**Type:** Integer R-Value

Test if a creature could move its down foot to position x, y.

---

## Distance & Relative Position

### OBST — Distance to Obstacle

**Syntax:** `OBST direction (integer)`
**Type:** Float R-Value

Returns the distance from the agent to the nearest wall that it might collide with in the given direction. Directions are `LEFT`, `RGHT`, `_UP_`, or `DOWN`. If the distance is greater than `RNGE`, a very large number is returned.

---

### RELX — Relative X Distance

**Syntax:** `RELX first (agent) second (agent)`
**Type:** Float R-Value

Returns the relative X distance of the centre of the second agent from the centre of the first.

---

### RELY — Relative Y Distance

**Syntax:** `RELY first (agent) second (agent)`
**Type:** Float R-Value

Returns the relative Y distance of the centre of the second agent from the centre of the first.

---

[← Back to CAOS Overview](caos_overview.md)
