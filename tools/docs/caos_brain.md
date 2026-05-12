# CAOS Reference: Brain

Commands for inspecting and manipulating creature neural networks.

---

## Brain Commands (BRN:)

### BRN: SETN — Set Neuron State

**Syntax:** `BRN: SETN lobe_number (integer) neuron_number (integer) state_number (integer) new_value (float)`
**Type:** Command

Sets a neuron weight in the target creature's brain.

---

### BRN: SETD — Set Dendrite Weight

**Syntax:** `BRN: SETD tract_number (integer) dendrite_number (integer) weight_number (integer) new_value (float)`
**Type:** Command

Sets a dendrite weight in the target creature's brain.

---

### BRN: SETL — Set Lobe SV Rule Value

**Syntax:** `BRN: SETL lobe_number (integer) line_number (integer) new_value (float)`
**Type:** Command

Sets a lobe's SV rule float value.

---

### BRN: SETT — Set Tract SV Rule Value

**Syntax:** `BRN: SETT tract_number (integer) line_number (integer) new_value (float)`
**Type:** Command

Sets a tract's SV rule float value.

---

### BRN: DMPB — Dump Brain Sizes

**Syntax:** `BRN: DMPB`
**Type:** Command

Dumps the sizes of the binary data dumps for current lobes and tracts to the output stream.

---

### BRN: DMPL — Dump Lobe Data

**Syntax:** `BRN: DMPL lobe_number (integer)`
**Type:** Command

Dumps a lobe as binary data to the output stream.

---

### BRN: DMPT — Dump Tract Data

**Syntax:** `BRN: DMPT tract_number (integer)`
**Type:** Command

Dumps a tract as binary data to the output stream.

---

### BRN: DMPN — Dump Neuron Data

**Syntax:** `BRN: DMPN lobe_number (integer) neuron_number (integer)`
**Type:** Command

Dumps a neuron as binary data to the output stream.

---

### BRN: DMPD — Dump Dendrite Data

**Syntax:** `BRN: DMPD tract_number (integer) dendrite_number (integer)`
**Type:** Command

Dumps a dendrite as binary data to the output stream.

---

## Brain Integer R-Values

### KLOB — Count Lobes

**Syntax:** `KLOB`
**Type:** Integer R-Value

Returns the number of lobes in target creature's brain.

---

### KTRA — Count Tracts

**Syntax:** `KTRA`
**Type:** Integer R-Value

Returns the number of tracts in target creature's brain.

---

### BKGD — Brain Dump (DS)

**Syntax:** `BKGD`

> **Note:** The BKGD command for brain binary dump is distinct from the camera/background BKGD.

---

[← Back to CAOS Overview](caos_overview.md)
