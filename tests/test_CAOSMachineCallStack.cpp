// test_CAOSMachineCallStack.cpp
// Unit tests for CAOSMachine::CallState — the data bundle that preserves
// VM state across subroutine invocations (CALL command).
//
// Tests verify that CallState correctly stores all VM fields, has proper
// copy semantics (deep copy), and that local variables survive round-trips.
// No CAOSMachine instance needed — CallState is a standalone value type.

#include "engine/Caos/CAOSMachine.h"
#include "engine/Caos/CAOSVar.h"
#include <gtest/gtest.h>

// ==========================================================================
// CallState — field integrity
// ==========================================================================

TEST(CallStateTest, DefaultFields) {
  CAOSMachine::CallState state;
  state.macro = nullptr;
  state.ip = 0;
  state.instFlag = false;
  state.lockedFlag = false;
  state.part = 0;

  EXPECT_EQ(state.macro, nullptr);
  EXPECT_EQ(state.ip, 0);
  EXPECT_FALSE(state.instFlag);
  EXPECT_FALSE(state.lockedFlag);
  EXPECT_EQ(state.part, 0);
}

TEST(CallStateTest, StoresP1P2_Integer) {
  CAOSMachine::CallState state;
  state.p1.SetInteger(42);
  state.p2.SetInteger(99);

  EXPECT_EQ(state.p1.GetInteger(), 42);
  EXPECT_EQ(state.p2.GetInteger(), 99);
}

TEST(CallStateTest, StoresP1P2_String) {
  CAOSMachine::CallState state;
  state.p1.SetString("hello");
  state.p2.SetString("world");

  std::string s1, s2;
  state.p1.GetString(s1);
  state.p2.GetString(s2);
  EXPECT_EQ(s1, "hello");
  EXPECT_EQ(s2, "world");
}

TEST(CallStateTest, StoresP1P2_Float) {
  CAOSMachine::CallState state;
  state.p1.SetFloat(3.14f);
  state.p2.SetFloat(2.71f);

  EXPECT_FLOAT_EQ(state.p1.GetFloat(), 3.14f);
  EXPECT_FLOAT_EQ(state.p2.GetFloat(), 2.71f);
}

TEST(CallStateTest, StoresIP) {
  CAOSMachine::CallState state;
  state.ip = 12345;
  EXPECT_EQ(state.ip, 12345);
}

TEST(CallStateTest, StoresFlags) {
  CAOSMachine::CallState state;
  state.instFlag = true;
  state.lockedFlag = true;
  EXPECT_TRUE(state.instFlag);
  EXPECT_TRUE(state.lockedFlag);
}

TEST(CallStateTest, StoresPart) {
  CAOSMachine::CallState state;
  state.part = 7;
  EXPECT_EQ(state.part, 7);
}

// ==========================================================================
// Local variables
// ==========================================================================

TEST(CallStateTest, StoresLocalVars_AllTypes) {
  CAOSMachine::CallState state;
  state.localVars[0].SetInteger(111);
  state.localVars[5].SetString("test");
  state.localVars[99].SetFloat(3.14f);

  EXPECT_EQ(state.localVars[0].GetInteger(), 111);
  std::string s;
  state.localVars[5].GetString(s);
  EXPECT_EQ(s, "test");
  EXPECT_FLOAT_EQ(state.localVars[99].GetFloat(), 3.14f);
}

TEST(CallStateTest, LocalVars_AllSlots) {
  CAOSMachine::CallState state;
  // Set all 100 local variable slots
  for (int i = 0; i < 100; ++i) {
    state.localVars[i].SetInteger(i * 10);
  }
  // Verify all
  for (int i = 0; i < 100; ++i) {
    EXPECT_EQ(state.localVars[i].GetInteger(), i * 10);
  }
}

// ==========================================================================
// Stack fields
// ==========================================================================

TEST(CallStateTest, StoresStack) {
  CAOSMachine::CallState state;
  state.stack.push_back(10);
  state.stack.push_back(20);
  state.stack.push_back(30);

  ASSERT_EQ(state.stack.size(), 3u);
  EXPECT_EQ(state.stack[0], 10);
  EXPECT_EQ(state.stack[1], 20);
  EXPECT_EQ(state.stack[2], 30);
}

TEST(CallStateTest, EmptyStacks) {
  CAOSMachine::CallState state;
  EXPECT_TRUE(state.stack.empty());
  EXPECT_TRUE(state.agentStack.empty());
}

// ==========================================================================
// Copy semantics (deep copy)
// ==========================================================================

TEST(CallStateTest, CopyIsDeep) {
  CAOSMachine::CallState a;
  a.ip = 100;
  a.p1.SetInteger(42);
  a.localVars[0].SetString("original");
  a.stack.push_back(99);
  a.macro = nullptr;

  // Copy
  CAOSMachine::CallState b = a;

  // Verify copy
  EXPECT_EQ(b.ip, 100);
  EXPECT_EQ(b.p1.GetInteger(), 42);
  std::string s;
  b.localVars[0].GetString(s);
  EXPECT_EQ(s, "original");
  ASSERT_EQ(b.stack.size(), 1u);
  EXPECT_EQ(b.stack[0], 99);

  // Modify original — copy should be independent
  a.ip = 999;
  a.p1.SetInteger(0);
  a.localVars[0].SetInteger(0);
  a.stack.clear();

  EXPECT_EQ(b.ip, 100);
  EXPECT_EQ(b.p1.GetInteger(), 42);
  b.localVars[0].GetString(s);
  EXPECT_EQ(s, "original");
  EXPECT_EQ(b.stack.size(), 1u);
}

// ==========================================================================
// Simulated nested CALL scenario (data-only, no VM)
// ==========================================================================

TEST(CallStateTest, NestedCallScenario) {
  // Simulate caller → sub1 → sub2 using CallState as a manual stack.
  std::vector<CAOSMachine::CallState> callStack;

  // Caller state
  CAOSMachine::CallState caller;
  caller.ip = 10;
  caller.p1.SetInteger(100);
  caller.macro = nullptr;
  callStack.push_back(caller);

  // Sub1 state
  CAOSMachine::CallState sub1;
  sub1.ip = 20;
  sub1.p1.SetInteger(200);
  sub1.macro = nullptr;
  callStack.push_back(sub1);

  // Pop sub1 (return from sub2)
  ASSERT_EQ(callStack.size(), 2u);
  CAOSMachine::CallState restored = callStack.back();
  callStack.pop_back();
  EXPECT_EQ(restored.ip, 20);
  EXPECT_EQ(restored.p1.GetInteger(), 200);

  // Pop caller (return from sub1)
  ASSERT_EQ(callStack.size(), 1u);
  restored = callStack.back();
  callStack.pop_back();
  EXPECT_EQ(restored.ip, 10);
  EXPECT_EQ(restored.p1.GetInteger(), 100);

  EXPECT_TRUE(callStack.empty());
}
