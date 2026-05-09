// AgentHandlers_Logic.cpp
// Logic-layer implementations for AgentHandlers static IWorldServices&
// methods. Kept in a separate translation unit so tests can link against
// this file without pulling in App, SDL, or any engine singleton.
//
// The production handlers in AgentHandlers.cpp delegate to these.

#include "../Agents/AgentHandle.h"
#include "../Caos/CAOSVar.h"
#include "../IWorldServices.h"
#include "AgentHandlers.h"

// ---------------------------------------------------------------------------
// SendMessage — used by MESG WRIT, MESG WRT+, and CALL
// ---------------------------------------------------------------------------

void AgentHandlers::SendMessage(IWorldServices &world, AgentHandle const &from,
                                AgentHandle const &to, int msgid,
                                CAOSVar const &p1, CAOSVar const &p2,
                                unsigned delay) {
  world.WriteMessage(from, to, msgid, p1, p2, delay);
}

// ---------------------------------------------------------------------------
// GetSelectedCreature — used by NORN
// ---------------------------------------------------------------------------

AgentHandle AgentHandlers::GetSelectedCreature(IWorldServices &world) {
  return world.GetSelectedCreature();
}
