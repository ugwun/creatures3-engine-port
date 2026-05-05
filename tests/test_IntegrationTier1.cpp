// ---------------------------------------------------------------------------
// test_IntegrationTier1.cpp — Tier 1 headless integration tests
//
// These tests launch the real lc2e engine binary in --headless mode and
// validate basic lifecycle, REST API health, and CAOS execution via HTTP.
//
// Prerequisites:
//   - The lc2e binary must be built
//   - The CREATURES_GAME_DIR environment variable must point to a valid
//     Docking Station game data directory (e.g. ~/Creatures Docking Station/
//     Docking Station).  Tests are SKIPPED if this is not set.
//   - Port 9980 must be available (tests run serially)
//
// These tests are NOT part of the default ctest run.
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
// Helpers
// ---------------------------------------------------------------------------

// Resolve the absolute path of the lc2e binary.
static std::string FindEngineBinary() {
#ifdef ENGINE_BINARY_PATH
	return ENGINE_BINARY_PATH;
#else
	return "./lc2e";
#endif
}

// Get the game data directory from environment, or empty if not set.
static std::string GetGameDataDir() {
	const char* dir = std::getenv("CREATURES_GAME_DIR");
	if (!dir) return "";
	// Verify it exists
	struct stat st;
	if (stat(dir, &st) != 0 || !S_ISDIR(st.st_mode)) return "";
	return std::string(dir);
}

// Create an isolated temporary copy of the game data directory.
// We copy machine.cfg, user.cfg, Catalogue/, and an empty Startup world.
// This avoids modifying the user's real game data.
static std::string CreateIsolatedGameDir(const std::string& gameDir) {
	char tmpl[] = "/tmp/lc2e_inttest_XXXXXX";
	char* tmpDir = mkdtemp(tmpl);
	if (!tmpDir) return "";

	std::string dest(tmpDir);

	// Copy config files
	std::string cmd;
	cmd = "cp '" + gameDir + "/machine.cfg' '" + dest + "/'";
	if (system(cmd.c_str()) != 0) return "";

	cmd = "cp '" + gameDir + "/user.cfg' '" + dest + "/'";
	if (system(cmd.c_str()) != 0) return "";

	// Copy Catalogue directory (needed for engine init)
	cmd = "cp -R '" + gameDir + "/Catalogue' '" + dest + "/Catalogue'";
	if (system(cmd.c_str()) != 0) return "";

	// Copy Backgrounds (engine loads bg images even in headless via Map init)
	cmd = "cp -R '" + gameDir + "/Backgrounds' '" + dest + "/Backgrounds'";
	system(cmd.c_str()); // OK if missing

	// Copy Images (pointer sprite, etc.)
	cmd = "cp -R '" + gameDir + "/Images' '" + dest + "/Images'";
	system(cmd.c_str()); // OK if missing

	// Create remaining required directory structure
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

// Remove a temporary directory tree.
static void RemoveTempDir(const std::string& path) {
	if (path.empty() || path == "/" || path.find("/tmp/") != 0) return;
	std::string cmd = "rm -rf '" + path + "'";
	system(cmd.c_str());
}

// Wait for the REST API to become reachable (GET /api/world/tick).
// Returns true if the API responded within the timeout.
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

// Send SIGTERM to a process and wait for it to exit (with timeout).
// Returns the exit status, or -1 if the process had to be killed.
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

	// Process didn't exit — force kill
	kill(pid, SIGKILL);
	int status = 0;
	waitpid(pid, &status, 0);
	return -1;
}

// ---------------------------------------------------------------------------
// Test Fixture — launches and manages the engine subprocess
// ---------------------------------------------------------------------------
class IntegrationTier1 : public ::testing::Test {
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

	// Fork and exec lc2e with the given arguments.
	// Returns the child PID, or -1 on failure.
	pid_t LaunchEngine(const std::vector<std::string>& extraArgs = {},
	                   int maxTicks = 0) {
		std::string binary = FindEngineBinary();
		std::string gameDir = GetGameDataDir();

		// Create an isolated temp copy of the game directory
		tempDir = CreateIsolatedGameDir(gameDir);
		EXPECT_FALSE(tempDir.empty()) << "Failed to create temp game dir";
		if (tempDir.empty()) return -1;

		// Build argv
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

		// Convert to C-style argv
		std::vector<char*> argv;
		for (auto& s : args) {
			argv.push_back(&s[0]);
		}
		argv.push_back(nullptr);

		pid_t pid = fork();
		if (pid == 0) {
			// Child: redirect stdout/stderr to /dev/null to avoid noise
			int devnull = open("/dev/null", O_WRONLY);
			if (devnull >= 0) {
				dup2(devnull, STDOUT_FILENO);
				dup2(devnull, STDERR_FILENO);
				close(devnull);
			}
			execv(binary.c_str(), argv.data());
			_exit(127); // execv failed
		}

		return pid;
	}

	void TearDown() override {
		// Ensure engine is stopped
		if (enginePid > 0) {
			GracefulShutdown(enginePid, 5);
			enginePid = -1;
		}
		// Clean up temp directory
		if (!tempDir.empty()) {
			RemoveTempDir(tempDir);
			tempDir.clear();
		}
	}
};

// ---------------------------------------------------------------------------
// Test 1: Engine boots in headless mode and exits cleanly with --max-ticks
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier1, EngineBootsAndExitsCleanly) {
	// Launch with --max-ticks 5 — should boot, run 5 ticks, save, and exit
	enginePid = LaunchEngine({}, /* maxTicks */ 5);
	ASSERT_GT(enginePid, 0) << "Failed to fork engine process";

	// Wait for the process to exit on its own (timeout: 30 seconds)
	auto deadline = std::chrono::steady_clock::now() +
	                std::chrono::seconds(30);
	int status = 0;
	pid_t result = 0;

	while (std::chrono::steady_clock::now() < deadline) {
		result = waitpid(enginePid, &status, WNOHANG);
		if (result == enginePid) break;
		std::this_thread::sleep_for(std::chrono::milliseconds(200));
	}

	if (result != enginePid) {
		// Timed out — kill and fail
		kill(enginePid, SIGKILL);
		waitpid(enginePid, &status, 0);
		enginePid = -1;
		FAIL() << "Engine did not exit within 30 seconds";
	}

	enginePid = -1; // Already exited
	ASSERT_TRUE(WIFEXITED(status)) << "Engine did not exit normally";
	// The engine returns TRUE (1) on success — see SDL_Main.cpp main()
	EXPECT_EQ(WEXITSTATUS(status), 1)
	    << "Engine exited with unexpected status code";
}

// ---------------------------------------------------------------------------
// Test 2: REST API responds after headless boot
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier1, RestApiResponds) {
	// Launch without --max-ticks so the engine stays running
	enginePid = LaunchEngine();
	ASSERT_GT(enginePid, 0) << "Failed to fork engine process";

	// Wait for the API to come up
	bool apiReady = WaitForAPI(apiPort, 20);
	ASSERT_TRUE(apiReady) << "REST API did not become available within 20s";

	// Query the world tick endpoint
	httplib::Client cli("localhost", apiPort);
	cli.set_connection_timeout(2, 0);
	cli.set_read_timeout(5, 0);

	auto res = cli.Get("/api/world/tick");
	ASSERT_NE(res, nullptr) << "GET /api/world/tick returned null";
	EXPECT_EQ(res->status, 200) << "Expected HTTP 200, got " << res->status;

	// Verify response is valid JSON containing worldTick
	std::string body = res->body;
	EXPECT_NE(body.find("\"worldTick\""), std::string::npos)
	    << "Response body missing 'worldTick' field: " << body;
}

// ---------------------------------------------------------------------------
// Test 3: CAOS execution via REST API — integer output
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier1, CaosExecutionViaRest) {
	enginePid = LaunchEngine();
	ASSERT_GT(enginePid, 0) << "Failed to fork engine process";

	bool apiReady = WaitForAPI(apiPort, 20);
	ASSERT_TRUE(apiReady) << "REST API did not become available within 20s";

	httplib::Client cli("localhost", apiPort);
	cli.set_connection_timeout(2, 0);
	cli.set_read_timeout(10, 0);

	// Execute simple CAOS: outv 42
	auto res = cli.Post("/api/execute",
	                     "{\"caos\":\"outv 42\"}",
	                     "application/json");
	ASSERT_NE(res, nullptr) << "POST /api/execute returned null";
	EXPECT_EQ(res->status, 200) << "Expected HTTP 200, got " << res->status;

	std::string body = res->body;

	// Verify ok:true
	EXPECT_NE(body.find("\"ok\":true"), std::string::npos)
	    << "CAOS execution not ok: " << body;

	// Verify output contains "42"
	EXPECT_NE(body.find("42"), std::string::npos)
	    << "CAOS output missing '42': " << body;
}

// ---------------------------------------------------------------------------
// Test 4: CAOS string output
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier1, CaosStringOutput) {
	enginePid = LaunchEngine();
	ASSERT_GT(enginePid, 0) << "Failed to fork engine process";

	bool apiReady = WaitForAPI(apiPort, 20);
	ASSERT_TRUE(apiReady) << "REST API did not become available within 20s";

	httplib::Client cli("localhost", apiPort);
	cli.set_connection_timeout(2, 0);
	cli.set_read_timeout(10, 0);

	// Execute CAOS: outs "hello"
	auto res = cli.Post("/api/execute",
	                     "{\"caos\":\"outs \\\"hello\\\"\"}",
	                     "application/json");
	ASSERT_NE(res, nullptr) << "POST /api/execute returned null";
	EXPECT_EQ(res->status, 200);

	std::string body = res->body;
	EXPECT_NE(body.find("\"ok\":true"), std::string::npos)
	    << "CAOS execution not ok: " << body;
	EXPECT_NE(body.find("hello"), std::string::npos)
	    << "CAOS output missing 'hello': " << body;
}

// ---------------------------------------------------------------------------
// Test 5: CAOS arithmetic expression
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier1, CaosArithmetic) {
	enginePid = LaunchEngine();
	ASSERT_GT(enginePid, 0) << "Failed to fork engine process";

	bool apiReady = WaitForAPI(apiPort, 20);
	ASSERT_TRUE(apiReady) << "REST API did not become available within 20s";

	httplib::Client cli("localhost", apiPort);
	cli.set_connection_timeout(2, 0);
	cli.set_read_timeout(10, 0);

	// Execute CAOS: setv va00 10 addv va00 32 outv va00
	auto res = cli.Post("/api/execute",
	                     "{\"caos\":\"setv va00 10 addv va00 32 outv va00\"}",
	                     "application/json");
	ASSERT_NE(res, nullptr) << "POST /api/execute returned null";
	EXPECT_EQ(res->status, 200);

	std::string body = res->body;
	EXPECT_NE(body.find("\"ok\":true"), std::string::npos)
	    << "CAOS execution not ok: " << body;
	EXPECT_NE(body.find("42"), std::string::npos)
	    << "CAOS output missing '42' (10+32): " << body;
}

// ---------------------------------------------------------------------------
// Test 6: CAOS syntax error returns ok:false
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier1, CaosSyntaxError) {
	enginePid = LaunchEngine();
	ASSERT_GT(enginePid, 0) << "Failed to fork engine process";

	bool apiReady = WaitForAPI(apiPort, 20);
	ASSERT_TRUE(apiReady) << "REST API did not become available within 20s";

	httplib::Client cli("localhost", apiPort);
	cli.set_connection_timeout(2, 0);
	cli.set_read_timeout(10, 0);

	// Execute invalid CAOS
	auto res = cli.Post("/api/execute",
	                     "{\"caos\":\"this is not valid caos\"}",
	                     "application/json");
	ASSERT_NE(res, nullptr) << "POST /api/execute returned null";
	EXPECT_EQ(res->status, 200) << "Expected HTTP 200 even for CAOS errors";

	std::string body = res->body;
	EXPECT_NE(body.find("\"ok\":false"), std::string::npos)
	    << "Invalid CAOS should return ok:false: " << body;
}
