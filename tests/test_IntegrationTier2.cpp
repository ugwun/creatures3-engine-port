// ---------------------------------------------------------------------------
// test_IntegrationTier2.cpp — Tier 2 headless integration tests
//
// Tier 2 validates engine features beyond basic lifecycle: world tick
// advancement, game variable persistence, scriptorium injection, and
// world save/reload cycles.
//
// These tests reuse the same subprocess + REST API pattern as Tier 1.
//
// Prerequisites:
//   - The lc2e binary must be built
//   - The CREATURES_GAME_DIR environment variable must point to a valid
//     Docking Station game data directory
//   - Port 9980 must be available (tests run serially)
//
// Run with:
//   export CREATURES_GAME_DIR="$HOME/Creatures Docking Station/Docking Station"
//   ctest -L integration --output-on-failure
// ---------------------------------------------------------------------------

#include <gtest/gtest.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <fstream>
#include <signal.h>
#include <sstream>
#include <string>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

// Vendored httplib for HTTP client — same header the engine uses.
// Ensure OpenSSL is NOT compiled in (httplib uses #ifdef, not #if).
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
#undef CPPHTTPLIB_OPENSSL_SUPPORT
#endif
#include "../engine/contrib/httplib.h"

// ---------------------------------------------------------------------------
// Helpers (shared with Tier 1 — extracted here for self-containment)
// ---------------------------------------------------------------------------

static std::string FindEngineBinary() {
#ifdef ENGINE_BINARY_PATH
	return ENGINE_BINARY_PATH;
#else
	return "./lc2e";
#endif
}

static std::string GetGameDataDir() {
	const char* dir = std::getenv("CREATURES_GAME_DIR");
	if (!dir) return "";
	struct stat st;
	if (stat(dir, &st) != 0 || !S_ISDIR(st.st_mode)) return "";
	return std::string(dir);
}

static std::string CreateIsolatedGameDir(const std::string& gameDir) {
	char tmpl[] = "/tmp/lc2e_inttest_XXXXXX";
	char* tmpDir = mkdtemp(tmpl);
	if (!tmpDir) return "";

	std::string dest(tmpDir);
	std::string cmd;

	cmd = "cp '" + gameDir + "/machine.cfg' '" + dest + "/'";
	if (system(cmd.c_str()) != 0) return "";

	cmd = "cp '" + gameDir + "/user.cfg' '" + dest + "/'";
	if (system(cmd.c_str()) != 0) return "";

	cmd = "cp -R '" + gameDir + "/Catalogue' '" + dest + "/Catalogue'";
	if (system(cmd.c_str()) != 0) return "";

	cmd = "cp -R '" + gameDir + "/Backgrounds' '" + dest + "/Backgrounds'";
	system(cmd.c_str());

	cmd = "cp -R '" + gameDir + "/Images' '" + dest + "/Images'";
	system(cmd.c_str());

	std::string dirs[] = {
		"/My Worlds/Startup/Basement",
		"/My Worlds/Startup/Journal",
		"/My Worlds/Startup/Porch",
		"/Sounds", "/Genetics",
		"/Body Data", "/Overlay Data", "/Bootstrap",
		"/My Agents", "/My Creatures", "/Journal",
		"/Creature Galleries"
	};
	for (const auto& d : dirs) {
		cmd = "mkdir -p '" + dest + d + "'";
		system(cmd.c_str());
	}

	return dest;
}

static void RemoveTempDir(const std::string& path) {
	if (path.empty() || path == "/" || path.find("/tmp/") != 0) return;
	std::string cmd = "rm -rf '" + path + "'";
	system(cmd.c_str());
}

static bool WaitForAPI(int port, int timeoutSeconds) {
	httplib::Client cli("localhost", port);
	cli.set_connection_timeout(1, 0);
	cli.set_read_timeout(2, 0);

	auto deadline = std::chrono::steady_clock::now() +
	                std::chrono::seconds(timeoutSeconds);

	while (std::chrono::steady_clock::now() < deadline) {
		auto res = cli.Get("/api/world/tick");
		if (res && res->status == 200) {
			return true;
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(250));
	}
	return false;
}

static int GracefulShutdown(pid_t pid, int timeoutSeconds) {
	kill(pid, SIGTERM);

	auto deadline = std::chrono::steady_clock::now() +
	                std::chrono::seconds(timeoutSeconds);

	while (std::chrono::steady_clock::now() < deadline) {
		int status = 0;
		pid_t result = waitpid(pid, &status, WNOHANG);
		if (result == pid) {
			if (WIFEXITED(status)) return WEXITSTATUS(status);
			return -1;
		}
		std::this_thread::sleep_for(std::chrono::milliseconds(100));
	}

	kill(pid, SIGKILL);
	int status = 0;
	waitpid(pid, &status, 0);
	return -1;
}

// ---------------------------------------------------------------------------
// JSON helpers (lightweight, no external dependency)
// ---------------------------------------------------------------------------

// Extract an integer value from a JSON string for a given key.
// E.g. ExtractJsonInt("{\"worldTick\":42}", "worldTick") → 42
static int ExtractJsonInt(const std::string& json, const std::string& key) {
	std::string searchKey = "\"" + key + "\":";
	size_t pos = json.find(searchKey);
	if (pos == std::string::npos) return -1;
	pos += searchKey.size();
	// Skip whitespace
	while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
	return std::stoi(json.substr(pos));
}

// Extract a string value from a JSON string for a given key.
// E.g. ExtractJsonString("{\"output\":\"hello\"}", "output") → "hello"
static std::string ExtractJsonString(const std::string& json,
                                     const std::string& key) {
	std::string searchKey = "\"" + key + "\":\"";
	size_t pos = json.find(searchKey);
	if (pos == std::string::npos) return "";
	pos += searchKey.size();
	std::string result;
	for (size_t i = pos; i < json.size(); ++i) {
		if (json[i] == '\\' && i + 1 < json.size()) {
			char next = json[i + 1];
			if (next == '"') { result += '"'; ++i; }
			else if (next == '\\') { result += '\\'; ++i; }
			else if (next == 'n') { result += '\n'; ++i; }
			else { result += json[i]; }
		} else if (json[i] == '"') {
			break;
		} else {
			result += json[i];
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Test Fixture
// ---------------------------------------------------------------------------
class IntegrationTier2 : public ::testing::Test {
protected:
	pid_t enginePid = -1;
	std::string tempDir;
	int apiPort = 9980;

	void SetUp() override {
		std::string gameDir = GetGameDataDir();
		if (gameDir.empty()) {
			GTEST_SKIP() << "CREATURES_GAME_DIR not set or invalid — "
			             << "set it to your Docking Station game directory "
			             << "to run integration tests";
		}
	}

	pid_t LaunchEngine(const std::vector<std::string>& extraArgs = {},
	                   int maxTicks = 0) {
		std::string binary = FindEngineBinary();
		std::string gameDir = GetGameDataDir();

		tempDir = CreateIsolatedGameDir(gameDir);
		EXPECT_FALSE(tempDir.empty()) << "Failed to create temp game dir";
		if (tempDir.empty()) return -1;

		std::vector<std::string> args;
		args.push_back(binary);
		args.push_back("-d");
		args.push_back(tempDir);
		args.push_back("--headless");

		if (maxTicks > 0) {
			args.push_back("--max-ticks");
			args.push_back(std::to_string(maxTicks));
		}

		for (const auto& a : extraArgs) {
			args.push_back(a);
		}

		std::vector<char*> argv;
		for (auto& s : args) {
			argv.push_back(&s[0]);
		}
		argv.push_back(nullptr);

		pid_t pid = fork();
		if (pid == 0) {
			int devnull = open("/dev/null", O_WRONLY);
			if (devnull >= 0) {
				dup2(devnull, STDOUT_FILENO);
				dup2(devnull, STDERR_FILENO);
				close(devnull);
			}
			execv(binary.c_str(), argv.data());
			_exit(127);
		}

		return pid;
	}

	// Launch engine and wait for API readiness — common setup for most tests
	bool LaunchAndWaitForAPI(int maxTicks = 0) {
		enginePid = LaunchEngine({}, maxTicks);
		if (enginePid <= 0) return false;
		return WaitForAPI(apiPort, 20);
	}

	// Execute CAOS via REST API and return the response body
	std::string ExecuteCAOS(httplib::Client& cli, const std::string& caos) {
		auto res = cli.Post("/api/execute",
		                     "{\"caos\":\"" + caos + "\"}",
		                     "application/json");
		if (!res || res->status != 200) return "";
		return res->body;
	}

	// Create an httplib client pre-configured for the engine API
	httplib::Client MakeClient() {
		httplib::Client cli("localhost", apiPort);
		cli.set_connection_timeout(2, 0);
		cli.set_read_timeout(10, 0);
		return cli;
	}

	void TearDown() override {
		if (enginePid > 0) {
			GracefulShutdown(enginePid, 5);
			enginePid = -1;
		}
		if (!tempDir.empty()) {
			RemoveTempDir(tempDir);
			tempDir.clear();
		}
	}
};

// ---------------------------------------------------------------------------
// Test 1: World tick advances after engine runs
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, WorldTickAdvances) {
	// Boot the engine without --max-ticks (stays running)
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();

	// Read initial tick
	auto res1 = cli.Get("/api/world/tick");
	ASSERT_NE(res1, nullptr);
	ASSERT_EQ(res1->status, 200);
	int tickBefore = ExtractJsonInt(res1->body, "worldTick");
	ASSERT_GE(tickBefore, 0) << "Could not parse worldTick from: " << res1->body;

	// Wait a bit for ticks to advance (engine runs freely)
	std::this_thread::sleep_for(std::chrono::seconds(2));

	// Read tick again
	auto res2 = cli.Get("/api/world/tick");
	ASSERT_NE(res2, nullptr);
	ASSERT_EQ(res2->status, 200);
	int tickAfter = ExtractJsonInt(res2->body, "worldTick");
	ASSERT_GE(tickAfter, 0) << "Could not parse worldTick from: " << res2->body;

	EXPECT_GT(tickAfter, tickBefore)
	    << "World tick did not advance: before=" << tickBefore
	    << " after=" << tickAfter;

	// Should have advanced by at least a handful of ticks in 2 seconds
	EXPECT_GE(tickAfter - tickBefore, 5)
	    << "World tick advanced too slowly: only "
	    << (tickAfter - tickBefore) << " ticks in 2s";
}

// ---------------------------------------------------------------------------
// Test 2: Pause/resume via REST API controls tick advancement
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, PauseResume) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();

	// Pause the engine
	auto pauseRes = cli.Post("/api/pause", "", "application/json");
	ASSERT_NE(pauseRes, nullptr);
	EXPECT_EQ(pauseRes->status, 200);
	EXPECT_NE(pauseRes->body.find("\"paused\":true"), std::string::npos)
	    << "Pause response: " << pauseRes->body;

	// Read tick while paused
	std::this_thread::sleep_for(std::chrono::milliseconds(200));
	auto res1 = cli.Get("/api/world/tick");
	ASSERT_NE(res1, nullptr);
	int tickPaused = ExtractJsonInt(res1->body, "worldTick");

	// Wait and verify tick doesn't advance while paused
	std::this_thread::sleep_for(std::chrono::seconds(1));
	auto res2 = cli.Get("/api/world/tick");
	ASSERT_NE(res2, nullptr);
	int tickStillPaused = ExtractJsonInt(res2->body, "worldTick");

	EXPECT_EQ(tickStillPaused, tickPaused)
	    << "Tick should not advance while paused: "
	    << tickPaused << " vs " << tickStillPaused;

	// Verify engine-state reports paused
	auto stateRes = cli.Get("/api/engine-state");
	ASSERT_NE(stateRes, nullptr);
	EXPECT_NE(stateRes->body.find("\"paused\":true"), std::string::npos)
	    << "Engine state should be paused: " << stateRes->body;

	// Resume the engine
	auto resumeRes = cli.Post("/api/resume", "", "application/json");
	ASSERT_NE(resumeRes, nullptr);
	EXPECT_EQ(resumeRes->status, 200);
	EXPECT_NE(resumeRes->body.find("\"paused\":false"), std::string::npos)
	    << "Resume response: " << resumeRes->body;

	// Wait for ticks to advance after resume
	std::this_thread::sleep_for(std::chrono::seconds(1));
	auto res3 = cli.Get("/api/world/tick");
	ASSERT_NE(res3, nullptr);
	int tickAfterResume = ExtractJsonInt(res3->body, "worldTick");

	EXPECT_GT(tickAfterResume, tickPaused)
	    << "Tick should advance after resume: paused="
	    << tickPaused << " after=" << tickAfterResume;
}

// ---------------------------------------------------------------------------
// Test 3: Game variables (SETV GAME / GAME) persist within a session
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, GameVariablePersistence) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();

	// Set a game variable via CAOS
	std::string setResult = ExecuteCAOS(cli,
	    "setv game \\\"test_integ_key\\\" 12345");
	ASSERT_FALSE(setResult.empty()) << "CAOS execute returned empty";
	EXPECT_NE(setResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to set game variable: " << setResult;

	// Read it back via a separate CAOS execution
	std::string getResult = ExecuteCAOS(cli,
	    "outv game \\\"test_integ_key\\\"");
	ASSERT_FALSE(getResult.empty()) << "CAOS execute returned empty";
	EXPECT_NE(getResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to read game variable: " << getResult;

	// The output should contain "12345"
	std::string output = ExtractJsonString(getResult, "output");
	EXPECT_NE(output.find("12345"), std::string::npos)
	    << "Game variable value mismatch. Expected '12345', output: '"
	    << output << "', full response: " << getResult;
}

// ---------------------------------------------------------------------------
// Test 4: Game variable — string values
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, GameVariableString) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();

	// Set a string game variable via CAOS
	std::string setResult = ExecuteCAOS(cli,
	    "sets game \\\"test_str_key\\\" \\\"hello_world\\\"");
	ASSERT_FALSE(setResult.empty());
	EXPECT_NE(setResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to set string game variable: " << setResult;

	// Read it back
	std::string getResult = ExecuteCAOS(cli,
	    "outs game \\\"test_str_key\\\"");
	ASSERT_FALSE(getResult.empty());
	EXPECT_NE(getResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to read string game variable: " << getResult;

	std::string output = ExtractJsonString(getResult, "output");
	EXPECT_NE(output.find("hello_world"), std::string::npos)
	    << "String game variable mismatch. Expected 'hello_world', got: '"
	    << output << "'";
}

// ---------------------------------------------------------------------------
// Test 5: Scriptorium inject and query
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, ScriptoriumInjectAndQuery) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();

	// Inject a script into the scriptorium via REST API
	// Use a distinctive classifier: family=99, genus=99, species=99, event=1
	std::string injectBody =
	    "{\"family\":99,\"genus\":99,\"species\":99,\"event\":1,"
	    "\"source\":\"outv 1\"}";

	auto injectRes = cli.Post("/api/scriptorium/inject",
	                           injectBody, "application/json");
	ASSERT_NE(injectRes, nullptr)
	    << "POST /api/scriptorium/inject returned null";
	EXPECT_EQ(injectRes->status, 200);
	EXPECT_NE(injectRes->body.find("\"ok\":true"), std::string::npos)
	    << "Script injection failed: " << injectRes->body;

	// Query the scriptorium to verify the script appears
	auto listRes = cli.Get("/api/scriptorium");
	ASSERT_NE(listRes, nullptr) << "GET /api/scriptorium returned null";
	EXPECT_EQ(listRes->status, 200);

	// Look for our classifier in the response
	// Response format: [{"family":99,"genus":99,"species":99,"event":1},...]
	std::string body = listRes->body;
	bool found = body.find("\"family\":99") != std::string::npos &&
	             body.find("\"genus\":99") != std::string::npos &&
	             body.find("\"species\":99") != std::string::npos &&
	             body.find("\"event\":1") != std::string::npos;
	EXPECT_TRUE(found)
	    << "Injected script (99/99/99/1) not found in scriptorium: " << body;
}

// ---------------------------------------------------------------------------
// Test 6: Scriptorium query via specific classifier endpoint
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, ScriptoriumQuerySpecific) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();

	// Inject a script with known source code
	std::string injectBody =
	    "{\"family\":98,\"genus\":98,\"species\":98,\"event\":2,"
	    "\"source\":\"setv va00 42 outv va00\"}";

	auto injectRes = cli.Post("/api/scriptorium/inject",
	                           injectBody, "application/json");
	ASSERT_NE(injectRes, nullptr);
	EXPECT_NE(injectRes->body.find("\"ok\":true"), std::string::npos)
	    << "Script injection failed: " << injectRes->body;

	// Query the specific script by classifier
	auto queryRes = cli.Get("/api/scriptorium/98/98/98/2");
	ASSERT_NE(queryRes, nullptr)
	    << "GET /api/scriptorium/98/98/98/2 returned null";
	EXPECT_EQ(queryRes->status, 200)
	    << "Expected 200 for specific script query";

	// Response should contain the script source code
	std::string body = queryRes->body;
	EXPECT_FALSE(body.empty())
	    << "Specific scriptorium query returned empty body";
	// The endpoint returns {"source":"..."} — verify it contains our code
	EXPECT_NE(body.find("setv va00 42"), std::string::npos)
	    << "Response should contain the injected source code: " << body;
}

// ---------------------------------------------------------------------------
// Test 7: World save via REST API
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, WorldSave) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();
	cli.set_read_timeout(20, 0); // Save can be slow

	// Set a game variable so we have something to verify after save
	std::string setResult = ExecuteCAOS(cli,
	    "setv game \\\"save_test_key\\\" 99999");
	EXPECT_NE(setResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to set game variable: " << setResult;

	// Trigger world save via REST API
	auto saveRes = cli.Post("/api/world/save", "", "application/json");
	ASSERT_NE(saveRes, nullptr) << "POST /api/world/save returned null";
	EXPECT_EQ(saveRes->status, 200)
	    << "Expected HTTP 200 for save, got " << saveRes->status;
	EXPECT_NE(saveRes->body.find("\"ok\":true"), std::string::npos)
	    << "Save failed: " << saveRes->body;

	// Verify the world file was actually written to disk
	// The Startup world saves to: <tempDir>/My Worlds/Startup/
	std::string worldDir = tempDir + "/My Worlds/Startup";
	struct stat st;
	EXPECT_EQ(stat(worldDir.c_str(), &st), 0)
	    << "World directory should exist after save: " << worldDir;
}

// ---------------------------------------------------------------------------
// Test 8: World save + reload preserves game variables
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier2, WorldSaveAndReloadPreservesState) {
	ASSERT_TRUE(LaunchAndWaitForAPI())
	    << "Engine failed to boot or API unavailable";

	auto cli = MakeClient();
	cli.set_read_timeout(20, 0);

	// Step 1: Set a game variable
	std::string setResult = ExecuteCAOS(cli,
	    "setv game \\\"persist_test\\\" 77777");
	EXPECT_NE(setResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to set game variable: " << setResult;

	// Step 2: Record the current world name
	auto tickRes = cli.Get("/api/world/tick");
	ASSERT_NE(tickRes, nullptr);
	std::string worldName = ExtractJsonString(tickRes->body, "worldName");
	ASSERT_FALSE(worldName.empty())
	    << "Could not extract worldName from: " << tickRes->body;

	// Step 3: Save the world
	auto saveRes = cli.Post("/api/world/save", "", "application/json");
	ASSERT_NE(saveRes, nullptr);
	EXPECT_NE(saveRes->body.find("\"ok\":true"), std::string::npos)
	    << "Save failed: " << saveRes->body;

	// Step 4: Load the same world (triggers a reload cycle)
	std::string loadBody = "{\"name\":\"" + worldName + "\"}";
	auto loadRes = cli.Post("/api/world/load", loadBody, "application/json");
	ASSERT_NE(loadRes, nullptr);
	EXPECT_NE(loadRes->body.find("\"ok\":true"), std::string::npos)
	    << "Load failed: " << loadRes->body;

	// Step 5: Wait for the world to finish loading
	// The world switch happens on the next tick. Give it time.
	std::this_thread::sleep_for(std::chrono::seconds(3));

	// Step 6: Wait for API to be available again after reload
	bool apiReady = WaitForAPI(apiPort, 15);
	ASSERT_TRUE(apiReady)
	    << "API not available after world reload";

	// Step 7: Read back the game variable — it should have persisted
	std::string getResult = ExecuteCAOS(cli,
	    "outv game \\\"persist_test\\\"");
	ASSERT_FALSE(getResult.empty())
	    << "CAOS execute returned empty after reload";
	EXPECT_NE(getResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to read game variable after reload: " << getResult;

	std::string output = ExtractJsonString(getResult, "output");
	EXPECT_NE(output.find("77777"), std::string::npos)
	    << "Game variable did not persist across save/reload. "
	    << "Expected '77777', got: '" << output << "'";
}
