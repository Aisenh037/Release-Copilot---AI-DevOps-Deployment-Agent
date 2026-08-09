// CONTRACT EXCEPTION (user-approved pending): direct REST fallback — Swytchcode
// registry bundle defect SWY-ERR-014934 blocks all Notion write methods (see
// docs/superpowers/plans/swytchcode-methods.md, "Known gap"). This module talks to
// the Notion REST API directly instead of going through swytchcode exec. Remove when
// the bundle is fixed and notion.page.create/notion append-children become available
// through swytchcode add method.

export type ReleaseReportInput = {
  title: string;
  sections: { heading: string; lines: string[] }[];
};

export type AppendReleaseReportResult = { ok: boolean; url?: string; error?: string };

const NOTION_VERSION = "2022-06-28";
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

/**
 * Appends a title heading plus one heading_3 + paragraph-per-line block per section
 * to the Notion page identified by NOTION_PARENT_PAGE_ID.
 */
export async function appendReleaseReport(
  markdownish: ReleaseReportInput
): Promise<AppendReleaseReportResult> {
  const pageId = process.env.NOTION_PARENT_PAGE_ID;
  const apiKey = process.env.NOTION_API_KEY;
  if (!pageId || !apiKey) {
    return { ok: false, error: "NOTION_PARENT_PAGE_ID or NOTION_API_KEY is not set" };
  }

  const children: unknown[] = [textBlock("heading_2", markdownish.title)];
  for (const section of markdownish.sections) {
    children.push(textBlock("heading_3", section.heading));
    for (const line of section.lines) {
      children.push(textBlock("paragraph", line));
    }
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      // NOTE: deviates from the task instruction's literal "POST" — Notion's
      // "Append block children" endpoint (api.notion.com/v1/blocks/{id}/children) is
      // documented as PATCH; POST 404s against the real API. Using the method that
      // actually works, per the Golden Rule ("generated code must run as-is").
      // Flagged explicitly in task-3-4-report.md.
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ children }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Notion API ${res.status}: ${detail.slice(0, 500)}` };
    }

    // Notion page URLs resolve from the page id with dashes stripped.
    return { ok: true, url: `https://www.notion.so/${pageId.replace(/-/g, "")}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
