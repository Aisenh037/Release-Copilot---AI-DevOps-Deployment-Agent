// Task 5 rehearsal runner — exercises the real agent loop without the Next.js server.
// Run from repo root:  node --env-file=scaffold/.env scaffold/scripts/rehearse.mjs
import { streamText, stepCountIs, tool, jsonSchema } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { Swytchcode, TOOL_USE_INSTRUCTIONS } from "@swytchcode/runtime";
import { VercelProvider } from "@swytchcode/runtime/providers/vercel";

const CANONICAL_IDS = [
  "github.commit.get.1",
  "github.pull.get",
  "github.compare.get",
  "atlassian.rest.issue.create",
  "atlassian.rest.jql.create",
  "netlify.build.create",
  "netlify.deploy.get.1",
];

const NOTION_VERSION = "2022-06-28";
async function appendReleaseReport({ title, sections }) {
  const pageId = process.env.NOTION_PARENT_PAGE_ID;
  const apiKey = process.env.NOTION_API_KEY;
  if (!pageId || !apiKey) return { ok: false, error: "Notion env vars missing" };
  const block = (kind, text) => ({
    object: "block", type: kind,
    [kind]: { rich_text: [{ type: "text", text: { content: text.slice(0, 1900) } }] },
  });
  const children = [block("heading_2", title)];
  for (const s of sections) {
    children.push(block("heading_3", s.heading));
    for (const line of s.lines) children.push(block("paragraph", line));
  }
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({ children }),
  });
  if (!res.ok) return { ok: false, error: `Notion API ${res.status}: ${(await res.text()).slice(0, 300)}` };
  return { ok: true, url: `https://www.notion.so/${pageId.replace(/-/g, "")}` };
}

const notionTool = tool({
  description: "Append a Release Report page under the Notion parent page (title + sections).",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: { heading: { type: "string" }, lines: { type: "array", items: { type: "string" } } },
          required: ["heading", "lines"],
        },
      },
    },
    required: ["title", "sections"],
  }),
  execute: async (args) => appendReleaseReport(args),
});

const systemPrompt = `You are Release Copilot, a careful DevOps engineer managing releases for
${process.env.RELEASE_REPO} (branch ${process.env.RELEASE_BRANCH}).

Context you must use in tool arguments:
- Jira project key: ${process.env.JIRA_PROJECT_KEY}
- Netlify site id: ${process.env.NETLIFY_SITE_ID}
- Notion parent page id: ${process.env.NOTION_PARENT_PAGE_ID}

Tool guidance - map intent to the exact tool name to call:
- commits -> github_commit_get_1 (args: owner, repo - split ${process.env.RELEASE_REPO} on "/")
- diff / what changed -> github_compare_get (basehead like "main~5...main")
- create issue -> atlassian_rest_issue_create (body {fields:{project:{key:"${process.env.JIRA_PROJECT_KEY}"}, summary, description, issuetype:{name:"Task"}}})
- search issues -> atlassian_rest_jql_create (body {jql:"project = ${process.env.JIRA_PROJECT_KEY} ORDER BY created DESC", maxResults})
- trigger deploy -> netlify_build_create (site_id, branch)
- deploy status -> netlify_deploy_get_1 (site_id, deploy_id)
- release report -> notion_append_release_report (title, sections)

When you receive a push event, do ALL of these in order:
1. Fetch recent commits and the diff for the latest changes.
2. Summarize what changed. Flag risks: TODO/FIXME markers, changes to auth/payment/config files, unusually large diffs.
3. Create one Jira issue per material risk (max 3). Summary prefixed "[release-risk]".
4. Trigger a Netlify deploy for the site id above.
5. Append the Release Report to Notion titled "Release Report ${new Date().toISOString().slice(0, 10)}" with summary, risks, Jira keys, deploy status.
6. Reply with a short summary linking everything you created.
If a tool fails, say what failed and continue with the remaining steps when sensible. Never invent results.

${TOOL_USE_INSTRUCTIONS}`;

const SIMULATED_PUSH = [
  "[GitHub push event received]",
  `repository: ${process.env.RELEASE_REPO}`,
  "ref: refs/heads/main",
  "Handle this push per your release policy: analyze the changes, file risk issues, deploy, and publish the release report.",
].join("\n");

const swx = new Swytchcode(new VercelProvider());
const swxTools = await swx.tools.get({ tools: CANONICAL_IDS });
const tools = { ...swxTools, notion_append_release_report: notionTool };
console.log(`[rehearse] loaded ${Object.keys(tools).length} tools`);

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
const models = [process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", process.env.GROQ_FALLBACK_MODEL ?? "openai/gpt-oss-120b"];

for (let i = 0; i < models.length; i++) {
  try {
    console.log(`[rehearse] model: ${models[i]}`);
    const result = streamText({
      model: groq(models[i]),
      system: systemPrompt,
      messages: [{ role: "user", content: SIMULATED_PUSH }],
      tools,
      stopWhen: stepCountIs(12),
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") process.stdout.write(part.text ?? "");
      else if (part.type === "tool-call") console.log(`\n[tool-call] ${part.toolName} ${JSON.stringify(part.input).slice(0, 160)}`);
      else if (part.type === "tool-result") console.log(`[tool-result] ${part.toolName} -> ${JSON.stringify(part.output).slice(0, 220)}`);
      else if (part.type === "tool-error") console.log(`[tool-ERROR] ${part.toolName}: ${String(part.error).slice(0, 220)}`);
      else if (part.type === "error") throw new Error(String(part.error));
      else if (part.type === "finish") console.log(`\n[rehearse] finished (${part.finishReason ?? "done"})`);
    }
    break;
  } catch (err) {
    console.error(`\n[rehearse] model ${models[i]} failed: ${String(err).slice(0, 300)}`);
    if (i === models.length - 1) process.exit(1);
    console.log("[rehearse] retrying with fallback model…");
  }
}
