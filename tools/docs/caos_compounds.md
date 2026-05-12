# CAOS Reference: Compounds & Parts

Commands for adding parts to compound agents and managing their behaviour.

---

## Creating Parts (PAT:)

### PAT: DULL — Dull Part (Image)

**Syntax:** `PAT: DULL part_id (integer) sprite_file (string) first_image (integer) rel_x (float) rel_y (float) rel_plane (integer)`
**Type:** Command

Create a dull part for a compound agent. A dull part shows an image from the given sprite file and does nothing else. Number part ids starting at 1 (part 0 is created automatically). Position and plane are relative to part 0.

Use `PART` to select it before changing `POSE` or `ANIM`.

```
new: comp 2 20 1 "panel" 3 0 500
pat: dull 1 "indicator" 0 50 10 1
part 1
pose 0
```

---

### PAT: BUTT — Button Part

**Syntax:** `PAT: BUTT part_id (integer) sprite_file (string) first_image (integer) image_count (integer) rel_x (float) rel_y (float) rel_plane (integer) anim_hover (byte-string) message_id (integer) option (integer)`
**Type:** Command

Create a button on a compound agent. `anim_hover` is an animation to use when the mouse is over the button — when the mouse moves off, it returns to any previous animation. `message_id` is sent when clicked. Option is 0 for bounding box clicks, 1 for pixel-perfect clicking. `_P1_` of the message contains the part number.

---

### PAT: TEXT — Text Entry Part

**Syntax:** `PAT: TEXT part_id (integer) sprite_file (string) first_image (integer) rel_x (float) rel_y (float) rel_plane (integer) message_id (integer) font_sprite (string)`
**Type:** Command

Creates a text entry part. Gains focus when clicked or via `FCUS`. Sends `message_id` when tab or return is pressed. Use `PTXT` to get/set the text.

---

### PAT: FIXD — Fixed Text Part

**Syntax:** `PAT: FIXD part_id (integer) sprite_file (string) first_image (integer) rel_x (float) rel_y (float) rel_plane (integer) font_sprite (string)`
**Type:** Command

Create a fixed text part. The text is wrapped on top of the supplied gallery image. New-line characters may be used. Use `PTXT` to set the text.

---

### PAT: CMRA — Camera Part

**Syntax:** `PAT: CMRA part_id (integer) overlay_sprite (string) baseimage (integer) relx (float) rely (float) relplane (integer) viewWidth (integer) viewHeight (integer) cameraWidth (integer) cameraHeight (integer)`
**Type:** Command

Create a camera part with possible overlay sprite (name may be blank). Use `SCAM` to change the camera's view.

---

### PAT: GRPH — Graph Part

**Syntax:** `PAT: GRPH part_id (integer) overlay_sprite (string) baseimage (integer) relx (float) rely (float) relplane (integer) numValues (integer)`
**Type:** Command

Creates a graph part on a compound agent. Use `GRPL` to add a line to the graph and `GRPV` to add a value to a graph line.

---

### PAT: KILL — Destroy Part

**Syntax:** `PAT: KILL part_id (integer)`
**Type:** Command

Destroys the specified part of a compound agent. You can't destroy part 0.

---

### PAT: MOVE — Move Part

**Syntax:** `PAT: MOVE part_id (integer) rel_x (integer) rel_y (integer)`
**Type:** Command

Move a part of a compound agent to a new relative position within the parent agent.

---

## Part Selection & Text

### PART — Set/Get Current Part

**Syntax (command):** `PART part_id (integer)`
**Type:** Command

Sets the current part for commands like `POSE`, `ANIM`, `BASE`, `GALL`. Set to -1 to select the compound agent as a whole.

**Syntax (integer RV):** `PART part_id (integer)`
**Type:** Integer R-Value

Returns 1 if the specified part exists, 0 if not.

---

### PTXT — Set/Get Part Text

**Syntax (command):** `PTXT text (string)`
**Type:** Command

Sets the text for a text part on a compound agent. Select the part first using `PART`.

**Syntax (string RV):** `PTXT`
**Type:** String R-Value

Returns the text shown by a text part.

---

### FCUS — Set Keyboard Focus

**Syntax:** `FCUS`
**Type:** Command

Sets keyboard focus to the target compound agent's current text part (selected with `PART`).

---

### FRMT — Format Text Part

**Syntax:** `FRMT left_margin (integer) top_margin (integer) right_margin (integer) bottom_margin (integer) line_spacing (integer) character_spacing (integer) justification (integer)`
**Type:** Command

Alter the appearance of the current text part. Line and character spacing are expressed in extra pixels. Justification values: 0 = Left, 1 = Right, 2 = Center, 4 = Bottom, 8 = Middle (values can be combined). Default format is `8 8 8 8 0 0 0`.

---

### PAGE — Set/Get Text Page

**Syntax (command):** `PAGE page (integer)`
**Type:** Command

Sets the current page for the current text part. Page number should be ≥ 0 and < `NPGS`.

**Syntax (integer RV):** `PAGE`
**Type:** Integer R-Value

Returns the current page number.

---

### NPGS — Page Count

**Syntax:** `NPGS`
**Type:** Integer R-Value

Returns the number of available pages for the current text part.

---

## Graphs

### GRPL — Add Graph Line

**Syntax:** `GRPL red (integer) green (integer) blue (integer) min_y (float) max_y (float)`
**Type:** Command

Add a line to the graph, with the given min/max range and colour. Must have previously created a graph part.

---

### GRPV — Add Graph Value

**Syntax:** `GRPV line_index (integer) value (float)`
**Type:** Command

Add a value to the specified graph line.

---

[← Back to CAOS Overview](caos_overview.md)
