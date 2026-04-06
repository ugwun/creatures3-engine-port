cmake_minimum_required(VERSION 3.10)
project(Creatures3 CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Legacy flags from old Makefile
add_compile_options(-ftemplate-depth=32)
add_definitions(-DC2E_SDL -DC2E_NO_INLINE_ASM -DC2E_OLD_CPP_LIB)

# Find zlib
find_package(ZLIB REQUIRED)

# Find SDL2 (replaces SDL 1.2 — unified for display + sound)
find_package(SDL2 REQUIRED)
find_package(SDL2_mixer REQUIRED)

# Source files for the lc2e executable.
# Add new .cpp files here when extending the engine.
set(SRC_FILES
  common/BasicException.cpp
  common/C2eDebug.cpp
  common/Catalogue.cpp
  common/Configurator.cpp
  common/FileLocaliser.cpp
  common/MapScanner.cpp
  common/PRAYFiles/PrayBuilder.cpp
  common/PRAYFiles/PrayChunk.cpp
  common/PRAYFiles/PrayHandlers.cpp
  common/PRAYFiles/PrayManager.cpp
  common/PRAYFiles/StringIntGroup.cpp
  common/Position.cpp
  common/ServerSide.cpp
  common/SimpleLexer.cpp
  common/Vector2D.cpp
  engine/AgentManager.cpp
  engine/Agents/Agent.cpp
  engine/Agents/AgentConstants.cpp
  engine/Agents/AgentHandle.cpp
  engine/Agents/CameraPart.cpp
  engine/Agents/CompoundAgent.cpp
  engine/Agents/CompoundPart.cpp
  engine/Agents/InputPort.cpp
  engine/Agents/MessageQueue.cpp
  engine/Agents/OutputPort.cpp
  engine/Agents/PointerAgent.cpp
  engine/Agents/PointerAgent_Logic.cpp
  engine/Agents/Port.cpp
  engine/Agents/PortBundle.cpp
  engine/Agents/QuoteFactory.cpp
  engine/Agents/SimpleAgent.cpp
  engine/Agents/UIPart.cpp
  engine/Agents/Vehicle.cpp
  engine/App.cpp
  engine/C2eServices.cpp
  engine/Caos/AgentHandlers.cpp
  engine/Caos/AgentHandlers_Logic.cpp
  engine/Caos/AppHandlers_Logic.cpp
  engine/Caos/AutoDocumentationTable.cpp
  engine/Caos/CAOSDescription.cpp
  engine/Caos/CAOSException.cpp
  engine/Caos/CAOSMachine.cpp
  engine/Caos/CAOSTables.cpp
  engine/Caos/CAOSTables_SubTables.cpp
  engine/Caos/CAOSVar.cpp
  engine/Caos/CompoundHandlers.cpp
  engine/Caos/CreatureHandlers.cpp
  engine/Caos/DebugHandlers.cpp
  engine/Caos/DebugInfo.cpp
  engine/Caos/DisplayHandlers.cpp
  engine/Caos/GeneralHandlers.cpp
  engine/Caos/GeneralHandlers_Logic.cpp
  engine/Caos/HistoryHandlers.cpp
  engine/Caos/HistoryHandlers_Logic.cpp
  engine/Caos/Lexer.cpp
  engine/Caos/MacroScript.cpp
  engine/Caos/MapHandlers.cpp
  engine/Caos/MapHandlers_Logic.cpp
  engine/Caos/OpSpec.cpp
  engine/Caos/Orderiser.cpp
  engine/Caos/PortHandlers.cpp
  engine/Caos/RequestManager.cpp
  engine/Caos/RuntimeErrorDialog.cpp
  engine/Caos/Scriptorium.cpp
  engine/Caos/SoundHandlers.cpp
  engine/Caos/TableSpec.cpp
  engine/Caos/VelocityVariable.cpp
  engine/Classifier.cpp
  engine/CosInstaller.cpp
  engine/Creature/Biochemistry/Biochemistry.cpp
  engine/Creature/Biochemistry/BiochemistryConstants.cpp
  engine/Creature/Biochemistry/Chemical.cpp
  engine/Creature/Biochemistry/Emitter.cpp
  engine/Creature/Biochemistry/NeuroEmitter.cpp
  engine/Creature/Biochemistry/Organ.cpp
  engine/Creature/Biochemistry/Receptor.cpp
  engine/Creature/BodyPartOverlay.cpp
  engine/Creature/Brain/Brain.cpp
  engine/Creature/Brain/BrainComponent.cpp
  engine/Creature/Brain/BrainScriptFunctions.cpp
  engine/Creature/Brain/Dendrite.cpp
  engine/Creature/Brain/Instinct.cpp
  engine/Creature/Brain/Lobe.cpp
  engine/Creature/Brain/Neuron.cpp
  engine/Creature/Brain/SVRule.cpp
  engine/Creature/Brain/Tract.cpp
  engine/Creature/Creature.cpp
  engine/Creature/CreatureHead.cpp
  engine/Creature/ExpressiveFaculty.cpp
  engine/Creature/Faculty.cpp
  engine/Creature/Genome.cpp
  engine/Creature/GenomeStore.cpp
  engine/Creature/History/CreatureHistory.cpp
  engine/Creature/History/HistoryStore.cpp
  engine/Creature/History/LifeEvent.cpp
  engine/Creature/LifeFaculty.cpp
  engine/Creature/LinguisticFaculty.cpp
  engine/Creature/MotorFaculty.cpp
  engine/Creature/MusicFaculty.cpp
  engine/Creature/ReproductiveFaculty.cpp
  engine/Creature/SensoryFaculty.cpp
  engine/Creature/Skeleton.cpp
  engine/Creature/Vocab.cpp
  engine/Creature/voice.cpp
  engine/CreaturesArchive.cpp
  engine/CustomHeap.cpp
  engine/Display/Background.cpp
  engine/Display/BackgroundGallery.cpp
  engine/Display/Bitmap.cpp
  engine/Display/Camera.cpp
  engine/Display/ClonedGallery.cpp
  engine/Display/ClonedSprite.cpp
  engine/Display/CompressedBitmap.cpp
  engine/Display/CompressedGallery.cpp
  engine/Display/CompressedSprite.cpp
  engine/Display/CreatureGallery.cpp
  engine/Display/DrawableObject.cpp
  engine/Display/DrawableObjectHandler.cpp
  engine/Display/EntityImage.cpp
  engine/Display/EntityImageClone.cpp
  engine/Display/EntityImageWithEmbeddedCamera.cpp
  engine/Display/ErrorMessageHandler.cpp
  engine/Display/FastDrawingObject.cpp
  engine/Display/Gallery.cpp
  engine/Display/Line.cpp
  engine/Display/MainCamera.cpp
  engine/Display/MapImage.cpp
  engine/Display/NormalGallery.cpp
  engine/Display/SDL/SDL_DisplayEngine.cpp
  engine/Display/SDL/SDL_ErrorDialog.cpp
  engine/Display/SDL/SDL_FastEntityImage.cpp
  engine/Display/SDL/SDL_Main.cpp
  engine/Display/SDL/SDL_RemoteCamera.cpp
  engine/Display/SharedGallery.cpp
  engine/Display/Sprite.cpp
  engine/Display/System.cpp
  engine/Display/TintManager.cpp
  engine/Display/unix/MemoryMappedFile.cpp
  engine/Entity.cpp
  engine/FilePath.cpp
  engine/FlightRecorder.cpp
  engine/General.cpp
  engine/InputManager.cpp
  engine/Map/CARates.cpp
  engine/Map/Map.cpp
  engine/Map/MapCA.cpp
  engine/Map/RoomCA.cpp
  engine/Maths.cpp
  engine/Message.cpp
  engine/PersistentObject.cpp
  engine/Scramble.cpp
  engine/Sound/MusicAction.cpp
  engine/Sound/MusicAleotoricLayer.cpp
  engine/Sound/MusicEffect.cpp
  engine/Sound/MusicExpression.cpp
  engine/Sound/MusicGlobals.cpp
  engine/Sound/MusicLayer.cpp
  engine/Sound/MusicLoopLayer.cpp
  engine/Sound/MusicManager.cpp
  engine/Sound/MusicScript.cpp
  engine/Sound/MusicTimer.cpp
  engine/Sound/MusicTrack.cpp
  engine/Sound/MusicUpdatable.cpp
  engine/Sound/MusicVariable.cpp
  engine/Sound/MusicVariableContainer.cpp
  engine/Sound/stub/stub_MidiModule.cpp
  engine/Sound/stub/stub_Soundlib.cpp
  engine/Stimulus.cpp
  engine/TimeFuncs.cpp
  engine/World.cpp
  engine/md5.cpp
  engine/mfchack.cpp
  engine/unix/File.cpp
  engine/unix/FileFuncs.cpp
  engine/DebugServer.cpp
)

add_executable(lc2e ${SRC_FILES})

# Include directories
target_include_directories(lc2e PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${SDL2_INCLUDE_DIRS}
    ${ZLIB_INCLUDE_DIRS}
)

# Link libraries
target_link_libraries(lc2e PRIVATE
    SDL2::SDL2
    SDL2_mixer::SDL2_mixer
    ZLIB::ZLIB
    pthread
)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Enable testing and include GoogleTest
include(FetchContent)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

enable_testing()
add_subdirectory(tests)
