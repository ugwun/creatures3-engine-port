#include "common/SimpleLexer.h"
#include <gtest/gtest.h>
#include <sstream>

TEST(SimpleLexerTest, EmptyStream) {
  std::istringstream stream("");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeFinished);
}

TEST(SimpleLexerTest, WhitespaceOnly) {
  std::istringstream stream("   \t\n  \r \n");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeFinished);
}

TEST(SimpleLexerTest, ParseNumber) {
  std::istringstream stream("12345");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeNumber);
  EXPECT_EQ(token, "12345");
}

TEST(SimpleLexerTest, ParseSymbol) {
  std::istringstream stream("hello_world");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeSymbol);
  EXPECT_EQ(token, "hello_world");
}

TEST(SimpleLexerTest, ParseString) {
  std::istringstream stream("\"this is a test\"");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeString);
  EXPECT_EQ(token, "this is a test"); // quotes are stripped
}

TEST(SimpleLexerTest, ParseStringWithEscapes) {
  std::istringstream stream("\"line1\\nline2\\t\\\"quote\\\"\"");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeString);
  EXPECT_EQ(token, "line1\nline2\t\"quote\"");
}

TEST(SimpleLexerTest, ParseStringUnterminatedError) {
  std::istringstream stream("\"unterminated \n  string\"");
  SimpleLexer lexer(stream);
  std::string token;

  // Lexer errors on \n inside strings
  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeError);
}

TEST(SimpleLexerTest, CommentsAreIgnoredHash) {
  std::istringstream stream("123 # this is a comment\n456");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeNumber);
  EXPECT_EQ(token, "123");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeNumber);
  EXPECT_EQ(token, "456");
}

TEST(SimpleLexerTest, CommentsAreIgnoredAsterisk) {
  std::istringstream stream("hello * another comment \n world");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeSymbol);
  EXPECT_EQ(token, "hello");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeSymbol);
  EXPECT_EQ(token, "world");
}

TEST(SimpleLexerTest, SequenceOfTokens) {
  std::istringstream stream(
      "CMD 123 \"string arg\" # comment\nanother_cmd 456");
  SimpleLexer lexer(stream);
  std::string token;

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeSymbol);
  EXPECT_EQ(token, "CMD");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeNumber);
  EXPECT_EQ(token, "123");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeString);
  EXPECT_EQ(token, "string arg");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeSymbol);
  EXPECT_EQ(token, "another_cmd");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeNumber);
  EXPECT_EQ(token, "456");

  EXPECT_EQ(lexer.GetToken(token), SimpleLexer::typeFinished);
}
