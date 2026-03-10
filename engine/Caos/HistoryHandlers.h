#ifndef HISTORY_HANDLERS_H
#define HISTORY_HANDLERS_H

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "CAOSMachine.h"

#include <string>

#include "../../common/C2eTypes.h"

class LifeEvent;
class CreatureHistory;
class HistoryStore;
class IWorldServices;

class HistoryHandlers {
public:
  static void Command_HIST(CAOSMachine &vm);
  static int IntegerRV_HIST(CAOSMachine &vm);
  static void StringRV_HIST(CAOSMachine &vm, std::string &str);
  static int IntegerRV_OOWW(CAOSMachine &vm);

  // -----------------------------------------------------------------------
  // Testable logic layer — accept concrete data objects instead of theApp
  // so tests can inject real HistoryStore / CreatureHistory / LifeEvent
  // values without the full engine singleton stack.
  // -----------------------------------------------------------------------

  // HistoryStore queries (HIST COUN, OOWW, HIST NEXT/PREV)
  static int GetEventCount(HistoryStore &store, const std::string &moniker);
  static int GetOutOfWorldState(HistoryStore &store,
                                const std::string &moniker);
  static std::string GetNextMoniker(HistoryStore &store,
                                    const std::string &moniker);
  static std::string GetPrevMoniker(HistoryStore &store,
                                    const std::string &moniker);

  // IWorldServices time at a given world-tick (HIST SEAN/TIME/YEAR/DATE)
  static int GetHistSeasonAtTick(IWorldServices &world, uint32 worldTick);
  static int GetHistTimeAtTick(IWorldServices &world, uint32 worldTick);
  static int GetHistYearAtTick(IWorldServices &world, uint32 worldTick);
  static int GetHistDateAtTick(IWorldServices &world, uint32 worldTick);

  // LifeEvent field readers (HIST
  // TYPE/WTIK/TAGE/RTIM/CAGE/MON1/2/UTXT/WNAM/WUID/FOTO)
  static int GetEventType(LifeEvent &ev);
  static uint32 GetEventWorldTick(LifeEvent &ev);
  static uint32 GetEventAgeInTicks(LifeEvent &ev);
  static uint32 GetEventRealTime(LifeEvent &ev);
  static int GetEventLifeStage(LifeEvent &ev);
  static std::string GetEventRelatedMoniker1(LifeEvent &ev);
  static std::string GetEventRelatedMoniker2(LifeEvent &ev);
  static std::string GetEventUserText(LifeEvent &ev);
  static std::string GetEventWorldName(LifeEvent &ev);
  static std::string GetEventWorldUID(LifeEvent &ev);
  static std::string GetEventPhoto(LifeEvent &ev);

  // CreatureHistory field readers (HIST
  // GEND/GNUS/VARI/MUTE/CROS/NAME/FIND/FINR)
  static int GetCreatureGender(CreatureHistory &h);
  static int GetCreatureGenus(CreatureHistory &h);
  static int GetCreatureVariant(CreatureHistory &h);
  static int GetCreatureMutationCount(CreatureHistory &h);
  static int GetCreatureCrossCount(CreatureHistory &h);
  static std::string GetCreatureName(CreatureHistory &h);
  static int FindLifeEvent(CreatureHistory &h, int eventType, int fromIndex);
  static int FindLifeEventReverse(CreatureHistory &h, int eventType,
                                  int fromIndex);

private:
  static void SubCommand_HIST_EVNT(CAOSMachine &vm);
  static void SubCommand_HIST_UTXT(CAOSMachine &vm);
  static void SubCommand_HIST_NAME(CAOSMachine &vm);
  static void SubCommand_HIST_WIPE(CAOSMachine &vm);
  static void SubCommand_HIST_FOTO(CAOSMachine &vm);

  static int IntegerRV_HIST_COUN(CAOSMachine &vm);
  static int IntegerRV_HIST_TYPE(CAOSMachine &vm);
  static int IntegerRV_HIST_WTIK(CAOSMachine &vm);
  static int IntegerRV_HIST_TAGE(CAOSMachine &vm);
  static int IntegerRV_HIST_RTIM(CAOSMachine &vm);
  static int IntegerRV_HIST_CAGE(CAOSMachine &vm);
  static int IntegerRV_HIST_GEND(CAOSMachine &vm);
  static int IntegerRV_HIST_GNUS(CAOSMachine &vm);
  static int IntegerRV_HIST_VARI(CAOSMachine &vm);
  static int IntegerRV_HIST_FIND(CAOSMachine &vm);
  static int IntegerRV_HIST_FINR(CAOSMachine &vm);
  static int IntegerRV_HIST_SEAN(CAOSMachine &vm);
  static int IntegerRV_HIST_TIME(CAOSMachine &vm);
  static int IntegerRV_HIST_YEAR(CAOSMachine &vm);
  static int IntegerRV_HIST_DATE(CAOSMachine &vm);
  static int IntegerRV_HIST_MUTE(CAOSMachine &vm);
  static int IntegerRV_HIST_CROS(CAOSMachine &vm);
  static int
  IntegerRV_HIST_WVET(CAOSMachine &vm); // DS: online verification stub

  static void StringRV_HIST_MON1(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_MON2(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_UTXT(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_WNAM(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_WUID(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_NAME(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_NEXT(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_PREV(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_FOTO(CAOSMachine &vm, std::string &str);
  static void StringRV_HIST_NETU(CAOSMachine &vm,
                                 std::string &str); // DS: online user stub

  static LifeEvent &LifeEventHelper(CAOSMachine &vm);
  static CreatureHistory &CreatureHistoryHelper(CAOSMachine &vm);
};

#endif // HISTORY_HANDLERS_H
