// ---------------------------------------------------------------------------
// test_IntegrationTier3.cpp — Tier 3 headless integration tests
//
// Tier 3 tests require a Docked world with bootstrapped agents and creatures.
// They validate: world loading, agent enumeration, map system integrity,
// COS script execution, and agent creation.
//
// IMPORTANT: Unlike Tier 1/2 which copy game data to a temp directory,
// Tier 3 tests run against the ORIGINAL game directory. This is required
// because Creature Gallery files (.creaturegallery) use memory-mapped I/O
// and cannot be reliably copied. Tests are designed to be non-destructive
// — they only read state or create transient agents that are discarded
// when the engine is killed without saving.
//
// The RunCosScriptExecution test is the exception — it copies the game
// directory WITHOUT creature gallery files and boots into Startup (which
// has no creatures), avoiding the mmap issue entirely.
//
// Prerequisites:
//   - The lc2e binary must be built
//   - CREATURES_GAME_DIR must point to a valid Docking Station directory
//     that contains at least one saved world in My Worlds/
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
#include <dirent.h>
#include <fcntl.h>
#include <fstream>
#include <signal.h>
#include <sstream>
#include <string>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>
#include <vector>

// Vendored httplib for HTTP client — same header the engine uses.
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
#undef CPPHTTPLIB_OPENSSL_SUPPORT
#endif
#include "../engine/contrib/httplib.h"

// ---------------------------------------------------------------------------
// Helpers
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



// Create a temp copy of the game dir WITHOUT creature gallery files.
// Suitable for Startup-only tests (COS scripts, etc.) where creatures
// aren't loaded.
static std::string CreateGameDirCopyNoGalleries(const std::string& gameDir) {
	char tmpl[] = "/tmp/lc2e_inttest_XXXXXX";
	char* tmpDir = mkdtemp(tmpl);
	if (!tmpDir) return "";

	std::string dest(tmpDir);

	// Use rsync to exclude creature gallery binaries
	std::string cmd = "rsync -a --exclude='Creature Galleries/*.creaturegallery'"
	                  " '" + gameDir + "/' '" + dest + "/'";
	if (system(cmd.c_str()) != 0) return "";

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
// JSON helpers
// ---------------------------------------------------------------------------

static int ExtractJsonInt(const std::string& json, const std::string& key) {
	std::string searchKey = "\"" + key + "\":";
	size_t pos = json.find(searchKey);
	if (pos == std::string::npos) return -1;
	pos += searchKey.size();
	while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
	try { return std::stoi(json.substr(pos)); }
	catch (...) { return -1; }
}

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
//
// Tier 3 tests run the engine against the ORIGINAL game directory (not a
// copy). This is necessary because creature gallery files use memory-mapped
// I/O and crash when loaded from a copied directory.
//
// Tests are non-destructive: the engine is killed with SIGKILL before it
// can write a save file, preserving the original world state.
// ---------------------------------------------------------------------------
class IntegrationTier3 : public ::testing::Test {
protected:
	pid_t enginePid = -1;
	std::string tempDir;           // Only used by COS script test
	int apiPort = 9980;
	std::string dockedWorldName;   // Set in SetUp via health probe

	void SetUp() override {
		std::string gameDir = GetGameDataDir();
		if (gameDir.empty()) {
			GTEST_SKIP() << "CREATURES_GAME_DIR not set or invalid — "
			             << "set it to your Docking Station game directory "
			             << "to run integration tests";
		}

		std::string worldsDir = gameDir + "/My Worlds";
		std::string startupDir = worldsDir + "/Startup";
		
		struct stat st;
		if (stat(startupDir.c_str(), &st) != 0) {
			GTEST_SKIP() << "Startup world not found in game directory";
		}

		dockedWorldName = "__Tier3_TestWorld__";
		std::string testWorldDir = worldsDir + "/" + dockedWorldName;

		std::string rmCmd = "rm -rf '" + testWorldDir + "'";
		system(rmCmd.c_str());

		std::string cpCmd = "cp -R '" + startupDir + "' '" + testWorldDir + "'";
		if (system(cpCmd.c_str()) != 0) {
			dockedWorldName = "";
			GTEST_SKIP() << "Failed to copy Startup world";
		}
	}

	// Launch engine from the real game dir with -w <world>
	pid_t LaunchEngineReal(const std::string& worldName,
	                       int maxTicks = 0) {
		std::string binary = FindEngineBinary();
		std::string gameDir = GetGameDataDir();

		std::vector<std::string> args;
		args.push_back(binary);
		args.push_back("-d");
		args.push_back(gameDir);
		args.push_back("--headless");
		args.push_back("-w");
		args.push_back(worldName);

		if (maxTicks > 0) {
			args.push_back("--max-ticks");
			args.push_back(std::to_string(maxTicks));
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

	// Launch into a Docked world (from real game dir) and wait for API
	bool LaunchIntoWorld(const std::string& worldName,
	                     int waitSeconds = 30) {
		enginePid = LaunchEngineReal(worldName);
		if (enginePid <= 0) return false;
		return WaitForAPI(apiPort, waitSeconds);
	}

	// Launch engine with custom args from a given directory
	pid_t LaunchEngineFromDir(const std::string& dir,
	                          const std::vector<std::string>& extraArgs = {}) {
		std::string binary = FindEngineBinary();

		std::vector<std::string> args;
		args.push_back(binary);
		args.push_back("-d");
		args.push_back(dir);
		args.push_back("--headless");

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

	std::string ExecuteCAOS(httplib::Client& cli, const std::string& caos) {
		auto res = cli.Post("/api/execute",
		                     "{\"caos\":\"" + caos + "\"}",
		                     "application/json");
		if (!res || res->status != 200) return "";
		return res->body;
	}

	httplib::Client MakeClient() {
		httplib::Client cli("localhost", apiPort);
		cli.set_connection_timeout(2, 0);
		cli.set_read_timeout(15, 0);
		return cli;
	}

	void TearDown() override {
		if (enginePid > 0) {
			// SIGKILL (not SIGTERM) to prevent the engine from saving
			// and modifying the user's world data
			kill(enginePid, SIGKILL);
			int status = 0;
			waitpid(enginePid, &status, 0);
			enginePid = -1;
		}

		// Clean up the temporary test world
		if (!dockedWorldName.empty()) {
			std::string gameDir = GetGameDataDir();
			std::string rmCmd = "rm -rf '" + gameDir + "/My Worlds/" + dockedWorldName + "'";
			system(rmCmd.c_str());
		}

		if (!tempDir.empty()) {
			RemoveTempDir(tempDir);
			tempDir.clear();
		}
	}
};

// ---------------------------------------------------------------------------
// Test 1: Docked world loads and boots directly via -w flag
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, DockedWorldBootsDirect) {
	if (dockedWorldName.empty()) {
		GTEST_SKIP() << "No healthy saved world found — create a world first";
	}

	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName))
	    << "Engine failed to boot into world '" << dockedWorldName << "'";

	auto cli = MakeClient();

	// Verify we're in the correct world
	auto tickRes = cli.Get("/api/world/tick");
	ASSERT_NE(tickRes, nullptr);
	std::string currentWorld = ExtractJsonString(tickRes->body, "worldName");
	EXPECT_EQ(currentWorld, dockedWorldName)
	    << "Expected world '" << dockedWorldName << "', got '"
	    << currentWorld << "'";

	int tick = ExtractJsonInt(tickRes->body, "worldTick");
	EXPECT_GE(tick, 0)
	    << "worldTick should be >= 0, got: " << tick;
}

// ---------------------------------------------------------------------------
// Test 2: Docked world exits cleanly with --max-ticks
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, DockedWorldExitsWithMaxTicks) {
	if (dockedWorldName.empty()) {
		GTEST_SKIP() << "No healthy saved world found — create a world first";
	}

	enginePid = LaunchEngineReal(dockedWorldName, /*maxTicks=*/10);
	ASSERT_GT(enginePid, 0);

	// Wait for the process to exit on its own (timeout: 60s)
	auto deadline = std::chrono::steady_clock::now() +
	                std::chrono::seconds(60);
	int status = 0;
	pid_t result = 0;

	while (std::chrono::steady_clock::now() < deadline) {
		result = waitpid(enginePid, &status, WNOHANG);
		if (result == enginePid) break;
		std::this_thread::sleep_for(std::chrono::milliseconds(200));
	}

	if (result != enginePid) {
		kill(enginePid, SIGKILL);
		waitpid(enginePid, &status, 0);
		enginePid = -1;
		FAIL() << "Engine did not exit within 60s with --max-ticks 10";
	}

	enginePid = -1;
	ASSERT_TRUE(WIFEXITED(status)) << "Engine did not exit normally";
	EXPECT_EQ(WEXITSTATUS(status), 1)
	    << "Engine exited with unexpected status (expected 1 = success)";
}

// ---------------------------------------------------------------------------
// Test 3: Agent enumeration in a Docked world
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, AgentEnumeration) {
	if (dockedWorldName.empty()) {
		GTEST_SKIP() << "No healthy saved world found — create a world first";
	}

	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName))
	    << "Engine failed to boot into world";

	auto cli = MakeClient();

	// Count all agents using CAOS: enum 0 0 0
	std::string countResult = ExecuteCAOS(cli,
	    "setv va00 0 enum 0 0 0 addv va00 1 next outv va00");
	ASSERT_FALSE(countResult.empty()) << "CAOS execute returned empty";
	EXPECT_NE(countResult.find("\"ok\":true"), std::string::npos)
	    << "Agent enumeration failed: " << countResult;

	std::string output = ExtractJsonString(countResult, "output");
	int agentCount = 0;
	try { agentCount = std::stoi(output); } catch (...) {}

	EXPECT_GT(agentCount, 0)
	    << "Expected at least 1 agent in a Docked world, got: '"
	    << output << "'";

	// Count creature agents (family 4)
	std::string creatureResult = ExecuteCAOS(cli,
	    "setv va00 0 enum 4 0 0 addv va00 1 next outv va00");
	ASSERT_FALSE(creatureResult.empty());
	EXPECT_NE(creatureResult.find("\"ok\":true"), std::string::npos)
	    << "Creature enumeration failed: " << creatureResult;
}

// ---------------------------------------------------------------------------
// Test 4: Map system integrity
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, MapSystemIntegrity) {
	if (dockedWorldName.empty()) {
		GTEST_SKIP() << "No healthy saved world found — create a world first";
	}

	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName))
	    << "Engine failed to boot into world";

	auto cli = MakeClient();

	// Query map width
	std::string mapwResult = ExecuteCAOS(cli, "outv mapw");
	ASSERT_FALSE(mapwResult.empty());
	EXPECT_NE(mapwResult.find("\"ok\":true"), std::string::npos)
	    << "mapw query failed: " << mapwResult;

	std::string mapwOutput = ExtractJsonString(mapwResult, "output");
	int mapWidth = 0;
	try { mapWidth = std::stoi(mapwOutput); } catch (...) {}
	EXPECT_GT(mapWidth, 0)
	    << "Map width should be positive, got: '" << mapwOutput << "'";

	// Query map height
	std::string maphResult = ExecuteCAOS(cli, "outv maph");
	ASSERT_FALSE(maphResult.empty());
	EXPECT_NE(maphResult.find("\"ok\":true"), std::string::npos)
	    << "maph query failed: " << maphResult;

	std::string maphOutput = ExtractJsonString(maphResult, "output");
	int mapHeight = 0;
	try { mapHeight = std::stoi(maphOutput); } catch (...) {}
	EXPECT_GT(mapHeight, 0)
	    << "Map height should be positive, got: '" << maphOutput << "'";

	// Query room at interior position
	std::string gmapResult = ExecuteCAOS(cli, "outv gmap 5000 5000");
	ASSERT_FALSE(gmapResult.empty());
	EXPECT_NE(gmapResult.find("\"ok\":true"), std::string::npos)
	    << "gmap query failed: " << gmapResult;
}

// ---------------------------------------------------------------------------
// Test 5: World stats endpoint reports meaningful data
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, WorldStatsEndpoint) {
	if (dockedWorldName.empty()) {
		GTEST_SKIP() << "No healthy saved world found — create a world first";
	}

	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName))
	    << "Engine failed to boot into world";

	auto cli = MakeClient();

	auto statsRes = cli.Get("/api/world/stats");
	ASSERT_NE(statsRes, nullptr) << "GET /api/world/stats returned null";
	ASSERT_EQ(statsRes->status, 200);

	std::string body = statsRes->body;

	EXPECT_NE(body.find("\"worldTick\":"), std::string::npos)
	    << "Missing worldTick in stats: " << body;
	EXPECT_NE(body.find("\"worldName\":"), std::string::npos)
	    << "Missing worldName in stats: " << body;
	EXPECT_NE(body.find("\"creatureCount\":"), std::string::npos)
	    << "Missing creatureCount in stats: " << body;
	EXPECT_NE(body.find("\"norns\":"), std::string::npos)
	    << "Missing norns in stats: " << body;
	EXPECT_NE(body.find("\"paused\":"), std::string::npos)
	    << "Missing paused in stats: " << body;

	std::string statsWorldName = ExtractJsonString(body, "worldName");
	EXPECT_EQ(statsWorldName, dockedWorldName)
	    << "Stats world name mismatch";
}

// ---------------------------------------------------------------------------
// Test 6: COS script execution via --run-cos
// Uses a temp copy (without creature galleries) booting into Startup only.
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, RunCosScriptExecution) {
	std::string gameDir = GetGameDataDir();
	ASSERT_FALSE(gameDir.empty());

	// Create temp copy without creature gallery binaries (Startup has no creatures)
	tempDir = CreateGameDirCopyNoGalleries(gameDir);
	ASSERT_FALSE(tempDir.empty()) << "Failed to create temp game dir";

	// Write a COS file that sets a game variable
	std::string cosPath = tempDir + "/test_integ.cos";
	{
		std::ofstream cos(cosPath);
		ASSERT_TRUE(cos.is_open()) << "Failed to create COS file: " << cosPath;
		cos << "* Test integration script\n"
		    << "setv game \"cos_script_ran\" 54321\n";
		cos.close();
	}

	// Launch from temp dir with --run-cos
	enginePid = LaunchEngineFromDir(tempDir, {"--run-cos", cosPath});
	ASSERT_GT(enginePid, 0) << "Failed to fork engine";

	bool apiReady = WaitForAPI(apiPort, 30);
	ASSERT_TRUE(apiReady) << "API not available after --run-cos boot";

	auto cli = MakeClient();

	std::string getResult = ExecuteCAOS(cli,
	    "outv game \\\"cos_script_ran\\\"");
	ASSERT_FALSE(getResult.empty());
	EXPECT_NE(getResult.find("\"ok\":true"), std::string::npos)
	    << "Failed to read game variable set by COS script: " << getResult;

	std::string output = ExtractJsonString(getResult, "output");
	EXPECT_NE(output.find("54321"), std::string::npos)
	    << "COS script game variable mismatch. Expected '54321', got: '"
	    << output << "'";
}

// ---------------------------------------------------------------------------
// Test 7: Agent creation via CAOS in a Docked world
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier3, AgentCreationViaCaos) {
	if (dockedWorldName.empty()) {
		GTEST_SKIP() << "No healthy saved world found — create a world first";
	}

	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName))
	    << "Engine failed to boot into world";

	auto cli = MakeClient();

	// Count specific agents before
	std::string beforeResult = ExecuteCAOS(cli,
	    "setv va00 0 enum 99 99 99 addv va00 1 next outv va00");
	ASSERT_NE(beforeResult.find("\"ok\":true"), std::string::npos);
	std::string beforeOutput = ExtractJsonString(beforeResult, "output");
	int beforeCount = 0;
	try { beforeCount = std::stoi(beforeOutput); } catch (...) {}

	// Create a simple agent (family=99, genus=99, species=99)
	std::string createResult = ExecuteCAOS(cli,
	    "new: simp 99 99 99 \\\"blnk\\\" 1 0 0");
	EXPECT_NE(createResult.find("\"ok\":true"), std::string::npos)
	    << "Agent creation failed: " << createResult;

	// Count specific agents after — should be one more
	std::string afterResult = ExecuteCAOS(cli,
	    "setv va00 0 enum 99 99 99 addv va00 1 next outv va00");
	ASSERT_NE(afterResult.find("\"ok\":true"), std::string::npos);
	std::string afterOutput = ExtractJsonString(afterResult, "output");
	int afterCount = 0;
	try { afterCount = std::stoi(afterOutput); } catch (...) {}

	EXPECT_EQ(afterCount, beforeCount + 1)
	    << "Agent count for 99/99/99 should increase by 1 after creation: before="
	    << beforeCount << " after=" << afterCount;
}
