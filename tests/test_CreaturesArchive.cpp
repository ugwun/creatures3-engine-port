#include "engine/CreaturesArchive.h"
#include "engine/Caos/CAOSVar.h"
#include <gtest/gtest.h>
#include <map>
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

// Named variable serialization round-trip.
// This mirrors the exact pattern used in Agent::Write/Read for per-agent
// string-keyed NAME variables (myNamedVariables).
TEST(CreaturesArchiveTest, SerializeNamedVariables_RoundTrip) {
  std::stringstream stream(std::ios_base::in | std::ios_base::out |
                           std::ios_base::binary);

  // Build a map of named variables with different CAOSVar types
  std::map<std::string, CAOSVar> vars;
  vars["status"].SetString("inactive");
  vars["counter"].SetInteger(42);
  vars["ratio"].SetFloat(3.14f);

  // Write using the same pattern as Agent::Write
  {
    CreaturesArchive archive(stream, CreaturesArchive::Save);
    archive << (int)vars.size();
    for (auto it = vars.begin(); it != vars.end(); ++it) {
      archive << it->first;
      it->second.Write(archive);
    }
  }

  // Read using the same pattern as Agent::Read
  {
    stream.seekg(0);
    CreaturesArchive archive(stream, CreaturesArchive::Load);
    std::map<std::string, CAOSVar> loaded;
    int count;
    archive >> count;
    ASSERT_EQ(count, 3);
    for (int i = 0; i < count; ++i) {
      std::string key;
      archive >> key;
      loaded[key].Read(archive);
    }

    // Verify all values survived the round-trip
    ASSERT_EQ(loaded.size(), 3u);

    std::string statusStr;
    loaded["status"].GetString(statusStr);
    EXPECT_EQ(statusStr, "inactive");

    EXPECT_EQ(loaded["counter"].GetInteger(), 42);
    EXPECT_FLOAT_EQ(loaded["ratio"].GetFloat(), 3.14f);
  }
}

// Backwards-compatibility: old saves wrote (int)0 as the leeway count.
// Reading count=0 should produce no named variables.
TEST(CreaturesArchiveTest, SerializeNamedVariables_EmptyBackwardsCompat) {
  std::stringstream stream(std::ios_base::in | std::ios_base::out |
                           std::ios_base::binary);

  // Write count=0 (simulates an old v12 save)
  {
    CreaturesArchive archive(stream, CreaturesArchive::Save);
    archive << (int)0;
  }

  // Read — should produce no variables
  {
    stream.seekg(0);
    CreaturesArchive archive(stream, CreaturesArchive::Load);
    std::map<std::string, CAOSVar> loaded;
    int count;
    archive >> count;
    EXPECT_EQ(count, 0);
    for (int i = 0; i < count; ++i) {
      std::string key;
      archive >> key;
      loaded[key].Read(archive);
    }
    EXPECT_TRUE(loaded.empty());
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
