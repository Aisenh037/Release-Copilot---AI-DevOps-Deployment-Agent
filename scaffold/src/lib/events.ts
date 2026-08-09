export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool-call"; id: string; tool: string; args: unknown }
  | { type: "tool-result"; id: string; tool: string; ok: boolean; result: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Maps a streamText().fullStream part to an AgentEvent. `resolveTool` is applied to
 * the tool name (default: identity) - route.ts passes swytchcode.ts's
 * resolveCanonicalId so the feed shows canonical IDs instead of sanitized names.
 *
 * Field-name defensiveness (part.text ?? part.textDelta, part.input ?? part.args,
 * part.output ?? part.result) covers older/newer `ai` majors per the task brief.
 * The installed `ai@7.0.58` was inspected directly (node_modules/ai/dist/index.d.ts)
 * to confirm the exact shapes used here: text-delta uses `text`; tool-call/tool-result
 * use `toolCallId`/`toolName`/`input`/`output`. One thing the brief's switch did NOT
 * cover: ai@7 reports a *failed* tool execution as its own `"tool-error"` part (with a
 * `toolCallId`/`toolName`/`input`/`error`), not a `"tool-result"` with an embedded
 * error field - without a case for it, a failed tool call would silently vanish
 * (`default: return null`) and its activity-feed card would be stuck on "running"
 * forever. Added below, mapped onto the same tool-result AgentEvent shape with
 * ok:false.
 */
export function partToEvent(
  part: Record<string, unknown> & { type: string },
  resolveTool: (name: string) => string = (name) => name
): AgentEvent | null {
  switch (part.type) {
    case "text-delta":
      return { type: "text", delta: String(part.text ?? part.textDelta ?? "") };
    case "tool-call":
      return {
        type: "tool-call",
        id: String(part.toolCallId),
        tool: resolveTool(String(part.toolName)),
        args: part.input ?? part.args,
      };
    case "tool-result": {
      const result = part.output ?? part.result;
      const ok = !(result && typeof result === "object" && "error" in (result as object));
      return {
        type: "tool-result",
        id: String(part.toolCallId),
        tool: resolveTool(String(part.toolName)),
        ok,
        result,
      };
    }
    case "tool-error":
      return {
        type: "tool-result",
        id: String(part.toolCallId),
        tool: resolveTool(String(part.toolName)),
        ok: false,
        result: part.error ?? part.result,
      };
    case "error":
      return { type: "error", message: String(part.error) };
    case "finish":
      return { type: "done" };
    default:
      return null;
  }
}
