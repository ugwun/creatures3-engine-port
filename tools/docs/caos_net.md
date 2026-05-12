# CAOS Reference: Networking (DS)

Docking Station online networking commands. All commands in this section are **offline stubs** in the macOS port — they compile and execute but perform no actual network operations.

---

## Connection

### NET: LINE — Go Online/Offline

**Syntax (command):** `NET: LINE state (integer)`
**Type:** Command

Go online (1) or offline (0). Offline stub: no-op.

**Syntax (integer RV):** `NET: LINE`
**Type:** Integer R-Value

Returns DS connection status. Offline stub returns 0.

---

### NET: PASS — Login

**Syntax (command):** `NET: PASS username (string) password (string)`
**Type:** Command

DS login with username and password. Offline stub: no-op.

**Syntax (integer RV):** `NET: PASS`
**Type:** Integer R-Value

Returns password authentication result. Offline stub returns 0.

---

### NET: HOST — Set/Get Server Host

**Syntax (command):** `NET: HOST host (string)`
**Type:** Command

Set DS server host. Offline stub: no-op.

**Syntax (string RV):** `NET: HOST`
**Type:** String R-Value

Returns current DS server host. Offline stub returns "".

---

## Channels & Messaging

### NET: HEAR — Listen on Channel

**Syntax:** `NET: HEAR channel (string)`
**Type:** Command

Listen for online messages on a channel. Offline stub: no-op.

---

### NET: MAKE — Create Channel

**Syntax (command):** `NET: MAKE type (integer) channel (string)`
**Type:** Command

Create/join an online channel. Offline stub: no-op.

**Syntax (integer RV):** `NET: MAKE type (integer) channel (string) recipient (string) status_var (variable)`
**Type:** Integer R-Value

Creates a network channel packet. Offline stub returns 0.

---

### NET: MOVE — Next Message

**Syntax:** `NET: MOVE`
**Type:** Command

Move to next network message. Offline stub: no-op.

---

## User Queries

### NET: ULIN — User Online Status

**Syntax (command):** `NET: ULIN username (string)`
**Type:** Command

Returns online status of user. Offline stub: no-op.

**Syntax (integer RV):** `NET: ULIN username (string)`
**Type:** Integer R-Value

Returns online status. Offline stub returns 0.

---

### NET: USER — Current Username

**Syntax:** `NET: USER`
**Type:** String R-Value

Returns DS username. Offline stub returns "".

---

### NET: FROM — Message Sender

**Syntax:** `NET: FROM message_id (integer)`
**Type:** String R-Value

Returns DS message sender. Offline stub returns "".

---

### NET: WHAT — Message Content

**Syntax:** `NET: WHAT`
**Type:** String R-Value

Returns DS current message content. Offline stub returns "".

---

### NET: WHOZ — Who's Online

**Syntax:** `NET: WHOZ`
**Type:** Command

Query who is online. Offline stub: no-op.

---

### NET: WHON — Online Notification

**Syntax:** `NET: WHON user_id (string)`
**Type:** Command

Notify of online user. Offline stub: no-op.

---

### NET: WHOF — Stop Tracking User

**Syntax (command):** `NET: WHOF user_id (string)`
**Type:** Command

Stop tracking a user online. Offline stub: no-op.

**Syntax (string RV):** `NET: WHOF`
**Type:** String R-Value

Returns DS follower list. Offline stub returns "".

---

## Other

### NET: EXPO — Export to User

**Syntax:** `NET: EXPO channel (string) user_id (string)`
**Type:** Integer R-Value

Exports a creature resource. Offline stub returns 0.

---

### NET: RUSO — User Online State

**Syntax:** `NET: RUSO value (integer)`
**Type:** Command

Set user online state. Offline stub: no-op.

---

### NET: STAT — Connection Statistics

**Syntax (command):** `NET: STAT out1 (variable) out2 (variable) out3 (variable) out4 (variable)`
**Type:** Command

Dump connection statistics. Offline stub: no-op.

**Syntax (integer RV):** `NET: STAT a (integer) b (integer) c (integer) d (integer)`
**Type:** Integer R-Value

Returns statistics. Offline stub returns 0.

---

### NET: UNIK — User Unique ID

**Syntax (command):** `NET: UNIK user_id (string) out_var (integer)`
**Type:** Command

Get unique ID for a user. Offline stub: no-op.

**Syntax (string RV):** `NET: UNIK user_id (integer)`
**Type:** String R-Value

Returns user unique ID. Offline stub returns "".

---

### NET: ERRA — Last Error

**Syntax:** `NET: ERRA`
**Type:** Integer R-Value

Returns last DS network error code. Offline stub returns 0.

---

[← Back to CAOS Overview](caos_overview.md)
