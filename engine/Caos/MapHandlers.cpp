// -------------------------------------------------------------------------
// Filename:    MapHandlers.cpp
// Class:       MapHandlers
// Purpose:     Routines to implement map-related commands/values in CAOS.
// Description:
//
// Usage:
//
// History:
// -------------------------------------------------------------------------

// disable annoying warning in VC when using stl (debug symbols > 255 chars)
#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include <string>
#ifdef C2E_OLD_CPP_LIB
#include <strstream>
#else
#include <sstream>
#endif
// Always include <sstream> for the logic-layer functions (not guarded above
// because C2E_OLD_CPP_LIB uses <strstream> for the production handlers but
// the new testable helpers unconditionally use std::stringstream).
#ifndef C2E_OLD_CPP_LIB
// already included above
#else
#include <sstream>
#endif
#include "../AgentManager.h"
#include "../Agents/Agent.h"
#include "../Agents/Vehicle.h"
#include "../App.h"
#include "../C2eServices.h"
#include "../Display/MainCamera.h"
#include "../Map/Map.h"
#include "../World.h"
#include "AgentHandlers.h"
#include "CAOSMachine.h"
#include "MapHandlers.h"

void MapHandlers::Command_DOCA(CAOSMachine &vm) {
  std::vector<AgentHandle> agentsThatEmitCAs[CA_PROPERTY_COUNT];
  for (AgentListIterator a = theAgentManager.GetAgentIteratorStart();
       !theAgentManager.IsEnd(a); a++) {
    if ((*a).GetAgentReference().GetCAIncrease() > 0.0f) {
      int whichCA = (*a).GetAgentReference().GetCAIndex();
      agentsThatEmitCAs[whichCA].push_back(*a);
    }
  }

  int noOfTimesToUpdate = vm.FetchIntegerRV();
  for (int i = 0; i < noOfTimesToUpdate; i++) {
    for (int j = 0; j < CA_PROPERTY_COUNT; j++) {
      for (int p = 0; p < agentsThatEmitCAs[j].size(); p++) {
        agentsThatEmitCAs[theApp.GetWorld().GetMap().GetCAIndex()][p]
            .GetAgentReference()
            .HandleCA();
      }
      theApp.GetWorld().GetMap().UpdateCurrentCAProperty();
    }
  }
}

void MapHandlers::Command_MAPK(CAOSMachine &vm) {
  theApp.GetWorld().GetMap().Reset();
  theMainView.Refresh();
}

void MapHandlers::Command_DELR(CAOSMachine &vm) {
  int roomID = vm.FetchIntegerRV();
  bool ok = theApp.GetWorld().GetMap().RemoveRoom(roomID);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToDeleteRoom);
  }
  theMainView.Refresh();
}

void MapHandlers::Command_DELM(CAOSMachine &vm) {
  int metaRoomID = vm.FetchIntegerRV();
  bool ok = theApp.GetWorld().GetMap().RemoveMetaRoom(metaRoomID);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToDeleteMetaRoom);
  }
  theMainView.Refresh();
}

void MapHandlers::Command_ADDB(CAOSMachine &vm) {
  int metaRoomID = vm.FetchIntegerRV();
  std::string background;
  vm.FetchStringRV(background);
  bool ok = theApp.GetWorld().GetMap().AddBackground(metaRoomID, background);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToAddBackground);
  }
}

void MapHandlers::Command_META(CAOSMachine &vm) {
  int metaRoomID = vm.FetchIntegerRV();
  int cameraX = vm.FetchIntegerRV();
  int cameraY = vm.FetchIntegerRV();
  int transitionType = vm.FetchIntegerRV();

  Camera *currentCamera = vm.GetCamera();
  if (currentCamera) {
    // now tell the main view to change meta room too
    std::string background;

    int x, y, w, h;
    RECT metaRoomMBR;
    if (!theApp.GetWorld().GetMap().GetMetaRoomLocation(metaRoomID, x, y, w,
                                                        h)) {
      vm.ThrowRunError(CAOSMachine::sidFailedToGetMetaRoomLocation);
    }

    theApp.GetWorld().GetMap().GetCurrentBackground(metaRoomID, background);

    if (!background.empty()) {

      metaRoomMBR.left = x;
      metaRoomMBR.right = x + w - 1;
      metaRoomMBR.top = y;
      metaRoomMBR.bottom = y + h - 1;

      if (cameraX < 0 || cameraY < 0) {
        int32 newx, newy;

        if (!theApp.GetWorld().GetMap().GetMetaRoomDefaultCameraLocation(
                metaRoomID, newx, newy)) {
          vm.ThrowRunError(CAOSMachine::sidFailedToGetMetaRoomLocation);
        }

        cameraX = newx;
        cameraY = newy;
      }

      // no special transitions allowed
      currentCamera->ChangeMetaRoom(background, metaRoomMBR, cameraX, cameraY,
                                    3, 0); // no centring
    }
  } else // assume we meant the main camera then
  {

    if (!theApp.GetWorld().SetMetaRoom(metaRoomID, transitionType, cameraX,
                                       cameraY))
      vm.ThrowRunError(CAOSMachine::sidFailedToGetMetaRoomLocation);
  }
}

void MapHandlers::Command_BKGD(CAOSMachine &vm) {
  int metaRoomID;
  std::string background;
  bool ok;
  int transitionType;
  int current;

  metaRoomID = vm.FetchIntegerRV();
  vm.FetchStringRV(background);
  transitionType = vm.FetchIntegerRV();

  Camera *currentCamera = vm.GetCamera();
  if (currentCamera) {
    if (ValidateBackground(background, metaRoomID)) {
      // no fancy transitions here my friends
      currentCamera->SetBackground(background, 0);
    }
  } else {
    ok =
        theApp.GetWorld().GetMap().SetCurrentBackground(metaRoomID, background);
    if (!ok) {
      vm.ThrowRunError(CAOSMachine::sidFailedToSetBackground);
    }

    current = theApp.GetWorld().GetMap().GetCurrentMetaRoom();
    if (metaRoomID != current) {
      return;
    }
    theMainView.SetBackground(background, transitionType);
  }
}

// maybe this should go in the map when robert has finished with it
// this is for remote cameras
bool MapHandlers::ValidateBackground(const std::string &background,
                                     int metaRoomID) {
  StringCollection backgroundCollection;

  theApp.GetWorld().GetMap().GetBackgroundCollection(metaRoomID,
                                                     backgroundCollection);
  if (backgroundCollection.find(background) == backgroundCollection.end())
    return false;

  return true;
}

void MapHandlers::Command_MAPD(CAOSMachine &vm) {
  int w = vm.FetchIntegerRV();
  int h = vm.FetchIntegerRV();
  theApp.GetWorld().GetMap().SetMapDimensions(w, h);
  theMainView.Refresh();
}

void MapHandlers::Command_DOOR(CAOSMachine &vm) {
  int id1 = vm.FetchIntegerRV();
  int id2 = vm.FetchIntegerRV();
  int permiability = vm.FetchIntegerRV();
  bool ok;

  ok = theApp.GetWorld().GetMap().SetDoorPermiability(id1, id2, permiability);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToSetDoorPerm);
  }
  theMainView.Refresh();
}

void MapHandlers::Command_LINK(CAOSMachine &vm) {
  int id1 = vm.FetchIntegerRV();
  int id2 = vm.FetchIntegerRV();
  int permiability = vm.FetchIntegerRV();

  bool ok =
      theApp.GetWorld().GetMap().SetLinkPermiability(id1, id2, permiability);
  if (!ok) {
    // Don't throw — one or both rooms may not exist in the current map
    // (e.g. C3 metaroom coordinates when only DS map is loaded).
    // The link operation is non-critical; log and continue.
    theFlightRecorder.Log(
        1,
        "LINK: failed to set link permiability between rooms %d and %d "
        "(perm=%d) — one or both rooms may not exist in the current map. "
        "Silently skipping.",
        id1, id2, permiability);
    return;
  }
  theMainView.Refresh();
}

void MapHandlers::Command_RTYP(CAOSMachine &vm) {
  int id = vm.FetchIntegerRV();
  int type = vm.FetchIntegerRV();
  bool ok = theApp.GetWorld().GetMap().SetRoomType(id, type);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToSetRoomType);
  }
}

void MapHandlers::Command_PROP(CAOSMachine &vm) {
  int id = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();
  float value = vm.FetchFloatRV();

  bool ok = theApp.GetWorld().GetMap().SetRoomProperty(id, caIndex, value);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToSetRoomProperty);
  }
}

void MapHandlers::Command_RATE(CAOSMachine &vm) {
  int roomType = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();

  float gain = vm.FetchFloatRV();
  float loss = vm.FetchFloatRV();
  float diff = vm.FetchFloatRV();

  bool ok = theApp.GetWorld().GetMap().SetCARates(roomType, caIndex,
                                                  CARates(gain, loss, diff));
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToSetCARates);
  }
}

void MapHandlers::StringRV_RATE(CAOSMachine &vm, std::string &str) {
  int roomType = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();

  CARates rates;
  bool ok = theApp.GetWorld().GetMap().GetCARates(roomType, caIndex, rates);

  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToGetCARates);
  }

#ifdef C2E_OLD_CPP_LIB
  char hackbuf[256];
  std::ostrstream stream(hackbuf, sizeof(hackbuf));
#else
  std::stringstream stream;
#endif
  stream << ' ' << rates.GetGain() << ' ' << rates.GetLoss() << ' '
         << rates.GetDiffusion();
  str = stream.str();
}

void MapHandlers::Command_EMIT(CAOSMachine &vm) {
  vm.ValidateTarg();
  int caIndex = vm.FetchIntegerRV();
  float value = vm.FetchFloatRV();
  if (!vm.GetTarg().GetAgentReference().SetEmission(caIndex, value))
    vm.ThrowRunError(CAOSMachine::sidInvalidEmit);
}

void MapHandlers::Command_CACL(CAOSMachine &vm) {
  int family = vm.FetchIntegerRV();
  int genus = vm.FetchIntegerRV();
  int species = vm.FetchIntegerRV();
  Classifier c(family, genus, species);
  int caIndex = vm.FetchIntegerRV();
  if (!theAgentManager.UpdateSmellClassifierList(caIndex, &c)) {
    // Duplicate or wildcard classifier — benign in DS bootstrap scripts.
    // Log instead of throwing to avoid halting script execution.
  }
}

void MapHandlers::Command_ALTR(CAOSMachine &vm) {
  int roomID = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();
  float value = vm.FetchFloatRV();

  if (roomID == -1) {
    vm.ValidateTarg();
    if (!vm.GetTarg().GetAgentReference().GetRoomID(roomID))
      vm.ThrowRunError(CAOSMachine::sidFailedToGetRoomID);
  }

  bool ok = theApp.GetWorld().GetMap().IsCANavigable(caIndex)
                ? false
                : theApp.GetWorld().GetMap().IncreaseCAProperty(roomID, caIndex,
                                                                value);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToIncreaseCAProperty);
  }
}

int MapHandlers::IntegerRV_DOOR(CAOSMachine &vm) {
  int id1 = vm.FetchIntegerRV();
  int id2 = vm.FetchIntegerRV();
  int perm = GetDoorPermeability(theApp.GetWorld().GetMap(), id1, id2);
  if (perm < 0)
    vm.ThrowRunError(CAOSMachine::sidFailedToGetDoorPerm);
  return perm;
}

int MapHandlers::IntegerRV_LINK(CAOSMachine &vm) {
  int id1 = vm.FetchIntegerRV();
  int id2 = vm.FetchIntegerRV();
  int perm = GetLinkPermeability(theApp.GetWorld().GetMap(), id1, id2);
  if (perm < 0)
    vm.ThrowRunError(CAOSMachine::sidFailedToGetLinkPerm);
  return perm;
}

int MapHandlers::IntegerRV_MAPW(CAOSMachine &vm) {
  return GetMapWidth(theApp.GetWorld().GetMap());
}

int MapHandlers::IntegerRV_MAPH(CAOSMachine &vm) {
  return GetMapHeight(theApp.GetWorld().GetMap());
}

int MapHandlers::IntegerRV_ADDM(CAOSMachine &vm) {
  int x, y, w, h;
  bool ok;
  int metaRoomID;
  std::string title;

  x = vm.FetchIntegerRV();
  y = vm.FetchIntegerRV();
  w = vm.FetchIntegerRV();
  h = vm.FetchIntegerRV();
  vm.FetchStringRV(title);

  ok = theApp.GetWorld().GetMap().AddMetaRoom(x, y, w, h, title, metaRoomID);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToAddMetaRoom);
  }
  theMainView.Refresh();
  return metaRoomID;
}

int MapHandlers::IntegerRV_ADDR(CAOSMachine &vm) {
  int xLeft, xRight, yLeftCeiling, yRightCeiling, yLeftFloor, yRightFloor;
  bool ok;
  int roomID;
  int metaRoomID;

  metaRoomID = vm.FetchIntegerRV();
  xLeft = vm.FetchIntegerRV();
  xRight = vm.FetchIntegerRV();
  yLeftCeiling = vm.FetchIntegerRV();
  yRightCeiling = vm.FetchIntegerRV();
  yLeftFloor = vm.FetchIntegerRV();
  yRightFloor = vm.FetchIntegerRV();

  ok = theApp.GetWorld().GetMap().AddRoom(metaRoomID, xLeft, xRight,
                                          yLeftCeiling, yRightCeiling,
                                          yLeftFloor, yRightFloor, roomID);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToAddRoom);
  }
  theMainView.Refresh();
  return roomID;
}

int MapHandlers::IntegerRV_META(CAOSMachine &vm) {
  // check which camera we are on about...
  Camera *currentCamera = vm.GetCamera();

  if (currentCamera) {
    // get the metaroomid from the centre of the room
    int32 x;
    int32 y;
    currentCamera->GetViewCentre(x, y);

    int metaRoomID;
    if (!theApp.GetWorld().GetMap().GetMetaRoomIDForPoint(
            Vector2D((int)x, (int)y), metaRoomID)) {
      vm.ThrowRunError(CAOSMachine::sidFailedToGetMetaRoomLocation);
    }
    return metaRoomID;
  }

  return theApp.GetWorld().GetMap().GetCurrentMetaRoom();
}

int MapHandlers::IntegerRV_RTYP(CAOSMachine &vm) {
  int roomID = vm.FetchIntegerRV();
  return GetRoomType(theApp.GetWorld().GetMap(), roomID);
}

float MapHandlers::FloatRV_PROP(CAOSMachine &vm) {
  int roomID = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();
  if (roomID < 0)
    return 0.0f;
  float value;
  if (!theApp.GetWorld().GetMap().GetRoomProperty(roomID, caIndex, value))
    vm.ThrowRunError(CAOSMachine::sidFailedToGetRoomProperty);
  return value;
}

void MapHandlers::StringRV_BKGD(CAOSMachine &vm, std::string &str) {
  // check which camera we are on about...
  Camera *currentCamera = vm.GetCamera();

  if (currentCamera) {
    str = currentCamera->GetBackgroundName();
    return;
  }

  int metaRoomID = vm.FetchIntegerRV();
  bool ok = theApp.GetWorld().GetMap().GetCurrentBackground(metaRoomID, str);
  if (!ok) {
    vm.ThrowRunError(CAOSMachine::sidFailedToGetCurrentBackground);
  }
}

void MapHandlers::StringRV_BKDS(CAOSMachine &vm, std::string &str) {
  int metaRoomID = vm.FetchIntegerRV();
  StringCollection backgroundCollection;

  if (!theApp.GetWorld().GetMap().GetBackgroundCollection(metaRoomID,
                                                          backgroundCollection))
    vm.ThrowRunError(CAOSMachine::sidFailedToGetBackgrounds);

#ifdef C2E_OLD_CPP_LIB
  char hackbuf[1024];
  std::ostrstream stream(hackbuf, sizeof(hackbuf));
#else
  std::stringstream stream;
#endif

  for (StringIterator i = backgroundCollection.begin();
       i != backgroundCollection.end(); ++i) {
    if (i != backgroundCollection.begin())
      stream << ',';
    stream << *i;
  }

  str = stream.str();
}

int MapHandlers::IntegerRV_ROOM(CAOSMachine &vm) {
  AgentHandle agent = vm.FetchAgentRV();
  if (agent.IsInvalid()) {
    vm.ThrowInvalidAgentHandle(CAOSMachine::sidInvalidAgent);
  }
  int roomID = -1;

  // we return -1 if not in a valid room
  if (!agent.GetAgentReference().GetRoomID(roomID))
    roomID = -1;

  ASSERT(roomID >= -1 && roomID < INT_MAX);

  return roomID;
}

int MapHandlers::IntegerRV_HIRP(CAOSMachine &vm) {
  int roomID = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();
  int option = vm.FetchIntegerRV();
  if (roomID < 0)
    return -1;
  int result = GetRoomWithHighestCA(theApp.GetWorld().GetMap(), roomID, caIndex,
                                    option != 0);
  if (result < 0)
    vm.ThrowRunError(CAOSMachine::sidFailedToFindHighestCA);
  return result;
}

int MapHandlers::IntegerRV_LORP(CAOSMachine &vm) {
  int roomID = vm.FetchIntegerRV();
  int caIndex = vm.FetchIntegerRV();
  int option = vm.FetchIntegerRV();
  if (roomID < 0)
    return -1;
  int result = GetRoomWithLowestCA(theApp.GetWorld().GetMap(), roomID, caIndex,
                                   option != 0);
  if (result < 0)
    vm.ThrowRunError(CAOSMachine::sidFailedToFindLowestCA);
  return result;
}

float MapHandlers::FloatRV_TORX(CAOSMachine &vm) {
  vm.ValidateTarg();
  int roomID = vm.FetchIntegerRV();
  if (roomID < 0)
    return 0.0f;
  Vector2D vector;
  theApp.GetWorld().GetMap().GetRoomCentre(roomID, vector);
  return vector.x - vm.GetTarg().GetAgentReference().GetPosition().x;
}

float MapHandlers::FloatRV_TORY(CAOSMachine &vm) {
  vm.ValidateTarg();
  int roomID = vm.FetchIntegerRV();
  if (roomID < 0)
    return 0.0f;
  Vector2D vector;
  theApp.GetWorld().GetMap().GetRoomCentre(roomID, vector);
  return vector.y - vm.GetTarg().GetAgentReference().GetPosition().y;
}

int MapHandlers::IntegerRV_GRAP(CAOSMachine &vm) {
  float x = vm.FetchFloatRV();
  float y = vm.FetchFloatRV();
  return GetRoomAtPoint(theApp.GetWorld().GetMap(), x, y);
}

void MapHandlers::Command_BRMI(CAOSMachine &vm) {
  int mrbase = vm.FetchIntegerRV();
  int rmbase = vm.FetchIntegerRV();
  theApp.GetWorld().GetMap().SetIndexBases(mrbase, rmbase);
}

int MapHandlers::IntegerRV_GMAP(CAOSMachine &vm) {
  float x = vm.FetchFloatRV();
  float y = vm.FetchFloatRV();
  return GetMetaRoomAtPoint(theApp.GetWorld().GetMap(), x, y);
}

int MapHandlers::IntegerRV_GRID(CAOSMachine &vm) {
  int roomID;
  AgentHandle agent = vm.FetchAgentRV();
  if (agent.IsInvalid()) {
    vm.ThrowInvalidAgentHandle(CAOSMachine::sidInvalidAgent);
  }
  int direction = vm.FetchIntegerRV();

  // If in vehicle with cabin room, return no adjacent rooms
  Agent &agentRef = agent.GetAgentReference();
  if (agentRef.GetMovementStatus() == Agent::INVEHICLE) {
    int cabinRoom = agentRef.GetCarrier().GetVehicleReference().GetCabinRoom();
    if (cabinRoom > -1)
      return -1;
  }

  // Get centre of agent
  Vector2D centre = agentRef.GetCentre();
  bool ok = theApp.GetWorld().GetMap().SearchForAdjacentRoom(centre, direction,
                                                             roomID);
  if (!ok)
    return -1;
  return roomID;
}

void MapHandlers::StringRV_EMID(CAOSMachine &vm, std::string &str) {
  str = GetMetaRoomIDs(theApp.GetWorld().GetMap());
}

void MapHandlers::StringRV_ERID(CAOSMachine &vm, std::string &str) {
  int metaRoomID = vm.FetchIntegerRV();
  str = GetRoomIDs(theApp.GetWorld().GetMap(), metaRoomID);
  if (str.empty() && metaRoomID != -1)
    vm.ThrowRunError(CAOSMachine::sidFailedToGetRoomIDs);
}

void MapHandlers::StringRV_RLOC(CAOSMachine &vm, std::string &str) {
  int roomID = vm.FetchIntegerRV();
  str = GetRoomLocation(theApp.GetWorld().GetMap(), roomID);
  if (str.empty())
    vm.ThrowRunError(CAOSMachine::sidFailedToGetRoomLocation);
}

void MapHandlers::StringRV_MLOC(CAOSMachine &vm, std::string &str) {
  int metaRoomID = vm.FetchIntegerRV();
  str = GetMetaRoomLocation(theApp.GetWorld().GetMap(), metaRoomID);
  if (str.empty())
    vm.ThrowRunError(CAOSMachine::sidFailedToGetMetaRoomLocation);
}
