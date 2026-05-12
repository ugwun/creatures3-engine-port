# CAOS Reference: Flow Control

Flow control commands manage program execution — conditionals, loops, subroutines, and jumps.

---

## Conditionals

### DOIF — Conditional Block

**Syntax:** `DOIF condition`
**Type:** Command

Execute a block of code if the condition is true. The code block ends at the next `ELSE`, `ELIF`, or `ENDI`. A condition is composed of one or more comparisons joined by `AND` or `OR`. A comparison compares two values with `EQ`, `NE`, `GT`, `GE`, `LT`, `LE`, or alternatively `=`, `<>`, `>`, `>=`, `<`, `<=`.

Conditions are evaluated simply from left to right, so `a AND b OR c` is the same as `(a AND b) OR c`, NOT `a AND (b OR c)`.

> **Note:** Conditional statements may not work correctly with commands overloaded by rvalue.

```
doif ov00 ge 5 and ov00 lt 10
    * code block 1
elif ov00 ge 10 or ov00 lt 100
    * code block 2
else
    * code block 3
endi
```

---

### ELIF — Else-If Clause

**Syntax:** `ELIF condition`
**Type:** Command

Follows a `DOIF`. If the condition in the preceding `DOIF` (or another `ELIF`) is false, this `ELIF` condition will be evaluated. Only the first true condition has its code block executed.

---

### ELSE — Else Clause

**Syntax:** `ELSE`
**Type:** Command

Follows `DOIF` and optional `ELIF`(s). If nothing else matches, the `ELSE` block will be executed.

---

### ENDI — End Conditional

**Syntax:** `ENDI`
**Type:** Command

Closes a `DOIF`...`ELIF`...`ELSE`... set.

---

## Loops

### REPS / REPE — Counted Loop

**Syntax:** `REPS count (integer)`
**Type:** Command

Loop through a block of code a specified number of times. Must have a matching `REPE` to close the block.

```
reps 5
    outv va00
    addv va00 1
repe
```

---

### REPE — End Counted Loop

**Syntax:** `REPE`
**Type:** Command

Closes a `REPS` loop.

---

### LOOP — Begin Unconditional/Conditional Loop

**Syntax:** `LOOP`
**Type:** Command

Begin a `LOOP`..`UNTL` or `LOOP`..`EVER` loop.

---

### UNTL — Until (Loop End)

**Syntax:** `UNTL condition`
**Type:** Command

Forms the end of a `LOOP`..`UNTL` loop. The loop will execute until the condition is met. See `DOIF` for information on the form of the condition.

```
setv va00 0
loop
    addv va00 1
    outv va00
untl va00 eq 10
```

---

### EVER — Forever (Loop End)

**Syntax:** `EVER`
**Type:** Command

Forms the end of a `LOOP`..`EVER` loop, which loops forever. Use `STOP` or `STPT` to exit.

```
loop
    wait 10
    * do something every 10 ticks
ever
```

---

## Subroutines

### SUBR — Define Subroutine

**Syntax:** `SUBR label`
**Type:** Command

Defines the start of a subroutine. Specify a label after the `SUBR` command — the label is case sensitive and should start with a letter. If this instruction is hit during normal program flow, it works as a `STOP` instruction. See `GSUB` and `RETN`.

```
gsub MyHelper
stop

subr MyHelper
    outs "Hello from subroutine"
retn
```

---

### GSUB — Go to Subroutine

**Syntax:** `GSUB label`
**Type:** Command

Jumps to a subroutine defined by `SUBR`. Execution will continue at the instruction after the `GSUB` when the subroutine hits a `RETN` command.

---

### RETN — Return from Subroutine

**Syntax:** `RETN`
**Type:** Command

Return from subroutine. **Do not** use this instruction from inside a block of code (e.g. a `LOOP`..`EVER` or `ENUM`...`NEXT`)!

---

### GOTO — Jump to Label

**Syntax:** `GOTO label`
**Type:** Command

> **Warning:** Don't use this command. It jumps directly to a label defined by `SUBR`. This command is only here because it is used implicitly by `DOIF` blocks. This is a really dangerous command to use manually, because if you jump out of a block of code (e.g. a `LOOP`...`EVER` block), the stack frame will no longer be correct, and the script will most likely crash.

---

[← Back to CAOS Overview](caos_overview.md)
