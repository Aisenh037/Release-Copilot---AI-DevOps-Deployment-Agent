"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "@/lib/useAgentStream";

export function Chat({ messages, busy, send }: { messages: ChatMsg[]; busy: boolean; send: (t: string) => void }) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <section className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
              m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
              {m.content || "…"}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-zinc-200 dark:border-zinc-800 p-3"
        onSubmit={(e) => { e.preventDefault(); if (input.trim()) { send(input.trim()); setInput(""); } }}
      >
        <input
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none"
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder='Try "prepare a release" or "what shipped today?"' disabled={busy}
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy}>
          Send
        </button>
      </form>
    </section>
  );
}
