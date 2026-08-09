// Server-only execution kernel. executeOperation() NEVER throws — every failure
// path returns { ok: false, error } so the AI SDK reports a tool-result the model
// can read and route around, instead of a tool-error that aborts the step.
import type {
  AuthCredential,
  DryRunRequest,
  ExecutionContext,
  ExecutionPolicy,
  OperationResult,
} from "./types";
import { pruneResult, unwrapJsonStrings } from "./prune";
import { resolveAuth } from "./auth";
import { defaultAuditSink } from "./audit";
import { opById, providerById } from "./registry";

const DEFAULT_POLICY: ExecutionPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  timeoutMs: 30_000,
  retryOn: [429, 503, 504],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authHeader(cred: AuthCredential): Record<string, string> {
  if (cred.kind === "bearer") return { Authorization: `Bearer ${cred.token}` };
  if (cred.kind === "basic") {
    const encoded = Buffer.from(`${cred.username}:${cred.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

function redactAuth(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  if (out.Authorization) {
    out.Authorization = out.Authorization.startsWith("Basic") ? "Basic ***" : "Bearer ***";
  }
  return out;
}

function retryDelayMs(res: Response | null, attempt: number, policy: ExecutionPolicy): number {
  const retryAfter = res?.headers.get("Retry-After");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(policy.maxDelayMs, Number(retryAfter) * 1000);
  }
  const backoff = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return backoff + Math.floor(Math.random() * 100);
}

export async function executeOperation(
  operationId: string,
  rawArgs: Record<string, unknown>,
  ctx: ExecutionContext = {}
): Promise<OperationResult> {
  const audit = ctx.audit ?? defaultAuditSink;
  const started = Date.now();

  const op = opById.get(operationId);
  if (!op) return { ok: false, error: `Unknown operation: ${operationId}` };
  const provider = providerById.get(op.providerId);
  if (!provider) return { ok: false, error: `Unknown provider for operation: ${operationId}` };

  const emit = (e: { url: string; ok: boolean; status?: number; attempt: number; dryRun?: boolean; error?: string }) => {
    try {
      audit({
        ts: new Date().toISOString(),
        opId: op.id,
        providerId: provider.id,
        method: op.method,
        durationMs: Date.now() - started,
        ...e,
      });
    } catch {
      // audit must never break execution
    }
  };

  try {
    // Args: unwrap model-mangled JSON strings, then merge server-resolved statics.
    const args: Record<string, unknown> = unwrapJsonStrings(rawArgs) as Record<string, unknown>;
    for (const [name, source] of Object.entries(op.staticArgs ?? {})) {
      const value = process.env[source.env];
      if (!value) return { ok: false, error: `${source.env} is not set (required for ${op.id})` };
      args[name] = value;
    }

    // Base URL.
    let base: string;
    if (typeof provider.baseUrl === "string") base = provider.baseUrl;
    else {
      const fromEnv = process.env[provider.baseUrl.env];
      if (!fromEnv) return { ok: false, error: `${provider.baseUrl.env} is not set (base URL for ${provider.label})` };
      base = fromEnv;
    }
    base = base.replace(/\/+$/, "");

    // Path templating.
    const missing: string[] = [];
    const path = op.path.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = args[name];
      if (value === undefined || value === null || value === "") {
        missing.push(name);
        return "";
      }
      return encodeURIComponent(String(value));
    });
    if (missing.length) {
      return { ok: false, error: `Missing required path parameter(s) for ${op.id}: ${missing.join(", ")}` };
    }

    // Query string.
    const search = new URLSearchParams();
    for (const name of op.input.query ?? []) {
      const value = args[name];
      if (value !== undefined && value !== null && value !== "") search.set(name, String(value));
    }
    const url = `${base}${path}${search.size ? `?${search.toString()}` : ""}`;

    // Body.
    let body: unknown;
    if (op.input.body?.kind === "arg") body = args[op.input.body.name];
    else if (op.input.body?.kind === "build") body = op.input.body.build(args);

    // Headers: provider defaults -> op overrides -> content-type -> auth.
    const cred = await resolveAuth(provider, ctx);
    if (cred.kind === "missing") {
      emit({ url, ok: false, attempt: 0, error: cred.message });
      return { ok: false, error: `${provider.label} is not configured: ${cred.message}` };
    }
    const headers: Record<string, string> = {
      ...provider.defaultHeaders,
      ...op.headers,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...authHeader(cred),
    };

    // Dry-run: show the exact request without calling the network.
    if (ctx.dryRun || process.env.PLATFORM_DRY_RUN === "1") {
      const request: DryRunRequest = { method: op.method, url, headers: redactAuth(headers), body };
      emit({ url, ok: true, attempt: 0, dryRun: true });
      return { ok: true, dryRun: true, request };
    }

    // Retry loop.
    const policy: ExecutionPolicy = { ...DEFAULT_POLICY, ...provider.policy };
    let lastError = "";
    for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt++) {
      const signals = [AbortSignal.timeout(policy.timeoutMs)];
      if (ctx.signal) signals.push(ctx.signal);
      let res: Response;
      try {
        res = await fetch(url, {
          method: op.method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.any(signals),
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        emit({ url, ok: false, attempt, error: lastError });
        if (ctx.signal?.aborted || attempt > policy.maxRetries) break;
        await sleep(retryDelayMs(null, attempt, policy));
        continue;
      }

      if (policy.retryOn.includes(res.status) && attempt <= policy.maxRetries) {
        lastError = `${provider.label} API ${res.status}`;
        emit({ url, ok: false, status: res.status, attempt, error: lastError });
        await res.text().catch(() => "");
        await sleep(retryDelayMs(res, attempt, policy));
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const error = `${provider.label} API ${res.status}: ${detail.slice(0, 500)}`;
        emit({ url, ok: false, status: res.status, attempt, error });
        return { ok: false, error, status: res.status, url };
      }

      const contentType = res.headers.get("content-type") ?? "";
      let data: unknown =
        res.status === 204 ? null : contentType.includes("json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
      if (op.prune !== false) data = pruneResult(data);
      if (op.transformResult) data = op.transformResult(data, args);
      emit({ url, ok: true, status: res.status, attempt });
      return { ok: true, status: res.status, url, data };
    }

    return { ok: false, error: lastError || `${provider.label} request failed after retries`, url };
  } catch (err) {
    // Belt-and-braces: nothing above should throw, but the never-throw contract is
    // what keeps a failed call rendering as a red card instead of a hung one.
    const error = err instanceof Error ? err.message : String(err);
    emit({ url: "", ok: false, attempt: 0, error });
    return { ok: false, error };
  }
}
