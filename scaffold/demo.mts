// Terminal demo runner — same agent loop as /api/agent, no Next.js required.
// Run from scaffold/:  npm run demo [-- "prompt"]
// With no prompt argument, runs the simulated GitHub push event (full release flow).
// PLATFORM_DRY_RUN=1 previews every request without touching the network.
import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getTools, resolveCanonicalId } from "./src/lib/platform";
import { systemPrompt } from "./src/lib/prompt";
import { SIMULATED_PUSH } from "./src/lib/simulatedPush";
import { partToEvent } from "./src/lib/events";

const prompt = process.argv.slice(2).join(" ").trim() || SIMULATED_PUSH;
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const tools = await getTools();

console.log("── Release Copilot (terminal) ──");
console.log(`prompt: ${prompt.split("\n")[0]}${prompt.includes("\n") ? " …" : ""}\n`);

const models = [
  process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  process.env.GEMINI_FALLBACK_MODEL ?? "gemini-flash-lite-latest",
];

for (let i = 0; i < models.length; i++) {
  try {
    const result = streamText({
      model: google(models[i]),
      system: systemPrompt(),
      messages: [{ role: "user", content: prompt }],
      tools,
      stopWhen: stepCountIs(12),
      // Free-tier per-minute quotas: default 2 retries give up before the window
      // rolls over, killing multi-step runs mid-pipeline (same as route.ts).
      maxRetries: 5,
    });
    for await (const part of result.fullStream) {
      const evt = partToEvent(part as never);
      if (!evt) continue;
      if (evt.type === "text") process.stdout.write(evt.delta);
      else if (evt.type === "tool-call")
        console.log(`\n▶ ${resolveCanonicalId(evt.tool)} ${JSON.stringify(evt.args ?? {}).slice(0, 120)}`);
      else if (evt.type === "tool-result")
        console.log(`${evt.ok ? "✔" : "✘"} ${resolveCanonicalId(evt.tool)}`);
      else if (evt.type === "error") console.error(`\n⚠ ${evt.message}`);
    }
    console.log("\n── done ──");
    break;
  } catch (err) {
    if (i === models.length - 1) throw err;
    console.error(`\n(model ${models[i]} failed: ${String(err).slice(0, 120)} — retrying with ${models[i + 1]})`);
  }
}
