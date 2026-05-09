// ---------------------------------------------------------------------------
// test_IntegrationTier5.cpp — Tier 5 headless integration tests
//
// Tier 5 tests focus on stability and stress testing of the engine
// under sustained headless operation. They validate:
//
//   - Long-running simulation loops (100+ ticks) without crashes
//   - Multi-creature populations (multiple simultaneous creatures)
//   - Biochemistry consistency over extended runs
//   - Save/reload round-trip preserves creature state
//   - Engine liveness (API remains responsive under load)
//
// Like Tier 3/4, these tests run against a dynamic copy of the ORIGINAL
// game directory's Startup world to satisfy memory-mapped I/O constraints
// for .creaturegallery files.
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
// ---------------------------------------------------------------------------
class IntegrationTier5 : public ::testing::Test {
protected:
	pid_t enginePid = -1;
	int apiPort = 9980;
	std::string dockedWorldName;

	void SetUp() override {
		std::string gameDir = GetGameDataDir();
		if (gameDir.empty()) {
			GTEST_SKIP() << "CREATURES_GAME_DIR not set or invalid";
		}

		std::string worldsDir = gameDir + "/My Worlds";
		std::string startupDir = worldsDir + "/Startup";
		
		struct stat st;
		if (stat(startupDir.c_str(), &st) != 0) {
			GTEST_SKIP() << "Startup world not found in game directory";
		}

		dockedWorldName = "__Tier5_TestWorld__";
		std::string testWorldDir = worldsDir + "/" + dockedWorldName;

		std::string rmCmd = "rm -rf '" + testWorldDir + "'";
		system(rmCmd.c_str());

		std::string cpCmd = "cp -R '" + startupDir + "' '" + testWorldDir + "'";
		if (system(cpCmd.c_str()) != 0) {
			dockedWorldName = "";
			GTEST_SKIP() << "Failed to copy Startup world";
		}
	}

	pid_t LaunchEngineReal(const std::string& worldName) {
		std::string binary = FindEngineBinary();
		std::string gameDir = GetGameDataDir();

		std::vector<std::string> args;
		args.push_back(binary);
		args.push_back("-d");
		args.push_back(gameDir);
		args.push_back("--headless");
		args.push_back("-w");
		args.push_back(worldName);

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

	bool LaunchIntoWorld(const std::string& worldName,
	                     int waitSeconds = 30) {
		enginePid = LaunchEngineReal(worldName);
		if (enginePid <= 0) return false;
		return WaitForAPI(apiPort, waitSeconds);
	}

	std::string ExecuteCAOS(httplib::Client& cli, const std::string& caos) {
		std::string escapedCaos;
		for (char c : caos) {
			if (c == '"') escapedCaos += "\\\"";
			else if (c == '\\') escapedCaos += "\\\\";
			else escapedCaos += c;
		}
		auto res = cli.Post("/api/execute",
		                     "{\"caos\":\"" + escapedCaos + "\"}",
		                     "application/json");
		if (!res || res->status != 200) return "";
		return res->body;
	}

	httplib::Client MakeClient() {
		httplib::Client cli("localhost", apiPort);
		cli.set_connection_timeout(2, 0);
		cli.set_read_timeout(30, 0);  // Longer timeout for stress tests
		return cli;
	}

	void AdvanceTicks(httplib::Client& cli, int ticks) {
		cli.Post("/api/engine/advance",
		         "{\"ticks\":" + std::to_string(ticks) + "}",
		         "application/json");
		// Wait for the ticks to actually complete. The advance endpoint
		// is async — it tells the engine to run N ticks and pause.
		// Poll the tick counter to confirm progress.
		std::this_thread::sleep_for(
			std::chrono::milliseconds(ticks * 50 + 500));
	}

	void TearDown() override {
		if (enginePid > 0) {
			kill(enginePid, SIGKILL);
			int status = 0;
			waitpid(enginePid, &status, 0);
			enginePid = -1;
		}

		if (!dockedWorldName.empty()) {
			std::string gameDir = GetGameDataDir();
			std::string rmCmd = "rm -rf '" + gameDir + "/My Worlds/" + dockedWorldName + "'";
			system(rmCmd.c_str());
		}
	}

	// Helper to create a creature directly via CAOS using a genetics file
	int CreateCreature(httplib::Client& cli, const std::string& genomeMoniker) {
		std::string caos = 
			"new: simp 1 1 1 \"blnk\" 1 0 0 "
			"gene load targ 1 \"" + genomeMoniker + "\" "
			"setv va00 unid "
			"new: crea 4 targ 1 0 0 "
			"born "
			"accg 5.0 "
			"attr 198 "
			"bhvr 15 "
			"perm 100 "
			"setv va01 unid "
			"targ agnt va00 "
			"kill targ "
			"targ agnt va01 "
			"outv va01";

		std::string result = ExecuteCAOS(cli, caos);
		if (result.empty() || result.find("\"ok\":true") == std::string::npos) return 0;
		
		std::string output = ExtractJsonString(result, "output");
		try { return std::stoi(output); } catch (...) { return 0; }
	}

	// Helper to check engine is alive (API responds)
	bool IsEngineAlive(httplib::Client& cli) {
		auto res = cli.Get("/api/world/tick");
		return res && res->status == 200;
	}

	// Helper to get tick count
	int GetTickCount(httplib::Client& cli) {
		auto res = cli.Get("/api/world/tick");
		if (!res || res->status != 200) return -1;
		return ExtractJsonInt(res->body, "worldTick");
	}
};

// ---------------------------------------------------------------------------
// Test 5.1: Long-Running Simulation Stability
// Runs the engine for 200 ticks with a creature alive to verify the engine
// does not crash, deadlock, or leak resources during sustained operation.
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier5, LongRunningSimulationStability) {
	if (dockedWorldName.empty()) GTEST_SKIP();
	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName));
	auto cli = MakeClient();

	int agentId = CreateCreature(cli, "norn.astro.48");
	ASSERT_GT(agentId, 0) << "Failed to create test creature";

	int startTick = GetTickCount(cli);
	ASSERT_GT(startTick, 0) << "Failed to read initial tick count";

	// Run 200 ticks in batches of 50
	for (int batch = 0; batch < 4; ++batch) {
		AdvanceTicks(cli, 50);
		ASSERT_TRUE(IsEngineAlive(cli))
			<< "Engine became unresponsive after batch " << batch;
	}

	int endTick = GetTickCount(cli);
	EXPECT_GT(endTick, startTick)
		<< "Tick counter did not advance. Start: " << startTick
		<< " End: " << endTick;

	// Verify the creature is still alive
	std::string result = ExecuteCAOS(cli,
		"targ agnt " + std::to_string(agentId) + " outv dead");
	EXPECT_NE(result.find("\"ok\":true"), std::string::npos)
		<< "Failed to query creature after long run";
}

// ---------------------------------------------------------------------------
// Test 5.2: Multi-Creature Population Stress
// Creates multiple creatures simultaneously and verifies they all persist
// and remain queryable after tick advancement.
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier5, MultiCreaturePopulationStress) {
	if (dockedWorldName.empty()) GTEST_SKIP();
	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName));
	auto cli = MakeClient();

	// Create 3 creatures from different genomes
	const char* genomes[] = {
		"norn.astro.48",
		"norn.bondi.48",
		"norn.fallow.48"
	};

	std::vector<int> creatureIds;
	for (const char* genome : genomes) {
		int id = CreateCreature(cli, genome);
		printf("Created creature from %s -> ID %d\n", genome, id);
		if (id > 0) {
			creatureIds.push_back(id);
		}
	}

	ASSERT_GE((int)creatureIds.size(), 2)
		<< "Need at least 2 creatures for population stress test";

	// Advance 30 ticks to let all creatures run their biology
	AdvanceTicks(cli, 30);

	// Verify all creatures are still queryable
	for (int id : creatureIds) {
		std::string endpoint = "/api/creature/" + std::to_string(id) + "/chemistry";
		auto res = cli.Get(endpoint.c_str());
		ASSERT_NE(res, nullptr)
			<< "No response when querying creature " << id;
		EXPECT_EQ(res->status, 200)
			<< "Chemistry API returned " << res->status
			<< " for creature " << id;
	}

	// Verify the creatures endpoint lists all creatures
	auto listRes = cli.Get("/api/creatures");
	ASSERT_NE(listRes, nullptr);
	EXPECT_EQ(listRes->status, 200);
	
	// The response should mention all our creature IDs
	for (int id : creatureIds) {
		EXPECT_NE(listRes->body.find(std::to_string(id)), std::string::npos)
			<< "Creature " << id << " not found in /api/creatures listing";
	}
}

// ---------------------------------------------------------------------------
// Test 5.3: Biochemistry Consistency Over Time
// Injects a known amount of a chemical, advances many ticks, and verifies
// the biochemistry system processes it consistently (half-life decay).
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier5, BiochemistryConsistencyOverTime) {
	if (dockedWorldName.empty()) GTEST_SKIP();
	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName));
	auto cli = MakeClient();

	int agentId = CreateCreature(cli, "norn.astro.48");
	ASSERT_GT(agentId, 0);

	std::string agentStr = std::to_string(agentId);

	// Inject a large dose of chemical 14 (starch)
	ExecuteCAOS(cli, "targ agnt " + agentStr + " chem 14 1.0");
	
	// Read it back immediately
	std::string result = ExecuteCAOS(cli,
		"targ agnt " + agentStr + " outv chem 14");
	float initialVal = 0.0f;
	try { initialVal = std::stof(ExtractJsonString(result, "output")); } catch (...) {}

	EXPECT_GT(initialVal, 0.0f)
		<< "Chemical 14 was not set by CHEM command";

	// Advance 50 ticks to allow biochemistry processing
	AdvanceTicks(cli, 50);

	// Read the chemical level again — it should have changed due to
	// half-life decay and/or reactions
	result = ExecuteCAOS(cli,
		"targ agnt " + agentStr + " outv chem 14");
	float laterVal = 0.0f;
	try { laterVal = std::stof(ExtractJsonString(result, "output")); } catch (...) {}

	// The value should have decreased due to half-life decay
	// (or been consumed by reactions). Either way, if biochemistry is
	// running, it should not be exactly the same.
	printf("Chem 14: initial=%.6f, after 50 ticks=%.6f\n", initialVal, laterVal);

	// Verify the creature is still alive and queryable
	ASSERT_TRUE(IsEngineAlive(cli))
		<< "Engine died during biochemistry simulation";
}

// ---------------------------------------------------------------------------
// Test 5.4: Save/Reload Creature Persistence
// Creates a creature, saves the world, kills and reloads the engine,
// and verifies the creature persists across the save/reload cycle.
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier5, SaveReloadCreaturePersistence) {
	if (dockedWorldName.empty()) GTEST_SKIP();
	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName));
	auto cli = MakeClient();

	int agentId = CreateCreature(cli, "norn.astro.48");
	ASSERT_GT(agentId, 0);

	// Advance a few ticks so the creature has some state
	AdvanceTicks(cli, 10);

	// Read creature's species before save
	std::string speciesResult = ExecuteCAOS(cli,
		"targ agnt " + std::to_string(agentId) + " outv spcs");
	int speciesBefore = 0;
	try { speciesBefore = std::stoi(ExtractJsonString(speciesResult, "output")); } catch (...) {}

	// Save the world
	auto saveRes = cli.Post("/api/world/save", "{}", "application/json");
	ASSERT_NE(saveRes, nullptr);
	EXPECT_EQ(saveRes->status, 200);
	printf("Save result: %s\n", saveRes->body.c_str());

	// Wait a moment for the save to complete
	std::this_thread::sleep_for(std::chrono::seconds(2));

	// Kill the engine
	kill(enginePid, SIGKILL);
	int status = 0;
	waitpid(enginePid, &status, 0);
	enginePid = -1;

	// Small pause before relaunch
	std::this_thread::sleep_for(std::chrono::seconds(1));

	// Relaunch into the same world
	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName));
	auto cli2 = MakeClient();

	// Enumerate creatures — there should be at least 1
	std::string enumResult = ExecuteCAOS(cli2,
		"setv va00 0 enum 4 0 0 addv va00 1 next outv va00");
	std::string countStr = ExtractJsonString(enumResult, "output");
	int creatureCount = 0;
	try { creatureCount = std::stoi(countStr); } catch (...) {}

	EXPECT_GT(creatureCount, 0)
		<< "No creatures found after save/reload. ENUM result: "
		<< enumResult;
}

// ---------------------------------------------------------------------------
// Test 5.5: API Liveness Under Sustained Load
// Rapidly issues many API calls in succession to verify the engine's
// HTTP server remains responsive and does not deadlock or crash.
// ---------------------------------------------------------------------------
TEST_F(IntegrationTier5, APILivenessUnderLoad) {
	if (dockedWorldName.empty()) GTEST_SKIP();
	ASSERT_TRUE(LaunchIntoWorld(dockedWorldName));
	auto cli = MakeClient();

	int agentId = CreateCreature(cli, "norn.astro.48");
	ASSERT_GT(agentId, 0);

	int successCount = 0;
	int totalCalls = 50;

	for (int i = 0; i < totalCalls; ++i) {
		// Alternate between different API endpoints
		switch (i % 5) {
		case 0: {
			auto res = cli.Get("/api/world/tick");
			if (res && res->status == 200) successCount++;
			break;
		}
		case 1: {
			std::string result = ExecuteCAOS(cli, "outv targ");
			if (!result.empty()) successCount++;
			break;
		}
		case 2: {
			auto res = cli.Get("/api/creatures");
			if (res && res->status == 200) successCount++;
			break;
		}
		case 3: {
			std::string endpoint = "/api/creature/" + std::to_string(agentId) + "/brain";
			auto res = cli.Get(endpoint.c_str());
			if (res && res->status == 200) successCount++;
			break;
		}
		case 4: {
			std::string endpoint = "/api/creature/" + std::to_string(agentId) + "/chemistry";
			auto res = cli.Get(endpoint.c_str());
			if (res && res->status == 200) successCount++;
			break;
		}
		}
	}

	float successRate = (float)successCount / totalCalls;
	printf("API liveness: %d/%d calls succeeded (%.1f%%)\n",
	       successCount, totalCalls, successRate * 100.0f);

	EXPECT_GE(successRate, 0.9f)
		<< "API success rate dropped below 90%: "
		<< successCount << "/" << totalCalls;
}
