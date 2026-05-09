// test_GenomeStore.cpp
// Unit tests for GenomeStore::CalculateGenerationNumber.
//
// This function parses the 3-digit generation prefix from parent moniker
// strings and computes the child's generation number. It is a static,
// pure function with no engine dependencies — ideal for unit testing.
//
// These tests protect against regression of the ASCII arithmetic bug
// where raw char values (e.g. '0'=48) were used instead of digit values,
// producing generation 5329 instead of 1 for moniker "001-...".

#include "engine/Creature/GenomeStore.h"
#include <gtest/gtest.h>

// ===========================================================================
// Engineered creatures: both seeds empty → generation 1
// ===========================================================================

TEST(GenomeStoreGenerationTest, BothSeedsEmpty_ReturnsOne) {
  // First-generation engineered creature: max(0,0)+1 = 1
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber("", ""), 1);
}

// ===========================================================================
// Clone: seed1 non-empty, seed2 empty → preserve seed1's generation
// ===========================================================================

TEST(GenomeStoreGenerationTest, Clone_PreservesGeneration) {
  // Clone of a generation-1 creature stays generation 1
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "001-aqua-hgru4-5fevv-aaz32-7npj8", ""), 1);
}

TEST(GenomeStoreGenerationTest, Clone_PreservesGeneration5) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "005-leaf-xxxxx-xxxxx-xxxxx-xxxxx", ""), 5);
}

TEST(GenomeStoreGenerationTest, Clone_PreservesGeneration0) {
  // Generation 0 is preserved during cloning (edge case)
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "000-test-xxxxx-xxxxx-xxxxx-xxxxx", ""), 0);
}

TEST(GenomeStoreGenerationTest, Clone_PreservesGeneration999) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "999-test-xxxxx-xxxxx-xxxxx-xxxxx", ""), 999);
}

// ===========================================================================
// Crossover: both seeds non-empty → max(gen1, gen2) + 1
// ===========================================================================

TEST(GenomeStoreGenerationTest, Crossover_MaxPlusOne) {
  // gen1=3, gen2=5 → max(3,5)+1 = 6
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "003-mum-xxxxx", "005-dad-xxxxx"), 6);
}

TEST(GenomeStoreGenerationTest, Crossover_EqualGenerations) {
  // gen1=2, gen2=2 → max(2,2)+1 = 3
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "002-mum-xxxxx", "002-dad-xxxxx"), 3);
}

TEST(GenomeStoreGenerationTest, Crossover_FirstParentHigher) {
  // gen1=10, gen2=3 → max(10,3)+1 = 11
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "010-mum-xxxxx", "003-dad-xxxxx"), 11);
}

TEST(GenomeStoreGenerationTest, Crossover_SecondParentHigher) {
  // gen1=1, gen2=7 → max(1,7)+1 = 8
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "001-mum-xxxxx", "007-dad-xxxxx"), 8);
}

TEST(GenomeStoreGenerationTest, Crossover_Generation0Parents) {
  // gen1=0, gen2=0 → max(0,0)+1 = 1
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "000-mum-xxxxx", "000-dad-xxxxx"), 1);
}

// ===========================================================================
// Clamping: generation capped at 999
// ===========================================================================

TEST(GenomeStoreGenerationTest, Crossover_ClampsAt999) {
  // gen1=999, gen2=999 → max(999,999)+1 = 1000 → clamped to 999
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "999-mum-xxxxx", "999-dad-xxxxx"), 999);
}

// ===========================================================================
// Short strings: monikers shorter than 3 chars → generation defaults to 0
// ===========================================================================

TEST(GenomeStoreGenerationTest, ShortSeed1_DefaultsToZero) {
  // seed1 has <3 chars → gen1=0; clone case → ownGen=0
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber("AB", ""), 0);
}

TEST(GenomeStoreGenerationTest, ShortSeed2_DefaultsToZero) {
  // seed1="001-...", seed2="XY" → gen1=1, gen2=0 → max(1,0)+1=2
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "001-test-xxxxx", "XY"), 2);
}

TEST(GenomeStoreGenerationTest, BothSeedsShort_ReturnsOne) {
  // Both seeds <3 chars → gen1=0, gen2=0, crossover → max(0,0)+1=1
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber("A", "B"), 1);
}

// ===========================================================================
// Specific regression: the exact moniker that triggered the ASCII bug
// ===========================================================================

TEST(GenomeStoreGenerationTest, Regression_StarterFamilyClone) {
  // This is the exact moniker from DS Starter Parent 1.family.
  // The old C2E_OLD_CPP_LIB code produced:
  //   '0'(48)*100 + '0'(48)*10 + '1'(49) = 5329 → clamped to 999
  // The fix should produce: 0*100 + 0*10 + 1 = 1
  int gen = GenomeStore::CalculateGenerationNumber(
      "001-aqua-hgru4-5fevv-aaz32-7npj8", "");
  EXPECT_EQ(gen, 1);
}

TEST(GenomeStoreGenerationTest, Regression_StarterFamilyClone2) {
  // DS Starter Parent 2.family moniker
  int gen = GenomeStore::CalculateGenerationNumber(
      "001-wind-trvxn-afcx4-5k2k6-7en76", "");
  EXPECT_EQ(gen, 1);
}

// ===========================================================================
// Leading zeros: verify correct decimal parsing of "010", "100", etc.
// ===========================================================================

TEST(GenomeStoreGenerationTest, LeadingZero_010_ParsesAs10) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "010-test-xxxxx", ""), 10);
}

TEST(GenomeStoreGenerationTest, LeadingZero_100_ParsesAs100) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "100-test-xxxxx", ""), 100);
}

TEST(GenomeStoreGenerationTest, AllZeros_ParsesAs0) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "000-test-xxxxx", ""), 0);
}

TEST(GenomeStoreGenerationTest, MaxDigits_999_ParsesAs999) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber(
      "999-test-xxxxx", ""), 999);
}

// ===========================================================================
// Exactly 3-char seed: just the generation prefix, no further content
// ===========================================================================

TEST(GenomeStoreGenerationTest, ExactlyThreeChars_ParsesCorrectly) {
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber("042", ""), 42);
}

TEST(GenomeStoreGenerationTest, ExactlyThreeChars_Crossover) {
  // gen1=42, gen2=13 → max(42,13)+1 = 43
  EXPECT_EQ(GenomeStore::CalculateGenerationNumber("042", "013"), 43);
}
