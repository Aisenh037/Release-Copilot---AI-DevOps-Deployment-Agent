// Pure data — no env reads, no kernel imports (client-bundle safe).
import type { OperationDefinition, ProviderDefinition } from "../types";

export const atlassianProvider: ProviderDefinition = {
  id: "atlassian",
  label: "Jira",
  baseUrl: { env: "JIRA_SITE" },
  auth: { style: "basic", usernameEnv: "JIRA_EMAIL", passwordEnv: "JIRA_API_KEY" },
  defaultHeaders: { Accept: "application/json" },
};

// Load-bearing contract, hard-won during the original build: Jira API v3 rejects
// plain-string descriptions — description must be an Atlassian Document Format
// object, and body must be a real JSON object (never a JSON-encoded string).
const ADF_HINT =
  "body MUST be a real JSON object, never a JSON-encoded string. Exact shape: " +
  '{body:{fields:{project:{key:"<Jira project key from context>"}, summary:"...", issuetype:{name:"Task"}, ' +
  'description:{type:"doc",version:1,content:[{type:"paragraph",content:[{type:"text",text:"..."}]}]}}}} ' +
  "(Jira API v3 rejects plain-string descriptions — description must be that Atlassian Document Format object.)";

export const atlassianOperations: OperationDefinition[] = [
  {
    id: "atlassian.issue.create",
    providerId: "atlassian",
    intent: "create issue",
    description: "Create a Jira issue.",
    argHint: ADF_HINT,
    method: "POST",
    path: "/rest/api/3/issue",
    input: {
      schema: {
        type: "object",
        properties: {
          body: {
            type: "object",
            description:
              "Jira issue payload: { fields: { project: {key}, summary, issuetype: {name}, description (ADF object) } }.",
          },
          updateHistory: { type: "boolean" },
        },
        required: ["body"],
      },
      query: ["updateHistory"],
      body: { kind: "arg", name: "body" },
    },
    artifactLink: [
      { kind: "template", field: "key", baseEnv: "NEXT_PUBLIC_JIRA_SITE", urlTemplate: "/browse/{value}" },
    ],
  },
  {
    id: "atlassian.issues.search",
    providerId: "atlassian",
    intent: "search issues",
    description: "Search Jira issues with a JQL query.",
    argHint: 'body {jql:"project = <Jira project key from context> ORDER BY created DESC", maxResults}',
    method: "POST",
    path: "/rest/api/3/search/jql",
    input: {
      schema: {
        type: "object",
        properties: {
          body: {
            type: "object",
            description: "JQL search payload: { jql: string, maxResults?: number, fields?: string[] }.",
          },
        },
        required: ["body"],
      },
      body: { kind: "arg", name: "body" },
    },
  },
];
