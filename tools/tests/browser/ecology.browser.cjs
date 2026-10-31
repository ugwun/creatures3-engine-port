"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, goTo, selectFirstCreature, pageErrors
} = require("./harness.cjs");

const skip = available ? false : "Firefox is not installed";
let suite;

before(async () => {
  if (skip) return;
  suite = await startSuite();
  await open(suite.browser, suite.baseUrl);
  await selectFirstCreature(suite.browser);
  await goTo(suite.browser, "ecology");
  await suite.browser.waitFor(
    "return document.getElementById('ecology-relative')" +
    ".textContent.includes('Sampled at creature');", { timeout: 10000 });
});

after(async () => {
  if (suite) await suite.stop();
});

const card = `
  return document.getElementById('ecology-relative').textContent;
`;

test("creature evidence names the strongest channel (OBS-005)",
  { skip }, async () => {
    const text = await suite.browser.evaluate(card);
    assert.match(text, /at the down foot/);
    assert.match(text, /Strongest here: CA \d+|strongest channel in the room/);
  });

test("smell evidence does not report a meaningless winner (OBS-005)",
  { skip }, async () => {
    const text = await suite.browser.evaluate(card);
    assert.doesNotMatch(text, /Smell winner self/);
    assert.match(text, /Strongest smell signal|No smell signal/);
    assert.match(text, /no winner/);
  });

test("a creature outside every room is unknown, not zero",
  { skip: skip || process.env.OBSERVATORY_URL && "needs fixture control" },
  async () => {
    const { browser, engine } = suite;
    engine.state.downFootOutsideRooms = true;
    await browser.waitFor(
      "return document.getElementById('ecology-relative')" +
      ".textContent.includes('outside every room');", { timeout: 8000 });
    assert.doesNotMatch(await browser.evaluate(card), /genuine/);
    engine.state.downFootOutsideRooms = false;
    await browser.waitFor(
      "return document.getElementById('ecology-relative')" +
      ".textContent.includes('at the down foot');", { timeout: 8000 });
  });

test("a focused agent keeps its identity when another leaves the map",
  { skip: skip || process.env.OBSERVATORY_URL && "needs fixture control" },
  async () => {
    const { browser, engine } = suite;
    engine.state.ecologyAgentIds = [500, 501];
    await browser.waitFor(
      "return document.querySelector('[data-agent-id=\"501\"]');",
      { timeout: 8000 });
    await browser.evaluate(
      "document.querySelector('[data-agent-id=\"500\"]').focus();");
    engine.state.ecologyAgentIds = [501];
    await browser.waitFor(
      "return !document.querySelector('[data-agent-id=\"500\"]');",
      { timeout: 8000 });
    const focused = await browser.evaluate(
      "return document.activeElement.dataset.agentId || null;");
    assert.notEqual(focused, "501");
    engine.state.ecologyAgentIds = [500];
  });

test("evidence cards explain why the target card changes", { skip }, async () => {
  const text = await suite.browser.evaluate(card);
  assert.match(text, /Attention moves often|between targets/);
  assert.deepEqual(await pageErrors(suite.browser), []);
});
