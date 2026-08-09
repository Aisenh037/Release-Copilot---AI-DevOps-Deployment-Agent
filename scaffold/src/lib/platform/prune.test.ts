import { test } from "node:test";
import assert from "node:assert/strict";
import { pruneNode, pruneResult, unwrapJsonStrings } from "./prune";

test("arrays are capped at 15 items with an omission marker", () => {
  const input = Array.from({ length: 40 }, (_, i) => i);
  const result = pruneNode(input) as unknown[];
  assert.equal(result.length, 16);
  assert.equal(result[15], "…[25 more items omitted]");
});

test("long strings are truncated with a marker", () => {
  const result = pruneNode("x".repeat(2000)) as string;
  assert.ok(result.startsWith("x".repeat(1500)));
  assert.match(result, /…\[truncated 500 chars\]$/);
});

test("API plumbing fields and github hypermedia links are dropped", () => {
  const result = pruneNode({
    node_id: "n",
    gravatar_id: "g",
    avatar_url: "a",
    api_link: "https://api.github.com/repos/x/y",
    html_url: "https://github.com/x/y",
    sha: "abc",
  }) as Record<string, unknown>;
  assert.deepEqual(result, { html_url: "https://github.com/x/y", sha: "abc" });
});

test("oversized results collapse to a preview envelope", () => {
  // Many medium strings: each survives per-string truncation (<1500 chars) but the
  // pruned total still exceeds the 24KB envelope cap.
  const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, "y".repeat(1400)]));
  const result = pruneResult(big) as Record<string, unknown>;
  assert.equal(result.note, "result truncated to fit model context");
  assert.equal(typeof result.preview, "string");
  assert.ok((result.preview as string).length <= 24000);
});

test("unwrapJsonStrings parses JSON-object strings recursively", () => {
  const result = unwrapJsonStrings({ body: '{"a":1,"nested":"[1,2]"}', plain: "hello {not json" });
  assert.deepEqual(result, { body: { a: 1, nested: [1, 2] }, plain: "hello {not json" });
});
