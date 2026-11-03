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


#include "DebugServer.h"
#include "DebugServerLogic.h"
#include "DebugServerWork.h"

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
#include "Creature/MotorFaculty.h"
#include "Creature/SensoryFaculty.h"
#include "World.h"
#include "WorldMetadata.h"

#include <arpa/inet.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cctype>
#include <cstring>
#include <condition_variable>
#include <fcntl.h>
#include <fstream>
#include <functional>
#include <future>
#include <iomanip>
#include <initializer_list>
#include <map>
#include <memory>
#include <mutex>
#include <netinet/in.h>
#include <queue>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/socket.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>
#include <vector>

// Engine control — defined in SDL_Main.cpp
extern void SetEnginePaused(bool paused);
extern bool IsEnginePaused();
extern void SetGameSpeedMultiplier(float m);
extern float GetGameSpeedMultiplier();
extern void SetAdvanceTicks(uint32 n);
extern bool IsHeadlessMode();
extern bool IsDeveloperToolsMode();
extern bool IsMCPMode();
extern const std::vector<std::string> &GetSanitizedLaunchOptions();

#include "EngineBuildIdentity.h"

extern uint32 GetAdvanceTicksRemaining();



static DebugServerLogic::CaosUsage CaosUsageFrom(const Orderiser& orderiser) {
	DebugServerLogic::CaosUsage usage;
	usage.commands = orderiser.GetCommandsUsed();
	usage.subCommands = orderiser.GetSubCommandsUsed();
	usage.ops = orderiser.GetOpsUsed();
	usage.variablesWritten = orderiser.GetVariablesWritten();
	return usage;
}

static nlohmann::json CaosRiskJson(
	const DebugServerLogic::CaosRiskReview& risk) {
	return {
		{"level", risk.level},
		{"requiresAcknowledgement", risk.requiresAcknowledgement},
		{"warning", risk.warning},
		{"operations", risk.operations},
		{"source", "compiled"}
	};
}

static std::string GenerateRemoteAccessToken() {
	unsigned char bytes[24];
	std::ifstream source("/dev/urandom", std::ios::binary);
	if (!source.read(reinterpret_cast<char*>(bytes), sizeof(bytes)))
		throw std::runtime_error("Could not generate a remote access token");
	std::ostringstream token;
	token << std::hex << std::setfill('0');
	for (unsigned char value : bytes)
		token << std::setw(2) << static_cast<int>(value);
	return token.str();
}

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

static uint64_t WallTimeMilliseconds() {
	return static_cast<uint64_t>(
		std::chrono::duration_cast<std::chrono::milliseconds>(
			std::chrono::system_clock::now().time_since_epoch()).count());
}

static std::string StableTextFingerprint(const std::string& text) {
	uint64_t hash = 14695981039346656037ULL;
	for (unsigned char byte : text) {
		hash ^= byte;
		hash *= 1099511628211ULL;
	}
	std::ostringstream out;
	out << std::hex << std::setfill('0') << std::setw(16) << hash;
	return out.str();
}

static nlohmann::json CaosSourceLocation(
	const std::string& source, int position) {
	nlohmann::json location;
	location["position"] = position;
	if (position < 0) {
		location["line"] = nullptr;
		location["column"] = nullptr;
		return location;
	}
	const size_t end = std::min(
		static_cast<size_t>(position), source.size());
	int line = 1;
	int column = 1;
	for (size_t index = 0; index < end; ++index) {
		if (source[index] == '\n') {
			++line;
			column = 1;
		} else {
			++column;
		}
	}
	location["line"] = line;
	location["column"] = column;
	return location;
}

static bool CaosClassifierFromJson(
	const nlohmann::json& request,
	int& family,
	int& genus,
	int& species,
	int& event) {
	if (!request.contains("classifier") ||
		!request["classifier"].is_object())
		return false;
	const nlohmann::json& classifier = request["classifier"];
	family = classifier.value("family", -1);
	genus = classifier.value("genus", -1);
	species = classifier.value("species", -1);
	event = classifier.value("event", -1);
	return family >= 0 && family <= 255 &&
		genus >= 0 && genus <= 255 &&
		species >= 0 && species <= 65535 &&
		event >= 0 && event <= 65535 &&
		(family != 0 || genus != 0 || species != 0 || event != 0);
}

static std::string CaosScriptSource(MacroScript* script) {
	if (!script || !script->GetDebugInfo())
		return "";
	std::string source;
	script->GetDebugInfo()->GetSourceCode(source);
	return source;
}

static std::string JsonOptionalString(
	const nlohmann::json& value, const char* field) {
	return value.contains(field) && value[field].is_string()
		? value[field].get<std::string>()
		: "";
}

static bool LocalFileExists(const std::string& path) {
	struct stat info;
	return stat(path.c_str(), &info) == 0 && S_ISREG(info.st_mode);
}

static std::string FileFingerprint(const std::string& path) {
	std::ifstream input(path.c_str(), std::ios::binary);
	if (!input.is_open())
		return "";
	std::ostringstream bytes;
	bytes << input.rdbuf();
	if (!input.good() && !input.eof())
		return "";
	return DebugServerLogic::Fnv1a64Checksum(bytes.str());
}

static bool CopyFileWithoutOverwrite(
	const std::string& source,
	const std::string& destination) {
	std::ifstream input(source.c_str(), std::ios::binary);
	if (!input.is_open())
		return false;
	const int output = open(
		destination.c_str(),
		O_WRONLY | O_CREAT | O_EXCL,
		S_IRUSR | S_IWUSR);
	if (output < 0)
		return false;
	bool ok = true;
	char buffer[16384];
	while (input.good()) {
		input.read(buffer, sizeof(buffer));
		const std::streamsize count = input.gcount();
		std::streamsize offset = 0;
		while (offset < count) {
			const ssize_t written = write(
				output,
				buffer + offset,
				static_cast<size_t>(count - offset));
			if (written <= 0) {
				ok = false;
				break;
			}
			offset += written;
		}
		if (!ok)
			break;
	}
	if (!input.eof() && !input.good())
		ok = false;
	if (close(output) != 0)
		ok = false;
	if (!ok)
		unlink(destination.c_str());
	return ok;
}

static bool InstallFileWithoutOverwrite(
	const std::string& temporary,
	const std::string& destination) {
	if (link(temporary.c_str(), destination.c_str()) != 0)
		return false;
	unlink(temporary.c_str());
	return true;
}

static std::string GenomeExperimentMetadataPath(
	const std::string& geneticsDirectory,
	const std::string& name) {
	return geneticsDirectory + name + ".gxp.json";
}

static nlohmann::json ReadGenomeExperimentMetadata(
	const std::string& geneticsDirectory,
	const std::string& name) {
	const std::string path =
		GenomeExperimentMetadataPath(geneticsDirectory, name);
	std::ifstream input(path.c_str());
	if (!input.is_open())
		return nlohmann::json();
	try {
		nlohmann::json metadata;
		input >> metadata;
		if (metadata.value("kind", "") !=
			"creatures3_observatory_genome_experiment") {
			return nlohmann::json();
		}
		return metadata;
	} catch (...) {
		return nlohmann::json();
	}
}

static bool IsGenomeExperimentMetadataFor(
	const nlohmann::json& metadata,
	const std::string& name,
	const std::string& currentChecksum = "") {
	if (metadata.is_null() ||
		metadata.value("schemaVersion", 0) != 1 ||
		metadata.value("derivedName", "") != name ||
		metadata.value("checksumAlgorithm", "") != "FNV-1a-64" ||
		!metadata.contains("derivedChecksum") ||
		!metadata["derivedChecksum"].is_string() ||
		metadata["derivedChecksum"].get<std::string>().empty()) {
		return false;
	}
	return currentChecksum.empty() ||
		metadata["derivedChecksum"].get<std::string>() ==
			currentChecksum;
}

static bool WriteGenomeExperimentMetadata(
	const std::string& geneticsDirectory,
	const std::string& name,
	const nlohmann::json& metadata) {
	const std::string path =
		GenomeExperimentMetadataPath(geneticsDirectory, name);
	const std::string temporary = path + ".tmp";
	std::ofstream output(
		temporary.c_str(), std::ios::out | std::ios::trunc);
	if (!output.is_open())
		return false;
	output << metadata.dump(2);
	output.flush();
	output.close();
	if (!output)
		return false;
	if (rename(temporary.c_str(), path.c_str()) != 0) {
		unlink(temporary.c_str());
		return false;
	}
	return true;
}

static nlohmann::json NewGenomeExperimentMetadata(
	const std::string& origin,
	const std::string& derivedName,
	const std::string& derivedChecksum,
	const std::string& sourceName,
	const std::string& sourceChecksum) {
	nlohmann::json metadata;
	metadata["kind"] = "creatures3_observatory_genome_experiment";
	metadata["schemaVersion"] = 1;
	metadata["origin"] = origin;
	metadata["derivedName"] = derivedName;
	metadata["derivedChecksum"] = derivedChecksum;
	metadata["checksumAlgorithm"] = "FNV-1a-64";
	metadata["sourceName"] =
		sourceName.empty() ? nlohmann::json(nullptr) :
			nlohmann::json(sourceName);
	metadata["sourceChecksum"] =
		sourceChecksum.empty() ? nlohmann::json(nullptr) :
			nlohmann::json(sourceChecksum);
	metadata["createdWorld"] = theApp.GetWorld().GetWorldName();
	metadata["createdWorldTick"] = theApp.GetWorld().GetWorldTick();
	metadata["updatedWorldTick"] = theApp.GetWorld().GetWorldTick();
	return metadata;
}

static std::string ValidateGenomeWritePayload(
	const nlohmann::json& genome) {
	if (!genome.contains("genes") ||
		!genome["genes"].is_array() ||
		genome["genes"].empty()) {
		return "At least one decoded gene is required";
	}
	int activeGenusGenes = 0;
	int activeHalfLivesGenes = 0;
	for (size_t index = 0;
		index < genome["genes"].size(); ++index) {
		const nlohmann::json& gene =
			genome["genes"][index];
		const std::string prefix =
			"Gene " + std::to_string(index) + " ";
		if (!gene.is_object() ||
			!gene.contains("type") ||
			!gene["type"].is_number_integer() ||
			!gene.contains("subtype") ||
			!gene["subtype"].is_number_integer()) {
			return prefix +
				"requires integer type and subtype fields";
		}
		const int type = gene["type"].get<int>();
		const int subtype = gene["subtype"].get<int>();
		if (!DebugServerLogic::IsSupportedGenomeGeneLayout(
			type, subtype)) {
			return prefix + "has an unknown type/subtype layout";
		}
		if (!gene.contains("data") ||
			!gene["data"].is_object()) {
			return prefix + "is missing structured data";
		}
		const nlohmann::json& data = gene["data"];
		auto integerField = [&prefix](
			const nlohmann::json& object,
			const char* key,
			long long minimum,
			long long maximum) -> std::string {
			if (!object.contains(key))
				return "";
			if (!object[key].is_number_integer())
				return prefix + key + " must be an integer";
			const long long value =
				object[key].get<long long>();
			if (value < minimum || value > maximum)
				return prefix + key + " is outside the serialized range";
			return "";
		};
		auto integerFields = [&integerField](
			const nlohmann::json& object,
			std::initializer_list<const char*> fields,
			long long minimum,
			long long maximum) -> std::string {
			for (std::initializer_list<const char*>::const_iterator
				field = fields.begin();
				field != fields.end(); ++field) {
				const std::string error =
					integerField(
						object, *field, minimum, maximum);
				if (!error.empty())
					return error;
			}
			return "";
		};
		auto byteArray = [&prefix](
			const nlohmann::json& object,
			const char* key,
			size_t expectedSize) -> std::string {
			if (!object.contains(key))
				return "";
			if (!object[key].is_array() ||
				object[key].size() != expectedSize)
				return prefix + key + " must contain exactly " +
					std::to_string(expectedSize) + " bytes";
			for (size_t byteIndex = 0;
				byteIndex < object[key].size(); ++byteIndex) {
				if (!object[key][byteIndex].is_number_integer()) {
					return prefix + key +
						" must contain only integer bytes";
				}
				const long long value =
					object[key][byteIndex].get<long long>();
				if (value < 0 || value > 255) {
					return prefix + key +
						" contains a byte outside 0–255";
				}
			}
			return "";
		};
		auto requiredByteArray = [&byteArray, &prefix](
			const nlohmann::json& object,
			const char* key,
			size_t expectedSize) -> std::string {
			if (!object.contains(key))
				return prefix + key + " is required for serialization";
			return byteArray(object, key, expectedSize);
		};
		auto fixedString = [&prefix](
			const nlohmann::json& object,
			const char* key,
			size_t maximumBytes) -> std::string {
			if (!object.contains(key))
				return "";
			if (!object[key].is_string())
				return prefix + key + " must be text";
			const std::string value =
				object[key].get<std::string>();
			if (value.size() > maximumBytes ||
				value.find('\0') != std::string::npos) {
				return prefix + key +
					" exceeds its fixed serialized field";
			}
			return "";
		};
		auto float8Field = [&prefix](
			const nlohmann::json& object,
			const char* key) -> std::string {
			if (!object.contains(key))
				return "";
			if (!object[key].is_number())
				return prefix + key + " must be numeric";
			const double value = object[key].get<double>();
			if (!std::isfinite(value) ||
				value < -1.0 || value > 127.0 / 128.0) {
				return prefix + key +
					" is outside the signed float8 range";
			}
			return "";
		};
		std::string fieldError = integerFields(
			gene,
			{"id", "generation", "switchOnTime",
				"mutability", "variant", "flagsRaw"},
			0, 255);
		if (!fieldError.empty())
			return fieldError;
		if (gene.contains("active") &&
			!gene["active"].is_boolean())
			return prefix + "active must be true or false";
		if (gene.contains("flags")) {
			if (!gene["flags"].is_object())
				return prefix + "flags must be structured";
			static const char* flagNames[] = {
				"mutable", "dupable", "cutable",
				"maleOnly", "femaleOnly", "dormant"
			};
			for (size_t flagIndex = 0;
				flagIndex < sizeof(flagNames) /
					sizeof(flagNames[0]); ++flagIndex) {
				if (gene["flags"].contains(
						flagNames[flagIndex]) &&
					!gene["flags"][flagNames[flagIndex]]
						.is_boolean()) {
					return prefix + flagNames[flagIndex] +
						" flag must be true or false";
				}
			}
		}

		if (type == 0 && subtype == 0) {
			fieldError = integerFields(data,
				{"updateTime", "x", "y"}, 0, 65535);
			if (fieldError.empty())
				fieldError = integerFields(data,
					{"width", "height", "red", "green",
						"blue", "wta", "tissue", "initAlways"},
					0, 255);
			if (fieldError.empty())
				fieldError = fixedString(data, "lobeName", 4);
			if (fieldError.empty())
				fieldError = requiredByteArray(
					data, "initRuleBytes", 48);
			if (fieldError.empty())
				fieldError = requiredByteArray(
					data, "updateRuleBytes", 48);
		} else if (type == 0 && subtype == 1) {
			fieldError = integerFields(data,
				{"clockRate", "damageRate", "lifeForce",
					"biotickStart", "atpDamageCoef"}, 0, 255);
		} else if (type == 0 && subtype == 2) {
			fieldError = integerFields(data,
				{"updateTime", "sLower", "sUpper", "sNum",
					"dLower", "dUpper", "dNum"}, 0, 65535);
			if (fieldError.empty())
				fieldError = integerFields(data,
					{"migrates", "ran", "srcVar",
						"dstVar", "initAlways"}, 0, 255);
			if (fieldError.empty())
				fieldError = fixedString(data, "srcLobe", 4);
			if (fieldError.empty())
				fieldError = fixedString(data, "dstLobe", 4);
			if (fieldError.empty())
				fieldError = requiredByteArray(
					data, "initRuleBytes", 48);
			if (fieldError.empty())
				fieldError = requiredByteArray(
					data, "updateRuleBytes", 48);
		} else if (type == 1 && subtype == 0) {
			fieldError = integerFields(data,
				{"organ", "tissue", "locus", "chemical",
					"threshold", "nominal", "gain", "flags"},
				0, 255);
		} else if (type == 1 && subtype == 1) {
			fieldError = integerFields(data,
				{"organ", "tissue", "locus", "chemical",
					"threshold", "rate", "gain", "flags"},
				0, 255);
		} else if (type == 1 && subtype == 2) {
			fieldError = integerFields(data,
				{"r1Amount", "r1Chem", "r2Amount", "r2Chem",
					"p1Amount", "p1Chem", "p2Amount", "p2Chem",
					"rate"}, 0, 255);
		} else if (type == 1 && subtype == 3) {
			fieldError = requiredByteArray(
				data, "halfLives", 256);
		} else if (type == 1 && subtype == 4) {
			fieldError = integerFields(
				data, {"chemical", "amount"}, 0, 255);
		} else if (type == 1 && subtype == 5) {
			fieldError = integerFields(data,
				{"lobe0", "neuron0", "lobe1", "neuron1",
					"lobe2", "neuron2", "rate",
					"chem0", "amount0", "chem1", "amount1",
					"chem2", "amount2", "chem3", "amount3"},
				0, 255);
		} else if (type == 2 && subtype == 0) {
			fieldError = integerFields(data,
				{"stimulus", "significance", "input",
					"intensity", "features",
					"chem0", "chem1", "chem2", "chem3"},
				0, 255);
			const char* amountNames[] = {
				"amount0", "amount1", "amount2", "amount3"
			};
			for (size_t amountIndex = 0;
				fieldError.empty() && amountIndex < 4;
				++amountIndex) {
				fieldError = float8Field(
					data, amountNames[amountIndex]);
			}
		} else if (type == 2 && subtype == 1) {
			fieldError = integerField(
				data, "genus", 0, 255);
			if (fieldError.empty())
				fieldError = fixedString(
					data, "motherMoniker", 32);
			if (fieldError.empty())
				fieldError = fixedString(
					data, "fatherMoniker", 32);
		} else if (type == 2 && subtype == 2) {
			fieldError = integerFields(
				data, {"part", "variant", "species"}, 0, 255);
		} else if (type == 2 && subtype == 3) {
			fieldError = integerField(
				data, "poseNumber", 0, 255);
			if (fieldError.empty())
				fieldError = fixedString(
					data, "poseString", 16);
		} else if (type == 2 && subtype == 4) {
			fieldError = integerField(data, "gait", 0, 255);
			if (fieldError.empty())
				fieldError = requiredByteArray(data, "poses", 8);
		} else if (type == 2 && subtype == 5) {
			fieldError = integerFields(data,
				{"lobe0", "cell0", "lobe1", "cell1",
					"lobe2", "cell2", "action",
					"reinforcementChemical",
					"reinforcementAmount"}, 0, 255);
		} else if (type == 2 && subtype == 6) {
			fieldError = integerFields(
				data, {"pigment", "amount"}, 0, 255);
		} else if (type == 2 && subtype == 7) {
			fieldError = integerFields(
				data, {"rotation", "swap"}, 0, 255);
		} else if (type == 2 && subtype == 8) {
			fieldError = integerFields(data,
				{"expression", "weight",
					"drive0", "amount0", "drive1", "amount1",
					"drive2", "amount2", "drive3", "amount3"},
				0, 255);
		} else if (type == 3 && subtype == 0) {
			fieldError = integerFields(data,
				{"clockRate", "damageRate", "lifeForce",
					"biotickStart", "atpDamageCoef"}, 0, 255);
		}
		if (!fieldError.empty())
			return fieldError;
		if (gene.value("active", true)) {
			if (type == 2 && subtype == 1)
				activeGenusGenes++;
			if (type == 1 && subtype == 3)
				activeHalfLivesGenes++;
		}
	}
	if (activeGenusGenes > 1)
		return "Only one active Genus gene can be serialized safely";
	if (activeHalfLivesGenes > 1)
		return "Only one active Half-lives gene can be serialized safely";
	return "";
}

static std::string BrainNeuronSemanticLabel(const std::string& lobeName, int neuronIndex) {
	static const char* DRIVE_LABELS[] = {
		"Pain", "Hunger (Protein)", "Hunger (Carb)", "Hunger (Fat)",
		"Coldness", "Hotness", "Tiredness", "Sleepiness",
		"Loneliness", "Crowdedness", "Fear", "Boredom",
		"Anger", "Sex Drive", "Comfort",
		"Up", "Down", "Exit", "Enter", "Wait"
	};
	static const char* ACTION_LABELS[] = {
		"Quiescent", "Push", "Pull", "Stop",
		"Approach", "Retreat", "Get", "Drop",
		"Express", "Rest", "West", "East",
		"Eat", "Hit"
	};

	if (neuronIndex < 0)
		return "";
	const bool isNounLobe = lobeName == "noun" || lobeName == "attn" ||
		lobeName == "stim" || lobeName == "visn" || lobeName == "smel";
	if (isNounLobe && neuronIndex < SensoryFaculty::GetNumCategories())
		return SensoryFaculty::GetCategoryName(neuronIndex);
	if ((lobeName == "verb" || lobeName == "decn") && neuronIndex < NUMACTIONS)
		return ACTION_LABELS[neuronIndex];
	if (lobeName == "driv" && neuronIndex < NUMDRIVES)
		return DRIVE_LABELS[neuronIndex];
	return "";
}

// ── DebugServer::Impl ──────────────────────────────────────────────────────
struct DebugServer::Impl {
	struct LogContextSnapshot {
		std::string worldName;
		std::string worldSessionId;
		uint32 worldTick = 0;
		uint32 systemTick = 0;
		bool paused = false;
		float gameSpeed = 1.0f;
		uint64_t capturedAtWallTimeMs = 0;
	};

	struct BufferedLog {
		uint64_t id = 0;
		std::string json;
		size_t bytes = 0;
	};

	httplib::Server svr;
	std::thread serverThread;
	bool running = false;

	// SSE log buffer — UDP relay pushes here, SSE clients drain from here
	std::mutex logMutex;
	std::condition_variable logCV;
	std::deque<BufferedLog> logBuffer;
	static const size_t MAX_LOG_BUFFER = 5000;
	static const size_t MAX_LOG_BUFFER_BYTES = 4 * 1024 * 1024;
	size_t logBufferBytes = 0;
	uint64_t nextLogId = 1;
	uint64_t droppedLogs = 0;
	uint64_t rejectedDatagrams = 0;
	uint64_t nextCorrelationId = 1;
	std::string streamId;

	std::mutex logContextMutex;
	LogContextSnapshot logContext;

	// UDP listener for FlightRecorder rebroadcast
	int udpSocket = -1;
	std::thread udpThread;
	std::atomic<bool> udpRunning{false};

	// Work queue for main-thread execution
	std::mutex queueMutex;
	std::queue<WorkItem*> workQueue;

	// Observatory session transition — retained until the requested world is
	// observed as active so browser clients cannot miss the deferred load.
	std::mutex sessionMutex;
	std::string requestedWorldName;
	std::string requestedWorldType;
	unsigned int requestedWorldGeneration = 0;

	// Injection reviews already spent. Main thread only.
	std::set<std::string> consumedInjectionReviews;

	std::string staticDir;
	int port = 9980;

	Impl() {
		std::ostringstream id;
		id << WallTimeMilliseconds() << "-" << getpid();
		streamId = id.str();
	}

	// Changes on every world load, including reloading the same name, and
	// across engine restarts. Call on the main thread.
	std::string WorldSessionId() const {
		return streamId + "." +
			std::to_string(theApp.GetWorldLoadGeneration());
	}

	LogContextSnapshot SnapshotLogContext() {
		std::lock_guard<std::mutex> lock(logContextMutex);
		return logContext;
	}

	std::string NextCorrelationId(const std::string& action) {
		std::lock_guard<std::mutex> lock(logMutex);
		std::ostringstream id;
		id << action << "-" << streamId << "-" << nextCorrelationId++;
		return id.str();
	}

	void PushEnvelope(nlohmann::json record) {
		const LogContextSnapshot context = SnapshotLogContext();
		if (!record.contains("schemaVersion"))
			record["schemaVersion"] = 2;
		if (!record.contains("kind"))
			record["kind"] = "record";
		if (!record.contains("receivedAtWallTimeMs"))
			record["receivedAtWallTimeMs"] = WallTimeMilliseconds();
		if (!record.contains("wallTimeMs"))
			record["wallTimeMs"] = record["receivedAtWallTimeMs"];
		if (!record.contains("worldName") && !context.worldName.empty()) {
			record["worldName"] = context.worldName;
			record["worldSessionId"] = context.worldSessionId;
			record["worldTick"] = context.worldTick;
			record["systemTick"] = context.systemTick;
			record["enginePaused"] = context.paused;
			record["gameSpeed"] = context.gameSpeed;
			record["contextCapturedAtWallTimeMs"] =
				context.capturedAtWallTimeMs;
			if (!record.contains("contextTiming"))
				record["contextTiming"] = "nearest_engine_poll";
		}
		if (!record.contains("worldName"))
			record["worldName"] = nullptr;
		if (!record.contains("worldTick"))
			record["worldTick"] = nullptr;
		if (!record.contains("systemTick"))
			record["systemTick"] = nullptr;
		if (!record.contains("enginePaused"))
			record["enginePaused"] = nullptr;
		if (!record.contains("gameSpeed"))
			record["gameSpeed"] = nullptr;
		if (!record.contains("agent"))
			record["agent"] = nullptr;
		if (!record.contains("script"))
			record["script"] = nullptr;
		if (!record.contains("correlationId"))
			record["correlationId"] = nullptr;

		std::lock_guard<std::mutex> lock(logMutex);
		const uint64_t id = nextLogId++;
		record["streamId"] = streamId;
		record["recordId"] = id;
		const std::string serialized = record.dump(
			-1, ' ', false, nlohmann::json::error_handler_t::replace);
		BufferedLog buffered;
		buffered.id = id;
		buffered.json = serialized;
		buffered.bytes = serialized.size();
		logBuffer.push_back(buffered);
		logBufferBytes += buffered.bytes;
		while (logBuffer.size() > MAX_LOG_BUFFER ||
			logBufferBytes > MAX_LOG_BUFFER_BYTES) {
			logBufferBytes -= logBuffer.front().bytes;
			logBuffer.pop_front();
			droppedLogs++;
		}
		logCV.notify_all();
	}

	void PushApiRecord(
		const std::string& action,
		const std::string& message,
		const std::string& correlationId,
		const std::string& severity = "info",
		AgentHandle handle = NULLHANDLE,
		const std::string& contextTiming = "engine_main_thread") {
		nlohmann::json record;
		record["schemaVersion"] = 2;
		record["kind"] = "record";
		record["source"] = "debug_server";
		record["legacy"] = false;
		record["categoryMask"] = 8;
		record["severity"] = severity;
		record["subsystem"] = "developer_tools";
		record["message"] = message;
		record["action"] = action;
		record["correlationId"] = correlationId;
		record["contextTiming"] = contextTiming;
		if (handle.IsValid()) {
			Agent& agent = handle.GetAgentReference();
			const Classifier agentClass = agent.GetClassifier();
			nlohmann::json agentContext;
			agentContext["id"] = agent.GetUniqueID();
			agentContext["family"] = agentClass.Family();
			agentContext["genus"] = agentClass.Genus();
			agentContext["species"] = agentClass.Species();
			record["agent"] = agentContext;

			CAOSMachine& vm = agent.GetVirtualMachine();
			MacroScript* macro = vm.GetScript();
			if (macro) {
				Classifier scriptClass;
				macro->GetClassifier(scriptClass);
				nlohmann::json scriptContext;
				scriptContext["family"] = scriptClass.Family();
				scriptContext["genus"] = scriptClass.Genus();
				scriptContext["species"] = scriptClass.Species();
				scriptContext["event"] = scriptClass.Event();
				scriptContext["ip"] = vm.GetIP();
				record["script"] = scriptContext;
			}
		}
		PushEnvelope(record);
	}

	void PushFlightRecorderLog(const std::string& line) {
		const DebugServerLogic::FlightRecorderDatagram incoming =
			DebugServerLogic::ParseFlightRecorderDatagram(line);
		if (!incoming.valid) {
			std::lock_guard<std::mutex> lock(logMutex);
			rejectedDatagrams++;
			return;
		}

		nlohmann::json record;
		record["schemaVersion"] = 2;
		record["kind"] = "record";
		record["source"] = "flight_recorder";
		record["legacy"] = !incoming.structured;
		record["monotonicMs"] = incoming.monotonicMs;
		if (incoming.hasWallTime)
			record["wallTimeMs"] = incoming.wallTimeMs;
		record["categoryMask"] = incoming.categoryMask;
		record["severity"] = DebugServerLogic::ClassifyLogSeverity(
			incoming.categoryMask, incoming.message);
		record["subsystem"] =
			DebugServerLogic::LogSubsystemLabel(incoming.categoryMask);
		record["message"] = incoming.message;
		// Compatibility aliases for existing SSE consumers.
		record["t"] = incoming.monotonicMs;
		record["cat"] = incoming.categoryMask;
		record["msg"] = incoming.message;
		PushEnvelope(record);
	}

	void UpdateLogContext(const LogContextSnapshot& next) {
		if (next.worldName.empty())
			return;
		LogContextSnapshot previous;
		{
			std::lock_guard<std::mutex> lock(logContextMutex);
			previous = logContext;
			logContext = next;
		}
		if (previous.worldSessionId == next.worldSessionId)
			return;
		const bool reloadedSameWorld =
			previous.worldName == next.worldName;

		nlohmann::json boundary;
		boundary["schemaVersion"] = 2;
		boundary["kind"] = "world_boundary";
		boundary["source"] = "engine_session";
		boundary["legacy"] = false;
		boundary["severity"] = "info";
		boundary["subsystem"] = "world";
		boundary["categoryMask"] = 4;
		boundary["message"] = previous.worldName.empty()
			? "Log session started for world " + next.worldName
			: reloadedSameWorld
				? "World reloaded: " + next.worldName
				: "World changed from " + previous.worldName +
					" to " + next.worldName;
		boundary["previousWorldName"] =
			previous.worldName.empty() ? nlohmann::json(nullptr) :
				nlohmann::json(previous.worldName);
		boundary["worldName"] = next.worldName;
		boundary["worldSessionId"] = next.worldSessionId;
		boundary["worldTick"] = next.worldTick;
		boundary["systemTick"] = next.systemTick;
		boundary["enginePaused"] = next.paused;
		boundary["gameSpeed"] = next.gameSpeed;
		boundary["contextCapturedAtWallTimeMs"] =
			next.capturedAtWallTimeMs;
		boundary["contextTiming"] = "engine_main_thread";
		PushEnvelope(boundary);
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
				// FlightRecorder only ever sends over loopback. The socket is
				// bound there too; this also covers a peer that reaches it
				// through an unusual interface configuration.
				if (from.sin_family != AF_INET ||
					(ntohl(from.sin_addr.s_addr) >> 24) != 127)
					continue;
				buf[n] = '\0';
				// Trim trailing whitespace
				while (n > 0 && (buf[n-1] == '\n' || buf[n-1] == '\r'))
					buf[--n] = '\0';
				if (n > 0) {
					// This thread has no outer handler, so anything escaping
					// here would terminate the engine.
					try {
						PushFlightRecorderLog(std::string(buf, n));
					} catch (const std::exception& error) {
						fprintf(stderr, "[DebugServer] Dropped log record: %s\n",
							error.what());
					} catch (...) {
						fprintf(stderr, "[DebugServer] Dropped log record\n");
					}
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
DebugServer::DebugServer() : myImpl(nullptr), myAllowRemoteAccess(false) {}
DebugServer::~DebugServer() { Stop(); }

bool DebugServer::IsRunning() const {
	return myImpl && myImpl->running;
}

void DebugServer::AllowRemoteAccess(const std::string& token) {
	myAllowRemoteAccess = true;
	myRemoteAccessToken = token.empty() ? GenerateRemoteAccessToken() : token;
}

// ── Start (with static file serving — used by --tools) ────────────────────
void DebugServer::Start(int port, const std::string& staticDir) {
	if (myImpl) return; // already running
	myImpl = new Impl();
	myImpl->port = port;
	myImpl->staticDir = staticDir;

	// ── Access control ─────────────────────────────────────────────────
	// Runs before static files and every API route.
	const std::string remoteToken = myRemoteAccessToken;
	myImpl->svr.set_pre_routing_handler(
		[remoteToken](const httplib::Request& req, httplib::Response& res) {
		// Remote browsers exchange the printed URL's token for a cookie,
		// because EventSource cannot send an Authorization header.
		if (!remoteToken.empty() && req.path == "/" &&
			DebugServerLogic::ApiTokenMatches(
				req.get_param_value("token"), remoteToken)) {
			res.set_header("Set-Cookie",
				std::string(DebugServerLogic::API_TOKEN_COOKIE) + "=" +
				remoteToken + "; Path=/; HttpOnly; SameSite=Lax");
			res.set_redirect("/");
			return httplib::Server::HandlerResponse::Handled;
		}
		DebugServerLogic::ApiAccessRequest access;
		access.host = req.get_header_value("Host");
		access.origin = req.get_header_value("Origin");
		access.fetchSite = req.get_header_value("Sec-Fetch-Site");
		access.authorization = req.get_header_value("Authorization");
		access.cookie = req.get_header_value("Cookie");
		access.peerAddress = req.remote_addr;
		access.isApiPath = req.path.rfind("/api/", 0) == 0;
		const DebugServerLogic::ApiAccessDecision decision =
			DebugServerLogic::DecideApiAccess(access, remoteToken);
		if (decision.allowed)
			return httplib::Server::HandlerResponse::Unhandled;
		nlohmann::json body;
		body["ok"] = false;
		body["error"] = decision.error;
		res.status = decision.status;
		res.set_content(body.dump(), "application/json");
		return httplib::Server::HandlerResponse::Handled;
	});

	// ── Static file serving ────────────────────────────────────────────
	if (!staticDir.empty()) {
		myImpl->svr.set_mount_point("/", staticDir.c_str());
	}

	// ── Response headers ───────────────────────────────────────────────
	// Deliberately no CORS headers: only pages served from here may read the
	// API. The token URL must not leak through a Referer.
	myImpl->svr.set_default_headers({
		{"X-Content-Type-Options", "nosniff"},
		{"X-Frame-Options", "DENY"},
		{"Referrer-Policy", "no-referrer"}
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
		const std::string correlationId =
			myImpl->NextCorrelationId("caos");
		auto* item = new WorkItem();
		item->work = [caos, correlationId, this]() -> std::string {
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
			myImpl->PushApiRecord(
				"caos_execute",
				ok ? "Developer Tools CAOS request completed"
					: "Developer Tools CAOS request failed",
				correlationId,
				ok ? "info" : "error");
			return "{\"ok\":" + std::string(ok ? "true" : "false") +
				",\"output\":\"" + JsonEscape(output) +
				"\",\"error\":\"" + JsonEscape(error) + "\"}";
		};

		auto future = item->get_future();
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

	// ── POST /api/caos/validate ────────────────────────────────────────
	// Compiles reviewed workbench source without executing it. Validation
	// reports syntax and known command risk; it is explicitly not a safety
	// guarantee.
	myImpl->svr.Post("/api/caos/validate",
		[this](const httplib::Request& req, httplib::Response& res) {
		const std::string body = req.body;
		auto* item = new WorkItem();
		item->work = [body]() -> std::string {
			nlohmann::json result;
			result["ok"] = false;
			result["validationIsSafety"] = false;
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				const std::string source =
					request.value("source", "");
				result["sourceChecksum"] =
					DebugServerLogic::Fnv1a64Checksum(source);
				result["risk"] = CaosRiskJson(
					DebugServerLogic::UnreviewableCaosRisk());
				if (source.empty()) {
					result["error"] = "CAOS source is required";
					result["location"] =
						CaosSourceLocation(source, 0);
					return result.dump();
				}
				Orderiser orderiser;
				MacroScript* macro =
					orderiser.OrderFromCAOS(source.c_str());
				if (!macro) {
					result["error"] = orderiser.GetLastError();
					result["location"] = CaosSourceLocation(
						source, orderiser.GetLastErrorPos());
					return result.dump();
				}
				delete macro;
				result["risk"] = CaosRiskJson(
					DebugServerLogic::ReviewCaosUsage(
						CaosUsageFrom(orderiser)));
				result["ok"] = true;
				result["error"] = nullptr;
				result["location"] = nullptr;
			} catch (const std::exception& error) {
				result["error"] = error.what();
				result["location"] = nullptr;
			}
			return result.dump();
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(5)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"ok\":false,\"error\":\"Timeout\",\"validationIsSafety\":false}",
				"application/json");
		}
	});

	// ── POST /api/caos/evaluate ────────────────────────────────────────
	// Runs source in a new ownerless VM against the exact reviewed world and
	// optional TARG identity. Source and context are revalidated on the main
	// thread immediately before execution.
	myImpl->svr.Post("/api/caos/evaluate",
		[this](const httplib::Request& req, httplib::Response& res) {
		const std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("caos-evaluate");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			nlohmann::json result;
			result["ok"] = false;
			result["mode"] = "evaluate";
			result["correlationId"] = correlationId;
			result["ownerAgentId"] = nullptr;
			const std::chrono::steady_clock::time_point started =
				std::chrono::steady_clock::now();
			bool restoreEnginePause = false;
			auto finish = [&]() -> std::string {
				if (restoreEnginePause) {
					SetEnginePaused(false);
					restoreEnginePause = false;
				}
				result["elapsedWallMs"] =
					std::chrono::duration_cast<std::chrono::milliseconds>(
						std::chrono::steady_clock::now() -
						started).count();
				myImpl->PushApiRecord(
					"caos_evaluate",
					result.value("ok", false)
						? "Reviewed CAOS evaluation completed"
						: "Reviewed CAOS evaluation failed",
					correlationId,
					result.value("ok", false) ? "info" : "error");
				return result.dump();
			};
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				if (request.value("mode", "") != "evaluate")
					throw std::runtime_error(
						"Mode must be evaluate");
				const std::string source =
					request.value("source", "");
				const std::string sourceChecksum =
					DebugServerLogic::Fnv1a64Checksum(source);
				if (source.empty() ||
					request.value("sourceChecksum", "") !=
						sourceChecksum) {
					throw std::runtime_error(
						"CAOS source changed after review");
				}

				const std::string worldName =
					theApp.GetWorld().GetWorldName();
				const long long worldTick =
					theApp.GetWorld().GetWorldTick();
				const long long systemTick =
					theApp.GetSystemTick();
				const bool targetRequested =
					request.contains("targetAgentId") &&
					!request["targetAgentId"].is_null();
				AgentHandle target = NULLHANDLE;
				bool targetExists = !targetRequested;
				bool targetClassifierMatches = !targetRequested;
				if (targetRequested) {
					const uint32 targetId =
						request["targetAgentId"].get<uint32>();
					target = theAgentManager.GetAgentFromID(targetId);
					targetExists = target.IsValid();
					if (targetExists &&
						request.contains("expectedTargetClassifier") &&
						request["expectedTargetClassifier"].is_object()) {
						const Classifier actual =
							target.GetAgentReference().GetClassifier();
						const nlohmann::json& expected =
							request["expectedTargetClassifier"];
						targetClassifierMatches =
							expected.value("family", -1) ==
								static_cast<int>(actual.Family()) &&
							expected.value("genus", -1) ==
								static_cast<int>(actual.Genus()) &&
							expected.value("species", -1) ==
								static_cast<int>(actual.Species());
					}
				}
				const std::string sessionError =
					DebugServerLogic::ValidateReviewedWorldSession(
						request.value("expectedWorldSessionId", ""),
						myImpl->WorldSessionId());
				if (!sessionError.empty())
					throw std::runtime_error(sessionError);
				const std::string contextError =
					DebugServerLogic::ValidateCaosExecutionContext(
						request.value("expectedWorldName", ""),
						worldName,
						request.value("expectedWorldTick", -1LL),
						worldTick,
						targetRequested,
						targetExists,
						targetClassifierMatches);
				if (!contextError.empty())
					throw std::runtime_error(contextError);

				Orderiser orderiser;
				std::unique_ptr<MacroScript> macro(
					orderiser.OrderFromCAOS(source.c_str()));
				if (!macro) {
					result["error"] = orderiser.GetLastError();
					result["location"] = CaosSourceLocation(
						source, orderiser.GetLastErrorPos());
					result["sourceChecksum"] = sourceChecksum;
					return finish();
				}

				const DebugServerLogic::CaosRiskReview risk =
					DebugServerLogic::ReviewCaosUsage(
						CaosUsageFrom(orderiser));
				if (risk.requiresAcknowledgement &&
					!request.value("riskAcknowledged", false)) {
					throw std::runtime_error(
						"Risk acknowledgement is required: " +
						risk.warning);
				}

				const bool pauseBeforeRun =
					request.value("pauseBeforeRun", false);
				const bool wasPaused = IsEnginePaused();
				if (pauseBeforeRun && !wasPaused) {
					SetEnginePaused(true);
					restoreEnginePause = true;
				}
				std::ostringstream output;
				int runtimePosition = -1;
				CAOSMachine vm;
				try {
					vm.StartScriptExecuting(
						macro.get(), NULLHANDLE, NULLHANDLE,
						INTEGERZERO, INTEGERZERO);
					if (targetRequested)
						vm.SetTarg(target);
					vm.SetOutputStream(&output);
					vm.UpdateVM(-1);
					if (macro->GetDebugInfo())
						runtimePosition =
							macro->GetDebugInfo()->MapAddressToSource(
								vm.GetIP());
				} catch (CAOSMachine::RunError& error) {
					if (macro->GetDebugInfo())
						runtimePosition =
							macro->GetDebugInfo()->MapAddressToSource(
								vm.GetIP());
					if (restoreEnginePause) {
						SetEnginePaused(false);
						restoreEnginePause = false;
					}
					result["error"] = error.what();
					result["location"] = CaosSourceLocation(
						source, runtimePosition);
					result["output"] = output.str();
					result["sourceChecksum"] = sourceChecksum;
					return finish();
				}
				if (restoreEnginePause) {
					SetEnginePaused(false);
					restoreEnginePause = false;
				}

				result["ok"] = true;
				result["output"] = output.str();
				result["error"] = nullptr;
				result["location"] = nullptr;
				result["sourceChecksum"] = sourceChecksum;
				result["riskLevel"] = risk.level;
				result["worldName"] = worldName;
				result["worldTickStart"] = worldTick;
				result["worldTickEnd"] =
					theApp.GetWorld().GetWorldTick();
				result["systemTickStart"] = systemTick;
				result["systemTickEnd"] = theApp.GetSystemTick();
				result["targetAgentId"] = targetRequested
					? request["targetAgentId"]
					: nlohmann::json(nullptr);
				result["pausedForRun"] =
					pauseBeforeRun && !wasPaused;
			} catch (const std::exception& error) {
				if (restoreEnginePause) {
					SetEnginePaused(false);
					restoreEnginePause = false;
				}
				result["error"] = error.what();
				result["location"] = nullptr;
			} catch (...) {
				if (restoreEnginePause) {
					SetEnginePaused(false);
					restoreEnginePause = false;
				}
				result["error"] =
					"Unknown error during CAOS evaluation";
				result["location"] = nullptr;
			}
			return finish();
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(10)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"ok\":false,\"mode\":\"evaluate\",\"error\":\"Timeout waiting for main thread\"}",
				"application/json");
		}
	});

	// ── POST /api/caos/script ──────────────────────────────────────────
	// Installs, conditionally replaces, or conditionally removes one exact
	// event script after rechecking its world, classifier, and checksum.
	myImpl->svr.Post("/api/caos/script",
		[this](const httplib::Request& req, httplib::Response& res) {
		const std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("caos-script");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			nlohmann::json result;
			result["ok"] = false;
			result["correlationId"] = correlationId;
			const std::chrono::steady_clock::time_point started =
				std::chrono::steady_clock::now();
			auto finish = [&]() -> std::string {
				result["elapsedWallMs"] =
					std::chrono::duration_cast<std::chrono::milliseconds>(
						std::chrono::steady_clock::now() -
						started).count();
				myImpl->PushApiRecord(
					"caos_script_" +
						result.value("mode", "unknown"),
					result.value("ok", false)
						? "Reviewed event-script operation completed"
						: "Reviewed event-script operation failed",
					correlationId,
					result.value("ok", false) ? "info" : "error");
				return result.dump();
			};
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				const std::string mode =
					request.value("mode", "");
				result["mode"] = mode;
				int family = -1;
				int genus = -1;
				int species = -1;
				int event = -1;
				const bool classifierValid =
					CaosClassifierFromJson(
						request, family, genus, species, event);
				const std::string worldName =
					theApp.GetWorld().GetWorldName();
				const long long worldTick =
					theApp.GetWorld().GetWorldTick();
				const std::string sessionError =
					DebugServerLogic::ValidateReviewedWorldSession(
						request.value("expectedWorldSessionId", ""),
						myImpl->WorldSessionId());
				if (!sessionError.empty())
					throw std::runtime_error(sessionError);
				const std::string contextError =
					DebugServerLogic::ValidateCaosExecutionContext(
						request.value("expectedWorldName", ""),
						worldName,
						request.value("expectedWorldTick", -1LL),
						worldTick,
						false, true, true);
				if (!contextError.empty())
					throw std::runtime_error(contextError);

				Classifier exact(
					family < 0 ? 0 : family,
					genus < 0 ? 0 : genus,
					species < 0 ? 0 : species,
					event < 0 ? 0 : event);
				Scriptorium& scriptorium =
					theApp.GetWorld().GetScriptorium();
				MacroScript* existing = classifierValid
					? scriptorium.FindScriptExact(exact)
					: NULL;
				const std::string existingSource =
					CaosScriptSource(existing);
				const std::string existingChecksum = existing
					? DebugServerLogic::Fnv1a64Checksum(
						existingSource)
					: "";
				const std::string mutationError =
					DebugServerLogic::ValidateCaosScriptMutation(
						mode,
						classifierValid,
						existing != NULL,
						JsonOptionalString(
							request, "expectedExistingChecksum"),
						existingChecksum,
						request.value("confirmed", false));
				if (!mutationError.empty())
					throw std::runtime_error(mutationError);

				if (mode == "remove") {
					if (!scriptorium.ZapScript(exact))
						throw std::runtime_error(
							"Installed event is locked by a running script");
					result["sourceChecksum"] =
						existingChecksum;
				} else {
					const std::string source =
						request.value("source", "");
					const std::string sourceChecksum =
						DebugServerLogic::Fnv1a64Checksum(source);
					if (source.empty() ||
						request.value("sourceChecksum", "") !=
							sourceChecksum) {
						throw std::runtime_error(
							"CAOS source changed after review");
					}
					Orderiser orderiser;
					MacroScript* macro =
						orderiser.OrderFromCAOS(source.c_str());
					if (!macro) {
						result["error"] =
							orderiser.GetLastError();
						result["location"] =
							CaosSourceLocation(
								source,
								orderiser.GetLastErrorPos());
						result["sourceChecksum"] =
							sourceChecksum;
						return finish();
					}
					macro->SetClassifier(exact);
					if (!scriptorium.InstallScript(macro)) {
						delete macro;
						throw std::runtime_error(
							"Installed event is locked by a running script");
					}
					result["sourceChecksum"] =
						sourceChecksum;
				}

				result["ok"] = true;
				result["error"] = nullptr;
				result["location"] = nullptr;
				result["worldName"] = worldName;
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				result["systemTick"] =
					theApp.GetSystemTick();
				result["classifier"] = {
					{"family", family}, {"genus", genus},
					{"species", species}, {"event", event}
				};
			} catch (const std::exception& error) {
				result["error"] = error.what();
				if (!result.contains("location"))
					result["location"] = nullptr;
			} catch (...) {
				result["error"] =
					"Unknown error during event-script operation";
				result["location"] = nullptr;
			}
			return finish();
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(10)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"ok\":false,\"error\":\"Timeout waiting for main thread\"}",
				"application/json");
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
			const uint32 worldTick = theApp.GetWorld().GetWorldTick();
			struct SourceSnapshot {
				std::string source;
				std::string revision;
			};
			std::map<DebugInfo*, SourceSnapshot> sourceCache;

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
				std::string sourceRevision;
				DebugInfo* di = macro->GetDebugInfo();
				if (di) {
					auto cached = sourceCache.find(di);
					if (cached == sourceCache.end()) {
						SourceSnapshot snapshot;
						di->GetSourceCode(snapshot.source);
						snapshot.revision = StableTextFingerprint(snapshot.source);
						cached = sourceCache.insert(
							std::make_pair(di, snapshot)).first;
					}
					const std::string& src = cached->second.source;
					sourceRevision = cached->second.revision;
					int pos = di->MapAddressToSource(vm.GetIP());
					sourceLine =
						DebugServerLogic::ExtractSourceStatement(src, pos);
				}

				std::string blockingCommand;
				std::string blockReason;
				if (vm.IsBlocking()) {
					blockingCommand = vm.GetCurrentCommandName();
					std::string normalizedCommand = blockingCommand;
					std::transform(
						normalizedCommand.begin(), normalizedCommand.end(),
						normalizedCommand.begin(),
						[](unsigned char value) {
							return static_cast<char>(std::toupper(value));
						});
					if (normalizedCommand == "WAIT")
						blockReason = "WAIT tick delay";
					else if (normalizedCommand == "OVER")
						blockReason = "OVER animation completion";
					else
						blockReason = "Reason unavailable";
				}

				if (!first) json << ",";
				first = false;

				std::string galleryName;
				try { galleryName = agent.GetGalleryName(); } catch (...) {}

				Classifier agentClass = agent.GetClassifier();
				AgentHandle targ = vm.GetTarg();
				AgentHandle itAgent = vm.GetIT();

				json << "{\"agentId\":" << agent.GetUniqueID()
					<< ",\"family\":" << (int)c.Family()
					<< ",\"genus\":" << (int)c.Genus()
					<< ",\"species\":" << (int)c.Species()
					<< ",\"event\":" << (int)c.Event()
					<< ",\"state\":\"" << state << "\""
					<< ",\"ip\":" << vm.GetIP()
					<< ",\"source\":\"" << JsonEscape(sourceLine) << "\""
					<< ",\"sourceRevision\":\"" << sourceRevision << "\""
					<< ",\"blockingCommand\":\"" << JsonEscape(blockingCommand) << "\""
					<< ",\"blockReason\":\"" << JsonEscape(blockReason) << "\""
					<< ",\"targ\":" << (targ.IsValid()
						? targ.GetAgentReference().GetUniqueID() : 0)
					<< ",\"it\":" << (itAgent.IsValid()
						? itAgent.GetAgentReference().GetUniqueID() : 0)
					<< ",\"posX\":" << (int)agent.GetPosition().x
					<< ",\"posY\":" << (int)agent.GetPosition().y
					<< ",\"worldTick\":" << worldTick
					<< ",\"gallery\":\"" << JsonEscape(galleryName) << "\""
					<< ",\"agentFamily\":" << (int)agentClass.Family()
					<< ",\"agentGenus\":" << (int)agentClass.Genus()
					<< ",\"agentSpecies\":" << (int)agentClass.Species()
					<< "}";
			}

			json << "]";
			return json.str();
		};

		auto future = item->get_future();
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

		auto future = item->get_future();
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
				nlohmann::json result;
				result["source"] = src;
				result["checksum"] =
					DebugServerLogic::Fnv1a64Checksum(src);
				result["classifier"] = {
					{"family", f}, {"genus", g},
					{"species", s}, {"event", e}
				};
				result["worldName"] =
					theApp.GetWorld().GetWorldName();
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				result["systemTick"] =
					theApp.GetSystemTick();
				return result.dump();
			} catch (...) {
				return "{\"error\":\"Failed to retrieve script\"}";
			}
		};

		auto future = item->get_future();
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

		auto future = item->get_future();
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

		auto future = item->get_future();
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

		auto future = item->get_future();
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

		auto future = item->get_future();
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

		auto future = item->get_future();
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
			std::string galleryName;
			try { galleryName = agent.GetGalleryName(); } catch (...) {}
			json << "{\"id\":" << agent.GetUniqueID()
				<< ",\"family\":" << (int)c.Family()
				<< ",\"genus\":" << (int)c.Genus()
				<< ",\"species\":" << (int)c.Species()
				<< ",\"gallery\":\"" << JsonEscape(galleryName) << "\""
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

			// _p1_ and _p2_ message parameters
			auto emitCAOSVar = [&json](const char* name, CAOSVar v) {
				json << ",\"" << name << "\":";
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
			};
			emitCAOSVar("p1", vm.GetP1());
			emitCAOSVar("p2", vm.GetP2());

			json << "}";
			return json.str();
		};

		auto future = item->get_future();
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

		const std::string correlationId =
			myImpl->NextCorrelationId("breakpoint");
		auto* item = new WorkItem();
		item->work = [agentId, ip, action, correlationId, this]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid()) {
				myImpl->PushApiRecord(
					"breakpoint_" + action,
					"Breakpoint request failed: agent not found",
					correlationId,
					"error");
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
				myImpl->PushApiRecord(
					"breakpoint",
					"Breakpoint request failed: unknown action",
					correlationId,
					"error",
					handle);
				return "{\"ok\":false,\"error\":\"Unknown action\"}";
			}
			std::ostringstream message;
			message << "Debugger " << action << " breakpoint for agent #"
				<< agentId;
			if (action != "clearAll")
				message << " at bytecode IP " << ip;
			myImpl->PushApiRecord(
				"breakpoint_" + action,
				message.str(),
				correlationId,
				"info",
				handle);

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

		auto future = item->get_future();
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

		const std::string correlationId =
			myImpl->NextCorrelationId("debug-step");
		auto* item = new WorkItem();
		item->work = [agentId, mode, correlationId, this]() -> std::string {
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
			myImpl->PushApiRecord(
				mode == "over" ? "debug_step_over" : "debug_step_into",
				"Debugger stepped agent #" + std::to_string(agentId),
				correlationId,
				"info",
				handle);
			return json.str();
		};

		auto future = item->get_future();
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

		const std::string correlationId =
			myImpl->NextCorrelationId("debug-continue");
		auto* item = new WorkItem();
		item->work = [agentId, correlationId, this]() -> std::string {
			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid()) {
				return "{\"ok\":false,\"error\":\"Agent not found\"}";
			}

			CAOSMachine& vm = handle.GetAgentReference().GetVirtualMachine();
			if (!vm.IsAtBreakpoint()) {
				return "{\"ok\":false,\"error\":\"Agent is not paused\"}";
			}

			vm.DebugContinue();
			myImpl->PushApiRecord(
				"debug_continue",
				"Debugger continued agent #" + std::to_string(agentId),
				correlationId,
				"info",
				handle);
			return "{\"ok\":true}";
		};

		auto future = item->get_future();
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
	myImpl->svr.Post("/api/pause", [this](const httplib::Request& req, httplib::Response& res) {
		SetEnginePaused(true);
		myImpl->PushApiRecord(
			"simulation_pause",
			"Developer Tools paused the simulation",
			myImpl->NextCorrelationId("pause"),
			"info",
			NULLHANDLE,
			"nearest_engine_poll");
		res.set_content("{\"ok\":true,\"paused\":true}", "application/json");
	});

	// ── POST /api/resume ─────────────────────────────────────────────
	// Resume the global engine simulation.
	myImpl->svr.Post("/api/resume", [this](const httplib::Request& req, httplib::Response& res) {
		SetEnginePaused(false);
		myImpl->PushApiRecord(
			"simulation_resume",
			"Developer Tools resumed the simulation",
			myImpl->NextCorrelationId("resume"),
			"info",
			NULLHANDLE,
			"nearest_engine_poll");
		res.set_content("{\"ok\":true,\"paused\":false}", "application/json");
	});

	// ── GET /api/engine-state ────────────────────────────────────────
	// Returns current engine pause state.
	myImpl->svr.Get("/api/engine-state", [](const httplib::Request& req, httplib::Response& res) {
		bool paused = IsEnginePaused();
		res.set_content(std::string("{\"paused\":") + (paused ? "true" : "false") + "}", "application/json");
	});

	// ── GET /api/session ──────────────────────────────────────────────
	// Coherent observatory status sample for the persistent browser ribbon.
	myImpl->svr.Get("/api/session", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = [this]() -> std::string {
			std::string worldName = theApp.GetWorld().GetWorldName();
			std::string worldType;
			if (worldName == "Startup") {
				worldType = "startup";
			} else {
				try {
					worldType = theApp.GetEameVar(
						"engine_no_auxiliary_bootstrap_1").GetInteger() == 1
						? "undocked" : "docked";
				} catch (...) {
					worldType.clear();
				}
			}

			int creatureCount = 0;
			try {
				AgentMap& agentMap = AgentManager::GetAgentIDMap();
				for (AgentMapIterator it = agentMap.begin(); it != agentMap.end(); ++it) {
					AgentHandle& handle = it->second->IsValid() ? *(it->second) : NULLHANDLE;
					if (handle.IsValid() && handle.IsCreature())
						creatureCount++;
				}
			} catch (...) {}

			std::string requestedWorldName;
			std::string requestedWorldType;
			{
				std::lock_guard<std::mutex> lock(myImpl->sessionMutex);
				// A generation change covers reloading the active world. An
				// empty deferred name covers a load that failed and kept it.
				if (!myImpl->requestedWorldName.empty() &&
					(theApp.GetWorldLoadGeneration() !=
						myImpl->requestedWorldGeneration ||
					 theApp.myLoadThisWorldNextTick.empty())) {
					myImpl->requestedWorldName.clear();
					myImpl->requestedWorldType.clear();
				}
				requestedWorldName = myImpl->requestedWorldName;
				requestedWorldType = myImpl->requestedWorldType;
			}

			// Also expose load requests initiated inside the engine rather than
			// through REST.  This flag can be brief, while REST requests remain
			// latched above until the new world is confirmed.
			if (requestedWorldName.empty() &&
				!theApp.myLoadThisWorldNextTick.empty()) {
				requestedWorldName = theApp.myLoadThisWorldNextTick;
				std::string error;
				theApp.ValidateWorldForLoad(
					requestedWorldName, requestedWorldType, error);
			}

			std::ostringstream json;
			json << "{\"worldName\":\"" << JsonEscape(worldName) << "\""
			     << ",\"worldSessionId\":\""
			     << JsonEscape(myImpl->WorldSessionId()) << "\"";
			if (worldType.empty())
				json << ",\"worldType\":null";
			else
				json << ",\"worldType\":\"" << JsonEscape(worldType) << "\"";
			json << ",\"worldTick\":" << theApp.GetWorld().GetWorldTick()
			     << ",\"systemTick\":" << theApp.GetSystemTick()
			     << ",\"paused\":" << (IsEnginePaused() ? "true" : "false")
			     << ",\"gameSpeed\":" << GetGameSpeedMultiplier()
			     << ",\"creatureCount\":" << creatureCount
			     << ",\"loadPending\":"
			     << (requestedWorldName.empty() ? "false" : "true");
			if (requestedWorldName.empty()) {
				json << ",\"requestedWorldName\":null"
				     << ",\"requestedWorldType\":null";
			} else {
				json << ",\"requestedWorldName\":\""
				     << JsonEscape(requestedWorldName) << "\"";
				if (requestedWorldType.empty())
					json << ",\"requestedWorldType\":null";
				else
					json << ",\"requestedWorldType\":\""
					     << JsonEscape(requestedWorldType) << "\"";
			}
			json << "}";
			return json.str();
		};

		auto future = item->get_future();
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

	// ── GET /api/creatures ────────────────────────────────────────────
	// Lists all creature agents with drives, life state, and glycogen reserve.
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

						// Legacy `health` is exactly glycogen (chemical 4).
						if (life) {
							const float glycogen = life->Health();
							json << ",\"health\":" << glycogen
								<< ",\"healthMeaning\":\"glycogen concentration (legacy compatibility)\""
								<< ",\"glycogenReserve\":" << glycogen
								<< ",\"glycogenChemicalId\":" << CHEM_GLYCOGEN;
						}

						// Position
						json << ",\"posX\":" << (int)agent.GetPosition().x
							<< ",\"posY\":" << (int)agent.GetPosition().y;
						int roomId = -1;
						int metaRoomId = -1;
						const Vector2D position = agent.GetPosition();
						if (theApp.GetWorld().GetMap().GetRoomIDForPoint(position, roomId)) {
							json << ",\"roomId\":" << roomId;
						}
						if (theApp.GetWorld().GetMap().GetMetaRoomIDForPoint(position, metaRoomId)) {
							json << ",\"metaRoomId\":" << metaRoomId;
						}

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

		auto future = item->get_future();
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

	// ── GET /api/creature/:id/observation ────────────────────────────
	// Coherent present-tense evidence for the live creature observation strip.
	// All fields are sampled together on the engine main thread.
	myImpl->svr.Get(R"(/api/creature/(\d+)/observation)",
		[this](const httplib::Request& req, httplib::Response& res) {
		const int agentId = std::stoi(req.matches[1]);
		auto* item = new WorkItem();
		item->work = [agentId]() -> std::string {
			nlohmann::json observation;
			observation["schemaVersion"] = 1;
			observation["source"] = "GET /api/creature/:id/observation";
			observation["contextTiming"] = "engine_main_thread";
			observation["capturedAtWallTimeMs"] = WallTimeMilliseconds();
			observation["worldName"] = theApp.GetWorld().GetWorldName();
			observation["worldTick"] = theApp.GetWorld().GetWorldTick();
			observation["systemTick"] = theApp.GetSystemTick();
			observation["enginePaused"] = IsEnginePaused();
			observation["gameSpeed"] = GetGameSpeedMultiplier();

			AgentHandle handle = theAgentManager.GetAgentFromID(agentId);
			if (handle.IsInvalid() || !handle.IsCreature()) {
				observation["error"] = "Creature not found";
				return observation.dump();
			}

			try {
				Creature& creature = handle.GetCreatureReference();
				Agent& agent = handle.GetAgentReference();
				Brain* brain = creature.GetBrain();
				LifeFaculty* life = creature.Life();
				MotorFaculty* motor = creature.Motor();

				std::string moniker;
				try { moniker = creature.GetMoniker(); } catch (...) {}
				std::string name;
				try {
					LinguisticFaculty* linguistic = creature.Linguistic();
					if (linguistic &&
						linguistic->KnownWord(
							LinguisticFaculty::PERSONAL,
							LinguisticFaculty::ME)) {
						name = linguistic->GetPlatonicWord(
							LinguisticFaculty::PERSONAL,
							LinguisticFaculty::ME);
					}
				} catch (...) {}

				const Vector2D position = agent.GetPosition();
				int roomId = -1;
				int metaRoomId = -1;
				theApp.GetWorld().GetMap().GetRoomIDForPoint(position, roomId);
				theApp.GetWorld().GetMap().GetMetaRoomIDForPoint(
					position, metaRoomId);

				std::string lifeState = "unknown";
				if (life) {
					if (life->GetWhetherDead()) lifeState = "dead";
					else if (life->GetWhetherUnconscious())
						lifeState = "unconscious";
					else if (life->GetWhetherDreaming())
						lifeState = "dreaming";
					else if (life->GetWhetherAsleep()) lifeState = "asleep";
					else if (life->GetWhetherZombie()) lifeState = "zombie";
					else if (life->GetWhetherAlert()) lifeState = "alert";
				}

				nlohmann::json creatureJson;
				creatureJson["agentId"] = agent.GetUniqueID();
				creatureJson["moniker"] = moniker;
				creatureJson["name"] = name;
				creatureJson["lifeState"] = lifeState;
				creatureJson["ageStage"] =
					life ? nlohmann::json(life->GetAge()) :
						nlohmann::json(nullptr);
				creatureJson["ageInTicks"] =
					life ? nlohmann::json(life->GetTickAge()) :
						nlohmann::json(nullptr);
				creatureJson["posX"] = position.x;
				creatureJson["posY"] = position.y;
				creatureJson["roomId"] =
					roomId >= 0 ? nlohmann::json(roomId) :
						nlohmann::json(nullptr);
				creatureJson["metaRoomId"] =
					metaRoomId >= 0 ? nlohmann::json(metaRoomId) :
						nlohmann::json(nullptr);
				observation["creature"] = creatureJson;

				struct NearbyAgent {
					float distanceSquared;
					nlohmann::json value;
				};
				std::vector<NearbyAgent> nearby;
				int sameRoomCount = 0;
				if (roomId >= 0) {
					AgentMap& agentMap = AgentManager::GetAgentIDMap();
					for (AgentMapIterator iterator = agentMap.begin();
						iterator != agentMap.end(); ++iterator) {
						AgentHandle& candidateHandle =
							iterator->second->IsValid()
								? *(iterator->second) : NULLHANDLE;
						if (candidateHandle.IsInvalid() ||
							candidateHandle == handle) {
							continue;
						}
						try {
							Agent& candidate =
								candidateHandle.GetAgentReference();
							int candidateRoom = -1;
							if (!candidate.GetRoomID(candidateRoom) ||
								candidateRoom != roomId) {
								continue;
							}
							sameRoomCount++;
							const Vector2D candidatePosition =
								candidate.GetPosition();
							const float dx =
								candidatePosition.x - position.x;
							const float dy =
								candidatePosition.y - position.y;
							Classifier classifier =
								candidate.GetClassifier();
							std::string gallery;
							try {
								gallery = candidate.GetGalleryName();
							} catch (...) {}
							nlohmann::json candidateJson;
							candidateJson["agentId"] =
								candidate.GetUniqueID();
							candidateJson["family"] =
								classifier.Family();
							candidateJson["genus"] =
								classifier.Genus();
							candidateJson["species"] =
								classifier.Species();
							candidateJson["gallery"] = gallery;
							candidateJson["isCreature"] =
								candidateHandle.IsCreature();
							candidateJson["posX"] =
								candidatePosition.x;
							candidateJson["posY"] =
								candidatePosition.y;
							candidateJson["distanceSquared"] =
								dx * dx + dy * dy;
							nearby.push_back({
								dx * dx + dy * dy,
								candidateJson
							});
						} catch (...) {
							// A malformed neighbour must not discard the
							// subject's otherwise coherent observation.
						}
					}
				}
				std::sort(nearby.begin(), nearby.end(),
					[](const NearbyAgent& left, const NearbyAgent& right) {
						return left.distanceSquared <
							right.distanceSquared;
					});
				nlohmann::json nearbyJson = nlohmann::json::array();
				const size_t nearbyLimit =
					std::min(static_cast<size_t>(5), nearby.size());
				for (size_t index = 0; index < nearbyLimit; ++index)
					nearbyJson.push_back(nearby[index].value);
				// The smell lobe reads the room at the down foot, which can
				// differ from the room at the agent's position.
				int caRoomId = -1;
				theApp.GetWorld().GetMap().GetRoomIDForPoint(
					creature.GetDownFootPosition(), caRoomId);
				nlohmann::json caChannels = nlohmann::json::array();
				if (caRoomId >= 0) {
					for (int caIndex = 0;
						caIndex < CA_PROPERTY_COUNT; ++caIndex) {
						float caValue = 0.0f;
						if (!theApp.GetWorld().GetMap().GetRoomProperty(
							caRoomId, caIndex, caValue)) {
							continue;
						}
						const int categoryId =
							theAgentManager.GetCategoryIdFromSmellId(
								caIndex);
						nlohmann::json caChannel;
						caChannel["id"] = caIndex;
						caChannel["categoryId"] =
							categoryId >= 0
								? nlohmann::json(categoryId)
								: nlohmann::json(nullptr);
						caChannel["label"] =
							categoryId >= 0 &&
								categoryId <
									SensoryFaculty::GetNumCategories()
								? SensoryFaculty::GetCategoryName(
									categoryId)
								: "CA smell " +
									std::to_string(caIndex);
						caChannel["value"] = caValue;
						caChannels.push_back(caChannel);
					}
				}
				observation["environment"] = {
					{"roomId", roomId >= 0 ? nlohmann::json(roomId) :
						nlohmann::json(nullptr)},
					{"metaRoomId",
						metaRoomId >= 0 ? nlohmann::json(metaRoomId) :
							nlohmann::json(nullptr)},
					{"nearbySameRoomCount", sameRoomCount},
					{"nearby", nearbyJson},
					{"nearbyTruncated",
						static_cast<size_t>(sameRoomCount) > nearbyLimit},
					{"caRoomId",
						caRoomId >= 0 ? nlohmann::json(caRoomId) :
							nlohmann::json(nullptr)},
					{"caSamplePoint", "down_foot"},
					{"caChannels", caChannels}
				};

				auto lobeSnapshot = [brain](const std::string& token) {
					nlohmann::json result;
					result["lobe"] = token;
					result["available"] = false;
					result["winnerId"] = nullptr;
					result["winnerLabel"] = nullptr;
					result["winnerActivity"] = nullptr;
					result["candidates"] = nlohmann::json::array();
					if (!brain) return result;

					Lobe* lobe = nullptr;
					for (int index = 0;
						index < brain->GetLobeCount(); ++index) {
						Lobe* candidate = brain->GetLobe(index);
						if (candidate &&
							std::string(candidate->GetName()) == token) {
							lobe = candidate;
							break;
						}
					}
					if (!lobe) return result;

					result["available"] = true;
					const int winner = lobe->GetWhichNeuronWon();
					std::vector<std::pair<float, int> > activities;
					for (int index = 0;
						index < lobe->GetNoOfNeurons(); ++index) {
						Neuron* neuron = lobe->GetNeuron(index);
						if (!neuron) continue;
						activities.push_back(std::make_pair(
							neuron->states[STATE_VAR],
							neuron->idInList));
					}
					std::sort(activities.begin(), activities.end(),
						[](const std::pair<float, int>& left,
							const std::pair<float, int>& right) {
							if (left.first != right.first)
								return left.first > right.first;
							return left.second < right.second;
						});
					if (lobe->HasWinningNeuron() && winner >= 0 &&
						winner < lobe->GetNoOfNeurons()) {
						Neuron* winnerNeuron = lobe->GetNeuron(winner);
						result["winnerId"] = winner;
						result["winnerLabel"] =
							BrainNeuronSemanticLabel(token, winner);
						result["winnerActivity"] = winnerNeuron
							? nlohmann::json(
								winnerNeuron->states[STATE_VAR])
							: nlohmann::json(nullptr);
					}
					const size_t candidateLimit =
						std::min(static_cast<size_t>(2),
							activities.size());
					for (size_t index = 0;
						index < candidateLimit; ++index) {
						nlohmann::json candidate;
						candidate["id"] = activities[index].second;
						candidate["label"] =
							BrainNeuronSemanticLabel(
								token, activities[index].second);
						candidate["activity"] = activities[index].first;
						result["candidates"].push_back(candidate);
					}
					return result;
				};

				nlohmann::json perception;
				perception["channels"] = nlohmann::json::array();
				perception["channels"].push_back(
					lobeSnapshot("visn"));
				perception["channels"].push_back(
					lobeSnapshot("smel"));
				perception["channels"].push_back(
					lobeSnapshot("noun"));
				observation["perception"] = perception;

				nlohmann::json pressure;
				pressure["drives"] = nlohmann::json::array();
				for (int drive = 0; drive < NUMDRIVES; ++drive) {
					nlohmann::json driveJson;
					driveJson["id"] = drive;
					driveJson["label"] =
						BrainNeuronSemanticLabel("driv", drive);
					driveJson["value"] =
						creature.GetDriveLevel(drive);
					pressure["drives"].push_back(driveJson);
				}
				const int highestDrive = creature.GetHighestDrive();
				pressure["highestDriveId"] = highestDrive;
				pressure["highestDriveLabel"] =
					BrainNeuronSemanticLabel("driv", highestDrive);
				pressure["highestDriveValue"] =
					highestDrive >= 0 && highestDrive < NUMDRIVES
						? nlohmann::json(
							creature.GetDriveLevel(highestDrive))
						: nlohmann::json(nullptr);
				observation["pressure"] = pressure;

				nlohmann::json attention =
					lobeSnapshot("attn");
				attention["motorAttentionId"] = motor
					? nlohmann::json(
						motor->GetCurrentAttentionId())
					: nlohmann::json(nullptr);
				AgentHandle it = creature.GetItAgent();
				if (it.IsValid()) {
					Agent& target = it.GetAgentReference();
					Classifier targetClassifier =
						target.GetClassifier();
					nlohmann::json targetJson;
					targetJson["agentId"] = target.GetUniqueID();
					targetJson["family"] = targetClassifier.Family();
					targetJson["genus"] = targetClassifier.Genus();
					targetJson["species"] = targetClassifier.Species();
					std::string targetGallery;
					try {
						targetGallery = target.GetGalleryName();
					} catch (...) {}
					targetJson["gallery"] = targetGallery;
					targetJson["isCreature"] = it.IsCreature();
					const Vector2D targetPosition = target.GetPosition();
					int targetRoomId = -1;
					int targetMetaRoomId = -1;
					const bool hasTargetRoom =
						theApp.GetWorld().GetMap().GetRoomIDForPoint(
						targetPosition, targetRoomId);
					const bool hasTargetMetaRoom =
						theApp.GetWorld().GetMap().GetMetaRoomIDForPoint(
						targetPosition, targetMetaRoomId);
					targetJson["posX"] = targetPosition.x;
					targetJson["posY"] = targetPosition.y;
					targetJson["roomId"] = hasTargetRoom &&
						targetRoomId >= 0
						? nlohmann::json(targetRoomId)
						: nlohmann::json(nullptr);
					targetJson["metaRoomId"] = hasTargetMetaRoom &&
						targetMetaRoomId >= 0
						? nlohmann::json(targetMetaRoomId)
						: nlohmann::json(nullptr);
					const int targetCategory =
						SensoryFaculty::GetCategoryIdOfAgent(it);
					targetJson["categoryId"] = targetCategory;
					targetJson["categoryLabel"] =
						targetCategory >= 0 &&
							targetCategory <
								SensoryFaculty::GetNumCategories()
							? SensoryFaculty::GetCategoryName(
								targetCategory)
							: "";
					attention["currentTarget"] = targetJson;
				} else {
					attention["currentTarget"] = nullptr;
				}
				attention["introspective"] =
					creature.IsIntrospective();
				observation["attention"] = attention;

				nlohmann::json selection =
					lobeSnapshot("decn");
				selection["currentActionOffset"] = motor
					? nlohmann::json(
						motor->GetCurrentDecisionId())
					: nlohmann::json(nullptr);
				selection["currentInvoluntaryAction"] = motor
					? nlohmann::json(
						motor->GetCurrentInvoluntaryAction())
					: nlohmann::json(nullptr);
				observation["selection"] = selection;

				CAOSMachine& vm = agent.GetVirtualMachine();
				nlohmann::json action;
				action["running"] = vm.IsRunning();
				action["state"] = vm.IsAtBreakpoint()
					? "paused"
					: vm.IsBlocking() ? "blocking"
					: vm.IsRunning() ? "running" : "idle";
				action["ip"] = vm.GetIP();
				action["blockingCommand"] = nullptr;
				action["blockReason"] = nullptr;
				action["script"] = nullptr;
				action["sourceStatement"] = nullptr;
				if (vm.IsBlocking()) {
					const std::string command =
						vm.GetCurrentCommandName();
					action["blockingCommand"] = command;
					std::string normalized = command;
					std::transform(
						normalized.begin(), normalized.end(),
						normalized.begin(),
						[](unsigned char value) {
							return static_cast<char>(
								std::toupper(value));
						});
					action["blockReason"] =
						normalized == "WAIT"
							? "WAIT tick delay"
							: normalized == "OVER"
								? "OVER animation completion"
								: "Reason unavailable";
				}
				MacroScript* macro = vm.GetScript();
				if (macro && vm.IsRunning()) {
					Classifier scriptClassifier;
					macro->GetClassifier(scriptClassifier);
					action["script"] = {
						{"family", scriptClassifier.Family()},
						{"genus", scriptClassifier.Genus()},
						{"species", scriptClassifier.Species()},
						{"event", scriptClassifier.Event()}
					};
					DebugInfo* debugInfo = macro->GetDebugInfo();
					if (debugInfo) {
						std::string source;
						debugInfo->GetSourceCode(source);
						action["sourceStatement"] =
							DebugServerLogic::ExtractSourceStatement(
								source,
								debugInfo->MapAddressToSource(
									vm.GetIP()));
					}
				}
				AgentHandle targ = vm.GetTarg();
				AgentHandle scriptIt = vm.GetIT();
				action["targ"] = targ.IsValid()
					? nlohmann::json(
						targ.GetAgentReference().GetUniqueID())
					: nlohmann::json(nullptr);
				action["itAtScriptStart"] = scriptIt.IsValid()
					? nlohmann::json(
						scriptIt.GetAgentReference().GetUniqueID())
					: nlohmann::json(nullptr);
				observation["action"] = action;

				return observation.dump(
					-1, ' ', false,
					nlohmann::json::error_handler_t::replace);
			} catch (const std::exception& error) {
				observation["error"] = error.what();
				return observation.dump();
			} catch (...) {
				observation["error"] =
					"Failed to sample creature observation";
				return observation.dump();
			}
		};

		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(5)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"error\":\"Timeout\"}", "application/json");
		}
	});

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
static const int NUM_OPCODE_NAMES = sizeof(OPCODE_NAMES) / sizeof(OPCODE_NAMES[0]);
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

		std::string opName = (opCode < NUM_OPCODE_NAMES) ? OPCODE_NAMES[opCode] : "???";
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
			auto readU8 = [&file]() -> uint8_t {
				uint8_t c = 0;
				if (!file.read((char*)&c, 1))
					throw std::runtime_error(
						"Malformed or truncated genetics file");
				return c;
			};
			auto readU16BE = [&readU8]() -> uint16_t { uint8_t hi = readU8(), lo = readU8(); return (hi << 8) | lo; };
			auto readFloat8 = [&readU8]() -> float { return ((int)readU8() - 128) / 128.0f; };
			char magic[4] = {0};
			if (!file.read(magic, 4) ||
				strncmp(magic, "dna3", 4) != 0)
				return "{\"error\":\"Invalid or truncated genetics file\"}";
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
					uint8_t initRule[48] = {0}; file.read((char*)initRule, 48); uint8_t updateRule[48] = {0}; file.read((char*)updateRule, 48);
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
					uint8_t initRule[48] = {0}; file.read((char*)initRule, 48); uint8_t updateRule[48] = {0}; file.read((char*)updateRule, 48);
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
				if (!file)
					throw std::runtime_error(
						"Malformed or truncated genetics file");
				json << "}}";
			}
			json << "],\"geneCount\":" << geneCount << "}";
			return json.str();
		};

	myImpl->svr.Get("/api/genetics/files", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::vector<std::string> names;
			std::string genDir = theApp.GetDirectory(GENETICS_DIR);
			if (DIR* dir = opendir(genDir.c_str())) {
				while (struct dirent* ent = readdir(dir)) {
					std::string name = ent->d_name;
					if (name.length() > 4 && name.substr(name.length() - 4) == ".gen") {
						std::string moniker = name.substr(0, name.length() - 4);
						names.push_back(moniker);
					}
				}
				closedir(dir);
			}
			std::sort(names.begin(), names.end());
			nlohmann::json files = nlohmann::json::array();
			for (size_t index = 0; index < names.size(); ++index) {
				const std::string& name = names[index];
				const bool isCore =
					LocalFileExists(genDir + name + ".gno");
				const nlohmann::json metadata =
					ReadGenomeExperimentMetadata(genDir, name);
				const bool isExperimental =
					IsGenomeExperimentMetadataFor(
						metadata,
						name,
						FileFingerprint(genDir + name + ".gen"));
				nlohmann::json file;
				file["name"] = name;
				file["isCore"] = isCore;
				file["isExperimental"] = isExperimental;
				file["metadataStatus"] =
					LocalFileExists(
						GenomeExperimentMetadataPath(
							genDir, name))
					? (isExperimental
						? "verified" : "invalid_or_stale")
					: "absent";
				file["origin"] = !isExperimental
					? (isCore ? "protected_original" : "original")
					: metadata.value("origin", "experimental");
				file["sourceName"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"sourceName", nlohmann::json(nullptr));
				files.push_back(file);
			}
			return files.dump();
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Post("/api/genetics/copy",
		[this](const httplib::Request& req, httplib::Response& res) {
		const std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-copy");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			nlohmann::json result;
			result["schemaVersion"] = 1;
			result["ok"] = false;
			result["correlationId"] = correlationId;
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				const std::string sourceName =
					request.value("sourceName", "");
				const std::string derivedName =
					request.value("derivedName", "");
				const std::string sourceNameError =
					DebugServerLogic::ValidateGenomeFileName(
						sourceName);
				const std::string derivedNameError =
					DebugServerLogic::ValidateGenomeFileName(
						derivedName);
				if (!sourceNameError.empty() ||
					!derivedNameError.empty()) {
					result["error"] = !sourceNameError.empty()
						? "Invalid source genome name: " +
							sourceNameError
						: "Invalid experimental copy name: " +
							derivedNameError;
					return result.dump();
				}
				const std::string genDir =
					theApp.GetDirectory(GENETICS_DIR);
				const std::string sourcePath =
					genDir + sourceName + ".gen";
				const std::string derivedPath =
					genDir + derivedName + ".gen";
				const bool destinationExists =
					LocalFileExists(derivedPath) ||
					LocalFileExists(
						genDir + derivedName + ".gno") ||
					LocalFileExists(
						GenomeExperimentMetadataPath(
							genDir, derivedName));
				const std::string validation =
					DebugServerLogic::ValidateGenomeCopyRequest(
						sourceName,
						derivedName,
						LocalFileExists(sourcePath),
						destinationExists);
				if (!validation.empty()) {
					result["error"] = validation;
					return result.dump();
				}
				const std::string sourceChecksum =
					FileFingerprint(sourcePath);
				if (sourceChecksum.empty()) {
					result["error"] =
						"Could not fingerprint the source genome";
					return result.dump();
				}
				if (!CopyFileWithoutOverwrite(
					sourcePath, derivedPath)) {
					result["error"] =
						"Could not create the experimental copy";
					return result.dump();
				}
				const std::string derivedChecksum =
					FileFingerprint(derivedPath);
				if (derivedChecksum != sourceChecksum ||
					FileFingerprint(sourcePath) != sourceChecksum) {
					unlink(derivedPath.c_str());
					result["error"] =
						"Source genome changed while the copy was being created";
					return result.dump();
				}
				nlohmann::json metadata =
					NewGenomeExperimentMetadata(
						"copy",
						derivedName,
						derivedChecksum,
						sourceName,
						sourceChecksum);
				if (sourceChecksum.empty() ||
					derivedChecksum.empty() ||
					!WriteGenomeExperimentMetadata(
						genDir, derivedName, metadata)) {
					unlink(derivedPath.c_str());
					result["error"] =
						"Could not record experimental copy provenance";
					return result.dump();
				}
				result["ok"] = true;
				result["status"] = "success";
				result["sourceName"] = sourceName;
				result["derivedName"] = derivedName;
				result["sourceChecksum"] = sourceChecksum;
				result["derivedChecksum"] = derivedChecksum;
				result["checksumAlgorithm"] = "FNV-1a-64";
				result["worldName"] =
					theApp.GetWorld().GetWorldName();
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				myImpl->PushApiRecord(
					"genome_copy",
					"Developer Tools created an experimental genome copy",
					correlationId);
				return result.dump();
			} catch (const std::exception& error) {
				result["error"] = error.what();
				return result.dump();
			}
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(5)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"ok\":false,\"error\":\"Timeout\"}",
				"application/json");
		}
	});

	myImpl->svr.Post(R"(/api/genetics/delete/([^/]+))", [this](const httplib::Request& req, httplib::Response& res) {
		std::string moniker = req.matches[1];
		std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-delete");
		auto* item = new WorkItem();
		item->work = [
			moniker,
			body,
			correlationId,
			this]() -> std::string {
			bool confirmed = false;
			std::string expectedChecksum;
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				confirmed = request.value("confirmed", false);
				expectedChecksum =
					request.value("expectedChecksum", "");
			} catch (...) {}
			const std::string nameError =
				DebugServerLogic::ValidateGenomeFileName(moniker);
			if (!nameError.empty())
				return "{\"error\":\"" +
					JsonEscape(nameError) + "\"}";
			std::string genDir = theApp.GetDirectory(GENETICS_DIR);
			std::string genPath = genDir + moniker + ".gen";
			std::string gnoPath = genDir + moniker + ".gno";
			if (FILE* f = fopen(gnoPath.c_str(), "r")) {
				fclose(f);
				return "{\"error\":\"Cannot delete core genome (has .gno file)\"}";
			}
			const nlohmann::json metadata =
				ReadGenomeExperimentMetadata(genDir, moniker);
			const std::string currentChecksum =
				FileFingerprint(genPath);
			if (!IsGenomeExperimentMetadataFor(
				metadata, moniker, currentChecksum))
				return "{\"error\":\"Ordinary deletion is restricted to experimental copies\"}";
			if (!confirmed)
				return "{\"error\":\"Explicit deletion confirmation is required\"}";
			if (expectedChecksum.empty() ||
				expectedChecksum != currentChecksum)
				return "{\"error\":\"Genome changed on disk; reload before deleting\"}";
			if (unlink(genPath.c_str()) == 0) {
				unlink(GenomeExperimentMetadataPath(
					genDir, moniker).c_str());
				myImpl->PushApiRecord(
					"genome_delete",
					"Developer Tools deleted an experimental genome copy",
					correlationId);
				nlohmann::json result;
				result["ok"] = true;
				result["status"] = "success";
				result["deletedName"] = moniker;
				result["deletedChecksum"] = currentChecksum;
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				result["correlationId"] = correlationId;
				return result.dump();
			}
			return "{\"error\":\"File could not be deleted\"}";
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Post("/api/genetics/rename", [this](const httplib::Request& req, httplib::Response& res) {
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-rename");
		std::string oldName;
		std::string newName;
		std::string expectedChecksum;
		bool confirmed = false;
		try {
			auto json = nlohmann::json::parse(req.body);
			oldName = json.value("oldName", "");
			newName = json.value("newName", "");
			expectedChecksum = json.value("expectedChecksum", "");
			confirmed = json.value("confirmed", false);
		} catch (...) {}

		const std::string oldNameError =
			DebugServerLogic::ValidateGenomeFileName(oldName);
		const std::string newNameError =
			DebugServerLogic::ValidateGenomeExperimentName(
				newName);
		if (!oldNameError.empty() || !newNameError.empty()) {
			res.set_content(
				"{\"error\":\"" + JsonEscape(
					!oldNameError.empty()
						? oldNameError : newNameError) + "\"}",
				"application/json");
			return;
		}

		auto* item = new WorkItem();
		item->work = [
			oldName,
			newName,
			expectedChecksum,
			confirmed,
			correlationId,
			this]() -> std::string {
			std::string genDir = theApp.GetDirectory(GENETICS_DIR);
			std::string oldGenPath = genDir + oldName + ".gen";
			std::string oldGnoPath = genDir + oldName + ".gno";
			std::string newGenPath = genDir + newName + ".gen";
			std::string oldMetadataPath =
				GenomeExperimentMetadataPath(genDir, oldName);
			std::string newMetadataPath =
				GenomeExperimentMetadataPath(genDir, newName);

			if (FILE* f = fopen(oldGnoPath.c_str(), "r")) {
				fclose(f);
				return "{\"error\":\"Cannot rename core genome (has .gno file)\"}";
			}
			nlohmann::json metadata =
				ReadGenomeExperimentMetadata(genDir, oldName);
			const std::string currentChecksum =
				FileFingerprint(oldGenPath);
			if (!IsGenomeExperimentMetadataFor(
				metadata, oldName, currentChecksum))
				return "{\"error\":\"Ordinary rename is restricted to experimental copies\"}";
			if (!confirmed)
				return "{\"error\":\"Explicit rename confirmation is required\"}";
			if (expectedChecksum.empty() ||
				expectedChecksum != currentChecksum)
				return "{\"error\":\"Genome changed on disk; reload before renaming\"}";
			if (LocalFileExists(newGenPath) ||
				LocalFileExists(genDir + newName + ".gno") ||
				LocalFileExists(newMetadataPath)) {
				return "{\"error\":\"A genome with the new name already exists\"}";
			}
			if (rename(oldGenPath.c_str(), newGenPath.c_str()) == 0) {
				metadata["derivedName"] = newName;
				metadata["updatedWorldTick"] =
					theApp.GetWorld().GetWorldTick();
				if (WriteGenomeExperimentMetadata(
					genDir, newName, metadata)) {
					unlink(oldMetadataPath.c_str());
					myImpl->PushApiRecord(
						"genome_rename",
						"Developer Tools renamed an experimental genome copy",
						correlationId);
					nlohmann::json result;
					result["ok"] = true;
					result["status"] = "success";
					result["oldName"] = oldName;
					result["moniker"] = newName;
					result["checksum"] = currentChecksum;
					result["worldTick"] =
						theApp.GetWorld().GetWorldTick();
					result["correlationId"] =
						correlationId;
					return result.dump();
				}
				rename(newGenPath.c_str(), oldGenPath.c_str());
				return "{\"error\":\"Could not update genome provenance\"}";
			}
			return "{\"error\":\"File could not be renamed\"}";
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Get(R"(/api/genetics/file/([^/]+))", [this, parseGenomeFileToJson](const httplib::Request& req, httplib::Response& res) {
		std::string moniker = req.matches[1];
		auto* item = new WorkItem();
		item->work = [moniker, parseGenomeFileToJson]() -> std::string {
			const std::string nameError =
				DebugServerLogic::ValidateGenomeFileName(moniker);
			if (!nameError.empty())
				return "{\"error\":\"" +
					JsonEscape(nameError) + "\"}";
			const std::string genDir =
				theApp.GetDirectory(GENETICS_DIR);
			const std::string genPath =
				genDir + moniker + ".gen";
			try {
				nlohmann::json genome =
					nlohmann::json::parse(
						parseGenomeFileToJson(genPath, moniker));
				if (genome.contains("error"))
					return genome.dump();
				const nlohmann::json metadata =
					ReadGenomeExperimentMetadata(genDir, moniker);
				const std::string checksum =
					FileFingerprint(genPath);
				const bool isExperimental =
					IsGenomeExperimentMetadataFor(
						metadata, moniker, checksum);
				nlohmann::json identity;
				identity["currentName"] = moniker;
				identity["format"] = "dna3";
				identity["checksum"] = checksum;
				identity["checksumAlgorithm"] = "FNV-1a-64";
				identity["isProtected"] =
					LocalFileExists(genDir + moniker + ".gno");
				identity["isExperimental"] =
					isExperimental;
				identity["metadataStatus"] =
					LocalFileExists(
						GenomeExperimentMetadataPath(
							genDir, moniker))
					? (isExperimental
						? "verified" : "invalid_or_stale")
					: "absent";
				identity["origin"] = !isExperimental
					? (identity["isProtected"].get<bool>()
						? "protected_original" : "original")
					: metadata.value("origin", "experimental");
				identity["sourceName"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"sourceName", nlohmann::json(nullptr));
				identity["sourceChecksum"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"sourceChecksum", nlohmann::json(nullptr));
				identity["secondParentName"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"secondParentName", nlohmann::json(nullptr));
				identity["secondParentChecksum"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"secondParentChecksum", nlohmann::json(nullptr));
				identity["createdWorld"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"createdWorld", nlohmann::json(nullptr));
				identity["createdWorldTick"] = !isExperimental
					? nlohmann::json(nullptr)
					: metadata.value(
						"createdWorldTick", nlohmann::json(nullptr));
				genome["identity"] = identity;
				return genome.dump();
			} catch (const std::exception& error) {
				return "{\"error\":\"" +
					JsonEscape(error.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Post("/api/genetics/crossover", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-crossover");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				std::string parentA = j.value("parentA", "");
				std::string parentB = j.value("parentB", "");
				std::string childName = j.value("child", "");
				const std::string parentAError =
					DebugServerLogic::ValidateGenomeFileName(parentA);
				const std::string parentBError =
					DebugServerLogic::ValidateGenomeFileName(parentB);
				const std::string childError =
					DebugServerLogic::ValidateGenomeExperimentName(
						childName);
				if (!parentAError.empty() ||
					!parentBError.empty() ||
					!childError.empty()) {
					return "{\"error\":\"" + JsonEscape(
						!childError.empty() ? childError :
							(!parentAError.empty()
								? parentAError : parentBError)) + "\"}";
				}

				// Resolve parent file paths
				const std::string genDir =
					theApp.GetDirectory(GENETICS_DIR);
				std::string mumPath = genDir + parentA + ".gen";
				std::string dadPath = genDir + parentB + ".gen";
				std::string childPath =
					genDir + childName + ".gen";
				if (!LocalFileExists(mumPath) ||
					!LocalFileExists(dadPath))
					return "{\"error\":\"A parent genome does not exist\"}";
				if (LocalFileExists(childPath) ||
					LocalFileExists(
						genDir + childName + ".gno") ||
					LocalFileExists(
						GenomeExperimentMetadataPath(
							genDir, childName)))
					return "{\"error\":\"Child genome name already exists\"}";
				const std::string mumChecksum =
					FileFingerprint(mumPath);
				const std::string dadChecksum =
					FileFingerprint(dadPath);
				if (mumChecksum.empty() || dadChecksum.empty())
					return "{\"error\":\"Could not fingerprint both parent genomes\"}";

				// Read parent genomes directly (no GenomeStore — avoids destructor
				// assertion that expects ClearAllSlots before destruction)
				Genome mumGenome;
				mumGenome.ReadFromFile(mumPath, 0, 0, 0, "");
				Genome dadGenome;
				dadGenome.ReadFromFile(dadPath, 0, 0, 0, "");

				// Perform crossover
				Genome childGenome;
				childGenome.Cross("", &mumGenome, &dadGenome, 200, 200, 200, 200);

				std::string childMoniker = childName;
				childGenome.SetMoniker(childMoniker);

				// Serialize under a private name, then install without
				// overwriting a destination that appeared after validation.
				const std::string temporaryPath =
					genDir + childName + "_cross_tmp_" +
					StableTextFingerprint(
						correlationId).substr(0, 8) + ".gen";
				if (LocalFileExists(temporaryPath))
					return "{\"error\":\"Crossover staging name is unavailable\"}";
				childGenome.WriteToFile(temporaryPath);
				if (!InstallFileWithoutOverwrite(
					temporaryPath, childPath)) {
					unlink(temporaryPath.c_str());
					return "{\"error\":\"Child genome name already exists\"}";
				}
				const std::string childChecksum =
					FileFingerprint(childPath);
				if (FileFingerprint(mumPath) != mumChecksum ||
					FileFingerprint(dadPath) != dadChecksum) {
					unlink(childPath.c_str());
					return "{\"error\":\"A parent genome changed during crossover\"}";
				}
				nlohmann::json metadata =
					NewGenomeExperimentMetadata(
						"crossover",
						childMoniker,
						childChecksum,
						parentA,
						mumChecksum);
				metadata["secondParentName"] = parentB;
				metadata["secondParentChecksum"] = dadChecksum;
				if (childChecksum.empty() ||
					!WriteGenomeExperimentMetadata(
						genDir, childMoniker, metadata)) {
					unlink(childPath.c_str());
					return "{\"error\":\"Could not record crossover provenance\"}";
				}
				myImpl->PushApiRecord(
					"genome_crossover",
					"Developer Tools created a derived crossover genome",
					correlationId);
				nlohmann::json result;
				result["ok"] = true;
				result["status"] = "success";
				result["child"] = childMoniker;
				result["childChecksum"] = childChecksum;
				result["parentA"] = parentA;
				result["parentAChecksum"] = mumChecksum;
				result["parentB"] = parentB;
				result["parentBChecksum"] = dadChecksum;
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				result["correlationId"] = correlationId;
				return result.dump();
			} catch (std::exception& e) {
				return std::string("{\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

		auto writeGenome = [](const nlohmann::json& j, const std::string& moniker) -> bool {
			std::string genPath = theApp.GetDirectory(GENETICS_DIR) + moniker + ".gen";
			std::ofstream file(genPath, std::ios::binary);
			if (!file.is_open()) return false;
			
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
					if (g.contains("flags")) {
						flags = g.value("flagsRaw", 0) &
							static_cast<uint8_t>(~(1 | 2 | 4 | 8 | 16 | 128));
						auto& f = g["flags"];
						if (f.value("mutable", false)) flags |= 1;
						if (f.value("dupable", false)) flags |= 2;
						if (f.value("cutable", false)) flags |= 4;
						if (f.value("maleOnly", false)) flags |= 8;
						if (f.value("femaleOnly", false)) flags |= 16;
						if (f.value("dormant", false)) flags |= 128;
					} else if (g.contains("flagsRaw")) {
						flags = g["flagsRaw"];
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
			return static_cast<bool>(file);
		};

	myImpl->svr.Post("/api/genetics/save", [this, writeGenome](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-create");
		auto* item = new WorkItem();
		item->work = [
			body,
			writeGenome,
			correlationId,
			this]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				std::string inputMoniker = j.value("moniker", "CustomGenome");
				std::string moniker = j.value("saveName", inputMoniker);
				const std::string payloadError =
					ValidateGenomeWritePayload(j);
				if (!payloadError.empty())
					return "{\"error\":\"" +
						JsonEscape(payloadError) + "\"}";
				const std::string nameError =
					DebugServerLogic::ValidateGenomeExperimentName(
						moniker);
				if (!nameError.empty())
					return "{\"error\":\"" +
						JsonEscape(nameError) + "\"}";
				const std::string genDir =
					theApp.GetDirectory(GENETICS_DIR);
				const std::string genPath =
					genDir + moniker + ".gen";
				if (LocalFileExists(genPath) ||
					LocalFileExists(
						genDir + moniker + ".gno") ||
					LocalFileExists(
						GenomeExperimentMetadataPath(
							genDir, moniker)))
					return "{\"error\":\"Genome name already exists; overwrite is not available\"}";
				const std::string temporaryName =
					moniker + "_create_tmp_" +
					StableTextFingerprint(
						correlationId).substr(0, 8);
				const std::string temporaryPath =
					genDir + temporaryName + ".gen";
				if (!writeGenome(j, temporaryName)) {
					unlink(temporaryPath.c_str());
					return "{\"error\": \"Could not write gen file\"}";
				}
				if (!InstallFileWithoutOverwrite(
					temporaryPath, genPath)) {
					unlink(temporaryPath.c_str());
					return "{\"error\":\"Could not create genome without overwriting an existing file\"}";
				}
				const std::string checksum =
					FileFingerprint(genPath);
				nlohmann::json metadata =
					NewGenomeExperimentMetadata(
						j.value("draftOrigin", "new"),
						moniker,
						checksum,
						"",
						"");
				if (checksum.empty() ||
					!WriteGenomeExperimentMetadata(
						genDir, moniker, metadata)) {
					unlink(genPath.c_str());
					return "{\"error\":\"Could not record genome provenance\"}";
				}
				myImpl->PushApiRecord(
					"genome_create",
					"Developer Tools saved a new experimental genome",
					correlationId);
				nlohmann::json result;
				result["ok"] = true;
				result["status"] = "success";
				result["moniker"] = moniker;
				result["checksum"] = checksum;
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				result["correlationId"] = correlationId;
				return result.dump();
			} catch (std::exception& e) {
				return std::string("{\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout waiting for Engine thread\"}", "application/json");
		}
	});

	myImpl->svr.Post(
		"/api/genetics/save-experiment",
		[this, writeGenome](
			const httplib::Request& req,
			httplib::Response& res) {
		const std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-save");
		auto* item = new WorkItem();
		item->work = [
			body,
			writeGenome,
			correlationId,
			this]() -> std::string {
			nlohmann::json result;
			result["schemaVersion"] = 1;
			result["ok"] = false;
			result["correlationId"] = correlationId;
			try {
				nlohmann::json genome =
					nlohmann::json::parse(body);
				const std::string derivedName =
					genome.value("saveName",
						genome.value("moniker", ""));
				const std::string expectedChecksum =
					genome.value("expectedChecksum", "");
				const std::string payloadError =
					ValidateGenomeWritePayload(genome);
				if (!payloadError.empty()) {
					result["error"] = payloadError;
					return result.dump();
				}
				const std::string nameError =
					DebugServerLogic::ValidateGenomeExperimentName(
						derivedName);
				if (!nameError.empty()) {
					result["error"] = nameError;
					return result.dump();
				}
				const std::string genDir =
					theApp.GetDirectory(GENETICS_DIR);
				const std::string genPath =
					genDir + derivedName + ".gen";
				nlohmann::json metadata =
					ReadGenomeExperimentMetadata(
						genDir, derivedName);
				const std::string currentChecksum =
					FileFingerprint(genPath);
				// A .gno marks a protected original, whatever the metadata says.
				const bool isExperimental =
					!LocalFileExists(genDir + derivedName + ".gno") &&
					IsGenomeExperimentMetadataFor(
						metadata,
						derivedName,
						currentChecksum);
				bool sourceMatches = true;
				if (isExperimental &&
					metadata.contains("sourceName") &&
					metadata["sourceName"].is_string()) {
					const std::string sourceName =
						metadata["sourceName"].get<std::string>();
					const std::string sourceChecksum =
						metadata.value("sourceChecksum", "");
					sourceMatches =
						DebugServerLogic::ValidateGenomeFileName(
							sourceName).empty() &&
						!sourceChecksum.empty() &&
						FileFingerprint(
							genDir + sourceName + ".gen") ==
							sourceChecksum;
				}
				if (isExperimental &&
					metadata.contains("secondParentName") &&
					metadata["secondParentName"].is_string()) {
					const std::string secondParentName =
						metadata["secondParentName"]
							.get<std::string>();
					const std::string secondParentChecksum =
						metadata.value(
							"secondParentChecksum", "");
					sourceMatches = sourceMatches &&
						DebugServerLogic::ValidateGenomeFileName(
							secondParentName).empty() &&
						!secondParentChecksum.empty() &&
						FileFingerprint(
							genDir + secondParentName +
								".gen") ==
							secondParentChecksum;
				}
				const std::string validation =
					DebugServerLogic::ValidateGenomeExperimentSave(
						derivedName,
						isExperimental,
						expectedChecksum,
						currentChecksum,
						sourceMatches);
				if (!validation.empty()) {
					result["error"] = validation;
					return result.dump();
				}
				const std::string temporaryName =
					derivedName + "_save_tmp_" +
					StableTextFingerprint(
						correlationId).substr(0, 8);
				const std::string temporaryPath =
					genDir + temporaryName + ".gen";
				if (!writeGenome(genome, temporaryName)) {
					unlink(temporaryPath.c_str());
					result["error"] =
						"Could not serialize the experimental genome";
					return result.dump();
				}
				const std::string rollbackPath =
					genDir + derivedName + "_rollback_" +
					StableTextFingerprint(
						correlationId).substr(0, 8) +
					".gen.rollback";
				if (LocalFileExists(rollbackPath) ||
					rename(
						genPath.c_str(),
						rollbackPath.c_str()) != 0) {
					unlink(temporaryPath.c_str());
					result["error"] =
						"Could not stage the current experimental copy";
					return result.dump();
				}
				if (!InstallFileWithoutOverwrite(
					temporaryPath, genPath)) {
					unlink(temporaryPath.c_str());
					rename(
						rollbackPath.c_str(),
						genPath.c_str());
					result["error"] =
						"Could not install the experimental genome without overwriting another file";
					return result.dump();
				}
				const std::string updatedChecksum =
					FileFingerprint(genPath);
				metadata["derivedChecksum"] =
					updatedChecksum;
				metadata["updatedWorldTick"] =
					theApp.GetWorld().GetWorldTick();
				if (updatedChecksum.empty() ||
					!WriteGenomeExperimentMetadata(
						genDir, derivedName, metadata)) {
					unlink(genPath.c_str());
					const bool restored =
						rename(
							rollbackPath.c_str(),
							genPath.c_str()) == 0;
					result["error"] =
						restored
							? "Genome save rolled back because provenance metadata could not be updated"
							: "Genome save failed and the prior file could not be restored";
					result["outcome"] =
						restored
							? "rolled_back"
							: "rollback_failed";
					return result.dump();
				}
				unlink(rollbackPath.c_str());
				result["ok"] = true;
				result["status"] = "success";
				result["moniker"] = derivedName;
				result["previousChecksum"] =
					currentChecksum;
				result["checksum"] = updatedChecksum;
				result["sourceName"] =
					metadata.value(
						"sourceName", nlohmann::json(nullptr));
				result["sourceChecksum"] =
					metadata.value(
						"sourceChecksum", nlohmann::json(nullptr));
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				myImpl->PushApiRecord(
					"genome_save",
					"Developer Tools saved an experimental genome copy",
					correlationId);
				return result.dump();
			} catch (const std::exception& error) {
				result["error"] = error.what();
				return result.dump();
			}
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(5)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"ok\":false,\"error\":\"Timeout\"}",
				"application/json");
		}
	});

	myImpl->svr.Post("/api/genetics/inject", [this](const httplib::Request& req, httplib::Response& res) {
		const std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("genome-injection");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			std::string temporaryPath;
			nlohmann::json result;
			result["schemaVersion"] = 1;
			result["ok"] = false;
			result["correlationId"] = correlationId;
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				const std::string derivedName =
					request.value("derivedName", "");
				const std::string expectedChecksum =
					request.value("expectedChecksum", "");
				const std::string confirmedWorldName =
					request.value("confirmedWorldName", "");
				const std::string reviewId =
					request.value("reviewId", "");
				const std::string reviewedWorldSessionId =
					request.value("reviewedWorldSessionId", "");
				const long long reviewedWorldTick =
					request.value("reviewedWorldTick", -1LL);
				const std::string reviewedSourceName =
					request.contains("reviewedSourceName") &&
						request["reviewedSourceName"].is_string()
					? request["reviewedSourceName"].get<std::string>()
					: "";
				const std::string reviewedSourceChecksum =
					request.contains("reviewedSourceChecksum") &&
						request["reviewedSourceChecksum"].is_string()
					? request["reviewedSourceChecksum"].get<std::string>()
					: "";
				const std::string reviewedSecondParentName =
					request.contains("reviewedSecondParentName") &&
						request["reviewedSecondParentName"].is_string()
					? request["reviewedSecondParentName"]
						.get<std::string>()
					: "";
				const std::string reviewedSecondParentChecksum =
					request.contains("reviewedSecondParentChecksum") &&
						request["reviewedSecondParentChecksum"].is_string()
					? request["reviewedSecondParentChecksum"]
						.get<std::string>()
					: "";
				const bool disposableConfirmed =
					request.value("disposableConfirmed", false);
				const bool reviewConfirmed =
					request.value("reviewConfirmed", false);
				const std::string injectMode =
					request.value("injectMode", "creature");
				const int gender = request.value("gender", 0);
				result["derivedName"] = derivedName;
				result["injectMode"] = injectMode;
				result["requestedGender"] = gender;

				const std::string nameError =
					DebugServerLogic::ValidateGenomeExperimentName(
						derivedName);
				if (!nameError.empty()) {
					result["error"] = nameError;
					return result.dump();
				}
				const std::string worldName =
					theApp.GetWorld().GetWorldName();
				if (worldName == "Startup" ||
					confirmedWorldName.empty() ||
					confirmedWorldName != worldName) {
					result["error"] =
						"The active world differs from the reviewed injection world";
					return result.dump();
				}
				if (!disposableConfirmed || !reviewConfirmed) {
					result["error"] =
						"Disposable/branch and final review confirmation are required";
					return result.dump();
				}
				const std::string reviewError =
					DebugServerLogic::ValidateInjectionReview(
						reviewId,
						reviewedWorldSessionId,
						myImpl->WorldSessionId(),
						reviewedWorldTick,
						theApp.GetWorld().GetWorldTick(),
						myImpl->consumedInjectionReviews.count(reviewId) > 0);
				if (!reviewError.empty()) {
					result["error"] = reviewError;
					return result.dump();
				}
				if (injectMode != "creature" &&
					injectMode != "egg") {
					result["error"] =
						"Injection mode must be creature or egg";
					return result.dump();
				}
				if (gender < 0 || gender > 2) {
					result["error"] =
						"Gender must be random, male, or female";
					return result.dump();
				}
				const std::string genDir =
					theApp.GetDirectory(GENETICS_DIR);
				const std::string derivedPath =
					genDir + derivedName + ".gen";
				const nlohmann::json metadata =
					ReadGenomeExperimentMetadata(
						genDir, derivedName);
				const std::string actualChecksum =
					FileFingerprint(derivedPath);
				if (LocalFileExists(genDir + derivedName + ".gno") ||
					!IsGenomeExperimentMetadataFor(
						metadata, derivedName, actualChecksum)) {
					result["error"] =
						"Only a recorded experimental genome can be injected";
					return result.dump();
				}
				if (expectedChecksum.empty() ||
					actualChecksum != expectedChecksum ||
					metadata.value("derivedChecksum", "") !=
						actualChecksum) {
					result["error"] =
						"The saved genome checksum changed; reload and review again";
					return result.dump();
				}
				const std::string recordedSourceName =
					metadata.contains("sourceName") &&
						metadata["sourceName"].is_string()
					? metadata["sourceName"].get<std::string>()
					: "";
				const std::string recordedSourceChecksum =
					metadata.contains("sourceChecksum") &&
						metadata["sourceChecksum"].is_string()
					? metadata["sourceChecksum"].get<std::string>()
					: "";
				const std::string recordedSecondParentName =
					metadata.contains("secondParentName") &&
						metadata["secondParentName"].is_string()
					? metadata["secondParentName"]
						.get<std::string>()
					: "";
				const std::string recordedSecondParentChecksum =
					metadata.contains("secondParentChecksum") &&
						metadata["secondParentChecksum"].is_string()
					? metadata["secondParentChecksum"]
						.get<std::string>()
					: "";
				if (reviewedSourceName != recordedSourceName ||
					reviewedSourceChecksum !=
						recordedSourceChecksum ||
					reviewedSecondParentName !=
						recordedSecondParentName ||
					reviewedSecondParentChecksum !=
						recordedSecondParentChecksum) {
					result["error"] =
						"The reviewed source identity differs from recorded provenance";
					return result.dump();
				}
				if (!recordedSourceName.empty() &&
					(!DebugServerLogic::ValidateGenomeFileName(
						recordedSourceName).empty() ||
					recordedSourceChecksum.empty() ||
					FileFingerprint(
						genDir + recordedSourceName +
							".gen") !=
						recordedSourceChecksum)) {
					result["error"] =
						"The recorded source genome changed; create a fresh experimental copy";
					return result.dump();
				}
				if (!recordedSecondParentName.empty() &&
					(!DebugServerLogic::ValidateGenomeFileName(
						recordedSecondParentName).empty() ||
					recordedSecondParentChecksum.empty() ||
					FileFingerprint(
						genDir + recordedSecondParentName +
							".gen") !=
						recordedSecondParentChecksum)) {
					result["error"] =
						"The recorded second parent genome changed; create a fresh crossover";
					return result.dump();
				}

				// Spent before anything is created, so a failure partway
				// through cannot be retried into a second creature.
				myImpl->consumedInjectionReviews.insert(reviewId);

				const std::string injectionMoniker =
					"000-exp-" +
					StableTextFingerprint(correlationId).substr(0, 16);
				temporaryPath =
					genDir + injectionMoniker + ".gen";
				if (!CopyFileWithoutOverwrite(
					derivedPath, temporaryPath)) {
					result["error"] =
						"Could not prepare the reviewed genome for injection";
					return result.dump();
				}
				std::set<uint32> agentIdsBefore;
				AgentMap& agentMapBefore =
					AgentManager::GetAgentIDMap();
				for (AgentMapIterator agent =
					agentMapBefore.begin();
					agent != agentMapBefore.end(); ++agent) {
					agentIdsBefore.insert(agent->first);
				}

                std::string sexStr = std::to_string(gender);
                std::string cmd;
                if (injectMode == "egg") {
                    // For eggs, ov01 holds the sex: 1=male, 2=female
                    std::string ov01Line;
                    if (gender == 0) {
                        ov01Line = "setv ov01 rand 1 2 ";  // random gender
                    } else {
                        ov01Line = "setv ov01 " + sexStr + " ";  // explicit gender
                    }
                    cmd =
                        "new: simp 3 4 1 \"eggs\" 8 0 0 "
                        "gene load targ 1 \"" + injectionMoniker + "\" " +
                        ov01Line +
                        "elas 10 "
                        "fric rand 10 40 "
                        "attr 195 "
                        "bhvr 32 "
                        "aero 10 "
                        "accg 4 "
                        "perm 60 "
                        "pose 2 "
                        "mvsf 1000 8900 "
                        "velo rand -50 -30 0 "
                        "tick 900 "
						"seta va01 targ";
                } else {
                    cmd =
                        "new: simp 1 1 1 \"blnk\" 1 0 0 "
                        "gene load targ 1 \"" + injectionMoniker + "\" "
                        "setv va00 unid "            // remember temp agent ID
                        "new: crea 4 targ 1 " + sexStr + " 0 "  // hatch with selected sex
                        "born "                      // register with creature panel & history
                        "accg game \"c3_creature_accg\" " // gravity (default 5.0)
                        "attr game \"c3_creature_attr\" " // attributes (default 198)
                        "bhvr game \"c3_creature_bhvr\" " // click behaviors (default 15)
                        "perm game \"c3_creature_perm\" " // permeability (default 100)
                        "seta va01 targ "            // retain the new creature handle
                        "targ agnt va00 "            // re-select temp agent
                        "kill targ "                 // destroy temp agent
                        "targ va01 "                 // select creature
                        "mvsf 1000 8900";            // move to Docking Station Norn Meso (MR 11)
                }
                Orderiser o;
				std::unique_ptr<MacroScript> macro(
					o.OrderFromCAOS(cmd.c_str()));
				if (!macro) {
					unlink(temporaryPath.c_str());
					temporaryPath.clear();
					result["error"] =
						"Could not compile the reviewed injection operation";
					return result.dump();
				}
				CAOSMachine vm;
				vm.StartScriptExecuting(
					macro.get(),
					NULLHANDLE,
					NULLHANDLE,
					INTEGERZERO,
					INTEGERZERO);
				vm.UpdateVM(-1);
				AgentHandle injected = vm.GetTarg();
				AgentMap& agentMapAfter =
					AgentManager::GetAgentIDMap();
				for (AgentMapIterator agent =
					agentMapAfter.begin();
					agent != agentMapAfter.end(); ++agent) {
					if (agentIdsBefore.find(agent->first) !=
						agentIdsBefore.end())
						continue;
					AgentHandle candidate =
						theAgentManager.GetAgentFromID(
							agent->first);
					if (candidate.IsInvalid())
						continue;
					if ((injectMode == "creature" &&
							candidate.IsCreature()) ||
						(injectMode == "egg" &&
							!candidate.IsCreature())) {
						injected = candidate;
						break;
					}
				}
				unlink(temporaryPath.c_str());
				temporaryPath.clear();
				if (injected.IsInvalid()) {
					result["error"] =
						"Injection completed without a live result target";
					result["outcome"] = "unknown_result";
					return result.dump();
				}
				Agent& agent =
					injected.GetAgentReference();
				result["ok"] = true;
				result["status"] = "success";
				result["worldName"] = worldName;
				result["worldSessionId"] = myImpl->WorldSessionId();
				result["reviewId"] = reviewId;
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();
				result["systemTick"] =
					theApp.GetSystemTick();
				result["enginePaused"] = IsEnginePaused();
				result["derivedChecksum"] =
					actualChecksum;
				result["sourceName"] =
					recordedSourceName.empty()
						? nlohmann::json(nullptr)
						: nlohmann::json(recordedSourceName);
				result["sourceChecksum"] =
					recordedSourceChecksum.empty()
						? nlohmann::json(nullptr)
						: nlohmann::json(recordedSourceChecksum);
				result["secondParentName"] =
					recordedSecondParentName.empty()
						? nlohmann::json(nullptr)
						: nlohmann::json(recordedSecondParentName);
				result["secondParentChecksum"] =
					recordedSecondParentChecksum.empty()
						? nlohmann::json(nullptr)
						: nlohmann::json(recordedSecondParentChecksum);
				result["result"]["agentId"] =
					agent.GetUniqueID();
				result["result"]["isCreature"] =
					injected.IsCreature();
				result["result"]["genomeMoniker"] =
					agent.GetGenomeStore().MonikerAsString(
						injected.IsCreature() ? 0 : 1);
				result["result"]["engineeredFrom"] =
					derivedName;
				Classifier classifier =
					agent.GetClassifier();
				result["result"]["classifier"] = {
					{"family", classifier.Family()},
					{"genus", classifier.Genus()},
					{"species", classifier.Species()}
				};
				if (injected.IsCreature()) {
					Creature& creature =
						injected.GetCreatureReference();
					result["result"]["moniker"] =
						creature.GetMoniker();
				} else {
					result["result"]["moniker"] =
						nlohmann::json(nullptr);
				}
				myImpl->PushApiRecord(
					"genome_injection",
					"Developer Tools injected a reviewed experimental genome",
					correlationId,
					"info",
					injected);
				return result.dump();
			} catch (std::exception& e) {
				if (!temporaryPath.empty())
					unlink(temporaryPath.c_str());
				result["error"] = e.what();
				return result.dump();
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
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

	auto future = item->get_future();
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
				json << "{\"schemaVersion\":1"
					<< ",\"source\":\"GET /api/creature/:id/chemistry\""
					<< ",\"contextTiming\":\"engine_main_thread\""
					<< ",\"capturedAtWallTimeMs\":"
					<< WallTimeMilliseconds()
					<< ",\"worldName\":\""
					<< JsonEscape(theApp.GetWorld().GetWorldName()) << "\""
					<< ",\"worldTick\":"
					<< theApp.GetWorld().GetWorldTick()
					<< ",\"systemTick\":" << theApp.GetSystemTick()
					<< ",\"chemicals\":[";
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

		auto future = item->get_future();
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

	// ── POST /api/creature/:id/chemical-intervention ────────────────
	// Applies one reviewed concentration adjustment on the engine thread.
	// The caller must bind the request to a fresh world, creature, and sample.
	myImpl->svr.Post(
		R"(/api/creature/(\d+)/chemical-intervention)",
		[this](const httplib::Request& req, httplib::Response& res) {
			const int agentId = std::stoi(req.matches[1]);
			const std::string body = req.body;
			const std::string correlationId =
				myImpl->NextCorrelationId("chemical-intervention");
			auto* item = new WorkItem();
			item->work = [agentId, body, correlationId, this]() -> std::string {
				nlohmann::json result;
				result["schemaVersion"] = 1;
				result["ok"] = false;
				result["source"] =
					"POST /api/creature/:id/chemical-intervention";
				result["correlationId"] = correlationId;
				result["target"]["agentId"] = agentId;
				try {
					const nlohmann::json request =
						nlohmann::json::parse(body);
					const int chemicalId =
						request.value("chemicalId", -1);
					const std::string operation =
						request.value("operation", "");
					const float requestedValue =
						request.value("requestedValue", -2.0f);
					const std::string confirmedWorldName =
						request.value("confirmedWorldName", "");
					const std::string expectedMoniker =
						request.value("expectedMoniker", "");
					const long long sampleWorldTick =
						request.value("sampleWorldTick", -1LL);
					const float expectedConcentration =
						request.value("expectedConcentration", -2.0f);
					const bool extremeConfirmed =
						request.value("extremeConfirmed", false);
					const std::string pauseMode =
						request.value("pauseMode", "preserve");

					result["target"]["chemicalId"] = chemicalId;
					result["operation"] = operation;
					result["requestedValue"] = requestedValue;
					result["sampleWorldTick"] = sampleWorldTick;
					result["pauseBehavior"] = "preserve";

					if (pauseMode != "preserve") {
						result["stage"] = "validation";
						result["error"] =
							"pauseMode must be preserve; this endpoint never "
							"changes the user's pause state";
						return result.dump();
					}

					AgentHandle handle =
						theAgentManager.GetAgentFromID(agentId);
					if (handle.IsInvalid() || !handle.IsCreature()) {
						result["stage"] = "precondition";
						result["error"] =
							"The selected creature is no longer live";
						myImpl->PushApiRecord(
							"chemical_intervention",
							"Developer Tools chemical intervention rejected: "
								"creature missing",
							correlationId,
							"warning");
						return result.dump();
					}

					Creature& creature = handle.GetCreatureReference();
					Biochemistry* biochemistry =
						creature.GetBiochemistry();
					if (!biochemistry) {
						result["stage"] = "precondition";
						result["error"] =
							"The selected creature has no biochemistry";
						return result.dump();
					}
					if (chemicalId < 0 || chemicalId >= NUMCHEM) {
						result["stage"] = "validation";
						result["error"] =
							"Chemical identifier must be between 1 and 255";
						return result.dump();
					}

					const std::string actualWorldName =
						theApp.GetWorld().GetWorldName();
					const std::string actualMoniker =
						creature.GetMoniker();
					const long long operationTick =
						theApp.GetWorld().GetWorldTick();
					const float beforeValue =
						biochemistry->GetChemical(chemicalId);
					result["worldName"] = actualWorldName;
					result["worldTick"] = operationTick;
					result["systemTick"] = theApp.GetSystemTick();
					result["enginePaused"] = IsEnginePaused();
					result["target"]["moniker"] = actualMoniker;
					result["beforeValue"] = beforeValue;

					const std::string sessionError =
						DebugServerLogic::ValidateReviewedWorldSession(
							request.value("reviewedWorldSessionId", ""),
							myImpl->WorldSessionId());
					const std::string targetError = !sessionError.empty()
						? sessionError :
						DebugServerLogic::ValidateChemicalInterventionTarget(
							confirmedWorldName,
							actualWorldName,
							expectedMoniker,
							actualMoniker,
							sampleWorldTick,
							operationTick,
							expectedConcentration,
							beforeValue);
					if (!targetError.empty()) {
						result["stage"] = "precondition";
						result["error"] = targetError;
						myImpl->PushApiRecord(
							"chemical_intervention",
							"Developer Tools chemical intervention rejected: " +
								targetError,
							correlationId,
							"warning");
						return result.dump();
					}

					const DebugServerLogic::ChemicalInterventionPreview preview =
						DebugServerLogic::PreviewChemicalIntervention(
							chemicalId,
							operation,
							beforeValue,
							requestedValue,
							extremeConfirmed);
					result["requestedChange"] = preview.requestedChange;
					result["projectedImmediateValue"] =
						preview.projectedValue;
					result["clamped"] = preview.clamped;
					result["requiresConfirmation"] =
						preview.requiresConfirmation;
					if (!preview.warning.empty())
						result["warning"] = preview.warning;
					if (!preview.valid) {
						result["stage"] = "validation";
						result["error"] = preview.error;
						myImpl->PushApiRecord(
							"chemical_intervention",
							"Developer Tools chemical intervention rejected: " +
								preview.error,
							correlationId,
							"warning");
						return result.dump();
					}

					if (operation == "adjust")
						biochemistry->AddChemical(
							chemicalId, requestedValue);
					else
						biochemistry->SetChemical(
							chemicalId, requestedValue);
					const float afterValue =
						biochemistry->GetChemical(chemicalId);

					result["ok"] = true;
					result["stage"] = "complete";
					result["afterValue"] = afterValue;
					result["appliedChange"] =
						afterValue - beforeValue;
					result["worldTick"] =
						theApp.GetWorld().GetWorldTick();
					result["systemTick"] =
						theApp.GetSystemTick();
					result["enginePaused"] = IsEnginePaused();
					myImpl->PushApiRecord(
						"chemical_intervention",
						"Developer Tools applied a reviewed chemical "
							"intervention",
						correlationId);
					return result.dump();
				} catch (const std::exception& error) {
					result["stage"] = "request";
					result["error"] = error.what();
					myImpl->PushApiRecord(
						"chemical_intervention",
						"Developer Tools chemical intervention request failed",
						correlationId,
						"error");
					return result.dump();
				}
			};

			auto future = item->get_future();
			{
				std::lock_guard<std::mutex> lock(myImpl->queueMutex);
				myImpl->workQueue.push(item);
			}
			if (future.wait_for(std::chrono::seconds(5)) ==
				std::future_status::ready) {
				res.set_content(future.get(), "application/json");
			} else {
				res.status = 504;
				res.set_content(
					"{\"schemaVersion\":1,\"ok\":false,"
					"\"stage\":\"timeout\",\"error\":\"Timeout\"}",
					"application/json");
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

		auto future = item->get_future();
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

					for (int n = 0; n < nCount; ++n) {
						if (n > 0) json << ",";
						json << "\"" << JsonEscape(BrainNeuronSemanticLabel(lobeName, n)) << "\"";
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

		auto future = item->get_future();
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
					<< ",\"winner\":" << lobe->GetWhichNeuronWon();

				// Detailed responses carry the same semantic labels as the overview,
				// avoiding a cross-response join for browser and MCP clients.
				json << ",\"labels\":[";
				for (int n = 0; n < nCount; ++n) {
					if (n > 0) json << ",";
					json << "\"" << JsonEscape(BrainNeuronSemanticLabel(lobeName, n)) << "\"";
				}
				json << "],\"neurons\":[";

				for (int n = 0; n < nCount; ++n) {
					Neuron* neuron = lobe->GetNeuron(n);
					if (!neuron) continue;
					if (n > 0) json << ",";

					json << "{\"id\":" << neuron->idInList
						<< ",\"label\":\"" << JsonEscape(
							BrainNeuronSemanticLabel(lobeName, neuron->idInList)) << "\""
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

		auto future = item->get_future();
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

		auto future = item->get_future();
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

		auto future = item->get_future();
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

	// ═══════════════════════════════════════════════════════════════════
	// PHASE 3: HEADLESS OPERATION — World, Creature, Experiment Tools
	// ═══════════════════════════════════════════════════════════════════

	// ── GET /api/experiment/context ─────────────────────────────────
	// Read-only build and launch provenance for portable experiment manifests.
	myImpl->svr.Get("/api/experiment/context", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = [this]() -> std::string {
			nlohmann::json result;
			result["schemaVersion"] = 1;
			result["source"] = "GET /api/experiment/context";
			result["capturedAtWallTimeMs"] = WallTimeMilliseconds();
			result["worldName"] = theApp.GetWorld().GetWorldName();
			result["worldSessionId"] = myImpl->WorldSessionId();
			result["worldTick"] = theApp.GetWorld().GetWorldTick();
			result["systemTick"] = theApp.GetSystemTick();
			result["enginePaused"] = IsEnginePaused();
			result["gameSpeed"] = GetGameSpeedMultiplier();
			result["engineBuildIdentifier"] =
				C3_ENGINE_BUILD_IDENTIFIER;
			result["engineBuildIdentifierSource"] =
				"Source revision when the binary was built";
			std::string gameBuildIdentifier;
			try {
				if (theCatalogue.TagPresent("build_number"))
					gameBuildIdentifier =
						theCatalogue.Get("build_number", 0);
			} catch (...) {}
			result["gameBuildIdentifier"] =
				gameBuildIdentifier.empty()
					? nlohmann::json(nullptr)
					: nlohmann::json(gameBuildIdentifier);
			result["launch"] = {
				{"headless", IsHeadlessMode()},
				{"developerTools", IsDeveloperToolsMode()},
				{"mcp", IsMCPMode()},
				{"options", GetSanitizedLaunchOptions()},
				{"pathValuesOmitted", true}
			};
			result["limitations"] = nlohmann::json::array({
				"Local filesystem paths are omitted from launch options.",
				"The source revision identifies the binary; it does not make the simulation deterministic.",
				"Random state and external world conditions are not captured."
			});
			return result.dump();
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(5)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}",
				"application/json");
		}
	});

	// ── GET /api/worlds ─────────────────────────────────────────────
	// List all available world names.
	myImpl->svr.Get("/api/worlds", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "{\"currentWorld\":\"" << JsonEscape(theApp.GetWorld().GetWorldName()) << "\"";
			json << ",\"worldTick\":" << theApp.GetWorld().GetWorldTick();
			json << ",\"worlds\":[";
			int count = theApp.GetWorld().WorldCount();
			bool first = true;
			for (int i = 0; i < count; ++i) {
				std::string name;
				if (theApp.GetWorld().WorldName(i, name)) {
					if (name == "Startup") continue;
					if (!first) json << ",";
					first = false;
					json << "\"" << JsonEscape(name) << "\"";
				}
			}
			json << "]}";
			return json.str();
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/world/branch ─────────────────────────────────────
	// Save and copy the active world under a new, non-existing name.
	// Body: { "name": "...", "confirmedSourceWorld": "..." }
	myImpl->svr.Post("/api/world/branch", [this](const httplib::Request& req, httplib::Response& res) {
		const std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("world-branch");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			nlohmann::json result;
			result["ok"] = false;
			result["source"] = "POST /api/world/branch";
			result["correlationId"] = correlationId;
			try {
				const nlohmann::json request =
					nlohmann::json::parse(body);
				const std::string destination =
					request.value("name", "");
				const std::string confirmedSource =
					request.value("confirmedSourceWorld", "");
				const std::string source =
					theApp.GetWorld().GetWorldName();
				result["sourceWorld"] = source;
				result["branchWorld"] = destination;
				result["worldTick"] =
					theApp.GetWorld().GetWorldTick();

				std::string error;
				if (source.empty() || source == "Startup")
					error = "A loaded non-Startup world is required";
				else if (confirmedSource != source)
					error = "confirmedSourceWorld must match the active world";
				else if (!DebugServerLogic::ValidateReviewedWorldSession(
						request.value("reviewedWorldSessionId", ""),
						myImpl->WorldSessionId()).empty())
					error = "The world was reloaded after this review; review it again";
				else if (!WorldMetadata::IsValidWorldName(destination))
					error = "Invalid branch world name";
				else if (destination == source)
					error = "Branch name must differ from the active world";

				FilePath destinationPath(destination, WORLDS_DIR);
				struct stat destinationInfo;
				if (error.empty() &&
					stat(destinationPath.GetFullPath().c_str(),
						&destinationInfo) == 0)
					error = "World already exists";
				if (!error.empty()) {
					result["stage"] = "validation";
					result["error"] = error;
					myImpl->PushApiRecord(
						"world_branch",
						"Developer Tools world branch rejected: " +
							error,
						correlationId,
						"warning");
					return result.dump();
				}

				if (!theApp.GetWorld().Save()) {
					result["stage"] = "save";
					result["error"] =
						"Could not save the active world";
					myImpl->PushApiRecord(
						"world_branch",
						"Developer Tools could not save before branching",
						correlationId,
						"error");
					return result.dump();
				}
				result["savedSource"] = true;

				if (mkdir(destinationPath.GetFullPath().c_str(), 0755) != 0) {
					result["stage"] = "copy";
					result["error"] =
						"Could not reserve the unused world name";
					myImpl->PushApiRecord(
						"world_branch",
						"Developer Tools could not reserve world branch name",
						correlationId,
						"error");
					return result.dump();
				}
				if (!World::CopyWorldDirectory(source, destination)) {
					result["stage"] = "copy";
					result["error"] =
						"Could not copy the world directory";
					myImpl->PushApiRecord(
						"world_branch",
						"Developer Tools world branch copy failed",
						correlationId,
						"error");
					return result.dump();
				}
				const std::string archivePath =
					destinationPath.GetFullPath() + "/" +
					World::DefaultWorldName();
				struct stat archiveInfo;
				if (stat(archivePath.c_str(), &archiveInfo) != 0 ||
					!S_ISREG(archiveInfo.st_mode) ||
					access(archivePath.c_str(), R_OK) != 0) {
					result["stage"] = "verify";
					result["error"] =
						"Copied branch has no readable world archive";
					myImpl->PushApiRecord(
						"world_branch",
						"Developer Tools world branch verification failed",
						correlationId,
						"error");
					return result.dump();
				}

				result["ok"] = true;
				result["stage"] = "complete";
				result["copied"] = true;
				result["loaded"] = false;
				result["note"] =
					"The branch was created but not loaded";
				myImpl->PushApiRecord(
					"world_branch",
					"Developer Tools created world branch: " +
						destination,
					correlationId);
				return result.dump();
			} catch (const std::exception& error) {
				result["stage"] = "request";
				result["error"] = error.what();
				return result.dump();
			}
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(30)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content(
				"{\"ok\":false,\"stage\":\"timeout\","
				"\"error\":\"Timeout\"}",
				"application/json");
		}
	});

	// ── POST /api/world/create ──────────────────────────────────────
	// Create a new empty world.
	// Body: { "name": "...", "world_type": "undocked"|"docked" }
	myImpl->svr.Post("/api/world/create", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		auto* item = new WorkItem();
		item->work = [body]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				std::string name = j.value("name", "");
				if (name.empty()) return "{\"ok\":false,\"error\":\"Missing 'name'\"}";
				std::string worldType = j.value("world_type", "undocked");
				std::string error;
				bool ok = theApp.CreateNewWorldWithType(name, worldType, error);
				if (ok) {
					return "{\"ok\":true,\"world\":\"" + JsonEscape(name) +
						"\",\"worldType\":\"" + JsonEscape(worldType) + "\"}";
				}
				return "{\"ok\":false,\"error\":\"" + JsonEscape(error) + "\"}";
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(15)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/world/load ────────────────────────────────────────
	// Load an existing world by name.  Body: { "name": "..." }
	// This sets the deferred load flag; the world switches on next tick.
	myImpl->svr.Post("/api/world/load", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		const std::string correlationId =
			myImpl->NextCorrelationId("world-load");
		auto* item = new WorkItem();
		item->work = [body, correlationId, this]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				std::string name = j.value("name", "");
				if (name.empty()) return "{\"ok\":false,\"error\":\"Missing 'name'\"}";
				std::string worldType;
				std::string error;
				if (!theApp.ValidateWorldForLoad(name, worldType, error))
					return "{\"ok\":false,\"error\":\"" + JsonEscape(error) + "\"}";
				theApp.myLoadThisWorldNextTick = name;
				{
					std::lock_guard<std::mutex> lock(myImpl->sessionMutex);
					myImpl->requestedWorldName = name;
					myImpl->requestedWorldType = worldType;
					myImpl->requestedWorldGeneration =
						theApp.GetWorldLoadGeneration();
				}
				myImpl->PushApiRecord(
					"world_load",
					"Developer Tools requested world load: " + name,
					correlationId);
				return "{\"ok\":true,\"loading\":\"" + JsonEscape(name) +
					"\",\"worldType\":\"" + JsonEscape(worldType) + "\"}";
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/world/save ────────────────────────────────────────
	// Save the current world.
	myImpl->svr.Post("/api/world/save", [this](const httplib::Request& req, httplib::Response& res) {
		const std::string correlationId =
			myImpl->NextCorrelationId("world-save");
		auto* item = new WorkItem();
		item->work = [correlationId, this]() -> std::string {
			try {
				bool ok = theApp.GetWorld().Save();
				myImpl->PushApiRecord(
					"world_save",
					ok ? "Developer Tools saved the active world"
						: "Developer Tools world save failed",
					correlationId,
					ok ? "info" : "error");
				return std::string("{\"ok\":") + (ok ? "true" : "false") + "}";
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(15)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── GET /api/world/tick ─────────────────────────────────────────
	// Returns current world tick, system tick, and world name.
	myImpl->svr.Get("/api/world/tick", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			json << "{\"worldTick\":" << theApp.GetWorld().GetWorldTick()
			     << ",\"systemTick\":" << theApp.GetSystemTick()
			     << ",\"worldName\":\"" << JsonEscape(theApp.GetWorld().GetWorldName()) << "\""
			     << "}";
			return json.str();
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(3)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/creature/kill ─────────────────────────────────────
	// Kill (remove) a creature by agent ID.  Body: { "agentId": N }
	myImpl->svr.Post("/api/creature/kill", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		auto* item = new WorkItem();
		item->work = [body]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				int agentId = j.value("agentId", 0);
				if (agentId == 0) return "{\"ok\":false,\"error\":\"Missing 'agentId'\"}";

				// Use CAOS to kill the creature — same as in-game death
				std::string cmd = "targ agnt " + std::to_string(agentId) + " kill targ";
				Orderiser o;
				if (MacroScript* m = o.OrderFromCAOS(cmd.c_str())) {
					CAOSMachine vm;
					vm.StartScriptExecuting(m, NULLHANDLE, NULLHANDLE, INTEGERZERO, INTEGERZERO);
					vm.UpdateVM(-1);
					delete m;
					return "{\"ok\":true}";
				} else {
					return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(o.GetLastError()) + "\"}";
				}
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/engine/tickrate ───────────────────────────────────
	// Change simulation speed.  Body: { "multiplier": N } or { "fastest": true }
	myImpl->svr.Post("/api/engine/tickrate", [this](const httplib::Request& req, httplib::Response& res) {
		std::string body = req.body;
		auto* item = new WorkItem();
		item->work = [body]() -> std::string {
			try {
				auto j = nlohmann::json::parse(body);
				if (j.value("fastest", false)) {
					// WOLF mode — CAOS "wolf 1 1" sets fastest ticks
					std::string cmd = "wolf 1 1";
					Orderiser o;
					if (MacroScript* m = o.OrderFromCAOS(cmd.c_str())) {
						CAOSMachine vm;
						vm.StartScriptExecuting(m, NULLHANDLE, NULLHANDLE, INTEGERZERO, INTEGERZERO);
						vm.UpdateVM(-1);
						delete m;
					}
					return "{\"ok\":true,\"fastest\":true}";
				}
				float mult = j.value("multiplier", 1.0f);
				SetGameSpeedMultiplier(mult);
				std::ostringstream json;
				json << "{\"ok\":true,\"multiplier\":" << GetGameSpeedMultiplier() << "}";
				return json.str();
			} catch (std::exception& e) {
				return std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}";
			}
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(3)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"ok\":false,\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── POST /api/engine/advance ────────────────────────────────────
	// Run exactly N ticks then pause.  Body: { "ticks": N }
	myImpl->svr.Post("/api/engine/advance", [this](const httplib::Request& req, httplib::Response& res) {
		try {
			auto j = nlohmann::json::parse(req.body);
			uint32_t ticks = j.value("ticks", 0u);
			if (ticks == 0) {
				res.set_content("{\"ok\":false,\"error\":\"Missing or zero 'ticks'\"}", "application/json");
				return;
			}
			SetAdvanceTicks(ticks);
			std::ostringstream json;
			json << "{\"ok\":true,\"advancing\":" << ticks << "}";
			res.set_content(json.str(), "application/json");
		} catch (std::exception& e) {
			res.set_content(std::string("{\"ok\":false,\"error\":\"") + JsonEscape(e.what()) + "\"}", "application/json");
		}
	});

	// ── GET /api/world/stats ────────────────────────────────────────
	// Aggregate world stats: creature count, tick, age/sex distributions.
	myImpl->svr.Get("/api/world/stats", [this](const httplib::Request& req, httplib::Response& res) {
		auto* item = new WorkItem();
		item->work = []() -> std::string {
			std::ostringstream json;
			int creatureCount = 0, norns = 0, grendels = 0, ettins = 0;
			int males = 0, females = 0;
			int babies = 0, children = 0, adolescents = 0, adults = 0, old = 0, dead = 0;

			try {
				AgentMap& agentMap = AgentManager::GetAgentIDMap();
				for (AgentMapIterator it = agentMap.begin(); it != agentMap.end(); ++it) {
					AgentHandle& handle = it->second->IsValid() ? *(it->second) : NULLHANDLE;
					if (handle.IsInvalid() || !handle.IsCreature()) continue;

					try {
						creatureCount++;
						Agent& agent = handle.GetAgentReference();
						Classifier c = agent.GetClassifier();
						if (c.Genus() == 1) norns++;
						else if (c.Genus() == 2) grendels++;
						else if (c.Genus() == 3) ettins++;

						Creature& creature = handle.GetCreatureReference();
						LifeFaculty* life = creature.Life();
						if (life) {
							if (life->GetSex() == 1) males++; else females++;
							if (life->GetWhetherDead()) dead++;
							else {
								int age = life->GetAge();
								if (age <= 0) babies++;
								else if (age <= 1) children++;
								else if (age <= 2) adolescents++;
								else if (age <= 4) adults++;
								else old++;
							}
						}
					} catch (...) {}
				}
			} catch (...) {}

			json << "{\"worldTick\":" << theApp.GetWorld().GetWorldTick()
			     << ",\"systemTick\":" << theApp.GetSystemTick()
			     << ",\"worldName\":\"" << JsonEscape(theApp.GetWorld().GetWorldName()) << "\""
			     << ",\"creatureCount\":" << creatureCount
			     << ",\"norns\":" << norns
			     << ",\"grendels\":" << grendels
			     << ",\"ettins\":" << ettins
			     << ",\"males\":" << males
			     << ",\"females\":" << females
			     << ",\"babies\":" << babies
			     << ",\"children\":" << children
			     << ",\"adolescents\":" << adolescents
			     << ",\"adults\":" << adults
			     << ",\"old\":" << old
			     << ",\"dead\":" << dead
			     << ",\"paused\":" << (IsEnginePaused() ? "true" : "false")
			     << ",\"gameSpeed\":" << GetGameSpeedMultiplier()
			     << "}";
			return json.str();
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── GET /api/ecology/snapshot ───────────────────────────────────
	// Bounded, coherent, read-only world geometry and ecology evidence.
	myImpl->svr.Get("/api/ecology/snapshot", [this](const httplib::Request& req, httplib::Response& res) {
		auto integerParameter = [&req](const char* name, int fallback) {
			if (!req.has_param(name)) return fallback;
			try {
				size_t consumed = 0;
				const std::string value = req.get_param_value(name);
				const int parsed = std::stoi(value, &consumed);
				return consumed == value.size() ? parsed : fallback;
			} catch (...) {
				return fallback;
			}
		};
		auto realParameter = [&req](const char* name, double fallback) {
			if (!req.has_param(name)) return fallback;
			try {
				size_t consumed = 0;
				const std::string value = req.get_param_value(name);
				const double parsed = std::stod(value, &consumed);
				return consumed == value.size() ? parsed : fallback;
			} catch (...) {
				return fallback;
			}
		};

		const int requestedMetaRoom = integerParameter("metaroom", -1);
		const int focusAgent = integerParameter("focusAgent", -1);
		const int roomLimit = std::max(1,
			std::min(400, integerParameter("roomLimit", 250)));
		const int agentLimit = std::max(1,
			std::min(500, integerParameter("agentLimit", 250)));
		const bool hasViewport =
			req.has_param("left") && req.has_param("right") &&
			req.has_param("top") && req.has_param("bottom");
		const double viewportLeft = realParameter("left", 0.0);
		const double viewportRight = realParameter("right", 0.0);
		const double viewportTop = realParameter("top", 0.0);
		const double viewportBottom = realParameter("bottom", 0.0);

		std::vector<int> channels;
		if (req.has_param("channels")) {
			std::set<int> uniqueChannels;
			std::istringstream values(req.get_param_value("channels"));
			std::string value;
			while (std::getline(values, value, ',') &&
				uniqueChannels.size() < 4) {
				try {
					size_t consumed = 0;
					const int id = std::stoi(value, &consumed);
					while (consumed < value.size() &&
						std::isspace(static_cast<unsigned char>(
							value[consumed])))
						++consumed;
					if (consumed == value.size() &&
						id >= 0 && id < CA_PROPERTY_COUNT)
						uniqueChannels.insert(id);
				} catch (...) {}
			}
			channels.assign(uniqueChannels.begin(), uniqueChannels.end());
		}

		auto* item = new WorkItem();
		item->work = [requestedMetaRoom, focusAgent, roomLimit, agentLimit,
			hasViewport, viewportLeft, viewportRight, viewportTop,
			viewportBottom, channels]() -> std::string {
			nlohmann::json result;
			result["schemaVersion"] = 1;
			result["source"] = "GET /api/ecology/snapshot";
			result["contextTiming"] = "engine_main_thread";
			result["capturedAtWallTimeMs"] = WallTimeMilliseconds();
			result["worldName"] = theApp.GetWorld().GetWorldName();
			result["worldTick"] = theApp.GetWorld().GetWorldTick();
			result["systemTick"] = theApp.GetSystemTick();
			result["enginePaused"] = IsEnginePaused();
			result["gameSpeed"] = GetGameSpeedMultiplier();
			result["readOnly"] = true;
			result["limits"] = {
				{"roomLimit", roomLimit},
				{"agentLimit", agentLimit},
				{"connectionLimit", 2000},
				{"channelLimit", 4}
			};
			result["viewport"] = hasViewport
				? nlohmann::json({
					{"left", viewportLeft},
					{"right", viewportRight},
					{"top", viewportTop},
					{"bottom", viewportBottom}})
				: nlohmann::json(nullptr);

			try {
				Map& map = theApp.GetWorld().GetMap();
				IntegerCollection metaRoomIds;
				map.GetMetaRoomIDCollection(metaRoomIds);
				int selectedMetaRoom = requestedMetaRoom;
				if (!map.IsMetaRoomIDValid(selectedMetaRoom)) {
					const int current = map.GetCurrentMetaRoom();
					selectedMetaRoom = map.IsMetaRoomIDValid(current)
						? current
						: (metaRoomIds.empty() ? -1
							: *metaRoomIds.begin());
				}
				result["selectedMetaRoomId"] = selectedMetaRoom >= 0
					? nlohmann::json(selectedMetaRoom)
					: nlohmann::json(nullptr);

				nlohmann::json metaRooms = nlohmann::json::array();
				for (ConstantIntegerIterator iterator =
					metaRoomIds.begin(); iterator != metaRoomIds.end();
					++iterator) {
					int x = 0, y = 0, width = 0, height = 0;
					if (!map.GetMetaRoomLocation(
						*iterator, x, y, width, height))
						continue;
					IntegerCollection ids;
					int count = 0;
					map.GetRoomIDCollectionForMetaRoom(
						*iterator, ids, count);
					metaRooms.push_back({
						{"id", *iterator},
						{"x", x}, {"y", y},
						{"width", width}, {"height", height},
						{"roomCount", count},
						{"current",
							*iterator == map.GetCurrentMetaRoom()}
					});
				}
				result["metaRooms"] = metaRooms;

				nlohmann::json channelMetadata =
					nlohmann::json::array();
				for (size_t index = 0; index < channels.size(); ++index) {
					const int channel = channels[index];
					const int categoryId =
						theAgentManager.GetCategoryIdFromSmellId(
							channel);
					channelMetadata.push_back({
						{"id", channel},
						{"worldCategoryId", categoryId >= 0
							? nlohmann::json(categoryId)
							: nlohmann::json(nullptr)},
						{"worldCategoryLabel",
							categoryId >= 0 &&
								categoryId <
									SensoryFaculty::GetNumCategories()
								? nlohmann::json(
									SensoryFaculty::GetCategoryName(
										categoryId))
								: nlohmann::json(nullptr)},
						{"semanticSource", categoryId >= 0
							? nlohmann::json(
								"world smell-category mapping")
							: nlohmann::json(nullptr)},
						{"caNavigable", map.IsCANavigable(channel)}
					});
				}
				result["channels"] = channelMetadata;

				IntegerCollection selectedRoomIds;
				int selectedRoomCount = 0;
				if (selectedMetaRoom >= 0)
					map.GetRoomIDCollectionForMetaRoom(
						selectedMetaRoom, selectedRoomIds,
						selectedRoomCount);
				std::set<int> includedRoomIds;
				nlohmann::json rooms = nlohmann::json::array();
				int matchingRoomCount = 0;
				for (ConstantIntegerIterator iterator =
					selectedRoomIds.begin();
					iterator != selectedRoomIds.end(); ++iterator) {
					int metaRoomId = -1;
					int xLeft = 0, xRight = 0;
					int yLeftCeiling = 0, yRightCeiling = 0;
					int yLeftFloor = 0, yRightFloor = 0;
					if (!map.GetRoomLocation(
						*iterator, metaRoomId, xLeft, xRight,
						yLeftCeiling, yRightCeiling,
						yLeftFloor, yRightFloor))
						continue;
					const double roomTop =
						std::min(yLeftCeiling, yRightCeiling);
					const double roomBottom =
						std::max(yLeftFloor, yRightFloor);
					if (hasViewport &&
						(xRight < viewportLeft ||
						 xLeft > viewportRight ||
						 roomBottom < viewportTop ||
						 roomTop > viewportBottom))
						continue;
					matchingRoomCount++;
					if (static_cast<int>(rooms.size()) >= roomLimit)
						continue;
					int roomType = -1;
					map.GetRoomType(*iterator, roomType);
					nlohmann::json samples =
						nlohmann::json::array();
					for (size_t channelIndex = 0;
						channelIndex < channels.size();
						++channelIndex) {
						float value = 0.0f;
						float change = 0.0f;
						float projected = 0.0f;
						const bool hasValue =
							map.GetRoomProperty(*iterator,
								channels[channelIndex], value);
						const bool hasChange =
							map.GetRoomPropertyChange(*iterator,
								channels[channelIndex], change);
						const bool hasProjected =
							map.GetProjectedRoomProperty(*iterator,
								channels[channelIndex], projected);
						samples.push_back({
							{"channelId", channels[channelIndex]},
							{"value", hasValue
								? nlohmann::json(value)
								: nlohmann::json(nullptr)},
							{"change", hasChange
								? nlohmann::json(change)
								: nlohmann::json(nullptr)},
							{"projected", hasProjected
								? nlohmann::json(projected)
								: nlohmann::json(nullptr)}
						});
					}
					rooms.push_back({
						{"id", *iterator},
						{"metaRoomId", metaRoomId},
						{"type", roomType},
						{"left", xLeft}, {"right", xRight},
						{"ceilingLeft", yLeftCeiling},
						{"ceilingRight", yRightCeiling},
						{"floorLeft", yLeftFloor},
						{"floorRight", yRightFloor},
						{"ca", samples}
					});
					includedRoomIds.insert(*iterator);
				}
				result["rooms"] = rooms;
				result["roomCount"] = selectedRoomCount;
				result["matchingRoomCount"] = matchingRoomCount;
				result["roomsTruncated"] =
					matchingRoomCount > static_cast<int>(rooms.size());

				nlohmann::json connections =
					nlohmann::json::array();
				int matchingConnectionCount = 0;
				DoorCollection& doors = map.GetDoorCollection();
				for (ConstantDoorIterator iterator = doors.begin();
					iterator != doors.end(); ++iterator) {
					const Door* door = *iterator;
					if (!door ||
						(includedRoomIds.count(door->parent1) == 0 &&
						 includedRoomIds.count(door->parent2) == 0))
						continue;
					matchingConnectionCount++;
					if (connections.size() >= 2000) continue;
					connections.push_back({
						{"kind", "door"},
						{"roomA", door->parent1 >= 0
							? nlohmann::json(door->parent1)
							: nlohmann::json(nullptr)},
						{"roomB", door->parent2 >= 0
							? nlohmann::json(door->parent2)
							: nlohmann::json(nullptr)},
						{"permeability", door->permiability},
						{"doorType", door->doorType},
						{"startX", door->start.x},
						{"startY", door->start.y},
						{"endX", door->end.x},
						{"endY", door->end.y}
					});
				}
				const LinkCollection& links =
					map.GetLinkCollectionForObservation();
				for (ConstantLinkIterator iterator = links.begin();
					iterator != links.end(); ++iterator) {
					const Link* link = *iterator;
					if (!link ||
						(includedRoomIds.count(link->parent1) == 0 &&
						 includedRoomIds.count(link->parent2) == 0))
						continue;
					matchingConnectionCount++;
					if (connections.size() >= 2000) continue;
					connections.push_back({
						{"kind", "link"},
						{"roomA", link->parent1},
						{"roomB", link->parent2},
						{"permeability", link->permiability}
					});
				}
				result["connections"] = connections;
				result["matchingConnectionCount"] =
					matchingConnectionCount;
				result["connectionsTruncated"] =
					matchingConnectionCount >
						static_cast<int>(connections.size());

				nlohmann::json agents = nlohmann::json::array();
				int matchingAgentCount = 0;
				bool focusAgentIncluded = false;
				nlohmann::json focusAgentJson = nullptr;
				AgentMap& agentMap = AgentManager::GetAgentIDMap();
				for (AgentMapIterator iterator = agentMap.begin();
					iterator != agentMap.end(); ++iterator) {
					AgentHandle& handle = iterator->second->IsValid()
						? *(iterator->second) : NULLHANDLE;
					if (handle.IsInvalid()) continue;
					try {
						Agent& agent = handle.GetAgentReference();
						const Vector2D position = agent.GetPosition();
						int metaRoomId = -1;
						if (!map.GetMetaRoomIDForPoint(
							position, metaRoomId) ||
							metaRoomId != selectedMetaRoom)
							continue;
						if (hasViewport &&
							(position.x < viewportLeft ||
							 position.x > viewportRight ||
							 position.y < viewportTop ||
							 position.y > viewportBottom))
							continue;
						matchingAgentCount++;
						const bool isFocusAgent =
							static_cast<int>(agent.GetUniqueID()) ==
								focusAgent;
						if (static_cast<int>(agents.size()) >=
							agentLimit && !isFocusAgent)
							continue;
						int roomId = -1;
						const bool hasRoom =
							map.GetRoomIDForPoint(position, roomId);
						const Classifier classifier =
							agent.GetClassifier();
						std::string gallery;
						try {
							gallery = agent.GetGalleryName();
						} catch (...) {}
						const int caIndex = agent.GetCAIndex();
						const float caIncrease =
							agent.GetCAIncrease();
						const int categoryId =
							SensoryFaculty::GetCategoryIdOfAgent(
								handle);
						nlohmann::json agentJson = {
							{"agentId", agent.GetUniqueID()},
							{"family", classifier.Family()},
							{"genus", classifier.Genus()},
							{"species", classifier.Species()},
							{"gallery", gallery},
							{"posX", position.x},
							{"posY", position.y},
							{"roomId", hasRoom && roomId >= 0
								? nlohmann::json(roomId)
								: nlohmann::json(nullptr)},
							{"metaRoomId", metaRoomId},
							{"isCreature", handle.IsCreature()},
							{"isVehicle", handle.IsVehicle()},
							{"worldCategoryId", categoryId >= 0
								? nlohmann::json(categoryId)
								: nlohmann::json(nullptr)},
							{"worldCategoryLabel",
								categoryId >= 0 &&
									categoryId <
										SensoryFaculty::
											GetNumCategories()
									? nlohmann::json(
										SensoryFaculty::
											GetCategoryName(categoryId))
									: nlohmann::json(nullptr)},
							{"caChannelId", caIndex >= 0
								? nlohmann::json(caIndex)
								: nlohmann::json(nullptr)},
							{"caEmission", caIndex >= 0
								? nlohmann::json(caIncrease)
								: nlohmann::json(nullptr)}
						};
						if (isFocusAgent) {
							focusAgentJson = agentJson;
							focusAgentIncluded = true;
						}
						if (static_cast<int>(agents.size()) <
							agentLimit)
							agents.push_back(agentJson);
					} catch (...) {}
				}
				if (focusAgentIncluded &&
					!focusAgentJson.is_null()) {
					bool alreadyIncluded = false;
					for (size_t index = 0; index < agents.size();
						++index) {
						if (agents[index]["agentId"] ==
							focusAgentJson["agentId"]) {
							alreadyIncluded = true;
							break;
						}
					}
					if (!alreadyIncluded) {
						if (agents.empty())
							agents.push_back(focusAgentJson);
						else
							agents[agents.size() - 1] =
								focusAgentJson;
					}
				}
				result["agents"] = agents;
				result["matchingAgentCount"] = matchingAgentCount;
				result["agentsTruncated"] =
					matchingAgentCount >
						static_cast<int>(agents.size());
			} catch (const std::exception& error) {
				result["error"] = error.what();
			} catch (...) {
				result["error"] =
					"Failed to sample world ecology";
			}
			return result.dump();
		};
		auto future = item->get_future();
		{
			std::lock_guard<std::mutex> lock(myImpl->queueMutex);
			myImpl->workQueue.push(item);
		}
		if (future.wait_for(std::chrono::seconds(5)) ==
			std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}",
				"application/json");
		}
	});

	// ── GET /api/creatures/snapshot ──────────────────────────────────
	// Bulk, coherent cohort state with an optional bounded chemical selection.
	myImpl->svr.Get("/api/creatures/snapshot", [this](const httplib::Request& req, httplib::Response& res) {
		std::vector<int> selectedChemicalIds;
		if (req.has_param("chemicals")) {
			std::set<int> uniqueIds;
			std::istringstream values(req.get_param_value("chemicals"));
			std::string value;
			while (std::getline(values, value, ',') &&
				uniqueIds.size() < 16) {
				try {
					size_t consumed = 0;
					const int id = std::stoi(value, &consumed);
					while (consumed < value.size() &&
						std::isspace(static_cast<unsigned char>(
							value[consumed])))
						++consumed;
					if (consumed != value.size()) continue;
					if (id >= 0 && id < NUMCHEM)
						uniqueIds.insert(id);
				} catch (...) {}
			}
			selectedChemicalIds.assign(
				uniqueIds.begin(), uniqueIds.end());
		}
		auto* item = new WorkItem();
		item->work = [selectedChemicalIds]() -> std::string {
			std::ostringstream json;
			json << "{\"schemaVersion\":1"
				<< ",\"source\":\"GET /api/creatures/snapshot\""
				<< ",\"contextTiming\":\"engine_main_thread\""
				<< ",\"capturedAtWallTimeMs\":"
				<< WallTimeMilliseconds()
				<< ",\"worldName\":\""
				<< JsonEscape(theApp.GetWorld().GetWorldName()) << "\""
				<< ",\"worldTick\":"
				<< theApp.GetWorld().GetWorldTick()
				<< ",\"systemTick\":" << theApp.GetSystemTick()
				<< ",\"enginePaused\":"
				<< (IsEnginePaused() ? "true" : "false")
				<< ",\"gameSpeed\":" << GetGameSpeedMultiplier()
				<< ",\"requestedChemicalIds\":[";
			for (size_t chemicalIndex = 0;
				chemicalIndex < selectedChemicalIds.size();
				++chemicalIndex) {
				if (chemicalIndex > 0) json << ",";
				json << selectedChemicalIds[chemicalIndex];
			}
			json << "],\"creatures\":[";
			bool first = true;

			try {
				AgentMap& agentMap = AgentManager::GetAgentIDMap();
				for (AgentMapIterator it = agentMap.begin(); it != agentMap.end(); ++it) {
					AgentHandle& handle = it->second->IsValid() ? *(it->second) : NULLHANDLE;
					if (handle.IsInvalid() || !handle.IsCreature()) continue;

					try {
						Creature& creature = handle.GetCreatureReference();
						Agent& agent = handle.GetAgentReference();
						LifeFaculty* life = creature.Life();
						const Classifier classifier = agent.GetClassifier();

						if (!first) json << ",";
						first = false;

						// Moniker
						std::string moniker;
						try { moniker = creature.GetMoniker(); } catch (...) {}

						// Name
						std::string name;
						try {
							LinguisticFaculty* ling = creature.Linguistic();
							if (ling && ling->KnownWord(LinguisticFaculty::PERSONAL, LinguisticFaculty::ME))
								name = ling->GetPlatonicWord(LinguisticFaculty::PERSONAL, LinguisticFaculty::ME);
						} catch (...) {}

						json << "{\"agentId\":" << agent.GetUniqueID()
						     << ",\"moniker\":\"" << JsonEscape(moniker) << "\""
						     << ",\"name\":\"" << JsonEscape(name) << "\""
						     << ",\"family\":" << (int)classifier.Family()
						     << ",\"genus\":" << (int)classifier.Genus()
						     << ",\"species\":" << (int)classifier.Species();

						if (life) {
							const float glycogen = life->Health();
							std::string lifeState = "unknown";
							if (life->GetWhetherDead()) lifeState = "dead";
							else if (life->GetWhetherUnconscious())
								lifeState = "unconscious";
							else if (life->GetWhetherDreaming())
								lifeState = "dreaming";
							else if (life->GetWhetherAsleep())
								lifeState = "asleep";
							else if (life->GetWhetherZombie())
								lifeState = "zombie";
							else if (life->GetWhetherAlert())
								lifeState = "alert";
							json << ",\"health\":" << glycogen
							     << ",\"healthMeaning\":\"glycogen concentration (legacy compatibility)\""
							     << ",\"glycogenReserve\":" << glycogen
							     << ",\"glycogenChemicalId\":" << CHEM_GLYCOGEN
							     << ",\"sex\":" << life->GetSex()
							     << ",\"age\":" << life->GetAge()
							     << ",\"ageInTicks\":" << life->GetTickAge()
							     << ",\"lifeState\":\"" << lifeState << "\""
							     << ",\"dead\":" << (life->GetWhetherDead() ? "true" : "false");
						}

						// Position
						const Vector2D position = agent.GetPosition();
						int roomId = -1;
						int metaRoomId = -1;
						theApp.GetWorld().GetMap().GetRoomIDForPoint(
							position, roomId);
						theApp.GetWorld().GetMap().GetMetaRoomIDForPoint(
							position, metaRoomId);
						json << ",\"posX\":" << (int)position.x
						     << ",\"posY\":" << (int)position.y
						     << ",\"roomId\":";
						if (roomId >= 0) json << roomId;
						else json << "null";
						json << ",\"metaRoomId\":";
						if (metaRoomId >= 0) json << metaRoomId;
						else json << "null";

						// Drives
						json << ",\"drives\":[";
						for (int d = 0; d < NUMDRIVES; ++d) {
							if (d > 0) json << ",";
							json << creature.GetDriveLevel(d);
						}
						json << "]";
						json << ",\"highestDrive\":" << creature.GetHighestDrive();

						// Compact attention, decision, and action state for
						// same-tick comparison. Full neural details remain on
						// the atomic observation endpoint.
						MotorFaculty* motor = creature.Motor();
						json << ",\"currentAttentionId\":";
						if (motor)
							json << motor->GetCurrentAttentionId();
						else
							json << "null";
						json << ",\"currentDecisionId\":";
						if (motor)
							json << motor->GetCurrentDecisionId();
						else
							json << "null";
						AgentHandle attentionTarget =
							creature.GetItAgent();
						json << ",\"currentTargetAgentId\":";
						if (attentionTarget.IsValid())
							json << attentionTarget
								.GetAgentReference().GetUniqueID();
						else
							json << "null";
						json << ",\"currentTargetCategory\":";
						if (attentionTarget.IsValid()) {
							const int category =
								SensoryFaculty::GetCategoryIdOfAgent(
									attentionTarget);
							json << "\""
								<< JsonEscape(
									category >= 0 &&
										category <
											SensoryFaculty::
												GetNumCategories()
										? SensoryFaculty::
											GetCategoryName(category)
										: "")
								<< "\"";
						} else {
							json << "null";
						}
						CAOSMachine& creatureVm =
							agent.GetVirtualMachine();
						const std::string actionState =
							creatureVm.IsAtBreakpoint()
								? "paused"
								: creatureVm.IsBlocking()
									? "blocking"
									: creatureVm.IsRunning()
										? "running" : "idle";
						json << ",\"actionState\":\""
							<< actionState << "\""
							<< ",\"blockingCommand\":";
						if (creatureVm.IsBlocking())
							json << "\""
								<< JsonEscape(
									creatureVm
										.GetCurrentCommandName())
								<< "\"";
						else
							json << "null";

						// Top 5 non-zero chemicals
						json << ",\"topChemicals\":[";
						try {
							Biochemistry* bio = creature.GetBiochemistry();
							if (bio) {
								struct ChemEntry { int id; float conc; };
								std::vector<ChemEntry> chems;
								for (int c = 0; c < 256; ++c) {
									float conc = bio->GetChemical(c);
									if (conc > 0.001f) chems.push_back({c, conc});
								}
								std::sort(chems.begin(), chems.end(),
									[](const ChemEntry& a, const ChemEntry& b) { return a.conc > b.conc; });
								int limit = std::min((int)chems.size(), 5);
								for (int i = 0; i < limit; ++i) {
									if (i > 0) json << ",";
									json << "{\"id\":" << chems[i].id
									     << ",\"concentration\":" << chems[i].conc << "}";
								}
							}
						} catch (...) {}
						json << "]";

						// Explicitly requested comparison chemicals and compact
						// organ functioning counts. This avoids returning all
						// 256 chemicals or full organ structures per member.
						json << ",\"selectedChemicals\":[";
						int organCount = 0;
						int functioningOrgans = 0;
						int failedOrgans = 0;
						bool organStatusAvailable = false;
						try {
							Biochemistry* bio = creature.GetBiochemistry();
							if (bio) {
								organStatusAvailable = true;
								for (size_t chemicalIndex = 0;
									chemicalIndex <
										selectedChemicalIds.size();
									++chemicalIndex) {
									if (chemicalIndex > 0) json << ",";
									const int chemicalId =
										selectedChemicalIds[chemicalIndex];
									json << "{\"id\":" << chemicalId
										<< ",\"concentration\":"
										<< bio->GetChemical(chemicalId)
										<< "}";
								}
								organCount = bio->GetOrganCount();
								for (int organIndex = 0;
									organIndex < organCount; ++organIndex) {
									Organ* organ =
										bio->GetOrgan(organIndex);
									if (!organ) continue;
									if (organ->Functioning())
										++functioningOrgans;
									if (organ->Failed()) ++failedOrgans;
								}
							}
						} catch (...) {}
						json << "]"
							<< ",\"organCount\":";
						if (organStatusAvailable)
							json << organCount;
						else
							json << "null";
						json << ",\"functioningOrgans\":";
						if (organStatusAvailable)
							json << functioningOrgans;
						else
							json << "null";
						json << ",\"failedOrgans\":";
						if (organStatusAvailable)
							json << failedOrgans;
						else
							json << "null";

						json << "}";
					} catch (...) {}
				}
			} catch (...) {}

			json << "]}";
			return json.str();
		};
		auto future = item->get_future();
		{ std::lock_guard<std::mutex> lock(myImpl->queueMutex); myImpl->workQueue.push(item); }
		if (future.wait_for(std::chrono::seconds(10)) == std::future_status::ready) {
			res.set_content(future.get(), "application/json");
		} else {
			res.status = 504;
			res.set_content("{\"error\":\"Timeout\"}", "application/json");
		}
	});

	// ── SSE endpoint for log streaming ─────────────────────────────────
	// Clients connect to GET /api/events and receive versioned envelopes.
	myImpl->svr.Get("/api/events", [this](const httplib::Request& req, httplib::Response& res) {
		uint64_t clientNextId = 1;
		bool initialRestartGap = false;
		bool initialHistoryGap = false;
		uint64_t initialDropped = 0;
		const std::string lastEventId =
			req.get_header_value("Last-Event-ID");
		{
			std::lock_guard<std::mutex> lock(myImpl->logMutex);
			clientNextId = myImpl->logBuffer.empty()
				? myImpl->nextLogId
				: myImpl->logBuffer.front().id;
			if (!lastEventId.empty()) {
				const size_t separator = lastEventId.rfind(':');
				const std::string lastStream = separator == std::string::npos
					? std::string()
					: lastEventId.substr(0, separator);
				if (lastStream == myImpl->streamId) {
					try {
						clientNextId = std::stoull(
							lastEventId.substr(separator + 1)) + 1;
					} catch (...) {
						initialRestartGap = true;
					}
				} else {
					initialRestartGap = true;
				}
			} else if (myImpl->droppedLogs > 0) {
				initialHistoryGap = true;
				initialDropped = myImpl->droppedLogs;
			}
		}

		res.set_header("Cache-Control", "no-cache");
		res.set_header("X-Accel-Buffering", "no");
		bool initialGapSent = false;

		res.set_chunked_content_provider(
			"text/event-stream",
			[this, clientNextId, initialRestartGap, initialHistoryGap,
			 initialDropped, initialGapSent]
			(size_t offset, httplib::DataSink& sink) mutable -> bool {
				std::vector<std::string> pending;
				auto queueGap = [&](const std::string& reason, uint64_t count) {
					nlohmann::json gap;
					gap["schemaVersion"] = 2;
					gap["kind"] = "gap";
					gap["streamId"] = myImpl->streamId;
					gap["source"] = "debug_server";
					gap["severity"] = "warning";
					gap["subsystem"] = "developer_tools";
					gap["contextTiming"] = "unavailable";
					gap["reason"] = reason;
					gap["droppedCount"] = count;
					gap["wallTimeMs"] = WallTimeMilliseconds();
					gap["message"] = reason == "server_restart"
						? "Log stream restarted; records between sessions are unavailable"
						: "Log records were dropped by a bounded server buffer";
					pending.push_back(
						"data: " + gap.dump(
							-1, ' ', false,
							nlohmann::json::error_handler_t::replace) +
						"\n\n");
				};

				bool running = true;
				{
					std::unique_lock<std::mutex> lock(myImpl->logMutex);
					if (!initialGapSent) {
						if (initialRestartGap)
							queueGap("server_restart", 0);
						else if (initialHistoryGap)
							queueGap("server_history_truncated", initialDropped);
						initialGapSent = true;
					}

					auto drain = [&]() {
						if (!myImpl->logBuffer.empty() &&
							clientNextId < myImpl->logBuffer.front().id) {
							const uint64_t dropped =
								myImpl->logBuffer.front().id - clientNextId;
							queueGap("server_buffer_overflow", dropped);
							clientNextId = myImpl->logBuffer.front().id;
						}
						while (!myImpl->logBuffer.empty() &&
							clientNextId >= myImpl->logBuffer.front().id &&
							clientNextId <= myImpl->logBuffer.back().id) {
							const size_t index = static_cast<size_t>(
								clientNextId - myImpl->logBuffer.front().id);
							if (index >= myImpl->logBuffer.size())
								break;
							const Impl::BufferedLog& record =
								myImpl->logBuffer[index];
							std::ostringstream event;
							event << "id: " << myImpl->streamId << ":"
								<< record.id << "\n"
								<< "data: " << record.json << "\n\n";
							pending.push_back(event.str());
							clientNextId = record.id + 1;
						}
					};

					drain();
					if (pending.empty()) {
						myImpl->logCV.wait_for(
							lock, std::chrono::milliseconds(500),
							[this, &clientNextId]() {
								return !myImpl->running ||
									(!myImpl->logBuffer.empty() &&
									 (clientNextId <= myImpl->logBuffer.back().id ||
									  clientNextId < myImpl->logBuffer.front().id));
							});
						drain();
					}
					running = myImpl->running;
				}

				if (pending.empty() && running)
					pending.push_back(": keepalive\n\n");
				for (const std::string& event : pending) {
					if (!sink.write(event.c_str(), event.size()))
						return false;
				}
				return running;
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
		// FlightRecorder sends to 127.0.0.1, so nothing else may reach this.
		addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

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
	const std::string bindAddress =
		myAllowRemoteAccess ? "0.0.0.0" : "127.0.0.1";
	myImpl->serverThread = std::thread([this, bindAddress, port]() {
		if (!myImpl->svr.listen(bindAddress, port) && myImpl->running)
			fprintf(stderr, "[lc2e] ERROR: could not listen on %s:%d\n",
				bindAddress.c_str(), port);
	});

	fprintf(stderr, "[lc2e] API server: http://localhost:%d/\n", port);
	if (myAllowRemoteAccess) {
		fprintf(stderr,
			"[lc2e] WARNING: remote access enabled on all interfaces. "
			"Anyone with this URL can run CAOS and change game files:\n"
			"[lc2e]   http://<this-machine>:%d/?token=%s\n",
			port, myRemoteAccessToken.c_str());
	}
	if (!myImpl->staticDir.empty()) {
		fprintf(stderr, "[lc2e] Developer tools: http://localhost:%d/\n", port);
	} else {
		fprintf(stderr, "[lc2e] MCP mode: API-only (no browser UI)\n");
		fprintf(stderr, "[lc2e] To connect an MCP client, add to your MCP config:\n");
		fprintf(stderr, "[lc2e]   {\"mcpServers\":{\"creatures3\":{\"command\":\"node\",\"args\":[\"mcp/server.js\"]}}}\n");
		fprintf(stderr, "[lc2e] Install MCP server deps: cd mcp && npm install\n");
		fprintf(stderr, "[lc2e] See mcp/MCP.md for full setup instructions.\n");
	}
}

// ── Start (API-only — used by --mcp) ──────────────────────────────────────
void DebugServer::Start(int port) {
	Start(port, "");
}

// ── Poll ───────────────────────────────────────────────────────────────────
void DebugServer::Poll() {
	if (!myImpl) return;

	Impl::LogContextSnapshot logContext;
	bool hasLogContext = false;
	try {
		logContext.worldName = theApp.GetWorld().GetWorldName();
		logContext.worldSessionId = myImpl->WorldSessionId();
		logContext.worldTick = theApp.GetWorld().GetWorldTick();
		logContext.systemTick = theApp.GetSystemTick();
		logContext.paused = IsEnginePaused();
		logContext.gameSpeed = GetGameSpeedMultiplier();
		logContext.capturedAtWallTimeMs = WallTimeMilliseconds();
		hasLogContext = true;
	} catch (...) {
		// Startup may poll before a complete world exists.  Context remains
		// unknown until the next successful main-thread snapshot.
	}
	if (hasLogContext)
		myImpl->UpdateLogContext(logContext);

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
			if (!item->Claim()) {
				delete item;
				continue;
			}
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

	// Stop UDP relay. The socket is non-blocking, so the relay notices the
	// flag within one poll; close only after it has stopped reading.
	myImpl->udpRunning = false;
	if (myImpl->udpThread.joinable())
		myImpl->udpThread.join();
	if (myImpl->udpSocket >= 0) {
		close(myImpl->udpSocket);
		myImpl->udpSocket = -1;
	}

	myImpl->PushApiRecord(
		"server_shutdown",
		"Developer Tools server is shutting down",
		myImpl->NextCorrelationId("shutdown"));

	// Let SSE providers drain the shutdown record and leave their wait loops
	// before stopping the HTTP listener.
	{
		std::lock_guard<std::mutex> lock(myImpl->logMutex);
		myImpl->running = false;
		myImpl->logCV.notify_all();
	}
	myImpl->svr.stop();
	if (myImpl->serverThread.joinable())
		myImpl->serverThread.join();

	delete myImpl;
	myImpl = nullptr;

	fprintf(stderr, "[lc2e] Developer tools stopped.\n");
}
