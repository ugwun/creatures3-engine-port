// MapHandlers_Logic.cpp
// Logic-layer implementations for the MapHandlers static IMap& methods.
//
// Kept in a separate translation unit so that test_MapHandlers can link
// against this file without pulling in App, Agent, Camera, or SDL
// (all of which MapHandlers.cpp depends on).
//
// The production MapHandlers.cpp delegates its thin wrappers to these
// functions; tests call them directly by passing a NullMap/FakeMap.

#include "../Map/IMap.h"
#include "MapHandlers.h"

#include <sstream>
#include <string>

int MapHandlers::GetMapWidth(IMap &map) {
  int w, h;
  map.GetMapDimensions(w, h);
  return w;
}

int MapHandlers::GetMapHeight(IMap &map) {
  int w, h;
  map.GetMapDimensions(w, h);
  return h;
}

int MapHandlers::GetRoomAtPoint(IMap &map, float x, float y) {
  int roomID;
  if (!map.GetRoomIDForPoint(Vector2D(x, y), roomID))
    return -1;
  return roomID;
}

int MapHandlers::GetMetaRoomAtPoint(IMap &map, float x, float y) {
  int metaRoomID;
  if (!map.GetMetaRoomIDForPoint(Vector2D(x, y), metaRoomID))
    return -1;
  return metaRoomID;
}

int MapHandlers::GetRoomType(IMap &map, int roomID) {
  if (roomID < 0)
    return -1;
  int type;
  if (!map.GetRoomType(roomID, type))
    return -1;
  return type;
}

float MapHandlers::GetRoomProperty(IMap &map, int roomID, int caIndex) {
  if (roomID < 0)
    return 0.0f;
  float value = 0.0f;
  map.GetRoomProperty(roomID, caIndex, value);
  return value;
}

int MapHandlers::GetDoorPermeability(IMap &map, int id1, int id2) {
  int perm;
  if (!map.GetDoorPermiability(id1, id2, perm))
    return -1;
  return perm;
}

int MapHandlers::GetLinkPermeability(IMap &map, int id1, int id2) {
  int perm;
  if (!map.GetLinkPermiability(id1, id2, perm))
    return -1;
  return perm;
}

int MapHandlers::GetRoomWithHighestCA(IMap &map, int roomID, int caIndex,
                                      bool includeCurrent) {
  int result;
  if (!map.GetRoomIDWithHighestCA(roomID, caIndex, includeCurrent, result))
    return -1;
  return result;
}

int MapHandlers::GetRoomWithLowestCA(IMap &map, int roomID, int caIndex,
                                     bool includeCurrent) {
  int result;
  if (!map.GetRoomIDWithLowestCA(roomID, caIndex, includeCurrent, result))
    return -1;
  return result;
}

std::string MapHandlers::GetRoomLocation(IMap &map, int roomID) {
  int metaRoomID, xLeft, xRight, yLeftCeiling, yRightCeiling, yLeftFloor,
      yRightFloor;
  if (!map.GetRoomLocation(roomID, metaRoomID, xLeft, xRight, yLeftCeiling,
                           yRightCeiling, yLeftFloor, yRightFloor))
    return std::string();
  std::stringstream s;
  s << xLeft << ' ' << xRight << ' ' << yLeftCeiling << ' ' << yRightCeiling
    << ' ' << yLeftFloor << ' ' << yRightFloor;
  return s.str();
}

std::string MapHandlers::GetMetaRoomLocation(IMap &map, int metaRoomID) {
  int posX, posY, w, h;
  if (!map.GetMetaRoomLocation(metaRoomID, posX, posY, w, h))
    return std::string();
  std::stringstream s;
  s << posX << ' ' << posY << ' ' << w << ' ' << h;
  return s.str();
}

std::string MapHandlers::GetMetaRoomIDs(IMap &map) {
  IntegerCollection ids;
  map.GetMetaRoomIDCollection(ids);
  std::stringstream s;
  for (IntegerIterator i = ids.begin(); i != ids.end(); ++i)
    s << ' ' << *i;
  return s.str();
}

std::string MapHandlers::GetRoomIDs(IMap &map, int metaRoomID) {
  IntegerCollection ids;
  int count;
  if (metaRoomID == -1)
    map.GetRoomIDCollection(ids);
  else if (!map.GetRoomIDCollectionForMetaRoom(metaRoomID, ids, count))
    return std::string();
  std::stringstream s;
  for (IntegerIterator i = ids.begin(); i != ids.end(); ++i)
    s << ' ' << *i;
  return s.str();
}

int MapHandlers::GetCurrentMetaRoom(IMap &map) {
  return map.GetCurrentMetaRoom();
}
