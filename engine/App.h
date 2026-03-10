// --------------------------------------------------------------------------
// Filename:	App.h
// Class:		App
// Purpose:		This contains the application class
//
//
// Description:
//
//
//
// History:
// -------  Steve Grand		created
// 04Dec98	Alima			Commented out old display engine stuff
// and put
//							in new display engine
// hooks.
//
//////////////////////////////////////////////////////////////////////////////

#ifndef SmallFurryCreatures_h
#define SmallFurryCreatures_h

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "../common/C2eTypes.h"
#include "resource.h"
#ifdef _WIN32
#include "Display/Window.h"
#endif
#include "AppConstants.h"
#include "Caos/RequestManager.h"
#include "IApp.h"
#include "InputManager.h"
#include "TimeFuncs.h"

#ifndef _WIN32
// registry replacement (could be used for win32 too...)
#include "../common/Configurator.h"
#endif

class World;
class Agent;
class CAOSVar;
class PrayManager;

////////////////////// GLOBALS ////////////////////////

extern class App theApp;
extern class SoundManager *theSoundManager; // pointer to sound manager object
extern class MusicManager
    *theMusicManager; // pointer to global music manager object

class EntityImage;

// -------------------------------------------------------------------------
// Class: App
// The main application container and orchestrator.
// This class *probably* holds most core global systems (like World, input,
// etc.), manages the system tick loops, settings, and main window logic. It
// effectively glues the OS specific code (SDL_Main.cpp or Window.cpp) to the
// game's core simulation logic and the scripts (CAOS).
// -------------------------------------------------------------------------
class App : public IApp {
public:
  App();
  ~App();

#ifndef _WIN32
  // Sets up the registry-replacing config files, which are accessed by
  // UserSettings() and MachineSettings()
  // _Should_ really be in Init() or constructor, but we need this
  // separate function because App::Init() is called _after_ the window
  // is opened but the startup code accesses other App members before
  // the window is opened.
  //
  // Sigh.
  //
  // (Startup code is in Display/Window.cpp or Display/SDL/SDL_Main.cpp)
  bool InitConfigFiles(const std::string &userfile,
                       const std::string &machinefile);
#endif

  const char *GetDirectory(int dir) override {
    return (const char *)m_dirs[dir];
  }
  const char *GetDirectory(int dir, char *buffer) {
    return (const char *)(strcpy(buffer, (const char *)m_dirs[dir]));
  }
  // Returns auxiliary (e.g. C3) directory for the given dir type, or NULL if
  // none.
  const char *GetAuxiliaryDirectory(int dir) {
    if (dir >= 0 && dir < NUM_DIRS && m_hasAuxDirs[dir])
      return (const char *)m_auxDirs[dir];
    return NULL;
  }

  void DisplaySettingsErrorNextTick() { myDisplaySettingsErrorNextTick = true; }

  void InitialiseFromGameVariables();
  // get the world directory path of the given folder
  // e.g. ..\\Worlds\\Myworld\\Images
  bool GetWorldDirectoryVersion(int dir, std::string &path,
                                bool createFilePlease = false);
  // or a named one that isn't in the main world (attic etc.)
  bool GetWorldDirectoryVersion(const std::string &name, std::string &path,
                                bool createFilePlease /*=false*/);

  inline int GetLinePlane() { return myPlaneForConnectiveAgentLines; }

  inline int GetCreaturePickupStatus() { return myCreaturePickupStatus; }

  inline bool ShouldSkeletonsAnimateDoubleSpeed() {
    return myShouldSkeletonsAnimateDoubleSpeedFlag;
  }
  inline void ShouldSkeletonsAnimateDoubleSpeed(bool b) {
    myShouldSkeletonsAnimateDoubleSpeedFlag = b;
  }

  inline bool ShouldHighlightAgentsKnownToCreature() {
    return myShouldHighlightAgentsKnownToCreatureFlag;
  }
  inline void SetWhetherWeShouldHighlightAgentsKnownToCreature(bool b) {
    myShouldHighlightAgentsKnownToCreatureFlag = b;
  }
  inline void SetWhichCreaturePermissionToHighlight(int i) {
    myCreaturePermissionToHighlight = i;
  }
  inline int GetWhichCreaturePermissionToHighlight() {
    return myCreaturePermissionToHighlight;
  }

  inline float GetMaximumDistanceBeforePortLineWarns() {
    return myMaximumDistanceBeforePortLineWarns;
  }
  inline float GetMaximumDistanceBeforePortLineSnaps() {
    return myMaximumDistanceBeforePortLineSnaps;
  }

  // return a reference to the world
  World &GetWorld() { return *myWorld; }

  int GetZLibCompressionLevel();

  // Return a reference to the resource manager
  PrayManager &GetResourceManager() { return *myPrayManager; }

  InputManager &GetInputManager() override { return myInputManager; }

#ifdef _WIN32
  HWND GetHandle() { return myMainHWND; }
  HWND GetMainHWND() { return myMainHWND; }
#endif // _WIN32

  std::string GetGameName() override { return myGameName; }
  void SetGameName(const std::string &gameName) { myGameName = gameName; }

  // IApp: non-static virtual (returns fixed 50ms interval)
  int GetWorldTickInterval() const override { return 50; }

  bool DoYouOnlyPlayMidiMusic() { return IOnlyPlayMidiMusic; }

  bool PlayAllSoundsAtMaximumLevel() { return myPlayAllSoundsAtMaximumLevel; }

  // the macro language can request that the app
  // uses the parent menu settings
  void HandleAdditionalRegistrySettings();
  void HandleInput();

#ifdef _WIN32
  bool Init(HWND wnd);
#else
  bool Init();
#endif

  void UpdateApp();
  void ShutDown();
  void HandleIncomingRequest(ServerSide &server);

  void ChangeResolution();
  void ToggleFullScreenMode();
  void SetUpMainView(); // here until I know what the room system will
                        // be about
  void DisableMapImage();
  void EnableMapImage();
  void WindowHasResized();
  void WindowHasMoved();

  void DisableMainView();
  void EnableMainView();

  void ToggleMidi() { IOnlyPlayMidiMusic = !IOnlyPlayMidiMusic; }

  bool GetDirectories();
  bool InitLocalisation() override;
  bool CreateNewWorld(std::string &worldName) override;

  void BeginWaitCursor();
  void EndWaitCursor();

  inline uint32 GetSystemTick() const override { return mySystemTick; }
  float GetTickRateFactor() override;
  bool GetFastestTicks() const { return myFastestTicks; }
  int GetLastTickGap() const override { return myLastTickGap; }

  bool CreateProgressBar();
  void StartProgressBar(int catOffset);
  void SpecifyProgressIntervals(int updateIntervals);

  void UpdateProgressBar();
  void EndProgressBar();

  void DoParentMenuTests(int bedTimeMinutes, bool &quitgame,
                         SYSTEMTIME &currentTime, bool &nornsAreTiredAlready);
  bool DoYouUseAdditionalRegistrySettings() {
    return IUseAdditionalRegistrySettings;
  }
  bool ConstructSystemTime(SYSTEMTIME &time, std::string &string);
  SYSTEMTIME &GetStartTime() { return myGameStartTime; }
  void GetTimeGameShouldEnd();
  void GameEndHelper(SYSTEMTIME &dest, SYSTEMTIME &source);

  void SetPassword(std::string &password) override;
  std::string GetPassword();
  bool DoINeedToGetPassword();

  void RefreshGameVariables() override;

  bool ProcessCommandLine(std::string commandLine);
  bool AutoKillAgentsOnError() const { return myAutoKillAgentsOnError; }
  int EorWolfValues(int andMask, int eorMask) override;

  // Engine machine variables (EAME) — persist across world loads.
  CAOSVar &GetEameVar(const std::string &name) override;

  // -----------------------------------------------------------------------
  // IApp action requests — set deferred flags read by the update loop
  // -----------------------------------------------------------------------
  void RequestSave() override { mySaveNextTick = true; }
  void RequestQuit() override { myQuitNextTick = true; }
  void RequestLoad(const std::string &w) override {
    myLoadThisWorldNextTick = w;
  }
  void RequestToggleFullScreen() override { myToggleFullScreenNextTick = true; }

  // -----------------------------------------------------------------------
  // IApp scrolling state
  // -----------------------------------------------------------------------
  int GetScrollingMask() const override { return myScrollingMask; }
  void SetScrolling(int andMask, int eorMask, const std::vector<byte> *speedUp,
                    const std::vector<byte> *speedDown) override;


#ifdef _WIN32
  bool CheckForCD();
  bool CheckForMutex();
  bool CheckAllFreeDiskSpace();
  bool CheckFreeDiskSpace(std::string path, bool systemDirectory);
#endif

public:
  bool mySaveNextTick;
  std::string myLoadThisWorldNextTick;
  bool myQuitNextTick;
  bool myToggleFullScreenNextTick;

  int myScrollingMask;
  std::vector<byte> myScrollingSpeedRangeUp;
  std::vector<byte> myScrollingSpeedRangeDown;

  static const int ourTickLengthsAgo;

#ifndef _WIN32
  // registry replacement

  // access settings specific to current player
  Configurator &UserSettings() { return myUserSettings; }

  // access settings global to whole installation (eg directory paths)
  Configurator &MachineSettings() { return myMachineSettings; }
#endif

private:
  void DoLoadWorld(std::string worldName);
  void internalWindowHasResized();
  void internalWindowHasMoved();

  bool DebugKeyNow();
  bool DebugKeyNowNoShift();

#ifndef _WIN32
  // registry replacement
  Configurator myUserSettings;
  Configurator myMachineSettings;
#endif

  bool myResizedFlag;
  bool myMovedFlag;
  bool myDisplaySettingsErrorNextTick;
  bool myDelayedResizeFlag;
  bool myDelayedMovingFlag;
  bool InitLocalCatalogueFilesFromTheWorldsDirectory();

  bool myShouldSkeletonsAnimateDoubleSpeedFlag;
  bool myShouldHighlightAgentsKnownToCreatureFlag;
  int myCreaturePermissionToHighlight;
  int myPlaneForConnectiveAgentLines;

  int myCreaturePickupStatus;
  //	bool myShouldCreatureClicksBeHoldingHands;

#ifdef _WIN32
  char m_dirs[NUM_DIRS][MAX_PATH];
  char m_auxDirs[NUM_DIRS][MAX_PATH];
#else
  char m_dirs[NUM_DIRS][512];
  char m_auxDirs[NUM_DIRS][512];
#endif
  bool m_hasAuxDirs[NUM_DIRS];

  void SetUpSound(void);
  bool IOnlyPlayMidiMusic;
#ifdef _WIN32
  HWND myMainHWND;
  HCURSOR myCursor;
  LPCTSTR m_pszRegistryKey; // used for registry entries
  HANDLE myMutex;
#endif // _WIN32

  // lots of Creatures Adventures stuff thinly veiled
  // as generic stuff
  bool IUseAdditionalRegistrySettings;
  SYSTEMTIME myBedTime;
  SYSTEMTIME myMaxPlayingTime;
  SYSTEMTIME myGameStartTime;
  SYSTEMTIME myRecordOfYourBirthday;
  SYSTEMTIME myEndGameTime;

  World *myWorld;
  PrayManager *myPrayManager;
  RequestManager myRequestManager;

  // The system framework will keep the InputManager fed (see window.cpp)
  InputManager myInputManager;

  std::string myGameName;

  uint32 mySystemTick;
  EntityImage *myProgressBar;
  bool myPlayAllSoundsAtMaximumLevel;
  bool myAutoKillAgentsOnError;

  std::vector<uint32> myRecentTickLengths;
  int myRecentTickPos;
  std::string myPasswordForNextWorldLoaded;
  bool myIHaveAPassword;

  bool myRenderDisplay;
  bool myRenderDisplayNextTick;
  bool myFastestTicks;

  float myMaximumDistanceBeforePortLineWarns;
  float myMaximumDistanceBeforePortLineSnaps;

  uint32 myStartStamp;
  int myLastTickGap;

  // Engine machine variables (EAME) — not serialised, set fresh each boot.
  std::map<std::string, CAOSVar> *myEameVars;
};

/////////////////////////////////////////////////////////////////////////////

#endif
