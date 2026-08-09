# Samvaya Platform — Agent Contract

This repo is **Samvaya**: an in-house integration platform + AI agent app. The
flagship product is **Release Copilot, by Samvaya** (scaffold/ — Next.js 16 App
Router). All third-party API execution goes through Samvaya's own engine in
`scaffold/src/lib/platform/` — there are NO external integration SDKs
(no Swytchcode, no Composio/Nango). Do not reintroduce one.

## Architecture (read this before touching integrations)

```text
connectors/*.ts  -> pure declarative ProviderDefinition + OperationDefinition data
registry.ts      -> aggregates connectors; toolNameFor / resolveCanonicalId (pure)
kernel.ts        -> executeOperation(opId, args, ctx) — request build + retry + prune
auth.ts          -> AuthResolver seam; env-var resolver today, token vault later
tools.ts         -> emits the Vercel AI SDK ToolSet from the registry
prompt-block.ts  -> TOOL_GUIDANCE generated from the registry (never hand-write it)
artifacts.ts     -> CLIENT-SAFE deep-link resolution for the activity feed
```

## Invariants (breaking these breaks the app)

1. **The kernel never throws.** Every failure is `{ ok: false, error }`. Success
   shapes must NEVER contain an `error` key — `events.ts` detects tool failure via
   `"error" in result`.
2. **Import direction:** `connectors/*`, `registry.ts`, `artifacts.ts`,
   `prompt-block.ts`, `types.ts` must never import `kernel.ts`/`auth.ts`/`audit.ts`
   (server-only: env values, Buffer, node:fs). Client components import ONLY
   `platform/artifacts.ts`, never `platform/index.ts`.
3. **Definitions carry env var NAMES, never values.** Credentials resolve at call
   time inside the kernel/auth resolver.
4. **Never log secrets.** Audit events carry no args/body/headers; dry-run output
   redacts Authorization.
5. **Prompt tool tables are generated** (`TOOL_GUIDANCE`), never hand-written.

## Adding a connector

1. Create `src/lib/platform/connectors/<provider>.ts`: one `ProviderDefinition`
   (baseUrl or `{env}`, auth style + env var names, pinned API-version headers) and
   `OperationDefinition[]` (id `provider.resource.verb`, JSON Schema inputs,
   `query` list, `body` spec, `artifactLink` selectors, `argHint` for any
   payload contract the model must know, e.g. Jira's ADF description).
2. Register both in `registry.ts`.
3. Add the env var names to `scaffold/.env.example`.
4. Add a dry-run unit test in `kernel.test.ts` asserting method/URL/headers/body.
5. Never invent API shapes — check the provider's docs; pin API versions in
   `defaultHeaders`.

## Commands (run from scaffold/)

- `npm run dev` — app on :3000
- `npm test` — platform unit tests (node:test via tsx; dry-run, zero network)
- `npm run demo -- "prompt"` — headless agent loop; no arg = simulated push event
- `PLATFORM_DRY_RUN=1 npm run demo` — full flow, every request previewed, no writes
- `npm run lint` / `npx tsc --noEmit` — gates; keep both clean

## Roadmap context

Phase A (done): in-house engine at parity, env-var credentials, single operator.
Phase B: own auth (hand-rolled, Lucia-guide style) + Postgres/Drizzle.
Phase C: Connection Hub — per-workspace OAuth via our own OAuth apps, AES-256-GCM
token vault plugging into `setAuthResolver()`. Phase D: onboarding/templates/
catalog. Phase E: billing (Razorpay/Stripe) + public API. The kernel `ctx` +
`AuthResolver` seam exists for Phase C — do not remove it as "unused".

Historical contract tables from the Swytchcode era live in `docs/engineering/`.
