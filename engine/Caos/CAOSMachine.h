// -------------------------------------------------------------------------
// Filename:    CAOSMachine.h
// Class:       CAOSMachine
// Purpose:     Virtual machine to run orderised CAOS code.
// Description:
//
//
// Pretty much all the public CAOSMachine functions will throw a
// CAOSMachine::RunError if an error occurs.
// Since most of the public functions are only used by the CAOS handler
// classes, UpdateVM() is really the only function that needs to be in a
// try..catch block.
//
// Usage:
//
//
// History:
// 04Dec98  BenC	Initial version
// 31Mar99  Alima	Moved sound commands to SoundHandlers
// -------------------------------------------------------------------------

#ifndef CAOSMACHINE_H
#define CAOSMACHINE_H

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "../../common/BasicException.h"
#include "../C2eServices.h"
#include "../PersistentObject.h"
#include "CAOSDescription.h"
#include "CAOSVar.h"
#include "MacroScript.h"

class DebugHandlers;

// disable annoying warning in VC when using stl (debug symbols > 255 chars)
#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "../../common/C2eTypes.h"
#include <set>
#include <string>
#include <vector>

// not sure which one is more ansi...
#ifdef _MSC_VER
#include <ostream>
#else
#include <iostream>
#endif

class CAOSVar;
class CAOSMachine;
class Camera;

#include "../Agents/AgentHandle.h"

// -------------------------------------------------------------------------
// Class: CAOSMachine
// *Probably* the virtual machine instance that interprets and executes
// the compiled CAOS macros. Each active script has its own VM instance,
// which maintains variable scope, the instruction pointer (IP),
// and context handles (OWNR, TARG, FROM, IT).
// -------------------------------------------------------------------------
class CAOSMachine : public PersistentObject {
  CREATURES_DECLARE_SERIAL(CAOSMachine)
public:
  // error message string IDs used by CAOSMachine
  enum {
    sidInvalidCommand = 0,
    sidInvalidRValue,
    sidInvalidLValue,
    sidInvalidSubCommand,
    sidInvalidStringRValue,
    sidInvalidStringLValue,
    sidBlockingDisallowed,
    sidInvalidTARG,
    sidInvalidOWNR,
    sidInvalidAgent,
    sidNotCompoundAgent,
    sidNotSimpleAgent,
    sidDivideByZero,
    sidSCRXFailed,     // f g s e
    sidScriptNotFound, // f g s e
    sidInvalidPortID,
    sidNotAnInt,
    sidNotAFloat,
    sidNotAString,
    sidNotAnAgent,
    sidInvalidPart, // invalid compound agent part id
    sidPathNumberOutOfRange,
    sidNotAVehicle,
    sidInvalidMapPosition1,
    sidInvalidMapPosition2,
    sidInvalidVehiclePosition,
    sidInvalidAgentID,
    sidInvalidCompareOpForAgents,
    sidNotADecimal,
    sidInternalUnexpectedTypeWhenFetching,
    sidChemicalOutOfRange,
    sidNotACreature,
    sidIndexOutsideString,
    sidNotACharacter,
    sidSliceOutsideString,
    sidFailedToDeleteRoom,
    sidFailedToDeleteMetaRoom,
    sidFailedToAddBackground,
    sidFailedToGetMetaRoomLocation,
    sidFailedToSetBackground,
    sidFailedToSetDoorPerm,
    sidFailedToSetRoomType,
    sidFailedToSetRoomProperty,
    sidFailedToSetCARates,
    sidFailedToGetRoomID,
    sidFailedToIncreaseCAProperty,
    sidFailedToGetDoorPerm,
    sidFailedToAddMetaRoom,
    sidFailedToAddRoom,
    sidCreatureHistoryPhotoStillInUse,
    sidFailedToGetRoomProperty,
    sidFailedToGetCurrentBackground,
    sidFailedToFindHighestCA,
    sidFailedToFindLowestCA,
    sidCouldNotSetNeuron,
    sidCouldNotSetDendrite,
    sidCouldNotSetLobe,
    sidCouldNotSetTract,
    sidCouldNotDumpLobe,
    sidCouldNotDumpTract,
    sidCouldNotDumpNeurone,
    sidCouldNotDumpDendrite,
    sidInvalidCreatureTARG,
    sidInvalidDebugParameter,
    sidRECYCLEME,
    sidInvalidPoseForPuptPuhl,
    sidInvalidStringForAnms,
    sidOutOfRangeForAnms,
    sidParseErrorOnCAOS,
    sidOrderiseErrorOnCAOS,
    sidErrorInSCRPForCAOS,
    sidErrorInstallingSCRPForCAOS,
    sidFailedToSetLinkPerm,
    sidFailedToGetLinkPerm,
    sidMutationParamaterOutOfRange,
    sidFailedToGetCARates,
    sidFailedToGetRoomIDs,
    sidFailedToGetRoomLocation,
    sidFailedToGetBackgrounds,
    sidNotUITextPart,
    sidNotUITextEntryPart,
    sidInvalidRepeatCount,
    sidLocusNotValid,
    sidNoSuchDriveNo,
    sidNoSuchGaitNo,
    sidNoSuchDirectionNo,
    sidNoSuchInvoluntaryActionNo,
    sidOperationNotAllowedOnCreature,
    sidNotUIGraph,
    sidInvalidCLIKRequest,
    sidAgentProfilerNotCompiledIn,
    sidInvalidGeneVariable,
    sidMaximumCreaturesExceeded,
    sidGeneLoadEngineeredFileError,
    sidNullOutputStream,
    sidBornAgainNorn,
    sidLifeEventIndexOutofRange,
    sidNullInputStream,
    sidOnlyWipeTrulyDeadHistory,
    sidCompoundPartAlreadyExists,
    sidFailedToCreateCreature,
    sidUserAbortedPossiblyFrozenScript,
    sidCAOSAssertionFailed,
    sidInvalidRange,
    sidPrayBuilderError,
    sidInvalidBaseOrPart,
    sidInvalidPoseOrPart,
    sidInvalidAnimOrPart,
    sidFrameRateOutOfRange,
    sidInvalidAnimStringOrPart,
    sidInvalidEmit,
    sidInvalidCacl,
    sidNegativeSquareRoot,
    sidInvalidMVSF,
    sidFailedToFindSafeLocation,
    sidBehaviourWithoutScript,
    sidSoundFileNotFound,
  };

  // If anything bad happens while a CAOSMachine is running a script,
  // a RunError object will be thrown. The catch block is responsible
  // for cleaning up/resuming after the error. The easiest way is
  // just to call the StopScriptExecuting() member from the catch block.
  class RunError : public BasicException {
  public:
    RunError(const char *msg) : BasicException(msg) {};
  };

  // exceptions for lost-agent accesses

  class InvalidAgentHandle : public RunError {
  public:
    InvalidAgentHandle(const char *msg) : RunError(msg) {};
  };

  // ---------------------------------------------------------------------
  // Method:      CopyBasicState
  // Arguments:   CAOSMachine& destination - the machine to copy to
  // Returns:     None
  // Description: Sets the destination Machine's va?? targ, ownr, etc.
  // ---------------------------------------------------------------------
  void CopyBasicState(CAOSMachine &destination);

  void StartScriptExecuting(MacroScript *m, const AgentHandle &owner,
                            const AgentHandle &from, const CAOSVar &p1,
                            const CAOSVar &p2);

  // ---------------------------------------------------------------------
  // Method:      GetScript
  // Arguments:
  // Returns:     currently running script
  // Description:
  // ---------------------------------------------------------------------
  MacroScript *GetScript() { return myMacro; }

  // ---------------------------------------------------------------------
  // Method:      UpdateVM
  // Arguments:   quanta - number of instructions to execute (-1 = all)
  // Returns:     true if macro finished
  // Description:	Execute some more of the currently-running macro
  // ---------------------------------------------------------------------
  bool UpdateVM(int quanta = -1);

  void SetOutputStream(std::ostream *out, bool takeResponsibility = false);
  void SetInputStream(std::istream *in);

  // ---------------------------------------------------------------------
  // Method:      StopScriptExecuting
  // Arguments:   None
  // Returns:     None
  // Description:	Stop the currently-running script
  // ---------------------------------------------------------------------
  void StopScriptExecuting();

  // ---------------------------------------------------------------------
  // The rest of this interface is probably only of interest to CAOS
  // handler functions and diagnostic systems:
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Method:      FetchOp
  // Arguments:   None
  // Returns:     value of opcode fetched
  // Description:	Fetch the next opcode from the macroscript and increment
  //				the IP accordingly.
  // ---------------------------------------------------------------------
  OpType FetchOp() { return myMacro->FetchOp(myIP); }

  // ---------------------------------------------------------------------
  // Method:      PeekOp
  // Arguments:   None
  // Returns:     value of opcode fetched
  // Description:	Fetch the next opcode from the macroscript
  // ---------------------------------------------------------------------
  OpType PeekOp() { return myMacro->PeekOp(myIP); }

  // ---------------------------------------------------------------------
  // Method:      FetchInteger
  // Arguments:   None
  // Returns:     value of integer fetched
  // Description:	Fetch the next integer from the macroscript
  //				and increment the IP accordingly.
  // ---------------------------------------------------------------------
  int FetchInteger() { return myMacro->FetchInteger(myIP); };

  // ---------------------------------------------------------------------
  // Method:      FetchFloat
  // Arguments:   None
  // Returns:     value of float fetched
  // Description:	Fetch the next float from the macroscript
  //				and increment the IP accordingly.
  // ---------------------------------------------------------------------
  float FetchFloat() { return myMacro->FetchFloat(myIP); }

  void FetchString(std::string &str) { myMacro->FetchString(myIP, str); }

  // ---------------------------------------------------------------------
  // Method:      FetchIntegerRV
  // Arguments:   None
  // Returns:     Value fetched
  // Description:	Fetch and resolve an RValue from the macroscript.
  //				Immediate values or LValues can also be used as
  // RValues. 				The IP is advanced accordingly and the
  // secondary op 				value is set to the opcode of
  // the fetched RVal 				(or LVal). If an immediate
  // number was fetched, the 				secondary op value is
  // undefined.
  // ---------------------------------------------------------------------
  int FetchIntegerRV();

  // ---------------------------------------------------------------------
  // Method:      FetchStringRV
  // Arguments:   str - string to fetch into
  // Returns:     None
  // Description:	Fetch a string rvalue from the macroscript and
  //				increment the IP accordingly.
  // ---------------------------------------------------------------------
  void FetchStringRV(std::string &str);

  AgentHandle FetchAgentRV();

  float FetchFloatRV();
  CAOSVar &FetchVariable();
  void FetchNumericRV(int &i, float &f, bool &intnotfloat);
  CAOSVar FetchGenericRV();

  // ---------------------------------------------------------------------
  // Method:      FetchRawData
  // Arguments:   numelements - number of elements
  //				elementsize - size of each element (in bytes)
  // Returns:     Pointer to binary data within macro script
  // Description:	Returns a pointer into the macroscript and advances the
  //				IP. IP is padded out to an even address if
  // needed. 				Used to fetch arrays of items.
  // ---------------------------------------------------------------------
  const void *FetchRawData(int numelements, int elementsize);

  // ---------------------------------------------------------------------
  // Method:      Evaluate
  // Arguments:   None
  // Returns:     Result of comparison
  // Description:	Evaluates a comparison encoded in the macroscript.
  //				eg "var0 > var2 and ob00 eq 5".
  //				The IP is advanced accordingly.
  // ---------------------------------------------------------------------
  bool Evaluate();

  // ---------------------------------------------------------------------
  // Method:      SetIP
  // Arguments:   ipnew - new position for instruction pointer.
  // Returns:     None
  // Description:	Changes the value of the instuction pointer (ie GOTO).
  //				MacroScripts begin at position 0.
  // ---------------------------------------------------------------------
  void SetIP(int ipnew) { myIP = ipnew; }

  // ---------------------------------------------------------------------
  // Method:      GetIP
  // Arguments:   None
  // Returns:     Current value of instruction pointer
  // Description:	Returns the position of the next item of data to be
  //				read in the macroscript.
  // ---------------------------------------------------------------------
  int GetIP() { return myIP; }

  // ---------------------------------------------------------------------
  // Method:      Push
  // Arguments:   i - value to store
  // Returns:     None
  // Description:	Pushes a value onto the top of the stack
  // ---------------------------------------------------------------------
  void Push(int i) { myStack.push_back(i); }
  void PushHandle(AgentHandle &a) { myAgentStack.push_back(a); }
  //		{ myStack.push(i); }

  // ---------------------------------------------------------------------
  // Method:      Pop
  // Arguments:   None
  // Returns:     retrieved value
  // Description:	Removes and returns the item at the top of the stack.
  // ---------------------------------------------------------------------
  int Pop() {
    int i = myStack.back();
    myStack.pop_back();
    return i;
  }
  AgentHandle PopHandle() {
    AgentHandle h = myAgentStack.back();
    myAgentStack.pop_back();
    return h;
  }
  //		{ int i=myStack.top(); myStack.pop(); return i; }

  // ---------------------------------------------------------------------
  // Method:      GetTarg, GetCreatureTarg, GetFrom, GetIT, GetOwner, GetPart
  // Arguments:   None
  // Returns:     agent or integer value
  // Description:	General accessor functions
  // ---------------------------------------------------------------------
  AgentHandle GetTarg() { return myTarg; }
  Creature &GetCreatureTarg();
  AgentHandle GetOwner() { return myOwner; }
  AgentHandle GetFrom() { return myFrom; }
  AgentHandle GetIT() { return myIT; }
  int GetPart() { return myPart; }
  Camera *GetCamera() { return myCamera; }

  // ---------------------------------------------------------------------
  // Method:      SetTarg, SetPart
  // Arguments:   newtarg	- new agent to be TARG (or NULL for none)
  //				part	- new part number for compound object
  // commands.
  // Returns:     None
  // Description:	General accessor functions
  // ---------------------------------------------------------------------

  void SetTarg(AgentHandle &newtarg) { myTarg = newtarg; }
  void SetPart(int part) { myPart = part; }
  // DS: Allow scripts to write the FROM agent handle (seta from _p1_).
  void SetFrom(AgentHandle &newfrom) { myFrom = newfrom; }

  // Accessors for P1/P2 — needed by synchronous CALL implementation
  CAOSVar GetP1() const { return myP1; }
  CAOSVar GetP2() const { return myP2; }

  // State bundle for synchronous subroutine calls (CALL command).
  // Captures the full VM context so a subroutine can run and the
  // caller can resume exactly where it left off.
  struct CallState {
    MacroScript *macro;
    int ip;
    CAOSVar p1, p2;
    bool instFlag;
    bool lockedFlag;
    AgentHandle owner;
    AgentHandle targ;
    AgentHandle from;
    AgentHandle it;
    Camera *camera;
    int part;
    std::vector<int> stack;
    std::vector<AgentHandle> agentStack;
    CAOSVar localVars[100]; // LOCAL_VARIABLE_COUNT
  };

  // Save the current VM state into a CallState bundle.
  void SaveCallState(CallState &state) {
    state.macro = myMacro;
    state.ip = myIP;
    state.p1 = myP1;
    state.p2 = myP2;
    state.instFlag = myInstFlag;
    state.lockedFlag = myLockedFlag;
    state.owner = myOwner;
    state.targ = myTarg;
    state.from = myFrom;
    state.it = myIT;
    state.camera = myCamera;
    state.part = myPart;
    state.stack = myStack;
    state.agentStack = myAgentStack;
    for (int i = 0; i < LOCAL_VARIABLE_COUNT; ++i)
      state.localVars[i] = myLocalVariables[i];
  }

  // Restore a previously saved CallState, resuming the caller script.
  void RestoreCallState(const CallState &state) {
    myMacro = state.macro;
    if (myMacro)
      myMacro->Lock(); // re-lock the caller's macro
    myIP = state.ip;
    myP1 = state.p1;
    myP2 = state.p2;
    myInstFlag = state.instFlag;
    myLockedFlag = state.lockedFlag;
    myOwner = state.owner;
    myTarg = state.targ;
    myFrom = state.from;
    myIT = state.it;
    myCamera = state.camera;
    myPart = state.part;
    myStack = state.stack;
    myAgentStack = state.agentStack;
    for (int i = 0; i < LOCAL_VARIABLE_COUNT; ++i)
      myLocalVariables[i] = state.localVars[i];
    myState = stateFetch;
  }

  // Set up the VM to run a subroutine script (for CALL command).
  // Unlike StartScriptExecuting, this does NOT clear existing state.
  void BeginSubroutine(MacroScript *m, const CAOSVar &p1,
                       const CAOSVar &p2) {
    myMacro = m;
    myMacro->Lock();
    myIP = 0;
    myP1 = p1;
    myP2 = p2;
    myState = stateFetch;
    // Clear stack for the subroutine's own loop/flow context
    myStack.clear();
    myAgentStack.clear();
    // Reset local variables for the subroutine's own scope
    for (int i = 0; i < LOCAL_VARIABLE_COUNT; ++i) {
      if (myLocalVariables[i].GetType() == CAOSVar::typeAgent)
        myLocalVariables[i].SetInteger(0);
      else
        myLocalVariables[i].BecomeAZeroedIntegerOnYourNextRead();
    }
    // targ/ownr/from/it/lock/inst carry over from caller (saved in CallState)
  }

  // Push caller state onto the CALL stack (for cross-tick subroutine calls).
  void PushCallStack(const CallState &state) {
    myCallStack.push_back(state);
  }

  // Clear the entire call stack, unlocking any saved macros.
  void ClearCallStack();

  void SetCamera(Camera *newCamera) { // if this is null then it's OK it means
                                      // use the main camera
    // for subsequent camera commands
    // otherwise send all camera commands to this camera
    myCamera = newCamera;
  }

  // ---------------------------------------------------------------------
  // Method:      GetCurrentCmd
  // Arguments:   None
  // Returns:     id of most recently fetched (ie currently executing)
  //				command.
  // Description:
  // ---------------------------------------------------------------------
  OpType GetCurrentCmd() { return myCurrentCmd; }

  // ---------------------------------------------------------------------
  // Method:      ValidateTarg
  // Arguments:   None
  // Returns:     None
  // Description:	Throws a RunError if targ is not a valid agent
  // ---------------------------------------------------------------------
  void ValidateTarg();

  // ---------------------------------------------------------------------
  // Method:      ValidateOwner
  // Arguments:   None
  // Returns:     None
  // Description:	Throws a ???? if owner is not a valid agent
  // ---------------------------------------------------------------------
  void ValidateOwner();

  // ---------------------------------------------------------------------
  // Method:      ThrowRunError / InvalidAgentHandle
  // Arguments:   fmt - printf-style format string and parameters
  // Returns:     None (never returns, just throws an exception)
  // Description:	Throws a CAOSMachine::RunError exception with a
  //				formatted error message.  Enforces localisation
  //              by only reading from catalogue.
  // ---------------------------------------------------------------------
  static void ThrowRunError(int stringid, ...);           // localised version
  static void ThrowInvalidAgentHandle(int stringid, ...); // localised version
  void ThrowRunError(const BasicException &e);

  static void FormatErrorPos(std::ostream &out, int pos,
                             const std::string &source);
  void StreamIPLocationInSource(std::ostream &out);
  void StreamClassifier(std::ostream &out);

  // ---------------------------------------------------------------------
  // Method:      Block
  // Arguments:   None
  // Returns:     None
  // Description:	Start a blocking operation ( eg OVER, WAIT...)
  //				This is the mechanism used to hold macro
  // execution 				over multiple UpdateVM() calls.
  // When in blocking state, UpdateVM() will just keep calling
  // the same command handler (eg Command_WAIT). When the command
  // wants to let the macroscript continue, it calls UnBlock.
  // ---------------------------------------------------------------------
  void Block();

  // ---------------------------------------------------------------------
  // Method:      UnBlock
  // Arguments:   None
  // Returns:     None
  // Description:	Finish a blocking operation ( eg OVER, WAIT...)
  // ---------------------------------------------------------------------
  void UnBlock();

  // ---------------------------------------------------------------------
  // Method:      IsBlocking
  // Arguments:   None
  // Returns:     blocking state
  // Description:	Returns true if any command (eg WAIT, OVER) is blocking.
  // ---------------------------------------------------------------------
  bool IsBlocking() { return myState == stateBlocking; }

  // ---------------------------------------------------------------------
  // Method:      GetSecondaryOp
  // Arguments:   None
  // Returns:     current secondary op
  // Description:	Kludge function to let lval and rval handlers to find
  //				out the opcode of lval/rval they are
  // implementing. 				This means that we can have
  // multiple codes using a 				handler, which is very
  // nice for things like OB00..OB99! 				The secondary op
  // is set by FetchRVal() and FetchLVal().
  // ---------------------------------------------------------------------
  OpType GetSecondaryOp() { return mySecondaryOp; }

  // ---------------------------------------------------------------------
  // Method:      SetInstFlag
  // Arguments:   yepnope - state to set inst flag to
  // Returns:     None
  // Description:
  // ---------------------------------------------------------------------
  void SetInstFlag(bool yepnope) { myInstFlag = yepnope; }

  std::ostream *GetOutStream() {
    if (myOutputStream == NULL)
      ThrowRunError(sidNullOutputStream);
    return myOutputStream;
  }
  std::istream *GetInStream() {
    if (myInputStream == NULL)
      ThrowRunError(sidNullInputStream);
    return myInputStream;
  }

  std::ostream *GetUnvalidatedOutStream() { return myOutputStream; }

  // stream out the VM state (for debugging)
  void DumpState(std::ostream &out, const char sep = '\n');

  AgentHandle GetAgentFromID(int id);

  bool IsRunning() { return (myState == stateFinished) ? false : true; }

  bool IsLocked() { return myLockedFlag; }

  // ── Debug / Breakpoint API ──────────────────────────────────────────
  void SetBreakpoint(int ip);
  void ClearBreakpoint(int ip);
  void ClearAllBreakpoints();
  const std::set<int>& GetBreakpoints() const;
  bool IsAtBreakpoint() const { return myState == stateBreakpoint; }
  void DebugContinue();    // resume from breakpoint
  void DebugStepInto();    // execute one instruction then pause
  void DebugStepOver();    // step over (skip nested calls/blocks)

  // Read-only access to local variables for debug inspection
  CAOSVar& GetLocalVariable(int i) { return myLocalVariables[i]; }
  static int GetLocalVariableCount() { return LOCAL_VARIABLE_COUNT; }

  CAOSMachine();
  ~CAOSMachine();

  static void InitialiseHandlerTables();

  // serialization stuff
  virtual bool Write(CreaturesArchive &ar) const;
  virtual bool Read(CreaturesArchive &ar);

private:
  // we need to get at these for debugging
  friend DebugHandlers;

  std::ostream *myOutputStream;
  std::istream *myInputStream;
  bool myOutputStreamDeleteResponsibility;
  enum { stateFinished, stateFetch, stateBlocking, stateBreakpoint };
  MacroScript *myMacro;
  int myIP;        // instruction pointer
  int myCommandIP; // The IP of the command currently Executing.
  int myState;
  OpType myCurrentCmd; // currently executing cmd
  std::vector<int> myStack;
  std::vector<AgentHandle> myAgentStack;

  bool myInstFlag;   // INST mode on/off?
  int myQuanta;      // number of steps left for this UpdateVM()
  bool myLockedFlag; // can script be interrupted?

  // Debug / breakpoint state
  std::set<int> myBreakpoints;         // bytecode IPs to break at
  bool myDebugStepOnce = false;        // single-step flag
  int  myDebugStepOverDepth = -1;      // stack depth for step-over

  // Call stack for the CALL command.  When a subroutine is invoked via
  // CALL, the caller's full VM state is pushed here.  When the subroutine
  // finishes (endm → StopScriptExecuting), the caller is popped and
  // restored, allowing multi-tick subroutines (over/wait) to work.
  std::vector<CallState> myCallStack;

  // variables
  Camera *myCamera; // if this is null we use the main camera
  AgentHandle myTarg;
  AgentHandle myOwner;
  AgentHandle myFrom;
  CAOSVar
      myFromVar; // Writable proxy for the DS 'from' variable (seta from ...)
  // DS: integer-indexed name biochemistry variable slots (NAME 66..127).
  enum { NAME_SLOT_COUNT = 128 };
  CAOSVar myNameVars[NAME_SLOT_COUNT];

  AgentHandle myIT; // If owner is a creature, this is the object it
                    // was paying attention to at the beginning of the
                    // macro.
  int myPart;       // part# for compound TARG object actions
  CAOSVar myP1;
  CAOSVar myP2;

  // IMPORTANT: Need to keep this number in sync with CAOSDescription et al
  enum { LOCAL_VARIABLE_COUNT = 100 };
  CAOSVar myLocalVariables[LOCAL_VARIABLE_COUNT]; // script-local variables...
                                                  // VA00-VA99
  OpType mySecondaryOp;

  bool FloatCompare(float f1, float f2, OpType comptype);
  bool StringCompare(std::string &s1, std::string &s2, OpType comptype);
  bool AgentCompare(AgentHandle const &a1, AgentHandle const &a2,
                    OpType comptype);
  bool EvalNumericRVSingle();
  bool EvalStringRVSingle();
  bool EvalAgentRVSingle();
  bool EvalVarSingle();
  bool EvaluateSingle();
  void DeleteOutputStreamIfResponsible();

  static std::vector<CommandHandler> ourCommandHandlers;
  static std::vector<std::string> ourCommandNames;
  static std::vector<IntegerRVHandler> ourIntegerRVHandlers;
  static std::vector<VariableHandler> ourVariableHandlers;
  static std::vector<StringRVHandler> ourStringRVHandlers;
  static std::vector<AgentRVHandler> ourAgentRVHandlers;
  static std::vector<FloatRVHandler> ourFloatRVHandlers;

public:
  // Some handlers

  static void Command_invalid(CAOSMachine &vm);
  static int IntegerRV_invalid(CAOSMachine &vm);
  static void StringRV_invalid(CAOSMachine &vm, std::string &str);

  static AgentHandle AgentRV_TARG(CAOSMachine &vm);
  static AgentHandle AgentRV_OWNR(CAOSMachine &vm);
  static AgentHandle AgentRV_FROM(CAOSMachine &vm);
  static AgentHandle AgentRV_IT(CAOSMachine &vm);

  static void Command_TARG(CAOSMachine &vm);
  static void Command_LOCK(CAOSMachine &vm);
  static void Command_UNLK(CAOSMachine &vm);

  static CAOSVar &Variable_P1(CAOSMachine &vm);
  static CAOSVar &Variable_P2(CAOSMachine &vm);

  static CAOSVar &Variable_VAnn(CAOSMachine &vm);
  // DS: FROM as a writable agent variable so 'seta from _p1_' compiles/runs.
  static CAOSVar &Variable_FROM(CAOSMachine &vm);
  // DS: NAME integer-indexed float variable (creature biochemistry slot).
  // Used by creature care kit for 'setv name 96 1.0' / 'doif name va00 >= .5'.
  static CAOSVar &FloatVariable_NAME(CAOSMachine &vm);
  // DS: NAME as a float RV (read-only path) so 'doif name va00 >= .5' compiles
  // correctly. The compiler prefers float RV over variable table lookup when
  // scanning ExpectAnyRV, preventing the string-keyed NAME from being selected.
  static float FloatRV_NAME(CAOSMachine &vm);
};

inline void CAOSMachine::ValidateTarg() {
  if (myTarg.IsInvalid())
    ThrowInvalidAgentHandle(sidInvalidTARG);
}

inline void CAOSMachine::ValidateOwner() {
  if (myOwner.IsInvalid())
    ThrowInvalidAgentHandle(sidInvalidOWNR);
}

#endif // CAOSMACHINE_H
