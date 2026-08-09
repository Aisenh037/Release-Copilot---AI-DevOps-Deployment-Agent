// Server-only: emits the Vercel AI SDK tool set from the registry, with execution
// delegated to the kernel. The per-request ctx parameter is the second half of the
// Phase C seam — the workspace-scoped route will build tools with the session's
// ConnectionRef instead of using the cached env-auth set.
import { tool, jsonSchema } from "ai";
import type { ExecutionContext } from "./types";
import { operations, toolNameFor, resolveCanonicalId } from "./registry";
import { executeOperation } from "./kernel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the ai SDK's own
// ToolSet type is a loosely-typed Record<string, Tool<any, any>>; with jsonSchema()
// input schemas the arg type is unknown at compile time by design.
type ToolSet = Record<string, any>;

export function buildTools(ctx?: ExecutionContext): ToolSet {
  const tools: ToolSet = {};
  for (const op of operations) {
    tools[toolNameFor(op.id)] = tool({
      description: op.description + (op.argHint ? `\n${op.argHint}` : ""),
      inputSchema: jsonSchema(op.input.schema),
      execute: async (args: unknown) =>
        executeOperation(op.id, (args ?? {}) as Record<string, unknown>, ctx),
    });
  }
  return tools;
}

let toolsPromise: Promise<ToolSet> | null = null;

/** Cached per server process — same call signature the agent route always used. */
export function getTools(): Promise<ToolSet> {
  toolsPromise ??= Promise.resolve(buildTools());
  return toolsPromise;
}

export { resolveCanonicalId, toolNameFor };
