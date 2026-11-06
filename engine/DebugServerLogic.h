#ifndef DEBUG_SERVER_LOGIC_H
#define DEBUG_SERVER_LOGIC_H

#include <set>
#include <string>
#include <vector>

namespace DebugServerLogic {

struct ChemicalInterventionPreview {
	bool valid;
	bool requiresConfirmation;
	bool clamped;
	float requestedChange;
	float projectedValue;
	std::string warning;
	std::string error;

	ChemicalInterventionPreview();
};

struct CaosRiskReview {
	std::string level;
	bool requiresAcknowledgement;
	std::string warning;
	std::vector<std::string> operations;

	CaosRiskReview();
};

// Compiled facts about a script, from Orderiser. Names are lower case.
struct CaosUsage {
	std::set<std::string> commands;
	std::set<std::string> subCommands;
	std::set<std::string> ops;
	std::set<std::string> variablesWritten;
};

// Parsed FlightRecorder UDP datagram. Anything other than a well-formed JSON
// object with the expected field types is invalid and must not reach the log
// stream.
struct FlightRecorderDatagram {
	bool valid;
	bool structured;
	unsigned int categoryMask;
	std::string message;
	unsigned long long monotonicMs;
	bool hasWallTime;
	unsigned long long wallTimeMs;

	FlightRecorderDatagram();
};

// The parts of an HTTP request that decide whether it may reach the API.
struct ApiAccessRequest {
	std::string host;
	std::string origin;
	std::string fetchSite;
	std::string authorization;
	std::string cookie;
	std::string peerAddress;
	bool isApiPath;

	ApiAccessRequest();
};

struct ApiAccessDecision {
	bool allowed;
	int status;
	std::string error;

	ApiAccessDecision();
};

extern const char* const API_TOKEN_COOKIE;

std::string ExtractSourceStatement(const std::string& source, int sourcePosition);
FlightRecorderDatagram ParseFlightRecorderDatagram(const std::string& datagram);
bool IsLoopbackHostHeader(const std::string& host);
bool IsLoopbackAddress(const std::string& address);
bool ApiTokenMatches(const std::string& candidate, const std::string& token);
// An empty remoteToken means the server only serves this machine.
ApiAccessDecision DecideApiAccess(
	const ApiAccessRequest& request, const std::string& remoteToken);
std::string ClassifyLogSeverity(
	unsigned int categoryMask, const std::string& message);
std::string LogSubsystemLabel(unsigned int categoryMask);
ChemicalInterventionPreview PreviewChemicalIntervention(
	int chemicalId,
	const std::string& operation,
	float beforeValue,
	float requestedValue,
	bool extremeConfirmed);
std::string ValidateChemicalInterventionTarget(
	const std::string& expectedWorldName,
	const std::string& actualWorldName,
	const std::string& expectedMoniker,
	const std::string& actualMoniker,
	long long sampleWorldTick,
	long long actualWorldTick,
	float expectedConcentration,
	float actualConcentration);
std::string ValidateGenomeFileName(const std::string& name);
std::string ValidateGenomeExperimentName(const std::string& name);
std::string ValidateGenomeCopyRequest(
	const std::string& sourceName,
	const std::string& derivedName,
	bool sourceExists,
	bool destinationExists);
std::string ValidateGenomeExperimentSave(
	const std::string& derivedName,
	bool isExperimentalCopy,
	const std::string& expectedChecksum,
	const std::string& currentChecksum,
	bool sourceIdentityMatches);
bool IsSupportedGenomeGeneLayout(int type, int subtype);
std::string Fnv1a64Checksum(const std::string& bytes);
// Default-deny: only VM-local reads and writes count as read-only.
CaosRiskReview ReviewCaosUsage(const CaosUsage& usage);
// Verdict for source that did not compile, so has no known contents.
CaosRiskReview UnreviewableCaosRisk();
// A reviewed change applies to one load of a world. Reloading rewinds time
// under the same name, where a reviewed tick can recur.
std::string ValidateReviewedWorldSession(
	const std::string& reviewedWorldSessionId,
	const std::string& actualWorldSessionId);
std::string ValidateCaosExecutionContext(
	const std::string& expectedWorldName,
	const std::string& actualWorldName,
	long long expectedWorldTick,
	long long actualWorldTick,
	bool targetRequested,
	bool targetExists,
	bool targetClassifierMatches);
// A reviewed genome injection is good for one use, in the world session it
// was reviewed in, for a limited number of ticks.
std::string ValidateInjectionReview(
	const std::string& reviewId,
	const std::string& reviewedWorldSessionId,
	const std::string& actualWorldSessionId,
	long long reviewedWorldTick,
	long long actualWorldTick,
	bool reviewAlreadyConsumed);
std::string ValidateCaosScriptMutation(
	const std::string& mode,
	bool classifierValid,
	bool scriptExists,
	const std::string& expectedExistingChecksum,
	const std::string& actualExistingChecksum,
	bool confirmed);

// Creature drive semantics, in CreatureConstants.h driveoffsets order.
// Drives 0-14 are needs; 15-19 (Up, Down, Exit, Enter, Wait) steer
// navigation between rooms and lifts.
const int CREATURE_DRIVE_COUNT = 20;
const int CREATURE_NEED_DRIVE_COUNT = 15;
std::string CreatureDriveLabel(int drive);
bool IsNavigationDrive(int drive);
// Index of the largest level in [begin, end), the first one on a tie, as
// Creature::GetHighestDrive() does. -1 for an empty or out-of-range span.
int HighestDriveInRange(const std::vector<float>& levels, int begin, int end);
// Docking Station's chemical_names catalogue stores the bare number for
// unnamed slots; those, and empty entries, have no name.
std::string ChemicalNameFromCatalogueEntry(int chemicalId,
	const std::string& entry);
// Plain-language meaning for life states that are easy to misread.
std::string CreatureLifeStateMeaning(const std::string& lifeState);

}

#endif
