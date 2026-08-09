// Samvaya platform core types. This file is pure (no imports, no env reads) and
// safe to reference from client code — definitions carry env var *names*, never values.

// ---------- auth (the Phase C token-vault seam) ----------

/** Future token-vault handle (per-workspace connection). Unused in Phase A. */
export type ConnectionRef = { connectionId: string };

export type AuthConfig =
  | { style: "bearer"; tokenEnv: string }
  | { style: "basic"; usernameEnv: string; passwordEnv: string }
  | { style: "none" };

export type AuthCredential =
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string }
  | { kind: "none" }
  // Config guard: the kernel turns this into { ok: false } without touching the network.
  | { kind: "missing"; message: string };

export type AuthResolver = (
  provider: ProviderDefinition,
  ctx: ExecutionContext
) => Promise<AuthCredential>;

// ---------- provider ----------

export type ExecutionPolicy = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Per-attempt timeout (AbortSignal.timeout). */
  timeoutMs: number;
  /** Statuses to retry (plus network errors). Everything else is terminal. */
  retryOn: number[];
};

export type ProviderDefinition = {
  id: string; // "github"
  label: string; // "GitHub" — used in error strings
  baseUrl: string | { env: string }; // Jira: { env: "JIRA_SITE" }
  auth: AuthConfig;
  defaultHeaders?: Record<string, string>; // pinned API versions live here
  policy?: Partial<ExecutionPolicy>; // merged over kernel defaults
};

// ---------- operation ----------

/** JSON Schema object, fed to the ai SDK's jsonSchema(). */
export type JsonSchemaObject = Record<string, unknown>;

export type BodySpec =
  | { kind: "arg"; name: string } // body = args[name] (Jira)
  | { kind: "build"; build: (args: Record<string, unknown>) => unknown }; // Notion blocks

export type ArtifactLinkSelector =
  /** First matching string field in result data (top level, then first array element). */
  | { kind: "pick"; fields: string[] }
  /** env[baseEnv] + urlTemplate with "{value}" replaced by String(data[field]). */
  | { kind: "template"; field: string; baseEnv: string; urlTemplate: string };

export type OperationDefinition = {
  id: string; // "github.commits.list" — dots become underscores in the tool name
  providerId: string;
  intent: string; // prompt-table key, e.g. "commits", "create issue"
  description: string; // LLM-facing tool description
  argHint?: string; // appended to the prompt guidance row (the Jira ADF contract lives here)
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // "/repos/{owner}/{repo}/commits" — {name} filled from args (+ staticArgs)
  input: {
    schema: JsonSchemaObject; // whole-args object schema incl. required[]
    query?: string[]; // arg names sent as query params when present
    body?: BodySpec;
  };
  staticArgs?: Record<string, { env: string }>; // server-resolved args, e.g. Notion page_id
  headers?: Record<string, string>; // per-op header overrides
  transformResult?: (data: unknown, args: Record<string, unknown>) => unknown; // post-prune
  prune?: boolean; // default true
  artifactLink?: ArtifactLinkSelector[]; // tried in order; generic fallback applies after
};

// ---------- execution ----------

export type ExecutionContext = {
  connection?: ConnectionRef; // Phase C: vault key; passed through to the AuthResolver
  dryRun?: boolean; // also enabled globally by env PLATFORM_DRY_RUN=1
  signal?: AbortSignal;
  audit?: AuditSink; // defaults to the console/JSONL sink
};

export type DryRunRequest = {
  method: string;
  url: string; // fully built, query included
  headers: Record<string, string>; // Authorization redacted to "Bearer ***" / "Basic ***"
  body?: unknown;
};

// INVARIANT: success shapes never contain an `error` key — events.ts detects tool
// failure via `"error" in result`, so an `error` field on a success would render as
// a failed card in the activity feed.
export type OperationResult =
  | { ok: true; status: number; url: string; data: unknown }
  | { ok: true; dryRun: true; request: DryRunRequest }
  | { ok: false; error: string; status?: number; url?: string };

// ---------- audit ----------

// Deliberately NO args/body/headers — never log secrets or payloads.
export type AuditEvent = {
  ts: string;
  opId: string;
  providerId: string;
  method: string;
  url: string;
  ok: boolean;
  status?: number;
  attempt: number;
  durationMs: number;
  dryRun?: boolean;
  error?: string;
};

export type AuditSink = (e: AuditEvent) => void;
