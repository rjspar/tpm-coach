"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KICKOFF,
  WELCOME,
  type ChatMessage,
  type Lang,
} from "@/app/lib/coach";
import { setLangCookie, UI } from "@/app/lib/i18n";
import ReportDocument from "./report-document";
import { downloadNodeAsPdf } from "./report";
import { useSpeechRecognition } from "./use-speech-recognition";

type StreamError = "expired" | "unreachable";

// Stil WAV-fragment om het audio-element te "ontgrendelen" bij een
// gebruikersgebaar, zodat het daarna ook later programmatisch mag spelen
// (anders blokkeert de browser de stem bij vervolgantwoorden).
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

async function streamResponse(
  body: object,
  onDelta: (full: string) => void,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const code: StreamError = res.status === 401 ? "expired" : "unreachable";
    throw new Error(code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    onDelta(acc);
  }
  return acc;
}

// Faseherkenning werkt in beide talen.
function detectPhasesComplete(messages: ChatMessage[]): boolean {
  const text = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n")
    .toLowerCase();

  const phase1 = /aspiratie|aspiration|fase\s*1|phase\s*1/.test(text);
  const phase2 = /patron|pattern|gedrag|behav|fase\s*2|phase\s*2/.test(text);
  const phase3 =
    /nieuwe richting|new direction|fase\s*3|phase\s*3|waarden|values/.test(
      text,
    );
  return phase1 && phase2 && phase3;
}

export default function Coach({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = UI[lang];

  const [messages, setMessages] = useState<ChatMessage[]>([
    KICKOFF[initialLang],
    WELCOME[initialLang],
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Spraak terug (ElevenLabs)
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const voiceOnRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const reportRef = useRef<HTMLDivElement>(null);
  const pendingPdfRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Spraak naar tekst (mic-knop)
  const appendTranscript = useCallback(
    (text: string) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
    [],
  );
  const {
    supported: micSupported,
    listening,
    toggle: toggleMic,
    pauseListening,
    resumeListening,
  } = useSpeechRecognition(appendTranscript);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  // Eén vast, herbruikbaar audio-element.
  const getAudioEl = useCallback(() => {
    if (!audioElRef.current) audioElRef.current = new Audio();
    return audioElRef.current;
  }, []);

  // Ontgrendel het element binnen een gebruikersgebaar (klik/Enter), zodat het
  // ook later (na het streamen) mag afspelen. Eénmalig nodig.
  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    const el = getAudioEl();
    try {
      el.muted = true;
      el.src = SILENT_WAV;
      const p = el.play();
      if (p) {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          unlockedRef.current = true;
        }).catch(() => {
          el.muted = false;
        });
      }
    } catch {
      el.muted = false;
    }
  }, [getAudioEl]);

  const stopAudio = useCallback(() => {
    if (audioElRef.current) audioElRef.current.pause();
  }, []);

  const clearAudioCache = useCallback(() => {
    for (const url of audioCacheRef.current.values()) URL.revokeObjectURL(url);
    audioCacheRef.current.clear();
  }, []);

  const playUrl = useCallback(
    async (url: string) => {
      const el = getAudioEl();
      el.pause();
      el.muted = false;
      el.src = url;
      el.currentTime = 0;
      unlockedRef.current = true;
      // Mic even pauzeren tijdens het voorlezen (geen echo), daarna hervatten.
      pauseListening();
      el.onended = () => resumeListening();
      await el.play();
    },
    [getAudioEl, pauseListening, resumeListening],
  );

  const speak = useCallback(
    async (text: string) => {
      stopAudio();
      const cached = audioCacheRef.current.get(text);
      if (cached) {
        try {
          await playUrl(cached);
        } catch {
          /* afspelen kan falen vóór een klik — negeren */
        }
        return;
      }
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.status === 503) {
          setVoiceUnavailable(true);
          setVoiceOn(false);
          return;
        }
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioCacheRef.current.set(text, url);
        await playUrl(url);
      } catch {
        // Geluid is optioneel — stil falen.
      }
    },
    [stopAudio, playUrl],
  );

  function describeError(err: unknown, fallback: string): string {
    const code = err instanceof Error ? err.message : "";
    if (code === "expired") return t.errSessionExpired;
    if (code === "unreachable") return t.errCoachUnavailable;
    return fallback;
  }

  async function runAssistant(history: ChatMessage[]) {
    setError(null);
    setIsStreaming(true);
    stopAudio();
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      const full = await streamResponse({ messages: history, lang }, (acc) => {
        setMessages([...history, { role: "assistant", content: acc }]);
      });
      setMessages([...history, { role: "assistant", content: full }]);
      if (voiceOnRef.current && full.trim()) void speak(full);
    } catch (err) {
      setMessages(history);
      setError(describeError(err, t.errGeneric));
    } finally {
      setIsStreaming(false);
    }
  }

  // Autoscroll bij nieuwe inhoud.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Zodra het rapport gerenderd is, leg het vast als PDF.
  useEffect(() => {
    if (!report || !pendingPdfRef.current) return;
    pendingPdfRef.current = false;
    (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        await new Promise((r) => setTimeout(r, 150));
        if (reportRef.current) {
          await downloadNodeAsPdf(reportRef.current, t.reportFilename);
        }
      } catch {
        setError(t.errDownloadFailed);
      } finally {
        setIsGeneratingReport(false);
      }
    })();
  }, [report, t.reportFilename, t.errDownloadFailed]);

  function resetSession(toLang: Lang) {
    stopAudio();
    clearAudioCache();
    setMessages([KICKOFF[toLang], WELCOME[toLang]]);
    setInput("");
    setReport("");
    setError(null);
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    // Binnen het klik/Enter-gebaar het audio-element ontgrendelen, zodat het
    // antwoord straks (na het streamen) ook echt mag worden voorgelezen.
    if (voiceOn) unlockAudio();
    stopAudio();
    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setInput("");
    void runAssistant(history);
  }

  async function handleReport() {
    if (isGeneratingReport || isStreaming) return;
    setIsGeneratingReport(true);
    setError(null);
    try {
      const text = await streamResponse(
        { messages, generateReport: true, lang },
        () => {},
      );
      pendingPdfRef.current = true;
      setReport(text);
    } catch (err) {
      setIsGeneratingReport(false);
      setError(describeError(err, t.errReportFailed));
    }
  }

  function toggleVoice() {
    if (voiceOn) {
      setVoiceOn(false);
      stopAudio();
      return;
    }
    setVoiceOn(true);
    const last = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim());
    if (last) void speak(last.content);
  }

  function handleNewSession() {
    if (isStreaming || isGeneratingReport) return;
    if (!window.confirm(t.newSessionConfirm)) return;
    resetSession(lang);
  }

  function switchLang(next: Lang) {
    if (next === lang || isStreaming || isGeneratingReport) return;
    // Met een lopend gesprek eerst bevestigen — taal mengen geeft een rommelig rapport.
    const started = messages.length > 2;
    if (started && !window.confirm(t.switchLangConfirm)) return;
    setLang(next);
    setLangCookie(next);
    resetSession(next);
  }

  // Kickoff (index 0) verbergen we; toon de rest van het gesprek.
  const visible = messages.filter((_, i) => i !== 0);
  const phasesComplete = detectPhasesComplete(messages);

  return (
    <div className="flex min-h-dvh flex-col bg-mint">
      {/* Header */}
      <header className="relative flex items-center justify-center border-b border-sand/60 bg-mint/80 px-3 py-5 backdrop-blur sm:px-6">
        <button
          onClick={handleNewSession}
          disabled={isStreaming || isGeneratingReport}
          className="absolute left-3 rounded-full bg-white px-3 py-2 text-xs font-medium text-forest/80 transition hover:text-forest disabled:opacity-50 sm:left-4 sm:text-sm"
        >
          {t.newSession}
        </button>

        <Image
          src="/logo_Walk_Your_Talk_transparant.png"
          alt="Walk Your Talk"
          width={160}
          height={64}
          priority
          className="h-auto w-24 sm:w-36"
        />

        <div className="absolute right-3 flex items-center gap-2 sm:right-4">
          <LangToggle lang={lang} onChange={switchLang} />
          <button
            onClick={toggleVoice}
            title={voiceOn ? t.voiceOnLabel : t.voiceOffLabel}
            aria-label={voiceOn ? t.voiceOnLabel : t.voiceOffLabel}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition sm:text-sm ${
              voiceOn
                ? "bg-amber text-forest"
                : "bg-white text-forest/80 hover:text-forest"
            }`}
          >
            <SpeakerIcon on={voiceOn} />
            <span className="hidden md:inline">
              {voiceOn ? t.voiceOnLabel : t.voiceOffLabel}
            </span>
          </button>
        </div>
      </header>

      {/* Berichten */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          {visible.map((m, i) => (
            <Bubble
              key={i}
              role={m.role}
              content={m.content}
              welcome={i === 0 && m.role === "assistant"}
            />
          ))}

          {isStreaming &&
            visible[visible.length - 1]?.content === "" && <TypingBubble />}

          {error && (
            <p className="self-center rounded-lg bg-amber/20 px-4 py-2 text-sm text-forest">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Onderbalk */}
      <div className="border-t border-sand/60 bg-mint/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[720px] flex-col gap-3">
          {phasesComplete && (
            <button
              onClick={handleReport}
              disabled={isGeneratingReport || isStreaming}
              className="self-center rounded-xl bg-amber px-6 py-2.5 text-sm font-semibold text-forest shadow-sm transition hover:brightness-105 disabled:opacity-60"
            >
              {isGeneratingReport ? t.generatingReport : t.downloadReport}
            </button>
          )}

          <div className="flex items-end gap-2">
            {micSupported && (
              <button
                onClick={toggleMic}
                disabled={isStreaming}
                title={listening ? t.micStop : t.micStart}
                aria-label={listening ? t.micStop : t.micStart}
                className={`shrink-0 rounded-xl px-3 py-3 transition disabled:opacity-50 ${
                  listening
                    ? "animate-pulse bg-amber text-forest"
                    : "bg-white text-forest/70 hover:text-forest"
                }`}
              >
                <MicIcon />
              </button>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={listening ? t.inputListening : t.inputPlaceholder}
              disabled={isStreaming}
              className="max-h-40 min-h-[48px] flex-1 resize-none rounded-xl border border-sand bg-white px-4 py-3 text-ink outline-none transition focus:border-forest focus:ring-2 focus:ring-forest/20 disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              className="rounded-xl bg-forest px-5 py-3 font-medium text-white transition hover:bg-amber hover:text-forest disabled:opacity-50"
            >
              {t.send}
            </button>
          </div>

          <p className="text-center text-xs text-ink/40">
            {t.whisperBefore}
            <a
              href="https://wisprflow.ai"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-sage/60 underline-offset-2 hover:text-ink/70"
            >
              Whisper&nbsp;Flow
            </a>
            {t.whisperAfter}
          </p>

          {voiceUnavailable && (
            <p className="text-center text-xs text-amber">{t.voiceUnavailable}</p>
          )}
        </div>
      </div>

      {/* Offscreen rapport voor PDF-export */}
      {report && (
        <ReportDocument ref={reportRef} report={report} title={t.reportTitle} />
      )}
    </div>
  );
}

function LangToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
}) {
  const langs: Lang[] = ["nl", "en"];
  return (
    <div className="flex overflow-hidden rounded-full border border-sand bg-white text-xs font-semibold">
      {langs.map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          aria-pressed={l === lang}
          className={`px-2.5 py-1.5 transition ${
            l === lang ? "bg-forest text-white" : "text-forest/60 hover:text-forest"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Bubble({
  role,
  content,
  welcome = false,
}: {
  role: ChatMessage["role"];
  content: string;
  welcome?: boolean;
}) {
  if (role === "user") {
    return (
      <div className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-forest px-4 py-3 text-white">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {content}
        </p>
      </div>
    );
  }
  return (
    <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm shadow-forest/5">
      <p
        className={
          welcome
            ? "whitespace-pre-wrap font-display text-xl leading-relaxed text-forest"
            : "whitespace-pre-wrap text-base leading-relaxed text-ink"
        }
      >
        {content}
      </p>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="self-start rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm shadow-forest/5">
      <span className="inline-flex gap-1">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-sage"
      style={{ animationDelay: delay }}
    />
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {on ? (
        <path
          d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M17 9.5l4 5M21 9.5l-4 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}
