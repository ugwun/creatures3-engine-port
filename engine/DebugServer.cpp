// -------------------------------------------------------------------------
// Filename:    DebugServer.cpp
// Class:       DebugServer
// Purpose:     Embedded HTTP + WebSocket dev tools server
// Description:
//   Implements the --tools server: static file serving, CAOS REPL API,
//   script inspection, and live log stream via WebSocket.
//
//   Threading model:
//     - httplib runs in a background thread
//     - Handlers that touch engine state (CAOS execution, agent queries)
//       push work items onto a thread-safe queue
//     - Poll() drains the queue on the main thread
//     - WebSocket log streaming uses a UDP listener that mirrors what
//       relay.js used to do — listens on 127.0.0.1:9999 for FlightRecorder
//       packets and rebroadcasts to connected WebSocket clients
// -------------------------------------------------------------------------

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "DebugServer.h"

// httplib must be included before engine headers to avoid macro conflicts.
// We define CPPHTTPLIB_OPENSSL_SUPPORT=0 to avoid pulling in OpenSSL.
#include "contrib/httplib.h"

#include "Agents/Agent.h"
#include "Agents/AgentHandle.h"
#include "AgentManager.h"
#include "App.h"
#include "C2eServices.h"
#include "Caos/CAOSMachine.h"
#include "Caos/CAOSVar.h"
#include "Caos/DebugInfo.h"
#include "Caos/MacroScript.h"
#include "Caos/Orderiser.h"
#include "Caos/Scriptorium.h"
#include "Classifier.h"
#include "World.h"

#include <arpa/inet.h>
#include <cstring>
#include <condition_variable>
#include <fcntl.h>
#include <functional>
#include <future>
#include <mutex>
#include <netinet/in.h>
#include <queue>
#include <set>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>
#include <vector>

// ── Minimal RFC 6455 WebSocket helpers ──────────────────────────────────────
// We only need server→client text frames for log streaming, plus the
// handshake. This avoids pulling in a full WS library.

#include <CommonCrypto/CommonDigest.h>  // CC_SHA1 (macOS native, no OpenSSL needed)


// Base64 encode (small, self-contained)
static std::string Base64Encode(const unsigned char* data, size_t len) {
	static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	std::string r;
	r.reserve(4 * ((len + 2) / 3));
	for (size_t i = 0; i < len; i += 3) {
		unsigned int b = (data[i] << 16) |
			(i + 1 < len ? data[i + 1] << 8 : 0) |
			(i + 2 < len ? data[i + 2] : 0);
		r += t[(b >> 18) & 0x3F];
		r += t[(b >> 12) & 0x3F];
		r += (i + 1 < len) ? t[(b >> 6) & 0x3F] : '=';
		r += (i + 2 < len) ? t[b & 0x3F] : '=';
	}
	return r;
}

// ── JSON escaping ──────────────────────────────────────────────────────────
static std::string JsonEscape(const std::string& s) {
	std::string out;
	out.reserve(s.size() + 16);
	for (char c : s) {
		switch (c) {
		case '"':  out += "\\\""; break;
		case '\\': out += "\\\\"; break;
		case '\n': out += "\\n";  break;
		case '\r': out += "\\r";  break;
		case '\t': out += "\\t";  break;
		default:
			if (static_cast<unsigned char>(c) < 0x20) {
				char buf[8];
				snprintf(buf, sizeof(buf), "\\u%04x", (unsigned)c);
				out += buf;
			} else {
				out += c;
			}
		}
	}
	return out;
}

// ── WebSocket client tracking ──────────────────────────────────────────────
struct WSClient {
	int fd;
};

// ── Work queue item ────────────────────────────────────────────────────────
struct WorkItem {
	std::function<std::string()> work;
	std::promise<std::string> promise;
};

// ── DebugServer::Impl ──────────────────────────────────────────────────────
struct DebugServer::Impl {
	httplib::Server svr;
	std::thread serverThread;
	bool running = false;

	// WebSocket clients
	std::mutex wsMutex;
	std::set<int> wsClients;  // socket fds

	// UDP listener for FlightRecorder rebroadcast
	int udpSocket = -1;
	std::thread udpThread;
	bool udpRunning = false;

	// Work queue for main-thread execution
	std::mutex queueMutex;
	std::queue<WorkItem*> workQueue;

	std::string staticDir;
	int port = 9980;

	// ── WebSocket frame sending ────────────────────────────────────────
	void SendWSFrame(int fd, const std::string& text) {
		// Build a text frame (opcode 0x81)
		std::vector<unsigned char> frame;
		frame.push_back(0x81); // FIN + text opcode
		size_t len = text.size();
		if (len < 126) {
			frame.push_back((unsigned char)len);
		} else if (len < 65536) {
			frame.push_back(126);
			frame.push_back((unsigned char)((len >> 8) & 0xFF));
			frame.push_back((unsigned char)(len & 0xFF));
		} else {
			frame.push_back(127);
			for (int i = 7; i >= 0; --i)
				frame.push_back((unsigned char)((len >> (8 * i)) & 0xFF));
		}
		frame.insert(frame.end(), text.begin(), text.end());
		// Non-blocking send — drop if it would block
		send(fd, frame.data(), frame.size(), MSG_DONTWAIT);
	}

	void BroadcastWS(const std::string& text) {
		std::lock_guard<std::mutex> lock(wsMutex);
		std::vector<int> dead;
		for (int fd : wsClients) {
			// Try to send; if it fails, mark for removal
			std::vector<unsigned char> frame;
			frame.push_back(0x81);
			size_t len = text.size();
			if (len < 126) {
				frame.push_back((unsigned char)len);
			} else if (len < 65536) {
				frame.push_back(126);
				frame.push_back((unsigned char)((len >> 8) & 0xFF));
				frame.push_back((unsigned char)(len & 0xFF));
			} else {
				frame.push_back(127);
				for (int i = 7; i >= 0; --i)
					frame.push_back((unsigned char)((len >> (8 * i)) & 0xFF));
			}
			frame.insert(frame.end(), text.begin(), text.end());
			ssize_t n = send(fd, frame.data(), frame.size(), MSG_DONTWAIT);
			if (n < 0) {
				dead.push_back(fd);
			}
		}
		for (int fd : dead) {
			wsClients.erase(fd);
			close(fd);
		}
	}

	// ── UDP → WS relay thread ──────────────────────────────────────────
	void UDPRelayLoop() {
		char buf[16384];
		while (udpRunning) {
			struct sockaddr_in from;
			socklen_t fromLen = sizeof(from);
			ssize_t n = recvfrom(udpSocket, buf, sizeof(buf) - 1, 0,
				(struct sockaddr*)&from, &fromLen);
			if (n > 0) {
				buf[n] = '\0';
				// Trim trailing whitespace
				while (n > 0 && (buf[n-1] == '\n' || buf[n-1] == '\r'))
					buf[--n] = '\0';
				if (n > 0) {
					BroadcastWS(std::string(buf, n));
				}
			} else if (n < 0) {
				// EAGAIN/EWOULDBLOCK is fine — just means no data
				if (errno != EAGAIN && errno != EWOULDBLOCK) {
					usleep(10000); // brief sleep on real errors
				} else {
					usleep(5000); // 5ms poll interval
				}
			}
		}
	}

	// ── WebSocket handshake via raw socket ──────────────────────────────
	// httplib doesn't support WS natively, so we intercept the /ws route
	// and do the upgrade ourselves. This is called from the GET /ws handler
	// which has access to the raw socket.
	bool DoWSHandshake(int fd, const std::string& wsKey) {
		// Compute accept key per RFC 6455:
		// SHA1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"), Base64
		std::string concat = wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
		unsigned char hash[CC_SHA1_DIGEST_LENGTH];
		CC_SHA1(concat.c_str(), (CC_LONG)concat.size(), hash);
		std::string accept = Base64Encode(hash, CC_SHA1_DIGEST_LENGTH);

		std::string response =
			"HTTP/1.1 101 Switching Protocols\r\n"
			"Upgrade: websocket\r\n"
			"Connection: Upgrade\r\n"
			"Sec-WebSocket-Accept: " + accept + "\r\n"
			"\r\n";
		send(fd, response.c_str(), response.size(), 0);
		return true;
	}
};

// ── Global singleton ───────────────────────────────────────────────────────
DebugServer theDebugServer;

// ── Constructor / Destructor ───────────────────────────────────────────────
DebugServer::DebugServer() : myImpl(nullptr) {}
DebugServer::~DebugServer() { Stop(); }

bool DebugServer::IsRunning() const {
	return myImpl && myImpl->running;
}

// ── Start ──────────────────────────────────────────────────────────────────
void DebugServer::Start(int port, const std::string& staticDir) {
	if (myImpl) return; // already running
	myImpl = new Impl();
	myImpl->port = port;
	myImpl->staticDir = staticDir;

	// ── Static file serving ────────────────────────────────────────────
	myImpl->svr.set_mount_point("/", staticDir.c_str());

	// ── CORS headers for local dev ─────────────────────────────────────
	myImpl->svr.set_default_headers({
		{"Access-Control-Allow-Origin", "*"},
		{"Access-Control-Allow-Methods", "GET, POST, OPTIONS"},
		{"Access-Control-Allow-Headers", "Content-Type"}
	});

	// ── POST /api/execute ──────────────────────────────────────────────
	// Compiles and executes CAOS code. Must run on main thread.
	myImpl->svr.Post("/api/execute", [this](const httplib::Request& req, httplib::Response& res) {
		// Parse the body — expect { "caos": "..." } or raw CAOS text
		std::string caos = req.body;
		// Try to extract from JSON if it looks like JSON
		if (!caos.empty() && caos[0] == '{') {
			// Simple JSON parsing for {"caos":"..."}
			size_t start = caos.find("\"caos\"");
			if (start != std::string::npos) {
				start = caos.find('"', start + 6);
				if (start != std::string::npos) {
					start++;
					std::string val;
					for (size_t i = start; i < caos.size(); ++i) {
						if (caos[i] == '\\' && i + 1 < caos.size()) {
							char next = caos[i + 1];
							if (next == '"') { val += '"'; ++i; }
							else if (next == '\\') { val += '\\'; ++i; }
							else if (next == 'n') { val += '\n'; ++i; }
							else if (next == 'r') { val += '\r'; ++i; }
							else if (next == 't') { val += '\t'; ++i; }
							else { val += caos[i]; }
						} else if (caos[i] == '"') {
							break;
						} else {
							val += caos[i];
						}
					}
					caos = val;
				}
			}
		}

		// Queue work for main thread
		auto* item = new WorkItem();
		item->work = [caos]() -> std::string {
			std::ostringstream out;
			bool ok = true;
			std::string error;

			try {
				Orderiser o;
				MacroScript* m = o.OrderFromCAOS(caos.c_str());
				if (m) {
					try {
						CAOSMachine vm;
						vm.StartScriptExecuting(m, NULLHANDLE, NULLHANDLE,
							INTEGERZERO, INTEGERZERO);
						vm.SetOutputStream(&out);
						vm.UpdateVM(-1);
					} catch (CAOSMachine::RunError& e) {
						ok = false;
						std::ostringstream errStream;
						errStream << e.what();
						error = errStream.str();
					}
					delete m;
				} else {
					ok = false;
					error = o.GetLastError();
				}
			} catch (std::exception& e) {
				ok = false;
				error = e.what();
			} catch (...) {
				ok = false;
				error = "Unknown error during CAOS execution";
			}

			std::string output = out.str();
			return "{\"ok\":" + std::string(ok ? "true" : "false") +
				",\"output\":\"" + JsonEscape(output) +
				"\",\"error\":\"" + JsonEscape(error) + "\"}";
		};

		auto future = item->promise.get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}

		// Wait for main thread to process (timeout 10s)
		if (future.wait_for(std::chrono::seconds(10)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"output\":\"\",\"error\":\"Timeout waiting for main thread\"}", "application/json");
		}
	});

	// ── GET /api/scripts ───────────────────────────────────────────────
	// Lists all currently running scripts across all agents.
	myImpl->svr.Get("/api/scripts", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "[";
			bool first = true;

			AgentMap& agentMap = AgentManager::GetAgentIDMap();
			for (AgentMapIterator it = agentMap.begin(); it != agentMap.end(); ++it) {
				AgentHandle& handle = it->second->IsValid() ? *(it->second) : NULLHANDLE;
				if (handle.IsInvalid()) continue;

				Agent& agent = handle.GetAgentReference();
				CAOSMachine& vm = agent.GetVirtualMachine();

				if (!vm.IsRunning()) continue;

				MacroScript* macro = vm.GetScript();
				if (!macro) continue;

				Classifier c;
				macro->GetClassifier(c);

				std::string state;
				if (vm.IsBlocking()) state = "blocking";
				else state = "running";

				// Get source line at current IP
				std::string sourceLine;
				DebugInfo* di = macro->GetDebugInfo();
				if (di) {
					std::string src;
					di->GetSourceCode(src);
					int pos = di->MapAddressToSource(vm.GetIP());
					// Extract the line around pos
					int lineStart = pos;
					while (lineStart > 0 && src[lineStart - 1] != '\n') --lineStart;
					int lineEnd = pos;
					while (lineEnd < (int)src.size() && src[lineEnd] != '\n') ++lineEnd;
					sourceLine = src.substr(lineStart, lineEnd - lineStart);
					// Trim
					size_t trim = sourceLine.find_first_not_of(" \t");
					if (trim != std::string::npos) sourceLine = sourceLine.substr(trim);
				}

				if (!first) json << ",";
				first = false;
				json << "{\"agentId\":" << agent.GetUniqueID()
					<< ",\"family\":" << (int)c.Family()
					<< ",\"genus\":" << (int)c.Genus()
					<< ",\"species\":" << (int)c.Species()
					<< ",\"event\":" << (int)c.Event()
					<< ",\"state\":\"" << state << "\""
					<< ",\"ip\":" << vm.GetIP()
					<< ",\"source\":\"" << JsonEscape(sourceLine) << "\""
					<< "}";
			}

			json << "]";
			return json.str();
		};

		auto future = item->promise.get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}

		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("[]", "application/json");
		}
	});

	// ── GET /api/scriptorium ───────────────────────────────────────────
	// Lists all installed scripts in the scriptorium.
	myImpl->svr.Get("/api/scriptorium", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "[";
			bool first = true;

			try {
				Scriptorium& scrip = theApp.GetWorld().GetScriptorium();
				IntegerSet families;
				scrip.DumpFamilyIDs(families);

				for (int f : families) {
					IntegerSet genuses;
					scrip.DumpGenusIDs(genuses, f);
					for (int g : genuses) {
						IntegerSet species;
						scrip.DumpSpeciesIDs(species, f, g);
						for (int s : species) {
							IntegerSet events;
							scrip.DumpEventIDs(events, f, g, s);
							for (int e : events) {
								if (!first) json << ",";
								first = false;
								json << "{\"family\":" << f
									<< ",\"genus\":" << g
									<< ",\"species\":" << s
									<< ",\"event\":" << e << "}";
							}
						}
					}
				}
			} catch (...) {
				// If no world loaded, return empty
			}

			json << "]";
			return json.str();
		};

		auto future = item->promise.get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}

		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("[]", "application/json");
		}
	});

	// ── GET /api/agent/:id ─────────────────────────────────────────────
	// Returns details about a specific agent and its VM state.
	myImpl->svr.Get(R"(/api/agent/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);

		auto* item = new WorkItem();
		item->work = [agentId]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid()) {
				return "{\"error\":\"Agent not found\"}";
			}

			Agent& agent = handle.GetAgentReference();
			CAOSMachine& vm = agent.GetVirtualMachine();
			Classifier c = agent.GetClassifier();

			std::ostringstream stateStream;
			if (vm.IsRunning()) {
				vm.DumpState(stateStream, '\n');
			}

			std::ostringstream json;
			json << "{\"id\":" << agent.GetUniqueID()
				<< ",\"family\":" << (int)c.Family()
				<< ",\"genus\":" << (int)c.Genus()
				<< ",\"species\":" << (int)c.Species()
				<< ",\"running\":" << (vm.IsRunning() ? "true" : "false")
				<< ",\"blocking\":" << (vm.IsBlocking() ? "true" : "false")
				<< ",\"vmState\":\"" << JsonEscape(stateStream.str()) << "\""
				<< "}";
			return json.str();
		};

		auto future = item->promise.get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}

		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── Start UDP listener for log relay ───────────────────────────────
	myImpl->udpSocket = socket(AF_INET, SOCK_DGRAM, 0);
	if (myImpl->udpSocket >= 0) {
		// Set non-blocking for clean shutdown
		int flags = fcntl(myImpl->udpSocket, F_GETFL, 0);
		if (flags >= 0) fcntl(myImpl->udpSocket, F_SETFL, flags | O_NONBLOCK);

		struct sockaddr_in addr;
		memset(&addr, 0, sizeof(addr));
		addr.sin_family = AF_INET;
		addr.sin_port = htons(9999);
		inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

		if (bind(myImpl->udpSocket, (struct sockaddr*)&addr, sizeof(addr)) == 0) {
			myImpl->udpRunning = true;
			myImpl->udpThread = std::thread(&Impl::UDPRelayLoop, myImpl);
		} else {
			fprintf(stderr, "[DebugServer] WARNING: Could not bind UDP port 9999 (FlightRecorder relay may be running separately)\n");
			close(myImpl->udpSocket);
			myImpl->udpSocket = -1;
		}
	}

	// ── Start HTTP server in background thread ─────────────────────────
	myImpl->running = true;
	myImpl->serverThread = std::thread([this, port]() {
		myImpl->svr.listen("0.0.0.0", port);
	});

	fprintf(stderr, "[lc2e] Developer tools: http://localhost:%d/\n", port);
}

// ── Poll ───────────────────────────────────────────────────────────────────
void DebugServer::Poll() {
	if (!myImpl) return;

	// Drain the work queue on the main thread
	while (true) {
		WorkItem* item = nullptr;
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			if (myImpl->workQueue.empty()) break;
			item = myImpl->workQueue.front();
			myImpl->workQueue.pop();
		}
		if (item) {
			try {
				std::string result = item->work();
				item->promise.set_value(result);
			} catch (std::exception& e) {
				item->promise.set_value(
					std::string("{\"ok\":false,\"output\":\"\",\"error\":\"") +
					JsonEscape(e.what()) + "\"}");
			} catch (...) {
				item->promise.set_value(
					"{\"ok\":false,\"output\":\"\",\"error\":\"Unknown exception in main thread\"}");
			}
			delete item;
		}
	}
}

// ── Stop ───────────────────────────────────────────────────────────────────
void DebugServer::Stop() {
	if (!myImpl) return;

	// Stop UDP relay
	myImpl->udpRunning = false;
	if (myImpl->udpSocket >= 0) {
		close(myImpl->udpSocket);
		myImpl->udpSocket = -1;
	}
	if (myImpl->udpThread.joinable())
		myImpl->udpThread.join();

	// Stop HTTP server
	myImpl->svr.stop();
	if (myImpl->serverThread.joinable())
		myImpl->serverThread.join();

	// Close any remaining WebSocket clients
	{
		std::lock_guard<std::mutex> lock(myImpl->wsMutex);
		for (int fd : myImpl->wsClients) {
			close(fd);
		}
		myImpl->wsClients.clear();
	}

	myImpl->running = false;
	delete myImpl;
	myImpl = nullptr;

	fprintf(stderr, "[lc2e] Developer tools stopped.\n");
}
