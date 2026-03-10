#include "common/Vector2D.h"
#include <cmath>
#include <gtest/gtest.h>

TEST(Vector2DTest, Initialization) {
  Vector2D v1;
  v1.x = 1.0f;
  v1.y = 2.0f;
  EXPECT_FLOAT_EQ(v1.x, 1.0f);
  EXPECT_FLOAT_EQ(v1.y, 2.0f);

  Vector2D v2(3, 4);
  EXPECT_FLOAT_EQ(v2.x, 3.0f);
  EXPECT_FLOAT_EQ(v2.y, 4.0f);

  Vector2D v3(5.5f, -2.5f);
  EXPECT_FLOAT_EQ(v3.x, 5.5f);
  EXPECT_FLOAT_EQ(v3.y, -2.5f);
}

TEST(Vector2DTest, Addition) {
  Vector2D v1(1.0f, 2.0f);
  Vector2D v2(3.0f, -1.0f);

  Vector2D v3 = v1 + v2;
  EXPECT_FLOAT_EQ(v3.x, 4.0f);
  EXPECT_FLOAT_EQ(v3.y, 1.0f);

  v1 += v2;
  EXPECT_FLOAT_EQ(v1.x, 4.0f);
  EXPECT_FLOAT_EQ(v1.y, 1.0f);
}

TEST(Vector2DTest, Subtraction) {
  Vector2D v1(5.0f, 5.0f);
  Vector2D v2(2.0f, 3.0f);

  Vector2D v3 = v1 - v2;
  EXPECT_FLOAT_EQ(v3.x, 3.0f);
  EXPECT_FLOAT_EQ(v3.y, 2.0f);

  v1 -= v2;
  EXPECT_FLOAT_EQ(v1.x, 3.0f);
  EXPECT_FLOAT_EQ(v1.y, 2.0f);
}

TEST(Vector2DTest, Multiplication) {
  Vector2D v1(2.0f, -3.0f);

  Vector2D v2 = v1 * 2.5f;
  EXPECT_FLOAT_EQ(v2.x, 5.0f);
  EXPECT_FLOAT_EQ(v2.y, -7.5f);

  v1 *= 2.0f;
  EXPECT_FLOAT_EQ(v1.x, 4.0f);
  EXPECT_FLOAT_EQ(v1.y, -6.0f);
}

TEST(Vector2DTest, Division) {
  Vector2D v1(10.0f, -5.0f);

  Vector2D v2 = v1 / 2.0f;
  EXPECT_FLOAT_EQ(v2.x, 5.0f);
  EXPECT_FLOAT_EQ(v2.y, -2.5f);

  v1 /= 5.0f;
  EXPECT_FLOAT_EQ(v1.x, 2.0f);
  EXPECT_FLOAT_EQ(v1.y, -1.0f);
}

TEST(Vector2DTest, Equality) {
  Vector2D v1(1.0f, 2.0f);
  Vector2D v2(1.0f, 2.0f);
  Vector2D v3(2.0f, 2.0f);

  EXPECT_TRUE(v1 == v2);
  EXPECT_FALSE(v1 == v3);

  EXPECT_TRUE(v1 != v3);
  EXPECT_FALSE(v1 != v2);
}

TEST(Vector2DTest, LengthAndDistance) {
  Vector2D v1(3.0f, 4.0f);
  EXPECT_FLOAT_EQ(v1.Length(), 5.0f);
  EXPECT_FLOAT_EQ(v1.SquareLength(), 25.0f);

  Vector2D v2(0.0f, 0.0f);
  EXPECT_FLOAT_EQ(v1.DistanceTo(v2), 5.0f);
  EXPECT_FLOAT_EQ(v1.SquareDistanceTo(v2), 25.0f);
}

TEST(Vector2DTest, Normalise) {
  Vector2D v1(3.0f, 4.0f);
  Vector2D n1 = v1.Normalise();
  EXPECT_FLOAT_EQ(n1.x, 0.6f);
  EXPECT_FLOAT_EQ(n1.y, 0.8f);
  EXPECT_FLOAT_EQ(n1.Length(), 1.0f);

  Vector2D v2(0.0f, 0.0f);
  Vector2D n2 = v2.Normalise();
  EXPECT_FLOAT_EQ(n2.x, 0.0f);
  EXPECT_FLOAT_EQ(n2.y, 0.0f);
}

TEST(Vector2DTest, DotAndCrossProduct) {
  Vector2D v1(1.0f, 2.0f);
  Vector2D v2(3.0f, 4.0f);

  EXPECT_FLOAT_EQ(v1.DotProduct(v2), 11.0f);
  EXPECT_FLOAT_EQ(v1.CrossProduct(v2), -2.0f); // 1*4 - 2*3 = 4 - 6 = -2
}
