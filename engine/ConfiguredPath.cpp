#include "ConfiguredPath.h"

#include <cctype>
#include <vector>

namespace {

std::string Normalise(std::string path) {
  for (size_t i = 0; i < path.size(); ++i) {
    if (path[i] == '\\')
      path[i] = '/';
  }
  return path;
}

bool IsWindowsAbsolutePath(const std::string &path) {
  return path.size() >= 3 &&
         std::isalpha(static_cast<unsigned char>(path[0])) &&
         path[1] == ':' && path[2] == '/';
}

std::string WithTrailingSlash(std::string path) {
  if (!path.empty() && path[path.size() - 1] != '/')
    path += '/';
  return path;
}

std::vector<std::string> Components(const std::string &path) {
  std::vector<std::string> result;
  size_t begin = 0;
  while (begin < path.size()) {
    while (begin < path.size() && path[begin] == '/')
      ++begin;
    if (begin == path.size())
      break;
    size_t end = path.find('/', begin);
    if (end == std::string::npos)
      end = path.size();
    result.push_back(path.substr(begin, end - begin));
    begin = end + 1;
  }
  return result;
}

} // namespace

namespace ConfiguredPath {

std::string ResolvePrimary(const std::string &configuredPath,
                           const std::string &machineBase) {
  std::string path = Normalise(configuredPath);
  if (path.empty())
    return "";
  if (path[0] == '/')
    return WithTrailingSlash(path);
  if (!IsWindowsAbsolutePath(path)) {
    if (path == ".")
      return WithTrailingSlash(machineBase);
    return WithTrailingSlash(machineBase + path);
  }

  std::vector<std::string> parts = Components(path);
  if (parts.empty())
    return WithTrailingSlash(machineBase);
  std::string leaf = parts.back();
  if (leaf == "." || leaf == "Docking Station")
    return WithTrailingSlash(machineBase);
  return WithTrailingSlash(machineBase + leaf);
}

std::string ResolveAuxiliary(const std::string &configuredPath,
                             bool isMainDirectory,
                             const std::string &machineBase) {
  std::string path = Normalise(configuredPath);
  if (path.empty())
    return "";
  if (path[0] == '/')
    return WithTrailingSlash(path);
  if (!IsWindowsAbsolutePath(path))
    return WithTrailingSlash(machineBase + path);

  std::vector<std::string> parts = Components(path);
  if (parts.empty())
    return "";

  const std::string product = isMainDirectory
                                  ? parts.back()
                                  : (parts.size() >= 2
                                         ? parts[parts.size() - 2]
                                         : std::string());
  if (product.empty())
    return "";

  std::string result = machineBase + "../" + product;
  if (!isMainDirectory)
    result += "/" + parts.back();
  return WithTrailingSlash(result);
}

} // namespace ConfiguredPath
