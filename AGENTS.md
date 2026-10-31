# Creatures 3 / Docking Station engine port — agent guide

This is the C++11 port of the Creatures 3 / Docking Station engine (`lc2e`)
for Linux and macOS, with embedded browser developer tools and an MCP adapter
so AI agents can observe and control a running world. Game data is
proprietary and never enters Git.

## Layout

| Path | What it is |
|---|---|
| `engine/` | The engine: agents, CAOS VM, creatures (brain, biochemistry, genetics), display, map, sound, `unix/` platform code, `DebugServer*` (tools/MCP API) |
| `common/` | Shared utilities, catalogue and configuration parsing, PRAY file support |
| `tests/` | GoogleTest targets, `stub_*` link seams, `caos/` fixtures, headless integration tiers |
| `tools/` | Browser developer tools served by `lc2e --tools`; `docs/` is the in-app wiki; `tests/` holds Node and Firefox suites |
| `mcp/` | Node.js stdio adapter translating MCP tool calls to the engine REST API |
| `.agents/skills/` | Skills: `caos-mcp`, `developer-tools`, `engine-testing`, `run-creatures-experiment` (`.claude/skills` links here) |
| `.mcp.json` | MCP client configuration for the `creatures3` adapter |

Branches: `main` is the Linux/macOS line. `free_energy_principle_research`
carries the research material and is merged back from `main`. The tag
`macos-legacy` marks the original macOS-only port.

## Build, test, run

```bash
cmake -S . -B build && cmake --build build
ctest --test-dir build --output-on-failure
./build/lc2e -d "/path/to/Docking Station"                      # graphical
./build/lc2e -d "/path/to/Docking Station" --headless --world "Name"   # no display/audio, APIs on
```

Needs CMake 3.10+, a C++11 compiler, SDL2, SDL2_mixer, zlib, pthreads, Node
18+ for the tools tests, Firefox for the browser suites (they skip without
it), and network access on first configure to fetch GoogleTest. Useful
flags: `--world "Name"`, `--gamespeed N`, `--run-cos file`, `--max-ticks N`,
`--tools`, `--mcp`, `--headless`; Ctrl+C shuts a headless engine down
gracefully.

## Skills: read before you act

- Writing or executing CAOS, or using `execute_caos`: `.agents/skills/caos-mcp/SKILL.md`.
- Changing `engine/DebugServer*`, anything in `tools/`, or adding an endpoint, workspace or help entry: `.agents/skills/developer-tools/SKILL.md`.
- Adding a test, fixing a link error in a test target, or running integration tiers: `.agents/skills/engine-testing/SKILL.md`.
- Running a controlled creature experiment: `.agents/skills/run-creatures-experiment/SKILL.md`.
- The in-app wiki under `tools/docs/` is the reference for CAOS, biochemistry, brain and genetics; `tools/TOOLS.md` documents the tools UI and REST API; `mcp/MCP.md` documents the adapter.

## Live engine access

`--tools` serves the browser UI and REST/SSE API on `http://localhost:9980`;
`--mcp` serves the API only; `--headless` enables both. The server binds
loopback; `--allow-remote-tools` adds token-protected remote access. Run one
instrumented engine at a time, because the port is shared.

The MCP adapter needs a one-time `cd mcp && npm install`. `.mcp.json` points
clients at it; the engine must already be running. Prefer the MCP tools over
raw REST for inspection and control. Pause, inspect, resume deliberately and
never leave a world paused. Use an isolated game-data copy or a disposable
world for anything that mutates state: CAOS, world saves, chemical
interventions and genome writes are real and cannot be undone.

Read the `Eat elevator bug fix` section of `README.md` before changing
targetless `APPR`, linked-room CA navigation or smell recovery.

## Code and documentation conventions

- Match the surrounding legacy style; engine files use tabs, newer tests two
  spaces. Classes and public methods are `PascalCase`; GoogleTests follow
  `TEST(ComponentTest, DescribesBehavior)`. No repository-wide formatter.
- Pair headers with implementations and register new engine `.cpp` files in
  the root `CMakeLists.txt`; register tests in `tests/CMakeLists.txt`.
- Every behaviour change gets focused regression coverage. Isolate
  singleton-heavy logic in `*_Logic.cpp` behind the existing fake interfaces.
- Polled tools panels update through `DomPatch` with delegated listeners.
- Tools values are labelled Observed, Derived, Inferred or Unknown; keep that
  boundary. The legacy `health` field is glycogen reserve, not health.
- Documentation lives next to what it describes: agent guidance here and in
  skills, product documentation in `tools/docs/`, user setup in `README.md`.
  Do not add roadmap, hand-off or status documents to the repository.

## Commits and pull requests

Concise imperative subjects (`Fix POSIX file copying`); `fix:` and `docs:`
prefixes are also in use. Keep commits focused. A PR explains the problem,
the implementation, the platforms exercised and the exact test results, and
links issues. Never attach game assets, saves, worlds, genomes or creature
exports.
