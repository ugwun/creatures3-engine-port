// -------------------------------------------------------------------------
// PointerAgent_Logic.cpp
//
// Pure-logic helpers extracted from PointerAgent::ScanInputEvents().
// Linked into both lc2e and test_PointerAgent.
// -------------------------------------------------------------------------

#include "PointerAgent_Logic.h"

namespace PointerLogic {

AgentHandle ResolveClickTarget(AgentHandle findResult,
                               AgentHandle isTouchingResult,
                               AgentHandle findFallbackResult,
                               bool findIsActivateable,
                               bool fallbackIsActivateable) {
  if (findResult.IsValid()) {
    // Find() already identified the topmost agent.  Only activate it
    // if it actually has the activateable attribute.
    if (findIsActivateable) {
      return findResult;
    }
    // Topmost agent isn't activateable — no activation at all.
    // (Don't fall through to IsTouching, or we'd click-through.)
    return AgentHandle();
  }

  // Find() didn't match anything — try IsTouching.
  if (isTouchingResult.IsValid()) {
    return isTouchingResult;
  }

  // IsTouching also missed — try the fallback Find() result.
  if (findFallbackResult.IsValid() && fallbackIsActivateable) {
    return findFallbackResult;
  }

  return AgentHandle(); // nothing to activate
}

} // namespace PointerLogic
