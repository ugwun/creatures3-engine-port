// main for sdl version (derived from window.h/window.cpp)

#ifndef SDL_MAIN_H
#define SDL_MAIN_H


#ifdef _MSC_VER
#pragma warning(disable:4786 4503)
#endif

//#include <windows.h>
#include "../../../common/C2eTypes.h"


#include "../../Agents/AgentHandle.h"

//extern HWND theMainWindow;

// tell the game to shut down
void SignalTerminateApplication();

// Headless mode — run the simulation with no graphical display.
// When true, SDL_INIT_VIDEO is skipped, no window is created,
// and all rendering is a no-op.  The DebugServer API remains
// fully functional for remote control via MCP.
bool IsHeadlessMode();

// Engine pause/resume — controlled via Developer Tools / MCP.
void SetEnginePaused(bool paused);
bool IsEnginePaused();

// Game speed multiplier — controlled via CLI --gamespeed or MCP set_tick_rate.
void SetGameSpeedMultiplier(float m);
float GetGameSpeedMultiplier();

// Advance-ticks — run exactly N ticks then pause.
// Set by the MCP advance_ticks tool; consumed by the main loop.
void SetAdvanceTicks(uint32 n);
uint32 GetAdvanceTicksRemaining();

void SetSingleStepAgent( AgentHandle& agent );
AgentHandle GetSingleStepAgent();
void WaitForSingleStepCommand();

#endif // OURWINDOW_H
