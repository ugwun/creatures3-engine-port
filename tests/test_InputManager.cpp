// test_InputManager.cpp — Unit tests for InputManager key state tracking.
//
// Verifies that IsKeyDown() correctly reflects the pressed/released state
// of keys as reported by SysAddKeyDownEvent/SysAddKeyUpEvent, fixing the
// macOS CAOS KEYD command which previously always returned false.

#include "engine/InputManager.h"
#include <gtest/gtest.h>
#include <cstring> // memset

// VK constants from engine/unix/KeyScan.h
#define VK_RETURN 0x0D
#define VK_ESCAPE 0x1B
#define VK_SPACE  0x20
#define VK_SHIFT  0x10
#define VK_LEFT   0x25
#define VK_RIGHT  0x27

class InputManagerTest : public ::testing::Test {
protected:
  InputManager im;
};

TEST_F(InputManagerTest, InitiallyNoKeysDown) {
  // All keys should be unpressed at construction
  EXPECT_FALSE(im.IsKeyDown(VK_RETURN));
  EXPECT_FALSE(im.IsKeyDown(VK_ESCAPE));
  EXPECT_FALSE(im.IsKeyDown(VK_SPACE));
  EXPECT_FALSE(im.IsKeyDown(0));
  EXPECT_FALSE(im.IsKeyDown(255));
}

TEST_F(InputManagerTest, KeyDownMakesIsKeyDownTrue) {
  im.SysAddKeyDownEvent(VK_RETURN);
  EXPECT_TRUE(im.IsKeyDown(VK_RETURN));
}

TEST_F(InputManagerTest, KeyUpMakesIsKeyDownFalse) {
  im.SysAddKeyDownEvent(VK_RETURN);
  EXPECT_TRUE(im.IsKeyDown(VK_RETURN));

  im.SysAddKeyUpEvent(VK_RETURN);
  EXPECT_FALSE(im.IsKeyDown(VK_RETURN));
}

TEST_F(InputManagerTest, MultipleKeysIndependent) {
  im.SysAddKeyDownEvent(VK_RETURN);
  im.SysAddKeyDownEvent(VK_SPACE);

  EXPECT_TRUE(im.IsKeyDown(VK_RETURN));
  EXPECT_TRUE(im.IsKeyDown(VK_SPACE));
  EXPECT_FALSE(im.IsKeyDown(VK_ESCAPE));

  im.SysAddKeyUpEvent(VK_RETURN);
  EXPECT_FALSE(im.IsKeyDown(VK_RETURN));
  EXPECT_TRUE(im.IsKeyDown(VK_SPACE));
}

TEST_F(InputManagerTest, KeyStateSurvivesFlush) {
  // Key state should persist across SysFlushEventBuffer — it reflects
  // the physical key state, not the event buffer.
  im.SysAddKeyDownEvent(VK_SHIFT);
  im.SysFlushEventBuffer();

  EXPECT_TRUE(im.IsKeyDown(VK_SHIFT));
  EXPECT_EQ(im.GetEventCount(), 0); // events flushed
}

TEST_F(InputManagerTest, OutOfRangeKeycodeReturnsFalse) {
  // Negative and >= 256 should not crash, just return false
  EXPECT_FALSE(im.IsKeyDown(-1));
  EXPECT_FALSE(im.IsKeyDown(256));
  EXPECT_FALSE(im.IsKeyDown(1000));
}

TEST_F(InputManagerTest, BoundaryKeycodes) {
  im.SysAddKeyDownEvent(0);
  EXPECT_TRUE(im.IsKeyDown(0));

  im.SysAddKeyDownEvent(255);
  EXPECT_TRUE(im.IsKeyDown(255));
}

TEST_F(InputManagerTest, RepeatedKeyDownIsIdempotent) {
  im.SysAddKeyDownEvent(VK_LEFT);
  im.SysAddKeyDownEvent(VK_LEFT);
  EXPECT_TRUE(im.IsKeyDown(VK_LEFT));

  im.SysAddKeyUpEvent(VK_LEFT);
  EXPECT_FALSE(im.IsKeyDown(VK_LEFT));
}

TEST_F(InputManagerTest, KeyDownGeneratesEvent) {
  im.SysAddKeyDownEvent(VK_RIGHT);
  ASSERT_EQ(im.GetEventCount(), 1);
  EXPECT_EQ(im.GetEvent(0).EventCode, InputEvent::eventKeyDown);
  EXPECT_EQ(im.GetEvent(0).KeyData.keycode, VK_RIGHT);
}
