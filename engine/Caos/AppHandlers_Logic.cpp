// AppHandlers_Logic.cpp
// Logic-layer implementations for GeneralHandlers static IApp& methods.
// Kept in a separate translation unit so test_AppHandlers can link against
// this file without pulling in App, SDL, FlightRecorder, or any other engine
// singleton beyond IApp.h.
//
// The production handlers in GeneralHandlers.cpp delegate to these.

#include "../Caos/CAOSVar.h"
#include "../IApp.h"
#include "GeneralHandlers.h"
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// Action requests (deferred until next tick)
// ---------------------------------------------------------------------------

void GeneralHandlers::RequestSave(IApp &app) { app.RequestSave(); }

void GeneralHandlers::RequestQuit(IApp &app) { app.RequestQuit(); }

void GeneralHandlers::RequestLoad(IApp &app, const std::string &worldName) {
  app.RequestLoad(worldName);
}

// ---------------------------------------------------------------------------
// Time / tick queries
// ---------------------------------------------------------------------------

uint32 GeneralHandlers::GetSystemTick(IApp &app) { return app.GetSystemTick(); }

int GeneralHandlers::GetLastTickGap(IApp &app) { return app.GetLastTickGap(); }

float GeneralHandlers::GetTickRateFactor(IApp &app) {
  return app.GetTickRateFactor();
}

// ---------------------------------------------------------------------------
// Game identity
// ---------------------------------------------------------------------------

std::string GeneralHandlers::GetGameName(IApp &app) {
  return app.GetGameName();
}

// ---------------------------------------------------------------------------
// EAME variables
// ---------------------------------------------------------------------------

CAOSVar &GeneralHandlers::GetEameVar(IApp &app, const std::string &name) {
  return app.GetEameVar(name);
}

// ---------------------------------------------------------------------------
// Input — mouse position / velocity
// These delegate to the InputManager held inside IApp.
// ---------------------------------------------------------------------------

int GeneralHandlers::GetMouseX(IApp &app) {
  return app.GetInputManager().GetMouseX();
}

int GeneralHandlers::GetMouseY(IApp &app) {
  return app.GetInputManager().GetMouseY();
}

float GeneralHandlers::GetMouseVX(IApp &app) {
  return app.GetInputManager().GetMouseVX();
}

float GeneralHandlers::GetMouseVY(IApp &app) {
  return app.GetInputManager().GetMouseVY();
}

// ---------------------------------------------------------------------------
// Input — keyboard query
// Note: on non-Win32 platforms IsKeyDown() always returns false (no async
// keyboard polling available). The logic layer faithfully forwards the call;
// tests on macOS will therefore always see 0 — that is the correct platform
// behaviour.
// ---------------------------------------------------------------------------

int GeneralHandlers::IsKeyDown(IApp &app, int keycode) {
  return app.GetInputManager().IsKeyDown(keycode) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Wolf / game-state EOR
// ---------------------------------------------------------------------------

int GeneralHandlers::EorWolfValues(IApp &app, int andMask, int eorMask) {
  return app.EorWolfValues(andMask, eorMask);
}

// ---------------------------------------------------------------------------
// Scrolling state (SCOL)
// ---------------------------------------------------------------------------

int GeneralHandlers::GetScrollingMask(IApp &app) {
  return app.GetScrollingMask();
}

void GeneralHandlers::SetScrolling(IApp &app, int andMask, int eorMask,
                                   const std::vector<byte> *speedUp,
                                   const std::vector<byte> *speedDown) {
  app.SetScrolling(andMask, eorMask, speedUp, speedDown);
}
