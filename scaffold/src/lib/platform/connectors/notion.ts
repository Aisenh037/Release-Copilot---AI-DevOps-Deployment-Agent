// Pure data + pure body builders — no env reads at module scope, no kernel imports.
// The page_id arrives via staticArgs (NOTION_PARENT_PAGE_ID), resolved by the kernel
// at call time, so this file stays client-bundle safe.
import type { OperationDefinition, ProviderDefinition } from "../types";

export const notionProvider: ProviderDefinition = {
  id: "notion",
  label: "Notion",
  baseUrl: "https://api.notion.com",
  auth: { style: "bearer", tokenEnv: "NOTION_API_KEY" },
  defaultHeaders: { "Notion-Version": "2022-06-28" },
};

// Notion caps rich_text content at 2000 chars; stay comfortably under it.
const MAX_LINE_LEN = 1900;

function truncate(text: string): string {
  return text.length > MAX_LINE_LEN ? text.slice(0, MAX_LINE_LEN) : text;
}

function textBlock(kind: "heading_2" | "heading_3" | "paragraph", text: string) {
  return {
    object: "block",
    type: kind,
    [kind]: {
      rich_text: [{ type: "text", text: { content: truncate(text) } }],
    },
  };
}

type ReleaseReportArgs = {
  title?: string;
  sections?: { heading: string; lines: string[] }[];
};

export function buildReleaseReportChildren(args: Record<string, unknown>): unknown {
  const { title, sections } = args as ReleaseReportArgs;
  const children: unknown[] = [textBlock("heading_2", String(title ?? "Release Report"))];
  for (const section of sections ?? []) {
    children.push(textBlock("heading_3", section.heading));
    for (const line of section.lines) children.push(textBlock("paragraph", line));
  }
  return { children };
}

export const notionOperations: OperationDefinition[] = [
  {
    id: "notion.report.append",
    providerId: "notion",
    intent: "release report",
    description:
      "Append a Release Report to the configured Notion parent page. Adds a heading " +
      "with the title, then a heading + one paragraph per line for each section.",
    argHint: "args: title, sections [{heading, lines[]}]",
    // Notion's "Append block children" endpoint is documented as PATCH; POST 404s
    // against the real API.
    method: "PATCH",
    path: "/v1/blocks/{page_id}/children",
    input: {
      schema: {
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
      },
      body: { kind: "build", build: buildReleaseReportChildren },
    },
    staticArgs: { page_id: { env: "NOTION_PARENT_PAGE_ID" } },
    // Notion page URLs resolve from the page id with dashes stripped. Synthesizing
    // the URL (rather than parsing the response) also makes the generic `url`
    // artifact pick work in the activity feed.
    transformResult: (_data, args) => ({
      appended: true,
      url: `https://www.notion.so/${String(args.page_id).replace(/-/g, "")}`,
    }),
    artifactLink: [{ kind: "pick", fields: ["url"] }],
  },
];
