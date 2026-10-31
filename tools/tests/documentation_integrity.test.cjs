"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Help = require("../contextual_help_model.js");
const Navigation = require("../observatory_navigation.js");

const toolsRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(toolsRoot, "docs");

function headings(documentPath) {
  const markdown = fs.readFileSync(documentPath, "utf8");
  const slugs = new Set();
  markdown.split(/\r?\n/).forEach(line => {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) return;
    const slug = match[1].toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    if (slug) slugs.add(slug);
  });
  return slugs;
}

function splitTarget(raw) {
  const value = raw.trim().replace(/^<|>$/g, "");
  const hash = value.indexOf("#");
  return {
    file: hash < 0 ? value : value.slice(0, hash),
    section: hash < 0 ? null : decodeURIComponent(value.slice(hash + 1))
  };
}

function resolveLocal(sourceFile, target) {
  if (target.startsWith("/docs/")) {
    return path.join(toolsRoot, target.slice(1));
  }
  if (target.startsWith("/")) {
    return path.join(toolsRoot, target.slice(1));
  }
  return path.resolve(path.dirname(sourceFile), target);
}

function markdownTargets(markdown) {
  const results = [];
  const expression = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let match;
  while ((match = expression.exec(markdown))) results.push(match[1]);
  return results;
}

test("documentation index and local links resolve", () => {
  const index = JSON.parse(fs.readFileSync(
    path.join(docsRoot, "index.json"), "utf8"));
  const files = index.map(entry => entry.file);
  assert.equal(new Set(files).size, files.length,
    "documentation index contains duplicate files");
  files.forEach(file => assert.ok(
    fs.existsSync(path.join(docsRoot, file)),
    "indexed document does not exist: " + file
  ));

  const errors = [];
  fs.readdirSync(docsRoot)
    .filter(file => file.endsWith(".md"))
    .forEach(file => {
      const source = path.join(docsRoot, file);
      const markdown = fs.readFileSync(source, "utf8");
      markdownTargets(markdown).forEach(raw => {
        if (/^(?:https?:|mailto:|data:)/.test(raw) ||
            raw.startsWith("#")) return;
        const target = splitTarget(raw);
        const resolved = resolveLocal(source, target.file);
        if (!fs.existsSync(resolved)) {
          errors.push(file + " → missing " + raw);
          return;
        }
        if (target.section && resolved.endsWith(".md") &&
            !headings(resolved).has(target.section)) {
          errors.push(file + " → missing section " + raw);
        }
      });
    });
  assert.deepEqual(errors, []);
});

test("route and contextual-help documentation targets resolve", () => {
  const errors = Help.validate(Navigation.ROUTE_DEFINITIONS);
  Navigation.ROUTE_DEFINITIONS.forEach(route => {
    if (!route.help || !fs.existsSync(path.join(docsRoot, route.help)))
      errors.push("Route help missing: " + route.id + " → " + route.help);
  });
  Object.values(Help.HELP_DEFINITIONS).forEach(item => {
    ["guide", "reference"].forEach(kind => {
      const target = item[kind];
      if (!target) return;
      const file = path.join(docsRoot, target.document);
      if (!fs.existsSync(file)) {
        errors.push(item.id + " → missing " + kind + " " +
          target.document);
      } else if (target.section &&
          !headings(file).has(target.section)) {
        errors.push(item.id + " → missing section " +
          target.document + "#" + target.section);
      }
    });
  });
  assert.deepEqual(errors, []);
});

test("published help inventory matches the authoritative registry", () => {
  const inventory = fs.readFileSync(
    path.join(docsRoot, "contextual_help_inventory.md"), "utf8");
  const listed = new Set();
  const expression = /\|\s*`([^`]+)`\s*\|/g;
  let match;
  while ((match = expression.exec(inventory))) listed.add(match[1]);
  assert.deepEqual(
    Array.from(listed).sort(),
    Object.keys(Help.HELP_DEFINITIONS).sort()
  );
});

test("standard Tab navigation is not documented or implemented as tooltip pinning", () => {
  const sources = [
    path.join(toolsRoot, "tooltips.js"),
    path.join(toolsRoot, "TOOLS.md"),
    path.join(toolsRoot, "ARCHITECTURE.md"),
    path.join(docsRoot, "tools_overview.md"),
    path.join(docsRoot, "contextual_help_authoring.md")
  ].map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /(?:press|use|using)\s+`?Tab`?\s+to\s+pin/i);
  assert.doesNotMatch(sources, /e\.key\s*===?\s*['"]Tab['"][\s\S]{0,120}preventDefault/);
});
