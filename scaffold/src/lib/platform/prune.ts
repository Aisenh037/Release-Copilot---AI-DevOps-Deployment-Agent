/**
 * Raw provider responses (GitHub especially) are enormous — a single commit-list
 * result is ~70KB of JSON, mostly api.github.com hypermedia links. Every tool result
 * is resent to the model on each subsequent step, so without pruning the conversation
 * blows past small per-minute token windows by step 3. Drop API plumbing, cap list
 * sizes, and truncate huge strings (diffs/patches); keep human-facing fields
 * (html_url, Jira keys, Netlify URLs) so the activity feed's deep links and the
 * model's report content still work.
 */
const MAX_ARRAY_ITEMS = 15;
const MAX_STRING_CHARS = 1500;
const MAX_RESULT_CHARS = 24000;

export function pruneNode(v: unknown): unknown {
  if (Array.isArray(v)) {
    const kept = v.slice(0, MAX_ARRAY_ITEMS).map(pruneNode);
    if (v.length > MAX_ARRAY_ITEMS) kept.push(`…[${v.length - MAX_ARRAY_ITEMS} more items omitted]`);
    return kept;
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "node_id" || k === "gravatar_id" || k === "avatar_url") continue;
      if (typeof val === "string" && val.startsWith("https://api.github.com")) continue;
      out[k] = pruneNode(val);
    }
    return out;
  }
  if (typeof v === "string" && v.length > MAX_STRING_CHARS) {
    return v.slice(0, MAX_STRING_CHARS) + `…[truncated ${v.length - MAX_STRING_CHARS} chars]`;
  }
  return v;
}

export function pruneResult(result: unknown): unknown {
  const pruned = pruneNode(result);
  const s = JSON.stringify(pruned);
  if (s.length <= MAX_RESULT_CHARS) return pruned;
  return { note: "result truncated to fit model context", preview: s.slice(0, MAX_RESULT_CHARS) };
}

/**
 * Models sometimes emit nested tool args as JSON-encoded *strings* instead of
 * objects (observed with Gemini: body.fields arrived as "{\"project\":...}") — the
 * provider then receives a string where the API expects an object and 400s.
 * Recursively parse any string value that is itself a complete JSON object/array.
 */
export function unwrapJsonStrings(v: unknown): unknown {
  if (typeof v === "string") {
    const s = v.trim();
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try {
        return unwrapJsonStrings(JSON.parse(s));
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(unwrapJsonStrings);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = unwrapJsonStrings(val);
    return out;
  }
  return v;
}
