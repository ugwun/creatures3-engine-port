"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Model = require("../accessibility_model.js");
const LogModel = require("../log_model.js");
const Timeline = require("../ethology_timeline.js");

const toolsRoot = path.resolve(__dirname, "..");

test("semantic colour pairs meet their documented contrast targets", () => {
  Model.CONTRAST_PAIRS.forEach(pair => {
    assert.ok(
      Model.contrastRatio(pair.foreground, pair.background) >= pair.target,
      pair.name + " did not meet " + pair.target + ":1"
    );
  });
  assert.equal(Model.contrastRatio("#000000", "#ffffff"), 21);
  assert.throws(() => Model.luminance("orange"), /hexadecimal/);
});

test("accessibility preferences normalize unsafe persisted values", () => {
  assert.deepEqual(Model.normalizePreferences(), Model.DEFAULTS);
  assert.deepEqual(Model.normalizePreferences({
    density: "compact",
    reducedMotion: true,
    shortcutsEnabled: false
  }), {
    density: "compact",
    reducedMotion: true,
    shortcutsEnabled: false
  });
  assert.deepEqual(Model.normalizePreferences({
    density: "microscopic",
    reducedMotion: "yes",
    shortcutsEnabled: 0
  }), Model.DEFAULTS);
});

test("global shortcuts can identify editable targets", () => {
  assert.equal(Model.isEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(Model.isEditableTarget({ tagName: "textarea" }), true);
  assert.equal(Model.isEditableTarget({ tagName: "select" }), true);
  assert.equal(Model.isEditableTarget({ isContentEditable: true }), true);
  assert.equal(Model.isEditableTarget({
    tagName: "SPAN",
    closest: selector => selector.includes("role='textbox'") ? {} : null
  }), true);
  assert.equal(Model.isEditableTarget({ tagName: "BUTTON" }), false);
  assert.equal(Model.isEditableTarget(null), false);
});

test("published shortcuts have unique keys and non-empty descriptions", () => {
  const keys = Model.SHORTCUTS.map(shortcut => shortcut.keys);
  assert.equal(new Set(keys).size, keys.length);
  Model.SHORTCUTS.forEach(shortcut => {
    assert.ok(shortcut.keys);
    assert.ok(shortcut.label);
  });
});

test("shell publishes shared keyboard and screen-reader primitives", () => {
  const html = fs.readFileSync(path.join(toolsRoot, "index.html"), "utf8");
  const runtime = fs.readFileSync(
    path.join(toolsRoot, "accessibility.js"), "utf8");
  const css = fs.readFileSync(path.join(toolsRoot, "style.css"), "utf8");

  assert.match(html, /id="skip-to-workspace"/);
  assert.match(html, /id="route-announcer"[\s\S]*aria-live="polite"/);
  assert.match(html, /id="accessibility-dialog"[\s\S]*aria-labelledby=/);
  assert.match(html, /id="ecology-map-text-content"/);
  assert.match(html, /id="timeline-event-list" role="list"/);
  assert.match(html, /id="crt-brain-svg" role="group"/);
  assert.match(runtime, /setAttribute\("role", "tablist"\)/);
  assert.match(runtime, /Model\.isEditableTarget\(event\.target\)/);
  assert.match(runtime, /restoreFocus\.focus\(\)/);
  assert.match(css, /--focus-light:\s*#005FCC/i);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /body\[data-density="compact"\]/);
  assert.match(css, /#docs-wiki-toc-panel\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /#docs-wiki-view\s*\{[\s\S]*grid-template-rows:/);
  assert.match(css, /\.markdown-body table\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(css, /@import\s+url\(['"]https?:/);
});

test("representative dense logs and timeline retention stay bounded and responsive", () => {
  const started = performance.now();
  const buffer = LogModel.createBuffer({
    maxRecords: 5000,
    maxBytes: 50 * 1024 * 1024
  });
  for (let index = 0; index < 5000; index++) {
    buffer.ingest({
      streamId: "performance",
      recordId: index,
      message: "Representative record " + index,
      severity: index % 10 ? "info" : "error",
      subsystem: "caos",
      worldName: "Performance World",
      worldTick: index,
      agent: {id: 7}
    });
  }
  const errors = LogModel.filterRecords(buffer.records(), {
    severities: new Set(["error"]),
    subsystems: new Set(["caos"])
  });
  assert.equal(buffer.records().length, 5000);
  assert.equal(errors.length, 500);

  const timeline = Timeline.createStore({
    maxEvents: 2000,
    maxSnapshots: 10,
    maxBytes: 50 * 1024 * 1024,
    maxDurationTicks: 10000
  });
  timeline.setContext({
    worldKey: "world:performance",
    worldName: "Performance World",
    subjectKey: "creature:performance",
    subjectLabel: "Performance creature",
    subjectAgentId: 7,
    worldTick: 0
  });
  for (let index = 0; index < 2500; index++) {
    timeline.ingestLog({
      id: "performance-" + index,
      severity: "error",
      subsystem: "caos",
      worldName: "Performance World",
      worldTick: index,
      contextTiming: "engine_main_thread",
      message: "Representative event " + index,
      agent: {id: 7}
    });
  }
  const retained = timeline.query({});
  assert.equal(retained.length, 2000);
  assert.equal(timeline.activeSession().droppedEvents, 500);
  assert.ok(timeline.activeSession().byteCount <
    50 * 1024 * 1024);
  assert.ok(performance.now() - started < 2500,
    "representative dense-data pass exceeded 2.5 seconds");
});
