// stub_theApp.cpp
// Provides theApp global + the out-of-line App method bodies needed when
// test targets link FilePath.cpp or CreaturesArchive.cpp directly.
//
// These methods are declared in App.h (which FilePath.cpp already includes
// transitively). We just need to provide their bodies here.
//
// Do NOT include App.h — we get the class declaration transitively from
// the .cpp file under test. We only provide the symbol bodies.
//
// When IApp gains new out-of-line pure-virtual methods (i.e., methods not
// already inlined in App.h), add them here.

#include "engine/App.h"
#include "engine/Caos/CAOSVar.h"
#include "engine/InputManager.h"
#include <string>
#include <vector>

// --- App constructor / destructor -----------------------------------------
// Minimal ctor/dtor that don't spin up SDL, world, etc.
App::App()
    : mySaveNextTick(false), myQuitNextTick(false),
      myToggleFullScreenNextTick(false), myScrollingMask(0), myWorld(nullptr),
      myPrayManager(nullptr), mySystemTick(0), myProgressBar(nullptr),
      myPlayAllSoundsAtMaximumLevel(false), myAutoKillAgentsOnError(false),
      myRecentTickPos(0), myIHaveAPassword(false), myRenderDisplay(false),
      myRenderDisplayNextTick(false), myFastestTicks(false),
      myMaximumDistanceBeforePortLineWarns(0),
      myMaximumDistanceBeforePortLineSnaps(0), myStartStamp(0),
      myLastTickGap(0), myEameVars(nullptr), IOnlyPlayMidiMusic(false),
      IUseAdditionalRegistrySettings(false),
      myShouldSkeletonsAnimateDoubleSpeedFlag(false),
      myShouldHighlightAgentsKnownToCreatureFlag(false),
      myCreaturePermissionToHighlight(0), myPlaneForConnectiveAgentLines(0),
      myCreaturePickupStatus(0), myDisplaySettingsErrorNextTick(false),
      myResizedFlag(false), myMovedFlag(false), myDelayedResizeFlag(false),
      myDelayedMovingFlag(false) {
  memset(m_dirs, 0, sizeof(m_dirs));
  memset(m_auxDirs, 0, sizeof(m_auxDirs));
  memset(m_hasAuxDirs, 0, sizeof(m_hasAuxDirs));
}

App::~App() {}

// --- Out-of-line IApp / App methods ----------------------------------------
int App::GetZLibCompressionLevel() { return 6; }

bool App::GetWorldDirectoryVersion(int, std::string &, bool) { return false; }
bool App::GetWorldDirectoryVersion(const std::string &, std::string &, bool) {
  return false;
}

float App::GetTickRateFactor() { return 1.0f; }

CAOSVar &App::GetEameVar(const std::string &) {
  static CAOSVar dummy;
  return dummy;
}

int App::EorWolfValues(int, int) { return 0; }
void App::SetPassword(std::string &) {}
void App::RefreshGameVariables() {}
bool App::CreateNewWorld(std::string &) { return false; }
bool App::InitLocalisation() { return false; }
void App::SetScrolling(int, int, const std::vector<byte> *,
                       const std::vector<byte> *) {}

// Stub theApp global
App theApp;

// Other globals declared in App.h
SoundManager *theSoundManager = nullptr;
MusicManager *theMusicManager = nullptr;
