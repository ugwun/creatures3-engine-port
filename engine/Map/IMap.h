// -------------------------------------------------------------------------
// Filename:    IMap.h
// Purpose:     Narrow abstract interface exposing the subset of Map that
//              CAOS handlers (and other callers) actually need.
//
//              Extracting this interface allows:
//              1. Test doubles for Map, so MapHandlers can be unit-tested
//                 without a full room graph + physics infrastructure.
//              2. Clearer documentation of which operations the CAOS layer
//                 actually depends on.
//
// Usage:
//   Map derives from IMap and implements all pure virtuals.
//   Code that accesses theApp.GetWorld().GetMap() can eventually accept an
//   IMap& instead, enabling dependency injection.
//   Existing code is NOT changed — this is purely additive.
// -------------------------------------------------------------------------

#ifndef IMAP_H
#define IMAP_H

#include "../../common/C2eTypes.h"
#include "../../common/Vector2D.h"
#include "CARates.h"
#include <list>
#include <set>
#include <string>

// Types mirrored from Map.h — re-declared here so callers only need IMap.h.
// (Map.h typedef-s these identically, so there is no conflict.)
typedef std::list<int> IntegerCollection;
typedef std::list<int>::iterator IntegerIterator;
typedef std::list<int>::const_iterator ConstantIntegerIterator;
typedef std::set<std::string> StringCollection;

// -------------------------------------------------------------------------
// Class: IMap
// A narrow façade over the parts of Map consumed by CAOS MapHandlers and
// other engine code that should not depend on the full Map class.
//
// All signatures are kept identical to the corresponding Map member
// functions so that Map can override them with zero adapter code.
// -------------------------------------------------------------------------
class IMap {
public:
  virtual ~IMap() {}

  // ------------------------------------------------------------------
  // Map lifecycle
  // ------------------------------------------------------------------
  virtual void Reset() = 0;
  virtual bool SetMapDimensions(int width, int height) = 0;
  virtual void GetMapDimensions(int &width, int &height) = 0;
  virtual bool SetIndexBases(int metaRoomBase, int roomBase) = 0;

  // ------------------------------------------------------------------
  // Meta-room management
  // ------------------------------------------------------------------
  virtual bool AddMetaRoom(int positionX, int positionY, int width, int height,
                           std::string background, int &metaRoomID) = 0;
  virtual bool RemoveMetaRoom(int metaRoomID) = 0;
  virtual int GetMetaRoomCount() = 0;
  virtual bool GetMetaRoomLocation(int metaRoomID, int &positionX,
                                   int &positionY, int &width, int &height) = 0;
  virtual int GetMetaRoomIDCollection(IntegerCollection &out) = 0;
  virtual int GetCurrentMetaRoom() = 0;
  virtual bool SetCurrentMetaRoom(int metaRoomID) = 0;
  virtual bool GetMetaRoomDefaultCameraLocation(int metaRoomID,
                                                int32 &positionX,
                                                int32 &positionY) = 0;
  virtual bool GetMetaRoomIDForPoint(const Vector2D &position,
                                     int &metaRoomID) = 0;

  // ------------------------------------------------------------------
  // Room management
  // ------------------------------------------------------------------
  virtual bool AddRoom(int metaRoomID, int xLeft, int xRight, int yLeftCeiling,
                       int yRightCeiling, int yLeftFloor, int yRightFloor,
                       int &roomID) = 0;
  virtual bool RemoveRoom(int roomID) = 0;
  virtual int GetRoomIDCollection(IntegerCollection &out) = 0;
  virtual bool GetRoomIDCollectionForMetaRoom(int metaRoomID,
                                              IntegerCollection &out,
                                              int &count) = 0;
  virtual bool GetRoomLocation(int roomID, int &metaRoomID, int &xLeft,
                               int &xRight, int &yLeftCeiling,
                               int &yRightCeiling, int &yLeftFloor,
                               int &yRightFloor) = 0;
  virtual bool GetRoomCentre(int roomID, Vector2D &centre) = 0;
  virtual bool GetRoomIDForPoint(const Vector2D &position, int &roomID) = 0;
  virtual bool SearchForAdjacentRoom(const Vector2D &position, int direction,
                                     int &roomID) = 0;

  // ------------------------------------------------------------------
  // Door / link permeability
  // ------------------------------------------------------------------
  virtual bool SetDoorPermiability(int roomID1, int roomID2,
                                   int permiability) = 0;
  virtual bool GetDoorPermiability(int roomID1, int roomID2,
                                   int &permiability) = 0;
  virtual bool SetLinkPermiability(int roomID1, int roomID2,
                                   int permiability) = 0;
  virtual bool GetLinkPermiability(int roomID1, int roomID2,
                                   int &permiability) = 0;

  // ------------------------------------------------------------------
  // Room type
  // ------------------------------------------------------------------
  virtual bool SetRoomType(int roomID, int type) = 0;
  virtual bool GetRoomType(int roomID, int &type) = 0;

  // ------------------------------------------------------------------
  // Cellular automata (CA) properties
  // ------------------------------------------------------------------
  virtual bool SetRoomProperty(int roomID, int caIndex, float value) = 0;
  virtual bool GetRoomProperty(int roomID, int caIndex, float &value) = 0;
  virtual bool IncreaseCAProperty(int roomID, int caIndex, float value) = 0;
  virtual bool IsCANavigable(int caIndex) = 0;
  virtual bool SetCARates(int roomType, int caIndex, CARates const &rates) = 0;
  virtual bool GetCARates(int roomType, int caIndex, CARates &rates) = 0;
  virtual bool GetRoomIDWithHighestCA(int roomID, int caIndex,
                                      bool includeUpDown,
                                      int &roomIDHighest) = 0;
  virtual bool GetRoomIDWithLowestCA(int roomID, int caIndex,
                                     bool includeUpDown, int &roomIDLowest) = 0;
  virtual void UpdateCurrentCAProperty() = 0;
  virtual int GetCAIndex() = 0;

  // ------------------------------------------------------------------
  // Background management
  // ------------------------------------------------------------------
  virtual bool AddBackground(int metaRoomID, std::string background) = 0;
  virtual bool RemoveBackground(int metaRoomID, std::string background) = 0;
  virtual bool SetCurrentBackground(int metaRoomID, std::string background) = 0;
  virtual bool GetCurrentBackground(int metaRoomID,
                                    std::string &background) = 0;
  virtual bool GetBackgroundCollection(int metaRoomID,
                                       StringCollection &out) = 0;
};

#endif // IMAP_H
