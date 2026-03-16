// test_CompoundAgent.cpp
// Unit tests for CompoundAgent::AddPart replacement behavior.
//
// CompoundAgent::AddPart uses a std::vector<CompoundPart*> indexed by part ID.
// When a slot is already occupied, the engine should:
//   - Delete the old part
//   - Log a warning
//   - Insert the new part
// This test verifies that contract using a minimal FakeCompoundParts approach
// that mirrors the AddPart logic without needing EntityImage / display deps.

#include <gtest/gtest.h>
#include <vector>

// ---------------------------------------------------------------------------
// Minimal reproduction of the AddPart replacement logic.
// We can't instantiate real CompoundPart (needs EntityImage), but the logic
// we're testing is purely vector-slot management:
//
//   if (myParts[id]) { delete old; myParts[id] = NULL; }
//   myParts[id] = newPart;
//
// We replicate this with a tracker to verify deletes happen.
// ---------------------------------------------------------------------------

namespace {

struct FakePart {
  int id;
  bool *deleteFlag; // set to true when deleted

  FakePart(int id, bool *flag) : id(id), deleteFlag(flag) {}
  ~FakePart() {
    if (deleteFlag)
      *deleteFlag = true;
  }
};

// Mirrors CompoundAgent::AddPart logic exactly
bool AddPartLogic(std::vector<FakePart *> &parts, int id, FakePart *part,
                  int &replaceCount) {
  // expand, if necessary
  while ((int)parts.size() <= id)
    parts.push_back(nullptr);

  if (parts[id]) {
    // DS scripts sometimes re-add parts without killing the old one first.
    // Instead of failing, silently replace with a warning.
    replaceCount++;
    delete parts[id];
    parts[id] = nullptr;
  }

  parts[id] = part;
  return true;
}

} // namespace

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

TEST(CompoundAgentAddPart, AddToEmptySlot_Succeeds) {
  std::vector<FakePart *> parts;
  int replaces = 0;
  bool deleted = false;
  FakePart *p = new FakePart(1, &deleted);

  bool ok = AddPartLogic(parts, 1, p, replaces);

  EXPECT_TRUE(ok);
  EXPECT_EQ(parts[1], p);
  EXPECT_EQ(replaces, 0);
  EXPECT_FALSE(deleted);

  delete p;
}

TEST(CompoundAgentAddPart, AddToOccupiedSlot_ReplacesOldPart) {
  std::vector<FakePart *> parts;
  int replaces = 0;
  bool oldDeleted = false;
  bool newDeleted = false;

  FakePart *oldPart = new FakePart(5, &oldDeleted);
  FakePart *newPart = new FakePart(5, &newDeleted);

  AddPartLogic(parts, 5, oldPart, replaces);
  ASSERT_EQ(parts[5], oldPart);
  ASSERT_EQ(replaces, 0);

  // Replace the old part
  AddPartLogic(parts, 5, newPart, replaces);

  EXPECT_EQ(parts[5], newPart);
  EXPECT_EQ(replaces, 1);
  EXPECT_TRUE(oldDeleted);   // old part was deleted
  EXPECT_FALSE(newDeleted);  // new part is alive

  delete newPart;
}

TEST(CompoundAgentAddPart, MultipleReplacements_CountsCorrectly) {
  std::vector<FakePart *> parts;
  int replaces = 0;
  bool d1 = false, d2 = false, d3 = false;

  FakePart *p1 = new FakePart(3, &d1);
  FakePart *p2 = new FakePart(3, &d2);
  FakePart *p3 = new FakePart(3, &d3);

  AddPartLogic(parts, 3, p1, replaces);
  AddPartLogic(parts, 3, p2, replaces);
  AddPartLogic(parts, 3, p3, replaces);

  EXPECT_EQ(replaces, 2);
  EXPECT_TRUE(d1);
  EXPECT_TRUE(d2);
  EXPECT_FALSE(d3);
  EXPECT_EQ(parts[3], p3);

  delete p3;
}

TEST(CompoundAgentAddPart, VectorExpandsForLargePartID) {
  std::vector<FakePart *> parts;
  int replaces = 0;
  bool deleted = false;
  FakePart *p = new FakePart(72, &deleted);

  AddPartLogic(parts, 72, p, replaces);

  EXPECT_GE((int)parts.size(), 73);
  EXPECT_EQ(parts[72], p);
  // All other slots should be null
  for (int i = 0; i < 72; i++) {
    EXPECT_EQ(parts[i], nullptr);
  }

  delete p;
}

TEST(CompoundAgentAddPart, DifferentSlots_NoReplacement) {
  std::vector<FakePart *> parts;
  int replaces = 0;
  bool d1 = false, d2 = false;

  FakePart *p1 = new FakePart(1, &d1);
  FakePart *p2 = new FakePart(2, &d2);

  AddPartLogic(parts, 1, p1, replaces);
  AddPartLogic(parts, 2, p2, replaces);

  EXPECT_EQ(replaces, 0);
  EXPECT_EQ(parts[1], p1);
  EXPECT_EQ(parts[2], p2);
  EXPECT_FALSE(d1);
  EXPECT_FALSE(d2);

  delete p1;
  delete p2;
}
