# CAOS Reference: Messages, Stimuli & Urges

Commands for inter-agent messaging, creature stimuli, urges, and spoken commands.

---

## Messages (MESG)

### MESG WRIT — Send Message

**Syntax:** `MESG WRIT agent (agent) message_id (integer)`
**Type:** Command

Send a message to another agent. The `message_id` is from the Message Numbers table. If used from an install script, `FROM` for the message is `NULL` rather than `OWNR`.

```
mesg writ targ 1
* Send Activate 1 to target
```

---

### MESG WRT+ — Send Message with Parameters

**Syntax:** `MESG WRT+ agent (agent) message_id (integer) param_1 (anything) param_2 (anything) delay (integer)`
**Type:** Command

Send a message with parameters. Waits `delay` ticks before sending. The recipient accesses parameters via `_P1_` and `_P2_`.

```
mesg wrt+ targ 0 42 "hello" 10
* Send message 0 with params 42 and "hello", after 10 tick delay
```

---

## Stimuli (STIM)

Stimuli affect creature neuroscience — they trigger chemical reactions and learning in creatures.

### STIM SHOU — Shout Stimulus

**Syntax:** `STIM SHOU stimulus (integer) strength (float)`
**Type:** Command

Shout a stimulus to all creatures who can **hear** `OWNR`. Strength multiplies the stimulus: 1 is default, 2 is stronger. Strength 0 prevents learning and sends strength-1 chemical change.

---

### STIM SIGN — Visual Stimulus

**Syntax:** `STIM SIGN stimulus (integer) strength (float)`
**Type:** Command

Send a stimulus to all creatures who can **see** `OWNR`.

---

### STIM TACT — Touch Stimulus

**Syntax:** `STIM TACT stimulus (integer) strength (float)`
**Type:** Command

Send a stimulus to all creatures who are **touching** `OWNR`.

---

### STIM WRIT — Direct Stimulus

**Syntax:** `STIM WRIT creature (agent) stimulus (integer) strength (float)`
**Type:** Command

Send a stimulus to a **specific creature**. Can be used from install scripts, but the stimulus will be from `NULL`, so the creature reacts but doesn't learn.

---

## Urges (URGE)

Urges influence creature decision-making — they suggest actions and nouns to the creature.

### URGE SHOU — Shout Urge

**Syntax:** `URGE SHOU noun_stim (float) verb_id (integer) verb_stim (float)`
**Type:** Command

Urge all creatures who can hear `OWNR` to perform `verb_id` action on `OWNR`. Stimuli range from -1 (discourage) to 1 (encourage).

---

### URGE SIGN — Visual Urge

**Syntax:** `URGE SIGN noun_stim (float) verb_id (integer) verb_stim (float)`
**Type:** Command

Urge all creatures who can see `OWNR`.

---

### URGE TACT — Touch Urge

**Syntax:** `URGE TACT noun_stim (float) verb_id (integer) verb_stim (float)`
**Type:** Command

Urge all creatures who are touching `OWNR`.

---

### URGE WRIT — Direct Urge

**Syntax:** `URGE WRIT creature (agent) noun_id (integer) noun_stim (float) verb_id (integer) verb_stim (float)`
**Type:** Command

Urge a specific creature. A stimulus greater than 1 will **force** the creature to perform the action (mind control!). Use id -1 and stim > 1 to unforce.

---

## Sway (SWAY)

Sway commands directly adjust creature drive levels.

### SWAY SHOU — Shout Sway

**Syntax:** `SWAY SHOU drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float)`
**Type:** Command

Stimulate all creatures that can hear `OWNR` to adjust four drives by the given amounts.

---

### SWAY SIGN — Visual Sway

**Syntax:** `SWAY SIGN drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float)`
**Type:** Command

Stimulate all creatures that can see `OWNR`.

---

### SWAY TACT — Touch Sway

**Syntax:** `SWAY TACT drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float)`
**Type:** Command

Stimulate all creatures that are touching `OWNR`.

---

### SWAY WRIT — Direct Sway

**Syntax:** `SWAY WRIT creature (agent) drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float) drive (integer) adjust (float)`
**Type:** Command

Stimulate a specific creature to adjust four drives.

---

## Spoken Commands (ORDR)

### ORDR SHOU — Shout Command

**Syntax:** `ORDR SHOU speech (string)`
**Type:** Command

Sends a spoken command from target to all creatures that can **hear** it.

---

### ORDR SIGN — Visual Command

**Syntax:** `ORDR SIGN speech (string)`
**Type:** Command

Sends a spoken command from target to all creatures that can **see** it.

---

### ORDR TACT — Touch Command

**Syntax:** `ORDR TACT speech (string)`
**Type:** Command

Sends a spoken command from target to all creatures that are **touching** it.

---

### ORDR WRIT — Direct Command

**Syntax:** `ORDR WRIT creature (agent) speech (string)`
**Type:** Command

Sends a spoken command from target to the specified creature.

---

[← Back to CAOS Overview](caos_overview.md)
