// test_GetFilesInDirectory.cpp
// Unit tests for the GetFilesInDirectory function (glob/wildcard matching).
//
// GetFilesInDirectory uses fnmatch() on macOS for pattern matching.
// These tests verify that various wildcard patterns (*.ext, prefix*, exact)
// correctly match files in a directory.

#include "engine/General.h"
#include <gtest/gtest.h>

#include <cstdio>
#include <fstream>
#include <string>
#include <sys/stat.h>
#include <vector>
#include <algorithm>

// ---------------------------------------------------------------------------
// Test fixture: creates a temp directory with test files
// ---------------------------------------------------------------------------
class GetFilesInDirectoryTest : public ::testing::Test {
protected:
  std::string tmpDir;

  void SetUp() override {
    tmpDir = "/tmp/test_getfiles_dir/";
    system(("rm -rf " + tmpDir).c_str());
    mkdir(tmpDir.c_str(), 0755);
  }

  void TearDown() override {
    system(("rm -rf " + tmpDir).c_str());
  }

  void CreateFile(const std::string &name) {
    std::string path = tmpDir + name;
    std::ofstream out(path.c_str());
    out << "test";
    out.close();
  }

  bool Contains(const std::vector<std::string> &files,
                const std::string &name) {
    return std::find(files.begin(), files.end(), name) != files.end();
  }
};

// ---------------------------------------------------------------------------
// Star-dot-extension patterns (*.gen, *.catalogue)
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, StarDotExt_MatchesExtension) {
  CreateFile("norn.astro.48.gen");
  CreateFile("gren.banshee.49.gen");
  CreateFile("norn.astro.48.gno");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "*.gen");

  EXPECT_EQ(files.size(), 2u);
  EXPECT_TRUE(Contains(files, "norn.astro.48.gen"));
  EXPECT_TRUE(Contains(files, "gren.banshee.49.gen"));
}

TEST_F(GetFilesInDirectoryTest, StarDotExt_NoMatches) {
  CreateFile("norn.astro.48.gen");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "*.txt");

  EXPECT_EQ(files.size(), 0u);
}

// ---------------------------------------------------------------------------
// Prefix-wildcard patterns (e*.gen, g*.gen) — the egg-layer pattern
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, PrefixWildcard_EttnPattern) {
  CreateFile("ettn.final46e.gen");
  CreateFile("norn.astro.48.gen");
  CreateFile("gren.banshee.49.gen");
  CreateFile("ettn.breedable.gen");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "e*.gen");

  EXPECT_EQ(files.size(), 2u);
  EXPECT_TRUE(Contains(files, "ettn.final46e.gen"));
  EXPECT_TRUE(Contains(files, "ettn.breedable.gen"));
}

TEST_F(GetFilesInDirectoryTest, PrefixWildcard_GrenPattern) {
  CreateFile("ettn.final.gen");
  CreateFile("norn.astro.gen");
  CreateFile("gren.banshee.49.gen");
  CreateFile("gren.jungle.gen");
  CreateFile("grendel_info.txt");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "g*.gen");

  EXPECT_EQ(files.size(), 2u);
  EXPECT_TRUE(Contains(files, "gren.banshee.49.gen"));
  EXPECT_TRUE(Contains(files, "gren.jungle.gen"));
}

TEST_F(GetFilesInDirectoryTest, PrefixWildcard_NoMatches) {
  CreateFile("norn.astro.gen");
  CreateFile("gren.banshee.gen");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "e*.gen");

  EXPECT_EQ(files.size(), 0u);
}

// ---------------------------------------------------------------------------
// Star (all files) pattern
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, Star_MatchesAllFiles) {
  CreateFile("a.txt");
  CreateFile("b.gen");
  CreateFile("c.catalogue");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "*");

  EXPECT_EQ(files.size(), 3u);
}

// ---------------------------------------------------------------------------
// Exact filename match (no wildcards)
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, ExactName_MatchesSingleFile) {
  CreateFile("Patch.catalogue");
  CreateFile("System.catalogue");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "Patch.catalogue");

  EXPECT_EQ(files.size(), 1u);
  EXPECT_TRUE(Contains(files, "Patch.catalogue"));
}

TEST_F(GetFilesInDirectoryTest, ExactName_NoMatch) {
  CreateFile("System.catalogue");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "Patch.catalogue");

  EXPECT_EQ(files.size(), 0u);
}

// ---------------------------------------------------------------------------
// Case-insensitive matching (FNM_CASEFOLD)
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, CaseInsensitive_ExtensionMatch) {
  CreateFile("test.GEN");
  CreateFile("test2.Gen");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "*.gen");

  // fnmatch with FNM_CASEFOLD should match case-insensitively
  EXPECT_EQ(files.size(), 2u);
}

TEST_F(GetFilesInDirectoryTest, CaseInsensitive_PrefixMatch) {
  CreateFile("Ettn.Final.gen");
  CreateFile("ETTN.upper.gen");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "e*.gen");

  EXPECT_EQ(files.size(), 2u);
}

// ---------------------------------------------------------------------------
// Empty directory
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, EmptyDirectory_ReturnsEmpty) {
  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "*.gen");

  EXPECT_EQ(files.size(), 0u);
}

// ---------------------------------------------------------------------------
// Non-existent directory
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, NonExistentDir_ReturnsFalse) {
  std::vector<std::string> files;
  bool result = GetFilesInDirectory("/tmp/no_such_dir_12345/", files, "*");

  EXPECT_FALSE(result);
  EXPECT_EQ(files.size(), 0u);
}

// ---------------------------------------------------------------------------
// Question-mark single-char wildcard
// ---------------------------------------------------------------------------

TEST_F(GetFilesInDirectoryTest, QuestionMark_SingleCharWildcard) {
  CreateFile("a1.gen");
  CreateFile("a2.gen");
  CreateFile("ab.gen");
  CreateFile("abc.gen");

  std::vector<std::string> files;
  GetFilesInDirectory(tmpDir, files, "a?.gen");

  EXPECT_EQ(files.size(), 3u);  // a1, a2, ab
  EXPECT_TRUE(Contains(files, "a1.gen"));
  EXPECT_TRUE(Contains(files, "a2.gen"));
  EXPECT_TRUE(Contains(files, "ab.gen"));
  EXPECT_FALSE(Contains(files, "abc.gen"));
}
