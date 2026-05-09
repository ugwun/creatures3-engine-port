// stub_HistoryStore.cpp
// Minimal stub for HistoryStore used by test_HistoryHandlers.
//
// The production HistoryStore.cpp includes App.h, World.h, Creature.h and
// calls theAgentManager in GetOutOfWorldState(). This stub reimplements
// the methods exercised by the logic-layer tests — the pure data methods
// (GetCreatureHistory, IsThereCreatureHistory, Next, Previous,
// WipeCreatureHistory) — without any singleton deps.
//
// GetOutOfWorldState() is forwarded to a simple stub that returns 0
// (unknown) for any moniker not in the map, without touching theAgentManager.

#include "engine/Creature/History/HistoryStore.h"

CreatureHistory &HistoryStore::GetCreatureHistory(const std::string &moniker) {
  if (moniker.empty())
    return myNullHistory;
  CreatureHistory &h = myCreatureHistories[moniker];
  if (h.myMoniker.empty())
    h.myMoniker = moniker;
  return h;
}

bool HistoryStore::IsThereCreatureHistory(const std::string &moniker) const {
  if (moniker.empty())
    return false;
  return myCreatureHistories.find(moniker) != myCreatureHistories.end();
}

void HistoryStore::WipeCreatureHistory(const std::string &moniker) {
  auto it = myCreatureHistories.find(moniker);
  if (it != myCreatureHistories.end())
    myCreatureHistories.erase(it);
}

std::string HistoryStore::Next(const std::string &current) {
  if (myCreatureHistories.empty())
    return "";
  if (current.empty() || !IsThereCreatureHistory(current))
    return myCreatureHistories.begin()->first;
  auto next = myCreatureHistories.find(current);
  ++next;
  if (next == myCreatureHistories.end())
    return "";
  return next->first;
}

std::string HistoryStore::Previous(const std::string &current) {
  if (myCreatureHistories.empty())
    return "";
  if (current.empty() || !IsThereCreatureHistory(current))
    return (--myCreatureHistories.end())->first;
  auto prev = myCreatureHistories.find(current);
  if (prev == myCreatureHistories.begin())
    return "";
  --prev;
  return prev->first;
}

// Stub: no AgentManager access — returns 0 (never existed) for unknown
// monikers, inspects only event types for known monikers.
int HistoryStore::GetOutOfWorldState(const std::string &moniker) {
  if (!IsThereCreatureHistory(moniker))
    return 0;
  CreatureHistory &h = GetCreatureHistory(moniker);
  if (h.Count() == 0)
    return 0;
  // Scan events for died/exported/imported
  bool exported = false, died = false, foundExpInp = false;
  for (int i = h.Count() - 1; i >= 0; --i) {
    LifeEvent *ev = h.GetLifeEvent(i);
    if (!ev)
      continue;
    if (!foundExpInp && ev->myEventType == LifeEvent::typeExported) {
      foundExpInp = true;
      exported = true;
    } else if (!foundExpInp && ev->myEventType == LifeEvent::typeImported) {
      foundExpInp = true;
      exported = false;
    } else if (ev->myEventType == LifeEvent::typeDied) {
      died = true;
    }
  }
  if (died && !exported)
    return 6;
  if (exported)
    return 4;
  return 7; // referenced genome without creature agent (no AgentManager here)
}

bool HistoryStore::ReconcileImportedHistory(const std::string &,
                                            CreatureHistory &, bool) {
  return false; // not needed by tests
}

// Archive operators — no-op stubs (test doesn't serialise)
CreaturesArchive &operator<<(CreaturesArchive &a, HistoryStore const &) {
  return a;
}
CreaturesArchive &operator>>(CreaturesArchive &a, HistoryStore &) { return a; }
