// test_HistoryHandlers.cpp
// Unit tests for HistoryHandlers IWorldServices& / HistoryStore& / LifeEvent&
// / CreatureHistory& logic-layer methods.
//
// We build with:
//   HistoryHandlers_Logic.cpp   (logic methods)
//   stub_HistoryStore.cpp       (HistoryStore without theAgentManager)
//   stub_CreatureHistory.cpp    (CreatureHistory without theApp)
//   stub_NullWorldServices.h    (NullWorldServices : IWorldServices)
// No full App/SDL/World dependency.

#include "engine/Caos/HistoryHandlers.h"
#include "engine/Creature/History/CreatureHistory.h"
#include "engine/Creature/History/HistoryStore.h"
#include "engine/Creature/History/LifeEvent.h"
#include "stub_NullWorldServices.h"
#include <gtest/gtest.h>
#include <string>

// ==========================================================================
// Helper: build a LifeEvent with known field values
// ==========================================================================
static LifeEvent MakeEvent(LifeEvent::EventType type, const std::string &m1,
                           const std::string &m2, uint32 tick = 100,
                           uint32 age = 200, uint32 rtime = 300,
                           int lifeStage = 2) {
  LifeEvent ev;
  ev.myEventType = type;
  ev.myWorldTick = tick;
  ev.myAgeInTicks = age;
  ev.myRealWorldTime = rtime;
  ev.myLifeStage = lifeStage;
  ev.myRelatedMoniker1 = m1;
  ev.myRelatedMoniker2 = m2;
  ev.myUserText = "user text";
  ev.myWorldName = "Capillata";
  ev.myWorldUniqueIdentifier = "uid-001";
  ev.myPhoto = "photo.s16";
  return ev;
}

// Helper: build a CreatureHistory with known field values
static CreatureHistory MakeHistory(const std::string &moniker, int gender,
                                   int genus, int variant, int mutations,
                                   int crosses, const std::string &name) {
  CreatureHistory h;
  h.myMoniker = moniker;
  h.myGender = gender;
  h.myGenus = genus; // 0-based internally
  h.myVariant = variant;
  h.myCrossoverMutationCount = mutations;
  h.myCrossoverCrossCount = crosses;
  h.myName = name;
  return h;
}

// ==========================================================================
// HistoryStore queries — GetEventCount
// ==========================================================================

TEST(HistoryHandlerLogicTest, GetEventCount_UnknownMoniker_ReturnsZero) {
  HistoryStore store;
  EXPECT_EQ(HistoryHandlers::GetEventCount(store, "abc-123"), 0);
}

TEST(HistoryHandlerLogicTest, GetEventCount_EmptyMoniker_ReturnsZero) {
  HistoryStore store;
  EXPECT_EQ(HistoryHandlers::GetEventCount(store, ""), 0);
}

TEST(HistoryHandlerLogicTest, GetEventCount_KnownMonikerNoEvents_ReturnsZero) {
  HistoryStore store;
  store.GetCreatureHistory("norn-001"); // create entry with no events
  EXPECT_EQ(HistoryHandlers::GetEventCount(store, "norn-001"), 0);
}

TEST(HistoryHandlerLogicTest,
     GetEventCount_KnownMonikerWithEvents_ReturnsCount) {
  HistoryStore store;
  CreatureHistory &h = store.GetCreatureHistory("norn-002");
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeBorn, "", ""));
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeDied, "", ""));
  EXPECT_EQ(HistoryHandlers::GetEventCount(store, "norn-002"), 2);
}

// ==========================================================================
// HistoryStore queries — GetNextMoniker / GetPrevMoniker
// ==========================================================================

TEST(HistoryHandlerLogicTest, GetNextMoniker_EmptyStore_ReturnsEmptyString) {
  HistoryStore store;
  EXPECT_EQ(HistoryHandlers::GetNextMoniker(store, ""), "");
}

TEST(HistoryHandlerLogicTest, GetPrevMoniker_EmptyStore_ReturnsEmptyString) {
  HistoryStore store;
  EXPECT_EQ(HistoryHandlers::GetPrevMoniker(store, ""), "");
}

TEST(HistoryHandlerLogicTest, GetNextMoniker_FirstEntry_FromEmpty) {
  HistoryStore store;
  store.GetCreatureHistory("alpha");
  store.GetCreatureHistory("beta");
  // Next("") → first entry alphabetically
  EXPECT_EQ(HistoryHandlers::GetNextMoniker(store, ""), "alpha");
}

TEST(HistoryHandlerLogicTest, GetNextMoniker_AtLast_ReturnsEmpty) {
  HistoryStore store;
  store.GetCreatureHistory("alpha");
  store.GetCreatureHistory("beta");
  EXPECT_EQ(HistoryHandlers::GetNextMoniker(store, "beta"), "");
}

TEST(HistoryHandlerLogicTest, GetNextMoniker_Middle_ReturnsNext) {
  HistoryStore store;
  store.GetCreatureHistory("a");
  store.GetCreatureHistory("b");
  store.GetCreatureHistory("c");
  EXPECT_EQ(HistoryHandlers::GetNextMoniker(store, "b"), "c");
}

TEST(HistoryHandlerLogicTest, GetPrevMoniker_AtFirst_ReturnsEmpty) {
  HistoryStore store;
  store.GetCreatureHistory("a");
  store.GetCreatureHistory("b");
  EXPECT_EQ(HistoryHandlers::GetPrevMoniker(store, "a"), "");
}

TEST(HistoryHandlerLogicTest, GetPrevMoniker_Middle_ReturnsPrev) {
  HistoryStore store;
  store.GetCreatureHistory("a");
  store.GetCreatureHistory("b");
  store.GetCreatureHistory("c");
  EXPECT_EQ(HistoryHandlers::GetPrevMoniker(store, "c"), "b");
}

// ==========================================================================
// IWorldServices time queries — via NullWorldServices (all return 0)
// ==========================================================================

TEST(HistoryHandlerLogicTest, GetHistSeasonAtTick_NullWorld_ReturnsZero) {
  NullWorldServices world;
  EXPECT_EQ(HistoryHandlers::GetHistSeasonAtTick(world, 500), 0);
}

TEST(HistoryHandlerLogicTest, GetHistTimeAtTick_NullWorld_ReturnsZero) {
  NullWorldServices world;
  EXPECT_EQ(HistoryHandlers::GetHistTimeAtTick(world, 500), 0);
}

TEST(HistoryHandlerLogicTest, GetHistYearAtTick_NullWorld_ReturnsZero) {
  NullWorldServices world;
  EXPECT_EQ(HistoryHandlers::GetHistYearAtTick(world, 500), 0);
}

TEST(HistoryHandlerLogicTest, GetHistDateAtTick_NullWorld_ReturnsZero) {
  NullWorldServices world;
  EXPECT_EQ(HistoryHandlers::GetHistDateAtTick(world, 500), 0);
}

// ==========================================================================
// LifeEvent field readers
// ==========================================================================

TEST(HistoryHandlerLogicTest, GetEventType_ReturnsType) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "");
  EXPECT_EQ(HistoryHandlers::GetEventType(ev), (int)LifeEvent::typeBorn);
}

TEST(HistoryHandlerLogicTest, GetEventWorldTick_ReturnsTick) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "", 12345);
  EXPECT_EQ(HistoryHandlers::GetEventWorldTick(ev), 12345u);
}

TEST(HistoryHandlerLogicTest, GetEventAgeInTicks_ReturnsAge) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "", 0, 9999);
  EXPECT_EQ(HistoryHandlers::GetEventAgeInTicks(ev), 9999u);
}

TEST(HistoryHandlerLogicTest, GetEventRealTime_ReturnsRealTime) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "", 0, 0, 112233);
  EXPECT_EQ(HistoryHandlers::GetEventRealTime(ev), 112233u);
}

TEST(HistoryHandlerLogicTest, GetEventLifeStage_ReturnsLifeStage) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "", 0, 0, 0, 3);
  EXPECT_EQ(HistoryHandlers::GetEventLifeStage(ev), 3);
}

TEST(HistoryHandlerLogicTest, GetEventRelatedMoniker1_ReturnsMoniker) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "mom-001", "dad-002");
  EXPECT_EQ(HistoryHandlers::GetEventRelatedMoniker1(ev), "mom-001");
}

TEST(HistoryHandlerLogicTest, GetEventRelatedMoniker2_ReturnsMoniker) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "mom-001", "dad-002");
  EXPECT_EQ(HistoryHandlers::GetEventRelatedMoniker2(ev), "dad-002");
}

TEST(HistoryHandlerLogicTest, GetEventUserText_ReturnsText) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "");
  ev.myUserText = "hello norn";
  EXPECT_EQ(HistoryHandlers::GetEventUserText(ev), "hello norn");
}

TEST(HistoryHandlerLogicTest, GetEventWorldName_ReturnsName) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "");
  ev.myWorldName = "MyWorld";
  EXPECT_EQ(HistoryHandlers::GetEventWorldName(ev), "MyWorld");
}

TEST(HistoryHandlerLogicTest, GetEventWorldUID_ReturnsUID) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "");
  ev.myWorldUniqueIdentifier = "uid-xyz";
  EXPECT_EQ(HistoryHandlers::GetEventWorldUID(ev), "uid-xyz");
}

TEST(HistoryHandlerLogicTest, GetEventPhoto_ReturnsPhoto) {
  LifeEvent ev = MakeEvent(LifeEvent::typeBorn, "", "");
  ev.myPhoto = "portrait_norn";
  EXPECT_EQ(HistoryHandlers::GetEventPhoto(ev), "portrait_norn");
}

// ==========================================================================
// CreatureHistory field readers
// ==========================================================================

TEST(HistoryHandlerLogicTest, GetCreatureGender_ReturnsMaleOrFemale) {
  CreatureHistory h = MakeHistory("n", 1, 0, 0, 0, 0, "");
  EXPECT_EQ(HistoryHandlers::GetCreatureGender(h), 1);
}

TEST(HistoryHandlerLogicTest, GetCreatureGenus_OneBased) {
  // genus 0 internally = norn = 1 in CAOS
  CreatureHistory h = MakeHistory("n", 0, 0, 0, 0, 0, ""); // genus=0
  EXPECT_EQ(HistoryHandlers::GetCreatureGenus(h), 1);
}

TEST(HistoryHandlerLogicTest, GetCreatureGenus_Geat_ReturnsFour) {
  CreatureHistory h = MakeHistory("n", 0, 3, 0, 0, 0, ""); // genus=3 → 4
  EXPECT_EQ(HistoryHandlers::GetCreatureGenus(h), 4);
}

TEST(HistoryHandlerLogicTest, GetCreatureVariant_ReturnsVariant) {
  CreatureHistory h = MakeHistory("n", 0, 0, 5, 0, 0, "");
  EXPECT_EQ(HistoryHandlers::GetCreatureVariant(h), 5);
}

TEST(HistoryHandlerLogicTest, GetCreatureMutationCount_ReturnsMutations) {
  CreatureHistory h = MakeHistory("n", 0, 0, 0, 7, 0, "");
  EXPECT_EQ(HistoryHandlers::GetCreatureMutationCount(h), 7);
}

TEST(HistoryHandlerLogicTest, GetCreatureCrossCount_ReturnsCrosses) {
  CreatureHistory h = MakeHistory("n", 0, 0, 0, 0, 3, "");
  EXPECT_EQ(HistoryHandlers::GetCreatureCrossCount(h), 3);
}

TEST(HistoryHandlerLogicTest, GetCreatureName_ReturnsName) {
  CreatureHistory h = MakeHistory("n", 0, 0, 0, 0, 0, "Sirius");
  EXPECT_EQ(HistoryHandlers::GetCreatureName(h), "Sirius");
}

// ==========================================================================
// FindLifeEvent / FindLifeEventReverse
// ==========================================================================

TEST(HistoryHandlerLogicTest, FindLifeEvent_EventNotPresent_ReturnsMinusOne) {
  CreatureHistory h;
  h.myMoniker = "x";
  EXPECT_EQ(HistoryHandlers::FindLifeEvent(h, LifeEvent::typeBorn, -1), -1);
}

TEST(HistoryHandlerLogicTest, FindLifeEvent_EventPresent_ReturnsIndex) {
  CreatureHistory h;
  h.myMoniker = "x";
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeConcieved, "", ""));
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeBorn, "", ""));
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeDied, "", ""));
  EXPECT_EQ(HistoryHandlers::FindLifeEvent(h, LifeEvent::typeBorn, -1), 1);
}

TEST(HistoryHandlerLogicTest, FindLifeEvent_FromIndex_SkipsEarlierMatches) {
  CreatureHistory h;
  h.myMoniker = "x";
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeBorn, "", ""));
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeBorn, "", ""));
  // Start from index 1, so first Born at 0 is skipped
  EXPECT_EQ(HistoryHandlers::FindLifeEvent(h, LifeEvent::typeBorn, 0), 1);
}

TEST(HistoryHandlerLogicTest,
     FindLifeEventReverse_EventNotPresent_ReturnsMinusOne) {
  CreatureHistory h;
  h.myMoniker = "x";
  EXPECT_EQ(HistoryHandlers::FindLifeEventReverse(h, LifeEvent::typeBorn, -1),
            -1);
}

TEST(HistoryHandlerLogicTest,
     FindLifeEventReverse_EventPresent_ReturnsLastIndex) {
  CreatureHistory h;
  h.myMoniker = "x";
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeBorn, "", ""));
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeDied, "", ""));
  h.myLifeEvents.push_back(MakeEvent(LifeEvent::typeBorn, "", ""));
  // Reverse from end → last Born is index 2
  EXPECT_EQ(HistoryHandlers::FindLifeEventReverse(h, LifeEvent::typeBorn, -1),
            2);
}
