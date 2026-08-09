# Task 3 + 4 Report: Agent core (tools, prompt, streaming route) + Dashboard UI

## Summary

All 15 files from both briefs were written (11 created, 2 modified for Task 3/4, plus
`notionFallback.ts` per the Notion contract-exception instruction). Code is committed
to `main` and pushed. **Build/dev verification could not be run** — `scaffold/node_modules`
was never in a working state during this session (see "Install status" below) — so this
is unverified, hand-checked-against-source code. Status: **DONE_WITH_CONCERNS**.

An unusual thing happened partway through this session: another actor (almost
certainly the human user, working in the same repo in parallel — see "Concurrent
activity" below) committed my exact working-tree files verbatim, then did further
unrelated repo cleanup (deleted `.swytchcode/` and `docs/superpowers/` from git
tracking) that had a real side effect on this task: **the local `.swytchcode/tooling.json`
and integration bundles were physically deleted from disk** by a `pull --rebase
--autostash` that landed while I was working. This doesn't affect the code's
correctness, but it does mean the 7 canonical IDs my code calls are no longer enabled
on this machine as of the end of this session — see "New blocker" below.

## Files created

- `scaffold/src/lib/swytchcode.ts` — tool loading (cached per process), cwd fix, Notion
  fallback tool merge, `resolveCanonicalId` helper
- `scaffold/src/lib/notionFallback.ts` — direct Notion REST fallback (contract exception)
- `scaffold/src/lib/prompt.ts` — system prompt
- `scaffold/src/lib/events.ts` — `AgentEvent` type + `partToEvent`
- `scaffold/src/app/api/agent/route.ts` — NDJSON streaming route
- `scaffold/src/lib/useAgentStream.ts` — client hook
- `scaffold/src/lib/simulatedPush.ts` — simulated push constant
- `scaffold/src/components/Chat.tsx`
- `scaffold/src/components/ActivityFeed.tsx`

## Files modified

- `scaffold/src/app/page.tsx` — replaced Create-Next-App boilerplate with the dashboard
- `scaffold/src/app/layout.tsx` — metadata title/description only

## The real Vercel-provider export name

Confirmed by installing `@swytchcode/runtime@1.1.5` into an isolated scratch directory
(`npm init -y && npm i @swytchcode/runtime ai @ai-sdk/groq`, ~9s, outside the repo —
`scaffold/node_modules` was locked at the time) and running:

```
node -e "console.log(Object.keys(require('@swytchcode/runtime/providers/vercel')))"
```

Result: `['VercelProvider']` — matches the brief's guess exactly. Also confirmed the
main runtime's exports (`exec`, `SwytchcodeError`, `isSwytchcodeError`,
`TOOL_USE_INSTRUCTIONS`, `Swytchcode`) and read the compiled `dist/providers/vercel.js`
directly: `formatTools()` returns `Object.fromEntries(tools.map(t => [t.name,
formatTool(t)]))` — an object keyed by a **sanitized** name (`makeAlias()` in
`dist/client.js` replaces every char outside `[a-zA-Z0-9_-]`, including `.`, with `_`
before that key is ever built) — so Groq never sees a dotted tool name at all. This
made item 8 of the task instructions (remap dotted→underscore only if Groq rejects
them) moot: there was nothing to remap, dots are already gone. I kept the "dotted"
behavior described as a contingency but didn't need to act on it — see
`swytchcode.ts`'s `resolveCanonicalId()` comment for the full explanation. I built a
small reverse-mapper using the runtime's own public `tools.nameToId()` method so the
activity feed still displays true canonical IDs (e.g. `github.commit.get.1`) instead of
the sanitized `github_commit_get_1`.

## cwd solution — chosen after testing, not what the brief proposed

Read the compiled runtime source (`dist/exec.js`, `dist/cli.js`, `dist/client.js`)
directly to find where cwd is actually used:

- **Mitigation (a)** (constructor/`tools.get()` cwd option) — **does not exist**.
  `Swytchcode`'s constructor takes only a provider; `Tools.get()` takes only
  `{toolkits, tools, search}`. Internally it calls `discover.info()`/`manage.listTools()`
  → `cli.js`'s `runCli()`, which defaults `cwd: opts.cwd ?? process.cwd()` — but `opts`
  is never threaded through from the public `get()` call at all.
- **Mitigation (b)** (cwd-related env var) — **does not exist**. `SWYTCHCODE_BIN` only
  overrides the *binary* path (README confirms), not where the CLI looks for
  `.swytchcode/`.
- **Mitigation (c) as literally worded** ("start the dev server from the repo root via
  `npm --prefix scaffold run dev`") — **tested and disproved**. I patched a temporary
  script into `scaffold/package.json` that just printed `process.cwd()`, ran
  `npm --prefix scaffold run cwdtest` from `D:\SwytchCode`, and the child process's own
  `process.cwd()` was `D:\SwytchCode\scaffold`, not the repo root. `--prefix` does not
  change the launched script's cwd the way `cd` would. (Reverted the test script before
  finishing.)

**What actually works**: since the whole Next.js server is one Node process and
`process.cwd()` is a process-global, I added a one-time `process.chdir()` at the top of
`swytchcode.ts` (`ensureRepoRootCwd()`) that walks upward from the current cwd and
`chdir`s into the first ancestor containing `.swytchcode/`. This fixes every later
`swytchcode` shell-out in that process — both `tools.get()`'s internal `runCli()` calls
and each tool's auto-wired `execute()` callback — regardless of whether `next dev` is
launched from `scaffold/` (the normal, brief-assumed way) or the repo root. Wrapped in
try/catch so a restricted environment degrades to a clear runtime error instead of a
crashed module load. `npm run dev` can be run normally from `scaffold/`, as the brief
assumed in Steps 5/6 — no change to the launch command needed.

## Notion fallback — one deviation from the literal instruction, flagged

Implemented `scaffold/src/lib/notionFallback.ts` per the CONTRACT EXCEPTION spec
(top-of-file comment included verbatim as instructed), wired as a custom `ai`
`tool()` (using `jsonSchema()` rather than zod, to avoid an undeclared dependency —
`ai`'s own `VercelProvider.formatTool()` uses the same `tool({inputSchema:
jsonSchema(...), execute})` pattern internally, confirmed by reading its compiled
source, and I verified this exact call shape builds and executes correctly against
the real installed `ai@7.0.58` in the scratch dir).

**Deviation**: the task instruction said `POST
https://api.notion.com/v1/blocks/{NOTION_PARENT_PAGE_ID}/children`. Notion's real
"Append block children" endpoint is documented as **PATCH**, not POST — POST would
404 against the live API. I used PATCH (everything else — URL, headers, body shape,
block truncation at 1900 chars — matches the instruction exactly) so the fallback
actually works per the Golden Rule ("generated code must run as-is"). Flagged
prominently in a code comment at the fetch call site and here.

## ai SDK version — v7, not v5

The environment installed `ai@7.0.58` (latest at install time) and `@ai-sdk/groq@4.0.26`,
not v5/v4 as anticipated. Both `stopWhen`/`stepCountIs` (confirmed exported, used as the
brief specified) and `tool`/`jsonSchema` are present, so `route.ts` and the custom Notion
tool needed no fallback branch. I did read `node_modules/ai/dist/index.d.ts` directly to
pin down the exact `fullStream` part shapes for v7 rather than trust the brief's
"defensive shape" guess alone:

- `text-delta`: `{ type, id, text }` (not `textDelta`)
- `tool-call`: `{ type, toolCallId, toolName, input }`
- `tool-result`: `{ type, toolCallId, toolName, input, output }`
- **`tool-error`** (new, not in the brief's switch): `{ type, toolCallId, toolName,
  input, error }` — ai v7 reports a *failed* tool execution as its own distinct part
  type, not a `tool-result` with an embedded error field. Without a case for it, the
  brief's `partToEvent` would silently drop failed tool calls (`default: return null`),
  leaving their activity-feed card stuck on "running" forever. Added a `case
  "tool-error"` in `events.ts` that maps onto the same `tool-result` `AgentEvent` shape
  with `ok:false` — a correctness fix I made after reading the actual installed types,
  not present in the brief.

`route.ts` and `events.ts` otherwise transcribe the briefs faithfully.

## Auth — no header overrides anywhere (as instructed, and structurally enforced)

Per the task's item 2, I added no `Authorization` header overrides. Worth noting: this
isn't just a choice — the auto-wired tool `execute` callback that `swx.tools.get()`
builds (`(a) => this.execute(cid, a, { _rawInputs: rawInputs })`, from
`client.js`) has **no mechanism at all** to accept a per-call auth override; it only
ever uses Swytchcode's stored/OAuth credentials. So the code is correct by
construction here, not just by following the instruction.

## Install status — blocked all session, evidence

`scaffold/node_modules` was never usable during this session:

- At session start: `.bin/next` absent, `next`/`package-lock.json` absent, 6 stray
  `npm install` processes already running (PIDs 28092/10188/31560/6188/4460/14232,
  oldest since 11:17 that day) — the same zombie processes documented in Task 2's
  report.
- Partway through: `package.json`/`package-lock.json` appeared with the correct 3 deps
  and `.bin/next` appeared, but **`node_modules/next/package.json` was still missing**
  — someone (not me) had started (and 3 more concurrent) `npm install
  @swytchcode/runtime ai @ai-sdk/groq` processes (PIDs 1488/18644/25284, 13:48–13:58)
  that piled onto the same already-stuck directory.
- Ran two bounded ~100s checks (per the "check every ~2 minutes" instruction) via
  `Get-CimInstance Win32_Process`: **all 9 npm processes were still present, same PIDs,
  same start times, across both checks** — confirmed hung, not slow. I did not start a
  10th competing `npm install`, and did not attempt to kill any process (the harness
  denied `taskkill`/`Stop-Process` in the prior session per Task 2's report; nothing in
  my instructions authorized it here either).
- Final check before writing this report: `node_modules/next/package.json` still
  absent. **Never verified**: no `npm run build`, no dev server, no curl smoke test.

Per instruction #1's explicit fallback, I committed the code uninstalled/unverified
rather than blocking on it.

## New blocker discovered at the very end of the session (not caused by me)

While doing final pre-commit checks I found the local repo had moved 4 commits ahead
of what I'd pushed, made by someone else in real time:

```
15e0415 Add README: what it does, architecture, Swytchcode integration table, demo script
8b72c04 Delete .swytchcode directory
2860549 Delete docs/superpowers directory
7a311d8 Agent core + dashboard: ... (my commit, exact match to my working tree)
```

`git reflog` shows a `pull --rebase --autostash` landed on this machine mid-session
(not run by me). Its net effect: **`.swytchcode/tooling.json` and all integration
bundles are now physically deleted from disk** (only `workflows/` and `workspace.json`
remain), and `.gitignore` gained `.swytchcode/` and `docs/superpowers/` entries (good
hygiene — those clearly shouldn't have been committed, `docs/superpowers/plans/
swytchcode-methods.md`, which I read at the start of this task, is gone the same way).

Consequence: the 7 canonical IDs I verified as enabled (via `tooling.json` grep) at the
*start* of this session are no longer enabled on this machine as of the *end* of it —
not because my code or verification was wrong, but because the ground shifted under me
from an external, concurrent `git pull --rebase`. The generated code is unaffected
(it never reads `.swytchcode/` directly, per contract) but **will fail at tool-call
time until someone re-runs the Golden Path** (`swytchcode get github/atlassian/netlify`,
then `swytchcode add method <id>` for the 7 IDs) on this machine. This is Task 2's
scope, not Task 3/4's, and re-running it wasn't something I attempted mid-session while
the same directory was visibly being modified by another live process.

I left `.gitignore`'s uncommitted local diff untouched — it wasn't mine to stage, and
whoever is editing it in parallel may not be done.

## Commits

- `7a311d8` — `Agent core + dashboard: Swytchcode tools, Groq streamText NDJSON route, chat and activity feed UI`
  (all 11 Task 3/4 files; committed by the concurrent actor described above, byte-for-byte
  identical to what I wrote — verified via `git diff HEAD -- <each file>`, zero output for
  all of them)
- Pushed: `origin/main` now at `15e0415`, 0 ahead / 0 behind (confirmed via
  `git rev-list --left-right --count origin/main...HEAD`)
- No `Co-Authored-By` trailer on any commit (checked; consistent with the standing
  instruction not to add one)
- `scaffold/.env` confirmed not committed/staged (`git check-ignore -v scaffold/.env`
  → matched by `scaffold/.gitignore:34:.env*`)

## Self-review against the briefs

- Task 3 interfaces: `POST /api/agent` NDJSON of the exact `AgentEvent` union — done,
  with the `tool-error` addition described above (a superset, not a narrowing).
- Task 4 interfaces: hook owns all state, `Chat`/`ActivityFeed` are presentational,
  `page.tsx` wires them together, simulate button sends `SIMULATED_PUSH` — all
  transcribed from the brief with no functional changes.
- Golden Path Step 3 (verify canonical IDs enabled before generating code): done at the
  time via grep against `.swytchcode/tooling.json` (all 7 present) — see "New blocker"
  above for why this is now stale.
- No invented canonical IDs, no placeholder auth values, no dummy Notion/attachment
  data anywhere.

## Concerns for the user / controller

1. **Install never verified this session.** `npm run build` / dev-server smoke test
   still needs to happen once `scaffold/node_modules` is in a clean state (kill the 9
   stray npm processes, delete `node_modules`, `npm install` fresh).
2. **`.swytchcode/tooling.json` needs to be rebuilt on this machine** before the app can
   actually make a successful tool call — see "New blocker" above. This is a Task 2
   Golden-Path re-run, not a code change.
3. **Two live concurrent actors were editing this repo during this session** (the human
   user and/or their own tooling): they committed my files, deleted `.swytchcode/` and
   `docs/superpowers/` from tracking, added a README, and left `.gitignore` with an
   uncommitted local diff I didn't touch. Flagging so the controller knows this
   session's git state includes changes I did not make.
4. **Notion fallback uses PATCH, not POST** — deviates from the literal task
   instruction because POST would not work against Notion's real API; see above.
5. Everything else in this report is source-verified (installed package `.d.ts`/`.js`
   read directly) rather than assumed from the README/brief prose alone.
