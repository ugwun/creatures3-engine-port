import assert from "node:assert/strict";
import test from "node:test";

import { engineFailure, readJson, textResult } from "../results.js";

function response(status, body, statusText = "") {
  return new Response(body, { status, statusText });
}

test("engineFailure recognizes the engine's failure shapes", () => {
  assert.equal(engineFailure({ ok: false, error: "Agent not found" }), "Agent not found");
  assert.equal(engineFailure({ ok: false }), "Engine reported failure");
  assert.equal(engineFailure({ error: "Creature not found", schemaVersion: 1 }), "Creature not found");
});

test("engineFailure ignores successful bodies", () => {
  assert.equal(engineFailure({ ok: true, error: null, output: "1" }), null);
  assert.equal(engineFailure({ error: null }), null);
  assert.equal(engineFailure([{ error: "inside an array item" }]), null);
  assert.equal(engineFailure("plain text"), null);
  assert.equal(engineFailure(null), null);
});

test("textResult marks HTTP-200 failures as errors and keeps their detail", () => {
  const result = textResult({ ok: false, error: "Unknown action", position: 4 });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /"position": 4/);
});

test("textResult leaves successes unmarked", () => {
  assert.equal(textResult({ ok: true }).isError, undefined);
  assert.equal(textResult([]).isError, undefined);
  assert.equal(textResult("(no output)").isError, undefined);
});

test("readJson returns parsed successful bodies", async () => {
  assert.deepEqual(await readJson(response(200, '{"ok":true}'), "GET /x"), { ok: true });
});

test("readJson keeps the engine's message on HTTP errors", async () => {
  await assert.rejects(
    readJson(response(400, '{"ok":false,"error":"name is required"}', "Bad Request"), "POST /api/world/create"),
    /POST \/api\/world\/create: 400 Bad Request — name is required/);
  await assert.rejects(
    readJson(response(503, "engine busy", "Service Unavailable"), "GET /x"),
    /503 Service Unavailable — engine busy/);
});

test("readJson rejects malformed successful bodies", async () => {
  await assert.rejects(readJson(response(200, "{not json"), "GET /x"), /invalid JSON/);
});
