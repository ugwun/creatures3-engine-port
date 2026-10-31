"use strict";

// A slow response must not land on whatever the user has moved on to.

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, goTo, selectFirstCreature, delay
} = require("./harness.cjs");

const skip = !available ? "Firefox is not installed"
  : process.env.OBSERVATORY_URL ? "needs control of response timing" : false;
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

test("a slow tract does not replace the tract selected after it",
  { skip }, async () => {
    const { browser, engine } = suite;
    await browser.click('.crt-sub-btn[data-subtab="brain"]');
    await browser.waitFor(
      "return document.querySelector('[data-tract-info=\"1\"]');");
    engine.state.tractDelayMs = { 0: 700 };
    await browser.evaluate(
      "document.querySelector('[data-tract-info=\"0\"]').click();");
    await browser.evaluate(
      "document.querySelector('[data-tract-info=\"1\"]').click();");
    await browser.waitFor(
      "return document.getElementById('crt-brain-info-content')" +
      ".textContent.includes('tract-1');");
    await delay(900);
    engine.state.tractDelayMs = {};
    const text = await browser.evaluate(
      "return document.getElementById('crt-brain-info-content').textContent;");
    assert.match(text, /tract-1/);
    assert.doesNotMatch(text, /tract-0 /);
  });

test("a slow script load does not replace a draft typed meanwhile",
  { skip }, async () => {
    const { browser, engine } = suite;
    await goTo(browser, "workbench");
    await browser.waitFor(
      "return document.querySelector('#ide-script-list .ide-script-item');");
    engine.state.scriptDelayMs = { 9: 700 };
    await browser.evaluate(
      "document.querySelector('#ide-script-list .ide-script-item').click();");
    await browser.evaluate(`
      const editor = document.getElementById('ide-editor');
      editor.value = 'outs "my draft"';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await delay(900);
    engine.state.scriptDelayMs = {};
    assert.match(await browser.evaluate(
      "return document.getElementById('ide-editor').value;"), /my draft/);
  });

test("a slow script load does not replace an edit made without typing",
  { skip }, async () => {
    const { browser, engine } = suite;
    engine.state.scriptDelayMs = { 9: 700 };
    await browser.evaluate(`
      document.querySelector('#ide-script-list .ide-script-item').click();
      // Autocomplete and smart indent write the value directly.
      document.getElementById('ide-editor').value = 'outs "accepted"';
    `);
    await delay(900);
    engine.state.scriptDelayMs = {};
    assert.match(await browser.evaluate(
      "return document.getElementById('ide-editor').value;"), /accepted/);
  });

test("a slow script load does not replace a mode chosen meanwhile",
  { skip }, async () => {
    const { browser, engine } = suite;
    await browser.click('.ide-mode-button[data-mode="install"]');
    engine.state.scriptDelayMs = { 9: 700 };
    await browser.evaluate(
      "document.querySelector('#ide-script-list .ide-script-item').click();");
    await browser.click('.ide-mode-button[data-mode="evaluate"]');
    await delay(900);
    engine.state.scriptDelayMs = {};
    assert.equal(await browser.evaluate(
      "return document.querySelector('.ide-mode-button--active').dataset.mode;"),
    "evaluate");
    assert.doesNotMatch(await browser.evaluate(
      "return document.getElementById('ide-editor').value;"), /script 9/);
  });

test("a slow script load does not replace a newer script and its edits",
  { skip }, async () => {
    const { browser, engine } = suite;
    await goTo(browser, "workbench");
    await browser.waitFor(
      "return document.querySelectorAll('#ide-script-list .ide-script-item, " +
      "#ide-script-list [data-event]').length >= 1 || " +
      "document.getElementById('ide-script-list').textContent.length > 0;");
    engine.state.scriptDelayMs = { 9: 700 };
    await browser.evaluate(`
      const items = Array.from(document.querySelectorAll(
        '#ide-script-list .ide-sidebar-item, #ide-script-list .ide-script-item'));
      window.__scriptItems = items;
      items[0].click();
      items[1].click();
    `);
    await browser.waitFor(
      "return document.getElementById('ide-editor').value.includes('script 10');");
    await browser.evaluate(`
      const editor = document.getElementById('ide-editor');
      editor.value += ' edited';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await delay(900);
    engine.state.scriptDelayMs = {};
    assert.match(await browser.evaluate(
      "return document.getElementById('ide-editor').value;"),
    /script 10.*edited/s);
    assert.equal(await browser.evaluate(
      "return document.getElementById('ide-event').value;"), "10");
  });
