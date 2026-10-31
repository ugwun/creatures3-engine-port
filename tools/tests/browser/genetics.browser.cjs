"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, pageErrors, goTo, delay
} = require("./harness.cjs");

const skip = !available ? "Firefox is not installed"
  : process.env.OBSERVATORY_URL ? "needs the synthetic genome library" : false;
let suite;

async function openExperimentalCopy(browser) {
  await goTo(browser, "genetics");
  await browser.waitFor(
    "return document.querySelector('#genetics-file-list .genetics-file-item');");
  await browser.click("#genetics-file-list .genetics-file-item");
  await browser.waitFor(
    "return !document.getElementById('btn-genetics-create-copy').disabled;");
  await browser.click("#btn-genetics-create-copy");
  await browser.waitFor(
    "return document.querySelector('.g-btn-up') !== null;");
}

const geneOrder = `
  return Array.from(document.querySelectorAll('.crt-gene-card .crt-gene-title'))
    .map(node => node.textContent);
`;

before(async () => {
  if (skip) return;
  suite = await startSuite();
  await open(suite.browser, suite.baseUrl);
  await openExperimentalCopy(suite.browser);
});

after(async () => {
  if (suite) await suite.stop();
});

test("gene action buttons move, copy and remove genes (OBS-007)",
  { skip }, async () => {
    const { browser } = suite;
    const initial = await browser.evaluate(geneOrder);

    await browser.click('.crt-gene-card[data-idx="1"] .g-btn-up');
    await browser.waitFor(
      "return document.querySelector('.crt-gene-card[data-idx=\"0\"] " +
      ".crt-gene-title').textContent.includes('#2');");
    const moved = await browser.evaluate(geneOrder);
    assert.equal(moved[0], initial[1]);
    assert.equal(moved[1], initial[0]);

    await browser.click('.crt-gene-card[data-idx="0"] .g-btn-down');
    await browser.waitFor(
      "return document.querySelector('.crt-gene-card[data-idx=\"1\"] " +
      ".crt-gene-title').textContent.includes('#2');");
    assert.deepEqual(await browser.evaluate(geneOrder), initial);

    await browser.click('.crt-gene-card[data-idx="0"] .g-btn-dup');
    await browser.waitFor(
      "return document.querySelectorAll('.crt-gene-card').length === " +
      (initial.length + 1) + ";");
    const copied = await browser.evaluate(geneOrder);
    assert.match(copied[1], /Lobe/);
    assert.notEqual(copied[1], copied[0], "a copy gets its own ID");

    await browser.click('.crt-gene-card[data-idx="1"] .g-btn-del');
    await browser.waitFor(
      "return document.querySelectorAll('.crt-gene-card').length === " +
      initial.length + ";");
    assert.deepEqual(await browser.evaluate(geneOrder), initial);
    assert.match(
      await browser.evaluate(
        "return document.getElementById('genetics-safety-status').textContent;"),
      /Removed/);
    assert.deepEqual(await pageErrors(browser), []);
  });

test("clicking an action does not toggle its card open", { skip }, async () => {
  const { browser } = suite;
  await browser.click('.crt-gene-card[data-idx="2"] .g-btn-up');
  await browser.waitFor(
    "return document.getElementById('genetics-safety-status')" +
    ".textContent.startsWith('Moved');");
  const open = await browser.evaluate(
    "return document.querySelector('.crt-gene-card[data-idx=\"1\"] " +
    ".crt-gene-body').style.display;");
  assert.equal(open, "none");
  await browser.click('.crt-gene-card[data-idx="1"] .g-btn-down');
});

test("an expanded gene stays open when the list re-renders", { skip }, async () => {
  const { browser } = suite;
  await browser.click('.crt-gene-card[data-idx="0"] .crt-gene-title');
  await browser.waitFor(
    "return document.querySelector('.crt-gene-card[data-idx=\"0\"] " +
    ".crt-gene-body').style.display === 'block';");
  await browser.click('.crt-gene-card[data-idx="1"] .g-btn-up');
  await browser.waitFor(
    "return document.querySelector('.crt-gene-card[data-idx=\"1\"] " +
    ".crt-gene-body').style.display === 'block';");
  await browser.click('.crt-gene-card[data-idx="1"] .g-btn-up');
});

test("the first and last genes cannot move past the ends", { skip }, async () => {
  const { browser } = suite;
  assert.equal(await browser.evaluate(
    "return document.querySelector('.crt-gene-card[data-idx=\"0\"] " +
    ".g-btn-up').disabled;"), true);
  assert.equal(await browser.evaluate(
    "return document.querySelector('.crt-gene-card:last-of-type .g-btn-down')" +
    ".disabled;"), true);
});

test("injection review works over plain HTTP from another machine",
  { skip }, async () => {
    const { browser } = suite;
    // Remote pages are not a secure context, so randomUUID does not exist.
    await browser.evaluate("delete Crypto.prototype.randomUUID;");
    await browser.click("#btn-genetics-save").catch(() => {});
    await browser.waitFor(
      "return !document.getElementById('btn-genetics-inject').disabled;",
      { timeout: 6000 });
    await browser.click("#btn-genetics-inject");
    await browser.waitFor(
      "return document.getElementById('genetics-injection-dialog').open;");
    await browser.evaluate(`
      const disposable = document.getElementById('genetics-disposable-confirm');
      if (!disposable.checked) disposable.click();
      document.getElementById('genetics-final-confirm').click();
    `);
    await browser.click("#genetics-injection-apply");
    await browser.waitFor(
      "return document.getElementById('genetics-safety-status')" +
      ".textContent.includes('Engine confirmed');");
  });

test("a pending file load does not replace a new draft", { skip }, async () => {
  const { browser, engine } = suite;
  engine.state.genomeDelayMs = 500;
  await browser.click('.genetics-file-item[data-id="norn.fake.48"]');
  await browser.click("#btn-genetics-new");
  await browser.waitFor(
    "return document.getElementById('genetics-identity-current')" +
    ".textContent.includes('Unsaved browser draft');");
  await delay(900);
  engine.state.genomeDelayMs = 0;
  assert.match(await browser.evaluate(
    "return document.getElementById('genetics-identity-current').textContent;"),
  /Unsaved browser draft/);
  await browser.click(
    '.genetics-file-item.genetics-file-item--copy, ' +
    '#genetics-file-list .genetics-file-item:last-child');
  await browser.waitFor(
    "return document.querySelector('.g-btn-up');", { timeout: 6000 });
});

test("an added Brain Lobe can be saved (OBS-007)", { skip }, async () => {
  const { browser, engine } = suite;
  const before = await browser.evaluate(
    "return document.querySelectorAll('.crt-gene-card').length;");
  await browser.select("#genetics-add-gene-type", "0/0");
  await browser.click("#btn-genetics-add-gene");
  await browser.waitFor(
    "return document.querySelectorAll('.crt-gene-card').length === " +
    (before + 1) + ";");
  await browser.waitFor(
    "return !document.getElementById('btn-genetics-save').disabled;");
  await browser.click("#btn-genetics-save");
  await browser.waitFor(
    "return document.getElementById('genetics-safety-status')" +
    ".textContent.includes('Engine saved');");
  const saved = engine.state.requests
    .filter(item => item.route === "/api/genetics/save-experiment").pop();
  const lobe = saved.request.genes[saved.request.genes.length - 1];
  assert.equal(lobe.data.initRuleBytes.length, 48);
  assert.equal(lobe.data.updateRuleBytes.length, 48);
  assert.deepEqual(await pageErrors(browser), []);
});
