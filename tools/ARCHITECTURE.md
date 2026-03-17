# Developer Tools — Architecture

## Overview

The developer tools are an embedded HTTP/WebSocket server inside the `lc2e` binary, activated by `--tools`. No external dependencies (Node.js, relay scripts) are needed.

```
┌─────────────────────────────────────────────────────────┐
│                     lc2e binary                         │
│                                                         │
│  ┌──────────────┐        ┌────────────────────────┐     │
│  │ FlightRecorder├──UDP──►│     DebugServer        │     │
│  │  (logging)    │  9999  │  ┌──────────────────┐  │     │
│  └──────────────┘        │  │ httplib::Server   │  │     │
│                          │  │ (background thread)│  │     │
│  ┌──────────────┐        │  └────────┬─────────┘  │     │
│  │  Main Loop   │◄──Poll─┤           │            │     │
│  │  (game tick)  │        │  Work Queue           │     │
│  └──────────────┘        └────────────────────────┘     │
│                                 │                       │
└─────────────────────────────────┼───────────────────────┘
                                  │ port 9980
                           ┌──────▼──────┐
                           │   Browser   │
                           │  (tools UI) │
                           └─────────────┘
```

## Threading Model

1. **httplib::Server** runs in a background `std::thread`, handling HTTP requests and serving static files.
2. **API handlers** that touch engine state (CAOS execution, agent queries) push `WorkItem` objects onto a `std::queue` protected by `std::mutex`.
3. **`Poll()`** is called once per game tick from the main loop. It drains the queue, executes each work item on the main thread, and sets the result via `std::promise`.
4. **HTTP handlers** block (via `std::future::wait_for`) until Poll() processes their request, with a 10-second timeout.

## Key Files

| File | Purpose |
|---|---|
| `engine/DebugServer.h` | Header — Start/Poll/Stop API |
| `engine/DebugServer.cpp` | Implementation — HTTP routes, work queue, UDP relay |
| `engine/contrib/httplib.h` | Vendored cpp-httplib (MIT) |
| `engine/Display/SDL/SDL_Main.cpp` | `--tools` flag handling, Poll() integration |
| `tools/index.html` | UI shell with tab navigation |
| `tools/app.js` | Log tab + WebSocket + tab switching |
| `tools/debugger.js` | CAOS Console tab |
| `tools/scripts.js` | Scripts tab |
| `tools/style.css` | Bright-Fi design system |

## Adding New Tools

1. Add a new `<div id="tab-newtool" class="tab-panel" hidden>` in `index.html`
2. Add a `<button class="tab-btn" data-tab="newtool">` in the tab nav
3. Create `newtool.js` with the UI logic
4. If you need an API endpoint, add it in `DebugServer.cpp` — use the work queue pattern for anything that touches engine state
