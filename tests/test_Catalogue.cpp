// test_Catalogue.cpp
// Unit tests for the Catalogue (localised string table).
//
// Catalogue depends on SimpleLexer and FileLocaliser. We test it by writing
// real .catalogue files to /tmp/ and using AddDir() with language "en".

#include "common/Catalogue.h"
#include <gtest/gtest.h>

#include <cstdio>
#include <fstream>
#include <string>
#include <sys/stat.h>

// ---------------------------------------------------------------------------
// Test fixture: creates a temp directory with catalogue files
// ---------------------------------------------------------------------------
class CatalogueTest : public ::testing::Test {
protected:
  std::string tmpDir;

  void SetUp() override {
    tmpDir = "/tmp/test_catalogue_dir";
    // Clean any leftover files from previous test runs
    system(("rm -f " + tmpDir + "/*.catalogue 2>/dev/null").c_str());
    mkdir(tmpDir.c_str(), 0755);
  }

  void TearDown() override {
    // Clean up files we created
    for (auto &f : createdFiles) {
      std::remove(f.c_str());
    }
    rmdir(tmpDir.c_str());
  }

  // Write a .catalogue file to the temp dir, return full path
  std::string WriteCatalogueFile(const std::string &name,
                                 const std::string &content) {
    std::string path = tmpDir + "/" + name;
    std::ofstream out(path.c_str());
    out << content;
    out.close();
    createdFiles.push_back(path);
    return path;
  }

private:
  std::vector<std::string> createdFiles;
};

// ---------------------------------------------------------------------------
// TAG parsing
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, SingleTag_GetByOffset) {
  WriteCatalogueFile("test1.catalogue", "TAG \"greeting\"\n"
                                        "\"Hello\"\n"
                                        "\"World\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  EXPECT_TRUE(cat.TagPresent("greeting"));
  EXPECT_STREQ(cat.Get("greeting", 0), "Hello");
  EXPECT_STREQ(cat.Get("greeting", 1), "World");
}

TEST_F(CatalogueTest, TagArrayCount) {
  WriteCatalogueFile("test_count.catalogue", "TAG \"items\"\n"
                                             "\"apple\"\n"
                                             "\"banana\"\n"
                                             "\"cherry\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  EXPECT_EQ(cat.GetArrayCountForTag("items"), 3);
}

// ---------------------------------------------------------------------------
// ARRAY parsing
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, ArrayTag_WithExplicitCount) {
  WriteCatalogueFile("array.catalogue", "ARRAY \"colors\" 3\n"
                                        "\"red\"\n"
                                        "\"green\"\n"
                                        "\"blue\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  EXPECT_TRUE(cat.TagPresent("colors"));
  EXPECT_EQ(cat.GetArrayCountForTag("colors"), 3);
  EXPECT_STREQ(cat.Get("colors", 0), "red");
  EXPECT_STREQ(cat.Get("colors", 1), "green");
  EXPECT_STREQ(cat.Get("colors", 2), "blue");
}

// ---------------------------------------------------------------------------
// Multiple tags
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, MultipleTags_InOneFile) {
  WriteCatalogueFile("multi.catalogue", "TAG \"greetings\"\n"
                                        "\"Hi\"\n"
                                        "\"Hey\"\n"
                                        "TAG \"farewells\"\n"
                                        "\"Bye\"\n"
                                        "\"See ya\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  EXPECT_TRUE(cat.TagPresent("greetings"));
  EXPECT_TRUE(cat.TagPresent("farewells"));
  EXPECT_STREQ(cat.Get("greetings", 0), "Hi");
  EXPECT_STREQ(cat.Get("greetings", 1), "Hey");
  EXPECT_STREQ(cat.Get("farewells", 0), "Bye");
  EXPECT_STREQ(cat.Get("farewells", 1), "See ya");
}

// ---------------------------------------------------------------------------
// TagPresent
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, TagPresent_False_ForUnknown) {
  Catalogue cat;
  EXPECT_FALSE(cat.TagPresent("nonexistent"));
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, Get_UnknownTag_Throws) {
  Catalogue cat;
  EXPECT_THROW(cat.Get("no_such_tag", 0), Catalogue::Err);
}

TEST_F(CatalogueTest, Get_OutOfRange_Throws) {
  WriteCatalogueFile("range.catalogue", "TAG \"small\"\n"
                                        "\"only_one\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  // offset 0 is fine
  EXPECT_STREQ(cat.Get("small", 0), "only_one");
  // offset 1 is out of range
  EXPECT_THROW(cat.Get("small", 1), Catalogue::Err);
}

TEST_F(CatalogueTest, GetArrayCountForTag_UnknownTag_Throws) {
  Catalogue cat;
  EXPECT_THROW(cat.GetArrayCountForTag("missing"), Catalogue::Err);
}

// ---------------------------------------------------------------------------
// TAG OVERRIDE
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, TagOverride_ReplacesStrings) {
  WriteCatalogueFile("base.catalogue", "TAG \"version\"\n"
                                       "\"1.0\"\n");

  WriteCatalogueFile("patch.catalogue", "TAG OVERRIDE \"version\"\n"
                                        "\"2.0\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  EXPECT_STREQ(cat.Get("version", 0), "2.0");
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, Clear_RemovesEverything) {
  WriteCatalogueFile("toclear.catalogue", "TAG \"stuff\"\n"
                                          "\"data\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");
  EXPECT_TRUE(cat.TagPresent("stuff"));

  cat.Clear();
  EXPECT_FALSE(cat.TagPresent("stuff"));
}

// ---------------------------------------------------------------------------
// Empty catalogue
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, EmptyCatalogue_NoTags) {
  Catalogue cat;
  EXPECT_FALSE(cat.TagPresent("anything"));
}

// ---------------------------------------------------------------------------
// Duplicate tags (last-write-wins)
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, DuplicateTag_LastWriteWins) {
  WriteCatalogueFile("dup.catalogue", "TAG \"ver\"\n"
                                      "\"old_version\"\n"
                                      "TAG \"ver\"\n"
                                      "\"new_version\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  // The second definition should win
  EXPECT_STREQ(cat.Get("ver", 0), "new_version");
  EXPECT_EQ(cat.GetArrayCountForTag("ver"), 1);
}

// ---------------------------------------------------------------------------
// ARRAY with mismatched count
// ---------------------------------------------------------------------------

TEST_F(CatalogueTest, ArrayMismatchedCount_Throws) {
  WriteCatalogueFile("mismatch.catalogue", "ARRAY \"wrong\" 5\n"
                                           "\"only\"\n"
                                           "\"two\"\n");

  Catalogue cat;
  EXPECT_THROW(cat.AddDir(tmpDir, "en"), Catalogue::Err);
}

// ---------------------------------------------------------------------------
// OVERRIDE must not corrupt adjacent tags
// ---------------------------------------------------------------------------

// Regression test: when a later file overrides a tag, the strings of other
// tags defined after the overridden tag in the *original* file must NOT be
// corrupted.  This reproduces the exact bug where zz_ds_grendel_upgrade
// overriding "Grendel Male Embryo" (from voices.catalogue) caused voice
// hex data to overwrite "Agent Categories" string slots.
TEST_F(CatalogueTest, Override_DoesNotCorruptAdjacentTags) {
  // File A defines tag "alpha" then "beta" (loaded first alphabetically)
  WriteCatalogueFile("a_first.catalogue",
                     "TAG \"alpha\"\n"
                     "\"alpha_old_1\"\n"
                     "\"alpha_old_2\"\n"
                     "TAG \"beta\"\n"
                     "\"beta_1\"\n"
                     "\"beta_2\"\n"
                     "\"beta_3\"\n");

  // File Z overrides "alpha" and adds more strings after it
  WriteCatalogueFile("z_last.catalogue",
                     "TAG OVERRIDE \"alpha\"\n"
                     "\"alpha_new_1\"\n"
                     "\"alpha_new_2\"\n"
                     "TAG \"gamma\"\n"
                     "\"gamma_1\"\n"
                     "\"gamma_2\"\n"
                     "\"gamma_3\"\n"
                     "\"gamma_4\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  // alpha should be updated
  EXPECT_STREQ(cat.Get("alpha", 0), "alpha_new_1");
  EXPECT_STREQ(cat.Get("alpha", 1), "alpha_new_2");

  // beta must NOT be corrupted by gamma's strings
  EXPECT_STREQ(cat.Get("beta", 0), "beta_1");
  EXPECT_STREQ(cat.Get("beta", 1), "beta_2");
  EXPECT_STREQ(cat.Get("beta", 2), "beta_3");

  // gamma should be correct
  EXPECT_STREQ(cat.Get("gamma", 0), "gamma_1");
}

TEST_F(CatalogueTest, ArrayOverride_DoesNotCorruptAdjacentArrays) {
  // File A: defines two arrays
  WriteCatalogueFile("a_arrays.catalogue",
                     "ARRAY \"categories\" 3\n"
                     "\"self\"\n"
                     "\"hand\"\n"
                     "\"door\"\n"
                     "ARRAY \"classifiers\" 3\n"
                     "\"999 999 999\"\n"
                     "\"2 1 0\"\n"
                     "\"2 2 0\"\n");

  // File Z: overrides categories, adds a new large array after
  WriteCatalogueFile("z_upgrade.catalogue",
                     "ARRAY OVERRIDE \"categories\" 3\n"
                     "\"SELF\"\n"
                     "\"HAND\"\n"
                     "\"DOOR\"\n"
                     "TAG \"voices\"\n"
                     "\"deadbeef\"\n"
                     "\"cafebabe\"\n"
                     "\"12345678\"\n"
                     "\"abcdef01\"\n");

  Catalogue cat;
  cat.AddDir(tmpDir, "en");

  // categories should have 3 entries (either old or new depending on load order)
  EXPECT_EQ(cat.GetArrayCountForTag("categories"), 3);

  // THE KEY INVARIANT: classifiers must NOT be corrupted by voice data
  EXPECT_STREQ(cat.Get("classifiers", 0), "999 999 999");
  EXPECT_STREQ(cat.Get("classifiers", 1), "2 1 0");
  EXPECT_STREQ(cat.Get("classifiers", 2), "2 2 0");
}
