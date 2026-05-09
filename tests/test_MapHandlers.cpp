// test_MapHandlers.cpp
// Unit tests for MapHandlers logic — now calling the real
// MapHandlers static IMap& methods, not local copies.
//
// MapHandlers.cpp now exposes static methods (e.g. GetMapWidth(IMap&))
// that contain the pure logic; the production handlers are thin wrappers
// calling theApp.GetWorld().GetMap() and delegating to these.
// Here we pass a FakeMap/NullMap, exercising the real production logic.

#include "engine/Caos/MapHandlers.h"
#include "engine/Map/IMap.h"
#include "stub_NullMap.h"
#include <gtest/gtest.h>

// ---------------------------------------------------------------------------
// Extended FakeMap — overrides every IMap method used by MapHandlers logic
// ---------------------------------------------------------------------------

struct FakeMap : public NullMap {
  // MapW/H
  int mapW = 8630;
  int mapH = 1500;

  // GRAP / GMAP
  int roomForPoint = 42;
  bool roomFound = true;
  int metaRoomForPoint = 7;
  bool metaRoomFound = true;

  // Door / link permeability (shared for simplicity)
  int doorPerm = 50;
  bool doorFound = true;
  int linkPerm = 75;
  bool linkFound = true;

  // Room type
  int roomType = 4;
  bool roomTypeFound = true;

  // CA property
  float caValue = 0.75f;
  bool caValueFound = true;

  // HIRP / LORP
  int highestCA = 11;
  bool highCAFound = true;
  int lowestCA = 22;
  bool lowCAFound = true;

  // RLOC
  struct RoomLoc {
    int mrID, xL, xR, yCeil, yrCeil, yFloor, yrFloor;
  };
  RoomLoc rloc = {3, 100, 500, 300, 300, 600, 600};
  bool rlocFound = true;

  // MLOC
  struct MetaLoc {
    int x, y, w, h;
  };
  MetaLoc mloc = {0, 0, 8630, 1500};
  bool mlocFound = true;

  // EMID / ERID
  IntegerCollection metaRoomIDs = {1, 2, 3};
  IntegerCollection roomIDs = {10, 20, 30};
  bool roomIDsFound = true;

  // Current meta room
  int currentMetaRoomID = 5;

  void GetMapDimensions(int &w, int &h) override {
    w = mapW;
    h = mapH;
  }
  int GetCurrentMetaRoom() override { return currentMetaRoomID; }

  bool GetRoomIDForPoint(const Vector2D &, int &id) override {
    id = roomForPoint;
    return roomFound;
  }
  bool GetMetaRoomIDForPoint(const Vector2D &, int &id) override {
    id = metaRoomForPoint;
    return metaRoomFound;
  }
  bool GetDoorPermiability(int, int, int &p) override {
    p = doorPerm;
    return doorFound;
  }
  bool GetLinkPermiability(int, int, int &p) override {
    p = linkPerm;
    return linkFound;
  }
  bool GetRoomType(int, int &t) override {
    t = roomType;
    return roomTypeFound;
  }
  bool GetRoomProperty(int, int, float &v) override {
    v = caValue;
    return caValueFound;
  }
  bool GetRoomIDWithHighestCA(int, int, bool, int &r) override {
    r = highestCA;
    return highCAFound;
  }
  bool GetRoomIDWithLowestCA(int, int, bool, int &r) override {
    r = lowestCA;
    return lowCAFound;
  }
  bool GetRoomLocation(int, int &mrID, int &xL, int &xR, int &yCeil,
                       int &yrCeil, int &yFloor, int &yrFloor) override {
    if (!rlocFound)
      return false;
    mrID = rloc.mrID;
    xL = rloc.xL;
    xR = rloc.xR;
    yCeil = rloc.yCeil;
    yrCeil = rloc.yrCeil;
    yFloor = rloc.yFloor;
    yrFloor = rloc.yrFloor;
    return true;
  }
  bool GetMetaRoomLocation(int, int &x, int &y, int &w, int &h) override {
    if (!mlocFound)
      return false;
    x = mloc.x;
    y = mloc.y;
    w = mloc.w;
    h = mloc.h;
    return true;
  }
  int GetMetaRoomIDCollection(IntegerCollection &ids) override {
    ids = metaRoomIDs;
    return (int)ids.size();
  }
  bool GetRoomIDCollectionForMetaRoom(int, IntegerCollection &ids,
                                      int &count) override {
    if (!roomIDsFound)
      return false;
    ids = roomIDs;
    count = (int)ids.size();
    return true;
  }
  int GetRoomIDCollection(IntegerCollection &ids) override {
    ids = roomIDs;
    return (int)ids.size();
  }
};

// ==========================================================================
// MAPW / MAPH  — GetMapWidth / GetMapHeight
// ==========================================================================

TEST(MapHandlerLogicTest, MAPW_NullMap_ReturnsZero) {
  NullMap m;
  EXPECT_EQ(MapHandlers::GetMapWidth(m), 0);
}

TEST(MapHandlerLogicTest, MAPH_NullMap_ReturnsZero) {
  NullMap m;
  EXPECT_EQ(MapHandlers::GetMapHeight(m), 0);
}

TEST(MapHandlerLogicTest, MAPW_FakeMap_Returns8630) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetMapWidth(m), 8630);
}

TEST(MapHandlerLogicTest, MAPH_FakeMap_Returns1500) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetMapHeight(m), 1500);
}

// ==========================================================================
// GRAP  — GetRoomAtPoint
// ==========================================================================

TEST(MapHandlerLogicTest, GRAP_RoomFound_ReturnsRoomID) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetRoomAtPoint(m, 500.f, 200.f), 42);
}

TEST(MapHandlerLogicTest, GRAP_RoomNotFound_ReturnsMinusOne) {
  FakeMap m;
  m.roomFound = false;
  EXPECT_EQ(MapHandlers::GetRoomAtPoint(m, 500.f, 200.f), -1);
}

TEST(MapHandlerLogicTest, GRAP_NullMap_ReturnsMinusOne) {
  NullMap m;
  EXPECT_EQ(MapHandlers::GetRoomAtPoint(m, 0.f, 0.f), -1);
}

// ==========================================================================
// GMAP  — GetMetaRoomAtPoint
// ==========================================================================

TEST(MapHandlerLogicTest, GMAP_MetaRoomFound_ReturnsMetaRoomID) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetMetaRoomAtPoint(m, 100.f, 100.f), 7);
}

TEST(MapHandlerLogicTest, GMAP_NotFound_ReturnsMinusOne) {
  FakeMap m;
  m.metaRoomFound = false;
  EXPECT_EQ(MapHandlers::GetMetaRoomAtPoint(m, 100.f, 100.f), -1);
}

// ==========================================================================
// DOOR (get)  — GetDoorPermeability
// ==========================================================================

TEST(MapHandlerLogicTest, DOOR_Found_ReturnsPerm) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetDoorPermeability(m, 0, 1), 50);
}

TEST(MapHandlerLogicTest, DOOR_NotFound_ReturnsMinusOne) {
  FakeMap m;
  m.doorFound = false;
  EXPECT_EQ(MapHandlers::GetDoorPermeability(m, 0, 1), -1);
}

TEST(MapHandlerLogicTest, DOOR_NullMap_ReturnsMinusOne) {
  NullMap m;
  EXPECT_EQ(MapHandlers::GetDoorPermeability(m, 0, 1), -1);
}

// ==========================================================================
// LINK (get)  — GetLinkPermeability
// ==========================================================================

TEST(MapHandlerLogicTest, LINK_Found_ReturnsPerm) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetLinkPermeability(m, 0, 1), 75);
}

TEST(MapHandlerLogicTest, LINK_NotFound_ReturnsMinusOne) {
  FakeMap m;
  m.linkFound = false;
  EXPECT_EQ(MapHandlers::GetLinkPermeability(m, 0, 1), -1);
}

// ==========================================================================
// RTYP (get)  — GetRoomType
// ==========================================================================

TEST(MapHandlerLogicTest, RTYP_ValidRoom_ReturnsType) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetRoomType(m, 5), 4);
}

TEST(MapHandlerLogicTest, RTYP_NegativeRoomID_ReturnsMinusOne) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetRoomType(m, -1), -1);
}

TEST(MapHandlerLogicTest, RTYP_NotFound_ReturnsMinusOne) {
  FakeMap m;
  m.roomTypeFound = false;
  EXPECT_EQ(MapHandlers::GetRoomType(m, 5), -1);
}

// ==========================================================================
// PROP (get)  — GetRoomProperty
// ==========================================================================

TEST(MapHandlerLogicTest, PROP_ValidRoom_ReturnsCaValue) {
  FakeMap m;
  EXPECT_FLOAT_EQ(MapHandlers::GetRoomProperty(m, 5, 3), 0.75f);
}

TEST(MapHandlerLogicTest, PROP_NegativeRoomID_ReturnsZero) {
  FakeMap m;
  EXPECT_FLOAT_EQ(MapHandlers::GetRoomProperty(m, -1, 3), 0.0f);
}

// ==========================================================================
// HIRP  — GetRoomWithHighestCA
// ==========================================================================

TEST(MapHandlerLogicTest, HIRP_Found_ReturnsHighestRoom) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetRoomWithHighestCA(m, 5, 0, false), 11);
}

TEST(MapHandlerLogicTest, HIRP_NotFound_ReturnsMinusOne) {
  FakeMap m;
  m.highCAFound = false;
  EXPECT_EQ(MapHandlers::GetRoomWithHighestCA(m, 5, 0, false), -1);
}

// ==========================================================================
// LORP  — GetRoomWithLowestCA
// ==========================================================================

TEST(MapHandlerLogicTest, LORP_Found_ReturnsLowestRoom) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetRoomWithLowestCA(m, 5, 0, false), 22);
}

TEST(MapHandlerLogicTest, LORP_NotFound_ReturnsMinusOne) {
  FakeMap m;
  m.lowCAFound = false;
  EXPECT_EQ(MapHandlers::GetRoomWithLowestCA(m, 5, 0, false), -1);
}

// ==========================================================================
// RLOC  — GetRoomLocation
// ==========================================================================

TEST(MapHandlerLogicTest, RLOC_ValidRoom_ReturnsSpaceDelimitedString) {
  FakeMap m;
  // FakeMap rloc: xL=100 xR=500 yCeil=300 yrCeil=300 yFloor=600 yrFloor=600
  std::string s = MapHandlers::GetRoomLocation(m, 1);
  EXPECT_EQ(s, "100 500 300 300 600 600");
}

TEST(MapHandlerLogicTest, RLOC_NotFound_ReturnsEmptyString) {
  FakeMap m;
  m.rlocFound = false;
  EXPECT_TRUE(MapHandlers::GetRoomLocation(m, 1).empty());
}

// ==========================================================================
// MLOC  — GetMetaRoomLocation
// ==========================================================================

TEST(MapHandlerLogicTest, MLOC_ValidMetaRoom_ReturnsSpaceDelimitedString) {
  FakeMap m;
  // FakeMap mloc: x=0 y=0 w=8630 h=1500
  std::string s = MapHandlers::GetMetaRoomLocation(m, 0);
  EXPECT_EQ(s, "0 0 8630 1500");
}

TEST(MapHandlerLogicTest, MLOC_NotFound_ReturnsEmptyString) {
  FakeMap m;
  m.mlocFound = false;
  EXPECT_TRUE(MapHandlers::GetMetaRoomLocation(m, 0).empty());
}

// ==========================================================================
// EMID  — GetMetaRoomIDs
// ==========================================================================

TEST(MapHandlerLogicTest, EMID_ReturnsSpacePrefixedIDs) {
  FakeMap m;
  // metaRoomIDs = {1, 2, 3}  → " 1 2 3"
  std::string s = MapHandlers::GetMetaRoomIDs(m);
  EXPECT_EQ(s, " 1 2 3");
}

TEST(MapHandlerLogicTest, EMID_NullMap_ReturnsEmptyString) {
  NullMap m;
  EXPECT_EQ(MapHandlers::GetMetaRoomIDs(m), "");
}

// ==========================================================================
// ERID  — GetRoomIDs
// ==========================================================================

TEST(MapHandlerLogicTest, ERID_AllRooms_ReturnsAllIDs) {
  FakeMap m;
  // metaRoomID == -1  → GetRoomIDCollection → roomIDs = {10, 20, 30}
  std::string s = MapHandlers::GetRoomIDs(m, -1);
  EXPECT_EQ(s, " 10 20 30");
}

TEST(MapHandlerLogicTest, ERID_ForMetaRoom_ReturnsFilteredIDs) {
  FakeMap m;
  std::string s = MapHandlers::GetRoomIDs(m, 2);
  EXPECT_EQ(s, " 10 20 30");
}

TEST(MapHandlerLogicTest, ERID_MetaRoomNotFound_ReturnsEmpty) {
  FakeMap m;
  m.roomIDsFound = false;
  EXPECT_TRUE(MapHandlers::GetRoomIDs(m, 99).empty());
}

// ==========================================================================
// GetCurrentMetaRoom
// ==========================================================================

TEST(MapHandlerLogicTest, GetCurrentMetaRoom_FakeMap_ReturnsConfiguredValue) {
  FakeMap m;
  EXPECT_EQ(MapHandlers::GetCurrentMetaRoom(m), 5);
}

TEST(MapHandlerLogicTest, GetCurrentMetaRoom_NullMap_ReturnsMinusOne) {
  NullMap m;
  EXPECT_EQ(MapHandlers::GetCurrentMetaRoom(m), -1);
}

// ==========================================================================
// Polymorphism: NullMap and FakeMap via IMap&
// ==========================================================================

TEST(MapHandlerLogicTest, PolymorphicDispatch_GetMapWidth) {
  NullMap n;
  FakeMap f;
  IMap *maps[2] = {&n, &f};
  EXPECT_EQ(MapHandlers::GetMapWidth(*maps[0]), 0);
  EXPECT_EQ(MapHandlers::GetMapWidth(*maps[1]), 8630);
}

// ==========================================================================
// NullMap intrinsics (kept from original test file)
// ==========================================================================

TEST(NullMapTest, Reset_DoesNotCrash) {
  NullMap map;
  map.Reset();
}

TEST(NullMapTest, UpdateCurrentCAProperty_DoesNotCrash) {
  NullMap map;
  map.UpdateCurrentCAProperty();
}

TEST(NullMapTest, GetCAIndex_ReturnsZero) {
  NullMap map;
  EXPECT_EQ(map.GetCAIndex(), 0);
}

TEST(NullMapTest, SetMapDimensions_ReturnsTrue) {
  NullMap map;
  EXPECT_TRUE(map.SetMapDimensions(4000, 2000));
}
