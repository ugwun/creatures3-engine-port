"use strict";

// OBS-001: polled panels must not undo what the user is doing.

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, pageErrors, goTo, selectFirstCreature, delay
} = require("./harness.cjs");

const skip = available ? false : "Firefox is not installed";
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

test("a chosen speed survives refreshes until it is applied", { skip }, async () => {
  const { browser, engine } = suite;
  await browser.click("#session-summary");
  await browser.waitFor(
    "return document.getElementById('session-popover').open;");
  await browser.select("#session-speed-select", "2");
  await delay(2500);
  assert.equal(await browser.evaluate(
    "return document.getElementById('session-speed-select').value;"), "2");

  await browser.click("#session-speed-apply");
  await browser.waitFor(
    "return document.getElementById('session-speed-result')" +
    ".textContent.includes('Applied');");
  if (engine) assert.equal(engine.state.speed, 2);

  await browser.select("#session-speed-select", "1");
  await browser.click("#session-speed-apply");
  await browser.waitFor(
    "return document.getElementById('session-speed-result')" +
    ".textContent.includes('×1');");
  await browser.click("#session-popover-close");
});

test("Ethology disclosures and draft notes survive samples", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "timeline");
  await browser.waitFor(
    "return document.querySelector('.timeline-event');", { timeout: 15000 });
  await browser.click(".timeline-event");
  await browser.waitFor(
    "return document.querySelector('.timeline-detail-card details');");
  await browser.click(".timeline-detail-card details summary");
  await browser.type("#timeline-annotation", "draft note");
  await browser.evaluate(
    "document.querySelector('.timeline-detail-card').__mark = 'kept';");
  await delay(3000);
  assert.equal(await browser.evaluate(
    "return document.querySelector('.timeline-detail-card details').open;"),
  true);
  assert.equal(await browser.evaluate(
    "return document.getElementById('timeline-annotation').value;"),
  "draft note");
  assert.equal(await browser.evaluate(
    "return document.querySelector('.timeline-detail-card').__mark;"), "kept");
});

test("saving a note still works after refreshes", { skip }, async () => {
  const { browser } = suite;
  await browser.click("#timeline-annotation-save");
  await browser.waitFor(
    "return document.querySelector('.timeline-event__note');");
});

test("renaming a recording gives feedback and sticks (OBS-004)",
  { skip }, async () => {
    const { browser } = suite;
    assert.equal(await browser.evaluate(
      "return document.getElementById('timeline-name-save').disabled;"), true);
    assert.ok(await browser.evaluate(
      "return document.getElementById('timeline-name-save').title;"));

    await browser.evaluate(`
      const input = document.getElementById('timeline-name');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await browser.type("#timeline-name", "Lunch study");
    await delay(2500);
    assert.equal(await browser.evaluate(
      "return document.getElementById('timeline-name').value;"), "Lunch study");

    await browser.click("#timeline-name-save");
    await browser.waitFor(
      "return document.getElementById('timeline-name-status')" +
      ".textContent.includes('Lunch study');");
    await browser.waitFor(
      "return document.getElementById('timeline-session')" +
      ".selectedOptions[0].textContent.includes('Lunch study');");
    await delay(2000);
    assert.equal(await browser.evaluate(
      "return document.getElementById('timeline-name').value;"), "Lunch study");
  });

test("Compare keeps the subject list the user chose", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "compare");
  await browser.waitFor(
    "return document.querySelector('[data-compare-subject]:checked');",
    { timeout: 10000 });
  await browser.evaluate(
    "document.querySelector('[data-compare-subject]').__mark = 'kept';");

  await browser.click("#compare-refresh").catch(() => {});
  await delay(300);
  assert.equal(await browser.evaluate(
    "return document.querySelector('[data-compare-subject]').__mark;"), "kept");

  await browser.click("#compare-clear-subjects");
  await browser.waitFor(
    "return !document.querySelector('[data-compare-subject]:checked');");
  await browser.click("#compare-refresh").catch(() => {});
  await delay(1500);
  assert.equal(await browser.evaluate(
    "return document.querySelector('[data-compare-subject]:checked');"), null,
  "an emptied selection stays empty");
});

test("Logs keep the record preview and its draft note", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "logs");
  await browser.waitFor(
    "return document.querySelector('#log-inner .log-row');", { timeout: 10000 });
  await browser.click("#log-inner .log-row:last-child");
  await browser.waitFor(
    "return !document.getElementById('log-context-preview').hidden;");
  await browser.type("#log-annotation", "keep this");
  await delay(2500);
  assert.equal(await browser.evaluate(
    "return document.getElementById('log-annotation').value;"),
  "keep this");
});

test("a focused chemical keeps focus through samples", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "creatures");
  await browser.click('.crt-sub-btn[data-subtab="chemistry"]');
  await browser.waitFor("return document.querySelector('.crt-chem-row');",
    { timeout: 8000 });
  await browser.evaluate(
    "document.querySelector('.crt-chem-row [data-bio-pin]').focus();");
  const pin = await browser.evaluate(
    "return document.activeElement.dataset.bioPin;");
  await delay(4500);
  assert.equal(await browser.evaluate(
    "return document.activeElement.dataset.bioPin || null;"), pin);
  await browser.click('.crt-sub-btn[data-subtab="drives"]');
});

test("an Architecture action fires once however long the panel was open",
  { skip }, async () => {
    const { browser } = suite;
    await goTo(browser, "architecture");
    await browser.waitFor(
      "return document.querySelector('[data-architecture-node]');");
    await browser.evaluate(`
      const node = Array.from(
        document.querySelectorAll('[data-architecture-node]'))
        .find(item => { item.click();
          return document.querySelector('[data-architecture-route]'); });
    `);
    await browser.waitFor(
      "return document.querySelector('[data-architecture-route]');");
    await delay(4500);
    const before = await browser.evaluate("return history.length;");
    await browser.evaluate(
      "document.querySelector('[data-architecture-route]').click();");
    await delay(300);
    assert.equal(await browser.evaluate("return history.length;"), before + 1);
  });

test("Creatures does not rebuild its rows every sample", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "creatures");
  await browser.waitFor("return document.querySelector('.crt-list-item');");
  await browser.evaluate(
    "document.querySelector('.crt-list-item').__mark = 'kept';");
  await delay(4500);
  assert.equal(await browser.evaluate(
    "return document.querySelector('.crt-list-item').__mark;"), "kept");
  assert.deepEqual(await pageErrors(browser), []);
});

test("a scripted zombie explains itself in the creature list", { skip },
  async () => {
    const { browser } = suite;
    await goTo(browser, "creatures");
    await browser.waitFor(
      "return document.querySelector('.crt-state--zombie');");
    const title = await browser.evaluate(
      "return document.querySelector('.crt-state--zombie').title;");
    assert.match(title, /ZOMB 1/);
    assert.equal(await browser.evaluate(
      "return document.querySelector('.crt-state--alert').title;"), "");
  });

