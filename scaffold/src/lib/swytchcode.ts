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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- swx.tools.get()'s
// return type is itself `any[]` in @swytchcode/runtime's own .d.ts (it's provider-
// dependent at runtime: an object for Vercel, an array for Anthropic/others), and the
// `ai` SDK's own `ToolSet` type is a loosely-typed `Record<string, Tool<any, any>>`.
let toolsPromise: Promise<Record<string, any>> | null = null;

async function load() {
  const swytchcodeTools = await swx.tools.get({ tools: [...CANONICAL_IDS] });
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
