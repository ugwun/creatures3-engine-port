# Repository Guidelines

## Project Structure & Module Organization

`engine/` contains the C++11 engine (agents, CAOS, creatures, display, map, sound, and Unix code); shared utilities and PRAY support live in `common/`. Tests and link seams are under `tests/`. `tools/` is the browser developer UI embedded by `lc2e`; `mcp/` is the Node.js MCP-to-REST adapter. Research material lives in `free_energy_principle_experiment/`. Game data is proprietary and must remain outside Git.

## Build, Test, and Run

From the repository root:

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
./build/lc2e -d "/path/to/Docking Station"
```

CMake requires SDL2, SDL2_mixer, Zlib, pthreads, and network access on first configure to fetch GoogleTest. Use `--world "Name"` to load a world directly, `--gamespeed N` to alter speed, and Ctrl+C for graceful headless shutdown.

## Developer Tools & MCP Runtime

Read the [`Eat elevator bug fix`](README.md#eat-elevator-bug-fix) section before changing targetless `APPR`, linked-room CA navigation, or smell recovery.

Use an isolated game-data copy or disposable world for experiments; developer tools can execute CAOS, save worlds, and modify or delete user genomes.

```bash
# Browser UI plus REST/SSE API
./build/lc2e -d "/path/to/Docking Station" --tools
# REST/SSE API only
./build/lc2e -d "/path/to/Docking Station" --mcp
# No display/audio; also enables tools and MCP APIs
./build/lc2e -d "/path/to/Docking Station" --headless --world "Test World"
```

All modes expose the engine API on `http://localhost:9980`, bound to loopback; pass `--allow-remote-tools` for token-protected access from other machines. Run only one instrumented engine at a time. `--tools` also serves the seven-tab UI at that URL and needs no Node process. Its static files resolve from `<executable>/../tools`, then `./tools`; override with `--tools /absolute/path`.

MCP requires Node.js 18+ and a one-time `cd mcp && npm install`. Configure the client for stdio with command `node`, argument `/absolute/path/to/repo/mcp/server.js`, and optional `ENGINE_URL` (default `http://127.0.0.1:9980`) and `ENGINE_TOKEN` (remote engines only). The client spawns this adapter; starting `lc2e --mcp` alone does not create the stdio process. Prefer MCP tools for live inspection/control rather than calling REST directly. Read `mcp/MCP.md`, `tools/TOOLS.md`, and `.agents/skills/caos-mcp/SKILL.md` before issuing CAOS. Pause, inspect, and resume deliberately; do not leave the world paused.

## Coding Style & Naming Conventions

Match the surrounding legacy style and avoid unrelated formatting. Engine files commonly use tabs; newer tests use two spaces. Classes and public methods use `PascalCase`; GoogleTests follow `TEST(ComponentTest, DescribesBehavior)`. Pair headers/implementations and register new engine `.cpp` files in root `CMakeLists.txt`. No repository-wide formatter is enforced.

## Testing Guidelines

Add focused GoogleTest regression coverage for behavior changes. Prefer pure unit tests; isolate singleton-heavy behavior in `*_Logic.cpp` and use existing fake interfaces or `tests/stub_*`. Register tests in `tests/CMakeLists.txt`.

Developer Tools changes need more than model tests. `ctest` also runs `tools/tests/*.test.cjs` and the real Firefox suites in `tools/tests/browser/`, which click at the 1530×840 notebook viewport against a synthetic engine. Polled panels must update through `DomPatch` with delegated listeners, or a refresh undoes what the user is doing. To run the mutating workflows, point them at a live engine on a disposable data copy:

```bash
OBSERVATORY_URL=http://127.0.0.1:9980/ OBSERVATORY_ALLOW_CHANGES=1 \
  node --test --test-concurrency=1 tools/tests/browser/workflows.browser.cjs
```
 Integration tests require proprietary data, including the sibling `Creatures 3` folder for docked worlds, and must run serially because port 9980 is shared:

```bash
cmake -S . -B build -DENABLE_INTEGRATION_TESTS=ON
CREATURES_GAME_DIR="/path/to/Docking Station" ctest --test-dir build -L integration --output-on-failure
```

## Commit & Pull Request Guidelines

Use concise imperative subjects such as `Fix POSIX file copying`; `fix:` and `docs:` prefixes are also established. Keep commits focused. PRs should explain the problem, implementation, platforms, and exact test results; link issues and add screenshots for UI changes. Never attach assets, saves, worlds, or creature/genome data.
