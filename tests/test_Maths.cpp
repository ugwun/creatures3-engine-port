#include "engine/Maths.h"
#include <gtest/gtest.h>

TEST(MathsTest, BoundedAdd) {
  EXPECT_FLOAT_EQ(BoundedAdd(0.5f, 0.4f), 0.9f);
  EXPECT_FLOAT_EQ(BoundedAdd(0.5f, 0.6f), 1.0f); // Max bound is 1.0
  EXPECT_FLOAT_EQ(BoundedAdd(1.0f, 0.5f), 1.0f);
}

TEST(MathsTest, BoundedSub) {
  EXPECT_FLOAT_EQ(BoundedSub(0.9f, 0.4f), 0.5f);
  EXPECT_FLOAT_EQ(BoundedSub(0.5f, 0.6f), 0.0f); // Min bound is 0.0
  EXPECT_FLOAT_EQ(BoundedSub(0.0f, 0.5f), 0.0f);
}

TEST(MathsTest, BoundIntoMinusOnePlusOne) {
  EXPECT_FLOAT_EQ(BoundIntoMinusOnePlusOne(0.5f), 0.5f);
  EXPECT_FLOAT_EQ(BoundIntoMinusOnePlusOne(1.5f), 1.0f);
  EXPECT_FLOAT_EQ(BoundIntoMinusOnePlusOne(-0.5f), -0.5f);
  EXPECT_FLOAT_EQ(BoundIntoMinusOnePlusOne(-1.5f), -1.0f);
}

TEST(MathsTest, BoundIntoZeroOne) {
  EXPECT_FLOAT_EQ(BoundIntoZeroOne(0.5f), 0.5f);
  EXPECT_FLOAT_EQ(BoundIntoZeroOne(1.5f), 1.0f);
  EXPECT_FLOAT_EQ(BoundIntoZeroOne(-0.5f), 0.0f);
}

TEST(MathsTest, RandPlatformTest) {
  // The engine contains a predefined test sequence to ensure the PRNG
  // logic works correctly on the target platform architecture.
  EXPECT_TRUE(RandQD1::PlatformTest());
}

TEST(MathsTest, RndRange) {
  RandQD1::seed(12345);
  for (int i = 0; i < 1000; ++i) {
    int r = Rnd(5, 15);
    EXPECT_GE(r, 5);
    EXPECT_LE(r, 15);
  }
}

TEST(MathsTest, RndMax) {
  RandQD1::seed(12345);
  for (int i = 0; i < 1000; ++i) {
    int r = Rnd(10);
    EXPECT_GE(r, 0);
    EXPECT_LE(r, 10);
  }
}

TEST(MathsTest, RndFloat) {
  RandQD1::seed(12345);
  for (int i = 0; i < 1000; ++i) {
    float r = RndFloat();
    EXPECT_GE(r, 0.0f);
    EXPECT_LE(r, 1.0f);
  }
}
