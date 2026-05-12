# CAOS Reference: Input & Pointer

Commands for handling mouse/keyboard input and the pointer (hand) agent.

---

## Click & Activation

### CLAC — Set Click Message

**Syntax (command):** `CLAC message (integer)`
**Type:** Command

Set the message sent to target when it is clicked on. Default is Activate 1 (event 1). Use -1 to prevent any activation.

**Syntax (integer RV):** `CLAC`
**Type:** Integer R-Value

Returns the current click action.

---

### CLIK — Set Multi-Click Messages

**Syntax (command):** `CLIK event1 (integer) event2 (integer) event3 (integer)`
**Type:** Command

Set three event scripts that cycle round, changing which is fired when the agent is clicked on. Use -1 to indicate a click should not fire any script.

**Syntax (integer RV):** `CLIK`
**Type:** Integer R-Value

Returns the current `CLIK` action.

---

### IMSK — Set Input Mask

**Syntax (command):** `IMSK flags (integer)`
**Type:** Command

Sets the input event mask for the target agent. This tells the engine which mouse events to send as messages. Combine flags:

| Flag | Value | Description |
|---|---|---|
| Mouse Move | 1 | Mouse moved over agent |
| Mouse Down | 2 | Mouse button pressed |
| Mouse Up | 4 | Mouse button released |
| Mouse Wheel | 8 | Mouse wheel scrolled |
| Translate | 16 | Translate mouse events to screen coords |

**Syntax (integer RV):** `IMSK`
**Type:** Integer R-Value

Returns the current input mask.

---

### PURE — Set Pure Click

**Syntax (command):** `PURE clicks_only (integer)`
**Type:** Command

Set the `PURE` click state: 0 means normal (click + drag), 1 means pure click only (clicking doesn't pick up agents).

**Syntax (integer RV):** `PURE`
**Type:** Integer R-Value

Returns the PURE click state.

---

## Mouse Queries

### MOPX / MOPY — Mouse Position (Screen)

**Type:** Integer R-Value

| Command | Returns |
|---|---|
| `MOPX` | X position of mouse in screen coordinates |
| `MOPY` | Y position of mouse in screen coordinates |

---

### MOVX / MOVY — Mouse Velocity

**Type:** Float R-Value

| Command | Returns |
|---|---|
| `MOVX` | Horizontal mouse velocity |
| `MOVY` | Vertical mouse velocity |

---

### MLOC — Mouse Location

**Syntax:** `MLOC`
**Type:** Integer R-Value

Returns the index of the mouse button last depressed.

---

### MOUS — Mouse Buttons

**Syntax:** `MOUS x_or_y (integer)`
**Type:** Integer R-Value

Returns the mouse position. Pass 1 for X, 2 for Y. Returns screen coordinates.

---

### HOTS — Hot Spot Agent

**Syntax:** `HOTS`
**Type:** Agent R-Value

Returns the agent nearest the screen under the hotspot of the pointer. For each agent, `TRAN` decides whether this allows for transparent pixels.

---

### HOTP — Hotspot Agent ID (DS)

**Syntax:** `HOTP`
**Type:** Integer R-Value

Returns the unique ID of the agent under the pointer hotspot. Offline stub returns 0.

---

## Keyboard Input

### KEYD — Is Key Down?

**Syntax:** `KEYD keycode (integer)`
**Type:** Integer R-Value

Returns 1 if the specified key is currently pressed, 0 if not.

---

### IKEY — Last Input Key (DS)

**Syntax:** `IKEY`
**Type:** Integer R-Value

Returns the last key event code. Used by DS script event handlers.

---

[← Back to CAOS Overview](caos_overview.md)
