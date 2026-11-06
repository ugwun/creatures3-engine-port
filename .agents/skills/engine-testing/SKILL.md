---
name: engine-testing
description: >
  How to run and write tests for the C++ engine: the GoogleTest unit suite,
  the dependency-injection logic-layer pattern (*_Logic.cpp with IApp,
  IWorldServices, IMap fakes), the tests/stub_* link seams, and the headless
  integration tiers that need proprietary game data. Read this before adding
  a test, when a new test target fails to link, or before running integration
  tests.
---

# Engine Testing

```bash
cmake -S . -B build && cmake --build build          # builds lc2e and every test target
ctest --test-dir build --output-on-failure          # unit tests, Node model tests, Firefox tests
ctest --test-dir build -LE integration              # explicitly without integration tiers
ctest --test-dir build -R test_Genome               # one GoogleTest target
```

GoogleTest is fetched by CMake on first configure. Test targets live in
`tests/` and are registered in `tests/CMakeLists.txt`. Developer-tools tests
are covered in the `developer-tools` skill.

## Two unit-test patterns

**A. Pure unit test.** The component has no engine dependencies
(`Vector2D`, `Maths`, `SimpleLexer`). Include the header, link the `.cpp`,
done.

**B. Dependency-injected logic layer.** The component calls a large singleton
(`theApp`, `theWorld`, `theMap`). Do not mock the singleton. Extract a narrow
interface and a static function in a `*_Logic.cpp` file that both `lc2e` and
the test link:

```cpp
// MyHandlers_Logic.cpp — links into lc2e and test_MyHandlers
void MyHandlers::DoThing(IApp& app, int x) {
    app.RequestSave();
}

// MyHandlers.cpp — production handler, no test dependency
void MyHandlers::Command_THING(CAOSMachine& vm) {
    int x = vm.FetchIntegerRV();
    DoThing(theApp, x);
}
```

Existing interfaces and doubles: `IApp` (`engine/IApp.h`, fake in
`tests/stub_FakeApp.h`), `IWorldServices` (`engine/IWorldServices.h`,
no-op base `tests/stub_NullWorldServices.h`), `IMap` (`engine/IMap.h`,
`tests/stub_NullMap.h`), `IAgentManager` (`engine/IAgentManager.h`,
`tests/stub_NullAgentManager.h`).

## Adding a test target

1. Create `tests/test_YourComponent.cpp` using
   `TEST(ComponentTest, DescribesBehavior)`.
2. Register it in `tests/CMakeLists.txt`:

```cmake
add_executable(test_YourComponent
  test_YourComponent.cpp
  ../engine/YourComponent.cpp          # file under test
  ../engine/PersistentObject.cpp       # transitive deps as needed
)
target_include_directories(test_YourComponent PRIVATE
  ${CMAKE_SOURCE_DIR} ${CMAKE_SOURCE_DIR}/common ${CMAKE_SOURCE_DIR}/engine
)
target_link_libraries(test_YourComponent PRIVATE GTest::gtest_main)
gtest_discover_tests(test_YourComponent)
```

3. Add any new `*_Logic.cpp` to `set(SRC_FILES ...)` in the root
   `CMakeLists.txt` so `lc2e` links it too.
4. Rebuild and run `ctest --test-dir build -R test_YourComponent`.

## Breaking the App / SDL dependency chain

Many engine files transitively include `App.h` or SDL headers. The
`tests/stub_*.cpp` and `stub_*.h` files are no-op link seams; add the ones
you need to the executable's source list instead of the real `.cpp`:

| Stub | Provides |
|---|---|
| `stub_AgentHandle.cpp` | `NULLHANDLE`, empty `AgentHandle` methods, minimal `App::GetZLibCompressionLevel()` |
| `stub_App.cpp` | Minimal `App` surface |
| `stub_CreaturesArchive.cpp` | No-op `CreaturesArchive::Read/Write` primitives |
| `stub_Orderiser.cpp`, `stub_Lexer.cpp` | No-op compiler pieces used by `MacroScript` serialisation |
| `stub_FilePath.cpp`, `stub_File.cpp` | Path handling and file I/O without the filesystem |
| `stub_ErrorMessageHandler.cpp`, `stub_Catalogue.cpp` | Silence error output and catalogue lookups |
| `stub_GenomeDeps.cpp` | Extra `Genome.cpp` link dependencies |
| `stub_InputManager.cpp` | `InputManager` without `App.h` / `C2eServices.h` |
| `stub_HistoryStore.cpp`, `stub_CreatureHistory.cpp`, `stub_V39_CreatureHistory.cpp` | History serialisation seams |
| `stub_General.cpp` | Misc free functions |

If the linker reports an undefined symbol for a method the test never calls,
add a one-line no-op to the nearest existing stub rather than a new stub
file. To list missing symbols:

```bash
cmake --build build 2>&1 | grep -E "undefined reference|referenced from" | sort -u
```

`_CAOSDEBUGGER` is defined through `target_compile_definitions` for any test
that compiles `Classifier.cpp` or `Scriptorium.cpp`; do not `#define` it in
test sources.

## Integration tiers (need game data)

Integration tests launch the real `lc2e` in `--headless` mode and drive it
over the REST API on port 9980. They are off by default and skip with
`GTEST_SKIP()` when `CREATURES_GAME_DIR` is unset.

```bash
cmake -S . -B build -DENABLE_INTEGRATION_TESTS=ON && cmake --build build
CREATURES_GAME_DIR="/path/to/Docking Station" \
  ctest --test-dir build -L integration --output-on-failure
```

| Tier | Scope | Data copied to a temp dir |
|---|---|---|
| 1 | Engine lifecycle, REST API, CAOS execution | `machine.cfg`, `user.cfg`, `Catalogue/`, `Backgrounds/`, `Images/` |
| 2 | Tick control, game variables, scriptorium, save/reload | as Tier 1 |
| 3 | Docked world, agents, map, COS scripts | `Startup` template copied inside the original game dir; needs the sibling `Creatures 3` folder |
| 4 | Creature lifecycle, biochemistry, neural networks, export and import | as Tier 3; the round trip deletes its own export file afterwards |
| 5 | Long-running stability and stress | as Tier 3 |

Each test forks `lc2e`, waits for the API, asserts on JSON responses, sends
`SIGTERM` and removes its temp directory. Tiers run serially because the
port is shared; never run them next to another instrumented engine. The
four-Norn fixture `tests/caos/inject_four_norns.cos` is the canonical cohort
for behavioural experiments (see the `run-creatures-experiment` skill).

## Conventions

- Add focused regression coverage for every behaviour change; a bug fix
  without a failing-then-passing test is incomplete.
- Prefer pattern A; reach for pattern B before touching a singleton directly.
- Keep the legacy tab indentation in engine files and two spaces in new
  tests.
- Never commit game data, worlds, genomes or creature exports, even as test
  fixtures.
