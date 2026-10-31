"use strict";

// Live stepping is in workflows.browser.cjs. This covers races that need control
// of response timing.

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, goTo, selectFirstCreature, delay
} = require("./harness.cjs");

const skip = !available ? "Firefox is not installed"
  : process.env.OBSERVATORY_URL ? "needs control of response timing" : false;
let suite;

async function showAgent(browser, agentId) {
  await browser.evaluate(`
    ObservatoryState.select('agent', arguments[0], {}, true);
    DevToolsNavigation.navigate({
      tab: 'debugger', view: 'agent', primary: 'agent',
      selections: { agent: { id: arguments[0] } }
    });
  `, agentId);
  await browser.waitFor(
    "return document.getElementById('dbg-script-info').textContent" +
    ".includes('#' + arguments[0]) && " +
    "document.querySelector('#dbg-source-lines .dbg-gutter');",
    { args: [agentId] });
}

before(async () => {
  if (skip) return;
  suite = await startSuite();
  await open(suite.browser, suite.baseUrl);
  await selectFirstCreature(suite.browser);
  await goTo(suite.browser, "debugger");
});

after(async () => {
  if (suite) await suite.stop();
});

test("a click before the map arrives still sets the breakpoint",
  { skip }, async () => {
    const { browser, engine } = suite;
    engine.state.compileMapDelayMs = 400;
    await showAgent(browser, 101);
    await browser.click("#dbg-source-lines .dbg-line:nth-child(2) .dbg-gutter");
    await browser.waitFor(
      "return document.querySelector('.dbg-bp-active');", { timeout: 3000 });
    assert.equal(engine.state.breakpoints.pop().agentId, 101);
    engine.state.compileMapDelayMs = 0;
  });

test("a pending click never lands on the agent selected after it",
  { skip }, async () => {
    const { browser, engine } = suite;
    await showAgent(browser, 103);
    engine.state.breakpoints.length = 0;
    engine.state.compileMapDelayMs = 700;
    await showAgent(browser, 101);
    await browser.click("#dbg-source-lines .dbg-line:nth-child(2) .dbg-gutter");
    await showAgent(browser, 102);
    await delay(1000);
    engine.state.compileMapDelayMs = 0;
    assert.deepEqual(engine.state.breakpoints, []);
  });
