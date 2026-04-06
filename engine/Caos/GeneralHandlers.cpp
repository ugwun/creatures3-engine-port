// -------------------------------------------------------------------------
// Filename:    GeneralHandlers.cpp
// Class:       GeneralHandlers
// Purpose:     Routines to implement general commands/values in CAOS.
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
#include <vector>

#include <execinfo.h> // backtrace(), backtrace_symbols()
#include <cxxabi.h>   // abi::__cxa_demangle()

#include <fstream>
#include <string>

#ifdef C2E_OLD_CPP_LIB
#include <strstream>
#else
#include <sstream>
#endif

#include <math.h> // for trig functions

#include "../AgentManager.h"
#include "../Agents/Agent.h"
#include "../App.h"
#include "../Display/ErrorMessageHandler.h"
#include "../Display/MainCamera.h"
#include "../Display/Window.h"
#include "../IApp.h"
#include "../World.h"
#include "CAOSMachine.h"
#include "DebugInfo.h"
#include "GeneralHandlers.h"

#include "../Creature/Genome.h"
#include "../Creature/SensoryFaculty.h"
#include "../build.h"
#include "MacroScript.h"
#include "Orderiser.h"

#include "../C2eServices.h"
#include "../General.h"
#include <time.h>
#ifndef _WIN32
#include "../unix/FileFuncs.h"
#endif

void GeneralHandlers::Command_ADDV(CAOSMachine &vm) {
  int i, vi;
  float f, vf;
  bool intnotfloat;
  int varType;

  CAOSVar &var = vm.FetchVariable();
  varType = var.GetType();
  vm.FetchNumericRV(i, f, intnotfloat);
  if ((varType == CAOSVar::typeInteger) && intnotfloat) {
    vi = var.GetInteger();
    var.SetInteger(vi + i);
  } else if (varType == CAOSVar::typeInteger) {
    vf = (float)var.GetInteger();
    var.SetFloat(vf + f);
  } else if (intnotfloat) {
    vf = var.GetFloat();
    var.SetFloat(vf + (float)i);
  } else {
    vf = var.GetFloat();
    var.SetFloat(vf + f);
  }
}

int GeneralHandlers::IntegerRV_MUTE(CAOSMachine &vm) {
  int andMask = vm.FetchIntegerRV();
  int eorMask = vm.FetchIntegerRV();
  return theApp.GetWorld().MuteSoundManagers(andMask, eorMask);
}

int GeneralHandlers::IntegerRV_WOLF(CAOSMachine &vm) {
  int andMask = vm.FetchIntegerRV();
  int eorMask = vm.FetchIntegerRV();
  return EorWolfValues(theApp, andMask, eorMask);
}

void GeneralHandlers::Command_STRK(CAOSMachine &vm) {
  std::string track;
  int latency = vm.FetchIntegerRV();
  vm.FetchStringRV(track);
  theApp.GetWorld().TriggerTrack(track, latency);
}

void GeneralHandlers::Command_SUBV(CAOSMachine &vm) {
  int i, vi;
  float f, vf;
  bool intnotfloat;
  int varType;

  CAOSVar &var = vm.FetchVariable();
  varType = var.GetType();
  vm.FetchNumericRV(i, f, intnotfloat);
  if ((varType == CAOSVar::typeInteger) && intnotfloat) {
    vi = var.GetInteger();
    var.SetInteger(vi - i);
  } else if (varType == CAOSVar::typeInteger) {
    vf = (float)var.GetInteger();
    var.SetFloat(vf - f);
  } else if (intnotfloat) {
    vf = var.GetFloat();
    var.SetFloat(vf - (float)i);
  } else {
    vf = var.GetFloat();
    var.SetFloat(vf - f);
  }
}

void GeneralHandlers::Command_MULV(CAOSMachine &vm) {
  int i, vi;
  float f, vf;
  bool intnotfloat;
  int varType;

  CAOSVar &var = vm.FetchVariable();
  varType = var.GetType();
  vm.FetchNumericRV(i, f, intnotfloat);
  if ((varType == CAOSVar::typeInteger) && intnotfloat) {
    vi = var.GetInteger();
    var.SetInteger(vi * i);
  } else if (varType == CAOSVar::typeInteger) {
    vf = (float)var.GetInteger();
    var.SetFloat(vf * f);
  } else if (intnotfloat) {
    vf = var.GetFloat();
    var.SetFloat(vf * (float)i);
  } else {
    vf = var.GetFloat();
    var.SetFloat(vf * f);
  }
}

void GeneralHandlers::Command_DIVV(CAOSMachine &vm) {
  int i, vi;
  float f, vf;
  bool intnotfloat;
  int varType;

  CAOSVar &var = vm.FetchVariable();
  varType = var.GetType();
  vm.FetchNumericRV(i, f, intnotfloat);
  if ((varType == CAOSVar::typeInteger) && intnotfloat) {
    if (i == 0)
      vm.ThrowRunError(CAOSMachine::sidDivideByZero);
    vi = var.GetInteger();
    var.SetInteger(vi / i);
  } else if (varType == CAOSVar::typeInteger) {
    if (f == 0.0f)
      vm.ThrowRunError(CAOSMachine::sidDivideByZero);
    vf = (float)var.GetInteger();
    var.SetFloat(vf / f);
  } else if (intnotfloat) {
    if (i == 0)
      vm.ThrowRunError(CAOSMachine::sidDivideByZero);
    vf = var.GetFloat();
    var.SetFloat(vf / (float)i);
  } else {
    if (f == 0.0f)
      vm.ThrowRunError(CAOSMachine::sidDivideByZero);
    vf = var.GetFloat();
    var.SetFloat(vf / f);
  }
}

void GeneralHandlers::Command_MODV(CAOSMachine &vm) {
  CAOSVar &var = vm.FetchVariable();
  if (var.GetType() == CAOSVar::typeInteger) {
    int i = var.GetInteger();
    int id = vm.FetchIntegerRV();
    if (id == 0)
      vm.ThrowRunError(CAOSMachine::sidDivideByZero);
    i %= id;
    var.SetInteger(i);
  } else
    vm.ThrowRunError(CAOSMachine::sidNotAnInt);
}

void GeneralHandlers::Command_NEGV(CAOSMachine &vm) {
  CAOSVar &var = vm.FetchVariable();
  if (var.GetType() == CAOSVar::typeInteger) {
    int i = var.GetInteger();
    i = -i;
    var.SetInteger(i);
  } else if (var.GetType() == CAOSVar::typeFloat) {
    float f = var.GetFloat();
    f = -f;
    var.SetFloat(f);
  } else
    vm.ThrowRunError(CAOSMachine::sidNotADecimal);
}

void GeneralHandlers::Command_ABSV(CAOSMachine &vm) {
  CAOSVar &var = vm.FetchVariable();
  if (var.GetType() == CAOSVar::typeInteger) {
    int i = var.GetInteger();
    i = abs(i);
    var.SetInteger(i);
  } else if (var.GetType() == CAOSVar::typeFloat) {
    float f = var.GetFloat();
    f = fabsf(f);
    var.SetFloat(f);
  } else
    vm.ThrowRunError(CAOSMachine::sidNotADecimal);
}

void GeneralHandlers::Command_ANDV(CAOSMachine &vm) {
  // new version
  CAOSVar &var = vm.FetchVariable();
  if (var.GetType() != CAOSVar::typeInteger)
    vm.ThrowRunError(CAOSMachine::sidNotAnInt);

  int i = var.GetInteger();
  i &= vm.FetchIntegerRV();
  var.SetInteger(i);
}

void GeneralHandlers::Command_ORRV(CAOSMachine &vm) {
  // new version
  CAOSVar &var = vm.FetchVariable();
  if (var.GetType() != CAOSVar::typeInteger)
    vm.ThrowRunError(CAOSMachine::sidNotAnInt);

  int i = var.GetInteger();
  i |= vm.FetchIntegerRV();
  var.SetInteger(i);
}

void GeneralHandlers::Command_SETV(CAOSMachine &vm) {
  int i;
  float f;
  bool intnotfloat;

  CAOSVar &var = vm.FetchVariable();
  vm.FetchNumericRV(i, f, intnotfloat);
  if (intnotfloat)
    var.SetInteger(i);
  else
    var.SetFloat(f);
}

void GeneralHandlers::Command_DOIF(CAOSMachine &vm) {
  int endip;
  endip = vm.FetchInteger();
  if (!vm.Evaluate())
    vm.SetIP(endip); // skip to next ELIF or ELSE
}

void GeneralHandlers::Command_ELIF(CAOSMachine &vm) {
  // same as DOIF, from this point of view
  Command_DOIF(vm);
}

void GeneralHandlers::Command_ELSE(CAOSMachine &vm) {
  // soak up the jump pos for the ENDI
  vm.FetchInteger();
}

void GeneralHandlers::Command_ENDI(CAOSMachine &vm) {
  // nop
}

void GeneralHandlers::Command_ENUM(CAOSMachine &vm) {
  int f, g, s;
  int ipnext;
  std::list<AgentHandle> agents;
  std::list<AgentHandle>::iterator it;

  ipnext = vm.FetchInteger(); // get address of op _after_ the NEXT
  f = vm.FetchIntegerRV();
  g = vm.FetchIntegerRV();
  s = vm.FetchIntegerRV();

  theAgentManager.FindByFGS(agents, Classifier(f, g, s));

  // push IDs of all the matching agents onto the stack, then a count
  for (it = agents.begin(); it != agents.end(); ++it)
    vm.PushHandle((*it));
  vm.Push(agents.size());
  // store address of first command in body of block
  vm.Push(vm.GetIP());

  // jump to the NEXT instruction
  vm.SetIP(ipnext);
}

void GeneralHandlers::Command_ESEE(CAOSMachine &vm) {
  AgentHandle agent = vm.GetOwner();
  if (agent.IsInvalid()) {
    vm.ValidateTarg();
    agent = vm.GetTarg();
  }

  int ipnext = vm.FetchInteger(); // get address of op _after_ the NEXT
  int f = vm.FetchIntegerRV();
  int g = vm.FetchIntegerRV();
  int s = vm.FetchIntegerRV();

  std::list<AgentHandle> agents;
  theAgentManager.FindBySightAndFGS(agent, agents, Classifier(f, g, s));

  // push IDs of all the matching agents onto the stack, then a count
  for (std::list<AgentHandle>::iterator it = agents.begin(); it != agents.end();
       ++it)
    vm.PushHandle((*it));
  vm.Push(agents.size());
  // store address of first command in body of block
  vm.Push(vm.GetIP());

  // jump to the NEXT instruction
  vm.SetIP(ipnext);
}

void GeneralHandlers::Command_ETCH(CAOSMachine &vm) {
  AgentHandle agent = vm.GetOwner();
  if (agent.IsInvalid()) {
    vm.ValidateTarg();
    agent = vm.GetTarg();
  }

  int ipnext = vm.FetchInteger(); // get address of op _after_ the NEXT
  int f = vm.FetchIntegerRV();
  int g = vm.FetchIntegerRV();
  int s = vm.FetchIntegerRV();

  Box r;
  agent.GetAgentReference().GetAgentExtent(r);
  std::list<AgentHandle> agents;
  theAgentManager.FindByAreaAndFGS(agents, Classifier(f, g, s), r);

  // push IDs of all the matching agents onto the stack, then a count
  for (std::list<AgentHandle>::iterator it = agents.begin(); it != agents.end();
       ++it)
    vm.PushHandle((*it));
  vm.Push(agents.size());
  // store address of first command in body of block
  vm.Push(vm.GetIP());

  // jump to the NEXT instruction
  vm.SetIP(ipnext);
}

void GeneralHandlers::Command_NEXT(CAOSMachine &vm) {
  int iploop = vm.Pop(); // start pos of loop
  int count = vm.Pop();

  if (count > 0) {
    // pull the next agent off the stack
    --count;
    AgentHandle temp = vm.PopHandle();
    vm.SetTarg(temp);

    // loop again
    vm.Push(count);
    vm.Push(iploop);
    vm.SetIP(iploop);
  } else {
    // finished
    AgentHandle temp = vm.GetOwner();
    vm.SetTarg(temp); // reset TARG
  }
}

void GeneralHandlers::Command_REPS(CAOSMachine &vm) {
  int repeats;

  repeats = vm.FetchIntegerRV();

  if (repeats < 1) {
    vm.ThrowRunError(CAOSMachine::sidInvalidRepeatCount);
  }

  vm.Push(vm.GetIP());
  vm.Push(repeats);
}

void GeneralHandlers::Command_REPE(CAOSMachine &vm) {
  int repeats;
  int looppos;

  repeats = vm.Pop();
  looppos = vm.Pop();

  repeats--;
  _ASSERT(repeats >= 0);

  if (repeats != 0) {
    // loop again...
    vm.Push(looppos);
    vm.Push(repeats);
    vm.SetIP(looppos);
  }
}

void GeneralHandlers::Command_LOOP(CAOSMachine &vm) { vm.Push(vm.GetIP()); }

void GeneralHandlers::Command_UNTL(CAOSMachine &vm) {
  int looppos;

  looppos = vm.Pop();
  if (!vm.Evaluate()) {
    // loop again
    vm.Push(looppos);
    vm.SetIP(looppos);
  }
}

void GeneralHandlers::Command_EVER(CAOSMachine &vm) {
  int looppos;
  // loop again
  looppos = vm.Pop();
  vm.Push(looppos);
  vm.SetIP(looppos);
}

void GeneralHandlers::Command_SUBR(CAOSMachine &vm) {
  vm.StopScriptExecuting();
}

void GeneralHandlers::Command_GOTO(CAOSMachine &vm) {
  int newip;
  newip = vm.FetchInteger();
  vm.SetIP(newip);
}

void GeneralHandlers::Command_GSUB(CAOSMachine &vm) {
  int newip;
  newip = vm.FetchInteger();
  vm.Push(vm.GetIP());
  vm.SetIP(newip);
}

void GeneralHandlers::Command_RETN(CAOSMachine &vm) { vm.SetIP(vm.Pop()); }

void GeneralHandlers::Command_INST(CAOSMachine &vm) { vm.SetInstFlag(true); }

void GeneralHandlers::Command_SLOW(CAOSMachine &vm) { vm.SetInstFlag(false); }

void GeneralHandlers::Command_STOP(CAOSMachine &vm) {
  vm.StopScriptExecuting();
}

void GeneralHandlers::Command_WAIT(CAOSMachine &vm) {
  int i;
  if (!vm.IsBlocking()) {
    // start WAIT
    i = vm.FetchIntegerRV();
    if (i < 1)
      i = 1;
    vm.Push(i);
    vm.Block();
  } else {
    // already started WAITing
    i = vm.Pop();
    i--;

    _ASSERT(i >= 0);
    if (i == 0)
      vm.UnBlock(); // finished
    else
      vm.Push(i); // keep WAITing
  }
}

void GeneralHandlers::Command_SCRX(CAOSMachine &vm) {
  int f, g, s, e;
  f = vm.FetchIntegerRV();
  g = vm.FetchIntegerRV();
  s = vm.FetchIntegerRV();
  e = vm.FetchIntegerRV();
  Classifier c(f, g, s, e);

  if (!theApp.GetWorld().GetScriptorium().ZapScript(c)) {
    // ZapScript now reports error if the script is not present, so use
    // findscriptexact to check.
    if (theApp.GetWorld().GetScriptorium().FindScriptExact(c) != NULL)
      vm.ThrowRunError(CAOSMachine::sidSCRXFailed, f, g, s, e);
  }
}

void GeneralHandlers::Command_RGAM(CAOSMachine &vm) {

  theApp.RefreshGameVariables();
}

int GeneralHandlers::IntegerRV_RAND(CAOSMachine &vm) {
  int n0, n1;

  n0 = vm.FetchIntegerRV();
  n1 = vm.FetchIntegerRV();
  if (n1 > n0)
    return Rnd(n0, n1);
  else
    return Rnd(n1, n0);
}

int GeneralHandlers::IntegerRV_KEYD(CAOSMachine &vm) {
  int keycode = vm.FetchIntegerRV();
  return IsKeyDown(theApp, keycode);
}

int GeneralHandlers::IntegerRV_MOPX(CAOSMachine &vm) {
  int x = GetMouseX(theApp);
  int y = GetMouseY(theApp);
  theMainView.ScreenToWorld(x, y);
  return x;
}

int GeneralHandlers::IntegerRV_MOPY(CAOSMachine &vm) {
  int x = GetMouseX(theApp);
  int y = GetMouseY(theApp);
  theMainView.ScreenToWorld(x, y);
  return y;
}

float GeneralHandlers::FloatRV_MOVX(CAOSMachine &vm) {
  return GetMouseVX(theApp);
}

float GeneralHandlers::FloatRV_MOVY(CAOSMachine &vm) {
  return GetMouseVY(theApp);
}

void GeneralHandlers::StringRV_VTOS(CAOSMachine &vm, std::string &str) {
  int i;
  float f;
  bool intnotfloat;
  char buf[64];

  vm.FetchNumericRV(i, f, intnotfloat);
  if (intnotfloat)
    sprintf(buf, "%d", i);
  else
    sprintf(buf, "%f", f);
  str = buf;
}

// this is a joke, by the way
void GeneralHandlers::StringRV_BUTY(CAOSMachine &vm, std::string &str) {
  str = "Look, it just IS, okay!";
}

void GeneralHandlers::StringRV_SORC(CAOSMachine &vm, std::string &str) {
  int f = vm.FetchIntegerRV();
  int g = vm.FetchIntegerRV();
  int s = vm.FetchIntegerRV();
  int e = vm.FetchIntegerRV();
  MacroScript *m;

  Classifier c(f, g, s, e);
  m = theApp.GetWorld().GetScriptorium().FindScriptExact(c);
  if (m) {
    DebugInfo *dbug = m->GetDebugInfo();
    if (dbug)
      dbug->GetSourceCode(str);
    else
      str = "";
  } else {
    // "script (%d %d %d %d) not in scriptorium"
    vm.ThrowRunError(CAOSMachine::sidScriptNotFound, f, g, s, e);
  }
}

int GeneralHandlers::IntegerRV_SORQ(CAOSMachine &vm) {
  int f = vm.FetchIntegerRV();
  int g = vm.FetchIntegerRV();
  int s = vm.FetchIntegerRV();
  int e = vm.FetchIntegerRV();
  Classifier c(f, g, s, e);
  MacroScript *m = theApp.GetWorld().GetScriptorium().FindScript(c);

  return m ? 1 : 0;
}

void GeneralHandlers::StringRV_READ(CAOSMachine &vm, std::string &str) {
  std::string basetag;
  vm.FetchStringRV(basetag);
  int offsetid = vm.FetchIntegerRV();

  str = theCatalogue.Get(basetag, offsetid);
}

int GeneralHandlers::IntegerRV_REAN(CAOSMachine &vm) {
  std::string basetag;
  vm.FetchStringRV(basetag);

  return theCatalogue.GetArrayCountForTag(basetag);
}

int GeneralHandlers::IntegerRV_REAQ(CAOSMachine &vm) {
  std::string basetag;
  vm.FetchStringRV(basetag);

  return theCatalogue.TagPresent(basetag) ? 1 : 0;
}

void GeneralHandlers::StringRV_WILD(CAOSMachine &vm, std::string &str) {
  int f = vm.FetchIntegerRV();
  int g = vm.FetchIntegerRV();
  int s = vm.FetchIntegerRV();

  std::string tag_stub;
  vm.FetchStringRV(tag_stub);
  int offsetid = vm.FetchIntegerRV();

  std::string final_tag = WildSearch(f, g, s, tag_stub);
  if (final_tag.empty())
    final_tag = tag_stub + " 0 0 0";

  str = theCatalogue.Get(final_tag, offsetid);
}

void GeneralHandlers::Command_OUTX(CAOSMachine &vm) {
  std::string str;
  vm.FetchStringRV(str);
  std::ostream *out = vm.GetUnvalidatedOutStream();
  if (out == NULL)
    return;

  // First of all, copy each char to the output stream, escaping where need
  // be...

  std::string outstr = "\"";
  for (int i = 0; i < str.size(); ++i) {
    char a = str[i];
    switch (a) {
    case '\\':
      outstr += "\\\\";
      break;
    case '\n':
      outstr += "\\n";
      break;
    case '\"':
      outstr += "\\\"";
      break;
    case '\'':
      outstr += "\\\'";
      break;
    case '\r':
      outstr += "\\r";
      break;
    case '\0':
      outstr += "\\0";
      break;
    case '\t':
      outstr += "\\t";
      break;
    default:
      outstr += a;
    }
  }
  outstr += "\"";
  (*out) << outstr;
}

void GeneralHandlers::Command_OUTS(CAOSMachine &vm) {
  std::string str;

  vm.FetchStringRV(str);

  std::ostream *out = vm.GetUnvalidatedOutStream();
  if (out == NULL)
    return;

  (*out) << str;
}

void GeneralHandlers::Command_OUTV(CAOSMachine &vm) {
  int i;
  float f;
  bool intnotfloat;

  char buf[32];

  vm.FetchNumericRV(i, f, intnotfloat);
  if (intnotfloat)
    sprintf(buf, "%d", i);
  else
    sprintf(buf, "%f", f);

  std::ostream *out = vm.GetUnvalidatedOutStream();
  if (out == NULL)
    return;

  (*out) << buf;
}

int GeneralHandlers::IntegerRV_INNI(CAOSMachine &vm) {
  std::istream *in = vm.GetInStream();

  int value = 0;
  (*in) >> value;
  return value;
}

int GeneralHandlers::IntegerRV_INOK(CAOSMachine &vm) {
  std::istream *in = vm.GetInStream();

  return in->good() ? 1 : 0;
}

float GeneralHandlers::FloatRV_INNF(CAOSMachine &vm) {
  std::istream *in = vm.GetInStream();

  float value = 0.0f;
  (*in) >> value;
  return value;
}

void GeneralHandlers::StringRV_INNL(CAOSMachine &vm, std::string &str) {
  std::istream *in = vm.GetInStream();
  std::getline(*in, str);
}

void GeneralHandlers::Command_GIDS(CAOSMachine &vm) {
  const int GIDS_SUBCOUNT = 4;
  static CommandHandler HandlerTable[GIDS_SUBCOUNT] = {
      SubCommand_GIDS_ROOT,
      SubCommand_GIDS_FMLY,
      SubCommand_GIDS_GNUS,
      SubCommand_GIDS_SPCS,
  };

  int subcmd;
  subcmd = vm.FetchOp();
  ASSERT(subcmd >= 0 && subcmd < GIDS_SUBCOUNT);
  (HandlerTable[subcmd])(vm);
}

void GeneralHandlers::SubCommand_GIDS_ROOT(CAOSMachine &vm) {
  IntegerSet ids;
  IntegerSet::const_iterator it;
  char buf[32];

  std::ostream *o = vm.GetOutStream();

  theApp.GetWorld().GetScriptorium().DumpFamilyIDs(ids);

  for (it = ids.begin(); it != ids.end(); ++it) {
    sprintf(buf, "%d ", *it);
    (*o) << buf;
  }
}

void GeneralHandlers::SubCommand_GIDS_FMLY(CAOSMachine &vm) {
  IntegerSet::const_iterator it;
  char buf[32];
  IntegerSet ids;
  std::ostream *o = vm.GetOutStream();
  int family = vm.FetchIntegerRV();

  theApp.GetWorld().GetScriptorium().DumpGenusIDs(ids, family);

  for (it = ids.begin(); it != ids.end(); ++it) {
    sprintf(buf, "%d ", *it);
    (*o) << buf;
  }
}

void GeneralHandlers::SubCommand_GIDS_GNUS(CAOSMachine &vm) {
  IntegerSet::const_iterator it;
  char buf[32];
  IntegerSet ids;
  std::ostream *o = vm.GetOutStream();

  int family = vm.FetchIntegerRV();
  int genus = vm.FetchIntegerRV();

  theApp.GetWorld().GetScriptorium().DumpSpeciesIDs(ids, family, genus);

  for (it = ids.begin(); it != ids.end(); ++it) {
    sprintf(buf, "%d ", *it);
    (*o) << buf;
  }
}

void GeneralHandlers::SubCommand_GIDS_SPCS(CAOSMachine &vm) {
  IntegerSet::const_iterator it;
  char buf[32];
  IntegerSet ids;
  int family = vm.FetchIntegerRV();
  int genus = vm.FetchIntegerRV();
  int species = vm.FetchIntegerRV();

  std::ostream *o = vm.GetOutStream();

  theApp.GetWorld().GetScriptorium().DumpEventIDs(ids, family, genus, species);

  for (it = ids.begin(); it != ids.end(); ++it) {
    sprintf(buf, "%d ", *it);
    (*o) << buf;
  }
}

void GeneralHandlers::Command_SETS(CAOSMachine &vm) {
  std::string str;
  // new version
  CAOSVar &var = vm.FetchVariable();
  vm.FetchStringRV(str);
  var.SetString(str);
}

void GeneralHandlers::Command_ADDS(CAOSMachine &vm) {
  std::string str1;
  std::string str2;

  CAOSVar &var = vm.FetchVariable();
  if (var.GetType() != CAOSVar::typeString)
    vm.ThrowRunError(CAOSMachine::sidNotAString);
  var.GetString(str1);
  vm.FetchStringRV(str2);
  str1 += str2;
  var.SetString(str1);
}

void GeneralHandlers::Command_SETA(CAOSMachine &vm) {
  AgentHandle a;
  // new version
  CAOSVar &var = vm.FetchVariable();
  a = vm.FetchAgentRV();
  var.SetAgent(a);
}

int GeneralHandlers::IntegerRV_LEFT(CAOSMachine &vm) { return DIRECTION_LEFT; }

int GeneralHandlers::IntegerRV_RGHT(CAOSMachine &vm) { return DIRECTION_RIGHT; }

int GeneralHandlers::IntegerRV_UP(CAOSMachine &vm) { return DIRECTION_UP; }

int GeneralHandlers::IntegerRV_DOWN(CAOSMachine &vm) { return DIRECTION_DOWN; }

int GeneralHandlers::IntegerRV_STRL(CAOSMachine &vm) {
  std::string s;

  vm.FetchStringRV(s);
  return s.length();
}

int GeneralHandlers::IntegerRV_CHAR(CAOSMachine &vm) {
  std::string s;
  int index, len;

  vm.FetchStringRV(s);
  index = vm.FetchIntegerRV();
  len = s.length();
  if ((index < 1) || (index > len)) {
    vm.ThrowRunError(CAOSMachine::sidIndexOutsideString);
  }
  return (int)(s[index - 1]);
}

void GeneralHandlers::Command_CHAR(CAOSMachine &vm) {
  int varType;
  int len;
  CAOSVar &var = vm.FetchVariable();
  int index = vm.FetchIntegerRV();
  int ch = vm.FetchIntegerRV();
  std::string s;

  varType = var.GetType();
  if (varType != CAOSVar::typeString) {
    vm.ThrowRunError(CAOSMachine::sidNotAString);
  }
  var.GetString(s);
  len = s.length();
  if ((index < 1) || (index > len)) {
    vm.ThrowRunError(CAOSMachine::sidIndexOutsideString);
  }
  if ((ch < 0) || (ch > 255)) {
    vm.ThrowRunError(CAOSMachine::sidNotACharacter);
  }
  s[index - 1] = (char)ch;
  var.SetString(s);
}

void GeneralHandlers::StringRV_SUBS(CAOSMachine &vm, std::string &str) {
  std::string s;

  vm.FetchStringRV(s);
  int len = s.length();
  int start = vm.FetchIntegerRV();
  int count = vm.FetchIntegerRV();
  if ((start < 1) || (start + count - 1 > len)) {
    vm.ThrowRunError(CAOSMachine::sidSliceOutsideString);
  }
  str = s.substr(start - 1, count);
}

int GeneralHandlers::IntegerRV_TIME(CAOSMachine &vm) {
  return GetTimeOfDay(theApp.GetWorld());
}

int GeneralHandlers::IntegerRV_YEAR(CAOSMachine &vm) {
  return GetYearsElapsed(theApp.GetWorld());
}

int GeneralHandlers::IntegerRV_SEAN(CAOSMachine &vm) {
  return GetSeason(theApp.GetWorld());
}

int GeneralHandlers::IntegerRV_DATE(CAOSMachine &vm) {
  return GetDayInSeason(theApp.GetWorld());
}

int GeneralHandlers::IntegerRV_WTIK(CAOSMachine &vm) {
  return (int)GetWorldTick(theApp.GetWorld());
}

int GeneralHandlers::IntegerRV_ETIK(CAOSMachine &vm) {
  return (int)GetSystemTick(theApp);
}

void GeneralHandlers::Command_DELG(CAOSMachine &vm) {
  std::string var;
  vm.FetchStringRV(var);
  theApp.GetWorld().DeleteGameVar(var);
}

void GeneralHandlers::StringRV_GAMN(CAOSMachine &vm, std::string &str) {
  std::string from;
  vm.FetchStringRV(from);

  str = theApp.GetWorld().GetNextGameVar(from);
}

CAOSVar &GeneralHandlers::Variable_GAME(CAOSMachine &vm) {
  std::string var;
  vm.FetchStringRV(var);
  return theApp.GetWorld().GetGameVar(var);
}

// Engine machine variables — stored on App, not World.
// These persist across world loads (unlike GAME variables).
CAOSVar &GeneralHandlers::Variable_EAME(CAOSMachine &vm) {
  std::string var;
  vm.FetchStringRV(var);
  return GetEameVar(theApp, var);
}

void GeneralHandlers::Command_SAVE(CAOSMachine &vm) { RequestSave(theApp); }

void GeneralHandlers::Command_LOAD(CAOSMachine &vm) {
  std::string var;
  vm.FetchStringRV(var);
  RequestLoad(theApp, var);
}

void GeneralHandlers::Command_COPY(CAOSMachine &vm) {
  std::string source, destination;

  vm.FetchStringRV(source);
  vm.FetchStringRV(destination);

  theApp.GetWorld().CopyWorldDirectory(source, destination);
}

int GeneralHandlers::IntegerRV_WNTI(CAOSMachine &vm) {
  std::string str;
  vm.FetchStringRV(str);
  return WorldNameToIndex(theApp.GetWorld(), str);
}

int GeneralHandlers::IntegerRV_NWLD(CAOSMachine &vm) {
  return GetWorldCount(theApp.GetWorld());
}

void GeneralHandlers::StringRV_WRLD(CAOSMachine &vm, std::string &str) {
  int index = vm.FetchIntegerRV();
  if (!theApp.GetWorld().WorldName(index, str))
    ErrorMessageHandler::Show("archive_error", 9,
                              "GeneralHandlers::StringRV_WRLD");
}

void GeneralHandlers::Command_WRLD(CAOSMachine &vm) {
  std::string worldName;
  vm.FetchStringRV(worldName);
  theApp.CreateNewWorld(worldName);
}

void GeneralHandlers::StringRV_PSWD(CAOSMachine &vm, std::string &str) {
  int index = vm.FetchIntegerRV();
  // this will return empty string if the index is wrong which
  // is ok for the caller to handle
  if (!theApp.GetWorld().GetPassword(index, str))
    str.erase();
}

void GeneralHandlers::Command_DELW(CAOSMachine &vm) {
  std::string world;

  vm.FetchStringRV(world);

  theApp.GetWorld().DeleteWorldDirectory(world);
}

void GeneralHandlers::Command_QUIT(CAOSMachine &vm) {
#ifdef C2E_OLD_CPP_LIB
  char buf[512];
  std::ostrstream ss(buf, sizeof(buf));
#else
  std::stringstream ss; // should be ostringstream?
#endif
  if (vm.GetOwner().IsInvalid())
    ss << "CAOS Command Quit has activated from install script" << std::endl;
  else {
    Agent &owner = vm.GetOwner().GetAgentReference();
    Classifier running;
    vm.GetScript()->GetClassifier(running);
    ss << "CAOS Command Quit has activated from... "
       << owner.GetClassifier().Family() << " " << owner.GetClassifier().Genus()
       << " " << owner.GetClassifier().Species()
       << ". The agent was running script " << running.Family() << " "
       << running.Genus() << " " << running.Species() << " " << running.Event()
       << std::endl;
  }
#ifdef C2E_OLD_CPP_LIB
  theFlightRecorder.Log(16, buf);
#else
  std::string str = ss.str();
  theFlightRecorder.Log(16, str.c_str());
#endif

  RequestQuit(theApp);
}

// DS-only: BUZZ frequency - play a platform-speaker buzzer tone.
// macOS/SDL1 has no equivalent; consume the arg and do nothing.
void GeneralHandlers::Command_BUZZ(CAOSMachine &vm) {
  vm.FetchIntegerRV(); // frequency value
                       // no-op: no platform speaker support on macOS
}

void GeneralHandlers::Command_PSWD(CAOSMachine &vm) {
  std::string password;
  vm.FetchStringRV(password);
  // stores the password for the next loaded world
  theApp.SetPassword(password);
}

void GeneralHandlers::StringRV_FVWM(CAOSMachine &vm, std::string &str) {
  // Force Valid World Moniker
  vm.FetchStringRV(str);
  MakeFilenameSafe(str);
}

// DS: SINS agent1_name relation_type agent2_name
// Online-service social-relationship query.  Takes two strings (moniker keys)
// and an integer relation type.  Bootstrap scripts pass lowercase-moniker
// strings via lowa, e.g.:  sins lowa va00 1 lowa va12
// Returns -1 offline (no match), which scripts test: doif sins ... ne -1.
int GeneralHandlers::IntegerRV_SINS(CAOSMachine &vm) {
  std::string a1, a2;
  vm.FetchStringRV(a1); // agent1 key (string moniker)
  vm.FetchIntegerRV();  // relation_type
  vm.FetchStringRV(a2); // agent2 key (string moniker)
  return -1;
}

// DS-specific: returns the unique ID of the agent currently under the pointer
// hotspot as an integer (DS differs from HOTS which returns an agent handle).
// Returns 0 (NULL-equivalent) as stub for the offline macOS port.
int GeneralHandlers::IntegerRV_HOTP(CAOSMachine &vm) { return 0; }

// DS: TINT channel - returns the body tint value (0-255) for colour channel
// 1-5 (hue, saturation, value, rotation, swap) of the target creature.
// Stub returns 128 (neutral = no tint) so scripts that check/copy tint get
// a safe default value.
int GeneralHandlers::IntegerRV_TINT(CAOSMachine &vm) {
  vm.FetchIntegerRV(); // consume channel arg (1-5)
  return 128;
}

// DS: ABBA - returns the current facial-expression 'set' index for the target
// creature.  Stub returns 0 (default expression set).
int GeneralHandlers::IntegerRV_ABBA(CAOSMachine &vm) { return 0; }

// DS-specific: returns a value from an online network meta-message by key.
// Not implemented in the offline macOS port; always returns empty string.
void GeneralHandlers::StringRV_MAME(CAOSMachine &vm, std::string &str) {
  std::string key;
  vm.FetchStringRV(key); // consume the key arg
  str = "";
}

// DS-specific: returns the lowercase version of the given string.
void GeneralHandlers::StringRV_LOWA(CAOSMachine &vm, std::string &str) {
  vm.FetchStringRV(str);
  for (std::string::iterator it = str.begin(); it != str.end(); ++it)
    *it = (char)tolower((unsigned char)*it);
}

// C++ stack trace for debugging purposes
void GeneralHandlers::StringRV_CSTK(CAOSMachine &vm, std::string &str) {
  void *frames[64];
  int frameCount = backtrace(frames, 64);
  char **symbols = backtrace_symbols(frames, frameCount);
  
  if (!symbols) {
    str = "Failed to get backtrace symbols";
    return;
  }
  
  std::string result = "";
  char mangledBuf[512];
  
  for (int i = 0; i < frameCount; ++i) {
    const char *p = symbols[i];
    while (*p == ' ') ++p;
    while (*p && *p != ' ') ++p;
    while (*p == ' ') ++p;
    while (*p && *p != ' ') ++p;
    while (*p == ' ') ++p;
    while (*p && *p != ' ') ++p;
    while (*p == ' ') ++p;
    
    const char *start = p;
    while (*p && *p != ' ' && *p != '+') ++p;
    size_t len = (size_t)(p - start);
    
    bool demangled = false;
    if (len > 0 && len < sizeof(mangledBuf)) {
      memcpy(mangledBuf, start, len);
      mangledBuf[len] = '\0';
      int status = 0;
      char *demangledStr = abi::__cxa_demangle(mangledBuf, nullptr, nullptr, &status);
      if (status == 0 && demangledStr) {
        result += std::to_string(i) + " " + std::string(demangledStr) + "\n";
        free(demangledStr);
        demangled = true;
      }
    }
    
    if (!demangled) {
      result += std::string(symbols[i]) + "\n";
    }
  }
  
  free(symbols);
  str = result;
}

void GeneralHandlers::StringRV_CAOS(CAOSMachine &vm, std::string &str) {
  // This is a potentially dangerous process as the new VM generated could
  // except :(
  CAOSMachine newVM;
  MacroScript *m;
  Orderiser o;

  // First of all, let's get our parameters

  int inlining;
  inlining = vm.FetchIntegerRV();
  int state_trans = vm.FetchIntegerRV();
  CAOSVar p1, p2;
  p1 = vm.FetchGenericRV();
  p2 = vm.FetchGenericRV();
  std::string command;
  vm.FetchStringRV(command);
  int throws = vm.FetchIntegerRV();
  int catches = vm.FetchIntegerRV();
  CAOSVar &report = vm.FetchVariable();
  // Now we scan through the command and build a vector of scripts to process...

  std::vector<std::string> cmds;

  try {

    while (command.compare("")) {
      int posit;
      bool inquote = false;
      for (posit = 0; (posit < (command.length())); posit++) {
        /*if (command.at(posit) == '\\')
        {
                posit++;
                continue;
        }*/
        if (command.at(posit) == '\"') {
          int backcount = 0;
          int j = posit;
          while ((j > 0) && (command.at(j--) == '\\'))
            backcount++;
          if ((backcount % 2) == 0)
            inquote = !inquote;
          continue;
        }
        if (command.substr(posit, 4).compare("endm") == 0) {
          // We have reached the endm, so return iff not in quotes:)
          if (!inquote)
            break;
        }
      }
      // Right, posit is pointing to the start of the endm for the script...
      // Now we copy the string....
      cmds.push_back(command.substr(0, posit));
      if (posit < command.length())
        posit += 4;
      command = command.substr(posit);
      if (command.compare(""))
        while (command.at(0) == ' ')
          command = command.substr(1);
    }

  } catch (...) {

    if (throws)
      vm.ThrowRunError(CAOSMachine::sidParseErrorOnCAOS);
    else {
      report.SetInteger(CAOSMachine::sidParseErrorOnCAOS);
      str = "***";
      return;
    }
  }
  // Okay, we have split up the string nicely...

#ifdef C2E_OLD_CPP_LIB
  char hackbuf[65536];
  std::ostrstream outstream(hackbuf, sizeof(hackbuf));
#else
  std::ostringstream outstream;
#endif

  // Prepare the vm...
  for (std::vector<std::string>::iterator it = cmds.begin(); it != cmds.end();
       it++) {

    // 1. Is it a scrp?
    if (!strncmp((*it).c_str(), "scrp", 4)) {
      // Right, we have a scrp script.....
      // Stage One, Decode fgse....
#ifdef C2E_OLD_CPP_LIB
      std::istrstream scrpstream((*it).c_str());
#else
      std::istringstream scrpstream((*it));
#endif
      Classifier cls(0, 0, 0, 0);
      try {
        char tempstuff[1024];
        scrpstream >> tempstuff;
        uint32 family;
        uint32 genus;
        uint32 species;
        uint32 event;
        scrpstream >> family;
        scrpstream >> genus;
        scrpstream >> species;
        scrpstream >> event;
        cls.myFamily = family;
        cls.myGenus = genus;
        cls.mySpecies = species;
        cls.myEvent = event;

        if (!scrpstream.good())
          throw 0; // pass to catch (...) below)
      } catch (...) {
        if (throws)
          vm.ThrowRunError(CAOSMachine::sidErrorInSCRPForCAOS);
        else {
          report.SetInteger(CAOSMachine::sidErrorInSCRPForCAOS);
          str = "***";
          return;
        }
      }

      // Erkleroo - we now need to trim the scrp f g s e
      // from the script :(

      // What we do, is to get the stream's position...

      int locofstream = scrpstream.tellg();
      std::string scrpToInject;
      scrpToInject = (*it).substr(locofstream);

      // Now we have a classifier, let's process the script :)
      try {
        m = o.OrderFromCAOS(scrpToInject.c_str());
      } catch (...) {
        if (throws)
          vm.ThrowRunError(CAOSMachine::sidOrderiseErrorOnCAOS);
        else {
          report.SetInteger(CAOSMachine::sidOrderiseErrorOnCAOS);
          str = "***";
          return;
        }
      }
      if (!m) {
        str = "###";
        report.SetString(o.GetLastError());
        return;
      }

      m->SetClassifier(cls);
      if (!theApp.GetWorld().GetScriptorium().InstallScript(m)) {
        if (throws)
          vm.ThrowRunError(CAOSMachine::sidErrorInstallingSCRPForCAOS);
        else {
          report.SetInteger(CAOSMachine::sidErrorInstallingSCRPForCAOS);
          str = "***";
          return;
        }
      } else {
        m = NULL;
      }
    } else {
      // Right we execute it :)
      try {
        m = o.OrderFromCAOS((*it).c_str());
      } catch (...) {
        if (throws)
          vm.ThrowRunError(CAOSMachine::sidOrderiseErrorOnCAOS);
        else {
          report.SetInteger(CAOSMachine::sidOrderiseErrorOnCAOS);
          str = "***";
          return;
        }
      }
      if (!m) {
        str = "###";
        report.SetString(o.GetLastError());
        return;
      }

      if (state_trans)
        newVM.StartScriptExecuting(m, vm.GetOwner(), vm.GetFrom(), p1, p2);
      else
        newVM.StartScriptExecuting(m, NULLHANDLE, NULLHANDLE, p1, p2);

      if (inlining)
        vm.CopyBasicState(newVM);

      newVM.SetOutputStream(&outstream);
      try {
        newVM.UpdateVM(-1);
      } catch (CAOSMachine::RunError &e) {
        if (catches) {
          str = "###";
          report.SetString(e.what());
          return;
        }
        throw e;
      } catch (...) {
        if (catches) {
          report.SetString("Unknown Exception");
          str = "###";
          return;
        }
        throw;
      }
      if (inlining)
        newVM.CopyBasicState(vm);
      newVM.StopScriptExecuting();
      delete m;
    }
  }
#ifdef C2E_OLD_CPP_LIB
  str = hackbuf;
#else
  str.assign(outstream.str());
#endif
}

// BenC: Need these trig functions for my Scumotron game :-)
float GeneralHandlers::FloatRV_SIN(CAOSMachine &vm) // SIN_
{
  const double twopi = 2.0 * 3.1415926535;
  float theta = vm.FetchFloatRV();
  // convert to radians and return
  return (float)sin((twopi * (double)theta) / 360.0);
}

float GeneralHandlers::FloatRV_COS(CAOSMachine &vm) // COS_
{
  const double twopi = 2.0 * 3.1415926535;
  float theta = vm.FetchFloatRV();
  // convert to radians and return
  return (float)cos((twopi * (double)theta) / 360.0);
}

float GeneralHandlers::FloatRV_TAN(CAOSMachine &vm) // TAN_
{
  const double twopi = 2.0 * 3.1415926535;
  float theta = vm.FetchFloatRV();
  // hmmm. do we need to check theta here?

  // convert to radians and return
  return (float)tan((twopi * (double)theta) / 360.0);
}

float GeneralHandlers::FloatRV_ASIN(CAOSMachine &vm) {
  const double twopi = 2.0 * 3.1415926535;
  float f = vm.FetchFloatRV();
  // return as degrees
  return (float)((asin((double)f) * 360.0) / twopi);
}

float GeneralHandlers::FloatRV_ACOS(CAOSMachine &vm) {
  const double twopi = 2.0 * 3.1415926535;
  float f = vm.FetchFloatRV();
  // return as degrees
  return (float)((acos((double)f) * 360.0) / twopi);
}

float GeneralHandlers::FloatRV_SQRT(CAOSMachine &vm) {
  float f = vm.FetchFloatRV();
  if (f < 0)
    vm.ThrowRunError(CAOSMachine::sidNegativeSquareRoot);
  return sqrtf(f);
}

float GeneralHandlers::FloatRV_ITOF(CAOSMachine &vm) {
  return vm.FetchFloatRV();
}

int GeneralHandlers::IntegerRV_FTOI(CAOSMachine &vm) {
  return vm.FetchIntegerRV();
}

float GeneralHandlers::FloatRV_ATAN(CAOSMachine &vm) {
  const double twopi = 2.0 * 3.1415926535;
  float f = vm.FetchFloatRV();
  // return as degrees
  return (float)((atan((double)f) * 360.0) / twopi);
}

int GeneralHandlers::IntegerRV_VMNR(CAOSMachine &vm) {
  return GetMinorEngineVersion();
}

int GeneralHandlers::IntegerRV_VMJR(CAOSMachine &vm) {
  return GetMajorEngineVersion();
}

void GeneralHandlers::StringRV_WNAM(CAOSMachine &vm, std::string &str) {
  str = GetWorldName(theApp.GetWorld());
}

void GeneralHandlers::StringRV_WUID(CAOSMachine &vm, std::string &str) {
  str = GetWorldUID(theApp.GetWorld());
}

void GeneralHandlers::StringRV_GNAM(CAOSMachine &vm, std::string &str) {
  str = GetGameName(theApp);
}

void GeneralHandlers::Command_WPAU(CAOSMachine &vm) {
  int intPaused = vm.FetchIntegerRV();
  theApp.GetWorld().SetPausedWorldTick(intPaused == 1);
}

int GeneralHandlers::IntegerRV_WPAU(CAOSMachine &vm) {
  return GetWorldPaused(theApp.GetWorld()) ? 1 : 0;
}

float GeneralHandlers::FloatRV_PACE(CAOSMachine &vm) {
  return GetTickRateFactor(theApp);
}

void GeneralHandlers::Command_FILE(CAOSMachine &vm) {
  static CommandHandler HandlerTable[] = {
      SubCommand_FILE_OOPE, SubCommand_FILE_OCLO, SubCommand_FILE_OFLU,
      SubCommand_FILE_IOPE, SubCommand_FILE_ICLO, SubCommand_FILE_JDEL,
  };
  int subcmd;

  subcmd = vm.FetchOp();
  (HandlerTable[subcmd])(vm);
}

void GeneralHandlers::MakeFilenameSafe(std::string &filename) {
  for (int index = 0; index < filename.length(); index++)
    switch (filename.at(index)) {
    case '\\':
    case '/':
    case '?':
    case '*':
    case '\"':
    case '<':
    case '>':
    case '|':
    case ':':
      filename.at(index) = '_';
    }
}

void GeneralHandlers::SubCommand_FILE_JDEL(CAOSMachine &vm) {
  int directory = vm.FetchIntegerRV();
  std::string filename;
  vm.FetchStringRV(filename);
  MakeFilenameSafe(filename);
  std::string basepath;
  if (directory == 0)
    theApp.GetWorldDirectoryVersion(JOURNAL_DIR, basepath, true);
  else // 1
    basepath = theApp.GetDirectory(JOURNAL_DIR);

  filename = basepath + filename;

  DeleteFile(filename.c_str());
}

void GeneralHandlers::SubCommand_FILE_OOPE(CAOSMachine &vm) {
  int directory = vm.FetchIntegerRV();

  std::string filename;
  vm.FetchStringRV(filename);
  MakeFilenameSafe(filename);

  int append = vm.FetchIntegerRV();
  int mode = (append == 1) ? (std::ios::out | std::ios::app) : (std::ios::out);

  std::string basepath;
  if (directory == 0)
    theApp.GetWorldDirectoryVersion(JOURNAL_DIR, basepath, true);
  else // 1
    basepath = theApp.GetDirectory(JOURNAL_DIR);

  filename = basepath + filename;
  vm.SetOutputStream(new std::ofstream(filename.c_str(), mode), true);
}

void GeneralHandlers::SubCommand_FILE_OCLO(CAOSMachine &vm) {
  vm.SetOutputStream(NULL);
}

void GeneralHandlers::SubCommand_FILE_OFLU(CAOSMachine &vm) {
  std::ostream *out = vm.GetOutStream();
  out->flush();
}

void GeneralHandlers::SubCommand_FILE_IOPE(CAOSMachine &vm) {
  int directory = vm.FetchIntegerRV();

  std::string filename;
  vm.FetchStringRV(filename);
  MakeFilenameSafe(filename);

  std::string basepath;
  if (directory == 0)
    theApp.GetWorldDirectoryVersion(JOURNAL_DIR, basepath, true);
  else // 1
    basepath = theApp.GetDirectory(JOURNAL_DIR);

  filename = basepath + filename;
  vm.SetInputStream(new std::ifstream(filename.c_str(), std::ios::in));
}

void GeneralHandlers::SubCommand_FILE_ICLO(CAOSMachine &vm) {
  vm.SetInputStream(NULL);
}

float GeneralHandlers::FloatRV_STOF(CAOSMachine &vm) {
  std::string value;
  vm.FetchStringRV(value);

#ifdef C2E_OLD_CPP_LIB
  std::istrstream in(value.c_str());
#else
  std::istringstream in(value);
#endif
  float asFloat = 0.0f;
  in >> asFloat;

  return asFloat;
}

int GeneralHandlers::IntegerRV_STOI(CAOSMachine &vm) {
  std::string value;
  vm.FetchStringRV(value);

#ifdef C2E_OLD_CPP_LIB
  std::istrstream in(value.c_str());
#else
  std::istringstream in(value);
#endif
  int asInteger = 0;
  in >> asInteger;

  return asInteger;
}

int GeneralHandlers::IntegerRV_RTIM(CAOSMachine &vm) {
  return GetRealWorldTime();
}

void GeneralHandlers::Command_REAF(CAOSMachine &vm) {
  theApp.InitLocalisation();
}

void GeneralHandlers::StringRV_RTIF(CAOSMachine &vm, std::string &str) {
  int time;
  time = vm.FetchIntegerRV();
  std::string formatString;
  vm.FetchStringRV(formatString);

  time_t convertTime;
  convertTime = time;

  struct tm *localTime;
  localTime = localtime(&convertTime);

  char buffer[4096];

  int returnValue = strftime(buffer, 4095, formatString.c_str(), localTime);

  if (returnValue != 0)
    str = std::string(buffer);
  else
    str = "";
}

int GeneralHandlers::IntegerRV_DAYT(CAOSMachine &vm) {
  SYSTEMTIME time;
  GetLocalTime(&time);
  return time.wDay;
}

int GeneralHandlers::IntegerRV_MONT(CAOSMachine &vm) {
  SYSTEMTIME time;
  GetLocalTime(&time);
  return time.wMonth;
}

int GeneralHandlers::IntegerRV_RACE(CAOSMachine &vm) {
  return GetLastTickGap(theApp);
}

int GeneralHandlers::IntegerRV_SCOL(CAOSMachine &vm) {
  int andMask = vm.FetchIntegerRV();
  int eorMask = vm.FetchIntegerRV();

  std::vector<byte> speedUp, speedDown;
  {
    int count = vm.FetchInteger();
    const unsigned char *p = (const unsigned char *)vm.FetchRawData(count, 1);
    for (int i = 0; i < count; ++i)
      speedUp.push_back(*(p + i));
  }
  {
    int count = vm.FetchInteger();
    const unsigned char *p = (const unsigned char *)vm.FetchRawData(count, 1);
    for (int i = 0; i < count; ++i)
      speedDown.push_back(*(p + i));
  }
  SetScrolling(theApp, andMask, eorMask, speedUp.empty() ? nullptr : &speedUp,
               speedDown.empty() ? nullptr : &speedDown);
  return GetScrollingMask(theApp);
}

int GeneralHandlers::IntegerRV_MSEC(CAOSMachine &vm) { return GetTimeStamp(); }

// ---------------------------------------------------------------------------
// DS-specific command stubs added for macOS ARM64 port
// ---------------------------------------------------------------------------

// JECT "filename" flags -- inject a .cos file at runtime.
// Not implemented on this port; consume args and silently skip.
void GeneralHandlers::Command_JECT(CAOSMachine &vm) {
  std::string filename;
  vm.FetchStringRV(filename);
  vm.FetchIntegerRV(); // flags
}

// WEBB "url" -- open web browser. Not supported; consume arg and skip.
void GeneralHandlers::Command_WEBB(CAOSMachine &vm) {
  std::string url;
  vm.FetchStringRV(url);
}

// TINO x y z p1 p2 -- DS Tinderbox/network coordinates. Stub.
void GeneralHandlers::Command_TINO(CAOSMachine &vm) {
  vm.FetchIntegerRV(); // x
  vm.FetchIntegerRV(); // y
  vm.FetchIntegerRV(); // z
  vm.FetchGenericRV(); // p1
  vm.FetchGenericRV(); // p2
}

// CATO n -- Set the agent category of TARG.
// If n == -1, compute from the agent's classifier via SensoryFaculty.
void GeneralHandlers::Command_CATO(CAOSMachine &vm) {
  int n = vm.FetchIntegerRV();
  vm.ValidateTarg();
  if (n == -1) {
    Classifier c = vm.GetTarg().GetAgentReference().GetClassifier();
    int id = SensoryFaculty::GetCategoryIdOfClassifier(&c);
    // Map C3 error sentinel (39) to DS uncategorized (-1)
    vm.GetTarg().GetAgentReference().SetCategory(
        id == SensoryFaculty::ourCatagoryIdError ? -1 : id);
  } else {
    vm.GetTarg().GetAgentReference().SetCategory(n);
  }
}

// DS: net: sub-table command dispatcher
// Indices must match ourSubCommandTable_NET in CAOSTables_SubTables.cpp.
void GeneralHandlers::Command_NET(CAOSMachine &vm) {
  int subcmd = vm.FetchOp();
  std::string dummyStr;
  switch (subcmd) {
  case 0: // HEAR "s"
    vm.FetchStringRV(dummyStr);
    break;
  case 1: // HOST "s"
    vm.FetchStringRV(dummyStr);
    break;
  case 2: // RUSO "i"
    vm.FetchIntegerRV();
    break;
  case 3: // PASS "ss"
    vm.FetchStringRV(dummyStr);
    vm.FetchStringRV(dummyStr);
    break;
  case 4: // MAKE "is"
    vm.FetchIntegerRV();
    vm.FetchStringRV(dummyStr);
    break;
  case 5: // ULIN "s"
    vm.FetchStringRV(dummyStr);
    break;
  case 6: // LINE "i"
    vm.FetchIntegerRV();
    break;
  case 7: // WHOZ ""
    break;
  case 8: // WHON "s"
    vm.FetchStringRV(dummyStr);
    break;
  case 9: // MOVE ""
    break;
  case 10: // STAT "vvvv"
    vm.FetchVariable();
    vm.FetchVariable();
    vm.FetchVariable();
    vm.FetchVariable();
    break;
  case 11: // UNIK "si"
    vm.FetchStringRV(dummyStr);
    vm.FetchIntegerRV();
    break;
  case 12: // WHOF "s"
    vm.FetchStringRV(dummyStr);
    break;
  default:
    break;
  }
}

// DS: net: sub-table integer RV dispatcher
// Indices must match ourSubIntegerRVTable_NET in CAOSTables_SubTables.cpp.
int GeneralHandlers::IntegerRV_NET(CAOSMachine &vm) {
  int subcmd = vm.FetchOp();
  std::string dummyStr;
  switch (subcmd) {
  case 0: // LINE ""
    return 0;
  case 1: // EXPO "ss"
    vm.FetchStringRV(dummyStr);
    vm.FetchStringRV(dummyStr);
    return 0;
  case 2: // ULIN "s"
    vm.FetchStringRV(dummyStr);
    return 0;
  case 3: // MAKE "ismv"
    vm.FetchIntegerRV();
    vm.FetchStringRV(dummyStr);
    vm.FetchGenericRV(); // message (recipient expression)
    vm.FetchVariable();  // output status variable
    return 0;
  case 4: // STAT "iiii"
    vm.FetchIntegerRV();
    vm.FetchIntegerRV();
    vm.FetchIntegerRV();
    vm.FetchIntegerRV();
    return 0;
  case 5: // ERRA ""
    return 0;
  case 6: // PASS ""
    return 0;
  default:
    return 0;
  }
}

// DS: net: sub-table string RV dispatcher
// Indices must match ourSubStringRVTable_NET in CAOSTables_SubTables.cpp.
void GeneralHandlers::StringRV_NET(CAOSMachine &vm, std::string &str) {
  int subcmd = vm.FetchOp();
  str = "";
  switch (subcmd) {
  case 0: // USER ""
    break;
  case 1: // FROM "i"
    vm.FetchIntegerRV();
    break;
  case 2: // WHAT ""
    break;
  case 3: // WHOF ""
    break;
  case 4: // UNIK "i"
    vm.FetchIntegerRV();
    break;
  case 5: // HOST ""
    break;
  default:
    break;
  }
}
