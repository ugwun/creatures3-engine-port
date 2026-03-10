// -------------------------------------------------------------------------
// Filename:    MapHandlers.h
// Class:       MapHandlers
// Purpose:     Routines to implement map-related commands/r-values
// Description:
//
// Usage:
//
// History:
// 010399  Robert	Initial version
// -------------------------------------------------------------------------

#ifndef MAPHANDLERS_H
#define MAPHANDLERS_H

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "../Map/IMap.h"

class CAOSMachine;

class MapHandlers {
public:
  // Commands
  static void Command_DOCA(CAOSMachine &vm);
  static void Command_MAPK(CAOSMachine &vm);
  static void Command_MAPD(CAOSMachine &vm);
  static void Command_DOOR(CAOSMachine &vm);
  static void Command_LINK(CAOSMachine &vm);
  static void Command_DELR(CAOSMachine &vm);
  static void Command_DELM(CAOSMachine &vm);
  static void Command_ADDB(CAOSMachine &vm);
  static void Command_META(CAOSMachine &vm);
  static void Command_BKGD(CAOSMachine &vm);
  static void Command_RTYP(CAOSMachine &vm);
  static void Command_PROP(CAOSMachine &vm);
  static void Command_RATE(CAOSMachine &vm);
  static void Command_EMIT(CAOSMachine &vm);
  static void Command_CACL(CAOSMachine &vm);
  static void Command_ALTR(CAOSMachine &vm);
  static void Command_BRMI(CAOSMachine &vm);

  // Integer r-values
  static int IntegerRV_DOOR(CAOSMachine &vm);
  static int IntegerRV_LINK(CAOSMachine &vm);
  static int IntegerRV_ADDM(CAOSMachine &vm);
  static int IntegerRV_ADDR(CAOSMachine &vm);
  static int IntegerRV_MAPW(CAOSMachine &vm);
  static int IntegerRV_MAPH(CAOSMachine &vm);
  static int IntegerRV_META(CAOSMachine &vm);
  static int IntegerRV_RTYP(CAOSMachine &vm);
  static int IntegerRV_ROOM(CAOSMachine &vm);
  static int IntegerRV_HIRP(CAOSMachine &vm);
  static int IntegerRV_LORP(CAOSMachine &vm);
  static int IntegerRV_GRAP(CAOSMachine &vm);
  static int IntegerRV_GRID(CAOSMachine &vm);
  static int IntegerRV_GMAP(CAOSMachine &vm);

  // Float r-values
  static float FloatRV_PROP(CAOSMachine &vm);
  static float FloatRV_TORX(CAOSMachine &vm);
  static float FloatRV_TORY(CAOSMachine &vm);

  // String r-values
  static void StringRV_BKGD(CAOSMachine &vm, std::string &str);
  static void StringRV_RATE(CAOSMachine &vm, std::string &str);
  static void StringRV_EMID(CAOSMachine &vm, std::string &str);
  static void StringRV_ERID(CAOSMachine &vm, std::string &str);
  static void StringRV_RLOC(CAOSMachine &vm, std::string &str);
  static void StringRV_MLOC(CAOSMachine &vm, std::string &str);
  static void StringRV_BKDS(CAOSMachine &vm, std::string &str);

  // helpers
  static bool ValidateBackground(const std::string &background, int metaRoomID);

  // -----------------------------------------------------------------------
  // Testable logic layer — accept IMap& instead of theApp.GetWorld().GetMap().
  // Production handlers delegate to these; tests call them directly with
  // a NullMap / FakeMap to exercise the logic without the full engine.
  // -----------------------------------------------------------------------

  // Map dimensions (MAPW / MAPH)
  static int GetMapWidth(IMap &map);
  static int GetMapHeight(IMap &map);

  // Room ID for world point (GRAP)
  static int GetRoomAtPoint(IMap &map, float x, float y);

  // MetaRoom ID for world point (GMAP)
  static int GetMetaRoomAtPoint(IMap &map, float x, float y);

  // Room type (RTYP get)
  static int GetRoomType(IMap &map, int roomID);

  // Room CA property (PROP get)
  static float GetRoomProperty(IMap &map, int roomID, int caIndex);

  // Door / link permeability (DOOR / LINK get)
  static int GetDoorPermeability(IMap &map, int id1, int id2);
  static int GetLinkPermeability(IMap &map, int id1, int id2);

  // Highest / lowest CA adjacent room (HIRP / LORP)
  static int GetRoomWithHighestCA(IMap &map, int roomID, int caIndex,
                                  bool includeCurrentRoom);
  static int GetRoomWithLowestCA(IMap &map, int roomID, int caIndex,
                                 bool includeCurrentRoom);

  // Room / metaRoom location strings (RLOC / MLOC)
  static std::string GetRoomLocation(IMap &map, int roomID);
  static std::string GetMetaRoomLocation(IMap &map, int metaRoomID);

  // MetaRoom / room ID collection strings (EMID / ERID)
  static std::string GetMetaRoomIDs(IMap &map);
  static std::string GetRoomIDs(IMap &map, int metaRoomID);

  // Current meta room (CURM / part of META)
  static int GetCurrentMetaRoom(IMap &map);
};

#endif // MAPHANDLERS_H