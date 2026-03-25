// -------------------------------------------------------------------------
// Filename:    DebugServer.cpp
// Class:       DebugServer
// Purpose:     Embedded HTTP + SSE dev tools server
// Description:
//   Implements the --tools server: static file serving, CAOS REPL API,
//   script inspection, and live log stream via Server-Sent Events (SSE).
//
//   Threading model:
//     - httplib runs in a background thread
//     - Handlers that touch engine state (CAOS execution, agent queries)
//       push work items onto a thread-safe queue
//     - Poll() drains the queue on the main thread
//     - SSE log streaming uses a UDP listener that mirrors what
//       relay.js used to do — listens on 127.0.0.1:9999 for FlightRecorder
//       packets and buffers them for SSE clients
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
#include "Caos/CAOSTables.h"
#include "Classifier.h"
#include "Creature/Creature.h"
#include "Creature/Biochemistry/Biochemistry.h"
#include "Creature/Biochemistry/Organ.h"
#include "Creature/Brain/Brain.h"
#include "Creature/Brain/BrainConstants.h"
#include "Creature/Brain/Dendrite.h"
#include "Creature/Brain/Lobe.h"
#include "Creature/Brain/Neuron.h"
#include "Creature/Brain/Tract.h"
#include "Creature/Brain/BrainScriptFunctions.h"
#include "Creature/CreatureConstants.h"
#include "Creature/LifeFaculty.h"
#include "Creature/LinguisticFaculty.h"
#include "Creature/SensoryFaculty.h"
#include "World.h"

#include <arpa/inet.h>
#include <algorithm>
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

// Engine pause flag — defined in SDL_Main.cpp
extern void SetEnginePaused(bool paused);
extern bool IsEnginePaused();



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

	// SSE log buffer — UDP relay pushes here, SSE clients drain from here
	std::mutex logMutex;
	std::condition_variable logCV;
	std::deque<std::string> logBuffer;
	static const size_t MAX_LOG_BUFFER = 5000;

	// UDP listener for FlightRecorder rebroadcast
	int udpSocket = -1;
	std::thread udpThread;
	bool udpRunning = false;

	// Work queue for main-thread execution
	std::mutex queueMutex;
	std::queue<WorkItem*> workQueue;

	std::string staticDir;
	int port = 9980;

	// ── Push a log line into the SSE buffer ──────────────────────────────
	void PushLog(const std::string& line) {
		std::lock_guard<std::mutex> lock(logMutex);
		logBuffer.push_back(line);
		while (logBuffer.size() > MAX_LOG_BUFFER)
			logBuffer.pop_front();
		logCV.notify_all();
	}

	// ── UDP → SSE relay thread ────────────────────────────────────────
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
					PushLog(std::string(buf, n));
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
};

// ── Global singleton ───────────────────────────────────────────────────────
DebugServer theDebugServer;

// ── Constructor / Destructor ───────────────────────────────────────────────
DebugServer::DebugServer() : myImpl(nullptr) {}
DebugServer::~DebugServer() { Stop(); }

bool DebugServer::IsRunning() const {
	return myImpl && myImpl->running;
}

// ── Start (with static file serving — used by --tools) ────────────────────
void DebugServer::Start(int port, const std::string& staticDir) {
	if (myImpl) return; // already running
	myImpl = new Impl();
	myImpl->port = port;
	myImpl->staticDir = staticDir;

	// ── Static file serving ────────────────────────────────────────────
	if (!staticDir.empty()) {
		myImpl->svr.set_mount_point("/", staticDir.c_str());
	}

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
				if (vm.IsAtBreakpoint()) state = "paused";
				else if (vm.IsBlocking()) state = "blocking";
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

				std::string galleryName;
				try { galleryName = agent.GetGalleryName(); } catch (...) {}

				Classifier agentClass = agent.GetClassifier();

				json << "{\"agentId\":" << agent.GetUniqueID()
					<< ",\"family\":" << (int)c.Family()
					<< ",\"genus\":" << (int)c.Genus()
					<< ",\"species\":" << (int)c.Species()
					<< ",\"event\":" << (int)c.Event()
					<< ",\"state\":\"" << state << "\""
					<< ",\"ip\":" << vm.GetIP()
					<< ",\"source\":\"" << JsonEscape(sourceLine) << "\""
					<< ",\"gallery\":\"" << JsonEscape(galleryName) << "\""
					<< ",\"agentFamily\":" << (int)agentClass.Family()
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

	// ── GET /api/scriptorium/:f/:g/:s/:e ──────────────────────────────
	// Returns the source code of a specific scriptorium script.
	myImpl->svr.Get(R"(/api/scriptorium/(\d+)/(\d+)/(\d+)/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int f = std::stoi(req.matches[1]);
		int g = std::stoi(req.matches[2]);
		int s = std::stoi(req.matches[3]);
		int e = std::stoi(req.matches[4]);

		auto* item = new WorkItem();
		item->work = [f, g, s, e]() -> std::string {
			try {
				Scriptorium& scrip = theApp.GetWorld().GetScriptorium();
				Classifier c(f, g, s, e);
				MacroScript* script = scrip.FindScriptExact(c);
				if (!script) {
					return "{\"error\":\"Script not found\"}";
				}

				DebugInfo* di = script->GetDebugInfo();
				if (!di) {
					return "{\"error\":\"No source available\"}";
				}

				std::string src;
				di->GetSourceCode(src);
				return "{\"source\":\"" + JsonEscape(src) + "\"}";
			} catch (...) {
				return "{\"error\":\"Failed to retrieve script\"}";
			}
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

	// ── POST /api/scriptorium/inject ──────────────────────────────────
	// Compiles CAOS source and installs it in the scriptorium.
	// Body: { "family": N, "genus": N, "species": N, "event": N, "source": "..." }
	myImpl->svr.Post("/api/scriptorium/inject", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;

		// Simple JSON parsing for classifier + source
		auto parseIntField = [&](const char* field) -> int {
			size_t pos = body.find(std::string("\"") + field + "\"");
			if (pos == std::string::npos) return 0;
			pos = body.find(':', pos);
			if (pos == std::string::npos) return 0;
			return std::stoi(body.substr(pos + 1));
		};

		int f = parseIntField("family");
		int g = parseIntField("genus");
		int s = parseIntField("species");
		int e = parseIntField("event");

		// Parse "source" string field
		std::string source;
		size_t pos = body.find("\"source\"");
		if (pos != std::string::npos) {
			pos = body.find('"', pos + 8);
			if (pos != std::string::npos) {
				pos++;
				for (size_t i = pos; i < body.size(); ++i) {
					if (body[i] == '\\' && i + 1 < body.size()) {
						char next = body[i + 1];
						if (next == '"') { source += '"'; ++i; }
						else if (next == '\\') { source += '\\'; ++i; }
						else if (next == 'n') { source += '\n'; ++i; }
						else if (next == 'r') { source += '\r'; ++i; }
						else if (next == 't') { source += '\t'; ++i; }
						else { source += body[i]; }
					} else if (body[i] == '"') {
						break;
					} else {
						source += body[i];
					}
				}
			}
		}

		auto* item = new WorkItem();
		item->work = [f, g, s, e, source]() -> std::string {
			try {
				Orderiser o;
				MacroScript* m = o.OrderFromCAOS(source.c_str());
				if (!m) {
					return "{\"ok\":false,\"error\":\"" + JsonEscape(o.GetLastError()) + "\"}";
				}

				Classifier cls(f, g, s, e);
				m->SetClassifier(cls);

				if (!theApp.GetWorld().GetScriptorium().InstallScript(m)) {
					delete m;
					return "{\"ok\":false,\"error\":\"Failed to install — script may be locked\"}";
				}

				return "{\"ok\":true}";
			} catch (std::exception& ex) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(ex.what()) + "\"}";
			} catch (...) {
				return "{\"ok\":false,\"error\":\"Unknown error during injection\"}";
			}
		};

		auto future = item->promise.get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}

		if (future.wait_for(std::chrono::seconds(10)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── GET /api/agent-names ───────────────────────────────────────────
	// Returns a map of "family genus species" → human-readable agent name
	// by looking up "Agent Help F G S" tags in the Catalogue.
	myImpl->svr.Get("/api/agent-names", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "{";
			bool first = true;

			try {
				Scriptorium& scrip = theApp.GetWorld().GetScriptorium();
				std::set<std::string> seen; // avoid duplicate lookups

				IntegerSet families;
				scrip.DumpFamilyIDs(families);

				for (int f : families) {
					IntegerSet genuses;
					scrip.DumpGenusIDs(genuses, f);
					for (int g : genuses) {
						IntegerSet species;
						scrip.DumpSpeciesIDs(species, f, g);
						for (int s : species) {
							std::ostringstream keyStream;
							keyStream << f << " " << g << " " << s;
							std::string key = keyStream.str();

							if (seen.count(key)) continue;
							seen.insert(key);

							// Look up "Agent Help F G S" in the catalogue
							std::ostringstream tagStream;
							tagStream << "Agent Help " << f << " " << g << " " << s;
							std::string tag = tagStream.str();

							if (theCatalogue.TagPresent(tag)) {
								try {
									const char* name = theCatalogue.Get(tag, 0);
									if (name && name[0] != '\0') {
										if (!first) json << ",";
										first = false;
										json << "\"" << JsonEscape(key) << "\":\""
											<< JsonEscape(name) << "\"";
									}
								} catch (...) {
									// Skip entries that fail to resolve
								}
							}
						}
					}
				}
			} catch (...) {
				// If no world loaded, return empty
			}

			json << "}";
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
			res.set_content("{}", "application/json");
		}
	});

	// ── POST /api/validate ────────────────────────────────────────────
	// Compile CAOS code without executing it. Returns success or error
	// message + character position. Used for live syntax checking.
	myImpl->svr.Post("/api/validate", [this](const httplib::Request& req, httplib::Response& res) {
		// Parse body — same JSON extraction as /api/execute
		std::string caos = req.body;
		if (!caos.empty() && caos[0] == '{') {
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

		auto* item = new WorkItem();
		item->work = [caos]() -> std::string {
			try {
				Orderiser o;
				MacroScript* m = o.OrderFromCAOS(caos.c_str());
				if (m) {
					delete m;
					return "{\"ok\":true}";
				} else {
					return "{\"ok\":false,\"error\":\"" + JsonEscape(o.GetLastError()) +
						"\",\"position\":" + std::to_string(o.GetLastErrorPos()) + "}";
				}
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) +
					"\",\"position\":-1}";
			} catch (...) {
				return "{\"ok\":false,\"error\":\"Unknown error during validation\",\"position\":-1}";
			}
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
			res.set_content("{\"ok\":false,\"error\":\"Timeout\",\"position\":-1}", "application/json");
		}
	});

	// ── POST /api/compile-map ─────────────────────────────────────────
	// Compile CAOS code and return the address→source position map.
	// Used by the IDE to map source line numbers to bytecode IPs for breakpoints.
	// Body: { "caos": "..." }
	// Returns: { "ok": true, "map": { "0": 0, "5": 12, ... } } or error
	myImpl->svr.Post("/api/compile-map", [this](const httplib::Request& req, httplib::Response& res) {
		// Parse body — same JSON extraction as /api/validate
		std::string caos = req.body;
		if (!caos.empty() && caos[0] == '{') {
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

		auto* item = new WorkItem();
		item->work = [caos]() -> std::string {
			try {
				Orderiser o;
				MacroScript* m = o.OrderFromCAOS(caos.c_str());
				if (!m) {
					return "{\"ok\":false,\"error\":\"" + JsonEscape(o.GetLastError()) + "\"}";
				}

				// Extract the address map from the compiled script's debug info
				DebugInfo* di = m->GetDebugInfo();
				std::ostringstream json;
				json << "{\"ok\":true,\"map\":{";

				if (di) {
					const std::map<int, int>& addrMap = di->GetAddressMap();
					bool first = true;
					for (auto& pair : addrMap) {
						if (!first) json << ",";
						first = false;
						json << "\"" << pair.first << "\":" << pair.second;
					}
				}

				json << "}}";
				delete m;
				return json.str();
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			} catch (...) {
				return "{\"ok\":false,\"error\":\"Unknown error during compilation\"}";
			}
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
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── GET /api/caos-commands ─────────────────────────────────────────
	// Returns the full CAOS command dictionary for auto-complete.
	// Built from CAOSDescription::MakeGrandTable(). Cached on first call.
	myImpl->svr.Get("/api/caos-commands", [this](const httplib::Request& req, httplib::Response& res) {
		// Cache the response — command tables are static after engine init
		static std::string cachedResponse;
		static std::mutex cacheMutex;

		{
			std::lock_guard<std::mutex> lock(cacheMutex);
			if (!cachedResponse.empty()) {
				res.set_content(cachedResponse, "application/json");
				return;
			}
		}

		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "[";
			bool first = true;

			try {
				std::vector<OpSpec> grandTable;
				theCAOSDescription.MakeGrandTable(grandTable);
				std::sort(grandTable.begin(), grandTable.end(), OpSpec::CompareAlphabetic);

				std::string lastName;
				for (auto& op : grandTable) {
					const char* name = op.GetName();
					if (!name || name[0] == '\0') continue;

					// Skip undocumented commands
					std::string helpGeneral = op.GetHelpGeneral();
					if (helpGeneral == "X" || helpGeneral.empty()) continue;

					std::string prettyName = op.GetPrettyName();

					// Deduplicate — same name can appear in multiple tables
					// (e.g. as both command and rvalue)
					// We keep all entries since they have different types
					std::string typeStr = op.GetPrettyCommandTableString();

					// Strip HTML from help text for a clean one-line description
					std::string desc;
					for (size_t i = 0; i < helpGeneral.size(); ++i) {
						char ch = helpGeneral[i];
						if (ch == '<') {
							while (i < helpGeneral.size() && helpGeneral[i] != '>') ++i;
						} else if (ch == '@' || ch == '#') {
							// skip CAOS doc markers
						} else {
							desc += ch;
						}
					}
					// Trim to first sentence (up to first period followed by space, or 120 chars)
					size_t dotPos = desc.find(". ");
					if (dotPos != std::string::npos && dotPos < 150)
						desc = desc.substr(0, dotPos + 1);
					else if (desc.size() > 150)
						desc = desc.substr(0, 147) + "...";

					// Build parameter string from help parameters
					std::string params = op.GetHelpParameters();

					if (!first) json << ",";
					first = false;

					json << "{\"name\":\"" << JsonEscape(prettyName)
						<< "\",\"type\":\"" << JsonEscape(typeStr)
						<< "\",\"params\":\"" << JsonEscape(params)
						<< "\",\"description\":\"" << JsonEscape(desc) << "\"}";
				}
			} catch (...) {
				// If tables not loaded yet, return empty
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
			std::string result = future.get();
			{
				std::lock_guard<std::mutex> lock(cacheMutex);
				cachedResponse = result;
			}
			res.set_content(result, "application/json");
		} else {
			res.status = 504;
			res.set_content("[]", "application/json");
		}
	});

	// ── GET /api/agent/:id ─────────────────────────────────────────────
	// Returns full details about a specific agent, its VM state,
	// source code, breakpoints, and variables for the debugger view.
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

			std::ostringstream json;
			json << "{\"id\":" << agent.GetUniqueID()
				<< ",\"family\":" << (int)c.Family()
				<< ",\"genus\":" << (int)c.Genus()
				<< ",\"species\":" << (int)c.Species()
				<< ",\"running\":" << (vm.IsRunning() ? "true" : "false")
				<< ",\"blocking\":" << (vm.IsBlocking() ? "true" : "false")
				<< ",\"paused\":" << (vm.IsAtBreakpoint() ? "true" : "false")
				<< ",\"ip\":" << vm.GetIP()
				<< ",\"posx\":" << (int)agent.GetPosition().x
				<< ",\"posy\":" << (int)agent.GetPosition().y;

			// Source code and source position
			MacroScript* macro = vm.GetScript();
			if (macro) {
				Classifier mc;
				macro->GetClassifier(mc);
				json << ",\"scriptFamily\":" << (int)mc.Family()
					<< ",\"scriptGenus\":" << (int)mc.Genus()
					<< ",\"scriptSpecies\":" << (int)mc.Species()
					<< ",\"scriptEvent\":" << (int)mc.Event();

				DebugInfo* di = macro->GetDebugInfo();
				if (di) {
					std::string src;
					di->GetSourceCode(src);
					json << ",\"source\":\"" << JsonEscape(src) << "\"";
					int pos = di->MapAddressToSource(vm.GetIP());
					json << ",\"sourcePos\":" << pos;
				}
			}

			// Breakpoints
			const std::set<int>& bps = vm.GetBreakpoints();
			json << ",\"breakpoints\":[";
			bool firstBp = true;
			for (int bp : bps) {
				if (!firstBp) json << ",";
				firstBp = false;
				json << bp;
			}
			json << "]";

			// Context handles
			AgentHandle targ = vm.GetTarg();
			AgentHandle ownr = vm.GetOwner();
			AgentHandle from = vm.GetFrom();
			AgentHandle it = vm.GetIT();
			json << ",\"targ\":" << (targ.IsValid() ? targ.GetAgentReference().GetUniqueID() : 0)
				<< ",\"ownr\":" << (ownr.IsValid() ? ownr.GetAgentReference().GetUniqueID() : 0)
				<< ",\"from\":" << (from.IsValid() ? from.GetAgentReference().GetUniqueID() : 0)
				<< ",\"it\":" << (it.IsValid() ? it.GetAgentReference().GetUniqueID() : 0);

			// OV00–OV99 agent variables (only non-default)
			json << ",\"ov\":{";
			bool firstOv = true;
			for (int i = 0; i < GLOBAL_VARIABLE_COUNT; ++i) {
				CAOSVar& v = agent.GetReferenceToVariable(i);
				if (v.GetType() == CAOSVar::typeInteger && v.GetInteger() == 0) continue;
				if (!firstOv) json << ",";
				firstOv = false;
				json << "\"" << i << "\":";
				if (v.GetType() == CAOSVar::typeInteger)
					json << v.GetInteger();
				else if (v.GetType() == CAOSVar::typeFloat)
					json << v.GetFloat();
				else if (v.GetType() == CAOSVar::typeString) {
					std::string s; v.GetString(s);
					json << "\"" << JsonEscape(s) << "\"";
				}
				else if (v.GetType() == CAOSVar::typeAgent && v.GetAgent().IsValid())
					json << v.GetAgent().GetAgentReference().GetUniqueID();
				else
					json << "0";
			}
			json << "}";

			// VA00–VA99 local variables (only non-default)
			json << ",\"va\":{";
			bool firstVa = true;
			int vaCount = CAOSMachine::GetLocalVariableCount();
			for (int i = 0; i < vaCount; ++i) {
				CAOSVar& v = vm.GetLocalVariable(i);
				if (v.GetType() == CAOSVar::typeInteger && v.GetInteger() == 0) continue;
				if (!firstVa) json << ",";
				firstVa = false;
				json << "\"" << i << "\":";
				if (v.GetType() == CAOSVar::typeInteger)
					json << v.GetInteger();
				else if (v.GetType() == CAOSVar::typeFloat)
					json << v.GetFloat();
				else if (v.GetType() == CAOSVar::typeString) {
					std::string s; v.GetString(s);
					json << "\"" << JsonEscape(s) << "\"";
				}
				else if (v.GetType() == CAOSVar::typeAgent && v.GetAgent().IsValid())
					json << v.GetAgent().GetAgentReference().GetUniqueID();
				else
					json << "0";
			}
			json << "}";

			json << "}";
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

	// ── POST /api/breakpoint ──────────────────────────────────────────
	// Set or clear breakpoints on a specific agent's VM.
	// Body: { "agentId": 42, "ip": 156, "action": "set"|"clear"|"clearAll" }
	myImpl->svr.Post("/api/breakpoint", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		// Simple JSON parsing
		int agentId = 0;
		int ip = 0;
		std::string action;

		// Parse agentId
		size_t pos = body.find("\"agentId\"");
		if (pos != std::string::npos) {
			pos = body.find(':', pos);
			if (pos != std::string::npos) agentId = std::stoi(body.substr(pos + 1));
		}
		// Parse ip
		pos = body.find("\"ip\"");
		if (pos != std::string::npos) {
			pos = body.find(':', pos);
			if (pos != std::string::npos) ip = std::stoi(body.substr(pos + 1));
		}
		// Parse action
		pos = body.find("\"action\"");
		if (pos != std::string::npos) {
			pos = body.find('"', pos + 8);
			if (pos != std::string::npos) {
				pos++;
				size_t end = body.find('"', pos);
				if (end != std::string::npos) action = body.substr(pos, end - pos);
			}
		}

		auto* item = new WorkItem();
		item->work = [agentId, ip, action]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid()) {
				return "{\"ok\":false,\"error\":\"Agent not found\"}";
			}

			CAOSMachine& vm = handle.GetAgentReference().GetVirtualMachine();

			if (action == "set") {
				vm.SetBreakpoint(ip);
			} else if (action == "clear") {
				vm.ClearBreakpoint(ip);
			} else if (action == "clearAll") {
				vm.ClearAllBreakpoints();
			} else {
				return "{\"ok\":false,\"error\":\"Unknown action\"}";
			}

			// Return current breakpoints
			const std::set<int>& bps = vm.GetBreakpoints();
			std::ostringstream json;
			json << "{\"ok\":true,\"breakpoints\":[";
			bool first = true;
			for (int b : bps) {
				if (!first) json << ",";
				first = false;
				json << b;
			}
			json << "]}";
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
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/step/:agentId ───────────────────────────────────────
	// Single-step a paused agent.  Body: { "mode": "into"|"over" }
	myImpl->svr.Post(R"(/api/step/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);
		std::string mode = "into";
		size_t pos = req.body.find("\"mode\"");
		if (pos != std::string::npos) {
			pos = req.body.find('"', pos + 6);
			if (pos != std::string::npos) {
				pos++;
				size_t end = req.body.find('"', pos);
				if (end != std::string::npos) mode = req.body.substr(pos, end - pos);
			}
		}

		auto* item = new WorkItem();
		item->work = [agentId, mode]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid()) {
				return "{\"ok\":false,\"error\":\"Agent not found\"}";
			}

			Agent& agent = handle.GetAgentReference();
			CAOSMachine& vm = agent.GetVirtualMachine();

			if (!vm.IsAtBreakpoint()) {
				return "{\"ok\":false,\"error\":\"Agent is not paused at a breakpoint\"}";
			}

			// Perform the step
			if (mode == "over") {
				vm.DebugStepOver();
			} else {
				vm.DebugStepInto();
			}

			// Run VM for one quanta to execute the step
			try {
				vm.UpdateVM(1);
			} catch (CAOSMachine::RunError& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			} catch (...) {
				return "{\"ok\":false,\"error\":\"Exception during step\"}";
			}

			// Return updated state
			std::ostringstream json;
			json << "{\"ok\":true"
				<< ",\"ip\":" << vm.GetIP()
				<< ",\"paused\":" << (vm.IsAtBreakpoint() ? "true" : "false")
				<< ",\"running\":" << (vm.IsRunning() ? "true" : "false")
				<< ",\"blocking\":" << (vm.IsBlocking() ? "true" : "false");

			// Include source position if available
			MacroScript* macro = vm.GetScript();
			if (macro) {
				DebugInfo* di = macro->GetDebugInfo();
				if (di) {
					int srcPos = di->MapAddressToSource(vm.GetIP());
					json << ",\"sourcePos\":" << srcPos;
				}
			}

			json << "}";
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
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/continue/:agentId ───────────────────────────────────
	// Resume a paused agent.
	myImpl->svr.Post(R"(/api/continue/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);

		auto* item = new WorkItem();
		item->work = [agentId]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid()) {
				return "{\"ok\":false,\"error\":\"Agent not found\"}";
			}

			CAOSMachine& vm = handle.GetAgentReference().GetVirtualMachine();
			if (!vm.IsAtBreakpoint()) {
				return "{\"ok\":false,\"error\":\"Agent is not paused\"}";
			}

			vm.DebugContinue();
			return "{\"ok\":true}";
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
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});


	// ── POST /api/pause ──────────────────────────────────────────────
	// Pause the global engine simulation.
	myImpl->svr.Post("/api/pause", [](const httplib::Request& req, httplib::Response& res) {
		SetEnginePaused(true);
		res.set_content("{\"ok\":true,\"paused\":true}", "application/json");
	});

	// ── POST /api/resume ─────────────────────────────────────────────
	// Resume the global engine simulation.
	myImpl->svr.Post("/api/resume", [](const httplib::Request& req, httplib::Response& res) {
		SetEnginePaused(false);
		res.set_content("{\"ok\":true,\"paused\":false}", "application/json");
	});

	// ── GET /api/engine-state ────────────────────────────────────────
	// Returns current engine pause state.
	myImpl->svr.Get("/api/engine-state", [](const httplib::Request& req, httplib::Response& res) {
		bool paused = IsEnginePaused();
		res.set_content(std::string("{\"paused\":") + (paused ? "true" : "false") + "}", "application/json");
	});

	// ── GET /api/creatures ────────────────────────────────────────────
	// Lists all creature agents with drives, life state, health.
	myImpl->svr.Get("/api/creatures", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "[";
			bool first = true;

			try {
				AgentMap& agentMap = AgentManager::GetAgentIDMap();
				for (AgentMapIterator it = agentMap.begin(); it != agentMap.end(); ++it) {
					AgentHandle& handle = it->second->IsValid() ? *(it->second) : NULLHANDLE;
					if (handle.IsInvalid()) continue;
					if (!handle.IsCreature()) continue;

					try {
						Creature& creature = handle.GetCreatureReference();
						Agent& agent = handle.GetAgentReference();
						Classifier c = agent.GetClassifier();
						LifeFaculty* life = creature.Life();

						// Life state string
						std::string lifeState = "unknown";
						if (life) {
							if (life->GetWhetherDead()) lifeState = "dead";
							else if (life->GetWhetherUnconscious()) lifeState = "unconscious";
							else if (life->GetWhetherDreaming()) lifeState = "dreaming";
							else if (life->GetWhetherAsleep()) lifeState = "asleep";
							else if (life->GetWhetherZombie()) lifeState = "zombie";
							else if (life->GetWhetherAlert()) lifeState = "alert";
						}

						// Moniker
						std::string moniker;
						try { moniker = creature.GetMoniker(); } catch (...) {}

						// Name (from LinguisticFaculty)
						std::string name;
						try {
							LinguisticFaculty* ling = creature.Linguistic();
							if (ling && ling->KnownWord(LinguisticFaculty::PERSONAL, LinguisticFaculty::ME)) {
								name = ling->GetPlatonicWord(LinguisticFaculty::PERSONAL, LinguisticFaculty::ME);
							}
						} catch (...) {}

						if (!first) json << ",";
						first = false;

						json << "{\"agentId\":" << agent.GetUniqueID()
							<< ",\"moniker\":\"" << JsonEscape(moniker) << "\""
							<< ",\"name\":\"" << JsonEscape(name) << "\""
							<< ",\"genus\":" << (int)c.Genus()
							<< ",\"species\":" << (int)c.Species();

						if (life) {
							json << ",\"sex\":" << life->GetSex()
								<< ",\"age\":" << life->GetAge()
								<< ",\"ageInTicks\":" << life->GetTickAge()
								<< ",\"lifeState\":\"" << lifeState << "\"";
						}

						// Health
						if (life) {
							json << ",\"health\":" << life->Health();
						}

						// Position
						json << ",\"posX\":" << (int)agent.GetPosition().x
							<< ",\"posY\":" << (int)agent.GetPosition().y;

						// Drives (20 values)
						json << ",\"drives\":[";
						for (int d = 0; d < NUMDRIVES; ++d) {
							if (d > 0) json << ",";
							json << creature.GetDriveLevel(d);
						}
						json << "]";

						// Highest drive
						json << ",\"highestDrive\":" << creature.GetHighestDrive();

						json << "}";
					} catch (...) {
						// Skip creatures that throw during inspection
					}
				}
			} catch (...) {
				// No world loaded
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

	// ── GET /api/creature/:id/chemistry ──────────────────────────────
	// Returns all 256 chemical concentrations and organ status.
	myImpl->svr.Get(R"(/api/creature/(\d+)/chemistry)", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);

		auto* item = new WorkItem();
		item->work = [agentId]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid() || !handle.IsCreature()) {
				return "{\"error\":\"Creature not found\"}";
			}

			try {
				Creature& creature = handle.GetCreatureReference();
				Biochemistry* biochem = creature.GetBiochemistry();
				if (!biochem) {
					return "{\"error\":\"No biochemistry\"}";
				}

				std::ostringstream json;
				json << "{\"chemicals\":[";
				for (int i = 0; i < NUMCHEM; ++i) {
					if (i > 0) json << ",";
					json << biochem->GetChemical(i);
				}
				json << "]";

				// Organ status
				int organCount = biochem->GetOrganCount();
				json << ",\"organCount\":" << organCount;
				json << ",\"organs\":[";
				for (int i = 0; i < organCount; ++i) {
					Organ* organ = biochem->GetOrgan(i);
					if (!organ) continue;
					if (i > 0) json << ",";
					json << "{\"index\":" << i
						<< ",\"clockRate\":" << organ->LocusClockRate()
						<< ",\"lifeForce\":" << organ->LocusLifeForce()
						<< ",\"shortTermLifeForce\":" << organ->ShortTermLifeForce()
						<< ",\"longTermLifeForce\":" << organ->LongTermLifeForce()
						<< ",\"energyCost\":" << organ->EnergyCost()
						<< ",\"functioning\":" << (organ->Functioning() ? "true" : "false")
						<< ",\"failed\":" << (organ->Failed() ? "true" : "false")
						<< ",\"receptorCount\":" << organ->ReceptorCount()
						<< ",\"emitterCount\":" << organ->EmitterCount()
						<< ",\"reactionCount\":" << organ->ReactionCount()
						<< "}";
				}
				json << "]}";
				return json.str();
			} catch (...) {
				return "{\"error\":\"Failed to read biochemistry\"}";
			}
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

	// ── GET /api/creature/:id/brain ──────────────────────────────────
	// Returns brain overview: lobe summaries (with labels) and tract summaries.
	myImpl->svr.Get(R"(/api/creature/(\d+)/brain)", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);

		auto* item = new WorkItem();
		item->work = [agentId]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid() || !handle.IsCreature()) {
				return "{\"error\":\"Creature not found\"}";
			}

			try {
				Creature& creature = handle.GetCreatureReference();
				Brain* brain = creature.GetBrain();
				if (!brain) {
					return "{\"error\":\"No brain\"}";
				}

				// Drive names for labelling drive-related lobes
				static const char* DRIVE_LABELS[] = {
					"Pain", "Hunger (Protein)", "Hunger (Carb)", "Hunger (Fat)",
					"Coldness", "Hotness", "Tiredness", "Sleepiness",
					"Loneliness", "Crowdedness", "Fear", "Boredom",
					"Anger", "Sex Drive", "Comfort",
					"Up", "Down", "Exit", "Enter", "Wait"
				};

				// Action names for labelling verb/decision lobes
				static const char* ACTION_LABELS[] = {
					"Quiescent", "Push", "Pull", "Stop",
					"Approach", "Retreat", "Get", "Drop",
					"Express", "Rest", "West", "East",
					"Eat", "Hit"
				};

				std::ostringstream json;
				json << "{\"lobes\":[";

				int lobeCount = brain->GetLobeCount();
				for (int i = 0; i < lobeCount; ++i) {
					Lobe* lobe = brain->GetLobe(i);
					if (!lobe) continue;
					if (i > 0) json << ",";

					std::string lobeName(lobe->GetName());
					const int* colour = lobe->GetColour();

					json << "{\"index\":" << i
						<< ",\"name\":\"" << JsonEscape(lobeName) << "\""
						<< ",\"neuronCount\":" << lobe->GetNoOfNeurons()
						<< ",\"winner\":" << lobe->GetWhichNeuronWon()
						<< ",\"x\":" << lobe->GetX()
						<< ",\"y\":" << lobe->GetY()
						<< ",\"width\":" << lobe->GetWidth()
						<< ",\"height\":" << lobe->GetHeight()
						<< ",\"colour\":[" << colour[0] << "," << colour[1] << "," << colour[2] << "]";

					// Generate labels based on lobe type
					json << ",\"labels\":[";
					int nCount = lobe->GetNoOfNeurons();

					bool isNounLobe = (lobeName == "noun" || lobeName == "attn" ||
									   lobeName == "stim" || lobeName == "visn");
					bool isVerbLobe = (lobeName == "verb" || lobeName == "decn");
					bool isDriveLobe = (lobeName == "driv");

					for (int n = 0; n < nCount; ++n) {
						if (n > 0) json << ",";
						if (isNounLobe && n < SensoryFaculty::GetNumCategories()) {
							json << "\"" << JsonEscape(SensoryFaculty::GetCategoryName(n)) << "\"";
						} else if (isVerbLobe && n < NUMACTIONS) {
							json << "\"" << ACTION_LABELS[n] << "\"";
						} else if (isDriveLobe && n < NUMDRIVES) {
							json << "\"" << DRIVE_LABELS[n] << "\"";
						} else {
							json << "\"\"";
						}
					}
					json << "]";

					json << "}";
				}
				json << "],\"tracts\":[";

				int tractCount = brain->GetTractCount();
				for (int i = 0; i < tractCount; ++i) {
					Tract* tract = brain->GetTract(i);
					if (!tract) continue;
					if (i > 0) json << ",";

					std::string srcName, dstName;
					Lobe* srcLobe = tract->GetSrcLobe();
					Lobe* dstLobe = tract->GetDstLobe();
					if (srcLobe) srcName = srcLobe->GetName();
					if (dstLobe) dstName = dstLobe->GetName();

					json << "{\"index\":" << i
						<< ",\"name\":\"" << JsonEscape(std::string(tract->GetName())) << "\""
						<< ",\"dendriteCount\":" << tract->GetDendriteCount()
						<< ",\"srcLobe\":\"" << JsonEscape(srcName) << "\""
						<< ",\"dstLobe\":\"" << JsonEscape(dstName) << "\""
						<< "}";
				}
				json << "]}";
				return json.str();
			} catch (...) {
				return "{\"error\":\"Failed to read brain\"}";
			}
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

	// ── GET /api/creature/:id/brain/lobe/:lobeIdx ───────────────────
	// Returns all neuron states for a specific lobe.
	myImpl->svr.Get(R"(/api/creature/(\d+)/brain/lobe/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);
		int lobeIdx = std::stoi(req.matches[2]);

		auto* item = new WorkItem();
		item->work = [agentId, lobeIdx]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid() || !handle.IsCreature()) {
				return "{\"error\":\"Creature not found\"}";
			}

			try {
				Creature& creature = handle.GetCreatureReference();
				Brain* brain = creature.GetBrain();
				if (!brain) return "{\"error\":\"No brain\"}";

				Lobe* lobe = brain->GetLobe(lobeIdx);
				if (!lobe) return "{\"error\":\"Lobe not found\"}";

				std::ostringstream json;
				std::string lobeName(lobe->GetName());
				int nCount = lobe->GetNoOfNeurons();

				json << "{\"name\":\"" << JsonEscape(lobeName) << "\""
					<< ",\"neuronCount\":" << nCount
					<< ",\"winner\":" << lobe->GetWhichNeuronWon()
					<< ",\"neurons\":[";

				for (int n = 0; n < nCount; ++n) {
					Neuron* neuron = lobe->GetNeuron(n);
					if (!neuron) continue;
					if (n > 0) json << ",";

					json << "{\"id\":" << neuron->idInList
						<< ",\"states\":[";
					for (int s = 0; s < NUM_SVRULE_VARIABLES; ++s) {
						if (s > 0) json << ",";
						json << neuron->states[s];
					}
					json << "]}";
				}

				json << "]}";
				return json.str();
			} catch (...) {
				return "{\"error\":\"Failed to read lobe\"}";
			}
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

	// ── GET /api/creature/:id/brain/tract/:tractIdx ─────────────────
	// Returns dendrite connection and weight data for a specific tract.
	// Capped at 1000 dendrites per response.
	myImpl->svr.Get(R"(/api/creature/(\d+)/brain/tract/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);
		int tractIdx = std::stoi(req.matches[2]);

		auto* item = new WorkItem();
		item->work = [agentId, tractIdx]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid() || !handle.IsCreature()) {
				return "{\"error\":\"Creature not found\"}";
			}

			try {
				Creature& creature = handle.GetCreatureReference();
				Brain* brain = creature.GetBrain();
				if (!brain) return "{\"error\":\"No brain\"}";

				Tract* tract = brain->GetTract(tractIdx);
				if (!tract) return "{\"error\":\"Tract not found\"}";

				std::string srcName, dstName;
				Lobe* srcLobe = tract->GetSrcLobe();
				Lobe* dstLobe = tract->GetDstLobe();
				if (srcLobe) srcName = srcLobe->GetName();
				if (dstLobe) dstName = dstLobe->GetName();

				int totalDendrites = tract->GetDendriteCount();
				int maxDendrites = std::min(totalDendrites, 1000);

				std::ostringstream json;
				json << "{\"name\":\"" << JsonEscape(std::string(tract->GetName())) << "\""
					<< ",\"srcLobe\":\"" << JsonEscape(srcName) << "\""
					<< ",\"dstLobe\":\"" << JsonEscape(dstName) << "\""
					<< ",\"dendriteCount\":" << totalDendrites
					<< ",\"dendritesReturned\":" << maxDendrites
					<< ",\"dendrites\":[";

				for (int d = 0; d < maxDendrites; ++d) {
					Dendrite* dendrite = tract->GetDendrite(d);
					if (!dendrite) continue;
					if (d > 0) json << ",";

					int srcId = dendrite->srcNeuron ? dendrite->srcNeuron->idInList : -1;
					int dstId = dendrite->dstNeuron ? dendrite->dstNeuron->idInList : -1;

					json << "{\"id\":" << dendrite->idInList
						<< ",\"src\":" << srcId
						<< ",\"dst\":" << dstId
						<< ",\"weights\":[";
					for (int w = 0; w < NUM_SVRULE_VARIABLES; ++w) {
						if (w > 0) json << ",";
						json << dendrite->weights[w];
					}
					json << "]}";
				}

				json << "]}";
				return json.str();
			} catch (...) {
				return "{\"error\":\"Failed to read tract\"}";
			}
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

	// ── SSE endpoint for log streaming ─────────────────────────────────
	// Clients connect to GET /api/events and receive log lines as SSE.
	myImpl->svr.Get("/api/events", [this](const httplib::Request& req, httplib::Response& res) {
		// We need to figure out where the client should start reading from.
		// New connections get all buffered log lines then live updates.
		size_t startIdx = 0;
		{
			std::lock_guard<std::mutex> lock(myImpl->logMutex);
			startIdx = myImpl->logBuffer.size(); // will send from here
		}

		res.set_header("Cache-Control", "no-cache");
		res.set_header("X-Accel-Buffering", "no");

		res.set_chunked_content_provider(
			"text/event-stream",
			[this, startIdx](size_t offset, httplib::DataSink& sink) mutable -> bool {
				// Send any buffered log lines first
				{
					std::lock_guard<std::mutex> lock(myImpl->logMutex);
					while (startIdx < myImpl->logBuffer.size()) {
						std::string event = "data: " + myImpl->logBuffer[startIdx] + "\n\n";
						sink.write(event.c_str(), event.size());
						startIdx++;
					}
				}

				// Wait for new log lines
				{
					std::unique_lock<std::mutex> lock(myImpl->logMutex);
					myImpl->logCV.wait_for(lock, std::chrono::milliseconds(500),
						[this, &startIdx]() {
							return startIdx < myImpl->logBuffer.size() || !myImpl->running;
						});

					// Send any newly arrived lines
					while (startIdx < myImpl->logBuffer.size()) {
						std::string event = "data: " + myImpl->logBuffer[startIdx] + "\n\n";
						sink.write(event.c_str(), event.size());
						startIdx++;
					}
				}

				// Keep connection alive unless server is stopping
				return myImpl->running;
			}
		);
	});

	// ── Start UDP listener for log relay ───────────────────────────────
	myImpl->udpSocket = socket(AF_INET, SOCK_DGRAM, 0);
	if (myImpl->udpSocket >= 0) {
		// Allow address reuse so FlightRecorder's sendto socket doesn't conflict
		int reuse = 1;
		setsockopt(myImpl->udpSocket, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

		// Set non-blocking for clean shutdown
		int flags = fcntl(myImpl->udpSocket, F_GETFL, 0);
		if (flags >= 0) fcntl(myImpl->udpSocket, F_SETFL, flags | O_NONBLOCK);

		struct sockaddr_in addr;
		memset(&addr, 0, sizeof(addr));
		addr.sin_family = AF_INET;
		addr.sin_port = htons(9999);
		// FlightRecorder sends to INADDR_BROADCAST, so we must bind INADDR_ANY
		addr.sin_addr.s_addr = htonl(INADDR_ANY);

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

	fprintf(stderr, "[lc2e] API server: http://localhost:%d/\n", port);
	if (!myImpl->staticDir.empty()) {
		fprintf(stderr, "[lc2e] Developer tools: http://localhost:%d/\n", port);
	} else {
		fprintf(stderr, "[lc2e] MCP mode: API-only (no browser UI)\n");
		fprintf(stderr, "[lc2e] To connect an MCP client, add to your MCP config:\n");
		fprintf(stderr, "[lc2e]   {\"mcpServers\":{\"creatures3\":{\"command\":\"node\",\"args\":[\"mcp/server.js\"]}}}\n");
		fprintf(stderr, "[lc2e] Install MCP server deps: cd mcp && npm install\n");
		fprintf(stderr, "[lc2e] See mcp/README.md for full setup instructions.\n");
	}
}

// ── Start (API-only — used by --mcp) ──────────────────────────────────────
void DebugServer::Start(int port) {
	Start(port, "");
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

	// Wake up any SSE clients blocked on logCV so they can exit
	{
		std::lock_guard<std::mutex> lock(myImpl->logMutex);
		myImpl->running = false;
		myImpl->logCV.notify_all();
	}
	delete myImpl;
	myImpl = nullptr;

	fprintf(stderr, "[lc2e] Developer tools stopped.\n");
}
