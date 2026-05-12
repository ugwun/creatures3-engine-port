# CAOS Reference: Variables & Math

Variables store data and math commands manipulate numeric values. CAOS supports integers, floats, strings, and agent references in variables.

---

## Variable Types

### VAxx — Local Variables (VA00–VA99)

**Type:** Variable (read/write)

VA00 to VA99 are local variables whose values are lost when the current script ends. They exist only within the currently executing script/virtual machine context.

```
setv va00 42
setv va01 3.14
sets va02 "hello"
```

---

### OVxx — Agent Variables (OV00–OV99)

**Type:** Variable (read/write)

OV00 to OV99 are variables specific to an agent. They are read from `TARG`, the target agent. These persist with the agent across ticks and are saved/loaded with the world.

```
targ ownr
setv ov00 1
outv ov00
```

---

### MVxx — Owner Variables (MV00–MV99)

**Type:** Variable (read/write)

MV00 to MV99 are variables specific to an agent, read from `OWNR` (the owner agent of the current script).

---

### GAME — Global Game Variable

**Syntax (variable):** `GAME variable_name (string)`
**Type:** Variable (read/write)

A game variable is a global variable which can be referenced by name. Game variables are stored as part of the world and will be saved in the world file. Agents, integers, floats, and strings can be stored. Variable names are case sensitive.

Naming conventions: `engine_` for engine variables, `cav_` for Creatures Adventures, `c3_` for Creatures 3.

```
setv game "pi" 3.142
outv game "pi"

sets game "player_name" "Bob"
outs game "player_name"
```

Use `DELG` to delete a game variable. See also `GAMN` for enumerating game variables.

---

### NAME — Named Variable (DS)

**Syntax (variable):** `NAME variable_name (string)`
**Type:** Variable (read/write)

A named variable, similar to `GAME` but stored outside the world file. Used by Docking Station scripts.

---

### EAME — Engine-Scoped Variable (DS)

**Syntax (variable):** `EAME variable_name (string)`
**Type:** Variable (read/write)

An engine-scoped named variable, similar to `GAME` but persists across world reloads. Used by Docking Station scripts.

---

### MAME — Meta-Message Variable (DS)

**Syntax (variable):** `MAME variable_name (string)`
**Type:** Variable (read/write)

A network meta-message variable (per-session key/value store). Backed by the game variable store for offline compatibility.

---

### AVAR — Remote Agent Variable

**Syntax (variable):** `AVAR agent (agent) index (integer)`
**Type:** Variable (read/write)

This is the OVnn variable of the agent passed in. Equivalent to targeting the agent and accessing OVnn, but without needing to change `TARG`. Can also be used to implement primitive arrays.

```
setv avar targ 5 100
outv avar targ 5
```

---

### _P1_ — Script Parameter 1

**Type:** Variable (read/write)

Returns the first parameter sent to a script via `MESG WRT+`.

---

### _P2_ — Script Parameter 2

**Type:** Variable (read/write)

Returns the second parameter sent to a script via `MESG WRT+`.

---

### FROM — Message Sender (Variable)

**Type:** Variable (read/write)

The message sender agent variable. Writable: `seta from <agent>`. If processing a message, this is the `OWNR` who sent the message. `NULL` if sent from an injected or install script.

---

### VELX — Horizontal Velocity

**Type:** Variable (read/write, float)

Horizontal velocity in pixels per tick.

---

### VELY — Vertical Velocity

**Type:** Variable (read/write, float)

Vertical velocity in pixels per tick.

---

## Assignment Commands

### SETV — Set Variable (Numeric)

**Syntax:** `SETV var (variable) value (decimal)`
**Type:** Command

Stores an integer or float in a variable.

```
setv va00 42
setv va01 3.14
setv ov00 rand 1 100
```

---

### SETS — Set Variable (String)

**Syntax:** `SETS var (variable) value (string)`
**Type:** Command

Sets a variable to a string value.

```
sets va00 "hello world"
```

---

### SETA — Set Variable (Agent)

**Syntax:** `SETA var (variable) value (agent)`
**Type:** Command

Stores a reference to an agent in a variable.

```
seta va00 targ
seta va01 null
```

---

### TARG — Set Target

**Syntax (command):** `TARG agent (agent)`
**Type:** Command

Sets the TARG variable to the agent specified. Many commands operate on `TARG`.

**Syntax (agent RV):** `TARG`
**Type:** Agent R-Value

Returns the current target agent.

---

## Arithmetic Commands

### ADDV — Add

**Syntax:** `ADDV var (variable) sum (decimal)`
**Type:** Command

Adds two integers or floats: `var = var + sum`.

```
setv va00 10
addv va00 5
outv va00
* Output: 15
```

---

### SUBV — Subtract

**Syntax:** `SUBV var (variable) sub (decimal)`
**Type:** Command

Subtracts an integer or float from a variable: `var = var - sub`.

---

### MULV — Multiply

**Syntax:** `MULV var (variable) mul (decimal)`
**Type:** Command

Multiplies a variable by an integer or float: `var = var * mul`.

---

### DIVV — Divide

**Syntax:** `DIVV var (variable) div (decimal)`
**Type:** Command

Divides a variable by an integer or float: `var = var / div`. Uses integer division if both numbers are integers, or floating point division otherwise.

---

### MODV — Modulus

**Syntax:** `MODV var (variable) mod (integer)`
**Type:** Command

Gives the remainder (or modulus) when a variable is divided by an integer: `var = var % mod`. Both values should be integers.

---

### NEGV — Negate

**Syntax:** `NEGV var (variable)`
**Type:** Command

Reverses the sign of the given integer or float variable: `var = 0 - var`.

---

### ABSV — Absolute Value

**Syntax:** `ABSV var (variable)`
**Type:** Command

Sets a variable to its absolute value. If var is negative, `var = 0 - var`, otherwise var is left alone.

---

## Bitwise Operations

### ANDV — Bitwise AND

**Syntax:** `ANDV var (variable) value (integer)`
**Type:** Command

Performs a bitwise AND on an integer variable: `var = var & value`.

---

### ORRV — Bitwise OR

**Syntax:** `ORRV var (variable) value (integer)`
**Type:** Command

Performs a bitwise OR on an integer variable: `var = var | value`.

---

## Math R-Values

### RAND — Random Integer

**Syntax:** `RAND value1 (integer) value2 (integer)`
**Type:** Integer R-Value

Returns a random integer between value1 and value2 inclusive of both values. You can use negative values, and have them either way round.

```
setv va00 rand 1 6
* va00 is now a random dice roll
```

---

### SIN_ — Sine

**Syntax:** `SIN_ theta (float)`
**Type:** Float R-Value

Returns sine of theta. Theta should be in degrees.

---

### COS_ — Cosine

**Syntax:** `COS_ theta (float)`
**Type:** Float R-Value

Returns cosine of theta. Theta should be in degrees.

---

### TAN_ — Tangent

**Syntax:** `TAN_ theta (float)`
**Type:** Float R-Value

Returns tangent of theta. Theta should be in degrees. Watch out for discontinuities at 90 and 270.

---

### ASIN — Arcsine

**Syntax:** `ASIN x (float)`
**Type:** Float R-Value

Returns arcsine of x in degrees.

---

### ACOS — Arccosine

**Syntax:** `ACOS x (float)`
**Type:** Float R-Value

Returns arccosine of x in degrees.

---

### ATAN — Arctangent

**Syntax:** `ATAN x (float)`
**Type:** Float R-Value

Returns arctangent of x in degrees.

---

### SQRT — Square Root

**Syntax:** `SQRT value (float)`
**Type:** Float R-Value

Calculates a square root.

```
setv va00 sqrt 144.0
* va00 = 12.0
```

---

## String Operations

### ADDS — Concatenate Strings

**Syntax:** `ADDS var (variable) append (string)`
**Type:** Command

Concatenates two strings: `var = var + append`.

```
sets va00 "Hello "
adds va00 "World"
outs va00
* Output: Hello World
```

---

### CHAR — Set Character in String

**Syntax (command):** `CHAR string (variable) index (integer) character (integer)`
**Type:** Command

Sets a character in a string. String indices begin at 1.

**Syntax (integer RV):** `CHAR string (string) index (integer)`
**Type:** Integer R-Value

Returns a character from a string. String indices begin at 1.

---

### SUBS — Substring

**Syntax:** `SUBS value (string) start (integer) count (integer)`
**Type:** String R-Value

Slices a string, returning the substring starting at position `start`, with length `count`. String indices begin at 1.

---

### STRL — String Length

**Syntax:** `STRL string (string)`
**Type:** Integer R-Value

Returns the length of a string.

---

### LOWA — Lowercase (DS)

**Syntax:** `LOWA value (string)`
**Type:** String R-Value

Returns the lowercase version of the given string.

---

### UPPA — Uppercase (DS)

**Syntax:** `UPPA value (string)`
**Type:** String R-Value

Returns the uppercase version of the given string. (Stub: returns input unchanged.)

---

## Type Conversion

### STOI — String to Integer

**Syntax:** `STOI value (string)`
**Type:** Integer R-Value

Converts a string in decimal to an integer. Characters after an initial number are quietly ignored. If there is no obvious number, zero is returned.

---

### STOF — String to Float

**Syntax:** `STOF value (string)`
**Type:** Float R-Value

Converts a string in decimal to a floating point number. Characters after an initial number are quietly ignored. If there is no obvious number, zero is returned.

---

### FTOI — Float to Integer

**Syntax:** `FTOI number_to_convert (float)`
**Type:** Integer R-Value

Converts a floating-point value into its integer equivalent.

---

### ITOF — Integer to Float

**Syntax:** `ITOF number_to_convert (integer)`
**Type:** Float R-Value

Converts an integer value into its floating-point equivalent.

---

### VTOS — Value to String

**Syntax:** `VTOS value (decimal)`
**Type:** String R-Value

Converts an integer or float into a string in decimal.

```
setv va00 42
sets va01 vtos va00
outs va01
* Output: 42
```

---

## Type Inspection

### TYPE — Type of Variable

**Syntax:** `TYPE something (anything)`
**Type:** Integer R-Value

Determines the type of a variable. Returns:

| Value | Meaning |
|---|---|
| 0 | integer |
| 1 | floating-point |
| 2 | string |
| 3 | simple agent |
| 4 | pointer agent |
| 5 | compound agent |
| 6 | vehicle |
| 7 | creature |
| -1 | NULL agent handle |
| -2 | Unknown agent (should never happen) |

---

## Catalogue Access

### READ — Read Catalogue Entry

**Syntax:** `READ catalogue_tag (string) offset (integer)`
**Type:** String R-Value

Returns a string from the catalogue. Used for localisation. Offset 0 is the first string after the TAG command in the catalogue file.

---

### REAN — Count Catalogue Entries

**Syntax:** `REAN catalogue_tag (string)`
**Type:** Integer R-Value

Returns the number of entries in the catalogue for the given tag. You can `READ` values from 0 to `REAN - 1`.

---

### REAQ — Query Catalogue Tag

**Syntax:** `REAQ catalogue_tag (string)`
**Type:** Integer R-Value

Returns 1 if the catalogue tag is present, 0 if not.

---

### REAF — Refresh Catalogue

**Syntax:** `REAF`
**Type:** Command

Refreshes the catalogue from files on disk (main catalogue directory and world catalogue directory). Use while developing CAOS programs to refresh the catalogue as you add entries.

---

### WILD — Wildcard Catalogue Lookup

**Syntax:** `WILD family (integer) genus (integer) species (integer) tag_stub (string) offset (integer)`
**Type:** String R-Value

Searches for a catalogue tag based on the given classifier and returns the string at the given offset. For example, with a tag_stub of "Agent Help" and a classifier 3 7 11, it would first look for the tag "Agent Help 3 7 11". If not present, it goes through wildcards, eventually trying "Agent Help 0 0 0".

---

## Variable Enumeration

### GAMN — Enumerate Game Variable Names

**Syntax:** `GAMN previous (string)`
**Type:** String R-Value

Enumerates through game variable names. Pass in an empty string to find the first one, then the previous one to find the next. Empty string is returned at the end.

```
sets va00 ""
loop
    sets va00 gamn va00
    doif va00 eq ""
        stop
    endi
    outs va00
    outs " "
ever
```

---

### DELG — Delete Game Variable

**Syntax:** `DELG variable_name (string)`
**Type:** Command

Deletes the specified `GAME` variable.

---

## Engine Version

### VMJR — Major Version

**Syntax:** `VMJR`
**Type:** Integer R-Value

Returns the major version number of the engine.

---

### VMNR — Minor Version

**Syntax:** `VMNR`
**Type:** Integer R-Value

Returns the minor version number of the engine.

---

### GNAM — Game Name

**Syntax:** `GNAM`
**Type:** String R-Value

Returns the game name, for example "Creatures 3".

---

[← Back to CAOS Overview](caos_overview.md)
