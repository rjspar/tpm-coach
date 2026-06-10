import { isAuthenticated } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy naar ElevenLabs text-to-speech. De API-key en voice-id blijven
 * server-side. De coach-tekst gaat erin, mp3-audio komt eruit.
 *
 * Statuscodes voor de client:
 *  401 — niet ingelogd
 *  503 — stem niet geconfigureerd (key/voice ontbreekt) → client zet geluid uit
 *  502 — ElevenLabs gaf een fout
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return new Response("Stem niet geconfigureerd.", { status: 503 });
  }

  let body: { text?: string };
  try {
    body = (await request.json()) as { text?: string };
  } catch {
    return new Response("Ongeldige JSON.", { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) {
    return new Response("Geen tekst.", { status: 400 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        // Meertalig model — nodig voor Nederlands.
        model_id: "eleven_multilingual_v2",
        // Iets hogere stability → consistentere, rustigere voordracht;
        // similarity_boost houdt de eigen stem herkenbaar.
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.8,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`ElevenLabs-fout: ${detail.slice(0, 200)}`, {
      status: 502,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
