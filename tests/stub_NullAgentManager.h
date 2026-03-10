// -------------------------------------------------------------------------
// stub_NullAgentManager.h
// A do-nothing IAgentManager implementation for use in unit tests.
//
// NullAgentManager is a "null object" — every method returns a safe default
// (NULLHANDLE, 0, false, empty list) without crashing.
//
// Tests that only need some methods to do real work can subclass
// NullAgentManager and override just those methods:
//
//   struct MyTestManager : public NullAgentManager {
//     int createSimpleCallCount = 0;
//     AgentHandle CreateSimpleAgent(...) override {
//       ++createSimpleCallCount;
//       return NULLHANDLE;
//     }
//   };
// -------------------------------------------------------------------------

#ifndef STUB_NULLAGENTMANAGER_H
#define STUB_NULLAGENTMANAGER_H

#include "engine/IAgentManager.h"
#include <list>
#include <string>

extern AgentHandle NULLHANDLE; // defined in AgentHandle.cpp / the engine

class NullAgentManager : public IAgentManager {
public:
  ~NullAgentManager() override {}

  // -- Agent creation -------------------------------------------------
  AgentHandle CreateSimpleAgent(int, int, int, FilePath const &, int32, int32,
                                int32) override {
    return NULLHANDLE;
  }
  AgentHandle CreateCompoundAgent(int, int, int, FilePath const &, int32, int32,
                                  int32) override {
    return NULLHANDLE;
  }
  AgentHandle CreateVehicle(int, int, int, FilePath const &, int32, int32,
                            int32) override {
    return NULLHANDLE;
  }
  AgentHandle CreateCreature(int, AgentHandle &, int, int8, int8) override {
    return NULLHANDLE;
  }
  AgentHandle CreatePointer() override { return NULLHANDLE; }
  void AddCreatureToUpdateList(AgentHandle const &) override {}

  // -- Agent lookup / iteration ---------------------------------------
  AgentHandle GetAgentFromID(uint32) override { return NULLHANDLE; }

  AgentListIterator GetAgentIteratorStart() override {
    return myEmptyList.end();
  }
  bool IsEnd(AgentListIterator &it) override { return it == myEmptyList.end(); }

  AgentHandle FindNextAgent(AgentHandle &, const Classifier &) override {
    return NULLHANDLE;
  }
  AgentHandle FindPreviousAgent(AgentHandle &, const Classifier &) override {
    return NULLHANDLE;
  }
  AgentHandle FindCreatureAgentForMoniker(std::string) override {
    return NULLHANDLE;
  }
  AgentHandle FindAgentForMoniker(std::string) override { return NULLHANDLE; }
  AgentHandle GetCreatureByIndex(uint32) override { return NULLHANDLE; }
  int GetCreatureCount() override { return 0; }

  // -- Agent search ---------------------------------------------------
  void FindByFGS(AgentList &, const Classifier &) override {}
  void FindByArea(AgentList &, const Box &) override {}
  void FindByAreaAndFGS(AgentList &, const Classifier &, const Box &) override {
  }
  void FindBySightAndFGS(AgentHandle const &, AgentList &,
                         const Classifier &) override {}

  // -- Agent destruction ----------------------------------------------
  void KillAllAgents() override {}

  // -- Script execution -----------------------------------------------
  void ExecuteScriptOnAllAgents(int, AgentHandle &, const CAOSVar &,
                                const CAOSVar &) override {}
  void ExecuteScriptOnAllAgentsDeferred(int, AgentHandle &, const CAOSVar &,
                                        const CAOSVar &) override {}

  // -- CA / smell -----------------------------------------------------
  bool UpdateSmellClassifierList(int, Classifier *) override { return false; }
  int GetSmellIdFromCategoryId(int) override { return -1; }

  // -- Creature stats -------------------------------------------------
  void CalculateMoodAndThreat(uint32 &sel, uint32 &health, float &mood,
                              float &threat) override {
    sel = health = 0;
    mood = threat = 0.0f;
  }

  // -- Plane / clone --------------------------------------------------
  int32 UniqueCreaturePlane(AgentHandle &) override { return 0; }
  void RegisterClone(AgentHandle &) override {}

  // -- Serialisation --------------------------------------------------
  bool Write(CreaturesArchive &) const override { return false; }
  bool Read(CreaturesArchive &) override { return false; }

private:
  AgentList myEmptyList;
};

#endif // STUB_NULLAGENTMANAGER_H
