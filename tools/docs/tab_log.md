# Log Tab

The **Log** tab provides a real-time stream of engine log messages via Server-Sent Events (SSE). It replaces older relay setups with a zero-dependency, highly-performant embedded solution.

![Log Tab](/docs/media/tab_log.png)

## Features

The log stream provides several features designed for high readability and easy troubleshooting:

* **Live Streaming:** Log messages appear instantaneously as the engine produces them, ensuring sub-second latency.
* **Category Filtering:** Use the sidebar checkboxes to toggle the visibility of specific categories:
  * **Errors (Red):** Runtime errors and assertion failures.
  * **Shutdown (Orange):** Engine shutdown sequence events.
  * **Network (Blue):** Network and socket activity.
  * **World (Green):** World loading, saving, and creation events.
  * **CAOS (Purple):** CAOS script activity.
  * **Sound (Teal):** Audio system messages.
  * **Crash (Magenta):** Crash reports and signal handler output.
  * **Other (Grey):** Uncategorized general messages.
* **Text Search:** Quickly filter the currently buffered messages by content using the search box.
* **Pause / Resume:** Temporarily freeze the rendering of new messages to inspect the current view. While paused, the engine continues to buffer new messages, which are instantly flushed to the UI upon resuming.
* **Copy:** Easily copy all currently visible (filtered) log lines to your clipboard.
* **Export:** Download the entire stored log history as a `.txt` file.

### Under the Hood: Log Streaming Architecture

The engine uses a global singleton called `theFlightRecorder` (`engine/FlightRecorder.cpp`) to emit log messages. Whenever code calls `theFlightRecorder.Log(category, message)`, it formats the message and broadcasts it locally via UDP on port `9999`. 

The `DebugServer` runs a dedicated `UDPRelayLoop` background thread that listens to this UDP port. When it receives a datagram, it pushes the string into a thread-safe `std::deque<std::string>` buffer (capped at 5000 messages) and signals a condition variable (`logCV`).

When you open the Log tab, the browser establishes an HTTP connection to the `/api/logs/stream` endpoint. The `DebugServer` holds this HTTP connection open indefinitely, waiting on the condition variable. As soon as the UDP thread pushes a new message, the server wakes up and flushes the message down the socket in Server-Sent Events (SSE) format (`data: ... \n\n`). This decoupled architecture ensures that engine logging remains completely non-blocking, even if the browser struggles to render thousands of lines.

## Display Options

Customize how the log messages are displayed using the toolbar toggles:

* **Timestamps:** Show or hide relative timestamps for each log entry.
* **Auto-scroll:** Automatically scroll the view to the latest message as new logs arrive.
* **Compact rows:** Reduce the row height of log entries to fit more lines on the screen simultaneously.

## Visual Cues

To aid in quick scanning, messages are colour-coded by category with a left border indicator and a category badge (e.g., `ERR`, `NET`, `WRLD`). Critical messages, such as errors and crash reports, are rendered with a tinted background to ensure they stand out.

*For details on interacting with the engine programmatically via the underlying API, check the [API Reference](api_reference.md).*
