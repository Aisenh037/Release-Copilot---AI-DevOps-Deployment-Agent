# Release Copilot — AI DevOps & Deployment Agent (Design Spec)

**Event:** Build with Swytchcode Buildathon — Track 3 (AI DevOps & Deployment Agent)
**Date:** 2026-08-09 · 8-hour solo build · Submission deadline 3:30 PM on Commudle
**Author:** Participant (`aditja@gmail.com`) with Claude Code

## One-liner

An AI agent that manages a software release end-to-end: it reads what changed on
GitHub, flags risks, files Jira tickets, ships to Netlify, and publishes a
release report to Notion — with **every external API call flowing through
Swytchcode**.

## Goals and success criteria

1. One complete, honest, end-to-end flow that runs live in a 2.5-minute jury demo
   with no webhooks, tunnels, or luck required.
2. All GitHub / Jira / Netlify / Notion calls routed through a single Swytchcode
   client module — zero direct third-party SDK usage (30% judging criterion).
3. A dashboard where the jury *watches* the agent work via a live tool-call feed.
4. Public GitHub repo + README + architecture diagram submitted by 3:30 PM.

Success = the simulated-push flow completes end-to-end (commits analyzed → 2 Jira
issues → Netlify deploy finishes → Notion report page exists) plus one live chat
question answered, inside 2.5 minutes.

## Architecture

Single **Next.js (App Router, TypeScript)** application, three parts:

### 1. Dashboard UI (one page, two panels)

- **Left — chat panel.** Free-form conversation with the agent. Example prompts:
  "prepare a release", "what shipped today?", "file a bug for the login flicker",
  "what's still open in Jira?".
- **Right — live activity feed.** Every Swytchcode tool call renders as a card in
  real time: service icon, action name, arguments summary, status
  (running / ok / failed), and a deep link to the artifact created (Jira issue,
  Notion page, Netlify deploy). Failed calls render red; the run continues.
- **"Simulate push event" button.** Injects a canned GitHub push payload as a
  message into the same agent loop. The *event* is simulated; every API call it
  triggers is real.

### 2. Agent loop (API route, SSE-streamed)

- LLM: **Groq** via the OpenAI-compatible SDK.
  - Primary model: `llama-3.3-70b-versatile`; fallback `openai/gpt-oss-120b`.
  - Model ID read from `GROQ_MODEL` env var; on rate-limit, retry with backoff,
    then switch to the fallback model.
- Standard tool-calling loop: call model → execute requested tools → append
  results → repeat. Hard cap ~12 iterations per run.
- Each step (model text, tool call started, tool result) is streamed to the UI
  over **Server-Sent Events**; the UI renders chat and feed from the same stream.
- State is in-memory per session. No database.

### 3. Swytchcode integration (the only door to the outside world)

Follows the repo's Swytchcode Agent Contract (`CLAUDE.md`) Golden Path exactly:
`swytchcode search` → `swytchcode get <integration>` → `swytchcode add method
<canonical_id>` → `swytchcode info <canonical_id>` for I/O contracts — before
any code is generated.

- **Primary path:** the `@swytchcode/runtime` agentic surface —
  `new Swytchcode(provider)` + `await swx.tools.get(...)`. Each returned tool
  carries its input schema and an `execute` callback that runs `swytchcode exec`
  internally; we never hand-write execution logic.
- **Provider adapter:** `@swytchcode/runtime/providers/vercel` feeding the
  Vercel AI SDK's tool loop, with Groq as the AI SDK model provider.
- **Fallback path:** OpenAI-style manual loop with the OpenAI-compat SDK, or
  CLI subprocess (`swytchcode exec`), if the adapter misbehaves in the spike.
- Every tool invocation/result from the loop is logged to the activity feed —
  this doubles as evidence for the "deep Swytchcode use" criterion.

## Tool registry (8 tools, all via Swytchcode)

| Tool | Service | Purpose |
| --- | --- | --- |
| `github_list_commits` | GitHub | Recent commits on the target repo/branch |
| `github_list_prs` | GitHub | Open/merged pull requests |
| `github_get_diff` | GitHub | Changed files/patch for risk analysis |
| `jira_create_issue` | Jira | Create bug/task with summary, description, labels |
| `jira_list_issues` | Jira | Answer "what's open?" style questions |
| `netlify_trigger_deploy` | Netlify | Fire the demo site's build hook |
| `netlify_get_deploy_status` | Netlify | Poll deploy state until ready |
| `notion_create_page` | Notion | Release report page (summary, changes, risks, tickets, deploy link) |

The names above are descriptive; the actual **canonical IDs** come from
`swytchcode search` / `get` / `info` during the integration spike and are
enabled in `tooling.json` via `swytchcode add method` (Golden Path — no
invented IDs, no hand-written schemas). Enable only the ~8 methods the agent
needs across GitHub, Jira, Netlify, and Notion.

## Agent behavior (system prompt outline)

- Persona: "Release Copilot", a careful DevOps engineer.
- On a push event or "prepare a release": fetch commits + diff → summarize
  changes → flag risks (TODO/FIXME markers, auth/payment/config file touches,
  large diffs) → create one Jira issue per material risk (cap 3) → trigger
  Netlify deploy → poll status to completion → write Notion release report →
  reply in chat with a linked summary.
- On conversational questions: use read-only tools; never deploy or create
  issues unless asked or handling a push event.
- On tool failure: state what failed, continue with the remaining steps when
  sensible, never fabricate results.

## Demo assets (seeded before the demo)

1. **Target repo = the agent's own public GitHub repo** ("it manages its own
   release"). Seed 3–4 commits containing a real `TODO` and a risky-looking
   change (e.g. touching `auth.ts`), so analysis finds something genuine.
2. **Netlify demo site:** separate tiny static repo (`release-copilot-status`),
   connected to Netlify with a build hook; builds in ~20s so the deploy
   completes *during* the demo.
3. **Jira:** free Jira Cloud site with one project (key `REL`).
4. **Notion:** free workspace, one "Release Reports" parent page shared with the
   integration token.

## Demo script (2.5 min)

1. (0:00) One sentence: "Release Copilot — a DevOps agent where every API call
   goes through Swytchcode."
2. (0:15) Click **Simulate push event**. Narrate the activity feed as cards
   appear: commits fetched → risks found → 2 Jira issues → deploy triggered →
   Notion report.
3. (1:30) Open the created Jira issue and Notion page via feed links; show the
   Netlify deploy finishing.
4. (2:00) Live chat: "what's still open in Jira?" — agent answers with real data.

## Error handling

- Tool wrapper always returns `{ ok, data | error }`; never throws into the loop.
- Feed shows failures in red; agent narrates and continues where sensible.
- Groq rate-limit: exponential backoff ×2, then fallback model.
- Global route-level catch → graceful chat message; the UI never blanks.

## Out of scope (deliberate)

No database, no auth/multi-user, no real GitHub webhooks or tunnels, no
multi-agent orchestration, no tests beyond a smoke run of the hero flow, no
mobile layout.

## Time budget (real build window ≈ 4.5h: 10:15 AM–12:50 PM and 1:40–3:30 PM)

| Slot | Work |
| --- | --- |
| 9:00–10:15 (registration/opening downtime) | Jira/Netlify/Notion free accounts, Notion integration token, Netlify build hook, repo scaffold pushed to GitHub |
| 10:15–11:15 | Swytchcode integration spike: prove one real call per service through the wrapper |
| 11:15–12:50 | Agent loop, tool registry, SSE streaming |
| 1:00–1:40 (lunch) | Claude drafts README + architecture diagram while participant eats |
| 1:40–2:40 | Dashboard UI (chat + activity feed + simulate button) |
| 2:40–3:10 | Seed risky commits, demo site check, full rehearsal ×2 |
| 3:10–3:30 | Finalize README/diagram, Commudle submission, LinkedIn/X post |

## Submission checklist (from participant guide)

- [ ] Public GitHub repository
- [ ] README documentation
- [ ] Architecture diagram
- [ ] Demo video (optional — record a rehearsal run if time allows)
- [ ] LinkedIn or X post mentioning Swytchcode and KNOTiC
- [ ] Commudle submission before 3:30 PM
