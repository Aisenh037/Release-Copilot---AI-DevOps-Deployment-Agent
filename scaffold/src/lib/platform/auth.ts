// Server-only. The whole Phase C token-vault seam lives here: Phase C calls
// setAuthResolver(vaultResolver) at bootstrap (the vault resolver reads
// ctx.connection), and the kernel never changes.
import type { AuthResolver, ExecutionContext, ProviderDefinition } from "./types";

export const envAuthResolver: AuthResolver = async (provider) => {
  const a = provider.auth;
  if (a.style === "none") return { kind: "none" };
  if (a.style === "bearer") {
    const token = process.env[a.tokenEnv];
    return token
      ? { kind: "bearer", token }
      : { kind: "missing", message: `${a.tokenEnv} is not set` };
  }
  const username = process.env[a.usernameEnv];
  const password = process.env[a.passwordEnv];
  return username && password
    ? { kind: "basic", username, password }
    : { kind: "missing", message: `${a.usernameEnv} or ${a.passwordEnv} is not set` };
};

let active: AuthResolver = envAuthResolver;

export function setAuthResolver(resolver: AuthResolver): void {
  active = resolver;
}

export function resolveAuth(provider: ProviderDefinition, ctx: ExecutionContext) {
  return active(provider, ctx);
}
