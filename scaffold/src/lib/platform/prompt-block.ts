// Pure: generated prompt content. TOOL_GUIDANCE is derived from the registry at
// module load, so the intent->tool table can never drift from the actual tool set.
import { operations, toolNameFor } from "./registry";

export const TOOL_USE_INSTRUCTIONS =
  "The tools available to you represent real actions on connected services " +
  "(creating issues, triggering deploys, publishing pages). When the user's request " +
  "or an incoming event calls for one of these actions, call the matching tool " +
  "directly and let it run — do not just describe what you would do, and do not ask " +
  "for confirmation when the request is already unambiguous. This applies only to " +
  "these tools.";

export const TOOL_GUIDANCE = [
  "Tool guidance - map intent to the exact tool name to call (every tool name below",
  "has dots replaced with underscores, since that's how it's exposed to you):",
  ...operations.map(
    (op) => `- ${op.intent} -> ${toolNameFor(op.id)}${op.argHint ? `. ${op.argHint}` : ""}`
  ),
].join("\n");
