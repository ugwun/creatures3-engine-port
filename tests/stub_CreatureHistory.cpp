// stub_CreatureHistory.cpp
// Minimal stub for CreatureHistory used by test_HistoryHandlers.
//
// The production CreatureHistory.cpp uses theApp, theAgentManager, and
// theWorld in AddEvent(). This stub reimplements only the methods needed
// by tests (GetLifeEvent, FindLifeEvent, FindLifeEventReverse, Count,
// and the archive operators as no-ops). The constructor and field
// initialisation are preserved exactly.

#include "engine/Creature/History/CreatureHistory.h"

CreatureHistory::CreatureHistory()
    : myGender(-1), myGenus(-1), myVariant(-1), myCrossoverMutationCount(-1),
      myCrossoverCrossCount(-1) {}

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

int CreatureHistory::FindLifeEventReverse(const LifeEvent::EventType &eventType,
                                          int fromIndex) {
  if (fromIndex == -1 || fromIndex > (int)myLifeEvents.size())
    fromIndex = (int)myLifeEvents.size();
  for (int i = fromIndex - 1; i >= 0; --i) {
    if (myLifeEvents[i].myEventType == eventType)
      return i;
  }
  return -1;
}

// AddEvent — no-op stub (test doesn't call this; avoids theApp/theAgentManager)
void CreatureHistory::AddEvent(const LifeEvent::EventType &,
                               const std::string &, const std::string &, bool) {
}

// Archive operators — no-op stubs
CreaturesArchive &operator<<(CreaturesArchive &a, CreatureHistory const &) {
  return a;
}
CreaturesArchive &operator>>(CreaturesArchive &a, CreatureHistory &) {
  return a;
}
