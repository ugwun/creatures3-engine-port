// -------------------------------------------------------------------------
// PointerAgent_Logic.h
//
// Pure-logic helpers extracted from PointerAgent for testability.
// These have NO engine dependencies (no theApp, no theAgentManager, etc.).
// -------------------------------------------------------------------------
#ifndef POINTERAGENT_LOGIC_H
#define POINTERAGENT_LOGIC_H

#include "../Agents/AgentHandle.h"

namespace PointerLogic {

// -------------------------------------------------------------------------
// ResolveClickTarget()
//
// Determines which agent should receive the activation message after a
// left-mouse-button click.
//
// Parameters:
//   findResult          — the agent returned by Find() (visual hit-test,
//                         already sent SCRIPTUIMOUSEDOWN if valid)
//   isTouchingResult    — the agent returned by IsTouching(attrActivateable)
//   findFallbackResult  — a second Find() result used when IsTouching misses
//   findIsActivateable  — whether findResult has the attrActivateable flag
//   fallbackIsActivateable — whether findFallbackResult has attrActivateable
//
// Returns:
//   The agent that should receive the activate message, or NULLHANDLE.
//
// The rule (fixing click-through):
//   1. If Find() already found an agent, use THAT agent for activation
//      (but only if it's activateable — otherwise no activation).
//   2. If Find() found nothing, try IsTouching.
//   3. If IsTouching also found nothing, try the fallback Find().
//
// This ensures clicks never "bleed through" to a different agent behind
// the topmost one.
// -------------------------------------------------------------------------
AgentHandle ResolveClickTarget(AgentHandle findResult,
                               AgentHandle isTouchingResult,
                               AgentHandle findFallbackResult,
                               bool findIsActivateable,
                               bool fallbackIsActivateable);

} // namespace PointerLogic

#endif // POINTERAGENT_LOGIC_H
