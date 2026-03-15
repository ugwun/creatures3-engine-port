#include "engine/CreaturesArchive.h"
#include <gtest/gtest.h>
#include <sstream>

// Basic types testing
TEST(CreaturesArchiveTest, SerializeBasicTypes) {
  std::stringstream stream(std::ios_base::in | std::ios_base::out |
                           std::ios_base::binary);

  // Save
  {
    CreaturesArchive archive(stream, CreaturesArchive::Save);
    archive << (uint8)255;
    archive << (int32)-123456;
    archive << (float)3.14159f;
    archive << std::string("Hello world!");
  }

  // Load
  {
    stream.seekg(0);
    CreaturesArchive archive(stream, CreaturesArchive::Load);
    uint8 v8;
    int32 v32;
    float vf;
    std::string str;

    archive >> v8 >> v32 >> vf >> str;

    EXPECT_EQ(v8, 255);
    EXPECT_EQ(v32, -123456);
    EXPECT_FLOAT_EQ(vf, 3.14159f);
    EXPECT_EQ(str, "Hello world!");
  }
}

// STL containers testing
TEST(CreaturesArchiveTest, SerializeContainers) {
  std::stringstream stream(std::ios_base::in | std::ios_base::out |
                           std::ios_base::binary);

  std::vector<int32> vecSave = {1, 2, 3, 4, 5};
  std::list<std::string> listSave = {"A", "B", "C"};

  // Save
  {
    CreaturesArchive archive(stream, CreaturesArchive::Save);
    archive << vecSave;
    archive << listSave;
  }

  // Load
  {
    stream.seekg(0);
    CreaturesArchive archive(stream, CreaturesArchive::Load);
    std::vector<int32> vecLoad;
    std::list<std::string> listLoad;

    archive >> vecLoad;
    archive >> listLoad;

    EXPECT_EQ(vecSave, vecLoad);
    EXPECT_EQ(listSave, listLoad);
  }
}

// =========================================================================
// MOCKS FOR LINKER
// CreaturesArchive depends on App and ErrorMessageHandler.
// =========================================================================
#include "engine/App.h"
#include "engine/Caos/CAOSVar.h"
#include "engine/Display/ErrorMessageHandler.h"
#include "engine/PersistentObject.h"

App theApp;
App::App() {}
App::~App() {}
int App::GetZLibCompressionLevel() { return 6; }
bool App::GetWorldDirectoryVersion(int, std::string &, bool) { return false; }
bool App::GetWorldDirectoryVersion(const std::string &, std::string &, bool) {
  return false;
}
float App::GetTickRateFactor() { return 1.0f; }
int App::EorWolfValues(int, int) { return 0; }
void App::SetPassword(std::string &) {}
void App::RefreshGameVariables() {}
bool App::CreateNewWorld(std::string &) { return false; }
bool App::InitLocalisation() { return false; }
void App::SetScrolling(int, int, const std::vector<byte> *,
                       const std::vector<byte> *) {}
CAOSVar &App::GetEameVar(const std::string &) {
  static CAOSVar v;
  return v;
}
bool Configurator::Flush() { return true; }
InputManager::InputManager() {}

std::string ErrorMessageHandler::Format(std::string, int, std::string, ...) {
  return "MOCK ERROR";
}

PersistentObject *PersistentObject::New(char const *) { return nullptr; }

// FlightRecorder mock (CreaturesArchive.cpp now uses theFlightRecorder.Log)
#include "engine/FlightRecorder.h"
FlightRecorder theFlightRecorder;
FlightRecorder::FlightRecorder() : myOutFile(nullptr), myEnabledCategories(0) {
  myOutFilename[0] = '\0';
#ifndef _WIN32
  myUDPSocket = -1;
  myUDPPort = 0;
#endif
}
FlightRecorder::~FlightRecorder() {}
void FlightRecorder::Log(uint32, const char *, ...) {}
void FlightRecorder::SetOutFile(const char *) {}
void FlightRecorder::SetCategories(uint32) {}

// AgentHandle/NULLHANDLE stubs (CreaturesArchive serialises agents)
#include "engine/Agents/AgentHandle.h"
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
