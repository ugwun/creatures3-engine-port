#include "engine/TimeFuncs.h"

#include <gtest/gtest.h>

#include <ctime>
#include <unistd.h>

namespace {

bool MatchesLocalTime(const SYSTEMTIME &actual, time_t expectedTime) {
  struct tm expected;
  if (!localtime_r(&expectedTime, &expected))
    return false;

  return actual.wYear == expected.tm_year + 1900 &&
         actual.wMonth == expected.tm_mon + 1 &&
         actual.wDayOfWeek == expected.tm_wday &&
         actual.wDay == expected.tm_mday &&
         actual.wHour == expected.tm_hour &&
         actual.wMinute == expected.tm_min &&
         actual.wSecond == expected.tm_sec;
}

} // namespace

TEST(TimeFuncsTest, MillisecondTimestampAdvances) {
  uint32 before = (uint32)GetTimeStamp();
  usleep(20000);
  uint32 after = (uint32)GetTimeStamp();

  // Unsigned subtraction remains correct if the 32-bit clock wraps.
  EXPECT_GE(after - before, 10u);
}

TEST(TimeFuncsTest, HighPerformanceTimestampUsesNanoseconds) {
  ASSERT_EQ(GetHighPerformanceTimeStampFrequency(), 1000000000LL);

  int64 before = GetHighPerformanceTimeStamp();
  usleep(5000);
  int64 after = GetHighPerformanceTimeStamp();

  EXPECT_GT(before, 0);
  EXPECT_GT(after, before);
  EXPECT_GE(after - before, 1000000LL);
}

TEST(TimeFuncsTest, LocalTimeMatchesSystemClock) {
  time_t before = time(NULL);
  SYSTEMTIME actual;
  GetLocalTime(&actual);
  time_t after = time(NULL);

  EXPECT_TRUE(MatchesLocalTime(actual, before) ||
              MatchesLocalTime(actual, after));
  EXPECT_LT(actual.wMilliseconds, 1000);
}

TEST(TimeFuncsTest, RealWorldTimeMatchesEpochClock) {
  time_t before = time(NULL);
  uint32 actual = GetRealWorldTime();
  time_t after = time(NULL);

  EXPECT_GE(actual, (uint32)before);
  EXPECT_LE(actual, (uint32)after);
}

TEST(TimeFuncsTest, MidnightIsAValidSystemTime) {
  SYSTEMTIME value = {};
  value.wHour = 0;
  value.wMinute = 0;
  value.wSecond = 0;

  EXPECT_TRUE(IsValidTime(value));
  EXPECT_FALSE(IsValidGameTime(value));
}

TEST(TimeFuncsTest, RejectsOutOfRangeTimeComponents) {
  SYSTEMTIME value = {};
  value.wHour = 23;
  value.wMinute = 59;
  value.wSecond = 59;
  value.wMilliseconds = 999;
  EXPECT_TRUE(IsValidTime(value));

  value.wHour = 24;
  EXPECT_FALSE(IsValidTime(value));
  value.wHour = 23;
  value.wMinute = 60;
  EXPECT_FALSE(IsValidTime(value));
  value.wMinute = 59;
  value.wSecond = 60;
  EXPECT_FALSE(IsValidTime(value));
  value.wSecond = 59;
  value.wMilliseconds = 1000;
  EXPECT_FALSE(IsValidTime(value));
}
