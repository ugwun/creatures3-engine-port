// stub_V39_CreatureHistory.cpp
// CreatureHistory stub for test_V39Serialization.
//
// Contains the REAL serialization operators (operator<<, operator>>)
// and constructor/GetLifeEvent/Find methods, but stubs out AddEvent()
// to avoid pulling in theAgentManager, theApp.GetWorld(), etc.

#include "engine/Creature/History/CreatureHistory.h"
#include "engine/CreaturesArchive.h"

CreatureHistory::CreatureHistory()
    : myGender(-1), myGenus(-1), myVariant(-1),
      myCrossoverMutationCount(-1), myCrossoverCrossCount(-1),
      myWarpHoleVeteran(true), myDSUser(false) {}

LifeEvent *CreatureHistory::GetLifeEvent(int i) {
  if (i < 0 || i >= (int)myLifeEvents.size())
    return nullptr;
  return &myLifeEvents[i];
}

int CreatureHistory::FindLifeEvent(const LifeEvent::EventType &eventType,
                                   int fromIndex) {
  if (fromIndex < -1)
    fromIndex = -1;
  for (int i = fromIndex + 1; i < (int)myLifeEvents.size(); ++i) {
    if (myLifeEvents[i].myEventType == eventType)
      return i;
  }
  return -1;
}

int CreatureHistory::FindLifeEventReverse(
    const LifeEvent::EventType &eventType, int fromIndex) {
  if (fromIndex == -1 || fromIndex > (int)myLifeEvents.size())
    fromIndex = (int)myLifeEvents.size();
  for (int i = fromIndex - 1; i >= 0; --i) {
    if (myLifeEvents[i].myEventType == eventType)
      return i;
  }
  return -1;
}

// AddEvent — stub to avoid theAgentManager/theApp.GetWorld() dependencies
void CreatureHistory::AddEvent(const LifeEvent::EventType &,
                               const std::string &, const std::string &,
                               bool) {}

// ---------------------------------------------------------------------------
// REAL serialization operators (copied from CreatureHistory.cpp)
// These are the code paths under test.
// ---------------------------------------------------------------------------

CreaturesArchive &operator<<(CreaturesArchive &archive,
                             CreatureHistory const &creatureHistory) {
  archive << creatureHistory.myMoniker;
  archive << creatureHistory.myName;
  archive << creatureHistory.myGender;
  archive << creatureHistory.myGenus;
  archive << creatureHistory.myVariant;
  archive << creatureHistory.myLifeEvents;
  archive << creatureHistory.myCrossoverMutationCount;
  archive << creatureHistory.myCrossoverCrossCount;
  return archive;
}

CreaturesArchive &operator>>(CreaturesArchive &archive,
                             CreatureHistory &creatureHistory) {
  archive >> creatureHistory.myMoniker;
  archive >> creatureHistory.myName;
  archive >> creatureHistory.myGender;
  archive >> creatureHistory.myGenus;
  archive >> creatureHistory.myVariant;
  archive >> creatureHistory.myLifeEvents;
  archive >> creatureHistory.myCrossoverMutationCount;
  archive >> creatureHistory.myCrossoverCrossCount;

  // DS v39 extra fields
  if (archive.GetFileVersion() >= 23) {
    int warpVet, dsUser;
    archive >> warpVet;
    creatureHistory.myWarpHoleVeteran = (warpVet != 0);
    archive >> dsUser;
    creatureHistory.myDSUser = (dsUser != 0);
  } else {
    creatureHistory.myWarpHoleVeteran = true;
    creatureHistory.myDSUser = false;
  }

  if (archive.GetFileVersion() >= 28) {
    archive >> creatureHistory.myNetworkUser;
  }

  return archive;
}
