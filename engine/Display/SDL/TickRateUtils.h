// -------------------------------------------------------------------------
// Filename:    TickRateUtils.h
// -------------------------------------------------------------------------
// Pure utility functions for game tick-rate calculation.
// Extracted from the SDL main loop so the logic can be unit-tested
// without any SDL or engine dependencies.
// -------------------------------------------------------------------------

#ifndef TICK_RATE_UTILS_H
#define TICK_RATE_UTILS_H

#include <cstdint>

// Compute the effective tick interval in milliseconds, given the engine's
// base interval (from GetWorldTickInterval(), typically 50ms) and a user-
// supplied game-speed multiplier (from --gamespeed).
//
// The multiplier divides the base interval:
//   multiplier 1.0 → 50ms  (normal)
//   multiplier 2.0 → 25ms  (2× speed)
//   multiplier 0.5 → 100ms (half speed)
//
// The result is clamped to a minimum of 1ms so we never pass 0 to
// SDL_Delay().  A non-positive multiplier is treated as 1.0 (no scaling).
inline uint32_t ComputeEffectiveTickInterval(uint32_t baseIntervalMs,
                                             float gameSpeedMultiplier) {
  if (gameSpeedMultiplier <= 0.0f)
    gameSpeedMultiplier = 1.0f;

  uint32_t interval = static_cast<uint32_t>(baseIntervalMs / gameSpeedMultiplier);
  if (interval < 1)
    interval = 1;
  return interval;
}

// Compute how many milliseconds the main loop should sleep after a tick,
// given the target effective interval and how many milliseconds the tick
// actually took.  Returns 0 if the tick overran the interval (no sleep).
inline uint32_t ComputeSleepDuration(uint32_t effectiveIntervalMs,
                                     uint32_t elapsedMs) {
  if (elapsedMs >= effectiveIntervalMs)
    return 0;
  return effectiveIntervalMs - elapsedMs;
}

#endif // TICK_RATE_UTILS_H
