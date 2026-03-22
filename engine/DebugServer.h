// -------------------------------------------------------------------------
// Filename:    DebugServer.h
// Class:       DebugServer
// Purpose:     Embedded HTTP server for browser-based dev tools and MCP API
// Description:
//   Activated via --tools or --mcp flag. Provides:
//     - REST API at /api/* for CAOS execution, agent/creature queries, etc.
//     - (--tools only) Static file serving at / for the browser dev tools UI
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

	// Start the server in API-only mode (no static file serving).
	// Used by --mcp to expose the REST API without the browser UI.
	void Start(int port);

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
