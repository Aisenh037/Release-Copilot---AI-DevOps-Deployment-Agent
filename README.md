# Release Copilot — AI DevOps & Deployment Agent

> **Build with Swytchcode Buildathon 2026 · Track 3** — an AI agent that manages a software release end-to-end: it reads what changed on GitHub, flags risks, files Jira tickets, ships to Netlify, and publishes a release report to Notion — with external calls executed through **Swytchcode**.

<!-- screenshot added after rehearsal: docs/dashboard.png -->

## What it does

Click **⚡ Simulate push event** (or just ask it to "prepare a release") and the agent autonomously:

1. **Fetches recent commits and the diff** for the release repo (GitHub, via Swytchcode).
2. **Analyzes the changes and flags risks** — TODO/FIXME markers, auth/payment/config file touches, oversized diffs.
3. **Files one Jira issue per material risk** (max 3) in project `KAN` (Atlassian, via Swytchcode).
4. **Triggers a Netlify deploy** and checks its status (Netlify, via Swytchcode).
5. **Publishes a release report to Notion** — summary, risks, issue keys, deploy link.
6. **Reports back in chat** with links to everything it created.

The right-hand **activity feed** shows every tool call live as it happens — service, arguments, status, and a deep link to the artifact created. You can also just talk to it: *"what shipped today?"*, *"what's still open in Jira?"*.

## Architecture

```mermaid
flowchart LR
  U[User / Jury] -->|chat + simulate push| UI["Next.js dashboard<br/>chat + live activity feed"]
  UI -->|POST /api/agent<br/>NDJSON stream| Loop["streamText tool loop<br/>Groq · llama-3.3-70b"]
  Loop -->|"tools.get({tools: [canonical IDs]})"| SWX["Swytchcode runtime + CLI<br/>managed OAuth · policies · execution"]
  SWX --> GH[GitHub]
  SWX --> JR["Jira (Atlassian)"]
  SWX --> NL[Netlify]
  Loop -.->|REST fallback \(see note\)| NO[Notion]
  Loop -->|streamed events| UI
```

- **One agent loop** (Vercel AI SDK `streamText`, Groq `llama-3.3-70b-versatile`, automatic fallback model on rate limits, 12-step cap).
- **Tools come from Swytchcode's runtime** — `swx.tools.get({ tools: [...] })` returns schema-carrying tools whose `execute` callbacks run `swytchcode exec` with Swytchcode-managed OAuth credentials. No hand-written HTTP for any Swytchcode-served method.
- **NDJSON event stream** from the API route fans out to the chat panel and the activity feed from a single React hook.

## Swytchcode integration (the 30% criterion)

Every method was discovered, enabled, and contract-verified through Swytchcode's Golden Path (`search → get → add method → info`), never invented:

| Capability | Canonical ID | Verified |
|---|---|---|
| List commits | `github.commit.get.1` | ✅ live call, real data |
| List pull requests | `github.pull.get` | ✅ contract via `info` |
| Get diff (compare) | `github.compare.get` | ✅ contract via `info` |
| Create Jira issue | `atlassian.rest.issue.create` | ✅ dry-run (exact HTTP preview) |
| Search Jira (JQL) | `atlassian.rest.jql.create` | ✅ live call, HTTP 200 |
| Trigger Netlify build | `netlify.build.create` | ✅ dry-run (exact HTTP preview) |
| Netlify deploy status | `netlify.deploy.get.1` | ✅ contract via `info` |

All four providers use **Swytchcode managed OAuth** (`swytchcode auth connect`) — the app holds no provider tokens for Swytchcode-served calls.

> **The Notion exception (and the bug we reported):** every Notion *write* method in the Swytchcode registry currently fails to enable with a bundle defect — `resolve STRUCTs in RETURNS: struct "api.page.createResponse200" not found in STRUCTS` — reproduced across re-fetches and method variants, reported with reference ID **SWY-ERR-014934**. Per our agent contract's fallback rule (with explicit user approval), the single Notion append-report call is a clearly-isolated direct REST module ([scaffold/src/lib/notionFallback.ts](scaffold/src/lib/notionFallback.ts)), removable the moment the bundle is fixed. Everything else runs through Swytchcode.

## Run it

```bash
cd scaffold
npm install
cp ../.env.example .env      # fill in your values
# one-time, from repo root: swytchcode login && swytchcode auth connect <GitHub|Atlassian|Netlify|Notion>
npm run dev                  # from repo root: npm --prefix scaffold run dev
```

Open http://localhost:3000 — ask *"what shipped recently?"* or hit **Simulate push event**.

## Demo script (2.5 min)

1. *(0:00)* "Release Copilot — a DevOps agent where API calls run through Swytchcode."
2. *(0:15)* Click **Simulate push event**; narrate the activity feed: commits fetched → risks found → Jira issues created → deploy triggered → Notion report published.
3. *(1:30)* Open the created Jira issue and Notion page from the feed's deep links; show the Netlify deploy going live.
4. *(2:00)* Live question: *"what's still open in Jira?"* — answered from real data.

## Built at

**Build with Swytchcode** buildathon — Paytm Office, Noida — 9 August 2026, Track 3 (AI DevOps & Deployment Agent). Solo build in one day with [Claude Code](https://claude.com/claude-code).
