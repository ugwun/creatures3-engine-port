// stub_ErrorMessageHandler.cpp
// Provides a no-op ErrorMessageHandler::Format for test binaries.
// Includes the real header to get the correct class definition, then
// implements Format as a stub that returns an empty string.
// This avoids including ErrorMessageHandler.cpp which depends on
// DisplayEngine/SDL.

#include "engine/Display/ErrorMessageHandler.h"
#include <cstdarg>
#include <string>

// static
std::string ErrorMessageHandler::Format(std::string baseTag, int offsetID,
                                        std::string source, ...) {
  return std::string();
}
