#include "Map/MapCA_Logic.h"

#include <gtest/gtest.h>

namespace {

Vector2D Point(float x, float y) { return Vector2D(x, y); }

TEST(MapCALogicTest, ClassifiesHorizontallyOffsetLowerRoomAsDown) {
  EXPECT_EQ(GO_DOWN, MapCALogic::ClassifyLinkedRoomDirection(
                         Point(1098.0f, 8914.0f), Point(1213.0f, 9038.0f),
                         Point(1155.5f, 8976.0f), Point(1404.0f, 9118.0f),
                         Point(1451.0f, 9262.0f), Point(1427.5f, 9190.0f)));
}

TEST(MapCALogicTest, ClassifiesReverseVerticalLinkAsUp) {
  EXPECT_EQ(GO_UP, MapCALogic::ClassifyLinkedRoomDirection(
                       Point(1404.0f, 9118.0f), Point(1451.0f, 9262.0f),
                       Point(1427.5f, 9190.0f), Point(1098.0f, 8914.0f),
                       Point(1213.0f, 9038.0f), Point(1155.5f, 8976.0f)));
}

TEST(MapCALogicTest, ClassifiesTouchingVerticalBandsAsVertical) {
  EXPECT_EQ(GO_DOWN, MapCALogic::ClassifyLinkedRoomDirection(
                         Point(0.0f, 0.0f), Point(100.0f, 100.0f),
                         Point(50.0f, 50.0f), Point(300.0f, 100.0f),
                         Point(400.0f, 200.0f), Point(350.0f, 150.0f)));
}

TEST(MapCALogicTest, PreservesRightForSideBySideRooms) {
  EXPECT_EQ(GO_RIGHT, MapCALogic::ClassifyLinkedRoomDirection(
                          Point(0.0f, 0.0f), Point(100.0f, 100.0f),
                          Point(50.0f, 50.0f), Point(100.0f, 0.0f),
                          Point(200.0f, 100.0f), Point(150.0f, 50.0f)));
}

TEST(MapCALogicTest, PreservesLeftForSideBySideRooms) {
  EXPECT_EQ(GO_LEFT, MapCALogic::ClassifyLinkedRoomDirection(
                         Point(100.0f, 0.0f), Point(200.0f, 100.0f),
                         Point(150.0f, 50.0f), Point(0.0f, 0.0f),
                         Point(100.0f, 100.0f), Point(50.0f, 50.0f)));
}

TEST(MapCALogicTest, UsesLegacyDiagonalSectorsWhenVerticalBandsOverlap) {
  EXPECT_EQ(GO_RIGHT, MapCALogic::ClassifyLinkedRoomDirection(
                          Point(0.0f, 0.0f), Point(100.0f, 150.0f),
                          Point(50.0f, 75.0f), Point(100.0f, 100.0f),
                          Point(300.0f, 250.0f), Point(200.0f, 175.0f)));
}

} // namespace
