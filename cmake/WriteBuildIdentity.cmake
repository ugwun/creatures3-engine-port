# Runs on every build, not just at configure time: a manifest that names an
# old revision is worse than one that names none. Rewrites the header only
# when the identity changes, so an unchanged tree recompiles nothing.
#
# Inputs: SOURCE_DIR, OUTPUT, GIT_EXECUTABLE (may be empty).
set(IDENTIFIER "source-unknown")
if(GIT_EXECUTABLE)
  execute_process(
    COMMAND ${GIT_EXECUTABLE} rev-parse --short=12 HEAD
    WORKING_DIRECTORY ${SOURCE_DIR}
    OUTPUT_VARIABLE REVISION
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
  )
  if(REVISION)
    set(IDENTIFIER "${REVISION}")
    execute_process(
      COMMAND ${GIT_EXECUTABLE} diff --quiet --ignore-submodules HEAD
      WORKING_DIRECTORY ${SOURCE_DIR}
      RESULT_VARIABLE DIRTY
      ERROR_QUIET
    )
    if(NOT DIRTY EQUAL 0)
      string(APPEND IDENTIFIER "-dirty")
    endif()
  endif()
endif()

set(CONTENT "#define C3_ENGINE_BUILD_IDENTIFIER \"${IDENTIFIER}\"\n")
set(CURRENT "")
if(EXISTS "${OUTPUT}")
  file(READ "${OUTPUT}" CURRENT)
endif()
if(NOT CURRENT STREQUAL CONTENT)
  file(WRITE "${OUTPUT}" "${CONTENT}")
endif()
