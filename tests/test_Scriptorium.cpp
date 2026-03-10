// test_Scriptorium.cpp
// Unit tests for Scriptorium — the script install/find/zap store.
// No App / World / SDL dependencies.

#include "engine/Caos/MacroScript.h"
#include "engine/Caos/Scriptorium.h"
#include "engine/Classifier.h"
#include <gtest/gtest.h>

// ---------------------------------------------------------------------------
// Helper: create a tiny valid MacroScript with a given classifier.
// The bytecode is a single NOP (0x00 0x00) so MacroScript doesn't crash on
// construction but we never execute it.
// ---------------------------------------------------------------------------
static MacroScript *MakeScript(uint32 family, uint32 genus, uint32 species,
                               uint32 event) {
  static const unsigned char kNop[2] = {0, 0};
  auto *ms = new MacroScript(const_cast<unsigned char *>(kNop),
                             static_cast<int>(sizeof(kNop)));
  Classifier c(family, genus, species, event);
  ms->SetClassifier(c);
  return ms;
}

// ---------------------------------------------------------------------------
// Empty store
// ---------------------------------------------------------------------------

TEST(ScriptoriumTest, EmptyFindReturnsNull) {
  Scriptorium s;
  Classifier c(1, 2, 3, 4);
  EXPECT_EQ(s.FindScript(c), nullptr);
}

TEST(ScriptoriumTest, EmptyFindExactReturnsNull) {
  Scriptorium s;
  Classifier c(1, 2, 3, 4);
  EXPECT_EQ(s.FindScriptExact(c), nullptr);
}

// ---------------------------------------------------------------------------
// Install + FindExact
// ---------------------------------------------------------------------------

TEST(ScriptoriumTest, InstallAndFindExact) {
  Scriptorium s;
  MacroScript *ms = MakeScript(1, 2, 3, 4);
  EXPECT_TRUE(s.InstallScript(ms));

  Classifier c(1, 2, 3, 4);
  EXPECT_EQ(s.FindScriptExact(c), ms);
}

TEST(ScriptoriumTest, FindExactMismatchReturnsNull) {
  Scriptorium s;
  s.InstallScript(MakeScript(1, 2, 3, 4));

  Classifier c(1, 2, 3, 5); // different event
  EXPECT_EQ(s.FindScriptExact(c), nullptr);
}

// ---------------------------------------------------------------------------
// Wildcard fallback in FindScript
// ---------------------------------------------------------------------------

TEST(ScriptoriumTest, FindFallsBackToGenusLevel) {
  // Install a genus-level script (species=0 wildcard)
  Scriptorium s;
  MacroScript *genus_script = MakeScript(1, 2, 0, 9);
  s.InstallScript(genus_script);

  // Query for a specific species — should fall back to genus-level script
  Classifier query(1, 2, 7, 9);
  EXPECT_EQ(s.FindScript(query), genus_script);
}

TEST(ScriptoriumTest, FindFallsBackToFamilyLevel) {
  // Install a family-level script (genus=0, species=0)
  Scriptorium s;
  MacroScript *family_script = MakeScript(1, 0, 0, 9);
  s.InstallScript(family_script);

  // Query for a specific genus+species — should fall back to family-level
  // script
  Classifier query(1, 2, 3, 9);
  EXPECT_EQ(s.FindScript(query), family_script);
}

TEST(ScriptoriumTest, ExactScriptPreferredOverFallback) {
  Scriptorium s;
  MacroScript *exact = MakeScript(1, 2, 3, 9);
  MacroScript *family = MakeScript(1, 0, 0, 9);
  s.InstallScript(exact);
  s.InstallScript(family);

  Classifier query(1, 2, 3, 9);
  EXPECT_EQ(s.FindScript(query), exact);
}

// ---------------------------------------------------------------------------
// Replace existing script
// ---------------------------------------------------------------------------

TEST(ScriptoriumTest, ReinstallReplacesScript) {
  Scriptorium s;
  MacroScript *first = MakeScript(1, 2, 3, 4);
  MacroScript *second = MakeScript(1, 2, 3, 4); // same classifier

  s.InstallScript(first);
  // 'first' is now owned by Scriptorium; 'second' will replace it.
  EXPECT_TRUE(s.InstallScript(second));

  Classifier c(1, 2, 3, 4);
  EXPECT_EQ(s.FindScriptExact(c), second);
  // first has been deleted by the scriptorium — don't dereference it
}

// ---------------------------------------------------------------------------
// Zap (remove)
// ---------------------------------------------------------------------------

TEST(ScriptoriumTest, ZapRemovesScript) {
  Scriptorium s;
  s.InstallScript(MakeScript(1, 2, 3, 4));

  Classifier c(1, 2, 3, 4);
  EXPECT_TRUE(s.ZapScript(c));
  EXPECT_EQ(s.FindScriptExact(c), nullptr);
}

TEST(ScriptoriumTest, ZapNonExistentReturnsFalse) {
  // ZapScript on a missing classifier returns false (script not found)
  Scriptorium s;
  Classifier c(9, 9, 9, 9);
  EXPECT_FALSE(s.ZapScript(c));
}

// ---------------------------------------------------------------------------
// Dump IDs
// ---------------------------------------------------------------------------

TEST(ScriptoriumTest, DumpFamilyIDsAfterInstall) {
  Scriptorium s;
  s.InstallScript(MakeScript(2, 3, 4, 5));
  s.InstallScript(MakeScript(7, 1, 1, 1));

  IntegerSet families;
  s.DumpFamilyIDs(families);
  EXPECT_TRUE(families.count(2) > 0);
  EXPECT_TRUE(families.count(7) > 0);
  EXPECT_EQ(families.count(99), 0u);
}

TEST(ScriptoriumTest, DumpGenusIDsForFamily) {
  Scriptorium s;
  s.InstallScript(MakeScript(1, 10, 1, 1));
  s.InstallScript(MakeScript(1, 20, 1, 1));
  s.InstallScript(MakeScript(2, 30, 1, 1));

  IntegerSet genuses;
  s.DumpGenusIDs(genuses, 1);
  EXPECT_TRUE(genuses.count(10) > 0);
  EXPECT_TRUE(genuses.count(20) > 0);
  EXPECT_EQ(genuses.count(30), 0u); // family 2, not 1
}

TEST(ScriptoriumTest, ClearEmptiesScriptorium) {
  Scriptorium s;
  s.InstallScript(MakeScript(1, 2, 3, 4));
  s.Clear();

  IntegerSet families;
  s.DumpFamilyIDs(families);
  EXPECT_TRUE(families.empty());
  EXPECT_EQ(s.FindScriptExact(Classifier(1, 2, 3, 4)), nullptr);
}
