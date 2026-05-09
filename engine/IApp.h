// -------------------------------------------------------------------------
// Filename:    IApp.h
// Purpose:     Narrow abstract interface exposing the subset of App that
//              CAOS handlers actually need.
//
//              Extracting this interface allows:
//              1. Test doubles for App (handlers can be unit-tested without
//                 a live App + SDL + filesystem).
//              2. Clearer documentation of which App subsystems the CAOS
//                 layer actually depends on.
//
// Usage:
//   App derives from IApp and overrides these pure virtuals.
//   Handlers that currently access theApp directly can instead accept an
//   IApp& parameter, enabling injection of a FakeApp in tests.
// -------------------------------------------------------------------------

#ifndef IAPP_H
#define IAPP_H

#include "../common/C2eTypes.h"
#include "AppConstants.h" // for dir constants (JOURNAL_DIR, etc.)
#include "InputManager.h"
#include <string>
#include <vector>

class CAOSVar;

// -------------------------------------------------------------------------
// Class: IApp
// A narrow façade over the parts of App consumed by CAOS handlers.
// -------------------------------------------------------------------------
class IApp {
public:
  virtual ~IApp() {}

  // -----------------------------------------------------------------------
  // Input
  // -----------------------------------------------------------------------
  virtual InputManager &GetInputManager() = 0;

  // -----------------------------------------------------------------------
  // Time / tick queries
  // -----------------------------------------------------------------------
  virtual uint32 GetSystemTick() const = 0;
  virtual int GetLastTickGap() const = 0;
  virtual float GetTickRateFactor() = 0;
  virtual int GetWorldTickInterval() const = 0;

  // -----------------------------------------------------------------------
  // Game identity / directories
  // -----------------------------------------------------------------------
  virtual std::string GetGameName() = 0;
  virtual const char *GetDirectory(int dir) = 0;
  virtual bool GetWorldDirectoryVersion(int dir, std::string &path,
                                        bool createFilePlease = false) = 0;

  // -----------------------------------------------------------------------
  // EAME variables (engine machine variables — persist across world loads)
  // -----------------------------------------------------------------------
  virtual CAOSVar &GetEameVar(const std::string &name) = 0;

  // -----------------------------------------------------------------------
  // Wolf / game-state EOR
  // -----------------------------------------------------------------------
  virtual int EorWolfValues(int andMask, int eorMask) = 0;

  // -----------------------------------------------------------------------
  // Action requests (deferred until next tick)
  // -----------------------------------------------------------------------
  virtual void RequestSave() = 0;
  virtual void RequestQuit() = 0;
  virtual void RequestLoad(const std::string &worldName) = 0;
  virtual void RequestToggleFullScreen() = 0;

  // -----------------------------------------------------------------------
  // World management
  // -----------------------------------------------------------------------
  virtual bool CreateNewWorld(std::string &worldName) = 0;
  virtual bool InitLocalisation() = 0;
  virtual void RefreshGameVariables() = 0;
  virtual void SetPassword(std::string &password) = 0;

  // -----------------------------------------------------------------------
  // Scrolling state
  // -----------------------------------------------------------------------
  virtual int GetScrollingMask() const = 0;
  virtual void SetScrolling(int andMask, int eorMask,
                            const std::vector<byte> *speedUp,
                            const std::vector<byte> *speedDown) = 0;
};

#endif // IAPP_H
