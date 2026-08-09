// Terminal demo runner — same agent loop as /api/agent, no Next.js required.
// Run from scaffold/:  node --env-file=.env node_modules/tsx/dist/cli.mjs demo.mts [prompt]
// With no prompt argument, runs the simulated GitHub push event (full release flow).
import { streamText, stepCountIs } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { getTools, resolveCanonicalId } from "./src/lib/swytchcode";
import { systemPrompt } from "./src/lib/prompt";
import { SIMULATED_PUSH } from "./src/lib/simulatedPush";
import { partToEvent } from "./src/lib/events";

const prompt = process.argv.slice(2).join(" ").trim() || SIMULATED_PUSH;
const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
const tools = await getTools();

console.log("── Release Copilot (terminal) ──");
console.log(`prompt: ${prompt.split("\n")[0]}${prompt.includes("\n") ? " …" : ""}\n`);

const models = [
  process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  process.env.GROQ_FALLBACK_MODEL ?? "openai/gpt-oss-120b",
];

for (let i = 0; i < models.length; i++) {
  try {
    const result = streamText({
      model: groq(models[i]),
      system: systemPrompt(),
      messages: [{ role: "user", content: prompt }],
      tools,
      stopWhen: stepCountIs(12),
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
