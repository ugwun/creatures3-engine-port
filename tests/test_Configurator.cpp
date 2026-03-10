// test_Configurator.cpp
// Unit tests for the Configurator (INI-style config file handler).
//
// Configurator is fully self-contained (no engine dependencies).
// Tests use temp files in /tmp/.

#include "common/Configurator.h"
#include <gtest/gtest.h>

#include <cstdio>
#include <fstream>
#include <string>

// ---------------------------------------------------------------------------
// Helper: write a string to a temp file, return the path
// ---------------------------------------------------------------------------
static std::string WriteTempFile(const std::string &name,
                                 const std::string &content) {
  std::string path = std::string("/tmp/test_configurator_") + name;
  std::ofstream out(path.c_str());
  out << content;
  out.close();
  return path;
}

// Helper: clean up temp file
static void RemoveTempFile(const std::string &path) {
  std::remove(path.c_str());
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

TEST(ConfiguratorTest, DefaultConstruction_IsEmpty) {
  Configurator c;
  EXPECT_FALSE(c.Exists("anything"));
}

// ---------------------------------------------------------------------------
// BindToFile — basic parsing
// ---------------------------------------------------------------------------

TEST(ConfiguratorTest, BindToFile_SimpleKeyValue) {
  std::string path = WriteTempFile("simple.cfg", "mykey myvalue\n");
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_TRUE(c.Exists("mykey"));
  EXPECT_EQ(c.Get("mykey"), "myvalue");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, BindToFile_MultipleKeys) {
  std::string path =
      WriteTempFile("multi.cfg", "alpha one\nbeta two\ngamma three\n");
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_EQ(c.Get("alpha"), "one");
  EXPECT_EQ(c.Get("beta"), "two");
  EXPECT_EQ(c.Get("gamma"), "three");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, BindToFile_QuotedStrings) {
  std::string path = WriteTempFile("quoted.cfg", "greeting \"hello world\"\n"
                                                 "path \"/usr/local/bin\"\n");
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_EQ(c.Get("greeting"), "hello world");
  EXPECT_EQ(c.Get("path"), "/usr/local/bin");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, BindToFile_EscapeSequences) {
  // Config file contains: esctest "line1\nline2\ttab\\backslash"
  // The Configurator parser interprets \n, \t, \\ within quoted values.
  std::string content = R"(esctest "line1\nline2\ttab\\backslash")";
  content += "\n";
  std::string path = WriteTempFile("escape.cfg", content);
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_EQ(c.Get("esctest"), "line1\nline2\ttab\\backslash");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, BindToFile_CommentsIgnored) {
  std::string path =
      WriteTempFile("comments.cfg", "# this is a comment\n"
                                    "key1 val1 # inline comment\n"
                                    "   # another pure comment\n"
                                    "key2 val2\n");
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_EQ(c.Get("key1"), "val1");
  EXPECT_EQ(c.Get("key2"), "val2");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, BindToFile_EmptyFile) {
  std::string path = WriteTempFile("empty.cfg", "");
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_FALSE(c.Exists("anything"));
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, BindToFile_NonExistentFile_NotAnError) {
  Configurator c;
  EXPECT_TRUE(c.BindToFile("/tmp/test_configurator_does_not_exist.cfg"));
  EXPECT_FALSE(c.Exists("anything"));
}

TEST(ConfiguratorTest, BindToFile_BlankLines) {
  std::string path =
      WriteTempFile("blanks.cfg", "\n\n  \n\t\nkey1 val1\n\nkey2 val2\n\n");
  Configurator c;
  ASSERT_TRUE(c.BindToFile(path));
  EXPECT_EQ(c.Get("key1"), "val1");
  EXPECT_EQ(c.Get("key2"), "val2");
  RemoveTempFile(path);
}

// ---------------------------------------------------------------------------
// Get / Set
// ---------------------------------------------------------------------------

TEST(ConfiguratorTest, SetAndGetString) {
  std::string path = WriteTempFile("setget.cfg", "");
  Configurator c;
  c.BindToFile(path);
  c.Set("newkey", "newvalue");
  EXPECT_EQ(c.Get("newkey"), "newvalue");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, SetAndGetInt) {
  std::string path = WriteTempFile("setgetint.cfg", "");
  Configurator c;
  c.BindToFile(path);
  c.Set("count", 42);
  int val = 0;
  c.Get("count", val);
  EXPECT_EQ(val, 42);
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, GetNonExistent_ReturnsEmpty) {
  std::string path = WriteTempFile("noexist.cfg", "key1 val1\n");
  Configurator c;
  c.BindToFile(path);
  EXPECT_EQ(c.Get("missing"), "");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, GetInt_NonExistent_LeavesUnchanged) {
  std::string path = WriteTempFile("noint.cfg", "");
  Configurator c;
  c.BindToFile(path);
  int val = 99;
  c.Get("missing", val);
  EXPECT_EQ(val, 99); // should remain unchanged
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, SetOverwritesExisting) {
  std::string path = WriteTempFile("overwrite.cfg", "key1 original\n");
  Configurator c;
  c.BindToFile(path);
  EXPECT_EQ(c.Get("key1"), "original");
  c.Set("key1", "updated");
  EXPECT_EQ(c.Get("key1"), "updated");
  RemoveTempFile(path);
}

// ---------------------------------------------------------------------------
// Exists / Zap
// ---------------------------------------------------------------------------

TEST(ConfiguratorTest, ExistsTrueForSetKey) {
  std::string path = WriteTempFile("exists.cfg", "present yes\n");
  Configurator c;
  c.BindToFile(path);
  EXPECT_TRUE(c.Exists("present"));
  EXPECT_FALSE(c.Exists("absent"));
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, ZapRemovesKey) {
  std::string path = WriteTempFile("zap.cfg", "toremove val\n");
  Configurator c;
  c.BindToFile(path);
  EXPECT_TRUE(c.Exists("toremove"));
  c.Zap("toremove");
  EXPECT_FALSE(c.Exists("toremove"));
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, ZapNonExistent_NoOp) {
  std::string path = WriteTempFile("zapno.cfg", "");
  Configurator c;
  c.BindToFile(path);
  c.Zap("ghost"); // should not crash
  RemoveTempFile(path);
}

// ---------------------------------------------------------------------------
// Flush — round-trip
// ---------------------------------------------------------------------------

TEST(ConfiguratorTest, FlushAndReload_PreservesValues) {
  std::string path = WriteTempFile("roundtrip.cfg", "");

  {
    Configurator c;
    c.BindToFile(path);
    c.Set("name", "Creatures");
    c.Set("version", "3");
    c.Flush();
  }

  // Reload from the flushed file
  Configurator c2;
  ASSERT_TRUE(c2.BindToFile(path));
  EXPECT_EQ(c2.Get("name"), "Creatures");
  EXPECT_EQ(c2.Get("version"), "3");
  RemoveTempFile(path);
}

TEST(ConfiguratorTest, FlushWithQuotableValues_RoundTrips) {
  std::string path = WriteTempFile("quotert.cfg", "");

  {
    Configurator c;
    c.BindToFile(path);
    c.Set("greeting", "hello world"); // contains space → needs quoting
    c.Flush();
  }

  Configurator c2;
  ASSERT_TRUE(c2.BindToFile(path));
  EXPECT_EQ(c2.Get("greeting"), "hello world");
  RemoveTempFile(path);
}
