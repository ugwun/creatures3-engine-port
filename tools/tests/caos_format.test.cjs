"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatCAOS, sourceOffsetsForFormattedLines
} = require("../caos_format.js");

test("formatted lines map back to their position in the raw source", () => {
  const raw = "inst setv va00 1 doif va00 eq 1 outv 2 endi stop";
  const formatted = formatCAOS(raw);
  const lines = formatted.split("\n");
  assert.ok(lines.length >= 5, formatted);
  const offsets = sourceOffsetsForFormattedLines(raw, formatted);
  assert.equal(offsets.length, lines.length);
  lines.forEach((line, index) => {
    const text = line.trim();
    if (text) assert.equal(raw.slice(offsets[index]).indexOf(text), 0, text);
  });
});

test("indentation does not shift later lines", () => {
  const raw = "doif 1 eq 1 outv 1 outv 2 endi outv 3";
  const offsets = sourceOffsetsForFormattedLines(raw, formatCAOS(raw));
  assert.equal(offsets[offsets.length - 1], raw.lastIndexOf("outv 3"));
});

test("source that already has line breaks maps unchanged", () => {
  const raw = "setv va00 1\nsetv va01 2\n";
  const offsets = sourceOffsetsForFormattedLines(raw, "setv va00 1\nsetv va01 2");
  assert.deepEqual(offsets, [0, 12]);
});
