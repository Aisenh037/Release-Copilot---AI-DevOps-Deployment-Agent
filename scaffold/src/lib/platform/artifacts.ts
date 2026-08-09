// CLIENT-SAFE artifact deep-link resolution. Imports only pure registry data.
// Selector metadata lives on each operation definition, so provider-shaped
// heuristics no longer hide inside React components.
import type { ArtifactLinkSelector } from "./types";
import { opById } from "./registry";

// Next.js only inlines NEXT_PUBLIC_* env vars accessed as literal properties —
// dynamic process.env[name] is always undefined in the browser, so every baseEnv
// used by a template selector must appear in this literal map.
const CLIENT_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_JIRA_SITE: process.env.NEXT_PUBLIC_JIRA_SITE,
};

function pickField(data: unknown, field: string): string | null {
  if (Array.isArray(data)) return pickField(data[0], field);
  if (data && typeof data === "object") {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function trySelector(selector: ArtifactLinkSelector, data: unknown): string | null {
  if (selector.kind === "pick") {
    for (const field of selector.fields) {
      const value = pickField(data, field);
      if (value) return value;
    }
    return null;
  }
  const value = pickField(data, selector.field);
  const base = CLIENT_ENV[selector.baseEnv];
  if (!value || !base) return null;
  return base.replace(/\/+$/, "") + selector.urlTemplate.replace("{value}", value);
}

export function artifactLinkFor(canonicalId: string, result: unknown): string | null {
  // Unwrap the kernel envelope; failed and dry-run results carry no artifact.
  let data: unknown = result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.ok === false || r.dryRun === true) return null;
    if (r.ok === true && "data" in r) data = r.data;
  }

  const selectors = opById.get(canonicalId)?.artifactLink ?? [];
  for (const selector of selectors) {
    const link = trySelector(selector, data);
    if (link) return link;
  }
  // Generic fallback so unknown/legacy result shapes still deep-link.
  for (const field of ["html_url", "deploy_ssl_url", "url"]) {
    const link = pickField(data, field);
    if (link) return link;
  }
  return null;
}
