// test_AgentHandlers.cpp
// Unit tests for AgentHandlers IWorldServices& logic methods.
//
// AgentHandlers_Logic.cpp exposes:
//   AgentHandlers::SendMessage(IWorldServices&, ...)
//   AgentHandlers::GetSelectedCreature(IWorldServices&)
//
// These cover the MESG WRIT, MESG WRT+, CALL (WRIT/WRT+/CALL all delegate
// to SendMessage), and NORN handlers. Tests use FakeWorld/NullWorldServices
// — no App, no SDL, no live game state required.

#include "engine/Caos/AgentHandlers.h"
#include "engine/Caos/CAOSVar.h"
#include "stub_NullWorldServices.h"
#include <gtest/gtest.h>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// Message record — captured by FakeWorld::WriteMessage
// ---------------------------------------------------------------------------

struct CapturedMessage {
  AgentHandle from;
  AgentHandle to;
  int msgid;
  CAOSVar p1;
  CAOSVar p2;
  unsigned delay;
};

// ---------------------------------------------------------------------------
// FakeWorld — records WriteMessage calls; exposes selected creature
// ---------------------------------------------------------------------------

struct FakeWorld : public NullWorldServices {
  std::vector<CapturedMessage> messages;
  AgentHandle selectedCreature; // defaults to NULLHANDLE

  void WriteMessage(AgentHandle const &from, AgentHandle const &to, int msg,
                    CAOSVar const &p1, CAOSVar const &p2,
                    unsigned delay) override {
    messages.push_back({from, to, msg, p1, p2, delay});
  }

  AgentHandle GetSelectedCreature() override { return selectedCreature; }
  void SetSelectedCreature(AgentHandle &h) override { selectedCreature = h; }
};

// Convenience: a null-equivalent AgentHandle for tests
static AgentHandle NULL_AGENT; // default-constructed == NULLHANDLE

// ==========================================================================
// SendMessage — basic dispatch
// ==========================================================================

TEST(AgentHandlerLogicTest, SendMessage_NullWorld_QueuesMessage) {
  // NullWorldServices::WriteMessage is not implemented (it's pure-virtual
  // and throws). Use FakeWorld so we can inspect what was queued.
  FakeWorld world;

  CAOSVar p1, p2;
  p1.SetInteger(42);
  p2.SetInteger(99);

  AgentHandlers::SendMessage(world, NULL_AGENT, NULL_AGENT,
                             /*msgid=*/7, p1, p2, /*delay=*/3);

  ASSERT_EQ(world.messages.size(), 1u);
  EXPECT_EQ(world.messages[0].msgid, 7);
  EXPECT_EQ(world.messages[0].p1.GetInteger(), 42);
  EXPECT_EQ(world.messages[0].p2.GetInteger(), 99);
  EXPECT_EQ(world.messages[0].delay, 3u);
}

TEST(AgentHandlerLogicTest, SendMessage_ZeroDelay_IsEnqueued) {
  FakeWorld world;
  CAOSVar zero;
  zero.SetInteger(0);

  AgentHandlers::SendMessage(world, NULL_AGENT, NULL_AGENT,
                             /*msgid=*/1, zero, zero, /*delay=*/0);

  ASSERT_EQ(world.messages.size(), 1u);
  EXPECT_EQ(world.messages[0].delay, 0u);
}

TEST(AgentHandlerLogicTest, SendMessage_MultipleCalls_AllRecorded) {
  FakeWorld world;
  CAOSVar v;

  for (int i = 0; i < 5; ++i) {
    v.SetInteger(i);
    AgentHandlers::SendMessage(world, NULL_AGENT, NULL_AGENT,
                               /*msgid=*/i, v, v, /*delay=*/0);
  }

  ASSERT_EQ(world.messages.size(), 5u);
  for (int i = 0; i < 5; ++i) {
    EXPECT_EQ(world.messages[i].msgid, i);
    EXPECT_EQ(world.messages[i].p1.GetInteger(), i);
  }
}

TEST(AgentHandlerLogicTest, SendMessage_StringParam_Preserved) {
  FakeWorld world;
  CAOSVar p1, p2;
  p1.SetString("hello");
  p2.SetString("world");

  AgentHandlers::SendMessage(world, NULL_AGENT, NULL_AGENT,
                             /*msgid=*/10, p1, p2, /*delay=*/0);

  ASSERT_EQ(world.messages.size(), 1u);
  std::string s1, s2;
  world.messages[0].p1.GetString(s1);
  world.messages[0].p2.GetString(s2);
  EXPECT_EQ(s1, "hello");
  EXPECT_EQ(s2, "world");
}

TEST(AgentHandlerLogicTest, SendMessage_FloatParam_Preserved) {
  FakeWorld world;
  CAOSVar p1, p2;
  p1.SetFloat(3.14f);
  p2.SetFloat(2.71f);

  AgentHandlers::SendMessage(world, NULL_AGENT, NULL_AGENT,
                             /*msgid=*/20, p1, p2, /*delay=*/0);

  ASSERT_EQ(world.messages.size(), 1u);
  EXPECT_FLOAT_EQ(world.messages[0].p1.GetFloat(), 3.14f);
  EXPECT_FLOAT_EQ(world.messages[0].p2.GetFloat(), 2.71f);
}

// ==========================================================================
// GetSelectedCreature — NORN r-value
// ==========================================================================

TEST(AgentHandlerLogicTest, GetSelectedCreature_NullWorld_ReturnsNull) {
  NullWorldServices world;
  // NullWorldServices::GetSelectedCreature returns default AgentHandle
  // (NULLHANDLE) — verify it's invalid
  AgentHandle h = AgentHandlers::GetSelectedCreature(world);
  EXPECT_TRUE(h.IsInvalid());
}

TEST(AgentHandlerLogicTest, GetSelectedCreature_FakeWorld_InitiallyInvalid) {
  FakeWorld world;
  AgentHandle h = AgentHandlers::GetSelectedCreature(world);
  EXPECT_TRUE(h.IsInvalid());
}

// ==========================================================================
// Polymorphic dispatch via IWorldServices&
// ==========================================================================

TEST(AgentHandlerLogicTest, PolymorphicDispatch_SendMessage) {
  FakeWorld world;
  IWorldServices &iworld = world;

  CAOSVar v;
  v.SetInteger(1);
  AgentHandlers::SendMessage(iworld, NULL_AGENT, NULL_AGENT,
                             /*msgid=*/99, v, v, /*delay=*/0);

  EXPECT_EQ(world.messages.size(), 1u);
  EXPECT_EQ(world.messages[0].msgid, 99);
}

TEST(AgentHandlerLogicTest, PolymorphicDispatch_GetSelectedCreature) {
  FakeWorld world;
  IWorldServices &iworld = world;
  AgentHandle h = AgentHandlers::GetSelectedCreature(iworld);
  EXPECT_TRUE(h.IsInvalid());
}

// ==========================================================================
// NullWorldServices game-var passthrough (sanity check for the stub)
// ==========================================================================

TEST(AgentHandlerLogicTest, NullWorld_GameVar_Write_NoOp) {
  NullWorldServices world;
  world.GetGameVar("mesg_count").SetInteger(5);
  EXPECT_EQ(world.GetGameVar("mesg_count").GetInteger(), 5);
}
