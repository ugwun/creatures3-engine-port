// -------------------------------------------------------------------------
// Filename:    IAgentManager.h
// Purpose:     Narrow abstract interface exposing the subset of AgentManager
//              that CAOS handlers and other callers actually need.
//
//              Extracting this interface allows:
//              1. Test doubles for AgentManager so handlers can be unit-tested
//                 without a full agent list, display engine, or filesystem.
//              2. Clearer documentation of which operations the CAOS layer
//                 depends on.
//
// Usage:
//   AgentManager derives from IAgentManager and implements all pure virtuals.
//   Code that accesses theAgentManager can accept IAgentManager& instead,
//   enabling dependency injection.
//   Existing code is NOT changed — this is purely additive.
// -------------------------------------------------------------------------

#ifndef IAGENTMANAGER_H
#define IAGENTMANAGER_H

#include "../common/C2eTypes.h"
#include "Agents/AgentHandle.h"
#include "Caos/CAOSVar.h"
#include "Classifier.h"
#include <list>
#include <string>
#include <vector>

class CreaturesArchive;
class FilePath;
class Box;

// Re-declare the typedefs needed by the interface (keep in sync with
// AgentManager.h — these are identical definitions).
typedef std::list<AgentHandle> AgentList;
typedef std::list<AgentHandle>::iterator AgentListIterator;
typedef std::vector<AgentHandle> CreatureCollection;

// -------------------------------------------------------------------------
// Class: IAgentManager
// A narrow façade over the parts of AgentManager consumed by CAOS handlers
// and other engine code that should not depend on the concrete singleton.
// -------------------------------------------------------------------------
class IAgentManager {
public:
  virtual ~IAgentManager() {}

  // ------------------------------------------------------------------
  // Agent creation
  // ------------------------------------------------------------------
  virtual AgentHandle CreateSimpleAgent(int family, int genus, int species,
                                        FilePath const &gallery,
                                        int32 imagecount, int32 firstimage,
                                        int32 plane) = 0;

  virtual AgentHandle CreateCompoundAgent(int family, int genus, int species,
                                          FilePath const &gallery,
                                          int32 numimages, int32 baseimage,
                                          int32 plane) = 0;

  virtual AgentHandle CreateVehicle(int family, int genus, int species,
                                    FilePath const &gallery, int32 numimages,
                                    int32 baseimage, int32 plane) = 0;

  virtual AgentHandle CreateCreature(int family, AgentHandle &gene,
                                     int gene_index, int8 sex,
                                     int8 variant = 0) = 0;

  virtual AgentHandle CreatePointer() = 0;

  virtual void AddCreatureToUpdateList(AgentHandle const &creature) = 0;

  // ------------------------------------------------------------------
  // Agent lookup / iteration
  // ------------------------------------------------------------------
  virtual AgentHandle GetAgentFromID(uint32 id) = 0;

  virtual AgentListIterator GetAgentIteratorStart() = 0;
  virtual bool IsEnd(AgentListIterator &it) = 0;

  virtual AgentHandle FindNextAgent(AgentHandle &was, const Classifier &c) = 0;
  virtual AgentHandle FindPreviousAgent(AgentHandle &was,
                                        const Classifier &c) = 0;

  virtual AgentHandle FindCreatureAgentForMoniker(std::string moniker) = 0;
  virtual AgentHandle FindAgentForMoniker(std::string moniker) = 0;

  virtual AgentHandle GetCreatureByIndex(uint32 index) = 0;
  virtual int GetCreatureCount() = 0;

  // ------------------------------------------------------------------
  // Agent search
  // ------------------------------------------------------------------
  virtual void FindByFGS(AgentList &agents, const Classifier &c) = 0;

  virtual void FindByArea(AgentList &agents, const Box &r) = 0;
  virtual void FindByAreaAndFGS(AgentList &agents, const Classifier &c,
                                const Box &r) = 0;
  virtual void FindBySightAndFGS(AgentHandle const &viewer, AgentList &agents,
                                 const Classifier &c) = 0;

  // ------------------------------------------------------------------
  // Agent destruction
  // ------------------------------------------------------------------
  virtual void KillAllAgents() = 0;

  // ------------------------------------------------------------------
  // Script execution
  // ------------------------------------------------------------------
  virtual void ExecuteScriptOnAllAgents(int event, AgentHandle &from,
                                        const CAOSVar &p1,
                                        const CAOSVar &p2) = 0;

  virtual void ExecuteScriptOnAllAgentsDeferred(int event, AgentHandle &from,
                                                const CAOSVar &p1,
                                                const CAOSVar &p2) = 0;

  // ------------------------------------------------------------------
  // CA / smell classifier management
  // ------------------------------------------------------------------
  virtual bool UpdateSmellClassifierList(int caIndex,
                                         Classifier *classifier) = 0;
  virtual int GetSmellIdFromCategoryId(int categoryId) = 0;

  // ------------------------------------------------------------------
  // Creature mood / threat aggregation
  // ------------------------------------------------------------------
  virtual void CalculateMoodAndThreat(uint32 &iSelectableCount,
                                      uint32 &iLowestHealth, float &fMood,
                                      float &fThreat) = 0;

  // ------------------------------------------------------------------
  // Creature plane management
  // ------------------------------------------------------------------
  virtual int32 UniqueCreaturePlane(AgentHandle &me) = 0;

  // ------------------------------------------------------------------
  // Clone registration
  // ------------------------------------------------------------------
  virtual void RegisterClone(AgentHandle &clone) = 0;

  // ------------------------------------------------------------------
  // Serialisation
  // ------------------------------------------------------------------
  virtual bool Write(CreaturesArchive &archive) const = 0;
  virtual bool Read(CreaturesArchive &archive) = 0;
};

#endif // IAGENTMANAGER_H
