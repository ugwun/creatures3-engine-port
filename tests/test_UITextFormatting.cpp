// test_UITextFormatting.cpp
// Unit tests for StripInlineFormattingTags (TextFormatting.h).
//
// DS game scripts use inline <tint R G B> tags to colour UI text.
// The C3 engine's sprite-sheet renderer doesn't support these, so
// StripInlineFormattingTags strips them before rendering.

#include "engine/Agents/TextFormatting.h"
#include <gtest/gtest.h>
#include <string>

// ==========================================================================
// StripInlineFormattingTags
// ==========================================================================

TEST(UITextFormattingTest, EmptyString_ReturnsEmpty) {
  EXPECT_EQ(StripInlineFormattingTags(""), "");
}

TEST(UITextFormattingTest, NoTags_ReturnsUnchanged) {
  EXPECT_EQ(StripInlineFormattingTags("hello world"), "hello world");
}

TEST(UITextFormattingTest, NumberOnly_ReturnsUnchanged) {
  EXPECT_EQ(StripInlineFormattingTags("46"), "46");
}

TEST(UITextFormattingTest, SingleTintTag_Stripped) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 110 255 110>46"), "46");
}

TEST(UITextFormattingTest, TintTagNoContent_ReturnsEmpty) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 110 255 110>"), "");
}

TEST(UITextFormattingTest, MultipleTags_AllStripped) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 255 0 0>hello<tint 0 255 0> world"),
            "hello world");
}

TEST(UITextFormattingTest, TagInMiddle_Stripped) {
  EXPECT_EQ(StripInlineFormattingTags("before<tint 128 128 128>after"),
            "beforeafter");
}

TEST(UITextFormattingTest, NonTintTag_AlsoStripped) {
  // Any angle-bracket tag should be stripped, not just <tint>
  EXPECT_EQ(StripInlineFormattingTags("<color 255>text"), "text");
}

TEST(UITextFormattingTest, UnclosedTag_StripsToEnd) {
  // If there's no closing '>', strip from '<' to end of string
  EXPECT_EQ(StripInlineFormattingTags("hello<tint 0 0 0"), "hello");
}

TEST(UITextFormattingTest, EmptyTag_Stripped) {
  EXPECT_EQ(StripInlineFormattingTags("<>text"), "text");
}

TEST(UITextFormattingTest, GreaterThanAlone_Preserved) {
  // A lone '>' without a preceding '<' is just a regular character
  EXPECT_EQ(StripInlineFormattingTags("5 > 3"), "5 > 3");
}

TEST(UITextFormattingTest, OptionsMenuTotalPopulation_Realistic) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 110 255 110>46"), "46");
}

TEST(UITextFormattingTest, OptionsMenuBreedingLimit_Realistic) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 110 255 110>36"), "36");
}

TEST(UITextFormattingTest, OptionsMenuHighlight_Realistic) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 255 110 110>46"), "46");
}

TEST(UITextFormattingTest, OptionsMenuZeroValue_Realistic) {
  EXPECT_EQ(StripInlineFormattingTags("<tint 175 225 127>0"), "0");
}
