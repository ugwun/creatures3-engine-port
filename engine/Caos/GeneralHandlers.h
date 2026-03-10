// Filename:    GeneralHandlers.h
// Class:       GeneralHandlers
// Purpose:     Routines to implement general commands/values in CAOS.
// Description:
//
// Usage:
//
// History:
// -------------------------------------------------------------------------

#ifndef GENERALHANDLERS_H
#define GENERALHANDLERS_H

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "../IWorldServices.h"
#include <string>
#include <vector>

class CAOSMachine;
class IApp;

class GeneralHandlers {
public:
  //
  static void Command_ADDV(CAOSMachine &vm);
  static void Command_SUBV(CAOSMachine &vm);
  static void Command_MULV(CAOSMachine &vm);
  static void Command_DIVV(CAOSMachine &vm);
  static void Command_MODV(CAOSMachine &vm);
  static void Command_NEGV(CAOSMachine &vm);
  static void Command_ABSV(CAOSMachine &vm);
  static void Command_ANDV(CAOSMachine &vm);
  static void Command_ORRV(CAOSMachine &vm);
  static void Command_SETV(CAOSMachine &vm);
  static void Command_PSWD(CAOSMachine &vm);

  // flow control stuff
  static void Command_DOIF(CAOSMachine &vm);
  static void Command_ELIF(CAOSMachine &vm);
  static void Command_ELSE(CAOSMachine &vm);
  static void Command_ENDI(CAOSMachine &vm);
  static void Command_ENUM(CAOSMachine &vm);
  static void Command_ESEE(CAOSMachine &vm);
  static void Command_ETCH(CAOSMachine &vm);
  static void Command_NEXT(CAOSMachine &vm);
  static void Command_REPS(CAOSMachine &vm);
  static void Command_REPE(CAOSMachine &vm);
  static void Command_LOOP(CAOSMachine &vm);
  static void Command_UNTL(CAOSMachine &vm);
  static void Command_EVER(CAOSMachine &vm);
  static void Command_SUBR(CAOSMachine &vm);
  static void Command_GOTO(CAOSMachine &vm);
  static void Command_GSUB(CAOSMachine &vm);
  static void Command_RETN(CAOSMachine &vm);
  static void Command_INST(CAOSMachine &vm);
  static void Command_SLOW(CAOSMachine &vm);
  static void Command_STOP(CAOSMachine &vm);
  static void Command_WAIT(CAOSMachine &vm);

  static void Command_GIDS(CAOSMachine &vm);
  static void Command_OUTS(CAOSMachine &vm);
  static void Command_OUTX(CAOSMachine &vm);
  static void Command_OUTV(CAOSMachine &vm);
  static void Command_SETS(CAOSMachine &vm);
  static void Command_ADDS(CAOSMachine &vm);
  static void Command_SCRX(CAOSMachine &vm);
  static void Command_SETA(CAOSMachine &vm);
  static void Command_CHAR(CAOSMachine &vm);
  static void Command_DELG(CAOSMachine &vm);
  static void Command_SAVE(CAOSMachine &vm);
  static void Command_LOAD(CAOSMachine &vm);
  static void Command_COPY(CAOSMachine &vm);
  static void Command_DELW(CAOSMachine &vm);
  static void Command_QUIT(CAOSMachine &vm);
  static void Command_BUZZ(CAOSMachine &vm); // DS: play buzzer tone (stub)
  static void Command_JECT(CAOSMachine &vm); // DS: inject .cos file (stub)
  static void Command_WEBB(CAOSMachine &vm); // DS: open web browser (stub)
  static void Command_TINO(CAOSMachine &vm); // DS: Tinderbox coords (stub)
  static void Command_CATO(CAOSMachine &vm); // DS: catalogue command (stub)
  static void
  Command_NET(CAOSMachine &vm); // DS: net: command dispatcher (stub)
  static int
  IntegerRV_NET(CAOSMachine &vm); // DS: net: integer RV dispatcher (stub)
  static void
  StringRV_NET(CAOSMachine &vm,
               std::string &str); // DS: net: string dispatcher (stub)
  static void Command_WRLD(CAOSMachine &vm);
  static void Command_WPAU(CAOSMachine &vm);
  static void Command_FILE(CAOSMachine &vm);
  static void Command_RGAM(CAOSMachine &vm);
  static void Command_REAF(CAOSMachine &vm);
  static void Command_STRK(CAOSMachine &vm);
  // Integer r-values
  static int IntegerRV_RAND(CAOSMachine &vm);
  static int IntegerRV_KEYD(CAOSMachine &vm);
  static int IntegerRV_MOPX(CAOSMachine &vm);
  static int IntegerRV_MOPY(CAOSMachine &vm);
  static int IntegerRV_LEFT(CAOSMachine &vm);
  static int IntegerRV_RGHT(CAOSMachine &vm);
  static int IntegerRV_UP(CAOSMachine &vm);
  static int IntegerRV_DOWN(CAOSMachine &vm);
  static int IntegerRV_STRL(CAOSMachine &vm);
  static int IntegerRV_CHAR(CAOSMachine &vm);
  static int IntegerRV_TIME(CAOSMachine &vm);
  static int IntegerRV_YEAR(CAOSMachine &vm);
  static int IntegerRV_SEAN(CAOSMachine &vm);
  static int IntegerRV_WTIK(CAOSMachine &vm);
  static int IntegerRV_ETIK(CAOSMachine &vm);
  static int IntegerRV_NWLD(CAOSMachine &vm);
  static int IntegerRV_VMNR(CAOSMachine &vm);
  static int IntegerRV_VMJR(CAOSMachine &vm);
  static int IntegerRV_WPAU(CAOSMachine &vm);
  static int IntegerRV_STOI(CAOSMachine &vm);
  static int IntegerRV_RTIM(CAOSMachine &vm);
  static int IntegerRV_REAN(CAOSMachine &vm);
  static int IntegerRV_REAQ(CAOSMachine &vm);
  static int IntegerRV_DATE(CAOSMachine &vm);
  static int IntegerRV_INNI(CAOSMachine &vm);
  static int IntegerRV_INOK(CAOSMachine &vm);
  static int IntegerRV_DAYT(CAOSMachine &vm);
  static int IntegerRV_MONT(CAOSMachine &vm);
  static int IntegerRV_FTOI(CAOSMachine &vm);
  static int IntegerRV_MUTE(CAOSMachine &vm);
  static int IntegerRV_WOLF(CAOSMachine &vm);
  static int IntegerRV_RACE(CAOSMachine &vm);
  static int IntegerRV_SCOL(CAOSMachine &vm);
  static int IntegerRV_SORQ(CAOSMachine &vm);
  static int IntegerRV_MSEC(CAOSMachine &vm);
  static int IntegerRV_WNTI(CAOSMachine &vm);
  static int
  IntegerRV_SINS(CAOSMachine &vm); // DS: inter-agent relationship (stub->-1)
  static int
  IntegerRV_HOTP(CAOSMachine &vm); // DS: unique ID of hotspot agent (stub->0)
  static int
  IntegerRV_TINT(CAOSMachine &vm); // DS: creature tint channel (stub->128)
  static int
  IntegerRV_ABBA(CAOSMachine &vm); // DS: facial expression set (stub->0)
  // DS: NAME integer-indexed float variable (creature biochemistry slot).
  // 'setv name 96 1.0' / 'doif name va00 >= .5' - indexed by chemical number.

  // Float r-values
  static float FloatRV_MOVX(CAOSMachine &vm);
  static float FloatRV_MOVY(CAOSMachine &vm);
  static float FloatRV_SIN(CAOSMachine &vm); // SIN_
  static float FloatRV_COS(CAOSMachine &vm); // COS_
  static float FloatRV_TAN(CAOSMachine &vm); // TAN_
  static float FloatRV_ASIN(CAOSMachine &vm);
  static float FloatRV_ACOS(CAOSMachine &vm);
  static float FloatRV_ATAN(CAOSMachine &vm);
  static float FloatRV_PACE(CAOSMachine &vm);
  static float FloatRV_STOF(CAOSMachine &vm);
  static float FloatRV_INNF(CAOSMachine &vm);
  static float FloatRV_ITOF(CAOSMachine &vm);
  static float FloatRV_SQRT(CAOSMachine &vm);

  // String r-values
  static void StringRV_VTOS(CAOSMachine &vm, std::string &str);
  static void StringRV_SORC(CAOSMachine &vm, std::string &str);
  static void StringRV_READ(CAOSMachine &vm, std::string &str);
  static void StringRV_SUBS(CAOSMachine &vm, std::string &str);
  static void StringRV_BUTY(CAOSMachine &vm, std::string &str);
  static void StringRV_WILD(CAOSMachine &vm, std::string &str);
  static void StringRV_WRLD(CAOSMachine &vm, std::string &str);
  static void StringRV_CAOS(CAOSMachine &vm, std::string &str);
  static void StringRV_WNAM(CAOSMachine &vm, std::string &str);
  static void StringRV_GNAM(CAOSMachine &vm, std::string &str);
  static void StringRV_PSWD(CAOSMachine &vm, std::string &str);
  static void StringRV_WUID(CAOSMachine &vm, std::string &str);
  static void StringRV_RTIF(CAOSMachine &vm, std::string &str);
  static void StringRV_INNL(CAOSMachine &vm, std::string &str);
  static void StringRV_GAMN(CAOSMachine &vm, std::string &str);
  static void StringRV_FVWM(CAOSMachine &vm, std::string &str);
  static void
  StringRV_MAME(CAOSMachine &vm,
                std::string &str); // DS: network meta-msg (stub->"")
  static void StringRV_LOWA(CAOSMachine &vm,
                            std::string &str); // DS: lowercase string

  // Variables
  static CAOSVar &Variable_GAME(CAOSMachine &vm);
  static CAOSVar &Variable_EAME(CAOSMachine &vm);

  // -----------------------------------------------------------------------
  // Testable logic layer — accept IWorldServices& instead of
  // theApp.GetWorld() so tests can inject a FakeWorld/NullWorldServices.
  // -----------------------------------------------------------------------

  // Time of day / season (TIME / YEAR / SEAN / DATE / WTIK)
  static int GetTimeOfDay(IWorldServices &world);
  static int GetSeason(IWorldServices &world);
  static int GetDayInSeason(IWorldServices &world);
  static uint32 GetWorldTick(IWorldServices &world);
  static uint32 GetYearsElapsed(IWorldServices &world);

  // World enumeration (NWLD / WNTI)
  static int GetWorldCount(IWorldServices &world);
  static int WorldNameToIndex(IWorldServices &world, const std::string &name);

  // World identity (WNAM / WUID)
  static std::string GetWorldName(IWorldServices &world);
  static std::string GetWorldUID(IWorldServices &world);

  // Pause state (WPAU command / IntegerRV_WPAU)
  static bool GetWorldPaused(IWorldServices &world);

  // -----------------------------------------------------------------------
  // Testable logic layer — accept IApp& instead of theApp so tests can
  // inject a FakeApp without SDL / filesystem / full engine dependencies.
  // -----------------------------------------------------------------------

  // Action requests (SAVE / QUIT / LOAD)
  static void RequestSave(IApp &app);
  static void RequestQuit(IApp &app);
  static void RequestLoad(IApp &app, const std::string &worldName);

  // Time / tick (ETIK / RACE / PACE)
  static uint32 GetSystemTick(IApp &app);
  static int GetLastTickGap(IApp &app);
  static float GetTickRateFactor(IApp &app);

  // Game identity (GNAM)
  static std::string GetGameName(IApp &app);

  // EAME variables (Variable_EAME)
  static CAOSVar &GetEameVar(IApp &app, const std::string &name);

  // Input — mouse (MOPX / MOPY / MOVX / MOVY)
  static int GetMouseX(IApp &app);
  static int GetMouseY(IApp &app);
  static float GetMouseVX(IApp &app);
  static float GetMouseVY(IApp &app);

  // Input — keyboard (KEYD)
  static int IsKeyDown(IApp &app, int keycode);

  // Wolf EOR (WOLF)
  static int EorWolfValues(IApp &app, int andMask, int eorMask);

  // Scrolling state (SCOL)
  static int GetScrollingMask(IApp &app);
  static void SetScrolling(IApp &app, int andMask, int eorMask,
                           const std::vector<byte> *speedUp,
                           const std::vector<byte> *speedDown);

private:
  // Subcommands
  static void SubCommand_GIDS_ROOT(CAOSMachine &vm);
  static void SubCommand_GIDS_FMLY(CAOSMachine &vm);
  static void SubCommand_GIDS_GNUS(CAOSMachine &vm);
  static void SubCommand_GIDS_SPCS(CAOSMachine &vm);

  static void SubCommand_FILE_OOPE(CAOSMachine &vm);
  static void SubCommand_FILE_OCLO(CAOSMachine &vm);
  static void SubCommand_FILE_OFLU(CAOSMachine &vm);
  static void SubCommand_FILE_IOPE(CAOSMachine &vm);
  static void SubCommand_FILE_ICLO(CAOSMachine &vm);
  static void SubCommand_FILE_JDEL(CAOSMachine &vm);

  // Helpers
  static void MakeFilenameSafe(std::string &filename);
};

#endif // GENERALHANDLERS_H
