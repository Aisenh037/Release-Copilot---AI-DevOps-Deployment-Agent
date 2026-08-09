// Pure data — no env reads, no kernel imports (client-bundle safe).
import type { OperationDefinition, ProviderDefinition } from "../types";

export const netlifyProvider: ProviderDefinition = {
  id: "netlify",
  label: "Netlify",
  baseUrl: "https://api.netlify.com",
  auth: { style: "bearer", tokenEnv: "NETLIFY_API_KEY" },
};

export const netlifyOperations: OperationDefinition[] = [
  {
    id: "netlify.build.trigger",
    providerId: "netlify",
    intent: "trigger deploy",
    description: "Trigger a new Netlify build/deploy for a site.",
    argHint: "args: site_id (from context), optional branch",
    method: "POST",
    path: "/api/v1/sites/{site_id}/builds",
    input: {
      schema: {
        type: "object",
        properties: {
          site_id: { type: "string", description: "Netlify site UUID." },
          branch: { type: "string" },
          clear_cache: { type: "boolean" },
        },
        required: ["site_id"],
      },
      query: ["branch", "clear_cache"],
    },
    artifactLink: [{ kind: "pick", fields: ["deploy_ssl_url", "url"] }],
  },
  {
    id: "netlify.deploy.status",
    providerId: "netlify",
    intent: "deploy status",
    description: "Get the status of a Netlify deploy.",
    method: "GET",
    path: "/api/v1/sites/{site_id}/deploys/{deploy_id}",
    input: {
      schema: {
        type: "object",
        properties: {
          site_id: { type: "string", description: "Netlify site UUID." },
          deploy_id: { type: "string" },
        },
        required: ["site_id", "deploy_id"],
      },
    },
    artifactLink: [{ kind: "pick", fields: ["deploy_ssl_url", "url"] }],
  },
];
