# API Reference

The Developer Tools are powered by an embedded HTTP/SSE server running on port **9980** alongside the static tool files.

If you wish to interact with the engine programmatically, you can query these endpoints directly. For a general introduction, see the [Developer Tools Overview](tools_overview.md).

> **Note on Concurrency:** Endpoints that modify engine state are executed on the main thread via a thread-safe `WorkItem` queue to prevent data races. See `ARCHITECTURE.md` for details.

---

## Engine State & Flow Control

### `POST /api/pause`
Pauses the global engine simulation. All game ticks freeze.

### `POST /api/resume`
Resumes the global engine simulation.

### `GET /api/engine-state`
Returns the current pause state (`{"paused": true/false}`).

---

## Execution & Compilation

*Used by the [Console](tab_console.md) and [CAOS IDE](tab_caos_ide.md).*

### `POST /api/execute`
Compile and execute CAOS code. The code runs on the main thread in a fresh `CAOSMachine` with no owner agent.

**Request:**
```json
{ "caos": "outs \"hello\"" }
```

**Response:**
```json
{
  "ok": true,
  "output": "hello",
  "error": ""
}
```
*(Timeout: 10 seconds. Returns HTTP 504 if the main thread is blocked).*

### `POST /api/validate`
Compiles CAOS source code without executing it, returning any syntax or compilation errors.

### `POST /api/compile-map`
Compiles CAOS code and returns the address-to-source-position map. Used by the IDE to map source line character offsets to bytecode IPs for breakpoints.

### `GET /api/caos-commands`
Returns a structured JSON catalog of all supported CAOS commands, functions, and variables. Used for IDE autocompletion.

---

## Breakpoint & Debugging

*Used by the [Debugger](tab_debugger.md) and [CAOS IDE](tab_caos_ide.md).*

### `GET /api/agent/:id`
Get full details about a specific agent: VM state, CAOS source code, variables (OV00-OV99, VA00-VA99), and context handles.

### `POST /api/breakpoint`
Set, clear, or clear all breakpoints on a specific agent's CAOS virtual machine.
**Request:**
```json
{ "agentId": 42, "action": "set", "ip": 156 }
```

### `POST /api/step/:agentId`
Step a paused agent's CAOS VM by one instruction (`into` or `over`).

### `POST /api/continue/:agentId`
Resume a paused agent's execution from a breakpoint.

---

## Script & Scriptorium Management

*Used by the [Scripts](tab_scripts.md) and [CAOS IDE](tab_caos_ide.md).*

### `GET /api/scripts`
List all currently running CAOS scripts across all active agents.

### `GET /api/scriptorium`
List all installed scripts in the engine's script registry.

### `GET /api/scriptorium/:f/:g/:s/:e`
Get the full source code of a specific scriptorium script using its classifier indices.

### `POST /api/scriptorium/inject`
Compile CAOS source and install it in the scriptorium. The source should omit the `scrp`/`endm` wrappers.

---

## Creatures & Brain

*Used by the [Creatures](tab_creatures.md) tab.*

### `GET /api/creatures`
List all active creatures (Norns, Grendels, Ettins) in the world.

### `GET /api/creature/:id/genome`
Parses and returns the full JSON representation of the creature's live genome.

### `GET /api/creature/:id/chemistry`
Get the full biochemistry state (all 256 chemical concentrations).

### `GET /api/creature/:id/organs`
Get the current state and parameters of all biological organs.

### `POST /api/creature/:id/syringe`
Inject a specific chemical directly into a creature's bloodstream.

### `GET /api/creature/:id/brain`
Get the brain overview of a creature — all neural lobes and tracts with neuron counts and geometry.

### `GET /api/creature/:id/brain/lobe/:lobe`
Get detailed neuron states for a specific brain lobe (activity level, winner state, semantic label).

### `GET /api/creature/:id/brain/tract/:tract`
Get dendrite connections for a specific brain tract. Returns source/destination neuron pairs with synaptic weights.

---

## Genetics Endpoints

The following endpoints are used exclusively by the [Genetics Kit](tab_genetics_kit.md). All operations interact directly with the `.gen` files in the world's Genetics directory.

* `GET /api/genetics/files` — Scans for `.gen` files and flags protected core files.
* `GET /api/genetics/file/:moniker` — Reads and parses a `.gen` binary file into structured JSON.
* `POST /api/genetics/crossover` — Performs biological `Genome::Cross` on two parents and writes the child genome to disk.
* `POST /api/genetics/save` — Serializes a modified JSON payload back into a binary `.gen` file.
* `POST /api/genetics/rename` — Safely renames a user `.gen` file.
* `POST /api/genetics/delete/:moniker` — Safely deletes a user `.gen` file.
* `POST /api/genetics/inject` — Serializes a genome, writes it to disk, and executes the CAOS macro to hatch it into the world.

---

## Log Streaming

*Used by the [Log](tab_log.md) tab.*

### `GET /api/events`
A long-lived HTTP Server-Sent Events (SSE) stream that broadcasts live engine log output from `FlightRecorder`.

---

## Metadata

### `GET /api/agent-names`
Returns human-readable agent names for classifiers in the scriptorium, resolved from `"Agent Help F G S"` catalogue tags.
