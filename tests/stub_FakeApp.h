// stub_FakeApp.h
// FakeInputManager and FakeApp : IApp test doubles for unit tests.
//
// FakeApp owns a real InputManager instance (so no SDL dependency —
// InputManager.h / InputManager.cpp link freely without the full engine).
// Mouse position is injected via SysAddMouseMoveEvent(); the
// velocity calc uses SysFlushEventBuffer() to advance the ring buffer.
//
// IsKeyDown() on non-Win32 always returns false (no async key polling
// available on macOS), so KEYD tests simply verify the 0-return path.

#pragma once

#include "engine/Caos/CAOSVar.h"
#include "engine/IApp.h"
#include "engine/InputManager.h"
#include <map>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// FakeApp : IApp
// ---------------------------------------------------------------------------

class FakeApp : public IApp {
public:
  // --- Recorded invocations -----------------------------------------------
  bool wasSaved = false;
  bool wasQuit = false;
  std::string loadedWorld;

  // --- Configurable return values ------------------------------------------
  std::string gameName = "TestGame";
  uint32 systemTick = 0;
  int lastTickGap = 16;
  float tickRateFactor = 1.0f;
  int scrollingMask = 0;
  int wolfResult = 0;

  // --- EAME variable store -------------------------------------------------
  std::map<std::string, CAOSVar> eameVars;

  // --- Recorded SCOL arguments ---------------------------------------------
  int scolAndMask = -1;
  int scolEorMask = -1;

  // --- Recorded WOLF arguments ---------------------------------------------
  int wolfAndMask = -1;
  int wolfEorMask = -1;

  // -----------------------------------------------------------------------
  // IApp overrides
  // -----------------------------------------------------------------------

  InputManager &GetInputManager() override { return myInputManager; }

  uint32 GetSystemTick() const override { return systemTick; }
  int GetLastTickGap() const override { return lastTickGap; }
  float GetTickRateFactor() override { return tickRateFactor; }
  int GetWorldTickInterval() const override { return 0; }

  std::string GetGameName() override { return gameName; }
  const char *GetDirectory(int) override { return ""; }
  bool GetWorldDirectoryVersion(int, std::string &, bool) override {
    return false;
  }

  CAOSVar &GetEameVar(const std::string &name) override {
    return eameVars[name];
  }

  int EorWolfValues(int andMask, int eorMask) override {
    wolfAndMask = andMask;
    wolfEorMask = eorMask;
    return wolfResult;
  }

  void RequestSave() override { wasSaved = true; }
  void RequestQuit() override { wasQuit = true; }
  void RequestLoad(const std::string &worldName) override {
    loadedWorld = worldName;
  }
  void RequestToggleFullScreen() override {}

  bool CreateNewWorld(std::string &) override { return false; }
  bool InitLocalisation() override { return false; }
  void RefreshGameVariables() override {}
  void SetPassword(std::string &) override {}

  int GetScrollingMask() const override { return scrollingMask; }
  void SetScrolling(int andMask, int eorMask, const std::vector<byte> *,
                    const std::vector<byte> *) override {
    scolAndMask = andMask;
    scolEorMask = eorMask;
  }

private:
  InputManager myInputManager;
};
