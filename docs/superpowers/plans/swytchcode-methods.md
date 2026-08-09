# Swytchcode methods — Task 2 spike

Status: **7 of 8 target methods enabled and contract-verified**; Notion `create page`
is blocked by a registry bundle defect (demo-critical — see "Known gap" below).
`.swytchcode/tooling.json` was modified **only via the CLI** (`swytchcode add method`),
never edited by hand.

## Timeline note

This session started **blocked**: `swytchcode get`/`add`/`info` all failed silently
(exit 1, empty stdout/stderr) because no CLI session existed (`swytchcode whoami` →
`Not logged in.`; `swytchcode doctor` → `no SWYTCHCODE_TOKEN and no user session ...
run 'swytchcode login' for registry commands`; `swytchcode login` opened a device-flow
URL and blocked on `Waiting for authorization...`, which needs a human in a browser).
Mid-session the user completed the login independently (observed via a live
`swytchcode auth connect Netlify` process and `swytchcode whoami` flipping to a valid
session) and had already fetched Netlify + enabled `netlify.site.update` themselves.
From that point the Golden Path proceeded normally.

## Catalog names (confirmed via `swytchcode search`, no login required)

GitHub, **Atlassian** (Jira lives under this name — no "Jira" integration exists),
Netlify, Notion.

## Enabled methods — contract table

| Spec tool | canonical_id | Integration | Required inputs | Auth |
|---|---|---|---|---|
| GitHub: list commits | `github.commit.get.1` | GitHub.github@1.1.4 | `owner` (path), `repo` (path). Optional: `sha`, `path`, `author`, `committer`, `since`, `until`, `per_page` (INT), `page` (INT) | oauth2, provider_slug `GitHub`. **Not** OAuth-connected in this project — verified live via explicit header override (see below) |
| GitHub: list PRs | `github.pull.get` | GitHub.github@1.1.4 | `owner` (path), `repo` (path). Optional: `state` (default `open`), `head`, `base`, ... | oauth2, provider_slug `GitHub` |
| GitHub: get diff/compare | `github.compare.get` | GitHub.github@1.1.4 | `owner` (path), `repo` (path), `basehead` (path, e.g. `main...feature-branch`). Optional: `page`, `per_page` | oauth2, provider_slug `GitHub` |
| Jira: create issue | `atlassian.rest.issue.create` | Atlassian.atlassian@1001.0.0-SNAPSHOT-be157d60442fb7548013b4767802040c43c2e44c | body `fields` (map, e.g. `{project:{key:...}, summary:..., issuetype:{name:...}}`). Optional query: `updateHistory` | No `Auth:` block / oauth2 type surfaced by `swytchcode info` (unlike GitHub/Netlify) — provider shows "not set" in `swytchcode auth status`; Jira Cloud's own API is Basic Auth (email + API token) |
| Jira: search issues | `atlassian.rest.jql.create` | Atlassian.atlassian@... (same) | body `jql` (string; schema marks it optional, but a real search needs it), `fields`, `maxResults`, `expand`, `fieldsByKeys` | same as above |
| Netlify: trigger build | `netlify.build.create` | Netlify.netlify@v1 | `site_id` (path). Optional: `branch`, `clear_cache`, `image`, `template_id`, `title` | oauth2, provider_slug `Netlify`. **Already OAuth-connected** in this project (`swytchcode auth status` → `netlify netlify oauth2 connected`) |
| Netlify: get deploy status | `netlify.deploy.get.1` | Netlify.netlify@v1 | `site_id` (path), `deploy_id` (path) | oauth2, provider_slug `Netlify`, OAuth-connected |
| Notion: create page | `notion.page.create` | Notion.notion@2.0.0 | **NOT ENABLED** — see "Known gap" | n/a |

Also present in `tooling.json` from before this task resumed (not one of the 8 target
methods, left as-is — not mine to remove): `netlify.site.update`.

### Selection notes (why these IDs, not others)

- GitHub "list commits": picked `github.commit.get.1` (`Summary: "List commits"`,
  `GET /repos/{owner}/{repo}/commits`) over `github.commit.list` (`Summary: "Search
  commits"` — the GitHub *code search* API, needs a `q` query) and `github.commit.get`
  (`Summary: "List gist commits"` — wrong resource entirely). Verified via `swytchcode
  info` on all three before picking.
- GitHub "list PRs": picked `github.pull.get` (`Summary: "List pull requests"`) over
  `github.pull.get.1` (`Summary: "Get a pull request"` — single item, needs
  `pull_number`).
- Jira "search issues": picked `atlassian.rest.jql.create` (`Summary: "Search for
  issues using JQL enhanced search (POST)"`) over `atlassian.rest.search.get`
  (`Summary: "Get visible issue field options"` — wrong capability despite the name)
  and `atlassian.rest.search.create` (`Summary: "Get precomputations by ID (apps)"` —
  also wrong). The catalog's `.search.*` names are misleading; `.jql.create` is the
  real match.
- Netlify "trigger build": picked `netlify.build.create` (`Summary: "Runs a build for
  a site"`, needs only `site_id` + optional `branch`) over `netlify.deploy.create`
  (`Summary: "Perform operation createSiteDeploy"` — same idea but oriented around
  raw zip/file-upload deploys, more setup for a demo).
- Netlify "get deploy status": picked `netlify.deploy.get.1` (`Summary: "Perform
  operation getSiteDeploy"`, single deploy by `site_id`+`deploy_id`) over
  `netlify.deploy.get` (`Summary: "Perform operation listSiteDeploys"` — lists all
  deploys, not a single status lookup).

## Known gap — Notion `create page` (demo-critical, NOT enabled)

`swytchcode add method notion.page.create` fails deterministically (reproduced twice,
also via the `swytchcode add notion.page.create` shorthand):

```
error: resolve STRUCTs in RETURNS: struct "api.page.createResponse200" not found in STRUCTS
```

`swytchcode info notion.page.create` also emits a warning but still shows the
input schema (`⚠ resolve STRUCTs for returns: struct "api.page.createResponse200" not
found in STRUCTS (output omitted)`), confirming this is a **broken output-schema
reference inside the Notion@2.0.0 wrekenfile itself**, not a local/auth/permission
problem. `swytchcode exec notion.page.create --dry-run` also fails (can't dry-run a
method that was never added):
```
{"error":"NOTION_API_KEY is set but notion.page.create is not installed. Run: swytchcode get notion && swytchcode add notion.page.create","category":"not_found",...}
```
(Useful side-fact from that message: swytchcode's error text explicitly names
`NOTION_API_KEY` as the credential it looks for — see Auth findings below.)

No alternate "create page" method exists in the Notion catalog (`notion.page.update`,
`.get`, `.query.create`, `.search.create` etc. are all different operations) and
`swytchcode search "create notion page"` returned no published workflow either. This
is a registry-side bundle defect, out of scope to hand-patch (contract forbids editing
`.swytchcode/` by hand, and the bug is in Swytchcode's own bundle data, not a project
file). **Flagging for the user** — likely needs a bundle fix upstream or a different
Notion library version once available; retry `swytchcode add method notion.page.create`
periodically.

## Auth findings (env var names + how verification actually worked)

`scaffold/.env` already uses names that match the integrations' own auth type
(`GITHUB_API_KEY`, `JIRA_API_KEY`/`JIRA_EMAIL`/`JIRA_SITE`, `NETLIFY_API_KEY`,
`NOTION_API_KEY`) — **no renames were needed**, but the exact mechanism differs
per-provider and matters for Task 3 code:

- **GitHub & Atlassian (Jira)**: both are wired as `oauth2` in the wrekenfile but are
  **not** OAuth-connected in this project (`swytchcode auth status` only lists
  Netlify as `connected`; Atlassian shows "not set" as a credential path). Setting
  `GITHUB_API_KEY`/`GITHUB_TOKEN` as a plain shell env var was **not** picked up
  automatically (`swytchcode exec` still reported `missing credentials for GitHub -
  run 'swytchcode auth connect GitHub'`). What **did** work: passing the PAT
  explicitly as a header override on `exec`:
  `--header "Authorization=Bearer $GITHUB_API_KEY"` — this matches exactly what
  `CLAUDE.md`'s Golden Path already prescribes for Task 3 codegen (pass the auth
  header as an arg, e.g. `Authorization: \`Bearer ${process.env.GITHUB_API_KEY}\``
  in the runtime's `exec(canonicalId, args)` call). For Jira, the equivalent is
  **Basic auth**: `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_KEY)` (Jira Cloud's
  standard scheme; `swytchcode info` shows a generic `"Authorization": "bearer_token"`
  header placeholder, not an oauth2 Auth block, for the Atlassian methods — Basic auth
  built from `JIRA_EMAIL`+`JIRA_API_KEY` was accepted as the override value in the
  dry-run test below).
  - **Open item for Task 3**: the Jira dry-run URL resolved to a **placeholder**
    domain (`https://your-domain.atlassian.net/...`) rather than the real
    `JIRA_SITE` — no input field on `atlassian.rest.issue.create` accepts a site/cloud
    ID, so the real domain substitution likely only happens once the account is
    OAuth-connected (`swytchcode auth connect Atlassian`, not attempted here — same
    interactive-browser limitation as `login`). Task 3 should either get the user to
    run that connect step, or confirm whether `JIRA_SITE` can override the base URL
    via some other mechanism (not found in the schema shown by `info`).
- **Netlify**: already OAuth-connected (the user ran `swytchcode auth connect
  Netlify` during this session) — `swytchcode exec`/`--dry-run` picked up the stored
  credential with no explicit header needed. `NETLIFY_API_KEY` in `.env` is available
  as a fallback/override for environments without that OAuth connection, using the
  same explicit-header pattern as GitHub.
- **Notion**: unconfirmed end-to-end (method never got enabled — see gap above), but
  the CLI's own error text explicitly referenced `NOTION_API_KEY` by name
  ("`NOTION_API_KEY is set but notion.page.create is not installed`"), suggesting
  Notion may be wired as a plain API-key provider that swytchcode auto-detects by that
  exact env var name (unlike GitHub/Atlassian). Re-verify once the bundle bug clears.

**Discrepancy found**: this task's brief said "Jira project REL", but
`scaffold/.env` has `JIRA_PROJECT_KEY=KAN`. Not changed here (out of scope, and not
independently verifiable without a working Atlassian connection) — flagging for the
user to confirm the correct value before Task 3.

## Verification evidence

**Live call — GitHub list commits** (`github.commit.get.1`, real HTTP call, truncated):
```
$ swytchcode exec github.commit.get.1 --input owner=Aisenh037 \
    --input repo=Release-Copilot---AI-DevOps-Deployment-Agent \
    --header "Authorization=Bearer <GITHUB_API_KEY, redacted>" --json
-> GET https://api.github.com/repos/Aisenh037/Release-Copilot---AI-DevOps-Deployment-Agent/commits?page=1&per_page=30  [DIRECT]
{"data":[{"author":{"avatar_url":"https://avatars.githubusercontent.com/u/116995372?v=4", ...
```
(Exit 0, real commit array returned — this is genuine repo data, not a stub.)

**Dry-run — Jira create issue** (`atlassian.rest.issue.create`, Authorization redacted):
```
$ swytchcode exec atlassian.rest.issue.create \
    --body '{"fields":{"project":{"key":"KAN"},"summary":"Release Copilot test issue","issuetype":{"name":"Task"}}}' \
    --header "Authorization=Basic <redacted>" --dry-run
{"body":{"fields":{"issuetype":{"name":"Task"},"project":{"key":"KAN"},"summary":"Release Copilot test issue"}},
 "headers":{"Authorization":"[REDACTED]","Content-Type":"application/json"},
 "method":"POST",
 "url":"https://your-domain.atlassian.net/rest/api/3/issue?updateHistory=false"}
```

**Dry-run — Netlify trigger build** (`netlify.build.create`, Authorization redacted):
```
$ swytchcode exec netlify.build.create --input site_id=f65f2ba0-8626-492e-8283-1103a281f669 \
    --input branch=main --dry-run
{"headers":{"Authorization":"[REDACTED]"},
 "method":"POST",
 "url":"https://api.netlify.com/api/v1/sites/f65f2ba0-8626-492e-8283-1103a281f669/builds?branch=main"}
```

**Dry-run — Notion create page**: not possible — method never enabled (see gap above);
`--dry-run` returns the same `"not_found"` / "not installed" error as a live call would.

## Environment note — `scaffold/` dependency install is blocked (separate issue, not auth-related)

`scaffold/node_modules` is currently locked by **6 already-running, hung `npm install`
processes** (PIDs observed: 28092, 10188, 31560, 6188, 4460, plus one more this
session started at 14232) — all stuck at npm's `reify`/rename phase (near-zero CPU
growth over 20-90+ minutes, no active network connections per `Get-NetTCPConnection`,
consistent with concurrent installs colliding on the same directory — a known
Windows/npm failure mode, often worsened by antivirus real-time scanning). Renaming or
deleting `scaffold/node_modules` fails with `Permission denied` (files still locked by
those processes), and this session's sandboxing does not allow forcibly killing
processes (`taskkill`/`Stop-Process` were both denied by the harness's auto-mode
classifier). **`scaffold/package.json` and `package-lock.json` were NOT modified** —
the three packages (`@swytchcode/runtime ai @ai-sdk/groq`) still need to be installed
there.

**To unblock**: from a regular terminal (outside this session), end the stray
`node.exe` processes running `npm-cli.js ... install` with `scaffold` as their working
directory (Task Manager or `taskkill /F /PID <pid>`), then delete `scaffold/node_modules`
and re-run `npm install` followed by
`npm install @swytchcode/runtime ai @ai-sdk/groq` inside `scaffold/`.

To still get the Step 6 deliverable (the runtime's Vercel-provider shape) without
touching the locked directory, `@swytchcode/runtime` was installed standalone into an
**isolated scratch directory** (outside the repo) and its README read from there — see
below. That install succeeded cleanly in 6 seconds, confirming the package exists on
npm and the lock is specific to `scaffold/node_modules`, not a broader npm/network
problem.

## Agentic workflows — Vercel AI SDK (recorded verbatim from `@swytchcode/runtime`'s README, "Agentic workflows" section)

The README's "Supported providers" table (column 2 is literally labeled "Export" but
its cell values are import *paths*, not class names):

> | Framework | Export | Result of `tools.get` |
> |-----------|--------|-----------------------|
> | Vercel AI SDK | `@swytchcode/runtime/providers/vercel` | **object** keyed by tool name (pass to `tools:` in `ai`) |

Three verbatim facts recorded, as required:

1. **Import path**: `@swytchcode/runtime/providers/vercel`. **The concrete exported
   class/function name for the Vercel provider is NOT stated anywhere in this
   README.** The only fully worked example in the doc is for Anthropic
   (`import { AnthropicProvider } from "@swytchcode/runtime/providers/anthropic"`) —
   by naming-convention analogy a Vercel equivalent would likely be `VercelProvider`,
   but the doc never actually names it, so per the contract's "do not invent APIs"
   rule this is **not** asserted as fact. Task 3 must confirm this (re-check the
   installed README, or inspect `node_modules/@swytchcode/runtime/dist` for the real
   export) before writing code that imports a named symbol from that path.
2. **`tools.get()` call shape** (provider-agnostic, from the "Selecting tools"
   section — no Vercel-specific example exists in the README): pass exactly one
   selector — `swx.tools.get({ toolkits: ["github"] })`, or
   `swx.tools.get({ tools: ["charges.charge.create"] })`, or
   `swx.tools.get({ search: "refund a charge" })`.
3. **Return shape for the Vercel provider**: an **object keyed by tool name** (a
   name→tool map), **not an array** — pass it directly as the `tools:` option to the
   `ai` SDK's `generateText`/`streamText` calls. (Anthropic and OpenAI Agents SDK
   providers return arrays instead; LangGraph returns an array of
   `DynamicStructuredTool`; CrewAI returns an array of duck-typed tool objects.)

Also noted: runtime requires **Node.js >= 22** (this machine has v25.8.1, OK);
framework SDKs (`ai`, `@openai/agents`, `@langchain/core`, ...) are optional peer
deps — install only the one used.

## Demo constants already present in `scaffold/.env`

`RELEASE_REPO`, `RELEASE_BRANCH`, `JIRA_PROJECT_KEY`, `NETLIFY_SITE_ID`,
`NOTION_PARENT_PAGE_ID`, `NEXT_PUBLIC_JIRA_SITE` (names only — see `.env.example`).
