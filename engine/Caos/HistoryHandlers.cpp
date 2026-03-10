#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "HistoryHandlers.h"
#include "../App.h"
#include "../Creature/Creature.h"
#include "../Creature/LifeFaculty.h"
#include "../Creature/LinguisticFaculty.h"
#include "../IWorldServices.h"
#include "../World.h"

#include "../Display/SharedGallery.h"

void HistoryHandlers::Command_HIST(CAOSMachine &vm) {
  static CommandHandler subcmds[] = {
      SubCommand_HIST_EVNT, SubCommand_HIST_UTXT, SubCommand_HIST_NAME,
      SubCommand_HIST_WIPE, SubCommand_HIST_FOTO,
  };
  int thiscmd;
  thiscmd = vm.FetchOp();
  (subcmds[thiscmd])(vm);
}

void HistoryHandlers::SubCommand_HIST_EVNT(CAOSMachine &vm) {
  CreatureHistory &history = CreatureHistoryHelper(vm);
  int eventType = vm.FetchIntegerRV();

  std::string relatedMoniker1, relatedMoniker2;
  vm.FetchStringRV(relatedMoniker1);
  vm.FetchStringRV(relatedMoniker2);

  history.AddEvent((LifeEvent::EventType)eventType, relatedMoniker1,
                   relatedMoniker2);
}

void HistoryHandlers::SubCommand_HIST_UTXT(CAOSMachine &vm) {
  LifeEvent &event = LifeEventHelper(vm);

  std::string newValue;
  vm.FetchStringRV(newValue);

  event.myUserText = newValue;
}

void HistoryHandlers::SubCommand_HIST_NAME(CAOSMachine &vm) {
  CreatureHistory &history = CreatureHistoryHelper(vm);

  std::string newValue;

  vm.FetchStringRV(newValue);

  if (history.myName != newValue) {
    history.myName = newValue;

    // Tell creature agent to learn its name
    AgentHandle creature =
        theAgentManager.FindCreatureAgentForMoniker(history.myMoniker);

    if (creature.IsValid()) {
      creature.GetCreatureReference().Linguistic()->ClearWordStrength(
          LinguisticFaculty::PERSONAL, LinguisticFaculty::ME);
      creature.GetCreatureReference().Linguistic()->SetWord(
          LinguisticFaculty::PERSONAL, LinguisticFaculty::ME, history.myName,
          false);
    }
  }
}

void HistoryHandlers::SubCommand_HIST_WIPE(CAOSMachine &vm) {
  std::string moniker;
  vm.FetchStringRV(moniker);

  HistoryStore &historyStore = theApp.GetWorld().GetHistoryStore();
  int state = GetOutOfWorldState(historyStore, moniker);

  // only wipe history if there isn't any anyway,
  // if the creature is fully dead, is exported,
  // or is a genome that is no longer referenced
  // and was never made into a creature
  if (state == 0 || state == 6 || state == 4 || state == 7) {
    CreatureHistory &history = historyStore.GetCreatureHistory(moniker);
    for (int i = 0; i < history.Count(); ++i) {
      // attic any photos
      LifeEvent *event = history.GetLifeEvent(i);
      ASSERT(event);
      if (!event->myPhoto.empty()) {
        FilePath filePath(event->myPhoto + ".s16", IMAGES_DIR);
        bool inUse = SharedGallery::QueryGalleryInUse(filePath);

        if (inUse)
          vm.ThrowRunError(CAOSMachine::sidCreatureHistoryPhotoStillInUse);

        theApp.GetWorld().MarkFileForAttic(filePath);

        event->myPhoto = "";
      }
    }

    // wipe history
    historyStore.WipeCreatureHistory(moniker);
  } else
    vm.ThrowRunError(CAOSMachine::sidOnlyWipeTrulyDeadHistory);
}

void HistoryHandlers::SubCommand_HIST_FOTO(CAOSMachine &vm) {
  LifeEvent &event = LifeEventHelper(vm);

  std::string newValue;
  vm.FetchStringRV(newValue);

  if (!event.myPhoto.empty()) {
    FilePath filePath(event.myPhoto + ".s16", IMAGES_DIR);
    bool inUse = SharedGallery::QueryGalleryInUse(filePath);

    if (inUse)
      vm.ThrowRunError(CAOSMachine::sidCreatureHistoryPhotoStillInUse);

    theApp.GetWorld().MarkFileForAttic(filePath);
  }

  event.myPhoto = newValue;
}

int HistoryHandlers::IntegerRV_HIST(CAOSMachine &vm) {
  static IntegerRVHandler subhandlers[] = {
      IntegerRV_HIST_COUN, IntegerRV_HIST_TYPE, IntegerRV_HIST_WTIK,
      IntegerRV_HIST_TAGE, IntegerRV_HIST_RTIM, IntegerRV_HIST_CAGE,
      IntegerRV_HIST_GEND, IntegerRV_HIST_GNUS, IntegerRV_HIST_VARI,
      IntegerRV_HIST_FIND, IntegerRV_HIST_FINR, IntegerRV_HIST_SEAN,
      IntegerRV_HIST_TIME, IntegerRV_HIST_YEAR, IntegerRV_HIST_DATE,
      IntegerRV_HIST_MUTE, IntegerRV_HIST_CROS,
      IntegerRV_HIST_WVET, // DS: index 17 - online verification stub
  };
  int thisrv;
  thisrv = vm.FetchOp();
  return (subhandlers[thisrv])(vm);
}

int HistoryHandlers::IntegerRV_HIST_COUN(CAOSMachine &vm) {
  std::string moniker;
  vm.FetchStringRV(moniker);
  return GetEventCount(theApp.GetWorld().GetHistoryStore(), moniker);
}

LifeEvent &HistoryHandlers::LifeEventHelper(CAOSMachine &vm) {
  std::string moniker;
  vm.FetchStringRV(moniker);
  int eventNo = vm.FetchIntegerRV();
  LifeEvent *lifeEvent = theApp.GetWorld()
                             .GetHistoryStore()
                             .GetCreatureHistory(moniker)
                             .GetLifeEvent(eventNo);
  if (!lifeEvent)
    vm.ThrowRunError(CAOSMachine::sidLifeEventIndexOutofRange);
  return *lifeEvent;
}

CreatureHistory &HistoryHandlers::CreatureHistoryHelper(CAOSMachine &vm) {
  std::string moniker;
  vm.FetchStringRV(moniker);
  return theApp.GetWorld().GetHistoryStore().GetCreatureHistory(moniker);
}

int HistoryHandlers::IntegerRV_HIST_TYPE(CAOSMachine &vm) {
  LifeEvent &ev = LifeEventHelper(vm);
  return GetEventType(ev);
}

int HistoryHandlers::IntegerRV_HIST_WTIK(CAOSMachine &vm) {
  LifeEvent &ev = LifeEventHelper(vm);
  return (int)GetEventWorldTick(ev);
}

int HistoryHandlers::IntegerRV_HIST_TAGE(CAOSMachine &vm) {
  LifeEvent &ev = LifeEventHelper(vm);
  return (int)GetEventAgeInTicks(ev);
}

int HistoryHandlers::IntegerRV_HIST_RTIM(CAOSMachine &vm) {
  LifeEvent &ev = LifeEventHelper(vm);
  return (int)GetEventRealTime(ev);
}

int HistoryHandlers::IntegerRV_HIST_CAGE(CAOSMachine &vm) {
  LifeEvent &ev = LifeEventHelper(vm);
  return GetEventLifeStage(ev);
}

int HistoryHandlers::IntegerRV_HIST_GEND(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  return GetCreatureGender(h);
}

int HistoryHandlers::IntegerRV_HIST_GNUS(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  return GetCreatureGenus(h);
}

int HistoryHandlers::IntegerRV_HIST_VARI(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  return GetCreatureVariant(h);
}

int HistoryHandlers::IntegerRV_HIST_FIND(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  int type = vm.FetchIntegerRV();
  int from = vm.FetchIntegerRV();
  return FindLifeEvent(h, type, from);
}

int HistoryHandlers::IntegerRV_HIST_FINR(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  int type = vm.FetchIntegerRV();
  int from = vm.FetchIntegerRV();
  return FindLifeEventReverse(h, type, from);
}

int HistoryHandlers::IntegerRV_HIST_SEAN(CAOSMachine &vm) {
  int worldTick = vm.FetchIntegerRV();
  return GetHistSeasonAtTick(theApp.GetWorld(), worldTick);
}

int HistoryHandlers::IntegerRV_HIST_TIME(CAOSMachine &vm) {
  int worldTick = vm.FetchIntegerRV();
  return GetHistTimeAtTick(theApp.GetWorld(), worldTick);
}

int HistoryHandlers::IntegerRV_HIST_YEAR(CAOSMachine &vm) {
  int worldTick = vm.FetchIntegerRV();
  return GetHistYearAtTick(theApp.GetWorld(), worldTick);
}

int HistoryHandlers::IntegerRV_HIST_DATE(CAOSMachine &vm) {
  int worldTick = vm.FetchIntegerRV();
  return GetHistDateAtTick(theApp.GetWorld(), worldTick);
}

int HistoryHandlers::IntegerRV_HIST_MUTE(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  return GetCreatureMutationCount(h);
}

int HistoryHandlers::IntegerRV_HIST_CROS(CAOSMachine &vm) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  return GetCreatureCrossCount(h);
}

// DS-specific: was this creature's history online-verified?
// Not applicable offline - always returns 0.
int HistoryHandlers::IntegerRV_HIST_WVET(CAOSMachine &vm) {
  std::string moniker;
  vm.FetchStringRV(moniker); // consume the arg
  return 0;
}

void HistoryHandlers::StringRV_HIST(CAOSMachine &vm, std::string &str) {
  static StringRVHandler substrings[] = {
      StringRV_HIST_MON1, StringRV_HIST_MON2, StringRV_HIST_UTXT,
      StringRV_HIST_WNAM, StringRV_HIST_WUID, StringRV_HIST_NAME,
      StringRV_HIST_NEXT, StringRV_HIST_PREV, StringRV_HIST_FOTO,
      StringRV_HIST_NETU, // DS: index 9 - online network user stub
  };
  int thisst;
  thisst = vm.FetchOp();
  (substrings[thisst])(vm, str);
}

void HistoryHandlers::StringRV_HIST_MON1(CAOSMachine &vm, std::string &str) {
  LifeEvent &ev = LifeEventHelper(vm);
  str = GetEventRelatedMoniker1(ev);
}

void HistoryHandlers::StringRV_HIST_MON2(CAOSMachine &vm, std::string &str) {
  LifeEvent &ev = LifeEventHelper(vm);
  str = GetEventRelatedMoniker2(ev);
}

void HistoryHandlers::StringRV_HIST_UTXT(CAOSMachine &vm, std::string &str) {
  LifeEvent &ev = LifeEventHelper(vm);
  str = GetEventUserText(ev);
}

void HistoryHandlers::StringRV_HIST_WNAM(CAOSMachine &vm, std::string &str) {
  LifeEvent &ev = LifeEventHelper(vm);
  str = GetEventWorldName(ev);
}

void HistoryHandlers::StringRV_HIST_WUID(CAOSMachine &vm, std::string &str) {
  LifeEvent &ev = LifeEventHelper(vm);
  str = GetEventWorldUID(ev);
}

void HistoryHandlers::StringRV_HIST_NAME(CAOSMachine &vm, std::string &str) {
  CreatureHistory &h = CreatureHistoryHelper(vm);
  str = GetCreatureName(h);
}

void HistoryHandlers::StringRV_HIST_NEXT(CAOSMachine &vm, std::string &str) {
  std::string otherMoniker;
  vm.FetchStringRV(otherMoniker);
  str = GetNextMoniker(theApp.GetWorld().GetHistoryStore(), otherMoniker);
}

void HistoryHandlers::StringRV_HIST_PREV(CAOSMachine &vm, std::string &str) {
  std::string otherMoniker;
  vm.FetchStringRV(otherMoniker);
  str = GetPrevMoniker(theApp.GetWorld().GetHistoryStore(), otherMoniker);
}

void HistoryHandlers::StringRV_HIST_FOTO(CAOSMachine &vm, std::string &str) {
  LifeEvent &ev = LifeEventHelper(vm);
  str = GetEventPhoto(ev);
}

int HistoryHandlers::IntegerRV_OOWW(CAOSMachine &vm) {
  std::string moniker;
  vm.FetchStringRV(moniker);
  return GetOutOfWorldState(theApp.GetWorld().GetHistoryStore(), moniker);
}

// DS: HIST NETU moniker event_no
// Returns the DS online username associated with a creature moniker at the
// given life event (same signature as FOTO: "si").
// Offline stub: returns "" (no online account info).
void HistoryHandlers::StringRV_HIST_NETU(CAOSMachine &vm, std::string &str) {
  std::string moniker;
  vm.FetchStringRV(moniker); // consume the moniker arg
  vm.FetchIntegerRV();       // consume the event_no arg
  str = "";
}
