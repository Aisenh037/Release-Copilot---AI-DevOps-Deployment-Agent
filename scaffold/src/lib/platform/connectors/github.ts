// Pure data — no env reads, no kernel imports (client-bundle safe).
import type { OperationDefinition, ProviderDefinition } from "../types";

export const githubProvider: ProviderDefinition = {
  id: "github",
  label: "GitHub",
  baseUrl: "https://api.github.com",
  auth: { style: "bearer", tokenEnv: "GITHUB_API_KEY" },
  defaultHeaders: {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
};

export const githubOperations: OperationDefinition[] = [
  {
    id: "github.commits.list",
    providerId: "github",
    intent: "commits",
    description: "List recent commits on a GitHub repository branch.",
    argHint: 'args: owner, repo — split the release repo from context on "/"',
    method: "GET",
    path: "/repos/{owner}/{repo}/commits",
    input: {
      schema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner (user or org)." },
          repo: { type: "string", description: "Repository name." },
          sha: { type: "string", description: "Branch name or commit SHA to start from." },
          path: { type: "string", description: "Only commits touching this file path." },
          author: { type: "string" },
          committer: { type: "string" },
          since: { type: "string", description: "ISO 8601 timestamp." },
          until: { type: "string", description: "ISO 8601 timestamp." },
          per_page: { type: "number" },
          page: { type: "number" },
        },
        required: ["owner", "repo"],
      },
      query: ["sha", "path", "author", "committer", "since", "until", "per_page", "page"],
    },
    artifactLink: [{ kind: "pick", fields: ["html_url"] }],
  },
  {
    id: "github.pulls.list",
    providerId: "github",
    intent: "pull requests",
    description: "List pull requests on a GitHub repository.",
    method: "GET",
    path: "/repos/{owner}/{repo}/pulls",
    input: {
      schema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"] },
          head: { type: "string" },
          base: { type: "string" },
          sort: { type: "string", enum: ["created", "updated", "popularity", "long-running"] },
          direction: { type: "string", enum: ["asc", "desc"] },
          per_page: { type: "number" },
          page: { type: "number" },
        },
        required: ["owner", "repo"],
      },
      query: ["state", "head", "base", "sort", "direction", "per_page", "page"],
    },
    artifactLink: [{ kind: "pick", fields: ["html_url"] }],
  },
  {
    id: "github.compare",
    providerId: "github",
    intent: "diff / what changed",
    description: "Compare two commits/refs on a GitHub repository and return the diff summary.",
    argHint: 'basehead like "main~5...main"',
    method: "GET",
    path: "/repos/{owner}/{repo}/compare/{basehead}",
    input: {
      schema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          basehead: { type: "string", description: 'Base...head ref range, e.g. "main~5...main".' },
          per_page: { type: "number" },
          page: { type: "number" },
        },
        required: ["owner", "repo", "basehead"],
      },
      query: ["page", "per_page"],
    },
    artifactLink: [{ kind: "pick", fields: ["html_url"] }],
  },
];
