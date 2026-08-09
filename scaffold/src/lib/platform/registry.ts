// Pure aggregation of connector definitions. Fails fast at module init on
// duplicate ids or dangling provider references — boot-time, not per-call.
import type { OperationDefinition, ProviderDefinition } from "./types";
import { githubOperations, githubProvider } from "./connectors/github";
import { atlassianOperations, atlassianProvider } from "./connectors/atlassian";
import { netlifyOperations, netlifyProvider } from "./connectors/netlify";
import { notionOperations, notionProvider } from "./connectors/notion";

export const providers: ProviderDefinition[] = [
  githubProvider,
  atlassianProvider,
  netlifyProvider,
  notionProvider,
];

export const operations: OperationDefinition[] = [
  ...githubOperations,
  ...atlassianOperations,
  ...netlifyOperations,
  ...notionOperations,
];

export const providerById = new Map(providers.map((p) => [p.id, p]));
export const opById = new Map(operations.map((op) => [op.id, op]));

if (providerById.size !== providers.length) {
  throw new Error("Samvaya registry: duplicate provider id");
}
if (opById.size !== operations.length) {
  throw new Error("Samvaya registry: duplicate operation id");
}
for (const op of operations) {
  if (!providerById.has(op.providerId)) {
    throw new Error(`Samvaya registry: operation ${op.id} references unknown provider ${op.providerId}`);
  }
}

/**
 * Sanitized AI-SDK tool name for an operation id — model providers reject dots in
 * tool names, so "github.commits.list" is exposed as "github_commits_list".
 */
export function toolNameFor(id: string): string {
  return id.replace(/\./g, "_");
}

const nameToId = new Map(operations.map((op) => [toolNameFor(op.id), op.id]));

/**
 * Reverse a sanitized tool name back to its canonical operation id for display in
 * the activity feed. Unknown names pass through unchanged.
 */
export function resolveCanonicalId(name: string): string {
  return nameToId.get(name) ?? name;
}
