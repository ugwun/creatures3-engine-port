# CAOS Reference: Camera & Display

Commands for controlling the camera, rendering, and visual effects.

---

## Camera Movement

### CMRA — Move Camera (Top-Left)

**Syntax:** `CMRA x (integer) y (integer) pan (integer)`
**Type:** Command

Move current camera so top left corner of view is at world coordinate x, y. Set pan 0 to jump straight to location, pan 1 to smoothly scroll there (unless in a different meta room).

---

### CMRP — Move Camera (Centre)

**Syntax:** `CMRP x (integer) y (integer) pan (integer)`
**Type:** Command

Centre current camera on world coordinate x, y. Pan values:
- 0 — jump straight to location
- 1 — smoothly scroll (unless in different meta room)
- 2 — smoothly scroll only if destination is already visible

```
cmrp 1000 500 1
* Smoothly pan camera to centre on (1000, 500)
```

---

### CMRT — Centre Camera on Target

**Syntax:** `CMRT pan (integer)`
**Type:** Command

Centre current camera on target. Pan values are the same as `CMRP`.

---

### META — Change Meta Room (Camera)

**Syntax (command):** `META metaroom_id (integer) camera_x (integer) camera_y (integer) transition (integer)`
**Type:** Command

Change the current camera (set with `SCAM`) to a new meta room. Moves the top left coordinate of the camera to the given coordinates.

Transition values:
- 0 — no transition effect
- 1 — flip horizontally
- 2 — burst

**Syntax (integer RV):** `META`
**Type:** Integer R-Value

Returns the metaroom id that the current camera is looking at.

---

### BKGD — Change Background

**Syntax (command):** `BKGD metaroom_id (integer) background (string) transition (integer)`
**Type:** Command

Change the current background displayed for the selected camera (with `SCAM`). The background must have been added with `ADDM` or `ADDB` first.

**Syntax (string RV):** `BKGD metaroom_id (integer)`
**Type:** String R-Value

Returns the name of the background file currently shown by the given camera.

---

## Camera Tracking

### TRCK — Track Agent

**Syntax (command):** `TRCK agent (agent) x% (integer) y% (integer) style (integer) transition (integer)`
**Type:** Command

Camera follows the given agent. Set to `NULL` to stop tracking. x% and y% are percentages (0–100) of screen size describing a rectangle centred on the screen which the target stays within.

Tracking styles:
- 0 — **Brittle**: if you move the camera so the target is out of the rectangle, tracking breaks
- 1 — **Flexible**: you can move the camera away; if you move back, tracking resumes
- 2 — **Hard**: you can't move the camera so the target leaves the rectangle

Transition applies if tracking causes a meta room change (same values as `META`).

**Syntax (agent RV):** `TRCK`
**Type:** Agent R-Value

Returns the agent being tracked by the camera, if any.

---

### SCAM — Set Camera

**Syntax:** `SCAM compoundagent (agent) partNumber (integer)`
**Type:** Command

Sets the current camera to be used in subsequent camera commands. Uses the given `TARG` and `PART` number. Set to `NULL` for the main camera (default).

---

### ZOOM — Zoom Camera

**Syntax:** `ZOOM pixels (integer) x (integer) y (integer)`
**Type:** Command

Zoom in on the specified position by a negative amount of pixels, or out by positive. Send -1 as x and y to zoom into the existing viewport centre. Only applies to remote cameras.

---

## Camera Window Queries

### CMRX / CMRY — Camera Centre

**Syntax:** `CMRX` / `CMRY`
**Type:** Integer R-Value

Returns the x/y coordinate of the centre of the current camera.

---

### WNDL / WNDR / WNDT / WNDB — Camera Window Edges

**Type:** Integer R-Value

| Command | Returns |
|---|---|
| `WNDL` | World coordinate of left edge |
| `WNDR` | World coordinate of right edge |
| `WNDT` | World coordinate of top edge |
| `WNDB` | World coordinate of bottom edge |

---

### WNDW / WNDH — Camera Window Size

**Type:** Integer R-Value

| Command | Returns |
|---|---|
| `WNDW` | Width of current camera window |
| `WNDH` | Height of current camera window |

---

### WDOW — Fullscreen Toggle

**Syntax (command):** `WDOW`
**Type:** Command

Toggle full screen mode.

**Syntax (integer RV):** `WDOW`
**Type:** Integer R-Value

Returns 1 if in full screen mode, or 0 if in windowed mode.

---

## Drawing & Visual Effects

### LINE — Draw Line

**Syntax:** `LINE x1 (integer) y1 (integer) x2 (integer) y2 (integer) r (integer) g (integer) b (integer) stipple_on (integer) stipple_off (integer)`
**Type:** Command

Adds a line to target's drawing list. The line goes between start and end points (world coordinates) in the specified colour. Set `stipple_on` and `stipple_off` to 0 for a solid line, or to pixel counts for a stippled line. To clear all lines for an agent, call LINE with start and end points the same.

```
line 100 100 200 200 255 0 0 0 0
* Draw a solid red line from (100,100) to (200,200)
```

---

### TINT — Tint Agent

**Syntax:** `TINT red_tint (integer) green_tint (integer) blue_tint (integer) rotation (integer) swap (integer)`
**Type:** Command

Tints the `TARG` agent with the r,g,b tint and applies colour rotation and swap as per pigment bleed genes. Specify the `PART` first for compound agents. The tinted agent now uses a cloned gallery, which means it takes up more memory and save files are larger.

---

### TNTW — Tint with World Table

**Syntax:** `TNTW index (integer)`
**Type:** Command

Tints the `TARG` agent with the global tint manager at the given index. Specify the `PART` first for compound agents. See `WTNT`.

---

### WTNT — Set World Tint Table

**Syntax:** `WTNT index (integer) red_tint (integer) green_tint (integer) blue_tint (integer) rotation (integer) swap (integer)`
**Type:** Command

Sets up the world (global) tint table. Keep the index small. Rotation and swap work as for pigment bleed genes.

---

### TRAN — Set Transparency Click-Through

**Syntax:** `TRAN transparency (integer) part_no (integer)`
**Type:** Command

Sets pixel transparency awareness. 1 for pixel perfect (transparent parts of the agent can't be clicked). 0 to allow anywhere on the agent rectangle to be clicked.

---

### SNAP — Take Screenshot

**Syntax:** `SNAP filename (string) x_centre (integer) y_centre (integer) width (integer) height (integer) zoom_factor (integer)`
**Type:** Command

Takes a photograph of the world at a particular place. The zoom parameter should be ≤ 100 (100 = original size, 50 = half). Creates a new image file in the world images directory. Call `SNAX` first to check your filename isn't already in use. When finished with the file, call `LOFT`.

---

### SNAX — Check Photo Filename

**Syntax:** `SNAX filename (string)`
**Type:** Integer R-Value

Returns 1 if the specified image file exists, or 0 if it doesn't. Use with `SNAP` to find a unique filename.

---

### LOFT — Release Photo File

**Syntax:** `LOFT filename (string)`
**Type:** Integer R-Value

Declares that you have finished with a photograph image file taken by `SNAP`. Returns 1 if the file is in use in a gallery (failure), 0 if successfully marked for the attic.

---

### FRSH — Refresh Display

**Syntax:** `FRSH`
**Type:** Command

Refreshes the main view port.

---

### DMAP — Debug Map

**Syntax:** `DMAP debug_map (integer)`
**Type:** Command

Set to 1 to turn the debug map image on, 0 to turn it off. Includes vehicle cabin lines.

---

[← Back to CAOS Overview](caos_overview.md)
