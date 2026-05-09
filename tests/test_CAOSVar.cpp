// test_CAOSVar.cpp
// Unit tests for the CAOSVar tagged-union variable type.
// No App / World / SDL dependencies.

#include "engine/Caos/CAOSVar.h"
#include <gtest/gtest.h>
#include <string>

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

TEST(CAOSVarTest, DefaultIsInteger) {
  CAOSVar v;
  EXPECT_EQ(v.GetType(), CAOSVar::typeInteger);
  EXPECT_EQ(v.GetInteger(), 0);
}

// ---------------------------------------------------------------------------
// Set / Get round-trips
// ---------------------------------------------------------------------------

TEST(CAOSVarTest, SetGetInteger) {
  CAOSVar v;
  v.SetInteger(42);
  EXPECT_EQ(v.GetType(), CAOSVar::typeInteger);
  EXPECT_EQ(v.GetInteger(), 42);
}

TEST(CAOSVarTest, SetGetNegativeInteger) {
  CAOSVar v;
  v.SetInteger(-999);
  EXPECT_EQ(v.GetInteger(), -999);
}

TEST(CAOSVarTest, SetGetFloat) {
  CAOSVar v;
  v.SetFloat(3.14f);
  EXPECT_EQ(v.GetType(), CAOSVar::typeFloat);
  EXPECT_NEAR(v.GetFloat(), 3.14f, 1e-5f);
}

TEST(CAOSVarTest, SetGetString) {
  CAOSVar v;
  v.SetString("hello world");
  EXPECT_EQ(v.GetType(), CAOSVar::typeString);
  std::string out;
  v.GetString(out);
  EXPECT_EQ(out, "hello world");
}

TEST(CAOSVarTest, SetGetEmptyString) {
  CAOSVar v;
  v.SetString("");
  std::string out;
  v.GetString(out);
  EXPECT_EQ(out, "");
}

// ---------------------------------------------------------------------------
// Type transitions (memory safety)
// ---------------------------------------------------------------------------

TEST(CAOSVarTest, IntToStringToInt) {
  CAOSVar v;
  v.SetInteger(7);
  v.SetString("transition"); // must free nothing (was int)
  std::string s;
  v.GetString(s);
  EXPECT_EQ(s, "transition");
  v.SetInteger(8); // must free the string
  EXPECT_EQ(v.GetInteger(), 8);
  EXPECT_EQ(v.GetType(), CAOSVar::typeInteger);
}

TEST(CAOSVarTest, StringToFloatFreesString) {
  CAOSVar v;
  v.SetString("to_be_freed");
  v.SetFloat(2.71828f); // must free the string
  EXPECT_EQ(v.GetType(), CAOSVar::typeFloat);
  EXPECT_NEAR(v.GetFloat(), 2.71828f, 1e-4f);
}

TEST(CAOSVarTest, StringToStringReplacesContent) {
  CAOSVar v;
  v.SetString("first");
  v.SetString("second"); // in-place reuse of pv_string allocation
  std::string out;
  v.GetString(out);
  EXPECT_EQ(out, "second");
}

// ---------------------------------------------------------------------------
// Copy / Assignment
// ---------------------------------------------------------------------------

TEST(CAOSVarTest, CopyConstructorInteger) {
  CAOSVar a;
  a.SetInteger(100);
  CAOSVar b(a);
  EXPECT_EQ(b.GetInteger(), 100);
  b.SetInteger(999);
  EXPECT_EQ(a.GetInteger(), 100); // original unaffected
}

TEST(CAOSVarTest, CopyConstructorString) {
  CAOSVar a;
  a.SetString("copy me");
  CAOSVar b(a);
  std::string s;
  b.GetString(s);
  EXPECT_EQ(s, "copy me");
  b.SetString("mutated");
  a.GetString(s);
  EXPECT_EQ(s, "copy me"); // original unaffected
}

TEST(CAOSVarTest, AssignmentOperator) {
  CAOSVar a, b;
  a.SetString("source");
  b.SetInteger(0);
  b = a;
  std::string s;
  b.GetString(s);
  EXPECT_EQ(s, "source");
}

TEST(CAOSVarTest, SelfAssignment) {
  CAOSVar v;
  v.SetInteger(55);
  v = v; // must not crash or corrupt
  EXPECT_EQ(v.GetInteger(), 55);
}

// ---------------------------------------------------------------------------
// BecomeZero mechanism
// ---------------------------------------------------------------------------

TEST(CAOSVarTest, BecomeZeroOnNextRead) {
  CAOSVar v;
  v.SetInteger(77);
  v.BecomeAZeroedIntegerOnYourNextRead();
  // GetType() should report integer (because of the flag)
  EXPECT_EQ(v.GetType(), CAOSVar::typeInteger);
  // First read zeroes it
  EXPECT_EQ(v.GetInteger(), 0);
  // Subsequent reads return 0 normally
  EXPECT_EQ(v.GetInteger(), 0);
}
