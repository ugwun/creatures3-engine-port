#ifndef ORDERISER_LOGIC_H
#define ORDERISER_LOGIC_H

#include <string>

namespace OrderiserLogic {

// "HIST MON1 moniker (string) event_no (integer)" from an op's pretty name,
// its parameter type codes ("si") and its help parameter names.
std::string DescribeSignature(const std::string& prettyName,
	const std::string& parameterTypes, const std::string& helpParameters);

// Appends "; parsing <signature>" to a compile error so a missing or wrong
// argument names the command that wanted it.
std::string AddCommandContext(const std::string& error,
	const std::string& signature);

}

#endif
