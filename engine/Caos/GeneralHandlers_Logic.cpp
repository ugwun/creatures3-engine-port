// GeneralHandlers_Logic.cpp
// Logic-layer implementations for GeneralHandlers static IWorldServices&
// methods. Kept in a separate translation unit so test_GeneralHandlers can
// link against this file without pulling in App, SDL, or any engine deps
// beyond IWorldServices.h.
//
// The production handlers in GeneralHandlers.cpp delegate to these.

#include "../IWorldServices.h"
#include "GeneralHandlers.h"
#include <string>

// ---------------------------------------------------------------------------
// Time of day / season
// ---------------------------------------------------------------------------

int GeneralHandlers::GetTimeOfDay(IWorldServices &world) {
  return world.GetTimeOfDay();
}

int GeneralHandlers::GetSeason(IWorldServices &world) {
  return world.GetSeason();
}

int GeneralHandlers::GetDayInSeason(IWorldServices &world) {
  return world.GetDayInSeason();
}

uint32 GeneralHandlers::GetWorldTick(IWorldServices &world) {
  return world.GetWorldTick();
}

uint32 GeneralHandlers::GetYearsElapsed(IWorldServices &world) {
  return world.GetYearsElapsed();
}

// ---------------------------------------------------------------------------
// World enumeration
// ---------------------------------------------------------------------------

int GeneralHandlers::GetWorldCount(IWorldServices &world) {
  return world.WorldCount();
}

int GeneralHandlers::WorldNameToIndex(IWorldServices &world,
                                      const std::string &name) {
  int max = world.WorldCount();
  for (int i = 0; i < max; i++) {
    std::string wname;
    if (world.WorldName(i, wname) && wname == name)
      return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// World identity
// ---------------------------------------------------------------------------

std::string GeneralHandlers::GetWorldName(IWorldServices &world) {
  return world.GetWorldName();
}

std::string GeneralHandlers::GetWorldUID(IWorldServices &world) {
  return world.GetUniqueIdentifier();
}

// ---------------------------------------------------------------------------
// Pause state
// ---------------------------------------------------------------------------

bool GeneralHandlers::GetWorldPaused(IWorldServices &world) {
  return world.GetPausedWorldTick();
}
