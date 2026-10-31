const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../chemical_intervention_model.js");

function valid(overrides) {
  return Object.assign({
    chemicalId: 35,
    currentValue: 0.4,
    requestedValue: 0.05,
    operation: "adjust",
    sampleWorldTick: 100,
    currentWorldTick: 120,
    selectedWorldKey: "world:test",
    currentWorldKey: "world:test",
    creature: { id: 42, moniker: "test-moniker", missing: false }
  }, overrides || {});
}

test("previews the engine concentration range and clamping semantics", () => {
  const ordinary = Model.preview(valid());
  assert.equal(ordinary.valid, true);
  assert.equal(ordinary.projectedValue, 0.45);
  assert.equal(ordinary.requestedChange, 0.05);
  assert.equal(ordinary.clamped, false);

  const clamped = Model.preview(valid({
    currentValue: 0.95,
    requestedValue: 0.1
  }));
  assert.equal(clamped.valid, true);
  assert.equal(clamped.projectedValue, 1);
  assert.equal(clamped.clamped, true);
  assert.equal(clamped.requiresExtremeConfirmation, true);
});

test("distinguishes adjustment from target concentration", () => {
  const target = Model.preview(valid({
    operation: "target",
    requestedValue: 0.2
  }));
  assert.equal(target.valid, true);
  assert.equal(target.projectedValue, 0.2);
  assert.equal(target.requestedChange, -0.2);

  const outside = Model.preview(valid({
    operation: "target",
    requestedValue: 1.1
  }));
  assert.equal(outside.valid, false);
  assert.match(outside.errors.join(" "), /between 0 and 1/);
});

test("rejects reserved, stale, missing, and changed-world targets", () => {
  assert.equal(Model.preview(valid({ chemicalId: 0 })).valid, false);
  assert.match(
    Model.preview(valid({ currentWorldTick: 301 })).errors.join(" "),
    /stale/);
  assert.match(
    Model.preview(valid({
      creature: { id: 42, moniker: "", missing: true }
    })).errors.join(" "),
    /live creature/);
  assert.match(
    Model.preview(valid({
      currentWorldKey: "world:other"
    })).errors.join(" "),
    /different world/);
});

test("prevents duplicate submission until the first request finishes", () => {
  const first = Model.beginSubmission(
    Model.createSubmissionState(), "review-1");
  assert.equal(first.accepted, true);
  assert.equal(first.state.pending, true);
  const duplicate = Model.beginSubmission(first.state, "review-2");
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.state, first.state);
  const next = Model.beginSubmission(
    Model.finishSubmission(first.state), "review-2");
  assert.equal(next.accepted, true);
});

test("coalesces concurrent freshness reads for one reviewed target", async () => {
  const coordinator = Model.createRefreshCoordinator();
  let requestCount = 0;
  let release;
  const request = () => {
    requestCount++;
    return new Promise(resolve => { release = resolve; });
  };
  const first = coordinator.run("creature:42", request);
  const monitoring = coordinator.run("creature:42", request);
  await Promise.resolve();
  assert.equal(requestCount, 1);
  assert.equal(coordinator.activeKey(), "creature:42");
  release({ worldTick: 120 });
  assert.deepEqual(await first, { worldTick: 120 });
  assert.deepEqual(await monitoring, { worldTick: 120 });

  const next = coordinator.run("creature:42", async () => {
    requestCount++;
    return { worldTick: 121 };
  });
  assert.deepEqual(await next, { worldTick: 121 });
  assert.equal(requestCount, 2);
});

test("accepts only explicit protocol chemical syntax for the selected id", () => {
  const manifest = {
    protocol: {
      plannedInterventions: [{
        id: "planned-1",
        label: "Small ATP adjustment",
        operation: "chemical 35 adjust +0.04"
      }]
    }
  };
  assert.deepEqual(Model.protocolPreset(manifest, 35), {
    id: "planned-1",
    label: "Small ATP adjustment",
    operation: "adjust",
    requestedValue: 0.04,
    sourceText: "chemical 35 adjust +0.04"
  });
  assert.equal(Model.protocolPreset(manifest, 36), null);
});
