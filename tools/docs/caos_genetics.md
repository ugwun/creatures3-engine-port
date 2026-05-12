# CAOS Reference: Genetics

Commands for managing genomes, monikers, and genetic manipulation.

---

## Genome Manipulation (GENE:)

### GENE LOAD — Load Genome from File

**Syntax:** `GENE LOAD agent (agent) slot (integer) gene_file (string)`
**Type:** Command

Loads an engineered gene file into a slot. Slot 0 is a special slot used only for creatures and contains the moniker they express. Only `NEW: CREA` fills it in. Other slot numbers are used in pregnant creatures, eggs, or to temporarily store a genome before expressing with `NEW: CREA`.

The gene file can have any name and is loaded from the main genetics directory. A new moniker is generated and a copy put in the world directory. Wildcards (`*`, `?`) in the name cause a random matching file to be used.

```
gene load targ 1 "norn*"
new: crea 4 targ 1 0 0
```

---

### GENE CROS — Crossover (Sexual Reproduction)

**Syntax:** `GENE CROS child_agent (agent) child_slot (integer) mum_agent (agent) mum_slot (integer) dad_agent (agent) dad_slot (integer) mum_chance_of_mutation (integer) mum_degree_of_mutation (integer) dad_chance_of_mutation (integer) dad_degree_of_mutation (integer)`
**Type:** Command

Crosses two genomes with mutation and fills in a child genome slot. Mutation variables range from 0 to 255.

---

### GENE MOVE — Move Genome

**Syntax:** `GENE MOVE dest_agent (agent) dest_slot (integer) source_agent (agent) source_slot (integer)`
**Type:** Command

Moves a genome from one slot to another.

---

### GENE KILL — Clear Genome Slot

**Syntax:** `GENE KILL agent (agent) slot (integer)`
**Type:** Command

Clears a genome slot.

---

### GENE CLON — Clone Genome

**Syntax:** `GENE CLON dest_agent (agent) dest_slot (integer) source_agent (agent) source_slot (integer)`
**Type:** Command

Clones a genome, creating a new moniker and copying the genetics file.

---

## Moniker Queries

### GTOS — Moniker from Slot

**Syntax:** `GTOS slot (integer)`
**Type:** String R-Value

Returns the target's moniker in the given gene variable slot. This universally unique identifier is the name of a genetics file. Slot 0 is a creature's actual genome. Other slots are used in pregnant creatures, eggs, and other places.

---

### MTOC — Creature from Moniker

**Syntax:** `MTOC moniker (string)`
**Type:** Agent R-Value

Returns the creature with the given moniker. Returns `NULL` if no agent alive with that moniker. See also `MTOA`.

---

### MTOA — Agent from Moniker

**Syntax:** `MTOA moniker (string)`
**Type:** Agent R-Value

Returns the agent which references the given moniker. The moniker could be in any gene slot. Returns `NULL` if moniker not currently used. This command can be slow — use `MTOC` if possible.

---

[← Back to CAOS Overview](caos_overview.md)
