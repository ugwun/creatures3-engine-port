# Developer Tools

Browser-based developer tools for the Creatures 3 engine, served directly from the `lc2e` binary.

## Quick Start

```bash
./build/lc2e -d "/path/to/Docking Station" --tools
```

Open **http://localhost:9980** in your browser.

## Tabs

### Log
Live engine log stream via WebSocket. Features:
- Category filtering (Errors, Network, World, CAOS, Sound, Crash)
- Text search, pause/resume, copy, export
- Auto-scroll, timestamps, compact mode

### Console
Interactive CAOS REPL. Type commands and see output immediately.
- `outs "hello"` → `hello`
- `outv 2 + 3` → `5`
- ↑/↓ for command history, Shift+Enter for multi-line

### Scripts
Table of all currently running CAOS scripts across all agents.
- Auto-refreshes every 2 seconds
- Shows Agent ID, Classifier, State, IP, and current source line

## CLI Options

| Flag | Description |
|---|---|
| `--tools` | Start the dev tools server on port 9980 |
| `--tools /path/to/tools` | Override the tools directory path |

The tools server has **zero impact** when `--tools` is not passed.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET /` | Static files from `tools/` directory |
| `POST /api/execute` | Execute CAOS code (JSON body: `{"caos":"..."}`) |
| `GET /api/scripts` | List running scripts |
| `GET /api/scriptorium` | List installed scripts |
| `GET /api/agent/:id` | Agent details + VM state |
| `WS /ws` | Live log stream (WebSocket) |