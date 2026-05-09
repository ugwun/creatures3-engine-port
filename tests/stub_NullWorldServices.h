// stub_NullWorldServices.h
// Safe do-nothing implementation of IWorldServices for tests.
// Tests subclass and override only the methods they care about.
//
// Scriptorium and HistoryStore are NOT stubbed here — tests that need
// them must include the full engine headers and override those methods.

#pragma once
#include "engine/Caos/CAOSVar.h"
#include "engine/IWorldServices.h"
#include <map>
#include <stdexcept>
#include <string>

// Forward declarations only — not defined here
class Scriptorium;
class HistoryStore;

class NullWorldServices : public IWorldServices {
public:
  // Scriptorium — aborts if unexpectedly called
  Scriptorium &GetScriptorium() override {
    throw std::logic_error("NullWorldServices::GetScriptorium() not stubbed");
  }

  // Game vars — backed by a local map for basic tests
  CAOSVar &GetGameVar(const std::string &name) override { return myVars[name]; }
  void DeleteGameVar(const std::string &name) override { myVars.erase(name); }
  std::string GetNextGameVar(const std::string &) override {
    return std::string();
  }

  // World tick
  uint32 GetWorldTick() const override { return 0; }

  // Pause state
  bool GetPausedWorldTick() const override { return false; }
  void SetPausedWorldTick(bool) override {}

  // World identity
  std::string GetWorldName() const override { return std::string(); }
  std::string GetUniqueIdentifier() const override { return std::string(); }

  // World enumeration
  int WorldCount() override { return 0; }
  bool WorldName(int, std::string &) override { return false; }

  // Time / season — all return 0 by default
  int GetTimeOfDay(bool = true, uint32 = 0) override { return 0; }
  int GetSeason(bool = true, uint32 = 0) override { return 0; }
  int GetDayInSeason(bool = true, uint32 = 0) override { return 0; }
  uint32 GetYearsElapsed(bool = true, uint32 = 0) override { return 0; }

  // Message queue — no-op by default; override to capture in test doubles
  void WriteMessage(AgentHandle const &, AgentHandle const &, int,
                    CAOSVar const &, CAOSVar const &, unsigned) override {}

  // Selected creature — null by default
  AgentHandle GetSelectedCreature() override { return AgentHandle(); }
  void SetSelectedCreature(AgentHandle &) override {}

  // HistoryStore — aborts if unexpectedly called
  HistoryStore &GetHistoryStore() override {
    throw std::logic_error("NullWorldServices::GetHistoryStore() not stubbed");
  }

private:
  std::map<std::string, CAOSVar> myVars;
};
