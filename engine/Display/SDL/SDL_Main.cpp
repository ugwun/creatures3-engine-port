// -------------------------------------------------------------------------
// Filename:    SDL_Main.cpp
// -------------------------------------------------------------------------

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "SDL_Main.h"
// #include "../../ServerThread.h"
// #include "../../../common/ServerSide.h"
#include "../../InputManager.h"
// #include "../../../common/RegistryHandler.h"
#include "../../World.h"
#include "../../build.h"
#include "../DisplayEngine.h"
#include "../ErrorMessageHandler.h"
#include "../MainCamera.h"
// #include "../../../common/CStyleException.h"
#include "../../App.h"
#include "../../C2eServices.h" // for theFlightRecorder
#include "../../DebugServer.h"
#include "TickRateUtils.h"

#include <atomic>

#include <cstdlib> // atof
#include <time.h>
#include <unistd.h> // chdir / getcwd
#include <mach-o/dyld.h> // _NSGetExecutablePath

// --- In-process crash reporter -----------------------------------------
#include <cstring>    // strsignal()
#include <cxxabi.h>   // abi::__cxa_demangle()
#include <execinfo.h> // backtrace(), backtrace_symbols()
#include <signal.h>

// Alternate signal stack so the handler survives stack-overflow crashes.
static uint8_t sCrashStack[65536];

// -----------------------------------------------------------------------
// ExtractMangledName()
// Parses the mangled C++ symbol from a macOS backtrace_symbols() string.
// Format: "<frame>  <binary>  <address>  <mangled> + <offset>"
// Returns a pointer into `sym` (no allocation), or nullptr on failure.
// -----------------------------------------------------------------------
static const char *ExtractMangledName(const char *sym, char *out,
                                      size_t outLen) {
  // Walk past: frame number, whitespace, binary name, whitespace, address,
  // whitespace
  const char *p = sym;
  while (*p == ' ')
    ++p; // skip leading spaces
  while (*p && *p != ' ')
    ++p; // skip frame number
  while (*p == ' ')
    ++p; // skip whitespace
  while (*p && *p != ' ')
    ++p; // skip binary name
  while (*p == ' ')
    ++p; // skip whitespace
  while (*p && *p != ' ')
    ++p; // skip address
  while (*p == ' ')
    ++p; // skip whitespace
  // p now points to the mangled name (or raw symbol)
  const char *start = p;
  while (*p && *p != ' ' && *p != '+')
    ++p;
  size_t len = (size_t)(p - start);
  if (len == 0 || len >= outLen)
    return nullptr;
  memcpy(out, start, len);
  out[len] = '\0';
  return out;
}

// -----------------------------------------------------------------------
// CrashSignalHandler()
// Intercepts fatal signals, captures a demangled C++ stack trace, and
// broadcasts it via FlightRecorder UDP before re-raising the signal.
// -----------------------------------------------------------------------
static void CrashSignalHandler(int sig) {
  // Collect backtrace (backtrace() is async-signal-safe on macOS/Darwin)
  void *frames[64];
  int frameCount = backtrace(frames, 64);

  // backtrace_symbols() malloc's — not strictly async-signal-safe, but
  // acceptable since the process is about to die.
  char **symbols = backtrace_symbols(frames, frameCount);

  theFlightRecorder.Log(64, "CRASH: signal %d (%s)", sig, strsignal(sig));

  char mangledBuf[512];
  for (int i = 0; i < frameCount; ++i) {
    if (!symbols) {
      theFlightRecorder.Log(64, "  #%d <no symbols>", i);
      continue;
    }
    // Try to demangle the C++ name
    const char *mangled =
        ExtractMangledName(symbols[i], mangledBuf, sizeof(mangledBuf));
    if (mangled) {
      int status = 0;
      char *demangled = abi::__cxa_demangle(mangled, nullptr, nullptr, &status);
      if (status == 0 && demangled) {
        theFlightRecorder.Log(64, "  #%d %s", i, demangled);
        free(demangled);
        continue;
      }
    }
    // Fallback: raw symbol line
    theFlightRecorder.Log(64, "  #%d %s", i, symbols[i]);
  }

  // Give UDP packets 200ms to transmit before the process dies.
  usleep(200000);

  // Re-raise so macOS still generates the .ips crash report.
  signal(sig, SIG_DFL);
  raise(sig);
}

// -----------------------------------------------------------------------
// InstallCrashHandlers()
// Sets up sigaltstack + sigaction for the four fatal signals.
// Called after InitInstance() so the FlightRecorder UDP socket is live.
// -----------------------------------------------------------------------
static void InstallCrashHandlers() {
  // Set up alternate signal stack (survives stack overflow)
  stack_t ss;
  ss.ss_sp = sCrashStack;
  ss.ss_size = sizeof(sCrashStack);
  ss.ss_flags = 0;
  sigaltstack(&ss, nullptr);

  struct sigaction sa;
  memset(&sa, 0, sizeof(sa));
  sa.sa_handler = CrashSignalHandler;
  sa.sa_flags =
      SA_ONSTACK | SA_RESETHAND; // use alt stack, auto-reset to SIG_DFL
  sigemptyset(&sa.sa_mask);

  sigaction(SIGSEGV, &sa, nullptr);
  sigaction(SIGBUS, &sa, nullptr);
  sigaction(SIGABRT, &sa, nullptr);
  sigaction(SIGILL, &sa, nullptr);
}
// --- End crash reporter ------------------------------------------------

const unsigned int theClientServerBufferSize = 1024 * 1024;

static bool ourRunning;
// static bool ourTerminateApplication;
static bool ourQuit;
static float gameSpeedMultiplier = 1.0f;
static bool enableTools = false;
static bool enableMCP = false;
static std::string toolsPathOverride;

// Global engine pause flag — controlled via Developer Tools.
// When true, the main loop skips theApp.UpdateApp() but still
// processes SDL events, renders, and polls the DebugServer.
static std::atomic<bool> sEnginePaused{false};

void SetEnginePaused(bool paused) { sEnginePaused.store(paused); }
bool IsEnginePaused() { return sEnginePaused.load(); }

// exter
// HWND theMainWindow = 0;

static bool InitInstance();
static bool DoStartup();
static void DoShutdown();
static void HandleEvent(const SDL_Event &event);

// -------------------------------------------------------------------------
// main()
// *Probably* the main entry point of the game on SDL platforms.
// It initializes core variables, SDL libraries, and kicks off the
// main event loop to handle OS signals (like SDL_Quit) and mouse/key input.
// -------------------------------------------------------------------------
int main(int argc, char *argv[]) {
  try {
    ourRunning = true;

    // -----------------------------------------------------------------------
    // Parse command-line arguments.
    //
    // Supported flags:
    //   --game-dir <path>   (or -d <path>)
    //     Change the working directory to <path> before initialising.
    //     All relative paths in machine.cfg are then resolved from there.
    //     Example:
    //       ./build/lc2e --game-dir "/Users/me/Creatures Docking
    //       Station/Docking Station"
    //
    //   --help / -h
    //     Print usage and exit.
    // -----------------------------------------------------------------------
    for (int i = 1; i < argc; ++i) {
      std::string arg(argv[i]);
      if (arg == "--help" || arg == "-h") {
        fprintf(stdout,
                "Usage: lc2e [OPTIONS]\n"
                "\n"
                "Options:\n"
                "  --game-dir <path>   Change working directory to <path>\n"
                "  -d <path>           Alias for --game-dir\n"
                "  --gamespeed <N>     Game speed multiplier (float, default 1)\n"
                "  -s <N>              Alias for --gamespeed\n"
                "  --tools [path]      Start developer tools server on port 9980\n"
                "                      Optional path overrides tools/ directory\n"
                "  --mcp               Start API-only server on port 9980\n"
                "                      For use with MCP clients (AI agents)\n"
                "  --help, -h          Show this help message\n"
                "\n"
                "Examples:\n"
                "  ./build/lc2e --game-dir \"/Users/me/Creatures Docking "
                "Station/Docking Station\"\n"
                "  ./build/lc2e -d \"/path/to/game\" --gamespeed 3\n"
                "  ./build/lc2e -d \"/path/to/game\" --tools\n"
                "  ./build/lc2e -d \"/path/to/game\" --mcp\n"
                "\n"
                "If --game-dir is not specified, the current working directory "
                "is used.\n");
        return 0;
      } else if ((arg == "--game-dir" || arg == "-d") && i + 1 < argc) {
        const char *gameDir = argv[++i];
        if (chdir(gameDir) != 0) {
          perror(
              (std::string("lc2e: cannot chdir to '") + gameDir + "'").c_str());
          return 1;
        }
        fprintf(stderr, "[lc2e] Game directory: %s\n", gameDir);
      } else if ((arg == "--gamespeed" || arg == "-s") && i + 1 < argc) {
        gameSpeedMultiplier = (float)atof(argv[++i]);
        if (gameSpeedMultiplier <= 0.0f)
          gameSpeedMultiplier = 1.0f;
        fprintf(stderr, "[lc2e] Game speed multiplier: %.2fx\n",
                gameSpeedMultiplier);
      } else if (arg == "--tools") {
        enableTools = true;
        // Optional path override: --tools /path/to/tools/
        if (i + 1 < argc && argv[i + 1][0] != '-') {
          toolsPathOverride = argv[++i];
        }
      } else if (arg == "--mcp") {
        enableMCP = true;
      }
    }

    if (!InitInstance())
      return 0;

    // Install crash signal handlers now that FlightRecorder UDP is live.
    InstallCrashHandlers();

    // Start debug/API server if --tools or --mcp was passed.
    if (enableTools || enableMCP) {
      if (enableTools) {
        // Resolve tools/ directory for static file serving
        std::string toolsDir;
        if (!toolsPathOverride.empty()) {
          toolsDir = toolsPathOverride;
        } else {
          // Resolve relative to the executable: <exe_dir>/../tools/
          char exePath[1024];
          uint32_t exeSize = sizeof(exePath);
          if (_NSGetExecutablePath(exePath, &exeSize) == 0) {
            std::string exeDir(exePath);
            size_t lastSlash = exeDir.rfind('/');
            if (lastSlash != std::string::npos)
              exeDir = exeDir.substr(0, lastSlash);
            toolsDir = exeDir + "/../tools";
          }
          // Fallback: ./tools/ relative to cwd
          if (toolsDir.empty()) {
            toolsDir = "./tools";
          }
        }
        theDebugServer.Start(9980, toolsDir);
      } else {
        // API-only mode for MCP
        theDebugServer.Start(9980);
      }
    }

    /* Initialize the SDL library (starts the event loop) */
    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
      return 1;
    }

    DoStartup();

    // SDL2 text input: enable the text input subsystem so that SDL_TEXTINPUT
    // events fire for printable characters (replaces SDL1 keysym-to-char hack).
    SDL_StartTextInput();

    SDL_Event event;

    while (!ourQuit) {
      // Process all pending SDL events (input, window events, quit, etc.)
      while (SDL_PollEvent(&event)) {
        HandleEvent(event);
      }

      // Advance the simulation and render - equivalent to WM_TICK on Windows
      uint32_t tickStart = SDL_GetTicks();
      if (!ourQuit) {
        if (!sEnginePaused.load()) {
          theApp.UpdateApp();
          theApp.GetInputManager().SysFlushEventBuffer();

          // Check for deferred fullscreen toggle (CAOS WDOW command sets the
          // flag; we consume it here, mirroring Window.cpp's WM_TICK handler).
          if (theApp.myToggleFullScreenNextTick) {
            theApp.ToggleFullScreenMode();
            theApp.myToggleFullScreenNextTick = false;
          }
        }
        if (enableTools || enableMCP) theDebugServer.Poll();
      }

      // Sleep for the remainder of the tick interval, mirroring the Windows
      // Ticker() thread (Window.cpp:421-447).  GetWorldTickInterval() returns
      // 50ms (20 ticks/sec) — the standard Creatures engine rate.
      if (sEnginePaused.load()) {
        // When paused, sleep a short interval to avoid busy-waiting
        // while still being responsive to SDL events and debug server.
        SDL_Delay(16);
      } else if (theApp.GetFastestTicks()) {
        // WOLF mode (CAOS command) — run as fast as possible.
        SDL_Delay(1);
      } else {
        uint32_t effectiveInterval = ComputeEffectiveTickInterval(
            theApp.GetWorldTickInterval(), gameSpeedMultiplier);
        uint32_t elapsed = SDL_GetTicks() - tickStart;
        uint32_t sleepMs = ComputeSleepDuration(effectiveInterval, elapsed);
        if (sleepMs > 0)
          SDL_Delay(sleepMs);
      }
    }
  }
  // We catch all exceptions in release mode for robustness.
  // In debug mode it is more useful to see what line of code
  // the error was caused by.
  catch (BasicException &e) {
    ErrorMessageHandler::Show(e, std::string("WinMain"));
  } catch (...) {
    // We don't want to localise this message, to avoid getting into
    // infinite exception traps when the catalogues are bad.
    ErrorMessageHandler::NonLocalisable(
        "NLE0004: Unknown exception caught in initialisation or main loop",
        std::string("WinMain"));
  }

  //	timeEndPeriod(1);

  SDL_Quit();
  return TRUE;
}

// -------------------------------------------------------------------------
// HandleEvent()
// Translates SDL inputs into the engine's InputManager equivalents.
// *Probably* maps SDL mouse/keyboard structs into the game engine's custom
// input structure.
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// SdlSymToVK()
// Translates an SDL2 key code (SDL_Keycode) to a Windows Virtual Key code.
// Printable ASCII (32-126) maps directly since SDL sym == ASCII == VK.
// Special keys (arrows, F-keys, modifiers, nav cluster) are remapped via
// a small lookup table.  Unknown keys are passed through unchanged.
// -------------------------------------------------------------------------
static int SdlSymToVK(SDL_Keycode sym) {
  // Special keys that don't map 1:1 with Windows VK codes.
  // SDL SDLK_* values vs VK_* values from engine/unix/KeyScan.h:
  struct {
    SDL_Keycode sdl;
    int vk;
  } table[] = {
      // Navigation cluster
      {SDLK_LEFT, 0x25},     // VK_LEFT
      {SDLK_RIGHT, 0x27},    // VK_RIGHT
      {SDLK_UP, 0x26},       // VK_UP
      {SDLK_DOWN, 0x28},     // VK_DOWN
      {SDLK_HOME, 0x24},     // VK_HOME
      {SDLK_END, 0x23},      // VK_END
      {SDLK_INSERT, 0x2D},   // VK_INSERT
      {SDLK_DELETE, 0x2E},   // VK_DELETE
      {SDLK_PAGEUP, 0x21},   // VK_PRIOR
      {SDLK_PAGEDOWN, 0x22}, // VK_NEXT
      // Function keys
      {SDLK_F1, 0x70},
      {SDLK_F2, 0x71},
      {SDLK_F3, 0x72},
      {SDLK_F4, 0x73},
      {SDLK_F5, 0x74},
      {SDLK_F6, 0x75},
      {SDLK_F7, 0x76},
      {SDLK_F8, 0x77},
      {SDLK_F9, 0x78},
      {SDLK_F10, 0x79},
      {SDLK_F11, 0x7A},
      {SDLK_F12, 0x7B},
      // Modifiers
      {SDLK_LSHIFT, 0x10}, // VK_SHIFT
      {SDLK_RSHIFT, 0x10},
      {SDLK_LCTRL, 0x11}, // VK_CONTROL
      {SDLK_RCTRL, 0x11},
      {SDLK_LALT, 0x12}, // VK_MENU
      {SDLK_RALT, 0x12},
      // Misc
      {SDLK_PAUSE, 0x13},         // VK_PAUSE
      {SDLK_CAPSLOCK, 0x14},      // VK_CAPITAL
      {SDLK_NUMLOCKCLEAR, 0x90},  // VK_NUMLOCK (renamed in SDL2)
      // Numpad (renamed in SDL2: SDLK_KP0 → SDLK_KP_0, etc.)
      {SDLK_KP_0, 0x60},
      {SDLK_KP_1, 0x61},
      {SDLK_KP_2, 0x62},
      {SDLK_KP_3, 0x63},
      {SDLK_KP_4, 0x64},
      {SDLK_KP_5, 0x65},
      {SDLK_KP_6, 0x66},
      {SDLK_KP_7, 0x67},
      {SDLK_KP_8, 0x68},
      {SDLK_KP_9, 0x69},
      {SDLK_KP_ENTER, 0x0D}, // VK_RETURN
  };
  static const int tableSize = sizeof(table) / sizeof(table[0]);

  for (int i = 0; i < tableSize; ++i)
    if (table[i].sdl == sym)
      return table[i].vk;

  // Printable ASCII & control chars (BS=8, TAB=9, CR=13, ESC=27, SPACE=32,
  // '0'-'9'=48-57, 'A'-'Z'=65-90) all equal their VK equivalents directly.
  // SDL returns lowercase for alpha keys; VK_A-Z are uppercase ASCII.
  if (sym >= 'a' && sym <= 'z')
    return sym - 32; // convert to uppercase VK
  if (sym >= 0x01 && sym <= 0x7E)
    return (int)sym; // ASCII == VK for printable / low-control range

  return (int)sym; // unknown - pass through
}

void HandleEvent(const SDL_Event &event) {
  // SDL mouse buttons are 1-indexed (SDL_BUTTON_LEFT=1, MIDDLE=2, RIGHT=3).
  // btrans[0] is unused padding so we can index directly by
  // event.button.button.
  static int btrans[4] = {0, InputEvent::mbLeft, InputEvent::mbMiddle,
                          InputEvent::mbRight};

  switch (event.type) {
  case SDL_MOUSEMOTION:
    theApp.GetInputManager().SysAddMouseMoveEvent(event.motion.x,
                                                  event.motion.y);
    break;
  case SDL_MOUSEBUTTONDOWN:
    theApp.GetInputManager().SysAddMouseDownEvent(
        event.button.x, event.button.y, btrans[event.button.button]);
    break;
  case SDL_MOUSEBUTTONUP:
    theApp.GetInputManager().SysAddMouseUpEvent(event.button.x, event.button.y,
                                                btrans[event.button.button]);
    break;
  case SDL_KEYDOWN: {
    // Translate SDL keysym to Windows Virtual Key code.
    // The engine's HandleInput() / CAOS KEYD compares against VK_* constants.
    int vk = SdlSymToVK(event.key.keysym.sym);
    theApp.GetInputManager().SysAddKeyDownEvent(vk);
    // Also fire backspace/return/tab as translated char events (control chars
    // that SDL_TEXTINPUT does not produce, but WM_CHAR on Windows does).
    SDL_Keycode sym = event.key.keysym.sym;
    if (sym == SDLK_BACKSPACE || // VK_BACK = 8
        sym == SDLK_RETURN ||    // VK_RETURN = 13
        sym == SDLK_KP_ENTER ||  // also CR
        sym == SDLK_TAB) {       // VK_TAB = 9
      theApp.GetInputManager().SysAddTranslatedCharEvent((int)sym);
    }
    break;
  }
  case SDL_KEYUP: {
    int vk = SdlSymToVK(event.key.keysym.sym);
    theApp.GetInputManager().SysAddKeyUpEvent(vk);
    break;
  }
  // SDL2 generates SDL_TEXTINPUT for printable characters (replaces the
  // SDL1 keysym-to-char hack). This is equivalent to WM_CHAR on Windows.
  case SDL_TEXTINPUT: {
    // event.text.text is a UTF-8 string; for ASCII range, take the first byte.
    const char *text = event.text.text;
    for (int i = 0; text[i] != '\0'; ++i) {
      unsigned char c = (unsigned char)text[i];
      if (c >= 0x20 && c <= 0x7E) {
        theApp.GetInputManager().SysAddTranslatedCharEvent((int)c);
      }
    }
    break;
  }
  case SDL_WINDOWEVENT:
    // SDL2 replacement for SDL_ACTIVEEVENT — could handle focus/minimize here
    break;
  case SDL_QUIT:
    ourQuit = true;
    break;
  }
}

// -------------------------------------------------------------------------
// InitInstance()
// *Probably* prepares the application paths and settings before the main game
// loop. Sets registries/config defaults, initializes catalogues (string
// tables), and loads essential paths.
// -------------------------------------------------------------------------
static bool InitInstance() {
  // UGH. This config-setup stuff should be handled by App::Init(),
  // but that fn isn't called until after the window is opened.
#ifdef _WIN32
  // get the correct registry entry before you do anything else
  theRegistry.ChooseDefaultKey(theApp.GetGameName());
  // store our game as the default one for tools to use
  theRegistry.CreateValue("Software\\CyberLife Technology\\Creatures Engine\\",
                          "Default Game", theApp.GetGameName());
#else
  if (!theApp.InitConfigFiles("user.cfg", "machine.cfg"))
    return false;
#endif

  // get the file paths from the registry
  if (!theApp.GetDirectories())
    return false;

  // set up the catalogue (localised stringtable) and any
  // other localisable stuff.
  if (!theApp.InitLocalisation())
    return false;

#ifndef _WIN32
  // Enable UDP broadcast of FlightRecorder logs to the browser monitor.
  // Sends JSON packets to 127.0.0.1:9999 — fire-and-forget, safe to call
  // even if the relay isn't running.
  theFlightRecorder.EnableUDPBroadcast(9999);
#endif

  return true;
}

#ifdef LEFT_IN_FOR_REFERENCE

switch (message) {
case WM_TICK:
  // Tell timer queue the next tick (ensures
  // if we take longer than we should to process,
  // we at least start the next tick straight away)
  ourTickPending = false;

  if (ourDuringProcessing)
    break;

  // Mark that we're processing the tick
  ourDuringProcessing = true;

  // Tell the app to update;
  theApp.UpdateApp();
  // App has finished with this set of events now.
  theApp.GetInputManager().SysFlushEventBuffer();

  ourDuringProcessing = false;

  break;

case WM_DRAWFRONTBUFFER:
  // Tell timer queue the next tick (ensures
  // if we take longer than we should to process,
  // we at least start the next tick straight away)
  ourTickPending = false;

  if (ourDuringProcessing)
    break;

  // Mark that we're processing the tick
  ourDuringProcessing = true;

  // Tell the app to update;
  DisplayEngine::theRenderer().DrawToFrontBuffer();

  ourDuringProcessing = false;

  break;
case WM_INCOMINGREQUEST:
  if (ourDuringProcessing) {
    // can't loose incoming requests, or waiting
    // process will never get a response
    ourMissedAnIncomingMessage = true;
    break;
  }

  // Mark that we're processing something
  ourDuringProcessing = true;

  // Respond to a request coming in from the external interface
  theApp.HandleIncomingRequest(ourServerSide);

  ourDuringProcessing = false;

  break;
case WM_KEYDOWN:
  if (wparam == VK_CANCEL) {
    if (ourDuringProcessing)
      break;
    ourDuringProcessing = true;

    DisplayEngine::theRenderer().PrepareForMessageBox();
    if (::MessageBox(theMainWindow, theCatalogue.Get("control_break", 0),
                     "MainWindowProc", MB_SYSTEMMODAL | MB_OKCANCEL) == IDOK)
      SignalTerminateApplication();
    DisplayEngine::theRenderer().EndMessageBox();

    ourDuringProcessing = false;
  } else if ((wparam == VK_PAUSE) &&
             (theApp.GetWorld().GetGameVar("engine_debug_keys").GetInteger() ==
              1)) {
    // VK_PAUSE is handled here (rather than the more
    // platform independent App::HandleInput()) so it works
    // even when the game is debug paused (to unpause it)
    SetMultimediaTimer(!GetMultimediaTimer());
  } else if ((wparam == VK_SPACE) && !GetMultimediaTimer() &&
             (theApp.GetWorld().GetGameVar("engine_debug_keys").GetInteger() ==
              1)) {
    // Similarly, VK_SPACE needs to work even when game paused
    SendTickMessage();
  } else {
    theApp.GetInputManager().SysAddKeyDownEvent(wparam);
  }
  break;
case WM_MOUSEWHEEL:
  // Modern style mouse wheel message
  x = GET_X_LPARAM(lparam);
  y = GET_Y_LPARAM(lparam);

  // ugly signbit hacking!
  theApp.GetInputManager().SysAddMouseWheelEvent(
      x, y,
      (HIWORD(wparam) & 0x8000) ? // -ve or +ve?
          (int)HIWORD(wparam) - 0x10000
                                : HIWORD(wparam));
  break;
case WM_CHAR:
  theApp.GetInputManager().SysAddTranslatedCharEvent(wparam);
  break;
case WM_SYSCOMMAND:
  if (wparam == SC_SCREENSAVE || wparam == SC_MONITORPOWER)
    break;
  return DefWindowProc(window, message, wparam, lparam);
case WM_SIZE: {
  if (ourDuringProcessing)
    break;
  int32 rval = DefWindowProc(window, message, wparam, lparam);
  theApp.WindowHasResized();
  return rval;
  break;
}
case WM_MOVE: {
  if (ourDuringProcessing)
    break;
  int32 rval = DefWindowProc(window, message, wparam, lparam);
  theApp.WindowHasMoved();
  theApp.WindowHasResized();
  return rval;
  break;
}
#endif // LEFT_IN_FOR_REFERENCE

  // -------------------------------------------------------------------------
  // DoStartup()
  // *Probably* handles late-stage startup initialization tasks after SDL is set
  // up. Calls theApp.Init() to boot up the main core subsystems.
  // -------------------------------------------------------------------------
  static bool DoStartup() {
    //	ourTerminateApplication = false;

    //	ErrorMessageHandler::SetWindow(window);

    // set up the game
    if (!theApp.Init())
      return false;

    // TODO: setup external interface here please :-)

    return true;
  }

  // -------------------------------------------------------------------------
  // DoShutdown()
  // Stops the main application loop and tells the App to shutdown subsystems.
  // -------------------------------------------------------------------------
  static void DoShutdown() {
    ourRunning = false;

    if (enableTools || enableMCP) theDebugServer.Stop();

    theApp.ShutDown();
  }

  void SignalTerminateApplication() {
    ourQuit = true;
    //	ourTerminateApplication = true;
  }
