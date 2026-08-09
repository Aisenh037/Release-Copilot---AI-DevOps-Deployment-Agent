import { test } from "node:test";
import assert from "node:assert/strict";
import { operations, toolNameFor, resolveCanonicalId } from "./registry";
import { TOOL_GUIDANCE } from "./prompt-block";
import { artifactLinkFor } from "./artifacts";

test("tool names round-trip back to canonical operation ids", () => {
  assert.ok(operations.length >= 8);
  for (const op of operations) {
    const name = toolNameFor(op.id);
    assert.doesNotMatch(name, /\./);
    assert.equal(resolveCanonicalId(name), op.id);
  }
});

test("unknown tool names pass through resolveCanonicalId unchanged", () => {
  assert.equal(resolveCanonicalId("someone_elses_tool"), "someone_elses_tool");
});

test("TOOL_GUIDANCE lists every operation with its sanitized name", () => {
  for (const op of operations) {
    assert.ok(TOOL_GUIDANCE.includes(toolNameFor(op.id)), `${op.id} missing from guidance`);
    assert.ok(TOOL_GUIDANCE.includes(op.intent), `${op.intent} missing from guidance`);
  }
});

test("artifactLinkFor picks html_url from kernel envelopes and arrays", () => {
  const envelope = { ok: true, status: 200, url: "x", data: [{ html_url: "https://github.com/a/b/commit/1" }] };
  assert.equal(artifactLinkFor("github.commits.list", envelope), "https://github.com/a/b/commit/1");
});

test("artifactLinkFor returns null for failed and dry-run results", () => {
  assert.equal(artifactLinkFor("github.commits.list", { ok: false, error: "nope" }), null);
  assert.equal(artifactLinkFor("github.commits.list", { ok: true, dryRun: true, request: {} }), null);
});

test("artifactLinkFor falls back to generic fields for unknown tools", () => {
  assert.equal(artifactLinkFor("mystery.tool", { url: "https://example.com/x" }), "https://example.com/x");
});

test("notion transformResult synthesizes the page url that its selector picks", () => {
  const notionOp = operations.find((op) => op.id === "notion.report.append");
  assert.ok(notionOp?.transformResult);
  const data = notionOp.transformResult({}, { page_id: "ab-cd-ef" }) as { url: string };
  assert.equal(data.url, "https://www.notion.so/abcdef");
  assert.equal(
    artifactLinkFor("notion.report.append", { ok: true, status: 200, url: "x", data }),
    "https://www.notion.so/abcdef"
  );
});
