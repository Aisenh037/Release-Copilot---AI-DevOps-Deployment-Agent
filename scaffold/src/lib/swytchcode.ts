import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Swytchcode, TOOL_USE_INSTRUCTIONS } from "@swytchcode/runtime";
import { VercelProvider } from "@swytchcode/runtime/providers/vercel";
import { tool, jsonSchema } from "ai";
import { appendReleaseReport } from "./notionFallback";

/**
 * The Swytchcode CLI resolves `.swytchcode/` relative to `process.cwd()` for every
 * shelled-out command. Verified against @swytchcode/runtime@1.1.5's compiled dist:
 * neither the `Swytchcode` constructor nor `tools.get()`/the tool `execute` callback
 * accept a cwd override — client.js's `Tools.get()` calls `discover.info()` /
 * `manage.listTools()` (cli.js `runCli`) with no options at all, and the auto-wired
 * per-tool `execute` callback (`this.execute(cid, a, { _rawInputs })`) never threads
 * a cwd through to exec.js either; both `runCli` and `exec` default to
 * `options.cwd ?? process.cwd()`. So mitigation (a) from the task brief (constructor/
 * tools.get cwd option) does not exist, and there is no cwd-related env var either
 * (SWYTCHCODE_BIN only overrides the *binary* path, not where it looks for
 * `.swytchcode/`) — mitigation (b) doesn't exist. Mitigation (c), "launch the dev
 * server from the repo root via `npm --prefix scaffold run dev`", was tested and does
 * NOT work either: `npm --prefix <dir> run <script>` still sets the child script's
 * own `process.cwd()` to `<dir>` (empirically verified), not the directory `npm` was
 * invoked from. The actual fix: since the whole Next.js server is a single Node
 * process and `process.cwd()` is a process-global, changing it once here — before any
 * swytchcode call — fixes every later shell-out in this module, regardless of
 * whether `next dev`/`next start` itself was launched from scaffold/ or the repo
 * root. Walk upward from the current cwd and chdir into the first ancestor that
 * contains `.swytchcode/`.
 */
function ensureRepoRootCwd(): void {
  try {
    let dir = process.cwd();
    for (;;) {
      if (existsSync(join(dir, ".swytchcode"))) {
        if (dir !== process.cwd()) process.chdir(dir);
        return;
      }
      const parent = resolve(dir, "..");
      if (parent === dir) return; // hit filesystem root; give up, leave cwd as-is
      dir = parent;
    }
  } catch {
    // chdir not permitted in this environment (e.g. some serverless hosts) - leave
    // cwd as-is; swytchcode calls will fail with a clear "not found" error instead
    // of crashing module load.
  }
}

ensureRepoRootCwd();

// Explicit canonical IDs, per the Task 2 spike (docs/superpowers/plans/swytchcode-methods.md)
// and the Swytchcode Agent Contract's "tools" selector (not "toolkits" - see CLAUDE.md
// "Agentic / Dynamic Tool Selection"). All 7 are confirmed present in
// .swytchcode/tooling.json (Golden Path Step 3 verified via `swytchcode list tooling`
// equivalent grep before writing this file).
const CANONICAL_IDS = [
  "github.commit.get.1",
  "github.pull.get",
  "github.compare.get",
  "atlassian.rest.issue.create",
  "atlassian.rest.jql.create",
  "netlify.build.create",
  "netlify.deploy.get.1",
] as const;

// Notion write methods are all blocked (SWY-ERR-014934) - this is a hand-built AI SDK
// tool wired in alongside the Swytchcode-backed tools, calling the REST fallback in
// ./notionFallback.ts. Key must match the intent->tool mapping in prompt.ts.
const NOTION_TOOL_NAME = "notion_append_release_report";

const swx = new Swytchcode(new VercelProvider());

function buildNotionTool() {
  return tool({
    description:
      "Append a Release Report to the Notion parent page (direct REST fallback - " +
      "Swytchcode's Notion write methods are blocked by registry bundle defect " +
      "SWY-ERR-014934). Adds a heading with the title, then a heading + one paragraph " +
      "per line for each section.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        title: {
          type: "string",
          description: 'Report title, e.g. "Release Report 2026-08-09".',
        },
        sections: {
          type: "array",
          description: "Ordered report sections (e.g. Summary, Risks, Jira Issues, Deploy Status).",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              lines: { type: "array", items: { type: "string" } },
            },
            required: ["heading", "lines"],
          },
        },
      },
      required: ["title", "sections"],
    }),
    execute: async (args: unknown) =>
      appendReleaseReport(args as { title: string; sections: { heading: string; lines: string[] }[] }),
  });
}

/**
 * Raw provider responses (GitHub especially) are enormous — a single commit-list
 * result is ~70KB of JSON, mostly api.github.com hypermedia links. Every tool result
 * is resent to the model on each subsequent step, so without pruning the conversation
 * blows past Groq's free-tier TPM limit (8k for gpt-oss-120b) by step 3. Drop API
 * plumbing, cap list sizes, and truncate huge strings (diffs/patches); keep
 * human-facing fields (html_url, Jira keys, Netlify URLs) so the activity feed's
 * deep links and the model's report content still work.
 */
const MAX_ARRAY_ITEMS = 15;
const MAX_STRING_CHARS = 1500;
const MAX_RESULT_CHARS = 24000;

function pruneNode(v: unknown): unknown {
  if (Array.isArray(v)) {
    const kept = v.slice(0, MAX_ARRAY_ITEMS).map(pruneNode);
    if (v.length > MAX_ARRAY_ITEMS) kept.push(`…[${v.length - MAX_ARRAY_ITEMS} more items omitted]`);
    return kept;
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "node_id" || k === "gravatar_id" || k === "avatar_url") continue;
      if (typeof val === "string" && val.startsWith("https://api.github.com")) continue;
      out[k] = pruneNode(val);
    }
    return out;
  }
  if (typeof v === "string" && v.length > MAX_STRING_CHARS) {
    return v.slice(0, MAX_STRING_CHARS) + `…[truncated ${v.length - MAX_STRING_CHARS} chars]`;
  }
  return v;
}

function pruneResult(result: unknown): unknown {
  const pruned = pruneNode(result);
  const s = JSON.stringify(pruned);
  if (s.length <= MAX_RESULT_CHARS) return pruned;
  return { note: "result truncated to fit model context", preview: s.slice(0, MAX_RESULT_CHARS) };
}

/**
 * Models sometimes emit nested tool args as JSON-encoded *strings* instead of
 * objects (observed with Gemini: body.fields arrived as "{\"project\":...}") — the
 * provider then receives a string where the API expects an object and 400s.
 * Recursively parse any string value that is itself a complete JSON object/array.
 */
function unwrapJsonStrings(v: unknown): unknown {
  if (typeof v === "string") {
    const s = v.trim();
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try {
        return unwrapJsonStrings(JSON.parse(s));
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(unwrapJsonStrings);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = unwrapJsonStrings(val);
    return out;
  }
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- swx.tools.get()'s
// return type is itself `any[]` in @swytchcode/runtime's own .d.ts (it's provider-
// dependent at runtime: an object for Vercel, an array for Anthropic/others), and the
// `ai` SDK's own `ToolSet` type is a loosely-typed `Record<string, Tool<any, any>>`.
let toolsPromise: Promise<Record<string, any>> | null = null;

async function load() {
  const swytchcodeTools = await swx.tools.get({ tools: [...CANONICAL_IDS] });
  for (const [name, t] of Object.entries(swytchcodeTools) as [string, { execute?: (...a: unknown[]) => Promise<unknown> }][]) {
    const orig = t.execute;
    if (!orig) continue;
    t.execute = async (...a: unknown[]) => {
      const [rawArgs, ...rest] = a;
      let args = unwrapJsonStrings(rawArgs) as Record<string, unknown>;
      // The Swytchcode-managed Atlassian OAuth principal can read (JQL 200) but not
      // create issues in this site's projects ("target project doesn't exist or you
      // don't have permission"). The method contract allows overriding the static
      // Authorization header via args, and JIRA_EMAIL/JIRA_API_KEY exist in .env as
      // exactly this fallback. Remove once `swytchcode auth connect Atlassian` is
      // re-run with write scope.
      if (name.startsWith("atlassian_") && process.env.JIRA_EMAIL && process.env.JIRA_API_KEY) {
        const basic = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_KEY}`).toString("base64");
        args = { ...args, Authorization: `Basic ${basic}` };
      }
      return pruneResult(await orig.apply(t, [args, ...rest]));
    };
  }
  return { ...swytchcodeTools, [NOTION_TOOL_NAME]: buildNotionTool() };
}

/** Cached per server process - tool loading only happens once. */
export function getTools() {
  toolsPromise ??= load();
  return toolsPromise;
}

/**
 * Reverse a sanitized AI-SDK tool name (e.g. "github_commit_get_1") back to its
 * Swytchcode canonical ID ("github.commit.get.1") for display in the activity feed.
 * @swytchcode/runtime's makeAlias() already replaces every non [a-zA-Z0-9_-] char
 * (including ".") with "_" when building each tool's name, so Groq never actually
 * sees a dotted tool name in the first place - the "remap dotted names to underscore
 * if Groq rejects them" contingency from the task brief never applies here (dots are
 * gone before the tools object is built at all). This resolver just undoes that
 * sanitization for a friendlier feed, via the runtime's own public
 * `tools.nameToId()` method (populated as a side effect of the `get()` call above).
 */
export function resolveCanonicalId(name: string): string {
  if (name === NOTION_TOOL_NAME) return name;
  return swx.tools.nameToId(name);
}

export { TOOL_USE_INSTRUCTIONS };
