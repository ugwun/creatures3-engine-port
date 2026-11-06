#include "DebugServerLogic.h"

#include "contrib/json.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <iomanip>
#include <set>
#include <sstream>
#include <vector>

namespace {

bool IsLineBreak(char value) {
	return value == '\r' || value == '\n';
}

std::string LowerCase(std::string text) {
	std::transform(text.begin(), text.end(), text.begin(),
		[](unsigned char value) {
			return static_cast<char>(std::tolower(value));
		});
	return text;
}

std::string CookieValue(const std::string& header, const std::string& name) {
	size_t position = 0;
	while (position < header.size()) {
		size_t end = header.find(';', position);
		if (end == std::string::npos)
			end = header.size();
		size_t start = position;
		while (start < end && header[start] == ' ')
			++start;
		const size_t equals = header.find('=', start);
		if (equals != std::string::npos && equals < end &&
			header.compare(start, equals - start, name) == 0)
			return header.substr(equals + 1, end - equals - 1);
		position = end + 1;
	}
	return "";
}

}

namespace DebugServerLogic {

const char* const API_TOKEN_COOKIE = "lc2e_tools_token";

ApiAccessRequest::ApiAccessRequest() : isApiPath(false) {
}

ApiAccessDecision::ApiAccessDecision() : allowed(false), status(403) {
}

ChemicalInterventionPreview::ChemicalInterventionPreview()
	: valid(false),
	  requiresConfirmation(false),
	  clamped(false),
	  requestedChange(0.0f),
	  projectedValue(0.0f) {
}

FlightRecorderDatagram::FlightRecorderDatagram()
	: valid(false),
	  structured(false),
	  categoryMask(0),
	  monotonicMs(0),
	  hasWallTime(false),
	  wallTimeMs(0) {
}

CaosRiskReview::CaosRiskReview()
	: level("read-only"),
	  requiresAcknowledgement(false) {
}

std::string ExtractSourceStatement(const std::string& source, int sourcePosition) {
	if (source.empty())
		return "";

	const size_t position = static_cast<size_t>(
		std::max(0, std::min(sourcePosition, static_cast<int>(source.size()))));
	size_t start = position;
	while (start > 0 && !IsLineBreak(source[start - 1]))
		--start;

	size_t end = position;
	while (end < source.size() && !IsLineBreak(source[end]))
		++end;

	while (start < end &&
		std::isspace(static_cast<unsigned char>(source[start])))
		++start;
	while (end > start &&
		std::isspace(static_cast<unsigned char>(source[end - 1])))
		--end;
	return source.substr(start, end - start);
}

FlightRecorderDatagram ParseFlightRecorderDatagram(
	const std::string& datagram) {
	FlightRecorderDatagram result;
	const nlohmann::json incoming =
		nlohmann::json::parse(datagram, nullptr, false);
	if (!incoming.is_object())
		return result;

	// Structured records (schemaVersion 2) and the older {t, cat, msg} form
	// name the same three fields differently.
	const auto versionField = incoming.find("schemaVersion");
	const bool structured =
		versionField != incoming.end() &&
		versionField->is_number_integer() &&
		versionField->get<long long>() >= 2;
	const auto category =
		incoming.find(structured ? "categoryMask" : "cat");
	const auto message = incoming.find(structured ? "message" : "msg");
	const auto monotonic = incoming.find(structured ? "monotonicMs" : "t");
	if (category == incoming.end() || !category->is_number_unsigned() ||
		category->get<unsigned long long>() > 0xFFFFFFFFULL ||
		message == incoming.end() || !message->is_string() ||
		(monotonic != incoming.end() && !monotonic->is_number_unsigned()))
		return result;

	const auto wallTime = incoming.find("wallTimeMs");
	if (wallTime != incoming.end() && !wallTime->is_number_unsigned())
		return result;

	result.valid = true;
	result.structured = structured;
	result.categoryMask = category->get<unsigned int>();
	result.message = message->get<std::string>();
	if (monotonic != incoming.end())
		result.monotonicMs = monotonic->get<unsigned long long>();
	if (wallTime != incoming.end()) {
		result.hasWallTime = true;
		result.wallTimeMs = wallTime->get<unsigned long long>();
	}
	return result;
}

bool IsLoopbackHostHeader(const std::string& host) {
	std::string name = LowerCase(host);
	if (!name.empty() && name[0] == '[') {
		const size_t close = name.find(']');
		if (close == std::string::npos)
			return false;
		const std::string rest = name.substr(close + 1);
		if (!rest.empty() && rest[0] != ':')
			return false;
		name = name.substr(0, close + 1);
	} else {
		const size_t colon = name.find(':');
		if (colon != std::string::npos)
			name = name.substr(0, colon);
	}
	return name == "localhost" || name == "127.0.0.1" || name == "[::1]";
}

bool IsLoopbackAddress(const std::string& address) {
	return address.rfind("127.", 0) == 0 || address == "::1" ||
		address.rfind("::ffff:127.", 0) == 0;
}

bool ApiTokenMatches(const std::string& candidate, const std::string& token) {
	if (token.empty() || candidate.size() != token.size())
		return false;
	unsigned char difference = 0;
	for (size_t index = 0; index < token.size(); ++index) {
		difference |= static_cast<unsigned char>(candidate[index]) ^
			static_cast<unsigned char>(token[index]);
	}
	return difference == 0;
}

ApiAccessDecision DecideApiAccess(
	const ApiAccessRequest& request, const std::string& remoteToken) {
	ApiAccessDecision decision;
	const bool local = IsLoopbackAddress(request.peerAddress) &&
		IsLoopbackHostHeader(request.host);
	if (!local && remoteToken.empty()) {
		// A loopback peer with a foreign Host is a DNS rebinding attempt.
		decision.error =
			"Developer Tools only accept local requests; "
			"start lc2e with --allow-remote-tools to enable remote access";
		return decision;
	}
	if (!local) {
		const std::string bearer = "Bearer ";
		const std::string presented =
			request.authorization.compare(0, bearer.size(), bearer) == 0
				? request.authorization.substr(bearer.size())
				: CookieValue(request.cookie, API_TOKEN_COOKIE);
		if (!ApiTokenMatches(presented, remoteToken)) {
			decision.status = 401;
			decision.error = "A valid Developer Tools token is required";
			return decision;
		}
	}
	// Static files stay reachable from an ordinary link; a foreign page can
	// navigate to them but not read them. Only the API needs origin checks.
	if (request.isApiPath) {
		if (!request.origin.empty() &&
			LowerCase(request.origin) != "http://" + LowerCase(request.host)) {
			decision.error = "Cross-origin API requests are not allowed";
			return decision;
		}
		if (!request.fetchSite.empty() &&
			request.fetchSite != "same-origin" &&
			request.fetchSite != "none") {
			decision.error = "Cross-site API requests are not allowed";
			return decision;
		}
	}
	decision.allowed = true;
	decision.status = 200;
	return decision;
}

std::string ClassifyLogSeverity(
	unsigned int categoryMask, const std::string& message) {
	if (categoryMask & 64)
		return "critical";
	if (categoryMask & 1)
		return "error";
	std::string prefix = message.substr(0, std::min<size_t>(message.size(), 16));
	std::transform(prefix.begin(), prefix.end(), prefix.begin(),
		[](unsigned char value) {
			return static_cast<char>(std::toupper(value));
		});
	if (prefix.find("[WARN]") != std::string::npos ||
		prefix.find("WARNING") != std::string::npos)
		return "warning";
	return "info";
}

std::string LogSubsystemLabel(unsigned int categoryMask) {
	if (categoryMask & 1) return "error";
	if (categoryMask & 16) return "shutdown";
	if (categoryMask & 2) return "network";
	if (categoryMask & 4) return "world";
	if (categoryMask & 8) return "caos";
	if (categoryMask & 32) return "sound";
	if (categoryMask & 64) return "crash";
	return "other";
}

ChemicalInterventionPreview PreviewChemicalIntervention(
	int chemicalId,
	const std::string& operation,
	float beforeValue,
	float requestedValue,
	bool extremeConfirmed) {
	ChemicalInterventionPreview result;
	if (chemicalId <= 0 || chemicalId >= 256) {
		result.error = chemicalId == 0
			? "Chemical 0 is reserved as none and cannot be adjusted"
			: "Chemical identifier must be between 1 and 255";
		return result;
	}
	if (!std::isfinite(beforeValue) || beforeValue < 0.0f ||
		beforeValue > 1.0f) {
		result.error = "Current concentration is outside the engine range";
		return result;
	}
	if (!std::isfinite(requestedValue)) {
		result.error = "Requested value must be finite";
		return result;
	}

	if (operation == "adjust") {
		if (requestedValue < -1.0f || requestedValue > 1.0f) {
			result.error = "Adjustment must be between -1 and 1";
			return result;
		}
		result.requestedChange = requestedValue;
		const float unbounded = beforeValue + requestedValue;
		result.projectedValue = std::max(0.0f, std::min(1.0f, unbounded));
		result.clamped = unbounded < 0.0f || unbounded > 1.0f;
	} else if (operation == "target") {
		if (requestedValue < 0.0f || requestedValue > 1.0f) {
			result.error = "Target concentration must be between 0 and 1";
			return result;
		}
		result.requestedChange = requestedValue - beforeValue;
		result.projectedValue = requestedValue;
	} else {
		result.error = "Operation must be adjust or target";
		return result;
	}

	result.requiresConfirmation =
		std::fabs(result.requestedChange) > 0.25f || result.clamped;
	if (result.clamped) {
		result.warning =
			"The engine will clamp the immediate concentration to the 0–1 range";
	} else if (result.requiresConfirmation) {
		result.warning =
			"The requested immediate concentration change exceeds 0.25";
	}
	if (result.requiresConfirmation && !extremeConfirmed) {
		result.error = "Explicit confirmation is required for this operation";
		return result;
	}
	result.valid = true;
	return result;
}

std::string ValidateChemicalInterventionTarget(
	const std::string& expectedWorldName,
	const std::string& actualWorldName,
	const std::string& expectedMoniker,
	const std::string& actualMoniker,
	long long sampleWorldTick,
	long long actualWorldTick,
	float expectedConcentration,
	float actualConcentration) {
	if (expectedWorldName.empty() || expectedWorldName != actualWorldName)
		return "The active world changed after the chemical sample";
	if (expectedMoniker.empty() || expectedMoniker != actualMoniker)
		return "The selected creature changed or its numeric agent ID was reused";
	if (sampleWorldTick < 0 || sampleWorldTick > actualWorldTick)
		return "The chemical sample tick is invalid for the active world";
	if (actualWorldTick - sampleWorldTick > 200)
		return "The chemical sample is stale; refresh before intervening";
	if (!std::isfinite(expectedConcentration) ||
		!std::isfinite(actualConcentration) ||
		std::fabs(expectedConcentration - actualConcentration) > 0.01f)
		return "The concentration changed since the reviewed sample; review again";
	return "";
}

std::string ValidateGenomeFileName(const std::string& name) {
	if (name.empty())
		return "Genome name is required";
	if (name.size() > 80)
		return "Genome name must be at most 80 characters";
	if (!std::isalnum(static_cast<unsigned char>(name[0])))
		return "Genome name must begin with a letter or number";
	if (name.find("..") != std::string::npos)
		return "Genome name cannot contain parent-directory notation";
	if (name.size() >= 4) {
		std::string suffix = name.substr(name.size() - 4);
		std::transform(
			suffix.begin(), suffix.end(), suffix.begin(),
			[](unsigned char value) {
				return static_cast<char>(std::tolower(value));
			});
		if (suffix == ".gen")
			return "Genome name must not include the .gen extension";
	}
	for (size_t index = 0; index < name.size(); ++index) {
		const unsigned char value =
			static_cast<unsigned char>(name[index]);
		if (!std::isalnum(value) && value != '-' &&
			value != '_' && value != '.')
			return "Genome name may contain only letters, numbers, dots, hyphens, and underscores";
	}
	return "";
}

std::string ValidateGenomeExperimentName(const std::string& name) {
	const std::string fileNameError = ValidateGenomeFileName(name);
	if (!fileNameError.empty())
		return fileNameError;
	if (name.find('.') != std::string::npos)
		return "New experimental genome names cannot contain dots or extensions";
	return "";
}

std::string ValidateGenomeCopyRequest(
	const std::string& sourceName,
	const std::string& derivedName,
	bool sourceExists,
	bool destinationExists) {
	const std::string sourceError = ValidateGenomeFileName(sourceName);
	if (!sourceError.empty())
		return "Invalid source genome name: " + sourceError;
	const std::string derivedError =
		ValidateGenomeExperimentName(derivedName);
	if (!derivedError.empty())
		return "Invalid experimental copy name: " + derivedError;
	if (sourceName == derivedName)
		return "Experimental copy name must differ from the source";
	if (!sourceExists)
		return "Source genome does not exist";
	if (destinationExists)
		return "Experimental copy name already exists";
	return "";
}

std::string ValidateGenomeExperimentSave(
	const std::string& derivedName,
	bool isExperimentalCopy,
	const std::string& expectedChecksum,
	const std::string& currentChecksum,
	bool sourceIdentityMatches) {
	const std::string nameError =
		ValidateGenomeExperimentName(derivedName);
	if (!nameError.empty())
		return nameError;
	if (!isExperimentalCopy)
		return "Ordinary save is restricted to a recorded experimental copy";
	if (expectedChecksum.empty() || currentChecksum.empty() ||
		expectedChecksum != currentChecksum)
		return "The experimental copy changed on disk; reload before saving";
	if (!sourceIdentityMatches)
		return "The recorded source identity or checksum no longer matches";
	return "";
}

std::string ValidateInjectionReview(
	const std::string& reviewId,
	const std::string& reviewedWorldSessionId,
	const std::string& actualWorldSessionId,
	long long reviewedWorldTick,
	long long actualWorldTick,
	bool reviewAlreadyConsumed) {
	// Long enough to read the review dialog: ten minutes at normal speed.
	static const long long maximumReviewAgeTicks = 12000;
	if (reviewId.empty())
		return "This injection has no review identifier; review it again";
	if (reviewAlreadyConsumed)
		return "This reviewed injection was already used; review it again";
	if (reviewedWorldSessionId.empty() ||
		reviewedWorldSessionId != actualWorldSessionId)
		return "The world was reloaded after this review; review it again";
	if (reviewedWorldTick < 0 || reviewedWorldTick > actualWorldTick)
		return "The reviewed world tick is invalid for the active world";
	if (actualWorldTick - reviewedWorldTick > maximumReviewAgeTicks)
		return "This injection review has expired; review it again";
	return "";
}

bool IsSupportedGenomeGeneLayout(int type, int subtype) {
	static const int subtypeCounts[] = {3, 6, 9, 1};
	return type >= 0 && type < 4 &&
		subtype >= 0 && subtype < subtypeCounts[type];
}

std::string Fnv1a64Checksum(const std::string& bytes) {
	unsigned long long hash = 14695981039346656037ULL;
	for (size_t index = 0; index < bytes.size(); ++index) {
		hash ^= static_cast<unsigned char>(bytes[index]);
		hash *= 1099511628211ULL;
	}
	std::ostringstream output;
	output << "fnv1a64:" << std::hex << std::setfill('0')
		<< std::setw(16) << hash;
	return output.str();
}

CaosRiskReview ReviewCaosUsage(const CaosUsage& usage) {
	// Flow control, output and state that dies with the VM (TARG, local
	// variables). Anything else is assumed to change the world, so a command
	// added to the tables later is safe by default.
	static const std::set<std::string> readOnlyCommands = {
		"absv", "adds", "addv", "andv", "char", "dbg:", "divv", "doif",
		"elif", "else", "endi", "enum", "epas", "esee", "etch", "ever",
		"gids", "goto", "gsub", "inst", "lock", "loop", "modv", "mulv",
		"negv", "next", "orrv", "outs", "outv", "outx", "repe", "reps",
		"retn", "rtar", "seta", "sets", "setv", "slow", "star", "stop",
		"subr", "subv", "targ", "ttar", "unlk", "untl", "wait"
	};
	static const std::set<std::string> readOnlySubCommands = {
		"dbg: outs", "dbg: outv", "gids fmly", "gids gnus", "gids root",
		"gids spcs"
	};
	static const std::set<std::string> destructiveCommands = {
		"dead", "delg", "delm", "delr", "delw", "file", "gene", "hist",
		"ject", "kill", "load", "net:", "new:", "pray", "quit", "rgam",
		"save", "scrx"
	};
	// Rvalues that act, despite reading like a query.
	static const std::set<std::string> actingRValues = {
		"addm", "addr", "loft", "mute", "scol", "twin", "wolf"
	};
	static const std::set<std::string> destructiveRValues = {
		"caos", "net:", "pray"
	};

	std::set<std::string> mutating;
	std::set<std::string> destructive;
	for (const std::string& command : usage.commands) {
		if (destructiveCommands.count(command))
			destructive.insert(command);
		else if (!readOnlyCommands.count(command))
			mutating.insert(command);
	}
	for (const std::string& subCommand : usage.subCommands) {
		const std::string parent = subCommand.substr(0, subCommand.find(' '));
		if (usage.commands.count(parent) && readOnlyCommands.count(parent) &&
			!readOnlySubCommands.count(subCommand))
			mutating.insert(subCommand);
	}
	for (const std::string& op : usage.ops) {
		if (destructiveRValues.count(op))
			destructive.insert(op);
		else if (actingRValues.count(op))
			mutating.insert(op);
	}
	for (const std::string& variable : usage.variablesWritten) {
		const bool local = variable.size() == 4 &&
			variable.compare(0, 2, "va") == 0 &&
			std::isdigit(static_cast<unsigned char>(variable[2])) &&
			std::isdigit(static_cast<unsigned char>(variable[3]));
		if (!local)
			mutating.insert("write " + variable);
	}

	CaosRiskReview result;
	result.operations.assign(destructive.begin(), destructive.end());
	result.operations.insert(
		result.operations.end(), mutating.begin(), mutating.end());
	if (!destructive.empty()) {
		result.level = "broad-or-destructive";
		result.requiresAcknowledgement = true;
		result.warning =
			"Source contains broad or destructive CAOS commands";
	} else if (!mutating.empty()) {
		result.level = "mutating";
		result.requiresAcknowledgement = true;
		result.warning = "Source contains world-mutating CAOS commands";
	}
	return result;
}

CaosRiskReview UnreviewableCaosRisk() {
	CaosRiskReview result;
	result.level = "unknown";
	result.requiresAcknowledgement = true;
	result.warning = "Source did not compile, so its effects are unknown";
	return result;
}

std::string ValidateReviewedWorldSession(
	const std::string& reviewedWorldSessionId,
	const std::string& actualWorldSessionId) {
	if (reviewedWorldSessionId.empty() ||
		reviewedWorldSessionId != actualWorldSessionId)
		return "The world was reloaded after this review; review it again";
	return "";
}

std::string ValidateCaosExecutionContext(
	const std::string& expectedWorldName,
	const std::string& actualWorldName,
	long long expectedWorldTick,
	long long actualWorldTick,
	bool targetRequested,
	bool targetExists,
	bool targetClassifierMatches) {
	if (expectedWorldName.empty() || expectedWorldName != actualWorldName)
		return "The active world changed after CAOS review";
	if (expectedWorldTick < 0 || expectedWorldTick > actualWorldTick)
		return "The reviewed world tick is invalid for the active world";
	if (actualWorldTick - expectedWorldTick > 200)
		return "The reviewed CAOS context is stale; review again";
	if (targetRequested && !targetExists)
		return "The reviewed target agent no longer exists";
	if (targetRequested && !targetClassifierMatches)
		return "The reviewed target agent identity changed";
	return "";
}

std::string ValidateCaosScriptMutation(
	const std::string& mode,
	bool classifierValid,
	bool scriptExists,
	const std::string& expectedExistingChecksum,
	const std::string& actualExistingChecksum,
	bool confirmed) {
	if (!classifierValid)
		return "Classifier must identify a non-zero exact event";
	if (mode == "install") {
		if (scriptExists)
			return "An event is already installed at this classifier";
		return "";
	}
	if (mode != "replace" && mode != "remove")
		return "Script operation must be install, replace, or remove";
	if (!scriptExists)
		return "No installed event exists at this exact classifier";
	if (expectedExistingChecksum.empty() ||
		expectedExistingChecksum != actualExistingChecksum)
		return "The installed event changed after review";
	if (!confirmed)
		return "Explicit confirmation is required for this script operation";
	return "";
}

std::string CreatureDriveLabel(int drive) {
	static const char* const LABELS[CREATURE_DRIVE_COUNT] = {
		"Pain", "Hunger (Protein)", "Hunger (Carb)", "Hunger (Fat)",
		"Coldness", "Hotness", "Tiredness", "Sleepiness",
		"Loneliness", "Crowdedness", "Fear", "Boredom",
		"Anger", "Sex Drive", "Comfort",
		"Up", "Down", "Exit", "Enter", "Wait"
	};
	if (drive < 0 || drive >= CREATURE_DRIVE_COUNT)
		return "";
	return LABELS[drive];
}

bool IsNavigationDrive(int drive) {
	return drive >= CREATURE_NEED_DRIVE_COUNT &&
		drive < CREATURE_DRIVE_COUNT;
}

int HighestDriveInRange(const std::vector<float>& levels, int begin, int end) {
	if (begin < 0)
		begin = 0;
	if (end > static_cast<int>(levels.size()))
		end = static_cast<int>(levels.size());
	if (begin >= end)
		return -1;
	int highest = begin;
	for (int drive = begin + 1; drive < end; ++drive) {
		if (levels[drive] > levels[highest])
			highest = drive;
	}
	return highest;
}

std::string ChemicalNameFromCatalogueEntry(int chemicalId,
	const std::string& entry) {
	if (entry.empty())
		return "";
	std::ostringstream number;
	number << chemicalId;
	if (entry == number.str())
		return "";
	return entry;
}

std::string CreatureLifeStateMeaning(const std::string& lifeState) {
	if (lifeState == "zombie")
		return "Under external control (ZOMB 1), for example riding a lift "
			"or holding hands with the hand: alive, but it runs no decision "
			"scripts of its own until released";
	return "";
}

}
