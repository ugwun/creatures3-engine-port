#ifndef WORLD_METADATA_H
#define WORLD_METADATA_H

#include <string>

namespace WorldMetadata {

enum Type {
  Undocked,
  Docked
};

bool ParseType(const std::string &value, Type &type);
const char *TypeName(Type type);
bool IsValidWorldName(const std::string &name);

// Reads Journal/wtype.  A missing file is reported through found=false and is
// not itself an error, allowing callers to apply a legacy-world policy.
bool ReadType(const std::string &worldsDirectory, const std::string &worldName,
              Type &type, bool &found, std::string &error);

// Writes the GUI-compatible Journal/wtype and Journal/build files for an
// existing world directory.
bool Write(const std::string &worldsDirectory, const std::string &worldName,
           Type type, const std::string &buildNumber, std::string &error);

} // namespace WorldMetadata

#endif
