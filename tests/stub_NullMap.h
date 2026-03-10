// -------------------------------------------------------------------------
// stub_NullMap.h
// A do-nothing IMap implementation for use in unit tests.
//
// NullMap is a "null object" — every method returns a safe default (false,
// 0, empty string) without crashing. Tests that only need some methods to
// do real work can subclass NullMap and override just those methods.
//
// Example usage:
//   struct MyTestMap : public NullMap {
//     bool GetMapDimensions_called = false;
//     void GetMapDimensions(int &w, int &h) override {
//       GetMapDimensions_called = true;
//       w = 8630; h = 1500;
//     }
//   };
// -------------------------------------------------------------------------

#ifndef STUB_NULLMAP_H
#define STUB_NULLMAP_H

#include "engine/Map/IMap.h"
#include <string>

class NullMap : public IMap {
public:
  ~NullMap() override {}

  // Lifecycle
  void Reset() override {}
  bool SetMapDimensions(int, int) override { return true; }
  void GetMapDimensions(int &w, int &h) override {
    w = 0;
    h = 0;
  }
  bool SetIndexBases(int, int) override { return true; }

  // Meta-room management
  bool AddMetaRoom(int, int, int, int, std::string, int &metaRoomID) override {
    metaRoomID = -1;
    return false;
  }
  bool RemoveMetaRoom(int) override { return false; }
  int GetMetaRoomCount() override { return 0; }
  bool GetMetaRoomLocation(int, int &x, int &y, int &w, int &h) override {
    x = y = w = h = 0;
    return false;
  }
  int GetMetaRoomIDCollection(IntegerCollection &) override { return 0; }
  int GetCurrentMetaRoom() override { return -1; }
  bool SetCurrentMetaRoom(int) override { return false; }
  bool GetMetaRoomDefaultCameraLocation(int, int32 &x, int32 &y) override {
    x = y = 0;
    return false;
  }
  bool GetMetaRoomIDForPoint(const Vector2D &, int &id) override {
    id = -1;
    return false;
  }

  // Room management
  bool AddRoom(int, int, int, int, int, int, int, int &roomID) override {
    roomID = -1;
    return false;
  }
  bool RemoveRoom(int) override { return false; }
  int GetRoomIDCollection(IntegerCollection &) override { return 0; }
  bool GetRoomIDCollectionForMetaRoom(int, IntegerCollection &,
                                      int &count) override {
    count = 0;
    return false;
  }
  bool GetRoomLocation(int, int &, int &, int &, int &, int &, int &,
                       int &) override {
    return false;
  }
  bool GetRoomCentre(int, Vector2D &centre) override {
    centre = Vector2D(0.f, 0.f);
    return false;
  }
  bool GetRoomIDForPoint(const Vector2D &, int &roomID) override {
    roomID = -1;
    return false;
  }
  bool SearchForAdjacentRoom(const Vector2D &, int, int &roomID) override {
    roomID = -1;
    return false;
  }

  // Door / link permeability
  bool SetDoorPermiability(int, int, int) override { return false; }
  bool GetDoorPermiability(int, int, int &p) override {
    p = 0;
    return false;
  }
  bool SetLinkPermiability(int, int, int) override { return false; }
  bool GetLinkPermiability(int, int, int &p) override {
    p = 0;
    return false;
  }

  // Room type
  bool SetRoomType(int, int) override { return false; }
  bool GetRoomType(int, int &type) override {
    type = 0;
    return false;
  }

  // CA properties
  bool SetRoomProperty(int, int, float) override { return false; }
  bool GetRoomProperty(int, int, float &v) override {
    v = 0.f;
    return false;
  }
  bool IncreaseCAProperty(int, int, float) override { return false; }
  bool IsCANavigable(int) override { return false; }
  bool SetCARates(int, int, CARates const &) override { return false; }
  bool GetCARates(int, int, CARates &) override { return false; }
  bool GetRoomIDWithHighestCA(int, int, bool, int &id) override {
    id = -1;
    return false;
  }
  bool GetRoomIDWithLowestCA(int, int, bool, int &id) override {
    id = -1;
    return false;
  }
  void UpdateCurrentCAProperty() override {}
  int GetCAIndex() override { return 0; }

  // Background management
  bool AddBackground(int, std::string) override { return false; }
  bool RemoveBackground(int, std::string) override { return false; }
  bool SetCurrentBackground(int, std::string) override { return false; }
  bool GetCurrentBackground(int, std::string &bg) override {
    bg.clear();
    return false;
  }
  bool GetBackgroundCollection(int, StringCollection &) override {
    return false;
  }
};

#endif // STUB_NULLMAP_H
