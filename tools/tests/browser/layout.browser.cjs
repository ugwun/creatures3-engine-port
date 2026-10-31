"use strict";

// OBS-002 and the below-the-fold class of bug: at notebook size the panels
// worked, but their content sat outside the visible, scrollable area.

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, goTo, selectFirstCreature, VIEWPORT, delay
} = require("./harness.cjs");
const { ROUTE_DEFINITIONS } = require("../../observatory_navigation.js");

const skip = available ? false : "Firefox is not installed";
const SUBVIEWS = ["drives", "chemistry", "organs", "brain", "genome"];
let suite;

// How much room the active subview has on screen. This measures the space, not
// the subview's own box, which is one line tall while its data loads.
const visibleSubview = `
  const view = document.querySelector('.crt-subview:not([hidden])');
  const box = view.getBoundingClientRect();
  const content = document.getElementById('crt-detail-content')
    .getBoundingClientRect();
  const top = Math.max(box.top, content.top, 0);
  const bottom = Math.min(content.bottom, innerHeight);
  return { top, visibleHeight: Math.max(0, bottom - top), id: view.id };
`;

async function assertSubviewsVisible(browser, minimum) {
  for (const view of SUBVIEWS) {
    await browser.click('.crt-sub-btn[data-subtab="' + view + '"]');
    await browser.waitFor(
      "return document.getElementById('crt-" + view + "').hidden === false;");
    await delay(50);
    const seen = await browser.evaluate(visibleSubview);
    assert.equal(seen.id, "crt-" + view);
    assert.ok(seen.visibleHeight >= minimum,
      view + " shows only " + seen.visibleHeight + "px at y=" + seen.top);
  }
}

before(async () => {
  if (skip) return;
  suite = await startSuite();
  await open(suite.browser, suite.baseUrl);
  await selectFirstCreature(suite.browser);
});

after(async () => {
  if (suite) await suite.stop();
});

test("subtabs show their content at notebook size (OBS-002)",
  { skip }, async () => {
    await assertSubviewsVisible(suite.browser, 300);
  });

test("subtabs stay reachable with both evidence strips open",
  { skip }, async () => {
    const { browser } = suite;
    for (const id of ["crt-observation-strip", "crt-bio-monitor"]) {
      if (!await browser.evaluate(
        "return document.getElementById(arguments[0]).open;", id)) {
        await browser.click("#" + id + " > summary");
      }
    }
    await assertSubviewsVisible(browser, 250);
    assert.ok(await browser.evaluate(
      "const panel = document.getElementById('crt-detail-panel');" +
      "return panel.scrollHeight > panel.clientHeight;"),
    "the panel scrolls rather than clipping");
  });

test("a collapsed strip stays collapsed after reload", { skip }, async () => {
  const { browser, baseUrl } = suite;
  await browser.click("#crt-bio-monitor > summary");
  await browser.waitFor(
    "return !document.getElementById('crt-bio-monitor').open;");
  await open(browser, baseUrl);
  await selectFirstCreature(browser);
  assert.equal(await browser.evaluate(
    "return document.getElementById('crt-bio-monitor').open;"), false);
  assert.equal(await browser.evaluate(
    "return document.getElementById('crt-observation-strip').open;"), true);
});

test("Brain gets a usable canvas on a large screen", { skip }, async () => {
  const { browser, baseUrl } = suite;
  await browser.setViewport(1920, 1080);
  await open(browser, baseUrl);
  await selectFirstCreature(browser);
  await browser.click('.crt-sub-btn[data-subtab="brain"]');
  await delay(100);
  const height = await browser.evaluate(
    "return document.getElementById('crt-brain-viewport')" +
    ".getBoundingClientRect().height;");
  assert.ok(height >= 300, "Brain viewport is " + height + "px tall");
  await browser.setViewport(VIEWPORT.width, VIEWPORT.height);
});

// Anything clipped by an ancestor that cannot scroll is simply unreachable.
const clippedControls = `
  const panel = document.querySelector('.tab-panel:not([hidden])');
  const controls = panel.querySelectorAll(
    'button, select, input:not([type=hidden]), textarea, a[href], summary');
  const clipped = [];
  const canScroll = style => /(auto|scroll)/.test(
    style.overflowY + style.overflowX);
  controls.forEach(control => {
    if (control.closest('[hidden], dialog:not([open]), details:not([open]) > :not(summary)')) return;
    const box = control.getBoundingClientRect();
    if (!box.width || !box.height) return;
    for (let node = control.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const limit = node.getBoundingClientRect();
      const outside = box.bottom > limit.bottom + 1 || box.right > limit.right + 1;
      if (canScroll(style)) {
        if (outside) break;
        continue;
      }
      if (style.overflowY === 'hidden' && outside) {
        clipped.push((control.id || control.className || control.tagName) +
          ' in ' + (node.id || node.className));
        break;
      }
    }
  });
  return clipped.slice(0, 12);
`;

test("no route hides a control where it cannot be scrolled to",
  { skip }, async () => {
    const { browser, baseUrl } = suite;
    await open(browser, baseUrl);
    await selectFirstCreature(browser);
    const problems = {};
    for (const route of ROUTE_DEFINITIONS) {
      await goTo(browser, route.id);
      await delay(250);
      const clipped = await browser.evaluate(clippedControls);
      if (clipped.length) problems[route.id] = clipped;
    }
    assert.deepEqual(problems, {});
  });

// Text wider than its own button or badge paints over its neighbours.
const overflowingControls = `
  const panel = document.querySelector('.tab-panel:not([hidden])');
  const found = [];
  panel.querySelectorAll('button, .btn-light, label, select').forEach(item => {
    if (item.closest('[hidden]')) return;
    const box = item.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const style = getComputedStyle(item);
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) return;
    if (item.scrollWidth > item.clientWidth + 1) {
      found.push((item.id || item.className || item.tagName) + ': ' +
        item.textContent.trim().slice(0, 30) + ' ' +
        item.scrollWidth + '>' + item.clientWidth);
    }
  });
  return found.slice(0, 10);
`;

test("controls fit their labels on every route (OBS-003)", { skip }, async () => {
  const { browser } = suite;
  const problems = {};
  for (const route of ROUTE_DEFINITIONS) {
    await goTo(browser, route.id);
    await delay(250);
    const found = await browser.evaluate(overflowingControls);
    if (found.length) problems[route.id] = found;
  }
  assert.deepEqual(problems, {});
});

test("organ metrics do not paint over each other (OBS-003)",
  { skip }, async () => {
    const { browser } = suite;
    await goTo(browser, "creatures");
    await browser.click('.crt-sub-btn[data-subtab="organs"]');
    await browser.waitFor(
      "return document.querySelector('[data-organ-toggle]');");
    await browser.click("[data-organ-toggle]");
    await browser.waitFor("return document.querySelector('.org-stat');");
    const overlaps = await browser.evaluate(`
      return Array.from(document.querySelectorAll('.org-stat'))
        .filter(stat => stat.scrollWidth > stat.clientWidth + 1).length;
    `);
    assert.equal(overlaps, 0);
  });

test("hidden elements are really hidden on every route", { skip }, async () => {
  const { browser } = suite;
  const problems = {};
  for (const route of ROUTE_DEFINITIONS) {
    await goTo(browser, route.id);
    await delay(250);
    const visible = await browser.evaluate(`
      return Array.from(document.querySelectorAll('[hidden]'))
        .filter(item => getComputedStyle(item).display !== 'none')
        .map(item => item.id || item.className || item.tagName);
    `);
    if (visible.length) problems[route.id] = visible;
  }
  assert.deepEqual(problems, {});
});

test("the page itself never needs horizontal scrolling", { skip }, async () => {
  const { browser } = suite;
  for (const route of ROUTE_DEFINITIONS) {
    await goTo(browser, route.id);
    await delay(100);
    const overflow = await browser.evaluate(
      "return document.documentElement.scrollWidth - " +
      "document.documentElement.clientWidth;");
    assert.ok(overflow <= 0, route.id + " overflows by " + overflow + "px");
  }
});
