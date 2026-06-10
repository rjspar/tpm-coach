import Anthropic from "@anthropic-ai/sdk";
import { isAuthenticated } from "@/app/lib/auth";
import {
  COACH_MODEL,
  isLang,
  REPORT_INSTRUCTIONS,
  SYSTEM_PROMPTS,
  type ChatMessage,
  type Lang,
} from "@/app/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  messages: ChatMessage[];
  generateReport?: boolean;
  lang?: Lang;
};

function isValidMessage(m: unknown): m is ChatMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ((m as ChatMessage).role === "user" ||
      (m as ChatMessage).role === "assistant") &&
    typeof (m as ChatMessage).content === "string"
  );
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Server is niet geconfigureerd (ANTHROPIC_API_KEY).", {
      status: 500,
    });
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response("Ongeldige JSON.", { status: 400 });
  }

  if (!Array.isArray(body.messages) || !body.messages.every(isValidMessage)) {
    return new Response("Ongeldige gespreksgeschiedenis.", { status: 400 });
  }

  const lang: Lang = isLang(body.lang) ? body.lang : "nl";

  const messages: ChatMessage[] = [...body.messages];
  if (body.generateReport) {
    messages.push({ role: "user", content: REPORT_INSTRUCTIONS[lang] });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const llmStream = client.messages.stream({
          model: COACH_MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPTS[lang],
          messages,
        });

        for await (const event of llmStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Onbekende fout bij de coach.";
        controller.enqueue(encoder.encode(`\n\n[Er ging iets mis: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
