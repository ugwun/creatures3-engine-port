// test_GeneralHandlers.cpp
// Unit tests for GeneralHandlers time/world-state logic using IWorldServices.
//
// GeneralHandlers_Logic.cpp exposes static methods (e.g.
// GeneralHandlers::GetTimeOfDay(IWorldServices&)) that contain the pure
// logic; production handlers delegate to these. Here we pass FakeWorld
// to test the real logic without App, SDL, or a live game world.

#include "engine/Caos/GeneralHandlers.h"
#include "stub_NullWorldServices.h"
#include <gtest/gtest.h>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// FakeWorld — configurable IWorldServices for testing
// ---------------------------------------------------------------------------

struct FakeWorld : public NullWorldServices {
  // Time / season
  int timeOfDay = 3; // EVENING
  int season = 2;    // AUTUMN
  int dayInSeason = 14;
  uint32 yearsElapsed = 5;
  uint32 worldTick = 1234;

  // Pause state
  bool paused = false;

  // World identity
  std::string worldName = "MyTestWorld";
  std::string worldUID = "uid-abc-123";

  // World list
  std::vector<std::string> worlds = {"Alpha", "Beta", "Gamma"};

  // Overrides
  int GetTimeOfDay(bool = true, uint32 = 0) override { return timeOfDay; }
  int GetSeason(bool = true, uint32 = 0) override { return season; }
  int GetDayInSeason(bool = true, uint32 = 0) override { return dayInSeason; }
  uint32 GetYearsElapsed(bool = true, uint32 = 0) override {
    return yearsElapsed;
  }
  uint32 GetWorldTick() const override { return worldTick; }

  bool GetPausedWorldTick() const override { return paused; }
  void SetPausedWorldTick(bool p) override { paused = p; }

  std::string GetWorldName() const override { return worldName; }
  std::string GetUniqueIdentifier() const override { return worldUID; }

  int WorldCount() override { return (int)worlds.size(); }
  bool WorldName(int index, std::string &name) override {
    if (index < 0 || index >= (int)worlds.size())
      return false;
    name = worlds[index];
    return true;
  }
};

// ==========================================================================
// TIME — GetTimeOfDay
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetTimeOfDay_NullWorld_ReturnsZero) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::GetTimeOfDay(w), 0);
}

TEST(GeneralHandlerLogicTest, GetTimeOfDay_FakeWorld_ReturnsConfigured) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetTimeOfDay(w), 3);
}

// ==========================================================================
// SEAN — GetSeason
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetSeason_NullWorld_ReturnsZero) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::GetSeason(w), 0);
}

TEST(GeneralHandlerLogicTest, GetSeason_FakeWorld_ReturnsAutumn) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetSeason(w), 2);
}

// ==========================================================================
// DATE — GetDayInSeason
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetDayInSeason_NullWorld_ReturnsZero) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::GetDayInSeason(w), 0);
}

TEST(GeneralHandlerLogicTest, GetDayInSeason_FakeWorld_Returns14) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetDayInSeason(w), 14);
}

// ==========================================================================
// YEAR — GetYearsElapsed
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetYearsElapsed_NullWorld_ReturnsZero) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::GetYearsElapsed(w), 0u);
}

TEST(GeneralHandlerLogicTest, GetYearsElapsed_FakeWorld_ReturnsFive) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetYearsElapsed(w), 5u);
}

// ==========================================================================
// WTIK — GetWorldTick
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetWorldTick_NullWorld_ReturnsZero) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::GetWorldTick(w), 0u);
}

TEST(GeneralHandlerLogicTest, GetWorldTick_FakeWorld_Returns1234) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetWorldTick(w), 1234u);
}

// ==========================================================================
// NWLD — GetWorldCount
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetWorldCount_NullWorld_ReturnsZero) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::GetWorldCount(w), 0);
}

TEST(GeneralHandlerLogicTest, GetWorldCount_FakeWorld_ReturnsThree) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetWorldCount(w), 3);
}

// ==========================================================================
// WNTI — WorldNameToIndex
// ==========================================================================

TEST(GeneralHandlerLogicTest, WorldNameToIndex_ExistingName_ReturnsIndex) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::WorldNameToIndex(w, "Alpha"), 0);
  EXPECT_EQ(GeneralHandlers::WorldNameToIndex(w, "Beta"), 1);
  EXPECT_EQ(GeneralHandlers::WorldNameToIndex(w, "Gamma"), 2);
}

TEST(GeneralHandlerLogicTest, WorldNameToIndex_MissingName_ReturnsMinusOne) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::WorldNameToIndex(w, "Delta"), -1);
}

TEST(GeneralHandlerLogicTest, WorldNameToIndex_EmptyWorldList_ReturnsMinusOne) {
  NullWorldServices w;
  EXPECT_EQ(GeneralHandlers::WorldNameToIndex(w, "Alpha"), -1);
}

// ==========================================================================
// WNAM — GetWorldName
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetWorldName_NullWorld_ReturnsEmpty) {
  NullWorldServices w;
  EXPECT_TRUE(GeneralHandlers::GetWorldName(w).empty());
}

TEST(GeneralHandlerLogicTest, GetWorldName_FakeWorld_ReturnsName) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetWorldName(w), "MyTestWorld");
}

// ==========================================================================
// WUID — GetWorldUID
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetWorldUID_NullWorld_ReturnsEmpty) {
  NullWorldServices w;
  EXPECT_TRUE(GeneralHandlers::GetWorldUID(w).empty());
}

TEST(GeneralHandlerLogicTest, GetWorldUID_FakeWorld_ReturnsUID) {
  FakeWorld w;
  EXPECT_EQ(GeneralHandlers::GetWorldUID(w), "uid-abc-123");
}

// ==========================================================================
// WPAU — GetWorldPaused
// ==========================================================================

TEST(GeneralHandlerLogicTest, GetWorldPaused_NullWorld_ReturnsFalse) {
  NullWorldServices w;
  EXPECT_FALSE(GeneralHandlers::GetWorldPaused(w));
}

TEST(GeneralHandlerLogicTest, GetWorldPaused_FakeWorld_InitiallyFalse) {
  FakeWorld w;
  EXPECT_FALSE(GeneralHandlers::GetWorldPaused(w));
}

TEST(GeneralHandlerLogicTest, GetWorldPaused_FakeWorld_AfterPause_ReturnsTrue) {
  FakeWorld w;
  w.paused = true;
  EXPECT_TRUE(GeneralHandlers::GetWorldPaused(w));
}

// ==========================================================================
// Polymorphic dispatch via IWorldServices&
// ==========================================================================

TEST(GeneralHandlerLogicTest, PolymorphicDispatch_TimeOfDay) {
  NullWorldServices n;
  FakeWorld f;
  IWorldServices *worlds[2] = {&n, &f};
  EXPECT_EQ(GeneralHandlers::GetTimeOfDay(*worlds[0]), 0);
  EXPECT_EQ(GeneralHandlers::GetTimeOfDay(*worlds[1]), 3);
}

TEST(GeneralHandlerLogicTest, GameVars_NullWorld_ReadWriteRoundtrip) {
  NullWorldServices w;
  const std::string key = "test_var";
  w.GetGameVar(key).SetInteger(42);
  EXPECT_EQ(w.GetGameVar(key).GetInteger(), 42);
}

TEST(GeneralHandlerLogicTest, GameVars_NullWorld_DeleteVar) {
  NullWorldServices w;
  w.GetGameVar("x").SetInteger(1);
  w.DeleteGameVar("x");
  // After deletion, accessing creates a fresh CAOSVar (integer 0)
  EXPECT_EQ(w.GetGameVar("x").GetInteger(), 0);
}
