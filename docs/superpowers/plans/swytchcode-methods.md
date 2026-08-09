# Swytchcode methods — Task 2 spike

Status: **7 of 8 target methods enabled and contract-verified** (GitHub x3, Jira x2,
Netlify x2). Notion `create page` is blocked by a **registry bundle defect**
(broken output-schema reference), confirmed reproducible and out of local control —
see "Known gap" below. `.swytchcode/tooling.json` was modified **only via the CLI**
(`swytchcode add method` / `swytchcode add integration`), never edited by hand.

This file supersedes an earlier version written during the same task window by a
concurrent session that hit the same blockers independently; the auth findings below
correct a few conclusions from that earlier pass (see "Auth findings").

## Catalog names (confirmed via `swytchcode search`)

**GitHub**, **Atlassian** (contains `atlassian.rest.*` Jira methods), **Netlify**,
**Notion** — matching the pre-flight note. During verification a **second, separate**
Jira-only catalog entry was also discovered: **Jira** (`Jira.jira@v1`, `jira.api.*`
methods), auto-fetched as a side effect of `swytchcode auth connect jira`. It largely
duplicates the Atlassian bundle's REST surface. Both were tested (see "Auth findings").

## Enabled methods — contract table

| Spec tool | canonical_id | Integration | Required inputs | Auth env var |
|---|---|---|---|---|
| GitHub: list commits | `github.commit.get.1` | GitHub.github@1.1.4 | `owner` (path), `repo` (path). Optional: `sha`, `path`, `author`, `committer`, `since`, `until`, `per_page` (INT, default 30), `page` (INT, default 1) | `GITHUB_API_KEY` |
| GitHub: list PRs | `github.pull.get` | GitHub.github@1.1.4 | `owner` (path), `repo` (path). Optional: `state` (default `open`), `head`, `base`, `sort` (default `created`), `direction`, `per_page`, `page` | `GITHUB_API_KEY` |
| GitHub: get diff/compare | `github.compare.get` | GitHub.github@1.1.4 | `owner` (path), `repo` (path), `basehead` (path, e.g. `main...feature-branch`). Optional: `page`, `per_page` | `GITHUB_API_KEY` |
| Jira: create issue | `atlassian.rest.issue.create` | Atlassian.atlassian@1001.0.0-SNAPSHOT-be157d60442fb7548013b4767802040c43c2e44c | body `fields` (map, e.g. `{project:{key:"KAN"}, summary:"...", issuetype:{name:"Task"}}`). Optional query: `updateHistory` | `JIRA_API_KEY` + `JIRA_EMAIL` (site domain unresolved in `--dry-run` — see below) |
| Jira: search issues | `atlassian.rest.jql.create` | Atlassian.atlassian@... (same) | body `jql` (string — schema marks optional but a real search needs it), optional `fields`, `maxResults`, `expand`, `fieldsByKeys`, `nextPageToken`, `reconcileIssues` | `JIRA_API_KEY` + `JIRA_EMAIL` |
| Netlify: trigger build | `netlify.build.create` | Netlify.netlify@v1 | `site_id` (path). Optional: `branch`, `clear_cache`, `image`, `template_id`, `title` | `NETLIFY_API_KEY` |
| Netlify: get deploy status | `netlify.deploy.get.1` | Netlify.netlify@v1 | `site_id` (path), `deploy_id` (path) | `NETLIFY_API_KEY` |
| Notion: create page | `notion.page.create` | Notion.notion@2.0.0 | **NOT ENABLED** — see "Known gap" | `NOTION_API_KEY` (name confirmed by the CLI's own error text, see below) |

Also present in `tooling.json`, not one of the 8 target methods, left as-is (not mine to
remove — `netlify.site.update` predates this task; `jira.api.issue.create` /
`jira.api.jql.create` were added during investigation of the Jira domain issue below —
no CLI command exists to remove an enabled method, so they remain enabled but are not
part of the spec-tool table above).

### Selection notes (why these IDs, not others)

- GitHub "list commits": `github.commit.get.1` (`Summary: "List commits"`, `GET
  /repos/{owner}/{repo}/commits`) — the only match; other `github.commit.*` IDs are a
  different resource (gist commits, code search).
- GitHub "list PRs": `github.pull.get` (`Summary: "List pull requests"`) over
  `github.pull.get.1` (single PR by number).
- Jira "search issues": `atlassian.rest.jql.create` (`Summary: "Search for issues using
  JQL enhanced search (POST)"`) — the `.search.*`-named IDs in the catalog are
  unrelated capabilities (field options, app precomputations).
- Netlify "trigger build": `netlify.build.create` (`site_id` + optional `branch`) over
  `netlify.deploy.create` (raw zip/file-upload deploy, more setup for a demo).
- Netlify "get deploy status": `netlify.deploy.get.1` (single deploy by
  `site_id`+`deploy_id`) over `netlify.deploy.get` (lists **all** deploys).

## Known gap — Notion `create page` (NOT enabled, registry bug)

`swytchcode add method notion.page.create` fails deterministically, reproduced **five
times** across this task and the earlier concurrent session, including after
`swytchcode get Notion --yes` (re-fetch) and `swytchcode sync Notion` (fresh backend
pull) — ruling out a stale local cache:

```
error: resolve STRUCTs in RETURNS: struct "api.page.createResponse200" not found in STRUCTS
```

`swytchcode info notion.page.create` shows the same warning but still renders the
(correct-looking) input schema, confirming the defect is isolated to the **output**
schema reference, not the whole bundle. The bug is **not specific to `page.create`** —
the same warning appears on `notion.page.get`, `notion.page.update`, and
`notion.data_source.create` when probed via `info`, so most Notion write/read
operations with a non-trivial response shape are likely affected; `notion.comment.create`
was the one method that did *not* show the warning.

`swytchcode discover "create a new page in Notion"` and `swytchcode doctor` both confirm
`notion.page.create` is the correct capability and that the bundle "installed and
wrekenfile parses" — so this is a genuine backend/registry defect in how the Notion
bundle's `RETURNS` struct is compiled, not a wrong-ID or auth problem. No alternate
"create page" method exists in the catalog. Per contract (never invent canonical IDs,
never hand-edit `.swytchcode/`), this is left unresolved and flagged for the user —
retry `swytchcode add method notion.page.create` periodically, or ask
Swytchcode support about the `api.page.createResponse200` struct.

## Auth findings (env var names + verified mechanism)

**Correction to an earlier draft of this doc**: a concurrent session's notes claimed
GitHub required a manually-constructed `--header "Authorization=Bearer ..."` override
and that Jira required manually-constructed Basic auth. Both claims were **artifacts of
an invalid CLI invocation** (passing JSON as a bare positional argument, e.g.
`swytchcode exec <id> '{"owner":"..."}'`, which the installed CLI's `exec --help` does
not support — it silently exits 1 with no output). The **correct** syntax is
`--input key=value` (repeatable) or `--body '<json>'` for object-type body params.
Once called correctly:

- **GitHub**: setting `GITHUB_API_KEY` as a plain env var and calling
  `swytchcode exec github.commit.get.1 --input owner=... --input repo=... --json`
  (no `--header` needed) returned a real, live commit array — exit 0. This matches
  `CLAUDE.md`'s Golden Path exactly: Task 3's runtime `exec("github.commit.get.1", {owner,
  repo})` call should pick up `process.env.GITHUB_API_KEY` the same way, no manual
  header construction required.
  - Side note: `per_page` must be passed as a real integer if used via `--input`
    (a string value fails schema validation) — irrelevant for the runtime's JS API
    since args there are native JS values, not CLI strings.
- **Jira (Atlassian)**: setting `JIRA_API_KEY` + `JIRA_EMAIL` as plain env vars and
  calling `swytchcode exec atlassian.rest.issue.create --body '{...}' --dry-run`
  built a request with `"Authorization":"[REDACTED]"` (dry-run always redacts this
  field, so it doesn't independently confirm the value, but no error was raised).
  **Open item, confirmed NOT an env-var-naming problem**: in every dry-run tried —
  before AND after the Atlassian/Jira account was OAuth-connected via `swytchcode auth
  connect jira` (completed mid-session, `swytchcode auth status` now shows `jira
  connected`) — the request URL still resolves to the literal placeholder
  `https://your-domain.atlassian.net/...`, not a real site. This was tested against
  **13 different candidate env var names** for the site (`JIRA_SITE`, `ATLASSIAN_SITE`,
  `ATLASSIAN_DOMAIN`, etc. — none changed the output) and against **both** the
  Atlassian (`atlassian.rest.issue.create`) and the separately-discovered Jira
  (`jira.api.issue.create`) integrations, with identical placeholder output in all
  cases. Conclusion: **this is very likely a `--dry-run`-specific rendering
  limitation** (the base-URL/site template substitution probably only happens against
  the connected account at real-call time, not during dry-run preview) rather than a
  missing credential — but this was **not confirmed with a live call**, since the
  brief and `CLAUDE.md` restrict Jira to dry-run-only verification (no side-effecting
  writes). **Task 3 should treat this as an open risk**: test a real (or a deliberately
  disposable) Jira write early, and if the placeholder domain persists on a live call
  too, escalate — do not assume it will resolve itself.
- **Netlify**: `NETLIFY_API_KEY` as a plain env var produced fully correct dry-run
  requests for both methods, with the real `site_id` substituted into the URL:
  `POST https://api.netlify.com/api/v1/sites/<site_id>/builds` and
  `GET https://api.netlify.com/api/v1/sites/<site_id>/deploys/<deploy_id>`. No issues.
- **Notion**: method never got enabled (see gap above), so this couldn't be verified
  end-to-end. However, a `--dry-run` attempt against the unenabled method (documented
  by the concurrent session) surfaced this CLI error, which independently confirms the
  expected env var name: `"NOTION_API_KEY is set but notion.page.create is not
  installed. Run: swytchcode get notion && swytchcode add notion.page.create"`.

**`scaffold/.env` key names**: no renames were needed. `GITHUB_API_KEY`,
`JIRA_API_KEY`, `JIRA_EMAIL`, `JIRA_SITE`, `NETLIFY_API_KEY`, `NOTION_API_KEY` all match
what Swytchcode expects (`JIRA_SITE` is currently unused pending the domain-resolution
open item above, but the name itself isn't the problem, so it's left in place).

## Verification evidence (redacted)

**Live call — GitHub list commits** (`github.commit.get.1`, real HTTP call):
```
$ GITHUB_API_KEY=<redacted> swytchcode exec github.commit.get.1 \
    --input owner=Aisenh037 --input repo=Release-Copilot---AI-DevOps-Deployment-Agent --json
🔐 Running live - GitHub (production)
{"data":[{"author":{"login":"Aisenh037",...},"commit":{"message":"Exclude Turbopack build
cache from Netlify secrets scanning","author":{"date":"2026-08-09T07:25:03Z",...}},
"sha":"52020e8c091b93a130ebc6ab22b0cabe1c42dfe8",...}, ...]}
```
Exit 0, real commit data (matches this repo's actual latest commit) — genuine, not a stub.

**Dry-run — Jira create issue** (`atlassian.rest.issue.create`):
```
{"body":{"fields":{"issuetype":{"name":"Task"},"project":{"key":"KAN"},
 "summary":"Swytchcode Golden Path spike verification"}},
 "headers":{"Authorization":"[REDACTED]","Content-Type":"application/json"},
 "method":"POST","url":"https://your-domain.atlassian.net/rest/api/3/issue?updateHistory=false"}
```

**Dry-run — Jira search issues** (`atlassian.rest.jql.create`):
```
{"body":{"jql":"project = KAN ORDER BY created DESC","maxResults":10},
 "headers":{"Authorization":"[REDACTED]","Content-Type":"application/json"},
 "method":"POST","url":"https://your-domain.atlassian.net/rest/api/3/search/jql"}
```

**Dry-run — Netlify trigger build** (`netlify.build.create`):
```
{"headers":{"Authorization":"[REDACTED]"},"method":"POST",
 "url":"https://api.netlify.com/api/v1/sites/f65f2ba0-8626-492e-8283-1103a281f669/builds"}
```

**Dry-run — Netlify get deploy status** (`netlify.deploy.get.1`):
```
{"headers":{"Authorization":"[REDACTED]"},"method":"GET",
 "url":"https://api.netlify.com/api/v1/sites/f65f2ba0-8626-492e-8283-1103a281f669/deploys/placeholder-deploy-id"}
```

**Dry-run — Notion create page**: not possible — method never enabled (see gap above).

## `scaffold/` dependency install

`npm install @swytchcode/runtime ai @ai-sdk/groq` **could not complete directly inside
`scaffold/`**: the environment has multiple long-running, zombie `npm install`
processes (some over 2 days old, 0% CPU growth for hours) holding `scaffold/node_modules`
in an unresolvable stuck state — the OS-level sandbox for this session cannot terminate
processes it did not itself spawn (`Stop-Process`/`taskkill` report success but the
processes remain alive), and 3 separate real-install attempts inside `scaffold/` each
hung indefinitely with zero output. `npm install --dry-run` from the same `scaffold/`
cwd resolved correctly in 12s, confirming this is a **write/reify-phase lock issue**,
not a network, registry, resolution, or config problem.

**Workaround used**: ran a full, real `npm install` (base scaffold deps, since
`scaffold/` had no `package-lock.json` at all — the original install never finished
cleanly either) plus the 3 new packages in an isolated scratch directory (no lock
contention), then copied the resulting `node_modules`, `package.json`, and
`package-lock.json` back into `scaffold/` (via `robocopy /E /XO`, tolerant of the
still-locked files, one skipped file — an unrelated `caniuse-lite` internal file
already present from the original install). Verified post-copy: `@swytchcode/runtime`,
`ai`, and `@ai-sdk/groq` (plus `@ai-sdk/provider`, `@ai-sdk/provider-utils`,
`@ai-sdk/gateway`) are all present under `scaffold/node_modules` with real package
contents (README, dist/, package.json). `scaffold/package.json` now lists all three as
`dependencies`; `scaffold/package-lock.json` was generated fresh (didn't exist before)
and is added to the repo for the first time.

**For whoever picks this up next**: the zombie npm processes are still running and will
keep interfering with any *direct* `npm install`/`npm ci` run inside `scaffold/` until a
human terminates them from outside this sandbox (Task Manager, or a fresh terminal with
elevated rights) and deletes/recreates `scaffold/node_modules` cleanly, or until the
machine is rebooted.

## Agentic workflows — Vercel AI SDK (verbatim from the installed runtime README + source)

Read directly from `scaffold/node_modules/@swytchcode/runtime/README.md`'s "Agentic
workflows" section, cross-checked against the compiled `dist/providers/vercel.d.ts` /
`vercel.js` source (not just the README prose) to remove any ambiguity for Task 3:

1. **Import**: `import { VercelProvider } from "@swytchcode/runtime/providers/vercel";`
   — the README's provider table only lists the import *path*
   (`@swytchcode/runtime/providers/vercel`), not the class name, but
   `dist/providers/vercel.d.ts` confirms the concrete export:
   `export declare class VercelProvider extends Provider { ... }`. This resolves an
   open item the concurrent session's notes had flagged as unconfirmed.
2. **`tools.get()` call shape** (provider-agnostic; pass exactly one selector):
   `swx.tools.get({ toolkits: ["github"] })`, or
   `swx.tools.get({ tools: ["charges.charge.create"] })`, or
   `swx.tools.get({ search: "refund a charge" })`.
3. **Return shape for the Vercel provider**: confirmed via `dist/providers/vercel.js`
   source — `formatTools` does `Object.fromEntries(tools.map(t => [t.name,
   formatTool(t)]))`, i.e. an **object keyed by tool name**, matching the README table
   ("object keyed by tool name (pass to `tools:` in `ai`)"). Note the compiled
   `client.d.ts` types `Tools.get()` as `Promise<any[]>` generically (it doesn't
   discriminate per-provider in its type signature) — that's a type-level
   imprecision, not a behavioral contradiction; the actual runtime object shape for
   Vercel is confirmed correct from source. Do **not** call `.map()`/treat it as an
   array in Vercel-provider code; index/spread it as an object (e.g. `tools: await
   swx.tools.get(...)` passed straight into `generateText({ tools, ... })`).

Also noted: runtime requires **Node.js >= 22**; framework SDKs (`ai`, `@openai/agents`,
`@langchain/core`, ...) are optional peer deps — install only the one used.

## Demo constants already present in `scaffold/.env`

`RELEASE_REPO`, `RELEASE_BRANCH`, `JIRA_PROJECT_KEY` (= `KAN`, confirmed via env — the
task brief's plan-doc constant of `REL` is stale, env governs), `NETLIFY_SITE_ID`,
`NOTION_PARENT_PAGE_ID`, `NEXT_PUBLIC_JIRA_SITE` (names only — see
`scaffold/.env.example`).
