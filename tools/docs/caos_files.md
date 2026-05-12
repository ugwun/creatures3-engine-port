# CAOS Reference: Files & I/O

Commands for reading and writing files, and stream input/output.

---

## Output Stream

### OUTS — Output String

**Syntax:** `OUTS value (string)`
**Type:** Command

Sends a string to the output stream of the current virtual machine. The output stream can be connected to a file via `FILE OOPE`, or the standard output.

```
outs "Hello World"
```

---

### OUTV — Output Value

**Syntax:** `OUTV value (decimal)`
**Type:** Command

Sends an integer or float to the output stream as decimal text.

```
outv 42
```

---

### OUTX — Output Formatted

**Syntax:** `OUTX value (string)`
**Type:** Command

Sends a string with XML/HTML special characters escaped.

---

## File Operations (FILE:)

### FILE OOPE — Open Output File

**Syntax:** `FILE OOPE directory (integer) filename (string) append (integer)`
**Type:** Command

Opens a file for writing. Directory is 0 for the current world's journal directory, or 1 for the main journal directory. Set `append` to 1 to add to the end, or 0 to replace.

```
file oope 0 "log.txt" 1
outs "A log entry"
file oclo
```

---

### FILE OCLO — Close Output File

**Syntax:** `FILE OCLO`
**Type:** Command

Closes the current output file.

---

### FILE OFLU — Flush Output File

**Syntax:** `FILE OFLU`
**Type:** Command

Flush output stream — forces any buffered data to be written to disk.

---

### FILE IOPE — Open Input File

**Syntax:** `FILE IOPE directory (integer) filename (string)`
**Type:** Command

Opens a file for reading. Directory is 0 for the current world's journal directory, or 1 for the main journal directory.

---

### FILE ICLO — Close Input File

**Syntax:** `FILE ICLO`
**Type:** Command

Closes the current input file.

---

### FILE JDEL — Delete Journal File

**Syntax:** `FILE JDEL directory (integer) filename (string)`
**Type:** Command

Deletes the specified file from the journal directory. Directory 0 for world journal, 1 for main journal. Deletes immediately.

---

## Input Stream

### INNL — Input Line (String)

**Syntax:** `INNL`
**Type:** String R-Value

Retrieves a line of text from the input stream.

---

### INNI — Input Integer

**Syntax:** `INNI`
**Type:** Integer R-Value

Retrieves an integer from the input stream, delimited by white space. Defaults to 0 if no valid data.

---

### INNF — Input Float

**Syntax:** `INNF`
**Type:** Float R-Value

Retrieves a float from the input stream, delimited by white space. Defaults to 0.0 if no valid data.

---

### INOK — Input Stream Valid?

**Syntax:** `INOK`
**Type:** Integer R-Value

Returns 1 if the input stream is valid (open and has data), 0 otherwise.

---

## Filename Utilities

### FVWM — Safe Filename

**Syntax:** `FVWM name (string)`
**Type:** String R-Value

Returns a guaranteed-safe filename for use in world names, journal file names, etc.

---

[← Back to CAOS Overview](caos_overview.md)
