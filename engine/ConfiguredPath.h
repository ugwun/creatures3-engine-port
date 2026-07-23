#ifndef CONFIGURED_PATH_H
#define CONFIGURED_PATH_H

#include <string>

namespace ConfiguredPath {

// Resolve a directory from machine.cfg for the primary game.  Windows
// installation paths are mapped back into the current game directory.
std::string ResolvePrimary(const std::string &configuredPath,
                           const std::string &machineBase = "./");

// Resolve an auxiliary game directory.  A migrated Windows path such as
// .../Creatures 3/Bootstrap is mapped to ../Creatures 3/Bootstrap.
std::string ResolveAuxiliary(const std::string &configuredPath,
                             bool isMainDirectory,
                             const std::string &machineBase = "./");

} // namespace ConfiguredPath

#endif
