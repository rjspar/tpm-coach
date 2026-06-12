import { isAuthenticated } from "@/app/lib/auth";
import { isLang } from "@/app/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spraak-naar-tekst via ElevenLabs Scribe. De client neemt audio op en stuurt
 * die als multipart "file"; wij sturen het door naar ElevenLabs (key blijft
 * server-side) en geven de tekst terug.
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("Transcriptie niet geconfigureerd.", { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Ongeldige upload.", { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return new Response("Geen audio ontvangen.", { status: 400 });
  }

  const langRaw = form.get("lang");
  const lang = typeof langRaw === "string" && isLang(langRaw) ? langRaw : null;

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, "audio");
  upstreamForm.append("model_id", "scribe_v1");
  if (lang) upstreamForm.append("language_code", lang);

  const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: upstreamForm,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`Scribe-fout: ${detail.slice(0, 200)}`, { status: 502 });
  }

  const data = (await upstream.json()) as { text?: string };
  return Response.json(
    { text: (data.text ?? "").trim() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
