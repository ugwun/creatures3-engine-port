"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Model = require("../architecture_model.js");
const Navigation = require("../observatory_navigation.js");
const Help = require("../contextual_help_model.js");

const repositoryRoot = path.resolve(__dirname, "../..");
const docsRoot = path.resolve(__dirname, "../docs");

test("architecture model has unique valid nodes edges and paths", () => {
  assert.deepEqual(Model.validate(), []);
  assert.equal(new Set(Model.NODES.map(item => item.id)).size,
    Model.NODES.length);
  assert.equal(new Set(Model.EDGES.map(item => item.id)).size,
    Model.EDGES.length);
  assert.equal(new Set(Model.PATHS.map(item => item.id)).size,
    Model.PATHS.length);
  assert.ok(Model.NODES.length >= 40);
  assert.ok(Model.EDGES.some(item => item.evidence === "static"));
  assert.ok(Model.EDGES.some(item => item.evidence === "observed"));
  assert.ok(Model.EDGES.some(item => item.evidence === "derived"));
  assert.ok(Model.EDGES.some(item => item.evidence === "inferred"));
});

test("maintained source and documentation metadata resolves", () => {
  const errors = [];
  Model.NODES.forEach(item => {
    if (item.source &&
        !fs.existsSync(path.join(repositoryRoot, item.source))) {
      errors.push(item.id + " missing source " + item.source);
    }
    if (item.document &&
        !fs.existsSync(path.join(docsRoot, item.document))) {
      errors.push(item.id + " missing document " + item.document);
    }
  });
  assert.deepEqual(errors, []);
});

test("maintained tool and contextual-help links resolve", () => {
  const errors = [];
  Model.NODES.forEach(item => {
    if (item.routeId && !Navigation.routeDefinition(item.routeId))
      errors.push(item.id + " missing route " + item.routeId);
    if (item.helpId && !Help.get(item.helpId))
      errors.push(item.id + " missing help " + item.helpId);
  });
  assert.deepEqual(errors, []);
});

test("directed architecture relationships remain acyclic", () => {
  const outgoing = new Map();
  Model.NODES.forEach(item => outgoing.set(item.id, []));
  Model.EDGES.forEach(item =>
    outgoing.get(item.from).push(item.to));
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visiting.has(id)) {
      throw new Error("Architecture cycle: " +
        stack.concat(id).join(" → "));
    }
    if (visited.has(id)) return;
    visiting.add(id);
    outgoing.get(id).forEach(next =>
      visit(next, stack.concat(id)));
    visiting.delete(id);
    visited.add(id);
  }
  Model.NODES.forEach(item => visit(item.id, []));
  assert.equal(visited.size, Model.NODES.length);
});

test("endpoint mapping recognizes REST and event-stream activity", () => {
  assert.equal(Model.endpointForUrl(
    "http://localhost:9980/api/creature/42/chemistry"),
  "api.chemistry");
  assert.equal(Model.endpointForUrl(
    "http://localhost:9980/api/creature/42/brain/lobe/3"),
  "api.brain");
  assert.equal(Model.endpointForUrl("/api/events"), "stream.logs");
  assert.equal(Model.endpointForUrl("/docs/index.json"), null);
});

test("known failed requests are not presented as observed data activity", () => {
  const live = Model.liveContext({
    connection: {status: "connected"},
    recording: {active: false}
  }, {routeId: "architecture"}, [{
    name: "http://localhost:9980/api/creature/missing/chemistry",
    responseEnd: 100,
    responseStatus: 404,
    __ageMs: 50
  }], 1000);

  assert.deepEqual(live.observedNodeIds, []);
  assert.deepEqual(live.derivedNodeIds, []);
});

test("live highlighting distinguishes requests context and derivation", () => {
  const state = {
    connection: { status: "connected" },
    world: {
      identity: { name: "Alpha", key: "Alpha" },
      tick: 1200
    },
    selection: {
      creature: { id: 42 },
      chemical: null,
      agent: null,
      script: null,
      room: null,
      genome: null,
      logRecord: null,
      timelineEvent: null
    },
    recording: { active: false }
  };
  const live = Model.liveContext(state, {
    routeId: "creatures"
  }, [{
    name: "http://localhost:9980/api/creature/42/chemistry",
    responseEnd: 100,
    responseStatus: 200,
    __ageMs: 500
  }], Date.now());
  assert.ok(live.observedNodeIds.includes("api.chemistry"));
  assert.ok(live.derivedNodeIds.includes("browser.series"));
  assert.ok(live.contextNodeIds.includes("domain.creature"));
  assert.ok(!live.observedNodeIds.includes("domain.creature"),
    "selection alone must not claim engine execution");
  assert.equal(live.pathId, "creature.drive");
  assert.deepEqual(live.identifiers.map(item => item.label), [
    "World", "Sample tick", "creature"
  ]);
});

test("selected identifiers contribute context without claiming observation", () => {
  const live = Model.liveContext({
    connection: {status: "connected"},
    world: {identity: {name: "Test"}, tick: 42},
    selection: {
      creature: {id: 622},
      agent: {id: 9001},
      chemical: {id: 75}
    },
    recording: {active: false}
  }, {
    routeId: "architecture",
    trace: "creature.chemical"
  }, [], 1000);

  assert.ok(live.contextNodeIds.includes("domain.creature"));
  assert.ok(live.contextNodeIds.includes("domain.agent"));
  assert.ok(live.contextNodeIds.includes("domain.biochemistry"));
  assert.ok(!live.observedNodeIds.includes("domain.creature"));
  assert.ok(!live.observedNodeIds.includes("domain.biochemistry"));
  assert.deepEqual(live.identifiers.slice(-3), [
    {label: "creature", value: "622"},
    {label: "agent", value: "9001"},
    {label: "chemical", value: "75"}
  ]);
});

test("investigation routes map to reviewed metric handoffs", () => {
  assert.equal(Model.ROUTE_CONTEXT.ecology.pathId, "ecology.ca");
  assert.equal(Model.ROUTE_CONTEXT.scripts.pathId, "scripts.runtime");
  assert.equal(Model.ROUTE_CONTEXT.logs.pathId, "logs.record");
  assert.equal(Model.ROUTE_CONTEXT.experiments.pathId,
    "experiment.recording");
  assert.ok(Model.ROUTE_CONTEXT.ecology.nodes.includes("api.ecology"));
  assert.ok(Model.ROUTE_CONTEXT.scripts.nodes.includes("api.scripts"));
  assert.ok(Model.ROUTE_CONTEXT.logs.nodes.includes("stream.logs"));
  assert.ok(Model.ROUTE_CONTEXT.experiments.nodes.includes(
    "browser.experiment"));
});

test("an explicit empty layer selection stays empty", () => {
  const visible = Model.visibleModel([], "");
  assert.deepEqual(visible.nodes, []);
  assert.deepEqual(visible.edges, []);
});

test("metric paths expose unit transformation cadence and evidence", () => {
  Model.PATHS.forEach(dataPath => {
    assert.ok(dataPath.steps.length >= 3, dataPath.id);
    dataPath.steps.forEach(item => {
      assert.ok(Model.nodeById(item.nodeId), item.nodeId);
      assert.ok(item.unit);
      assert.ok(item.transformation);
      assert.ok(item.cadence);
      assert.ok(Model.EVIDENCE[item.evidence]);
    });
  });
  assert.equal(
    Model.pathById("creature.chemical").steps.at(-1).nodeId,
    "browser.provenance"
  );
});
