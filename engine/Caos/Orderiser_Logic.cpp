#include "Orderiser_Logic.h"

#include <sstream>
#include <vector>

namespace {

const char* DescribeParameterType(char type) {
	switch (type) {
	case 'i': return "integer";
	case 'f': return "float";
	case 'd': return "decimal";
	case 's': return "string";
	case 'a': return "agent";
	case 'v': return "variable";
	case 'm': return "any value";
	case 'b': return "byte-string";
	case 'c': return "condition";
	case '#': return "label";
	default: return "";
	}
}

}

namespace OrderiserLogic {

std::string DescribeSignature(const std::string& prettyName,
	const std::string& parameterTypes, const std::string& helpParameters) {
	std::vector<std::string> names;
	std::istringstream words(helpParameters);
	std::string word;
	while (words >> word)
		names.push_back(word);

	std::string signature = prettyName;
	size_t nameIndex = 0;
	for (size_t index = 0; index < parameterTypes.size(); ++index) {
		const char* type = DescribeParameterType(parameterTypes[index]);
		// Subcommand markers and placeholders take no visible argument.
		if (!*type)
			continue;
		signature += " ";
		if (nameIndex < names.size())
			signature += names[nameIndex] + " ";
		++nameIndex;
		signature += "(";
		signature += type;
		signature += ")";
	}
	return signature;
}

std::string AddCommandContext(const std::string& error,
	const std::string& signature) {
	if (signature.empty())
		return error;
	return error + "; parsing " + signature;
}

}
