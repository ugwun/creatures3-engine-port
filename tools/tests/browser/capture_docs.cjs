"use strict";

// Regenerates the documentation screenshots from the synthetic engine, so the
// images show the current interface and contain no real world, creature or
// genome data. Run from the repository root:
//
//   node tools/tests/browser/capture_docs.cjs

const path = require("node:path");
const {
  open, startSuite, goTo, selectFirstCreature, delay, VIEWPORT
} = require("./harness.cjs");

const IMAGES = path.resolve(__dirname, "../../docs/images/observatory");
const MEDIA = path.resolve(__dirname, "../../docs/media");

async function capture() {
  const suite = await startSuite();
  const { browser, baseUrl } = suite;
  const image = name => browser.screenshot(path.join(IMAGES, name));
  const media = name => browser.screenshot(path.join(MEDIA, name));
  try {
    await browser.setViewport(1600, 940);
    await open(browser, baseUrl);
    await selectFirstCreature(browser);
    await delay(2500);
    await media("tab_creatures.png");
    await image("shared-context-creature-firefox.png");

    await browser.click("#crt-observation-strip > summary");
    await delay(2500);
    await image("live-observation-strip-firefox.png");

    await goTo(browser, "dashboard");
    await delay(1500);
    await image("observatory-dashboard-firefox.png");

    await browser.click("#session-summary");
    await delay(300);
    await image("session-status-ribbon-firefox.png");
    await browser.click("#session-popover-close");

    await goTo(browser, "timeline");
    await browser.waitFor(
      "return document.querySelector('.timeline-event');", { timeout: 15000 });
    await browser.click(".timeline-event");
    await delay(600);
    await image("ethology-timeline-firefox.png");

    await goTo(browser, "compare");
    await browser.waitFor(
      "return document.querySelector('[data-compare-subject]');",
      { timeout: 10000 });
    await browser.click("#compare-select-all");
    await delay(800);
    await image("creature-cohort-comparison-firefox.png");

    await goTo(browser, "ecology");
    await delay(2000);
    await image("world-ecology-observatory-firefox.png");

    await goTo(browser, "scripts");
    await delay(800);
    await media("tab_scripts.png");

    await goTo(browser, "logs");
    await delay(1800);
    await media("tab_log.png");

    await goTo(browser, "experiments");
    await delay(800);
    await image("experiment-workspace-firefox.png");

    await goTo(browser, "chemicals");
    await delay(1200);
    await image("safe-chemical-intervention-firefox.png");

    await goTo(browser, "genetics");
    await browser.waitFor(
      "return document.querySelector('.genetics-file-item');");
    await browser.click(".genetics-file-item");
    await browser.waitFor(
      "return !document.getElementById('btn-genetics-create-copy').disabled;");
    await browser.click("#btn-genetics-create-copy");
    await browser.waitFor("return document.querySelector('.g-btn-up');");
    await browser.click('.crt-gene-card[data-idx="1"] .g-btn-up');
    await delay(400);
    await image("safe-genetics-experiment-firefox.png");

    await goTo(browser, "workbench");
    await browser.evaluate(`
      const editor = document.getElementById('ide-editor');
      editor.value = 'outv wtik';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await delay(1800);
    await image("caos-workbench-firefox.png");

    await goTo(browser, "architecture");
    await delay(1200);
    await image("live-architecture-graph-firefox.png");

    await browser.evaluate(
      "ContextualHelp.open('concept.evidence-levels', document.body);");
    await delay(400);
    await image("contextual-help-drawer-firefox.png");
    await browser.evaluate(
      "document.querySelector('#context-help-drawer button').click();");

    await browser.click("#btn-accessibility");
    await delay(300);
    await image("accessibility-display-dialog-firefox.png");
    await browser.evaluate(
      "document.querySelector('dialog[open] button').click();");

    await browser.setViewport(720, 900);
    await delay(500);
    await image("narrow-observatory-firefox.png");
    await browser.setViewport(VIEWPORT.width, VIEWPORT.height);
  } finally {
    await suite.stop();
  }
}

capture().catch(error => {
  console.error(error);
  process.exit(1);
});
