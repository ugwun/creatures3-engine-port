#include "engine/FilePath.h"
#include <gtest/gtest.h>

// Note: theApp is not initialized in these tests, so we must avoid methods
// that rely on it (like GetFullPath or the default constructor which sets
// checkLocallyFirst to true).

TEST(FilePathTest, Initialization) {
  // We pass false to checkLocallyFirst to avoid calling theApp methods
  FilePath fp("test_file.txt", 1, false);
  EXPECT_EQ(fp.GetFileName(), "test_file.txt");
  EXPECT_FALSE(fp.empty());
}

TEST(FilePathTest, EmptyPath) {
  FilePath fp("", 1, false);
  EXPECT_TRUE(fp.empty());
}

TEST(FilePathTest, SetExtension) {
  FilePath fp("image", 1, false);
  fp.SetExtension("png");
  EXPECT_EQ(fp.GetFileName(), "image.png");

  // Replacing an existing extension
  FilePath fp2("document.txt", 1, false);
  fp2.SetExtension("md");
  EXPECT_EQ(fp2.GetFileName(), "document.md");

  // Handling multiple dots
  FilePath fp3("archive.tar.gz", 1, false);
  fp3.SetExtension("bz2");
  EXPECT_EQ(fp3.GetFileName(), "archive.tar.bz2");
}

TEST(FilePathTest, EqualityOperators) {
  FilePath fp1("fileA.txt", 1, false);
  FilePath fp2("fileA.txt", 1, false);
  FilePath fp3("fileB.txt", 1, false);
  FilePath fp4("fileA.txt", 2, false);

  // Exact match
  EXPECT_TRUE(fp1 == fp2);
  // Different name
  EXPECT_TRUE(fp1 != fp3);
  // Different directory
  EXPECT_TRUE(fp1 != fp4);

  // Case insensitivity check (Windows historically was case insensitive)
  // FilePath currently uses CaseInsensitiveCompare for equality
  FilePath fp_upper("FILEA.TXT", 1, false);
  EXPECT_TRUE(fp1 == fp_upper);
}

TEST(FilePathTest, LessThanOperator) {
  FilePath fp1("a.txt", 1, false);
  FilePath fp2("b.txt", 1, false);
  FilePath fp3("a.txt", 2, false);

  // Same dir, different name
  EXPECT_TRUE(fp1 < fp2);
  // Different dir
  EXPECT_TRUE(fp1 < fp3);
}

TEST(FilePathTest, CaseInsensitiveCompare) {
  EXPECT_EQ(CaseInsensitiveCompare("abc", "ABC"), 0);
  EXPECT_EQ(CaseInsensitiveCompare("apple", "banana"), -1);
  EXPECT_EQ(CaseInsensitiveCompare("zebra", "apple"), 1);

  // Null ptrs
  EXPECT_EQ(CaseInsensitiveCompare(nullptr, nullptr), 0);
  EXPECT_EQ(CaseInsensitiveCompare(nullptr, "abc"), -1);
  EXPECT_EQ(CaseInsensitiveCompare("abc", nullptr), 1);

  // Different lengths
  EXPECT_EQ(CaseInsensitiveCompare("abc", "abcd"), -1);
  EXPECT_EQ(CaseInsensitiveCompare("abcd", "abc"), 1);
}

// =========================================================================
// STUBS FOR LINKER
// FilePath depends on parts of the engine. We mock them here to keep the
// unit test isolated to just the FilePath functionality.
// =========================================================================
#include "engine/App.h"
#include "engine/CreaturesArchive.h"
#ifndef _WIN32
#include "unix/FileFuncs.h"
#endif

// App dependencies
App theApp;
App::App() {}
App::~App() {}
bool App::GetWorldDirectoryVersion(int, std::string &, bool) { return false; }
bool App::GetWorldDirectoryVersion(const std::string &, std::string &, bool) {
  return false;
}
float App::GetTickRateFactor() { return 1.0f; }
int App::EorWolfValues(int, int) { return 0; }
void App::SetPassword(std::string &) {}
void App::RefreshGameVariables() {}
bool App::CreateNewWorld(std::string &) { return false; }
bool App::InitLocalisation() { return false; }
void App::SetScrolling(int, int, const std::vector<byte> *,
                       const std::vector<byte> *) {}
int App::GetZLibCompressionLevel() { return 6; }
CAOSVar &App::GetEameVar(const std::string &) {
  // CAOSVar is incomplete here — we return a dangling-but-never-deref'd ref.
  // test_FilePath never calls App::GetEameVar so this is safe.
  static char sCV[1];
  return *reinterpret_cast<CAOSVar *>(sCV);
}
bool Configurator::Flush() { return true; }
InputManager::InputManager() {}

// FileFunc dependencies
#ifndef _WIN32
bool FileExists(char const *) { return false; }
#endif

// General dependencies
char *BuildFsp(unsigned int, char const *, int, bool) { return nullptr; }

// CreaturesArchive dependencies
void CreaturesArchive::Read(std::string &) {}
void CreaturesArchive::Read(int &) {}
void CreaturesArchive::Write(std::string const &) {}
void CreaturesArchive::Write(int) {}
