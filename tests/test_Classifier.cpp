// test_Classifier.cpp
// Unit tests for the Classifier (family/genus/species/event) type.
//
// We define _CAOSDEBUGGER to exclude StreamAgentNameIfAvailable(), which
// calls theCatalogue and would drag in the full Catalogue subsystem.

#include "engine/Classifier.h"
#include <gtest/gtest.h>

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

TEST(ClassifierTest, DefaultConstruction) {
  Classifier c;
  EXPECT_EQ(c.Family(), 0u);
  EXPECT_EQ(c.Genus(), 0u);
  EXPECT_EQ(c.Species(), 0u);
  EXPECT_EQ(c.Event(), 0u);
}

TEST(ClassifierTest, ParameterisedConstruction) {
  Classifier c(1, 2, 3, 4);
  EXPECT_EQ(c.Family(), 1u);
  EXPECT_EQ(c.Genus(), 2u);
  EXPECT_EQ(c.Species(), 3u);
  EXPECT_EQ(c.Event(), 4u);
}

TEST(ClassifierTest, CopyConstruction) {
  Classifier a(5, 6, 7, 8);
  Classifier b(a);
  EXPECT_EQ(b.Family(), 5u);
  EXPECT_EQ(b.Genus(), 6u);
  EXPECT_EQ(b.Species(), 7u);
  EXPECT_EQ(b.Event(), 8u);
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

TEST(ClassifierTest, EqualityExact) {
  Classifier a(1, 2, 3, 4);
  Classifier b(1, 2, 3, 4);
  EXPECT_TRUE(a == b);
}

TEST(ClassifierTest, EqualityFamilyMismatch) {
  Classifier a(1, 2, 3, 4);
  Classifier b(9, 2, 3, 4);
  EXPECT_FALSE(a == b);
}

TEST(ClassifierTest, EqualityGenusMismatch) {
  EXPECT_FALSE(Classifier(1, 2, 3, 4) == Classifier(1, 9, 3, 4));
}

TEST(ClassifierTest, EqualitySpeciesMismatch) {
  EXPECT_FALSE(Classifier(1, 2, 3, 4) == Classifier(1, 2, 9, 4));
}

TEST(ClassifierTest, EqualityEventMismatch) {
  EXPECT_FALSE(Classifier(1, 2, 3, 4) == Classifier(1, 2, 3, 9));
}

// ---------------------------------------------------------------------------
// Ordering (operator<)
// ---------------------------------------------------------------------------

TEST(ClassifierTest, LessThanByFamily) {
  Classifier lo(1, 0, 0, 0);
  Classifier hi(2, 0, 0, 0);
  EXPECT_TRUE(lo < hi);
  EXPECT_FALSE(hi < lo);
}

TEST(ClassifierTest, LessThanByGenus) {
  Classifier lo(1, 1, 0, 0);
  Classifier hi(1, 2, 0, 0);
  EXPECT_TRUE(lo < hi);
}

TEST(ClassifierTest, LessThanBySpecies) {
  Classifier lo(1, 1, 1, 0);
  Classifier hi(1, 1, 2, 0);
  EXPECT_TRUE(lo < hi);
}

TEST(ClassifierTest, LessThanByEvent) {
  Classifier lo(1, 1, 1, 1);
  Classifier hi(1, 1, 1, 2);
  EXPECT_TRUE(lo < hi);
}

TEST(ClassifierTest, EqualClassifiersNotLessThan) {
  Classifier a(3, 3, 3, 3);
  Classifier b(3, 3, 3, 3);
  EXPECT_FALSE(a < b);
  EXPECT_FALSE(b < a);
}

// ---------------------------------------------------------------------------
// Wildcard matching
// ---------------------------------------------------------------------------

TEST(ClassifierTest, WildcardZeroGenusMatches) {
  // query has genus=0 (wildcard) → matches any genus in target
  Classifier target(1, 5, 3, 9);
  Classifier query(1, 0, 3, 9); // genus=0 is wildcard
  EXPECT_TRUE(target.GenericMatchForWildCard(query));
}

TEST(ClassifierTest, WildcardZeroSpeciesMatches) {
  Classifier target(1, 2, 7, 9);
  Classifier query(1, 2, 0, 9);
  EXPECT_TRUE(target.GenericMatchForWildCard(query));
}

TEST(ClassifierTest, WildcardAllZerosMatchesAnything) {
  Classifier target(4, 5, 6, 7);
  Classifier query(0, 0, 0, 0);
  EXPECT_TRUE(target.GenericMatchForWildCard(query));
}

TEST(ClassifierTest, WildcardMismatchFails) {
  Classifier target(1, 2, 3, 9);
  Classifier query(2, 2, 3, 9); // family=2 ≠ 1 and not a wildcard
  EXPECT_FALSE(target.GenericMatchForWildCard(query));
}

TEST(ClassifierTest, WildcardDisabledFieldIgnored) {
  Classifier target(1, 2, 3, 9);
  Classifier query(1, 99, 3, 9); // mismatch in genus, but bGenus=FALSE
  // passing bGenus=FALSE means genus field is not checked
  EXPECT_TRUE(target.GenericMatchForWildCard(
      query,
      /*bFamily=*/TRUE, /*bGenus=*/FALSE, /*bSpecies=*/TRUE, /*bEvent=*/TRUE));
}

// ---------------------------------------------------------------------------
// Generic variant helpers
// ---------------------------------------------------------------------------

TEST(ClassifierTest, GenericSpeciesClearsSpecies) {
  Classifier c(1, 2, 3, 4);
  Classifier g = c.GenericSpecies();
  EXPECT_EQ(g.Family(), 1u);
  EXPECT_EQ(g.Genus(), 2u);
  EXPECT_EQ(g.Species(), 0u);
  EXPECT_EQ(g.Event(), 4u);
}

TEST(ClassifierTest, GenericGenusClearsGenus) {
  Classifier c(1, 2, 3, 4);
  Classifier g = c.GenericGenus();
  EXPECT_EQ(g.Family(), 1u);
  EXPECT_EQ(g.Genus(), 0u);
  EXPECT_EQ(g.Species(), 3u);
  EXPECT_EQ(g.Event(), 4u);
}

TEST(ClassifierTest, GenericGenusSpeciesClearsBoth) {
  Classifier c(1, 2, 3, 4);
  Classifier g = c.GenericGenusSpecies();
  EXPECT_EQ(g.Family(), 1u);
  EXPECT_EQ(g.Genus(), 0u);
  EXPECT_EQ(g.Species(), 0u);
  EXPECT_EQ(g.Event(), 4u);
}

// ---------------------------------------------------------------------------
// SetEvent
// ---------------------------------------------------------------------------

TEST(ClassifierTest, SetEvent) {
  Classifier c(1, 2, 3, 4);
  c.SetEvent(99);
  EXPECT_EQ(c.Event(), 99u);
}

// ---------------------------------------------------------------------------
// Zeroing predicates
// ---------------------------------------------------------------------------

TEST(ClassifierTest, EqualsZeroingSpeciesOf) {
  Classifier a(1, 2, 0, 4); // species already 0
  Classifier b(1, 2, 7, 4);
  EXPECT_TRUE(a.EqualsZeroingSpeciesOf(b));
  Classifier c(1, 9, 0, 4); // genus mismatch
  EXPECT_FALSE(c.EqualsZeroingSpeciesOf(b));
}

TEST(ClassifierTest, EqualsZeroingGenusOf) {
  Classifier a(1, 0, 3, 4);
  Classifier b(1, 7, 3, 4);
  EXPECT_TRUE(a.EqualsZeroingGenusOf(b));
}

TEST(ClassifierTest, EqualsZeroingSpeciesAndGenusOf) {
  Classifier a(1, 0, 0, 4);
  Classifier b(1, 7, 9, 4);
  EXPECT_TRUE(a.EqualsZeroingSpeciesAndGenusOf(b));
  Classifier c(2, 0, 0, 4); // family mismatch
  EXPECT_FALSE(c.EqualsZeroingSpeciesAndGenusOf(b));
}
