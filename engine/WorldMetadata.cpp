#include "WorldMetadata.h"

#include <cerrno>
#include <cstring>
#include <fstream>
#include <sys/stat.h>

namespace {

std::string Join(const std::string &left, const std::string &right) {
  if (left.empty() || left[left.size() - 1] == '/')
    return left + right;
  return left + "/" + right;
}

bool IsDirectory(const std::string &path) {
  struct stat info;
  return stat(path.c_str(), &info) == 0 && S_ISDIR(info.st_mode);
}

std::string Trim(const std::string &value) {
  const char *whitespace = " \t\r\n";
  size_t begin = value.find_first_not_of(whitespace);
  if (begin == std::string::npos)
    return "";
  size_t end = value.find_last_not_of(whitespace);
  return value.substr(begin, end - begin + 1);
}

bool WriteFile(const std::string &path, const std::string &value,
               std::string &error) {
  std::ofstream output(path.c_str(), std::ios::out | std::ios::trunc);
  if (!output) {
    error = "Could not open '" + path + "' for writing";
    return false;
  }
  output << value;
  output.close();
  if (!output) {
    error = "Could not write '" + path + "'";
    return false;
  }
  return true;
}

} // namespace

namespace WorldMetadata {

bool ParseType(const std::string &value, Type &type) {
  if (value == "undocked") {
    type = Undocked;
    return true;
  }
  if (value == "docked") {
    type = Docked;
    return true;
  }
  return false;
}

const char *TypeName(Type type) {
  return type == Docked ? "docked" : "undocked";
}

bool IsValidWorldName(const std::string &name) {
  if (name.empty() || name == "." || name == "..")
    return false;
  for (size_t i = 0; i < name.size(); ++i) {
    unsigned char c = static_cast<unsigned char>(name[i]);
    if (c < 0x20 || c == '/' || c == '\\')
      return false;
  }
  return true;
}

bool ReadType(const std::string &worldsDirectory, const std::string &worldName,
              Type &type, bool &found, std::string &error) {
  found = false;
  error.clear();
  if (!IsValidWorldName(worldName)) {
    error = "Invalid world name";
    return false;
  }

  std::string path =
      Join(Join(Join(worldsDirectory, worldName), "Journal"), "wtype");
  struct stat info;
  if (stat(path.c_str(), &info) != 0) {
    if (errno == ENOENT)
      return true;
    error = "Could not inspect '" + path + "': " +
            std::string(std::strerror(errno));
    return false;
  }
  if (!S_ISREG(info.st_mode)) {
    error = "'" + path + "' is not a regular file";
    return false;
  }

  std::ifstream input(path.c_str());
  if (!input) {
    error = "Could not open '" + path + "' for reading";
    return false;
  }

  std::string value;
  std::getline(input, value);
  value = Trim(value);
  if (!ParseType(value, type)) {
    error = "Unknown world type '" + value + "'";
    return false;
  }
  found = true;
  return true;
}

bool Write(const std::string &worldsDirectory, const std::string &worldName,
           Type type, const std::string &buildNumber, std::string &error) {
  error.clear();
  if (!IsValidWorldName(worldName)) {
    error = "Invalid world name";
    return false;
  }
  if (buildNumber.empty()) {
    error = "Build number is empty";
    return false;
  }

  std::string worldPath = Join(worldsDirectory, worldName);
  if (!IsDirectory(worldPath)) {
    error = "World directory does not exist";
    return false;
  }

  std::string journalPath = Join(worldPath, "Journal");
  if (!IsDirectory(journalPath) &&
      mkdir(journalPath.c_str(), 0755) != 0 && errno != EEXIST) {
    error = "Could not create '" + journalPath + "': " +
            std::string(std::strerror(errno));
    return false;
  }

  if (!WriteFile(Join(journalPath, "wtype"), TypeName(type), error))
    return false;
  if (!WriteFile(Join(journalPath, "build"), buildNumber, error))
    return false;
  return true;
}

} // namespace WorldMetadata
