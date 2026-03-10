// stub_FilePath.cpp
// Minimal stub for FilePath class non-inline methods, for test_Genome.
// The default constructor is inline in FilePath.h and must NOT be redefined.
// All methods just return empty values — they are never called by the
// Genome byte-array tests.

#include "engine/FilePath.h"

FilePath::FilePath(std::string name, int directory, bool, bool)
    : myDirectory(directory), myName(name),
      myUseLocalWorldDirectoryVersionOfTheFile(false) {}

FilePath::FilePath(DWORD, char const *ext, int directory)
    : myDirectory(directory), myName(ext ? ext : ""),
      myUseLocalWorldDirectoryVersionOfTheFile(false) {}

void FilePath::SetFilePath(std::string name, int directory) {
  myName = name;
  myDirectory = directory;
}

bool FilePath::GetWorldDirectoryVersionOfTheFile(std::string &, bool) const {
  return false;
}

std::string FilePath::GetFullPath() const { return myName; }
std::string FilePath::GetFileName() const { return myName; }
void FilePath::SetExtension(std::string) {}

CreaturesArchive &operator<<(CreaturesArchive &ar, FilePath const &) {
  return ar;
}
CreaturesArchive &operator>>(CreaturesArchive &ar, FilePath &) { return ar; }
bool operator==(FilePath const &l, FilePath const &r) {
  return l.GetFullPath() == r.GetFullPath();
}
bool operator!=(FilePath const &l, FilePath const &r) { return !(l == r); }
bool operator<(FilePath const &l, FilePath const &r) {
  return l.GetFullPath() < r.GetFullPath();
}
