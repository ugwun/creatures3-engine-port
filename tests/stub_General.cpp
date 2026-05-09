// stub_General.cpp
// Minimal stub providing only GetFilesInDirectory and GetDirsInDirectory
// for unit testing, without the full General.cpp engine dependencies.

#include "engine/General.h"

#include <algorithm>
#include <cstring>
#include <dirent.h>
#include <fnmatch.h>
#include <sys/stat.h>

bool GetFilesInDirectory(const std::string &path,
                         std::vector<std::string> &files,
                         const std::string &wildcard) {
  DIR *dir;
  struct dirent *ent;
  if ((dir = opendir(path.c_str())) != NULL) {
    while ((ent = readdir(dir)) != NULL) {
      if (ent->d_type == DT_REG || ent->d_type == DT_UNKNOWN ||
          ent->d_type == DT_LNK) {
        if (wildcard == "*") {
          files.push_back(ent->d_name);
        } else {
          // Use fnmatch for glob matching (handles *.ext, e*.gen, etc.)
          // FNM_CASEFOLD for case-insensitive matching like Windows FindFirstFile
          if (fnmatch(wildcard.c_str(), ent->d_name, FNM_CASEFOLD) == 0) {
            files.push_back(ent->d_name);
          }
        }
      }
    }
    closedir(dir);
    return true;
  }
  return false;
}

bool GetDirsInDirectory(const std::string &path,
                        std::vector<std::string> &dirs) {
  DIR *dir;
  struct dirent *ent;
  if ((dir = opendir(path.c_str())) != NULL) {
    while ((ent = readdir(dir)) != NULL) {
      if (ent->d_type == DT_DIR || ent->d_type == DT_UNKNOWN ||
          ent->d_type == DT_LNK) {
        if (strcmp(ent->d_name, ".") != 0 && strcmp(ent->d_name, "..") != 0)
          dirs.push_back(ent->d_name);
      }
    }
    closedir(dir);
    return true;
  }
  return false;
}
