"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Help = require("../contextual_help_model.js");
const Navigation = require("../observatory_navigation.js");

function state() {
  return {
    world: {
      identity: { name: "Alpha", key: "Alpha", type: "docked" },
      tick: 1200
    },
    selection: {
      primary: { kind: "creature", id: 42, key: "Alpha:42" },
      creature: {
        id: 42, key: "Alpha:42", worldKey: "Alpha",
        name: "Ada", moniker: "m-42"
      },
      chemical: {
        id: 75, key: "chemical:75", worldKey: null,
        name: "ATP"
      }
    },
    experiment: { id: "experiment-1", name: "Food response" }
  };
}

test("every declarative route resolves complete contextual help", () => {
  assert.deepEqual(Help.validate(Navigation.ROUTE_DEFINITIONS), []);
  Navigation.ROUTE_DEFINITIONS.forEach(route => {
    const item = Help.forRoute(route.id);
    assert.ok(item, route.id);
    assert.ok(item.summary);
    assert.ok(item.evidence.source);
    assert.ok(item.evidence.cadence);
    assert.ok(item.caution);
    assert.ok(item.guide.document);
    assert.ok(item.owner);
  });
});

test("documentation routes carry explicit world subject and time context", () => {
  const item = Help.get("route.timeline");
  const route = Help.documentationRoute(item.guide, state(), {
    routeId: "timeline",
    tab: "timeline",
    time: {
      timebase: "worldTicks",
      cursorTick: 1200,
      startTick: 1100,
      endTick: 1250
    }
  });
  assert.equal(route.routeId, "guides");
  assert.equal(route.tab, "docs");
  assert.equal(route.document, "guide_investigate_behavior.md");
  assert.equal(route.worldKey, "Alpha");
  assert.equal(route.primary, "creature");
  assert.equal(route.selections.creature.id, 42);
  assert.equal(route.selections.chemical.id, 75);
  assert.deepEqual(route.time, {
    timebase: "worldTicks",
    cursorTick: 1200,
    startTick: 1100,
    endTick: 1250
  });
});

test("drawer identifiers remain honest about current context", () => {
  const identifiers = Help.contextIdentifiers(state(), {
    time: { startTick: 1100, endTick: 1250 }
  });
  assert.deepEqual(identifiers.map(item => item.label), [
    "World", "World tick", "Primary subject", "chemical",
    "Time context", "Experiment"
  ]);
  assert.equal(identifiers.find(
    item => item.label === "Time context").value,
  "1100–1250 world ticks");
});

test("primary identifier resolves the live store's kind-only primary shape", () => {
  const current = state();
  current.selection.primary = {
    kind: "creature",
    key: "Alpha:42"
  };
  const identifiers = Help.contextIdentifiers(current, {});
  assert.equal(identifiers.find(
    item => item.label === "Primary subject").value,
  "creature 42");
});

test("help search covers biological terms and mutating workflows", () => {
  assert.ok(Help.search("smell gradient").some(
    item => item.id === "route.ecology"));
  assert.ok(Help.search("checksum").some(
    item => item.id === "route.genetics"));
  assert.ok(Help.search("ownerless").some(
    item => item.id === "route.workbench"));
});
