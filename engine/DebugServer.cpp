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
#include "contrib/json.hpp"
#include <dirent.h>
#include "AppConstants.h"
#include "FilePath.h"


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
#include "Creature/GenomeStore.h"
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

static const char* OPCODE_NAMES[] = {
	"stop", "nop", "store", "load", "if=0", "if!=0", "add", "sub", "mul", "div",
	"absDiff", "thresh_add", "thresh_set", "rnd", "min", "max",
	"if<0", "if>0", "if<=0", "if>=0",
	"setRate", "tend", "neg", "abs", "dist", "flip",
	"nop", "setSpr", "bound01", "bound±1", "addStore", "tendStore",
	"threshold", "leak", "rest", "gain", "persist", "noise", "wta", "setSTLT",
	"setLTST", "storeAbs",
	"if0Stop", "if!0Stop", "if0Goto", "if!0Goto",
	"divAddNI", "mulAddNI", "goto",
	"if<Stop", "if>Stop", "if<=Stop", "if>=Stop",
	"setRwdThr", "setRwdRate", "setRwdChem", "setPunThr", "setPunRate", "setPunChem",
	"preserve", "restore", "preserveSpr", "restoreSpr",
	"if<0Goto", "if>0Goto"
};
static const char* OPERAND_NAMES[] = {
	"acc", "input", "dend", "neuron", "spare",
	"random",
	"chem[src+]", "chem", "chem[dst+]",
	"0", "1",
	"val", "-val", "val*10", "val/10", "valInt"
};

auto decompileSVRuleByBytes = [](const uint8_t* data) -> std::string {
	std::ostringstream out;
	out << "[";
	bool first = true;
	for (int i = 0; i < 48; i += 3) {
		uint8_t opCode = data[i];
		uint8_t operandVariable = data[i+1];
		uint8_t valByte = data[i+2];

		// Stop on stopImmediately with no prior content
		if (opCode == 0 && i == 0) break;

		if (!first) out << ",";
		first = false;

		std::string opName = (opCode < 69) ? OPCODE_NAMES[opCode] : "???";
		std::string operandName = (operandVariable < 16) ? OPERAND_NAMES[operandVariable] : "???";

		// convert float approximation (logic from Genome::GetFloat/SVRuleEntry)
		float floatValue = 0.0f;
		if (operandVariable >= 11 && operandVariable <= 15) {
			floatValue = (float)valByte / 255.0f;
			if (operandVariable == 12) floatValue = -floatValue;
			else if (operandVariable == 13) floatValue *= 10.0f;
			else if (operandVariable == 14) floatValue /= 10.0f;
			else if (operandVariable == 15) floatValue = floatValue * 255.0f;
		}

		out << "{\"op\":\"" << JsonEscape(opName)
			<< "\",\"operand\":\"" << JsonEscape(operandName)
			<< "\",\"idx\":" << (int)valByte
			<< ",\"val\":" << floatValue
			<< ",\"opCode\":" << (int)opCode
			<< ",\"operandCode\":" << (int)operandVariable
			<< "}";

		if (opCode == 0) break;
	}
	out << "]";
	return out.str();
};


        auto parseGenomeFileToJson = [decompileSVRuleByBytes](const std::string& genPath, const std::string& moniker) -> std::string {
			if (genPath.empty()) return "{\"error\":\"Genetics file not found\"}";
			std::ifstream file(genPath, std::ios::binary);
			if (!file.is_open()) return "{\"error\":\"Could not open genetics file\"}";
			auto readU8 = [&file]() -> uint8_t { uint8_t c; file.read((char*)&c, 1); return c; };
			auto readU16BE = [&readU8]() -> uint16_t { uint8_t hi = readU8(), lo = readU8(); return (hi << 8) | lo; };
			auto readFloat8 = [&readU8]() -> float { return ((int)readU8() - 128) / 128.0f; };
			char magic[4]; file.read(magic, 4);
			if (strncmp(magic, "dna3", 4) != 0) return "{\"error\":\"Invalid genetics file\"}";
			static const char* TYPE_NAMES[] = {"Brain", "Biochemistry", "Creature", "Organ"};
			static const char* SUBTYPE_NAMES[][10] = {
				{"Lobe", "BrainOrgan", "Tract"},
				{"Receptor", "Emitter", "Reaction", "HalfLives", "InitConc", "Neuroemitter"},
				{"Stimulus", "Genus", "Appearance", "Pose", "Gait", "Instinct", "Pigment", "PigmentBleed", "Expression"},
				{"Organ"}
			};
			auto ageLabel = [](int a) -> std::string {
				switch (a) {
					case 0: return "Baby"; case 1: return "Child"; case 2: return "Adolescent";
					case 3: return "Youth"; case 4: return "Adult"; case 5: return "Old"; case 6: return "Senile";
					default: return std::to_string(a);
				}
			};
			std::ostringstream json;
			json << "{\"moniker\":\"" << JsonEscape(moniker) << "\"";
			json << ",\"sex\":0";
			json << ",\"genus\":0";
			json << ",\"genes\":[";
			bool firstGene = true; int geneCount = 0;
			while (file.good() && !file.eof()) {
				char token[4]; bool found = false;
				while (file.good()) {
					int pos = file.tellg(); file.read(token, 4);
					if (file.gcount() == 4 && (strncmp(token, "gene", 4) == 0 || strncmp(token, "gend", 4) == 0)) { found = true; break; }
					file.seekg(pos + 1);
				}
				if (!found || strncmp(token, "gend", 4) == 0) break;
				if (!firstGene) json << ",";
				firstGene = false;
				uint8_t type = readU8(), subtype = readU8(), id = readU8(), gen = readU8();
				uint8_t switchOn = readU8(), flags = readU8(), mut = readU8(), var = readU8();
				std::string tName = (type < 4) ? TYPE_NAMES[type] : "Unknown";
				std::string stName = "Unknown";
				if (type == 0 && subtype < 3) stName = SUBTYPE_NAMES[0][subtype];
				else if (type == 1 && subtype < 6) stName = SUBTYPE_NAMES[1][subtype];
				else if (type == 2 && subtype < 9) stName = SUBTYPE_NAMES[2][subtype];
				else if (type == 3 && subtype < 1) stName = SUBTYPE_NAMES[3][subtype];
				json << "{\"index\":" << geneCount++ << ",\"type\":" << (int)type << ",\"typeName\":\"" << tName << "\""
					<< ",\"subtype\":" << (int)subtype << ",\"subtypeName\":\"" << stName << "\"" << ",\"id\":" << (int)id
					<< ",\"generation\":" << (int)gen << ",\"switchOnTime\":" << (int)switchOn << ",\"switchOnLabel\":\"" << ageLabel(switchOn) << "\""
					<< ",\"flags\":{\"mutable\":" << ((flags & 1) ? "true" : "false") << ",\"dupable\":" << ((flags & 2) ? "true" : "false")
					<< ",\"cutable\":" << ((flags & 4) ? "true" : "false") << ",\"maleOnly\":" << ((flags & 8) ? "true" : "false")
					<< ",\"femaleOnly\":" << ((flags & 16) ? "true" : "false") << ",\"dormant\":" << ((flags & 128) ? "true" : "false")
					<< "},\"mutability\":" << (int)mut << ",\"variant\":" << (int)var << ",\"flagsRaw\":" << (int)flags << ",\"data\":{";
				if (type == 0 && subtype == 0) {
					char lobeName[5] = {0}; file.read(lobeName, 4);
					uint16_t upd = readU16BE(), x = readU16BE(), y = readU16BE();
					uint8_t w = readU8(), h = readU8(), r = readU8(), g = readU8(), b = readU8(), wta = readU8(), tissue = readU8(), initAlways = readU8();
					char padding[7]; file.read(padding, 7);
					uint8_t initRule[48]; file.read((char*)initRule, 48); uint8_t updateRule[48]; file.read((char*)updateRule, 48);
					json << "\"lobeName\":\"" << JsonEscape(lobeName) << "\",\"updateTime\":" << upd << ",\"x\":" << x << ",\"y\":" << y
						<< ",\"width\":" << (int)w << ",\"height\":" << (int)h << ",\"red\":" << (int)r << ",\"green\":" << (int)g << ",\"blue\":" << (int)b
						<< ",\"wta\":" << (int)wta << ",\"tissue\":" << (int)tissue << ",\"initAlways\":" << (int)initAlways << ",\"initRule\":" << decompileSVRuleByBytes(initRule)
						<< ",\"updateRule\":" << decompileSVRuleByBytes(updateRule);
                    json << ",\"initRuleBytes\":["; for(int i=0;i<48;i++) { if(i>0) json<<","; json<<(int)initRule[i]; } json<<"]";
                    json << ",\"updateRuleBytes\":["; for(int i=0;i<48;i++) { if(i>0) json<<","; json<<(int)updateRule[i]; } json<<"]";
				} else if (type == 0 && subtype == 1) {
					uint8_t clock = readU8(), damage = readU8(), life = readU8(), biotick = readU8(), atp = readU8();
					json << "\"clockRate\":" << (int)clock << ",\"damageRate\":" << (int)damage << ",\"lifeForce\":" << (int)life << ",\"biotickStart\":" << (int)biotick << ",\"atpDamageCoef\":" << (int)atp;
				} else if (type == 0 && subtype == 2) {
					uint16_t upd = readU16BE(); char srcLobe[5] = {0}; file.read(srcLobe, 4); uint16_t sLower = readU16BE(), sUpper = readU16BE(), sNum = readU16BE();
					char dstLobe[5] = {0}; file.read(dstLobe, 4); uint16_t dLower = readU16BE(), dUpper = readU16BE(), dNum = readU16BE();
					uint8_t mig = readU8(), ran = readU8(), sVar = readU8(), dVar = readU8(), initAlways = readU8(); char padding[5]; file.read(padding, 5);
					uint8_t initRule[48]; file.read((char*)initRule, 48); uint8_t updateRule[48]; file.read((char*)updateRule, 48);
					json << "\"updateTime\":" << upd << ",\"srcLobe\":\"" << JsonEscape(srcLobe) << "\",\"dstLobe\":\"" << JsonEscape(dstLobe) << "\""
						<< ",\"sLower\":" << sLower << ",\"sUpper\":" << sUpper << ",\"sNum\":" << sNum << ",\"dLower\":" << dLower << ",\"dUpper\":" << dUpper << ",\"dNum\":" << dNum
                        << ",\"migrates\":" << (int)mig << ",\"ran\":" << (int)ran << ",\"srcVar\":" << (int)sVar << ",\"dstVar\":" << (int)dVar << ",\"initAlways\":" << (int)initAlways
						<< ",\"initRule\":" << decompileSVRuleByBytes(initRule) << ",\"updateRule\":" << decompileSVRuleByBytes(updateRule);
                    json << ",\"initRuleBytes\":["; for(int i=0;i<48;i++) { if(i>0) json<<","; json<<(int)initRule[i]; } json<<"]";
                    json << ",\"updateRuleBytes\":["; for(int i=0;i<48;i++) { if(i>0) json<<","; json<<(int)updateRule[i]; } json<<"]";
				} else if (type == 1 && subtype == 0) {
					uint8_t organ = readU8(), tissue = readU8(), locus = readU8(), chem = readU8(), thr = readU8(), nom = readU8(), gain = readU8(), flags2 = readU8();
					json << "\"organ\":" << (int)organ << ",\"tissue\":" << (int)tissue << ",\"locus\":" << (int)locus << ",\"chemical\":" << (int)chem << ",\"threshold\":" << (int)thr << ",\"nominal\":" << (int)nom << ",\"gain\":" << (int)gain << ",\"flags\":" << (int)flags2;
				} else if (type == 1 && subtype == 1) {
					uint8_t organ = readU8(), tissue = readU8(), locus = readU8(), chem = readU8(), thr = readU8(), rate = readU8(), gain = readU8(), flags2 = readU8();
					json << "\"organ\":" << (int)organ << ",\"tissue\":" << (int)tissue << ",\"locus\":" << (int)locus << ",\"chemical\":" << (int)chem << ",\"threshold\":" << (int)thr << ",\"rate\":" << (int)rate << ",\"gain\":" << (int)gain << ",\"flags\":" << (int)flags2;
				} else if (type == 1 && subtype == 2) {
					uint8_t r1a = readU8(), r1c = readU8(), r2a = readU8(), r2c = readU8(), p1a = readU8(), p1c = readU8(), p2a = readU8(), p2c = readU8(), rate = readU8();
					json << "\"r1Amount\":" << (int)r1a << ",\"r1Chem\":" << (int)r1c << ",\"r2Amount\":" << (int)r2a << ",\"r2Chem\":" << (int)r2c << ",\"p1Amount\":" << (int)p1a << ",\"p1Chem\":" << (int)p1c << ",\"p2Amount\":" << (int)p2a << ",\"p2Chem\":" << (int)p2c << ",\"rate\":" << (int)rate;
				} else if (type == 1 && subtype == 3) {
					json << "\"halfLives\":["; for (int i=0; i<256; i++) { if (i>0) json << ","; json << (int)readU8(); } json << "]";
				} else if (type == 1 && subtype == 4) {
					json << "\"chemical\":" << (int)readU8() << ",\"amount\":" << (int)readU8();
				} else if (type == 1 && subtype == 5) {
					uint8_t l0 = readU8(), n0 = readU8(), l1 = readU8(), n1 = readU8(), l2 = readU8(), n2 = readU8(), rate = readU8();
					uint8_t c0 = readU8(), a0 = readU8(), c1 = readU8(), a1 = readU8(), c2 = readU8(), a2 = readU8(), c3 = readU8(), a3 = readU8();
					json << "\"lobe0\":" << (int)l0 << ",\"neuron0\":" << (int)n0 << ",\"lobe1\":" << (int)l1 << ",\"neuron1\":" << (int)n1 << ",\"lobe2\":" << (int)l2 << ",\"neuron2\":" << (int)n2 << ",\"rate\":" << (int)rate << ",\"chem0\":" << (int)c0 << ",\"amount0\":" << (int)a0 << ",\"chem1\":" << (int)c1 << ",\"amount1\":" << (int)a1 << ",\"chem2\":" << (int)c2 << ",\"amount2\":" << (int)a2 << ",\"chem3\":" << (int)c3 << ",\"amount3\":" << (int)a3;
				} else if (type == 2 && subtype == 0) {
					uint8_t stim = readU8(), sig = readU8(), input = readU8(), intens = readU8(), feat = readU8();
					uint8_t c0 = readU8(); float a0 = readFloat8(); uint8_t c1 = readU8(); float a1 = readFloat8(); uint8_t c2 = readU8(); float a2 = readFloat8(); uint8_t c3 = readU8(); float a3 = readFloat8();
					json << "\"stimulus\":" << (int)stim << ",\"significance\":" << (int)sig << ",\"input\":" << (int)input << ",\"intensity\":" << (int)intens << ",\"features\":" << (int)feat << ",\"chem0\":" << (int)c0 << ",\"amount0\":" << a0 << ",\"chem1\":" << (int)c1 << ",\"amount1\":" << a1 << ",\"chem2\":" << (int)c2 << ",\"amount2\":" << a2 << ",\"chem3\":" << (int)c3 << ",\"amount3\":" << a3;
				} else if (type == 2 && subtype == 1) {
					uint8_t genus = readU8(); char mom[33] = {0}; file.read(mom, 32); char dad[33] = {0}; file.read(dad, 32);
					json << "\"genus\":" << (int)genus << ",\"motherMoniker\":\"" << JsonEscape(mom) << "\",\"fatherMoniker\":\"" << JsonEscape(dad) << "\"";
				} else if (type == 2 && subtype == 2) {
					json << "\"part\":" << (int)readU8() << ",\"variant\":" << (int)readU8() << ",\"species\":" << (int)readU8();
				} else if (type == 2 && subtype == 3) {
					uint8_t pNum = readU8(); char pStr[17] = {0}; file.read(pStr, 16); json << "\"poseNumber\":" << (int)pNum << ",\"poseString\":\"" << JsonEscape(pStr) << "\"";
				} else if (type == 2 && subtype == 4) {
					json << "\"gait\":" << (int)readU8() << ",\"poses\":["; for (int i=0; i<8; i++) { if (i>0) json << ","; json << (int)readU8(); } json << "]";
				} else if (type == 2 && subtype == 5) {
					uint8_t l0 = readU8(), c0 = readU8(), l1 = readU8(), c1 = readU8(), l2 = readU8(), c2 = readU8(), act = readU8(), rChem = readU8(), rAmt = readU8();
					json << "\"lobe0\":" << (int)l0 << ",\"cell0\":" << (int)c0 << ",\"lobe1\":" << (int)l1 << ",\"cell1\":" << (int)c1 << ",\"lobe2\":" << (int)l2 << ",\"cell2\":" << (int)c2 << ",\"action\":" << (int)act << ",\"reinforcementChemical\":" << (int)rChem << ",\"reinforcementAmount\":" << (int)rAmt;
				} else if (type == 2 && subtype == 6) {
					json << "\"pigment\":" << (int)readU8() << ",\"amount\":" << (int)readU8();
				} else if (type == 2 && subtype == 7) {
					json << "\"rotation\":" << (int)readU8() << ",\"swap\":" << (int)readU8();
				} else if (type == 2 && subtype == 8) {
					uint8_t expr = readU8(), pad = readU8(), w = readU8(); uint8_t d0 = readU8(), a0 = readU8(), d1 = readU8(), a1 = readU8(), d2 = readU8(), a2 = readU8(), d3 = readU8(), a3 = readU8();
					json << "\"expression\":" << (int)expr << ",\"weight\":" << (int)w << ",\"drive0\":" << (int)d0 << ",\"amount0\":" << (int)a0 << ",\"drive1\":" << (int)d1 << ",\"amount1\":" << (int)a1 << ",\"drive2\":" << (int)d2 << ",\"amount2\":" << (int)a2 << ",\"drive3\":" << (int)d3 << ",\"amount3\":" << (int)a3;
				} else if (type == 3 && subtype == 0) {
					uint8_t clock = readU8(), damage = readU8(), life = readU8(), biotick = readU8(), atp = readU8();
					json << "\"clockRate\":" << (int)clock << ",\"damageRate\":" << (int)damage << ",\"lifeForce\":" << (int)life << ",\"biotickStart\":" << (int)biotick << ",\"atpDamageCoef\":" << (int)atp;
				}
				json << "}}";
			}
			json << "],\"geneCount\":" << geneCount << "}";
			return json.str();
		};

	myImpl->svr.Get("/api/genetics/files", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::vector<std::string> arr;
			std::string genDir = theApp.GetDirectory(GENETICS_DIR);
			if (DIR* dir = opendir(genDir.c_str())) {
				while (struct dirent* ent = readdir(dir)) {
					std::string name = ent->d_name;
					if (name.length() > 4 && name.substr(name.length() - 4) == ".gen") {
						arr.push_back(name.substr(0, name.length() - 4));
					}
				}
				closedir(dir);
			}
			std::ostringstream json;
			json << "[";
			for (size_t i = 0; i < arr.size(); ++i) {
				if (i > 0) json << ",";
				json << "\"" << JsonEscape(arr[i]) << "\"";
			}
			json << "]";
			return json.str();
		};
		auto future = item->promise.get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Get(R"(/api/genetics/file/([^/]+))", [this, parseGenomeFileToJson](const httplib::Request& req, httplib::Response& res) {
		std::string moniker = req.matches[1];
		auto* item = new WorkItem();
		item->work = [moniker, parseGenomeFileToJson]() -> std::string {
			std::string genPath = theApp.GetDirectory(GENETICS_DIR) + moniker + ".gen";
			return parseGenomeFileToJson(genPath, moniker);
		};
		auto future = item->promise.get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Post("/api/genetics/crossover", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		auto* item = new WorkItem();
		item->work = [body]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				std::string parentA = j.value("parentA", "");
				std::string parentB = j.value("parentB", "");

				// Resolve parent file paths
				std::string mumPath = theApp.GetDirectory(GENETICS_DIR) + parentA + ".gen";
				std::string dadPath = theApp.GetDirectory(GENETICS_DIR) + parentB + ".gen";

				// Read parent genomes directly (no GenomeStore — avoids destructor
				// assertion that expects ClearAllSlots before destruction)
				Genome mumGenome;
				mumGenome.ReadFromFile(mumPath, 0, 0, 0, "");
				Genome dadGenome;
				dadGenome.ReadFromFile(dadPath, 0, 0, 0, "");

				// Perform crossover
				Genome childGenome;
				childGenome.Cross("", &mumGenome, &dadGenome, 200, 200, 200, 200);

				// Build a child moniker — GenomeStore::GenerateUniqueMoniker is protected,
				// so we synthesize one: "000-chld-<random hex>"
				char monikerBuf[64];
				snprintf(monikerBuf, sizeof(monikerBuf), "000-chld-%08x-%08x-%08x-%05x",
					(unsigned)rand(), (unsigned)rand(), (unsigned)rand(), (unsigned)(rand() & 0xFFFFF));
				std::string childMoniker(monikerBuf);
				childGenome.SetMoniker(childMoniker);

				// Write child to world genetics directory
				std::string childPath = theApp.GetDirectory(GENETICS_DIR) + childMoniker + ".gen";
				childGenome.WriteToFile(childPath);

				return "{\"status\":\"success\", \"child\":\"" + JsonEscape(childMoniker) + "\"}";
			} catch (std::exception& e) {
				return std::string("{\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->promise.get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Post("/api/genetics/inject", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		auto* item = new WorkItem();
		item->work = [body]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				std::string inputMoniker = j.value("moniker", "CustomGenome");
                std::string moniker = inputMoniker + "_" + std::to_string(rand());
                
				std::string genPath = theApp.GetDirectory(GENETICS_DIR) + moniker + ".gen";
				std::ofstream file(genPath, std::ios::binary);
                if (!file.is_open()) return "{\"error\": \"Could not write gen file\"}";
                
                auto writeU8 = [&file](uint8_t c) { file.write((char*)&c, 1); };
                auto writeU16BE = [&file](uint16_t v) { uint8_t hi=v>>8, lo=v&0xff; file.write((char*)&hi, 1); file.write((char*)&lo, 1); };
                auto writeFloat8 = [&writeU8](float v) { int i = (int)round(v * 128.0f) + 128; writeU8((uint8_t)i); };

                file.write("dna3", 4);
                if (j.contains("genes")) {
                    for (auto& g : j["genes"]) {
                        if (g.contains("active") && !g.value("active", true)) continue;
                        
                        file.write("gene", 4);
                        uint8_t type = g.value("type", 0); writeU8(type);
                        uint8_t subtype = g.value("subtype", 0); writeU8(subtype);
                        uint8_t id = g.value("id", 0); writeU8(id);
                        uint8_t gen = g.value("generation", 0); writeU8(gen);
                        uint8_t switchOn = g.value("switchOnTime", 0); writeU8(switchOn);
                        
                        uint8_t flags = 0;
                        if (g.contains("flagsRaw")) {
                            flags = g["flagsRaw"];
                        } else if (g.contains("flags")) {
                            auto& f = g["flags"];
                            if (f.value("mutable", false)) flags |= 1;
                            if (f.value("dupable", false)) flags |= 2;
                            if (f.value("cutable", false)) flags |= 4;
                            if (f.value("maleOnly", false)) flags |= 8;
                            if (f.value("femaleOnly", false)) flags |= 16;
                            if (f.value("dormant", false)) flags |= 128;
                        }
                        writeU8(flags);
                        uint8_t mut = g.value("mutability", 0); writeU8(mut);
                        uint8_t var = g.value("variant", 0); writeU8(var);
                        
                        auto& d = g["data"];
                        if (type == 0 && subtype == 0) { // Lobe
                            std::string ln = d.value("lobeName", ""); ln.resize(4, '\0');
                            file.write(ln.c_str(), 4);
                            writeU16BE(d.value("updateTime", 0));
                            writeU16BE(d.value("x", 0)); writeU16BE(d.value("y", 0));
                            writeU8(d.value("width", 0)); writeU8(d.value("height", 0));
                            writeU8(d.value("red", 0)); writeU8(d.value("green", 0)); writeU8(d.value("blue", 0));
                            writeU8(d.value("wta", 0)); writeU8(d.value("tissue", 0)); writeU8(d.value("initAlways", 0));
                            char pad[7]={0}; file.write(pad, 7);
                            auto rI = d["initRuleBytes"]; for(int i=0;i<48;i++) writeU8(rI.size()>i? (uint8_t)rI[i]:0);
                            auto rU = d["updateRuleBytes"]; for(int i=0;i<48;i++) writeU8(rU.size()>i? (uint8_t)rU[i]:0);
                        } else if (type == 0 && subtype == 1) { // Lobe Organ
                            writeU8(d.value("clockRate", 0)); writeU8(d.value("damageRate", 0)); writeU8(d.value("lifeForce", 0)); writeU8(d.value("biotickStart", 0)); writeU8(d.value("atpDamageCoef", 0));
                        } else if (type == 0 && subtype == 2) { // Tract
                            writeU16BE(d.value("updateTime", 0));
                            std::string sl = d.value("srcLobe", ""); sl.resize(4, '\0'); file.write(sl.c_str(), 4);
                            writeU16BE(d.value("sLower", 0)); writeU16BE(d.value("sUpper", 0)); writeU16BE(d.value("sNum", 0));
                            std::string dl = d.value("dstLobe", ""); dl.resize(4, '\0'); file.write(dl.c_str(), 4);
                            writeU16BE(d.value("dLower", 0)); writeU16BE(d.value("dUpper", 0)); writeU16BE(d.value("dNum", 0));
                            writeU8(d.value("migrates", 0)); writeU8(d.value("ran", 0)); writeU8(d.value("srcVar", 0)); writeU8(d.value("dstVar", 0)); writeU8(d.value("initAlways", 0));
                            char pad[5]={0}; file.write(pad, 5);
                            auto rI = d["initRuleBytes"]; for(int i=0;i<48;i++) writeU8(rI.size()>i? (uint8_t)rI[i]:0);
                            auto rU = d["updateRuleBytes"]; for(int i=0;i<48;i++) writeU8(rU.size()>i? (uint8_t)rU[i]:0);
                        } else if (type == 1 && subtype == 0) { // Receptor
                            writeU8(d.value("organ", 0)); writeU8(d.value("tissue", 0)); writeU8(d.value("locus", 0)); writeU8(d.value("chemical", 0));
                            writeU8(d.value("threshold", 0)); writeU8(d.value("nominal", 0)); writeU8(d.value("gain", 0)); writeU8(d.value("flags", 0));
                        } else if (type == 1 && subtype == 1) { // Emitter
                            writeU8(d.value("organ", 0)); writeU8(d.value("tissue", 0)); writeU8(d.value("locus", 0)); writeU8(d.value("chemical", 0));
                            writeU8(d.value("threshold", 0)); writeU8(d.value("rate", 0)); writeU8(d.value("gain", 0)); writeU8(d.value("flags", 0));
                        } else if (type == 1 && subtype == 2) { // Reaction
                            writeU8(d.value("r1Amount", 0)); writeU8(d.value("r1Chem", 0)); writeU8(d.value("r2Amount", 0)); writeU8(d.value("r2Chem", 0));
                            writeU8(d.value("p1Amount", 0)); writeU8(d.value("p1Chem", 0)); writeU8(d.value("p2Amount", 0)); writeU8(d.value("p2Chem", 0)); writeU8(d.value("rate", 0));
                        } else if (type == 1 && subtype == 3) { // HalfLives
                            auto hl = d["halfLives"]; for(int i=0;i<256;i++) writeU8(hl.size()>i? (uint8_t)hl[i] : 0);
                        } else if (type == 1 && subtype == 4) { // InitConc
                            writeU8(d.value("chemical", 0)); writeU8(d.value("amount", 0));
                        } else if (type == 1 && subtype == 5) { // Neuroemitter
                            writeU8(d.value("lobe0", 0)); writeU8(d.value("neuron0", 0)); writeU8(d.value("lobe1", 0)); writeU8(d.value("neuron1", 0)); writeU8(d.value("lobe2", 0)); writeU8(d.value("neuron2", 0)); writeU8(d.value("rate", 0));
                            writeU8(d.value("chem0", 0)); writeU8(d.value("amount0", 0)); writeU8(d.value("chem1", 0)); writeU8(d.value("amount1", 0)); writeU8(d.value("chem2", 0)); writeU8(d.value("amount2", 0)); writeU8(d.value("chem3", 0)); writeU8(d.value("amount3", 0));
                        } else if (type == 2 && subtype == 0) { // Stimulus
                            writeU8(d.value("stimulus", 0)); writeU8(d.value("significance", 0)); writeU8(d.value("input", 0)); writeU8(d.value("intensity", 0)); writeU8(d.value("features", 0));
                            writeU8(d.value("chem0", 0)); writeFloat8(d.value("amount0", 0.0f)); writeU8(d.value("chem1", 0)); writeFloat8(d.value("amount1", 0.0f)); writeU8(d.value("chem2", 0)); writeFloat8(d.value("amount2", 0.0f)); writeU8(d.value("chem3", 0)); writeFloat8(d.value("amount3", 0.0f));
                        } else if (type == 2 && subtype == 1) { // Genus
                            writeU8(d.value("genus", 0)); std::string mom = d.value("motherMoniker", ""); mom.resize(32, '\0'); file.write(mom.c_str(), 32); std::string dad = d.value("fatherMoniker", ""); dad.resize(32, '\0'); file.write(dad.c_str(), 32);
                        } else if (type == 2 && subtype == 2) { // Appearance
                            writeU8(d.value("part", 0)); writeU8(d.value("variant", 0)); writeU8(d.value("species", 0));
                        } else if (type == 2 && subtype == 3) { // Pose
                            writeU8(d.value("poseNumber", 0)); std::string ps = d.value("poseString", ""); ps.resize(16, '\0'); file.write(ps.c_str(), 16);
                        } else if (type == 2 && subtype == 4) { // Gait
                            writeU8(d.value("gait", 0)); auto po = d["poses"]; for(int i=0;i<8;i++) writeU8(po.size()>i? (uint8_t)po[i]:0);
                        } else if (type == 2 && subtype == 5) { // Instinct
                            writeU8(d.value("lobe0", 0)); writeU8(d.value("cell0", 0)); writeU8(d.value("lobe1", 0)); writeU8(d.value("cell1", 0)); writeU8(d.value("lobe2", 0)); writeU8(d.value("cell2", 0));
                            writeU8(d.value("action", 0)); writeU8(d.value("reinforcementChemical", 0)); writeU8(d.value("reinforcementAmount", 0));
                        } else if (type == 2 && subtype == 6) { // Pigment
                            writeU8(d.value("pigment", 0)); writeU8(d.value("amount", 0));
                        } else if (type == 2 && subtype == 7) { // PigmentBleed
                            writeU8(d.value("rotation", 0)); writeU8(d.value("swap", 0));
                        } else if (type == 2 && subtype == 8) { // Expression
                            writeU8(d.value("expression", 0)); writeU8(0); writeU8(d.value("weight", 0));
                            writeU8(d.value("drive0", 0)); writeU8(d.value("amount0", 0)); writeU8(d.value("drive1", 0)); writeU8(d.value("amount1", 0)); writeU8(d.value("drive2", 0)); writeU8(d.value("amount2", 0)); writeU8(d.value("drive3", 0)); writeU8(d.value("amount3", 0));
                        } else if (type == 3 && subtype == 0) { // Organ
                            writeU8(d.value("clockRate", 0)); writeU8(d.value("damageRate", 0)); writeU8(d.value("lifeForce", 0)); writeU8(d.value("biotickStart", 0)); writeU8(d.value("atpDamageCoef", 0));
                        }
                    }
                }
                file.write("gend", 4);
                file.flush();
                file.close();

                // INJECT via CAOS: create temp agent, GENE LOAD the genome into
                // slot 1, then NEW: CREA to hatch a creature from it.
                // The temp agent is destroyed by the script (GENE LOAD moves
                // ownership of the genome slot to the new creature).
                // Physics properties (accg, bhvr, perm, attr) are read from
                // game variables to match what the bootstrap egg-hatching
                // scripts in DS creatureBreeding.cos set.
                std::string cmd =
                    "new: simp 1 1 1 \"blnk\" 1 0 0 "
                    "gene load targ 1 \"" + moniker + "\" "
                    "setv va00 unid "            // remember temp agent ID
                    "new: crea 4 targ 1 0 0 "    // hatch: family 4 = Norn
                    "born "                      // register with creature panel & history
                    "accg game \"c3_creature_accg\" " // gravity (default 5.0)
                    "attr game \"c3_creature_attr\" " // attributes (default 198)
                    "bhvr game \"c3_creature_bhvr\" " // click behaviors (default 15)
                    "perm game \"c3_creature_perm\" " // permeability (default 100)
                    "setv va01 unid "            // new creature's ID
                    "targ agnt va00 "            // re-select temp agent
                    "kill targ "                 // destroy temp agent
                    "targ agnt va01 "            // select creature
                    "mvsf 1000 8900";            // move to Docking Station Norn Meso (MR 11)
                Orderiser o;
                if (MacroScript* m = o.OrderFromCAOS(cmd.c_str())) {
                    CAOSMachine vm;
                    vm.StartScriptExecuting(m, NULLHANDLE, NULLHANDLE, INTEGERZERO, INTEGERZERO);
                    vm.UpdateVM(-1);
                    delete m;
                }

				return "{\"status\":\"success\",\"moniker\":\"" + moniker + "\"}";
			} catch (std::exception& e) {
				return std::string("{\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->promise.get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});



	myImpl->svr.Get(R"(/api/creature/(\d+)/genome)", [this, decompileSVRuleByBytes, parseGenomeFileToJson](const httplib::Request& req, httplib::Response& res) {
	int agentId = std::stoi(req.matches[1]);

	auto* item = new WorkItem();
	item->work = [agentId, decompileSVRuleByBytes, parseGenomeFileToJson]() -> std::string {
		AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
		if (handle.IsInvalid() || !handle.IsCreature()) {
			return "{\"error\":\"Creature not found\"}";
		}

		try {
			Creature& creature = handle.GetCreatureReference();
			std::string moniker = creature.GetMoniker();
			std::string genPath = GenomeStore::Filename(moniker);
			return parseGenomeFileToJson(genPath, moniker);

		} catch (std::exception& e) {
			return "{\"error\":\"" + JsonEscape(e.what()) + "\"}";
		} catch (...) {
			return "{\"error\":\"Failed to parse genetics file\"}";
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

	// ── GET /api/creature/:id/organs ─────────────────────────────────
	// Returns detailed organ data: receptors, emitters, reactions per organ.
	myImpl->svr.Get(R"(/api/creature/(\d+)/organs)", [this](const httplib::Request& req, httplib::Response& res) {
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
				int organCount = biochem->GetOrganCount();
				json << "{\"organCount\":" << organCount;
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
						<< ",\"initialLifeForce\":" << organ->InitialLifeForce()
						<< ",\"longTermRateOfRepair\":" << organ->LongTermRateOfRepair()
						<< ",\"energyCost\":" << organ->EnergyCost()
						<< ",\"damageDueToZeroEnergy\":" << organ->DamageDueToZeroEnergy()
						<< ",\"functioning\":" << (organ->Functioning() ? "true" : "false")
						<< ",\"failed\":" << (organ->Failed() ? "true" : "false")
						<< ",\"receptorCount\":" << organ->ReceptorCount()
						<< ",\"emitterCount\":" << organ->EmitterCount()
						<< ",\"reactionCount\":" << organ->ReactionCount();

					// Receptors (per receptor group, then per receptor in each group)
					json << ",\"receptors\":[";
					int groupCount = organ->ReceptorGroupCount();
					bool firstR = true;
					for (int g = 0; g < groupCount; ++g) {
						const Receptors& rGroup = organ->GetReceptorGroup(g);
						for (int j = 0; j < (int)rGroup.size(); ++j) {
							const Receptor* r = rGroup[j];
							if (!r) continue;
							if (!firstR) json << ",";
							firstR = false;
							json << "{\"organ\":" << r->IDOrgan
								<< ",\"tissue\":" << r->IDTissue
								<< ",\"locus\":" << r->IDLocus
								<< ",\"chemical\":" << r->Chem
								<< ",\"threshold\":" << r->Threshold
								<< ",\"nominal\":" << r->Nominal
								<< ",\"gain\":" << r->Gain
								<< ",\"effect\":" << r->Effect
								<< "}";
						}
					}
					json << "]";

					// Emitters
					json << ",\"emitters\":[";
					for (int e = 0; e < organ->EmitterCount(); ++e) {
						const Emitter& em = organ->GetEmitter(e);
						if (e > 0) json << ",";
						json << "{\"organ\":" << em.IDOrgan
							<< ",\"tissue\":" << em.IDTissue
							<< ",\"locus\":" << em.IDLocus
							<< ",\"chemical\":" << em.Chem
							<< ",\"threshold\":" << em.Threshold
							<< ",\"gain\":" << em.Gain
							<< ",\"effect\":" << em.Effect
							<< ",\"bioTickRate\":" << em.bioTickRate
							<< "}";
					}
					json << "]";

					// Reactions
					json << ",\"reactions\":[";
					for (int r = 0; r < organ->ReactionCount(); ++r) {
						const Reaction& rn = organ->GetReaction(r);
						if (r > 0) json << ",";
						json << "{\"r1\":" << rn.R1
							<< ",\"propR1\":" << rn.propR1
							<< ",\"r2\":" << rn.R2
							<< ",\"propR2\":" << rn.propR2
							<< ",\"p1\":" << rn.P1
							<< ",\"propP1\":" << rn.propP1
							<< ",\"p2\":" << rn.P2
							<< ",\"propP2\":" << rn.propP2
							<< ",\"rate\":" << rn.Rate
							<< "}";
					}
					json << "]";

					json << "}";
				}
				json << "]}";
				return json.str();
			} catch (...) {
				return "{\"error\":\"Failed to read organs\"}";
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

	// ── GET /api/creature/:id/brain/lobe/:lobeIdx/neuron/:neuronIdx ──
	// Returns deep detail about a specific neuron: all state variables,
	// SVRule definitions (decompiled to pseudo-code), and connected dendrites.
	myImpl->svr.Get(R"(/api/creature/(\d+)/brain/lobe/(\d+)/neuron/(\d+))", [this](const httplib::Request& req, httplib::Response& res) {
		int agentId = std::stoi(req.matches[1]);
		int lobeIdx = std::stoi(req.matches[2]);
		int neuronIdx = std::stoi(req.matches[3]);

		auto* item = new WorkItem();
		item->work = [agentId, lobeIdx, neuronIdx]() -> std::string {
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

				int nCount = lobe->GetNoOfNeurons();
				if (neuronIdx < 0 || neuronIdx >= nCount) {
					return "{\"error\":\"Neuron index out of range\"}";
				}

				Neuron* neuron = lobe->GetNeuron(neuronIdx);
				if (!neuron) return "{\"error\":\"Neuron not found\"}";

				// ── Neuron state variable names ──
				static const char* STATE_NAMES[] = {
					"state", "input", "output", "var3", "var4", "var5", "var6", "ngf"
				};
				static const char* DENDRITE_WEIGHT_NAMES[] = {
					"stw", "ltw", "var2", "var3", "var4", "var5", "var6", "strength"
				};

				// ── SVRule decompiler helper lambdas ──
				static const char* OPCODE_NAMES[] = {
					"stop", "blank", "store", "load",
					"if==", "if!=", "if>", "if<", "if>=", "if<=",
					"if0", "if!0", "if>0", "if<0", "if>=0", "if<=0",
					"add", "sub", "subFrom", "mul", "div", "divInto", "min", "max",
					"setRate", "tend", "neg", "abs", "dist", "flip",
					"nop", "setSpr", "bound01", "bound±1", "addStore", "tendStore",
					"threshold", "leak", "rest", "gain", "persist", "noise", "wta", "setSTLT",
					"setLTST", "storeAbs",
					"if0Stop", "if!0Stop", "if0Goto", "if!0Goto",
					"divAddNI", "mulAddNI", "goto",
					"if<Stop", "if>Stop", "if<=Stop", "if>=Stop",
					"setRwdThr", "setRwdRate", "setRwdChem", "setPunThr", "setPunRate", "setPunChem",
					"preserve", "restore", "preserveSpr", "restoreSpr",
					"if<0Goto", "if>0Goto"
				};
				static const char* OPERAND_NAMES[] = {
					"acc", "input", "dend", "neuron", "spare",
					"random",
					"chem[src+]", "chem", "chem[dst+]",
					"0", "1",
					"val", "-val", "val*10", "val/10", "valInt"
				};

				auto decompileSVRule = [](const SVRule& rule) -> std::string {
					std::ostringstream out;
					out << "[";
					int ruleLen = SVRule::GetLength();
					bool first = true;
					for (int i = 0; i < ruleLen; ++i) {
						const SVRuleEntry& e = rule.GetEntry(i);
						// Stop on stopImmediately with no prior content
						if (e.opCode == 0 && i == 0) break;

						if (!first) out << ",";
						first = false;

						// Build human-readable line
						std::string opName = (e.opCode >= 0 && e.opCode < SVRule::noOfOpCodes)
							? OPCODE_NAMES[e.opCode] : "???";
						std::string operandName = (e.operandVariable >= 0 && e.operandVariable < SVRule::noOfOperands)
							? OPERAND_NAMES[e.operandVariable] : "???";

						out << "{\"op\":\"" << JsonEscape(opName)
							<< "\",\"operand\":\"" << JsonEscape(operandName)
							<< "\",\"idx\":" << e.arrayIndex
							<< ",\"val\":" << e.floatValue
							<< ",\"opCode\":" << e.opCode
							<< ",\"operandCode\":" << e.operandVariable
							<< "}";

						// Stop after a stopImmediately opcode
						if (e.opCode == 0) break;
					}
					out << "]";
					return out.str();
				};

				std::ostringstream json;
				std::string lobeName(lobe->GetName());

				json << "{\"lobeIndex\":" << lobeIdx
					<< ",\"lobeName\":\"" << JsonEscape(lobeName) << "\""
					<< ",\"neuronId\":" << neuron->idInList
					<< ",\"neuronCount\":" << nCount
					<< ",\"winner\":" << lobe->GetWhichNeuronWon()
					<< ",\"isWinner\":" << (neuron->idInList == lobe->GetWhichNeuronWon() ? "true" : "false")
					<< ",\"tissueId\":" << lobe->GetTissueId();

				// ── State variables with names ──
				json << ",\"states\":[";
				for (int s = 0; s < NUM_SVRULE_VARIABLES; ++s) {
					if (s > 0) json << ",";
					json << "{\"name\":\"" << STATE_NAMES[s]
						<< "\",\"value\":" << neuron->states[s] << "}";
				}
				json << "]";

				// ── SVRules (lobe-level — apply to all neurons in this lobe) ──
				json << ",\"initRule\":" << decompileSVRule(lobe->GetInitRule());
				json << ",\"updateRule\":" << decompileSVRule(lobe->GetUpdateRule());

				// ── Dendrite connections to/from this neuron ──
				json << ",\"connections\":[";
				bool firstConn = true;
				int tractCount = brain->GetTractCount();
				for (int t = 0; t < tractCount; ++t) {
					Tract* tract = brain->GetTract(t);
					if (!tract) continue;

					Lobe* srcLobe = tract->GetSrcLobe();
					Lobe* dstLobe = tract->GetDstLobe();
					if (!srcLobe || !dstLobe) continue;

					// Check if this lobe is involved in this tract
					int srcLobeIdx = -1, dstLobeIdx = -1;
					for (int li = 0; li < brain->GetLobeCount(); ++li) {
						if (brain->GetLobe(li) == srcLobe) srcLobeIdx = li;
						if (brain->GetLobe(li) == dstLobe) dstLobeIdx = li;
					}

					bool isSrc = (srcLobe == lobe);
					bool isDst = (dstLobe == lobe);
					if (!isSrc && !isDst) continue;

					int dCount = tract->GetDendriteCount();
					for (int d = 0; d < dCount; ++d) {
						Dendrite* dendrite = tract->GetDendrite(d);
						if (!dendrite) continue;

						int srcId = dendrite->srcNeuron ? dendrite->srcNeuron->idInList : -1;
						int dstId = dendrite->dstNeuron ? dendrite->dstNeuron->idInList : -1;

						// Filter: only dendrites connected to our neuron
						if (isSrc && srcId != neuronIdx && !(isDst && dstId == neuronIdx)) continue;
						if (!isSrc && isDst && dstId != neuronIdx) continue;

						if (!firstConn) json << ",";
						firstConn = false;

						std::string direction;
						if (isSrc && srcId == neuronIdx && isDst && dstId == neuronIdx)
							direction = "self";
						else if ((isSrc && srcId == neuronIdx))
							direction = "outgoing";
						else
							direction = "incoming";

						json << "{\"tractIndex\":" << t
							<< ",\"tractName\":\"" << JsonEscape(std::string(tract->GetName())) << "\""
							<< ",\"direction\":\"" << direction << "\""
							<< ",\"srcLobeIdx\":" << srcLobeIdx
							<< ",\"srcLobe\":\"" << JsonEscape(std::string(srcLobe->GetName())) << "\""
							<< ",\"dstLobeIdx\":" << dstLobeIdx
							<< ",\"dstLobe\":\"" << JsonEscape(std::string(dstLobe->GetName())) << "\""
							<< ",\"srcNeuron\":" << srcId
							<< ",\"dstNeuron\":" << dstId
							<< ",\"weights\":[";
						for (int w = 0; w < NUM_SVRULE_VARIABLES; ++w) {
							if (w > 0) json << ",";
							json << "{\"name\":\"" << DENDRITE_WEIGHT_NAMES[w]
								<< "\",\"value\":" << dendrite->weights[w] << "}";
						}
						json << "]}";
					}
				}
				json << "]";

				// ── Tract SVRules for each connected tract (init + update) ──
				json << ",\"tractRules\":[";
				bool firstTract = true;
				std::set<int> seenTracts;
				for (int t = 0; t < tractCount; ++t) {
					Tract* tract = brain->GetTract(t);
					if (!tract) continue;
					Lobe* srcLobe = tract->GetSrcLobe();
					Lobe* dstLobe = tract->GetDstLobe();
					if (srcLobe != lobe && dstLobe != lobe) continue;
					if (seenTracts.count(t)) continue;
					seenTracts.insert(t);

					if (!firstTract) json << ",";
					firstTract = false;

					json << "{\"tractIndex\":" << t
						<< ",\"tractName\":\"" << JsonEscape(std::string(tract->GetName())) << "\""
						<< ",\"initRule\":" << decompileSVRule(tract->GetInitRule())
						<< ",\"updateRule\":" << decompileSVRule(tract->GetUpdateRule())
						<< "}";
				}
				json << "]";

				json << "}";
				return json.str();
			} catch (...) {
				return "{\"error\":\"Failed to read neuron detail\"}";
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
					bool wroteAnything = false;
					while (startIdx < myImpl->logBuffer.size()) {
						std::string event = "data: " + myImpl->logBuffer[startIdx] + "\n\n";
						sink.write(event.c_str(), event.size());
						startIdx++;
						wroteAnything = true;
					}

					// Send heartbeat if idle to detect disconnected clients and free the C++ thread
					if (!wroteAnything && myImpl->running) {
						std::string ping = ": keepalive\n\n";
						sink.write(ping.c_str(), ping.size());
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
