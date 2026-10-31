"use strict";

// A world's name outlives any one load of it. These cover what must, and must
// not, carry across that boundary.

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, pageErrors, goTo, selectFirstCreature
} = require("./harness.cjs");

const skip = !available ? "Firefox is not installed"
  : process.env.OBSERVATORY_URL ? "needs fixture control of the world" : false;
let suite;

before(async () => {
  if (skip) return;
  suite = await startSuite();
  await open(suite.browser, suite.baseUrl);
  await selectFirstCreature(suite.browser);
});

after(async () => {
  if (suite) await suite.stop();
});

test("reloading a saved world discards the old subject and samples",
  { skip }, async () => {
    const { browser, engine } = suite;
    const before = await browser.evaluate(
      "return ObservatoryState.getState().world.identity.key;");
    engine.reloadWorld(5);
    await browser.waitFor(
      "return ObservatoryState.getState().world.identity.key !== arguments[0];",
      { args: [before] });
    const state = await browser.evaluate(`
      const state = ObservatoryState.getState();
      return {
        name: state.world.identity.name,
        selected: state.selection.creature,
        tick: state.world.tick
      };
    `);
    assert.equal(state.name, "Synthetic World");
    assert.equal(state.selected, null);
    assert.ok(state.tick < 1000, "time moved backwards with the reload");
  });

test("links name the world, not one load of it", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "creatures");
  const hash = await browser.evaluate("return location.hash;");
  assert.match(decodeURIComponent(hash), /world=Synthetic[ +]World/);
  assert.doesNotMatch(decodeURIComponent(hash), /@\d/);
});

test("loading a branch confirms it as the draft experiment's source",
  { skip }, async () => {
    const { browser, engine } = suite;
    await goTo(browser, "experiments");
    await browser.evaluate(`
      const title = document.getElementById('experiment-title');
      title.value = 'Branch check';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await browser.click("#experiment-create");
    await browser.waitFor(
      "return document.getElementById('experiment-warning')" +
      ".textContent.includes('draft');");

    await browser.evaluate(`
      const input = document.getElementById('experiment-branch-name');
      input.value = 'Branch One';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await browser.click("#experiment-branch-preview");
    await browser.waitFor(
      "return document.getElementById('experiment-branch-dialog').open;");
    await browser.click("#experiment-branch-confirm");
    await browser.click("#experiment-branch-create");
    await browser.waitFor(
      "return document.getElementById('experiment-branch-result')" +
      ".textContent.includes('created and not loaded');");

    await browser.click("#experiment-branch-result button");
    await browser.waitFor(
      "return document.getElementById('experiment-warning')" +
      ".textContent.includes('Branch load confirmed');");
    assert.equal(engine.state.name, "Branch One");
    assert.equal(await browser.evaluate(
      "return document.getElementById('experiment-disposable').checked;"), true);
    assert.deepEqual(await pageErrors(browser), []);
  });

test("a branch review does not survive a change of world", { skip }, async () => {
  const { browser, engine } = suite;
  await goTo(browser, "experiments");
  await browser.evaluate(`
    const input = document.getElementById('experiment-branch-name');
    input.value = 'Stale Branch';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await browser.click("#experiment-branch-preview");
  await browser.waitFor(
    "return document.getElementById('experiment-branch-dialog').open;");
  await browser.click("#experiment-branch-confirm");

  engine.reloadWorld(50);
  await browser.waitFor(
    "return ObservatoryState.getState().world.tick < 1000;");

  await browser.click("#experiment-branch-create");
  await browser.waitFor(
    "return document.getElementById('experiment-branch-result')" +
    ".textContent.includes('Branch failed');");
  assert.equal(engine.state.worlds.has("Stale Branch"), false);
  await browser.evaluate(
    "document.getElementById('experiment-branch-dialog').close();");
});
