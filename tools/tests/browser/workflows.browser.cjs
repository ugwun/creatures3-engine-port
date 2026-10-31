"use strict";

// Mutating workflows, end to end against a real engine. These change the world
// and genome files, so they need a disposable copy of the game data:
//
//   OBSERVATORY_URL=http://127.0.0.1:9980/ OBSERVATORY_ALLOW_CHANGES=1 \
//     node --test --test-concurrency=1 tools/tests/browser/workflows.browser.cjs

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const {
  available, open, startSuite, pageErrors, goTo, selectFirstCreature, delay
} = require("./harness.cjs");

const skip = !available ? "Firefox is not installed"
  : !process.env.OBSERVATORY_URL || !process.env.OBSERVATORY_ALLOW_CHANGES
    ? "needs OBSERVATORY_URL and OBSERVATORY_ALLOW_CHANGES on a disposable world"
    : false;
const UNIQUE = Date.now().toString(36);
const CLASSIFIER = { family: 1, genus: 9, species: 77, event: 9 };
let suite;

async function api(path, body) {
  const response = await fetch(suite.baseUrl + path.slice(1), body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  } : undefined);
  return response.json();
}

async function setEditor(browser, source) {
  await browser.evaluate(`
    const editor = document.getElementById('ide-editor');
    editor.value = arguments[0];
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  `, source);
}

async function scratchpad(browser, code) {
  await browser.evaluate(`
    const input = document.getElementById('console-input');
    input.value = arguments[0];
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true
    }));
  `, code);
}

async function applyReviewed(browser) {
  await browser.waitFor(
    "return !document.getElementById('btn-ide-apply').disabled;",
    { timeout: 6000 });
  await browser.click("#btn-ide-apply");
  await browser.waitFor(
    "return document.getElementById('ide-confirm-dialog').open;");
  await browser.click("#ide-confirm-checkbox");
  await browser.click("#ide-confirm-apply");
  await browser.waitFor(
    "return !document.getElementById('ide-confirm-dialog').open;",
    { timeout: 12000 });
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

test("Scratchpad reads but refuses to change the world", { skip }, async () => {
  const { browser } = suite;
  await goTo(browser, "scratchpad");
  await scratchpad(browser, "outv 41");
  await browser.waitFor(
    "return document.getElementById('console-output')" +
    ".textContent.includes('41');");

  const key = "obs_probe_" + UNIQUE;
  await scratchpad(browser, 'setv game "' + key + '" 1');
  await browser.waitFor(
    "return document.querySelector('.console-workbench-link');");
  const value = await api("/api/execute", {
    caos: 'outv type game "' + key + '"'
  });
  assert.match(value.output, /^0/);

  await scratchpad(browser, "rtar 4 0 0 aslp 1");
  await delay(400);
  assert.equal(await browser.evaluate(
    "return document.querySelectorAll('.console-workbench-link').length;"), 2);
});

test("Workbench installs, replaces and removes an event", { skip }, async () => {
  const { browser } = suite;
  const path = "/api/scriptorium/" + [
    CLASSIFIER.family, CLASSIFIER.genus,
    CLASSIFIER.species, CLASSIFIER.event
  ].join("/");
  await goTo(browser, "workbench");
  for (const [field, value] of Object.entries(CLASSIFIER)) {
    await browser.evaluate(`
      const input = document.getElementById('ide-' + arguments[0]);
      input.value = arguments[1];
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    `, field, value);
  }

  await browser.click('.ide-mode-button[data-mode="install"]');
  await setEditor(browser, 'outs "installed ' + UNIQUE + '"');
  await applyReviewed(browser);
  await browser.waitFor(
    "return document.getElementById('ide-output').textContent" +
    ".match(/installed|Installed/);");
  assert.match((await api(path)).source || "", /installed/);

  await browser.click('.ide-mode-button[data-mode="replace"]');
  await delay(300);
  await setEditor(browser, 'outs "replaced ' + UNIQUE + '"');
  await applyReviewed(browser);
  await delay(300);
  assert.match((await api(path)).source || "", /replaced/);

  await browser.click('.ide-mode-button[data-mode="remove"]');
  await applyReviewed(browser);
  await delay(300);
  const removed = await api(path);
  assert.ok(!removed.source, "event is gone");
  assert.deepEqual(await pageErrors(browser), []);
});

test("Debugger stops at a breakpoint, steps and continues", { skip }, async () => {
  const { browser } = suite;
  const classifier = { family: 2, genus: 1, species: 9999, event: 9 };
  const removeFixture = "enum 2 1 9999 kill targ next scrx 2 1 9999 9";
  await api("/api/execute", { caos: removeFixture });
  const world = await api("/api/session");
  // One raw line, as real scripts arrive: the display splits and indents it, so
  // this also proves displayed lines map back to engine positions. The loop
  // keeps the script alive, because the Debugger attaches to a running VM.
  const source = "setv ov00 0 loop addv ov00 1 wait 2 addv ov00 2 wait 2 ever";
  const install = await api("/api/caos/script", {
    mode: "install",
    classifier,
    source,
    sourceChecksum: await browser.evaluate(
      "return CaosWorkbenchModel.fingerprint(arguments[0]);", source),
    confirmed: true,
    expectedWorldName: world.worldName,
    expectedWorldSessionId: world.worldSessionId,
    expectedWorldTick: world.worldTick,
    expectedExistingChecksum: null
  });
  assert.ok(install.ok, JSON.stringify(install));
  const created = await api("/api/execute", {
    caos: 'new: simp 2 1 9999 "blnk" 1 0 0 tick 1 outv unid'
  });
  const agentId = Number(created.output);
  assert.ok(agentId > 0, JSON.stringify(created));
  try {
    await goTo(browser, "debugger");
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
      "document.querySelectorAll('#dbg-source-lines .dbg-gutter').length >= 6;",
      { args: [agentId], timeout: 10000 });

    await browser.click(
      "#dbg-source-lines .dbg-line:nth-child(5) .dbg-gutter");
    await browser.waitFor(
      "return !document.getElementById('btn-dbg-step').disabled;",
      { timeout: 10000 });
    await browser.waitFor(
      "return document.querySelector('.dbg-line--current');");
    assert.equal(await browser.evaluate(
      "return document.querySelector('.dbg-line--current').dataset.lineIdx;"),
    "4", "stopped on the clicked line");
    assert.equal(await browser.evaluate(
      "return document.querySelector('.dbg-bp-active').dataset.lineIdx;"),
    "4", "the marker sits on the clicked line");
    const stopped = await browser.evaluate(
      "return document.getElementById('dbg-ctx-ip').textContent;");

    await browser.click("#btn-dbg-step");
    await browser.waitFor(
      "return document.getElementById('dbg-ctx-ip').textContent !== " +
      "arguments[0];", { args: [stopped], timeout: 6000 });

    await browser.click("#btn-dbg-step-over, #btn-dbg-stepover");
    await delay(300);
    await browser.click("#btn-dbg-continue");
    await delay(500);
    assert.deepEqual(await pageErrors(browser), []);
  } finally {
    await api("/api/execute", { caos: removeFixture });
  }
});

test("Chemical intervention applies a reviewed change and records it",
  { skip }, async () => {
    const { browser } = suite;
    await goTo(browser, "chemicals");
    await browser.waitFor(
      "return document.querySelector('#crt-syringe-list [data-id], " +
      "#crt-syringe-list .crt-syringe-item');", { timeout: 8000 });
    await browser.click(
      "#crt-syringe-list [data-id], #crt-syringe-list .crt-syringe-item");
    await browser.select("#crt-syringe-amount", "0.1");
    await browser.waitFor(
      "return !document.getElementById('btn-syringe-inject').disabled;",
      { timeout: 6000 });
    await browser.click("#btn-syringe-inject");
    await browser.waitFor(
      "return document.getElementById('chemical-intervention-dialog').open;");
    await browser.evaluate(`
      const extreme = document.getElementById('chemical-extreme-confirm');
      if (!document.getElementById('chemical-extreme-confirm-row').hidden &&
          !extreme.checked) extreme.click();
      document.getElementById('chemical-dialog-apply').click();
    `);
    await browser.waitFor(
      "return ObservatoryState.getState().interventions.length > 0;",
      { timeout: 8000 });
    assert.deepEqual(await pageErrors(browser), []);
  });

test("Genetics saves an edited copy and injects it exactly once",
  { skip }, async () => {
    const { browser } = suite;
    await goTo(browser, "genetics");
    await browser.waitFor(
      "return document.querySelector('.genetics-file-item[data-id=\"" +
      "norn_astro_48_experiment_01\"]');", { timeout: 8000 });
    await browser.click(
      '.genetics-file-item[data-id="norn_astro_48_experiment_01"]');
    await browser.waitFor(
      "return document.querySelector('.g-btn-dup');", { timeout: 20000 });

    await browser.select("#genetics-add-gene-type", "0/0");
    await browser.click("#btn-genetics-add-gene");
    await browser.waitFor(
      "return !document.getElementById('btn-genetics-save').disabled;");
    await browser.click("#btn-genetics-save");
    await browser.waitFor(
      "return document.getElementById('genetics-safety-status')" +
      ".textContent.includes('Engine saved');", { timeout: 15000 });
    await browser.waitFor(
      "return !document.getElementById('btn-genetics-inject').disabled;",
      { timeout: 15000 });

    const before = (await api("/api/session")).creatureCount;
    await browser.click("#btn-genetics-inject");
    await browser.waitFor(
      "return document.getElementById('genetics-injection-dialog').open;");
    await browser.evaluate(`
      const disposable = document.getElementById('genetics-disposable-confirm');
      if (!disposable.checked) disposable.click();
      document.getElementById('genetics-final-confirm').click();
    `);
    await browser.waitFor(
      "return !document.getElementById('genetics-injection-apply').disabled;");
    await browser.click("#genetics-injection-apply");
    await browser.waitFor(
      "return document.getElementById('genetics-safety-status')" +
      ".textContent.includes('Engine confirmed');", { timeout: 15000 });
    await delay(800);
    assert.equal((await api("/api/session")).creatureCount, before + 1);
    assert.deepEqual(await pageErrors(browser), []);
  });

test("An experiment records baseline, treatment and a manifest",
  { skip }, async () => {
    const { browser } = suite;
    await goTo(browser, "experiments");
    const creatures = await api("/api/creatures");
    assert.ok(creatures.length >= 2);
    await browser.click("#experiment-new").catch(() => {});
    await browser.evaluate(`
      const set = (id, value) => {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('experiment-title', 'Workflow check');
      set('experiment-question', 'Does the lifecycle record evidence?');
      const disposable = document.getElementById('experiment-disposable');
      if (!disposable.checked) disposable.click();
    `);
    const select = async (index, button) => {
      await goTo(browser, "creatures");
      await browser.click(
        '.crt-list-item[data-id="' + creatures[index].agentId + '"]');
      await browser.waitFor(
        "return ObservatoryState.getState().selection.creature.id === " +
        creatures[index].agentId + ";");
      await goTo(browser, "experiments");
      await browser.click(button);
    };
    await select(0, "#experiment-add-control");
    await select(1, "#experiment-add-treatment");
    await browser.click("#experiment-create");
    await browser.waitFor(
      "return !document.getElementById('experiment-start').disabled;",
      { timeout: 8000 });
    await browser.click("#experiment-start");
    await browser.waitFor(
      "return document.getElementById('experiment-phase')" +
      ".textContent.toLowerCase().includes('baseline');", { timeout: 8000 });
    await browser.waitFor(
      "return !document.getElementById('experiment-treatment').disabled;",
      { timeout: 20000 });
    await delay(1500);
    await browser.click("#experiment-treatment");
    await browser.waitFor(
      "return document.getElementById('experiment-phase')" +
      ".textContent.toLowerCase().includes('treatment');", { timeout: 8000 });
    await delay(1500);
    await browser.click("#experiment-stop");
    await browser.waitFor(
      "return !document.getElementById('experiment-export').disabled;",
      { timeout: 8000 });
    const provenance = await browser.evaluate(
      "return document.getElementById('experiment-provenance').textContent;");
    assert.match(provenance, /Engine [0-9a-f]{12}/);
    assert.deepEqual(await pageErrors(browser), []);
  });

test("A world branch is created without loading it", { skip }, async () => {
  const { browser } = suite;
  const name = "obs-branch-" + UNIQUE;
  await browser.evaluate(`
    const input = document.getElementById('experiment-branch-name');
    input.value = arguments[0];
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `, name);
  await browser.click("#experiment-branch-preview");
  await browser.waitFor(
    "return document.getElementById('experiment-branch-dialog').open;");
  await browser.click("#experiment-branch-confirm");
  await browser.click("#experiment-branch-create");
  await browser.waitFor(
    "return document.getElementById('experiment-branch-result')" +
    ".textContent.includes('created and not loaded');", { timeout: 40000 });
  const worlds = await api("/api/worlds");
  assert.ok(worlds.worlds.includes(name));
  assert.notEqual(worlds.currentWorld, name);
  assert.deepEqual(await pageErrors(browser), []);
});

test("Reloading the world resets the session and clears its subject",
  { skip }, async () => {
    const { browser } = suite;
    const before = await api("/api/session");
    await browser.evaluate(`fetch('/api/world/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: arguments[0] })
    });`, before.worldName);
    await browser.waitFor(
      "return ObservatoryState.getState().world.identity && " +
      "ObservatoryState.getState().world.identity.sessionId !== arguments[0] " +
      "&& ObservatoryState.getState().world.status === 'loaded';",
      { args: [before.worldSessionId], timeout: 40000 });
    assert.equal(await browser.evaluate(
      "return ObservatoryState.getState().selection.creature;"), null);
    assert.deepEqual(await pageErrors(browser), []);
  });
