"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toolsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(toolsRoot, "..");
const docsRoot = path.join(toolsRoot, "docs");
const Navigation = require("../observatory_navigation.js");
const Help = require("../contextual_help_model.js");

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

test("release, migration, and rollback guidance is published offline", () => {
  const index = JSON.parse(read("tools/docs/index.json"));
  const indexed = new Set(index.map(entry => entry.file));
  [
    "observatory_release_validation.md",
    "observatory_migration_and_rollback.md"
  ].forEach(file => {
    assert.ok(indexed.has(file), file + " is not in the wiki index");
    assert.ok(fs.existsSync(path.join(docsRoot, file)), file + " is missing");
  });

  const release = read("tools/docs/observatory_release_validation.md");
  [
    "End-to-End Investigation Matrix",
    "Semantic Audit",
    "Safety Audit",
    "Performance and Supported Limits",
    "Accessibility and Resilience",
    "Exact Verification Results",
    "Known Limitations",
    "Release Checklist"
  ].forEach(heading => assert.match(release,
    new RegExp("^## " + heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "m")));
  assert.doesNotMatch(release, /\b(?:TODO|TBD|pending verification)\b/i);

  const migration = read("tools/docs/observatory_migration_and_rollback.md");
  [
    "Route Compatibility",
    "API Compatibility Boundary",
    "Saved and Exported Schemas",
    "Rollback Procedure",
    "Capability Detection"
  ].forEach(heading => assert.match(migration,
    new RegExp("^## " + heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "m")));
});

test("the published route map and help inventory cover every live route", () => {
  const navigation = read("tools/docs/observatory_navigation_dashboard.md");
  const inventory = read("tools/docs/contextual_help_inventory.md");
  const helpDefinitions = Help.HELP_DEFINITIONS;

  Navigation.ROUTE_DEFINITIONS.forEach(route => {
    assert.match(navigation, new RegExp("\\| `" +
      route.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "` \\|"));
    assert.ok(helpDefinitions["route." + route.id],
      "missing route help: " + route.id);
  });
  Object.entries(Navigation.LEGACY_ROUTE_ALIASES).forEach(([legacy, route]) => {
    assert.ok(navigation.includes("`" + legacy + "`"), legacy);
    assert.ok(navigation.includes("`" + route + "`"), route);
  });
  Object.values(helpDefinitions).forEach(item => {
    assert.ok(item.owner, item.id + " has no review owner");
    assert.ok(item.routeId || item.selector,
      item.id + " has no live route or target");
    assert.ok(inventory.includes("`" + item.id + "`"),
      item.id + " is absent from the published inventory");
  });
});

test("API and MCP docs state the compatibility and safety boundaries", () => {
  const api = read("tools/docs/api_reference.md");
  [
    "GET /api/session",
    "GET /api/creatures/snapshot",
    "GET /api/ecology/snapshot",
    "GET /api/creature/:id/observation",
    "POST /api/creature/:id/chemical-intervention",
    "POST /api/world/branch",
    "POST /api/caos/evaluate",
    "POST /api/caos/script",
    "GET /api/events"
  ].forEach(endpoint => assert.ok(api.includes(endpoint), endpoint));
  assert.match(api, /schema-versioned/i);
  assert.match(api, /legacy compatibility endpoint/i);

  const mcp = read("mcp/MCP.md");
  assert.match(mcp, /^## Observatory Scope and Limitations$/m);
  assert.match(mcp, /does not expose every browser Observatory workflow/i);
  assert.match(mcp, /execute_caos[\s\S]*bypass/i);
  assert.match(mcp, /safe chemical\s+intervention/i);
  assert.match(mcp, /copy-first genetics/i);
});

test("release docs preserve the evidence and inference boundary", () => {
  const sources = [
    read("tools/docs/observatory_release_validation.md"),
    read("tools/docs/observatory_migration_and_rollback.md"),
    read("tools/TOOLS.md")
  ].join("\n");
  ["Observed", "Derived", "Inferred", "Unknown"].forEach(level =>
    assert.ok(sources.includes(level), level));
  assert.match(sources, /does not prove why/i);
  assert.match(sources, /glycogen[\s\S]{0,120}not overall health/i);
  assert.match(sources, /cannot be truly undone/i);
});

test("release documentation does not introduce proprietary artifacts", () => {
  const allowed = new Set([".md", ".json", ".png"]);
  const releaseFiles = [
    "observatory_release_validation.md",
    "observatory_migration_and_rollback.md"
  ];
  releaseFiles.forEach(file => assert.equal(path.extname(file), ".md"));

  const imageRoot = path.join(docsRoot, "images", "observatory");
  fs.readdirSync(imageRoot).forEach(file => {
    assert.ok(allowed.has(path.extname(file).toLowerCase()), file);
  });
  const forbidden = /\.(?:gen|gno|gxp|world|creature|cos|catalogue|catalog)$/i;
  fs.readdirSync(imageRoot).forEach(file =>
    assert.doesNotMatch(file, forbidden));
});
