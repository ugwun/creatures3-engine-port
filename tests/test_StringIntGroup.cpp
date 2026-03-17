// test_StringIntGroup.cpp
// Unit tests for StringIntGroup binary format parsing.
//
// Validates that StringIntGroup correctly deserializes PRAY chunk tag data
// when using std::istringstream (the fixed code path) versus raw char arrays.

#include "PRAYFiles/StringIntGroup.h"
#include <gtest/gtest.h>
#include <cstring>
#include <sstream>
#include <vector>

// Helper: write a little-endian 32-bit int to a buffer
static void WriteLE32(std::vector<char> &buf, int32_t val) {
  const char *p = reinterpret_cast<const char *>(&val);
  buf.insert(buf.end(), p, p + 4);
}

// Helper: write a length-prefixed string to a buffer
static void WritePrefixedString(std::vector<char> &buf, const std::string &s) {
  WriteLE32(buf, static_cast<int32_t>(s.size()));
  buf.insert(buf.end(), s.begin(), s.end());
}

// Build a complete StringIntGroup binary blob with the given int and string maps.
static std::vector<char> BuildSIGBlob(
    const std::vector<std::pair<std::string, int>> &ints,
    const std::vector<std::pair<std::string, std::string>> &strings) {
  std::vector<char> buf;

  // Int map
  WriteLE32(buf, static_cast<int32_t>(ints.size()));
  for (auto &kv : ints) {
    WritePrefixedString(buf, kv.first);
    WriteLE32(buf, kv.second);
  }

  // String map
  WriteLE32(buf, static_cast<int32_t>(strings.size()));
  for (auto &kv : strings) {
    WritePrefixedString(buf, kv.first);
    WritePrefixedString(buf, kv.second);
  }

  return buf;
}

// ==========================================================================
// Basic parsing with istringstream
// ==========================================================================

TEST(StringIntGroupTest, ParseInts_FromIstringstream) {
  auto blob = BuildSIGBlob(
      {{"Agent Type", 0}, {"Script Count", 3}},
      {});

  std::string data(blob.begin(), blob.end());
  std::istringstream ist(data);
  StringIntGroup sig(ist);

  int val = -1;
  EXPECT_TRUE(sig.FindInt("Agent Type", val));
  EXPECT_EQ(val, 0);

  EXPECT_TRUE(sig.FindInt("Script Count", val));
  EXPECT_EQ(val, 3);

  EXPECT_FALSE(sig.FindInt("Nonexistent", val));
}

TEST(StringIntGroupTest, ParseStrings_FromIstringstream) {
  auto blob = BuildSIGBlob(
      {{"Agent Type", 0}, {"Script Count", 1}},
      {{"Script 1", "scrp 1 2 3 4\n  inst\nendm\n"},
       {"Agent Description", "A test agent"}});

  std::string data(blob.begin(), blob.end());
  std::istringstream ist(data);
  StringIntGroup sig(ist);

  std::string val;
  EXPECT_TRUE(sig.FindString("Script 1", val));
  EXPECT_EQ(val, "scrp 1 2 3 4\n  inst\nendm\n");

  EXPECT_TRUE(sig.FindString("Agent Description", val));
  EXPECT_EQ(val, "A test agent");

  EXPECT_FALSE(sig.FindString("Nonexistent", val));
}

TEST(StringIntGroupTest, EmptyMaps) {
  auto blob = BuildSIGBlob({}, {});

  std::string data(blob.begin(), blob.end());
  std::istringstream ist(data);
  StringIntGroup sig(ist);

  int ival;
  EXPECT_FALSE(sig.FindInt("anything", ival));

  std::string sval;
  EXPECT_FALSE(sig.FindString("anything", sval));
}

TEST(StringIntGroupTest, MixedIntAndString_TypicalAgent) {
  // Simulate a typical DSAG chunk with Agent Type, Script Count,
  // and a Script 1 entry — the exact pattern used by Beach Ball.
  auto blob = BuildSIGBlob(
      {{"Agent Type", 0},
       {"Dependency Count", 1},
       {"Dependency Category 1", 2},
       {"Script Count", 1}},
      {{"Agent Description", "Big bouncy beach ball."},
       {"Agent Animation File", "beachball.c16"},
       {"Dependency 1", "beachball.c16"},
       {"Script 1", "inst\nnew: simp 2 3 4 \"beachball\" 1 0 0\nendm\n"}});

  std::string data(blob.begin(), blob.end());
  std::istringstream ist(data);
  StringIntGroup sig(ist);

  // Verify all int tags
  int val;
  EXPECT_TRUE(sig.FindInt("Agent Type", val));
  EXPECT_EQ(val, 0);
  EXPECT_TRUE(sig.FindInt("Script Count", val));
  EXPECT_EQ(val, 1);
  EXPECT_TRUE(sig.FindInt("Dependency Count", val));
  EXPECT_EQ(val, 1);
  EXPECT_TRUE(sig.FindInt("Dependency Category 1", val));
  EXPECT_EQ(val, 2);

  // Verify all string tags
  std::string sval;
  EXPECT_TRUE(sig.FindString("Script 1", sval));
  EXPECT_EQ(sval, "inst\nnew: simp 2 3 4 \"beachball\" 1 0 0\nendm\n");
  EXPECT_TRUE(sig.FindString("Agent Description", sval));
  EXPECT_EQ(sval, "Big bouncy beach ball.");
  EXPECT_TRUE(sig.FindString("Agent Animation File", sval));
  EXPECT_EQ(sval, "beachball.c16");
}

// ==========================================================================
// SaveToStream round-trip
// ==========================================================================

TEST(StringIntGroupTest, SaveToStream_Roundtrip) {
  StringIntGroup sig;
  sig.AddInt("Agent Type", 5);
  sig.AddInt("Script Count", 2);
  sig.AddString("Script 1", "scrp 1\nendm\n");
  sig.AddString("Script 2", "scrp 2\nendm\n");

  // Save
  std::ostringstream ost;
  sig.SaveToStream(ost);
  std::string saved = ost.str();

  // Reload
  std::istringstream ist(saved);
  StringIntGroup sig2(ist);

  int ival;
  EXPECT_TRUE(sig2.FindInt("Agent Type", ival));
  EXPECT_EQ(ival, 5);
  EXPECT_TRUE(sig2.FindInt("Script Count", ival));
  EXPECT_EQ(ival, 2);

  std::string sval;
  EXPECT_TRUE(sig2.FindString("Script 1", sval));
  EXPECT_EQ(sval, "scrp 1\nendm\n");
  EXPECT_TRUE(sig2.FindString("Script 2", sval));
  EXPECT_EQ(sval, "scrp 2\nendm\n");
}
