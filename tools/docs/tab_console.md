# Console Tab

The **Console** tab provides an interactive CAOS Read-Eval-Print Loop (REPL). It allows you to compile and execute CAOS commands directly on the engine's main thread, with output displayed immediately.

![Console Tab](/docs/media/tab_console.png)

## Usage Examples

Commands are entered at the prompt and executed immediately. 

```caos
> outs "hello world"
hello world

> outv 2 + 3
5

> setv va00 42
(ok — no output)

> outv va00
42
```

## Features

* **Instant Execution:** Commands are compiled by the `Orderiser` and executed by a fresh `CAOSMachine` running directly on the main thread.
* **Command History:** Use the **↑ / ↓** arrow keys to recall previous commands (up to 200 entries are stored in the history buffer).
* **Multi-line Input:** Press **Shift+Enter** to write multi-line CAOS scripts. Pressing **Enter** on its own executes the current buffer.
* **Error Display:** Compilation errors and runtime errors are clearly displayed in red, marked with a `✗`.
* **Clear Output:** Use the "Clear Output" button in the header to reset the console view.

## C++ Stack Tracer (`CSTK`)

The engine includes a custom CAOS command `cstk` (a `StringRV`) designed for deep debugging and engine reverse-engineering. When evaluated, it returns a demangled string containing the current native C++ call stack of the CAOS Virtual Machine.

This command is invaluable for tracking down exactly which C++ functions and handlers are executing your CAOS scripts. It correctly handles nested VM creation (e.g., inline `caos` string evaluation).

**Usage Example:**
```caos
> outs cstk
0 GeneralHandlers::StringRV_CSTK(...)
1 GeneralHandlers::Command_OUTS(...)
2 CAOSMachine::UpdateVM(int)
...
```

> **Note:** `cstk` is a `StringRV`. This means it evaluates to a string and must be consumed by a command like `outs` or stored in a variable (`sets`). Executing it as a standalone command will cause a syntax error.

## Limitations and Constraints

Because the Console executes scripts in a one-off, disconnected context, there are a few important limitations to keep in mind:

* **No `OWNR` Context:** The console does not have an owner agent. Any CAOS command that requires `ValidateOwner()` (such as `targ ownr`) will throw a runtime error. This matches the historical behaviour of the original Windows CAOS Tool.
* **No Blocking Commands:** Commands that yield execution (like `wait`, `over`, `anim ... over`) will throw a `sidBlockingDisallowed` error. The console script runs to completion in a single blocking call (`UpdateVM(-1)`). If you need enumeration loops, use `inst` mode.
* **Single Execution Context:** Each command execution runs in a completely fresh Virtual Machine instance. Because of this, local variables (`va00`–`va99`) **do not persist** between command executions.

### Under the Hood: [`POST /api/execute`](api_reference.md)

When you submit a command in the Console, the request is sent to `POST /api/execute`. The embedded `DebugServer` queues the execution on the main thread via a `WorkItem`.

1. The raw text is passed to the engine's internal compiler (`Orderiser::OrderFromCAOS`).
2. The resulting `MacroScript` is handed to a brand new `CAOSMachine` instantiated purely for this single execution.
3. The VM is started using `StartScriptExecuting(macro, NULLHANDLE, NULLHANDLE, INTEGERZERO, INTEGERZERO)`. Passing `NULLHANDLE` ensures no agent is marked as the owner (`OWNR`).
4. The VM's output stream is redirected to a standard string stream to capture `outs`/`outv` commands.
5. The engine triggers a synchronous block execution via `vm.UpdateVM(-1)`.
6. Once execution finishes (or an exception is caught), the output stream and any errors are JSON-escaped and returned to the browser.

---

## See Also

* **[CAOS IDE](tab_caos_ide.md)** — For a richer editing experience with syntax highlighting, autocompletion, and breakpoint support.
* **[Scripts](tab_scripts.md)** — To see what CAOS scripts are currently running across all agents.
* **[API Reference](api_reference.md)** — Full endpoint documentation for `POST /api/execute`.
