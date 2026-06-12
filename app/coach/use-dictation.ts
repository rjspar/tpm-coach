"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/app/lib/coach";

function recorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && "MediaRecorder" in window;
}
const noopSubscribe = () => () => {};

function pickMimeType(): string {
  const types = ["audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

const SILENCE_MS = 1800; // stilte na spraak voordat we automatisch stoppen
const MAX_MS = 30000; // harde bovengrens per opname
const RMS_THRESHOLD = 0.025; // drempel voor "er wordt gesproken"

/**
 * Tik-om-te-praten via opname + ElevenLabs Scribe. Werkt cross-platform
 * (ook iOS Safari, waar de live browser-herkenning faalt). Eén tik start de
 * opname; die stopt automatisch bij stilte (of bij nog een tik), waarna de
 * tekst via /api/transcribe binnenkomt en in `onText` belandt.
 */
export function useDictation(onText: (text: string) => void, lang: Lang) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    recorderSupported,
    () => false,
  );

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const onTextRef = useRef(onText);
  const langRef = useRef(lang);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const cleanupMeter = useCallback(() => {
    if (meterTimer.current) {
      clearInterval(meterTimer.current);
      meterTimer.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop(); // triggert onstop
  }, []);

  const transcribe = useCallback(async (blob: Blob, ext: string) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("file", blob, `audio.${ext}`);
      form.append("lang", langRef.current);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) onTextRef.current(text);
      }
    } catch {
      /* transcriptie is optioneel — stil falen */
    } finally {
      setTranscribing(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return; // toestemming geweigerd
    }
    streamRef.current = stream;

    const mime = pickMimeType();
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      cleanupMeter();
      releaseStream();
      recorderRef.current = null;
      setRecording(false);
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const blob = new Blob(chunks, { type: mime || "audio/webm" });
      if (blob.size > 1500) void transcribe(blob, ext); // negeer piepkleine/lege opnames
    };

    recorderRef.current = rec;
    rec.start();
    setRecording(true);

    // Stilte-detectie → automatisch stoppen.
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        void ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);

        let hasSpoken = false;
        const startedAt = performance.now();
        let lastLoud = startedAt;

        meterTimer.current = setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const now = performance.now();
          if (rms > RMS_THRESHOLD) {
            hasSpoken = true;
            lastLoud = now;
          }
          if (now - startedAt > MAX_MS) stop();
          else if (hasSpoken && now - lastLoud > SILENCE_MS) stop();
        }, 150);
      }
    } catch {
      /* zonder stilte-detectie blijft tik-om-te-stoppen werken */
    }
  }, [cleanupMeter, releaseStream, transcribe, stop]);

  const toggle = useCallback(() => {
    if (recorderRef.current) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      cleanupMeter();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      releaseStream();
      recorderRef.current = null;
    };
  }, [cleanupMeter, releaseStream]);

  return { supported, recording, transcribing, toggle };
}
