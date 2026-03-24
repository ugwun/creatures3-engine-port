// test_AppHandlers.cpp
// Unit tests for GeneralHandlers IApp& logic methods.
//
// AppHandlers_Logic.cpp exposes static methods (e.g.
// GeneralHandlers::RequestSave(IApp&)) that contain the pure logic;
// production handlers delegate to these. Here we pass FakeApp to test
// the real logic without the full engine, SDL, or filesystem.

#include "engine/Caos/GeneralHandlers.h"
#include "stub_FakeApp.h"
#include <gtest/gtest.h>
#include <string>

// ==========================================================================
// SAVE — Command_SAVE logic
// ==========================================================================

TEST(AppHandlerLogicTest, RequestSave_SetsWasSaved) {
  FakeApp app;
  EXPECT_FALSE(app.wasSaved);
  GeneralHandlers::RequestSave(app);
  EXPECT_TRUE(app.wasSaved);
}

TEST(AppHandlerLogicTest, RequestSave_TwiceStillTrue) {
  FakeApp app;
  GeneralHandlers::RequestSave(app);
  GeneralHandlers::RequestSave(app);
  EXPECT_TRUE(app.wasSaved);
}

// ==========================================================================
// QUIT — Command_QUIT logic
// ==========================================================================

TEST(AppHandlerLogicTest, RequestQuit_SetsWasQuit) {
  FakeApp app;
  EXPECT_FALSE(app.wasQuit);
  GeneralHandlers::RequestQuit(app);
  EXPECT_TRUE(app.wasQuit);
}

// ==========================================================================
// LOAD — Command_LOAD logic
// ==========================================================================

TEST(AppHandlerLogicTest, RequestLoad_RecordsWorldName) {
  FakeApp app;
  GeneralHandlers::RequestLoad(app, "Capillata");
  EXPECT_EQ(app.loadedWorld, "Capillata");
}

TEST(AppHandlerLogicTest, RequestLoad_EmptyWorldName) {
  FakeApp app;
  GeneralHandlers::RequestLoad(app, "");
  EXPECT_EQ(app.loadedWorld, "");
}

TEST(AppHandlerLogicTest, RequestLoad_OverwritesPreviousLoad) {
  FakeApp app;
  GeneralHandlers::RequestLoad(app, "World1");
  GeneralHandlers::RequestLoad(app, "World2");
  EXPECT_EQ(app.loadedWorld, "World2");
}

// ==========================================================================
// ETIK / TICK — GetSystemTick
// ==========================================================================

TEST(AppHandlerLogicTest, GetSystemTick_ReturnsConfiguredValue) {
  FakeApp app;
  app.systemTick = 9999u;
  EXPECT_EQ(GeneralHandlers::GetSystemTick(app), 9999u);
}

TEST(AppHandlerLogicTest, GetSystemTick_ZeroByDefault) {
  FakeApp app;
  EXPECT_EQ(GeneralHandlers::GetSystemTick(app), 0u);
}

// ==========================================================================
// RACE — GetLastTickGap
// ==========================================================================

TEST(AppHandlerLogicTest, GetLastTickGap_ReturnsConfiguredValue) {
  FakeApp app;
  app.lastTickGap = 33;
  EXPECT_EQ(GeneralHandlers::GetLastTickGap(app), 33);
}

TEST(AppHandlerLogicTest, GetLastTickGap_DefaultIs16) {
  FakeApp app;
  EXPECT_EQ(GeneralHandlers::GetLastTickGap(app), 16);
}

// ==========================================================================
// GNAM — GetGameName
// ==========================================================================

TEST(AppHandlerLogicTest, GetGameName_ReturnsConfiguredName) {
  FakeApp app;
  app.gameName = "DockingStation";
  EXPECT_EQ(GeneralHandlers::GetGameName(app), "DockingStation");
}

TEST(AppHandlerLogicTest, GetGameName_DefaultIsTestGame) {
  FakeApp app;
  EXPECT_EQ(GeneralHandlers::GetGameName(app), "TestGame");
}

// ==========================================================================
// EAME — GetEameVar
// ==========================================================================

TEST(AppHandlerLogicTest, GetEameVar_ReadWriteRoundtrip) {
  FakeApp app;
  GeneralHandlers::GetEameVar(app, "engine_test_key").SetInteger(42);
  EXPECT_EQ(GeneralHandlers::GetEameVar(app, "engine_test_key").GetInteger(),
            42);
}

TEST(AppHandlerLogicTest, GetEameVar_DefaultIsIntegerZero) {
  FakeApp app;
  EXPECT_EQ(GeneralHandlers::GetEameVar(app, "missing_key").GetInteger(), 0);
}

TEST(AppHandlerLogicTest, GetEameVar_StringValue) {
  FakeApp app;
  std::string val;
  GeneralHandlers::GetEameVar(app, "engine_str").SetString("hello");
  GeneralHandlers::GetEameVar(app, "engine_str").GetString(val);
  EXPECT_EQ(val, "hello");
}

TEST(AppHandlerLogicTest, GetEameVar_MultipleKeys_Independent) {
  FakeApp app;
  GeneralHandlers::GetEameVar(app, "a").SetInteger(1);
  GeneralHandlers::GetEameVar(app, "b").SetInteger(2);
  EXPECT_EQ(GeneralHandlers::GetEameVar(app, "a").GetInteger(), 1);
  EXPECT_EQ(GeneralHandlers::GetEameVar(app, "b").GetInteger(), 2);
}

// ==========================================================================
// MOPX / MOPY — GetMouseX / GetMouseY
// InputManager stores the mouse position set via SysAddMouseMoveEvent.
// ==========================================================================

TEST(AppHandlerLogicTest, GetMouseX_ReturnsInjectedPosition) {
  FakeApp app;
  app.GetInputManager().SysAddMouseMoveEvent(320, 240);
  EXPECT_EQ(GeneralHandlers::GetMouseX(app), 320);
}

TEST(AppHandlerLogicTest, GetMouseY_ReturnsInjectedPosition) {
  FakeApp app;
  app.GetInputManager().SysAddMouseMoveEvent(320, 240);
  EXPECT_EQ(GeneralHandlers::GetMouseY(app), 240);
}

TEST(AppHandlerLogicTest, GetMouseXY_DefaultZero) {
  FakeApp app;
  EXPECT_EQ(GeneralHandlers::GetMouseX(app), 0);
  EXPECT_EQ(GeneralHandlers::GetMouseY(app), 0);
}

// ==========================================================================
// MOVX / MOVY — GetMouseVX / GetMouseVY
// Velocity is computed from a ring buffer of recent positions.
// After SysFlushEventBuffer() the velocity ring advances.
// With zero movement velocity should be 0.0f.
// ==========================================================================

TEST(AppHandlerLogicTest, GetMouseVX_NoMovement_ReturnsZero) {
  FakeApp app;
  EXPECT_FLOAT_EQ(GeneralHandlers::GetMouseVX(app), 0.0f);
}

TEST(AppHandlerLogicTest, GetMouseVY_NoMovement_ReturnsZero) {
  FakeApp app;
  EXPECT_FLOAT_EQ(GeneralHandlers::GetMouseVY(app), 0.0f);
}

TEST(AppHandlerLogicTest, GetMouseVX_AfterMove_NonZero) {
  FakeApp app;
  InputManager &im = app.GetInputManager();

  // Advance the ring buffer so the "old" position is (0,0)
  im.SysFlushEventBuffer();
  im.SysFlushEventBuffer();
  im.SysFlushEventBuffer();

  // Move mouse to (90, 0)
  im.SysAddMouseMoveEvent(90, 0);

  // velocity = (current - old) / ourVelocityAgo (3) = 30.0f
  float vx = GeneralHandlers::GetMouseVX(app);
  EXPECT_GT(vx, 0.0f);
}

// ==========================================================================
// KEYD — IsKeyDown
// On macOS / non-Win32, InputManager::IsKeyDown always returns false
// (no async keyboard polling). The logic layer faithfully forwards this.
// ==========================================================================

TEST(AppHandlerLogicTest, IsKeyDown_ReflectsKeyState) {
  FakeApp app;
  // Key 65 = 'A'. With the new KeyStates array in InputManager,
  // SysAddKeyDownEvent sets the state to true, so IsKeyDown returns 1.
  app.GetInputManager().SysAddKeyDownEvent(65);
  EXPECT_EQ(GeneralHandlers::IsKeyDown(app, 65), 1);
}

TEST(AppHandlerLogicTest, IsKeyDown_UnpressedKey_ReturnsFalse) {
  FakeApp app;
  EXPECT_EQ(GeneralHandlers::IsKeyDown(app, 32), 0); // space
}

// ==========================================================================
// WOLF — EorWolfValues
// ==========================================================================

TEST(AppHandlerLogicTest, EorWolfValues_RecordsAndReturnsResult) {
  FakeApp app;
  app.wolfResult = 7;
  int result = GeneralHandlers::EorWolfValues(app, 0xFF, 0x01);
  EXPECT_EQ(result, 7);
  EXPECT_EQ(app.wolfAndMask, 0xFF);
  EXPECT_EQ(app.wolfEorMask, 0x01);
}

TEST(AppHandlerLogicTest, EorWolfValues_ZeroMasks) {
  FakeApp app;
  app.wolfResult = 0;
  EXPECT_EQ(GeneralHandlers::EorWolfValues(app, 0, 0), 0);
}

// ==========================================================================
// SCOL — GetScrollingMask / SetScrolling
// ==========================================================================

TEST(AppHandlerLogicTest, GetScrollingMask_ReturnsConfiguredValue) {
  FakeApp app;
  app.scrollingMask = 15;
  EXPECT_EQ(GeneralHandlers::GetScrollingMask(app), 15);
}

TEST(AppHandlerLogicTest, SetScrolling_RecordsAndEorMasks) {
  FakeApp app;
  app.scrollingMask = 5;
  GeneralHandlers::SetScrolling(app, 0b1111, 0b0001, nullptr, nullptr);
  EXPECT_EQ(app.scolAndMask, 0b1111);
  EXPECT_EQ(app.scolEorMask, 0b0001);
  // GetScrollingMask returns the pre-configured mask (FakeApp doesn't
  // recalculate — production App does)
  EXPECT_EQ(GeneralHandlers::GetScrollingMask(app), 5);
}

TEST(AppHandlerLogicTest, SetScrolling_WithSpeedVectors) {
  FakeApp app;
  std::vector<byte> up = {1, 2, 3};
  std::vector<byte> down = {4, 5};
  GeneralHandlers::SetScrolling(app, 0, 0, &up, &down);
  EXPECT_EQ(app.scolAndMask, 0);
  EXPECT_EQ(app.scolEorMask, 0);
}
