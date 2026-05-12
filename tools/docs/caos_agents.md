# CAOS Reference: Agents

Agents are the fundamental interactive objects in the Creatures engine. Every object — from food items and toys to lifts and teleporters — is an agent.

---

## Creating Agents

### NEW: SIMP — Create Simple Agent

**Syntax:** `NEW: SIMP family (integer) genus (integer) species (integer) sprite_file (string) image_count (integer) first_image (integer) plane (integer)`
**Type:** Command

Create a new simple agent using the specified sprite file. The agent will have `image_count` sprites available, starting at `first_image` in the file. The plane is the screen depth — the higher the number, the nearer the camera. The new agent becomes `TARG`.

```
new: simp 2 16 1 "mysprite" 5 0 500
attr 195
tick 100
```

---

### NEW: COMP — Create Compound Agent

**Syntax:** `NEW: COMP family (integer) genus (integer) species (integer) sprite_file (string) image_count (integer) first_image (integer) plane (integer)`
**Type:** Command

Create a new compound agent. The sprite file, image_count, and first_image are for the first part (part 0), which is made automatically. The plane is the absolute plane of part 0 — planes of other parts are relative to this one. See [Compounds & Parts](caos_compounds.md).

---

### NEW: VHCL — Create Vehicle

**Syntax:** `NEW: VHCL family (integer) genus (integer) species (integer) sprite_file (string) image_count (integer) first_image (integer) plane (integer)`
**Type:** Command

Create a new vehicle. Parameters are the same as `NEW: COMP`. See [Vehicles](caos_vehicles.md).

---

### NEW: CREA — Create Creature

**Syntax:** `NEW: CREA family (integer) gene_agent (agent) gene_slot (integer) sex (integer) variant (integer)`
**Type:** Command

Makes a creature using the genome from the given gene slot in another agent. Use `GENE CROS` or `GENE LOAD` to fill that slot first. The gene slot is cleared as control of that genome moves to special slot 0 of the new creature, where it is expressed. Sex is 1 for male, 2 for female, or 0 for random. Variant can also be 0 for a random value between 1 and 8. See also `NEWC`.

---

### NEWC — Create Creature (Async)

**Syntax:** `NEWC family (integer) gene_agent (agent) gene_slot (integer) sex (integer) variant (integer)`
**Type:** Command

This version of `NEW: CREA` executes over a series of ticks, helping prevent the pause caused by creature creation. However, it cannot be used in install scripts (e.g. the bootstrap) — use `NEW: CREA` for that.

---

## Destroying Agents

### KILL — Destroy Agent

**Syntax:** `KILL agent (agent)`
**Type:** Command

Destroys an agent. The pointer won't be destroyed. For creatures, you probably want to use `DEAD` first.

```
kill targ
```

---

## Agent Properties

### ATTR — Set/Get Attributes

**Syntax (command):** `ATTR attributes (integer)`
**Type:** Command

Set attributes of target. Sum the values from the Attribute Flags table.

**Syntax (integer RV):** `ATTR`
**Type:** Integer R-Value

Returns attributes of target.

**Attribute Flags:**

| Bit | Value | Name | Description |
|---|---|---|---|
| 0 | 1 | Carryable | Can be picked up |
| 1 | 2 | Mouseable | Can be clicked on |
| 2 | 4 | Activateable | Responds to activate messages |
| 3 | 8 | Greedy Cabin | Vehicle auto-picks up items in cabin |
| 4 | 16 | Invisible | Not visible to creatures |
| 5 | 32 | Floatable | Can float relative to another agent or camera |
| 6 | 64 | Wallbound | Suffers collisions with room boundaries |
| 7 | 128 | Physics | Has gravity, friction, aerodynamics applied |
| 8 | 256 | Camera Shy | Not drawn on remote cameras |
| 9 | 512 | Rotatable | Can be rotated |

```
attr 199
* = 128+64+4+2+1 = Physics + Wallbound + Activateable + Mouseable + Carryable
```

---

### BHVR — Set/Get Creature Permissions

**Syntax (command):** `BHVR permissions (integer)`
**Type:** Command

Sets the creature permissions for target. Sum the entries in the Creature Permissions table.

**Syntax (integer RV):** `BHVR`
**Type:** Integer R-Value

Returns the creature permissions for the target agent.

---

### TICK — Set/Get Timer Rate

**Syntax (command):** `TICK tick_rate (integer)`
**Type:** Command

Start agent timer, calling the Timer script every `tick_rate` ticks. Set to 0 to turn off the timer.

**Syntax (integer RV):** `TICK`
**Type:** Integer R-Value

Returns the current timer rate set by the TICK command.

---

### PLNE — Set/Get Drawing Plane

**Syntax (command):** `PLNE plane (integer)`
**Type:** Command

Sets the target agent's principal drawing plane. The higher the value, the nearer the camera.

**Syntax (integer RV):** `PLNE`
**Type:** Integer R-Value

Returns the screen depth plane of the principal part.

---

### PAUS — Pause/Check Agent

**Syntax (command):** `PAUS paused (integer)`
**Type:** Command

Stops the target agent from running — it'll freeze completely (scripts and physics). Set to 1 to pause, 0 to run. You might want to use `WPAU` with this to implement a pause game option.

**Syntax (integer RV):** `PAUS`
**Type:** Integer R-Value

Returns 1 if the target agent is paused, or 0 otherwise.

---

### ALPH — Set Alpha Transparency (DS)

**Syntax:** `ALPH alpha (integer) enable (integer)`
**Type:** Command

Sets the translucency of the target agent. Alpha ranges from 0 (fully transparent) to 256 (fully opaque). Enable is 0 or 1. (Stub: alpha blending not fully supported on this platform.)

---

### SHOW — Show/Hide Agent

**Syntax:** `SHOW visibility (integer)`
**Type:** Command

Set to 0 to hide the agent and to 1 to show the agent on camera. A non-shown agent can still be visible to creatures, and can still be clicked on or picked up. It just doesn't appear on cameras.

---

### MIRA — Mirror Sprite

**Syntax (command):** `MIRA on_off (integer)`
**Type:** Command

Tell the agent to draw the current sprite mirrored (1) or normally (0).

**Syntax (integer RV):** `MIRA`
**Type:** Integer R-Value

Returns 1 if the current sprite is mirrored, 0 if not.

---

## Sprite & Animation

### POSE — Set/Get Pose

**Syntax (command):** `POSE pose (integer)`
**Type:** Command

Specify a frame in the sprite file for the target agent/part. Relative to any index specified by `BASE`.

**Syntax (integer RV):** `POSE`
**Type:** Integer R-Value

Returns the current pose, or -1 if invalid part.

---

### ANIM — Animate

**Syntax:** `ANIM pose_list (byte-string)`
**Type:** Command

Specify a list of poses to animate the current agent/part. Put 255 at the end to continually loop. The first number after 255 is an index into the animation string where looping restarts from (defaults to 0).

```
anim [0 1 2 3 255]
* loops: 0 1 2 3 0 1 2 3 ...

anim [0 1 2 10 11 12 255 3]
* plays 0 1 2 then loops: 10 11 12 10 11 12 ...
```

---

### ANMS — Animate from String

**Syntax:** `ANMS anim_string (string)`
**Type:** Command

Like `ANIM`, but reads the poses from a string such as `"3 4 5 255"`. Use this when you need to dynamically construct animations. `ANIM` is quicker to execute initially, but they are the same speed once the animation is underway.

---

### OVER — Wait for Animation

**Syntax:** `OVER`
**Type:** Command

Wait until the current agent/part's animation is over before continuing. Looping anims stop this command terminating until the animation is changed to a non-looping one.

---

### BASE — Set/Get Base Image

**Syntax (command):** `BASE index (integer)`
**Type:** Command

Set the base image for this agent or part. The index is relative to the `first_image` specified in the `NEW:` command. Future `POSE`/`ANIM` commands are relative to this new base.

**Syntax (integer RV):** `BASE`
**Type:** Integer R-Value

Returns the base image for the current agent/part, or -1 if invalid part.

---

### GALL — Set/Get Gallery

**Syntax (command):** `GALL sprite_file (string) first_image (integer)`
**Type:** Command

Changes the gallery (sprite file) used by an agent. Works for simple and compound agents (using the current `PART`). The current `POSE` is kept the same.

**Syntax (string RV):** `GALL`
**Type:** String R-Value

Returns the name of the gallery (sprite file) currently used by the target agent/part.

---

### FRAT — Frame Rate

**Syntax:** `FRAT FrameRate (integer)`
**Type:** Command

Sets the frame rate on the `TARG` agent. For compound agents, the part affected can be set with `PART`. Valid rates are from 1 to 255. 1 is normal rate, 2 is half speed, etc.

---

## Enumeration

### ENUM / NEXT — Enumerate Agents

**Syntax:** `ENUM family (integer) genus (integer) species (integer)`
**Type:** Command

Iterate through each agent which conforms to the given classification, setting `TARG` to each valid agent in turn. Family, genus, and/or species can be zero to act as wildcards. `NEXT` terminates the block. After an `ENUM`, `TARG` is restored to `OWNR`.

```
enum 2 0 0
    outv unid
    outs " "
next
```

---

### ESEE — Enumerate Visible Agents

**Syntax:** `ESEE family (integer) genus (integer) species (integer)`
**Type:** Command

Like `ENUM`, except only enumerates through agents which `OWNR` can see. An agent can see another if it is within `RNGE`, its `PERM` allows it to see through all intervening walls, and for creatures, `ATTR` Invisible isn't set. In install scripts (when there is no `OWNR`), `TARG` is used instead.

---

### ETCH — Enumerate Touching Agents

**Syntax:** `ETCH family (integer) genus (integer) species (integer)`
**Type:** Command

Like `ENUM`, except only enumerates through agents which `OWNR` is touching. Agents are touching if their bounding rectangles overlap. In install scripts, `TARG` is used instead of `OWNR`.

---

### NEXT — End Enumeration

**Syntax:** `NEXT`
**Type:** Command

Closes an enumeration loop (`ENUM`, `ESEE`, `ETCH`, or `EPAS`).

---

## Targeting

### STAR — Set Target to Random Visible

**Syntax:** `STAR family (integer) genus (integer) species (integer)`
**Type:** Command

Randomly chooses an agent which matches the classifier and can be seen by `OWNR`, then sets `TARG` to that agent.

---

### RTAR — Set Target to Random

**Syntax:** `RTAR family (integer) genus (integer) species (integer)`
**Type:** Command

Randomly chooses an agent which matches the classifier and targets it.

---

### TTAR — Set Target to Random Touching

**Syntax:** `TTAR family (integer) genus (integer) species (integer)`
**Type:** Command

Randomly chooses an agent which matches the classifier and is touching `OWNR`, then sets `TARG` to that agent.

---

## Agent Queries

### FMLY — Get Family

**Syntax:** `FMLY`
**Type:** Integer R-Value

Returns the family of target.

---

### GNUS — Get Genus

**Syntax:** `GNUS`
**Type:** Integer R-Value

Returns the genus of target.

---

### SPCS — Get Species

**Syntax:** `SPCS`
**Type:** Integer R-Value

Returns the species of target.

---

### TOTL — Count Agents

**Syntax:** `TOTL family (integer) genus (integer) species (integer)`
**Type:** Integer R-Value

Counts the number of agents in the world matching the classifier.

```
outv totl 4 0 0
* How many creatures are there?
```

---

### TOUC — Are Agents Touching?

**Syntax (integer RV):** `TOUC first (agent) second (agent)`
**Type:** Integer R-Value

Returns 1 if the two specified agents are touching, or 0 if they are not. Agents are touching if their bounding rectangles overlap.

---

### SEEE — Can Agent See?

**Syntax:** `SEEE first (agent) second (agent)`
**Type:** Integer R-Value

Returns 1 if the first agent can see the second, or 0 if it can't.

---

### WDTH — Width

**Syntax:** `WDTH`
**Type:** Integer R-Value

Returns the width of target.

---

### HGHT — Height

**Syntax:** `HGHT`
**Type:** Integer R-Value

Returns the height of target.

---

### VISI — Is Visible on Camera?

**Syntax:** `VISI checkAllCameras (integer)`
**Type:** Integer R-Value

Checks if the agent (or any of its parts) is on screen. Returns 1 if visible, 0 if not. Set to 0 to check main camera only, 1 to check all cameras.

---

### DISQ — Distance Squared

**Syntax:** `DISQ other (agent)`
**Type:** Float R-Value

Returns the square of the distance between the centre points of `TARG` and the other agent. Compare against a squared constant directly, or use `SQRT` if you need the actual distance.

---

## Position Queries

### POSX — Centre X

**Syntax:** `POSX`
**Type:** Float R-Value

Returns X position of centre of target.

---

### POSY — Centre Y

**Syntax:** `POSY`
**Type:** Float R-Value

Returns Y position of centre of target.

---

### POSL — Left Edge

**Syntax:** `POSL`
**Type:** Float R-Value

Returns left position of target's bounding box.

---

### POSR — Right Edge

**Syntax:** `POSR`
**Type:** Float R-Value

Returns right position of target's bounding box.

---

### POST — Top Edge

**Syntax:** `POST`
**Type:** Float R-Value

Returns top position of target's bounding box.

---

### POSB — Bottom Edge

**Syntax:** `POSB`
**Type:** Float R-Value

Returns bottom position of target's bounding box.

---

### FLTX — Floating X

**Syntax:** `FLTX`
**Type:** Float R-Value

Returns the X position of the target's floating vector.

---

### FLTY — Floating Y

**Syntax:** `FLTY`
**Type:** Float R-Value

Returns the Y position of the target's floating vector.

---

## Agent R-Values

### OWNR — Script Owner

**Syntax:** `OWNR`
**Type:** Agent R-Value

Returns the agent whose virtual machine the script is running on. Returns `NULL` for injected or install scripts.

---

### FROM — Message Sender

**Syntax:** `FROM`
**Type:** Agent R-Value

If processing a message, this is the `OWNR` who sent the message. `NULL` if from an injected or install script.

---

### _IT_ — Creature's Attention

**Syntax:** `_IT_`
**Type:** Agent R-Value

Returns the agent `OWNR`'s attention was on *when the current script was entered*. Only valid if OWNR is a creature. Compare `IITT`.

---

### PNTR — Pointer Agent

**Syntax:** `PNTR`
**Type:** Agent R-Value

Returns the mouse pointer (also known as the hand).

---

### NULL — Null Agent

**Syntax:** `NULL`
**Type:** Agent R-Value

Returns a null agent pointer.

---

### HELD — Held Agent

**Syntax:** `HELD`
**Type:** Agent R-Value

Returns the item currently held by the target. For vehicles, returns a random carried agent. Consider using `EPAS` instead.

---

### CARR — Carrying Agent

**Syntax:** `CARR`
**Type:** Agent R-Value

Returns the agent currently holding the target, or `NULL` if none.

---

### NCLS — Next Agent in List

**Syntax:** `NCLS previous (agent) family (integer) genus (integer) species (integer)`
**Type:** Agent R-Value

Finds the next agent in the agent list which also matches the given classifier. If `previous` doesn't exist or doesn't match, the first matching agent is returned. If none match, `NULL` is returned.

---

### PCLS — Previous Agent in List

**Syntax:** `PCLS next (agent) family (integer) genus (integer) species (integer)`
**Type:** Agent R-Value

Same as `NCLS`, only cycles the other way.

---

### TWIN — Clone Agent

**Syntax:** `TWIN original (agent) agent_null (integer)`
**Type:** Agent R-Value

Clones an agent and returns the replica. If `agent_null` is 1, agent references in OVxx/VAxx are set to NULL in the clone. If 0, the clone points to the same agents as the original.

---

### UNID — Unique ID

**Syntax:** `UNID`
**Type:** Integer R-Value

Returns unique identifier for target agent. `AGNT` goes the opposite way. NOTE: Only use for external programs to persistently refer to an agent. For internal use, use `SETA` to store agent r-values directly.

---

### AGNT — Agent from ID

**Syntax:** `AGNT unique_id (integer)`
**Type:** Agent R-Value

Given a unique identifier, returns the corresponding agent. Returns `NULL` if the agent no longer exists.

---

## Pick-Up / Handle Points

### PUPT — Pick-Up Point

**Syntax (command):** `PUPT pose (integer) x (integer) y (integer)`
**Type:** Command

Set the relative x and y coordinate of the place where target picks agents up, for the given pose. Pose -1 sets the same point for all poses.

**Syntax (integer RV):** `PUPT pose (integer) x_or_y (integer)`
**Type:** Integer R-Value

Returns the x (1) or y (2) coordinate of the pick-up point for the given pose.

---

### PUHL — Pick-Up Handle

**Syntax (command):** `PUHL pose (integer) x (integer) y (integer)`
**Type:** Command

Set the relative x and y coordinate of the handle that target is picked up by, for the given pose. Pose -1 sets for all poses.

**Syntax (integer RV):** `PUHL pose (integer) x_or_y (integer)`
**Type:** Integer R-Value

Returns the x (1) or y (2) coordinate of the pick-up handle for the given pose.

---

## Miscellaneous

### RNGE — Set/Get Range

**Syntax (command):** `RNGE distance (float)`
**Type:** Command

Sets the distance that the target can see and hear, and the distance used to test for potential collisions.

**Syntax (float RV):** `RNGE`
**Type:** Float R-Value

Returns the target's range.

---

### PERM — Set/Get Permeability

**Syntax (command):** `PERM permeability (integer)`
**Type:** Command

Value from 1 to 100. Sets which room boundaries the agent can pass through. The smaller the value, the more it can go through. `DOOR` sets the corresponding room boundary permeability. Also used for `ESEE`.

**Syntax (integer RV):** `PERM`
**Type:** Integer R-Value

Returns the target's map permeability.

---

### HAND — Set/Get Hand Name

**Syntax (command):** `HAND name_for_the_hand (string)`
**Type:** Command

Sets the name of the hand. By default this is "hand".

**Syntax (string RV):** `HAND`
**Type:** String R-Value

Returns the name of the hand.

---

### CALL — Call Script Event (DS)

**Syntax:** `CALL event_id (integer) p1 (anything) p2 (anything)`
**Type:** Command

Call script `event_id` on `TARG`, passing `p1` and `p2` as message parameters. Equivalent to an immediate `MESG WRT+` with no delay.

---

### DROP — Drop Held Object (DS)

**Syntax:** `DROP`
**Type:** Command

Drop the object currently held by the pointer. (Stub: pointer carry not yet fully implemented.)

---

### NOHH — Stop Holding Hands

**Syntax:** `NOHH`
**Type:** Command

Tell the creature to immediately stop holding hands with the pointer. Useful when teleporting a Norn to prevent the pointer from changing its position back.

---

### MOWS — Lawn Status

**Syntax:** `MOWS`
**Type:** Integer R-Value

Returns whether the lawn was cut last Sunday or not. 🌿

---

### CATI — Category ID for Classifier

**Syntax:** `CATI family (integer) genus (integer) species (integer)`
**Type:** Integer R-Value

Returns the category id for the given classifier. The catalogue tag "Agent Classifiers" specifies these. Returns 39 ("unclassified") if no match.

---

### CATA — Category ID for Target (DS)

**Syntax:** `CATA`
**Type:** Integer R-Value

Returns the category id of TARG's classifier. Similar to `CATI` but operates on the target.

---

### CATX — Category Name

**Syntax:** `CATX category_id (integer)`
**Type:** String R-Value

Returns the name of the given category (e.g. "toy" or "bad bug"). Returns empty string if out of range.

---

[← Back to CAOS Overview](caos_overview.md)
