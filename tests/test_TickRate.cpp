// -------------------------------------------------------------------------
// test_TickRate.cpp
// -------------------------------------------------------------------------
// Unit tests for the game tick-rate calculation utilities extracted into
// TickRateUtils.h.  These are pure-function tests with no SDL or engine
// dependencies.
// -------------------------------------------------------------------------

#include "engine/Display/SDL/TickRateUtils.h"
#include <gtest/gtest.h>

// ---------------------------------------------------------------------------
// ComputeEffectiveTickInterval
// ---------------------------------------------------------------------------

TEST(TickRateTest, NormalSpeed_ReturnsBaseInterval) {
  // multiplier 1.0 → no change
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 1.0f), 50u);
}

TEST(TickRateTest, DoubleSpeed_HalvesInterval) {
  // multiplier 2.0 → 50/2 = 25ms
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 2.0f), 25u);
}

TEST(TickRateTest, TripleSpeed_ThirdsInterval) {
  // multiplier 3.0 → 50/3 ≈ 16ms (truncated)
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 3.0f), 16u);
}

TEST(TickRateTest, HalfSpeed_DoublesInterval) {
  // multiplier 0.5 → 50/0.5 = 100ms
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 0.5f), 100u);
}

TEST(TickRateTest, VeryHighSpeed_ClampsToOneMs) {
  // multiplier 1000 → 50/1000 ≈ 0 → clamped to 1
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 1000.0f), 1u);
}

TEST(TickRateTest, ZeroMultiplier_TreatedAsNormal) {
  // Invalid multiplier 0 is treated as 1.0
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 0.0f), 50u);
}

TEST(TickRateTest, NegativeMultiplier_TreatedAsNormal) {
  // Negative multiplier is treated as 1.0
  EXPECT_EQ(ComputeEffectiveTickInterval(50, -2.0f), 50u);
}

TEST(TickRateTest, FractionalSpeed_RoundsDown) {
  // multiplier 3.0 with base 100 → 100/3 = 33.33 → truncated to 33
  EXPECT_EQ(ComputeEffectiveTickInterval(100, 3.0f), 33u);
}

TEST(TickRateTest, ExactDivision_NoRoundingNeeded) {
  // multiplier 5.0 with base 50 → 50/5 = 10
  EXPECT_EQ(ComputeEffectiveTickInterval(50, 5.0f), 10u);
}

TEST(TickRateTest, SmallBaseInterval_StillClamps) {
  // base 1ms, multiplier 2 → 1/2 ≈ 0 → clamped to 1
  EXPECT_EQ(ComputeEffectiveTickInterval(1, 2.0f), 1u);
}

// ---------------------------------------------------------------------------
// ComputeSleepDuration
// ---------------------------------------------------------------------------

TEST(TickRateTest, Sleep_FullInterval_WhenTickInstant) {
  // Tick took 0ms out of 50ms interval → sleep 50ms
  EXPECT_EQ(ComputeSleepDuration(50, 0), 50u);
}

TEST(TickRateTest, Sleep_Remainder_WhenTickPartial) {
  // Tick took 15ms out of 50ms interval → sleep 35ms
  EXPECT_EQ(ComputeSleepDuration(50, 15), 35u);
}

TEST(TickRateTest, Sleep_Zero_WhenTickExact) {
  // Tick took exactly 50ms → no sleep needed
  EXPECT_EQ(ComputeSleepDuration(50, 50), 0u);
}

TEST(TickRateTest, Sleep_Zero_WhenTickOverran) {
  // Tick took 80ms (overran 50ms interval) → no sleep
  EXPECT_EQ(ComputeSleepDuration(50, 80), 0u);
}

TEST(TickRateTest, Sleep_OneMs_WhenAlmostDone) {
  // Tick took 49ms out of 50ms → sleep 1ms
  EXPECT_EQ(ComputeSleepDuration(50, 49), 1u);
}

// ---------------------------------------------------------------------------
// Integration: ComputeEffectiveTickInterval → ComputeSleepDuration
// ---------------------------------------------------------------------------

TEST(TickRateTest, EndToEnd_NormalSpeed_SlowTick) {
  // Normal speed, tick takes 10ms
  uint32_t interval = ComputeEffectiveTickInterval(50, 1.0f);
  uint32_t sleep = ComputeSleepDuration(interval, 10);
  EXPECT_EQ(interval, 50u);
  EXPECT_EQ(sleep, 40u);
}

TEST(TickRateTest, EndToEnd_TripleSpeed_FastTick) {
  // 3× speed (16ms interval), tick takes 5ms
  uint32_t interval = ComputeEffectiveTickInterval(50, 3.0f);
  uint32_t sleep = ComputeSleepDuration(interval, 5);
  EXPECT_EQ(interval, 16u);
  EXPECT_EQ(sleep, 11u);
}

TEST(TickRateTest, EndToEnd_HalfSpeed_SlowTick) {
  // 0.5× speed (100ms interval), tick takes 30ms
  uint32_t interval = ComputeEffectiveTickInterval(50, 0.5f);
  uint32_t sleep = ComputeSleepDuration(interval, 30);
  EXPECT_EQ(interval, 100u);
  EXPECT_EQ(sleep, 70u);
}

TEST(TickRateTest, EndToEnd_ExtremeSpeed_TickOverrun) {
  // 100× speed (1ms interval, clamped), tick takes 5ms → no sleep
  uint32_t interval = ComputeEffectiveTickInterval(50, 100.0f);
  uint32_t sleep = ComputeSleepDuration(interval, 5);
  EXPECT_EQ(interval, 1u);
  EXPECT_EQ(sleep, 0u);
}
