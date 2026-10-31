"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalize,
  createBuffer,
  filterRecords,
  exportRecords
} = require("../log_model.js");

test("normalizes structured and legacy records without inventing context", () => {
  const structured = normalize({
    schemaVersion: 2,
    streamId: "server",
    recordId: 3,
    message: "paused agent",
    categoryMask: 8,
    severity: "warning",
    subsystem: "developer_tools",
    worldName: "Docking Station",
    worldTick: 42,
    agent: { id: 7, family: 4, genus: 1, species: 2 },
    script: { family: 4, genus: 1, species: 2, event: 9, ip: 12 }
  }, { receivedAtWallTimeMs: 1000 });
  assert.equal(structured.id, "server:3");
  assert.equal(structured.worldTick, 42);
  assert.equal(structured.script.event, 9);
  assert.equal(structured.legacy, false);

  const legacy = normalize({ t: 50, cat: 1, msg: "old error" }, {
    sequence: 8,
    receivedAtWallTimeMs: 2000
  });
  assert.equal(legacy.id, "client:8");
  assert.equal(legacy.severity, "error");
  assert.equal(legacy.worldTick, null);
  assert.equal(normalize({
    message: "explicitly unknown",
    wallTimeMs: null,
    worldTick: null,
    systemTick: null
  }).worldTick, null);
  assert.equal(legacy.contextTiming, "unavailable");
  assert.equal(legacy.legacy, true);
});

test("collapses consecutive duplicates while preserving count and time range", () => {
  const buffer = createBuffer();
  buffer.ingest({ message: "same", wallTimeMs: 100, worldTick: 4 });
  buffer.ingest({ message: "same", wallTimeMs: 200, worldTick: 5 });
  buffer.ingest({ message: "different", wallTimeMs: 300, worldTick: 6 });
  const records = buffer.records();
  assert.equal(records.length, 2);
  assert.equal(records[0].duplicateCount, 2);
  assert.equal(records[0].firstWorldTick, 4);
  assert.equal(records[0].lastWorldTick, 5);
  assert.equal(buffer.stats().rawCount, 3);
});

test("bounds count and bytes and leaves an explicit overflow gap", () => {
  const buffer = createBuffer({ maxRecords: 2, maxBytes: 10000 });
  buffer.ingest({ message: "one" });
  buffer.ingest({ message: "two" });
  buffer.ingest({ message: "three" });
  assert.equal(buffer.stats().rawCount <= 2, true);
  assert.equal(buffer.records()[0].kind, "gap");
  assert.equal(buffer.records()[0].reason, "client_buffer_overflow");
  assert.equal(buffer.records()[0].droppedCount, 1);

  const byteBuffer = createBuffer({ maxRecords: 50, maxBytes: 500 });
  for (let i = 0; i < 10; i++) {
    byteBuffer.ingest({ message: "record-" + i + "-".repeat(800) });
  }
  assert.equal(byteBuffer.stats().byteCount <= 500, true);
  assert.equal(byteBuffer.records()[0].kind, "gap");
});

test("filters structured context and time ranges", () => {
  const records = [
    normalize({
      message: "first", severity: "info", subsystem: "world",
      worldName: "A", wallTimeMs: 100, worldTick: 100,
      agent: { id: 7, family: 4, genus: 1, species: 2 },
      script: { family: 4, genus: 1, species: 2, event: 9 }
    }),
    normalize({
      message: "second", severity: "error", subsystem: "caos",
      worldName: "A", wallTimeMs: 200, worldTick: 300
    })
  ];
  assert.equal(filterRecords(records, {
    agent: "7", classifier: "4 1 2", event: "9"
  }).length, 1);
  assert.equal(filterRecords(records, {
    range: "around_tick", contextTick: 110, tickWindow: 20
  }).length, 1);
  assert.equal(filterRecords(records, {
    range: "since_world_load", worldSessionStartWallTimeMs: 150
  }).length, 1);
  assert.equal(filterRecords(records, {
    severities: new Set()
  }).length, 0);
  const gap = normalize({
    kind: "gap",
    message: "disconnect",
    severity: "warning",
    subsystem: "network"
  });
  assert.equal(filterRecords([gap], {
    severities: new Set(),
    subsystems: new Set(),
    range: "around_tick",
    contextTick: 100
  }).length, 1);
});

test("exports JSONL with context, duplicates, gaps, and annotations intact", () => {
  const buffer = createBuffer();
  const record = buffer.ingest({
    schemaVersion: 2,
    streamId: "s",
    recordId: 1,
    message: "inspect",
    worldTick: 12,
    agent: { id: 4 }
  });
  buffer.update(record.id, { bookmarked: true, annotation: "root cause" });
  buffer.ingest({
    schemaVersion: 2,
    kind: "gap",
    streamId: "s",
    recordId: 2,
    reason: "server_restart",
    droppedCount: 0,
    message: "server restarted"
  });
  const lines = exportRecords(buffer.records(), "jsonl").split("\n").map(JSON.parse);
  assert.equal(lines[0].worldTick, 12);
  assert.equal(lines[0].agent.id, 4);
  assert.equal(lines[0].annotation, "root cause");
  assert.equal(lines[1].kind, "gap");
  assert.equal(lines[0]._bytes, undefined);
});
