"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("../observatory_state.js");
const {
  buildRouteHref,
  parseRouteHash,
  buildContextSegments,
  routeForDefinition,
  definitionForRoute,
  routeAvailability,
  extractLogContext,
  createNavigationService,
  normalizeRoute
} = require("../observatory_navigation.js");

function connectedWorld(store, name = "Alpha") {
  store.dispatch({
    type: "world/sync",
    payload: { worldName: name, worldTick: 17, systemTick: 21, gameSpeed: 1 }
  });
}

function mockBrowser() {
  const stack = [{ state: null, href: "http://localhost:9980/" }];
  let index = 0;
  const listeners = new Map();
  const location = {
    href: stack[0].href,
    hash: ""
  };

  function setLocation(href) {
    location.href = href.startsWith("#")
      ? "http://localhost:9980/" + href
      : href;
    const hashIndex = location.href.indexOf("#");
    location.hash = hashIndex < 0 ? "" : location.href.slice(hashIndex);
  }

  const history = {
    get state() { return stack[index].state; },
    replaceState(state, _title, href) {
      const nextHref = href || stack[index].href;
      stack[index] = { state, href: nextHref };
      setLocation(nextHref);
    },
    pushState(state, _title, href) {
      stack.splice(index + 1);
      stack.push({ state, href });
      index += 1;
      setLocation(href);
    },
    back() {
      if (index === 0) return;
      index -= 1;
      setLocation(stack[index].href);
      const listener = listeners.get("popstate");
      if (listener) listener({ state: stack[index].state });
    },
    forward() {
      if (index >= stack.length - 1) return;
      index += 1;
      setLocation(stack[index].href);
      const listener = listeners.get("popstate");
      if (listener) listener({ state: stack[index].state });
    }
  };
  const window = {
    history,
    location,
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  return { window, history, location };
}

test("route links round-trip stable contextual identifiers", () => {
  const href = buildRouteHref({
    tab: "debugger",
    view: "script",
    worldKey: "Alpha",
    primary: "script",
    selections: {
      agent: {
        id: 42,
        family: 4,
        genus: 1,
        species: 2,
        gallery: "norn"
      },
      script: { id: "42:4:1:2:9" },
      event: { id: 9 }
    }
  });
  const route = parseRouteHash(href);

  assert.equal(route.tab, "debugger");
  assert.equal(route.worldKey, "Alpha");
  assert.equal(route.selections.agent.id, 42);
  assert.deepEqual(route.selections.agent.details, {
    family: 4,
    genus: 1,
    species: 2,
    gallery: "norn"
  });
  assert.equal(route.selections.script.id, "42:4:1:2:9");
  assert.equal(route.selections.event.id, 9);
  assert.equal(buildRouteHref(route), href);
});

test("legacy documentation hashes become internal Docs routes", () => {
  const route = parseRouteHash("#docs/shared_context_navigation.md:deep-links");
  assert.equal(route.tab, "docs");
  assert.equal(route.view, "wiki");
  assert.equal(route.document, "shared_context_navigation.md");
  assert.equal(route.section, "deep-links");
});

test("declarative intent routes expose risk, help, and capabilities", () => {
  const store = createStore();
  let availability = routeAvailability("chemicals", store.getState());
  assert.equal(availability.available, false);
  assert.deepEqual(availability.missing, [
    "engine connection", "loaded world", "selected creature"
  ]);

  connectedWorld(store);
  store.dispatch({
    type: "connection/status",
    payload: { status: "connected" }
  });
  store.select("creature", 42, { name: "Ada" }, true);
  availability = routeAvailability("chemicals", store.getState());
  assert.equal(availability.available, true);

  const route = routeForDefinition("chemicals", store.getState());
  const definition = definitionForRoute(route);
  assert.equal(route.tab, "creatures");
  assert.equal(route.view, "chemistry-intervene");
  assert.equal(route.selections.creature.id, 42);
  assert.equal(definition.activity, "reviewed-change");
  assert.equal(definition.help, "safe_chemical_interventions.md");
});

test("meaningful routes preserve time context and migrate legacy hashes", () => {
  const route = {
    routeId: "timeline",
    tab: "timeline",
    worldKey: "Alpha",
    time: {
      timebase: "worldTicks",
      cursorTick: 720,
      startTick: 600,
      endTick: 750
    }
  };
  const href = buildRouteHref(route);
  assert.match(href, /route=timeline/);
  assert.match(href, /at=720/);
  assert.deepEqual(parseRouteHash(href).time, route.time);
  assert.equal(parseRouteHash("#console").routeId, "scratchpad");
  assert.equal(parseRouteHash("#console").tab, "console");
});

test("architecture trace identifiers survive deep-link round trips", () => {
  const href = buildRouteHref({
    routeId: "architecture",
    tab: "docs",
    view: "graph",
    worldKey: "Alpha",
    trace: "creature.chemical",
    selections: { creature: { id: 42 } },
    time: { startTick: 600, endTick: 750 }
  });
  assert.match(href, /trace=creature.chemical/);
  const route = parseRouteHash(href);
  assert.equal(route.trace, "creature.chemical");
  assert.equal(route.selections.creature.id, 42);
  assert.equal(buildRouteHref(route), href);
});

test("context segments identify the primary and historical selections", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42, { name: "Ada", genusName: "Norn" }, true);
  store.select("agent", 42, { missing: true, missingReason: "Agent died" });

  const segments = buildContextSegments(store.getState());
  assert.deepEqual(segments.map(segment => segment.kind), [
    "world", "creature", "agent"
  ]);
  assert.equal(segments[1].label, "Norn “Ada”");
  assert.equal(segments[1].primary, true);
  assert.equal(segments[2].missing, true);
  assert.match(segments[2].title, /Agent died/);
});

test("context segments expose preserved world-tick ranges", () => {
  const store = createStore();
  connectedWorld(store);
  const segments = buildContextSegments(store.getState(), {
    tab: "timeline",
    time: { startTick: 100, endTick: 180 }
  });
  assert.equal(segments.at(-1).kind, "time");
  assert.equal(segments.at(-1).label, "Ticks 100–180");
  assert.match(segments.at(-1).title, /worldTicks/);
});

test("navigation defaults to the dashboard landing route", () => {
  const store = createStore();
  const browser = mockBrowser();
  const navigation = createNavigationService({
    store,
    window: browser.window
  });
  navigation.start();
  assert.equal(navigation.getActiveTab(), "dashboard");
  assert.equal(navigation.getCurrentRoute().routeId, "dashboard");
  assert.match(browser.location.hash, /route=dashboard/);
});

test("structured agent and script identifiers are derived from engine error logs", () => {
  const context = extractLogContext(
    "Runtime error in agent 3 4 3 script 3 4 0 9 unique id 4309",
    "17:8"
  );
  assert.equal(context.agentId, 4309);
  assert.equal(context.event, 9);
  assert.deepEqual(context.selections.agent, {
    id: 4309,
    family: 3,
    genus: 4,
    species: 3
  });
  assert.equal(context.selections.script.id, "4309:3:4:0:9");
  assert.equal(context.selections.logRecord.id, "17:8");
  assert.equal(extractLogContext("ordinary engine message"), null);
});

test("structured log metadata wins and modern prose is not parsed", () => {
  const context = extractLogContext({
    id: "stream:8",
    message: "ordinary modern record",
    legacy: false,
    worldTick: 72,
    correlationId: "pause-4",
    agent: { id: 25, family: 4, genus: 1, species: 2 },
    script: { family: 4, genus: 1, species: 2, event: 9, ip: 17 }
  });
  assert.equal(context.agentId, 25);
  assert.equal(context.event, 9);
  assert.equal(context.structured, true);
  assert.equal(context.selections.script.ip, 17);
  assert.equal(context.selections.logRecord.worldTick, 72);
  assert.equal(extractLogContext({
    message: "agent #25",
    legacy: false
  }), null);
  assert.equal(extractLogContext({
    message: "agent #25",
    legacy: true
  }).agentId, 25);
});

test("browser back restores tab, selection, filters, and scroll", () => {
  const store = createStore();
  connectedWorld(store);
  store.select("creature", 42, { name: "Ada" }, true);
  const browser = mockBrowser();
  const activated = [];
  const creaturesWorkspace = { filter: "norn", scrollTop: 180 };
  const debuggerWorkspace = { search: "", scrollTop: 0 };
  const navigation = createNavigationService({
    store,
    window: browser.window,
    activeTab: "creatures"
  });
  navigation.setTabActivator(tab => activated.push(tab));
  navigation.registerWorkspace("creatures", {
    capture: () => creaturesWorkspace,
    restore: state => Object.assign(creaturesWorkspace, state)
  });
  navigation.registerWorkspace("debugger", {
    capture: () => debuggerWorkspace,
    restore: state => Object.assign(debuggerWorkspace, state)
  });
  navigation.start();

  navigation.navigate({
    tab: "debugger",
    worldKey: "Alpha",
    primary: "agent",
    selections: { agent: { id: 42, family: 4 } }
  });
  creaturesWorkspace.filter = "changed";
  creaturesWorkspace.scrollTop = 0;
  assert.equal(navigation.getActiveTab(), "debugger");
  assert.equal(store.getState().selection.agent.id, 42);
  assert.match(browser.location.hash, /creature=42/);
  assert.match(browser.location.hash, /agent=42/);

  browser.history.back();
  assert.equal(navigation.getActiveTab(), "creatures");
  assert.equal(store.getState().selection.creature.id, 42);
  assert.equal(store.getState().selection.agent, null);
  assert.deepEqual(creaturesWorkspace, { filter: "norn", scrollTop: 180 });
  assert.equal(activated.at(-1), "creatures");

  browser.history.forward();
  assert.equal(navigation.getActiveTab(), "debugger");
  assert.equal(store.getState().selection.agent.id, 42);
  assert.equal(navigation.canGoBack(), true);
});

test("old-world routes report missing context without retargeting", () => {
  const store = createStore();
  connectedWorld(store, "Beta");
  store.select("agent", 9, { gallery: "old" }, true);
  const browser = mockBrowser();
  const navigation = createNavigationService({ store, window: browser.window });

  const applied = navigation.navigate({
    tab: "debugger",
    worldKey: "Alpha",
    primary: "agent",
    selections: { agent: 9 }
  });

  assert.equal(applied, false);
  assert.equal(store.getState().selection.agent.worldKey, "Beta");
  assert.match(navigation.getStatus().missing.reason, /belongs to world/);
});

test("Back across a reload keeps the place but not the old subjects", () => {
  const store = createStore();
  store.dispatch({
    type: "connection/status",
    payload: { status: "connected" }
  });
  const session = worldSessionId => store.dispatch({
    type: "world/session",
    payload: { worldName: "Lab", worldSessionId, worldTick: 10 }
  });
  session("1-2.1");
  const browser = mockBrowser();
  const navigation = createNavigationService({ store, window: browser.window });
  navigation.start();
  const restored = [];
  navigation.registerWorkspace("debugger", {
    capture: () => ({ currentAgentId: 42 }),
    restore: saved => restored.push(saved)
  });
  store.select("agent", 42, { gallery: "old" }, true);
  navigation.navigate({ tab: "debugger" });
  navigation.setActiveTab("debugger");
  navigation.navigate({ tab: "scripts" });

  session("1-2.2");
  assert.equal(store.getState().selection.agent, null);
  browser.window.history.back();

  assert.equal(store.getState().selection.agent, null);
  assert.deepEqual(restored, [], "workspace state holds the same old ids");
  assert.equal(navigation.getStatus().route.tab, "debugger");
  assert.match(navigation.getStatus().missing.reason, /reloaded/);
});

test("Back within one load of a world restores its subjects", () => {
  const store = createStore();
  store.dispatch({
    type: "connection/status",
    payload: { status: "connected" }
  });
  store.dispatch({
    type: "world/session",
    payload: { worldName: "Lab", worldSessionId: "1-2.1", worldTick: 10 }
  });
  const browser = mockBrowser();
  const navigation = createNavigationService({ store, window: browser.window });
  navigation.start();
  store.select("agent", 42, { gallery: "old" }, true);
  navigation.navigate({ tab: "debugger" });
  navigation.navigate({ tab: "scripts" });
  browser.window.history.back();
  assert.equal(store.getState().selection.agent.id, 42);
});

test("world-qualified deep links wait for initial session identity", () => {
  const store = createStore();
  const browser = mockBrowser();
  const href = buildRouteHref({
    tab: "debugger",
    worldKey: "Alpha",
    primary: "agent",
    selections: {
      agent: { id: 42, family: 4, genus: 1, species: 2 }
    }
  });
  browser.location.href = "http://localhost:9980/" + href;
  browser.location.hash = href;
  const activated = [];
  const navigation = createNavigationService({ store, window: browser.window });
  navigation.setTabActivator(tab => activated.push(tab));

  navigation.start();
  assert.equal(store.getState().selection.agent, null);
  assert.match(navigation.getStatus().missing.reason, /Waiting for the active world/);

  connectedWorld(store, "Alpha");
  assert.equal(store.getState().selection.agent.id, 42);
  assert.equal(store.getState().selection.agent.family, 4);
  assert.equal(store.getState().selection.primary.kind, "agent");
  assert.equal(activated.at(-1), "debugger");
  assert.equal(navigation.getStatus().missing, null);
});

test("routes name the world, not one load of it", () => {
  const route = normalizeRoute({
    tab: "creatures",
    worldKey: "Lab@1793430899425-4242.3"
  });
  assert.equal(route.worldKey, "Lab");
  assert.equal(
    normalizeRoute({ worldKey: "a@b" }).worldKey,
    "a@b");
});
