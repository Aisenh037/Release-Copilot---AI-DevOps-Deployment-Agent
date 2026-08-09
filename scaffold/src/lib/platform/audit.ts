// Server-only. Audit must never break execution — every sink failure is swallowed.
import { appendFileSync } from "node:fs";
import type { AuditSink } from "./types";

export const defaultAuditSink: AuditSink = (event) => {
  const line = JSON.stringify(event);
  console.log(line);
  const file = process.env.AUDIT_LOG_FILE;
  if (file) {
    try {
      appendFileSync(file, line + "\n");
    } catch {
      // best-effort file audit; console line above already emitted
    }
  }
};
