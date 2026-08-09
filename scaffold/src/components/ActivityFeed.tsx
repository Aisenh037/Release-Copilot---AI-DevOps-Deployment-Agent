"use client";
import type { FeedItem } from "@/lib/useAgentStream";

function artifactLink(item: FeedItem): string | null {
  const r = item.result;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  for (const k of ["html_url", "deploy_ssl_url", "url"]) if (typeof o[k] === "string") return o[k] as string;
  if (typeof o.key === "string" && process.env.NEXT_PUBLIC_JIRA_SITE)
    return `${process.env.NEXT_PUBLIC_JIRA_SITE}/browse/${o.key}`;
  return null;
}

const DOT = { running: "bg-amber-400 animate-pulse", ok: "bg-emerald-500", failed: "bg-red-500" } as const;

export function ActivityFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <section className="overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Swytchcode activity</h2>
      {feed.length === 0 && <p className="text-sm text-zinc-500">Tool calls appear here as the agent works.</p>}
      {feed.map((item) => {
        const link = artifactLink(item);
        return (
          <div key={item.id} className={`rounded-lg border p-3 text-sm ${item.status === "failed" ? "border-red-400" : "border-zinc-200 dark:border-zinc-800"}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT[item.status]}`} />
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs font-medium">
                {item.tool.split(/[._]/)[0]}
              </span>
              <span className="font-mono text-xs">{item.tool}</span>
              {link && <a href={link} target="_blank" className="ml-auto text-indigo-600 text-xs underline">Open ↗</a>}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-zinc-500">{JSON.stringify(item.args)?.slice(0, 120)}</p>
          </div>
        );
      })}
    </section>
  );
}
