"use client";
import { useCallback, useRef, useState } from "react";
import type { AgentEvent } from "./events";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type FeedItem = { id: string; tool: string; args: unknown; status: "running" | "ok" | "failed"; result?: unknown };

export function useAgentStream() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const history = useRef<ChatMsg[]>([]);

  const send = useCallback(async (content: string) => {
    if (busy) return;
    setBusy(true);
    history.current = [...history.current, { role: "user", content }];
    setMessages([...history.current, { role: "assistant", content: "" }]);
    let assistant = "";
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.current }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as AgentEvent;
          if (evt.type === "text") {
            assistant += evt.delta;
            setMessages([...history.current, { role: "assistant", content: assistant }]);
          } else if (evt.type === "tool-call") {
            setFeed((f) => [...f, { id: evt.id, tool: evt.tool, args: evt.args, status: "running" }]);
          } else if (evt.type === "tool-result") {
            setFeed((f) => f.map((it) => (it.id === evt.id ? { ...it, status: evt.ok ? "ok" : "failed", result: evt.result } : it)));
          } else if (evt.type === "error") {
            assistant += `\n⚠️ ${evt.message}`;
            setMessages([...history.current, { role: "assistant", content: assistant }]);
          }
        }
      }
    } finally {
      history.current = [...history.current, { role: "assistant", content: assistant }];
      setBusy(false);
    }
  }, [busy]);

  return { messages, feed, busy, send };
}
