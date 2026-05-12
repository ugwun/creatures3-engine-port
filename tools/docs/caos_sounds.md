# CAOS Reference: Sounds & Music

Commands for playing sound effects and music.

---

## Sound Effects

### SNDE — Play Sound Effect

**Syntax:** `SNDE sound_file (string)`
**Type:** Command

Plays a sound effect audible to the target agent. If no `TARG`, plays at centre of camera. Uncontrolled — just fire and forget.

```
snde "beep"
```

---

### SNDC — Play Controlled Sound

**Syntax:** `SNDC sound_file (string)`
**Type:** Command

Plays a sound effect associated with the target agent. Use `STPC` to stop it later. You can only have one controlled sound per agent.

---

### SNDL — Play Looping Sound

**Syntax:** `SNDL sound_file (string)`
**Type:** Command

Plays a looping controlled sound effect. Use `STPC` to stop.

---

### STPC — Stop Controlled Sound

**Syntax:** `STPC`
**Type:** Command

Stops the controlled sound currently playing for the target agent.

---

### SNDQ — Queue Sound

**Syntax:** `SNDQ sound_file (string) delay (integer)`
**Type:** Command

Queues a sound to play after `delay` milliseconds.

---

### FADE — Fade Sound

**Syntax:** `FADE`
**Type:** Command

Fades the controlled sound on the target agent. Allows for a smooth transition.

---

### MCLR — Clear Music

**Syntax:** `MCLR x (integer) y (integer)`
**Type:** Command

Clears any music or sounds associated with the given coordinates.

---

### MMSC — Play Music

**Syntax:** `MMSC x (integer) y (integer) track_name (string)`
**Type:** Command

Play a music track at the given world coordinates.

---

### RMSC — Read Music Track

**Syntax:** `RMSC x (integer) y (integer)`
**Type:** String R-Value

Returns the name of the music track playing at the given world coordinates.

---

### MIDI — Play MIDI File

**Syntax:** `MIDI midi_file (string)`
**Type:** Command

Plays a MIDI file. Set to an empty string to stop the MIDI player.

---

### STRK — Trigger Music Track

**Syntax:** `STRK latency (integer) track (string)`
**Type:** Command

Triggers the specified music track. The track will play for at least `latency` seconds before being overridden by room or metaroom music.

---

### RCLR — Clear Room Music

**Syntax:** `RCLR x (integer) y (integer)`
**Type:** Command

Clear the music for the room at the given location.

---

### SEZZ — Speak Text

**Syntax:** `SEZZ text (string)`
**Type:** Command

Makes the `TARG` agent speak the specified text using the voice set by `VOIS` or `VOIC`. If `TARG` is a creature, it will be spoken properly with a speech bubble.

---

### VOLM — Set/Get Volume

**Syntax (command):** `VOLM channel (integer) volume (integer)`
**Type:** Command

Set volume for an audio channel. Channel 0 is SFX, channel 2 is music. Volume range is -10000 (silent) to 0 (full).

**Syntax (integer RV):** `VOLM channel (integer)`
**Type:** Integer R-Value

Returns the current volume for the specified audio channel.

---

### MUTE — Mute Control

**Syntax:** `MUTE andMask (integer) eorMask (integer)`
**Type:** Integer R-Value

Returns and potentially sets the mute values for sound managers. Use `andMask=3, eorMask=0` to query without changing. Bit 1 is sound, bit 2 is music.

| andMask | eorMask | Effect |
|---|---|---|
| 0 | 3 | Mutes both sound and music |
| 3 | 0 | Query only (no change) |
| 1 | 2 | Mute music only, leave sound alone |

---

## Voice

### VOIC — Set Creature Voice

**Syntax:** `VOIC genus (integer) gender (integer) age (integer)`
**Type:** Command

Sets the voice for the target creature. Genus, gender, and age are used to find the appropriate voice files.

---

### VOIS — Set Voice by Name

**Syntax (command):** `VOIS voice_name (string)`
**Type:** Command

Sets the target agent's voice to the specified voice name. The voice name must be valid in the catalogue. If it fails, "DefaultVoice" will be reloaded. Use `SEZZ` to actually say something.

**Syntax (string RV):** `VOIS`
**Type:** String R-Value

Returns the voice name for the target agent.

---

[← Back to CAOS Overview](caos_overview.md)
