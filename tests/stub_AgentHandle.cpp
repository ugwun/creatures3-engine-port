// stub_AgentHandle.cpp
// Minimal stubs for test_CAOSVar.
// Provides: NULLHANDLE global, AgentHandle no-op methods, and a theApp stub.
// Avoids pulling in Agent.h / App.h and their massive dependency chains.

#include "engine/Agents/AgentHandle.h"
#include "engine/CreaturesArchive.h"

// ---------------------------------------------------------------------------
// AgentHandle stubs
// ---------------------------------------------------------------------------
AgentHandle NULLHANDLE;

AgentHandle::AgentHandle() : myAgentPointer(nullptr) {}
AgentHandle::AgentHandle(const AgentHandle &h)
    : myAgentPointer(h.myAgentPointer) {}
AgentHandle::~AgentHandle() {}

AgentHandle &AgentHandle::operator=(const AgentHandle &h) {
  myAgentPointer = h.myAgentPointer;
  return *this;
}
bool AgentHandle::operator==(const AgentHandle &h) const {
  return myAgentPointer == h.myAgentPointer;
}
bool AgentHandle::operator!=(const AgentHandle &h) const {
  return myAgentPointer != h.myAgentPointer;
}
bool AgentHandle::IsValid() { return myAgentPointer != nullptr; }
bool AgentHandle::IsInvalid() { return myAgentPointer == nullptr; }

CreaturesArchive &operator<<(CreaturesArchive &ar, AgentHandle const &) {
  return ar;
}
CreaturesArchive &operator>>(CreaturesArchive &ar, AgentHandle &) { return ar; }

// ---------------------------------------------------------------------------
// theApp stub
// Provides a minimal App object for test targets that use test_stubs
// (test_CAOSVar, test_Classifier, etc.) but do NOT want App.h, SDL, World...
// The local App class name matches the linker's symbol expectations.
//
// Keep this class in sync with IApp.h / App.h out-of-line methods.
// Add a no-op here for any new out-of-line IApp method.
// ---------------------------------------------------------------------------
#include <cstddef>
#include <string>
#include <vector>
typedef unsigned char byte;

// Opaque forward declarations — avoids pulling in any real headers.
class InputManager;
class CAOSVar;

class App {
public:
  int GetZLibCompressionLevel() { return 6; }
  bool GetWorldDirectoryVersion(int, std::string &, bool) { return false; }
  // IApp out-of-line no-ops
  float GetTickRateFactor() { return 1.0f; }
  int EorWolfValues(int, int) { return 0; }
  void RequestSave() {}
  void RequestQuit() {}
  void RequestLoad(const std::string &) {}
  void RequestToggleFullScreen() {}
  bool CreateNewWorld(std::string &) { return false; }
  bool InitLocalisation() { return false; }
  void RefreshGameVariables() {}
  void SetPassword(std::string &) {}
  void SetScrolling(int, int, const std::vector<byte> *,
                    const std::vector<byte> *) {}

  // Methods returning opaque reference types — defined out-of-line below.
  // These are never actually called in test_CAOSVar etc.; we just need the
  // symbol to exist so the linker is satisfied.
  InputManager &GetInputManager();
  CAOSVar &GetEameVar(const std::string &);
};

// Out-of-line bodies that return a dangling-but-never-deref'd reference.
// Using a static char buffer avoids any constructor/destructor dep.
static char sIM[1];
InputManager &App::GetInputManager() {
  return *reinterpret_cast<InputManager *>(sIM);
}
static char sCV[1];
CAOSVar &App::GetEameVar(const std::string &) {
  return *reinterpret_cast<CAOSVar *>(sCV);
}

App theApp;
