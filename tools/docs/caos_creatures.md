# CAOS Reference: Creatures

Commands for creating, controlling, and querying biological creatures (Norns, Grendels, Ettins).

---

## Life Cycle

### BORN — Signal Birth

**Syntax:** `BORN`
**Type:** Command

Signals the target creature as having been born. This sends a birth event and starts the `TAGE` ticking.

---

### DEAD — Kill Creature

**Syntax (command):** `DEAD`
**Type:** Command

Makes the target creature die, triggering the Die script and history events, closing its eyes, and stopping brain and biochemistry updates. Not to be confused with `KILL`, which you'll need to use later to remove the actual body.

**Syntax (integer RV):** `DEAD`
**Type:** Integer R-Value

Returns 1 if target creature is dead, or 0 if alive.

---

### AGES — Age Creature

**Syntax:** `AGES times (integer)`
**Type:** Command

Forces a creature to age the given number of times. See also `CAGE`.

---

### CAGE — Life Stage

**Syntax:** `CAGE`
**Type:** Integer R-Value

Returns life stage of target creature.

---

### TAGE — Age in Ticks

**Syntax:** `TAGE`
**Type:** Integer R-Value

Returns the age in ticks since the target creature was `BORN`. Ticking stops when the creature dies.

---

### CREA — Is Creature?

**Syntax:** `CREA agent (agent)`
**Type:** Integer R-Value

Returns 1 if the agent is a creature, 0 if not.

---

### BVAR — Variant Number

**Syntax:** `BVAR`
**Type:** Integer R-Value

Returns the variant number for target creature.

---

## Biochemistry

### CHEM — Adjust/Read Chemical

**Syntax (command):** `CHEM chemical (integer) adjustment (float)`
**Type:** Command

Adjusts chemical (0 to 255) by concentration -1.0 to +1.0 in the target creature's bloodstream.

```
chem 35 0.5
* Add 0.5 concentration of chemical 35
```

**Syntax (float RV):** `CHEM chemical (integer)`
**Type:** Float R-Value

Returns concentration (0.0 to 1.0) of chemical (1 to 255) in the target creature's bloodstream.

---

### DRIV — Adjust/Read Drive

**Syntax (command):** `DRIV drive (integer) adjustment (float)`
**Type:** Command

Adjusts the level of the given drive by the specified amount (can be positive or negative).

**Syntax (float RV):** `DRIV drive (integer)`
**Type:** Float R-Value

Returns the value (0.0 to 1.0) of the specified drive.

---

### DRV! — Highest Drive

**Syntax:** `DRV!`
**Type:** Integer R-Value

Returns the id of the highest drive for the target creature.

---

### LOCI — Set/Read Locus

**Syntax (command):** `LOCI type (integer) organ (integer) tissue (integer) id (integer) new_value (float)`
**Type:** Command

Sets a biochemical locus value.

**Syntax (float RV):** `LOCI type (integer) organ (integer) tissue (integer) id (integer)`
**Type:** Float R-Value

Reads a biochemical locus value.

---

### INJR — Injure Organ

**Syntax:** `INJR organ (integer) amount (integer)`
**Type:** Command

Injures an organ. -1 to randomly choose the organ, 0 for the body organ.

---

### ORGN — Organ Count

**Syntax:** `ORGN`
**Type:** Integer R-Value

Returns the number of organs in target creature.

---

### ORGI — Organ Integer Info

**Syntax:** `ORGI organ_number (integer) data (integer)`
**Type:** Integer R-Value

Returns integer data about the specified organ:
- 0 — receptor count
- 1 — emitter count
- 2 — reaction count

---

### ORGF — Organ Float Info

**Syntax:** `ORGF organ_number (integer) data (integer)`
**Type:** Float R-Value

Returns float data about the specified organ:
- 0 — Clock rate (locus)
- 1 — Short term life force proportion (locus)
- 2 — Repair rate factor (locus)
- 3 — Injury to apply (locus)
- 4 — Initial life force
- 5 — Short term life force (temporary damage)
- 6 — Long term life force (permanent damage)
- 7 — Long term rate damage during repair
- 8 — Energy cost to run
- 9 — Damage if no energy available

---

## Movement & Behaviour

### WALK — Walk Indefinitely

**Syntax:** `WALK`
**Type:** Command

Sets creature walking indefinitely. Chooses a walking gait according to chemo-receptors. Always means ignore IT and walk in the current direction set by `DIRN`.

---

### APPR — Approach IT

**Syntax:** `APPR`
**Type:** Command

Creature approaches the IT agent. If there is no IT agent, the creature follows the CA smell. The script resumes when it gets there, or if it can't get any further.

---

### TOUC — Touch IT

**Syntax (command):** `TOUC`
**Type:** Command

Make creature reach out to touch the IT agent. Blocks until the creature either reaches the agent, or it's fully stretched and still can't.

---

### DIRN — Set/Get Direction

**Syntax (command):** `DIRN direction (integer)`
**Type:** Command

Change creature to face a different direction: North 0, South 1, East 2, West 3.

**Syntax (integer RV):** `DIRN`
**Type:** Integer R-Value

Returns the direction that target creature is facing.

---

### GAIT — Set Gait

**Syntax:** `GAIT gait_number (integer)`
**Type:** Command

Specifies the current gait for a creature. The gaits are genetically defined.

---

### DONE — Stop Involuntary Actions

**Syntax:** `DONE`
**Type:** Command

Stops the targeted creature doing any involuntary actions.

---

### BYIT — Is Within Reach of IT?

**Syntax:** `BYIT`
**Type:** Integer R-Value

Returns 1 if the creature is within reach of the IT agent, 0 if not.

---

## Creature Position Queries

### DFTX / DFTY — Down Foot Position

**Syntax:** `DFTX` / `DFTY`
**Type:** Float R-Value

Returns X/Y coordinate of creature's down foot.

---

### UFTX / UFTY — Up Foot Position

**Syntax:** `UFTX` / `UFTY`
**Type:** Float R-Value

Returns X/Y coordinate of creature's up foot.

---

### MTHX / MTHY — Mouth Position

**Syntax:** `MTHX` / `MTHY`
**Type:** Float R-Value

Returns X/Y position of the creature's mouth attachment point in absolute (map) coordinates.

---

## Sleep & Consciousness

### ASLP — Set/Check Sleep

**Syntax (command):** `ASLP asleep (integer)`
**Type:** Command

Make the creature asleep (1) or awake (0).

**Syntax (integer RV):** `ASLP`
**Type:** Integer R-Value

Returns 1 if creature is asleep, 0 otherwise.

---

### DREA — Set/Check Dreaming

**Syntax (command):** `DREA dream (integer)`
**Type:** Command

Set to 1 to make the creature fall asleep and dream, 0 to stop dreaming. When dreaming, instincts are processed.

**Syntax (integer RV):** `DREA`
**Type:** Integer R-Value

Returns 1 if creature is asleep and dreaming, 0 otherwise.

---

### UNCS — Set/Check Consciousness

**Syntax (command):** `UNCS unconscious (integer)`
**Type:** Command

Make the creature conscious (0) or unconscious (1).

**Syntax (integer RV):** `UNCS`
**Type:** Integer R-Value

Returns 1 if unconscious, 0 otherwise.

---

### ZOMB — Zombify

**Syntax (command):** `ZOMB zombie (integer)`
**Type:** Command

1 makes creatures zombies: in a zombie state creatures won't process any decision scripts but will respond to `ANIM`s and `POSE`s. 0 un-zombifies.

**Syntax (integer RV):** `ZOMB`
**Type:** Integer R-Value

Returns 1 if zombified, 0 otherwise.

---

## Appearance

### WEAR — Set Clothing

**Syntax:** `WEAR body_id (integer) set_number (integer) layer (integer)`
**Type:** Command

Sets a layer of clothing on part of the creature. Layer 0 is the actual body, use higher layers for clothing.

---

### BODY — Set Full Outfit

**Syntax (command):** `BODY set_number (integer) layer (integer)`
**Type:** Command

Similar to `WEAR`, but puts the given set of clothes on every body part.

**Syntax (integer RV):** `BODY bodyPart (integer)`
**Type:** Integer R-Value

Returns the set number of the outfit worn on the outermost layer, or -1 if none.

---

### NUDE — Remove All Clothing

**Syntax:** `NUDE`
**Type:** Command

Removes all clothes from a creature. Any changed layer 0 will revert to drawing the body part.

---

### FACE — Set/Get Expression

**Syntax (command):** `FACE set_number (integer)`
**Type:** Command

Sets a facial expression on target creature.

**Syntax (integer RV):** `FACE`
**Type:** Integer R-Value

Returns the front-facing pose for the current facial expression.

**Syntax (string RV):** `FACE`
**Type:** String R-Value

Returns the name of the sprite file for the target creature's face.

---

### HAIR — Set Hair State

**Syntax:** `HAIR stage (integer)`
**Type:** Command

Tidies or ruffles hair. Positive means tidy, negative means untidy. Multiple stages exist.

---

### EXPR — Get Facial Expression

**Syntax:** `EXPR`
**Type:** Integer R-Value

Returns the current facial expression index: NORMAL=0, HAPPY=1, SAD=2, ANGRY=3, SURPRISE=4, SLEEPY=5, VERY_SLEEPY=6, VERY_HAPPY=7, MISCHIEVOUS=8, SCARED=9, ILL=10, HUNGRY=11.

---

## Communication & Learning

### SAYN — Speak Need

**Syntax:** `SAYN`
**Type:** Command

Creature expresses its highest need by speaking.

---

### VOCB — Learn Vocabulary

**Syntax:** `VOCB`
**Type:** Command

Learn all vocabulary instantly.

---

### SPNL — Set Neuron Input

**Syntax:** `SPNL lobe_moniker (string) neuron_id (integer) value (float)`
**Type:** Command

Sets the input of the specified neuron in the specified lobe.

---

### FORF — Friend or Foe

**Syntax:** `FORF creature_to_learn_about (agent)`
**Type:** Command

Set the friends or foe lobe to learn from the creature.

---

### LIKE — State Opinion

**Syntax:** `LIKE creature_state_opinion_about (agent)`
**Type:** Command

State a personal opinion about a creature.

---

## Breeding

### MATE — Mate

**Syntax:** `MATE`
**Type:** Command

Male creature mates with the IT agent (if female of same genus). If successful, sperm is transmitted and conception may occur. Gene slot 1 of the mother contains the child genome if pregnancy occurs.

---

## Attention & Decision

### ATTN — Attention Focus

**Syntax:** `ATTN`
**Type:** Integer R-Value

Returns the current focus of attention id.

---

### DECN — Decision Focus

**Syntax:** `DECN`
**Type:** Integer R-Value

Returns the current focus of decision id.

---

### INS# — Instincts Queued

**Syntax:** `INS#`
**Type:** Integer R-Value

Number of instincts still queued to be processed.

---

### IITT — Current Attention Agent

**Syntax:** `IITT`
**Type:** Agent R-Value

Returns the target creature's current agent of attention. Compare `_IT_`.

---

### HHLD — Hand-Holder

**Syntax:** `HHLD`
**Type:** Agent R-Value

Returns the creature currently holding hands with the pointer. NULL if none.

---

## Creature Selection

### NORN — Set/Get Selected Creature

**Syntax (command):** `NORN creature (agent)`
**Type:** Command

Chooses the active creature. Script 120 is executed on that creature to inform them they've been selected.

**Syntax (agent RV):** `NORN`
**Type:** Agent R-Value

Returns the creature currently selected by the user.

---

## Miscellaneous

### LTCY — Set Latency

**Syntax:** `LTCY action (integer) min (integer) max (integer)`
**Type:** Command

Sets latency time on involuntary actions to a random value between min and max (0–255). After an involuntary action occurs, the same action won't kick in again until after that many ticks.

---

### TINT — Get Tint Channel (DS)

**Syntax:** `TINT channel (integer)`
**Type:** Integer R-Value

Returns the tint value (0–255) for a creature body colour channel (1–5). Offline stub returns 128.

---

### ABBA — Facial Expression Set (DS)

**Syntax:** `ABBA`
**Type:** Integer R-Value

Returns the facial expression set index for the target creature. Offline stub returns 0.

---

### LIMB — Body Part Gallery (DS)

**Syntax:** `LIMB body_part (integer) genus (integer) gender (integer) age (integer) variant (integer)`
**Type:** String R-Value

Returns the gallery filename for a creature body part. Offline stub returns "".

---

[← Back to CAOS Overview](caos_overview.md)
