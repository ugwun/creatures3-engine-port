// HistoryHandlers_Logic.cpp
// Logic-layer implementations for HistoryHandlers static methods.
// Kept in a separate translation unit so test_HistoryHandlers can link
// against this file without pulling in App, World, AgentManager, SDL,
// or any other engine singleton.
//
// The production handlers in HistoryHandlers.cpp delegate to these.
//
// Method categories:
//   - HistoryStore& queries  (HIST COUN, OOWW, HIST NEXT/PREV)
//   - IWorldServices& time   (HIST SEAN/TIME/YEAR/DATE)
//   - LifeEvent& field reads (HIST
//   TYPE/WTIK/TAGE/RTIM/CAGE/MON1/2/UTXT/WNAM/WUID/FOTO)
//   - CreatureHistory& reads (HIST GEND/GNUS/VARI/MUTE/CROS/NAME/FIND/FINR)

#include "../Creature/History/CreatureHistory.h"
#include "../Creature/History/HistoryStore.h"
#include "../Creature/History/LifeEvent.h"
#include "../IWorldServices.h"
#include "HistoryHandlers.h"
#include <string>

// ---------------------------------------------------------------------------
// HistoryStore queries
// ---------------------------------------------------------------------------

int HistoryHandlers::GetEventCount(HistoryStore &store,
                                   const std::string &moniker) {
  if (!store.IsThereCreatureHistory(moniker))
    return 0;
  return store.GetCreatureHistory(moniker).Count();
}

int HistoryHandlers::GetOutOfWorldState(HistoryStore &store,
                                        const std::string &moniker) {
  return store.GetOutOfWorldState(moniker);
}

std::string HistoryHandlers::GetNextMoniker(HistoryStore &store,
                                            const std::string &moniker) {
  return store.Next(moniker);
}

std::string HistoryHandlers::GetPrevMoniker(HistoryStore &store,
                                            const std::string &moniker) {
  return store.Previous(moniker);
}

// ---------------------------------------------------------------------------
// IWorldServices time queries at a given world tick (HIST SEAN/TIME/YEAR/DATE)
// ---------------------------------------------------------------------------

int HistoryHandlers::GetHistSeasonAtTick(IWorldServices &world,
                                         uint32 worldTick) {
  return world.GetSeason(false, worldTick);
}

int HistoryHandlers::GetHistTimeAtTick(IWorldServices &world,
                                       uint32 worldTick) {
  return world.GetTimeOfDay(false, worldTick);
}

int HistoryHandlers::GetHistYearAtTick(IWorldServices &world,
                                       uint32 worldTick) {
  return (int)world.GetYearsElapsed(false, worldTick);
}

int HistoryHandlers::GetHistDateAtTick(IWorldServices &world,
                                       uint32 worldTick) {
  return world.GetDayInSeason(false, worldTick);
}

// ---------------------------------------------------------------------------
// LifeEvent field readers
// ---------------------------------------------------------------------------

int HistoryHandlers::GetEventType(LifeEvent &ev) { return (int)ev.myEventType; }

uint32 HistoryHandlers::GetEventWorldTick(LifeEvent &ev) {
  return ev.myWorldTick;
}

uint32 HistoryHandlers::GetEventAgeInTicks(LifeEvent &ev) {
  return ev.myAgeInTicks;
}

uint32 HistoryHandlers::GetEventRealTime(LifeEvent &ev) {
  return ev.myRealWorldTime;
}

int HistoryHandlers::GetEventLifeStage(LifeEvent &ev) { return ev.myLifeStage; }

std::string HistoryHandlers::GetEventRelatedMoniker1(LifeEvent &ev) {
  return ev.myRelatedMoniker1;
}

std::string HistoryHandlers::GetEventRelatedMoniker2(LifeEvent &ev) {
  return ev.myRelatedMoniker2;
}

std::string HistoryHandlers::GetEventUserText(LifeEvent &ev) {
  return ev.myUserText;
}

std::string HistoryHandlers::GetEventWorldName(LifeEvent &ev) {
  return ev.myWorldName;
}

std::string HistoryHandlers::GetEventWorldUID(LifeEvent &ev) {
  return ev.myWorldUniqueIdentifier;
}

std::string HistoryHandlers::GetEventPhoto(LifeEvent &ev) { return ev.myPhoto; }

// ---------------------------------------------------------------------------
// CreatureHistory field readers
// ---------------------------------------------------------------------------

int HistoryHandlers::GetCreatureGender(CreatureHistory &h) {
  return h.myGender;
}

int HistoryHandlers::GetCreatureGenus(CreatureHistory &h) {
  // CAOS: genus is 1-based (norn=1 … geat=4); stored as 0-based internally
  return h.myGenus + 1;
}

int HistoryHandlers::GetCreatureVariant(CreatureHistory &h) {
  return h.myVariant;
}

int HistoryHandlers::GetCreatureMutationCount(CreatureHistory &h) {
  return h.myCrossoverMutationCount;
}

int HistoryHandlers::GetCreatureCrossCount(CreatureHistory &h) {
  return h.myCrossoverCrossCount;
}

std::string HistoryHandlers::GetCreatureName(CreatureHistory &h) {
  return h.myName;
}

int HistoryHandlers::FindLifeEvent(CreatureHistory &h, int eventType,
                                   int fromIndex) {
  return h.FindLifeEvent((LifeEvent::EventType)eventType, fromIndex);
}

int HistoryHandlers::FindLifeEventReverse(CreatureHistory &h, int eventType,
                                          int fromIndex) {
  return h.FindLifeEventReverse((LifeEvent::EventType)eventType, fromIndex);
}
