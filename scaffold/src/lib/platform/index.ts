// Samvaya platform — public server-side surface.
// Client components must import from "./artifacts" directly (this index pulls in
// the server-only kernel via tools.ts).
export { getTools, buildTools, resolveCanonicalId, toolNameFor } from "./tools";
export { executeOperation } from "./kernel";
export { setAuthResolver, envAuthResolver } from "./auth";
export { TOOL_USE_INSTRUCTIONS, TOOL_GUIDANCE } from "./prompt-block";
export { providers, operations } from "./registry";
export type {
  AuthConfig,
  AuthCredential,
  AuthResolver,
  ConnectionRef,
  ExecutionContext,
  ExecutionPolicy,
  OperationDefinition,
  OperationResult,
  ProviderDefinition,
} from "./types";
