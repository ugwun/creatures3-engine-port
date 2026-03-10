// -------------------------------------------------------------------------
// Filename:    IWorldServices.h
// Purpose:     Narrow abstract interface exposing the subset of World that
//              CAOS handlers actually need.
//
//              Extracting this interface allows:
//              1. Test doubles for World (so handlers can be unit-tested
//                 without a full App + SDL + filesystem).
//              2. Clearer documentation of which subsystems the CAOS layer
//                 actually depends on.
//
// Usage:
//   World derives from IWorldServices and overrides these pure virtuals.
//   Handlers that currently access theApp.GetWorld() directly can migrate
//   to accept an IWorldServices& parameter instead, enabling injection.
//   Existing code is NOT changed — this is purely additive.
// -------------------------------------------------------------------------

#ifndef IWORLDSERVICES_H
#define IWORLDSERVICES_H

#include "../common/C2eTypes.h"
#include "Agents/AgentHandle.h"
#include <string>

class Scriptorium;
class HistoryStore;
class CAOSVar;

// -------------------------------------------------------------------------
// Class: IWorldServices
// A narrow read/write façade over the parts of World consumed by CAOS
// handlers: the scriptorium, game variables, world tick and history store.
// -------------------------------------------------------------------------
class IWorldServices {
public:
  virtual ~IWorldServices() {}

  // Script repository (read + write scripts)
  virtual Scriptorium &GetScriptorium() = 0;

  // Global game variables (string-keyed CAOSVar store)
  virtual CAOSVar &GetGameVar(const std::string &name) = 0;
  virtual void DeleteGameVar(const std::string &name) = 0;
  virtual std::string GetNextGameVar(const std::string &name) = 0;

  // World simulation tick counter
  virtual uint32 GetWorldTick() const = 0;

  // Pause state
  virtual bool GetPausedWorldTick() const = 0;
  virtual void SetPausedWorldTick(bool paused) = 0;

  // World identity
  virtual std::string GetWorldName() const = 0;
  virtual std::string GetUniqueIdentifier() const = 0;

  // World enumeration
  virtual int WorldCount() = 0;
  virtual bool WorldName(int index, std::string &name) = 0;

  // Time of day / season queries (useCurrentTime=true uses world tick)
  virtual int GetTimeOfDay(bool useCurrentTime = true,
                           uint32 worldTick = 0) = 0;
  virtual int GetSeason(bool useCurrentTime = true, uint32 worldTick = 0) = 0;
  virtual int GetDayInSeason(bool useCurrentTime = true,
                             uint32 worldTick = 0) = 0;
  virtual uint32 GetYearsElapsed(bool useCurrentTime = true,
                                 uint32 worldTick = 0) = 0;

  // Message queue (MESG WRIT / WRT+ / CALL)
  virtual void WriteMessage(AgentHandle const &from, AgentHandle const &to,
                            int msg, CAOSVar const &p1, CAOSVar const &p2,
                            unsigned delay) = 0;

  // Selected creature (NORN / TARG + SET-NORN)
  virtual AgentHandle GetSelectedCreature() = 0;
  virtual void SetSelectedCreature(AgentHandle &h) = 0;

  // Creature life-history store
  virtual HistoryStore &GetHistoryStore() = 0;
};

#endif // IWORLDSERVICES_H
