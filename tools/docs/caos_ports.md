# CAOS Reference: Ports

Commands for the agent port system — connecting agents together for data exchange.

---

## Creating Ports (PRT:)

### PRT: INEW — Create Input Port

**Syntax:** `PRT: INEW id (integer) name (string) description (string) x (integer) y (integer) message_num (integer)`
**Type:** Command

Create a new input port on target. Number input port ids starting at 0. `message_num` is the message sent to the agent when a signal comes in. `_P1_` of that message contains the data value. Position x, y is relative to the agent.

---

### PRT: IZAP — Remove Input Port

**Syntax:** `PRT: IZAP id (integer)`
**Type:** Command

Remove the specified input port.

---

### PRT: ONEW — Create Output Port

**Syntax:** `PRT: ONEW id (string) name (string) description (string) x (integer) y (integer)`
**Type:** Command

Create a new output port on target. Number ids starting at 0.

---

### PRT: OZAP — Remove Output Port

**Syntax:** `PRT: OZAP id (integer)`
**Type:** Command

Remove the specified output port.

---

## Connections

### PRT: JOIN — Connect Ports

**Syntax:** `PRT: JOIN source_agent (agent) output_id (integer) dest_agent (agent) input_id (integer)`
**Type:** Command

Connect an output port on the source agent to an input port on the destination. An input may only be connected to one output at a time, but an output may feed any number of inputs.

---

### PRT: KRAK — Break Connection

**Syntax:** `PRT: KRAK agent (agent) in_or_out (integer) port_index (integer)`
**Type:** Command

Breaks a specific connection. If `in_or_out` is 0, breaks the input port connection. If output port, disconnects all inputs.

---

### PRT: BANG — Break Random Connections

**Syntax:** `PRT: BANG bang_strength (integer)`
**Type:** Command

Randomly breaks connections. 100 disconnects all ports, 50 disconnects about half, etc.

---

## Sending Signals

### PRT: SEND — Send Signal

**Syntax:** `PRT: SEND id (integer) data (anything)`
**Type:** Command

Send a signal from the specified output port to all connected inputs. Data can be any integer.

---

## Port Queries

### PRT: ITOT — Input Port Count

**Syntax:** `PRT: ITOT`
**Type:** Integer R-Value

Returns the number of input ports.

---

### PRT: OTOT — Output Port Count

**Syntax:** `PRT: OTOT`
**Type:** Integer R-Value

Returns the number of output ports.

---

### PRT: FROM — Source Output Port

**Syntax:** `PRT: FROM inputport (integer)`
**Type:** Integer R-Value

Returns the output port index on the source agent feeding the specified input port on TARG. Returns negative for error.

---

### PRT: FRMA — Source Agent

**Syntax:** `PRT: FRMA inputport (integer)`
**Type:** Agent R-Value

Returns the agent feeding the input port. Returns NULL if not connected.

---

### PRT: NAME — Port Name

**Syntax:** `PRT: NAME agent (agent) in_or_out (integer) port_index (integer)`
**Type:** String R-Value

Returns the name of the indexed port. Returns "" on error.

---

## Port Events (ECON / ECONN)

### ECON — Enumerate Port Connections

**Syntax:** `ECON agent (agent)`
**Type:** Command

Iterate through all the agents which are connected to the input ports of the given agent. Sets `TARG` to each connected agent.

---

[← Back to CAOS Overview](caos_overview.md)
