---
name: developer-tools
description: >
  Architecture and extension rules for the embedded Developer Tools: the
  DebugServer HTTP/SSE server inside lc2e, its main-thread work queue, the
  browser Observatory modules under tools/, contextual help, the CAOS
  breakpoint mechanism, and the genetics endpoints. Read this before changing
  engine/DebugServer.cpp, anything in tools/, or adding an API endpoint,
  workspace, or help entry.
---

# Developer Tools — Architecture and Extension Guide

The developer tools are an **embedded HTTP server** inside the `lc2e` binary,
started by `--tools` (UI plus API) or `--mcp` (API only). Static files, the
REST API and the live log stream all share port 9980. There is no Node
process on the engine side; `mcp/server.js` is a separate stdio adapter that
talks to the same REST API.

```
FlightRecorder → UDP :9999 → DebugServer (in-process) → SSE :9980 → Browser / MCP adapter
```

## Threading model (the one rule that matters)

The engine is single-threaded. All engine state (agents, scripts, world,
genomes, files) must only be touched from the main thread.

1. `httplib::Server` runs in a background `std::thread` started by
   `DebugServer::Start()`. It serves static files, API routes and the SSE
   endpoint `/api/events`.
2. A handler that needs engine state creates a `WorkItem`
   (`std::function<std::string()> work` + `std::promise<std::string>`),
   pushes it on the mutex-protected queue and blocks on the future with a
   timeout.
3. `DebugServer::Poll()` runs once per game tick from the main loop in
   `engine/Display/SDL/SDL_Main.cpp`. It drains the queue, runs each
   `work()` on the main thread and fulfils the promise.
4. SSE log streaming keeps a bounded buffer with monotonically increasing IDs;
   clients reconnect with `Last-Event-ID` and receive what they missed.

**Any endpoint that reads or modifies engine state must go through the work
queue.** Only static file serving and the SSE endpoint run directly on the
HTTP thread. A blocked handler times out with HTTP 504 rather than touching
state from the wrong thread.

Engine-side files:

| File | Purpose |
|---|---|
| `engine/DebugServer.h` | Public API: `AllowRemoteAccess()`, `Start(port, staticDir)`, `Start(port)`, `Poll()`, `Stop()`, `IsRunning()` |
| `engine/DebugServer.cpp` | All HTTP routes, work queue, SSE buffer, UDP log relay (large; search by route path) |
| `engine/DebugServerLogic.{h,cpp}`, `engine/DebugServerWork.h` | Pure helpers and the `WorkItem` type, covered by `tests/test_DebugServerLogic.cpp` |
| `engine/Display/SDL/SDL_Main.cpp` | Flag parsing, tools directory resolution, `Start()` / `Poll()` / `Stop()` hooks |
| `engine/contrib/httplib.h`, `engine/contrib/json.hpp` | Vendored cpp-httplib and nlohmann/json (header-only) |
| `engine/Creature/Brain/{Brain,Lobe,Tract}.h` | Public accessors added for the brain API |

Tools directory resolution for `--tools`: an explicit `--tools /path`
override, else `<executable dir>/../tools` (`_NSGetExecutablePath` on macOS,
`/proc/self/exe` on Linux), else `./tools` relative to the working
directory. Keep the binary and `tools/` at the same revision.

Access: the server binds `127.0.0.1`, sends no CORS headers and rejects
foreign `Host` headers. `--allow-remote-tools` listens on all interfaces and
requires a bearer token (`LC2E_TOOLS_TOKEN`) for non-local requests.

## Adding an API endpoint

Register the route inside `DebugServer::Start()` in `engine/DebugServer.cpp`:

```cpp
myImpl->svr.Get("/api/newtool", [this](const httplib::Request& req, httplib::Response& res) {
    auto* item = new WorkItem();
    item->work = []() -> std::string {
        // Engine state is safe to read here: this runs on the main thread.
        return "{\"result\": \"...\"}";
    };
    auto future = item->promise.get_future();
    {
        std::lock_guard<std::mutex> lock(myImpl->queueMutex);
        myImpl->workQueue.push(item);
    }
    if (future.wait_for(std::chrono::seconds(5)) == std::future_status::ready) {
        res.set_content(future.get(), "application/json");
    } else {
        res.status = 504;
        res.set_content("{\"error\":\"Timeout\"}", "application/json");
    }
});
```

Then document the endpoint in `tools/docs/api_reference.md` (the single API
reference, served in the in-app wiki), add it to the endpoint index in
`tools/TOOLS.md`, and add a model test or `test_DebugServerLogic` case for any
pure logic you extract. Endpoints that
mutate state follow the existing contracts: world/tick review, checksum
binding, explicit confirmation, and refusal on stale targets instead of
silent retargeting. Read the existing `/api/caos/*` and `/api/genetics/*`
handlers as the pattern.

CAOS execution (`/api/execute`, `/api/caos/evaluate`) compiles with
`Orderiser::OrderFromCAOS()`, runs a fresh `CAOSMachine` with `NULLHANDLE`
as owner, redirects output with `SetOutputStream()`, runs `UpdateVM(-1)` to
completion and catches `CAOSMachine::RunError`. Console CAOS must therefore
be non-blocking: no `wait`, `over`, or yielding iteration without `inst`.

## Browser side: module layout

Everything under `tools/` is plain ES5-compatible JavaScript loaded by
`tools/index.html` in a fixed order. There is no bundler and no package
install. Feature modules are IIFEs; pure models export through a small
UMD wrapper so Node tests can `require()` them without a DOM.

Load order and ownership (see the `<script>` list at the end of `index.html`):

1. `utils.js` (`escHtml`, `DevToolsEvents` pub/sub), `dom_patch.js`,
   `observatory_state.js`, `observatory_navigation.js`.
2. Pure models: `accessibility_model`, `contextual_help_model`,
   `architecture_model`, `biological_semantics`, `biological_series`,
   `creature_observation`, `ethology_timeline`, `comparison_model`,
   `ecology_model`, `experiment_model`, `chemical_intervention_model`,
   `genetics_experiment_model`, `caos_workbench_model`,
   `observatory_dashboard_model`.
3. `marked.min.js` (wiki Markdown), `caos_format.js`, `tooltips.js`,
   `provenance_transport.js`, then `app.js` (shell, navigation, simulation
   controls), `contextual_help.js`, `accessibility.js`.
4. Workspace controllers, each after its model: dashboard, logs, console,
   scripts, debugger, creatures and observation strip, timeline, compare,
   ecology, experiments, brain, organs, genome, CAOS IDE, docs, genetics.

Pure models hold no DOM and no transport; controllers own transport calls and
rendering. Keep that split so a change stays testable in Node.

### Shared state: `ObservatoryState`

`observatory_state.js` owns facts that must agree across workspaces:
connection and pause state, current world identity, ticks, speed and load
transition, shared selections, the bounded sample cache, and the recording,
experiment, intervention, navigation and display-preference contracts.
Changes are actions reduced into deeply frozen snapshots; modules subscribe
with a selector. World-scoped identities are `worldName:localId`; a load
transition, world change or disconnect invalidates them centrally, and
samples from an old world or older tick are rejected. Controllers pass
loaders to `ObservatoryState.requestShared()`, which deduplicates concurrent
requests. The store never starts its own polling loop. Contract:
`tools/docs/observatory_state.md`.

### Navigation and routes

`observatory_navigation.js` defines `NAVIGATION_GROUPS` (Observe,
Experiment, Develop, Learn) and `ROUTE_DEFINITIONS`. Each route names its
group, the `#tab-<tab>` panel it opens, a view, label, description, activity,
required `capabilities` (`connected`, `world`, `creature`, ...) and its help
document. `app.js` renders the left navigation from these definitions. Deep
links use `#observe?route=<id>&tab=<tab>` and may carry world, selection and
`at`/`from`/`to` tick context; legacy flat hashes such as `#creatures` remain
aliases in `LEGACY_ROUTE_ALIASES`.

### Polling and DOM patching

Controllers poll only while their workspace is visible (`tab:activated` /
`tab:deactivated` on `DevToolsEvents`), never on initial load. Panels that
re-render from polled data must update through `DomPatch` with delegated
listeners and `data-patch-key` on rows that can move, or a refresh discards
what the user was doing (open disclosures, focus, typed text, scroll).
Late responses from an old world or selection must be rejected with a serial
guard.

### Evidence vocabulary

Values are labelled **Observed** (direct endpoint read), **Derived**
(calculated), **Inferred** (interpretation) or **Unknown** (missing capture
metadata). Keep that boundary in new UI and documentation. The legacy
`health` field is glycogen reserve (chemical 4), not overall health. The tools
do not prove why a creature acted and cannot undo an applied world, genome or
chemical change.

## Adding a workspace or a control

1. Add a route to `ROUTE_DEFINITIONS` in `observatory_navigation.js` with its
   group, tab, capabilities and help document.
2. Add the `#tab-<tab>` panel markup to `tools/index.html` and a `<script>` tag
   in the right position of the load order.
3. Put logic that can run without a DOM into a `*_model.js` with a
   `tools/tests/<name>.test.cjs` Node test.
4. Register help (below) and add the route to the published route map in
   `tools/docs/observatory_navigation_dashboard.md`; the release readiness test
   checks that every live route is documented.
5. Add a Firefox interaction test under `tools/tests/browser/` if the
   workspace has user interaction, and run the full Node suite.

## Contextual help and documentation

`contextual_help_model.js` is the authoritative help registry. Every entry
has a stable ID (`route.<id>`, `field.`, `panel.`, `action.`), meaning,
activity, evidence source and cadence, caution, guide/reference targets,
terminology and a review owner. Static targets declare `data-help-id`; a
definition may own a CSS `selector` that `contextual_help.js` applies to
existing and future nodes through a `MutationObserver`. F1 opens the
non-modal drawer, Escape closes it, Tab is never intercepted.

To add help:

1. Write or extend the Markdown in `tools/docs/` and register new pages in
   `tools/docs/index.json`.
2. Add a complete definition to `contextual_help_model.js`.
3. Add `data-help-id` to a static target or a registry selector for a dynamic
   one.
4. Add the ID and owner to `tools/docs/contextual_help_inventory.md`.
5. Run `node --test tools/tests/*.test.cjs`; `documentation_integrity` rejects
   missing files or sections, stale routes and inventory drift.

`tooltips.js` provides optional short hover/focus tips (`aria-describedby`);
register durable help first and add a tip only when it helps scanning.
Editorial rules: `tools/docs/contextual_help_authoring.md`. Tips are
`{ selector, text }` entries in the `TIPS` array, matched by walking up from
the hovered node so dynamic elements work; hover waits 500 ms with 120 ms
fades, the tooltip flips and clamps to stay in the viewport, and native
`title` attributes on the hovered chain are suppressed while a tip is shown
and restored on mouse-out. The **💡 Tips** preference persists in
`localStorage`.

The in-app wiki (`tools/docs/*.md`, `index.json`) is product documentation
rendered by `docs.js` with the vendored `marked.min.js`: pages load without a
reload, internal `.md` links are intercepted by the router, heading IDs are
URL-safe slugs of the heading text, the table of contents is built from
`h2`/`h3`, and `#observe?route=guides&tab=docs&view=wiki&doc=<file>` (or the
legacy `#docs/<file>[:slug]`) deep-links a page or section.
`architecture_model.js` is maintained documentation of components and
relationships, not a runtime call graph; its Node test checks every declared
source path and documentation target.

## CAOS breakpoints

`CAOSMachine` keeps `std::set<int> myBreakpoints`, `bool myDebugStepOnce` and
`int myDebugStepOverDepth`. The check runs at the top of the `UpdateVM()`
dispatch loop:

1. In `stateBreakpoint`: return immediately, VM stays paused, agent tick
   continues.
2. IP in `myBreakpoints` and not stepping: enter `stateBreakpoint`.
3. `myDebugStepOnce`: clear it, run one op, re-enter `stateBreakpoint`.
4. Step-over: while stack depth exceeds `myDebugStepOverDepth`, keep stepping.

Endpoints: `POST /api/breakpoint` (set, clear, clearAll), `POST
/api/step/:agentId` (into or over), `POST /api/continue/:agentId`, `GET
/api/agent/:id` (source, breakpoints, context, OVxx and VAxx).

## Genetics endpoints

`GET /api/genetics/files`, `GET /api/genetics/file/:name`, and POST `copy`,
`crossover`, `save`, `save-experiment`, `rename`, `delete/:name`, `inject`.
All of them execute through the work queue. Originals are read-only; every
write is copy-first, no-overwrite, checksum-checked against the last read,
and rolled back if metadata cannot be committed. A `.gxp.json` sidecar is
trusted only when schema, derived filename, algorithm and checksum match the
binary. Injection takes identity/checksum review fields, not gene content
from the browser.

Layers: `tools/genetics.js` (browser state, editing, diff, crossover modal,
`fetch()` only) → `/api/genetics/*` in `DebugServer.cpp` → `Genome`
(`ReadFromFile`/`WriteToFile`, `Cross`/`CrossLoop`) and `GenomeStore`
(slots, monikers, history events) → the CAOS construction path.

**Two mirrored binary codecs live in `DebugServer.cpp`.** The reader
(`parseGenomeFileToJson`) validates the `dna3` header, walks `gene`/`gend`
markers, reads the 8-byte gene header, and dispatches on type/subtype;
48-byte SVRule buffers go through `decompileSVRuleByBytes()`. The writers in
the save handlers emit `dna3`/`gene`/`gend` with `writeU8`, `writeU16BE` and
`writeFloat8`, omitting genes with `active:false`. There is no shared schema:
any change to a gene layout in `engine/Creature/Genome.cpp` must be applied to
both codecs by hand, or saved files corrupt and displays lie. The byte layout
itself is documented in `tools/docs/genome_deep_dive.md`.

Injection copies the reviewed binary to a private collision-free template,
then runs this macro on the main thread (creature mode; egg mode spawns a
`3 4 1` egg agent, sets `ov01` to the sex, and applies egg physics and an
incubation timer instead):

```caos
new: simp 1 1 1 "blnk" 1 0 0      * temporary genome carrier
gene load targ 1 "<template>"     * GENE LOAD needs an agent to own the slot
setv va00 unid
new: crea 4 targ 1 <sex> 0        * AgentManager::CreateCreature from slot 1
born                              * LifeFaculty::SetProperlyBorn + history events
accg game "c3_creature_accg"      * creature physics as in creatureBreeding.cos
attr game "c3_creature_attr"
bhvr game "c3_creature_bhvr"
perm game "c3_creature_perm"
seta va01 targ
targ agnt va00
kill targ                         * drop the carrier
targ va01
mvsf 1000 8900                    * nearest valid floor in the Norn Meso
```

Without the explicit `accg`/`attr`/`bhvr`/`perm` the creature inherits agent
defaults (`accg` 0.3) and floats. Because `CAOSMachine` clears `TARG` when
the script ends, the handler diffs the agent map before and after the macro to
find the new agent, removes the template, and reports the engine-generated
live moniker. Using the same `GENE LOAD`, `NEW: CREA` and `BORN` path as the
game's own hatching keeps injected creatures authentic in the in-game panels
and history.

## Design system (Bright-Fi)

Off-white `#F2F0EC` panels, black header and 1–2 px solid black borders with
no rounded corners, hazard orange `#FF5F00` primary accent, magenta
`#FF00FF` secondary, category colours for error/network/world/CAOS rows. UI
labels use Inter 800–900 uppercase with wide tracking; code uses JetBrains
Mono. All styling lives in `tools/style.css`; reuse its CSS variables.

## Verifying a tools change

```bash
node --test tools/tests/*.test.cjs                                   # models and documentation integrity
node --test --test-concurrency=1 tools/tests/browser/*.browser.cjs   # real Firefox at 1530×840, synthetic engine
ctest --test-dir build -L tools --output-on-failure                  # the same through CTest
```

Browser suites skip themselves when Firefox is absent. To run the mutating
workflow suite against a live engine, use a disposable game-data copy and set
`OBSERVATORY_URL=http://127.0.0.1:9980/ OBSERVATORY_ALLOW_CHANGES=1`.
Regenerate wiki screenshots with `node tools/tests/browser/capture_docs.cjs`.
