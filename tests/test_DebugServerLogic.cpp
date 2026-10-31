#include <gtest/gtest.h>

#include "DebugServerLogic.h"
#include "DebugServerWork.h"
#include "FlightRecorderJson.h"
#include "contrib/json.hpp"

#include <chrono>
#include <set>
#include <string>
#include <thread>

TEST(DebugServerLogicTest, ExtractsCarriageReturnDelimitedStatement) {
	EXPECT_EQ(
		DebugServerLogic::ExtractSourceStatement(
			"setv va00 1\r  wait 20  \rstop", 17),
		"wait 20");
}

TEST(DebugServerLogicTest, ExtractsLineFeedDelimitedStatement) {
	EXPECT_EQ(
		DebugServerLogic::ExtractSourceStatement(
			"setv va00 1\n  over\nstop", 18),
		"over");
}

TEST(DebugServerLogicTest, HandlesCrLfAndBoundaryPositions) {
	EXPECT_EQ(
		DebugServerLogic::ExtractSourceStatement(
			"first\r\nsecond\r\nthird", 8),
		"second");
	EXPECT_EQ(
		DebugServerLogic::ExtractSourceStatement("only", -50),
		"only");
	EXPECT_EQ(
		DebugServerLogic::ExtractSourceStatement("only", 500),
		"only");
}

TEST(DebugServerLogicTest, EmptyOrWhitespaceStatementsStayEmpty) {
	EXPECT_EQ(DebugServerLogic::ExtractSourceStatement("", 0), "");
	EXPECT_EQ(DebugServerLogic::ExtractSourceStatement("first\r   \rthird", 8), "");
}

TEST(DebugServerLogicTest, SeparatesLogSeverityFromSubsystemCategory) {
	EXPECT_EQ(DebugServerLogic::ClassifyLogSeverity(4, "World loaded"), "info");
	EXPECT_EQ(
		DebugServerLogic::ClassifyLogSeverity(4, "[WARN] Missing room"),
		"warning");
	EXPECT_EQ(DebugServerLogic::ClassifyLogSeverity(1, "Runtime"), "error");
	EXPECT_EQ(DebugServerLogic::ClassifyLogSeverity(64, "Signal"), "critical");
	EXPECT_EQ(DebugServerLogic::LogSubsystemLabel(4), "world");
	EXPECT_EQ(DebugServerLogic::LogSubsystemLabel(8), "caos");
}

TEST(DebugServerLogicTest, PreviewsChemicalAdjustmentWithEngineClamping) {
	DebugServerLogic::ChemicalInterventionPreview preview =
		DebugServerLogic::PreviewChemicalIntervention(
			35, "adjust", 0.95f, 0.10f, false);
	EXPECT_FALSE(preview.valid);
	EXPECT_TRUE(preview.requiresConfirmation);
	EXPECT_TRUE(preview.clamped);
	EXPECT_FLOAT_EQ(preview.requestedChange, 0.10f);
	EXPECT_FLOAT_EQ(preview.projectedValue, 1.0f);

	preview = DebugServerLogic::PreviewChemicalIntervention(
		35, "adjust", 0.95f, 0.10f, true);
	EXPECT_TRUE(preview.valid);
	EXPECT_EQ(
		preview.warning,
		"The engine will clamp the immediate concentration to the 0–1 range");
}

TEST(DebugServerLogicTest, PreviewsChemicalTargetAndRejectsReservedSlot) {
	DebugServerLogic::ChemicalInterventionPreview preview =
		DebugServerLogic::PreviewChemicalIntervention(
			35, "target", 0.20f, 0.50f, true);
	EXPECT_TRUE(preview.valid);
	EXPECT_FLOAT_EQ(preview.requestedChange, 0.30f);
	EXPECT_FLOAT_EQ(preview.projectedValue, 0.50f);

	preview = DebugServerLogic::PreviewChemicalIntervention(
		0, "adjust", 0.0f, 0.05f, true);
	EXPECT_FALSE(preview.valid);
	EXPECT_NE(preview.error.find("reserved"), std::string::npos);
}

TEST(DebugServerLogicTest, RejectsStaleOrChangedChemicalTargets) {
	EXPECT_EQ(
		DebugServerLogic::ValidateChemicalInterventionTarget(
			"World A", "World A", "moniker", "moniker",
			100, 120, 0.50f, 0.505f),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateChemicalInterventionTarget(
			"World A", "World B", "moniker", "moniker",
			100, 120, 0.50f, 0.50f).find("world changed"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateChemicalInterventionTarget(
			"World A", "World A", "moniker", "moniker",
			100, 301, 0.50f, 0.50f).find("stale"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateChemicalInterventionTarget(
			"World A", "World A", "moniker", "moniker",
			100, 120, 0.50f, 0.52f).find("concentration changed"),
		std::string::npos);
}

TEST(DebugServerLogicTest, ValidatesUnambiguousGenomeNames) {
	EXPECT_EQ(
		DebugServerLogic::ValidateGenomeFileName(
			"001-tree-lqbzj_experiment_01"),
		"");
	EXPECT_EQ(
		DebugServerLogic::ValidateGenomeFileName(
			"norn.astro.48"),
		"");
	EXPECT_EQ(
		DebugServerLogic::ValidateGenomeExperimentName(
			"norn_astro_48_experiment_01"),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeExperimentName(
			"norn.astro.48.copy").find("dots"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeFileName("../starter").find(
			"begin"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeFileName("starter.gen").find(
			"extension"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeFileName("starter/name").find(
			"only"),
		std::string::npos);
}

TEST(DebugServerLogicTest, RejectsGenomeCopyCollisionsAndMissingSources) {
	EXPECT_EQ(
		DebugServerLogic::ValidateGenomeCopyRequest(
			"starter", "starter_experiment_01", true, false),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeCopyRequest(
			"starter", "starter", true, false).find("differ"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeCopyRequest(
			"starter", "copy", false, false).find("does not exist"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeCopyRequest(
			"starter", "copy", true, true).find("already exists"),
		std::string::npos);
}

TEST(DebugServerLogicTest, RestrictsGenomeSaveToMatchingExperimentalCopy) {
	EXPECT_EQ(
		DebugServerLogic::ValidateGenomeExperimentSave(
			"starter_experiment_01", true, "fnv:123", "fnv:123", true),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeExperimentSave(
			"starter", false, "fnv:123", "fnv:123", true).find(
			"experimental copy"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeExperimentSave(
			"copy", true, "fnv:old", "fnv:new", true).find(
			"changed on disk"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateGenomeExperimentSave(
			"copy", true, "fnv:123", "fnv:123", false).find(
			"source identity"),
		std::string::npos);
}

TEST(DebugServerLogicTest, RejectsUnknownGenomeGeneLayoutsForWriting) {
	EXPECT_TRUE(
		DebugServerLogic::IsSupportedGenomeGeneLayout(0, 0));
	EXPECT_TRUE(
		DebugServerLogic::IsSupportedGenomeGeneLayout(2, 8));
	EXPECT_FALSE(
		DebugServerLogic::IsSupportedGenomeGeneLayout(4, 0));
	EXPECT_FALSE(
		DebugServerLogic::IsSupportedGenomeGeneLayout(1, 6));
	EXPECT_FALSE(
		DebugServerLogic::IsSupportedGenomeGeneLayout(0, -1));
}

TEST(DebugServerLogicTest, ProducesStableGenomeByteChecksums) {
	EXPECT_EQ(
		DebugServerLogic::Fnv1a64Checksum(""),
		"fnv1a64:cbf29ce484222325");
	EXPECT_EQ(
		DebugServerLogic::Fnv1a64Checksum("abc"),
		"fnv1a64:e71fa2190541574b");
	EXPECT_NE(
		DebugServerLogic::Fnv1a64Checksum("abc"),
		DebugServerLogic::Fnv1a64Checksum("abd"));
}

static DebugServerLogic::CaosUsage UsageOf(
	const std::set<std::string>& commands,
	const std::set<std::string>& variablesWritten = {},
	const std::set<std::string>& ops = {},
	const std::set<std::string>& subCommands = {}) {
	DebugServerLogic::CaosUsage usage;
	usage.commands = commands;
	usage.variablesWritten = variablesWritten;
	usage.ops = ops;
	usage.subCommands = subCommands;
	return usage;
}

TEST(CaosRiskTest, ReadsAndLocalStateAreReadOnly) {
	DebugServerLogic::CaosRiskReview review = DebugServerLogic::ReviewCaosUsage(
		UsageOf({"outs", "outv", "targ", "rtar", "setv", "doif", "endi"},
			{"va00", "va99"},
			{"outs", "outv", "targ", "rtar", "setv", "va00", "aslp", "chem"}));
	EXPECT_EQ(review.level, "read-only");
	EXPECT_FALSE(review.requiresAcknowledgement);
	EXPECT_TRUE(review.operations.empty());
}

TEST(CaosRiskTest, CommandFormOfAQueryIsMutating) {
	// Reading ASLP as an rvalue is fine; the command puts a creature to sleep.
	const DebugServerLogic::CaosRiskReview review =
		DebugServerLogic::ReviewCaosUsage(UsageOf({"rtar", "aslp"}));
	EXPECT_EQ(review.level, "mutating");
	EXPECT_TRUE(review.requiresAcknowledgement);
	ASSERT_EQ(review.operations.size(), 1u);
	EXPECT_EQ(review.operations[0], "aslp");
}

TEST(CaosRiskTest, WritingAnythingButLocalVariablesIsMutating) {
	const char* const writes[] = {
		"game", "eame", "mame", "name", "avar", "ov00", "mv00", "velx",
		"vaxx", "va0", "va000"
	};
	for (const char* variable : writes) {
		EXPECT_EQ(
			DebugServerLogic::ReviewCaosUsage(
				UsageOf({"setv"}, {variable})).level,
			"mutating") << variable;
	}
}

TEST(CaosRiskTest, ActingRValuesAreMutating) {
	const char* const rvalues[] = {
		"addm", "addr", "loft", "mute", "scol", "twin", "wolf"
	};
	for (const char* rvalue : rvalues) {
		EXPECT_EQ(
			DebugServerLogic::ReviewCaosUsage(
				UsageOf({"outv"}, {}, {"outv", rvalue})).level,
			"mutating") << rvalue;
	}
}

TEST(CaosRiskTest, RValuesThatRunOrInstallCodeAreDestructive) {
	const char* const rvalues[] = {"caos", "pray", "net:"};
	for (const char* rvalue : rvalues) {
		EXPECT_EQ(
			DebugServerLogic::ReviewCaosUsage(
				UsageOf({"outs"}, {}, {"outs", rvalue})).level,
			"broad-or-destructive") << rvalue;
	}
}

TEST(CaosRiskTest, DestructiveCommandsOutrankMutation) {
	const DebugServerLogic::CaosRiskReview review =
		DebugServerLogic::ReviewCaosUsage(
			UsageOf({"new:", "mvsf", "kill"}, {}, {}, {"new: simp"}));
	EXPECT_EQ(review.level, "broad-or-destructive");
	EXPECT_TRUE(review.requiresAcknowledgement);
	EXPECT_EQ(review.operations.size(), 3u);
}

TEST(CaosRiskTest, UnknownCommandsAreNeverReadOnly) {
	EXPECT_EQ(
		DebugServerLogic::ReviewCaosUsage(UsageOf({"zzzz"})).level,
		"mutating");
}

TEST(CaosRiskTest, ReviewsSubCommandsOfReadOnlyParents) {
	EXPECT_EQ(
		DebugServerLogic::ReviewCaosUsage(
			UsageOf({"dbg:"}, {}, {}, {"dbg: outv"})).level,
		"read-only");
	EXPECT_EQ(
		DebugServerLogic::ReviewCaosUsage(
			UsageOf({"dbg:"}, {}, {}, {"dbg: paws"})).level,
		"mutating");
	EXPECT_EQ(
		DebugServerLogic::ReviewCaosUsage(
			UsageOf({"dbg:"}, {}, {}, {"dbg: wtik"})).level,
		"mutating");
}

TEST(CaosRiskTest, HistoryWritesAreDestructiveWhileReadsAreNot) {
	EXPECT_EQ(
		DebugServerLogic::ReviewCaosUsage(
			UsageOf({"hist"}, {}, {}, {"hist wipe"})).level,
		"broad-or-destructive");
	EXPECT_EQ(
		DebugServerLogic::ReviewCaosUsage(
			UsageOf({"outv"}, {}, {"outv", "hist"}, {"hist coun"})).level,
		"read-only");
}

TEST(CaosRiskTest, SourceThatDoesNotCompileIsUnreviewable) {
	const DebugServerLogic::CaosRiskReview review =
		DebugServerLogic::UnreviewableCaosRisk();
	EXPECT_EQ(review.level, "unknown");
	EXPECT_TRUE(review.requiresAcknowledgement);
}

TEST(DebugServerLogicTest, RejectsChangedOrStaleCaosExecutionContext) {
	EXPECT_EQ(
		DebugServerLogic::ValidateCaosExecutionContext(
			"World", "World", 100, 120, true, true, true),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateCaosExecutionContext(
			"World", "Other", 100, 120, false, false, false).find(
				"world changed"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateCaosExecutionContext(
			"World", "World", 100, 301, false, false, false).find("stale"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateCaosExecutionContext(
			"World", "World", 100, 120, true, false, false).find(
				"no longer exists"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateCaosExecutionContext(
			"World", "World", 100, 120, true, true, false).find(
				"identity changed"),
		std::string::npos);
}

TEST(DebugServerLogicTest, ReviewsDoNotSurviveAWorldReload) {
	EXPECT_EQ(
		DebugServerLogic::ValidateReviewedWorldSession("s.1", "s.1"), "");
	EXPECT_NE(
		DebugServerLogic::ValidateReviewedWorldSession("s.1", "s.2"), "");
	EXPECT_NE(
		DebugServerLogic::ValidateReviewedWorldSession("", "s.1"), "");
}

TEST(DebugServerLogicTest, BindsScriptMutationToExactReviewedState) {
	EXPECT_EQ(
		DebugServerLogic::ValidateCaosScriptMutation(
			"install", true, false, "", "", false),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateCaosScriptMutation(
			"install", true, true, "", "one", false).find(
				"already installed"),
		std::string::npos);
	EXPECT_EQ(
		DebugServerLogic::ValidateCaosScriptMutation(
			"replace", true, true, "one", "one", true),
		"");
	EXPECT_NE(
		DebugServerLogic::ValidateCaosScriptMutation(
			"replace", true, true, "one", "two", true).find(
				"changed after review"),
		std::string::npos);
	EXPECT_NE(
		DebugServerLogic::ValidateCaosScriptMutation(
			"remove", true, true, "one", "one", false).find(
				"confirmation"),
		std::string::npos);
}

TEST(FlightRecorderDatagramTest, AcceptsStructuredRecords) {
	const DebugServerLogic::FlightRecorderDatagram parsed =
		DebugServerLogic::ParseFlightRecorderDatagram(
			"{\"schemaVersion\":2,\"monotonicMs\":12,\"wallTimeMs\":34,"
			"\"categoryMask\":1,\"message\":\"boom\",\"t\":12,\"cat\":1,"
			"\"msg\":\"boom\"}");
	ASSERT_TRUE(parsed.valid);
	EXPECT_TRUE(parsed.structured);
	EXPECT_EQ(parsed.categoryMask, 1u);
	EXPECT_EQ(parsed.message, "boom");
	EXPECT_EQ(parsed.monotonicMs, 12u);
	EXPECT_TRUE(parsed.hasWallTime);
	EXPECT_EQ(parsed.wallTimeMs, 34u);
}

TEST(FlightRecorderDatagramTest, AcceptsLegacyRecords) {
	const DebugServerLogic::FlightRecorderDatagram parsed =
		DebugServerLogic::ParseFlightRecorderDatagram(
			"{\"t\":7,\"cat\":4,\"msg\":\"legacy\"}");
	ASSERT_TRUE(parsed.valid);
	EXPECT_FALSE(parsed.structured);
	EXPECT_EQ(parsed.categoryMask, 4u);
	EXPECT_EQ(parsed.message, "legacy");
	EXPECT_EQ(parsed.monotonicMs, 7u);
	EXPECT_FALSE(parsed.hasWallTime);
}

TEST(FlightRecorderDatagramTest, RejectsDatagramsThatUsedToThrow) {
	// Both of these escaped the UDP thread and terminated the engine.
	EXPECT_FALSE(
		DebugServerLogic::ParseFlightRecorderDatagram("[]").valid);
	EXPECT_FALSE(DebugServerLogic::ParseFlightRecorderDatagram(
		"{\"categoryMask\":\"oops\"}").valid);
}

TEST(FlightRecorderDatagramTest, RejectsForeignAndMalformedDatagrams) {
	const char* const rejected[] = {
		"",
		"null",
		"42",
		"\"text\"",
		"not json at all",
		"{}",
		"{\"cat\":1}",
		"{\"msg\":\"no category\"}",
		"{\"schemaVersion\":\"2\",\"categoryMask\":1,\"message\":\"x\"}",
		"{\"schemaVersion\":2,\"categoryMask\":-1,\"message\":\"x\"}",
		"{\"schemaVersion\":2,\"categoryMask\":4294967296,\"message\":\"x\"}",
		"{\"schemaVersion\":2,\"categoryMask\":1.5,\"message\":\"x\"}",
		"{\"schemaVersion\":2,\"categoryMask\":1,\"message\":3}",
		"{\"schemaVersion\":2,\"categoryMask\":1,\"message\":\"x\","
			"\"monotonicMs\":\"soon\"}",
		"{\"schemaVersion\":2,\"categoryMask\":1,\"message\":\"x\","
			"\"wallTimeMs\":{}}",
	};
	for (const char* datagram : rejected) {
		EXPECT_FALSE(
			DebugServerLogic::ParseFlightRecorderDatagram(datagram).valid)
			<< datagram;
	}
}

TEST(FlightRecorderDatagramTest, RejectsRouterDiscoveryBroadcast) {
	// Shape of the unsolicited ASUS discovery packet seen in Logs (OBS-006).
	const std::string packet(
		"\x0c\x15\x33Storm\0\0\0255.255.255.0\0HOMEGATE\xff\xfe", 34);
	EXPECT_FALSE(
		DebugServerLogic::ParseFlightRecorderDatagram(packet).valid);
}

static std::string EscapedLogText(const std::string& input) {
	char output[256];
	EscapeLogTextForJson(
		input.data(), input.size(), output, sizeof(output));
	return output;
}

TEST(FlightRecorderJsonTest, EscapesEverythingStrictJsonRejects) {
	const std::string text(
		"tab\there \"quoted\" back\\slash \x01 caf\xc3\xa9 \xe9", 38);
	const std::string body = EscapedLogText(text);
	const nlohmann::json parsed =
		nlohmann::json::parse("\"" + body + "\"", nullptr, false);
	ASSERT_TRUE(parsed.is_string()) << body;
	EXPECT_EQ(parsed.get<std::string>(),
		"tab\there \"quoted\" back\\slash \x01 caf\xc3\xa9 \xef\xbf\xbd");
}

TEST(FlightRecorderJsonTest, DropsLineBreaksFromSingleLineRecords) {
	EXPECT_EQ(EscapedLogText("one\r\ntwo\n"), "onetwo");
}

TEST(FlightRecorderJsonTest, RejectsInvalidUtf8Sequences) {
	const char* const invalid[] = {
		"\xc0\xaf",         // overlong
		"\xed\xa0\x80",     // UTF-16 surrogate
		"\xf4\x90\x80\x80", // past U+10FFFF
		"\xe2\x82",         // truncated
	};
	for (const char* text : invalid) {
		const std::string body = EscapedLogText(text);
		const nlohmann::json parsed =
			nlohmann::json::parse("\"" + body + "\"", nullptr, false);
		EXPECT_TRUE(parsed.is_string()) << body;
	}
}

TEST(FlightRecorderJsonTest, TruncatesWithoutSplittingAnEscape) {
	const std::string input(1000, '"');
	char output[16];
	const size_t written = EscapeLogTextForJson(
		input.data(), input.size(), output, sizeof(output));
	ASSERT_LT(written, sizeof(output));
	EXPECT_EQ(output[written], '\0');
	EXPECT_EQ(written % 2, 0u);
	const nlohmann::json parsed = nlohmann::json::parse(
		"\"" + std::string(output) + "\"", nullptr, false);
	EXPECT_TRUE(parsed.is_string());
}

using DebugServerLogic::ApiAccessDecision;
using DebugServerLogic::ApiAccessRequest;
using DebugServerLogic::DecideApiAccess;

static ApiAccessRequest LocalBrowserRequest() {
	ApiAccessRequest request;
	request.host = "localhost:9980";
	request.peerAddress = "127.0.0.1";
	request.isApiPath = true;
	return request;
}

TEST(ApiAccessTest, RecognisesLoopbackHostHeaders) {
	EXPECT_TRUE(DebugServerLogic::IsLoopbackHostHeader("localhost"));
	EXPECT_TRUE(DebugServerLogic::IsLoopbackHostHeader("LOCALHOST:9980"));
	EXPECT_TRUE(DebugServerLogic::IsLoopbackHostHeader("127.0.0.1:9980"));
	EXPECT_TRUE(DebugServerLogic::IsLoopbackHostHeader("[::1]:9980"));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader(""));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader("evil.example"));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader("localhost.evil.example"));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader("127.0.0.1.evil.example"));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader("192.168.1.20:9980"));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader("[::1"));
	EXPECT_FALSE(DebugServerLogic::IsLoopbackHostHeader("[::1]evil"));
}

TEST(ApiAccessTest, AllowsLocalToolsAndCommandLineClients) {
	ApiAccessRequest request = LocalBrowserRequest();
	EXPECT_TRUE(DecideApiAccess(request, "").allowed);

	request.origin = "http://localhost:9980";
	request.fetchSite = "same-origin";
	EXPECT_TRUE(DecideApiAccess(request, "").allowed);
}

TEST(ApiAccessTest, RejectsDnsRebinding) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.host = "attacker.example:9980";
	const ApiAccessDecision decision = DecideApiAccess(request, "");
	EXPECT_FALSE(decision.allowed);
	EXPECT_EQ(decision.status, 403);
}

TEST(ApiAccessTest, RejectsNetworkPeersWhenLocalOnly) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.peerAddress = "192.168.1.20";
	EXPECT_FALSE(DecideApiAccess(request, "").allowed);
}

TEST(ApiAccessTest, RejectsCrossOriginBrowserRequests) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.origin = "https://attacker.example";
	EXPECT_FALSE(DecideApiAccess(request, "").allowed);

	request.origin = "null";
	EXPECT_FALSE(DecideApiAccess(request, "").allowed);

	request.origin = "http://localhost:3000";
	EXPECT_FALSE(DecideApiAccess(request, "").allowed);
}

TEST(ApiAccessTest, RejectsCrossSiteFetchMetadataWithoutOrigin) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.fetchSite = "cross-site";
	EXPECT_FALSE(DecideApiAccess(request, "").allowed);
	request.fetchSite = "same-site";
	EXPECT_FALSE(DecideApiAccess(request, "").allowed);
}

TEST(ApiAccessTest, StaticPagesStayReachableFromLinks) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.isApiPath = false;
	request.fetchSite = "cross-site";
	EXPECT_TRUE(DecideApiAccess(request, "").allowed);
}

TEST(ApiAccessTest, RemoteRequestsNeedTheToken) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.host = "fedora.local:9980";
	request.peerAddress = "192.168.1.20";

	ApiAccessDecision decision = DecideApiAccess(request, "secret");
	EXPECT_FALSE(decision.allowed);
	EXPECT_EQ(decision.status, 401);

	request.authorization = "Bearer wrong!";
	EXPECT_FALSE(DecideApiAccess(request, "secret").allowed);

	request.authorization = "Bearer secret";
	EXPECT_TRUE(DecideApiAccess(request, "secret").allowed);

	request.authorization.clear();
	request.cookie = "other=1; lc2e_tools_token=secret; more=2";
	EXPECT_TRUE(DecideApiAccess(request, "secret").allowed);

	request.cookie = "not_lc2e_tools_token=secret";
	EXPECT_FALSE(DecideApiAccess(request, "secret").allowed);
}

TEST(ApiAccessTest, RemoteModeStillChecksOrigin) {
	ApiAccessRequest request = LocalBrowserRequest();
	request.host = "fedora.local:9980";
	request.peerAddress = "192.168.1.20";
	request.authorization = "Bearer secret";
	request.origin = "http://fedora.local:9980";
	EXPECT_TRUE(DecideApiAccess(request, "secret").allowed);

	request.origin = "https://attacker.example";
	EXPECT_FALSE(DecideApiAccess(request, "secret").allowed);
}

TEST(ApiAccessTest, RemoteModeKeepsLocalUseTokenFree) {
	EXPECT_TRUE(DecideApiAccess(LocalBrowserRequest(), "secret").allowed);
}

TEST(ApiAccessTest, TokenComparisonRequiresExactMatch) {
	EXPECT_TRUE(DebugServerLogic::ApiTokenMatches("secret", "secret"));
	EXPECT_FALSE(DebugServerLogic::ApiTokenMatches("secre", "secret"));
	EXPECT_FALSE(DebugServerLogic::ApiTokenMatches("secreT", "secret"));
	EXPECT_FALSE(DebugServerLogic::ApiTokenMatches("", ""));
}

TEST(InjectionReviewTest, AcceptsAFreshUnusedReview) {
	EXPECT_EQ(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-a", 100, 150, false), "");
}

TEST(InjectionReviewTest, RejectsReplay) {
	EXPECT_EQ(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-a", 100, 150, true),
		"This reviewed injection was already used; review it again");
}

TEST(InjectionReviewTest, RejectsAReviewFromAnotherLoadOfTheSameWorld) {
	EXPECT_EQ(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-b", 100, 150, false),
		"The world was reloaded after this review; review it again");
}

TEST(InjectionReviewTest, RejectsMissingIdentity) {
	EXPECT_NE(DebugServerLogic::ValidateInjectionReview(
		"", "session-a", "session-a", 100, 150, false), "");
	EXPECT_NE(DebugServerLogic::ValidateInjectionReview(
		"review-1", "", "session-a", 100, 150, false), "");
}

TEST(InjectionReviewTest, RejectsImpossibleAndExpiredTicks) {
	EXPECT_NE(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-a", 151, 150, false), "");
	EXPECT_NE(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-a", -1, 150, false), "");
	EXPECT_EQ(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-a", 0, 12000, false), "");
	EXPECT_EQ(DebugServerLogic::ValidateInjectionReview(
		"review-1", "session-a", "session-a", 0, 12001, false),
		"This injection review has expired; review it again");
}

TEST(WorkItemTest, ClaimedWorkDeliversItsResult) {
	WorkItem item;
	WorkFuture future = item.get_future();
	ASSERT_TRUE(item.Claim());
	item.promise.set_value("done");
	ASSERT_EQ(
		future.wait_for(std::chrono::seconds(1)),
		std::future_status::ready);
	EXPECT_EQ(future.get(), "done");
}

TEST(WorkItemTest, TimedOutWorkCanNeverRun) {
	WorkItem item;
	WorkFuture future = item.get_future();
	EXPECT_EQ(
		future.wait_for(std::chrono::milliseconds(1)),
		std::future_status::timeout);
	EXPECT_FALSE(item.Claim());
}

TEST(WorkItemTest, TimeoutWaitsForWorkAlreadyRunning) {
	WorkItem item;
	WorkFuture future = item.get_future();
	ASSERT_TRUE(item.Claim());
	std::thread mainThread([&item]() {
		std::this_thread::sleep_for(std::chrono::milliseconds(50));
		item.promise.set_value("late");
	});
	EXPECT_EQ(
		future.wait_for(std::chrono::milliseconds(1)),
		std::future_status::ready);
	EXPECT_EQ(future.get(), "late");
	mainThread.join();
}
