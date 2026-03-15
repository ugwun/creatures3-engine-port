// ==========================================================================
// test_V39Serialization.cpp
// Unit tests for v39 serialization round-trips and default-value behavior.
//
// Tested classes:
//   - LifeEvent (operator<</>>, all event types)
//   - CreatureHistory (operator<</>>, v12 round-trip, v12 defaults for DS fields)
//
// These tests link against LifeEvent.cpp and CreatureHistory.cpp for the
// REAL serialization operators, but provide lightweight stubs for AddEvent's
// engine dependencies (theAgentManager, theApp.GetWorld(), etc.).
// ==========================================================================

#include "engine/Creature/History/CreatureHistory.h"
#include "engine/Creature/History/LifeEvent.h"
#include "engine/CreaturesArchive.h"
#include <gtest/gtest.h>
#include <sstream>
#include <string>

// =========================================================================
// LifeEvent Tests
// =========================================================================

TEST(V39Serialization, LifeEvent_V12_BaseFields) {
  // Verify core LifeEvent fields round-trip correctly at v12.
  std::stringstream ss(std::ios_base::in | std::ios_base::out |
                       std::ios_base::binary);

  LifeEvent original;
  original.myEventType = LifeEvent::typeBorn;
  original.myWorldTick = 12345;
  original.myAgeInTicks = 500;
  original.myRealWorldTime = 1678900000;
  original.myLifeStage = 2;
  original.myRelatedMoniker1 = "moniker-dad";
  original.myRelatedMoniker2 = "moniker-mom";
  original.myUserText = "user note";
  original.myPhoto = "photo001";
  original.myWorldName = "TestWorld";
  original.myWorldUniqueIdentifier = "uid-001";

  {
    CreaturesArchive ar(ss, CreaturesArchive::Save);
    ar << original;
  }
  {
    ss.seekg(0);
    CreaturesArchive ar(ss, CreaturesArchive::Load);
    ASSERT_EQ(ar.GetFileVersion(), 12);

    LifeEvent loaded;
    ar >> loaded;

    EXPECT_EQ(loaded.myEventType, LifeEvent::typeBorn);
    EXPECT_EQ(loaded.myWorldTick, 12345u);
    EXPECT_EQ(loaded.myAgeInTicks, 500u);
    EXPECT_EQ(loaded.myRealWorldTime, 1678900000u);
    EXPECT_EQ(loaded.myLifeStage, 2);
    EXPECT_EQ(loaded.myRelatedMoniker1, "moniker-dad");
    EXPECT_EQ(loaded.myRelatedMoniker2, "moniker-mom");
    EXPECT_EQ(loaded.myUserText, "user note");
    EXPECT_EQ(loaded.myPhoto, "photo001");
    EXPECT_EQ(loaded.myWorldName, "TestWorld");
    EXPECT_EQ(loaded.myWorldUniqueIdentifier, "uid-001");
    // v12: DS-specific fields should be at defaults
    EXPECT_TRUE(loaded.myDSWorldUniqueIdentifier.empty());
    EXPECT_TRUE(loaded.myDisplayedInTheWomb);
    EXPECT_TRUE(loaded.myNetworkUser.empty());
  }
}

TEST(V39Serialization, LifeEvent_V12_AllEventTypes) {
  // All defined event types must round-trip correctly.
  std::vector<LifeEvent::EventType> types = {
      LifeEvent::typeConcieved,    LifeEvent::typeSpliced,
      LifeEvent::typeEngineered,   LifeEvent::typeBorn,
      LifeEvent::typeNewLifeStage, LifeEvent::typeExported,
      LifeEvent::typeImported,     LifeEvent::typeDied,
      LifeEvent::typeBecamePregnant, LifeEvent::typeImpregnated,
      LifeEvent::typeChildBorn,    LifeEvent::typeLaid,
      LifeEvent::typeLaidEgg,      LifeEvent::typePhotographed,
      LifeEvent::typeCloned,       LifeEvent::typeClonedSource,
  };

  for (auto eventType : types) {
    std::stringstream ss(std::ios_base::in | std::ios_base::out |
                         std::ios_base::binary);
    LifeEvent original;
    original.myEventType = eventType;
    original.myWorldTick = 42;
    original.myAgeInTicks = 100;
    original.myRealWorldTime = 1000;
    original.myLifeStage = 1;
    original.myRelatedMoniker1 = "m1";
    original.myRelatedMoniker2 = "";
    original.myUserText = "";
    original.myPhoto = "";
    original.myWorldName = "W";
    original.myWorldUniqueIdentifier = "U";

    {
      CreaturesArchive ar(ss, CreaturesArchive::Save);
      ar << original;
    }
    {
      ss.seekg(0);
      CreaturesArchive ar(ss, CreaturesArchive::Load);
      LifeEvent loaded;
      ar >> loaded;
      EXPECT_EQ(loaded.myEventType, eventType)
          << "Failed for event type " << (int)eventType;
    }
  }
}

TEST(V39Serialization, LifeEvent_V12_DSFieldsDefaultCorrectly) {
  // Verify that when DS-specific fields are set before saving but
  // NOT serialized (v12 doesn't write them), the defaults are correct on load.
  std::stringstream ss(std::ios_base::in | std::ios_base::out |
                       std::ios_base::binary);

  LifeEvent original;
  original.myEventType = LifeEvent::typeDied;
  original.myWorldTick = 99999;
  original.myAgeInTicks = 70000;
  original.myRealWorldTime = 1700000000;
  original.myLifeStage = 5;
  original.myRelatedMoniker1 = "mon1";
  original.myRelatedMoniker2 = "mon2";
  original.myUserText = "died of old age";
  original.myPhoto = "photo-death";
  original.myWorldName = "DSWorld";
  original.myWorldUniqueIdentifier = "ds-uid-001";
  // Set DS fields that won't be saved at v12
  original.myDSWorldUniqueIdentifier = "ds-world-uid-extra";
  original.myDisplayedInTheWomb = false;
  original.myNetworkUser = "NetworkUser42";

  {
    CreaturesArchive ar(ss, CreaturesArchive::Save);
    ar << original; // v12: DS fields NOT written
  }
  {
    ss.seekg(0);
    CreaturesArchive ar(ss, CreaturesArchive::Load);
    LifeEvent loaded;
    ar >> loaded;

    EXPECT_EQ(loaded.myEventType, LifeEvent::typeDied);
    EXPECT_EQ(loaded.myWorldTick, 99999u);
    EXPECT_EQ(loaded.myLifeStage, 5);
    // v12: DS fields revert to defaults (NOT the values we set)
    EXPECT_TRUE(loaded.myDSWorldUniqueIdentifier.empty());
    EXPECT_TRUE(loaded.myDisplayedInTheWomb); // default = true
    EXPECT_TRUE(loaded.myNetworkUser.empty());
  }
}

// =========================================================================
// CreatureHistory Tests
// =========================================================================

TEST(V39Serialization, CreatureHistory_V12_RoundTrip) {
  // Full CreatureHistory round-trip at v12.
  std::stringstream ss(std::ios_base::in | std::ios_base::out |
                       std::ios_base::binary);

  CreatureHistory original;
  original.myMoniker = "001-norn-abcdef12-3456";
  original.myName = "Norn the First";
  original.myGender = 1;
  original.myGenus = 0;
  original.myVariant = 3;
  original.myCrossoverMutationCount = 5;
  original.myCrossoverCrossCount = 7;
  // DS fields — won't be serialized at v12
  original.myWarpHoleVeteran = false;
  original.myDSUser = true;
  original.myNetworkUser = "ShouldNotSerialize";

  // Add a life event
  LifeEvent birth;
  birth.myEventType = LifeEvent::typeBorn;
  birth.myWorldTick = 100;
  birth.myAgeInTicks = 0;
  birth.myRealWorldTime = 1678000000;
  birth.myLifeStage = 0;
  birth.myRelatedMoniker1 = "dad-moniker";
  birth.myRelatedMoniker2 = "mom-moniker";
  birth.myUserText = "";
  birth.myPhoto = "photo_birth";
  birth.myWorldName = "TestWorld";
  birth.myWorldUniqueIdentifier = "world-uid-001";
  original.myLifeEvents.push_back(birth);

  {
    CreaturesArchive ar(ss, CreaturesArchive::Save);
    ar << original;
  }
  {
    ss.seekg(0);
    CreaturesArchive ar(ss, CreaturesArchive::Load);
    ASSERT_EQ(ar.GetFileVersion(), 12);

    CreatureHistory loaded;
    ar >> loaded;

    EXPECT_EQ(loaded.myMoniker, "001-norn-abcdef12-3456");
    EXPECT_EQ(loaded.myName, "Norn the First");
    EXPECT_EQ(loaded.myGender, 1);
    EXPECT_EQ(loaded.myGenus, 0);
    EXPECT_EQ(loaded.myVariant, 3);
    EXPECT_EQ(loaded.myCrossoverMutationCount, 5);
    EXPECT_EQ(loaded.myCrossoverCrossCount, 7);

    // v12: DS fields should be at DEFAULTS, not the values we set
    EXPECT_TRUE(loaded.myWarpHoleVeteran);  // default = true
    EXPECT_FALSE(loaded.myDSUser);          // default = false
    EXPECT_TRUE(loaded.myNetworkUser.empty());

    // Verify nested life event
    ASSERT_EQ(loaded.Count(), 1);
    EXPECT_EQ(loaded.GetLifeEvent(0)->myEventType, LifeEvent::typeBorn);
    EXPECT_EQ(loaded.GetLifeEvent(0)->myWorldTick, 100u);
    EXPECT_EQ(loaded.GetLifeEvent(0)->myRelatedMoniker1, "dad-moniker");
  }
}

TEST(V39Serialization, CreatureHistory_V12_EmptyHistory) {
  // Edge case: empty strings and no events.
  std::stringstream ss(std::ios_base::in | std::ios_base::out |
                       std::ios_base::binary);

  CreatureHistory original;
  original.myMoniker = "";
  original.myName = "";
  original.myGender = -1;
  original.myGenus = -1;
  original.myVariant = -1;
  original.myCrossoverMutationCount = -1;
  original.myCrossoverCrossCount = -1;

  {
    CreaturesArchive ar(ss, CreaturesArchive::Save);
    ar << original;
  }
  {
    ss.seekg(0);
    CreaturesArchive ar(ss, CreaturesArchive::Load);
    CreatureHistory loaded;
    ar >> loaded;

    EXPECT_TRUE(loaded.myMoniker.empty());
    EXPECT_TRUE(loaded.myName.empty());
    EXPECT_EQ(loaded.myGender, -1);
    EXPECT_EQ(loaded.myGenus, -1);
    EXPECT_EQ(loaded.myVariant, -1);
    EXPECT_EQ(loaded.Count(), 0);
  }
}

TEST(V39Serialization, CreatureHistory_V12_MultipleLifeEvents) {
  // Multiple life events in a single history.
  std::stringstream ss(std::ios_base::in | std::ios_base::out |
                       std::ios_base::binary);

  CreatureHistory original;
  original.myMoniker = "test-norn";
  original.myName = "TestNorn";
  original.myGender = 0;
  original.myGenus = 0;
  original.myVariant = 1;
  original.myCrossoverMutationCount = 2;
  original.myCrossoverCrossCount = 3;

  for (int stage = 0; stage < 6; ++stage) {
    LifeEvent event;
    event.myEventType =
        (stage == 0) ? LifeEvent::typeBorn : LifeEvent::typeNewLifeStage;
    event.myWorldTick = 1000 * (stage + 1);
    event.myAgeInTicks = stage * 5000;
    event.myRealWorldTime = 1678000000 + stage * 3600;
    event.myLifeStage = stage;
    event.myRelatedMoniker1 = "";
    event.myRelatedMoniker2 = "";
    event.myUserText = "";
    event.myPhoto = "";
    event.myWorldName = "World";
    event.myWorldUniqueIdentifier = "uid";
    original.myLifeEvents.push_back(event);
  }

  {
    CreaturesArchive ar(ss, CreaturesArchive::Save);
    ar << original;
  }
  {
    ss.seekg(0);
    CreaturesArchive ar(ss, CreaturesArchive::Load);
    CreatureHistory loaded;
    ar >> loaded;

    ASSERT_EQ(loaded.Count(), 6);
    EXPECT_EQ(loaded.GetLifeEvent(0)->myEventType, LifeEvent::typeBorn);
    EXPECT_EQ(loaded.GetLifeEvent(0)->myLifeStage, 0);
    EXPECT_EQ(loaded.GetLifeEvent(5)->myEventType,
              LifeEvent::typeNewLifeStage);
    EXPECT_EQ(loaded.GetLifeEvent(5)->myLifeStage, 5);
    EXPECT_EQ(loaded.GetLifeEvent(5)->myWorldTick, 6000u);
  }
}

// =========================================================================
// MOCKS FOR LINKER
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
bool AgentHandle::IsCreature() { return false; }
CreaturesArchive &operator<<(CreaturesArchive &ar, AgentHandle const &) {
  return ar;
}
CreaturesArchive &operator>>(CreaturesArchive &ar, AgentHandle &) { return ar; }
