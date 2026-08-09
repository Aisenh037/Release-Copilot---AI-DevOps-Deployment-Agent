"use client";
import { Chat } from "@/components/Chat";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useAgentStream } from "@/lib/useAgentStream";
import { SIMULATED_PUSH } from "@/lib/simulatedPush";

export default function Home() {
  const { messages, feed, busy, send } = useAgentStream();
  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Samvaya — Release Copilot</h1>
          <p className="text-sm text-zinc-500">AI DevOps agent — GitHub, Jira, Netlify, Notion</p>
        </div>
        <button
          onClick={() => send(SIMULATED_PUSH)} disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          ⚡ Simulate push event
        </button>
      </header>
      <div className="grid h-[calc(100vh-7rem)] grid-cols-2 gap-4">
        <Chat messages={messages} busy={busy} send={send} />
        <ActivityFeed feed={feed} />
      </div>
    </main>
  );
}
