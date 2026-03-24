# ---------------------------------------------------------------------------
# test_stubs — shared static library used by tests that need AgentHandle,
# CreaturesArchive, Classifier, and PersistentObject without pulling in the
# full game engine.
#
# The four tests that previously each listed these source files individually
# now simply link against test_stubs.
# ---------------------------------------------------------------------------
add_library(test_stubs STATIC
  stub_AgentHandle.cpp
  stub_CreaturesArchive.cpp
  ../engine/Classifier.cpp
  ../engine/PersistentObject.cpp
)
# _CAOSDEBUGGER removes StreamAgentNameIfAvailable in Classifier.cpp,
# avoiding a Catalogue dependency.
target_compile_definitions(test_stubs PUBLIC _CAOSDEBUGGER)
target_include_directories(test_stubs PUBLIC
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_stubs PUBLIC GTest::gtest_main)

# ---------------------------------------------------------------------------
# test_Vector2D
# ---------------------------------------------------------------------------
add_executable(test_Vector2D test_Vector2D.cpp)

# ---------------------------------------------------------------------------
# test_FilePath
# ---------------------------------------------------------------------------
add_executable(test_FilePath
  test_FilePath.cpp
  ../engine/FilePath.cpp
)

# ---------------------------------------------------------------------------
# test_Maths
# ---------------------------------------------------------------------------
add_executable(test_Maths test_Maths.cpp ../engine/Maths.cpp)

# ---------------------------------------------------------------------------
# test_TickRate — game tick-rate calculation utilities (header-only, no deps)
# ---------------------------------------------------------------------------
add_executable(test_TickRate test_TickRate.cpp)

# ---------------------------------------------------------------------------
# test_SimpleLexer
# ---------------------------------------------------------------------------
add_executable(test_SimpleLexer test_SimpleLexer.cpp ../common/SimpleLexer.cpp)

# ---------------------------------------------------------------------------
# test_CreaturesArchive
# ---------------------------------------------------------------------------
add_executable(test_CreaturesArchive
  test_CreaturesArchive.cpp
  ../engine/CreaturesArchive.cpp
  ../engine/Caos/CAOSVar.cpp
)

# ---------------------------------------------------------------------------
# test_CAOSVar — CAOS variable tagged-union (int/float/string/agent)
# ---------------------------------------------------------------------------
add_executable(test_CAOSVar
  test_CAOSVar.cpp
  ../engine/Caos/CAOSVar.cpp
)
target_link_libraries(test_CAOSVar PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_Classifier — family/genus/species/event matching
# ---------------------------------------------------------------------------
add_executable(test_Classifier test_Classifier.cpp)
target_link_libraries(test_Classifier PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_Scriptorium — script install / find / zap store
# Scriptorium-only stubs (stub_Orderiser, stub_Lexer) stay inline here.
# ---------------------------------------------------------------------------
add_executable(test_Scriptorium
  test_Scriptorium.cpp
  stub_Orderiser.cpp
  stub_Lexer.cpp
  ../engine/Caos/Scriptorium.cpp
  ../engine/Caos/MacroScript.cpp
  ../engine/Caos/DebugInfo.cpp
)
target_link_libraries(test_Scriptorium PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_Configurator — INI-style config file handler (fully self-contained)
# ---------------------------------------------------------------------------
add_executable(test_Configurator
  test_Configurator.cpp
  ../common/Configurator.cpp
)

# ---------------------------------------------------------------------------
# test_Catalogue — localised string table (depends on SimpleLexer,
# FileLocaliser)
# ---------------------------------------------------------------------------
add_executable(test_Catalogue
  test_Catalogue.cpp
  ../common/Catalogue.cpp
  ../common/SimpleLexer.cpp
  ../common/FileLocaliser.cpp
)

# ---------------------------------------------------------------------------
# test_AgentManager — IAgentManager interface + NullAgentManager stub
# ---------------------------------------------------------------------------
add_executable(test_AgentManager test_AgentManager.cpp)
target_link_libraries(test_AgentManager PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_MapHandlers — tests real MapHandlers IMap& logic methods with NullMap/FakeMap
# ---------------------------------------------------------------------------
add_executable(test_MapHandlers
  test_MapHandlers.cpp
  ../engine/Caos/MapHandlers_Logic.cpp
)
target_link_libraries(test_MapHandlers PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_GeneralHandlers — tests GeneralHandlers IWorldServices& logic methods
# ---------------------------------------------------------------------------
add_executable(test_GeneralHandlers
  test_GeneralHandlers.cpp
  ../engine/Caos/GeneralHandlers_Logic.cpp
  ../engine/Caos/CAOSVar.cpp   # NullWorldServices uses CAOSVar for game vars
)
target_link_libraries(test_GeneralHandlers PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_AgentHandlers — tests AgentHandlers IWorldServices& logic methods
# ---------------------------------------------------------------------------
add_executable(test_AgentHandlers
  test_AgentHandlers.cpp
  ../engine/Caos/AgentHandlers_Logic.cpp
  ../engine/Caos/CAOSVar.cpp      # NullWorldServices game-var store
  stub_AgentHandle.cpp            # AgentHandle link deps
)
target_link_libraries(test_AgentHandlers PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# test_Genome — DNA parser logic tested with hand-crafted byte arrays
# ---------------------------------------------------------------------------
add_executable(test_Genome
  test_Genome.cpp
  stub_Catalogue.cpp
  stub_ErrorMessageHandler.cpp
  stub_File.cpp
  stub_FilePath.cpp
  stub_GenomeDeps.cpp
  ../engine/Creature/Genome.cpp
  ../engine/Maths.cpp
)
target_link_libraries(test_Genome PRIVATE test_stubs)

# ---------------------------------------------------------------------------
# Include directories (targets NOT using test_stubs — stubs already handle it)
# ---------------------------------------------------------------------------
foreach(target
    test_Vector2D
    test_FilePath
    test_Maths
    test_TickRate
    test_SimpleLexer
    test_CreaturesArchive
    test_Configurator
    test_Catalogue
    test_MapHandlers
    test_Genome
)
  target_include_directories(${target} PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
    ${CMAKE_SOURCE_DIR}/engine
  )
endforeach()

# ---------------------------------------------------------------------------
# Link libraries (targets NOT using test_stubs)
# ---------------------------------------------------------------------------
foreach(target
    test_Vector2D
    test_FilePath
    test_Maths
    test_TickRate
    test_SimpleLexer
    test_Configurator
    test_Catalogue
    test_MapHandlers
    test_Genome
)
  target_link_libraries(${target} PRIVATE GTest::gtest_main)
endforeach()

target_link_libraries(test_FilePath PRIVATE GTest::gtest_main)
target_link_libraries(test_CreaturesArchive PRIVATE GTest::gtest_main ZLIB::ZLIB)

# ---------------------------------------------------------------------------
# test_HistoryHandlers — tests HistoryHandlers logic-layer methods
# ---------------------------------------------------------------------------
add_executable(test_HistoryHandlers
  test_HistoryHandlers.cpp
  ../engine/Caos/HistoryHandlers_Logic.cpp
  ../engine/Caos/CAOSVar.cpp            # NullWorldServices uses CAOSVar
  stub_HistoryStore.cpp          # HistoryStore without theAgentManager
  stub_CreatureHistory.cpp       # CreatureHistory without theApp
)
target_include_directories(test_HistoryHandlers PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_HistoryHandlers PRIVATE test_stubs GTest::gtest_main)

# ---------------------------------------------------------------------------
# test_AppHandlers — tests GeneralHandlers IApp& logic methods
# ---------------------------------------------------------------------------
add_executable(test_AppHandlers
  test_AppHandlers.cpp
  ../engine/Caos/AppHandlers_Logic.cpp
  ../engine/Caos/CAOSVar.cpp      # FakeApp uses CAOSVar for EAME store
  stub_InputManager.cpp           # provides InputManager without App.h deps
)
target_include_directories(test_AppHandlers PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_AppHandlers PRIVATE test_stubs GTest::gtest_main)

# ---------------------------------------------------------------------------
# test_PointerAgent — click-target resolution logic (PointerAgent_Logic.cpp)
# ---------------------------------------------------------------------------
add_executable(test_PointerAgent
  test_PointerAgent.cpp
  ../engine/Agents/PointerAgent_Logic.cpp
  stub_AgentHandle.cpp
)
target_include_directories(test_PointerAgent PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_PointerAgent PRIVATE GTest::gtest_main)

# ---------------------------------------------------------------------------
# Test discovery
# ---------------------------------------------------------------------------
include(GoogleTest)
gtest_discover_tests(test_Vector2D)
gtest_discover_tests(test_FilePath)
gtest_discover_tests(test_Maths)
gtest_discover_tests(test_SimpleLexer)
gtest_discover_tests(test_CreaturesArchive)
gtest_discover_tests(test_CAOSVar)
gtest_discover_tests(test_Classifier)
gtest_discover_tests(test_Scriptorium)
gtest_discover_tests(test_Configurator)
gtest_discover_tests(test_Catalogue)
gtest_discover_tests(test_MapHandlers)
gtest_discover_tests(test_GeneralHandlers)
gtest_discover_tests(test_AgentHandlers)
gtest_discover_tests(test_AgentManager)
gtest_discover_tests(test_Genome)
gtest_discover_tests(test_HistoryHandlers)
gtest_discover_tests(test_AppHandlers)
gtest_discover_tests(test_PointerAgent)
gtest_discover_tests(test_TickRate)

# ---------------------------------------------------------------------------
# test_V39Serialization — v39-specific deserialization branch tests
# ---------------------------------------------------------------------------
add_executable(test_V39Serialization
  test_V39Serialization.cpp
  stub_V39_CreatureHistory.cpp
  ../engine/CreaturesArchive.cpp
  ../engine/Caos/CAOSVar.cpp
  ../engine/Creature/History/LifeEvent.cpp
)
target_include_directories(test_V39Serialization PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_V39Serialization PRIVATE GTest::gtest_main ZLIB::ZLIB)
gtest_discover_tests(test_V39Serialization)

# ---------------------------------------------------------------------------
# test_CompoundAgent — AddPart replacement logic (no engine deps)
# ---------------------------------------------------------------------------
add_executable(test_CompoundAgent test_CompoundAgent.cpp)
target_include_directories(test_CompoundAgent PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_CompoundAgent PRIVATE GTest::gtest_main)
gtest_discover_tests(test_CompoundAgent)

# ---------------------------------------------------------------------------
# test_CAOSMachineCallStack — CALL command call stack save/restore/clear
# ---------------------------------------------------------------------------
add_executable(test_CAOSMachineCallStack
  test_CAOSMachineCallStack.cpp
  ../engine/Caos/CAOSVar.cpp
)
target_link_libraries(test_CAOSMachineCallStack PRIVATE test_stubs)
gtest_discover_tests(test_CAOSMachineCallStack)

# ---------------------------------------------------------------------------
# test_StringIntGroup — PRAY chunk tag parsing (binary format)
# ---------------------------------------------------------------------------
add_executable(test_StringIntGroup
  test_StringIntGroup.cpp
  ../common/PRAYFiles/StringIntGroup.cpp
)
target_include_directories(test_StringIntGroup PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_StringIntGroup PRIVATE GTest::gtest_main)
gtest_discover_tests(test_StringIntGroup)

# ---------------------------------------------------------------------------
# test_UITextFormatting — inline <tint R G B> tag stripping (header-only)
# ---------------------------------------------------------------------------
add_executable(test_UITextFormatting test_UITextFormatting.cpp)
target_include_directories(test_UITextFormatting PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_UITextFormatting PRIVATE GTest::gtest_main)
gtest_discover_tests(test_UITextFormatting)

# ---------------------------------------------------------------------------
# test_MNGFormat — MNG music file parsing and WAV reconstruction (header-only)
# ---------------------------------------------------------------------------
add_executable(test_MNGFormat test_MNGFormat.cpp)
target_include_directories(test_MNGFormat PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_MNGFormat PRIVATE GTest::gtest_main)
gtest_discover_tests(test_MNGFormat)

# ---------------------------------------------------------------------------
# test_GetFilesInDirectory — fnmatch-based glob matching for file listing
# ---------------------------------------------------------------------------
add_executable(test_GetFilesInDirectory
  test_GetFilesInDirectory.cpp
  stub_General.cpp
)
target_include_directories(test_GetFilesInDirectory PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_GetFilesInDirectory PRIVATE GTest::gtest_main)
gtest_discover_tests(test_GetFilesInDirectory)

# ---------------------------------------------------------------------------
# test_InputManager — key state tracking for IsKeyDown() polling
# ---------------------------------------------------------------------------
add_executable(test_InputManager
  test_InputManager.cpp
  stub_InputManager.cpp
)
target_include_directories(test_InputManager PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/common
  ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_InputManager PRIVATE GTest::gtest_main)
gtest_discover_tests(test_InputManager)
