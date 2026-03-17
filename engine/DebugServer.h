// -------------------------------------------------------------------------
// Filename:    DebugServer.h
// Class:       DebugServer
// Purpose:     Embedded HTTP + WebSocket server for browser-based dev tools
// Description:
//   Activated via --tools flag. Serves the tools/ browser UI and provides:
//     - Static file serving at /
//     - WebSocket at /ws for live log streaming (replaces relay.js)
//     - REST API at /api/* for CAOS execution, script inspection, etc.
//
//   The HTTP server runs in a background thread. Requests that touch engine
//   state are queued and processed on the main thread via Poll().
//
// Usage:
//   theDebugServer.Start(9980, "tools/");
//   // in main loop: theDebugServer.Poll();
//   theDebugServer.Stop();
// -------------------------------------------------------------------------
#ifndef DEBUGSERVER_H
#define DEBUGSERVER_H

#include <string>

class DebugServer {
public:
	DebugServer();
	~DebugServer();

	// Start the server on the given port, serving static files from staticDir.
	void Start(int port, const std::string& staticDir);

	// Process pending work items on the main thread.
	// Call this once per game tick from the main loop.
	void Poll();

	// Stop the server and join the background thread.
	void Stop();

	bool IsRunning() const;

private:
	struct Impl;
	Impl* myImpl;
};

// Global singleton — mirrors theFlightRecorder pattern.
extern DebugServer theDebugServer;

#endif // DEBUGSERVER_H
