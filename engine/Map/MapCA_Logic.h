#ifndef MAP_CA_LOGIC_H
#define MAP_CA_LOGIC_H

#include "Map.h"

namespace MapCALogic {

inline MapDirection ClassifyLinkedRoomDirection(
    const Vector2D &currentMin, const Vector2D &currentMax,
    const Vector2D &currentCentre, const Vector2D &targetMin,
    const Vector2D &targetMax, const Vector2D &targetCentre) {
  // Linked rooms on separate vertical bands represent travel between levels,
  // even when their centres are offset horizontally (for example, a lift).
  if (targetMin.y >= currentMax.y)
    return GO_DOWN;
  if (targetMax.y <= currentMin.y)
    return GO_UP;

  // Preserve the original diagonal-sector classification for overlapping or
  // otherwise ambiguous room geometry.
  Vector2D delta = targetCentre - currentCentre;
  float sideOfForwardSlashLine = delta.x + delta.y;
  float sideOfBackSlashLine = delta.x - delta.y;

  return sideOfForwardSlashLine > 0.0f
             ? (sideOfBackSlashLine > 0.0f ? GO_RIGHT : GO_DOWN)
             : (sideOfBackSlashLine > 0.0f ? GO_UP : GO_LEFT);
}

} // namespace MapCALogic

#endif // MAP_CA_LOGIC_H
