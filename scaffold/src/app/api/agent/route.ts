import { streamText, stepCountIs } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { getTools, resolveCanonicalId } from "@/lib/swytchcode";
import { systemPrompt } from "@/lib/prompt";
import { partToEvent } from "@/lib/events";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
  const tools = await getTools();
  const encoder = new TextEncoder();

  const run = (modelId: string) =>
    streamText({
      model: groq(modelId),
      system: systemPrompt(),
      messages,
      tools,
      stopWhen: stepCountIs(12),
    });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: object) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const models = [
        process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        process.env.GROQ_FALLBACK_MODEL ?? "openai/gpt-oss-120b",
      ];
      for (let i = 0; i < models.length; i++) {
        try {
          let emitted = false;
          for await (const part of run(models[i]).fullStream) {
            const evt = partToEvent(part as never, resolveCanonicalId);
            if (evt?.type === "error" && !emitted && i < models.length - 1) throw new Error(evt.message);
            if (evt) {
              send(evt);
              if (evt.type !== "error") emitted = true;
            }
          }
          break; // finished cleanly
        } catch (err) {
          if (i === models.length - 1) send({ type: "error", message: String(err) });
          else send({ type: "text", delta: `\n(Retrying with fallback model…)\n` });
        }
      }
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
