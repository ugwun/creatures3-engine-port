# Evaluate-now Scratchpad

The **Scratchpad** is the compact expert path for short, read-only CAOS
expressions. Each submission is compiled and, when classified as read-only,
executed immediately in a fresh ownerless VM.

```caos
outs "hello world"
```

The result includes the world-tick interval. Use **↑/↓** for up to 200 history
entries, **Shift+Enter** for another input line, and **Clear Output** to reset
the view.

## Why some source moves to Workbench

The engine reviews what the compiler actually emitted. Only flow control, output
and state local to the script count as read-only, so `outv aslp` runs but
`aslp 1` does not, and `setv va00 1` runs but `setv game "x" 1` does not.
Everything else is not executed from the Scratchpad. A **Review this source in CAOS Workbench** action transfers
the exact text into **Evaluate now**, where world, target, risk, pause behavior,
and experiment recording are visible before confirmation.

This distinction is intentional:

- Scratchpad means “compile and evaluate this read-only snippet now.”
- Workbench Evaluate means “review an immediate intervention.”
- Workbench Install/Replace/Remove means “change the active world's
  scriptorium.”
- Debugger means “inspect an already running agent VM.”

Validation is not a claim that arbitrary CAOS is safe. The maintained command
risk inventory is conservative, and unknown commands require Workbench review.

## Evaluation context

- No `OWNR` is supplied.
- No `TARG` is bound from the Scratchpad.
- Every submission uses a new VM; `va00`–`va99` do not persist.
- Blocking/yielding commands such as `wait` and `over` cannot yield from this
  single-shot call.
- Enumeration or loops that must finish synchronously need `inst`.
- The reviewed world name and tick are checked immediately before execution.

For example, set and consume a variable in the same submission:

```caos
setv va00 2 addv va00 3 outv va00
```

The browser first calls `POST /api/caos/validate`, then sends the returned
source checksum and current world context to `POST /api/caos/evaluate`.
Compilation errors include line/column information. Successful evaluation
returns output, world/system tick bounds, elapsed wall time, optional target,
pause handling, and a correlation ID.

The legacy `POST /api/execute` endpoint remains available for compatible
external clients, but the Scratchpad no longer uses it because it does not
carry reviewed context.

## See also

- [CAOS Workbench](tab_caos_ide.md)
- [Scripts](tab_scripts.md)
- [Debugger](tab_debugger.md)
- [API Reference](api_reference.md)
