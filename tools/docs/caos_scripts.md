# CAOS Reference: Scripts & Execution

Commands for controlling script execution, scheduling, and the CAOS virtual machine.

---

## Execution Control

### INST — Instant Execution

**Syntax:** `INST`
**Type:** Command

Indicates that the following commands should execute in a single tick — the script cannot be interrupted by the scheduler. Important for tasks which might leave an agent in an undefined state if interrupted. The INST state is broken either manually with `SLOW`, or implicitly if a blocking instruction is encountered (e.g. `WAIT`).

```
inst
mvto 500 200
attr 195
slow
```

---

### SLOW — End Instant Execution

**Syntax:** `SLOW`
**Type:** Command

Turns off `INST` state.

---

### WAIT — Wait Ticks

**Syntax:** `WAIT ticks (integer)`
**Type:** Command

Block the script for the specified number of ticks. This command does an implicit `SLOW`.

```
wait 20
* resume after 20 ticks
```

---

### STOP — Stop Current Script

**Syntax:** `STOP`
**Type:** Command

Stops running the current script. Compare `STPT`.

---

### STPT — Stop Target's Script

**Syntax:** `STPT`
**Type:** Command

Stops any currently running script in the target agent. See also `STOP`.

---

### LOCK — Lock Script

**Syntax:** `LOCK`
**Type:** Command

Prevent the current script being interrupted until `UNLK`. Normally, events other than timer scripts interrupt (abort) currently running scripts. You can also use `INST` for similar, stronger protection.

---

### UNLK — Unlock Script

**Syntax:** `UNLK`
**Type:** Command

End the `LOCK` section.

---

## Script Management

### SCRX — Remove Script

**Syntax:** `SCRX family (integer) genus (integer) species (integer) event (integer)`
**Type:** Command

Remove specified script from the scriptorium.

---

### SORC — Get Script Source

**Syntax:** `SORC family (integer) genus (integer) species (integer) event (integer)`
**Type:** String R-Value

Returns the source code for the specified script. Use the `GIDS` commands to find available scripts.

---

### SORQ — Query Script Exists

**Syntax:** `SORQ family (integer) genus (integer) species (integer) event (integer)`
**Type:** Integer R-Value

Returns 1 if the script is in the scriptorium (or if there is a general event script for the genus or family). Returns 0 if no matching script exists.

---

### GIDS ROOT — List Script Families

**Syntax:** `GIDS ROOT`
**Type:** Command

Output the family numbers for which there are scripts in the scriptorium. List is space delimited (written to the output stream).

---

### GIDS FMLY — List Script Genera

**Syntax:** `GIDS FMLY family (integer)`
**Type:** Command

Output the genus numbers for which there are scripts for the given family.

---

### GIDS GNUS — List Script Species

**Syntax:** `GIDS GNUS family (integer) genus (integer)`
**Type:** Command

Output the species numbers for which there are scripts for the given family and genus.

---

### GIDS SPCS — List Script Events

**Syntax:** `GIDS SPCS family (integer) genus (integer) species (integer)`
**Type:** Command

Output the event numbers of scripts for the given classifier.

---

## Inline CAOS Execution

### CAOS — Execute CAOS Inline

**Syntax:** `CAOS inline (integer) state_trans (integer) p1 (anything) p2 (anything) commands (string) throws (integer) catches (integer) report (variable)`
**Type:** String R-Value

Executes the specified CAOS commands instantly. If `inline` is non-zero, the local environment (`_IT_`, `VAxx`, `TARG`, `OWNR`, etc.) is promoted to the script's environment. If `state_trans` is non-zero, `FROM` and `OWNR` are propagated; if zero, the script runs orphaned.

Returns the output of the script. If `throws` is non-zero, exceptions are thrown. If `catches` is non-zero, run errors are caught and returned in `report`, with the return value set to `"###"`.

```
sets va00 caos 1 0 0 0 "outv rand 1 6" 0 0 va01
outs va00
```

---

## Script Injection (DS)

### JECT — Inject Script File (DS)

**Syntax:** `JECT filename (string) flags (integer)`
**Type:** Command

Inject a .cos script file at runtime. (Stub: not implemented on this port.)

---

[← Back to CAOS Overview](caos_overview.md)
