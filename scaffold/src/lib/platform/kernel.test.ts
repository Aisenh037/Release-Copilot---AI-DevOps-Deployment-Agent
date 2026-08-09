import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { executeOperation } from "./kernel";
import type { DryRunRequest } from "./types";

const ENV_KEYS = [
  "GITHUB_API_KEY",
  "JIRA_API_KEY",
  "JIRA_EMAIL",
  "JIRA_SITE",
  "NETLIFY_API_KEY",
  "NOTION_API_KEY",
  "NOTION_PARENT_PAGE_ID",
  "PLATFORM_DRY_RUN",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

const silentAudit = () => {};

function dryRequest(result: Awaited<ReturnType<typeof executeOperation>>): DryRunRequest {
  assert.ok(result.ok === true && "dryRun" in result && result.dryRun === true, JSON.stringify(result));
  return result.request;
}

test("atlassian.issue.create builds the exact Jira request", async () => {
  process.env.JIRA_SITE = "https://example.atlassian.net/";
  process.env.JIRA_EMAIL = "dev@example.com";
  process.env.JIRA_API_KEY = "secret";
  const body = { fields: { summary: "risk", project: { key: "REL" } } };
  const result = await executeOperation(
    "atlassian.issue.create",
    { body, updateHistory: true },
    { dryRun: true, audit: silentAudit }
  );
  const req = dryRequest(result);
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://example.atlassian.net/rest/api/3/issue?updateHistory=true");
  assert.equal(req.headers.Authorization, "Basic ***");
  assert.equal(req.headers["Content-Type"], "application/json");
  assert.deepEqual(req.body, body);
});

test("query params are omitted when not provided", async () => {
  process.env.JIRA_SITE = "https://example.atlassian.net";
  process.env.JIRA_EMAIL = "dev@example.com";
  process.env.JIRA_API_KEY = "secret";
  const result = await executeOperation(
    "atlassian.issue.create",
    { body: { fields: {} } },
    { dryRun: true, audit: silentAudit }
  );
  assert.equal(dryRequest(result).url, "https://example.atlassian.net/rest/api/3/issue");
});

test("missing JIRA_SITE fails as a config guard without network", async () => {
  process.env.JIRA_EMAIL = "dev@example.com";
  process.env.JIRA_API_KEY = "secret";
  const result = await executeOperation("atlassian.issue.create", { body: {} }, { audit: silentAudit });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /JIRA_SITE/);
});

test("missing auth env fails before dry-run short-circuit", async () => {
  const result = await executeOperation(
    "github.commits.list",
    { owner: "a", repo: "b" },
    { dryRun: true, audit: silentAudit }
  );
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /GITHUB_API_KEY/);
});

test("github.compare templating survives basehead ref ranges", async () => {
  process.env.GITHUB_API_KEY = "token";
  const result = await executeOperation(
    "github.compare",
    { owner: "acme", repo: "web", basehead: "main~5...main", per_page: 5 },
    { dryRun: true, audit: silentAudit }
  );
  const req = dryRequest(result);
  assert.equal(req.url, "https://api.github.com/repos/acme/web/compare/main~5...main?per_page=5");
  assert.equal(req.headers.Authorization, "Bearer ***");
  assert.equal(req.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(req.body, undefined);
});

test("missing path params produce an error result listing them", async () => {
  process.env.GITHUB_API_KEY = "token";
  const result = await executeOperation("github.compare", { owner: "acme", repo: "web" }, { dryRun: true, audit: silentAudit });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /basehead/);
});

test("unknown operation id is an error result, not a throw", async () => {
  const result = await executeOperation("nope.nothing", {}, { audit: silentAudit });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /Unknown operation/);
});

test("notion.report.append builds PATCH with version header, staticArg page and block body", async () => {
  process.env.NOTION_API_KEY = "token";
  process.env.NOTION_PARENT_PAGE_ID = "abc-123-def";
  const result = await executeOperation(
    "notion.report.append",
    { title: "Release Report", sections: [{ heading: "Summary", lines: ["all good"] }] },
    { dryRun: true, audit: silentAudit }
  );
  const req = dryRequest(result);
  assert.equal(req.method, "PATCH");
  assert.equal(req.url, "https://api.notion.com/v1/blocks/abc-123-def/children");
  assert.equal(req.headers["Notion-Version"], "2022-06-28");
  const body = req.body as { children: { type: string }[] };
  assert.equal(body.children.length, 3); // heading_2 title + heading_3 + paragraph
  assert.equal(body.children[0].type, "heading_2");
  assert.equal(body.children[1].type, "heading_3");
  assert.equal(body.children[2].type, "paragraph");
});

test("JSON-encoded string args are unwrapped before use (Gemini quirk)", async () => {
  process.env.JIRA_SITE = "https://example.atlassian.net";
  process.env.JIRA_EMAIL = "dev@example.com";
  process.env.JIRA_API_KEY = "secret";
  const result = await executeOperation(
    "atlassian.issue.create",
    { body: '{"fields":{"summary":"from string"}}' },
    { dryRun: true, audit: silentAudit }
  );
  assert.deepEqual(dryRequest(result).body, { fields: { summary: "from string" } });
});

test("PLATFORM_DRY_RUN=1 enables dry-run globally", async () => {
  process.env.GITHUB_API_KEY = "token";
  process.env.PLATFORM_DRY_RUN = "1";
  const result = await executeOperation("github.commits.list", { owner: "a", repo: "b" }, { audit: silentAudit });
  assert.ok(result.ok === true && "dryRun" in result && result.dryRun === true);
});

test("success result shapes never contain an `error` key (events.ts invariant)", async () => {
  process.env.GITHUB_API_KEY = "token";
  const result = await executeOperation(
    "github.commits.list",
    { owner: "a", repo: "b" },
    { dryRun: true, audit: silentAudit }
  );
  assert.equal("error" in result, false);
});
