// test_AgentManager.cpp
// Unit tests for the IAgentManager interface using NullAgentManager and
// FakeAgentManager stubs.
//
// Since AgentManager is a complex singleton with display/filesystem deps,
// we test the interface contract exclusively via stub implementations —
// the same injection pattern that future handler refactoring will use.

#include "engine/IAgentManager.h"
#include "stub_NullAgentManager.h"
#include <gtest/gtest.h>

// ---------------------------------------------------------------------------
// Helper functions mirroring AgentManager-handler logic — accept IAgentManager&
// ---------------------------------------------------------------------------

// COUNT — total creature count
static int GetCreatureCount(IAgentManager &mgr) {
  return mgr.GetCreatureCount();
}

// AGNT — find agent by ID (-1 ID convention: return NULLHANDLE)
static AgentHandle GetAgentByID(IAgentManager &mgr, uint32 id) {
  return mgr.GetAgentFromID(id);
}

// CACL — smell classifier registration (returns true on success)
static bool RegisterSmell(IAgentManager &mgr, int caIndex, Classifier *c) {
  return mgr.UpdateSmellClassifierList(caIndex, c);
}

// ---------------------------------------------------------------------------
// NullAgentManager defaults
// ---------------------------------------------------------------------------

TEST(IAgentManagerNullTest, GetCreatureCount_DefaultsToZero) {
  NullAgentManager mgr;
  EXPECT_EQ(GetCreatureCount(mgr), 0);
}

TEST(IAgentManagerNullTest, GetAgentFromID_Default_ReturnsNull) {
  NullAgentManager mgr;
  EXPECT_TRUE(GetAgentByID(mgr, 42).IsInvalid());
}

TEST(IAgentManagerNullTest, FindCreatureAgentForMoniker_Default_ReturnsNull) {
  NullAgentManager mgr;
  EXPECT_TRUE(mgr.FindCreatureAgentForMoniker("abc-def").IsInvalid());
}

TEST(IAgentManagerNullTest, FindAgentForMoniker_Default_ReturnsNull) {
  NullAgentManager mgr;
  EXPECT_TRUE(mgr.FindAgentForMoniker("abc-def").IsInvalid());
}

TEST(IAgentManagerNullTest, GetCreatureByIndex_Default_ReturnsNull) {
  NullAgentManager mgr;
  EXPECT_TRUE(mgr.GetCreatureByIndex(0).IsInvalid());
}

TEST(IAgentManagerNullTest, FindNextAgent_Default_ReturnsNull) {
  NullAgentManager mgr;
  AgentHandle was;
  Classifier c;
  EXPECT_TRUE(mgr.FindNextAgent(was, c).IsInvalid());
}

TEST(IAgentManagerNullTest, FindPreviousAgent_Default_ReturnsNull) {
  NullAgentManager mgr;
  AgentHandle was;
  Classifier c;
  EXPECT_TRUE(mgr.FindPreviousAgent(was, c).IsInvalid());
}

TEST(IAgentManagerNullTest, UpdateSmellClassifierList_Default_ReturnsFalse) {
  NullAgentManager mgr;
  Classifier c(1, 1, 1);
  EXPECT_FALSE(RegisterSmell(mgr, 0, &c));
}

TEST(IAgentManagerNullTest, GetSmellIdFromCategoryId_Default_ReturnsMinusOne) {
  NullAgentManager mgr;
  EXPECT_EQ(mgr.GetSmellIdFromCategoryId(3), -1);
}

TEST(IAgentManagerNullTest, CalculateMoodAndThreat_Default_AllZero) {
  NullAgentManager mgr;
  uint32 sel = 99, health = 99;
  float mood = 1.f, threat = 1.f;
  mgr.CalculateMoodAndThreat(sel, health, mood, threat);
  EXPECT_EQ(sel, 0u);
  EXPECT_EQ(health, 0u);
  EXPECT_FLOAT_EQ(mood, 0.f);
  EXPECT_FLOAT_EQ(threat, 0.f);
}

TEST(IAgentManagerNullTest, UniqueCreaturePlane_Default_ReturnsZero) {
  NullAgentManager mgr;
  AgentHandle h;
  EXPECT_EQ(mgr.UniqueCreaturePlane(h), 0);
}

TEST(IAgentManagerNullTest, IsEnd_WithStartIterator_IsTrue) {
  NullAgentManager mgr;
  auto it = mgr.GetAgentIteratorStart();
  EXPECT_TRUE(mgr.IsEnd(it));
}

TEST(IAgentManagerNullTest, KillAllAgents_DoesNotCrash) {
  NullAgentManager mgr;
  mgr.KillAllAgents();
}

TEST(IAgentManagerNullTest, RegisterClone_DoesNotCrash) {
  NullAgentManager mgr;
  AgentHandle h;
  mgr.RegisterClone(h);
}

// ---------------------------------------------------------------------------
// FakeAgentManager — override specific methods for focused tests
// ---------------------------------------------------------------------------

struct FakeAgentManager : public NullAgentManager {
  int creatureCount = 5;
  int smellId = 7;
  bool smellRegOk = true;
  bool createCalled = false;
  bool killAllCalled = false;

  int GetCreatureCount() override { return creatureCount; }
  int GetSmellIdFromCategoryId(int) override { return smellId; }
  bool UpdateSmellClassifierList(int, Classifier *) override {
    return smellRegOk;
  }
  void KillAllAgents() override { killAllCalled = true; }
};

TEST(IAgentManagerFakeTest, GetCreatureCount_ReturnsFive) {
  FakeAgentManager mgr;
  EXPECT_EQ(GetCreatureCount(mgr), 5);
}

TEST(IAgentManagerFakeTest, GetSmellIdFromCategoryId_ReturnsSeven) {
  FakeAgentManager mgr;
  EXPECT_EQ(mgr.GetSmellIdFromCategoryId(0), 7);
}

TEST(IAgentManagerFakeTest, UpdateSmellClassifierList_ReturnsTrue) {
  FakeAgentManager mgr;
  Classifier c(1, 2, 3);
  EXPECT_TRUE(RegisterSmell(mgr, 5, &c));
}

TEST(IAgentManagerFakeTest,
     UpdateSmellClassifierList_WhenDisabled_ReturnsFalse) {
  FakeAgentManager mgr;
  mgr.smellRegOk = false;
  Classifier c(1, 2, 3);
  EXPECT_FALSE(RegisterSmell(mgr, 5, &c));
}

TEST(IAgentManagerFakeTest, KillAllAgents_SetsFlag) {
  FakeAgentManager mgr;
  EXPECT_FALSE(mgr.killAllCalled);
  mgr.KillAllAgents();
  EXPECT_TRUE(mgr.killAllCalled);
}

// ---------------------------------------------------------------------------
// Polymorphism via IAgentManager*
// ---------------------------------------------------------------------------

TEST(IAgentManagerPolymorphismTest, NullAndFakeViaInterface) {
  NullAgentManager null;
  FakeAgentManager fake;

  IAgentManager *mgrs[2] = {&null, &fake};

  EXPECT_EQ(mgrs[0]->GetCreatureCount(), 0);
  EXPECT_EQ(mgrs[1]->GetCreatureCount(), 5);
}
