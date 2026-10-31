// harness.cjs — shared setup for Firefox interaction tests
//
// Runs against the synthetic engine by default. Set OBSERVATORY_URL to point
// the same tests at a live lc2e on a disposable world; tests that need fixture
// control are skipped there.
"use strict";

const { launch, firefoxPath, delay, VIEWPORT } = require("./marionette.cjs");
const { createEngine } = require("./fake_engine.cjs");

const LIVE_URL = process.env.OBSERVATORY_URL || null;
const available = Boolean(firefoxPath());

// Fails the test on anything the page itself reports as broken.
const PAGE_MONITOR = `
  window.__pageErrors = [];
  window.addEventListener("error", event =>
    window.__pageErrors.push(String(event.message)));
  window.addEventListener("unhandledrejection", event =>
    window.__pageErrors.push(String(event.reason)));
`;

async function open(browser, baseUrl, route) {
  await browser.navigate(baseUrl + (route || ""));
  await browser.evaluate(PAGE_MONITOR);
  await browser.waitFor(
    "return document.getElementById('session-state') && " +
    "ObservatoryState.getState().connection.status === 'connected' && " +
    "ObservatoryState.getState().world.identity !== null;");
}

async function startSuite() {
  const engine = LIVE_URL ? null : createEngine();
  const baseUrl = LIVE_URL || await engine.listen();
  const browser = await launch();
  return {
    engine,
    baseUrl,
    browser,
    live: Boolean(LIVE_URL),
    async stop() {
      await browser.close();
      if (engine) await engine.close();
    }
  };
}

async function pageErrors(browser) {
  return browser.evaluate("return window.__pageErrors || [];");
}

async function goTo(browser, routeId) {
  await browser.click('.nav-route-button[data-route-id="' + routeId + '"]');
}

async function selectFirstCreature(browser) {
  await goTo(browser, "creatures");
  await browser.waitFor("return document.querySelector('.crt-list-item');");
  await browser.click(".crt-list-item");
  await browser.waitFor(
    "return ObservatoryState.getState().selection.creature;");
}

module.exports = {
  available,
  open,
  startSuite,
  pageErrors,
  goTo,
  selectFirstCreature,
  delay,
  VIEWPORT
};
